# Phase 09-B — DTO Class Catalog Final Review

Status: `PASS WITH MINOR FIXES`

Reviewer: opencode (Independent Senior NestJS + PostgreSQL + Supabase Architect)
Audit target: All 5 Phase 09-B contract documents + DTO class catalog
Date: 2026-08-27

---

## 1. Executive verdict

### **PASS WITH MINOR FIXES**

All 8 decisions (D1–D8) are approved and correctly reflected across all 5 documents.
Every DTO field maps to an actual SQL column. The `session_id` → `user_sessions.id`
mapping is explicit. FK member IDs are not confused with user IDs. No unsupported
fields/paths/endpoints/events. Sensitive fields are excluded. Client boundary (RLS vs
SystemClient) is correct. Membership accept/rejoin and ownership transfer are correctly
defined. The new DTO class catalog is well-structured and consistent with the field
mapping worksheet.

**2 issues require fixes:**

1. **LOW**: Proposal status line (line 3) still says "DECISIONS PENDING" — overridden by
   line 57–59 but visually stale.
2. **LOW**: Freeze worksheet lines 30, 32, 33 still show "NEEDS_DECISION" for
   MEMBERSHIP-INVITE, MEMBERSHIP-DEACTIVATE, MEMBERSHIP-LEAVE — overridden by line 67
   but visually stale.

No BLOCKERs. No MEDIUMs. All fixes are status-line alignment only.

---

## 2. Repository sources checked

| # | Source | Purpose |
|---|---|---|
| 1 | `PHASE-09-B-API-CONTRACT-PROPOSAL.md` | Proposed endpoints |
| 2 | `PHASE-09-B-API-CONTRACT-FREEZE.md` | Freeze worksheet |
| 3 | `PHASE-09-B-API-CONTRACT-DECISIONS-HINGLISH.md` | D1–D8 decisions |
| 4 | `PHASE-09-B-DTO-FIELD-MAPPING-WORKSHEET.md` | Field-to-column mapping |
| 5 | `PHASE-09-B-DTO-CLASS-CATALOG.md` | DTO class naming proposal |
| 6 | `03_users_auth.sql` | users, user_sessions columns |
| 7 | `04_companies.sql` | companies, branches, departments, teams, company_members, settings |
| 8 | `17_rls.sql` | RLS policies and grants |
| 9 | `DECISION-01-NESTJS-SUPABASE-ACCESS-MODEL-HINGLISH.md` | Client boundary |
| 10 | `DECISION-06-API-ERROR-VOCABULARY-HINGLISH.md` | Error vocabulary |
| 11 | `clients.ts` | UserContextClient/SystemClient enforcement |

---

## 3. Verification against all 10 checkpoints

### Checkpoint 1: D1–D8 decisions correctly reflected

| Decision | Proposal | Freeze | Decisions | DTO Worksheet | DTO Catalog | Verdict |
|---|---|---|---|---|---|---|
| D1 — Auth bootstrap | Line 11: correct | Line 18: correct | Lines 7–13: correct | N/A | N/A | ✓ |
| D2 — Company creation | Line 14: correct | Line 20: correct | Lines 15–23: correct | Line 22: owner_id excluded | Line 28: owner_id derived from JWT | ✓ |
| D3 — Membership model | Line 21: TBD (override at 57) | Line 31: correct; lines 30,32,33 overridden by line 67 | Lines 25–36: correct | Lines 36–39: rules correct | Lines 17–21: correct | ✓ |
| D4 — Org API shape | Lines 17–19: correct | Line 21: correct | Lines 38–45: correct | Lines 24–30: correct | Lines 14–16: correct | ✓ |
| D5 — Session revoke | Line 13: correct | Line 19: correct | Lines 47–56: correct | Lines 12–13: correct | Lines 10–11: correct | ✓ |
| D6 — Owner protection | Lines 22–24: correct | Lines 32–34: correct; overridden by line 67 | Lines 58–66: correct | Lines 38–39: correct | Lines 17–21: correct | ✓ |
| D7 — Token revocation | Line 41: correct | Line 42: correct | Lines 74–80: correct | N/A | N/A | ✓ |
| D8 — Ownership transfer | Line 25: correct | Line 36: correct | Lines 68–72: correct | N/A | Line 22: correct | ✓ |

### Checkpoint 2: Every DTO field mapped to SQL column

**AuthMeResponseDto (10 fields):**

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

**PresenceSessionDto (8 fields):**

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

**RevokePresenceSessionDto (1 field):**

| Field | SQL evidence | Verdict |
|---|---|---|
| `session_id` → `user_sessions.id` | DTO catalog line 11: explicit mapping; worksheet line 13: explicit mapping | ✓ |

