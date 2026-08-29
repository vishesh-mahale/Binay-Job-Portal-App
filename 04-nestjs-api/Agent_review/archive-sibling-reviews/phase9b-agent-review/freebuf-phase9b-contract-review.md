# Phase 09-B — Identity & Company API Contract Freeze — Independent Review

**Reviewer:** Freebuf  
**Date:** 2026-08-27  
**Status:** `APPROVED WITH REQUIRED FIXES`  
**Build:** ✅ `npm run build` — exit 0  
**Tests:** ✅ 16 suites, 35 tests, all PASS  

---

## 1. Executive Verdict

**APPROVED WITH REQUIRED FIXES**

All 19 endpoints are implemented, all DTO fields are SQL-backed, zero invented tables/columns/events/permissions, zero data leaks found. The architecture is sound and consistent with Decision-01 through Decision-08, Decision-06 error vocabulary, and 17_rls.sql security boundaries.

**1 HIGH** issue (unapproved error code `CONFLICT`) and **4 MEDIUM** issues (validation gaps, response field over-exposure, missing optimistic concurrency, employment_type enum validation) require correction before production freeze.

---

## 2. Files Reviewed

| # | File | Purpose |
|---|------|---------|
| 1 | `AGENTS.md` | Working rules and authority hierarchy |
| 2 | `PHASE-05-FINAL-REQUIREMENTS.md` | Final requirements source |
| 3 | `PHASE-06-API-CATALOG.md` | API catalog §3A–§3B |
| 4 | `PHASE-07-ARCHITECTURE.md` | Architecture decisions |
| 5 | `PHASE-08-IMPLEMENTATION-PLAN.md` | Implementation plan |
| 6 | `PHASE-09-B-API-CONTRACT-FREEZE.md` | Contract freeze worksheet |
| 7 | `PHASE-09-B-DTO-FIELD-MAPPING-WORKSHEET.md` | DTO field mapping |
| 8 | `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md` | Final freeze candidate |
| 9 | `DECISION-06-API-ERROR-VOCABULARY-HINGLISH.md` | Approved error codes |
| 10 | `03_users_auth.sql` | Users, sessions, auth trigger |
| 11 | `04_companies.sql` | Companies, branches, departments, teams, members, settings |
| 12 | `17_rls.sql` | RLS policies and grants |
| 13 | `13_analytics.sql` | audit_logs table |
| 14 | `02_enums.sql` | employment_type, employment_status enums |
| 15 | `src/identity-company.ts` | Auth/me, sessions, revoke |
| 16 | `src/companies.ts` | Company create/get/update |
| 17 | `src/organization.ts` | Branch/department/team CRUD |
| 18 | `src/membership.ts` | Invite/accept/deactivate/leave/rejoin/approve-rejoin |
| 19 | `src/ownership.ts` | Ownership transfer |
| 20 | `src/clients.ts` | UserContextClient + SystemClient |
| 21 | `src/errors.ts` | ApiExceptionFilter + error envelope |
| 22 | `src/main.ts` | ValidationPipe bootstrap |
| 23 | `src/app.module.ts` | Module registration |
| 24 | `src/*.spec.ts` | 16 test suites, 35 tests |

---

## 3. Evidence-Based Findings

### 3A. Routes and HTTP Methods — All 19 Endpoints Verified

| # | Endpoint | Method | Contract Match | SQL Match |
|---|----------|--------|----------------|-----------|
| 1 | `/api/v1/auth/me` | GET | ✅ FINAL-FREEZE | ✅ `users` table |
| 2 | `/api/v1/auth/sessions` | GET | ✅ FINAL-FREEZE | ✅ `user_sessions` |
| 3 | `/api/v1/auth/sessions/revoke` | POST | ✅ FINAL-FREEZE | ✅ `user_sessions.id` |
| 4 | `/api/v1/companies` | POST | ✅ FINAL-FREEZE | ✅ `companies` |
| 5 | `/api/v1/companies/:companyId` | GET | ✅ FINAL-FREEZE | ✅ `companies` |
| 6 | `/api/v1/companies/:companyId` | PATCH | ✅ FINAL-FREEZE | ✅ `companies` |
| 7 | `/api/v1/companies/:companyId/branches` | POST | ✅ FINAL-FREEZE | ✅ `company_branches` |
| 8 | `/api/v1/companies/:companyId/branches/:branchId` | PATCH | ✅ FINAL-FREEZE | ✅ `company_branches` |
| 9 | `/api/v1/companies/:companyId/departments` | POST | ✅ FINAL-FREEZE | ✅ `departments` |
| 10 | `/api/v1/companies/:companyId/departments/:departmentId` | PATCH | ✅ FINAL-FREEZE | ✅ `departments` |
| 11 | `/api/v1/companies/:companyId/teams` | POST | ✅ FINAL-FREEZE | ✅ `teams` |
| 12 | `/api/v1/companies/:companyId/teams/:teamId` | PATCH | ✅ FINAL-FREEZE | ✅ `teams` |
| 13 | `/api/v1/companies/:companyId/members` | POST | ✅ FINAL-FREEZE | ✅ `company_members` |
| 14 | `/api/v1/companies/:companyId/membership/accept` | POST | ✅ FINAL-FREEZE | ✅ `company_members` |
| 15 | `/api/v1/companies/:companyId/members/:memberId/deactivate` | POST | ✅ FINAL-FREEZE | ✅ `company_members` |
| 16 | `/api/v1/companies/:companyId/membership/leave` | POST | ✅ FINAL-FREEZE | ✅ `company_members` |
| 17 | `/api/v1/companies/:companyId/membership/rejoin` | POST | ✅ FINAL-FREEZE | ✅ `company_members` |
| 18 | `/api/v1/companies/:companyId/members/:memberId/approve-rejoin` | POST | ✅ FINAL-FREEZE | ✅ `company_members` |
| 19 | `/api/v1/companies/:companyId/ownership-transfer` | POST | ✅ FINAL-FREEZE | ✅ `companies.owner_id` |

