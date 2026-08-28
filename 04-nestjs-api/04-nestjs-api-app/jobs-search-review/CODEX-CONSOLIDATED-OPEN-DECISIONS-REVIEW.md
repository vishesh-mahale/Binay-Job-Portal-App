# Jobs/Search J5–J8 — Consolidated review

Date: 2026-08-28  
Sources reviewed: Antigravity, FreeBuf and OpenCode reports, plus repository SQL/contracts.

## Verdict

The three reports agree on the broad architecture, but they do **not** agree on several values.
Therefore J5–J8 are not silently frozen by this consolidation. Safe implementation boundaries are
recorded below; conflicting product/contract values remain `NEEDS_HUMAN_DECISION`.

| Area | Common conclusion | Conflict / final handling |
|---|---|---|
| J5 search | PostgreSQL FTS first; vector only with compatible model/version; deterministic ordering | Exact score weighting and tie-break differ; keep as open decision |
| J6 cursor | Signed opaque cursor, canonical filter binding, bounded 20/50 page sizes | TTL differs (15 min, 30/10 min, 24 h); keep TTL open |
| J7 visibility | Published/non-deleted/non-expired jobs; no raw resume/evidence; recruiter membership enforced in NestJS | `is_open_to_work` and cross-company scope are not source-frozen; keep policy open |
| J8 events | No invented lifecycle/impression events; analytics remains separate | Existing job-AI contract needs G-1 envelope reconciliation before producer code |

## Evidence-based decisions that are safe now

1. Every public job query must include `status = 'published'`, `deleted_at IS NULL` and
   `(expires_at IS NULL OR expires_at > NOW())`. This is a query guard, not a claim that existing
   indexes alone enforce visibility.
2. Recruiter searches must use the trusted NestJS path and active company membership checks;
   `candidate_search_profiles` is not an authorization boundary and raw evidence is excluded.
3. FTS/vector search must never generate embeddings synchronously per request. Missing or
   incompatible vectors fall back to FTS.
4. Cursors must be opaque, signed/versioned and bound to a canonical filter/sort hash. Raw offset is
   not part of the public API.
5. `job.ai.enrichment.requested` cannot be emitted until the producer payload is validated against
   the aligned Gate G-1 contract. No new job-status or search-impression event is authorized.

## Decisions still requiring explicit freeze

### J5 — Ranking

- Choose exact FTS/vector weighting (or FTS-only for the first release).
- Choose deterministic tie-break (`published_at DESC, id DESC` is the safest candidate because it
  reflects listing recency; `created_at` was proposed by another report).
- Freeze the stale projection response field name and semantics; do not expose unapproved fields.

### J6 — Cursor

- Choose one TTL for public search and, if different, one for recruiter search. Agent proposals ranged
  from 15 minutes to 24 hours; no repository source selects one.
- Keep default 20 and maximum 50, already recorded in Decision-07.
- Map invalid/tampered/expired cursors to the existing validation error envelope; exact public code
  must match the approved error vocabulary.

### J7 — Visibility

- Explicitly approve whether `is_open_to_work = true` is required in the current recruiter search
  policy. It is an eligibility signal in Decision-07, not automatically the whole authorization rule.
- Approve whether authorized recruiters may search candidates across companies or only within an
  application/company scope.
- Approve confidential-job masking response fields and the freshness marker name/values.

### J8 — Contract

- Reconcile `contracts/events/job-ai-enrichment-requested.v1.json` with the full outbox envelope in
  `G1-ENVELOPE-ALIGNMENT.md` before implementing a producer.
- Freeze enrichment trigger as publish plus approved enrichable-field changes, or record another
  explicit rule. Do not emit on unrelated edits.

## Implementation gate

`JOBS/SEARCH ADAPTERS: PARTIAL GO` — private query adapters may be prepared with the safe guards
above, but public controllers and job-AI producers remain blocked until the unresolved values are
recorded in Decision-07/API catalog. No SQL migration or source-code change was made by this review.
