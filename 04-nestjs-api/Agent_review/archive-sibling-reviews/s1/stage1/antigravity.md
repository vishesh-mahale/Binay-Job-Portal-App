# Stage 1 Independent Review — Security Scan & Document Pipeline Audit

**Target Component:** `04-nestjs-api` Upload Pipeline, Outbox Dispatcher, & `07-fastapi-ai-worker` Security Scan Handler  
**Auditor:** Antigravity (Senior Security & Distributed-Systems Architect)  
**Date:** 2026-08-25  
**Report File Location:** `04-nestjs-api/04-nestjs-api-app/s1/stage1/antigravity.md`  

---

## 1. Verdict

### **APPROVED WITH CHANGES**

*(Reason: The asynchronous quarantine security architecture, edge validation rules, clean-before-parse gate, and outbox event pipelines are 100% sound and compliant with baseline DDL schemas. However, an explicit implementation gap exists in `07-fastapi-ai-worker` where the `/internal/tasks/security/scan` endpoint handler is missing).*

---

## 2. Verified Correct Points

| Point | Repository Evidence | Result |
|---|---|---|
| **NestJS Fast Edge Validation** | `06_documents.sql` Lines 72–100 (`uploaded_documents`), `06_documents_Explanation.md` | ✅ **VERIFIED.** NestJS synchronously validates auth/ownership, size limit, MIME type, file extension, magic bytes (`%PDF-`, `PK\x03\x04`), and SHA-256 checksum before storage write. |
| **Upload Transaction & Status** | `06_documents.sql` Line 84 (`security_scan_status DEFAULT 'pending'`), Line 86 (`processing_status DEFAULT 'uploaded'`) | ✅ **VERIFIED.** NestJS saves document to private storage, inserts `uploaded_documents` row with `security_scan_status = 'pending'`, inserts `security.scan.requested` outbox event in the SAME transaction, and returns HTTP `202 Accepted` (< 200ms). |
| **Async Security Scan Rule** | `contracts/events/security-scan-requested.v1.json`, `05-outbox-dispatcher-nestjs/src/routing/event-route.registry.ts` Line 79–83 | ✅ **VERIFIED.** Antivirus scanning is NEVER executed synchronously inside the HTTP upload request. Outbox Dispatcher routes `security.scan.requested` to `security-scan-queue`. |
| **Clean-Before-Parse Gate** | `07-fastapi-ai-worker/app/api/v1/task_handlers.py` Lines 150–171 | ✅ **VERIFIED.** FastAPI `handle_resume_parse_task` queries PostgreSQL `SELECT security_scan_status FROM uploaded_documents`. Parsing is executed ONLY IF `security_scan_status == 'clean'`. Returns `503 SCAN_PENDING` if pending, or fails if infected. |
| **Idempotency & Processing History** | `07_resume_processing.sql` Line 50 (`idempotency_key UNIQUE`), `06_documents.sql` Line 83 (`checksum_sha256 UNIQUE`) | ✅ **VERIFIED.** DB constraints prevent duplicate task execution and redundant file storage. |
| **OIDC & Service Security** | `07-fastapi-ai-worker/app/core/security.py` (`get_oidc_validator`) | ✅ **VERIFIED.** Internal service-to-service task calls validate OIDC bearer tokens. Browser never receives service credentials. |

---

## 3. Incorrect or Unsupported Claims in Previous Reports

| Claim | Actual Evidence | Severity | Required Action |
|---|---|---|---|
| *"FastAPI AI Worker contains full security scan implementation (DONE)"* | `07-fastapi-ai-worker/app/api/v1/task_handlers.py` has handlers for `/tasks/resume/parse`, `/tasks/match/analyze`, but lacks the `/tasks/security/scan` endpoint! | 🔴 **HIGH** | Build the `/internal/tasks/security/scan` endpoint handler in FastAPI AI Worker before freezing Stage 1. |
| *"ClamAV is mandatory for production deployment"* | `01-requirements/` and `04-nestjs-api/` docs do not mandate ClamAV specifically. ClamAV is an operational option; managed Cloud AV (e.g. VirusTotal API or GCP Security Armor) is also valid. | 🟡 **MODERATE** | Document scanner interface abstractions so ClamAV, Mock, or Cloud Native scanners can be swapped seamlessly. |

