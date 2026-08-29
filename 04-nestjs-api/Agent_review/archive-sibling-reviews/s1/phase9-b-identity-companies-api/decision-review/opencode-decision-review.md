# Phase 09-B — API Contract Decisions Review

Status: `CONDITIONAL PASS`

Reviewer: opencode (Independent Senior NestJS + PostgreSQL + Supabase Architect)
Audit target: `04-nestjs-api/PHASE-09-B-API-CONTRACT-DECISIONS-HINGLISH.md`
Date: 2026-08-26

---

## 1. Executive verdict

### **CONDITIONAL PASS**

All seven decisions (D1–D7) are correctly identified and appropriately scoped. No decision invents
unsupported behavior. The decision sheet correctly defers to human approval and marks the current
status as `NOT READY FOR API CODING`. However, three decisions need additional context or
reframing before human approval can produce source-faithful outcomes:

- **D1** is framed as a binary choice but the actual decision is about endpoint responsibility,
  not endpoint existence.
- **D3** does not surface the hard SQL constraint (`company_members.user_id NOT NULL`) that
  limits the invitation model to existing users only.
- **D6** does not address the owner's own user account deactivation scenario.

---

## 2. Repository sources checked

| # | Source | Path | Relevant to |
|---|---|---|---|
| 1 | AGENTS.md | `AGENTS.md` | Working rules |
| 2 | Proposal | `04-nestjs-api/PHASE-09-B-API-CONTRACT-PROPOSAL.md` | D1–D7 origin |
| 3 | Freeze worksheet | `04-nestjs-api/PHASE-09-B-API-CONTRACT-FREEZE.md` | Contract boundary |
| 4 | Requirements | `01-requirements/current/` | REQ-AUTH, REQ-COMPANY |
| 5 | Product decisions | `01-requirements/product-decisions/` | Decision authority |
| 6 | SQL users/auth | `02-database/migrations/baseline/03_users_auth.sql` | D1, D5, D6, D7 |
| 7 | SQL companies | `02-database/migrations/baseline/04_companies.sql` | D2, D3, D4, D6 |
| 8 | SQL RLS | `02-database/migrations/baseline/17_rls.sql` | D1, D5, D6 |
| 9 | Schema docs | `02-database/schema-docs/` | Table relationships |
| 10 | Contracts | `contracts/` | Event contracts |
| 11 | Foundation code | `04-nestjs-api/04-nestjs-api-app/src/` | Existing clients/auth |
| 12 | Previous reviews | `04-nestjs-api/s1/phase9-b-identity-companies-api/` | Audit trail |

---

## 3. Decision-by-decision review

### D1 — Auth bootstrap boundary

| Attribute | Value |
|---|---|
| **Decision sheet** | "Kya `POST /api/v1/auth/bootstrap` NestJS endpoint rahega, ya Supabase callback/trigger ke bahar hi account bootstrap complete hoga?" |
| **Options implied** | Binary: NestJS endpoint exists vs. NestJS endpoint does not exist |

**Evidence found:**

| Source | Evidence |
|---|---|
| `03_users_auth.sql:199-266` | `handle_new_user()` trigger creates `public.users` row AFTER INSERT on `auth.users`. `ON CONFLICT (id) DO NOTHING` — idempotent. |
| `03_users_auth.sql:276-290` | Trigger fires `AFTER INSERT ON auth.users` — Supabase-side, not NestJS-side. |
| `PHASE-09-B-IDENTITY-COMPANIES-SCOPE.md:47` | "Supabase Auth signup के बाद `handle_new_user()` trigger `public.users` row बनाता है; NestJS duplicate user row नहीं बनाएगा।" |
| `PHASE-06-API-CATALOG.md:200` | API-AUTH-001 actor: "unauthenticated signup user / authenticated callback" |
| `PHASE-06-API-CATALOG.md:205` | "Writes: public.users, security/audit records as approved" |
| `PHASE-06-API-CATALOG.md:206` | "Transaction: user-row bootstrap and audit state must be atomic where NestJS owns the command" |
| `clients.ts:10` | `UserContextClient` enforces SELECT-only — cannot INSERT into users. |

**Assessment: INCOMPLETE**

The decision is framed as a binary (endpoint exists vs. does not exist) but the real decision is
about **what the endpoint does**, not whether it exists. Three valid options exist:

