# Stage 03 — NestJS API Requirements Sync

Status: `DRAFT — IMPLEMENTATION/CATALOG REVIEW REQUIRED`

Date: 2026-08-26

यह document first-resume flow के लिए NestJS API boundary को trace करता है। यह
implementation code नहीं है। Exact DTO names, transport choice और numeric rate limits
जहाँ repository में freeze नहीं हैं, वहाँ उन्हें invent नहीं किया गया है।

## 1. Authoritative sources

- `s1/codex/SECURITY-SCAN-IMPLEMENTATION-STAGES-AND-VERIFICATION-PLAN.md`
- `02-database/migrations/baseline/06_documents.sql`
- `02-database/migrations/baseline/07_resume_processing.sql`
- `02-database/migrations/baseline/08_candidates.sql`
- `02-database/migrations/baseline/15_infrastructure.sql`
- `02-database/migrations/baseline/17_rls.sql`
- `contracts/events/security-scan-requested.v1.json`
- `contracts/events/resume-parse-requested.v1.json`
- `contracts/events/candidate-resume-parsed.v1.json`
- `contracts/tasks/security-scan-task.v1.json`
- `contracts/tasks/resume-parse-task.v1.json`
- `04-nestjs-api/DECISION-01-NESTJS-SUPABASE-ACCESS-MODEL-HINGLISH.md`
- `04-nestjs-api/DECISION-02-REALTIME-TRANSPORT-HINGLISH.md`
- `04-nestjs-api/PHASE-01-REQUIREMENTS-CONSOLIDATION.md`
- `04-nestjs-api/NESTJS-IMPLEMENTATION-GUIDE.md`
- `01-requirements/product-decisions/PD-002-ACTIVE-RESUME-SEARCH.md`
- `02-database/migrations/baseline/09_applications.sql`

## 1A. Requirement traceability

| API label | Frozen requirement IDs |
|---|---|
| API-RESUME-001 Upload | `REQ-RESUME-001`, `REQ-RESUME-002`, `REQ-RESUME-005` |
| API-RESUME-002 Status | `REQ-RESUME-006` |
| API-RESUME-003 Parsed review data | `REQ-RESUME-003` |
| API-RESUME-004 Confirm | `REQ-RESUME-003`, `REQ-RESUME-004`, `REQ-RESUME-005` |
| Cross-cutting unresolved | `REQ-RESUME-007` fast-track name extraction (`NEEDS_DECISION`) |

## 2. Common rules for all four APIs

| Area | Frozen/verified rule |
|---|---|
| Caller | Authenticated candidate/user through Next.js; guest flow must use the approved guest-session rules from the database baseline. Exact public API auth decorator remains catalog/implementation work. |
| DB access | Controlled hybrid model with explicit client separation: `UserContextClient` is only for approved JWT/RLS user-context reads; `SystemClient` is for trusted business transactions and worker/system operations. For `uploaded_documents`, `guest_upload_sessions`, `resume_parsing_jobs` and `resume_parsed_data`, the baseline has no authenticated direct-read grant/policy, so this API scope uses `SystemClient` plus explicit NestJS ownership checks. Browser never receives service credentials. |
| External calls | Storage, Cloud Tasks, FastAPI or scanner calls must not run inside an open PostgreSQL transaction. |
| Outbox | Business row and its outbox event are committed atomically. Dispatcher delivery happens after commit. |
| PII | Resume content, signed URLs, credentials and tokens must not be placed in outbox/task payloads or logs. |
| Idempotency | Upload and confirm requests need an idempotency strategy; exact header/key format is not yet frozen and must not be invented by this draft. |
| Rate limit | Required for catalog completion; numeric limits are `NEEDS_DECISION` unless an authoritative source supplies them. |
| Live status | SSE is the live optimization and database/REST status is authoritative recovery. Exact SSE endpoint/reconnect DTO belongs to the realtime/API catalog decision. |

## 3. API-RESUME-001 — Upload resume

**Endpoint:** `POST /api/v1/resumes/upload`

**Requirement:** First resume upload must acknowledge quickly, keep canonical profile unchanged,
and start security scan before parsing. The candidate receives meaningful status updates until
parsed review data is available.

**Actors/authorization:** Authenticated candidate for a registered upload; guest upload only
through an explicitly approved guest session. Ownership/session binding must be checked before
the document is accepted.

**Request contract:** The approved direction is private storage with NestJS validation and
short-lived authorized upload access; the exact handshake/DTO is still catalog work. Regardless
of transport, NestJS must derive/verify:

- original file name, extension and MIME;
- positive file size within configured limit;
- magic bytes/content type;
- SHA-256 checksum and duplicate-reuse policy;
- private storage bucket/path;
- document type and owner/session identity.

