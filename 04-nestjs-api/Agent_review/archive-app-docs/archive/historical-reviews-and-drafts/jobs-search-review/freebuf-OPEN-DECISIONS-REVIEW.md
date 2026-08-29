# Jobs/Search Open Decisions J5–J8 — Independent Review

**Agent:** Freebuf (Senior NestJS, PostgreSQL & Distributed Systems Architect)  
**Date:** 2026-08-28  
**Status:** `REVIEW — INDEPENDENT VERIFICATION`  
**Verdict:** `CONDITIONAL PASS — NEEDS HUMAN DECISIONS`

---

## Executive Summary

J1–J4 are frozen and verified. This review covers only J5–J8 open decisions. The repository has substantial existing infrastructure (FTS triggers, vector indexes, semantic builders, analytics tables, dispatch routes) but several decisions remain unverified, conflicting, or missing. **Zero BLOCKERs** but **3 HIGH** and **5 MEDIUM** gaps require human decision before coding.

---

## 1. J5 — Search FTS/Vector Rollout, Ranking, Tie-Break, Stale Projection

### 1.1 Current Repository Behavior

The repository already has **production-grade FTS and vector infrastructure**:

| Component | Location | Status |
|-----------|----------|--------|
| `search_vector TSVECTOR` | `05_jobs.sql` `jobs` table | ✅ Implemented |
| `jobs_build_search_vector_for_job()` | `05_jobs.sql` L:~400 | ✅ Weighted A-D |
| `jobs_search_vector_trigger` | `05_jobs.sql` L:~420 | ✅ BEFORE INSERT/UPDATE |
| `idx_jobs_search` GIN | `05_jobs.sql` L:~500 | ✅ Implemented |
| `embedding vector(768)` | `05_jobs.sql` `jobs` table | ✅ Implemented |
| `embedding_status` | `05_jobs.sql` `jobs` table | ✅ ENUM |
| `idx_jobs_embedding` HNSW | `05_jobs.sql` L:~540 | ✅ cosine_ops |
| `candidate_search_profiles.search_vector` | `08_candidates.sql` | ✅ Implemented |
| `candidate_search_profiles.embedding` | `08_candidates.sql` | ✅ vector(768) |
| `idx_candidate_search_fts` GIN | `08_candidates.sql` | ✅ Implemented |
| `idx_candidate_search_embedding` HNSW | `08_candidates.sql` | ✅ Implemented |
| `CandidateSemanticTextBuilder` | `semantic_builders.py` | ✅ v1 |
| `JobSemanticTextBuilder` | `semantic_builders.py` | ✅ v1 |
| `CandidateProjectionService` | `projection_service.py` | ✅ merge + embed |

### 1.2 Evidence

**FTS weights** (`05_jobs.sql`):
- `A`: title
- `B`: description, requirements, skills (skill names via trigger)
- `C`: responsibilities, category, employment_type, work_mode, experience_level, location_city
- `D`: location_country, benefits

**Vector**: 768-dimensional, HNSW with cosine similarity, conditional on `embedding_status = 'completed'` and `status = 'published'`.

**Semantic text template** (`semantic_builders.py`):
```
Title: {title}
Category: {category}
Employment Type: {emp_type} | Work Mode: {work_mode}
Experience Required: {min}-{max} years
Location: {locations}
Required Skills: {skills}
Responsibilities: {responsibilities}
Requirements: {requirements}
AI Domain & Concepts: {technical_domains}, {industry_domains}, {role_family}
```

### 1.3 Recommended Decision

**RECOMMENDED — PostgreSQL FTS + pgvector hybrid as Phase 1**

1. **Phase 1a (immediate):** PostgreSQL FTS with existing weighted search_vector + GIN index. Deterministic rank = `ts_rank_cd(search_vector, plainto_tsquery('english', $query))`. Tie-break = `published_at DESC`. This is zero-dependency and production-ready.

