# Phase 09-B — Final API Contract Review

Status: `PASS WITH MINOR FIXES`

Reviewer: opencode (Independent Senior NestJS + PostgreSQL + Supabase Architect)
Audit target: Proposal, Freeze Worksheet, Decisions (D1–D8)
Date: 2026-08-26

---

## 1. Executive verdict

### **PASS WITH MINOR FIXES**

All eight decisions (D1–D8) are approved and correctly applied across the proposal and freeze
worksheet. The contract set is internally consistent with SQL baseline, API catalog, scope,
Decision-01 access model, and Decision-06 error vocabulary. Three minor gaps exist:

1. MEMBERSHIP-ACCEPT and MEMBERSHIP-REJOIN paths are still TBD — the decisions approve
   the flows but the proposal has not resolved the exact paths.
2. D1 eliminates the separate bootstrap endpoint but the freeze worksheet still lists
   `AUTH-BOOTSTRAP` as a NEEDS_DECISION contract entry.
3. D6 approves admin-initiated rejoin but the proposal actor "previously associated user"
   implies self-service initiation.

None of these are blockers. The decisions provide sufficient authority to resolve them
during freeze.

---

## 2. Repository sources checked

| # | Source | Relevant to |
|---|---|---|
| 1 | `AGENTS.md` | Working rules |
| 2 | `PHASE-09-B-API-CONTRACT-PROPOSAL.md` | Proposed endpoints |
| 3 | `PHASE-09-B-API-CONTRACT-FREEZE.md` | Freeze worksheet |
| 4 | `PHASE-09-B-API-CONTRACT-DECISIONS-HINGLISH.md` | Approved decisions D1–D8 |
| 5 | `PHASE-05-FINAL-REQUIREMENTS.md` | Requirement IDs |
| 6 | `PHASE-06-API-CATALOG.md` §3A/§3B | Catalog entries |
| 7 | `PHASE-09-B-IDENTITY-COMPANIES-SCOPE.md` | Scope boundary |
| 8 | `03_users_auth.sql` | users, handle_new_user, user_sessions |
| 9 | `04_companies.sql` | companies, company_members, branches, departments, teams, company_settings |
| 10 | `17_rls.sql` | RLS policies and grants |
| 11 | `DECISION-01-NESTJS-SUPABASE-ACCESS-MODEL-HINGLISH.md` | UserContextClient/SystemClient boundary |
| 12 | `DECISION-06-API-ERROR-VOCABULARY-HINGLISH.md` | Error vocabulary |
| 13 | `contracts/` | Event contracts (none for Phase 09-B) |
| 14 | Foundation code (`clients.ts`, `auth.ts`) | Existing implementation |

---

## 3. D1–D8 application verification

### D1 — Auth bootstrap boundary

**Decision:** No separate `POST /auth/bootstrap` endpoint. NestJS owns auth signup/login/verification boundary and calls Supabase Auth provider. After `auth.users` insert, `handle_new_user()` trigger creates `public.users` row. NestJS never manually creates `public.users`. Safe account summary via `GET /auth/me`.

| Check | Status | Evidence |
|---|---|---|
| Decision applied correctly in proposal | ✓ | Proposal line 11: "No separate bootstrap endpoint; use auth flow + `GET /api/v1/auth/me`" |
| `handle_new_user()` trigger respected | ✓ | `03_users_auth.sql:199-266` — trigger creates row; decision says NestJS never creates |
| No duplicate user-row INSERT | ✓ | `clients.ts:10` — UserContextClient SELECT-only; decision prohibits manual INSERT |
| Outbox event only with approved contract | ✓ | Decision: "Auth-related outbox event tabhi hoga jab approved contract exist kare" |
| Freeze worksheet alignment | **MINOR GAP** | Freeze worksheet line 18 still lists `AUTH-BOOTSTRAP` as NEEDS_DECISION. Should be removed or marked DECIDED — no separate endpoint. |

### D2 — Company creation eligibility

**Decision:** Active authenticated `employer` user creates company and becomes `owner_id`. Platform `admin` can create via exceptional admin flow. `candidate` cannot create. `owner_id` always derived from verified JWT `sub`.

| Check | Status | Evidence |
|---|---|---|
| Employer role as creator | ✓ | `03_users_auth.sql:118` — `role public.user_role` includes 'employer' |
| `owner_id` from JWT `sub` | ✓ | `04_companies.sql:80` — `owner_id UUID NOT NULL REFERENCES users(id)` |
| `candidate` excluded | ✓ | Decision explicitly states |
| Admin exceptional flow | ✓ | Decision allows platform admin |
| No invented eligibility rule | ✓ | All based on existing role enum |

