-- ============================================================================
-- Interview Scheduling Schema
-- Manages interview slots, schedules, feedback, and internal calendar state.
-- Supports rolling availability, conflict prevention, and rescheduling.
-- External Google/Microsoft calendar and video-provider integrations are future scope.
--
-- TABLES CREATED HERE (8):
--   interview_pools, interviewers, interviewer_availability,
--   interview_schedule_blocks, interviews, interview_participants,
--   interview_feedback, interview_documents
--
-- FUNCTIONS CREATED HERE (3):
--   1. validate_interview_schedule_block_scope() -> same-company job/interviewer
--   2. validate_interview_application_scope()    -> application/job/candidate/pool/block
--   3. protect_final_interview_feedback()        -> submitted feedback immutable
--
-- CORE FLOW:
--   availability -> temporary block lock -> atomic booking -> interview + panel
--   -> candidate confirmation/lifecycle -> participant feedback.
-- Registered and guest applications are both supported. Guest interview candidate_id
-- stays NULL until an optional verified/merged guest claim exists.
--
-- WRITE OWNERSHIP:
--   NestJS validates company/application authorization and performs slot/interview
--   transactions. Browser clients do not write these service-only tables directly.
--
-- NEXT FILE:
--   11_messaging.sql owns authorized application/interview conversations.
-- Detailed guide: 10_interviews_Explanation.md
-- ============================================================================

-- ============================================================================
-- TABLE: interview_pools
-- Purpose: Groups interviewers/panels for organizational structure.
-- ============================================================================
CREATE TABLE interview_pools (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL, -- "Engineering Panel", "HR Round", etc.
    description     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT interview_pool_name_nonblank CHECK (name = BTRIM(name) AND name <> ''),
    CONSTRAINT interview_pool_company_identity UNIQUE (id, company_id),
    CONSTRAINT unique_pool_per_company UNIQUE (company_id, name)
);

CREATE TRIGGER interview_pools_updated_at
    BEFORE UPDATE ON interview_pools
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- TABLE: interviewers
-- Purpose: Users who can conduct interviews.
-- ============================================================================
CREATE TABLE interviewers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    pool_id         UUID,
    title           VARCHAR(255), -- "Senior Engineer", "HR Lead"
    is_active       BOOLEAN NOT NULL DEFAULT true,
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT interviewer_company_identity UNIQUE (id, company_id),
    CONSTRAINT unique_interviewer_per_company UNIQUE (user_id, company_id),
    CONSTRAINT interviewer_company_member_fk
        FOREIGN KEY (company_id, user_id)
        REFERENCES company_members(company_id, user_id) ON DELETE RESTRICT,
    CONSTRAINT interviewer_pool_company_fk
        FOREIGN KEY (pool_id, company_id)
        REFERENCES interview_pools(id, company_id) ON DELETE RESTRICT
);

CREATE TRIGGER interviewers_updated_at
    BEFORE UPDATE ON interviewers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- TABLE: interviewer_availability
-- Purpose: Recurring weekly availability windows for interviewers.
-- Supports rolling availability slots.
-- ============================================================================
CREATE TABLE interviewer_availability (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interviewer_id  UUID NOT NULL REFERENCES interviewers(id) ON DELETE CASCADE,
    day_of_week     SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday, 6=Saturday
    start_time      TIME NOT NULL, -- e.g., '09:00'
    end_time        TIME NOT NULL, -- e.g., '17:00'
    timezone        VARCHAR(50) NOT NULL DEFAULT 'UTC',
    is_active       BOOLEAN NOT NULL DEFAULT true,
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT valid_time_range CHECK (start_time < end_time),
    CONSTRAINT interviewer_availability_timezone_nonblank CHECK (
        timezone = BTRIM(timezone) AND timezone <> ''
    ),
    CONSTRAINT unique_interviewer_availability_window
        UNIQUE (interviewer_id, day_of_week, start_time, end_time, timezone)
);

