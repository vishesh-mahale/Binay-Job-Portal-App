# Phase 09-B Identity & Company API Contract Proposal — Review (Freebuff)

**Reviewer:** Freebuff (Senior API Architect, Multi-Tenant Security Reviewer)
**Audit Target:** `04-nestjs-api/PHASE-09-B-API-CONTRACT-PROPOSAL.md`
**Date:** 2026-08-26
**Review Type:** Independent — no previous agent claims trusted

---

## 1. Executive Verdict

### **PASS WITH MINOR FIXES**

The proposal translates 14 catalog capabilities into implementable REST endpoints. All 14 proposed endpoints trace correctly to the Phase 06 API catalog sections 3A and 3B. The `PROPOSED` / `NEEDS_SOURCE/DECISION` status markings are honest. Zero invented API paths, tables, events, roles, or business rules. The 5 self-identified decisions required before freeze are correctly scoped.

However, **6 minor gaps** exist. None block the proposal but should be addressed during freeze.

---

## 2. Files and Sources Inspected

| # | File | Purpose |
|---|------|---------|
| 1 | `AGENTS.md` | Mandatory working rules |
| 2 | `PHASE-05-FINAL-REQUIREMENTS.md` | REQ-AUTH, REQ-COMPANY |
| 3 | `PHASE-06-API-CATALOG.md` §3A, §3B | Auth and Company API catalogs |
| 4 | `PHASE-07-ARCHITECTURE.md` | Tenant boundary, access model |
| 5 | `PHASE-08-IMPLEMENTATION-PLAN.md` Phase 08-B | Dependency/test rules |
| 6 | `PHASE-09-B-IDENTITY-COMPANIES-SCOPE.md` | Scope boundary |
| 7 | `02-database/migrations/baseline/03_users_auth.sql` | users, sessions, security_log |
| 8 | `02-database/migrations/baseline/04_companies.sql` | companies, members, branches, depts, teams, settings |
| 9 | `02-database/migrations/baseline/17_rls.sql` | RLS policies, grants, helper functions |
| 10 | `DECISION-01` | Controlled Hybrid access model |
| 11 | `DECISION-06` | Error vocabulary |

---

## 3. Endpoint-by-Endpoint Audit

### 3.1 AUTH-BOOTSTRAP: `POST /api/v1/auth/bootstrap` ⚠️ MINOR FIX

| Field | Proposal | Catalog (API-AUTH-001) | Match |
|-------|----------|----------------------|-------|
| Method/Path | POST /api/v1/auth/bootstrap | "TBD — auth signup/callback boundary must be confirmed with Supabase Auth" | ✅ Reasonable |
| Actor | "Supabase-verified signup/callback caller" | "unauthenticated signup user / authenticated callback" | ⚠️ See Finding 1 |
| Status | PROPOSED | TBD | ✅ Correct marking |

**SQL cross-check:** `handle_new_user()` trigger creates `public.users` row from `auth.users` insert. NestJS must not duplicate this. The proposal doesn't explicitly reference this constraint (implementation concern, not proposal gap).

### 3.2 AUTH-ME: `GET /api/v1/auth/me` ✅ PASS

| Field | Proposal | Source | Match |
|-------|----------|--------|-------|
| Method/Path | GET /api/v1/auth/me | Scope §1: "authenticated user bootstrap/profile read" | ✅ |
| Actor | "authenticated active user" | Scope §1: "authenticated user" | ✅ (stricter, acceptable) |

**RLS cross-check:** `users` table has `users_own_read` policy: `USING (id=auth.uid())`. This endpoint should use UserContextClient with user JWT propagation. The proposal doesn't specify client boundary (Finding 3).

### 3.3 AUTH-SESSION: `GET /api/v1/auth/sessions`, `POST /api/v1/auth/sessions/revoke` ✅ PASS

