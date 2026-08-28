# Post-Fix Cross-Verification Audit — Application API

**Auditor:** opencode  
**Date:** 2026-08-28  
**Scope:** Security fixes applied to `applications.ts`, `analytics.ts`, `saved-candidates.ts`, `feedback.ts`  
**Previous audit:** `review-latest-api/opencode-review.md` (2 HIGH, 3 MEDIUM, 3 LOW)  
**Build status:** 27 suites, 82 tests — ALL PASSING ✅

---

## 1. Executive Summary

### **Audit Verdict:** **2 HIGH FIXED, 1 MEDIUM PARTIALLY FIXED, 2 MEDIUM UNCHANGED, 1 LOW UNCHANGED**

Both HIGH findings are confirmed FIXED. Snapshot builder is now explicit-safe. Pagination is added. Two MEDIUM findings remain unchanged (feedback status exposure, analytics replayed flag). One LOW (saved-candidate list unbounded) persists.

---

## 2. Previous Findings — Cross-Verification

### HIGH-1: Snapshot `snapshot_data` leaks internal profile metadata → **FIXED** ✅

**Previous** (`applications.ts` before fix):
```typescript
const snapshotData = { profile: { ...profile, email: undefined }, ... };
```
Full `cp.*` spread included `embedding_status`, `search_vector`, `embedding_model`, `deleted_at`, etc.

**Current** (`applications.ts:92`):
```typescript
const snapshotData = {
  profile: {
    id: profile.id,
    headline: profile.headline ?? null,
    summary: profile.summary ?? null,
    location_city: profile.location_city ?? null,
    location_state: profile.location_state ?? null,
    location_country: profile.location_country ?? null,
    preferred_work_mode: profile.preferred_work_mode ?? null,
    experience_years: profile.experience_years ?? null,
    education_level: profile.education_level ?? null,
    profile_revision: profile.profile_revision ?? null
  },
  resume_document_id: dto.document_id,
  consent: true,
  screening_answers: answers
};
```

**Verification:** Only 10 explicit safe fields. No `embedding_*`, `search_vector`, `deleted_at`, `source_profile_revision`, `source_embedding_revision`, `last_fact_change_at`, `embedding_generated_at`, `created_at`, `updated_at`. ✅ **CONFIRMED FIXED.**

---

### HIGH-2: No pagination on application list → **FIXED** ✅

**Previous:** No `LIMIT` clause.

**Current:**
- `CandidateApplicationReadController.list()` (`applications.ts:172`): `ORDER BY a.applied_at DESC, a.id DESC LIMIT 100` ✅
- `CompanyApplicationReadController.list()` (`applications.ts:226`): `ORDER BY a.applied_at DESC, a.id DESC LIMIT 100` ✅

**Verification:** Both list endpoints now bounded to 100 rows. ✅ **CONFIRMED FIXED.**

---

### MEDIUM-1: `changeStatus()` TOCTOU race → **UNCHANGED (acceptable)**

**Current** (`applications.ts:120-139`): Still two separate queries — access check then `change_application_status()`. DB function re-acquires `FOR UPDATE` and validates transition. Mitigated by DB-level guard. No change needed.

---

### MEDIUM-2: Feedback response returns internal `status` → **UNCHANGED**

**Current** (`feedback.ts:21`):
```sql
RETURNING id, category, subject, message, rating, status, created_at
```

`status` (enum: `new`, `in_progress`, `resolved`, `closed`) still returned to submitting user. Not a security issue (user sees their own feedback state), but internal triage state is exposed. **Decision needed** from product owner.

---

### MEDIUM-3: Analytics `replayed: false` hardcoded → **UNCHANGED**

**Current** (`analytics.ts:26`):
```typescript
return { ...result.rows[0], replayed: false };
```

On `ON CONFLICT` no-op, the existing row is returned with `replayed: false`. Misleading to client. **Not a security issue** — data integrity is correct (idempotency key prevents double-counting). Cosmetic fix needed.

