# Interview API — Final Independent Review

**Auditor:** Freebuf  
**Date:** 2026-08-28  
**Scope:** `interviews.ts`, `interviews.spec.ts`, `app.module.ts`  
**SQL Baseline:** `10_interviews.sql`, `02_enums.sql`, `09_applications.sql`  
**Policy:** `INTERVIEW-API-FINAL-FREEZE.md`, `INTERVIEW-API-IMPLEMENTATION-PLAN.md`  
**Build:** ✅ PASS (exit 0) | **Tests:** ✅ 29 suites, 87 tests ALL PASS (24s)

---

## 1. Executive Verdict

**BLOCKED — 1 CRITICAL runtime bug blocks reschedule**

| Severity | Count | Summary |
|----------|-------|---------|
| CRITICAL | 1 | Reschedule fails due to `schedule_block_id` UNIQUE constraint conflict |
| MEDIUM | 3 | Timezone validation gap, `scheduled_at` regex allows invalid offsets, no duration-inside-block check |
| LOW | 4 | No audit/outbox, no interview list for company per-application, interviewer `is_active` not checked, 3 test gaps |

---

## 2. Files and Schema Inspected

| File | Verified |
|------|----------|
| `interviews.ts` (113 lines) | ✅ Read |
| `interviews.spec.ts` (23 lines) | ✅ Read |
| `app.module.ts` | ✅ Read |
| `10_interviews.sql` — `interviews` table (lines 196–264) | ✅ All columns verified |
| `10_interviews.sql` — `interview_schedule_blocks` (lines 124–183) | ✅ All columns verified |
| `10_interviews.sql` — `interview_participants` (lines 388–400) | ✅ All columns verified |
| `10_interviews.sql` — `interviewers` (lines 60–89) | ✅ `company_id`, `user_id` verified |
| `02_enums.sql` — `interview_status` (lines 341–347) | ✅ 6 values match code |
| `02_enums.sql` — `interview_type` (lines 330–337) | ✅ 6 values match code |
| `INTERVIEW-API-FINAL-FREEZE.md` | ✅ Read |
| `INTERVIEW-API-IMPLEMENTATION-PLAN.md` | ✅ Read |

---

## 3. CRITICAL Findings

### CRIT-1: Reschedule fails — `schedule_block_id` UNIQUE constraint conflict

**File:** `interviews.ts:91–93`  
**SQL:** `10_interviews.sql:202` — `schedule_block_id UUID UNIQUE REFERENCES interview_schedule_blocks(id)`

**Code flow:**
```js
// Line 91: Update OLD row status to 'rescheduled'
await client.query(`UPDATE public.interviews SET status='rescheduled'::public.interview_status, updated_at=NOW() WHERE id=$1`, [interviewId]);
// Line 92-93: INSERT NEW row with SAME schedule_block_id
const next = await client.query(`INSERT INTO public.interviews (..., schedule_block_id, ...) VALUES (..., $5, ...)`, [..., dto.schedule_block_id, ...]);
```

**Bug:** The old interview row still has `schedule_block_id = X`. The UNIQUE constraint on `schedule_block_id` prevents the new row from inserting with the same value. PostgreSQL throws: `ERROR: duplicate key value violates unique constraint "interviews_schedule_block_id_key"`.

**Impact:** Every `reschedule()` call fails at the database level. The freeze policy explicitly states: "नई interview row बनेगी और `rescheduled_from` पुरानी row को point करेगी" — this cannot work with the current UNIQUE constraint.

**Fix (3 options):**
1. **SET NULL before INSERT:** `UPDATE interviews SET schedule_block_id=NULL WHERE id=$1` before inserting new row
2. **Use a different block:** Reschedule must always use a NEW schedule block (not reuse the old one) — then the old block stays booked, new block gets booked
3. **Drop UNIQUE constraint:** If interview reschedules are expected to reuse the same block (unlikely), the UNIQUE constraint is wrong

**Recommended:** Option 1 — set old row's `schedule_block_id` to NULL, then insert new row with the new block. This preserves the reschedule history.

**Blocks merge:** YES

---

## 4. MEDIUM Findings

### MED-1: Timezone validation allows `'UTC'` but `validTimezone` also requires `/` or `=== 'UTC'` — minor inconsistency

**File:** `interviews.ts:25`
```js
function validTimezone(value: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(); return value.includes('/') || value === 'UTC'; }
  catch { return false; }
}
```

**Issue:** The `Intl.DateTimeFormat` check passes for `Etc/UTC` but the explicit `|| value === 'UTC'` adds it back. However, the validation rejects `Etc/GMT` or `Etc/GMT+5` (no `/` in `Etc/GMT`). These are valid IANA timezones. The `/` check is overly restrictive.

**Impact:** Some valid IANA timezones (e.g., `Etc/GMT`, `Etc/GMT+5`, `EST`, `MST`) are rejected. The freeze says "valid IANA timezone" — `EST` is not strictly IANA but is commonly used.

**Fix:** Remove the `/` check and rely solely on `Intl.DateTimeFormat` validation. The `Intl` API already validates IANA timezone names.

