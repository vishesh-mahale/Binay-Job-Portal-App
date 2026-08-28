# Adversarial review: `expire_due_jobs()`

## Verdict

The function is syntactically plausible and its `audit_logs`/`notifications` column values satisfy the visible baseline checks, but it is not production-safe merely because it has `SECURITY DEFINER` and `SKIP LOCKED`. The SQL is currently an unbounded sweep with an unverified schedule, direct notification side effects, mutable-date idempotency, and a grant that is not tied to a documented cron execution role. Keep it blocked until the issues below are resolved and migration tests run against the complete baseline.

## Syntax and baseline compatibility

- `audit_logs` accepts `actor_service`, lower-case action `job.expired`, object JSON values, and the supplied metadata (`13_analytics.sql:173-220`), so the shown insert satisfies its actor/action/object constraints.
- `notifications` accepts the supplied required fields and relative action URL; `channels` and `delivery_status` are JSON objects and the entity pair is complete (`12_notifications.sql:143-216`). However, `event_type='job.expired'`, `action_type='open_job'`, the title/body, and direct insertion path are application policy, not frozen notification-template evidence.
- The explicit `updated_at = NOW()` is compatible with the jobs updated-at trigger. There is no baseline job status trigger to reject the transition, so the function itself is currently the only guard.
- `REVOKE ALL ...` followed by `GRANT ... TO service_role` is valid only after the function exists and the role is present in the target Supabase environment. It does not grant pg_cron’s execution role, nor does it prove that pg_cron is installed.

## Concurrency and idempotency flaws

1. `FOR UPDATE SKIP LOCKED` protects rows selected by each invocation, and the second `UPDATE` rechecks status/expiry, which is good. But there is no batch limit. A large backlog can hold many locks and run beyond cron/query timeouts; add a bounded batch contract or a loop with explicit limits/metrics.
2. `NOW()` is transaction-stable. A long-running transaction uses its start time for all due checks and timestamps. That is deterministic, but must be intentional; use a captured `v_now` or `clock_timestamp()` policy consistently and test late sweeps.
3. The update and notification insert are atomic: any notification constraint/error rolls back the job status and audit row. This avoids status-without-notification, but also means one bad row can abort the whole sweep. Decide whether that all-or-nothing behavior is desired and define per-row error handling.
4. `v_key = job + creator + expires_at` is not a stable transition identifier. If `expires_at` is edited before expiry, the key changes; include a durable expiry-transition/event ID or guarantee the date is immutable after publish. `notifications.idempotency_key` is globally unique (`12_notifications.sql:145,197-199`), so key collision/conflict behavior must be tested.
5. `ON CONFLICT DO NOTHING` suppresses a duplicate without checking that existing payload/user/company/entity matches. For a globally unique key this is usually safe only if the key is cryptographically/semantically bound to all immutable identity fields; otherwise it can mask corruption.

## Recipient, privacy, and routing risks

- The function checks only `users.status='active'` and `deleted_at IS NULL`; it does not verify that the creator remains an active member of `v_job.company_id`. If creator-only notification is approved, define membership/ownership-at-expiry semantics.
- Direct insertion bypasses the documented notification worker flow that resolves templates and preferences before creating a notification (`12_notifications.sql:10-14`). If this exception is intentional, freeze preference behavior and template/version handling; otherwise emit an approved event/outbox row and let the notification consumer insert it.
- `/jobs/<id>` may not match the frozen company-nested API route (`DECISION-07-JOBS-SEARCH-FINAL.md`); action URL must be approved and cannot expose confidential/internal job data. Body is currently generic, which is safe, but event/category/template policy remains unapproved.
- `company_id` is copied from the job without a database FK consistency check against the creator. The job FK guarantees company, but recipient tenant authorization is still an application policy.

## Security-definer and schedule gaps

- `SET search_path = public` is better than an unset path, but fully qualify `NOW`, `format`, types, and any future helper calls or use `pg_catalog, public`; lock down function owner and prevent owner-role hijacking of `public` objects.
- The function has no explicit `SET row_security` policy. As a security-definer trusted maintenance function this may be acceptable, but the migration must document owner privileges and ensure `anon`/`authenticated` cannot execute it. Baseline 17 labels job internals service-only (`17_rls.sql:248-250`).
- No `cron.schedule`/`cron.unschedule` statement or extension installation appears with the function. The comment says an approved Supabase pg_cron schedule, but a schedule is not actually installed by this change. Add a separate environment-reviewed schedule migration/runbook with timezone and ownership, or explicitly state that deployment tooling owns it.
- Granting only `service_role` is insufficient if pg_cron invokes the function as `postgres` or another scheduler role; granting broad access to make cron work would violate least privilege. Identify the actual invoker and grant only that role.

## Required corrections before approval

1. Add bounded batch/lock behavior, captured-clock semantics, and concurrent sweeper/manual lifecycle race tests.
2. Replace mutable `expires_at` idempotency with a stable transition/event key and validate conflict payloads.
3. Resolve creator membership/deletion behavior and direct notification versus outbox-worker ownership; freeze template/event/action URL.
4. Document function owner, fixed search path, invoker role, revokes/grants, and pg_cron installation/schedule separately.
5. Add a migration-level test proving all baseline constraints/triggers pass, including rollback on notification failure and no partial status/audit writes.

## Go/no-go

Do not schedule or expose `expire_due_jobs()` yet. Search/apply defensive expiry predicates remain valid independently. The function can be accepted only after SQL/security/schedule artifacts and the notification contract are reviewed together.
