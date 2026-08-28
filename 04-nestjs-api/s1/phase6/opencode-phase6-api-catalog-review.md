# Phase 06 — Independent API Catalog Review

Status: `REVIEW COMPLETE`

Reviewer: opencode (Senior NestJS API, PostgreSQL/RLS, Security, Distributed Systems)
Reviewed file: `04-nestjs-api/PHASE-06-API-CATALOG.md` (188 lines)
Date: 2026-08-26

---

## Source documents cross-checked

| Source | File | Lines read |
|---|---|---|
| AGENTS.md | `AGENTS.md` | full |
| Phase 5 Final Requirements | `PHASE-05-FINAL-REQUIREMENTS.md` | 266 |
| Phase 1 Consolidation | `PHASE-01-REQUIREMENTS-CONSOLIDATION.md` | 228 |
| Phase 2 Traceability Matrix | `PHASE-02-REQUIREMENTS-TRACEABILITY-MATRIX.md` | 228 |
| Phase 3 Gap/Conflict | `PHASE-03-GAP-CONFLICT-ANALYSIS.md` | 259 |
| Phase 4 State Machines | `PHASE-04-STATE-MACHINES-AND-TRANSACTIONS.md` | 239 |
| Decision-01 | `DECISION-01-NESTJS-SUPABASE-ACCESS-MODEL-HINGLISH.md` | 178 |
| Decision-02 | `DECISION-02-REALTIME-TRANSPORT-HINGLISH.md` | 87 |
| STAGE-03 Remaining Decisions | `STAGE-03-REMAINING-DECISIONS.md` | 275 |
| SQL 02_enums | `02_enums.sql` | 583 |
| SQL 06_documents | `06_documents.sql` | 146 |
| SQL 07_resume_processing | `07_resume_processing.sql` | 162 |
| SQL 09_applications | `09_applications.sql` | 259 |
| SQL 17_rls | `17_rls.sql` | 250 |
| Dispatcher registry | `event-route.registry.ts` | 107 |
| FastAPI task_handlers | `task_handlers.py` | 1074 |
| FastAPI exceptions | `exceptions.py` | 235 |
| FastAPI task schemas | `tasks.py` | 61 |
| Event contracts (7) | `contracts/events/*.json` | all |
| Task contracts (7) | `contracts/tasks/*.json` | all |

---

## 20-POINT VERIFICATION

---

### 1. Requirement-ID traceability

| API | Claimed REQ IDs | Source verified | Match |
|---|---|---|---|
| API-RESUME-001 | REQ-RESUME-001, REQ-RESUME-002, REQ-RESUME-005, REQ-API-001..007 | Phase 1 §5, §12 | PASS |
| API-RESUME-002 | REQ-RESUME-005, REQ-RESUME-006, REQ-API-001, REQ-REALTIME-001 | Phase 1 §5, §9 | PASS |
| API-RESUME-003 | REQ-RESUME-003, REQ-RESUME-006, REQ-API-001, REQ-API-007 | Phase 1 §5, §12 | PASS |
| API-RESUME-004 | REQ-CANDIDATE-001..004, REQ-RESUME-003, REQ-API-003..007 | Phase 1 §4, §5, §12 | PASS |
| Guest APIs | No REQ-* IDs listed | Phase 1 §7: REQ-APPLICATION-003, REQ-APPLICATION-004 | MINOR |
| Backlog (§5) | REQ-AUTH-001..007 through REQ-FEEDBACK-001 | Phase 1 §1–§12 | PASS |

**Verdict: PASS**

Guest APIs lack per-path REQ-* traceability (noted in catalog §3 as open). This is non-blocking for a draft catalog but must be resolved before freeze. No invented requirement IDs found.

---

### 2. Method/path accuracy

Frozen paths verified against STAGE-03 §1B (lines 70–77) and Phase 5 §4 (lines 114–132):

```text
POST /api/v1/resumes/upload                    ✓ STAGE-03 §1B, Phase 5 §4
GET  /api/v1/resumes/:id/status                ✓ STAGE-03 §1B, Phase 5 §4
GET  /api/v1/resumes/:id/parsed-data           ✓ STAGE-03 §1B, Phase 5 §4
POST /api/v1/resumes/:id/confirm               ✓ STAGE-03 §1B, Phase 5 §4
POST /api/v1/guest-sessions                    ✓ STAGE-03 §1B (line 71), Phase 5 §4
POST /api/v1/guest-sessions/:sessionId/resumes ✓ STAGE-03 §1B (line 72), Phase 5 §4
GET  /api/v1/guest/resumes/:documentId/status  ✓ STAGE-03 §1B (line 73), Phase 5 §4
GET  /api/v1/guest/resumes/:documentId/parsed-data ✓ STAGE-03 §1B (line 74), Phase 5 §4
POST /api/v1/guest/applications                ✓ STAGE-03 §1B (line 75), Phase 5 §4
POST /api/v1/guest/claims                      ✓ STAGE-03 §1B (line 76), Phase 5 §4
```

Public prefix `/api/v1` consistent. No invented paths. No browser-to-Supabase paths.

**Verdict: PASS**

---

