import { EventRouteRegistry, PHASE_1_ROUTES, PHASE_2_ROUTES, ALL_ROUTES } from './event-route.registry';
import { buildTaskPayload } from './payload.builder';
import { OutboxEvent } from '../database/outbox.types';

describe('EventRouteRegistry (Phase 1 + Phase 2)', () => {
  const registry = new EventRouteRegistry();

  it('registers exactly 7 contracted input events (3 Phase 1 + 4 Phase 2)', () => {
    expect(registry.registeredEventTypes().sort()).toEqual(
      [
        'candidate.profile.changed',
        'interview.summary.requested',
        'job.ai.enrichment.requested',
        'job.screening_questions.requested',
        'match.analyze.requested',
        'resume.parse.requested',
        'security.scan.requested',
      ].sort(),
    );
  });

  it('routes resume.parse.requested to ai-heavy-queue + verified worker path', () => {
    const route = registry.resolve('resume.parse.requested');
    expect(route).toBeDefined();
    expect(route?.queue).toBe('ai-heavy-queue');
    expect(route?.urlPath).toBe('/internal/tasks/resume/parse');
  });

  it('routes candidate.profile.changed to projection-queue', () => {
    const route = registry.resolve('candidate.profile.changed');
    expect(route?.queue).toBe('projection-queue');
    expect(route?.urlPath).toBe('/internal/tasks/candidate/projection');
  });

  it('routes job.ai.enrichment.requested to ai-heavy-queue', () => {
    const route = registry.resolve('job.ai.enrichment.requested');
    expect(route?.queue).toBe('ai-heavy-queue');
    expect(route?.urlPath).toBe('/internal/tasks/job/enrich');
  });

  it('returns undefined for unknown event types (caller fails closed)', () => {
    expect(registry.resolve('notification.email.requested')).toBeUndefined();
    expect(registry.resolve('application.submitted')).toBeUndefined();
    expect(registry.resolve('')).toBeUndefined();
  });

  it('every Phase 1 route references a task contract file', () => {
    for (const route of PHASE_1_ROUTES) {
      expect(route.taskContract).toMatch(/^contracts\/tasks\/.+\.v1\.json$/);
    }
  });

  it('Phase 2 routes resolve to verified FastAPI endpoints', () => {
    const match = registry.resolve('match.analyze.requested');
    expect(match?.queue).toBe('ai-heavy-queue');
    expect(match?.urlPath).toBe('/internal/tasks/match/analyze');

    const interview = registry.resolve('interview.summary.requested');
    expect(interview?.urlPath).toBe('/internal/tasks/interview/summary');

    const screening = registry.resolve('job.screening_questions.requested');
    expect(screening?.urlPath).toBe('/internal/tasks/job/screening-questions');

    const scan = registry.resolve('security.scan.requested');
    expect(scan?.queue).toBe('security-scan-queue');
    expect(scan?.urlPath).toBe('/internal/tasks/security/scan');
    expect(scan?.taskContract).toBe('contracts/tasks/security-scan-task.v1.json');
  });

  it('ALL_ROUTES contains Phase 1 + Phase 2', () => {
    expect(ALL_ROUTES.length).toBe(PHASE_1_ROUTES.length + PHASE_2_ROUTES.length);
    expect(ALL_ROUTES.length).toBe(7);
  });
});

function fixture(overrides: Partial<OutboxEvent> = {}): OutboxEvent {
  const now = new Date('2026-08-21T00:00:00Z');
  return {
    id: '11111111-1111-4111-8111-111111111111',
    aggregate_type: 'resume',
    aggregate_id: '22222222-2222-4222-8222-222222222222',
    event_type: 'resume.parse.requested',
    schema_version: 1,
    payload: {},
    correlation_id: null,
    causation_id: null,
    occurred_at: now,
    status: 'publishing',
    available_at: now,
    locked_at: now,
    lease_expires_at: now,
    locked_by: 'worker',
    task_name: null,
    published_at: null,
    dead_lettered_at: null,
    retry_count: 0,
    max_retries: 10,
    last_error: null,
    updated_at: now,
    ...overrides,
  };
}

describe('buildTaskPayload (uniform task payload v1)', () => {
  it('emits only the four contract fields from row columns', () => {
    const event = fixture();
    expect(buildTaskPayload(event)).toEqual({
      schema_version: 1,
      event_id: event.id,
      aggregate_id: event.aggregate_id,
      trace_id: event.id, // correlation_id null → falls back to event id
    });
  });

  it('uses correlation_id as trace_id when present', () => {
    const event = fixture({ correlation_id: '33333333-3333-4333-8333-333333333333' });
    expect(buildTaskPayload(event).trace_id).toBe(event.correlation_id);
  });

  it('never leaks outbox payload content into the task payload', () => {
    const event = fixture({ payload: { resume_text: 'SHOULD NEVER TRAVEL' } });
    const payload = buildTaskPayload(event);
    expect(Object.keys(payload).sort()).toEqual([
      'aggregate_id',
      'event_id',
      'schema_version',
      'trace_id',
    ]);
    expect(JSON.stringify(payload)).not.toContain('SHOULD NEVER TRAVEL');
  });
});