**Verdict:** NO ISSUE — all 19 endpoints match the frozen contract exactly.

---

### 3B. DTO Fields vs SQL Columns

| DTO | Fields | SQL-Backed? | Verdict |
|-----|--------|-------------|---------|
| `AuthMeResponseDto` (implicit) | id, email, first_name, middle_name, last_name, display_name, phone, avatar_path, role, status | ✅ 10/10 from `users` | NO ISSUE |
| `PresenceSessionDto` (implicit) | id, socket_id, device_type, user_agent, last_seen_at, is_online, created_at, updated_at | ✅ 8/8 from `user_sessions` | NO ISSUE |
| `RevokePresenceSessionDto` | session_id | ✅ maps to `user_sessions.id` | NO ISSUE |
| `CreateCompanyDto` | name, slug, legal_name, email, phone, + 22 more | ✅ 26 fields all from `companies` | NO ISSUE |
| `UpdateCompanyDto` | extends CreateCompanyDto | ✅ same columns | LOW: allows name/slug update |
| `CreateBranchDto` | name, city, country, is_headquarters, + 9 more | ✅ from `company_branches` | NO ISSUE |
| `CreateDepartmentDto` | name, head_member_id, description | ✅ from `departments` | NO ISSUE |
| `CreateTeamDto` | department_id, name, lead_member_id, description | ✅ from `teams` | NO ISSUE |
| `AddCompanyMemberDto` | user_id, branch_id, department_id, team_id, manager_member_id, title, employee_code, is_primary_hr, permissions, employment_type, work_email, work_phone | ✅ from `company_members` | MEDIUM: employment_type not validated against enum |
| `TransferOwnershipDto` | new_owner_user_id | ✅ maps to `public.users.id` | NO ISSUE |

---

## 4. Requirement/SQL/DTO Mismatches

| ID | Severity | Finding | Evidence | Impact | Fix |
|----|----------|---------|----------|--------|-----|
| F-1 | **HIGH** | `CONFLICT` error code used in deactivate | `membership.ts:54` — `throw new BadRequestException('CONFLICT')` when member is head/lead/manager | Decision-06 §1 explicitly excludes `CONFLICT` from approved public codes: "कोई नया public code बनाकर use नहीं किया जाएगा।" Client will receive `CONFLICT` which is not in the vocabulary | Replace with `FORBIDDEN` (actor lacks reassignment authority) or `VALIDATION_ERROR` (business rule violation) |
| F-2 | **MEDIUM** | No class-validator decorators on DTOs | `companies.ts`, `membership.ts`, `organization.ts` — DTOs are plain class fields without `@IsString()`, `@IsNotEmpty()`, `@IsUUID()` etc. | `ValidationPipe({ whitelist: true })` only strips unknown properties; required fields, UUID format, string lengths, enum values are not enforced at NestJS boundary. Invalid input reaches SQL and may cause cryptic DB errors | Add `class-validator` decorators to all DTOs; or at minimum add manual validation in service layer |
| F-3 | **MEDIUM** | `employment_type` in `AddCompanyMemberDto` is unvalidated string | `membership.ts:5` — `employment_type?: string` | SQL column is `employment_type` enum with values: `full_time, part_time, contract, temporary, internship, freelance, volunteer`. An invalid string will cause a PostgreSQL enum cast error at runtime | Validate against approved enum values before INSERT, or accept the DB error and map to `VALIDATION_ERROR` |
| F-4 | **MEDIUM** | Company create/update response returns `*` | `companies.ts:34` — `RETURNING *` | Response includes `owner_id`, `verification_status`, `verification_document_path`, `settings`, `deleted_at`, `registration_number` which are internal/sensitive fields. Contract says: "Response में secrets, token hashes या sensitive audit metadata नहीं आएगा" | Filter response through safe `CompanySummaryDto` with explicit allowlist |
| F-5 | **MEDIUM** | No optimistic concurrency on company update | `companies.ts:38-42` — update has no `expected_revision` | Contract freeze worksheet says: "Mutations में expected revision/idempotency जहाँ catalog/SQL मांगता है वहाँ mandatory होगा" | Add `expected_revision` parameter and check against `updated_at` or add revision column |