### 3. Actor, role, tenant and ownership checks

| API | Catalog actor | Catalog permission | Decision-01/RLS verified |
|---|---|---|---|
| API-RESUME-001 | authenticated candidate | active candidate; ownership from JWT | 17_rls.sql:182 `candidate_profiles_own_read` + STAGE-03 §1B |
| API-RESUME-002 | document owner candidate | ownership check; unknown/not-owned/soft-deleted = same 404 | STAGE-03 §1B (line 52) |
| API-RESUME-003 | document owner candidate | ownership + parsed result belongs to document | STAGE-03 §1B |
| API-RESUME-004 | document owner candidate | ownership + clean scan + parsed result | STAGE-03 §1B |
| Guest APIs | guest session holder | active, unexpired, unrevoked session; job scope; XOR rules | 06_documents.sql:51–70, 91–95 (owner XOR constraint) |

RLS verification: 17_rls.sql:152 revokes ALL from anon/authenticated. 17_rls.sql:162–176 grants SELECT only on specific personal/catalog tables. No DML grants. Business writes go through trusted SystemClient (Decision-01 §6). Service-only functions `consume_guest_upload_session` and `change_application_status` are REVOKE'd from PUBLIC/anon/authenticated (17_rls.sql:234–237).

**Verdict: PASS**

---

### 4. UserContextClient vs SystemClient

Catalog §1: "User-facing personal/catalog reads use `UserContextClient` + approved RLS where available. Document/parsing reads and all business writes use trusted `SystemClient`."

Phase 5 §3: "Approved personal/catalog reads use `UserContextClient` with existing RLS SELECT policies; tables without an explicit grant/policy remain default-deny."

Phase 5 §3: "`uploaded_documents`, `guest_upload_sessions`, `resume_parsing_jobs` and `resume_parsed_data` have no authenticated direct read path; reads use `SystemClient` plus NestJS ownership checks."

Decision-01 §6: "Personal read where an explicit RLS SELECT policy exists: Next.js JWT -> NestJS user-context read -> authenticated RLS path. Business read/write: Next.js JWT -> NestJS auth -> server-only trusted database path."

The catalog correctly distinguishes the two client paths for each API:
- API-RESUME-001 writes: SystemClient (trusted transaction + outbox)
- API-RESUME-002 reads: SystemClient (document/parsing reads via ownership checks)
- API-RESUME-003 reads: SystemClient (parsing reads via ownership checks)
- API-RESUME-004 writes: SystemClient (canonical profile update)

**Verdict: PASS**

---

### 5. DTO validation against real schema/contracts

**API-RESUME-001 request:** multipart file + `use_as_active_profile_resume` boolean + optional `Idempotency-Key`
- `use_as_active_profile_resume`: STAGE-03 §11.1 (line 222) recommends this field; final default needs product confirmation. Catalog correctly marks it as a request field.
- Validation: size, MIME, extension, magic bytes, checksum, private-storage policy — matches STAGE-03 §2 (lines 102–124) and 06_documents.sql columns (`file_size_bytes`, `mime_type`, `file_extension`, `checksum_sha256`).

**API-RESUME-001 response:** 201 new / 200 reused; `document_id`, both status tracks, `stage`, `reused`
- STAGE-03 §1B (line 61): "New upload returns 201; checksum reuse returns 200." ✓
- Both status tracks: `security_scan_status` (06_documents.sql:84) + `processing_status` (06_documents.sql:86) ✓
- `stage`: deterministic from two-track mapping (STAGE-03 §11.3, Phase 5 §6) ✓
- `reused`: matches STAGE-03 §1B (line 50) — checksum reuse is `reused=true`, not error ✓

**API-RESUME-002 response:** `document_id`, `security_scan_status`, `processing_status`, `stage`, `retryable`, timestamps
- All fields map to `uploaded_documents` columns (06_documents.sql:72–106) and parsing job timestamps (07_resume_processing.sql:39–67). ✓

**API-RESUME-003 response:** allowlisted `normalized_output`, parsing identifiers, confidence/schema metadata, `partial`
- `normalized_output`: 07_resume_processing.sql:75 (`normalized_output JSONB`)
- `confidence_details`: 07_resume_processing.sql:77
- `overall_confidence`: 07_resume_processing.sql:78
- `partial`: Phase 5 §6 (line 178) — "partial maps to review-ready-partial"; STAGE-03 §1B (line 57) — "partial parsing is not failure and must carry an explicit partial marker"
- Open: field-by-field allowlist — correctly noted as API-catalog blocker (line 79)

**API-RESUME-004 request:** `expected_profile_revision` + allowlisted canonical facts + `Idempotency-Key`
- `expected_profile_revision`: STAGE-03 §1B (line 60) — "mandatory for confirm and stale revision returns 409" ✓
- Canonical fact fields: mapped to 08_candidates.sql tables (`candidate_profiles`, `candidate_skills`, etc.) ✓
- Open: writable-field allowlist — correctly noted (STAGE-03 §7)

**Guest DTOs:** Catalog §3 states "Exact DTO/header token transport, application snapshot fields and claim error catalog remain to be filled." Correctly marked as open.

