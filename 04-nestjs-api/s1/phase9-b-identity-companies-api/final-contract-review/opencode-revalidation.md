# Phase 09-B — Contract Revalidation Report

Status: `CONDITIONAL`

Reviewer: opencode (Independent Senior NestJS + PostgreSQL + Supabase Architect)
Audit target: Updated Proposal, Freeze Worksheet, Decisions (D1–D8)
Date: 2026-08-27

---

## 1. Executive verdict

### **CONDITIONAL**

All eight decisions (D1–D8) are approved in the decisions document and correctly applied
per-endpoint. However, the **proposal and freeze worksheet have not been updated to
reflect the approved decisions**. Critical sync gaps exist:

1. Proposal "Decisions required before freeze" section still lists 7 open items — all are
   already approved in D1–D8. Section is stale.
2. MEMBERSHIP-ACCEPT path/actor still TBD in proposal — D3 already approved the flow.
3. MEMBERSHIP-DEACTIVATE, MEMBERSHIP-INVITE, MEMBERSHIP-LEAVE still marked
   NEEDS_DECISION in freeze worksheet — D3/D6 already approved the actor model.
4. D8 (ownership transfer) approved but no endpoint exists in proposal.
5. Decisions document status line still says "DECISIONS PENDING — API CODING BLOCKED"
   despite all decisions being approved.
6. Proposal status still says "DECISIONS PENDING" despite all decisions being approved.

**No SQL conflicts, no invented behavior, no security gaps.** The issues are purely
document sync — the decisions exist and are correct, but the downstream documents
haven't incorporated them.

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
| 13 | `clients.ts` | UserContextClient SELECT-only enforcement |
| 14 | `auth.ts` | AuthGuard JWT verification |

---

## 3. Per-decision application verification

### D1 — Auth bootstrap boundary — APPROVED

**Decision:** No separate `POST /auth/bootstrap`. NestJS owns auth boundary. `handle_new_user()` trigger creates `public.users`. Safe summary via `GET /auth/me`.

| Check | Status | Evidence |
|---|---|---|
| Decision applied in proposal line 11 | ✓ | "No separate bootstrap endpoint; use auth flow + `GET /api/v1/auth/me`" |
| `handle_new_user()` trigger respected | ✓ | `03_users_auth.sql:199-266` — trigger creates row |
| No duplicate user-row INSERT | ✓ | `clients.ts:10` — UserContextClient SELECT-only |
| No separate endpoint invented | ✓ | Proposal correctly omits bootstrap path |
| Freeze worksheet line 18 | ✓ | "No separate bootstrap endpoint; `GET /api/v1/auth/me`" |

### D2 — Company creation eligibility — APPROVED

**Decision:** Active authenticated `employer` creates company, becomes `owner_id`. Platform `admin` exceptional. `candidate` cannot create. `owner_id` from JWT `sub`.

| Check | Status | Evidence |
|---|---|---|
| Employer as creator | ✓ | `03_users_auth.sql:118` — role enum includes 'employer' |
| `owner_id` from JWT `sub` | ✓ | `04_companies.sql:80` — `owner_id UUID NOT NULL REFERENCES users(id)` |
| `candidate` excluded | ✓ | D2 explicitly states |
| Proposal line 14 actor | ✓ | "active employer (or approved platform admin)" |

### D3 — Membership invitation model — APPROVED (current scope)

**Decision:** Registered user only via inactive `company_members` row. Self-accept after login. No external email invitation. Accept ≠ rejoin.

| Check | Status | Evidence |
|---|---|---|
| `company_members.user_id NOT NULL` respected | ✓ | `04_companies.sql:237` — NOT NULL FK |
| Inactive row creation by owner/admin | ✓ | `04_companies.sql:255` — `is_active BOOLEAN DEFAULT false` |
| Self-accept by invited user | ✓ | D3: "वही user login के बाद अपना membership accept करेगा" |
| Accept ≠ rejoin | ✓ | D3 explicitly separates |
| **Proposal MEMBERSHIP-ACCEPT status** | **⚠️ STALE** | Proposal line 21: "TBD / NEEDS SOURCE/DECISION" — D3 already approved |
| **Freeze worksheet MEMBERSHIP-ACCEPT** | ✓ | Line 31: "DECIDED FLOW — DTO/catalog review pending" |
| **Freeze worksheet MEMBERSHIP-INVITE** | **⚠️ STALE** | Line 30: "NEEDS_DECISION" — D3 approved owner/admin as actor |

