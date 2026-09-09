# Codex Continuation Handoff — Binay Job Portal

Read this file completely before doing anything. Continue the existing project; do not restart, redesign, or repeat completed work.

## Authoritative repository

Use only:

`C:\Users\ADMIN\Desktop\Vishesh\Binay-Job-Portal-App`

Do not use the OneDrive copy as the source of truth. First run `git status` and inspect the current diff. The user currently prefers no automatic commit, no push, and no destructive reset/checkout. Never commit unless the user explicitly asks.

Architecture: Next.js browser → NestJS API → Supabase PostgreSQL. Next.js must not access Supabase directly. FastAPI is used only as the asynchronous AI worker through the outbox dispatcher.

## Important operating rules

- Preserve existing changes; do not revert unrelated work.
- Do not apply or create migrations without explicit user approval.
- Do not claim a test, live DB check, or E2E flow passed unless its output was actually observed.
- Keep secrets, tokens, cookies, passwords, database URLs, and SMTP credentials out of logs and reports.
- Before changing code, trace the relevant DB schema → API → worker → UI path.
- Manual HR publish/approval testing is still important; automated tests do not replace it.

## Completed work

### Identity, company, and invitation flows

- Phase 09-B company verification and authorization are implemented.
- Unverified companies cannot perform protected organization mutations.
- Owner/platform-admin verification gates are enforced.
- Option A existing-user invitation flow is implemented.
- Option B HR invite-first rules and security hardening are implemented at code/unit-test level.
- Raw invitation tokens are not returned or logged.
- Invitation verification is read-only; acceptance is atomic and protected against replay/concurrency.
- Outbox delivery failures are fail-closed; no false successful delivery is reported.

### Phase 09-D employer job posting

- Draft creation/update, locations, skills, custom skills, screening questions, interview rounds, and enhancement fields are implemented.
- Job lifecycle is enforced: `draft → pending_approval → published`, with pause/resume/close/archive guards.
- Direct publish and owner/admin approval publish only are allowed to emit the AI enrichment outbox event.
- `job.ai.enrichment.requested` uses the full G-1 envelope and is inserted in the same transaction as publication and audit logging.
- Outbox failure rolls back publication and audit rows.
- Fail-visible frontend loading/action errors and Retry handling are implemented.
- `custom_skills` is a validated JSONB array; empty `[]` from the edit form clears the DB value.
- Live integrity constraints exist for interview rounds, custom skills, and non-negative notice period after explicit migration application.

### Search and AI enrichment

- `jobs.search_vector` is maintained by FTS triggers/functions. It is separate from asynchronous embedding generation.
- Do not add a DB trigger/function that calls an embedding provider. Embeddings remain an application/outbox/worker responsibility.
- FastAPI loads the canonical job aggregate, including description, requirements, responsibilities, preferred qualifications, category, employment/work fields, experience, education, notice period, remote flag, locations, master skills, and custom skills.
- Semantic text now includes the approved v1 fields: description, preferred qualifications, experience level/range, remote flag, work fields, education, locations, skills, custom skills, responsibilities, requirements, and selected AI domains.
- `benefits` is intentionally excluded from the v1 technical embedding and documented as a structured/product filter.
- AI profile JSONB is persisted in `jobs.ai_ideal_candidate_profile`; AI metadata is not duplicated into semantic text.
- Embeddings are 768-dimensional and store model/version metadata.
- Retryable AI provider errors return retryable HTTP responses. Non-retryable errors persist `embedding_status = 'failed'` with an optimistic timestamp guard.
- Model name matching is exact against `Settings.EMBEDDING_MODEL`; dimension uses `Settings.EMBEDDING_DIMENSION`. Mock providers are test-only/explicitly enabled.

## Primary files to read before future work

1. `02-database/migrations/baseline/05_jobs.sql`
2. `02-database/migrations/baseline/05_jobs_AI_Make_Job_searchable_step3.md`
3. `02-database/migrations/baseline/05_jobs_AI_Job_Profile_JSONB_Contract_v1_step1.md`
4. `02-database/migrations/baseline/05_jobs_AI_Job_Embedding_Architecture_v1_step2.md`
5. `02-database/migrations/baseline/05_jobs_AI_Job_Edit_Corner_Case_Guidelines.md`
6. `03-Antigravity-main-instruction/prompt-for-antigravity/job_publish.md`
7. `04-nestjs-api/04-nestjs-api-app/src/modules/jobs/jobs.ts`
8. `04-nestjs-api/04-nestjs-api-app/src/modules/jobs/jobs.spec.ts`
9. `03-nextjs-web/03-nextjs-web-app/src/components/employer/job-posting-manager.tsx`
10. `07-fastapi-ai-worker/app/repositories/job_repo.py`
11. `07-fastapi-ai-worker/app/services/job_ai_service.py`
12. `07-fastapi-ai-worker/app/services/semantic_builders.py`
13. `07-fastapi-ai-worker/app/api/v1/task_handlers.py`
14. `07-fastapi-ai-worker/app/schemas/job_enrichment.py`
15. `contracts/events/job-ai-enrichment-requested.v1.json`
16. `03-Antigravity-main-instruction/prompt-for-antigravity/embedding-verify/CONSOLIDATED_REVIEW_DECISION.md`

## Current verification evidence

Reported results include:

- FastAPI full suite: 317 tests passed in the latest report.
- NestJS full suite/build and Next.js tests/typecheck/build were previously passing.
- Live DB integrity checks found no invalid existing JSONB arrays or negative notice periods.
- G-1 publish → outbox → dispatcher → FastAPI enrichment flow was previously exercised.

