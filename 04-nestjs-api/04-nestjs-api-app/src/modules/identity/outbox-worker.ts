import { Injectable, Logger, Optional, Inject, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { SystemClient } from '../../infrastructure/database/clients';
import { InvitationTokenUtil } from './invitation-token.util';

export interface EmailDeliveryService {
  sendInvitationEmail(options: { email: string; companyName?: string; rawToken: string; title?: string }): Promise<void>;
  lastMessageId?: string | null;
  lastDeliveryStatus?: string | null;
}

import * as nodemailer from 'nodemailer';

@Injectable()
export class BrevoEmailService implements EmailDeliveryService {
  private readonly logger = new Logger(BrevoEmailService.name);
  public lastMessageId: string | null = null;
  public lastDeliveryStatus: string | null = null;

  async sendInvitationEmail(options: { email: string; companyName?: string; rawToken: string; title?: string }): Promise<void> {
    const apiKey = process.env.BREVO_API_KEY || process.env.SMTP_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL || process.env.SMTP_FROM || 'noreply@collabfor.com';
    const senderName = process.env.BREVO_SENDER_NAME || 'CollabFor HR';

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3001').replace(/\/$/, '');
    const inviteLink = `${frontendUrl}/invite/accept?token=${encodeURIComponent(options.rawToken)}`;

    if (!apiKey) {
      if (process.env.NODE_ENV === 'test' || process.env.FAIL_CLOSED_EMAIL === 'true') {
        throw new Error('INVITATION_EMAIL_SERVICE_NOT_CONFIGURED');
      }
      this.lastMessageId = `dev-simulated-${Date.now()}`;
      this.lastDeliveryStatus = 'delivered';
      this.logger.warn(`[DEV_MODE] BREVO_API_KEY missing in .env. Generated invitation link for ${options.email}: ${inviteLink}`);
      return;
    }

    const htmlContent = `<p>Hello,</p><p>You have been invited to join <strong>${options.companyName || 'our team'}</strong> as ${options.title || 'HR'}.</p><p>Accept your invitation by clicking the link below:</p><p><a href="${inviteLink}">${inviteLink}</a></p>`;
    const textContent = `You have been invited to join ${options.companyName || 'our team'} as ${options.title || 'HR'}.\n\nAccept your invitation using this link:\n${inviteLink}`;
    const subject = `Invitation to join ${options.companyName || 'Company'} on CollabFor`;

    // 1. If key is SMTP relay key (starts with xsmtpsib-) or explicit SMTP usage
    if (apiKey.startsWith('xsmtpsib-') || process.env.SMTP_USER) {
      const smtpUser = process.env.SMTP_USER || process.env.BREVO_SMTP_USER || 'b783a8001@smtp-brevo.com';
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
        port: Number(process.env.SMTP_PORT || 587),
        secure: false, // TLS via STARTTLS on 587
        auth: {
          user: smtpUser,
          pass: apiKey,
        },
      });

      const info = await transporter.sendMail({
        from: `"${senderName}" <${senderEmail}>`,
        to: options.email,
        subject,
        text: textContent,
        html: htmlContent,
      });

      this.lastMessageId = info.messageId || `smtp-${Date.now()}`;
      this.lastDeliveryStatus = 'delivered';
      this.logger.log(`Brevo SMTP transactional email sent successfully to ${options.email}. Message ID: ${this.lastMessageId}`);
      return;
    }

    // 2. Otherwise use Brevo v3 REST API (for xkeysib- keys)
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: options.email }],
        subject,
        htmlContent,
        textContent,
      })
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      this.lastMessageId = null;
      this.lastDeliveryStatus = null;
      throw new Error(`BREVO_SMTP_API_ERROR: ${response.status} - ${JSON.stringify(errJson)}`);
    }

    const resData = await response.json();
    this.lastMessageId = resData.messageId || resData.messageIds?.[0] || null;
    if (!this.lastMessageId) {
      throw new Error('BREVO_SMTP_RESPONSE_INVALID: Missing messageId in Brevo provider response');
    }
    this.lastDeliveryStatus = 'delivered';
    this.logger.log(`Brevo transactional email sent successfully to ${options.email}. Message ID: ${this.lastMessageId}`);
  }
}

