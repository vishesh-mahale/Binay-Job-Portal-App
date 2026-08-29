# Stage 2 Independent Contract Review — Contract Finalization & Gap Audit

**Target Component:** Contract Suite (`contracts/`), Dispatcher Registry (`05-outbox-dispatcher-nestjs`), & FastAPI Worker Task Schemas (`07-fastapi-ai-worker`)  
**Auditor:** Antigravity (Senior API-Contract & Distributed-Systems Architect)  
**Date:** 2026-08-25  
**Report File Location:** `04-nestjs-api/04-nestjs-api-app/s1/stage2/antigravity-STAGE-02-CONTRACT-REVIEW.md`  

---

## 1. Verdict

### **APPROVED WITH CHANGES**

*(Reason: The contract envelope standards, JSON Schema Draft 2020-12 conventions, and aggregate ID semantics are 100% sound. However, 4 specific contract gaps exist: missing `security-scan-task.v1.json` task contract, incorrect task contract reference in Dispatcher registry, missing `candidate.resume.parsed.v1.json` output contract, and legacy Draft-07 envelope on `resume-parse-requested.v1.json`).*

---

## 2. Verified Correct Points

| Point | Repository Evidence | Result |
|---|---|---|
| **Outbox Envelope Standard** | `contracts/G1-ENVELOPE-ALIGNMENT.md` & `contracts/events/security-scan-requested.v1.json` | ✅ **VERIFIED.** Outbox events follow standard envelope: `schema_version`, `event_id`, `aggregate_type`, `aggregate_id`, `event_type`, `payload`, `occurred_at`. |
| **Aggregate ID Semantics** | `contracts/AGGREGATE-ID-SEMANTICS.md` & `06_documents.sql` | ✅ **VERIFIED.** Document security scanning uses `aggregate_type: "uploaded_document"`, `aggregate_id: <uploaded_documents.id>`. |
| **JSON Schema Draft Standard** | `contracts/events/security-scan-requested.v1.json` Line 2 | ✅ **VERIFIED.** Repository standard is JSON Schema Draft 2020-12 (`https://json-schema.org/draft/2020-12/schema`). |
| **Queue Mapping** | `05-outbox-dispatcher-nestjs/src/routing/event-route.registry.ts` Line 32 & Line 80 | ✅ **VERIFIED.** `security.scan.requested` maps to dedicated queue `security-scan-queue`. |
| **FastAPI Security Validation** | `07-fastapi-ai-worker/app/api/v1/task_handlers.py` Lines 141–171 | ✅ **VERIFIED.** FastAPI checks `security_scan_status == 'clean'` before processing resume parsing tasks. |

---

## 3. Incorrect or Unsupported Claims in Previous Reports

| Claim | Actual Evidence | Severity | Required Action |
|---|---|---|---|
| *"Dedicated security-scan task contract exists in `contracts/tasks/`"* | `contracts/tasks/` contains 6 files, but `security-scan-task.v1.json` is MISSING. `event-route.registry.ts` line 82 mistakenly points to `contracts/events/security-scan-requested.v1.json`. | 🔴 **HIGH** | Create `contracts/tasks/security-scan-task.v1.json` and update Dispatcher route registry reference. |
| *"Legacy Phase 1 event contracts are fully aligned with G-1 Outbox Envelope"* | `contracts/events/resume-parse-requested.v1.json` still uses legacy Draft-07 flat envelope without `aggregate_type`, `event_type`, `payload`, or `occurred_at`. | 🟡 **MODERATE** | Update `resume-parse-requested.v1.json` to full Draft 2020-12 outbox envelope. |

---

## 4. Contract Gaps Matrix

### GAP-CON-01 — Missing `security-scan-task.v1.json` Task Contract
- **Exact File:** `contracts/tasks/` (missing) & `05-outbox-dispatcher-nestjs/src/routing/event-route.registry.ts` line 82.
- **Problem:** Dispatcher registry references `contracts/events/security-scan-requested.v1.json` as its `taskContract` instead of a dedicated task schema in `contracts/tasks/`.
- **Impact:** Misaligns event vs task contract separation.
- **Recommendation:** Create `contracts/tasks/security-scan-task.v1.json` containing task payload fields (`document_id`, `storage_bucket`, `storage_path`, `checksum_sha256`, `trace_id`) and update `event-route.registry.ts`.
- **User Decision Required?** No (Technical contract fix).