**CreateCompanyDto (24 fields):**

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

**CompanySummaryDto (11 fields):**

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

**CreateBranchDto (4 fields):**

| Field | SQL evidence | Verdict |
|---|---|---|
| `name` | `04_companies.sql:146` — `name VARCHAR(255) NOT NULL` | ✓ |
| `city` | `04_companies.sql:153` — `city VARCHAR(100) NOT NULL` | ✓ |
| `country` | `04_companies.sql:155` — `country VARCHAR(100) NOT NULL` | ✓ |
| `is_headquarters` | `04_companies.sql:147` — `is_headquarters BOOLEAN NOT NULL DEFAULT false` | ✓ |

**CreateDepartmentDto (2 fields):**

| Field | SQL evidence | Verdict |
|---|---|---|
| `name` | `04_companies.sql:186` — `name VARCHAR(255) NOT NULL` | ✓ |
| `head_member_id` | `04_companies.sql:187` — `head_member_id UUID` | ✓ |

**CreateTeamDto (3 fields):**

| Field | SQL evidence | Verdict |
|---|---|---|
| `department_id` | `04_companies.sql:210` — `department_id UUID NOT NULL REFERENCES departments(id)` | ✓ |
| `name` | `04_companies.sql:211` — `name VARCHAR(255) NOT NULL` | ✓ |
| `lead_member_id` | `04_companies.sql:212` — `lead_member_id UUID` | ✓ |

**AddCompanyMemberDto (21 fields):**

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

**TransferOwnershipDto (conditional):**

| Field | Evidence | Verdict |
|---|---|---|
| `target_user_id` (implied) | D8: "eligible active company member ko" | ✓ |
| `owner_id` NOT accepted | DTO catalog line 28: "owner_id is derived from verified JWT and is never accepted in a create DTO" | ✓ |

### Checkpoint 3: session_id → user_sessions.id mapping

| Document | Evidence | Verdict |
|---|---|---|
| DTO catalog line 11 | "`session_id` maps to `user_sessions.id`" | ✓ |
| DTO catalog line 26 | "`session_id` is an API field name only; repository query uses `user_sessions.id`" | ✓ |
| DTO worksheet line 13 | "`session_id` (API name) → SQL `user_sessions.id`" | ✓ |
| DTO worksheet line 12 | Response uses "actual `user_sessions` columns only: `id, socket_id, ...`" | ✓ |

### Checkpoint 4: head_member_id, lead_member_id, manager_member_id

| Check | Evidence | Verdict |
|---|---|---|
| DTO catalog line 27 | "`head_member_id`, `lead_member_id` and `manager_member_id` remain member IDs" | ✓ |
| DTO worksheet line 38 | "FK points to `company_members`, not a user field" | ✓ |
| `head_member_id` FK | `04_companies.sql:313-316` — `REFERENCES company_members(id, department_id)` | ✓ |
| `lead_member_id` FK | `04_companies.sql:318-321` — `REFERENCES company_members(id, team_id)` | ✓ |
| `manager_member_id` FK | `04_companies.sql:303-305` — `REFERENCES company_members(id, company_id)` | ✓ |
| DTO catalog line 30 | No `head_user_id`, `lead_user_id`, `user_type` | ✓ |

### Checkpoint 5: No unsupported field/path/endpoint/event

| Check | Evidence | Verdict |
|---|---|---|
| No `ip_address` | Not in `user_sessions` (`03_users_auth.sql:335-348`); excluded from DTO catalog line 30 | ✓ |
| No `last_activity_at` | Not in `user_sessions`; excluded from DTO catalog line 30 | ✓ |
| No `head_user_id` | Not in any table; excluded from DTO catalog line 30 | ✓ |
| No `lead_user_id` | Not in any table; excluded from DTO catalog line 30 | ✓ |
| No `user_type` | Not in any table; `role` is correct column; excluded from DTO catalog line 30 | ✓ |
| No unverified revision column | Excluded from DTO catalog line 30 | ✓ |
| No invented endpoints | All 15 endpoints map to catalog §3A/§3B | ✓ |
| No invented events | No outbox events proposed without approved contract | ✓ |

### Checkpoint 6: Sensitive fields not exposed

