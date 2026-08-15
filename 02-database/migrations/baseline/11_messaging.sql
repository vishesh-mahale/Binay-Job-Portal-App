-- ============================================================================
-- Messaging / Chat Schema
-- Authorized messaging between candidates, HR and recruiters.
-- Supports application/interview conversations, group chats and threading.
-- Live transport (WebSocket/SSE/Supabase Realtime) remains an ADR decision.
--
-- TABLES CREATED HERE (6):
--   conversations, conversation_participants, messages, message_attachments,
--   message_read_receipts, message_reactions
--
-- FUNCTIONS CREATED HERE (7):
--   1. validate_conversation_context()         -> application/interview company scope
--   2. enforce_message_lifecycle()             -> immutable identity + soft delete
--   3. validate_message_attachment()           -> owner/scan/participant checks
--   4. validate_message_participant_action()   -> receipt/reaction membership
--   5. sync_conversation_on_message()          -> preview/count/unread projection
--   6. refresh_conversation_latest_message_preview() -> latest edit/delete preview
--   7. validate_message_sender()               -> sender role + same-thread reply
--
-- WRITE FLOW:
--   NestJS authorizes participant/context, inserts message + optional clean
--   attachments + outbox event in one transaction. Database triggers maintain
--   conversation summary/unread counters. Realtime push happens after commit;
--   database history remains authoritative after reconnect.
--
-- NEXT FILE:
--   12_notifications.sql stores in-app notifications, templates and deliveries.
-- Detailed guide: 11_messaging_Explanation.md
-- ============================================================================

-- ============================================================================
-- TABLE: conversations
-- Purpose: Chat conversation threads. Can be 1:1 or group.
-- ============================================================================
CREATE TABLE conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID REFERENCES companies(id) ON DELETE CASCADE, -- NULL for cross-company
    
    -- Conversation metadata
    subject         VARCHAR(500), -- Optional subject line
    conversation_type conversation_type NOT NULL DEFAULT 'direct',
    application_id  UUID REFERENCES job_applications(id) ON DELETE RESTRICT,
    interview_id    UUID REFERENCES interviews(id) ON DELETE RESTRICT,
    
    -- Who created this conversation
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- Last activity (for sorting)
    last_message_id UUID,
    last_message_at TIMESTAMPTZ,
    last_message_preview TEXT, -- Preview of the latest message (TEXT to avoid truncation)
    last_message_sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    message_count   INTEGER NOT NULL DEFAULT 0 CHECK (message_count >= 0),
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT conversation_context_check CHECK (
        (conversation_type = 'application' AND application_id IS NOT NULL AND interview_id IS NULL)
        OR (conversation_type = 'interview' AND interview_id IS NOT NULL AND application_id IS NULL)
        OR (conversation_type NOT IN ('application', 'interview')
            AND application_id IS NULL AND interview_id IS NULL)
    )
);

CREATE TRIGGER conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- TABLE: conversation_participants
-- Purpose: Maps users to conversations with membership metadata.
-- ============================================================================
CREATE TABLE conversation_participants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    
    -- Participant metadata
    role            participant_role NOT NULL DEFAULT 'member',
    status          participant_status NOT NULL DEFAULT 'active',
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at         TIMESTAMPTZ,  -- If user left the conversation
    is_muted        BOOLEAN NOT NULL DEFAULT false,
    
    -- Read tracking
    last_read_at    TIMESTAMPTZ,
    unread_count    INTEGER NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT conversation_participant_lifecycle_check CHECK (
        (status = 'active' AND left_at IS NULL)
        OR (status <> 'active' AND left_at IS NOT NULL)
    ),
    CONSTRAINT unique_conversation_participant UNIQUE (conversation_id, user_id)
);


