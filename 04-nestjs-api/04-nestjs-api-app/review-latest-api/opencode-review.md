# Independent Security & Architecture Audit — Latest NestJS API

**Auditor:** opencode  
**Date:** 2026-08-28  
**Scope:** `applications.ts`, `saved-candidates.ts`, `feedback.ts`, `analytics.ts`, `app.module.ts`  
**Baseline SQL:** `09_applications.sql`, `12_notifications.sql`, `13_analytics.sql`, `18_feedback.sql`, `06_documents.sql`, `04_companies.sql`, `02_enums.sql`, `17_rls.sql`  
**Catalog:** `PHASE-06-API-CATALOG.md`  
**Contracts:** `application-submitted.v1.json`, `AGGREGATE-ID-SEMANTICS.md`  
**Test state:** 27 suites, 82 tests — all passing

---

## 1. Executive Summary

### **Audit Verdict:** **PASS WITH 2 HIGH, 3 MEDIUM, 3 LOW FINDINGS**

Core security posture is sound: JWT ownership, cross-company isolation, transaction atomicity, snapshot immutability, status transition safety, and PII boundaries are all enforced. Two HIGH findings require attention before production.

---

## 2. Findings

### HIGH-1: Snapshot `snapshot_data` leaks internal profile metadata

**File:** `applications.ts:92`  
**Severity:** HIGH

**Evidence:**
```typescript
const snapshotData = { profile: { ...profile, email: undefined }, resume_document_id: dto.document_id, consent: true, screening_answers: answers };
```

`profile` is the full `candidate_profiles` row from `SELECT cp.*, u.email` (`applications.ts:38`). The spread includes all columns: `id`, `user_id`, `profile_revision`, `headline`, `summary`, `location_city`, `location_country`, `preferred_work_mode`, `expected_salary`, `experience_years`, `education_level`, `is_open_to_work`, `embedding_status`, `embedding_model`, `embedding_version`, `search_vector`, `source_profile_revision`, `source_embedding_revision`, `last_fact_change_at`, `embedding_generated_at`, `created_at`, `updated_at`, `deleted_at`.

Only `email` is excluded (`email: undefined`).

**Impact:** Internal system fields (`embedding_status`, `search_vector`, `embedding_model`, `deleted_at`, etc.) are stored in the immutable snapshot. While the snapshot is never exposed to other candidates, it IS returned to the owning candidate (`applications.ts:183` — `s.snapshot_data` in `CandidateApplicationReadController.detail()`). This leaks implementation metadata to the browser.

**Fix:** Explicitly select allowed snapshot fields instead of spreading `cp.*`:
```typescript
const snapshotData = {
  profile: {
    id: profile.id, headline: profile.headline, summary: profile.summary,
    location_city: profile.location_city, location_state: profile.location_state,
    location_country: profile.location_country, preferred_work_mode: profile.preferred_work_mode,
    expected_salary: profile.expected_salary, experience_years: profile.experience_years,
    education_level: profile.education_level, is_open_to_work: profile.is_open_to_work,
    skills: profile.skills, profile_revision: profile.profile_revision,
  },
  resume_document_id: dto.document_id, consent: true, screening_answers: answers,
};
```

---

### HIGH-2: No pagination on company application list — unbounded query

**File:** `applications.ts:215-228`  
**Severity:** HIGH

**Evidence:**
```typescript
async list(@Req() req: AuthRequest, @Param('companyId') companyId: string) {
  const result = await this.system.query(`
    SELECT ... FROM public.job_applications a ...
    WHERE a.is_guest = FALSE AND a.deleted_at IS NULL
      AND (u.role = 'admin' OR ...)
    ORDER BY a.applied_at DESC, a.id DESC
  `, [companyId, req.user.sub]);
  return result.rows;
}
```

No `LIMIT` clause. A company with thousands of applications returns all rows in one query.

**Impact:** Memory exhaustion, slow response, potential DoS. Same issue affects:
- `CandidateApplicationReadController.list()` (`applications.ts:163-174`)
- `SavedCandidateService.list()` (`saved-candidates.ts:45-51`)

**Fix:** Add cursor-based pagination consistent with Decision-07 J6 pattern. At minimum, add a `LIMIT 100` safety bound.

---

### MEDIUM-1: `changeStatus()` access check has TOCTOU race with status transition

**File:** `applications.ts:120-139`  
**Severity:** MEDIUM

**Evidence:**
```typescript
// Step 1: Access check (separate query)
const access = await client.query(`SELECT a.id FROM ... WHERE a.id = $1 AND ...`);
if (!access.rows[0]) throw new NotFoundException('NOT_FOUND');

// Step 2: Status transition (separate query via DB function)
await client.query(`SELECT public.change_application_status($1, $2::application_status, $3, $4, $5::jsonb)`, [...]);
```

