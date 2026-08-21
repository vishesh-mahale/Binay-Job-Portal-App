import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { hostname } from 'node:os';
import { EnvConfig, validateEnv } from './env.validation';

/**
 * Strongly-typed application configuration, validated once at boot (fail fast).
 * `workerId` is stable for the instance lifetime — it is the `locked_by` value
 * used by claim_outbox_events()/mark_* ownership guards.
 */
@Injectable()
export class AppConfigService {
  readonly env: EnvConfig;
  readonly workerId: string;

  constructor() {
    this.env = validateEnv();
    this.workerId = `outbox-dispatcher-${hostname()}-${randomBytes(4).toString('hex')}`;
  }

  get dispatchMode(): EnvConfig['DISPATCH_MODE'] {
    return this.env.DISPATCH_MODE;
  }

  get isDirectMode(): boolean {
    return this.env.DISPATCH_MODE === 'direct';
  }

  get isCloudTasksMode(): boolean {
    return this.env.DISPATCH_MODE === 'cloud_tasks';
  }

  get webhookSecret(): string {
    return this.env.WEBHOOK_SECRET;
  }

  get webhookSecretPrevious(): string | undefined {
    return this.env.WEBHOOK_SECRET_PREVIOUS;
  }

  get fastapiWorkerUrl(): string | undefined {
    return this.env.FASTAPI_WORKER_URL;
  }

  get gcpProjectId(): string | undefined {
    return this.env.GCP_PROJECT_ID;
  }

  get gcpLocation(): string | undefined {
    return this.env.GCP_LOCATION;
  }

  get dispatcherServiceAccountEmail(): string | undefined {
    return this.env.GCP_SERVICE_ACCOUNT_EMAIL;
  }

  get fastapiWorkerOidcAudience(): string | undefined {
    return this.env.FASTAPI_WORKER_URL;
  }

  get claimBatchSize(): number {
    return this.env.CLAIM_BATCH_SIZE;
  }

  get claimLeaseSeconds(): number {
    return this.env.CLAIM_LEASE_SECONDS;
  }

  get drainMaxBatches(): number {
    return this.env.DRAIN_MAX_BATCHES;
  }

  get drainRequestBudgetMs(): number {
    return this.env.DRAIN_REQUEST_BUDGET_MS;
  }
}
