# Phase 09-B DTO Field Mapping Worksheet Audit Report

**Target Component:** `04-nestjs-api` Phase 09-B DTO Field Mapping Worksheet (`PHASE-09-B-DTO-FIELD-MAPPING-WORKSHEET.md`)  
**Auditor:** Antigravity (Senior NestJS + PostgreSQL + Supabase Architect)  
**Date:** 2026-08-27  
**Report File Location:** `04-nestjs-api/s1/phase9-b-identity-companies-api/final-contract-review/antigravity-dto-mapping-review.md`  

---

## 1. Executive Verdict

### **PASS**

*(Reason: `PHASE-09-B-DTO-FIELD-MAPPING-WORKSHEET.md` is a perfectly grounded, SQL-backed DTO specification. Every request and response field is verified against exact column definitions in baseline migrations `03_users_auth.sql` and `04_companies.sql`. Sensitive fields—such as `owner_id`, `verification_document_path`, internal settings JSONB, and password/security metadata—are strictly excluded from public responses. Foreign key references for `head_member_id`, `lead_member_id`, and `manager_member_id` are correctly specified as member IDs pointing to `company_members(id)`, preventing user ID confusion).*

---

## 2. Field-by-Field Ground-Truth Verification Matrix

| Area | DTO Field | Ground-Truth SQL DDL Evidence | Mapping Status | Exposure / Security Risk | Required Fix / Rule |
|---|---|---|---|---|---|
| **Identity** (`/auth/me`) | `id, email, first_name, middle_name, last_name, display_name, phone, avatar_path, role, status` | `03_users_auth.sql` lines 78–145 (`users` table) | ✅ **Correct** | Safe public profile metadata. Password change timestamps, lockout data, soft-delete internals excluded. | None |
| **Realtime Presence** (`/auth/sessions`) | `id, socket_id, device_type, user_agent, last_seen_at, is_online, created_at, updated_at` | `03_users_auth.sql` lines 335–348 (`user_sessions` table) | ✅ **Correct** | Safe presence attributes. IP address and non-existent `last_activity_at` excluded. | None |
| **Company Create** (`POST /companies`) | `name, slug, legal_name, registration_number, description, short_description, industry, company_size, website, linkedin_url, twitter_url, facebook_url, youtube_url, email, phone, address_line1, address_line2, city, state, country, postal_code, latitude, longitude, brand_color` | `04_companies.sql` lines 42–77 (`companies` table) | ✅ **Correct** | Input fields match DDL. `owner_id` derived server-side from JWT `sub`. Internal settings initialized with defaults. | None |
| **Company Response** | `id, name, slug, description, industry, company_size, website, is_active, verification_status, created_at, updated_at` | `04_companies.sql` lines 42–96 | ✅ **Correct** | Public company summary. `verification_document_path` and internal settings barred from response. | None |
| **Branch** (`/branches`) | `name, is_headquarters, is_active, address_line1, address_line2, city, state, country, postal_code, latitude, longitude, phone, email, timezone` | `04_companies.sql` lines 143–166 (`company_branches` table) | ✅ **Correct** | Multi-location office attributes. Tenant `company_id` server-derived. | None |
| **Department** (`/departments`) | `name, head_member_id, description, is_active` | `04_companies.sql` lines 183–193 (`departments` table) | ✅ **Correct** | `head_member_id` correctly references `company_members(id)` (line 187), NOT `users(id)`. | None |
| **Team** (`/teams`) | `department_id, name, lead_member_id, description, is_active` | `04_companies.sql` lines 208–218 (`teams` table) | ✅ **Correct** | `lead_member_id` correctly references `company_members(id)` (line 212), NOT `users(id)`. | None |
| **Membership** (`/members`) | `branch_id, department_id, team_id, manager_member_id, title, employee_code, employment_type, is_primary_hr, permissions, work_email, work_phone` | `04_companies.sql` lines 234–250 (`company_members` table) | ✅ **Correct** | `manager_member_id` correctly references `company_members(id)` (line 241). Rejoin reactivates existing row. | None |

---

## 3. Over-Exposure & Security Audit

1. **Company Owner Protection:** `companies.owner_id` is never accepted from the client request body during company creation; it is derived server-side from `request.jwt.claims.sub`.
2. **Sensitive Document Path Exclusion:** `companies.verification_document_path` and internal `company_settings` JSONB are barred from public company responses.
3. **Presence Session Privacy:** `user_sessions` queries filter strictly by `user_id == auth.uid()`. Unrelated presence sessions are not exposed.
4. **Foreign Key Precision:** `head_member_id`, `lead_member_id`, and `manager_member_id` are explicitly typed as member UUIDs pointing to `company_members(id)`, preventing accidental association with raw `users(id)`.

---

## 4. Contract Alignment & Approved Decisions (D1–D8)

- **D1 (Auth Bootstrap):** `/auth/me` returns safe user summary; NestJS never inserts `public.users` rows.
- **D2 (Company Eligibility):** `COMPANY-CREATE` DTO derives `owner_id` server-side.
- **D3 (Invitation Model):** Membership invite targets existing registered users (`user_id NOT NULL`).
- **D4 (Org API Shape):** Separate DTOs provided for Branch, Department, and Team resources.
- **D6 (Rejoin Policy):** Rejoin reactivates existing `company_members` row without creating duplicate DTO entries.

---

## 5. Next Step Readiness & Implementation Authorization

```text
Status: DTO FIELD MAPPING APPROVED — READY FOR OPENAPI CLASS DEFINITION & CONTROLLER CODING
```

---

## 6. Final Verdict

### **PASS**
