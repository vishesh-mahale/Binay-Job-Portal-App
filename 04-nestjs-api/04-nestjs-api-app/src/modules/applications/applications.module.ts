import { Module } from '@nestjs/common';
import { ApplicationController, ApplicationStatusController, CandidateApplicationReadController, CompanyApplicationReadController, ApplicationService } from './applications';
import { SavedCandidateController, SavedCandidateService } from './saved-candidates';

@Module({
  controllers: [ApplicationController, ApplicationStatusController, CandidateApplicationReadController, CompanyApplicationReadController, SavedCandidateController],
  providers: [ApplicationService, SavedCandidateService],
})
export class ApplicationsModule {}
