import { Injectable, Optional } from '@nestjs/common';

/**
 * Typed event route registry (plan Section 9).
 *
 * Phase 1 contains ONLY the three contracted producer events. Queue names are
 * the approved ones (`ai-heavy-queue`, `projection-queue`, `notification-queue`
 * is provision-only). Endpoint paths verified against
 * 07-fastapi-ai-worker/app/api/v1/task_handlers.py.
 *
 * NOT registered (unresolved — Gates G-1/G-5): match.analyze.requested,
 * interview.summary.requested, job.screening_questions.requested,
 * security.scan.requested, notification.email.requested. Unknown event types
 * are handled fail-closed by the dispatcher, never silently skipped.
 */

export interface EventRoute {
  /** Exact `outbox_events.event_type` value (DB CHECK: lower snake/dot/dash). */
  readonly eventType: string;
  /** Approved Cloud Tasks queue name. */
  readonly queue: string;
  /** FastAPI worker endpoint path (route_key for deterministic task names). */
  readonly urlPath: string;
  /** Contract reference for traceability (contracts/ root). */
  readonly taskContract: string;
}

export const AI_HEAVY_QUEUE = 'ai-heavy-queue';
export const PROJECTION_QUEUE = 'projection-queue';
export const NOTIFICATION_QUEUE = 'notification-queue';

export const PHASE_1_ROUTES: readonly EventRoute[] = [
  {
    eventType: 'resume.parse.requested',
    queue: AI_HEAVY_QUEUE,
    urlPath: '/internal/tasks/resume/parse',
    taskContract: 'contracts/tasks/resume-parse-task.v1.json',
  },
  {
    eventType: 'candidate.profile.changed',
    queue: PROJECTION_QUEUE,
    urlPath: '/internal/tasks/candidate/projection',
    taskContract: 'contracts/tasks/candidate-projection-task.v1.json',
  },
  {
    eventType: 'job.ai.enrichment.requested',
    queue: AI_HEAVY_QUEUE,
    urlPath: '/internal/tasks/job/enrich',
    taskContract: 'contracts/tasks/job-enrich-task.v1.json',
  },
] as const;

@Injectable()
export class EventRouteRegistry {
  private readonly routes: ReadonlyMap<string, EventRoute>;

  constructor(@Optional() routes: readonly EventRoute[] = PHASE_1_ROUTES) {
    this.routes = new Map(routes.map((route) => [route.eventType, route]));
  }

  /** Returns undefined for unknown event types — caller MUST fail closed. */
  resolve(eventType: string): EventRoute | undefined {
    return this.routes.get(eventType);
  }

  /** All registered event types (diagnostics/tests). */
  registeredEventTypes(): string[] {
    return [...this.routes.keys()];
  }
}
