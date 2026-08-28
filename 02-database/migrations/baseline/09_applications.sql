-- ============================================================================
-- Applications, Snapshots, Guest Claims, Saved Jobs & Referral Invitations
--
-- QUICK SUMMARY:
-- This file stores registered/guest applications and preserves exactly what was
-- submitted. Live candidate profiles may change later; application snapshots do
-- not. It also owns guest-account claims and manual referral invitations.
--
-- TABLE GROUPS CREATED HERE:
--   Applications: job_applications, application_status_history,
--                 application_documents, application_profile_snapshots
--   Guest claim:  guest_candidate_claims
--   Personal:     saved_jobs, saved_candidates
--   Referrals:    referral_batches, referral_invitations, referral_rewards
--
-- FUNCTIONS CREATED HERE:
--   1. validate_guest_application_session()        -> active job-scoped session lock
--   2. enforce_initial_lifecycle_state()            -> canonical INSERT states
--   3. enforce_application_identity()               -> immutable applicant/job
--   4. consume_guest_upload_session()               -> atomic one-time consumption
--   5. validate_application_document_origin()      -> registered/guest ownership
--   6. change_application_status()                  -> status/history/outbox atomically
--   7. enforce_application_status_update_path()     -> block ad-hoc status UPDATE
--   8. validate_guest_candidate_claim()             -> guest application/email match
--   9. enforce_guest_claim_transition()             -> controlled claim lifecycle
--  10. enforce_referral_batch_transition()          -> controlled batch lifecycle
--  11. enforce_referral_invitation_identity()       -> immutable attribution/contact
--  12. enforce_referral_reward_transition()         -> controlled reward lifecycle
--  13. validate_referral_invitation_application()   -> invitation/applicant match
--  14. enforce_referral_invitation_transition()     -> allowed invite lifecycle
--
-- WHEN DATA IS WRITTEN:
--   * Candidate Apply transaction inserts application, document links, submitted
--     snapshot, initial history and outbox event together.
--   * Recruiter workflow updates current status and appends status history.
--   * Guest signup uses a claim row; it does not rewrite guest application history.
--   * Manual referral form creates one batch and many invitation rows; an
--     application is created only if an invited person chooses to apply.
--
-- CORE RULES:
-- One candidate/email may apply once per job. Every snapshot is immutable.
-- Registered ownership comes from auth, not request-body ids. Guest attachments
-- must originate from the application's exact job-scoped upload session.
--
-- NEXT FILE:
-- 10_interviews.sql begins after an application reaches interview workflow.
-- Detailed guide: 09_applications_Explanation.md
-- ============================================================================

CREATE TABLE job_applications (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id              UUID NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
    candidate_id        UUID,
    user_id             UUID REFERENCES users(id) ON DELETE RESTRICT,
    is_guest            BOOLEAN NOT NULL DEFAULT FALSE,
    guest_upload_session_id UUID,
    guest_email         CITEXT,
    guest_email_normalized TEXT,
    guest_phone         VARCHAR(50),
    guest_name          VARCHAR(255),
    status              application_status NOT NULL DEFAULT 'applied',
    cover_letter        TEXT,
    answers_to_screening_questions JSONB NOT NULL DEFAULT '[]'::JSONB,
    ai_match_score      DECIMAL(5,2) CHECK (ai_match_score IS NULL OR ai_match_score BETWEEN 0 AND 100),
    ai_match_details    JSONB,
    ai_ranking_score    DECIMAL(5,2) CHECK (ai_ranking_score IS NULL OR ai_ranking_score BETWEEN 0 AND 100),
    reviewed_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at         TIMESTAMPTZ,
    shortlisted_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    shortlisted_at      TIMESTAMPTZ,
    rejected_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    rejected_at         TIMESTAMPTZ,
    rejection_reason    VARCHAR(500),
    hr_notes            TEXT,
    applied_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    CONSTRAINT application_candidate_user_fk
        FOREIGN KEY (candidate_id, user_id)
        REFERENCES candidate_profiles(id, user_id) ON DELETE RESTRICT,
    CONSTRAINT application_job_identity UNIQUE (id, job_id),
    CONSTRAINT application_guest_session_job_fk
        FOREIGN KEY (guest_upload_session_id, job_id)
        REFERENCES guest_upload_sessions(id, job_id) ON DELETE RESTRICT,
    CONSTRAINT application_identity_check CHECK (
        (is_guest = TRUE AND candidate_id IS NULL AND user_id IS NULL
         AND guest_upload_session_id IS NOT NULL
         AND NULLIF(BTRIM(guest_name), '') IS NOT NULL
         AND guest_email IS NOT NULL AND guest_email_normalized IS NOT NULL)
        OR
        (is_guest = FALSE AND candidate_id IS NOT NULL AND user_id IS NOT NULL
         AND guest_upload_session_id IS NULL
         AND guest_email IS NULL AND guest_email_normalized IS NULL
         AND guest_name IS NULL AND guest_phone IS NULL)
    ),
    CONSTRAINT application_guest_email_consistency CHECK (
        is_guest = FALSE
        OR guest_email_normalized = lower(btrim(guest_email::TEXT))
    ),
    CONSTRAINT application_screening_answers_array CHECK (
        jsonb_typeof(answers_to_screening_questions) = 'array'
    ),
    CONSTRAINT application_ai_match_details_object CHECK (
        ai_match_details IS NULL OR jsonb_typeof(ai_match_details) = 'object'
    )
);

CREATE UNIQUE INDEX uq_guest_application_upload_session
    ON job_applications(guest_upload_session_id)
    WHERE is_guest = TRUE;

CREATE TABLE application_status_history (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id      UUID NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
    from_status         application_status,
    to_status           application_status NOT NULL,
    changed_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    change_reason       VARCHAR(500),
    metadata            JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT application_status_history_transition_check CHECK (
        from_status IS NULL OR from_status IS DISTINCT FROM to_status
    ),
    CONSTRAINT application_status_history_metadata_object CHECK (
        jsonb_typeof(metadata) = 'object'
    )
);

