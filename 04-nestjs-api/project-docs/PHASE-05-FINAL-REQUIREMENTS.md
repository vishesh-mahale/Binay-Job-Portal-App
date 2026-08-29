# Phase 05 — NestJS API Final Requirements

Status: `FINAL REQUIREMENTS FROZEN — PHASE 6 API CATALOG IN PROGRESS — CODING NOT AUTHORIZED`

यह document NestJS API की current approved requirements का navigation/freeze candidate है।
Detailed requirement text और source citations हटाए नहीं गए हैं; वे linked authority documents में
रहेंगे। कोई future या unresolved item current scope में silently शामिल नहीं किया गया है।

## 1. Authority and traceability

Priority order:

1. `AGENTS.md`
2. approved ADRs and product decisions
3. executable database baseline `02-database/migrations/baseline/01–18`
4. `contracts/`
5. existing dispatcher/worker code and tests
6. supporting guides and reviews

Primary evidence:

- `PHASE-01-REQUIREMENTS-CONSOLIDATION.md`
- `PHASE-02-REQUIREMENTS-TRACEABILITY-MATRIX.md`
- `PHASE-03-GAP-CONFLICT-ANALYSIS.md`
- `PHASE-04-STATE-MACHINES-AND-TRANSACTIONS.md`
- `04-nestjs-api/s1/codex/STAGE-03-NESTJS-API-REQUIREMENTS-SYNC.md`
- `04-nestjs-api/s1/codex/STAGE-03-REMAINING-DECISIONS.md`
- `DECISION-01-NESTJS-SUPABASE-ACCESS-MODEL-HINGLISH.md`
- `DECISION-02-REALTIME-TRANSPORT-HINGLISH.md`

## 2. Current production scope

The API is a modular NestJS business layer for:

- identity and authenticated user operations;
- companies, memberships, departments, teams and ownership checks;
- candidate canonical profile and profile-fact updates;
- private resume/document upload, security-scan orchestration and parsing status;
- jobs, search and saved jobs;
- recruiter saved-candidates bookmarks (private per HR/employer and non-job-specific);
- applications, immutable snapshots and application-specific resumes;
- referrals, interviews, notifications and messaging according to the approved requirement IDs;
- outbox creation in the same database transaction as business writes;
- authenticated SSE status/notification delivery and REST recovery;
- trusted integration with dispatcher, Cloud Tasks and FastAPI worker.

The complete requirement-ID inventory remains in Phase 1/2. New endpoints must not be created
without mapping to an existing requirement ID or an explicitly approved decision record.

### Requirement-ID coverage index

| Area | Requirement IDs | Current treatment |
|---|---|---|
| Platform | `REQ-PLATFORM-001..008` | Current; measurable thresholds remain open |
| Auth/access/realtime | `REQ-AUTH-001..007` | Current; exact endpoint DTOs belong to Phase 6 |
| Companies | `REQ-COMPANY-001..005` | Current company/member scope |
| Candidate/onboarding | `REQ-ONBOARDING-001`, `REQ-CANDIDATE-001..006` | Current canonical profile scope |
| Resumes | `REQ-RESUME-001..007` | `001..006` current; `007` clarification |
| Jobs/search | `REQ-JOB-001..003`, `REQ-SEARCH-001..005` | Current direction; provider/threshold decisions tracked |
| Applications | `REQ-APPLICATION-001..007` | Current, including guest and immutable snapshots |
| Referrals | `REQ-REFERRAL-001..007` | Manual referral current; configurable program `007` gap |
| Interviews/messaging/notifications | `REQ-INTERVIEW-001..003`, `REQ-MESSAGE-001`, `REQ-NOTIFY-001..003`, `REQ-REALTIME-001` | Current direction; gaps tracked |
| Saved candidates | `REQ-SAVED-CANDIDATE-001` | Current/frozen policy; Phase 6 CRUD catalog |
| Analytics/feedback/subscription | `REQ-ANALYTICS-001`, `REQ-FEEDBACK-001`, `REQ-SUBSCRIPTION-001` | Planned/gap or future provider work |
| AI | `REQ-AI-001..004` | Planned/direction; provider decision open |
| API cross-cutting | `REQ-API-001..007` | Current API governance/security rules |

