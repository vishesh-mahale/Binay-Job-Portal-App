-- ============================================================================
-- Analytics & Event Tracking Schema
--
-- Responsibilities:
--   1. Idempotent product/business analytics event ingestion.
--   2. Rebuildable daily company/platform dashboard aggregates.
--   3. Immutable security/business audit history.
--   4. Search-quality telemetry and sanitized application-error records.
--
-- Privacy/ownership boundaries:
--   - NestJS/service ingestion validates event names and strips secrets/tokens/PII.
--   - Browser clients never write these tables directly.
--   - Raw analytics/search records are retention-controlled history; aggregates are derived.
--   - Stack traces and request bodies belong in Cloud Logging/Sentry, not this database.
--   - RLS/grants are finalized in 17_rls.sql.
--
-- Inventory: 5 tables, 2 lifecycle functions, 6 triggers and 29 indexes.
-- ============================================================================

-- ============================================================================
-- TABLE: analytics_events
-- Purpose: Raw event capture for all user actions.
-- This is the primary source for all analytics and reporting.
-- ============================================================================
CREATE TABLE analytics_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL, -- NULL for anonymous
    company_id      UUID REFERENCES companies(id) ON DELETE SET NULL,
    session_id      VARCHAR(255),
    
    -- Distributed tracing (see 03_users_auth.sql for session management)
    request_id      UUID,               -- Identifies a single HTTP request or worker execution
    trace_id        UUID,               -- Follows an entire workflow across multiple services
    -- Example: Resume upload → AI parse → Embed → Index (all share one trace_id)
    
    -- Event identification
    event_name      VARCHAR(100) NOT NULL,
    -- 'page_view', 'job_view', 'application_submitted', 'search_performed',
    -- 'resume_uploaded', 'interview_scheduled', 'user_registered', etc.
    
    event_category  VARCHAR(50) NOT NULL,
    -- 'engagement', 'conversion', 'recruitment', 'user', 'search'
    
    -- Event source
    source          VARCHAR(50) NOT NULL DEFAULT 'web',
    -- 'web', 'mobile', 'api', 'cron', 'nestjs', 'fastapi', 'dispatcher'
    
    -- Context
    page_url        TEXT,
    referrer_url    TEXT,
    ip_address      INET,
    user_agent      TEXT,
    
    -- Entity references (polymorphic)
    entity_type     VARCHAR(50), -- 'job', 'company', 'candidate', 'application'
    entity_id       UUID,
    
    -- Event data (JSONB for maximum flexibility)
    event_data      JSONB NOT NULL DEFAULT '{}'::JSONB,
    -- Example for job_view: { "job_id": "...", "job_title": "Software Engineer", "source": "search" }
    -- Example for application: { "application_id": "...", "time_to_apply_seconds": 120 }
    
    -- Timestamp
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Partition by month for performance (requires table partitioning in production)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Data integrity
    CONSTRAINT analytics_event_idempotency_nonblank CHECK (
        idempotency_key = BTRIM(idempotency_key) AND idempotency_key <> ''
    ),
    CONSTRAINT analytics_event_name_format CHECK (
        event_name = lower(BTRIM(event_name))
        AND event_name ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
    ),
    CONSTRAINT chk_analytics_event_category CHECK (
        event_category IN ('engagement', 'conversion', 'recruitment', 'user', 'search', 'feature', 'system')
    ),
    CONSTRAINT analytics_event_source_check CHECK (
        source IN ('web', 'mobile', 'api', 'cron', 'nestjs', 'fastapi', 'dispatcher')
    ),
    CONSTRAINT analytics_event_entity_pair CHECK (
        (entity_type IS NULL AND entity_id IS NULL)
        OR (NULLIF(BTRIM(entity_type), '') IS NOT NULL AND entity_id IS NOT NULL)
    ),
    CONSTRAINT analytics_event_data_object CHECK (jsonb_typeof(event_data) = 'object'),
    CONSTRAINT analytics_page_url_check CHECK (
        page_url IS NULL OR page_url ~ '^(https?://|/[A-Za-z0-9])'
    ),
    CONSTRAINT analytics_referrer_url_check CHECK (
        referrer_url IS NULL OR referrer_url ~ '^https?://'
    )
);