### D3 — Membership invitation model

**Decision:** Registered user only — invite existing user via inactive `company_members` row. User self-accepts after login. No unregistered email invitation. External email invitation deferred. Accept and rejoin are separate flows.

| Check | Status | Evidence |
|---|---|---|
| `company_members.user_id NOT NULL` respected | ✓ | `04_companies.sql:237` — constraint surfaces correctly |
| Inactive row creation by owner/admin | ✓ | `04_companies.sql:255` — `is_active BOOLEAN DEFAULT false` |
| Self-accept by invited user | ✓ | Decision: "वही user login के बाद अपना membership accept करेगा" |
| No invitation token/table invented | ✓ | Decision defers external email to future migration |
| Accept ≠ rejoin | ✓ | Decision explicitly separates the flows |
| Unique constraint enforced | ✓ | `04_companies.sql:290` — `UNIQUE (company_id, user_id)` |

### D4 — Organization API shape

**Decision:** Separate nested REST resources for branches, departments, teams. No combined organization command endpoint.

| Check | Status | Evidence |
|---|---|---|
| Three separate SQL tables | ✓ | `04_companies.sql:143,183,208` |
| Separate nested resources in proposal | ✓ | Proposal lines 17–19: ORG-BRANCH, ORG-DEPARTMENT, ORG-TEAM |
| No combined endpoint invented | ✓ | Decision explicitly prohibits |
| `company_settings` initialization | ✓ | Proposal line 28: "Company create/update must account for existing one-to-one company_settings row" |

### D5 — Presence session revoke scope

**Decision:** Normal logout/revoke applies only to current authenticated presence session row. Other devices' sessions not affected. "Logout all devices" not in current scope. Separate from Supabase Auth token revoke (D7).

| Check | Status | Evidence |
|---|---|---|
| `user_sessions` is presence, not auth sessions | ✓ | `03_users_auth.sql:335` — `user_id`, `is_online`, `socket_id` |
| No authenticated RLS on `user_sessions` | ✓ | `17_rls.sql:152` — REVOKE ALL; no policy |
| SystemClient with ownership check | ✓ | Proposal line 40: "AUTH-SESSION uses SystemClient with explicit user_id ownership checks" |
| Single-session revoke default | ✓ | Decision: "normal logout/revoke केवल current authenticated presence session row पर" |
| Supabase Auth token separate | ✓ | Decision references D7 |

### D6 — Owner/last-admin protection and rejoin

**Decision:** Sole active owner cannot leave/deactivate without prior ownership transfer or company deactivation. Department-head, team-lead, manager references must be reassigned first. Rejoin is admin-activated (not self-service). Existing `company_members` row reactivated; duplicate row prohibited. Original `joined_at` preserved. Owner user account deactivation requires ownership transfer guard.

| Check | Status | Evidence |
|---|---|---|
| Sole owner protection | ✓ | `04_companies.sql:80` — `owner_id ON DELETE RESTRICT` |
| Relationship reassignment guards | ✓ | `04_companies.sql:313-321` — RESTRICT FKs on head/lead/manager |
| Rejoin admin-activated | ✓ | Decision: "membership activation owner/admin approval के बाद होगी" |
| Existing row reactivation | ✓ | `04_companies.sql:290` — `UNIQUE (company_id, user_id)` prevents duplicate |
| `joined_at` preserved | ✓ | Decision: "Original `joined_at` audit history के लिए preserve होगा" |
| Owner account deactivation guard | ✓ | Decision: "Owner user account suspend/deactivate/delete करने से पहले ownership transfer guard अनिवार्य है" |
| **Proposal actor mismatch** | **MINOR** | Proposal line 24: actor "previously associated user" implies self-service. Decision says admin-activated. Proposal should say "owner/admin (on behalf of previously associated user)" |

### D7 — Token-level Auth revocation

**Decision:** Normal logout: NestJS closes presence session and clears auth cookie via Set-Cookie. No Supabase token-revoke call on every logout. Future: password reset, account suspension, security incident may use approved AuthProvider revoke flow outside DB transaction.

| Check | Status | Evidence |
|---|---|---|
| No Supabase API call in normal logout | ✓ | Decision: "हर logout पर अलग Supabase token-revoke call नहीं होगा" |
| Cookie clearing via Set-Cookie | ✓ | Decision: "Secure, HttpOnly auth cookie clear करेगा" |
| External call post-commit if needed | ✓ | Decision: "DB transaction के बाहर चलेगा" |
| No external call inside DB transaction | ✓ | Consistent with Phase 07 §6 and Decision-01 |