| Option | Description | SQL compatible | Scope compatible |
|---|---|---|---|
| A | No NestJS endpoint; bootstrap is entirely Supabase Auth + trigger + browser redirect | ✓ | ✓ |
| B | NestJS endpoint reads trigger-created row and returns safe account summary; does NOT create user row | ✓ | ✓ |
| C | NestJS endpoint creates user row (bypasses trigger) | ✗ (violates scope line 47) | ✗ |

Option C is explicitly prohibited by the scope. The decision must clarify that Option C is
out of scope and the real choice is between A and B.

**Missing concern:** The decision does not mention that `UserContextClient` (SELECT-only) is
the correct client for reading the trigger-created row, and `SystemClient` must NOT be used
to INSERT into `users` (the trigger owns that).

**Recommendation (PROPOSED — HUMAN APPROVAL REQUIRED):**

> Option B: `POST /api/v1/auth/bootstrap` is a NestJS endpoint that reads the
> `handle_new_user()` trigger-created `public.users` row via `UserContextClient` and returns
> a safe account summary. NestJS does NOT create the user row. The endpoint verifies
> Supabase callback completeness and maps the trigger-created row to the response DTO.
> If the user row does not yet exist (race condition), the endpoint returns
> `VALIDATION_ERROR` — it does not create the row.

**Blocks API freeze:** Yes — the endpoint responsibility boundary must be decided before DTO design.

---

### D2 — Company creation eligibility

| Attribute | Value |
|---|---|
| **Decision sheet** | "Kaun company create kar sakta hai?" |
| **Options** | Any authenticated user / Approved employer role only / Platform-admin approved account only |

**Evidence found:**

| Source | Evidence |
|---|---|
| `04_companies.sql:42-130` | `companies` table — no RLS policy restricting INSERT for authenticated users (`17_rls.sql:152` REVOKE ALL, no companies INSERT grant) |
| `17_rls.sql:152` | `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated` — no direct browser INSERT possible |
| `PHASE-06-API-CATALOG.md:262` | "Actor: employer/owner/admin according to policy" |
| `PHASE-06-API-CATALOG.md:263` | "Permission: company ownership/membership and company-management permission" |
| `03_users_auth.sql:118` | `role public.user_role NOT NULL DEFAULT 'candidate'` — user roles: candidate, employer, hr, admin |

**Assessment: CORRECT but needs additional context**

The decision correctly identifies that the baseline has no explicit eligibility policy. The SQL
does not restrict company creation to any specific role. The catalog says "employer/owner/admin
according to policy" — the "according to policy" qualifier means the policy is TBD.

**Missing concern:** The decision does not mention that company creation via SystemClient
(business write) requires NestJS to set `owner_id` from the JWT `sub` claim. The `owner_id`
is `NOT NULL REFERENCES users(id) ON DELETE RESTRICT` — the creating user becomes the owner.
This is a security-critical server-side derivation that must be enforced regardless of which
eligibility option is chosen.

**Recommendation (PROPOSED — HUMAN APPROVAL REQUIRED):**

> Any authenticated active user may create a company and becomes the owner (`owner_id`
> derived from JWT `sub` claim, never from request body). Role-based eligibility (employer-only)
> is deferred to a future admin capability gate. Company creation is a SystemClient write
> with NestJS ownership derivation.

**Blocks API freeze:** Yes — eligibility policy determines actor guard implementation.

---

### D3 — Membership invitation model

| Attribute | Value |
|---|---|
| **Decision sheet** | "Baseline me invitation token/table nahi hai." |
| **Options** | Existing user ke inactive membership row ka self-accept / New invitation table/token ke saath external-email flow |

**Evidence found:**

| Source | Evidence |
|---|---|
| `04_companies.sql:234-306` | `company_members` — `user_id UUID NOT NULL REFERENCES users(id)` — **hard NOT NULL constraint** |
| `04_companies.sql:255` | `is_active BOOLEAN NOT NULL DEFAULT false` — membership starts inactive |
| `04_companies.sql:256-257` | `invited_at TIMESTAMPTZ`, `invited_by UUID REFERENCES users(id) ON DELETE SET NULL` |
| `04_companies.sql:290` | `UNIQUE (company_id, user_id)` — one membership per user per company |
| `PHASE-06-API-CATALOG.md:302` | "Actor: company owner/admin" |
| `PHASE-06-API-CATALOG.md:304` | "Request/validation: target user/email and company derived/validated server-side" |
| `PHASE-06-API-CONTRACT-PROPOSAL.md:49` | "Baseline only supports existing-user membership rows (`company_members.user_id NOT NULL`); it has no invitation token/table." |