**Verdict: PASS** (with noted open items that are correctly identified)

---

### 6. Tables/functions read and written

| API | Tables read | Tables written | SQL source |
|---|---|---|---|
| API-RESUME-001 | users, candidate_profiles, uploaded_documents | private storage, uploaded_documents, resume_parsing_jobs, outbox_events | 06_documents.sql:72–106, 07_resume_processing.sql:39–67 |
| API-RESUME-002 | uploaded_documents, resume_parsing_jobs, resume_parsing_job_events | none | 06_documents.sql, 07_resume_processing.sql:39–67, 121–130 |
| API-RESUME-003 | resume_parsing_jobs, resume_parsed_data | none | 07_resume_processing.sql:39–100 |
| API-RESUME-004 | uploaded_documents, resume_parsing_jobs, resume_parsed_data, candidate_profiles, profile_change_history | canonical fact tables, profile_change_history, candidate_profile_documents, outbox_events | 06_documents.sql, 07_resume_processing.sql, 08_candidates.sql |
| Guest uploads | guest_upload_sessions, uploaded_documents | guest_upload_sessions (consume), uploaded_documents, outbox_events | 06_documents.sql:51–70, 72–106 |
| Guest apply | guest_upload_sessions, uploaded_documents, job_applications, application_profile_snapshots | job_applications, application_profile_snapshots, outbox_events | 09_applications.sql:130–164 |
| Guest claims | guest_candidate_claims, candidate_profiles | guest_candidate_claims, candidate_profiles, outbox_events | 09_applications.sql:166–211 |

Function verification:
- `consume_guest_upload_session`: 17_rls.sql:234, REVOKE from PUBLIC, GRANT to service_role ✓
- `change_application_status`: 17_rls.sql:235, REVOKE from PUBLIC, GRANT to service_role ✓
- `bump_candidate_profile_revision`: referenced in Phase 5 §7 ✓

**Verdict: PASS**

---

### 7. Transaction boundaries

Catalog §1: "No external call occurs inside a DB transaction."

Phase 5 §3: "Business row, audit/history and outbox event commit atomically."

Phase 4 §2: "No Cloud Tasks, FastAPI, email or other external call occurs inside the open DB transaction."

Per-API verification:

- **API-RESUME-001**: "metadata row + security.scan.requested outbox event in one commit" ✓
  - Matches Phase 5 §3 (line 88–89): "NestJS writes the private object, then commits document metadata and security.scan.requested in one trusted transaction"
  - No external call inside transaction: storage write is local/private, not external ✓

- **API-RESUME-002**: "read-only bounded query" ✓

- **API-RESUME-003**: "read-only bounded query" ✓

- **API-RESUME-004**: "one atomic trusted transaction with row lock and one revision bump" ✓
  - Matches Phase 4 §5 (lines 73–80): "facts + history + revision + candidate.profile.changed outbox" atomic
  - Row lock: consistent with Phase 4 §11 (line 209): "Lock rows in a deterministic order"

- **Internal commands** (§4): "Same transaction; no external call" ✓
  - Change application status: "status + history + audit + outbox atomic" ✓
  - Confirm canonical profile: "facts + revision + history + outbox atomic" ✓

**Verdict: PASS**

---

### 8. Outbox event, contract, dispatcher route and consumer

| API | Event type | Contract file | Dispatcher route | Queue | Consumer endpoint |
|---|---|---|---|---|---|
| API-RESUME-001 | security.scan.requested | contracts/events/security-scan-requested.v1.json | ✓ event-route.registry.ts:78–84 | security-scan-queue | /internal/tasks/security/scan (task_handlers.py:62) |
| API-RESUME-004 | candidate.profile.changed | contracts/events/candidate-profile-changed.v1.json | ✓ event-route.registry.ts:42–46 | projection-queue | /internal/tasks/candidate/projection (task_handlers.py:452) |
| Security clean → parse | resume.parse.requested | contracts/tasks/resume-parse-task.v1.json | ✓ event-route.registry.ts:37–41 | ai-heavy-queue | /internal/tasks/resume/parse (task_handlers.py:220) |

Contract schema verification:
- `security-scan-requested.v1.json`: required fields = `schema_version`, `event_id`, `aggregate_type`, `aggregate_id`, `event_type`, `payload`, `occurred_at` ✓
  - payload: `document_id` (required), `uploaded_by_user_id`, `guest_upload_session_id`, `trace_id` ✓
- `candidate-profile-changed.v1.json`: required fields = `schema_version`, `event_id`, `aggregate_id`, `trace_id` ✓
  - properties: `change_type`, `active_document_id` ✓ (matches STAGE-03 §1A: "must be used with change_type and active_document_id")

Consumer verification (FastAPI):
- Security scan handler: task_handlers.py:62–185 — claims document, scans, writes result, emits `resume.parse.requested` if clean ✓
- Candidate projection handler: task_handlers.py:452–582 — loads aggregate, generates embedding, upserts search profile, emits `candidate.projection.rebuilt` ✓
- Resume parse handler: task_handlers.py:220–449 — claims job, extracts text, AI parses, commits result, emits `candidate.resume.parsed` ✓

**Verdict: PASS**

---

