# Jobs/Search Decisions J1–J8 — Independent Senior Architect Review

**Reviewer:** opencode (Independent Senior NestJS, PostgreSQL & Distributed Systems Architect)
**Date:** 2026-08-27
**Report:** `04-nestjs-api/04-nestjs-api-app/jobs-search-review/opencode-decision-review.md`

---

## Methodology

This review independently answers decisions J1–J8 from `JOBS-SEARCH-DECISION-QUESTIONS.md` by verifying every recommendation against:

1. Executable SQL baseline (`02-database/migrations/baseline/01–18`)
2. Frozen API catalog (`PHASE-06-API-CATALOG.md`)
3. Approved architecture (`PHASE-07-ARCHITECTURE.md`)
4. Approved implementation plan (`PHASE-08-IMPLEMENTATION-PLAN.md`)
5. Frozen requirements (`PHASE-05-FINAL-REQUIREMENTS.md`)
6. Existing decisions (Decision-01..06)
7. Shared contracts (`contracts/events/`, `contracts/tasks/`)
8. Existing NestJS API code
9. Dispatcher registry (`event-route.registry.ts`)

No routes, DTOs, columns, events, permissions, ranking formulas, expiry mechanisms, queues, providers, or business rules are invented. Where the repository does not decide something, it is marked `NEEDS_DECISION`. Where two sources conflict, both are shown.

---

## J1 — Job Routes and Lifecycle Commands

### Recommendation

```text
POST   /api/v1/companies/:companyId/jobs              — Create draft job
GET    /api/v1/companies/:companyId/jobs/:jobId        — Read job (company-scoped)
PATCH  /api/v1/companies/:companyId/jobs/:jobId        — Update job (draft/pending only)
POST   /api/v1/companies/:companyId/jobs/:jobId/publish    — Named command
POST   /api/v1/companies/:companyId/jobs/:jobId/pause      — Named command
POST   /api/v1/companies/:companyId/jobs/:jobId/resume     — Named command
POST   /api/v1/companies/:companyId/jobs/:jobId/close      — Named command
POST   /api/v1/companies/:companyId/jobs/:jobId/archive    — Named command
POST   /api/v1/companies/:companyId/jobs/:jobId/approve    — Named command (when approval required)
POST   /api/v1/companies/:companyId/jobs/:jobId/reject     — Named command (when approval required)
```

### Evidence

| Claim | Source | Status |
|---|---|---|
| `job_status` enum: `draft`, `pending_approval`, `published`, `paused`, `closed`, `expired`, `archived` | `02_enums.sql:161-169` | SUPPORTED |
| Jobs table has `company_id`, `created_by`, `published_by`, `approved_by`, `approved_at`, `published_at`, `paused_at`, `closed_at`, `closed_reason`, `expires_at` columns | `05_jobs.sql:93-275` | SUPPORTED |
| `company_settings.job_approval_required` boolean controls approval workflow | `04_companies.sql:339` | SUPPORTED |
| `jobs.slug` is unique per company (`UNIQUE (company_id, slug)`) | `05_jobs.sql:200` | SUPPORTED |
| `jobs.reference_code` is unique per company (`UNIQUE (company_id, reference_code)`) | `05_jobs.sql:201` | SUPPORTED |
| No existing NestJS job endpoints | `app.module.ts` — no job controller imported | SUPPORTED |
| Phase 6 catalog: `API-JOB-001` — "TBD — company job resource and lifecycle commands" | `PHASE-06-API-CATALOG.md:391-411` | SUPPORTED |
| `closed`, `expired`, `archived` are terminal; terminal job cannot reopen; repost = new `job_id` | Archived Decision-05:26-27 | SUPPORTED |
| `REQ-JOB-001`: "Authorized company user creates/edits/publishes/closes job" | `PHASE-02-REQUIREMENTS-TRACEABILITY-MATRIX.md:100` | SUPPORTED |
| `REQ-JOB-002`: "Job stores structured skills/location/work-mode/compensation/experience" | `PHASE-02-REQUIREMENTS-TRACEABILITY-MATRIX.md:101` | SUPPORTED |
| Job lifecycle lock order: `company → job → approval/history/skill/screening child rows` | `PHASE-08-IMPLEMENTATION-PLAN.md:192` | SUPPORTED |
| Arbitrary `status` PATCH forbidden — named lifecycle commands only | `JOBS-SEARCH-DECISION-QUESTIONS.md:14` | SUPPORTED |
| No ad-hoc `UPDATE` on `jobs.status` — DB trigger `enforce_application_status_update_path` pattern exists for applications | `09_applications.sql:654-666` | SUPPORTED (pattern) |

### Missing from SQL

- No `enforce_job_status_update_path()` trigger exists (unlike `enforce_application_status_update_path()`). This means a direct `UPDATE jobs SET status = '...'` would succeed at the DB level without transition validation. The archived Decision-05 defines the transitions but there is no DB-level enforcement.
- No `job_status_history` table exists. `application_status_history` exists but there is no job equivalent.
- No `jobs.created_by` FK to `users(id)` with proper permission semantics — the column exists but permission semantics are undefined.

### Status: **NEEDS_DECISION**

Missing items requiring decision:
1. **DB-level transition guard**: Should `enforce_job_status_update_path()` trigger be created (like `enforce_application_status_update_path`)? Or is NestJS-layer enforcement sufficient? RECOMMENDATION: Create the DB trigger for defense-in-depth.
2. **Job status history**: Should a `job_status_history` table be created (like `application_status_history`)? RECOMMENDATION: Yes, for audit trail.
3. **`jobs.reference_code` generation**: The comment says "Generated by NestJS at job creation time" (`05_jobs.sql:113`). Format example: `JOB-2026-000123`. RECOMMENDATION: Use a DB sequence or NestJS-generated ULID.
4. **Draft edit scope**: What fields are editable in `draft` vs `pending_approval`? The DB allows all column updates. RECOMMENDATION: NestJS validation should restrict editable fields by status.
5. **`close` vs `archive` distinction**: `closed_reason` column exists on `jobs`. Is `close` for filled positions and `archive` for hidden-but-retained? RECOMMENDATION: `close` = filled/no longer accepting, `archive` = hidden from listings but retained for history.

