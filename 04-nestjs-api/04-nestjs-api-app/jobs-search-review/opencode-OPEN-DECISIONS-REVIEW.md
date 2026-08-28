# Jobs/Search Open Decisions (J5–J8) — Independent Review

**Reviewer:** Senior NestJS, PostgreSQL & Distributed Systems Architect
**Review date:** 2026-08-27
**Scope:** J5–J8 only (J1–J4 frozen, not reopened)

---

## J5 — Search: FTS/Vector Rollout, Ranking, Tie-break, Stale Projection

### 1. Current Repository Behavior

**FTS is implemented in SQL, not in NestJS:**
- `jobs.search_vector TSVECTOR` column — `05_jobs.sql:190`
- `idx_jobs_search GIN index` — `05_jobs.sql:629`
- `jobs_build_search_vector_for_job()` function — `05_jobs.sql:520-537` — weighted FTS with A/B/C/D weights
- `jobs_search_vector_update()` trigger — `05_jobs.sql:539-555` — auto-updates on INSERT/UPDATE of title, description, requirements, responsibilities, category, benefits, location, employment_type, work_mode, experience_level
- `job_skills_search_vector_trigger` — `05_jobs.sql:588-591` — refreshes FTS after job-skill changes
- `skills_search_vector_refresh_trigger` — `05_jobs.sql:618-621` — refreshes affected jobs after skill rename

**Vector (pgvector) is defined but not populated:**
- `jobs.embedding vector(768)` — `05_jobs.sql:186`
- `idx_jobs_embedding HNSW index` — `05_jobs.sql:703-706` — `WHERE embedding_status = 'completed' AND status = 'published' AND deleted_at IS NULL`
- `embedding_status` enum: `pending`, `processing`, `completed`, `failed` — `02_enums.sql:429-434`
- `embedding_consistency CHECK` — `05_jobs.sql:239-243` — enforces all-or-nothing metadata
- `embedding_completed_consistency CHECK` — `05_jobs.sql:244-246` — embedding_status='completed' requires embedding IS NOT NULL

**Candidate search profiles have FTS + vector columns but NO FTS trigger:**
- `candidate_search_profiles.search_vector TSVECTOR` — `08_candidates.sql:433`
- `candidate_search_profiles.embedding vector(768)` — `08_candidates.sql:434`
- `idx_candidate_search_fts GIN index` — `08_candidates.sql:611-612`
- `idx_candidate_search_embedding HNSW index` — `08_candidates.sql:613-615`
- **NO trigger to populate `candidate_search_profiles.search_vector`** — projection worker writes this table but no FTS trigger exists

**Decision-07 J5 says:**
> "PostgreSQL relational filters + FTS are the first implementation layer. Compatible vector ranking may be added with lexical fallback when model/version matches. External search engine is future ADR scope. Ranking must be deterministic with an approved score/tie-break and explainable trust/source labels."

**Phase 06 API Catalog:**
> API-SEARCH-001: "exact public search path is not specified by Decision-07; do not invent one" — `PHASE-06-API-CATALOG.md:438-439`

### 2. Evidence

