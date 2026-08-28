# Adversarial review: EXPIRY-SQL-DESIGN-DRAFT

## Verdict

The draft is appropriately non-executable and lists several gates, but the intended transaction still embeds unapproved architecture and leaves important race/security semantics implicit. Creator-only notification, direct notification insertion, daily pg_cron at a named timezone, and “expiry-date” idempotency must not be treated as decisions. The draft can be advanced to migration design only after recipient/notification ownership is approved and the SQL contract below is made explicit.

## Hidden assumptions and flaws

### 1. Recipient and notification path are not approved

`jobs.created_by` is a valid required foreign key, but no requirement says the creator is the expiry audience. The creator can be inactive, deleted, or no longer a company member; “skip” is safe only if audit-only behavior is approved. A fallback or owner/admin fan-out would change privacy semantics. Resolve recipient at sweep time under a locked job/company row, and deduplicate by user if policy later expands beyond creator.

The “no Outbox Dispatcher, Cloud Tasks or email worker” assertion conflicts with the notification baseline’s documented flow: domain transaction/outbox, then a notification worker resolves templates/preferences and creates the notification (`12_notifications.sql:10-14`). Direct insertion is possible only as an explicit architecture exception with approved template, preference, retry, and permission rules. It must not bypass user notification preferences or create an unversioned template reference.

### 2. Idempotency key is underspecified and potentially unstable

“Include job, recipient and expiry date” is insufficient if `expires_at` is edited before expiry or if a job can be expired/reposted under the same ID (terminal jobs should not reopen, but the invariant still needs a database test). `notifications.idempotency_key` is globally unique (`12_notifications.sql:145, 197-199`), so the key must include a stable transition/event identity plus recipient, not sweep timestamp. If direct insertion is retained, define `INSERT ... ON CONFLICT` behavior and verify a conflict cannot hide a mismatched payload.

### 3. Lock/concurrency contract is absent

“Lock due published/paused jobs” does not specify `FOR UPDATE SKIP LOCKED`, batch bounds, stable UUID order, lock timeout, or a second predicate check. Two sweepers must safely compete; a concurrent publish/resume/close command must not be overwritten after the initial scan. The function should lock rows in deterministic order, re-check `status IN ('published','paused') AND expires_at <= clock_timestamp() AND deleted_at IS NULL`, update only locked rows, and return a bounded result/metrics record. Define behavior on deadlocks, statement timeout, and partial batch failure.

### 4. Time and timezone are operational decisions

`12:05 AM Asia/Kolkata` is not established by baseline SQL. No evidence shown proves pg_cron is installed or that database/session timezone conversion is configured. A fixed local-time schedule around DST is not an issue for India, but deployment environments still need UTC storage and explicit `AT TIME ZONE`/schedule configuration. Daily cadence allows jobs to remain `expired` in search/apply only through defensive predicates; application status checks must not rely on sweep completion.

### 5. History/audit semantics are still ambiguous

There is no `job_status_history` table in the jobs baseline. Existing `audit_logs` is immutable and generic (`13_analytics.sql:170-175, 384-387`). If audit-only is selected, freeze `entity_type`, `entity_id`, action, actor/source, old/new status, request/trace/causation metadata, and retention. If a new history table is added, define immutability, indexes, FK/delete behavior, and whether all lifecycle commands—not only expiry—write it. Do not let expiry establish a second, inconsistent history model.

### 6. Notification row requirements and privacy are not handled

`notifications` requires a user, unique idempotency key, title, and lifecycle-consistent fields; `company_id` is optional and `template_id` may be null, but the draft does not define safe values. Freeze event type/category, locale/template version, title/body variables, action URL, priority, `company_id`, and `expires_at`. Avoid descriptions, internal compensation, candidate data, storage paths, or raw AI output; confidential-job masking rules apply to notification content too.

### 7. Function security and grants need a concrete threat model

The draft asks for a function role/search path but not whether the function is `SECURITY DEFINER`, who can execute it, or how pg_cron authenticates. Baseline 17 defaults job internals to service-only and revokes broad function privileges (`17_rls.sql:148-150, 248-250`). Migration must use a fixed `search_path`, schema-qualified objects, least privilege, no user-controlled parameters, and auditable cron ownership. Ensure the function cannot be invoked by an authenticated browser role and cannot be used to expire arbitrary selected jobs.

### 8. Failure/observability/rollback behavior is missing

Define whether one notification failure aborts all job status transitions (recommended: state/audit commit independently only if notification is outbox-driven), how retries and dead letters work, and how an operator reconciles status rows with missing notifications. Add metrics for scanned/expired/skipped/notification-conflict/error counts and a run identifier. A migration rollback must not attempt to reopen expired jobs or delete audit/notification history.

## Required human approvals before migration

1. Creator-only recipient and inactive/deleted/left-account behavior; confirm no owner/admin fallback.
2. Direct notification insertion versus outbox-to-notification-worker, including preferences and template ownership.
3. Stable transition/event idempotency key format and conflict semantics.
4. Lock ordering, batch size, rerun/late-run behavior, and race handling with lifecycle commands.
5. pg_cron availability, timezone/schedule ownership, grants, and observability.
6. Audit-only versus new history table, with schema/retention and all-command consistency.
7. Safe notification DTO/content and confidential-job privacy rules.

## Go/no-go

No expiry function, pg_cron statement, notification insert, or history-table migration should be authored from this draft until approvals 1–7 are recorded. Search/apply defensive expiry predicates and read-only design remain valid independently.