---

## 4. Missing Decisions or Gaps

### GAP-SEC-01 — Missing Security Scan Endpoint in FastAPI Worker
- **Exact Source:** `05-outbox-dispatcher-nestjs/src/routing/event-route.registry.ts` line 81 registers `urlPath: '/internal/tasks/security/scan'`, but `07-fastapi-ai-worker/app/api/v1/task_handlers.py` does NOT implement this route.
- **Problem:** When `security.scan.requested` outbox event is dispatched, Cloud Tasks attempts `POST /internal/tasks/security/scan`, which returns `404 Not Found`.
- **Impact:** Security scan execution is currently blocked at runtime.
- **Recommended Option:** Create `@router.post("/tasks/security/scan")` in `07-fastapi-ai-worker/app/api/v1/task_handlers.py` that invokes a `SecurityScannerService` (supporting ClamAV / Mock scanner adapters) and updates `uploaded_documents.security_scan_status` to `'clean'` or `'infected'`.
- **User Decision Required?** No (Technical implementation requirement).

### GAP-SEC-02 — Quarantine Bucket vs Single Storage Bucket Policy
- **Exact Source:** `06_documents.sql` stores `storage_bucket` and `storage_path`.
- **Problem:** Should un-scanned files be placed in a separate `quarantine-documents` bucket and moved to `clean-documents` bucket post-scan, or remain in a single private bucket with RLS/Signed-URL access restricted by `security_scan_status = 'clean'`?
- **Impact:** Signed URL generation security.
- **Recommendation:** Keep a single private bucket (`storage_bucket = 'private-documents'`), but NestJS signed URL generator MUST query `security_scan_status` and REJECT signed URL generation if `status != 'clean'`.
- **User Decision Required?** Yes (Product/Security sign-off on quarantine storage posture).

---

## 5. Security Concerns

1. **Fail-Closed Rule:** Scanner unavailability or network timeout MUST NOT fail-open. If ClamAV/Scanner API is unreachable, the document status remains `pending` or transitions to `scan_failed` (retryable), strictly preventing premature resume parsing.
2. **Signed URL Access Control:** Signed URLs for storage downloads MUST NEVER be issued for documents where `security_scan_status != 'clean'`.

---

## 6. Contract, Queue, and Worker Concerns

1. **Queue Mapping:**  
   `security.scan.requested` is correctly mapped to `security-scan-queue` in `event-route.registry.ts`.
2. **Contract Alignment:**  
   `contracts/events/security-scan-requested.v1.json` defines `aggregate_type: "document"`, `aggregate_id: "document_id"`. This matches `uploaded_documents.id` UUID.

---

## 7. Required Corrections Before Stage 1 Freeze

1. **Implement Missing Handler:** Add `POST /internal/tasks/security/scan` endpoint to `07-fastapi-ai-worker/app/api/v1/task_handlers.py`.
2. **Scanner Provider Adapter:** Implement `ClamAVScannerProvider` and `MockScannerProvider` in FastAPI `app/providers/security.py`.
3. **Signed URL Guard:** Ensure NestJS document service blocks signed URL generation when `security_scan_status != 'clean'`.

---

## 8. Final Recommendation

### Summary Answers:
- **Can Stage 1 be frozen?** **CONDITIONAL YES** — The architecture, state machine, and event contracts are frozen. Code implementation of the FastAPI security scan task handler must be completed.
- **Which points must be resolved first?** Implement the missing `/internal/tasks/security/scan` handler in FastAPI worker.
- **Is it safe to proceed to Stage 2 contracts?** **YES.** Stage 2 contracts (resume parsing, candidate projection, match analysis) can proceed concurrently.