2. **Phase 1b (conditional on model/version match):** Add pgvector cosine similarity as a secondary ranking signal. Score = `alpha * ts_rank + (1-alpha) * vector_similarity`. Alpha configurable (default 0.7 FTS / 0.3 vector). Guard: same embedding model+version required; fallback to FTS-only if mismatch.

3. **Phase 2 (future ADR):** External search engine (Meilisearch/Typesense/Algolia) only when FTS/pgvector becomes insufficient.

**Rejected alternatives:**

| Alternative | Reason Rejected |
|-------------|----------------|
| Vector-only search | FTS handles exact-match, Boolean filters, and location queries better; vector is semantic approximation only |
| External search from day 1 | Premature — PostgreSQL FTS+pgvector covers initial scale; adds operational cost without proven need |
| SQL-only filtering (no FTS) | FTS with `ts_rank_cd` is strictly superior to `LIKE`/`ILIKE` for keyword search |
| Embedding per-search query | Too slow — embeddings must be pre-computed at publish/projection time |

### 1.4 Ranking Formula

**RECOMMENDED** — Composite ranking with deterministic tie-break:

```sql
-- Primary: FTS relevance (0..1 normalized)
ts_rank_cd(j.search_vector, plainto_tsquery('english', $query)) AS fts_score

-- Secondary: vector similarity (0..1)
1 - (j.embedding <=> $query_embedding::vector(768)) AS vector_score

-- Composite (alpha configurable, default 0.7)
alpha * fts_score + (1 - alpha) * vector_score AS composite_score

-- Deterministic tie-break: recency
j.published_at DESC

-- Final ORDER BY
ORDER BY composite_score DESC, j.published_at DESC
```

**Fallback**: If `embedding_status != 'completed'` or model mismatch, use `fts_score DESC, published_at DESC` only.

### 1.5 Stale Projection

**Evidence**: `candidate_search_profiles` has:
- `source_profile_revision BIGINT` — last profile revision that was projected
- `projection_revision BIGINT` — actual projection revision
- `generated_at TIMESTAMPTZ` — when projection was generated

**RECOMMENDED**: Return `freshness_marker` to recruiter:

```json
{
  "freshness": "current",
  "profile_revision": 42,
  "projection_revision": 42,
  "generated_at": "2026-08-28T10:30:00Z",
  "is_stale": false
}
```

`is_stale = (projection_revision < source_profile_revision)`. Recruiter UI shows "Profile updated X ago — data may not reflect latest changes."

### 1.6 Implementation & Testing Impact

| Test | Description | Priority |
|------|-------------|----------|
| FTS rank determinism | Same query → same rank for same data | HIGH |
| Vector fallback | Model mismatch → graceful FTS-only | HIGH |
| Tie-break stability | Same score → `published_at DESC` order | MEDIUM |
| Stale projection marker | `projection_revision < source_profile_revision` → `is_stale: true` | MEDIUM |
| Weight verification | Title match scores higher than description match | MEDIUM |
| Empty query | Empty/whitespace query → safe handling | LOW |

---

## 2. J6 — Signed Cursor, Filter Binding, Page Limits, Expiry, Error Mapping

### 2.1 Current Repository Behavior

**No cursor implementation exists.** The API catalog (`PHASE-06-API-CATALOG.md` `API-SEARCH-001`) says:

> "bounded pagination; keyword/FTS, location, skill, experience, salary, company, job type, work mode and posted-date filters"

Decision-07 says:

> "Public API uses opaque signed/versioned cursors; raw offset is not exposed."
> "Cursor binds sort mode and canonical filter hash."
> "Proposed approved limits: default 20, maximum 50, with cursor expiry."
> "Invalid/tampered/expired cursor maps to the approved validation error vocabulary."

**`search_logs` table** (`13_analytics.sql`) has `page_number` and `results_per_page` columns but these are analytics logging, not API pagination.

### 2.2 Evidence

