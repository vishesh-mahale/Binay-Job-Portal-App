export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export interface VerifyInvitationData {
  id: string;
  company_id: string;
  company_name: string;
  company_slug: string;
  email: string;
  role: string;
  title: string | null;
  expires_at: string;
  status: InvitationStatus;
  is_primary_hr: boolean;
}

export interface SignupWithInviteRequest {
  token: string;
  full_name: string;
  password: string;
}

export interface CreateCompanyInvitationRequest {
  email: string;
  title?: string;
  is_primary_hr?: boolean;
}

export interface CompanyInvitationSummary {
  id: string;
  company_id: string;
  email: string;
  role: string;
  title: string | null;
  status: InvitationStatus;
  expires_at: string;
  created_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  is_primary_hr: boolean;
}
