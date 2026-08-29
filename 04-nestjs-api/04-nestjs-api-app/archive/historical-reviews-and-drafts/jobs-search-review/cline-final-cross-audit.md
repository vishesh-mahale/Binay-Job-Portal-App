# Cline Independent Cross-Audit — Jobs/Search and Expiry

Date: 2026-08-27  
Scope: Current repository files only. Earlier agent reports were treated as non-authoritative evidence.

## Reviewed sources

- `AGENTS.md`, root/component README files
- `04-nestjs-api/04-nestjs-api-app/jobs-search-review/DECISION-07-JOBS-SEARCH-FINAL.md`
- `04-nestjs-api/04-nestjs-api-app/jobs-search-review/EXPIRY-SQL-FINAL-DECISION-FORM.md`
- `04-nestjs-api/04-nestjs-api-app/jobs-search-review/SQL-CONTRACT-SYNC-IMPLEMENTATION-SCOPE.md`
- `02-database/migrations/baseline/05_jobs.sql`, `12_notifications.sql`, `13_analytics.sql`, `15_infrastructure.sql`, `17_rls.sql`
- Current `src/guest.ts`, `src/resume.ts`, `src/errors.ts`
- `04-nestjs-api/PHASE-06-API-CATALOG.md` and `04-nestjs-api/PHASE-08-IMPLEMENTATION-PLAN.md`

No code or SQL was changed during this audit.

## Executive verdict

```text
Jobs/Search product decision       VALID and internally coherent
Guest expiry/apply guard           VERIFIED in current code
Expiry function                   PRESENT and structurally sound
RLS/function permissions           VERIFIED for browser denial
Documentation synchronization      NOT COMPLETE
Cron deployment                   NOT proven/configured by repository SQL
Overall                            CONDITIONAL PASS; not production-ready yet
```

## What is verified

### 1. Decision-07 direction

The frozen decision correctly describes company-scoped lifecycle commands, active-membership
authorization, direct-publish mapping through the real `company_settings.job_approval_required`
column, defensive expiry filtering, PostgreSQL FTS-first search, opaque cursor requirements,
candidate-search privacy, and fail-closed event boundaries.

The statement that `application.submitted` is atomic but currently unrouted is consistent with the
catalog/implementation-plan wording; it must not be silently routed or discarded.

### 2. Current expiry function

`15_infrastructure.sql` now contains `public.expire_due_jobs()` and the core implementation is
reasonable:

- only `published` and `paused` jobs with `expires_at <= clock_timestamp()` are selected;
- `deleted_at IS NULL` is enforced;
- deterministic ordering plus `FOR UPDATE SKIP LOCKED` prevents competing sweeps from blocking;
- the second guarded update prevents an already-transitioned row from being counted twice;
- transition is `published/paused -> expired`;
- immutable `audit_logs` receives the status transition;
- notification insertion has a stable unique idempotency key and `ON CONFLICT DO NOTHING`;
- creator notification requires active user, active company membership/ownership, and no soft delete.

The `idx_jobs_expiring` predicate in `05_jobs.sql` covers both `published` and `paused` jobs.

### 3. Permissions

`17_rls.sql` grants `expire_due_jobs()` only to `service_role` and revokes execution from
`PUBLIC`, `anon`, and `authenticated`. This is a correct browser-denial boundary. It does not by
itself prove that a scheduled job invokes the function using an allowed role.

### 4. Guest and resume checks

Current `guest.ts` rejects expired/non-published jobs during guest application and applies the
same expiry guard to the registered application path. Guest session reuse is blocked after
consumption. `resume.ts` uses ownership/document locks during confirmation and preserves the
approved security-scan/parsing gates. `errors.ts` preserves domain error codes instead of
collapsing them into a generic validation error.

## Findings requiring resolution

### F-01 — HIGH: expiry decision record is still marked pending

