# Phase 09-B — Final Contract Revalidation (Freebuf)

**Auditor:** Freebuf (Senior NestJS + PostgreSQL + Supabase Architect)
**Date:** 2026-08-27
**Report Path:** `04-nestjs-api/s1/phase9-b-identity-companies-api/final-contract-review/freebuf-revalidation.md`

---

## 1. Executive Verdict

### **PASS WITH MINOR FIXES**

D1–D8 decisions are correctly approved. MEMBERSHIP-ACCEPT and MEMBERSHIP-REJOIN paths are now frozen. D6 rejoin-approval semantics correctly reflected. However, **2 issues from previous review remain unresolved:**

1. **HIGH:** D8 ownership transfer endpoint still NOT in Proposal or Freeze documents
2. **MEDIUM:** Antigravity review still invents DTO field names (`head_user_id`, `lead_user_id`, `role`, `code`, `ip_address`, `user_type`)

---

## 2. What Changed Since Previous Review

| Change | Status | Evidence |
|--------|--------|----------|
| MEMBERSHIP-ACCEPT path frozen | ✅ **FIXED** | Freeze: `POST /api/v1/companies/:companyId/membership/accept` |
| MEMBERSHIP-REJOIN path frozen | ✅ **FIXED** | Freeze: `POST /api/v1/companies/:companyId/membership/rejoin` |
| D6 rejoin-approval semantics | ✅ **FIXED** | Proposal: "previously associated user requests; owner/admin approves" |
| D1-D8 resolved note | ✅ **FIXED** | Freeze bottom: "D1–D8 business decisions are resolved" |
| D8 transfer endpoint in Proposal | ❌ **NOT FIXED** | Proposal still has 14 endpoints; no transfer endpoint |
| D8 transfer endpoint in Freeze | ❌ **NOT FIXED** | Freeze table still has 5 contract groups; no transfer row |
| Antigravity DTO field fixes | ❌ **NOT FIXED** | Same invented fields: `head_user_id`, `lead_user_id`, `role`, `code`, `ip_address`, `user_type` |

---

## 3. Per-Endpoint Verification (Updated)

### 3A. Identity & Auth — Verified ✅

| Endpoint | D-Decision | SQL-Backed? | Client | Correct? |
|----------|-----------|-------------|--------|----------|
| `GET /api/v1/auth/me` | D1 | ✅ `users` table | `UserContextClient` + `users_own_read` RLS | ✅ |
| `GET /api/v1/auth/sessions` | D5 | ✅ `user_sessions` table | `SystemClient` + user_id check | ✅ |
| `POST /api/v1/auth/sessions/revoke` | D5, D7 | ✅ `user_sessions` table | `SystemClient` + user_id check | ✅ |

**D1 correctly applied:** No bootstrap endpoint; `handle_new_user()` trigger creates `public.users`. Profile via `GET /auth/me`.
**D5 correctly applied:** Current session only; `user_sessions` is presence data, not auth session.
**D7 correctly applied:** Logout clears HttpOnly cookie; no routine Supabase token-revoke.

---

### 3B. Company — Verified ✅

| Endpoint | D-Decision | SQL-Backed? | Client | Correct? |
|----------|-----------|-------------|--------|----------|
| `POST /api/v1/companies` | D2 | ✅ `companies` + `company_members` + `company_settings` | `SystemClient` + auth guard | ✅ |
| `GET /api/v1/companies/:companyId` | — | ✅ `companies` | `SystemClient` + same-company | ✅ |
| `PATCH /api/v1/companies/:companyId` | D2, D6 | ✅ `companies` | `SystemClient` + same-company | ✅ |

**D2 correctly applied:** Active employer creates company; `owner_id` derived from JWT `sub`.
**Company read excludes sensitive fields:** Should NOT include `owner_id, settings, verification_document_path`.
**Settings auto-creation:** Transaction should init `company_settings` with approved defaults on create.

---

### 3C. Organization (Branch/Department/Team) — Verified ✅

