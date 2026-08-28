# Phase 09-C — Candidate/Resume Read Slice

Status: `IMPLEMENTED — UPLOAD/CONFIRM REMAINING`

## Implemented routes

- `GET /api/v1/candidates/me` — authenticated candidate profile and active facts.
- `PATCH /api/v1/candidates/me` — expected-revision guarded profile update; history, revision
  bump and `candidate.profile.changed` are committed atomically.
- `DELETE /api/v1/candidates/me/facts/:factType/:factId` — allowlisted fact soft-delete with the
  same revision/history/outbox transaction.
- `GET /api/v1/resumes/:id/status` — ownership-safe status read with deterministic UI stage and
  security-scan precedence.
- `GET /api/v1/resumes/:id/parsed-data` — ownership-safe parsed result read. Only the approved
  normalized categories and confidence/validation metadata are returned; raw text, raw AI output,
  artifacts, storage details and internal errors are excluded.
- Server-only `StorageAdapter` boundary with a Supabase private-storage implementation was added;
  credentials remain runtime-only and are never part of controller responses.
- A reusable fail-closed resume validator now checks configured size, extension/MIME agreement,
  PDF/DOC/DOCX magic bytes, path traversal and SHA-256 checksum before storage finalization.
- `POST /api/v1/resumes/upload` now validates the authenticated candidate, reuses an existing
  checksum, stores the object through the private adapter, creates a library link/version, and
  commits document metadata plus `security.scan.requested` atomically. Storage cleanup is attempted
  if the database transaction fails.
- Initial `POST /api/v1/resumes/:id/confirm` command path is wired with ownership, clean-scan,
  parsed-result and expected-revision guards, canonical profile update, history and projection
  outbox transaction. Child-fact merge and durable idempotency replay still require the next hardening
  pass before this endpoint is production-ready.
- Confirmation now checks the existing `resume_confirmation` history/link inside the locked
  transaction and returns the prior successful state on a repeated confirmation, preventing a second
  revision/history/outbox event.
- Confirmation now accepts an explicit `facts` object and inserts allowlisted skills, experiences,
  educations, certifications, projects and languages with server-controlled confirmation status;
  experience/project/language provenance is bound to the confirmed document and parsed result.
- Guest session creation, guest resume upload, guest status/parsed-data reads, guest application
  submission, and authenticated guest claim endpoints are implemented. Guest application submission
  requires a clean security scan and emits `application.submitted` with the immutable snapshot id.
- API error responses preserve approved domain error codes instead of collapsing every 4xx response
  to `VALIDATION_ERROR`.

## Verification

```text
npm.cmd test -- --runInBand   PASS (16 suites, 35 tests)
npm.cmd run build             PASS
```

## Deliberately not implemented here

Exact changed-payload idempotency semantics, richer fact merge/revive behavior, real cloud storage
integration testing, and guest claim integration/concurrency tests remain the next hardening slice.
The concrete bucket and maximum size are runtime configuration (not hard-coded).
