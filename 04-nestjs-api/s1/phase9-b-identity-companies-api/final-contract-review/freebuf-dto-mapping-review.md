# Phase 09-B — DTO Field Mapping Review (Freebuf)

**Auditor:** Freebuf (Senior NestJS + PostgreSQL + Supabase Architect)
**Date:** 2026-08-27
**Report Path:** `04-nestjs-api/s1/phase9-b-identity-companies-api/final-contract-review/freebuf-dto-mapping-review.md`

---

## 1. Executive Verdict

### **PASS WITH MINOR FIXES**

DTO worksheet is **significantly improved** from previous reviews. All previously flagged invented fields (`head_user_id`, `lead_user_id`, `role` on membership, `code` on departments, `ip_address` on sessions, `user_type`) are now correctly removed. However, **3 issues** remain:

1. **MEDIUM:** Company create response DTO missing `legal_name` (SQL-backed, present in request fields but not in response candidates)
2. **LOW:** `user_sessions` response excludes `user_id` but doesn't explicitly document why
3. **LOW:** D8 ownership transfer endpoint not in worksheet (consistent with Proposal gap)

---

## 2. Field-by-Field Verification

### 2A. `GET /api/v1/auth/me` Response

| Field | SQL Evidence | Correct? | Exposure Risk | Fix |
|-------|-------------|----------|---------------|-----|
| `id` | `users.id UUID PK` (L47) | ✅ Correct | None — public identity | — |
| `email` | `users.email CITEXT NOT NULL UNIQUE` (L50) | ✅ Correct | Low — business contact | — |
| `first_name` | `users.first_name VARCHAR(100) NOT NULL` (L53) | ✅ Correct | None | — |
| `middle_name` | `users.middle_name VARCHAR(100)` (L54) | ✅ Correct | None | — |
| `last_name` | `users.last_name VARCHAR(100) NOT NULL DEFAULT ''` (L55) | ✅ Correct | None | — |
| `display_name` | `users.display_name TEXT GENERATED ALWAYS AS` (L57) | ✅ Correct | None — generated | — |
| `phone` | `users.phone VARCHAR(20)` (L68) | ✅ Correct | Low — contact | — |
| `avatar_path` | `users.avatar_path TEXT` (L71) | ✅ Correct | Low — storage path | — |
| `role` | `users.role public.user_role NOT NULL DEFAULT 'candidate'` (L74) | ✅ Correct | None | — |
| `status` | `users.status public.account_status NOT NULL DEFAULT 'pending_verification'` (L80) | ✅ Correct | None | — |

**Excluded fields correctly omitted:**
- `last_password_changed_at` — sensitive security timestamp ✅
- `locked_until` — sensitive lock data ✅
- `deleted_at` — internal soft-delete ✅
- `deleted_reason` — internal ✅
- `created_at` — present in SQL but not in response; acceptable ✅
- `updated_at` — present in SQL but not in response; acceptable ✅

**Verdict: ✅ ALL CORRECT — 10/10 fields SQL-backed, 6 sensitive fields correctly excluded.**

---

### 2B. `GET /api/v1/auth/sessions` Response

| Field | SQL Evidence | Correct? | Exposure Risk | Fix |
|-------|-------------|----------|---------------|-----|
| `id` | `user_sessions.id UUID PK DEFAULT gen_random_uuid()` (L142) | ✅ Correct | None | — |
| `socket_id` | `user_sessions.socket_id VARCHAR(100)` (L147) | ✅ Correct | Low — internal WS ID | — |
| `device_type` | `user_sessions.device_type VARCHAR(50)` (L148) | ✅ Correct | None | — |
| `user_agent` | `user_sessions.user_agent TEXT` (L149) | ✅ Correct | Low — browser fingerprint | — |
| `last_seen_at` | `user_sessions.last_seen_at TIMESTAMPTZ` (L146) | ✅ Correct | None | — |
| `is_online` | `user_sessions.is_online BOOLEAN NOT NULL DEFAULT true` (L145) | ✅ Correct | None | — |
| `created_at` | `user_sessions.created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` (L151) | ✅ Correct | None | — |
| `updated_at` | `user_sessions.updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` (L152) | ✅ Correct | None | — |