-- ============================================================================
-- TABLE: messages
-- Purpose: Individual messages within conversations.
-- ============================================================================
CREATE TABLE messages (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id     UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id           UUID REFERENCES users(id) ON DELETE RESTRICT,
    
    -- Message content
    message_type        message_type NOT NULL DEFAULT 'text',
    body                TEXT,  -- NULL allowed (e.g., file-only messages with no text)
    
    -- Replies / threading
    parent_message_id   UUID REFERENCES messages(id) ON DELETE SET NULL,
    
    -- Metadata
    metadata            JSONB NOT NULL DEFAULT '{}'::JSONB,
    -- For system messages: { "event_type": "interview_scheduled", "interview_id": "..." }
    
    -- Status
    is_edited           BOOLEAN NOT NULL DEFAULT false,
    edited_at           TIMESTAMPTZ,
    edited_by           UUID REFERENCES users(id) ON DELETE SET NULL,
    is_pinned           BOOLEAN NOT NULL DEFAULT false,
    is_deleted          BOOLEAN NOT NULL DEFAULT false,  -- Soft delete
    deleted_for_everyone BOOLEAN NOT NULL DEFAULT false,
    deleted_at          TIMESTAMPTZ,
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Validate: either body is provided OR message has attachments (via message_attachments table)
    CONSTRAINT check_message_content CHECK (
        NULLIF(BTRIM(body), '') IS NOT NULL
        OR
        message_type IN ('image', 'file', 'system', 'interview_invite', 'application_update')
    ),
    CONSTRAINT message_sender_identity_check CHECK (
        sender_id IS NOT NULL
        OR message_type IN ('system', 'interview_invite', 'application_update')
    ),
    CONSTRAINT message_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT message_edit_state CHECK (
        (is_edited = FALSE AND edited_at IS NULL AND edited_by IS NULL)
        OR (is_edited = TRUE AND edited_at IS NOT NULL AND edited_by IS NOT NULL)
    ),
    CONSTRAINT message_delete_state CHECK (
        (is_deleted = FALSE AND deleted_for_everyone = FALSE AND deleted_at IS NULL)
        OR (is_deleted = TRUE AND deleted_at IS NOT NULL)
    )
);


-- ============================================================================
-- TABLE: message_attachments
-- Purpose: Normalized attachment storage for message files.
-- Uses the generic uploaded_documents architecture.
-- Does NOT store public URLs — uses storage_bucket + storage_path instead.
-- Signed URLs are generated at access time via NestJS StorageService.
-- ============================================================================
CREATE TABLE message_attachments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id      UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    document_id     UUID NOT NULL REFERENCES uploaded_documents(id) ON DELETE RESTRICT,
    uploaded_by     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    document_role   document_role NOT NULL DEFAULT 'other',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_message_attachment UNIQUE (message_id, document_id)
);

ALTER TABLE conversations
    ADD CONSTRAINT conversations_last_message_fk
        FOREIGN KEY (last_message_id) REFERENCES messages(id) ON DELETE RESTRICT;


-- ============================================================================
-- TABLE: message_read_receipts
-- Purpose: Track which users have read which messages.
-- ============================================================================
CREATE TABLE message_read_receipts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id      UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    read_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_message_read UNIQUE (message_id, user_id)
);


-- ============================================================================
-- TABLE: message_reactions
-- Purpose: Emoji reactions on messages.
-- ============================================================================
CREATE TABLE message_reactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id      UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reaction        VARCHAR(50) NOT NULL, -- '👍', '❤️', '😄', etc.
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT message_reaction_nonblank CHECK (reaction = BTRIM(reaction) AND reaction <> ''),
    CONSTRAINT unique_message_reaction UNIQUE (message_id, user_id, reaction)
);


-- ============================================================================
-- INDEXES
-- ============================================================================

-- Conversations: User's conversations
CREATE INDEX idx_conversation_participants_user ON conversation_participants(user_id, last_read_at DESC);
CREATE INDEX idx_conversations_recent ON conversations(last_message_at DESC) WHERE last_message_at IS NOT NULL;
CREATE INDEX idx_conversations_application ON conversations(application_id)
    WHERE application_id IS NOT NULL;
CREATE INDEX idx_conversations_interview ON conversations(interview_id)
    WHERE interview_id IS NOT NULL;

-- Messages: Conversation history
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at ASC);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_recent ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_parent ON messages(parent_message_id)
    WHERE parent_message_id IS NOT NULL;

-- Unread tracking
CREATE INDEX idx_conversation_participants_unread ON conversation_participants(conversation_id, user_id)
    WHERE unread_count > 0;

-- Read receipts
CREATE INDEX idx_message_read_receipts_message ON message_read_receipts(message_id);
CREATE INDEX idx_message_read_receipts_user ON message_read_receipts(user_id);

-- Reactions
CREATE INDEX idx_message_reactions_message ON message_reactions(message_id);

-- Message attachments
CREATE INDEX idx_message_attachments_message ON message_attachments(message_id);


-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_conversation_context()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_context_company_id UUID;
BEGIN
    IF NEW.conversation_type = 'application' THEN
        SELECT j.company_id INTO v_context_company_id
          FROM job_applications a
          JOIN jobs j ON j.id = a.job_id
         WHERE a.id = NEW.application_id;
    ELSIF NEW.conversation_type = 'interview' THEN
        SELECT j.company_id INTO v_context_company_id
          FROM interviews i
          JOIN jobs j ON j.id = i.job_id
         WHERE i.id = NEW.interview_id;
    ELSE
        RETURN NEW;
    END IF;

    IF v_context_company_id IS NULL
       OR NEW.company_id IS DISTINCT FROM v_context_company_id THEN
        RAISE EXCEPTION 'Conversation company must match its application/interview context';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER conversations_context_guard
    BEFORE INSERT OR UPDATE OF conversation_type, company_id, application_id, interview_id
    ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION validate_conversation_context();

