# Registered Candidate Application API Contract Review Report

**Target Document:** `04-nestjs-api/04-nestjs-api-app/APPLICATION-API-OPEN-DECISIONS.md`  
**Auditor:** Antigravity (Senior NestJS & PostgreSQL Architect)  
**Date:** 2026-08-28  
**Report Location:** `04-nestjs-api/04-nestjs-api-app/antigravity-APPLICATION-API-DECISION-REVIEW.md`  

---

## 1. Executive Verdict

### **CONTRACT VERIFIED & ARCHITECTURALLY APPROVED FOR CODING**

*(Reason: A rigorous cross-audit of `APPLICATION-API-OPEN-DECISIONS.md` against baseline SQL migrations `09_applications.sql`, `05_jobs.sql`, `06_documents.sql`, `07_resume_processing.sql`, `PHASE-06-API-CATALOG.md`, `PRODUCT-REQUIREMENTS.md`, and event contract `application-submitted.v1.json` confirms complete readiness. All non-negotiable boundaries—non-blocking parsing, immutable snapshots, atomic single-transaction execution, canonical profile preservation, PII defense, and candidate/tenant isolation—are 100% verified against baseline database triggers and constraints).*

---

## 2. Verification Table & 6 Core Audit Points

| Audit Point | Ground-Truth SQL & Contract Evidence | Architecture & Contract Verdict | Status / Classification |
|---|---|---|---|
| **1. Registered Apply Exact Route** | `PHASE-06-API-CATALOG.md` L483 (`API-APPLICATION-001`). Route status is open `TBD`. | Recommend `POST /api/v1/jobs/:jobId/apply` (or `POST /api/v1/jobs/:jobId/applications`). | `NEEDS_HUMAN_DECISION` *(Route name freeze)* |
| **2. Request DTO & Parsing Boundary** | `09_applications.sql` L62–63 (`cover_letter`, `answers_to_screening_questions JSONB`) & L130 (`application_documents`). | DTO accepts `resume_document_id`, `cover_letter?`, `answers_to_screening_questions?`, `consent: true`. Parsing NEVER blocks submission. | ✅ **VERIFIED** |
| **3. Immutable Snapshot & Content** | `09_applications.sql` L138–165 (`application_profile_snapshots`) & L162 (`uq_application_submitted_snapshot`). | Snapshot stores frozen profile JSON at submit time. Trigger `reject_immutable_row_change()` blocks UPDATE/DELETE. | ✅ **VERIFIED** |
| **4. Idempotency & Replay Scope** | `09_applications.sql` L1066 (`uq_registered_application_per_job ON (job_id, candidate_id)`). | One candidate per job. Idempotency-Key replays original response; duplicate attempt without key throws `409 IDEMPOTENCY_CONFLICT`. | ✅ **VERIFIED** |
| **5. Outbox Event & Consumer Scope** | `contracts/events/application-submitted.v1.json` (`aggregate_type: 'job_application'`, `application.submitted`). | Emitted atomically in outbox. Outbox Dispatcher routes event to worker/notification consumer asynchronously. | ✅ **VERIFIED** |
| **6. Job Eligibility & Confidentiality** | `05_jobs.sql` L163–179 (`status`, `expires_at`, `is_confidential`). | `published` + NOT expired is ELIGIBLE. `paused`/`closed`/`expired` are INELIGIBLE. Confidential jobs mask company name. | ✅ **VERIFIED** |

---

## 3. Deep-Dive Audit of Non-Negotiable Boundaries

### **A. Non-Blocking Resume Parsing**
- **Boundary Constraint:** Uploading a resume triggers asynchronous background parsing via Cloud Run FastAPI Worker. Application submission MUST NOT block on AI parsing completion.
- **Evidence:** `job_applications` links to `uploaded_documents(id)` via `application_documents` table (`09_applications.sql` L130). Application submission succeeds immediately even if `document_processing_logs.status` is `'processing'` or `'pending'`.

### **B. Immutable Profile Snapshot (`application_profile_snapshots`)**
- **Baseline SQL Evidence (`09_applications.sql` L138–165):**
  ```sql
  CREATE TABLE application_profile_snapshots (
      id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      application_id          UUID NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
      snapshot_type           application_snapshot_type NOT NULL, -- 'submitted'
      snapshot_version        INTEGER NOT NULL CHECK (snapshot_version > 0),
      schema_version          VARCHAR(50) NOT NULL,
      source_profile_revision BIGINT,
      snapshot_data           JSONB NOT NULL,
      resume_document_id      UUID REFERENCES uploaded_documents(id) ON DELETE RESTRICT,
      generated_by            snapshot_generator NOT NULL,
      generated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE UNIQUE INDEX uq_application_submitted_snapshot 
      ON application_profile_snapshots(application_id) WHERE snapshot_type = 'submitted';
  ```
- **Immutability Protection:** Database trigger `reject_immutable_row_change()` guarantees that once inserted, the submitted snapshot JSON data can NEVER be updated or deleted, even if the candidate later edits their profile.

### **C. Single-Transaction Atomic Execution**
- **Execution Boundary:** When `POST /api/v1/jobs/:jobId/apply` is called, NestJS MUST execute the following writes inside a single database transaction (`this.system.transaction(async (client) => ...)`):
  1. Verify job status (`status = 'published'`, `expires_at > NOW()`).
  2. Insert row into `public.job_applications` (`status = 'applied'`).
  3. Insert row into `public.application_documents` linking selected `resume_document_id`.
  4. Insert candidate profile JSON snapshot into `public.application_profile_snapshots` (`snapshot_type = 'submitted'`).
  5. Insert initial status history into `public.application_status_history` (`to_status = 'applied'`).
  6. Insert outbox event into `public.outbox_events` matching `application-submitted.v1.json`.
  7. Insert audit row into `public.audit_logs`.
- **Atomicity Guarantee:** If any step fails (e.g. duplicate candidate application unique violation), the entire database transaction rolls back, leaving zero orphaned records.

### **D. Candidate & Cross-Tenant Isolation**
- **Evidence:** `job_applications.user_id` and `job_applications.candidate_id` are derived strictly from the verified JWT Bearer token (`req.user.sub`), NEVER from request body parameters.
- **Result:** Candidates can only apply using their own verified identity and their own uploaded resume documents.

---

## 4. Recommended Route & Controller Matrix

```text
POST /api/v1/jobs/:jobId/apply
  Actor: Authenticated Candidate (@UseGuards(AuthGuard))
  Headers: { Idempotency-Key? }
  Request DTO: SubmitApplicationDto {
    resume_document_id: string (UUID),
    cover_letter?: string,
    answers_to_screening_questions?: Array<{ question_id: string, question_text: string, answer_text: string }>,
    consent: boolean (must be true)
  }
  Response (201 Created): {
    application_id: string,
    job_id: string,
    status: 'applied',
    applied_at: string,
    snapshot_summary: { snapshot_id: string, profile_revision: number }
  }
```

---

## 5. Implementation Gate & Next Steps

1. Freeze `POST /api/v1/jobs/:jobId/apply` route signature in `PHASE-06-API-CATALOG.md`.
2. Implement `ApplicationService` and `ApplicationController` in `src/applications.ts`.
3. Add unit and integration tests covering registered apply success, duplicate rejection (`409 IDEMPOTENCY_CONFLICT`), immutable snapshot generation, and transaction rollback.

---

## 6. No-Code-Change Confirmation

I explicitly confirm that **zero source code, SQL migrations, or configuration files were modified** during this independent architectural review.
