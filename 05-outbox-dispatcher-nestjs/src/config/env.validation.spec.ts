import { validateEnv } from './env.validation';

/**
 * Env validation is the boot gate — secrets have no defaults, local mode is
 * forbidden in production, claim/drain bounds mirror 15_infrastructure.sql.
 */

const VALID = {
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
  WEBHOOK_SECRET: 'dev-secret',
  DISPATCH_MODE: 'direct',
  FASTAPI_WORKER_URL: 'http://127.0.0.1:8000',
};

describe('env validation', () => {
  it('accepts a valid local configuration and applies defaults', () => {
    const config = validateEnv({ ...VALID });
    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(3000);
    expect(config.CLAIM_BATCH_SIZE).toBe(50);
    expect(config.CLAIM_LEASE_SECONDS).toBe(300);
    expect(config.DRAIN_MAX_BATCHES).toBe(5);
    expect(config.DRAIN_REQUEST_BUDGET_MS).toBe(240000);
  });

  it('fails fast without DATABASE_URL', () => {
    const { DATABASE_URL: _omit, ...rest } = VALID;
    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL:/);
  });

  it('fails fast without WEBHOOK_SECRET (no default for secrets)', () => {
    const { WEBHOOK_SECRET: _omit, ...rest } = VALID;
    expect(() => validateEnv(rest)).toThrow(/WEBHOOK_SECRET:/);
  });

  it('rejects empty secret values with the explicit message', () => {
    expect(() => validateEnv({ ...VALID, WEBHOOK_SECRET: '' })).toThrow(/WEBHOOK_SECRET is required/);
  });

  it('requires FASTAPI_WORKER_URL when DISPATCH_MODE=direct', () => {
    const { FASTAPI_WORKER_URL: _omit, ...rest } = VALID;
    expect(() => validateEnv(rest)).toThrow(/FASTAPI_WORKER_URL is required when DISPATCH_MODE=direct/);
  });

  it('forbids DISPATCH_MODE=direct in production', () => {
    expect(() =>
      validateEnv({ ...VALID, NODE_ENV: 'production' }),
    ).toThrow(/direct is a local\/dev mode and is forbidden/);
  });

  it('allows cloud_tasks in production without FASTAPI_WORKER_URL', () => {
    const config = validateEnv({
      NODE_ENV: 'production',
      DATABASE_URL: VALID.DATABASE_URL,
      WEBHOOK_SECRET: 's',
      DISPATCH_MODE: 'cloud_tasks',
    });
    expect(config.DISPATCH_MODE).toBe('cloud_tasks');
  });

  it('enforces SQL-owned claim bounds (batch 1..100, lease 30..900)', () => {
    expect(() => validateEnv({ ...VALID, CLAIM_BATCH_SIZE: '101' })).toThrow();
    expect(() => validateEnv({ ...VALID, CLAIM_BATCH_SIZE: '0' })).toThrow();
    expect(() => validateEnv({ ...VALID, CLAIM_LEASE_SECONDS: '29' })).toThrow();
    expect(() => validateEnv({ ...VALID, CLAIM_LEASE_SECONDS: '901' })).toThrow();
  });

  it('keeps the drain budget strictly below the Cloud Run 300s timeout', () => {
    expect(() => validateEnv({ ...VALID, DRAIN_REQUEST_BUDGET_MS: '300000' })).toThrow();
    const config = validateEnv({ ...VALID, DRAIN_REQUEST_BUDGET_MS: '290000' });
    expect(config.DRAIN_REQUEST_BUDGET_MS).toBe(290000);
  });

  it('never echoes secret values in validation errors', () => {
    const err = (() => {
      try {
        validateEnv({ ...VALID, WEBHOOK_SECRET: '' });
        return '';
      } catch (e) {
        return (e as Error).message;
      }
    })();
    expect(err).toContain('WEBHOOK_SECRET');
    expect(err).not.toContain('dev-secret');
  });
});
