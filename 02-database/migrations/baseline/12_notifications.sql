-- ============================================================================
-- Notifications Schema
--
-- Final responsibility:
--   1. Versioned notification templates and their activation lifecycle.
--   2. Personal/company-scoped user delivery preferences.
--   3. Durable in-app notification records created idempotently.
--   4. Per-channel delivery state/retry metadata and push-device registration.
--
-- Runtime flow:
--   domain transaction + outbox event
--       -> notification worker/NestJS resolves template + preferences
--       -> inserts one idempotent notification
--       -> creates/updates one delivery row per selected external channel
--       -> provider adapter sends email/push/SMS and records result
--       -> authorized realtime transport tells the UI to refresh/read the row
--
-- Important boundaries:
--   - Database rows are the durable truth; realtime delivery is only transport.
--   - New template versions start as drafts. Published versions are immutable.
--   - Template preview, variable validation and safe HTML rendering belong to NestJS.
--   - Provider credentials and provider-specific configuration never belong here.
--   - RLS/grants in 17_rls.sql must block unsafe direct browser writes.
--
-- Inventory: 5 tables, 3 lifecycle functions, 7 triggers and 16 indexes.
-- ============================================================================

-- ============================================================================
-- TABLE: notification_templates
-- Purpose: Reusable notification templates for different event types.
-- Supports multiple channels and languages.
-- ============================================================================
CREATE TABLE notification_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type      VARCHAR(100) NOT NULL,
    -- 'application_received', 'application_status_changed', 'interview_scheduled',
    -- 'interview_reminder', 'resume_parsed', 'candidate_shortlisted', etc.
    
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    locale          VARCHAR(20) NOT NULL DEFAULT 'en',
    version_number  INTEGER NOT NULL DEFAULT 1 CHECK (version_number > 0),
    
    -- Template content per channel (JSONB for flexibility)
    -- Each channel can have subject/body templates with {{placeholders}}
    templates       JSONB NOT NULL DEFAULT '{}'::JSONB,
    allowed_variables JSONB NOT NULL DEFAULT '[]'::JSONB,
    -- Example:
    -- {
    --   "in_app": { "title": "New Application", "body": "{{candidate_name}} applied for {{job_title}}" },
    --   "email": { "subject": "New Application: {{job_title}}", "body": "<p>{{candidate_name}} has applied...</p>" },
    --   "push": { "title": "New Application", "body": "{{candidate_name}} applied" },
    --   "sms": { "body": "New application from {{candidate_name}}" }
    -- }
    
    -- Whether this template is active
    is_active       BOOLEAN NOT NULL DEFAULT false,
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    activated_by    UUID REFERENCES users(id) ON DELETE RESTRICT,
    activated_at    TIMESTAMPTZ,
    retired_at      TIMESTAMPTZ,
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT notification_template_event_type_format CHECK (
        event_type = lower(BTRIM(event_type))
        AND event_type ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
    ),
    CONSTRAINT notification_template_name_nonblank CHECK (name = BTRIM(name) AND name <> ''),
    CONSTRAINT notification_template_locale_format CHECK (
        locale = BTRIM(locale) AND locale ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'
    ),
    CONSTRAINT notification_template_content_object CHECK (jsonb_typeof(templates) = 'object'),
    CONSTRAINT notification_template_variables_array CHECK (jsonb_typeof(allowed_variables) = 'array'),
    CONSTRAINT notification_template_version_identity UNIQUE (event_type, locale, version_number),
    CONSTRAINT notification_template_activation_state CHECK (
        (activated_at IS NULL AND activated_by IS NULL AND is_active = FALSE AND retired_at IS NULL)
        OR
        (activated_at IS NOT NULL AND activated_by IS NOT NULL AND is_active = TRUE AND retired_at IS NULL)
        OR
        (activated_at IS NOT NULL AND activated_by IS NOT NULL AND is_active = FALSE AND retired_at IS NOT NULL)
    )
);

CREATE TRIGGER notification_templates_updated_at
    BEFORE UPDATE ON notification_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- TABLE: user_notification_preferences