### D4 — Organization API shape — APPROVED

**Decision:** Separate nested REST resources for branches, departments, teams. No combined endpoint.

| Check | Status | Evidence |
|---|---|---|
| Three separate SQL tables | ✓ | `04_companies.sql:143,183,208` |
| Separate nested resources in proposal | ✓ | Proposal lines 17–19 |
| No combined endpoint invented | ✓ | D4 explicitly prohibits |
| `company_settings` initialization | ✓ | Proposal line 28 |

### D5 — Presence session revoke scope — APPROVED

**Decision:** Current session only. Other devices not affected. Not Supabase Auth token revoke.

| Check | Status | Evidence |
|---|---|---|
| `user_sessions` is presence, not auth | ✓ | `03_users_auth.sql:335` — `is_online`, `socket_id` |
| No authenticated RLS on `user_sessions` | ✓ | `17_rls.sql:152` — REVOKE ALL; no policy |
| SystemClient with ownership check | ✓ | Proposal line 40 |
| Single-session revoke default | ✓ | D5 |

### D6 — Owner/last-admin protection and rejoin — APPROVED

**Decision:** Sole owner cannot leave/deactivate without transfer. Rejoin admin-activated. Existing row reactivated. `joined_at` preserved.

| Check | Status | Evidence |
|---|---|---|
| Sole owner protection | ✓ | `04_companies.sql:80` — `owner_id ON DELETE RESTRICT` |
| Relationship reassignment guards | ✓ | `04_companies.sql:313-321` — RESTRICT FKs |
| Rejoin admin-activated | ✓ | D6: "membership activation owner/admin approval के बाद होगी" |
| Existing row reactivation | ✓ | `04_companies.sql:290` — `UNIQUE (company_id, user_id)` |
| `joined_at` preserved | ✓ | D6: "Original `joined_at` audit history के लिए preserve होगा" |
| **Proposal MEMBERSHIP-REJOIN actor** | ✓ | Line 24: "previously associated user requests; owner/admin approves" — correctly reflects D6 |
| **Freeze MEMBERSHIP-DEACTIVATE** | **⚠️ STALE** | Line 32: "NEEDS_DECISION" — D3/D6 approved owner/admin actor |

### D7 — Token-level Auth revocation — APPROVED (current scope)

**Decision:** Normal logout: presence session + cookie clear. No Supabase token-revoke call.

| Check | Status | Evidence |
|---|---|---|
| No Supabase API in normal logout | ✓ | D7 |
| Cookie clearing via Set-Cookie | ✓ | D7 |
| External call post-commit if needed | ✓ | D7 |

### D8 — Ownership transfer — APPROVED (single-owner model)

**Decision:** Single owner per company. Transfer from current owner to eligible active member. Atomic transaction with audit.

| Check | Status | Evidence |
|---|---|---|
| Single-owner model | ✓ | `04_companies.sql:80` — single `owner_id` |
| Transfer to eligible active member | ✓ | D8 |
| Atomic transaction | ✓ | D8 |
| **No endpoint in proposal** | **⚠️ MISSING** | D8 approved but no `POST /api/v1/companies/:companyId/transfer` proposed |

---

## 4. Per-endpoint verification

### AUTH-ME — `GET /api/v1/auth/me`

| Attribute | Value | SQL/Catalog evidence | Correct? |
|---|---|---|---|
| Path | `/api/v1/auth/me` | D1 decision | ✓ |
| Method | GET | Read-only own-row | ✓ |
| Actor | authenticated active user | Catalog API-AUTH-002 | ✓ |
| Permission | own user row | `17_rls.sql:178` — `users_own_read` | ✓ |
| Client | UserContextClient | RLS policy exists; SELECT-only | ✓ |
| Request DTO | None (JWT-derived) | JWT `sub` → user ID | ✓ |
| Response DTO | Safe user summary | Catalog: "safe public user/account summary" | ✓ |
| Errors | UNAUTHORIZED, NOT_FOUND | Decision-06 vocabulary | ✓ |
| Idempotency | Not applicable (read) | — | ✓ |
| Transaction | Read-only | Bounded query | ✓ |
| Outbox | None | Read-only | ✓ |

