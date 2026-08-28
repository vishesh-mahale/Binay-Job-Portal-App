# Phase 09-B Identity, Companies & Membership — Scope Review (Freebuff)

**Reviewer:** Freebuff (Senior NestJS, PostgreSQL, Multi-Tenant Security Reviewer)
**Audit Target:** `04-nestjs-api/PHASE-09-B-IDENTITY-COMPANIES-SCOPE.md`
**Date:** 2026-08-26
**Review Type:** Independent — no previous agent claims trusted

---

## 1. Executive Verdict

### **PASS WITH MINOR FIXES**

The Phase 09-B scope document is well-structured, correctly bounded, and grounded in the authoritative source files. All 7 included use cases trace to Phase 05 requirement IDs and Phase 08-B work items. The SQL tables, constraints, RLS functions, and lock-order matrix from the actual baseline are correctly referenced. Zero invented API paths, tables, events, roles, or business rules.

However, **5 minor gaps** exist in the scope definition. These do not block implementation but should be resolved before or during coding to prevent ambiguity.

---

## 2. Files and Sources Inspected

| # | File | Purpose |
|---|------|---------|
| 1 | `AGENTS.md` | Mandatory working rules |
| 2 | `PHASE-05-FINAL-REQUIREMENTS.md` | REQ-AUTH-001..007, REQ-COMPANY-001..005 |
| 3 | `PHASE-06-API-CATALOG.md` §3A, §3B | Auth and Company API catalogs |
| 4 | `PHASE-07-ARCHITECTURE.md` | Tenant boundary, access model |
| 5 | `PHASE-08-IMPLEMENTATION-PLAN.md` Phase 08-B | Dependency/test rules |
| 6 | `02-database/migrations/baseline/02_enums.sql` | user_role, account_status, company enums |
| 7 | `02-database/migrations/baseline/03_users_auth.sql` | users, user_sessions, user_security_log, triggers |
| 8 | `02-database/migrations/baseline/04_companies.sql` | companies, branches, departments, teams, members, settings |
| 9 | `02-database/migrations/baseline/17_rls.sql` | RLS policies, grants, helper functions |
| 10 | `DECISION-01-NESTJS-SUPABASE-ACCESS-MODEL-HINGLISH.md` | Controlled Hybrid access model |
| 11 | `DECISION-06-API-ERROR-VOCABULARY-HINGLISH.md` | Error vocabulary |

---

## 3. Scope Verification Matrix — 14 Points

### 3.1 User/Account Authorization Rules ✅ PASS

**Scope says:** "Authenticated user bootstrap/profile read using verified request context", "Account status, role and ownership checks", "Invalid/expired JWT rejected with approved error envelope", "Inactive/deleted user cannot perform business commands."

**Source verification:**
- `03_users_auth.sql`: `users` table has `role` (enum: candidate/employer/hr/admin), `status` (enum: pending_verification/active/suspended/deactivated/banned), `deleted_at` soft-delete.
- `17_rls.sql`: `users_own_read` policy: `USING (id=auth.uid())` — authenticated can only read own row.
- `03_users_auth.sql`: `handle_new_user()` trigger reads `raw_app_meta_data` for role — server-controlled, not client-trusted.
- `03_users_auth.sql`: `reject_user_hard_delete()` trigger prevents physical deletion of users.
- Phase 05 §3: "Browser calls NestJS only... Business writes use trusted SystemClient."

**Result:** Scope correctly covers user auth rules grounded in SQL.

### 3.2 Company Ownership and Membership Permissions ✅ PASS

**Scope says:** "Company create/read/update lifecycle where catalog authorizes it", "Company member invite/add, accept, deactivate/leave and rejoin using the existing membership row policy."

**Source verification:**
- `04_companies.sql`: `companies.owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT` — owner identified, hard-delete blocked.
- `04_companies.sql`: `company_members` has `is_active`, `invited_at`, `joined_at`, `left_at` fields with constraints: `is_active=TRUE OR joined_at IS NULL`, `left_at IS NULL OR is_active=FALSE`.
- `17_rls.sql`: No authenticated SELECT or DML grants on `company_members` — all company/member access through SystemClient + NestJS authorization.