| Evidence | Location | Status |
|---|---|---|
| `jobs.search_vector` TSVECTOR column | `05_jobs.sql:190` | ✅ EXISTS |
| `jobs_build_search_vector_for_job()` weighted function | `05_jobs.sql:520-537` | ✅ EXISTS |
| `idx_jobs_search GIN` index | `05_jobs.sql:629` | ✅ EXISTS |
| FTS trigger on jobs | `05_jobs.sql:557-563` | ✅ EXISTS |
| FTS refresh on job_skills change | `05_jobs.sql:588-591` | ✅ EXISTS |
| FTS refresh on skill name change | `05_jobs.sql:618-621` | ✅ EXISTS |
| `jobs.embedding vector(768)` | `05_jobs.sql:186` | ✅ EXISTS |
| `idx_jobs_embedding HNSW` | `05_jobs.sql:703-706` | ✅ EXISTS |
| `embedding_status` enum | `02_enums.sql:429-434` | ✅ EXISTS |
| `candidate_search_profiles.search_vector` | `08_candidates.sql:433` | ✅ EXISTS |
| `candidate_search_profiles.embedding` | `08_candidates.sql:434` | ✅ EXISTS |
| `idx_candidate_search_fts GIN` | `08_candidates.sql:611-612` | ✅ EXISTS |
| `idx_candidate_search_embedding HNSW` | `08_candidates.sql:613-615` | ✅ EXISTS |
| Candidate search FTS trigger | N/A | ❌ MISSING |
| `expire_due_jobs()` uses `expires_at > NOW()` | `15_infrastructure.sql:401` | ✅ EXISTS |
| Public search excludes expired | `05_jobs.sql:647-648` index filter: `WHERE status IN ('published', 'paused') AND expires_at IS NOT NULL` | ✅ Index-only |

### 3. Recommended Decision

**J5-R1: FTS ranking weights — NEEDS_HUMAN_DECISION**

The current weights in `jobs_build_search_vector_for_job()` are:
- **A** (0.1): `title`
- **B** (0.4): `description`, `requirements`, skill names
- **C** (0.4): `responsibilities`, `category`, `employment_type`, `work_mode`, `experience_level`, `location_city`
- **D** (0.1): `location_country`, `benefits`

These weights are hardcoded in SQL. Decision-07 says "ranking must be deterministic with an approved score/tie-break." The current implementation has no tie-break — if two jobs have the same ts_rank score, PostgreSQL returns them in undefined order.

**Recommendation:** Add a deterministic tie-break: `ORDER BY ts_rank_cd(search_vector, plainto_tsquery('english', $1)) DESC, published_at DESC, id DESC`. The `published_at DESC` ensures newest jobs appear first when relevance scores tie; `id DESC` is the final tie-break.

**J5-R2: Vector model/version compatibility — DEFERRED (correct)**

Decision-07 says "compatible vector ranking may be added with lexical fallback when model/version matches." This is correctly deferred. The `embedding_model` and `embedding_version` columns exist on both `jobs` and `candidate_search_profiles`. The 768-dimension vector is compatible with common embedding models (e.g., `text-embedding-3-small`).

**No action needed.** When vector search is enabled, the NestJS layer must check `embedding_model`/`embedding_version` match before using vector similarity; fallback to FTS if not.

**J5-R3: Stale projection — DEFERRED (correct)**

`candidate_search_profiles.source_profile_revision` and `projection_revision` columns exist with a CHECK constraint: `projection_revision <= source_profile_revision` — `08_candidates.sql:438-439`. The projection worker rebuilds from canonical facts; stale projections are handled by the `generated_at` timestamp.

**No action needed.** The staleness marker is the `generated_at` timestamp. Recruiter search results should include this timestamp for freshness transparency.

**J5-R4: Candidate search FTS trigger — REQUIRED for recruiter search**

`candidate_search_profiles.search_vector` exists but has no trigger. The projection worker (`07-fastapi-ai-worker/app/services/projection_service.py`) writes this table. The FTS column must be populated by the projection worker, not a SQL trigger (since the worker does a full UPSERT of the projection).

**Recommendation:** The projection worker must set `search_vector` when building `candidate_search_profiles`. This is implementation work, not a decision — the projection worker already writes all other columns.

### 4. Rejected Alternatives

- **External search engine (Elasticsearch/Meilisearch):** Rejected per Decision-07 — "External search engine is future ADR scope." PostgreSQL FTS + GIN is sufficient for current scale.
- **IVFFLAT index for vectors:** Rejected — HNSW is already chosen (`05_jobs.sql:703-706`) and is preferred for low-latency production search.

### 5. Implementation and Testing Impact

