# Membership Rejoin — Approval Contract Review

**Target Document:** `04-nestjs-api/membership-rejoin-review/REJOIN-APPROVAL-CONTRACT-QUESTION.md`
**Auditor:** Opencode (Independent Senior NestJS + PostgreSQL + Supabase Architect)
**Date:** 2026-08-27
**Report Path:** `04-nestjs-api/membership-rejoin-review/opencode.md`

---

## 1. Executive Verdict

### **PASS WITH REQUIRED CONTRACT/MIGRATION — Option 2 with D6 wording adjustment**

The current schema has **no durable state mechanism** for rejoin request/approval workflow. Option 2 (owner/admin-only reactivation with `member_id`) is the only viable path that requires zero schema changes. It requires explicit D6 wording adjustment and contract update.

---

## 2. D6 Exact Meaning Verification

### D6原文 (Decisions-Hinglish.md:66)

> "Previously associated user rejoin request कर सकता है, लेकिन membership activation owner/admin approval के बाद होगी. Existing `company_members` row ही reactivate होगी; duplicate row नहीं बनेगी. Original `joined_at` audit history के लिए preserve होगा और `updated_at` बदलेगा."

### D6分解

| Element | D6 Statement | Verified? |
|---|---|---|
| Previously associated user requests rejoin | ✅明确提及 |
| Owner/admin approval required | ✅明确提及 |
| Existing company_members row reactivates | ✅明确提及 |
| Duplicate row prohibited | ✅明确提及 |
| Original `joined_at` preserved | ✅明确提及 |
| `updated_at` changes | ✅明确提及 |

### D6Intent

D6 defines a **two-step flow**: member requests → owner/admin approves. The question is whether the current schema supports this.

---

## 3. Schema Support Verification

### 3.1 `company_members` Table (04_companies.sql:234–306)

| Column | Type | Purpose | Supports Rejoin Request/Approval? |
|---|---|---|---|
| `id` | UUID | Member ID | ✅ |
| `company_id` | UUID | Company scope | ✅ |
| `user_id` | UUID | User identity | ✅ |
| `is_active` | BOOLEAN | Active/inactive status | ✅ Can toggle for reactivation |
| `joined_at` | TIMESTAMPTZ | When joined | ✅ Preserve per D6 |
| `left_at` | TIMESTAMPTZ | When left | ✅ Clear on reactivation |
| `invited_at` | TIMESTAMPTZ | When invited | ❌ Not relevant for rejoin |
| `invited_by` | UUID | Who invited | ❌ Not relevant for rejoin |

### 3.2 Missing Schema Elements

| Required Element | Exists? | Impact |
|---|---|---|
| Rejoin request status column | ❌ No | Cannot store pending rejoin state |
| Rejoin approval table | ❌ No | Cannot track request/approval workflow |
| Rejoin request function | ❌ No | No DB-level rejoin logic |
| `security_event_type` enum value for rejoin | ❌ Unknown | May need `rejoin_requested` / `rejoin_approved` |

### 3.3 RLS Policies (17_rls.sql)

| Table | RLS Enabled | Authenticated SELECT Policy | Authenticated DML Policy |
|---|---|---|---|
| `company_members` | ✅ Yes (line 76) | ❌ None | ❌ None |

**No authenticated DML on `company_members`** — all writes go through NestJS SystemClient with same-company authorization.

---

## 4. Option Comparison

### Option 1: Two-Step Commands (Request + Approve)

| Aspect | Assessment |
|---|---|
| D6 alignment | ✅ Exact match: "member requests → owner/admin approves" |
| Schema support | ❌ **No durable request state mechanism** |
| Required migration | New table (`membership_rejoin_requests`) or new column on `company_members` |
| Required contract | `rejoin.requested` / `rejoin.approved` event types |
| Complexity | HIGH — new table, new enum values, new workflow |
| AGENTS.md compliance | ⚠️ Requires explicit approved forward migration |

**Verdict:** Ideal for D6 but **BLOCKED** — no approved migration/table exists.

### Option 2: Owner/Admin-Only Reactivation

| Aspect | Assessment |
|---|---|
| D6 alignment | ⚠️ Changes "member requests" to "owner/admin directly reactivates" |
| Schema support | ✅ **Full support** — toggle `is_active`, clear `left_at`, preserve `joined_at` |
| Required migration | None |
| Required contract | Update D6 wording; add `member_id` to request body |
| Complexity | LOW — single endpoint, existing columns |
| AGENTS.md compliance | ✅ No schema changes needed |

