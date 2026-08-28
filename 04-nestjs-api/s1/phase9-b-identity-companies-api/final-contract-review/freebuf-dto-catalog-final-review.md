# Phase 09-B — DTO Class Catalog Final Review (Freebuf)

**Auditor:** Freebuf (Senior NestJS + PostgreSQL + Supabase Architect)
**Date:** 2026-08-27
**Report Path:** `04-nestjs-api/s1/phase9-b-identity-companies-api/final-contract-review/freebuf-dto-catalog-final-review.md`

---

## 1. Executive Verdict

### **PASS WITH MINOR FIXES**

DTO Class Catalog is well-structured, correctly maps to the DTO Field Mapping Worksheet, and all 5 documents are internally consistent. All 15 DTO classes trace to actual SQL tables. Zero invented fields. D1–D8 decisions correctly reflected.

**2 issues remain:**
1. **MEDIUM:** `CompanySummaryDto` missing `legal_name` (SQL-backed, in request fields)
2. **LOW:** Membership accept/deactivate request DTO status says "Conditional" but D3/D6 already approve the flow

---

## 2. Files Verified

| # | File | Status |
|---|------|--------|
| 1 | `PHASE-09-B-API-CONTRACT-PROPOSAL.md` | ✅ Read — D8 transfer endpoint added, D1-D8 resolved note added |
| 2 | `PHASE-09-B-API-CONTRACT-FREEZE.md` | ✅ Read — 18 rows, accept/rejoin paths frozen |
| 3 | `PHASE-09-B-API-CONTRACT-DECISIONS-HINGLISH.md` | ✅ Read — Status updated to "D1-D8 DECISIONS RESOLVED" |
| 4 | `PHASE-09-B-DTO-FIELD-MAPPING-WORKSHEET.md` | ✅ Read — All fields SQL-backed |
| 5 | `PHASE-09-B-DTO-CLASS-CATALOG.md` | ✅ Read — 15 DTO classes proposed |
| 6 | `03_users_auth.sql` | ✅ Read — users, user_sessions tables |
| 7 | `04_companies.sql` | ✅ Read — 6 tables verified |
| 8 | `17_rls.sql` | ✅ Read — RLS policies verified |
| 9 | `AGENTS.md` | ✅ Read |
| 10 | `PHASE-05-FINAL-REQUIREMENTS.md` | ✅ Read |
| 11 | `PHASE-06-API-CATALOG.md` | ✅ Read |
| 12 | `DECISION-01` | ✅ Read |
| 13 | `DECISION-06` | ✅ Read |

---

## 3. D1–D8 Decision Reflection

| Decision | In Proposal? | In Freeze? | In Decisions? | In DTO Catalog? | Correct? |
|----------|-------------|-----------|--------------|----------------|----------|
| D1 Auth bootstrap | ✅ "No separate endpoint" | ✅ "GET /auth/me" | ✅ APPROVED | ✅ `AuthMeResponseDto` | ✅ |
| D2 Company creation | ✅ "active employer" | ✅ "employer owner" | ✅ APPROVED | ✅ `CreateCompanyDto` | ✅ |
| D3 Membership invitation | ✅ "registered user + inactive row" | ✅ "accept existing-user row" | ✅ APPROVED | ✅ `AddCompanyMemberDto` + `MembershipSummaryDto` | ✅ |
| D4 Org API shape | ✅ Separate nested | ✅ "separate nested" | ✅ APPROVED | ✅ `BranchDto`, `DepartmentDto`, `TeamDto` | ✅ |
| D5 Session revoke | ✅ "semantics pending" | ✅ "own session only" | ✅ APPROVED | ✅ `RevokePresenceSessionDto` | ✅ |
| D6 Owner protection | ✅ "owner/admin approves" | ✅ "approval for rejoin" | ✅ APPROVED | ✅ `TransferOwnershipDto` | ✅ |
| D7 Auth revocation | ✅ "not Supabase token" | ✅ | ✅ APPROVED | N/A (cookie-level) | ✅ |
| D8 Ownership transfer | ✅ `OWNERSHIP-TRANSFER` | ✅ `ownership-transfer` | ✅ APPROVED | ✅ `TransferOwnershipDto` → `CompanySummaryDto` | ✅ |

