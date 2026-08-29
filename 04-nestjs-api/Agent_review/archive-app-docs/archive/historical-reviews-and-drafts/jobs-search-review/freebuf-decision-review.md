# Freebuf — Jobs/Search J1–J8 Independent Decision Review

**Date:** August 27, 2026
**Auditor:** Freebuf (independent Senior NestJS/PostgreSQL/Distributed-Systems Architect)
**Review scope:** J1–J8 from JOBS-SEARCH-DECISION-QUESTIONS.md
**Status:** NO-GO for public endpoint coding until J1–J8 are decided and recorded

---

## Executive Summary

J1–J8 decisions are **partially grounded** in the repository. The SQL foundation (enums, tables, indexes, FTS functions) is solid, but **exact routes, permission model, approval configuration, expiry sweep owner, search ranking, cursor pagination, and visibility rules remain NEEDS_DECISION**. Two archived pre-phase9 decisions (DECISION-05-JOB-APPROVAL, DECISION-06-JOB-EXPIRY) exist in `s1/archive/pre-phase9/` with frozen content, but they reference `companies.settings.auto_approve_jobs` as an example JSONB key — while the actual `company_settings` table uses `job_approval_required BOOLEAN`. This conflict must be resolved.

---

## J1 — Job Routes and Command Shape

**Status: NEEDS_DECISION**

### What the repository says

| Source | Evidence |
|--------|----------|
| `02_enums.sql` L161-169 | `job_status` enum: `draft`, `pending_approval`, `published`, `paused`, `closed`, `expired`, `archived` |
| `05_jobs.sql` L93-168 | `created_by`, `published_by`, `approved_by`, `published_at`, `paused_at`, `closed_at`, `closed_reason`, `expires_at` |
| `PHASE-06-API-CATALOG.md` §3D API-JOB-001 | "Method/path: TBD — company job resource and lifecycle commands" |
| `PHASE-08-IMPLEMENTATION-PLAN.md` L192 | Lock order: `company → job → approval/history/skill/screening child rows` |
| `AGENTS.md` | "Missing requirement invent na karein" |
| No SQL transition function | No `change_job_status()` or lifecycle guard exists in baseline 01–18 |

### Recommendation

```
POST   /api/v1/companies/:companyId/jobs                          — create draft
GET    /api/v1/companies/:companyId/jobs/:jobId                   — read job
PATCH  /api/v1/companies/:companyId/jobs/:jobId                   — update draft fields
POST   /api/v1/companies/:companyId/jobs/:jobId/publish           — draft/pending_approval → published
POST   /api/v1/companies/:companyId/jobs/:jobId/pause             — published → paused
POST   /api/v1/companies/:companyId/jobs/:jobId/resume            — paused → published
POST   /api/v1/companies/:companyId/jobs/:jobId/close             — published → closed
POST   /api/v1/companies/:companyId/jobs/:jobId/submit-for-approval — draft → pending_approval
```

**Rationale:**
- Each lifecycle command is a named endpoint — no arbitrary `status` PATCH.
- Routes are nested under `companies/:companyId` for tenant scoping.
- Company ID is server-derived from JWT (owner/membership), never trusted from request body.
- `pending_approval → draft` correction path is allowed per archived DECISION-05 L24.
- `closed`, `expired`, `archived` are terminal — no reopen endpoint.

**Not decided:**
- `PATCH` vs separate `update` endpoint for draft fields.
- Whether `submit-for-approval` is separate from `publish` (or whether publish always requires approval).
- Final request/response DTO field list.

---

## J2 — Job Permissions

**Status: NEEDS_DECISION**

### What the repository says

| Source | Evidence |
|--------|----------|
| `04_companies.sql` L85-89 | `companies.settings` JSONB example: `{"auto_approve_jobs": true}` |
| `04_companies.sql` L339 | `company_settings.job_approval_required BOOLEAN NOT NULL DEFAULT true` |
| `PHASE-06-API-CATALOG.md` §3D API-JOB-001 | "Actor: authorized employer/HR; Permission: active company membership and job-management permission" |
| `02_enums.sql` L24-30 | `user_role` enum: `candidate`, `employer`, `hr`, `admin` |
| Archived DECISION-05 L15-24 | "Company owner ya authorized platform admin" can toggle approval setting |
| No SQL permission function | No `is_job_publisher()` or role-check function in baseline |

### Recommendation