**Assessment: INCOMPLETE — critical SQL constraint not surfaced**

The decision correctly identifies the two options but does not surface the **hard SQL constraint**
that limits Option 1 to existing users only:

```
user_id UUID NOT NULL REFERENCES users(id)
```

This means:
- Option 1 (self-accept on inactive row): Only works if the invited person already has a
  `public.users` row (i.e., has signed up via Supabase Auth). The invite flow would be:
  owner/admin creates inactive `company_members` row with `user_id` pointing to existing user.
- Option 2 (external email invitation): Requires: (a) a new `invitations` table with
  token/expiry, (b) the invited person must sign up via Supabase Auth before accepting,
  (c) the accept flow creates the `company_members` row after user signup. This requires
  an approved forward migration.

The catalog says "target user/email" — the "email" part implies inviting by email address,
which is only possible with Option 2 (new invitation infrastructure).

**Missing concern:** The decision does not mention that Option 1 requires the owner/admin
to know the target user's `user_id` or email address. The `unique_member_per_company`
constraint means duplicate invites to the same user are rejected at the DB level.

**Recommendation (PROPOSED — HUMAN APPROVAL REQUIRED):**

> **Default (source-faithful):** Option 1 — existing user membership row self-accept. The
> owner/admin creates an inactive `company_members` row with `user_id` from an existing
> user. The invited user accepts via a self-serve accept endpoint that sets
> `is_active=true` and `joined_at`. Duplicate invites are rejected by the
> `unique_member_per_company` constraint.
>
> **Future scope:** Option 2 — external email invitation requires an approved forward
> migration creating an `invitations` table with token/expiry, a contract for the
> invitation event, and a multi-step accept flow (signup → accept → activate membership).
> This is explicitly deferred.
>
> `MEMBERSHIP-ACCEPT` is implemented only for Option 1 (self-accept on existing inactive row).

**Blocks API freeze:** Yes — invitation model determines MEMBERSHIP-INVITE and MEMBERSHIP-ACCEPT
endpoint design.

---

### D4 — Organization API shape

| Attribute | Value |
|---|---|
| **Decision sheet** | "Branch, department aur team ke liye: Separate nested REST resources vs. One organization-admin command endpoint" |
| **Options** | Separate nested resources / One command endpoint |

**Evidence found:**

| Source | Evidence |
|---|---|
| `04_companies.sql:143-170` | `company_branches` — separate table with `company_id FK` |
| `04_companies.sql:183-196` | `departments` — separate table with `company_id FK` |
| `04_companies.sql:208-221` | `teams` — separate table with `department_id FK` |
| `PHASE-06-API-CATALOG.md:281` | "Method/path: TBD — nested company administration resources" |
| `PHASE-06-API-CATALOG.md:284` | "Request/validation: company_id from authorized context; parent relationships validated" |
| `PHASE-06-API-CATALOG.md:294` | "Acceptance: deactivation cannot orphan required manager/lead relationships" |

**Assessment: CORRECT**

The decision correctly presents both options. The SQL has three separate tables, which
naturally maps to separate nested REST resources. The catalog says "nested company
administration resources" (plural), implying separate resources.

**Missing concern:** The decision does not mention `company_settings` — the 1:1 extension
of `companies` (`04_companies.sql:328-346`). Company create must initialize
`company_settings` with approved defaults. This is mentioned in the proposal
(`PHASE-09-B-API-CONTRACT-PROPOSAL.md:28`) but not in the decision sheet.

**Recommendation (PROPOSED — HUMAN APPROVAL REQUIRED):**

> Separate nested REST resources: `/companies/:companyId/branches`,
> `/companies/:companyId/departments`, `/companies/:companyId/teams`. Each supports
> create (POST), update (PATCH), and deactivate (POST with `is_active=false`).
> Deactivation enforces relationship reassignment guards per the catalog.
> `company_settings` is initialized with approved defaults on company create and
> updated via a separate settings endpoint or as part of COMPANY-UPDATE.

**Blocks API freeze:** No — either option is implementable. Separate resources is the
recommended default.

---

### D5 — Presence session revoke scope

