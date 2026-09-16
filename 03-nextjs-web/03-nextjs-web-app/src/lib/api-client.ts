import { AppApiError, mapHttpErrorToAppError } from './errors';
import type {
  AuthSessionResponse,
  LoginRequest,
  RevokeSessionRequest,
  SignupRequest,
  UserSessionInfo,
  UserSummary,
} from '../types/auth';
import type {
  CompanySettings,
  CreateJobDto,
  Job,
  PublicJobItem,
  PublicJobSearchFilters,
  PublicJobSearchResponse,
  UpdateJobDto,
} from '../types/jobs';
import type {
  CandidateProfileResponse,
  CandidateProfileUpdate,
  CandidateResume,
  ParsedResumeResponse,
  ResumeConfirmationResponse,
  ResumeStatusResponse,
} from '../types/candidate';
import type {
  ApplicationDetail,
  ApplicationHistoryItem,
  ApplicationListItem,
  SubmitApplicationRequest,
} from '../types/applications';

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

    const isFormDataBody = typeof FormData !== 'undefined' && rest.body instanceof FormData;
    const requestHeaders: Record<string, string> = {
      Accept: 'application/json',
      'x-request-id': requestId,
      'x-trace-id': traceId,
      ...(headers as Record<string, string>),
    };
    if (!isFormDataBody && !Object.keys(requestHeaders).some((key) => key.toLowerCase() === 'content-type')) {
      requestHeaders['Content-Type'] = 'application/json';
    }

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
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('auth:unauthorized'));
            }
            throw mapHttpErrorToAppError(response.status, payload);
          }
        }

        if (response.status === 401 && !skipAuthRefresh) {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('auth:unauthorized'));
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

  private refreshPromise: Promise<AuthSessionResponse> | null = null;

  public async refresh(): Promise<AuthSessionResponse> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    this.refreshPromise = this.request<AuthSessionResponse>('/api/v1/auth/refresh', {
      method: 'POST',
      skipAuthRefresh: true,
    }).finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
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

  public async resendVerification(email: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>('/api/v1/auth/resend-verification', {
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

  public async listAdminCompanies(): Promise<any[]> {
    return this.request<any[]>(`/api/v1/admin/companies`, {
      method: 'GET',
    });
  }

  public async verifyCompanyAdmin(companyId: string, status: 'verified' | 'rejected' | 'pending', rejectionReason?: string): Promise<any> {
    return this.request<any>(`/api/v1/admin/companies/${companyId}/verification`, {
      method: 'PATCH',
      body: JSON.stringify({ verification_status: status, rejection_reason: rejectionReason }),
    });
  }

  // --- Option B Company Invitation Endpoints ---

  public async verifyInvitation(token: string): Promise<any> {
    return this.request<any>(`/api/v1/invitations/verify?token=${encodeURIComponent(token)}`, {
      method: 'GET',
    });
  }

  public async signupWithInvite(data: { token: string; full_name: string; password: string }): Promise<any> {
    return this.request<any>(`/api/v1/auth/signup-with-invite`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async createCompanyInvitation(companyId: string, data: { email: string; title?: string; is_primary_hr?: boolean; branch_id?: string; department_id?: string; team_id?: string }): Promise<any> {
    return this.request<any>(`/api/v1/companies/${companyId}/invitations`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async getCompanyInvitations(companyId: string): Promise<any[]> {
    return this.request<any[]>(`/api/v1/companies/${companyId}/invitations`, {
      method: 'GET',
    });
  }

  public async revokeCompanyInvitation(companyId: string, invitationId: string, reason?: string): Promise<any> {
    return this.request<any>(`/api/v1/companies/${companyId}/invitations/${invitationId}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    });
  }

  // --- Phase 09-D Employer Job Management & Company Settings Endpoints ---

  public async getCompanySettings(companyId: string): Promise<CompanySettings> {
    return this.request<CompanySettings>(`/api/v1/companies/${companyId}/settings`, {
      method: 'GET',
    });
  }

  public async updateCompanySettings(companyId: string, data: { job_approval_required: boolean }): Promise<CompanySettings> {
    return this.request<CompanySettings>(`/api/v1/companies/${companyId}/settings`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  public async listCompanyJobs(companyId: string): Promise<Job[]> {
    return this.request<Job[]>(`/api/v1/companies/${companyId}/jobs`, {
      method: 'GET',
    });
  }

  public async getCompanyJob(companyId: string, jobId: string): Promise<Job> {
    return this.request<Job>(`/api/v1/companies/${companyId}/jobs/${jobId}`, {
      method: 'GET',
    });
  }

  public async createJob(companyId: string, dto: CreateJobDto): Promise<Job> {
    return this.request<Job>(`/api/v1/companies/${companyId}/jobs`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  }

  public async updateJob(companyId: string, jobId: string, dto: UpdateJobDto): Promise<Job> {
    return this.request<Job>(`/api/v1/companies/${companyId}/jobs/${jobId}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  }

  public async publishJob(companyId: string, jobId: string): Promise<Job> {
    return this.request<Job>(`/api/v1/companies/${companyId}/jobs/${jobId}/publish`, {
      method: 'POST',
    });
  }

  public async submitJobForApproval(companyId: string, jobId: string): Promise<Job> {
    return this.request<Job>(`/api/v1/companies/${companyId}/jobs/${jobId}/submit-for-approval`, {
      method: 'POST',
    });
  }

  public async approveJob(companyId: string, jobId: string): Promise<Job> {
    return this.request<Job>(`/api/v1/companies/${companyId}/jobs/${jobId}/approve`, {
      method: 'POST',
    });
  }

  public async rejectJob(companyId: string, jobId: string, reason: string): Promise<Job> {
    return this.request<Job>(`/api/v1/companies/${companyId}/jobs/${jobId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  public async pauseJob(companyId: string, jobId: string): Promise<Job> {
    return this.request<Job>(`/api/v1/companies/${companyId}/jobs/${jobId}/pause`, {
      method: 'POST',
    });
  }

  public async resumeJob(companyId: string, jobId: string): Promise<Job> {
    return this.request<Job>(`/api/v1/companies/${companyId}/jobs/${jobId}/resume`, {
      method: 'POST',
    });
  }

  public async closeJob(companyId: string, jobId: string): Promise<Job> {
    return this.request<Job>(`/api/v1/companies/${companyId}/jobs/${jobId}/close`, {
      method: 'POST',
    });
  }

  public async archiveJob(companyId: string, jobId: string, reason?: string): Promise<Job> {
    return this.request<Job>(`/api/v1/companies/${companyId}/jobs/${jobId}/archive`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  public async listJobCategories(): Promise<any[]> {
    return this.request<any[]>(`/api/v1/job-categories`, {
      method: 'GET',
    });
  }

  public async listSkills(): Promise<any[]> {
    return this.request<any[]>(`/api/v1/skills`, {
      method: 'GET',
    });
  }

  public async listCities(): Promise<any[]> {
    return this.request<any[]>(`/api/v1/cities`, {
      method: 'GET',
    });
  }

  // --- Public Job Search & Discovery Endpoints ---

  public async searchPublicJobs(filters?: PublicJobSearchFilters): Promise<PublicJobSearchResponse> {
    const params = new URLSearchParams();
    if (filters?.q?.trim()) params.set('q', filters.q.trim());
    if (filters?.employment_type?.trim()) params.set('employment_type', filters.employment_type.trim());
    if (filters?.work_mode?.trim()) params.set('work_mode', filters.work_mode.trim());
    if (filters?.location_country?.trim()) params.set('location_country', filters.location_country.trim());
    if (filters?.category_id?.trim()) params.set('category_id', filters.category_id.trim());
    if (filters?.limit) params.set('limit', filters.limit.toString());
    if (filters?.cursor?.trim()) params.set('cursor', filters.cursor.trim());

    const qs = params.toString();
    const endpoint = `/api/v1/jobs${qs ? `?${qs}` : ''}`;
    return this.request<PublicJobSearchResponse>(endpoint, {
      method: 'GET',
      skipAuthRefresh: true,
    });
  }

  public async getPublicJobBySlug(slug: string): Promise<PublicJobItem> {
    return this.request<PublicJobItem>(`/api/v1/jobs/slug/${encodeURIComponent(slug)}`, {
      method: 'GET',
      skipAuthRefresh: true,
    });
  }

  public async getPublicJobById(id: string): Promise<PublicJobItem> {
    return this.request<PublicJobItem>(`/api/v1/jobs/${encodeURIComponent(id)}`, {
      method: 'GET',
      skipAuthRefresh: true,
    });
  }

  // --- Candidate profile, resume and application endpoints ---

  public async getCandidateProfile(): Promise<CandidateProfileResponse> {
    return this.request<CandidateProfileResponse>('/api/v1/candidates/me');
  }

  public async updateCandidateProfile(data: CandidateProfileUpdate): Promise<{ candidate_id: string; profile_revision: number; projection_queued: boolean }> {
    return this.request('/api/v1/candidates/me', { method: 'PATCH', body: JSON.stringify(data) });
  }

  public async listCandidateResumes(): Promise<CandidateResume[]> {
    return this.request<CandidateResume[]>('/api/v1/resumes');
  }

  public async uploadResume(file: File, useAsActive = false): Promise<CandidateResume & { reused: boolean }> {
    const form = new FormData();
    form.append('file', file);
    form.append('use_as_active_profile_resume', String(useAsActive));
    return this.request('/api/v1/resumes/upload', { method: 'POST', body: form });
  }

  public async getResumeStatus(documentId: string): Promise<ResumeStatusResponse> {
    return this.request<ResumeStatusResponse>(`/api/v1/resumes/${encodeURIComponent(documentId)}/status`);
  }

  public async getParsedResume(documentId: string): Promise<ParsedResumeResponse> {
    return this.request<ParsedResumeResponse>(`/api/v1/resumes/${encodeURIComponent(documentId)}/parsed-data`);
  }

  public async deleteResume(documentId: string): Promise<{ deleted: boolean; document_id: string }> {
    return this.request(`/api/v1/resumes/${encodeURIComponent(documentId)}`, { method: 'DELETE' });
  }

  public async confirmResume(documentId: string, data: Record<string, unknown>): Promise<ResumeConfirmationResponse> {
    return this.request<ResumeConfirmationResponse>(`/api/v1/resumes/${encodeURIComponent(documentId)}/confirm`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async updateCandidateFacts(data: { expected_profile_revision: number; skills?: any[]; experiences?: any[]; educations?: any[]; certifications?: any[]; projects?: any[]; languages?: any[]; awards?: any[]; links?: any[] }): Promise<{ candidate_id: string; profile_revision: number; projection_queued: boolean }> {
    return this.request('/api/v1/candidates/me/facts', { method: 'PATCH', body: JSON.stringify(data) });
  }

  public async applyToJob(jobId: string, data: SubmitApplicationRequest): Promise<ApplicationDetail> {
    return this.request<ApplicationDetail>(`/api/v1/jobs/${encodeURIComponent(jobId)}/apply`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async getMyApplications(): Promise<ApplicationListItem[]> {
    return this.request<ApplicationListItem[]>('/api/v1/me/applications');
  }

  public async getMyApplication(applicationId: string): Promise<ApplicationDetail> {
    return this.request<ApplicationDetail>(`/api/v1/me/applications/${encodeURIComponent(applicationId)}`);
  }

  public async getMyApplicationHistory(applicationId: string): Promise<ApplicationHistoryItem[]> {
    return this.request<ApplicationHistoryItem[]>(`/api/v1/me/applications/${encodeURIComponent(applicationId)}/history`);
  }
}

export const apiClient = new ApiClient();

