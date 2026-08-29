# Application Status Transition — Next Implementation Plan

**Status:** `BLOCKED ON ROUTE/PERMISSION FREEZE — NO CODE YET`

## Repository authority

Status changes must use `public.change_application_status(...)` from
`02-database/migrations/baseline/09_applications.sql`. Direct `UPDATE job_applications.status`
is prohibited by the database trigger.

## Verified database behavior

The function atomically:

- locks and reads the active application;
- validates the approved forward transition;
- updates status and reviewer/shortlist/rejection fields;
- inserts `application_status_history`;
- emits `application.status.changed` outbox data.

Terminal states must not be reopened. Invalid transitions must leave no partial writes.

## Required freeze decisions

1. Public route shape (company-nested versus job/application resource).
2. Exact HR permission key and whether owner/admin bypass it.
3. Which roles may perform each transition.
4. Required reason fields (`rejected`, `withdrawn`, hold/offer decisions).
5. Whether optimistic expected-current-status/revision is required in the request.
6. Consumer/contract ownership for `application.status.changed` (currently phased gap).

## Planned implementation after freeze

- Authenticated actor guard and same-company application lookup.
- DTO validation for target status, reason and optional expected state.
- Call the approved SQL function through `SystemClient` rather than ad-hoc SQL.
- Map SQL transition errors to the existing API error envelope.
- Return current status plus history/audit-safe metadata; never expose private recruiter notes to candidates.

## Required tests

- Every allowed transition from the SQL function.
- Invalid/backward/terminal transition rejection.
- Unauthorized, cross-company and inactive-member rejection.
- Rejection reason validation.
- Concurrent status changes and stale expected-state behavior.
- Atomic history + outbox creation and rollback on failure.
- No direct status update path bypasses the trigger.
