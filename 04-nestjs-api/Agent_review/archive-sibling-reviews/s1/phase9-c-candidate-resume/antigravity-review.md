# Phase 09-C Candidate & Resume API Contract Review Report

**Target Scope:** `04-nestjs-api` Phase 09-C Candidate Profile & Resume Processing API Contracts  
**Auditor:** Antigravity (Senior NestJS, PostgreSQL & Security Architect)  
**Date:** 2026-08-27  
**Report File Location:** `04-nestjs-api/s1/phase9-c-candidate-resume/antigravity-review.md`  

---

## 1. Executive Verdict

### **APPROVED WITH FIXES**

*(Reason: The Candidate & Resume API specifications strictly adhere to baseline SQL migrations `06_documents.sql`, `07_resume_processing.sql`, `08_candidates.sql`, `17_rls.sql`, `DECISION-01` access boundaries, and `DECISION-05` first-resume active default rule. The full asynchronous pipeline—Security Scan ➔ Parsing ➔ Confirmation ➔ Search Projection—is completely traceable through outbox events and worker handlers. Minor fixes are required to specify the exact DTO class names, define the explicit field-by-field `normalized_output` allowlist for `API-RESUME-003`, and finalize candidate profile direct CRUD schemas).*

---

## 2. Evidence Table

| Component / Boundary | Ground-Truth Repository Evidence | Verification Result |
|---|---|---|
| **Baseline Documents DDL** | `06_documents.sql` lines 72–100 (`uploaded_documents` table) | ✅ **PASS** — Enforces `uploaded_by_user_id` XOR `guest_upload_session_id`, SHA-256 checksum format, and security scan states. |
| **Baseline Resume Processing DDL** | `07_resume_processing.sql` lines 39–100 (`resume_parsing_jobs`, `resume_parsed_data`) | ✅ **PASS** — Immutable AI outputs, job retry limits, confidence scores, and raw/normalized separation. |
| **Baseline Candidate DDL** | `08_candidates.sql` lines 46–129 (`candidate_profiles`, `candidate_profile_documents`, `bump_candidate_profile_revision()`) | ✅ **PASS** — Canonical profile facts, revision counter function, and document linking table. |
| **RLS Policies** | `17_rls.sql` (`candidate_profiles_own_read`, `uploaded_documents` policies) | ✅ **PASS** — RLS defense-in-depth for candidate personal reads via `UserContextClient`. |
| **First Resume Active Default** | `DECISION-05-FIRST-RESUME-ACTIVE-DEFAULT-HINGLISH.md` | ✅ **PASS** — Server forces `use_as_active_profile_resume = true` for the candidate's first upload. |
| **Outbox Events** | `contracts/events/security-scan-requested.v1.json`, `resume-parse-requested.v1.json`, `candidate-profile-changed.v1.json` | ✅ **PASS** — Validated outbox event schemas matching Phase 1 dispatcher routes. |
| **Dispatcher Registry** | `05-outbox-dispatcher-nestjs/src/routing/event-route.registry.ts` | ✅ **PASS** — `security.scan.requested` registered on `security-scan-queue` -> `/internal/tasks/security/scan`. |
| **FastAPI Security Worker** | `07-fastapi-ai-worker/app/api/v1/task_handlers.py` line 62 | ✅ **PASS** — `@router.post("/tasks/security/scan")` handler implemented and active. |

---

## 3. Proposed API Contract Specifications

