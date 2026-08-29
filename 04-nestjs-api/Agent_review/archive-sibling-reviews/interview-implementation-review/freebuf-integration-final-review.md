# Interview Integration Smoke Test — Final Review

**Script:** `04-nestjs-api/04-nestjs-api-app/scripts/interview-integration-smoke.js`
**Reviewer:** Freebuf
**Date:** 2026-08-28
**Verdict:** ⚠️ **PASS WITH FIXES**

---

## 1. Files Inspected

| File | Purpose |
|------|---------|
| `scripts/interview-integration-smoke.js` | Script under review (126 lines) |
| `02-database/migrations/baseline/02_enums.sql` | `interview_type`, `interview_status` enums |
| `02-database/migrations/baseline/03_users_auth.sql` | `users` table, `handle_new_user()` |
| `02-database/migrations/baseline/04_companies.sql` | `companies`, `company_members`, `company_settings` |
| `02-database/migrations/baseline/05_jobs.sql` | `jobs` table, slug/status constraints |
| `02-database/migrations/baseline/09_applications.sql` | `job_applications`, application triggers |
| `02-database/migrations/baseline/10_interviews.sql` | Interview schema: 8 tables, 3 functions, triggers |
| `AGENTS.md` | Agent operating rules |
| `INTERVIEW-API-FINAL-FREEZE.md` | Frozen interview policy decisions |

---

## 2. Executive Verdict

| Category | Count |
|----------|-------|
| BLOCKERs | 0 |
| HIGH | 1 |
| MEDIUM | 3 |
| LOW | 2 |

**PASS WITH FIXES** — The script is functionally correct and dramatically improved from the previous version. The temporary-fixture-creation path, confirmation invariant, and reschedule lineage are all sound. One HIGH finding remains from the previous review (lock overwrite), plus coverage gaps.

---

## 3. Production Safety Guard

| Check | Evidence | Result |
|-------|----------|--------|
| `RUN_INTERVIEW_INTEGRATION=true` opt-in | Line 5: exit(0) if not set | ✅ **PASS** |
| Explicit production refusal | Line 6: `NODE_ENV === 'production'` → throw | ⚠️ **M-1** |
| DATABASE_URL required | Line 8: throw if missing | ✅ **PASS** |
| No secrets logged | No console.log of DATABASE_URL or credentials | ✅ **PASS** |

**M-1: `NODE_ENV === 'production'` is insufficient production guard**

- **Line:** 6
- **Evidence:** Only checks literal string `'production'`. Environments like `staging`, `prod`, `live`, or custom `NODE_ENV` values bypass this guard.
- **Impact:** MEDIUM — The entire script runs inside a transaction that is always rolled back, so even if it runs in staging, no data is permanently modified. But the script comment says "Never run against production."
- **Fix:** Add a warning log or check additional values. Consider `NODE_ENV` allowlist instead of denylist.

---

## 4. Transaction — Always Rollback

| Path | Evidence | Result |
|------|----------|--------|
| Success path | Line 120: `await client.query('ROLLBACK')` | ✅ |
| Skip (no fixture) | Line 30: `await client.query('ROLLBACK'); return` | ✅ |
| Skip (block too short) | Line 37: `await client.query('ROLLBACK'); return` | ✅ |
| Error in catch | Line 122: `await client.query('ROLLBACK')` | ✅ |
| Connection cleanup | Line 122: `finally { await client.end() }` | ✅ |

**PASS.** All five paths (success, two skip conditions, error, finally) end with ROLLBACK + client.end(). No `COMMIT` path exists anywhere. No test data can survive.

---

## 5. Temporary Fixture Creation — Constraint Verification

The script creates its own fixtures when no existing compatible data is found (lines 23-43). Every INSERT is verified against SQL baselines:

### 5.1 `companies` INSERT (line 28)

```sql
INSERT INTO public.companies (name,slug,owner_id,email,verification_status)
VALUES ('Integration Smoke Company',$1,$2,$3,'verified') RETURNING id
```