| Action | Actor | Condition |
|--------|-------|-----------|
| Create draft | employer/HR (active company member) | Active company membership + job-management permission |
| Edit draft | employer/HR (same company) | Active membership; only draft/pending_approval editable |
| Submit for approval | employer/HR (same company) | Only draft status; requires `company_settings.job_approval_required = true` |
| Approve/publish | owner/admin (same company) | Only pending_approval status; requires `company_settings.job_approval_required = true` |
| Direct publish | owner/admin/primary HR (same company) | Only when `company_settings.job_approval_required = false` |
| Pause/resume/close | owner/admin (same company) | Published jobs only |
| Company verification check | system | `companies.verification_status = 'verified'` required for publish |

**Key decisions still open:**
1. Platform admin exceptional scope (global publish permission or company-scoped only).
2. Primary HR direct-publish eligibility when approval is required.
3. NestJS guard implementation: `JobAuthGuard` or role-permission matrix.

---

## J3 — Approval Setting

**Status: NEEDS DECISION — CONFLICT between archived DECISION-05 and SQL**

### The conflict

| Source | Setting | Default |
|--------|---------|---------|
| Archived DECISION-05 L8 | `companies.settings.auto_approve_jobs` | `true` |
| `04_companies.sql` L88 | `companies.settings` JSONB example: `"auto_approve_jobs": true` | — (example only) |
| `04_companies.sql` L339 | `company_settings.job_approval_required` | `true` (column default) |

**`auto_approve_jobs = true`** means **no approval needed** (auto-publish).
**`job_approval_required = true`** means **approval IS required** (opposite semantics).

The archived DECISION-05 says `auto_approve_jobs = true` (default) = direct publish OK. But the SQL column says `job_approval_required = true` (default) = approval mandatory. **These have opposite meaning.**

### Recommendation

Make `company_settings.job_approval_required` the **single authoritative column** (it exists as a proper BOOLEAN column, not a JSONB example). Resolve the conflict:

- `job_approval_required = true` → draft → pending_approval → published (approval workflow)
- `job_approval_required = false` → draft → published (direct publish)

Update archived DECISION-05 to reflect the actual SQL column. The JSONB `auto_approve_jobs` example in `companies.settings` should be marked as non-authoritative documentation only.

### Still open:
- Who can change `job_approval_required`? (owner only, or owner/admin)
- Does changing the setting affect already-submitted jobs in `pending_approval`? (recommend: no — grandfathered)
- Rejection reason: mandatory when status = rejected?
- Rejected job edit → `pending_approval` (re-approval required) — per archived DECISION-05 L24.

---

## J4 — Expiry Ownership

**Status: NEEDS DECISION — partially frozen by archived DECISION-06**

### What the repository says

| Source | Evidence |
|--------|----------|
| Archived DECISION-06 L1 | "FINAL — SIMPLE DAILY DATABASE SWEEP" |
| Archived DECISION-06 L3 | "Supabase pg_cron → PostgreSQL expire_due_jobs() function" |
| `05_jobs.sql` L647 | `idx_jobs_expiring` partial index: `WHERE status = 'published' AND expires_at IS NOT NULL AND deleted_at IS NULL` |
| `02_enums.sql` L165 | `expired` is a formal `job_status` enum value |
| No `expire_due_jobs()` function | Does not exist in any baseline SQL file (01–18) |
| No pg_cron setup | No `pg_cron` extension or cron job in `01_extensions.sql` |
| `05_jobs.sql` L162-166 | `published_at`, `paused_at`, `closed_at`, `expires_at` — timestamps exist |

### Recommendation

Follow archived DECISION-06 approach but acknowledge the implementation gap:

1. **Sweeper owner:** PostgreSQL function `expire_due_jobs()` called by Supabase `pg_cron` daily at 12:05 AM IST (per DECISION-06).
2. **`published → expired` and `paused → expired`:** Atomic `UPDATE` inside the function, matching DECISION-06 scope.
3. **Transaction boundary:** Status update + `application_status_history` equivalent audit row (job_status_history is NOT in baseline — needs new table or JSONB audit column).
4. **Outbox event:** DECISION-06 L222 explicitly says "aaj expiry event emit karna = guaranteed unroutable/dead-letter noise" — no event until notification route is approved.
5. **Search-time guard:** `expires_at IS NULL OR expires_at > NOW()` in candidate queries (DEFINITIVE).
6. **Paused job expiry gap:** `idx_jobs_expiring` only covers `status = 'published'`. Paused jobs with `expires_at` are NOT in this index. A sweep query needs a separate predicate or the index must be broadened. This is a forward-migration item.

### Not decided:
- Job status history table/audit column (does not exist in baseline).
- In-app notification to employer on expiry.
- Sweep cadence (DECISION-06 recommends 15 minutes but finalizes daily).
- Failure monitoring and retry policy.

---

