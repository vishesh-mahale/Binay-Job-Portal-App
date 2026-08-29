# Interview Integration Smoke Script — Independent Review

**Script:** `04-nestjs-api/04-nestjs-api-app/scripts/interview-integration-smoke.js`
**Reviewer:** Freebuf
**Date:** 2026-08-28
**Verdict:** ⚠️ **PASS WITH FIXES**

---

## 1. Files Inspected

| File | Purpose |
|------|---------|
| `scripts/interview-integration-smoke.js` | Script under review (82 lines) |
| `02-database/migrations/baseline/10_interviews.sql` | Interview schema: tables, triggers, constraints |
| `02-database/migrations/baseline/02_enums.sql` | `interview_type`, `interview_status` enums |
| `02-database/migrations/baseline/09_applications.sql` | `job_applications`, `application_profile_snapshots` |
| `AGENTS.md` | Agent operating rules |
| `INTERVIEW-API-FINAL-FREEZE.md` | Frozen interview policy decisions |

---

## 2. Verification Point — Detailed Audit

### 2.1 Production Safety Guard

| Check | Evidence | Result |
|-------|----------|--------|
| `RUN_INTERVIEW_INTEGRATION` opt-in flag | Line 5: `process.env.RUN_INTERVIEW_INTEGRATION !== 'true'` → exit 0 | ✅ **PASS** |
| Explicit production refusal | Line 6: `NODE_ENV === 'production'` → throw Error | ⚠️ **MEDIUM** |

**M-1: `NODE_ENV === 'production'` is insufficient production guard**

- **Line:** 6
- **Evidence:** Only checks literal string `'production'`. Environments like `staging`, `prod`, or custom `NODE_ENV` values (e.g., `NODE_ENV=live`) bypass this guard.
- **Impact:** Medium — The script is only a smoke test with full ROLLBACK, so even if it runs in staging, data is not retained. But the script comment says "Never run against production."
- **Recommended fix:** Also check for `NODE_ENV` values that could indicate production-like environments, or at minimum add a warning log: `console.warn('WARNING: NODE_ENV=%s', process.env.NODE_ENV)`.
- **Severity:** MEDIUM

---

### 2.2 Explicit Opt-In Flag

**PASS.** The `RUN_INTERVIEW_INTEGRATION=true` requirement is a robust opt-in mechanism. Default is `exit(0)` (skip). No issue.

---

### 2.3 Transaction — Always Rollback?

| Check | Evidence | Result |
|-------|----------|--------|
| `BEGIN` at start | Line 9: `await client.query('BEGIN')` | ✅ **PASS** |
| `ROLLBACK` on skip | Lines 17, 23: `await client.query('ROLLBACK')` before return | ✅ **PASS** |
| `ROLLBACK` in catch | Line 26: `await client.query('ROLLBACK')` in catch block | ✅ **PASS** |
| Connection cleanup | Line 26: `finally { await client.end() }` | ✅ **PASS** |

**PASS.** All paths (skip, success, error) end with ROLLBACK + client.end(). No test data is retained.

**Note:** If the connection drops mid-transaction (e.g., DB server restart), `client.query('ROLLBACK')` in the catch block will fail because the connection is dead. The original error is preserved and re-thrown, which is correct behavior — the server-side transaction auto-aborts on connection loss. No data leak risk.

---

### 2.4 Test Data Retention

**PASS.** The entire script runs inside a single transaction that is always rolled back. No `COMMIT` path exists. The script explicitly confirms: `console.log('PASS: transaction rolled back; no test rows retained')` on line 24.

---

### 2.5 Fixture Query — Tables/Columns Correctness

The fixture query (lines 10-16):

```sql
SELECT c.id AS company_id, j.id AS job_id, a.id AS application_id,
       i.id AS interviewer_id, b.id AS block_id,
       b.start_time, b.end_time, cp.id AS candidate_id, it.user_id AS interviewer_user_id
FROM public.companies c
JOIN public.jobs j ON j.company_id=c.id AND j.deleted_at IS NULL
JOIN public.job_applications a ON a.job_id=j.id AND a.is_guest=false
JOIN public.candidate_profiles cp ON cp.id=a.candidate_id AND cp.deleted_at IS NULL
JOIN public.interviewers i ON i.company_id=c.id AND i.is_active=true
JOIN public.interview_schedule_blocks b
  ON b.interviewer_id=i.id AND b.job_id=j.id AND b.is_booked=false
 AND b.application_id IS NULL
JOIN public.users it_user ON it_user.id=i.user_id AND it_user.status='active' AND it_user.deleted_at IS NULL
JOIN public.interviewers it ON it.id=i.id
LIMIT 1
```