CREATE TRIGGER interviewer_availability_updated_at
    BEFORE UPDATE ON interviewer_availability
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- TABLE: interview_schedule_blocks
-- Purpose: Specific time blocks (slots) that interviewers mark as available.
-- Can be one-time or recurring.
-- ============================================================================
CREATE TABLE interview_schedule_blocks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interviewer_id  UUID NOT NULL REFERENCES interviewers(id) ON DELETE CASCADE,
    job_id          UUID REFERENCES jobs(id) ON DELETE RESTRICT, -- NULL = general availability
    
    -- Time window
    start_time      TIMESTAMPTZ NOT NULL,
    end_time        TIMESTAMPTZ NOT NULL,
    slot_duration   INTEGER NOT NULL DEFAULT 30 CHECK (slot_duration > 0), -- Minutes per slot
    timezone        VARCHAR(50) NOT NULL DEFAULT 'UTC',
    
    -- Status
    is_booked       BOOLEAN NOT NULL DEFAULT false,
    booked_by       UUID REFERENCES users(id) ON DELETE SET NULL, -- Candidate or HR who booked
    booked_at       TIMESTAMPTZ, -- When the slot was booked
    locked_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    locked_until    TIMESTAMPTZ,
    is_recurring    BOOLEAN NOT NULL DEFAULT false,
    recurrence_rule VARCHAR(255), -- RRULE for recurring slots
    
    -- Linked application (set when candidate books via an application)
    application_id  UUID,
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT valid_block_time CHECK (start_time < end_time),
    CONSTRAINT interview_block_timezone_nonblank CHECK (
        timezone = BTRIM(timezone) AND timezone <> ''
    ),
    CONSTRAINT valid_slot_lock CHECK (
        (locked_by IS NULL AND locked_until IS NULL)
        OR (locked_by IS NOT NULL AND locked_until IS NOT NULL)
    ),
    CONSTRAINT interview_block_booking_state CHECK (
        (is_booked = FALSE AND booked_by IS NULL AND booked_at IS NULL AND application_id IS NULL)
        OR
        (is_booked = TRUE AND booked_by IS NOT NULL AND booked_at IS NOT NULL
         AND locked_by IS NULL AND locked_until IS NULL)
    ),
    CONSTRAINT interview_block_recurrence_state CHECK (
        (is_recurring = FALSE AND recurrence_rule IS NULL)
        OR
        (is_recurring = TRUE AND NULLIF(BTRIM(recurrence_rule), '') IS NOT NULL)
    ),
    CONSTRAINT interview_block_application_requires_job CHECK (
        application_id IS NULL OR job_id IS NOT NULL
    ),
    CONSTRAINT interview_block_application_job_fk
        FOREIGN KEY (application_id, job_id)
        REFERENCES job_applications(id, job_id) ON DELETE RESTRICT,
    
    -- Prevents overlapping time blocks for the same interviewer.
    -- Ensures an interviewer cannot have two schedule blocks
    -- whose time ranges overlap (e.g., 9:00-10:00 AND 9:30-10:30).
    -- Requires btree_gist extension.
    EXCLUDE USING gist (
        interviewer_id WITH =,
        tstzrange(start_time, end_time) WITH &&
    )
);

CREATE TRIGGER interview_schedule_blocks_updated_at
    BEFORE UPDATE ON interview_schedule_blocks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- TABLE: interviews
