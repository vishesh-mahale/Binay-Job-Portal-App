import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, NotFoundException, Param, Patch, Post, Query, Req, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { Allow, IsOptional, IsString } from 'class-validator';
import type { Request } from 'express';
import { AuthGuard, RequestUser } from '../auth/auth';
import { SystemClient } from '../../infrastructure/database/clients';
import { buildPublicJobSearch, JobSearchFilters } from './job-search-query';
import { assertPageSize, canonicalFilterHash, signSearchCursor, verifySearchCursor } from '../../common/pagination/search-cursor';

type AuthRequest = Request & { user?: RequestUser };

export class CreateJobDto {
  @Allow() @IsString() title!: string;
  @Allow() @IsString() slug!: string;
  @Allow() @IsString() description!: string;
  @Allow() @IsOptional() @IsString() branch_id?: string;
  @Allow() @IsOptional() @IsString() department_id?: string;
  @Allow() @IsOptional() @IsString() team_id?: string;
  @Allow() @IsOptional() @IsString() category_id?: string;
  @Allow() @IsOptional() category?: string;
  @Allow() @IsOptional() employment_type?: string;
  @Allow() @IsOptional() work_mode?: string;
  @Allow() @IsOptional() work_shift?: string;
  @Allow() @IsOptional() education_type?: string;
  @Allow() @IsOptional() min_education_level?: string;
  @Allow() @IsOptional() experience_level?: string;
  @Allow() @IsOptional() experience_min?: number | null;
  @Allow() @IsOptional() experience_max?: number | null;
  @Allow() @IsOptional() max_notice_period_days?: number | null;
  @Allow() @IsOptional() salary_min?: number | null;
  @Allow() @IsOptional() salary_max?: number | null;
  @Allow() @IsOptional() salary_currency?: string;
  @Allow() @IsOptional() salary_period?: string;
  @Allow() @IsOptional() salary_visible?: boolean;
  @Allow() @IsOptional() location_city?: string;
  @Allow() @IsOptional() location_state?: string;
  @Allow() @IsOptional() location_country?: string;
  @Allow() @IsOptional() location_remote?: boolean;
  @Allow() @IsOptional() responsibilities?: string;
  @Allow() @IsOptional() requirements?: string;
  @Allow() @IsOptional() preferred_qualifications?: string;
  @Allow() @IsOptional() benefits?: string;
  @Allow() @IsOptional() vacancies?: number;
  @Allow() @IsOptional() is_confidential?: boolean;
  @Allow() @IsOptional() is_urgent?: boolean;
  @Allow() @IsOptional() is_featured?: boolean;
  @Allow() @IsOptional() locations?: unknown[];
  @Allow() @IsOptional() skills?: unknown[];
  @Allow() @IsOptional() screening_questions?: unknown[];
  @Allow() @IsOptional() interview_rounds?: unknown[];
  [key: string]: unknown;
}

export class UpdateJobDto {
  @Allow() @IsOptional() @IsString() title?: string;
  @Allow() @IsOptional() @IsString() slug?: string;
  @Allow() @IsOptional() @IsString() description?: string;
  @Allow() @IsOptional() @IsString() branch_id?: string;
  @Allow() @IsOptional() @IsString() department_id?: string;
  @Allow() @IsOptional() @IsString() team_id?: string;
  @Allow() @IsOptional() @IsString() category_id?: string;
  @Allow() @IsOptional() category?: string;
  @Allow() @IsOptional() employment_type?: string;
  @Allow() @IsOptional() work_mode?: string;
  @Allow() @IsOptional() work_shift?: string;
  @Allow() @IsOptional() education_type?: string;
  @Allow() @IsOptional() min_education_level?: string;
  @Allow() @IsOptional() experience_level?: string;
  @Allow() @IsOptional() experience_min?: number | null;
  @Allow() @IsOptional() experience_max?: number | null;
  @Allow() @IsOptional() max_notice_period_days?: number | null;
  @Allow() @IsOptional() salary_min?: number | null;
  @Allow() @IsOptional() salary_max?: number | null;
  @Allow() @IsOptional() salary_currency?: string;
  @Allow() @IsOptional() salary_period?: string;
  @Allow() @IsOptional() salary_visible?: boolean;
  @Allow() @IsOptional() location_city?: string;
  @Allow() @IsOptional() location_state?: string;
  @Allow() @IsOptional() location_country?: string;
  @Allow() @IsOptional() location_remote?: boolean;
  @Allow() @IsOptional() responsibilities?: string;
  @Allow() @IsOptional() requirements?: string;
  @Allow() @IsOptional() preferred_qualifications?: string;
  @Allow() @IsOptional() benefits?: string;
  @Allow() @IsOptional() vacancies?: number;
  @Allow() @IsOptional() is_confidential?: boolean;
  @Allow() @IsOptional() is_urgent?: boolean;
  @Allow() @IsOptional() is_featured?: boolean;
  @Allow() @IsOptional() locations?: unknown[];
  @Allow() @IsOptional() skills?: unknown[];
  @Allow() @IsOptional() screening_questions?: unknown[];
  @Allow() @IsOptional() interview_rounds?: unknown[];
  [key: string]: unknown;
}

export class JobReasonDto {
  @Allow() @IsOptional() @IsString() reason?: string;
  [key: string]: unknown;
}

const JOB_FIELDS = `j.id, j.company_id, j.branch_id, j.department_id, j.team_id, j.category_id, j.title, j.slug, j.reference_code, j.employment_type,
  j.work_mode, j.work_shift, j.education_type, j.min_education_level, j.experience_level, j.experience_min, j.experience_max, j.max_notice_period_days, j.category, j.location_city, j.location_state,
  j.location_country, j.location_remote, j.salary_min, j.salary_max, j.salary_currency,
  j.salary_period, j.salary_visible, j.description, j.responsibilities, j.requirements,
  j.preferred_qualifications, j.benefits, j.vacancies, j.screening_questions_enabled, j.screening_questions, j.interview_rounds, j.status, j.published_at, j.expires_at,
  j.paused_at, j.closed_at, j.is_featured, j.is_urgent, j.is_confidential, j.created_by,
  j.created_at, j.updated_at`;

@Injectable()
export class JobService {
  constructor(private readonly system: SystemClient) {}

  private validateInterviewRounds(roundsInput?: any[]): Array<{ round: number; name: string; description?: string }> {
    if (roundsInput === undefined || roundsInput === null) return [];
    if (!Array.isArray(roundsInput)) throw new BadRequestException('VALIDATION_ERROR');

    const seenRounds = new Set<number>();
    const cleaned: Array<{ round: number; name: string; description?: string }> = [];

    for (const item of roundsInput) {
      if (!item || typeof item !== 'object') {
        throw new BadRequestException('VALIDATION_ERROR');
      }
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      if (!name) {
        throw new BadRequestException('VALIDATION_ERROR');
      }
      const roundNum = Number(item.round);
      if (item.round === undefined || item.round === null || isNaN(roundNum) || !Number.isInteger(roundNum) || roundNum <= 0) {
        throw new BadRequestException('VALIDATION_ERROR');
      }
      if (seenRounds.has(roundNum)) {
        throw new BadRequestException('VALIDATION_ERROR');
      }
      seenRounds.add(roundNum);

      const description = typeof item.description === 'string' && item.description.trim() ? item.description.trim() : undefined;
      const resItem: { round: number; name: string; description?: string } = { round: roundNum, name };
      if (description) {
        resItem.description = description;
      }
      cleaned.push(resItem);
    }

    return cleaned;
  }