---

## 5. Security and Authorization Findings

| ID | Severity | Finding | Evidence | Verdict |
|----|----------|---------|----------|---------|
| S-1 | **NO ISSUE** | UserContextClient restricted to SELECT only | `clients.ts:10` — regex check `select\b` | ✅ Enforced |
| S-2 | **NO ISSUE** | SystemClient never exposed to browser | `clients.ts:15-17` — server-only injectable | ✅ Enforced |
| S-3 | **NO ISSUE** | JWT claims propagation via `request.jwt.claims` | `clients.ts:12` — `set_config('request.jwt.claims', ...)` | ✅ RLS enforcement ready |
| S-4 | **NO ISSUE** | Company ownership derived from JWT, not request body | `companies.ts:24,31` — `userId` from JWT used as `owner_id` | ✅ Enforced |
| S-5 | **NO ISSUE** | Membership admin check verifies owner OR active HR/manager | `membership.ts:13-17` — `assertAdmin` checks `owner_id` OR `is_primary_hr` OR `manage_company` permission | ✅ Enforced |
| S-6 | **NO ISSUE** | Deactivate prevents owner removal | `membership.ts:48` — `owner.rows[0]?.owner_id === m.user_id` → FORBIDDEN | ✅ Enforced |
| S-7 | **NO ISSUE** | Deactivate prevents head/lead/manager orphaning | `membership.ts:50-53` — checks departments.head_member_id, teams.lead_member_id, company_members.manager_member_id | ✅ Enforced (but wrong error code — see F-1) |
| S-8 | **NO ISSUE** | Leave prevents owner self-removal | `membership.ts:68` — owner check | ✅ Enforced |
| S-9 | **NO ISSUE** | Ownership transfer validates target is active member | `ownership.ts:20-22` — JOIN query checks `is_active=true` and `u.status='active'` | ✅ Enforced |
| S-10 | **NO ISSUE** | Ownership transfer atomic with audit | `ownership.ts:19-28` — single `db.transaction` block with `FOR UPDATE` lock | ✅ Enforced |
| S-11 | **NO ISSUE** | Company create atomically initializes settings | `companies.ts:33` — `INSERT INTO company_settings` inside same transaction | ✅ Enforced |
| S-12 | **NO ISSUE** | Rejoin writes `rejoin_requested_at` + `rejoin_requested_by` | `membership.ts:73-75` — SQL matches `04_companies.sql` constraint | ✅ Enforced |
| S-13 | **NO ISSUE** | ApproveRejoin clears rejoin fields and preserves `joined_at` | `membership.ts:80-82` — `COALESCE(joined_at,NOW())` | ✅ Enforced |
| S-14 | **NO ISSUE** | No browser-to-Supabase direct writes | All controllers use `SystemClient` or `UserContextClient` | ✅ Enforced |
| S-15 | **NO ISSUE** | External calls outside DB transactions | No HTTP/storage calls inside any `db.transaction` block | ✅ Enforced |
| S-16 | **NO ISSUE** | Audit logs written atomically | `membership.ts:11-12` — `audit()` helper called within transaction | ✅ Enforced |
| S-17 | **NO ISSUE** | Session revoke scoped to authenticated user only | `identity-company.ts:32` — `WHERE id=$1 AND user_id=$2` with JWT user | ✅ Enforced |
| S-18 | **NO ISSUE** | `handle_new_user()` trigger creates `public.users` | `03_users_auth.sql:87-137` — SECURITY DEFINER trigger | ✅ No NestJS duplicate insert |
| S-19 | **NO ISSUE** | Ownership transfer audit logged to `audit_logs` | `ownership.ts:26-27` — INSERT with `company.ownership_transferred` action | ✅ In same transaction |
| S-20 | **LOW** | `company_settings.job_approval_required` not exposed in company response | `company_settings` initialized with defaults but response doesn't include approval config | No security impact; UI can read separately |

---

## 6. Transaction/Idempotency Findings

