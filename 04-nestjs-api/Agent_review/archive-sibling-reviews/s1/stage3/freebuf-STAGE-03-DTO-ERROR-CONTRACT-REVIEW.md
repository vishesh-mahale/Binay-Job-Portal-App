# Stage-03 DTO and Error Contract Independent Review

**Auditor:** Freebuf (Senior NestJS API, PostgreSQL & Distributed-Systems Reviewer)
**Date:** 2026-08-26
**Target:** Proposed success/error envelope, error codes, and HTTP mapping for the 4 resume APIs

---

## 1. Executive Verdict

### **APPROVED WITH CHANGES**

The proposed envelope structure is clean and reasonable. Most error codes map to real database states. However, **7 corrections** are required: 2 error codes need renaming, 3 missing error states, 1 incorrect HTTP mapping, and the envelope lacks a `version` field for future contract evolution. The FastAPI handlers already use a partial subset of these codes — consistency must be verified.

---

## 2. Files and Sources Checked

| # | File | What was verified |
|---|---|---|
| 1 | `02-database/migrations/baseline/02_enums.sql` | `security_scan_status`, `parsing_job_status`, `resume_processing_status`, `guest_upload_session_status`, `guest_claim_status` |
| 2 | `02-database/migrations/baseline/06_documents.sql` | `uploaded_documents` columns, `guest_upload_sessions` columns, unique checksum indexes, owner XOR constraint |
| 3 | `02-database/migrations/baseline/07_resume_processing.sql` | `resume_parsing_jobs` columns, `resume_parsed_data` columns, idempotency_key UNIQUE |
| 4 | `02-database/migrations/baseline/08_candidates.sql` | `candidate_profiles.profile_revision`, `bump_candidate_profile_revision()`, `candidate_profile_documents` |
| 5 | `07-fastapi-ai-worker/app/api/v1/task_handlers.py` | Existing error codes used: `OIDC_UNAUTHORIZED`, `SCAN_IN_PROGRESS`, `DOCUMENT_NOT_FOUND`, `SCANNER_UNAVAILABLE`, `SCAN_PENDING` |
| 6 | `07-fastapi-ai-worker/app/schemas/tasks.py` | Task payload structure: `schema_version`, `event_id`, `aggregate_id`, `trace_id` |
| 7 | `contracts/events/security-scan-requested.v1.json` | Event envelope fields |
| 8 | `contracts/events/candidate-profile-changed.v1.json` | `change_type`, `active_document_id` fields |
| 9 | `04-nestjs-api/NESTJS-IMPLEMENTATION-GUIDE.md` | §6 profile save pattern, §8 document upload, §9 parsing, §18 tests |
| 10 | `04-nestjs-api/PHASE-01-REQUIREMENTS-CONSOLIDATION.md` | REQ-RESUME-001..007, REQ-API-007 (error contract) |
| 11 | `04-nestjs-api/04-nestjs-api-app/s1/codex/STAGE-03-REMAINING-DECISIONS.md` | Existing decision areas |
| 12 | `04-nestjs-api/04-nestjs-api-app/s1/codex/STAGE-03-CONSOLIDATED-REMAINING-DECISIONS-REVIEW.md` | Consolidated findings |

---

## 3. Correct Points

