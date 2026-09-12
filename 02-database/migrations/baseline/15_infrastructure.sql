-- ============================================================================
-- Infrastructure: Transactional Outbox, Consumer Idempotency, and Worker Leases
--
-- Final flow:
--   NestJS/FastAPI transaction + outbox_events INSERT
--       -> Supabase asynchronous INSERT webhook (primary wake-up only)
--       -> NestJS Outbox Dispatcher claims a bounded batch
--       -> Google Cloud Tasks managed queue
--       -> private Cloud Run FastAPI/NestJS handler
--       -> domain result + processed_events + optional chained outbox event
--
-- Google Cloud Scheduler only checks whether due/stale work exists and wakes Dispatcher.
-- Webhook/Cron payload is never business truth; Dispatcher rereads the DB.
--
-- Inventory: 3 tables, 6 lifecycle/dispatch functions, 2 triggers and 7 indexes.
-- RLS/grants and function EXECUTE permissions are finalized in 17_rls.sql.
--
-- Worker lease table:
--   event_processing_leases provides atomic in-flight duplicate prevention
--   for non-resume pipelines (candidate projection, job enrichment, match analysis).
-- ============================================================================


-- SAMPLE
-- {
-- 	"payload": {
-- 		"trace_id": "d8884be3-aeb0-4934-8f01-fbf315234c10",
-- 		"document_id": "75b3f32c-4f0a-4263-bbb4-48b231ad0076",
-- 		"uploaded_by_user_id": "6ca0bf5c-cd8c-4dd7-a66a-9451d8fe3b99",
-- 		"guest_upload_session_id": null
-- 	},
-- 	"event_id": "d8884be3-aeb0-4934-8f01-fbf315234c10",
-- 	"event_type": "security.scan.requested",
-- 	"occurred_at": "2026-09-11T04:51:44.662Z",
-- 	"aggregate_id": "75b3f32c-4f0a-4263-bbb4-48b231ad0076",
-- 	"aggregate_type": "uploaded_document",
-- 	"schema_version": 1
-- }


CREATE TABLE outbox_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Immutable event envelope
    aggregate_type      VARCHAR(100) NOT NULL,
    aggregate_id        UUID NOT NULL,
    event_type          VARCHAR(150) NOT NULL,
    schema_version      INTEGER NOT NULL DEFAULT 1 CHECK (schema_version > 0),
    payload             JSONB NOT NULL,
    correlation_id      UUID,
    causation_id        UUID,
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Mutable dispatch state
    status              outbox_event_status NOT NULL DEFAULT 'pending',
    available_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_at           TIMESTAMPTZ,
    lease_expires_at    TIMESTAMPTZ,
    locked_by           VARCHAR(255),
    task_name           VARCHAR(500),
    published_at        TIMESTAMPTZ,
    dead_lettered_at    TIMESTAMPTZ,
    retry_count         INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    max_retries         INTEGER NOT NULL DEFAULT 10 CHECK (max_retries BETWEEN 1 AND 100),
    last_error          TEXT,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT outbox_aggregate_type_format CHECK (
        aggregate_type = lower(BTRIM(aggregate_type))
        AND aggregate_type ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
    ),
    CONSTRAINT outbox_event_type_format CHECK (
        event_type = lower(BTRIM(event_type))
        AND event_type ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
    ),
    CONSTRAINT outbox_payload_object CHECK (jsonb_typeof(payload) = 'object'),
    CONSTRAINT outbox_availability_check CHECK (available_at >= occurred_at),
    CONSTRAINT outbox_retry_limit CHECK (retry_count <= max_retries),
    CONSTRAINT outbox_lock_pair CHECK (
        (locked_at IS NULL AND lease_expires_at IS NULL AND locked_by IS NULL)
        OR (locked_at IS NOT NULL AND lease_expires_at > locked_at
            AND NULLIF(BTRIM(locked_by), '') IS NOT NULL)
    ),
    CONSTRAINT outbox_status_state CHECK (
        (status = 'pending'
            AND locked_at IS NULL AND lease_expires_at IS NULL AND locked_by IS NULL
            AND published_at IS NULL AND task_name IS NULL AND dead_lettered_at IS NULL)
        OR
        (status = 'publishing'
            AND locked_at IS NOT NULL AND lease_expires_at IS NOT NULL AND locked_by IS NOT NULL
            AND published_at IS NULL AND task_name IS NULL AND dead_lettered_at IS NULL)
        OR
        (status = 'published'
            AND locked_at IS NULL AND lease_expires_at IS NULL AND locked_by IS NULL
            AND published_at IS NOT NULL AND task_name IS NOT NULL AND dead_lettered_at IS NULL)
        OR
        (status = 'failed'
            AND locked_at IS NULL AND lease_expires_at IS NULL AND locked_by IS NULL
            AND published_at IS NULL AND task_name IS NULL AND dead_lettered_at IS NULL
            AND retry_count > 0 AND NULLIF(BTRIM(last_error), '') IS NOT NULL)
        OR
        (status = 'dead_letter'
            AND locked_at IS NULL AND lease_expires_at IS NULL AND locked_by IS NULL
            AND published_at IS NULL AND task_name IS NULL AND dead_lettered_at IS NOT NULL
            AND retry_count = max_retries AND NULLIF(BTRIM(last_error), '') IS NOT NULL)
    )
);

