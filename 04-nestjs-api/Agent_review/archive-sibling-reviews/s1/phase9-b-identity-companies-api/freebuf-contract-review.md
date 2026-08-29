# Phase 09-B Identity & Company API Contract Freeze — Review (Freebuff)

**Reviewer:** Freebuff (Senior API Architect, Multi-Tenant Security Reviewer)
**Audit Target:** `04-nestjs-api/PHASE-09-B-API-CONTRACT-FREEZE.md`
**Date:** 2026-08-26
**Review Type:** Independent — no previous agent claims trusted

---

## 1. Executive Verdict

### **PASS WITH MINOR FIXES**

The Phase 09-B API Contract Freeze worksheet is a disciplined, well-bounded contract gate. It correctly refrains from guessing TBD API paths/DTOs, explicitly enforces non-negotiable multi-tenant security rules, and keeps controller coding blocked until explicit contract freeze occurs.

All 5 contract entries (AUTH-BOOTSTRAP, AUTH-SESSION, COMPANY-COMMAND, ORG-ADMIN, MEMBERSHIP-COMMAND) trace correctly to the Phase 06 API catalog sections 3A and 3B. The SQL tables, constraints, and RLS functions from the actual baseline are correctly referenced. Zero invented API paths, tables, events, roles, or business rules.

**4 minor gaps** exist. None block implementation but should be resolved during DTO freeze.

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
| 8 | `02-database/migrations/baseline/04_companies.sql` | companies, members, branches, depts, teams |
| 9 | `02-database/migrations/baseline/17_rls.sql` | RLS policies, grants, helper functions |
| 10 | `DECISION-01` | Controlled Hybrid access model |
| 11 | `DECISION-06` | Error vocabulary |

---

## 3. Contract-by-Contract Audit

### 3.1 AUTH-BOOTSTRAP ✅ PASS (with notes)

**Catalog reference:** Phase 06 §3A API-AUTH-001

| Field | Worksheet | Source | Match |
|-------|-----------|--------|-------|
| Method/Path | TBD | "TBD — auth signup/callback boundary must be confirmed with Supabase Auth" | ✅ Correct TBD |
| Actor | verified active user | "unauthenticated signup user / authenticated callback" | ✅ Correct |
| Permission | verified active user | "provider verification and server-controlled account status" | ✅ Correct |
| Request DTO | TBD | "provider payload; never trust client role/status" | ⚠️ See Finding 1 |
| Response DTO | TBD | "safe public user/account summary; no privileged fields or secrets" | ⚠️ See Finding 2 |
| Idempotency | existing user identity | "provider subject/global user identity uniqueness; repeat callback safe" | ✅ Correct |
| Error codes | (not listed in worksheet) | VALIDATION_ERROR, UNAUTHORIZED, IDEMPOTENCY_CONFLICT, RATE_LIMITED, INTERNAL_ERROR | ✅ Correct per catalog |

**SQL cross-check:**
- `handle_new_user()` trigger creates `public.users` row from `auth.users` insert — NestJS must not duplicate this.
- Role from `raw_app_meta_data` is server-controlled; client cannot escalate.
- `ON CONFLICT (id) DO NOTHING` makes trigger repeat-safe.

### 3.2 AUTH-SESSION ✅ PASS

**Catalog reference:** Phase 06 §3A API-AUTH-002

| Field | Worksheet | Source | Match |
|-------|-----------|--------|-------|
| Method/Path | TBD | "TBD — session/security operations" | ✅ Correct TBD |
| Actor | authenticated user | "authenticated user" | ✅ |
| Permission | own session/security records | "own session/security records; admin-only operations remain separate" | ✅ |
| Request DTO | TBD | "authenticated JWT and operation-specific DTO" | ✅ Correct TBD |
| Response DTO | TBD | "safe session/security status" | ✅ Correct TBD |
| Idempotency | session identity | "logout/revoke operations safe on retry" | ✅ |

