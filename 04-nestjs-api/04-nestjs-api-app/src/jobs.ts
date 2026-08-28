import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard, RequestUser } from './auth';
import { SystemClient } from './clients';

type AuthRequest = Request & { user?: RequestUser };

const JOB_FIELDS = `j.id, j.company_id, j.title, j.slug, j.reference_code, j.employment_type,
  j.work_mode, j.experience_level, j.category, j.location_city, j.location_state,
  j.location_country, j.location_remote, j.salary_min, j.salary_max, j.salary_currency,
  j.salary_period, j.salary_visible, j.description, j.responsibilities, j.requirements,
  j.preferred_qualifications, j.benefits, j.vacancies, j.status, j.published_at, j.expires_at,
  j.paused_at, j.closed_at, j.is_featured, j.is_urgent, j.is_confidential, j.created_by,
  j.created_at, j.updated_at`;

@Injectable()
export class JobService {
  constructor(private readonly system: SystemClient) {}

  async createDraft(userId: string, companyId: string, dto: { title?: string; slug?: string; description?: string }) {
    const title = dto.title?.trim();
    const slug = dto.slug?.trim().toLowerCase();
    const description = dto.description?.trim();
    if (!title || !slug || !description || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new BadRequestException('VALIDATION_ERROR');
    }
    return this.system.transaction(async (client) => {
      const actor = await client.query<{ role: string }>(
        `SELECT u.role FROM public.users u
         WHERE u.id = $1 AND u.status = 'active' AND u.deleted_at IS NULL
           AND u.role IN ('employer', 'admin')`, [userId]);
      if (!actor.rows[0]) throw new ForbiddenException('FORBIDDEN');
      const company = await client.query(
        `SELECT c.id FROM public.companies c
         WHERE c.id = $1 AND c.deleted_at IS NULL
           AND (c.owner_id = $2 OR EXISTS (
             SELECT 1 FROM public.company_members cm
             WHERE cm.company_id = c.id AND cm.user_id = $2 AND cm.is_active = TRUE AND cm.left_at IS NULL
           ))`, [companyId, userId]);
      if (!company.rows[0]) throw new ForbiddenException('FORBIDDEN');
      const inserted = await client.query(
        `INSERT INTO public.jobs (company_id, created_by, title, slug, description, status)
         VALUES ($1, $2, $3, $4, $5, 'draft')
         RETURNING ${JOB_FIELDS.replaceAll('j.', '')}`, [companyId, userId, title, slug, description]);
      const job = inserted.rows[0];
      await client.query(
        `INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, new_values)
         VALUES ($1, $2, 'job.created', 'job', $3, $4::jsonb)`,
        [companyId, userId, job.id, JSON.stringify({ status: 'draft', title, slug })]);
      return job;
    });
  }

  async getCompanyJob(userId: string, companyId: string, jobId: string) {
    const result = await this.system.query(`
      SELECT ${JOB_FIELDS}
      FROM public.jobs j
      WHERE j.id = $1 AND j.company_id = $2 AND j.deleted_at IS NULL
        AND EXISTS (
          SELECT 1 FROM public.users requester
          WHERE requester.id = $3 AND requester.status = 'active' AND requester.deleted_at IS NULL
        )
        AND (
          j.created_by = $3
          OR EXISTS (
            SELECT 1 FROM public.companies c
            WHERE c.id = j.company_id AND c.owner_id = $3 AND c.deleted_at IS NULL
          )
          OR EXISTS (
            SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = j.company_id AND cm.user_id = $3
              AND cm.is_active = TRUE AND cm.left_at IS NULL
          )
        )
    `, [jobId, companyId, userId]);
    if (!result.rows[0]) throw new NotFoundException('NOT_FOUND');
    return result.rows[0];
  }

