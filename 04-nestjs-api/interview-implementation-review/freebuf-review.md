# Interview API Implementation — Independent Review

**Auditor:** Freebuf  
**Date:** 2026-08-28  
**Scope:** `interviews.ts`, `app.module.ts`  
**SQL Baseline:** `10_interviews.sql`, `02_enums.sql`, `09_applications.sql`  
**Frozen Policy:** `INTERVIEW-API-FINAL-FREEZE.md`  
**Plan:** `INTERVIEW-API-IMPLEMENTATION-PLAN.md`  
**Build:** ✅ PASS | **Tests:** ✅ 28 suites, 84 tests ALL PASS

---

## 1. Executive Verdict

**BLOCKED — 3 CRITICAL + 3 HIGH runtime-breaking bugs**

| Severity | Count | Summary |
|----------|-------|---------|
| CRITICAL | 3 | Non-existent column reference, missing `completed_at`, missing `cancelled_reason` |
| HIGH | 3 | Reschedule in-place instead of new row, confirm doesn't set confirmation fields, buggy permission logic |
| MEDIUM | 4 | No timezone validation, no lock check, no `application_id` validation, `update` ignores `companyId` |
| LOW | 2 | Decline→cancelled semantic mismatch, no audit/outbox |

---

## 2. Files and Schema Inspected

| File | Lines | Status |
|------|-------|--------|
| `04-nestjs-api-app/src/interviews.ts` | 86 | Read |
| `04-nestjs-api-app/src/app.module.ts` | 28 | Read |
| `02-database/migrations/baseline/10_interviews.sql` | 536 | Read |
| `02-database/migrations/baseline/02_enums.sql` | 341–368 | Read |
| `02-database/migrations/baseline/09_applications.sql` | 1111 | Read |
| `INTERVIEW-API-FINAL-FREEZE.md` | 31 | Read |
| `INTERVIEW-API-IMPLEMENTATION-PLAN.md` | 40 | Read |

---

## 3. Critical Findings

### CRIT-1: `b.company_id` column does not exist on `interview_schedule_blocks`

**File:** `interviews.ts:52`  
**SQL:** `10_interviews.sql:121–184` — `interview_schedule_blocks` has NO `company_id` column

```sql
-- interview_schedule_blocks columns:
id, interviewer_id, job_id, start_time, end_time, slot_duration, timezone,
is_booked, booked_by, booked_at, locked_by, locked_until, is_recurring,
recurrence_rule, application_id, created_at, updated_at
-- NO company_id!
```

**Code:**
```js
const block = await client.query(`SELECT b.id,b.company_id,b.application_id,...`, ...)
```

**Impact:** Runtime SQL error — `column "company_id" does not exist`. Every `schedule()` call fails.  
**Fix:** Remove `b.company_id` from SELECT. Company scope is already enforced via `i.company_id=$2` JOIN.

---

### CRIT-2: `completed` status never sets `completed_at`

**File:** `interviews.ts:83` — UPDATE only sets `status` and `cancelled_reason`  
**SQL:** `10_interviews.sql:233` — CHECK constraint: `(status = 'completed' AND completed_at IS NOT NULL) OR (status <> 'completed' AND completed_at IS NULL)`

**Impact:** Every `completed` transition throws CHECK violation → runtime error.  
**Fix:** Add `completed_at=CASE WHEN $1='completed' THEN NOW() ELSE completed_at END` to UPDATE.

---

### CRIT-3: `cancelled` status via candidate decline may omit `cancelled_reason`

**File:** `interviews.ts:81` — `decline()` calls `changeStatus(id, 'cancelled', dto?.reason)`  
**SQL:** `10_interviews.sql:236` — CHECK: `status <> 'cancelled' OR NULLIF(BTRIM(cancelled_reason), '') IS NOT NULL`

**Code path:** `decline()` → `changeStatus()` → only validates reason when `status === 'cancelled'` at line 81, but the check is `if (status === 'cancelled' && !reason?.trim())` — this IS correct. HOWEVER, the candidate decline route at line 78 passes `dto?.reason` which may be `undefined` when no body is sent.

**Impact:** If candidate sends no body, `reason` is `undefined`, CHECK constraint fails → runtime error.  
**Fix:** Either require reason on decline, or set a default reason like `'candidate_declined'`.

---

## 4. High Findings

### HIGH-1: Reschedule is in-place UPDATE, not new row

**File:** `interviews.ts:83` — `UPDATE public.interviews SET status=$1`  
**Freeze:** `INTERVIEW-API-FINAL-FREEZE.md:15` — "नई interview row बनेगी और `rescheduled_from` पुरानी row को point करेगी"

**Impact:** Violates frozen policy. Old interview row is mutated instead of being preserved with `rescheduled` status and a new row created.  
**Fix:** On `rescheduled` transition: (1) set old row status to `rescheduled`, (2) INSERT new interview row with `rescheduled_from = old.id`, (3) book a new schedule block for the new row.

