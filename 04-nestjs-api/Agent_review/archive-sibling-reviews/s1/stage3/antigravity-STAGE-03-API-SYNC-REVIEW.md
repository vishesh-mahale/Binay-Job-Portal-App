# Stage-03 API Sync Independent Review

**Target Component:** `04-nestjs-api` First-Resume Upload & Profile Confirmation API Gateway Requirements Sync  
**Auditor:** Antigravity (Senior NestJS API Architect & Independent Reviewer)  
**Date:** 2026-08-26  
**Report File Location:** `04-nestjs-api/04-nestjs-api-app/s1/stage3/antigravity-STAGE-03-API-SYNC-REVIEW.md`  

---

## 1. Final Verdict

### **APPROVED WITH CHANGES**

*(Reason: The Stage-03 draft `STAGE-03-NESTJS-API-REQUIREMENTS-SYNC.md` accurately captures the 4 core resume APIs, controlled hybrid DB access model, outbox transactional boundaries, edge validations, and candidate profile confirmation invariants. However, minor corrections are required: standardizing endpoint path prefixes to `/api/v1/resumes/*`, documenting the application-specific resume path distinction, and mapping guest claim APIs).*

---

## 2. Repository Evidence Checked

The following authoritative ground-truth files were inspected and cross-checked:

1. `AGENTS.md` (Working Rules & Mandatory Verification)
2. `04-nestjs-api/README.md` & `PLAN-REQUIREMENTS-TO-IMPLEMENTATION-HINGLISH.md`
3. `04-nestjs-api/DECISION-01-NESTJS-SUPABASE-ACCESS-MODEL-HINGLISH.md` (Controlled Hybrid Model)
4. `04-nestjs-api/DECISION-02-REALTIME-TRANSPORT-HINGLISH.md` (SSE + REST Recovery)
5. `02-database/migrations/baseline/06_documents.sql` (`uploaded_documents`, `guest_upload_sessions`)
6. `02-database/migrations/baseline/07_resume_processing.sql` (`resume_parsing_jobs`, `resume_parsed_data`)
7. `02-database/migrations/baseline/08_candidates.sql` (`candidate_profiles`, `candidate_skills`, etc.)
8. `02-database/migrations/baseline/15_infrastructure.sql` (`outbox_events`)
9. `02-database/migrations/baseline/17_rls.sql` (RLS policies)
10. `contracts/events/security-scan-requested.v1.json`, `contracts/tasks/security-scan-task.v1.json`
11. `contracts/events/resume-parse-requested.v1.json`, `contracts/tasks/resume-parse-task.v1.json`
12. `contracts/events/candidate-resume-parsed.v1.json`
13. `05-outbox-dispatcher-nestjs/src/routing/event-route.registry.ts`
14. `07-fastapi-ai-worker/app/api/v1/task_handlers.py`

---

## 3. What is Correct

| Area | Verdict | Evidence |
|---|---|---|
| **Access Model** | ✅ **CORRECT** | Controlled Hybrid Model correctly enforced: Personal reads use User JWT + RLS; business writes use NestJS Guards + trusted DB connection. |
| **Transaction Boundary** | ✅ **CORRECT** | DB business row write and `outbox_events` insert are committed in ONE atomic transaction. External calls (Storage, Cloud Tasks, FastAPI) run OUTSIDE DB transactions. |
| **Clean-Before-Parse Gate** | ✅ **CORRECT** | Parsing is queued ONLY IF `security_scan_status == 'clean'`. Infected files strictly block parsing. |
| **Canonical Non-Overwrite** | ✅ **CORRECT** | AI parsing output pre-fills UI form only. Canonical profile tables (`08_candidates.sql`) are updated ONLY upon explicit candidate confirmation. |
| **Idempotency & Deduplication** | ✅ **CORRECT** | `checksum_sha256` and `idempotency_key` prevent redundant file writes and duplicate profile updates. |

---

## 4. Problems and Missing Items

| ID | Severity | Problem | Evidence | Recommended Correction |
|---|---|---|---|---|
| **GAP-API-01** | 🟡 **MEDIUM** | Endpoint paths in draft lack the standard `/api/v1/` prefix. | Written as `/resumes/upload` instead of `/api/v1/resumes/upload`. | Standardize all API paths to `/api/v1/resumes/*`. |
| **GAP-API-02** | 🟡 **MEDIUM** | Guest-to-registered candidate claim transition API is omitted from API scope. | `06_documents.sql` contains `guest_upload_sessions`, but guest claim path is omitted. | Document `POST /api/v1/candidates/claim-guest-session` as an ancillary endpoint. |
| **GAP-API-03** | 🟢 **LOW** | Application-specific resume confirmation distinction needs explicit demarcation. | First profile resume updates `candidate_profiles`; application resume links to `job_applications`. | Clarify that application-specific uploads snapshot into `application_profile_snapshots` without mutating canonical facts. |

