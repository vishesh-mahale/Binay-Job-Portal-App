import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard, RequestUser } from './auth';
import { SystemClient } from './clients';
import { Allow, IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

type AuthRequest = Request & { user?: RequestUser };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set(['scheduled', 'confirmed', 'rescheduled', 'completed', 'cancelled', 'no_show']);
const TRANSITIONS: Record<string, Set<string>> = {
  scheduled: new Set(['confirmed', 'rescheduled', 'cancelled', 'no_show']),
  confirmed: new Set(['rescheduled', 'completed', 'cancelled', 'no_show']),
  rescheduled: new Set(['confirmed', 'completed', 'cancelled', 'no_show']),
};
const INTERVIEW_TYPES = new Set(['phone', 'video', 'in_person', 'technical_assessment', 'group', 'panel']);

export class ScheduleInterviewDto {
  @Allow() @IsUUID() schedule_block_id!: string;
  @Allow() @IsUUID() interviewer_id!: string;
  @Allow() @IsString() title!: string;
  @Allow() @IsString() type!: string;
  @Allow() @IsOptional() @IsInt() @Min(1) round?: number;
  @Allow() @IsString() scheduled_at!: string;
  @Allow() @IsInt() @Min(1) @Max(480) duration_minutes!: number;
  @Allow() @IsString() timezone!: string;
  @Allow() @IsOptional() @IsString() meeting_link?: string;
  [key: string]: unknown;
}

export class InterviewStatusDto {
  @Allow() @IsOptional() @IsString() status?: string;
  @Allow() @IsOptional() @IsString() reason?: string;
  [key: string]: unknown;
}

export class RescheduleInterviewDto {
  @Allow() @IsUUID() schedule_block_id!: string;
  @Allow() @IsUUID() interviewer_id!: string;
  @Allow() @IsString() scheduled_at!: string;
  @Allow() @IsInt() @Min(1) @Max(480) duration_minutes!: number;
  @Allow() @IsString() timezone!: string;
  @Allow() @IsOptional() @IsString() meeting_link?: string;
  @Allow() @IsOptional() @IsString() status?: string;
  @Allow() @IsOptional() @IsString() reason?: string;
  [key: string]: unknown;
}

export class InterviewUpdateDto {
  @Allow() @IsOptional() @IsUUID() schedule_block_id?: string;
  @Allow() @IsOptional() @IsUUID() interviewer_id?: string;
  @Allow() @IsOptional() @IsString() scheduled_at?: string;
  @Allow() @IsOptional() @IsInt() @Min(1) @Max(480) duration_minutes?: number;
  @Allow() @IsOptional() @IsString() timezone?: string;
  @Allow() @IsOptional() @IsString() meeting_link?: string;
  @Allow() @IsOptional() @IsString() status?: string;
  @Allow() @IsOptional() @IsString() reason?: string;
  [key: string]: unknown;
}

function validUuid(value: unknown): value is string { return typeof value === 'string' && UUID.test(value); }
function validTime(value: string): boolean { const t = Date.parse(value); return Number.isFinite(t) && t > Date.now() + 60 * 60 * 1000; }
function validTimezone(value: string): boolean { try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(); return value.includes('/') || value === 'UTC'; } catch { return false; } }

@Injectable()
export class InterviewService {
  constructor(private readonly system: SystemClient) {}

  private async companyActor(client: any, userId: string, companyId: string) {
    const r = await client.query(`SELECT u.role, c.owner_id FROM public.users u JOIN public.companies c ON c.id=$2 AND c.deleted_at IS NULL WHERE u.id=$1 AND u.status='active' AND u.deleted_at IS NULL AND (c.owner_id=$1 OR EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id=c.id AND m.user_id=$1 AND m.is_active=true AND u.role IN ('employer','hr')))`, [userId, companyId]);
    if (!r.rows[0]) throw new ForbiddenException('FORBIDDEN');
    return r.rows[0];
  }

