import { Injectable } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { OutboxEvent } from './outbox.types';

/**
 * Outbox repository — the ONLY database surface of the dispatcher.
 *
 * Governance: NO ad-hoc UPDATE/INSERT/DELETE on outbox_events anywhere in
 * application code. Exactly the four approved SECURITY DEFINER functions
 * from 15_infrastructure.sql are called, fully parameterized:
 *
 *   claim_outbox_events(p_worker_id, p_batch_size, p_lease_seconds)
 *   mark_outbox_event_published(p_event_id, p_worker_id, p_task_name)
 *   mark_outbox_event_failed(p_event_id, p_worker_id, p_error, p_available_at)
 *   outbox_recovery_needed()
 *
 * Lease, retry, stale-recovery and dead-letter semantics are owned by the SQL;
 * this wrapper reproduces none of them in application code.
 */
@Injectable()
export class OutboxRepository {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Claims a bounded batch of due events (short transaction — single statement).
   * Returns rows already transitioned to `publishing` under this worker's lease.
   */
  async claimEvents(workerId: string, batchSize: number, leaseSeconds: number): Promise<OutboxEvent[]> {
    const result = await this.db.query<OutboxEvent>(
      'SELECT * FROM public.claim_outbox_events($1, $2, $3)',
      [workerId, batchSize, leaseSeconds],
    );
    return result.rows;
  }

  /**
   * Publish confirmation. Idempotent for the same (event_id, task_name);
   * raises if the row is not publishing under this worker's lease.
   */
  async markPublished(eventId: string, workerId: string, taskName: string): Promise<OutboxEvent> {
    const result = await this.db.query<OutboxEvent>(
      'SELECT * FROM public.mark_outbox_event_published($1, $2, $3)',
      [eventId, workerId, taskName],
    );
    return result.rows[0];
  }

  /**
   * Failure confirmation with the next backoff time (must be >= NOW()).
   * The function increments retry_count and dead-letters when budget is exhausted.
   */
  async markFailed(eventId: string, workerId: string, error: string, availableAt: Date): Promise<OutboxEvent> {
    const result = await this.db.query<OutboxEvent>(
      'SELECT * FROM public.mark_outbox_event_failed($1, $2, $3, $4)',
      [eventId, workerId, error, availableAt],
    );
    return result.rows[0];
  }

  /**
   * Indexed existence check used by readiness probes and (server-side)
    * Google Cloud Scheduler recovery wakes. True when due pending/failed or stale
   * publishing rows exist.
   */
  async recoveryNeeded(): Promise<boolean> {
    const result = await this.db.query<{ needed: boolean }>(
      'SELECT public.outbox_recovery_needed() AS needed',
      [],
    );
    return result.rows[0]?.needed ?? false;
  }
}
