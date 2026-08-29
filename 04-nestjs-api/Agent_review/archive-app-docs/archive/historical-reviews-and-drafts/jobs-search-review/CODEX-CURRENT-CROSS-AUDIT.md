# Jobs/Search Current Cross-Audit — Codex

Date: 2026-08-27
Scope: Decision-07, expiry SQL, search/apply guards, and the recent documentation/code changes.

## Agent report status

| Reviewer | File | Current-scope status | Result |
|---|---|---|---|
| Antigravity | `antigravity-final-cross-audit.md` | Yes | Conditional pass |
| FreeBuf | `freebuf-cross-audit.md` | Yes | Conditional pass |
| Cline | `cline-final-cross-audit.md` | Yes | Conditional pass |
| Opencode | `opencode-decision-review.md` | No — created before `expire_due_jobs()` and index fixes | Stale; not evidence for the current revision |

`opencode-decision-review.md` must not be presented as a current verification: it still says that
`expire_due_jobs()` is missing. The current baseline now contains that function.

## Current facts verified by Codex

- Decision-07 is the approved product direction for Jobs/Search.
- Guest apply and normal apply contain an expiry guard (`expires_at IS NULL OR expires_at > NOW()`).
- `expire_due_jobs()` uses one captured clock value, `FOR UPDATE SKIP LOCKED`, transitions only due
  `published`/`paused` jobs, writes an audit record, and uses a stable notification idempotency key.
- The expiry index now covers both `published` and `paused` jobs.
- `expire_due_jobs()` is executable only by `service_role`; `anon` and `authenticated` are denied.

## Findings requiring closure before calling expiry fully production-ready

1. **Decision/document status drift:** `EXPIRY-SQL-FINAL-DECISION-FORM.md` still says
   `PENDING HUMAN CONFIRMATION`, although the SQL has been implemented. Mark it implemented or
   explicitly keep the SQL as a draft; do not leave contradictory statuses.
2. **Cron execution evidence:** the repository does not provision the `pg_cron` schedule. The
   Dev/Prod setup must record the exact schedule, timezone behavior, execution role, and a smoke
   check proving that `expire_due_jobs()` ran successfully.
3. **Batch bound:** the function processes at most 100 rows per invocation. This is safe for
   concurrency, but backlog/drain behavior must be documented and tested (or the schedule/function
   intentionally changed).
4. **Notification ownership:** the approved exception that the expiry function inserts the
   in-app `notifications` row directly must be documented in the API/operations plan. It must not
   be confused with a general rule that database functions perform notification delivery.
5. **API catalog drift:** remaining Jobs/Search `TBD` placeholders must be reconciled with the
   concrete Decision-07 routes, or explicitly marked as implementation follow-up.

## Live database check (27 Aug 2026)

- `jobs`, `companies`, `company_members` and `notifications` exist.
- `public.expire_due_jobs()` was applied from the current baseline and returned `0` in a rollback
  test transaction.
- Database timezone is `UTC`.
- `pg_cron` was enabled and the schedule `daily_job_expiry_sweep` was created successfully. It is
  active with `35 18 * * *` UTC (12:05 AM Asia/Kolkata) and runs
  `SELECT public.expire_due_jobs();`. Job id `2` was verified in `cron.job`.
- The schedule creation is now also recorded idempotently in
  `02-database/migrations/baseline/15_infrastructure.sql` after the function definition, so a
  future baseline setup will recreate it automatically after `01_extensions.sql` enables pg_cron.

## Final verdict

```text
Jobs/Search product decision: APPROVED/FROZEN
Current code direction: VALID
Four-agent current audit: NOT COMPLETE (Opencode report is stale; current Cline report is present)
Overall: CONDITIONAL PASS
```

No additional architecture redesign is justified by these reports. Close the five documentation/
operational items above, then rerun the Opencode audit against the current revision and perform the
expiry SQL + pg_cron behavioral test before declaring final freeze.