### AUTH-SESSION — `GET /api/v1/auth/sessions`, `POST /api/v1/auth/sessions/revoke`

| Attribute | Value | SQL/Catalog evidence | Correct? |
|---|---|---|---|
| Paths | `/auth/sessions`, `/auth/sessions/revoke` | D5 decision | ✓ |
| Methods | GET, POST | Read + action | ✓ |
| Actor | authenticated user | Catalog API-AUTH-002 | ✓ |
| Permission | own sessions only | `user_id` ownership check | ✓ |
| Client | SystemClient | No authenticated RLS on `user_sessions` | ✓ |
| Errors | UNAUTHORIZED, FORBIDDEN, NOT_FOUND | Catalog | ✓ |
| Idempotency | Revoke safe on retry | Catalog | ✓ |
| Outbox | None unless approved auth contract | Catalog | ✓ |

### COMPANY-CREATE — `POST /api/v1/companies`

| Attribute | Value | SQL/Catalog evidence | Correct? |
|---|---|---|---|
| Path | `/api/v1/companies` | D2/D4 | ✓ |
| Method | POST | Create | ✓ |
| Actor | active employer or platform admin | D2 | ✓ |
| Client | SystemClient | Business write; no authenticated INSERT | ✓ |
| `owner_id` derivation | From JWT `sub` | D2: "owner_id hamesha verified JWT sub se server derive hoga" | ✓ |
| `company_settings` init | Initialize with defaults | Proposal line 28; `04_companies.sql:328-346` | ✓ |
| Errors | VALIDATION_ERROR, UNAUTHORIZED, IDEMPOTENCY_CONFLICT | Catalog + slug unique | ✓ |
| Transaction | Company + settings + audit | Catalog | ✓ |

### COMPANY-READ — `GET /api/v1/companies/:companyId`

| Attribute | Value | SQL/Catalog evidence | Correct? |
|---|---|---|---|
| Path | `/api/v1/companies/:companyId` | Catalog | ✓ |
| Method | GET | Read | ✓ |
| Actor | authorized member/owner/admin | Catalog | ✓ |
| Client | SystemClient | No authenticated SELECT on `companies` | ✓ |
| Cross-company denied | `is_company_member()` fails | `17_rls.sql:18-32` | ✓ |

### COMPANY-UPDATE — `PATCH /api/v1/companies/:companyId`

| Attribute | Value | SQL/Catalog evidence | Correct? |
|---|---|---|---|
| Path | `/api/v1/companies/:companyId` | Catalog | ✓ |
| Method | PATCH | Partial update | ✓ |
| Actor | owner/admin | D2 | ✓ |
| Client | SystemClient | Business write | ✓ |
| Excluded fields | verification_status, owner_id | Proposal line 42 + D8 | ✓ |

### ORG-BRANCH — `POST/PATCH /api/v1/companies/:companyId/branches/:branchId?`

| Attribute | Value | SQL/Catalog evidence | Correct? |
|---|---|---|---|
| Path pattern | `/companies/:companyId/branches` | D4 | ✓ |
| Methods | POST (create), PATCH (update) | D4 | ✓ |
| Actor | owner/admin | Catalog API-COMPANY-002 | ✓ |
| Client | SystemClient | No authenticated grants | ✓ |
| SQL table | `company_branches` | `04_companies.sql:143-170` | ✓ |
| Required fields | name, city, country | `04_companies.sql:153,155` — NOT NULL | ✓ |
| Unique constraint | `(company_id, name)` | `04_companies.sql:169` | ✓ |
| HQ constraint | One HQ per company | `04_companies.sql:378` — partial unique index | ✓ |

