import { Module } from '@nestjs/common';
import { InterviewController, InterviewService } from './interviews';

@Module({ controllers: [InterviewController], providers: [InterviewService] })
export class InterviewsModule {}
