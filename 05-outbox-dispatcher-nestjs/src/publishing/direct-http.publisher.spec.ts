import { AppConfigService } from '../config/app-config.service';
import { DirectHttpPublisher } from './direct-http.publisher';
import { TaskPublishRequest } from './task-publisher.interface';

/**
 * DirectHttpPublisher — local mode. Uses global fetch (mocked here); the
 * in-memory task-name Set simulates Cloud Tasks ALREADY_EXISTS.
 */

function configStub(overrides: Partial<{ isDirectMode: boolean; fastapiWorkerUrl?: string }> = {}) {
  return {
    isDirectMode: true,
    fastapiWorkerUrl: 'http://worker:8000',
    ...overrides,
  } as AppConfigService;
}

function publishRequest(overrides: Partial<TaskPublishRequest> = {}): TaskPublishRequest {
  return {
    eventId: '11111111-1111-4111-8111-111111111111',
    taskName: 'task-abc',
    queue: 'ai-heavy-queue',
    urlPath: '/internal/tasks/resume/parse',
    payload: {
      schema_version: 1,
      event_id: '11111111-1111-4111-8111-111111111111',
      aggregate_id: '22222222-2222-4222-8222-222222222222',
      trace_id: '11111111-1111-4111-8111-111111111111',
    },
    ...overrides,
  };
}

describe('DirectHttpPublisher', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('refuses to construct outside direct mode', () => {
    expect(() => new DirectHttpPublisher(configStub({ isDirectMode: false }))).toThrow(
      /DISPATCH_MODE=direct/,
    );
  });

  it('refuses to construct without FASTAPI_WORKER_URL', () => {
    expect(() => new DirectHttpPublisher(configStub({ fastapiWorkerUrl: undefined }))).toThrow(
      /FASTAPI_WORKER_URL/,
    );
  });

  it('POSTs the payload v1 to base + urlPath and reports created', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as never;
    const publisher = new DirectHttpPublisher(configStub());

    const outcome = await publisher.publish(publishRequest());

    expect(outcome).toEqual({ outcome: 'created' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('http://worker:8000/internal/tasks/resume/parse');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toMatchObject({ schema_version: 1 });
  });

  it('returns alreadyExists for a repeated task name without re-POSTing', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as never;
    const publisher = new DirectHttpPublisher(configStub());

    await publisher.publish(publishRequest());
    const second = await publisher.publish(publishRequest());

    expect(second).toEqual({ outcome: 'alreadyExists' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(publisher.deliveredTaskCount()).toBe(1);
  });

  it('classifies HTTP error responses into an error outcome', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      text: async () => 'worker overloaded',
    }) as never;
    const publisher = new DirectHttpPublisher(configStub());

    const outcome = await publisher.publish(publishRequest());

    expect(outcome.outcome).toBe('error');
    if (outcome.outcome === 'error') {
      expect(outcome.statusCode).toBe(503);
      expect(outcome.message).toContain('503');
    }
    // Failed delivery must NOT register the task name for dedupe.
    expect(publisher.deliveredTaskCount()).toBe(0);
  });

  it('classifies network failures as transient_network', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('fetch failed')) as never;
    const publisher = new DirectHttpPublisher(configStub());

    const outcome = await publisher.publish(publishRequest());

    expect(outcome).toMatchObject({ outcome: 'error', isNetworkError: true });
  });

  it('classifies abort timeouts as transient_deadline', async () => {
    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    global.fetch = jest.fn().mockRejectedValue(timeout) as never;
    const publisher = new DirectHttpPublisher(configStub());

    const outcome = await publisher.publish(publishRequest());

    expect(outcome).toMatchObject({ outcome: 'error', isTimeout: true });
  });

  it('strips a trailing slash from the base URL', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as never;
    const publisher = new DirectHttpPublisher(configStub({ fastapiWorkerUrl: 'http://worker:8000/' }));

    await publisher.publish(publishRequest());

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('http://worker:8000/internal/tasks/resume/parse');
  });
});
