-- ============================================================================
-- Companies & Organization Schema
-- Multi-tenant structure: Company → Branches → Departments → Teams
-- Supports employer/owner management, HR delegation, and org hierarchy
-- ============================================================================
--
-- SUMMARY: Companies & Organization Schema
--
-- TABLES CREATED HERE (6):
--   1. companies
--   2. company_branches
--   3. departments
--   4. teams
--   5. company_members
--   6. company_settings
--
-- TRIGGERS CREATED HERE (6):
--   1. companies_updated_at            -> BEFORE UPDATE ON companies
--   2. company_branches_updated_at     -> BEFORE UPDATE ON company_branches
--   3. departments_updated_at          -> BEFORE UPDATE ON departments
--   4. teams_updated_at                -> BEFORE UPDATE ON teams
--   5. company_members_updated_at     -> BEFORE UPDATE ON company_members
--   6. company_settings_updated_at     -> BEFORE UPDATE ON company_settings
--
-- FUNCTIONS:
--   - No new functions defined in this file.
--   - Referenced function: update_updated_at_column() (used by all triggers)
--   — defined in 03_users_auth.sql
--
-- COUNTS:
--   Tables: 6
--   Triggers: 6
--   Functions defined: 0
--
-- ============================================================================

-- ============================================================================
-- TABLE: companies
-- Purpose: Core tenant entity. Each company is a separate organization
-- posting jobs and hiring candidates.
-- ============================================================================
CREATE TABLE companies (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Company identity
    name                VARCHAR(255) NOT NULL,
    slug                CITEXT NOT NULL UNIQUE, -- URL-friendly name (case-insensitive)
    legal_name          VARCHAR(255),
    registration_number VARCHAR(100) UNIQUE, -- Business registration / tax ID
    
    -- Description
    description         TEXT,
    short_description   VARCHAR(500),
    industry            VARCHAR(100),
    company_size        company_size,
    website             VARCHAR(500),
    linkedin_url        VARCHAR(500),
    twitter_url         VARCHAR(500),
    facebook_url        VARCHAR(500),
    youtube_url         VARCHAR(500),
    
    -- Logo & branding (Supabase Storage paths)
    logo_path           TEXT,
    cover_image_path    TEXT,
    brand_color         VARCHAR(7), -- Hex color #RRGGBB
    
    -- Contact information
    email               CITEXT,
    phone               VARCHAR(50),
    address_line1       VARCHAR(255),
    address_line2       VARCHAR(255),
    city                VARCHAR(100),
    state               VARCHAR(100),
    country             VARCHAR(100),
    postal_code         VARCHAR(20),
    latitude            DECIMAL(10, 7),
    longitude           DECIMAL(10, 7),
    
    -- Ownership & verification
    owner_id            UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    verification_status company_verification_status NOT NULL DEFAULT 'unverified',
    verified_at         TIMESTAMPTZ,
    verification_document_path TEXT,
    
    -- Settings (JSONB for flexible configuration)
    settings            JSONB DEFAULT '{}'::JSONB,
    -- Example: {"timezone": "America/New_York", "date_format": "MM/DD/YYYY",
    --           "language": "en", "auto_approve_jobs": true}
    
    -- Status
    is_active           BOOLEAN NOT NULL DEFAULT true, -- Temporarily disabled vs permanently deleted
    deleted_at          TIMESTAMPTZ,                -- Soft delete (permanent removal)
    
    -- Audit
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- At least one contact method required
    CONSTRAINT companies_contact_check CHECK (email IS NOT NULL OR phone IS NOT NULL),

    -- Brand color should be a hex code like '#RRGGBB'
    CONSTRAINT companies_brand_color_check CHECK (
        brand_color IS NULL OR brand_color ~ '^#[0-9A-Fa-f]{6}$'
    ),

    -- Latitude/Longitude ranges
    CONSTRAINT companies_latitude_check CHECK (
        latitude IS NULL OR (latitude BETWEEN -90 AND 90)
    ),
    CONSTRAINT companies_longitude_check CHECK (
        longitude IS NULL OR (longitude BETWEEN -180 AND 180)
    ),
    
    -- Website URLs should start with http:// or https://
    CONSTRAINT companies_website_check CHECK (
        website IS NULL OR website ~ '^https?://'
    ),
    CONSTRAINT companies_linkedin_check CHECK (
        linkedin_url IS NULL OR linkedin_url ~ '^https?://'
    ),
    CONSTRAINT companies_twitter_check CHECK (
        twitter_url IS NULL OR twitter_url ~ '^https?://'
    ),
    CONSTRAINT companies_facebook_check CHECK (
        facebook_url IS NULL OR facebook_url ~ '^https?://'
    ),
    CONSTRAINT companies_youtube_check CHECK (
        youtube_url IS NULL OR youtube_url ~ '^https?://'
    )
);

