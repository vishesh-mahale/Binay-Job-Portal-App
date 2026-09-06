-- ============================================================================
-- Jobs & Positions Schema
--
-- QUICK SUMMARY:
-- This file creates the core job posting, search, AI matching, and analytics
-- structures for the job portal.
--
-- TABLES CREATED HERE:
--   1. job_categories   -> hierarchical job classification categories
--   2. jobs             -> core job posting entity for companies
--   3. skills           -> master skill catalog with aliases and approval flow
--   4. job_skills       -> skills required by a job for matching/search
--   5. skill_requests   -> HR/admin requests for new skills
--   6. job_locations    -> job location records for hybrid/remote/offices
--   7. job_views        -> job impression tracking for analytics
--   8. job_view_aggregates_daily -> daily aggregated view counts for jobs
--
-- TRIGGERS CREATED HERE (8):
--   1. job_categories_updated_at          -> BEFORE UPDATE on job_categories
--   2. jobs_updated_at                    -> BEFORE UPDATE on jobs
--   3. skills_updated_at                  -> BEFORE UPDATE on skills
--   4. skill_requests_updated_at         -> BEFORE UPDATE on skill_requests
--   5. job_views_aggregate_daily_trigger  -> AFTER INSERT on job_views
--                                         updates daily view aggregates
--   6. jobs_search_vector_trigger         -> BEFORE INSERT/UPDATE on jobs
--                                         updates full-text search vector
--   7. job_skills_search_vector_trigger   -> refreshes FTS after job-skill changes
--   8. skills_search_vector_refresh_trigger -> refreshes affected jobs after skill rename
--   9. job_locations_search_vector_trigger   -> refreshes affected jobs after location changes
--
-- FUNCTIONS CREATED HERE (6):
--   1. job_views_aggregate_daily_count()  -> updates daily view aggregates for jobs
--   2. jobs_refresh_views_count_from_aggregates() -> refreshes jobs.views_count from daily aggregates
--   3. jobs_search_vector_update()        -> updates jobs.search_vector for
--                                         PostgreSQL Full-Text Search (FTS)
--   4. jobs_build_search_vector_for_job() -> builds weighted job FTS document
--   5. jobs_refresh_search_vector_from_skills() -> refreshes one changed job
--   6. jobs_refresh_search_vector_from_skill_name_change() -> refreshes affected jobs
--   7. jobs_refresh_search_vector_from_locations() -> refreshes affected jobs after location changes
--
-- NOTE:
--   update_updated_at_column() is referenced here but defined in
--   03_users_auth.sql.
--
--   This schema also removes redundant indexes, adds job-location completeness
--   validation, and keeps database JSON validation while leaving richer JSON
--   shape enforcement to the NestJS application layer.
--   NestJS should also:
--     * normalize slugs to lowercase before insert/update
--     * validate screening_questions objects at the application boundary
--     * optionally normalize category names if case-insensitive sibling uniqueness is required
--
-- ============================================================================

CREATE TYPE skill_request_status AS ENUM ('pending', 'approved', 'rejected');

-- ============================================================================
-- TABLE: job_categories
-- Purpose: Hierarchical job classification for broad functional areas.
-- Example: Engineering > Backend, Engineering > Frontend, Data, HR, Finance
-- Recommended approach:
--   - keep categories broad and reusable
--   - store specific technologies/skills in job_skills instead of creating
--     category nodes for Java, Python, React, AWS, etc.
-- ============================================================================
CREATE TABLE job_categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(255) NOT NULL UNIQUE,
    description     TEXT,
    parent_id       UUID REFERENCES job_categories(id) ON DELETE SET NULL,
    icon            VARCHAR(100), -- Icon identifier / URL
    sort_order      INTEGER DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT job_categories_slug_lowercase CHECK (slug = lower(slug)),
    -- Note: this unique constraint is case-sensitive. Normalize names in the
    -- NestJS layer if case-insensitive sibling uniqueness is required.
    CONSTRAINT job_categories_sibling_name_unique UNIQUE (parent_id, name),
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER job_categories_updated_at
    BEFORE UPDATE ON job_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- TABLE: jobs
