-- ============================================================================
-- Candidate Canonical Profile, Evidence & Search Projection
--
-- QUICK SUMMARY:
-- This file stores the candidate's current editable profile separately from
-- immutable resume AI evidence. Search fields and embeddings are derived from
-- confirmed canonical facts and are never the source of truth.
--
-- TABLE GROUPS CREATED HERE:
--   Identity/Documents: candidate_profiles
--                       candidate_profile_documents                   -- resume versioning v1,2,3,4,5, cover letters, certificates, portfolios

--   Canonical facts:    candidate_links
--                       candidate_skills
--                       candidate_experiences
--                       candidate_educations
--                       candidate_certifications
--                       candidate_projects
--                       candidate_languages
--                       candidate_awards

--   Evidence:           candidate_skill_evidence
--                       candidate_experience_evidence
--                       candidate_education_evidence
--                       candidate_certification_evidence

--   Derived/Audit:       candidate_search_profiles
--                        profile_change_history
--
-- FUNCTIONS CREATED HERE:
--   1. bump_candidate_profile_revision()   -> called exactly once per logical
--                                             profile-save transaction
--   2. enforce_evidence_status_transition()-> keeps payload immutable and allows
--                                             active -> terminal status only
--   3. create_empty_candidate_profile()    -> creates one empty profile when a
--                                             candidate user row is inserted
--
-- WHEN DATA IS WRITTEN:
--   * Signup/onboarding creates candidate_profiles.
--   * Candidate/API writes canonical facts after manual input or confirmation.
--   * Trusted AI/service flows append evidence; candidates cannot rewrite it.
--   * One logical save writes history, bumps revision once and emits outbox event.
--   * Projection worker combines confirmed canonical facts with the latest active
--     profile-resume parse and rebuilds candidate_search_profiles.
--
-- DELETE/IMMUTABILITY RULES:
-- Canonical facts are editable but use deleted_at instead of hard delete.
-- Evidence payload and profile history are append-only/audited.
--
-- NEXT FILE:
-- 09_applications.sql freezes submission-time state in immutable snapshots.
-- Detailed guide: 08_candidates_Explanation.md
-- ============================================================================

CREATE TABLE candidate_profiles (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    professional_title      VARCHAR(255),
    summary                 TEXT,
    date_of_birth           DATE,
    gender                  VARCHAR(50),
    nationality             VARCHAR(100),
    current_location        VARCHAR(255),
    city                    VARCHAR(100),
    state                   VARCHAR(100),
    country                 VARCHAR(100),
    postal_code             VARCHAR(20),
    latitude                DECIMAL(10,7),
    longitude               DECIMAL(10,7),
    preferred_work_mode     work_mode,
    willing_to_relocate     BOOLEAN NOT NULL DEFAULT FALSE,
    willing_to_travel       BOOLEAN NOT NULL DEFAULT FALSE,
    remote_experience       BOOLEAN NOT NULL DEFAULT FALSE,
    notice_period_days      INTEGER CHECK (notice_period_days IS NULL OR notice_period_days >= 0),
    expected_salary_min     DECIMAL(12,2),
    expected_salary_max     DECIMAL(12,2),
    salary_currency         salary_currency NOT NULL DEFAULT 'INR',
    work_authorization      VARCHAR(100),
    visa_sponsorship_needed BOOLEAN NOT NULL DEFAULT FALSE,
    is_open_to_work         BOOLEAN NOT NULL DEFAULT TRUE,
    available_from          DATE,
    profile_revision        BIGINT NOT NULL DEFAULT 1 CHECK (profile_revision > 0),
    profile_completed_at    TIMESTAMPTZ,
    last_profile_change_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resume_phone            VARCHAR(50),
    years_of_experience     DECIMAL(4,1),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    CONSTRAINT candidate_profile_id_user_identity UNIQUE (id, user_id),
    CONSTRAINT candidate_salary_range CHECK (
        (expected_salary_min IS NULL OR expected_salary_min >= 0) AND
        (expected_salary_max IS NULL OR expected_salary_max >= 0) AND
        (expected_salary_min IS NULL OR expected_salary_max IS NULL OR expected_salary_min <= expected_salary_max)
    )
);

