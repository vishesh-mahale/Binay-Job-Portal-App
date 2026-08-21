import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createLogger } from './observability/logger';

/**
 * Bootstrap (plan Section 2).
 *
 * - PORT from validated config (env validation fail-fasts before listen).
 * - Graceful shutdown: Cloud Run SIGTERM → in-flight drain completes (lease
 *   functions are idempotent-safe anyway), pg pool closes via lifecycle hook.
 * - No global ValidationPipe: the wake endpoint intentionally IGNORES its
 *   body (PII rule, plan Section 13) — there is no user input to validate.
 */
async function bootstrap(): Promise<void> {
  const logger = createLogger('bootstrap');
  const app = await NestFactory.create(AppModule, { logger: false });

  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  logger.info('dispatcher listening', { port });
}

bootstrap().catch((err) => {
  // Boot failure must be loud and exit non-zero (Cloud Run restart policy).
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ severity: 'ERROR', message: 'bootstrap failed', error: String(err) }));
  process.exit(1);
});