Two separate queries inside the transaction. The access check does NOT use `FOR UPDATE` on `job_applications`. Between step 1 and step 2, another concurrent request could delete the application (soft-delete) or change its status.

**Mitigation already present:** `change_application_status()` function (`09_applications.sql:590-593`) re-acquires `FOR UPDATE` on the application row and validates the status transition. An invalid transition raises an exception. So the worst case is a caught exception, not data corruption.

**Residual risk:** Low — the DB function is the true guard. The NestJS access check is a fast-path optimization.

---

### MEDIUM-2: `feedback.ts` response returns internal `status` field

**File:** `feedback.ts:21`  
**Severity:** MEDIUM

**Evidence:**
```typescript
RETURNING id, category, subject, message, rating, status, created_at
```

The `status` column (`feedback_status` enum: `new`, `in_progress`, `resolved`, `closed`) is an internal triage field. The catalog (`PHASE-06-API-CATALOG.md:831`) says "feedback id/status and moderation result where authorized" — but the submit endpoint is for ALL authenticated users, not just admins.

**Impact:** Users see the triage status of their feedback, which is arguably useful. But if admins change status to `resolved` or `closed`, the user sees internal workflow state.

**Decision needed:** Is `status` intended for user visibility? If not, remove from RETURNING clause.

---

### MEDIUM-3: `analytics.ts` `ON CONFLICT` no-op but response says `replayed: false`

**File:** `analytics.ts:20-24`  
**Severity:** MEDIUM

**Evidence:**
```typescript
ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
RETURNING id, idempotency_key, event_name, occurred_at
...
return { ...result.rows[0], replayed: false };
```

On conflict, the no-op update returns the existing row. But `replayed` is hardcoded to `false`. A duplicate `idempotency_key` submission silently "succeeds" and returns the original event data with `replayed: false`.

**Impact:** Misleading client response. The event was NOT newly created. If the client uses `replayed` to decide whether to show a success animation or not, it will incorrectly show success on duplicate submission.

**Fix:** Check `INSERT` vs `ON CONFLICT` by comparing `result.rowCount` or using a CTE:
```sql
WITH ins AS (
  INSERT INTO ... ON CONFLICT (idempotency_key) DO NOTHING RETURNING id, ...
)
SELECT *, false AS replayed FROM ins
UNION ALL
SELECT id, ..., true AS replayed FROM analytics_events WHERE idempotency_key = $1 AND NOT EXISTS (SELECT 1 FROM ins)
```

---

### LOW-1: No test coverage for `changeStatus`, read controllers, feedback, analytics

**Files:** `applications.spec.ts`, `saved-candidates.spec.ts`, missing `feedback.spec.ts`  
**Severity:** LOW

**Evidence:**
- `applications.spec.ts`: 3 tests — submit validation, rejected job, successful submit. **No tests for:** `changeStatus()`, `CandidateApplicationReadController`, `CompanyApplicationReadController`, idempotent replay path.
- `saved-candidates.spec.ts`: 3 tests — validation, save, list. **No test for:** `remove()`.
- `analytics.spec.ts`: 2 tests — validation, successful ingest. **No test for:** idempotent replay.
- `feedback.spec.ts`: **Does not exist.** Zero test coverage for `FeedbackService`.

**Impact:** regressions in status transitions, read authorization, and feedback submission will not be caught by unit tests.

---

### LOW-2: `submit()` job `FOR UPDATE` lock scope is wide

**File:** `applications.ts:46-51`  
**Severity:** LOW

**Evidence:**
```typescript
const job = await client.query(`
  SELECT j.id, j.company_id, j.status, j.expires_at, j.deleted_at
  FROM public.jobs j
  WHERE j.id = $1
  FOR UPDATE
`, [jobId]);
```

Locks the entire `jobs` row for the transaction duration. Under high-concurrency apply traffic for a popular job, this serializes all applicants.

**Mitigation:** The lock is necessary to prevent race conditions (e.g., job deleted between eligibility check and application INSERT). The transaction is short. Acceptable for current scale.

---

### LOW-3: `cover_letter` has no length limit at application layer

**File:** `applications.ts:72`  
**Severity:** LOW

**Evidence:**
```typescript
dto.cover_letter?.trim() || null
```

No length check. The SQL column is `cover_letter TEXT` (`09_applications.sql:62`) — no CHECK constraint on length. A 10MB cover letter would be stored.

**Fix:** Add `dto.cover_letter?.trim().slice(0, 5000) || null` or validate in DTO.

---

## 3. Verification Checklist — PASS Items