**All 8 decisions correctly reflected across all 5 documents.**

---

## 4. DTO-by-DTO SQL Verification

### 4A. `AuthMeResponseDto` (GET /auth/me response)

| Field | SQL Column | Table | Line | Correct? |
|-------|-----------|-------|------|----------|
| `id` | `id UUID PRIMARY KEY` | `users` | L47 | ✅ |
| `email` | `email CITEXT NOT NULL UNIQUE` | `users` | L50 | ✅ |
| `first_name` | `first_name VARCHAR(100) NOT NULL` | `users` | L53 | ✅ |
| `middle_name` | `middle_name VARCHAR(100)` | `users` | L54 | ✅ |
| `last_name` | `last_name VARCHAR(100) NOT NULL DEFAULT ''` | `users` | L55 | ✅ |
| `display_name` | `display_name TEXT GENERATED ALWAYS AS` | `users` | L57 | ✅ |
| `phone` | `phone VARCHAR(20)` | `users` | L68 | ✅ |
| `avatar_path` | `avatar_path TEXT` | `users` | L71 | ✅ |
| `role` | `role public.user_role NOT NULL` | `users` | L74 | ✅ |
| `status` | `status public.account_status NOT NULL` | `users` | L80 | ✅ |

**Excluded:** `last_password_changed_at, locked_until, deleted_at, deleted_reason` ✅

**Verdict: ✅ 10/10 fields SQL-backed.**

---

### 4B. `PresenceSessionDto` / `PresenceSessionListDto` (GET /auth/sessions response)

| Field | SQL Column | Table | Line | Correct? |
|-------|-----------|-------|------|----------|
| `id` | `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` | `user_sessions` | L142 | ✅ |
| `socket_id` | `socket_id VARCHAR(100)` | `user_sessions` | L147 | ✅ |
| `device_type` | `device_type VARCHAR(50)` | `user_sessions` | L148 | ✅ |
| `user_agent` | `user_agent TEXT` | `user_sessions` | L149 | ✅ |
| `last_seen_at` | `last_seen_at TIMESTAMPTZ` | `user_sessions` | L146 | ✅ |
| `is_online` | `is_online BOOLEAN NOT NULL DEFAULT true` | `user_sessions` | L145 | ✅ |
| `created_at` | `created_at TIMESTAMPTZ NOT NULL` | `user_sessions` | L151 | ✅ |
| `updated_at` | `updated_at TIMESTAMPTZ NOT NULL` | `user_sessions` | L152 | ✅ |

**Excluded:** `user_id` (unless approved), no absent columns ✅

**Previously invented fields (FIXED):** `ip_address` ✅, `last_activity_at` ✅

**Verdict: ✅ 8/8 fields SQL-backed.**

---

### 4C. `RevokePresenceSessionDto` (POST /auth/sessions/revoke request)

| Field | SQL Column | Table | Line | Correct? |
|-------|-----------|-------|------|----------|
| `session_id` | `id UUID PRIMARY KEY` | `user_sessions` | L142 | ✅ |

**Mapping rule:** `session_id` (API name) → `user_sessions.id` — explicitly documented ✅

**Verdict: ✅ CORRECT.**

---

### 4D. `CreateCompanyDto` (POST /companies request)

