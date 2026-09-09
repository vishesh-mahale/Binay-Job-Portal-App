# Batch 6 — Candidate Page Plan Review

**Reviewer:** opencode
**Date:** 2026-09-09
**Plan:** Batch6_Candidate-page.md

---

## 1. Verdict

**BLOCKED**

The plan is well-scoped and correctly avoids schema changes, but it references at least 4 API endpoints that do not exist in the current codebase (`POST /api/v1/jobs/:jobId/apply`, `GET /api/v1/me/applications`, `GET /api/v1/me/applications/:applicationId`, `GET /api/v1/me/applications/:applicationId/history`). Phase 09-C (candidate/resume/AI command) is at 0/7 completion per the tracker. Phases C4 and C5 cannot be implemented until these endpoints exist.

---

## 2. What Is Correct

1. **Scope discipline** — No new DB migrations, enum changes, triggers, or contract redesigns. All data already exists in `08_candidates.sql`, `06_documents.sql`, `07_resume_processing.sql`, and `09_applications.sql`.

2. **Existing API surface for C1-C3 is real** — `GET /api/v1/candidates/me`, `PATCH /api/v1/candidates/me`, `DELETE /api/v1/candidates/me/facts/:factType/:factId`, `POST /api/v1/resumes/upload`, `GET /api/v1/resumes/:id/status`, `GET /api/v1/resumes/:id/parsed-data`, `POST /api/v1/resumes/:id/confirm` all exist in `candidate.ts` and `resume.ts` and are backed by verified DB queries.

3. **Optimistic revision guard** — `expected_profile_revision` is enforced in `updateOwnProfile` (candidate.ts:148), `archiveFact` (candidate.ts:179), and `confirm` (resume.ts:108) with `STALE_REVISION` / `ConflictException`. This is correct and the plan correctly references it.

4. **Resume status mapping** — The `getResumeStatus` method (candidate.ts:78-88) already maps raw DB states to the exact stage strings the plan lists (`UPLOADED`, `SECURITY_SCANNING`, `SECURITY_REJECTED`, `SECURITY_RETRYABLE_FAILURE`, `PARSING_QUEUED`, `PARSING_IN_PROGRESS`, `REVIEW_READY_PARTIAL`, `REVIEW_READY`, `PARSING_FAILED`).

5. **Parsed data allowlist** — `getParsedData` (candidate.ts:113-114) correctly filters `normalized_output` to only `contact_info`, `professional_title`, `summary`, `skills`, `experiences`, `educations`, `certifications`, `languages`. No internal parsing internals leak.

6. **Security scan integrity** — Upload flow (resume.ts:52-85) stores to Supabase storage, inserts `uploaded_documents`, emits `security.scan.requested` outbox event, and cleans up storage on DB failure. No storage path is returned to the client beyond `document_id`.

7. **Guest flow separation** — `guest.ts` uses a completely separate controller (`/api/v1/guest-sessions`) with token-based auth, not `AuthGuard`. Plan correctly keeps this out of scope.

8. **Profile facts are canonical** — `candidate_skills`, `candidate_experiences`, `candidate_educations`, `candidate_certifications`, `candidate_projects`, `candidate_languages`, `candidate_links`, `candidate_awards` are all soft-deleted via `deleted_at` with hard-delete rejection triggers. Correct.

9. **Confirm fact insertion** — `resume.ts:insertConfirmedFacts` (lines 23-49) properly inserts skills, experiences, educations, certifications, projects, and languages with `candidate_confirmed` source and `candidate_confirmed_at` timestamp.

10. **Public endpoint authorization** — All candidate/resume endpoints use `AuthGuard` and filter by `uploaded_by_user_id = request.user?.sub` or `user_id`. No cross-user data access possible.

---

## 3. Critical Issues

### Issue 1: Application Endpoints Do Not Exist

