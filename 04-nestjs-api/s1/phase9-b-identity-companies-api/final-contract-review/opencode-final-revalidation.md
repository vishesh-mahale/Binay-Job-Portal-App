# Phase 09-B — Final Revalidation Report

Status: `CONDITIONAL`

Reviewer: opencode (Independent Senior NestJS + PostgreSQL + Supabase Architect)
Audit target: Proposal, Freeze Worksheet, Decisions, DTO Field Mapping Worksheet
Date: 2026-08-27

---

## 1. Executive verdict

### **CONDITIONAL**

All 8 decisions (D1–D8) are approved and correctly applied per-endpoint. The DTO
worksheet `session_id` mapping has been corrected. Phantom columns `ip_address` and
`last_activity_at` have been removed. No SQL conflicts, no invented behavior, no
security gaps, no phantom fields.

**However, 3 stale-status issues remain across the documents:**

1. **Proposal status line** (line 3) still says "DECISIONS PENDING" — all D1–D8 are
   approved.
2. **Proposal "Decisions required before freeze"** (lines 46–54) still lists 7 open
   items — all are already decided in D1–D8. Section is stale.
3. **Freeze worksheet** lines 30, 32, 33 still mark MEMBERSHIP-INVITE,
   MEMBERSHIP-DEACTIVATE, MEMBERSHIP-LEAVE as "NEEDS_DECISION" — all are approved
   in D3/D6. Line 38 still says "Owner/admin derivation is also a decision item" —
   D2/D6 already decided.

These are document-sync issues only. The underlying decisions and contract are correct.

---

## 2. Verification against all 16 checkpoints

### Checkpoint 1: D1–D8 decisions correctly reflected

| Decision | Status | Proposal | Freeze | Decisions | Verdict |
|---|---|---|---|---|---|
| D1 — Auth bootstrap | APPROVED | Line 11: correct | Line 18: correct | Lines 7–13: correct | ✓ |
| D2 — Company creation | APPROVED | Line 14: correct | Line 20: correct | Lines 15–23: correct | ✓ |
| D3 — Membership model | APPROVED | **Line 21: STALE** | **Lines 30,32,33: STALE** | Lines 25–36: correct | ⚠️ |
| D4 — Org API shape | APPROVED | Lines 17–19: correct | Line 21: correct | Lines 38–45: correct | ✓ |
| D5 — Session revoke | APPROVED | Line 13: correct | Line 19: correct | Lines 47–56: correct | ✓ |
| D6 — Owner protection | APPROVED | Lines 22–24: correct | Lines 32–34: correct | Lines 58–66: correct | ✓ |
| D7 — Token revocation | APPROVED | Line 41: correct | Line 42: correct | Lines 74–80: correct | ✓ |
| D8 — Ownership transfer | APPROVED | **Line 25: correct** | **Line 36: correct** | Lines 68–72: correct | ✓ |

### Checkpoint 2: handle_new_user() creates public.users; NestJS no duplicate

| Check | Evidence | Verdict |
|---|---|---|
| Trigger defined | `03_users_auth.sql:199-266` — `handle_new_user()` function | ✓ |
| Trigger fires on auth.users insert | `03_users_auth.sql:284-288` — `AFTER INSERT ON auth.users` | ✓ |
| INSERT with ON CONFLICT DO NOTHING | `03_users_auth.sql:240-260` — `ON CONFLICT (id) DO NOTHING` | ✓ |
| NestJS does not create public.users | Proposal line 11: "no duplicate user-row write" | ✓ |
| UserContextClient SELECT-only | `clients.ts:10` — `if (!/^\s*select\b/i.test(sql)) throw` | ✓ |

### Checkpoint 3: Employer/admin company creation; JWT-derived owner_id