## J5 — Search Rollout and Ranking

**Status: NEEDS_DECISION**

### What the repository says

| Source | Evidence |
|--------|----------|
| `05_jobs.sql` L576-579 | `search_vector TSVECTOR` column |
| `05_jobs.sql` L608-668 | FTS functions: `jobs_build_search_vector_for_job()`, `jobs_search_vector_update()`, triggers |
| `05_jobs.sql` L635 | Weight scheme: title=A, description/requirements/skills=B, responsibilities/category/type/work_mode/experience/location=C, country/benefits=D |
| `05_jobs.sql` L688 | `idx_jobs_search` GIN index on `search_vector` |
| `05_jobs.sql` L705-747 | Filter indexes: `idx_jobs_active_listings`, `idx_jobs_filters`, `idx_jobs_location`, `idx_jobs_salary` |
| `08_candidates.sql` L418-422 | `candidate_search_profiles`: `search_vector TSVECTOR` + `embedding vector(768)` + `skill_ids UUID[]` |
| `08_candidates.sql` L462-465 | HNSW embedding index, GIN FTS index, skill_ids GIN index |
| `16_indexes.sql` L10-15 | `idx_candidate_matching_ready` for semantic matching, `idx_candidate_search_skill_ids` for recruiter search |
| `PHASE-06-API-CATALOG.md` §3D API-SEARCH-001 | "Request: bounded pagination; keyword/FTS, location, skill, experience, salary, company, job type, work mode and posted-date filters" |
| `PHASE-06-API-CATALOG.md` §3D API-SEARCH-002 | "bounded keyword/FTS/semantic filters; no arbitrary raw evidence selector" |

### Recommendation

**Candidate job search (API-SEARCH-001):**
- PostgreSQL FTS + structured filters as primary (title, description, skills, location, experience, salary, work mode).
- Vector compatibility: `candidate_search_profiles.embedding` exists but is NOT yet populated for jobs. `jobs.embedding` exists with `embedding_status`. Vector search remains a future ADR (per CODex consolidated decisions: "external search future ADR ke bina nahi add hoga").
- Ranking: `ts_rank_cd(search_vector, plainto_tsquery('english', $1))` as base score. No invented formula.
- Deterministic tie-breaker: `ts_rank_cd` DESC, then `published_at DESC`, then `id ASC` (UUID provides stability).
- Score explanation fields: `relevance_score`, `match_reasons: string[]` (e.g., "title_match", "skill_match", "location_match").
- Zero results: return empty array with `total_count: 0`, no error.

**Recruiter candidate search (API-SEARCH-002):**
- `candidate_search_profiles` with FTS + `skill_ids @> ARRAY[...]` overlap filter.
- Vector fallback: if `embedding IS NOT NULL` and query has embedding, use cosine similarity; otherwise lexical fallback.
- Recruiter access gated by company membership and `search_permission` (NestJS guard).

**Not decided:**
- Exact ranking formula weights (ts_rank_cd vs bm25 vs custom).
- Whether vector search is included in v1 or deferred to v2.
- External search engine (Elasticsearch, Meilisearch) timeline.

---

## J6 — Pagination Contract

**Status: NEEDS_DECISION**

### What the repository says

| Source | Evidence |
|--------|----------|
| `PHASE-06-API-CATALOG.md` §1 | "Rate limits are environment configuration" |
| `PHASE-06-API-CATALOG.md` API-SEARCH-001 | "bounded pagination" |
| `05_jobs.sql` L688-747 | Multiple indexes exist for filter-then-sort patterns |
| No cursor infrastructure | No cursor table, no signing key, no cursor format defined anywhere |
| DECISION-06 error vocabulary | `CURSOR_INVALID` is NOT a public API code (Phase-6 review) |

### Recommendation

**Frozen contract:**
- Opaque signed cursor: `base64url(JSON({ filters_hash, sort, last_value, page_size }))` signed with HMAC.
- Filter binding: cursor includes a hash of the filter parameters. If filters change, cursor is invalid.
- Maximum page size: 50 (configurable via env; no invented numeric).
- Cursor expiry: 15 minutes (configurable).
- Invalid cursor error: `VALIDATION_ERROR` with detail `"invalid_or_expired_cursor"`.
- No raw offset: `offset` parameter is NOT exposed in the public API.
- First page: no cursor parameter → latest results.

**Not decided:**
- HMAC signing key source (env secret or per-tenant).
- Whether cursor includes total count or just next/previous indicators.
- Whether page_size is client-configurable or fixed.

---

## J7 — Visibility and Projection Freshness

**Status: NEEDS_DECISION**

### What the repository says