- **File:** `04-nestjs-api/04-nestjs-api-app/src/modules/applications/applications.ts` — **FILE DOES NOT EXIST**
- **Problem:** The plan references 4 application endpoints:
  - `POST /api/v1/jobs/:jobId/apply` (Phase C4)
  - `GET /api/v1/me/applications` (Phase C5)
  - `GET /api/v1/me/applications/:applicationId` (Phase C5)
  - `GET /api/v1/me/applications/:applicationId/history` (Phase C5)
  
  None of these endpoints exist in the current codebase. The `IMPLEMENTATION-TRACKER-HINGLISH.md` shows Phase 09-C (candidate/resume/AI command) at **0/7 complete**.
- **Why it matters:** Phases C4 (Apply) and C5 (Application Tracking) are entirely blocked. The plan presents them as implementable in the same batch.
- **Recommended correction:** Either (a) implement the applications module as a prerequisite within this batch before C4/C5, or (b) defer C4 and C5 to a separate batch and scope this batch to C1-C3 only.
- **Priority:** P0

### Issue 2: No Resume List Endpoint

- **File:** `candidate.ts` — `ResumeStatusController` (lines 211-224)
- **Problem:** `getResumeStatus` and `getParsedData` both require a `documentId` parameter. There is no `GET /api/v1/resumes` endpoint to list all resumes for a candidate. Phase C3 step 6 says "Clearly identify the active resume and preserve older resume revisions" — but the UI has no way to fetch the list.
- **Why it matters:** The Resume Center cannot render a list of uploaded resumes without a list endpoint. The candidate would need to already know their document IDs.
- **Recommended correction:** Add a `GET /api/v1/resumes` endpoint that queries `candidate_profile_documents` joined with `uploaded_documents` for the current user, returning document IDs, version numbers, `is_current` status, upload dates, and security/processing status.
- **Priority:** P0

### Issue 3: No Job Screening Questions Endpoint for Candidates

- **File:** `guest.ts` — no equivalent for authenticated candidates
- **Problem:** Phase C4 step 2 says "Load... job screening questions" before application. The `screening_questions` field exists on the `jobs` table, but no authenticated candidate-facing endpoint returns them. The public job search query (`job-search-query.ts`) does not expose screening questions to prevent leakage.
- **Why it matters:** The apply flow cannot render screening questions without an endpoint that returns them specifically for the applying candidate (after authentication, before submission).
- **Recommended correction:** Add a `GET /api/v1/jobs/:jobId/screening-questions` endpoint that returns only the `screening_questions` array for published, non-expired jobs. This is separate from the full job detail to avoid leaking recruiter-only fields.
- **Priority:** P1

### Issue 4: `confirm` Body Parsing Ambiguity

- **File:** `resume.ts:91`
- **Problem:** Line 91 reads `const profileInput = body.profile && typeof body.profile === 'object' ? body.profile : body;`. If `body.profile` is missing or not an object, the entire `body` (including `expected_profile_revision`, `facts`, and any other fields) is treated as profile input. The `ALLOWED_PROFILE_FIELDS` filter then strips unknown fields, but this is a fragile fallback.
- **Why it matters:** A malformed request where `profile` is accidentally a string or null would silently fall through to using the root body as profile fields. This could cause unexpected behavior.
- **Recommended correction:** Require `body.profile` to be a present object. If missing or invalid, throw `VALIDATION_ERROR` instead of falling through.
- **Priority:** P2

### Issue 5: Candidate Profile PATCH Allows All Fields Without Type Validation

- **File:** `candidate.ts:7-27` (`UpdateCandidateProfileDto`)
- **Problem:** All profile fields use `@IsOptional() @IsString()` or `@IsBoolean()` / `@IsNumber()` but the DTO does not enforce that at least one field is provided beyond the revision check at line 143 (`if (fields.length === 0)`). The bigger issue is that `available_from` is typed as `@IsString()` but the DB column is `DATE` — the API accepts any string, not validated date format.
- **Why it matters:** Invalid date strings like `"not-a-date"` would be stored in the `available_from` DATE column, causing a DB error or silent truncation.
- **Recommended correction:** Add `@IsDateString()` or a custom validator for `available_from`. Similarly validate `notice_period_days` as non-negative integer.
- **Priority:** P2

