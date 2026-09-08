# Phase 09-D — Jobs, Search & AI Enrichment Handoff Package

**Author:** Antigravity Engineering  
**Date:** 2026-09-08  
**Status:** `BACKEND & AI WORKER COMPLETE — MANUAL RELEASE GATES OPEN`  
**Canonical Handoff Path:** `04-nestjs-api/Agent_review/phase-09d/PHASE-09D-HANDOFF.md`  

---

## 1. Executive Summary

Phase 09-D encompasses the end-to-end Job Posting, Lifecycle Management, Public Search, and Background AI Enrichment pipeline. All core backend modules, outbox event wiring, FastAPI AI worker enrichment services, and 768-dim semantic embedding builders are fully implemented, unit-tested, and verified against the live PostgreSQL database.

```text
Next.js Frontend → NestJS API → PostgreSQL (jobs, job_skills, job_locations)
                                ↓ (Transactional Outbox)
                          outbox_events
                                ↓
                 05-outbox-dispatcher-nestjs
                                ↓
                    07-fastapi-ai-worker (Private Cloud Run)
                     ├── JobAIService (Ideal Candidate JSONB - Contract v1)
                     └── JobSemanticTextBuilder (768-dim pgvector Embedding)
```

---

## 2. Completed Implementation Components

### A. NestJS Backend Units (Units 1, 2, 3 & 4)
- **Unit 1 & 2 (Creation, Draft Updates, Approvals & Publish):**  
  `POST /api/v1/companies/:companyId/jobs`, `PATCH .../jobs/:jobId`, `POST .../publish`, `POST .../submit-for-approval`, `POST .../approve`, `POST .../reject`. Enforces company verification, ownership guards, and tenant isolation.
- **Unit 3 (Lifecycle Management):**  
  `POST .../pause`, `POST .../resume`, `POST .../close`, `POST .../archive`. Enforces terminal-state immutability and atomic audit logging (`job.status_changed`, `job.archived`).
- **Unit 4 (Public Job Search & Listing):**  
  `GET /api/v1/jobs`, `GET /api/v1/jobs/:id`, `GET /api/v1/jobs/slug/:slug`, `GET .../jobs/public/:jobSlug`. Opaque signed cursor pagination, FTS keyword search via `search_vector` GIN index, confidential employer masking (`is_confidential = true`), and fail-closed cursor security.
- **Gate G-1 Outbox Event:**  
  On job publish, an atomic `job.ai.enrichment.requested` event is inserted into `public.outbox_events` within the publish transaction containing trace ID, job ID, and company ID.

### B. FastAPI AI Enrichment Worker (`07-fastapi-ai-worker`)
- **Authoritative Precedence & Integrity (P0 Consolidated Review Decision):**
  1. `jobs.experience_min` always overrides LLM-extracted experience years.
  2. `jobs.min_education_level` and `education_type` are authoritative for preferred education.
  3. Master skill metadata (`is_required`, `min_years`, `importance_score`) is preserved; required skills cannot be demoted to optional.
  4. Hardcoded domain defaults ("Engineering" / "Mid-Level") removed; domain-neutral fallbacks to category/level applied.
  5. Valid zero values (`experience = 0`) and confidence scores (`0.0`) are strictly preserved.
  6. Case-insensitive skill normalization and deduplication implemented.
  7. Company industry (`company_industry`) and screening questions added as contextual prompt signals.
- **Ideal Candidate Profile Schema (`JobAIProfileV1`):**  
  Strict adherence to contract v1 JSONB specification (`extracted`, `inferred`, `metadata`), stored in `jobs.ai_ideal_candidate_profile`.
- **768-Dimensional Symmetric Embedding Pipeline:**  
  `JobSemanticTextBuilder` builds standardized multi-line text conforming to `05_jobs_AI_Job_Embedding_Architecture_v1_step2.md`. Structured numerical filters (`salary_min`, `salary_max`) and perks (`benefits`) are strictly excluded from the vector to prevent semantic drift. Vectors are generated via `text-embedding-004` and stored in `jobs.embedding`.

