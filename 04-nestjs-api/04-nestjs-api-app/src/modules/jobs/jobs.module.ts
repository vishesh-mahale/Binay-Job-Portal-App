import { Module } from '@nestjs/common';
import { JobController, PublicJobController, JobService } from './jobs';

@Module({ controllers: [JobController, PublicJobController], providers: [JobService] })
export class JobsModule {}