-- Purpose: Core interview entity linking candidates, jobs, interviewers.
-- ============================================================================
CREATE TABLE interviews (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id      UUID NOT NULL,
    job_id              UUID NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
    candidate_id        UUID REFERENCES candidate_profiles(id) ON DELETE RESTRICT,
    interview_pool_id   UUID REFERENCES interview_pools(id) ON DELETE SET NULL,
    schedule_block_id   UUID UNIQUE REFERENCES interview_schedule_blocks(id) ON DELETE RESTRICT,
    
    -- Interview details
    title               VARCHAR(255) NOT NULL,
    type                interview_type NOT NULL DEFAULT 'video',
    round               INTEGER NOT NULL DEFAULT 1 CHECK (round > 0), -- 1st round, 2nd round, etc.
    
    -- Scheduling
    scheduled_at        TIMESTAMPTZ NOT NULL,
    duration_minutes    INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
    timezone            VARCHAR(50) NOT NULL DEFAULT 'UTC',
    
    -- Meeting details
    meeting_link        TEXT, -- Zoom/Google Meet link
    meeting_id          VARCHAR(255),
    meeting_password    VARCHAR(255),
    meeting_provider    meeting_provider, -- 'zoom', 'google_meet', 'microsoft_teams', etc.
    location            TEXT, -- Physical location if in-person
    
    -- Notes & preparation
    interviewer_notes   TEXT, -- Private notes for interviewer
    candidate_instructions TEXT, -- Instructions sent to candidate
    
    -- Status
    status              interview_status NOT NULL DEFAULT 'scheduled',
    completed_at        TIMESTAMPTZ, -- When interview was marked completed (for analytics)
    reschedule_count    INTEGER NOT NULL DEFAULT 0 CHECK (reschedule_count >= 0),
    cancelled_reason    VARCHAR(500),
    cancellation_note   TEXT,
    
    -- Reschedule tracking
    rescheduled_from    UUID REFERENCES interviews(id) ON DELETE SET NULL,
    
    -- Reminders
    reminder_sent_at    TIMESTAMPTZ,
    is_candidate_confirmed BOOLEAN NOT NULL DEFAULT false,
    candidate_confirmed_at TIMESTAMPTZ,
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT interview_application_job_fk
        FOREIGN KEY (application_id, job_id)
        REFERENCES job_applications(id, job_id) ON DELETE RESTRICT,
    CONSTRAINT interview_title_nonblank CHECK (title = BTRIM(title) AND title <> ''),
    CONSTRAINT interview_timezone_nonblank CHECK (timezone = BTRIM(timezone) AND timezone <> ''),
    CONSTRAINT interview_self_reschedule_check CHECK (rescheduled_from IS NULL OR rescheduled_from <> id),
    CONSTRAINT interview_completion_state CHECK (
        (status = 'completed' AND completed_at IS NOT NULL)
        OR (status <> 'completed' AND completed_at IS NULL)
    ),
    CONSTRAINT interview_cancellation_state CHECK (
        status <> 'cancelled' OR NULLIF(BTRIM(cancelled_reason), '') IS NOT NULL
    ),
    CONSTRAINT interview_candidate_confirmation_state CHECK (
        (is_candidate_confirmed = FALSE AND candidate_confirmed_at IS NULL)
        OR (is_candidate_confirmed = TRUE AND candidate_confirmed_at IS NOT NULL)
    )
);

-- A job-specific block must belong to the same company as its interviewer.
-- If it is booked for an application, the composite FK above also locks it to
-- the application's job.
CREATE OR REPLACE FUNCTION validate_interview_schedule_block_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_interviewer_company_id UUID;
    v_job_company_id UUID;
BEGIN
    SELECT company_id INTO v_interviewer_company_id
      FROM interviewers
     WHERE id = NEW.interviewer_id;

    IF NEW.job_id IS NOT NULL THEN
        SELECT company_id INTO v_job_company_id
          FROM jobs
         WHERE id = NEW.job_id;

        IF v_job_company_id IS DISTINCT FROM v_interviewer_company_id THEN
            RAISE EXCEPTION 'Interview block job and interviewer must belong to the same company';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER interview_schedule_blocks_scope_guard
    BEFORE INSERT OR UPDATE OF interviewer_id, job_id, application_id
    ON interview_schedule_blocks
    FOR EACH ROW
    EXECUTE FUNCTION validate_interview_schedule_block_scope();

-- Registered interviews retain the application's candidate. Guest interviews
-- may start without a candidate profile; after a verified merge they may carry
-- the candidate linked by guest_candidate_claims. Pool and optional booked slot
-- must remain in the same application/job/company scope.
CREATE OR REPLACE FUNCTION validate_interview_application_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_is_guest BOOLEAN;
    v_application_candidate_id UUID;
    v_job_company_id UUID;
    v_pool_company_id UUID;
    v_block_application_id UUID;
    v_block_job_id UUID;
    v_block_is_booked BOOLEAN;