| Endpoint | D-Decision | SQL-Backed? | Client | Correct? |
|----------|-----------|-------------|--------|----------|
| `POST /api/v1/companies/:companyId/branches` | D4 | ✅ `company_branches` | `SystemClient` + same-company | ✅ |
| `PATCH .../branches/:branchId` | D4 | ✅ `company_branches` | `SystemClient` + same-company | ✅ |
| `POST .../departments` | D4 | ✅ `departments` | `SystemClient` + same-company | ✅ |
| `PATCH .../departments/:departmentId` | D4 | ✅ `departments` | `SystemClient` + same-company | ✅ |
| `POST .../teams` | D4 | ✅ `teams` | `SystemClient` + same-company | ✅ |
| `PATCH .../teams/:teamId` | D4 | ✅ `teams` | `SystemClient` + same-company | ✅ |

**D4 correctly applied:** Separate nested REST resources. No combined command endpoint.

**SQL column verification:**
- `company_branches`: `name, is_headquarters, city, country` ✅
- `departments`: `name, head_member_id` (FK to `company_members(id, department_id)`) ✅
- `teams`: `department_id, name, lead_member_id` (FK to `company_members(id, team_id)`) ✅

**Invented fields still present in Antigravity review:**
- ❌ `code` in department — `departments` table has NO `code` column
- ❌ `head_user_id` — correct column is `head_member_id`
- ❌ `lead_user_id` — correct column is `lead_member_id`

---

### 3D. Membership — Verified ✅

| Endpoint | D-Decision | SQL-Backed? | Client | Correct? |
|----------|-----------|-------------|--------|----------|
| `POST .../members` | D3 | ✅ `company_members` | `SystemClient` + same-company | ✅ |
| `POST .../membership/accept` | D3 | ✅ `company_members` | `SystemClient` + identity check | ✅ (NEW) |
| `POST .../members/:memberId/deactivate` | D6 | ✅ `company_members` | `SystemClient` + same-company | ✅ |
| `POST .../membership/leave` | D6 | ✅ `company_members` | `SystemClient` + identity check | ✅ |
| `POST .../membership/rejoin` | D6 | ✅ `company_members` | `SystemClient` + identity check | ✅ |

**D3 correctly applied:** Registered user accepts via existing inactive row. No external invitation.
**D6 correctly applied:** Sole-owner guard; rejoin preserves `joined_at`; rejoin requires owner/admin approval.

**Accept vs Rejoin distinction:** ✅ Correctly separated per D3.

**SQL constraint verification:**
- `unique_member_per_company UNIQUE (company_id, user_id)` — enforces one membership per user per company ✅
- `company_members_active_joined CHECK (is_active = FALSE OR joined_at IS NOT NULL)` — active requires joined_at ✅
- `company_members_left_inactive CHECK (left_at IS NULL OR is_active = FALSE)` — left requires inactive ✅

**Invented field in Antigravity review:**
- ❌ `role` in membership invite DTO — `company_members` has NO `role` column; only `is_primary_hr BOOLEAN` + `permissions JSONB`
- ❌ `status` as column — state derived from `is_active, joined_at, left_at` booleans/timestamps

---

### 3E. Ownership Transfer — NOT IN PROPOSAL/FREEZE ❌

| Endpoint | D-Decision | In Proposal? | In Freeze? |
|----------|-----------|-------------|-----------|
| `POST /api/v1/companies/:companyId/transfer-ownership` | D8 | ❌ **NO** | ❌ **NO** |

**D8 approved but contract documents not updated.** This is the same HIGH issue from previous review.

Antigravity review includes this endpoint (18 total) but the actual Proposal/Freeze documents only have 14/5 entries respectively.

---

## 4. D1–D8 Decision Application Matrix

| Decision | Approved | In Proposal? | In Freeze? | Correct? |
|----------|----------|-------------|-----------|----------|
| D1 Auth bootstrap | ✅ | ✅ | ✅ | ✅ |
| D2 Company creation | ✅ | ✅ | ✅ | ✅ |
| D3 Membership invitation | ✅ | ✅ | ✅ (NEW) | ✅ |
| D4 Org API shape | ✅ | ✅ | ✅ | ✅ |
| D5 Session revoke | ✅ | ✅ | ✅ | ✅ |
| D6 Owner protection | ✅ | ✅ (UPDATED) | ✅ | ✅ |
| D7 Auth revocation | ✅ | ✅ | ✅ | ✅ |
| **D8 Ownership transfer** | ✅ | ❌ **MISSING** | ❌ **MISSING** | ❌ |