  async schedule(userId: string, companyId: string, applicationId: string, dto: ScheduleInterviewDto) {
    if (![companyId, applicationId, dto?.schedule_block_id, dto?.interviewer_id].every(validUuid) || !dto?.title?.trim() || !INTERVIEW_TYPES.has(dto?.type) || !Number.isInteger(dto?.round ?? 1) || (dto?.round ?? 1) < 1 || !/[zZ]|[+-]\d{2}:?\d{2}$/.test(dto?.scheduled_at || '') || !validTime(dto?.scheduled_at || '') || !Number.isInteger(dto?.duration_minutes) || dto.duration_minutes < 1 || dto.duration_minutes > 480 || !dto?.timezone?.trim() || !validTimezone(dto.timezone.trim())) throw new BadRequestException('VALIDATION_ERROR');
    return this.system.transaction(async (client) => {
      await this.companyActor(client, userId, companyId);
      const block = await client.query(`SELECT b.id,b.application_id,b.job_id,b.interviewer_id,b.start_time,b.end_time,b.is_booked FROM public.interview_schedule_blocks b JOIN public.interviewers i ON i.id=b.interviewer_id AND i.is_active=true WHERE b.id=$1 AND i.company_id=$2 AND (b.locked_by IS NULL OR b.locked_until < NOW()) FOR UPDATE`, [dto.schedule_block_id, companyId]);
      const b = block.rows[0];
      if (!b || b.is_booked || String(b.application_id) !== applicationId || String(b.interviewer_id) !== dto.interviewer_id) throw new BadRequestException('SLOT_UNAVAILABLE');
      if (new Date(dto.scheduled_at).getTime() < new Date(b.start_time).getTime() || new Date(dto.scheduled_at).getTime() + dto.duration_minutes * 60000 > new Date(b.end_time).getTime()) throw new BadRequestException('SLOT_UNAVAILABLE');
      const appJob = await client.query(`SELECT job_id FROM public.job_applications WHERE id=$1`, [applicationId]);
      if (!appJob.rows[0]) throw new NotFoundException('NOT_FOUND');
      await client.query(`UPDATE public.interview_schedule_blocks SET is_booked=true, application_id=$1, job_id=$2, booked_by=$3, booked_at=NOW(), locked_by=NULL, locked_until=NULL WHERE id=$4`, [applicationId, appJob.rows[0].job_id, userId, dto.schedule_block_id]);
      const inserted = await client.query(`INSERT INTO public.interviews (application_id,job_id,candidate_id,interview_pool_id,schedule_block_id,title,type,round,scheduled_at,duration_minutes,timezone,meeting_link,status) SELECT a.id,a.job_id,a.candidate_id,NULL,b.id,$1,$2,$3,$4,$5,$6,$7,'scheduled'::public.interview_status FROM public.job_applications a JOIN public.jobs j ON j.id=a.job_id AND j.company_id=$10 JOIN public.interview_schedule_blocks b ON b.id=$8 WHERE a.id=$9 RETURNING *`, [dto.title.trim(), dto.type.trim(), dto.round ?? 1, dto.scheduled_at, dto.duration_minutes, dto.timezone.trim(), dto.meeting_link?.trim() || null, dto.schedule_block_id, applicationId, companyId]);
      if (!inserted.rows[0]) throw new NotFoundException('NOT_FOUND');
      const interviewer = await client.query(`SELECT user_id FROM public.interviewers WHERE id=$1 AND company_id=$2`, [dto.interviewer_id, companyId]);
      if (!interviewer.rows[0]) throw new NotFoundException('NOT_FOUND');
      await client.query(`INSERT INTO public.interview_participants (interview_id,user_id,role,is_primary) VALUES ($1,$2,'interviewer',true)`, [inserted.rows[0].id, interviewer.rows[0].user_id]);
      return inserted.rows[0];
    });
  }

  async listCompany(userId: string, companyId: string) {
    if (!validUuid(companyId)) throw new BadRequestException('VALIDATION_ERROR');
    return this.system.transaction(async (client) => { await this.companyActor(client, userId, companyId); const r = await client.query(`SELECT i.id,i.application_id,i.job_id,i.candidate_id,i.title,i.type,i.round,i.scheduled_at,i.duration_minutes,i.timezone,i.meeting_link,i.meeting_id,i.meeting_provider,i.interviewer_notes,i.candidate_instructions,i.status,i.completed_at,i.cancelled_reason,i.rescheduled_from,i.reschedule_count,i.is_candidate_confirmed,i.candidate_confirmed_at,i.created_at,i.updated_at FROM public.interviews i JOIN public.jobs j ON j.id=i.job_id AND j.company_id=$1 ORDER BY i.scheduled_at DESC LIMIT 100`, [companyId]); return r.rows; });
  }

  async getMine(userId: string, interviewId: string) {
    if (!validUuid(interviewId)) throw new BadRequestException('VALIDATION_ERROR');
    const r = await this.system.query(`SELECT i.id,i.application_id,i.job_id,i.candidate_id,i.title,i.type,i.round,i.scheduled_at,i.duration_minutes,i.timezone,i.meeting_link,i.status,i.cancelled_reason,i.is_candidate_confirmed,i.candidate_confirmed_at,i.created_at,i.updated_at FROM public.interviews i JOIN public.candidate_profiles cp ON cp.id=i.candidate_id AND cp.deleted_at IS NULL WHERE i.id=$1 AND cp.user_id=$2`, [interviewId, userId]);
    if (!r.rows[0]) throw new NotFoundException('NOT_FOUND');
    return r.rows[0];
  }