| Attribute | Value |
|---|---|
| **Decision sheet** | "`user_sessions` realtime-presence table hai, Supabase Auth session table nahi." |
| **Options** | Sirf ek owned presence row deactivate/revoke / User ki sabhi presence rows revoke |

**Evidence found:**

| Source | Evidence |
|---|---|
| `03_users_auth.sql:335-348` | `user_sessions` — `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`, `is_online BOOLEAN`, `socket_id`, `last_seen_at` |
| `03_users_auth.sql:497-499` | `UNIQUE (socket_id) WHERE socket_id IS NOT NULL` — one session per socket |
| `17_rls.sql:69` | `ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY` — RLS enabled |
| `17_rls.sql:152` | `REVOKE ALL` — no authenticated SELECT/INSERT/UPDATE/DELETE grant on `user_sessions` |
| No `user_sessions` RLS policy | No authenticated-user RLS policy exists for `user_sessions` |
| `PHASE-06-API-CATALOG.md:224` | "Reads: public.users, user_sessions, user_security_log, login_history" |
| `PHASE-06-API-CATALOG.md:225` | "Writes: user_sessions and security/audit rows through trusted server path" |
| `PHASE-09-B-API-CONTRACT-PROPOSAL.md:40` | "`AUTH-SESSION` uses SystemClient with explicit `user_id` ownership checks because `user_sessions` is realtime-presence data and has no approved authenticated-user RLS policy." |

**Assessment: CORRECT with clarification needed**

The decision correctly identifies that `user_sessions` is a realtime-presence table, not a
Supabase Auth session table. The proposal correctly notes that `AUTH-SESSION` must use
SystemClient (no authenticated RLS policy on `user_sessions`).

**Missing concern:** The decision does not mention that `user_sessions` has no authenticated
UserContextClient read path. The `is_online` and `last_seen_at` fields are written by the
application (WebSocket connect/disconnect handlers), not by Supabase Auth. The session
revoke operation is a SystemClient write that sets `is_online=false`.

**Recommendation (PROPOSED — HUMAN APPROVAL REQUIRED):**

> `AUTH-SESSION` manages NestJS-tracked realtime presence rows via SystemClient with
> explicit `user_id` ownership checks. Revoke defaults to all sessions for the user
> (`UPDATE user_sessions SET is_online=false WHERE user_id=$1`). Single-session revoke
> is supported via optional session ID parameter. This is NOT Supabase Auth token
> revocation (see D7). `user_sessions` has no authenticated UserContextClient read
> path; all reads use SystemClient.

**Blocks API freeze:** Partially — session revoke granularity must be decided, but the
SystemClient boundary is already clear.

---

### D6 — Owner/last-admin protection and rejoin

| Attribute | Value |
|---|---|
| **Decision sheet** | Three sub-questions: (1) sole owner/last admin transfer mandatory? (2) rejoin self-service or admin approval? (3) rejoin `joined_at` preserve or update? |

**Evidence found:**

| Source | Evidence |
|---|---|
| `04_companies.sql:80` | `owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT` — owner cannot be hard-deleted |
| `04_companies.sql:290` | `UNIQUE (company_id, user_id)` — one membership per user per company |
| `04_companies.sql:277-279` | `is_active = FALSE OR joined_at IS NOT NULL` — active requires joined_at |
| `04_companies.sql:280-282` | `left_at IS NULL OR is_active = FALSE` — left requires inactive |
| `04_companies.sql:270-272` | `manager_member_id IS NULL OR manager_member_id <> id` — self-manager check |
| `04_companies.sql:313-321` | RESTRICT FK on `departments.head_member_id`, `teams.lead_member_id`, `company_members.manager_member_id` — cannot remove member with active references |
| `PHASE-09-B-IDENTITY-COMPANIES-SCOPE.md:44` | "Company का sole active owner deactivate/remove नहीं हो सकता जब तक approved ownership transfer या company deactivation पहले complete न हो." |
| `PHASE-09-B-IDENTITY-COMPANIES-SCOPE.md:45` | "Company owner के user account को deactivate/suspend/delete करने से पहले ownership transfer guard लागू होगा." |
| `PHASE-09-B-IDENTITY-COMPANIES-SCOPE.md:46` | "Member deactivate/leave से पहले department-head, team-lead और manager references resolve/reassign करना आवश्यक होगा." |

