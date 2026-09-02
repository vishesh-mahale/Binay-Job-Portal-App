import { Body, Controller, HttpCode, HttpStatus, Injectable, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { Request } from 'express';
import { BadRequestException, UnauthorizedException, ServiceUnavailableException, HttpException } from '@nestjs/common';
import type { AppConfig } from '../../infrastructure/config/config';
import { SystemClient } from '../../infrastructure/database/clients';
import { AuthGuard } from './auth';
import { AuthAuditService } from './auth-audit';
import { randomUUID } from 'node:crypto';
import { Allow, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export type AllowedSignupRole = 'candidate' | 'employer';

export interface AuthSession { accessToken: string | null; refreshToken: string | null; userId: string | null; requiresVerification: boolean; }
export interface AuthProvider { signup(input: { email: string; password: string; register_as?: AllowedSignupRole }): Promise<AuthSession>; login(input: { email: string; password: string }): Promise<AuthSession>; refresh(refreshToken: string): Promise<AuthSession>; }

export class AuthProviderError extends Error {
  constructor(
    public readonly failureReason: string | null,
    public readonly httpStatus: number,
    public readonly userId?: string | null,
    public readonly cleanupSuccess?: boolean
  ) { super('AUTH_PROVIDER_ERROR'); }
}

export function parseJwtPayloadUnchecked(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

const FAILURE_REASONS = new Set(['invalid_password','user_not_found','account_locked','email_not_verified','too_many_attempts','suspended','banned','invalid_oauth_token','unknown']);
export function mapFailureReason(payload: Record<string, any>): string {
  const raw = `${payload.error_code ?? ''} ${payload.error ?? ''} ${payload.msg ?? ''} ${payload.message ?? ''}`.toLowerCase();
  if (raw.includes('not_confirmed') || raw.includes('not confirmed') || raw.includes('email_not_verified')) return 'email_not_verified';
  if (raw.includes('invalid_grant') || raw.includes('invalid login') || raw.includes('invalid password') || raw.includes('password')) return 'invalid_password';
  if (raw.includes('user not found') || raw.includes('user_not_found')) return 'user_not_found';
  if (raw.includes('too many') || raw.includes('rate limit')) return 'too_many_attempts';
  return 'unknown';
}

@Injectable()
export class SupabaseAuthProvider implements AuthProvider {
  constructor(public readonly config: AppConfig) {}
  private async call(path: string, body: Record<string, any>): Promise<AuthSession> {
    const secretKey = this.config.SUPABASE_SECRET_KEY || this.config.SUPABASE_SERVICE_ROLE_KEY;
    if (!this.config.SUPABASE_URL || !secretKey) throw new ServiceUnavailableException('DEPENDENCY_UNAVAILABLE');
    let response: globalThis.Response;
    try {
      response = await fetch(`${this.config.SUPABASE_URL.replace(/\/$/, '')}/auth/v1${path}`, { method: 'POST', headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    } catch { throw new ServiceUnavailableException('DEPENDENCY_UNAVAILABLE'); }
    const payload = await response.json().catch(() => ({})) as Record<string, any>;
    if (!response.ok) {
      console.error(`[SupabaseAuth] Path: ${path}, Status: ${response.status}, ErrorCode: ${payload.error_code || payload.error || 'unknown'}`);
      throw new AuthProviderError(mapFailureReason(payload), response.status);
    }
    const userId = typeof payload.user?.id === 'string' ? payload.user.id : (typeof payload.id === 'string' ? payload.id : null);
    return { accessToken: typeof payload.access_token === 'string' ? payload.access_token : null, refreshToken: typeof payload.refresh_token === 'string' ? payload.refresh_token : null, userId, requiresVerification: !payload.access_token };
  }
  async deleteAdminUser(userId: string | null): Promise<boolean> {
    if (!userId) return false;
    const secretKey = this.config.SUPABASE_SECRET_KEY || this.config.SUPABASE_SERVICE_ROLE_KEY;
    if (!secretKey || !this.config.SUPABASE_URL) return false;
    try {
      const res = await fetch(`${this.config.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}` }
      });
      if (!res.ok) {
        const errPayload = await res.json().catch(() => ({}));
        console.error(`[SupabaseAuthAdmin] Delete user ${userId} failed with status: ${res.status}`, errPayload);
        return false;
      }
      return true;
    } catch (err) {
      console.error(`[SupabaseAuthAdmin] Delete user ${userId} network exception:`, err);
      return false;
    }
  }
  async logoutGlobalUser(userAccessToken: string | null): Promise<boolean> {
    if (!userAccessToken) return false;
    const key = this.config.SUPABASE_SECRET_KEY || this.config.SUPABASE_SERVICE_ROLE_KEY;
    if (!key || !this.config.SUPABASE_URL) return false;
    try {
      const res = await fetch(`${this.config.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/logout?scope=global`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${userAccessToken}`,
          'content-type': 'application/json'
        }
      });
      console.log(`[SupabaseAuth] logoutGlobalUser HTTP status: ${res.status}`);
      return res.status === 204 || res.ok;
    } catch (err) {
      console.error(`[SupabaseAuth] logoutGlobalUser network exception:`, err);
      return false;
    }
  }
  async signup(input: { email: string; password: string; register_as?: AllowedSignupRole }): Promise<AuthSession> {
    const targetRole: AllowedSignupRole = input.register_as === 'employer' ? 'employer' : 'candidate';
    let session = await this.call('/signup', {
      email: input.email,
      password: input.password,
      options: {
        email_redirect_to: `${this.config.FRONTEND_URL}/verify-email`,
        data: { application_role: targetRole }
      }
    });
    if (session.userId) {
      const secretKey = this.config.SUPABASE_SECRET_KEY || this.config.SUPABASE_SERVICE_ROLE_KEY;
      if (secretKey && this.config.SUPABASE_URL) {
        try {
          const updatePayload: Record<string, any> = {
            app_metadata: { application_role: targetRole }
          };
          if (this.config.AUTH_AUTO_CONFIRM_EMAIL) {
            updatePayload.email_confirm = true;
          }
          const updateRes = await fetch(`${this.config.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/admin/users/${session.userId}`, {
            method: 'PUT',
            headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}`, 'content-type': 'application/json' },
            body: JSON.stringify(updatePayload),
          });
          if (!updateRes.ok) {
            console.error(`[SupabaseAuthAdmin] Update user ${session.userId} failed with status: ${updateRes.status}`);
            if (this.config.AUTH_AUTO_CONFIRM_EMAIL) {
              const cleaned = await this.deleteAdminUser(session.userId);
              throw new AuthProviderError('admin_update_failed', updateRes.status, session.userId, cleaned);
            }
          } else if (this.config.AUTH_AUTO_CONFIRM_EMAIL) {
            session = await this.login({ email: input.email, password: input.password });
          }
        } catch (err) {
          if (err instanceof AuthProviderError) throw err;
          if (this.config.AUTH_AUTO_CONFIRM_EMAIL) {
            const cleaned = await this.deleteAdminUser(session.userId);
            throw new AuthProviderError('admin_update_failed', 503, session.userId, cleaned);
          }
        }
      } else if (this.config.AUTH_AUTO_CONFIRM_EMAIL) {
        const cleaned = await this.deleteAdminUser(session.userId);
        throw new AuthProviderError('admin_update_failed', 503, session.userId, cleaned);
      }
    }
    return session;
  }
  login(input: { email: string; password: string }) {
    return this.call('/token?grant_type=password', { email: input.email, password: input.password });
  }
  refresh(refreshToken: string) { return this.call('/token?grant_type=refresh_token', { refresh_token: refreshToken }); }
  async forgotPassword(email: string): Promise<void> {
    const secretKey = this.config.SUPABASE_SECRET_KEY || this.config.SUPABASE_SERVICE_ROLE_KEY;
    if (!this.config.SUPABASE_URL || !secretKey) throw new ServiceUnavailableException('DEPENDENCY_UNAVAILABLE');
    const payload = {
      email,
      options: {
        email_redirect_to: `${this.config.FRONTEND_URL}/reset-password`
      }
    };
    try {
      await fetch(`${this.config.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/recover`, {
        method: 'POST',
        headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch {
      throw new ServiceUnavailableException('DEPENDENCY_UNAVAILABLE');
    }
  }
  async changePassword(userId: string, email: string, currentPassword: string, newPassword: string): Promise<void> {
    let session: AuthSession;
    try {
      session = await this.login({ email, password: currentPassword });
    } catch {
      throw new AuthProviderError('invalid_password', 401);
    }
    const secretKey = this.config.SUPABASE_SECRET_KEY || this.config.SUPABASE_SERVICE_ROLE_KEY;
    if (!this.config.SUPABASE_URL || !secretKey) throw new ServiceUnavailableException('DEPENDENCY_UNAVAILABLE');

    if (!session.accessToken) {
      throw new ServiceUnavailableException('GLOBAL_LOGOUT_FAILED');
    }
    const globalRevoked = await this.logoutGlobalUser(session.accessToken);
    if (!globalRevoked) {
      throw new ServiceUnavailableException('GLOBAL_LOGOUT_FAILED');
    }

    const updateRes = await fetch(`${this.config.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/admin/users/${userId}`, {
      method: 'PUT',
      headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ password: newPassword }),
    });
    if (!updateRes.ok) {
      throw new AuthProviderError('admin_update_failed', updateRes.status);
    }
  }

  async resetPasswordWithToken(recoveryToken: string, newPassword: string): Promise<void> {
    const secretKey = this.config.SUPABASE_SECRET_KEY || this.config.SUPABASE_SERVICE_ROLE_KEY;
    if (!this.config.SUPABASE_URL || !secretKey) throw new ServiceUnavailableException('DEPENDENCY_UNAVAILABLE');
    const updateRes = await fetch(`${this.config.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        apikey: secretKey,
        Authorization: `Bearer ${recoveryToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ password: newPassword }),
    });
    if (!updateRes.ok) {
      const payload = await updateRes.json().catch(() => ({}));
      const msg = payload.error_description || payload.msg || payload.message || 'Failed to reset password.';
      throw new AuthProviderError(msg, updateRes.status);
    }
  }
}