### 9. Idempotency and concurrency

| API | Catalog rule | STAGE-03 binding | Verified |
|---|---|---|---|
| API-RESUME-001 | "same checksum reuse is successful reuse" | §1B (line 50): "reused=true, not DUPLICATE_RESUME error; no second scan or outbox event" | PASS |
| API-RESUME-001 | `Idempotency-Key` optional | §1B (line 65): header-based; scope = authenticated user + operation + checksum | PASS |
| API-RESUME-004 | `expected_profile_revision` mandatory; stale = 409 | §1B (line 60): "mandatory for confirm and stale revision returns 409" | PASS |
| API-RESUME-004 | **IDEMPOTENCY_CONFLICT** | §1B (line 66–67): "same key plus different payload returns 409 IDEMPOTENCY_CONFLICT" | **FAIL** |

**BLOCKER-01**: API-RESUME-004 error list omits `IDEMPOTENCY_CONFLICT`. STAGE-03 §1B (lines 66–67) explicitly requires: "the same key plus a different payload returns 409 IDEMPOTENCY_CONFLICT." The confirm endpoint accepts `Idempotency-Key` but the error list does not include this code.

Concurrency verification (FastAPI workers):
- Security scan: 06_documents.sql:84 `security_scan_status IN ('pending', 'failed')` WHERE claim + FOR UPDATE (task_handlers.py:88–97) ✓
- Projection: `acquire_processing_lease` with `lease_duration_seconds=300` (task_handlers.py:492–501) ✓
- Stale revision: `check_stale_source_state` (task_handlers.py:518–526) ✓
- All workers: `processed_events` idempotency before writes (e.g., task_handlers.py:81, 251, 483) ✓

**Verdict: CONDITIONAL PASS (1 BLOCKER)**

---

### 10. Rate-limit classification without invented numbers

Catalog §1: "Rate limits are environment configuration and return 429 with retry information."

STAGE-03 §1B (lines 82–85): "Rate limits are environment-configured, not hard-coded in DTOs: upload is strictest, status and parsed-data reads are more permissive for UI recovery, and confirm is idempotency-protected. Guest limits apply per session/IP. 429 RATE_LIMITED returns Retry-After and retry_after_seconds; numeric values remain a load-test/operations decision."

Catalog per-API classification:
- API-RESUME-001 (upload): listed in errors ✓ — correctly noted as strictest
- API-RESUME-002 (status read): listed in errors ✓ — correctly noted as more permissive
- API-RESUME-003 (parsed-data read): listed in errors ✓ — correctly noted as more permissive
- API-RESUME-004 (confirm): listed in errors ✓ — correctly noted as idempotency-protected
- Guest: noted "per session/IP" ✓

No invented numeric values found. Classification follows STAGE-03 binding.

**Verdict: PASS**

---

### 11. Audit/security requirements

Catalog §1: "No response/log may contain resume content, raw AI output, storage paths, tokens or stack traces."

Phase 5 §3: "Raw resume text, raw AI output, artifacts, storage paths, tokens and internal errors are not returned by default."

Phase 2 §1 (SEC-03): "Consent, privacy, signed/private document access and PII-redacted logs."

Verification across catalog entries:
- API-RESUME-001 acceptance: "no raw content in response/logs" ✓
- API-RESUME-003 acceptance: "raw extracted_text/raw_ai_output/artifacts/error_details never returned" ✓
- API-RESUME-003 Open detail: "field-by-field normalized allowlist remains API-catalog blocker" ✓
- STAGE-03 §1B (lines 57–58): "Error details are typed and sanitized; no raw error_details, storage paths, resume content, scanner internals, tokens or stack traces may be returned" ✓
- FastAPI exceptions (exceptions.py:25–33): `to_dict()` returns `{"error": {"code": ..., "message": ..., "details": ...}}` — sanitized ✓

Security scan result storage: 06_documents.sql:85 `security_scan_result JSONB` ✓
Processed events: 07_resume_processing.sql `processed_events` table for idempotency ✓

**Verdict: PASS**

---

### 12. Error codes and sanitized responses

| API | Catalog error codes | STAGE-03 families | Match |
|---|---|---|---|
| API-RESUME-001 | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, RESUME_LIMIT_REACHED, DEPENDENCY_UNAVAILABLE, IDEMPOTENCY_CONFLICT, RATE_LIMITED | validation, auth, ownership, limit, infra, conflict, throttle | PASS |
| API-RESUME-002 | UNAUTHORIZED, NOT_FOUND, RATE_LIMITED, DEPENDENCY_UNAVAILABLE | auth, ownership, throttle, infra | PASS |
| API-RESUME-003 | UNAUTHORIZED, NOT_FOUND, SCAN_PENDING, PARSING_PENDING, PARSING_FAILED, INFECTED_FILE, RATE_LIMITED, DEPENDENCY_UNAVAILABLE | auth, ownership, progress, scan-fail, throttle, infra | **CONDITIONAL** |
| API-RESUME-004 | UNAUTHORIZED, NOT_FOUND, FORBIDDEN, SCAN_PENDING, INFECTED_FILE, PARSING_PENDING, PARSING_FAILED, STALE_REVISION, RATE_LIMITED | auth, ownership, scan-state, concurrency, throttle | **CONDITIONAL** |