- **NestJS search adapter:** Must use `plainto_tsquery('english', $1)` with `ts_rank_cd` for FTS queries. Must add deterministic tie-break.
- **Candidate search adapter:** Must populate `search_vector` during projection rebuild.
- **Tests:** FTS relevance test (keyword match returns correct job), vector fallback test (model mismatch degrades to FTS), tie-break determinism test (same score → same order).

---

## J6 — Pagination: Signed Cursor, Filter Binding, Page Limits, Expiry, Error Mapping

### 1. Current Repository Behavior

**No cursor infrastructure exists.** The SQL baseline has no cursor-related tables, functions, or columns. The API catalog says:
- API-SEARCH-001: "bounded pagination; keyword/FTS, location, skill, experience, salary, company, job type, work mode and posted-date filters" — `PHASE-06-API-CATALOG.md:442-443`
- API-SEARCH-001: "paginated safe job cards and cursor/next-page metadata" — `PHASE-06-API-CATALOG.md:444`

**Decision-07 J6 says:**
> "Public API uses opaque signed/versioned cursors; raw offset is not exposed. Cursor binds sort mode and canonical filter hash. Proposed approved limits: default 20, maximum 50, with cursor expiry. Invalid/tampered/expired cursor maps to the approved validation error vocabulary."

**Error vocabulary:**
- `CURSOR_INVALID` — "not a public API code" per `PHASE-06-API-CATALOG.md:29` — must map to `VALIDATION_ERROR`

### 2. Evidence

| Evidence | Location | Status |
|---|---|---|
| API-SEARCH-001 says "bounded pagination" | `PHASE-06-API-CATALOG.md:442` | ✅ EXISTS |
| API-SEARCH-001 says "cursor/next-page metadata" | `PHASE-06-API-CATALOG.md:444` | ✅ EXISTS |
| Decision-07 J6: signed/versioned cursors | `DECISION-07-JOBS-SEARCH-FINAL.md:87-90` | ✅ EXISTS |
| Decision-07 J6: default 20, max 50 | `DECISION-07-JOBS-SEARCH-FINAL.md:89` | ✅ EXISTS |
| Decision-07 J6: cursor expiry | `DECISION-07-JOBS-SEARCH-FINAL.md:89` | ✅ EXISTS |
| Decision-07 J6: cursor binds sort + filter hash | `DECISION-07-JOBS-SEARCH-FINAL.md:88` | ✅ EXISTS |
| Error vocabulary: CURSOR_INVALID not public | `PHASE-06-API-CATALOG.md:29` | ✅ EXISTS |
| Cursor utility / signing code | N/A | ❌ NOT IMPLEMENTED |
| Cursor-related SQL functions | N/A | ❌ NOT IMPLEMENTED |

### 3. Recommended Decision

**J6-R1: Cursor format — IMPLEMENTATION DETAIL (not a decision)**

Decision-07 already specifies the cursor contract: signed, versioned, binds sort mode and filter hash, with expiry. The implementation format (e.g., base64-encoded JSON with HMAC signature) is an implementation detail, not a decision.

**Recommendation:** Use the same signing pattern as the OAuth state helper (`oauth-state.ts`): AES-256-GCM encrypted payload with `keyVersion` prefix. The cursor payload should contain:
- `sort`: sort mode (e.g., `relevance`, `date`, `salary`)
- `filters`: canonical filter hash (SHA-256 of sorted filter key-value pairs)
- `offset_key`: the last seen `created_at` + `id` for keyset pagination
- `expiresAt`: cursor expiry timestamp
- `keyVersion`: for rotation

**J6-R2: Cursor expiry TTL — NEEDS_HUMAN_DECISION**

Decision-07 says "with cursor expiry" but doesn't specify the TTL. For a job search:
- Too short (e.g., 5 minutes): user loses results while browsing
- Too long (e.g., 24 hours): stale results, new jobs appear/disappear unpredictably

**Recommendation:** Default 30 minutes for job search, 10 minutes for recruiter candidate search (more volatile data). This is an environment-configurable value.

**J6-R3: Filter hash binding — IMPLEMENTATION DETAIL (not a decision)**