  private validateUuid(val?: string): string | null {
    if (!val || typeof val !== 'string') return null;
    const trimmed = val.trim();
    if (!trimmed) return null;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
      return null;
    }
    return trimmed;
  }

  private validateLocations(locationsInput?: any[]): Array<{ city: string; state: string | null; country: string; postal_code: string | null; is_primary: boolean }> {
    if (Array.isArray(locationsInput) && locationsInput.length === 0) {
      throw new BadRequestException('VALIDATION_ERROR');
    }
    if (locationsInput === undefined || locationsInput === null) {
      return [];
    }
    if (!Array.isArray(locationsInput)) {
      throw new BadRequestException('VALIDATION_ERROR');
    }

    let hasPrimary = false;
    const cleaned: Array<{ city: string; state: string | null; country: string; postal_code: string | null; is_primary: boolean }> = [];

    for (const item of locationsInput) {
      if (!item || typeof item !== 'object') throw new BadRequestException('VALIDATION_ERROR');
      const city = typeof item.city === 'string' ? item.city.trim() : '';
      if (!city) throw new BadRequestException('VALIDATION_ERROR');
      const country = typeof item.country === 'string' && item.country.trim() ? item.country.trim() : 'India';
      const state = typeof item.state === 'string' && item.state.trim() ? item.state.trim() : null;
      const postalCode = typeof item.postal_code === 'string' && item.postal_code.trim() ? item.postal_code.trim() : null;
      let isPrimary = Boolean(item.is_primary);
      if (isPrimary && !hasPrimary) {
        hasPrimary = true;
      } else {
        isPrimary = false;
      }
      cleaned.push({ city, state, country, postal_code: postalCode, is_primary: isPrimary });
    }

    if (!hasPrimary && cleaned.length > 0) {
      cleaned[0].is_primary = true;
    }
    return cleaned;
  }

  private validateSkills(skillsInput?: any[]): Array<{ skill_id: string; is_required: boolean; min_years: number; importance_score: number }> {
    if (skillsInput === undefined || skillsInput === null) {
      return [];
    }
    if (!Array.isArray(skillsInput)) {
      throw new BadRequestException('VALIDATION_ERROR');
    }
    if (skillsInput.length === 0) {
      return [];
    }

    const seen = new Set<string>();
    const cleaned: Array<{ skill_id: string; is_required: boolean; min_years: number; importance_score: number }> = [];

    for (const item of skillsInput) {
      if (!item) throw new BadRequestException('VALIDATION_ERROR');
      const rawStr = typeof item === 'string' ? item.trim() : (item.skill_id || item.id || item.name || '').toString().trim();
      if (!rawStr) throw new BadRequestException('VALIDATION_ERROR');

      const isUuid = Boolean(this.validateUuid(rawStr));
      const skillId = isUuid ? rawStr : rawStr;

      if (seen.has(skillId)) continue;
      seen.add(skillId);

      const isRequired = typeof item === 'object' && item.is_required !== undefined ? Boolean(item.is_required) : true;
      const minYears = typeof item === 'object' && item.min_years !== undefined ? Math.max(0, Number(item.min_years) || 0) : 0;
      const importanceScore = typeof item === 'object' && item.importance_score !== undefined ? Math.max(1, Math.min(10, Number(item.importance_score) || 5)) : 5;
      cleaned.push({ skill_id: skillId, is_required: isRequired, min_years: minYears, importance_score: importanceScore });
    }
    return cleaned;
  }

  private async processSkillsInput(client: any, userId: string, skillsInput?: any[]): Promise<Array<{ skill_id: string; is_required: boolean; min_years: number; importance_score: number }>> {
    if (!skillsInput || !Array.isArray(skillsInput) || skillsInput.length === 0) {
      return [];
    }

    const seen = new Set<string>();
    const cleaned: Array<{ skill_id: string; is_required: boolean; min_years: number; importance_score: number }> = [];

    for (const item of skillsInput) {
      if (!item) continue;
      const rawStr = typeof item === 'string' ? item.trim() : (item.skill_id || item.id || item.name || '').toString().trim();
      if (!rawStr) continue;

      let skillId = this.validateUuid(rawStr);

      if (skillId) {
        const check = await client.query(`SELECT id, is_active FROM public.skills WHERE id = $1`, [skillId]);
        if (check && Array.isArray(check.rows)) {
          if (!check.rows[0] || check.rows[0].is_active !== true) {
            throw new BadRequestException('VALIDATION_ERROR');
          }
        }
      } else {
        const slug = rawStr.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        const existing = await client.query(
          `SELECT id, is_active FROM public.skills WHERE LOWER(name) = LOWER($1) OR slug = $2`,
          [rawStr, slug]
        );

        if (existing?.rows?.[0] && existing.rows[0].is_active === true) {
          skillId = existing.rows[0].id;
        } else {
          const existingReq = await client.query(
            `SELECT id FROM public.skill_requests WHERE LOWER(requested_name) = LOWER($1) AND status = 'pending'`,
            [rawStr]
          );
          if (!existingReq?.rows?.[0]) {
            await client.query(
              `INSERT INTO public.skill_requests (requested_name, requested_by, status)
               VALUES ($1, $2, 'pending')`,
              [rawStr, userId]
            );
          }
          skillId = null;
        }
      }

      if (!skillId || seen.has(skillId)) continue;
      seen.add(skillId);

      const isRequired = typeof item === 'object' && item.is_required !== undefined ? Boolean(item.is_required) : true;
      const minYears = typeof item === 'object' && item.min_years !== undefined ? Math.max(0, Number(item.min_years) || 0) : 0;
      const importanceScore = typeof item === 'object' && item.importance_score !== undefined ? Math.max(1, Math.min(10, Number(item.importance_score) || 5)) : 5;

      cleaned.push({ skill_id: skillId, is_required: isRequired, min_years: minYears, importance_score: importanceScore });
    }

    return cleaned;
  }

  private async processCityInput(client: any, userId: string, companyId: string, locationsInput?: Array<{ city: string; state: string | null; country: string }>) {
    if (!locationsInput || !Array.isArray(locationsInput)) return;

    for (const loc of locationsInput) {
      if (!loc || !loc.city) continue;
      const cityName = loc.city.trim();
      if (!cityName) continue;

      const existing = await client.query(
        `SELECT id FROM public.master_cities WHERE LOWER(name) = LOWER($1)`,
        [cityName]
      );
      if (!existing?.rows?.[0]) {
        const existingReq = await client.query(
          `SELECT id FROM public.city_requests WHERE LOWER(requested_name) = LOWER($1) AND status = 'pending'`,
          [cityName]
        );
        if (!existingReq?.rows?.[0]) {
          await client.query(
            `INSERT INTO public.city_requests (requested_name, requested_state, requested_country, requested_by, company_id, status)
             VALUES ($1, $2, $3, $4, $5, 'pending')`,
            [cityName, loc.state || null, loc.country || 'India', userId, companyId]
          );
        }
      }
    }
  }

  private async triggerPendingAdminRequests(client: any, userId: string, companyId: string, jobId: string) {
    // 1. Process custom cities from job_locations
    const locs = await client.query(
      `SELECT city, state, country FROM public.job_locations WHERE job_id = $1`,
      [jobId]
    );
    for (const loc of locs?.rows || []) {
      if (!loc || !loc.city) continue;
      const cityName = loc.city.trim();
      if (!cityName) continue;
      const existing = await client.query(
        `SELECT id FROM public.master_cities WHERE LOWER(name) = LOWER($1)`,
        [cityName]
      );
      if (!existing?.rows?.[0]) {
        const existingReq = await client.query(
          `SELECT id FROM public.city_requests WHERE LOWER(requested_name) = LOWER($1) AND status = 'pending'`,
          [cityName]
        );
        if (!existingReq?.rows?.[0]) {
          await client.query(
            `INSERT INTO public.city_requests (requested_name, requested_state, requested_country, requested_by, company_id, status)
             VALUES ($1, $2, $3, $4, $5, 'pending')`,
            [cityName, loc.state || null, loc.country || 'India', userId, companyId]
          );
        }
      }
    }

    // 2. Process custom skills from job_skills
    const sks = await client.query(
      `SELECT s.id, s.name FROM public.job_skills js
       JOIN public.skills s ON s.id = js.skill_id
       WHERE js.job_id = $1 AND s.is_active = FALSE`,
      [jobId]
    );
    for (const sk of sks?.rows || []) {
      if (!sk || !sk.name) continue;
      const existingReq = await client.query(
        `SELECT id FROM public.skill_requests WHERE LOWER(requested_name) = LOWER($1) AND status = 'pending'`,
        [sk.name]
      );
      if (!existingReq?.rows?.[0]) {
        await client.query(
          `INSERT INTO public.skill_requests (requested_name, requested_by, status)
           VALUES ($1, $2, 'pending')`,
          [sk.name, userId]
        );
      }
    }
  }

  private validateScreeningQuestions(questionsInput?: any[]): Array<{ question: string; required: boolean; type?: string }> {
    if (questionsInput === undefined || questionsInput === null) return [];
    if (!Array.isArray(questionsInput)) throw new BadRequestException('VALIDATION_ERROR');

    const ALLOWED_TYPES = new Set(['text', 'single_choice', 'multiple_choice', 'boolean', 'number']);

    return questionsInput.map((item) => {
      if (!item || typeof item !== 'object') throw new BadRequestException('VALIDATION_ERROR');
      const question = typeof item.question === 'string' ? item.question.trim() : '';
      if (!question) throw new BadRequestException('VALIDATION_ERROR');
      const required = Boolean(item.required);
      const rawType = typeof item.type === 'string' && item.type.trim() ? item.type.trim().toLowerCase() : 'text';
      if (!ALLOWED_TYPES.has(rawType)) {
        throw new BadRequestException('VALIDATION_ERROR');
      }
      return { question, required, type: rawType };
    });
  }


  private async checkActor(client: any, userId: string, companyId: string) {
    const user = await client.query(
      `SELECT u.role, u.status FROM public.users u
       WHERE u.id = $1 AND u.status = 'active' AND u.deleted_at IS NULL`,
      [userId]
    );
    if (!user.rows[0]) {
      throw new ForbiddenException('FORBIDDEN');
    }

    const role = user.rows[0].role;
    if (role === 'admin') {
      return { isOwner: true, isAdmin: true, isHR: true };
    }

    if (role !== 'employer' && role !== 'hr') {
      throw new ForbiddenException('FORBIDDEN');
    }

    const company = await client.query(
      `SELECT c.owner_id FROM public.companies c
       WHERE c.id = $1 AND c.deleted_at IS NULL`,
      [companyId]
    );
    if (!company.rows[0]) {
      throw new NotFoundException('NOT_FOUND');
    }

    const isOwner = company.rows[0].owner_id === userId;
    if (isOwner) {
      return { isOwner: true, isAdmin: false, isHR: true };
    }

    const member = await client.query(
      `SELECT cm.is_active FROM public.company_members cm
       WHERE cm.company_id = $1 AND cm.user_id = $2 AND cm.is_active = TRUE AND cm.left_at IS NULL`,
      [companyId, userId]
    );
    if (!member.rows[0]) {
      throw new ForbiddenException('FORBIDDEN');
    }

    return { isOwner: false, isAdmin: false, isHR: true };
  }

  async listActiveCategories() {
    const result = await this.system.query(
      `SELECT id, name, slug, description, parent_id, icon, sort_order
       FROM public.job_categories
       WHERE is_active = TRUE
       ORDER BY sort_order ASC, name ASC`
    );
    return result.rows;
  }

  async listActiveSkills() {
    const result = await this.system.query(
      `SELECT id, name, slug, aliases, description
       FROM public.skills
       WHERE is_active = TRUE
       ORDER BY name ASC`
    );
    return result.rows;
  }

  async createDraft(userId: string, companyId: string, dto: CreateJobDto) {
    const title = typeof dto.title === 'string' ? dto.title.trim() : '';
    const slug = typeof dto.slug === 'string' ? dto.slug.trim().toLowerCase() : '';
    const description = typeof dto.description === 'string' ? dto.description.trim() : '';
    const branchId = this.validateUuid(typeof dto.branch_id === 'string' ? dto.branch_id : undefined);
    const departmentId = this.validateUuid(typeof dto.department_id === 'string' ? dto.department_id : undefined);
    const teamId = this.validateUuid(typeof dto.team_id === 'string' ? dto.team_id : undefined);
    const categoryId = this.validateUuid(typeof dto.category_id === 'string' ? dto.category_id : undefined);

    if (!title || !slug || !description || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new BadRequestException('VALIDATION_ERROR');
    }

    const employmentType = typeof dto.employment_type === 'string' ? dto.employment_type : 'full_time';
    const workMode = typeof dto.work_mode === 'string' ? dto.work_mode : 'onsite';
    const workShift = typeof dto.work_shift === 'string' && dto.work_shift.trim() ? dto.work_shift.trim() : 'day_shift';
    const educationType = typeof dto.education_type === 'string' && dto.education_type.trim() ? dto.education_type.trim() : 'any';
    const minEducationLevel = typeof dto.min_education_level === 'string' && dto.min_education_level.trim() ? dto.min_education_level.trim() : null;
    const experienceLevel = typeof dto.experience_level === 'string' ? dto.experience_level : null;
    const experienceMin = dto.experience_min !== undefined && dto.experience_min !== null ? Math.max(0, Number(dto.experience_min)) : null;
    const experienceMax = dto.experience_max !== undefined && dto.experience_max !== null ? Math.max(0, Number(dto.experience_max)) : null;
    const maxNoticePeriodDays = dto.max_notice_period_days !== undefined && dto.max_notice_period_days !== null ? Math.max(0, Number(dto.max_notice_period_days)) : null;
    const category = typeof dto.category === 'string' && dto.category.trim() ? dto.category.trim() : null;
    const salaryMin = dto.salary_min !== undefined && dto.salary_min !== null ? Number(dto.salary_min) : null;
    const salaryMax = dto.salary_max !== undefined && dto.salary_max !== null ? Number(dto.salary_max) : null;
    const salaryCurrency = typeof dto.salary_currency === 'string' ? dto.salary_currency : 'INR';
    const salaryPeriod = typeof dto.salary_period === 'string' ? dto.salary_period : 'yearly';
    const salaryVisible = dto.salary_visible !== undefined ? Boolean(dto.salary_visible) : true;
    const responsibilities = typeof dto.responsibilities === 'string' && dto.responsibilities.trim() ? dto.responsibilities.trim() : null;
    const requirements = typeof dto.requirements === 'string' && dto.requirements.trim() ? dto.requirements.trim() : null;
    const preferredQualifications = typeof dto.preferred_qualifications === 'string' && dto.preferred_qualifications.trim() ? dto.preferred_qualifications.trim() : null;
    const benefits = typeof dto.benefits === 'string' && dto.benefits.trim() ? dto.benefits.trim() : null;
    const vacancies = dto.vacancies !== undefined ? Math.max(1, Number(dto.vacancies)) : 1;
    const isConfidential = Boolean(dto.is_confidential);
    const isUrgent = Boolean(dto.is_urgent);
    const isFeatured = Boolean(dto.is_featured);

    const validLocs = this.validateLocations(dto.locations as any[]);
    const primaryLoc = validLocs.find((l) => l.is_primary) || validLocs[0];

    const locationCity = primaryLoc ? primaryLoc.city : typeof dto.location_city === 'string' && dto.location_city.trim() ? dto.location_city.trim() : null;
    const locationState = primaryLoc ? primaryLoc.state : typeof dto.location_state === 'string' && dto.location_state.trim() ? dto.location_state.trim() : null;
    const locationCountry = primaryLoc ? primaryLoc.country : typeof dto.location_country === 'string' && dto.location_country.trim() ? dto.location_country.trim() : null;
    const locationRemote = Boolean(dto.location_remote || workMode === 'remote');

    const validSkills = this.validateSkills(dto.skills as any[]);
    const validQuestions = this.validateScreeningQuestions(dto.screening_questions as any[]);
    const validRounds = this.validateInterviewRounds(dto.interview_rounds as any[]);

    return this.system.transaction(async (client) => {
      await this.checkActor(client, userId, companyId);

      if (branchId) {
        const b = await client.query(`SELECT id FROM public.company_branches WHERE id = $1 AND company_id = $2 AND is_active = TRUE`, [branchId, companyId]);
        if (!b.rows[0]) throw new BadRequestException('VALIDATION_ERROR');
      }
      if (departmentId) {
        const d = await client.query(`SELECT id FROM public.departments WHERE id = $1 AND company_id = $2 AND is_active = TRUE`, [departmentId, companyId]);
        if (!d.rows[0]) throw new BadRequestException('VALIDATION_ERROR');
      }
      if (teamId) {
        if (!departmentId) throw new BadRequestException('VALIDATION_ERROR');
        const t = await client.query(`SELECT id FROM public.teams WHERE id = $1 AND department_id = $2 AND is_active = TRUE`, [teamId, departmentId]);
        if (!t.rows[0]) throw new BadRequestException('VALIDATION_ERROR');
      }
      if (categoryId) {
        const cat = await client.query(`SELECT id, name FROM public.job_categories WHERE id = $1 AND is_active = TRUE`, [categoryId]);
        if (!cat.rows[0]) throw new BadRequestException('VALIDATION_ERROR');
      }

      const resolvedSkills = await this.processSkillsInput(client, userId, validSkills);

      let inserted: any;
      try {
        inserted = await client.query(
          `INSERT INTO public.jobs (
             company_id, branch_id, department_id, team_id, category_id, created_by, title, slug, description, status,
             employment_type, work_mode, work_shift, education_type, min_education_level, experience_level, experience_min, experience_max, max_notice_period_days, category, salary_min, salary_max, salary_currency, salary_period,
             salary_visible, responsibilities, requirements, preferred_qualifications, benefits, vacancies,
             is_confidential, is_urgent, is_featured, location_city, location_state, location_country, location_remote,
             screening_questions, screening_questions_enabled, interview_rounds
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft',
                   $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36,
                   $37::jsonb, $38, $39::jsonb)
           RETURNING ${JOB_FIELDS.replaceAll('j.', '')}`,
          [
            companyId, branchId, departmentId, teamId, categoryId, userId, title, slug, description,
            employmentType, workMode, workShift, educationType, minEducationLevel, experienceLevel, experienceMin, experienceMax, maxNoticePeriodDays, category, salaryMin, salaryMax, salaryCurrency, salaryPeriod,
            salaryVisible, responsibilities, requirements, preferredQualifications, benefits, vacancies,
            isConfidential, isUrgent, isFeatured, locationCity, locationState, locationCountry, locationRemote,
            JSON.stringify(validQuestions), validQuestions.length > 0, JSON.stringify(validRounds)
          ]);
      } catch (err: any) {
        if (err?.code === '23505' || err?.message?.includes('duplicate key')) {
          const fallbackSlug = `${slug}-${Date.now().toString(36)}`;
          inserted = await client.query(
            `INSERT INTO public.jobs (
               company_id, branch_id, department_id, team_id, category_id, created_by, title, slug, description, status,
               employment_type, work_mode, work_shift, education_type, min_education_level, experience_level, experience_min, experience_max, max_notice_period_days, category, salary_min, salary_max, salary_currency, salary_period,
               salary_visible, responsibilities, requirements, preferred_qualifications, benefits, vacancies,
               is_confidential, is_urgent, is_featured, location_city, location_state, location_country, location_remote,
               screening_questions, screening_questions_enabled, interview_rounds
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft',
                     $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36,
                     $37::jsonb, $38, $39::jsonb)
             RETURNING ${JOB_FIELDS.replaceAll('j.', '')}`,
            [
              companyId, branchId, departmentId, teamId, categoryId, userId, title, fallbackSlug, description,
              employmentType, workMode, workShift, educationType, minEducationLevel, experienceLevel, experienceMin, experienceMax, maxNoticePeriodDays, category, salaryMin, salaryMax, salaryCurrency, salaryPeriod,
              salaryVisible, responsibilities, requirements, preferredQualifications, benefits, vacancies,
              isConfidential, isUrgent, isFeatured, locationCity, locationState, locationCountry, locationRemote,
              JSON.stringify(validQuestions), validQuestions.length > 0, JSON.stringify(validRounds)
            ]);
        } else {
          throw err;
        }
      }

      const job = inserted.rows[0];

      if (validLocs.length > 0) {
        await this.processCityInput(client, userId, companyId, validLocs);
        for (const loc of validLocs) {
          await client.query(
            `INSERT INTO public.job_locations (job_id, city, state, country, postal_code, is_primary)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [job.id, loc.city, loc.state, loc.country, loc.postal_code, loc.is_primary]
          );
        }
      }

      if (resolvedSkills.length > 0) {
        for (const sk of resolvedSkills) {
          await client.query(
            `INSERT INTO public.job_skills (job_id, skill_id, is_required, min_years, importance_score)
             VALUES ($1, $2, $3, $4, $5)`,
            [job.id, sk.skill_id, sk.is_required, sk.min_years, sk.importance_score]
          );
        }
      }

      await client.query(
        `INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, new_values)
         VALUES ($1, $2, 'job.created', 'job', $3, $4::jsonb)`,
        [companyId, userId, job.id, JSON.stringify({ status: 'draft', title, slug })]);

      const finalLocs = await client.query(
        `SELECT id, city, state, country, postal_code, is_primary FROM public.job_locations WHERE job_id = $1 ORDER BY is_primary DESC, created_at ASC`,
        [job.id]
      );
      const finalSkills = await client.query(
        `SELECT js.id, js.skill_id, s.name AS skill_name, js.is_required, js.min_years, js.importance_score FROM public.job_skills js JOIN public.skills s ON s.id = js.skill_id WHERE js.job_id = $1 ORDER BY js.importance_score DESC, s.name ASC`,
        [job.id]
      );

      return {
        ...job,
        locations: finalLocs?.rows || [],
        skills: finalSkills?.rows || [],
      };
    });
  }

  async listCompanyJobs(userId: string, companyId: string) {
    return this.system.transaction(async (client) => {
      await this.checkActor(client, userId, companyId);
      const result = await client.query(`
        SELECT ${JOB_FIELDS}
        FROM public.jobs j
        WHERE j.company_id = $1 AND j.deleted_at IS NULL
        ORDER BY j.created_at DESC
      `, [companyId]);

      const jobsWithDetails = await Promise.all(
        result.rows.map(async (j) => {
          const locs = await client.query(`SELECT id, city, state, country, postal_code, is_primary FROM public.job_locations WHERE job_id = $1 ORDER BY is_primary DESC, created_at ASC`, [j.id]);
          const sks = await client.query(`SELECT js.id, js.skill_id, s.name AS skill_name, js.is_required, js.min_years, js.importance_score FROM public.job_skills js JOIN public.skills s ON s.id = js.skill_id WHERE js.job_id = $1 ORDER BY js.importance_score DESC, s.name ASC`, [j.id]);
          return {
            ...j,
            locations: locs?.rows || [],
            skills: sks?.rows || [],
          };
        })
      );
      return jobsWithDetails;
    });
  }

  async getCompanyJob(userId: string, companyId: string, jobId: string) {
    return this.system.transaction(async (client) => {
      await this.checkActor(client, userId, companyId);
      const result = await client.query(`
        SELECT ${JOB_FIELDS}
        FROM public.jobs j
        WHERE j.id = $1 AND j.company_id = $2 AND j.deleted_at IS NULL
      `, [jobId, companyId]);
      if (!result.rows[0]) throw new NotFoundException('NOT_FOUND');
      const job = result.rows[0];

      const locs = await client.query(
        `SELECT id, city, state, country, postal_code, is_primary
         FROM public.job_locations
         WHERE job_id = $1
         ORDER BY is_primary DESC, created_at ASC`,
        [jobId]
      );
      const sks = await client.query(
        `SELECT js.id, js.skill_id, s.name AS skill_name, js.is_required, js.min_years, js.importance_score
         FROM public.job_skills js
         JOIN public.skills s ON s.id = js.skill_id
         WHERE js.job_id = $1
         ORDER BY js.importance_score DESC, s.name ASC`,
        [jobId]
      );

      return {
        ...job,
        locations: locs.rows,
        skills: sks.rows,
      };
    });
  }

  async updateDraft(userId: string, companyId: string, jobId: string, dto: UpdateJobDto) {
    const allowed: Record<string, unknown> = {};
    if (dto.title !== undefined) { const val = typeof dto.title === 'string' ? dto.title.trim() : ''; if (!val) throw new BadRequestException('VALIDATION_ERROR'); allowed.title = val; }
    if (dto.description !== undefined) { const val = typeof dto.description === 'string' ? dto.description.trim() : ''; if (!val) throw new BadRequestException('VALIDATION_ERROR'); allowed.description = val; }
    if (dto.slug !== undefined) { const slug = typeof dto.slug === 'string' ? dto.slug.trim().toLowerCase() : ''; if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new BadRequestException('VALIDATION_ERROR'); allowed.slug = slug; }
    if (dto.branch_id !== undefined) allowed.branch_id = this.validateUuid(typeof dto.branch_id === 'string' ? dto.branch_id : undefined);
    if (dto.department_id !== undefined) allowed.department_id = this.validateUuid(typeof dto.department_id === 'string' ? dto.department_id : undefined);
    if (dto.team_id !== undefined) allowed.team_id = this.validateUuid(typeof dto.team_id === 'string' ? dto.team_id : undefined);
    if (dto.category_id !== undefined) allowed.category_id = this.validateUuid(typeof dto.category_id === 'string' ? dto.category_id : undefined);
    if (dto.category !== undefined) allowed.category = typeof dto.category === 'string' && dto.category.trim() ? dto.category.trim() : null;
    if (dto.employment_type !== undefined) allowed.employment_type = dto.employment_type;
    if (dto.work_mode !== undefined) allowed.work_mode = dto.work_mode;
    if (dto.work_shift !== undefined) allowed.work_shift = typeof dto.work_shift === 'string' && dto.work_shift.trim() ? dto.work_shift.trim() : 'day_shift';
    if (dto.education_type !== undefined) allowed.education_type = typeof dto.education_type === 'string' && dto.education_type.trim() ? dto.education_type.trim() : 'any';
    if (dto.min_education_level !== undefined) allowed.min_education_level = typeof dto.min_education_level === 'string' && dto.min_education_level.trim() ? dto.min_education_level.trim() : null;
    if (dto.interview_rounds !== undefined) allowed.interview_rounds = this.validateInterviewRounds(dto.interview_rounds as any[]);
    if (dto.experience_level !== undefined) allowed.experience_level = dto.experience_level;
    if (dto.experience_min !== undefined) allowed.experience_min = dto.experience_min !== null ? Math.max(0, Number(dto.experience_min)) : null;
    if (dto.experience_max !== undefined) allowed.experience_max = dto.experience_max !== null ? Math.max(0, Number(dto.experience_max)) : null;
    if (dto.max_notice_period_days !== undefined) allowed.max_notice_period_days = dto.max_notice_period_days !== null ? Math.max(0, Number(dto.max_notice_period_days)) : null;
    if (dto.salary_min !== undefined) allowed.salary_min = dto.salary_min !== null ? Number(dto.salary_min) : null;
    if (dto.salary_max !== undefined) allowed.salary_max = dto.salary_max !== null ? Number(dto.salary_max) : null;
    if (dto.salary_currency !== undefined) allowed.salary_currency = dto.salary_currency;
    if (dto.salary_period !== undefined) allowed.salary_period = dto.salary_period;
    if (dto.salary_visible !== undefined) allowed.salary_visible = Boolean(dto.salary_visible);
    if (dto.responsibilities !== undefined) allowed.responsibilities = typeof dto.responsibilities === 'string' && dto.responsibilities.trim() ? dto.responsibilities.trim() : null;
    if (dto.requirements !== undefined) allowed.requirements = typeof dto.requirements === 'string' && dto.requirements.trim() ? dto.requirements.trim() : null;
    if (dto.preferred_qualifications !== undefined) allowed.preferred_qualifications = typeof dto.preferred_qualifications === 'string' && dto.preferred_qualifications.trim() ? dto.preferred_qualifications.trim() : null;
    if (dto.benefits !== undefined) allowed.benefits = typeof dto.benefits === 'string' && dto.benefits.trim() ? dto.benefits.trim() : null;
    if (dto.vacancies !== undefined) allowed.vacancies = Math.max(1, Number(dto.vacancies));
    if (dto.is_confidential !== undefined) allowed.is_confidential = Boolean(dto.is_confidential);
    if (dto.is_urgent !== undefined) allowed.is_urgent = Boolean(dto.is_urgent);
    if (dto.is_featured !== undefined) allowed.is_featured = Boolean(dto.is_featured);
    if (dto.location_city !== undefined) allowed.location_city = typeof dto.location_city === 'string' && dto.location_city.trim() ? dto.location_city.trim() : null;
    if (dto.location_state !== undefined) allowed.location_state = typeof dto.location_state === 'string' && dto.location_state.trim() ? dto.location_state.trim() : null;
    if (dto.location_country !== undefined) allowed.location_country = typeof dto.location_country === 'string' && dto.location_country.trim() ? dto.location_country.trim() : null;
    if (dto.location_remote !== undefined) allowed.location_remote = Boolean(dto.location_remote);

    const validLocs = dto.locations !== undefined ? this.validateLocations(dto.locations as any[]) : null;
    const validSkills = dto.skills !== undefined ? this.validateSkills(dto.skills as any[]) : null;
    const validQuestions = dto.screening_questions !== undefined ? this.validateScreeningQuestions(dto.screening_questions as any[]) : null;

    if (validLocs && validLocs.length > 0) {
      const primaryLoc = validLocs.find((l) => l.is_primary) || validLocs[0];
      allowed.location_city = primaryLoc.city;
      allowed.location_state = primaryLoc.state;
      allowed.location_country = primaryLoc.country;
    }
    if (validQuestions) {
      allowed.screening_questions = validQuestions;
      allowed.screening_questions_enabled = validQuestions.length > 0;
    }

    const entries = Object.entries(allowed);
    if (!entries.length && validLocs === null && validSkills === null) {
      throw new BadRequestException('VALIDATION_ERROR');
    }

    return this.system.transaction(async (client) => {
      await this.checkActor(client, userId, companyId);

      if (allowed.branch_id) {
        const b = await client.query(`SELECT id FROM public.company_branches WHERE id = $1 AND company_id = $2 AND is_active = TRUE`, [allowed.branch_id, companyId]);
        if (!b.rows[0]) throw new BadRequestException('VALIDATION_ERROR');
      }
      if (allowed.department_id) {
        const d = await client.query(`SELECT id FROM public.departments WHERE id = $1 AND company_id = $2 AND is_active = TRUE`, [allowed.department_id, companyId]);
        if (!d.rows[0]) throw new BadRequestException('VALIDATION_ERROR');
      }
      if (allowed.team_id) {
        const dept = allowed.department_id || (await client.query(`SELECT department_id FROM public.jobs WHERE id = $1`, [jobId])).rows[0]?.department_id;
        if (!dept) throw new BadRequestException('VALIDATION_ERROR');
        const t = await client.query(`SELECT id FROM public.teams WHERE id = $1 AND department_id = $2 AND is_active = TRUE`, [allowed.team_id, dept]);
        if (!t.rows[0]) throw new BadRequestException('VALIDATION_ERROR');
      }

      let updatedRow: any = null;
      if (entries.length > 0) {
        const JSONB_COLUMNS = new Set(['interview_rounds', 'screening_questions']);
        const sets = entries.map(([key], index) => JSONB_COLUMNS.has(key) ? `${key} = $${index + 4}::jsonb` : `${key} = $${index + 4}`).join(', ');
        const values = [jobId, companyId, userId, ...entries.map(([, value]) => (value !== null && typeof value === 'object' ? JSON.stringify(value) : value))];
        const updated = await client.query(`UPDATE public.jobs j SET ${sets}, updated_at = NOW()
          WHERE j.id = $1 AND j.company_id = $2 AND ($3::uuid IS NOT NULL) AND j.status = 'draft' AND j.deleted_at IS NULL
          RETURNING ${JOB_FIELDS.replaceAll('j.', '')}`, values);
        if (!updated.rows[0]) throw new NotFoundException('NOT_FOUND');
        updatedRow = updated.rows[0];
      } else {
        const current = await client.query(`SELECT ${JOB_FIELDS} FROM public.jobs j WHERE j.id = $1 AND j.company_id = $2 AND j.status = 'draft' AND j.deleted_at IS NULL`, [jobId, companyId]);
        if (!current.rows[0]) throw new NotFoundException('NOT_FOUND');
        updatedRow = current.rows[0];
      }

      if (validLocs !== null) {
        await this.processCityInput(client, userId, companyId, validLocs);
        await client.query(`DELETE FROM public.job_locations WHERE job_id = $1`, [jobId]);
        for (const loc of validLocs) {
          await client.query(
            `INSERT INTO public.job_locations (job_id, city, state, country, postal_code, is_primary)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [jobId, loc.city, loc.state, loc.country, loc.postal_code, loc.is_primary]
          );
        }
      }

      if (dto.skills !== undefined && dto.skills !== null) {
        const resolvedSkills = await this.processSkillsInput(client, userId, dto.skills as any[]);
        await client.query(`DELETE FROM public.job_skills WHERE job_id = $1`, [jobId]);
        for (const sk of resolvedSkills) {
          await client.query(
            `INSERT INTO public.job_skills (job_id, skill_id, is_required, min_years, importance_score)
             VALUES ($1, $2, $3, $4, $5)`,
            [jobId, sk.skill_id, sk.is_required, sk.min_years, sk.importance_score]
          );
        }
      }

      await client.query(`INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, changes) VALUES ($1, $2, 'job.updated', 'job', $3, $4::jsonb)`, [companyId, userId, jobId, JSON.stringify(allowed)]);

      const finalLocs = await client.query(
        `SELECT id, city, state, country, postal_code, is_primary FROM public.job_locations WHERE job_id = $1 ORDER BY is_primary DESC, created_at ASC`,
        [jobId]
      );
      const finalSkills = await client.query(
        `SELECT js.id, js.skill_id, s.name AS skill_name, js.is_required, js.min_years, js.importance_score FROM public.job_skills js JOIN public.skills s ON s.id = js.skill_id WHERE js.job_id = $1 ORDER BY js.importance_score DESC, s.name ASC`,
        [jobId]
      );

      return {
        ...updatedRow,
        locations: finalLocs?.rows || [],
        skills: finalSkills?.rows || [],
      };
    });
  }

  async publish(userId: string, companyId: string, jobId: string) {
    return this.system.transaction(async (client) => {
      await this.checkActor(client, userId, companyId);

      const company = await client.query(
        `SELECT c.verification_status FROM public.companies c WHERE c.id = $1 AND c.deleted_at IS NULL`,
        [companyId]
      );
      if (!company.rows[0]) throw new NotFoundException('NOT_FOUND');
      if (company.rows[0].verification_status !== 'verified') {
        throw new ForbiddenException('FORBIDDEN');
      }

      const settings = await client.query(
        `SELECT job_approval_required FROM public.company_settings WHERE company_id = $1`,
        [companyId]
      );
      const approvalRequired = Boolean(settings.rows[0]?.job_approval_required);

      if (approvalRequired) {
        const result = await client.query(`
          UPDATE public.jobs j
          SET status = 'pending_approval'::job_status, updated_at = NOW()
          WHERE j.id = $1 AND j.company_id = $2 AND j.status = 'draft' AND j.deleted_at IS NULL
          RETURNING ${JOB_FIELDS.replaceAll('j.', '')}`, [jobId, companyId]);
        if (!result.rows[0]) throw new NotFoundException('NOT_FOUND');
        await client.query(`INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, changes) VALUES ($1, $2, 'job.publish_requested', 'job', $3, $4::jsonb)`, [companyId, userId, jobId, JSON.stringify({ resulting_status: 'pending_approval' })]);
        return result.rows[0];
      } else {
        const result = await client.query(`
          UPDATE public.jobs j
          SET status = 'published'::job_status, published_at = NOW(), published_by = $3, updated_at = NOW()
          WHERE j.id = $1 AND j.company_id = $2 AND j.status = 'draft' AND j.deleted_at IS NULL
          RETURNING ${JOB_FIELDS.replaceAll('j.', '')}`, [jobId, companyId, userId]);
        if (!result.rows[0]) throw new NotFoundException('NOT_FOUND');
        await this.triggerPendingAdminRequests(client, userId, companyId, jobId);
        await client.query(`INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, changes) VALUES ($1, $2, 'job.published', 'job', $3, $4::jsonb)`, [companyId, userId, jobId, JSON.stringify({ resulting_status: 'published' })]);
        return result.rows[0];
      }
    });
  }

  async transition(userId: string, companyId: string, jobId: string, command: 'pause' | 'resume' | 'close') {
    const transitions = { pause: { from: 'published', to: 'paused' }, resume: { from: 'paused', to: 'published' }, close: { from: 'published', to: 'closed' } } as const;
    const transition = transitions[command];
    return this.system.transaction(async (client) => {
      await this.checkActor(client, userId, companyId);

      if (command === 'resume') {
        const company = await client.query(
          `SELECT c.verification_status FROM public.companies c WHERE c.id = $1 AND c.deleted_at IS NULL`,
          [companyId]
        );
        if (!company.rows[0]) throw new NotFoundException('NOT_FOUND');
        if (company.rows[0].verification_status !== 'verified') {
          throw new ForbiddenException('FORBIDDEN');
        }
      }

      const timestamp = command === 'pause' ? 'paused_at' : command === 'close' ? 'closed_at' : null;
      const setClause = timestamp ? `status = $4::job_status, ${timestamp} = NOW(), updated_at = NOW()` : `status = $4::job_status, updated_at = NOW()`;
      const result = await client.query(`UPDATE public.jobs j SET ${setClause}
        WHERE j.id = $1 AND j.company_id = $2 AND j.status = $3::job_status AND j.deleted_at IS NULL
        RETURNING ${JOB_FIELDS.replaceAll('j.', '')}`, [jobId, companyId, transition.from, transition.to]);
      if (!result.rows[0]) throw new NotFoundException('NOT_FOUND');
      await client.query(`INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, changes) VALUES ($1, $2, 'job.status_changed', 'job', $3, $4::jsonb)`, [companyId, userId, jobId, JSON.stringify({ from: transition.from, to: transition.to })]);
      return result.rows[0];
    });
  }

  async submitForApproval(userId: string, companyId: string, jobId: string) {
    return this.system.transaction(async (client) => {
      await this.checkActor(client, userId, companyId);
      const result = await client.query(`UPDATE public.jobs j SET status = 'pending_approval'::job_status, updated_at = NOW()
        WHERE j.id = $1 AND j.company_id = $2 AND j.status = 'draft' AND j.deleted_at IS NULL
        RETURNING ${JOB_FIELDS.replaceAll('j.', '')}`, [jobId, companyId]);
      if (!result.rows[0]) throw new NotFoundException('NOT_FOUND');
      await client.query(`INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, changes) VALUES ($1, $2, 'job.publish_requested', 'job', $3, $4::jsonb)`, [companyId, userId, jobId, JSON.stringify({ from: 'draft', to: 'pending_approval' })]);
      return result.rows[0];
    });
  }

  async approve(userId: string, companyId: string, jobId: string) {
    return this.system.transaction(async (client) => {
      const actor = await this.checkActor(client, userId, companyId);
      if (!actor.isOwner && !actor.isAdmin) {
        throw new ForbiddenException('FORBIDDEN');
      }

      const result = await client.query(`UPDATE public.jobs j SET status = 'published'::job_status, published_at = NOW(), published_by = $3, approved_at = NOW(), approved_by = $3, updated_at = NOW()
        FROM public.companies c WHERE j.id = $1 AND j.company_id = $2 AND c.id = j.company_id AND c.verification_status = 'verified'
          AND j.status = 'pending_approval' AND j.deleted_at IS NULL
        RETURNING ${JOB_FIELDS.replaceAll('j.', '')}`, [jobId, companyId, userId]);
      if (!result.rows[0]) throw new NotFoundException('NOT_FOUND');
      await this.triggerPendingAdminRequests(client, userId, companyId, jobId);
      await client.query(`INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, changes) VALUES ($1, $2, 'job.approved', 'job', $3, $4::jsonb)`, [companyId, userId, jobId, JSON.stringify({ from: 'pending_approval', to: 'published' })]);
      return result.rows[0];
    });
  }

  async reject(userId: string, companyId: string, jobId: string, reason?: string) {
    if (!reason?.trim()) throw new BadRequestException('VALIDATION_ERROR');
    return this.system.transaction(async (client) => {
      const actor = await this.checkActor(client, userId, companyId);
      if (!actor.isOwner && !actor.isAdmin) {
        throw new ForbiddenException('FORBIDDEN');
      }

      const result = await client.query(`UPDATE public.jobs j SET status = 'draft'::job_status, updated_at = NOW()
        FROM public.companies c WHERE j.id = $1 AND j.company_id = $2 AND c.id = j.company_id AND j.status = 'pending_approval' AND j.deleted_at IS NULL
        RETURNING ${JOB_FIELDS.replaceAll('j.', '')}`, [jobId, companyId]);
      if (!result.rows[0]) throw new NotFoundException('NOT_FOUND');
      await client.query(`INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, changes) VALUES ($1, $2, 'job.rejected', 'job', $3, $4::jsonb)`, [companyId, userId, jobId, JSON.stringify({ from: 'pending_approval', to: 'draft', reason: reason.trim() })]);
      return result.rows[0];
    });
  }

  async archive(userId: string, companyId: string, jobId: string, reason?: string) {
    return this.system.transaction(async (client) => {
      await this.checkActor(client, userId, companyId);
      const result = await client.query(`UPDATE public.jobs j SET status = 'archived'::job_status, updated_at = NOW()
        FROM public.companies c WHERE j.id = $1 AND j.company_id = $2 AND c.id = j.company_id AND j.status IN ('closed', 'expired') AND j.deleted_at IS NULL
        RETURNING ${JOB_FIELDS.replaceAll('j.', '')}`, [jobId, companyId]);
      if (!result.rows[0]) throw new NotFoundException('NOT_FOUND');
      await client.query(`INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, changes) VALUES ($1, $2, 'job.archived', 'job', $3, $4::jsonb)`, [companyId, userId, jobId, JSON.stringify({ to: 'archived', reason: reason?.trim() ?? null })]);
      return result.rows[0];
    });
  }

  async searchPublicJobs(filters: JobSearchFilters, limitParam?: number, cursorToken?: string) {
    const limit = assertPageSize(limitParam);
    const secret = process.env.SEARCH_CURSOR_SECRET || process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
      throw new ServiceUnavailableException('SEARCH_CURSOR_SECRET_NOT_CONFIGURED');
    }

    let cursorPosition: { publishedAt: string; id: string } | undefined = undefined;

    if (cursorToken?.trim()) {
      try {
        const verified = verifySearchCursor(cursorToken.trim(), secret);
        const expectedHash = canonicalFilterHash(filters as Record<string, unknown>);
        if (verified.filterHash !== expectedHash) {
          throw new BadRequestException('INVALID_CURSOR');
        }
        const parts = verified.position.split('|');
        if (parts.length === 2 && parts[0] && parts[1]) {
          cursorPosition = { publishedAt: parts[0], id: parts[1] };
        } else {
          throw new BadRequestException('INVALID_CURSOR');
        }
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        throw new BadRequestException('INVALID_CURSOR');
      }
    }

    const built = buildPublicJobSearch(filters, limit, cursorPosition);
    const result = await this.system.query(built.text, built.values);
    const items = result.rows.map(maskPublicJob);

    let next_cursor: string | null = null;
    if (items.length === limit && items.length > 0) {
      const rawLastItem = result.rows[result.rows.length - 1];
      const pAt = rawLastItem.published_at instanceof Date ? rawLastItem.published_at.toISOString() : new Date(rawLastItem.published_at).toISOString();
      const position = `${pAt}|${rawLastItem.id}`;
      const filterHash = canonicalFilterHash(filters as Record<string, unknown>);
      next_cursor = signSearchCursor({
        v: 1,
        sort: 'published_at_id',
        filterHash,
        position,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      }, secret);
    }

    return { items, next_cursor };
  }

  async getPublicJobById(jobId: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
      throw new BadRequestException('VALIDATION_ERROR');
    }
    const result = await this.system.query(
      `SELECT j.id, j.title, j.slug, j.company_id, j.branch_id, j.department_id, j.team_id,
              j.reference_code, j.employment_type, j.work_mode, j.experience_level, j.category,
              j.location_city, j.location_state, j.location_country, j.location_remote,
              j.salary_min, j.salary_max, j.salary_currency, j.salary_period, j.salary_visible,
              j.description, j.responsibilities, j.requirements, j.preferred_qualifications,
              j.benefits, j.vacancies, j.screening_questions, j.screening_questions_enabled, j.status, j.published_at, j.expires_at, j.is_featured,
              j.is_urgent, j.is_confidential,
              c.name AS company_name, c.logo_path AS company_logo_path, c.slug AS company_slug
       FROM public.jobs j
       JOIN public.companies c ON c.id = j.company_id
       WHERE j.id = $1 AND j.status = 'published' AND j.deleted_at IS NULL
         AND (j.expires_at IS NULL OR j.expires_at > NOW())
         AND c.verification_status = 'verified' AND c.deleted_at IS NULL`,
      [jobId]
    );
    if (!result.rows[0]) throw new NotFoundException('NOT_FOUND');

    const locs = await this.system.query(
      `SELECT id, city, state, country, postal_code, is_primary FROM public.job_locations WHERE job_id = $1 ORDER BY is_primary DESC, created_at ASC`,
      [jobId]
    );
    const sks = await this.system.query(
      `SELECT js.id, js.skill_id, s.name AS skill_name, js.is_required, js.min_years, js.importance_score
       FROM public.job_skills js JOIN public.skills s ON s.id = js.skill_id WHERE js.job_id = $1 ORDER BY js.importance_score DESC, s.name ASC`,
      [jobId]
    );

    return maskPublicJob({
      ...result.rows[0],
      locations: locs?.rows || [],
      skills: sks?.rows || [],
    });
  }

  async getPublicJobBySlug(slug: string) {
    const trimmed = slug?.trim().toLowerCase();
    if (!trimmed) throw new BadRequestException('VALIDATION_ERROR');
    const result = await this.system.query(
      `SELECT j.id, j.title, j.slug, j.company_id, j.branch_id, j.department_id, j.team_id,
              j.reference_code, j.employment_type, j.work_mode, j.experience_level, j.category,
              j.location_city, j.location_state, j.location_country, j.location_remote,
              j.salary_min, j.salary_max, j.salary_currency, j.salary_period, j.salary_visible,
              j.description, j.responsibilities, j.requirements, j.preferred_qualifications,
              j.benefits, j.vacancies, j.screening_questions, j.screening_questions_enabled, j.status, j.published_at, j.expires_at, j.is_featured,
              j.is_urgent, j.is_confidential,
              c.name AS company_name, c.logo_path AS company_logo_path, c.slug AS company_slug
       FROM public.jobs j
       JOIN public.companies c ON c.id = j.company_id
       WHERE j.slug = $1 AND j.status = 'published' AND j.deleted_at IS NULL
         AND (j.expires_at IS NULL OR j.expires_at > NOW())
         AND c.verification_status = 'verified' AND c.deleted_at IS NULL`,
      [trimmed]
    );
    if (result.rows.length === 0) throw new NotFoundException('NOT_FOUND');
    if (result.rows.length > 1) throw new BadRequestException('AMBIGUOUS_SLUG');

    const jobId = result.rows[0].id;
    const locs = await this.system.query(
      `SELECT id, city, state, country, postal_code, is_primary FROM public.job_locations WHERE job_id = $1 ORDER BY is_primary DESC, created_at ASC`,
      [jobId]
    );
    const sks = await this.system.query(
      `SELECT js.id, js.skill_id, s.name AS skill_name, js.is_required, js.min_years, js.importance_score
       FROM public.job_skills js JOIN public.skills s ON s.id = js.skill_id WHERE js.job_id = $1 ORDER BY js.importance_score DESC, s.name ASC`,
      [jobId]
    );

    return maskPublicJob({
      ...result.rows[0],
      locations: locs?.rows || [],
      skills: sks?.rows || [],
    });
  }

  async getPublicJobByCompanyAndSlug(companySlugOrId: string, jobSlug: string) {
    const companyKey = companySlugOrId?.trim().toLowerCase();
    const slugKey = jobSlug?.trim().toLowerCase();
    if (!companyKey || !slugKey) throw new BadRequestException('VALIDATION_ERROR');
    const result = await this.system.query(
      `SELECT j.id, j.title, j.slug, j.company_id, j.branch_id, j.department_id, j.team_id,
              j.reference_code, j.employment_type, j.work_mode, j.experience_level, j.category,
              j.location_city, j.location_state, j.location_country, j.location_remote,
              j.salary_min, j.salary_max, j.salary_currency, j.salary_period, j.salary_visible,
              j.description, j.responsibilities, j.requirements, j.preferred_qualifications,
              j.benefits, j.vacancies, j.screening_questions, j.screening_questions_enabled, j.status, j.published_at, j.expires_at, j.is_featured,
              j.is_urgent, j.is_confidential,
              c.name AS company_name, c.logo_path AS company_logo_path, c.slug AS company_slug
       FROM public.jobs j
       JOIN public.companies c ON c.id = j.company_id
       WHERE (c.slug = $1 OR c.id::text = $1) AND j.slug = $2 AND j.status = 'published' AND j.deleted_at IS NULL
         AND (j.expires_at IS NULL OR j.expires_at > NOW())
         AND c.verification_status = 'verified' AND c.deleted_at IS NULL`,
      [companyKey, slugKey]
    );
    if (!result.rows[0]) throw new NotFoundException('NOT_FOUND');

    const jobId = result.rows[0].id;
    const locs = await this.system.query(
      `SELECT id, city, state, country, postal_code, is_primary FROM public.job_locations WHERE job_id = $1 ORDER BY is_primary DESC, created_at ASC`,
      [jobId]
    );
    const sks = await this.system.query(
      `SELECT js.id, js.skill_id, s.name AS skill_name, js.is_required, js.min_years, js.importance_score
       FROM public.job_skills js JOIN public.skills s ON s.id = js.skill_id WHERE js.job_id = $1 ORDER BY js.importance_score DESC, s.name ASC`,
      [jobId]
    );

    return maskPublicJob({
      ...result.rows[0],
      locations: locs?.rows || [],
      skills: sks?.rows || [],
    });
  }

  async listActiveCities() {
    const result = await this.system.query(
      `SELECT id, name, state, country, tier FROM public.master_cities WHERE is_active = TRUE ORDER BY tier ASC, name ASC`
    );
    return result.rows || [];
  }
}