FastAPI worker error codes (exceptions.py):
- `TASK_VALIDATION_ERROR` (400) ✓
- `OIDC_UNAUTHORIZED` (401) ✓
- `OIDC_AUTHZ_ERROR` (403) ✓
- `DUPLICATE_TASK` (200, skipped) ✓
- `LEASE_NOT_ACQUIRED` (200, skipped) ✓
- `STALE_DATA_COALESCED` (200, skipped) ✓
- `DOCUMENT_VALIDATION_ERROR` (200) ✓
- `DOCUMENT_SECURITY_ERROR` (200) ✓
- `AI_PROVIDER_ERROR` (503/200) ✓
- `SCAN_IN_PROGRESS` (503) ✓
- `SCANNER_UNAVAILABLE` (503) ✓

STAGE-03 §1B (line 62–63): "Public success/error envelopes use schema_version: 1. error.details is typed by error code: validation exposes safe field/reason pairs, rate limiting exposes retry seconds, stale revision exposes expected/current revision, and all other details remain sanitized/empty."

**BLOCKER-02**: API-RESUME-003 lists `SCAN_PENDING` and `PARSING_PENDING` as error codes, but STAGE-03 §1B (line 55) binding states: "Normal scan or parsing progress is not returned as an error from the status endpoint." The deterministic `stage` field (`SECURITY_SCANNING`, `PARSING_QUEUED`, `PARSING_IN_PROGRESS`) already communicates progress via the status API (Phase 5 §6 lines 156–178). Progress is not error-state; the status endpoint returns it as `stage` value, not as an error response. The error list for API-RESUME-003 should exclude progress states.

**Verdict: CONDITIONAL PASS (1 BLOCKER — progress-as-error contradiction)**

---

### 13. Acceptance criteria and negative tests

Each API includes explicit, testable acceptance criteria:

- **API-RESUME-001**: "retry/reuse creates one document and one scan event; no raw content in response/logs"
  - Happy path: upload → 201 + metadata + outbox
  - Idempotent retry: same checksum → 200 + reused=true, no duplicate scan
  - Negative: invalid type/size → VALIDATION_ERROR; expired guest → NOT_FOUND; limit reached → RESUME_LIMIT_REACHED

- **API-RESUME-002**: "every DB state maps to exactly one stage; non-clean scan never appears ready"
  - Happy path: status → deterministic stage
  - Negative: unknown document → NOT_FOUND (same shape as not-owned); soft-deleted → NOT_FOUND

- **API-RESUME-003**: "raw extracted_text/raw_ai_output/artifacts/error_details never returned"
  - Happy path: parsed-data → allowlisted normalized_output only
  - Negative: infected document → INFECTED_FILE; parsing not done → not in response (stage handles it)

- **API-RESUME-004**: "stale/invalid confirm makes zero canonical changes; one logical save = one revision/event"
  - Happy path: confirm with matching revision → facts + revision + history + outbox atomic
  - Negative: stale revision → 409 STALE_REVISION; infected/failed scan → INFECTED_FILE/PARSING_FAILED

Phase 4 §12: "Every accepted transition succeeds; invalid transitions fail without partial writes; retry of same idempotent command does not duplicate."

**Verdict: PASS** (acceptance criteria are testable and cover happy/negative paths)

---

### 14. Guest session and claim rules

**Frozen paths** (STAGE-03 §1B lines 70–76, Phase 5 §4 lines 123–132):
1. `POST /api/v1/guest-sessions` — creates session
2. `POST /api/v1/guest-sessions/:sessionId/resumes` — upload resume
3. `GET /api/v1/guest/resumes/:documentId/status` — resume status
4. `GET /api/v1/guest/resumes/:documentId/parsed-data` — parsed data
5. `POST /api/v1/guest/applications` — apply
6. `POST /api/v1/guest/claims` — claim/merge

**Session rules** (06_documents.sql:51–70):
- `status guest_upload_session_status` = active/consumed/expired/revoked ✓
- `max_upload_count SMALLINT DEFAULT 3 CHECK (max_upload_count > 0)` ✓
- `max_total_bytes BIGINT DEFAULT 31457280` (30 MB) ✓
- `expires_at TIMESTAMPTZ NOT NULL` ✓
- XOR constraint: `uploaded_by_user_id XOR guest_upload_session_id` (06_documents.sql:91–95) ✓

**Claim rules** (09_applications.sql:166–211):
- `status guest_claim_status` = pending/verified/merged/expired/revoked/rejected ✓
- State machine: pending → verified → merged; pending → expired/revoked/rejected; verified → merged/revoked/rejected; merged = terminal ✓ (Phase 4 §8.2)
- CHECK constraint enforces valid state combinations per status (09_applications.sql:188–210) ✓
- `claim_token_hash VARCHAR(255) NOT NULL UNIQUE` ✓
- FK constraint: `candidate_id + claimed_by_user_id` must reference valid `candidate_profiles(id, user_id)` (09_applications.sql:181–183) ✓