**Previously invented fields now removed:**
- `ip_address` — NOT in `user_sessions` table ✅ FIXED
- `last_activity_at` — NOT in `user_sessions` table ✅ FIXED

**Note:** `user_id` is correctly excluded from response (D5: own sessions only; no need to expose user_id in own session response).

**Verdict: ✅ ALL CORRECT — 8/8 fields SQL-backed, 0 invented fields.**

---

### 2C. `POST /api/v1/auth/sessions/revoke` Request

| Field | SQL Evidence | Correct? | Exposure Risk | Fix |
|-------|-------------|----------|---------------|-----|
| `session_id` (UUID) | `user_sessions.id UUID PK` (L142) | ✅ Correct | None — opaque identifier | — |

**Verdict: ✅ CORRECT.**

---

### 2D. Company Create Request

| Field | SQL Evidence | Correct? | Exposure Risk | Fix |
|-------|-------------|----------|---------------|-----|
| `name` | `companies.name VARCHAR(255) NOT NULL` (L58) | ✅ Correct | None | — |
| `slug` | `companies.slug CITEXT NOT NULL UNIQUE` (L59) | ✅ Correct | None | — |
| `legal_name` | `companies.legal_name VARCHAR(255)` (L60) | ✅ Correct | None | — |
| `registration_number` | `companies.registration_number VARCHAR(100) UNIQUE` (L61) | ✅ Correct | Low — business ID | — |
| `description` | `companies.description TEXT` (L63) | ✅ Correct | None | — |
| `short_description` | `companies.short_description VARCHAR(500)` (L64) | ✅ Correct | None | — |
| `industry` | `companies.industry VARCHAR(100)` (L65) | ✅ Correct | None | — |
| `company_size` | `companies.company_size company_size` (L66) | ✅ Correct | None — enum | — |
| `website` | `companies.website VARCHAR(500)` (L67) | ✅ Correct | None | — |
| `linkedin_url` | `companies.linkedin_url VARCHAR(500)` (L68) | ✅ Correct | None | — |
| `twitter_url` | `companies.twitter_url VARCHAR(500)` (L69) | ✅ Correct | None | — |
| `facebook_url` | `companies.facebook_url VARCHAR(500)` (L70) | ✅ Correct | None | — |
| `youtube_url` | `companies.youtube_url VARCHAR(500)` (L71) | ✅ Correct | None | — |
| `email` | `companies.email CITEXT` (L75) | ✅ Correct | Low — contact | — |
| `phone` | `companies.phone VARCHAR(50)` (L76) | ✅ Correct | Low — contact | — |
| `address_line1` | `companies.address_line1 VARCHAR(255)` (L77) | ✅ Correct | None | — |
| `address_line2` | `companies.address_line2 VARCHAR(255)` (L78) | ✅ Correct | None | — |
| `city` | `companies.city VARCHAR(100)` (L79) | ✅ Correct | None | — |
| `state` | `companies.state VARCHAR(100)` (L80) | ✅ Correct | None | — |
| `country` | `companies.country VARCHAR(100)` (L81) | ✅ Correct | None | — |
| `postal_code` | `companies.postal_code VARCHAR(20)` (L82) | ✅ Correct | None | — |
| `latitude` | `companies.latitude DECIMAL(10,7)` (L83) | ✅ Correct | None | — |
| `longitude` | `companies.longitude DECIMAL(10,7)` (L84) | ✅ Correct | None | — |
| `brand_color` | `companies.brand_color VARCHAR(7)` (L73) | ✅ Correct | None | — |

**Sensitive fields correctly excluded from request:**
- `owner_id` — derived from JWT `sub` (D2) ✅
- `verification_status` — admin-controlled ✅
- `verified_at` — admin-controlled ✅
- `verification_document_path` — admin-controlled ✅
- `settings` — auto-initialized on create ✅
- `is_active` — server default ✅
- `deleted_at` — internal ✅