---

### HIGH-2: Confirm doesn't set `is_candidate_confirmed` / `candidate_confirmed_at`

**File:** `interviews.ts:83` — UPDATE only sets `status`  
**SQL:** `10_interviews.sql:229–230` — `is_candidate_confirmed BOOLEAN`, `candidate_confirmed_at TIMESTAMPTZ`

**Impact:** Confirmation fields are never populated. `is_candidate_confirmed` stays `false` forever.  
**Fix:** Add `is_candidate_confirmed=CASE WHEN $1='confirmed' THEN TRUE ELSE is_candidate_confirmed END, candidate_confirmed_at=CASE WHEN $1='confirmed' THEN NOW() ELSE candidate_confirmed_at END` to UPDATE.

---

### HIGH-3: `changeStatus` permission logic has operator precedence bug

**File:** `interviews.ts:80`
```js
if (status === 'confirmed' || status === 'cancelled' && isCandidate.rows[0]) {
  if (!isCandidate.rows[0]) throw new ForbiddenException('FORBIDDEN');
}
```

**Bug:** Due to `||` vs `&&` precedence, `status === 'confirmed'` short-circuits — ANY user can confirm ANY interview without being the candidate. The inner `if (!isCandidate.rows[0])` is unreachable for `confirmed`.

**Impact:** Non-candidate users (HR, employer) can confirm interviews on behalf of candidates, bypassing candidate consent.  
**Fix:** Rewrite as:
```js
const isConfirmed = status === 'confirmed';
const isDeclined = status === 'cancelled' && isCandidate.rows[0);
if (isConfirmed || isDeclined) {
  if (!isCandidate.rows[0]) throw new ForbiddenException('FORBIDDEN');
} else {
  await this.companyActor(client, userId, row.company_id);
}
```

---

## 5. Medium Findings

### MED-1: No IANA timezone validation

**File:** `interviews.ts:24` — `!dto.timezone?.trim()` only checks non-blank  
**Freeze:** `INTERVIEW-API-FINAL-FREEZE.md:21` — "valid IANA timezone; past और invalid DST times reject होंगे"

**Impact:** Any string passes as timezone. Invalid timezones may cause downstream errors.  
**Fix:** Validate against `Intl.DateTimeFormat().resolvedOptions().timeZone` or a timezone list.

---

### MED-2: Schedule block `locked_by/locked_until` not checked

**File:** `interviews.ts:52–54` — block query checks `is_booked` but not lock state  
**SQL:** `10_interviews.sql:82–84` — CHECK: locked blocks have `locked_by IS NOT NULL AND locked_until IS NOT NULL`

**Impact:** A block that is currently locked by another transaction could be booked simultaneously (though GIST exclusion provides partial protection).  
**Fix:** Add `AND (b.locked_by IS NULL OR b.locked_until < NOW())` to the block SELECT.

---

### MED-3: `application_id` on block not validated against request

**File:** `interviews.ts:53` — checks `String(b.application_id) !== applicationId`  
**Issue:** If `b.application_id` is `NULL` (general availability block), `String(null) !== applicationId` is `true` → throws `SLOT_UNAVAILABLE`. This is correct behavior but undocumented.

**Impact:** Minor — general availability blocks cannot be booked for specific applications. This is correct but should be documented.

---

### MED-4: `update` endpoint ignores `companyId` param

**File:** `interviews.ts:85` — `@Param('companyId')` is captured but not passed to service  
**Impact:** The PATCH route has `companyId` in the path but doesn't use it for authorization. Company scope is derived from the interview's `job_id → company_id` join instead, which is correct but the route param is misleading.

---

## 6. Low Findings

### LOW-1: `decline` maps to `cancelled` semantic

**File:** `interviews.ts:78` — `this.service.changeStatus(req.user!.sub, id, 'cancelled', dto?.reason)`

**Impact:** Candidate decline is semantically different from HR cancel. The `cancelled_reason` CHECK will require a reason, which is correct but the error message will say "cancelled" not "declined". Minor UX issue.

---

### LOW-2: No audit/outbox rows created

**File:** `interviews.ts` — no `audit_logs` INSERT, no `outbox_events` INSERT  
**Freeze:** `INTERVIEW-API-FINAL-FREEZE.md:24` — "हर mutation में scope checks, schedule-block locking, audit और approved outbox behavior लागू होगा"

**Impact:** No audit trail for interview mutations. No outbox events for downstream consumers. The freeze explicitly requires this.

---

## 7. What's Correct