| Area | Verdict | Evidence |
|---|---|---|
| **Envelope structure** | ✅ CORRECT | `success`, `data`/`error`, `request_id`, `trace_id` is a clean, standard pattern. `trace_id` aligns with `trace_id` in all task payloads and outbox events. |
| **Error envelope `code` field** | ✅ CORRECT | Machine-readable `code` in `error.code` matches existing FastAPI pattern: `{"code": "OIDC_UNAUTHORIZED", "message": "..."}` (task_handlers.py L79) |
| **VALIDATION_ERROR** | ✅ CORRECT | Standard. Maps to NestJS DTO validation failures (guide §4: `whitelist: true, forbidNonWhitelisted: true`). |
| **UNAUTHORIZED** | ✅ CORRECT | Maps to missing/invalid JWT. FastAPI already uses `OIDC_UNAUTHORIZED` (L79). NestJS guard failures. |
| **FORBIDDEN** | ✅ CORRECT | Maps to ownership/permission failure. Guide §4: "UUID पता होना access permission नहीं है." |
| **NOT_FOUND** | ✅ CORRECT | Maps to resource not found. FastAPI already uses `DOCUMENT_NOT_FOUND` (L99). |
| **STALE_REVISION** | ✅ CORRECT | Maps to `expected_revision != candidate_profiles.profile_revision`. Guide §6: "Stale expected revision/row version पर HTTP 409 Conflict." |
| **IDEMPOTENCY_CONFLICT** | ✅ CORRECT | Maps to same-key replay with different content. Guide §11: idempotency key behavior. |
| **RATE_LIMITED** | ✅ CORRECT | Standard. Aligns with REQ-PLATFORM-006 rate limiting requirement. |
| **INTERNAL_ERROR** | ✅ CORRECT | Standard 500 fallback. |
| **HTTP 401 → JWT** | ✅ CORRECT | Standard REST. |
| **HTTP 403 → ownership** | ✅ CORRECT | Standard REST. |
| **HTTP 404 → not found** | ✅ CORRECT | Standard REST. |
| **HTTP 409 → stale/duplicate** | ✅ CORRECT | Standard REST for optimistic concurrency conflicts. |
| **HTTP 429 → rate limit** | ✅ CORRECT | Standard REST. |
| **HTTP 500/503 → internal** | ✅ CORRECT | Standard REST. |

---

## 4. Incorrect or Unsupported Points

| ID | Issue | Evidence | Severity | Required Change |
|---|---|---|---|---|
| **ERR-01** | **`INFECTED_FILE` maps to HTTP 422.** The proposed mapping says `422 → infected/invalid business state`. But `422 Unprocessable Entity` is for syntactically valid but semantically incorrect input. An infected document is not a client input error — it's a server-side scan result. The correct HTTP status is `409 Conflict` (document exists but is in a state that prevents the requested operation) or `410 Gone` (terminal rejected state). FastAPI already returns `503` for scan-related states (L97, L141). | `02_enums.sql` L510: `security_scan_status` includes `infected`. task_handlers.py L97: `SCAN_IN_PROGRESS` → 503. | **HIGH** | Change `INFECTED_FILE` HTTP status from `422` to `409 Conflict` (business state conflict) or keep `422` but rename to `INVALID_DOCUMENT_STATE` to be semantically accurate. |
| **ERR-02** | **`SCAN_PENDING` and `PARSING_PENDING` are redundant.** If scan is pending, parsing cannot start. `PARSING_PENDING` would only occur if the status API is called after scan completes but before parsing starts — which is a sub-millisecond window. The status API should expose a single deterministic `stage` derived from both tracks (as the consolidated review recommends). Having two separate "pending" codes forces the UI to handle two similar states. | Stage-03-REMAINING-DECISIONS.md §11.3: "Define one deterministic UI stage from security_scan_status + processing_status." | **MEDIUM** | Remove `PARSING_PENDING`. The status API returns a single `stage` field. `SCAN_PENDING` covers the "waiting for scan" state. "Waiting for parsing" is `SCAN_COMPLETED` or `PARSING_QUEUED`. |
| **ERR-03** | **`SCAN_IN_PROGRESS` exists in FastAPI but is missing from the proposed list.** task_handlers.py L97: `raise HTTPException(status_code=503, detail={"code": "SCAN_IN_PROGRESS", ...})`. The status API would need this code when `security_scan_status = 'scanning'`. | task_handlers.py L97 | **MEDIUM** | Add `SCAN_IN_PROGRESS` to the error code list, or document that the status API never returns errors for in-progress states (it returns a `stage` field instead). |
| **ERR-04** | **`PARSING_FAILED` may leak internal details.** The `parsing_job_status` has `failed` as a terminal state. But `error_details` in `resume_parsing_jobs` (L71) contains `JSONB` error data that could include internal stack traces, AI provider errors, or storage paths. The error response must sanitize this. | `07_resume_processing.sql` L71: `error_details JSONB`. task_handlers.py L398: `str(exc)` in error response. | **HIGH** | The error response for `PARSING_FAILED` must return a safe error category/code, NOT the raw `error_details` JSONB content. Add to contract: "error.details must not contain stack traces, storage paths, AI provider errors, or internal identifiers." |
| **ERR-05** | **`DUPLICATE_RESUME` is ambiguous.** It could mean: (a) same checksum already uploaded (which is a **reuse**, not an error — guide §8.4 says reuse), or (b) violation of `uq_uploaded_document_checksum_owner` unique index. If it's case (a), it should NOT be an error — it's a success with `existing_document_id`. If it's case (b), it's a DB constraint violation that should be `409 Conflict`. | Guide §8.4: "Same owner/session + checksum document मिले तो existing document reuse करेगा।" `06_documents.sql` L123-128: unique checksum indexes. | **HIGH** | Rename to `DOCUMENT_REUSED` and return HTTP `200 OK` (not an error) with `existing_document_id`. Or if the intent is truly a duplicate error, clarify when it applies. |
| **ERR-06** | **`RESUME_LIMIT_REACHED` has no database enforcement.** The 10-resume limit is a PD-002 product decision, but there is NO database CHECK constraint, NO unique partial index, and NO function that enforces it. The limit must be enforced in NestJS application logic. The error code is valid but the enforcement mechanism is missing. | PD-002: "If the library already contains 10 resumes, the candidate must archive/remove." `06_documents.sql`: No limit constraint. | **MEDIUM** | Document that `RESUME_LIMIT_REACHED` is enforced by NestJS application logic (query count of active `uploaded_documents` with `uploaded_by_user_id = current_user AND deleted_at IS NULL AND document_type = 'resume'`), NOT by a database constraint. |
| **ERR-07** | **Envelope lacks `version` field.** The error contract will evolve. Adding `"version": "1.0"` or `"envelope_version": 1` allows future consumers to handle breaking envelope changes. The existing task payloads already use `schema_version` as a precedent. | `07_resume_processing.sql` L47: `schema_version VARCHAR(50)`. All task payloads: `schema_version: int = Field(1, ge=1)`. | **LOW** | Add `"version": 1` (or `"envelope_version": 1`) to both success and error envelopes. |