export class SignupDto {
  @Allow()
  @IsEmail()
  email!: string;

  @Allow()
  @IsString()
  @MinLength(8)
  password!: string;

  @Allow()
  @IsOptional()
  @IsIn(['candidate', 'employer'], { message: 'register_as must be candidate or employer' })
  register_as?: AllowedSignupRole;
}

export class LoginDto { @Allow() @IsEmail() email!: string; @Allow() @IsString() password!: string; }

export class ForgotPasswordDto {
  @Allow()
  @IsEmail()
  email!: string;
}

export class ChangePasswordDto {
  @Allow()
  @IsString()
  current_password!: string;

  @Allow()
  @IsString()
  @MinLength(8)
  new_password!: string;
}

export class ResetPasswordDto {
  @Allow()
  @IsString()
  recovery_token!: string;

  @Allow()
  @IsString()
  @MinLength(8)
  new_password!: string;
}

function setSessionCookies(response: Response, session: AuthSession, secure: boolean) {
  if (session.accessToken) response.cookie('binay_access_token', session.accessToken, { httpOnly: true, secure, sameSite: 'lax', path: '/' });
  if (session.refreshToken) response.cookie('binay_refresh_token', session.refreshToken, { httpOnly: true, secure, sameSite: 'lax', path: '/api/v1/auth/refresh' });
}