The request must also carry the approved upload-time choice **“Use as active profile resume”**.
Selected documents can participate in the active profile/search flow after clean parse; unselected
profile-library documents remain non-active. Application-only resumes are handled by the separate
application flow and are never promoted automatically. The profile-resume library has a maximum
of 10 active library resumes; removal is a soft archive.

Raw file bytes, storage URL and signed URL are not sent in the outbox/task payload.

**Write path:**

1. Validate auth/guest session, ownership, size, MIME, extension, magic bytes and checksum. A
   guest session must be `active`, unexpired and not revoked; count/byte limits also apply.
2. NestJS streams/uploads the private object to storage outside the DB transaction; the browser
   never calls Supabase Storage directly and no browser storage token is issued.
3. In one trusted DB transaction insert `uploaded_documents` with
   `security_scan_status = 'pending'`, `processing_status = 'uploaded'`, and write
   `security.scan.requested` to `outbox_events`.
4. Commit; only after commit may dispatcher delivery occur.

**Tables:** `uploaded_documents`, `outbox_events`; guest flow may also touch
`guest_upload_sessions` according to the baseline guest-session functions/guards.

Candidate uploads use `resume_parsing_jobs.priority = 'normal'` by default. Admin/system priority
overrides are outside this candidate API scope.

**Response:** Immediate acknowledgement containing a non-sensitive `document_id` and current
processing/security status. Exact response DTO and HTTP status are `TBD`.

**Status sequence exposed to UI:** the API maps two separate database tracks:

```text
security_scan_status: pending → scanning → clean / infected / failed / quarantined
processing_status:    uploaded → queued → processing → parsed / completed / failed / partial / ai_enriching
```

The UI stage is a deterministic projection of both tracks; no new database enum is invented.

**Failure/compensation:** If DB commit fails after object upload, the API must not claim success
and must emit/use the approved compensating cleanup event; cleanup sweeper ownership/timing remains
an operational decision. Normal product cleanup uses `deleted_at` soft-delete; physical deletion is
reserved for authorized retention/purge. Security scanner failure is fail-closed and must not
enqueue parsing.

**Acceptance criteria:**

- Invalid owner/session, MIME, magic bytes, size or checksum is rejected before the outbox event.
- A new checksum creates one active document row and one security-scan request. A matching
  owner/session plus checksum reuses the existing document and does not create a second row or
  scan event.
- Canonical candidate profile tables are unchanged before candidate review/confirm.
- No signed URL, token or resume content appears in the event/task payload or logs.

## 4. API-RESUME-002 — Read processing status

**Endpoint:** `GET /api/v1/resumes/:id/status`

**Actor/authorization:** The owning candidate, authorized guest session, or an explicitly
authorized internal workflow. Cross-user/cross-session reads must be denied.

**Reads:** `uploaded_documents` (`security_scan_status` and `processing_status`) plus the relevant
`resume_parsing_jobs` row and, when needed, immutable `resume_parsing_job_events` timeline. The API
may expose safe status metadata, timestamps, retry-safe error codes and progress stage; it must not
expose raw resume content, secrets or internal stack traces.

**Response:** Stable status DTO with `document_id`, security status, processing status, parsing
status (when available), a UI-safe stage/code, and timestamps. Exact field names are `TBD` and
must be finalized against existing enum values.

**Transaction:** Read-only query; no outbox event.

**Realtime/recovery:** Next.js may receive an SSE nudge, but it must be able to recover by calling
this endpoint. A missed SSE event must never make the workflow incorrect.

**Acceptance criteria:**

- Owner receives the current authoritative DB state.
- Unauthorized document IDs return the approved not-found/forbidden behavior without leaking
  ownership.
- A terminal infected/failed state never appears as parsed-ready.

## 5. API-RESUME-003 — Read parsed review data

**Endpoint:** `GET /api/v1/resumes/:id/parsed-data`

**Actor/authorization:** Same owner/guest-session boundary as the status API.

**Reads:** `resume_parsing_jobs`, `resume_parsed_data`, and the related `uploaded_documents` row.
Only a successfully parsed document may return review data.

**Response:** An allowlisted set of parsed normalized fields, confidence/validation metadata and
source identifiers needed to pre-fill the review form. Raw provider payload, extracted text and
artifacts should not be returned unless a later approved privacy decision explicitly requires it.

**Transaction:** Read-only query; no outbox event.

**Acceptance criteria:**

- Before parsing succeeds, response is a stable not-ready result, not fabricated empty profile
  data.
- Cross-user access is rejected.
- Returned data is clearly marked as candidate review input and does not update canonical
  profile tables by itself.

## 6. API-RESUME-004 — Confirm parsed profile

**Endpoint:** `POST /api/v1/resumes/:id/confirm`

