-- ============================================================================
-- Resume Processing & AI Parsing History
--
-- QUICK SUMMARY:
-- This file tracks asynchronous resume parsing. Processing jobs are mutable;
-- final parsed results, artifacts and event history are immutable evidence.
--
-- TABLES CREATED HERE:
--   1. resume_parsing_jobs       -> queue/lifecycle row for one parse attempt
--   2. resume_parsed_data        -> maximum one immutable result per job
--   3. resume_parsing_artifacts  -> OCR/text/page/validation supporting outputs
--   4. resume_parsing_job_events -> append-only processing timeline
--
-- TRIGGERS CREATED HERE:
--   1. resume_parsing_jobs_updated_at     -> maintains mutable job updated_at
--   2. resume_parsed_data_immutable       -> blocks result update/delete
--   3. resume_parsing_job_events_immutable-> blocks event update/delete
--   4. resume_parsing_artifacts_immutable -> blocks artifact update/delete
--
-- WHEN DATA IS WRITTEN:
--   * NestJS inserts a queued job and outbox event after document security approval.
--   * The private FastAPI worker claims and updates it: queued -> processing -> completed.
--   * FastAPI inserts artifacts/events during processing using a restricted worker DB role.
--   * FastAPI validates and inserts the final AI output once into resume_parsed_data.
--   * If another background step is required, FastAPI inserts the next outbox event
--     in the same final transaction and records processed_events for idempotency.
--   * Reparse creates a new job/result; it never overwrites an older result.
--
-- CALL FLOW:
-- NestJS + outbox -> dispatcher -> Cloud Tasks -> private FastAPI worker -> DB.
-- FastAPI is the trusted background worker, not a browser-facing database writer.
--
-- NEXT FILE:
-- 08_candidates.sql converts parsed suggestions/evidence into candidate-editable
-- canonical facts only after the applicable merge/confirmation policy.
-- Detailed guide: 07_resume_processing_Explanation.md
-- ============================================================================

CREATE TABLE resume_parsing_jobs (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id             UUID NOT NULL REFERENCES uploaded_documents(id) ON DELETE CASCADE,
    parser_provider         VARCHAR(50) NOT NULL,
    parser_model            VARCHAR(150) NOT NULL,
    parser_version          VARCHAR(50) NOT NULL,
    prompt_version          VARCHAR(50),
    extraction_version      VARCHAR(50) NOT NULL,
    status                  parsing_job_status NOT NULL DEFAULT 'queued',
    priority                parsing_priority NOT NULL DEFAULT 'normal',
    requested_by_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    idempotency_key         VARCHAR(255) NOT NULL UNIQUE,
    attempt_number          INTEGER NOT NULL DEFAULT 1 CHECK (attempt_number > 0),
    max_attempts            INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
    available_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_at               TIMESTAMPTZ,
    locked_by               VARCHAR(255),
    started_at              TIMESTAMPTZ,
    completed_at            TIMESTAMPTZ,
    failed_at               TIMESTAMPTZ,
    error_details           JSONB,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT parsing_attempt_limit CHECK (attempt_number <= max_attempts),
    CONSTRAINT parsing_error_details_object CHECK (
        error_details IS NULL OR jsonb_typeof(error_details) = 'object'
    ),
    CONSTRAINT resume_parsing_job_document_identity UNIQUE (id, document_id)
);

CREATE TABLE resume_parsed_data (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parsing_job_id      UUID NOT NULL UNIQUE,
    document_id         UUID NOT NULL,
    extracted_text      TEXT,
    raw_ai_output       JSONB NOT NULL,
    normalized_output   JSONB,
    confidence_details  JSONB,
    validation_result   JSONB,
    overall_confidence  DECIMAL(5,2),
    schema_version      VARCHAR(50) NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT parsed_confidence_check CHECK (
        overall_confidence IS NULL OR overall_confidence BETWEEN 0 AND 100
    ),
    CONSTRAINT parsed_raw_ai_output_object CHECK (
        jsonb_typeof(raw_ai_output) = 'object'
    ),
    CONSTRAINT parsed_normalized_output_object CHECK (
        normalized_output IS NULL OR jsonb_typeof(normalized_output) = 'object'
    ),
    CONSTRAINT parsed_confidence_details_object CHECK (
        confidence_details IS NULL OR jsonb_typeof(confidence_details) = 'object'
    ),
    CONSTRAINT parsed_validation_result_object CHECK (
        validation_result IS NULL OR jsonb_typeof(validation_result) = 'object'
    ),
    CONSTRAINT resume_parsed_data_document_identity UNIQUE (id, document_id),
    CONSTRAINT parsed_result_job_document_fk
        FOREIGN KEY (parsing_job_id, document_id)
        REFERENCES resume_parsing_jobs(id, document_id) ON DELETE CASCADE
);

CREATE TABLE resume_parsing_artifacts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parsing_job_id      UUID NOT NULL REFERENCES resume_parsing_jobs(id) ON DELETE CASCADE,
    artifact_type       parsing_artifact_type NOT NULL,
    document_id         UUID REFERENCES uploaded_documents(id) ON DELETE SET NULL,
    inline_data         JSONB,
    checksum_sha256     VARCHAR(64),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT parsing_artifact_payload_check CHECK (
        document_id IS NOT NULL OR inline_data IS NOT NULL
    ),
    CONSTRAINT parsing_artifact_inline_data_object CHECK (
        inline_data IS NULL OR jsonb_typeof(inline_data) = 'object'
    ),
    CONSTRAINT parsing_artifact_checksum_format CHECK (
        checksum_sha256 IS NULL OR checksum_sha256 ~ '^[0-9a-f]{64}$'
    )
);

CREATE TABLE resume_parsing_job_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parsing_job_id      UUID NOT NULL REFERENCES resume_parsing_jobs(id) ON DELETE CASCADE,
    event_type          parsing_event_type NOT NULL,
    event_data          JSONB NOT NULL DEFAULT '{}'::JSONB,
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT parsing_event_data_object CHECK (
        jsonb_typeof(event_data) = 'object'
    )
);

CREATE TRIGGER resume_parsing_jobs_updated_at
    BEFORE UPDATE ON resume_parsing_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER resume_parsed_data_immutable
    BEFORE UPDATE OR DELETE ON resume_parsed_data
    FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change();

CREATE TRIGGER resume_parsing_job_events_immutable
    BEFORE UPDATE OR DELETE ON resume_parsing_job_events
    FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change();

CREATE TRIGGER resume_parsing_artifacts_immutable
    BEFORE UPDATE OR DELETE ON resume_parsing_artifacts
    FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change();

CREATE INDEX idx_resume_parsing_jobs_queue
    ON resume_parsing_jobs(priority DESC, available_at, created_at)
    WHERE status = 'queued';

CREATE INDEX idx_resume_parsing_jobs_document
    ON resume_parsing_jobs(document_id, created_at DESC);

CREATE INDEX idx_resume_parsed_data_document
    ON resume_parsed_data(document_id, created_at DESC);

CREATE INDEX idx_resume_artifacts_job
    ON resume_parsing_artifacts(parsing_job_id, artifact_type);

CREATE INDEX idx_resume_job_events_timeline
    ON resume_parsing_job_events(parsing_job_id, occurred_at);
