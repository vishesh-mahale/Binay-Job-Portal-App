import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { classifyError, sanitizeErrorMessage, unknownRouteError } from '../common/errors';
import { OutboxRepository } from '../database/outbox.repository';
import { OutboxEvent } from '../database/outbox.types';
import { createLogger, StructuredLogger } from '../observability/logger';
import { buildTaskPayload } from '../routing/payload.builder';
import { EventRouteRegistry } from '../routing/event-route.registry';
import { deterministicTaskName } from '../publishing/task-name';
import { TASK_PUBLISHER, TaskPublisher } from '../publishing/task-publisher.interface';
import { nextAvailableAt } from './backoff.policy';

/**
 * Outbox dispatcher core (plan Sections 5, 7, 9, 12–13).
 *
 * Wake semantics:
 * - Single-flight: only one drain runs per instance (max-instances=1 posture).
 * - Pending-wake latch (chatgpt round-2 critical fix): wakes arriving DURING a
 *   drain are NOT discarded — they set `wakePending` and the drain loop runs
 *   another bounded iteration.
 * - Work-remaining continuation: a full last batch implies more due rows, so
 *   the latch is raised again — until the request budget expires.
 * - Budget: REQUEST_BUDGET_MS (default 240s) < Cloud Run request timeout
 *   (300s). Beyond budget, Supabase Cron (10 min) + future webhooks backstop.
 *
 * All state transitions go through the four approved SQL functions — lease,
 * retry budget and dead-letter authority live in the DB, not here.
 */

export interface WakeAccepted {
  accepted: true;
  claimed: number;
  published: number;
  failed: number;
  iterations: number;
  budget_exhausted: boolean;
}

export interface WakeQueued {
  accepted: true;
  reason: 'queued_pending_wake';
}

export type WakeResponse = WakeAccepted | WakeQueued;

export interface DrainResult {
  claimed: number;
  published: number;
  failed: number;
  lastBatchWasFull: boolean;
}

@Injectable()
export class DispatcherService {
  private readonly logger: StructuredLogger = createLogger('dispatcher');

  private dispatchRunning = false;
  private wakePending = false;

  /** Injectable clock for tests. */
  nowMs: () => number = Date.now;

  constructor(
    private readonly config: AppConfigService,
    private readonly repository: OutboxRepository,
    private readonly registry: EventRouteRegistry,
    @Inject(TASK_PUBLISHER) private readonly publisher: TaskPublisher,
  ) {}

  /**
   * Wake entry point. Body of the webhook is IGNORED (PII rule, Section 13) —
   * only `reason` (diagnostic string) is accepted.
   */
  async wake(reason: string): Promise<WakeResponse> {
    // Latch: wakes during an active drain are queued, never discarded.
    if (this.dispatchRunning) {
      this.wakePending = true;
      this.logger.debug('wake queued (dispatch already running)', { reason });
      return { accepted: true, reason: 'queued_pending_wake' };
    }

    this.dispatchRunning = true;
    const startedAt = this.nowMs();
    try {
      const total: WakeAccepted = {
        accepted: true,
        claimed: 0,
        published: 0,
        failed: 0,
        iterations: 0,
        budget_exhausted: false,
      };

      let result: DrainResult;
      do {
        this.wakePending = false;
        result = await this.drainBounded(reason); // max N batches (default 5 x 50)
        total.claimed += result.claimed;
        total.published += result.published;
        total.failed += result.failed;
        total.iterations += 1;
        // Full last batch => due rows likely remain => continue draining.
        if (!this.wakePending && result.lastBatchWasFull) {
          this.wakePending = true;
        }
      } while (this.wakePending && this.nowMs() - startedAt < this.config.drainRequestBudgetMs);

      total.budget_exhausted = this.wakePending;
      this.logger.info('wake drained', {
        claimed: total.claimed,
        published: total.published,
        failed: total.failed,
        iterations: total.iterations,
        duration_ms: this.nowMs() - startedAt,
        budget_exhausted: total.budget_exhausted,
      });
      return total;
    } finally {
      this.dispatchRunning = false;
    }
  }