| Check | Evidence | Verdict |
|---|---|---|
| Active employer creates company | D2: "active authenticated employer user company register karega" | ✓ |
| Platform admin exceptional | D2: "Platform admin exceptional administrative flow" | ✓ |
| Candidate cannot create | D2: "candidate company create nahi kar sakta" | ✓ |
| owner_id from JWT sub | D2: "owner_id hamesha verified JWT sub se server derive hoga" | ✓ |
| owner_id NOT NULL in SQL | `04_companies.sql:80` — `owner_id UUID NOT NULL REFERENCES users(id)` | ✓ |

### Checkpoint 4: Single-owner model; ownership-transfer boundary

| Check | Evidence | Verdict |
|---|---|---|
| Single owner per company | D8: "har company ka ek primary owner rahega" | ✓ |
| No co-owner model | D8: "co-owner model abhi nahi hoga" | ✓ |
| Transfer to eligible active member | D8: "eligible active company member ko" | ✓ |
| Atomic transaction | D8: "business row aur audit/history ke sath atomic NestJS transaction" | ✓ |
| Sole owner cannot leave without transfer | D6: "sole active owner leave ya deactivate nahi kar sakta" | ✓ |
| RESTRICT FK on owner_id | `04_companies.sql:80` — `ON DELETE RESTRICT` | ✓ |
| Endpoint exists in proposal | Line 25: `POST /api/v1/companies/:companyId/ownership-transfer` | ✓ |

### Checkpoint 5: Registered-user membership accept; owner/admin-approved rejoin

| Check | Evidence | Verdict |
|---|---|---|
| Only registered user via inactive row | D3: "registered user ko existing company_members inactive row" | ✓ |
| user_id NOT NULL constraint | `04_companies.sql:237` — `user_id UUID NOT NULL REFERENCES users(id)` | ✓ |
| No external email invitation | D3: "Unregistered email invitation current scope me nahi hai" | ✓ |
| Self-accept by invited user | D3: "vahin user login ke baad apna membership accept karega" | ✓ |
| Accept ≠ rejoin | D3: "Accept aur rejoin alag flows rahenge" | ✓ |
| Rejoin: user requests, owner/admin approves | D6: "membership activation owner/admin approval ke baad hogi" | ✓ |
| Existing row reactivation | D6: "Existing company_members row hi reactivate hogi" | ✓ |
| No duplicate row | `04_companies.sql:290` — `UNIQUE (company_id, user_id)` | ✓ |
| joined_at preserved | D6: "Original joined_at audit history ke liye preserve hoga" | ✓ |

### Checkpoint 6: Single realtime presence-session revoke

| Check | Evidence | Verdict |
|---|---|---|
| Current session only | D5: "normal logout/revoke kewal current authenticated presence session row par" | ✓ |
| Other devices unaffected | D5: "dusre devices ki presence sessions prabhavit nahi hongi" | ✓ |
| user_sessions is realtime presence | `03_users_auth.sql:330-333` — "Active user session tracking for real-time features" | ✓ |
| NOT Supabase Auth sessions | `03_users_auth.sql:333` — "This is NOT for auth sessions" | ✓ |
| "Logout all devices" not in scope | D5: "Logout all devices current scope me alag capability nahi hai" | ✓ |

### Checkpoint 7: HttpOnly-cookie logout; Supabase token-revoke boundary

| Check | Evidence | Verdict |
|---|---|---|
| NestJS closes presence session | D7: "NestJS current presence session band karega" | ✓ |
| Set-Cookie clears HttpOnly cookie | D7: "Set-Cookie se Secure, HttpOnly auth cookie clear karega" | ✓ |
| No Supabase token-revoke per logout | D7: "har logout par alag Supabase token-revoke call nahi hoga" | ✓ |
| Future revoke external to DB txn | D7: "DB transaction ke bahar chalega" | ✓ |
| External calls not inside DB txn | Proposal line 39: "external calls remain post-commit" | ✓ |

### Checkpoint 8: UserContextClient vs SystemClient; RLS applicability