### ORG-DEPARTMENT — `POST/PATCH /api/v1/companies/:companyId/departments/:departmentId?`

| Attribute | Value | SQL/Catalog evidence | Correct? |
|---|---|---|---|
| Path pattern | `/companies/:companyId/departments` | D4 | ✓ |
| SQL table | `departments` | `04_companies.sql:183-196` | ✓ |
| Required fields | name | `04_companies.sql:186` — NOT NULL | ✓ |
| Unique constraint | `(company_id, name)` | `04_companies.sql:195` | ✓ |
| Head reference | `head_member_id FK → company_members(id, department_id) RESTRICT` | `04_companies.sql:313-316` | ✓ |

### ORG-TEAM — `POST/PATCH /api/v1/companies/:companyId/teams/:teamId?`

| Attribute | Value | SQL/Catalog evidence | Correct? |
|---|---|---|---|
| Path pattern | `/companies/:companyId/teams` | D4 | ✓ |
| SQL table | `teams` | `04_companies.sql:208-221` | ✓ |
| Required fields | name, department_id | `04_companies.sql:210,211` — NOT NULL | ✓ |
| Unique constraint | `(department_id, name)` | `04_companies.sql:220` | ✓ |
| Lead reference | `lead_member_id FK → company_members(id, team_id) RESTRICT` | `04_companies.sql:318-321` | ✓ |

### MEMBERSHIP-INVITE — `POST /api/v1/companies/:companyId/members`

| Attribute | Value | SQL/Catalog evidence | Correct? |
|---|---|---|---|
| Path | `/companies/:companyId/members` | Catalog | ✓ |
| Method | POST | Create | ✓ |
| Actor | owner/admin | D3 approved | ✓ |
| Client | SystemClient | Business write | ✓ |
| Initial state | `is_active=false`, `invited_at=NOW()`, `invited_by=JWT sub` | `04_companies.sql:255-257` | ✓ |
| Required fields | user_id (existing user) | `04_companies.sql:237` — NOT NULL FK | ✓ |
| Unique constraint | `(company_id, user_id)` | `04_companies.sql:290` | ✓ |
| Errors | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, IDEMPOTENCY_CONFLICT | Catalog + SQL | ✓ |
| **Freeze worksheet status** | **⚠️ STALE** | Line 30: "NEEDS_DECISION" — should be PROPOSED |

### MEMBERSHIP-ACCEPT — TBD (Decision approved, path not resolved)

| Attribute | Value | Status |
|---|---|---|
| Path | TBD | D3 approved flow but path not in proposal |
| Method | TBD | — |
| Actor | The invited user (self-accept) | D3: "वही user login के बाद अपना membership accept करेगा" |
| Client | SystemClient | Write: `is_active=true`, `joined_at=NOW()` |
| **Proposal status** | **⚠️ STALE** | Line 21: "NEEDS SOURCE/DECISION" — D3 already approved |
| **Freeze worksheet status** | ✓ | Line 31: "DECIDED FLOW — DTO/catalog review pending" |

### MEMBERSHIP-DEACTIVATE — `POST /api/v1/companies/:companyId/members/:memberId/deactivate`

| Attribute | Value | SQL/Catalog evidence | Correct? |
|---|---|---|---|
| Path | `/companies/:companyId/members/:memberId/deactivate` | Catalog | ✓ |
| Actor | owner/admin | D3/D6 approved | ✓ |
| Relationship guard | Head/lead/manager must be reassigned first | `04_companies.sql:313-321` — RESTRICT FKs | ✓ |
| Sole owner protection | Cannot deactivate sole owner | D6 + `04_companies.sql:80` | ✓ |
| `left_at` set to NOW() | `04_companies.sql:261` | ✓ |
| **Freeze worksheet status** | **⚠️ STALE** | Line 32: "NEEDS_DECISION" — should be PROPOSED |

### MEMBERSHIP-LEAVE — `POST /api/v1/companies/:companyId/membership/leave`

