import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { OutboxRepository } from '../database/outbox.repository';

/**
 * Health endpoints (plan Section 15).
 *
 * - GET /health/liveness  — process alive, no dependency checks.
 * - GET /health/readiness — DB reachable via the cheap, STABLE, indexed
 *   `outbox_recovery_needed()` call (approved function — no ad-hoc SQL).
 */
@Controller('health')
export class HealthController {
  constructor(private readonly repository: OutboxRepository) {}

  @Get('liveness')
  liveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('readiness')
  async readiness(@Res() response: Response): Promise<void> {
    try {
      // Return value is irrelevant — a successful call proves DB reachability.
      await this.repository.recoveryNeeded();
      response.status(HttpStatus.OK).json({ status: 'ready' });
    } catch {
      response.status(HttpStatus.SERVICE_UNAVAILABLE).json({ status: 'unavailable' });
    }
  }
}
