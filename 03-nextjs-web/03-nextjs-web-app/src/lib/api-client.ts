import { AppApiError, mapHttpErrorToAppError } from './errors';
import type {
  AuthSessionResponse,
  LoginRequest,
  RevokeSessionRequest,
  SignupRequest,
  UserSessionInfo,
  UserSummary,
} from '../types/auth';

export interface RequestOptions extends RequestInit {
  timeoutMs?: number;
  skipAuthRefresh?: boolean;
}

export class ApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.NEXT_PUBLIC_API_URL || '';
  }

  private generateId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  public async request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    const { timeoutMs = 15000, skipAuthRefresh = false, headers = {}, ...rest } = options;
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

    const requestId = this.generateId();
    const traceId = this.generateId();

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-request-id': requestId,
      'x-trace-id': traceId,
      ...(headers as Record<string, string>),
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...rest,
        headers: requestHeaders,
        credentials: 'include',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type');
      const isJson = contentType && contentType.includes('application/json');
      const payload = isJson ? await response.json().catch(() => ({})) : null;

      if (!response.ok) {
        // Automatic 1-shot refresh attempt for 401 Unauthorized (except on auth endpoints themselves)
        if (response.status === 401 && !skipAuthRefresh && !path.includes('/auth/login') && !path.includes('/auth/signup') && !path.includes('/auth/refresh')) {
          try {
            await this.refresh();
            // Retry original request once
            return await this.request<T>(path, { ...options, skipAuthRefresh: true });
          } catch {
            throw mapHttpErrorToAppError(response.status, payload);
          }
        }

        throw mapHttpErrorToAppError(response.status, payload);
      }

      // Handle envelope unwrap if backend returned data in a standardized envelope
      if (payload && typeof payload === 'object' && 'data' in payload && payload.data !== undefined) {
        return payload.data as T;
      }

      return payload as T;
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err instanceof AppApiError) {
        throw err;
      }
      if (err.name === 'AbortError') {
        throw new AppApiError({
          code: 'DEPENDENCY_UNAVAILABLE',
          message: 'Request timed out. Please check your network connection.',
          status: 408,
          requestId,
          traceId,
        });
      }
      throw new AppApiError({
        code: 'DEPENDENCY_UNAVAILABLE',
        message: err.message || 'Network error communicating with server.',
        status: 503,
        requestId,
        traceId,
      });
    }
  }

  // ==========================================
  // Auth API Endpoints (Reconciled with PHASE-06-API-CATALOG.md)
  // ==========================================

  public async signup(data: SignupRequest): Promise<AuthSessionResponse> {
    return this.request<AuthSessionResponse>('/api/v1/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data),
      skipAuthRefresh: true,
    });
  }

  public async login(data: LoginRequest): Promise<AuthSessionResponse> {
    return this.request<AuthSessionResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
      skipAuthRefresh: true,
    });
  }

  public async refresh(): Promise<AuthSessionResponse> {
    return this.request<AuthSessionResponse>('/api/v1/auth/refresh', {
      method: 'POST',
      skipAuthRefresh: true,
    });
  }

  public async logout(): Promise<{ status: string }> {
    return this.request<{ status: string }>('/api/v1/auth/logout', {
      method: 'POST',
      skipAuthRefresh: true,
    });
  }

  public async getMe(): Promise<UserSummary> {
    return this.request<UserSummary>('/api/v1/auth/me', {
      method: 'GET',
    });
  }

  public async getSessions(): Promise<UserSessionInfo[]> {
    return this.request<UserSessionInfo[]>('/api/v1/auth/sessions', {
      method: 'GET',
    });
  }

  public async revokeSession(sessionId: string): Promise<{ status: string }> {
    const body: RevokeSessionRequest = { session_id: sessionId };
    return this.request<{ status: string }>('/api/v1/auth/sessions/revoke', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  public async forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>('/api/v1/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
      skipAuthRefresh: true,
    });
  }

  public async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>('/api/v1/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
  }

  public async resetPassword(recoveryToken: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>('/api/v1/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ recovery_token: recoveryToken, new_password: newPassword }),
      skipAuthRefresh: true,
    });
  }

  // ==========================================
  // Phase 09-B Company & Organization Endpoints
  // ==========================================

  public async getMyCompany(): Promise<any> {
    return this.request<any>('/api/v1/companies/me/current', {
      method: 'GET',
    });
  }

  public async createCompany(data: { name: string; slug: string; email?: string; phone?: string; industry?: string; company_size?: string }): Promise<any> {
    return this.request<any>('/api/v1/companies', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async getCompany(companyId: string): Promise<any> {
    return this.request<any>(`/api/v1/companies/${companyId}`, {
      method: 'GET',
    });
  }

  public async updateCompany(companyId: string, data: any): Promise<any> {
    return this.request<any>(`/api/v1/companies/${companyId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  public async getBranches(companyId: string): Promise<any[]> {
    return this.request<any[]>(`/api/v1/companies/${companyId}/branches`, {
      method: 'GET',
    });
  }

  public async createBranch(companyId: string, data: { name: string; city: string; country: string; is_headquarters?: boolean }): Promise<any> {
    return this.request<any>(`/api/v1/companies/${companyId}/branches`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async getDepartments(companyId: string): Promise<any[]> {
    return this.request<any[]>(`/api/v1/companies/${companyId}/departments`, {
      method: 'GET',
    });
  }

  public async createDepartment(companyId: string, data: { name: string; description?: string }): Promise<any> {
    return this.request<any>(`/api/v1/companies/${companyId}/departments`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async getTeams(companyId: string): Promise<any[]> {
    return this.request<any[]>(`/api/v1/companies/${companyId}/teams`, {
      method: 'GET',
    });
  }

  public async createTeam(companyId: string, data: { department_id: string; name: string; description?: string }): Promise<any> {
    return this.request<any>(`/api/v1/companies/${companyId}/teams`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async inviteMember(companyId: string, data: { email?: string; user_id?: string; title?: string }): Promise<any> {
    return this.request<any>(`/api/v1/companies/${companyId}/members`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async acceptMembership(companyId: string): Promise<any> {
    return this.request<any>(`/api/v1/companies/${companyId}/membership/accept`, {
      method: 'POST',
    });
  }

  public async transferOwnership(companyId: string, data: { new_owner_user_id: string }): Promise<any> {
    return this.request<any>(`/api/v1/companies/${companyId}/ownership-transfer`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async verifyCompanyAdmin(companyId: string, status: 'verified' | 'rejected' | 'pending'): Promise<any> {
    return this.request<any>(`/api/v1/admin/companies/${companyId}/verification`, {
      method: 'PATCH',
      body: JSON.stringify({ verification_status: status }),
    });
  }
}

export const apiClient = new ApiClient();