| Check | Evidence | Verdict |
|---|---|---|
| UserContextClient = SELECT-only | `clients.ts:10` — regex enforces SELECT-only | ✓ |
| SystemClient = server-only trusted | `clients.ts:17-22` — no JWT propagation | ✓ |
| AUTH-ME uses UserContextClient + RLS | Proposal line 41: "AUTH-ME uses UserContextClient + users_own_read" | ✓ |
| users_own_read policy exists | `17_rls.sql:178` — `FOR SELECT TO authenticated USING (id=auth.uid())` | ✓ |
| users has authenticated SELECT grant | `17_rls.sql:162` — `GRANT SELECT ON public.users TO authenticated` | ✓ |
| AUTH-SESSION uses SystemClient | Proposal line 41: "AUTH-SESSION uses SystemClient with user_id ownership checks" | ✓ |
| user_sessions has no authenticated SELECT policy | `17_rls.sql:69` — RLS enabled, but no policy for authenticated | ✓ |
| Company reads use SystemClient | Proposal line 40: "Company reads use SystemClient plus authorization" | ✓ |
| companies has no authenticated SELECT policy | `17_rls.sql:72` — RLS enabled, no authenticated policy | ✓ |
| No new RLS policy invented | Proposal line 42: "no new RLS policy is invented" | ✓ |

### Checkpoint 9: Every DTO field mapped to actual SQL column

**Identity/session — GET /auth/me:**

| Field | SQL evidence | Verdict |
|---|---|---|
| `id` | `03_users_auth.sql:81` — `id UUID PRIMARY KEY` | ✓ |
| `email` | `03_users_auth.sql:85` — `email CITEXT NOT NULL UNIQUE` | ✓ |
| `first_name` | `03_users_auth.sql:88` — `first_name VARCHAR(100) NOT NULL` | ✓ |
| `middle_name` | `03_users_auth.sql:89` — `middle_name VARCHAR(100)` | ✓ |
| `last_name` | `03_users_auth.sql:90` — `last_name VARCHAR(100) NOT NULL DEFAULT ''` | ✓ |
| `display_name` | `03_users_auth.sql:94-107` — `display_name TEXT GENERATED ALWAYS AS` | ✓ |
| `phone` | `03_users_auth.sql:110` — `phone VARCHAR(20)` | ✓ |
| `avatar_path` | `03_users_auth.sql:115` — `avatar_path TEXT` | ✓ |
| `role` | `03_users_auth.sql:118` — `role public.user_role NOT NULL DEFAULT 'candidate'` | ✓ |
| `status` | `03_users_auth.sql:132` — `status public.account_status NOT NULL DEFAULT 'pending_verification'` | ✓ |

**Identity/session — GET /auth/sessions:**

| Field | SQL evidence | Verdict |
|---|---|---|
| `id` | `03_users_auth.sql:336` — `id UUID PRIMARY KEY` | ✓ |
| `socket_id` | `03_users_auth.sql:342` — `socket_id VARCHAR(100)` | ✓ |
| `device_type` | `03_users_auth.sql:343` — `device_type VARCHAR(50)` | ✓ |
| `user_agent` | `03_users_auth.sql:344` — `user_agent TEXT` | ✓ |
| `last_seen_at` | `03_users_auth.sql:341` — `last_seen_at TIMESTAMPTZ` | ✓ |
| `is_online` | `03_users_auth.sql:340` — `is_online BOOLEAN NOT NULL DEFAULT true` | ✓ |
| `created_at` | `03_users_auth.sql:346` — `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` | ✓ |
| `updated_at` | `03_users_auth.sql:347` — `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` | ✓ |

**Company — Create request (24 fields):**

