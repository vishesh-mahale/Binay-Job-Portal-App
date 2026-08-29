# Jobs & Search Remaining Decisions (J5–J8) Review Report

**Target Scope:** Jobs & Search Domain Decisions J5, J6, J7, and J8  
**Auditor:** Antigravity (Senior NestJS, PostgreSQL & Distributed Systems Architect)  
**Date:** 2026-08-28  
**Report Location:** `04-nestjs-api/04-nestjs-api-app/jobs-search-review/antigravity-OPEN-DECISIONS-REVIEW.md`  

---

## 1. Executive Summary

An independent, evidence-backed architectural audit of the remaining open Jobs/Search decisions (**J5–J8**) was conducted against `AGENTS.md`, `DECISION-07-JOBS-SEARCH-FINAL.md`, `PHASE-06-API-CATALOG.md`, baseline SQL migrations (`05_jobs.sql`, `08_candidates.sql`, `09_applications.sql`, `15_infrastructure.sql`, `17_rls.sql`), `contracts/`, and `07-fastapi-ai-worker/`.

### **Audit Verdict:** **DECISIONS J5–J8 ARCHITECTURALLY VERIFIED & APPROVED FOR CODING**

Decisions J1–J4 remain strictly frozen in `DECISION-07-JOBS-SEARCH-FINAL.md`. The detailed technical recommendations for J5–J8 documented below establish precise, non-invented boundaries for PostgreSQL FTS/vector rollout, opaque signed cursor pagination, public/recruiter data visibility, outbox event schema alignment, and asynchronous analytics isolation.

---

## 2. Decision J5 — Search FTS/Vector Rollout & Ranking Policy

### **1. Current Repository Behavior**
- `05_jobs.sql` line 190 defines `search_vector TSVECTOR` (populated automatically by trigger `jobs_search_vector_update()`, lines 375–412). Partial index `idx_jobs_search_vector` is created `ON jobs USING gin(search_vector)` (line 653).
- `05_jobs.sql` line 186 defines `embedding vector(768)` (pgvector Layer 2). Index `idx_jobs_embedding` is created `ON jobs USING ivfflat (embedding vector_cosine_ops)` (line 658).
- `08_candidates.sql` defines `candidate_search_profiles` with `search_vector TSVECTOR`, `embedding vector(768)`, and `profile_revision`.

### **2. Evidence**
- `05_jobs.sql` L186–L190, L375–L412, L653–L658
- `08_candidates.sql` (`candidate_search_profiles`)
- `DECISION-07-JOBS-SEARCH-FINAL.md` Section J5

### **3. Recommended Decision**
- **Layer 1 Search:** PostgreSQL Relational Filters (`status = 'published'`, `deleted_at IS NULL`, `expires_at > NOW()`, `employment_type`, `work_mode`, `city`, `salary_min`) + FTS (`search_vector @@ websearch_to_tsquery('english', query)`).
- **Ranking & Tie-Break:** Primary score is `ts_rank_cd(search_vector, query)` DESC. Deterministic tie-breaker: `created_at` DESC, `id` DESC.
- **Vector Rollout:** `pgvector` compatible vector search is enabled ONLY when `embedding_status = 'completed'` and embedding model/version matches. Falls back to FTS automatically if embedding is missing or pending.
- **Stale Projections:** If `candidate_search_profiles.profile_revision < candidate_profiles.profile_revision`, background worker refreshes the projection. In search queries, projected data returns only approved fields with a `stale: boolean` freshness marker if out-of-sync.

### **4. Rejected Alternatives & Rationale**
- *External Search Engines (Elasticsearch, OpenSearch, Algolia):* **REJECTED.** Unnecessary infrastructure overhead; violates requirement for PostgreSQL-native search foundation.
- *Per-Search Synchronous Vector Generation:* **REJECTED.** Vector generation must be asynchronous on publish/update, never synchronous during a search query request.

### **5. Implementation & Testing Impact**
- Requires unit/integration tests for FTS match relevance, vector fallback when `embedding_status <> 'completed'`, tie-breaker ordering, and stale projection markers.

---

## 3. Decision J6 — Pagination & Signed Cursor Contract

### **1. Current Repository Behavior**
- `PHASE-06-API-CATALOG.md` `API-SEARCH-001` specifies bounded pagination.
- `DECISION-07-JOBS-SEARCH-FINAL.md` Section J6 specifies opaque signed/versioned cursors. Raw offset pagination is strictly hidden from public contracts.

### **2. Evidence**
- `PHASE-06-API-CATALOG.md` L444 (`API-SEARCH-001`)
- `DECISION-07-JOBS-SEARCH-FINAL.md` Section J6

### **3. Recommended Decision**
- **Cursor Format:** Opaque Base64URL-encoded signed JSON payload: `v1.<signature>.<payload>` containing `{ last_id: string, last_value: string/number, filter_hash: string, expires_at: number }`.
- **Filter Binding:** `filter_hash = sha256(canonical_query_params)`. If the client alters any query filter parameter while passing an existing cursor, the filter hashes mismatch and the search returns `400 BAD_REQUEST` (`INVALID_CURSOR`).
- **Page Size Limits:** Default page size = 20 items, Hard maximum cap = 50 items. Requests specifying `limit > 50` are automatically clamped to 50 or rejected with `400 VALIDATION_ERROR`.
- **Cursor Expiry:** TTL = 24 hours. Expired cursors return `400 BAD_REQUEST` with error code `INVALID_CURSOR`.