| Field | Excluded? | Evidence | Verdict |
|---|---|---|---|
| `owner_id` | ✓ | DTO catalog line 28; worksheet line 22 | ✓ |
| `verification_document_path` | ✓ | DTO catalog line 29; worksheet line 22 | ✓ |
| `deleted_at` | ✓ | Not in any response DTO | ✓ |
| `deleted_reason` | ✓ | Not in any response DTO | ✓ |
| `last_password_changed_at` | ✓ | Not in response; worksheet line 11 exclude list | ✓ |
| `locked_until` | ✓ | Not in response; worksheet line 11 exclude list | ✓ |
| `settings` (JSONB) | ✓ | DTO catalog line 29; worksheet line 22 | ✓ |
| `password` | ✓ | DTO catalog line 29 | ✓ |
| `tokens/secrets` | ✓ | DTO catalog line 29 | ✓ |
| `verification_status` | Role-filtered | Worksheet line 22: "role/context filtered" | ✓ (conditional) |

### Checkpoint 7: Actor, permission, RLS, SystemClient/UserContextClient boundary

| Endpoint | Client | RLS/Authorization | Verdict |
|---|---|---|---|
| AUTH-ME | UserContextClient | `users_own_read` (`17_rls.sql:178`) | ✓ |
| AUTH-SESSION | SystemClient | explicit `user_id` ownership check | ✓ |
| COMPANY-CREATE | SystemClient | role check (employer/admin) | ✓ |
| COMPANY-READ | SystemClient | same-company authorization | ✓ |
| COMPANY-UPDATE | SystemClient | owner/admin same-company | ✓ |
| ORG-* | SystemClient | owner/admin same-company | ✓ |
| MEMBERSHIP-INVITE | SystemClient | owner/admin same-company | ✓ |
| MEMBERSHIP-ACCEPT | SystemClient | own `user_id` check | ✓ |
| MEMBERSHIP-DEACTIVATE | SystemClient | owner/admin same-company | ✓ |
| MEMBERSHIP-LEAVE | SystemClient | own membership check | ✓ |
| MEMBERSHIP-REJOIN | SystemClient | owner/admin approval | ✓ |
| OWNERSHIP-TRANSFER | SystemClient | current owner check | ✓ |

**RLS verification:**
- `users`: authenticated SELECT + `users_own_read` policy (`17_rls.sql:162,178`) ✓
- `user_sessions`: RLS enabled, no authenticated policy — default-deny (`17_rls.sql:69`) ✓
- `companies`: RLS enabled, no authenticated policy — default-deny (`17_rls.sql:72`) ✓
- `company_members`: RLS enabled, no authenticated policy — default-deny (`17_rls.sql:76`) ✓
- No new RLS policy invented ✓

### Checkpoint 8: Error, idempotency, audit/history, transaction rules

| Rule | Source | Verdict |
|---|---|---|
| Error vocabulary from Decision-06 | Proposal line 37; freeze line 43 | ✓ |
| No new error code invented | Proposal line 37, 44 | ✓ |
| Idempotency where catalog/SQL requires | Proposal line 38; freeze line 45 | ✓ |
| Business row + audit/history atomic | Proposal line 39; freeze line 46 | ✓ |
| External calls post-commit | Proposal line 39 | ✓ |
| No unapproved event emit | Freeze line 46 | ✓ |
| Slug uniqueness = company idempotency | `04_companies.sql:47` — `slug CITEXT NOT NULL UNIQUE` | ✓ |
| Member uniqueness = membership idempotency | `04_companies.sql:290` — `UNIQUE (company_id, user_id)` | ✓ |

### Checkpoint 9: Membership accept/rejoin and ownership transfer

| Check | Evidence | Verdict |
|---|---|---|
| Accept = registered user self-accept on inactive row | D3; freeze line 31 | ✓ |
| Accept ≠ rejoin | D3: "Accept aur rejoin alag flows rahenge" | ✓ |
| Rejoin = user requests, owner/admin approves | D6; freeze line 34 | ✓ |
| Rejoin reactivates existing row | D6; freeze line 49; DTO worksheet line 39 | ✓ |
| No duplicate membership row | `04_companies.sql:290` — `UNIQUE (company_id, user_id)` | ✓ |
| `joined_at` preserved on rejoin | D6: "Original joined_at audit history ke liye preserve hoga" | ✓ |
| Ownership transfer: single owner | D8: "har company ka ek primary owner rahega" | ✓ |
| Ownership transfer: atomic transaction | D8: "business row aur audit/history ke sath atomic" | ✓ |
| Ownership transfer: sole owner protection | D6: "sole active owner leave ya deactivate nahi kar sakta" | ✓ |
| Ownership transfer endpoint exists | Proposal line 25; freeze line 36; DTO catalog line 22 | ✓ |

### Checkpoint 10: No requirement or endpoint missing

