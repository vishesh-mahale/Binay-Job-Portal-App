# Interview API Implementation Review

**Reviewer:** Senior NestJS / PostgreSQL / Distributed-Systems Reviewer (opencode agent)
**Date:** 2026-08-28
**Files reviewed:** `interviews.ts`, `app.module.ts`
**Cross-referenced against:** `10_interviews.sql`, `02_enums.sql`, `09_applications.sql`, `INTERVIEW-API-FINAL-FREEZE.md`, `INTERVIEW-API-IMPLEMENTATION-PLAN.md`, `INTERVIEW-API-VERIFIED-DECISION-RECORD.md`, `INTERVIEW-API-CONSOLIDATED-DECISION.md`, `INTERVIEW-API-FINAL-DECISION-RECOMMENDATION.md`, `INTERVIEW-API-DECISION-RECOMMENDATION.md`, `AGENTS.md`

---

## 1. Executive Verdict: **BLOCKED**

Two critical correctness bugs will cause runtime constraint violations or policy violations. Several high-severity gaps must be resolved before merge.

---

## 2. Files and Schema Inspected

| File | Purpose |
|---|---|
| `02-database/migrations/baseline/02_enums.sql` | `interview_status`, `interview_type`, `meeting_provider` enums |
| `02-database/migrations/baseline/09_applications.sql` | `job_applications` table, FK constraints |
| `02-database/migrations/baseline/10_interviews.sql` | `interviews`, `interview_schedule_blocks`, `interviewers`, `interview_participants`, triggers |
| `04-nestjs-api/src/interviews.ts` | InterviewService + InterviewController |
| `04-nestjs-api/src/app.module.ts` | Module registration |
| `04-nestjs-api/src/auth.ts` | AuthGuard, RequestUser type |
| `04-nestjs-api/src/clients.ts` | SystemClient (transaction boundary) |
| `04-nestjs-api/src/database.ts` | DatabaseService.transaction() |
| `INTERVIEW-API-FINAL-FREEZE.md` | Frozen policy |
| `INTERVIEW-API-FINAL-DECISION-RECOMMENDATION.md` | Recommended routes/transitions |

---

## 3. Verified Correct Behavior

| Area | Status | Notes |
|---|---|---|
| **Enum values** | Correct | Code `STATUSES` set matches `02_enums.sql` exactly: `scheduled, confirmed, rescheduled, completed, cancelled, no_show` |
| **Transition matrix** | Correct | `TRANSITIONS` map matches freeze: scheduled→{confirmed,rescheduled,cancelled,no_show}; confirmed→{rescheduled,completed,cancelled,no_show}; rescheduled→{confirmed,completed,cancelled,no_show}; terminal states have no entry → blocked by `TRANSITIONS[x]?.has()` returning false |
| **Module registration** | Correct | `InterviewController` and `InterviewService` added to `app.module.ts` controllers/providers |
| **Schedule route** | Correct | `POST /api/v1/companies/:companyId/applications/:applicationId/interviews` matches freeze |
| **Company list route** | Correct | `GET /api/v1/companies/:companyId/interviews` matches freeze |
| **Candidate self-service routes** | Correct | `GET /me/interviews`, `GET /me/interviews/:id`, `POST /me/interviews/:id/confirm`, `POST /me/interviews/:id/decline` all match freeze |
| **PATCH company update route** | Correct | `PATCH /api/v1/companies/:companyId/interviews/:interviewId` matches freeze |
| **UUID validation** | Correct | Regex validates v1-5 UUIDs |
| **1-hour lead-time** | Correct | `validTime()` checks `t > Date.now() + 60*60*1000` — matches freeze (1 hour) |
| **Same-company authorization (companyActor)** | Correct | Checks active user + company not deleted + (owner OR active member with employer/hr role) |
| **Schedule block locking** | Correct | `FOR UPDATE` lock within transaction; `is_booked` check before booking; block validated for application/interviewer/company match |
| **Natural idempotency** | Correct | `schedule_block_id` uniqueness + `is_booked` check + `FOR UPDATE` serialization prevents double-booking |
| **Cancel reason enforcement** | Correct | Both NestJS (`REASON_REQUIRED`) and SQL (`interview_cancellation_state` CHECK) enforce non-empty reason |
| **Build** | Correct | `npm run build` passes cleanly |
| **Existing tests** | Correct | All 28 test suites (84 tests) pass |
| **Foreign key assumptions** | Correct | INSERT query correctly joins `job_applications`→`jobs` for company scope, and validates `schedule_block_id` existence |
| **No PII leakage to company side** | Correct | `listCompany` returns `i.*` but is company-scoped (only authorized company members) |