| Constraint | Source | Satisfied? |
|------------|--------|------------|
| `name VARCHAR(255) NOT NULL` | `04_companies.sql` | ✅ `'Integration Smoke Company'` |
| `slug CITEXT NOT NULL UNIQUE` | `04_companies.sql` | ✅ Unique timestamp-based slug |
| `owner_id UUID NOT NULL REFERENCES users(id)` | `04_companies.sql:36` | ✅ Valid employer user |
| `email CITEXT` | `04_companies.sql` | ✅ Provided |
| `verification_status company_verification_status` | `04_companies.sql:38` | ✅ `'verified'` ∈ enum |
| `companies_contact_check` CHECK | `04_companies.sql` | ✅ Email provided |

### 5.2 `company_members` INSERT (line 29)

```sql
INSERT INTO public.company_members (company_id,user_id,is_active,joined_at)
VALUES ($1,$2,true,NOW())
```

| Constraint | Source | Satisfied? |
|------------|--------|------------|
| `company_id UUID NOT NULL REFERENCES companies(id)` | `04_companies.sql` | ✅ Just created |
| `user_id UUID NOT NULL REFERENCES users(id)` | `04_companies.sql` | ✅ Valid employer |
| `unique_member_per_company UNIQUE (company_id, user_id)` | `04_companies.sql` | ✅ First member |
| `company_members_active_joined` CHECK | `04_companies.sql` | ✅ `is_active=TRUE` + `joined_at=NOW()` |
| `unique_company_employee_code` UNIQUE | `04_companies.sql` | ✅ NULL (nullable) |
| `unique_company_work_email` UNIQUE | `04_companies.sql` | ✅ NULL (nullable) |

### 5.3 `jobs` INSERT (line 30)

```sql
INSERT INTO public.jobs (company_id,created_by,title,slug,description,status)
VALUES ($1,$2,'Integration Smoke Job',$3,'Temporary rollback-only job','published')
```

| Constraint | Source | Satisfied? |
|------------|--------|------------|
| `company_id UUID NOT NULL REFERENCES companies(id)` | `05_jobs.sql` | ✅ |
| `created_by UUID NOT NULL REFERENCES users(id)` | `05_jobs.sql` | ✅ |
| `title VARCHAR(255) NOT NULL` | `05_jobs.sql` | ✅ |
| `slug VARCHAR(255) NOT NULL` + `unique_job_slug_per_company` | `05_jobs.sql` | ✅ Unique timestamp slug |
| `description TEXT NOT NULL` | `05_jobs.sql` | ✅ |
| `status job_status NOT NULL DEFAULT 'draft'` | `05_jobs.sql` | ✅ `'published'` ∈ enum |
| `employment_type NOT NULL DEFAULT 'full_time'` | `05_jobs.sql` | ✅ Default used |
| `work_mode NOT NULL DEFAULT 'onsite'` | `05_jobs.sql` | ✅ Default used |
| `salary_currency NOT NULL DEFAULT 'INR'` | `05_jobs.sql` | ✅ Default used |
| `salary_period NOT NULL DEFAULT 'yearly'` | `05_jobs.sql` | ✅ Default used |
| `screening_questions NOT NULL DEFAULT '[]'` | `05_jobs.sql` | ✅ Default used |
| `vacancies > 0` CHECK | `05_jobs.sql` | ✅ Default 1 |
| `applications_count >= 0` CHECK | `05_jobs.sql` | ✅ Default 0 |
| `views_count >= 0` CHECK | `05_jobs.sql` | ✅ Default 0 |
| `jobs_slug_lowercase` CHECK | `05_jobs.sql` | ✅ Slug is lowercase |
| `jobs_application_form_url_check` | `05_jobs.sql` | ✅ NULL (nullable) |

**Note:** The job is created with `status='published'`. The SQL comment at `05_jobs.sql` states: "Only verified companies can publish jobs. This rule is enforced by the NestJS business layer (not DB constraint)." The script creates the company with `verification_status='verified'`, so this is consistent.

### 5.4 `job_applications` INSERT (line 31)

```sql
INSERT INTO public.job_applications (job_id,candidate_id,user_id,is_guest)
VALUES ($1,$2,$3,false) RETURNING id
```

