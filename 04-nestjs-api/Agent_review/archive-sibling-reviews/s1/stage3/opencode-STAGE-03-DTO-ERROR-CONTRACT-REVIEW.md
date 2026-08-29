# Stage 03 — DTO and Error Contract Review

> **Independent verification of the proposed error codes, DTO structure, HTTP mapping,
> idempotency, PII safety, and cross-service compatibility for the four NestJS resume APIs.**

Date: 2026-08-26
Target: `STAGE-03-REMAINING-DECISIONS.md` §1 (DTOs, status codes and error contract)
Reviewer: OpenCode

## 1. Executive verdict

```text
Reviewer:              OpenCode
Verdict:               APPROVED WITH CHANGES
Scope:                 Error codes, HTTP mapping, DTO field correctness, PII safety,
                       idempotency/concurrency mechanics, guest-upload error paths,
                       cross-service error compatibility
Blocking issues:       3 (error-code naming mismatch, error envelope format inconsistency,
                       missing QUARANTINED/EXPIRED_SESSION codes)
Non-blocking findings: 5
Coding authorized:     NO — report only
```

## 2. Sources verified

| Source | What was checked |
|---|---|
| `STAGE-03-REMAINING-DECISIONS.md` | §1 error families, §8 idempotency/concurrency |
| `STAGE-03-NESTJS-API-REQUIREMENTS-SYNC.md` | Four API flows, DTOs, validation rules, error behavior |
| `STAGE-03-CONSOLIDATED-REMAINING-DECISIONS-REVIEW.md` | Consolidated corrections, frozen constraints |
| `02-database/migrations/baseline/02_enums.sql` | `security_scan_status` (:527-528), `resume_processing_status` (:302-311), `parsing_job_status` (:535-537), `guest_upload_session_status` (:531-533) |
| `02-database/migrations/baseline/06_documents.sql` | `uploaded_documents` (:72-106), `guest_upload_sessions` (:51-70), checksum unique indexes (:122-130) |
| `02-database/migrations/baseline/07_resume_processing.sql` | `resume_parsing_jobs` (:39-67), `idempotency_key` (:50) |
| `02-database/migrations/baseline/08_candidates.sql` | `candidate_profiles` (:46-75), `profile_revision` (:73) |
| `07-fastapi-ai-worker/app/core/exceptions.py` | Full exception hierarchy (235 lines) |
| `07-fastapi-ai-worker/app/api/v1/task_handlers.py` | Security scan handler (:62-185), resume parse handler (:220-449) |
| `NESTJS-IMPLEMENTATION-GUIDE.md` | §6 profile save (:204-234), §8 upload (:257-270), §9 parsing (:272-301) |
| `PHASE-04-STATE-MACHINES-AND-TRANSACTIONS.md` | Lifecycle states, legal transitions, guest claim machine |

## 3. Error code validation against database enums

### 3.1 Proposed error codes vs actual DB states

| Proposed error code | HTTP status | DB enum source | Verdict |
|---|---|---|---|
| `VALIDATION_ERROR` | 422 | General | ✅ Correct |
| `UNAUTHORIZED` | 401 | Auth | ✅ Correct |
| `FORBIDDEN` | 403 | Auth | ✅ Correct |
| `NOT_FOUND` | 404 | General | ✅ Correct |
| `DUPLICATE_RESUME` | 409 | DB unique index | ⚠️ Rename needed — see §4.1 |
| `RESUME_LIMIT_REACHED` | 409 | PD-002 10-limit | ✅ Correct |
| `SCAN_PENDING` | 503 | `security_scan_status IN ('pending','scanning')` | ✅ Correct |
| `SCAN_FAILED` | 422 | `security_scan_status = 'failed'` | ⚠️ Rename needed — see §4.2 |
| `INFECTED_FILE` | 422 | `security_scan_status = 'infected'` | ⚠️ Rename needed — see §4.2 |
| `PARSING_PENDING` | 503 | `resume_processing_status IN ('uploaded','queued','processing')` | ✅ Correct |
| `PARSING_FAILED` | 422 | `resume_processing_status IN ('failed','partial')` | ✅ Correct |
| `STALE_REVISION` | 409 | `profile_revision` mismatch | ✅ Correct |
| `IDEMPOTENCY_CONFLICT` | 409 | `Idempotency-Key` header | ✅ Correct |
| `RATE_LIMITED` | 429 | Rate limit guard | ✅ Correct |
| `INTERNAL_ERROR` | 500 | Catch-all | ✅ Correct |