- `DECISION-07-JOBS-SEARCH-FINAL.md` — J6 section
- `PHASE-06-API-CATALOG.md` — `API-SEARCH-001` entry
- `DECISION-06-API-ERROR-VOCABULARY-HINGLISH.md` — `CONFLICT`, `EXPIRED`, `CURSOR_INVALID` are NOT public API codes
- No cursor utility code exists in `04-nestjs-api-app/src/`

### 2.3 Recommended Decision

**RECOMMENDED — HMAC-signed opaque cursor with filter binding**

**Cursor payload:**

```json
{
  "v": 1,
  "sort": "relevance",
  "fh": "sha256(normalized_filters)",
  "p": "last_seen_key",
  "iat": 1693200000
}
```

- `v` = cursor schema version (for forward-compatible migration)
- `sort` = sort mode (binds cursor to specific ordering)
- `fh` = canonical filter hash (SHA-256 of sorted key-value pairs of all active filters)
- `p` = position marker (last sort key value for keyset pagination)
- `iat` = issued-at timestamp (for expiry check)

**Signing**: HMAC-SHA256 with server secret. Signature = `HMAC(payload, secret)`. Cursor = `base64url(payload).base64url(signature)`.

**Page limits:**

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Default page size | 20 | Decision-07 approved |
| Maximum page size | 50 | Decision-07 approved |
| Cursor expiry | 15 minutes | Balances UX (tab switching) vs freshness |
| Cursor version | 1 | Allows schema migration |

**Filter hash binding:**
```
fh = SHA-256(
  sort + "|" +
  location + "|" +
  employment_type + "|" +
  work_mode + "|" +
  experience_level + "|" +
  salary_min + "|" +
  salary_max + "|" +
  skills + "|" +
  category + "|" +
  company_id
)
```

**Cursor expiry behavior:**
- Expired cursor → client receives `VALIDATION_ERROR` with `code: 'EXPIRED_CURSOR'`
- Client discards cursor and restarts from page 1
- This is different from `EXPIRED` (which is NOT a public error code per Decision-06)

**Rejected alternatives:**

| Alternative | Reason Rejected |
|-------------|----------------|
| Offset-based pagination | Inconsistent with FTS rank; O(n) scan on deep pages |
| Encrypted cursor (AES) | Heavier than HMAC; same security properties for pagination |
| No filter hash binding | Client could modify filters while keeping cursor → inconsistent results |
| Server-side cursor store | Adds Redis/DB dependency; cookie-based is stateless and multi-instance safe |
| 5-minute expiry | Too aggressive for UX; user switching tabs loses context |
| 1-hour expiry | Too stale; search results change frequently |

### 2.4 Error Mapping

| Error Condition | HTTP Status | Error Code | Decision-06 Compatible |
|----------------|-------------|------------|----------------------|
| Invalid signature | 400 | `VALIDATION_ERROR` | ✅ |
| Expired cursor | 400 | `VALIDATION_ERROR` | ✅ |
| Filter mismatch | 400 | `VALIDATION_ERROR` | ✅ |
| Cursor schema version unknown | 400 | `VALIDATION_ERROR` | ✅ |
| Malformed cursor | 400 | `VALIDATION_ERROR` | ✅ |

**Note**: `CURSOR_INVALID` is NOT in Decision-06 approved vocabulary. All cursor errors must map to `VALIDATION_ERROR`.

### 2.5 Implementation & Testing Impact

| Test | Description | Priority |
|------|-------------|----------|
| Round-trip signing | Create cursor → verify → read position | HIGH |
| Tamper detection | Modify any field → signature invalid | HIGH |
| Filter hash binding | Different filters → different hash → page restart | HIGH |
| Expiry check | 15-min-old cursor → `VALIDATION_ERROR` | HIGH |
| Page size bounds | page_size > 50 → `VALIDATION_ERROR` | MEDIUM |
| Empty results | No matches → empty array + `has_more: false` | MEDIUM |
| Concurrent filter change | Same cursor + different filter → `VALIDATION_ERROR` | MEDIUM |