CREATE TABLE application_documents (
    application_id      UUID NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
    document_id         UUID NOT NULL REFERENCES uploaded_documents(id) ON DELETE RESTRICT,
    document_role       document_role NOT NULL,
    submitted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (application_id, document_id, document_role)
);

CREATE TABLE application_profile_snapshots (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id          UUID NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
    snapshot_type           application_snapshot_type NOT NULL,
    snapshot_version        INTEGER NOT NULL CHECK (snapshot_version > 0),
    schema_version          VARCHAR(50) NOT NULL,
    source_profile_revision BIGINT,
    snapshot_data           JSONB NOT NULL,
    resume_document_id      UUID REFERENCES uploaded_documents(id) ON DELETE RESTRICT,
    generated_by            snapshot_generator NOT NULL,
    generated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT application_snapshot_schema_version_nonblank CHECK (
        schema_version = BTRIM(schema_version) AND schema_version <> ''
    ),
    CONSTRAINT application_snapshot_profile_revision_positive CHECK (
        source_profile_revision IS NULL OR source_profile_revision > 0
    ),
    CONSTRAINT application_snapshot_data_object CHECK (
        jsonb_typeof(snapshot_data) = 'object'
    ),
    CONSTRAINT unique_application_snapshot_version
        UNIQUE (application_id, snapshot_type, snapshot_version)
);

CREATE UNIQUE INDEX uq_application_submitted_snapshot
    ON application_profile_snapshots(application_id)
    WHERE snapshot_type = 'submitted';

CREATE TABLE guest_candidate_claims (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id          UUID NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
    guest_email_normalized  TEXT NOT NULL,
    claim_token_hash        VARCHAR(255) NOT NULL UNIQUE,
    claimed_by_user_id      UUID REFERENCES users(id) ON DELETE RESTRICT,
    candidate_id            UUID REFERENCES candidate_profiles(id) ON DELETE RESTRICT,
    status                  guest_claim_status NOT NULL DEFAULT 'pending',
    expires_at              TIMESTAMPTZ NOT NULL,
    verified_at             TIMESTAMPTZ,
    merged_at               TIMESTAMPTZ,
    expired_at              TIMESTAMPTZ,
    revoked_at              TIMESTAMPTZ,
    rejected_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT guest_claim_candidate_user_fk
        FOREIGN KEY (candidate_id, claimed_by_user_id)
        REFERENCES candidate_profiles(id, user_id) ON DELETE RESTRICT,
    CONSTRAINT guest_claim_token_hash_nonblank CHECK (
        claim_token_hash = BTRIM(claim_token_hash) AND claim_token_hash <> ''
    ),
    CONSTRAINT guest_claim_expiry_check CHECK (expires_at > created_at),
    CONSTRAINT guest_claim_status_fields_check CHECK (
        (status = 'pending' AND claimed_by_user_id IS NULL AND candidate_id IS NULL
         AND verified_at IS NULL AND merged_at IS NULL AND expired_at IS NULL
         AND revoked_at IS NULL AND rejected_at IS NULL)
        OR
        (status = 'verified' AND claimed_by_user_id IS NOT NULL
         AND candidate_id IS NULL AND verified_at IS NOT NULL AND merged_at IS NULL
         AND expired_at IS NULL AND revoked_at IS NULL AND rejected_at IS NULL)
        OR
        (status = 'merged' AND claimed_by_user_id IS NOT NULL AND candidate_id IS NOT NULL
         AND verified_at IS NOT NULL AND merged_at IS NOT NULL AND expired_at IS NULL
         AND revoked_at IS NULL AND rejected_at IS NULL)
        OR
        (status = 'expired' AND claimed_by_user_id IS NULL AND candidate_id IS NULL
         AND verified_at IS NULL AND merged_at IS NULL AND expired_at IS NOT NULL
         AND revoked_at IS NULL AND rejected_at IS NULL)
        OR
        (status = 'revoked' AND candidate_id IS NULL AND merged_at IS NULL
         AND expired_at IS NULL AND revoked_at IS NOT NULL AND rejected_at IS NULL)
        OR
        (status = 'rejected' AND candidate_id IS NULL AND merged_at IS NULL
         AND expired_at IS NULL AND revoked_at IS NULL AND rejected_at IS NOT NULL)
    )
);

CREATE TABLE saved_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    notes           TEXT,
    is_archived     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, job_id)
);

-- Private recruiter bookmark. This is intentionally not job-specific: an HR
-- can save a candidate from search/profile and consider that candidate later
-- for any job. Visibility is owned by recruiter_user_id, with company_id kept
-- as the tenant boundary; NestJS enforces active membership and authorization.
CREATE TABLE saved_candidates (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recruiter_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    candidate_id        UUID NOT NULL REFERENCES candidate_profiles(id) ON DELETE RESTRICT,
    private_note        TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT saved_candidates_owner_candidate_unique
        UNIQUE (recruiter_user_id, candidate_id)
);

-- One manual form submission may contain one or many candidates. Referral is an
-- authenticated-user capability and is intentionally not tied to a user role.
CREATE TABLE referral_batches (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id              UUID NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
    referrer_user_id    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    idempotency_key     VARCHAR(255) NOT NULL UNIQUE,
    status              referral_batch_status NOT NULL DEFAULT 'draft',
    total_entries       INTEGER NOT NULL DEFAULT 0 CHECK (total_entries >= 0),
    valid_entries       INTEGER NOT NULL DEFAULT 0 CHECK (valid_entries >= 0),
    invalid_entries     INTEGER NOT NULL DEFAULT 0 CHECK (invalid_entries >= 0),
    duplicate_entries   INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_entries >= 0),
    -- Unique-invitation counters, never raw send-attempt counters:
    -- queued_entries = invitations queued at least once (cumulative),
    -- sent_entries   = invitations successfully sent at least once (cumulative),
    -- failed_entries = invitations currently in terminal failed state (decrement
    --                  before a retry). Attempts live on each invitation row.
    queued_entries      INTEGER NOT NULL DEFAULT 0 CHECK (queued_entries >= 0),
    sent_entries        INTEGER NOT NULL DEFAULT 0 CHECK (sent_entries >= 0),
    failed_entries      INTEGER NOT NULL DEFAULT 0 CHECK (failed_entries >= 0),
    confirmed_at        TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT referral_batch_identity UNIQUE (id, job_id, referrer_user_id),
    CONSTRAINT referral_batch_idempotency_key_nonblank CHECK (
        idempotency_key = BTRIM(idempotency_key) AND idempotency_key <> ''
    ),
    CONSTRAINT referral_batch_entry_totals CHECK (
        total_entries = valid_entries + invalid_entries + duplicate_entries
        AND queued_entries <= valid_entries
        AND sent_entries <= queued_entries
        AND failed_entries <= queued_entries
    ),
    CONSTRAINT referral_batch_lifecycle_timestamps CHECK (
        (status = 'draft' AND confirmed_at IS NULL AND completed_at IS NULL)
        OR (status IN ('ready', 'processing') AND confirmed_at IS NOT NULL AND completed_at IS NULL)
        OR (status IN ('completed', 'partially_failed') AND confirmed_at IS NOT NULL AND completed_at IS NOT NULL)
        OR (status = 'cancelled' AND completed_at IS NOT NULL)
    )
);