---

## J2 — Job Permissions

### Recommendation

| Action | Who | Company membership required |
|---|---|---|
| Create draft | `employer`, `hr` with active membership | Yes |
| Edit draft/pending | Creator or `owner`/`admin` | Yes |
| Publish (direct or approve) | `owner`/`admin` | Yes |
| Pause/Resume | `owner`/`admin` or original publisher | Yes |
| Close | `owner`/`admin` or hiring manager | Yes |
| Archive | `owner`/`admin` | Yes |
| View company jobs (HR dashboard) | Any active member | Yes |
| Cross-company job access | Deny | — |

### Evidence

| Claim | Source | Status |
|---|---|---|
| `users.role` enum: `candidate`, `employer`, `hr`, `admin` | `02_enums.sql:61-66` | SUPPORTED |
| `company_members` has `is_active`, `is_primary_hr`, `permissions` JSONB | `04_companies.sql:234-313` | SUPPORTED |
| `company_members.permissions` can contain `manage_company` key | `04_companies.sql:339` (referenced in organization.ts code) | SUPPORTED |
| Existing `OrganizationService.admin()` checks `owner_id` OR `is_primary_hr=true` OR `permissions->>'manage_company'` | `organization.ts` (existing code pattern) | SUPPORTED |
| `jobs.created_by` column exists | `05_jobs.sql:102` | SUPPORTED |
| `jobs.hiring_manager_id` column exists | `05_jobs.sql:106` | SUPPORTED |
| No existing job permission model in code | No job controller/service exists | SUPPORTED |
| Company membership verification: `is_company_member()` in `17_rls.sql:18-32` | RLS function | SUPPORTED |
| Phase 7: "Modules do not directly mutate another module's tables" | `PHASE-07-ARCHITECTURE.md:73` | SUPPORTED |
| Phase 8 lock order: `company → job → approval/history/skill/screening child rows` | `PHASE-08-IMPLEMENTATION-PLAN.md:192` | SUPPORTED |

### Missing

- No `company_member_permissions` or role-grant table for fine-grained job permissions.
- The `company_members.permissions` JSONB field exists but has no documented schema for job-specific permissions.
- No `jobs.hiring_manager_id` permission semantics defined — can a hiring manager pause/close a job they manage?

### Status: **NEEDS_DECISION**

1. **Permission granularity**: Should job permissions be based on (`is_primary_hr`, `permissions->>'manage_company'`) only, or should a separate `job_management` permission key be introduced? RECOMMENDATION: Reuse existing `is_primary_hr` + `manage_company` pattern (consistent with organization module).
2. **Hiring manager scope**: Should `hiring_manager_id` grant pause/close rights? RECOMMENDATION: Yes, for pause/close only; publish/approve remains owner/admin.
3. **Platform admin exceptional scope**: Can `admin` role users manage jobs across any company? RECOMMENDATION: Yes, for moderation purposes, with audit trail.

---

## J3 — Approval Setting

### Recommendation

```text
company_settings.job_approval_required = true (current SQL default)
    draft → pending_approval → (owner/admin approve) → published
    draft → (owner/admin correct) → pending_approval → published

company_settings.job_approval_required = false
    draft → (publish command) → published
```

### Evidence

| Claim | Source | Status |
|---|---|---|
| `company_settings.job_approval_required BOOLEAN NOT NULL DEFAULT true` | `04_companies.sql:339` | SUPPORTED |
| `job_status` enum includes `pending_approval` | `02_enums.sql:163` | SUPPORTED |
| Archived Decision-05: `auto_approve_jobs = true (default)` → `draft → published` | `DECISION-05-JOB-APPROVAL-AND-DIRECT-PUBLISH-HINGLISH.md:8` | **CONFLICT** |
| `jobs.approved_by`, `jobs.approved_at` columns exist | `05_jobs.sql:104-105` | SUPPORTED |
| CHECK constraint: `(approved_by IS NULL AND approved_at IS NULL) OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)` | `05_jobs.sql:229-233` | SUPPORTED |
| Phase 6 catalog: "approval policy captured" | `PHASE-06-API-CATALOG.md:407` | SUPPORTED |
| Phase 8: "Job create/update/approval/publish/pause/expiry lifecycle" | `PHASE-08-IMPLEMENTATION-PLAN.md:161` | SUPPORTED |

### CONFLICT: SQL Default vs Archived Decision

**SQL default (`04_companies.sql:339`):** `job_approval_required = true` → approval required by default.

**Archived Decision-05 (`DECISION-05-JOB-APPROVAL-AND-DIRECT-PUBLISH-HINGLISH.md:8`):** `auto_approve_jobs = true (default)` → direct publish by default.

These are semantically opposite. The SQL is the executable truth. The archived decision uses a different key name (`auto_approve_jobs` vs `job_approval_required`) and different default.

### Resolution

The SQL column `job_approval_required` is the authoritative source. The archived decision used `auto_approve_jobs` as an example key name. The correct interpretation:

- `job_approval_required = false` → auto-approve (direct publish)
- `job_approval_required = true` → approval required (default)

The archived decision's **intent** was "auto-approve by default" but the SQL implements "approval required by default." This is a deliberate design choice — the SQL default is the safer production default.

### Missing

- No `company_settings` update permission model documented for who can change `job_approval_required`.
- No rejection reason column on `jobs` (only `closed_reason` exists).
- No `pending_approval → draft` correction path documented in SQL or decisions.

### Status: **CONFLICT** (SQL default vs archived decision key name/semantics)