**Catalog §3 enforcement**: "Every guest request must enforce active, unexpired, unrevoked session, job scope, session ownership/XOR rules, upload count/byte limits, token protection and the approved claim state machine."

**Catalog §3 open items**: "Exact DTO/header token transport, application snapshot fields and claim error catalog remain to be filled from the guest requirements before freeze." Correctly marked as open.

**BLOCKER-03**: Guest APIs section documents 6 frozen paths and enforcement rules but does not trace each path to specific REQ-* IDs. Phase 1 §7 maps guest apply to REQ-APPLICATION-003 and guest claim to REQ-APPLICATION-004, but the catalog does not include these mappings.

**Verdict: CONDITIONAL PASS (1 BLOCKER — missing REQ-* traceability for guest paths)**

---

### 15. Application resume vs canonical resume behavior

Catalog §1: "Application-only resumes do not automatically promote to canonical profile/library."

STAGE-03 §1A (line 37): "Application-only resumes do not automatically promote to canonical profile/library." — frozen binding.

STAGE-03 §6: "Profile-resume APIs must not absorb application-only behavior. Define a separate catalog entry for: job-specific resume upload/selection; application_documents link; immutable application_profile_snapshots; no canonical profile/library promotion; parsing behavior and whether application parsing is required."

Catalog §5: "REQ-APPLICATION-001..007" listed in remaining domain catalog backlog.

SQL verification:
- `application_documents` (09_applications.sql:130–136): links application to uploaded document with `document_role` ✓
- `application_profile_snapshots` (09_applications.sql:138–160): immutable snapshots with `snapshot_type`, `snapshot_version`, `source_profile_revision` ✓
- Unique index: `uq_application_submitted_snapshot` (09_applications.sql:162–164) ensures one submitted snapshot per application ✓

The catalog correctly separates profile-resume APIs (API-RESUME-001..004) from application-specific behavior (deferred to backlog). No promotion behavior is invented.

**Verdict: PASS**

---

### 16. Realtime, SSE recovery and chat boundary

Catalog §1: "SSE is the live optimization for status/notification updates. REST/database state is authoritative after reconnect or missed events. WebSocket is reserved for the separately catalogued chat use case."

Decision-02 frozen transport split:
- Resume parsing/progress: SSE + REST status recovery ✓ (catalog API-RESUME-002: "SSE may notify that this endpoint should be refetched")
- Candidate projection: SSE lightweight nudge ✓
- Job AI processing: SSE lightweight nudge ✓
- Application status: SSE nudge ✓
- In-app notifications: Same per-user SSE stream ✓
- Chat: WebSocket (not SSE) ✓
- Interview updates: SSE nudge ✓

Decision-02 §5: "SSE/WS disconnect → exponential reconnect with jitter → authenticate again → REST authoritative state/history fetch → stream resume"

Decision-02 §6: "Durable state change pehle database transaction mein commit ho; realtime push baad mein ho"

Decision-02 §6: "Realtime failure business command ya database transaction ko fail nahi karayega"

Catalog §6: "candidate.resume.parsed and candidate.projection.rebuilt are worker outputs, not dispatcher input routes." Correctly distinguished from SSE transport.

**Verdict: PASS**

---

### 17. Saved-candidate privacy and uniqueness

SQL (09_applications.sql:228–238):
```sql
CREATE TABLE saved_candidates (
    id UUID PRIMARY KEY,
    recruiter_user_id UUID NOT NULL REFERENCES users(id),
    company_id UUID NOT NULL REFERENCES companies(id),
    candidate_id UUID NOT NULL REFERENCES candidate_profiles(id),
    private_note TEXT,
    CONSTRAINT saved_candidates_owner_candidate_unique UNIQUE (recruiter_user_id, candidate_id)
);
```

- **Privacy**: `recruiter_user_id` owned; RLS policy `saved_candidates_own_read` (17_rls.sql:211–212): `recruiter_user_id = auth.uid()` ✓
- **Uniqueness**: `UNIQUE (recruiter_user_id, candidate_id)` — same HR + candidate = one bookmark ✓
- **Non-job-specific**: No `job_id` column; intentionally not job-specific per Phase 1 §9A (line 146): "private, non-job-specific bookmark" ✓
- **Company boundary**: `company_id NOT NULL` with `REFERENCES companies(id) ON DELETE RESTRICT` — tenant boundary maintained ✓
- **Writes**: Service-only (no authenticated DML grants); NestJS enforces active membership and authorization ✓

Catalog §5: "REQ-SAVED-CANDIDATE-001" listed in backlog. Correctly deferred.

Phase 3 GAP-007: "Private, non-job-specific bookmark owned by the HR/recruiter who saved it. Same recruiter + candidate is unique; another HR may save the same candidate independently." ✓

**Verdict: PASS**

---

### 18. Referral, interview, notification and AI flows

**Referrals** (REQ-REFERRAL-001..007):
- Catalog §5: "REQ-REFERRAL-001..007 — manual referral current; configurable program is a gap" ✓
- Phase 1 §8: REQ-REFERRAL-001..006 APPROVED; REQ-REFERRAL-007 PLANNED CURRENT / GAP ✓
- Phase 3 GAP-005: "Company/job/campaign rule model, eligibility policy, reward type metadata" — open ✓
- SQL: `referral_batches`, `referral_invitations`, `referral_rewards` tables exist (09_applications.sql:242+) ✓