function maskPublicJob(job: any) {
  if (!job) return null;
  if (job.is_confidential) {
    return {
      ...job,
      company_name: 'Confidential Employer',
      company_logo_path: null,
      company_id: null,
      company_slug: null,
    };
  }
  return job;
}

@Controller('api/v1')
export class PublicJobController {
  constructor(private readonly jobs: JobService) {}

  @Get('job-categories')
  getCategories() {
    return this.jobs.listActiveCategories();
  }

  @Get('skills')
  getSkills() {
    return this.jobs.listActiveSkills();
  }

  @Get('cities')
  getCities() {
    return this.jobs.listActiveCities();
  }

  @Get('jobs')
  search(
    @Query('q') q?: string,
    @Query('query') query?: string,
    @Query('employment_type') empType?: string,
    @Query('employmentType') empTypeCamel?: string,
    @Query('work_mode') mode?: string,
    @Query('workMode') modeCamel?: string,
    @Query('country') country?: string,
    @Query('location_country') locCountry?: string,
    @Query('locationCountry') locCountryCamel?: string,
    @Query('category_id') catId?: string,
    @Query('categoryId') catIdCamel?: string,
    @Query('limit') limitStr?: string,
    @Query('cursor') cursor?: string,
  ) {
    const filters: JobSearchFilters = {
      query: query || q,
      employmentType: empType || empTypeCamel,
      workMode: mode || modeCamel,
      locationCountry: locCountry || country || locCountryCamel,
      categoryId: catId || catIdCamel,
    };
    const limit = limitStr ? parseInt(limitStr, 10) : 20;
    return this.jobs.searchPublicJobs(filters, limit, cursor);
  }

