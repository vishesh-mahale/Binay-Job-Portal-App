import { BadRequestException, ConflictException, Controller, Delete, Get, Injectable, NotFoundException, Patch, Body, Param, Req, UseGuards } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuthGuard, AuthenticatedRequest } from '../auth/auth';
import { UserContextClient, SystemClient } from '../../infrastructure/database/clients';
import { Allow, IsArray, IsBoolean, IsInt, IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';
import { clampText, toEnumValue, toSmallInt, toDecimal41, toIsoDate, normalizeLinkUrl, toJsonArray, textOrNull, EMPLOYMENT_TYPES } from './resume';

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
  @Allow() @IsOptional() @IsString() date_of_birth?: string | null;
  @Allow() @IsOptional() @IsString() gender?: string | null;
  @Allow() @IsOptional() @IsString() nationality?: string | null;
  @Allow() @IsOptional() @IsString() resume_phone?: string | null;
  @Allow() @IsOptional() @IsNumber() years_of_experience?: number | null;
  @Allow() @IsOptional() @IsString() salary_currency?: string | null;
  @Allow() @IsOptional() @IsString() first_name?: string | null;
  @Allow() @IsOptional() @IsString() middle_name?: string | null;
  @Allow() @IsOptional() @IsString() last_name?: string | null;
}

export class ArchiveCandidateFactDto {
  @Allow() @IsInt() @Min(1) expected_profile_revision!: number;
}

export class UpdateCandidateFactsDto {
  @Allow() @IsInt() @Min(1) expected_profile_revision!: number;
  @Allow() @IsOptional() @IsArray() skills?: any[];
  @Allow() @IsOptional() @IsArray() experiences?: any[];
  @Allow() @IsOptional() @IsArray() educations?: any[];
  @Allow() @IsOptional() @IsArray() certifications?: any[];
  @Allow() @IsOptional() @IsArray() projects?: any[];
  @Allow() @IsOptional() @IsArray() languages?: any[];
  @Allow() @IsOptional() @IsArray() awards?: any[];
  @Allow() @IsOptional() @IsArray() links?: any[];
  [key: string]: unknown;
}

@Injectable()
export class CandidateService {
  constructor(private readonly userClient: UserContextClient, private readonly system: SystemClient) {}

  async listOwnResumes(request: AuthenticatedRequest) {
    const result = await this.system.query(`
      SELECT d.id AS document_id, cpd.document_role, cpd.version_number, cpd.is_current, cpd.unlinked_at,
             d.created_at AS uploaded_at, d.updated_at,
             d.security_scan_status, d.processing_status
      FROM public.candidate_profile_documents cpd
      JOIN public.candidate_profiles cp ON cp.id = cpd.candidate_id
      JOIN public.uploaded_documents d ON d.id = cpd.document_id
      WHERE cp.user_id = $1 AND cp.deleted_at IS NULL
        AND cpd.document_role = 'resume'
        AND d.deleted_at IS NULL
      ORDER BY cpd.is_current DESC, cpd.version_number DESC, d.created_at DESC
    `, [request.user?.sub]);
    return result.rows.map((row) => {
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
      return { ...row, stage, retryable };
    });
  }

