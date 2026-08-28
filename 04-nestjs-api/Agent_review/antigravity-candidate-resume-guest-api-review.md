# Candidate, Resume, and Guest API Implementation Review Report

**Target Codebase:** `04-nestjs-api/04-nestjs-api-app`  
**Auditor:** Antigravity (Senior NestJS, PostgreSQL & Distributed Systems Reviewer)  
**Date:** 2026-08-27  
**Report Location:** `c:\Users\ADMIN\OneDrive\Desktop\Vishesh\Binay-Job-Portal-App\04-nestjs-api\Agent_review\antigravity-candidate-resume-guest-api-review.md`  

---

## 1. Executive Summary

A comprehensive architectural, security, and data-integrity audit of the Candidate, Resume, and Guest API implementation in `04-nestjs-api/04-nestjs-api-app/src` was performed against `AGENTS.md`, Phase 05/06/07/08 specifications, baseline SQL migrations, and contracts.

### **Production Readiness Verdict:** **PASS WITH REQUIRED FIXES (NOT YET PRODUCTION READY)**

While the core build succeeds, unit tests pass (16/16 test suites, 35/35 tests), and basic transaction boundaries are established, critical security, schema alignment, and contract compliance gaps exist that must be remediated before production deployment.

---

## 2. Files Inspected & Commands Executed

### **Files Inspected:**
- `src/candidate.ts` & `src/candidate.spec.ts`
- `src/resume.ts` & `src/resume.spec.ts`
- `src/guest.ts`
- `src/resume-upload-validation.ts` & `src/resume-upload-validation.spec.ts`
- `src/storage.ts` & `src/clients.ts`
- `02-database/migrations/baseline/06_documents.sql`, `07_resume_processing.sql`, `08_candidates.sql`, `09_applications.sql`, `15_infrastructure.sql`, `17_rls.sql`
- `contracts/events/security-scan-requested.v1.json`, `candidate-profile-changed.v1.json`, `application-submitted.v1.json`

### **Commands Executed:**
1. `powershell -ExecutionPolicy Bypass -Command "npm run build"` ➔ **PASS** (Exit code 0)
2. `powershell -ExecutionPolicy Bypass -Command "npm test -- --runInBand"` ➔ **PASS** (16/16 suites passed, 35/35 tests passed)

---

## 3. Findings Table

| Finding ID | Severity | File & Line Number | Summary of Finding | Contract / Schema Violation |
|---|---|---|---|---|
| **FINDING-01** | 🔴 **BLOCKER** | `src/resume.ts` L97–L102 | `insertConfirmedFacts()` inserts unvalidated foreign keys and omits mandatory baseline columns (`primary_source_type`). | `08_candidates.sql` DDL constraints (`primary_source_type` is NOT NULL). |
| **FINDING-02** | 🟠 **HIGH** | `src/guest.ts` L83–L106 | Guest `apply()` inserts into `job_applications` without verifying `security_scan_status = 'clean'` on the uploaded resume document. | `06_documents.sql` & `PHASE-06-API-CATALOG.md` (Unscanned/infected files must not create applications). |
| **FINDING-03** | 🟠 **HIGH** | `src/resume.ts` L90–L91 | Repeat confirm check uses `profile_change_history` lookup instead of a deterministic atomic query on `candidate_profile_documents`, risking state mismatch on retry. | `PHASE-09-C-API-CONTRACT-AMENDMENT.md` Decision 3. |
| **FINDING-04** | 🟡 **MEDIUM** | `src/candidate.ts` L184 & L187 | Fact archive updates `deleted_at = NOW()` but inserts hardcoded `before_data` / `after_data` without capturing complete pre-update state. | Audit completeness (`REQ-CANDIDATE-003`). |
| **FINDING-05** | 🟢 **LOW** | `src/guest.ts` L113–L121 | Guest claim flow directly updates status to `'merged'` without checking whether candidate email matches normalized guest email case-insensitively on database tier. | `09_applications.sql` claim constraints. |

---

## 4. Deep-Dive Specific Verifications

