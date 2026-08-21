import { EventRouteRegistry, PHASE_1_ROUTES } from './event-route.registry';
import { buildTaskPayload } from './payload.builder';
import { OutboxEvent } from '../database/outbox.types';

describe('EventRouteRegistry (Phase 1)', () => {
  const registry = new EventRouteRegistry();

  it('registers exactly the three contracted producer events', () => {
    expect(registry.registeredEventTypes().sort()).toEqual(
      [
        'candidate.profile.changed',
        'job.ai.enrichment.requested',
        'resume.parse.requested',
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
    expect(registry.resolve('match.analyze.requested')).toBeUndefined();
    expect(registry.resolve('security.scan.requested')).toBeUndefined();
    expect(registry.resolve('')).toBeUndefined();
  });

  it('every route references a contract file (traceability)', () => {
    for (const route of PHASE_1_ROUTES) {
      expect(route.taskContract).toMatch(/^contracts\/tasks\/.+\.v1\.json$/);
    }
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
