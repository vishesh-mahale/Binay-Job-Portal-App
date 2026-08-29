# Stage-03 Remaining API Decisions

Status: `DECISIONS PENDING — DOCUMENT UPDATED AFTER MULTI-AGENT REVIEW — NO CODE`

यह file Stage-03 API sync के बचे हुए decisions को अलग करती है। यह final approval नहीं है।
Agents technical options और risks review कर सकते हैं; business/product choices silently assume
नहीं की जाएँगी।

## 1. Exact DTOs, status codes and error contract

इन चार APIs के request/response DTOs और HTTP status codes freeze करने हैं:

```text
POST /api/v1/resumes/upload
GET  /api/v1/resumes/:id/status
GET  /api/v1/resumes/:id/parsed-data
POST /api/v1/resumes/:id/confirm
```

Minimum error families: validation, authentication, ownership/not-found, conflict/stale revision,
not-ready, infected/failed scan, scanner unavailable and rate limited. Exact JSON envelope और
field names implementation से पहले तय होंगे।

## 1A. Binding decisions already frozen

These are constraints, not open alternatives:

- Decision-01 Controlled Hybrid access model; document/parsing reads in this scope use trusted
  `SystemClient` with NestJS ownership checks. `UserContextClient` remains separately injectable.
- Decision-02 SSE is only a live optimization; REST/database state is authoritative recovery.
- Private storage, NestJS validation/finalization, clean-only parsing and transactional outbox are
  frozen security direction.
- `candidate.profile.changed.v1.json` exists and must be used with `change_type` and
  `active_document_id`.
- `candidate.resume.parsed.v1.json` is a worker output contract, not a dispatcher input route.
- Same owner/session plus checksum reuses the existing document; no second scan is created.
- Application-only resumes do not automatically promote to canonical profile/library.
- Compensating cleanup event is required; only sweeper ownership/timing remains open.
- Upload handshake is frozen as NestJS-mediated multipart upload. The browser must not upload
  directly to Supabase Storage or call Supabase APIs; NestJS owns authorization, validation,
  scanning, storage write, metadata persistence and outbox creation.

Each decision below must be classified as `TECHNICAL`, `PRODUCT/BUSINESS`, `OPERATIONS` or
`NEEDS_USER_DECISION` in the final decision record.

## 1B. DTO/error review bindings

These technical corrections are now binding for the API catalog draft:

- Same-owner/session checksum reuse is a successful response (`reused=true`), not
  `DUPLICATE_RESUME` error; no second scan or outbox event is created.
- Unknown, not-owned and soft-deleted document reads use the same `404 NOT_FOUND` shape so
  ownership is not disclosed.
- Public status responses expose deterministic `stage` from both status tracks. Normal scan or
  parsing progress is not returned as an error from the status endpoint.
- `INFECTED_FILE` covers infected/quarantined content; `partial` parsing is not failure and must
  carry an explicit partial marker when returned.
- Error details are typed and sanitized; no raw `error_details`, storage paths, resume content,
  scanner internals, tokens or stack traces may be returned.
- `expected_profile_revision` is mandatory for confirm and stale revision returns `409`.
- New upload returns `201`; checksum reuse returns `200`.
- Public success/error envelopes use `schema_version: 1`. `error.details` is typed by error code:
  validation exposes safe field/reason pairs, rate limiting exposes retry seconds, stale revision
  exposes expected/current revision, and all other details remain sanitized/empty.
- Idempotency uses the `Idempotency-Key` header. Scope is authenticated user (or guest session),
  operation and document checksum. Same key plus same payload replays the original response; the
  same key plus a different payload returns `409 IDEMPOTENCY_CONFLICT`. Key retention and the
  persistence mechanism remain API-catalog/implementation decisions.