-- Purpose: Core job posting entity. Each job belongs to a company
-- and optionally to a department/team.
-- ============================================================================
CREATE TABLE jobs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    branch_id           UUID,
    department_id       UUID,
    team_id             UUID,
    category_id         UUID REFERENCES job_categories(id) ON DELETE SET NULL,
    
    -- Who created/manages this job
    created_by          UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    published_by        UUID REFERENCES users(id) ON DELETE SET NULL, -- Who published the job (may differ from creator)
    approved_by         UUID REFERENCES users(id) ON DELETE SET NULL, -- Who approved the job
    approved_at         TIMESTAMPTZ, -- When the job was approved
    hiring_manager_id   UUID REFERENCES users(id) ON DELETE SET NULL, -- Person conducting interviews
    
    -- Core job details
    title               VARCHAR(255) NOT NULL,    -- Senior Java Developer
    slug                VARCHAR(255) NOT NULL,
    -- Application must normalize slugs to lowercase before insert/update.
    reference_code      VARCHAR(100), -- Internal reference (e.g., "JOB-2024-001")
    -- Generated by NestJS at job creation time.
    -- Example format: JOB-2026-000123
    
    -- Employment details
    employment_type     employment_type NOT NULL DEFAULT 'full_time',
    work_mode           work_mode NOT NULL DEFAULT 'onsite',
    work_shift          VARCHAR(50) DEFAULT 'day_shift',
    experience_level    experience_level,
    experience_min      INTEGER,
    experience_max      INTEGER,
    max_notice_period_days INTEGER,
    education_type      VARCHAR(50) DEFAULT 'any',
    min_education_level VARCHAR(100),
    -- Denormalized copy of category name for search performance.
    -- Populated by NestJS during publish; allows branch category changes without affecting historical jobs.
    category            VARCHAR(100),
    
    -- Location (denormalized snapshot from branch for search)
    -- These are copied from the branch at publish time so that future branch changes
    -- do not modify historical job listings.
    location_city       VARCHAR(100),
    location_state      VARCHAR(100),
    location_country    VARCHAR(100),
    location_remote     BOOLEAN NOT NULL DEFAULT false,
    
    -- Compensation
    salary_min          DECIMAL(12, 2),
    salary_max          DECIMAL(12, 2),
    salary_currency     salary_currency NOT NULL DEFAULT 'INR',
    salary_period       salary_period NOT NULL DEFAULT 'yearly',
    salary_visible      BOOLEAN NOT NULL DEFAULT true, -- Show salary in listing?
    
    -- Content
    description         TEXT NOT NULL,
    responsibilities    TEXT,
    requirements        TEXT,
    preferred_qualifications TEXT,
    benefits            TEXT,
    
    -- Application workflow
    application_form_url    TEXT, -- Custom application URL (optional)
    screening_questions_enabled BOOLEAN NOT NULL DEFAULT false,
    screening_questions     JSONB NOT NULL DEFAULT '[]'::JSONB,
    interview_rounds        JSONB NOT NULL DEFAULT '[]'::JSONB,
    custom_skills           JSONB NOT NULL DEFAULT '[]'::JSONB,
    -- Example: [{"question": "Do you have 5+ years of Node.js experience?", "required": true}, ...]
    
    -- AI settings
    ai_matching_enabled     BOOLEAN NOT NULL DEFAULT true,
    ai_ideal_candidate_profile JSONB, -- Contract: 05_jobs_AI_Job_Profile_JSONB_Contract_v1_step1.md
    ai_profile_model        VARCHAR(100),
    ai_profile_version      INTEGER,
    ai_generated_at         TIMESTAMPTZ,
    embedding_model         VARCHAR(100),
    embedding_version       INTEGER,
    embedding_generated_at  TIMESTAMPTZ,
    
    -- Status & workflow
    status              job_status NOT NULL DEFAULT 'draft',
    published_at        TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ, -- Auto-close after this date
    paused_at           TIMESTAMPTZ,
    closed_at           TIMESTAMPTZ,
    closed_reason       VARCHAR(500),
    
    -- Slots
    vacancies           INTEGER NOT NULL DEFAULT 1,
    applications_count  INTEGER NOT NULL DEFAULT 0, -- Denormalized counter: updated by application/service logic or background worker
    last_application_at TIMESTAMPTZ, -- Latest application time for dashboard/analytics
    views_count         INTEGER NOT NULL DEFAULT 0, -- Denormalized counter: updated periodically from job_view_aggregates_daily by a scheduled refresh job

    -- Metadata for search
    is_featured         BOOLEAN NOT NULL DEFAULT false,
    is_urgent           BOOLEAN NOT NULL DEFAULT false,
    is_confidential     BOOLEAN NOT NULL DEFAULT false, -- Hide company name?
    
    
    -- === SEMANTIC EMBEDDING (Layer 2 — pgvector) ===
    -- Generated on publish and regenerated after semantic job changes; never per search.
    -- Candidate/job/query vectors must use the same configured 768-dimensional model/version.
    embedding_status    embedding_status NOT NULL DEFAULT 'pending',
    embedding           vector(768), -- Architecture: 05_jobs_AI_Job_Embedding_Architecture_v1_step2.md


    -- Full-text search vector (populated by trigger)
    search_vector       TSVECTOR, -- FTS design: 05_jobs_AI_Make_Job_searchable_step3.md

    -- Soft delete
    deleted_at          TIMESTAMPTZ,
    
    -- Audit
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_job_slug_per_company UNIQUE (company_id, slug),
    CONSTRAINT unique_job_reference_per_company UNIQUE (company_id, reference_code),
    CONSTRAINT salary_range_check CHECK (salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max),
    CONSTRAINT valid_dates CHECK (expires_at IS NULL OR expires_at > created_at),
    CONSTRAINT vacancies_positive CHECK (vacancies > 0),
    CONSTRAINT applications_count_non_negative CHECK (applications_count >= 0),
    CONSTRAINT views_count_non_negative CHECK (views_count >= 0),
    CONSTRAINT ai_profile_version_positive CHECK (ai_profile_version IS NULL OR ai_profile_version > 0),
    CONSTRAINT embedding_version_positive CHECK (embedding_version IS NULL OR embedding_version > 0),
    CONSTRAINT jobs_slug_lowercase CHECK (slug = lower(slug)),
    CONSTRAINT screening_questions_array CHECK (jsonb_typeof(screening_questions) = 'array'),
    CONSTRAINT ai_ideal_candidate_profile_object CHECK (
        ai_ideal_candidate_profile IS NULL OR jsonb_typeof(ai_ideal_candidate_profile) = 'object'
    ),
    CONSTRAINT jobs_team_requires_department CHECK (
        team_id IS NULL OR department_id IS NOT NULL
    ),
    CONSTRAINT published_after_created CHECK (published_at IS NULL OR published_at >= created_at),
    CONSTRAINT approved_after_created CHECK (approved_at IS NULL OR approved_at >= created_at),
    CONSTRAINT paused_after_created CHECK (paused_at IS NULL OR paused_at >= created_at),
    CONSTRAINT closed_after_created CHECK (closed_at IS NULL OR closed_at >= created_at),
    CONSTRAINT salary_non_negative CHECK (
        (salary_min IS NULL OR salary_min >= 0)
        AND
        (salary_max IS NULL OR salary_max >= 0)
    ),
    CONSTRAINT jobs_application_form_url_check CHECK (
        application_form_url IS NULL OR application_form_url ~ '^https?://'
    ),
    CONSTRAINT approved_by_approved_at_consistency CHECK (
        (approved_by IS NULL AND approved_at IS NULL)
        OR
        (approved_by IS NOT NULL AND approved_at IS NOT NULL)
    ),
    CONSTRAINT published_by_published_at_consistency CHECK (
        (published_by IS NULL AND published_at IS NULL)
        OR
        (published_by IS NOT NULL AND published_at IS NOT NULL)
    ),
    CONSTRAINT embedding_consistency CHECK (
        (embedding IS NULL AND embedding_generated_at IS NULL AND embedding_model IS NULL AND embedding_version IS NULL)
        OR
        (embedding IS NOT NULL AND embedding_generated_at IS NOT NULL AND embedding_model IS NOT NULL AND embedding_version IS NOT NULL)
    ),
    CONSTRAINT embedding_completed_consistency CHECK (
        embedding_status <> 'completed' OR embedding IS NOT NULL
    ),
    CONSTRAINT ai_profile_metadata_consistency CHECK (
        (
            ai_ideal_candidate_profile IS NULL
            AND ai_profile_model IS NULL
            AND ai_profile_version IS NULL
            AND ai_generated_at IS NULL
        )
        OR
        (
            ai_ideal_candidate_profile IS NOT NULL
            AND ai_profile_model IS NOT NULL
            AND ai_profile_version IS NOT NULL
            AND ai_generated_at IS NOT NULL
        )
    ),
    CONSTRAINT jobs_branch_tenant_fk
        FOREIGN KEY (branch_id, company_id)
        REFERENCES company_branches(id, company_id) ON DELETE RESTRICT,
    CONSTRAINT jobs_department_tenant_fk
        FOREIGN KEY (department_id, company_id)
        REFERENCES departments(id, company_id) ON DELETE RESTRICT,
    CONSTRAINT jobs_team_department_fk
        FOREIGN KEY (team_id, department_id)
        REFERENCES teams(id, department_id) ON DELETE RESTRICT
    -- NOTE:
    -- Only verified companies can publish jobs.
    -- This rule is enforced by the NestJS business layer (not DB constraint).
    -- Reason: PostgreSQL CHECK constraints cannot contain subqueries.
);