BEGIN
    SELECT a.is_guest, a.candidate_id, j.company_id
      INTO v_is_guest, v_application_candidate_id, v_job_company_id
      FROM job_applications a
      JOIN jobs j ON j.id = a.job_id
     WHERE a.id = NEW.application_id
       AND a.job_id = NEW.job_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Interview application and job do not match';
    END IF;

    IF v_is_guest THEN
        IF NEW.candidate_id IS NOT NULL AND NOT EXISTS (
            SELECT 1
              FROM guest_candidate_claims gcc
             WHERE gcc.application_id = NEW.application_id
               AND gcc.candidate_id = NEW.candidate_id
               AND gcc.status = 'merged'
        ) THEN
            RAISE EXCEPTION 'Guest interview candidate must come from a merged application claim';
        END IF;
    ELSIF NEW.candidate_id IS DISTINCT FROM v_application_candidate_id THEN
        RAISE EXCEPTION 'Registered interview candidate must match the application candidate';
    END IF;

    IF NEW.interview_pool_id IS NOT NULL THEN
        SELECT company_id INTO v_pool_company_id
          FROM interview_pools
         WHERE id = NEW.interview_pool_id;

        IF v_pool_company_id IS DISTINCT FROM v_job_company_id THEN
            RAISE EXCEPTION 'Interview pool and job must belong to the same company';
        END IF;
    END IF;

    IF NEW.schedule_block_id IS NOT NULL THEN
        SELECT application_id, job_id, is_booked
          INTO v_block_application_id, v_block_job_id, v_block_is_booked
          FROM interview_schedule_blocks
         WHERE id = NEW.schedule_block_id;

        IF v_block_is_booked IS DISTINCT FROM TRUE
           OR v_block_application_id IS DISTINCT FROM NEW.application_id
           OR v_block_job_id IS DISTINCT FROM NEW.job_id THEN
            RAISE EXCEPTION 'Interview schedule block must be booked for the same application and job';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER interviews_application_scope_guard
    BEFORE INSERT OR UPDATE OF application_id, job_id, candidate_id,
                               interview_pool_id, schedule_block_id
    ON interviews
    FOR EACH ROW
    EXECUTE FUNCTION validate_interview_application_scope();

CREATE TRIGGER interviews_updated_at
    BEFORE UPDATE ON interviews
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER interviews_no_hard_delete
    BEFORE DELETE ON interviews
    FOR EACH ROW
    EXECUTE FUNCTION reject_immutable_row_change();


-- ============================================================================
-- TABLE: interview_participants
-- Purpose: Maps interviewers/interview participants to interviews.
-- Supports panel interviews with multiple interviewers.
-- ============================================================================
CREATE TABLE interview_participants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id    UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    role            VARCHAR(100) NOT NULL DEFAULT 'interviewer',
    -- 'interviewer', 'observer', 'note_taker', 'recruiter', 'hiring_manager'
    
    is_primary      BOOLEAN NOT NULL DEFAULT false, -- Lead interviewer
    feedback_submitted BOOLEAN NOT NULL DEFAULT false,
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT interview_participant_role_nonblank CHECK (role = BTRIM(role) AND role <> ''),
    CONSTRAINT interview_participant_identity UNIQUE (id, interview_id),
    CONSTRAINT unique_interview_participant UNIQUE (interview_id, user_id)
);