### GAP-CON-02 — Security Risk in `storage_url` Event Field
- **Exact File:** `contracts/events/security-scan-requested.v1.json` lines 33, 40–44.
- **Problem:** Event contract requires `storage_url` (GCS/S3 signed URL or public URL). Passing signed URLs inside persistent `outbox_events` DB rows is a security risk (URLs expire, leak access tokens in DB logs).
- **Recommendation:** Replace `storage_url` with `storage_bucket` and `storage_path`. Worker generates short-lived storage access via Supabase SDK.
- **User Decision Required?** No (Security best practice).

### GAP-CON-03 — Missing Worker Output Event Contract `candidate.resume.parsed.v1.json`
- **Exact File:** `contracts/events/` (missing).
- **Problem:** When FastAPI AI worker completes parsing, it inserts `resume_parsed_data` and writes an outbox event, but no versioned contract exists in `contracts/events/`.
- **Recommendation:** Create `contracts/events/candidate-resume-parsed.v1.json` defining the schema for completed parse events.
- **User Decision Required?** No.

### GAP-CON-04 — Legacy Draft-07 Envelope on `resume-parse-requested.v1.json`
- **Exact File:** `contracts/events/resume-parse-requested.v1.json`.
- **Problem:** Uses legacy Draft-07 flat schema without outbox envelope fields.
- **Recommendation:** Update `resume-parse-requested.v1.json` to Draft 2020-12 full outbox envelope per `G1-ENVELOPE-ALIGNMENT.md`.
- **User Decision Required?** No.

---

## 5. Proposed Contract Changes

| Proposed Change | Category | Description | Status |
|---|---|---|---|
| **Create `contracts/tasks/security-scan-task.v1.json`** | **REQUIRED** | Define task payload sent by Dispatcher to FastAPI worker `/internal/tasks/security/scan`. | Mandatory Fix |
| **Update `event-route.registry.ts`** | **REQUIRED** | Change `taskContract` reference for `security.scan.requested` to `contracts/tasks/security-scan-task.v1.json`. | Mandatory Fix |
| **Replace `storage_url` with `bucket/path`** | **REQUIRED** | Prevent signed URL leakage in outbox events. | Mandatory Fix |
| **Update `resume-parse-requested.v1.json` to Draft 2020-12** | **REQUIRED** | Align Phase 1 trigger event contract with G1 outbox envelope. | Mandatory Fix |
| **Create `contracts/events/candidate-resume-parsed.v1.json`** | **OPTIONAL** | Define output event contract for parsing completion. | Recommended |

---

## 6. Security and PII Review

1. **No Sensitive PII in Outbox Payload:** Outbox events contain document references (`document_id`, `storage_bucket`, `storage_path`), NOT raw candidate PII or file binary contents.
2. **`security_scan_result` JSONB Security:** `uploaded_documents.security_scan_result` stores scanner metadata (`scanner_name`, `scanner_version`, `scan_status`, `is_infected`, `viruses_found`, `scanned_at`), strictly excluding PII or raw file content.

---

## 7. Dispatcher & Worker Compatibility Review

1. **Envelope Opacity:** Dispatcher is payload-opaque and forwards standard fields (`schema_version`, `event_id`, `aggregate_id`, `trace_id`).
2. **FastAPI Task Schema Alignment:** Pydantic models in `07-fastapi-ai-worker/app/schemas/tasks.py` match the task payload fields.

---

## 8. Required Changes Before Contract Freeze

1. Create `contracts/tasks/security-scan-task.v1.json`.
2. Update `05-outbox-dispatcher-nestjs/src/routing/event-route.registry.ts`.
3. Replace `storage_url` in `security-scan-requested.v1.json` with `storage_bucket` & `storage_path`.
4. Align `resume-parse-requested.v1.json` with Draft 2020-12 G1 outbox envelope.

---

## 9. Final Recommendation

### Summary Answers:
- **Can Stage 2 contracts be frozen?** **CONDITIONAL YES** — Upon applying the 4 required contract fixes above, Stage 2 contract suite is 100% frozen.
- **Which points must be resolved first?** Create `security-scan-task.v1.json` and fix Dispatcher registry contract reference.
- **Is it safe to edit actual contract files now?** **YES.** Applying these contract edits to `contracts/` is safe and required to unblock E2E integration testing.
