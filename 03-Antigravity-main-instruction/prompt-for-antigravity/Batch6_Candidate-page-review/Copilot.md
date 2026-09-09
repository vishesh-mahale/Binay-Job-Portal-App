# Candidate Page Batch 6 — Independent Read-Only Architecture Review

Reviewed against the current repository implementation, baseline SQL contracts, and the
Batch 6 plan. No source, schema, contract, documentation, or test implementation files
were changed.

## 1. Verdict

**BLOCKED**

The plan is directionally correct, but C3 and C4 cannot be implemented safely against the
current worker/API behavior. The UI is only a placeholder, the API client has no candidate,
resume, or application methods, and the existing resume/application contracts have
functional mismatches that must be resolved before enabling the candidate flow.

## 2. What Is Correct

- The public Apply CTA already preserves the selected job ID in
  `/dashboard/candidate?apply=<jobId>` in
  `03-nextjs-web/03-nextjs-web-app/src/components/jobs/public-job-detail-pane.tsx`.
- The authenticated routes are real NestJS routes:
  - `GET/PATCH /api/v1/candidates/me`
  - `DELETE /api/v1/candidates/me/facts/:factType/:factId`
  - `POST /api/v1/resumes/upload`
  - `GET /api/v1/resumes/:id/status`
  - `GET /api/v1/resumes/:id/parsed-data`
  - `POST /api/v1/resumes/:id/confirm`
  - `POST /api/v1/jobs/:jobId/apply`
  - `GET /api/v1/me/applications`, `/:applicationId`, and `/:applicationId/history`
- `RoleGuard(['candidate'])` is appropriate as a client UX guard; server-side `AuthGuard`
  remains the authorization authority.
- Candidate reads and mutations derive identity from the authenticated user, and resume
  status/parsed-data queries constrain `uploaded_by_user_id`. Candidate application reads
  constrain both `a.user_id` and the candidate profile owner. These are the right
  cross-user access boundaries.
- Profile updates, fact archival, and resume confirmation use `profile_revision`, row
  locking, history, and outbox writes. The plan correctly requires handling
  `STALE_REVISION` rather than silently overwriting.
- Upload storage is private and the browser-facing parsed-data response applies an allowlist;
  storage paths and raw AI output should not be exposed.
- The application transaction has consent validation, clean-scan ownership checking,
  immutable submitted snapshot creation, initial history, audit, and outbox writes.
  The database has a unique registered candidate/job identity, so duplicate replay can be
  represented as an idempotent response.
- Keeping guest upload/apply/claim separate is consistent with the existing guest-session
  routes and the plan's authenticated-first objective.
- No new database redesign is indicated by the plan. The existing baseline already contains
  profile revisions, document provenance, parsing history, application snapshots, and the
  relevant lifecycle enums.

## 3. Critical Issues

### 3.1 No resume collection/eligibility API

- **File/path:** `04-nestjs-api/04-nestjs-api-app/src/modules/candidates/candidate.ts:58-88`,
  `03-nextjs-web/03-nextjs-web-app/src/lib/api-client.ts`
- **Exact problem:** The available resume endpoints address one document by ID. There is no
  authenticated endpoint to list a candidate's resume revisions, current/active document,
  scan state, processing state, or clean eligible documents. `GET /candidates/me` also
  omits `candidate_profile_documents` and uploaded-document metadata.
- **Why it matters:** C3 cannot identify active versus historical resumes, and C4 cannot
  require the candidate to select an eligible clean resume. The plan's “load eligible clean
  resume(s)” and “preserve older resume revisions” are not implementable by composing the
  listed endpoints.
- **Recommended correction:** Add an authenticated, user-scoped resume collection/read
  contract (or explicitly expand `GET /candidates/me`) returning document ID, role,
  version, current flag, timestamps, scan status, processing status, and safe UI stage.
  Add the typed API-client method and tests. Keep storage bucket/path out of the response.
- **Priority:** P0

### 3.2 Multipart upload cannot use the current API-client defaults

- **File/path:** `03-nextjs-web/03-nextjs-web-app/src/lib/api-client.ts:39-63`
- **Exact problem:** `request()` always sends `Content-Type: application/json`. Passing
  `FormData` for `POST /resumes/upload` would send the wrong content type and prevent the
  browser from supplying the multipart boundary.
- **Why it matters:** The first step of the resume pipeline will fail or be parsed
  incorrectly. The plan's API-client test gate does not currently account for this.