Decision-07 already specifies "cursor binds sort mode and canonical filter hash." This prevents filter tampering (user changes filters but reuses old cursor). The implementation is straightforward: SHA-256 of sorted filter parameters, included in the signed cursor.

**No decision needed.**

### 4. Rejected Alternatives

- **Offset-based pagination:** Rejected per Decision-07 — "raw offset is not exposed." Offset is unstable for concurrent data changes.
- **Cursor without filter binding:** Rejected per Decision-07 — "cursor binds sort mode and canonical filter hash." Unbound cursors allow filter manipulation.
- **No cursor expiry:** Rejected per Decision-07 — "with cursor expiry." Stale cursors must be rejected.

### 5. Implementation and Testing Impact

- **NestJS cursor utility:** Sign/verify/decrypt cursor using AES-256-GCM (same pattern as `oauth-state.ts`).
- **Filter hash:** SHA-256 of sorted filter key-value pairs, included in cursor payload.
- **Keyset pagination:** Use `created_at, id` as the pagination key (already indexed via `idx_jobs_active_listings`).
- **Tests:** Tampered cursor rejection, expired cursor rejection, filter-hash mismatch rejection, different sort modes, page-size enforcement (default 20, max 50).

---

## J7 — Visibility and Freshness

### 1. Current Repository Behavior

**Public job visibility:**
- Jobs table has `is_confidential BOOLEAN` — `05_jobs.sql:179` — "Hide company name?"
- Jobs table has `deleted_at` — `05_jobs.sql:193` — soft delete
- Jobs table has `expires_at` — `05_jobs.sql:165` — auto-close date
- Jobs table has `status job_status` — `05_jobs.sql:163` — includes `published`, `expired`, `archived`
- `expire_due_jobs()` transitions published/paused to expired — `15_infrastructure.sql:385-469`
- `expire_due_jobs()` uses `FOR UPDATE SKIP LOCKED LIMIT 100` — bounded batch

**Candidate search profiles:**
- `candidate_search_profiles` has `professional_title`, `skill_names`, `locations`, `total_experience_years`, `highest_education_level`, `searchable_text` — `08_candidates.sql:418-470`
- `candidate_profiles.is_open_to_work` — `08_candidates.sql:71` — "eligible signal, not authorization boundary"
- No RLS policy on `candidate_search_profiles` for authenticated users — `17_rls.sql` — correct (SystemClient-only)

**Decision-07 J7 says:**
> "Public job search returns only published, non-deleted, non-expired jobs; confidential jobs use a masked company identity rather than being silently exposed. Recruiter candidate search requires active company membership and approved visibility policy. `is_open_to_work` is an eligibility signal, not the sole authorization boundary. Stale candidate projections return only approved projected fields with an explicit freshness marker; raw resume/evidence is never returned. Saved-candidate state remains private, recruiter-scoped, and non-job-specific."

**Phase 06 API Catalog:**
> API-SEARCH-001: "only active/published/non-expired visible jobs" — `PHASE-06-API-CATALOG.md:441`
> API-SEARCH-002: "HR from company A cannot search/view restricted candidate data outside policy" — `PHASE-06-API-CATALOG.md:474`

### 2. Evidence

| Evidence | Location | Status |
|---|---|---|
| `jobs.is_confidential` column | `05_jobs.sql:179` | ✅ EXISTS |
| `jobs.deleted_at` soft delete | `05_jobs.sql:193` | ✅ EXISTS |
| `jobs.expires_at` auto-close | `05_jobs.sql:165` | ✅ EXISTS |
| `expire_due_jobs()` function | `15_infrastructure.sql:385-469` | ✅ EXISTS |
| `expire_due_jobs()` uses `FOR UPDATE SKIP LOCKED LIMIT 100` | `15_infrastructure.sql:406` | ✅ EXISTS |
| `expire_due_jobs()` uses `expires_at <= v_now` | `15_infrastructure.sql:402` | ✅ EXISTS |
| Public search index excludes expired | `05_jobs.sql:647-648` (`WHERE status IN ('published', 'paused') AND expires_at IS NOT NULL`) | ⚠️ PARTIAL |
| `candidate_search_profiles` RLS for authenticated | N/A | ❌ NOT NEEDED (SystemClient-only) |
| `saved_candidates` RLS for owner | `17_rls.sql:211-212` | ✅ EXISTS |
| `candidate_profiles.is_open_to_work` | `08_candidates.sql:71` | ✅ EXISTS |
| Candidate search projection fields | `08_candidates.sql:418-470` | ✅ EXISTS |

