# Membership Rejoin — Approval Contract Independent Review

**Reviewer:** Freebuf (Buffy)
**Date:** 2026-08-27
**Target:** `04-nestjs-api/membership-rejoin-review/REJOIN-APPROVAL-CONTRACT-QUESTION.md`
**Verdict:** ⚠️ **PASS WITH REQUIRED CONTRACT/MIGRATION**

---

## 1. Executive Summary

D6 (approved decision) clearly states: **"Previously associated user rejoin request kar sakta hai, lekin membership activation owner/admin approval ke baad hogi."**

This is a **two-step flow**: member requests → owner/admin approves. The current frozen endpoint (`POST /api/v1/companies/:companyId/membership/rejoin`) has **no request DTO and no target member ID**, making it impossible to distinguish who is requesting and who is approving. The database has **no pending-rejoin state column**.

**Option 1 (Two-Step Request + Approval)** is the correct match for D6 but requires a minor forward migration. **Option 2 (Owner/Admin-Only Reactivation)** is implementable with zero migration but changes D6's "member requests" wording. **Option 3 (Self-Service)** is rejected per D6.

---

## 2. D6 Exact Wording — Source Evidence

**PHASE-09-B-API-CONTRACT-DECISIONS-HINGLISH.md, §D6:**

> "Previously associated user rejoin request kar sakta hai, lekin membership activation owner/admin approval ke baad hogi. Existing `company_members` row hi reactivate hogi; duplicate row nahi banegi. Original `joined_at` audit history ke liye preserve hoga aur `updated_at` badlega."

**PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md, Approved boundaries:**

> "Rejoin reactivates the existing membership row after owner/admin approval."

**PHASE-09-B-DTO-FIELD-MAPPING-WORKSHEET.md:**

> "Rejoin reactivates the existing row; no duplicate membership row is created."

### D6 Breakdown

| D6 Claim | Meaning | Schema Support |
|----------|---------|----------------|
| "Previously associated user rejoin request kar sakta hai" | Member initiates a rejoin request | ❌ No `rejoin_requested_at` column to store this state |
| "membership activation owner/admin approval ke baad hogi" | Approval is a separate step before activation | ❌ No approval-status column; frozen endpoint has no `memberId` path param |
| "Existing company_members row hi reactivate hogi" | Reactivate, don't create new row | ✅ `is_active = true` + `left_at = NULL` |
| "Original joined_at preserve hoga" | `joined_at` is not overwritten | ✅ Column exists; update only touches `updated_at` |
| "updated_at badlega" | Audit timestamp changes | ✅ `updated_at` trigger exists |

**Conflict identified:** D6 describes a two-step request+approval flow, but the database has no durable state to store the "request" between Step 1 and Step 2.

---

## 3. Database Evidence — `company_members` Table

**Source:** `04_companies.sql`, L234-283

```sql
CREATE TABLE company_members (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- ... FK fields ...
    is_active           BOOLEAN NOT NULL DEFAULT false,
    invited_at          TIMESTAMPTZ,
    invited_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    joined_at           TIMESTAMPTZ,
    left_at             TIMESTAMPTZ,    -- When the member left the company
    employment_status   employment_status,
    -- ...
);
```

**Columns relevant to rejoin:**

| Column | Type | Purpose | Rejoin Use |
|--------|------|---------|------------|
| `is_active` | BOOLEAN | Membership active flag | Set `true` on approval |
| `joined_at` | TIMESTAMPTZ | Original join timestamp | Preserve on rejoin |
| `left_at` | TIMESTAMPTZ | When member left | Set `NULL` on approval |
| `employment_status` | ENUM | Lifecycle state | Set `'active'` on approval |

**What's MISSING for two-step rejoin:**

| Missing Item | Impact |
|--------------|--------|
| `rejoin_requested_at TIMESTAMPTZ` | Cannot store when member requested rejoin |
| `rejoin_requested_by UUID` | Cannot record who initiated (self vs admin) |
| `rejoin_approval_status ENUM` | Cannot track pending/approved/rejected state |

---

## 4. Frozen Endpoint Analysis

**PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md, endpoint catalog:**

```
POST /api/v1/companies/:companyId/membership/rejoin  → no request DTO → MembershipSummaryDto
```

**Problems:**

| Problem | Impact |
|---------|--------|
| No `memberId` path parameter | Cannot identify which member is rejoining (self vs other) |
| No request DTO | Cannot capture intent (request vs approve) |
| Single endpoint | Cannot separate two steps into distinct commands |
| Actor ambiguity | Is this the member requesting? Or admin approving? |