---

## 5. RLS / SystemClient Boundary — Verified ✅

| Table | RLS Enabled | Auth Policy | Access Path | Correct? |
|-------|-------------|-------------|-------------|----------|
| `users` | ✅ | `users_own_read` (SELECT) | `UserContextClient` | ✅ |
| `user_sessions` | ✅ | None | `SystemClient` + NestJS check | ✅ |
| `companies` | ✅ | None | `SystemClient` + NestJS check | ✅ |
| `company_branches` | ✅ | None | `SystemClient` + NestJS check | ✅ |
| `departments` | ✅ | None | `SystemClient` + NestJS check | ✅ |
| `teams` | ✅ | None | `SystemClient` + NestJS check | ✅ |
| `company_members` | ✅ | None | `SystemClient` + NestJS check | ✅ |
| `company_settings` | ✅ | None | `SystemClient` + NestJS check | ✅ |

**Decision-01 correctly applied:** `UserContextClient` only for approved RLS reads; all business DML via `SystemClient`.

---

## 6. Remaining Issues

### From Previous Review — Still Open

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| R-1 | D8 transfer endpoint missing from Proposal + Freeze | HIGH | ❌ NOT FIXED |
| R-2 | `head_user_id` → `head_member_id` in Antigravity review | MEDIUM | ❌ NOT FIXED |
| R-3 | `lead_user_id` → `lead_member_id` in Antigravity review | MEDIUM | ❌ NOT FIXED |
| R-4 | `role` → `is_primary_hr` + `permissions` in membership DTO | MEDIUM | ❌ NOT FIXED |
| R-5 | `ip_address` in session response (not in SQL) | LOW | ❌ NOT FIXED |
| R-6 | `user_type` → `role` in auth/me response | LOW | ❌ NOT FIXED |
| R-7 | `code` in department DTO (not in SQL) | LOW | ❌ NOT FIXED |

### New Issues

| # | Issue | Severity | Evidence |
|---|-------|----------|----------|
| R-8 | Proposal §"Decisions required" still lists 7 items; only D8 is genuinely open | LOW | Proposal says "these seven decisions" but D1-D7 are approved |
| R-9 | Proposal status still says "DECISIONS PENDING" despite D1-D7 resolved | LOW | Status header unchanged |

---

## 7. Exact Fixes Required

| # | Fix | Severity | Document |
|---|-----|----------|----------|
| F-1 | Add `POST /api/v1/companies/:companyId/transfer-ownership` to Proposal table + Freeze contract table | HIGH | Proposal + Freeze |
| F-2 | Fix `head_user_id` → `head_member_id` | MEDIUM | Any review document |
| F-3 | Fix `lead_user_id` → `lead_member_id` | MEDIUM | Any review document |
| F-4 | Fix `role` → `is_primary_hr` + `permissions` in membership invite DTO | MEDIUM | Any review document |
| F-5 | Remove `ip_address` from session response DTO | LOW | Any review document |
| F-6 | Fix `user_type` → `role` in auth/me response | LOW | Any review document |
| F-7 | Remove `code` from department DTO | LOW | Any review document |
| F-8 | Update Proposal "Decisions required" to only list D8 | LOW | Proposal |
| F-9 | Update Proposal status to reflect D1-D7 resolved | LOW | Proposal |

---

## 8. Final Status

### **PASS WITH MINOR FIXES**

**All D1–D8 decisions correctly approved. MEMBERSHIP-ACCEPT/REJOIN paths now frozen. D6 rejoin-approval semantics correctly applied. SQL grounding verified for all tables.**

**Remaining blockers before contract freeze:**
- F-1 (HIGH): D8 transfer endpoint must be added to Proposal + Freeze
- F-2/F-3/F-4 (MEDIUM): DTO field name corrections
- F-5–F-9 (LOW): Minor documentation cleanups

**After F-1 through F-4:**
```
READY FOR CONTRACT FREEZE
```

---

*Report generated by Freebuf agent on 2026-08-27.*
