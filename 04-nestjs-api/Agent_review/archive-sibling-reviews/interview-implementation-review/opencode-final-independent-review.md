# Interview API — Final Independent Review

**Reviewer:** opencode (Senior NestJS + PostgreSQL reviewer)
**Date:** 2026-08-28
**Files reviewed:** `interviews.ts` (122 lines), `app.module.ts` (27 lines), `interviews.spec.ts` (22 lines)
**Ground truth:** `10_interviews.sql`, `02_enums.sql`, `09_applications.sql`, `INTERVIEW-API-FINAL-FREEZE.md`, `INTERVIEW-API-IMPLEMENTATION-PLAN.md`, `AGENTS.md`
**Build:** PASS (`tsc -p tsconfig.build.json` — zero errors)
**Tests:** PASS (29 suites, 87 tests, 0 failures)

---

## 1. Executive Verdict: **BLOCKED**

The implementation has a **critical transaction-ordering bug** that will cause every `schedule()` and `reschedule()` call to fail at runtime against the live PostgreSQL schema. The `interviews_application_scope_guard` trigger requires the schedule block to already be booked (`is_booked = TRUE`) before the interview INSERT, but the NestJS code inserts the interview *before* marking the block as booked. Additionally, the NestJS code validates `application_id` on an unbooked block, which per the SQL CHECK constraint is always `NULL`, making the equality check always fail.

---

## 2. Files and Schema Inspected

| File | Lines | Purpose |
|---|---|---|
| `10_interviews.sql` | 536 | interview_schedule_blocks, interviews, interview_participants tables; 3 triggers; GIST exclusion |
| `02_enums.sql` | 583 | interview_status, interview_type, meeting_provider enums |
| `09_applications.sql` | 1111 | job_applications table (FK target for interviews) |
| `INTERVIEW-API-FINAL-FREEZE.md` | 36 | Frozen policy decisions |
| `INTERVIEW-API-IMPLEMENTATION-PLAN.md` | 44 | Implementation plan with test requirements |
| `AGENTS.md` | 54 | Agent working rules and validation expectations |
| `interviews.ts` | 122 | InterviewService + InterviewController |
| `app.module.ts` | 27 | Module registration |
| `interviews.spec.ts` | 22 | 3 validation-only unit tests |
| `clients.ts` | 23 | SystemClient transaction wrapper |

---

## 3. Verified Correct Behavior