### D8 — Ownership transfer

**Decision:** Single-owner model. Ownership transfer from current owner to eligible active company member. Sole owner leave/deactivate requires prior transfer or company deactivation. Transfer is atomic NestJS transaction with audit/history.

| Check | Status | Evidence |
|---|---|---|
| Single-owner model | ✓ | `04_companies.sql:80` — single `owner_id` column |
| Transfer to eligible active member | ✓ | Decision: "eligible active company member को" |
| Atomic transaction | ✓ | Decision: "business row और audit/history के साथ एक atomic NestJS transaction" |
| No co-owner model | ✓ | Decision: "co-owner model अभी नहीं होगा" |
| **Transfer endpoint not in proposal** | **MINOR** | Proposal does not list a `POST /api/v1/companies/:companyId/transfer` endpoint. D8 approves the flow but the endpoint path is not proposed. Must be added before freeze. |

---

## 4. Per-endpoint review

### AUTH-ME — `GET /api/v1/auth/me`

| Attribute | Value | SQL/Catalog evidence | Correct? |
|---|---|---|---|
| Path | `/api/v1/auth/me` | Derived from scope use case 1 | ✓ |
| Method | GET | Read-only own-row | ✓ |
| Actor | authenticated active user | Catalog API-AUTH-002 actor | ✓ |
| Permission | own user row | `17_rls.sql:178` — `users_own_read` | ✓ |
| Client | UserContextClient | RLS policy exists; SELECT-only | ✓ |
| Request DTO | None (JWT-derived) | JWT `sub` → user ID | ✓ |
| Response DTO | Safe user summary | Catalog: "safe public user/account summary" | ✓ |
| Errors | UNAUTHORIZED, NOT_FOUND | Decision-06 vocabulary | ✓ |
| Idempotency | Not applicable (read) | — | ✓ |
| Transaction | Read-only | Bounded query | ✓ |
| Audit | Request/trace ID logged | Foundation error envelope | ✓ |
| Outbox | None | Read-only | ✓ |

### AUTH-SESSION — `GET /api/v1/auth/sessions`, `POST /api/v1/auth/sessions/revoke`

| Attribute | Value | SQL/Catalog evidence | Correct? |
|---|---|---|---|
| Paths | `/auth/sessions`, `/auth/sessions/revoke` | Derived from D5 | ✓ |
| Methods | GET, POST | Read + action | ✓ |
| Actor | authenticated user | Catalog API-AUTH-002 | ✓ |
| Permission | own sessions only | `user_id` ownership check | ✓ |
| Client | SystemClient | No authenticated RLS on `user_sessions` | ✓ |
| Request DTO | Session ID (optional for single revoke) | D5: single-session default | ✓ |
| Response DTO | Session list / revoke confirmation | Catalog: "safe session/security status" | ✓ |
| Errors | UNAUTHORIZED, FORBIDDEN, NOT_FOUND | Catalog API-AUTH-002 | ✓ |
| Idempotency | Revoke safe on retry | Catalog: "logout/revoke operations safe on retry" | ✓ |
| Transaction | SystemClient write (revoke) | `is_active=false` update | ✓ |
| Audit | Session transition audited | Catalog: "every login/session/security transition audited" | ✓ |
| Outbox | None unless approved auth contract | Catalog: "none unless an approved auth event contract exists" | ✓ |

### COMPANY-CREATE — `POST /api/v1/companies`

| Attribute | Value | SQL/Catalog evidence | Correct? |
|---|---|---|---|
| Path | `/api/v1/companies` | Derived from D2/D4 | ✓ |
| Method | POST | Create | ✓ |
| Actor | active employer or platform admin | D2 decision | ✓ |
| Permission | authenticated + employer/admin role | D2: "active authenticated employer user" | ✓ |
| Client | SystemClient | Business write; no authenticated INSERT grant on `companies` | ✓ |
| Request DTO | Company fields from SQL | `04_companies.sql:42-130` — name, slug, etc. | ✓ |
| Response DTO | Created company safe summary | Catalog: "safe company profile" | ✓ |
| `owner_id` derivation | From JWT `sub`, never request body | D2: "owner_id hamesha verified JWT sub se server derive hoga" | ✓ |
| `company_settings` init | Initialize with approved defaults | Proposal line 28; `04_companies.sql:328-346` | ✓ |
| Errors | VALIDATION_ERROR, UNAUTHORIZED, IDEMPOTENCY_CONFLICT | Catalog API-COMPANY-001 + slug unique | ✓ |
| Idempotency | Slug uniqueness | `04_companies.sql:47` — `slug CITEXT UNIQUE` | ✓ |
| Transaction | Company row + settings row + audit | Catalog: "business row + history/audit/outbox atomic" | ✓ |
| Audit | Actor, ownership, timestamp | `04_companies.sql:95-96` — created_at, updated_at | ✓ |
| Outbox | None unless approved contract | Catalog: "TBD; no event invented" | ✓ |

