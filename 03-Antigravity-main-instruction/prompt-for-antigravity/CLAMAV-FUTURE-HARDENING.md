# Resume Security Scan — Future Hardening Backlog

**Status:** Architecture verified; improvements intentionally deferred  
**Current flow reference:** `CALMAV.md`  
**Rule:** Do not bypass ClamAV or mark a document `clean` without a real scanner verdict.

## Current approved responsibility split

```text
Next.js
  → NestJS validation + private storage + document metadata + outbox event
  → Outbox Dispatcher
  → FastAPI security task
  → ClamAV Cloud Run (HTTPS + OIDC ID token)
  → clean-only resume parsing
  → candidate review and NestJS confirmation
```

- NestJS performs synchronous upload validation, storage, document registration and confirmation.
- FastAPI executes the security task and calls the ClamAV Cloud Run service via HTTPS with OIDC ID token; ClamAV is the antivirus engine.
- Parsing is allowed only when `uploaded_documents.security_scan_status = 'clean'`.
- `failed` and `infected` must never be treated as `clean`.

## Verified and already implemented

- Magic-byte, extension, MIME, size, path and checksum validation at the NestJS boundary.
- Private storage upload and atomic `uploaded_documents` + `security.scan.requested` outbox transaction.
- Atomic security-scan claim using a conditional status update and `RETURNING`.
- Idempotent security task handling through processed-event tracking.
- `SCANNER_UNAVAILABLE` persists a retryable failed scan state and returns HTTP 503.
- Infected/quarantined documents do not create parsing jobs.
- Resume parser re-checks the database security status and accepts only `clean` documents.
- Clean scan and parse events are chained through the outbox.

## Deferred hardening items

### A1 — Chained outbox decision: retain for now

The current clean-scan transition is:

```text
FastAPI security task
  → same transaction: clean status + parsing job + resume.parse.requested outbox event
  → Outbox Dispatcher
  → FastAPI parsing task
```

This is technically valid and is intentionally retained for now because it provides:

- transactional state transition and durable delivery;
- the same retry/idempotency/audit boundary for every asynchronous task;
- decoupling between security and parsing workers;
- recovery if the dispatcher or parser is temporarily unavailable.

It is possible to replace the second hop with a direct internal queue/job poller, but that is an architectural change, not a bug fix. Do not remove `resume.parse.requested` merely because both consumers run in FastAPI. Revisit only with load/reliability evidence and an approved replacement that preserves transactional enqueue, retry, idempotency and observability guarantees.

### H1 — Persist failures from every scanner-stage dependency

If storage download, storage timeout, checksum mismatch, or another scanner-stage dependency fails, persist:

```text
security_scan_status = 'failed'
security_scan_result.verdict = 'error'
error.retryable = true/false
```

The document must not remain indefinitely in `scanning`, and parsing must not start.
Add unit/integration tests for storage download failure and timeout paths.

### H2 — Infected-file quarantine/retention policy

Define and implement one production policy for infected bytes:

- move to an isolated quarantine path, or
- delete through the authorized retention worker after audit evidence is written.

Regardless of the chosen policy:

- infected documents must never have a public/signed download path;
- parsed-data and confirmation endpoints must remain blocked;
- raw file bytes and threat details must not appear in logs or event payloads.

### H3 — Retry and dead-letter behavior

Document and test bounded retries for:

- ClamAV unavailable;
- storage download timeout;
- malformed scanner response;
- permanent validation/security errors.

Retryable failures should return/emit retryable status. Permanent failures should reach a dead-letter/terminal state without repeated scanning.

### H4 — Runtime readiness checks

Add a deployment/startup readiness check that verifies:

- ClamAV daemon reachable on the configured private host/port;
- scanner engine responds to a harmless health/version command;
- signature database is loaded and within the allowed freshness window.

The API must remain fail-closed when this dependency is unavailable.

### H5 — Security-scan observability without sensitive data

Add bounded metrics/log fields for scan latency, verdict, retry count and dependency errors. Never log resume content, storage credentials, signed URLs or personal resume data.

### H6 — Documentation reconciliation

Update older wording such as “FastAPI must not do direct malware scanning” to the precise rule:

> The FastAPI parser does not scan files itself; the FastAPI security-task handler orchestrates the private ClamAV/clamd scanner before parsing.

Keep `CALMAV.md` as the canonical local flow document.

## Release gate before marking this backlog complete

- Real local ClamAV runtime scan passes for a clean fixture.
- Infected EICAR fixture is rejected and never parsed.
- Scanner unavailable and storage timeout transitions are persisted as failed/retryable.
- Duplicate/concurrent scan tasks produce one effective verdict.
- Parser bypass attempt with a non-clean document is rejected.
- Quarantine/retention behavior is verified without leaking file contents.
- Full NestJS, FastAPI and frontend regression suites remain green.

No item in this backlog authorizes a security bypass or a database migration by itself; each change requires source-level review and targeted tests.