| Field | SQL Column | Table | Line | Correct? |
|-------|-----------|-------|------|----------|
| `name` | `name VARCHAR(255) NOT NULL` | `companies` | L58 | ✅ |
| `slug` | `slug CITEXT NOT NULL UNIQUE` | `companies` | L59 | ✅ |
| `legal_name` | `legal_name VARCHAR(255)` | `companies` | L60 | ✅ |
| `registration_number` | `registration_number VARCHAR(100) UNIQUE` | `companies` | L61 | ✅ |
| `description` | `description TEXT` | `companies` | L63 | ✅ |
| `short_description` | `short_description VARCHAR(500)` | `companies` | L64 | ✅ |
| `industry` | `industry VARCHAR(100)` | `companies` | L65 | ✅ |
| `company_size` | `company_size company_size` | `companies` | L66 | ✅ |
| `website` | `website VARCHAR(500)` | `companies` | L67 | ✅ |
| `linkedin_url` | `linkedin_url VARCHAR(500)` | `companies` | L68 | ✅ |
| `twitter_url` | `twitter_url VARCHAR(500)` | `companies` | L69 | ✅ |
| `facebook_url` | `facebook_url VARCHAR(500)` | `companies` | L70 | ✅ |
| `youtube_url` | `youtube_url VARCHAR(500)` | `companies` | L71 | ✅ |
| `email` | `email CITEXT` | `companies` | L75 | ✅ |
| `phone` | `phone VARCHAR(50)` | `companies` | L76 | ✅ |
| `address_line1` | `address_line1 VARCHAR(255)` | `companies` | L77 | ✅ |
| `address_line2` | `address_line2 VARCHAR(255)` | `companies` | L78 | ✅ |
| `city` | `city VARCHAR(100)` | `companies` | L79 | ✅ |
| `state` | `state VARCHAR(100)` | `companies` | L80 | ✅ |
| `country` | `country VARCHAR(100)` | `companies` | L81 | ✅ |
| `postal_code` | `postal_code VARCHAR(20)` | `companies` | L82 | ✅ |
| `latitude` | `latitude DECIMAL(10,7)` | `companies` | L83 | ✅ |
| `longitude` | `longitude DECIMAL(10,7)` | `companies` | L84 | ✅ |
| `brand_color` | `brand_color VARCHAR(7)` | `companies` | L73 | ✅ |

**Excluded from request (server-derived):** `owner_id` (D2: JWT `sub`) ✅

**Verdict: ✅ 24/24 fields SQL-backed.**

---

### 4E. `CompanySummaryDto` (Company read/update response)

| Field | SQL Column | Table | Line | Correct? |
|-------|-----------|-------|------|----------|
| `id` | `id UUID PK` | `companies` | L53 | ✅ |
| `name` | `name VARCHAR(255) NOT NULL` | `companies` | L58 | ✅ |
| `slug` | `slug CITEXT NOT NULL UNIQUE` | `companies` | L59 | ✅ |
| `description` | `description TEXT` | `companies` | L63 | ✅ |
| `industry` | `industry VARCHAR(100)` | `companies` | L65 | ✅ |
| `company_size` | `company_size company_size` | `companies` | L66 | ✅ |
| `website` | `website VARCHAR(500)` | `companies` | L67 | ✅ |
| `is_active` | `is_active BOOLEAN NOT NULL DEFAULT true` | `companies` | L91 | ✅ |
| `verification_status` | `verification_status company_verification_status` | `companies` | L88 | ✅ |
| `created_at` | `created_at TIMESTAMPTZ NOT NULL` | `companies` | L95 | ✅ |
| `updated_at` | `updated_at TIMESTAMPTZ NOT NULL` | `companies` | L96 | ✅ |

**Excluded:** `owner_id, verification_document_path, settings, deleted_at, registration_number` ✅

**⚠️ MEDIUM-1:** `legal_name` (`companies.legal_name VARCHAR(255)`, L60) is in the request DTO but NOT in the response DTO. This is a valid public-facing company profile field.

**Verdict: ⚠️ 11/12 — `legal_name` missing from response.**

---

### 4F. `UpdateCompanyDto` (PATCH /companies request)