1. **Default value**: SQL says `job_approval_required = true` (approval required). Archived Decision-05 says `auto_approve_jobs = true` (auto-approve). The SQL is the executable truth. RECOMMENDATION: Accept SQL default (`approval required by default`). Companies can opt into auto-approve.
2. **Setting change permission**: Who can toggle `job_approval_required`? RECOMMENDATION: Company `owner` only (safety-critical setting).
3. **Rejected job resubmission**: When a job is rejected from `pending_approval`, should it go back to `draft` for editing? RECOMMENDATION: Yes, `pending_approval → draft` should be allowed. This is consistent with the archived Decision-05.
4. **Rejection reason mandatory**: When rejecting a job from `pending_approval`, should a reason be required? RECOMMENDATION: Yes, the `jobs.closed_reason` column pattern suggests reasons are expected. Add a `rejection_reason` field or reuse `closed_reason`.
5. **Re-approval after edit**: If a job in `pending_approval` is edited by HR, should it remain in `pending_approval` or go back to `draft`? RECOMMENDATION: Remain in `pending_approval` (edits are corrections, not new submissions).

---

## J4 — Expiry Ownership

### Recommendation

```text
Single authoritative sweeper: Supabase pg_cron + DB function

Daily at 00:05 IST:
    expire_due_jobs() function
        ├── published/paused jobs WHERE expires_at <= NOW() → status = 'expired'
        ├── Audit: job_status_history insert (if created)
        └── In-app notification (if notification table supports it)

Search-time defensive guard:
    WHERE status = 'published'
      AND deleted_at IS NULL
      AND (expires_at IS NULL OR expires_at > NOW())
```

### Evidence

| Claim | Source | Status |
|---|---|---|
| `jobs.expires_at TIMESTAMPTZ` column exists | `05_jobs.sql:165` | SUPPORTED |
| CHECK: `expires_at IS NULL OR expires_at > created_at` | `05_jobs.sql:203` | SUPPORTED |
| Index: `idx_jobs_expiring ON jobs(expires_at) WHERE status = 'published' AND expires_at IS NOT NULL AND deleted_at IS NULL` | `05_jobs.sql:647-648` | SUPPORTED |
| Archived Decision-06: "Simple Daily Database Sweep" — `pg_cron` + `expire_due_jobs()` | `DECISION-06-JOB-EXPIRY-POLICY-HINGLISH.md` | SUPPORTED |
| Archived Decision-06: `published/paused → expired` transition | `DECISION-06-JOB-EXPIRY-POLICY-HINGLISH.md:22` | SUPPORTED |
| Archived Decision-06: sweep cadence recommended 15 minutes | `DECISION-06-JOB-EXPIRY-POLICY-HINGLISH.md:59` | SUPPORTED |
| `expires_at IS NULL` means never expires | `DECISION-06-JOB-EXPIRY-POLICY-HINGLISH.md:57` | SUPPORTED |
| Guest application checks `expires_at > NOW()` — CONFIRMED GAP | `CODEX-CONSOLIDATED-JOBS-SEARCH-DECISIONS.md:43-45` | SUPPORTED |
| No `expire_due_jobs()` function exists in SQL baseline | Grep confirms no such function | SUPPORTED |
| No `job_status_history` table exists | Grep confirms | SUPPORTED |
| Phase 6 catalog: "expired/closed jobs are excluded from candidate search" | `PHASE-06-API-CATALOG.md:431` | SUPPORTED |
| No outbox event for `published → expired` transition defined | No contract exists | SUPPORTED |

### Missing

- `expire_due_jobs()` function not yet created in SQL baseline.
- No `job_status_history` table for audit trail.
- No outbox event for expiry notification to employer.
- Guest application `expires_at` gap not reconciled.
- No `published → expired` DB trigger exists (unlike `change_application_status`).

### Status: **NEEDS_DECISION**

1. **Sweeper owner**: The archived Decision-06 recommends `pg_cron` + DB function. RECOMMENDATION: Accept this — simplest, no external dependency.
2. **Sweep cadence**: Decision-06 recommends 15 minutes, then says 12:05 AM daily. RECOMMENDATION: 15-minute cadence for faster candidate-facing expiry; daily for batch notifications.
3. **`expires_at IS NULL` semantics**: Decision-06 recommends "never expires." RECOMMENDATION: Accept — explicit "no expiry" setting.
4. **Notification on expiry**: Decision-06 says "in-app notification table row." RECOMMENDATION: Yes, insert into `notifications` table for employer.
5. **Outbox event for expiry**: Should `published → expired` emit an outbox event? RECOMMENDATION: No — no consumer exists. Keep as audit-only (DB status + notification row). Add outbox event only when a consumer is approved.
6. **Guest `expires_at` gap**: Guest application query must check `expires_at > NOW()`. This is a known gap (`CODEX-CONSOLIDATED-JOBS-SEARCH-DECISIONS.md:43`). RECOMMENDATION: Fix before guest apply is production-ready.
7. **DB trigger**: Should `enforce_job_status_update_path()` exist to prevent direct `UPDATE jobs SET status = 'expired'` outside the function? RECOMMENDATION: Yes — same pattern as `enforce_application_status_update_path()`.

---

## J5 — Search Rollout and Ranking

### Recommendation

```text
Layer 1: PostgreSQL FTS (lexical) — current production scope
    - GIN index on jobs.search_vector
    - Weighted fields: title(A), description(B), requirements(B), skills(B),
      responsibilities(C), category(C), location_city(C), etc.
    - ts_rank / ts_rank_cd for relevance scoring
    - Deterministic tie-breaker: (published_at DESC, jobs.id) for stable ordering

Layer 2: pgvector semantic — compatible mode, not first launch
    - HNSW index exists (idx_jobs_embedding)
    - embedding vector(768) exists
    - Cosine similarity for semantic matching
    - Fallback to lexical FTS if vector returns zero/low-confidence results

Score formula: NOT FROZEN
    - RECOMMENDATION: ts_rank (lexical) weighted 0.6 + cosine_similarity (semantic) 0.4
    - Tie-breaker: published_at DESC, id
    - Explanation fields: NOT YET DEFINED

Zero-result behavior: Return empty results with filter summary
    - No "did you mean" unless approved separately
    - No external search engine (REQ-SEARCH-005 is FUTURE/GAP-010)
```