  @Get('jobs/slug/:slug')
  getBySlug(@Param('slug') slug: string) {
    return this.jobs.getPublicJobBySlug(slug);
  }

  @Get('jobs/:id')
  getById(@Param('id') id: string) {
    return this.jobs.getPublicJobById(id);
  }

  @Get('companies/:companySlugOrId/jobs/public/:jobSlug')
  getByCompanyAndSlug(
    @Param('companySlugOrId') companySlugOrId: string,
    @Param('jobSlug') jobSlug: string,
  ) {
    return this.jobs.getPublicJobByCompanyAndSlug(companySlugOrId, jobSlug);
  }
}

@Controller('api/v1/companies/:companyId/jobs')
@UseGuards(AuthGuard)
export class JobController {
  constructor(private readonly jobs: JobService) {}

  @Get()
  list(@Req() req: AuthRequest, @Param('companyId') companyId: string) {
    if (!req.user?.sub) throw new ForbiddenException('FORBIDDEN');
    return this.jobs.listCompanyJobs(req.user.sub, companyId);
  }

  @Post()
  create(@Req() req: AuthRequest, @Param('companyId') companyId: string, @Body() dto: CreateJobDto) {
    if (!req.user?.sub) throw new ForbiddenException('FORBIDDEN');
    return this.jobs.createDraft(req.user.sub, companyId, dto);
  }

  @Patch(':jobId')
  update(@Req() req: AuthRequest, @Param('companyId') companyId: string, @Param('jobId') jobId: string, @Body() dto: UpdateJobDto) {
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
  reject(@Req() req: AuthRequest, @Param('companyId') companyId: string, @Param('jobId') jobId: string, @Body() body: JobReasonDto) {
    if (!req.user?.sub) throw new ForbiddenException('FORBIDDEN');
    return this.jobs.reject(req.user.sub, companyId, jobId, body?.reason);
  }

  @Post(':jobId/archive')
  archive(@Req() req: AuthRequest, @Param('companyId') companyId: string, @Param('jobId') jobId: string, @Body() body: JobReasonDto) {
    if (!req.user?.sub) throw new ForbiddenException('FORBIDDEN');
    return this.jobs.archive(req.user.sub, companyId, jobId, body?.reason);
  }

  @Get(':jobId')
  get(@Req() req: AuthRequest, @Param('companyId') companyId: string, @Param('jobId') jobId: string) {
    if (!req.user?.sub) throw new ForbiddenException('FORBIDDEN');
    return this.jobs.getCompanyJob(req.user.sub, companyId, jobId);
  }
}