**Interviews** (REQ-INTERVIEW-001..003):
- Catalog §5: "REQ-INTERVIEW-001..003 — scheduling, slots, feedback and reminders" ✓
- Phase 1 §9: REQ-INTERVIEW-001, 002 APPROVED DIRECTION; REQ-INTERVIEW-003 FUTURE ✓
- Dispatcher: `interview.summary.requested` route registered ✓
- Worker: task_handlers.py:856–957 handles interview summary ✓

**Notifications** (REQ-NOTIFY-001..003):
- Catalog §5: "REQ-NOTIFY-001..003 — in-app notification and future email/template scope" ✓
- Phase 3 GAP-015: "`notification.email.requested` remains an unresolved phased route" ✓
- Catalog §6: "notification.email.requested remains an unresolved phased route" ✓
- No guessed dispatcher route or contract ✓

**AI** (REQ-AI-001..004):
- Catalog §5: "REQ-AI-001..004 — screening, recommendations and provider gap" ✓
- Phase 3 GAP-009: "Approved provider/model, embedding dimension compatibility" — open ✓
- Dispatcher: `job.screening_questions.requested` registered ✓
- Worker: task_handlers.py:960–1060 handles screening questions ✓

**Verdict: PASS**

---

### 19. Seven dispatcher routes and phased gaps

**Registered routes** verified against `event-route.registry.ts`:

| # | Event type | Queue | Contract | Registry lines | Worker endpoint | Handler |
|---|---|---|---|---|---|---|
| 1 | resume.parse.requested | ai-heavy-queue | resume-parse-task.v1.json | :37–41 | /internal/tasks/resume/parse | task_handlers.py:220 |
| 2 | candidate.profile.changed | projection-queue | candidate-projection-task.v1.json | :42–46 | /internal/tasks/candidate/projection | task_handlers.py:452 |
| 3 | job.ai.enrichment.requested | ai-heavy-queue | job-enrich-task.v1.json | :47–53 | /internal/tasks/job/enrich | task_handlers.py:585 |
| 4 | match.analyze.requested | ai-heavy-queue | match-analyze-task.v1.json | :61–65 | /internal/tasks/match/analyze | task_handlers.py:724 |
| 5 | interview.summary.requested | ai-heavy-queue | interview-summary-task.v1.json | :66–70 | /internal/tasks/interview/summary | task_handlers.py:856 |
| 6 | job.screening_questions.requested | ai-heavy-queue | job-screening-questions-task.v1.json | :71–77 | /internal/tasks/job/screening-questions | task_handlers.py:960 |
| 7 | security.scan.requested | security-scan-queue | security-scan-task.v1.json | :78–84 | /internal/tasks/security/scan | task_handlers.py:62 |

All 7 match exactly. Task contract schemas verified (tasks.py): all 7 payloads have `schema_version`, `event_id`, `aggregate_id`, `trace_id` ✓

**Phased gaps** (Phase 3 GAP-012, GAP-013, GAP-015):
- `application.status.changed`: emitted by DB function `change_application_status()` (09_applications.sql) but no contract file or dispatcher route — EXPECTED PHASED GAP ✓
- `notification.email.requested`: unresolved phased route; dispatcher explicitly not registered (event-route.registry.ts:15) ✓
- Document cleanup event: approved phased gap; contract and consumer owner not present ✓

Catalog §6 correctly documents all three phased gaps.

**Verdict: PASS**

---

### 20. Worker output events incorrectly routed

Catalog §6: "candidate.resume.parsed and candidate.projection.rebuilt are worker outputs, not dispatcher input routes."

Worker outputs verified in FastAPI code:

| Worker output event | Emitted by | Not a dispatcher route | Verified |
|---|---|---|---|
| candidate.projection.rebuilt | task_handlers.py:540 | Not in event-route.registry.ts | ✓ |
| candidate.resume.parsed | task_handlers.py:407 | Not in event-route.registry.ts | ✓ |
| job.enriched | task_handlers.py:676 | Not in event-route.registry.ts | ✓ |
| application.match_analyzed | task_handlers.py:809 | Not in event-route.registry.ts | ✓ |
| interview.summary_generated | task_handlers.py:936 | Not in event-route.registry.ts | ✓ |
| job.screening_questions_generated | task_handlers.py:1038 | Not in event-route.registry.ts | ✓ |

All 6 worker outputs correctly identified as NOT dispatcher input routes. Registry comment (event-route.registry.ts:13): "Output events are not registered as dispatcher input routes." ✓

**Verdict: PASS**

---

## ISSUE LOG

