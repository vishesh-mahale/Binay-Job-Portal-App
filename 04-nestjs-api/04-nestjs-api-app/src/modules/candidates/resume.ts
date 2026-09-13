import { BadRequestException, ConflictException, Controller, Injectable, NotFoundException, Param, Post, Req, ServiceUnavailableException, UploadedFile, UseGuards, UseInterceptors, Body } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { AuthGuard } from '../auth/auth';
import { SystemClient } from '../../infrastructure/database/clients';
import { StorageAdapter } from '../../infrastructure/storage/storage';
import { validateResumeFile } from './resume-upload-validation';
import { Allow, IsInt, IsObject, IsOptional, IsUUID } from 'class-validator';

type AuthenticatedRequest = Request & { user?: { sub?: string } };

export class ConfirmResumeDto {
  @Allow() @IsInt() expected_profile_revision!: number;
  @Allow() @IsOptional() @IsObject() profile?: Record<string, unknown>;
  @Allow() @IsOptional() @IsObject() facts?: Record<string, unknown>;
  [key: string]: unknown;
}

export const EMPLOYMENT_TYPES = new Set(['full_time', 'part_time', 'contract', 'temporary', 'internship', 'freelance', 'volunteer']);

export const clampText = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
};

export const textOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
};

export const toEnumValue = (value: unknown, allowed: Set<string>): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return allowed.has(trimmed) ? trimmed : null;
};

export const toJsonArray = (value: unknown): string => JSON.stringify(Array.isArray(value) ? value : []);

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

export const toSmallInt = (value: unknown, min: number, max: number): number | null => {
  const parsed = toFiniteNumber(value);
  if (parsed === null) return null;
  return Math.min(max, Math.max(min, Math.round(parsed)));
};

export const toDecimal41 = (value: unknown): number | null => {
  const parsed = toFiniteNumber(value);
  if (parsed === null || parsed < 0) return null;
  return Math.min(999.9, Math.round(parsed * 10) / 10);
};

export const toIsoDate = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const [year, month, day] = trimmed.split('-').map(Number);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
  return trimmed;
};