**Assessment: INCOMPLETE — missing owner account deactivation scenario**

The decision correctly identifies the three sub-questions. The SQL supports all scenarios
through RESTRICT FKs and unique constraints. However:

**Missing concern 1:** The decision does not address the scenario where the company owner's
**user account** is deactivated/suspended/deleted (scope line 45). The `owner_id ON DELETE
RESTRICT` prevents hard-delete of the owner's user row, but soft-deactivation
(`deleted_at`) of the owner's user account would leave the company with a deactivated owner.
The scope requires an "ownership transfer guard" before this is allowed.

**Missing concern 2:** The decision does not mention the relationship reassignment guard for
deactivation (scope line 46). The RESTRICT FKs on `departments.head_member_id`,
`teams.lead_member_id`, and `company_members.manager_member_id` mean a member with active
head/lead/manager references cannot be removed without reassignment first.

**Recommendation (PROPOSED — HUMAN APPROVAL REQUIRED):**

> 1. **Sole owner protection:** The sole active owner cannot leave or be deactivated without
>    prior approved ownership transfer. If the owner is the only active admin, the company
>    must be deactivated or ownership transferred first.
> 2. **Rejoin:** Rejoin is admin-initiated (owner/admin re-invites). Self-service rejoin is
>    not supported because the `unique_member_per_company` constraint requires the admin
>    to create or reactivate the membership row.
> 3. **Rejoin `joined_at`:** On rejoin, `joined_at` is updated to the reactivation timestamp.
>    The original join date is preserved in `created_at`. The leave/rejoin cycle is tracked
>    through `left_at` and `invited_at`.
> 4. **Owner account deactivation:** Deactivating the owner's user account requires prior
>    ownership transfer. The ownership transfer guard is enforced before user account
>    deactivation proceeds.
> 5. **Relationship reassignment:** Deactivation and leave verify no active department-head,
>    team-lead, or manager references. If unresolved references exist, the operation returns
>    `VALIDATION_ERROR`.

**Blocks API freeze:** Yes — owner protection, rejoin actor, and `joined_at` policy must
be decided before membership endpoint implementation.

---

### D7 — Token-level Supabase Auth revocation

| Attribute | Value |
|---|---|
| **Decision sheet** | "Kya presence-row handling ke alawa Supabase Auth token/session revoke bhi chahiye?" |
| **Options** | Presence-row only / Presence-row + Supabase Auth token revoke |

**Evidence found:**

| Source | Evidence |
|---|---|
| `03_users_auth.sql:335-348` | `user_sessions` is NestJS-tracked presence, NOT Supabase Auth sessions |
| `03_users_auth.sql:199-266` | `handle_new_user()` trigger — Supabase Auth manages auth sessions |
| Supabase Auth API | Supabase provides `/auth/v1/logout` for server-side session revoke via service_role key |
| `PHASE-07-ARCHITECTURE.md:136` | "No Cloud Tasks, FastAPI, email, WebSocket or external provider call occurs inside the transaction." |
| `DECISION-01-NESTJS-SUPABASE-ACCESS-MODEL-HINGLISH.md:57` | "Trusted/service credential browser, Next.js client, logs ya task payload mein kabhi expose nahi hoga." |

**Assessment: CORRECT**

The decision correctly separates presence-row handling from Supabase Auth token revocation.
The constraint about external calls outside DB transactions is correctly stated.

**Missing concern:** The decision does not mention that Supabase Auth server-side logout
requires the `service_role` key (or a server-side Supabase client). This credential must
never reach the browser. The NestJS endpoint would call the Supabase Auth API
post-commit using the server-only credential.

**Recommendation (PROPOSED — HUMAN APPROVAL REQUIRED):**

> D7 is split into two tiers:
> 1. **Tier 1 (Phase 09-B):** Presence-row deactivation only. `AUTH-SESSION` revoke sets
>    `is_online=false` on `user_sessions` rows via SystemClient. No Supabase Auth API call.
> 2. **Tier 2 (Future):** Supabase Auth server-side session revoke via `/auth/v1/logout`
>    using the service_role key. This is an external call and occurs POST-COMMIT, outside
>    the DB transaction. Requires approved integration contract and Secret Manager binding.
>    Deferred until auth integration testing.

**Blocks API freeze:** No — Tier 1 is sufficient for Phase 09-B. Tier 2 is future scope.

---

## 4. Missing decisions

