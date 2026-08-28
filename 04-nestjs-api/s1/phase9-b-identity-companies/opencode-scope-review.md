# Phase 09-B — Identity, Users, Companies & Membership Scope Review

Status: `PASS WITH MINOR FIXES`

Reviewer: opencode (Independent Senior NestJS, PostgreSQL and Multi-Tenant Security reviewer)
Audit target: `04-nestjs-api/PHASE-09-B-IDENTITY-COMPANIES-SCOPE.md`
Date: 2026-08-26

---

## Review methodology

All reference documents were read independently. Each verification point was checked against
actual SQL baseline files (`03_users_auth.sql`, `04_companies.sql`, `17_rls.sql`), approved
architecture (`PHASE-07-ARCHITECTURE.md`), frozen API catalog (`PHASE-06-API-CATALOG.md` §3A/§3B),
approved implementation plan (`PHASE-08-IMPLEMENTATION-PLAN.md` Phase 08-B), Decision-01
access model and Decision-06 error vocabulary. Previous agent reports were not trusted; every
finding is verified against source.

---

## 1. User/account authorization rules — PASS

**Scope §Included use cases 1–2:** Authenticated user bootstrap/profile read; account status, role, ownership checks.
**Scope §Security acceptance criteria 1–2:** Invalid/expired JWT rejected; inactive/deleted user cannot perform business commands.

**SQL03 evidence:**
- `users` table: `role` (user_role enum), `status` (account_status enum), `deleted_at` (TIMESTAMPTZ) — `03_users_auth.sql:78-156`
- `handle_new_user()` trigger creates public.users row after auth.users insert — `03_users_auth.sql:199-266`
- `reject_user_hard_delete()` trigger prevents physical purge — `03_users_auth.sql:305-327`
- `users_updated_at` trigger auto-updates `updated_at` — `03_users_auth.sql:184-190`

**17_rls.sql evidence:**
- `users_own_read` policy: `id=auth.uid()` — `17_rls.sql:178`
- No INSERT/UPDATE/DELETE grants to `authenticated` — `17_rls.sql:152`

**Phase 07 §5:** SystemClient for all business writes; NestJS verifies JWT, account status, role, company scope, ownership before trusted transaction.

**Phase 08-B:** Registration/bootstrap/OAuth verification boundary; session/security operations.

**Verdict:** Scope correctly maps to existing SQL structures. Auth bootstrap as NestJS boundary (not direct Supabase Auth callback) is aligned with Decision-01. No invented rules.

---

## 2. Company ownership and membership permissions — PASS

**Scope §Included use cases 3, 6:** Company CRUD; same-company authorization and cross-company denial.

**SQL04 evidence:**
- `companies.owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT` — `04_companies.sql:80`
- `company_members.user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE` — `04_companies.sql:237`
- `unique_member_per_company UNIQUE (company_id, user_id)` — `04_companies.sql:290`

**17_rls.sql evidence:**
- `is_company_member()` function checks owner_id OR active company_members — `17_rls.sql:18-32`
- RLS enabled on companies, company_members — `17_rls.sql:72,76`
- No authenticated DML grants on companies/company_members — `17_rls.sql:152`

**Phase 06 §3B API-COMPANY-001:** "user cannot access another company; unsafe owner/status changes fail closed"

**Verdict:** Scope correctly identifies ownership derivation from JWT (never request body), same-company checks, and cross-company denial. SQL constraints enforce uniqueness. No invented permissions.

---

## 3. Cross-company read/write isolation — PASS

**Scope §Security acceptance criteria 3:** "Company A का user Company B का resource read/update नहीं कर सकता"

**SQL03/04/17 evidence:**
- `is_company_member()` function in `17_rls.sql:18-32` — checks owner or active membership
- RLS enabled on all relevant tables — `17_rls.sql:68-77`
- Default-deny: `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated` — `17_rls.sql:152`
- Only SELECT grants for authenticated on personal tables — `17_rls.sql:162-176`