-- Index for time-range queries (critical for analytics)
CREATE INDEX idx_analytics_events_occurred ON analytics_events(occurred_at DESC);
CREATE INDEX idx_analytics_events_name ON analytics_events(event_name, occurred_at DESC);
CREATE INDEX idx_analytics_events_user ON analytics_events(user_id, occurred_at DESC);
CREATE INDEX idx_analytics_events_company ON analytics_events(company_id, occurred_at DESC);
CREATE INDEX idx_analytics_events_entity ON analytics_events(entity_type, entity_id);
CREATE INDEX idx_analytics_events_entity_timeline ON analytics_events(entity_type, occurred_at DESC);
CREATE INDEX idx_analytics_events_request ON analytics_events(request_id);
CREATE INDEX idx_analytics_events_trace ON analytics_events(trace_id);


-- ============================================================================
-- TABLE: analytics_daily_aggregates
-- Purpose: Pre-computed daily aggregates for fast dashboard loading.
-- Updated by scheduled cron jobs or triggers.
-- ============================================================================
CREATE TABLE analytics_daily_aggregates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
    date            DATE NOT NULL,
    
    -- Job metrics
    job_views           INTEGER NOT NULL DEFAULT 0 CHECK (job_views >= 0),
    job_applications    INTEGER NOT NULL DEFAULT 0 CHECK (job_applications >= 0),
    jobs_published      INTEGER NOT NULL DEFAULT 0 CHECK (jobs_published >= 0),
    jobs_expired        INTEGER NOT NULL DEFAULT 0 CHECK (jobs_expired >= 0),
    
    -- Candidate metrics
    new_candidates      INTEGER NOT NULL DEFAULT 0 CHECK (new_candidates >= 0),
    new_applications    INTEGER NOT NULL DEFAULT 0 CHECK (new_applications >= 0),
    applications_by_status JSONB NOT NULL DEFAULT '{}'::JSONB,
    -- { "applied": 45, "shortlisted": 12, "interviewed": 5, "selected": 2 }
    
    -- User metrics
    new_registrations   INTEGER NOT NULL DEFAULT 0 CHECK (new_registrations >= 0),
    active_users        INTEGER NOT NULL DEFAULT 0 CHECK (active_users >= 0),
    sessions_count      INTEGER NOT NULL DEFAULT 0 CHECK (sessions_count >= 0),
    
    -- Search metrics
    total_searches      INTEGER NOT NULL DEFAULT 0 CHECK (total_searches >= 0),
    unique_searchers    INTEGER NOT NULL DEFAULT 0 CHECK (unique_searchers >= 0),
    
    -- Referral metrics
    referral_invitations_sent     INTEGER NOT NULL DEFAULT 0 CHECK (referral_invitations_sent >= 0),
    referral_invitations_opened   INTEGER NOT NULL DEFAULT 0 CHECK (referral_invitations_opened >= 0),
    referral_invitations_applied  INTEGER NOT NULL DEFAULT 0 CHECK (referral_invitations_applied >= 0),
    referral_invitations_declined INTEGER NOT NULL DEFAULT 0 CHECK (referral_invitations_declined >= 0),
    referral_invitations_expired  INTEGER NOT NULL DEFAULT 0 CHECK (referral_invitations_expired >= 0),
    
    -- Interview metrics
    interviews_scheduled    INTEGER NOT NULL DEFAULT 0 CHECK (interviews_scheduled >= 0),
    interviews_completed    INTEGER NOT NULL DEFAULT 0 CHECK (interviews_completed >= 0),
    interviews_cancelled    INTEGER NOT NULL DEFAULT 0 CHECK (interviews_cancelled >= 0),
    
    -- Conversion funnel
    funnel_data         JSONB NOT NULL DEFAULT '{}'::JSONB,
    -- { "application_to_shortlist": 0.27, "shortlist_to_interview": 0.65, 
    --   "interview_to_offer": 0.45, "offer_to_accept": 0.85 }
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT analytics_daily_application_status_object CHECK (jsonb_typeof(applications_by_status) = 'object'),
    CONSTRAINT analytics_daily_funnel_object CHECK (jsonb_typeof(funnel_data) = 'object')
);