### 1. Repeated/Concurrent Resume Confirmation
- **Audit:** `src/resume.ts` lines 90–91 checks if the document was previously confirmed. If previously confirmed, it returns `{ already_confirmed: true }` without executing `bump_candidate_profile_revision()`, inserting duplicate `candidate_profile_documents`, or emitting duplicate `candidate.profile.changed` outbox events.
- **Finding:** Correctly avoids duplicate revision bumps and duplicate outbox events. However, line 90 relies on querying `profile_change_history` rather than querying `candidate_profile_documents.is_current`.

### 2. Candidate Child-Fact Provenance
- **Audit:** `src/resume.ts` lines 15–42 (`insertConfirmedFacts()`) hardcodes `primary_source_type = 'candidate_confirmed'` and `verification_status = 'candidate_confirmed'`, preventing client-supplied override of provenance fields.
- **Finding:** Client payload cannot forge provenance. **However**, line 20 omits `primary_source_type` in the column list while passing value `$6`, leading to a SQL syntax/column mismatch during `candidate_skills` insert.

### 3. Uploaded Document Ownership & Cross-Tenant Boundary
- **Audit:** `src/resume.ts` line 51 scopes checksum lookup strictly to `uploaded_by_user_id = $1` (JWT `sub`). `src/guest.ts` line 33 scopes guest document status/data to `guest_upload_session_id = $1` + `token_hash = $2`.
- **Finding:** Registered user documents and guest documents cannot cross ownership boundaries.

### 4. Raw Text & Secrets Protection in API Responses
- **Audit:** `src/candidate.ts` lines 115–125 and `src/guest.ts` lines 77–79 implement explicit property allowlists (`['contact_info', 'professional_title', 'summary', 'skills', 'experiences', 'educations', 'certifications', 'languages']`).
- **Finding:** `extracted_text`, `raw_ai_output`, `storage_bucket`, `storage_path`, and database/worker credentials are **100% excluded** from API responses.

### 5. Outbox Event Schema Compliance
- **Audit:** `security.scan.requested` in `src/resume.ts` line 71 and `src/guest.ts` line 46 contains `schema_version: 1`, `event_id`, `aggregate_type: 'uploaded_document'`, `aggregate_id`, `event_type: 'security.scan.requested'`, and `payload: { document_id, uploaded_by_user_id, guest_upload_session_id, trace_id }`.
- **Finding:** Perfectly matches `contracts/events/security-scan-requested.v1.json`.

### 6. Transaction & Storage Compensation Boundary
- **Audit:** `src/resume.ts` lines 63–76 uploads to storage BEFORE opening the database transaction (`this.system.transaction(...)`). If the DB transaction fails or rolls back, a `try/catch` block calls `this.storage.remove()` in best-effort mode without swallowing the original DB error.
- **Finding:** Zero external storage calls occur inside the open database transaction.

---

## 5. Required Fixes Before Production Freeze

### **Fix 1: Correct `candidate_skills` SQL Insert Column List**
- **File:** `src/resume.ts` Line 20
- **Fix:** Update SQL query string to match column placeholders:
  ```typescript
  await client.query(`
    INSERT INTO public.candidate_skills 
      (candidate_id, skill_id, custom_skill_name, proficiency_level, years_of_experience, primary_source_type, verification_status, candidate_confirmed_at) 
    VALUES ($1,$2,$3,$4,$5,$6,'candidate_confirmed',NOW())
  `, [candidateId, skill.rows[0]?.id ?? null, skill.rows[0]?.id ? null : item.name.trim(), item.proficiency_level ?? null, item.years_of_experience ?? null, 'candidate_confirmed']);
  ```

### **Fix 2: Enforce Scan-Clean Gate on Guest Application Submit**
- **File:** `src/guest.ts` Line 90
- **Fix:** Add check before `job_applications` insert:
  ```typescript
  const doc = await client.query(`
    SELECT id, security_scan_status FROM public.uploaded_documents 
    WHERE id = $1 AND guest_upload_session_id = $2 AND deleted_at IS NULL
  `, [body.document_id, body.session_id]);
  if (!doc.rows[0]) throw new NotFoundException('NOT_FOUND');
  if (doc.rows[0].security_scan_status !== 'clean') throw new BadRequestException('SCAN_PENDING');
  ```

---

## 6. Final Production-Readiness Verdict

```text
Verdict: PASS WITH REQUIRED FIXES (NOT YET PRODUCTION READY)
Reason: Core build and tests pass, but SQL column alignment in candidate_skills insert and security scan gating on guest apply must be updated before production freeze.
```
