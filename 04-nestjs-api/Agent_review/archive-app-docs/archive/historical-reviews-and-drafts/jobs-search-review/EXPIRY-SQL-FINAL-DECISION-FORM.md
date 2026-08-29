# Expiry SQL — Final Decision Form

Status: `SUPERSEDED — IMPLEMENTED IN BASELINE`

`expire_due_jobs()` executable SQL likhne se pehle ye exact decisions freeze karne hain. Recommended
option source-grounded minimum behavior hai; user alternate choose kar sakta hai.

## 1. Notification recipient

Recommended: **job creator only** (`jobs.created_by`). Existing archived docs HR dashboard alert bolti
 hain, exact multi-recipient rule nahi.

Fallback when creator inactive/deleted: **skip notification** (job expiry still proceeds).

## 2. Idempotency

Recommended key:

```text
job-expired:<job_id>:<recipient_user_id>
```

Insert must be idempotent using the existing unique `notifications.idempotency_key` constraint.

## 3. Job states and due condition

Recommended:

```sql
status IN ('published', 'paused')
AND expires_at IS NOT NULL
AND expires_at <= NOW()
AND deleted_at IS NULL
```

`expires_at IS NULL` means never expires. Terminal states are untouched.

## 4. Audit/history

Recommended: add a dedicated `job_status_history` table mirroring the approved application history
shape (`from_status`, `to_status`, actor/service, reason, timestamp). If audit_logs is preferred,
record the exact target/action JSON contract before coding.

## 5. Security and scheduling

Recommended: `SECURITY DEFINER` function with fully qualified `public.*` objects, trusted minimal
`search_path`, explicit `service_role` execute grant, and one owned Supabase `pg_cron` schedule at
12:05 AM Asia/Kolkata. No Cloud Scheduler, Dispatcher or Cloud Tasks in this path.

## 6. Required tests

- Re-running the sweep creates no duplicate notification.
- Two concurrent sweeps expire each job once.
- Published/paused due jobs expire; future, null-expiry and terminal jobs do not.
- Inactive/deleted creator behavior follows the chosen rule.
- Unauthorized direct execution is denied.
- Function failure is observable and retryable on the next schedule.

## Approval record

```text
Recipient: ____________________
Inactive recipient behavior: ____________________
Idempotency key: APPROVED / CHANGED
History: job_status_history / audit_logs
Schedule/timezone: ____________________
Approved by: ____________________
Date: ____________________
```

Implementation record:

```text
Recipient: job creator only
Inactive recipient behavior: skip notification; expiry still proceeds
Idempotency key: APPROVED — job-expired:<job_id>:<recipient_user_id>
History: public.audit_logs (existing audit table; no new history table)
Schedule/timezone: Supabase pg_cron, daily 12:05 AM Asia/Kolkata (deployment prerequisite)
Executable implementation: 02-database/migrations/baseline/15_infrastructure.sql
Permissions: service_role only; anon/authenticated revoked in 17_rls.sql
```

This form is retained as a decision record. The executable baseline is authoritative; do not use
the earlier recommendation for a new `job_status_history` table or an outbox event for expiry.