CREATE TABLE processed_events (
    consumer_name       VARCHAR(100) NOT NULL,
    event_id            UUID NOT NULL REFERENCES outbox_events(id) ON DELETE RESTRICT,
    result_metadata     JSONB NOT NULL DEFAULT '{}'::JSONB,
    processed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (consumer_name, event_id),
    CONSTRAINT processed_event_consumer_format CHECK (
        consumer_name = lower(BTRIM(consumer_name))
        AND consumer_name ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
    ),
    CONSTRAINT processed_event_metadata_object CHECK (jsonb_typeof(result_metadata) = 'object')
);

-- Short DB transaction: claim + commit. Cloud Tasks network calls happen later.
CREATE OR REPLACE FUNCTION claim_outbox_events(
    p_worker_id       VARCHAR,
    p_batch_size      INTEGER DEFAULT 50,
    p_lease_seconds   INTEGER DEFAULT 120
)
RETURNS SETOF public.outbox_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
    IF NULLIF(BTRIM(p_worker_id), '') IS NULL THEN
        RAISE EXCEPTION 'Outbox claim requires a nonblank worker id';
    END IF;
    IF p_batch_size < 1 OR p_batch_size > 100 THEN
        RAISE EXCEPTION 'Outbox batch size must be between 1 and 100';
    END IF;
    IF p_lease_seconds < 30 OR p_lease_seconds > 900 THEN
        RAISE EXCEPTION 'Outbox lease must be between 30 and 900 seconds';
    END IF;

    -- A repeatedly stale lease is a dispatcher failure too. Exhausted rows move
    -- to dead letter instead of being reclaimed forever.
    UPDATE public.outbox_events
       SET status = 'dead_letter'::public.outbox_event_status,
           retry_count = max_retries,
           last_error = COALESCE(NULLIF(last_error, ''), 'Dispatcher lease expired before publish confirmation'),
           dead_lettered_at = NOW(),
           locked_at = NULL,
           lease_expires_at = NULL,
           locked_by = NULL,
           updated_at = NOW()
     WHERE status = 'publishing'
       AND lease_expires_at <= NOW()
       AND retry_count + 1 >= max_retries;

    RETURN QUERY
    WITH candidates AS (
        SELECT id, status AS previous_status
          FROM public.outbox_events
         WHERE ((status IN ('pending', 'failed') AND available_at <= NOW() AND retry_count < max_retries)
                OR (status = 'publishing' AND lease_expires_at <= NOW()
                    AND retry_count + 1 < max_retries))
         ORDER BY available_at, occurred_at, id
         FOR UPDATE SKIP LOCKED
         LIMIT p_batch_size
    )
    UPDATE public.outbox_events AS event
       SET status = 'publishing',
           retry_count = CASE WHEN candidates.previous_status = 'publishing'
                              THEN event.retry_count + 1 ELSE event.retry_count END,
           locked_at = NOW(),
           lease_expires_at = NOW() + make_interval(secs => p_lease_seconds),
           locked_by = BTRIM(p_worker_id),
           task_name = NULL,
           published_at = NULL,
           dead_lettered_at = NULL,
           updated_at = NOW()
      FROM candidates
     WHERE event.id = candidates.id
    RETURNING event.*;
