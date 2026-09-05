-- ============================================================================
-- Option B — Production HR Invite-First Flow Migration (REVISED v8 FINAL)
-- Tables: company_invitations
-- Enums: invitation_status
-- Constraints: State CHECK constraints, role = 'hr' CHECK constraint
-- Indexes: Partial Unique Indexes for Pending Invitations & Single Active Membership
-- Preflight: Safe Duplicate Active Membership Detection & Schema Column Validation Guard
-- Triggers: Idempotent updated_at trigger
-- ============================================================================

-- 1. Create invitation_status enum (Idempotent)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invitation_status') THEN
        CREATE TYPE invitation_status AS ENUM (
            'pending',
            'accepted',
            'expired',
            'revoked'
        );
    END IF;
END $$;

-- 2. Preflight Schema Column Validation Guard
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'company_invitations') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'company_invitations' AND column_name = 'token_hash'
        ) THEN
            RAISE EXCEPTION 'MIGRATION_BLOCKED_SCHEMA_MISMATCH: Existing company_invitations table is missing required token_hash column.';
        END IF;
    END IF;
END $$;

-- 3. Create company_invitations table (Idempotent)
CREATE TABLE IF NOT EXISTS company_invitations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    email               CITEXT NOT NULL,
    invited_by_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    role                user_role NOT NULL DEFAULT 'hr',
    token_hash          VARCHAR(64) NOT NULL UNIQUE,
    status              invitation_status NOT NULL DEFAULT 'pending',
    branch_id           UUID REFERENCES company_branches(id) ON DELETE SET NULL,
    department_id       UUID REFERENCES departments(id) ON DELETE SET NULL,
    team_id             UUID REFERENCES teams(id) ON DELETE SET NULL,
    title               VARCHAR(255),
    permissions         JSONB DEFAULT '{}'::JSONB,
    is_primary_hr       BOOLEAN NOT NULL DEFAULT false,
    expires_at          TIMESTAMPTZ NOT NULL,
    accepted_at         TIMESTAMPTZ,
    accepted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    revoked_at          TIMESTAMPTZ,
    revoked_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    revoke_reason       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Role MUST be strictly 'hr' for company invitations
    CONSTRAINT company_invitations_role_check CHECK (role = 'hr'),

    -- State Combination Check Constraints
    CONSTRAINT company_invitations_accepted_state_check CHECK (
        (status = 'accepted' AND accepted_at IS NOT NULL AND accepted_by_user_id IS NOT NULL) OR
        (status != 'accepted' AND accepted_at IS NULL AND accepted_by_user_id IS NULL)
    ),
    CONSTRAINT company_invitations_revoked_state_check CHECK (
        (status = 'revoked' AND revoked_at IS NOT NULL AND revoked_by_user_id IS NOT NULL) OR
        (status != 'revoked' AND revoked_at IS NULL AND revoked_by_user_id IS NULL)
    )
);

-- 4. Partial Unique Index: Only ONE pending invitation per company & email (Idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_invitations_pending_unique
    ON company_invitations(company_id, LOWER(email))
    WHERE status = 'pending';

-- 5. Single Active Membership Preflight Check (No Silent Deactivation)
DO $$
DECLARE
    dup_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO dup_count
    FROM (
        SELECT user_id FROM company_members WHERE is_active = true GROUP BY user_id HAVING COUNT(*) > 1
    ) dups;

    IF dup_count > 0 THEN
        RAISE EXCEPTION 'MIGRATION_BLOCKED: Detected % user(s) with duplicate active memberships. Please run manual repair before applying unique index.', dup_count;
    END IF;
END $$;

-- Partial Unique Index: Only ONE active membership per user (Idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_members_active_user_unique
    ON company_members(user_id)
    WHERE is_active = true;

-- 6. Updated_at Trigger (Idempotent)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'company_invitations_updated_at') THEN
        CREATE TRIGGER company_invitations_updated_at
            BEFORE UPDATE ON company_invitations
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
