# Interview API implementation review

Reviewed `src/interviews.ts`, `src/app.module.ts`, and `src/interviews.spec.ts` against the baseline interview/application schema and `INTERVIEW-API-FINAL-FREEZE.md`.

## Findings

### Blocker — booking transaction conflicts with the database trigger

Both `schedule()` and `reschedule()` insert an `interviews` row before marking the target schedule block booked (`interviews.ts:51-56`, `103-105`). The schema trigger `validate_interview_application_scope()` requires a non-null `schedule_block_id` to already be `is_booked = TRUE`, with matching `application_id` and `job_id`. The current block query also requires the block's application to match, but the later update never sets `application_id` (or `job_id`). Consequently, a normal available block fails the trigger at interview insert; a pre-booked block is rejected by the service. The transaction rolls back, so scheduling/rescheduling cannot complete.

Fix the transaction ordering and values: lock the block, atomically update it to `is_booked=true, application_id=<application>, job_id=<job>, booked_by, booked_at` (and clear lock fields), verify one row changed, then insert the interview. Keep all of this in one transaction and handle the unique `interviews.schedule_block_id` race as `SLOT_UNAVAILABLE`.

### High — reschedule does not validate the replacement slot's job/time relationship

The replacement block query checks company, application, interviewer, lock, and booked state, but not that its `job_id` equals the old interview's job, nor that `scheduled_at + duration_minutes` fits inside the block's `start_time/end_time`. `schedule()` has the same missing time-window check. The SQL composite application/job FK catches some job mismatch only after booking, but service-level validation should reject it before mutation and should prevent an interview outside the selected slot.

### High — assigned interviewer may be inactive

The freeze requires the assigned interviewer to be an active same-company member. The block and participant lookups only constrain `company_id`; neither checks `interviewers.is_active`, and the participant insert does not check the associated user's active/deleted status (`interviews.ts:48,53-55,98-104`). A stale/inactive interviewer can therefore be scheduled or assigned.

### High — company list leaks internal interview fields / PII

`listCompany()` returns `SELECT i.*` (`interviews.ts:63`). This includes fields such as `meeting_password`, `interviewer_notes`, and `candidate_instructions` (and any future columns), whereas candidate reads use an explicit safe projection. Use a stable company response allowlist and decide explicitly which internal fields are authorized for which company roles; never expose passwords or private notes through a blanket `*` projection.

### Medium — schedule input validation is incomplete and can produce 500s

`title/type` are checked, but `round` is not checked as a positive integer and `type` is not checked against the `interview_type` enum. Invalid values are left to PostgreSQL rather than mapped to `VALIDATION_ERROR`. Missing/null `dto` can reach `dto.title` in `schedule()` after optional access was used in the UUID expression, causing a TypeError. Similar direct accesses occur in `reschedule()` (`dto.scheduled_at`). Add DTO/body guards and explicit round/type validation.

### Medium — time policy is only partially implemented

The code enforces an explicit offset and one-hour lead time, and stores the supplied value into `TIMESTAMPTZ`, which is good. However, `validTime()` relies on `Date.parse()` and does not validate that the instant is valid for the supplied IANA timezone or reject DST-gap/nonexistent local times as required by the freeze. It also does not check the selected block's actual time window. `validTimezone()`'s `includes('/') || UTC` rule is a brittle policy filter rather than a clear IANA-zone validation contract.

### Medium — missing approved mutation audit/outbox behavior

The freeze states that every mutation includes audit and approved outbox behavior. `schedule`, status changes, and `reschedule` only mutate the domain tables; no audit or outbox write is present. Notification/calendar behavior is correctly not invented, but the already-approved audit/outbox contract appears absent.

### Medium — status/participant lifecycle gaps

The transition map correctly makes completed/cancelled/no_show terminal and candidate confirm/decline authorization is scoped to the candidate's profile. Rescheduling marks the old row `rescheduled`, creates a new `scheduled` row, sets `rescheduled_from`, and increments the count, which matches the freeze. However, replacement participant insertion is a `SELECT ... INSERT` with no row-count assertion; it can silently create an interview without a participant if a future validation path changes. Existing panel participants are not copied, so confirm the intended policy for panel preservation versus replacing the primary interviewer.

## Authorization and data-scope notes

`companyActor()` correctly checks active user/company records and same-company membership for employer/HR roles, and company mutations are transaction-scoped. The owner branch is independent of the user's role; verify that this matches the frozen “owner/employer/HR” boundary. Candidate reads are constrained through `candidate_profiles.user_id`, and candidate confirmation/decline cannot target another candidate's interview. The company listing joins jobs to the requested company, avoiding the primary tenant leak, but should still filter deleted jobs/applications if those are intended to be hidden.

## Module wiring

`InterviewController` and `InterviewService` are registered in `AppModule`; the authenticated controller guard is applied. No registration defect found.

## Test coverage assessment

`interviews.spec.ts` covers only three pre-database validation cases (lead time, malformed timezone/offset, malformed status). It does not test the critical booking transaction, trigger-compatible block update, rollback, concurrent/idempotent booking, reschedule linkage/count, authorization (owner/employer/HR/interviewer/candidate/inactive member), guest applications, PII projections, slot-window checks, terminal transitions, cancellation reasons, or audit/outbox writes. Add mocked `SystemClient` transaction tests (including query order and affected-row assertions) and integration tests against the schema triggers; specifically add a happy-path schedule and reschedule test, which would currently expose the booking-order failure.

## Positive alignment

The service uses parameterized SQL and transaction wrappers, locks the interview/block rows with `FOR UPDATE`, uses `schedule_block_id` as the natural idempotency key, preserves `rescheduled_from`, uses explicit offset input, and avoids candidate-facing `SELECT *` projections. These choices are directionally consistent with the freeze but are currently undermined by the block-trigger ordering and incomplete validation.