**Phase 07 §5:** "RLS remains active as the approved direct-read defense; default-deny tables stay backend-only."
**Phase 07 §12 #1:** "Cross-tenant and cross-user negative authorization tests pass."

**Decision-01 §6:** "Existing RLS limited reads and default-deny defense-in-depth remain active; RLS is not the primary NestJS write path."

**Verdict:** Scope correctly identifies the isolation boundary. Write isolation is NestJS-guard + SystemClient (primary); RLS is defense-in-depth. Tests required in scope match Phase 07 §12 and Phase 08-B test requirements.

---

## 4. Branch, department and team relationships — PASS

**Scope §Included use cases 4:** Company branch, department, and team administration.

**SQL04 evidence:**
- `company_branches.company_id REFERENCES companies(id) ON DELETE CASCADE` — `04_companies.sql:145`
- `departments.company_id REFERENCES companies(id) ON DELETE CASCADE` — `04_companies.sql:185`
- `teams.department_id REFERENCES departments(id) ON DELETE CASCADE` — `04_companies.sql:210`
- Unique constraints: `(company_id, name)` for branches/departments; `(department_id, name)` for teams
- `departments.head_member_id FK → company_members(id, department_id) ON DELETE RESTRICT` — `04_companies.sql:313-316`
- `teams.lead_member_id FK → company_members(id, team_id) ON DELETE RESTRICT` — `04_companies.sql:318-321`

**Phase 06 §3B API-COMPANY-002:** "deactivation cannot orphan required manager/lead relationships"

**Verdict:** Scope correctly maps the hierarchical relationships (Company → Branch → Department → Team) and the FK constraint chain. RESTRICT on head/lead/member deletion prevents orphaning.

---

## 5. Member invite, accept, deactivate, leave and rejoin flow — PASS WITH MINOR FIXES

**Scope §Included use cases 5:** "Company member invite/add, accept, deactivate/leave और rejoin using the existing membership row policy."

**SQL04 evidence:**
- `company_members` lifecycle fields: `is_active`, `invited_at`, `invited_by`, `joined_at`, `left_at` — `04_companies.sql:255-261`
- Constraint: `is_active = FALSE OR joined_at IS NOT NULL` — `04_companies.sql:277-279`
- Constraint: `left_at IS NULL OR is_active = FALSE` — `04_companies.sql:280-282`

**Scope behavior mapping:**

| Flow | Scope behavior | SQL constraint | Match |
|---|---|---|---|
| Invite | Create inactive row | `is_active=false, joined_at=null` | ✓ |
| Accept | Set `is_active=true` + `joined_at` | `is_active=true → joined_at NOT NULL` | ✓ |
| Deactivate | Set `is_active=false` + `left_at` | `left_at → is_active=FALSE` | ✓ |
| Leave | Same as deactivate | Same constraints | ✓ |
| Rejoin | Create new inactive row | Unique `(company_id, user_id)` allows new invite | ✓ |

**Minor finding 1 (LOW):** Scope §Included use cases 5 says "rejoin using the existing membership row policy" but does not explicitly state whether rejoin creates a new row or reactivates the old one. Given `unique_member_per_company` constraint and the lifecycle fields, the correct interpretation is: rejoin creates a new inactive membership row (old row with `left_at` remains as history). This should be clarified in the scope to prevent implementation ambiguity.

**Minor finding 2 (LOW):** Scope does not explicitly mention the `joined_at` assignment on accept. The SQL constraint `is_active = FALSE OR joined_at IS NOT NULL` requires this. The scope should state: "Accept sets `is_active=true` and assigns `joined_at` in the same transaction."

**Verdict:** Core flow is correct. Two minor clarifications recommended.

---

## 6. Owner/admin role/status deactivation safeguards — PASS WITH MINOR FIXES

