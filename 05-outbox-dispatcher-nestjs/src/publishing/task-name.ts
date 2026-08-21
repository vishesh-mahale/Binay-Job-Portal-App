import { createHash } from 'node:crypto';

/**
 * Deterministic task identity (plan Section 8).
 *
 *   taskName = "task-" + sha256hex(event_id + ":" + route_key)
 *
 * - route_key is the worker endpoint path (e.g. /internal/tasks/resume/parse),
 *   matching the approved `sha256(event_id + route)` formula.
 * - sha256 hex keeps the name charset-safe (aggregate_type may contain
 *   dots/underscores which are invalid in Cloud Tasks task IDs).
 * - Same (event_id, route) always yields the same name, so duplicate creates
 *   surface as ALREADY_EXISTS which the dispatcher treats as success.
 */
const TASK_NAME_PREFIX = 'task-';

export function deterministicTaskName(eventId: string, routeKey: string): string {
  if (!eventId || !routeKey) {
    throw new Error('deterministicTaskName requires eventId and routeKey');
  }
  const digest = createHash('sha256').update(`${eventId}:${routeKey}`).digest('hex');
  return `${TASK_NAME_PREFIX}${digest}`;
}
