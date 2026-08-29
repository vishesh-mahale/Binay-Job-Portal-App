import { Module } from '@nestjs/common';
import { AnalyticsController, AnalyticsService } from './analytics';
import { FeedbackController, FeedbackService } from './feedback';

@Module({ controllers: [AnalyticsController, FeedbackController], providers: [AnalyticsService, FeedbackService] })
export class AnalyticsModule {}