  async updateDraft(userId: string, companyId: string, jobId: string, dto: { title?: string; slug?: string; description?: string }) {
    const allowed: Record<string, string> = {};
    if (dto.title !== undefined) { if (!dto.title.trim()) throw new BadRequestException('VALIDATION_ERROR'); allowed.title = dto.title.trim(); }
    if (dto.description !== undefined) { if (!dto.description.trim()) throw new BadRequestException('VALIDATION_ERROR'); allowed.description = dto.description.trim(); }
    if (dto.slug !== undefined) { const slug = dto.slug.trim().toLowerCase(); if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new BadRequestException('VALIDATION_ERROR'); allowed.slug = slug; }
    const entries = Object.entries(allowed);
    if (!entries.length) throw new BadRequestException('VALIDATION_ERROR');
    return this.system.transaction(async (client) => {
      const actor = await client.query(`SELECT u.role FROM public.users u WHERE u.id = $1 AND u.status = 'active' AND u.deleted_at IS NULL AND u.role IN ('employer', 'admin')`, [userId]);
      if (!actor.rows[0]) throw new ForbiddenException('FORBIDDEN');
      const sets = entries.map(([key], index) => `${key} = $${index + 4}`).join(', ');
      const values = [jobId, companyId, userId, ...entries.map(([, value]) => value)];
      const updated = await client.query(`UPDATE public.jobs j SET ${sets}, updated_at = NOW()
        WHERE j.id = $1 AND j.company_id = $2 AND j.status = 'draft' AND j.deleted_at IS NULL
          AND (j.created_by = $3 OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = j.company_id AND c.owner_id = $3 AND c.deleted_at IS NULL)
            OR EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = j.company_id AND cm.user_id = $3 AND cm.is_active = TRUE AND cm.left_at IS NULL))
        RETURNING ${JOB_FIELDS.replaceAll('j.', '')}`, values);
      if (!updated.rows[0]) throw new NotFoundException('NOT_FOUND');
      await client.query(`INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, changes) VALUES ($1, $2, 'job.updated', 'job', $3, $4::jsonb)`, [companyId, userId, jobId, JSON.stringify(allowed)]);
      return updated.rows[0];
    });
  }

  async publish(userId: string, companyId: string, jobId: string) {
    return this.system.transaction(async (client) => {
      const actor = await client.query(`SELECT u.role FROM public.users u WHERE u.id = $1 AND u.status = 'active' AND u.deleted_at IS NULL AND u.role IN ('employer', 'admin')`, [userId]);
      if (!actor.rows[0]) throw new ForbiddenException('FORBIDDEN');
      const result = await client.query(`
        UPDATE public.jobs j
        SET status = CASE WHEN COALESCE(cs.job_approval_required, FALSE) THEN 'pending_approval'::job_status ELSE 'published'::job_status END,
            published_at = CASE WHEN COALESCE(cs.job_approval_required, FALSE) THEN NULL ELSE NOW() END,
            published_by = CASE WHEN COALESCE(cs.job_approval_required, FALSE) THEN NULL ELSE $3 END,
            updated_at = NOW()
        FROM public.company_settings cs
        JOIN public.companies c ON c.id = j.company_id
        WHERE j.id = $1 AND j.company_id = $2 AND cs.company_id = j.company_id
          AND j.status = 'draft' AND j.deleted_at IS NULL
          AND (COALESCE(cs.job_approval_required, FALSE) OR c.verification_status = 'verified')
          AND (j.created_by = $3 OR EXISTS (SELECT 1 FROM public.companies c2 WHERE c2.id = j.company_id AND c2.owner_id = $3 AND c2.deleted_at IS NULL)
            OR EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = j.company_id AND cm.user_id = $3 AND cm.is_active = TRUE AND cm.left_at IS NULL))
        RETURNING ${JOB_FIELDS.replaceAll('j.', '')}`, [jobId, companyId, userId]);
      if (!result.rows[0]) throw new NotFoundException('NOT_FOUND');
      const action = result.rows[0].status === 'published' ? 'job.published' : 'job.publish_requested';
      await client.query(`INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, changes) VALUES ($1, $2, $3, 'job', $4, $5::jsonb)`, [companyId, userId, action, jobId, JSON.stringify({ resulting_status: result.rows[0].status })]);
      return result.rows[0];
    });
  }

