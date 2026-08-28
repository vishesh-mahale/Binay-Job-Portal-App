# Interview API — Consolidated Agent Decision

**Status:** `RECOMMENDATION READY — CODING BLOCKED UNTIL POLICY FREEZE`

Reports received: Antigravity and FreeBuf. OpenCode report was not present in the review folder, so
this is a two-agent consolidation, not a three-agent consensus.

## Evidence corrections

- `10_interviews.sql` has strong company/application scope guards and a GIST overlap exclusion.
- Unlike applications, no approved `change_interview_status()` function was found; NestJS must own
  the transition matrix unless a reviewed SQL function is added.
- External calendar/video automation is explicitly future scope. Manual meeting link is acceptable
  only if the final DTO permits it.
- `interview.summary.requested` has no complete task contract/worker handler and must remain gated.

## Consolidated recommendations

| Area | Recommendation | Status |
|---|---|---|
| Routes | Candidate self-service under `/api/v1/me/interviews`; company scheduling/management under `/api/v1/companies/:companyId/...` or application-nested equivalent | Human route freeze required |
| Scheduling actors | Active same-company owner/employer/HR; assigned interviewer must belong to same company | Recommended |
| Candidate actions | Candidate may confirm/decline; arbitrary candidate reschedule/cancel is not approved | Recommended |
| Statuses | `scheduled → confirmed/rescheduled/cancelled/no_show`; `confirmed/rescheduled → completed/cancelled/no_show`; completed/cancelled/no_show terminal | NestJS matrix required |
| Reschedule | Create a new interview row linked by `rescheduled_from`; do not overwrite historical schedule | Recommended |
| Time | ISO-8601 input with offset; store `TIMESTAMPTZ`; reject past slots; minimum lead time still open (2h suggestion) | Partially open |
| Concurrency | Lock schedule block and rely on GIST exclusion; duplicate booking returns conflict | Recommended |
| Notifications | Only approved contracts; reminders/confirmation events remain gated | Open |
| Calendar/video | Manual link only; automated provider integration future | Recommended |
| Summary AI | Do not implement until task contract and FastAPI handler exist | Blocked |

## Required decisions before coding

1. Exact company and candidate route paths.
2. Permission key and per-transition actor matrix, including `no_show` and feedback submission.
3. Final status transition table and terminal behavior.
4. Minimum lead time, timezone/DST invalid-time handling.
5. Notification/reminder contracts and consumer ownership.
6. Idempotency key policy beyond natural `schedule_block_id` uniqueness.

## Required tests

- Same-company and cross-company authorization.
- Application/candidate/interviewer scope trigger behavior.
- Concurrent double-booking and stale lock recovery.
- Reschedule creates a new linked row.
- Every allowed/invalid/terminal transition.
- Candidate confirm/decline authorization.
- Past-slot/timezone/lead-time validation.
- Atomic rollback of interview, participants, audit and approved outbox rows.

**Final conclusion:** Database foundation is strong, but interview coding should wait for the six policy
decisions above. No interview endpoint or event contract is invented by this consolidation.