- **Recommended correction:** Add a typed multipart path that omits `Content-Type` when the
  body is `FormData` (while retaining credentials, timeout, correlation headers, and 401
  behavior). Add a multipart request test. Do not use direct Supabase storage access.
- **Priority:** P0

### 3.3 “Upload progress” is not supported by the chosen transport

- **File/path:** `03-nextjs-web/03-nextjs-web-app/src/lib/api-client.ts:58`
- **Exact problem:** `fetch` does not provide browser upload-progress callbacks through the
  current client abstraction.
- **Why it matters:** C3 promises upload progress but the implementation can only provide
  an indeterminate uploading state unless a separate supported upload transport is added.
- **Recommended correction:** Change the requirement to an indeterminate upload state, or
  deliberately add/test an upload-progress transport. Do not claim byte progress from
  `fetch` without an actual mechanism.
- **Priority:** P1

### 3.4 Worker and NestJS status contracts leave resumes stuck

- **File/path:** `07-fastapi-ai-worker/app/services/resume_service.py:33-34`,
  `07-fastapi-ai-worker/app/api/v1/task_handlers.py`, and
  `04-nestjs-api/04-nestjs-api-app/src/modules/candidates/candidate.ts:76-87`
- **Exact problem:** `ResumeParsingService.parse_resume()` is explicitly unimplemented.
  The task-handler path does not consistently update `uploaded_documents.processing_status`
  through queued/processing/partial/completed/failed states, so NestJS can keep returning
  `UPLOADED`. Existing database-valid states such as `parsed` and `ai_enriching` are mapped
  to `PARSING_FAILED`.
- **Why it matters:** The required upload → scan → parse → review flow cannot reach a
  reliable review-ready state, and retry/error UI cannot distinguish valid lifecycle states.
- **Recommended correction:** Establish one authoritative worker orchestration path, update
  document/job status atomically for every lifecycle transition, and reconcile all database
  enum values with the browser stage contract. Add worker-to-NestJS compatibility tests and
  end-to-end status fixtures before C3.
- **Priority:** P0

### 3.5 Parsed output does not match the candidate review contract

- **File/path:** `07-fastapi-ai-worker/app/api/v1/task_handlers.py`,
  `07-fastapi-ai-worker/app/schemas/resume_parser.py`, and
  `04-nestjs-api/04-nestjs-api-app/src/modules/candidates/candidate.ts:112-124`
- **Exact problem:** Worker extraction uses a different shape (for example `name`, `email`,
  `phone`, string skills, and `education`) and stores AI output under an `ai`-style
  normalized structure. The candidate API expects canonical fields such as
  `professional_title`, `summary`, `skills`, `experiences`, `educations`,
  `certifications`, and `languages`.
- **Why it matters:** The editable review form cannot reliably render or confirm the
  parsed result, and confirmation may silently omit facts.
- **Recommended correction:** Version and enforce a canonical resume parsed-data contract
  shared by worker and NestJS. Normalize worker output before persistence and test every
  candidate fact collection, including partial results.
- **Priority:** P0

### 3.6 Parsed-data allowlist omits database-supported facts

- **File/path:** `04-nestjs-api/04-nestjs-api-app/src/modules/candidates/candidate.ts:112-114`,
  `02-database/migrations/baseline/08_candidates.sql`
- **Exact problem:** The API allowlist includes skills, experiences, educations,
  certifications, and languages, but omits `projects` and `awards`, both of which are
  canonical candidate fact tables.
- **Why it matters:** Resume review/confirmation cannot cover the complete candidate
  profile model and loses meaningful parsed data.
- **Recommended correction:** Include projects and awards in the versioned parsed-data
  contract and confirmation mapping, or explicitly document and test that they are not
  supported in this batch. Do not silently discard them.
- **Priority:** P1

### 3.7 Confirmation cannot confirm facts-only changes

- **File/path:** `04-nestjs-api/04-nestjs-api-app/src/modules/candidates/resume.ts:88-94`
- **Exact problem:** `confirm()` rejects the request unless at least one profile scalar
  field is supplied, even when the candidate only corrected/confirmed facts.
- **Why it matters:** C3 says the candidate can explicitly confirm corrected profile/facts,
  but a facts-only review cannot complete.
- **Recommended correction:** Define the confirmation payload as either profile fields,
  supported facts, or both; validate the actual supplied content and retain the same
  stale-revision and transaction guarantees. Add a facts-only test.
- **Priority:** P1

### 3.8 Application eligibility is weaker than the plan and schema