export const normalizeLinkUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('//')) return null;
  try {
    const url = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? new URL(trimmed) : new URL(`https://${trimmed}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return `${url.protocol}//${url.host}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
};

@Injectable()
export class ResumeService {
  constructor(private readonly system: SystemClient, private readonly storage: StorageAdapter) {}

  private async insertConfirmedFacts(client: any, candidateId: string, documentId: string, parsingResultId: string, input: any): Promise<Record<string, number>> {
    const source = 'resume_ai';
    const skipped: Record<string, number> = {};
    const skip = (section: string) => { skipped[section] = (skipped[section] || 0) + 1; };
    for (const item of Array.isArray(input.skills) ? input.skills : []) {
      const rawName = typeof item === 'string' ? item : item?.name;
      const skillName = clampText(rawName, 150);
      if (!skillName) { skip('skills'); continue; }
      const proficiencyLevel = toSmallInt(typeof item === 'object' ? item.proficiency_level : null, 1, 10);
      const yearsOfExperience = toDecimal41(typeof item === 'object' ? item.years_of_experience : null);
      const skill = await client.query('SELECT id FROM public.skills WHERE slug = LOWER($1) AND is_active = TRUE LIMIT 1', [skillName.trim().toLowerCase().replace(/\s+/g, '-')]);
      const matchedSkillId = skill.rows[0]?.id ?? null;
      // Conflict targets are verbatim from uq_candidate_active_master_skill /
      // uq_candidate_active_custom_skill. A mismatch is a runtime 42P10, invisible to tsc and to
      // mocked tests, so any edit to those indexes must be mirrored here.
      const skillConflict = matchedSkillId
        ? `ON CONFLICT (candidate_id, skill_id) WHERE deleted_at IS NULL AND skill_id IS NOT NULL DO UPDATE SET candidate_confirmed_at = NOW()`
        : `ON CONFLICT (candidate_id, lower(btrim(custom_skill_name))) WHERE deleted_at IS NULL AND skill_id IS NULL DO UPDATE SET candidate_confirmed_at = NOW()`;
      const skillRow = await client.query(`INSERT INTO public.candidate_skills (candidate_id, skill_id, custom_skill_name, proficiency_level, years_of_experience, primary_source_type, verification_status, candidate_confirmed_at) VALUES ($1,$2,$3,$4,$5,$6,'candidate_confirmed',NOW()) ${skillConflict} RETURNING id`, [candidateId, matchedSkillId, matchedSkillId ? null : skillName.trim(), proficiencyLevel, yearsOfExperience, source]);
      if (skillRow.rows[0]) {
        await client.query(`INSERT INTO public.candidate_skill_evidence (candidate_skill_id, evidence_type, document_id, parsing_result_id, extracted_value, status) VALUES ($1,$2,$3,$4,$5::jsonb,'active')`, [skillRow.rows[0].id, source, documentId, parsingResultId, JSON.stringify(item)]);
      }
    }
    for (const item of Array.isArray(input.experiences) ? input.experiences : []) {
      const companyName = clampText(item?.company_name, 255);
      const jobTitle = clampText(item?.job_title, 255);
      const startDate = toIsoDate(item?.start_date);
      if (!companyName || !jobTitle || !startDate) { skip('experiences'); continue; }
      const endDate = toIsoDate(item?.end_date);
      if (endDate && endDate < startDate) { skip('experiences'); continue; }
      const isCurrent = endDate === null && (item.is_current ?? true);
      const expRow = await client.query(`INSERT INTO public.candidate_experiences (candidate_id, company_name, job_title, employment_type, location, start_date, end_date, is_current, description, responsibilities, achievements, skills, primary_source_type, verification_status, candidate_confirmed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13,'candidate_confirmed',NOW()) RETURNING id`, [candidateId, companyName, jobTitle, toEnumValue(item.employment_type, EMPLOYMENT_TYPES), clampText(item.location, 255), startDate, endDate, isCurrent, textOrNull(item.description), toJsonArray(item.responsibilities), toJsonArray(item.achievements), toJsonArray(item.skills), source]);
      if (expRow.rows[0]) {
        await client.query(`INSERT INTO public.candidate_experience_evidence (candidate_experience_id, evidence_type, document_id, parsing_result_id, extracted_value, status) VALUES ($1,$2,$3,$4,$5::jsonb,'active')`, [expRow.rows[0].id, source, documentId, parsingResultId, JSON.stringify(item)]);
      }
    }
    for (const item of Array.isArray(input.educations) ? input.educations : []) {
      const institutionName = clampText(item?.institution_name, 255);
      const degree = clampText(item?.degree, 255);
      if (!institutionName || !degree) { skip('educations'); continue; }
      const eduStart = toIsoDate(item.start_date);
      const eduEnd = toIsoDate(item.end_date);
      if (eduStart && eduEnd && eduEnd < eduStart) { skip('educations'); continue; }
      const eduRow = await client.query(`INSERT INTO public.candidate_educations (candidate_id, institution_name, degree, field_of_study, start_date, end_date, is_current, grade, description, primary_source_type, verification_status, candidate_confirmed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'candidate_confirmed',NOW()) RETURNING id`, [candidateId, institutionName, degree, clampText(item.field_of_study, 255), eduStart, eduEnd, item.is_current ?? false, clampText(item.grade, 100), textOrNull(item.description), source]);
      if (eduRow.rows[0]) {
        await client.query(`INSERT INTO public.candidate_education_evidence (candidate_education_id, evidence_type, document_id, parsing_result_id, extracted_value, status) VALUES ($1,$2,$3,$4,$5::jsonb,'active')`, [eduRow.rows[0].id, source, documentId, parsingResultId, JSON.stringify(item)]);
      }
    }
    for (const item of Array.isArray(input.certifications) ? input.certifications : []) {
      const name = clampText(item?.name, 255);
      if (!name) { skip('certifications'); continue; }
      const issuedAt = toIsoDate(item.issued_at);
      const expiresAt = toIsoDate(item.expires_at);
      if (issuedAt && expiresAt && expiresAt < issuedAt) { skip('certifications'); continue; }
      const doesNotExpire = expiresAt === null && (item.does_not_expire ?? false);
      const certRow = await client.query(`INSERT INTO public.candidate_certifications (candidate_id, name, issuer, credential_id, credential_url, issued_at, expires_at, does_not_expire, primary_source_type, verification_status, candidate_confirmed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'candidate_confirmed',NOW()) RETURNING id`, [candidateId, name, clampText(item.issuer, 255), clampText(item.credential_id, 255), normalizeLinkUrl(item.credential_url), issuedAt, expiresAt, doesNotExpire, source]);
      if (certRow.rows[0]) {
        await client.query(`INSERT INTO public.candidate_certification_evidence (candidate_certification_id, evidence_type, document_id, parsing_result_id, extracted_value, status) VALUES ($1,$2,$3,$4,$5::jsonb,'active')`, [certRow.rows[0].id, source, documentId, parsingResultId, JSON.stringify(item)]);
      }
    }
    for (const item of Array.isArray(input.projects) ? input.projects : []) {
      const title = clampText(item?.title, 255);
      if (!title) { skip('projects'); continue; }
      const startedAt = toIsoDate(item.started_at);
      const completedAt = toIsoDate(item.completed_at);
      if (startedAt && completedAt && completedAt < startedAt) { skip('projects'); continue; }
      await client.query(`INSERT INTO public.candidate_projects (candidate_id, title, description, project_url, repository_url, started_at, completed_at, technologies, primary_source_type, source_document_id, source_parsing_result_id, verification_status, candidate_confirmed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,'candidate_confirmed',NOW())`, [candidateId, title, textOrNull(item.description), normalizeLinkUrl(item.project_url), normalizeLinkUrl(item.repository_url), startedAt, completedAt, toJsonArray(item.technologies), source, documentId, parsingResultId]);
    }
    for (const item of Array.isArray(input.languages) ? input.languages : []) {
      const languageName = clampText(item?.language_name, 100);
      if (!languageName) { skip('languages'); continue; }
      await client.query(`INSERT INTO public.candidate_languages (candidate_id, language_name, proficiency, primary_source_type, source_document_id, source_parsing_result_id, verification_status, candidate_confirmed_at) VALUES ($1,$2,$3,$4,$5,$6,'candidate_confirmed',NOW()) ON CONFLICT (candidate_id, lower(btrim(language_name))) WHERE deleted_at IS NULL DO NOTHING`, [candidateId, languageName, clampText(item.proficiency, 50), source, documentId, parsingResultId]);
    }
    for (const item of Array.isArray(input.awards) ? input.awards : []) {
      const title = clampText(item?.title, 255);
      if (!title) { skip('awards'); continue; }
      await client.query(`INSERT INTO public.candidate_awards (candidate_id, title, issuer, awarded_at, description, primary_source_type, source_document_id, source_parsing_result_id, verification_status, candidate_confirmed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'candidate_confirmed',NOW())`, [candidateId, title, clampText(item.issuer, 255), toIsoDate(item.awarded_at), textOrNull(item.description), source, documentId, parsingResultId]);
    }
    for (const item of Array.isArray(input.links) ? input.links : []) {
      const url = normalizeLinkUrl(item?.url);
      if (!url) { skip('links'); continue; }
      const linkType = clampText(item.link_type, 50) || 'other';
      const label = clampText(item.label, 100);
      await client.query(`INSERT INTO public.candidate_links (candidate_id, link_type, label, url, primary_source_type, verification_status, candidate_confirmed_at) VALUES ($1,$2,$3,$4,$5,'candidate_confirmed',NOW()) ON CONFLICT (candidate_id, lower(btrim(link_type)), lower(btrim(url))) WHERE deleted_at IS NULL DO NOTHING`, [candidateId, linkType, label, url, source]);
    }
    return skipped;
  }

  async upload(request: AuthenticatedRequest, file: any, useAsActive: boolean) {
    const maxBytes = Number(process.env.RESUME_MAX_BYTES);
    const bucket = process.env.RESUME_STORAGE_BUCKET;
    if (!bucket || !Number.isInteger(maxBytes) || maxBytes <= 0) throw new ServiceUnavailableException('STORAGE_NOT_CONFIGURED');
    let validated;
    try { validated = validateResumeFile(file, maxBytes); } catch { throw new BadRequestException('VALIDATION_ERROR'); }
    const existing = await this.system.query(`
      SELECT d.id AS document_id FROM public.uploaded_documents d
      WHERE d.uploaded_by_user_id = $1 AND d.checksum_sha256 = $2 AND d.deleted_at IS NULL LIMIT 1
    `, [request.user?.sub, validated.checksumSha256]);
    if (existing.rows[0]) return { document_id: existing.rows[0].document_id, reused: true };
    const candidate = await this.system.query(`SELECT id FROM public.candidate_profiles WHERE user_id = $1 AND deleted_at IS NULL`, [request.user?.sub]);
    if (!candidate.rows[0]) throw new BadRequestException('NOT_FOUND');
    const candidateId = candidate.rows[0].id;
    const totalResumes = await this.system.query(`SELECT COUNT(*)::int AS count FROM public.candidate_profile_documents cpd JOIN public.uploaded_documents d ON d.id = cpd.document_id WHERE cpd.candidate_id = $1 AND cpd.document_role = 'resume' AND d.deleted_at IS NULL`, [candidateId]);
    if (Number(totalResumes.rows[0]?.count ?? 0) >= 5) throw new BadRequestException('MAX_RESUMES_REACHED');
    const current = await this.system.query(`SELECT COUNT(*)::int AS count FROM public.candidate_profile_documents WHERE candidate_id = $1 AND document_role = 'resume' AND is_current = TRUE AND unlinked_at IS NULL`, [candidateId]);
    const first = Number(current.rows[0]?.count ?? 0) === 0;
    const active = first || useAsActive;
    const documentId = randomUUID();
    const storagePath = `candidates/${candidateId}/resumes/${documentId}.${validated.extension}`;
    await this.storage.put(bucket, storagePath, file.buffer, validated.mimeType);
    try {
      return await this.system.transaction(async (client) => {
        const inserted = await client.query(`INSERT INTO public.uploaded_documents (id, uploaded_by_user_id, document_type, original_file_name, file_extension, file_size_bytes, mime_type, storage_bucket, storage_path, checksum_sha256) VALUES ($1,$2,'resume',$3,$4,$5,$6,$7,$8,$9) RETURNING id, security_scan_status, processing_status`, [documentId, request.user?.sub, validated.fileName, validated.extension, validated.sizeBytes, validated.mimeType, bucket, storagePath, validated.checksumSha256]);
        if (active) await client.query(`UPDATE public.candidate_profile_documents SET is_current = FALSE WHERE candidate_id = $1 AND document_role = 'resume' AND is_current = TRUE`, [candidateId]);
        const version = await client.query(`SELECT COALESCE(MAX(version_number),0)+1 AS version FROM public.candidate_profile_documents WHERE candidate_id = $1 AND document_role = 'resume'`, [candidateId]);
        await client.query(`INSERT INTO public.candidate_profile_documents (candidate_id, document_id, document_role, version_number, is_current) VALUES ($1,$2,'resume',$3,$4)`, [candidateId, documentId, version.rows[0].version, active]);
        const eventId = randomUUID();
        await client.query(`INSERT INTO public.outbox_events (id, aggregate_type, aggregate_id, event_type, schema_version, payload, correlation_id, causation_id) VALUES ($1,'uploaded_document',$2,'security.scan.requested',1,$3::jsonb,$1,$1)`, [eventId, documentId, JSON.stringify({ schema_version: 1, event_id: eventId, aggregate_type: 'uploaded_document', aggregate_id: documentId, event_type: 'security.scan.requested', payload: { document_id: documentId, uploaded_by_user_id: request.user?.sub, guest_upload_session_id: null, trace_id: eventId }, occurred_at: new Date().toISOString() })]);
        return { document_id: inserted.rows[0].id, security_scan_status: inserted.rows[0].security_scan_status, processing_status: inserted.rows[0].processing_status, stage: 'UPLOADED', reused: false };
      });
    } catch (error) {
      try { await this.storage.remove(bucket, storagePath); } catch { /* cleanup is best-effort and must not mask DB error */ }
      throw error;
    }
  }

  async confirm(request: AuthenticatedRequest, documentId: string, body: ConfirmResumeDto) {
    if (!/^[0-9a-f-]{36}$/i.test(documentId) || !Number.isInteger(body?.expected_profile_revision)) throw new BadRequestException('VALIDATION_ERROR');
    const ALLOWED_PROFILE_FIELDS = new Set(['professional_title','summary','current_location','city','state','country','postal_code','preferred_work_mode','willing_to_relocate','willing_to_travel','remote_experience','notice_period_days','expected_salary_min','expected_salary_max','work_authorization','visa_sponsorship_needed','is_open_to_work','available_from']);
    const profileInput = body.profile && typeof body.profile === 'object' ? body.profile : body;
    const supplied = [...ALLOWED_PROFILE_FIELDS].filter((field) => Object.prototype.hasOwnProperty.call(profileInput, field));
    const facts = body.facts && typeof body.facts === 'object' ? body.facts : {};
    const hasFacts = Object.keys(facts).some((key) => Array.isArray(facts[key]) && facts[key].length > 0);
    if (!supplied.length && !hasFacts) throw new BadRequestException('VALIDATION_ERROR');
    return this.system.transaction(async (client) => {
      const source = await client.query(`SELECT d.id, d.processing_status, d.security_scan_status, cp.id AS candidate_id, cp.profile_revision, cp.profile_completed_at FROM public.uploaded_documents d JOIN public.candidate_profiles cp ON cp.user_id = d.uploaded_by_user_id JOIN public.candidate_profile_documents cpd ON cpd.candidate_id = cp.id AND cpd.document_id = d.id AND cpd.document_role = 'resume' AND cpd.unlinked_at IS NULL WHERE d.id = $1 AND d.uploaded_by_user_id = $2 AND d.deleted_at IS NULL FOR UPDATE OF d, cp, cpd`, [documentId, request.user?.sub]);
      if (!source.rows[0]) throw new NotFoundException('NOT_FOUND');
      const row = source.rows[0];
      // The source query locks the candidate_profile_documents link as well as
      // the document/candidate, serializing concurrent confirmations.
      const existing = await client.query(`SELECT cpd.document_id FROM public.candidate_profile_documents cpd JOIN public.profile_change_history h ON h.candidate_id = cpd.candidate_id AND h.entity_id = cpd.document_id AND h.entity_type = 'resume_confirmation' AND h.operation = 'confirm' WHERE cpd.candidate_id = $1 AND cpd.document_id = $2 AND cpd.document_role = 'resume' AND cpd.unlinked_at IS NULL LIMIT 1`, [row.candidate_id, documentId]);
      if (existing.rows[0]) return { candidate_id: row.candidate_id, profile_revision: Number(row.profile_revision), active_document_id: documentId, projection_queued: false, already_confirmed: true };
      const scanStatus = String(row.security_scan_status);
      if (scanStatus === 'pending' || scanStatus === 'scanning') throw new ConflictException('SCAN_PENDING');
      if (scanStatus === 'infected' || scanStatus === 'quarantined') throw new ConflictException('INFECTED_FILE');
      if (scanStatus === 'failed') throw new ConflictException('SCAN_FAILED');
      const parsed = await client.query(`SELECT p.id, p.normalized_output FROM public.resume_parsed_data p JOIN public.resume_parsing_jobs j ON j.id = p.parsing_job_id WHERE p.document_id = $1 AND j.status IN ('completed','partial') ORDER BY p.created_at DESC LIMIT 1`, [documentId]);
      if (!parsed.rows[0]) throw new ConflictException('PARSING_NOT_READY');
      if (Number(row.profile_revision) !== body.expected_profile_revision) throw new ConflictException('STALE_REVISION');
      const isFirstTime = !row.profile_completed_at;
      if (isFirstTime) {
        const nonNullSupplied = supplied.filter((field) => profileInput[field] !== null && profileInput[field] !== undefined);
        if (!nonNullSupplied.length && !hasFacts) {
          throw new BadRequestException('NO_CONFIRMATION_DATA');
        }
        const values: unknown[] = [];
        const sets = nonNullSupplied.map((field, index) => {
          if (!ALLOWED_PROFILE_FIELDS.has(field)) throw new BadRequestException('VALIDATION_ERROR');
          values.push(profileInput[field]);
          return `"${field}" = $${index + 1}`;
        });
        values.push(row.candidate_id);
        if (nonNullSupplied.length) {
          const updated = await client.query(`UPDATE public.candidate_profiles SET ${sets.join(', ')}, profile_completed_at = COALESCE(profile_completed_at, NOW()) WHERE id = $${values.length} AND deleted_at IS NULL RETURNING *`, values);
          const skippedFacts = await this.insertConfirmedFacts(client, row.candidate_id, documentId, parsed.rows[0].id, facts);
          const revision = await client.query(`SELECT public.bump_candidate_profile_revision($1) AS revision`, [row.candidate_id]);
          const newRevision = Number(revision.rows[0].revision);
          const eventId = randomUUID();
          const after = { ...updated.rows[0], profile_revision: newRevision };
          await client.query(`INSERT INTO public.profile_change_history (candidate_id, profile_revision, entity_type, entity_id, operation, changed_by_user_id, change_source, after_data) VALUES ($1,$2,'resume_confirmation',$3,'confirm',$4,'resume_ai',$5::jsonb)`, [row.candidate_id, newRevision, documentId, request.user?.sub, JSON.stringify(after)]);
          await client.query(`INSERT INTO public.outbox_events (id, aggregate_type, aggregate_id, event_type, schema_version, payload, correlation_id, causation_id) VALUES ($1,'candidate',$2,'candidate.profile.changed',1,$3::jsonb,$1,$1)`, [eventId, row.candidate_id, JSON.stringify({ schema_version: 1, event_id: eventId, aggregate_id: row.candidate_id, trace_id: eventId, change_type: 'document_linked', active_document_id: documentId })]);
          return { candidate_id: row.candidate_id, profile_revision: newRevision, active_document_id: documentId, projection_queued: true, skipped_facts: skippedFacts };
        } else {
          const updated = await client.query(`UPDATE public.candidate_profiles SET profile_completed_at = COALESCE(profile_completed_at, NOW()) WHERE id = $1 AND deleted_at IS NULL RETURNING *`, [row.candidate_id]);
          const skippedFacts = await this.insertConfirmedFacts(client, row.candidate_id, documentId, parsed.rows[0].id, facts);
          const revision = await client.query(`SELECT public.bump_candidate_profile_revision($1) AS revision`, [row.candidate_id]);
          const newRevision = Number(revision.rows[0].revision);
          const eventId = randomUUID();
          const after = { ...updated.rows[0], profile_revision: newRevision };
          await client.query(`INSERT INTO public.profile_change_history (candidate_id, profile_revision, entity_type, entity_id, operation, changed_by_user_id, change_source, after_data) VALUES ($1,$2,'resume_confirmation',$3,'confirm',$4,'resume_ai',$5::jsonb)`, [row.candidate_id, newRevision, documentId, request.user?.sub, JSON.stringify(after)]);
          await client.query(`INSERT INTO public.outbox_events (id, aggregate_type, aggregate_id, event_type, schema_version, payload, correlation_id, causation_id) VALUES ($1,'candidate',$2,'candidate.profile.changed',1,$3::jsonb,$1,$1)`, [eventId, row.candidate_id, JSON.stringify({ schema_version: 1, event_id: eventId, aggregate_id: row.candidate_id, trace_id: eventId, change_type: 'document_linked', active_document_id: documentId })]);
          return { candidate_id: row.candidate_id, profile_revision: newRevision, active_document_id: documentId, projection_queued: true, skipped_facts: skippedFacts };
        }
      } else {
        const eventId = randomUUID();
        await client.query(`INSERT INTO public.outbox_events (id, aggregate_type, aggregate_id, event_type, schema_version, payload, correlation_id, causation_id) VALUES ($1,'candidate',$2,'candidate.profile.changed',1,$3::jsonb,$1,$1)`, [eventId, row.candidate_id, JSON.stringify({ schema_version: 1, event_id: eventId, aggregate_id: row.candidate_id, trace_id: eventId, change_type: 'document_linked', active_document_id: documentId })]);
        return { candidate_id: row.candidate_id, profile_revision: Number(row.profile_revision), active_document_id: documentId, projection_queued: true };
      }
    });
  }
}

@Controller('api/v1/resumes')
@UseGuards(AuthGuard)
export class ResumeController {
  constructor(private readonly resume: ResumeService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@Req() request: AuthenticatedRequest, @UploadedFile() file: any) {
    const useAsActive = String((request as any).body?.use_as_active_profile_resume ?? 'false').toLowerCase() === 'true';
    return this.resume.upload(request, file, useAsActive);
  }

  @Post(':id/confirm')
  async confirm(@Req() request: AuthenticatedRequest, @Body() body: ConfirmResumeDto, @Param('id') documentId: string) {
    return this.resume.confirm(request, documentId, body);
  }
}