| # | Area | Evidence | Verdict |
|---|---|---|---|
| 1 | **Enum values** | Code `STATUSES` set (line 8) matches `02_enums.sql:341-348` exactly: `scheduled, confirmed, rescheduled, completed, cancelled, no_show` | CORRECT |
| 2 | **Transition matrix** | `TRANSITIONS` (lines 9-13) matches freeze: `scheduled→{confirmed,rescheduled,cancelled,no_show}`, `confirmed→{rescheduled,completed,cancelled,no_show}`, `rescheduled→{confirmed,completed,cancelled,no_show}`, terminal states have no entry → `TRANSITIONS[x]?.has()` returns `false` → blocked | CORRECT |
| 3 | **Terminal states cannot reopen** | `completed`, `cancelled`, `no_show` have no key in `TRANSITIONS` → any attempt throws `INVALID_STATUS_TRANSITION` (line 85) | CORRECT |
| 4 | **Module registration** | `InterviewController` in controllers, `InterviewService` in providers (app.module.ts:26) | CORRECT |
| 5 | **Schedule route** | `POST /api/v1/companies/:companyId/applications/:applicationId/interviews` (line 115) matches freeze | CORRECT |
| 6 | **Company list route** | `GET /api/v1/companies/:companyId/interviews` (line 116) matches freeze | CORRECT |
| 7 | **Candidate self-service routes** | `GET /me/interviews`, `GET /me/interviews/:id`, `POST /me/interviews/:id/confirm`, `POST /me/interviews/:id/decline` (lines 117-120) all match freeze | CORRECT |
| 8 | **PATCH company update route** | `PATCH /api/v1/companies/:companyId/interviews/:interviewId` (line 121) — reschedule delegated to dedicated method | CORRECT |
| 9 | **UUID validation** | Regex at line 7 validates v1-5 UUIDs | CORRECT |
| 10 | **1-hour lead time** | `validTime()` (line 31): `t > Date.now() + 60 * 60 * 1000` matches freeze "1 घंटा" | CORRECT |
| 11 | **Explicit ISO offset validation** | Line 45: `!/[zZ]\|[+-]\d{2}:?\d{2}$/.test(dto.scheduled_at)` — rejects timestamps without Z or ±HH:MM | CORRECT |
| 12 | **IANA timezone validation** | `validTimezone()` (line 32): `Intl.DateTimeFormat` probe + requires `/` or `UTC` — catches garbage like `Not/AZone` | CORRECT |
| 13 | **Same-company authorization** | `companyActor()` (lines 38-42): checks `users.status='active'`, `users.deleted_at IS NULL`, `companies.deleted_at IS NULL`, `(owner_id OR active member with employer/hr role)` via `company_members` | CORRECT |
| 14 | **Candidate self-read scope** | `getMine()` (line 68): JOINs `candidate_profiles` on `cp.id = i.candidate_id WHERE cp.user_id = $2` — candidate sees only own interviews | CORRECT |
| 15 | **Company list scope** | `listCompany()` (line 63): JOINs `jobs` on `j.company_id = $1` — company sees only own interviews | CORRECT |
| 16 | **Cancel reason enforcement** | Line 86: `if (status === 'cancelled' && !reason?.trim()) throw REASON_REQUIRED` + SQL constraint `interview_cancellation_state` (10_interviews.sql:252-254) | CORRECT |
| 17 | **completed_at on completion** | Line 87: `completed_at=CASE WHEN $1='completed' THEN NOW() ELSE NULL END` — satisfies `interview_completion_state` CHECK (10_interviews.sql:248-251) | CORRECT (was C1 in prior review, now fixed) |
| 18 | **Candidate confirmation fields** | Line 87: `is_candidate_confirmed=CASE WHEN $1='confirmed' THEN TRUE ELSE ...`, `candidate_confirmed_at=CASE WHEN $1='confirmed' THEN NOW() ELSE ...` — satisfies `interview_candidate_confirmation_state` CHECK (10_interviews.sql:255-258) | CORRECT (was H3 in prior review, now fixed) |
| 19 | **Reschedule creates new row** | Lines 102-103: old row updated to `rescheduled`, new INSERT with `rescheduled_from=old.id`, `reschedule_count=old+1` — matches freeze "नई interview row बनेगी और rescheduled_from पुरानी row को point करेगा" | CORRECT (was C2 in prior review, now fixed) |
| 20 | **interview_participants created on schedule** | Lines 53-55: queries `interviewers.user_id`, inserts into `interview_participants` with `role='interviewer', is_primary=true` | CORRECT (was H2 in prior review, now fixed) |
| 21 | **interview_participants created on reschedule** | Line 104: inserts participant for new interview | CORRECT |
| 22 | **Candidate read excludes sensitive columns** | Lines 68, 73: explicit column list excludes `interviewer_notes`, `meeting_password`, `meeting_id`, `meeting_provider`, `location`, `candidate_instructions`, `cancellation_note` | CORRECT (was H4 in prior review, now fixed) |
| 23 | **Dedicated reschedule method** | Lines 92-108: separate `reschedule()` method with its own validation, old-row lock, new-block lock, participant creation | CORRECT |
| 24 | **Schedule block FOR UPDATE lock** | Lines 48, 99: `FOR UPDATE` prevents concurrent double-booking | CORRECT |
| 25 | **GIST exclusion** | 10_interviews.sql:180-183: `EXCLUDE USING gist (interviewer_id WITH =, tstzrange(start_time, end_time) WITH &&)` — prevents overlapping blocks per interviewer | CORRECT (SQL-level) |