---

### LOW-1: No feedback tests → **UNCHANGED**

`feedback.spec.ts` does not exist. Zero unit test coverage for `FeedbackService`.

---

### LOW-2: `submit()` job FOR UPDATE lock scope → **UNCHANGED (acceptable)**

Lock is necessary and transaction is short.

---

### LOW-3: `cover_letter` no length limit → **UNCHANGED**

Still no application-layer length check. SQL `TEXT` column has no CHECK constraint.

---

## 3. New Verification Points

### Point 1: Application responses mein raw snapshot_data leak nahi ho raha → **PASS** ✅

**Evidence:**
- `submit()` response (`applications.ts:111`): `{ application_id, job_id, status, applied_at, snapshot_summary: { snapshot_id, profile_revision } }` — NO `snapshot_data`
- `CandidateApplicationReadController.list()` (`applications.ts:163-174`): Returns `application_id, job_id, status, applied_at, job_title, company_id, snapshot_id, source_profile_revision` — NO `snapshot_data`
- `CandidateApplicationReadController.detail()` (`applications.ts:180-191`): Returns `application_id, job_id, status, applied_at, job_title, company_id, snapshot_id, source_profile_revision, snapshot_version, schema_version, generated_by, generated_at` — NO `snapshot_data`
- `CompanyApplicationReadController` (`applications.ts:215-247`): Same metadata fields, NO `snapshot_data`

**Verdict:** `snapshot_data` is stored but NEVER returned in any API response. ✅

---

### Point 2: Snapshot builder explicit safe fields → **PASS** ✅

**Evidence** (`applications.ts:92`):
```
id, headline, summary, location_city, location_state, location_country,
preferred_work_mode, experience_years, education_level, profile_revision
```

10 fields only. All nullable with `?? null`. No internal/system fields. No `email`. ✅

---

### Point 3: Candidate/company application list bounded/paginated → **PASS** ✅

**Evidence:**
- Candidate list: `LIMIT 100` (`applications.ts:172`)
- Company list: `LIMIT 100` (`applications.ts:226`)
- Detail and history endpoints: single-record queries by `application_id` — inherently bounded ✅

---

### Point 4: Saved-candidate list unbounded nahi hai → **FAIL** ⚠️

**Evidence** (`saved-candidates.ts:45-50`):
```sql
SELECT sc.id, sc.candidate_id, sc.private_note, sc.created_at, sc.updated_at
FROM public.saved_candidates sc
WHERE sc.company_id = $1 AND sc.recruiter_user_id = $2
ORDER BY sc.created_at DESC
```

No `LIMIT` clause. An HR user with thousands of saved candidates retrieves all rows.

**Severity:** LOW (updated from previous audit — was not tracked as a separate finding). Saved-candidate lists are typically small (HR bookmarks), but unbounded is unbounded.

---

### Point 5: Analytics entity_type/entity_id pair validation exact hai → **PASS** ✅

**Evidence** (`analytics.ts:17`):
```typescript
Boolean(entityType) !== Boolean(entityId) || (entityId !== null && !UUID.test(entityId))
```

- `Boolean(entityType) !== Boolean(entityId)` ensures: if one is present, both must be present. XOR rejected.
- `(entityId !== null && !UUID.test(entityId))` ensures: if `entity_id` is provided, it must be valid UUID format.

Matches DB constraint (`13_analytics.sql:84-87`):
```sql
(entity_type IS NULL AND entity_id IS NULL)
OR (NULLIF(BTRIM(entity_type), '') IS NOT NULL AND entity_id IS NOT NULL)
```

The NestJS validation is stricter (adds UUID format check) — correct defense-in-depth. ✅

---

### Point 6: Analytics UUID validation correct hai → **PASS** ✅

**Evidence** (`analytics.ts:9`):
```typescript
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
```