**Verdict:** Viable with explicit D6 wording adjustment.

### Option 3: Single Self-Service Reactivation

| Aspect | Assessment |
|---|---|
| D6 alignment | ❌ **Direct conflict** — D6 requires owner/admin approval |
| Schema support | ✅ Technically possible |
| Required migration | None |
| Required contract | **D6 must be changed** — removes approval requirement |
| Complexity | LOW |
| AGENTS.md compliance | ⚠️ Requires explicit D6 amendment |

**Verdict:** **BLOCKED** — conflicts with approved D6.

---

## 5. Recommended Path: Option 2 with Contract Update

### 5.1 D6 Wording Adjustment Required

**Current D6 (approved):**
> "Previously associated user rejoin request कर सकता है, लेकिन membership activation owner/admin approval के बाद होगी."

**Proposed D6 amendment:**
> "Previously associated user rejoin के लिए owner/admin को request कर सकता है (e.g., via support channel or in-app notification). Owner/admin directly `member_id` के साथ membership reactivate कर सकता है. Self-service rejoin request state current scope में store नहीं होगी."

**Rationale:** The current schema cannot support durable request state without a new table. Option 2 is the pragmatic path that achieves the same business outcome (owner/admin-controlled rejoin) without schema changes.

### 5.2 Contract Changes Required

| Change | Document | Required Update |
|---|---|---|
| D6 wording | `DECISIONS-HINGLISH.md` | Amendment to clarify owner/admin-initiated reactivation |
| Endpoint DTO | `FREEZE-CANDIDATE.md` | Add `member_id` to request body for rejoin |
| DTO worksheet | `DTO-FIELD-MAPPING-WORKSHEET.md` | Add rejoin request fields |
| Acceptance criteria | `FREEZE-CANDIDATE.md` | Document rejoin behavior |

### 5.3 Proposed Endpoint Contract

```
POST /api/v1/companies/:companyId/membership/rejoin

Request DTO: RejoinMemberDto {
  member_id: UUID  -- company_members.id of the previously associated member
}

Response DTO: MembershipSummaryDto

Actor: owner/admin (same-company authorization)
Permission: same-company membership-management permission

Behavior:
1. Verify actor is company owner/admin
2. Find existing company_members row by member_id + company_id
3. Verify row is inactive (is_active = false) and has left_at set
4. Verify user_id references an active public.users row
5. Set is_active = true, clear left_at, preserve joined_at
6. Update updated_at
7. Return membership summary

Errors: UNAUTHORIZED, FORBIDDEN, NOT_FOUND, VALIDATION_ERROR (if member is active)

Transaction: Atomic update of company_members row + audit log
```

### 5.4 Authorization Rule

```
Actor: owner/admin (same-company)
- companies.owner_id = auth.uid() OR
- company_members WHERE user_id = auth.uid() AND is_active = true AND permissions @> '{"membership_manage": true}'

Target: previously associated member
- company_members.id = request.member_id
- company_members.company_id = :companyId
- company_members.is_active = false
- company_members.left_at IS NOT NULL
```

### 5.5 Transaction Boundary

```
BEGIN
  1. Verify actor authorization (read-only)
  2. Find and lock target company_members row
  3. Validate rejoin eligibility
  4. UPDATE company_members SET is_active = true, left_at = NULL, updated_at = NOW()
  5. INSERT INTO audit_logs (company_id, user_id, target_user_id, action, ...)
COMMIT
```

---

## 6. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| D6 wording change required | MEDIUM | Explicit amendment with rationale |
| No self-request state for audit trail | LOW | Audit via `audit_logs` table |
| Owner/admin cannot see pending rejoin requests | LOW | Out of scope for current phase |
| D6 "member requests" intent lost | LOW | Document in D6 amendment that requests happen via external channels |

---

## 7. Final Verdict

### **PASS WITH REQUIRED CONTRACT/MIGRATION**

| Finding | Severity | Fix |
|---|---|---|
| No durable rejoin request state in schema | MEDIUM | Adopt Option 2 (owner/admin reactivation) |
| D6 wording conflicts with Option 2 | MEDIUM | Explicit D6 amendment required |
| Rejoin endpoint has no `member_id` DTO | MEDIUM | Add `RejoinMemberDto` with `member_id` |
| No rejoin-specific audit event type | LOW | Use `audit_logs` with `action = 'membership.rejoin_activated'` |

**After D6 amendment and contract update:**
```
PASS — Option 2 viable with zero schema changes
```

---

*Report generated by Opencode agent on 2026-08-27.*
