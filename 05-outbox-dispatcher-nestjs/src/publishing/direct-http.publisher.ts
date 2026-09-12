import { AppConfigService } from '../config/app-config.service';
import { classifyError } from '../common/errors';
import { createLogger } from '../observability/logger';
import { TaskPublishOutcome, TaskPublishRequest, TaskPublisher } from './task-publisher.interface';

/**
 * Local/dev publisher (DISPATCH_MODE=direct, plan Sections 17–18).
 *
 * - POSTs the uniform task payload v1 to the local FastAPI worker endpoint.
 * - Uses the SAME deterministic task names as production; an in-memory
 *   Set<taskName> simulates Cloud Tasks ALREADY_EXISTS so the duplicate path
 *   is exercised locally too.
 * - NEVER active in production: env validation rejects DISPATCH_MODE=direct
 *   when NODE_ENV=production.
 */
export class DirectHttpPublisher implements TaskPublisher {
  private readonly logger = createLogger('direct-http-publisher');
  private readonly seenTaskNames = new Set<string>();
  private readonly baseUrl: string;
  private readonly requestTimeoutMs: number;

  constructor(config: AppConfigService, requestTimeoutMs = 30_000) {
    if (!config.isDirectMode) {
      throw new Error('DirectHttpPublisher requires DISPATCH_MODE=direct');
    }
    if (!config.fastapiWorkerUrl) {
      throw new Error('DirectHttpPublisher requires FASTAPI_WORKER_URL');
    }
    this.baseUrl = config.fastapiWorkerUrl.replace(/\/$/, '');
    this.requestTimeoutMs = requestTimeoutMs;
  }

  async publish(request: TaskPublishRequest): Promise<TaskPublishOutcome> {
    // Deterministic dedupe — mirrors Cloud Tasks ALREADY_EXISTS semantics.
    if (this.seenTaskNames.has(request.taskName)) {
      return { outcome: 'alreadyExists' };
    }

    const url = `${this.baseUrl}${request.urlPath}`;
    try {
      const response = await fetch(url, {                 // Direct HTTP call to FastAPI Worker
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request.payload),
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });

      if (response.ok) {
        this.seenTaskNames.add(request.taskName);
        return { outcome: 'created' };
      }

      const text = await safeReadBody(response);
      const classified = classifyError({
        statusCode: response.status,
        message: `${response.status} ${response.statusText}${text ? ` — ${text}` : ''}`,
      });
      this.logger.warn('direct publish failed', {
        event_id: request.eventId,
        task_name: request.taskName,
        error_class: classified.errorClass,
      });
      return {
        outcome: 'error',
        statusCode: response.status,
        message: classified.sanitizedMessage,
      };
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === 'TimeoutError';
      const classified = classifyError({
        isNetworkError: !isTimeout,
        isTimeout,
        message: err instanceof Error ? err.message : String(err),
      });
      return {
        outcome: 'error',
        isNetworkError: !isTimeout,
        isTimeout,
        message: classified.sanitizedMessage,
      };
    }
  }

  /** Test/diagnostic helper — number of distinct task names delivered. */
  deliveredTaskCount(): number {
    return this.seenTaskNames.size;
  }
}

async function safeReadBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    // Keep only a short summary; worker bodies may echo identifiers.
    return text.slice(0, 200);
  } catch {
    return '';
  }
}