CREATE OR REPLACE FUNCTION enforce_message_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Messages use soft-delete and cannot be hard-deleted';
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.is_edited OR NEW.edited_at IS NOT NULL OR NEW.edited_by IS NOT NULL
           OR NEW.is_deleted OR NEW.deleted_for_everyone OR NEW.deleted_at IS NOT NULL THEN
            RAISE EXCEPTION 'New message must start in an unedited and active state';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
       OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
       OR NEW.message_type IS DISTINCT FROM OLD.message_type
       OR NEW.parent_message_id IS DISTINCT FROM OLD.parent_message_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Message identity and thread fields are immutable';
    END IF;

    IF OLD.is_deleted AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'Soft-deleted message is immutable';
    END IF;

    IF (NEW.body IS DISTINCT FROM OLD.body OR NEW.metadata IS DISTINCT FROM OLD.metadata)
       AND NEW.is_edited IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Message content changes require edited state and audit fields';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER messages_lifecycle_guard
    BEFORE INSERT OR UPDATE OR DELETE ON messages
    FOR EACH ROW
    EXECUTE FUNCTION enforce_message_lifecycle();

CREATE OR REPLACE FUNCTION validate_message_attachment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_conversation_id UUID;
    v_document_owner UUID;
    v_scan_status security_scan_status;
BEGIN
    SELECT conversation_id INTO v_conversation_id
      FROM messages
     WHERE id = NEW.message_id
       AND is_deleted = FALSE;

    SELECT uploaded_by_user_id, security_scan_status
      INTO v_document_owner, v_scan_status
      FROM uploaded_documents
     WHERE id = NEW.document_id
       AND deleted_at IS NULL;

    IF v_conversation_id IS NULL OR v_document_owner IS NULL THEN
        RAISE EXCEPTION 'Active message/document not found for attachment';
    END IF;

    IF NEW.uploaded_by IS DISTINCT FROM v_document_owner THEN
        RAISE EXCEPTION 'Message attachment uploader must own the uploaded document';
    END IF;

    IF v_scan_status <> 'clean' THEN
        RAISE EXCEPTION 'Message attachment document must pass security scan';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM conversation_participants cp
         WHERE cp.conversation_id = v_conversation_id
           AND cp.user_id = NEW.uploaded_by
           AND cp.status = 'active'
    ) THEN
        RAISE EXCEPTION 'Message attachment uploader must be an active conversation participant';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER message_attachments_guard
    BEFORE INSERT ON message_attachments
    FOR EACH ROW
    EXECUTE FUNCTION validate_message_attachment();

CREATE TRIGGER message_attachments_immutable
    BEFORE UPDATE OR DELETE ON message_attachments
    FOR EACH ROW
    EXECUTE FUNCTION reject_immutable_row_change();