- Guest APIs use dedicated paths; registered-user resume endpoints will not accept guest-session
  semantics. Frozen catalog paths are:
  `POST /api/v1/guest-sessions`,
  `POST /api/v1/guest-sessions/:sessionId/resumes`,
  `GET /api/v1/guest/resumes/:documentId/status`,
  `GET /api/v1/guest/resumes/:documentId/parsed-data`,
  `POST /api/v1/guest/applications`, and
  `POST /api/v1/guest/claims`. Every guest request must enforce active, unexpired, unrevoked
  session ownership and the approved claim state machine.
- Parsed-data responses and confirm requests share one explicit normalized-field allowlist sourced
  from the canonical candidate tables. Raw extracted text, raw AI output, artifacts, storage paths
  and internal evidence are excluded by default. Sensitive profile fields require explicit product
  approval before inclusion; the field-by-field catalog is still pending.
- Rate limits are environment-configured, not hard-coded in DTOs: upload is strictest, status and
  parsed-data reads are more permissive for UI recovery, and confirm is idempotency-protected.
  Guest limits apply per session/IP. `429 RATE_LIMITED` returns `Retry-After` and
  `retry_after_seconds`; numeric values remain a load-test/operations decision.
- Active-profile selection follows PD-002 and the approved first-upload UX: the first profile
  resume is selected by default and the control is not user-unchecked for that first resume;
  later profile uploads expose an explicit candidate choice. A selected profile-library upload
  is rejected before storage write when 10 active library resumes already exist. Application-only
  uploads remain allowed separately, and no oldest resume is silently archived.
- The public status API exposes one deterministic `stage` derived from both status tracks, with
  security precedence: `UPLOADED`, `SECURITY_SCANNING`, `SECURITY_REJECTED`,
  `SECURITY_RETRYABLE_FAILURE`, `PARSING_QUEUED`, `PARSING_IN_PROGRESS`, `REVIEW_READY`,
  `REVIEW_READY_PARTIAL` and `PARSING_FAILED`. A non-clean scan can never be reported as
  parsed-ready; SSE only nudges the UI and REST status recovery remains authoritative.

The following remain `NEEDS_USER_DECISION` or API-catalog decisions: exact per-code details schemas,
idempotency scope/retention, parsed-data field-by-field allowlist and numeric rate limits. Guest
paths, active-profile default/10-resume timing and the two-track UI stage table are frozen above;
their DTO/header details belong to the API catalog.

## 2. Upload handshake — FROZEN

Security direction already fixed है: private storage, NestJS validation, no signed URL/token in
outbox/task payload. Only the client-to-storage handshake detail remains:

- Option A: browser multipart request → NestJS → private storage.
- Option B: NestJS authorizes short-lived private-storage upload → browser uploads → NestJS
  finalizes metadata/checksum and writes DB/outbox transaction.

Chosen flow:

```text
Next.js browser
  → multipart upload to NestJS
  → authentication/authorization, size/type/magic-bytes/checksum validation
  → private Supabase Storage write
  → metadata row (`security_scan_status=pending`) + outbox transaction
  → asynchronous ClamAV scan through the approved pipeline
```

Direct browser → Supabase Storage/API access is not allowed. The browser never receives a
service-role key or unrestricted storage token. Upload failure, retry and orphan cleanup remain
handled through the NestJS/storage workflow and the approved compensating cleanup event.

## 3. Rate limits

Numeric limits चाहिए for upload, status reads, parsed-data reads and confirm. Define:

- per authenticated user;
- per guest session/IP where applicable;
- burst/window algorithm;
- response/retry headers;
- whether status polling has a separate lower limit.

Do not invent numbers until product/capacity review supplies them.

## 4. SSE endpoint and recovery contract

Decision-02 already freezes SSE as live optimization and REST/DB as truth. Freeze:

- stream path and connection authentication/ticket mechanism;
- user-scoped event envelope;
- event ID/revision fields;
- reconnect backoff and jitter bounds;
- `Last-Event-ID` handling;
- REST recovery request after disconnect;
- no raw resume content or sensitive PII in events.

