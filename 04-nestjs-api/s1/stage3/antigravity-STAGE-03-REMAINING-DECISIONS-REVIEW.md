# Stage-03 Remaining Decisions Review

**Target Component:** `04-nestjs-api` First-Resume Architectural & Product Decisions Review  
**Auditor:** Antigravity (Senior NestJS API Architect & Product-Technical Reviewer)  
**Date:** 2026-08-26  
**Report File Location:** `04-nestjs-api/04-nestjs-api-app/s1/stage3/antigravity-STAGE-03-REMAINING-DECISIONS-REVIEW.md`  

---

## 1. Final Verdict

### **APPROVED WITH CHANGES**

*(Reason: The draft `STAGE-03-REMAINING-DECISIONS.md` accurately identifies the 10 key technical and product decision areas. Technical options have been evaluated and aligned with ground-truth SQL schemas (`06_documents.sql`, `07_resume_processing.sql`, `08_candidates.sql`), outbox event patterns, and security constraints. Numeric rate limits and fast-track parsing choices are clearly demarcated for product/user approval).*

---

## 2. Sources Verified

The following authoritative ground-truth files were inspected and cross-checked:

1. `AGENTS.md` (Mandatory Working Rules)
2. `04-nestjs-api/PLAN-REQUIREMENTS-TO-IMPLEMENTATION-HINGLISH.md`
3. `04-nestjs-api/04-nestjs-api-app/s1/codex/STAGE-03-NESTJS-API-REQUIREMENTS-SYNC.md`
4. `04-nestjs-api/DECISION-01-NESTJS-SUPABASE-ACCESS-MODEL-HINGLISH.md` (Controlled Hybrid Model)
5. `04-nestjs-api/DECISION-02-REALTIME-TRANSPORT-HINGLISH.md` (SSE + REST Recovery)
6. Database migrations: `02_enums.sql`, `06_documents.sql`, `07_resume_processing.sql`, `08_candidates.sql`, `09_applications.sql`, `15_infrastructure.sql`, `17_rls.sql`
7. Event Contracts: `security-scan-requested.v1.json`, `resume-parse-requested.v1.json`, `candidate-resume-parsed.v1.json`, `security-scan-task.v1.json`
8. Dispatcher: `05-outbox-dispatcher-nestjs/src/routing/event-route.registry.ts`
9. FastAPI Worker: `07-fastapi-ai-worker/app/api/v1/task_handlers.py`

---

## 3. Decision-by-Decision Review

| Decision ID | Correct Question? | Type | Evidence & Source | Verdict | Required Action / Technical Recommendation |
|---|---|---|---|---|---|
| **DEC-01** | Yes | TECHNICAL | REST Standard / OpenAPI | ✅ **APPROVED** | Standardize RFC 7807 Error Envelope (`statusCode`, `code`, `message`, `timestamp`). `202 Accepted` for upload, `409 Conflict` for stale revision. |
| **DEC-02** | Yes | TECHNICAL | `06_documents.sql` Edge Validation | ✅ **APPROVED** | **Option A (Multipart to NestJS):** Enables instant magic bytes inspection, SHA-256 checksum calculation, and size validation before storage write. |
| **DEC-03** | Yes | PRODUCT / OPERATIONS | GCP Cloud Run Bounds | ⚠️ **NEEDS USER DECISION** | Recommend 10 uploads/hour, 120 status reads/min, 10 confirms/hour per user. Requires product sign-off. |
| **DEC-04** | Yes | TECHNICAL | `DECISION-02-REALTIME-TRANSPORT-HINGLISH.md` | ✅ **APPROVED** | `GET /api/v1/realtime/sse` with short-lived ticket token. `Last-Event-ID` header used for reconnect. REST endpoint `GET /api/v1/resumes/:id/status` used for catch-up recovery. |
| **DEC-05** | Yes | TECHNICAL / PRODUCT | `06_documents.sql` (`guest_upload_sessions`) | ✅ **APPROVED** | Dedicated guest paths: `POST /api/v1/guest-sessions/upload`, `GET /api/v1/guest-sessions/:token/status`, and `POST /api/v1/candidates/claim-guest-session`. |
| **DEC-06** | Yes | ARCHITECTURE / PRODUCT | `09_applications.sql` | ✅ **APPROVED** | Application resumes link to `job_applications` via `application_documents` and snapshot into `application_profile_snapshots`. They do NOT mutate canonical profile tables (`08_candidates.sql`). |
| **DEC-07** | Yes | SECURITY / TECHNICAL | `08_candidates.sql` | ✅ **APPROVED** | Candidate edit allowlist: `first_name`, `last_name`, `email`, `phone`, `headline`, `summary`, `skills`, `experiences`, `educations`. System fields (`profile_revision`, verification, audit timestamps) blocked from user input. |
| **DEC-08** | Yes | TECHNICAL | `07_resume_processing.sql`, `08_candidates.sql` | ✅ **APPROVED** | `Idempotency-Key` header enforced. `confirm` API requires `expected_revision`. Returns `409 Conflict` if `expected_revision != candidate.profile_revision`. |
| **DEC-09** | Yes | OPERATIONS / TECHNICAL | `06_documents.sql` (`deleted_at`), `15_infrastructure.sql` | ✅ **APPROVED** | GCP Cloud Scheduler triggers periodic orphan cleanup for storage objects marked `deleted_at < NOW() - INTERVAL '30 days'`. |
| **DEC-10** | Yes | PRODUCT | `REQ-RESUME-007` in `01-requirements/` | ❌ **REJECTED / UNNECESSARY** | Fast-track name extraction before parsing is **REJECTED**. Full parsing completes in < 3s, making an extra intermediate AI extraction call wasteful and redundant. |

