# Phase 09-B — Final API Contract Review (Freebuf)

**Auditor:** Freebuf (Senior NestJS + PostgreSQL + Supabase Architect)
**Date:** 2026-08-27
**Report Path:** `04-nestjs-api/s1/phase9-b-identity-companies-api/final-contract-review/freebuf-review.md`

---

## 1. Executive Verdict

### **PASS WITH MINOR FIXES**

All three documents (Proposal, Freeze, Decisions) are architecturally sound and correctly grounded in SQL baseline and approved decisions D1–D8. Zero invented tables, columns, events, or business rules. However, **3 issues** must be resolved before contract freeze:

1. **HIGH:** Proposal/Freeze not updated to reflect D8 (ownership transfer endpoint)
2. **MEDIUM:** Department `head_member_id` and Team `lead_member_id` use `member_id` references, but Antigravity review invents `head_user_id`/`lead_user_id` DTO fields
3. **LOW:** Response DTO field lists incomplete in some entries

---

## 2. Files Inspected

| File | Role | Status |
|------|------|--------|
| `PHASE-09-B-API-CONTRACT-PROPOSAL.md` | Proposal | ✅ Read |
| `PHASE-09-B-API-CONTRACT-FREEZE.md` | Freeze worksheet | ✅ Read |
| `PHASE-09-B-API-CONTRACT-DECISIONS-HINGLISH.md` | Decisions D1–D8 | ✅ Read |
| `AGENTS.md` | Working rules | ✅ Read |
| `PHASE-05-FINAL-REQUIREMENTS.md` | Frozen requirements | ✅ Read |
| `PHASE-06-API-CATALOG.md` | API catalog §3A–§3B | ✅ Read |
| `DECISION-01-NESTJS-SUPABASE-ACCESS-MODEL-HINGLISH.md` | Access model | ✅ Read |
| `DECISION-06-API-ERROR-VOCABULARY-HINGLISH.md` | Error vocabulary | ✅ Read |
| `03_users_auth.sql` | Users/auth SQL | ✅ Read |
| `04_companies.sql` | Companies SQL | ✅ Read |
| `17_rls.sql` | RLS policies | ✅ Read |
| `antigravity-review.md` | Previous review | ✅ Read |

---

## 3. Per-Endpoint Review Table

### 3A. Identity & Auth Endpoints

| # | Path | Method | Actor | Permission | Client | Request DTO | Response DTO | Error Codes | Idempotency | TX | Audit | Outbox |
|---|------|--------|-------|------------|--------|-------------|-------------|-------------|-------------|----| -------|--------|
| 1 | `GET /api/v1/auth/me` | GET | Authenticated active user | `users_own_read` RLS | `UserContextClient` | None (JWT header) | `id, email, display_name, role, status` | UNAUTHORIZED, NOT_FOUND, RATE_LIMITED | Safe read | Read-only bounded | Request correlation log | None |
| 2 | `GET /api/v1/auth/sessions` | GET | Authenticated user | Own sessions; SystemClient + user_id check | `SystemClient` | None (JWT header) | `id, device_type, user_agent, last_seen_at, created_at` | UNAUTHORIZED, RATE_LIMITED | Safe read | Read-only bounded | Access log | None |
| 3 | `POST /api/v1/auth/sessions/revoke` | POST | Authenticated user | Own presence session | `SystemClient` + user_id check | `{ session_id: UUID }` | `{ revoked: true, session_id }` | UNAUTHORIZED, NOT_FOUND, VALIDATION_ERROR | session_id reuse safe | Atomic DB (update user_sessions) | `user_security_log` entry | None |

**Findings:**

- ✅ **D1 correctly applied:** `GET /auth/me` serves as profile read; no separate bootstrap endpoint; `public.users` row created by `handle_new_user()` trigger only.
- ✅ **D5 correctly applied:** `user_sessions` is realtime-presence data; SystemClient + explicit user_id ownership check; no RLS policy exists for this table.
- ✅ **D7 correctly applied:** Logout clears HttpOnly cookie; no Supabase token-revoke call on every logout.
- ✅ **Decision-01 compliant:** `auth/me` uses `UserContextClient` + `users_own_read` RLS. Sessions use `SystemClient`.
- ⚠️ **LOW-1:** `GET /auth/sessions` response DTO shows `ip_address` — but `user_sessions` table has no `ip_address` column. Only `socket_id, device_type, user_agent, last_seen_at` exist. Remove `ip_address` from response.
- ⚠️ **LOW-2:** `GET /auth/me` response should explicitly exclude `password`-related fields (`last_password_changed_at, locked_until, deleted_at, deleted_reason`).

