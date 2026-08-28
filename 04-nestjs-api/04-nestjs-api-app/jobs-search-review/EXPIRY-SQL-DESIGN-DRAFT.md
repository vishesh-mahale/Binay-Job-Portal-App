# Expiry SQL Design Draft (Not Executable)

Status: `DRAFT — recipient policy approval pending`

## Intended transaction

```text
pg_cron (daily 12:05 AM Asia/Kolkata)
        ↓
expire_due_jobs()
        ↓
lock due published/paused jobs
        ↓
published/paused → expired
        ↓
write job lifecycle audit/history
        ↓
insert one in-app notification per approved recipient
        ↓
commit
```

## Current recommendation

- Recipient candidate: `jobs.created_by` only.
- Skip notification when creator is inactive/deleted, unless the final policy says fallback recipient.
- Deterministic idempotency key is `job-expired:<job_id>:<recipient_user_id>`; the terminal `expired`
  state guarantees one expiry transition per job.
- No Outbox Dispatcher, Cloud Tasks or email worker in this expiry path.

## Still required before SQL

1. Human approval of creator-only recipient and inactive-user behavior.
2. Decide whether history uses a new `job_status_history` table or existing `audit_logs`.
3. Freeze notification `event_type`, category, title/body, entity/action fields and template usage.
4. Define function execution role, `search_path`, grants and pg_cron ownership.
5. Add tests for repeated sweep, concurrent sweep, terminal-state exclusion and notification uniqueness.

No `CREATE FUNCTION`, `CREATE TABLE`, trigger, index or cron statement is included here. This draft
must be converted into a reviewed pre-production migration only after the above decisions are approved.