---

## 5. Missing DTO Fields

### Upload Response DTO — Missing

| Field | Type | Source | Why Required |
|---|---|---|---|
| `document_id` | UUID | `06_documents.sql` L72: `id UUID PRIMARY KEY` | Primary identifier for all subsequent API calls |
| `security_scan_status` | enum string | `06_documents.sql` L84 | Initial status: always `pending` on success |
| `processing_status` | enum string | `06_documents.sql` L86 | Initial status: always `uploaded` on success |
| `checksum_sha256` | string(64) | `06_documents.sql` L83 | Allows client-side dedup detection |
| `created_at` | timestamptz | `06_documents.sql` L89 | Audit timestamp |
| `is_reused` | boolean | Guide §8.4 | Indicates whether this was a new upload or a checksum reuse |

### Status Response DTO — Missing

| Field | Type | Source | Why Required |
|---|---|---|---|
| `document_id` | UUID | `06_documents.sql` L72 | Primary identifier |
| `security_scan_status` | enum string | `06_documents.sql` L84 | Current scan state |
| `processing_status` | enum string | `06_documents.sql` L86 | Current processing state |
| `stage` | string | Consolidated review §11.3 | Deterministic UI stage derived from both tracks |
| `error_code` | string or null | `07_resume_processing.sql` L71 | Safe error category when failed |
| `created_at` | timestamptz | `06_documents.sql` L89 | Document creation time |
| `scan_completed_at` | timestamptz or null | `06_documents.sql` `updated_at` on scan update | When scan finished |
| `parsing_started_at` | timestamptz or null | `07_resume_processing.sql` L55: `started_at` | When parsing started |
| `parsing_completed_at` | timestamptz or null | `07_resume_processing.sql` L57: `completed_at` | When parsing finished |

### Parsed-Data Response DTO — Missing

| Field | Type | Source | Why Required |
|---|---|---|---|
| `document_id` | UUID | `07_resume_processing.sql` L91 | Links to source document |
| `parsing_job_id` | UUID | `07_resume_processing.sql` L88 | Links to parsing job |
| `normalized_output` | JSONB | `07_resume_processing.sql` L94 | Safe review fields for form pre-fill |
| `confidence_details` | JSONB or null | `07_resume_processing.sql` L95 | Confidence metadata |
| `validation_result` | JSONB or null | `07_resume_processing.sql` L96 | Validation metadata |
| `overall_confidence` | decimal(5,2) or null | `07_resume_processing.sql` L97 | Overall confidence score |
| `schema_version` | string | `07_resume_processing.sql` L99 | AI output schema version |

### Confirm Response DTO — Missing

