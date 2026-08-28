# NestJS API application

यह folder NestJS API का runnable root है। Foundation, candidate/resume/guest, jobs, applications,
saved-candidates, feedback और analytics-ingestion slices implemented हैं। Search list endpoints और
कुछ downstream consumers अभी अलग gates हैं।

## Local run

```text
npm install
npm run build
npm test
npm run start:dev
```

`.env.example` को local `.env` में copy करें। Real secrets commit या log न करें।

## Implemented foundation

- fail-fast environment validation
- PostgreSQL pool और transaction rollback wrapper
- अलग `UserContextClient` / `SystemClient` boundaries
- Isolated JOSE JWT verifier with HttpOnly access-cookie support and Bearer fallback
- liveness/readiness endpoints

## Implemented authentication slice

- `POST /api/v1/auth/signup` and `POST /api/v1/auth/login` use Supabase Auth as
  token issuer; NestJS never inserts `public.users` directly.
- `POST /api/v1/auth/refresh` accepts only the path-scoped HttpOnly refresh
  cookie.
- `POST /api/v1/auth/logout` requires a valid access token, clears auth and
  presence cookies, and deactivates only the matching `user_sessions` row.
- Successful/failed login attempts write append-only audit records through the
  server-only `SystemClient`; raw credentials/tokens are never stored.
- `CORS_ORIGINS` and `TRUST_PROXY` are explicit environment configuration; no
  wildcard/default production origin is assumed.

## Implemented candidate/resume/guest APIs

- `GET/PATCH /api/v1/candidates/me`
- `DELETE /api/v1/candidates/me/facts/:factType/:factId`
- `POST /api/v1/resumes/upload`
- `GET /api/v1/resumes/:id/status`
- `GET /api/v1/resumes/:id/parsed-data`
- `POST /api/v1/resumes/:id/confirm`
- `POST /api/v1/guest-sessions`
- `POST /api/v1/guest-sessions/:sessionId/resumes`
- `GET /api/v1/guest-sessions/:documentId/status`
- `GET /api/v1/guest-sessions/:documentId/parsed-data`
- `POST /api/v1/guest-sessions/apply`
- `POST /api/v1/guest-sessions/claims`

## Implemented application, bookmark and feedback APIs

- `POST /api/v1/jobs/:jobId/apply`
- `PATCH /api/v1/companies/:companyId/applications/:applicationId/status`
- `GET /api/v1/companies/:companyId/saved-candidates`
- `POST/DELETE /api/v1/companies/:companyId/saved-candidates/:candidateId`
- `POST /api/v1/feedback`
- `POST /api/v1/analytics/events`

## Jobs/Search groundwork

- Internal public-job FTS query builder enforces published, non-deleted and non-expired visibility.
- Internal recruiter candidate query builder enforces active membership, open-to-work eligibility
  and safe projected fields.
- Shared signed cursor utility enforces filter binding, expiry and the approved 20/50 page bounds.
- `POST /api/v1/companies/:companyId/jobs` currently creates an audited draft for active
  employer/owner or admin users; HR permission-key mapping remains pending contract freeze.
- Direct publish now additionally requires `companies.verification_status = 'verified'`; approval
  workflow may still move an eligible draft to `pending_approval`.
- Named lifecycle commands `pause`, `resume` and `close` are implemented with explicit source-state
  guards and atomic audit records; terminal states are never reopened.
- Job approval commands `submit-for-approval`, `approve`, `reject` and `archive` are implemented
  with verified-company and source-state guards. HR-specific permission-key mapping remains pending.

Public controllers are intentionally not exposed until the exact search routes, DTOs and permission
keys are recorded in the Jobs/Search API contract.

Interview API core implementation is available in `src/interviews.ts`: scheduling, company/candidate
reads, confirmation/decline, cancellation and rescheduling. Database lifecycle invariants are covered
by `scripts/interview-integration-smoke.js`, which was run against Dev Supabase with a guaranteed
rollback. Notification/outbox event emission and calendar/video integrations remain gated until their
approved contracts exist. Policy references are in `INTERVIEW-API-FINAL-FREEZE.md`.

All business writes use trusted server transactions; browser को Supabase credentials नहीं मिलते।

पुराने job-transition और notification audit documents `../s1/archive/pre-phase9/` में रखे गए हैं; वे implementation source नहीं हैं।
