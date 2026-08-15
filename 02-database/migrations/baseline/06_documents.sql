-- ============================================================================
-- Generic Documents & Guest Upload Sessions
--
-- QUICK SUMMARY:
-- This file records uploaded-file metadata and controls who originally uploaded
-- each file. The binary file stays in private object storage; PostgreSQL stores
-- its identity, storage location, checksum, scan state and processing state.
--
-- TABLES CREATED HERE:
--   1. guest_upload_sessions -> short-lived, job-scoped upload permission for
--                               a guest who does not yet have a users row
--   2. uploaded_documents    -> registry for resumes, certificates, cover
--                               letters and other private uploaded files
--
-- FUNCTIONS CREATED HERE:
--   1. reject_immutable_row_change() -> shared trigger guard used by this and
--                                       later files for append-only records
--
-- TRIGGERS CREATED HERE (3):
--   1. guest_upload_sessions_updated_guard -> maintains updated_at
--   2. uploaded_documents_updated_guard    -> timestamps scan/processing updates
--   3. uploaded_documents_no_hard_delete   -> normal flows must use deleted_at;
--                                             physical purge is controlled
--
-- WHEN DATA IS WRITTEN:
--   * NestJS creates guest_upload_sessions before an unauthenticated guest upload.
--   * NestJS inserts uploaded_documents after validation/checksum/storage upload.
--   * A security worker updates scan and processing states asynchronously.
--   * Duplicate checksum indexes let NestJS reuse an existing owner/session file.
--
-- OWNERSHIP RULE:
-- Exactly one upload origin is required: registered user XOR guest session.
-- A guest who later registers does not rewrite original upload provenance.
--
-- NEXT FILE:
-- 07_resume_processing.sql creates parsing jobs/results for a resume document.
-- Detailed guide: 06_documents_Explanation.md
-- ============================================================================

-- Shared append-only guard. It is defined here because documents are the
-- earliest domain objects that require immutable-history protection.
CREATE OR REPLACE FUNCTION reject_immutable_row_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

CREATE TABLE guest_upload_sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id              UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    token_hash          VARCHAR(255) NOT NULL UNIQUE,
    email               CITEXT,
    status              guest_upload_session_status NOT NULL DEFAULT 'active',
    max_upload_count    SMALLINT NOT NULL DEFAULT 3 CHECK (max_upload_count > 0),
    max_total_bytes     BIGINT NOT NULL DEFAULT 31457280 CHECK (max_total_bytes > 0),
    uploaded_count      SMALLINT NOT NULL DEFAULT 0 CHECK (uploaded_count >= 0),
    uploaded_bytes      BIGINT NOT NULL DEFAULT 0 CHECK (uploaded_bytes >= 0),
    expires_at          TIMESTAMPTZ NOT NULL,
    consumed_at         TIMESTAMPTZ,
    revoked_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT guest_upload_session_job_identity UNIQUE (id, job_id),
    CONSTRAINT guest_upload_expiry_check CHECK (expires_at > created_at),
    CONSTRAINT guest_upload_count_limit CHECK (uploaded_count <= max_upload_count),
    CONSTRAINT guest_upload_bytes_limit CHECK (uploaded_bytes <= max_total_bytes)
);

CREATE TABLE uploaded_documents (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uploaded_by_user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    guest_upload_session_id UUID REFERENCES guest_upload_sessions(id) ON DELETE SET NULL,
    document_type           document_type NOT NULL,
    original_file_name      VARCHAR(255) NOT NULL,
    file_extension          VARCHAR(20),
    file_size_bytes         BIGINT NOT NULL CHECK (file_size_bytes > 0),
    mime_type               VARCHAR(150) NOT NULL,
    storage_bucket          VARCHAR(100) NOT NULL,
    storage_path            TEXT NOT NULL,
    checksum_sha256         VARCHAR(64) NOT NULL,
    security_scan_status    security_scan_status NOT NULL DEFAULT 'pending',
    security_scan_result    JSONB,
    processing_status       resume_processing_status NOT NULL DEFAULT 'uploaded',
    metadata                JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    CONSTRAINT uploaded_document_owner_check CHECK (
        (uploaded_by_user_id IS NOT NULL AND guest_upload_session_id IS NULL)
        OR
        (uploaded_by_user_id IS NULL AND guest_upload_session_id IS NOT NULL)
    ),
    CONSTRAINT uploaded_document_storage_unique UNIQUE (storage_bucket, storage_path),
    CONSTRAINT uploaded_document_checksum_format CHECK (
        checksum_sha256 ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT uploaded_document_scan_result_object CHECK (
        security_scan_result IS NULL OR jsonb_typeof(security_scan_result) = 'object'
    ),
    CONSTRAINT uploaded_document_metadata_object CHECK (
        jsonb_typeof(metadata) = 'object'
    )
);

CREATE TRIGGER guest_upload_sessions_updated_guard
    BEFORE UPDATE ON guest_upload_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER uploaded_documents_updated_guard
    BEFORE UPDATE ON uploaded_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Physical deletion is reserved for a separately authorized retention/purge
-- workflow. Normal product flows only set deleted_at.
CREATE TRIGGER uploaded_documents_no_hard_delete
    BEFORE DELETE ON uploaded_documents
    FOR EACH ROW EXECUTE FUNCTION reject_immutable_row_change();

CREATE UNIQUE INDEX uq_uploaded_document_checksum_owner
    ON uploaded_documents(uploaded_by_user_id, checksum_sha256)
    WHERE uploaded_by_user_id IS NOT NULL
      AND deleted_at IS NULL;

CREATE UNIQUE INDEX uq_uploaded_document_checksum_guest_session
    ON uploaded_documents(guest_upload_session_id, checksum_sha256)
    WHERE guest_upload_session_id IS NOT NULL
      AND deleted_at IS NULL;

CREATE INDEX idx_guest_upload_sessions_expiry
    ON guest_upload_sessions(expires_at)
    WHERE status = 'active';

CREATE INDEX idx_uploaded_documents_user
    ON uploaded_documents(uploaded_by_user_id, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_uploaded_documents_guest_session
    ON uploaded_documents(guest_upload_session_id, created_at DESC)
    WHERE guest_upload_session_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_uploaded_documents_scan_queue
    ON uploaded_documents(security_scan_status, created_at)
    WHERE security_scan_status IN ('pending', 'failed');
