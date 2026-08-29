# Phase 09-B — DTO Field Mapping Review Report

Status: `PASS WITH MINOR FIXES`

Reviewer: opencode (Independent Senior NestJS + PostgreSQL + Supabase Architect)
Audit target: `PHASE-09-B-DTO-FIELD-MAPPING-WORKSHEET.md`
Date: 2026-08-27

---

## 1. Executive verdict

### **PASS WITH MINOR FIXES**

The DTO mapping worksheet is substantially correct. Every proposed field maps to an actual
SQL column. No invented tables, columns, roles, or statuses. Sensitive fields are properly
excluded. The `head_member_id`/`lead_member_id`/`manager_member_id` FK rule is correctly
documented. Company creation correctly notes `company_settings` initialization. Membership
invite is correctly limited to registered users. Rejoin correctly notes existing row
reactivation.

**However, 3 issues require fixes before contract freeze:**

1. **BLOCKER**: `session_id` in AUTH-SESSION revoke request is not an actual `user_sessions`
   column. The table has `id`, not `session_id`. The DTO-to-column mapping is wrong.
2. **MEDIUM**: Exclude column lists phantom columns `ip_address` and `last_activity_at`
   that do not exist in `user_sessions`. This suggests the worksheet was written against an
   outdated or incorrect mental model of the table.
3. **LOW**: Company response includes `verification_status` — an internal admin field that
   may not be appropriate for all safe response contexts.

---

## 2. Repository sources checked

| # | Source | Purpose |
|---|---|---|
| 1 | `PHASE-09-B-DTO-FIELD-MAPPING-WORKSHEET.md` | Audit target |
| 2 | `03_users_auth.sql` | users, user_sessions, user_security_log, login_history columns |
| 3 | `04_companies.sql` | companies, company_branches, departments, teams, company_members, company_settings columns |
| 4 | `17_rls.sql` | RLS policies and grants |
| 5 | `PHASE-09-B-API-CONTRACT-PROPOSAL.md` | Proposed endpoints and DTO rules |
| 6 | `PHASE-09-B-API-CONTRACT-FREEZE.md` | Freeze worksheet |
| 7 | `PHASE-09-B-API-CONTRACT-DECISIONS-HINGLISH.md` | D1–D8 decisions |
| 8 | `PHASE-06-API-CATALOG.md` §3A/§3B | Catalog entries |
| 9 | `PHASE-05-FINAL-REQUIREMENTS.md` | Requirement IDs |

---

## 3. Field-by-field verification

### 3A. Identity/session — `GET /auth/me`

| Field | SQL evidence | Correct? | Exposure risk | Fix |
|---|---|---|---|---|
| `id` | `03_users_auth.sql:81` — `id UUID PRIMARY KEY` | ✓ | Low — public identifier | None |
| `email` | `03_users_auth.sql:85` — `email CITEXT NOT NULL UNIQUE` | ✓ | Medium — PII | None (needed for profile) |
| `first_name` | `03_users_auth.sql:88` — `first_name VARCHAR(100) NOT NULL` | ✓ | Low | None |
| `middle_name` | `03_users_auth.sql:89` — `middle_name VARCHAR(100)` | ✓ | Low | None |
| `last_name` | `03_users_auth.sql:90` — `last_name VARCHAR(100) NOT NULL DEFAULT ''` | ✓ | Low | None |
| `display_name` | `03_users_auth.sql:94-107` — `display_name TEXT GENERATED ALWAYS AS` | ✓ | Low — generated | None |
| `phone` | `03_users_auth.sql:110` — `phone VARCHAR(20)` | ✓ | Medium — PII | None (E.164 format) |
| `avatar_path` | `03_users_auth.sql:115` — `avatar_path TEXT` | ✓ | Low — storage path, not URL | None |
| `role` | `03_users_auth.sql:118` — `role public.user_role NOT NULL DEFAULT 'candidate'` | ✓ | Low | None |
| `status` | `03_users_auth.sql:132` — `status public.account_status NOT NULL DEFAULT 'pending_verification'` | ✓ | Low | None |