  async transition(userId: string, companyId: string, jobId: string, command: 'pause' | 'resume' | 'close') {
    const transitions = { pause: { from: 'published', to: 'paused' }, resume: { from: 'paused', to: 'published' }, close: { from: 'published', to: 'closed' } } as const;
    const transition = transitions[command];
    return this.system.transaction(async (client) => {
      const actor = await client.query(`SELECT u.role FROM public.users u WHERE u.id = $1 AND u.status = 'active' AND u.deleted_at IS NULL AND u.role IN ('employer', 'admin')`, [userId]);
      if (!actor.rows[0]) throw new ForbiddenException('FORBIDDEN');
      const timestamp = command === 'pause' ? 'paused_at' : command === 'close' ? 'closed_at' : null;
      const setClause = timestamp ? `status = $4::job_status, ${timestamp} = NOW(), updated_at = NOW()` : `status = $4::job_status, updated_at = NOW()`;
      const result = await client.query(`UPDATE public.jobs j SET ${setClause}
        WHERE j.id = $1 AND j.company_id = $2 AND j.status = $3::job_status AND j.deleted_at IS NULL
          AND (j.created_by = $5 OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = j.company_id AND c.owner_id = $5 AND c.deleted_at IS NULL)
            OR EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = j.company_id AND cm.user_id = $5 AND cm.is_active = TRUE AND cm.left_at IS NULL))
        RETURNING ${JOB_FIELDS.replaceAll('j.', '')}`, [jobId, companyId, transition.from, transition.to, userId]);
      if (!result.rows[0]) throw new NotFoundException('NOT_FOUND');
      await client.query(`INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, changes) VALUES ($1, $2, 'job.status_changed', 'job', $3, $4::jsonb)`, [companyId, userId, jobId, JSON.stringify({ from: transition.from, to: transition.to })]);
      return result.rows[0];
    });
  }

  async submitForApproval(userId: string, companyId: string, jobId: string) {
    return this.system.transaction(async (client) => {
      const actor = await client.query(`SELECT u.role FROM public.users u WHERE u.id = $1 AND u.status = 'active' AND u.deleted_at IS NULL AND u.role IN ('employer', 'admin')`, [userId]);
      if (!actor.rows[0]) throw new ForbiddenException('FORBIDDEN');
      const result = await client.query(`UPDATE public.jobs j SET status = 'pending_approval'::job_status, updated_at = NOW()
        WHERE j.id = $1 AND j.company_id = $2 AND j.status = 'draft' AND j.deleted_at IS NULL
          AND (j.created_by = $3 OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = j.company_id AND c.owner_id = $3 AND c.deleted_at IS NULL)
            OR EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = j.company_id AND cm.user_id = $3 AND cm.is_active = TRUE AND cm.left_at IS NULL))
        RETURNING ${JOB_FIELDS.replaceAll('j.', '')}`, [jobId, companyId, userId]);
      if (!result.rows[0]) throw new NotFoundException('NOT_FOUND');
      await client.query(`INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, changes) VALUES ($1, $2, 'job.publish_requested', 'job', $3, $4::jsonb)`, [companyId, userId, jobId, JSON.stringify({ from: 'draft', to: 'pending_approval' })]);
      return result.rows[0];
    });
  }