| Endpoint Path | Method | Actor Scope | Access Model & Client Boundary | Database Transaction & Outbox |
|---|---|---|---|---|
| `/api/v1/resumes/upload` | `POST` | Authenticated Candidate | `SystemClient` + JWT `sub` check | Atomic DB TX (`uploaded_documents` + `security.scan.requested` outbox event) |
| `/api/v1/resumes/:id/status` | `GET` | Document Owner | `SystemClient` or `UserContextClient` | Read-only query (`uploaded_documents` + `resume_parsing_jobs`) |
| `/api/v1/resumes/:id/parsed-data` | `GET` | Document Owner | `SystemClient` + Ownership Guard | Read-only query returning allowlisted `normalized_output` |
| `/api/v1/resumes/:id/confirm` | `POST` | Document Owner | `SystemClient` + Ownership Guard | Atomic DB TX (`bump_candidate_profile_revision()` + fact updates + `candidate.profile.changed` outbox) |
| `/api/v1/candidates/me` | `GET` | Authenticated Candidate | `UserContextClient` (`candidate_profiles_own_read`) | Read-only query (`candidate_profiles` + child fact tables) |
| `/api/v1/candidates/me` | `PATCH` | Authenticated Candidate | `SystemClient` + Ownership Guard | Atomic DB TX (`bump_candidate_profile_revision()` + profile update + `candidate.profile.changed` outbox) |

---

## 4. Gaps and Required Fixes

| ID | Category | Description | Required Fix |
|---|---|---|---|
| **FIX-01** | **Allowlist** | `API-RESUME-003` requires an explicit field-by-field allowlist schema for `normalized_output` returned to candidates. | Define `ResumeParsedDataResponseDto` explicitly restricting fields to: `contact_info`, `summary`, `work_experiences`, `educations`, `skills`, `certifications`, `languages`, and `confidence_score`. Exclude `extracted_text` and `raw_ai_output`. |
| **FIX-02** | **DTO Catalog** | Candidate and Resume DTO class names must be formally registered before OpenAPI code generation. | Register `UploadResumeDto`, `ResumeStatusResponseDto`, `ConfirmResumeDto`, `UpdateCandidateProfileDto`, and `CandidateProfileResponseDto`. |
| **FIX-03** | **Checksum Reuse** | Checksum matching (`checksum_sha256`) for existing files must return `200 OK` with existing `document_id` without creating duplicate storage objects. | Enforce SHA-256 lookup on `uploaded_documents` scoped to `uploaded_by_user_id == auth.uid()`. |

---

## 5. Security & Isolation Findings

1. **Strict Data Redaction:** Raw extracted resume text (`extracted_text`), raw AI output (`raw_ai_output`), private storage paths (`storage_bucket`/`storage_path`), and backend worker tokens are strictly barred from API responses and redacted from NestJS application logs.
2. **Access Model Boundaries (Decision-01):** Personal profile reads use `UserContextClient` with Supabase RLS (`candidate_profiles_own_read`). All upload, confirmation, canonical fact persistence, and outbox event emissions execute via backend `SystemClient` inside atomic PostgreSQL transactions.
3. **Scan-Gate Enforcement:** Unscanned (`pending`), infected (`infected`), or failed (`scan_failed`) documents are strictly blocked from progressing to parsing or canonical profile confirmation.

---

## 6. Comprehensive Test Matrix

| Test Level | Test Suite Target | Verification Criteria |
|---|---|---|
| **Unit Tests** | DTO Validation & Controller Guards | Verify `use_as_active_profile_resume` boolean parsing, file magic byte checks, MIME type filters (`pdf`/`docx`), and JWT ownership extraction. |
| **Integration Tests** | `ResumeService` & `CandidateService` | Verify atomic transactions: `uploaded_documents` + `security.scan.requested` outbox commit; `bump_candidate_profile_revision()` + `candidate.profile.changed` outbox commit. |
| **Concurrency Tests** | Revision Concurrency | Verify that simultaneous profile updates with stale `expected_profile_revision` trigger optimistic concurrency failure (`409 STALE_REVISION`). |
| **Failure Tests** | Malicious / Infected File Upload | Upload an infected file artifact; verify `security_scan_status = 'infected'`, pipeline halts, and candidate confirmation is rejected with `422 INFECTED_FILE`. |
| **E2E Tests** | Complete Resume Pipeline | Full end-to-end execution: Upload ➔ Security Scan ➔ Parse ➔ Status Poll ➔ Fetch Parsed Data ➔ Confirm Profile ➔ Projection Rebuild. |

---

## 7. Final Verdict

### **APPROVED WITH FIXES**