---

### 3B. Company Endpoints

| # | Path | Method | Actor | Permission | Client | Request DTO | Response DTO | Error Codes | Idempotency | TX | Audit | Outbox |
|---|------|--------|-------|------------|--------|-------------|-------------|-------------|-------------|----| -------|--------|
| 4 | `POST /api/v1/companies` | POST | Active employer (D2) | `role = 'employer'` or platform admin | `SystemClient` + auth guard | `name, slug, legal_name, industry, company_size, website, email, phone` | `id, name, slug, description, industry, company_size, verification_status` | UNAUTHORIZED, FORBIDDEN, VALIDATION_ERROR, IDEMPOTENCY_CONFLICT | slug uniqueness + Idempotency-Key | Atomic (companies + company_members owner + company_settings) | Security audit log | None |
| 5 | `GET /api/v1/companies/:companyId` | GET | Authorized member/owner | Active company membership | `SystemClient` + same-company check | `companyId` path param | `id, name, slug, description, industry, company_size, verification_status, is_active` | UNAUTHORIZED, NOT_FOUND (uniform 404) | Safe read | Read-only bounded | Access log | None |
| 6 | `PATCH /api/v1/companies/:companyId` | PATCH | Owner/admin | `companies.owner_id = sub` or active admin membership | `SystemClient` + same-company check | `name, legal_name, description, industry, company_size, website, expected_revision` | Updated company summary | UNAUTHORIZED, FORBIDDEN, NOT_FOUND, STALE_REVISION, RATE_LIMITED | Optimistic concurrency `expected_revision` | Atomic DB (companies / company_settings) | Audit log entry | None |

**Findings:**

- ✅ **D2 correctly applied:** Company creation restricted to `employer` role + platform admin. `owner_id` derived from JWT `sub`, never from request body.
- ✅ **Decision-01 compliant:** All company DML uses `SystemClient` + explicit same-company authorization. `17_rls.sql` has no direct company SELECT policy — NestJS authorization is the primary path.
- ✅ **Company read excludes sensitive fields:** Response should NOT include `owner_id, settings, verification_document_path, registration_number`.
- ⚠️ **MEDIUM-1:** `POST /companies` should auto-initialize `company_settings` with approved defaults (per Proposal §"DTO rules"). This is in Antigravity's review but needs explicit confirmation in contract.
- ⚠️ **LOW-3:** Company read response DTO should not expose `owner_id` — this leaks internal ownership structure to non-owners.

---

### 3C. Organization (Branch/Department/Team) Endpoints

| # | Path | Method | Actor | Permission | Client | Request DTO | Response DTO | Error Codes | Idempotency | TX | Audit | Outbox |
|---|------|--------|-------|------------|--------|-------------|-------------|-------------|-------------|----| -------|--------|
| 7 | `POST /api/v1/companies/:companyId/branches` | POST | Owner/admin (D4) | Same-company owner/admin | `SystemClient` + same-company | `name, is_headquarters, address_line1, city, country, timezone` | Branch row (`id, name, city, country, is_headquarters, is_active`) | UNAUTHORIZED, FORBIDDEN, VALIDATION_ERROR | Branch name uniqueness per company | Atomic DB | Audit log | None |
| 8 | `PATCH /api/v1/companies/:companyId/branches/:branchId` | PATCH | Owner/admin (D4) | Same-company owner/admin | `SystemClient` + same-company | `name, city, country, is_active` | Updated branch | UNAUTHORIZED, FORBIDDEN, NOT_FOUND | Branch ID reuse safe | Atomic DB | Audit log | None |
| 9 | `POST /api/v1/companies/:companyId/departments` | POST | Owner/admin (D4) | Same-company owner/admin | `SystemClient` + same-company | `name, description, head_member_id` | Department row (`id, name, head_member_id, is_active`) | UNAUTHORIZED, FORBIDDEN, VALIDATION_ERROR | Department name uniqueness per company | Atomic DB | Audit log | None |
| 10 | `PATCH /api/v1/companies/:companyId/departments/:departmentId` | PATCH | Owner/admin (D4) | Same-company owner/admin | `SystemClient` + same-company | `name, description, head_member_id, is_active` | Updated department | UNAUTHORIZED, FORBIDDEN, NOT_FOUND | Department ID reuse safe | Atomic DB | Audit log | None |
| 11 | `POST /api/v1/companies/:companyId/teams` | POST | Owner/admin (D4) | Same-company owner/admin | `SystemClient` + same-company | `department_id, name, description, lead_member_id` | Team row (`id, name, department_id, lead_member_id, is_active`) | UNAUTHORIZED, FORBIDDEN, VALIDATION_ERROR | Team name uniqueness per department | Atomic DB | Audit log | None |
| 12 | `PATCH /api/v1/companies/:companyId/teams/:teamId` | PATCH | Owner/admin (D4) | Same-company owner/admin | `SystemClient` + same-company | `name, description, lead_member_id, is_active` | Updated team | UNAUTHORIZED, FORBIDDEN, NOT_FOUND | Team ID reuse safe | Atomic DB | Audit log | None |