### Issue 6: No Polling Strategy or Timeout for Resume Status

- **File:** `Batch6_Candidate-page.md` — Phase C3 step 3
- **Problem:** The plan says "Poll `GET /api/v1/resumes/:id/status`" but does not specify polling interval, maximum attempts, timeout, or what happens if parsing is stuck indefinitely (e.g., FastAPI worker is down).
- **Why it matters:** Without a timeout, the UI could poll forever. Without backoff, it could hammer the server. If the worker crashes mid-parse, the status stays at `PARSING_IN_PROGRESS` forever.
- **Recommended correction:** Specify: (a) initial poll interval 2s, exponential backoff to 10s max, (b) maximum 5 minutes total polling, (c) show "Processing is taking longer than expected" message after timeout, (d) allow manual retry for `PARSING_IN_PROGRESS` stuck state.
- **Priority:** P1

### Issue 7: `remote_experience` Field Not in Profile Editor Plan

- **File:** `Batch6_Candidate-page.md` — Phase C2 step 1
- **Problem:** The plan lists profile fields to render: "title, summary, location, preferred work mode, relocation/travel, remote experience, notice period, expected salary, work authorization, visa sponsorship, open-to-work and availability." However, `remote_experience` is a boolean — the plan says "remote experience" which could be confused with a text field. More importantly, the plan does not mention `salary_currency` which exists in the DB (`candidate_profiles.salary_currency`) and the `UpdateCandidateProfileDto` does not include it.
- **Why it matters:** `salary_currency` defaults to `INR` in the DB but candidates in other countries cannot change it through the profile editor.
- **Recommended correction:** Add `salary_currency` to the `UpdateCandidateProfileDto` and the profile editor form. Also add `date_of_birth`, `gender`, `nationality` if they should be editable (or explicitly exclude them with rationale).
- **Priority:** P1

### Issue 8: No Resume Upload List for Active Resume Identification

- **File:** `resume.ts` — upload method (lines 52-85)
- **Problem:** The upload method sets `is_current` on the first resume or when `use_as_active_profile_resume` is true (line 138). But there's no way for the candidate to see which resume is currently active without the missing list endpoint (Issue 2). The plan step 6 says "Clearly identify the active resume" — this requires both a list endpoint and the `is_current` flag in the response.
- **Why it matters:** Candidates cannot manage multiple resume versions without knowing which is active.
- **Recommended correction:** Combine with Issue 2 — the list endpoint must return `is_current`, `version_number`, and link to status for each document.
- **Priority:** P0 (same as Issue 2)

---

## 4. Missing Items

### Missing API Client Methods
- `getResumes()` — list all candidate resumes
- `getApplication(applicationId)` — single application detail
- `getApplicationHistory(applicationId)` — status timeline
- `getApplications()` — list all applications
- `applyToJob(jobId, payload)` — submit application
- `getScreeningQuestions(jobId)` — fetch screening questions for apply flow

### Missing Types/Interfaces
- `CandidateResume` — type for resume list items (documentId, versionNumber, isCurrent, stage, uploadedAt)
- `Application` — type for application list items
- `ApplicationDetail` — type with snapshot and timeline
- `ScreeningQuestion` — type for job screening questions

### Missing UI States
- Resume upload progress percentage (currently plan says "show upload progress" but no percentage mechanism exists — the API returns `stage: 'UPLOADED'` immediately, no progress streaming)
- Application submission loading state
- Application already-applied detection (replay handling)
- Resume stuck-in-progress state (no timeout handling)

### Missing Security Checks
- Resume upload rate limiting (no limit on how many resumes a candidate can upload)
- Application submission rate limiting
- Maximum resume file count per candidate (DB has no limit constraint)

