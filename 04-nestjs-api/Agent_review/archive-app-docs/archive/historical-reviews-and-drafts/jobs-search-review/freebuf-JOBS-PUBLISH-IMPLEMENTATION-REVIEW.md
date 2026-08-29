# Job Draft Create/Update & Named Publish Implementation Review

**Auditor:** Freebuf (Senior NestJS, PostgreSQL & Security Architect)
**Date:** 2026-08-28
**Target:** `src/jobs.ts`, `src/jobs.spec.ts`, `src/app.module.ts`
**Verdict:** ⚠️ **APPROVED WITH REQUIRED FIXES — 2 HIGH gaps + 4 MEDIUM gaps**

---

## 1. Commands Executed

```
✅ npm run build              PASS (exit 0, zero errors)
✅ npm test -- --runInBand    24 suites, 70 tests — ALL PASS (27.7s)
```

---

## 2. Executive Summary

The implementation correctly establishes the NestJS job-lifecycle pattern: company-scoped REST routes, AuthGuard, transactional write + audit atomics, `company_settings.job_approval_required` branching, slug normalization, and intentional G-1 outbox deferral. The architecture is sound.

However, **two HIGH authorization gaps** and **four MEDIUM completeness gaps** must be resolved before this slice is production-ready. The most significant is that `updateDraft` and `publish` only check `created_by` or `owner_id`, excluding active company members who are authorized to manage jobs per DECISION-07 J2. A second authorization dimension — `job-management` permission from `company_members.permissions` — is completely absent.

---

## 3. Findings

### F-1 — `updateDraft` Missing Company Member Authorization
**Severity:** 🔴 HIGH
**Classification:** FIX REQUIRED
**File:** `src/jobs.ts` L94–L98

**Current code:**
```sql
AND (j.created_by = $3 OR EXISTS (
  SELECT 1 FROM public.companies c WHERE c.id = j.company_id AND c.owner_id = $3 AND c.deleted_at IS NULL
))
```

**Problem:** An active company member (`company_members.is_active = TRUE, left_at IS NULL`) who did not create the draft gets `404 NOT_FOUND`. The `createDraft` query at L33–L37 correctly includes the `company_members` check, but `updateDraft` does not.

**SQL evidence:** `04_companies.sql` L207–L235 — `company_members` table supports `is_active`, `left_at`, and `permissions` JSONB.

**Impact:** An HR member who was not the original creator cannot edit the draft. Cross-company isolation is correct, but intra-company collaboration is broken.

**Fix:** Add the `company_members` EXISTS clause to `updateDraft` WHERE, matching `createDraft`:
```sql
AND (
  j.created_by = $3
  OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = j.company_id AND c.owner_id = $3 AND c.deleted_at IS NULL)
  OR EXISTS (SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = j.company_id AND cm.user_id = $3
      AND cm.is_active = TRUE AND cm.left_at IS NULL)
)
```

---

### F-2 — `publish` Missing Company Member Authorization
**Severity:** 🔴 HIGH
**Classification:** FIX REQUIRED
**File:** `src/jobs.ts` L115

**Same gap as F-1.** `publish` uses the identical narrow WHERE clause. A non-creator company member cannot publish a draft they didn't create.

**Fix:** Same `company_members` EXISTS clause as F-1.

---

### F-3 — No `job-management` Permission Check
**Severity:** 🟡 MEDIUM
**Classification:** NEEDS_HUMAN_DECISION
**File:** `src/jobs.ts` L32–L40 (createDraft), L89–L98 (updateDraft), L105–L117 (publish)

**Problem:** DECISION-07 J2 states:
> "Active company member with approved job-management permission may create/edit drafts."

The current code only checks `role IN ('employer', 'admin')` and company membership. It never reads `company_members.permissions` JSONB.

**SQL evidence:** `04_companies.sql` L229 — `permissions JSONB` column with CHECK `jsonb_typeof(permissions) = 'object'`.

**Impact:** Any employer/admin active member can create/edit/publish regardless of explicit permission grants. This may be acceptable for v1 if the business decides that role-level access is sufficient.

**Decision needed:** Is the `role IN ('employer', 'admin')` check alone sufficient for v1, or must `company_members.permissions` contain a specific `job_management: true` flag?

---