## 5. Guest upload and claim API surface — FROZEN PATHS

The dedicated paths are frozen in section 1B above. The API catalog still needs exact DTOs,
header/token transport and response/error details for each path.

Existing DB rules remain mandatory: active session, unexpired, not revoked, owner/session XOR,
service-only consume function and approved guest claim state machine.

## 6. Application-specific resume API

Profile-resume APIs must not absorb application-only behavior. Define a separate catalog entry for:

- job-specific resume upload/selection;
- `application_documents` link;
- immutable `application_profile_snapshots`;
- no canonical profile/library promotion;
- parsing behavior and whether application parsing is required.

## 7. Confirm writable-field allowlist

Map every confirm DTO field to a canonical table/column. Candidate input must not set:

- profile revision;
- provenance/source type;
- verification status/level;
- audit timestamps/actors;
- deleted/system fields;
- embedding/search projection fields.

Freeze unknown-field rejection and server-side normalization rules.

## 8. Idempotency and optimistic concurrency

Define:

- request header/key name;
- scope (`user + document` or another approved identity);
- retention period;
- same-key replay response;
- different-key duplicate behavior;
- expected profile revision field;
- stale revision response (`409 Conflict`);
- transaction rollback guarantees.

The existing `resume_parsing_jobs.idempotency_key` and `processed_events` patterns are references,
not automatic API DTO decisions.

## 9. Object cleanup ownership

The compensating cleanup event is an approved requirement. Still define:

- cleanup consumer/worker owner;
- retry/dead-letter behavior;
- orphan age threshold;
- `deleted_at`/retention interaction;
- storage deletion authorization;
- metrics and alerting.

Physical document deletion remains outside normal product flow.

## 10. Fast-track name extraction

`REQ-RESUME-007` is still `NEEDS_DECISION`. Decide whether first upload requires a lightweight
name extraction response before full parsing. If yes, define its contract and failure behavior;
if no, keep the full parse path only. Do not add an endpoint merely because the old requirement
mentions it.

## 11. Additional decisions found during review

### 11.1 Active profile selection (PRODUCT/API)

PD-002 requires the upload request to capture “Use as active profile resume”. Define the field,
default, guest behavior and selected/unselected projection consequences. Recommended field:
`use_as_active_profile_resume: boolean`; final default needs product confirmation.

### 11.2 Ten-resume library limit (PRODUCT/API)

PD-002 limits the active profile-resume library to 10 and requires candidate archive/remove before
adding another. Decide whether enforcement rejects at upload, re-checks at confirm, or both. Do not
silently archive the oldest resume without approval. Define the error code and UI recovery path.

### 11.3 Two-track status mapping (TECHNICAL/UX)

Define one deterministic UI `stage` from:

```text
security_scan_status + processing_status → UI stage/code
```

Infected, failed and quarantined scan states must take precedence and never appear parsed-ready.

### 11.4 Parsed-data field allowlist (PRIVACY/API)

Define which normalized review fields are exposed. Raw AI output, extracted text and artifacts are
not returned by default. The allowlist must map directly to the canonical confirm DTO.

### 11.5 Notification scope (PRODUCT/ASYNC)

Decide whether scan/parse completion in this stage writes `notifications` rows or uses SSE + REST
only. `notification.email.requested` remains a phased/unrouted event and must not be guessed into
this flow.

### 11.6 Requirement traceability (GOVERNANCE)

Map every API/decision to `REQ-RESUME-001..007`; retain `REQ-RESUME-007` as `NEEDS_DECISION` until
the fast-track product decision is made.

## Decision-record rule

हर item के लिए final record में ये fields होने चाहिए:

```text
Decision ID
Question
Options considered
Evidence/source
Chosen option
Reason
Security impact
Performance/cost impact
API/DB/contract impact
Acceptance test
Owner/date
```

**Current status: AGENT REVIEW READY — USER/BUSINESS DECISIONS STILL REQUIRED.**