**Excluded fields correctly omitted:**
- `last_password_changed_at` (line 136) — security timestamp ✓
- `locked_until` (line 137) — lockout data ✓
- `deleted_at` (line 140) — deletion internals ✓
- `deleted_reason` (line 141) — deletion internals ✓

**Verdict: ✓ PASS** — All 10 fields verified against SQL.

### 3B. Identity/session — `GET /auth/sessions`

| Field | SQL evidence (`user_sessions` table) | Correct? | Exposure risk | Fix |
|---|---|---|---|---|
| `id` | `03_users_auth.sql:336` — `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` | ✓ | Low | None |
| `session_id` | **NOT A COLUMN** — table has `id`, not `session_id` | **⚠️ BLOCKER** | — | Rename to `id` or document alias mapping |
| `user_id` | `03_users_auth.sql:337` — `user_id UUID NOT NULL REFERENCES public.users(id)` | ✓ | Medium — own user only | None (ownership check required) |
| `socket_id` | `03_users_auth.sql:342` — `socket_id VARCHAR(100)` | ✓ | Low | None |
| `device_type` | `03_users_auth.sql:343` — `device_type VARCHAR(50)` | ✓ | Low | None |
| `user_agent` | `03_users_auth.sql:344` — `user_agent TEXT` | ✓ | Low — browser fingerprint | None |
| `last_seen_at` | `03_users_auth.sql:341` — `last_seen_at TIMESTAMPTZ` | ✓ | Low | None |
| `is_online` | `03_users_auth.sql:340` — `is_online BOOLEAN NOT NULL DEFAULT true` | ✓ | Low | None |
| `created_at` | `03_users_auth.sql:346` — `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` | ✓ | Low | None |
| `updated_at` | `03_users_auth.sql:347` — `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` | ✓ | Low | None |

**Exclusion list check:**
- `ip_address` — **DOES NOT EXIST** in `user_sessions` table. Worksheet line 12 excludes a phantom column.
- `last_activity_at` — **DOES NOT EXIST** in `user_sessions` table. Worksheet line 12 excludes a phantom column.

The exclude list was written against an outdated or incorrect table definition. The actual
`user_sessions` table (lines 335–348) has no `ip_address` or `last_activity_at` column.

**Verdict: ⚠️ BLOCKER** — `session_id` is not a real column. Phantom columns in exclude list.

### 3C. Identity/session — `POST /auth/sessions/revoke`

| Field | SQL evidence | Correct? | Exposure risk | Fix |
|---|---|---|---|---|
| `session_id` (request) | **NOT A COLUMN** — `user_sessions` has `id` | **⚠️ BLOCKER** | — | Map to `id` column |

**Verdict: ⚠️ BLOCKER** — Request parameter `session_id` must map to `user_sessions.id`.

### 3D. Company — Create