CREATE TRIGGER analytics_daily_aggregates_updated_at
    BEFORE UPDATE ON analytics_daily_aggregates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- TABLE: audit_logs
-- Purpose: Compliance and security audit trail for all sensitive operations.
-- ============================================================================
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID REFERENCES companies(id) ON DELETE SET NULL,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_service   VARCHAR(100), -- Required when a trusted system/worker, not a user, performs the action
    
    -- Target user (who was affected by this action)
    -- Example: Admin resets another user's password → user_id = Admin, target_user_id = affected user
    target_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Distributed tracing
    request_id      UUID,               -- Identifies a single HTTP request or worker execution
    trace_id        UUID,               -- Follows an entire workflow across multiple services
    
    -- Action details
    action          VARCHAR(100) NOT NULL,
    -- 'user.login', 'user.password_change', 'job.created', 'job.deleted',
    -- 'application.status_changed', 'company.updated', 'permission.changed'
    
    entity_type     VARCHAR(50) NOT NULL,
    entity_id       UUID,
    
    -- Context
    ip_address      INET,
    user_agent      TEXT,
    
    -- Changes (JSONB diff)
    old_values      JSONB,
    new_values      JSONB,
    changes         JSONB, -- Specific field-level changes
    
    -- Additional metadata
    metadata        JSONB NOT NULL DEFAULT '{}'::JSONB,
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT audit_log_actor_check CHECK (
        (user_id IS NOT NULL AND actor_service IS NULL)
        OR (user_id IS NULL AND actor_service IS NOT NULL
            AND actor_service = BTRIM(actor_service) AND actor_service <> '')
    ),
    CONSTRAINT audit_log_action_format CHECK (
        action = lower(BTRIM(action))
        AND action ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
    ),
    CONSTRAINT audit_log_entity_type_nonblank CHECK (
        entity_type = BTRIM(entity_type) AND entity_type <> ''
    ),
    CONSTRAINT audit_log_old_values_object CHECK (
        old_values IS NULL OR jsonb_typeof(old_values) = 'object'
    ),
    CONSTRAINT audit_log_new_values_object CHECK (
        new_values IS NULL OR jsonb_typeof(new_values) = 'object'
    ),
    CONSTRAINT audit_log_changes_object CHECK (
        changes IS NULL OR jsonb_typeof(changes) = 'object'
    ),
    CONSTRAINT audit_log_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

-- Indexes for audit queries
CREATE INDEX idx_audit_logs_company ON audit_logs(company_id, created_at DESC);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action, created_at DESC);
CREATE INDEX idx_audit_logs_target_user ON audit_logs(target_user_id, created_at DESC)
    WHERE target_user_id IS NOT NULL;
CREATE INDEX idx_audit_logs_request ON audit_logs(request_id) WHERE request_id IS NOT NULL;
CREATE INDEX idx_audit_logs_trace ON audit_logs(trace_id) WHERE trace_id IS NOT NULL;


