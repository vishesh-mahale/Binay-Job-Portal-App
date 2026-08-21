import { Module } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { DatabaseModule } from '../database/database.module';
import { EventRouteRegistry } from '../routing/event-route.registry';
import { DirectHttpPublisher } from '../publishing/direct-http.publisher';
import { CloudTasksPublisher } from '../publishing/cloud-tasks.publisher';
import { TASK_PUBLISHER, TaskPublisher } from '../publishing/task-publisher.interface';
import { DispatcherController } from './dispatcher.controller';
import { DispatcherService } from './dispatcher.service';
import { WebhookSecretGuard } from './guards/webhook-secret.guard';

/**
 * Publisher selection by DISPATCH_MODE (plan Section 18).
 *
 * - `direct`      → DirectHttpPublisher (local dev mode without GCP queues)
 * - `cloud_tasks` → CloudTasksPublisher (Google Cloud Tasks with ADC / IAM OIDC)
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
        return new CloudTasksPublisher(config);
      },
      inject: [AppConfigService],
    },
  ],
  exports: [DispatcherService],
})
export class DispatcherModule {}
