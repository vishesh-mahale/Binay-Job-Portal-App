# Antigravity Independent Cross-Audit

## Scope

Date: 2026-08-27  
Auditor: Antigravity (independent review)  
Scope: Recent Jobs/Search and expiry changes only.

Reviewed against:

- `AGENTS.md`
- `01-requirements/` current requirements and product decisions
- `02-database/migrations/baseline/02_enums.sql`
- `02-database/migrations/baseline/04_companies.sql`
- `02-database/migrations/baseline/05_jobs.sql`
- `02-database/migrations/baseline/12_notifications.sql`
- `02-database/migrations/baseline/13_analytics.sql`
- `02-database/migrations/baseline/15_infrastructure.sql`
- `02-database/migrations/baseline/17_rls.sql`
- `04-nestjs-api/PHASE-05-FINAL-REQUIREMENTS.md`
- `04-nestjs-api/PHASE-06-API-CATALOG.md`
- `04-nestjs-api/PHASE-08-IMPLEMENTATION-PLAN.md`
- `04-nestjs-api/04-nestjs-api-app/jobs-search-review/DECISION-07-JOBS-SEARCH-FINAL.md`
- expiry design, notification decision and previous review documents
- current guest application implementation in `04-nestjs-api/04-nestjs-api-app/src/guest.ts`

No code or SQL was changed during this audit.

## Executive verdict

```text
Decision-07 direction                         ACCEPTED AS PRODUCT DIRECTION
Guest expired-job guard                       VERIFIED
Expiry function core transition logic         FUNCTIONALLY PLAUSIBLE
Expiry SQL as fully approved/frozen            NOT PROVEN
Expiry scheduler/deployment                   NOT CONFIGURED BY REPOSITORY SQL
Documentation synchronization                  INCOMPLETE
Production-readiness                          NO-GO until findings below close
```

The recent work is not a complete failure. The due-job predicate, row locking, status guard,
notification idempotency primitive and guest apply expiry guard are sensible. However, previous
“complete/final” claims are too strong because the repository still contains unresolved expiry
decisions and no executable schedule setup.

## Findings

### F-01 — HIGH: expiry decision documents contradict the implemented function

`15_infrastructure.sql` now creates `public.expire_due_jobs()` and hard-codes creator-only,
active-company notification behavior. But these documents still describe the same policy as
pending/draft:

- `jobs-search-review/EXPIRY-SQL-DESIGN-DRAFT.md` says recipient approval is pending and says no
  executable function is included.
- `jobs-search-review/EXPIRY-NOTIFICATION-DECISION.md` says recipient, event fields, inactive-user
  behavior and one-row semantics still need a decision.
- `jobs-search-review/EXPIRY-SQL-FINAL-DECISION-FORM.md` retains blank approval fields.

Therefore the SQL implementation and the decision record do not have one consistent authority.
The user’s creator-only approval appears in conversation history, but the repository must record
that approval explicitly before the SQL can be called frozen. At minimum, update/supersede these
draft documents with the final decision and the exact policy.

### F-02 — HIGH: pg_cron schedule and execution role are not implemented/verified

`DECISION-07-JOBS-SEARCH-FINAL.md` states that Supabase pg_cron runs daily at `12:05 AM
Asia/Kolkata`, but `15_infrastructure.sql` only creates the function. There is no
`cron.schedule(...)` statement in the reviewed baseline and no repository evidence that the
function is scheduled in the target Supabase project.

`17_rls.sql` grants execute on `expire_due_jobs()` to `service_role` and revokes anon/authenticated.
That is not, by itself, proof that the pg_cron job executes under `service_role`; a database cron
job has its own database job owner/execution context. The function may work for a privileged owner,
but this must be explicitly configured and tested.

Required before enablement:

1. document the exact schedule and timezone syntax;
2. document the actual cron job owner/role;
3. grant only the required function to that role or schedule it through an approved fixed owner;
4. test an unauthorized `anon`/`authenticated` call and a real cron execution;
5. document monitoring and failure recovery.