CREATE TRIGGER companies_updated_at
    BEFORE UPDATE ON companies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- TABLE: company_branches
-- Purpose: Multi-location support for companies with offices in
-- different cities or countries.
-- ============================================================================
CREATE TABLE company_branches (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL, -- "HQ", "Bangalore Office", etc.
    is_headquarters BOOLEAN NOT NULL DEFAULT false,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    
    -- Location details
    address_line1   VARCHAR(255),
    address_line2   VARCHAR(255),
    city            VARCHAR(100) NOT NULL,
    state           VARCHAR(100),
    country         VARCHAR(100) NOT NULL,
    postal_code     VARCHAR(20),
    latitude        DECIMAL(10, 7),
    longitude       DECIMAL(10, 7),
    
    -- Contact
    phone           VARCHAR(50),
    email           CITEXT,
    timezone        VARCHAR(50) DEFAULT 'Asia/Kolkata',
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT company_branches_identity UNIQUE (id, company_id),
    CONSTRAINT unique_branch_per_company UNIQUE (company_id, name)
);

CREATE TRIGGER company_branches_updated_at
    BEFORE UPDATE ON company_branches
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- TABLE: departments
-- Purpose: Organizational departments within a company.
-- Example: Engineering, Marketing, Sales, HR
-- ============================================================================
CREATE TABLE departments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    head_member_id  UUID, -- Department head (references company_members)
    description     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT departments_identity UNIQUE (id, company_id),
    CONSTRAINT unique_department_per_company UNIQUE (company_id, name)
);

CREATE TRIGGER departments_updated_at
    BEFORE UPDATE ON departments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- TABLE: teams
-- Purpose: Sub-groups within departments for finer organizational structure.
-- ============================================================================
CREATE TABLE teams (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id   UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    lead_member_id  UUID, -- Team lead (references company_members)
    description     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT teams_identity UNIQUE (id, department_id),
    CONSTRAINT unique_team_per_department UNIQUE (department_id, name)
);

CREATE TRIGGER teams_updated_at
    BEFORE UPDATE ON teams
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- TABLE: company_members
-- Purpose: Generalized mapping of company staff (employees, HR, managers)
-- permissions and department/team assignments.
-- ============================================================================
CREATE TABLE company_members (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    branch_id           UUID,
    department_id       UUID,
    team_id             UUID,
    manager_member_id   UUID,

    -- employment metadata
    title               VARCHAR(255),
    employee_code       VARCHAR(100),
    employment_type     employment_type,
    is_primary_hr       BOOLEAN NOT NULL DEFAULT false,

    -- permissions overrides (nullable = inherit from user roles)
    permissions         JSONB,

    -- Status
    -- Invitation create hone par membership inactive rahegi. NestJS acceptance
    -- transaction joined_at set karke is_active=true karegi.
    is_active           BOOLEAN NOT NULL DEFAULT false,
    invited_at          TIMESTAMPTZ,
    invited_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    joined_at           TIMESTAMPTZ,

    -- Optional HR/operational fields (medium-priority)
    left_at             TIMESTAMPTZ, -- When the member left the company
    employment_status    employment_status,
    -- Rejoin flow: former member requests; owner/admin approves separately.
    rejoin_requested_at  TIMESTAMPTZ,
    rejoin_requested_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
    work_email           CITEXT,      -- Company-assigned work email
    work_phone           VARCHAR(50), -- Company-assigned phone number

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Manager cannot be self
    CONSTRAINT company_members_manager_check CHECK (
        manager_member_id IS NULL OR manager_member_id <> id
    ),

    CONSTRAINT company_members_permissions_object CHECK (
        permissions IS NULL OR jsonb_typeof(permissions) = 'object'
    ),
    CONSTRAINT company_members_active_joined CHECK (
        is_active = FALSE OR joined_at IS NOT NULL
    ),
    CONSTRAINT company_members_left_inactive CHECK (
        left_at IS NULL OR is_active = FALSE
    ),
    CONSTRAINT company_members_rejoin_request_state CHECK (
        rejoin_requested_at IS NULL
        OR (is_active = FALSE AND left_at IS NOT NULL AND rejoin_requested_by IS NOT NULL)
    ),
    CONSTRAINT company_members_team_requires_department CHECK (
        team_id IS NULL OR department_id IS NOT NULL
    ),

    CONSTRAINT company_members_company_identity UNIQUE (id, company_id),
    CONSTRAINT company_members_department_identity UNIQUE (id, department_id),
    CONSTRAINT company_members_team_identity UNIQUE (id, team_id),
    CONSTRAINT unique_member_per_company UNIQUE (company_id, user_id),
    CONSTRAINT unique_company_employee_code UNIQUE (company_id, employee_code),
    CONSTRAINT unique_company_work_email UNIQUE (company_id, work_email),

    CONSTRAINT company_members_branch_tenant_fk
        FOREIGN KEY (branch_id, company_id)
        REFERENCES company_branches(id, company_id) ON DELETE RESTRICT,
    CONSTRAINT company_members_department_tenant_fk
        FOREIGN KEY (department_id, company_id)
        REFERENCES departments(id, company_id) ON DELETE RESTRICT,
    CONSTRAINT company_members_team_department_fk
        FOREIGN KEY (team_id, department_id)
        REFERENCES teams(id, department_id) ON DELETE RESTRICT,
    CONSTRAINT company_members_manager_tenant_fk
        FOREIGN KEY (manager_member_id, company_id)
        REFERENCES company_members(id, company_id) ON DELETE RESTRICT
);

