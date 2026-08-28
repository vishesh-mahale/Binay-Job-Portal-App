import { Injectable, Optional } from '@nestjs/common';

/**
 * Typed event route registry (plan Section 9).
 *
 * Phase 1: 3 contracted producer events (resume.parse, candidate.projection, job.enrich).
 * Phase 2: additional request routes whose consumers are explicitly approved.
 *
 * Queue names are the approved ones (`ai-heavy-queue`, `projection-queue`,
 * `notification-queue` is provision-only). Security scanning uses a dedicated
 * `security-scan-queue` (Phase 2). Endpoint paths are registered only after
 * their consumer implementation is verified. Output events are not registered
 * as dispatcher input routes.
 *
 * NOT registered (unresolved — Gate G-1/G-5): notification.email.requested (OD-3).
 * Unknown event types are handled fail-closed by the dispatcher, never silently skipped.
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
export const SECURITY_SCAN_QUEUE = 'security-scan-queue';

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

/**
 * Phase 2 request routes. A route is registered only with an approved task
 * contract and consumer implementation.
 */
export const PHASE_2_ROUTES: readonly EventRoute[] = [
  {
    eventType: 'match.analyze.requested',
    queue: AI_HEAVY_QUEUE,
    urlPath: '/internal/tasks/match/analyze',
    taskContract: 'contracts/tasks/match-analyze-task.v1.json',
  },
  {
    eventType: 'interview.summary.requested',
    queue: AI_HEAVY_QUEUE,
    urlPath: '/internal/tasks/interview/summary',
    taskContract: 'contracts/tasks/interview-summary-task.v1.json',
  },
  {
    eventType: 'job.screening_questions.requested',
    queue: AI_HEAVY_QUEUE,
    urlPath: '/internal/tasks/job/screening-questions',
    taskContract: 'contracts/tasks/job-screening-questions-task.v1.json',
  },
  {
    eventType: 'security.scan.requested',
    queue: SECURITY_SCAN_QUEUE,
    urlPath: '/internal/tasks/security/scan',
    taskContract: 'contracts/tasks/security-scan-task.v1.json',
  },
] as const;

/** All contracted routes (Phase 1 + Phase 2). */
export const ALL_ROUTES: readonly EventRoute[] = [...PHASE_1_ROUTES, ...PHASE_2_ROUTES] as const;

@Injectable()
export class EventRouteRegistry {
  private readonly routes: ReadonlyMap<string, EventRoute>;

  constructor(@Optional() routes: readonly EventRoute[] = ALL_ROUTES) {
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