---

## 4. Critical Findings

### C1. `completed_at` not set on completion — will violate SQL CHECK constraint

**File:** `interviews.ts:80`
**Impact:** Runtime exception — `interview_completion_state` CHECK constraint will reject the UPDATE.

The SQL schema enforces:
```sql
CONSTRAINT interview_completion_state CHECK (
    (status = 'completed' AND completed_at IS NOT NULL)
    OR (status <> 'completed' AND completed_at IS NULL)
)
```

The UPDATE statement only sets `status`, `cancelled_reason`, and `updated_at`:
```sql
UPDATE public.interviews SET status=$1::public.interview_status,
  cancelled_reason=CASE WHEN $1='cancelled' THEN $2 ELSE cancelled_reason END,
  updated_at=NOW() WHERE id=$3 RETURNING *
```

When `status='completed'`, `completed_at` remains NULL, violating the constraint. The INSERT also sets `status='scheduled'` with `completed_at` NULL which is fine, but the transition to `completed` will fail.

**Recommended fix:** Extend the UPDATE to set `completed_at` when status is 'completed':
```sql
completed_at = CASE WHEN $1='completed' THEN NOW() ELSE completed_at END
```

### C2. Reschedule does NOT create a new interview row — violates frozen policy

**File:** `interviews.ts:70-83`
**Impact:** Policy violation — historical interview data is overwritten; `rescheduled_from` is never populated.

The FINAL-FREEZE states: "Reschedule: नई interview row बनेगी और rescheduled_from पुरानी row को point करेगी" (New interview row will be created and rescheduled_from will point to the old row).

The VERIFIED-DECISION-RECORD states: "Reschedule में पुरानी row overwrite नहीं होगी; interviews.rescheduled_from के जरिए नई interview row बनेगी."

The current `changeStatus` method simply sets `status = 'rescheduled'` on the existing row. It does not:
1. Create a new interview row with the updated schedule
2. Set `rescheduled_from` on the new row
3. Preserve the original interview's `scheduled_at`, `duration_minutes`, `meeting_link`, etc.

This means a "rescheduled" interview loses its original schedule data entirely. The `rescheduled_from` column (line 233 of `10_interviews.sql`) exists specifically for audit trail purposes and is never used.

**Recommended fix:** Implement a dedicated `reschedule` method that:
1. Reads the current interview
2. Creates a new interview row with the new schedule details
3. Sets `rescheduled_from = original_interview.id` on the new row
4. Sets `reschedule_count = old.reschedule_count + 1` on the old row
5. Optionally updates the old row's status to 'rescheduled'

---

## 5. High / Medium / Low Findings

### H1. Operator precedence in candidate authorization — misleading and fragile

**File:** `interviews.ts:76`
**Severity:** High (correctness risk — currently works by accident)

```typescript
if (status === 'confirmed' || status === 'cancelled' && isCandidate.rows[0]) {
  if (!isCandidate.rows[0]) throw new ForbiddenException('FORBIDDEN');
}
```

JavaScript operator precedence evaluates this as:
```typescript
if (status === 'confirmed' || (status === 'cancelled' && isCandidate.rows[0]))
```

This works correctly for all cases by coincidence:
- `confirmed` → outer is `true`, inner check blocks non-candidates
- `cancelled` + candidate → outer is `true`, inner check passes
- `cancelled` + non-candidate → outer is `false`, falls to `companyActor` (correct)
- Other statuses → outer is `false`, falls to `companyActor` (correct)

But the intent is obscured. Any future refactor could break this.

**Recommended fix:** Add explicit parentheses and simplify:
```typescript
const isCandidateAction = status === 'confirmed' || status === 'cancelled';
if (isCandidateAction) {
  if (!isCandidate.rows[0]) throw new ForbiddenException('FORBIDDEN');
} else {
  await this.companyActor(client, userId, row.company_id);
}
```