---

## 4. Critical Findings

### C1. Schedule block booking order violates SQL trigger — every schedule() and reschedule() will fail at runtime

**File:** `interviews.ts:51-56` (schedule), `interviews.ts:103-105` (reschedule)
**Severity:** CRITICAL — runtime exception on every booking attempt
**Blocks merge:** YES

**Repository evidence:**

The `interviews_application_scope_guard` trigger (`10_interviews.sql:365-370`) fires `BEFORE INSERT` on `interviews` and calls `validate_interview_application_scope()` (`10_interviews.sql:300-363`). The trigger reads the schedule block directly from the table:

```sql
-- 10_interviews.sql:348-358
IF NEW.schedule_block_id IS NOT NULL THEN
    SELECT application_id, job_id, is_booked
      INTO v_block_application_id, v_block_job_id, v_block_is_booked
      FROM interview_schedule_blocks
     WHERE id = NEW.schedule_block_id;

    IF v_block_is_booked IS DISTINCT FROM TRUE
       OR v_block_application_id IS DISTINCT FROM NEW.application_id
       OR v_block_job_id IS DISTINCT FROM NEW.job_id THEN
        RAISE EXCEPTION 'Interview schedule block must be booked for the same application and job';
    END IF;
END IF;
```

The NestJS code in `schedule()`:

```
Line 48:  SELECT block ... WHERE b.id=$1 ... FOR UPDATE   → reads is_booked=false
Line 50:  if (!b || b.is_booked || ...) throw SLOT_UNAVAILABLE  → passes (is_booked=false)
Line 51:  INSERT INTO interviews ...                       → TRIGGER FIRES
Line 56:  UPDATE interview_schedule_blocks SET is_booked=true  → TOO LATE
```

When the INSERT on line 51 fires the trigger, the trigger reads the block and sees `is_booked = FALSE`. The condition `v_block_is_booked IS DISTINCT FROM TRUE` evaluates to `TRUE`, and the trigger raises `EXCEPTION 'Interview schedule block must be booked for the same application and job'`.

The same issue exists in `reschedule()` (lines 103-105): the INSERT fires the trigger before the UPDATE on line 105 marks the block as booked.

**Impact:** Every `schedule()` and `reschedule()` call will fail with a PostgreSQL exception. The API is non-functional for its primary use case.

**Concrete fix:** Reorder operations: mark the block as booked BEFORE inserting the interview. In `schedule()`:

```typescript
// 1. Read block with FOR UPDATE (existing line 48)
// 2. Validate block availability (existing line 50)
// 3. UPDATE interview_schedule_blocks SET is_booked=true, booked_by=userId, booked_at=NOW(), application_id=X
//    (move line 56 BEFORE the interview INSERT)
// 4. INSERT INTO interviews (existing line 51)
// 5. INSERT INTO interview_participants (existing line 55)
```

Apply the same reordering to `reschedule()` (lines 103-105).

---

### C2. application_id comparison on unbooked block always fails

**File:** `interviews.ts:50` (schedule), `interviews.ts:101` (reschedule)
**Severity:** CRITICAL — SLOT_UNAVAILABLE thrown before INSERT is reached
**Blocks merge:** YES (subsumed by C1 but independently fatal)

**Repository evidence:**

The SQL CHECK constraint on `interview_schedule_blocks` (`10_interviews.sql:158-163`):

```sql
CONSTRAINT interview_block_booking_state CHECK (
    (is_booked = FALSE AND booked_by IS NULL AND booked_at IS NULL AND application_id IS NULL)
    OR
    (is_booked = TRUE AND booked_by IS NOT NULL AND booked_at IS NOT NULL
     AND locked_by IS NULL AND locked_until IS NULL)
)
```

When `is_booked = FALSE`, the CHECK constraint requires `application_id IS NULL`. The NestJS code on line 50 checks:

