import { AppConfigService } from '../config/app-config.service';
import { OutboxRepository } from '../database/outbox.repository';
import { OutboxEvent } from '../database/outbox.types';
import { EventRouteRegistry } from '../routing/event-route.registry';
import { deterministicTaskName } from '../publishing/task-name';
import { TaskPublisher } from '../publishing/task-publisher.interface';
import { DispatcherService } from './dispatcher.service';

/**
 * Dispatcher core behavior: single-flight, pending-wake latch, bounded drain,
 * fail-closed routing, DB-owned state transitions.
 */

function configStub(overrides: Partial<Record<string, unknown>> = {}): AppConfigService {
  return {
    workerId: 'worker-test',
    claimBatchSize: 50,
    claimLeaseSeconds: 300,
    drainMaxBatches: 5,
    drainRequestBudgetMs: 240_000,
    ...overrides,
  } as unknown as AppConfigService;
}

interface RepoStub {
  claimEvents: jest.Mock;
  markPublished: jest.Mock;
  markFailed: jest.Mock;
  recoveryNeeded: jest.Mock;
}

function repoStub(): RepoStub {
  return {
    claimEvents: jest.fn().mockResolvedValue([]),
    markPublished: jest.fn().mockResolvedValue({}),
    markFailed: jest.fn().mockResolvedValue({}),
    recoveryNeeded: jest.fn().mockResolvedValue(false),
  };
}

