import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { DispatcherModule } from './dispatcher/dispatcher.module';
import { HealthController } from './health/health.controller';

/**
 * Root module — Phase 1 scope only:
 * Config (validated env) + Database (pg pool + 4-function repository)
 * + Dispatcher (wake endpoint, single-flight/latch drain) + Health.
 * No Metrics module yet (plan Section 2 lists it for the integration phase).
 */
@Module({
  imports: [ConfigModule, DatabaseModule, DispatcherModule],
  controllers: [HealthController],
})
export class AppModule {}