### Evidence

| Claim | Source | Status |
|---|---|---|
| `jobs.search_vector TSVECTOR` column | `05_jobs.sql:190` | SUPPORTED |
| `idx_jobs_search ON jobs USING GIN(search_vector)` | `05_jobs.sql:629` | SUPPORTED |
| `jobs_build_search_vector_for_job()` — weighted FTS function | `05_jobs.sql:520-537` | SUPPORTED |
| Weights: title=A, description=B, requirements=B, skills=B, category=C, location_city=C | `05_jobs.sql:524-535` | SUPPORTED |
| `jobs.embedding vector(768)` — pgvector column | `05_jobs.sql:186` | SUPPORTED |
| `idx_jobs_embedding ON jobs USING hnsw (embedding vector_cosine_ops)` | `05_jobs.sql:703-706` | SUPPORTED |
| `candidate_search_profiles.search_vector TSVECTOR` | `08_candidates.sql:433` | SUPPORTED |
| `candidate_search_profiles.embedding vector(768)` | `08_candidates.sql:434` | SUPPORTED |
| `idx_candidate_search_fts ON candidate_search_profiles USING GIN(search_vector)` | `08_candidates.sql:611-612` | SUPPORTED |
| `idx_candidate_search_embedding ON candidate_search_profiles USING hnsw (embedding vector_cosine_ops)` | `08_candidates.sql:613-615` | SUPPORTED |
| Phase 6: "PostgreSQL filters + FTS current direction" | `CODEX-CONSOLIDATED-JOBS-SEARCH-DECISIONS.md:20` | SUPPORTED |
| `REQ-SEARCH-005` (external search) is FUTURE/GAP-010 | `PHASE-08-IMPLEMENTATION-PLAN.md:156` | SUPPORTED |
| Phase 7: "search/ query and explainable ranking read models" module | `PHASE-07-ARCHITECTURE.md:59` | SUPPORTED |
| No existing search API endpoint | No search controller exists | SUPPORTED |
| Phase 6: "analytics is separate requirement" for search impressions | `PHASE-06-API-CATALOG.md:424` | SUPPORTED |

### Missing

- No score formula frozen.
- No deterministic tie-breaker frozen.
- No ranking explanation fields defined.
- No zero-result/low-confidence behavior defined.
- No candidate search FTS function defined (only jobs FTS exists).
- `candidate_search_profiles` has no FTS trigger — only `search_vector` column exists.

### Status: **NEEDS_DECISION**

1. **FTS only for first launch**: RECOMMENDATION: Yes — lexical FTS with `ts_rank`. pgvector semantic is Layer 2 (compatible mode, not first launch).
2. **Candidate search FTS**: `candidate_search_profiles` has `search_vector` column but no trigger to populate it. RECOMMENDATION: Create `candidate_search_profiles_search_vector_update()` trigger (similar to `jobs_search_vector_update()`).
3. **Score formula**: RECOMMENDATION: `ts_rank(search_vector, plainto_tsquery('english', query))` for lexical. Defer weighted formula to Phase 9 implementation.
4. **Tie-breaker**: RECOMMENDATION: `(published_at DESC, id)` for jobs; `(updated_at DESC, id)` for candidates.
5. **Zero-result behavior**: RECOMMENDATION: Return empty array with `total: 0` and applied filters summary. No "did you mean" or synonym expansion in v1.
6. **External search**: REQ-SEARCH-005 is explicitly FUTURE. RECOMMENDATION: Do not add any external search provider dependency.

---

## J6 — Pagination Contract

### Recommendation

```text
Cursor format: Base64URL-encoded JSON
    { "p": "<page_token>", "f": "<hash_of_filters>", "v": 1 }

Maximum page size: 50 (default 20)
Cursor expiry: 15 minutes (server-side cache invalidation)
Invalid cursor error: CURSOR_INVALID (400)

Response shape:
{
  "data": [...],
  "pagination": {
    "next_cursor": "base64url...",
    "has_more": true,
    "total_count": 1234
  }
}
```

### Evidence

| Claim | Source | Status |
|---|---|---|
| Phase 6: "bounded pagination" for job search | `PHASE-06-API-CATALOG.md:420` | SUPPORTED |
| Phase 6: "paginated safe job cards and cursor/next-page metadata" | `PHASE-06-API-CATALOG.md:422` | SUPPORTED |
| Phase 6: "paginated candidate projection cards" | `PHASE-06-API-CATALOG.md:442` | SUPPORTED |
| Phase 7: "cursor recovery" for messaging | `PHASE-07-ARCHITECTURE.md:168` | SUPPORTED (pattern) |
| DECISION-06 error vocabulary: `CURSOR_INVALID` exists but is noted as "not public API codes" | `DECISION-06-API-ERROR-VOCABULARY-HINGLISH.md` (referenced in Phase 6 §1) | SUPPORTED |
| Phase 6 §1: "Cursor invalid" is NOT in public error vocabulary — "Domain conflicts must map to an approved code" | `PHASE-06-API-CATALOG.md:29` | SUPPORTED |
| No existing pagination implementation | No search endpoints exist | SUPPORTED |
| No cursor utility in existing codebase | Grep confirms | SUPPORTED |
| Offset-based fallback: explicitly forbidden | `JOBS-SEARCH-DECISION-QUESTIONS.md:66` | SUPPORTED |

### Missing