| Field | SQL evidence | Verdict |
|---|---|---|
| `name` | `04_companies.sql:46` — `name VARCHAR(255) NOT NULL` | ✓ |
| `slug` | `04_companies.sql:47` — `slug CITEXT NOT NULL UNIQUE` | ✓ |
| `legal_name` | `04_companies.sql:48` — `legal_name VARCHAR(255)` | ✓ |
| `registration_number` | `04_companies.sql:49` — `registration_number VARCHAR(100) UNIQUE` | ✓ |
| `description` | `04_companies.sql:52` — `description TEXT` | ✓ |
| `short_description` | `04_companies.sql:53` — `short_description VARCHAR(500)` | ✓ |
| `industry` | `04_companies.sql:54` — `industry VARCHAR(100)` | ✓ |
| `company_size` | `04_companies.sql:55` — `company_size company_size` | ✓ |
| `website` | `04_companies.sql:56` — `website VARCHAR(500)` | ✓ |
| `linkedin_url` | `04_companies.sql:57` — `linkedin_url VARCHAR(500)` | ✓ |
| `twitter_url` | `04_companies.sql:58` — `twitter_url VARCHAR(500)` | ✓ |
| `facebook_url` | `04_companies.sql:59` — `facebook_url VARCHAR(500)` | ✓ |
| `youtube_url` | `04_companies.sql:60` — `youtube_url VARCHAR(500)` | ✓ |
| `email` | `04_companies.sql:68` — `email CITEXT` | ✓ |
| `phone` | `04_companies.sql:69` — `phone VARCHAR(50)` | ✓ |
| `address_line1` | `04_companies.sql:70` — `address_line1 VARCHAR(255)` | ✓ |
| `address_line2` | `04_companies.sql:71` — `address_line2 VARCHAR(255)` | ✓ |
| `city` | `04_companies.sql:72` — `city VARCHAR(100)` | ✓ |
| `state` | `04_companies.sql:73` — `state VARCHAR(100)` | ✓ |
| `country` | `04_companies.sql:74` — `country VARCHAR(100)` | ✓ |
| `postal_code` | `04_companies.sql:75` — `postal_code VARCHAR(20)` | ✓ |
| `latitude` | `04_companies.sql:76` — `latitude DECIMAL(10, 7)` | ✓ |
| `longitude` | `04_companies.sql:77` — `longitude DECIMAL(10, 7)` | ✓ |
| `brand_color` | `04_companies.sql:65` — `brand_color VARCHAR(7)` | ✓ |

**Company — Create response (11 fields):**

| Field | SQL evidence | Verdict |
|---|---|---|
| `id` | `04_companies.sql:43` | ✓ |
| `name` | `04_companies.sql:46` | ✓ |
| `slug` | `04_companies.sql:47` | ✓ |
| `description` | `04_companies.sql:52` | ✓ |
| `industry` | `04_companies.sql:54` | ✓ |
| `company_size` | `04_companies.sql:55` | ✓ |
| `website` | `04_companies.sql:56` | ✓ |
| `is_active` | `04_companies.sql:91` | ✓ |
| `verification_status` | `04_companies.sql:81` — role-filtered per worksheet | ✓ |
| `created_at` | `04_companies.sql:95` | ✓ |
| `updated_at` | `04_companies.sql:96` | ✓ |

**Organization fields:**

| Resource | Field | SQL evidence | Verdict |
|---|---|---|---|
| Branch | `name` | `04_companies.sql:146` | ✓ |
| Branch | `city` | `04_companies.sql:153` | ✓ |
| Branch | `country` | `04_companies.sql:155` | ✓ |
| Branch | `is_headquarters` | `04_companies.sql:147` | ✓ |
| Department | `name` | `04_companies.sql:186` | ✓ |
| Department | `head_member_id` | `04_companies.sql:187` | ✓ |
| Team | `department_id` | `04_companies.sql:210` | ✓ |
| Team | `name` | `04_companies.sql:211` | ✓ |
| Team | `lead_member_id` | `04_companies.sql:212` | ✓ |

**Membership — All 21 fields:**

