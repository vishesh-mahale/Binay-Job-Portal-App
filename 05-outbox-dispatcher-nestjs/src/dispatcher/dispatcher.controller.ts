import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { DispatcherService, WakeResponse } from './dispatcher.service';
import { WebhookSecretGuard } from './guards/webhook-secret.guard';

/**
 * Wake endpoint (plan Section 13).
 *
 * - POST /internal/dispatcher/wake — the ONLY inbound route besides health.
 * - Guarded by the shared webhook secret (constant-time, dual-secret).
 * - The Supabase webhook body (inserted-row payload) is IGNORED and never
 *   parsed or logged — producer-side rule keeps it free of PII anyway.
 * - Responds immediately with the drain summary (or `queued_pending_wake`
 *   when a drain is already running — the latch handles continuation).
 */
@Controller('internal/dispatcher')
export class DispatcherController {
  constructor(private readonly dispatcher: DispatcherService) {}

  @Post('wake')
  @HttpCode(200)
  @UseGuards(WebhookSecretGuard)
  async wake(@Body() _body: unknown): Promise<WakeResponse> {
    // Body intentionally discarded; `reason` is diagnostic only.
    return this.dispatcher.wake('webhook');
  }
}