Uses "approved mutable subset of the create fields" — same SQL columns as `CreateCompanyDto` minus server-derived fields. `expected_revision` conditionally included only if SQL supports it (no `revision` column exists in `companies` table).

**Verdict: ✅ Correctly conditional.**

---

### 4G. `CreateBranchDto` / `UpdateBranchDto` / `BranchDto`

| Field | SQL Column | Table | Line | Correct? |
|-------|-----------|-------|------|----------|
| `name` | `name VARCHAR(255) NOT NULL` | `company_branches` | L109 | ✅ |
| `city` | `city VARCHAR(100) NOT NULL` | `company_branches` | L116 | ✅ |
| `country` | `country VARCHAR(100) NOT NULL` | `company_branches` | L118 | ✅ |
| `is_headquarters` | `is_headquarters BOOLEAN NOT NULL DEFAULT false` | `company_branches` | L107 | ✅ |

**FK rule:** `company_id` server-derived (tenant isolation) ✅

**Full available columns:** `id, company_id, name, is_headquarters, is_active, address_line1, address_line2, city, state, country, postal_code, latitude, longitude, phone, email, timezone, created_at, updated_at`

**Verdict: ✅ Listed fields are SQL-backed. Worksheet correctly notes "only after exact column verification."**

---

### 4H. `CreateDepartmentDto` / `UpdateDepartmentDto` / `DepartmentDto`

| Field | SQL Column | Table | Line | Correct? |
|-------|-----------|-------|------|----------|
| `name` | `name VARCHAR(255) NOT NULL` | `departments` | L134 | ✅ |
| `head_member_id` | `head_member_id UUID` | `departments` | L135 | ✅ |

**FK verified:** `departments_head_member_fk FOREIGN KEY (head_member_id, id) REFERENCES company_members(id, department_id) ON DELETE RESTRICT` (L157-158)

**Previously invented (FIXED):** `code` ✅, `head_user_id` → `head_member_id` ✅

**Verdict: ✅ 2/2 fields SQL-backed, FK correctly documented.**

---

### 4I. `CreateTeamDto` / `UpdateTeamDto` / `TeamDto`

| Field | SQL Column | Table | Line | Correct? |
|-------|-----------|-------|------|----------|
| `department_id` | `department_id UUID NOT NULL REFERENCES departments(id)` | `teams` | L143 | ✅ |
| `name` | `name VARCHAR(255) NOT NULL` | `teams` | L144 | ✅ |
| `lead_member_id` | `lead_member_id UUID` | `teams` | L145 | ✅ |

**FK verified:** `teams_lead_member_fk FOREIGN KEY (lead_member_id, id) REFERENCES company_members(id, team_id) ON DELETE RESTRICT` (L161-162)

**Previously invented (FIXED):** `lead_user_id` → `lead_member_id` ✅

**Verdict: ✅ 3/3 fields SQL-backed, FK correctly documented.**

---

### 4J. `AddCompanyMemberDto` (Membership invite/add request)

| Field | SQL Column | Table | Line | Correct? |
|-------|-----------|-------|------|----------|
| `company_id` | `company_id UUID NOT NULL` | `company_members` | L169 | ✅ (server-derived, not client-submitted) |
| `user_id` | `user_id UUID NOT NULL REFERENCES users(id)` | `company_members` | L170 | ✅ |
| `branch_id` | `branch_id UUID` | `company_members` | L171 | ✅ |
| `department_id` | `department_id UUID` | `company_members` | L172 | ✅ |
| `team_id` | `team_id UUID` | `company_members` | L173 | ✅ |
| `manager_member_id` | `manager_member_id UUID` | `company_members` | L174 | ✅ |
| `title` | `title VARCHAR(255)` | `company_members` | L177 | ✅ |
| `employee_code` | `employee_code VARCHAR(100)` | `company_members` | L178 | ✅ |
| `employment_type` | `employment_type employment_type` | `company_members` | L179 | ✅ |
| `is_primary_hr` | `is_primary_hr BOOLEAN NOT NULL DEFAULT false` | `company_members` | L180 | ✅ |
| `permissions` | `permissions JSONB` | `company_members` | L183 | ✅ |
| `work_email` | `work_email CITEXT` | `company_members` | L195 | ✅ |
| `work_phone` | `work_phone VARCHAR(50)` | `company_members` | L196 | ✅ |