**Scope §Security acceptance criteria 4:** "Owner/member role, account status और `deleted_at` unsafe transitions fail closed."
**Scope §Security acceptance criteria 5:** "Member deactivate/leave से पहले department-head, team-lead और manager references resolve/reassign करना आवश्यक होगा।"

**SQL04 evidence:**
- `company_members.manager_member_id FK → company_members(id, company_id) ON DELETE RESTRICT` — `04_companies.sql:303-305`
- `departments.head_member_id FK → company_members(id, department_id) ON DELETE RESTRICT` — `04_companies.sql:313-316`
- `teams.lead_member_id FK → company_members(id, team_id) ON DELETE RESTRICT` — `04_companies.sql:318-321`
- `companies.owner_id FK → users(id) ON DELETE RESTRICT` — `04_companies.sql:80`

**Phase 06 §3B API-COMPANY-001:** "unsafe owner/status changes fail closed"
**Phase 06 §3B API-COMPANY-003:** "active owner/lead/manager relationships cannot be deactivated without reassignment"

**Phase 08 lock-order matrix:** "Company/member deactivation: company → member → department head/team lead/manager references → membership state"

**Minor finding 3 (MEDIUM):** Scope §Security acceptance criteria says "Owner/member role, account status और `deleted_at` unsafe transitions fail closed" but does not explicitly state:
- Owner cannot be deactivated/transferred without explicit owner transfer (SQL: `owner_id` ON DELETE RESTRICT)
- Company owner cannot be removed from company_members while remaining owner
- Owner role downgrade or status change must go through approved company transfer flow

The SQL baseline has `ON DELETE RESTRICT` on `owner_id` but no explicit "owner cannot be removed" trigger. NestJS must enforce this at the application level. The scope should explicitly state: "Company owner cannot be deactivated or removed without prior owner transfer through an approved company ownership transfer command."

**Minor finding 4 (LOW):** Scope does not mention the `unique_company_employee_code` and `unique_company_work_email` constraints from SQL04 (`04_companies.sql:291-292`). These are relevant for the invite/accept flow — duplicate employee_code or work_email within the same company must be rejected. The scope's "Work email, employee code और membership uniqueness database constraints के साथ consistent रहें" mentions this at a high level but could be more explicit about the specific constraints.

**Verdict:** Core safeguards are correct. Owner transfer protection needs explicit statement. Employee code/email uniqueness constraint reference is adequate but could be more specific.

---

## 7. Manager, team-lead and department-head reassignment rules — PASS

**Scope §Security acceptance criteria 5:** "Member deactivate/leave से पहले department-head, team-lead और manager references resolve/reassign करना आवश्यक होगा।"

**SQL04 evidence:**
- `departments.head_member_id FK → company_members(id, department_id) ON DELETE RESTRICT` — `04_companies.sql:313-316`
- `teams.lead_member_id FK → company_members(id, team_id) ON DELETE RESTRICT` — `04_companies.sql:318-321`
- `company_members.manager_member_id FK → company_members(id, company_id) ON DELETE RESTRICT` — `04_companies.sql:303-305`

**Phase 08 lock-order matrix:** "Company/member deactivation: company → member → department head/team lead/manager references → membership state"

**Phase 06 §3B API-COMPANY-002:** "deactivation cannot orphan required manager/lead relationships"
**Phase 06 §3B API-COMPANY-003:** "active owner/lead/manager relationships cannot be deactivated without reassignment"

**Verdict:** RESTRICT FK constraints enforce the reassignment rule at the database level. NestJS must resolve/reassign head/lead/manager references before deactivation. The lock order correctly places references before membership state. No invented rules.

---

## 8. UserContextClient/SystemClient and RLS boundary — PASS

**Scope §Data and transaction rules:** "User-facing personal/catalog reads के लिए verified user context और RLS boundary use होगी। Business writes के लिए NestJS authorization guard + trusted `SystemClient` transaction use होगा।"

