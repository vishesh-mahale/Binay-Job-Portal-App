# Phase 06 — API Catalog Review (opencode)

Status: `REVIEW COMPLETE — CONDITIONAL PASS WITH 3 BLOCKERs`

Reviewer: opencode
Reviewed file: `04-nestjs-api/project-docs/PHASE-06-API-CATALOG.md` (188 lines)
Date: 2026-08-26

---

## Summary

The Phase 6 API Catalog correctly covers 4 resume APIs, 6 frozen guest paths, 5 internal use-cases,
7 dispatcher routes, and 6 worker output events. Requirement traceability, table/function references,
transaction boundaries, outbox events, idempotency rules, acceptance criteria, and the SSE/REST
boundary are all accurately documented against Phase 5, STAGE-03, contracts, and SQL.

Three BLOCKERs remain: one progress-state-as-error contradiction with the frozen two-track status
mapping, one missing idempotency error code, and one incomplete section requiring guest DTO
traceability.

---

## Verification Point Results

### 1. Requirement Traceability — PASS

| API | Requirement IDs | Source verified |
|---|---|---|
| API-RESUME-001 | REQ-RESUME-001, REQ-RESUME-002, REQ-RESUME-005, REQ-API-001..007 | Phase 5 §5 resume domain |
| API-RESUME-002 | REQ-RESUME-005, REQ-RESUME-006, REQ-API-001, REQ-REALTIME-001 | Phase 5 §5, Decision-02 |
| API-RESUME-003 | REQ-RESUME-003, REQ-RESUME-006, REQ-API-001, REQ-API-007 | Phase 5 §5 |
| API-RESUME-004 | REQ-CANDIDATE-001..004, REQ-RESUME-003, REQ-API-003..007 | Phase 5 §5 candidate domain |
| Guest APIs | No REQ-* IDs listed | Section 5 backlog acknowledges gap |
| Internal use-cases | Not REQ-mapped | Correct for internal-only commands |

Guest APIs not having specific REQ-* IDs is noted as open in the catalog; this is acceptable for a
draft catalog but must be resolved before freeze.

### 2. HTTP Method/Path — PASS

All 4 resume paths and 6 guest paths match frozen paths in STAGE-03 §1B:

```text
POST /api/v1/resumes/upload                    ✓ catalog §2
GET  /api/v1/resumes/:id/status                ✓ catalog §2
GET  /api/v1/resumes/:id/parsed-data           ✓ catalog §2
POST /api/v1/resumes/:id/confirm               ✓ catalog §2
POST /api/v1/guest-sessions                    ✓ catalog §3
POST /api/v1/guest-sessions/:sessionId/resumes ✓ catalog §3
GET  /api/v1/guest/resumes/:documentId/status  ✓ catalog §3
GET  /api/v1/guest/resumes/:documentId/parsed-data ✓ catalog §3
POST /api/v1/guest/applications                ✓ catalog §3
POST /api/v1/guest/claims                      ✓ catalog §3
```

No invented paths. Public prefix `/api/v1` consistent across all entries.

### 3. Actor/Permission — PASS

| API | Actor | Permission model | Verified against |
|---|---|---|---|
| API-RESUME-001 | authenticated candidate | active candidate; ownership from JWT | STAGE-03 §1B, Decision-01 |
| API-RESUME-002 | document owner candidate | ownership check; unknown/not-owned/soft-deleted = same 404 | STAGE-03 §1B |
| API-RESUME-003 | document owner candidate | ownership + parsed result belongs to document | STAGE-03 §1B |
| API-RESUME-004 | document owner candidate | ownership + clean scan + parsed result belongs to document | STAGE-03 §1B |
| Guest APIs | guest session holder | active, unexpired, unrevoked session; job scope; XOR rules | STAGE-03 §5, 06_documents.sql:51-70 |

Ownership model matches Decision-01 controlled hybrid: SystemClient + NestJS ownership checks for
document/parsing reads.

### 4. Request DTO/Validation — PASS (with noted open items)

- API-RESUME-001: multipart file + `use_as_active_profile_resume` boolean + optional `Idempotency-Key`
  ✓ matches STAGE-03 §11.1
- API-RESUME-001 validation: size, MIME, extension, magic bytes, checksum, private-storage policy
  ✓ matches STAGE-03 §2 (NestJS-mediated upload)