| Constraint | Source | Satisfied? |
|------------|--------|------------|
| `job_id UUID NOT NULL REFERENCES jobs(id)` | `09_applications.sql` | ✅ Just created |
| `candidate_id` FK `(candidate_id, user_id) → candidate_profiles(id, user_id)` | `09_applications.sql` | ✅ Valid candidate |
| `is_guest=FALSE` | `09_applications.sql` | ✅ |
| `application_identity_check` CHECK | `09_applications.sql` | ✅ Registered path: `candidate_id NOT NULL`, `user_id NOT NULL`, guest fields NULL |
| `answers_to_screening_questions NOT NULL DEFAULT '[]'` | `09_applications.sql` | ✅ Default |

### 5.5 `interviewers` INSERT (line 32)

```sql
INSERT INTO public.interviewers (user_id,company_id,title,is_active)
VALUES ($1,$2,'Smoke interviewer',true) RETURNING id,user_id
```

| Constraint | Source | Satisfied? |
|------------|--------|------------|
| `user_id UUID NOT NULL REFERENCES users(id)` | `10_interviews.sql:59` | ✅ Same employer |
| `company_id UUID NOT NULL REFERENCES companies(id)` | `10_interviews.sql:60` | ✅ Same company |
| `unique_interviewer_per_company UNIQUE (user_id, company_id)` | `10_interviews.sql:64` | ✅ First interview row |
| `interviewer_company_member_fk FK (company_id, user_id) → company_members` | `10_interviews.sql:66` | ✅ Member was added in step 5.2 |

### 5.6 `interview_schedule_blocks` INSERT (line 34)

```sql
INSERT INTO public.interview_schedule_blocks
  (interviewer_id,job_id,start_time,end_time,slot_duration,timezone)
VALUES ($1,$2,$3,$4,30,'UTC')
```

| Constraint | Source | Satisfied? |
|------------|--------|------------|
| `interviewer_id UUID NOT NULL REFERENCES interviewers(id)` | `10_interviews.sql:73` | ✅ Just created |
| `job_id UUID REFERENCES jobs(id)` | `10_interviews.sql:74` | ✅ Just created |
| `start_time < end_time` CHECK | `10_interviews.sql:107` | ✅ 1-hour gap |
| `slot_duration > 0` CHECK | `10_interviews.sql:80` | ✅ `30` |
| `timezone non-blank` CHECK | `10_interviews.sql:109` | ✅ `'UTC'` |
| `interview_block_booking_state` CHECK | `10_interviews.sql:118` | ✅ Defaults: `is_booked=FALSE`, lock fields NULL, application_id NULL |
| `interview_block_application_requires_job` CHECK | `10_interviews.sql:124` | ✅ `application_id IS NULL` |
| `EXCLUDE USING gist` (overlap) | `10_interviews.sql:130` | ✅ Fresh block, no overlap |
| `validate_interview_schedule_block_scope` trigger | `10_interviews.sql:155` | ✅ Same company (job + interviewer match) |

**All 6 fixture INSERTs verified against SQL baselines. Zero constraint violations possible.**

---

## 6. Schedule Block Booking State

The booking UPDATE (line 38):

```sql
UPDATE public.interview_schedule_blocks
SET is_booked=true, application_id=$1, job_id=$2, booked_by=$3,
    booked_at=NOW(), locked_by=NULL, locked_until=NULL
WHERE id=$4 AND is_booked=false
```

| Constraint | Satisfied? | Evidence |
|------------|------------|----------|
| `interview_block_booking_state` CHECK | ✅ | `is_booked=TRUE` + `booked_by IS NOT NULL` + `booked_at IS NOT NULL` + lock fields NULL |
| `interview_block_application_requires_job` CHECK | ✅ | Both `application_id` and `job_id` provided |
| `interview_block_application_job_fk` FK | ✅ | `(application_id, job_id)` matches `job_applications(id, job_id)` |
| `valid_slot_lock` CHECK | ✅ | Both lock fields NULL |

**H-1: Explicit `locked_by=NULL, locked_until=NULL` in UPDATE violates frozen booking policy intent**

