import { CloudTasksPublisher } from './cloud-tasks.publisher';
import { AppConfigService } from '../config/app-config.service';
import { TaskPublishRequest } from './task-publisher.interface';

// Mock the @google-cloud/tasks module
jest.mock('@google-cloud/tasks', () => {
  const mockCreateTask = jest.fn();
  return {
    CloudTasksClient: jest.fn().mockImplementation(() => ({
      createTask: mockCreateTask,
    })),
    __mockCreateTask: mockCreateTask,
  };
});

function getMockCreateTask() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('@google-cloud/tasks').__mockCreateTask as jest.Mock;
}

function cloudTasksConfig(): AppConfigService {
  const original = process.env;
  process.env = {
    ...original,
    NODE_ENV: 'development',
    PORT: '3000',
    DATABASE_URL: 'postgres://user:pass@localhost:5432/test',
    DISPATCH_MODE: 'cloud_tasks',
    WEBHOOK_SECRET: 'test-secret',
    FASTAPI_WORKER_URL: 'https://abc123.ngrok-free.app',
    GCP_PROJECT_ID: 'binay-job-portal-dev-2026',
    GCP_LOCATION: 'asia-south1',
    GCP_SERVICE_ACCOUNT_EMAIL: 'dispatcher@binay-job-portal-dev-2026.iam.gserviceaccount.com',
  };
  const config = new AppConfigService();
  process.env = original;
  return config;
}

function request(overrides: Partial<TaskPublishRequest> = {}): TaskPublishRequest {
  return {
    eventId: 'f1a2b3c4-5678-90ab-cdef-1234567890ab',
    taskName: 'task-abc123def456',
    queue: 'ai-heavy-queue',
    urlPath: '/internal/tasks/resume/parse',
    payload: {
      schema_version: 1,
      event_id: 'f1a2b3c4-5678-90ab-cdef-1234567890ab',
      aggregate_id: 'b1a2c3d4-5678-90ab-cdef-1234567890ab',
      trace_id: '11a2b3c4-5678-90ab-cdef-1234567890ab',
    },
    ...overrides,
  };
}

describe('CloudTasksPublisher', () => {
  let publisher: CloudTasksPublisher;
  let mockCreateTask: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    publisher = new CloudTasksPublisher(cloudTasksConfig());
    mockCreateTask = getMockCreateTask();
  });

  it('creates a task with the correct parent, name, and OIDC token', async () => {
    mockCreateTask.mockResolvedValueOnce([{}]);

    const result = await publisher.publish(request());

    expect(result).toEqual({ outcome: 'created' });
    expect(mockCreateTask).toHaveBeenCalledTimes(1);

    const callArgs = mockCreateTask.mock.calls[0][0];
    expect(callArgs.parent).toBe(
      'projects/binay-job-portal-dev-2026/locations/asia-south1/queues/ai-heavy-queue',
    );
    expect(callArgs.task.name).toContain('/tasks/task-abc123def456');
    expect(callArgs.task.httpRequest.httpMethod).toBe('POST');
    expect(callArgs.task.httpRequest.url).toBe(
      'https://abc123.ngrok-free.app/internal/tasks/resume/parse',
    );
    expect(callArgs.task.httpRequest.oidcToken.serviceAccountEmail).toBe(
      'dispatcher@binay-job-portal-dev-2026.iam.gserviceaccount.com',
    );
    expect(callArgs.task.httpRequest.oidcToken.audience).toBe(
      'https://abc123.ngrok-free.app',
    );
  });

  it('base64 encodes the task payload body', async () => {
    mockCreateTask.mockResolvedValueOnce([{}]);
    const req = request();

    await publisher.publish(req);

    const callArgs = mockCreateTask.mock.calls[0][0];
    const decodedBody = JSON.parse(
      Buffer.from(callArgs.task.httpRequest.body, 'base64').toString('utf-8'),
    );
    expect(decodedBody).toEqual(req.payload);
  });

  it('sets dispatch deadline to 30 minutes by default', async () => {
    mockCreateTask.mockResolvedValueOnce([{}]);

    await publisher.publish(request());

    const callArgs = mockCreateTask.mock.calls[0][0];
    expect(callArgs.task.dispatchDeadline.seconds).toBe(1800);
  });

  it('returns alreadyExists when Cloud Tasks returns gRPC code 6', async () => {
    const alreadyExistsError = Object.assign(new Error('Task already exists'), { code: 6 });
    mockCreateTask.mockRejectedValueOnce(alreadyExistsError);

    const result = await publisher.publish(request());

    expect(result).toEqual({ outcome: 'alreadyExists' });
  });

  it('returns error with classified gRPC code for PERMISSION_DENIED', async () => {
    const permError = Object.assign(
      new Error('Caller does not have permission'),
      { code: 7 },
    );
    mockCreateTask.mockRejectedValueOnce(permError);

    const result = await publisher.publish(request());

    expect(result.outcome).toBe('error');
    if (result.outcome === 'error') {
      expect(result.statusCode).toBe(403);
      expect(result.code).toBe('7');
    }
  });

  it('returns error for UNAVAILABLE (gRPC 14 → HTTP 503)', async () => {
    const unavailableError = Object.assign(
      new Error('Service unavailable'),
      { code: 14 },
    );
    mockCreateTask.mockRejectedValueOnce(unavailableError);

    const result = await publisher.publish(request());

    expect(result.outcome).toBe('error');
    if (result.outcome === 'error') {
      expect(result.statusCode).toBe(503);
    }
  });

  it('returns error for RESOURCE_EXHAUSTED (gRPC 8 → HTTP 429)', async () => {
    const rateLimitError = Object.assign(
      new Error('Rate limit exceeded'),
      { code: 8 },
    );
    mockCreateTask.mockRejectedValueOnce(rateLimitError);

    const result = await publisher.publish(request());

    expect(result.outcome).toBe('error');
    if (result.outcome === 'error') {
      expect(result.statusCode).toBe(429);
    }
  });

  it('throws at construction if DISPATCH_MODE is not cloud_tasks', () => {
    const original = process.env;
    process.env = {
      ...original,
      NODE_ENV: 'development',
      PORT: '3000',
      DATABASE_URL: 'postgres://user:pass@localhost:5432/test',
      DISPATCH_MODE: 'direct',
      WEBHOOK_SECRET: 'test-secret',
      FASTAPI_WORKER_URL: 'http://127.0.0.1:8080',
    };
    const config = new AppConfigService();
    process.env = original;

    expect(() => new CloudTasksPublisher(config)).toThrow(
      'CloudTasksPublisher requires DISPATCH_MODE=cloud_tasks',
    );
  });

  it('throws at construction if GCP_PROJECT_ID is missing', () => {
    const original = process.env;
    process.env = {
      ...original,
      NODE_ENV: 'development',
      PORT: '3000',
      DATABASE_URL: 'postgres://user:pass@localhost:5432/test',
      DISPATCH_MODE: 'cloud_tasks',
      WEBHOOK_SECRET: 'test-secret',
      FASTAPI_WORKER_URL: 'https://abc123.ngrok-free.app',
      GCP_LOCATION: 'asia-south1',
      GCP_SERVICE_ACCOUNT_EMAIL: 'dispatcher@test.iam.gserviceaccount.com',
    };

    expect(() => new AppConfigService()).toThrow(/GCP_PROJECT_ID/);
    process.env = original;
  });
});