**Verdict: ✅ ALL CORRECT — 24/24 request fields SQL-backed, 7 sensitive fields correctly excluded.**

---

### 2E. Company Create Response

| Field | SQL Evidence | Correct? | Exposure Risk | Fix |
|-------|-------------|----------|---------------|-----|
| `id` | `companies.id UUID PK` (L53) | ✅ Correct | None | — |
| `name` | `companies.name VARCHAR(255) NOT NULL` (L58) | ✅ Correct | None | — |
| `slug` | `companies.slug CITEXT NOT NULL UNIQUE` (L59) | ✅ Correct | None | — |
| `description` | `companies.description TEXT` (L63) | ✅ Correct | None | — |
| `industry` | `companies.industry VARCHAR(100)` (L65) | ✅ Correct | None | — |
| `company_size` | `companies.company_size company_size` (L66) | ✅ Correct | None | — |
| `website` | `companies.website VARCHAR(500)` (L67) | ✅ Correct | None | — |
| `is_active` | `companies.is_active BOOLEAN NOT NULL DEFAULT true` (L91) | ✅ Correct | None | — |
| `verification_status` | `companies.verification_status company_verification_status` (L88) | ✅ Correct | None | — |
| `created_at` | `companies.created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` (L95) | ✅ Correct | None | — |
| `updated_at` | `companies.updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` (L96) | ✅ Correct | None | — |

**Sensitive fields correctly excluded from response:**
- `owner_id` — internal ownership structure ✅
- `verification_document_path` — sensitive admin doc ✅
- `settings` — internal config ✅
- `deleted_at` — internal ✅
- `registration_number` — business ID, optional exclusion ✅

**⚠️ MEDIUM-1:** `legal_name` is in the request fields but missing from the response candidates. This is a valid SQL-backed field (`companies.legal_name VARCHAR(255)`) that should be included in the response for company profile display.

**Verdict: ⚠️ 11/12 correct; `legal_name` missing from response candidates.**

---

### 2F. Company Update Request

| Field | SQL Evidence | Correct? | Fix |
|-------|-------------|----------|-----|
| Mutable subset of create fields | Same SQL columns | ✅ Correct | — |
| `expected_revision` | **NEEDS_VERIFICATION** — `companies` table has no `revision` column | ⚠️ See note | — |

**Note:** The worksheet says "`expected_revision` only if an actual revision column/approved contract exists." The `companies` table has NO `revision` or `expected_revision` column. If optimistic concurrency is needed, it must use `updated_at` as a version token, or a separate revision column must be added via migration. Currently this is correctly flagged as conditional.

**Verdict: ✅ Correctly conditional — `expected_revision` only if SQL supports it.**

---

### 2G. Branch Request/Response

| Field | SQL Evidence | Correct? | Fix |
|-------|-------------|----------|-----|
| `name` | `company_branches.name VARCHAR(255) NOT NULL` (L109) | ✅ Correct | — |
| `city` | `company_branches.city VARCHAR(100) NOT NULL` (L116) | ✅ Correct | — |
| `country` | `company_branches.country VARCHAR(100) NOT NULL` (L118) | ✅ Correct | — |
| `is_headquarters` | `company_branches.is_headquarters BOOLEAN NOT NULL DEFAULT false` (L107) | ✅ Correct | — |

**Worksheet says:** "actual columns from `company_branches` (for example `name, city, country, is_headquarters` only after exact column verification)"

**Full SQL columns available:**
`id, company_id, name, is_headquarters, is_active, address_line1, address_line2, city, state, country, postal_code, latitude, longitude, phone, email, timezone, created_at, updated_at`

**Verdict: ✅ CORRECT — fields listed are SQL-backed. Worksheet correctly notes "only after exact column verification."**

---

### 2H. Department Request/Response