export interface BaselineOutboxEventRow {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload: any;
  status: 'pending' | 'publishing' | 'published' | 'failed' | 'dead_letter';
  available_at: Date;
  locked_at: Date | null;
  lease_expires_at: Date | null;
  locked_by: string | null;
  task_name: string | null;
  published_at: Date | null;
  dead_lettered_at: Date | null;
  retry_count: number;
  max_retries: number;
  last_error: string | null;
}

@Injectable()
export class OutboxWorkerService implements OnModuleInit {
  private readonly logger = new Logger(OutboxWorkerService.name);

  constructor(
    private readonly db: SystemClient,
    @Optional() @Inject(BrevoEmailService) private readonly emailService?: EmailDeliveryService,
  ) {}

  onModuleInit() {
    // Event-driven mode: Process any leftover/pending events on server startup
    setTimeout(() => this.processPendingInvitations().catch(() => {}), 1000);
  }

  private calculateNextAvailableAt(retryCount: number): Date {
    const nextRetryNumber = retryCount + 1;
    let delaySeconds = 60; // 1 min
    if (nextRetryNumber === 2) delaySeconds = 300; // 5 min
    else if (nextRetryNumber === 3) delaySeconds = 900; // 15 min
    else if (nextRetryNumber >= 4) delaySeconds = 3600; // 1 hour

    return new Date(Date.now() + delaySeconds * 1000);
  }

  private sanitizeErrorMessage(err: any): string {
    const rawMsg = String(err?.message || err || 'Email delivery failure');
    return rawMsg
      .replace(/raw_token=[^\s&]+/gi, 'raw_token=[REDACTED]')
      .replace(/token=[^\s&]+/gi, 'token=[REDACTED]')
      .replace(/password=[^\s&]+/gi, 'password=[REDACTED]')
      .replace(/bearer\s+[^\s&]+/gi, 'bearer [REDACTED]');
  }