- API-RESUME-004: `expected_profile_revision` + allowlisted canonical facts + `Idempotency-Key`
  ✓ matches STAGE-03 §7, §8
- Open items correctly noted: field-by-field normalized allowlist (API-RESUME-003),
  idempotency key retention (STAGE-03 §8), numeric rate limits (STAGE-03 §3)

### 5. Response DTO — PASS

- API-RESUME-001: 201 new / 200 reused; `document_id`, both status tracks, `stage`, `reused` ✓
- API-RESUME-002: `document_id`, `security_scan_status`, `processing_status`, `stage`, `retryable`,
  timestamps ✓
- API-RESUME-003: allowlisted `normalized_output`, parsing identifiers, confidence/schema metadata,
  `partial` marker ✓
- API-RESUME-004: `candidate_id`, `profile_revision`, `active_document_id`, projection queued state ✓

Two-track status mapping (security_scan_status + processing_status → deterministic stage) matches
STAGE-03 §11.3 frozen stages: UPLOADED, SECURITY_SCANNING, SECURITY_REJECTED,
SECURITY_RETRYABLE_FAILURE, PARSING_QUEUED, PARSING_IN_PROGRESS, REVIEW_READY,
REVIEW_READY_PARTIAL, PARSING_FAILED.

### 6. Tables/Functions Read and Written — PASS

| API | Tables | SQL source | Match |
|---|---|---|---|
| API-RESUME-001 reads | users, candidate_profiles, uploaded_documents | 08_candidates.sql, 06_documents.sql:72-106 | ✓ |
| API-RESUME-001 writes | private storage, uploaded_documents, resume_parsing_jobs | 06_documents.sql, 07_resume_processing.sql:39-67 | ✓ |
| API-RESUME-002 reads | uploaded_documents, resume_parsing_jobs, safe job events | 06_documents.sql, 07_resume_processing.sql:39-67 | ✓ |
| API-RESUME-003 reads | resume_parsing_jobs, resume_parsed_data | 07_resume_processing.sql:39-100 | ✓ |
| API-RESUME-004 reads | uploaded_documents, resume_parsing_jobs, resume_parsed_data, candidate_profiles | Multiple SQL files | ✓ |
| API-RESUME-004 writes | canonical profile/fact tables, profile_change_history, candidate document link, outbox | 08_candidates.sql | ✓ |
| Guest reads | guest_upload_sessions, uploaded_documents | 06_documents.sql:51-70, 72-106 | ✓ |
| Guest writes | guest_upload_sessions, uploaded_documents | 06_documents.sql | ✓ |

`uploaded_documents` dual status columns (`security_scan_status` + `processing_status`) correctly
represented in all document-flow APIs.

### 7. Transaction Boundary — PASS