CREATE TABLE referral_invitations (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id                    UUID NOT NULL,
    job_id                      UUID NOT NULL,
    referrer_user_id            UUID NOT NULL,
    referred_candidate_id       UUID REFERENCES candidate_profiles(id) ON DELETE SET NULL,
    referred_name               VARCHAR(255) NOT NULL,
    referred_email              CITEXT NOT NULL,
    referred_email_normalized   TEXT NOT NULL,
    referred_phone              VARCHAR(50),
    referred_phone_normalized   VARCHAR(30),
    invite_token_hash           VARCHAR(255) NOT NULL UNIQUE,
    status                      referral_invitation_status NOT NULL DEFAULT 'pending',
    application_id              UUID UNIQUE,
    notes                       TEXT,
    expires_at                  TIMESTAMPTZ NOT NULL,
    queued_at                   TIMESTAMPTZ,
    sent_at                     TIMESTAMPTZ,
    first_opened_at             TIMESTAMPTZ,
    last_opened_at              TIMESTAMPTZ,
    opened_count                INTEGER NOT NULL DEFAULT 0 CHECK (opened_count >= 0),
    applied_at                  TIMESTAMPTZ,
    declined_at                 TIMESTAMPTZ,
    expired_at                  TIMESTAMPTZ,
    failed_at                   TIMESTAMPTZ,
    cancelled_at                TIMESTAMPTZ,
    send_attempt_count          INTEGER NOT NULL DEFAULT 0 CHECK (send_attempt_count >= 0),
    last_send_attempt_at        TIMESTAMPTZ,
    last_delivery_error         TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT referral_invitation_batch_fk
        FOREIGN KEY (batch_id, job_id, referrer_user_id)
        REFERENCES referral_batches(id, job_id, referrer_user_id) ON DELETE RESTRICT,
    CONSTRAINT referral_invitation_application_fk
        FOREIGN KEY (application_id, job_id)
        REFERENCES job_applications(id, job_id) ON DELETE RESTRICT,
    CONSTRAINT referral_invitation_name_nonblank CHECK (NULLIF(BTRIM(referred_name), '') IS NOT NULL),
    CONSTRAINT referral_invitation_email_normalized CHECK (
        referred_email_normalized = lower(btrim(referred_email::TEXT))
        AND referred_email_normalized <> ''
    ),
    CONSTRAINT referral_invitation_token_hash_nonblank CHECK (
        invite_token_hash = BTRIM(invite_token_hash) AND invite_token_hash <> ''
    ),
    CONSTRAINT referral_invitation_expiry CHECK (expires_at > created_at),
    CONSTRAINT referral_invitation_open_tracking CHECK (
        (opened_count = 0 AND first_opened_at IS NULL AND last_opened_at IS NULL)
        OR
        (opened_count > 0 AND first_opened_at IS NOT NULL AND last_opened_at >= first_opened_at)
    ),
    CONSTRAINT referral_invitation_status_fields CHECK (
        (status <> 'queued' OR queued_at IS NOT NULL)
        AND (status NOT IN ('sent', 'opened', 'applied', 'declined') OR sent_at IS NOT NULL)
        AND (status <> 'opened' OR opened_count > 0)
        AND (status <> 'applied' OR (application_id IS NOT NULL AND applied_at IS NOT NULL))
        AND (status <> 'declined' OR declined_at IS NOT NULL)
        AND (status <> 'expired' OR expired_at IS NOT NULL)
        AND (status <> 'failed' OR failed_at IS NOT NULL)
        AND (status <> 'cancelled' OR cancelled_at IS NOT NULL)
        AND (status <> 'pending' OR (
            application_id IS NULL
            AND queued_at IS NULL AND sent_at IS NULL
            AND first_opened_at IS NULL AND last_opened_at IS NULL AND opened_count = 0
            AND applied_at IS NULL AND declined_at IS NULL AND expired_at IS NULL
            AND failed_at IS NULL AND cancelled_at IS NULL
            AND send_attempt_count = 0 AND last_send_attempt_at IS NULL
            AND last_delivery_error IS NULL
        ))
    )
);