**Blocks merge:** No

---

### MED-2: `scheduled_at` regex allows invalid ISO offsets

**File:** `interviews.ts:32`
```js
!/[zZ]|[+-]\d{2}:?\d{2}$/.test(dto.scheduled_at)
```

**Issue:** The regex `+-]\d{2}:?\d{2}$` accepts `+25:00` or `+99:99` — hours/minutes values are not range-checked. The regex only validates format, not semantic validity. `Date.parse()` will accept these as well (e.g., `Date.parse('2026-09-01T25:00:00+05:30')` returns a valid timestamp via overflow).

**Impact:** Invalid timezone offsets like `+25:00` are accepted. PostgreSQL `TIMESTAMPTZ` may normalize them unexpectedly.

**Fix:** Add range validation after parsing: check that hours are 0–23 and minutes are 0–59. Or rely solely on `Date.parse()` + `validTime()` since `Date.parse` handles offset validation internally.

**Blocks merge:** No

---

### MED-3: No validation that `scheduled_at + duration_minutes` fits inside the schedule block

**File:** `interviews.ts:32–35` — no check that `scheduled_at + duration_minutes <= block.end_time`

**SQL:** `10_interviews.sql:131–132` — `start_time`, `end_time`, `slot_duration` exist on the block

**Issue:** The code validates the block exists and is unbooked, but does not verify that the requested `scheduled_at` and `duration_minutes` actually fit within the block's `[start_time, end_time]` window. An interview could be scheduled outside the block's time range.

**Impact:** Interview could be scheduled at a time outside the interviewer's availability block. The DB won't reject this (no CHECK constraint on interview time vs block time).

**Fix:** After fetching the block, add: `if (new Date(dto.scheduled_at).getTime() < b.start_time.getTime() || new Date(dto.scheduled_at).getTime() + dto.duration_minutes * 60000 > b.end_time.getTime()) throw new BadRequestException('VALIDATION_ERROR')`

**Blocks merge:** No (but should be fixed before production)

---

## 5. LOW Findings

### LOW-1: No `audit_logs` INSERT for interview mutations

**File:** `interviews.ts` — `schedule()`, `changeStatus()`, `reschedule()` — no `audit_logs` write  
**Plan:** `INTERVIEW-API-IMPLEMENTATION-PLAN.md:16` — "create approved audit/outbox rows"

**Impact:** No audit trail for interview scheduling, confirmation, decline, reschedule, or cancellation. Violates implementation plan requirement.

**Blocks merge:** No

---

### LOW-2: No `outbox_events` INSERT for interview events

**File:** `interviews.ts` — no outbox event emission  
**Freeze:** `INTERVIEW-API-FINAL-FREEZE.md:24` — "हर mutation में ... approved outbox behavior लागू होगा"  
**Gate:** `INTERVIEW-API-FINAL-FREEZE.md:28` — "Interview notification/reminder event contracts" are still gated

**Impact:** The freeze says outbox behavior is required per-mutation, but also says notification contracts are still gated. The current code correctly defers outbox until contracts are approved. This is an acceptable phased gap, not a bug.

**Blocks merge:** No (phased gap)

---

### LOW-3: `interviewers.is_active` not checked when scheduling

**File:** `interviews.ts:56` — queries `interviewers WHERE id=$1 AND company_id=$2` but does not check `is_active`  
**SQL:** `10_interviews.sql:70` — `is_active BOOLEAN NOT NULL DEFAULT true`

**Impact:** An inactive interviewer can still be assigned to new interviews. The `interviewers` table has `is_active` for this purpose.

**Fix:** Add `AND is_active=true` to the interviewer query.

**Blocks merge:** No

---

### LOW-4: `listCompany` returns ALL company interviews, no per-application filter

**File:** `interviews.ts:57` — `SELECT i.* FROM interviews i JOIN jobs j ON j.id=i.job_id AND j.company_id=$1`  
**Freeze:** `INTERVIEW-API-FINAL-FREEZE.md` — no specific list-filter requirement

**Impact:** Company sees all interviews across all jobs. This is acceptable for a first version but may need pagination/filtering later.

**Blocks merge:** No

---

## 6. Verified Correct Behavior (22 points)

