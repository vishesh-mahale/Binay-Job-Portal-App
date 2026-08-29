import { BadRequestException, ConflictException, Controller, Delete, Get, Injectable, NotFoundException, Patch, Body, Param, Req, UseGuards } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth';
import { UserContextClient, SystemClient } from '../../infrastructure/database/clients';
import { Allow, IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateCandidateProfileDto {
  @Allow() @IsInt() @Min(1) expected_profile_revision!: number;
  @Allow() @IsOptional() @IsString() professional_title?: string | null;
  @Allow() @IsOptional() @IsString() summary?: string | null;
  @Allow() @IsOptional() @IsString() current_location?: string | null;
  @Allow() @IsOptional() @IsString() city?: string | null;
  @Allow() @IsOptional() @IsString() state?: string | null;
  @Allow() @IsOptional() @IsString() country?: string | null;
  @Allow() @IsOptional() @IsString() postal_code?: string | null;
  @Allow() @IsOptional() @IsString() preferred_work_mode?: string | null;
  @Allow() @IsOptional() @IsBoolean() willing_to_relocate?: boolean;
  @Allow() @IsOptional() @IsBoolean() willing_to_travel?: boolean;
  @Allow() @IsOptional() @IsBoolean() remote_experience?: boolean;
  @Allow() @IsOptional() @IsNumber() notice_period_days?: number | null;
  @Allow() @IsOptional() @IsNumber() expected_salary_min?: number | null;
  @Allow() @IsOptional() @IsNumber() expected_salary_max?: number | null;
  @Allow() @IsOptional() @IsString() work_authorization?: string | null;
  @Allow() @IsOptional() @IsBoolean() visa_sponsorship_needed?: boolean;
  @Allow() @IsOptional() @IsBoolean() is_open_to_work?: boolean;
  @Allow() @IsOptional() @IsString() available_from?: string | null;
}

export class ArchiveCandidateFactDto {
  @Allow() @IsInt() @Min(1) expected_profile_revision!: number;
}

@Injectable()
export class CandidateService {
  constructor(private readonly userClient: UserContextClient, private readonly system: SystemClient) {}

  async getOwnProfile(request: AuthenticatedRequest) {
    const token = request.rawAccessToken ?? '';
    const result = await this.userClient.queryAsUser(token, `
      SELECT jsonb_build_object(
        'profile', to_jsonb(cp) - ARRAY['deleted_at','user_id'],
        'links', COALESCE((SELECT jsonb_agg(to_jsonb(x) - ARRAY['deleted_at','source_document_id','source_parsing_result_id','primary_source_type','verification_status','candidate_confirmed_at'] ORDER BY x.created_at) FROM public.candidate_links x WHERE x.candidate_id = cp.id AND x.deleted_at IS NULL), '[]'::jsonb),
        'skills', COALESCE((SELECT jsonb_agg(to_jsonb(x) - ARRAY['deleted_at','source_document_id','source_parsing_result_id','primary_source_type','verification_status','candidate_confirmed_at'] ORDER BY x.created_at) FROM public.candidate_skills x WHERE x.candidate_id = cp.id AND x.deleted_at IS NULL), '[]'::jsonb),
        'experiences', COALESCE((SELECT jsonb_agg(to_jsonb(x) - ARRAY['deleted_at','source_document_id','source_parsing_result_id','primary_source_type','verification_status','candidate_confirmed_at'] ORDER BY x.created_at) FROM public.candidate_experiences x WHERE x.candidate_id = cp.id AND x.deleted_at IS NULL), '[]'::jsonb),
        'educations', COALESCE((SELECT jsonb_agg(to_jsonb(x) - ARRAY['deleted_at','source_document_id','source_parsing_result_id','primary_source_type','verification_status','candidate_confirmed_at'] ORDER BY x.created_at) FROM public.candidate_educations x WHERE x.candidate_id = cp.id AND x.deleted_at IS NULL), '[]'::jsonb),
        'certifications', COALESCE((SELECT jsonb_agg(to_jsonb(x) - ARRAY['deleted_at','source_document_id','source_parsing_result_id','primary_source_type','verification_status','candidate_confirmed_at'] ORDER BY x.created_at) FROM public.candidate_certifications x WHERE x.candidate_id = cp.id AND x.deleted_at IS NULL), '[]'::jsonb),
        'projects', COALESCE((SELECT jsonb_agg(to_jsonb(x) - ARRAY['deleted_at','source_document_id','source_parsing_result_id','primary_source_type','verification_status','candidate_confirmed_at'] ORDER BY x.created_at) FROM public.candidate_projects x WHERE x.candidate_id = cp.id AND x.deleted_at IS NULL), '[]'::jsonb),
        'languages', COALESCE((SELECT jsonb_agg(to_jsonb(x) - ARRAY['deleted_at','source_document_id','source_parsing_result_id','primary_source_type','verification_status','candidate_confirmed_at'] ORDER BY x.created_at) FROM public.candidate_languages x WHERE x.candidate_id = cp.id AND x.deleted_at IS NULL), '[]'::jsonb),
        'awards', COALESCE((SELECT jsonb_agg(to_jsonb(x) - ARRAY['deleted_at','source_document_id','source_parsing_result_id','primary_source_type','verification_status','candidate_confirmed_at'] ORDER BY x.created_at) FROM public.candidate_awards x WHERE x.candidate_id = cp.id AND x.deleted_at IS NULL), '[]'::jsonb)
      ) AS profile
      FROM public.candidate_profiles cp
      WHERE cp.user_id = $1 AND cp.deleted_at IS NULL
    `, [request.user?.sub]);
    if (!result.rows[0]) throw new NotFoundException('NOT_FOUND');
    return result.rows[0].profile;
  }

  async getResumeStatus(request: AuthenticatedRequest, documentId: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(documentId)) {
      throw new NotFoundException('NOT_FOUND');
    }
    const result = await this.system.query(`
      SELECT d.id AS document_id, d.security_scan_status, d.processing_status,
             d.created_at AS uploaded_at, d.updated_at,
             j.id AS parsing_job_id, j.status AS parsing_job_status,
             j.started_at, j.completed_at, j.failed_at
      FROM public.uploaded_documents d
      LEFT JOIN LATERAL (
        SELECT rpj.* FROM public.resume_parsing_jobs rpj
        WHERE rpj.document_id = d.id ORDER BY rpj.created_at DESC LIMIT 1
      ) j ON TRUE
      WHERE d.id = $1 AND d.uploaded_by_user_id = $2 AND d.deleted_at IS NULL
    `, [documentId, request.user?.sub]);
    const row = result.rows[0];
    if (!row) throw new NotFoundException('NOT_FOUND');
    const scan = String(row.security_scan_status);
    const processing = row.processing_status ? String(row.processing_status) : null;
    let stage: string;
    let retryable = false;
    if (scan === 'pending' || scan === 'scanning') stage = scan === 'scanning' ? 'SECURITY_SCANNING' : 'UPLOADED';
    else if (scan === 'infected' || scan === 'quarantined') stage = 'SECURITY_REJECTED';
    else if (scan === 'failed') { stage = 'SECURITY_RETRYABLE_FAILURE'; retryable = true; }
    else if (!processing || processing === 'uploaded' || processing === 'queued') stage = processing === 'queued' ? 'PARSING_QUEUED' : 'UPLOADED';
    else if (processing === 'processing') stage = 'PARSING_IN_PROGRESS';
    else if (processing === 'partial') stage = 'REVIEW_READY_PARTIAL';
    else if (processing === 'completed') stage = 'REVIEW_READY';
    else { stage = 'PARSING_FAILED'; retryable = processing !== 'cancelled'; }
    return { document_id: row.document_id, security_scan_status: scan, processing_status: processing, stage, retryable, parsing_job_id: row.parsing_job_id, timestamps: { uploaded_at: row.uploaded_at, updated_at: row.updated_at, started_at: row.started_at, completed_at: row.completed_at, failed_at: row.failed_at } };
  }

  async getParsedData(request: AuthenticatedRequest, documentId: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(documentId)) {
      throw new NotFoundException('NOT_FOUND');
    }
    const result = await this.system.query(`
      SELECT d.id AS document_id, d.security_scan_status, d.processing_status,
             j.id AS parsing_job_id, p.schema_version, p.overall_confidence,
             p.confidence_details, p.validation_result, p.normalized_output,
             p.created_at
      FROM public.uploaded_documents d
      JOIN LATERAL (
        SELECT rpj.* FROM public.resume_parsing_jobs rpj
        WHERE rpj.document_id = d.id ORDER BY rpj.created_at DESC LIMIT 1
      ) j ON TRUE
      JOIN public.resume_parsed_data p
        ON p.parsing_job_id = j.id AND p.document_id = d.id
      WHERE d.id = $1 AND d.uploaded_by_user_id = $2 AND d.deleted_at IS NULL
    `, [documentId, request.user?.sub]);
    const row = result.rows[0];
    if (!row) throw new NotFoundException('NOT_FOUND');
    if (String(row.security_scan_status) !== 'clean') throw new NotFoundException('NOT_FOUND');
    const source = row.normalized_output && typeof row.normalized_output === 'object' ? row.normalized_output : {};
    const allowed = ['contact_info', 'professional_title', 'summary', 'skills', 'experiences', 'educations', 'certifications', 'languages'];
    const normalized_output = Object.fromEntries(allowed.filter((key) => Object.prototype.hasOwnProperty.call(source, key)).map((key) => [key, source[key]]));
    return {
      document_id: row.document_id,
      parsing_job_id: row.parsing_job_id,
      schema_version: row.schema_version,
      overall_confidence: row.overall_confidence,
      confidence_details: row.confidence_details,
      validation_result: row.validation_result,
      normalized_output,
      partial: String(row.processing_status) === 'partial',
      created_at: row.created_at,
    };
  }

  async updateOwnProfile(request: AuthenticatedRequest, body: UpdateCandidateProfileDto) {
    if (!Number.isInteger(body.expected_profile_revision) || body.expected_profile_revision < 1) {
      throw new BadRequestException('VALIDATION_ERROR');
    }
    const allowed: Record<string, string> = {
      professional_title: 'professional_title', summary: 'summary', current_location: 'current_location',
      city: 'city', state: 'state', country: 'country', postal_code: 'postal_code',
      preferred_work_mode: 'preferred_work_mode', willing_to_relocate: 'willing_to_relocate',
      willing_to_travel: 'willing_to_travel', remote_experience: 'remote_experience',
      notice_period_days: 'notice_period_days', expected_salary_min: 'expected_salary_min',
      expected_salary_max: 'expected_salary_max', work_authorization: 'work_authorization',
      visa_sponsorship_needed: 'visa_sponsorship_needed', is_open_to_work: 'is_open_to_work',
      available_from: 'available_from',
    };
    const fields = Object.keys(allowed).filter((key) => Object.prototype.hasOwnProperty.call(body, key));
    if (fields.length === 0) throw new BadRequestException('VALIDATION_ERROR');
    return this.system.transaction(async (client) => {
      const current = await client.query(`SELECT cp.* FROM public.candidate_profiles cp WHERE cp.user_id = $1 AND cp.deleted_at IS NULL FOR UPDATE`, [request.user?.sub]);
      if (!current.rows[0]) throw new NotFoundException('NOT_FOUND');
      const profile = current.rows[0];
      if (Number(profile.profile_revision) !== body.expected_profile_revision) throw new ConflictException('STALE_REVISION');
      const before = { ...profile };
      const values: unknown[] = [];
      const sets = fields.map((field, index) => { values.push((body as any)[field]); return `\"${allowed[field]}\" = $${index + 1}`; });
      values.push(profile.id);
      const updated = await client.query(`UPDATE public.candidate_profiles SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`, values);
      const revision = await client.query(`SELECT public.bump_candidate_profile_revision($1) AS revision`, [profile.id]);
      const newRevision = Number(revision.rows[0].revision);
      const after = { ...updated.rows[0], profile_revision: newRevision };
      await client.query(`INSERT INTO public.profile_change_history (candidate_id, profile_revision, entity_type, entity_id, operation, changed_by_user_id, change_source, before_data, after_data) VALUES ($1,$2,'candidate_profile',$1,'update',$3,'candidate_manual',$4::jsonb,$5::jsonb)`, [profile.id, newRevision, request.user?.sub, JSON.stringify(before), JSON.stringify(after)]);
      const eventId = randomUUID();
      await client.query(`INSERT INTO public.outbox_events (id, aggregate_type, aggregate_id, event_type, schema_version, payload, correlation_id, causation_id) VALUES ($1,'candidate',$2,'candidate.profile.changed',1,$3::jsonb,$1,$1)`, [eventId, profile.id, JSON.stringify({ schema_version: 1, event_id: eventId, aggregate_id: profile.id, trace_id: eventId, change_type: 'profile_updated' })]);
      return { candidate_id: profile.id, profile_revision: newRevision, projection_queued: true };
    });
  }

  async archiveFact(request: AuthenticatedRequest, factType: string, factId: string, body: ArchiveCandidateFactDto) {
    if (!Number.isInteger(body?.expected_profile_revision) || body.expected_profile_revision < 1) {
      throw new BadRequestException('VALIDATION_ERROR');
    }
    const tables: Record<string, string> = {
      links: 'candidate_links', skills: 'candidate_skills', experiences: 'candidate_experiences',
      educations: 'candidate_educations', certifications: 'candidate_certifications',
      projects: 'candidate_projects', languages: 'candidate_languages', awards: 'candidate_awards',
    };
    const table = tables[factType];
    if (!table || !/^[0-9a-f-]{36}$/i.test(factId)) throw new NotFoundException('NOT_FOUND');
    return this.system.transaction(async (client) => {
      const candidate = await client.query('SELECT cp.* FROM public.candidate_profiles cp WHERE cp.user_id = $1 AND cp.deleted_at IS NULL FOR UPDATE', [request.user?.sub]);
      if (!candidate.rows[0]) throw new NotFoundException('NOT_FOUND');
      const profile = candidate.rows[0];
      if (Number(profile.profile_revision) !== body.expected_profile_revision) throw new ConflictException('STALE_REVISION');
      const fact = await client.query(`SELECT * FROM public.${table} WHERE id = $1 AND candidate_id = $2 AND deleted_at IS NULL FOR UPDATE`, [factId, profile.id]);
      if (!fact.rows[0]) throw new NotFoundException('NOT_FOUND');
      const updated = await client.query(`UPDATE public.${table} SET deleted_at = NOW() WHERE id = $1 AND candidate_id = $2 AND deleted_at IS NULL RETURNING *`, [factId, profile.id]);
      const revision = await client.query('SELECT public.bump_candidate_profile_revision($1) AS revision', [profile.id]);
      const newRevision = Number(revision.rows[0].revision);
      await client.query(`INSERT INTO public.profile_change_history (candidate_id, profile_revision, entity_type, entity_id, operation, changed_by_user_id, change_source, before_data, after_data) VALUES ($1,$2,$3,$4,'soft_delete',$5,'candidate_manual',$6::jsonb,$7::jsonb)`, [profile.id, newRevision, factType, factId, request.user?.sub, JSON.stringify(fact.rows[0]), JSON.stringify(updated.rows[0])]);
      const eventId = randomUUID();
      await client.query(`INSERT INTO public.outbox_events (id, aggregate_type, aggregate_id, event_type, schema_version, payload, correlation_id, causation_id) VALUES ($1,'candidate',$2,'candidate.profile.changed',1,$3::jsonb,$1,$1)`, [eventId, profile.id, JSON.stringify({ schema_version: 1, event_id: eventId, aggregate_id: profile.id, trace_id: eventId, change_type: 'profile_updated' })]);
      return { candidate_id: profile.id, profile_revision: newRevision, archived_fact_type: factType, archived_fact_id: factId, projection_queued: true };
    });
  }
}