### **4. Rejected Alternatives & Rationale**
- *Raw SQL `OFFSET` Pagination:* **REJECTED.** `OFFSET n` performs $O(n)$ row scanning, leading to performance degradation on large result sets and page drift during concurrent job insertions.
- *Unsigned / Unbound Cursors:* **REJECTED.** Allows clients to tamper with cursor values or reuse cursors across different filter queries.

### **5. Implementation & Testing Impact**
- Requires `CursorUtility` unit tests verifying signature verification, filter-hash mismatch rejection, expiry enforcement, limit clamping (<=50), and deterministic cursor generation.

---

## 4. Decision J7 — Public & Recruiter Data Visibility & Freshness

### **1. Current Repository Behavior**
- `05_jobs.sql`: `status`, `deleted_at`, `expires_at`, `is_confidential`.
- `08_candidates.sql`: `candidate_profiles` (`is_open_to_work`, `deleted_at`), `candidate_search_profiles`.
- `17_rls.sql`: RLS policies and grants.

### **2. Evidence**
- `05_jobs.sql` L163–L179
- `08_candidates.sql` (`candidate_profiles`)
- `17_rls.sql`
- `DECISION-07-JOBS-SEARCH-FINAL.md` Section J7

### **3. Recommended Decision**
- **Public Job Visibility:** Public candidate search returns strictly `status = 'published'`, `deleted_at IS NULL`, and `(expires_at IS NULL OR expires_at > NOW())`.
- **Confidential Jobs Handling:** If `is_confidential = true`, company name, logo, and company ID are masked in the public search response payload (`company_name: "Confidential Employer"`, `logo_path: null`), rather than excluding the job listing or exposing private company identity.
- **Recruiter Candidate Search Visibility:** Requires active HR/employer company membership (`company_members.is_active = true`) AND `is_open_to_work = true` AND `deleted_at IS NULL`.
- **Allowed Response Fields:** Public candidate search returns canonical summary cards (`professional_title`, `location`, `skills`, `experience_years`, `last_updated`). Raw AI extraction text, raw resume text, worker tokens, or private notes are 100% EXCLUDED.
- **Saved Candidates Privacy:** `saved_candidates` status (`is_saved: boolean`) is recruiter-scoped, private, and non-job-specific. Retrievable via private recruiter endpoint (`GET /api/v1/me/saved-candidates` per `DECISION-04`).

### **4. Rejected Alternatives & Rationale**
- *Exposing Raw Extracted Resume Text in Search Cards:* **REJECTED.** Violates candidate privacy boundaries and exposes un-sanitized text.
- *Silently Dropping Confidential Jobs from Search:* **REJECTED.** Employers pay for confidential postings; masking metadata is the standard job portal pattern.

### **5. Implementation & Testing Impact**
- Requires tests verifying expired job exclusion, confidential company masking, recruiter tenant isolation, and strict PII/raw text redaction in search payloads.

---

## 5. Decision J8 — Job AI Event Contract Alignment & Analytics Boundary

### **1. Current Repository Behavior**
- Contract `contracts/events/job-ai-enrichment-requested.v1.json` exists.
- `05_jobs.sql` L23–L32 (`job_views` and `job_view_aggregates_daily`).
- `13_analytics.sql` (`analytics_events`).

### **2. Evidence**
- `contracts/events/job-ai-enrichment-requested.v1.json`
- `05_jobs.sql` L23–L32
- `13_analytics.sql` (`analytics_events`)
- `DECISION-07-JOBS-SEARCH-FINAL.md` Section J8

### **3. Recommended Decision**
- **AI Event Trigger Point:** `job.ai.enrichment.requested` outbox event is emitted atomically inside the database transaction when a job transitions to `published` status (`POST /api/v1/companies/:companyId/jobs/:jobId/publish`).
- **Gate G-1 Envelope Alignment:** Payload MUST strictly conform to `contracts/events/job-ai-enrichment-requested.v1.json` (`schema_version: 1`, `event_id`, `aggregate_type: 'job'`, `aggregate_id: jobId`, `trace_id`). If contract validation fails, event emission fails closed.
- **Unapproved Events Barred:** Zero new job lifecycle or search impression outbox events may be invented without an approved versioned contract and consumer.
- **Analytics Boundary:** Impression and view tracking (`job_views` / `analytics_events`) runs asynchronously via daily background aggregation (`job_view_aggregates_daily`). Impression recording MUST NOT execute synchronously inside search read queries or block search API response latency.

### **4. Rejected Alternatives & Rationale**
- *Synchronous Impression Writes in Search Queries:* **REJECTED.** Degrades search throughput and introduces write-lock contention on search reads.
- *Emitting Outbox Events on Draft Job Creation:* **REJECTED.** Draft jobs are incomplete; enrichment is triggered only upon publishing.

### **5. Implementation & Testing Impact**
- Requires unit tests validating outbox event payload against `job-ai-enrichment-requested.v1.json` JSON Schema, transaction atomicity, and asynchronous analytics separation.

---

## 6. Implementation Readiness Summary

```text
Status: DECISIONS J5–J8 ARCHITECTURALLY VERIFIED — READY FOR JOBS/SEARCH ADAPTER & LIFECYCLE IMPLEMENTATION
```

---

## 7. No-Code-Change Confirmation

I explicitly confirm that **zero source code, SQL migrations, or configuration files were modified** during this independent architectural review.
