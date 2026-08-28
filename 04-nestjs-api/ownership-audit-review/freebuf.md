# Ownership Transfer Audit Gap — Independent Review

**Reviewer:** Freebuf (Buffy)
**Date:** 2026-08-27
**Target:** `04-nestjs-api/04-nestjs-api-app/OWNERSHIP-TRANSFER-AUDIT-GAP.md`
**Verdict:** ✅ **OPTION 2 SELECTED — Generic `audit_logs` table already exists; no new migration needed**

---

## 1. Executive Summary

The gap document correctly identifies that `04_companies.sql` has **no dedicated company-ownership-history table**, no ownership-transfer audit function, and no approved `company.ownership.transferred` outbox contract.

However, the gap document's framing — that an "auditable old-owner/new-owner history cannot be honestly implemented" — is **partially incorrect**. The repository **already contains a generic audit mechanism** (`audit_logs` in `13_analytics.sql`) that is purpose-built for exactly this use case and is already approved, table-17-RLS-enabled, immutable, and company-scoped.

**No new table, function, event, or forward migration is required.** The ownership-transfer endpoint should write to the existing `audit_logs` table using `action = 'company.ownership_transferred'` with `old_values`/`new_values` JSONB capturing `owner_id` before and after.

---

## 2. Evidence — What Exists

### 2A. `audit_logs` table (13_analytics.sql, L173-235)

```sql
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID REFERENCES companies(id) ON DELETE SET NULL,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,       -- actor
    actor_service   VARCHAR(100),                                        -- for trusted system actions
    target_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,       -- affected user
    request_id      UUID,
    trace_id        UUID,
    action          VARCHAR(100) NOT NULL,                               -- e.g. 'company.ownership_transferred'
    entity_type     VARCHAR(50) NOT NULL,                                -- e.g. 'company'
    entity_id       UUID,                                                -- e.g. companies.id
    ip_address      INET,
    user_agent      TEXT,
    old_values      JSONB,                                               -- {"owner_id": "uuid-old"}
    new_values      JSONB,                                               -- {"owner_id": "uuid-new"}
    changes         JSONB,                                               -- {"owner_id": {"old": "...", "new": "..."}}
    metadata        JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Properties:**
- `company_id` FK correctly scopes audit to the company
- `user_id` is the actor (old owner performing transfer)
- `target_user_id` is the affected party (new owner)
- `old_values`/`new_values` JSONB captures before/after owner_id
- `changes` JSONB captures field-level diff
- `action` format validated: `^[a-z0-9]+([._-][a-z0-9]+)*$` — `'company.ownership_transferred'` is valid
- Immutable via `reject_auth_audit_row_change()` trigger (L428-447 of `03_users_auth.sql`)

### 2B. RLS status (17_rls.sql, L139)

```sql
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
```

- RLS is **enabled** but **no user-facing SELECT policy** exists
- Access is **service_role only** (L249: "analytics/audit" listed under "Service-only/default-deny")
- This means NestJS writes via `SystemClient` (service_role) and browser never reads audit_logs directly
- This is the correct security posture for compliance audit trails

### 2C. Immutability trigger (03_users_auth.sql, L428-447)

```sql
CREATE OR REPLACE FUNCTION public.reject_auth_audit_row_change()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION '% is append-only; UPDATE/DELETE is not allowed', TG_TABLE_NAME;
END;
$$;
```

Applied to `audit_logs` via the same trigger pattern (the function is shared across `user_security_log`, `login_history`, and `audit_logs`).

### 2D. Indexes (13_analytics.sql, L232-237)

```sql
CREATE INDEX idx_audit_logs_company ON audit_logs(company_id, created_at DESC);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action, created_at DESC);
CREATE INDEX idx_audit_logs_target_user ON audit_logs(target_user_id, created_at DESC)
    WHERE target_user_id IS NOT NULL;
CREATE INDEX idx_audit_logs_request ON audit_logs(request_id) WHERE request_id IS NOT NULL;
CREATE INDEX idx_audit_logs_trace ON audit_logs(trace_id) WHERE trace_id IS NOT NULL;
```

- `idx_audit_logs_company` — efficient company-scoped ownership history queries
- `idx_audit_logs_entity` — entity_type + entity_id lookup (company ownership audit)
- `idx_audit_logs_action` — action-based filtering

**All required query patterns are already indexed.**

---

## 3. Evidence — What Does NOT Exist

| Item | Status | Source |
|------|--------|--------|
| `company_ownership_history` table | ❌ Does not exist | `04_companies.sql` — 6 tables, none ownership-history |
| `company.ownership.transferred` outbox contract | ❌ Does not exist | `contracts/` — zero matches |
| Ownership-transfer audit SQL function | ❌ Does not exist | `04_companies.sql` header: "No new functions defined in this file" |
| Dedicated ownership-transfer trigger | ❌ Does not exist | Only `updated_at` triggers on companies |

---

## 4. Analysis — Is `audit_logs` Sufficient?

### 4A. What the ownership-transfer endpoint needs to audit

From `PHASE-06-API-CATALOG.md` §3B API-COMPANY-004:

```text
Acceptance: non-owner/cross-company requests fail; target is active member;
            exactly one owner remains after commit