### F-4 — No Company Verification Check Before Direct Publish
**Severity:** 🟡 MEDIUM
**Classification:** NEEDS_HUMAN_DECISION
**File:** `src/jobs.ts` L107–L116

**Problem:** `02_enums.sql` L139–L154 comments state:
> "Jobs tab tak PUBLISH nahi ho sakti jab tak company 'verified' nahi hai."
> "Current baseline mein cross-table verification NestJS publish transaction enforce karegi."

But `publish()` only reads `company_settings.job_approval_required`. It does not check `companies.verification_status = 'verified'`.

When `job_approval_required = false`, an unverified company can publish directly.

**SQL evidence:** `02_enums.sql` L139–L154, `05_jobs.sql` (no CHECK constraint on companies table), `05_jobs.sql` bottom comment: "Only verified companies can publish jobs. This rule is enforced by the NestJS business layer."

**Impact:** Unverified companies could publish jobs if `job_approval_required = false`. The schema explicitly documents this as a NestJS-enforced rule.

**Decision needed:** Should `publish()` add `c.verification_status = 'verified'` to the WHERE clause?

---

### F-5 — `publish` Audit Trail Uses `job.publish_requested`
**Severity:** 🟡 MEDIUM
**Classification:** FIX REQUIRED
**File:** `src/jobs.ts` L118–L119

**Current code:**
```sql
action = 'job.publish_requested'
```

**Problem:** When `job_approval_required = false`, the job transitions directly to `published` in the same transaction. The audit action says `job.publish_requested` but the actual status is `published`, not `pending_approval`. This is semantically incorrect for direct-publish jobs.

**Audit action recommendation:**
- `job_approval_required = true` → `job.publish_requested` (status becomes `pending_approval`) ✅ correct
- `job_approval_required = false` → `job.published` (status becomes `published` directly) — more accurate

**SQL evidence:** `13_analytics.sql` L163–L170 — `audit_logs.action` CHECK constraint: `action ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'` — both formats are valid.

---

### F-6 — Audit Record Missing `request_id` / `trace_id`
**Severity:** 🟡 MEDIUM
**Classification:** FIX REQUIRED
**File:** `src/jobs.ts` L48–L50 (createDraft), L97–L99 (updateDraft), L118–L119 (publish)

**Problem:** All three `audit_logs` INSERT statements omit `request_id` and `trace_id`. These are the primary distributed-tracing columns in `13_analytics.sql` L159–L160. The `RequestContext` module (`request-context.ts`) should provide these.

**SQL evidence:** `13_analytics.sql` L159–L160 — `request_id UUID` and `trace_id UUID` columns. `15_infrastructure.sql` — outbox events also carry `correlation_id` and `causation_id`.

**Impact:** Tracing audit events back to specific HTTP requests requires these fields. Production debugging will be harder without them.

---

### F-7 — Missing Negative and Edge-Case Tests
**Severity:** 🟡 MEDIUM
**Classification:** FIX REQUIRED
**File:** `src/jobs.spec.ts`

**Current coverage (6 tests):**
1. ✅ Publish direct/approval branching
2. ✅ Update draft with trim + audit
3. ✅ Create draft with trim + slug normalization + audit
4. ✅ Reject malformed slug before transaction
5. ✅ Read company job with correct scope
6. ✅ Read inaccessible job → NOT_FOUND

**Missing tests:**
| Test | Impact |
|------|--------|
| Duplicate slug within same company → `23505` / `409` | Verifies UNIQUE constraint triggers rollback and audit is not orphaned |
| Publish non-draft job → `404` | Verifies state guard |
| Update non-draft job → `404` | Verifies state guard |
| Publish with `job_approval_required = true` → `pending_approval` + NULL published_at | Verifies approval branch with all side-effect fields |
| Create with empty title/description → `400` | Verifies DTO validation |
| Unauthorized user (candidate role) → `403` | Verifies role guard |
| Cross-company jobId → `404` | Verifies tenant isolation |

---

## 4. What Is Correct (Validated)