| Check | Evidence | Verdict |
|---|---|---|
| §3A catalog (API-AUTH-001..003) covered | AUTH-BOOTSTRAP, AUTH-ME, AUTH-SESSION | ✓ |
| §3B catalog (API-COMPANY-001..003) covered | COMPANY-CREATE/READ/UPDATE, ORG-*, MEMBERSHIP-* | ✓ |
| OWNERSHIP-TRANSFER covered | D8 approved; proposal line 25; freeze line 36 | ✓ |
| Company settings initialization | Proposal line 29; DTO worksheet line 22 | ✓ |
| Scope use cases 1–7 covered | All endpoints map to scope use cases | ✓ |

---

## 4. DTO class catalog specific checks

| DTO Class | Request/Response | Fields match worksheet? | SQL-backed? | Verdict |
|---|---|---|---|---|
| `AuthMeResponseDto` | Response | ✓ (10 fields) | ✓ | ✓ |
| `PresenceSessionDto` | Response | ✓ (8 fields) | ✓ | ✓ |
| `PresenceSessionListDto` | Response | Wrapper for list | ✓ | ✓ |
| `RevokePresenceSessionDto` | Request | ✓ (`session_id` → `user_sessions.id`) | ✓ | ✓ |
| `RevokePresenceSessionResponseDto` | Response | Revoked result | ✓ | ✓ |
| `CreateCompanyDto` | Request | ✓ (24 fields) | ✓ | ✓ |
| `CompanySummaryDto` | Response | ✓ (11 fields) | ✓ | ✓ |
| `UpdateCompanyDto` | Request | Subset of create | ✓ | ✓ |
| `CreateBranchDto` | Request | ✓ (4 fields) | ✓ | ✓ |
| `UpdateBranchDto` | Request | Subset of create | ✓ | ✓ |
| `BranchDto` | Response | Branch columns | ✓ | ✓ |
| `CreateDepartmentDto` | Request | ✓ (2 fields) | ✓ | ✓ |
| `UpdateDepartmentDto` | Request | Subset of create | ✓ | ✓ |
| `DepartmentDto` | Response | Department columns | ✓ | ✓ |
| `CreateTeamDto` | Request | ✓ (3 fields) | ✓ | ✓ |
| `UpdateTeamDto` | Request | Subset of create | ✓ | ✓ |
| `TeamDto` | Response | Team columns | ✓ | ✓ |
| `AddCompanyMemberDto` | Request | ✓ (21 fields) | ✓ | ✓ |
| `MembershipSummaryDto` | Response | Membership columns | ✓ | ✓ |
| `TransferOwnershipDto` | Request | Conditional; `target_user_id` implied | ✓ | ✓ |

---

## 5. Missing fields or over-exposed fields

| Finding | Severity | Description |
|---|---|---|
| None new | — | Previous review's issues are resolved. All DTO fields verified. |

---

## 6. Contract conflicts

| Finding | Severity | Description |
|---|---|---|
| None | — | No SQL, RLS, Decision-01, Decision-06, or cross-document conflicts. |

---

## 7. Document status alignment

| Document | Current Status | Should Be | Severity |
|---|---|---|---|
| Proposal line 3 | "DECISIONS PENDING" | "D1–D8 RESOLVED — CONTRACT FREEZE PENDING" (line 57 override exists) | LOW |
| Freeze lines 30,32,33 | "NEEDS_DECISION" | "PROPOSED" (line 67 override exists) | LOW |

---

## 8. Exact corrections required

| # | Fix | Document | Line | Severity |
|---|---|---|---|---|
| 1 | Update status line to reflect D1–D8 resolved | Proposal | 3 | LOW |
| 2 | Update MEMBERSHIP-INVITE/DEACTIVATE/LEAVE status from NEEDS_DECISION to PROPOSED | Freeze | 30,32,33 | LOW |

---

## 9. Final readiness

### **READY FOR CONTRACT FREEZE**

All critical checks pass:
- ✓ All 8 decisions approved and correctly reflected
- ✓ All DTO fields mapped to SQL columns
- ✓ `session_id` → `user_sessions.id` explicit mapping
- ✓ FK member IDs correctly documented
- ✓ No phantom/unsupported fields
- ✓ Sensitive fields excluded
- ✓ Client boundary correct (RLS vs SystemClient)
- ✓ Error/idempotency/audit/transaction rules complete
- ✓ Membership accept/rejoin correctly defined
- ✓ Ownership transfer correctly defined
- ✓ No missing endpoints/requirements
- ✓ DTO class catalog consistent with field mapping worksheet
- ✓ No SQL/RLS/contract conflicts

**After 2 LOW status-line fixes:**
1. All document statuses consistent
2. No stale "NEEDS_DECISION" labels remain
3. Independent review passes

**Then:** API contract is frozen. Controller implementation may begin.