| ID | Severity | Finding | Evidence | Verdict |
|----|----------|---------|----------|---------|
| T-1 | **NO ISSUE** | Company create = company + members + settings in one TX | `companies.ts:30-34` — single `transaction()` block | ✅ Atomic |
| T-2 | **NO ISSUE** | Membership invite = assertAdmin + check existing + insert/update + audit in one TX | `membership.ts:19-38` — single `transaction()` block | ✅ Atomic |
| T-3 | **NO ISSUE** | Membership accept = update + audit in one TX | `membership.ts:40-45` — single `transaction()` block | ✅ Atomic |
| T-4 | **NO ISSUE** | Membership deactivate = assertAdmin + check refs + update + audit in one TX | `membership.ts:46-57` — single `transaction()` block | ✅ Atomic |
| T-5 | **NO ISSUE** | Membership leave = check owner + update + audit in one TX | `membership.ts:62-71` — single `transaction()` block | ✅ Atomic |
| T-6 | **NO ISSUE** | Rejoin = update rejoin fields + audit in one TX | `membership.ts:73-78` — single `transaction()` block | ✅ Atomic |
| T-7 | **NO ISSUE** | ApproveRejoin = assertAdmin + update + audit in one TX | `membership.ts:80-85` — single `transaction()` block | ✅ Atomic |
| T-8 | **NO ISSUE** | Ownership transfer = lock company + validate target + update + audit in one TX | `ownership.ts:19-28` — single `transaction()` block with `FOR UPDATE` | ✅ Atomic |
| T-9 | **NO ISSUE** | Membership invite idempotency — existing active member = IDEMPOTENCY_CONFLICT | `membership.ts:25-26` — checks `is_active` on existing row | ✅ Enforced |
| T-10 | **LOW** | Membership invite idempotency for inactive member — re-invites existing row | `membership.ts:27-30` — UPDATE existing inactive row instead of creating duplicate | ✅ Correct behavior per contract |
| T-11 | **LOW** | No `FOR UPDATE` on company row in deactivate | `membership.ts:48` — company owner check uses separate query without lock | ⚠️ Low-risk: owner_id change between check and deactivate is unlikely but theoretically possible |

---

## 7. Required Fixes

| ID | Severity | Fix | Priority |
|----|----------|-----|----------|
| F-1 | **HIGH** | Replace `CONFLICT` error code in `membership.ts:54` with `FORBIDDEN` (member has required relationships that prevent deactivation) | Before contract freeze |
| F-2 | **MEDIUM** | Add `class-validator` decorators to all DTOs (`@IsString()`, `@IsNotEmpty()`, `@IsUUID()`, `@IsEnum()`, etc.) or add manual validation in service layer for required fields | Before contract freeze |
| F-3 | **MEDIUM** | Validate `employment_type` against approved enum values before INSERT, or accept DB error and map to `VALIDATION_ERROR` in ApiExceptionFilter | Before contract freeze |
| F-4 | **MEDIUM** | Filter company create/update response through safe `CompanySummaryDto` with explicit field allowlist instead of `RETURNING *` | Before contract freeze |
| F-5 | **MEDIUM** | Add `expected_revision` or `updated_at`-based optimistic concurrency to company update | Before contract freeze |

---

## 8. Final Implementation Readiness

| Category | Status |
|----------|--------|
| All 19 endpoints implemented | ✅ YES |
| All DTO fields SQL-backed | ✅ YES |
| Zero invented tables/columns/events/permissions | ✅ CONFIRMED |
| UserContextClient/SystemClient separation | ✅ CORRECT |
| Owner/admin/HR authorization | ✅ CORRECT |
| Company/branch/department/team relationships | ✅ CORRECT |
| Membership invite/accept/deactivate/leave/rejoin/approve-rejoin | ✅ CORRECT |
| Ownership transfer | ✅ CORRECT |
| Transaction atomicity | ✅ ALL 8 COMMANDS |
| Audit logging | ✅ ALL COMMANDS |
| RLS boundaries | ✅ CORRECT |
| Error envelope (request_id, trace_id, schema_version) | ✅ CORRECT |
| ValidationPipe (whitelist, transform, forbidNonWhitelisted) | ✅ CONFIGURED |
| `handle_new_user()` trigger respected | ✅ NO DUPLICATE INSERT |
| `company_settings` atomic init | ✅ YES |
| Rejoin preserves `joined_at` | ✅ YES |
| Rejoin two-step (request + approve) | ✅ CORRECT |
| Build passes | ✅ EXIT 0 |
| Tests pass | ✅ 35/35 |

**Production freeze status: 1 HIGH + 4 MEDIUM fixes required before contract freeze.**

---

## 9. No-Code-Change Confirmation

This review is a read-only audit. No source code, SQL, contracts or planning documents were modified during this review.

---

*Report generated by Freebuf — independent Senior NestJS, PostgreSQL and Security Architect review.*