**Decision-01 §6:** "UserContextClient → only approved user-context reads with RLS; SystemClient → trusted business transactions/workers."
**Decision-01 §6:** "RLS remove nahi hogi. Existing RLS limited reads aur default-deny defense-in-depth ke roop mein rahegi."

**Phase 07 §5:** "Separate UserContextClient and SystemClient providers; no accidental cross-injection."
**Phase 07 §5:** "RLS remains active as the approved direct-read defense; default-deny tables stay backend-only."

**17_rls.sql:**
- `GRANT SELECT ON public.users... TO authenticated` — `17_rls.sql:162-176`
- `users_own_read` policy: `id=auth.uid()` — `17_rls.sql:178`
- No DML grants to authenticated — `17_rls.sql:152`

**Verdict:** Scope correctly maps the controlled hybrid model. UserContextClient for approved reads with RLS; SystemClient for all writes with NestJS authorization. RLS is defense-in-depth, not primary write authorization.

---

## 9. Transaction, audit and outbox requirements — PASS

**Scope §Data and transaction rules:** "Company/member writes में business row, required history/audit और approved outbox event एक ही transaction में होंगे; external calls transaction के अंदर नहीं।"

**Phase 07 §6:** "Every mutating command: authenticate → authorize → validate DTO/ownership → BEGIN trusted transaction → lock rows in deterministic order → write business rows → write history/audit → write approved outbox_events → COMMIT."

**Phase 08 §1:** "हर mutating command: validate → authorize → BEGIN → business + history/audit + outbox → COMMIT."
**Phase 08 §1:** "Transaction के अंदर Cloud Tasks, FastAPI, email, WebSocket या external provider call नहीं।"

**SQL03/04 audit mechanisms:**
- `users_updated_at` trigger — `03_users_auth.sql:184-190`
- `user_security_log` append-only (immutable trigger) — `03_users_auth.sql:437-448`
- `login_history` append-only (immutable trigger) — `03_users_auth.sql:450-460`
- `companies_updated_at` trigger — `04_companies.sql:132-135`
- All 6 company tables have `updated_at` triggers — `04_companies.sql:132-311`

**Phase 06 §1:** "Business row, audit/history and outbox event commit atomically."

**Verdict:** Scope correctly identifies the atomic commit requirement. Existing SQL audit mechanisms (updated_at triggers, append-only security logs) are correctly referenced. Outbox event requirement is stated. No external calls in transaction is correctly stated.

---

## 10. Deterministic lock ordering — PASS

**Scope §Data and transaction rules:** "Stable lock order: company → member/user → branch/department/team relationships, जैसा Phase 08 matrix में है।"

**Phase 08 lock-order matrix (§6):**
```
Company/member deactivation: company → member → department head/team lead/manager references → membership state
```

**Phase 08 §6:** "Child rows with no parent lock are locked in stable UUID order. This matrix is mandatory for Phase 09 implementation and concurrency tests; no command may introduce an ad-hoc order."

**Phase 07 §12 #9:** "Concurrent multi-entity commands use the Phase 08 lock order without deadlocks."

**Verdict:** Scope correctly references the Phase 08 lock-order matrix. The order is: company → member/user → branch/department/team relationships → membership state. This prevents deadlocks and ensures consistent cascading. No invented lock order.

---

## 11. Existing SQL tables/constraints/functions mapping — PASS WITH MINOR FIXES

**Scope §Data and transaction rules:** "Existing tables/functions/constraints from SQL 03–04 ही use होंगे: `users`, `user_security_log`, `user_sessions`, `companies`, `company_branches`, `departments`, `teams`, `company_members`, `company_settings` और उनके approved audit/history mechanisms."

**Complete SQL object mapping:**