**Phase 06 API-COMPANY-003** (membership commands) says:

> "Actor: company owner/admin"

But D6 says the **member** initiates the request. This is a direct conflict between the frozen endpoint actor and the approved decision.

---

## 5. Option Comparison

### Option 1: Two-Step Commands (D6 Verbatim)

**Flow:**
1. Member calls `POST /companies/:companyId/membership/rejoin-request` → sets `rejoin_requested_at = NOW()`
2. Owner/admin calls `POST /companies/:companyId/members/:memberId/approve-rejoin` → reactivates row

**Schema requirements:**
- `ALTER TABLE company_members ADD COLUMN rejoin_requested_at TIMESTAMPTZ;`
- Optional: `ALTER TABLE company_members ADD COLUMN rejoin_requested_by UUID REFERENCES users(id);`

**D6 alignment:** ✅ EXACT — member requests, owner/admin approves
**Migration required:** ✅ YES — 1 forward migration
**Risk:** LOW — single nullable column addition

### Option 2: Owner/Admin-Only Reactivation

**Flow:**
1. Owner/admin calls `POST /companies/:companyId/members/:memberId/reactivate`
2. Row is reactivated atomically

**Schema requirements:** NONE

**D6 alignment:** ⚠️ PARTIAL — removes "member requests" from D6
**Migration required:** ❌ NO
**Risk:** MEDIUM — changes approved decision wording; member has no visibility into pending rejoin status

### Option 3: Self-Service Rejoin

**Flow:**
1. Member calls `POST /companies/:companyId/membership/rejoin`
2. Row is reactivated immediately

**D6 alignment:** ❌ CONFLICT — D6 explicitly requires owner/admin approval
**Verdict:** REJECTED

---

## 6. Option 1 vs Option 2 — Detailed Comparison

| Criteria | Option 1 (Two-Step) | Option 2 (Admin-Only) |
|----------|---------------------|----------------------|
| D6 verbatim match | ✅ EXACT | ⚠️ Changes "member requests" wording |
| Schema change | 1 migration (`rejoin_requested_at`) | None |
| Member visibility | ✅ Member sees "request pending" state | ❌ Member has no status feedback |
| Audit trail | ✅ `rejoin_requested_at` + `rejoin_requested_by` | ⚠️ Only audit_logs entry |
| Owner/admin UX | Separate approve endpoint | Single reactivate endpoint |
| Complexity | Two endpoints, one column | One endpoint, zero migration |
| Security | Member can only request for self | Admin controls all reactivation |

---

## 7. What Must Change If Option 1 Is Selected

### 7A. Forward Migration

```sql
-- 19_membership_rejoin_request.sql
-- Adds rejoin request tracking to company_members

ALTER TABLE company_members
    ADD COLUMN rejoin_requested_at TIMESTAMPTZ,
    ADD COLUMN rejoin_requested_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Index for pending rejoin queries
CREATE INDEX idx_company_members_rejoin_requested
    ON company_members(company_id, rejoin_requested_at)
    WHERE rejoin_requested_at IS NOT NULL AND is_active = FALSE;
```

### 7B. API Contract Changes

| Endpoint | Actor | Purpose |
|----------|-------|---------|
| `POST /companies/:companyId/membership/rejoin-request` | Member (self) | Sets `rejoin_requested_at = NOW()`, `rejoin_requested_by = auth.uid()` |
| `POST /companies/:companyId/members/:memberId/approve-rejoin` | Owner/admin | Sets `is_active = true`, `left_at = NULL`, `employment_status = 'active'`, `rejoin_requested_at = NULL` |

### 7C. Request DTOs

**Rejoin Request (Step 1):**
```typescript
// No request body needed — identity comes from JWT
// Validation: user must have a deactivated company_members row
```

**Approve Rejoin (Step 2):**
```typescript
// No request body needed — memberId from path param
// Validation: rejoin_requested_at IS NOT NULL, actor is owner/admin
```

### 7D. Validation Rules

**Step 1 (Member Request):**
- `auth.uid()` must have a `company_members` row with `is_active = FALSE` AND `company_id = :companyId`
- `rejoin_requested_at` must be `NULL` (no duplicate request)
- `left_at` must NOT be `NULL` (member must have actually left)

**Step 2 (Admin Approval):**
- `memberId` must have `rejoin_requested_at IS NOT NULL`
- Actor must be company owner or admin
- `is_active` must be `FALSE`
- Transaction: `is_active = true`, `left_at = NULL`, `employment_status = 'active'`, `rejoin_requested_at = NULL`, `updated_at = NOW()`