| Field | SQL evidence (`companies` table) | Correct? | Exposure risk | Fix |
|---|---|---|---|---|
| `name` | `04_companies.sql:46` — `name VARCHAR(255) NOT NULL` | ✓ | Low | None |
| `slug` | `04_companies.sql:47` — `slug CITEXT NOT NULL UNIQUE` | ✓ | Low | None |
| `legal_name` | `04_companies.sql:48` — `legal_name VARCHAR(255)` | ✓ | Low | None |
| `registration_number` | `04_companies.sql:49` — `registration_number VARCHAR(100) UNIQUE` | ✓ | Medium — business ID | None |
| `description` | `04_companies.sql:52` — `description TEXT` | ✓ | Low | None |
| `short_description` | `04_companies.sql:53` — `short_description VARCHAR(500)` | ✓ | Low | None |
| `industry` | `04_companies.sql:54` — `industry VARCHAR(100)` | ✓ | Low | None |
| `company_size` | `04_companies.sql:55` — `company_size company_size` (enum) | ✓ | Low | None |
| `website` | `04_companies.sql:56` — `website VARCHAR(500)` | ✓ | Low | None |
| `linkedin_url` | `04_companies.sql:57` — `linkedin_url VARCHAR(500)` | ✓ | Low | None |
| `twitter_url` | `04_companies.sql:58` — `twitter_url VARCHAR(500)` | ✓ | Low | None |
| `facebook_url` | `04_companies.sql:59` — `facebook_url VARCHAR(500)` | ✓ | Low | None |
| `youtube_url` | `04_companies.sql:60` — `youtube_url VARCHAR(500)` | ✓ | Low | None |
| `email` | `04_companies.sql:68` — `email CITEXT` | ✓ | Medium — PII | None |
| `phone` | `04_companies.sql:69` — `phone VARCHAR(50)` | ✓ | Medium — PII | None |
| `address_line1` | `04_companies.sql:70` — `address_line1 VARCHAR(255)` | ✓ | Low | None |
| `address_line2` | `04_companies.sql:71` — `address_line2 VARCHAR(255)` | ✓ | Low | None |
| `city` | `04_companies.sql:72` — `city VARCHAR(100)` | ✓ | Low | None |
| `state` | `04_companies.sql:73` — `state VARCHAR(100)` | ✓ | Low | None |
| `country` | `04_companies.sql:74` — `country VARCHAR(100)` | ✓ | Low | None |
| `postal_code` | `04_companies.sql:75` — `postal_code VARCHAR(20)` | ✓ | Low | None |
| `latitude` | `04_companies.sql:76` — `latitude DECIMAL(10, 7)` | ✓ | Low | None |
| `longitude` | `04_companies.sql:77` — `longitude DECIMAL(10, 7)` | ✓ | Low | None |
| `brand_color` | `04_companies.sql:65` — `brand_color VARCHAR(7)` | ✓ | Low | None |

**Missing from request fields (exists in SQL but not in DTO):**
- `cover_image_path` — `04_companies.sql:64` — exists but not in request DTO. May be intentional (separate upload flow) or oversight.

**Verdict: ✓ PASS** — All 24 request fields verified. `cover_image_path` omission noted.

### 3E. Company — Create Response

| Field | SQL evidence | Correct? | Exposure risk | Fix |
|---|---|---|---|---|
| `id` | `04_companies.sql:43` — `id UUID PRIMARY KEY` | ✓ | Low | None |
| `name` | `04_companies.sql:46` | ✓ | Low | None |
| `slug` | `04_companies.sql:47` | ✓ | Low | None |
| `description` | `04_companies.sql:52` | ✓ | Low | None |
| `industry` | `04_companies.sql:54` | ✓ | Low | None |
| `company_size` | `04_companies.sql:55` | ✓ | Low | None |
| `website` | `04_companies.sql:56` | ✓ | Low | None |
| `is_active` | `04_companies.sql:91` — `is_active BOOLEAN NOT NULL DEFAULT true` | ✓ | Low | None |
| `verification_status` | `04_companies.sql:81` — `verification_status company_verification_status NOT NULL DEFAULT 'unverified'` | ✓ | **LOW** — internal admin field | Consider excluding from non-admin responses |
| `created_at` | `04_companies.sql:95` | ✓ | Low | None |
| `updated_at` | `04_companies.sql:96` | ✓ | Low | None |

**Correctly excluded from response:**
- `owner_id` (line 80) — sensitive ownership ✓
- `verification_document_path` (line 83) — internal ✓
- `settings` JSONB (line 86) — internal ✓
- `deleted_at` (line 92) — deletion internals ✓
- `deleted_reason` — deletion internals ✓
- `logo_path` (line 63) — storage path ✓
- `cover_image_path` (line 64) — storage path ✓
- `legal_name` (line 48) — optional internal ✓
- `registration_number` (line 49) — business ID ✓