| Scope table | SQL03/04 object | Status |
|---|---|---|
| `users` | `03_users_auth.sql:78-156` | ✓ |
| `user_security_log` | `03_users_auth.sql:373-384` | ✓ |
| `user_sessions` | `03_users_auth.sql:335-348` | ✓ |
| `login_history` | `03_users_auth.sql:394-422` | ✓ |
| `companies` | `04_companies.sql:42-130` | ✓ |
| `company_branches` | `04_companies.sql:143-170` | ✓ |
| `departments` | `04_companies.sql:183-196` | ✓ |
| `teams` | `04_companies.sql:208-221` | ✓ |
| `company_members` | `04_companies.sql:234-306` | ✓ |
| `company_settings` | `04_companies.sql:328-346` | ✓ |

**Scope §Data and transaction rules:** "Duplicate membership/company commands existing unique constraints या approved domain idempotency से सुरक्षित होंगे; generic in-memory idempotency नहीं।"

**SQL04 unique constraints:**
- `slug CITEXT NOT NULL UNIQUE` — companies — `04_companies.sql:47`
- `registration_number VARCHAR(100) UNIQUE` — companies — `04_companies.sql:49`
- `unique_branch_per_company UNIQUE (company_id, name)` — `04_companies.sql:169`
- `unique_department_per_company UNIQUE (company_id, name)` — `04_companies.sql:195`
- `unique_team_per_department UNIQUE (department_id, name)` — `04_companies.sql:220`
- `unique_member_per_company UNIQUE (company_id, user_id)` — `04_companies.sql:290`
- `unique_company_employee_code UNIQUE (company_id, employee_code)` — `04_companies.sql:291`
- `unique_company_work_email UNIQUE (company_id, work_email)` — `04_companies.sql:292`

**Minor finding 5 (LOW):** Scope lists "user_security_log" in the table inventory but does not explicitly mention the append-only trigger (`reject_auth_audit_row_change`) that prevents UPDATE/DELETE on `user_security_log` and `login_history`. While the scope says "approved audit/history mechanisms," being explicit about append-only immutability would strengthen the security acceptance criteria. The tests should include: "user_security_log and login_history rows cannot be updated or deleted by NestJS or SystemClient."

**Minor finding 6 (LOW):** Scope does not mention the `login_history` table in the "Tests required" section. Login history tests (failed login audit, IP tracking, provider consistency) are relevant for the Identity slice. Consider adding: "Login history records successful and failed attempts with correct metadata."

**Verdict:** All 10 tables correctly mapped. Unique constraints correctly identified for idempotency. Two minor clarifications recommended.

---

## 12. Idempotency expectations — PASS

**Scope §Data and transaction rules:** "Duplicate membership/company commands existing unique constraints या approved domain idempotency से सुरक्षित होंगे; generic in-memory idempotency नहीं।"

**Phase 08 §1:** "Existing domain-specific keys remain authoritative where their schemas already provide them. A generic client-command idempotency store is not present in SQL 01–18."

**Phase 06 §1:** "Mutating commands use Idempotency-Key where applicable; same checksum reuse is successful reuse."

**SQL04 unique constraints** provide natural idempotency for:
- Company creation: `slug UNIQUE`, `registration_number UNIQUE`
- Member invite: `unique_member_per_company (company_id, user_id)`
- Employee code: `unique_company_employee_code (company_id, employee_code)`
- Work email: `unique_company_work_email (company_id, work_email)`

**Verdict:** Scope correctly uses existing SQL unique constraints for idempotency rather than inventing a generic mechanism. The constraint-based approach is deterministic and does not require additional infrastructure.

---

## 13. Required security, concurrency and rollback tests — PASS WITH MINOR FIXES

**Scope §Tests required before slice approval:**

| Required test | Phase 08-B equivalent | Phase 07 §12 | Status |
|---|---|---|---|
| Auth bootstrap and inactive-account tests | ✓ | #7 | ✓ |
| Cross-user and cross-company negative read/write tests | ✓ | #1 | ✓ |
| Owner/admin permission matrix tests | ✓ | — | ✓ |
| Duplicate company/member command tests | — | #4 | ✓ |
| Member deactivation with unresolved relationship tests | ✓ | — | ✓ |
| Concurrent membership/company update tests with deterministic lock order | ✓ | #9 | ✓ |
| Transaction rollback proves no partial business/audit/outbox state | ✓ | #3 | ✓ |
| RLS/trusted-client boundary and error-envelope tests | ✓ | #7 | ✓ |