CREATE OR REPLACE FUNCTION validate_message_participant_action()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_message_id UUID;
    v_user_id UUID;
    v_conversation_id UUID;
    v_role participant_role;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_message_id := OLD.message_id;
        v_user_id := OLD.user_id;
    ELSE
        v_message_id := NEW.message_id;
        v_user_id := NEW.user_id;
    END IF;

    IF TG_OP = 'UPDATE'
       AND (NEW.message_id IS DISTINCT FROM OLD.message_id
            OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
        RAISE EXCEPTION 'Message action identity fields are immutable';
    END IF;

    SELECT conversation_id INTO v_conversation_id
      FROM messages
     WHERE id = v_message_id;

    SELECT role INTO v_role
      FROM conversation_participants
     WHERE conversation_id = v_conversation_id
       AND user_id = v_user_id
       AND status = 'active';

    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Message action requires active conversation participation';
    END IF;

    IF TG_TABLE_NAME = 'message_reactions' AND v_role = 'viewer' THEN
        RAISE EXCEPTION 'View-only participant cannot react to messages';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER message_read_receipts_participant_guard
    BEFORE INSERT OR UPDATE ON message_read_receipts
    FOR EACH ROW
    EXECUTE FUNCTION validate_message_participant_action();

CREATE TRIGGER message_reactions_participant_guard
    BEFORE INSERT OR UPDATE OR DELETE ON message_reactions
    FOR EACH ROW
    EXECUTE FUNCTION validate_message_participant_action();

-- ----------------------------------------------------------------------------
-- TRIGGER FUNCTION: sync_conversation_on_message()
-- Purpose: Auto-update conversation metadata when a new message is inserted.
--   - Updates last_message_at, last_message_preview, last_message_sender_id
--   - Increments message_count
--   - Increments unread_count for all participants except sender
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_conversation_on_message()
RETURNS TRIGGER AS $$
DECLARE
    preview_text TEXT;
BEGIN
    -- Build preview text from message body (handle NULL body for file-only messages)
    preview_text := COALESCE(
        NEW.body,
        CASE NEW.message_type
            WHEN 'image' THEN '📷 Image'
            WHEN 'file' THEN '📎 File'
            WHEN 'system' THEN '⚙️ System message'
            ELSE 'New message'
        END
    );
    
    -- Update conversation metadata
    UPDATE conversations
    SET
        last_message_id = CASE
            WHEN last_message_at IS NULL OR NEW.created_at >= last_message_at THEN NEW.id
            ELSE last_message_id
        END,
        last_message_at = GREATEST(COALESCE(last_message_at, NEW.created_at), NEW.created_at),
        last_message_preview = CASE
            WHEN last_message_at IS NULL OR NEW.created_at >= last_message_at
                THEN LEFT(preview_text, 500)
            ELSE last_message_preview
        END,
        last_message_sender_id = CASE
            WHEN last_message_at IS NULL OR NEW.created_at >= last_message_at THEN NEW.sender_id
            ELSE last_message_sender_id
        END,
        message_count = message_count + 1
    WHERE id = NEW.conversation_id;
    
    -- Increment unread_count for all active participants except the sender
    UPDATE conversation_participants
    SET unread_count = unread_count + 1
    WHERE
        conversation_id = NEW.conversation_id
        AND (NEW.sender_id IS NULL OR user_id <> NEW.sender_id)
        AND status = 'active';
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_conversation_on_message
    AFTER INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION sync_conversation_on_message();

CREATE OR REPLACE FUNCTION refresh_conversation_latest_message_preview()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_preview TEXT;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM conversations c
         WHERE c.id = NEW.conversation_id
           AND c.last_message_id = NEW.id
    ) THEN
        RETURN NEW;
    END IF;

    v_preview := CASE
        WHEN NEW.is_deleted THEN 'Message deleted'
        ELSE COALESCE(
            NEW.body,
            CASE NEW.message_type
                WHEN 'image' THEN '📷 Image'
                WHEN 'file' THEN '📎 File'
                WHEN 'system' THEN '⚙️ System message'
                ELSE 'New message'
            END
        )
    END;

    UPDATE conversations
       SET last_message_preview = LEFT(v_preview, 500),
           last_message_sender_id = NEW.sender_id
     WHERE id = NEW.conversation_id
       AND last_message_id = NEW.id;

    RETURN NEW;
END;
$$;

CREATE TRIGGER messages_latest_preview_refresh
    AFTER UPDATE OF body, metadata, is_deleted, deleted_for_everyone ON messages
    FOR EACH ROW
    EXECUTE FUNCTION refresh_conversation_latest_message_preview();


-- ----------------------------------------------------------------------------
-- TRIGGER FUNCTION: validate_message_sender()
-- Purpose: Ensures the sender of a message is an active participant in the
-- conversation. Prevents non-participants from sending messages.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_message_sender()
RETURNS TRIGGER AS $$
DECLARE
    v_participant_status participant_status;
    v_participant_role participant_role;
    v_parent_conversation_id UUID;
BEGIN
    IF NEW.sender_id IS NOT NULL THEN
        -- User-authored messages require active, non-viewer participation.
        SELECT status, role INTO v_participant_status, v_participant_role
        FROM conversation_participants
        WHERE conversation_id = NEW.conversation_id
          AND user_id = NEW.sender_id;

        IF v_participant_status IS NULL THEN
            RAISE EXCEPTION 'User % is not a participant in conversation %', NEW.sender_id, NEW.conversation_id
                USING HINT = 'User must be added to the conversation before sending messages.';
        ELSIF v_participant_status != 'active' THEN
            RAISE EXCEPTION 'User % is not an active participant in conversation % (status: %)',
                NEW.sender_id, NEW.conversation_id, v_participant_status
                USING HINT = 'Only active participants can send messages.';
        ELSIF v_participant_role = 'viewer' THEN
            RAISE EXCEPTION 'View-only participant cannot send messages';
        END IF;
    END IF;

    IF NEW.parent_message_id IS NOT NULL THEN
        SELECT conversation_id INTO v_parent_conversation_id
          FROM messages
         WHERE id = NEW.parent_message_id;

        IF v_parent_conversation_id IS DISTINCT FROM NEW.conversation_id THEN
            RAISE EXCEPTION 'Reply parent must belong to the same conversation';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_message_sender
    BEFORE INSERT ON messages
    FOR EACH ROW
    EXECUTE FUNCTION validate_message_sender();

