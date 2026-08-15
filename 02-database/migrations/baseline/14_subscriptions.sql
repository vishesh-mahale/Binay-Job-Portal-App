-- ============================================================================
-- Subscriptions & Billing Schema
--
-- Responsibilities:
--   1. Public/admin-managed plans and company subscription history.
--   2. Immutable invoice amounts with controlled payment-state updates.
--   3. Coupon configuration and company/invoice redemption history.
--
-- Boundaries:
--   - Payment-provider integration/webhook contract is not frozen here.
--   - Provider names/IDs are generic normalized references, not hard-coded vendors.
--   - NestJS is the commercial-policy and authorization boundary.
--   - Monetary invoice/redemption amounts use the smallest currency unit.
--   - RLS/grants are finalized in 17_rls.sql.
--
-- Inventory: 6 tables, 3 lifecycle functions, 7 triggers and 17 indexes.
-- ============================================================================

-- ============================================================================
-- TABLE: subscription_plans
-- Purpose: Available subscription tiers with feature access configuration.
-- ============================================================================
CREATE TABLE subscription_plans (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(255) NOT NULL UNIQUE, -- 'free', 'starter', 'pro', 'enterprise'
    description     TEXT,
    
    -- Catalog display prices use major currency units (e.g., INR 999.00).
    -- Final invoice/redemption amounts below use the smallest currency unit.
    price_monthly   DECIMAL(10, 2) NOT NULL DEFAULT 0,
    price_quarterly DECIMAL(10, 2),
    price_yearly    DECIMAL(10, 2),
    currency        currency_code NOT NULL DEFAULT 'INR',
    
    -- Feature access (JSONB for flexible feature gating — feature flags only)
    -- Dedicated columns (below) store commonly queried numeric limits.
    -- JSONB 'features' is reserved for boolean/capability feature flags only.
    -- DO NOT store numeric limits in both places — use dedicated columns for those.
    features        JSONB NOT NULL DEFAULT '{}'::JSONB,
    -- Example:
    -- {
    --   "ai_matching": true,
    --   "resume_parsing": true,
    --   "candidate_search": true,
    --   "analytics": true,
    --   "api_access": false,
    --   "custom_branding": false,
    --   "priority_support": false,
    --   "white_label": false
    -- }
    
    -- Limits (dedicated columns — single source of truth for numeric limits)
    max_jobs_per_month          INTEGER,
    max_active_jobs             INTEGER,
    max_team_members            INTEGER,
    max_candidates_in_pool      INTEGER,
    storage_limit_bytes         BIGINT,
    
    -- Trial
    trial_days                  INTEGER NOT NULL DEFAULT 0,
    
    -- Status
    is_active                   BOOLEAN NOT NULL DEFAULT true,
    is_public                   BOOLEAN NOT NULL DEFAULT true, -- Visible on pricing page
    sort_order                  INTEGER NOT NULL DEFAULT 0,
    
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT subscription_plan_name_nonblank CHECK (name = BTRIM(name) AND name <> ''),
    CONSTRAINT subscription_plan_slug_format CHECK (
        slug = lower(BTRIM(slug)) AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    ),
    CONSTRAINT subscription_plan_price_check CHECK (
        price_monthly >= 0
        AND (price_quarterly IS NULL OR price_quarterly >= 0)
        AND (price_yearly IS NULL OR price_yearly >= 0)
    ),
    CONSTRAINT subscription_plan_features_object CHECK (jsonb_typeof(features) = 'object'),
    CONSTRAINT subscription_plan_limits_check CHECK (
        (max_jobs_per_month IS NULL OR max_jobs_per_month >= 0)
        AND (max_active_jobs IS NULL OR max_active_jobs >= 0)
        AND (max_team_members IS NULL OR max_team_members >= 0)
        AND (max_candidates_in_pool IS NULL OR max_candidates_in_pool >= 0)
        AND (storage_limit_bytes IS NULL OR storage_limit_bytes >= 0)
    ),
    CONSTRAINT chk_trial_days CHECK (trial_days >= 0),
    CONSTRAINT subscription_plan_sort_order_check CHECK (sort_order >= 0)
);

