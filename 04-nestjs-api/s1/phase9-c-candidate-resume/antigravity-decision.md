# Phase 09-C Candidate & Resume Consolidated Decision Report

**Target Component:** `04-nestjs-api` Candidate & Resume API Contracts & Unresolved Decisions  
**Auditor:** Antigravity (Senior NestJS, PostgreSQL & API Security Architect)  
**Date:** 2026-08-27  
**Report File Location:** `04-nestjs-api/s1/phase9-c-candidate-resume/antigravity-decision.md`  

---

## 1. Executive Verdict

### **APPROVED WITH FIXES**

*(Reason: Ground-truth audit of baseline migrations `06_documents.sql`, `07_resume_processing.sql`, `08_candidates.sql`, `17_rls.sql`, `DECISION-01`, and `DECISION-05` confirms that all three unresolved decisions can be cleanly frozen using exact database column names (`candidate_id`, `deleted_at`, `is_current`, `unlinked_at`, `overall_confidence`) and outbox pipeline specifications. All candidate profile paths, parsed-data safe response allowlists, and confirm idempotency rules are explicitly specified below).*

---

## 2. Decision 1 — Candidate Profile Public Routes & Contracts

### **Frozen Route Specifications**

| Endpoint Path | HTTP Method | Actor Scope | Client & Access Model | Transaction & Outbox Boundary |
|---|---|---|---|---|
| `/api/v1/candidates/me` | `GET` | Authenticated Candidate | `UserContextClient` (`candidate_profiles_own_read` RLS) | Read-only query fetching profile + active facts (`deleted_at IS NULL`) |
| `/api/v1/candidates/me` | `PATCH` | Authenticated Candidate | `SystemClient` + NestJS JwtAuthGuard | Atomic DB TX: updates profile/facts + `bump_candidate_profile_revision()` + `candidate.profile.changed` outbox event |
| `/api/v1/candidates/me/facts/:factType/:factId` | `DELETE` | Authenticated Candidate | `SystemClient` + NestJS JwtAuthGuard | Atomic DB TX: soft-deletes fact (`deleted_at = NOW()`) + `bump_candidate_profile_revision()` + `candidate.profile.changed` outbox event |

### **Exact SQL Evidence & Naming Ground-Truth**
- Primary/Foreign Keys: `candidate_profiles.id`, `candidate_profiles.user_id`, child FK `candidate_id` (`08_candidates.sql` line 47, 112).
- Soft Delete Column: `deleted_at TIMESTAMPTZ` (NOT `is_soft_deleted`).
- Active Document Link Columns: `candidate_id`, `document_id`, `document_role`, `version_number`, `is_current`, `linked_at`, `unlinked_at` (`08_candidates.sql` lines 111–125). No invented names like `candidate_profile_id`.
- Fact Types (`factType` path parameter enum): `links`, `skills`, `experiences`, `educations`, `certifications`, `projects`, `languages`, `awards`.

### **Rejected Alternatives**
- ❌ `/api/v1/candidates/me/resumes` (Rejected: conflicts with Phase 06 frozen upload route `POST /api/v1/resumes/upload`).
- ❌ Hard-deleting child facts from PostgreSQL (Rejected: `08_candidates.sql` line 38 mandates `deleted_at` soft-delete for audit trail).

---

## 3. Decision 2 — Parsed-Data Response Safe Allowlist

### **Frozen Response Contract for `GET /api/v1/resumes/:id/parsed-data`**

- **Actor & Permission:** Document owner candidate (`uploaded_documents.uploaded_by_user_id == auth.uid()`).
- **Access Boundary:** `SystemClient` query with NestJS ownership authorization check.

### **Safe Response DTO Schema (`ResumeParsedDataResponseDto`)**
```json
{
  "document_id": "uuid",
  "parsing_job_id": "uuid",
  "schema_version": "string",
  "overall_confidence": "number (0.00 to 100.00)",
  "confidence_details": "object (optional field confidence breakdown)",
  "validation_result": "object (optional schema validation warnings)",
  "normalized_output": {
    "contact_info": "object",
    "professional_title": "string",
    "summary": "string",
    "skills": "array",
    "experiences": "array",
    "educations": "array",
    "certifications": "array",
    "languages": "array"
  },
  "created_at": "TIMESTAMPTZ"
}
```