  async approve(userId: string, companyId: string, jobId: string) {
    return this.system.transaction(async (client) => {
      const actor = await client.query(`SELECT u.role FROM public.users u WHERE u.id = $1 AND u.status = 'active' AND u.deleted_at IS NULL AND u.role IN ('employer', 'admin')`, [userId]);
      if (!actor.rows[0]) throw new ForbiddenException('FORBIDDEN');
      const result = await client.query(`UPDATE public.jobs j SET status = 'published'::job_status, published_at = NOW(), published_by = $3, approved_at = NOW(), approved_by = $3, updated_at = NOW()
        FROM public.companies c WHERE j.id = $1 AND j.company_id = $2 AND c.id = j.company_id AND c.verification_status = 'verified'
          AND j.status = 'pending_approval' AND j.deleted_at IS NULL
          AND (c.owner_id = $3 OR EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = j.company_id AND cm.user_id = $3 AND cm.is_active = TRUE AND cm.left_at IS NULL))
        RETURNING ${JOB_FIELDS.replaceAll('j.', '')}`, [jobId, companyId, userId]);
      if (!result.rows[0]) throw new NotFoundException('NOT_FOUND');
      await client.query(`INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, changes) VALUES ($1, $2, 'job.approved', 'job', $3, $4::jsonb)`, [companyId, userId, jobId, JSON.stringify({ from: 'pending_approval', to: 'published' })]);
      return result.rows[0];
    });
  }

  async reject(userId: string, companyId: string, jobId: string, reason?: string) {
    if (!reason?.trim()) throw new BadRequestException('VALIDATION_ERROR');
    return this.system.transaction(async (client) => {
      const actor = await client.query(`SELECT u.role FROM public.users u WHERE u.id = $1 AND u.status = 'active' AND u.deleted_at IS NULL AND u.role IN ('employer', 'admin')`, [userId]);
      if (!actor.rows[0]) throw new ForbiddenException('FORBIDDEN');
      const result = await client.query(`UPDATE public.jobs j SET status = 'draft'::job_status, updated_at = NOW()
        FROM public.companies c WHERE j.id = $1 AND j.company_id = $2 AND c.id = j.company_id AND j.status = 'pending_approval' AND j.deleted_at IS NULL
          AND (c.owner_id = $3 OR EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = j.company_id AND cm.user_id = $3 AND cm.is_active = TRUE AND cm.left_at IS NULL))
        RETURNING ${JOB_FIELDS.replaceAll('j.', '')}`, [jobId, companyId, userId]);
      if (!result.rows[0]) throw new NotFoundException('NOT_FOUND');
      await client.query(`INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, changes) VALUES ($1, $2, 'job.rejected', 'job', $3, $4::jsonb)`, [companyId, userId, jobId, JSON.stringify({ from: 'pending_approval', to: 'draft', reason: reason.trim() })]);
      return result.rows[0];
    });
  }

  async archive(userId: string, companyId: string, jobId: string, reason?: string) {
    return this.system.transaction(async (client) => {
      const actor = await client.query(`SELECT u.role FROM public.users u WHERE u.id = $1 AND u.status = 'active' AND u.deleted_at IS NULL AND u.role IN ('employer', 'admin')`, [userId]);
      if (!actor.rows[0]) throw new ForbiddenException('FORBIDDEN');
      const result = await client.query(`UPDATE public.jobs j SET status = 'archived'::job_status, updated_at = NOW()
        FROM public.companies c WHERE j.id = $1 AND j.company_id = $2 AND c.id = j.company_id AND j.status IN ('closed', 'expired') AND j.deleted_at IS NULL
          AND (c.owner_id = $3 OR EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = j.company_id AND cm.user_id = $3 AND cm.is_active = TRUE AND cm.left_at IS NULL))
        RETURNING ${JOB_FIELDS.replaceAll('j.', '')}`, [jobId, companyId, userId]);
      if (!result.rows[0]) throw new NotFoundException('NOT_FOUND');
      await client.query(`INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, changes) VALUES ($1, $2, 'job.archived', 'job', $3, $4::jsonb)`, [companyId, userId, jobId, JSON.stringify({ to: 'archived', reason: reason?.trim() ?? null })]);
      return result.rows[0];
    });
  }
}

