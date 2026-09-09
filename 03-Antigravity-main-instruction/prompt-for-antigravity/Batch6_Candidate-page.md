# Batch 6 — Candidate Page Final Implementation Plan

## 1. Objective and Rules

Candidate dashboard (`/dashboard/candidate`) ko placeholder account page se complete authenticated candidate workspace me convert karna hai.

Phase 09-D ke verified job publishing, public search, public detail aur AI enrichment work ko change nahi karna hai.

- Browser se direct Supabase privileged access nahi.
- Undocumented route, table, event ya contract assume nahi karna.
- Database migration/redesign tabhi jab verified blocker prove ho.
- Existing role guards, security boundaries aur public-job Apply CTA preserve rahenge.
- Git commit/push user ke explicit instruction ke bina nahi.

## 2. Current Baseline

Candidate page abhi basic account overview hai. Existing NestJS endpoints:

### Profile

- `GET /api/v1/candidates/me`
- `PATCH /api/v1/candidates/me`
- `DELETE /api/v1/candidates/me/facts/:factType/:factId`

### Resume

- `POST /api/v1/resumes/upload`
- `GET /api/v1/resumes/:id/status`
- `GET /api/v1/resumes/:id/parsed-data`
- `POST /api/v1/resumes/:id/confirm`

### Applications

- `POST /api/v1/jobs/:jobId/apply`
- `GET /api/v1/me/applications`
- `GET /api/v1/me/applications/:applicationId`
- `GET /api/v1/me/applications/:applicationId/history`

`applications.ts` aur application routes already present hain; duplicate module nahi banana hai. Unke eligibility, screening aur snapshot behavior ko verify/fix karna hai.

Public job detail authenticated candidate ko `/dashboard/candidate?apply=<jobId>` par bhejta hai.

## 3. Phase C0 — Contract/API Readiness Gate

UI se pehle ye gate complete karna mandatory hai.

### C0.1 Frontend types and API client

Typed interfaces/methods add karo for candidate profile, candidate facts, resume list/status/parsed-data/confirmation, application submit/list/detail/history, screening questions and stable error codes.

### C0.2 Multipart upload

`apiClient` me multipart-safe method add karo. `FormData` ke case me `Content-Type: application/json` set nahi hoga; browser boundary set karega. Credentials, timeout, request IDs, trace IDs aur 401 refresh behavior preserve hon. Dedicated multipart test add karo.

### C0.3 Resume collection

Current API individual document ID ke bina resume history list nahi karta. Authenticated safe resume collection endpoint add karo, ya `GET /api/v1/candidates/me` deliberately expand karo. Response me ye fields hon:

- `document_id`, `document_role`, `version_number`, `is_current`
- upload/update timestamps
- security-scan status, processing status, safe UI stage

Storage path, bucket aur raw parser output expose nahi honge.

### C0.4 Worker/API compatibility

Actual worker task path verify karo:

- uploaded → scanning → queued → processing → partial/completed/failed transitions
- DB enum values aur NestJS browser stages aligned hon
- canonical parsed output: `professional_title`, `summary`, `skills`, `experiences`, `educations`, `certifications`, `languages`, plus agreed `projects`/`awards` policy
- partial result and failure/retry behavior deterministic ho

`ResumeParsingService.parse_resume()` ka `NotImplementedError` alone proof nahi hai ki pipeline unavailable hai; task-handler inline path ko tests/live fixtures se verify karna hai.

### C0.5 Application correctness

Existing application routes me verify/fix karo:

- resume owner, `document_type = 'resume'`, current/link eligibility
- clean scan and agreed parse-ready state
- stable `DOCUMENT_NOT_ELIGIBLE` error
- screening answers selected job ke questions ke against validate hon
- snapshot canonical profile columns se bane
- candidate detail safe immutable snapshot summary return kare
- duplicate replay existing application return kare

## 4. Phase C1 — Dashboard Foundation

1. Placeholder ko reusable dashboard shell me convert karo.
2. Sections/tabs: Overview, Profile, Resumes, Applications.
3. `GET /api/v1/candidates/me` load karo.
4. Loading, empty, unauthorized, retry aur server-error states add karo.
5. `RoleGuard(['candidate'])` preserve karo.
6. Desktop/mobile responsive layout banao.
7. `?apply=<jobId>` context preserve karo.
8. API/business logic reusable hooks/components me rakho; duplicate page logic nahi.

## 5. Phase C2 — Profile Editor

Canonical fields render/edit karo:

- professional title, summary
- current location, city/state/country/postal code
- preferred work mode
- willing to relocate/travel and `remote_experience` boolean
- notice period
- expected salary min/max and salary currency
- work authorization and visa sponsorship
- open to work and available-from date

Behavior:

1. Sirf changed fields PATCH karo.
2. Current `expected_profile_revision` bhejo.
3. `STALE_REVISION` par silent overwrite nahi; reload/conflict UI dikhao.
4. Recoverable error par unsaved values preserve karo.
5. Save success/error feedback do.
6. Facts archive/remove revision guard ke through karo.
7. Profile completeness indicator add kar sakte hain, lekin use application eligibility ka substitute nahi banana.

## 6. Phase C3 — Resume Center

### C3.1 List and upload

- Current/active resume aur historical versions clearly show karo.
- Version, date, scan stage and parsing stage show karo.
- PDF/DOC/DOCX backend validation ke through upload karo.
- `FormData` use karo; fetch ke saath false byte-percentage claim mat karo. Indeterminate uploading state acceptable hai.
- Checksum reuse ko clear message ke saath handle karo.

### C3.2 Polling

`GET /api/v1/resumes/:id/status` poll karo:

- Initial interval ~2 seconds
- Exponential backoff, maximum ~10 seconds
- Overall timeout 5 minutes
- Unmount/filter change par polling cancel

Stages map karo: `UPLOADED`, `SECURITY_SCANNING`, `SECURITY_REJECTED`, `SECURITY_RETRYABLE_FAILURE`, `PARSING_QUEUED`, `PARSING_IN_PROGRESS`, `REVIEW_READY_PARTIAL`, `REVIEW_READY`, `PARSING_FAILED`.

Timeout par longer-processing message dikhao; infinite polling nahi.

### C3.3 Review and confirmation

1. Review-ready result par parsed data load karo.
2. Canonical profile/fact fields ka editable review form dikhao.
3. Candidate correction ke baad explicit confirmation lo.
4. Facts-only confirmation supported ho to test karo.
5. `SCAN_PENDING`, `INFECTED_FILE`, `SCAN_FAILED`, `PARSING_NOT_READY`, `STALE_REVISION` aur already-confirmed responses map karo.
6. Confirmation ke baad profile/facts reload karke new revision show karo.

## 7. Phase C4 — Apply Flow

Ye phase C0–C3 tests pass hone ke baad start hoga.

1. `?apply=<jobId>` se selected job load karo.
2. Eligible clean, correctly linked resume select karne do.
3. Profile completeness and missing prerequisites show karo.
4. Server-validated screening questions render karo.
5. Cover letter, answers and explicit consent collect karo.
6. `POST /api/v1/jobs/:jobId/apply` submit karo.
7. Closed/expired job, invalid resume, invalid answers and consent errors par form preserve karo.
8. Replay ko duplicate error nahi, existing application success state dikhao.

## 8. Phase C5 — Application Tracking

1. Own applications list load karo.
2. Application detail and status history add karo.
3. Job title, status, applied date, safe snapshot summary and timeline show karo.
4. Current profile ko submitted snapshot ka replacement mat dikhao.
5. Empty, loading, unauthorized, not-found, error and mobile states add karo.
6. Cross-user application IDs par access denial verify karo.

## 9. Automated Verification

### Backend/worker

- Resume list ownership and safe projection
- Multipart/checksum upload
- Every document status transition
- Canonical parsed output, partial output and failure
- Facts-only and stale revision confirmation
- Application document eligibility
- Screening unknown/missing-required/valid answers
- Canonical immutable snapshot
- Duplicate replay
- Cross-user access denial

### Frontend/API client

- Multipart headers/FormData
- Profile load/save/stale conflict
- Resume list/upload/poll cancellation/timeout/status branches
- Parsed review and confirmation
- Apply query context, consent, screening validation and replay
- Application list/detail/history
- 401 refresh, timeout and stable error mapping

Run relevant NestJS/FastAPI tests, frontend tests, typecheck and production build.

## 10. Manual E2E Release Gates

1. Candidate login → dashboard without redirect loop.
2. Profile edit persists; stale concurrent edit safely rejected.
3. Resume upload → scan → parse → review → confirm updates canonical profile/facts.
4. Infected, failed, partial and timeout states show safe messages.
5. Second resume upload correctly marks current and historical versions.
6. Public job detail → Apply Now opens candidate page with selected job.
7. Valid application succeeds and appears in tracking.
8. Replay does not create duplicate.
9. Later profile edits do not mutate submitted snapshot.
10. Another candidate cannot access documents, parsed data or applications.

## 11. Out of Scope

- Guest upload/apply/claim UI
- Recruiter application management UI
- Notifications
- AI candidate matching/ranking UI
- Candidate embeddings UI
- New database redesign without verified blocker
- Changes to already verified Phase 09-D job publishing/search behavior

## 12. Final Execution Order

```text
C0 contract/API readiness
  → backend/worker correctness tests
  → typed API client and frontend types
  → C1 dashboard foundation
  → C2 profile editor
  → C3 resume center
  → application eligibility/snapshot/screening gates
  → C4 apply flow
  → C5 application tracking
  → full automated and manual verification
```

No git commit or push unless the user explicitly asks.