---

## 3. J7 — Public Job Visibility, Recruiter Candidate Visibility, Allowed Fields, Freshness

### 3.1 Current Repository Behavior

**Job visibility rules** (from SQL + Decision-07):

| Rule | Evidence | Status |
|------|----------|--------|
| Published + non-deleted + non-expired jobs visible | `05_jobs.sql` indexes WHERE clauses | ✅ Implemented |
| Confidential jobs mask company name | `jobs.is_confidential BOOLEAN` | ✅ Column exists |
| `expires_at IS NULL OR expires_at > NOW()` filter | `expire_due_jobs()` + Decision-07 | ✅ Enforced |
| Expired/closed jobs excluded from search | Decision-07: "Search and apply queries always enforce" | ✅ Documented |
| `deleted_at IS NULL` filter | All partial indexes | ✅ Implemented |

**Candidate visibility rules** (from `08_candidates.sql` + `17_rls.sql`):

| Rule | Evidence | Status |
|------|----------|--------|
| `is_open_to_work` is eligibility signal | `candidate_profiles.is_open_to_work` | ✅ Column exists |
| Not sole authorization boundary | Decision-07: "not the sole authorization boundary" | ✅ Documented |
| RLS: `candidate_profiles_own_read` | `17_rls.sql` | ✅ `user_id = auth.uid()` |
| Recruiter search: `candidate_search_profiles` | `08_candidates.sql` | ✅ Table exists |
| Projected fields only (no raw resume) | Decision-07: "raw resume/evidence is never returned" | ✅ Documented |

**Saved candidates** (`09_applications.sql` + `17_rls.sql`):

| Rule | Evidence | Status |
|------|----------|--------|
| Private per-HR ownership | `saved_candidates.recruiter_user_id` | ✅ |
| Unique `(recruiter_user_id, candidate_id)` | `UNIQUE` constraint | ✅ |
| Non-job-specific | No `job_id` column | ✅ |
| RLS: `saved_candidates_own_read` | `17_rls.sql` | ✅ `recruiter_user_id = auth.uid()` |

### 3.2 Evidence

- `05_jobs.sql` — `is_confidential`, `deleted_at`, partial indexes
- `08_candidates.sql` — `candidate_search_profiles`, `is_open_to_work`
- `09_applications.sql` — `saved_candidates` table
- `17_rls.sql` — RLS policies for jobs, candidates, saved_candidates
- `DECISION-07-JOBS-SEARCH-FINAL.md` — J7 section

### 3.3 Recommended Decision

**RECOMMENDED — Layered visibility with explicit freshness**

**Public job search response (safe fields):**

```typescript
interface JobSearchCard {
  job_id: string;
  title: string;
  slug: string;
  company_name: string | null;  // null when is_confidential
  company_id: string;           // always present for routing
  employment_type: string;
  work_mode: string;
  experience_level: string;
  location_city: string | null;
  location_country: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  salary_visible: boolean;
  is_featured: boolean;
  is_urgent: boolean;
  published_at: string;
  applications_count: number;   // denormalized
  freshness: "today" | "this_week" | "this_month" | "older";
}
```

**Excluded from public response:**
- `created_by`, `published_by`, `approved_by`, `hiring_manager_id`
- `description`, `responsibilities`, `requirements` (full text → separate job detail endpoint)
- `screening_questions`, `ai_ideal_candidate_profile`
- `embedding`, `search_vector` (internal search fields)
- `ai_matching_enabled`, `ai_profile_model`, `ai_profile_version`
- `reference_code` (internal)

**Recruiter candidate search response (safe projected fields):**

