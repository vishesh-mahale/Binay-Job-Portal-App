import { OutboxEvent } from '../database/outbox.types';

/**
 * Uniform task payload v1 — identical shape across all six task contracts
 * (contracts/tasks/*.v1.json, additionalProperties:false):
 *
 *   { "schema_version": 1, "event_id": uuid, "aggregate_id": uuid, "trace_id": uuid }
 *
 * Built ONLY from outbox row columns — the dispatcher never reads or parses
 * the outbox `payload` content. No route-specific fields exist (verified).
 */
export interface TaskPayloadV1 {
  schema_version: 1;
  event_id: string;
  aggregate_id: string;
  trace_id: string;
}

export function buildTaskPayload(event: OutboxEvent): TaskPayloadV1 {
  return {
    schema_version: 1,
    event_id: event.id,
    aggregate_id: event.aggregate_id,
    // correlation_id is the trace id; deterministic fallback is the event id.
    trace_id: event.correlation_id ?? event.id,
  };
}