-- ============================================================================
-- TABLE: search_logs
-- Purpose: Track search queries for improving search relevance and analytics.
-- ============================================================================
CREATE TABLE search_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL, -- NULL for anonymous
    company_id      UUID REFERENCES companies(id) ON DELETE SET NULL,
    session_id      VARCHAR(255),
    
    -- Search details
    query           TEXT NOT NULL,
    filters         JSONB NOT NULL DEFAULT '{}'::JSONB,
    -- { "location": "New York", "salary_min": 50000, "employment_type": "full_time",
    --   "work_mode": "remote", "experience_level": "senior" }
    
    result_count    INTEGER,
    clicked_job_id  UUID REFERENCES jobs(id) ON DELETE SET NULL,
    clicked_position INTEGER, -- Position of clicked job in results (1, 2, 5, 17, etc.)
    page_number     INTEGER NOT NULL DEFAULT 1,
    results_per_page INTEGER NOT NULL DEFAULT 20,
    
    -- Search metadata
    search_engine   VARCHAR(50), -- 'fts', 'pgvector', 'hybrid', 'ai_search', 'sql_fallback'
    search_type     VARCHAR(50) NOT NULL DEFAULT 'keyword', -- 'keyword', 'advanced', 'ai', 'voice'
    
    -- Timing
    search_duration_ms INTEGER, -- How long the search took
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT search_log_idempotency_nonblank CHECK (
        idempotency_key = BTRIM(idempotency_key) AND idempotency_key <> ''
    ),
    CONSTRAINT search_log_query_nonblank CHECK (query = BTRIM(query) AND query <> ''),
    CONSTRAINT search_log_filters_object CHECK (jsonb_typeof(filters) = 'object'),
    CONSTRAINT search_log_result_count_check CHECK (result_count IS NULL OR result_count >= 0),
    CONSTRAINT search_log_click_pair CHECK (
        (clicked_job_id IS NULL AND clicked_position IS NULL)
        OR (clicked_job_id IS NOT NULL AND clicked_position IS NOT NULL AND clicked_position > 0)
    ),
    CONSTRAINT search_log_pagination_check CHECK (page_number > 0 AND results_per_page BETWEEN 1 AND 100),
    CONSTRAINT search_log_engine_check CHECK (
        search_engine IS NULL OR search_engine IN ('fts', 'pgvector', 'hybrid', 'ai_search', 'sql_fallback')
    ),
    CONSTRAINT search_log_type_check CHECK (search_type IN ('keyword', 'advanced', 'ai', 'voice')),
    CONSTRAINT search_log_duration_check CHECK (search_duration_ms IS NULL OR search_duration_ms >= 0)
);

CREATE INDEX idx_search_logs_user ON search_logs(user_id, occurred_at DESC);
CREATE INDEX idx_search_logs_query_hash ON search_logs USING HASH(query);
CREATE INDEX idx_search_logs_occurred ON search_logs(occurred_at DESC);
CREATE INDEX idx_search_logs_company ON search_logs(company_id, occurred_at DESC);


-- ============================================================================
-- TABLE: error_logs
-- Purpose: Application error tracking for debugging and monitoring.
-- ============================================================================
CREATE TABLE error_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID REFERENCES companies(id) ON DELETE SET NULL,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Error details
    error_type      VARCHAR(255) NOT NULL, -- Exception class / error code
    error_message   TEXT,
    error_hash      VARCHAR(64), -- Sanitized external error fingerprint for grouping
    severity        VARCHAR(50) NOT NULL DEFAULT 'error',
    
    -- Resolution tracking
    is_resolved     BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at     TIMESTAMPTZ,
    resolved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_by_service VARCHAR(100),
    resolution_note TEXT,
    
    -- Distributed tracing
    request_id      UUID,               -- Identifies a single HTTP request or worker execution
    trace_id        UUID,               -- Follows an entire workflow across multiple services
    
    -- Context
    request_url     TEXT,
    request_method  VARCHAR(10),
    request_context JSONB NOT NULL DEFAULT '{}'::JSONB,
    -- Sanitized allow-listed context only. Never store passwords, tokens, cookies,
    -- authorization headers, raw resumes or unrestricted request bodies here.
    ip_address      INET,
    user_agent      TEXT,
    environment     VARCHAR(50) NOT NULL, -- 'development', 'staging', 'production'
    service_name    VARCHAR(100) NOT NULL, -- 'nestjs-api', 'fastapi-worker', 'outbox-dispatcher', etc.
    
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Data integrity
    CONSTRAINT chk_error_logs_severity CHECK (
        severity IN ('info', 'warning', 'error', 'critical')
    ),
    CONSTRAINT chk_error_logs_environment CHECK (
        environment IN ('development', 'staging', 'production')
    ),
    CONSTRAINT error_logs_service_nonblank CHECK (
        service_name = BTRIM(service_name) AND service_name <> ''
    ),
    CONSTRAINT error_logs_hash_format CHECK (
        error_hash IS NULL OR error_hash ~ '^[A-Fa-f0-9]{64}$'
    ),
    CONSTRAINT error_logs_resolution_state CHECK (
        (is_resolved = FALSE AND resolved_at IS NULL AND resolved_by IS NULL AND resolved_by_service IS NULL)
        OR (is_resolved = TRUE AND resolved_at IS NOT NULL AND (
            (resolved_by IS NOT NULL AND resolved_by_service IS NULL)
            OR (resolved_by IS NULL AND resolved_by_service IS NOT NULL
                AND resolved_by_service = BTRIM(resolved_by_service)
                AND resolved_by_service <> '')
        ))
    ),
    CONSTRAINT error_logs_request_context_object CHECK (jsonb_typeof(request_context) = 'object'),
    CONSTRAINT error_logs_request_method_check CHECK (
        request_method IS NULL OR request_method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD')
    ),
    CONSTRAINT error_logs_request_url_check CHECK (
        request_url IS NULL OR request_url ~ '^(https?://|/[A-Za-z0-9])'
    )
);

