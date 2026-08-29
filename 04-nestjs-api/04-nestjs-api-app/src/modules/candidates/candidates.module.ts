import { Module } from '@nestjs/common';
import { CandidateController, CandidateService, ResumeStatusController } from './candidate';
import { ResumeController, ResumeService } from './resume';
import { GuestSessionController, GuestSessionService } from './guest';

@Module({
  controllers: [CandidateController, ResumeStatusController, ResumeController, GuestSessionController],
  providers: [CandidateService, ResumeService, GuestSessionService],
})
export class CandidatesModule {}