| Field | Type | Source | Why Required |
|---|---|---|---|
| `candidate_id` | UUID | `08_candidates.sql` L73 | Candidate profile identifier |
| `profile_revision` | bigint | `08_candidates.sql` L92 | New revision after bump |
| `document_linked` | boolean | Guide §6 step 6 | Whether document was linked |
| `projection_triggered` | boolean | Guide §6 step 7 | Whether projection outbox event was created |

---

## 6. Missing or Invalid Error Codes

| ID | Code | HTTP | When | Source | Verdict |
|---|---|---|---|---|---|
| **MISSING-01** | `SCAN_IN_PROGRESS` | 503 | `security_scan_status = 'scanning'` when status API called | FastAPI L97 already uses this | **ADD** |
| **MISSING-02** | `GUEST_SESSION_EXPIRED` | 410 | `guest_upload_sessions.expires_at <= NOW()` | `06_documents.sql` L85: `expires_at`. Guide §12: "active + unexpired + not revoked" | **ADD** |
| **MISSING-03** | `GUEST_SESSION_REVOKED` | 410 | `guest_upload_sessions.revoked_at IS NOT NULL` | `06_documents.sql` L87: `revoked_at`. Guide §12 | **ADD** |
| **MISSING-04** | `DOCUMENT_SOFT_DELETED` | 410 | `uploaded_documents.deleted_at IS NOT NULL` | `06_documents.sql` L91: `deleted_at`. Guide §8: "Normal deletion deleted_at hai" | **ADD** |
| **MISSING-05** | `DOCUMENT_REUSED` | 200 (not error) | Same owner/session + checksum match | Guide §8.4: "existing document reuse karega" | **ADD as success path**, not error |
| **REMOVE-01** | `PARSING_PENDING` | — | Sub-millisecond window between scan clean and parse start | Redundant with `SCAN_PENDING` | **REMOVE** |
| **RENAME-01** | `INFECTED_FILE` → `DOCUMENT_INFECTED` | 409 | `security_scan_status = 'infected'` | `02_enums.sql` L510 | **RENAME** for consistency with other `DOCUMENT_*` codes |
| **RENAME-02** | `SCAN_FAILED` → `SECURITY_SCAN_FAILED` | 409 | `security_scan_status = 'failed'` | `02_enums.sql` L510 | **RENAME** to be more specific |

---

## 7. HTTP Mapping Review

| Proposed | Verdict | Evidence | Change |
|---|---|---|---|
| 400 → validation/business input | ✅ CORRECT | Standard. Guide §4: DTO validation. | None |
| 401 → invalid/missing JWT | ✅ CORRECT | Standard. FastAPI L79: `OIDC_UNAUTHORIZED`. | None |
| 403 → ownership/permission | ✅ CORRECT | Standard. Guide §4: "UUID पता होना access permission नहीं है." | None |
| 404 → not found | ✅ CORRECT | Standard. FastAPI L99: `DOCUMENT_NOT_FOUND`. | None |
| 409 → duplicate/stale/idempotency | ✅ CORRECT | Standard. Guide §6: "409 Conflict" for stale revision. | None |
| **422 → infected/invalid state** | ⚠️ **INCORRECT** | `422 Unprocessable Entity` is for valid syntax but invalid semantics in the *request*. An infected scan result is a *server-side state*, not a client input error. | **Change to `409 Conflict`** (business state conflict) or `410 Gone` (terminal rejected state). |
| 429 → rate limit | ✅ CORRECT | Standard. | None |
| 500/503 → internal/unavailable | ✅ CORRECT | Standard. FastAPI L97: `SCAN_IN_PROGRESS` → 503. | None |
| **MISSING: 410 → terminal state** | — | Guest session expired/revoked, document soft-deleted | **Add 410 Gone** for expired/revoked/deleted resources |

---

## 8. Security and PII Review