**Actor/authorization:** Owning authenticated candidate only (or an explicitly approved guest
claim path); NestJS must verify the document and candidate identity.

**Request:** Candidate-reviewed/edited profile facts. Exact DTO field list must be derived from
the canonical candidate tables and is `TBD` until the API catalog maps every writable field.
Unknown fields must be rejected; provider output must not silently overwrite user edits.

**Preconditions:** Parsed review data exists; `uploaded_documents.deleted_at IS NULL`;
`security_scan_status = 'clean'`; and the document/candidate ownership relationship is valid.
`pending`, `scanning`, `infected`, `failed` and `quarantined` documents cannot be confirmed.

**Write transaction:** In one trusted transaction:

1. Re-check ownership, clean scan status, active document state and parsed-data availability;
   lock the candidate row with `FOR UPDATE`.
2. Verify the expected profile revision; stale revision returns `409 Conflict`.
3. Apply only the allowlisted candidate-confirmed facts to canonical profile tables. The client
   cannot set provenance, verification, revision, audit or system-owned fields.
4. Insert the corresponding `profile_change_history` audit row.
5. Bump the candidate profile revision exactly once for one logical save, using the approved
   database revision function/transaction pattern.
6. Link the document through `candidate_profile_documents` with `document_role = 'resume'` and
   the approved active-resume policy.
7. Write `candidate.profile.changed` v1 with its approved `change_type` and `active_document_id`
   fields for the projection queue.
8. Commit. No Cloud Tasks/FastAPI call is made inside the transaction.

**Response:** Confirmation result with candidate/profile revision and projection-processing
status. Exact DTO/status code is `TBD`.

**Idempotency:** Repeating the same idempotency key must not duplicate profile facts, revision
bump, document link or outbox event. A retry with a different key must follow the approved
conflict policy rather than silently create a second logical confirmation.

**Acceptance criteria:**

- Canonical profile remains unchanged when confirmation fails.
- One logical confirmation causes one revision bump and one downstream projection request.
- One confirmation writes one profile history row and returns the new profile revision.
- A stale expected revision returns `409 Conflict` without changing canonical data.
- Candidate search projection is eventually rebuilt from the confirmed canonical revision.
- Candidate can retrieve the saved canonical data after a successful confirmation.

## 6A. Scope boundary: application-specific resumes and guest claim

The four APIs above describe the registered candidate’s profile-resume flow. They do not replace
the application flow. A resume uploaded for a specific job is application-only, is linked through
`application_documents` and its immutable `application_profile_snapshots`, and must not update or
automatically promote the canonical candidate profile/library. Guest upload, guest application and
guest-to-account claim use the approved guest-session/claim state machines and require separate API
catalog entries. These flows are explicit phased scope, not silently omitted requirements.

## 6B. Current async implementation boundary

The repository currently contains the following downstream path:

```text
security.scan.requested
  → security-scan-queue
  → FastAPI ClamAV handler
  → clean-only resume.parse.requested
  → ai-heavy-queue / resume parser
```

`candidate.resume.parsed` and `candidate.projection.rebuilt` are FastAPI output events. They are
not dispatcher input routes. `candidate.profile.changed` is the approved confirm-side input route
to `projection-queue`. Runtime ClamAV sidecar deployment and live security-scan E2E remain gates.

## 7. Explicit open decisions before catalog freeze

1. Canonical public route-prefix convention is `/api/v1`; exact controller paths must be frozen
   consistently across the API catalog.
2. Exact request/response DTO names and HTTP status/error codes.
3. Exact multipart DTO, limits and streaming behavior for the frozen NestJS-mediated upload path.
4. Numeric upload/status/confirm rate limits.
5. SSE endpoint, authentication on connection, reconnect and status-recovery DTO.
6. Guest upload/claim API surface and whether it shares these four paths.
7. Object-upload cleanup-sweeper ownership/timing; the compensating cleanup event is already an
   approved requirement.
8. Canonical profile writable-field allowlist for the confirm endpoint.
9. Upload-time active-profile selection behavior must follow PD-002; any deviation requires a new
   decision record.
10. Optional `REQ-RESUME-007` fast-track name-extraction path.

## 8. Stage-03 exit criteria

- Every endpoint has a requirement ID, actor/authorization, validation, DB reads/writes,
  transaction boundary, event/consumer, idempotency, rate-limit field, errors, realtime behavior
  and testable acceptance criteria.
- All `TBD/NEEDS_DECISION` items are either resolved in an approved decision record or carried
  forward as explicit gaps.
- Independent review confirms no endpoint, event or database transition was invented or omitted.

**Current status: STAGE-03 DRAFT UPDATED — FINAL INDEPENDENT REVIEW REQUIRED; CODING NOT AUTHORIZED.**