| Field | Proposal | Catalog (API-AUTH-002) | Match |
|-------|----------|----------------------|-------|
| Method/Path | GET/POST /api/v1/auth/sessions/* | "TBD — session/security operations" | ✅ |
| Actor | "authenticated user" | "authenticated user" | ✅ |
| Idempotency | (implied: session identity) | "logout/revoke operations safe on retry" | ✅ |

**SQL cross-check:** `user_sessions` has `user_id` FK, append-only with `updated_at` trigger. `user_security_log` and `login_history` are append-only (triggers prevent UPDATE/DELETE). All correct.

### 3.4 COMPANY-CREATE: `POST /api/v1/companies` ⚠️ MINOR FIX

| Field | Proposal | Catalog (API-COMPANY-001) | Match |
|-------|----------|--------------------------|-------|
| Method/Path | POST /api/v1/companies | "TBD — company CRUD resource" | ✅ |
| Actor | "eligible authenticated user" | "employer/owner/admin according to policy" | ⚠️ See Finding 2 |

**SQL cross-check:** `companies.owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT`. The source doesn't define which users can create companies. The proposal correctly doesn't invent this.

### 3.5 COMPANY-READ: `GET /api/v1/companies/:companyId` ✅ PASS

| Field | Proposal | Catalog | Match |
|-------|----------|---------|-------|
| Actor | "authorized member/owner/admin" | "company ownership/membership and company-management permission" | ✅ |

### 3.6 COMPANY-UPDATE: `PATCH /api/v1/companies/:companyId` ✅ PASS

| Field | Proposal | Catalog | Match |
|-------|----------|---------|-------|
| Actor | "owner/admin policy" | "employer/owner/admin according to policy" | ✅ |

### 3.7 ORG-BRANCH/DEPARTMENT/TEAM: Nested resources ✅ PASS

| Field | Proposal | Catalog (API-COMPANY-002) | Match |
|-------|----------|--------------------------|-------|
| Method/Path | `POST/PATCH /api/v1/companies/:companyId/{branches,departments,teams}/:id?` | "TBD — nested company administration resources" | ✅ |
| Actor | "owner/admin" | "company owner/admin with management permission" | ✅ |
| Acceptance | Deactivation safety | "deactivation cannot orphan required manager/lead relationships" | ✅ |

**SQL cross-check:** `departments.head_member_id` FK: `ON DELETE RESTRICT`. `teams.lead_member_id` FK: `ON DELETE RESTRICT`. `company_members.manager_member_id` FK: `ON DELETE RESTRICT`. All correct.

### 3.8 MEMBERSHIP-INVITE: `POST /api/v1/companies/:companyId/members` ✅ PASS

| Field | Proposal | Catalog (API-COMPANY-003) | Match |
|-------|----------|--------------------------|-------|
| Actor | "owner/admin" | "company owner/admin" | ✅ |
| Idempotency | "membership unique key" | "repeated invite/deactivate commands are safe" | ✅ |

### 3.9 MEMBERSHIP-ACCEPT: `POST /api/v1/membership-invitations/:invitationId/accept` ⚠️ MINOR FIX

| Field | Proposal | Source | Match |
|-------|----------|--------|-------|
| Status | "NEEDS SOURCE/DECISION" | Catalog says "membership commands" but doesn't define invitation accept | ✅ Honest gap |

**SQL cross-check:** `company_members` has `invited_at`, `invited_by` but NO `invitation_token` column. The invitation source/table is not defined in the SQL. The proposal correctly flags this as NEEDS SOURCE/DECISION.

### 3.10 MEMBERSHIP-DEACTIVATE: `POST /api/v1/companies/:companyId/members/:memberId/deactivate` ✅ PASS

| Field | Proposal | Catalog | Match |
|-------|----------|---------|-------|
| Actor | "owner/admin" | "company owner/admin" | ✅ |
| Reassignment guard | (implied from scope) | "active owner/lead/manager relationships cannot be deactivated without reassignment" | ✅ |

### 3.11 MEMBERSHIP-LEAVE: `POST /api/v1/companies/:companyId/membership/leave` ⚠️ MINOR FIX

| Field | Proposal | Source | Match |
|-------|----------|--------|-------|
| Actor | "active member" | Catalog says "membership commands" for "company owner/admin" | ⚠️ See Finding 4 |

### 3.12 MEMBERSHIP-REJOIN: `POST /api/v1/companies/:companyId/membership/rejoin` ✅ PASS

| Field | Proposal | Scope §5 | Match |
|-------|----------|----------|-------|
| Policy | "reactivates existing membership row" | "Rejoin reactivates the existing membership row" | ✅ |

---

## 4. Cross-Cutting Verifications

### 4.1 Client Boundary (UserContextClient vs SystemClient) ⚠️ MINOR FIX

| Endpoint | Should Use | Reason |
|----------|------------|--------|
| AUTH-ME | UserContextClient | `users` has `users_own_read` RLS policy |
| AUTH-SESSION (GET) | SystemClient | `user_sessions` has no authenticated SELECT grant |
| AUTH-SESSION (revoke) | SystemClient | Business write via trusted path |
| COMPANY-READ | SystemClient | `companies` has no authenticated SELECT grant |
| COMPANY-CREATE | SystemClient | Business write via trusted path |
| COMPANY-UPDATE | SystemClient | Business write via trusted path |
| ORG-* | SystemClient | Business writes via trusted path |
| MEMBERSHIP-* | SystemClient | Business writes via trusted path |

**Gap:** The proposal doesn't specify which endpoint uses which client boundary. The catalog defines this per endpoint (§3A: "User-facing personal/catalog reads use UserContextClient + approved RLS"; §3B: no authenticated grants for company tables → SystemClient).

### 4.2 Cross-Company Isolation ✅ PASS

- Server derives ownership/company from JWT (proposal correctly states: "Client never supplies authoritative user_id, actor role or trusted company_id")
- Uniform 404 for cross-company access (prevents information leak)
- `is_company_member()` function in 17_rls.sql checks company-specific membership

### 4.3 RLS Applicability ✅ PASS

- `users`, `user_security_log`, `login_history`: authenticated SELECT with own-user policies → UserContextClient
- `companies`, `company_members`, `branches`, `departments`, `teams`, `company_settings`: NO authenticated SELECT grants → SystemClient
- All writes: SystemClient (REVOKE ALL on all tables FROM anon, authenticated)

### 4.4 Idempotency ✅ PASS

- AUTH-BOOTSTRAP: existing user identity (repeat safe)
- AUTH-SESSION: session identity (repeat safe)
- COMPANY operations: domain keys (slug uniqueness, company_id)
- MEMBERSHIP operations: unique `(company_id, user_id)` constraint
- No generic in-memory idempotency invented

### 4.5 Error Envelope ✅ PASS

- Proposal states: "Responses use the stable envelope"
- Decision-06 vocabulary correctly referenced
- No invented error codes

### 4.6 Outbox Event Disposition ✅ PASS

- Company CRUD: "TBD; no event invented" → fail-closed (no registered routes)
- Membership: "TBD; invitation event only after approved contract" → fail-closed
- Correctly defers to when contracts are approved

### 4.7 PII and Secret Protection ✅ PASS

- Proposal states: "exclude secrets, token hashes and sensitive audit metadata"
- AUTH-BOOTSTRAP response: "safe public user/account summary; no privileged fields or secrets"

### 4.8 Scope Creep Check ✅ PASS

- No `application.submitted`, notification, job, candidate, referral, interview, or messaging endpoints
- No new subscription/provider behavior
- No new SQL tables, events, or queue names

---

## 5. Issues Found

### Finding-1: AUTH-BOOTSTRAP Actor Description Vague

| Attribute | Value |
|-----------|-------|
| **Severity** | LOW |
| **Endpoint** | AUTH-BOOTSTRAP |
| **Current** | "Supabase-verified signup/callback caller" |
| **Source** | Catalog API-AUTH-001: "unauthenticated signup user / authenticated callback" |
| **Issue** | "Supabase-verified signup/callback caller" conflates two distinct caller types. The source distinguishes: (1) unauthenticated signup user initiating signup, (2) authenticated callback from Supabase after verification. The NestJS endpoint handles the callback, not the initial signup. |
| **Impact** | LOW — implementation clarity |
| **Fix** | Change to: "NestJS endpoint handling Supabase Auth verified callback" |

### Finding-2: COMPANY-CREATE "Eligible Authenticated User" Vague

| Attribute | Value |
|-----------|-------|
| **Severity** | LOW |
| **Endpoint** | COMPANY-CREATE |
| **Current** | "eligible authenticated user" |
| **Source** | Catalog API-COMPANY-001: "employer/owner/admin according to policy" |
| **Issue** | "eligible authenticated user" doesn't specify which roles can create companies. The source says "employer/owner/admin according to policy" but doesn't define the exact eligibility rule. The proposal correctly doesn't invent this, but should reference the open decision. |
| **Impact** | LOW — decision clarity |
| **Fix** | Change to: "employer/owner/admin — eligibility policy TBD (see Decision 2)" |

### Finding-3: No Client Boundary Documentation

| Attribute | Value |
|-----------|-------|
| **Severity** | LOW |
| **Section** | All endpoints |
| **Source** | Catalog §1: "User-facing personal/catalog reads use UserContextClient + approved RLS where available. Document/parsing reads and all business writes use trusted SystemClient" |
| **Issue** | The proposal doesn't specify which endpoint uses UserContextClient vs SystemClient. This is a Phase 07 architecture requirement ("API must choose and document the path per use-case; it must not mix clients implicitly"). |
| **Impact** | LOW — implementation guidance (aids correct DI wiring) |
| **Fix** | Add a column or note to the endpoint table specifying client boundary per endpoint |

### Finding-4: MEMBERSHIP-LEAVE No Sole-Owner Guard

| Attribute | Value |
|-----------|-------|
| **Severity** | LOW |
| **Endpoint** | MEMBERSHIP-LEAVE |
| **Current** | Actor: "active member" |
| **Source** | Scope §7: "sole active owner deactivate/remove नहीं हो सकता जब तक approved ownership transfer या company deactivation पहले complete न हो" |
| **Issue** | The proposal allows any "active member" to leave. If the sole active owner leaves, the company becomes ownerless. The scope document addresses this for deactivation but not explicitly for leave. |
| **Impact** | LOW — edge case guard |
| **Fix** | Add note: "Sole active owner cannot leave; must transfer ownership or deactivate company first" |

### Finding-5: `company_settings` Not Explicitly in COMPANY Endpoints

| Attribute | Value |
|-----------|-------|
| **Severity** | LOW |
| **Endpoints** | COMPANY-CREATE, COMPANY-UPDATE |
| **Source** | Scope: "`company_settings`" listed in tables to use; `04_companies.sql` defines `company_settings` as 1:1 extension of `companies` |
| **Issue** | The proposal doesn't mention `company_settings` in COMPANY-CREATE or COMPANY-UPDATE. The SQL defines it as a 1:1 extension with `job_approval_required`, `auto_shortlist_enabled`, `ai_matching_enabled`, notification defaults, and custom JSONB. COMPANY-CREATE should auto-create default settings; COMPANY-UPDATE should handle settings updates. |
| **Impact** | LOW — completeness |
| **Fix** | Add note: "COMPANY-CREATE auto-creates default company_settings row. COMPANY-UPDATE handles settings sub-resource." |

### Finding-6: No Error Codes per Endpoint

| Attribute | Value |
|-----------|-------|
| **Severity** | LOW |
| **Section** | All endpoints |
| **Source** | Catalog §7 exit criteria: "Error codes" listed as required per endpoint |
| **Issue** | The catalog lists specific error codes for each endpoint (e.g., COMPANY-COMMAND: VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, RATE_LIMITED). The proposal doesn't list error codes per endpoint. |
| **Impact** | LOW — freeze-stage concern (required before final contract freeze) |
| **Fix** | Add error codes column to endpoint table, or note "Error codes per Phase 06 catalog entries" |

---

## 6. What Is NOT an Issue

| Check | Result |
|-------|--------|
| Zero invented API paths | ✅ All 14 endpoints trace to catalog |
| Zero invented tables/columns | ✅ All references match SQL 03-04 |
| Zero invented events | ✅ Correctly defers to approved contracts |
| Zero invented business rules | ✅ All rules trace to Phase 05/06/08 |
| TBD entries honest | ✅ 5 decisions correctly identified |
| Path conventions reasonable | ✅ RESTful, consistent prefix |
| Rejoin = existing row | ✅ Matches scope §5 |
| Outbox fail-closed | ✅ Correctly deferred |
| No scope creep | ✅ No unrelated domains |
| Proposal not treated as frozen | ✅ Status: "PROPOSAL — NOT FROZEN" |
| Controller coding blocked | ✅ "Until these five decisions are approved, this proposal must not be treated as a frozen public API contract" |

---

## 7. Comparison with Previous Reviews

| Area | Contract Review (Freebuff) | Proposal Review (Freebuff) |
|------|---------------------------|---------------------------|
| Overall | PASS WITH MINOR FIXES (4 LOW) | PASS WITH MINOR FIXES (6 LOW) |
| Client boundary | Not addressed (LOW) | Found gap (LOW) — carried |
| Owner deactivation | Found (LOW) | Partially addressed via scope §7 |
| Sole owner edge | Addressed in scope §7 | Found in MEMBERSHIP-LEAVE (LOW) |
| DTO field mapping | Found (3 LOW) | Not applicable (proposal stage) |
| Actor specification | Found (LOW) | Found 2 LOW (AUTH-BOOTSTRAP, COMPANY-CREATE) |
| company_settings | Not addressed | Found (LOW) |
| Error codes | Not addressed | Found (LOW) |

---

## 8. Five Self-Identified Decisions — Verification

| # | Decision | Source Gap? | Correctly Flagged? |
|---|----------|-------------|-------------------|
| 1 | `/auth/bootstrap` needed vs Supabase callback outside NestJS | Yes — catalog says TBD, Supabase Auth integration undefined | ✅ |
| 2 | Owner/admin eligibility policy | Yes — baseline doesn't define universal "eligible user" rule | ✅ |
| 3 | Invitation token source/table | Yes — `company_members` has no `invitation_token` column | ✅ |
| 4 | Branch/dept/team separate vs single endpoint | Yes — catalog says TBD | ✅ |
| 5 | Session revoke granularity | Yes — catalog says "session/security operations" (TBD) | ✅ |

---

## 9. Final Status

| Category | Status |
|----------|--------|
| **Overall Verdict** | ✅ **PASS WITH MINOR FIXES** |
| **14 Endpoints** | All correctly traced to catalog |
| **SQL Grounding** | ✅ Tables, constraints, triggers matched |
| **Cross-Company Isolation** | ✅ Server-derived, 404 uniform |
| **RLS/SystemClient** | ✅ Correct per Decision-01 |
| **Client Boundary** | ⚠️ 1 LOW (not documented per endpoint) |
| **Idempotency** | ✅ Domain keys, no generic store |
| **Outbox** | ✅ Fail-closed, correctly deferred |
| **Rejoin** | ✅ Existing row reactivate |
| **Sole Owner Guard** | ⚠️ 1 LOW (MEMBERSHIP-LEAVE) |
| **company_settings** | ⚠️ 1 LOW (not in COMPANY endpoints) |
| **Error Codes** | ⚠️ 1 LOW (not per endpoint) |
| **Inventions** | ✅ ZERO |
| **Controller Coding** | ✅ BLOCKED until 5 decisions approved |
| **Decisions Flagged** | ✅ 5 correctly identified |

**The proposal is architecturally sound and correctly grounded. The 6 LOW findings are implementation-level enhancements for clarity and completeness. No BLOCKER, HIGH, or MEDIUM issues. The 5 self-identified decisions are correctly scoped and must be resolved before contract freeze.** 🚀

---

*Report generated by Freebuff — independent reviewer. No files modified during this review. All source files cross-checked against actual SQL baseline, requirements, architecture, and Decision documents.*