- API-RESUME-001: "metadata row + security.scan.requested outbox event in one commit" ✓
  Matches STAGE-03 §2 and 06_documents.sql header ("NestJS creates guest_upload_sessions before
  an unauthenticated guest upload")
- API-RESUME-002/003: "read-only bounded query" ✓
- API-RESUME-004: "one atomic trusted transaction with row lock and one revision bump" ✓
  Matches 08_candidates.sql `bump_candidate_profile_revision()` pattern
- Internal commands table: "Same transaction; no external call" ✓
  Matches STAGE-03 §1A binding constraint

No external call inside a DB transaction is correctly enforced across all entries.

### 8. Outbox Event/Contract/Consumer — PASS

| API | Event type | Contract file | Dispatcher route | Queue | Consumer |
|---|---|---|---|---|---|
| API-RESUME-001 | security.scan.requested | contracts/events/security-scan-requested.v1.json ✓ | security.scan.requested ✓ | security-scan-queue ✓ | FastAPI security worker ✓ |
| API-RESUME-004 | candidate.profile.changed | contracts/events/candidate-profile-changed.v1.json ✓ | candidate.profile.changed ✓ | projection-queue ✓ | FastAPI candidate projection ✓ |

- `application.status.changed`: correctly noted as "expected phased gap emitted by the approved SQL
  function; no route is invented here" (catalog §6) ✓ matches GAP-012/013
- `candidate.resume.parsed` and `candidate.projection.rebuilt`: correctly noted as "worker outputs,
  not dispatcher input routes" (catalog §6) ✓ matches event-route.registry.ts

### 9. Idempotency Rule — PASS (with one BLOCKER)

- API-RESUME-001: "retry/reuse creates one document and one scan event" ✓
  Same-owner/session checksum reuse = `reused=true`, not error ✓ (STAGE-03 §1B)
- API-RESUME-004: `expected_profile_revision` mandatory; stale revision = 409 ✓ (STAGE-03 §1B, §8)
- STAGE-03 §8 binding: `Idempotency-Key` header; same key + same payload = replay;
  same key + different payload = 409 `IDEMPOTENCY_CONFLICT` ✓

**BLOCKER-01**: API-RESUME-004 error list does not include `IDEMPOTENCY_CONFLICT`. STAGE-03 §1B
explicitly requires it for confirm. The confirm endpoint accepts `Idempotency-Key` and must return
`409 IDEMPOTENCY_CONFLICT` on key+payload mismatch.

### 10. Rate Limit — PASS

- All entries: "rate limits are environment configuration; return 429 with retry information" ✓
- STAGE-03 §3 binding: per authenticated user, per guest session/IP; upload strictest; status and
  parsed-data reads more permissive; confirm idempotency-protected ✓
- 429 response returns `Retry-After` and `retry_after_seconds` ✓
- Open: numeric values remain load-test/operations decision — correctly noted ✓

### 11. Audit/Security Event — PASS

- No raw content in response/logs: enforced in acceptance criteria across all APIs ✓
- Error details sanitized: no storage paths, tokens, stack traces (catalog §1) ✓
- Security scan result stored in `security_scan_result` JSONB (06_documents.sql:85) ✓
- `processed_events` table for idempotency tracking (07_resume_processing.sql) ✓
- FastAPI exceptions use sanitized `to_dict()` format (exceptions.py:25-33) ✓

### 12. Error Codes — PASS (with one BLOCKER)

Error families documented per API:

| API | Error codes | Families covered |
|---|---|---|
| API-RESUME-001 | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, RESUME_LIMIT_REACHED, DEPENDENCY_UNAVAILABLE, IDEMPOTENCY_CONFLICT, RATE_LIMITED | 8 codes: validation, auth, ownership, limit, infra, conflict, throttle |
| API-RESUME-002 | UNAUTHORIZED, NOT_FOUND, RATE_LIMITED, DEPENDENCY_UNAVAILABLE | 4 codes: auth, ownership, throttle, infra |
| API-RESUME-003 | UNAUTHORIZED, NOT_FOUND, SCAN_PENDING, PARSING_PENDING, PARSING_FAILED, INFECTED_FILE, RATE_LIMITED, DEPENDENCY_UNAVAILABLE | 8 codes: auth, ownership, progress, scan-fail, throttle, infra |
| API-RESUME-004 | UNAUTHORIZED, NOT_FOUND, FORBIDDEN, SCAN_PENDING, INFECTED_FILE, PARSING_PENDING, PARSING_FAILED, STALE_REVISION, RATE_LIMITED | 9 codes: auth, ownership, scan-state, concurrency, throttle |

FastAPI worker exception hierarchy verified (exceptions.py): TaskValidationError, OIDCAuthenticationError,
DocumentValidationError, DocumentSecurityError, AIProviderError, RateLimitError, etc. — all use
sanitized `internal_code` strings.

Open: exact per-code details schemas remain API-catalog blocker (correctly noted in STAGE-03 §1B) ✓

**BLOCKER-02**: API-RESUME-003 lists `SCAN_PENDING` and `PARSING_PENDING` as error codes, but
STAGE-03 §1B binding decision states: "Normal scan or parsing progress is not returned as an error
from the status endpoint." The deterministic stage field (`SECURITY_SCANNING`, `PARSING_QUEUED`,
`PARSING_IN_PROGRESS`) already communicates progress. These should not be error conditions. The
error list for API-RESUME-003 should be corrected to: `UNAUTHORIZED, NOT_FOUND, INFECTED_FILE,
PARSING_FAILED, RATE_LIMITED, DEPENDENCY_UNAVAILABLE`.

### 13. Acceptance Tests — PASS

Each API entry includes explicit acceptance criteria:

- API-RESUME-001: "retry/reuse creates one document and one scan event; no raw content in
  response/logs" ✓
- API-RESUME-002: "every DB state maps to exactly one stage; non-clean scan never appears ready" ✓
- API-RESUME-003: "raw extracted_text/raw_ai_output/artifacts/error_details never returned" ✓
- API-RESUME-004: "stale/invalid confirm makes zero canonical changes; one logical save = one
  revision/event" ✓