-- Purpose: Per-user notification channel and event preferences.
-- ============================================================================
CREATE TABLE user_notification_preferences (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id      UUID REFERENCES companies(id) ON DELETE CASCADE, -- NULL = personal preference
    
    -- Global preferences
    email_enabled    BOOLEAN NOT NULL DEFAULT true,
    push_enabled     BOOLEAN NOT NULL DEFAULT true,
    sms_enabled      BOOLEAN NOT NULL DEFAULT false,
    in_app_enabled   BOOLEAN NOT NULL DEFAULT true,
    
    -- Quiet hours
    quiet_hours_start   TIME,
    quiet_hours_end     TIME,
    quiet_hours_timezone VARCHAR(50),
    
    -- Per-event-type overrides (JSONB)
    event_preferences   JSONB NOT NULL DEFAULT '{}'::JSONB,
    -- Example: { "application_received": { "email": true, "push": false },
    --            "marketing": { "email": false, "push": false } }
    
    -- Notification delivery digest
    digest_frequency    VARCHAR(50) NOT NULL DEFAULT 'instant',
    last_digest_sent_at TIMESTAMPTZ,
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT chk_digest_frequency CHECK (digest_frequency IN ('instant', 'hourly', 'daily', 'weekly')),
    CONSTRAINT notification_preferences_event_object CHECK (jsonb_typeof(event_preferences) = 'object'),
    CONSTRAINT notification_preferences_quiet_hours_check CHECK (
        (quiet_hours_start IS NULL AND quiet_hours_end IS NULL AND quiet_hours_timezone IS NULL)
        OR
        (quiet_hours_start IS NOT NULL AND quiet_hours_end IS NOT NULL
         AND NULLIF(BTRIM(quiet_hours_timezone), '') IS NOT NULL)
    )
);

CREATE TRIGGER user_notification_preferences_updated_at
    BEFORE UPDATE ON user_notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- TABLE: notifications
-- Purpose: Individual notification records sent to users.
-- ============================================================================
CREATE TABLE notifications (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key     VARCHAR(255) NOT NULL UNIQUE,
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id          UUID REFERENCES companies(id) ON DELETE CASCADE,
    template_id         UUID REFERENCES notification_templates(id) ON DELETE RESTRICT,
    
    -- Entity reference (for frontend navigation — more robust than parsing URLs)
    entity_type         VARCHAR(50),  -- 'application', 'interview', 'message', 'job', 'resume', 'company'
    entity_id           UUID,         -- UUID of the referenced entity
    
    -- Notification content
    title               VARCHAR(500) NOT NULL,
    body                TEXT,
    image_bucket        VARCHAR(100), -- Supabase Storage bucket name (e.g., 'notification-images')
    image_path          TEXT,         -- Path within the bucket (signed URLs generated when needed)
    action_url          TEXT, -- Deep link URL
    CONSTRAINT notifications_action_url_check CHECK (
        action_url IS NULL OR action_url ~ '^(https?://|/[A-Za-z0-9])'
    ),
    action_type         VARCHAR(50),  -- 'open_application', 'open_interview', 'open_chat', 'open_job', 'open_profile', etc.
    
    -- Classification
    event_type          VARCHAR(100) NOT NULL,
    category            VARCHAR(50) NOT NULL DEFAULT 'general',
    -- 'application', 'interview', 'message', 'job', 'system', 'marketing', 'referral'
    
    priority            notification_priority NOT NULL DEFAULT 'normal',
    
    -- Channel delivery status
    channels            JSONB NOT NULL DEFAULT '{"in_app": true}'::JSONB,
    delivery_status     JSONB NOT NULL DEFAULT '{}'::JSONB,
    -- Example: { "email": "sent", "push": "pending", "in_app": "delivered" }
    
    -- Read status (for in-app)
    is_read             BOOLEAN NOT NULL DEFAULT false,
    read_at             TIMESTAMPTZ,
    is_archived         BOOLEAN NOT NULL DEFAULT false,
    
    -- Soft delete (retains audit trail while allowing users to permanently delete)
    deleted_at          TIMESTAMPTZ,
    
    -- Notification expiry (e.g., interview reminders after the interview, OTPs, temporary alerts)
    expires_at          TIMESTAMPTZ,
    
    -- Grouping (for notification stacking)
    group_key           VARCHAR(100), -- e.g., "job_{{job_id}}"
    group_count         INTEGER NOT NULL DEFAULT 1 CHECK (group_count > 0),
    
    -- For scheduling future notifications
    scheduled_at        TIMESTAMPTZ,
    sent_at             TIMESTAMPTZ,
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT notification_idempotency_key_nonblank CHECK (
        idempotency_key = BTRIM(idempotency_key) AND idempotency_key <> ''
    ),
    CONSTRAINT notification_title_nonblank CHECK (title = BTRIM(title) AND title <> ''),
    CONSTRAINT notification_entity_pair CHECK (
        (entity_type IS NULL AND entity_id IS NULL)
        OR (NULLIF(BTRIM(entity_type), '') IS NOT NULL AND entity_id IS NOT NULL)
    ),
    CONSTRAINT notification_image_pair CHECK (
        (image_bucket IS NULL AND image_path IS NULL)
        OR (NULLIF(BTRIM(image_bucket), '') IS NOT NULL AND NULLIF(BTRIM(image_path), '') IS NOT NULL)
    ),
    CONSTRAINT notification_channels_object CHECK (jsonb_typeof(channels) = 'object'),
    CONSTRAINT notification_delivery_status_object CHECK (jsonb_typeof(delivery_status) = 'object'),
    CONSTRAINT notification_read_state CHECK (
        (is_read = FALSE AND read_at IS NULL)
        OR (is_read = TRUE AND read_at IS NOT NULL)
    ),
    CONSTRAINT notification_expiry_check CHECK (expires_at IS NULL OR expires_at > created_at)
);