| Check | Verdict | Evidence | Issue |
|---|---|---|---|
| **No storage paths in errors** | ⚠️ RISK | task_handlers.py L98: `str(exc)` could contain storage paths. FastAPI L398: `str(exc)` in 500 response. | The NestJS API must sanitize all error messages. The proposed envelope `error.message` must be a safe UI-facing string, NOT `str(exc)`. |
| **No stack traces in errors** | ⚠️ RISK | task_handlers.py L398: `raise HTTPException(status_code=500, detail={"status": "failed", "error": str(exc)})` | Same as above. `error.details` must never contain raw exception text. |
| **No scanner details in errors** | ✅ OK | The proposed codes don't expose scanner internals. | But the contract must explicitly state: "error.details must not contain scanner version, engine version, threat names, file paths, or internal identifiers." |
| **No resume content in errors** | ✅ OK | The proposed codes don't expose resume content. | Contract must state: "error.details must not contain file names, email addresses, phone numbers, or resume text excerpts." |
| **trace_id propagation** | ✅ CORRECT | All task payloads have `trace_id`. The envelope `trace_id` enables end-to-end tracing. | None |
| **request_id generation** | ✅ CORRECT | Standard correlation ID pattern. REQ-PLATFORM-005: "Correlation/request/event IDs API → outbox → task → worker." | None |
| **Error message localization risk** | ⚠️ NOTE | Error `message` fields are in English. If the UI needs Hindi/localized messages, the `code` field is the machine-readable key and `message` should be a safe default. | Document that `message` is a developer-facing default; UI should map `code` to localized strings. |

---

## 9. Cross-Service Compatibility Review

| Service | Compatible? | Evidence |
|---|---|---|
| **Next.js UI** | ✅ YES | The envelope structure is JSON-standard. `code` field enables UI to map errors to localized messages. `trace_id` enables debugging. |
| **NestJS API** | ✅ YES | The envelope fits NestJS exception filter pattern. `success` boolean enables consistent response handling. |
| **Supabase DB/RLS** | ✅ YES | Error codes map to actual enum values. No new DB objects needed. |
| **Outbox Dispatcher** | ✅ YES | The error contract is API-layer only. Dispatcher doesn't consume these errors. |
| **FastAPI Worker** | ⚠️ PARTIAL | FastAPI already uses `{"code": "...", "message": "..."}` pattern (L79, L97, L99, L141). But FastAPI doesn't use `success`/`request_id`/`trace_id` envelope. FastAPI is internal-only (Cloud Tasks), so its response format is separate. **No conflict**, but document that FastAPI internal responses follow a different envelope. |
| **Cloud Tasks** | ✅ YES | Task payloads use `schema_version`, `event_id`, `aggregate_id`, `trace_id`. The API error envelope is separate from task payloads. |

---

## 10. Recommended Final Contract

### Success Envelope

```json
{
  "success": true,
  "version": 1,
  "data": {},
  "request_id": "uuid",
  "trace_id": "uuid"
}
```

### Error Envelope

```json
{
  "success": false,
  "version": 1,
  "error": {
    "code": "ERROR_CODE",
    "message": "Safe UI-facing message",
    "details": {}
  },
  "request_id": "uuid",
  "trace_id": "uuid"
}
```

### Complete Error Code Table

| Code | HTTP | When | APIs |
|---|---|---|---|
| `VALIDATION_ERROR` | 400 | DTO validation failure | All |
| `UNAUTHORIZED` | 401 | Missing/invalid JWT | All |
| `FORBIDDEN` | 403 | Ownership/permission denied | All |
| `NOT_FOUND` | 404 | Resource not found | Status, Parsed-Data, Confirm |
| `DOCUMENT_REUSED` | 200 | Same owner+checksum → existing doc returned | Upload (success path, not error) |
| `RESUME_LIMIT_REACHED` | 409 | 10 active library resumes reached | Upload |
| `DOCUMENT_INFECTED` | 409 | `security_scan_status = 'infected'` | Status, Parsed-Data, Confirm |
| `SECURITY_SCAN_FAILED` | 409 | `security_scan_status = 'failed'` | Status, Parsed-Data, Confirm |
| `SCAN_PENDING` | 409 | `security_scan_status IN ('pending', 'scanning')` and operation requires clean | Confirm |
| `PARSING_FAILED` | 409 | `parsing_job_status = 'failed'` | Parsed-Data, Confirm |
| `STALE_REVISION` | 409 | `expected_revision != current profile_revision` | Confirm |
| `IDEMPOTENCY_CONFLICT` | 409 | Same idempotency key with different content | Upload, Confirm |
| `GUEST_SESSION_EXPIRED` | 410 | `guest_upload_sessions.expires_at <= NOW()` | Upload, Status |
| `GUEST_SESSION_REVOKED` | 410 | `guest_upload_sessions.revoked_at IS NOT NULL` | Upload, Status |
| `DOCUMENT_SOFT_DELETED` | 410 | `uploaded_documents.deleted_at IS NOT NULL` | Status, Parsed-Data, Confirm |
| `RATE_LIMITED` | 429 | Rate limit exceeded | All |
| `INTERNAL_ERROR` | 500 | Unexpected server error | All |
| `SERVICE_UNAVAILABLE` | 503 | Scanner/AI provider dependency unavailable | Status |