---

## 8. What Must Change If Option 2 Is Selected

### 8A. Freeze Candidate Update

The frozen endpoint must change from:

```
POST /api/v1/companies/:companyId/membership/rejoin  → no request DTO
```

To:

```
POST /api/v1/companies/:companyId/members/:memberId/reactivate  → no request DTO
```

### 8B. D6 Wording Update

D6 would need to be amended from:

> "Previously associated user **rejoin request** kar sakta hai, lekin membership activation owner/admin approval ke baad hogi."

To:

> "Owner/admin previously associated member ko directly reactivate kar sakta hai; member self-request current scope mein nahi hai."

### 8C. Acceptance Criteria Update

The freeze candidate acceptance criteria for rejoin would change from implicit two-step to single-step admin reactivation.

---

## 9. Recommendation

**Primary: Option 1 (Two-Step)** — because:

1. D6 is an **approved human decision** — its wording should not be silently changed
2. Member self-request provides **visibility and UX** (member sees "request pending")
3. The migration is **minimal** (one nullable column + one index)
4. The audit trail is **complete** (who requested, when, who approved)
5. It aligns with the pattern used by `invited_at`/`invited_by` for the invite flow

**Alternative: Option 2** — if the team decides D6's "member requests" wording is aspirational rather than contractual. This requires:
- Explicit D6 amendment
- Freeze candidate endpoint path change
- Acceptance criteria update

---

## 10. Security Review

| Check | Option 1 | Option 2 |
|-------|----------|----------|
| Member cannot approve own rejoin | ✅ Separate endpoints, different actors | ✅ Admin-only endpoint |
| Cross-company rejoin blocked | ✅ company_id from route + JWT validation | ✅ Same |
| Duplicate request prevented | ✅ `rejoin_requested_at IS NULL` check | ✅ N/A |
| Sole owner protection | ⚠️ Not applicable (rejoin doesn't change owner_id) | ✅ Same |
| Audit trail | ✅ `rejoin_requested_at` + `rejoin_requested_by` | ⚠️ audit_logs only |
| Deactivated member access | ✅ Member can only request for self (JWT-derived user_id) | ✅ Admin controls |

---

## 11. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Option 1 adds migration complexity | LOW | Single nullable column; backward compatible |
| Option 2 changes approved D6 wording | MEDIUM | Requires explicit D6 amendment + documentation update |
| Pending rejoin requests could accumulate | LOW | Optional: auto-expire after N days; or admin can reject |
| Member requests rejoin but company is deactivated | LOW | Validate `companies.is_active = true` in Step 1 |

---

## 12. Final Verdict

| Category | Status |
|----------|--------|
| **Overall** | ⚠️ **PASS WITH REQUIRED CONTRACT/MIGRATION** |
| **D6 interpretation** | ✅ Correct — two-step flow is unambiguous |
| **Schema support** | ❌ Missing `rejoin_requested_at` for Option 1 |
| **Frozen endpoint** | ❌ Must change path/actor for either option |
| **Option 1 (Two-Step)** | ✅ RECOMMENDED — 1 migration + 2 endpoints |
| **Option 2 (Admin-Only)** | ⚠️ ALTERNATIVE — zero migration, D6 amendment needed |
| **Option 3 (Self-Service)** | ❌ REJECTED — conflicts with D6 |

**D6 is clear. The database is not ready. One forward migration (`rejoin_requested_at` column) resolves the gap for Option 1. If Option 2 is chosen, D6 must be explicitly amended.** 🚀

---

## 13. Files Verified

| File | Finding |
|------|---------|
| `PHASE-09-B-API-CONTRACT-DECISIONS-HINGLISH.md` §D6 | Two-step: member requests → owner/admin approves |
| `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md` | Frozen endpoint lacks actor separation |
| `PHASE-09-B-DTO-FIELD-MAPPING-WORKSHEET.md` | "Rejoin reactivates existing row" — no request-state fields |
| `PHASE-06-API-CATALOG.md` §3B | API-COMPANY-003 actor = owner/admin; conflicts with D6 member-initiated |
| `04_companies.sql` L234-283 | No `rejoin_requested_at` column |
| `02_enums.sql` | `employment_status` has no `rejoin_requested` value |
| `17_rls.sql` | Deactivated members have no company data access; NestJS handles all |
| `AGENTS.md` | No invention; report conflicts |