-- Reward accounting is separate from invitation delivery/application status.
CREATE TABLE referral_rewards (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invitation_id       UUID NOT NULL UNIQUE REFERENCES referral_invitations(id) ON DELETE RESTRICT,
    status              referral_reward_status NOT NULL DEFAULT 'not_eligible',
    reward_type         VARCHAR(50),
    reward_amount       DECIMAL(10,2) CHECK (reward_amount IS NULL OR reward_amount >= 0),
    reward_currency     currency_code NOT NULL DEFAULT 'INR',
    reward_metadata     JSONB NOT NULL DEFAULT '{}'::JSONB,
    eligible_at         TIMESTAMPTZ,
    approved_at         TIMESTAMPTZ,
    approved_by         UUID REFERENCES users(id) ON DELETE RESTRICT,
    paid_at             TIMESTAMPTZ,
    payment_reference   VARCHAR(255),
    cancelled_at        TIMESTAMPTZ,
    cancellation_reason VARCHAR(500),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT referral_reward_metadata_object CHECK (
        jsonb_typeof(reward_metadata) = 'object'
    ),
    CONSTRAINT referral_reward_status_fields CHECK (
        (
            status = 'not_eligible'
            AND eligible_at IS NULL AND approved_at IS NULL AND approved_by IS NULL
            AND paid_at IS NULL AND payment_reference IS NULL
            AND cancelled_at IS NULL AND cancellation_reason IS NULL
        )
        OR (
            status = 'pending_eligibility'
            AND eligible_at IS NULL AND approved_at IS NULL AND approved_by IS NULL
            AND paid_at IS NULL AND payment_reference IS NULL
            AND cancelled_at IS NULL AND cancellation_reason IS NULL
        )
        OR (
            status = 'eligible'
            AND NULLIF(BTRIM(reward_type), '') IS NOT NULL
            AND (lower(BTRIM(reward_type)) NOT IN ('cash', 'points') OR reward_amount IS NOT NULL)
            AND eligible_at IS NOT NULL AND approved_at IS NULL AND approved_by IS NULL
            AND paid_at IS NULL AND payment_reference IS NULL
            AND cancelled_at IS NULL AND cancellation_reason IS NULL
        )
        OR (
            status = 'approved'
            AND NULLIF(BTRIM(reward_type), '') IS NOT NULL
            AND (lower(BTRIM(reward_type)) NOT IN ('cash', 'points') OR reward_amount IS NOT NULL)
            AND eligible_at IS NOT NULL AND approved_at IS NOT NULL AND approved_by IS NOT NULL
            AND paid_at IS NULL AND payment_reference IS NULL
            AND cancelled_at IS NULL AND cancellation_reason IS NULL
        )
        OR (
            status = 'paid'
            AND NULLIF(BTRIM(reward_type), '') IS NOT NULL
            AND (lower(BTRIM(reward_type)) NOT IN ('cash', 'points') OR reward_amount IS NOT NULL)
            AND eligible_at IS NOT NULL AND approved_at IS NOT NULL AND approved_by IS NOT NULL
            AND paid_at IS NOT NULL AND NULLIF(BTRIM(payment_reference), '') IS NOT NULL
            AND cancelled_at IS NULL AND cancellation_reason IS NULL
        )
        OR (
            status = 'cancelled'
            AND cancelled_at IS NOT NULL AND paid_at IS NULL AND payment_reference IS NULL
            AND (approved_at IS NULL OR (eligible_at IS NOT NULL AND approved_by IS NOT NULL))
            AND (approved_by IS NULL OR approved_at IS NOT NULL)
        )
    )
);

CREATE OR REPLACE FUNCTION validate_guest_application_session()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_status guest_upload_session_status;
    v_expires_at TIMESTAMPTZ;
    v_revoked_at TIMESTAMPTZ;
BEGIN
    IF NEW.is_guest IS NOT TRUE THEN
        RETURN NEW;
    END IF;

    SELECT status, expires_at, revoked_at
      INTO v_status, v_expires_at, v_revoked_at
      FROM guest_upload_sessions
     WHERE id = NEW.guest_upload_session_id
       AND job_id = NEW.job_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Guest upload session does not belong to this job';
    END IF;

    IF v_status <> 'active' OR v_expires_at <= NOW() OR v_revoked_at IS NOT NULL THEN
        RAISE EXCEPTION 'Guest upload session is not active and usable';
    END IF;

    RETURN NEW;
END;
$$;

-- Every lifecycle entity must enter through its canonical initial state. RLS
-- restricts client writes; this trigger also protects trusted-service mistakes.
CREATE OR REPLACE FUNCTION enforce_initial_lifecycle_state()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_expected TEXT;
BEGIN
    v_expected := CASE TG_TABLE_NAME
        WHEN 'job_applications' THEN 'applied'
        WHEN 'guest_candidate_claims' THEN 'pending'
        WHEN 'referral_batches' THEN 'draft'
        WHEN 'referral_invitations' THEN 'pending'
        WHEN 'referral_rewards' THEN 'not_eligible'
        ELSE NULL
    END;

    IF v_expected IS NULL OR NEW.status::TEXT <> v_expected THEN
        RAISE EXCEPTION '% must start in status %', TG_TABLE_NAME, v_expected;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_application_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.job_id IS DISTINCT FROM OLD.job_id
       OR NEW.candidate_id IS DISTINCT FROM OLD.candidate_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.is_guest IS DISTINCT FROM OLD.is_guest
       OR NEW.guest_upload_session_id IS DISTINCT FROM OLD.guest_upload_session_id
       OR NEW.guest_email IS DISTINCT FROM OLD.guest_email
       OR NEW.guest_email_normalized IS DISTINCT FROM OLD.guest_email_normalized
       OR NEW.guest_name IS DISTINCT FROM OLD.guest_name
       OR NEW.guest_phone IS DISTINCT FROM OLD.guest_phone THEN
        RAISE EXCEPTION 'Application identity is immutable after creation';
    END IF;

    RETURN NEW;
END;
$$;