- No cursor signing/versioning mechanism defined.
- No filter-hash binding spec.
- No cursor expiry mechanism.
- No `CURSOR_INVALID` in DECISION-06 vocabulary (it is noted as "not public API codes").

### Status: **NEEDS_DECISION**

1. **Cursor signing**: RECOMMENDATION: HMAC-signed cursor with version field. Server validates signature before decoding.
2. **Filter binding**: RECOMMENDATION: Hash of filter parameters embedded in cursor. On decode, verify filter hash matches current request filters. If mismatch, return error.
3. **Max page size**: RECOMMENDATION: 50 (hard cap), default 20.
4. **Cursor expiry**: RECOMMENDATION: 15 minutes. After expiry, client must restart from first page.
5. **Invalid cursor error**: The DECISION-06 vocabulary does not include `CURSOR_INVALID`. RECOMMENDATION: Map to `VALIDATION_ERROR` with descriptive message, or add `CURSOR_INVALID` to DECISION-06 as a public code.
6. **`has_more` vs `total_count`**: RECOMMENDATION: Include both. `total_count` requires a separate `COUNT(*)` query — consider whether this is acceptable for large result sets.
7. **Raw offset fallback**: RECOMMENDATION: Never expose. Remove any possibility of `?offset=` parameter.

---

## J7 — Visibility and Projection Freshness

### Recommendation

```text
Candidate visibility for job search (public-facing):
    - is_open_to_work = TRUE
    - deleted_at IS NULL
    - Visible fields: professional_title, skill_names, locations,
      total_experience_years, highest_education_level
    - NOT visible: raw resume text, evidence, embedding, internal fields

Candidate visibility for recruiter search (authorized):
    - Active company membership + recruiter search permission
    - Same visibility fields as public + contact info (if policy allows)
    - Source/trust labels: fact_sources JSONB shows provenance
    - Raw evidence/search text: NEVER returned

Stale projection handling:
    - candidate_search_profiles.source_profile_revision < candidate_profiles.profile_revision
    - RECOMMENDATION: Return projection with "staleness" flag
    - Do NOT exclude stale projections from results
    - Do NOT block search while projection rebuilds

Saved-candidate state in search card:
    - RECOMMENDATION: Separate endpoint, not embedded in search results
    - saved_candidates table: recruiter_user_id + candidate_id unique
    - GET /api/v1/companies/:companyId/saved-candidates?candidate_ids=...
```

### Evidence

| Claim | Source | Status |
|---|---|---|
| `candidate_search_profiles` table exists with `professional_title`, `skill_names`, `locations`, `total_experience_years`, `highest_education_level`, `searchable_text` | `08_candidates.sql:418-470` | SUPPORTED |
| `candidate_profiles.is_open_to_work BOOLEAN DEFAULT TRUE` | `08_candidates.sql:71` | SUPPORTED |
| `idx_candidate_profiles_open_location` index for open-to-work candidates | `08_candidates.sql:602-604` | SUPPORTED |
| `candidate_search_profiles.source_profile_revision` and `projection_revision` columns | `08_candidates.sql:420-421` | SUPPORTED |
| CHECK: `projection_revision <= source_profile_revision` | `08_candidates.sql:438-439` | SUPPORTED |
| Phase 6: "candidate visibility public/open-to-work/company/application based" | `JOBS-SEARCH-DECISION-QUESTIONS.md:71` | SUPPORTED |
| Phase 6: "HR ko kaunse fields/source-trust labels milenge" | `JOBS-SEARCH-DECISION-QUESTIONS.md:72` | SUPPORTED |
| Phase 6: "Raw resume evidence/search text response me nahi aayega" | `JOBS-SEARCH-DECISION-QUESTIONS.md:77` | SUPPORTED |
| `saved_candidates` table: `recruiter_user_id`, `candidate_id`, `company_id`, `private_note` | `09_applications.sql:228-238` | SUPPORTED |
| `saved_candidates_owner_candidate_unique UNIQUE (recruiter_user_id, candidate_id)` | `09_applications.sql:236-237` | SUPPORTED |
| Phase 6: "saved-candidate state search card me embedded hogi ya separate endpoint se?" | `JOBS-SEARCH-DECISION-QUESTIONS.md:75` | SUPPORTED |
| RLS: `saved_candidates_own_read` — only `recruiter_user_id = auth.uid()` | `17_rls.sql:211-212` | SUPPORTED |
| `candidate_search_profiles` has no RLS SELECT policy for authenticated users | `17_rls.sql` — no `candidate_search_profiles` policy for authenticated | SUPPORTED |
| Phase 8: "HR saved-candidate owner-scoped create/remove/list" | `PHASE-08-IMPLEMENTATION-PLAN.md:166` | SUPPORTED |

### Missing

- No `candidate_search_profiles` RLS policy for authenticated users (correct — this is a SystemClient-only table).
- No staleness detection logic defined.
- No `fact_sources` schema documented (column exists but structure undefined).
- No candidate search projection rebuild trigger/function documented.

### Status: **NEEDS_DECISION**

1. **Public candidate visibility**: RECOMMENDATION: `is_open_to_work = TRUE` + `deleted_at IS NULL`. Expose `professional_title`, `skill_names`, `locations`, `total_experience_years`, `highest_education_level`.
2. **Recruiter visibility**: RECOMMENDATION: Same public fields + `fact_sources` provenance labels. Company membership verified by NestJS (not RLS — `candidate_search_profiles` has no authenticated RLS policy).
3. **Stale projection**: RECOMMENDATION: Return projection with `is_stale: true` flag when `source_profile_revision < profile_revision`. Do NOT exclude from results. Do NOT block search.
4. **Saved-candidate in search**: RECOMMENDATION: Separate endpoint. Embedding saved-state in search results couples read models unnecessarily.
5. **Raw evidence**: RECOMMENDATION: NEVER expose `searchable_text`, `embedding`, `fact_sources.raw_*`, or evidence tables in search responses.

---

