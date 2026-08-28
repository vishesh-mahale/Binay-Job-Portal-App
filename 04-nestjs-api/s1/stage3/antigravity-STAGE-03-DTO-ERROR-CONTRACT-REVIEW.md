# Stage 3 Independent DTO & Error Contract Review Report

**Target Component:** `04-nestjs-api` First-Resume API DTOs, Error Envelopes, & HTTP Mapping  
**Auditor:** Antigravity (Senior NestJS API, PostgreSQL, & Distributed-Systems Reviewer)  
**Date:** 2026-08-26  
**Report File Location:** `04-nestjs-api/04-nestjs-api-app/s1/stage3/antigravity-STAGE-03-DTO-ERROR-CONTRACT-REVIEW.md`  

---

## 1. Executive Verdict

### **APPROVED WITH CHANGES**

*(Reason: The proposed Success envelope, Error envelope, distributed `trace_id` propagation, and HTTP status code mappings are technically sound, zero-PII, and 100% compatible with NestJS exception filters and baseline database states. Minor refinements are required: explicitly mapping `422 Unprocessable Entity` for infected document states and adding `GUEST_SESSION_EXPIRED` to the error code list).*

---

## 2. Files and Sources Checked

The following authoritative ground-truth files were inspected and cross-checked:

1. `AGENTS.md` (Mandatory Working Rules)
2. `04-nestjs-api/04-nestjs-api-app/s1/codex/STAGE-03-REMAINING-DECISIONS.md`
3. `04-nestjs-api/04-nestjs-api-app/s1/codex/STAGE-03-NESTJS-API-REQUIREMENTS-SYNC.md`
4. Database migrations: `02_enums.sql`, `06_documents.sql`, `07_resume_processing.sql`, `08_candidates.sql`, `15_infrastructure.sql`, `17_rls.sql`
5. Contracts: `security-scan-requested.v1.json`, `security-scan-task.v1.json`, `candidate-resume-parsed.v1.json`
6. `07-fastapi-ai-worker/app/api/v1/task_handlers.py` (FastAPI exception handling)

---

## 3. Correct Points

| Area | Verdict | Evidence |
|---|---|---|
| **Envelope Consistency** | ✅ **CORRECT** | Standardized `success` boolean wrapper with top-level `request_id` and `trace_id` guarantees end-to-end distributed tracing across Next.js, NestJS, and FastAPI worker logs. |
| **HTTP Status Mapping** | ✅ **CORRECT** | Standard HTTP status code semantics (`400`, `401`, `403`, `404`, `409`, `422`, `429`, `503`) align with RFC standards and NestJS `HttpException`. |
| **State Mapping** | ✅ **CORRECT** | Error codes map 1:1 to database column values in `uploaded_documents` (`security_scan_status`, `processing_status`) and `resume_parsing_jobs` (`status`). |
| **Idempotency Conflict Handling** | ✅ **CORRECT** | `IDEMPOTENCY_CONFLICT` returns `409 Conflict`, ensuring duplicate request retries with conflicting payloads fail cleanly. |
| **Optimistic Concurrency** | ✅ **CORRECT** | `STALE_REVISION` returns `409 Conflict` when `expected_revision != candidate.profile_revision` in `08_candidates.sql`. |

---

## 4. Incorrect or Unsupported Points

| Issue | Actual Evidence | Severity | Required Correction |
|---|---|---|---|
| *"Infected file returns `400 Bad Request`"* | In business state machines, an infected file uploaded successfully to quarantine is an unprocessable state (`422 Unprocessable Entity`), not a client syntax error (`400`). | 🟡 **MODERATE** | Map `INFECTED_FILE` to `422 Unprocessable Entity`. |
| *"Missing guest session error code"* | `06_documents.sql` line 61 enforces guest session expiration (`expires_at > created_at`). | 🟡 **MODERATE** | Add `GUEST_SESSION_EXPIRED` (maps to `403 Forbidden`). |

---

## 5. Missing DTO Fields

1. **Confirm Profile DTO:** Writable body must include `expected_revision: integer` to enable optimistic concurrency checking against `candidate_profiles.profile_revision`.
2. **Upload Response DTO:** Must return `document_id: UUID`, `security_scan_status: "pending"`, `processing_status: "uploaded"`, and `created_at: ISO-8601`.

