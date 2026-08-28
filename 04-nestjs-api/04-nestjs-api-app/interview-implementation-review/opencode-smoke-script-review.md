# Interview Integration Smoke Script — Independent Review

**Reviewer:** opencode  
**Script:** `04-nestjs-api/04-nestjs-api-app/scripts/interview-integration-smoke.js`  
**Date:** 2026-08-28

---

## Final Verdict: **PASS WITH FIXES**

Script design is fundamentally sound — production guard, opt-in flag, rollback-safe transaction, and schema-aware fixture query are all correct. However, the invariant verification is too shallow to qualify as a true integration invariant test, and a few gaps need attention.

---

## Detailed Findings

### 1. Production Safety Guard — PASS

**Line 9:** `if (process.env.NODE_ENV === 'production') throw new Error(...)`  
**Line 5-8:** `RUN_INTERVIEW_INTEGRATION !== 'true'` exits early with code 0.

Two-layer protection: explicit opt-in required + production environment rejected. Correct.

**Minor note:** The production guard relies solely on `NODE_ENV`. A DATABASE_URL containing production hostnames (e.g., `db.prod.supabase.co`) would not be blocked if `NODE_ENV` is misconfigured. This is acceptable for a dev/test smoke script but worth noting.

---

### 2. Transaction Rollback — PASS

```
Line 16:  await client.query('BEGIN');
Line 44:  await client.query('ROLLBACK');   // success path
Line 46:  await client.query('ROLLBACK');   // catch path
Line 47:  finally { await client.end(); }
```

Transaction always rolls back. No test data leaks. Correct.

---

### 3. No Permanent Data Retention — PASS

All writes (`UPDATE interview_schedule_blocks`, `INSERT INTO interviews`, `INSERT INTO interview_participants`) happen inside the `BEGIN`/`ROLLBACK` transaction. The `ROLLBACK` at line 44/46 undoes everything. Correct.

---

### 4. Fixture Query — Columns & Tables — PASS WITH NOTES

| Table | Columns Used | Schema Match |
|---|---|---|
| `companies` | `id` | ✅ |
| `jobs` | `id`, `company_id`, `deleted_at` | ✅ |
| `job_applications` | `id`, `job_id`, `candidate_id`, `is_guest` | ✅ |
| `candidate_profiles` | `id`, `deleted_at` | ✅ |
| `interviewers` | `id`, `company_id`, `user_id`, `is_active` | ✅ |
| `interview_schedule_blocks` | `id`, `interviewer_id`, `job_id`, `is_booked`, `application_id`, `start_time`, `end_time` | ✅ |
| `users` | `id`, `status`, `deleted_at` | ✅ |

All columns exist in their respective tables. JOIN conditions are valid.

**Minor note (LOW):** Line 30 — `JOIN public.interviewers it ON it.id=i.id` is a redundant self-join. The row from `i` is already sufficient. This has no correctness impact but adds unnecessary complexity.

---

### 5. Interview Schedule Block Trigger/Constraint Satisfaction — PASS

The `validate_interview_schedule_block_scope()` trigger (`10_interviews.sql:264-294`) fires on `UPDATE OF interviewer_id, job_id, application_id`. The UPDATE on line 37 sets `application_id` and `job_id`.

**Trigger checks:**
- `interviewer.company_id` == `jobs.company_id` → ✅ (fixture query JOINs `jobs` on `company_id`)
- Both exist and are valid → ✅ (fixture filters on active records)

The `interview_block_booking_state` CHECK (`10_interviews.sql:158-163`) requires:
- When `is_booked=TRUE`: `booked_by IS NOT NULL AND booked_at IS NOT NULL AND locked_by IS NULL AND locked_until IS NULL`

**UPDATE sets:** `is_booked=true, application_id=$1, job_id=$2, booked_by=$3, booked_at=NOW(), locked_by=NULL, locked_until=NULL` → ✅ Satisfies CHECK.

The `interview_block_application_job_fk` FK (`10_interviews.sql:172-174`) requires `(application_id, job_id)` to reference `job_applications(id, job_id)`. Fixture ensures this pair exists. ✅

---