-- Called once by the application transaction for one logical profile save,
-- regardless of how many canonical child rows that save changes.
CREATE OR REPLACE FUNCTION bump_candidate_profile_revision(p_candidate_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    v_revision BIGINT;
BEGIN
    UPDATE candidate_profiles
       SET profile_revision = profile_revision + 1,
           last_profile_change_at = NOW()
     WHERE id = p_candidate_id
       AND deleted_at IS NULL
    RETURNING profile_revision INTO v_revision;

    IF v_revision IS NULL THEN
        RAISE EXCEPTION 'Active candidate profile % not found', p_candidate_id;
    END IF;

    RETURN v_revision;
END;
$$;

CREATE TABLE candidate_profile_documents (
    candidate_id        UUID NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    document_id         UUID NOT NULL REFERENCES uploaded_documents(id) ON DELETE RESTRICT,
    document_role       document_role NOT NULL,   -- e.g., 'resume', 'cover_letter', 'certificate', 'portfolio' , 'other'
    version_number      INTEGER NOT NULL CHECK (version_number > 0),     1,2,3,4,5,6
    is_current          BOOLEAN NOT NULL DEFAULT FALSE,               --  only one can be true based on the active checkbox status while uploading the document.
    linked_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unlinked_at         TIMESTAMPTZ,                                  --  this will get initialized when resume gets deleted.
    PRIMARY KEY (candidate_id, document_id, document_role),
    CONSTRAINT candidate_profile_document_active_check CHECK (
        unlinked_at IS NULL OR is_current = FALSE
    ),
    CONSTRAINT candidate_profile_document_role_version_unique
        UNIQUE (candidate_id, document_role, version_number)
);

CREATE UNIQUE INDEX uq_candidate_current_document_role
    ON candidate_profile_documents(candidate_id, document_role)
    WHERE is_current = TRUE AND unlinked_at IS NULL;

CREATE TABLE candidate_links (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id    UUID NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    link_type       VARCHAR(50) NOT NULL,
    label           VARCHAR(100),
    url             TEXT NOT NULL,
    primary_source_type profile_fact_source NOT NULL,
    verification_status profile_fact_verification_status NOT NULL DEFAULT 'self_declared',
    candidate_confirmed_at TIMESTAMPTZ,
    display_order   INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    CONSTRAINT candidate_link_type_nonblank CHECK (NULLIF(BTRIM(link_type), '') IS NOT NULL),
    CONSTRAINT candidate_link_url_check CHECK (url ~* '^https?://')
);

CREATE TABLE candidate_skills (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id            UUID NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    skill_id                UUID REFERENCES skills(id) ON DELETE RESTRICT,
    custom_skill_name       VARCHAR(150),
    proficiency_level       SMALLINT CHECK (proficiency_level IS NULL OR proficiency_level BETWEEN 1 AND 10),
    years_of_experience     DECIMAL(4,1) CHECK (years_of_experience IS NULL OR years_of_experience >= 0),
    last_used_at            DATE,
    primary_source_type     profile_fact_source NOT NULL,
    verification_status     profile_fact_verification_status NOT NULL DEFAULT 'suggested',
    verification_level      SMALLINT NOT NULL DEFAULT 0 CHECK (verification_level BETWEEN 0 AND 100),
    candidate_confirmed_at  TIMESTAMPTZ,
    last_verified_at        TIMESTAMPTZ,
    row_version             BIGINT NOT NULL DEFAULT 1 CHECK (row_version > 0),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    CONSTRAINT candidate_skill_identity CHECK (
        (skill_id IS NOT NULL AND custom_skill_name IS NULL) OR
        (skill_id IS NULL AND NULLIF(BTRIM(custom_skill_name), '') IS NOT NULL)
    )
);

CREATE TABLE candidate_experiences (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id            UUID NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    company_name            VARCHAR(255) NOT NULL,
    normalized_company_id   UUID REFERENCES companies(id) ON DELETE SET NULL,
    job_title               VARCHAR(255) NOT NULL,
    employment_type         employment_type,
    location                VARCHAR(255),
    start_date              DATE NOT NULL,
    end_date                DATE,
    is_current              BOOLEAN NOT NULL DEFAULT FALSE,
    description             TEXT,
    responsibilities        JSONB NOT NULL DEFAULT '[]'::JSONB,
    achievements            JSONB NOT NULL DEFAULT '[]'::JSONB,
    primary_source_type     profile_fact_source NOT NULL,
    verification_status     profile_fact_verification_status NOT NULL DEFAULT 'suggested',
    candidate_confirmed_at  TIMESTAMPTZ,
    row_version             BIGINT NOT NULL DEFAULT 1,
    display_order           INTEGER NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    CONSTRAINT candidate_experience_dates CHECK (
        (is_current = TRUE AND end_date IS NULL) OR
        (is_current = FALSE AND (end_date IS NULL OR end_date >= start_date))
    ),
    CONSTRAINT candidate_experience_responsibilities_array CHECK (
        jsonb_typeof(responsibilities) = 'array'
    ),
    CONSTRAINT candidate_experience_achievements_array CHECK (
        jsonb_typeof(achievements) = 'array'
    )
);

CREATE TABLE candidate_educations (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id            UUID NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    institution_name        VARCHAR(255) NOT NULL,
    degree                  VARCHAR(255) NOT NULL,
    field_of_study          VARCHAR(255),
    start_date              DATE,
    end_date                DATE,
    is_current              BOOLEAN NOT NULL DEFAULT FALSE,
    grade                   VARCHAR(100),
    description             TEXT,
    primary_source_type     profile_fact_source NOT NULL,
    verification_status     profile_fact_verification_status NOT NULL DEFAULT 'suggested',
    candidate_confirmed_at  TIMESTAMPTZ,
    row_version             BIGINT NOT NULL DEFAULT 1,
    display_order           INTEGER NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    CONSTRAINT candidate_education_dates CHECK (
        start_date IS NULL OR end_date IS NULL OR end_date >= start_date
    )
);

CREATE TABLE candidate_certifications (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id            UUID NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    name                    VARCHAR(255) NOT NULL,
    issuer                  VARCHAR(255),
    credential_id           VARCHAR(255),
    credential_url          TEXT,
    issued_at               DATE,
    expires_at              DATE,
    does_not_expire         BOOLEAN NOT NULL DEFAULT FALSE,
    primary_source_type     profile_fact_source NOT NULL,
    verification_status     profile_fact_verification_status NOT NULL DEFAULT 'suggested',
    candidate_confirmed_at  TIMESTAMPTZ,
    row_version             BIGINT NOT NULL DEFAULT 1,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    CONSTRAINT candidate_certification_dates CHECK (
        (does_not_expire = TRUE AND expires_at IS NULL)
        OR
        (does_not_expire = FALSE AND (
            expires_at IS NULL OR issued_at IS NULL OR expires_at >= issued_at
        ))
    )
);

CREATE TABLE candidate_projects (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id                UUID NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    title                       VARCHAR(255) NOT NULL,
    description                 TEXT,
    project_url                 TEXT,
    repository_url              TEXT,
    started_at                  DATE,
    completed_at                DATE,
    technologies                JSONB NOT NULL DEFAULT '[]'::JSONB,
    primary_source_type         profile_fact_source NOT NULL,
    source_document_id          UUID REFERENCES uploaded_documents(id) ON DELETE SET NULL,
    source_parsing_result_id    UUID REFERENCES resume_parsed_data(id) ON DELETE SET NULL,
    verification_status         profile_fact_verification_status NOT NULL DEFAULT 'suggested',
    candidate_confirmed_at      TIMESTAMPTZ,
    display_order               INTEGER NOT NULL DEFAULT 0,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at                  TIMESTAMPTZ,
    CONSTRAINT candidate_project_dates CHECK (
        started_at IS NULL OR completed_at IS NULL OR completed_at >= started_at
    ),
    CONSTRAINT candidate_project_technologies_array CHECK (
        jsonb_typeof(technologies) = 'array'
    ),
    CONSTRAINT candidate_project_parse_requires_document CHECK (
        source_parsing_result_id IS NULL OR source_document_id IS NOT NULL
    ),
    CONSTRAINT candidate_project_parse_document_fk
        FOREIGN KEY (source_parsing_result_id, source_document_id)
        REFERENCES resume_parsed_data(id, document_id) ON DELETE RESTRICT
);

CREATE TABLE candidate_languages (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id                UUID NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    language_name               VARCHAR(100) NOT NULL,
    proficiency                 VARCHAR(50),
    primary_source_type         profile_fact_source NOT NULL,
    source_document_id          UUID REFERENCES uploaded_documents(id) ON DELETE SET NULL,
    source_parsing_result_id    UUID REFERENCES resume_parsed_data(id) ON DELETE SET NULL,
    verification_status         profile_fact_verification_status NOT NULL DEFAULT 'suggested',
    candidate_confirmed_at      TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at                  TIMESTAMPTZ,
    CONSTRAINT candidate_language_parse_requires_document CHECK (
        source_parsing_result_id IS NULL OR source_document_id IS NOT NULL
    ),
    CONSTRAINT candidate_language_parse_document_fk
        FOREIGN KEY (source_parsing_result_id, source_document_id)
        REFERENCES resume_parsed_data(id, document_id) ON DELETE RESTRICT
);

CREATE TABLE candidate_awards (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id                UUID NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    title                       VARCHAR(255) NOT NULL,
    issuer                      VARCHAR(255),
    awarded_at                  DATE,
    description                 TEXT,
    primary_source_type         profile_fact_source NOT NULL,
    source_document_id          UUID REFERENCES uploaded_documents(id) ON DELETE SET NULL,
    source_parsing_result_id    UUID REFERENCES resume_parsed_data(id) ON DELETE SET NULL,
    verification_status         profile_fact_verification_status NOT NULL DEFAULT 'suggested',
    candidate_confirmed_at      TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at                  TIMESTAMPTZ,
    CONSTRAINT candidate_award_parse_requires_document CHECK (
        source_parsing_result_id IS NULL OR source_document_id IS NOT NULL
    ),
    CONSTRAINT candidate_award_parse_document_fk
        FOREIGN KEY (source_parsing_result_id, source_document_id)
        REFERENCES resume_parsed_data(id, document_id) ON DELETE RESTRICT
);

-- High-value evidence tables are append-only; status changes invalidate rather
-- than delete evidence. extracted_value preserves exactly what was observed.
CREATE TABLE candidate_skill_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_skill_id UUID NOT NULL REFERENCES candidate_skills(id) ON DELETE CASCADE,
    evidence_type profile_fact_source NOT NULL,
    document_id UUID REFERENCES uploaded_documents(id) ON DELETE SET NULL,
    parsing_result_id UUID REFERENCES resume_parsed_data(id) ON DELETE SET NULL,
    asserted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    extracted_value JSONB,
    confidence_score DECIMAL(5,2) CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0 AND 100),
    status evidence_status NOT NULL DEFAULT 'active',
    status_changed_at TIMESTAMPTZ,
    observed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT candidate_skill_evidence_parse_requires_document CHECK (
        parsing_result_id IS NULL OR document_id IS NOT NULL
    ),
    CONSTRAINT candidate_skill_evidence_parse_document_fk
        FOREIGN KEY (parsing_result_id, document_id)
        REFERENCES resume_parsed_data(id, document_id) ON DELETE RESTRICT
);

