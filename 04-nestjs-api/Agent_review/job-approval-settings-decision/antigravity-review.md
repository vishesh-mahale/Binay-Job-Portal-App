# Architectural Decision & Review Report — Company Job-Approval Settings API Contract

**Agent:** Antigravity  
**Status:** `APPROVED / FROZEN CONTRACT DECISION`  
**Date:** 2026-08-29  
**Repository Scope:** `Binay-Job-Portal-App/04-nestjs-api/`

---

## Executive Summary & Authority Baseline

This document finalizes the contract design, DTO specifications, permission boundaries, audit requirements, lifecycle semantics, and test plan for the **Company Job-Approval Settings API**.

All decisions strictly cite baseline repository evidence:
- `AGENTS.md` (Agent Working Rules)
- `02-database/migrations/baseline/04_companies.sql` (line 339: `job_approval_required BOOLEAN NOT NULL DEFAULT false`)
- `04-nestjs-api/04-nestjs-api-app/jobs-search-review/DECISION-07-JOBS-SEARCH-FINAL.md` (Section J3)
- `04-nestjs-api/04-nestjs-api-app/src/jobs.ts` (`publish()` method evaluation)

---

## 1. Exact Company-Scoped Route

Following the RESTful resource patterns frozen in `DECISION-07` and implemented in `src/companies.ts`:

- **Read Settings Route:**
  `GET /api/v1/companies/:companyId/settings`
- **Update Settings Route:**
  `PATCH /api/v1/companies/:companyId/settings`

---

## 2. HTTP Methods & Request/Response DTO Contracts

### GET `/api/v1/companies/:companyId/settings`
- **Response `200 OK` (`CompanySettingsResponseDto`):**
  ```json
  {
    "company_id": "c1111111-1111-4111-8111-111111111111",
    "job_approval_required": false,
    "auto_shortlist_enabled": false,
    "ai_matching_enabled": true,
    "notify_on_new_application": true,
    "notify_on_shortlist": true,
    "notify_on_interview_booked": true,
    "created_at": "2026-08-29T00:00:00.000Z",
    "updated_at": "2026-08-29T00:00:00.000Z"
  }
  ```

### PATCH `/api/v1/companies/:companyId/settings`
- **Request Body (`UpdateCompanySettingsDto`):**
  ```json
  {
    "job_approval_required": true
  }
  ```
  *(All fields optional boolean; only provided fields are updated)*
- **Response `200 OK`:** Returns updated `CompanySettingsResponseDto`.
- **Response `400 Bad Request`:** `VALIDATION_ERROR` for non-boolean values or malformed payload.
- **Response `403 Forbidden`:** `FORBIDDEN` for unauthorized users or cross-company requests.

---

## 3. Actor Permissions & Authorization Matrix

| Actor Role / Context | Can Read Settings (`GET`) | Can Update `job_approval_required` (`PATCH`) | Enforcement Policy |
|---|---|---|---|
| **Company Owner** (`c.owner_id = userId`) | ✅ Allowed | ✅ Allowed | Authorized employer-side owner |
| **Platform Admin** (`user.role = 'admin'`) | ✅ Allowed | ✅ Allowed | Platform governance access |
| **Primary HR / Delegated Admin** (`m.is_primary_hr = true` or `(m.permissions->>'manage_company') = true`) | ✅ Allowed | ✅ Allowed | Delegated company management |
| **General HR Member / Recruiter** | ✅ Allowed (Read-only) | ❌ Denied (`403 FORBIDDEN`) | Cannot alter approval governance |
| **Candidate / Guest User** | ❌ Denied (`403 FORBIDDEN`) | ❌ Denied (`403 FORBIDDEN`) | No company settings access |

---

## 4. Cross-Company Denial & Isolation Behavior

- If caller context does not own or belong to the target `:companyId` with appropriate active membership (`m.is_active = true AND m.left_at IS NULL`), request fails closed with **`403 FORBIDDEN`**.
- Cross-company settings access or mutation is strictly denied at both NestJS guard level and database query scope (`WHERE company_id = $1`).

---

## 5. Audit Logging Requirements

Every settings update MUST atomically record an audit entry in `public.audit_logs` within the same database transaction:

```sql
INSERT INTO public.audit_logs (
    company_id, user_id, action, entity_type, entity_id, old_values, new_values, changes
) VALUES (
    $1, $2, 'company_settings.updated', 'company_settings', $1,
    $3::jsonb, $4::jsonb, $5::jsonb
);
```
- `action`: `'company_settings.updated'`
- `entity_type`: `'company_settings'`
- `changes`: JSON diff of altered fields (e.g. `{"job_approval_required": {"old": false, "new": true}}`).

---

## 6. Lifecycle Impact Scope (Future Submissions Only)

Per `DECISION-07` Section J3:
- Toggling `job_approval_required` applies **ONLY to future publish submissions** (`JobService.publish()`).
- **Existing Draft Jobs:** When published after setting change, evaluated against setting value at execution time.
- **Already Pending Approval Jobs (`status = 'pending_approval'`):** Retain current approval state. Changing setting to `false` does NOT automatically publish previously submitted pending jobs.
- **Already Published Jobs (`status = 'published'`):** Remain published; setting change does NOT retract existing active job listings.

---

## 7. Production Database Backfill Strategy

- Baseline SQL migration `04_companies.sql` establishes `job_approval_required DEFAULT false` for all newly provisioned companies and pre-production database rebuilds.
- For pre-existing production databases deployed prior to baseline freeze:
  - **Forward Migration SQL (`02-database/migrations/forward/XX_backfill_job_approval.sql`):**
    ```sql
    -- Backfill company_settings rows missing explicit job_approval_required boolean
    INSERT INTO public.company_settings (company_id, job_approval_required)
    SELECT id, false FROM public.companies c
    ON CONFLICT (company_id) DO UPDATE
    SET job_approval_required = COALESCE(company_settings.job_approval_required, false);
    ```

---

## 8. Validation, Idempotency & Concurrency Controls

1. **Input Validation:** Enforced via `class-validator` (`@IsBoolean()`, `@IsOptional()`). Non-boolean values reject with `400 VALIDATION_ERROR` prior to database queries.
2. **Empty Payload Behavior:** If no valid fields are provided, endpoint returns current settings without issuing an unnecessary database update.
3. **Idempotency & Concurrency:** Updates use parameterized SQL `UPDATE public.company_settings SET ... WHERE company_id = $1 RETURNING *`. Identical value updates execute cleanly and idempotently.

---

## 9. Required Unit & Integration Test Plan

### Unit Tests (`src/company-settings.spec.ts`):
1. `company owner can read and update job_approval_required with audit logging`
2. `platform admin can update company settings`
3. `regular HR member without manage_company permission cannot update settings (403 FORBIDDEN)`
4. `non-boolean payload fails validation (400 VALIDATION_ERROR)`
5. `cross-company settings access is denied (403 FORBIDDEN)`

### Integration Smoke Test (`scripts/company-settings-smoke.js`):
- Rollback-safe test creating company fixtures inside `BEGIN`, updating `job_approval_required` to `true`, verifying that subsequent `JobService.publish()` yields `status = 'pending_approval'`, and rolling back completely (`ROLLBACK`).

---

## Final Recommendation & Alignment Statement

This specification satisfies all authority requirements across `AGENTS.md`, `04_companies.sql`, `DECISION-07`, and `src/jobs.ts`. Ready for NestJS controller/service implementation under Phase 09-B completion.