| Area | Evidence | Verdict |
|------|----------|---------|
| SQL table/column names | `interviews`, `interview_schedule_blocks`, `interviewers` — all match | ✅ |
| Transition matrix | `TRANSITIONS` object matches freeze: `scheduled→{confirmed,rescheduled,cancelled,no_show}`, `confirmed→{rescheduled,completed,cancelled,no_show}`, `rescheduled→{confirmed,completed,cancelled,no_show}` | ✅ |
| Terminal states | `completed`, `cancelled`, `no_show` have no outgoing transitions | ✅ |
| `no_show` included | Present in `STATUSES` set | ✅ |
| Route paths | Match freeze: `POST/GET companies/:companyId/interviews`, `GET/POST me/interviews` | ✅ |
| `AuthGuard` wiring | `InterviewController` has `@UseGuards(AuthGuard)` | ✅ |
| `SystemClient` usage | Service uses `SystemClient` for trusted writes | ✅ |
| `companyActor` checks | Queries `users` + `companies` + `company_members` for same-company authorization | ✅ |
| Candidate scoping | `getMine` and `listMine` join on `candidate_profiles.user_id` | ✅ |
| List bounded | Both `listCompany` and `listMine` have `LIMIT 100` | ✅ |
| UUID validation | `validUuid()` regex matches v1-5 format | ✅ |
| 1-hour lead time | `validTime()` checks `t > Date.now() + 60 * 60 * 1000` | ✅ |
| `FOR UPDATE` on schedule block | `schedule()` uses `FOR UPDATE` on block row | ✅ |
| `FOR UPDATE` on interview | `changeStatus()` uses `FOR UPDATE` on interview row | ✅ |
| Transaction wrapping | `schedule()` and `changeStatus()` use `this.system.transaction()` | ✅ |
| `interviews` INSERT via SELECT | Validates `application_id`, `job_id`, `company_id` scope in one query | ✅ |
| No invented tables/columns/events | Zero inventions | ✅ |
| `app.module.ts` wiring | `InterviewController` and `InterviewService` registered | ✅ |
| App unit tests not broken | 84/84 pass after adding interviews module | ✅ |

---

## 8. Missing Tests

| # | Test | Priority |
|---|------|----------|
| T-1 | `schedule()` with non-existent `company_id` → FORBIDDEN | HIGH |
| T-2 | `schedule()` with already-booked block → SLOT_UNAVAILABLE | HIGH |
| T-3 | `changeStatus()` with invalid transition → INVALID_STATUS_TRANSITION | HIGH |
| T-4 | `getMine()` with wrong user → NOT_FOUND | HIGH |
| T-5 | `listCompany()` cross-company → returns empty (no leak) | HIGH |
| T-6 | `schedule()` with past time → VALIDATION_ERROR | MEDIUM |
| T-7 | `confirm()` by non-candidate → FORBIDDEN | MEDIUM |
| T-8 | Terminal state immutability (complete→any → INVALID_STATUS_TRANSITION) | MEDIUM |

---

## 9. Required Fixes Before Merge

| # | Severity | Fix | File:Line |
|---|----------|-----|-----------|
| 1 | 🔴 CRITICAL | Remove `b.company_id` from SELECT — column doesn't exist on `interview_schedule_blocks` | `interviews.ts:52` |
| 2 | 🔴 CRITICAL | Add `completed_at=CASE WHEN $1='completed' THEN NOW() ELSE completed_at END` to UPDATE | `interviews.ts:83` |
| 3 | 🔴 CRITICAL | Set default `cancelled_reason` when candidate declines without reason (e.g., `'candidate_declined'`) | `interviews.ts:81` |
| 4 | 🟡 HIGH | Implement reschedule as new row + `rescheduled_from` FK per frozen policy | `interviews.ts:83` |
| 5 | 🟡 HIGH | Add `is_candidate_confirmed` and `candidate_confirmed_at` fields to confirm UPDATE | `interviews.ts:83` |
| 6 | 🟡 HIGH | Fix operator precedence bug in `changeStatus` permission check | `interviews.ts:80` |
| 7 | 🟡 MEDIUM | Validate IANA timezone | `interviews.ts:24` |
| 8 | 🟡 MEDIUM | Check `locked_by/locked_until` before booking | `interviews.ts:52` |
| 9 | 🟡 MEDIUM | Add `audit_logs` INSERT to schedule/confirm/cancel mutations | `interviews.ts` |
| 10 | 🟢 LOW | Add `outbox_events` INSERT for approved interview events | `interviews.ts` |

---

## 10. Final Recommendation

**BLOCKED — Do not merge until CRIT-1, CRIT-2, and CRIT-3 are fixed.**

CRIT-1 (`b.company_id`) will cause every `schedule()` call to throw a SQL error at runtime. CRIT-2 (`completed_at`) will cause every `completed` transition to fail. CRIT-3 (`cancelled_reason`) will cause candidate declines without a reason body to fail.

After CRITICAL fixes, HIGH-1 (reschedule as new row) and HIGH-3 (permission precedence bug) must also be resolved before production use. The remaining MEDIUM/LOW items are recommended but not blocking initial merge.