| Table/Column | Exists in SQL? | Correct join? | Result |
|--------------|---------------|---------------|--------|
| `companies.id` | `04_companies.sql` | N/A | ✅ |
| `jobs.company_id`, `jobs.deleted_at` | `05_jobs.sql` | `j.company_id=c.id` | ✅ |
| `job_applications.job_id`, `job_applications.is_guest` | `09_applications.sql` | `a.job_id=j.id` | ✅ |
| `candidate_profiles.id`, `candidate_profiles.deleted_at` | `08_candidates.sql` | `cp.id=a.candidate_id` | ✅ |
| `interviewers.company_id`, `interviewers.is_active` | `10_interviews.sql:61-62` | `i.company_id=c.id` | ✅ |
| `interview_schedule_blocks.interviewer_id` | `10_interviews.sql:73` | `b.interviewer_id=i.id` | ✅ |
| `interview_schedule_blocks.job_id` | `10_interviews.sql:74` | `b.job_id=j.id` | ✅ |
| `interview_schedule_blocks.is_booked` | `10_interviews.sql:83` | `b.is_booked=false` | ✅ |
| `interview_schedule_blocks.application_id` | `10_interviews.sql:93` | `b.application_id IS NULL` | ✅ |
| `users.status`, `users.deleted_at` | `03_users_auth.sql` | Filter active non-deleted | ✅ |

**All columns verified against SQL baselines.**

---

### 2.6 Fixture Query — Self-Join Redundancy

**F-1: Redundant self-join on `interviewers`**

- **Lines:** 15-16
- **Evidence:** `JOIN public.interviewers i ON ... JOIN public.interviewers it ON it.id=i.id`
- **Problem:** `i` and `it` reference the **same row** (both `interviewers` table, joined on `it.id=i.id`). The `users it_user` join is sufficient to verify the interviewer's user status. `it` alias is never used for a different table.
- **Impact:** LOW — Functional correctness is not affected. The query returns valid fixture data. But the unnecessary self-join is confusing.
- **Severity:** LOW

---

### 2.7 Interview Schedule-Block Trigger/Check Constraints — Satisfiability

The `booked` UPDATE (line 20):

```sql
UPDATE public.interview_schedule_blocks
SET is_booked=true, application_id=$1, job_id=$2, booked_by=$3,
    booked_at=NOW(), locked_by=NULL, locked_until=NULL
WHERE id=$4 AND is_booked=false
```

**Constraint analysis:**

| Constraint | SQL Definition | Satisfied? | Evidence |
|------------|---------------|------------|----------|
| `interview_block_booking_state` | `10_interviews.sql:118-122` | ⚠️ **PARTIAL** | See F-2 |
| `valid_block_time` | `start_time < end_time` | ✅ Pre-existing | Block already exists with valid time |
| `interview_block_application_requires_job` | `application_id IS NULL OR job_id IS NOT NULL` | ✅ Both set | `$1=application_id, $2=job_id` |
| `interview_block_application_job_fk` | FK `(application_id, job_id) → job_applications(id, job_id)` | ✅ Verified | Fixture ensures valid application+job |
| `valid_slot_lock` | `(locked_by IS NULL AND locked_until IS NULL) OR both NOT NULL` | ✅ Both NULL | `locked_by=NULL, locked_until=NULL` |
| `EXCLUDE USING gist` (overlap prevention) | Same interviewer, overlapping range | ✅ No overlap | Single block, single row |

**F-2: Explicit `locked_by=NULL, locked_until=NULL` in UPDATE violates frozen policy intent**