**Result:** Scope correctly maps to SQL structure and constraints.

### 3.3 Cross-Company Read/Write Isolation ✅ PASS

**Scope says:** "Company A's user Company B's resource read/update cannot do."

**Source verification:**
- `17_rls.sql`: `is_company_member(p_company_id)` function checks ownership or active membership in the specific company. Default-deny for all tables without explicit grants.
- Phase 08-B tests: "Cross-user and cross-company negative reads/writes" explicitly required.
- Phase 07 §5: "Cross-tenant negative reads/writes and direct authenticated DML-denial tests are mandatory."

**Result:** Scope correctly requires cross-company isolation tested against RLS + NestJS guard boundary.

### 3.4 Branch, Department, and Team Relationships ✅ PASS

**Scope says:** "Company branch, department and team administration."

**Source verification:**
- `04_companies.sql`: `company_branches(company_id)`, `departments(company_id)`, `teams(department_id)` with identity constraints: `UNIQUE(id, company_id)`, `UNIQUE(company_id, name)`.
- `departments.head_member_id` FK: `REFERENCES company_members(id, department_id) ON DELETE RESTRICT`
- `teams.lead_member_id` FK: `REFERENCES company_members(id, team_id) ON DELETE RESTRICT`
- `company_members.team_id` FK: `REFERENCES teams(id, department_id) ON DELETE RESTRICT` — team requires department.

**Result:** Correctly grounded in SQL constraints and hierarchy.

### 3.5 Member Invite/Accept/Deactivate/Leave/Rejoin Flow ✅ PASS

**Scope says:** "Member invite/add, accept, deactivate/leave and rejoin using the existing membership row policy."

**Source verification:**
- `company_members`: `is_active BOOLEAN NOT NULL DEFAULT false` (inactive on invite), `joined_at TIMESTAMPTZ` (set on accept), `left_at TIMESTAMPTZ` (set on leave).
- Constraints enforce logical consistency: `active requires joined_at`, `left_at implies not active`.
- `unique_member_per_company UNIQUE(company_id, user_id)` prevents duplicate membership.

**Result:** Flow matches SQL lifecycle constraints.

### 3.6 Owner/Admin Role and Status Protections ⚠️ MINOR FIX

**Scope says:** "Owner/admin role/status/deactivation safeguards."

**Gap:** The scope does not address what happens when an owner (the `companies.owner_id` reference) is deactivated, suspended, or banned. The SQL allows changing `users.status` to 'suspended', 'deactivated', or 'banned', and `company_members.is_active` can be set to false. But `companies.owner_id` is NOT updated, and `companies` has `ON DELETE RESTRICT` on the FK. This creates a potential orphaned company scenario where the owner is inactive but the company remains with no active owner.

**Impact:** LOW — NestJS application guard should handle this edge case, but the scope should explicitly document it.

**Recommended fix:** Add to scope: "Owner deactivation/suspension while being the sole active owner must be prevented or must require pre-approved ownership transfer or company deactivation."

### 3.7 Manager, Team-Lead, and Department-Head Reassignment ✅ PASS

**Scope says:** "Member deactivate/leave must resolve/reassign department-head, team-lead, and manager references."

**Source verification:**
- `departments.head_member_id` FK: `ON DELETE RESTRICT` — cannot delete referenced member without reassignment.
- `teams.lead_member_id` FK: `ON DELETE RESTRICT` — same constraint.
- `company_members.manager_member_id` FK: `ON DELETE RESTRICT` — same constraint.
- `company_members_manager_check`: `manager_member_id IS NULL OR manager_member_id <> id` — cannot be own manager.

**Result:** SQL constraints enforce reassignment before deactivation. Scope correctly requires NestJS to handle this.

### 3.8 Sole Owner Self-Deactivation Edge Case ⚠️ MINOR FIX

**Scope does not address:** What happens if the sole company owner tries to deactivate their own membership (`is_active = false, left_at = now()`)?

The SQL allows this — `company_members` constraints don't prevent it. The result would be a company with no active members (and potentially no active owner), which would violate the company's operational integrity.

**Impact:** LOW — This is a business rule that NestJS must enforce.