```typescript
interface CandidateSearchCard {
  candidate_id: string;
  professional_title: string | null;
  normalized_titles: string[];
  skill_names: string[];
  locations: string[];
  total_experience_years: number | null;
  highest_education_level: string | null;
  is_open_to_work: boolean;
  freshness: {
    profile_revision: number;
    projection_revision: number;
    is_stale: boolean;
    generated_at: string;
  };
}
```

**Excluded from recruiter response:**
- `searchable_text`, `search_vector`, `embedding`
- `fact_sources` (internal provenance)
- Any raw resume text, AI output, evidence, or storage paths

**Freshness bucketing:**

```sql
CASE
  WHEN published_at >= NOW() - INTERVAL '1 day' THEN 'today'
  WHEN published_at >= NOW() - INTERVAL '7 days' THEN 'this_week'
  WHEN published_at >= NOW() - INTERVAL '30 days' THEN 'this_month'
  ELSE 'older'
END AS freshness
```

**Rejected alternatives:**

| Alternative | Reason Rejected |
|-------------|----------------|
| Expose `is_confidential` boolean to public | Unnecessary — null company_name already signals this |
| Return full job description in search results | Performance: description can be large; separate detail endpoint |
| Return raw resume text to recruiter | Security violation — raw resume is private |
| No freshness bucket | Users lose context on job recency |
| Absolute date in search results | Timezone confusion; bucketed freshness is clearer |

### 3.4 Missing: Recruiter Search Permission Scope

**GAP**: Decision-07 says "Recruiter candidate search requires active company membership and approved visibility policy" but the exact permission model is not defined:

1. **Which permission?** — `company_members.role` or a separate `company_members.permissions` field?
2. **Visibility policy?** — Does the recruiter see ALL candidates in the platform, or only those matching their company's subscription/tier?
3. **Cross-company candidate data?** — If candidate X works at Company A and applies to Company B, can Company B's recruiter see Company A's employment data in the candidate projection?

**RECOMMENDED**: All registered candidates with `is_open_to_work = TRUE` are visible to all authorized recruiters. Recruiter authorization = active company membership + recruiter/search permission. Cross-company employment data is visible in the projection (it's the candidate's own data).

**NEEDS_HUMAN_DECISION**: Should there be a per-company candidate visibility scope (e.g., only candidates who applied to this company, or who are in the same location)?

### 3.5 Implementation & Testing Impact

| Test | Description | Priority |
|------|-------------|----------|
| Confidential job masking | `is_confidential=true` → null company name in response | HIGH |
| Expired job exclusion | `expires_at < NOW()` → not in search results | HIGH |
| Deleted job exclusion | `deleted_at IS NOT NULL` → not in search results | HIGH |
| Recruiter field safety | No raw resume/AI output/evidence in recruiter response | HIGH |
| `is_open_to_work` filtering | `false` → excluded from recruiter search | MEDIUM |
| Stale projection marker | `projection_revision < source_profile_revision` → `is_stale: true` | MEDIUM |
| Saved candidate privacy | HR A cannot see HR B's saved candidates | MEDIUM |
| Cross-company isolation | Recruiter from Company A cannot access Company B's internal data | HIGH |

---

## 4. J8 — job-ai-enrichment Event, Gate G-1 Alignment, Analytics Boundary

### 4.1 Current Repository Behavior

**Event infrastructure exists:**

| Component | Location | Status |
|-----------|----------|--------|
| `job-ai-enrichment-requested.v1.json` | `contracts/events/` | ✅ Contract exists |
| `job-enriched.v1.json` | `contracts/events/` | ✅ Output contract exists |
| `job-enrich-task.v1.json` | `contracts/tasks/` | ✅ Task contract exists |
| Dispatcher route `job.ai.enrichment.requested` | `event-route.registry.ts` L:38 | ✅ Registered |
| Queue: `ai-heavy-queue` | `event-route.registry.ts` L:37 | ✅ Registered |
| FastAPI handler `/internal/tasks/job/enrich` | `event-route.registry.ts` L:39 | ✅ Registered |
| `JobAIService` | `job_ai_service.py` | ✅ Implemented |
| `JobEnrichmentResult` | `job_ai_service.py` | ✅ Returns AI profile + embedding |