```typescript
if (!b || b.is_booked || String(b.application_id) !== applicationId || ...)
```

If the block is unbooked (`is_booked=false`), then `application_id = NULL` per the CHECK constraint. `String(null) !== applicationId` evaluates to `true`, so `SLOT_UNAVAILABLE` is thrown. Even if the booking order were fixed (C1), this comparison would still fail because unbooked blocks cannot have an `application_id`.

**Impact:** The schedule endpoint is doubly broken — the application_id check rejects valid blocks before the INSERT is even attempted.

**Concrete fix:** After reordering (C1 fix), the block will be marked as booked (with `application_id` set) before the validation check. The check should then verify the block's `application_id` matches AFTER the booking UPDATE, not before. Alternatively, validate the application_id match through the jobs JOIN in the INSERT query (which already does `j.company_id=$10`) and remove the application_id comparison from the block read:

```typescript
// After reading the block:
if (!b || b.is_booked) throw new BadRequestException('SLOT_UNAVAILABLE');
// application_id will be set by the booking UPDATE, validated by the INSERT's jobs JOIN
```

---

## 5. High Findings

### H1. Candidate-facing mutation responses expose interviewer_notes

**File:** `interviews.ts:87-88` (changeStatus returns `r.rows[0]`), `interviews.ts:106-110` (reschedule returns `next.rows[0]`)
**Severity:** HIGH — PII / confidentiality breach for candidate endpoints
**Blocks merge:** YES

**Repository evidence:**

The `confirm` endpoint (line 119) and `decline` endpoint (line 120) both call `changeStatus()`, which returns the full `UPDATE ... RETURNING *` row (line 87-88). The `UPDATE` returns all columns including `interviewer_notes` (described as "Private notes for interviewer" at `10_interviews.sql:222`), `meeting_password`, `meeting_id`, `cancellation_note`, and `location`.

While `getMine()` and `listMine()` (lines 68, 73) correctly select only safe columns, the mutation responses leak the full row back to the candidate.

**Impact:** A candidate calling `POST /me/interviews/:id/confirm` receives `interviewer_notes` in the response body. This is internal recruiter data that should never reach the candidate.

**Concrete fix:** In `changeStatus()` and `reschedule()`, when the caller is a candidate (i.e., `isCandidate.rows[0]` is true), select specific safe columns in the RETURNING clause or strip sensitive fields before returning. Example:

```typescript
const row = r.rows[0];
if (isCandidateAction) {
  const { interviewer_notes, meeting_password, meeting_id, meeting_provider, location, candidate_instructions, cancellation_note, ...safe } = row;
  return safe;
}
return row;
```

---

### H2. No validation that interview duration fits within the schedule block's time window

**File:** `interviews.ts:44-57` (schedule), `interviews.ts:92-108` (reschedule)
**Severity:** HIGH — allows scheduling interviews that extend beyond the block's end_time
**Blocks merge:** YES

**Repository evidence:**

The `interview_schedule_blocks` table has `start_time` and `end_time` columns (`10_interviews.sql:130-131`), plus a `slot_duration` column (line 132). The freeze requires: "Requested time and duration fit inside the selected block."

The NestJS code reads the block's `start_time` and `end_time` (line 48) but never validates that `scheduled_at + duration_minutes <= block.end_time`. A user could schedule a 4-hour interview in a 1-hour block.

**Impact:** Interview can be scheduled to extend beyond the interviewer's available time window, creating overlapping commitments or impossible schedules.

**Concrete fix:** After reading the block, validate:

```typescript
const blockEnd = new Date(b.end_time).getTime();
const interviewEnd = new Date(dto.scheduled_at).getTime() + dto.duration_minutes * 60 * 1000;
if (interviewEnd > blockEnd) throw new BadRequestException('DURATION_EXCEEDS_BLOCK');
```

Apply the same validation in `reschedule()`.

---

### H3. Test coverage is minimal — no integration or transition tests