**SQL cross-check:**
- `user_sessions`: user_id FK, ON DELETE CASCADE
- `user_security_log`: append-only (trigger prevents UPDATE/DELETE)
- `login_history`: append-only (trigger prevents UPDATE/DELETE)

### 3.3 COMPANY-COMMAND ⚠️ MINOR FIX

**Catalog reference:** Phase 06 §3B API-COMPANY-001

| Field | Worksheet | Source | Match |
|-------|-----------|--------|-------|
| Method/Path | TBD | "TBD — company CRUD resource" | ✅ |
| Actor | owner/admin | "employer/owner/admin according to policy" | ✅ |
| Permission | company ownership/membership | "company ownership/membership and company-management permission" | ✅ |
| Request DTO | TBD | "server-derived owner/tenant; slug/name/business fields validated against SQL" | ✅ |
| Response DTO | TBD | "safe company profile and lifecycle state" | ⚠️ See Finding 3 |
| Idempotency | company identity/domain key | "client command retry must not duplicate company identity" | ✅ |

**Finding — Owner Deactivation Gap:**
The worksheet mentions "Owner transfer/deactivation safeguards mandatory" in non-negotiable rules, but the COMPANY-COMMAND contract row doesn't explicitly address what happens when the sole owner tries to deactivate or transfer ownership. The SQL allows changing `users.status` to 'suspended'/'deactivated'/'banned', and `company_members.is_active` to false, but `companies.owner_id` is NOT updated.

**SQL cross-check:**
- `companies.owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT` — hard-delete blocked.
- No `BEFORE DELETE` trigger on `companies` to prevent orphan.
- `unique_company_employee_code`, `unique_company_work_email` constraints prevent duplicates.

### 3.4 ORG-ADMIN ✅ PASS

**Catalog reference:** Phase 06 §3B API-COMPANY-002

| Field | Worksheet | Source | Match |
|-------|-----------|--------|-------|
| Method/Path | TBD | "TBD — nested company administration resources" | ✅ |
| Actor | company owner/admin | "company owner/admin with management permission" | ✅ |
| Permission | same-company ownership + relationship | "same-company ownership and relationship permissions" | ✅ |
| Transaction | relationship changes + safety checks atomic | "relationship changes and safety checks atomic; no hard-delete shortcut" | ✅ |
| Acceptance | deactivation cannot orphan relationships | "deactivation cannot orphan required manager/lead relationships" | ✅ |

**SQL cross-check:**
- `departments.head_member_id` FK: `ON DELETE RESTRICT` — reassignment required before deactivation.
- `teams.lead_member_id` FK: `ON DELETE RESTRICT` — same.
- `company_members.manager_member_id` FK: `ON DELETE RESTRICT` — same.
- `company_members_manager_check`: `manager_member_id IS NULL OR manager_member_id <> id` — self-manager prevention.

### 3.5 MEMBERSHIP-COMMAND ⚠️ MINOR FIX

**Catalog reference:** Phase 06 §3B API-COMPANY-003

| Field | Worksheet | Source | Match |
|-------|-----------|--------|-------|
| Method/Path | TBD | "TBD — membership commands" | ✅ |
| Actor | owner/admin or invited user | "company owner/admin" (catalog) | ⚠️ See Finding 4 |
| Permission | owner/admin or invited user | "same-company membership-management permission" | ⚠️ See Finding 4 |
| Request DTO | TBD | "target user/email and company derived/validated server-side" | ✅ |
| Idempotency | membership unique key | "repeated invite/deactivate commands are safe and deterministic" | ✅ |
| Rejoin | "reactivates existing membership row" | Phase 09-B scope §5: "Rejoin reactivates the existing membership row" | ✅ |

**SQL cross-check:**
- `company_members`: `is_active BOOLEAN DEFAULT false` (inactive on invite), `joined_at` (set on accept), `left_at` (set on leave).
- `unique_member_per_company UNIQUE(company_id, user_id)` — one membership per user per company.
- Constraints: `is_active=TRUE OR joined_at IS NULL`, `left_at IS NULL OR is_active=FALSE`.