| Decision | Description | Source evidence | Priority |
|---|---|---|---|
| **D8** | `company_settings` initialization on company create | `04_companies.sql:328-346` — 1:1 extension with approved defaults | MEDIUM |
| **D9** | Company soft-delete lifecycle (is_active + deleted_at behavior) | `04_companies.sql:91-92` — `is_active`, `deleted_at` columns | LOW |
| **D10** | Owner transfer exact flow (how ownership is transferred) | `04_companies.sql:80` — `owner_id ON DELETE RESTRICT` | HIGH |

**D8 — `company_settings` initialization:**

The `company_settings` table (`04_companies.sql:328-346`) is a 1:1 extension of `companies`
with approved defaults (`job_approval_required=true`, `auto_shortlist_enabled=false`,
`ai_matching_enabled=true`). Company create must initialize this row. The proposal mentions
this (`PHASE-09-B-API-CONTRACT-PROPOSAL.md:28`) but the decision sheet does not address it.

**D9 — Company soft-delete:**

The `companies` table has both `is_active` (boolean) and `deleted_at` (timestamp). The
decision sheet does not clarify whether company deactivation uses `is_active=false` only,
or also sets `deleted_at`. The catalog says "unsafe owner/status changes fail closed."

**D10 — Owner transfer flow:**

D6 mentions "ownership transfer mandatory" but does not define the transfer flow. The
`owner_id` column is `NOT NULL REFERENCES users(id) ON DELETE RESTRICT` — transferring
ownership requires updating `owner_id` to a different user. This is a company update
operation that must be atomic with audit/outbox.

---

## 5. Contradictions or invented assumptions

| Finding | Severity | Description |
|---|---|---|
| None | — | No contradictions found between the decision sheet and source documents. The decision sheet correctly defers all open questions without inventing assumptions. |

---

## 6. Security and data-access review

### UserContextClient vs SystemClient

| Endpoint | Client | RLS path | Evidence | Correct? |
|---|---|---|---|---|
| AUTH-BOOTSTRAP | UserContextClient | `users_own_read` (`17_rls.sql:178`) | Reads trigger-created row | ✓ |
| AUTH-ME | UserContextClient | `users_own_read` (`17_rls.sql:178`) | Own-row read | ✓ |
| AUTH-SESSION | SystemClient | No authenticated RLS on `user_sessions` | Ownership check via `user_id` | ✓ |
| COMPANY-CREATE | SystemClient | No authenticated INSERT grant on `companies` | Server-derived `owner_id` | ✓ |
| COMPANY-READ | SystemClient | No authenticated SELECT policy on `companies` | NestJS membership check via `is_company_member()` | ✓ |
| COMPANY-UPDATE | SystemClient | No authenticated UPDATE grant on `companies` | Owner/admin check | ✓ |
| ORG-* | SystemClient | No authenticated grants on org tables | Same-company authorization | ✓ |
| MEMBERSHIP-* | SystemClient | No authenticated DML grants on `company_members` | Same-company owner/admin | ✓ |

**All endpoints correctly use SystemClient for writes and SystemClient with authorization
checks for company/org reads. UserContextClient is limited to AUTH-BOOTSTRAP and AUTH-ME
(own-row RLS reads).** No RLS policy is invented.

### RLS applicability

| Table | RLS enabled | Authenticated grant | Policy | UserContextClient read? |
|---|---|---|---|---|
| `users` | ✓ | SELECT | `users_own_read` | ✓ (own row) |
| `user_sessions` | ✓ | None | None | ✗ (SystemClient only) |
| `companies` | ✓ | None | None | ✗ (SystemClient only) |
| `company_branches` | ✓ | None | None | ✗ (SystemClient only) |
| `departments` | ✓ | None | None | ✗ (SystemClient only) |
| `teams` | ✓ | None | None | ✗ (SystemClient only) |
| `company_members` | ✓ | None | None | ✗ (SystemClient only) |
| `company_settings` | ✓ | None | None | ✗ (SystemClient only) |
| `user_security_log` | ✓ | SELECT | `security_log_own_read` | ✓ (own events) |
| `login_history` | ✓ | SELECT | `login_history_own_read` | ✓ (own events) |

**Correct: Company/org tables have no authenticated RLS policy. All company/org reads
use SystemClient + NestJS authorization. Only `users`, `user_security_log`, and
`login_history` have authenticated RLS policies for own-row reads.**