### Missing Error Handling
- `POST /api/v1/resumes/:id/confirm` when `SCAN_PENDING` — plan says handle but doesn't specify UX
- `POST /api/v1/resumes/:id/confirm` when `INFECTED_FILE` — same
- `POST /api/v1/resumes/:id/confirm` when `SCAN_FAILED` — same
- Application to closed/expired job — plan step 6 mentions but no endpoint exists to check job status from candidate side
- Application consent validation error — plan mentions "consent errors" but no schema for consent

### Missing Test Cases
- Concurrent resume uploads (two tabs uploading simultaneously)
- Concurrent profile edits during resume confirmation
- Resume confirmation with stale revision
- Application submission with already-confirmed resume
- Application replay idempotency test
- Guest claim flow integration test (if in scope)

### Missing Manual E2E Gates
- Resume upload → polling → review → confirm → verify profile facts updated
- Multiple resume management (upload v2, verify v1 is no longer active)
- Profile edit → resume confirm → verify revision conflict handling
- Application submission → verify application appears in list → verify snapshot immutable

---

## 5. Scope Decision

| Item | Classification | Rationale |
|------|---------------|-----------|
| C1 — Dashboard Shell | **Must implement in Batch 6** | Foundation for all other phases. No blockers. |
| C2 — Profile Editor | **Must implement in Batch 6** | All endpoints exist. No blockers. |
| C3 — Resume Center | **Must implement in Batch 6** (with addition of list endpoint) | Core endpoints exist. Missing list endpoint is a small addition to `candidate.ts`. |
| C4 — Apply Flow | **Should remain in later batch** | `POST /api/v1/jobs/:jobId/apply` does not exist. Creating it requires `09_applications.sql` contract, application snapshot logic, status history, and screening question handling. This is substantial work that should not be rushed. |
| C5 — Application Tracking | **Should remain in later batch** | Depends on C4. All 3 endpoints (`GET /api/v1/me/applications`, `/:applicationId`, `/:applicationId/history`) do not exist. |
| Guest upload/apply/claim | **Must not be added** | Plan correctly excludes this. `guest.ts` is a separate flow with separate auth. Keep isolated. |
| Recruiter application UI | **Must not be added** | Out of scope for candidate page batch. |
| AI candidate matching | **Must not be added** | Already handled by FastAPI worker projection pipeline. Not a frontend concern. |
| Notifications | **Must not be added** | Phase 09-F. Not a candidate page blocker. |
| Candidate embeddings | **Must not be added** | Already handled by `projection_service.py`. Not a frontend concern. |
| Database changes | **Must not be added** | Plan correctly excludes this. All required tables exist. |
| `salary_currency` in profile editor | **Should be added to C2** | Missing from DTO but exists in DB. Small addition. |
| Resume list endpoint | **Should be added to C3** | Missing but required for Resume Center. Small addition to `candidate.ts`. |
| Screening questions endpoint | **Should be added before C4** | Required for apply flow but can be deferred with C4. |

---

## 6. Final Recommended Execution Order

### Scope this batch to C1 + C2 + C3 only

```
C1 (Dashboard Shell)
  ↓
C2 (Profile Editor) + add salary_currency to DTO
  ↓
C3 (Resume Center) + add GET /api/v1/resumes list endpoint
  ↓
Full verification of C1-C3
```

### Defer to next batch (C4+C5 prerequisites)

```
Next batch: Application Module
  1. Create applications.ts with POST /api/v1/jobs/:jobId/apply
  2. Create GET /api/v1/me/applications, /:applicationId, /:applicationId/history
  3. Add GET /api/v1/jobs/:jobId/screening-questions
  4. Then implement C4 (Apply) and C5 (Application Tracking)
```

### Rationale

The plan is architecturally sound but has a scope problem: it bundles 5 phases where 2 of them (C4, C5) depend on endpoints that don't exist and require non-trivial backend work (application snapshots, status history, consent handling, screening questions). Rushing these into the same batch as the profile editor and resume center increases risk of incomplete implementations.

C1-C3 are self-contained, have all required backend support, and deliver immediate value (candidate can edit profile and manage resumes). Splitting here gives a clean, testable deliverable.