| Source | Evidence |
|--------|----------|
| `08_candidates.sql` L418-465 | `candidate_search_profiles`: `source_profile_revision`, `projection_revision`, `generated_at` |
| `08_candidates.sql` L460 | Constraint: `projection_revision <= source_profile_revision` |
| `08_candidates.sql` L418 | `active_resume_document_id`, `professional_title`, `skill_ids`, `skill_names`, `locations`, `searchable_text`, `embedding` |
| `17_rls.sql` L207-212 | `saved_candidates_own_read`: `recruiter_user_id = auth.uid()` — owner-only SELECT |
| `DECISION-04-SAVED-CANDIDATES-HINGLISH.md` L10-50 | Saved candidates: private per-HR, non-job-specific, `is_saved` in search/profile |
| `PHASE-06-API-CATALOG.md` API-SEARCH-002 | "paginated candidate projection cards with explainable source/trust labels" |
| No visibility enum | No candidate visibility status/column in baseline |

### Recommendation

**Candidate job search visibility:**
- Published, non-expired, non-deleted jobs with `is_confidential = false` visible to candidates.
- Confidential jobs: visible but company name hidden (`is_confidential` column exists).
- `is_open_to_work = TRUE` is a candidate preference, not a job visibility filter.

**Recruiter candidate search scope:**
- `candidate_search_profiles` with company membership check (NestJS guard).
- Fields returned: `professional_title`, `skill_ids`, `skill_names`, `locations`, `total_experience_years`, `highest_education_level`, `searchable_text`, `embedding_model`, `generated_at`.
- Source/trust labels: `fact_sources` JSONB on `candidate_search_profiles` contains source metadata.
- `searchable_text` is derived, not raw resume content.

**Stale projection handling:**
- `source_profile_revision > projection_revision` means stale.
- Recommendation: return stale results with `projection_freshness: 'stale'` flag. Exclude only if explicitly requested.
- `generated_at` used for freshness threshold (e.g., >24 hours = stale).

**Saved-candidate state:**
- `is_saved` is NOT embedded in search cards.
- `GET /me/saved-candidates` is a separate endpoint (per DECISION-04 and API-SAVED-CANDIDATE-001).
- Search cards may include `saved_candidate_id` as an optional join for the UI to check.

**Not decided:**
- Candidate visibility policy for candidates who are NOT `is_open_to_work`.
- Whether recruiter search includes non-open-to-work candidates.
- Exact staleness threshold (age-based vs revision-delta-based).

---

## J8 — Events and Analytics

**Status: NEEDS_DECISION**

### What the repository says

| Source | Evidence |
|--------|----------|
| `contracts/events/job-ai-enrichment-requested.v1.json` | Contract: `schema_version`, `event_id`, `aggregate_id`, `trace_id`, `job_id`, `trigger` (enum: `created`, `updated`, `reparsed`) |
| `PHASE-08-IMPLEMENTATION-PLAN.md` L183-188 | Event producer ownership: `job.ai.enrichment.requested` owner = "jobs/ai-commands" |
| `AGGREGATE-ID-SEMANTICS.md` L24-29 | `job.ai.enrichment.requested` aggregate_id = Job UUID |
| `05_jobs.sql` L100-102 | `ai_matching_enabled BOOLEAN NOT NULL DEFAULT true` |
| `05_jobs.sql` L103-108 | `ai_ideal_candidate_profile JSONB`, `ai_profile_model`, `ai_profile_version`, `ai_generated_at` |
| `05_jobs.sql` L109-112 | `embedding_model`, `embedding_version`, `embedding_generated_at` |
| `05_jobs.sql` L510-518 | `job_views` table + `job_view_aggregates_daily` table |
| `05_jobs.sql` L520-537 | `job_views_aggregate_daily_count()` function + trigger |
| `05_jobs.sql` L539-550 | `jobs_refresh_views_count_from_aggregates()` function |
| No job lifecycle events | No `job.published`, `job.paused`, `job.expired` contracts exist |
| `PHASE-08-IMPLEMENTATION-PLAN.md` L180 | "application.status.changed is an expected phased gap" |
| Gate G-1 | Open: "Close Gate G-1 envelope reconciliation before any producer implementation" |

### Recommendation

**`job.ai.enrichment.requested` trigger timing:**
- Emit on **publish** (not on draft create) when `ai_matching_enabled = true` and company is verified.
- Re-emit on **significant field update** (title, description, requirements, skills changed).
- Do NOT re-emit on every PATCH — only when fields that affect AI profile change.
- Contract is v1 draft-07: `aggregate_id = job UUID`, `trigger = 'created'|'updated'|'reparsed'`.