### 3.2 Missing error codes (BLOCKING)

| Missing code | HTTP status | Source | Required by |
|---|---|---|---|
| `SESSION_EXPIRED` / `SESSION_REVOKED` | 403 | `guest_upload_session_status IN ('expired','revoked')` | Guest upload flow — `06_documents.sql:56` |
| `QUARANTINED` | 422 | `security_scan_status = 'quarantined'` | Scanner terminal state — `02_enums.sql:528` |
| `GUEST_SESSION_CONSUMED` | 409 | `guest_upload_session_status = 'consumed'` | Guest claim — `09_applications.sql` |
| `DOCUMENT_SOFT_DELETED` | 404 | `uploaded_documents.deleted_at IS NOT NULL` | Confirm/status on deleted doc |

**Impact:** Without `SESSION_EXPIRED` and `QUARANTINED`, the NestJS API has no distinct code to return when a guest session is expired/revoked or a document is quarantined. The current proposal lumps these into generic `FORBIDDEN` or `SCAN_FAILED`, which loses diagnostic value for the client.

## 4. Error code naming mismatches

### 4.1 `DUPLICATE_RESUME` should be `DUPLICATE_DOCUMENT` (BLOCKING)

The database enforces uniqueness at the **document checksum + owner** level, not at the "resume" concept level. The unique indexes are:

```sql
-- 06_documents.sql:122-130
CREATE UNIQUE INDEX uq_uploaded_document_checksum_owner
    ON uploaded_documents(uploaded_by_user_id, checksum_sha256)
    WHERE uploaded_by_user_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX uq_uploaded_document_checksum_guest_session
    ON uploaded_documents(guest_upload_session_id, checksum_sha256)
    WHERE guest_upload_session_id IS NOT NULL AND deleted_at IS NULL;
```

The error should reflect the actual constraint: **same owner + same checksum = reuse existing document**. Using `DUPLICATE_RESUME` implies the system tracks resume identity, but the DB tracks document checksum identity. Rename to `DUPLICATE_DOCUMENT` or `DOCUMENT_REUSED` to match the approved reuse rule (Guide §8.4: "Same owner/session + checksum document मिले तो existing document reuse करेगा").

### 4.2 `SCAN_FAILED` and `INFECTED_FILE` naming (BLOCKING)

The DB enum values are `failed` and `infected`. The error codes should mirror the enum naming for clarity:

| Current proposal | DB enum | Recommended |
|---|---|---|
| `SCAN_FAILED` | `security_scan_status = 'failed'` | `SCAN_FAILED` (acceptable — maps to enum) |
| `INFECTED_FILE` | `security_scan_status = 'infected'` | `SECURITY_INFECTED` (aligns with `security_scan_status` prefix) |

Additionally, the FastAPI worker currently returns `DocumentSecurityError` with `internal_code = "DOCUMENT_SECURITY_ERROR"` for both infected and quarantined states (`task_handlers.py:282-297`). The NestJS error code should not conflict with the worker's internal code naming, but must be distinct for the client-facing API.

## 5. HTTP status code review

### 5.1 Correct mappings

| Code | Status | Justification |
|---|---|---|
| `VALIDATION_ERROR` | 422 | Standard for semantic validation failure |
| `UNAUTHORIZED` | 401 | Standard for missing/invalid auth |
| `FORBIDDEN` | 403 | Standard for ownership violation |
| `NOT_FOUND` | 404 | Standard for missing resource |
| `RATE_LIMITED` | 429 | Standard for rate limiting |
| `INTERNAL_ERROR` | 500 | Standard for server errors |
| `STALE_REVISION` | 409 | Correct — optimistic concurrency conflict |
| `IDEMPOTENCY_CONFLICT` | 409 | Correct — idempotency key mismatch |
| `SCAN_PENDING` | 503 | Correct — temporary unavailability |
| `PARSING_PENDING` | 503 | Correct — temporary unavailability |

