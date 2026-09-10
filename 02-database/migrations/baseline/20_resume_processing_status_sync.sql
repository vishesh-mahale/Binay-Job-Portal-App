-- ============================================================================
-- Sync uploaded_documents.processing_status from resume_parsing_jobs
--
-- TRIGGER: trg_sync_processing_status
-- WHEN: AFTER INSERT OR UPDATE OF status ON resume_parsing_jobs
-- WHAT: Derives document-level processing_status from latest parsing job
--
-- RULES:
--   1. Only latest/current parsing job can update the document projection
--   2. Old/reparse jobs must never overwrite a newer job's status
--   3. Security scan state (infected/quarantined) must not be overwritten
--   4. cancelled maps to failed (resume_processing_status has no cancelled value)
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_processing_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_doc_id UUID;
    v_latest_job_id UUID;
    v_latest_status parsing_job_status;
    v_scan_status security_scan_status;
BEGIN
    -- Get document_id from NEW row
    v_doc_id := NEW.document_id;

    -- Guard: document must exist (FK ensures this in normal flow, but guard for safety)
    IF NOT EXISTS (
        SELECT 1 FROM uploaded_documents WHERE id = v_doc_id
    ) THEN
        RETURN NEW;
    END IF;

    -- Find the latest parsing job for this document
    -- created_at determines the latest job; id provides deterministic tie-breaker
    SELECT id, status INTO v_latest_job_id, v_latest_status
    FROM resume_parsing_jobs
    WHERE document_id = v_doc_id
    ORDER BY created_at DESC, id DESC
    LIMIT 1;

    -- Only proceed if the triggering job is the latest one
    IF v_latest_job_id IS DISTINCT FROM NEW.id THEN
        RETURN NEW;
    END IF;

    -- Check security scan status — security precedence
    SELECT security_scan_status INTO v_scan_status
    FROM uploaded_documents
    WHERE id = v_doc_id;

    IF v_scan_status IN ('infected', 'quarantined') THEN
        RETURN NEW;  -- Don't update processing_status
    END IF;

    -- Map job status → processing_status
    -- cancelled → failed because resume_processing_status enum has no cancelled value
    UPDATE uploaded_documents
    SET processing_status = CASE v_latest_status
        WHEN 'queued'     THEN 'queued'::resume_processing_status
        WHEN 'processing'  THEN 'processing'::resume_processing_status
        WHEN 'completed'   THEN 'completed'::resume_processing_status
        WHEN 'partial'     THEN 'partial'::resume_processing_status
        WHEN 'failed'      THEN 'failed'::resume_processing_status
        WHEN 'cancelled'   THEN 'failed'::resume_processing_status
        ELSE processing_status
    END,
    updated_at = NOW()
    WHERE id = v_doc_id;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_processing_status
    AFTER INSERT OR UPDATE OF status ON resume_parsing_jobs
    FOR EACH ROW
    EXECUTE FUNCTION sync_processing_status();
