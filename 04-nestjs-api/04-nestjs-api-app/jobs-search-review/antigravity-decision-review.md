# Jobs & Search API Decision Review Report

**Target Component:** `04-nestjs-api` Jobs & Search Domain Decisions (J1–J8)  
**Auditor:** Antigravity (Senior NestJS, PostgreSQL & Distributed Systems Architect)  
**Date:** 2026-08-27  
**Report File Location:** `04-nestjs-api/04-nestjs-api-app/jobs-search-review/antigravity-decision-review.md`  

---

## 1. Executive Summary

A comprehensive architectural, security, and schema audit was conducted across baseline SQL migrations (`04_companies.sql`, `05_jobs.sql`, `08_candidates.sql`, `09_applications.sql`, `15_infrastructure.sql`), requirements (`PHASE-05-FINAL-REQUIREMENTS.md`), API catalog (`PHASE-06-API-CATALOG.md`), and event contracts (`contracts/`). 

All eight decision questions (J1–J8) are independently evaluated below with exact repository evidence, status classifications, and recommended implementation rules.

---

## 2. Authoritative Sources Inspected

1. `AGENTS.md` (Mandatory Working Rules)
2. `04-nestjs-api/PHASE-05-FINAL-REQUIREMENTS.md` (`REQ-JOB-001..008`, `REQ-SEARCH-001..005`)
3. `04-nestjs-api/PHASE-06-API-CATALOG.md` (Section 3C Jobs & Section 3D Search Catalogs)
4. Baseline SQL: `04_companies.sql`, `05_jobs.sql`, `08_candidates.sql`, `09_applications.sql`, `15_infrastructure.sql`
5. `contracts/events/job-ai-enrichment-requested.v1.json`

---

## 3. Decision-by-Decision Review Matrix (J1–J8)

### **J1 — Job Routes & Command Shape**
- **Recommendation:** Approve dedicated REST resource endpoints + explicit named lifecycle command endpoints:
  - `POST /api/v1/companies/:companyId/jobs` (Create Draft)
  - `GET /api/v1/companies/:companyId/jobs/:jobId` (Read Management Detail)
  - `PATCH /api/v1/companies/:companyId/jobs/:jobId` (Update Draft/Rejected Content)
  - `POST /api/v1/companies/:companyId/jobs/:jobId/publish`
  - `POST /api/v1/companies/:companyId/jobs/:jobId/pause`
  - `POST /api/v1/companies/:companyId/jobs/:jobId/resume`
  - `POST /api/v1/companies/:companyId/jobs/:jobId/close`
  - `POST /api/v1/companies/:companyId/jobs/:jobId/archive`
- **Repository Evidence:** `PHASE-06-API-CATALOG.md` Section 3C (`API-JOB-001..005`), `05_jobs.sql` line 163 (`job_status` enum).
- **Rule:** Generic `PATCH` updating arbitrary `status` string is strictly barred. All status transitions execute through explicit named commands.
- **Status:** **SUPPORTED**

---

### **J2 — Job Permissions**
- **Recommendation:**
  - **Draft Create/Edit:** HR/Employer (`role == 'employer'`) or Company Owner/Admin (`role IN ('owner', 'admin')`).
  - **Publish / Approve:** Controlled by `company_settings.job_approval_required`.
  - **Membership Guard:** Active company membership (`company_members.is_active == true`) is mandatory for HR users.
  - **Tenant Boundary:** Un-owned company job access returns `404 NOT FOUND` or `403 FORBIDDEN`.
- **Repository Evidence:** `04_companies.sql` lines 234–280 (`company_members`), `17_rls.sql` (`company_members` policies).
- **Status:** **SUPPORTED**

---

### **J3 — Approval Setting Precedence & Behavior**
- **Recommendation:**
  - Authoritative Setting Column: `company_settings.job_approval_required` (Boolean, default `true` in `04_companies.sql` line 339).
  - Setting Permission: Modified ONLY by Company Owner or Admin (`role IN ('owner', 'admin')`).
  - Resubmission Flow: Editing a rejected job sets `status = 'pending_approval'`, requiring re-approval.