**Aggregate ID semantics** (`AGGREGATE-ID-SEMANTICS.md`):

| Event | `aggregate_type` | `aggregate_id` = |
|-------|------------------|-------------------|
| `job.ai.enrichment.requested` | `job` | Job UUID |
| `job.enriched` | `job` | Job UUID |

**Gate G-1 status**: The event contract uses `draft-07` schema (not `draft-2020-12`). The contract is a **DRAFT**, not frozen. `AGGREGATE-ID-SEMANTICS.md` says: "G-1 Pending Producer Freeze" for Phase 2 routes.

**Critical distinction**: `job.ai.enrichment.requested` is in **Phase 1** routes (already registered in dispatcher), NOT Phase 2. But the G-1 status says "Producer Freeze" is pending.

### 4.2 Evidence

- `contracts/events/job-ai-enrichment-requested.v1.json` — draft-07, `additionalProperties: false`
- `contracts/tasks/job-enrich-task.v1.json` — draft-07, `additionalProperties: false`
- `contracts/events/job-enriched.v1.json` — draft-07, `additionalProperties: false`, nested `payload`
- `AGGREGATE-ID-SEMANTICS.md` — Phase 1 (3 contracted routes) includes `job.ai.enrichment.requested`
- `event-route.registry.ts` L:38 — registered as Phase 1 route
- `DECISION-07-JOBS-SEARCH-FINAL.md` J8 — "Emit job.ai.enrichment.requested at the approved publish/enrichment point only after Gate G-1 envelope/schema validation and idempotency rules"

### 4.3 Gate G-1 Alignment — CONFLICT

**CONFLICT DETECTED**: Decision-07 J8 says the job enrichment event requires Gate G-1 validation before emission. But `AGGREGATE-ID-SEMANTICS.md` lists `job.ai.enrichment.requested` as a **Phase 1** (already contracted) route, while Gate G-1 is described as "Pending Producer Freeze" for Phase 2 routes only.

**Two possible interpretations:**

| Interpretation | Implication |
|----------------|-------------|
| A: G-1 applies to ALL Phase 1 routes | Job enrichment emission is blocked until G-1 is resolved |
| B: G-1 only applies to Phase 2 routes | Job enrichment can be emitted now (already Phase 1) |

**RECOMMENDED**: Interpretation A is safer. G-1 should validate the `job-ai-enrichment-requested.v1.json` contract before NestJS starts emitting it. The contract exists but is draft-07 (not draft-2020-12), and the `job-enriched.v1.json` output event has a nested `payload` structure that should be verified.

**What G-1 validation should confirm:**
1. `job-ai-enrichment-requested.v1.json` envelope matches actual outbox_events INSERT shape
2. `aggregate_id` = `jobs.id` (verified against `AGGREGATE-ID-SEMANTICS.md`)
3. `trigger` field values (`created`, `updated`, `reparsed`) match actual producer behavior
4. `job-enrich-task.v1.json` task payload matches dispatcher's `payload.builder.ts` output
5. FastAPI `JobAIService.enrich_job()` input matches task contract
6. `job-enriched.v1.json` output matches what FastAPI actually writes to outbox_events

### 4.4 Analytics Boundary

**Current analytics infrastructure** (`13_analytics.sql`):

| Table | Purpose | Status |
|-------|---------|--------|
| `analytics_events` | Raw event capture | ✅ Implemented |
| `analytics_daily_aggregates` | Pre-computed daily aggregates | ✅ Implemented |
| `search_logs` | Search quality telemetry | ✅ Implemented |
| `audit_logs` | Security/compliance audit | ✅ Implemented |
| `error_logs` | Error tracking | ✅ Implemented |