- **File/path:** `04-nestjs-api/04-nestjs-api-app/src/modules/applications/applications.ts:65-71`
- **Exact problem:** Apply checks owner and `security_scan_status = 'clean'`, but does not
  require `document_type = 'resume'`, a linked active/current candidate resume, or parsing
  completion/usable parsed state.
- **Why it matters:** A clean non-resume document, an unlinked historical resume, or an
  unparsed resume could be submitted despite C4 requiring a clean eligible resume.
- **Recommended correction:** Enforce document type, registered ownership, active resume
  linkage, and the exact agreed processing/eligibility state in the transactional apply
  query. Return a stable `DOCUMENT_NOT_ELIGIBLE` code for all rejected cases.
- **Priority:** P0

### 3.9 Application snapshot reads non-canonical profile columns

- **File/path:** `04-nestjs-api/04-nestjs-api-app/src/modules/applications/applications.ts:100`,
  `02-database/migrations/baseline/08_candidates.sql:46-73`
- **Exact problem:** Snapshot construction reads `headline`, `location_city`,
  `location_state`, `location_country`, `experience_years`, and `education_level`, while
  the canonical profile uses `professional_title`, `city/state/country`, and does not
  define those other names.
- **Why it matters:** Submitted snapshots and their UI summaries will contain null or
  incorrect values, undermining immutable snapshot behavior.
- **Recommended correction:** Build the snapshot from canonical profile columns and the
  confirmed canonical fact set, with a versioned schema and explicit field mapping tests.
- **Priority:** P0

### 3.10 Screening answers are not validated against the selected job

- **File/path:** `04-nestjs-api/04-nestjs-api-app/src/modules/applications/applications.ts:36-42`
- **Exact problem:** The API only checks that each answer has a string `question_id`; it
  does not load the job's screening questions, reject unknown IDs, enforce required
  questions, or validate answer types.
- **Why it matters:** The UI can show one questionnaire while the server accepts unrelated,
  missing, or malformed answers. The application snapshot then freezes invalid screening
  data.
- **Recommended correction:** Load screening questions inside the apply transaction,
  validate IDs, required answers, and question-specific value shapes, and add tests for
  unknown, missing-required, and valid answers.
- **Priority:** P1

### 3.11 Application read responses do not provide the planned snapshot summary

- **File/path:** `04-nestjs-api/04-nestjs-api-app/src/modules/applications/applications.ts:171-212`
- **Exact problem:** Candidate list/detail responses return snapshot ID and profile revision
  metadata, not a safe snapshot summary. The detail query also does not return the immutable
  snapshot data needed by the planned tracking UI.
- **Why it matters:** C5 cannot display the promised snapshot summary without inventing
  another undocumented route or exposing the wrong live profile.
- **Recommended correction:** Define a safe, deliberately reduced snapshot-summary response
  in the existing candidate application read endpoints, sourced from immutable
  `snapshot_data`; never substitute current profile data or recruiter-only fields.
- **Priority:** P1

### 3.12 Client types and methods are absent

- **File/path:** `03-nextjs-web/03-nextjs-web-app/src/lib/api-client.ts`,
  `03-nextjs-web/03-nextjs-web-app/src/types/`
- **Exact problem:** There are no typed candidate profile, resume status/parsed-data,
  confirmation, apply, or application list/detail/history interfaces or API-client methods.
- **Why it matters:** The plan cannot satisfy strict type safety or its API-client test gate
  by only composing existing methods.
- **Recommended correction:** Add types and methods only after the endpoint payloads are
  finalized, including stable error-code typing, multipart handling, and response envelope
  behavior.
- **Priority:** P0

## 4. Missing Items

### UI state

- Resume collection loading, empty, historical/current labels, and selected resume state.
- Poll cancellation/unmount handling, backoff/timeout, stale document selection, and a
  terminal cancelled/expired state.
- Distinct scan pending, scanning, infected/quarantined, scan retryable failure, parsing
  queued/in-progress, partial review, complete review, parsing failure, and already-confirmed
  states.
- Profile completeness calculation and a clear “cannot apply yet” state.
- Screening-question validation feedback per question, consent checkbox state, submit
  loading, replay confirmation, and form preservation on every recoverable failure.
- Application list/detail/history loading, not-found, empty, unauthorized, and mobile
  states.

### API/type/security

- A typed resume list/eligibility method and contract.
- Candidate, resume, parsed-data, confirmation, application, and history interfaces.
- Multipart-safe API-client behavior.
- Server-side validation of document type/current linkage/processing eligibility and
  screening answers.