**Phase 08-B tests (§4):**
- "Cross-user and cross-company negative reads/writes." ✓
- "Owner/member deactivation guard and role/status transition tests." ✓
- "OAuth callback replay, duplicate bootstrap and session revocation tests." ✓
- "Direct authenticated DML denial and trusted-role transaction tests." ✓

**Minor finding 7 (MEDIUM):** Scope §Tests required lists 8 test categories. Phase 08-B §4 lists 4 additional test categories that are not explicitly in the scope's test list:
1. "OAuth callback replay, duplicate bootstrap and session revocation tests" — scope mentions "Auth bootstrap" but not OAuth replay or session revocation explicitly
2. "Direct authenticated DML denial" — scope mentions "RLS/trusted-client boundary" but not explicit "authenticated DML denial" test
3. "Trusted-role transaction tests" — scope mentions "transaction rollback" but not explicit "trusted-role transaction" test

These are all implied by the scope's existing test categories, but explicit enumeration would prevent implementation ambiguity. The scope should add these as sub-items under the existing categories.

**Minor finding 8 (LOW):** Scope does not mention testing the `handle_new_user()` trigger behavior (Supabase Auth → public.users row creation). While this is a SQL-level concern, the NestJS Identity slice should verify that the trigger-created user row is correctly read and that NestJS does not bypass it.

**Verdict:** Core test requirements are comprehensive. Two minor additions recommended for completeness.

---

## 14. Explicit exclusions and no scope creep — PASS

**Scope §Explicit exclusions:**
- "Jobs, candidates, applications, referrals, interviews, messages और notifications." ✓
- "New subscription/provider behavior." ✓
- "New SQL tables, events, queue names या API paths without an approved contract/decision." ✓
- "Direct browser writes to Supabase." ✓

**Phase 08-B scope (§4):** "REQ-AUTH-001..007, REQ-ONBOARDING-001, REQ-COMPANY-001..005."

**Phase 06 §3A/§3B:** Identity catalog and Company catalog — correctly matches scope.

**Verdict:** Exclusions are correctly aligned with Phase 08-B boundaries. No scope creep detected. The scope does not include jobs, candidates, applications, referrals, interviews, messages, notifications, subscriptions, or any other domain outside Phase 08-B.

---

## 15. No invented API paths, tables, events, roles or business rules — PASS

**Scope §Included use cases 7:** "API paths अभी catalog की तरह `TBD` रहेंगे जब तक implementation contract review में freeze न हों।"

**Verification:**

| Category | Invented? | Evidence |
|---|---|---|
| API paths | No — all TBD | §Included use cases 7 |
| SQL tables | No — only SQL 03–04 tables listed | §Data and transaction rules |
| Events/outbox | No — "approved outbox event" referenced, not invented | §Data and transaction rules |
| Roles | No — existing user_role enum (candidate/employer/hr/admin) | SQL03 `users.role` |
| Business rules | No — all derived from Phase 05/06/07/08 | §Authoritative inputs |

**Phase 07 §1:** "No module may create a new table, event, enum or contract without an approved forward decision."

**AGENTS.md:** "Missing requirement invent न करें।"

**Verdict:** No invented paths, tables, events, roles, or business rules. All scope items trace to approved authority documents.

---

## 16. Exit gate completeness — PASS

**Scope §Exit gate:**

```
Scope review PASS
API paths/DTOs frozen
SQL objects mapped
Authorization matrix tested
Transaction + concurrency tests pass
Independent agent review PASS
```