-- ============================================================================
-- TABLE: notification_delivery_log
-- Purpose: Current delivery state and retry metadata for each notification channel.
-- Individual retry attempts are operational logs/telemetry, not separate rows here.
-- ============================================================================
CREATE TABLE notification_delivery_log (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id     UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    channel             notification_channel NOT NULL,
    
    -- Delivery attempt details
    status              VARCHAR(50) NOT NULL,
    provider_message_id VARCHAR(255), -- ID from email/push provider
    provider_name       VARCHAR(100), -- 'Firebase', 'SendGrid', 'AWS SES', 'Twilio', 'OneSignal', etc.
    error_message       TEXT,
    attempt_count       INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
    last_attempt_at     TIMESTAMPTZ,
    next_retry_at       TIMESTAMPTZ, -- For background worker retry scheduling
    
    -- Engagement tracking
    opened_at           TIMESTAMPTZ,
    clicked_at          TIMESTAMPTZ,
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT chk_delivery_status CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced', 'opened', 'clicked')),
    CONSTRAINT notification_delivery_channel_unique UNIQUE (notification_id, channel),
    CONSTRAINT notification_delivery_engagement_order CHECK (
        clicked_at IS NULL OR (opened_at IS NOT NULL AND clicked_at >= opened_at)
    ),
    CONSTRAINT notification_delivery_retry_state CHECK (
        next_retry_at IS NULL OR status IN ('pending', 'failed')
    ),
    CONSTRAINT notification_delivery_failure_state CHECK (
        status NOT IN ('failed', 'bounced') OR NULLIF(BTRIM(error_message), '') IS NOT NULL
    )
);

CREATE TRIGGER notification_delivery_log_updated_at
    BEFORE UPDATE ON notification_delivery_log
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- TABLE: device_tokens
-- Purpose: Push notification device tokens for mobile/web push.
-- ============================================================================
CREATE TABLE device_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token           TEXT NOT NULL,
    platform        VARCHAR(50) NOT NULL,
    device_name     VARCHAR(255),
    app_version     VARCHAR(50),  -- App version at time of token registration (for push diagnostics)
    os_version      VARCHAR(50),  -- OS version (e.g., 'iOS 17.4', 'Android 14', 'Windows 11')
    is_active       BOOLEAN NOT NULL DEFAULT true,
    last_used_at    TIMESTAMPTZ,
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_device_token UNIQUE (token),
    CONSTRAINT device_token_nonblank CHECK (token = BTRIM(token) AND token <> ''),
    CONSTRAINT chk_platform CHECK (
        platform = BTRIM(platform) AND platform IN ('ios', 'android', 'web', 'electron')
    )
);

CREATE TRIGGER device_tokens_updated_at
    BEFORE UPDATE ON device_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION enforce_notification_template_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.is_active
           OR NEW.activated_by IS NOT NULL
           OR NEW.activated_at IS NOT NULL
           OR NEW.retired_at IS NOT NULL THEN
            RAISE EXCEPTION 'New notification template versions must be inserted as drafts and activated separately';
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.activated_at IS NOT NULL THEN
            RAISE EXCEPTION 'Published notification template versions cannot be deleted';
        END IF;
        RETURN OLD;
    END IF;

    IF OLD.activated_at IS NOT NULL THEN
        IF OLD.is_active = TRUE AND NEW.is_active = FALSE THEN
            IF (to_jsonb(NEW) - ARRAY['is_active', 'retired_at', 'updated_at'])
               IS DISTINCT FROM
               (to_jsonb(OLD) - ARRAY['is_active', 'retired_at', 'updated_at']) THEN
                RAISE EXCEPTION 'Published template content/version identity is immutable';
            END IF;
            NEW.retired_at := COALESCE(NEW.retired_at, NOW());
            RETURN NEW;
        END IF;

        RAISE EXCEPTION 'Published/retired template version is immutable; create a new version';
    END IF;

    IF NEW.is_active THEN
        IF NEW.activated_by IS NULL THEN
            RAISE EXCEPTION 'Template activation requires activated_by';
        END IF;
        NEW.activated_at := NOW();
        NEW.retired_at := NULL;
    ELSIF NEW.activated_at IS NOT NULL OR NEW.activated_by IS NOT NULL OR NEW.retired_at IS NOT NULL THEN
        RAISE EXCEPTION 'Draft template cannot contain activation/retirement fields';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER notification_templates_lifecycle_guard
    BEFORE INSERT OR UPDATE OR DELETE ON notification_templates
    FOR EACH ROW
    EXECUTE FUNCTION enforce_notification_template_lifecycle();