-- NestJS calls this at the end of the same guest-apply transaction, after the
-- application, document links, submitted snapshot, initial history and outbox
-- event have been written. The row was locked by the insert guard above.
CREATE OR REPLACE FUNCTION consume_guest_upload_session(
    p_session_id UUID,
    p_application_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE guest_upload_sessions s
       SET status = 'consumed', consumed_at = NOW()
     WHERE s.id = p_session_id
       AND s.status = 'active'
       AND s.expires_at > NOW()
       AND s.revoked_at IS NULL
       AND EXISTS (
           SELECT 1
             FROM job_applications a
            WHERE a.id = p_application_id
              AND a.is_guest = TRUE
              AND a.guest_upload_session_id = s.id
              AND a.job_id = s.job_id
       );

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Guest upload session could not be consumed for application %', p_application_id;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION validate_application_document_origin()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_is_guest BOOLEAN;
    v_application_session UUID;
    v_application_user UUID;
    v_document_session UUID;
    v_document_user UUID;
BEGIN
    SELECT is_guest, guest_upload_session_id, user_id
      INTO v_is_guest, v_application_session, v_application_user
      FROM job_applications
     WHERE id = NEW.application_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Application not found';
    END IF;

    SELECT guest_upload_session_id, uploaded_by_user_id
      INTO v_document_session, v_document_user
      FROM uploaded_documents
     WHERE id = NEW.document_id AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active application document not found';
    END IF;

    IF v_is_guest THEN
        IF v_document_session IS DISTINCT FROM v_application_session THEN
            RAISE EXCEPTION 'Guest application document must come from its upload session';
        END IF;
    ELSIF v_document_user IS DISTINCT FROM v_application_user THEN
        RAISE EXCEPTION 'Registered application document must belong to its user';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION change_application_status(
    p_application_id UUID,
    p_to_status application_status,
    p_changed_by UUID,
    p_change_reason VARCHAR(500) DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS application_status
LANGUAGE plpgsql
AS $$
DECLARE
    v_from_status application_status;
BEGIN
    IF p_metadata IS NOT NULL AND jsonb_typeof(p_metadata) <> 'object' THEN
        RAISE EXCEPTION 'Application status metadata must be a JSON object';
    END IF;

    SELECT status INTO v_from_status
      FROM job_applications
     WHERE id = p_application_id AND deleted_at IS NULL
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active application % not found', p_application_id;
    END IF;

    IF p_to_status = v_from_status THEN
        RETURN v_from_status;
    END IF;

    IF NOT (
        (v_from_status = 'applied' AND p_to_status IN ('under_review','screening','shortlisted','rejected','withdrawn','on_hold'))
        OR (v_from_status = 'under_review' AND p_to_status IN ('screening','shortlisted','rejected','withdrawn','on_hold'))
        OR (v_from_status = 'screening' AND p_to_status IN ('shortlisted','interview_scheduled','rejected','withdrawn','on_hold'))
        OR (v_from_status = 'shortlisted' AND p_to_status IN ('screening','interview_scheduled','rejected','withdrawn','on_hold'))
        OR (v_from_status = 'interview_scheduled' AND p_to_status IN ('interview_completed','rejected','withdrawn','on_hold'))
        OR (v_from_status = 'interview_completed' AND p_to_status IN ('selected','rejected','withdrawn','on_hold'))
        OR (v_from_status = 'selected' AND p_to_status IN ('offer_extended','rejected','withdrawn','on_hold'))
        OR (v_from_status = 'offer_extended' AND p_to_status IN ('offer_accepted','offer_declined','withdrawn','on_hold'))
        OR (v_from_status = 'on_hold' AND p_to_status IN ('under_review','screening','shortlisted','interview_scheduled','interview_completed','selected','offer_extended','rejected','withdrawn'))
    ) THEN
        RAISE EXCEPTION 'Invalid application status transition: % -> %', v_from_status, p_to_status;
    END IF;

    PERFORM set_config('app.application_status_change', 'allowed', TRUE);

    UPDATE job_applications
       SET status = p_to_status,
           reviewed_by = CASE WHEN p_to_status = 'under_review' THEN p_changed_by ELSE reviewed_by END,
           reviewed_at = CASE WHEN p_to_status = 'under_review' THEN NOW() ELSE reviewed_at END,
           shortlisted_by = CASE WHEN p_to_status = 'shortlisted' THEN p_changed_by ELSE shortlisted_by END,
           shortlisted_at = CASE WHEN p_to_status = 'shortlisted' THEN NOW() ELSE shortlisted_at END,
           rejected_by = CASE WHEN p_to_status = 'rejected' THEN p_changed_by ELSE rejected_by END,
           rejected_at = CASE WHEN p_to_status = 'rejected' THEN NOW() ELSE rejected_at END,
           rejection_reason = CASE WHEN p_to_status = 'rejected' THEN p_change_reason ELSE rejection_reason END
     WHERE id = p_application_id;

    PERFORM set_config('app.application_status_change', '', TRUE);

    INSERT INTO application_status_history (
        application_id, from_status, to_status, changed_by, change_reason, metadata
    ) VALUES (
        p_application_id, v_from_status, p_to_status, p_changed_by,
        p_change_reason, COALESCE(p_metadata, '{}'::JSONB)
    );

    INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
    VALUES (
        'job_application', p_application_id, 'application.status.changed',
        COALESCE(p_metadata, '{}'::JSONB) || jsonb_build_object(
            'applicationId', p_application_id,
            'fromStatus', v_from_status,
            'toStatus', p_to_status,
            'changedBy', p_changed_by
        )
    );

    RETURN p_to_status;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_application_status_update_path()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status
       AND current_setting('app.application_status_change', TRUE) IS DISTINCT FROM 'allowed' THEN
        RAISE EXCEPTION 'Application status must be changed with change_application_status()';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_guest_candidate_claim()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_is_guest BOOLEAN;
    v_guest_email TEXT;
BEGIN
    SELECT is_guest, guest_email_normalized
      INTO v_is_guest, v_guest_email
      FROM job_applications
     WHERE id = NEW.application_id;

    IF v_is_guest IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Candidate claims are allowed only for guest applications';
    END IF;

    IF NEW.guest_email_normalized IS DISTINCT FROM v_guest_email THEN
        RAISE EXCEPTION 'Claim email must match the guest application email';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_guest_claim_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.application_id IS DISTINCT FROM OLD.application_id
       OR NEW.guest_email_normalized IS DISTINCT FROM OLD.guest_email_normalized
       OR NEW.claim_token_hash IS DISTINCT FROM OLD.claim_token_hash
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
        RAISE EXCEPTION 'Guest claim identity fields are immutable';
    END IF;

    IF NEW.status = OLD.status THEN
        IF NEW.claimed_by_user_id IS DISTINCT FROM OLD.claimed_by_user_id
           OR NEW.candidate_id IS DISTINCT FROM OLD.candidate_id
           OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
           OR NEW.merged_at IS DISTINCT FROM OLD.merged_at
           OR NEW.expired_at IS DISTINCT FROM OLD.expired_at
           OR NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
           OR NEW.rejected_at IS DISTINCT FROM OLD.rejected_at THEN
            RAISE EXCEPTION 'Guest claim lifecycle fields require a status transition';
        END IF;
        RETURN NEW;
    END IF;

    IF NOT (
        (OLD.status = 'pending' AND NEW.status IN ('verified','expired','revoked','rejected'))
        OR (OLD.status = 'verified' AND NEW.status IN ('merged','revoked','rejected'))
    ) THEN
        RAISE EXCEPTION 'Invalid guest claim status transition: % -> %', OLD.status, NEW.status;
    END IF;

    IF OLD.status = 'pending' AND NEW.status IN ('expired','revoked','rejected')
       AND (NEW.claimed_by_user_id IS DISTINCT FROM OLD.claimed_by_user_id
            OR NEW.candidate_id IS DISTINCT FROM OLD.candidate_id
            OR NEW.verified_at IS DISTINCT FROM OLD.verified_at) THEN
        RAISE EXCEPTION 'Unverified terminal claim cannot acquire user/candidate identity';
    END IF;

    IF OLD.status = 'verified'
       AND NEW.claimed_by_user_id IS DISTINCT FROM OLD.claimed_by_user_id THEN
        RAISE EXCEPTION 'Verified claim user is immutable';
    END IF;

    IF NEW.status <> 'merged' AND NEW.candidate_id IS DISTINCT FROM OLD.candidate_id THEN
        RAISE EXCEPTION 'Candidate can be assigned only while merging a verified claim';
    END IF;

    IF NEW.status = 'verified' THEN
        NEW.verified_at := COALESCE(NEW.verified_at, NOW());
    ELSIF NEW.status = 'merged' THEN
        NEW.merged_at := COALESCE(NEW.merged_at, NOW());
    ELSIF NEW.status = 'expired' THEN
        NEW.expired_at := COALESCE(NEW.expired_at, NOW());
    ELSIF NEW.status = 'revoked' THEN
        NEW.revoked_at := COALESCE(NEW.revoked_at, NOW());
    ELSIF NEW.status = 'rejected' THEN
        NEW.rejected_at := COALESCE(NEW.rejected_at, NOW());
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_referral_batch_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = OLD.status THEN
        IF NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at
           OR NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
            RAISE EXCEPTION 'Referral batch lifecycle timestamps require a status transition';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.confirmed_at IS NOT NULL
       AND NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at THEN
        RAISE EXCEPTION 'Referral batch confirmation timestamp is immutable';
    END IF;

    IF NOT (
        (OLD.status = 'draft' AND NEW.status IN ('ready','cancelled'))
        OR (OLD.status = 'ready' AND NEW.status IN ('processing','cancelled'))
        OR (OLD.status = 'processing' AND NEW.status IN ('completed','partially_failed','cancelled'))
    ) THEN
        RAISE EXCEPTION 'Invalid referral batch status transition: % -> %', OLD.status, NEW.status;
    END IF;

    IF NEW.status = 'ready' THEN
        NEW.confirmed_at := NOW();
        NEW.completed_at := NULL;
    ELSIF NEW.status = 'processing' THEN
        NEW.confirmed_at := OLD.confirmed_at;
        NEW.completed_at := NULL;
    ELSIF NEW.status IN ('completed','partially_failed','cancelled') THEN
        NEW.confirmed_at := OLD.confirmed_at;
        NEW.completed_at := NOW();
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_referral_invitation_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.batch_id IS DISTINCT FROM OLD.batch_id
       OR NEW.job_id IS DISTINCT FROM OLD.job_id
       OR NEW.referrer_user_id IS DISTINCT FROM OLD.referrer_user_id
       OR NEW.referred_email IS DISTINCT FROM OLD.referred_email
       OR NEW.referred_email_normalized IS DISTINCT FROM OLD.referred_email_normalized
       OR NEW.invite_token_hash IS DISTINCT FROM OLD.invite_token_hash
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
        RAISE EXCEPTION 'Referral invitation identity fields are immutable';
    END IF;

    IF OLD.application_id IS NOT NULL
       AND NEW.application_id IS DISTINCT FROM OLD.application_id THEN
        RAISE EXCEPTION 'Referral application attribution is immutable once assigned';
    END IF;

    IF OLD.application_id IS NULL AND NEW.application_id IS NOT NULL
       AND NEW.status <> 'applied' THEN
        RAISE EXCEPTION 'Referral application can be assigned only during applied transition';
    END IF;

    IF OLD.referred_candidate_id IS NOT NULL
       AND NEW.referred_candidate_id IS DISTINCT FROM OLD.referred_candidate_id THEN
        RAISE EXCEPTION 'Referred candidate attribution is immutable once assigned';
    END IF;

    IF OLD.referred_candidate_id IS NULL AND NEW.referred_candidate_id IS NOT NULL
       AND (NEW.status <> 'applied' OR NEW.application_id IS NULL) THEN
        RAISE EXCEPTION 'Candidate attribution requires the applied application transition';
    END IF;

    -- A typo may be corrected while still pending. The transition to queued
    -- freezes the final recipient/contact data used for delivery and audit.
    IF OLD.status <> 'pending'
       AND (NEW.referred_name IS DISTINCT FROM OLD.referred_name
            OR NEW.referred_phone IS DISTINCT FROM OLD.referred_phone
            OR NEW.referred_phone_normalized IS DISTINCT FROM OLD.referred_phone_normalized) THEN
        RAISE EXCEPTION 'Queued referral invitation contact data is immutable';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_referral_reward_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.invitation_id IS DISTINCT FROM OLD.invitation_id THEN
        RAISE EXCEPTION 'Referral reward invitation identity is immutable';
    END IF;

    IF OLD.status = 'paid'
       AND (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
        RAISE EXCEPTION 'Paid referral reward is immutable';
    END IF;

    IF OLD.status = 'approved'
       AND (NEW.reward_type IS DISTINCT FROM OLD.reward_type
            OR NEW.reward_amount IS DISTINCT FROM OLD.reward_amount
            OR NEW.reward_currency IS DISTINCT FROM OLD.reward_currency
            OR NEW.reward_metadata IS DISTINCT FROM OLD.reward_metadata) THEN
        RAISE EXCEPTION 'Approved referral reward financial terms are immutable';
    END IF;

    IF NEW.status = OLD.status
       AND (NEW.eligible_at IS DISTINCT FROM OLD.eligible_at
            OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
            OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
            OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
            OR NEW.payment_reference IS DISTINCT FROM OLD.payment_reference
            OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
            OR NEW.cancellation_reason IS DISTINCT FROM OLD.cancellation_reason) THEN
        RAISE EXCEPTION 'Reward lifecycle fields require a status transition';
    END IF;

    IF NEW.status <> OLD.status AND NOT (
        (OLD.status = 'not_eligible' AND NEW.status IN ('pending_eligibility','cancelled'))
        OR (OLD.status = 'pending_eligibility' AND NEW.status IN ('eligible','cancelled'))
        OR (OLD.status = 'eligible' AND NEW.status IN ('approved','cancelled'))
        OR (OLD.status = 'approved' AND NEW.status IN ('paid','cancelled'))
    ) THEN
        RAISE EXCEPTION 'Invalid referral reward status transition: % -> %', OLD.status, NEW.status;
    END IF;

    IF NEW.status = 'eligible'
       AND (NEW.approved_at IS NOT NULL OR NEW.approved_by IS NOT NULL
            OR NEW.paid_at IS NOT NULL OR NEW.payment_reference IS NOT NULL
            OR NEW.cancelled_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Eligible reward contains fields from a later lifecycle stage';
    ELSIF NEW.status = 'approved'
       AND (NEW.paid_at IS NOT NULL OR NEW.payment_reference IS NOT NULL
            OR NEW.cancelled_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Approved reward contains fields from a later lifecycle stage';
    ELSIF NEW.status = 'paid' AND NEW.cancelled_at IS NOT NULL THEN
        RAISE EXCEPTION 'Paid reward cannot also be cancelled';
    ELSIF NEW.status = 'cancelled'
       AND (NEW.paid_at IS NOT NULL OR NEW.payment_reference IS NOT NULL) THEN
        RAISE EXCEPTION 'Cancelled reward cannot contain payment completion fields';
    END IF;

    IF NEW.status = 'eligible' AND OLD.status <> 'eligible' THEN
        NEW.eligible_at := COALESCE(NEW.eligible_at, NOW());
    ELSIF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
        NEW.approved_at := COALESCE(NEW.approved_at, NOW());
    ELSIF NEW.status = 'paid' AND OLD.status <> 'paid' THEN
        NEW.paid_at := COALESCE(NEW.paid_at, NOW());
    ELSIF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
        NEW.cancelled_at := COALESCE(NEW.cancelled_at, NOW());
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_referral_invitation_application()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_is_guest BOOLEAN;
    v_candidate_id UUID;
    v_application_email TEXT;
BEGIN
    IF NEW.application_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT a.is_guest,
           a.candidate_id,
           lower(btrim(COALESCE(a.guest_email_normalized::TEXT, u.email::TEXT)))
      INTO v_is_guest, v_candidate_id, v_application_email
      FROM job_applications a
      LEFT JOIN users u ON u.id = a.user_id
     WHERE a.id = NEW.application_id
       AND a.job_id = NEW.job_id;

    IF v_application_email IS NULL THEN
        RAISE EXCEPTION 'Referral application or applicant email not found';
    END IF;

    IF v_application_email <> NEW.referred_email_normalized THEN
        RAISE EXCEPTION 'Referral invitation email must match the applicant email';
    END IF;

    IF NOT v_is_guest
       AND NEW.referred_candidate_id IS NOT NULL
       AND NEW.referred_candidate_id IS DISTINCT FROM v_candidate_id THEN
        RAISE EXCEPTION 'Referral invitation candidate must match the registered applicant';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_referral_invitation_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;

    IF NOT (
        (OLD.status = 'pending' AND NEW.status IN ('queued', 'expired', 'cancelled'))
        OR (OLD.status = 'queued' AND NEW.status IN ('sent', 'applied', 'expired', 'failed', 'cancelled'))
        OR (OLD.status = 'sent' AND NEW.status IN ('opened', 'applied', 'declined', 'expired', 'failed', 'cancelled'))
        OR (OLD.status = 'opened' AND NEW.status IN ('applied', 'declined', 'expired', 'cancelled'))
        OR (OLD.status = 'failed' AND NEW.status IN ('queued', 'expired', 'cancelled'))
    ) THEN
        RAISE EXCEPTION 'Invalid referral invitation status transition: % -> %', OLD.status, NEW.status;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER job_applications_updated_at BEFORE UPDATE ON job_applications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER job_applications_guest_session_guard
    BEFORE INSERT OR UPDATE OF is_guest, guest_upload_session_id, job_id ON job_applications
    FOR EACH ROW EXECUTE FUNCTION validate_guest_application_session();
CREATE TRIGGER job_applications_initial_status_guard
    BEFORE INSERT ON job_applications
    FOR EACH ROW EXECUTE FUNCTION enforce_initial_lifecycle_state();
CREATE TRIGGER job_applications_identity_guard
    BEFORE UPDATE ON job_applications
    FOR EACH ROW EXECUTE FUNCTION enforce_application_identity();
CREATE TRIGGER job_applications_no_hard_delete BEFORE DELETE ON job_applications
    FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change();
CREATE TRIGGER job_applications_status_update_guard
    BEFORE UPDATE OF status ON job_applications
    FOR EACH ROW EXECUTE FUNCTION enforce_application_status_update_path();
CREATE TRIGGER saved_jobs_updated_at BEFORE UPDATE ON saved_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER saved_candidates_updated_at BEFORE UPDATE ON saved_candidates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER referral_batches_updated_at BEFORE UPDATE ON referral_batches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER referral_batches_initial_status_guard
    BEFORE INSERT ON referral_batches
    FOR EACH ROW EXECUTE FUNCTION enforce_initial_lifecycle_state();
CREATE TRIGGER referral_batches_transition_guard
    BEFORE UPDATE OF status ON referral_batches
    FOR EACH ROW EXECUTE FUNCTION enforce_referral_batch_transition();
CREATE TRIGGER referral_invitations_updated_at BEFORE UPDATE ON referral_invitations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER referral_invitations_initial_status_guard
    BEFORE INSERT ON referral_invitations
    FOR EACH ROW EXECUTE FUNCTION enforce_initial_lifecycle_state();
CREATE TRIGGER referral_rewards_updated_at BEFORE UPDATE ON referral_rewards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER referral_rewards_initial_status_guard
    BEFORE INSERT ON referral_rewards
    FOR EACH ROW EXECUTE FUNCTION enforce_initial_lifecycle_state();
CREATE TRIGGER application_snapshots_immutable
    BEFORE UPDATE OR DELETE ON application_profile_snapshots
    FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change();
CREATE TRIGGER application_status_history_immutable
    BEFORE UPDATE OR DELETE ON application_status_history
    FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change();
CREATE TRIGGER application_documents_origin_guard
    BEFORE INSERT OR UPDATE ON application_documents
    FOR EACH ROW EXECUTE FUNCTION validate_application_document_origin();
CREATE TRIGGER application_documents_immutable
    BEFORE UPDATE OR DELETE ON application_documents
    FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change();
CREATE TRIGGER guest_candidate_claims_guard
    BEFORE INSERT OR UPDATE ON guest_candidate_claims
    FOR EACH ROW EXECUTE FUNCTION validate_guest_candidate_claim();
CREATE TRIGGER guest_candidate_claims_initial_status_guard
    BEFORE INSERT ON guest_candidate_claims
    FOR EACH ROW EXECUTE FUNCTION enforce_initial_lifecycle_state();
CREATE TRIGGER guest_candidate_claims_transition_guard
    BEFORE UPDATE ON guest_candidate_claims
    FOR EACH ROW EXECUTE FUNCTION enforce_guest_claim_transition();
CREATE TRIGGER guest_candidate_claims_no_hard_delete
    BEFORE DELETE ON guest_candidate_claims
    FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change();
CREATE TRIGGER referral_batches_no_hard_delete
    BEFORE DELETE ON referral_batches
    FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change();
CREATE TRIGGER referral_invitations_application_guard
    BEFORE INSERT OR UPDATE OF application_id, job_id, referred_candidate_id, referred_email_normalized
    ON referral_invitations
    FOR EACH ROW EXECUTE FUNCTION validate_referral_invitation_application();
CREATE TRIGGER referral_invitations_transition_guard
    BEFORE UPDATE OF status ON referral_invitations
    FOR EACH ROW EXECUTE FUNCTION enforce_referral_invitation_transition();
CREATE TRIGGER referral_invitations_identity_guard
    BEFORE UPDATE ON referral_invitations
    FOR EACH ROW EXECUTE FUNCTION enforce_referral_invitation_identity();
CREATE TRIGGER referral_invitations_no_hard_delete
    BEFORE DELETE ON referral_invitations
    FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change();
CREATE TRIGGER referral_rewards_no_hard_delete
    BEFORE DELETE ON referral_rewards
    FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change();
CREATE TRIGGER referral_rewards_transition_guard
    BEFORE UPDATE ON referral_rewards
    FOR EACH ROW EXECUTE FUNCTION enforce_referral_reward_transition();

CREATE UNIQUE INDEX uq_registered_application_per_job
    ON job_applications(job_id, candidate_id)
    WHERE is_guest = FALSE;
CREATE UNIQUE INDEX uq_guest_application_per_job
    ON job_applications(job_id, guest_email_normalized)
    WHERE is_guest = TRUE;
CREATE UNIQUE INDEX uq_guest_claim_in_progress_or_merged
    ON guest_candidate_claims(application_id)
    WHERE status IN ('pending', 'verified', 'merged');
CREATE INDEX idx_applications_job_status
    ON job_applications(job_id, status, applied_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_applications_candidate
    ON job_applications(candidate_id, applied_at DESC) WHERE candidate_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_applications_user
    ON job_applications(user_id, applied_at DESC) WHERE user_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_saved_candidates_owner_created
    ON saved_candidates(recruiter_user_id, created_at DESC);
CREATE INDEX idx_application_status_history
    ON application_status_history(application_id, created_at);
CREATE INDEX idx_application_documents_document
    ON application_documents(document_id);
CREATE INDEX idx_application_snapshots_timeline
    ON application_profile_snapshots(application_id, snapshot_type, snapshot_version DESC);
CREATE INDEX idx_guest_claims_expiry
    ON guest_candidate_claims(expires_at) WHERE status = 'pending';
CREATE INDEX idx_guest_claims_candidate_user
    ON guest_candidate_claims(candidate_id, claimed_by_user_id)
    WHERE candidate_id IS NOT NULL;
CREATE UNIQUE INDEX uq_referral_invitation_active_or_final
    ON referral_invitations(job_id, referrer_user_id, referred_email_normalized)
    WHERE status NOT IN ('expired', 'cancelled');
CREATE INDEX idx_referral_batches_owner
    ON referral_batches(referrer_user_id, created_at DESC);
CREATE INDEX idx_referral_batches_job_status
    ON referral_batches(job_id, status, created_at DESC);
CREATE INDEX idx_referral_invitations_batch
    ON referral_invitations(batch_id, created_at);
CREATE INDEX idx_referral_invitations_delivery_queue
    ON referral_invitations(status, queued_at, created_at)
    WHERE status IN ('queued', 'failed');
CREATE INDEX idx_referral_invitations_expiry
    ON referral_invitations(expires_at)
    WHERE status IN ('pending', 'queued', 'sent', 'opened', 'failed');
CREATE INDEX idx_referral_rewards_status
    ON referral_rewards(status, created_at)
    WHERE status IN ('pending_eligibility', 'eligible', 'approved');