-- Raw analytics/search records are immutable after ingestion. Their physical
-- deletion is reserved for an approved retention workflow and protected by RLS/grants.
CREATE OR REPLACE FUNCTION reject_analytics_history_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION '% rows are append-only and cannot be changed via %', TG_TABLE_NAME, lower(TG_OP);
END;
$$;

CREATE TRIGGER analytics_events_immutable
    BEFORE UPDATE ON analytics_events
    FOR EACH ROW
    EXECUTE FUNCTION reject_analytics_history_update();

CREATE TRIGGER audit_logs_immutable
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION reject_analytics_history_update();

CREATE TRIGGER search_logs_immutable
    BEFORE UPDATE ON search_logs
    FOR EACH ROW
    EXECUTE FUNCTION reject_analytics_history_update();

CREATE OR REPLACE FUNCTION enforce_error_log_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.is_resolved AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'Resolved error log is immutable';
    END IF;

    IF (to_jsonb(NEW) - ARRAY[
            'is_resolved', 'resolved_at', 'resolved_by', 'resolved_by_service',
            'resolution_note', 'updated_at'
        ])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY[
            'is_resolved', 'resolved_at', 'resolved_by', 'resolved_by_service',
            'resolution_note', 'updated_at'
        ]) THEN
        RAISE EXCEPTION 'Error occurrence identity/payload is immutable';
    END IF;

    IF OLD.is_resolved = FALSE AND NEW.is_resolved = FALSE
       AND (NEW.resolved_at IS NOT NULL OR NEW.resolved_by IS NOT NULL
            OR NEW.resolved_by_service IS NOT NULL) THEN
        RAISE EXCEPTION 'Unresolved error cannot contain resolution identity/timestamp';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER error_logs_lifecycle_guard
    BEFORE UPDATE ON error_logs
    FOR EACH ROW
    EXECUTE FUNCTION enforce_error_log_lifecycle();

CREATE TRIGGER error_logs_updated_at
    BEFORE UPDATE ON error_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_error_logs_type ON error_logs(error_type);
CREATE INDEX idx_error_logs_severity ON error_logs(severity);
CREATE INDEX idx_error_logs_occurred ON error_logs(occurred_at DESC);
CREATE INDEX idx_error_logs_hash ON error_logs(error_hash);
CREATE INDEX idx_error_logs_resolved ON error_logs(is_resolved, occurred_at DESC) WHERE is_resolved = FALSE;
CREATE INDEX idx_error_logs_company ON error_logs(company_id, occurred_at DESC);
CREATE INDEX idx_error_logs_request ON error_logs(request_id);
CREATE INDEX idx_error_logs_trace ON error_logs(trace_id);

-- Daily aggregate identity: PostgreSQL UNIQUE does not treat NULL company IDs
-- as equal, so platform-wide and company-specific rows need separate indexes.
CREATE UNIQUE INDEX uq_analytics_daily_platform
    ON analytics_daily_aggregates(date)
    WHERE company_id IS NULL;
CREATE UNIQUE INDEX uq_analytics_daily_company
    ON analytics_daily_aggregates(company_id, date)
    WHERE company_id IS NOT NULL;