function eventFixture(overrides: Partial<OutboxEvent> = {}): OutboxEvent {
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
    locked_by: 'worker-test',
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

function makeService(opts: {
  config?: AppConfigService;
  repo?: RepoStub;
  publisher?: TaskPublisher;
  registry?: EventRouteRegistry;
}) {
  const repo = opts.repo ?? repoStub();
  const service = new DispatcherService(
    opts.config ?? configStub(),
    repo as unknown as OutboxRepository,
    opts.registry ?? new EventRouteRegistry(),
    opts.publisher ?? { publish: jest.fn().mockResolvedValue({ outcome: 'created' }) },
  );
  return { service, repo };
}

describe('DispatcherService.wake — basic drain', () => {
  it('returns accepted with zero counters on an empty queue', async () => {
    const { service, repo } = makeService({});
    const response = await service.wake('test');
    expect(response).toMatchObject({ accepted: true, claimed: 0, published: 0, failed: 0 });
    expect(repo.claimEvents).toHaveBeenCalledWith('worker-test', 50, 300);
  });

  it('publishes a known event and marks it published with the deterministic task name', async () => {
    const event = eventFixture();
    const repo = repoStub();
    repo.claimEvents.mockResolvedValueOnce([event]).mockResolvedValue([]);
    const publish = jest.fn().mockResolvedValue({ outcome: 'created' });
    const { service } = makeService({ repo, publisher: { publish } });

    const response = await service.wake('test');

    expect(response).toMatchObject({ accepted: true, claimed: 1, published: 1, failed: 0 });
    expect(publish).toHaveBeenCalledTimes(1);
    const request = publish.mock.calls[0][0];
    expect(request.taskName).toBe(deterministicTaskName(event.id, '/internal/tasks/resume/parse'));
    expect(request.queue).toBe('ai-heavy-queue');
    expect(request.payload).toEqual({
      schema_version: 1,
      event_id: event.id,
      aggregate_id: event.aggregate_id,
      trace_id: event.id,
    });
    expect(repo.markPublished).toHaveBeenCalledWith(event.id, 'worker-test', request.taskName);
    expect(repo.markFailed).not.toHaveBeenCalled();
  });

  it('treats ALREADY_EXISTS as success and still marks published', async () => {
    const event = eventFixture();
    const repo = repoStub();
    repo.claimEvents.mockResolvedValueOnce([event]).mockResolvedValue([]);
    const { service } = makeService({
      repo,
      publisher: { publish: jest.fn().mockResolvedValue({ outcome: 'alreadyExists' }) },
    });

    const response = await service.wake('test');

    expect(response).toMatchObject({ published: 1, failed: 0 });
    expect(repo.markPublished).toHaveBeenCalledTimes(1);
  });

  it('fails closed on unknown event types without calling the publisher', async () => {
    const event = eventFixture({ event_type: 'match.analyze.requested' });
    const repo = repoStub();
    repo.claimEvents.mockResolvedValueOnce([event]).mockResolvedValue([]);
    const publish = jest.fn();
    const { service } = makeService({ repo, publisher: { publish } });

    const response = await service.wake('test');

    expect(response).toMatchObject({ claimed: 1, published: 0, failed: 1 });
    expect(publish).not.toHaveBeenCalled();
    expect(repo.markFailed).toHaveBeenCalledTimes(1);
    const [eventId, worker, error, availableAt] = repo.markFailed.mock.calls[0];
    expect(eventId).toBe(event.id);
    expect(worker).toBe('worker-test');
    expect(error).toBe('unknown_route:match.analyze.requested');
    expect(availableAt).toBeInstanceOf(Date);
    expect(availableAt.getTime()).toBeGreaterThan(Date.now() - 1000);
  });

  it('marks failed with error class prefix and backoff availability on publish error', async () => {
    const event = eventFixture({ retry_count: 2 });
    const repo = repoStub();
    repo.claimEvents.mockResolvedValueOnce([event]).mockResolvedValue([]);
    const { service } = makeService({
      repo,
      publisher: {
        publish: jest.fn().mockResolvedValue({ outcome: 'error', statusCode: 503, message: 'boom' }),
      },
    });

    const response = await service.wake('test');

    expect(response).toMatchObject({ published: 0, failed: 1 });
    const [eventId, , error, availableAt] = repo.markFailed.mock.calls[0];
    expect(eventId).toBe(event.id);
    expect(error).toBe('transient_server: boom');
    expect(availableAt.getTime()).toBeGreaterThan(Date.now());
    expect(repo.markPublished).not.toHaveBeenCalled();
  });

  it('counts lease-loss on mark_published as failed without crashing', async () => {
    const event = eventFixture();
    const repo = repoStub();
    repo.claimEvents.mockResolvedValueOnce([event]).mockResolvedValue([]);
    repo.markPublished.mockRejectedValue(new Error('not publishing under this worker lease'));
    const { service } = makeService({ repo });

    const response = await service.wake('test');

    expect(response).toMatchObject({ claimed: 1, published: 0, failed: 1 });
  });
});

describe('single-flight + pending-wake latch', () => {
  it('queues a concurrent wake instead of running a second drain', async () => {
    const repo = repoStub();
    let releaseClaim!: () => void;
    repo.claimEvents.mockImplementationOnce(
      () => new Promise<OutboxEvent[]>((resolve) => { releaseClaim = () => resolve([]); }),
    );
    const { service } = makeService({ repo });

    const first = service.wake('outer');
    // Let the first wake reach the claim await.
    await new Promise((resolve) => setImmediate(resolve));
    expect(service.isDispatchRunning).toBe(true);

    const second = await service.wake('during-drain');
    expect(second).toEqual({ accepted: true, reason: 'queued_pending_wake' });

    releaseClaim();
    repo.claimEvents.mockResolvedValue([]);
    const firstResult = await first;
    expect(firstResult).toMatchObject({ accepted: true, claimed: 0 });
  });

  it('a wake arriving DURING drain triggers another drain iteration (latch)', async () => {
    const event = eventFixture();
    const repo = repoStub();
    repo.claimEvents.mockResolvedValueOnce([event]).mockResolvedValue([]);

    let service: DispatcherService;
    let innerWakeFired = false;
    const publisher: TaskPublisher = {
      publish: jest.fn().mockImplementation(async () => {
        if (!innerWakeFired) {
          innerWakeFired = true;
          const inner = await service.wake('webhook-during-drain');
          expect(inner).toEqual({ accepted: true, reason: 'queued_pending_wake' });
        }
        return { outcome: 'created' };
      }),
    };

    ({ service } = makeService({ repo, publisher }));
    const response = await service.wake('outer');

    // Without the latch the inner wake would be discarded and only one
    // drain iteration (single claim) would run.
    expect(response).toMatchObject({ accepted: true, claimed: 1, published: 1 });
    expect((response as { iterations: number }).iterations).toBe(2);
    expect(repo.claimEvents).toHaveBeenCalledTimes(2);
  });

  it('continues draining when the last batch was full (work remaining)', async () => {
    const repo = repoStub();
    repo.claimEvents
      .mockResolvedValueOnce([eventFixture()])
      .mockResolvedValueOnce([eventFixture({ id: '99999999-9999-4999-8999-999999999999' })])
      .mockResolvedValue([]);
    const { service } = makeService({ repo, config: configStub({ claimBatchSize: 1 }) });

    const response = await service.wake('test');

    expect(response).toMatchObject({ accepted: true, claimed: 2, published: 2, failed: 0 });
    expect((response as { iterations: number }).iterations).toBeGreaterThanOrEqual(2);
  });

  it('honors DRAIN_MAX_BATCHES inside one bounded drain iteration', async () => {
    const repo = repoStub();
    repo.claimEvents.mockResolvedValue([eventFixture()]); // always full
    let now = 0;
    const { service } = makeService({
      repo,
      config: configStub({ claimBatchSize: 1, drainMaxBatches: 2, drainRequestBudgetMs: 5000 }),
    });
    // Exhaust the budget at the first loop check so exactly one iteration runs.
    service.nowMs = () => { now += 10_000; return now; };

    const response = await service.wake('test');

    expect(repo.claimEvents).toHaveBeenCalledTimes(2); // bounded at 2 batches
    expect(response).toMatchObject({ accepted: true, claimed: 2 });
    expect((response as { budget_exhausted: boolean }).budget_exhausted).toBe(true);
  });

  it('stops looping when the request budget is exhausted', async () => {
    const repo = repoStub();
    repo.claimEvents.mockResolvedValue([eventFixture()]); // never drains
    let now = 0;
    const { service } = makeService({
      repo,
      config: configStub({ claimBatchSize: 1, drainRequestBudgetMs: 2000 }),
    });
    service.nowMs = () => { now += 3000; return now; };

    const response = await service.wake('test');

    expect((response as { iterations: number }).iterations).toBe(1);
    expect((response as { budget_exhausted: boolean }).budget_exhausted).toBe(true);
    expect(service.isDispatchRunning).toBe(false);
  });
});