| Issue ID | Severity | Section | Evidence | Impact | Recommended correction | Blocks freeze/coding |
|---|---|---|---|---|---|---|
| ISSUE-01 | **BLOCKER** | API-RESUME-004 errors (§2 line 98–99) | STAGE-03 §1B (lines 66–67): "same key plus different payload returns 409 IDEMPOTENCY_CONFLICT" but API-RESUME-004 error list omits this code | Confirm endpoint idempotency contract incomplete; implementation would miss a required error path | Add `IDEMPOTENCY_CONFLICT` to API-RESUME-004 error list | YES — API CATALOG FROZEN |
| ISSUE-02 | **BLOCKER** | API-RESUME-003 errors (§2 line 76) | STAGE-03 §1B (line 55): "Normal scan or parsing progress is not returned as an error from the status endpoint." Catalog lists SCAN_PENDING, PARSING_PENDING as errors | Contradicts frozen two-track status mapping; would cause UI to display progress as error state instead of `stage` field | Remove SCAN_PENDING, PARSING_PENDING from API-RESUME-003 error list; progress is communicated via deterministic `stage` field, not error response | YES — API CATALOG FROZEN |
| ISSUE-03 | **BLOCKER** | Guest APIs (§3 lines 103–119) | Phase 1 §7 maps guest apply → REQ-APPLICATION-003, guest claim → REQ-APPLICATION-004; catalog §3 does not trace each of 6 frozen paths to specific REQ-* IDs | Requirement traceability gap; cannot verify which specific requirements each guest path satisfies | Add explicit REQ-* mapping for each of 6 guest paths before freeze | YES — API CATALOG FROZEN |
| ISSUE-04 | MINOR | Guest APIs (§3 lines 116–119) | "Exact DTO/header token transport, application snapshot fields and claim error catalog remain to be filled" | Guest API DTOs incomplete | Complete before freeze | YES — API CATALOG FROZEN |
| ISSUE-05 | MINOR | API-RESUME-003 (§2 line 79) | "field-by-field normalized allowlist remains API-catalog blocker" | Parsed-data response fields not frozen | Define allowlist before freeze | YES — API CATALOG FROZEN |
| ISSUE-06 | MINOR | API-RESUME-004 (§2 line 89–90) | Confirm writable-field allowlist pending (STAGE-03 §7) | Which canonical fields confirm can write not frozen | Define allowlist before freeze | YES — API CATALOG FROZEN |
| ISSUE-07 | MINOR | Internal commands (§4 lines 125–131) | Table lists 5 use-cases but "Recover/cleanup orphaned document" references "Approved cleanup worker/sweeper" without specific owner module | Cleanup owner not identified | Assign specific owner before implementation | NO — phased gap |
| ISSUE-08 | MINOR | Remaining backlog (§5) | 14+ requirement groups listed as backlog but exact paths/DTOs not catalogued | Domain catalog incomplete | Complete before API CATALOG FROZEN | YES — API CATALOG FROZEN |
| ISSUE-09 | MINOR | Exit criteria (§7) | "Acceptance tests" listed but no specific test file or coverage requirement | Exit criteria not measurable | Define test coverage requirement before freeze | NO — implementation detail |

---

## FINAL VERDICT

### **CONDITIONAL PASS**

The Phase 6 API Catalog is structurally sound and accurately documents the resume and guest flows against Phase 5 frozen requirements, STAGE-03 binding decisions, executable SQL, contracts, and Decision-01/02. No route, table, event, DTO, or behavior is invented.

Three BLOCKERs prevent API CATALOG FROZEN status:

1. **ISSUE-01**: API-RESUME-004 missing `IDEMPOTENCY_CONFLICT` error code — required by STAGE-03 §1B for confirm with `Idempotency-Key`.

2. **ISSUE-02**: API-RESUME-003 lists `SCAN_PENDING`/`PARSING_PROGRESS` as error codes — contradicts STAGE-03 §1B binding that progress is not returned as error from the status endpoint. Deterministic `stage` field already handles progress communication.

3. **ISSUE-03**: Guest APIs missing per-path REQ-* traceability — 6 frozen paths documented but not mapped to specific requirement IDs.

Additionally, 6 MINOR issues (ISSUE-04 through ISSUE-09) must be resolved before freeze: guest DTOs, parsed-data allowlist, confirm writable-field allowlist, internal use-case owner, backlog completion, and test coverage criteria.

### Required before API CATALOG FROZEN:

1. Fix ISSUE-01: Add `IDEMPOTENCY_CONFLICT` to API-RESUME-004 error list
2. Fix ISSUE-02: Remove `SCAN_PENDING` and `PARSING_PENDING` from API-RESUME-003 error list
3. Fix ISSUE-03: Add explicit REQ-* traceability for each of 6 guest paths
4. Fix ISSUE-04: Complete guest API DTOs
5. Fix ISSUE-05: Define parsed-data field-by-field allowlist
6. Fix ISSUE-06: Define confirm writable-field allowlist
7. Fix ISSUE-08: Complete remaining domain catalog or explicitly defer with traceability

### What is NOT blocked:

- Resume APIs (API-RESUME-001 through API-RESUME-004) structure, paths, actors, transaction boundaries, outbox events, consumers, and idempotency rules are correctly documented
- Dispatcher routes (7) match exactly; no worker outputs are incorrectly routed
- Decision-01 (controlled hybrid) and Decision-02 (SSE/WebSocket split) are correctly reflected
- SQL table/function references are accurate
- No invented requirements, tables, events, or behaviors found