@Controller('api/v1/companies/:companyId/jobs')
@UseGuards(AuthGuard)
export class JobController {
  constructor(private readonly jobs: JobService) {}

  @Post()
  create(@Req() req: AuthRequest, @Param('companyId') companyId: string, @Body() dto: { title?: string; slug?: string; description?: string }) {
    if (!req.user?.sub) throw new ForbiddenException('FORBIDDEN');
    return this.jobs.createDraft(req.user.sub, companyId, dto);
  }

  @Patch(':jobId')
  update(@Req() req: AuthRequest, @Param('companyId') companyId: string, @Param('jobId') jobId: string, @Body() dto: { title?: string; slug?: string; description?: string }) {
    if (!req.user?.sub) throw new ForbiddenException('FORBIDDEN');
    return this.jobs.updateDraft(req.user.sub, companyId, jobId, dto);
  }

  @Post(':jobId/publish')
  publish(@Req() req: AuthRequest, @Param('companyId') companyId: string, @Param('jobId') jobId: string) {
    if (!req.user?.sub) throw new ForbiddenException('FORBIDDEN');
    return this.jobs.publish(req.user.sub, companyId, jobId);
  }

  @Post(':jobId/pause')
  pause(@Req() req: AuthRequest, @Param('companyId') companyId: string, @Param('jobId') jobId: string) {
    if (!req.user?.sub) throw new ForbiddenException('FORBIDDEN');
    return this.jobs.transition(req.user.sub, companyId, jobId, 'pause');
  }

  @Post(':jobId/resume')
  resume(@Req() req: AuthRequest, @Param('companyId') companyId: string, @Param('jobId') jobId: string) {
    if (!req.user?.sub) throw new ForbiddenException('FORBIDDEN');
    return this.jobs.transition(req.user.sub, companyId, jobId, 'resume');
  }

  @Post(':jobId/close')
  close(@Req() req: AuthRequest, @Param('companyId') companyId: string, @Param('jobId') jobId: string) {
    if (!req.user?.sub) throw new ForbiddenException('FORBIDDEN');
    return this.jobs.transition(req.user.sub, companyId, jobId, 'close');
  }

  @Post(':jobId/submit-for-approval')
  submitForApproval(@Req() req: AuthRequest, @Param('companyId') companyId: string, @Param('jobId') jobId: string) {
    if (!req.user?.sub) throw new ForbiddenException('FORBIDDEN');
    return this.jobs.submitForApproval(req.user.sub, companyId, jobId);
  }

  @Post(':jobId/approve')
  approve(@Req() req: AuthRequest, @Param('companyId') companyId: string, @Param('jobId') jobId: string) {
    if (!req.user?.sub) throw new ForbiddenException('FORBIDDEN');
    return this.jobs.approve(req.user.sub, companyId, jobId);
  }

  @Post(':jobId/reject')
  reject(@Req() req: AuthRequest, @Param('companyId') companyId: string, @Param('jobId') jobId: string, @Body() body: { reason?: string }) {
    if (!req.user?.sub) throw new ForbiddenException('FORBIDDEN');
    return this.jobs.reject(req.user.sub, companyId, jobId, body?.reason);
  }

  @Post(':jobId/archive')
  archive(@Req() req: AuthRequest, @Param('companyId') companyId: string, @Param('jobId') jobId: string, @Body() body: { reason?: string }) {
    if (!req.user?.sub) throw new ForbiddenException('FORBIDDEN');
    return this.jobs.archive(req.user.sub, companyId, jobId, body?.reason);
  }

  @Get(':jobId')
  get(@Req() req: AuthRequest, @Param('companyId') companyId: string, @Param('jobId') jobId: string) {
    if (!req.user?.sub) throw new ForbiddenException('FORBIDDEN');
    return this.jobs.getCompanyJob(req.user.sub, companyId, jobId);
  }
}
