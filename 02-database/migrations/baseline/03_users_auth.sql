-- ============================================================================
-- Users & Authorization Schema
--
-- TESTING BASELINE:
-- Production baseline freeze hone se pehle changes ke baad intended Supabase test
-- database ko explicitly reset karke complete 01-18 order mein rerun karna hoga.
-- CREATE TABLE IF NOT EXISTS existing table ko new columns/constraints mein alter nahi karta.
--
-- QUICK SUMMARY:
-- This file creates the core auth + user-management structures for the job portal.
--
-- TABLES CREATED HERE:
--   1. users                  -> main application user profile record
--   2. user_sessions          -> online / real-time session tracking
--   3. user_security_log      -> security events like password/email changes
--   4. login_history          -> successful/failed login audit log
--
-- TRIGGERS CREATED HERE:
--   1. users_updated_at       -> runs BEFORE UPDATE on users
--   2. user_sessions_updated_at -> runs BEFORE UPDATE on user_sessions
--   3. on_auth_user_created   -> runs AFTER INSERT on auth.users
--
-- HOW TRIGGERS WORK:
--   - users_updated_at and user_sessions_updated_at call update_updated_at_column()
--   - on_auth_user_created calls public.handle_new_user()
--   - handle_new_user() creates a matching row in public.users when a new user
--     signs up in Supabase Auth
--
-- FUNCTIONS CREATED HERE:
--   1. update_updated_at_column() -> Updates updated_at timestamp before UPDATE
--   2. handle_new_user()          -> Creates a matching row in public.users after a user signs up in auth.users
--
-- ARCHITECTURE:
--   Next.js → user-facing requests (including login) → NestJS
--   NestJS → Supabase Auth + approved PostgreSQL/Storage adapters
--
-- RULES:
--   1. Next.js privileged database/Auth administration writes nahi karegi.
--   2. NestJS user-facing business API aur Supabase Auth workflow ka owner hai.
--   3. Restricted FastAPI worker sirf approved result/evidence/projection/outbox
--      writes kar sakti hai; woh account authentication manage nahi karegi.
--   4. Normal login/auth client aur privileged admin/service-role client alag honge.
--      Service-role credential browser, logs ya responses mein kabhi expose nahi hogi.
--   5. Login: Next.js → POST /auth/login → NestJS AuthProvider → Supabase Auth.
--   6. AuthProvider interface provider-specific calls ko business modules se isolate karega.
--   7. NestJS authorization primary application boundary hai; RLS defense-in-depth hai.
--
--
-- OBJECT RELATIONSHIPS:
--
-- Table                Trigger                     Function
-- --------------------------------------------------------------------
-- public.users         users_updated_at            update_updated_at_column()
-- public.user_sessions user_sessions_updated_at    update_updated_at_column()
-- auth.users           on_auth_user_created        handle_new_user()
--
--
-- PRIMARY AUTHORIZATION: NestJS Guards (JwtAuthGuard, RolesGuard, @Permissions)
-- SECONDARY AUTHORIZATION: RLS policies
--
-- Our custom `users` table stores APPLICATION-LEVEL user data
-- synced with Supabase Auth's auth.users via the handle_new_user() trigger.
-- Candidate role par 08_candidates.sql ka trigger empty candidate profile banata hai.
-- ============================================================================