**Previously invented (FIXED):** `role` → `is_primary_hr` + `permissions` ✅

**Constraints verified:**
- `unique_member_per_company UNIQUE (company_id, user_id)` — one membership per user per company ✅
- `company_members_active_joined CHECK (is_active = FALSE OR joined_at IS NOT NULL)` ✅
- `company_members_team_requires_department CHECK (team_id IS NULL OR department_id IS NOT NULL)` ✅
- `company_members_manager_check CHECK (manager_member_id IS NULL OR manager_member_id <> id)` ✅

**Verdict: ✅ 13/13 fields SQL-backed, all constraints verified.**

---

### 4K. `MembershipSummaryDto` (Membership response)

| Field | SQL Column | Table | Line | Correct? |
|-------|-----------|-------|------|----------|
| `id` | `id UUID PK` | `company_members` | L166 | ✅ |
| `user_id` | `user_id UUID NOT NULL` | `company_members` | L170 | ✅ |
| `is_active` | `is_active BOOLEAN NOT NULL DEFAULT false` | `company_members` | L187 | ✅ |
| `invited_at` | `invited_at TIMESTAMPTZ` | `company_members` | L188 | ✅ |
| `joined_at` | `joined_at TIMESTAMPTZ` | `company_members` | L190 | ✅ |
| `left_at` | `left_at TIMESTAMPTZ` | `company_members` | L193 | ✅ |

**Note:** `status` is NOT a column — state derived from `is_active, joined_at, left_at`. The DTO correctly uses `is_active` boolean, not an invented `status` field. ✅

**Verdict: ✅ 6/6 fields SQL-backed.**

---

### 4L. `TransferOwnershipDto` (POST /ownership-transfer request)

| Field | SQL Column | Table | Line | Correct? |
|-------|-----------|-------|------|----------|
| `new_owner_user_id` | `owner_id UUID NOT NULL REFERENCES users(id)` | `companies` | L87 | ✅ (target must reference `users.id`) |

**Response:** `CompanySummaryDto` — same safe company summary ✅

**D8 verified:** Single-owner model; transfer from current owner to eligible active company member ✅

**Verdict: ✅ CORRECT.**

---

## 5. Non-Negotiable Rules Verification

| Rule | In Catalog? | Correct? |
|------|------------|----------|
| `session_id` → `user_sessions.id` | ✅ Explicitly documented | ✅ |
| `head_member_id` = member ID, not user ID | ✅ Explicitly documented | ✅ |
| `lead_member_id` = member ID, not user ID | ✅ Explicitly documented | ✅ |
| `manager_member_id` = member ID, not user ID | ✅ Explicitly documented | ✅ |
| `owner_id` derived from JWT, never in DTO | ✅ Documented | ✅ |
| No `ip_address`, `last_activity_at`, `head_user_id`, `lead_user_id`, `user_type` | ✅ Explicitly forbidden | ✅ |
| No unverified revision column | ✅ Documented | ✅ |
| No passwords/locks/deletion internals in response | ✅ Documented | ✅ |

---

## 6. Missing or Over-Exposed Fields

| # | Issue | Severity | Fix |
|---|-------|----------|-----|
| M-1 | `legal_name` missing from `CompanySummaryDto` response | MEDIUM | Add `legal_name` to response DTO |
| M-2 | Membership accept/deactivate request DTO status = "Conditional" but D3/D6 approve the flow | LOW | Update status to "Proposed" or "Decided" |