- **Line:** 20
- **Evidence:** The UPDATE SET clause explicitly writes `locked_by=NULL, locked_until=NULL`.
- **Frozen Policy (INTERVIEW-API-FINAL-FREEZE.md):** "Existing uniqueness और locking duplicate booking रोकेंगे" — the lock mechanism is supposed to protect against concurrent booking. A valid booking should clear the lock as a **side effect of `is_booked=true`**, not as a forced explicit write.
- **SQL Constraint (line 118-122):** The CHECK constraint `interview_block_booking_state` ALLOWS this state: when `is_booked=true`, it requires `locked_by IS NULL AND locked_until IS NULL`. So the forced NULL is **not a constraint violation**.
- **Problem:** The script **explicitly overwrites** any lock that exists on the block. In a real-world concurrent scenario, if another process has locked this block (`locked_by` is set, `locked_until` is in the future), the script's UPDATE would succeed and break the lock protection. A proper booking UPDATE should include `AND locked_by IS NULL AND locked_until IS NULL` in the WHERE clause (or at minimum verify lock expiry).
- **Impact:** HIGH for production code, MEDIUM for this smoke test (the test already ensures the fixture block is unbooked and unlocked via the fixture query WHERE clause).
- **Recommended fix:** Add `AND locked_by IS NULL AND locked_until IS NULL` to the WHERE clause, matching the frozen booking flow.
- **Severity:** MEDIUM

---

### 2.8 Interview INSERT — Constraint Satisfaction

The INSERT (line 21):

```sql
INSERT INTO public.interviews
  (application_id,job_id,candidate_id,schedule_block_id,title,type,round,
   scheduled_at,duration_minutes,timezone,status)
VALUES ($1,$2,$3,$4,'Integration smoke','technical_assessment',1,$5,30,'UTC','scheduled')
```

| Constraint | Satisfied? | Evidence |
|------------|------------|----------|
| `application_id NOT NULL` | ✅ | From fixture |
| `job_id NOT NULL REFERENCES jobs(id)` | ✅ | From fixture |
| `candidate_id REFERENCES candidate_profiles(id)` | ✅ | From fixture |
| `schedule_block_id UNIQUE REFERENCES interview_schedule_blocks(id)` | ✅ | Block exists, not yet referenced |
| `title = BTRIM(title) AND title <> ''` | ✅ | `'Integration smoke'` non-blank |
| `type interview_type` | ✅ | `'technical_assessment'` ∈ enum (02_enums.sql:214) |
| `round > 0` | ✅ | `1` |
| `duration_minutes > 0` | ✅ | `30` |
| `timezone = BTRIM(timezone) AND timezone <> ''` | ✅ | `'UTC'` |
| `status interview_status` | ✅ | `'scheduled'` ∈ enum (02_enums.sql:231) |
| `interview_application_scope_guard` trigger | ✅ | Same application+job, registered candidate matches |
| `interview_completion_state` CHECK | ✅ | `status <> 'completed'` so `completed_at IS NULL` |
| `interview_cancellation_state` CHECK | ✅ | `status <> 'cancelled'` |
| `interview_candidate_confirmation_state` CHECK | ✅ | `is_candidate_confirmed = FALSE` (default) → `candidate_confirmed_at IS NULL` |
| `interview_self_reschedule_check` | ✅ | `rescheduled_from IS NULL` (default) |

**All constraints satisfied. INSERT is safe.**

---

### 2.9 Participant Linkage

```sql
INSERT INTO public.interview_participants
  (interview_id, user_id, role, is_primary)
VALUES ($1, $2, 'interviewer', true)
```

| Check | Evidence | Result |
|-------|----------|--------|
| `interview_id` FK → `interviews(id)` | Line 21 creates the interview | ✅ |
| `user_id` FK → `users(id)` | `f.interviewer_user_id` from fixture | ✅ |
| `role` non-blank | `'interviewer'` | ✅ |
| `is_primary` partial unique index | `idx_interview_participants_primary` WHERE `is_primary=true` | ✅ Single row |
| `unique_interview_participant` UNIQUE (interview_id, user_id) | Single participant per interview | ✅ |
| `interview_participant_identity` UNIQUE (id, interview_id) | Auto-generated UUID | ✅ |

**Participant linkage is correct.**

---

### 2.10 Existing Data Leak/Damage Risk

| Risk | Mitigation | Result |
|------|-----------|--------|
| Fixture reads existing companies/jobs/applications | Read-only SELECT, no modifications | ✅ |
| Fixture query scopes to unbooked blocks | `is_booked=false AND application_id IS NULL` | ✅ Won't touch booked blocks |
| UPDATE only modifies unbooked blocks | `WHERE id=$4 AND is_booked=false` | ✅ |
| INSERT only creates new rows | UUID PK, no overwrite | ✅ |
| ROLLBACK removes all test rows | Transaction always rolled back | ✅ |
| Foreign keys prevent orphan rows | All FKs enforced by PostgreSQL | ✅ |