  async listMine(userId: string) { const r = await this.system.query(`SELECT i.id,i.application_id,i.job_id,i.candidate_id,i.title,i.type,i.round,i.scheduled_at,i.duration_minutes,i.timezone,i.meeting_link,i.status,i.cancelled_reason,i.is_candidate_confirmed,i.candidate_confirmed_at,i.created_at,i.updated_at FROM public.interviews i JOIN public.candidate_profiles cp ON cp.id=i.candidate_id AND cp.deleted_at IS NULL WHERE cp.user_id=$1 ORDER BY i.scheduled_at DESC LIMIT 100`, [userId]); return r.rows; }

  async changeStatus(userId: string, interviewId: string, status: string, reason?: string, companyId?: string, candidateOnly = false) {
    if (!validUuid(interviewId) || !STATUSES.has(status)) throw new BadRequestException('VALIDATION_ERROR');
    return this.system.transaction(async (client) => {
      const current = await client.query(`SELECT i.*, j.company_id FROM public.interviews i JOIN public.jobs j ON j.id=i.job_id WHERE i.id=$1 FOR UPDATE`, [interviewId]);
      const row = current.rows[0]; if (!row) throw new NotFoundException('NOT_FOUND');
      if (companyId && (!validUuid(companyId) || String(row.company_id) !== companyId)) throw new NotFoundException('NOT_FOUND');
      const isCandidate = await client.query(`SELECT 1 FROM public.candidate_profiles WHERE id=$1 AND user_id=$2`, [row.candidate_id, userId]);
      if (candidateOnly && !isCandidate.rows[0]) throw new ForbiddenException('FORBIDDEN');
      const candidateAction = status === 'confirmed' || (status === 'cancelled' && Boolean(isCandidate.rows[0]));
      if (status === 'confirmed' && !isCandidate.rows[0]) throw new ForbiddenException('FORBIDDEN');
      if (candidateAction) { /* candidate self-service action */ }
      else { await this.companyActor(client, userId, row.company_id); }
      if (!TRANSITIONS[String(row.status)]?.has(status)) throw new BadRequestException('INVALID_STATUS_TRANSITION');
      if (status === 'cancelled' && !reason?.trim()) throw new BadRequestException('REASON_REQUIRED');
      const r = await client.query(`UPDATE public.interviews SET status=$1::public.interview_status, completed_at=CASE WHEN $1='completed' THEN NOW() ELSE NULL END, is_candidate_confirmed=CASE WHEN $1='confirmed' THEN TRUE ELSE is_candidate_confirmed END, candidate_confirmed_at=CASE WHEN $1='confirmed' THEN NOW() ELSE candidate_confirmed_at END, cancelled_reason=CASE WHEN $1='cancelled' THEN $2 ELSE cancelled_reason END, updated_at=NOW() WHERE id=$3 RETURNING *`, [status, reason?.trim() || (status === 'cancelled' ? 'candidate_declined' : null), interviewId]);
      return r.rows[0];
    });
  }

