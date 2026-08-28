# Stage 2 Independent Contract Draft Review Report

**Target Component:** Contract Suite (`contracts/`), Dispatcher Registry (`05-outbox-dispatcher-nestjs`), & FastAPI Worker (`07-fastapi-ai-worker`)  
**Auditor:** Antigravity (Senior Distributed-Systems & API-Contract Reviewer)  
**Date:** 2026-08-26  
**Report File Location:** `04-nestjs-api/04-nestjs-api-app/s1/stage2/antigravity-STAGE-02-CONTRACT-DRAFT-REVIEW.md`  

---

## 1. Executive Verdict

### **APPROVED WITH CHANGES**

*(Reason: The contract drafts `security-scan-task.v1.json`, `candidate-resume-parsed.v1.json`, and `security-scan-result.v1.json` are technically sound, zero-PII, and 100% compliant with JSON Schema Draft 2020-12 standards. However, 3 mandatory implementation fixes are required before runtime contract freeze: adding the missing `/internal/tasks/security/scan` FastAPI handler, updating the Dispatcher registry taskContract reference, and adding Pydantic models).*

---

## 2. File-by-File Review Table

| File | Contract Type | Draft Correctness | Code Compatibility | Audit Result |
|---|---|---|---|---|
| `contracts/tasks/security-scan-task.v1.json` | Task Payload Schema | ✅ Draft 2020-12 valid | 🟡 Needs Pydantic schema in FastAPI | ✅ **PASS** |
| `contracts/events/security-scan-requested.v1.json` | Event Outbox Schema | ✅ Draft 2020-12 valid | ✅ Compatible with `04-nestjs-api` outbox | ✅ **PASS** |
| `contracts/events/candidate-resume-parsed.v1.json` | Event Outbox Schema | ✅ Draft 2020-12 valid | ✅ 100% matches `task_handlers.py` line 236 emission | ✅ **PASS** |
| `contracts/schemas/security-scan-result.v1.json` | DB Result Schema | ✅ Draft 2020-12 valid | ✅ Matches `uploaded_documents.security_scan_result` | ✅ **PASS** |
| `05-outbox-dispatcher-nestjs/src/routing/event-route.registry.ts` | Dispatcher Registry | 🟡 Minor Path Reference | 🟡 Points to event contract instead of task contract | ⚠️ **NEEDS FIX** |
| `07-fastapi-ai-worker/app/api/v1/task_handlers.py` | FastAPI Handler | ❌ Missing Handler | ❌ `/internal/tasks/security/scan` endpoint unbuilt | 🔴 **BLOCKER** |

---

## 3. Contract Compatibility Findings

### A. Security-Scan Task Contract (`security-scan-task.v1.json`):
- **Payload Schema:** `schema_version`, `event_id`, `aggregate_id` (documented as `uploaded_documents.id`), `trace_id`.
- **Security Check:** Signed URLs, storage tokens, and raw binary file contents are correctly EXCLUDED.
- **FastAPI Alignment:** Aligns with document lookup by `uploaded_documents.id` in PostgreSQL.

### B. Security-Scan Event Contract (`security-scan-requested.v1.json`):
- **Payload Removal:** `storage_url` removed from event payload. This prevents storage token leakage and URL expiration issues in persistent outbox logs.
- **Outbox Envelope:** Fully compliant with standard outbox envelope (`schema_version`, `event_id`, `aggregate_type`, `aggregate_id`, `event_type`, `payload`, `occurred_at`).

### C. Candidate Resume Parsed Event (`candidate-resume-parsed.v1.json`):
- **FastAPI Ground Truth Match:** `07-fastapi-ai-worker/app/api/v1/task_handlers.py` line 236 emits:
  ```python
  aggregate_type="candidate", aggregate_id=str(candidate_id), event_type="candidate.resume.parsed",
  payload={"candidate_id": str(candidate_id), "reason": "active_resume_parsed", "trace_id": payload.trace_id}
  ```
- **Verification:** Contract matches exact FastAPI code emission without inventing extra fields.

### D. Security Scan Result Schema (`security-scan-result.v1.json`):
- **Database Column:** Validates JSONB shape for `uploaded_documents.security_scan_result`.
- **Fields:** `verdict` (`clean`, `infected`, `quarantined`, `error`), `scanner` (`provider`, `version`), `scanned_at`, `duration_ms`, `checksum_sha256`, `threats`, `error`.
- **Protection:** Excludes raw file content and sensitive PII.

---

## 4. Security & PII Findings

1. **Token Leakage Prevention:** Removing raw/signed `storage_url` from persistent outbox events prevents security token leakage in DB audit logs.
2. **Zero-PII Payload Policy:** Outbox event payloads contain only system UUIDs (`document_id`, `candidate_id`, `trace_id`), avoiding PII storage in outbox logs.

---

## 5. Dispatcher & FastAPI Integration Findings

1. **Dispatcher Route Registry Fix Required:**  
   In `05-outbox-dispatcher-nestjs/src/routing/event-route.registry.ts` line 82:
   - **Current:** `taskContract: 'contracts/events/security-scan-requested.v1.json'`
   - **Required Fix:** `taskContract: 'contracts/tasks/security-scan-task.v1.json'`
2. **FastAPI Endpoint Handler Missing:**  
   `07-fastapi-ai-worker/app/api/v1/task_handlers.py` currently lacks `@router.post("/tasks/security/scan")`. This endpoint must be implemented before E2E task execution can succeed.

---

## 6. Missing Implementation Dependencies (Severity Classification)

| Gap ID | Source Component | Issue Description | Severity |
|---|---|---|---|
| **GAP-IMP-01** | `07-fastapi-ai-worker` | Endpoint `/internal/tasks/security/scan` handler missing in `task_handlers.py`. | 🔴 **BLOCKER** |
| **GAP-IMP-02** | `05-outbox-dispatcher-nestjs` | Event route registry line 82 references event contract instead of task contract. | 🟡 **HIGH** |
| **GAP-IMP-03** | `07-fastapi-ai-worker` | Pydantic schema model `SecurityScanTaskPayload` missing in `app/schemas/tasks.py`. | 🟡 **HIGH** |
| **GAP-IMP-04** | `06-google-cloud-tasks-queue` | Provisioning JSON file for `security-scan-queue` needs to be defined for deployment. | 🟡 **MEDIUM** |
| **GAP-IMP-05** | Integration Test Suite | E2E contract validation test (Producer ➔ Outbox ➔ Dispatcher ➔ Worker) required. | 🟢 **LOW** |

---

## 7. Exact Required Changes

1. **Update `event-route.registry.ts`:** Change line 82 to reference `'contracts/tasks/security-scan-task.v1.json'`.
2. **Implement FastAPI Task Model:** Add `SecurityScanTaskPayload` in `07-fastapi-ai-worker/app/schemas/tasks.py`.
3. **Implement FastAPI Task Handler:** Add `@router.post("/tasks/security/scan")` in `07-fastapi-ai-worker/app/api/v1/task_handlers.py`.

---

## 8. What Should NOT Be Changed

1. **Do NOT revert Draft 2020-12 schema standard.**
2. **Do NOT re-add `storage_url` to event outbox payloads.**
3. **Do NOT touch existing legacy Draft-07 contracts** (`resume-parse-requested.v1.json`).

---

## 9. Stage-2 Readiness Verdict

### **VERDICT: READY FOR CONTRACT FREEZE (with 3 code integration fixes)**

- **Contract Draft Correctness:** 100% Correct.
- **Implementation Completeness:** Pending code addition in FastAPI worker and Dispatcher registry line 82 update.
- **Production Readiness:** Ready once integration code is applied.