function setPresenceCookie(response: Response, sessionId: string, secure: boolean) {
  response.cookie('binay_presence_session', sessionId, { httpOnly: true, secure, sameSite: 'lax', path: '/api/v1' });
}

@Controller('api/v1/auth')
export class AuthProviderController {
  private readonly secure = process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test';
  constructor(private readonly provider: SupabaseAuthProvider, private readonly system: SystemClient, private readonly audit: AuthAuditService) {}
  @Post('signup') @HttpCode(HttpStatus.CREATED)
  async signup(@Body() body: SignupDto, @Res({ passthrough: true }) response: Response) {
    if (!body.email || !body.password) throw new BadRequestException('VALIDATION_ERROR');
    const requestedRole: AllowedSignupRole = body.register_as === 'employer' ? 'employer' : 'candidate';
    let session: AuthSession;
    try {
      session = await this.provider.signup({
        email: body.email.trim().toLowerCase(),
        password: body.password,
        register_as: requestedRole
      });
    } catch (error) {
      if (error instanceof AuthProviderError) {
        if (error.userId) {
          let fallbackSuccess = false;
          const cleanupSuccess = error.cleanupSuccess ?? false;
          if (!cleanupSuccess) {
            try {
              const userEmail = body.email.trim().toLowerCase();
              const fallbackFirstName = userEmail.split('@')[0] || 'User';
              await this.system.query(
                `INSERT INTO public.users (id, email, first_name, last_name, role, status) VALUES ($1, $2, $3, '', $4::public.user_role, 'suspended'::public.account_status) ON CONFLICT (id) DO UPDATE SET status = 'suspended'::public.account_status`,
                [error.userId, userEmail, fallbackFirstName, requestedRole]
              );
              fallbackSuccess = true;
            } catch (dbErr) {
              console.error('[SignupProvisioning] Failed to persist suspended status fallback for user:', error.userId, dbErr);
            }
          }
          const description = cleanupSuccess
            ? 'Role/auto-confirm provisioning failed during signup; compensating cleanup succeeded'
            : fallbackSuccess
            ? 'Role/auto-confirm provisioning failed during signup; compensating cleanup failed, durable suspended state persisted'
            : 'Role/auto-confirm provisioning failed during signup; compensating cleanup failed and suspended state persistence failed';

          await this.audit.knownUserSecurityEvent({
            userId: error.userId,
            eventType: 'account_suspended',
            description,
            metadata: { register_as: requestedRole, cleanup_success: cleanupSuccess, fallback_success: fallbackSuccess, error: error.failureReason }
          });
        }
        if (error.failureReason === 'admin_update_failed' || error.httpStatus === 503) {
          throw new ServiceUnavailableException('ROLE_PROVISIONING_FAILED');
        }
        if (error.httpStatus === 400 || error.httpStatus === 422) {
          throw new BadRequestException('VALIDATION_ERROR');
        }
        if (error.httpStatus === 429 || error.failureReason === 'too_many_attempts') {
          throw new HttpException({ success: false, data: null, error: { code: 'TOO_MANY_REQUESTS', message: 'Email rate limit exceeded. Please wait a few minutes before requesting another confirmation email or sign in directly.' }, schema_version: 1 }, HttpStatus.TOO_MANY_REQUESTS);
        }
        throw new ServiceUnavailableException('DEPENDENCY_UNAVAILABLE');
      }
      throw error;
    }

    // Provision public.users.role and active status through the trusted NestJS server SystemClient
    if (session.userId) {
      try {
        let updateRes: { rowCount?: number | null };
        if (this.provider.config.AUTH_AUTO_CONFIRM_EMAIL && !session.requiresVerification) {
          updateRes = await this.system.query(
            `UPDATE public.users SET role = $1::public.user_role, status = 'active'::public.account_status WHERE id = $2`,
            [requestedRole, session.userId]
          );
        } else {
          updateRes = await this.system.query(
            `UPDATE public.users SET role = $1::public.user_role WHERE id = $2`,
            [requestedRole, session.userId]
          );
        }
        if (!updateRes || updateRes.rowCount !== 1) {
          throw new Error(`Role provisioning failed: expected 1 row updated, got ${updateRes?.rowCount ?? 0}`);
        }
      } catch (err) {
        console.error('[SignupProvisioning] Failed to update public.users.role for user:', session.userId, err);
        const cleaned = await this.provider.deleteAdminUser(session.userId);
        let fallbackSuccess = false;
        if (!cleaned) {
          try {
            const userEmail = body.email.trim().toLowerCase();
            const fallbackFirstName = userEmail.split('@')[0] || 'User';
            await this.system.query(
              `INSERT INTO public.users (id, email, first_name, last_name, role, status) VALUES ($1, $2, $3, '', $4::public.user_role, 'suspended'::public.account_status) ON CONFLICT (id) DO UPDATE SET status = 'suspended'::public.account_status`,
              [session.userId, userEmail, fallbackFirstName, requestedRole]
            );
            fallbackSuccess = true;
          } catch (dbErr) {
            console.error('[SignupProvisioning] Failed to persist suspended status fallback for user:', session.userId, dbErr);
          }
        }
        const description = cleaned
          ? 'Role provisioning failed during signup; compensating cleanup succeeded'
          : fallbackSuccess
          ? 'Role provisioning failed during signup; compensating cleanup failed, durable suspended state persisted'
          : 'Role provisioning failed during signup; compensating cleanup failed and suspended state persistence failed';

        await this.audit.knownUserSecurityEvent({
          userId: session.userId,
          eventType: 'account_suspended',
          description,
          metadata: { register_as: requestedRole, cleanup_success: cleaned, fallback_success: fallbackSuccess, error: String(err) }
        });
        throw new ServiceUnavailableException('ROLE_PROVISIONING_FAILED');
      }
    }

    setSessionCookies(response, session, this.secure);
    return { status: session.requiresVerification ? 'pending_verification' : 'active', user_id: session.userId };
  }
  @Post('login')
  async login(@Req() request: Request, @Body() body: LoginDto, @Res({ passthrough: true }) response: Response) {
    if (!body.email || !body.password) throw new BadRequestException('VALIDATION_ERROR');
    const email = body.email.trim().toLowerCase();
    let session: AuthSession;
    try { session = await this.provider.login({ email, password: body.password }); }
    catch (error) {
      const reason = error instanceof AuthProviderError ? error.failureReason : 'unknown';
      await this.audit.loginAttempt({ email, success: false, failureReason: FAILURE_REASONS.has(reason ?? '') ? reason : 'unknown', ipAddress: request.ip, userAgent: request.headers['user-agent'] });
      const known = await this.system.query<{ id: string }>('SELECT id FROM public.users WHERE email = $1 LIMIT 1', [email]);
      if (known.rows[0]) await this.audit.knownUserSecurityEvent({ userId: known.rows[0].id, eventType: 'login_failed', description: 'Login attempt failed', metadata: { failure_reason: FAILURE_REASONS.has(reason ?? '') ? reason : 'unknown', ip_address: request.ip ?? null } });
      throw new UnauthorizedException('UNAUTHORIZED');
    }
    if (!session.userId) throw new UnauthorizedException('UNAUTHORIZED');
    const result = await this.system.query<{ status: string; deleted_at: string | null; locked_until: string | null }>('SELECT status, deleted_at, locked_until FROM public.users WHERE id = $1', [session.userId]);
    let account = result.rows[0];
    if (account && account.status === 'pending_verification' && session.accessToken) {
      await this.system.query(`UPDATE public.users SET status = 'active'::public.account_status WHERE id = $1`, [session.userId]);
      account.status = 'active';
    }
    if (!account || account.deleted_at || account.status !== 'active' || (account.locked_until && new Date(account.locked_until).getTime() > Date.now())) {
      const reason = account?.locked_until && new Date(account.locked_until).getTime() > Date.now() ? 'account_locked' : account?.status === 'suspended' ? 'suspended' : account?.status === 'banned' ? 'banned' : account?.status === 'pending_verification' ? 'email_not_verified' : 'unknown';
      await this.audit.loginAttempt({ userId: session.userId, email, success: false, failureReason: reason, ipAddress: request.ip, userAgent: request.headers['user-agent'] });
      await this.audit.knownUserSecurityEvent({ userId: session.userId, eventType: reason === 'account_locked' ? 'account_locked' : reason === 'suspended' ? 'account_suspended' : 'login_failed', description: 'Login rejected by account state policy', metadata: { failure_reason: reason, ip_address: request.ip ?? null } });
      throw new UnauthorizedException('UNAUTHORIZED');
    }
    await this.audit.loginAttempt({ userId: session.userId, email, success: true, ipAddress: request.ip, userAgent: request.headers['user-agent'] });
    const presenceId = randomUUID();
    await this.system.query(`INSERT INTO public.user_sessions (id, user_id, is_online, last_seen_at, device_type, user_agent) VALUES ($1, $2, TRUE, NOW(), $3, $4)`, [presenceId, session.userId, null, request.headers['user-agent'] ?? null]);
    setSessionCookies(response, session, this.secure); setPresenceCookie(response, presenceId, this.secure); return { status: 'authenticated', user_id: session.userId };
  }
  @Post('refresh')
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = (request as Request & { cookies?: Record<string, string> }).cookies?.binay_refresh_token;
    if (!refreshToken) throw new UnauthorizedException('UNAUTHORIZED');
    let session: AuthSession;
    try {
      session = await this.provider.refresh(refreshToken);
    } catch {
      response.clearCookie('binay_access_token', { httpOnly: true, secure: this.secure, sameSite: 'lax', path: '/' });
      response.clearCookie('binay_refresh_token', { httpOnly: true, secure: this.secure, sameSite: 'lax', path: '/api/v1/auth/refresh' });
      response.clearCookie('binay_presence_session', { httpOnly: true, secure: this.secure, sameSite: 'lax', path: '/api/v1' });
      throw new UnauthorizedException('UNAUTHORIZED');
    }
    if (!session.userId) throw new UnauthorizedException('UNAUTHORIZED');
    const result = await this.system.query<{ status: string; deleted_at: string | null; locked_until: string | null; last_password_changed_at: string | null }>(
      'SELECT status, deleted_at, locked_until, last_password_changed_at FROM public.users WHERE id = $1',
      [session.userId]
    );
    const account = result.rows[0];
    if (!account || account.deleted_at || account.status !== 'active' || (account.locked_until && new Date(account.locked_until).getTime() > Date.now())) {
      response.clearCookie('binay_access_token', { httpOnly: true, secure: this.secure, sameSite: 'lax', path: '/' });
      response.clearCookie('binay_refresh_token', { httpOnly: true, secure: this.secure, sameSite: 'lax', path: '/api/v1/auth/refresh' });
      response.clearCookie('binay_presence_session', { httpOnly: true, secure: this.secure, sameSite: 'lax', path: '/api/v1' });
      throw new UnauthorizedException('UNAUTHORIZED');
    }
    if (account.last_password_changed_at && session.accessToken) {
      const cutoffSeconds = Math.ceil(new Date(account.last_password_changed_at).getTime() / 1000);
      const decoded = parseJwtPayloadUnchecked(session.accessToken);
      const tokenIat = typeof decoded?.iat === 'number' ? decoded.iat : undefined;
      if (typeof tokenIat === 'number' && tokenIat < cutoffSeconds) {
        response.clearCookie('binay_access_token', { httpOnly: true, secure: this.secure, sameSite: 'lax', path: '/' });
        response.clearCookie('binay_refresh_token', { httpOnly: true, secure: this.secure, sameSite: 'lax', path: '/api/v1/auth/refresh' });
        response.clearCookie('binay_presence_session', { httpOnly: true, secure: this.secure, sameSite: 'lax', path: '/api/v1' });
        throw new UnauthorizedException('UNAUTHORIZED');
      }
    }
    setSessionCookies(response, session, this.secure);
    return { status: 'refreshed' };
  }
  @Post('logout')
  @UseGuards(AuthGuard)
  async logout(@Req() request: any, @Res({ passthrough: true }) response: Response) {
    const userId = request.user?.sub;
    const presenceId = request.cookies?.binay_presence_session;
    if (userId && presenceId) await this.system.query(`UPDATE public.user_sessions SET is_online = FALSE, socket_id = NULL, updated_at = NOW() WHERE id = $1 AND user_id = $2 AND is_online = TRUE`, [presenceId, userId]);
    response.clearCookie('binay_access_token', { httpOnly: true, secure: this.secure, sameSite: 'lax', path: '/' }); response.clearCookie('binay_refresh_token', { httpOnly: true, secure: this.secure, sameSite: 'lax', path: '/api/v1/auth/refresh' }); response.clearCookie('binay_presence_session', { httpOnly: true, secure: this.secure, sameSite: 'lax', path: '/api/v1' }); return { status: 'logged_out' };
  }
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    if (!body.email) throw new BadRequestException('VALIDATION_ERROR');
    const email = body.email.trim().toLowerCase();
    try {
      await this.provider.forgotPassword(email);
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
    }
    return {
      success: true,
      message: 'If an account exists with that email address, a password reset link has been sent.'
    };
  }
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  async changePassword(@Req() request: any, @Body() body: ChangePasswordDto) {
    if (!body.current_password || !body.new_password) throw new BadRequestException('VALIDATION_ERROR');
    if (body.new_password.length < 8) throw new BadRequestException('VALIDATION_ERROR');
    const userId = request.user?.sub;
    if (!userId) throw new UnauthorizedException('UNAUTHORIZED');

    const userRes = await this.system.query<{ email: string }>('SELECT email FROM public.users WHERE id = $1', [userId]);
    const email = userRes.rows[0]?.email;
    if (!email) throw new UnauthorizedException('UNAUTHORIZED');

    try {
      await this.provider.changePassword(userId, email, body.current_password, body.new_password);
    } catch (err) {
      if (err instanceof AuthProviderError || err instanceof UnauthorizedException) {
        throw new UnauthorizedException('UNAUTHORIZED');
      }
      throw err;
    }

    await this.audit.knownUserSecurityEvent({
      userId,
      eventType: 'password_changed',
      description: 'User successfully changed password via authenticated endpoint',
      metadata: { ip_address: request.ip ?? null }
    });

    return { success: true, message: 'Password updated successfully.' };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() body: ResetPasswordDto) {
    if (!body.recovery_token || !body.new_password) throw new BadRequestException('VALIDATION_ERROR');
    if (body.new_password.length < 8) throw new BadRequestException('VALIDATION_ERROR');
    try {
      await this.provider.resetPasswordWithToken(body.recovery_token, body.new_password);
    } catch (err) {
      if (err instanceof AuthProviderError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
    return { success: true, message: 'Password reset successfully.' };
  }
}