- **Line:** 38
- **Evidence:** The UPDATE SET clause explicitly forces `locked_by=NULL, locked_until=NULL`.
- **Frozen Policy (INTERVIEW-API-FINAL-FREEZE.md):** "Existing uniqueness और locking duplicate booking रोकेंगे" — the lock mechanism protects against concurrent booking.
- **SQL Constraint:** The CHECK constraint `interview_block_booking_state` ALLOWS this state (when `is_booked=TRUE`, it requires lock fields to be NULL). So this is **not a constraint violation**.
- **Problem:** The script **overwrites** any lock that exists on the block. In a real concurrent scenario, if another process has locked this block (`locked_by` is set, `locked_until` is in the future), the script's UPDATE would succeed and break the lock protection. A correct booking UPDATE should include `AND locked_by IS NULL AND locked_until IS NULL` in the WHERE clause (or verify lock expiry).
- **Impact:** HIGH for production code, MEDIUM for this smoke test (the script creates its own block with no lock).
- **Fix:** Add `AND locked_by IS NULL AND locked_until IS NULL` to the WHERE clause.

---

## 7. Interview INSERT — Trigger/Constraint Satisfaction

The interview INSERT (line 41):

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
| `schedule_block_id UNIQUE REFERENCES interview_schedule_blocks(id)` | ✅ | Block just created, not yet referenced |
| `title non-blank` CHECK | ✅ | `'Integration smoke'` |
| `type interview_type` | ✅ | `'technical_assessment'` ∈ enum (`02_enums.sql:214`) |
| `round > 0` CHECK | ✅ | `1` |
| `duration_minutes > 0` CHECK | ✅ | `30` |
| `timezone non-blank` CHECK | ✅ | `'UTC'` |
| `status interview_status` | ✅ | `'scheduled'` ∈ enum (`02_enums.sql:231`) |
| `interview_completion_state` CHECK | ✅ | `status <> 'completed'` → `completed_at IS NULL` (default) |
| `interview_cancellation_state` CHECK | ✅ | `status <> 'cancelled'` → no `cancelled_reason` needed |
| `interview_candidate_confirmation_state` CHECK | ✅ | `is_candidate_confirmed=FALSE` (default) → `candidate_confirmed_at IS NULL` |
| `interview_self_reschedule_check` CHECK | ✅ | `rescheduled_from IS NULL` (default) |
| `interview_application_scope_guard` trigger | ✅ | Same application+job, registered candidate matches |

**All constraints satisfied. INSERT is safe.**

---

## 8. Participant INSERT — Validity

```sql
INSERT INTO public.interview_participants
  (interview_id, user_id, role, is_primary)
VALUES ($1, $2, 'interviewer', true)
```

| Constraint | Satisfied? | Evidence |
|------------|------------|----------|
| `interview_id UUID NOT NULL REFERENCES interviews(id)` | ✅ | Just created |
| `user_id UUID NOT NULL REFERENCES users(id)` | ✅ | Interviewer's user_id |
| `role non-blank` CHECK | ✅ | `'interviewer'` |
| `unique_interview_participant UNIQUE (interview_id, user_id)` | ✅ | First participant |
| `idx_interview_participants_primary` partial unique | ✅ | Single primary row |

**PASS.**

---

## 9. Candidate Confirmation Invariants

The confirmation UPDATE (line 52):

```sql
UPDATE public.interviews
SET status='confirmed', is_candidate_confirmed=true, candidate_confirmed_at=NOW()
WHERE id=$1 RETURNING status,is_candidate_confirmed,candidate_confirmed_at
```

| Constraint | Satisfied? | Evidence |
|------------|------------|----------|
| `interview_completion_state` CHECK | ✅ | `status='confirmed' <> 'completed'` → `completed_at IS NULL` |
| `interview_candidate_confirmation_state` CHECK | ✅ | `is_candidate_confirmed=TRUE` + `candidate_confirmed_at IS NOT NULL` |
| `interview_cancellation_state` CHECK | ✅ | `status='confirmed' <> 'cancelled'` |
| Outgoing transition from `scheduled` | ✅ | `scheduled → confirmed` is valid per freeze policy |

**Assertion (line 53):** Checks `status === 'confirmed'`, `is_candidate_confirmed === true`, `candidate_confirmed_at` is truthy. All three are verified from the RETURNING clause. **Not a false positive.**