Treat these as reported evidence and rerun only when needed. Do not inflate numbers or state that a live check was rerun when it was not.

## Remaining final work (approximately 3%)

1. Finish the final read-only code review of the latest uncommitted FastAPI changes.
2. Run the targeted FastAPI tests and, if practical, the full suite with captured final output.
3. Confirm the exact model/dimension compatibility path and both retryable/non-retryable failure paths.
4. Perform manual employer tests: save draft, HR submit-for-approval, owner/admin approve, rejection, direct HR publish when approval is disabled, and verify public visibility only after publication.
5. Recheck the working tree and document any remaining findings. Do not commit unless the user explicitly requests it.
6. Only after the user approves the completed employer flow should Public Job Search and Job Detail UI work begin.

## Expected handoff style

Report concrete file/line evidence, commands actually run, and exact pass/fail output. Separate confirmed facts, reported evidence, and recommendations. If a blocker remains, explain the smallest safe next fix instead of changing unrelated files.

## Current continuation update — 2026-09-09

This section supersedes any older “remaining 3%” wording above.

### Candidate dashboard and resume flow

- Candidate dashboard route: `/dashboard/candidate`.
- Public job detail sends an authenticated candidate to `/dashboard/candidate?apply=<jobId>`.
- Candidate sections are Overview, Profile, Resumes and Applications.
- First-time onboarding is resume-first: when no resume exists, the dashboard opens Resumes automatically and Profile remains disabled. Tooltip: `Upload a resume to enable your profile`.
- Resume flow is: upload → security scan → clean-only parsing → parsed-data review/edit → explicit confirmation → canonical profile/facts update → projection event.
- Profile editing is available after at least one resume exists; resume confirmation is the first-time canonical-data path and does not silently overwrite later profile edits.
- Resume upload uses `FormData`; do not force `Content-Type: application/json` for multipart requests.
- NestJS owns validation, private storage upload, document registration and `security.scan.requested` outbox creation.
- Dispatcher routes `security.scan.requested` to `/internal/tasks/security/scan` and `resume.parse.requested` to `/internal/tasks/resume/parse`.
- FastAPI security task downloads the private object, calls ClamAV through `clamd`, persists clean/infected/failed result metadata, and creates a parsing job only for a clean verdict.
- FastAPI parser independently re-checks `security_scan_status = 'clean'` before extraction and LLM parsing.
- Candidate confirmation goes through NestJS `POST /api/v1/resumes/:id/confirm`, uses `expected_profile_revision`, updates canonical profile/facts transactionally, and emits `candidate.profile.changed`.
- Application submission requires an owned current resume, clean scan, review-ready parse state, consent, and valid screening answers. Application snapshots are immutable.

### Resume security ownership — final decision

```text
Next.js upload UI
  → NestJS validate + store + register document
  → security.scan.requested
  → Outbox Dispatcher
  → FastAPI security task
  → ClamAV/clamd verdict
  → clean only: resume.parse.requested
  → Outbox Dispatcher
  → FastAPI parsing task
  → candidate review/confirmation in NestJS
```

NestJS performs validation/storage/confirmation. FastAPI executes the security task and parser; ClamAV/clamd is the antivirus engine. The chained `resume.parse.requested` outbox hop is intentionally retained for transactional delivery, retry, idempotency, audit and worker decoupling. Do not remove it merely because both handlers run in FastAPI.

Local ClamAV prerequisite:

- `start-all-services.bat` starts FastAPI, NestJS, dispatcher, Next.js and the wake loop, but not ClamAV.
- A ClamAV/clamd daemon must listen on `127.0.0.1:3310` locally.
- If unavailable, `503 SCANNER_UNAVAILABLE` and a retryable failed scan state are expected fail-closed behavior.
- Production uses a private ClamAV sidecar/container, not a public scanner endpoint.

### Canonical security references

Read these before changing the resume security pipeline:

1. `03-Antigravity-main-instruction/prompt-for-antigravity/CALMAV.md`
2. `03-Antigravity-main-instruction/prompt-for-antigravity/CLAMAV-FUTURE-HARDENING.md`
3. `04-nestjs-api/04-nestjs-api-app/src/modules/candidates/resume.ts`
4. `07-fastapi-ai-worker/app/api/v1/task_handlers.py`
5. `07-fastapi-ai-worker/app/services/security_scanner.py`
6. `05-outbox-dispatcher-nestjs/src/routing/event-route.registry.ts`

### Confirmed latest verification

- Candidate dashboard focused tests: 4 passed.
- Frontend regression: 38 tests passed; typecheck and production build passed.
- NestJS candidate/application targeted tests: 23 passed; NestJS build passed.
- Real upload reached `SECURITY_SCANNING`; the 503 was traced to ClamAV not listening on `127.0.0.1:3310`, not to the upload/API contract.

### Next safe work

1. Start local ClamAV and rerun real resume upload → scan → parse → review → confirm.
2. Verify clean fixture, infected EICAR fixture, scanner unavailable, storage download failure and retry behavior.
3. Verify duplicate scan idempotency and parser bypass rejection for non-clean documents.
4. Verify application replay, immutable snapshot after profile edits and cross-candidate access denial.
5. Apply only deferred items in `CLAMAV-FUTURE-HARDENING.md` after targeted design approval.
6. Run final regression suites and inspect `git status`.

### Non-negotiable continuation rules

- Never bypass ClamAV or mark a document `clean` manually.
- Do not treat a local scanner-unavailable 503 as an application bug without code evidence.
- No commit, push, migration, destructive reset/checkout or unrelated redesign unless the user explicitly asks.