**File:** `interviews.spec.ts` (22 lines, 3 tests)
**Severity:** HIGH — violates AGENTS.md validation expectations
**Blocks merge:** YES

**Repository evidence:**

`AGENTS.md:50-54`: "हर completed component के लिए prove करें कि requirement, service boundaries, security, contracts, retry/idempotency, tests और navigation links सही हैं।"

`INTERVIEW-API-IMPLEMENTATION-PLAN.md:37-44` explicitly requires:
- Same-company scope and cross-company rejection
- Application/candidate mismatch rejection
- Overlapping schedule block rejection under concurrency
- Reschedule/cancel transition and participant consistency
- Candidate confirmation rules and timezone normalization
- Atomic rollback with no orphan interview/participant/history/outbox rows

The current test file has only 3 tests: lead-time rejection, timezone/offset rejection, and malformed status rejection. All use mocked `SystemClient` and never exercise the actual SQL logic. Zero tests cover:
- Successful schedule/reschedule flow
- Transition matrix (all allowed and disallowed transitions)
- Terminal state enforcement
- Candidate vs. company authorization paths
- Participant creation
- completed_at / is_candidate_confirmed field updates
- Cancel reason enforcement
- Concurrent booking safety
- Rollback behavior

**Impact:** No automated proof that the implementation matches the frozen policy. The critical bugs (C1, C2) would have been caught by even a basic integration test.

**Concrete fix:** Create comprehensive test suite per the plan. At minimum: unit tests for all transition paths, and mock-based tests for the schedule/reschedule flows verifying correct SQL parameter ordering and field updates.

---

### H4. interview_type not validated against enum at NestJS level

**File:** `interviews.ts:45` (schedule), `interviews.ts:93` (reschedule)
**Severity:** MEDIUM → HIGH (poor error handling — raw PostgreSQL enum error leaks to client)
**Blocks merge:** NO

**Repository evidence:**

The `interview_type` enum (`02_enums.sql:330-337`) has values: `phone, video, in_person, technical_assessment, group, panel`. The NestJS code only checks `!dto.type?.trim()` (line 45) — non-empty string. An invalid type like `"skype"` would pass NestJS validation but fail at the PostgreSQL level with a raw enum error.

**Impact:** Client receives a raw PostgreSQL error message instead of a clean `VALIDATION_ERROR`.

**Concrete fix:** Add enum validation:

```typescript
const INTERVIEW_TYPES = new Set(['phone', 'video', 'in_person', 'technical_assessment', 'group', 'panel']);
if (!INTERVIEW_TYPES.has(dto.type.trim())) throw new BadRequestException('VALIDATION_ERROR');
```

---

## 6. Medium Findings

### M1. No DST invalid-time validation

**File:** `interviews.ts:31-32, 45`
**Severity:** MEDIUM — freeze requirement not met
**Blocks merge:** NO

**Repository evidence:**

The freeze (`INTERVIEW-API-FINAL-FREEZE.md:20-21`): "ISO-8601 + explicit offset input, TIMESTAMPTZ storage, valid IANA timezone; past और invalid DST times reject होंगे।"

The current validation accepts timestamps that represent non-existent local times (e.g., `2026-03-08T02:30:00-05:00` during America/New_York spring-forward). PostgreSQL's TIMESTAMPTZ storage will silently interpret this, but the freeze explicitly requires rejection.

**Impact:** Invalid DST times are accepted when they should be rejected per frozen policy.

**Concrete fix:** Use a timezone library (e.g., `luxon` or `@js-temporal/polyfill`) to validate that the local time exists in the given timezone. Alternatively, accept this as a known gap and document it.

---

### M2. round field not validated to be > 0

**File:** `interviews.ts:45` (schedule), `interviews.ts:93` (reschedule)
**Severity:** MEDIUM — SQL CHECK constraint violation
**Blocks merge:** NO

**Repository evidence:**