CREATE TABLE candidate_experience_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_experience_id UUID NOT NULL REFERENCES candidate_experiences(id) ON DELETE CASCADE,
    evidence_type profile_fact_source NOT NULL,
    document_id UUID REFERENCES uploaded_documents(id) ON DELETE SET NULL,
    parsing_result_id UUID REFERENCES resume_parsed_data(id) ON DELETE SET NULL,
    asserted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    extracted_value JSONB,
    confidence_score DECIMAL(5,2) CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0 AND 100),
    status evidence_status NOT NULL DEFAULT 'active',
    status_changed_at TIMESTAMPTZ,
    observed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT candidate_experience_evidence_parse_requires_document CHECK (
        parsing_result_id IS NULL OR document_id IS NOT NULL
    ),
    CONSTRAINT candidate_experience_evidence_parse_document_fk
        FOREIGN KEY (parsing_result_id, document_id)
        REFERENCES resume_parsed_data(id, document_id) ON DELETE RESTRICT
);

CREATE TABLE candidate_education_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_education_id UUID NOT NULL REFERENCES candidate_educations(id) ON DELETE CASCADE,
    evidence_type profile_fact_source NOT NULL,
    document_id UUID REFERENCES uploaded_documents(id) ON DELETE SET NULL,
    parsing_result_id UUID REFERENCES resume_parsed_data(id) ON DELETE SET NULL,
    asserted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    extracted_value JSONB,
    confidence_score DECIMAL(5,2) CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0 AND 100),
    status evidence_status NOT NULL DEFAULT 'active',
    status_changed_at TIMESTAMPTZ,
    observed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT candidate_education_evidence_parse_requires_document CHECK (
        parsing_result_id IS NULL OR document_id IS NOT NULL
    ),
    CONSTRAINT candidate_education_evidence_parse_document_fk
        FOREIGN KEY (parsing_result_id, document_id)
        REFERENCES resume_parsed_data(id, document_id) ON DELETE RESTRICT
);

