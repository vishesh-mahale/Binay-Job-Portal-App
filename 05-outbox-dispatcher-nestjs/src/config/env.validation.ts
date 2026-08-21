/**
 * Environment validation — fail fast at boot. No defaults for secrets.
 *
 * Source of truth: IMPLEMENTATION-PLAN.md (mirror of Final/implementation.md)
 * Sections 3 (connectivity), 4 (claim bounds from 15_infrastructure.sql),
 * 5 (drain limits), 13 (webhook secret), 17 (local mode env).
 */
import { z } from 'zod';

export type DispatchMode = 'direct' | 'cloud_tasks';

/**
 * DB bounds are owned by claim_outbox_events() in 15_infrastructure.sql:
 * batch 1..100, lease 30..900. Application config must stay inside them.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),

    // PostgreSQL connection (Supabase). Credential content is never logged.
    DATABASE_URL: z
      .string()
      .min(1, 'DATABASE_URL is required (postgres:// connection string)'),

    // Local: 'direct' (DirectHttpPublisher). Future production: 'cloud_tasks'.
    DISPATCH_MODE: z.enum(['direct', 'cloud_tasks']).default('direct'),

    // Webhook shared secret + optional previous secret for rotation windows.
    WEBHOOK_SECRET: z.string().min(1, 'WEBHOOK_SECRET is required'),
    WEBHOOK_SECRET_PREVIOUS: z.string().min(1).optional(),

    // Direct mode target (local FastAPI worker).
    FASTAPI_WORKER_URL: z.string().url().optional(),

    // Claim/drain tuning — bounded per approved plan.
    CLAIM_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(50),
    CLAIM_LEASE_SECONDS: z.coerce.number().int().min(30).max(900).default(300),
    DRAIN_MAX_BATCHES: z.coerce.number().int().min(1).max(20).default(5),
    // Must stay under the Cloud Run request timeout (300s) — plan uses 240s.
    DRAIN_REQUEST_BUDGET_MS: z.coerce.number().int().min(1000).max(290000).default(240000),
  })
  .superRefine((value, ctx) => {
    if (value.DISPATCH_MODE === 'direct' && !value.FASTAPI_WORKER_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['FASTAPI_WORKER_URL'],
        message: 'FASTAPI_WORKER_URL is required when DISPATCH_MODE=direct',
      });
    }
    // Local-only mode must never be active in production deployments.
    if (value.DISPATCH_MODE === 'direct' && value.NODE_ENV === 'production') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DISPATCH_MODE'],
        message: 'DISPATCH_MODE=direct is a local/dev mode and is forbidden when NODE_ENV=production',
      });
    }
  });

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(env: NodeJS.ProcessEnv = process.env): EnvConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    // Never echo secret values — only the failing paths and messages.
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Dispatcher environment validation failed — ${issues}`);
  }
  return result.data;
}