END;
$$;

CREATE OR REPLACE FUNCTION mark_outbox_event_published(
    p_event_id UUID, p_worker_id VARCHAR, p_task_name VARCHAR
)
RETURNS public.outbox_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_event public.outbox_events;
BEGIN
    IF NULLIF(BTRIM(p_task_name), '') IS NULL THEN
        RAISE EXCEPTION 'Published outbox event requires the Cloud Task name';
    END IF;

    SELECT * INTO v_event
      FROM public.outbox_events
     WHERE id = p_event_id
       AND status = 'published'
       AND task_name = BTRIM(p_task_name);

    IF FOUND THEN
        RETURN v_event;
    END IF;

    UPDATE public.outbox_events
       SET status = 'published', task_name = BTRIM(p_task_name), published_at = NOW(),
           locked_at = NULL, lease_expires_at = NULL, locked_by = NULL,
           last_error = NULL, updated_at = NOW()
     WHERE id = p_event_id AND status = 'publishing' AND locked_by = BTRIM(p_worker_id)
    RETURNING * INTO v_event;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Outbox event is not publishing under this worker lease';
    END IF;
    RETURN v_event;
END;
$$;

CREATE OR REPLACE FUNCTION mark_outbox_event_failed(
    p_event_id UUID, p_worker_id VARCHAR, p_error TEXT, p_available_at TIMESTAMPTZ
)
RETURNS public.outbox_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_event public.outbox_events;
BEGIN
    IF NULLIF(BTRIM(p_error), '') IS NULL THEN
        RAISE EXCEPTION 'Failed outbox event requires a sanitized error summary';
    END IF;
    IF p_available_at IS NULL THEN
        RAISE EXCEPTION 'Failed outbox event requires the next available time';
    END IF;
    IF p_available_at < NOW() THEN
        RAISE EXCEPTION 'Next outbox availability cannot be in the past';
    END IF;

    UPDATE public.outbox_events
       SET retry_count = retry_count + 1,
           status = CASE WHEN retry_count + 1 >= max_retries
                         THEN 'dead_letter'::public.outbox_event_status
                         ELSE 'failed'::public.outbox_event_status END,
           available_at = p_available_at,
           last_error = LEFT(BTRIM(p_error), 4000),
           dead_lettered_at = CASE WHEN retry_count + 1 >= max_retries THEN NOW() ELSE NULL END,
           locked_at = NULL, lease_expires_at = NULL, locked_by = NULL,
           task_name = NULL, published_at = NULL, updated_at = NOW()
     WHERE id = p_event_id AND status = 'publishing' AND locked_by = BTRIM(p_worker_id)
    RETURNING * INTO v_event;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Outbox event is not publishing under this worker lease';
    END IF;
    RETURN v_event;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_outbox_event_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status NOT IN ('published', 'dead_letter') THEN
            RAISE EXCEPTION 'Only terminal outbox events may be deleted by the retention workflow';
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'pending'
           OR NEW.locked_at IS NOT NULL OR NEW.lease_expires_at IS NOT NULL OR NEW.locked_by IS NOT NULL
           OR NEW.task_name IS NOT NULL OR NEW.published_at IS NOT NULL OR NEW.dead_lettered_at IS NOT NULL
           OR NEW.retry_count <> 0 OR NEW.last_error IS NOT NULL THEN
            RAISE EXCEPTION 'New outbox event must start in a clean pending state';
        END IF;
        RETURN NEW;
    END IF;

    IF (to_jsonb(NEW) - ARRAY[
            'status', 'available_at', 'locked_at', 'lease_expires_at', 'locked_by',
            'task_name', 'published_at', 'dead_lettered_at', 'retry_count',
            'last_error', 'updated_at'
        ])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY[
            'status', 'available_at', 'locked_at', 'lease_expires_at', 'locked_by',
            'task_name', 'published_at', 'dead_lettered_at', 'retry_count',
            'last_error', 'updated_at'
        ]) THEN
        RAISE EXCEPTION 'Outbox event envelope/payload identity is immutable';
    END IF;
    IF OLD.status IN ('published', 'dead_letter') AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'Terminal outbox event is immutable';
    END IF;
    IF NEW.retry_count < OLD.retry_count THEN
        RAISE EXCEPTION 'Outbox retry count cannot decrease';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER outbox_events_lifecycle_guard
    BEFORE INSERT OR UPDATE OR DELETE ON outbox_events
    FOR EACH ROW
    EXECUTE FUNCTION enforce_outbox_event_lifecycle();

