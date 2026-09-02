import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development','test','preprod','production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url().or(z.string().startsWith('postgres')),
  SUPABASE_JWT_SECRET: z.string().min(16).optional(),
  SUPABASE_JWT_ISSUER: z.string().url().optional(),
  SUPABASE_JWT_AUDIENCE: z.string().min(1).optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_JWKS_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  SUPABASE_SECRET_KEY: z.string().min(20).optional(),
  RESUME_STORAGE_BUCKET: z.string().min(1).max(100).optional(),
  RESUME_MAX_BYTES: z.coerce.number().int().positive().optional(),
  GUEST_UPLOAD_SESSION_TTL_SECONDS: z.coerce.number().int().positive().optional(),
  GUEST_CLAIM_TTL_SECONDS: z.coerce.number().int().positive().optional(),
  LOG_LEVEL: z.enum(['debug','info','warn','error']).default('info'),
  CORS_ORIGINS: z.string().optional(),
  TRUST_PROXY: z.coerce.boolean().default(false),
  AUTH_AUTO_CONFIRM_EMAIL: z
    .union([z.boolean(), z.string()])
    .transform((val) => {
      if (typeof val === 'boolean') return val;
      const s = String(val).trim().toLowerCase();
      return s === 'true' || s === '1';
    })
    .default(true),
  ALLOWED_OAUTH_PROVIDERS: z.string().optional(),
  OAUTH_CALLBACK_URL: z.string().url().optional(),
  OAUTH_FRONTEND_SUCCESS_URL: z.string().url().optional(),
  OAUTH_FRONTEND_ERROR_URL: z.string().url().optional(),
  OAUTH_STATE_SECRET: z.string().min(32).optional(),
  OAUTH_STATE_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
  FRONTEND_URL: z.string().url(),
}).superRefine((data, ctx) => {
  if (!data.SUPABASE_JWT_SECRET && !data.SUPABASE_JWKS_URL && !data.SUPABASE_URL) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Configure SUPABASE_JWKS_URL (preferred), SUPABASE_URL, or legacy SUPABASE_JWT_SECRET', path: ['SUPABASE_JWKS_URL'] });
  }
  if ((data.NODE_ENV === 'preprod' || data.NODE_ENV === 'production') && !data.SUPABASE_JWT_ISSUER) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'SUPABASE_JWT_ISSUER is required in preprod and production', path: ['SUPABASE_JWT_ISSUER'] });
  }
  if ((data.NODE_ENV === 'preprod' || data.NODE_ENV === 'production') && !data.SUPABASE_JWT_AUDIENCE) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'SUPABASE_JWT_AUDIENCE is required in preprod and production', path: ['SUPABASE_JWT_AUDIENCE'] });
  }
  if ((data.NODE_ENV === 'preprod' || data.NODE_ENV === 'production') && !data.SUPABASE_JWKS_URL && !data.SUPABASE_URL) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'SUPABASE_JWKS_URL or SUPABASE_URL is required in preprod and production for asymmetric verification', path: ['SUPABASE_JWKS_URL'] });
  }
});
export type AppConfig = z.infer<typeof envSchema>;
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if ((env.NODE_ENV === 'preprod' || env.NODE_ENV === 'production') && env.AUTH_AUTO_CONFIRM_EMAIL === undefined) {
    throw new Error('AUTH_AUTO_CONFIRM_EMAIL must be explicitly set in preprod and production environments');
  }
  return envSchema.parse(env);
}