---

## 5. Detailed API-by-API Review

### 1. `POST /api/v1/resumes/upload`
- **Traceability:** `06_documents.sql` (`uploaded_documents`, `guest_upload_sessions`).
- **Actor/Auth:** Authenticated Candidate OR Guest Session token.
- **Validation:** Edge validation for auth/ownership, file size limit, MIME type, file extension, magic bytes header check (`%PDF-`, `PK\x03\x04`), and SHA-256 checksum calculation.
- **Write Transaction:** Atomic `BEGIN...COMMIT` inserting `uploaded_documents` (`security_scan_status = 'pending'`, `processing_status = 'uploaded'`) + inserting `security.scan.requested` outbox event.
- **Response:** HTTP `202 Accepted` (`document_id`, status='uploaded').

### 2. `GET /api/v1/resumes/:id/status`
- **Actor/Auth:** Owning candidate, authorized guest session, or system worker.
- **Reads:** Read-only query on `uploaded_documents` + `resume_parsing_jobs`.
- **Response:** Returns UI-safe status stage (`uploaded`, `scanning`, `clean`, `parsing`, `parsed_ready`, `infected`, `failed`).
- **SSE/Recovery:** SSE stream provides live updates; calling this REST endpoint recovers authoritative status after network disconnects.

### 3. `GET /api/v1/resumes/:id/parsed-data`
- **Actor/Auth:** Owning candidate or authorized guest session.
- **Precondition:** `security_scan_status == 'clean'` AND `resume_parsing_jobs.status == 'completed'`.
- **Reads:** Read-only query on `resume_parsing_jobs` & `resume_parsed_data`.
- **Response:** Returns `raw_ai_output` / `normalized_output` JSON for UI review form pre-fill. Does NOT alter canonical database tables.

### 4. `POST /api/v1/resumes/:id/confirm`
- **Actor/Auth:** Owning authenticated candidate.
- **Preconditions:** Parsed review data exists and document security status is `'clean'`.
- **Write Transaction:** Atomic `BEGIN...COMMIT` performing:
  1. Re-check clean scan status & ownership.
  2. Apply candidate-confirmed facts to canonical tables (`candidate_profiles`, `candidate_skills`, `candidate_experiences`, `candidate_educations`).
  3. Increment candidate `profile_revision` exactly once.
  4. Link active resume via `candidate_profile_documents` / `uploaded_documents`.
  5. Insert `candidate.profile.changed` outbox event for vector projection rebuild (`projection-queue`).
  6. `COMMIT`.

---

## 6. End-to-End Flow Verification

The end-to-end flow is **100% VERIFIED & SOUND**:
```text
Upload 
  ↓
Private Supabase Storage 
  ↓
INSERT uploaded_documents (pending) + outbox(security.scan.requested)
  ↓
Asynchronous Security Scan (ClamAV)
  ↓
Clean Scan -> INSERT outbox(resume.parse.requested)
  ↓
FastAPI AI Worker Resume Parsing -> INSERT resume_parsed_data
  ↓
SSE Notification -> Next.js UI Fetches GET /api/v1/resumes/:id/parsed-data
  ↓
Candidate Reviews & Edits Pre-filled Profile Form
  ↓
POST /api/v1/resumes/:id/confirm
  ↓
Atomic Transaction: Update Canonical Profile Tables + Bump profile_revision + INSERT outbox(candidate.profile.changed)
  ↓
Vector Search Projection & Embedding Rebuilt
```

---

## 7. Open Decisions Before Catalog Freeze

1. **File Upload Transport:** Finalizing `multipart/form-data` to NestJS vs Client-to-Storage presigned upload handshake.
2. **Numeric Rate Limits:** Finalizing numeric limits for upload/status/confirm endpoints.
3. **Guest Session Claim Endpoint:** Mapping `POST /api/v1/candidates/claim-guest-session`.

---

## 8. Exact Required Changes

1. Standardize endpoint paths in Stage-03 document to use `/api/v1/resumes/*`.
2. Add explicit section documenting the distinction between First Profile Resume confirmation and Application-Specific Resume linking.
3. Document guest session claim endpoint mapping.

---

## 9. Final Status

**READY AFTER REQUIRED FIXES**  
*(The Stage-03 NestJS API Requirements Sync document is architecturally sound and ready for final freeze once the endpoint path formatting and guest claim mapping are applied).*
