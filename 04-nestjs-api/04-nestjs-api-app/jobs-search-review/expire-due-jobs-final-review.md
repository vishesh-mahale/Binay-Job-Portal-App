# Final review: revised `public.expire_due_jobs()`

Reviewer: Codex (independent revalidation)
Date: 2026-08-27

## Verdict

The revision fixes the principal correctness issues from the prior review: it captures one
`clock_timestamp()`, limits each invocation to 100 rows, rechecks the due predicate, uses a stable
job+recipient idempotency key, avoids an invalid action URL, and requires an active creator/company
membership before notifying. The SQL is syntactically plausible and the status predicate matches
approved Decision-06. It remains `REVIEW REQUIRED`, not a clean production sign-off, due to batch
completion semantics, unresolved history/timestamp representation, notification-policy authority,
cron-role setup, and security hardening.

## Confirmed improvements

- `ORDER BY j.id LIMIT 100 FOR UPDATE SKIP LOCKED` gives deterministic bounded batches and permits
  concurrent workers without waiting on already-locked jobs.
- A single `v_now := clock_timestamp()` avoids boundary drift between selection and update.
- The update rechecks status, expiry, and non-deletion, so rows changed by another transaction are
  not incorrectly expired.
- `job-expired:<job_id>:<created_by>` is stable across retries and includes the recipient, matching
  the globally unique `notifications.idempotency_key` constraint.
- `action_url = NULL` satisfies the notification entity/action constraints without inventing a URL.
- The creator notification additionally requires `users.status = 'active'`, `users.deleted_at IS
  NULL`, and an active same-company membership.
- `17_rls.sql` revokes anon/authenticated execution and grants service-role execution; `15_infrastructure.sql`
  revokes PUBLIC execution.

## Remaining blockers/corrections

### 1. LIMIT 100 requires an explicit drain strategy

One cron call expires at most 100 jobs and returns. If more than 100 rows are due, the remainder waits
until the next daily run. Candidate/apply visibility is protected by the independent
`expires_at > NOW()` guard, but employer status/notification freshness can lag by days under backlog.
Either document this bounded-batch SLA and add monitoring/repeated invocation, or make the approved
schedule call until no rows remain. Do not silently claim a daily sweep fully drains due jobs.

### 2. Existing expiry index omits paused jobs

`idx_jobs_expiring` in `05_jobs.sql` is partial for published jobs only. The function now scans both
published and paused rows. Add a reviewed index covering both statuses or document/measure the
bounded scan; this is a performance migration decision, not a functional fix to hide in the
function.

### 3. Audit-only is still not the same as job status history

The function inserts `audit_logs` but no `job_status_history` row. Decision-07 leaves history/audit
representation as implementation work. Approve generic audit as the canonical lifecycle history or
add a job-specific append-only table and have every lifecycle command use it. Include request/trace
metadata where available and standardize the service actor/action values.

### 4. Timestamp semantics remain implicit

The update changes `status` and `updated_at`, but the jobs table has no `expired_at`; it has
`closed_at`. Confirm that status plus `expires_at` is the complete expiry record. Do not reuse
`closed_at` or add `expired_at` without a documented migration/DTO decision.

### 5. Notification assumptions are not fully evidenced

The SQL comment calls creator-only “approved,” but the decision documents previously left recipient,
inactive-member handling, event/content fields, and preference behavior open. Active-membership
filtering is a defensible implementation choice, not proof of approval. Confirm creator-only and
skip behavior, and freeze `job.expired`, title/body, category/channels, and per-recipient semantics
in the decision/catalog. The direct `notifications` insert is atomic, but `ON CONFLICT DO NOTHING`
needs a test/policy for a pre-existing key with mismatched content.

### 6. SECURITY DEFINER and cron role need operational proof

`SECURITY DEFINER SET search_path = public` is better than an implicit path and relations are
schema-qualified, but harden the path/owner according to the repository’s least-privilege pattern.
The grant to `service_role` does not establish that Supabase pg_cron runs as that role. Document the
actual schedule owner/role, extension availability, timezone (12:05 AM Asia/Kolkata), and function
ownership; verify anon/authenticated cannot invoke it and untrusted roles cannot alter the function.

### 7. Observability and failure behavior

The integer return count is useful, but there is no durable run/trace identifier, backlog metric,
failure alert, or explicit handling of partial notification failures. A notification constraint
failure aborts the whole function transaction, which is acceptable for atomicity only if monitored
and tested. Add operational runbook/metrics or an approved function contract before enabling cron.

## Required verification tests

- SQL parse/migration ordering: function exists before the `17_rls.sql` grant; all referenced columns,
  JSON values, and constraints validate on a baseline database.
- Due published/paused rows expire; draft/pending/closed/expired/archived/deleted/non-due rows do not.
- Concurrent/repeated calls produce one status transition, one approved audit/history record, and one
  notification per approved recipient.
- A 101+ due-job fixture demonstrates and monitors the chosen LIMIT-100 drain behavior.
- Notification key conflicts cannot hide mismatched payloads; inactive/left/deleted creator behavior
  follows the approved policy.
- Search and registered/guest apply paths hide due jobs before the sweep.
- Function privilege, owner, hardened `search_path`, cron schedule/timezone, and failure alert tests.

## Final gate

`EXPIRE_DUE_JOBS(): CONDITIONALLY ACCEPTED FOR REVIEW/TEST — NOT YET PRODUCTION ENABLED`.

The revised implementation can proceed to migration-test review. Production pg_cron activation still
requires explicit closure of the batch SLA, history/timestamp choice, notification policy, index
coverage, cron role/security, and observability items above.

