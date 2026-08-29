# `expire_due_jobs()` implementation review

Reviewer: Codex (independent revalidation)
Date: 2026-08-27

## Verdict

The function is directionally consistent with approved Decision-06: it targets due published and
paused jobs, uses a database transaction, avoids an outbox/email path, and is intended for a daily
pg_cron run. It is not yet production-ready. The grant is incomplete for an identified cron
execution role, the function currently writes audit only (not job-specific history), the notification
policy/content is asserted as approved without a corresponding decision record, and the SQL security,
index, observability, and race behavior need explicit review/tests.

## What is correct

- The predicate at lines 397–402 correctly restricts work to `published`/`paused`, non-deleted rows
  with `expires_at <= NOW()`.
- `FOR UPDATE SKIP LOCKED` and the second status/expiry predicate in the update protect concurrent
  sweeps from double transitions and exclude draft/pending/closed/expired/archived rows.
- `published/paused → expired` matches Decision-06 and the approved Decision-07 policy.
- No outbox, Cloud Tasks, Dispatcher, or email route is introduced, matching the approved expiry
  boundary.
- The audit row uses columns that exist in `audit_logs`: `company_id`, `actor_service`, action/entity,
  old/new values, changes, and metadata (`13_analytics.sql`, lines 173–230).
- Notification insertion uses the existing globally unique `notifications.idempotency_key` and
  `ON CONFLICT DO NOTHING`, which is the right primitive for repeated invocation.

## Required corrections before executable migration

### 1. History representation is unresolved

The function claims “audited, and notified” but there is no `job_status_history` table in the
baseline. Decision-07 leaves “job-history/audit representation” as implementation work. Either:

- formally approve generic `audit_logs` as the complete lifecycle history and ensure every job
  lifecycle command writes the same canonical audit shape; or
- add a reviewed append-only job-history table and write it here and from all lifecycle commands.

Do not let expiry silently establish an audit-only model while other lifecycle commands use a
different history model. The current audit metadata lacks request/trace identifiers, though those
columns exist and should be populated when available; service actor naming and retention also need
to be standardized.

### 2. Expiry timestamp semantics need an explicit decision

`jobs` has `expires_at`, `closed_at`, and `paused_at`, but no `expired_at`. The function only updates
`status` and `updated_at` (lines 406–412). That may be acceptable if status is the sole expiry marker,
but must be frozen. Reusing `closed_at` would be semantically ambiguous; adding `expired_at` requires
a forward migration and all DTO/history mappings. Do not infer either behavior.

### 3. Notification policy/content is not evidenced as approved

The function hard-codes creator-only, active-user filtering, `job.expired`, title/body, action URL,
and delivery JSON (lines 428–445). `notifications` supports these fields, but requirements and
Decision-07 do not specify recipient, inactive-user behavior, template, title/body, action contract,
or preference behavior. The separate expiry-notification decision still marks these as pending.
This block must close before treating the insert as approved. If creator-only is approved, the
recipient is guaranteed non-null by `jobs.created_by`; if multi-recipient policy is approved, include
each recipient UUID in a stable key and deduplicate recipients.

The current key embeds the textual `timestamptz` (`job-expired:<job>:<user>:<expires_at>`). It is
stable for one immutable expiry value, but the exact key format and transition identity are not
frozen. Use a reviewed versioned key and test that an existing conflicting key cannot conceal a
mismatched notification payload.

### 4. Index coverage should be corrected or consciously accepted

`idx_jobs_expiring` in `05_jobs.sql` covers only `status = 'published'`, while the function also
processes `paused`. The function is correct functionally but may scan paused rows. Add/replace a
reviewed partial index covering both statuses, or document the expected scale/performance and test
the plan. Do not alter the baseline index casually.

### 5. Security-definer hardening and grants

The function is `SECURITY DEFINER`, `SET search_path = public`, and every table is schema-qualified.
This is better than an implicit path, but the least-privilege form should use a hardened path (for
example `pg_catalog` plus explicitly qualified `public` objects) and a fixed owner. The baseline
uses explicit search-path hardening and revokes public execution for infrastructure functions.

`17_rls.sql` grants EXECUTE only to `service_role` after revoking PUBLIC. That is safe for a
service-role caller but does not prove Supabase pg_cron executes as `service_role`; pg_cron usually
uses the database job owner/role. The migration/runbook must identify the actual cron role, grant
only this function to it (or schedule as the fixed function owner), and test unauthorized anon/
authenticated execution. Ensure the owner cannot be changed by untrusted roles.

### 6. Function return/observability and failure behavior

Returning an integer count is useful, but the function does not emit a run identifier, trace, error
summary, or durable sweep metrics. Decision-07 requires operationally reviewed schedule/permissions;
add monitoring/runbook expectations outside the SQL or extend the reviewed function contract. A
notification insert error currently aborts the entire function transaction, which is consistent with
atomicity but must be explicitly tested and monitored. `ON CONFLICT DO NOTHING` should not turn a
payload mismatch into a silent success without a conflict-validation policy.

### 7. Time-zone and schedule verification

The SQL function compares `timestamptz` to `NOW()`, which is timezone-safe for due checks. The
12:05 AM Asia/Kolkata schedule itself is not present in the inspected lines and must be added only
after pg_cron extension availability, timezone syntax, ownership, and deployment ordering are
verified. Decision-06 selects the daily schedule; do not revive the older 5–15 minute view-refresh
precedent as an expiry cadence.

## Required tests

- Due published and paused rows expire; all other statuses and deleted/non-due rows remain unchanged.
- Concurrent and repeated calls produce one status transition, one approved history/audit record,
  and one notification per approved recipient.
- Race with publish/pause/resume/close obeys the lifecycle lock/transition authority.
- Notification conflict behavior validates identity and does not mask a mismatched payload.
- Inactive/deleted/left creator behavior matches the approved recipient policy.
- Search and registered/guest apply paths enforce `(expires_at IS NULL OR expires_at > NOW())` before
  the daily sweep; the current guest apply SQL must be checked for this guard.
- Only the intended cron/service role can execute the function; anon/authenticated callers cannot.
- SQL plan/index coverage includes paused jobs, and failures are observable/retryable.

## Gate recommendation

Status: `REVIEW REQUIRED — NOT PRODUCTION READY`.

The function can serve as a test-design starting point, but do not enable pg_cron or call it from
production until history/timestamp representation, recipient/content policy, idempotency key, index
coverage, cron role, hardened security, and failure observability are synchronized in reviewed
migrations and decision documents.

