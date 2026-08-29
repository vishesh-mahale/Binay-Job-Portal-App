# Job approve/reject/archive — transition decision

Date: 2026-08-28  
Status: `RECOMMENDATION — READY TO FREEZE`

## Source-grounded rules

- `job_status` includes `draft`, `pending_approval`, `published`, `paused`, `closed`, `expired` and
  `archived` (`02_enums.sql`).
- Decision-07 J1 defines named `approve`, `reject` and `archive` commands.
- Decision-07 J2 gives approval/rejection/archive authority to company owner/admin.
- Decision-07 J3 says approval-required jobs move through `pending_approval`; rejected edits require
  resubmission.
- Terminal states `closed`, `expired` and `archived` cannot be reopened (Decision-07 J1).

## Recommended transitions

| Command | Allowed source | Result | Actor | Required input |
|---|---|---|---|---|
| approve | `pending_approval` | `published` | verified company owner/admin | none |
| reject | `pending_approval` | `draft` | company owner/admin | non-empty rejection reason |
| archive | `closed`, `expired` | `archived` | company owner/admin | optional archive reason |

## Why archive is restricted

`paused` jobs are resumable, so archiving a paused job would create an unapproved alternate path.
Closed/expired jobs are already non-reopenable business outcomes and are the safest archive sources.

## Atomic behavior

Each command must lock and update the target job in one transaction, write an immutable `audit_logs`
record, and reject a stale/invalid source state. No lifecycle event or Cloud Task is invented. Job-AI
enrichment is emitted only where the aligned G-1 contract allows it.

## Explicit open point

If product wants `paused → archived` or a different archive source, that is a separate decision and
must be recorded before implementation. This file recommends the restricted table above so terminal
jobs are retained without silently changing pause/resume behavior.

## Acceptance tests

- verified owner/admin can approve pending job; unverified company is rejected;
- reject requires a non-empty reason and returns job to draft;
- archived job cannot be approved, resumed, published or edited;
- closed/expired jobs can be archived once; repeated archive is rejected;
- cross-company and non-owner/admin requests are denied;
- business update and audit insert roll back together on failure.