  /**
   * One bounded drain iteration: at most `DRAIN_MAX_BATCHES` claims of
   * `CLAIM_BATCH_SIZE` events. Stops early on an empty/partial batch.
   */
  async drainBounded(reason: string): Promise<DrainResult> {
    const result: DrainResult = { claimed: 0, published: 0, failed: 0, lastBatchWasFull: false };

    for (let batch = 0; batch < this.config.drainMaxBatches; batch += 1) {
      const events = await this.repository.claimEvents(
        this.config.workerId,
        this.config.claimBatchSize,
        this.config.claimLeaseSeconds,
      );
      result.claimed += events.length;

      if (events.length === 0) {
        break;
      }

      for (const event of events) {
        const outcome = await this.dispatchOne(event);
        if (outcome === 'published') result.published += 1;
        else result.failed += 1;
      }

      if (events.length < this.config.claimBatchSize) {
        break; // partial batch => queue drained
      }
      result.lastBatchWasFull = true;
    }

    if (result.claimed > 0) {
      this.logger.debug('drain iteration done', { reason, ...result });
    }
    return result;
  }

  /** Dispatch a single claimed event. Returns the terminal outcome label. */
  private async dispatchOne(event: OutboxEvent): Promise<'published' | 'failed'> {
    const context = {
      event_id: event.id,
      event_type: event.event_type,
      aggregate_id: event.aggregate_id,
      trace_id: event.correlation_id ?? event.id,
    };

    // Fail closed on unknown event types (G-5: producers must not emit
    // unroutable events; dispatcher never silently skips).
    const route = this.registry.resolve(event.event_type);
    if (!route) {
      this.logger.error('unknown route — failing closed', { ...context, error_class: 'unknown_route' });
      await this.safeMarkFailed(event, unknownRouteError(event.event_type));
      return 'failed';
    }

    const taskName = deterministicTaskName(event.id, route.urlPath);
    const publishOutcome = await this.publisher.publish({
      eventId: event.id,
      taskName,
      queue: route.queue,
      urlPath: route.urlPath,
      payload: buildTaskPayload(event),
    });

    if (publishOutcome.outcome === 'created' || publishOutcome.outcome === 'alreadyExists') {
      // ALREADY_EXISTS is success (deterministic task name dedupe).
      const ok = await this.safeMarkPublished(event, taskName);
      return ok ? 'published' : 'failed';
    }

    const classified = classifyError(publishOutcome);
    this.logger.warn('publish failed', {
      ...context,
      queue: route.queue,
      task_name: taskName,
      error_class: classified.errorClass,
    });
    const lastError = `${classified.errorClass}: ${classified.sanitizedMessage}`;
    await this.safeMarkFailed(event, lastError);
    return 'failed';
  }

  /** markPublished with lease-loss tolerance (stale sweep will recover). */
  private async safeMarkPublished(event: OutboxEvent, taskName: string): Promise<boolean> {
    try {
      await this.repository.markPublished(event.id, this.config.workerId, taskName);
      return true;
    } catch (err) {
      this.logger.error('mark_published rejected (lease lost or row moved)', {
        event_id: event.id,
        task_name: taskName,
        error_class: 'unknown',
        message: sanitizeErrorMessage(err instanceof Error ? err.message : String(err)),
      });
      return false;
    }
  }

  /** markFailed with backoff-computed next available_at (>= NOW()). */
  private async safeMarkFailed(event: OutboxEvent, lastError: string): Promise<void> {
    try {
      await this.repository.markFailed(
        event.id,
        this.config.workerId,
        lastError,
        nextAvailableAt(event.retry_count),
      );
    } catch (err) {
      this.logger.error('mark_failed rejected (lease lost or row moved)', {
        event_id: event.id,
        error_class: 'unknown',
        message: sanitizeErrorMessage(err instanceof Error ? err.message : String(err)),
      });
    }
  }

  /** Test helper — exposes latch state without affecting behavior. */
  get isDispatchRunning(): boolean {
    return this.dispatchRunning;
  }
}