| Attribute | Value | SQL/Catalog evidence | Correct? |
|---|---|---|---|
| Path | `/companies/:companyId/membership/leave` | Scope use case 5 | ✓ |
| Actor | Active member (self-service) | Scope: "Member deactivate/leave" | ✓ |
| Same guards as deactivate | Head/lead/manager reassignment required | `04_companies.sql:313-321` | ✓ |
| Sole owner cannot leave | Must transfer first | D6 + D8 | ✓ |
| **Freeze worksheet status** | **⚠️ STALE** | Line 33: "NEEDS_DECISION" — should be PROPOSED |

### MEMBERSHIP-REJOIN — `POST /api/v1/companies/:companyId/membership/rejoin`

| Attribute | Value | SQL/Catalog evidence | Correct? |
|---|---|---|---|
| Path | `/companies/:companyId/membership/rejoin` | Scope use case 5 | ✓ |
| Actor | Owner/admin (admin-activated per D6) | D6: "membership activation owner/admin approval के बाद होगी" | ✓ |
| Proposal actor wording | "previously associated user requests; owner/admin approves" | Correctly reflects D6 flow | ✓ |
| Row behavior | Reactivate existing row; no duplicate | `04_companies.sql:290` — unique constraint | ✓ |
| `joined_at` preserved | D6: "Original `joined_at` audit history के लिए preserve होगा" | ✓ |
| `left_at` cleared | `04_companies.sql:280-282` — constraint allows | ✓ |

### OWNERSHIP-TRANSFER — (D8 approved, endpoint NOT in proposal)

| Attribute | Value | SQL/Catalog evidence | Correct? |
|---|---|---|---|
| **Endpoint** | **NOT IN PROPOSAL** | D8 approves flow but no path proposed | **⚠️ MISSING** |
| Flow | Current owner transfers to eligible active member | D8 decision | ✓ |
| Atomic | Business row + audit/history in one transaction | D8 | ✓ |
| Sole owner | Cannot transfer if it leaves company without owner | D6 + D8 | ✓ |

---

## 5. Document sync analysis

### Proposal vs Decisions — Mismatches

| # | Proposal item | Decision | Status |
|---|---|---|---|
| 1 | Proposal line 21: MEMBERSHIP-ACCEPT "TBD / NEEDS SOURCE/DECISION" | D3: Approved — self-accept by invited user | **⚠️ NOT UPDATED** |
| 2 | Proposal line 45–53: "Decisions required before freeze" lists 7 open items | D1–D8 all approved | **⚠️ STALE SECTION** |
| 3 | Proposal line 1: Status "PROPOSAL — CONDITIONAL; DECISIONS PENDING" | All decisions approved | **⚠️ STATUS STALE** |
| 4 | No ownership transfer endpoint (D8 approved) | D8: Transfer approved | **⚠️ MISSING ENDPOINT** |

### Freeze Worksheet vs Decisions — Mismatches

| # | Freeze item | Decision | Status |
|---|---|---|---|
| 1 | Line 30: MEMBERSHIP-INVITE "NEEDS_DECISION" | D3: owner/admin approved | **⚠️ STALE** |
| 2 | Line 32: MEMBERSHIP-DEACTIVATE "NEEDS_DECISION" | D3/D6: owner/admin approved | **⚠️ STALE** |
| 3 | Line 33: MEMBERSHIP-LEAVE "NEEDS_DECISION" | Catalog/D6: active member self-service | **⚠️ STALE** |
| 4 | Line 36: "Owner/admin derivation is also a decision item" | D2/D6 already decided | **⚠️ STALE** |

### Decisions Document — Internal Consistency

| # | Item | Status |
|---|---|---|
| 1 | D1–D8 all marked APPROVED | ✓ Correct |
| 2 | Status line: "DECISIONS PENDING — API CODING BLOCKED" | **⚠️ STALE** — should reflect all approved |
| 3 | Freeze gate section says "NOT READY FOR API CODING" | **⚠️ STALE** — decisions are resolved |

---

## 6. SQL and requirements conflicts

| Finding | Severity | Description |
|---|---|---|
| None | — | No conflicts found between the contract set and SQL baseline, API catalog, scope, or requirements. All proposed endpoints map to existing SQL tables, columns, constraints, and RLS policies. No invented tables, columns, roles, events, or permissions. |