**PASS.** Confirmation invariant correctly verified.

---

## 10. Reschedule — Old-Row/New-Row Lineage

The reschedule flow (lines 55-62):

```js
// 1. Create second block
const secondBlock = await client.query(`INSERT INTO public.interview_schedule_blocks ...`);
// 2. Book second block
await client.query(`UPDATE public.interview_schedule_blocks SET is_booked=true ...`);
// 3. Set old interview to 'rescheduled', clear schedule_block_id
await client.query(`UPDATE public.interviews SET status='rescheduled', schedule_block_id=NULL WHERE id=$1`);
// 4. Insert new interview with rescheduled_from pointing to old
const linked = await client.query(`INSERT INTO public.interviews ... VALUES ($1,$2,$3,$4,...,$6,1) RETURNING id,rescheduled_from`, [..., interview.rows[0].id]);
```

### Step 3: Old interview UPDATE

```sql
UPDATE public.interviews SET status='rescheduled', schedule_block_id=NULL WHERE id=$1
```

| Check | Evidence | Result |
|-------|----------|--------|
| `schedule_block_id=NULL` clears UNIQUE reference | ✅ Old row no longer references the block |
| `status='rescheduled'` | ✅ Valid outgoing transition from `confirmed` |
| `interview_completion_state` CHECK | ✅ `status <> 'completed'` → `completed_at IS NULL` |
| `interview_cancellation_state` CHECK | ✅ `status <> 'cancelled'` |
| `interview_candidate_confirmation_state` CHECK | ✅ Old row: `is_candidate_confirmed=TRUE` + `candidate_confirmed_at IS NOT NULL` → still valid |

### Step 4: New interview INSERT

```sql
INSERT INTO public.interviews
  (application_id,job_id,candidate_id,schedule_block_id,...,rescheduled_from,reschedule_count)
VALUES ($1,$2,$3,$4,...,$6,1)
```

| Check | Evidence | Result |
|-------|----------|--------|
| `schedule_block_id UNIQUE` | ✅ New block, not yet referenced |
| `rescheduled_from UUID REFERENCES interviews(id)` | ✅ Points to old interview |
| `interview_self_reschedule_check` CHECK | ✅ `rescheduled_from IS NOT NULL AND rescheduled_from <> id` |
| `reschedule_count=1` | ✅ Matches freeze: count incremented |
| `interview_application_scope_guard` trigger | ✅ Same application+job, same candidate |
| `interview_block_application_job_fk` on new block | ✅ Block booked with matching `(application_id, job_id)` |

### Frozen Policy Compliance

**INTERVIEW-API-FINAL-FREEZE.md:** "नई interview row बनेगी और `rescheduled_from` पुरानी row को point करेगी"

| Requirement | Implemented? |
|-------------|-------------|
| New interview row created | ✅ Line 62 |
| `rescheduled_from` points to old row | ✅ Line 62 |
| Old row status = `rescheduled` | ✅ Line 60 |
| Old row `schedule_block_id` cleared | ✅ Line 60 — prevents UNIQUE constraint conflict |
| `reschedule_count` incremented | ✅ Line 62 |

**Assertion (line 63):** `String(linked.rows[0]?.rescheduled_from) !== String(interview.rows[0].id)` — verifies UUID lineage. **Not a false positive.**

**PASS.** Reschedule lineage is correctly implemented and verified.

---

## 11. `rescheduled_from` and UNIQUE `schedule_block_id` Constraints

| Constraint | How it's handled | Result |
|------------|-----------------|--------|
| `interviews.schedule_block_id UNIQUE` | Old row cleared (`=NULL`) before new INSERT with the new block | ✅ No conflict |
| `interviews.rescheduled_from REFERENCES interviews(id)` | Points to valid old interview UUID | ✅ FK satisfied |
| `interview_self_reschedule_check` CHECK | `rescheduled_from IS NULL OR rescheduled_from <> id` — self-reference prevented | ✅ |
| `interview_application_scope_guard` trigger | Validates application/job/candidate/block scope for both old and new rows | ✅ |