-- ============================================================================
-- TABLE: users
-- Purpose: Application-level user profile data.
-- Linked logically with Supabase Auth (auth.users) via the same user ID.
-- Deliberately no ON DELETE CASCADE FK: account deletion controlled soft-delete/
-- retention workflow se hogi; auth row delete karke application history erase nahi karni.
-- Every person in the system is stored here.
-- Each user has ONE role (candidate, employer, hr, admin). Referral is an
-- authenticated-user capability, not a separate account role.
-- stored in the `role` column.
-- Soft-delete enabled for account recovery.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.users (
    -- Primary identifier: MATCHES Supabase Auth's auth.users.id
    -- When a user signs up via Supabase Auth, we create a matching row here
    id                  UUID PRIMARY KEY, -- NOT auto-generated; comes from Supabase Auth
    
    -- Core identity fields
    -- CITEXT = Case-Insensitive TEXT: "ABC@gmail.com" = "abc@gmail.com"
    email               CITEXT NOT NULL UNIQUE,
    
    -- Name split into components for resume/certificate/offer letter generation
    first_name          VARCHAR(100) NOT NULL,
    middle_name         VARCHAR(100),          -- Optional
    last_name           VARCHAR(100) NOT NULL DEFAULT '',
    
    -- Generated column: combines first + middle + last automatically.
    -- This version uses only immutable operations so it is accepted by PostgreSQL.
    display_name        TEXT GENERATED ALWAYS AS (
                            CASE
                                WHEN middle_name IS NULL OR middle_name = '' THEN
                                    CASE
                                        WHEN last_name IS NULL OR last_name = '' THEN first_name
                                        ELSE first_name || ' ' || last_name
                                    END
                                ELSE
                                    CASE
                                        WHEN last_name IS NULL OR last_name = '' THEN first_name || ' ' || middle_name
                                        ELSE first_name || ' ' || middle_name || ' ' || last_name
                                    END
                            END
                        ) STORED,
    
    -- Phone (max 20 chars — enough for international numbers with country code)
    phone               VARCHAR(20), -- NestJS canonical E.164 form store karega, e.g. +919876543210
    
    -- Avatar path in Supabase Storage (NOT a URL)
    -- Store: "avatars/user-uuid/filename.jpg"
    -- Generate URL dynamically via Supabase Storage API
    avatar_path         TEXT,
    
    -- Application-level role (NOT auth role; for our business logic)
    role                public.user_role NOT NULL DEFAULT 'candidate',
    
    -- Application-level status
    -- NOTE: Default is 'pending_verification' because Supabase Auth requires
    -- email verification by default.
    --
    -- VERIFICATION FLOW:
    --   1. Supabase Auth verification message bhejta hai.
    --   2. Next.js callback/token ko NestJS verification endpoint tak bhejti hai.
    --   3. NestJS AuthProvider Supabase verification complete karta hai.
    --   4. Successful verification ke baad NestJS status='active' karta hai aur
    --      user_security_log mein email_verified event append karta hai.
    -- Email template/redirect values environment configuration hain; personal URLs
    -- ya secrets is schema file mein store nahi honge.
    status              public.account_status NOT NULL DEFAULT 'pending_verification',
    
    
    -- Password & security tracking
    last_password_changed_at TIMESTAMPTZ, -- Useful for password expiry policies, security compliance, and forcing password resets later if needed.
    locked_until             TIMESTAMPTZ, -- Useful for temporary lockouts after too many failed login attempts
    
    -- Soft delete support (for GDPR compliance / account deletion requests)
    deleted_at          TIMESTAMPTZ,
    deleted_reason      TEXT,  -- TEXT instead of VARCHAR(500) — no artificial limit
    
    -- Audit trail
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT users_email_trimmed CHECK (email::TEXT = btrim(email::TEXT)),
    -- Yeh constraints input ko automatically trim nahi karti; untrimmed manual
    -- writes reject hongi. NestJS persistence se pehle canonical trim karega.
    CONSTRAINT users_first_name_not_blank CHECK (btrim(first_name) <> ''),
    CONSTRAINT users_first_name_trimmed CHECK (first_name = btrim(first_name)),
    CONSTRAINT users_middle_name_not_blank CHECK (middle_name IS NULL OR btrim(middle_name) <> ''),
    CONSTRAINT users_middle_name_trimmed CHECK (middle_name IS NULL OR middle_name = btrim(middle_name)),
    CONSTRAINT users_last_name_trimmed CHECK (last_name = btrim(last_name)),
    CONSTRAINT users_phone_e164 CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$')
);