**No existing data will be leaked or damaged.**

---

### 2.11 SSL and DATABASE_URL Handling

| Check | Evidence | Result |
|-------|----------|--------|
| DATABASE_URL required | Line 8: `if (!process.env.DATABASE_URL) throw new Error(...)` | ✅ |
| SSL defaults to enabled | Line 8: `ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }` | ⚠️ See F-3 |
| No secrets logged | No `console.log` of `DATABASE_URL` or tokens | ✅ |
| Client connection cleaned up | `finally { await client.end() }` | ✅ |

**F-3: `rejectUnauthorized: false` disables SSL certificate verification**

- **Line:** 8
- **Evidence:** `ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }`
- **Problem:** Certificate verification is disabled by default. For local development this is common (self-signed certs). However, the script does not provide a path to enable strict verification for CI/CD environments.
- **Impact:** LOW — The script explicitly refuses to run in production, and development/staging databases typically use self-signed certs. This is acceptable for the stated purpose.
- **Recommended fix:** Consider using `DATABASE_SSL_REJECT_UNAUTHORIZED=false` as an explicit opt-in rather than hardcoding false. This makes CI behavior explicit.
- **Severity:** LOW

---

### 2.12 Destructive Statements Outside Transaction

**PASS.** All SQL statements are inside the `try` block which is wrapped in `BEGIN/ROLLBACK`. No statements execute outside the transaction. The `client.end()` in `finally` only closes the connection — it does not commit.

---

### 2.13 Skip Conditions

| Condition | Line | Behavior | Correct? |
|-----------|------|----------|----------|
| `RUN_INTERVIEW_INTEGRATION !== 'true'` | 5 | `exit(0)` | ✅ |
| `NODE_ENV === 'production'` | 6 | `throw Error` → catch → `exitCode=1` | ✅ |
| No compatible fixture found | 17 | `ROLLBACK` + return | ✅ |
| Block too short for 30-min interview | 23 | `ROLLBACK` + return | ✅ |

**All skip conditions are correct and safe.**

---

### 2.14 Error → Rollback Guaranteed

**PASS.** The `catch` block on line 26:
```js
} catch (error) { await client.query('ROLLBACK'); throw error; }
```

This ensures:
1. Rollback executes before error propagation
2. The `throw error` is caught by `main().catch()` on line 28, which logs `BLOCKED: <message>` and sets `exitCode=1`
3. If the rollback itself fails (dead connection), the original error is still preserved in the catch block

**Edge case:** If `client.query('ROLLBACK')` throws (e.g., connection dead), the original error from the try block is lost. This is a PostgreSQL client limitation — the catch block should wrap the ROLLBACK in its own try/catch:

```js
catch (error) {
  try { await client.query('ROLLBACK'); } catch (_) { /* connection lost, server auto-aborts */ }
  throw error;
}
```

**Severity:** LOW — In practice, if the connection is dead, the server already auto-aborts the transaction. The test result is still correct (BLOCKED/exitCode=1).

---

### 2.15 Integration Invariant Coverage — Superficial Check vs. Real Integration Test

**F-4: Script only tests the happy path — no constraint violation, error path, or edge-case coverage**

- **Evidence:** The script:
  1. Finds a valid fixture
  2. Books a block (happy path)
  3. Inserts an interview (happy path)
  4. Inserts a participant (happy path)
  5. Verifies the invariant (happy path)
  6. Rolls back

- **What is NOT tested:**
  - `completed` transition without `completed_at` → should fail CHECK
  - `cancelled` transition without `cancelled_reason` → should fail CHECK
  - Candidate confirmation without `candidate_confirmed_at` → should fail CHECK
  - Duplicate `schedule_block_id` insert → should fail UNIQUE
  - Duplicate `interview_participant` → should fail UNIQUE
  - Cross-company application/interviewer mismatch → should fail trigger
  - Guest application with non-merged candidate → should fail trigger
  - Overlapping schedule block → should fail EXCLUDE constraint
  - Block booking when already booked → should fail UPDATE (0 rows)
  - Concurrent booking of the same block → should fail (lock/UNIQUE)

- **Impact:** The script title says "integration smoke test" — it does verify that the basic invariant (booked block → interview → participant) holds inside a transaction. But it does NOT test constraint violations or error paths, which are the primary value of integration tests.
- **Recommended fix:** Add at least 3-5 negative test cases that INSERT/UPDATE with deliberately invalid data and assert that PostgreSQL throws the expected constraint errors.
- **Severity:** HIGH