### 3. Recommended Decision

**J7-R1: Expired job filter in queries — CRITICAL GAP**

The public job search query must filter: `WHERE expires_at IS NULL OR expires_at > NOW()`. But the current indexes only partially support this:

- `idx_jobs_expiring` (`05_jobs.sql:647-648`): `WHERE status IN ('published', 'paused') AND expires_at IS NOT NULL AND deleted_at IS NULL` — this index is for the expiry sweep, not for search queries
- `idx_jobs_active_listings` (`05_jobs.sql:635-636`): `WHERE status = 'published' AND deleted_at IS NULL` — does NOT filter expired jobs
- `idx_jobs_published_date` (`05_jobs.sql:639-640`): `WHERE status = 'published' AND deleted_at IS NULL` — does NOT filter expired jobs

**Gap:** The search query must add `AND (expires_at IS NULL OR expires_at > NOW())` to every public job query. The existing indexes don't include this predicate. A new composite index may be needed for search performance.

**Recommendation:** Add a search-optimized index:
```sql
CREATE INDEX idx_jobs_search_published ON jobs(status, published_at DESC)
WHERE status = 'published' AND deleted_at IS NULL AND (expires_at IS NULL OR expires_at > NOW());
```
Or add the expiry filter to existing search indexes.

**J7-R2: Confidential job masking — NEEDS_HUMAN_DECISION**

Decision-07 says "confidential jobs use a masked company identity rather than being silently exposed." But:
- `jobs.is_confidential` exists (`05_jobs.sql:179`)
- No masking logic exists in SQL or NestJS
- The API catalog doesn't specify what "masked company identity" means

**Questions:**
- Does the response omit `company_id` and company name?
- Does it return a generic "Confidential Company" label?
- Does the job appear in search results at all, or only when the candidate explicitly clicks?
- Can the recruiter see their own confidential jobs normally?

**Recommendation:** Confidential jobs appear in search results with a masked company name. The recruiter sees the real company name. The NestJS DTO strips `company_id` and replaces company name with "Confidential Company" when `is_confidential = true`.

**J7-R3: Candidate freshness marker — NEEDS_HUMAN_DECISION**

Decision-07 says "stale candidate projections return only approved projected fields with an explicit freshness marker." But:
- `candidate_search_profiles.generated_at` exists (`08_candidates.sql:437`)
- `candidate_search_profiles.source_profile_revision` and `projection_revision` exist (`08_candidates.sql:420-421`)
- No "freshness marker" field exists in the response DTO

**Recommendation:** The API response should include `projection_freshness` derived from `generated_at`:
- `< 1 hour`: "fresh"
- `1-24 hours`: "recent"
- `> 24 hours`: "stale" (with a warning)
- The recruiter sees `generated_at` timestamp and can decide whether to trust the projection.

**J7-R4: Recruiter visibility policy — NEEDS_HUMAN_DECISION**

Decision-07 says "Recruiter candidate search requires active company membership and approved visibility policy." But no visibility policy exists:
- `candidate_profiles.is_open_to_work` is the only signal
- No "visibility policy" column or enum exists
- The API catalog says "no arbitrary raw evidence selector" — `PHASE-06-API-CATALOG.md:464`

**Questions:**
- Can a recruiter search ALL candidates, or only `is_open_to_work = true`?
- Can a recruiter see candidates from other companies?
- Is there a "visibility opt-in" beyond `is_open_to_work`?