-- Create updated_at trigger function (reused across all tables)
-- NOTE:
-- This trigger function is shared across multiple tables
-- (1) users
-- (2) user_sessions
-- Later numbered files bhi isi public function ko updated_at columns ke liye use karti hain.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- Apply trigger safely (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'users_updated_at'
          AND tgrelid = 'public.users'::regclass
    ) THEN
        CREATE TRIGGER users_updated_at
            BEFORE UPDATE ON public.users
            FOR EACH ROW
            EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END
$$;


-- ============================================================================
-- FUNCTION: handle_new_user()
-- Purpose: Automatically creates a row in public.users when a new user
-- signs up via Supabase Auth. This trigger runs after auth.users insert.
-- Uses ON CONFLICT DO NOTHING to handle duplicate trigger fires safely.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER SET search_path = ''
LANGUAGE plpgsql
AS $$
DECLARE
    raw_name TEXT;
    space_pos INTEGER;
    application_role public.user_role;
BEGIN
    IF NEW.email IS NULL OR btrim(NEW.email) = '' THEN
        RAISE EXCEPTION 'Binay Job Portal account requires an email identity';
    END IF;

    -- Normalize whitespace; fallback to email local-part when name metadata is blank.
    raw_name := regexp_replace(
        btrim(COALESCE(
            NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
            NULLIF(NEW.raw_user_meta_data ->> 'name', ''),
            split_part(NEW.email, '@', 1)
        )),
        '\s+', ' ', 'g'
    );

    IF raw_name = '' THEN
        raw_name := split_part(NEW.email, '@', 1);
    END IF;

    -- raw_app_meta_data is server/admin-controlled. Public user metadata se elevated
    -- role trust nahi karna hai. Missing/invalid value safely candidate banegi.
    application_role := CASE NEW.raw_app_meta_data ->> 'application_role'
        WHEN 'candidate' THEN 'candidate'::public.user_role
        WHEN 'employer' THEN 'employer'::public.user_role
        WHEN 'hr' THEN 'hr'::public.user_role
        WHEN 'admin' THEN 'admin'::public.user_role
        ELSE 'candidate'::public.user_role
    END;

    -- Find position of first space to split first_name and last_name
    space_pos := POSITION(' ' IN raw_name);

    INSERT INTO public.users (id, email, first_name, last_name, role, status)
    VALUES (
        NEW.id,
        NEW.email,
        -- First word = first_name
        CASE
            WHEN space_pos > 0 THEN LEFT(LEFT(raw_name, space_pos - 1), 100)
            ELSE LEFT(raw_name, 100)  -- Defensive limit for provider metadata
        END,
        -- Rest after first space = last_name (empty if no space)
        CASE
            WHEN space_pos > 0 THEN LEFT(SUBSTRING(raw_name FROM space_pos + 1), 100)
            ELSE ''
        END,
        application_role,
        CASE
            WHEN NEW.email_confirmed_at IS NOT NULL THEN 'active'::public.account_status
            ELSE 'pending_verification'::public.account_status
        END
    )
    ON CONFLICT (id) DO NOTHING;
    -- Recovery note: same id ki existing public row ko trigger overwrite nahi karega.
    -- Email/role/status mismatch reconciliation dedicated repair workflow karega.
    
    RETURN NEW;
END;
$$;


-- ============================================================================
-- TRIGGER: on_auth_user_created
-- Automatically creates a row in public.users when a new user signs up
-- via Supabase Auth (auth.users insert).
-- This ensures the application-level user profile exists immediately after
-- Supabase Auth creates the authentication record.
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'on_auth_user_created'
          AND tgrelid = 'auth.users'::regclass
    ) THEN
        CREATE TRIGGER on_auth_user_created
            AFTER INSERT ON auth.users
            FOR EACH ROW
            EXECUTE FUNCTION public.handle_new_user();
    END IF;
END
$$;