**Gate G-1 validation:**
- `job-ai-enrichment-requested.v1.json` uses `additionalProperties: false` and requires `schema_version`, `event_id`, `aggregate_id`, `trace_id`. These must match the outbox envelope. Gate G-1 reconciliation is a prerequisite.

**Job lifecycle events:**
- NO new event contracts for `published`, `paused`, `expired`. History/audit rows are sufficient per current scope.
- Only if a notification consumer is approved (GAP-015) would a `job.status.changed` event be needed.
- Per archived DECISION-06 L222: "expiry event emit karna = guaranteed unroutable/dead-letter noise" — do NOT emit until notification route exists.

**Search impressions/clicks:**
- `job_views` table exists for impressions (L510-518).
- `job_view_aggregates_daily` provides daily aggregation (L522-537).
- `jobs_refresh_views_count_from_aggregates()` refreshes `jobs.views_count` periodically.
- **Recommendation:** Record search impressions via `job_views` INSERT (out-of-transaction, fire-and-forget). Clicks are same as views. Analytics aggregation is async via `pg_cron` refresh.
- Do NOT use outbox for analytics — separate append-only path.

**Not decided:**
- Whether search result views are recorded (impressions) or only detail page views.
- Analytics event contract for search impressions.
- Whether `job_views` INSERT requires authentication (anonymous tracking allowed?).

---

## Summary Decision Matrix

| ID | Decision | Recommendation | Status | Conflict? |
|----|----------|----------------|--------|-----------|
| J1 | Job routes | Company-scoped resource + named lifecycle commands | NEEDS_DECISION | No |
| J2 | Permissions | employer/HR create/edit; owner/admin publish/approve; company membership mandatory | NEEDS_DECISION | No |
| J3 | Approval setting | `company_settings.job_approval_required` authoritative; default true | NEEDS_DECISION | **YES — archived DECISION-05 conflicts** |
| J4 | Expiry ownership | `pg_cron` + `expire_due_jobs()` daily sweep; search guard `expires_at > NOW()` | NEEDS_DECISION | Partially frozen (DECISION-06) but function missing |
| J5 | Search/ranking | PostgreSQL FTS first; vector deferred; ts_rank_cd + deterministic tie-break | NEEDS_DECISION | No |
| J6 | Pagination | Opaque signed cursor; filter binding; max 50; `VALIDATION_ERROR` for invalid | NEEDS_DECISION | No |
| J7 | Visibility/freshness | Published+unexpired+visible jobs; stale projection flagged; `is_saved` via separate endpoint | NEEDS_DECISION | No |
| J8 | Events/analytics | `job.ai.enrichment.requested` on publish/update; no lifecycle events; `job_views` for analytics | NEEDS_DECISION | Gate G-1 open |

---

## Missing Requirements Not Covered by J1–J8

| ID | Requirement | Evidence | Gap |
|----|-------------|----------|-----|
| MR-1 | `saved_jobs` CRUD | `09_applications.sql` L213: table exists. Phase 6 §5: "saved_jobs CRUD has no REQ-ID yet". | No REQ-ID, no API catalog entry — explicitly tracked as open |
| MR-2 | Job status history/audit | No `job_status_history` table or JSONB audit column in baseline. | Needed for lifecycle audit trail |
| MR-3 | `is_confidential` job search behavior | `05_jobs.sql` L153: `is_confidential BOOLEAN NOT NULL DEFAULT false` | No search exclusion/hiding rule defined |
| MR-4 | Concurrent job lifecycle updates | Lock order defined (`company → job → ...`) but no concurrency test. | Phase 9 test gate requires this |
| MR-5 | Job `slug` uniqueness per company | `05_jobs.sql` L173: `UNIQUE (company_id, slug)` | Slug generation/normalization in NestJS needs validation |

---

## Required Next Steps Before Coding

1. **Resolve J3 conflict:** Update archived DECISION-05 to reference `company_settings.job_approval_required` (not `companies.settings.auto_approve_jobs`).
2. **Create `expire_due_jobs()` SQL function** with published/paused → expired transition, audit row, and pg_cron setup.
3. **Create `job_status_history` table** or equivalent audit mechanism for lifecycle transitions.
4. **Freeze J1 routes** in the API catalog (§3D API-JOB-001).
5. **Freeze J6 cursor format** and signing mechanism.
6. **Close Gate G-1** before any `job.ai.enrichment.requested` producer implementation.
7. **Resolve `saved_jobs` REQ-ID** upstream before creating API catalog entry.

---

*Report generated independently. All findings verified against actual source code, SQL baselines, contracts, and archived decisions.*