CREATE TRIGGER jobs_updated_at
    BEFORE UPDATE ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- TABLE: skills
-- Purpose: Master catalog of skills used across jobs, resumes, and matching.
-- Keeps skills standardized and reusable while allowing alias-based search.
--
-- Production workflow:
--   1. HR/admin or parser identifies a skill while creating/updating content.
--   2. System checks whether that skill already exists in the master catalog.
--   3. If it exists, the job/resume is linked to that canonical skill.
--   4. If it does not exist, a skill_request is created for admin review.
--   5. After approval, the skill becomes available across jobs, resumes, and search.
-- ============================================================================
CREATE TABLE skills (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(255) NOT NULL UNIQUE,
    aliases         JSONB NOT NULL DEFAULT '[]'::JSONB,
    description     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_by      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at     TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT skills_slug_lowercase CHECK (slug = lower(slug)),
    CONSTRAINT skills_aliases_array CHECK (jsonb_typeof(aliases) = 'array')
);

CREATE UNIQUE INDEX idx_skills_name_ci ON skills (lower(name));

COMMENT ON COLUMN skills.name IS 'Canonical skill name';
COMMENT ON COLUMN skills.slug IS 'URL-friendly skill slug';
COMMENT ON COLUMN skills.aliases IS 'Alternative spellings or aliases used for search and autocomplete';
COMMENT ON COLUMN skills.description IS 'Optional description of the skill';
COMMENT ON COLUMN skills.is_active IS 'Whether the skill is available for use';
COMMENT ON COLUMN skills.created_by IS 'User who created or requested the skill';
COMMENT ON COLUMN skills.approved_by IS 'Admin user who approved the skill';
COMMENT ON COLUMN skills.approved_at IS 'Timestamp when the skill was approved';

