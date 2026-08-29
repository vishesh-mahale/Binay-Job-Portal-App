import { BadRequestException, Body, Controller, Injectable, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard, RequestUser } from './auth';
import { SystemClient } from './clients';
import { Allow, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

type AuthRequest = Request & { user?: RequestUser };
const CATEGORIES = new Set(['platform_experience','recruitment_process','bug_report','suggestion','feature_request','other']);

export class SubmitFeedbackDto {
  @Allow() @IsOptional() @IsString() category?: string;
  @Allow() @IsOptional() @IsString() subject?: string;
  @Allow() @IsString() message!: string;
  @Allow() @IsOptional() @IsInt() @Min(1) @Max(5) rating?: number;
  [key: string]: unknown;
}

@Injectable()
export class FeedbackService {
  constructor(private readonly system: SystemClient) {}
  async submit(userId: string, dto: SubmitFeedbackDto) {
    const message = dto?.message?.trim();
    if (!message || (dto.category && !CATEGORIES.has(dto.category)) || (dto.rating !== undefined && (!Number.isInteger(dto.rating) || dto.rating < 1 || dto.rating > 5))) {
      throw new BadRequestException('VALIDATION_ERROR');
    }
    const result = await this.system.query(`
      INSERT INTO public.platform_feedback (user_id, is_guest, category, subject, message, rating)
      SELECT $1, FALSE, COALESCE($2, 'other')::public.feedback_category, $3, $4, $5
      WHERE EXISTS (SELECT 1 FROM public.users u WHERE u.id = $1 AND u.status = 'active' AND u.deleted_at IS NULL)
      RETURNING id, category, subject, message, rating, created_at
    `, [userId, dto.category ?? null, dto.subject?.trim() || null, message, dto.rating ?? null]);
    if (!result.rows[0]) throw new BadRequestException('FORBIDDEN');
    return result.rows[0];
  }
}

@Controller('api/v1/feedback')
@UseGuards(AuthGuard)
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}
  @Post()
  submit(@Req() req: AuthRequest, @Body() dto: SubmitFeedbackDto) {
    if (!req.user?.sub) throw new BadRequestException('FORBIDDEN');
    return this.feedback.submit(req.user.sub, dto);
  }
}