| Field | SQL evidence | Verdict |
|---|---|---|
| `company_id` | `04_companies.sql:236` | ✓ |
| `user_id` | `04_companies.sql:237` | ✓ |
| `branch_id` | `04_companies.sql:238` | ✓ |
| `department_id` | `04_companies.sql:239` | ✓ |
| `team_id` | `04_companies.sql:240` | ✓ |
| `manager_member_id` | `04_companies.sql:241` | ✓ |
| `title` | `04_companies.sql:244` | ✓ |
| `employee_code` | `04_companies.sql:245` | ✓ |
| `employment_type` | `04_companies.sql:246` | ✓ |
| `is_primary_hr` | `04_companies.sql:247` | ✓ |
| `permissions` | `04_companies.sql:250` | ✓ |
| `is_active` | `04_companies.sql:255` | ✓ |
| `invited_at` | `04_companies.sql:256` | ✓ |
| `invited_by` | `04_companies.sql:257` | ✓ |
| `joined_at` | `04_companies.sql:258` | ✓ |
| `left_at` | `04_companies.sql:261` | ✓ |
| `employment_status` | `04_companies.sql:262` | ✓ |
| `work_email` | `04_companies.sql:263` | ✓ |
| `work_phone` | `04_companies.sql:264` | ✓ |
| `created_at` | `04_companies.sql:266` | ✓ |
| `updated_at` | `04_companies.sql:267` | ✓ |

### Checkpoint 10: API session_id explicitly mapped to user_sessions.id

| Check | Evidence | Verdict |
|---|---|---|
| Explicit mapping documented | DTO worksheet line 13: "`session_id` (API name) → SQL `user_sessions.id`" | ✓ |
| Response uses real column `id` | DTO worksheet line 12: "actual `user_sessions` columns only: `id, socket_id, ...`" | ✓ |

### Checkpoint 11: head_member_id, lead_member_id, manager_member_id not confused with user IDs

| Check | Evidence | Verdict |
|---|---|---|
| Worksheet documents FK rule | DTO worksheet line 38: "FK points to company_members, not a user field" | ✓ |
| `head_member_id` FK to company_members | `04_companies.sql:313-316` — `REFERENCES company_members(id, department_id)` | ✓ |
| `lead_member_id` FK to company_members | `04_companies.sql:318-321` — `REFERENCES company_members(id, team_id)` | ✓ |
| `manager_member_id` FK to company_members | `04_companies.sql:303-305` — `REFERENCES company_members(id, company_id)` | ✓ |
| None reference users.id | All three FKs reference company_members composite keys | ✓ |

### Checkpoint 12: Unsupported fields not present

| Field | Check | Verdict |
|---|---|---|
| `ip_address` | Not in `user_sessions` (`03_users_auth.sql:335-348`); removed from DTO exclude list | ✓ |
| `last_activity_at` | Not in `user_sessions` (`03_users_auth.sql:335-348`); removed from DTO exclude list | ✓ |
| `head_user_id` | Not in any table; worksheet correctly uses `head_member_id` | ✓ |
| `lead_user_id` | Not in any table; worksheet correctly uses `lead_member_id` | ✓ |
| `user_type` | Not in any table; `role` is the correct column (`03_users_auth.sql:118`) | ✓ |

### Checkpoint 13: Sensitive fields not exposed in response

| Field | Excluded from response? | Evidence | Verdict |
|---|---|---|---|
| `owner_id` | ✓ | DTO worksheet line 22: "not public response fields by default" | ✓ |
| `verification_document_path` | ✓ | DTO worksheet line 22 | ✓ |
| `deleted_at` | ✓ | Excluded from auth/me response | ✓ |
| `deleted_reason` | ✓ | Excluded from auth/me response | ✓ |
| `last_password_changed_at` | ✓ | Excluded from auth/me response | ✓ |
| `locked_until` | ✓ | Excluded from auth/me response | ✓ |
| `settings` (JSONB) | ✓ | DTO worksheet line 22: "internal settings" | ✓ |
| `verification_status` | **Role-filtered** | DTO worksheet line 22: "role/context filtered" | ✓ (conditional) |

