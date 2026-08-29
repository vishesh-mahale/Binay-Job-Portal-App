# Interview API — Core Decision Freeze Recommendation

**Status:** `RECOMMENDATION — USER FREEZE REQUIRED`

## D1. Route structure

```text
POST  /api/v1/companies/:companyId/applications/:applicationId/interviews
GET   /api/v1/companies/:companyId/interviews
GET   /api/v1/companies/:companyId/interviews/:interviewId
PATCH /api/v1/companies/:companyId/interviews/:interviewId
POST  /api/v1/companies/:companyId/interviews/:interviewId/cancel

GET   /api/v1/me/interviews
GET   /api/v1/me/interviews/:interviewId
POST  /api/v1/me/interviews/:interviewId/confirm
POST  /api/v1/me/interviews/:interviewId/decline
```

Recommendation: company management and candidate self-service routes stay separate.

## D2. Actor permissions

- Schedule/reschedule/cancel: active same-company owner/employer/HR with approved interview permission.
- Assigned interviewer must be an active member of the same company.
- Candidate may confirm or decline its own interview; candidate cannot arbitrarily edit schedule.
- Mark completed/no-show and submit interview feedback: assigned interviewer or authorized HR.

Exact permission key is still a catalog decision; no invented key is added here.

## D3. Status transitions

```text
scheduled  -> confirmed | rescheduled | cancelled | no_show
confirmed  -> rescheduled | completed | cancelled | no_show
rescheduled -> confirmed | completed | cancelled | no_show
completed, cancelled, no_show -> terminal
```

Reschedule creates a new interview row with `rescheduled_from`; historical rows are not overwritten.
NestJS owns this matrix because baseline SQL has no interview transition function.

## D4. Time and concurrency

- Input ISO-8601 timestamp with explicit offset and IANA timezone.
- Store timestamp in existing `TIMESTAMPTZ` columns and preserve timezone string.
- Reject past slots; recommended minimum lead time: 2 hours (user decision).
- Lock schedule block inside transaction; rely on existing GIST exclusion and unique block booking.
- Concurrent booking returns a safe conflict and creates no partial rows.

## D5. Integration boundary

- Automated Google/Outlook calendar and video-room creation remain future scope.
- Current API may accept a manually supplied meeting link only if the final DTO allows it.
- Reminders/confirmation notifications require approved event contracts; do not invent dispatcher routes.
- `interview.summary.requested` stays blocked until its task contract and FastAPI handler exist.

## Coding gate

Freeze D1–D4 and the permission key first. Then implement transaction-safe scheduling, rescheduling,
cancellation, confirmation and read APIs with the test matrix in `INTERVIEW-API-CONSOLIDATED-DECISION.md`.
