# Independent review task — Jobs/Search open decisions (J5–J8)

Act as an independent senior API/database architect. Do not trust previous agent conclusions.
Read the repository sources before recommending anything. Do not modify code or SQL.

## Authority order

1. `AGENTS.md`
2. `04-nestjs-api/04-nestjs-api-app/jobs-search-review/DECISION-07-JOBS-SEARCH-FINAL.md`
3. `04-nestjs-api/PHASE-06-API-CATALOG.md`
4. `02-database/migrations/baseline/05_jobs.sql`, `08_candidates.sql`, `09_applications.sql`,
   `15_infrastructure.sql`, `17_rls.sql`
5. `contracts/` and the existing `07-fastapi-ai-worker/` implementation

Frozen J1–J4 decisions must be treated as fixed. Review only the unresolved implementation details:

### J5 — Search behavior

- Recommend PostgreSQL FTS/vector rollout order based on actual columns, indexes, and worker output.
- Define deterministic score/tie-break and explainability fields without inventing schema.
- State behavior for model mismatch, no result, and stale projection.

### J6 — Pagination

- Recommend an opaque signed cursor shape and its filter/sort binding.
- Recommend default/max page size and cursor expiry, with rationale.
- Map tampered/expired cursor to existing error vocabulary; do not invent an error code silently.

### J7 — Visibility/freshness

- Recommend exact public job visibility predicates from the schema.
- Recommend recruiter candidate visibility boundary and allowed response fields.
- Define stale projection handling using existing revision columns.
- Confirm saved-candidate state remains recruiter-scoped and non-job-specific.

### J8 — Events/analytics

- Verify the existing `job-ai-enrichment-requested.v1.json` against Gate G-1.
- Recommend the exact lifecycle point for emitting it, or mark the missing dependency.
- Do not invent lifecycle/search-impression events; classify them as deferred if no contract exists.

## Required output

Write a report to:

`04-nestjs-api/04-nestjs-api-app/jobs-search-review/<agent-name>-OPEN-DECISIONS-REVIEW.md`

For every recommendation include:

- source path and exact section/line evidence
- current repository behavior
- recommendation or `NEEDS_HUMAN_DECISION`
- rejected alternatives and reason
- implementation/test impact

If evidence conflicts, report the conflict instead of guessing. Do not edit any other file.