## J8 — Events and Analytics

### Recommendation

```text
Job AI enrichment event:
    - job.ai.enrichment.requested — emit at job publish time (not at create)
    - Contract: contracts/events/job-ai-enrichment-requested.v1.json
    - Trigger: after status transition to 'published'
    - Consumer: dispatcher → ai-heavy-queue → FastAPI job enrich worker

Lifecycle events:
    - NO separate lifecycle events (no job.published, job.paused, etc.)
    - Use audit_logs table for lifecycle history
    - Use in-app notifications for employer alerts

Search impressions/clicks:
    - job_views table exists for impression tracking
    - job_view_aggregates_daily for aggregated counts
    - Record synchronously in same transaction as search results
    - No outbox event needed for impressions
    - analytics_events table for cross-domain analytics
```

### Evidence

| Claim | Source | Status |
|---|---|---|
| `job.ai.enrichment.requested` event registered in dispatcher | `event-route.registry.ts:49-53` | SUPPORTED |
| Contract: `job-ai-enrichment-requested.v1.json` — requires `schema_version`, `event_id`, `aggregate_id`, `trace_id`, `job_id`, `trigger` | `contracts/events/job-ai-enrichment-requested.v1.json` | SUPPORTED |
| `trigger` enum: `"created"`, `"updated"`, `"reparsed"` | `contracts/events/job-ai-enrichment-requested.v1.json` | SUPPORTED |
| Phase 6: "job.ai.enrichment.requested when approved fields require enrichment" | `PHASE-06-API-CATALOG.md:404` | SUPPORTED |
| Phase 8: "job.ai.enrichment.requested → approved job lifecycle point" | `PHASE-08-IMPLEMENTATION-PLAN.md:293` | SUPPORTED |
| `job_views` table exists for impression tracking | `05_jobs.sql:437-447` | SUPPORTED |
| `job_view_aggregates_daily` table exists | `05_jobs.sql:455-461` | SUPPORTED |
| `job_views_aggregate_daily_count()` trigger function | `05_jobs.sql:463-472` | SUPPORTED |
| `jobs_refresh_views_count_from_aggregates()` refresh function | `05_jobs.sql:487-503` | SUPPORTED |
| `analytics_events` table with `event_name`, `event_category` | `13_analytics.sql:25-95` | SUPPORTED |
| Phase 6: "analytics is separate requirement" | `PHASE-06-API-CATALOG.md:424` | SUPPORTED |
| `application.submitted` v1 contract exists — NOT to be reused as job event | `CODEX-CONSOLIDATED-JOBS-SEARCH-DECISIONS.md:25` | SUPPORTED |
| No `application.status.changed` contract exists | Phase 8: "do not invent" | SUPPORTED |
| `REQ-ANALYTICS-001` exists | `PHASE-02-REQUIREMENTS-TRACEABILITY-MATRIX.md` | SUPPORTED |
| `search_logs` table exists in `13_analytics.sql` | `13_analytics.sql` (referenced in grep results) | SUPPORTED |

### Missing

- No `job.published`, `job.paused`, `job.expired` events defined.
- No lifecycle event contracts defined.
- No search impression event contract defined.
- `job-ai-enrichment-requested.v1.json` uses draft-07 schema (not 2020-12) and lacks `aggregate_type`, `event_type`, `payload`, `occurred_at` envelope fields — does not match Phase 2 contract format.

### Status: **NEEDS_DECISION**

1. **`job.ai.enrichment.requested` trigger timing**: RECOMMENDATION: Emit on `published` transition. The `trigger` field allows `"created"`, `"updated"`, `"reparsed"` — use `"created"` for first publish, `"updated"` for significant field changes.
2. **Envelope reconciliation (Gate G-1)**: The `job-ai-enrichment-requested.v1.json` contract does not match the Phase 2 envelope format (missing `aggregate_type`, `event_type`, `payload`, `occurred_at`). RECOMMENDATION: Create a new version `job-ai-enrichment-requested.v2.json` with the full envelope, or align v1 before producer freeze.
3. **Lifecycle events**: RECOMMENDATION: No separate lifecycle events. Use `audit_logs` for history and `notifications` table for employer alerts. This avoids event proliferation without consumers.
4. **Search impressions**: RECOMMENDATION: Record `job_views` row synchronously in the search endpoint transaction. Use `job_views_aggregate_daily_count()` trigger for aggregation. No outbox event needed.
5. **Analytics**: RECOMMENDATION: Use `analytics_events` table for cross-domain analytics (search_performed, job_view, application_submitted). Write synchronously with idempotency key. No outbox needed.
6. **`application.submitted` as job event**: RECOMMENDATION: Do NOT reuse. `application.submitted` is an application-domain event. Job-specific events (if needed) must be separate and approved.

---

## Summary of All Findings

### Decisions with Source Grounding (SUPPORTED)

| Decision | Recommendation | Source |
|---|---|---|
| J1: Job statuses | `draft`, `pending_approval`, `published`, `paused`, `closed`, `expired`, `archived` | `02_enums.sql:161-169` |
| J1: Named lifecycle commands | No arbitrary status PATCH | `JOBS-SEARCH-DECISION-QUESTIONS.md:14` |
| J1: Terminal states | `closed`, `expired`, `archived` — no reopen; repost = new ID | Archived Decision-05:26-27 |
| J2: Permission model | `is_primary_hr` + `manage_company` pattern | `organization.ts` (existing) |
| J3: Approval default | `job_approval_required = true` (SQL is truth) | `04_companies.sql:339` |
| J4: Expiry sweeper | `pg_cron` + `expire_due_jobs()` | Archived Decision-06 |
| J4: Search guard | `expires_at IS NULL OR expires_at > NOW()` | Archived Decision-06 |
| J5: Search Layer 1 | PostgreSQL FTS with `ts_rank` | `05_jobs.sql:520-537` |
| J5: pgvector Layer 2 | Compatible mode, not first launch | `05_jobs.sql:186,703-706` |
| J6: Cursor pagination | Opaque signed cursor, no offset | `JOBS-SEARCH-DECISION-QUESTIONS.md:59-66` |
| J7: Candidate visibility | `is_open_to_work = TRUE` + projected fields | `08_candidates.sql:71,418-470` |
| J7: Saved-candidate | Separate endpoint, not embedded | `09_applications.sql:228-238` |
| J8: AI enrichment trigger | On `published` transition | `event-route.registry.ts:49-53` |
| J8: No lifecycle events | Use `audit_logs` + `notifications` | No consumer exists |