This is an operational/deployment gap, not evidence that the function SQL syntax is invalid.

### F-03 — HIGH: audit/history representation is still not frozen

The function inserts a generic `audit_logs` row. The baseline contains `audit_logs` in
`13_analytics.sql`; no `job_status_history` table was found. This can be acceptable, but
`DECISION-07` still describes “job-history/audit representation” as implementation work and the
expiry design form leaves the choice blank.

The project must explicitly choose one of these policies:

- generic `audit_logs` is the canonical job lifecycle history, with the same shape used by all job
  lifecycle commands; or
- add a reviewed append-only job history table and write it consistently from every lifecycle
  command.

Until that choice is recorded, expiry establishes a history convention silently and may diverge
from future publish/pause/close/reject commands. The current audit insert itself uses valid
columns and satisfies `audit_log_actor_check` because `actor_service` is non-blank and `user_id`
is omitted.

### F-04 — MEDIUM: expiry index does not cover paused jobs

The function processes both `published` and `paused` jobs:

```sql
WHERE status IN ('published', 'paused')
  AND expires_at IS NOT NULL
  AND expires_at <= v_now
  AND deleted_at IS NULL
```

But `05_jobs.sql` defines `idx_jobs_expiring` only for `status = 'published'`. This does not make
the function incorrect, because PostgreSQL can still scan/use other indexes, but it can make the
daily sweep inefficient as paused rows grow. Add a reviewed partial index covering both states or
record an intentional performance decision and verify the `EXPLAIN` plan at expected volume.

Do not silently add another speculative index to production without checking existing indexes and
the expected data size.

### F-05 — MEDIUM: direct notification insertion is not synchronized with notification ownership

The notification schema header describes a runtime flow in which a notification worker/NestJS
resolves templates and preferences before inserting notification rows. The new expiry function
instead inserts directly into `notifications` with a hard-coded title/body, event type,
`channels`, and `delivery_status`.

`DECISION-07` explicitly chooses an atomic in-app row for expiry, so direct insertion can be a
valid deliberate exception. However, the exception must be documented: whether template lookup is
intentionally bypassed, whether in-app preferences can suppress this row, and whether
`job.expired` is an approved internal notification event rather than a shared dispatcher event.

This function must not be changed to call email, Cloud Tasks, or the Outbox Dispatcher. The issue
is ownership/documentation consistency, not a recommendation to add another service.

### F-06 — MEDIUM: notification conflict handling is idempotent but does not validate payload identity

The function uses:

```sql
ON CONFLICT (idempotency_key) DO NOTHING
```

This protects repeated/concurrent sweeps from duplicate rows. It also silently accepts an existing
row with the same key but different recipient/content. The current key is
`job-expired:<job_id>:<created_by>`, which is stable for the approved creator-only policy and does
not use a mutable timestamp.

The implementation should either document why a conflicting key can never represent a different
payload, or validate the existing row before treating the conflict as success. Add a test that a
pre-existing mismatched notification cannot be silently accepted. This is especially important if
the title/event/category policy changes in a future revision.

### F-07 — MEDIUM: Decision-07/API catalog synchronization is incomplete

The API catalog says its earlier Jobs/Search `TBD` route placeholders are superseded by Decision-07,
but the actual job/search entries still contain `Method/path: TBD`. The decision lists concrete
paths such as `/api/v1/companies/:companyId/jobs` and lifecycle command endpoints.

This is not a runtime bug, but it leaves two different levels of “final” documentation. Either:

- replace the Jobs/Search method/path fields with the Decision-07 paths; or
- clearly label the catalog entries as implementation placeholders that are overridden by the
  linked decision.

The same sync pass should update Phase-08’s “remaining SQL objects” statement to distinguish the
implemented function from the still-missing schedule/index/history work.

### F-08 — LOW: expiry timestamp representation is implicit

