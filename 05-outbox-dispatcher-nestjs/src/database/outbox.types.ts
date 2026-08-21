/**
 * Typed projection of the `outbox_events` table (15_infrastructure.sql).
 * Column names/types mirror the baseline SQL exactly — nothing invented.
 */

export type OutboxEventStatus = 'pending' | 'publishing' | 'published' | 'failed' | 'dead_letter';

export interface OutboxEvent {
  id: string;

  // Immutable event envelope
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  schema_version: number;
  payload: Record<string, unknown>;
  correlation_id: string | null;
  causation_id: string | null;
  occurred_at: Date;

  // Mutable dispatch state
  status: OutboxEventStatus;
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
  updated_at: Date;
}