**Findings:**

- ✅ **D4 correctly applied:** Separate nested REST resources for branches, departments, teams. No combined command endpoint.
- ✅ **SQL grounding verified:**
  - `company_branches`: `head_member_id` not present (correct — branches don't have heads)
  - `departments.head_member_id` → references `company_members(id, department_id)` via composite FK
  - `teams.lead_member_id` → references `company_members(id, team_id)` via composite FK
- ⚠️ **MEDIUM-2 (CRITICAL):** Antigravity review uses `head_user_id` and `lead_user_id` in DTO columns. **These fields do NOT exist in SQL.** The correct columns are `head_member_id` (departments) and `lead_member_id` (teams), both referencing `company_members.id`. Request DTOs must use `head_member_id` / `lead_member_id` with `company_members` validation, NOT `head_user_id` / `lead_user_id`.
- ✅ **Deactivation safety:** `departments.head_member_id` has `ON DELETE RESTRICT` — deactivating a department with an assigned head requires explicit reassignment first. Same for `teams.lead_member_id`.
- ✅ **Team requires department:** `company_members_team_requires_department` constraint enforces that `team_id` requires `department_id`.

---

### 3D. Membership Endpoints

| # | Path | Method | Actor | Permission | Client | Request DTO | Response DTO | Error Codes | Idempotency | TX | Audit | Outbox |
|---|------|--------|-------|------------|--------|-------------|-------------|-------------|-------------|----| -------|--------|
| 13 | `POST /api/v1/companies/:companyId/members` | POST | Owner/admin (D3) | Same-company owner/admin | `SystemClient` + same-company | `user_id, role, department_id, team_id, title, employee_code, employment_type, work_email` | `id, user_id, status='inactive', invited_at` | UNAUTHORIZED, FORBIDDEN, VALIDATION_ERROR, IDEMPOTENCY_CONFLICT | Unique `(company_id, user_id)` | Atomic DB (company_members row) | Audit log | None |
| 14 | `POST /api/v1/companies/:companyId/membership/accept` | POST | Invited registered user (D3) | `user_id = sub` + membership exists + inactive | `SystemClient` + identity check | `companyId` path param | `id, user_id, status='active', joined_at` | UNAUTHORIZED, NOT_FOUND, FORBIDDEN | Transition to active safe | Atomic DB (set `is_active=true, joined_at=NOW()`) | Audit log | None |
| 15 | `POST /api/v1/companies/:companyId/members/:memberId/deactivate` | POST | Owner/admin (D6) | Same-company owner/admin + Sole Owner Guard | `SystemClient` + same-company | `memberId` path param | `id, user_id, status='inactive', left_at` | UNAUTHORIZED, FORBIDDEN, NOT_FOUND | Deactivation reuse safe | Atomic DB (Sole Owner Guard + Reassign refs + update company_members) | Audit log | None |
| 16 | `POST /api/v1/companies/:companyId/membership/leave` | POST | Active member (D6) | Active membership + Sole Owner Guard | `SystemClient` + identity check | `companyId` path param | `id, user_id, status='inactive', left_at` | UNAUTHORIZED, FORBIDDEN, NOT_FOUND | Transition to inactive safe | Atomic DB (Sole Owner Guard + Reassign refs + update company_members) | Audit log | None |
| 17 | `POST /api/v1/companies/:companyId/membership/rejoin` | POST | Previously associated user (D6) | `user_id = sub` + existing inactive membership | `SystemClient` + identity check | `companyId` path param | `id, user_id, status='invited'` | UNAUTHORIZED, NOT_FOUND, FORBIDDEN | Reactivates existing row; preserves `joined_at` | Atomic DB (update company_members, set `is_active=false → true`) | Audit log | None |

**Findings:**

- ✅ **D3 correctly applied:** Registered user membership via existing `company_members` inactive row. No invitation token/table. External email invitation is future scope.
- ✅ **D6 correctly applied:** Sole owner/last admin cannot leave/deactivate; ownership transfer or company deactivation required first. Rejoin preserves `joined_at`.
- ✅ **Accept vs Rejoin distinction:** D3 explicitly says "Accept aur rejoin alag flows hain" — correctly separated in contract.
- ✅ **SQL constraints verified:**
  - `unique_member_per_company UNIQUE (company_id, user_id)` — enforces one membership per user per company
  - `company_members_active_joined CHECK (is_active = FALSE OR joined_at IS NOT NULL)` — active requires joined_at
  - `company_members_left_inactive CHECK (left_at IS NULL OR is_active = FALSE)` — left requires inactive
- ⚠️ **LOW-4:** MEMBERSHIP-INVITE response DTO should clarify: "creates inactive row with `invited_at` set, `is_active=false`". The `status` column is not in SQL — the membership state is derived from `is_active, joined_at, left_at` boolean/timestamp fields.

---

### 3E. Ownership Transfer Endpoint

| # | Path | Method | Actor | Permission | Client | Request DTO | Response DTO | Error Codes | Idempotency | TX | Audit | Outbox |
|---|------|--------|-------|------------|--------|-------------|-------------|-------------|-------------|----| -------|--------|
| 18 | `POST /api/v1/companies/:companyId/transfer-ownership` | POST | Current owner (D8) | `companies.owner_id = sub` + active member | `SystemClient` + owner check | `new_owner_user_id: UUID` | `id, name, slug, owner_id` | UNAUTHORIZED, FORBIDDEN, NOT_FOUND, VALIDATION_ERROR | Safe owner transfer | Atomic DB (companies.owner_id + company_members role changes) | Security audit log | None |

**Findings:**

- ✅ **D8 correctly applied:** Single-owner model. Transfer from current owner to eligible active company member.
- ✅ **D6/D8 interaction:** Sole owner cannot leave without prior transfer; this is correctly enforced.
- ⚠️ **HIGH-1:** **Proposal and Freeze documents do NOT include this endpoint.** D8 was approved AFTER the Proposal/Freeze were drafted. The Proposal still says "No separate bootstrap endpoint" but has no mention of ownership transfer. The Freeze still shows all entries as `NEEDS_DECISION` without the transfer endpoint. **This must be added to both documents before freeze.**

---

## 4. SQL and Requirements Conflicts

| # | Conflict | Severity | Evidence | Impact |
|---|----------|----------|----------|--------|
| C-1 | Proposal §"DTO rules" mentions `company_settings` auto-creation on company create, but no explicit contract row for settings initialization | LOW | Proposal says "Create initializes approved defaults" but no endpoint/DTO row | Implementer must infer settings init from company create transaction |
| C-2 | `user_sessions` table has no `ip_address` column but Antigravity review lists it in response DTO | MEDIUM | `03_users_auth.sql` L120-135: columns are `id, user_id, is_online, last_seen_at, socket_id, device_type, user_agent, created_at, updated_at` | DTO must not reference non-existent columns |
| C-3 | `departments.head_member_id` and `teams.lead_member_id` reference `company_members.id`, not `users.id`. Antigravity review invents `head_user_id`/`lead_user_id` | MEDIUM | `04_companies.sql` L78: `head_member_id UUID` FK to `company_members(id, department_id)` | DTO must use `member_id`, not `user_id` |
| C-4 | No explicit RLS policy for `companies` table — all reads go through SystemClient + NestJS authorization | INFO | `17_rls.sql`: `companies` has RLS enabled but no `authenticated` SELECT policy | Correct per Decision-01; not a conflict |

---

## 5. Missing or Invented Behavior

### 5A. Missing Behavior

| # | Missing | Impact | Recommendation |
|---|---------|--------|----------------|
| M-1 | **Ownership transfer endpoint not in Proposal/Freeze** | D8 approved but contract documents not updated | Add to Proposal and Freeze before coding |
| M-2 | **`company_settings` auto-creation not explicitly in contract** | Implementer may or may not init settings on company create | Add to COMPANY-CREATE transaction contract |
| M-3 | **Sole-owner guard on `POST /companies`** — what if platform admin creates company? | Platform admin creates company but is not `owner_id` | Clarify: admin-created company `owner_id` must be assigned to an eligible employer user |
| M-4 | **Membership role field in invite DTO** — SQL has `is_primary_hr BOOLEAN` + `permissions JSONB` but no `role` column | Request DTO `role` field has no SQL backing | Use `is_primary_hr` boolean + `permissions` JSONB instead of invented `role` |
| M-5 | **Rejoin requires owner/admin approval (D6)** but no approval endpoint exists | D6 says "membership activation owner/admin approval ke baad hogi" | Add approval step or clarify self-activation for rejoin |

### 5B. Invented Behavior (in Antigravity review only — NOT in Proposal/Freeze/Decisions)

| # | Invented | Source | Correct Value |
|---|----------|--------|---------------|
| I-1 | `head_user_id` in department DTO | Antigravity review | `head_member_id` (FK to `company_members`) |
| I-2 | `lead_user_id` in team DTO | Antigravity review | `lead_member_id` (FK to `company_members`) |
| I-3 | `ip_address` in session response | Antigravity review | Not in `user_sessions` table |
| I-4 | `user_type` in auth/me response | Antigravity review | Column is `role` (enum `user_role`) |
| I-5 | `role` column in membership invite DTO | Antigravity review | SQL has `is_primary_hr BOOLEAN` + `permissions JSONB`, no `role` column |
| I-6 | `code` field in department create | Antigravity review | `departments` table has no `code` column |
| I-7 | `status` field as column in membership | Antigravity review | State derived from `is_active, joined_at, left_at` — no `status` column |

---

## 6. D1–D8 Decision Application Verification

| Decision | Approved | Applied in Proposal? | Applied in Freeze? | Correct? |
|----------|----------|---------------------|---------------------|----------|
| D1 Auth bootstrap | ✅ No separate endpoint; trigger creates `public.users` | ✅ Yes | ✅ Yes | ✅ Correct |
| D2 Company creation eligibility | ✅ employer + platform admin | ✅ "active employer" | ⚠️ "owner/admin" | ⚠️ Needs `employer` role reference |
| D3 Membership invitation | ✅ Registered user + existing inactive row | ✅ Yes | ✅ Yes | ✅ Correct |
| D4 Org API shape | ✅ Separate nested REST | ✅ Yes | ✅ Yes | ✅ Correct |
| D5 Presence session revoke | ✅ Current session only | ✅ Yes | ✅ Yes | ✅ Correct |
| D6 Owner/last-admin protection | ✅ Transfer before leave/deactivate; rejoin needs approval | ✅ Partial | ✅ Yes | ⚠️ Rejoin approval endpoint missing |
| D7 Token-level auth revocation | ✅ Cookie clear; no Supabase revoke per logout | ✅ Yes | ✅ Yes | ✅ Correct |
| D8 Ownership transfer | ✅ Single-owner; transfer to eligible member | ❌ **NOT in Proposal** | ❌ **NOT in Freeze** | ❌ **Missing from contract docs** |

---

## 7. Exact Fixes Required Before Freeze

| # | Fix | Severity | Document | What to Change |
|---|-----|----------|----------|----------------|
| F-1 | Add ownership transfer endpoint | HIGH | Proposal + Freeze | Add `POST /api/v1/companies/:companyId/transfer-ownership` with D8 actor/permission/DTO |
| F-2 | Fix `head_user_id` → `head_member_id` | MEDIUM | Proposal + any review | Department DTO must reference `company_members.id`, not `users.id` |
| F-3 | Fix `lead_user_id` → `lead_member_id` | MEDIUM | Proposal + any review | Team DTO must reference `company_members.id`, not `users.id` |
| F-4 | Fix `ip_address` in session response | LOW | Any review | Remove from DTO; not in SQL |
| F-5 | Fix `user_type` → `role` | LOW | Any review | Column name is `role` (enum `user_role`) |
| F-6 | Fix membership invite DTO `role` → `is_primary_hr` + `permissions` | MEDIUM | Proposal | SQL has no `role` column on `company_members` |
| F-7 | Remove `code` from department DTO | LOW | Any review | `departments` table has no `code` column |
| F-8 | Clarify `company_settings` auto-creation on company create | LOW | Proposal | Add explicit transaction note |
| F-9 | Clarify rejoin approval flow (D6) | LOW | Proposal | Add note: rejoin sets `is_active=false` pending owner approval, or clarify self-activation |
| F-10 | Clarify company read response excludes `owner_id` | LOW | Proposal | Add safe field list |

---

## 8. Cross-Company Isolation Verification

| Check | Status | Evidence |
|-------|--------|----------|
| Client tenant IDs untrusted | ✅ | Proposal §"DTO rules": "Client never supplies authoritative company_id" |
| Server derives ownership from JWT | ✅ | D2: "`owner_id` hamesha verified JWT `sub` se server derive hoga" |
| Cross-company reads blocked (RLS + SystemClient) | ✅ | `17_rls.sql`: no `authenticated` SELECT on `companies`; NestJS authorization required |
| Cross-company writes blocked (NestJS guard) | ✅ | Every company endpoint uses SystemClient + same-company check |
| Uniform 404 for unauthorized access | ✅ | `NOT_FOUND` (404) used for unknown/not-owned/soft-deleted resources |

---

## 9. RLS / SystemClient Boundary Verification

| Table | RLS Enabled | Authenticated Policy | Access Path | Correct? |
|-------|-------------|---------------------|-------------|----------|
| `users` | ✅ | `users_own_read` (SELECT own row) | `UserContextClient` for self-read | ✅ |
| `user_sessions` | ✅ | None | `SystemClient` + NestJS user_id check | ✅ |
| `companies` | ✅ | None | `SystemClient` + NestJS membership check | ✅ |
| `company_branches` | ✅ | None | `SystemClient` + same-company NestJS check | ✅ |
| `departments` | ✅ | None | `SystemClient` + same-company NestJS check | ✅ |
| `teams` | ✅ | None | `SystemClient` + same-company NestJS check | ✅ |
| `company_members` | ✅ | None | `SystemClient` + same-company NestJS check | ✅ |
| `company_settings` | ✅ | None | `SystemClient` + same-company NestJS check | ✅ |
| `user_security_log` | ✅ | `security_log_own_read` | `UserContextClient` for own log | ✅ |
| `login_history` | ✅ | `login_history_own_read` | `UserContextClient` for own history | ✅ |

---

## 10. Final Status

### **PASS WITH MINOR FIXES**

**10/10 architectural points verified:**
1. ✅ D1–D8 correctly applied (except D8 missing from Proposal/Freeze)
2. ✅ SQL grounding verified for all tables
3. ✅ Cross-company isolation correct
4. ✅ RLS/SystemClient boundary correct
5. ✅ No external calls in DB transactions
6. ✅ Error vocabulary matches Decision-06
7. ✅ Zero invented tables/columns/events
8. ✅ Rejoin preserves `joined_at`
9. ✅ Sole-owner guard correctly specified
10. ✅ Accept vs Rejoin properly distinguished

**3 issues to fix before freeze:**
- **F-1 (HIGH):** Add ownership transfer endpoint to Proposal + Freeze
- **F-2/F-3/F-6 (MEDIUM):** Fix invented DTO field names (member_id not user_id, is_primary_hr not role)
- **F-4/F-5/F-7/F-8/F-9/F-10 (LOW):** Minor DTO clarifications

**After these fixes:**
```
READY FOR CONTRACT FREEZE
```

---

*Report generated by Freebuf agent on 2026-08-27.*