**Verdict: ✓ PASS with LOW note** — `verification_status` inclusion is defensible but may need per-role filtering.

### 3F. Company — Update

Uses "approved mutable subset of the create fields." Same SQL columns as create. Correct.

**Verdict: ✓ PASS**

### 3G. Organization — Branch

| Field | SQL evidence (`company_branches`) | Correct? | Fix |
|---|---|---|---|
| `name` | `04_companies.sql:146` — `name VARCHAR(255) NOT NULL` | ✓ | None |
| `city` | `04_companies.sql:153` — `city VARCHAR(100) NOT NULL` | ✓ | None |
| `country` | `04_companies.sql:155` — `country VARCHAR(100) NOT NULL` | ✓ | None |
| `is_headquarters` | `04_companies.sql:147` — `is_headquarters BOOLEAN NOT NULL DEFAULT false` | ✓ | None |

**Additional columns in `company_branches` not listed:**
- `id` (line 144) — UUID PK
- `company_id` (line 145) — FK
- `is_active` (line 148) — BOOLEAN
- `address_line1` (line 151) — VARCHAR
- `address_line2` (line 152) — VARCHAR
- `state` (line 154) — VARCHAR
- `postal_code` (line 156) — VARCHAR
- `latitude` (line 157) — DECIMAL
- `longitude` (line 158) — DECIMAL
- `phone` (line 161) — VARCHAR
- `email` (line 162) — CITEXT
- `timezone` (line 163) — VARCHAR
- `created_at` (line 165) — TIMESTAMPTZ
- `updated_at` (line 166) — TIMESTAMPTZ

Worksheet says "for example `name, city, country, is_headquarters` only after exact column
verification." The exact columns are verified above. The full list should be documented.

**FK rule:** `company_branches` has no `head_member_id`. ✓ Correct — branches don't have heads.

**Verdict: ✓ PASS** — 4 example fields verified. Full column list should be documented.

### 3H. Organization — Department

| Field | SQL evidence (`departments`) | Correct? | Fix |
|---|---|---|---|
| `name` | `04_companies.sql:186` — `name VARCHAR(255) NOT NULL` | ✓ | None |
| `head_member_id` | `04_companies.sql:187` — `head_member_id UUID` | ✓ | None |

**FK rule:** `04_companies.sql:313-316` — `departments_head_member_fk FOREIGN KEY (head_member_id, id) REFERENCES company_members(id, department_id) ON DELETE RESTRICT`

`head_member_id` points to `company_members.id`, NOT `users.id`. Worksheet correctly states
"FK points to `company_members`, not a user field." ✓

**Additional columns in `departments`:**
- `id` (line 184) — UUID PK
- `company_id` (line 185) — FK
- `description` (line 188) — TEXT
- `is_active` (line 189) — BOOLEAN
- `created_at` (line 191) — TIMESTAMPTZ
- `updated_at` (line 192) — TIMESTAMPTZ

**Verdict: ✓ PASS** — FK rule correctly documented.

### 3I. Organization — Team

| Field | SQL evidence (`teams`) | Correct? | Fix |
|---|---|---|---|
| `department_id` | `04_companies.sql:210` — `department_id UUID NOT NULL REFERENCES departments(id)` | ✓ | None |
| `name` | `04_companies.sql:211` — `name VARCHAR(255) NOT NULL` | ✓ | None |
| `lead_member_id` | `04_companies.sql:212` — `lead_member_id UUID` | ✓ | None |

**FK rule:** `04_companies.sql:318-321` — `teams_lead_member_fk FOREIGN KEY (lead_member_id, id) REFERENCES company_members(id, team_id) ON DELETE RESTRICT`

`lead_member_id` points to `company_members.id`, NOT `users.id`. ✓ Correct.