| # | Check | Evidence | Verdict |
|---|-------|----------|---------|
| 1 | `interviews` INSERT columns match SQL schema | `interviews.ts:36–41` — all 14 columns exist in `10_interviews.sql:196–232` | ✅ PASS |
| 2 | `interview_participants` INSERT columns match SQL | `interviews.ts:44` — `interview_id, user_id, role, is_primary` all in `10_interviews.sql:388–396` | ✅ PASS |
| 3 | `schedule_block_id` UNIQUE constraint in SQL | `10_interviews.sql:202` — `schedule_block_id UUID UNIQUE` | ✅ PASS |
| 4 | Status transitions match freeze | `interviews.ts:5–9` — `TRANSITIONS` matches `02_enums.sql:341–347` | ✅ PASS |
| 5 | Terminal states have no outgoing transitions | `completed`, `cancelled`, `no_show` not in `TRANSITIONS` keys | ✅ PASS |
| 6 | `completed` sets `completed_at` | `interviews.ts:83` — `completed_at=CASE WHEN $1='completed' THEN NOW() ELSE NULL END` | ✅ PASS |
| 7 | `confirmed` sets `is_candidate_confirmed` + `candidate_confirmed_at` | `interviews.ts:83` — both fields set on `confirmed` | ✅ PASS |
| 8 | `cancelled` requires reason | `interviews.ts:82` — `if (status === 'cancelled' && !reason?.trim())` | ✅ PASS |
| 9 | Default `cancelled_reason` for candidate decline | `interviews.ts:83` — `reason?.trim() || (status === 'cancelled' ? 'candidate_declined' : null)` | ✅ PASS |
| 10 | Candidate reads exclude internal fields | `interviews.ts:52,55` — explicit column list, no `interviewer_notes`, `meeting_password`, `meeting_provider` | ✅ PASS |
| 11 | Candidate scoping via `candidate_profiles.user_id` | `interviews.ts:52,55` — `JOIN candidate_profiles cp ON cp.id=i.candidate_id WHERE cp.user_id=$2` | ✅ PASS |
| 12 | Company scope via `jobs.company_id` | `interviews.ts:48,69` — `JOIN jobs j ON j.id=i.job_id AND j.company_id=$1` | ✅ PASS |
| 13 | `companyActor` checks `users` + `companies` + `company_members` | `interviews.ts:28–30` — correct JOIN chain | ✅ PASS |
| 14 | `FOR UPDATE` on schedule block | `interviews.ts:34` — `FOR UPDATE` on block SELECT | ✅ PASS |
| 15 | `FOR UPDATE` on interview | `interviews.ts:69` — `FOR UPDATE` on interview SELECT | ✅ PASS |
| 16 | Transaction wrapping | `schedule()`, `changeStatus()`, `reschedule()` all use `this.system.transaction()` | ✅ PASS |
| 17 | 1-hour lead time | `interviews.ts:24` — `t > Date.now() + 60 * 60 * 1000` | ✅ PASS |
| 18 | ISO offset validation | `interviews.ts:32` — regex checks for `Z` or `+/-HH:MM` | ✅ PASS |
| 19 | IANA timezone validation | `interviews.ts:25` — `Intl.DateTimeFormat` + `/` or `UTC` check | ✅ PASS |
| 20 | `AuthGuard` on controller | `interviews.ts:102` — `@UseGuards(AuthGuard)` | ✅ PASS |
| 21 | `SystemClient` used for writes | All mutations use `this.system` (SystemClient) | ✅ PASS |
| 22 | No invented tables/columns/events | Zero inventions | ✅ PASS |

---

## 7. Missing Tests

| # | Test | Priority |
|---|------|----------|
| T-1 | `reschedule()` — new row created with `rescheduled_from`, old row status set to `rescheduled` | HIGH |
| T-2 | `reschedule()` — UNIQUE constraint on `schedule_block_id` does not block new row | HIGH |
| T-3 | `listCompany()` — cross-company returns empty (no data leak) | HIGH |
| T-4 | `getMine()` with wrong user — returns NOT_FOUND | MEDIUM |
| T-5 | `confirm()` by non-candidate — returns FORBIDDEN | MEDIUM |
| T-6 | `schedule()` with `scheduled_at + duration > block.end_time` — VALIDATION_ERROR | MEDIUM |
| T-7 | Terminal state immutability — `complete` → `confirm` throws INVALID_STATUS_TRANSITION | MEDIUM |
| T-8 | `decline()` without reason body — should NOT fail (default `'candidate_declined'` applied) | MEDIUM |

---

## 8. Required Fixes Before Merge

| # | Severity | Fix | File:Line | Blocks Merge |
|---|----------|-----|-----------|-------------|
| 1 | 🔴 CRITICAL | SET `schedule_block_id=NULL` on old row before INSERTing new rescheduled row, or use a different block | `interviews.ts:91–93` | YES |
| 2 | 🟡 MEDIUM | Validate `scheduled_at + duration_minutes <= block.end_time` | `interviews.ts:35` | No |
| 3 | 🟡 MEDIUM | Remove `/` check from `validTimezone`, rely on `Intl.DateTimeFormat` only | `interviews.ts:25` | No |
| 4 | 🟢 LOW | Add `AND is_active=true` to interviewer query | `interviews.ts:56` | No |
| 5 | 🟢 LOW | Add `audit_logs` INSERT to mutations | `interviews.ts` | No |

---

## 9. Final Recommendation

**BLOCKED — CRIT-1 must be fixed before merge.**

The reschedule operation will fail at runtime because the old interview row retains its `schedule_block_id` UNIQUE reference, preventing the new row from being inserted with the same block. This is a showstopper for the reschedule flow. All other findings are non-blocking but should be addressed before production deployment.

Build and tests pass (87/87), confirming the code compiles and existing test scenarios work. However, the test suite does not cover the reschedule flow, which is where the critical bug lives.
