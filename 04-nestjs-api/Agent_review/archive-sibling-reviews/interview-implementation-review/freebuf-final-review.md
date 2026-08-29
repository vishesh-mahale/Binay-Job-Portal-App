# Interview API — Freebuf Final Runtime/Schema Audit

**Date:** 2026-08-28  
**Scope:** `04-nestjs-api-app/src/interviews.ts`, `interviews.spec.ts`, `app.module.ts`, baseline `10_interviews.sql`/`02_enums.sql`  
**Method:** static SQL/schema cross-check plus the current interview unit test and TypeScript test configuration. No implementation changes made.

## Verdict

**BLOCKED for production merge.** The current implementation has the intended broad flow (transactional booking, row locks, candidate scoping, frozen status matrix, and new-row rescheduling), but several paths either violate the frozen contract or fail at runtime for valid database states. The existing interview test suite only exercises three validation cases; it does not execute a database-backed mutation.

## Findings

### INT-CRIT-1 — Expired block locks are admitted but never cleared, violating the booking CHECK

`interviews.ts:48` and `:99` permit a block when `locked_until < NOW()`. The subsequent updates at `:56`/`:105` set `is_booked`, `booked_by`, and `booked_at`, but leave `locked_by` and `locked_until` untouched. Baseline `10_interviews.sql` `interview_block_booking_state` requires every booked row to have both lock columns NULL. Therefore a valid block with an expired lock reaches the booking UPDATE and fails the CHECK constraint, rolling back the whole transaction. Clear the expired lock in the booking update (or atomically update with the booking state).

### INT-HIGH-1 — PATCH company scope is bypassed for status changes

`InterviewController.update` (`interviews.ts:121`) accepts `companyId`, but for every status other than `rescheduled` calls `changeStatus` without it. `changeStatus` (`:78-84`) authorizes against the interview's actual `j.company_id`, not the path company. A company actor can therefore submit a status mutation using an unrelated `companies/:companyId` path value; the path scope is not enforced. Pass and require the route company ID (including UUID validation) for status commands, or remove the company-scoped route.

### INT-HIGH-2 — Interviewer activity is not enforced

The frozen policy requires an assigned interviewer to be a same-company active member. The schedule/reschedule block queries join `interviewers` only by ID/company (`:48`, `:99`) and participant lookup (`:53`, `:104`) likewise omits `i.is_active`. Database FKs prove identity/company membership but do not prove the interviewer is active. A deactivated interviewer can still receive new bookings and primary participant rows.

### INT-HIGH-3 — `type` and `round` are not validated at the API boundary

`interviews.type` is the PostgreSQL `interview_type` enum (`phone`, `video`, `in_person`, `technical_assessment`, `group`, `panel`), but `schedule` accepts any nonblank string (`:45`) and relies on an enum cast at INSERT (`:51`), turning an invalid client value into a database error rather than `VALIDATION_ERROR`. `round` is defaulted but not checked for integer/positive range; `round: 0`, negative, or fractional values similarly reach the `round > 0`/integer constraints and become database failures. Validate both explicitly.

### INT-HIGH-4 — Reschedule does not validate the requested time against the selected block

Both schedule flows validate only that the requested timestamp is more than one hour in the future (`:31`, `:45`, `:93`). They never compare `scheduled_at` plus `duration_minutes` with the locked block's `start_time`/`end_time`, nor ensure the duration fits the block. The block is booked for an interview whose persisted time can be outside the selected slot. The schema checks block state and application scope, not this temporal correspondence.

### INT-MED-1 — Time/DST policy is only partially implemented

`validTime` uses JavaScript `Date.parse` and the offset regex (`:31`, `:45`, `:93`). `validTimezone` checks that `Intl.DateTimeFormat` accepts the zone (`:32`) but does not detect nonexistent/ambiguous local DST wall times; in fact the input includes an explicit offset and is stored as `TIMESTAMPTZ`, so the local-zone/DST relationship is never verified. The frozen policy explicitly calls for invalid DST times to be rejected. Add a strict zone/instant policy or document that offset timestamps are authoritative and DST wall-time validation is out of scope.

### INT-MED-2 — Logical-deletion/active-state filters are inconsistent on candidate reads and confirmation

`getMine`/`listMine` (`:68`, `:73`) and the candidate identity query in `changeStatus` (`:80`) join/filter only `candidate_profiles.id/user_id`; they do not require `cp.deleted_at IS NULL`. A soft-deleted candidate profile can still expose interviews and confirm/cancel them if its user remains authenticated. This is inconsistent with the schema's soft-delete model and with `companyActor`, which explicitly filters active/non-deleted users and companies.

### INT-MED-3 — Mutation side effects required by the frozen policy are absent

No schedule, status, or reschedule path writes an audit row or an outbox row. `INTERVIEW-API-FINAL-FREEZE.md` requires scope checks, locking, audit, and approved outbox behavior on every mutation. The SQL baseline owns `outbox_events`; the implementation currently only writes interviews, participants, and blocks. Notification/calendar/summary integrations remain correctly gated, but audit/outbox integration is still missing.

### INT-MED-4 — Schedule/reschedule can book a block without checking temporal overlap or slot duration

Related to INT-HIGH-4, the implementation selects only IDs/application/interviewer/booked state (`:48`, `:99`). It does not select or use `start_time`, `end_time`, or `slot_duration` in either decision. The exclusion constraint prevents overlapping blocks for one interviewer, but does not enforce that an interview's requested duration/time is within its chosen block. This is a data-integrity gap independent of locking.

## Verified correct in current code

- SQL column references used by the current queries are present; the prior stale `b.company_id` defect is gone.
- `interviews` inserts use the application/job/candidate values and are protected by the baseline composite FK and scope trigger.
- `schedule` and `reschedule` lock the selected block with `FOR UPDATE`, and `changeStatus` locks the interview row with `FOR UPDATE`.
- Reschedule now preserves the old row as `rescheduled` and inserts a new `scheduled` row with `rescheduled_from` and incremented `reschedule_count` (`:102-105`).
- Candidate confirmation is restricted to the candidate profile owner and populates `is_candidate_confirmed`/`candidate_confirmed_at` (`:80-87`). Candidate decline gets the fallback `candidate_declined` reason, satisfying the cancellation CHECK.
- The transition matrix and terminal states match the frozen matrix; `completed` sets `completed_at`, satisfying `interview_completion_state`.
- Company list and candidate reads are bounded to 100 rows; company authorization uses active user plus owner/employer/HR same-company checks.

## Test coverage audit

`interviews.spec.ts` contains only three tests: lead-time rejection, malformed timezone/offset rejection, and malformed status command rejection. It does not test any successful schedule/status/reschedule path or database interaction. Missing regression tests include: expired-lock booking, block/time-duration mismatch, cross-company PATCH status, inactive interviewer, invalid enum/round, candidate soft deletion, completed/cancelled CHECK behavior, confirmation fields, new-row reschedule/participant consistency, and rollback/orphan prevention. `npm.cmd test -- --runInBand interviews.spec.ts` passes (3/3), but this is not evidence that runtime SQL paths work.

## Required disposition

Before merge, fix INT-CRIT-1 and the company-scope, active-interviewer, enum/round, and block-time integrity issues; then add integration tests against the baseline schema. Decide and implement the frozen audit/outbox requirement. Keep external calendar/video/notification/summary behavior gated until their approved contracts exist.
