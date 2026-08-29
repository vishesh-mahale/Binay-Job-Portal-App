import { Module } from '@nestjs/common';
import { JobController, JobService } from './jobs';

@Module({ controllers: [JobController], providers: [JobService] })
export class JobsModule {}