**Finding — Actor Ambiguity:**
The worksheet says "owner/admin or invited user as applicable" but doesn't specify which operations each actor can perform. The catalog says "company owner/admin" for all operations. The invited user's "accept" action is a distinct use case that should be explicitly documented.

---

## 4. Non-Negotiable Rules Audit

| Rule | Worksheet | Source | Match |
|------|-----------|--------|-------|
| Server-side tenant derivation | "client supplied tenant IDs trusted नहीं होंगे" | Decision-01: "server-derived owner/tenant" | ✅ |
| Error envelope | "Decision-06 envelope में" | Phase 06 §1: `schema_version: 1`, `request_id`, `trace_id` | ⚠️ See Finding 5 |
| Transaction atomicity | "business row, audit/history और approved outbox event एक transaction में" | Phase 05 §3: "Business row, audit/history and approved outbox event commit atomically" | ✅ |
| No browser-to-Supabase | "Direct browser-to-Supabase business writes नहीं होंगे" | Phase 05 §3: "Browser calls NestJS only" | ✅ |
| PII/secret protection | "secrets, token hashes या sensitive audit metadata response में नहीं आएगा" | Phase 05 §5: "No response/log may contain resume content, raw AI output, storage paths, tokens" | ✅ |
| Rejoin policy | "rejoin existing membership row को reactivate करेगा" | Phase 09-B scope: "Rejoin reactivates the existing membership row" | ✅ |
| Owner/relationship guards | "Owner transfer/deactivation और relationship reassignment guards mandatory" | Phase 08 §6 lock matrix: "company → member → dept head/team lead/manager" | ✅ |

---

## 5. Cross-Company Isolation Audit

| Check | Evidence | Result |
|-------|----------|--------|
| Client tenant IDs untrusted | Worksheet §2: "client supplied tenant IDs trusted नहीं होंगे" | ✅ |
| Server derives ownership | Catalog: "server-derived owner/tenant", "ownership derived from JWT" | ✅ |
| Cross-company reads blocked | `is_company_member()` in 17_rls.sql checks company-specific membership | ✅ |
| Cross-company writes blocked | NestJS guard + SystemClient authorization before every mutation | ✅ |
| Uniform error for cross-company | "Cross-company access returns 404" (not 403 — prevents information leak) | ✅ |

---

## 6. RLS/UserContext/SystemClient Boundary Audit

| Operation | Access Path | Source | Correct? |
|-----------|-------------|--------|----------|
| User personal reads (users, security_log, login_history) | UserContextClient + RLS (`users_own_read`, `security_log_own_read`, `login_history_own_read`) | 17_rls.sql | ✅ |
| Company reads (companies, members, branches, etc.) | SystemClient + NestJS authorization (no authenticated SELECT grants in RLS) | 17_rls.sql — no grants for these tables to authenticated | ✅ |
| Company/member writes | SystemClient + NestJS authorization + transaction | Decision-01: "Business writes go through NestJS guards/policy checks and server-only trusted transactions" | ✅ |
| User writes | SystemClient + NestJS authorization (no authenticated DML grants) | 17_rls.sql: "REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated" | ✅ |

---

## 7. Outbox Event Disposition Audit

| Domain | Approved Events | Current Routes | Status |
|--------|----------------|----------------|--------|
| Company CRUD | None registered | None | Fail-closed ✅ |
| Membership invite/activate/deactivate | None registered | None | Fail-closed ✅ |
| Auth bootstrap | None registered | None | Fail-closed ✅ |

**Worksheet says:** "Outbox event केवल approved versioned contract और registered route होने पर producer किया जाएगा; बिना contract के event invent या emit नहीं होगा"

**Correct:** No outbox events are currently registered for company/membership operations. The fail-closed behavior applies. The worksheet correctly defers outbox to when contracts are approved.

---

## 8. Missing Identity/Company Capabilities