**Phase 08 §14 (Phase exit criteria):**
1. Every Phase 06 API/use case maps to a Phase 08 work item and test suite. ✓
2. Every dependency, DB object, event/contract and security boundary is named or explicitly TBD. ✓
3. Lock order, idempotency persistence and G-1 ownership are assigned. ✓
4. Phase 03 GAP-003..015 have owner, acceptance and phase gates. ✓

**Verdict:** Exit gate is aligned with Phase 08 §14 criteria. The gate correctly requires scope review, API path freezing, SQL mapping, testing, and independent review before implementation proceeds.

---

## 17. Gaps in scope coverage — CONDITIONAL

### Gap 1: `user_sessions` table not mentioned

**Severity:** LOW
**Section:** Scope §Data and transaction rules — table inventory
**Evidence:** `03_users_auth.sql:335-348` defines `user_sessions` table with `user_id`, `is_online`, `last_seen_at`, `socket_id`, `device_type`, `user_agent`. This table is part of the Identity domain (Phase 08-B scope: "Session/security operations and protected-request context").
**Impact:** Without `user_sessions` in the scope, session management operations (create/update/track online status, WebSocket disconnect handling) are not explicitly covered. The scope mentions "Session/security operations" in the use case list but the table is not in the inventory.
**Recommended fix:** Add `user_sessions` to the §Data and transaction rules table inventory. The table is part of the Identity domain and should be explicitly included.

### Gap 2: `login_history` table not in test requirements

**Severity:** LOW
**Section:** Scope §Tests required before slice approval
**Evidence:** `03_users_auth.sql:394-422` defines `login_history` with append-only trigger (`03_users_auth.sql:450-460`). Phase 08-B §4 mentions "session revocation tests" but login history audit is not explicitly tested.
**Impact:** Login history is a security audit table. Without explicit testing, failed login audit, IP tracking, and provider consistency constraints may not be verified.
**Recommended fix:** Add "Login history records successful/failed attempts with correct metadata and append-only immutability" to the test list.

### Gap 3: `handle_new_user()` trigger boundary

**Severity:** LOW
**Section:** Scope §Included use cases 1
**Evidence:** `03_users_auth.sql:199-266` — `handle_new_user()` trigger creates `public.users` row after `auth.users` insert. The scope mentions "Auth bootstrap" but does not explicitly define the NestJS interaction boundary with this trigger.
**Impact:** If NestJS attempts to create the user row directly instead of relying on the trigger, duplicate key conflicts or race conditions may occur. The scope should clarify: "NestJS reads the trigger-created user row; it does not create the user row directly."
**Recommended fix:** Add to §Data and transaction rules: "User row creation is handled by the `handle_new_user()` trigger after Supabase Auth signup. NestJS reads the trigger-created row; it does not create user rows directly."

### Gap 4: Owner transfer/deactivation protection

**Severity:** MEDIUM
**Section:** Scope §Security acceptance criteria 4
**Evidence:** `04_companies.sql:80` — `owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT`. The scope says "Owner/member role, account status और `deleted_at` unsafe transitions fail closed" but does not explicitly state that company owner cannot be deactivated or removed without prior owner transfer.
**Impact:** Without explicit owner protection rule, implementation may allow deactivating the company owner, leaving the company without an owner. The SQL `ON DELETE RESTRICT` prevents hard-delete but not soft-deactivation of the owner's membership.
**Recommended fix:** Add to §Security acceptance criteria: "Company owner cannot be deactivated, removed, or have their membership status changed without prior explicit owner transfer through an approved company ownership transfer command."

---

## ISSUE LOG

