import { TaskPayloadV1 } from '../routing/payload.builder';

/**
 * TaskPublisher abstraction (plan Sections 2 + 18).
 *
 * This interface is THE seam between local mode and production:
 *   - DirectHttpPublisher   (DISPATCH_MODE=direct)     — Phase 1
 *   - CloudTasksPublisher   (DISPATCH_MODE=cloud_tasks) — future integration
 *
 * Both share the same route registry, payload builder, deterministic task
 * names and dispatcher domain logic — production logic is never duplicated.
 */

export interface TaskPublishRequest {
  /** Outbox event id (idempotency key for the worker). */
  eventId: string;
  /** Deterministic task name: task-{sha256hex(event_id + ":" + route_key)}. */
  taskName: string;
  /** Approved queue name (diagnostic in direct mode, real in cloud_tasks). */
  queue: string;
  /** Worker endpoint path — route_key. */
  urlPath: string;
  /** Uniform task payload v1 (UUIDs only). */
  payload: TaskPayloadV1;
}

export type TaskPublishOutcome =
  | { outcome: 'created' }
  | { outcome: 'alreadyExists' }
  | {
      outcome: 'error';
      statusCode?: number;
      code?: string;
      message?: string;
      isNetworkError?: boolean;
      isTimeout?: boolean;
    };

export interface TaskPublisher {
  publish(request: TaskPublishRequest): Promise<TaskPublishOutcome>;
}

export const TASK_PUBLISHER = Symbol('TASK_PUBLISHER');