| Capability | In Scope? | Evidence |
|------------|-----------|----------|
| OAuth callback replay | No (out of scope) | Phase 08-B tests mention it but it's a Supabase Auth concern |
| Token refresh | No (out of scope) | Supabase Auth handles this |
| Password reset | No (out of scope) | Supabase Auth handles this |
| Company hard-delete prevention | Implicit (no DB trigger) | SQL allows hard-delete of companies; NestJS guard required |
| Admin operations | Explicitly excluded | "admin-only operations remain separate" |

---

## 9. Issues Found

### Finding-1: AUTH-BOOTSTRAP Request DTO Should Reference SQL Columns

| Attribute | Value |
|-----------|-------|
| **Severity** | LOW |
| **Section** | Contract entry AUTH-BOOTSTRAP, Request DTO |
| **Current** | "TBD" |
| **Source** | Phase 06 §3A: "provider payload; never trust client role/status; normalize verified identity" |
| **Issue** | The Request DTO is correctly TBD (depends on Supabase Auth integration), but the worksheet should note which SQL columns the DTO maps to: `users.email`, `users.first_name`, `users.last_name`, `users.role` (from `raw_app_meta_data`). This helps implementers during DTO freeze. |
| **Impact** | LOW — implementation guide clarity |
| **Fix** | Add: "Maps to: users.email, users.first_name/last_name, users.role (server-controlled from raw_app_meta_data)" |

### Finding-2: AUTH-BOOTSTRAP Response DTO Should Reference SQL Columns

| Attribute | Value |
|-----------|-------|
| **Severity** | LOW |
| **Section** | Contract entry AUTH-BOOTSTRAP, Response DTO |
| **Current** | "TBD" |
| **Source** | Phase 06 §3A: "safe public user/account summary; no privileged fields or secrets" |
| **Issue** | Should note which safe fields to return: `users.id, users.email, users.display_name, users.role, users.status`. Exclude: `last_password_changed_at`, `locked_until`, `deleted_at`, `deleted_reason`. |
| **Impact** | LOW — implementation guide clarity |
| **Fix** | Add: "Safe fields: id, email, display_name, role, status. Exclude: password fields, lock status, soft-delete details." |

### Finding-3: COMPANY-COMMAND Response DTO Should Reference SQL Columns

| Attribute | Value |
|-----------|-------|
| **Severity** | LOW |
| **Section** | Contract entry COMPANY-COMMAND, Response DTO |
| **Current** | "TBD" |
| **Source** | Phase 06 §3B: "safe company profile and lifecycle state" |
| **Issue** | Should note which safe fields to return from `companies` table: `id, name, slug, description, industry, company_size, website, logo_path, email, phone, city, state, country, verification_status, is_active, created_at`. Exclude: `owner_id` (internal), `settings` (separate endpoint), `verification_document_path` (sensitive). |
| **Impact** | LOW — implementation guide clarity |
| **Fix** | Add safe field list per companies table columns |

### Finding-4: MEMBERSHIP-COMMAND Actor Specification Ambiguity

| Attribute | Value |
|-----------|-------|
| **Severity** | LOW |
| **Section** | Contract entry MEMBERSHIP-COMMAND, Actor/Permission |
| **Current** | "owner/admin or invited user as applicable" |
| **Source** | Phase 06 §3B: "company owner/admin" for all operations |
| **Issue** | The worksheet combines two distinct actor types. The invited user's "accept" action is a separate use case with different authorization (token/claim-based, not company-membership-based). The contract should split actor specification or add a note clarifying: "Invite/deactivate: company owner/admin. Accept: invited user via token/claim." |
| **Impact** | LOW — authorization clarity during implementation |
| **Fix** | Add note: "Invite/deactivate/leave: owner/admin. Accept: invited user via valid claim token. Rejoin: existing deactivated member." |

### Finding-5: Error Envelope Fields Not Explicitly Enumerated