### 5.2 Non-standard HTTP status for `RESUME_LIMIT_REACHED` (NON-BLOCKING)

`RESUME_LIMIT_REACHED` is proposed as 409, but this is a **business rule validation**, not a concurrency conflict. More appropriate options:

- **422 Unprocessable Entity** — the request is semantically invalid per business rules
- **403 Forbidden** — the action is allowed but the limit prevents it (less clear)
- **409 Conflict** — acceptable if framed as "conflict with the 10-resume library constraint"

Recommendation: **422** for `RESUME_LIMIT_REACHED` is more semantically accurate, but 409 is defensible. The consolidated decision should pick one and document the rationale.

### 5.3 FastAPI worker returns HTTP 200 for most errors (OBSERVATION — no action needed)

The FastAPI exception hierarchy (`exceptions.py`) returns HTTP 200 for `DuplicateTaskError`, `LockAcquisitionError`, `DocumentValidationError`, `DocumentExtractionError`, `DocumentSizeLimitError`, `DocumentSecurityError`, and `AIProviderError` (non-retryable). This is intentional for Cloud Tasks semantics — the task is "accepted" by the worker, and the error is recorded in the processing result. The NestJS API must **not** follow this pattern; NestJS client-facing endpoints should use standard HTTP status codes.

## 6. Error envelope format

### 6.1 Inconsistency with FastAPI worker (NON-BLOCKING)

The FastAPI worker uses a nested envelope:

```python
# exceptions.py:26-33
{
    "error": {
        "code": self.internal_code,
        "message": self.message,
        "details": self.details if bool(self.details) else None
    }
}
```

The proposed NestJS envelope (from consolidated review recommendations) is:

```json
{
    "code": "VALIDATION_ERROR",
    "message": "...",
    "trace_id": "..."
}
```

**Finding:** The two services use different envelope shapes. This is acceptable because they serve different audiences (Cloud Tasks internal vs browser client), but the NestJS envelope should be explicitly frozen. The `trace_id` field must be the request-scoped correlation ID (not the task-level `trace_id` from Cloud Tasks payloads).

### 6.2 `request_id` vs `trace_id` distinction (NON-BLOCKING)

- `trace_id` in task payloads (`contracts/tasks/*.v1.json`): propagated from NestJS through Cloud Tasks to FastAPI for distributed tracing
- `request_id`: client-generated or server-generated per HTTP request for API debugging

The proposed envelope uses `trace_id` but should clarify which ID it is. If it's the request-scoped ID, call it `request_id` or `correlation_id`. If it's the distributed trace ID, `trace_id` is correct.

Recommendation: Use `trace_id` for distributed tracing (consistent with task contracts) and add an optional `details` object for field-level validation errors.

### 6.3 Recommended final envelope

```json
{
    "statusCode": 422,
    "error": "VALIDATION_ERROR",
    "message": "File type not allowed",
    "trace_id": "abc-123-def",
    "details": {
        "field": "file",
        "constraint": "mime_type",
        "allowed": ["application/pdf", "image/jpeg"],
        "received": "application/msword"
    }
}
```

This keeps the `error` code machine-readable, `message` human-readable, `trace_id` for correlation, and `details` for actionable field-level errors (non-PII).

## 7. PII and security review

### 7.1 PII in error messages (BLOCKING-ADJACENT — fix before freeze)

| Risk | Location | Finding |
|---|---|---|
| `original_file_name` in error messages | Upload validation errors | ⚠️ If the error message includes the uploaded filename, it may leak PII (e.g., `John_Doe_Resume.pdf`). The `message` field should use generic descriptions ("File type not allowed") without echoing the filename. |
| Document ID in error messages | Status/parsed-data/confirm errors | ✅ `document_id` is a UUID, not PII. Safe to include. |
| Guest email in error messages | Guest session validation | ⚠️ If a guest session validation error includes the email, it leaks PII. Keep email out of error messages. |
| Stack traces in error responses | All endpoints | ✅ The proposal correctly excludes stack traces. FastAPI worker also does not include stack traces in `to_dict()`. |
| Security scan details in error messages | Infected/quarantined responses | ⚠️ The message should not include ClamAV signature names or malware types. Use generic "Document failed security check" (consistent with FastAPI `DocumentSecurityError`). |

