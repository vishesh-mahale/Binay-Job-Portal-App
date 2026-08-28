# Final adversarial review: updated `expire_due_jobs()`

## Verdict

The revision fixes the prior unbounded-sweep and transaction-clock concerns: `LIMIT 100`, a captured `clock_timestamp()`, stable ordering, `FOR UPDATE SKIP LOCKED`, and a second status/expiry predicate are present. The `service_role` grant correctly excludes `anon` and `authenticated`. It still has a material recipient correctness bug and remains operationally incomplete: company owners may be excluded, membership state is only partially checked, the pg_cron schedule is absent, and direct notification insertion remains an unapproved architectural/contract boundary.

## SQL/concurrency assessment

- `ORDER BY j.id LIMIT 100 FOR UPDATE SKIP LOCKED` is valid PostgreSQL statement ordering and gives a bounded competing batch. Repeated calls are required to drain more than 100 rows; the migration/runbook must state this and expose backlog metrics.
- `v_now := clock_timestamp()` gives one wall-clock cutoff per invocation; using `NOW()` only for `updated_at` is acceptable, but if exact expiry transition time is audited, no `expired_at` column exists and the audit metadata currently omits transition time/run ID.
- Row locks plus the second predicate prevent a concurrent lifecycle command from being overwritten after selection. The function still holds each row lock while inserting audit and notification rows; test lock duration/timeout under notification contention.
- `ON CONFLICT (idempotency_key) DO NOTHING` makes retries non-duplicating for the stable `job_id + creator_id` key, assuming terminal jobs cannot reopen. It does not validate a conflicting row’s payload. Add a transition/event invariant or explicit conflict validation if data corruption matters.
- A failure in any audit/notification insert aborts the entire function transaction, rolling back earlier expirations in that invocation. This is internally atomic but must be documented and tested; one malformed notification can starve the batch.

## Recipient bug and tenant semantics

The creator notification condition requires an active `company_members` row. `companies.owner_id` is separate from `company_members` (`04_companies.sql:80`; `company_members` table begins around line 234), and the baseline helper `is_company_member` treats company ownership as valid independently (`17_rls.sql:20-34`). If an owner-created job has no membership mirror row—a valid schema state—the approved creator-only notification is silently skipped. Either include `companies.owner_id = created_by` in the condition or freeze/document that every owner must also have a membership row and enforce that invariant.

The condition checks `cm.is_active` but not `cm.left_at IS NULL`; the repository’s company-membership semantics use both (`17_rls.sql:25-31`). Add the `left_at` predicate explicitly. Also decide whether creator authorization is evaluated at expiry time (current behavior) or snapshotted at publish time. The function does not check company active/deleted state; define whether notifications are skipped for inactive companies.

## Notification and trigger interactions

The values satisfy visible `notifications` checks (nonblank key/title, valid entity pair, JSON object channels/status), and no shown notification trigger rejects insertion. However, `event_type='job.expired'` has no demonstrated active template/consumer, and direct insertion bypasses the documented domain-outbox → notification-worker preference/template flow (`12_notifications.sql:10-14`). The SQL must not be considered contract-safe until event/template/preference ownership is explicitly approved. `company_id` is tenant metadata but does not itself enforce creator membership.

`action_url` is now `NULL`, which avoids the earlier route mismatch/privacy risk. `action_type='open_job'` remains a client contract value and should be approved or removed if no navigation is intended. Generic body text is appropriately non-sensitive.

## Security and schedule gaps

- `SECURITY DEFINER SET search_path = public` and fully qualified table references are a reasonable baseline, but function owner and `public` schema write privileges are not shown. Confirm the owner cannot be altered by ordinary roles, and consider `SET search_path = pg_catalog, public` with schema-qualified built-ins.
- `REVOKE ALL FROM PUBLIC` in migration 15 followed by `GRANT service_role` in migration 17 is correctly fail-closed for browser roles. It does not establish that pg_cron invokes as `service_role`; there is no `cron.schedule`, extension installation, timezone setting, or scheduler-owner grant anywhere in the database tree. Add a separate environment-reviewed schedule/runbook and grant only the actual invoker.
- Returning only an integer provides no run ID, skipped-creator count, conflict count, or error observability. Add operational logging/metrics outside the function or a documented wrapper.

## Required fixes before approval

1. Fix/decide owner membership and add `left_at IS NULL`; test creator owner, ordinary member, departed member, deleted user, and inactive company cases.
2. Approve direct notification insertion plus `job.expired` event/category/action semantics, or change to the approved outbox/worker path.
3. Add scheduler installation/ownership/timezone artifacts; verify pg_cron invocation role against the `service_role` grant.
4. Document batch-drain behavior, atomic rollback semantics, lock timeout policy, and observability.
5. Add migration tests for concurrent sweepers and publish/pause/resume/close races, duplicate retry, notification conflict, and no partial writes.

## Go/no-go

The function is not ready for production scheduling. Read/apply defensive expiry filtering remains safe. SQL approval should wait for the recipient-condition fix and the schedule/notification contract decisions above.
