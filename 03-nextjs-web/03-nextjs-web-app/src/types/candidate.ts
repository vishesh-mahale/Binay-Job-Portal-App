export type CandidateFact = Record<string, unknown> & { id: string };

export interface CandidateProfile {
  id: string;
  professional_title: string | null;
  summary: string | null;
  current_location: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  preferred_work_mode: string | null;
  willing_to_relocate: boolean;
  willing_to_travel: boolean;
  remote_experience: boolean;
  notice_period_days: number | null;
  expected_salary_min: number | null;
  expected_salary_max: number | null;
  salary_currency: string;
  work_authorization: string | null;
  visa_sponsorship_needed: boolean;
  is_open_to_work: boolean;
  available_from: string | null;
  date_of_birth: string | null;
  gender: string | null;
  nationality: string | null;
  profile_revision: number;
  profile_completed_at: string | null;
}

export interface CandidateProfileResponse {
  profile: CandidateProfile;
  links: CandidateFact[];
  skills: CandidateFact[];
  experiences: CandidateFact[];
  educations: CandidateFact[];
  certifications: CandidateFact[];
  projects: CandidateFact[];
  languages: CandidateFact[];
  awards: CandidateFact[];
}

export type CandidateProfileUpdate = Partial<Omit<CandidateProfile, 'id' | 'profile_revision' | 'profile_completed_at'>> & {
  expected_profile_revision: number;
};

export interface CandidateResume {
  document_id: string;
  document_role: string;
  version_number: number;
  is_current: boolean;
  unlinked_at: string | null;
  uploaded_at: string;
  updated_at: string;
  security_scan_status: string;
  processing_status: string | null;
  stage: string;
  retryable: boolean;
}

export interface ResumeStatusResponse extends CandidateResume {
  parsing_job_id: string | null;
  timestamps: {
    uploaded_at: string;
    updated_at: string;
    started_at: string | null;
    completed_at: string | null;
    failed_at: string | null;
  };
}

export interface ParsedResumeResponse {
  document_id: string;
  parsing_job_id: string;
  schema_version: string;
  overall_confidence: number | null;
  confidence_details: Record<string, unknown> | null;
  validation_result: Record<string, unknown> | null;
  normalized_output: Record<string, unknown>;
  partial: boolean;
  created_at: string;
}

export interface ResumeConfirmationResponse {
  candidate_id: string;
  profile_revision: number;
  active_document_id: string;
  projection_queued: boolean;
  already_confirmed?: boolean;
  skipped_facts?: Record<string, number>;
}