### 7.2 Ownership leak via NOT_FOUND vs FORBIDDEN (CORRECT)

The requirement states: "Unauthorized document IDs return the approved not-found/forbidden behavior without leaking ownership" (`STAGE-03-NESTJS-API-REQUIREMENTS-SYNC.md:153`). The approved pattern is:

- Document does not exist → `NOT_FOUND`
- Document exists but belongs to another user → `NOT_FOUND` (not `FORBIDDEN`, to avoid confirming existence)

This is the standard ownership-safe pattern. The error contract should enforce: **both "not found" and "forbidden" return the same 404 response**. Never distinguish between "does not exist" and "belongs to someone else."

## 8. Idempotency and optimistic concurrency

### 8.1 Idempotency-Key scope and behavior (CORRECT)

| Aspect | Proposed | Verified against | Verdict |
|---|---|---|---|
| Header name | `Idempotency-Key` | HTTP convention; `resume_parsing_jobs.idempotency_key` (:50) | ✅ Correct |
| Upload scope | user + checksum | Guide §8.4 reuse rule; `06_documents.sql` unique indexes (:122-130) | ✅ Correct |
| Confirm scope | user + document | Guide §6 revision check; `profile_revision` | ✅ Correct |
| Same-key replay | Return original response | Idempotency standard | ✅ Correct |
| Different-key duplicate | Reject with `IDEMPOTENCY_CONFLICT` | Must not silently create second logical action | ✅ Correct |

### 8.2 Optimistic concurrency on confirm (CORRECT)

The confirm flow correctly requires an `expected_profile_revision` field. The mechanism:

1. Client reads current `profile_revision` from status/parsed-data response
2. Client submits confirm with `expected_profile_revision = N`
3. NestJS verifies `candidate_profiles.profile_revision = N` (with `FOR UPDATE` lock)
4. If mismatch → `409 Conflict` with `STALE_REVISION` code
5. If match → proceed with one revision bump via `bump_candidate_profile_revision()`

This matches Guide §6 (:204-234) and is correct.

### 8.3 Stale revision response should include current revision (NON-BLOCKING)

When `STALE_REVISION` is returned, the response should include both the expected and current revision numbers so the client can re-fetch and retry:

```json
{
    "error": "STALE_REVISION",
    "message": "Profile has been modified since last read",
    "details": {
        "expected_revision": 5,
        "current_revision": 7
    }
}
```

## 9. Guest upload error paths

### 9.1 Guest session validation errors (BLOCKING — missing codes)

The guest upload flow requires checking (`06_documents.sql:51-70`):

| Check | DB source | Error code needed |
|---|---|---|
| Session not found | `guest_upload_sessions.id` lookup | `NOT_FOUND` ✅ |
| Session not active | `status != 'active'` | `SESSION_EXPIRED` (missing) |
| Session expired | `expires_at < NOW()` | `SESSION_EXPIRED` (missing) |
| Session revoked | `revoked_at IS NOT NULL` | `SESSION_REVOKED` (missing) |
| Count limit exceeded | `uploaded_count >= max_upload_count` | `GUEST_UPLOAD_LIMIT` (missing) |
| Byte limit exceeded | `uploaded_bytes >= max_total_bytes` | `GUEST_UPLOAD_LIMIT` (missing) |
| Wrong job scope | `job_id` mismatch | `FORBIDDEN` ✅ |

### 9.2 Guest claim errors (NON-BLOCKING — scope boundary)

The guest claim machine (`09_applications.sql`, PHASE-04 §8.2) has states `pending`, `verified`, `completed`, `rejected`. Claim errors (`GUEST_SESSION_CONSUMED`, `CLAIM_REJECTED`) are out of scope for this resume-API review but should be added to the error catalog when the guest claim API is designed.