| # | Check | Evidence | Result |
|---|-------|----------|--------|
| 1 | **Route paths match DECISION-07 J1** | `src/jobs.ts` L124 — `api/v1/companies/:companyId/jobs` | ✅ PASS |
| 2 | **AuthGuard on controller** | `src/jobs.ts` L125 — `@UseGuards(AuthGuard)` | ✅ PASS |
| 3 | **Controller registered** | `src/app.module.ts` L21 — `JobController` in controllers[] | ✅ PASS |
| 4 | **SystemClient injection** | `src/jobs.ts` L18 — constructor injects `SystemClient` | ✅ PASS |
| 5 | **Active user check** | `u.status = 'active' AND u.deleted_at IS NULL` | ✅ PASS |
| 6 | **Role enforcement** | `u.role IN ('employer', 'admin')` | ✅ PASS |
| 7 | **Cross-company isolation** | `j.company_id = $2` in all queries | ✅ PASS |
| 8 | **`job_approval_required` branching** | `COALESCE(cs.job_approval_required, TRUE)` from `company_settings` | ✅ PASS |
| 9 | **Draft state guard (publish)** | `WHERE j.status = 'draft' AND j.deleted_at IS NULL` | ✅ PASS |
| 10 | **Draft state guard (update)** | `WHERE ... j.status = 'draft' AND j.deleted_at IS NULL` | ✅ PASS |
| 11 | **`pending_approval` sets NULL published_at/published_by** | `CASE WHEN ... THEN NULL ELSE NOW() END` | ✅ PASS |
| 12 | **Direct publish sets published_at/published_by** | `CASE WHEN ... THEN NULL ELSE NOW()/=$3` | ✅ PASS |
| 13 | **Slug normalization** | `.toLowerCase()` + regex `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` | ✅ PASS |
| 14 | **Slug validation before transaction** | `createDraft` validates at L28–L30 before `this.system.transaction()` | ✅ PASS |
| 15 | **SQL parameterization** | All queries use `$1`, `$2` etc. — zero string interpolation | ✅ PASS |
| 16 | **Transaction atomicity** | All mutations inside `this.system.transaction()` | ✅ PASS |
| 17 | **Audit in same transaction** | `audit_logs` INSERT inside the callback | ✅ PASS |
| 18 | **`update_updated_at_column()` trigger** | `05_jobs.sql` L189 — trigger exists; code sets `updated_at = NOW()` as backup | ✅ PASS |
| 19 | **UNIQUE `(company_id, slug)` on jobs** | `05_jobs.sql` — `CONSTRAINT unique_job_slug_per_company UNIQUE (company_id, slug)` | ✅ PASS |
| 20 | **G-1 outbox deferral** | No outbox INSERT in `publish()` — intentional per DECISION-07 J8 | ✅ PASS |
| 21 | **`getCompanyJob` includes member check** | L74–L81 — `company_members` EXISTS clause present | ✅ PASS |
| 22 | **Salary/composite enum defaults** | Not used in current DTO — no wrong enum cast | ✅ PASS |
| 23 | **Slug regex prevents injection** | `^[a-z0-9]+(?:-[a-z0-9]+)*$` — no special chars | ✅ PASS |
| 24 | **ROLLBACK on slug conflict** | DB transaction rolls back; audit INSERT never reached | ✅ PASS |

---

## 5. `updateDraft` Authorization Asymmetry — Proof

| Operation | `created_by` check | `owner_id` check | `company_members` check | Correct per J2? |
|-----------|-------------------|-----------------|----------------------|-----------------|
| `createDraft` | ✅ (not needed) | ✅ L35–L36 | ✅ L36–L37 | ✅ Yes |
| `updateDraft` | ✅ L95 | ✅ L95–L96 | ❌ **MISSING** | ❌ No |
| `publish` | ✅ L113 | ✅ L113–L114 | ❌ **MISSING** | ❌ No |
| `getCompanyJob` | ✅ L78 | ✅ L79–L80 | ✅ L80–L81 | ✅ Yes |

---

## 6. SQL Compatibility Summary

| Check | Status | Evidence |
|-------|--------|----------|
| Enum `job_status` values match SQL | ✅ PASS | `'draft'`, `'pending_approval'`, `'published'` — all in `02_enums.sql` |
| `COALESCE` on nullable boolean | ✅ PASS | `company_settings.job_approval_required` has `DEFAULT true` — `COALESCE` is defensive |
| RETURNING clause field list | ✅ PASS | `JOB_FIELDS` matches `jobs` table column list |
| JSONB cast on `new_values`/`changes` | ✅ PASS | `::jsonb` cast in all audit INSERTs |
| Slug lowercase constraint | ✅ PASS | `05_jobs.sql` — `CONSTRAINT jobs_slug_lowercase CHECK (slug = lower(slug))` — code calls `.toLowerCase()` |
| Soft-delete filter | ✅ PASS | All queries include `deleted_at IS NULL` |
| Timestamp defaults | ✅ PASS | `created_at` and `updated_at` have `DEFAULT NOW()` — code also sets `updated_at = NOW()` as backup |