| Field | SQL Evidence | Correct? | Fix |
|-------|-------------|----------|-----|
| `name` | `departments.name VARCHAR(255) NOT NULL` (L134) | ✅ Correct | — |
| `head_member_id` | `departments.head_member_id UUID` (L135) | ✅ Correct | — |

**FK Rule verified:** `departments_head_member_fk FOREIGN KEY (head_member_id, id) REFERENCES company_members(id, department_id) ON DELETE RESTRICT` (L157-158)

**Previously invented fields now removed:**
- `code` — NOT in `departments` table ✅ FIXED
- `head_user_id` — correct column is `head_member_id` ✅ FIXED

**Verdict: ✅ ALL CORRECT — 2/2 fields SQL-backed, FK correctly documented.**

---

### 2I. Team Request/Response

| Field | SQL Evidence | Correct? | Fix |
|-------|-------------|----------|-----|
| `department_id` | `teams.department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE` (L143) | ✅ Correct | — |
| `name` | `teams.name VARCHAR(255) NOT NULL` (L144) | ✅ Correct | — |
| `lead_member_id` | `teams.lead_member_id UUID` (L145) | ✅ Correct | — |

**FK Rule verified:** `teams_lead_member_fk FOREIGN KEY (lead_member_id, id) REFERENCES company_members(id, team_id) ON DELETE RESTRICT` (L161-162)

**Previously invented fields now removed:**
- `lead_user_id` — correct column is `lead_member_id` ✅ FIXED

**Verdict: ✅ ALL CORRECT — 3/3 fields SQL-backed, FK correctly documented.**

---

### 2J. Membership Fields

| Field | SQL Evidence | Correct? | Fix |
|-------|-------------|----------|-----|
| `company_id` | `company_members.company_id UUID NOT NULL` (L169) | ✅ Correct | — |
| `user_id` | `company_members.user_id UUID NOT NULL` (L170) | ✅ Correct | — |
| `branch_id` | `company_members.branch_id UUID` (L171) | ✅ Correct | — |
| `department_id` | `company_members.department_id UUID` (L172) | ✅ Correct | — |
| `team_id` | `company_members.team_id UUID` (L173) | ✅ Correct | — |
| `manager_member_id` | `company_members.manager_member_id UUID` (L174) | ✅ Correct | — |
| `title` | `company_members.title VARCHAR(255)` (L177) | ✅ Correct | — |
| `employee_code` | `company_members.employee_code VARCHAR(100)` (L178) | ✅ Correct | — |
| `employment_type` | `company_members.employment_type employment_type` (L179) | ✅ Correct | — |
| `is_primary_hr` | `company_members.is_primary_hr BOOLEAN NOT NULL DEFAULT false` (L180) | ✅ Correct | — |
| `permissions` | `company_members.permissions JSONB` (L183) | ✅ Correct | — |
| `is_active` | `company_members.is_active BOOLEAN NOT NULL DEFAULT false` (L187) | ✅ Correct | — |
| `invited_at` | `company_members.invited_at TIMESTAMPTZ` (L188) | ✅ Correct | — |
| `invited_by` | `company_members.invited_by UUID REFERENCES users(id)` (L189) | ✅ Correct | — |
| `joined_at` | `company_members.joined_at TIMESTAMPTZ` (L190) | ✅ Correct | — |
| `left_at` | `company_members.left_at TIMESTAMPTZ` (L193) | ✅ Correct | — |
| `employment_status` | `company_members.employment_status employment_status` (L194) | ✅ Correct | — |
| `work_email` | `company_members.work_email CITEXT` (L195) | ✅ Correct | — |
| `work_phone` | `company_members.work_phone VARCHAR(50)` (L196) | ✅ Correct | — |
| `created_at` | `company_members.created_at TIMESTAMPTZ NOT NULL` (L198) | ✅ Correct | — |
| `updated_at` | `company_members.updated_at TIMESTAMPTZ NOT NULL` (L199) | ✅ Correct | — |

**Previously invented fields now removed:**
- `role` — NOT in `company_members` table; correct fields are `is_primary_hr` + `permissions` ✅ FIXED
- `status` — NOT a column; state derived from `is_active, joined_at, left_at` ✅ FIXED