### **Explicit Exclusion List (Security & Redaction)**
- ❌ `extracted_text` (Raw resume text parsed from document)
- ❌ `raw_ai_output` (Raw unvalidated LLM output JSON)
- ❌ `resume_parsing_artifacts` (Raw OCR page artifacts)
- ❌ `error_details` (Internal system error details / tracebacks)
- ❌ `storage_bucket` and `storage_path` (Private S3/Supabase storage locations)
- ❌ Backend worker tokens, credentials, and LLM prompt internals

### **Exact SQL Evidence & Naming Ground-Truth**
- Table: `resume_parsed_data` (`07_resume_processing.sql` lines 69–96).
- Canonical Confidence Field: `overall_confidence` (`DECIMAL(5,2)` line 78). **Renaming to `confidence_score` is strictly rejected**.

---

## 4. Decision 3 — Confirm Idempotency & Repeat Protection

### **Frozen Behavior for `POST /api/v1/resumes/:id/confirm`**

- **Actor & Permission:** Document owner candidate (`uploaded_by_user_id == auth.uid()`), document scan clean (`security_scan_status = 'clean'`), parsing completed (`processing_status = 'parsed'`).
- **Request DTO (`ConfirmResumeDto`):** `expected_profile_revision` (BIGINT), `normalized_facts` (allowlisted payload), `Idempotency-Key` (header).

### **Idempotency Execution Rules**
1. **Duplicate / Retry Request Handling:**
   - If a confirm request for `document_id` has already succeeded (proven by `candidate_profile_documents` where `document_id = id` AND `is_current = true` AND `candidate_id = candidate_profiles.id`), a repeated request returns the **exact same 200 OK success response** (`ConfirmResumeResponseDto`).
2. **Zero Duplicate Document Link:**
   - No duplicate row is inserted into `candidate_profile_documents` (`uq_candidate_current_document_role` unique index constraint in `08_candidates.sql` line 127 enforced).
3. **Zero Second Revision Bump:**
   - `bump_candidate_profile_revision(candidate_id)` is NOT called on a retry.
4. **Zero Second Outbox Event:**
   - No duplicate `candidate.profile.changed` event is inserted into `outbox_events`.
5. **Stale Revision Conflict Handling:**
   - If submitted `expected_profile_revision` != `candidate_profiles.profile_revision`, the transaction immediately rolls back and returns `409 STALE_REVISION` with error code `STALE_REVISION` per `DECISION-06`.
6. **Atomic Rollback Guarantee:**
   - If any database assertion fails, the entire PostgreSQL transaction (`BEGIN...COMMIT`) rolls back 100%, leaving zero orphan records.

---

## 5. Security & Ownership Matrix

| Operation | Security Control | Owner Scoping Mechanism | Audit Logging |
|---|---|---|---|
| **Profile Read** | `UserContextClient` + RLS | `auth.uid() == user_id` (`17_rls.sql`) | Access logging |
| **Profile Update** | NestJS Guards + `SystemClient` | JWT `sub` verified server-side | `profile_change_history` + `candidate.profile.changed` outbox |
| **Fact Archive** | NestJS Guards + `SystemClient` | JWT `sub` verified server-side | `profile_change_history` + `candidate.profile.changed` outbox |
| **Resume Upload** | NestJS Guards + `SystemClient` | `uploaded_by_user_id = JWT sub` | `security.scan.requested` outbox |
| **Parsed Data Read** | NestJS Guards + `SystemClient` | `uploaded_documents.uploaded_by_user_id == JWT sub` | Access logging (redacted) |
| **Confirm Profile** | NestJS Guards + `SystemClient` | `uploaded_documents.uploaded_by_user_id == JWT sub` | `profile_change_history` + `candidate.profile.changed` outbox |

---

## 6. Required Test Matrix

1. **Unit Tests:** DTO validation, file magic byte checks, MIME type filters, and `overall_confidence` schema validation.
2. **Integration Tests:** Atomic transaction execution (`bump_candidate_profile_revision()` + fact updates + `candidate.profile.changed` outbox event).
3. **Concurrency Tests:** Simultaneous confirm requests with stale `expected_profile_revision` returning `409 STALE_REVISION`.
4. **Idempotency Tests:** Repeated `POST /api/v1/resumes/:id/confirm` calls returning identical `200 OK` response without duplicate document link, revision bump, or outbox event.
5. **Failure & Rollback Tests:** Infected scan file blocking parse/confirm; database constraint failure rolling back transaction 100%.

---

## 7. Final Verdict

### **APPROVED WITH FIXES**