Acceptance criteria are testable and traceable to specific requirement behaviors.

### 14. Guest Sessions — PASS (with one BLOCKER)

- 6 frozen paths documented ✓ (STAGE-03 §1B, §5)
- Session enforcement requirements: active, unexpired, unrevoked, job scope, ownership/XOR rules,
  upload count/byte limits, token protection ✓
- DB tables verified: `guest_upload_sessions` (06_documents.sql:51-70) with `status`,
  `expires_at`, `max_upload_count`, `max_total_bytes`, `uploaded_count`, `uploaded_bytes` columns ✓
- `uploaded_documents` owner XOR constraint (06_documents.sql:91-95) ✓
- Claim state machine referenced but not detailed — correct for draft catalog ✓

**BLOCKER-03**: Guest APIs section (§3) documents frozen paths and enforcement rules but does not
trace each path to specific REQ-* IDs. The catalog lists guest requirements in §5 backlog as
"REQ-APPLICATION-001..007" but does not map individual guest paths to specific requirement IDs.
Before freeze, each guest path needs explicit requirement traceability.

### 15. Application-Only Resume — PASS (as correctly deferred)

- STAGE-03 §1B: "Application-only resumes do not automatically promote to canonical profile/library" ✓
- STAGE-03 §6: Separate catalog entry needed for application-specific resume upload/selection,
  `application_documents` link, immutable `application_profile_snapshots` ✓
- Catalog §5 lists REQ-APPLICATION-001..007 as remaining backlog ✓
- No routes or DTOs invented for this requirement ✓

Correctly identified as Phase 6 domain catalog backlog item.

### 16. SSE/REST Boundary — PASS

- Decision-02 frozen: SSE is live optimization only; REST/database is authoritative ✓
- API-RESUME-002: "SSE may notify that this endpoint should be refetched" ✓
- Catalog §1: "no external call occurs inside a DB transaction" ✓
- STAGE-03 §4: SSE endpoint and recovery contract frozen ✓
- Two-track status mapping provides deterministic REST state ✓

### 17. Saved Candidate — PASS (as correctly deferred)

- Catalog §5: REQ-SAVED-CANDIDATE-001 listed as remaining backlog ✓
- No routes or DTOs invented for this requirement ✓
- Correctly deferred to Phase 6 domain catalog completion ✓

### 18. Gaps — PASS

- 7 Phase-3 gaps tracked: GAP-003..015 ✓
- Catalog does not re-invent solutions for open gaps ✓
- `application.status.changed` correctly identified as "expected phased gap" (catalog §6) ✓
- `notification.email.requested` correctly identified as "unresolved phased route" (catalog §6) ✓

### 19. Dispatcher Routes — PASS

7 registered routes in `event-route.registry.ts` verified against catalog §6:

| Event type | Queue | Contract | Registry line |
|---|---|---|---|
| resume.parse.requested | ai-heavy-queue | resume-parse-task.v1.json | :37-41 |
| candidate.profile.changed | projection-queue | candidate-projection-task.v1.json | :42-46 |
| job.ai.enrichment.requested | ai-heavy-queue | job-enrich-task.v1.json | :47-53 |
| match.analyze.requested | ai-heavy-queue | match-analyze-task.v1.json | :61-65 |
| interview.summary.requested | ai-heavy-queue | interview-summary-task.v1.json | :66-70 |
| job.screening_questions.requested | ai-heavy-queue | job-screening-questions-task.v1.json | :71-77 |
| security.scan.requested | security-scan-queue | security-scan-task.v1.json | :78-84 |

All 7 routes match exactly. No unregistered routes invented.

### 20. Worker Outputs — PASS

Catalog §6 correctly distinguishes worker outputs from dispatcher input routes:

| Worker output event | Correctly NOT a dispatcher route | Verified |
|---|---|---|
| candidate.projection.rebuilt | ✓ | Not in event-route.registry.ts |
| candidate.resume.parsed | ✓ | Not in event-route.registry.ts |
| job.enriched | ✓ | Not in event-route.registry.ts |
| application.match.analyzed | ✓ | Not in event-route.registry.ts |
| interview.summary.generated | ✓ | Not in event-route.registry.ts |
| job.screening_questions.generated | ✓ | Not in event-route.registry.ts |