### HTTP Mapping (Corrected)

| HTTP | Use |
|---|---|
| 200 | Success, or document reused |
| 201 | Resource created (if applicable) |
| 202 | Upload accepted (async processing) |
| 400 | Validation error |
| 401 | Authentication required/failed |
| 403 | Authorization/ownership denied |
| 404 | Resource not found |
| 409 | Business state conflict (infected, stale revision, limit reached, idempotency) |
| 410 | Gone (expired session, revoked session, soft-deleted document) |
| 429 | Rate limited |
| 500 | Internal server error |
| 503 | Dependency unavailable (scanner, AI provider) |

---

## 11. Blocking Decisions

| # | Decision | Status | Impact |
|---|---|---|---|
| 1 | **Upload HTTP status: 201 vs 202** | OPEN | 201 = resource created synchronously. 202 = accepted for async processing. Since scan+parse are async, **202 is correct**. But this must be explicitly decided. |
| 2 | **`DOCUMENT_REUSED` as success vs error** | OPEN | Guide §8.4 says reuse. If reuse is a success path, it returns `200` with `is_reused: true`. If it's an error, it returns `409`. **Recommend: success path (200).** |
| 3 | **Numeric rate limits** | OPEN | Product decision. Not a contract blocker but the `RATE_LIMITED` code must exist. |
| 4 | **Parsed-data field allowlist** | OPEN | Which `normalized_output` fields are exposed? Must be defined before implementation. |

---

## 12. Tests / Acceptance Criteria

| # | Test | Type | Evidence Required |
|---|---|---|---|
| 1 | Upload with invalid MIME returns `VALIDATION_ERROR` (400) with safe message | Unit | NestJS DTO validation test |
| 2 | Upload with valid file returns success envelope with `document_id`, `security_scan_status: "pending"` | Integration | DB row exists |
| 3 | Upload with same owner+checksum returns `DOCUMENT_REUSED` (200) with `is_reused: true` and existing `document_id` | Integration | No second DB row |
| 4 | Status API for non-existent document returns `NOT_FOUND` (404) | Unit | No ownership leak |
| 5 | Status API for infected document returns `stage: "infected"` (not an error, a stage) | Unit | `security_scan_status = 'infected'` |
| 6 | Confirm with stale `expected_revision` returns `STALE_REVISION` (409) | Integration | Profile unchanged |
| 7 | Confirm with clean document and valid revision returns success with new `profile_revision` | Integration | DB revision bumped |
| 8 | Error response never contains `str(exc)`, storage paths, or stack traces | Security | Code review + fuzz test |
| 9 | All error responses include `request_id` and `trace_id` | Unit | Response contract test |
| 10 | Guest upload with expired session returns `GUEST_SESSION_EXPIRED` (410) | Integration | `guest_upload_sessions.expires_at <= NOW()` |

---

## 13. Final Status

### **APPROVED WITH CHANGES**

The proposed contract is architecturally sound. The envelope structure is clean. Most error codes are correct. After the following changes, it is ready for Stage-03 freeze:

1. **Fix `INFECTED_FILE` HTTP status** — Change from 422 to 409 (ERR-01)
2. **Remove `PARSING_PENDING`** — Redundant (ERR-02)
3. **Add `SCAN_IN_PROGRESS`** — Exists in FastAPI, missing from list (ERR-03)
4. **Sanitize `PARSING_FAILED` details** — No raw error_details in response (ERR-04)
5. **Clarify `DUPLICATE_RESUME`** — Should be `DOCUMENT_REUSED` success path (ERR-05)
6. **Add 3 guest/document error codes** — `GUEST_SESSION_EXPIRED`, `GUEST_SESSION_REVOKED`, `DOCUMENT_SOFT_DELETED`
7. **Add `version` field** to envelope (ERR-07)
8. **Add missing DTO fields** — Upload, Status, Parsed-Data, Confirm responses need the fields listed in §5

**After these changes, the contract is ready for implementation.** 🚀

---

**Report Generated:** 2026-08-26
**Agent:** Freebuf
**Status:** APPROVED WITH CHANGES — Ready after 8 fixes