CREATE TRIGGER subscription_plans_updated_at
    BEFORE UPDATE ON subscription_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- TABLE: company_subscriptions
-- Purpose: Current and historical subscriptions for companies.
-- ============================================================================
CREATE TABLE company_subscriptions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    plan_id             UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    
    -- Subscription details
    status              subscription_status NOT NULL DEFAULT 'active',
    billing_interval    billing_interval NOT NULL DEFAULT 'monthly',
    
    -- Provider details. Exact adapter/provider contract is approved separately.
    provider            VARCHAR(50),
    provider_subscription_id VARCHAR(255),
    provider_customer_id    VARCHAR(255),
    
    -- Period
    started_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- Original subscription start (customer lifetime)
    current_period_start    TIMESTAMPTZ NOT NULL,
    current_period_end      TIMESTAMPTZ NOT NULL,
    trial_end               TIMESTAMPTZ,
    canceled_at             TIMESTAMPTZ,
    cancel_at_period_end    BOOLEAN NOT NULL DEFAULT false,
    
    -- Feature overrides
    feature_overrides       JSONB NOT NULL DEFAULT '{}'::JSONB,
    -- Allows admins to override plan features for specific companies
    
    -- Usage tracking (denormalized counters)
    jobs_used_this_month    INTEGER NOT NULL DEFAULT 0,
    storage_used_bytes      BIGINT NOT NULL DEFAULT 0,
    api_calls_this_month    INTEGER NOT NULL DEFAULT 0,
    
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT company_subscription_identity UNIQUE (id, company_id),
    CONSTRAINT company_subscription_period_check CHECK (
        current_period_end > current_period_start
        AND current_period_start >= started_at
    ),
    CONSTRAINT company_subscription_trial_check CHECK (
        (status = 'trialing' AND trial_end IS NOT NULL AND trial_end > started_at)
        OR (status <> 'trialing' AND (trial_end IS NULL OR trial_end > started_at))
    ),
    CONSTRAINT company_subscription_cancellation_check CHECK (
        (status = 'canceled' AND canceled_at IS NOT NULL)
        OR (status <> 'canceled' AND (canceled_at IS NULL OR cancel_at_period_end = TRUE))
    ),
    CONSTRAINT company_subscription_provider_check CHECK (
        (provider IS NULL AND provider_subscription_id IS NULL AND provider_customer_id IS NULL)
        OR (provider IS NOT NULL AND provider = lower(BTRIM(provider))
            AND provider ~ '^[a-z0-9]+([_-][a-z0-9]+)*$'
            AND (provider_subscription_id IS NULL OR NULLIF(BTRIM(provider_subscription_id), '') IS NOT NULL)
            AND (provider_customer_id IS NULL OR NULLIF(BTRIM(provider_customer_id), '') IS NOT NULL))
    ),
    CONSTRAINT company_subscription_feature_overrides_object CHECK (jsonb_typeof(feature_overrides) = 'object'),
    CONSTRAINT company_subscription_usage_check CHECK (
        jobs_used_this_month >= 0 AND storage_used_bytes >= 0 AND api_calls_this_month >= 0
    )
);

CREATE TRIGGER company_subscriptions_updated_at
    BEFORE UPDATE ON company_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- TABLE: invoices