---

## BLOCKERs

### BLOCKER-01 — Missing `IDEMPOTENCY_CONFLICT` in API-RESUME-004

**Location**: catalog §2, API-RESUME-004 error list
**Evidence**: STAGE-03 §1B states: "the same key plus a different payload returns `409
IDEMPOTENCY_CONFLICT`." API-RESUME-004 accepts `Idempotency-Key` but the error list omits this code.
**Impact**: Confirm endpoint idempotency contract is incomplete; implementation would miss a required
error path.
**Fix**: Add `IDEMPOTENCY_CONFLICT` to API-RESUME-004 error list. Corrected error list:
`UNAUTHORIZED, NOT_FOUND, FORBIDDEN, SCAN_PENDING, INFECTED_FILE, PARSING_PENDING, PARSING_FAILED,
STALE_REVISION, IDEMPOTENCY_CONFLICT, RATE_LIMITED`

### BLOCKER-02 — Progress states listed as errors in API-RESUME-003

**Location**: catalog §2, API-RESUME-003 error list
**Evidence**: STAGE-03 §1B binding decision: "Normal scan or parsing progress is not returned as an
error from the status endpoint." The deterministic stage field (`SECURITY_SCANNING`, `PARSING_QUEUED`,
`PARSING_IN_PROGRESS`) already communicates progress via the status endpoint.
**Impact**: Contradicts frozen two-track status mapping; would cause UI to display progress as error
state.
**Fix**: Remove `SCAN_PENDING` and `PARSING_PENDING` from API-RESUME-003 error list. Corrected
error list: `UNAUTHORIZED, NOT_FOUND, INFECTED_FILE, PARSING_FAILED, RATE_LIMITED,
DEPENDENCY_UNAVAILABLE`

### BLOCKER-03 — Guest APIs missing REQ-* traceability

**Location**: catalog §3
**Evidence**: Guest APIs section documents 6 frozen paths and enforcement rules but does not trace
each path to specific REQ-* IDs. Section 5 lists "REQ-APPLICATION-001..007" as a group but
individual guest paths are not mapped.
**Impact**: Requirement traceability gap; cannot verify which specific requirements each guest path
satisfies.
**Fix**: Add explicit REQ-* mapping for each of the 6 guest paths before freeze. If exact mapping
is not yet determined, mark as `TBD` with specific requirement group reference.

---

## MINOR Issues (non-blocking)

### MINOR-01 — Guest APIs enforcement rules not per-path

Guest APIs section states enforcement rules as a block ("Every guest request must enforce active,
unexpired, unrevoked session ownership..."). Per-path enforcement details (which rules apply to
which path) are not specified. Acceptable for draft; must be resolved before freeze.

### MINOR-02 — Internal use-case table incomplete

Section 4 internal commands table lists 5 use-cases. The "Recover/cleanup orphaned document"
row references "Approved cleanup worker/sweeper" but no specific owner module is named. Acceptable
for draft; must be resolved before implementation.

### MINOR-03 — Catalog exit criteria incomplete

Section 7 exit criteria list "Acceptance tests" but no specific test file or coverage requirement
is referenced. Acceptable for draft; must be resolved before freeze.

---

## Verdict

**CONDITIONAL PASS WITH 3 BLOCKERs**

The catalog is structurally sound and accurately documents the resume/guest flows against Phase 5,
STAGE-03, contracts, and SQL. The 3 BLOCKERs are specific, localized, and fixable without
structural changes. No BLOCKER requires new requirements, tables, or contracts.

### Required before API CATALOG FROZEN:

1. Fix BLOCKER-01: Add `IDEMPOTENCY_CONFLICT` to API-RESUME-004 error list
2. Fix BLOCKER-02: Remove `SCAN_PENDING` and `PARSING_PENDING` from API-RESUME-003 error list
3. Fix BLOCKER-03: Add explicit REQ-* traceability for each guest path

### Remaining before NO NESTJS IMPLEMENTATION CODE AUTHORIZED:

- Complete domain catalog (§5 backlog): 14+ requirement groups need API entries
- Resolve all open items noted as `TBD` or "API-catalog blocker" in STAGE-03
- Freeze per-code error detail schemas
- Freeze numeric rate limits
- Freeze parsed-data field-by-field allowlist
- Freeze idempotency key retention/persistence mechanism