**Additional columns in `teams`:**
- `id` (line 209) — UUID PK
- `description` (line 213) — TEXT
- `is_active` (line 214) — BOOLEAN
- `created_at` (line 216) — TIMESTAMPTZ
- `updated_at` (line 217) — TIMESTAMPTZ

**Verdict: ✓ PASS** — FK rule correctly documented.

### 3J. Membership — All fields

Worksheet lists: `company_id, user_id, branch_id, department_id, team_id, manager_member_id,
title, employee_code, employment_type, is_primary_hr, permissions, is_active, invited_at,
invited_by, joined_at, left_at, employment_status, work_email, work_phone, created_at, updated_at`

| Field | SQL evidence (`company_members`) | Correct? | Fix |
|---|---|---|---|
| `company_id` | `04_companies.sql:236` — `company_id UUID NOT NULL REFERENCES companies(id)` | ✓ | None |
| `user_id` | `04_companies.sql:237` — `user_id UUID NOT NULL REFERENCES users(id)` | ✓ | None |
| `branch_id` | `04_companies.sql:238` — `branch_id UUID` | ✓ | None |
| `department_id` | `04_companies.sql:239` — `department_id UUID` | ✓ | None |
| `team_id` | `04_companies.sql:240` — `team_id UUID` | ✓ | None |
| `manager_member_id` | `04_companies.sql:241` — `manager_member_id UUID` | ✓ | None |
| `title` | `04_companies.sql:244` — `title VARCHAR(255)` | ✓ | None |
| `employee_code` | `04_companies.sql:245` — `employee_code VARCHAR(100)` | ✓ | None |
| `employment_type` | `04_companies.sql:246` — `employment_type employment_type` (enum) | ✓ | None |
| `is_primary_hr` | `04_companies.sql:247` — `is_primary_hr BOOLEAN NOT NULL DEFAULT false` | ✓ | None |
| `permissions` | `04_companies.sql:250` — `permissions JSONB` | ✓ | None |
| `is_active` | `04_companies.sql:255` — `is_active BOOLEAN NOT NULL DEFAULT false` | ✓ | None |
| `invited_at` | `04_companies.sql:256` — `invited_at TIMESTAMPTZ` | ✓ | None |
| `invited_by` | `04_companies.sql:257` — `invited_by UUID REFERENCES users(id) ON DELETE SET NULL` | ✓ | None |
| `joined_at` | `04_companies.sql:258` — `joined_at TIMESTAMPTZ` | ✓ | None |
| `left_at` | `04_companies.sql:261` — `left_at TIMESTAMPTZ` | ✓ | None |
| `employment_status` | `04_companies.sql:262` — `employment_status employment_status` (enum) | ✓ | None |
| `work_email` | `04_companies.sql:263` — `work_email CITEXT` | ✓ | None |
| `work_phone` | `04_companies.sql:264` — `work_phone VARCHAR(50)` | ✓ | None |
| `created_at` | `04_companies.sql:266` | ✓ | None |
| `updated_at` | `04_companies.sql:267` | ✓ | None |

**`manager_member_id` FK:** `04_companies.sql:303-305` — `company_members_manager_tenant_fk FOREIGN KEY (manager_member_id, company_id) REFERENCES company_members(id, company_id) ON DELETE RESTRICT`

Points to `company_members.id`, NOT `users.id`. ✓ Correct.

**Membership rules documented in worksheet:**
- Client cannot submit `company_id`, actor identity, or owner identity ✓
- `user_id` must reference existing `users` row ✓
- `head_member_id`, `lead_member_id`, `manager_member_id` are member IDs, not user IDs ✓
- Rejoin reactivates existing row; no duplicate ✓

**Verdict: ✓ PASS** — All 21 fields verified. FK rules correctly documented.

---

## 4. Missing fields or over-exposed fields

### Missing from DTO (exists in SQL, not in worksheet)

