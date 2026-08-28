# Jobs/Search — SQL and Contract Sync Scope

This is an implementation scope, not an executable migration. It prevents accidental schema design
while the reviewed SQL/contract changes are prepared.

## Required before job lifecycle code

1. Decide whether lifecycle history uses a new `job_status_history` table or existing `audit_logs`.
2. Define the approved transition function/guard and its NestJS authorization/session marker.
3. Implement `expire_due_jobs()` for the approved daily expiry policy, including atomic notification
   writes and permissions.
4. Add/verify the correct expiry index predicate for both published and paused jobs.
5. Reconcile the `job-ai-enrichment-requested` trigger event with Gate G-1 full-envelope contract.
6. Verify candidate/job FTS population functions and query plans before adding adapters.

## Prohibited until review

- No direct `UPDATE jobs.status` path from controllers.
- No invented lifecycle or analytics event.
- No unreviewed `job_status_history` schema.
- No cron schedule or function added only from an agent suggestion.
- No guessed cursor/ranking fields added to shared contracts.

## Validation gates

- SQL executes cleanly after baseline reset in pre-production.
- Invalid transitions, concurrent updates, expiry idempotency and notification uniqueness pass.
- Contract JSON Schema validation passes for every emitted job AI event.
- Existing 01–18 behavior remains intact; candidate/resume/guest tests remain green.