  async processPendingInvitations(workerId = 'invitation-outbox-worker', batchSize = 10, leaseSeconds = 120): Promise<{ processed: number; failed: number }> {
    let processed = 0;
    let failed = 0;
    const targetEventType = 'invitation.created';

    // STEP 1: Targeted claim transaction filtering ONLY targetEventType INSIDE candidate selection
    const claimedEvents: BaselineOutboxEventRow[] = await this.db.transaction(async (client) => {
      // Dead-letter stale leases specifically for invitation.created events
      await client.query(
        `UPDATE public.outbox_events
         SET status = 'dead_letter'::public.outbox_event_status,
             retry_count = max_retries,
             last_error = COALESCE(NULLIF(last_error, ''), 'Dispatcher lease expired before publish confirmation'),
             dead_lettered_at = NOW(),
             locked_at = NULL,
             lease_expires_at = NULL,
             locked_by = NULL,
             updated_at = NOW()
         WHERE status = 'publishing'
           AND lease_expires_at <= NOW()
           AND retry_count + 1 >= max_retries
           AND event_type = $1`,
        [targetEventType]
      );

      // Targeted claim query: filters event_type = targetEventType INSIDE candidate selection
      const claimRes = await client.query(
        `WITH candidates AS (
           SELECT id, status AS previous_status
           FROM public.outbox_events
           WHERE ((status IN ('pending', 'failed') AND available_at <= NOW() AND retry_count < max_retries)
                  OR (status = 'publishing' AND lease_expires_at <= NOW() AND retry_count + 1 < max_retries))
             AND event_type = $4
           ORDER BY available_at, occurred_at, id
           FOR UPDATE SKIP LOCKED
           LIMIT $1
         )
         UPDATE public.outbox_events AS event
         SET status = 'publishing',
             retry_count = CASE WHEN candidates.previous_status = 'publishing'
                                THEN event.retry_count + 1 ELSE event.retry_count END,
             locked_at = NOW(),
             lease_expires_at = NOW() + make_interval(secs => $2),
             locked_by = BTRIM($3),
             task_name = NULL,
             published_at = NULL,
             dead_lettered_at = NULL,
             updated_at = NOW()
         FROM candidates
         WHERE event.id = candidates.id
         RETURNING event.*`,
        [batchSize, leaseSeconds, workerId, targetEventType]
      );

      return claimRes.rows;
    });

    if (!claimedEvents.length) {
      return { processed: 0, failed: 0 };
    }

    // STEP 2: Process network calls outside DB transaction (Decryption + Brevo SMTP)
    for (const event of claimedEvents) {
      let isSuccess = false;
      let deliveryError: any = null;
      const taskName = `email_delivery:${event.id}`;

      try {
        const decryptedPayload = InvitationTokenUtil.decryptPayload(event.payload as any);

        if (!this.emailService) {
          throw new Error('INVITATION_EMAIL_SERVICE_NOT_CONFIGURED');
        }

        await this.emailService.sendInvitationEmail({
          email: String(decryptedPayload.email),
          companyName: decryptedPayload.company_name ? String(decryptedPayload.company_name) : undefined,
          rawToken: String(decryptedPayload.raw_token),
          title: decryptedPayload.title ? String(decryptedPayload.title) : undefined,
        });
        isSuccess = true;
      } catch (err: any) {
        deliveryError = err;
        const sanitizedErrorStr = this.sanitizeErrorMessage(err);
        this.logger.error(`Outbox delivery failure for event ${event.id}: ${sanitizedErrorStr}`);
      }

      // STEP 3: Short result update transaction using baseline schema & helpers
      await this.db.transaction(async (client) => {
        if (isSuccess) {
          try {
            await client.query(`SELECT * FROM public.mark_outbox_event_published($1, $2, $3)`, [event.id, workerId, taskName]);
            processed++;
            return;
          } catch {
            // Fallback SQL matching mark_outbox_event_published procedure & outbox_status_state CHECK constraint
          }

          await client.query(
            `UPDATE public.outbox_events
             SET status = 'published',
                 task_name = BTRIM($2),
                 published_at = NOW(),
                 locked_at = NULL,
                 lease_expires_at = NULL,
                 locked_by = NULL,
                 last_error = NULL,
                 updated_at = NOW()
             WHERE id = $1 AND status = 'publishing' AND locked_by = BTRIM($3)`,
            [event.id, taskName, workerId]
          );
          processed++;
        } else {
          const sanitizedErrMsg = this.sanitizeErrorMessage(deliveryError);
          const availableAt = this.calculateNextAvailableAt(event.retry_count);

          try {
            await client.query(`SELECT * FROM public.mark_outbox_event_failed($1, $2, $3, $4)`, [event.id, workerId, sanitizedErrMsg, availableAt]);
            failed++;
            return;
          } catch {
            // Fallback SQL matching mark_outbox_event_failed procedure & outbox_status_state CHECK constraint
          }

          await client.query(
            `UPDATE public.outbox_events
             SET retry_count = retry_count + 1,
                 status = CASE WHEN retry_count + 1 >= max_retries
                               THEN 'dead_letter'::public.outbox_event_status
                               ELSE 'failed'::public.outbox_event_status END,
                 available_at = $4,
                 last_error = LEFT(BTRIM($2), 4000),
                 dead_lettered_at = CASE WHEN retry_count + 1 >= max_retries THEN NOW() ELSE NULL END,
                 locked_at = NULL,
                 lease_expires_at = NULL,
                 locked_by = NULL,
                 task_name = NULL,
                 published_at = NULL,
                 updated_at = NOW()
             WHERE id = $1 AND status = 'publishing' AND locked_by = BTRIM($3)`,
            [event.id, sanitizedErrMsg, workerId, availableAt]
          );
          failed++;
        }
      });
    }

    return { processed, failed };
  }
}