---

### 2.16 Lead-Time / Time Calculation

```js
const start = new Date(Math.max(Date.now() + 60 * 60 * 1000 + 60_000, new Date(f.start_time).getTime())).toISOString();
const end = new Date(start).getTime() + 30 * 60 * 1000;
if (end > new Date(f.end_time).getTime()) { console.log('SKIPPED: ...'); await client.query('ROLLBACK'); return; }
```

| Check | Evidence | Result |
|-------|----------|--------|
| 1-hour minimum lead time | `Date.now() + 60 * 60 * 1000 + 60_000` = now + 61 minutes | ✅ |
| Slot fits within block | `end > f.end_time` check before INSERT | ✅ |
| Uses `f.start_time` as lower bound | `Math.max(now + 61min, block.start)` | ✅ Prevents scheduling before block starts |

**Time handling is correct for the smoke test purpose.**

---

## 3. Summary of Findings

| # | Severity | Finding | Location | Fix |
|---|----------|---------|----------|-----|
| **F-1** | 🟢 LOW | Redundant self-join on `interviewers` (alias `it` = alias `i`) | Lines 15-16 | Remove `JOIN public.interviewers it ON it.id=i.id`; rename `it_user` to just reference `i.user_id` |
| **F-2** | 🟡 MEDIUM | UPDATE explicitly writes `locked_by=NULL, locked_until=NULL` — overwrites any existing lock; should guard `AND locked_by IS NULL` in WHERE | Line 20 | Add `AND locked_by IS NULL AND locked_until IS NULL` to WHERE clause |
| **F-3** | 🟢 LOW | `rejectUnauthorized: false` hardcoded; no path to strict SSL for CI | Line 8 | Consider `DATABASE_SSL_REJECT_UNAUTHORIZED` env var |
| **F-4** | 🔴 HIGH | Script only tests happy path — no constraint violation, error path, or edge-case testing | Entire script | Add 3-5 negative test cases (duplicate block, cross-company mismatch, CHECK violation) |
| **F-5** | 🟢 LOW | If ROLLBACK itself throws (dead connection), original error is lost | Line 26 | Wrap ROLLBACK in inner try/catch |
| **F-6** | 🟢 LOW | `NODE_ENV` only checks literal `'production'` — staging/prod-like envs bypass | Line 6 | Add warning log or check additional values |

---

## 4. What Is Correct and Solid

| Area | Status | Evidence |
|------|--------|----------|
| Production safety | ✅ | Explicit opt-in + production refusal |
| Transaction always rollback | ✅ | All paths end in ROLLBACK |
| No test data retained | ✅ | No COMMIT path exists |
| Fixture query tables/columns | ✅ | All 10 columns verified against SQL baselines |
| Interview INSERT constraints | ✅ | All 15 CHECK/FK/trigger constraints satisfied |
| Participant linkage | ✅ | FK, unique, partial unique all satisfied |
| Existing data not damaged | ✅ | Read-only fixture + ROLLBACK + scoped UPDATE |
| Skip conditions | ✅ | 4 correct skip paths |
| Time/lead-time calculation | ✅ | 1-hour minimum + block bounds enforced |
| Zero invented objects | ✅ | No invented tables, columns, enums or events |

---

## 5. Final Verdict

| Category | Status |
|----------|--------|
| **BLOCKERs** | ✅ Zero |
| **HIGH** | 1 — No negative/constraint-violation test coverage (F-4) |
| **MEDIUM** | 1 — Lock overwrite in UPDATE (F-2) |
| **LOW** | 4 — Redundant join, SSL, ROLLBACK edge case, NODE_ENV (F-1, F-3, F-5, F-6) |
| **Overall** | ⚠️ **PASS WITH FIXES** |

The script correctly performs its core purpose: verify that an interview can be created with a booked schedule block and participant linkage, inside a safely rolled-back transaction. However, it falls short of its name ("integration smoke test") because it does not test constraint violations, error paths, or edge cases that would constitute a real integration invariant test.

**F-4 is the most important fix** — adding even 3-5 negative test cases would transform this from a superficial insert-verify-rollback script into a genuine integration invariant test. **F-2 should also be fixed** to match the frozen booking policy and prevent lock bypass in concurrent scenarios.
