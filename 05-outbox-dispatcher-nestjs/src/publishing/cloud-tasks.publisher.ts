import { CloudTasksClient, protos } from '@google-cloud/tasks';
import { AppConfigService } from '../config/app-config.service';
import { classifyError } from '../common/errors';
import { createLogger, StructuredLogger } from '../observability/logger';
import { TaskPublishOutcome, TaskPublishRequest, TaskPublisher } from './task-publisher.interface';

// Mapping from standard gRPC status codes to HTTP status codes
const GRPC_TO_HTTP_STATUS: Record<number, number> = {
  3: 400, // INVALID_ARGUMENT
  4: 504, // DEADLINE_EXCEEDED
  5: 404, // NOT_FOUND
  6: 409, // ALREADY_EXISTS
  7: 403, // PERMISSION_DENIED
  8: 429, // RESOURCE_EXHAUSTED
  14: 503, // UNAVAILABLE
  16: 401, // UNAUTHENTICATED
};

/**
 * Production / Hybrid Cloud Tasks publisher (DISPATCH_MODE=cloud_tasks).
 *
 * Uses @google-cloud/tasks to create deterministic tasks in Google Cloud Tasks queues.
 *
 * - Deterministic Task ID: task-{sha256hex(event_id + ":" + route_key)}
 * - Idempotency: Treats ALREADY_EXISTS (gRPC code 6 / HTTP 409) as a successful publish.
 * - OIDC Security: Attaches signed Google OIDC token if service account is configured.
 * - Long AI Deadline: Sets dispatchDeadline to 1800s (30 minutes) for heavy LLM operations.
 */
export class CloudTasksPublisher implements TaskPublisher {
  private readonly logger: StructuredLogger = createLogger('cloud-tasks-publisher');
  private readonly client: CloudTasksClient;
  private readonly projectId: string;
  private readonly location: string;
  private readonly baseUrl: string;

  constructor(private readonly config: AppConfigService) {
    if (!config.isCloudTasksMode) {
      throw new Error('CloudTasksPublisher requires DISPATCH_MODE=cloud_tasks');
    }
    if (!config.gcpProjectId) {
      throw new Error('CloudTasksPublisher requires GCP_PROJECT_ID');
    }

    this.client = new CloudTasksClient();
    this.projectId = config.gcpProjectId;
    this.location = config.gcpLocation ?? 'asia-south1';
    this.baseUrl = (config.fastapiWorkerUrl ?? '').replace(/\/$/, '');
  }

  async publish(request: TaskPublishRequest): Promise<TaskPublishOutcome> {
    const parent = `projects/${this.projectId}/locations/${this.location}/queues/${request.queue}`;
    const fullTaskName = `${parent}/tasks/${request.taskName}`;
    const targetUrl = `${this.baseUrl}${request.urlPath}`;

    const httpRequest: protos.google.cloud.tasks.v2.IHttpRequest = {
      httpMethod: 'POST',
      url: targetUrl,
      headers: {
        'Content-Type': 'application/json',
      },
      body: Buffer.from(JSON.stringify(request.payload)).toString('base64'),
    };

    // Attach OIDC token if configured (for private Cloud Run)
    if (this.config.dispatcherServiceAccountEmail) {
      httpRequest.oidcToken = {
        serviceAccountEmail: this.config.dispatcherServiceAccountEmail,
        audience: this.config.fastapiWorkerOidcAudience ?? this.baseUrl,
      };
    }

    try {
      await this.client.createTask({             // Actual Cloud Tasks API call
        parent,
        task: {
          name: fullTaskName,
          httpRequest,
          dispatchDeadline: {
            seconds: 1800, // 30 minutes
          },
        },
      });

      this.logger.debug('cloud task created', {
        event_id: request.eventId,
        task_name: request.taskName,
        queue: request.queue,
      });

      return { outcome: 'created' };
    } catch (err: unknown) {
      const errObj = typeof err === 'object' && err !== null ? (err as Record<string, unknown>) : {};
      const grpcCode = typeof errObj.code === 'number' ? errObj.code : undefined;

      // gRPC error code 6 = ALREADY_EXISTS
      const isAlreadyExists =
        grpcCode === 6 || (err instanceof Error && err.message.includes('ALREADY_EXISTS'));

      if (isAlreadyExists) {
        this.logger.info('cloud task already exists (deduplicated)', {
          event_id: request.eventId,
          task_name: request.taskName,
          queue: request.queue,
        });
        return { outcome: 'alreadyExists' };
      }

      const statusCode = grpcCode ? GRPC_TO_HTTP_STATUS[grpcCode] : undefined;
      const message = err instanceof Error ? err.message : String(err);
      const classified = classifyError({
        statusCode,
        code: grpcCode !== undefined ? String(grpcCode) : undefined,
        message,
      });

      this.logger.warn('cloud task creation failed', {
        event_id: request.eventId,
        task_name: request.taskName,
        queue: request.queue,
        error_class: classified.errorClass,
        message: classified.sanitizedMessage,
      });

      return {
        outcome: 'error',
        statusCode,
        code: grpcCode !== undefined ? String(grpcCode) : undefined,
        message: classified.sanitizedMessage,
      };
    }
  }
}
