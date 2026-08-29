import { BadRequestException, Body, Controller, Injectable, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard, RequestUser } from '../auth/auth';
import { SystemClient } from '../../infrastructure/database/clients';
import { Allow, IsObject, IsOptional, IsString } from 'class-validator';

type AuthRequest = Request & { user?: RequestUser };
const CATEGORIES = new Set(['engagement','conversion','recruitment','user','search','feature','system']);
const SOURCES = new Set(['web','mobile','api','cron','nestjs','fastapi','dispatcher']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class IngestAnalyticsEventDto {
  @Allow() @IsString() idempotency_key!: string;
  @Allow() @IsString() event_name!: string;
  @Allow() @IsString() event_category!: string;
  @Allow() @IsOptional() @IsString() source?: string;
  @Allow() @IsObject() event_data!: Record<string, unknown>;
  @Allow() @IsOptional() @IsString() entity_type?: string;
  @Allow() @IsOptional() @IsString() entity_id?: string;
  @Allow() @IsOptional() @IsString() session_id?: string;
  @Allow() @IsOptional() @IsString() request_id?: string;
  @Allow() @IsOptional() @IsString() trace_id?: string;
  @Allow() @IsOptional() @IsString() page_url?: string;
  @Allow() @IsOptional() @IsString() referrer_url?: string;
  [key: string]: unknown;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly system: SystemClient) {}
  async ingest(userId: string, dto: IngestAnalyticsEventDto) {
    const key = dto?.idempotency_key?.trim(); const name = dto?.event_name?.trim().toLowerCase();
    const entityType = dto.entity_type?.trim() || null; const entityId = dto.entity_id || null;
    if (!key || !name || !/^[a-z0-9]+([._-][a-z0-9]+)*$/.test(name) || !dto.event_category || !CATEGORIES.has(dto.event_category) || !SOURCES.has(dto.source ?? 'web') || !dto.event_data || typeof dto.event_data !== 'object' || Array.isArray(dto.event_data) || Boolean(entityType) !== Boolean(entityId) || (entityId !== null && !UUID.test(entityId))) throw new BadRequestException('VALIDATION_ERROR');
    const result = await this.system.query(`
      INSERT INTO public.analytics_events (idempotency_key, user_id, event_name, event_category, source, event_data, entity_type, entity_id, session_id, request_id, trace_id, page_url, referrer_url)
      SELECT $1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13
      WHERE EXISTS (SELECT 1 FROM public.users WHERE id = $2 AND status = 'active' AND deleted_at IS NULL)
      ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
      RETURNING id, idempotency_key, event_name, occurred_at
    `, [key, userId, name, dto.event_category, dto.source ?? 'web', JSON.stringify(dto.event_data), entityType, entityId, dto.session_id || null, dto.request_id || null, dto.trace_id || null, dto.page_url || null, dto.referrer_url || null]);
    if (!result.rows[0]) throw new BadRequestException('FORBIDDEN');
    return { ...result.rows[0], replayed: false };
  }
}

@Controller('api/v1/analytics/events')
@UseGuards(AuthGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}
  @Post()
  ingest(@Req() req: AuthRequest, @Body() dto: IngestAnalyticsEventDto) {
    if (!req.user?.sub) throw new BadRequestException('FORBIDDEN');
    return this.analytics.ingest(req.user.sub, dto);
  }
}