### 6. Interview INSERT Trigger/Constraint Satisfaction — PASS

The `validate_interview_application_scope()` trigger (`10_interviews.sql:300-363`) fires on INSERT.

**Trigger checks:**
1. `application_id + job_id` match in `job_applications` → ✅ (fixture selects valid pair)
2. For non-guest apps: `candidate_id` matches application's `candidate_id` → ✅ (fixture uses `a.candidate_id`)
3. `schedule_block_id` must be booked for same `(application_id, job_id)` → ✅ (UPDATE on line 37 set these before INSERT on line 39)

Other constraints satisfied:
- `interview_title_nonblank` (line 245): title = 'Integration smoke' → ✅
- `interview_timezone_nonblank` (line 246): timezone = 'UTC' → ✅
- `interview_completion_state` (line 248-251): status='scheduled' ≠ 'completed', so `completed_at IS NULL` required → ✅ (column default is NULL)
- `interview_candidate_confirmation_state` (line 255-258): `is_candidate_confirmed=FALSE` (default), `candidate_confirmed_at=NULL` → ✅
- `interview_application_job_fk` (line 242-244): `(application_id, job_id)` references `job_applications(id, job_id)` → ✅
- `interview_type` enum value `technical_assessment` → ✅ (valid per `02_enums.sql:334`)
- `round` = 1, `duration_minutes` = 30 → ✅ (`CHECK (round > 0)`, `CHECK (duration_minutes > 0)`)

---

### 7. Participant Linkage — PASS

**Line 40:** `INSERT INTO interview_participants (interview_id, user_id, role, is_primary) VALUES ($1, $2, 'interviewer', true)`

