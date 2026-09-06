export type JobStatus = 'draft' | 'pending_approval' | 'published' | 'paused' | 'closed' | 'archived';

export interface JobLocationItem {
  id?: string;
  city: string;
  state?: string | null;
  country: string;
  postal_code?: string | null;
  is_primary: boolean;
}

export interface JobSkillItem {
  id?: string;
  skill_id: string;
  skill_name?: string;
  is_required?: boolean;
  min_years?: number;
  importance_score?: number;
}

export interface JobCategoryItem {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
}

export interface ScreeningQuestionItem {
  question: string;
  required: boolean;
  type?: string;
}

export interface InterviewRoundItem {
  round: number;
  name: string;
  description?: string;
}

export interface Job {
  id: string;
  company_id: string;
  branch_id?: string | null;
  department_id?: string | null;
  team_id?: string | null;
  category_id?: string | null;
  title: string;
  slug: string;
  reference_code?: string | null;
  employment_type?: string | null;
  work_mode?: string | null;
  work_shift?: string | null;
  education_type?: string | null;
  min_education_level?: string | null;
  experience_level?: string | null;
  experience_min?: number | null;
  experience_max?: number | null;
  max_notice_period_days?: number | null;
  category?: string | null;
  location_city?: string | null;
  location_state?: string | null;
  location_country?: string | null;
  locations?: JobLocationItem[];
  skills?: JobSkillItem[];
  screening_questions?: ScreeningQuestionItem[];
  interview_rounds?: InterviewRoundItem[];
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  salary_period?: string | null;
  salary_visible?: boolean;
  description: string;
  responsibilities?: string | null;
  requirements?: string | null;
  preferred_qualifications?: string | null;
  benefits?: string | null;
  vacancies?: number | null;
  location_remote?: boolean;
  status: JobStatus;
  published_at?: string | null;
  expires_at?: string | null;
  paused_at?: string | null;
  closed_at?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  company_name?: string | null;
  company_slug?: string | null;
  company_logo_path?: string | null;
  custom_skills?: string[];
  is_confidential?: boolean;
  is_urgent?: boolean;
  is_featured?: boolean;
}

export interface CreateJobDto {
  title: string;
  slug: string;
  description: string;
  branch_id?: string;
  department_id?: string;
  team_id?: string;
  category_id?: string;
  category?: string;
  employment_type?: string;
  work_mode?: string;
  experience_level?: string;
  experience_min?: number;
  experience_max?: number;
  max_notice_period_days?: number;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  salary_period?: string;
  salary_visible?: boolean;
  responsibilities?: string;
  requirements?: string;
  preferred_qualifications?: string;
  benefits?: string;
  vacancies?: number;
  is_confidential?: boolean;
  is_urgent?: boolean;
  is_featured?: boolean;
  location_city?: string;
  location_state?: string;
  location_country?: string;
  location_remote?: boolean;
  locations?: JobLocationItem[];
  skills?: JobSkillItem[];
  custom_skills?: string[];
  screening_questions?: ScreeningQuestionItem[];
}

export interface UpdateJobDto {
  title?: string;
  slug?: string;
  description?: string;
  branch_id?: string;
  department_id?: string;
  team_id?: string;
  category_id?: string;
  category?: string;
  employment_type?: string;
  work_mode?: string;
  experience_level?: string;
  experience_min?: number;
  experience_max?: number;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  salary_period?: string;
  salary_visible?: boolean;
  responsibilities?: string;
  requirements?: string;
  preferred_qualifications?: string;
  benefits?: string;
  vacancies?: number;
  is_confidential?: boolean;
  is_urgent?: boolean;
  is_featured?: boolean;
  location_city?: string;
  location_state?: string;
  location_country?: string;
  location_remote?: boolean;
  locations?: JobLocationItem[];
  skills?: JobSkillItem[];
  custom_skills?: string[];
  screening_questions?: ScreeningQuestionItem[];
}


export interface CompanySettings {
  company_id: string;
  job_approval_required: boolean;
  auto_shortlist_enabled?: boolean;
  ai_matching_enabled?: boolean;
  updated_at?: string;
}