### COMPANY-READ — `GET /api/v1/companies/:companyId`

| Attribute | Value | SQL/Catalog evidence | Correct? |
|---|---|---|---|
| Path | `/api/v1/companies/:companyId` | Derived from catalog | ✓ |
| Method | GET | Read | ✓ |
| Actor | authorized member/owner/admin | Catalog: "employer/owner/admin" | ✓ |
| Permission | Same-company membership or ownership | `is_company_member()` — `17_rls.sql:18-32` | ✓ |
| Client | SystemClient | No authenticated SELECT policy on `companies` | ✓ |
| Request DTO | `companyId` path param | UUID | ✓ |
| Response DTO | Safe company profile | Catalog: "safe company profile and lifecycle state" | ✓ |
| Errors | UNAUTHORIZED, FORBIDDEN, NOT_FOUND | Catalog API-COMPANY-001 | ✓ |
| Cross-company | Denied — membership check fails | `is_company_member()` returns false | ✓ |
| Transaction | Read-only | Bounded query | ✓ |

### COMPANY-UPDATE — `PATCH /api/v1/companies/:companyId`

| Attribute | Value | SQL/Catalog evidence | Correct? |
|---|---|---|---|
| Path | `/api/v1/companies/:companyId` | Derived from catalog | ✓ |
| Method | PATCH | Partial update | ✓ |
| Actor | owner/admin | D2: owner or admin | ✓ |
| Permission | Same-company owner/admin | Membership + admin check | ✓ |
| Client | SystemClient | Business write | ✓ |
| Excluded fields | verification_status, owner_id | Proposal line 42 + D8 | ✓ |
| Owner transfer | Via separate D8-approved flow | D8 decision | ✓ |
| Errors | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND | Catalog | ✓ |
| Transaction | Business row + audit atomically | Catalog | ✓ |

### ORG-BRANCH — `POST/PATCH /api/v1/companies/:companyId/branches/:branchId?`

| Attribute | Value | SQL/Catalog evidence | Correct? |
|---|---|---|---|
| Path pattern | `/companies/:companyId/branches` | D4: separate nested resources | ✓ |
| Methods | POST (create), PATCH (update) | D4 | ✓ |
| Actor | owner/admin | Catalog API-COMPANY-002 | ✓ |
| Client | SystemClient | Business write; no authenticated grants | ✓ |
| SQL table | `company_branches` | `04_companies.sql:143-170` | ✓ |
| Required fields | name, city, country | `04_companies.sql:153,155` — NOT NULL | ✓ |
| Unique constraint | `(company_id, name)` | `04_companies.sql:169` | ✓ |
| Deactivation | `is_active=false` (soft) | `04_companies.sql:148` | ✓ |
| HQ constraint | One HQ per company | `04_companies.sql:378` — partial unique index | ✓ |
| Errors | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND | Catalog API-COMPANY-002 | ✓ |

### ORG-DEPARTMENT — `POST/PATCH /api/v1/companies/:companyId/departments/:departmentId?`

| Attribute | Value | SQL/Catalog evidence | Correct? |
|---|---|---|---|
| Path pattern | `/companies/:companyId/departments` | D4 | ✓ |
| SQL table | `departments` | `04_companies.sql:183-196` | ✓ |
| Required fields | name | `04_companies.sql:186` — NOT NULL | ✓ |
| Unique constraint | `(company_id, name)` | `04_companies.sql:195` | ✓ |
| Head reference | `head_member_id FK → company_members(id, department_id) RESTRICT` | `04_companies.sql:313-316` | ✓ |
| Deactivation | `is_active=false`; head must be reassigned first | RESTRICT FK enforces | ✓ |

### ORG-TEAM — `POST/PATCH /api/v1/companies/:companyId/teams/:teamId?`