- 8-4-4-4-12 hex format ✅
- Version nibble `[1-5]` (UUID v1-v5) ✅
- Variant bits `[89ab]` (RFC 4122) ✅
- Same regex used in `saved-candidates.ts:7` and `applications.ts:9-11` ✅

---

### Point 7: JWT ownership and cross-company isolation → **PASS** ✅

| Endpoint | Ownership Check | Evidence |
|---|---|---|
| `submit()` | userId → `candidate_profiles.user_id` + `uploaded_documents.uploaded_by_user_id` | `applications.ts:37-42, 57-62` |
| `changeStatus()` | companyId + userId → company membership + role check | `applications.ts:121-129` |
| `CandidateApplicationReadController` | `a.user_id = $1` + `cp.user_id = $1` | `applications.ts:168, 171, 185, 188, 201` |
| `CompanyApplicationReadController` | `j.company_id = $1` + membership check | `applications.ts:220-225, 238-243` |
| `SavedCandidateService` | `assertRecruiter()` — role + membership | `saved-candidates.ts:13-24` |
| `FeedbackService` | userId → `users.id` active check | `feedback.ts:20` |
| `AnalyticsService` | userId → `users.id` active check | `analytics.ts:21` |

All controllers check `req.user?.sub` before calling service methods. ✅

---

### Point 8: Trusted SystemClient and transaction boundaries → **PASS** ✅

| Operation | Client | Transaction |
|---|---|---|
| `submit()` | `SystemClient` | `system.transaction()` — application + snapshot + documents + history + audit + outbox atomic |
| `changeStatus()` | `SystemClient` | `system.transaction()` — access check + `change_application_status()` atomic |
| `CandidateApplicationReadController` | `SystemClient` | Read-only single query — no transaction needed |
| `CompanyApplicationReadController` | `SystemClient` | Read-only single query — no transaction needed |
| `SavedCandidateService` | `SystemClient` | `system.transaction()` for save/list/remove |
| `FeedbackService` | `SystemClient` | Single INSERT with WHERE EXISTS — atomic |
| `AnalyticsService` | `SystemClient` | Single INSERT with ON CONFLICT — atomic |

No `UserContextClient` used for writes. ✅

---

### Point 9: SQL table, column, enum, function names exact → **PASS** ✅

| Code Reference | SQL Source | Verified |
|---|---|---|
| `job_applications` columns | `09_applications.sql:50-107` | ✅ |
| `application_profile_snapshots` columns | `09_applications.sql:138-160` | ✅ |
| `application_documents` columns | `09_applications.sql:130-136` | ✅ |
| `application_status_history` columns | `09_applications.sql:113-128` | ✅ |
| `audit_logs` columns | `13_analytics.sql:173-230` | ✅ |
| `outbox_events` columns | `15_infrastructure.sql:23-80` | ✅ |
| `change_application_status()` function signature | `09_applications.sql:573-652` | ✅ |
| `uploaded_documents.uploaded_by_user_id` | `06_documents.sql:74` | ✅ |
| `saved_candidates` columns | `09_applications.sql:228-238` | ✅ |
| `platform_feedback` columns | `18_feedback.sql:16-76` | ✅ |
| `analytics_events` columns | `13_analytics.sql:25-95` | ✅ |
| `feedback_category` enum | `02_enums.sql:278-286` | ✅ |
| `feedback_status` enum | `02_enums.sql:289-294` | ✅ |
| `application_status` enum | `02_enums.sql:262-276` | ✅ |
| `application_snapshot_type` enum | `02_enums.sql:564-566` | ✅ |
| `snapshot_generator` enum | `02_enums.sql:568-570` | ✅ |
| `document_role` enum | `02_enums.sql:572-574` | ✅ |

---

### Point 10: Routes aur API catalog synchronized → **PASS** ✅

