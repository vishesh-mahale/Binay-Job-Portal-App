-- ============================================================================
-- Platform Feedback
--
-- CURRENT SCOPE:
--   - One-shot platform feedback from a registered user or a guest.
--   - Admin/service workflow may triage the row through feedback_status.
--   - Replies, attachments and support-ticket conversation history are future
--     requirements and intentionally do not belong in this table.
--
-- WRITE/READ BOUNDARY:
--   Next.js -> NestJS feedback endpoint -> validation/rate limit/CAPTCHA as
--   applicable -> platform_feedback insert. Browser roles never write/read the
--   raw table directly because it contains guest PII, metadata and admin notes.
-- ============================================================================

CREATE TABLE public.platform_feedback (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Exactly one submitter mode is allowed.
    user_id         UUID REFERENCES public.users(id) ON DELETE RESTRICT,
    is_guest        BOOLEAN NOT NULL DEFAULT FALSE,
    guest_name      VARCHAR(255),
    guest_email     CITEXT,
    guest_phone     VARCHAR(20),

    category        public.feedback_category NOT NULL DEFAULT 'other',
    subject         VARCHAR(255),
    message         TEXT NOT NULL,
    rating          INTEGER CHECK (rating BETWEEN 1 AND 5),

    -- Admin-controlled triage fields; never accepted from public submission DTO.
    status          public.feedback_status NOT NULL DEFAULT 'new',
    admin_notes     TEXT,

    -- Sanitized request/product context only. No secrets, raw tokens or
    -- unrestricted client-supplied objects.
    metadata        JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT platform_feedback_submitter_check CHECK (
        (
            is_guest = TRUE
            AND user_id IS NULL
            AND NULLIF(BTRIM(guest_name), '') IS NOT NULL
            AND guest_email IS NOT NULL
        )
        OR
        (
            is_guest = FALSE
            AND user_id IS NOT NULL
            AND guest_name IS NULL
            AND guest_email IS NULL
            AND guest_phone IS NULL
        )
    ),
    CONSTRAINT platform_feedback_guest_name_trimmed CHECK (
        guest_name IS NULL OR guest_name = BTRIM(guest_name)
    ),
    CONSTRAINT platform_feedback_guest_email_trimmed CHECK (
        guest_email IS NULL OR guest_email::TEXT = BTRIM(guest_email::TEXT)
    ),
    CONSTRAINT platform_feedback_guest_phone_e164 CHECK (
        guest_phone IS NULL OR guest_phone ~ '^\+[1-9][0-9]{7,14}$'
    ),
    CONSTRAINT platform_feedback_subject_check CHECK (
        subject IS NULL OR (subject = BTRIM(subject) AND subject <> '')
    ),
    CONSTRAINT platform_feedback_message_check CHECK (
        message = BTRIM(message) AND message <> ''
    ),
    CONSTRAINT platform_feedback_metadata_object CHECK (
        JSONB_TYPEOF(metadata) = 'object'
    )
);

-- Submission identity/content is immutable after creation. Admin/service may
-- change only status, admin_notes and updated_at. This prevents accidental
-- rewriting of what the user originally submitted.
CREATE OR REPLACE FUNCTION public.enforce_platform_feedback_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'new' OR NEW.admin_notes IS NOT NULL THEN
            RAISE EXCEPTION 'New feedback must start with status=new and no admin notes';
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Platform feedback cannot be hard-deleted by ordinary workflows';
    END IF;

    IF (TO_JSONB(NEW) - ARRAY['status', 'admin_notes', 'updated_at'])
       IS DISTINCT FROM
       (TO_JSONB(OLD) - ARRAY['status', 'admin_notes', 'updated_at']) THEN
        RAISE EXCEPTION 'Feedback submitter, content, rating and metadata are immutable';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
        (OLD.status = 'new' AND NEW.status IN ('in_progress', 'resolved', 'closed'))
        OR (OLD.status = 'in_progress' AND NEW.status IN ('resolved', 'closed'))
        OR (OLD.status = 'resolved' AND NEW.status IN ('in_progress', 'closed'))
    ) THEN
        RAISE EXCEPTION 'Invalid feedback status transition: % -> %', OLD.status, NEW.status;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER platform_feedback_lifecycle_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.platform_feedback
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_platform_feedback_lifecycle();

CREATE TRIGGER platform_feedback_updated_at
    BEFORE UPDATE ON public.platform_feedback
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- User history and admin triage queues.
CREATE INDEX platform_feedback_user_created_idx
    ON public.platform_feedback(user_id, created_at DESC)
    WHERE user_id IS NOT NULL;

CREATE INDEX platform_feedback_status_created_idx
    ON public.platform_feedback(status, created_at DESC);

CREATE INDEX platform_feedback_category_created_idx
    ON public.platform_feedback(category, created_at DESC);

-- 17_rls.sql runs before this final domain table, so RLS/grants are finalized
-- here as well. Raw rows remain service-only; NestJS returns safe DTOs.
ALTER TABLE public.platform_feedback ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.platform_feedback FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_platform_feedback_lifecycle()
FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.platform_feedback TO service_role;

-- No anon/authenticated policy is intentional (default deny).
-- service_role is server-only and retains its server-side access.