### H2. Missing `interview_participants` row on schedule

**File:** `interviews.ts:49`
**Severity:** High (functional gap — feedback workflow broken)

The schedule method creates the interview but never inserts into `interview_participants`. The SQL schema's `interview_feedback` table requires a `participant_id` FK to `interview_participants`. Without participants, feedback submission will be impossible.

The `interviewer_id` is provided in the DTO and validated against the schedule block, but the link between interview and interviewer in the participants table is never established.

**Recommended fix:** After inserting the interview, insert an `interview_participants` row:
```sql
INSERT INTO public.interview_participants (interview_id, user_id, role, is_primary)
VALUES ($1, $2, 'interviewer', true)
```
Where `$2` is the interviewer's `user_id` (obtained from the `interviewers` table).

### H3. `is_candidate_confirmed` and `candidate_confirmed_at` never updated

**File:** `interviews.ts:80`
**Severity:** High (data inconsistency)

The `interviews` table has:
- `is_candidate_confirmed BOOLEAN NOT NULL DEFAULT false`
- `candidate_confirmed_at TIMESTAMPTZ`

When a candidate confirms (status → 'confirmed'), the UPDATE does not set these fields. They remain at their defaults (`false`/`NULL`), creating an inconsistency: the interview status says 'confirmed' but the dedicated confirmation tracking fields say otherwise.

While this won't cause a constraint violation (the columns are independent of status), it breaks any downstream logic that relies on these fields.

**Recommended fix:** Update these fields when status transitions to 'confirmed' from a candidate action:
```sql
is_candidate_confirmed = CASE WHEN $1='confirmed' THEN true ELSE is_candidate_confirmed END,
candidate_confirmed_at = CASE WHEN $1='confirmed' THEN NOW() ELSE candidate_confirmed_at END
```

### H4. `interviewer_notes` exposed to candidates via `/me/interviews`

**File:** `interviews.ts:61-68`
**Severity:** High (confidentiality breach)

The `getMine` and `listMine` queries return `i.*`, which includes `interviewer_notes`. The SQL schema comments this field as "Private notes for interviewer" (line 222 of `10_interviews.sql`). Exposing internal interviewer notes to candidates is a confidentiality violation.

**Recommended fix:** Select specific columns instead of `i.*` for candidate-facing queries, excluding at minimum `interviewer_notes`, `meeting_password`, and potentially `meeting_id`:
```sql
SELECT i.id, i.application_id, i.job_id, i.candidate_id, i.title, i.type,
       i.round, i.scheduled_at, i.duration_minutes, i.timezone, i.meeting_link,
       i.status, i.cancelled_reason, i.created_at, i.updated_at
```

### H5. Timezone validation incomplete — no IANA timezone check

**File:** `interviews.ts:30,43`
**Severity:** Medium

The freeze requires: "ISO-8601 + explicit offset input, TIMESTAMPTZ storage, valid IANA timezone; past and invalid DST times reject होंगे."