**Recommended fix:** Add to security acceptance criteria: "Sole owner self-deactivation must be rejected or must trigger mandatory ownership transfer before company deactivation."

### 3.9 UserContextClient/SystemClient and RLS Boundary ⚠️ MINOR FIX

**Scope says:** "User-facing personal/catalog reads use verified user context and RLS boundary." "Business writes use NestJS authorization guard + trusted SystemClient transaction."

**Gap:** The scope does not explicitly document which company-related reads go through which client path. Specifically:
- `companies` table: No authenticated SELECT grant in17_rls.sql for company data. All company reads must go through SystemClient.
- `company_members`: No authenticated SELECT grant. All reads through SystemClient.
- `company_branches`, `departments`, `teams`: No authenticated SELECT grants. All through SystemClient.
- `company_settings`: No authenticated SELECT grant. All through SystemClient.

This is architecturally correct (company/business data goes through SystemClient per Decision-01), but the scope should explicitly state this to avoid implementation ambiguity.

**Impact:** LOW — Implementation will follow the SQL grants correctly, but explicit documentation prevents confusion.

**Recommended fix:** Add a small table mapping company-related reads to their access path (SystemClient vs UserContextClient), similar to the mapping in Decision-01 §4.

### 3.10 Transaction, Audit, and Outbox Requirements ⚠️ MINOR FIX (Largest gap)

**Scope says:** "Company/member writes: business row, required history/audit, and approved outbox event in one transaction; no external calls inside."

**Gap:** The scope does not specify which outbox events are approved for company or membership changes. Looking at Phase 05 §9A and the registered dispatcher routes, there are NO registered outbox routes for company create/update/delete or membership invite/activate/deactivate. This means:
- Any outbox event emitted for company/membership changes would be "unrouted" — Phase 05 says these "fail closed."
- The scope should clarify whether outbox events are currently expected (and would fail closed) or whether the "outbox" mention refers to the future state.

**Impact:** LOW — The fail-closed behavior is correct, but the scope should clarify the current status to avoid implementing unnecessary outbox writes that would be immediately dead-lettered.

**Recommended fix:** Add to scope: "Currently no outbox routes are registered for company/membership events. Outbox writes for these operations are deferred; the fail-closed behavior for unrouted events applies. Phase 08 event producer ownership will assign specific events when their contracts are approved."

### 3.11 Deterministic Lock Ordering ✅ PASS

**Scope says:** "Stable lock order: company → member/user → branch/department/team relationships."

**Source verification:** Phase 08 §6 lock-order matrix: "Company/member deactivation: company → member → department head/team lead/manager references → membership state" (Owner: companies).

**Result:** Correctly matches Phase 08 matrix.

### 3.12 Existing SQL Tables/Constraints/Functions Mapping ✅ PASS

**Scope says:** "Use only existing tables/functions/constraints from SQL 03–04."

**Source verification:**
- Tables: users, user_security_log, user_sessions, companies, company_branches, departments, teams, company_members, company_settings — all present in03 and04.
- Functions: `update_updated_at_column()` (03), `handle_new_user()` (03), `reject_user_hard_delete()` (03), `reject_auth_audit_row_change()` (03).
- RLS functions: `current_user_role()`, `is_company_member()` (17).
- No new tables, functions, or constraints invented.

**Result:** Correctly grounded in executable SQL baseline.

### 3.13 Required Tests ✅ PASS

**Scope lists 8 mandatory test categories:**
1. Auth bootstrap and inactive-account tests ✅
2. Cross-user and cross-company negative read/write tests ✅
3. Owner/admin permission matrix tests ✅
4. Duplicate company/member command tests ✅
5. Member deactivation with unresolved relationship tests ✅
6. Concurrent membership/company update tests with deterministic lock order ✅
7. Transaction rollback proves no partial business/audit/outbox state ✅
8. RLS/trusted-client boundary and error-envelope tests ✅

**Cross-reference with Phase 08-B tests:**
- "Cross-user and cross-company negative reads/writes" ✅
- "Owner/member deactivation guard and role/status transition tests" ✅
- "OAuth callback replay, duplicate bootstrap and session revocation tests" ✅ (not in scope list)
- "Direct authenticated DML denial and trusted-role transaction tests" ✅