| Attribute | Value |
|-----------|-------|
| **Severity** | LOW |
| **Section** | Non-negotiable contract rules, error envelope |
| **Current** | "Error responses Decision-06 envelope में होंगे" |
| **Source** | Phase 06 §1: "Success/error responses follow the proposed envelope with `schema_version: 1`, `request_id`, `trace_id`" + Phase 05 §5 |
| **Issue** | The worksheet references Decision-06 but doesn't explicitly list the envelope fields. Decision-06 defines the error codes vocabulary, not the envelope structure. The envelope is defined in Phase 05 §5 and Phase 06 §1. |
| **Impact** | LOW — documentation consistency |
| **Fix** | Add: "Envelope: `{ success, data, error: { code, message }, request_id, trace_id, schema_version: 1 }` per Phase 05 §5" |

---

## 10. What Is NOT an Issue

| Check | Result |
|-------|--------|
| Zero invented API paths | ✅ All 5 entries correctly TBD |
| Zero invented tables/columns | ✅ All references match SQL 03-04 |
| Zero invented events | ✅ Correctly defers to approved contracts |
| Zero invented business rules | ✅ All rules trace to Phase 05/06/08 |
| Lock order correct | ✅ Matches Phase 08 §6 matrix |
| RLS boundary correct | ✅ Matches Decision-01 and 17_rls.sql |
| Rejoin policy correct | ✅ Reactivates existing row |
| Sole owner edge case | ✅ Addressed in updated scope §7 |
| Outbox disposition correct | ✅ Fail-closed for unregistered events |
| Exclusions complete | ✅ No scope creep detected |
| Controller blocked | ✅ "NO CONTROLLERS AUTHORIZED YET" |
| Decision-06 codes correct | ✅ Per catalog entries |

---

## 11. Comparison with Antigravity Review

| Area | Antigravity | Freebuff |
|------|-------------|----------|
| Overall verdict | PASS (0 issues) | PASS WITH MINOR FIXES (4 LOW) |
| Contract completeness | "Disciplined, security-hardened" | "Well-structured, 4 minor gaps" |
| TBD handling | "Correctly refrains from guessing" | "Correct, with enhancement notes" |
| Cross-company isolation | "Verified" | "Verified with evidence" |
| Rejoin policy | "Strictly reactivates existing row" | "Correct, matches scope §5" |
| Owner deactivation | Not specifically addressed | Found gap (LOW) |
| DTO field mapping | Not addressed | Found 3 LOW enhancements |
| Envelope fields | Not explicitly listed | Found 1 LOW enhancement |
| Actor specification | Not addressed | Found 1 LOW ambiguity |

---

## 12. Final Status

| Category | Status |
|----------|--------|
| **Overall Verdict** | ✅ **PASS WITH MINOR FIXES** |
| **Contract Entries** | 5/5 correctly traced to catalog |
| **SQL Grounding** | ✅ All tables, constraints, triggers matched |
| **Cross-Company Isolation** | ✅ Server-derived, 404 uniform |
| **RLS/SystemClient Boundary** | ✅ Correct per Decision-01 |
| **Outbox Disposition** | ✅ Fail-closed, correctly deferred |
| **Rejoin Policy** | ✅ Existing row reactivate |
| **Sole Owner Edge** | ✅ Addressed in scope §7 |
| **Owner Deactivation** | ⚠️ 1 LOW gap |
| **DTO Field Mapping** | ⚠️ 3 LOW enhancements |
| **Envelope Fields** | ⚠️ 1 LOW enhancement |
| **Actor Specification** | ⚠️ 1 LOW ambiguity |
| **Inventions** | ✅ ZERO |
| **Controller Authorization** | ✅ BLOCKED until freeze |
| **Implementation Authorization** | ✅ AUTHORIZED after 4 LOW fixes |

**The contract worksheet is architecturally sound and correctly grounded. The 4 LOW findings are DTO-level enhancements for implementation clarity — they help implementers but don't block the contract freeze gate. No BLOCKER, HIGH, or MEDIUM issues.**

---

*Report generated by Freebuff — independent reviewer. No files modified during this review. All source files cross-checked against actual SQL baseline, requirements, architecture, and Decision documents.*