| # | Check | Verdict | Evidence |
|---|---|---|---|
| 1 | **SQL table/column/function names exact** | ✅ PASS | All referenced tables/columns verified against baseline SQL (see cross-reference below) |
| 2 | **JWT identity enforcement** | ✅ PASS | All controllers check `req.user?.sub`; userId derived from JWT never from request body |
| 3 | **Cross-user data leakage (candidate reads)** | ✅ PASS | `CandidateApplicationReadController` filters by `a.user_id = $1` and `cp.user_id = $1` |
| 4 | **Cross-company data leakage (company reads)** | ✅ PASS | `CompanyApplicationReadController` filters by `j.company_id = $1` + membership check |
| 5 | **Cross-company data leakage (status change)** | ✅ PASS | `changeStatus()` filters by `j.company_id = $3` + membership check |
| 6 | **Document ownership** | ✅ PASS | `submit()` checks `uploaded_by_user_id = $2` (`applications.ts:60`) |
| 7 | **RLS/trusted SystemClient boundary** | ✅ PASS | All write operations use `SystemClient`; no `UserContextClient` used for writes |
| 8 | **Transaction atomicity (apply)** | ✅ PASS | Application + snapshot + documents + history + audit + outbox in one `system.transaction()` (`applications.ts:36-112`) |
| 9 | **Transaction atomicity (status change)** | ✅ PASS | Access check + `change_application_status()` in one `system.transaction()` (`applications.ts:120-139`) |
| 10 | **Duplicate/idempotency (apply)** | ✅ PASS | DB unique `(job_id, candidate_id)` catches duplicates; `23505` error returns existing application with `replayed: true` (`applications.ts:74-87`) |
| 11 | **Duplicate/idempotency (analytics)** | ✅ PASS | `idempotency_key UNIQUE` + `ON CONFLICT DO UPDATE` (`analytics.ts:20`) |
| 12 | **Snapshot immutability** | ✅ PASS | `application_snapshots_immutable` trigger blocks UPDATE/DELETE (`09_applications.sql:1019-1021`) |
| 13 | **Status transition safety** | ✅ PASS | `change_application_status()` function validates allowed transitions (`09_applications.sql:603-615`); NestJS catches invalid transition error (`applications.ts:134`) |
| 14 | **Rejected reason enforcement** | ✅ PASS | `applications.ts:119`: `if (dto.status === 'rejected' && !dto.reason?.trim())` |
| 15 | **PII/raw resume in response** | ✅ PASS | Submit response: `{ application_id, job_id, status, applied_at, snapshot_summary }` — no raw resume content |
| 16 | **Route/catalog consistency** | ✅ PASS | `POST /api/v1/jobs/:jobId/apply` matches catalog API-APPLICATION-001; `PATCH /api/v1/companies/:companyId/applications/:applicationId/status` matches API-APPLICATION-002 |
| 17 | **Saved candidates: recruiter-only** | ✅ PASS | `assertRecruiter()` checks `role IN ('employer','hr','admin')` + company membership (`saved-candidates.ts:13-24`) |
| 18 | **Saved candidates: open-to-work check** | ✅ PASS | `save()` checks `is_open_to_work = TRUE` (`saved-candidates.ts:30`) |
| 19 | **Saved candidates: upsert safety** | ✅ PASS | `ON CONFLICT (recruiter_user_id, candidate_id) DO UPDATE` (`saved-candidates.ts:35`) |
| 20 | **Feedback: active user check** | ✅ PASS | `WHERE EXISTS (SELECT 1 FROM public.users u WHERE u.id = $1 AND u.status = 'active' ...)` (`feedback.ts:20`) |
| 21 | **Feedback: content validation** | ✅ PASS | Message required + trimmed; category validated against enum; rating 1-5 (`feedback.ts:14`) |
| 22 | **Feedback: immutability** | ✅ PASS | `enforce_platform_feedback_lifecycle()` trigger blocks content/status changes (`18_feedback.sql:81-114`) |
| 23 | **Analytics: user active check** | ✅ PASS | `WHERE EXISTS (SELECT 1 FROM public.users WHERE id = $2 AND status = 'active' ...)` (`analytics.ts:19`) |
| 24 | **Analytics: event_name format** | ✅ PASS | Regex `/^[a-z0-9]+([._-][a-z0-9]+)*$/` matches DB CHECK (`13_analytics.sql:74-77`) |
| 25 | **Analytics: immutable** | ✅ PASS | `analytics_events_immutable` trigger blocks UPDATE (`13_analytics.sql:379-382`) |
| 26 | **Outbox event envelope** | ✅ PASS | Full envelope with `schema_version, event_id, aggregate_type, aggregate_id, event_type, payload, occurred_at` matches contract (`applications.ts:106-110`) |
| 27 | **Aggregate ID semantics** | ✅ PASS | `aggregate_type = 'job_application'`, `aggregate_id = application UUID` matches `AGGREGATE-ID-SEMANTICS.md:24` |
| 28 | **Module wiring** | ✅ PASS | All 4 services + 7 controllers registered in `app.module.ts:19-22,25` |
| 29 | **`application_documents` origin guard** | ✅ PASS | `validate_application_document_origin()` trigger enforces registered document ownership (`09_applications.sql:532-571`) |
| 30 | **`enforce_application_identity` trigger** | ✅ PASS | Blocks changes to `job_id, candidate_id, user_id, is_guest` after INSERT (`09_applications.sql:479-498`) |
| 31 | **`enforce_initial_lifecycle_state` trigger** | ✅ PASS | Forces `status = 'applied'` on INSERT (`09_applications.sql:455-477`) |
| 32 | **`application_status_history` immutable** | ✅ PASS | `reject_immutable_row_change()` trigger (`09_applications.sql:1022-1024`) |
| 33 | **`application_documents` immutable** | ✅ PASS | `reject_immutable_row_change()` trigger (`09_applications.sql:1028-1030`) |
| 34 | **`audit_logs` immutable** | ✅ PASS | `audit_logs_immutable` trigger (`13_analytics.sql:384-387`) |