CREATE OR REPLACE FUNCTION reject_processed_event_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Processed-event idempotency records are immutable';
END;
$$;

CREATE TRIGGER processed_events_immutable
    BEFORE UPDATE ON processed_events
    FOR EACH ROW
    EXECUTE FUNCTION reject_processed_event_update();

-- Google Cloud Scheduler uses only this indexed existence check. It calls the Dispatcher
-- recovery endpoint only when the result is true.
CREATE OR REPLACE FUNCTION outbox_recovery_needed()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.outbox_events
         WHERE (status IN ('pending', 'failed') AND available_at <= NOW() AND retry_count < max_retries)
            OR (status = 'publishing' AND lease_expires_at <= NOW())
    );
$$;

CREATE INDEX idx_outbox_publish_queue
    ON outbox_events(available_at, occurred_at, id)
    WHERE status IN ('pending', 'failed');

CREATE INDEX idx_outbox_stale_publishing
    ON outbox_events(lease_expires_at)
    WHERE status = 'publishing';

CREATE INDEX idx_outbox_dead_letter
    ON outbox_events(dead_lettered_at DESC)
    WHERE status = 'dead_letter';

CREATE UNIQUE INDEX uq_outbox_task_name
    ON outbox_events(task_name)
    WHERE task_name IS NOT NULL;

CREATE INDEX idx_outbox_aggregate
    ON outbox_events(aggregate_type, aggregate_id, occurred_at DESC);

CREATE INDEX idx_processed_events_retention
    ON processed_events(processed_at);

-- ============================================================================
-- Worker In-Flight Execution Leases (Prevents Concurrent Duplicate AI Work)
-- ============================================================================
-- Non-resume pipelines (candidate projection, job enrichment, match analysis)
-- use this table for atomic lease acquisition before expensive AI work.
-- Resume parsing uses resume_parsing_jobs claim/lease instead.

