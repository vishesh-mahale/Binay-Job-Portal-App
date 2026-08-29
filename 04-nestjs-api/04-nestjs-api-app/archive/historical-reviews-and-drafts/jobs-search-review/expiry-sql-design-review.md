# Expiry SQL design draft review

Reviewer: Codex (independent revalidation)
Date: 2026-08-27
Source: `EXPIRY-SQL-DESIGN-DRAFT.md`

## Verdict

The draft is correctly non-executable and correctly blocks production claims pending recipient,
history, notification, and operational decisions. Its transaction outline matches approved
Decision-06 in broad shape, but it must be expanded before becoming a migration. The only approved
runtime authority is Supabase pg_cron at 12:05 AM Asia/Kolkata calling `expire_due_jobs()`, with
`published` and `paused` rows transitioning to `expired`; no external scheduler, Cloud Tasks,
Dispatcher, or email path is needed.

## Exact synchronization needed

### Jobs and transition safety

`jobs.expires_at` is nullable and the baseline has a partial index for published jobs with expiry
(`05_jobs.sql`, around lines 163–168 and 646–648). The migration must add a reviewed
`expire_due_jobs()` function that targets only:

```sql
status IN ('published', 'paused')
AND deleted_at IS NULL
AND expires_at IS NOT NULL
AND expires_at <= NOW()
```

It must update `status = 'expired'`, set the approved lifecycle timestamp (the `jobs` table has
`closed_at` but no `expired_at`), and avoid overwriting unrelated lifecycle fields. Whether
`closed_at` is reused for expiry or a new `expired_at` column is required is not decided by the
baseline and must be explicitly approved; silently using `closed_at` would be ambiguous.

The function must be retry-safe and concurrency-safe. Use row locking/claiming so concurrent sweep
invocations cannot process the same row twice, and ensure only the expected current status is
updated. If a status-history table is selected, insert one `from_status → expired` row per changed
job. If generic `audit_logs` is selected instead, record service actor, company/entity, old/new
values, and trace metadata consistent with its schema (`13_analytics.sql`, lines 173–230). The
draft’s “history/audit” wording cannot become executable until that representation is chosen.

### Notification insert

`notifications.user_id` is mandatory, `idempotency_key` is globally unique, and notification identity
is immutable (`12_notifications.sql`, lines 143–216 and 349–381). Therefore the draft’s creator-only
candidate is a reasonable pending policy because `jobs.created_by` is non-null, but it is not yet
approved. The migration must not insert a row until recipient policy, inactive/deleted behavior,
event type/category/title/body or template, entity/action fields, and one-row-per-recipient semantics
are frozen.

If creator-only is approved, use a deterministic recipient-scoped key (for example
`job-expired:v1:<job_id>:<created_by>`); the draft’s job + recipient + expiry-date guidance is
directionally safe, but date normalization and exact string remain contract details. Use a unique
conflict-safe insert so repeated/concurrent sweeps cannot duplicate the row. If fan-out is later
approved, the key must include each recipient UUID; a job-only key would suppress other recipients.

### Expiry query guards

Decision-06 requires candidate-facing search and apply queries to enforce:

```sql
expires_at IS NULL OR expires_at > NOW()
```

This guard is independent of the daily physical sweep. It must be present in all public search and
application eligibility paths, including the current guest application query in `src/guest.ts`,
which visibly checks `published` and `deleted_at` but not expiry.

### pg_cron and permissions

Add an operationally reviewed schedule for daily 12:05 AM Asia/Kolkata only after confirming the
Supabase `pg_cron` extension, database timezone interpretation, function owner, `search_path`, and
execution grants. The baseline demonstrates secure function patterns with explicit `search_path`
and revoked public execution (`15_infrastructure.sql`, lines 105–119 and 374–377), but does not
create this function or grant it to a cron role. The function must be schema-qualified and not
PUBLIC-executable; service/cron execution must be auditable.

## Design blockers

1. Recipient policy is still pending; inactive/deleted creator handling cannot be inferred.
2. No `job_status_history` table exists, and the baseline does not say whether audit-only is enough.
3. No `expired_at` column exists; reusing `closed_at` needs explicit decision.
4. Notification event/template/content and idempotency key format are unspecified.
5. pg_cron extension/role/timezone/monitoring setup is outside the baseline.
6. The approved policy says notification creation is atomic with the transition, so partial success
   and retry behavior must be tested in one transaction.

## Required tests before enabling the schedule

- due published and paused jobs expire; draft/closed/archived/non-due/deleted rows do not;
- concurrent/repeated sweeps produce one transition, one history/audit record, and one notification
  per approved recipient;
- a notification failure rolls back the corresponding status transition (or an explicitly approved
  alternative is documented);
- terminal states cannot be reopened by the expiry function;
- inactive/deleted recipient behavior matches the approved policy;
- search and registered/guest apply paths hide due jobs before the sweep;
- function privileges, `search_path`, cron ownership, and failure observability are verified.

## Gate recommendation

Keep the draft status as `DRAFT — NOT EXECUTABLE`. After recipient and history decisions close,
prepare a reviewed forward migration that adds only the approved history/timestamp/function/schedule
objects, plus notification insertion using the existing schema. Do not add an outbox event, external
worker, or email route for expiry; those are outside approved Decision-06 scope.