---

## 4. SQL Cross-Reference

| Code Reference | SQL Source | Verified |
|---|---|---|
| `job_applications` columns: `job_id, candidate_id, user_id, is_guest, cover_letter, answers_to_screening_questions` | `09_applications.sql:51-63` | ✅ |
| `job_applications.status` DEFAULT `'applied'` | `09_applications.sql:61` | ✅ |
| `application_profile_snapshots` columns | `09_applications.sql:138-160` | ✅ |
| `application_documents` columns | `09_applications.sql:130-136` | ✅ |
| `application_status_history` columns | `09_applications.sql:113-128` | ✅ |
| `audit_logs` columns | `13_analytics.sql:173-230` | ✅ |
| `outbox_events` columns | `15_infrastructure.sql:23-80` | ✅ |
| `change_application_status()` function | `09_applications.sql:573-652` | ✅ |
| `uploaded_documents.uploaded_by_user_id` | `06_documents.sql:74` | ✅ |
| `saved_candidates` columns | `09_applications.sql:228-238` | ✅ |
| `saved_candidates` unique constraint | `09_applications.sql:236-237` | ✅ |
| `platform_feedback` columns | `18_feedback.sql:16-76` | ✅ |
| `platform_feedback_lifecycle_guard` trigger | `18_feedback.sql:116-119` | ✅ |
| `analytics_events` columns | `13_analytics.sql:25-95` | ✅ |
| `analytics_events_immutable` trigger | `13_analytics.sql:379-382` | ✅ |
| `feedback_category` enum values | `02_enums.sql:278-286` | ✅ |
| `feedback_status` enum values | `02_enums.sql:289-294` | ✅ |
| `application_status` enum values | `02_enums.sql:262-276` | ✅ |
| `application_snapshot_type` enum values | `02_enums.sql:564-566` | ✅ |
| `snapshot_generator` enum values | `02_enums.sql:568-570` | ✅ |
| `document_role` enum values | `02_enums.sql:572-574` | ✅ |
| RLS: `job_applications` SELECT policy | `17_rls.sql:203` | ✅ |
| RLS: `application_status_history` SELECT policy | `17_rls.sql:204` | ✅ |
| RLS: `application_documents` SELECT policy | `17_rls.sql:205` | ✅ |
| RLS: `application_profile_snapshots` SELECT policy | `17_rls.sql:206` | ✅ |
| RLS: `saved_candidates` SELECT policy | `17_rls.sql:211-212` | ✅ |
| RLS: `platform_feedback` no user policy (service-only) | `18_feedback.sql:139-147` | ✅ |
| RLS: `analytics_events` enabled | `17_rls.sql:137` | ✅ |

---

## 5. Test Coverage Summary

| Module | Tests | Coverage |
|---|---|---|
| `applications.spec.ts` | 3 | submit validation (2), successful submit (1) |
| `saved-candidates.spec.ts` | 3 | validation (1), save (1), list (1) |
| `analytics.spec.ts` | 2 | validation (1), successful ingest (1) |
| `feedback.spec.ts` | **0** | **No tests** |
| **Total** | **8** | Missing: changeStatus, read controllers, remove, replay, feedback |

---

## 6. No-Code-Change Confirmation

Zero source code, SQL migrations, or configuration files were modified during this review.