-- Purpose: Billing invoice records.
-- ============================================================================
CREATE TABLE invoices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    subscription_id     UUID,
    
    -- Invoice details
    invoice_number      VARCHAR(100) NOT NULL UNIQUE,
    description         TEXT,
    
    -- Amounts (in smallest currency unit, e.g., cents)
    amount_subtotal     INTEGER NOT NULL, -- Before tax
    amount_tax          INTEGER NOT NULL DEFAULT 0,
    amount_discount     INTEGER NOT NULL DEFAULT 0,
    amount_total        INTEGER NOT NULL, -- After tax and discount
    currency            currency_code NOT NULL DEFAULT 'INR',
    
    -- Status
    status              payment_status NOT NULL DEFAULT 'pending',
    paid_at             TIMESTAMPTZ,
    amount_refunded     INTEGER NOT NULL DEFAULT 0,
    
    -- Provider
    provider            VARCHAR(50),
    provider_invoice_id VARCHAR(255),
    provider_payment_intent_id VARCHAR(255),
    
    -- Period covered
    period_start        DATE,
    period_end          DATE,
    
    -- Billing details
    billing_email       VARCHAR(255),
    billing_name        VARCHAR(255),
    billing_address     JSONB,
    
    -- Line items
    line_items          JSONB NOT NULL DEFAULT '[]'::JSONB,
    -- [{ "description": "Pro Plan - Monthly", "quantity": 1, "unit_amount": 9900 }]
    
    -- Invoice PDF stored in Supabase Storage (consistent with rest of project)
    invoice_pdf_bucket  VARCHAR(100),
    invoice_pdf_path    TEXT,
    
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT invoice_subscription_company_fk
        FOREIGN KEY (subscription_id, company_id)
        REFERENCES company_subscriptions(id, company_id) ON DELETE RESTRICT,
    CONSTRAINT invoice_identity UNIQUE (id, company_id),
    CONSTRAINT invoice_number_nonblank CHECK (
        invoice_number = BTRIM(invoice_number) AND invoice_number <> ''
    ),
    -- Non-negative amount validation
    CONSTRAINT chk_invoice_amount_subtotal CHECK (amount_subtotal >= 0),
    CONSTRAINT chk_invoice_amount_tax CHECK (amount_tax >= 0),
    CONSTRAINT chk_invoice_amount_discount CHECK (amount_discount >= 0),
    CONSTRAINT chk_invoice_amount_total CHECK (amount_total >= 0),
    CONSTRAINT invoice_amount_equation CHECK (
        amount_total = amount_subtotal + amount_tax - amount_discount
    ),
    CONSTRAINT invoice_payment_state CHECK (
        (status IN ('succeeded', 'refunded', 'partially_refunded') AND paid_at IS NOT NULL)
        OR (status IN ('pending', 'failed') AND paid_at IS NULL)
    ),
    CONSTRAINT invoice_refund_amount_check CHECK (
        (status IN ('pending', 'failed', 'succeeded') AND amount_refunded = 0)
        OR (status = 'partially_refunded' AND amount_refunded > 0 AND amount_refunded < amount_total)
        OR (status = 'refunded' AND amount_refunded = amount_total)
    ),
    CONSTRAINT invoice_provider_check CHECK (
        (provider IS NULL AND provider_invoice_id IS NULL AND provider_payment_intent_id IS NULL)
        OR (provider IS NOT NULL AND provider = lower(BTRIM(provider))
            AND provider ~ '^[a-z0-9]+([_-][a-z0-9]+)*$'
            AND (provider_invoice_id IS NULL OR NULLIF(BTRIM(provider_invoice_id), '') IS NOT NULL)
            AND (provider_payment_intent_id IS NULL OR NULLIF(BTRIM(provider_payment_intent_id), '') IS NOT NULL))
    ),
    CONSTRAINT invoice_period_check CHECK (
        (period_start IS NULL AND period_end IS NULL)
        OR (period_start IS NOT NULL AND period_end IS NOT NULL AND period_end >= period_start)
    ),
    CONSTRAINT invoice_billing_email_check CHECK (
        billing_email IS NULL OR billing_email = lower(BTRIM(billing_email))
    ),
    CONSTRAINT invoice_billing_address_object CHECK (
        billing_address IS NULL OR jsonb_typeof(billing_address) = 'object'
    ),
    CONSTRAINT invoice_line_items_array CHECK (jsonb_typeof(line_items) = 'array'),
    CONSTRAINT invoice_pdf_pair CHECK (
        (invoice_pdf_bucket IS NULL AND invoice_pdf_path IS NULL)
        OR (NULLIF(BTRIM(invoice_pdf_bucket), '') IS NOT NULL
            AND NULLIF(BTRIM(invoice_pdf_path), '') IS NOT NULL)
    )
);