**Recommendation:** For current scope, recruiter search returns only `is_open_to_work = true` candidates. Company membership is verified by NestJS (not RLS — `candidate_search_profiles` has no authenticated RLS policy). Cross-company candidate visibility is allowed (recruiters see candidates from other companies if they're open to work). Future scope can add granular visibility policies.

### 4. Rejected Alternatives

- **Hard-delete expired jobs:** Rejected — `expire_due_jobs()` transitions to `expired` status, preserving history.
- **Exclude confidential jobs from search:** Rejected per Decision-07 — "confidential jobs use a masked company identity rather than being silently exposed."
- **RLS-based candidate visibility:** Rejected — `candidate_search_profiles` has no authenticated RLS policy (correct — SystemClient-only table).
- **is_open_to_work as sole authorization boundary:** Rejected per Decision-07 — "`is_open_to_work` is an eligibility signal, not the sole authorization boundary."

### 5. Implementation and Testing Impact

- **NestJS search query:** Must add `AND (expires_at IS NULL OR expires_at > NOW())` to all public job queries.
- **NestJS DTO:** Must mask company identity when `is_confidential = true`.
- **NestJS DTO:** Must include `projection_freshness` derived from `generated_at`.
- **NestJS authorization:** Must verify active company membership for recruiter search.
- **Tests:** Expired job excluded from search, confidential job masked, freshness marker present, recruiter cross-company access, `is_open_to_work` filter.

---

## J8 — Events and Analytics: job-ai.enrichment.requested, Gate G-1 Alignment, Analytics Boundary

### 1. Current Repository Behavior

**Event contract exists but is incomplete:**
- `job-ai-enrichment-requested.v1.json` — `contracts/events/job-ai-enrichment-requested.v1.json`
- Uses draft-07 schema, NOT Draft 2020-12
- Required fields: `schema_version`, `event_id`, `aggregate_id`, `trace_id`
- Optional fields: `job_id`, `trigger` (enum: `created`, `updated`, `reparsed`)
- **Missing from contract:** `aggregate_type`, `event_type`, `payload`, `occurred_at` — these are in the outbox envelope but not in the event contract

**Gate G-1 status:**
- `G1-ENVELOPE-ALIGNMENT.md` says: "Status: PENDING (blocked by producer freeze from 04-nestjs-api)"
- "Phase 1 trigger event contracts (to be created/aligned): `job-ai-enrichment-requested.v1.json`"
- "The dispatcher does NOT parse or validate payload content — it forwards the uniform task payload"
- "E2E integration requires alignment: When 04-nestjs-api starts emitting events, the contracts must match exactly"

**Outbox envelope:**
- `outbox_events` table — `15_infrastructure.sql:23-89` — has `aggregate_type`, `event_type`, `payload`, `occurred_at`, `schema_version`, `correlation_id`, `causation_id`
- Event type format check: `^[a-z0-9]+([._-][a-z0-9]+)*$` — `15_infrastructure.sql:54-57`

**Aggregate ID semantics:**
- `AGGREGATE-ID-SEMANTICS.md:16`: `job.ai.enrichment.requested` → `aggregate_type = 'job'`, `aggregate_id = Job UUID`
- "AI enrichment populates `ai_ideal_candidate_profile` and `embedding` on the `jobs` row"

**FastAPI worker:**
- `job_ai_service.py` — handles job AI enrichment (LLM extraction, embedding generation)
- Handler exists in `app/services/job_ai_service.py`

**Decision-07 J8 says:**
> "Emit `job.ai.enrichment.requested` at the approved publish/enrichment point only after Gate G-1 envelope/schema validation and idempotency rules. Do not invent job lifecycle or search-impression events until a versioned contract and consumer are approved. Expiry currently writes the approved in-app notification row in its atomic function. Search analytics/impressions remain a separate bounded analytics path and never block search reads."

### 2. Evidence

| Evidence | Location | Status |
|---|---|---|
| `job-ai-enrichment-requested.v1.json` contract | `contracts/events/job-ai-enrichment-requested.v1.json` | ✅ EXISTS (incomplete) |
| Contract uses draft-07 schema | `contracts/events/job-ai-enrichment-requested.v1.json:2` | ⚠️ OUTDATED |
| Contract missing `aggregate_type` | N/A | ❌ MISSING |
| Contract missing `event_type` | N/A | ❌ MISSING |
| Contract missing `payload` object | N/A | ❌ MISSING |
| Contract missing `occurred_at` | N/A | ❌ MISSING |
| Gate G-1(b) status: PENDING | `G1-ENVELOPE-ALIGNMENT.md:3` | ⚠️ PENDING |
| Outbox envelope has `aggregate_type`, `event_type`, `payload`, `occurred_at` | `15_infrastructure.sql:27-34` | ✅ EXISTS |
| `AGGREGATE-ID-SEMANTICS.md` maps `job.ai.enrichment.requested` | `AGGREGATE-ID-SEMANTICS.md:16` | ✅ EXISTS |
| `expire_due_jobs()` writes notification directly | `15_infrastructure.sql:454-463` | ✅ EXISTS |
| No job lifecycle events invented | Decision-07 J8: "Do not invent" | ✅ CORRECT |
| No search impression events invented | Decision-07 J8: "separate bounded analytics path" | ✅ CORRECT |
| `job_views` table exists for analytics | `05_jobs.sql:437-447` | ✅ EXISTS |
| `job_view_aggregates_daily` table exists | `05_jobs.sql:455-461` | ✅ EXISTS |
| `analytics_events` table exists | `17_rls.sql:137` (RLS enabled) | ✅ EXISTS |

### 3. Recommended Decision

**J8-R1: Event contract alignment — REQUIRED before producer implementation**

The current `job-ai-enrichment-requested.v1.json` is a draft-07 "Phase 1" contract that only specifies the task payload fields (`schema_version`, `event_id`, `aggregate_id`, `trace_id`, `job_id`, `trigger`). It does NOT align with the outbox envelope format.

Per `G1-ENVELOPE-ALIGNMENT.md:29-41`, the target state is:
```json
{
  "schema_version": 1,
  "event_id": "<uuid>",
  "aggregate_type": "job",
  "aggregate_id": "<job uuid>",
  "event_type": "job.ai.enrichment.requested",
  "payload": { "job_id": "<uuid>", "trigger": "created|updated|reparsed" },
  "occurred_at": "<ISO-8601>"
}
```

**Recommendation:** Update `job-ai-enrichment-requested.v1.json` to Draft 2020-12 schema with the full outbox envelope. This is a contract change, not a decision — the target state is already documented in `G1-ENVELOPE-ALIGNMENT.md`.

**J8-R2: Enrichment trigger point — NEEDS_HUMAN_DECISION**

Decision-07 says "emit at the approved publish/enrichment point." But the exact trigger point is not specified:
- On `POST /jobs/:jobId/publish` (direct publish)?
- On `POST /jobs/:jobId/approve` (approval flow)?
- On `PATCH /jobs/:jobId` (any update that changes enrichable fields)?

The API catalog says: "Outbox/consumer: job.ai.enrichment.requested when approved fields require enrichment" — `PHASE-06-API-CATALOG.md:425`

**Recommendation:** Emit `job.ai.enrichment.requested` when:
1. A job is published (status transitions to `published`)
2. A published job's title, description, requirements, responsibilities, or skills change

This is consistent with "when approved fields require enrichment" — not every update triggers enrichment, only changes to fields that affect the AI profile.

**J8-R3: Idempotency rules — IMPLEMENTATION DETAIL**

Decision-07 says "after Gate G-1 envelope/schema validation and idempotency rules." The outbox already provides at-least-once delivery semantics. The FastAPI worker must be idempotent:
- If the same `event_id` is delivered twice, the worker should process it once (check `processed_events` table)
- If the same job is enriched twice, the result should be the same (deterministic)

**No decision needed.** This is implementation work.

**J8-R4: Analytics boundary — CORRECTLY DEFINED**

Decision-07 says "Search analytics/impressions remain a separate bounded analytics path and never block search reads." The existing `job_views` and `job_view_aggregates_daily` tables support this. The `analytics_events` table (`17_rls.sql:137`) is the approved analytics path.

**No decision needed.** The boundary is correctly defined.

### 4. Rejected Alternatives

- **Job lifecycle events (status.changed):** Rejected per Decision-07 — "Do not invent job lifecycle or search-impression events until a versioned contract and consumer are approved." The expiry function writes notifications directly; no outbox event is used for expiry.
- **Search impression events:** Rejected per Decision-07 — "Search analytics/impressions remain a separate bounded analytics path." `job_views` table captures impressions.
- **Enrichment on every update:** Rejected — wasteful for non-enrichable field changes (e.g., `vacancies`, `is_urgent`).

### 5. Implementation and Testing Impact

- **Contract update:** Update `job-ai-enrichment-requested.v1.json` to Draft 2020-12 with full outbox envelope.
- **NestJS producer:** Emit `job.ai.enrichment.requested` on publish and enrichable-field changes. Validate envelope before outbox INSERT.
- **FastAPI worker:** Already has `job_ai_service.py`. Must validate incoming task against updated contract. Must be idempotent (check `processed_events`).
- **Tests:** Enrichment on publish, enrichment on skill change, no enrichment on non-enrichable change, idempotency test, contract validation test.

---

## Summary of Open Decisions Requiring Human Input

| Decision | Priority | Recommendation |
|---|---|---|
| J5-R1: FTS ranking tie-break | MEDIUM | Add `published_at DESC, id DESC` as deterministic tie-break |
| J6-R2: Cursor expiry TTL | MEDIUM | Default 30 min for job search, 10 min for recruiter search |
| J7-R1: Expired job filter in queries | HIGH | Add `AND (expires_at IS NULL OR expires_at > NOW())` to all public job queries |
| J7-R2: Confidential job masking | MEDIUM | Mask company name in DTO when `is_confidential = true` |
| J7-R3: Candidate freshness marker | LOW | Include `projection_freshness` derived from `generated_at` in API response |
| J7-R4: Recruiter visibility policy | MEDIUM | Current scope: `is_open_to_work = true` only; cross-company allowed |
| J8-R1: Event contract alignment | HIGH | Update `job-ai-enrichment-requested.v1.json` to Draft 2020-12 with full outbox envelope |
| J8-R2: Enrichment trigger point | MEDIUM | Emit on publish and enrichable-field changes only |

## Summary of Implementation-Ready Items (No Decision Needed)

| Item | Status | Notes |
|---|---|---|
| J5: FTS infrastructure | ✅ READY | GIN index, weighted function, triggers all exist |
| J5: Vector infrastructure | ✅ READY | HNSW index, embedding columns exist; model/version check in NestJS |
| J5: Candidate search FTS | ⚠️ NEEDS CODE | Projection worker must populate `search_vector` |
| J6: Cursor signing | ✅ READY | Use same pattern as `oauth-state.ts` |
| J6: Filter hash binding | ✅ READY | SHA-256 of sorted filters |
| J6: Keyset pagination | ✅ READY | `created_at, id` keyset with existing indexes |
| J7: Expired job index | ⚠️ NEEDS SQL | New composite index for search with expiry filter |
| J7: Saved-candidate RLS | ✅ EXISTS | `17_rls.sql:211-212` owner-read policy |
| J8: Outbox envelope | ✅ EXISTS | `outbox_events` table with all required fields |
| J8: Aggregate ID semantics | ✅ EXISTS | `AGGREGATE-ID-SEMANTICS.md` maps all routes |
| J8: FastAPI worker handler | ✅ EXISTS | `job_ai_service.py` handles enrichment |