@Controller('api/v1/candidates')
@UseGuards(AuthGuard)
export class CandidateController {
  constructor(private readonly candidate: CandidateService) {}
  @Get('me')
  async me(@Req() request: AuthenticatedRequest) { return this.candidate.getOwnProfile(request); }

  @Patch('me')
  async update(@Req() request: AuthenticatedRequest, @Body() body: UpdateCandidateProfileDto) {
    return this.candidate.updateOwnProfile(request, body);
  }

  @Delete('me/facts/:factType/:factId')
  async archive(@Req() request: AuthenticatedRequest, @Param('factType') factType: string, @Param('factId') factId: string, @Body() body: ArchiveCandidateFactDto) {
    return this.candidate.archiveFact(request, factType, factId, body);
  }
}

@Controller('api/v1/resumes')
@UseGuards(AuthGuard)
export class ResumeStatusController {
  constructor(private readonly candidate: CandidateService) {}
  @Get(':id/status')
  async status(@Req() request: AuthenticatedRequest, @Param('id') documentId: string) {
    return this.candidate.getResumeStatus(request, documentId);
  }

  @Get(':id/parsed-data')
  async parsedData(@Req() request: AuthenticatedRequest, @Param('id') documentId: string) {
    return this.candidate.getParsedData(request, documentId);
  }
}