### Checkpoint 14: Every endpoint's actor, permission, error, idempotency, transaction, audit, outbox clear

| Endpoint | Actor | Permission | Error | Idempotency | Transaction | Audit | Outbox | Verdict |
|---|---|---|---|---|---|---|---|---|
| AUTH-ME | authenticated user | own row via RLS | UNAUTHORIZED, NOT_FOUND | N/A (read) | read-only | trace IDs | none | ✓ |
| AUTH-SESSION | authenticated user | own sessions | UNAUTHORIZED, FORBIDDEN, NOT_FOUND | safe on retry | SystemClient write | session transition | none | ✓ |
| COMPANY-CREATE | employer/admin | role check | VALIDATION, UNAUTHORIZED, IDEMPOTENCY_CONFLICT | slug uniqueness | company + settings + audit | actor, timestamp | TBD per contract | ✓ |
| COMPANY-READ | member/owner/admin | same-company | UNAUTHORIZED, FORBIDDEN, NOT_FOUND | N/A (read) | read-only | trace IDs | none | ✓ |
| COMPANY-UPDATE | owner/admin | same-company | VALIDATION, UNAUTHORIZED, FORBIDDEN, NOT_FOUND | expected revision if exists | business + audit | actor, timestamp | TBD per contract | ✓ |
| ORG-* | owner/admin | same-company | VALIDATION, UNAUTHORIZED, FORBIDDEN, NOT_FOUND | domain key | org table + audit | actor, tenant | TBD per contract | ✓ |
| MEMBERSHIP-INVITE | owner/admin | same-company | VALIDATION, UNAUTHORIZED, FORBIDDEN, IDEMPOTENCY_CONFLICT | unique member | membership + audit | actor, role | TBD per contract | ✓ |
| MEMBERSHIP-ACCEPT | invited user | own user_id | UNAUTHORIZED, FORBIDDEN, NOT_FOUND | safe on retry | membership + audit | actor, timestamp | none | ✓ |
| MEMBERSHIP-DEACTIVATE | owner/admin | same-company | VALIDATION, UNAUTHORIZED, FORBIDDEN | safe on retry | membership + audit | actor, reassignment | none | ✓ |
| MEMBERSHIP-LEAVE | active member | own membership | UNAUTHORIZED, FORBIDDEN | safe on retry | membership + audit | actor, timestamp | none | ✓ |
| MEMBERSHIP-REJOIN | user requests; owner/admin approves | same-company | UNAUTHORIZED, FORBIDDEN, NOT_FOUND | safe on retry | membership + audit | actor, timestamp | none | ✓ |
| OWNERSHIP-TRANSFER | current owner | owner check | UNAUTHORIZED, FORBIDDEN, NOT_FOUND | safe on retry | company + audit | actor, from/to | TBD per contract | ✓ |

### Checkpoint 15: No endpoint, requirement, or decision missing

| Check | Evidence | Verdict |
|---|---|---|
| All catalog endpoints covered | §3A (API-AUTH-001..003) + §3B (API-COMPANY-001..003) mapped | ✓ |
| OWNERSHIP-TRANSFER endpoint added | Proposal line 25, freeze line 36, decisions D8 | ✓ |
| D1–D8 all present in decisions doc | Lines 7–80: all 8 decisions documented | ✓ |
| MEMBERSHIP-ACCEPT path resolved in freeze | Freeze line 31: `POST /api/v1/companies/:companyId/membership/accept` | ✓ |
| MEMBERSHIP-REJOIN path resolved in freeze | Freeze line 34: `POST /api/v1/companies/:companyId/membership/rejoin` | ✓ |
| Company settings initialization noted | Proposal line 29, DTO worksheet line 22 | ✓ |

---

## 3. Missing fields or over-exposed fields

| Finding | Severity | Description |
|---|---|---|
| None new | — | Previous review's `session_id` BLOCKER is resolved. Phantom columns removed. `verification_status` is role-filtered per DTO worksheet line 22. |