CREATE TRIGGER skills_updated_at
    BEFORE UPDATE ON skills
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- TABLE: skill_requests
-- Purpose: Track new skill suggestions submitted by HR/admin users.
-- Production flow: pending -> approved/rejected by admin.
-- ============================================================================
CREATE TABLE skill_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requested_name  VARCHAR(255) NOT NULL,
    requested_by    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status          skill_request_status NOT NULL DEFAULT 'pending',
    approved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at     TIMESTAMPTZ,
    review_notes    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN skill_requests.requested_name IS 'Skill name requested by HR or admin';
COMMENT ON COLUMN skill_requests.requested_by IS 'User who submitted the request';
COMMENT ON COLUMN skill_requests.status IS 'Approval state of the skill request';
COMMENT ON COLUMN skill_requests.approved_by IS 'Admin who approved or rejected the request';
COMMENT ON COLUMN skill_requests.approved_at IS 'Timestamp when the request was reviewed';
COMMENT ON COLUMN skill_requests.review_notes IS 'Optional admin review notes';

CREATE TRIGGER skill_requests_updated_at
    BEFORE UPDATE ON skill_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- TABLE: job_skills
-- Purpose: Skills required for a job. Used for AI matching and search.
-- These are kept separate from categories to avoid duplication and to keep
-- categories broad and reusable.
-- ============================================================================
CREATE TABLE job_skills (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    skill_id        UUID NOT NULL REFERENCES skills(id) ON DELETE RESTRICT,

    -- Importance level
    is_required     BOOLEAN NOT NULL DEFAULT true,
    min_years       DECIMAL(3, 1), -- Minimum experience required
    importance_score INTEGER NOT NULL DEFAULT 5 CHECK (importance_score BETWEEN 1 AND 10),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT job_skills_min_years_non_negative CHECK (min_years IS NULL OR min_years >= 0),
    CONSTRAINT unique_job_skill UNIQUE (job_id, skill_id)
);