**PASS.** The UNIQUE constraint conflict (the BLOCKER from the previous review) is properly handled by clearing `schedule_block_id` on the old row before inserting the new row.

---

## 12. Generated Times Fit Inside Schedule Blocks

| Check | Evidence | Result |
|-------|----------|--------|
| Interview start ≥ block start | `scheduled_at = max(now+61min, block.start_time)` | ✅ |
| Interview end ≤ block end | `end = start + 30min; if (end > block.end_time) → skip` | ✅ |
| Second block (reschedule) | Created with 2-hour gap from first block, 1-hour duration | ✅ |
| New interview inside second block | `scheduled_at = blockEnd + 2h + 60min`, duration 30min, block end = `blockEnd + 3h` | ✅ |

**PASS.** All generated times fit within their respective schedule blocks.

---

## 13. No Test Data Survives

| Table | Created? | Rolled back? |
|-------|----------|-------------|
| `companies` | Yes (conditional) | ✅ ROLLBACK |
| `company_members` | Yes (conditional) | ✅ ROLLBACK |
| `jobs` | Yes (conditional) | ✅ ROLLBACK |
| `job_applications` | Yes (conditional) | ✅ ROLLBACK |
| `interviewers` | Yes (conditional) | ✅ ROLLBACK |
| `interview_schedule_blocks` | Yes (always) | ✅ ROLLBACK |
| `interviews` | Yes (always) | ✅ ROLLBACK |
| `interview_participants` | Yes (always) | ✅ ROLLBACK |

All inside `BEGIN ... ROLLBACK`. No COMMIT path. **PASS.**

---

## 14. Assertion Quality — False Positive Analysis

| Assertion | Line | What it checks | False positive risk |
|-----------|------|---------------|---------------------|
| `booked.rowCount !== 1` | 40 | Block actually booked | None — PostgreSQL returns 0 if WHERE doesn't match |
| `!c \|\| !c.is_booked \|\| c.status !== 'scheduled' \|\| ...` | 49 | 6 properties: exists, booked, status, type, application_id, time bounds | Low — all from RETURNING/JOIN, not computed client-side |
| `confirmed.rows[0]?.status !== 'confirmed'` | 53 | Confirmation state | None — from RETURNING clause |
| `!confirmed.rows[0]?.is_candidate_confirmed` | 53 | Candidate confirmed flag | None — from RETURNING clause |
| `!confirmed.rows[0]?.candidate_confirmed_at` | 53 | Confirmation timestamp | None — from RETURNING clause |
| `String(linked.rows[0]?.rescheduled_from) !== String(interview.rows[0].id)` | 63 | UUID lineage | None — UUID comparison |

**PASS.** All assertions read from PostgreSQL RETURNING clauses or JOINs, not computed client-side. No false positive risk.

---

## 15. Missing Lifecycle and Concurrency Coverage

| Gap | Description | Severity |
|-----|-------------|----------|
| **No negative constraint tests** | No test that verifies PostgreSQL rejects invalid inserts (duplicate block, cross-company mismatch, CHECK violation) | HIGH |
| **No terminal state transitions** | `completed` (requires `completed_at`), `cancelled` (requires `cancelled_reason`), `no_show` not tested | MEDIUM |
| **No concurrent booking test** | Two transactions booking the same block simultaneously | MEDIUM |
| **No overlap prevention test** | Attempting to create overlapping schedule blocks for same interviewer | LOW |
| **No cross-company mismatch test** | Interview with application from Company A and interviewer from Company B | LOW |
| **No guest candidate merge test** | Guest interview with non-merged candidate_id | LOW |

**Note:** The script is titled "integration smoke test" — it verifies the happy-path invariant (create → book → confirm → reschedule → verify lineage). The missing coverage items would transform it from a smoke test into a comprehensive integration test suite. This is a design decision, not a bug.

---

## 16. Previous Review Findings — Status

