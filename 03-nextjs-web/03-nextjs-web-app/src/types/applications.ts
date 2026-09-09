export interface ApplicationListItem {
  application_id: string;
  job_id: string;
  status: string;
  applied_at: string;
  job_title: string;
  company_id: string | null;
  snapshot_id: string | null;
  source_profile_revision: number | null;
}

export interface ApplicationDetail extends ApplicationListItem {
  snapshot_version: number | null;
  schema_version: string | null;
  generated_by: string | null;
  generated_at: string | null;
  snapshot_summary?: Record<string, unknown> | null;
}

export interface ApplicationHistoryItem {
  id: string;
  from_status: string | null;
  to_status: string;
  change_reason: string | null;
  created_at: string;
}

export interface SubmitApplicationRequest {
  document_id: string;
  cover_letter?: string;
  answers_to_screening_questions?: unknown[];
  consent: true;
}