```

From `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md`:

```text
- Ownership transfer accepts only an eligible active member,
  leaves exactly one `companies.owner_id`,
  and commits ownership plus required audit/history atomically.
```

The required audit record must capture:
1. **Who** performed the transfer (old owner → `user_id`)
2. **What** company was affected (`company_id` + `entity_type='company'` + `entity_id=companies.id`)
3. **When** it happened (`created_at`)
4. **What changed** (old owner_id → new owner_id in `old_values`/`new_values`/`changes`)
5. **Request/trace correlation** (`request_id`, `trace_id`)

### 4B. `audit_logs` capability mapping

| Required Audit Field | `audit_logs` Column | Status |
|---------------------|---------------------|--------|
| Actor (old owner) | `user_id` | ✅ |
| Affected company | `company_id` | ✅ |
| Affected user (new owner) | `target_user_id` | ✅ |
| Action type | `action = 'company.ownership_transferred'` | ✅ Valid format |
| Entity identity | `entity_type = 'company'`, `entity_id = companies.id` | ✅ |
| Before state | `old_values = {"owner_id": "<old-uuid>"}` | ✅ |
| After state | `new_values = {"owner_id": "<new-uuid>"}` | ✅ |
| Field-level diff | `changes = {"owner_id": {"old": "...", "new": "..."}}` | ✅ |
| Request correlation | `request_id`, `trace_id` | ✅ |
| Timestamp | `created_at` (auto) | ✅ |
| Immutability | Append-only trigger | ✅ |
| Company-scoped query | `idx_audit_logs_company` | ✅ |
| Security | RLS enabled, service_role only | ✅ |

**All requirements are met by the existing `audit_logs` table.**

### 4C. Atomicity concern

The gap document mentions "auditable old-owner/new-owner history cannot be honestly implemented." This is incorrect if the audit INSERT happens **inside the same DB transaction** as the `companies.owner_id` UPDATE.

From `PHASE-05-FINAL-REQUIREMENTS.md` §3:

> Business row, audit/history and outbox event commit atomically.

The NestJS ownership-transfer handler must:
1. BEGIN transaction
2. Lock `companies` row (`SELECT ... FOR UPDATE`)
3. Validate eligibility
4. UPDATE `companies.owner_id`
5. INSERT INTO `audit_logs` (same transaction)
6. COMMIT

This is exactly the pattern used by `profile_change_history` in candidate profile confirmation (`08_candidates.sql`), `application_status_history` in application status changes, and the approved Phase 05 atomic-write boundary.

---

## 5. Does the Gap Document Need Correction?

**Partially.** The gap document's three options are:

| Option | Assessment |
|--------|------------|
| 1. Existing generic audit mechanism | ✅ **This IS the answer** — `audit_logs` exists and is sufficient |
| 2. New forward migration + versioned contract | ❌ **Not needed** — would be overengineering |
| 3. Defer audit and remove acceptance claim | ❌ **Not needed** — audit is already possible |

The gap document failed to identify `audit_logs` (file 13, line 173) as the existing generic audit mechanism. The document should be updated to:

1. Acknowledge that `audit_logs` already satisfies the audit requirement
2. Specify the exact `audit_logs` INSERT pattern for ownership transfer
3. Remove the "cannot be honestly implemented" claim
4. Keep the no-outbox-contract finding correct (no `company.ownership.transferred` event exists)

---

## 6. Outbox Event — Confirmed Missing

The gap document correctly identifies that no `company.ownership.transferred` outbox contract exists. This is accurate:

- Zero matches in `contracts/` directory
- Phase 06 API-COMPANY-004 explicitly states: "Outbox/consumer: none unless an approved contract is later mapped"
- The freeze candidate confirms: "no unapproved event, table, queue or external invitation artifact may be introduced"

**Assessment:** The audit record in `audit_logs` is sufficient for compliance/history. An outbox event for ownership transfer is **optional** and would only be needed if a downstream consumer (e.g., notification, analytics, search re-indexing) requires it. Currently no such consumer is approved.

---

## 7. Option Comparison

| Option | Effort | Risk | Audit Coverage | Recommendation |
|--------|--------|------|----------------|----------------|
| **A: Use existing `audit_logs`** | Zero new migration; NestJS INSERT in same TX | None — table already exists, indexed, RLS'd, immutable | Full | ✅ **RECOMMENDED** |
| B: New `company_ownership_history` table | New migration + RLS + indexes + trigger | Schema proliferation; duplicates `audit_logs` capability | Full but redundant | ❌ NOT RECOMMENDED |
| C: Defer audit entirely | Zero | Compliance gap; no ownership history | None | ❌ NOT RECOMMENDED |

---

## 8. Required NestJS Implementation

The ownership-transfer NestJS handler must include an `audit_logs` INSERT in the same transaction:

```sql
-- Inside the ownership-transfer transaction:
INSERT INTO audit_logs (
    company_id,
    user_id,            -- old owner (actor)
    target_user_id,     -- new owner
    request_id,
    trace_id,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values,
    changes
) VALUES (
    $company_id,
    $old_owner_user_id,
    $new_owner_user_id,
    $request_id,
    $trace_id,
    'company.ownership_transferred',
    'company',
    $company_id,
    jsonb_build_object('owner_id', $old_owner_user_id),
    jsonb_build_object('owner_id', $new_owner_user_id),
    jsonb_build_object('owner_id', jsonb_build_object('old', $old_owner_user_id, 'new', $new_owner_user_id))
);
```

This is a **SystemClient** write (no browser access to `audit_logs`) and must be in the **same DB transaction** as the `companies.owner_id` UPDATE.

---

## 9. Security Review

| Check | Result |
|-------|--------|
| Browser cannot INSERT/UPDATE/DELETE `audit_logs` | ✅ No grant to anon/authenticated; RLS enabled, no user policy |
| Browser cannot SELECT `audit_logs` | ✅ No SELECT grant; listed under "service-only/default-deny" |
| NestJS writes via SystemClient (service_role) | ✅ Correct per Decision-01 |
| Immutability enforced | ✅ `reject_auth_audit_row_change()` trigger |
| PII/secrets protection | ✅ Only UUIDs stored in old_values/new_values; no tokens/paths |
| Company isolation | ✅ `company_id` FK + `idx_audit_logs_company` index |
| Request/trace correlation | ✅ `request_id` + `trace_id` columns |

---

## 10. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| `audit_logs` INSERT failure could roll back entire ownership transfer | LOW | Same transaction — atomicity is correct behavior |
| `audit_logs` table grows unbounded | LOW | Retention policy is a documented operational concern; not a schema issue |
| No outbox event for ownership transfer | LOW | No approved downstream consumer exists; audit_logs is sufficient for current scope |
| Gap document confusion may cause agents to invent a new table | MEDIUM | Gap document must be corrected to reference `audit_logs` |

---

## 11. Final Verdict

| Category | Status |
|----------|--------|
| **Overall** | ✅ **OPTION 2 SELECTED — Generic `audit_logs` table already exists** |
| **New table needed** | ❌ NO |
| **New migration needed** | ❌ NO |
| **New outbox contract needed** | ❌ NO (not for current scope) |
| **NestJS code change needed** | ✅ YES — INSERT into `audit_logs` in same TX as owner_id UPDATE |
| **Gap document accuracy** | ⚠️ INCORRECT — failed to identify existing `audit_logs` |
| **Acceptance criteria** | ✅ "commits ownership plus required audit/history atomically" is satisfiable via `audit_logs` |

**The ownership-transfer audit gap is resolved by the existing `audit_logs` table in `13_analytics.sql`. No forward migration, new table, or outbox contract is required. The gap document should be updated to reflect this finding.**

---

## 12. Files Verified

| File | Purpose | Finding |
|------|---------|---------|
| `04_companies.sql` | Company schema | No ownership-history table; correct |
| `03_users_auth.sql` | User schema + audit triggers | `reject_auth_audit_row_change()` exists and is shared |
| `13_analytics.sql` L173-237 | `audit_logs` table + indexes | ✅ Generic audit mechanism — SUFFICIENT |
| `15_infrastructure.sql` | Outbox + event processing | No ownership-transfer event; correct |
| `17_rls.sql` L139, L249 | RLS + grants for audit_logs | ✅ RLS enabled, service_role only, no user policy |
| `PHASE-05-FINAL-REQUIREMENTS.md` §3 | Atomic write boundary | "Business row, audit/history and outbox event commit atomically" |
| `PHASE-06-API-CATALOG.md` §3B | API-COMPANY-004 | "audit/history" in acceptance; outbox deferred |
| `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md` | Freeze candidate | "commits ownership plus required audit/history atomically" |
| `AGENTS.md` | Authority rules | No invention; report conflicts |
| `contracts/` | Outbox contracts | Zero ownership-transfer matches; confirmed |