CREATE TABLE candidate_certification_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_certification_id UUID NOT NULL REFERENCES candidate_certifications(id) ON DELETE CASCADE,
    evidence_type profile_fact_source NOT NULL,
    document_id UUID REFERENCES uploaded_documents(id) ON DELETE SET NULL,
    parsing_result_id UUID REFERENCES resume_parsed_data(id) ON DELETE SET NULL,
    asserted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    extracted_value JSONB,
    confidence_score DECIMAL(5,2) CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0 AND 100),
    status evidence_status NOT NULL DEFAULT 'active',
    status_changed_at TIMESTAMPTZ,
    observed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT candidate_certification_evidence_parse_requires_document CHECK (
        parsing_result_id IS NULL OR document_id IS NOT NULL
    ),
    CONSTRAINT candidate_certification_evidence_parse_document_fk
        FOREIGN KEY (parsing_result_id, document_id)
        REFERENCES resume_parsed_data(id, document_id) ON DELETE RESTRICT
);

CREATE TABLE candidate_search_profiles (
    candidate_id                UUID PRIMARY KEY REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    source_profile_revision     BIGINT NOT NULL,
    projection_revision         BIGINT NOT NULL,
    active_resume_document_id   UUID REFERENCES uploaded_documents(id) ON DELETE RESTRICT,
    active_resume_parsing_result_id UUID,
    professional_title          VARCHAR(255),
    normalized_titles           JSONB NOT NULL DEFAULT '[]'::JSONB,
    skill_ids                   UUID[] NOT NULL DEFAULT '{}',
    skill_names                 JSONB NOT NULL DEFAULT '[]'::JSONB,
    locations                   JSONB NOT NULL DEFAULT '[]'::JSONB,
    fact_sources                JSONB NOT NULL DEFAULT '{}'::JSONB,
    total_experience_years      DECIMAL(5,1),
    highest_education_level     VARCHAR(100),
    searchable_text             TEXT,
    search_vector               TSVECTOR,
    embedding                   vector(768),
    embedding_model             VARCHAR(150),
    embedding_version           INTEGER,
    generated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT candidate_projection_revision_check CHECK (
        projection_revision <= source_profile_revision
    ),
    CONSTRAINT candidate_projection_active_resume_check CHECK (
        active_resume_parsing_result_id IS NULL OR active_resume_document_id IS NOT NULL
    ),
    CONSTRAINT candidate_projection_active_resume_fk
        FOREIGN KEY (active_resume_parsing_result_id, active_resume_document_id)
        REFERENCES resume_parsed_data(id, document_id) ON DELETE RESTRICT,
    CONSTRAINT candidate_projection_normalized_titles_array CHECK (
        jsonb_typeof(normalized_titles) = 'array'
    ),
    CONSTRAINT candidate_projection_skill_names_array CHECK (
        jsonb_typeof(skill_names) = 'array'
    ),
    CONSTRAINT candidate_projection_locations_array CHECK (
        jsonb_typeof(locations) = 'array'
    ),
    CONSTRAINT candidate_projection_fact_sources_object CHECK (
        jsonb_typeof(fact_sources) = 'object'
    ),
    CONSTRAINT candidate_projection_experience_nonnegative CHECK (
        total_experience_years IS NULL OR total_experience_years >= 0
    ),
    CONSTRAINT candidate_projection_embedding_version_positive CHECK (
        embedding_version IS NULL OR embedding_version > 0
    ),
    CONSTRAINT candidate_projection_embedding_consistency CHECK (
        (embedding IS NULL AND embedding_model IS NULL AND embedding_version IS NULL)
        OR
        (embedding IS NOT NULL AND embedding_model IS NOT NULL AND embedding_version IS NOT NULL)
    )
);