---

## 7. Missing or invented behavior

| Finding | Severity | Description |
|---|---|---|
| MEMBERSHIP-ACCEPT path TBD | **MEDIUM** | D3 approves the flow but proposal has not resolved the path. Freeze worksheet has it as DECIDED FLOW but proposal still says NEEDS_SOURCE/DECISION. |
| OWNERSHIP-TRANSFER endpoint missing | **MEDIUM** | D8 approves ownership transfer but no endpoint is proposed. Must be added. |
| Proposal "Decisions required" section stale | **LOW** | Section lists 7 items that are all already decided in D1–D8. |
| Freeze decomposition table stale | **LOW** | 3 rows still marked NEEDS_DECISION when decisions are approved. |
| Decision doc status line stale | **LOW** | "DECISIONS PENDING — API CODING BLOCKED" despite all decisions approved. |

**No invented behavior detected.**

---

## 8. Exact fixes required

### Proposal (`PHASE-09-B-API-CONTRACT-PROPOSAL.md`)

| # | Fix | Location |
|---|---|---|
| 1 | Update status line from "DECISIONS PENDING" to reflect all decisions approved | Line 1 |
| 2 | Remove or mark complete the "Decisions required before freeze" section (lines 45–53) | Lines 45–53 |
| 3 | Add MEMBERSHIP-ACCEPT path: `POST /api/v1/companies/:companyId/membership/accept` per D3 | Line 21 |
| 4 | Add MEMBERSHIP-ACCEPT actor: "invited registered user (self-accept)" per D3 | Line 21 |
| 5 | Add MEMBERSHIP-ACCEPT status: "PROPOSED — D3 approved" | Line 21 |
| 6 | Add OWNERSHIP-TRANSFER endpoint: `POST /api/v1/companies/:companyId/transfer` per D8 | New row |
| 7 | Update MEMBERSHIP-DEACTIVATE status to "PROPOSED" (D3/D6 approved owner/admin) | Line 22 |
| 8 | Update MEMBERSHIP-INVITE status to "PROPOSED" (D3 approved owner/admin) | Line 20 |

### Freeze Worksheet (`PHASE-09-B-API-CONTRACT-FREEZE.md`)

| # | Fix | Location |
|---|---|---|
| 1 | Update MEMBERSHIP-INVITE status from "NEEDS_DECISION" to "PROPOSED" | Line 30 |
| 2 | Update MEMBERSHIP-DEACTIVATE status from "NEEDS_DECISION" to "PROPOSED" | Line 32 |
| 3 | Update MEMBERSHIP-LEAVE status from "NEEDS_DECISION" to "PROPOSED" | Line 33 |
| 4 | Remove or update "Owner/admin derivation is also a decision item" note (line 36) — D2/D6 decided | Line 36 |
| 5 | Add OWNERSHIP-TRANSFER row to decomposition table | New row |

### Decisions (`PHASE-09-B-API-CONTRACT-DECISIONS-HINGLISH.md`)

| # | Fix | Location |
|---|---|---|
| 1 | Update status line from "DECISIONS PENDING — API CODING BLOCKED" to "ALL DECISIONS APPROVED — CONTRACT FREEZE PENDING" | Line 3 |
| 2 | Update freeze gate section to reflect all decisions resolved | Lines 82–91 |

---

## 9. Final status

### **CONDITIONAL — NOT YET READY FOR CONTRACT FREEZE**

All eight decisions are approved and correctly applied per-endpoint. No security, RLS,
transaction, audit, outbox, or SQL conflicts exist. No behavior is invented.

**However**, the proposal and freeze worksheet have not been updated to incorporate the
approved decisions. The contract documents are out of sync with the decisions document.

**After the 15 fixes above:**
1. All proposal rows have approved method/path
2. Request/response DTO fields map to SQL columns
3. Actor/permission matrix is approved (D1–D8)
4. Error and idempotency behavior is approved (Decision-06)
5. Transaction/audit/outbox disposition is explicit
6. Document sync is consistent across all three files
7. Independent review passes

**Then:** API contract is frozen. Controller implementation may begin.