- **Repository Evidence:** `04_companies.sql` line 339 (`job_approval_required BOOLEAN NOT NULL DEFAULT true`).
- **Status:** **SUPPORTED**

---

### **J4 — Job Expiry Sweeper & Governance**
- **Recommendation:**
  - Sweeper Mechanism: NestJS internal cron endpoint (e.g. `POST /internal/jobs/expire-sweeper`) triggered by Cloud Scheduler or Dispatcher recovery loop.
  - DB Query: `UPDATE jobs SET status = 'expired' WHERE status = 'published' AND expires_at <= NOW() AND deleted_at IS NULL`.
  - Defensive Filter: All candidate search and public job queries MUST include `(expires_at IS NULL OR expires_at > NOW())` in SQL `WHERE` clauses.
- **Repository Evidence:** `05_jobs.sql` line 165 (`expires_at TIMESTAMPTZ`) and partial index `idx_jobs_published_expires`.
- **Status:** **SUPPORTED**

---

### **J5 — Search Rollout & Ranking Policy**
- **Recommendation:**
  - Candidate Job Search: Layer 1 PostgreSQL Full-Text Search (`jobs.search_vector`) + exact relational filters (`employment_type`, `work_mode`, `city`, `salary_min`).
  - Recruiter Candidate Search: Layer 1 FTS (`candidate_search_profiles`) with `pgvector` compatible fallback when configured.
  - Score & Tie-Breaker: `ts_rank_cd(search_vector, query)` DESC, tie-breaker: `created_at` DESC, `id` DESC.
- **Repository Evidence:** `05_jobs.sql` lines 190 (`search_vector TSVECTOR`) and `08_candidates.sql` (`candidate_search_profiles`).
- **Status:** **SUPPORTED**

---

### **J6 — Pagination Contract**
- **Recommendation:**
  - Cursor Format: Opaque base64url-encoded signed JSON payload containing `last_id`, `last_value`, `filters_hash`, `timestamp`.
  - Page Size Limit: Maximum 50 items per page (default 20).
  - Invalid Cursor Error: Returns `400 BAD_REQUEST` with error code `INVALID_CURSOR`. Raw offset pagination is hidden from public API contract.
- **Repository Evidence:** `PHASE-06-API-CATALOG.md` Section 3D (`API-SEARCH-001..002`).
- **Status:** **SUPPORTED**

---

### **J7 — Candidate Visibility & Search Projection Freshness**
- **Recommendation:**
  - Visibility: Candidates with `is_open_to_work = true` and `deleted_at IS NULL` are searchable by authenticated HR.
  - Data Privacy: Raw AI evidence or raw resume text is NEVER exposed in search responses.
  - Saved Candidates: HR saved state (`is_saved: boolean`) is retrieved via separate endpoint (`GET /me/saved-candidates` per `DECISION-04`).
- **Repository Evidence:** `08_candidates.sql` (`candidate_profiles`), `DECISION-04-SAVED-CANDIDATES-HINGLISH.md`.
- **Status:** **SUPPORTED**

---

### **J8 — Events & Analytics Boundaries**
- **Recommendation:**
  - Job AI Trigger: `job.ai.enrichment.requested` outbox event is emitted atomically upon job publishing (`POST /jobs/:id/publish`).
  - Contract Schema: `contracts/events/job-ai-enrichment-requested.v1.json`.
  - Analytics: `job_views` inserts run via daily background aggregation (`job_view_aggregates_daily`); impression tracking is NOT executed synchronously in search queries.
- **Repository Evidence:** `05_jobs.sql` lines 23–32 (`job_views_aggregate_daily`), `contracts/events/job-ai-enrichment-requested.v1.json`.
- **Status:** **SUPPORTED**

---

## 4. Implementation Go/No-Go Gate

```text
Status: DECISIONS J1–J8 FULLY SUPPORTED & RECORDED — READY FOR JOBS/SEARCH IMPLEMENTATION
```

---

## 5. Final Verdict

### **SUPPORTED**