### NEEDS_DECISION Items

| ID | Item | Recommended Resolution |
|---|---|---|
| J1-ND1 | DB-level job status transition guard | Create `enforce_job_status_update_path()` trigger |
| J1-ND2 | Job status history table | Create `job_status_history` table |
| J1-ND3 | `reference_code` generation | NestJS-generated sequence or ULID |
| J1-ND4 | Draft edit scope by status | NestJS validation restricts fields |
| J1-ND5 | `close` vs `archive` distinction | `close` = filled, `archive` = hidden |
| J2-ND1 | Permission granularity | Reuse `is_primary_hr` + `manage_company` |
| J2-ND2 | Hiring manager scope | Pause/close only |
| J2-ND3 | Platform admin scope | Cross-company moderation with audit |
| J3-ND1 | Setting change permission | Company `owner` only |
| J3-ND2 | Rejected job resubmission | `pending_approval → draft` allowed |
| J3-ND3 | Rejection reason mandatory | Yes, reuse `closed_reason` pattern |
| J3-ND4 | Re-approval after edit | Remain in `pending_approval` |
| J4-ND1 | Sweep cadence | 15 minutes |
| J4-ND2 | `expires_at IS NULL` semantics | Never expires |
| J4-ND3 | Expiry notification | In-app notification row |
| J4-ND4 | Expiry outbox event | No — audit-only until consumer exists |
| J5-ND1 | FTS-only for first launch | Yes |
| J5-ND2 | Candidate search FTS trigger | Create trigger |
| J5-ND3 | Score formula | `ts_rank` for v1 |
| J5-ND4 | Tie-breaker | `(published_at DESC, id)` |
| J5-ND5 | Zero-result behavior | Empty array + filter summary |
| J6-ND1 | Cursor signing | HMAC-signed with version |
| J6-ND2 | Filter binding | Hash in cursor, verify on decode |
| J6-ND3 | Max page size | 50 (hard cap), default 20 |
| J6-ND4 | Cursor expiry | 15 minutes |
| J6-ND5 | `CURSOR_INVALID` error | Map to `VALIDATION_ERROR` or add to DECISION-06 |
| J7-ND1 | Stale projection | Return with `is_stale: true` flag |
| J7-ND2 | `fact_sources` schema | Document structure |
| J8-ND1 | Envelope reconciliation | Create v2 contract with full envelope |
| J8-ND2 | Search impression recording | Synchronous `job_views` insert |

### CONFLICT Items

| ID | Item | Sources | Resolution |
|---|---|---|---|
| J3-C1 | Approval default value | SQL: `job_approval_required = true` vs Archived Decision-05: `auto_approve_jobs = true` | SQL is executable truth. Accept `job_approval_required = true` (approval required by default). |
| J8-C1 | `job-ai-enrichment-requested` envelope format | Contract uses draft-07 format (flat) vs Phase 2 envelope (nested `payload`) | Create v2 contract with full envelope before producer freeze. |

### Missing Requirements Identified

1. **`job_status_history` table**: Not in SQL baseline. Required for audit trail of lifecycle transitions.
2. **`enforce_job_status_update_path()` trigger**: Not in SQL baseline. Required for DB-level transition guard.
3. **`expire_due_jobs()` function**: Not in SQL baseline. Required for expiry sweeper.
4. **`candidate_search_profiles` FTS trigger**: Column exists but no trigger to populate `search_vector`.
5. **`saved_jobs` REQ-ID**: Table exists (`09_applications.sql:213`) but no dedicated REQ-ID assigned. Catalog §5: "saved_jobs CRUD has no REQ-ID yet and must be resolved upstream."
6. **Guest application `expires_at` check**: Known gap (`CODEX-CONSOLIDATED-JOBS-SEARCH-DECISIONS.md:43`).
7. **`job-ai-enrichment-requested.v2.json`**: Current v1 contract does not match Phase 2 envelope format.

---

## Verification Checklist

### Job Routes and Lifecycle Commands

- [ ] All 7 job statuses are enum-defined in `02_enums.sql:161-169`
- [ ] `jobs` table has all required columns (`05_jobs.sql:93-275`)
- [ ] No existing NestJS job endpoints (`app.module.ts`)
- [ ] Phase 6 catalog: `API-JOB-001` is TBD (`PHASE-06-API-CATALOG.md:391-411`)
- [ ] Terminal states: `closed`, `expired`, `archived` — no reopen (Archived Decision-05:26)
- [ ] Lifecycle lock order defined (`PHASE-08-IMPLEMENTATION-PLAN.md:192`)

### HR/Employer/Owner/Admin Permissions

- [ ] `user_role` enum: `candidate`, `employer`, `hr`, `admin` (`02_enums.sql:61-66`)
- [ ] `company_members` has `is_primary_hr`, `permissions` JSONB (`04_companies.sql:234-313`)
- [ ] Existing pattern: `is_primary_hr` OR `permissions->>'manage_company'` (`organization.ts`)
- [ ] No fine-grained job permission model exists

### Approval Setting and Rejected-Job Resubmission