CREATE OR REPLACE FUNCTION enforce_notification_identity_and_soft_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Notifications use soft-delete and cannot be hard-deleted';
    END IF;

    IF OLD.deleted_at IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'Soft-deleted notification is immutable';
    END IF;

    IF (to_jsonb(NEW) - ARRAY[
            'channels', 'delivery_status', 'is_read', 'read_at', 'is_archived',
            'deleted_at', 'group_count', 'scheduled_at', 'sent_at'
        ])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY[
            'channels', 'delivery_status', 'is_read', 'read_at', 'is_archived',
            'deleted_at', 'group_count', 'scheduled_at', 'sent_at'
        ]) THEN
        RAISE EXCEPTION 'Notification recipient/content/context identity is immutable';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER notifications_identity_guard
    BEFORE UPDATE OR DELETE ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION enforce_notification_identity_and_soft_delete();

CREATE OR REPLACE FUNCTION enforce_notification_delivery_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.notification_id IS DISTINCT FROM OLD.notification_id
       OR NEW.channel IS DISTINCT FROM OLD.channel
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Notification delivery identity is immutable';
    END IF;

    IF NEW.attempt_count < OLD.attempt_count THEN
        RAISE EXCEPTION 'Notification delivery attempt count cannot decrease';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER notification_delivery_identity_guard
    BEFORE UPDATE ON notification_delivery_log
    FOR EACH ROW
    EXECUTE FUNCTION enforce_notification_delivery_identity();


-- ============================================================================
-- INDEXES
-- ============================================================================

-- Notifications: User's inbox
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC)
    WHERE is_archived = false;
CREATE INDEX idx_notifications_unread ON notifications(user_id, created_at DESC)
    WHERE is_read = false AND is_archived = false;
CREATE INDEX idx_notifications_event ON notifications(event_type);
CREATE INDEX idx_notifications_scheduled ON notifications(scheduled_at)
    WHERE scheduled_at IS NOT NULL AND sent_at IS NULL;

-- Notifications: Entity reference (for frontend lookups)
CREATE INDEX idx_notifications_entity ON notifications(entity_type, entity_id)
    WHERE entity_type IS NOT NULL AND entity_id IS NOT NULL;

-- Notifications: Expiry and soft delete cleanup
CREATE INDEX idx_notifications_expires ON notifications(expires_at)
    WHERE expires_at IS NOT NULL;
CREATE INDEX idx_notifications_deleted ON notifications(deleted_at)
    WHERE deleted_at IS NOT NULL;

-- Notification templates
CREATE INDEX idx_notification_templates_event ON notification_templates(event_type)
    WHERE is_active = true;
CREATE UNIQUE INDEX uq_notification_template_active_locale
    ON notification_templates(event_type, locale)
    WHERE is_active = true;

-- User preferences
CREATE INDEX idx_user_notif_prefs_user ON user_notification_preferences(user_id);
CREATE UNIQUE INDEX uq_user_personal_notification_preferences
    ON user_notification_preferences(user_id)
    WHERE company_id IS NULL;
CREATE UNIQUE INDEX uq_user_company_notification_preferences
    ON user_notification_preferences(user_id, company_id)
    WHERE company_id IS NOT NULL;

-- Delivery log
CREATE INDEX idx_notification_delivery_log_notif ON notification_delivery_log(notification_id);
CREATE INDEX idx_notification_delivery_log_status ON notification_delivery_log(status);
CREATE INDEX idx_notification_delivery_log_retry ON notification_delivery_log(next_retry_at)
    WHERE next_retry_at IS NOT NULL AND status IN ('failed', 'pending');

-- Device tokens
CREATE INDEX idx_device_tokens_user ON device_tokens(user_id) WHERE is_active = true;