CREATE TABLE event_processing_leases (
    lease_key       VARCHAR(255) PRIMARY KEY,
    consumer_name   VARCHAR(100) NOT NULL,
    event_id        UUID NOT NULL REFERENCES outbox_events(id) ON DELETE CASCADE,
    locked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,
    worker_id       VARCHAR(255),
    result_metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_worker_leases_expiry
    ON event_processing_leases(expires_at);

-- SECURITY DEFINER functions are closed by default. Exact Dispatcher/Cron role
-- grants are added only in the reviewed 17_rls.sql authorization pass.
REVOKE ALL ON FUNCTION claim_outbox_events(VARCHAR, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION mark_outbox_event_published(UUID, VARCHAR, VARCHAR) FROM PUBLIC;
REVOKE ALL ON FUNCTION mark_outbox_event_failed(UUID, VARCHAR, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION outbox_recovery_needed() FROM PUBLIC;

-- ============================================================================
-- Job expiry lifecycle (called by the approved Supabase pg_cron schedule)
-- ============================================================================
-- The function is intentionally idempotent: only due published/paused rows are
-- locked, transitioned once, audited, and notified. No outbox/Cloud Tasks path
-- is used for this deterministic database-clock workflow.
CREATE OR REPLACE FUNCTION public.expire_due_jobs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_job RECORD;
    v_expired INTEGER := 0;
    v_batch_count INTEGER := 0;
    v_key TEXT;
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    LOOP
        v_batch_count := 0;
        FOR v_job IN
            SELECT j.id, j.company_id, j.created_by, j.status, j.expires_at
            FROM public.jobs j
            WHERE j.status IN ('published', 'paused')
              AND j.expires_at IS NOT NULL
              AND j.expires_at <= v_now
              AND j.deleted_at IS NULL
            ORDER BY j.id
            LIMIT 100
            FOR UPDATE SKIP LOCKED
        LOOP
            UPDATE public.jobs
               SET status = 'expired', updated_at = NOW()
             WHERE id = v_job.id
               AND status IN ('published', 'paused')
               AND expires_at IS NOT NULL
               AND expires_at <= v_now
               AND deleted_at IS NULL;

            IF FOUND THEN
                v_expired := v_expired + 1;
                v_batch_count := v_batch_count + 1;

            INSERT INTO public.audit_logs (
                company_id, actor_service, action, entity_type, entity_id,
                old_values, new_values, changes, metadata
            ) VALUES (
                v_job.company_id, 'expire_due_jobs', 'job.expired', 'job', v_job.id,
                jsonb_build_object('status', v_job.status, 'expires_at', v_job.expires_at),
                jsonb_build_object('status', 'expired'),
                jsonb_build_object('status', jsonb_build_object('from', v_job.status, 'to', 'expired')),
                jsonb_build_object('reason', 'scheduled_expiry')
            );

            -- Creator-only notification is the approved recipient policy.
            IF EXISTS (
                SELECT 1 FROM public.users u
                   WHERE u.id = v_job.created_by
                   AND u.status = 'active'
                   AND u.deleted_at IS NULL
                   AND (
                       EXISTS (
                           SELECT 1 FROM public.companies c
                            WHERE c.id = v_job.company_id
                              AND c.owner_id = u.id
                              AND c.is_active = TRUE
                              AND c.deleted_at IS NULL
                       )
                       OR EXISTS (
                           SELECT 1 FROM public.company_members cm
                            WHERE cm.company_id = v_job.company_id
                              AND cm.user_id = u.id
                              AND cm.is_active = TRUE
                              AND cm.left_at IS NULL
                       )
                   )
            ) THEN
                v_key := format('job-expired:%s:%s', v_job.id, v_job.created_by);
                INSERT INTO public.notifications (
                    idempotency_key, user_id, company_id, entity_type, entity_id,
                    title, body, action_url, action_type, event_type, category,
                    channels, delivery_status
                ) VALUES (
                    v_key, v_job.created_by, v_job.company_id, 'job', v_job.id,
                    'Job expired', 'This job has reached its expiry time.',
                    NULL, 'open_job', 'job.expired', 'job',
                    '{"in_app": true}'::jsonb, '{"in_app": "pending"}'::jsonb
                ) ON CONFLICT (idempotency_key) DO NOTHING;
            END IF;
        END IF;
    END LOOP;
    EXIT WHEN v_batch_count < 100;
END LOOP;
RETURN v_expired;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_due_jobs() FROM PUBLIC;

-- Approved daily expiry schedule. pg_cron is enabled by 01_extensions.sql.
-- Database timezone is UTC; 18:35 UTC = 12:05 AM Asia/Kolkata.
-- The guard makes baseline re-execution safe and prevents duplicate schedules.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'daily_job_expiry_sweep'
    ) THEN
        PERFORM cron.schedule(
            'daily_job_expiry_sweep',
            '35 18 * * *',
            'SELECT public.expire_due_jobs();'
        );
    END IF;
END;
$$;