- `interview_id` → references `interviews(id)` via FK → ✅ (just inserted)
- `user_id` → references `users(id)` → ✅ (interviewer's user_id from fixture)
- `role` = 'interviewer' → satisfies `CHECK (role = BTRIM(role) AND role <> '')` → ✅
- `unique_interview_participant` UNIQUE(interview_id, user_id) → ✅ (fresh insert)
- `idx_interview_participants_primary` partial unique on `(interview_id) WHERE is_primary=true` → ✅ (only one primary per interview)

---

### 8. Existing Data Leak/Damage — PASS

The fixture query is read-only (`SELECT`). All writes are inside a rolled-back transaction. No existing company, job, application, or user data is permanently modified. Correct.

---

### 9. SSL & DATABASE_URL Handling — PASS WITH NOTE

**Line 13:** `ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }`

- Default: SSL enabled with `rejectUnauthorized: false` (accepts self-signed certs). Acceptable for dev/test Supabase.
- `DATABASE_SSL=false` disables SSL entirely. Fine for local PostgreSQL.
- `DATABASE_URL` validated on line 12. ✅

**Note:** `rejectUnauthorized: false` disables certificate verification. Not a security issue for dev/test smoke scripts, but should never appear in production code paths.

---

### 10. Destructive Statements Outside Transaction — PASS

The only statements outside the transaction are:
- `client.connect()` (line 14)
- `client.end()` (line 47)
- SELECT in fixture query (line 17-31) — read-only, no side effects

No destructive DDL or DML outside the transaction. ✅

---

### 11. Skip Conditions — PASS

| Condition | Line | Behavior |
|---|---|---|
| `RUN_INTERVIEW_INTEGRATION !== 'true'` | 5-8 | `exit(0)` — clean skip |
| `NODE_ENV === 'production'` | 9 | `throw` — blocks execution |
| `!DATABASE_URL` | 12 | `throw` — blocks execution |
| No compatible fixture | 32 | `ROLLBACK` + `return` — clean skip |
| Block too short for 30-min interview | 36 | `ROLLBACK` + `return` — clean skip |

All skip paths properly clean up (ROLLBACK) and exit cleanly. ✅

---

### 12. Error Path Rollback — PASS

**Line 46:** `catch (error) { await client.query('ROLLBACK'); throw error; }`  
**Line 48-49:** `.catch(...)` logs `BLOCKED: <message>` and sets `exitCode = 1`.

Every error path triggers ROLLBACK. Unhandled errors from the `main()` promise are caught by the `.catch()` handler. ✅

---

### 13. Integration Invariant Depth — FINDING (MEDIUM)

**What the test actually verifies:**
- Schedule block UPDATE satisfies `interview_block_booking_state` CHECK and `validate_interview_schedule_block_scope()` trigger
- Interview INSERT satisfies `validate_interview_application_scope()` trigger and all CHECK constraints
- Participant INSERT satisfies FK and uniqueness constraints
- Final state: block is booked, participant linked to interview

**What it does NOT verify:**
- `scheduled_at` falls within the block's `[start_time, end_time]` window (no temporal invariant check)
- Interview `status` is `'scheduled'` (only checks `i.id` existence, not status column)
- Interview `type` is `'technical_assessment'` (not verified in post-check)
- The exact field values on the interview row (no value assertions beyond existence)

**Impact:** The script confirms schema constraints are satisfied but does not confirm business-level invariants (e.g., "interview time is within block window"). A false-positive pass could occur if the schema allowed an interview outside the block window (which current triggers don't prevent — they only check `is_booked` and FK consistency, not temporal containment).

**Recommendation (MEDIUM):** Add a temporal containment check to the post-insert verification:

```javascript
const check = await client.query(`
  SELECT i.id, i.scheduled_at, i.duration_minutes, b.start_time, b.end_time,
         i.scheduled_at + (i.duration_minutes || ' minutes')::interval AS interview_end,
         b.is_booked, p.user_id
  FROM ...
  WHERE i.id=$1
`);
const c = check.rows[0];
if (c.interview_end > c.end_time) throw new Error('interview extends beyond block window');
if (c.scheduled_at < c.start_time) throw new Error('interview starts before block');
```

---

### 14. scheduled_at Calculation Edge Case — FINDING (LOW)

**Line 34:** `const start = new Date(Math.max(Date.now() + 60 * 60 * 1000 + 60_000, new Date(f.start_time).getTime())).toISOString();`

This ensures `start` is at least 1h1m in the future OR the block's start_time, whichever is later. Correct for the 1-hour lead-time policy (`INTERVIEW-API-FINAL-FREEZE.md` line 14).

**However:** The `toISOString()` always produces UTC (Z suffix). If the block's `start_time` is in a non-UTC timezone, the comparison `Math.max(...)` operates on epoch milliseconds (timezone-agnostic), which is correct. But the resulting `start` string is always UTC — PostgreSQL will interpret it as UTC `TIMESTAMPTZ`. If the block was created with a different timezone offset, the temporal semantics could be subtly wrong.

**Impact:** LOW. The invariant check (finding #13) would catch any resulting window violation.

---

## Summary

| # | Area | Verdict | Severity |
|---|---|---|---|
| 1 | Production safety guard | PASS | — |
| 2 | Transaction rollback | PASS | — |
| 3 | No permanent data retention | PASS | — |
| 4 | Fixture query columns/tables | PASS (redundant self-join noted) | LOW |
| 5 | Schedule block trigger/constraints | PASS | — |
| 6 | Interview INSERT trigger/constraints | PASS | — |
| 7 | Participant linkage | PASS | — |
| 8 | No data leak/damage | PASS | — |
| 9 | SSL/DATABASE_URL handling | PASS | — |
| 10 | No destructive outside transaction | PASS | — |
| 11 | Skip conditions | PASS | — |
| 12 | Error rollback | PASS | — |
| 13 | Integration invariant depth | **FINDING** — no temporal window or value assertions | MEDIUM |
| 14 | scheduled_at edge case | **FINDING** — UTC normalization could mask timezone issues | LOW |

---

## Required Fixes Before Merge

1. **(MEDIUM)** Add `scheduled_at`/`duration_minutes` vs block `[start_time, end_time]` containment check to post-insert verification query. Without this, the test confirms schema compliance but not business invariant compliance.

2. **(LOW)** Remove redundant `interviewers it ON it.id=i.id` self-join (line 30). No correctness impact, but reduces confusion.

3. **(LOW)** Consider asserting interview `status = 'scheduled'` and `type = 'technical_assessment'` in the post-check to confirm value-level correctness, not just row existence.
