import { Module, Controller, Get, Res, Inject } from '@nestjs/common';
import type { Response } from 'express';
import { CoreModule } from './infrastructure/core.module';
import { AppConfig } from './infrastructure/config/config';
import { HealthModule } from './common/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { IdentityModule } from './modules/identity/identity.module';
import { CandidatesModule } from './modules/candidates/candidates.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { ApplicationsModule } from './modules/applications/applications.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { InterviewsModule } from './modules/interviews/interviews.module';

@Controller()
export class AppController {
  constructor(@Inject('APP_CONFIG') private readonly config: AppConfig) {}

  @Get()
  root(@Res() res: Response) {
    return res.redirect(`${this.config.FRONTEND_URL.replace(/\/$/, '')}/login`);
  }
}

@Module({
  imports: [CoreModule, HealthModule, AuthModule, IdentityModule, CandidatesModule, JobsModule, ApplicationsModule, AnalyticsModule, InterviewsModule],
  controllers: [AppController],
})
export class AppModule {}