| Table | Field | SQL evidence | Severity | Note |
|---|---|---|---|---|
| `companies` | `cover_image_path` | `04_companies.sql:64` | LOW | May be separate upload flow |
| `companies` | `logo_path` | `04_companies.sql:63` | LOW | May be separate upload flow |
| `company_branches` | Full column list not documented | `04_companies.sql:143-170` | LOW | Worksheet says "after exact verification" |
| `departments` | `description` | `04_companies.sql:188` | LOW | Not in example fields |
| `departments` | `is_active` | `04_companies.sql:189` | LOW | Needed for deactivation |
| `teams` | `description` | `04_companies.sql:213` | LOW | Not in example fields |
| `teams` | `is_active` | `04_companies.sql:214` | LOW | Needed for deactivation |

### Over-exposed fields

| Table | Field | Severity | Reason |
|---|---|---|---|
| `companies` | `verification_status` | LOW | Internal admin status; may need per-role filtering |

### Phantom fields (worksheet references, do not exist in SQL)

| Table | Field | SQL evidence | Severity |
|---|---|---|---|
| `user_sessions` | `session_id` | `03_users_auth.sql:335-348` — no `session_id` column | **BLOCKER** |
| `user_sessions` | `ip_address` (in exclude list) | `03_users_auth.sql:335-348` — no `ip_address` column | **MEDIUM** |
| `user_sessions` | `last_activity_at` (in exclude list) | `03_users_auth.sql:335-348` — no `last_activity_at` column | **MEDIUM** |

---

## 5. Contract conflicts

| # | Conflict | Severity | Description |
|---|---|---|---|
| 1 | `session_id` vs `id` | **BLOCKER** | AUTH-SESSION revoke request uses `session_id` but `user_sessions` table has `id`. The DTO-to-column mapping is incorrect. Controller code would reference wrong column. |
| 2 | Phantom exclude columns | **MEDIUM** | Exclude list references `ip_address` and `last_activity_at` which don't exist. Suggests worksheet was written against wrong table definition. |
| 3 | `verification_status` in response | **LOW** | Internal admin field in safe response. May need conditional exposure based on role. |

No conflicts with D1–D8 decisions. No conflicts with API catalog. No conflicts with RLS.

---

## 6. Exact corrections required

| # | Fix | Location | Severity |
|---|---|---|---|
| 1 | Change `session_id` to `id` in AUTH-SESSION response candidates and revoke request. Or document explicit alias mapping: "API parameter `session_id` maps to SQL column `user_sessions.id`." | Worksheet line 12, 13 | **BLOCKER** |
| 2 | Remove phantom columns `ip_address` and `last_activity_at` from exclude list. Replace with actual columns that should be excluded (none — all real columns are already in the include list). | Worksheet line 12 | **MEDIUM** |
| 3 | Document full column list for `company_branches` (13 columns beyond the 4 examples). | Worksheet line 28 | **LOW** |
| 4 | Document `description` and `is_active` for departments and teams. | Worksheet lines 29–30 | **LOW** |
| 5 | Consider whether `verification_status` should be in non-admin responses. | Worksheet line 19 | **LOW** |

---

## 7. Final readiness

### **NOT YET READY FOR CONTRACT FREEZE**

The DTO mapping is substantially correct with all 21 membership fields, 24 company create
fields, 10 auth/me fields, and 3 organization FK rules verified against SQL. However:

- **1 BLOCKER**: `session_id` → `id` mapping must be resolved.
- **2 MEDIUM**: Phantom columns in exclude list must be corrected.
- **3 LOW**: Minor documentation gaps.

**After the 5 fixes above:**
1. Every DTO field maps to an exact SQL column
2. No phantom or invented fields remain
3. Sensitive fields are correctly excluded
4. FK rules are correctly documented
5. Independent review passes

**Then:** DTO mapping is frozen. OpenAPI generation may proceed.