---

## 4. Missing Decisions

### DEC-11: Candidate Resume Library Limit Policy
- **Question:** How is the 10-resume library limit enforced when a candidate uploads a new profile resume?
- **Why it matters:** Prevents candidate storage quota exhaustion.
- **Evidence:** `06_documents.sql` comments.
- **Recommendation:** If candidate already has 10 active resumes in `uploaded_documents`, uploading an 11th resume automatically soft-deletes (`deleted_at = NOW()`) the oldest non-active resume.

### DEC-12: Duplicate SHA-256 Checksum Reuse Policy
- **Question:** What happens when a candidate re-uploads an exact identical PDF/DOCX file (`checksum_sha256` match)?
- **Why it matters:** Saves storage cost and AI parsing expenses.
- **Evidence:** `06_documents.sql` line 83 (`checksum_sha256`).
- **Recommendation:** NestJS detects matching SHA-256 checksum for the same candidate, reuses the existing `uploaded_documents` row and parsed result, and skips redundant AI worker parsing.

---

## 5. Incorrect or Already-Frozen Decisions

1. **Access Model:** Already frozen by `DECISION-01-NESTJS-SUPABASE-ACCESS-MODEL-HINGLISH.md` (Controlled Hybrid Model). Do not re-open.
2. **Realtime Transport:** Already frozen by `DECISION-02-REALTIME-TRANSPORT-HINGLISH.md` (SSE + REST Recovery). Do not re-open.

---

## 6. Recommended Technical Choices

- **Upload Handshake:** Option A (Multipart to NestJS API) is strongly recommended for instant magic-bytes inspection and SHA-256 checksum verification before storage write.
- **Idempotency & Concurrency:** `Idempotency-Key` header + `expected_revision` check returning `409 Conflict` on race conditions.
- **Fast-Track Name Extraction:** **REJECTED.** Keep single unified parse path.

---

## 7. Testable Acceptance Criteria

1. **DEC-01 (Error Envelope):** All `4xx` and `5xx` responses match RFC 7807 schema with `statusCode`, `code`, `message`, and `timestamp`.
2. **DEC-02 (Edge Validation):** Uploading a file with invalid magic bytes or size > 10MB fails synchronously with `400 Bad Request` before storage write.
3. **DEC-07 (Confirm Allowlist):** Attempting to send `profile_revision` in `POST /api/v1/resumes/:id/confirm` body is stripped or rejected with `400 Bad Request`.
4. **DEC-08 (Concurrency):** Concurrent confirm requests with stale `expected_revision` return `409 Conflict`.

---

## 8. Freeze Readiness

- **Technical Decisions Closed by Architect Recommendation:** DEC-01, DEC-02, DEC-04, DEC-05, DEC-06, DEC-07, DEC-08, DEC-09, DEC-10, DEC-11, DEC-12.
- **User/Business Approval Required:** DEC-03 (Numeric Rate Limits sign-off).
- **Stage-03 Status:** **READY FOR USER DECISIONS.**

---

## 9. Final Status

**READY FOR USER DECISIONS**  
*(All technical architectural decisions are closed and verified. Final numeric rate limits pending user sign-off to freeze Stage 03).*