---

## 7. Antigravity Review Cross-Check

The previous Antigravity review (`antigravity-JOBS-PUBLISH-IMPLEMENTATION-REVIEW.md`) found the same F-1 member authorization gap. This review independently confirms it and adds:

| Gap | Antigravity Found | Freebuf Additional Finding |
|-----|-------------------|---------------------------|
| Missing member auth (updateDraft + publish) | ✅ YES | ✅ Confirmed |
| Missing `job-management` permission | ❌ NO | ✅ NEW — F-3 |
| No company verification check | ❌ NO | ✅ NEW — F-4 |
| Audit action semantics (`publish_requested` vs `published`) | ❌ NO | ✅ NEW — F-5 |
| Missing `request_id`/`trace_id` in audit | ❌ NO | ✅ NEW — F-6 |
| Missing negative tests | ❌ NO | ✅ NEW — F-7 |

---

## 8. Required Fixes Before Production

| # | Severity | Fix | Blocks Coding? | Blocks Deploy? |
|---|----------|-----|----------------|----------------|
| **F-1** | 🔴 HIGH | Add `company_members` EXISTS to `updateDraft` WHERE | No | Yes |
| **F-2** | 🔴 HIGH | Add `company_members` EXISTS to `publish` WHERE | No | Yes |
| **F-3** | 🟡 MEDIUM | Decision: v1 role-only or also permissions? | No | Yes |
| **F-4** | 🟡 MEDIUM | Decision: enforce `verification_status = 'verified'` before publish? | No | Yes |
| **F-5** | 🟡 MEDIUM | Split audit action: `job.publish_requested` (approval) vs `job.published` (direct) | No | No |
| **F-6** | 🟡 MEDIUM | Add `request_id`/`trace_id` from `RequestContext` to audit INSERTs | No | No |
| **F-7** | 🟡 MEDIUM | Add 7 missing test cases (duplicate slug, non-draft, role, cross-company, empty fields, approval branch) | No | No |

---

## 9. Not Implemented (DECISION-07 J1 Routes)

The following routes from DECISION-07 J1 are not yet implemented:

| Route | Status |
|-------|--------|
| `POST .../jobs/:jobId/pause` | ❌ Not implemented |
| `POST .../jobs/:jobId/resume` | ❌ Not implemented |
| `POST .../jobs/:jobId/close` | ❌ Not implemented |
| `POST .../jobs/:jobId/archive` | ❌ Not implemented |
| `POST .../jobs/:jobId/submit-for-approval` | ❌ Not implemented |
| `POST .../jobs/:jobId/approve` | ❌ Not implemented |
| `POST .../jobs/:jobId/reject` | ❌ Not implemented |

These are expected — the current slice covers create/update/read/publish only.

---

## 10. Final Verdict

| Category | Status |
|----------|--------|
| **Architecture** | ✅ Sound — correct NestJS pattern |
| **Transaction atomicity** | ✅ Correct |
| **Slug handling** | ✅ Correct |
| **Approval branching** | ✅ Correct |
| **G-1 deferral** | ✅ Intentional and correct |
| **Authorization** | ⚠️ 2 HIGH gaps (member check) + 1 MEDIUM (permission) |
| **Audit** | ⚠️ Missing request_id/trace_id + action semantics |
| **Tests** | ⚠️ 6/13+ needed cases covered |
| **Invented objects** | ✅ Zero |

**Overall:** ⚠️ **APPROVED WITH REQUIRED FIXES**

F-1 and F-2 are straightforward WHERE-clause fixes. F-3 and F-4 require human decisions. The slice can proceed to coding the remaining lifecycle commands (pause/resume/close/archive) while F-1/F-2 are applied.

---

## 11. No-Code-Change Confirmation

Zero source code, SQL, or configuration files were modified during this review.