| Issue ID | Severity | Section | Finding | Impact | Fix |
|---|---|---|---|---|---|
| SCOPE-01 | **MEDIUM** | §Security acceptance criteria 4 | Owner transfer/deactivation protection not explicit | Implementation may allow deactivating company owner without transfer | Add explicit owner protection rule |
| SCOPE-02 | **MEDIUM** | §Tests required | Phase 08-B tests 2–4 not explicitly enumerated (OAuth replay, DML denial, trusted-role) | Implementation ambiguity in test coverage | Add Phase 08-B §4 test categories as sub-items |
| SCOPE-03 | **LOW** | §Included use cases 5 | Rejoin flow behavior (new row vs. reactivation) not explicitly stated | Ambiguity in membership lifecycle | Clarify: rejoin creates new inactive row |
| SCOPE-04 | **LOW** | §Included use cases 5 | `joined_at` assignment on accept not explicitly stated | SQL constraint may be violated | State: accept sets `is_active=true` + `joined_at` |
| SCOPE-05 | **LOW** | §Data and transaction rules | `user_sessions` table not in inventory | Session management operations not explicitly covered | Add `user_sessions` to table inventory |
| SCOPE-06 | **LOW** | §Data and transaction rules | Append-only triggers on `user_security_log`/`login_history` not explicitly mentioned | Audit immutability not tested | Mention append-only in audit requirements |
| SCOPE-07 | **LOW** | §Tests required | `login_history` audit tests not required | Failed login audit may not be verified | Add login history test requirement |
| SCOPE-08 | **LOW** | §Included use cases 1 | `handle_new_user()` trigger boundary not explicitly defined | Risk of NestJS duplicating user row creation | Clarify: NestJS reads trigger-created row |

---

## Verification summary

| # | Point | Result |
|---|---|---|
| 1 | User/account authorization rules | PASS |
| 2 | Company ownership and membership permissions | PASS |
| 3 | Cross-company read/write isolation | PASS |
| 4 | Branch, department and team relationships | PASS |
| 5 | Member invite, accept, deactivate, leave and rejoin flow | PASS WITH MINOR FIXES |
| 6 | Owner/admin role/status deactivation safeguards | PASS WITH MINOR FIXES |
| 7 | Manager, team-lead and department-head reassignment rules | PASS |
| 8 | UserContextClient/SystemClient and RLS boundary | PASS |
| 9 | Transaction, audit and outbox requirements | PASS |
| 10 | Deterministic lock ordering | PASS |
| 11 | Existing SQL tables/constraints/functions mapping | PASS WITH MINOR FIXES |
| 12 | Idempotency expectations | PASS |
| 13 | Required security, concurrency and rollback tests | PASS WITH MINOR FIXES |
| 14 | Explicit exclusions and no scope creep | PASS |
| 15 | No invented API paths, tables, events, roles or business rules | PASS |
| 16 | Exit gate completeness | PASS |
| 17 | Gaps in scope coverage | CONDITIONAL |

---

## FINAL VERDICT

### **PASS WITH MINOR FIXES**

The Phase 09-B Identity, Users, Companies & Membership Scope is well-structured and correctly
maps to approved authority documents. All 17 verification points have been checked against
actual SQL baseline files, approved architecture, frozen API catalog, implementation plan
and decision records.

**Strengths:**
- Correct table inventory from SQL 03–04
- Correct lock-order reference from Phase 08 matrix
- Correct UserContextClient/SystemClient boundary
- No invented paths, tables, events, roles or business rules
- Correct exclusion boundaries
- Correct idempotency approach using SQL unique constraints
- Correct transaction atomicity requirements

**2 MEDIUM findings:**
1. Owner transfer/deactivation protection needs explicit statement (SCOPE-01)
2. Phase 08-B test categories should be explicitly enumerated (SCOPE-02)

**6 LOW findings:**
- Rejoin flow clarification (SCOPE-03)
- `joined_at` assignment on accept (SCOPE-04)
- `user_sessions` table in inventory (SCOPE-05)
- Append-only trigger mention (SCOPE-06)
- `login_history` test requirement (SCOPE-07)
- `handle_new_user()` trigger boundary (SCOPE-08)

**No BLOCKED findings.** The scope is safe to proceed to implementation after the 2 MEDIUM
and 6 LOW findings are addressed. The findings are all documentation clarifications; none
require scope redesign or new business rules.