-- ============================================================================
-- MULTI-ROLE NOTE:
-- Current production scope mein one account = one users.role hai. Inactive future
-- DDL executable baseline mein comment karke nahi rakhenge. Multi-role requirement
-- approve hone par dedicated reviewed migration, data backfill, permission model aur
-- guard changes saath mein banenge.
-- ============================================================================

-- Current baseline mein physical user purge supported nahi hai. Normal application/
-- database roles hard-delete nahi kar sakte. Account deletion/anonymization soft-delete
-- se hogi. Future approved physical-retention purge ke liye dedicated migration ko
-- trigger/procedure/permissions ka explicit controlled path define karna hoga.
CREATE OR REPLACE FUNCTION public.reject_user_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'users rows cannot be hard-deleted; use the approved account retention workflow';
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'users_no_hard_delete'
          AND tgrelid = 'public.users'::regclass
    ) THEN
        CREATE TRIGGER users_no_hard_delete
            BEFORE DELETE ON public.users
            FOR EACH ROW
            EXECUTE FUNCTION public.reject_user_hard_delete();
    END IF;
END
$$;

-- ============================================================================
-- TABLE: user_sessions
-- Purpose: Active user session tracking for real-time features.
-- Used for WebSocket connections and live presence.
-- This is NOT for auth sessions (Supabase Auth handles those).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    
    -- Connection info for real-time features
    is_online       BOOLEAN NOT NULL DEFAULT true,
    last_seen_at    TIMESTAMPTZ,  -- Renamed from last_ping_at (standard naming)
    socket_id       VARCHAR(100), -- WebSocket connection ID for real-time disconnect handling
    device_type     VARCHAR(50),  -- 'desktop', 'mobile', 'tablet'
    user_agent      TEXT,
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'user_sessions_updated_at'
          AND tgrelid = 'public.user_sessions'::regclass
    ) THEN
        CREATE TRIGGER user_sessions_updated_at
            BEFORE UPDATE ON public.user_sessions
            FOR EACH ROW
            EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END
$$;


-- ============================================================================
-- TABLE: user_security_log
-- Purpose: Comprehensive security event logging.
-- Tracks password changes, email changes, account suspension, etc.
-- Append-only: correction naya event hoga, existing audit row update/delete nahi.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_security_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    event_type      public.security_event_type NOT NULL,  -- ENUM: 'password_changed', 'email_changed', etc.
    description     TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}'::JSONB,  -- Never store secrets/raw tokens
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT user_security_log_metadata_object
        CHECK (jsonb_typeof(metadata) = 'object')
);


-- ============================================================================
-- TABLE: login_history
-- Purpose: Audit log for login attempts (successful and failed).
-- Security investigation, account protection aur support audit ke liye use hota hai.
-- Populated via application code (NestJS AuthModule).
-- Append-only; IP/user-agent retention approved privacy policy follow karegi.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.login_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES public.users(id) ON DELETE RESTRICT,
    email           CITEXT NOT NULL,  -- Email used at login time (case-insensitive)
    
    -- Authentication details
    login_type      public.auth_login_type NOT NULL DEFAULT 'email_password',
    auth_provider   VARCHAR(50), -- e.g. google/apple; OAuth/SSO method se separate
    success         BOOLEAN NOT NULL,
    failure_reason  public.login_failure_reason,  -- ENUM instead of free-text VARCHAR
    
    -- Request context
    ip_address      INET,
    user_agent      TEXT,
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT login_history_result_consistency CHECK (
        (success = TRUE AND failure_reason IS NULL)
        OR (success = FALSE AND failure_reason IS NOT NULL)
    ),
    CONSTRAINT login_history_provider_consistency CHECK (
        (login_type IN ('oauth', 'sso') AND auth_provider IS NOT NULL AND btrim(auth_provider) <> '')
        OR (login_type NOT IN ('oauth', 'sso') AND auth_provider IS NULL)
    ),
    CONSTRAINT login_history_auth_provider_trimmed CHECK (
        auth_provider IS NULL OR auth_provider = btrim(auth_provider)
    )
);