Current validation:
- `validTime()` checks parseability and 1-hour lead time
- `dto.timezone` is checked for non-empty trim
- But there is NO validation that `timezone` is a valid IANA timezone string (e.g., "America/New_York")
- There is NO validation that `scheduled_at` contains an explicit offset (strings without offset like `"2026-08-28T10:00:00"` will be parsed as server-local time, not the user's timezone)

**Recommended fix:**
1. Validate `scheduled_at` contains an explicit offset (reject strings that `Date.parse` interprets without offset)
2. Validate `timezone` against a known IANA timezone list (or use a library like `Intl` to check)
3. Consider validating that the DST transition is valid for the given timezone/time combination

### H6. Missing `GET /companies/:companyId/interviews/:interviewId`

**File:** `interviews.ts` (absent route)
**Severity:** Medium (functional gap)

The FINAL-DECISION-RECOMMENDATION.md (D1) recommends:
```
GET /api/v1/companies/:companyId/interviews/:interviewId
```

This endpoint is missing. Company-side authorized users cannot read a single interview by ID; they must fetch the full list and filter client-side. This is a functional gap for the company management workflow.

### H7. Missing dedicated cancel endpoint

**File:** `interviews.ts` (route structure)
**Severity:** Low (deviation from recommendation, not freeze)

The FINAL-DECISION-RECOMMENDATION.md (D1) recommends:
```
POST /api/v1/companies/:companyId/interviews/:interviewId/cancel
```

The implementation uses `PATCH` with a status body to cancel. Functionally equivalent but deviates from the recommended route structure. Acceptable since the freeze does not mandate specific route shapes, only that cancellation is possible.

### L1. No outbox event emission for interview mutations

**File:** `interviews.ts`
**Severity:** Low (consistent with freeze)

The FINAL-FREEZE says "Interview notification/reminder event contracts" are gated. The implementation correctly does NOT emit outbox events. However, this means there is no audit trail for interview mutations beyond `updated_at`. This is acceptable for the current scope.

### L2. `listCompany` uses `LIMIT 100` without pagination

**File:** `interviews.ts:58`
**Severity:** Low

Hard limit of 100 interviews with no cursor-based pagination. For companies with many interviews, this will silently truncate results. Acceptable for initial implementation but should be addressed before production scale.

### L3. INSERT query parameter $10 references `companyId` but is placed in the `jobs` JOIN

**File:** `interviews.ts:49`
**Severity:** Low (correctness — works but confusing)

The parameter `$10` is `companyId` and is used in `j.company_id=$10`. While this works correctly (the JOIN ensures the application's job belongs to the company), the parameter numbering is non-sequential in the SQL ($1-$9 in the INSERT columns, $10 in the WHERE clause JOIN). This is valid SQL but reduces readability.

---

## 6. Missing Tests

There is **no `interviews.spec.ts`** file. Every other module in the codebase has a corresponding `.spec.ts` file. The implementation plan's "Required tests" section explicitly requires:

- [ ] Same-company and cross-company authorization
- [ ] Application/candidate/interviewer scope trigger behavior
- [ ] Concurrent double-booking and stale lock recovery
- [ ] Reschedule creates a new linked row
- [ ] Every allowed/invalid/terminal transition
- [ ] Candidate confirm/decline authorization
- [ ] Past-slot/timezone/lead-time validation
- [ ] Atomic rollback of interview, participants, audit and approved outbox rows

**None of these tests exist.** This is a mandatory gap per `AGENTS.md`: "हर completed component के लिए prove करें कि requirement, service boundaries, security, contracts, retry/idempotency, tests और navigation links सही हैं."

---

## 7. Required Fixes Before Merge

| # | Finding | Severity | Action |
|---|---|---|---|
| 1 | C1: `completed_at` not set on completion | CRITICAL | Extend UPDATE to set `completed_at = NOW()` when status='completed' |
| 2 | C2: Reschedule does not create new row | CRITICAL | Implement proper reschedule: new row + `rescheduled_from` link + increment `reschedule_count` |
| 3 | H1: Operator precedence in candidate auth | HIGH | Refactor condition with explicit parentheses |
| 4 | H2: Missing `interview_participants` on schedule | HIGH | Insert participant row after interview creation |
| 5 | H3: `is_candidate_confirmed` never updated | HIGH | Update confirmation fields on candidate confirm action |
| 6 | H4: `interviewer_notes` exposed to candidates | HIGH | Select specific columns for candidate-facing queries |
| 7 | H5: Timezone validation incomplete | MEDIUM | Validate IANA timezone + explicit offset in `scheduled_at` |
| 8 | H6: Missing single-interview company read | MEDIUM | Add `GET /companies/:companyId/interviews/:interviewId` |
| 9 | Missing `interviews.spec.ts` | HIGH | Create comprehensive test suite covering all required scenarios |

---

## 8. Final Recommendation

**BLOCKED** — The implementation cannot be merged in its current state due to:

1. **C1** will cause a runtime exception when any interview is marked `completed` (CHECK constraint violation).
2. **C2** violates the frozen reschedule policy and will cause data loss of historical interview schedules.
3. **No test file exists** for the interview module, violating `AGENTS.md` validation expectations.

The codebase structure, authorization model, route design, and transition matrix are fundamentally sound. The blocking issues are concentrated in the `changeStatus` method (lines 70-83) and the `schedule` method's omission of participant creation. Once these are fixed, the implementation should be re-reviewed with a focus on the test suite.
