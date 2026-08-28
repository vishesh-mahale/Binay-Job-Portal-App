-- ============================================================================
-- Row-Level Security and Runtime Grants
--
-- Next.js never performs privileged business-table writes directly. NestJS is
-- the public API; restricted FastAPI workers write approved processing output.
-- service_role is server-only. Tables without a policy are default-deny.
-- RLS filters rows, not columns, so mixed public/internal tables such as jobs,
-- companies, interviews and billing are exposed through NestJS safe DTOs.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
    SELECT u.role FROM public.users AS u
     WHERE u.id = auth.uid() AND u.status = 'active' AND u.deleted_at IS NULL
$$;

CREATE OR REPLACE FUNCTION public.is_company_member(p_company_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.companies AS c
         WHERE c.id=p_company_id AND c.owner_id=auth.uid()
           AND c.is_active=TRUE AND c.deleted_at IS NULL
        UNION ALL
        SELECT 1 FROM public.company_members AS cm
        JOIN public.companies AS c ON c.id=cm.company_id
         WHERE cm.company_id=p_company_id AND cm.user_id=auth.uid()
           AND cm.is_active=TRUE AND cm.left_at IS NULL
           AND c.is_active=TRUE AND c.deleted_at IS NULL
    )
$$;

CREATE OR REPLACE FUNCTION public.owns_candidate(p_candidate_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
    SELECT EXISTS (SELECT 1 FROM public.candidate_profiles AS cp
     WHERE cp.id=p_candidate_id AND cp.user_id=auth.uid() AND cp.deleted_at IS NULL)
$$;

CREATE OR REPLACE FUNCTION public.can_read_application(p_application_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
    SELECT EXISTS (SELECT 1 FROM public.job_applications AS a
     WHERE a.id=p_application_id AND a.user_id=auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.is_active_conversation_participant(p_conversation_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
    SELECT EXISTS (SELECT 1 FROM public.conversation_participants AS cp
     WHERE cp.conversation_id=p_conversation_id AND cp.user_id=auth.uid()
       AND cp.status='active' AND cp.left_at IS NULL)
$$;

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_company_member(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owns_candidate(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_read_application(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_active_conversation_participant(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_company_member(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owns_candidate(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_application(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_active_conversation_participant(UUID) TO authenticated, service_role;

-- All 03-15 public business tables must have RLS enabled.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_security_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_view_aggregates_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_upload_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploaded_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_parsing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_parsed_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_parsing_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_parsing_job_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_profile_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_educations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_skill_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_experience_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_education_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_certification_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_search_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_change_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_profile_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_candidate_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interviewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interviewer_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_schedule_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_read_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_delivery_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_daily_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_plan_eligibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_events ENABLE ROW LEVEL SECURITY;

-- Browser roles start with no runtime table privileges.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- Only these catalog tables are directly readable without NestJS DTO mapping.
GRANT SELECT ON public.job_categories, public.skills, public.subscription_plans TO anon, authenticated;
CREATE POLICY job_categories_active_read ON public.job_categories FOR SELECT TO anon, authenticated USING (is_active);
CREATE POLICY skills_active_read ON public.skills FOR SELECT TO anon, authenticated USING (is_active);
CREATE POLICY subscription_plans_public_read ON public.subscription_plans FOR SELECT TO anon, authenticated
USING (is_active AND is_public);

-- Authenticated personal read grants. No direct DML is granted.
GRANT SELECT ON
 public.users, public.user_security_log, public.login_history,
 public.candidate_profiles, public.candidate_profile_documents,
 public.candidate_links, public.candidate_skills, public.candidate_experiences,
 public.candidate_educations, public.candidate_certifications, public.candidate_projects,
 public.candidate_languages, public.candidate_awards, public.candidate_skill_evidence,
 public.candidate_experience_evidence, public.candidate_education_evidence,
 public.candidate_certification_evidence,
 public.profile_change_history, public.job_applications, public.application_status_history,
 public.application_documents, public.application_profile_snapshots, public.saved_jobs,
 public.saved_candidates,
 public.referral_batches, public.referral_invitations, public.referral_rewards,
 public.conversations, public.conversation_participants, public.messages,
 public.message_attachments, public.message_read_receipts, public.message_reactions
TO authenticated;

CREATE POLICY users_own_read ON public.users FOR SELECT TO authenticated USING (id=auth.uid());
CREATE POLICY security_log_own_read ON public.user_security_log FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE POLICY login_history_own_read ON public.login_history FOR SELECT TO authenticated USING (user_id=auth.uid());

CREATE POLICY candidate_profiles_own_read ON public.candidate_profiles FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE POLICY candidate_profile_documents_own_read ON public.candidate_profile_documents FOR SELECT TO authenticated USING (public.owns_candidate(candidate_id));
CREATE POLICY candidate_links_own_read ON public.candidate_links FOR SELECT TO authenticated USING (public.owns_candidate(candidate_id));
CREATE POLICY candidate_skills_own_read ON public.candidate_skills FOR SELECT TO authenticated USING (public.owns_candidate(candidate_id));
CREATE POLICY candidate_experiences_own_read ON public.candidate_experiences FOR SELECT TO authenticated USING (public.owns_candidate(candidate_id));
CREATE POLICY candidate_educations_own_read ON public.candidate_educations FOR SELECT TO authenticated USING (public.owns_candidate(candidate_id));
CREATE POLICY candidate_certifications_own_read ON public.candidate_certifications FOR SELECT TO authenticated USING (public.owns_candidate(candidate_id));
CREATE POLICY candidate_projects_own_read ON public.candidate_projects FOR SELECT TO authenticated USING (public.owns_candidate(candidate_id));
CREATE POLICY candidate_languages_own_read ON public.candidate_languages FOR SELECT TO authenticated USING (public.owns_candidate(candidate_id));
CREATE POLICY candidate_awards_own_read ON public.candidate_awards FOR SELECT TO authenticated USING (public.owns_candidate(candidate_id));
CREATE POLICY profile_history_own_read ON public.profile_change_history FOR SELECT TO authenticated USING (public.owns_candidate(candidate_id));

CREATE POLICY candidate_skill_evidence_own_read ON public.candidate_skill_evidence FOR SELECT TO authenticated USING
(EXISTS (SELECT 1 FROM public.candidate_skills f WHERE f.id=candidate_skill_id AND public.owns_candidate(f.candidate_id)));
CREATE POLICY candidate_experience_evidence_own_read ON public.candidate_experience_evidence FOR SELECT TO authenticated USING
(EXISTS (SELECT 1 FROM public.candidate_experiences f WHERE f.id=candidate_experience_id AND public.owns_candidate(f.candidate_id)));
CREATE POLICY candidate_education_evidence_own_read ON public.candidate_education_evidence FOR SELECT TO authenticated USING
(EXISTS (SELECT 1 FROM public.candidate_educations f WHERE f.id=candidate_education_id AND public.owns_candidate(f.candidate_id)));
CREATE POLICY candidate_certification_evidence_own_read ON public.candidate_certification_evidence FOR SELECT TO authenticated USING
(EXISTS (SELECT 1 FROM public.candidate_certifications f WHERE f.id=candidate_certification_id AND public.owns_candidate(f.candidate_id)));

CREATE POLICY applications_candidate_read ON public.job_applications FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE POLICY application_history_candidate_read ON public.application_status_history FOR SELECT TO authenticated USING (public.can_read_application(application_id));
CREATE POLICY application_documents_candidate_read ON public.application_documents FOR SELECT TO authenticated USING (public.can_read_application(application_id));
CREATE POLICY application_snapshots_candidate_read ON public.application_profile_snapshots FOR SELECT TO authenticated USING (public.can_read_application(application_id));
CREATE POLICY saved_jobs_own_read ON public.saved_jobs FOR SELECT TO authenticated USING (user_id=auth.uid());
-- Browser roles have SELECT only for the creator. Company membership,
-- candidate visibility and all writes are enforced by NestJS authorization on
-- the trusted SystemClient path; INSERT/UPDATE/DELETE stay backend-only.
CREATE POLICY saved_candidates_own_read ON public.saved_candidates FOR SELECT TO authenticated
    USING (recruiter_user_id = auth.uid());
CREATE POLICY referral_batches_own_read ON public.referral_batches FOR SELECT TO authenticated USING (referrer_user_id=auth.uid());
CREATE POLICY referral_invitations_own_read ON public.referral_invitations FOR SELECT TO authenticated USING (referrer_user_id=auth.uid());
CREATE POLICY referral_rewards_own_read ON public.referral_rewards FOR SELECT TO authenticated USING
(EXISTS (SELECT 1 FROM public.referral_invitations ri WHERE ri.id=invitation_id AND ri.referrer_user_id=auth.uid()));

CREATE POLICY conversations_active_participant_read ON public.conversations FOR SELECT TO authenticated USING (public.is_active_conversation_participant(id));
CREATE POLICY conversation_participants_active_member_read ON public.conversation_participants FOR SELECT TO authenticated USING (public.is_active_conversation_participant(conversation_id));
CREATE POLICY messages_active_participant_read ON public.messages FOR SELECT TO authenticated
USING (is_deleted=FALSE AND public.is_active_conversation_participant(conversation_id));
CREATE POLICY message_attachments_active_participant_read ON public.message_attachments FOR SELECT TO authenticated USING
(EXISTS (SELECT 1 FROM public.messages m WHERE m.id=message_id AND m.is_deleted=FALSE
 AND public.is_active_conversation_participant(m.conversation_id)));
CREATE POLICY message_receipts_active_participant_read ON public.message_read_receipts FOR SELECT TO authenticated USING
(EXISTS (SELECT 1 FROM public.messages m WHERE m.id=message_id AND m.is_deleted=FALSE
 AND public.is_active_conversation_participant(m.conversation_id)));
CREATE POLICY message_reactions_active_participant_read ON public.message_reactions FOR SELECT TO authenticated USING
(EXISTS (SELECT 1 FROM public.messages m WHERE m.id=message_id AND m.is_deleted=FALSE
 AND public.is_active_conversation_participant(m.conversation_id)));

-- Controlled function execution. Exact custom DB roles are not invented here;
-- server-side Dispatcher/Recovery currently use service_role.
REVOKE EXECUTE ON FUNCTION public.consume_guest_upload_session(UUID,UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.change_application_status(UUID,public.application_status,UUID,VARCHAR,JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_guest_upload_session(UUID,UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.change_application_status(UUID,public.application_status,UUID,VARCHAR,JSONB) TO service_role;

REVOKE EXECUTE ON FUNCTION public.claim_outbox_events(VARCHAR,INTEGER,INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_outbox_event_published(UUID,VARCHAR,VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_outbox_event_failed(UUID,VARCHAR,TEXT,TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.outbox_recovery_needed() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_outbox_events(VARCHAR,INTEGER,INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_outbox_event_published(UUID,VARCHAR,VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_outbox_event_failed(UUID,VARCHAR,TEXT,TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.outbox_recovery_needed() TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_due_jobs() TO service_role;
REVOKE EXECUTE ON FUNCTION public.expire_due_jobs() FROM anon, authenticated;

-- Service-only/default-deny: organization/job internals, guest secrets, parsing,
-- recruiter search, interviews/feedback, templates/delivery, analytics/audit,
-- billing/coupons, outbox and processed-event rows.