CREATE TRIGGER invoices_updated_at
    BEFORE UPDATE ON invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- TABLE: coupons
-- Purpose: Discount coupons for subscription plans.
-- ============================================================================
CREATE TABLE coupons (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(50) NOT NULL UNIQUE,
    description     VARCHAR(500),
    
    -- Discount type
    discount_type       VARCHAR(50) NOT NULL, -- 'percentage', 'fixed_amount'
    discount_percentage DECIMAL(5, 2),
    discount_amount     INTEGER, -- Smallest currency unit for fixed-amount coupons
    discount_currency   currency_code,
    
    -- Restrictions
    max_uses        INTEGER,
    used_count      INTEGER NOT NULL DEFAULT 0,
    max_uses_per_customer INTEGER NOT NULL DEFAULT 1,
    min_amount      INTEGER, -- Smallest currency unit
    min_amount_currency currency_code,
    
    -- Validity
    is_active       BOOLEAN NOT NULL DEFAULT true,
    starts_at       TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    first_purchase_only BOOLEAN NOT NULL DEFAULT false,
    
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT coupon_code_canonical CHECK (
        code = upper(BTRIM(code)) AND code ~ '^[A-Z0-9]+([_-][A-Z0-9]+)*$'
    ),
    CONSTRAINT chk_coupon_discount_type CHECK (discount_type IN ('percentage', 'fixed_amount')),
    CONSTRAINT coupon_discount_definition_check CHECK (
        (discount_type = 'percentage'
            AND discount_percentage > 0 AND discount_percentage <= 100
            AND discount_amount IS NULL AND discount_currency IS NULL)
        OR
        (discount_type = 'fixed_amount'
            AND discount_percentage IS NULL AND discount_amount > 0
            AND discount_currency IS NOT NULL)
    ),
    CONSTRAINT coupon_usage_limit_check CHECK (
        used_count >= 0
        AND (max_uses IS NULL OR (max_uses > 0 AND used_count <= max_uses))
        AND max_uses_per_customer > 0
    ),
    CONSTRAINT coupon_minimum_amount_check CHECK (
        (min_amount IS NULL AND min_amount_currency IS NULL)
        OR (min_amount IS NOT NULL AND min_amount >= 0 AND min_amount_currency IS NOT NULL)
    ),
    CONSTRAINT coupon_fixed_currency_consistency CHECK (
        discount_type <> 'fixed_amount' OR min_amount_currency IS NULL
        OR min_amount_currency = discount_currency
    ),
    CONSTRAINT coupon_validity_check CHECK (
        starts_at IS NULL OR expires_at IS NULL OR expires_at > starts_at
    )
);

CREATE TRIGGER coupons_updated_at
    BEFORE UPDATE ON coupons
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- TABLE: coupon_plan_eligibility
-- Purpose: Optional plan restriction. No rows for a coupon means all active plans.
-- ============================================================================
CREATE TABLE coupon_plan_eligibility (
    coupon_id       UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    plan_id         UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (coupon_id, plan_id)
);


-- ============================================================================
-- TABLE: coupon_redemptions
-- Purpose: Track coupon usage per company/invoice for audit and enforcement.
-- Enables max_uses_per_customer enforcement and analytics.
-- ============================================================================
CREATE TABLE coupon_redemptions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id       UUID NOT NULL REFERENCES coupons(id) ON DELETE RESTRICT,
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    invoice_id      UUID NOT NULL,
    subscription_id UUID,
    
    -- Redemption details
    discount_amount INTEGER NOT NULL CHECK (discount_amount > 0), -- Actual discount in smallest currency unit
    currency        currency_code NOT NULL,
    redeemed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT coupon_redemption_invoice_company_fk
        FOREIGN KEY (invoice_id, company_id)
        REFERENCES invoices(id, company_id) ON DELETE RESTRICT,
    CONSTRAINT coupon_redemption_subscription_company_fk
        FOREIGN KEY (subscription_id, company_id)
        REFERENCES company_subscriptions(id, company_id) ON DELETE RESTRICT,
    -- Prevent duplicate coupon usage on the same invoice
    CONSTRAINT unique_coupon_redemption_per_invoice UNIQUE (invoice_id, coupon_id)
);