| Attribute | Value | SQL/Catalog evidence | Correct? |
|---|---|---|---|
| Path pattern | `/companies/:companyId/teams` | D4 | ✓ |
| SQL table | `teams` | `04_companies.sql:208-221` | ✓ |
| Required fields | name, department_id | `04_companies.sql:210,211` — NOT NULL | ✓ |
| Unique constraint | `(department_id, name)` | `04_companies.sql:220` | ✓ |
| Team requires department | `team_id IS NULL OR department_id IS NOT NULL` | `04_companies.sql:283-285` | ✓ |
| Lead reference | `lead_member_id FK → company_members(id, team_id) RESTRICT` | `04_companies.sql:318-321` | ✓ |

### MEMBERSHIP-INVITE — `POST /api/v1/companies/:companyId/members`

| Attribute | Value | SQL/Catalog evidence | Correct? |
|---|---|---|---|
| Path | `/companies/:companyId/members` | Derived from catalog | ✓ |
| Method | POST | Create | ✓ |
| Actor | owner/admin | D3: owner/admin creates inactive row | ✓ |
| Client | SystemClient | Business write | ✓ |
| SQL table | `company_members` | `04_companies.sql:234-306` | ✓ |
| Initial state | `is_active=false`, `invited_at=NOW()`, `invited_by=JWT sub` | `04_companies.sql:255-257` | ✓ |
| Required fields | user_id (existing user) | `04_companies.sql:237` — NOT NULL FK | ✓ |
| Unique constraint | `(company_id, user_id)` | `04_companies.sql:290` | ✓ |
| employee_code uniqueness | `(company_id, employee_code)` | `04_companies.sql:291` | ✓ |
| work_email uniqueness | `(company_id, work_email)` | `04_companies.sql:292` | ✓ |
| Errors | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, IDEMPOTENCY_CONFLICT | Catalog + SQL constraints | ✓ |
| Transaction | Membership row + audit atomically | Catalog | ✓ |

### MEMBERSHIP-ACCEPT — TBD

| Attribute | Value | Status |
|---|---|---|
| Path | TBD | D3 approved flow but path not resolved |
| Method | TBD | — |
| Actor | The invited user (self-accept) | D3: "वही user login के बाद अपना membership accept करेगा" |
| Client | SystemClient | Write: `is_active=true`, `joined_at=NOW()` |
| **Status** | **NEEDS PATH RESOLUTION** | Decision approved; path/DTO not in proposal |

### MEMBERSHIP-DEACTIVATE — `POST /api/v1/companies/:companyId/members/:memberId/deactivate`

| Attribute | Value | SQL/Catalog evidence | Correct? |
|---|---|---|---|
| Path | `/companies/:companyId/members/:memberId/deactivate` | Derived from catalog | ✓ |
| Actor | owner/admin | Catalog API-COMPANY-003 | ✓ |
| Relationship guard | Head/lead/manager must be reassigned first | `04_companies.sql:313-321` — RESTRICT FKs | ✓ |
| Sole owner protection | Cannot deactivate sole owner | D6 + `04_companies.sql:80` | ✓ |
| `left_at` | Set to NOW() on deactivation | `04_companies.sql:261` | ✓ |
| `is_active` | Set to false | `04_companies.sql:255` | ✓ |
| Errors | VALIDATION_ERROR (unresolved refs), FORBIDDEN (sole owner) | D6 + SQL constraints | ✓ |

### MEMBERSHIP-LEAVE — `POST /api/v1/companies/:companyId/membership/leave`

| Attribute | Value | SQL/Catalog evidence | Correct? |
|---|---|---|---|
| Path | `/companies/:companyId/membership/leave` | Derived from scope use case 5 | ✓ |
| Actor | Active member (self-service) | Scope: "Member deactivate/leave" | ✓ |
| Same guards as deactivate | Head/lead/manager reassignment required | `04_companies.sql:313-321` | ✓ |
| Sole owner cannot leave | Must transfer first | D6 + D8 | ✓ |
| Client | SystemClient | Business write | ✓ |

### MEMBERSHIP-REJOIN — `POST /api/v1/companies/:companyId/membership/rejoin`

