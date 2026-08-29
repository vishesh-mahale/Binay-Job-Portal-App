# Jobs/Search implementation start checklist

Status: `READY FOR CONTRACT WORK — NOT READY FOR PUBLIC SEARCH CODE`

This checklist records what is already frozen and what must be resolved before adding runtime
controllers. It deliberately does not invent routes, DTO fields, events, or database objects.

## Already frozen

- Company-scoped job lifecycle routes and named commands: `DECISION-07-JOBS-SEARCH-FINAL.md` J1.
- Membership/permission, approval, terminal-state and expiry behavior: J2–J4.
- PostgreSQL FTS as first search layer; vector only when model/version matches: J5.
- Opaque signed cursor requirements: J6.
- Public/recruiter visibility and stale projection boundaries: J7.
- No unapproved lifecycle/search analytics events; job AI event remains Gate G-1 dependent: J8.

## Contract work required before runtime coding

1. Record exact public job-search and recruiter candidate-search paths; Decision-07 intentionally
   does not define them.
2. Freeze request/response DTO schemas, cursor claims, filter hash, limits and error mapping.
3. Reconcile `job.ai.enrichment.requested` with the shared envelope and JSON Schema (Gate G-1).
4. Verify the existing SQL expiry function/schedule, FTS functions/indexes and query plans against
   the current baseline; do not add speculative tables or events.
5. Freeze the saved-jobs API decision separately from recruiter saved-candidates behavior.

## Repository evidence checked (2026-08-28)

- `05_jobs.sql` already provides the `jobs.search_vector` GIN index, published-listing partial
  indexes, expiry index for published/paused jobs, and the job search-vector refresh functions.
- `15_infrastructure.sql` already provides `public.expire_due_jobs()` and the daily
  `daily_job_expiry_sweep` schedule; expiry is not a missing implementation object anymore.
- `contracts/events/job-ai-enrichment-requested.v1.json` exists, but its current schema is a flat
  task-style envelope. Producer emission must still pass Gate G-1 envelope alignment before API
  code emits it.
- `candidate_search_profiles` has FTS/vector columns and indexes. The FastAPI projection repository
  explicitly writes `search_vector = to_tsvector('english', searchable_text)` during its guarded
  UPSERT, so a database trigger is not required for that worker-owned path. The API must still
  verify projection freshness before returning recruiter results.
- No authoritative exact public-search or recruiter-search route was found in Decision-07; those
  paths remain intentionally unresolved.

## Coding gate

Job lifecycle controllers may start only after the company routes and DTO contract are reflected in
the API catalog. Search controllers may start only after both search paths and cursor contract are
recorded. Until then, `TBD` is intentional and is not an implementation license.
