import { Module } from '@nestjs/common';
import { HealthController, HealthService } from './health';

@Module({ controllers: [HealthController], providers: [HealthService] })
export class HealthModule {}