### Owner/admin authorization

| Scenario | SQL support | Decision required? |
|---|---|---|
| Owner is company creator (`owner_id`) | `04_companies.sql:80` | D2 (eligibility) |
| Admin is member with admin role/permissions | `company_members.permissions` JSONB | Yes — role/permission mapping TBD |
| Owner cannot be deactivated without transfer | `owner_id ON DELETE RESTRICT` | D6 (correctly addressed) |
| Admin deactivation requires relationship reassignment | RESTRICT FKs on head/lead/manager | D6 (partially addressed) |

### Session semantics

| Aspect | Current state | Decision? |
|---|---|---|
| `user_sessions` is NestJS-tracked presence | Correctly identified in D5 | ✓ |
| No Supabase Auth session table in baseline | Correctly identified in D5 | ✓ |
| Session revoke = presence-row deactivation | Correctly scoped in D5 | ✓ |
| Supabase Auth token revocation is separate | Correctly separated in D7 | ✓ |

### Invitation artifact

| Aspect | Current state | Decision? |
|---|---|---|
| No invitation table in SQL baseline | Correctly identified in D3 | ✓ |
| `company_members.user_id NOT NULL` limits to existing users | NOT surfaced in D3 | **MISSING** |
| External email invitation requires forward migration | Correctly stated in D3 | ✓ |
| Default option is self-accept on existing row | Correctly presented in D3 | ✓ |

### External calls outside DB transaction

| Aspect | Current state | Decision? |
|---|---|---|
| Supabase Auth API call (D7 Tier 2) is post-commit | Correctly constrained in D7 | ✓ |
| No external call inside DB transaction | Consistent with Phase 07 §6 | ✓ |
| Service-role credential never exposed | Consistent with Decision-01 | ✓ |

---

## 7. Exact changes recommended in the decision sheet

| Decision | Change | Reason |
|---|---|---|
| D1 | Reframe from binary (exists/does not exist) to responsibility (what does the endpoint do). Add Option C as explicitly out-of-scope. Add `UserContextClient` boundary note. | Binary framing is misleading; the real decision is about endpoint responsibility. |
| D2 | Add note: `owner_id` is derived from JWT `sub` claim, never from request body. This is a security-critical server-side derivation. | Ownership derivation must be explicit. |
| D3 | Surface the `company_members.user_id NOT NULL` constraint. State that Option 1 (self-accept) only works for existing users. Clarify that external email invitation (Option 2) requires a forward migration. | The SQL constraint limits the invitation model; this must be explicit. |
| D4 | Add `company_settings` initialization note. Recommend separate nested resources as default. | `company_settings` is a 1:1 extension that must be initialized on company create. |
| D5 | Add note that `user_sessions` has no authenticated UserContextClient read path; all reads use SystemClient. | Client boundary must be explicit. |
| D6 | Add owner account deactivation scenario (scope line 45). Add relationship reassignment guard (scope line 46). Specify rejoin actor as admin-initiated (not self-service). | Missing owner account deactivation and reassignment guard details. |
| D7 | Split into Tier 1 (Phase 09-B: presence-row only) and Tier 2 (Future: Supabase Auth API). Add note about service_role credential. | Tiered approach clarifies Phase 09-B scope vs. future work. |
| NEW D8 | Add `company_settings` initialization decision. | Missing from decision sheet. |
| NEW D10 | Add owner transfer exact flow decision. | D6 mentions transfer but does not define the flow. |

---

## 8. Final readiness

### **READY FOR HUMAN DECISIONS — NOT READY FOR API CONTRACT FREEZE**

The decision sheet correctly identifies all seven critical decisions. No decision invents
unsupported behavior. The sheet is appropriately structured for human approval.

**Before human decisions can produce source-faithful outcomes:**

1. D1 must be reframed (binary → responsibility)
2. D3 must surface the `user_id NOT NULL` constraint
3. D6 must address owner account deactivation and reassignment guards
4. D8 (company_settings) and D10 (owner transfer) must be added

**After human decisions:**

1. All seven (or nine) decisions must be recorded with approved options
2. Proposal and API catalog must be updated to reflect decisions
3. Exact paths, actors, DTOs, errors, and client boundary must be frozen
4. Independent review must pass
5. Then API coding may begin

**Current status: NOT READY FOR API CODING** (correctly stated in decision sheet)