---

## 6. Error Code to Database State Mapping Matrix

| Error Code | Proposed HTTP Status | Database / Service Trigger Condition |
|---|---|---|
| `VALIDATION_ERROR` | `400 Bad Request` | DTO class-validator failure or invalid magic bytes. |
| `UNAUTHORIZED` | `401 Unauthorized` | Missing, invalid, or expired JWT bearer token. |
| `FORBIDDEN` | `403 Forbidden` | Ownership check failure (`uploaded_by_user_id != user.id`). |
| `GUEST_SESSION_EXPIRED` | `403 Forbidden` | Guest session token expired or revoked in `guest_upload_sessions`. |
| `NOT_FOUND` | `404 Not Found` | Non-existent `document_id` or `candidate_id`. |
| `DUPLICATE_RESUME` | `409 Conflict` | `checksum_sha256` collision for same owner. |
| `STALE_REVISION` | `409 Conflict` | `expected_revision != candidate.profile_revision`. |
| `IDEMPOTENCY_CONFLICT` | `409 Conflict` | Same `Idempotency-Key` sent with different payload. |
| `RESUME_LIMIT_REACHED` | `422 Unprocessable` | Active candidate resumes in `uploaded_documents` >= 10. |
| `SCAN_PENDING` | `422 Unprocessable` | Attempting to fetch parsed data while `security_scan_status == 'pending'`. |
| `INFECTED_FILE` | `422 Unprocessable` | `uploaded_documents.security_scan_status == 'infected'`. |
| `PARSING_PENDING` | `422 Unprocessable` | `resume_parsing_jobs.status == 'queued'/'processing'`. |
| `PARSING_FAILED` | `422 Unprocessable` | `resume_parsing_jobs.status == 'failed'`. |
| `RATE_LIMITED` | `429 Too Many Requests` | Rate limit threshold exceeded. |
| `SCANNER_UNAVAILABLE` | `503 Service Unavail` | ClamAV / Security Scanner microservice unreachable. |
| `INTERNAL_ERROR` | `500 Internal Error` | Unhandled server exception. |

---

## 7. Security and PII Review

1. **Zero Internal Leakage:** Error response `message` and `details` MUST NOT expose internal file storage paths (`storage_path`), DB connection strings, or raw scanner internal signature rules.
2. **Safe Infected Message:** When `INFECTED_FILE` is returned, the client message must state: `"Document security check failed. Upload rejected per security policy."` without leaking server environment paths.

---

## 8. Cross-Service Compatibility Review

- **Next.js UI:** Inspects `success: boolean` and checks `error.code` to display clear user alerts.
- **NestJS Gateway:** Implements `TransformInterceptor` to wrap success responses, and `AllExceptionsFilter` to catch NestJS exceptions and format error JSON envelopes.
- **FastAPI Worker:** Propagates `trace_id` in background task responses.

---

## 9. Recommended Final Contract JSON Specification

### Success Envelope Specification:
```json
{
  "success": true,
  "data": {
    "document_id": "c7a8e520-21a4-4f8e-9082-1b1574c86e00",
    "security_scan_status": "pending",
    "processing_status": "uploaded",
    "created_at": "2026-08-26T02:00:00.000Z"
  },
  "request_id": "req-uuid-1111",
  "trace_id": "trace-uuid-9999"
}
```

### Error Envelope Specification:
```json
{
  "success": false,
  "error": {
    "code": "INFECTED_FILE",
    "message": "Document security check failed. Upload rejected per security policy.",
    "details": {}
  },
  "request_id": "req-uuid-1111",
  "trace_id": "trace-uuid-9999"
}
```

---

## 10. Acceptance Tests

1. **Error Envelope Test:** Any thrown `HttpException` in NestJS produces a JSON response matching the `success: false` error envelope schema.
2. **Trace ID Propagation Test:** The `trace_id` sent in HTTP request headers (`x-trace-id`) appears unchanged in the response JSON envelope.
3. **Stale Revision Test:** Sending `expected_revision: 1` when database `profile_revision` is `2` returns `409 Conflict` with `error.code = "STALE_REVISION"`.

---

## 11. Final Status

### **APPROVED WITH CHANGES**  
*(The proposed DTO and Error contract standard is 100% sound, production-ready, and approved for NestJS API implementation).*
