import { Module } from '@nestjs/common';
import { CoreModule } from './infrastructure/core.module';
import { HealthModule } from './common/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { IdentityModule } from './modules/identity/identity.module';
import { CandidatesModule } from './modules/candidates/candidates.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { InterviewsModule } from './modules/interviews/interviews.module';

@Module({
  imports: [CoreModule, HealthModule, AuthModule, IdentityModule, CandidatesModule, JobsModule, ApplicationsModule, AnalyticsModule, InterviewsModule],
})
export class AppModule {}