CREATE TABLE profile_change_history (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id        UUID NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    profile_revision    BIGINT NOT NULL,
    entity_type         VARCHAR(100) NOT NULL,
    entity_id           UUID,
    operation           VARCHAR(30) NOT NULL CHECK (operation IN ('insert','update','soft_delete','restore','confirm','reject')),
    changed_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    change_source       profile_fact_source NOT NULL,
    before_data         JSONB,
    after_data          JSONB,
    request_id          UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT profile_change_before_data_object CHECK (
        before_data IS NULL OR jsonb_typeof(before_data) = 'object'
    ),
    CONSTRAINT profile_change_after_data_object CHECK (
        after_data IS NULL OR jsonb_typeof(after_data) = 'object'
    )
);

-- Evidence payload/source is immutable. Only a one-way transition from active
-- to a terminal status is permitted; reactivation requires a new evidence row.
CREATE OR REPLACE FUNCTION enforce_evidence_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
    END IF;

    IF (to_jsonb(NEW) - ARRAY['status', 'status_changed_at'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status', 'status_changed_at']) THEN
        RAISE EXCEPTION '% evidence payload is immutable', TG_TABLE_NAME;
    END IF;

    IF NEW.status = OLD.status THEN
        IF NEW.status_changed_at IS DISTINCT FROM OLD.status_changed_at THEN
            RAISE EXCEPTION '% evidence status timestamp is system-managed', TG_TABLE_NAME;
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.status <> 'active'
       OR NEW.status NOT IN ('superseded', 'rejected', 'invalidated') THEN
        RAISE EXCEPTION 'Invalid evidence status transition: % -> %', OLD.status, NEW.status;
    END IF;

    NEW.status_changed_at := NOW();

    RETURN NEW;
END;
$$;

CREATE TRIGGER candidate_profiles_updated_at BEFORE UPDATE ON candidate_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER candidate_links_updated_at BEFORE UPDATE ON candidate_links
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER candidate_skills_updated_at BEFORE UPDATE ON candidate_skills
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER candidate_experiences_updated_at BEFORE UPDATE ON candidate_experiences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER candidate_educations_updated_at BEFORE UPDATE ON candidate_educations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER candidate_certifications_updated_at BEFORE UPDATE ON candidate_certifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER candidate_projects_updated_at BEFORE UPDATE ON candidate_projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER candidate_languages_updated_at BEFORE UPDATE ON candidate_languages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER candidate_awards_updated_at BEFORE UPDATE ON candidate_awards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Canonical facts use deleted_at; direct DELETE is forbidden. Evidence is
-- retained for audit and invalidated/superseded through its status column.
CREATE TRIGGER candidate_profiles_no_hard_delete BEFORE DELETE ON candidate_profiles
    FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change();
CREATE TRIGGER candidate_profile_documents_no_hard_delete BEFORE DELETE ON candidate_profile_documents
    FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change();
CREATE TRIGGER candidate_skills_no_hard_delete BEFORE DELETE ON candidate_skills
    FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change();
CREATE TRIGGER candidate_experiences_no_hard_delete BEFORE DELETE ON candidate_experiences
    FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change();
CREATE TRIGGER candidate_educations_no_hard_delete BEFORE DELETE ON candidate_educations
    FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change();
CREATE TRIGGER candidate_certifications_no_hard_delete BEFORE DELETE ON candidate_certifications
    FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change();
CREATE TRIGGER candidate_projects_no_hard_delete BEFORE DELETE ON candidate_projects
    FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change();
CREATE TRIGGER candidate_languages_no_hard_delete BEFORE DELETE ON candidate_languages
    FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change();
CREATE TRIGGER candidate_awards_no_hard_delete BEFORE DELETE ON candidate_awards
    FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change();
CREATE TRIGGER candidate_links_no_hard_delete BEFORE DELETE ON candidate_links
    FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change();
CREATE TRIGGER candidate_skill_evidence_guard BEFORE UPDATE OR DELETE ON candidate_skill_evidence
    FOR EACH ROW EXECUTE FUNCTION enforce_evidence_status_transition();
CREATE TRIGGER candidate_experience_evidence_guard BEFORE UPDATE OR DELETE ON candidate_experience_evidence
    FOR EACH ROW EXECUTE FUNCTION enforce_evidence_status_transition();
CREATE TRIGGER candidate_education_evidence_guard BEFORE UPDATE OR DELETE ON candidate_education_evidence
    FOR EACH ROW EXECUTE FUNCTION enforce_evidence_status_transition();
CREATE TRIGGER candidate_certification_evidence_guard BEFORE UPDATE OR DELETE ON candidate_certification_evidence
    FOR EACH ROW EXECUTE FUNCTION enforce_evidence_status_transition();
CREATE TRIGGER profile_change_history_immutable BEFORE UPDATE OR DELETE ON profile_change_history
    FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change();

CREATE UNIQUE INDEX uq_candidate_active_master_skill
    ON candidate_skills(candidate_id, skill_id)
    WHERE deleted_at IS NULL AND skill_id IS NOT NULL;
CREATE UNIQUE INDEX uq_candidate_active_custom_skill
    ON candidate_skills(candidate_id, lower(btrim(custom_skill_name)))
    WHERE deleted_at IS NULL AND skill_id IS NULL;
CREATE UNIQUE INDEX uq_candidate_active_language
    ON candidate_languages(candidate_id, lower(btrim(language_name)))
    WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_candidate_active_link_type_url
    ON candidate_links(candidate_id, lower(btrim(link_type)), lower(btrim(url)))
    WHERE deleted_at IS NULL;
CREATE INDEX idx_candidate_links_candidate
    ON candidate_links(candidate_id, display_order) WHERE deleted_at IS NULL;
CREATE INDEX idx_candidate_skill_evidence_parent
    ON candidate_skill_evidence(candidate_skill_id, created_at DESC);
CREATE INDEX idx_candidate_experience_evidence_parent
    ON candidate_experience_evidence(candidate_experience_id, created_at DESC);
CREATE INDEX idx_candidate_education_evidence_parent
    ON candidate_education_evidence(candidate_education_id, created_at DESC);
CREATE INDEX idx_candidate_certification_evidence_parent
    ON candidate_certification_evidence(candidate_certification_id, created_at DESC);
CREATE INDEX idx_candidate_profiles_open_location
    ON candidate_profiles(country, city, updated_at DESC)
    WHERE deleted_at IS NULL AND is_open_to_work = TRUE;
CREATE INDEX idx_candidate_experiences_candidate
    ON candidate_experiences(candidate_id, display_order) WHERE deleted_at IS NULL;
CREATE INDEX idx_candidate_educations_candidate
    ON candidate_educations(candidate_id, display_order) WHERE deleted_at IS NULL;
CREATE INDEX idx_candidate_projects_candidate
    ON candidate_projects(candidate_id, display_order) WHERE deleted_at IS NULL;
CREATE INDEX idx_candidate_search_fts
    ON candidate_search_profiles USING GIN(search_vector);
CREATE INDEX idx_candidate_search_embedding
    ON candidate_search_profiles USING hnsw (embedding vector_cosine_ops)
    WHERE embedding IS NOT NULL;
CREATE INDEX idx_profile_change_history_candidate
    ON profile_change_history(candidate_id, profile_revision DESC, created_at DESC);

-- ============================================================================
-- FUNCTION: create_empty_candidate_profile()
-- Purpose: Automatically creates empty candidate_profiles row for new candidates
--          when they sign up via Supabase Auth.
-- This reduces boilerplate in NestJS — one less service responsibility.
-- Runs AFTER INSERT on users table for candidate role users only.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_empty_candidate_profile()
RETURNS TRIGGER
SECURITY DEFINER SET search_path = ''
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only for candidate role users
    IF NEW.role = 'candidate' THEN
        INSERT INTO public.candidate_profiles (user_id)
        VALUES (NEW.id)
        ON CONFLICT (user_id) DO NOTHING;  -- Safety: ignore if already exists
    END IF;

    RETURN NEW;
END;
$$;

-- ============================================================================
-- TRIGGER: create_candidate_profile_on_user_signup
-- Automatically creates empty candidate_profiles when new candidate signs up.
-- This ensures every candidate has a profile row ready for onboarding.
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'create_candidate_profile_on_user_signup'
          AND tgrelid = 'public.users'::regclass
    ) THEN
        CREATE TRIGGER create_candidate_profile_on_user_signup
            AFTER INSERT ON public.users
            FOR EACH ROW
            EXECUTE FUNCTION public.create_empty_candidate_profile();
    END IF;
END
$$;