COMMENT ON COLUMN job_skills.job_id IS 'Job that this skill belongs to';
COMMENT ON COLUMN job_skills.skill_id IS 'Reference to the master skill catalog';
COMMENT ON COLUMN job_skills.is_required IS 'Whether the skill is required for the job';
COMMENT ON COLUMN job_skills.min_years IS 'Minimum years of experience required for this skill';
COMMENT ON COLUMN job_skills.importance_score IS 'Relative priority of the skill for matching';


-- ============================================================================
-- TABLE: job_locations
-- Purpose: Multiple locations for a single job (for hybrid/remote + offices)
-- ============================================================================
CREATE TABLE job_locations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    city            VARCHAR(100),
    state           VARCHAR(100),
    country         VARCHAR(100),
    postal_code     VARCHAR(20),
    latitude        DECIMAL(10, 7),
    longitude       DECIMAL(10, 7),
    is_primary      BOOLEAN NOT NULL DEFAULT false,
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT job_locations_latitude_range CHECK (
        latitude IS NULL OR latitude BETWEEN -90 AND 90
    ),
    CONSTRAINT job_locations_longitude_range CHECK (
        longitude IS NULL OR longitude BETWEEN -180 AND 180
    ),
    -- Business rule: physical location records must include both city and country,
    -- or be fully empty. This prevents half-populated address snapshots.
    CONSTRAINT job_locations_city_and_country_together CHECK (
        (
            city IS NOT NULL
            AND country IS NOT NULL
        )
        OR (
            city IS NULL
            AND country IS NULL
            AND state IS NULL
            AND postal_code IS NULL
            AND latitude IS NULL
            AND longitude IS NULL
        )
    )
);