| Attribute | Value | SQL/Catalog evidence | Correct? |
|---|---|---|---|
| Path | `/companies/:companyId/membership/rejoin` | Derived from scope use case 5 | ✓ |
| Actor | Owner/admin (admin-activated per D6) | D6: "membership activation owner/admin approval के बाद होगी" | ✓ |
| **Proposal actor** | **"previously associated user"** | **D6 says admin-activated; proposal implies self-service** | **MINOR FIX** |
| Row behavior | Reactivate existing row; no duplicate | `04_companies.sql:290` — unique constraint | ✓ |
| `joined_at` | Preserved (original timestamp) | D6: "Original `joined_at` audit history के लिए preserve होगा" | ✓ |
| `left_at` | Cleared on reactivation | `04_companies.sql:280-282` — constraint allows | ✓ |
| `is_active` | Set to true | D6 | ✓ |
| `updated_at` | Updated by trigger | `04_companies.sql:308-311` | ✓ |

### OWNERSHIP-TRANSFER — (D8 approved, endpoint not in proposal)

| Attribute | Value | SQL/Catalog evidence | Correct? |
|---|---|---|---|
| **Endpoint** | **NOT IN PROPOSAL** | **D8 approves flow but no path proposed** | **MINOR FIX** |
| Flow | Current owner transfers to eligible active member | D8 decision | ✓ |
| Atomic | Business row + audit/history in one transaction | D8: "atomic NestJS transaction" | ✓ |
| Sole owner | Cannot transfer if it leaves company without owner | D6 + D8 | ✓ |

---

## 5. SQL and requirements conflicts

| Finding | Severity | Description |
|---|---|---|
| None | — | No conflicts found between the contract set and SQL baseline, API catalog, scope, or requirements. All proposed endpoints map to existing SQL tables, columns, constraints, and RLS policies. No invented tables, columns, roles, events, or permissions. |

---

## 6. Missing or invented behavior

| Finding | Severity | Description |
|---|---|---|
| MEMBERSHIP-ACCEPT path TBD | **MINOR** | Decision D3 approves the flow but the proposal has not resolved the path. The freeze worksheet still lists it as NEEDS_DECISION. |
| MEMBERSHIP-REJOIN actor misaligned | **MINOR** | Proposal says "previously associated user" (self-service). D6 says admin-activated. Must align. |
| OWNERSHIP-TRANSFER endpoint missing | **MINOR** | D8 approves ownership transfer flow but no endpoint is proposed. Must be added. |
| Freeze worksheet AUTH-BOOTSTRAP stale | **MINOR** | Freeze worksheet line 18 still lists AUTH-BOOTSTRAP as NEEDS_DECISION. D1 eliminates the separate endpoint; this entry should be removed or marked resolved. |

**No invented behavior detected.** All proposed endpoints, actors, DTOs, and rules derive from approved decisions, SQL baseline, or API catalog.

---

## 7. Exact fixes required before freeze

| # | Fix | Document | Section |
|---|---|---|---|
| 1 | Remove or mark DECIDED: AUTH-BOOTSTRAP entry in freeze worksheet (D1 eliminates separate endpoint) | `PHASE-09-B-API-CONTRACT-FREEZE.md` | Line 18 |
| 2 | Add MEMBERSHIP-ACCEPT path (e.g., `POST /api/v1/companies/:companyId/members/:memberId/accept` or similar based on D3 self-accept flow) | `PHASE-09-B-API-CONTRACT-PROPOSAL.md` | Line 21 |
| 3 | Change MEMBERSHIP-REJOIN actor from "previously associated user" to "owner/admin (on behalf of previously associated user)" per D6 | `PHASE-09-B-API-CONTRACT-PROPOSAL.md` | Line 24 |
| 4 | Add OWNERSHIP-TRANSFER endpoint (e.g., `POST /api/v1/companies/:companyId/transfer`) per D8 | `PHASE-09-B-API-CONTRACT-PROPOSAL.md` | New entry |
| 5 | Update MEMBERSHIP-ACCEPT and MEMBERSHIP-REJOIN status from NEEDS_SOURCE/DECISION to PROPOSED after path resolution | `PHASE-09-B-API-CONTRACT-PROPOSAL.md` | Lines 21, 24 |

---

## 8. Final status

### **READY FOR CONTRACT FREEZE**

All eight decisions are approved and correctly applied. The five minor fixes above are
path/DTO resolution items that can be completed during the freeze step. No security,
ownership, RLS, transaction, audit, outbox, or contract conflicts exist.

**After the five fixes:**
1. All proposal rows have approved method/path
2. Request/response DTO fields map to SQL columns
3. Actor/permission matrix is approved (D1–D8)
4. Error and idempotency behavior is approved (Decision-06)
5. Transaction/audit/outbox disposition is explicit
6. Independent review passes

**Then:** API contract is frozen. Controller implementation may begin.