The SQL schema (`10_interviews.sql:207`): `round INTEGER NOT NULL DEFAULT 1 CHECK (round > 0)`. The NestJS DTO has `round?: number` and defaults to 1 (line 51: `dto.round ?? 1`). But there is no validation that a user-supplied `round` value is > 0. Sending `round: 0` or `round: -1` would violate the CHECK constraint.

**Impact:** Raw PostgreSQL error if round ≤ 0.

**Concrete fix:** Add validation: `if (dto.round !== undefined && (!Number.isInteger(dto.round) || dto.round < 1)) throw new BadRequestException('VALIDATION_ERROR')`.

---

### M3. Missing GET /companies/:companyId/interviews/:interviewId

**File:** `interviews.ts` (route structure)
**Severity:** MEDIUM — functional gap for company management
**Blocks merge:** NO

**Repository evidence:**

The `INTERVIEW-API-FINAL-FREEZE.md:34-36` states endpoints for "interview scheduling, reads, confirmation, decline, reschedule और cancellation". The company list endpoint exists but there is no single-interview read for the company side. Company users must fetch the full list and filter client-side.

**Impact:** Company users cannot efficiently read a single interview by ID.

**Concrete fix:** Add `GET /api/v1/companies/:companyId/interviews/:interviewId` with `companyActor` authorization check.

---

### M4. changeStatus returns full row even for company-side callers

**File:** `interviews.ts:87-88`
**Severity:** MEDIUM — consistency issue
**Blocks merge:** NO

**Repository evidence:**

The `changeStatus` method always returns `r.rows[0]` from `UPDATE ... RETURNING *` (line 87). For company-side callers (HR/employer), this includes `interviewer_notes`, which is appropriate. However, it also includes `candidate_instructions`, `cancellation_note`, and `location` — some of which may not be relevant for every status change.

**Impact:** Minor data over-exposure. Not a security breach (company-authorized), but inconsistent with the principle of returning only what changed.

**Concrete fix:** Consider returning a targeted column set or the minimal fields needed for the client to update its state.

---

## 7. Low Findings

### L1. listCompany uses LIMIT 100 without pagination

**File:** `interviews.ts:63`
**Severity:** LOW
**Blocks merge:** NO

Hard limit of 100 interviews with no cursor/offset pagination. Companies with >100 interviews will see truncated results. Acceptable for initial implementation.

---

### L2. No outbox event emission

**File:** `interviews.ts`
**Severity:** LOW — consistent with freeze
**Blocks merge:** NO

The freeze (`INTERVIEW-API-FINAL-FREEZE.md:25-27`) explicitly gates notification/reminder event contracts. No outbox events are emitted. This is correct per the current scope but means no audit trail beyond `updated_at`.

---

### L3. Reschedule does not validate that old interview is in a reschedulable state before locking new block

**File:** `interviews.ts:96-101`
**Severity:** LOW
**Blocks merge:** NO

The reschedule method reads the old interview (line 96) and validates the transition (line 98) before reading the new block (line 99). This is correct ordering. However, if the old interview's `application_id` doesn't match the new block's `application_id`, the check on line 101 (`String(block.application_id) !== String(old.application_id)`) would catch it. The old interview's block is not released — this is intentional (the old block stays consumed).

---

## 8. Previous Review Findings — Disposition

| Prior ID | Prior Severity | Current Status | Notes |
|---|---|---|---|
| C1 (completed_at) | CRITICAL | **FIXED** | Line 87 now sets `completed_at` correctly |
| C2 (Reschedule new row) | CRITICAL | **FIXED** | Dedicated `reschedule()` at lines 92-108 |
| H1 (Operator precedence) | HIGH | **FIXED** | Lines 81-84 use `candidateAction` variable with explicit logic |
| H2 (Missing participants) | HIGH | **FIXED** | Lines 53-55 and 104 create participant rows |
| H3 (is_candidate_confirmed) | HIGH | **FIXED** | Line 87 sets both fields on confirm |
| H4 (interviewer_notes exposed) | HIGH | **PARTIALLY FIXED** | `getMine`/`listMine` fixed (lines 68, 73) but mutation responses still leak full row (H1 above) |
| H5 (Timezone validation) | MEDIUM | **FIXED** | `validTimezone()` at line 32 + offset regex at line 45 |
| H6 (Missing single-interview read) | MEDIUM | **NOT FIXED** | Still missing — now M3 |
| H7 (Missing cancel endpoint) | LOW | **NOT FIXED** | Still uses PATCH — acceptable |
| L1 (No outbox) | LOW | **NOT FIXED** | Correct per freeze |
| L2 (LIMIT 100) | LOW | **NOT FIXED** | Still L1 above |
| L3 (Parameter numbering) | LOW | **NOT FIXED** | Still present but correct |