The function updates `jobs.status` and `updated_at`; it does not write an `expired_at` column. The
baseline has `expires_at`, `closed_at`, and `paused_at`, but no `expired_at`. This is a defensible
status-only model, and adding a new column is not required by the current evidence. Still, the
decision should explicitly say that `expires_at` is the due timestamp and `status = 'expired'` is
the completion marker; `closed_at` must not be reused for expiry.

### F-09 — LOW: function security path is better than unqualified SQL but should be hardened

The function uses `SECURITY DEFINER`, schema-qualified table names, and `SET search_path = public`.
This is materially better than unqualified object lookup, and `anon`/`authenticated` execution is
revoked. For the project’s security standard, use the same hardened convention as other sensitive
functions (minimal trusted search path, fixed owner, fully qualified objects) and document owner
hardening. This is a security-hardening recommendation, not a demonstrated exploit.

## Verified correct points

### Decision-07 direction

The following are internally consistent with the inspected requirements/schema, assuming the
product approval is recorded:

- named company-scoped job lifecycle commands rather than arbitrary status PATCH;
- cross-company denial and active-company membership checks;
- direct publish when `job_approval_required = false`, approval path when true;
- terminal `closed`, `expired`, and `archived` are not reopened;
- PostgreSQL FTS/relational search as first layer with vector use only when model/version matches;
- opaque cursor requirements and deterministic ordering;
- public search exclusion of deleted/due jobs;
- recruiter saved-candidate privacy and tenant scope;
- no invented job lifecycle/search event until a versioned contract exists;
- job-AI producer remains behind the G-1 contract gate.

These are decisions, not proof that the corresponding NestJS endpoints have been implemented.

### Guest expired-job guard

The current guest apply query in `src/guest.ts` checks:

```sql
status = 'published'
AND (expires_at IS NULL OR expires_at > NOW())
AND deleted_at IS NULL
```

This correctly prevents applying after the due time, even if the daily expiry sweep has not run.
The document upload/session flow may occur earlier, but the final application transaction performs
the authoritative eligibility check. This is the correct defense against the sweep’s daily timing.

The guest apply path also checks session active/unexpired/unrevoked, consumed state, job binding,
document ownership and clean security scan before creating the application.

## Test evidence status

This audit was repository/static cross-verification. No live Supabase cron execution was performed
in this audit, and no new test suite was run because the changes under review are baseline SQL and
decision/document synchronization.

Required tests before calling expiry complete:

1. due published job expires exactly once;
2. due paused job expires exactly once;
3. draft/pending/closed/expired/archived jobs remain unchanged;
4. null/future expiry and soft-deleted jobs remain unchanged;
5. two concurrent sweep calls produce one transition, one audit/history record and one notification;
6. repeated sweep is idempotent;
7. active owner/member, inactive/deleted creator and departed member cases follow the recorded
   recipient policy;
8. pre-existing mismatched idempotency-key row is detected or the impossibility is documented;
9. anon/authenticated cannot execute the function; the configured cron role can;
10. notification failure rolls back the status transition, and the next scheduled run retries it;
11. search and registered/guest apply paths exclude due jobs before the sweep;
12. `EXPLAIN` verifies expiry index behavior for both published and paused rows.

## Final recommendation

```text
Do not undo the core expiry transition or guest guard.
Do not claim full production readiness yet.
First synchronize the expiry decision documents, record creator-only/inactive behavior,
freeze audit-vs-history and notification ownership, configure/test pg_cron role/schedule,
and verify paused-job index behavior. Then run the required concurrency and rollback tests.
```

Final audit status:

```text
DECISION-07: ACCEPTED PRODUCT DIRECTION
EXPIRY FUNCTION: TESTABLE IMPLEMENTATION, NOT FULLY FROZEN
EXPIRY DEPLOYMENT: SCHEDULE/ROLE VERIFICATION REQUIRED
GUEST EXPIRY GUARD: PASS
OVERALL: CONDITIONAL PASS — ACTIONS REQUIRED BEFORE PRODUCTION CLAIM
```