**Important rules correctly documented:**
- Client cannot submit `company_id` — ✅
- `user_id` must reference existing `public.users` row — ✅
- `head_member_id`, `lead_member_id`, `manager_member_id` are member IDs, not user IDs — ✅
- Rejoin reactivates existing row — ✅

**Verdict: ✅ ALL CORRECT — 21/21 fields SQL-backed, 0 invented.**

---

## 3. Missing or Over-Exposed Fields

| # | Issue | Severity | Area | Fix |
|---|-------|----------|------|-----|
| M-1 | `legal_name` missing from company response DTO | MEDIUM | Company create/update response | Add `legal_name` to safe response candidates |
| M-2 | Company response missing `short_description` | LOW | Company create/update response | Consider adding for profile completeness |
| M-3 | Company response missing contact fields (`email`, `phone`, `city`, `country`) | LOW | Company create/update response | Consider adding for public company profile |

---

## 4. Contract/Decision Conflicts

| # | Conflict | Severity | Evidence | Fix |
|---|----------|----------|----------|-----|
| C-1 | D8 transfer endpoint not in worksheet | LOW | Worksheet covers 14 endpoints; D8 endpoint not listed | Add transfer endpoint DTO mapping (consistent with Proposal gap) |
| C-2 | `expected_revision` for company update — no SQL revision column | LOW | `companies` table has no `revision` column | Worksheet correctly flags this as conditional; use `updated_at` or add migration |

---

## 5. Invented Fields — Previous Review (All Fixed ✅)

| # | Previously Invented | Now Fixed? | Evidence |
|---|--------------------|-----------|----|
| 1 | `ip_address` in sessions | ✅ FIXED | Not in worksheet |
| 2 | `last_activity_at` in sessions | ✅ FIXED | Not in worksheet |
| 3 | `head_user_id` in departments | ✅ FIXED | Correct `head_member_id` used |
| 4 | `lead_user_id` in teams | ✅ FIXED | Correct `lead_member_id` used |
| 5 | `role` in membership invite | ✅ FIXED | Correct `is_primary_hr` + `permissions` used |
| 6 | `code` in departments | ✅ FIXED | Not in worksheet |
| 7 | `user_type` in auth/me | ✅ FIXED | Correct `role` used |

**All 7 previously invented fields are now correctly fixed.** 🎉

---

## 6. Exact Corrections Required

| # | Fix | Severity | Document |
|---|-----|----------|----------|
| F-1 | Add `legal_name` to company response DTO candidates | MEDIUM | Worksheet §Company |
| F-2 | Document why `user_id` is excluded from sessions response | LOW | Worksheet §Identity/session |
| F-3 | Add D8 transfer endpoint DTO mapping | LOW | Worksheet (consistent with Proposal gap) |

---

## 7. Final Readiness

### **PASS WITH MINOR FIXES**

| Category | Status |
|----------|--------|
| **Overall** | ⚠️ **PASS WITH MINOR FIXES** |
| **Auth/me fields** | ✅ 10/10 correct |
| **Sessions fields** | ✅ 8/8 correct |
| **Company request fields** | ✅ 24/24 correct |
| **Company response fields** | ⚠️ 11/12 (`legal_name` missing) |
| **Branch fields** | ✅ Correct |
| **Department fields** | ✅ Correct (`head_member_id`) |
| **Team fields** | ✅ Correct (`lead_member_id`) |
| **Membership fields** | ✅ 21/21 correct |
| **Previously invented fields** | ✅ All 7 fixed |
| **Sensitive field exclusion** | ✅ Correct |
| **FK member_id vs user_id** | ✅ Correctly documented |
| **D8 transfer endpoint** | ❌ Not in worksheet (LOW) |

**After F-1 (add `legal_name` to response):**
```
READY FOR CONTRACT FREEZE
```

---

*Report generated by Freebuf agent on 2026-08-27.*
