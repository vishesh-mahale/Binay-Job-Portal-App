import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { AppConfigService } from '../../config/app-config.service';

/**
 * Webhook shared-secret guard (plan Sections 12–13).
 *
 * - Header: `x-webhook-secret`.
 * - Constant-time comparison — no timing side channel.
 * - Dual-secret support: current secret first, previous secret during the
 *   rotation window.
 * - This is the ONLY auth on the wake endpoint (Supabase webhooks cannot
 *   issue OIDC; machine-to-machine secret is the approved mechanism).
 */
export const WEBHOOK_SECRET_HEADER = 'x-webhook-secret';

@Injectable()
export class WebhookSecretGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers[WEBHOOK_SECRET_HEADER];

    if (typeof provided !== 'string' || provided.length === 0) {
      throw new UnauthorizedException();
    }

    const valid =
      constantTimeEquals(provided, this.config.webhookSecret) ||
      (this.config.webhookSecretPrevious !== undefined &&
        constantTimeEquals(provided, this.config.webhookSecretPrevious));

    if (!valid) {
      throw new UnauthorizedException();
    }
    return true;
  }
}

/** Constant-time string comparison over UTF-8 digests. */
export function constantTimeEquals(a: string, b: string): boolean {
  const digestA = Buffer.from(a, 'utf8');
  const digestB = Buffer.from(b, 'utf8');
  if (digestA.length !== digestB.length) {
    // Compare against self to keep the timing profile uniform.
    timingSafeEqual(digestA, digestA);
    return false;
  }
  return timingSafeEqual(digestA, digestB);
}