- Safe snapshot-summary projection sourced from immutable data.
- Explicit retry semantics: the current routes expose status but no authenticated retry or
  reprocess endpoint. The UI must either only explain retryable failure or a later API
  contract must add a retry action.
- Cross-user tests for every candidate document, parsed-data, application detail, and
  history path using another user's IDs.

### Tests and manual gates

- API-client tests for every new method, multipart headers, `FormData`, envelope unwrap,
  401 refresh, timeout, and stable error codes.
- Candidate-page tests for query-string job loading, resume selection, polling cleanup,
  all status branches, facts-only confirmation, stale profile/review conflicts, and form
  preservation.
- Worker contract tests proving document status transitions and canonical normalized
  output.
- Apply tests for non-resume, historical/unlinked, unparsed, partial, and non-clean
  documents; invalid/unknown/missing-required screening answers; duplicate replay; and
  immutable snapshot values after later profile edits.
- Manual E2E gate for two users attempting to read each other's document/application IDs.
- Manual E2E gate for a resume becoming stale or failing while the page is polling.
- Manual E2E gate proving the application tracking screen displays the submitted snapshot,
  not the later live profile.

### Contract/database dependency

- No new table or schema redesign is inherently required if the existing baseline is used.
- Existing SQL contracts must be honored: document type and current-link state,
  processing/security enums, candidate canonical column names, immutable snapshots, and
  unique application identity.
- If a new resume-list or snapshot-summary endpoint is added, that is an API contract
  addition and must be documented/tested; it does not justify direct browser Supabase
  access or storage-path exposure.

## 5. Scope Decision

| Item | Decision |
|---|---|
| Authenticated candidate dashboard/profile/resume/application tracking | **Must be implemented in Candidate Page Batch 6** |
| API-client methods and types for the authenticated flow | **Must be implemented in Candidate Page Batch 6** |
| Worker status/output reconciliation required for C3 | **Must be implemented in Candidate Page Batch 6** |
| Apply eligibility and screening validation required for C4 | **Must be implemented in Candidate Page Batch 6** |
| Guest upload/apply/claim UI | **Should remain in a later batch**; existing guest APIs are job-scoped/token-based and are not needed to stabilize authenticated UX |
| Recruiter application management UI | **Should remain in a later batch** |
| AI candidate matching/ranking UI | **Must not be added** to Batch 6; it is not required for candidate submission/tracking |
| Notifications | **Should remain in a later batch** |
| Candidate embeddings/search projection UI | **Must not be added**; embeddings are a backend/search concern |
| New database migration/redesign | **Must not be added** for this plan; first reconcile implementation with the existing baseline |
| Small API contract additions for resume collection/snapshot summary | **Must be implemented in Batch 6** if the existing routes are not expanded, with shared types/tests and no storage leakage |

## 6. Final Recommended Execution Order

1. **Contract reconciliation gate:** establish canonical candidate/resume/application
   response types, enumerate database enum states, and decide the resume collection and
   safe snapshot-summary response shape.
2. **Backend correctness gate:** fix worker processing-status transitions and canonical
   parsed-output normalization; align NestJS status mapping, parsed allowlist, facts-only
   confirmation, canonical snapshot fields, document eligibility, and screening validation.
3. **API client/types:** add typed candidate, resume, confirmation, application, and history
   methods; make multipart requests correct; add focused client tests.
4. **C1 dashboard foundation:** implement shell/tabs, auth/role behavior, profile fetch,
   loading/empty/unauthorized/retry states, and preserve `apply` query context.
5. **C2 profile editor:** changed-field PATCH, revision handling, conflict reload,
   unsaved-value preservation, and fact archival.
6. **C3 resume center:** resume collection/current-history UX, upload, indeterminate or
   real progress, polling lifecycle, all scan/parse/retry states, parsed-data review,
   facts/profile confirmation, and idempotent/already-confirmed handling.
7. **C4 apply flow:** load the selected public job and validated screening contract, show
   completeness and eligible clean resumes, collect cover letter/answers/consent, submit,
   preserve form on errors, and render replay as the existing application.
8. **C5 tracking:** list/detail/history with safe immutable snapshot summary, owner-only
   reads, accessible empty/error/mobile states.
9. **Verification:** run targeted backend worker/application tests, frontend component and
   API-client tests, typecheck/build, then execute the manual gates including cross-user
   denial, polling failures, eligibility rejection, replay, and snapshot immutability.