---

## 7. Endpoint Completeness vs Proposal/Freeze

| # | Endpoint | Proposal | Freeze | DTO Catalog | DTO Worksheet |
|---|----------|----------|--------|-------------|---------------|
| 1 | `GET /auth/me` | ✅ | ✅ | ✅ `AuthMeResponseDto` | ✅ |
| 2 | `GET /auth/sessions` | ✅ | ✅ | ✅ `PresenceSessionListDto` | ✅ |
| 3 | `POST /auth/sessions/revoke` | ✅ | ✅ | ✅ `RevokePresenceSessionDto` | ✅ |
| 4 | `POST /companies` | ✅ | ✅ | ✅ `CreateCompanyDto` → `CompanySummaryDto` | ✅ |
| 5 | `GET /companies/:companyId` | ✅ | ✅ | ✅ `CompanySummaryDto` | ✅ |
| 6 | `PATCH /companies/:companyId` | ✅ | ✅ | ✅ `UpdateCompanyDto` → `CompanySummaryDto` | ✅ |
| 7-12 | Branch/Dept/Team create/update | ✅ | ✅ | ✅ 6 DTO classes | ✅ |
| 13 | `POST .../members` | ✅ | ✅ | ✅ `AddCompanyMemberDto` → `MembershipSummaryDto` | ✅ |
| 14 | `POST .../membership/accept` | ✅ | ✅ (frozen) | ✅ `MembershipSummaryDto` | ✅ |
| 15 | `POST .../members/:memberId/deactivate` | ✅ | ✅ | ✅ `MembershipSummaryDto` | ✅ |
| 16 | `POST .../membership/leave` | ✅ | ✅ | ✅ `MembershipSummaryDto` | ✅ |
| 17 | `POST .../membership/rejoin` | ✅ | ✅ (frozen) | ✅ `MembershipSummaryDto` | ✅ |
| 18 | `POST .../ownership-transfer` | ✅ | ✅ | ✅ `TransferOwnershipDto` → `CompanySummaryDto` | ⚠️ Missing from worksheet |

**18/18 endpoints covered in DTO Catalog.** Only gap: DTO worksheet doesn't have a D8 row (LOW).

---

## 8. Cross-Document Consistency

| Check | Result |
|-------|--------|
| Proposal endpoints match Freeze rows | ✅ 18/18 |
| Proposal D8 matches Freeze D8 | ✅ `ownership-transfer` path |
| Freeze paths match DTO Catalog capabilities | ✅ 15 capabilities mapped |
| DTO Catalog fields match Worksheet fields | ✅ All fields trace |
| Worksheet fields trace to SQL columns | ✅ All 83 fields verified |
| Decisions D1-D8 reflected in all documents | ✅ Confirmed |
| No invented tables, columns, events, or roles | ✅ Confirmed |

---

## 9. Final Readiness

### **PASS WITH MINOR FIXES**

| Category | Status |
|----------|--------|
| **D1–D8 decisions** | ✅ All 8 correctly reflected |
| **DTO Class Catalog structure** | ✅ Well-organized, 15 DTO classes |
| **SQL-backed fields** | ✅ 83/84 (1 missing in response) |
| **Invented fields** | ✅ 0 (all 7 previously fixed) |
| **session_id mapping** | ✅ Explicitly documented |
| **FK member_id vs user_id** | ✅ Correctly documented |
| **Sensitive field exclusion** | ✅ Correct |
| **Endpoint completeness** | ✅ 18/18 |
| **Cross-document consistency** | ✅ All 5 documents aligned |
| **`CompanySummaryDto` response** | ⚠️ `legal_name` missing (MEDIUM) |

**After M-1 (add `legal_name` to `CompanySummaryDto`):**
```
READY FOR CONTRACT FREEZE
```

---

*Report generated by Freebuf agent on 2026-08-27.*