**Search analytics boundary** (Decision-07 J8):

> "Search analytics/impressions remain a separate bounded analytics path and never block search reads."

**RECOMMENDED — Fire-and-forget analytics pattern:**

```
Candidate searches
  → NestJS search endpoint
  → PostgreSQL FTS/vector query (primary path)
  → RETURN results to client
  → ASYNC: INSERT INTO search_logs (non-blocking)
  → ASYNC: INSERT INTO analytics_events (non-blocking)
```

The analytics write MUST NOT be in the same transaction as the search query. Two approaches:

| Approach | How | Tradeoff |
|----------|-----|----------|
| **A: Post-commit hook** | After search transaction commits, fire async INSERT | Simple; small risk of lost analytics on crash |
| **B: Background worker** | Search logs batched and written by background job | Higher reliability; more complexity |

**RECOMMENDED**: Approach A (post-commit hook) for Phase 1. Analytics loss on crash is acceptable; search latency is not.

**Search impression tracking** (`search_logs`):

```sql
-- After search results returned
INSERT INTO search_logs (
  idempotency_key, user_id, company_id, session_id,
  query, filters, result_count,
  search_engine, search_type, search_duration_ms,
  page_number, results_per_page
) VALUES (
  $idempotency_key, $user_id, NULL, $session_id,
  $query, $filters::jsonb, $result_count,
  'fts', 'keyword', $duration_ms,
  $page, 20
);
```

**Job view tracking** (`job_views`):

```sql
-- After job detail page load
INSERT INTO job_views (job_id, user_id, ip_address, user_agent, session_id, referrer_url)
VALUES ($job_id, $user_id, $ip, $ua, $session_id, $referrer);
```

**Rejected alternatives:**

| Alternative | Reason Rejected |
|-------------|----------------|
| Synchronous analytics write | Blocks search response; unacceptable latency |
| Analytics in same DB transaction as search | Increases lock duration; analytics failure rolls back search |
| External analytics service (Segment/Amplitude) | Premature; PostgreSQL analytics tables already exist |
| No search impression tracking | Lose critical search quality telemetry |

### 4.5 Missing: Job Lifecycle and Search Impression Events

**Decision-07 J8 explicitly says:**

> "Do not invent job lifecycle or search-impression events until a versioned contract and consumer are approved."

This means:
- No `job.published`, `job.paused`, `job.closed`, `job.expired` outbox events
- No `search.performed`, `search.result_clicked` outbox events
- These are tracked via `audit_logs` and `search_logs`/`analytics_events` (direct SQL writes, not outbox)

**RECOMMENDED**: This is correct. Job lifecycle events are deterministic DB transitions (expire_due_jobs writes audit + notification). Search impressions are append-only analytics. Neither needs the outbox/dispatcher path.

### 4.6 Implementation & Testing Impact

| Test | Description | Priority |
|------|-------------|----------|
| G-1 contract validation | Outbox event matches `job-ai-enrichment-requested.v1.json` | HIGH |
| Enrichment trigger | Emit only on `publish` and `update` (not on every save) | HIGH |
| Idempotency | Same job re-published → same `event_id` reused or new event deduplicated | HIGH |
| Analytics non-blocking | Search latency unaffected by analytics write | MEDIUM |
| Search log completeness | Every search produces a `search_logs` row | MEDIUM |
| Job view dedup | Same user viewing same job → single `job_views` row per session | LOW |

---

## 5. Summary of All Findings

### 5.1 Verified Correct Points

