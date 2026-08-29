# Interview API — Implementation Plan

**Status:** `PLAN DRAFT — ROUTE/PERMISSION FREEZE REQUIRED`

## Verified scope

Baseline `10_interviews.sql` owns interview pools, interviewers, availability, schedule blocks,
interviews, participants, feedback and documents. Its triggers enforce same-company scope and
application/candidate consistency. NestJS must remain the authorization and transaction boundary.

## Proposed command surface

```text
POST/PATCH/DELETE /api/v1/companies/:companyId/interviews[/:interviewId]
GET               /api/v1/companies/:companyId/interviews
GET               /api/v1/me/interviews
```

Exact paths, participant permissions and whether cancellation uses DELETE or a status command need
catalog freeze before coding.

## Transaction boundary

Schedule/reschedule/cancel must atomically validate application/company scope, lock the selected
schedule block, prevent overlap, write interview and participants, and create approved audit/outbox
rows. External calendar/video/email calls stay post-commit and require separate contracts.

## Required decisions

- HR/interviewer/candidate permissions for schedule, reschedule and cancel.
- Availability timezone and DST handling.
- Candidate confirmation requirement and deadline.
- Allowed interview status transitions and terminal states.
- Notification/reminder event contracts and consumer ownership.
- Whether external calendar/video integration is current or future scope.

## Tests

- Same-company scope and cross-company rejection.
- Application/candidate mismatch rejection.
- Overlapping schedule block rejection under concurrency.
- Reschedule/cancel transition and participant consistency.
- Candidate confirmation rules and timezone normalization.
- Atomic rollback with no orphan interview/participant/history/outbox rows.