Detailed source text and status remain in Phase 1/2; no status is silently upgraded here.

## 3. Frozen cross-cutting rules

### Access model

- Controlled hybrid model is frozen.
- Browser calls NestJS only; it never uses Supabase service-role credentials or direct Supabase APIs.
- NestJS uses separate `UserContextClient` and `SystemClient` paths.
- Business writes and system/background work use the trusted server path with explicit NestJS
  authorization/ownership checks.
- Approved personal/catalog reads use `UserContextClient` with existing RLS SELECT policies;
  tables without an explicit grant/policy remain default-deny.
- `uploaded_documents`, `guest_upload_sessions`, `resume_parsing_jobs` and `resume_parsed_data` have no authenticated
  direct read path; reads use `SystemClient` plus NestJS ownership checks.

### Upload and parsing

- Browser uploads multipart data to NestJS; direct browser-to-Supabase Storage is prohibited.
- NestJS performs auth, guest/session ownership, size/type/extension/magic-byte/checksum validation.
- NestJS writes the private object, then commits document metadata and
  `security.scan.requested` in one trusted transaction.
- ClamAV/security scanning is asynchronous; upload response does not wait for a full scan.
- Only clean documents may enter parsing.
- Raw resume text, raw AI output, artifacts, storage paths, tokens and internal errors are not
  returned by default.
- Same owner/session plus checksum reuses the existing document without a second scan/event.
- Profile library limit is 10 active resumes; application-only documents are separate. Exact
  enforcement timing and user-facing error behavior remain catalog/implementation details.

### Transactions and async work

- Business row, audit/history and outbox event commit atomically.
- No Cloud Tasks, FastAPI, email or other external call occurs inside the open DB transaction.
- Dispatcher/worker processing is idempotent and uses approved event/task contracts.
- `trace_id` is propagated in event/task payloads; `request_id` is HTTP/log correlation only.

### Realtime

- SSE is the live optimization for status/notification updates.
- REST/database state remains authoritative after reconnect or missed events.
- WebSocket is reserved for the separately catalogued chat use case.
- Realtime payloads contain sanitized state/nudges, never resume content or secrets.

## 4. Resume API current scope

Registered paths:

```text
POST /api/v1/resumes/upload
GET  /api/v1/resumes/:id/status
GET  /api/v1/resumes/:id/parsed-data
POST /api/v1/resumes/:id/confirm
```

Guest paths:

```text
POST /api/v1/guest-sessions
POST /api/v1/guest-sessions/:sessionId/resumes
GET  /api/v1/guest/resumes/:documentId/status
GET  /api/v1/guest/resumes/:documentId/parsed-data
POST /api/v1/guest/applications
POST /api/v1/guest/claims
```

The exact endpoint DTOs, field-level validation and error details belong in Phase 6 API catalog.

## 5. Public response/error rules

Both success and error responses follow the proposed envelope direction; exact DTO fields and
per-code details remain subject to Phase 6 catalog freeze:

```json
{
  "success": true,
  "data": {},
  "request_id": "uuid",
  "trace_id": "uuid",
  "schema_version": 1
}
```

Error codes are machine-readable, typed and sanitized. The consolidated DTO review is the source
for the current vocabulary and status mapping. Same-owner checksum reuse is success (`200`);
new upload is `201`; stale revision is `409`; rate limit is `429`; dependency outage is `503`.

## 6. UI status contract

The status API derives one stage with security precedence:

```text
UPLOADED
SECURITY_SCANNING
SECURITY_REJECTED
SECURITY_RETRYABLE_FAILURE
PARSING_QUEUED
PARSING_IN_PROGRESS
REVIEW_READY
REVIEW_READY_PARTIAL
PARSING_FAILED
```

SSE only notifies the UI that state may have changed; the UI refetches the authoritative REST
status after connection/reconnect.

Derivation is deterministic: scan `pending`/`scanning` map to upload/scanning; `infected`/
`quarantined` map to rejected; scan `failed` maps to retryable failure; only clean documents may
use parsing status. Parsing `queued` maps to queued, `processing`, `parsed` and `ai_enriching` map
to in-progress until the final `completed` state, `completed` maps to review-ready, `partial` maps
to review-ready-partial and terminal `failed` maps to parsing-failed.