`EXPIRY-SQL-FINAL-DECISION-FORM.md` still says `PENDING HUMAN CONFIRMATION`, has blank approval
fields, and recommends `job_status_history` as an alternative. The current SQL already hard-codes
creator-only notification, skip inactive creator, `audit_logs`, and the stable key. This creates
two competing records of truth. Either complete/supersede the form with the approved values, or
explicitly mark it historical and point to Decision-07 plus the SQL implementation.

The older expiry draft/notification documents should receive the same historical/superseded label;
otherwise future agents can incorrectly reopen already-approved decisions.

### F-02 — HIGH for deployment: pg_cron schedule is not in the repository SQL

Decision-07 states a daily 12:05 AM Asia/Kolkata Supabase `pg_cron` schedule, but the current
baseline contains the function and grants, not a `cron.schedule(...)` artifact. I found no current
repository proof of the deployed schedule or its execution role. Function permission grants alone
do not prove the scheduler can execute it.

Before enabling this in an environment, record the exact schedule/timezone, owning/execution role,
required least-privilege grant, and a real run verification. If schedule provisioning is intentionally
Dashboard/operational-only, say so in the component runbook and test it there; do not claim the SQL
baseline installs it.

### F-03 — MEDIUM: daily sweep has a bounded batch

The function processes at most 100 jobs per invocation. This is safe for a bounded transaction,
but a backlog over 100 due jobs will remain until the next daily run. Search/apply guards prevent
expired jobs from being used, so this is not a correctness bypass, but it is an operational lag.
Document the expected backlog behavior and monitoring, or use an approved repeated invocation
strategy before production scale.

### F-04 — MEDIUM: direct notification write needs explicit ownership wording

The function directly inserts the approved in-app `notifications` row rather than emitting an
outbox event. This can be a valid deliberate exception for deterministic expiry, and it matches
Decision-07, but the ownership/rationale must be explicit in the final decision/runbook: no email,
Cloud Tasks, Dispatcher, or notification worker is involved in this current expiry path. The
notification idempotency key prevents duplicates, but `ON CONFLICT DO NOTHING` can hide a pre-existing
same-key row whose payload is inconsistent; this should be an intentional invariant/test.

### F-05 — LOW: API catalog still contains superseded TBD wording

Decision-07 freezes the Jobs/Search route set, while portions of `PHASE-06-API-CATALOG.md` still
describe job paths as `TBD`. Add a direct supersession note at that exact catalog section or update
the entries. The implementation plan already references Decision-07, so this is documentation
drift rather than an API-design blocker.

### F-06 — LOW: security-definer convention

`expire_due_jobs()` uses `SECURITY DEFINER SET search_path = public` and fully qualifies its table
references. This is materially safer than unqualified references. A later security-hardening pass
may adopt the repository's stricter minimal/empty search-path convention, but it is not a reason to
invent a new schema or change the current function during this audit.

## Required tests/gates before calling it final

- two concurrent expiry calls: each job transitions once;
- rerun after expiry: no duplicate notification or audit transition;
- published, paused, future, null-expiry, deleted and terminal jobs;
- inactive/deleted creator and inactive/deleted company behavior;
- unauthorized `anon`/`authenticated` function execution denied;
- real pg_cron invocation and failure/retry visibility in the target Supabase environment;
- backlog test proving the documented behavior when more than 100 jobs are due;
- search and registered/guest application expiry guards;
- catalog/decision documents have one unambiguous final status.

## Final recommendation

Do not redesign Jobs/Search. Keep Decision-07 as the product direction and keep the current
bounded SQL approach. First reconcile the pending expiry form/drafts and document or provision the
pg_cron schedule with its actual execution role. Then run the listed database/concurrency tests and
update the Phase-06 catalog wording. After those gates, the Jobs/Search work can be treated as
implementation-ready for the current pre-production environment.

**Verdict: CONDITIONAL PASS — architecture accepted; documentation and scheduler deployment gates remain open.**