---

## 4. Contract conflicts

| Finding | Severity | Description |
|---|---|---|
| None | — | No SQL conflicts, no RLS conflicts, no Decision-06 error vocabulary conflicts, no Decision-01 access model conflicts. All proposed endpoints respect the controlled hybrid model. |

---

## 5. Document sync issues (stale statuses)

| # | Document | Location | Issue | Severity |
|---|---|---|---|---|
| 1 | Proposal | Line 3 | Status "DECISIONS PENDING" — all D1–D8 approved | LOW |
| 2 | Proposal | Lines 46–54 | "Decisions required before freeze" lists 7 open items — all decided | LOW |
| 3 | Proposal | Line 21 | MEMBERSHIP-ACCEPT status "NEEDS SOURCE/DECISION" — D3 approved | LOW |
| 4 | Freeze | Line 30 | MEMBERSHIP-INVITE "NEEDS_DECISION" — D3 approved | LOW |
| 5 | Freeze | Line 32 | MEMBERSHIP-DEACTIVATE "NEEDS_DECISION" — D3/D6 approved | LOW |
| 6 | Freeze | Line 33 | MEMBERSHIP-LEAVE "NEEDS_DECISION" — catalog/D6 approved | LOW |
| 7 | Freeze | Line 38 | "Owner/admin derivation is also a decision item" — D2/D6 decided | LOW |

---

## 6. Exact corrections required

| # | Fix | Document | Line | Severity |
|---|---|---|---|---|
| 1 | Update status line from "DECISIONS PENDING" to "D1–D8 DECISIONS RESOLVED — DTO/PATH FREEZE PENDING" | Proposal | 3 | LOW |
| 2 | Remove or mark complete "Decisions required before freeze" section | Proposal | 46–54 | LOW |
| 3 | Update MEMBERSHIP-ACCEPT status from "NEEDS SOURCE/DECISION" to "PROPOSED — D3 approved" | Proposal | 21 | LOW |
| 4 | Update MEMBERSHIP-INVITE status from "NEEDS_DECISION" to "PROPOSED" | Freeze | 30 | LOW |
| 5 | Update MEMBERSHIP-DEACTIVATE status from "NEEDS_DECISION" to "PROPOSED" | Freeze | 32 | LOW |
| 6 | Update MEMBERSHIP-LEAVE status from "NEEDS_DECISION" to "PROPOSED" | Freeze | 33 | LOW |
| 7 | Remove stale "Owner/admin derivation is also a decision item" note | Freeze | 38 | LOW |

---

## 7. Final readiness

### **CONDITIONAL — APPROACHING FREEZE-READY**

All critical checks pass:
- ✓ All 8 decisions approved and correctly applied
- ✓ `handle_new_user()` trigger respected; no NestJS duplicate insert
- ✓ Employer/admin company creation with JWT-derived `owner_id`
- ✓ Single-owner model with ownership-transfer endpoint
- ✓ Registered-user membership accept; owner/admin-approved rejoin
- ✓ Single presence-session revoke only
- ✓ HttpOnly-cookie logout; Supabase token-revoke deferred
- ✓ UserContextClient/SystemClient boundary correct
- ✓ All DTO fields mapped to SQL columns
- ✓ `session_id` → `user_sessions.id` explicitly mapped
- ✓ FK member IDs not confused with user IDs
- ✓ No phantom fields (`ip_address`, `last_activity_at`, etc.)
- ✓ Sensitive fields excluded from responses
- ✓ All endpoint behaviors clear
- ✓ No missing endpoints, requirements, or decisions
- ✓ No SQL/RLS/contract conflicts

**Remaining: 7 LOW-status fixes** (document sync only — all decisions are already approved).

**After status updates:**
1. All document statuses reflect approved decisions
2. No stale "NEEDS_DECISION" items remain
3. Proposal "Decisions required" section removed
4. Independent review passes

**Then:** API contract is frozen. Controller implementation may begin.