## 7. Canonical profile confirmation

- Parsed data is review input, not an automatic canonical overwrite.
- Confirm accepts only an explicit allowlist of canonical writable fields.
- System/provenance/verification/revision/audit/embedding fields are server-controlled.
- `expected_profile_revision` is mandatory and stale updates return `409 STALE_REVISION`.
- A successful logical save updates canonical facts, history, revision and approved outbox event
  atomically.
- Application-only resumes write application links/snapshots and do not promote into canonical
  profile or recruiter search.

## 8. Explicitly excluded or future scope

- Future email delivery and unapproved notification event routes.
- Unresolved fast-track name extraction.
- Phase-3 gaps `GAP-003..015` remain individually classified as phased/open; configurable referral
  programs (`GAP-005` / `REQ-REFERRAL-007`) require a separate product/API decision.
- The approved compensating document-cleanup event remains a phased gap until its contract,
  sweeper owner, retention threshold and retry/dead-letter policy are catalogued; no silent orphan
  cleanup behavior is assumed.
- Exact chat/message API catalog details.
- Any event/route not present in the approved contracts/dispatcher registry.
- Silent schema changes, invented tables/columns or direct browser database access.

## 9. Remaining blockers before `FINAL FREEZE`

These are not silently decided in this document:

1. Exact field-level DTOs and per-code `error.details` schemas.
2. Idempotency key retention and persistence mechanism.
3. Parsed-data/confirm field-by-field allowlist, including sensitive-field policy.
4. Numeric rate-limit values per environment and operation.
5. Exact guest token/header transport details.
6. Final application-specific resume DTOs and parsing behavior.
7. Full API catalog coverage for all requirement IDs, including interviews, referrals, messaging,
   notifications and saved candidates.
8. Requirement-by-requirement review of Phase-3 gaps/conflicts and Phase-4 state transitions.

## 9A. Async event and dispatcher coverage

Current registered dispatcher input routes are:

```text
resume.parse.requested              → ai-heavy-queue
candidate.profile.changed           → projection-queue
job.ai.enrichment.requested         → ai-heavy-queue
match.analyze.requested             → ai-heavy-queue
interview.summary.requested         → ai-heavy-queue
job.screening_questions.requested   → ai-heavy-queue
security.scan.requested             → security-scan-queue
```

`application.status.changed` is emitted by the approved application status function but currently
has no contract file or dispatcher route; it is an expected phased gap (contract creation is
required before dispatcher registration), not an invented route. Output events such
as `candidate.projection.rebuilt` and `candidate.resume.parsed` are worker outputs, not dispatcher
inputs. `notification.email.requested` remains an unresolved phased route (`GAP-015`).

The compensating document-cleanup event is also an approved phased gap: its contract and consumer
owner are not present in the current dispatcher registry and must be assigned before production
cleanup automation is enabled.

### DB-write ownership boundary

| Write family | Owning layer |
|---|---|
| Users, auth, profiles, companies, jobs, applications, referrals, interviews, messages and in-app notifications | NestJS domain command/module through trusted SystemClient |
| Document metadata and upload finalization | NestJS resume/document module |
| Security status, parsing results, worker projections and `processed_events` | FastAPI worker through approved worker transactions/contracts |
| Outbox claim/publish/failure/lease functions | Outbox Dispatcher through approved database functions |
| Orphan cleanup/deletion | Approved cleanup worker/sweeper, never browser or ad-hoc SQL |

Phase 6 must expand this boundary to table/function-level ownership for every catalogued use case.

## 10. Exit criteria

Phase 5 freeze gate is satisfied because:

- every required requirement ID has a source and owner;
- every DB write has a NestJS/system owner, or an explicitly assigned Phase 6/7 ownership record;
- every async event has an existing contract and consumer or an explicit phased-gap record;
- security/RLS/ownership and negative behavior are documented;
- the remaining catalog details are explicitly assigned to Phase 6 without hiding a conflict;
- an independent agent verifies this document against Phase 1–4 and the executable baseline.

Phase 5 is frozen. Coding remains unauthorized until Phase 6 API catalog, Phase 7 architecture,
Phase 8 implementation plan and their independent reviews are complete.