## 10. Cross-service error compatibility

### 10.1 NestJS → FastAPI error mapping (NON-BLOCKING)

The NestJS API never calls FastAPI synchronously during a request. The async path is:

```
NestJS → outbox event → dispatcher → Cloud Tasks → FastAPI
```

Therefore, NestJS error codes and FastAPI error codes do not need to match. They serve different audiences:

| Service | Audience | Error pattern |
|---|---|---|
| NestJS API | Browser/Next.js client | Standard HTTP status + machine-readable code |
| FastAPI Worker | Cloud Tasks (internal) | HTTP 200 for accepted tasks; error recorded in `processed_events` and `resume_parsing_job_events` |

The NestJS status/parsed-data endpoints read DB state that FastAPI writes. The two services must agree on **enum values** (they do — both use `security_scan_status` and `resume_processing_status`), but not on HTTP error codes.

### 10.2 Scanner error states fully covered

| DB state | NestJS API response | FastAPI worker behavior | Compatible? |
|---|---|---|---|
| `pending` | `SCAN_PENDING` (503) | Not yet reached | ✅ |
| `scanning` | `SCAN_PENDING` (503) | Handler in progress | ✅ |
| `clean` | Allow processing | Proceeds to parsing | ✅ |
| `infected` | `INFECTED_FILE` (422) | `DocumentSecurityError` → marks failed | ✅ |
| `failed` | `SCAN_FAILED` (422) | `DocumentValidationError` → marks failed | ✅ |
| `quarantined` | Missing code | `DocumentSecurityError` → marks failed | ⚠️ Add code |

## 11. Correct points from the proposal

1. Error families cover the required families from `STAGE-03-REMAINING-DECISIONS.md:20` (validation, auth, ownership, conflict/stale, not-ready, infected/failed, scanner unavailable, rate limited).
2. `STALE_REVISION` with HTTP 409 is correct and matches Guide §6 (:234).
3. `SCAN_PENDING` with HTTP 503 correctly signals temporary unavailability.
4. `IDEMPOTENCY_CONFLICT` as a distinct error code from `STALE_REVISION` is correct — they are different failure modes.
5. The proposal correctly excludes PII from error messages in its examples.
6. `RESUME_LIMIT_REACHED` correctly maps to the PD-002 10-resume library constraint.

## 12. Incorrect or incomplete points

1. `DUPLICATE_RESUME` misnames the constraint — should be `DUPLICATE_DOCUMENT` (§4.1).
2. `INFECTED_FILE` should use the `security_scan_status` prefix for consistency → `SECURITY_INFECTED` (§4.2).
3. Missing `SESSION_EXPIRED`, `SESSION_REVOKED`, `QUARANTINED`, `GUEST_SESSION_CONSUMED`, `DOCUMENT_SOFT_DELETED` error codes (§3.2).
4. Error envelope format is not frozen and has inconsistency with FastAPI worker envelope (§6.1-6.3).
5. `RESUME_LIMIT_REACHED` as HTTP 409 is debatable — 422 may be more semantically accurate (§5.2).

## 13. Recommended final error catalog