CREATE OR REPLACE FUNCTION enforce_company_subscription_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Company subscription history cannot be hard-deleted';
    END IF;

    IF OLD.status IN ('canceled', 'expired') AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'Terminal company subscription is immutable';
    END IF;

    IF NEW.company_id IS DISTINCT FROM OLD.company_id
       OR NEW.plan_id IS DISTINCT FROM OLD.plan_id
       OR NEW.billing_interval IS DISTINCT FROM OLD.billing_interval
       OR NEW.started_at IS DISTINCT FROM OLD.started_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Subscription company/plan/interval/start identity is immutable; create a new subscription for plan changes';
    END IF;

    IF (OLD.provider IS NOT NULL AND NEW.provider IS DISTINCT FROM OLD.provider)
       OR (OLD.provider_subscription_id IS NOT NULL
           AND NEW.provider_subscription_id IS DISTINCT FROM OLD.provider_subscription_id)
       OR (OLD.provider_customer_id IS NOT NULL
           AND NEW.provider_customer_id IS DISTINCT FROM OLD.provider_customer_id) THEN
        RAISE EXCEPTION 'Established subscription provider identity is immutable';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER company_subscriptions_lifecycle_guard
    BEFORE UPDATE OR DELETE ON company_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION enforce_company_subscription_lifecycle();

CREATE OR REPLACE FUNCTION enforce_invoice_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Invoices are financial history and cannot be hard-deleted';
    END IF;

    IF (to_jsonb(NEW) - ARRAY[
            'status', 'paid_at', 'amount_refunded', 'provider', 'provider_invoice_id',
            'provider_payment_intent_id', 'invoice_pdf_bucket', 'invoice_pdf_path', 'updated_at'
        ])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY[
            'status', 'paid_at', 'amount_refunded', 'provider', 'provider_invoice_id',
            'provider_payment_intent_id', 'invoice_pdf_bucket', 'invoice_pdf_path', 'updated_at'
        ]) THEN
        RAISE EXCEPTION 'Invoice company, amounts, currency, period and billing snapshot are immutable';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
        (OLD.status = 'pending' AND NEW.status IN ('succeeded', 'failed'))
        OR (OLD.status = 'failed' AND NEW.status IN ('pending', 'succeeded'))
        OR (OLD.status = 'succeeded' AND NEW.status IN ('partially_refunded', 'refunded'))
        OR (OLD.status = 'partially_refunded' AND NEW.status = 'refunded')
    ) THEN
        RAISE EXCEPTION 'Invalid invoice payment status transition: % -> %', OLD.status, NEW.status;
    END IF;

    IF OLD.provider IS NOT NULL AND (
        NEW.provider IS DISTINCT FROM OLD.provider
        OR (OLD.provider_invoice_id IS NOT NULL AND NEW.provider_invoice_id IS DISTINCT FROM OLD.provider_invoice_id)
        OR (OLD.provider_payment_intent_id IS NOT NULL
            AND NEW.provider_payment_intent_id IS DISTINCT FROM OLD.provider_payment_intent_id)
    ) THEN
        RAISE EXCEPTION 'Established invoice provider identity is immutable';
    END IF;

    IF OLD.invoice_pdf_path IS NOT NULL AND (
        NEW.invoice_pdf_bucket IS DISTINCT FROM OLD.invoice_pdf_bucket
        OR NEW.invoice_pdf_path IS DISTINCT FROM OLD.invoice_pdf_path
    ) THEN
        RAISE EXCEPTION 'Stored invoice PDF identity is immutable';
    END IF;

    IF OLD.paid_at IS NOT NULL AND NEW.paid_at IS DISTINCT FROM OLD.paid_at THEN
        RAISE EXCEPTION 'Invoice paid_at timestamp is immutable once recorded';
    END IF;

    IF NEW.amount_refunded < OLD.amount_refunded THEN
        RAISE EXCEPTION 'Invoice refunded amount cannot decrease';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER invoices_lifecycle_guard
    BEFORE UPDATE OR DELETE ON invoices
    FOR EACH ROW
    EXECUTE FUNCTION enforce_invoice_lifecycle();