-- ============================================================================
-- TABLE: job_views
-- Purpose: Track job impressions for analytics
--
-- NOTE: This is a high-volume table. For production, monthly partitioning by
-- viewed_at is recommended once job_views exceeds roughly 10 million rows.
-- Also consider TTL cleanup or periodic archiving to prevent unbounded growth.
-- ============================================================================
CREATE TABLE job_views (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL, -- NULL for anonymous
    ip_address      INET,
    user_agent      TEXT,
    session_id      VARCHAR(255),
    referrer_url    TEXT,
    
    viewed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- TABLE: job_view_aggregates_daily
-- Purpose: Store daily view counts for jobs so high-volume traffic can be
-- aggregated without hitting the jobs table on every view.
-- ============================================================================
CREATE TABLE job_view_aggregates_daily (
    job_id    UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    view_date DATE NOT NULL,
    views_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (job_id, view_date)
);

CREATE OR REPLACE FUNCTION job_views_aggregate_daily_count()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO job_view_aggregates_daily (job_id, view_date, views_count)
    VALUES (NEW.job_id, DATE_TRUNC('day', NEW.viewed_at)::date, 1)
    ON CONFLICT (job_id, view_date)
    DO UPDATE SET views_count = job_view_aggregates_daily.views_count + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER job_views_aggregate_daily_trigger
    AFTER INSERT ON job_views
    FOR EACH ROW
    EXECUTE FUNCTION job_views_aggregate_daily_count();

-- NOTE: job_view_aggregates_daily is intentionally append-oriented. Deleting raw
-- job_views rows does not decrement historical aggregates. Use periodic archive
-- or retention workflows instead of direct deletion when counts must remain stable.
--
-- Expected operational behavior: run jobs_refresh_views_count_from_aggregates()
-- every 5-15 minutes via pg_cron or an external scheduler to keep jobs.views_count
-- fresh for dashboards and listings.

CREATE OR REPLACE FUNCTION jobs_refresh_views_count_from_aggregates()
RETURNS VOID AS $$
BEGIN
    UPDATE jobs j
    SET views_count = v.total_views
    FROM (
        SELECT j2.id AS job_id,
               COALESCE(SUM(a.views_count), 0) AS total_views
        FROM jobs j2
        LEFT JOIN job_view_aggregates_daily a
            ON a.job_id = j2.id
        GROUP BY j2.id
    ) AS v
    WHERE j.id = v.job_id
      AND j.views_count IS DISTINCT FROM v.total_views;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- TABLE COMMENTS
-- ============================================================================
COMMENT ON COLUMN jobs.embedding IS '768-dimensional vector; job/candidate/query embeddings must use a compatible model and version';
COMMENT ON COLUMN jobs.ai_ideal_candidate_profile IS 'AI-generated candidate persona used for job matching';
COMMENT ON COLUMN jobs.embedding_model IS 'Embedding generation model name used for this job';
COMMENT ON COLUMN jobs.embedding_version IS 'Embedding model version number for this job''s vector';
COMMENT ON COLUMN jobs.embedding_generated_at IS 'Timestamp when the embedding was generated';
COMMENT ON COLUMN jobs.last_application_at IS 'Last application timestamp used for job recency and dashboard sorting';
COMMENT ON COLUMN job_view_aggregates_daily.created_at IS 'Timestamp when the daily aggregate row was first created';

-- ============================================================================
-- FUNCTION & TRIGGER: Auto-update search_vector for full-text search
-- ============================================================================
CREATE OR REPLACE FUNCTION jobs_build_search_vector_for_job(
    p_job jobs,
    p_skill_names TEXT DEFAULT NULL
)
RETURNS TSVECTOR AS $$
DECLARE
    v_custom_skills TEXT := '';
    v_location_names TEXT := '';
BEGIN
    -- custom_skills is application-validated, but keep the FTS function
    -- fail-safe if a legacy/direct writer has stored a non-array JSON value.
    IF jsonb_typeof(p_job.custom_skills) = 'array' THEN
        SELECT COALESCE(string_agg(value, ' '), '') INTO v_custom_skills
        FROM jsonb_array_elements_text(p_job.custom_skills);
    END IF;

    -- Resolve all normalized job locations centrally so direct function calls
    -- and every refresh path include secondary-location terms consistently.
    SELECT COALESCE(string_agg(
        concat_ws(' ', jl.city, jl.state, jl.country), ' '
    ), '') INTO v_location_names
    FROM job_locations jl
    WHERE jl.job_id = p_job.id;

    RETURN
        setweight(to_tsvector('english', COALESCE(p_job.title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(p_job.description, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(p_job.requirements, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(p_job.preferred_qualifications, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(p_job.responsibilities, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(p_job.category, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(p_job.employment_type::text, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(p_job.work_mode::text, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(p_job.work_shift, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(p_job.education_type, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(p_job.min_education_level, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(p_job.experience_level::text, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(p_job.location_city, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(p_job.location_state, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(v_location_names, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(p_job.location_country, '')), 'D') ||
        setweight(to_tsvector('english', COALESCE(p_job.benefits, '')), 'D') ||
        setweight(to_tsvector('english', COALESCE(p_skill_names, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(v_custom_skills, '')), 'B');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION jobs_search_vector_update()
RETURNS TRIGGER AS $$
DECLARE
    v_skill_names TEXT;
BEGIN
-- NOTE:
-- Currently using 'english' dictionary for full-text search.
-- Can be changed per-language in future (Hindi, Marathi, Tamil, etc.).
    SELECT COALESCE(string_agg(s.name, ' '), '') INTO v_skill_names
    FROM job_skills js
    JOIN skills s ON s.id = js.skill_id
    WHERE js.job_id = NEW.id;

    NEW.search_vector := jobs_build_search_vector_for_job(NEW, v_skill_names);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER jobs_search_vector_trigger
    BEFORE INSERT OR UPDATE OF title, description, requirements, responsibilities,
                              preferred_qualifications, category, benefits,
                              location_city, location_state, location_country,
                              employment_type, work_mode, work_shift,
                              education_type, min_education_level, experience_level,
                              custom_skills
    ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION jobs_search_vector_update();

CREATE OR REPLACE FUNCTION jobs_refresh_search_vector_from_skills()
RETURNS TRIGGER AS $$
DECLARE
    v_job jobs%ROWTYPE;
    v_skill_names TEXT;
BEGIN
    SELECT * INTO v_job
    FROM jobs
    WHERE id = COALESCE(NEW.job_id, OLD.job_id);

    SELECT COALESCE(string_agg(s.name, ' '), '') INTO v_skill_names
    FROM job_skills js
    JOIN skills s ON s.id = js.skill_id
    WHERE js.job_id = v_job.id;

    UPDATE jobs
    SET search_vector = jobs_build_search_vector_for_job(v_job, v_skill_names)
    WHERE id = v_job.id;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER job_skills_search_vector_trigger
    AFTER INSERT OR UPDATE OR DELETE ON job_skills
    FOR EACH ROW
    EXECUTE FUNCTION jobs_refresh_search_vector_from_skills();

CREATE OR REPLACE FUNCTION jobs_refresh_search_vector_from_skill_name_change()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.name IS DISTINCT FROM OLD.name THEN
        UPDATE jobs AS j
        SET search_vector = jobs_build_search_vector_for_job(
            j,
            (
                SELECT COALESCE(string_agg(s.name, ' '), '')
                FROM job_skills js
                JOIN skills s ON s.id = js.skill_id
                WHERE js.job_id = j.id
            )
        )
        WHERE id IN (
            SELECT js.job_id
            FROM job_skills js
            WHERE js.skill_id = NEW.id
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER skills_search_vector_refresh_trigger
    AFTER UPDATE OF name ON skills
    FOR EACH ROW
    EXECUTE FUNCTION jobs_refresh_search_vector_from_skill_name_change();

CREATE OR REPLACE FUNCTION jobs_refresh_search_vector_from_locations()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE' AND OLD.job_id IS NOT NULL AND NEW.job_id IS DISTINCT FROM OLD.job_id) THEN
        UPDATE jobs AS j
            SET search_vector = jobs_build_search_vector_for_job(
                j,
                (
                    SELECT COALESCE(string_agg(s.name, ' '), '')
                    FROM job_skills js
                    JOIN skills s ON s.id = js.skill_id
                    WHERE js.job_id = j.id
                )
            )
        WHERE j.id = OLD.job_id;
    END IF;

    UPDATE jobs AS j
        SET search_vector = jobs_build_search_vector_for_job(
            j,
            (
                SELECT COALESCE(string_agg(s.name, ' '), '')
                FROM job_skills js
                JOIN skills s ON s.id = js.skill_id
                WHERE js.job_id = j.id
            )
        )
    WHERE j.id = COALESCE(NEW.job_id, OLD.job_id);

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER job_locations_search_vector_trigger
    AFTER INSERT OR UPDATE OR DELETE ON job_locations
    FOR EACH ROW
    EXECUTE FUNCTION jobs_refresh_search_vector_from_locations();


-- ============================================================================
-- INDEXES
-- ============================================================================

-- Jobs: Full-text search index
CREATE INDEX idx_jobs_search ON jobs USING GIN(search_vector);

-- Jobs: Company jobs listing
CREATE INDEX idx_jobs_company_status ON jobs(company_id, status, created_at DESC) WHERE deleted_at IS NULL;

-- Jobs: Active job listings sorted by created date (newest created jobs)
CREATE INDEX idx_jobs_active_listings ON jobs(status, created_at DESC)
    WHERE status = 'published' AND deleted_at IS NULL;

-- Jobs: Published jobs sorted by published_at DESC (job portal listing)
CREATE INDEX idx_jobs_published_date ON jobs(status, published_at DESC)
    WHERE status = 'published' AND deleted_at IS NULL;

-- Jobs: Category filtering
CREATE INDEX idx_jobs_category ON jobs(category_id)
    WHERE status = 'published' AND deleted_at IS NULL;

-- Jobs: Upcoming expiry for notifications
CREATE INDEX idx_jobs_expiring ON jobs(expires_at) 
    WHERE status IN ('published', 'paused') AND expires_at IS NOT NULL AND deleted_at IS NULL;

-- Jobs: Featured jobs
CREATE INDEX idx_jobs_featured ON jobs(is_featured, created_at DESC) 
    WHERE status = 'published' AND is_featured = true AND deleted_at IS NULL;

-- Jobs: Filter queries (common combinations)
CREATE INDEX idx_jobs_filters ON jobs(employment_type, work_mode, experience_level, location_country)
    WHERE status = 'published' AND deleted_at IS NULL;

-- Jobs: Urgent jobs
CREATE INDEX idx_jobs_urgent ON jobs(is_urgent, created_at DESC)
    WHERE status = 'published' AND is_urgent = true AND deleted_at IS NULL;

-- Jobs: Location-based queries
CREATE INDEX idx_jobs_location ON jobs(location_country, location_city)
    WHERE status = 'published' AND deleted_at IS NULL;

-- Jobs: HR dashboard (company owner/HR viewing their jobs)
CREATE INDEX idx_jobs_company_creator ON jobs(company_id, created_by) WHERE deleted_at IS NULL;

-- Job locations: Ensure only one primary location per job
CREATE UNIQUE INDEX idx_job_locations_unique_primary ON job_locations(job_id) WHERE is_primary = true;

-- Skills: master catalog and search
CREATE INDEX idx_skills_name ON skills(name);
CREATE INDEX idx_skills_active ON skills(is_active);
CREATE INDEX idx_skills_name_trgm ON skills USING gin (name gin_trgm_ops);

-- Skill requests: admin review workflow
CREATE INDEX idx_skill_requests_status ON skill_requests(status);
CREATE INDEX idx_skill_requests_requested_by ON skill_requests(requested_by);

-- Job skills: Matching
CREATE INDEX idx_job_skills_skill ON job_skills(skill_id);

-- Job views: Analytics
CREATE INDEX idx_job_views_job_date ON job_views(job_id, viewed_at DESC);
CREATE INDEX idx_job_views_date ON job_views(viewed_at DESC);

-- Job view aggregates: Date-based reporting
CREATE INDEX IF NOT EXISTS idx_job_view_aggregates_date
    ON job_view_aggregates_daily(view_date);

-- Job categories: Hierarchy
CREATE INDEX idx_job_categories_parent ON job_categories(parent_id);

-- Salary range searches for published, visible-salary jobs
CREATE INDEX IF NOT EXISTS idx_jobs_salary
    ON jobs(salary_min, salary_max)
    WHERE status = 'published' AND salary_visible = true AND deleted_at IS NULL;

-- Semantic search: HNSW index for pgvector cosine similarity
-- Used for Layer 2 AI candidate matching — find jobs similar to a candidate's resume
-- HNSW is preferred over IVFFLAT for low-latency production search
CREATE INDEX IF NOT EXISTS idx_jobs_embedding
    ON jobs
    USING hnsw (embedding vector_cosine_ops)
    WHERE embedding_status = 'completed' AND status = 'published' AND deleted_at IS NULL;