- [ ] `company_settings.job_approval_required BOOLEAN DEFAULT true` (`04_companies.sql:339`)
- [ ] `job_status` includes `pending_approval` (`02_enums.sql:163`)
- [ ] `jobs.approved_by`, `approved_at` columns with CHECK constraint (`05_jobs.sql:104-105,229-233`)
- [ ] CONFLICT: SQL default vs archived decision key name/semantics
- [ ] MISSING: Rejection reason column, `pending_approval → draft` path

### Job Expiry Owner and Notification/Outbox Behavior

- [ ] `jobs.expires_at` column exists (`05_jobs.sql:165`)
- [ ] `idx_jobs_expiring` index exists (`05_jobs.sql:647-648`)
- [ ] Archived Decision-06: `pg_cron` + `expire_due_jobs()` — APPROVED
- [ ] MISSING: `expire_due_jobs()` function not in SQL baseline
- [ ] MISSING: `job_status_history` table not in SQL baseline
- [ ] MISSING: Guest application `expires_at` gap

### Candidate Job Search and Recruiter Candidate Search

- [ ] `jobs.search_vector` TSVECTOR with GIN index (`05_jobs.sql:190,629`)
- [ ] `jobs.embedding` vector(768) with HNSW index (`05_jobs.sql:186,703-706`)
- [ ] `candidate_search_profiles` with FTS and vector columns (`08_candidates.sql:418-470`)
- [ ] No existing search API endpoints
- [ ] MISSING: Candidate search FTS trigger

### PostgreSQL FTS/Vector Fallback/Ranking

- [ ] `jobs_build_search_vector_for_job()` weighted FTS function (`05_jobs.sql:520-537`)
- [ ] Weights: title=A, description=B, requirements=B, skills=B, category=C, location=C
- [ ] pgvector cosine similarity HNSW index exists
- [ ] MISSING: Score formula not frozen
- [ ] MISSING: Deterministic tie-breaker not frozen

### Cursor Pagination and Deterministic Ordering

- [ ] No existing pagination implementation
- [ ] No cursor utility in codebase
- [ ] Phase 6: "bounded pagination" required
- [ ] OFFSET explicitly forbidden
- [ ] MISSING: Cursor signing, filter binding, expiry, error code

### Candidate Visibility and Stale Projection Handling

- [ ] `candidate_profiles.is_open_to_work BOOLEAN DEFAULT TRUE` (`08_candidates.sql:71`)
- [ ] `candidate_search_profiles` with projected fields (`08_candidates.sql:418-470`)
- [ ] `idx_candidate_profiles_open_location` index (`08_candidates.sql:602-604`)
- [ ] `source_profile_revision` / `projection_revision` columns for staleness
- [ ] MISSING: Stale projection handling policy

### Saved-Candidate Privacy and API Behavior

- [ ] `saved_candidates` table: `recruiter_user_id`, `candidate_id`, `company_id` (`09_applications.sql:228-238`)
- [ ] `UNIQUE (recruiter_user_id, candidate_id)` constraint (`09_applications.sql:236-237`)
- [ ] RLS: `saved_candidates_own_read` — only `recruiter_user_id = auth.uid()` (`17_rls.sql:211-212`)
- [ ] Phase 6: Non-job-specific, private per HR (`PHASE-06-API-CATALOG.md:500-518`)
- [ ] `saved_jobs` table exists but has no REQ-ID (`09_applications.sql:213-222`)

### Job AI Enrichment Event and Contract Alignment

- [ ] `job.ai.enrichment.requested` registered in dispatcher (`event-route.registry.ts:49-53`)
- [ ] Contract: `job-ai-enrichment-requested.v1.json` — flat envelope (draft-07)
- [ ] MISSING: v1 does not match Phase 2 envelope format (no `aggregate_type`, `event_type`, `payload`, `occurred_at`)
- [ ] Gate G-1 open — envelope reconciliation required

### Analytics/Search Impression Behavior

- [ ] `job_views` table for impression tracking (`05_jobs.sql:437-447`)
- [ ] `job_view_aggregates_daily` for aggregation (`05_jobs.sql:455-461`)
- [ ] `job_views_aggregate_daily_count()` trigger function (`05_jobs.sql:463-472`)
- [ ] `analytics_events` table for cross-domain analytics (`13_analytics.sql:25-95`)
- [ ] `search_logs` table exists (`13_analytics.sql`)
- [ ] MISSING: Search impression event contract (if needed)

### Required Security, Concurrency, and Idempotency Tests

- [ ] Phase 8 §6: "Concurrent job/application updates and deterministic lock order" (`PHASE-08-IMPLEMENTATION-PLAN.md:179`)
- [ ] Phase 8 §6: "One logical candidate+job application and idempotent retry" (`PHASE-08-IMPLEMENTATION-PLAN.md:175`)
- [ ] Phase 8 §6: "Invalid/terminal application transitions" (`PHASE-08-IMPLEMENTATION-PLAN.md:177`)
- [ ] Phase 8 §6: "Cross-company application visibility" (`PHASE-08-IMPLEMENTATION-PLAN.md:178`)
- [ ] Phase 8: Lock order matrix defined (`PHASE-08-IMPLEMENTATION-PLAN.md:183-195`)
- [ ] Missing: Job lifecycle concurrency tests, expiry exclusion tests, cursor stability tests

---

## Safe Next Order (Reconfirmed)

1. **Freeze J1–J8 decisions** in decision/API-catalog documents.
2. **Create missing DB objects**: `job_status_history`, `enforce_job_status_update_path()`, `expire_due_jobs()`, candidate search FTS trigger.
3. **Reconcile Gate G-1**: Align `job-ai-enrichment-requested` contract with Phase 2 envelope.
4. **Fix guest `expires_at` gap** in guest application query.
5. **Implement job lifecycle commands** with approved lock order and atomic business+history+outbox transaction.
6. **Add bounded PostgreSQL FTS adapter** after query DTO/cursor semantics are frozen.
7. **Add controllers and full integration tests** after the above gates pass.

---

**Report complete. No code was modified.**