  async getOwnProfile(request: AuthenticatedRequest) {
    const token = request.rawAccessToken ?? '';
    const result = await this.userClient.queryAsUser(token, `
      SELECT jsonb_build_object(
        'profile', (to_jsonb(cp) - ARRAY['deleted_at','user_id']) || jsonb_build_object('first_name', u.first_name, 'middle_name', u.middle_name, 'last_name', u.last_name),
        'links', COALESCE((SELECT jsonb_agg(to_jsonb(x) - ARRAY['deleted_at','source_document_id','source_parsing_result_id','primary_source_type','verification_status','candidate_confirmed_at'] ORDER BY x.created_at) FROM public.candidate_links x WHERE x.candidate_id = cp.id AND x.deleted_at IS NULL), '[]'::jsonb),
        'skills', COALESCE((SELECT jsonb_agg((to_jsonb(x) - ARRAY['deleted_at','source_document_id','source_parsing_result_id','primary_source_type','verification_status','candidate_confirmed_at']) || jsonb_build_object('name', COALESCE(s.name, x.custom_skill_name)) ORDER BY x.created_at) FROM public.candidate_skills x LEFT JOIN public.skills s ON s.id = x.skill_id WHERE x.candidate_id = cp.id AND x.deleted_at IS NULL), '[]'::jsonb),
        'experiences', COALESCE((SELECT jsonb_agg(to_jsonb(x) - ARRAY['deleted_at','source_document_id','source_parsing_result_id','primary_source_type','verification_status','candidate_confirmed_at'] ORDER BY x.created_at) FROM public.candidate_experiences x WHERE x.candidate_id = cp.id AND x.deleted_at IS NULL), '[]'::jsonb),
        'educations', COALESCE((SELECT jsonb_agg(to_jsonb(x) - ARRAY['deleted_at','source_document_id','source_parsing_result_id','primary_source_type','verification_status','candidate_confirmed_at'] ORDER BY x.created_at) FROM public.candidate_educations x WHERE x.candidate_id = cp.id AND x.deleted_at IS NULL), '[]'::jsonb),
        'certifications', COALESCE((SELECT jsonb_agg(to_jsonb(x) - ARRAY['deleted_at','source_document_id','source_parsing_result_id','primary_source_type','verification_status','candidate_confirmed_at'] ORDER BY x.created_at) FROM public.candidate_certifications x WHERE x.candidate_id = cp.id AND x.deleted_at IS NULL), '[]'::jsonb),
        'projects', COALESCE((SELECT jsonb_agg(to_jsonb(x) - ARRAY['deleted_at','source_document_id','source_parsing_result_id','primary_source_type','verification_status','candidate_confirmed_at'] ORDER BY x.created_at) FROM public.candidate_projects x WHERE x.candidate_id = cp.id AND x.deleted_at IS NULL), '[]'::jsonb),
        'languages', COALESCE((SELECT jsonb_agg(to_jsonb(x) - ARRAY['deleted_at','source_document_id','source_parsing_result_id','primary_source_type','verification_status','candidate_confirmed_at'] ORDER BY x.created_at) FROM public.candidate_languages x WHERE x.candidate_id = cp.id AND x.deleted_at IS NULL), '[]'::jsonb),
        'awards', COALESCE((SELECT jsonb_agg(to_jsonb(x) - ARRAY['deleted_at','source_document_id','source_parsing_result_id','primary_source_type','verification_status','candidate_confirmed_at'] ORDER BY x.created_at) FROM public.candidate_awards x WHERE x.candidate_id = cp.id AND x.deleted_at IS NULL), '[]'::jsonb)
      ) AS profile
      FROM public.candidate_profiles cp
      JOIN public.users u ON u.id = cp.user_id
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
    const raw = row.normalized_output && typeof row.normalized_output === 'object' ? row.normalized_output : {};
    const source: Record<string, unknown> = raw;
    const allowed = ['contact_info', 'professional_title', 'summary', 'skills', 'experiences', 'educations', 'certifications', 'projects', 'languages', 'awards', 'links', 'experience_years', 'date_of_birth', 'gender'];
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
      available_from: 'available_from', date_of_birth: 'date_of_birth',
      gender: 'gender', nationality: 'nationality', salary_currency: 'salary_currency',
      resume_phone: 'resume_phone', years_of_experience: 'years_of_experience',
    };
    const fields = Object.keys(allowed).filter((key) => Object.prototype.hasOwnProperty.call(body, key));
    const userFields = ['first_name', 'middle_name', 'last_name'].filter((key) => Object.prototype.hasOwnProperty.call(body, key));
    if (fields.length === 0 && userFields.length === 0) throw new BadRequestException('VALIDATION_ERROR');
    return this.system.transaction(async (client) => {
      const current = await client.query(`SELECT cp.* FROM public.candidate_profiles cp WHERE cp.user_id = $1 AND cp.deleted_at IS NULL FOR UPDATE`, [request.user?.sub]);
      if (!current.rows[0]) throw new NotFoundException('NOT_FOUND');
      const profile = current.rows[0];
      if (Number(profile.profile_revision) !== body.expected_profile_revision) throw new ConflictException('STALE_REVISION');
      if (userFields.length > 0) {
        await client.query(`UPDATE public.users SET first_name = COALESCE($1, first_name), middle_name = $2, last_name = COALESCE($3, last_name), updated_at = NOW() WHERE id = $4`, [
          body.first_name || null, body.middle_name || null, body.last_name || null, request.user?.sub
        ]);
      }
      if (fields.length === 0) {
        const revision = await client.query(`SELECT public.bump_candidate_profile_revision($1) AS revision`, [profile.id]);
        return { candidate_id: profile.id, profile_revision: Number(revision.rows[0].revision), projection_queued: true };
      }
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

  async deleteResume(request: AuthenticatedRequest, documentId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(documentId)) throw new NotFoundException('NOT_FOUND');
    return this.system.transaction(async (client) => {
      const candidate = await client.query(`SELECT cp.id FROM public.candidate_profiles cp WHERE cp.user_id = $1 AND cp.deleted_at IS NULL`, [request.user?.sub]);
      if (!candidate.rows[0]) throw new NotFoundException('NOT_FOUND');
      const candidateId = candidate.rows[0].id;
      const link = await client.query(`SELECT cpd.is_current FROM public.candidate_profile_documents cpd WHERE cpd.candidate_id = $1 AND cpd.document_id = $2 AND cpd.document_role = 'resume' AND cpd.unlinked_at IS NULL`, [candidateId, documentId]);
      if (!link.rows[0]) throw new NotFoundException('NOT_FOUND');
      if (link.rows[0].is_current) throw new BadRequestException('CANNOT_DELETE_ACTIVE_RESUME');
      await client.query(`UPDATE public.candidate_profile_documents SET unlinked_at = NOW() WHERE candidate_id = $1 AND document_id = $2 AND document_role = 'resume'`, [candidateId, documentId]);
      await client.query(`UPDATE public.uploaded_documents SET deleted_at = NOW() WHERE id = $1 AND uploaded_by_user_id = $2`, [documentId, request.user?.sub]);
      return { deleted: true, document_id: documentId };
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

  async updateOwnFacts(request: AuthenticatedRequest, body: UpdateCandidateFactsDto) {
    if (!Number.isInteger(body?.expected_profile_revision) || body.expected_profile_revision < 1) {
      throw new BadRequestException('VALIDATION_ERROR');
    }
    const source = 'candidate_manual';
    return this.system.transaction(async (client) => {
      const current = await client.query(`SELECT cp.* FROM public.candidate_profiles cp WHERE cp.user_id = $1 AND cp.deleted_at IS NULL FOR UPDATE`, [request.user?.sub]);
      if (!current.rows[0]) throw new NotFoundException('NOT_FOUND');
      const profile = current.rows[0];
      if (Number(profile.profile_revision) !== body.expected_profile_revision) throw new ConflictException('STALE_REVISION');
      const candidateId = profile.id;
      // Soft-delete existing facts and insert new ones for each provided type
      if (Array.isArray(body.skills)) {
        await client.query(`UPDATE public.candidate_skills SET deleted_at = NOW() WHERE candidate_id = $1 AND deleted_at IS NULL`, [candidateId]);
        for (const item of body.skills) {
          const rawName = typeof item === 'string' ? item : item?.name;
          const skillName = clampText(rawName, 150);
          if (!skillName) continue;
          const proficiencyLevel = toSmallInt(typeof item === 'object' ? item.proficiency_level : null, 1, 10);
          const yearsOfExperience = toDecimal41(typeof item === 'object' ? item.years_of_experience : null);
          const skill = await client.query('SELECT id FROM public.skills WHERE slug = LOWER($1) AND is_active = TRUE LIMIT 1', [skillName.trim().toLowerCase().replace(/\s+/g, '-')]);
          const matchedSkillId = skill.rows[0]?.id ?? null;
          const skillConflict = matchedSkillId
            ? `ON CONFLICT (candidate_id, skill_id) WHERE deleted_at IS NULL AND skill_id IS NOT NULL DO UPDATE SET proficiency_level = EXCLUDED.proficiency_level, years_of_experience = EXCLUDED.years_of_experience, candidate_confirmed_at = NOW()`
            : `ON CONFLICT (candidate_id, lower(btrim(custom_skill_name))) WHERE deleted_at IS NULL AND skill_id IS NULL DO UPDATE SET proficiency_level = EXCLUDED.proficiency_level, years_of_experience = EXCLUDED.years_of_experience, candidate_confirmed_at = NOW()`;
          await client.query(`INSERT INTO public.candidate_skills (candidate_id, skill_id, custom_skill_name, proficiency_level, years_of_experience, primary_source_type, verification_status, candidate_confirmed_at) VALUES ($1,$2,$3,$4,$5,$6,'candidate_confirmed',NOW()) ${skillConflict}`, [candidateId, matchedSkillId, matchedSkillId ? null : skillName.trim(), proficiencyLevel, yearsOfExperience, source]);
        }
      }
      if (Array.isArray(body.experiences)) {
        await client.query(`UPDATE public.candidate_experiences SET deleted_at = NOW() WHERE candidate_id = $1 AND deleted_at IS NULL`, [candidateId]);
        for (const item of body.experiences) {
          const companyName = clampText(item?.company_name, 255);
          const jobTitle = clampText(item?.job_title, 255);
          const startDate = toIsoDate(item?.start_date);
          if (!companyName || !jobTitle || !startDate) continue;
          const endDate = toIsoDate(item?.end_date);
          const isCurrent = endDate === null && (item.is_current ?? true);
          await client.query(`INSERT INTO public.candidate_experiences (candidate_id, company_name, job_title, employment_type, location, start_date, end_date, is_current, description, responsibilities, achievements, skills, primary_source_type, verification_status, candidate_confirmed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13,'candidate_confirmed',NOW())`, [candidateId, companyName, jobTitle, toEnumValue(item.employment_type, EMPLOYMENT_TYPES), clampText(item.location, 255), startDate, endDate, isCurrent, textOrNull(item.description), toJsonArray(item.responsibilities), toJsonArray(item.achievements), toJsonArray(item.skills), source]);
        }
      }
      if (Array.isArray(body.educations)) {
        await client.query(`UPDATE public.candidate_educations SET deleted_at = NOW() WHERE candidate_id = $1 AND deleted_at IS NULL`, [candidateId]);
        for (const item of body.educations) {
          const institutionName = clampText(item?.institution_name, 255);
          const degree = clampText(item?.degree, 255);
          if (!institutionName || !degree) continue;
          const eduStart = toIsoDate(item.start_date);
          const eduEnd = toIsoDate(item.end_date);
          await client.query(`INSERT INTO public.candidate_educations (candidate_id, institution_name, degree, field_of_study, start_date, end_date, is_current, grade, description, primary_source_type, verification_status, candidate_confirmed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'candidate_confirmed',NOW())`, [candidateId, institutionName, degree, clampText(item.field_of_study, 255), eduStart, eduEnd, item.is_current ?? false, clampText(item.grade, 100), textOrNull(item.description), source]);
        }
      }
      if (Array.isArray(body.certifications)) {
        await client.query(`UPDATE public.candidate_certifications SET deleted_at = NOW() WHERE candidate_id = $1 AND deleted_at IS NULL`, [candidateId]);
        for (const item of body.certifications) {
          const name = clampText(item?.name, 255);
          if (!name) continue;
          const issuedAt = toIsoDate(item.issued_at);
          const expiresAt = toIsoDate(item.expires_at);
          const doesNotExpire = expiresAt === null && (item.does_not_expire ?? false);
          await client.query(`INSERT INTO public.candidate_certifications (candidate_id, name, issuer, credential_id, credential_url, issued_at, expires_at, does_not_expire, primary_source_type, verification_status, candidate_confirmed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'candidate_confirmed',NOW())`, [candidateId, name, clampText(item.issuer, 255), clampText(item.credential_id, 255), normalizeLinkUrl(item.credential_url), issuedAt, expiresAt, doesNotExpire, source]);
        }
      }
      if (Array.isArray(body.projects)) {
        await client.query(`UPDATE public.candidate_projects SET deleted_at = NOW() WHERE candidate_id = $1 AND deleted_at IS NULL`, [candidateId]);
        for (const item of body.projects) {
          const title = clampText(item?.title, 255);
          if (!title) continue;
          const startedAt = toIsoDate(item.started_at);
          const completedAt = toIsoDate(item.completed_at);
          await client.query(`INSERT INTO public.candidate_projects (candidate_id, title, description, project_url, repository_url, started_at, completed_at, technologies, primary_source_type, verification_status, candidate_confirmed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,'candidate_confirmed',NOW())`, [candidateId, title, textOrNull(item.description), normalizeLinkUrl(item.project_url), normalizeLinkUrl(item.repository_url), startedAt, completedAt, toJsonArray(item.technologies), source]);
        }
      }
      if (Array.isArray(body.languages)) {
        await client.query(`UPDATE public.candidate_languages SET deleted_at = NOW() WHERE candidate_id = $1 AND deleted_at IS NULL`, [candidateId]);
        for (const item of body.languages) {
          const languageName = clampText(item?.language_name, 100);
          if (!languageName) continue;
          await client.query(`INSERT INTO public.candidate_languages (candidate_id, language_name, proficiency, primary_source_type, verification_status, candidate_confirmed_at) VALUES ($1,$2,$3,$4,'candidate_confirmed',NOW()) ON CONFLICT (candidate_id, lower(btrim(language_name))) WHERE deleted_at IS NULL DO UPDATE SET proficiency = EXCLUDED.proficiency, candidate_confirmed_at = NOW()`, [candidateId, languageName, clampText(item.proficiency, 50), source]);
        }
      }
      if (Array.isArray(body.awards)) {
        await client.query(`UPDATE public.candidate_awards SET deleted_at = NOW() WHERE candidate_id = $1 AND deleted_at IS NULL`, [candidateId]);
        for (const item of body.awards) {
          const title = clampText(item?.title, 255);
          if (!title) continue;
          await client.query(`INSERT INTO public.candidate_awards (candidate_id, title, issuer, awarded_at, description, primary_source_type, verification_status, candidate_confirmed_at) VALUES ($1,$2,$3,$4,$5,$6,'candidate_confirmed',NOW())`, [candidateId, title, clampText(item.issuer, 255), toIsoDate(item.awarded_at), textOrNull(item.description), source]);
        }
      }
      if (Array.isArray(body.links)) {
        await client.query(`UPDATE public.candidate_links SET deleted_at = NOW() WHERE candidate_id = $1 AND deleted_at IS NULL`, [candidateId]);
        for (const item of body.links) {
          const url = normalizeLinkUrl(item?.url);
          if (!url) continue;
          const linkType = clampText(item.link_type, 50) || 'other';
          const label = clampText(item.label, 100);
          await client.query(`INSERT INTO public.candidate_links (candidate_id, link_type, label, url, primary_source_type, verification_status, candidate_confirmed_at) VALUES ($1,$2,$3,$4,$5,'candidate_confirmed',NOW()) ON CONFLICT (candidate_id, lower(btrim(link_type)), lower(btrim(url))) WHERE deleted_at IS NULL DO NOTHING`, [candidateId, linkType, label, url, source]);
        }
      }
      const revision = await client.query(`SELECT public.bump_candidate_profile_revision($1) AS revision`, [candidateId]);
      const newRevision = Number(revision.rows[0].revision);
      const eventId = randomUUID();
      await client.query(`INSERT INTO public.outbox_events (id, aggregate_type, aggregate_id, event_type, schema_version, payload, correlation_id, causation_id) VALUES ($1,'candidate',$2,'candidate.profile.changed',1,$3::jsonb,$1,$1)`, [eventId, candidateId, JSON.stringify({ schema_version: 1, event_id: eventId, aggregate_id: candidateId, trace_id: eventId, change_type: 'facts_updated' })]);
      return { candidate_id: candidateId, profile_revision: newRevision, projection_queued: true };
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

  @Patch('me/facts')
  async updateFacts(@Req() request: AuthenticatedRequest, @Body() body: UpdateCandidateFactsDto) {
    return this.candidate.updateOwnFacts(request, body);
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
  @Get()
  async list(@Req() request: AuthenticatedRequest) {
    return this.candidate.listOwnResumes(request);
  }

  @Get(':id/status')
  async status(@Req() request: AuthenticatedRequest, @Param('id') documentId: string) {
    return this.candidate.getResumeStatus(request, documentId);
  }

  @Get(':id/parsed-data')
  async parsedData(@Req() request: AuthenticatedRequest, @Param('id') documentId: string) {
    return this.candidate.getParsedData(request, documentId);
  }

  @Delete(':id')
  async deleteResume(@Req() request: AuthenticatedRequest, @Param('id') documentId: string) {
    return this.candidate.deleteResume(request, documentId);
  }
}