-- Security logs and login history immutable audit records hain. Current baseline mein
-- physical purge supported nahi hai. Future approved retention mechanism dedicated
-- migration se explicit privileged purge path aur auditability add karega.
CREATE OR REPLACE FUNCTION public.reject_auth_audit_row_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION '% is append-only; UPDATE/DELETE is not allowed', TG_TABLE_NAME;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'user_security_log_immutable'
          AND tgrelid = 'public.user_security_log'::regclass
    ) THEN
        CREATE TRIGGER user_security_log_immutable
            BEFORE UPDATE OR DELETE ON public.user_security_log
            FOR EACH ROW
            EXECUTE FUNCTION public.reject_auth_audit_row_change();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'login_history_immutable'
          AND tgrelid = 'public.login_history'::regclass
    ) THEN
        CREATE TRIGGER login_history_immutable
            BEFORE UPDATE OR DELETE ON public.login_history
            FOR EACH ROW
            EXECUTE FUNCTION public.reject_auth_audit_row_change();
    END IF;
END
$$;


-- ============================================================================
-- INDEXES — Optimized for performance
-- ============================================================================

-- Users: Status-based queries (admin dashboards)
CREATE INDEX IF NOT EXISTS idx_users_status ON public.users(status) WHERE deleted_at IS NULL;

-- Users: Role-based queries
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role) WHERE deleted_at IS NULL;

-- Users: Created_at for admin dashboard sorting/filtering
CREATE INDEX IF NOT EXISTS idx_users_created_at ON public.users(created_at DESC);

-- Users: Deleted_at for admin queries (show/restore/purge deleted users)
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON public.users(deleted_at)
    WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_locked_until ON public.users(locked_until) WHERE locked_until IS NOT NULL AND deleted_at IS NULL;

-- Phone: Unique partial index — allows multiple NULLs and ignores deleted users
-- Unlike a UNIQUE constraint, this lets multiple users have NULL phone
-- and lets a deleted account's phone be reused by a new user.
-- NestJS input ko E.164 canonical form mein normalize/verify karke hi store karega.
-- Restore par same phone kisi active account ne le liya ho to restore workflow
-- conflict resolve kiye bina purana phone automatically reclaim nahi karega.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique
    ON public.users(phone)
    WHERE phone IS NOT NULL AND deleted_at IS NULL;

-- Email intentionally globally unique hai, deleted users ke liye bhi. Future approved
-- anonymization policy email ko controlled replacement identity mein badal sakti hai;
-- ordinary signup deleted account ka email silently reuse nahi karega.

-- WebSocket disconnect/reconnect handler socket identity se exact session resolve karega.
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_socket_id
    ON public.user_sessions(socket_id)
    WHERE socket_id IS NOT NULL;

-- Sessions: User lookup
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_online_last_seen
    ON public.user_sessions(last_seen_at)
    WHERE is_online = true;

-- Security log: per-user chronological audit trail and event analytics
CREATE INDEX IF NOT EXISTS idx_user_security_log_user_created
    ON public.user_security_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_security_log_event ON public.user_security_log(event_type);
CREATE INDEX IF NOT EXISTS idx_user_security_log_created ON public.user_security_log(created_at DESC);

-- Login history: Security audits
CREATE INDEX IF NOT EXISTS idx_login_history_user_created
    ON public.login_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_history_created ON public.login_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_history_email_created
    ON public.login_history(email, created_at DESC);

-- Auth: Login history by IP address for security monitoring
CREATE INDEX IF NOT EXISTS idx_auth_login_history_ip
    ON public.login_history(ip_address, created_at DESC);

-- Dashboard: System-wide user metrics (admin dashboard)
CREATE INDEX IF NOT EXISTS idx_dashboard_admin_users
    ON public.users(role, status, created_at DESC)
    WHERE deleted_at IS NULL;