| Previous Finding | Severity | Status | Evidence |
|------------------|----------|--------|----------|
| F-1: Redundant self-join on `interviewers` | LOW | ✅ **FIXED** | Self-join removed; `i.user_id` used directly |
| F-2: Lock overwrite in booking UPDATE | MEDIUM | ⚠️ **NOT FIXED** | `locked_by=NULL, locked_until=NULL` still in SET clause (now H-1) |
| F-3: `rejectUnauthorized: false` | LOW | ⚠️ **NOT FIXED** | Same behavior |
| F-4: No negative test coverage | HIGH | ⚠️ **NOT FIXED** | Still only happy path |
| F-5: ROLLBACK edge case | LOW | ⚠️ **NOT FIXED** | Same catch block |
| F-6: `NODE_ENV` check | LOW | ⚠️ **NOT FIXED** | Same literal check |
| NEW: Temporary fixture creation | — | ✅ **NEW** | Lines 23-43 create fixtures when no compatible data exists |
| NEW: Confirmation invariant | — | ✅ **NEW** | Lines 52-53 verify candidate confirmation |
| NEW: Reschedule lineage | — | ✅ **NEW** | Lines 55-63 verify old→new row linkage |
| NEW: Block created by script | — | ✅ **NEW** | Lines 34-37 create own schedule block |
| CRITICAL from prev review: UNIQUE constraint on reschedule | CRITICAL | ✅ **FIXED** | Old row `schedule_block_id=NULL` before new INSERT (line 60) |

---

## 17. Summary

### ✅ What Is Rock Solid

| Area | Status |
|------|--------|
| Transaction always rollback | ✅ All 5 paths covered |
| No test data survives | ✅ No COMMIT path |
| Fixture creation constraints | ✅ All 6 INSERTs verified against SQL |
| Schedule block booking | ✅ All CHECK/FK/exclusion constraints satisfied |
| Interview INSERT constraints | ✅ All 15 constraints + trigger satisfied |
| Participant linkage | ✅ FK, unique, partial unique all correct |
| Confirmation invariant | ✅ Correctly verified via RETURNING clause |
| Reschedule lineage | ✅ `schedule_block_id=NULL` + new row + `rescheduled_from` |
| Time bounds | ✅ All interviews fit within blocks |
| Zero invented objects | ✅ No invented tables, columns, enums, events |
| Assertion quality | ✅ All from RETURNING/JOIN, no false positives |
| Previous BLOCKER (UNIQUE conflict) | ✅ **FIXED** |

### 🔴 Findings Requiring Fix

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| **H-1** | 🟡 HIGH | Lock overwrite in booking UPDATE — explicitly writes `locked_by=NULL, locked_until=NULL` | Add `AND locked_by IS NULL AND locked_until=NULL` to WHERE clause |
| **M-1** | 🟡 MEDIUM | `NODE_ENV === 'production'` is insufficient production guard | Add warning log or check additional env values |
| **M-2** | 🟡 MEDIUM | No negative constraint-violation test coverage | Add 3-5 tests that verify PostgreSQL rejects invalid inserts |
| **M-3** | 🟡 MEDIUM | No terminal state (`completed`/`cancelled`/`no_show`) transition tests | Add tests for `completed_at` CHECK and `cancelled_reason` CHECK |
| **L-1** | 🟢 LOW | `rejectUnauthorized: false` hardcoded in SSL config | Consider `DATABASE_SSL_REJECT_UNAUTHORIZED` env var |
| **L-2** | 🟢 LOW | If ROLLBACK itself throws (dead connection), original error is lost | Wrap ROLLBACK in inner try/catch |

---

## 18. Final Verdict

| Category | Status |
|----------|--------|
| **BLOCKERs** | ✅ Zero (previous CRITICAL reschedule UNIQUE bug is FIXED) |
| **HIGH** | 1 — Lock overwrite (H-1) |
| **MEDIUM** | 3 — Production guard, negative tests, terminal state tests |
| **LOW** | 2 — SSL, ROLLBACK edge case |
| **Overall** | ⚠️ **PASS WITH FIXES** |

The script has improved dramatically from the previous version. The three major additions (temporary fixture creation, confirmation invariant, reschedule lineage) are all correct and meaningful. The previous CRITICAL blocker (UNIQUE constraint conflict on reschedule) is properly fixed. The remaining HIGH finding (lock overwrite) should be addressed before production use, and the MEDIUM findings would strengthen the test coverage.
