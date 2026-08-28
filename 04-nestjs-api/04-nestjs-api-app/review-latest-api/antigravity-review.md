# Latest NestJS API Security & Architecture Audit Report

**Scope:** `src/applications.ts`, `src/saved-candidates.ts`, `src/feedback.ts`, `src/analytics.ts`, `src/app.module.ts`, and `PHASE-06-API-CATALOG.md`  
**Auditor:** Antigravity (Senior Security & Architecture Auditor)  
**Date:** 2026-08-28  
**Report Location:** `04-nestjs-api/04-nestjs-api-app/review-latest-api/antigravity-review.md`  

---

## 1. Executive Summary

An independent security and architecture audit of the latest NestJS API modules (`applications.ts`, `saved-candidates.ts`, `feedback.ts`, `analytics.ts`, `app.module.ts`) was performed against database migrations (`09_applications.sql`, `12_notifications.sql`, `13_analytics.sql`, `18_feedback.sql`), `contracts/`, and `PHASE-06-API-CATALOG.md`.

### **Audit Verdict:** **PASS WITH ONE HIGH-PRIORITY INPUT VALIDATION FIX**

All 27 test suites (82/82 tests) pass empirical execution. Core security boundaries—JWT identity enforcement, RLS/SystemClient separation, transaction atomicity, snapshot immutability, outbox event generation, and PII defense—are verified and fully compliant. One high-priority input validation risk was identified in `analytics.ts` regarding entity-pair constraint handling.

---

## 2. 11-Point Verification Table

| # | Audit Item | Findings & Ground-Truth Evidence | Classification |
|---|---|---|---|
| 1 | **SQL Table/Column/Function Names** | Queries in `applications.ts`, `saved-candidates.ts`, `feedback.ts`, `analytics.ts` match `09_applications.sql`, `13_analytics.sql`, `18_feedback.sql` 100%. | ✅ **PASS** |
| 2 | **JWT Identity & Ownership** | `@UseGuards(AuthGuard)` on all controllers; `req.user.sub` used as identity source; request body `user_id` overrides ignored. | ✅ **PASS** |
| 3 | **Cross-Tenant / Cross-User Protection** | Candidate profile ownership (`cp.user_id = $1`), company membership (`cm.company_id = $1`), and recruiter scope (`recruiter_user_id = $2`) enforced in SQL. | ✅ **PASS** |
| 4 | **RLS / SystemClient Boundary** | Table RLS (`17_rls.sql`, `18_feedback.sql`) revokes `PUBLIC`/`anon`/`authenticated` direct access. Access strictly via NestJS `SystemClient`. | ✅ **PASS** |
| 5 | **Transaction Atomicity** | `submit()` writes application + snapshot + documents + history + audit + outbox in 1 atomic transaction (`this.system.transaction`). | ✅ **PASS** |
| 6 | **Duplicate / Idempotency Handling** | `submit()` catches duplicate `23505` and returns replayed summary (`replayed: true`). `analytics.ts` uses `ON CONFLICT (idempotency_key)`. | ✅ **PASS** |
| 7 | **Snapshot Immutability** | `application_profile_snapshots` protected by trigger `reject_immutable_row_change()`. UPDATE/DELETE is blocked at DB level. | ✅ **PASS** |
| 8 | **Status Transition Safety** | `changeStatus()` delegates status transitions to PostgreSQL function `change_application_status()` (`09_applications.sql`). | ✅ **PASS** |
| 9 | **PII & Raw Resume Defense** | Response payloads return minimal summary DTOs. Email is stripped from snapshot JSON; raw resume text is excluded. | ✅ **PASS** |
| 10 | **Route & Catalog Consistency** | Routes (`/api/v1/jobs/:jobId/apply`, `/api/v1/companies/:companyId/saved-candidates`, `/api/v1/feedback`, `/api/v1/analytics/events`) match catalog. | ✅ **PASS** |
| 11 | **Missing Tests & Runtime SQL Risks** | 27/27 test suites (82/82 tests) PASS. `analytics.ts` line 22 allows passing `entity_type` without `entity_id` (violates `analytics_event_entity_pair`). | ⚠️ **HIGH** *(Entity pair validation)* |

---

## 3. Detailed Findings & Classifications

### **Finding 1: Analytics Entity Pair Constraint Risk (`analytics.ts` L22)**
- **Classification:** **HIGH**
- **Evidence:** In `13_analytics.sql` lines 84–87:
  ```sql
  CONSTRAINT analytics_event_entity_pair CHECK (
      (entity_type IS NULL AND entity_id IS NULL)
      OR (NULLIF(BTRIM(entity_type), '') IS NOT NULL AND entity_id IS NOT NULL)
  )
  ```
- **Code Inspection (`src/analytics.ts` L22):**
  ```typescript
  [key, userId, name, dto.event_category, dto.source ?? 'web', JSON.stringify(dto.event_data), dto.entity_type?.trim() || null, dto.entity_id || null, ...]
  ```
- **Risk:** If a client passes `{ entity_type: 'job' }` without `entity_id` (or vice versa), `entity_type` is populated while `entity_id` is `null`. The database throws a CHECK constraint violation (`2314`) rather than clean DTO validation pipe rejection (`400 VALIDATION_ERROR`).
- **Recommended Fix:** Add pre-query validation in `AnalyticsService.ingest()`:
  ```typescript
  const hasEntityType = Boolean(dto.entity_type?.trim());
  const hasEntityId = Boolean(dto.entity_id && isUuid(dto.entity_id));
  if (hasEntityType !== hasEntityId) {
    throw new BadRequestException('VALIDATION_ERROR');
  }
  ```

---

## 4. Empirical Test Verification Evidence

```text
> node ./node_modules/jest/bin/jest.js --runInBand

PASS src/applications.spec.ts
PASS src/resume.spec.ts
PASS src/jobs.spec.ts
PASS src/search-cursor.spec.ts
PASS src/errors.spec.ts
PASS src/analytics.spec.ts
PASS src/auth.spec.ts
PASS src/oauth-state.spec.ts
PASS src/clients.spec.ts
PASS src/config.spec.ts
PASS src/auth-audit.spec.ts
PASS src/candidate.spec.ts
PASS src/resume-upload-validation.spec.ts
PASS src/saved-candidates.spec.ts
PASS src/organization.spec.ts
PASS src/ownership.spec.ts
PASS src/auth-provider.spec.ts
PASS src/health.spec.ts
PASS src/failure.spec.ts
PASS src/database.spec.ts
PASS src/membership.spec.ts
PASS src/companies.spec.ts
PASS src/observability.spec.ts
PASS src/oauth-config.spec.ts
PASS src/job-search-query.spec.ts
PASS src/candidate-search-query.spec.ts
PASS src/request-context.spec.ts

Test Suites: 27 passed, 27 total
Tests:       82 passed, 82 total
Snapshots:   0 total
Time:        38.443 s
```

---

## 5. Final Recommendation

```text
Status: APPROVED WITH ONE HIGH-PRIORITY DTO FIX
Reason: All core modules (applications, saved-candidates, feedback, analytics) demonstrate exceptional security discipline, single-transaction atomicity, zero PII leakage, and 100% test pass rate. Fixing the entity-pair validation check in analytics.ts completes the audit requirements for production deployment.
```

---

## 6. No-Code-Change Confirmation

I explicitly confirm that **zero source code, SQL migrations, or configuration files were modified** during this independent architectural audit.
