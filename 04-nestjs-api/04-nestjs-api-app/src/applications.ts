import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { AuthGuard, RequestUser } from './auth';
import { SystemClient } from './clients';
import { Allow, IsArray, IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

type AuthRequest = Request & { user?: RequestUser };

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export class SubmitApplicationDto {
  @Allow() @IsUUID() document_id!: string;
  @Allow() @IsOptional() @IsString() cover_letter?: string;
  @Allow() @IsOptional() @IsArray() answers_to_screening_questions?: unknown[];
  @Allow() @IsBoolean() consent!: boolean;
  [key: string]: unknown;
}

export class ChangeApplicationStatusDto {
  @Allow() @IsString() status!: string;
  @Allow() @IsOptional() @IsString() reason?: string;
  [key: string]: unknown;
}

@Injectable()
export class ApplicationService {
  constructor(private readonly system: SystemClient) {}

  async submit(userId: string, jobId: string, dto: SubmitApplicationDto) {
    if (!isUuid(jobId) || !isUuid(dto?.document_id) || dto.consent !== true) {
      throw new BadRequestException('VALIDATION_ERROR');
    }
    const answers = dto.answers_to_screening_questions ?? [];
    if (!Array.isArray(answers)) throw new BadRequestException('VALIDATION_ERROR');
    for (const answer of answers) {
      if (!answer || typeof answer !== 'object' || typeof (answer as Record<string, unknown>).question_id !== 'string') {
        throw new BadRequestException('VALIDATION_ERROR');
      }
    }

    return this.system.transaction(async (client) => {
      const candidate = await client.query(`
        SELECT cp.*, u.email
        FROM public.candidate_profiles cp
        JOIN public.users u ON u.id = cp.user_id
        WHERE cp.user_id = $1 AND u.status = 'active' AND u.deleted_at IS NULL
      `, [userId]);
      if (!candidate.rows[0]) throw new ForbiddenException('FORBIDDEN');
      const profile = candidate.rows[0];

      const job = await client.query(`
        SELECT j.id, j.company_id, j.status, j.expires_at, j.deleted_at
        FROM public.jobs j
        WHERE j.id = $1
        FOR UPDATE
      `, [jobId]);
      const jobRow = job.rows[0];
      if (!jobRow || jobRow.deleted_at || jobRow.status !== 'published' || (jobRow.expires_at && new Date(jobRow.expires_at).getTime() <= Date.now())) {
        throw new NotFoundException('NOT_FOUND');
      }

      const document = await client.query(`
        SELECT id, document_type, document_role, security_scan_status, deleted_at
        FROM public.uploaded_documents
        WHERE id = $1 AND uploaded_by_user_id = $2 AND deleted_at IS NULL
          AND security_scan_status = 'clean'
      `, [dto.document_id, userId]);
      if (!document.rows[0]) throw new BadRequestException('DOCUMENT_NOT_ELIGIBLE');

      let application: any;
      try {
        application = await client.query(`
          INSERT INTO public.job_applications
            (job_id, candidate_id, user_id, is_guest, cover_letter, answers_to_screening_questions)
          VALUES ($1, $2, $3, FALSE, $4, $5::jsonb)
          RETURNING id, status, applied_at
        `, [jobId, profile.id, userId, dto.cover_letter?.trim() || null, JSON.stringify(answers)]);
      } catch (error: any) {
        if (error?.code === '23505') {
          const existing = await client.query(`
            SELECT a.id AS application_id, a.status, a.applied_at, s.id AS snapshot_id,
                   s.source_profile_revision
            FROM public.job_applications a
            LEFT JOIN public.application_profile_snapshots s
              ON s.application_id = a.id AND s.snapshot_type = 'submitted'
            WHERE a.job_id = $1 AND a.candidate_id = $2 AND a.is_guest = FALSE
            LIMIT 1
          `, [jobId, profile.id]);
          if (existing.rows[0]) {
            const row = existing.rows[0];
            return { application_id: row.application_id, job_id: jobId, status: row.status, applied_at: row.applied_at, replayed: true, snapshot_summary: { snapshot_id: row.snapshot_id, profile_revision: row.source_profile_revision ?? null } };
          }
        }
        throw error;
      }
      const app = application.rows[0];
      const snapshotData = { profile: { id: profile.id, headline: profile.headline ?? null, summary: profile.summary ?? null, location_city: profile.location_city ?? null, location_state: profile.location_state ?? null, location_country: profile.location_country ?? null, preferred_work_mode: profile.preferred_work_mode ?? null, experience_years: profile.experience_years ?? null, education_level: profile.education_level ?? null, profile_revision: profile.profile_revision ?? null }, resume_document_id: dto.document_id, consent: true, screening_answers: answers };
      const snapshot = await client.query(`
        INSERT INTO public.application_profile_snapshots
          (application_id, snapshot_type, snapshot_version, schema_version, source_profile_revision,
           snapshot_data, resume_document_id, generated_by)
        VALUES ($1, 'submitted', 1, 'application.v1', $2, $3::jsonb, $4, 'candidate')
        RETURNING id
      `, [app.id, profile.profile_revision ?? null, JSON.stringify(snapshotData), dto.document_id]);
      await client.query(`INSERT INTO public.application_documents (application_id, document_id, document_role) VALUES ($1, $2, 'resume')`, [app.id, dto.document_id]);
      await client.query(`INSERT INTO public.application_status_history (application_id, from_status, to_status, changed_by, change_reason) VALUES ($1, NULL, 'applied', $2, 'application_submitted')`, [app.id, userId]);
      await client.query(`INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, changes) VALUES ($1, $2, 'application.submitted', 'job_application', $3, $4::jsonb)`, [jobRow.company_id, userId, app.id, JSON.stringify({ consent: true, snapshot_id: snapshot.rows[0].id })]);

      const eventId = randomUUID();
      const now = new Date().toISOString();
      await client.query(`
        INSERT INTO public.outbox_events
          (id, aggregate_type, aggregate_id, event_type, schema_version, payload, correlation_id, causation_id)
        VALUES ($1, 'job_application', $2, 'application.submitted', 1, $3::jsonb, $1, $1)
      `, [eventId, app.id, JSON.stringify({ schema_version: 1, event_id: eventId, aggregate_type: 'job_application', aggregate_id: app.id, event_type: 'application.submitted', payload: { application_id: app.id, job_id: jobId, company_id: jobRow.company_id, candidate_id: profile.id, is_guest: false, referral_invitation_id: null, snapshot_id: snapshot.rows[0].id, submitted_at: app.applied_at, trace_id: eventId }, occurred_at: now })]);
      return { application_id: app.id, job_id: jobId, status: app.status, applied_at: app.applied_at, snapshot_summary: { snapshot_id: snapshot.rows[0].id, profile_revision: profile.profile_revision ?? null } };
    });
  }

  async changeStatus(companyId: string, applicationId: string, userId: string, dto: ChangeApplicationStatusDto) {
    if (!isUuid(companyId) || !isUuid(applicationId) || !dto?.status) throw new BadRequestException('VALIDATION_ERROR');
    const allowed = new Set(['under_review','screening','shortlisted','rejected','withdrawn','on_hold','interview_scheduled','interview_completed','selected','offer_extended','offer_accepted','offer_declined']);
    if (!allowed.has(dto.status)) throw new BadRequestException('VALIDATION_ERROR');
    if (dto.status === 'rejected' && !dto.reason?.trim()) throw new BadRequestException('VALIDATION_ERROR');
    return this.system.transaction(async (client) => {
      const access = await client.query(`
        SELECT a.id FROM public.job_applications a
        JOIN public.jobs j ON j.id = a.job_id
        JOIN public.users u ON u.id = $2 AND u.status = 'active' AND u.deleted_at IS NULL
        WHERE a.id = $1 AND j.company_id = $3 AND a.deleted_at IS NULL
          AND u.role IN ('employer','hr','admin')
          AND (u.role = 'admin' OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = j.company_id AND c.owner_id = $2 AND c.deleted_at IS NULL)
            OR EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = j.company_id AND cm.user_id = $2 AND cm.is_active = TRUE AND cm.left_at IS NULL))
      `, [applicationId, userId, companyId]);
      if (!access.rows[0]) throw new NotFoundException('NOT_FOUND');
      try {
        await client.query(`SELECT public.change_application_status($1, $2::public.application_status, $3, $4, $5::jsonb)`, [applicationId, dto.status, userId, dto.reason?.trim() || null, JSON.stringify({ source: 'nestjs_api' })]);
      } catch (error: any) {
        if (String(error?.message || '').toLowerCase().includes('invalid application status transition')) throw new BadRequestException('INVALID_STATUS_TRANSITION');
        throw error;
      }
      const result = await client.query(`SELECT id, job_id, candidate_id, status, applied_at, updated_at FROM public.job_applications WHERE id = $1`, [applicationId]);
      return result.rows[0];
    });
  }
}

@Controller('api/v1/jobs')
@UseGuards(AuthGuard)
export class ApplicationController {
  constructor(private readonly applications: ApplicationService) {}

  @Post(':jobId/apply')
  submit(@Req() req: AuthRequest, @Param('jobId') jobId: string, @Body() dto: SubmitApplicationDto) {
    if (!req.user?.sub) throw new ForbiddenException('FORBIDDEN');
    return this.applications.submit(req.user.sub, jobId, dto);
  }

}

@Controller('api/v1/me/applications')
@UseGuards(AuthGuard)
export class CandidateApplicationReadController {
  constructor(private readonly system: SystemClient) {}
  @Get()
  async list(@Req() req: AuthRequest) {
    if (!req.user?.sub) throw new ForbiddenException('FORBIDDEN');
    const result = await this.system.query(`
      SELECT a.id AS application_id, a.job_id, a.status, a.applied_at,
             j.title AS job_title, j.company_id, s.id AS snapshot_id,
             s.source_profile_revision
      FROM public.job_applications a
      JOIN public.candidate_profiles cp ON cp.id = a.candidate_id AND cp.user_id = $1
      JOIN public.jobs j ON j.id = a.job_id
      LEFT JOIN public.application_profile_snapshots s ON s.application_id = a.id AND s.snapshot_type = 'submitted'
      WHERE a.user_id = $1 AND a.is_guest = FALSE AND a.deleted_at IS NULL
      ORDER BY a.applied_at DESC, a.id DESC LIMIT 100
    `, [req.user.sub]);
    return result.rows;
  }

  @Get(':applicationId')
  async detail(@Req() req: AuthRequest, @Param('applicationId') applicationId: string) {
    if (!req.user?.sub) throw new ForbiddenException('FORBIDDEN');
    const result = await this.system.query(`
      SELECT a.id AS application_id, a.job_id, a.status, a.applied_at,
             j.title AS job_title, j.company_id, s.id AS snapshot_id,
             s.source_profile_revision, s.snapshot_version, s.schema_version, s.generated_by, s.generated_at
      FROM public.job_applications a
      JOIN public.candidate_profiles cp ON cp.id = a.candidate_id AND cp.user_id = $1
      JOIN public.jobs j ON j.id = a.job_id
      LEFT JOIN public.application_profile_snapshots s ON s.application_id = a.id AND s.snapshot_type = 'submitted'
      WHERE a.id = $2 AND a.user_id = $1 AND a.is_guest = FALSE AND a.deleted_at IS NULL
    `, [req.user.sub, applicationId]);
    if (!result.rows[0]) throw new NotFoundException('NOT_FOUND');
    return result.rows[0];
  }

  @Get(':applicationId/history')
  async history(@Req() req: AuthRequest, @Param('applicationId') applicationId: string) {
    if (!req.user?.sub) throw new ForbiddenException('FORBIDDEN');
    const result = await this.system.query(`
      SELECT h.id, h.from_status, h.to_status, h.change_reason, h.created_at
      FROM public.application_status_history h
      JOIN public.job_applications a ON a.id = h.application_id
      WHERE h.application_id = $1 AND a.user_id = $2 AND a.is_guest = FALSE AND a.deleted_at IS NULL
      ORDER BY h.created_at ASC, h.id ASC
    `, [applicationId, req.user.sub]);
    return result.rows;
  }
}

@Controller('api/v1/companies/:companyId/applications')
@UseGuards(AuthGuard)
export class CompanyApplicationReadController {
  constructor(private readonly system: SystemClient) {}
  @Get()
  async list(@Req() req: AuthRequest, @Param('companyId') companyId: string) {
    if (!req.user?.sub) throw new ForbiddenException('FORBIDDEN');
    const result = await this.system.query(`
      SELECT a.id AS application_id, a.job_id, CASE WHEN a.is_guest THEN NULL ELSE a.candidate_id END AS candidate_id, a.status, a.is_guest, a.applied_at,
             j.title AS job_title, s.id AS snapshot_id, s.source_profile_revision,
             s.snapshot_version, s.schema_version, s.generated_by, s.generated_at
      FROM public.job_applications a
      JOIN public.jobs j ON j.id = a.job_id AND j.company_id = $1
      JOIN public.users u ON u.id = $2 AND u.status = 'active' AND u.deleted_at IS NULL
      LEFT JOIN public.application_profile_snapshots s ON s.application_id = a.id AND s.snapshot_type = 'submitted'
      WHERE a.deleted_at IS NULL
        AND (u.role = 'admin' OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = $1 AND c.owner_id = $2 AND c.deleted_at IS NULL)
          OR EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = $1 AND cm.user_id = $2 AND cm.is_active = TRUE AND cm.left_at IS NULL))
      ORDER BY a.applied_at DESC, a.id DESC LIMIT 100
    `, [companyId, req.user.sub]);
    return result.rows;
  }

  @Get(':applicationId')
  async detail(@Req() req: AuthRequest, @Param('companyId') companyId: string, @Param('applicationId') applicationId: string) {
    if (!req.user?.sub) throw new ForbiddenException('FORBIDDEN');
    const result = await this.system.query(`
      SELECT a.id AS application_id, a.job_id, CASE WHEN a.is_guest THEN NULL ELSE a.candidate_id END AS candidate_id, a.status, a.is_guest, a.applied_at,
             j.title AS job_title, s.id AS snapshot_id, s.source_profile_revision, s.snapshot_version, s.schema_version, s.generated_by, s.generated_at
      FROM public.job_applications a
      JOIN public.jobs j ON j.id = a.job_id AND j.company_id = $1
      JOIN public.users u ON u.id = $2 AND u.status = 'active' AND u.deleted_at IS NULL
      LEFT JOIN public.application_profile_snapshots s ON s.application_id = a.id AND s.snapshot_type = 'submitted'
      WHERE a.id = $3 AND a.deleted_at IS NULL
        AND (u.role = 'admin' OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = $1 AND c.owner_id = $2 AND c.deleted_at IS NULL)
          OR EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = $1 AND cm.user_id = $2 AND cm.is_active = TRUE AND cm.left_at IS NULL))
    `, [companyId, req.user.sub, applicationId]);
    if (!result.rows[0]) throw new NotFoundException('NOT_FOUND');
    return result.rows[0];
  }
}

@Controller('api/v1/companies/:companyId/applications')
@UseGuards(AuthGuard)
export class ApplicationStatusController {
  constructor(private readonly applications: ApplicationService) {}
  @Patch(':applicationId/status')
  changeStatus(@Req() req: AuthRequest, @Param('companyId') companyId: string, @Param('applicationId') applicationId: string, @Body() dto: ChangeApplicationStatusDto) {
    if (!req.user?.sub) throw new ForbiddenException('FORBIDDEN');
    return this.applications.changeStatus(companyId, applicationId, req.user.sub, dto);
  }
}
