import { Module } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { DatabaseModule } from '../database/database.module';
import { EventRouteRegistry } from '../routing/event-route.registry';
import { DirectHttpPublisher } from '../publishing/direct-http.publisher';
import { TASK_PUBLISHER, TaskPublisher } from '../publishing/task-publisher.interface';
import { DispatcherController } from './dispatcher.controller';
import { DispatcherService } from './dispatcher.service';
import { WebhookSecretGuard } from './guards/webhook-secret.guard';

/**
 * Publisher selection by DISPATCH_MODE (plan Section 18).
 *
 * - `direct`      → DirectHttpPublisher (local dev; rejected by env validation
 *                   when NODE_ENV=production).
 * - `cloud_tasks` → NOT implemented in Phase 1 (gated by G-3 IAM + queue
 *                   provisioning). Fail fast at boot rather than silently
 *                   falling back — correctness over convenience.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [DispatcherController],
  providers: [
    DispatcherService,
    EventRouteRegistry,
    WebhookSecretGuard,
    {
      provide: TASK_PUBLISHER,
      useFactory: (config: AppConfigService): TaskPublisher => {
        if (config.isDirectMode) {
          return new DirectHttpPublisher(config);
        }
        throw new Error(
          'DISPATCH_MODE=cloud_tasks is not implemented in Phase 1 ' +
            '(blocked by gates G-3/G-4 — IAM bindings and queue provisioning). ' +
            'Use DISPATCH_MODE=direct for local development.',
        );
      },
      inject: [AppConfigService],
    },
  ],
})
export class DispatcherModule {}