| Error code | HTTP status | When to use | Source |
|---|---|---|---|
| `VALIDATION_ERROR` | 422 | Request body/params fail schema or business validation | General |
| `UNAUTHORIZED` | 401 | Missing, expired, or invalid authentication token | Auth guard |
| `FORBIDDEN` | 403 | Authenticated but not authorized for this resource | Ownership check |
| `NOT_FOUND` | 404 | Resource does not exist OR belongs to another user (ownership-safe) | DB lookup |
| `DUPLICATE_DOCUMENT` | 409 | Same owner/session + SHA-256 checksum already exists (reuse, not error) | `06_documents.sql` unique index |
| `RESUME_LIMIT_REACHED` | 422 | Active profile-resume library has 10 items; archive/remove first | PD-002 |
| `SCAN_PENDING` | 503 | Security scan in progress (`pending` or `scanning`) | `security_scan_status` |
| `SCAN_FAILED` | 422 | Security scan terminal failure (`failed`) | `security_scan_status` |
| `SECURITY_INFECTED` | 422 | Document infected or quarantined (`infected` or `quarantined`) | `security_scan_status` |
| `PARSING_PENDING` | 503 | Parsing not yet complete (`uploaded`, `queued`, `processing`, `ai_enriching`) | `resume_processing_status` |
| `PARSING_FAILED` | 422 | Parsing terminal failure (`failed` or `partial`) | `resume_processing_status` |
| `STALE_REVISION` | 409 | Expected `profile_revision` does not match current | `candidate_profiles.profile_revision` |
| `IDEMPOTENCY_CONFLICT` | 409 | `Idempotency-Key` header conflicts with different payload | Idempotency guard |
| `RATE_LIMITED` | 429 | Per-user or per-session rate limit exceeded | Rate limit guard |
| `SESSION_EXPIRED` | 403 | Guest session expired, revoked, consumed, or not active | `guest_upload_session_status` |
| `DOCUMENT_SOFT_DELETED` | 404 | Document has `deleted_at` set; treat as not found | `uploaded_documents.deleted_at` |
| `INTERNAL_ERROR` | 500 | Unhandled server error | Catch-all |

## 14. Blocking decisions requiring resolution

| ID | Decision | Recommendation | Owner |
|---|---|---|---|
| B-1 | Error envelope format (flat vs nested, `trace_id` vs `request_id`) | Adopt recommended envelope from §6.3; freeze as API catalog contract | Technical catalog |
| B-2 | Add missing error codes (`SESSION_EXPIRED`, `SECURITY_INFECTED`, `QUARANTINED`, `DOCUMENT_SOFT_DELETED`) | Add to catalog; update STAGE-03-REMAINING-DECISIONS §1 | Technical catalog |
| B-3 | `RESUME_LIMIT_REACHED` HTTP status (409 vs 422) | Choose 422; document rationale as "business rule validation, not concurrency conflict" | Technical catalog |
| B-4 | PII in error messages — forbid filename/email in `message` field | Add explicit rule: error `message` must not echo user-provided file names, emails, or file content | Security review |

## 15. Non-blocking findings (recommend for catalog freeze)

| ID | Finding | Action |
|---|---|---|
| NB-1 | Stale revision response should include `expected_revision` and `current_revision` in `details` | Add to recommended envelope |
| NB-2 | FastAPI worker HTTP 200 for errors is internal-only; document that NestJS uses standard HTTP | Note in catalog preamble |
| NB-3 | Guest claim errors (`GUEST_SESSION_CONSUMED`, `CLAIM_REJECTED`) are out of scope for this review | Carry forward to guest-claim API catalog |
| NB-4 | `PARSING_FAILED` should cover both `failed` and `partial` processing status | Clarify in error code description |
| NB-5 | Confirm DTO `expected_profile_revision` should be required, not optional | Mark as mandatory field |

## 16. Acceptance criteria for error contract freeze

- [ ] All error codes in §13 are added to `STAGE-03-REMAINING-DECISIONS.md` §1
- [ ] Error envelope format from §6.3 is frozen in the API catalog
- [ ] PII rule (no filename/email in `message`) is added to §1
- [ ] `RESUME_LIMIT_REACHED` HTTP status is decided and documented
- [ ] Missing codes (`SESSION_EXPIRED`, `SECURITY_INFECTED`, `DOCUMENT_SOFT_DELETED`) are added
- [ ] Stale revision response includes `details.expected_revision` and `details.current_revision`
- [ ] Each error code maps to a specific precondition check in the four API flows

## 17. Summary

The proposed error catalog covers ~70% of the required error families. The main gaps are:

1. **Missing guest-session error codes** — the guest upload flow has 5+ validation checks with no distinct error codes
2. **Error-code naming mismatches** — `DUPLICATE_RESUME` and `INFECTED_FILE` don't align with DB constraints/enums
3. **Error envelope not frozen** — the format is still a recommendation, not a contract
4. **PII safety rule not explicit** — no explicit prohibition on echoing filenames/emails in error messages

Once the 3 blocking items (§14) are resolved, the error contract is ready for catalog freeze.
