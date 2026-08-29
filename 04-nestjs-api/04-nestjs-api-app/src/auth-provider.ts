import { Body, Controller, HttpCode, HttpStatus, Injectable, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { Request } from 'express';
import { BadRequestException, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import type { AppConfig } from './config';
import { SystemClient } from './clients';
import { AuthGuard } from './auth';
import { AuthAuditService } from './auth-audit';
import { randomUUID } from 'node:crypto';
import { Allow, IsEmail, IsString, MinLength } from 'class-validator';

export interface AuthSession { accessToken: string | null; refreshToken: string | null; userId: string | null; requiresVerification: boolean; }
export interface AuthProvider { signup(input: { email: string; password: string }): Promise<AuthSession>; login(input: { email: string; password: string }): Promise<AuthSession>; refresh(refreshToken: string): Promise<AuthSession>; }

export class AuthProviderError extends Error {
  constructor(public readonly failureReason: string | null, public readonly httpStatus: number) { super('AUTH_PROVIDER_ERROR'); }
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
  constructor(private readonly config: AppConfig) {}
  private async call(path: string, body: Record<string, string>): Promise<AuthSession> {
    if (!this.config.SUPABASE_URL || !this.config.SUPABASE_SERVICE_ROLE_KEY) throw new ServiceUnavailableException('DEPENDENCY_UNAVAILABLE');
    let response: globalThis.Response;
    try {
      response = await fetch(`${this.config.SUPABASE_URL.replace(/\/$/, '')}/auth/v1${path}`, { method: 'POST', headers: { apikey: this.config.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${this.config.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    } catch { throw new ServiceUnavailableException('DEPENDENCY_UNAVAILABLE'); }
    const payload = await response.json().catch(() => ({})) as Record<string, any>;
    if (!response.ok) throw new AuthProviderError(mapFailureReason(payload), response.status);
    return { accessToken: typeof payload.access_token === 'string' ? payload.access_token : null, refreshToken: typeof payload.refresh_token === 'string' ? payload.refresh_token : null, userId: typeof payload.user?.id === 'string' ? payload.user.id : null, requiresVerification: !payload.access_token };
  }
  signup(input: { email: string; password: string }) { return this.call('/signup', input); }
  login(input: { email: string; password: string }) { return this.call('/token?grant_type=password', input); }
  refresh(refreshToken: string) { return this.call('/token?grant_type=refresh_token', { refresh_token: refreshToken }); }
}

export class SignupDto { @Allow() @IsEmail() email!: string; @Allow() @IsString() @MinLength(8) password!: string; }
export class LoginDto { @Allow() @IsEmail() email!: string; @Allow() @IsString() password!: string; }

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
  async signup(@Body() body: SignupDto, @Res({ passthrough: true }) response: Response) { if (!body.email || !body.password) throw new BadRequestException('VALIDATION_ERROR'); const session = await this.provider.signup({ email: body.email.trim().toLowerCase(), password: body.password }); setSessionCookies(response, session, this.secure); return { status: session.requiresVerification ? 'pending_verification' : 'active', user_id: session.userId }; }
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
      if (error instanceof AuthProviderError && (error.httpStatus === 400 || error.httpStatus === 422)) throw new BadRequestException('VALIDATION_ERROR');
      throw new UnauthorizedException('UNAUTHORIZED');
    }
    if (!session.userId) throw new UnauthorizedException('UNAUTHORIZED');
    const result = await this.system.query<{ status: string; deleted_at: string | null; locked_until: string | null }>('SELECT status, deleted_at, locked_until FROM public.users WHERE id = $1', [session.userId]);
    const account = result.rows[0];
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
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) { const refreshToken = (request as Request & { cookies?: Record<string, string> }).cookies?.binay_refresh_token; if (!refreshToken) throw new UnauthorizedException('UNAUTHORIZED'); const session = await this.provider.refresh(refreshToken); if (!session.userId) throw new UnauthorizedException('UNAUTHORIZED'); const result = await this.system.query<{ status: string; deleted_at: string | null; locked_until: string | null }>('SELECT status, deleted_at, locked_until FROM public.users WHERE id = $1', [session.userId]); const account = result.rows[0]; if (!account || account.deleted_at || account.status !== 'active' || (account.locked_until && new Date(account.locked_until).getTime() > Date.now())) throw new UnauthorizedException('UNAUTHORIZED'); setSessionCookies(response, session, this.secure); return { status: 'refreshed' }; }
  @Post('logout')
  @UseGuards(AuthGuard)
  async logout(@Req() request: any, @Res({ passthrough: true }) response: Response) {
    const userId = request.user?.sub;
    const presenceId = request.cookies?.binay_presence_session;
    if (userId && presenceId) await this.system.query(`UPDATE public.user_sessions SET is_online = FALSE, socket_id = NULL, updated_at = NOW() WHERE id = $1 AND user_id = $2 AND is_online = TRUE`, [presenceId, userId]);
    response.clearCookie('binay_access_token', { httpOnly: true, secure: this.secure, sameSite: 'lax', path: '/' }); response.clearCookie('binay_refresh_token', { httpOnly: true, secure: this.secure, sameSite: 'lax', path: '/api/v1/auth/refresh' }); response.clearCookie('binay_presence_session', { httpOnly: true, secure: this.secure, sameSite: 'lax', path: '/api/v1' }); return { status: 'logged_out' };
  }
}