---

## 3. Test Evidence & Empirical Proof

### A. FastAPI AI Worker Unit Test Suite
Targeted test suite covering all P0 consolidated review decisions executed cleanly:
```text
============================== 30 passed, 3 warnings in 4.77s ==============================
```
- `test_job_ai_service.py` (Authoritative precedence, skill metadata, zero-value preservation)
- `test_job_schemas.py` (JobAIProfileV1 JSONB contract validation)
- `test_job_repo.py` (Canonical aggregate loading & optimistic locking)
- `test_semantic_builders.py` (Symmetric text builder template conformity)
- `test_job_enrich_handler.py` (Task execution and result mapping)
- `test_contract_compatibility.py` (Backward and forward contract schema checks)

### B. NestJS Job & Search Test Suite
```text
PASS src/modules/jobs/jobs.spec.ts (24 tests)
PASS src/modules/jobs/job-search-query.spec.ts (17 tests)
Total: 41 tests passing (100%)
```

### C. Live Database Verification
Both existing published jobs in PostgreSQL were successfully enriched using Vertex AI `gemini-2.0-flash` and `text-embedding-004`:
1. **HR Job (`f2dfcea5-502c-45d3-a420-4bf7ddee080d`):**  
   - `minimum_experience_years`: `8` (structured `experience_min` preserved)  
   - `preferred_education`: `["masters (non_technical)"]`  
   - `must_have_skills`: `["communication skills", "polite"]`  
   - `inferred.industry_domains`: `["Technology"]` (from company context)  
   - `embedding`: 768-dim float vector populated with `completed` status  
   - Audit report: `03-Antigravity-main-instruction/prompt-for-antigravity/draft_HR_job_full_columns_and_values.md`
2. **Employer Job (`f557a57c-64d4-499b-a55c-2872c0e4b0ea`):**  
   - `minimum_experience_years`: `2` (structured `experience_min` preserved over text "5+ years")  
   - `preferred_education`: `["high_school (technical)"]`  
   - `must_have_skills`: Master required skills + custom skills preserved  
   - `embedding`: 768-dim float vector populated with `completed` status  
   - Audit report: `03-Antigravity-main-instruction/prompt-for-antigravity/draft_EMPLOYER_job_full_columns_and_values.md`

---

## 4. Remaining Manual Verification Gates

The following 6 manual release gates remain to be verified via the Next.js Web UI (`http://localhost:3001`) and NestJS API (`http://localhost:3000`):

| Gate # | Scope | Test Action | Expected Result |
|---|---|---|---|
| **Gate 1** | HR Submit Flow | HR creates draft job and clicks `Submit for Approval` | `jobs.status = 'pending_approval'`, audit log `job.publish_requested` |
| **Gate 2** | Owner Approval Flow | Owner/Admin clicks `Approve` on pending job | `jobs.status = 'published'`, `published_at` set, `outbox_events` row inserted |
| **Gate 3** | Owner Rejection Flow | Owner/Admin clicks `Reject` with mandatory reason | `jobs.status = 'draft'`, `rejection_reason` saved, audit log `job.rejected` |
| **Gate 4** | Direct Publish Flow | Direct publish with `job_approval_required = false` | Direct `draft → published` transition without intermediate approval |
| **Gate 5** | Public Visibility | Candidate views public job search (`/api/v1/jobs`) | Published jobs visible, draft/pending hidden, confidential jobs masked |
| **Gate 6** | E2E AI Completion | Full loop from Publish button to Vector in DB | Outbox Dispatcher dispatches event → FastAPI worker updates `ai_ideal_candidate_profile` & `embedding` |

---

## 5. Security & Repository Discipline

- **Zero Git Changes:** No commits, branches, or pushes created. All changes maintained locally.
- **Zero Token Logging:** Sensitive credentials and tokens remain 100% excluded from logs and artifacts.
- **Contract Integrity:** Schema version `1` preserved without breaking schema changes.