**Minor gap:** Phase 08-B includes "OAuth callback replay, duplicate bootstrap and session revocation tests" but the scope list doesn't explicitly mention OAuth replay or session revocation tests. However, this is covered under "Auth bootstrap and inactive-account tests."

**Result:** Test coverage is comprehensive and matches Phase 08-B requirements.

### 3.14 Explicit Exclusions and No Scope Creep ✅ PASS

**Scope says:** Jobs, candidates, applications, referrals, interviews, messages, notifications, new subscription/provider behavior, new SQL tables/events/queue names/API paths without approval, direct browser writes to Supabase.

**Result:** Correctly excludes all out-of-scope domains. No scope creep detected.

---

## 4. Issues Summary

| # | Severity | Issue | Section | Impact | Fix |
|---|----------|-------|---------|--------|-----|
| 1 | LOW | Sole owner self-deactivation edge case not addressed | §4 Security | Business rule gap | Add sole-owner deactivation guard to acceptance criteria |
| 2 | LOW | Owner deactivation/suspension creates potential orphan company | §4 Security | Edge case gap | Document ownership transfer/deactivation guard |
| 3 | LOW | RLS boundary mapping for company reads not explicit | §2 Data/Transaction | Implementation ambiguity | Add table mapping company reads to access paths |
| 4 | LOW | Outbox event status for company/membership changes unclear | §2 Data/Transaction | Coding confusion | Clarify no outbox routes registered; fail-closed |
| 5 | LOW | "OAuth callback replay" and "session revocation" not explicitly in test list | §4 Tests | Minor gap | Add to auth test list |

---

## 5. Comparison with Antigravity Review

| Area | Antigravity | Freebuff |
|------|-------------|----------|
| Overall verdict | PASS (0 issues) | PASS WITH MINOR FIXES (5 LOW) |
| Scope completeness | "Perfectly bounded" | "Well-structured, 5 minor gaps" |
| SQL mapping | "Traceably complete" | "Correctly grounded" |
| Exclusions | "Correctly bars all" | "Correctly excludes" |
| Sole owner edge case | Not addressed | Found (LOW) |
| RLS boundary mapping | Not addressed | Found (LOW) |
| Outbox event status | Not addressed | Found (LOW) |
| Tests | "Comprehensive" | "Comprehensive, 1 minor gap" |

---

## 6. What Is NOT an Issue

- Zero invented API paths, tables, events, queues, or roles ✅
- Zero invented business rules ✅
- Lock order matrix correctly matches Phase 08 ✅
- SQL constraints correctly enforced by scope ✅
- RLS boundary correctly separates user/system paths ✅
- Exclusions correctly block out-of-scope domains ✅
- Error vocabulary correctly references Decision-06 ✅
- Access model correctly references Decision-01 ✅
- "No generic in-memory idempotency" correctly enforced ✅
- "No new SQL tables/events/queue names" correctly enforced ✅

---

## 7. Final Status

| Category | Status |
|----------|--------|
| **Overall Verdict** | ✅ **PASS WITH MINOR FIXES** |
| **Scope Completeness** | ✅ Well-structured |
| **SQL Grounding** | ✅ All 9 tables, 6+ constraints mapped |
| **RLS Mapping** | ⚠️ 1 LOW fix (company read paths) |
| **Security Criteria** | ⚠️ 2 LOW fixes (sole owner, owner deactivation) |
| **Transaction/Outbox** | ⚠️ 1 LOW fix (outbox event clarification) |
| **Tests** | ✅ 8 mandatory categories |
| **Exclusions** | ✅ Complete, no scope creep |
| **Inventions** | ✅ ZERO found |
| **Invented Rules** | ✅ ZERO found |
| **Implementation Authorization** | ✅ AUTHORIZED after 5 LOW fixes |

**The scope is architecturally sound and correctly grounded. The 5 LOW findings are additive documentation clarifications that prevent ambiguity during coding. No BLOCKER, HIGH, or MEDIUM issues. Implementation is authorized after these minor fixes.**

---

*Report generated by Freebuff — independent reviewer. No files modified during this review. All source files cross-checked against actual SQL baseline, requirements, and architecture documents.*