---

## 9. Missing Tests

Per `INTERVIEW-API-IMPLEMENTATION-PLAN.md:37-44` and `AGENTS.md:50-54`:

- [ ] Same-company and cross-company authorization
- [ ] Application/candidate/interviewer scope trigger behavior
- [ ] Overlapping schedule block rejection under concurrency
- [ ] Reschedule creates new linked row with rescheduled_from
- [ ] Every allowed and invalid status transition
- [ ] Terminal state enforcement (completed/cancelled/no_show cannot reopen)
- [ ] Candidate confirm/decline authorization (only own interviews)
- [ ] Past-slot and lead-time rejection
- [ ] Timezone and offset validation
- [ ] Cancel reason enforcement
- [ ] completed_at set on completion, NULL on other transitions
- [ ] is_candidate_confirmed / candidate_confirmed_at set on confirm
- [ ] participant row created with correct user_id and role
- [ ] Atomic rollback leaves no orphan rows
- [ ] Slot duration fits within block time window

**Current coverage:** 3 tests (lead-time, timezone, malformed status). 0% of the required matrix.

---

## 10. Required Fixes Before Merge

| # | Finding | Severity | Effort | Blocks |
|---|---|---|---|---|
| 1 | **C1+C2: Reorder block booking before interview INSERT** | CRITICAL | Medium | YES |
| 2 | **H1: Strip sensitive fields from candidate mutation responses** | HIGH | Low | YES |
| 3 | **H2: Validate interview duration fits within block window** | HIGH | Low | YES |
| 4 | **H3: Create comprehensive test suite** | HIGH | High | YES |
| 5 | **H4: Validate interview_type against enum** | MEDIUM | Low | NO |
| 6 | **M1: DST invalid-time validation** | MEDIUM | Medium | NO |
| 7 | **M2: Validate round > 0** | MEDIUM | Low | NO |
| 8 | **M3: Add single-interview company read endpoint** | MEDIUM | Low | NO |

---

## 11. Final Recommendation

**BLOCKED** — The implementation cannot merge due to:

1. **C1+C2 (CRITICAL):** Every `schedule()` and `reschedule()` call will fail at runtime. The `interviews_application_scope_guard` trigger requires `is_booked = TRUE` before the interview INSERT, but the NestJS code inserts the interview BEFORE marking the block as booked. Additionally, the `application_id` comparison on an unbooked block always evaluates to `SLOT_UNAVAILABLE` because unbooked blocks have `application_id = NULL` per the SQL CHECK constraint.

2. **H1 (HIGH):** Candidate-facing mutation responses (`confirm`, `decline`) return the full interview row including `interviewer_notes`, which is confidential recruiter-only data.

3. **H2 (HIGH):** No validation that the interview's `scheduled_at + duration_minutes` fits within the block's `start_time` to `end_time` window.

4. **H3 (HIGH):** Test coverage is 3 tests covering only input validation. Zero tests for the actual business logic, transitions, authorization, or database interaction.

The code structure, authorization model, transition matrix, route design, and reschedule architecture are sound and align with the frozen policy. The issues are concentrated in the schedule/reschedule transaction ordering and response filtering. Once C1+C2 are fixed (reorder: book block → insert interview → insert participant), the implementation should be re-reviewed.
