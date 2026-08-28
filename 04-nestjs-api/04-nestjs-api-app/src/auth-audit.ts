import { Injectable } from '@nestjs/common';
import { SystemClient } from './clients';

/** Server-only append-only auth audit writer. Secrets and raw tokens are never accepted. */
@Injectable()
export class AuthAuditService {
  constructor(private readonly system: SystemClient) {}

  async loginAttempt(input: {
    userId?: string | null; email: string; success: boolean;
    failureReason?: string | null; ipAddress?: string | null; userAgent?: string | null;
    loginType?: 'email_password' | 'magic_link' | 'otp' | 'oauth' | 'sso';
    authProvider?: string | null;
  }): Promise<void> {
    await this.system.query(
      `INSERT INTO public.login_history
       (user_id, email, login_type, auth_provider, success, failure_reason, ip_address, user_agent)
       VALUES ($1, $2, $7::public.auth_login_type, $8, $3,
               $4::public.login_failure_reason, $5::inet, $6)`,
      [input.userId ?? null, input.email, input.success, input.failureReason ?? null,
        input.ipAddress ?? null, input.userAgent ?? null, input.loginType ?? 'email_password', input.authProvider ?? null],
    );
  }

  async knownUserSecurityEvent(input: {
    userId: string; eventType: string; description: string; metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.system.query(
      `INSERT INTO public.user_security_log (user_id, event_type, description, metadata)
       VALUES ($1, $2::public.security_event_type, $3, $4::jsonb)`,
      [input.userId, input.eventType, input.description, JSON.stringify(input.metadata ?? {})],
    );
  }
}
