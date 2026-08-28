# Stage-03 API Sync Independent Review

Date: 2026-08-26

## 1. Final verdict

**APPROVED WITH CHANGES**

The draft correctly respects the security-scan sequence, trusted NestJS write boundary,
transactional outbox and SSE recovery decision. It is not yet ready for API-catalog freeze
because several externally visible API decisions are intentionally still unresolved.

## 2. Repository evidence checked

- `s1/codex/STAGE-03-NESTJS-API-REQUIREMENTS-SYNC.md`
- `s1/codex/SECURITY-SCAN-IMPLEMENTATION-STAGES-AND-VERIFICATION-PLAN.md`
- `02-database/migrations/baseline/06_documents.sql`
- `02-database/migrations/baseline/07_resume_processing.sql`
- `02-database/migrations/baseline/08_candidates.sql`
- `02-database/migrations/baseline/15_infrastructure.sql`
- `02-database/migrations/baseline/17_rls.sql`
- `contracts/events/security-scan-requested.v1.json`
- `contracts/events/resume-parse-requested.v1.json`
- `contracts/tasks/security-scan-task.v1.json`
- `contracts/tasks/resume-parse-task.v1.json`
- `04-nestjs-api/DECISION-01-NESTJS-SUPABASE-ACCESS-MODEL-HINGLISH.md`
- `04-nestjs-api/DECISION-02-REALTIME-TRANSPORT-HINGLISH.md`

## 3. What is correct

| Area | Verdict | Evidence |
|---|---|---|
| Scan before parse | Correct | `06_documents.sql` starts scan as `pending`; worker creates parse job only after clean result |
| Canonical profile protection | Correct | Draft keeps canonical update behind explicit candidate confirmation |
| Transaction boundary | Correct | Business row + outbox in one DB transaction; scanner/Cloud Tasks outside transaction |
| Task payload privacy | Correct | Security task contract contains only schema/event/aggregate/trace identifiers |
| Ownership/security | Correct direction | Decision-01 hybrid model and `17_rls.sql` deny unauthorized direct access |
| Realtime | Correct | Decision-02 defines SSE optimization plus REST/DB authoritative recovery |
| Idempotency | Correct direction | Upload/confirm retries are explicitly addressed without inventing a key format |
| Failure behavior | Correct | Infected/unavailable scan must not proceed to parsing |

## 4. Problems and missing items

| ID | Severity | Problem | Evidence | Recommended correction |
|---|---|---|---|---|
| S3-001 | HIGH | Upload transport is unresolved | Draft §3 marks multipart vs storage handshake TBD | Freeze one transport before API catalog; document max body, private bucket and checksum ownership |
| S3-002 | HIGH | Confirm DTO/writable-field allowlist is unresolved | Draft §6 marks exact canonical fields TBD | Map every writable field to `08_candidates.sql`; reject unknown/provider-only fields |
| S3-003 | HIGH | Guest flow is not a complete API contract | Draft mentions guest rules but no guest endpoint/request/response/claim behavior | Either add guest-specific catalog rows or explicitly scope these four endpoints to registered candidates only |
| S3-004 | HIGH | Application-specific resume flow is outside this four-endpoint draft | Repository supports application documents/snapshots in `09_applications.sql` | Record a separate API-catalog gap so job-specific resume upload is not silently omitted |
| S3-005 | MEDIUM | Status DTO does not yet map every existing enum to UI-safe states | `security_scan_status`, `resume_processing_status`, and `parsing_job_status` are separate DB states | Add a deterministic mapping table and terminal/error semantics before freeze |
| S3-006 | MEDIUM | Idempotency key format and replay response are unresolved | Draft intentionally leaves header/key format TBD | Freeze header, scope, retention, conflict response and same-key replay behavior |
| S3-007 | MEDIUM | Rate limits are placeholders | Numeric values are not present | Add approved per-user/IP/endpoint limits and retry guidance |
| S3-008 | MEDIUM | SSE endpoint/authentication contract is not cataloged | Decision-02 requires exact path/ticket/reconnect details later | Add stream path, auth mechanism, event envelope, Last-Event-ID/recovery behavior |
| S3-009 | LOW | Storage cleanup after DB failure is only referenced as a future workflow | `uploaded_documents` has no hard-delete product flow | Record cleanup owner, retention window and observable orphan state |

## 5. API-by-API review

### `POST /resumes/upload`

Direction is correct. It must validate ownership, limits, MIME/magic bytes and checksum, create
`uploaded_documents` and `security.scan.requested` atomically after storage handling, and return
before scanning/parsing completes. The exact transport, DTO, rate limit and compensation policy
remain blocking catalog decisions.

### `GET /resumes/:id/status`

Correct as an authoritative recovery read. It must read the document and parsing job state while
preventing cross-user leakage. The state-to-UI mapping must be frozen; a generic `status` string
without source-state mapping is insufficient.

### `GET /resumes/:id/parsed-data`

Correct to expose review input only after parsing succeeds. It must not mutate canonical tables or
return raw provider data by default. The not-ready response shape and privacy filtering need exact
DTO decisions.

### `POST /resumes/:id/confirm`

Correct transaction intent: re-check clean status/ownership, write canonical facts, bump revision
once, link the document and emit the approved projection event. The field-level allowlist,
revision conflict behavior and retry response must be finalized before implementation.

## 6. End-to-end flow review

```text
upload validation
  → private object
  → uploaded_documents(pending)
  → security.scan.requested
  → dispatcher/security queue
  → FastAPI + ClamAV
  → clean-only resume.parse.requested
  → resume_parsing_jobs/resume_parsed_data
  → status + SSE nudge
  → candidate review/edit
  → confirm transaction
  → canonical profile + revision
  → projection outbox event
```

This sequence is compatible with the current SQL/contracts. It must not be advertised as fully
implemented until NestJS producer code, ClamAV daemon runtime and live security E2E pass.

## 7. Open decisions before freeze

1. Upload transport and private-storage handshake.
2. Exact DTOs/HTTP status codes.
3. Guest API scope and claim behavior.
4. Application-specific resume API/snapshot boundary.
5. Confirm writable-field allowlist and revision conflict policy.
6. Idempotency key format/replay semantics.
7. Numeric rate limits.
8. SSE path, authentication ticket and recovery envelope.
9. Orphan-object cleanup ownership.

## 8. Exact required changes

- Keep the current draft as a requirements-sync draft; do not start coding from unresolved DTOs.
- Add the application-specific resume gap explicitly to the next API catalog.
- Add a DB-enum → UI-stage mapping table.
- Freeze the nine decisions above through approved decision records or explicit tracked gaps.
- After fixes, obtain independent agent review before Stage-03 freeze.

## 9. Final status

**READY AFTER REQUIRED FIXES**

The architecture direction is sound, but Stage-03 API catalog freeze and NestJS coding are not
yet authorized.