| Route | Catalog Entry | Status |
|---|---|---|
| `POST /api/v1/jobs/:jobId/apply` | API-APPLICATION-001 | ✅ |
| `GET /api/v1/me/applications` | API-APPLICATION-001 (candidate reads) | ✅ |
| `GET /api/v1/me/applications/:applicationId` | API-APPLICATION-001 | ✅ |
| `GET /api/v1/me/applications/:applicationId/history` | API-APPLICATION-001 | ✅ |
| `GET /api/v1/companies/:companyId/applications` | API-APPLICATION-002 (company reads) | ✅ |
| `GET /api/v1/companies/:companyId/applications/:applicationId` | API-APPLICATION-002 | ✅ |
| `PATCH /api/v1/companies/:companyId/applications/:applicationId/status` | API-APPLICATION-002 | ✅ |
| `POST /api/v1/companies/:companyId/saved-candidates/:candidateId` | API-SAVED-CANDIDATE-001 | ✅ |
| `GET /api/v1/companies/:companyId/saved-candidates` | API-SAVED-CANDIDATE-001 | ✅ |
| `DELETE /api/v1/companies/:companyId/saved-candidates/:candidateId` | API-SAVED-CANDIDATE-001 | ✅ |
| `POST /api/v1/feedback` | API-FEEDBACK-001 | ✅ |
| `POST /api/v1/analytics/events` | API-ANALYTICS-001 | ✅ |

---

### Point 11: PII, resume content, internal metadata exposure → **PASS** ✅

| Response | Content | Verdict |
|---|---|---|
| `submit()` | `{ application_id, job_id, status, applied_at, snapshot_summary: { snapshot_id, profile_revision } }` | ✅ No PII/resume |
| Candidate list | `{ application_id, job_id, status, applied_at, job_title, company_id, snapshot_id, source_profile_revision }` | ✅ No PII/resume |
| Candidate detail | Same + `snapshot_version, schema_version, generated_by, generated_at` | ✅ No snapshot_data, no resume |
| Candidate history | `{ id, from_status, to_status, change_reason, created_at }` | ✅ Status history only |
| Company list/detail | Same as candidate + `candidate_id` (needed for recruiter workflow) | ✅ No snapshot_data |
| Status change | `{ id, job_id, candidate_id, status, applied_at, updated_at }` | ✅ Status only |
| Saved candidate | `{ id, recruiter_user_id, company_id, candidate_id, private_note, created_at, updated_at }` | ✅ Bookmark data only |
| Feedback | `{ id, category, subject, message, rating, status, created_at }` | ✅ User's own feedback |
| Analytics | `{ id, idempotency_key, event_name, occurred_at, replayed }` | ✅ Confirmation only |

---

### Point 12: Build aur Jest suite independently → **PASS** ✅

```
Test Suites: 27 passed, 27 total
Tests:       82 passed, 82 total
Time:        32.614 s
```

---

## 4. Summary

| Previous Finding | Severity | Current Status |
|---|---|---|
| HIGH-1: Snapshot data leak | HIGH | **FIXED** ✅ — explicit safe fields |
| HIGH-2: No pagination | HIGH | **FIXED** ✅ — LIMIT 100 on both list endpoints |
| MEDIUM-1: TOCTOU race | MEDIUM | **UNCHANGED** — mitigated by DB function |
| MEDIUM-2: Feedback status | MEDIUM | **UNCHANGED** — decision needed |
| MEDIUM-3: Analytics replayed | MEDIUM | **UNCHANGED** — cosmetic |
| LOW-1: No feedback tests | LOW | **UNCHANGED** |
| LOW-2: FOR UPDATE scope | LOW | **UNCHANGED** — acceptable |
| LOW-3: cover_letter length | LOW | **UNCHANGED** |

| New Finding | Severity | Status |
|---|---|---|
| Saved-candidate list unbounded | LOW | **NEW** — no LIMIT clause |

---

## 5. No-Code-Change Confirmation

Zero source code, SQL migrations, or configuration files were modified during this review.