CREATE TRIGGER company_members_updated_at
    BEFORE UPDATE ON company_members
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE departments
    ADD CONSTRAINT departments_head_member_fk
        FOREIGN KEY (head_member_id, id)
        REFERENCES company_members(id, department_id) ON DELETE RESTRICT;

ALTER TABLE teams
    ADD CONSTRAINT teams_lead_member_fk
        FOREIGN KEY (lead_member_id, id)
        REFERENCES company_members(id, team_id) ON DELETE RESTRICT;

-- ============================================================================
-- TABLE: company_settings
-- Purpose: Extended company-level configuration separate from the
-- main companies table to keep it lean.
-- ============================================================================
CREATE TABLE company_settings (
    company_id      UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE, -- 1:1 extension of companies
    
    -- Recruitment preferences
    job_approval_required    BOOLEAN NOT NULL DEFAULT false, -- Direct publish by default; owner/admin may enable approval
    auto_shortlist_enabled   BOOLEAN NOT NULL DEFAULT false,
    ai_matching_enabled      BOOLEAN NOT NULL DEFAULT true,
    
    -- Notification defaults
    notify_on_new_application    BOOLEAN NOT NULL DEFAULT true,
    notify_on_shortlist          BOOLEAN NOT NULL DEFAULT true,
    notify_on_interview_booked   BOOLEAN NOT NULL DEFAULT true,
    
    -- Custom fields (JSONB for flexibility)
    custom_config           JSONB DEFAULT '{}'::JSONB,
    
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER company_settings_updated_at
    BEFORE UPDATE ON company_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- INDEXES
-- ============================================================================

-- Companies: Owner lookup (active companies only)
CREATE INDEX idx_companies_owner ON companies(owner_id) WHERE deleted_at IS NULL;

-- Companies: Slug-based routing
-- Note: slug is already UNIQUE, which creates an automatic index.

-- Companies: Verification status (admin dashboard queries)
CREATE INDEX idx_companies_verification ON companies(verification_status) WHERE deleted_at IS NULL;

-- Companies: Industry-based search & filtering
CREATE INDEX idx_companies_industry ON companies(industry) WHERE deleted_at IS NULL;

-- Companies: Location-based queries
CREATE INDEX idx_companies_country_city ON companies(country, city) WHERE deleted_at IS NULL;

-- Company branches: Location search
CREATE INDEX idx_company_branches_company ON company_branches(company_id);
CREATE INDEX idx_company_branches_location ON company_branches(country, city);

-- Company branches: Only one HQ per company (partial unique index)
CREATE UNIQUE INDEX idx_company_branches_unique_hq ON company_branches(company_id) WHERE is_headquarters = true;

-- Departments & teams: Hierarchy queries
CREATE INDEX idx_departments_company ON departments(company_id) WHERE is_active = true;
CREATE INDEX idx_teams_department ON teams(department_id) WHERE is_active = true;

-- Company members: staff management
CREATE INDEX idx_company_members_company ON company_members(company_id) WHERE is_active = true;
CREATE INDEX idx_company_members_user ON company_members(user_id);
CREATE INDEX idx_company_members_branch ON company_members(branch_id);
CREATE INDEX idx_company_members_department ON company_members(department_id);
CREATE INDEX idx_company_members_team ON company_members(team_id);
CREATE INDEX idx_company_members_manager ON company_members(manager_member_id);
-- Medium-priority indexes: employment status and recent leavers
CREATE INDEX idx_company_members_employment_status ON company_members(employment_status) WHERE is_active = true;
CREATE INDEX idx_company_members_rejoin_requested
    ON company_members(company_id, rejoin_requested_at)
    WHERE rejoin_requested_at IS NOT NULL AND is_active = FALSE;