-- ============================================================================
-- TABLE: interview_feedback
-- Purpose: Structured feedback from interviewers after the interview.
-- ============================================================================
CREATE TABLE interview_feedback (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id    UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
    participant_id  UUID NOT NULL,
    
    -- Decision
    decision        interview_decision,
    
    -- Structured ratings (1-5 scale)
    technical_skill     INTEGER CHECK (technical_skill BETWEEN 1 AND 5),
    communication       INTEGER CHECK (communication BETWEEN 1 AND 5),
    problem_solving     INTEGER CHECK (problem_solving BETWEEN 1 AND 5),
    cultural_fit        INTEGER CHECK (cultural_fit BETWEEN 1 AND 5),
    leadership          INTEGER CHECK (leadership BETWEEN 1 AND 5),
    overall_rating      INTEGER CHECK (overall_rating BETWEEN 1 AND 5),
    
    -- Comments
    strengths           TEXT,
    weaknesses          TEXT,
    notes               TEXT,
    
    -- AI-generated summary (optional)
    ai_summary          TEXT,
    
    -- Status
    is_confidential     BOOLEAN NOT NULL DEFAULT false, -- Hidden from candidate
    is_final            BOOLEAN NOT NULL DEFAULT false, -- Final/submitted feedback
    submitted_at        TIMESTAMPTZ,
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT interview_feedback_participant_fk
        FOREIGN KEY (participant_id, interview_id)
        REFERENCES interview_participants(id, interview_id) ON DELETE RESTRICT,
    CONSTRAINT interview_feedback_final_state CHECK (
        (is_final = FALSE AND submitted_at IS NULL)
        OR (is_final = TRUE AND submitted_at IS NOT NULL AND decision IS NOT NULL)
    ),
    -- One feedback per participant per interview
    CONSTRAINT unique_interview_feedback UNIQUE (interview_id, participant_id)
);

CREATE TRIGGER interview_feedback_updated_at
    BEFORE UPDATE ON interview_feedback
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- TABLE: interview_documents
-- Purpose: Domain-owned links to generic uploaded documents.
-- ============================================================================
CREATE TABLE interview_documents (
    interview_id    UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
    document_id     UUID NOT NULL REFERENCES uploaded_documents(id) ON DELETE RESTRICT,
    document_role   document_role NOT NULL,
    linked_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    description     TEXT,
    linked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (interview_id, document_id, document_role)
);

CREATE OR REPLACE FUNCTION protect_final_interview_feedback()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' AND OLD.is_final THEN
        RAISE EXCEPTION 'Submitted interview feedback is immutable';
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.is_final THEN
        RAISE EXCEPTION 'Submitted interview feedback is immutable';
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER interview_feedback_final_immutable
    BEFORE UPDATE OR DELETE ON interview_feedback
    FOR EACH ROW
    EXECUTE FUNCTION protect_final_interview_feedback();


-- ============================================================================
-- INDEXES
-- ============================================================================

-- Interviews: Candidate view
CREATE INDEX idx_interviews_candidate ON interviews(candidate_id, status);

-- Interviews: Job view
CREATE INDEX idx_interviews_job ON interviews(job_id, status);

-- Interviews: Application lookup
CREATE INDEX idx_interviews_application ON interviews(application_id);

-- Interviews: Interview pool (common dashboard query)
CREATE INDEX idx_interviews_pool ON interviews(interview_pool_id);

-- Interviews: Upcoming/scheduled interviews
CREATE INDEX idx_interviews_scheduled ON interviews(scheduled_at, status)
    WHERE status NOT IN ('cancelled', 'completed');

-- Interview participants
CREATE INDEX idx_interview_participants_interview ON interview_participants(interview_id);
CREATE INDEX idx_interview_participants_user ON interview_participants(user_id);

-- Ensure only one primary interviewer per interview
CREATE UNIQUE INDEX idx_interview_participants_primary
    ON interview_participants(interview_id)
    WHERE is_primary = true;

-- Interview feedback
CREATE INDEX idx_interview_feedback_interview ON interview_feedback(interview_id);
CREATE INDEX idx_interview_feedback_decision ON interview_feedback(decision);

-- Interviewer availability
CREATE INDEX idx_interviewer_availability_interviewer ON interviewer_availability(interviewer_id);
CREATE INDEX idx_availability_day ON interviewer_availability(day_of_week);

-- Schedule blocks: interviewer + time (composite index for faster queries)
CREATE INDEX idx_schedule_blocks_interviewer_time ON interview_schedule_blocks(interviewer_id, start_time)
    WHERE is_booked = false;