| # | Point | Evidence |
|---|-------|----------|
| V-1 | FTS infrastructure fully implemented | `05_jobs.sql` triggers + indexes |
| V-2 | Vector infrastructure fully implemented | `05_jobs.sql` HNSW + `embedding` column |
| V-3 | Semantic text builders symmetric for jobs and candidates | `semantic_builders.py` v1 |
| V-4 | Projection service merges canonical + resume facts | `projection_service.py` |
| V-5 | `expire_due_jobs()` correctly designed | `15_infrastructure.sql` |
| V-6 | Analytics tables with immutability triggers | `13_analytics.sql` |
| V-7 | `search_logs` table exists with correct schema | `13_analytics.sql` |
| V-8 | Dispatcher routes correctly registered | `event-route.registry.ts` |
| V-9 | Aggregate ID semantics documented | `AGGREGATE-ID-SEMANTICS.md` |
| V-10 | Confidential job masking column exists | `jobs.is_confidential` |

### 5.2 Conflicts Found

| # | Conflict | Severity | Resolution |
|---|----------|----------|------------|
| C-1 | `job.ai.enrichment.requested` is Phase 1 route but G-1 "pending" | **HIGH** | Either resolve G-1 before job publish coding, or defer enrichment emission |
| C-2 | `job-enriched.v1.json` uses nested `payload` but `job-ai-enrichment-requested.v1.json` is flat | **MEDIUM** | Align contract shapes; output event may be intentionally different |

### 5.3 Missing Decisions

| # | Gap | Severity | Impact | Recommended |
|---|-----|----------|--------|-------------|
| M-1 | **Search ranking formula** not frozen | **HIGH** | Different agents may implement different ranking | Freeze `alpha * ts_rank + (1-alpha) * vector + tie-break: published_at DESC` |
| M-2 | **Cursor HMAC secret** management | **MEDIUM** | Multi-instance signing requires shared secret | Use `CURSOR_SIGNING_SECRET` env var, same as other secrets |
| M-3 | **Recruiter search permission** scope undefined | **HIGH** | Who can search candidates? What fields? | Define: active company membership + search permission |
| M-4 | **Analytics write** not in transaction (by design) but acceptance test undefined | **MEDIUM** | Analytics loss on crash is acceptable but untested | Add acceptance test: search returns results even if analytics INSERT fails |
| M-5 | **Cursor expiry** exact value not frozen | **LOW** | Different expiry = different UX | 15 minutes recommended |
| M-6 | **Freshness bucket** boundaries not frozen | **LOW** | today/week/month thresholds vary | today=1d, week=7d, month=30d recommended |
| M-7 | **G-1 validation checklist** not formalized | **MEDIUM** | Enrichment may emit before contract verified | Create G-1 checklist before job publish coding |
| M-8 | **Search result click** tracking scope | **LOW** | Is `clicked_job_id` in `search_logs` enough? | Yes — `search_logs` already has this column |

### 5.4 Invented Objects

**ZERO invented tables, columns, events, routes, queues, or providers.** All recommendations use existing repository objects.

---

## 6. Final Verdict

| Category | Status |
|----------|--------|
| **J5 — Search FTS/Vector** | ⚠️ **NEEDS_DECISION** — ranking formula and tie-break not frozen |
| **J6 — Cursor/Pagination** | ⚠️ **NEEDS_DECISION** — HMAC cursor design needs approval |
| **J7 — Visibility/Freshness** | ⚠️ **NEEDS_DECISION** — recruiter search permission scope undefined |
| **J8 — Events/Analytics** | ⚠️ **NEEDS_DECISION** — G-1 validation blocks enrichment emission |
| **Overall** | ⚠️ **CONDITIONAL PASS — 4 decisions + 3 HIGH gaps** |

**What can proceed now:**
- FTS-only search (Phase 1a) — infrastructure is ready
- Cursor utility implementation — design is sound
- Job lifecycle commands (J1–J4 frozen)
- Analytics direct writes (search_logs, analytics_events)

**What is blocked:**
- Vector ranking (Phase 1b) — needs ranking formula decision
- Job enrichment emission — needs G-1 validation
- Recruiter candidate search — needs permission scope decision
- Full search API endpoint — needs exact path decision (TBD in catalog)

---

*Report generated by Freebuff agent. No files modified.*