  async reschedule(userId: string, companyId: string, interviewId: string, dto: RescheduleInterviewDto) {
    if (!validUuid(companyId) || !validUuid(interviewId) || !validUuid(dto?.schedule_block_id) || !validUuid(dto?.interviewer_id) || !validTime(dto.scheduled_at) || !/[zZ]|[+-]\d{2}:?\d{2}$/.test(dto.scheduled_at) || !validTimezone(dto.timezone?.trim() || '') || !Number.isInteger(dto.duration_minutes) || dto.duration_minutes < 1 || dto.duration_minutes > 480) throw new BadRequestException('VALIDATION_ERROR');
    return this.system.transaction(async (client) => {
      await this.companyActor(client, userId, companyId);
      const oldResult = await client.query(`SELECT i.*, j.company_id FROM public.interviews i JOIN public.jobs j ON j.id=i.job_id WHERE i.id=$1 AND j.company_id=$2 FOR UPDATE`, [interviewId, companyId]);
      const old = oldResult.rows[0];
      if (!old || !TRANSITIONS[String(old.status)]?.has('rescheduled')) throw new BadRequestException('INVALID_STATUS_TRANSITION');
      const blockResult = await client.query(`SELECT b.id,b.application_id,b.job_id,b.interviewer_id,b.start_time,b.end_time,b.is_booked FROM public.interview_schedule_blocks b JOIN public.interviewers it ON it.id=b.interviewer_id AND it.is_active=true WHERE b.id=$1 AND it.company_id=$2 AND (b.locked_by IS NULL OR b.locked_until < NOW()) FOR UPDATE`, [dto.schedule_block_id, companyId]);
      const block = blockResult.rows[0];
      if (!block || block.is_booked || String(block.application_id) !== String(old.application_id) || String(block.job_id) !== String(old.job_id) || String(block.interviewer_id) !== dto.interviewer_id || new Date(dto.scheduled_at).getTime() < new Date(block.start_time).getTime() || new Date(dto.scheduled_at).getTime() + dto.duration_minutes * 60000 > new Date(block.end_time).getTime()) throw new BadRequestException('SLOT_UNAVAILABLE');
      await client.query(`UPDATE public.interview_schedule_blocks SET is_booked=false, booked_by=NULL, booked_at=NULL, application_id=NULL, job_id=NULL WHERE id=$1`, [old.schedule_block_id]);
      await client.query(`UPDATE public.interviews SET status='rescheduled'::public.interview_status, schedule_block_id=NULL, updated_at=NOW() WHERE id=$1`, [interviewId]);
      await client.query(`UPDATE public.interview_schedule_blocks SET is_booked=true, application_id=$1, job_id=$2, booked_by=$3, booked_at=NOW(), locked_by=NULL, locked_until=NULL WHERE id=$4`, [old.application_id, old.job_id, userId, dto.schedule_block_id]);
      const next = await client.query(`INSERT INTO public.interviews (application_id,job_id,candidate_id,interview_pool_id,schedule_block_id,title,type,round,scheduled_at,duration_minutes,timezone,meeting_link,status,rescheduled_from,reschedule_count) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'scheduled'::public.interview_status,$13,$14) RETURNING *`, [old.application_id, old.job_id, old.candidate_id, old.interview_pool_id, dto.schedule_block_id, old.title, old.type, old.round, dto.scheduled_at, dto.duration_minutes, dto.timezone.trim(), dto.meeting_link?.trim() || old.meeting_link, old.id, Number(old.reschedule_count || 0) + 1]);
      await client.query(`INSERT INTO public.interview_participants (interview_id,user_id,role,is_primary) SELECT $1,it.user_id,'interviewer',true FROM public.interviewers it WHERE it.id=$2 AND it.company_id=$3`, [next.rows[0].id, dto.interviewer_id, companyId]);
      return next.rows[0];
    });
  }
}

@Controller('api/v1')
@UseGuards(AuthGuard)
export class InterviewController {
  constructor(private readonly service: InterviewService) {}
  @Post('companies/:companyId/applications/:applicationId/interviews') schedule(@Req() req: AuthRequest, @Param('companyId') c: string, @Param('applicationId') a: string, @Body() dto: ScheduleInterviewDto) { return this.service.schedule(req.user!.sub, c, a, dto); }
  @Get('companies/:companyId/interviews') listCompany(@Req() req: AuthRequest, @Param('companyId') c: string) { return this.service.listCompany(req.user!.sub, c); }
  @Get('me/interviews') listMine(@Req() req: AuthRequest) { return this.service.listMine(req.user!.sub); }
  @Get('me/interviews/:interviewId') getMine(@Req() req: AuthRequest, @Param('interviewId') id: string) { return this.service.getMine(req.user!.sub, id); }
  @Post('me/interviews/:interviewId/confirm') confirm(@Req() req: AuthRequest, @Param('interviewId') id: string) { return this.service.changeStatus(req.user!.sub, id, 'confirmed', undefined, undefined, true); }
  @Post('me/interviews/:interviewId/decline') decline(@Req() req: AuthRequest, @Param('interviewId') id: string, @Body() dto: InterviewStatusDto) { return this.service.changeStatus(req.user!.sub, id, 'cancelled', dto?.reason, undefined, true); }
  @Patch('companies/:companyId/interviews/:interviewId') update(@Req() req: AuthRequest, @Param('companyId') companyId: string, @Param('interviewId') id: string, @Body() dto: InterviewUpdateDto) { return dto?.status === 'rescheduled' ? this.service.reschedule(req.user!.sub, companyId, id, dto as RescheduleInterviewDto) : this.service.changeStatus(req.user!.sub, id, dto?.status ?? '', dto?.reason, companyId); }
}