CREATE OR REPLACE FUNCTION enforce_coupon_redemption_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_invoice_currency       currency_code;
    v_invoice_discount       INTEGER;
    v_invoice_subscription   UUID;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT currency, amount_discount, subscription_id
          INTO v_invoice_currency, v_invoice_discount, v_invoice_subscription
          FROM invoices
         WHERE id = NEW.invoice_id
           AND company_id = NEW.company_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Coupon redemption invoice does not belong to the company';
        END IF;

        IF NEW.currency IS DISTINCT FROM v_invoice_currency
           OR NEW.discount_amount > v_invoice_discount THEN
            RAISE EXCEPTION 'Coupon redemption currency/amount must match the invoice discount';
        END IF;

        IF NEW.subscription_id IS DISTINCT FROM v_invoice_subscription THEN
            RAISE EXCEPTION 'Coupon redemption subscription must match the invoice subscription';
        END IF;

        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Coupon redemptions are immutable financial history';
END;
$$;

CREATE TRIGGER coupon_redemptions_integrity_guard
    BEFORE INSERT OR UPDATE OR DELETE ON coupon_redemptions
    FOR EACH ROW
    EXECUTE FUNCTION enforce_coupon_redemption_integrity();

CREATE INDEX idx_coupon_redemptions_coupon ON coupon_redemptions(coupon_id);
CREATE INDEX idx_coupon_redemptions_company ON coupon_redemptions(company_id);
CREATE INDEX idx_coupon_redemptions_subscription ON coupon_redemptions(subscription_id)
    WHERE subscription_id IS NOT NULL;
CREATE INDEX idx_coupon_plan_eligibility_plan ON coupon_plan_eligibility(plan_id);


-- ============================================================================
-- INDEXES
-- ============================================================================

-- Subscriptions: Active/expiring queries
CREATE INDEX idx_company_subscriptions_status ON company_subscriptions(status);
CREATE INDEX idx_company_subscriptions_period ON company_subscriptions(current_period_end)
    WHERE status = 'active';
CREATE INDEX idx_company_subscriptions_company ON company_subscriptions(company_id);
CREATE INDEX idx_company_subscriptions_plan ON company_subscriptions(plan_id);
CREATE UNIQUE INDEX uq_company_current_subscription
    ON company_subscriptions(company_id)
    WHERE status IN ('active', 'past_due', 'trialing', 'incomplete');
CREATE UNIQUE INDEX uq_company_subscription_provider_id
    ON company_subscriptions(provider, provider_subscription_id)
    WHERE provider IS NOT NULL AND provider_subscription_id IS NOT NULL;

-- Invoices: Company billing history
CREATE INDEX idx_invoices_company ON invoices(company_id, created_at DESC);
CREATE INDEX idx_invoices_subscription ON invoices(subscription_id) WHERE subscription_id IS NOT NULL;
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE UNIQUE INDEX uq_invoices_provider_invoice
    ON invoices(provider, provider_invoice_id)
    WHERE provider IS NOT NULL AND provider_invoice_id IS NOT NULL;
CREATE UNIQUE INDEX uq_invoices_provider_payment_intent
    ON invoices(provider, provider_payment_intent_id)
    WHERE provider IS NOT NULL AND provider_payment_intent_id IS NOT NULL;

-- Plans
CREATE INDEX idx_subscription_plans_active ON subscription_plans(is_active, sort_order);

-- Coupons
CREATE INDEX idx_coupons_expiry ON coupons(expires_at) WHERE is_active = true AND expires_at IS NOT NULL;

