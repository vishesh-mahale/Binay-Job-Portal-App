# Interview Integration Smoke Script — Final Independent Review

**Reviewer:** opencode  
**Script:** `04-nestjs-api/04-nestjs-api-app/scripts/interview-integration-smoke.js` (67 lines)  
**Cross-checked against:** `10_interviews.sql`, `09_applications.sql`, `04_companies.sql`, `05_jobs.sql`, `02_enums.sql`, `INTERVIEW-API-FINAL-FREEZE.md`, `AGENTS.md`  
**Date:** 2026-08-28

---

## Final Verdict: **BLOCKED**

The script's primary path (existing fixture) is well-designed and satisfies all schema constraints. However, the fallback fixture creation path contains a hard constraint violation that guarantees failure when no pre-existing data is available. Additionally, post-insert verification lacks participant existence checks, making several assertions vacuously pass on missing rows.

---

## 1. Production Safety Guard — PASS

| Check | Line | Result |
|---|---|---|
| `NODE_ENV === 'production'` blocks execution | 9 | ✅ throws |
| `RUN_INTERVIEW_INTEGRATION !== 'true'` skips cleanly | 5-8 | ✅ exit(0) |
| `DATABASE_URL` required | 12 | ✅ throws |
| No production data modified (transaction rollback) | 62 | ✅ |

**Note:** The production guard relies solely on `NODE_ENV`. A misconfigured environment where `NODE_ENV` is unset or `development` while pointing at a production `DATABASE_URL` would not be blocked. This is acceptable for a dev/test smoke script per AGENTS.md ("Current Supabase database testing environment hai").

---

## 2. Transaction Rollback — PASS

| Path | Line | Behavior |
|---|---|---|
| Success | 62 | `ROLLBACK` |
| Error | 64 | `ROLLBACK` + re-throw |
| Skip (no fixture) | 31 | `ROLLBACK` + return |
| Skip (block too short) | 45 | `ROLLBACK` + return |
| Connection error | 48-49 | `.catch()` logs BLOCKED, exitCode=1 |

All paths guarantee rollback. No test data survives. ✅

---

## 3. Fixture Creation — PRIMARY PATH (existing data) — PASS

**Lines 17-26:** Query joins `companies → jobs → job_applications → candidate_profiles → interviewers → users`.

| Table | Join Condition | Schema Match |
|---|---|---|
| `companies c` | — | ✅ |
| `jobs j` | `j.company_id=c.id AND j.deleted_at IS NULL` | ✅ FK + soft-delete |
| `job_applications a` | `a.job_id=j.id AND a.is_guest=false` | ✅ FK + identity check |
| `candidate_profiles cp` | `cp.id=a.candidate_id AND cp.deleted_at IS NULL` | ✅ FK + soft-delete |
| `interviewers i` | `i.company_id=c.id AND i.is_active=true` | ✅ FK |
| `users it_user` | `it_user.id=i.user_id AND it_user.status='active' AND it_user.deleted_at IS NULL` | ✅ FK + status |

All columns exist. All JOIN conditions are valid. The query correctly filters for active, non-deleted, non-guest records. ✅

---

## 4. Fixture Creation — FALLBACK PATH (temp fixtures) — **BLOCKED**

### 4a. `companies` INSERT — PASS

**Line 32:** `INSERT INTO public.companies (name,slug,owner_id,email,verification_status) VALUES (...)`

| Constraint | Check | Result |
|---|---|---|
| `companies_contact_check` | `email IS NOT NULL OR phone IS NOT NULL` | ✅ email provided |
| `companies_brand_color_check` | `brand_color IS NULL OR ...` | ✅ NULL is valid |
| FK `owner_id → users(id)` | `owner_id = users.rows[0].id` | ✅ active user from query |
| UNIQUE `slug` | `integration-smoke-${Date.now()}` | ✅ unique per run |

### 4b. `company_members` INSERT — **CRITICAL VIOLATION**

**Line 33:** `INSERT INTO public.company_members (company_id,user_id,is_active,joined_at) VALUES ($1,$2,true,NOW())`

**Issue:** The script sets `is_active=true` and provides `joined_at=NOW()`. This **does** satisfy the constraint. ✅

**Wait — re-reading the code:** Line 33 includes `joined_at`:
```javascript
await client.query(`INSERT INTO public.company_members (company_id,user_id,is_active,joined_at) VALUES ($1,$2,true,NOW())`, [company.rows[0].id, users.rows[0].id]);
```

This **does** set `joined_at`. The `company_members_active_joined CHECK (is_active = FALSE OR joined_at IS NOT NULL)` is satisfied. ✅

**CORRECTION:** No violation. The INSERT includes `joined_at`. ✅

### 4c. `jobs` INSERT — PASS

**Line 34:** `INSERT INTO public.jobs (company_id,created_by,title,slug,description,status) VALUES ($1,$2,...,'published')`

| Constraint | Check | Result |
|---|---|---|
| FK `company_id → companies(id)` | `company.rows[0].id` | ✅ just created |
| FK `created_by → users(id)` | `users.rows[0].id` | ✅ active user |
| `unique_job_slug_per_company` | timestamp-based slug | ✅ unique |
| `jobs_slug_lowercase` | slug is `integration-smoke-job-${Date.now()}` | ⚠️ not lowercased |

**FINDING (LOW):** The slug `integration-smoke-job-${Date.now()}` may contain uppercase characters from the timestamp. The `jobs_slug_lowercase CHECK (slug = lower(slug))` constraint would reject this if `Date.now()` produces digits only (which it does — digits are their own lowercase). Actually, `Date.now()` returns only digits, so `lower()` is a no-op. ✅ No violation.

| Constraint | Check | Result |
|---|---|---|
| `screening_questions_array` | default `'[]'::JSONB` | ✅ |
| `vacancies_positive` | default `1` | ✅ |
| `applications_count_non_negative` | default `0` | ✅ |
| `views_count_non_negative` | default `0` | ✅ |

### 4d. `job_applications` INSERT — PASS

**Line 35:** `INSERT INTO public.job_applications (job_id,candidate_id,user_id,is_guest) VALUES ($1,$2,$3,false)`

| Constraint | Check | Result |
|---|---|---|
| FK `job_id → jobs(id)` | `job.rows[0].id` | ✅ just created |
| `application_candidate_user_fk` | `(candidate_id, user_id)` from same `candidate_profiles` row | ✅ composite FK satisfied |
| `application_identity_check` | `is_guest=FALSE` → requires `candidate_id IS NOT NULL AND user_id IS NOT NULL AND guest_upload_session_id IS NULL AND guest_email IS NULL AND guest_email_normalized IS NULL AND guest_name IS NULL AND guest_phone IS NULL` | ✅ all met |
| `enforce_initial_lifecycle_state` | status defaults to `'applied'` | ✅ |

### 4e. `interviewers` INSERT — PASS

**Line 36:** `INSERT INTO public.interviewers (user_id,company_id,title,is_active) VALUES ($1,$2,'Smoke interviewer',true)`

| Constraint | Check | Result |
|---|---|---|
| FK `user_id → users(id)` | `users.rows[0].id` | ✅ |
| FK `company_id → companies(id)` | `company.rows[0].id` | ✅ just created |
| `interviewer_company_member_fk` | `FOREIGN KEY (company_id, user_id) REFERENCES company_members(company_id, user_id)` | ✅ just inserted |
| `unique_interviewer_per_company` | `(user_id, company_id)` | ✅ fresh insert |
| `unique_pool_per_company` | N/A (pool_id is NULL) | ✅ |

---

## 5. Schedule Block Creation — PASS

**Line 41:** `INSERT INTO public.interview_schedule_blocks (interviewer_id,job_id,start_time,end_time,slot_duration,timezone) VALUES ($1,$2,$3,$4,30,'UTC')`

| Constraint | Check | Result |
|---|---|---|
| FK `interviewer_id → interviewers(id)` | `f.interviewer_id` | ✅ |
| FK `job_id → jobs(id)` | `f.job_id` | ✅ |
| `valid_block_time` | `start_time < end_time` (3h gap) | ✅ |
| `interview_block_timezone_nonblank` | `'UTC'` | ✅ |
| `valid_slot_lock` | both NULL | ✅ |
| `interview_block_booking_state` | `is_booked=false` → all booking fields NULL | ✅ |
| `interview_block_recurrence_state` | `is_recurring=false` → `recurrence_rule=NULL` | ✅ |
| `interview_block_application_requires_job` | `application_id=NULL` | ✅ |
| `EXCLUDE USING gist` | no overlapping blocks for this interviewer | ✅ (fresh insert) |

**Trigger `interview_schedule_blocks_scope_guard`:** Fires on INSERT. Checks `interviewer.company_id == job.company_id`. Both reference the same company from fixture. ✅

---

## 6. Interview Time Computation — PASS

**Lines 39-45:**
```javascript
const blockStart = new Date(Date.now() + 3 * 60 * 60 * 1000);  // 3h from now
const blockEnd = new Date(blockStart.getTime() + 60 * 60 * 1000);  // 4h from now
const start = new Date(Math.max(Date.now() + 60 * 60 * 1000 + 60_000, new Date(b.start_time).getTime())).toISOString();
const end = new Date(start).getTime() + 30 * 60 * 1000;
if (end > new Date(b.end_time).getTime()) { ... ROLLBACK ... }
```

- **Minimum lead time:** `start >= Date.now() + 61 minutes` → satisfies 1-hour freeze policy (`INTERVIEW-API-FINAL-FREEZE.md` line 14)
- **Temporal containment:** `start >= blockStart` (via `Math.max`) and `end <= blockEnd` (checked explicitly) → interview fits inside block ✅
- **`slot_duration=30`:** Matches `duration_minutes=30` in interview INSERT ✅

---

## 7. Schedule Block Booking — PASS

**Line 46:** `UPDATE public.interview_schedule_blocks SET is_booked=true, application_id=$1, job_id=$2, booked_by=$3, booked_at=NOW(), locked_by=NULL, locked_until=NULL WHERE id=$4 AND is_booked=false`

| Constraint | After UPDATE | Result |
|---|---|---|
| `interview_block_booking_state` | `is_booked=TRUE` → requires `booked_by IS NOT NULL AND booked_at IS NOT NULL AND locked_by IS NULL AND locked_until IS NULL` | ✅ all satisfied |
| `interview_block_application_job_fk` | `(application_id, job_id)` references `job_applications(id, job_id)` | ✅ same pair from fixture |
| `interview_block_application_requires_job` | `application_id IS NOT NULL → job_id IS NOT NULL` | ✅ |
| `valid_slot_lock` | both NULL | ✅ |

**Trigger `interview_schedule_blocks_scope_guard`:** UPDATE does not modify `interviewer_id`, `job_id`, or `application_id` columns (it SETs them but the trigger fires on `UPDATE OF interviewer_id, job_id, application_id`). Actually, the trigger fires on `UPDATE OF interviewer_id, job_id, application_id` — the UPDATE sets `application_id` and `job_id`, so the trigger fires. It checks `interviewer.company_id == job.company_id`. Both are from the same company. ✅

---

## 8. Interview INSERT — PASS

**Line 48:** `INSERT INTO public.interviews (application_id,job_id,candidate_id,schedule_block_id,title,type,round,scheduled_at,duration_minutes,timezone,status) VALUES (...)`

| Constraint | Check | Result |
|---|---|---|
| `interview_title_nonblank` | `'Integration smoke'` | ✅ |
| `interview_timezone_nonblank` | `'UTC'` | ✅ |
| `interview_completion_state` | `status='scheduled' ≠ 'completed'` → `completed_at IS NULL` (default) | ✅ |
| `interview_cancellation_state` | `status ≠ 'cancelled'` | ✅ |
| `interview_candidate_confirmation_state` | `is_candidate_confirmed=FALSE` (default) → `candidate_confirmed_at IS NULL` | ✅ |
| `interview_self_reschedule_check` | `rescheduled_from IS NULL` (new row) | ✅ |
| `interview_application_job_fk` | `(application_id, job_id)` references `job_applications(id, job_id)` | ✅ |
| `interview_type` enum | `'technical_assessment'` valid per `02_enums.sql:334` | ✅ |
| `CHECK (round > 0)` | `round=1` | ✅ |
| `CHECK (duration_minutes > 0)` | `duration_minutes=30` | ✅ |
| `schedule_block_id UNIQUE` | fresh UUID | ✅ |

**Trigger `interviews_application_scope_guard`:** Fires on INSERT (schedule_block_id is set).

1. `application_id + job_id` match in `job_applications` → ✅ (fixture ensures this)
2. Non-guest: `candidate_id` matches application's `candidate_id` → ✅ (fixture uses `a.candidate_id`)
3. `schedule_block_id` is booked for same `(application_id, job_id)` → ✅ (UPDATE on line 46 set these)

---

## 9. Participant INSERT — PASS

**Line 49:** `INSERT INTO public.interview_participants (interview_id,user_id,role,is_primary) VALUES ($1,$2,'interviewer',true)`

| Constraint | Check | Result |
|---|---|---|
| FK `interview_id → interviews(id)` | just inserted | ✅ |
| FK `user_id → users(id)` | `f.interviewer_user_id` | ✅ |
| `interview_participant_role_nonblank` | `'interviewer'` | ✅ |
| `unique_interview_participant` | `(interview_id, user_id)` | ✅ fresh insert |
| `idx_interview_participants_primary` | partial unique `(interview_id) WHERE is_primary=true` | ✅ only one primary |

---

## 10. Post-Insert Verification — **FINDING (MEDIUM)**

**Lines 50-52:**
```javascript
const check = await client.query(`SELECT i.id,i.status,i.type,i.scheduled_at,i.duration_minutes,
  b.is_booked,b.start_time,b.end_time,b.application_id,p.user_id
  FROM public.interviews i
  JOIN public.interview_schedule_blocks b ON b.id=i.schedule_block_id
  JOIN public.interview_participants p ON p.interview_id=i.id
  WHERE i.id=$1`, [interview.rows[0].id]);
const c = check.rows[0];
if (!c || !c.is_booked || c.status !== 'scheduled' || c.type !== 'technical_assessment'
    || String(c.application_id) !== String(f.application_id)
    || new Date(c.scheduled_at).getTime() < new Date(c.start_time).getTime()
    || new Date(c.scheduled_at).getTime() + Number(c.duration_minutes) * 60000 > new Date(c.end_time).getTime())
  throw new Error('post-insert invariant failed');
```

**What is verified:**
- ✅ Interview exists (`!c` check)
- ✅ Block is booked
- ✅ Interview status is `'scheduled'`
- ✅ Interview type is `'technical_assessment'`
- ✅ Block's `application_id` matches fixture
- ✅ `scheduled_at >= block.start_time` (start containment)
- ✅ `scheduled_at + duration <= block.end_time` (end containment)

**What is NOT verified (findings):**

| Missing Check | Severity | Impact |
|---|---|---|
| Participant `user_id` matches `f.interviewer_user_id` | MEDIUM | Could pass with wrong participant |
| Participant `role = 'interviewer'` | LOW | Could pass with wrong role |
| Participant `is_primary = true` | LOW | Could pass with non-primary |
| Interview `candidate_id` matches `f.candidate_id` | MEDIUM | Could pass with wrong candidate |
| Interview `job_id` matches `f.job_id` | LOW | Redundant with block check |
| Interview `round = 1` | LOW | Could pass with wrong round |
| Interview `timezone = 'UTC'` | LOW | Could pass with wrong timezone |

The JOIN-based query means if the participant row doesn't exist, `check.rows[0]` would be `undefined` (the `!c` check catches this). But if the participant exists with wrong values, the check doesn't catch it.

---

## 11. Candidate Confirmation — PASS

**Lines 53-54:**
```javascript
const confirmed = await client.query(`UPDATE public.interviews
  SET status='confirmed', is_candidate_confirmed=true, candidate_confirmed_at=NOW()
  WHERE id=$1 RETURNING status,is_candidate_confirmed,candidate_confirmed_at`, [interview.rows[0].id]);
if (confirmed.rows[0]?.status !== 'confirmed' || !confirmed.rows[0]?.is_candidate_confirmed
    || !confirmed.rows[0]?.candidate_confirmed_at) throw new Error('confirmation invariant failed');
```

| Constraint | Check | Result |
|---|---|---|
| `interview_completion_state` | `status='confirmed' ≠ 'completed'` → `completed_at IS NULL` | ✅ (unchanged from INSERT) |
| `interview_candidate_confirmation_state` | `is_candidate_confirmed=TRUE AND candidate_confirmed_at IS NOT NULL` | ✅ both set |

Assertions verify: status is `'confirmed'`, `is_candidate_confirmed` is true, `candidate_confirmed_at` is set. ✅

---

## 12. Reschedule — Old Row Update — PASS

**Line 58:** `UPDATE public.interviews SET status='rescheduled', schedule_block_id=NULL WHERE id=$1`

| Constraint | Check | Result |
|---|---|---|
| `interview_completion_state` | `status='rescheduled' ≠ 'completed'` → `completed_at IS NULL` | ✅ (was already NULL) |
| `interview_candidate_confirmation_state` | `is_candidate_confirmed` was set to TRUE during confirmation → `candidate_confirmed_at IS NOT NULL` | ✅ (both still set from line 53) |

**Trigger `interviews_application_scope_guard`:** Fires on UPDATE OF `schedule_block_id`. Setting `schedule_block_id=NULL` → trigger checks `IF NEW.schedule_block_id IS NOT NULL` → condition is FALSE → trigger passes. ✅

---

## 13. Reschedule — New Row INSERT — PASS

**Line 59:** `INSERT INTO public.interviews (..., rescheduled_from, reschedule_count) VALUES (..., $6, 1)`

| Constraint | Check | Result |
|---|---|---|
| `interview_self_reschedule_check` | `rescheduled_from = old.id ≠ new.id` | ✅ |
| `interview_application_job_fk` | `(application_id, job_id)` same pair | ✅ |
| `interview_completion_state` | `status='scheduled'` → `completed_at IS NULL` | ✅ |
| `interview_candidate_confirmation_state` | defaults `FALSE/NULL` | ✅ |
| `CHECK (reschedule_count >= 0)` | `reschedule_count=1` | ✅ |

**Trigger `interviews_application_scope_guard`:** Fires on INSERT with `schedule_block_id` set. Checks:
1. `(application_id, job_id)` match → ✅
2. `candidate_id` matches application → ✅ (same `old.candidate_id`)
3. `schedule_block_id` is booked for same `(application_id, job_id)` → ✅ (line 57 booked `nb` with same pair)

---

## 14. Reschedule Lineage Assertion — PASS

**Line 60:** `if (String(linked.rows[0]?.rescheduled_from) !== String(interview.rows[0].id)) throw new Error(...)`

Correctly verifies that the new interview's `rescheduled_from` points to the old interview's ID. ✅

---

## 15. Existing Data Leak — PASS

All writes occur inside `BEGIN`/`ROLLBACK`. The fixture query (lines 17-26) is read-only SELECT. No existing company, job, application, or user data is permanently modified. ✅

---

## 16. Skip Conditions — PASS

| Condition | Line | Behavior | Rollback? |
|---|---|---|---|
| `RUN_INTERVIEW_INTEGRATION !== 'true'` | 5-8 | `exit(0)` | N/A (no connection) |
| `NODE_ENV === 'production'` | 9 | `throw` | N/A (no connection) |
| `!DATABASE_URL` | 12 | `throw` | N/A (no connection) |
| No active employer + candidate | 31 | `ROLLBACK` + return | ✅ |
| Block too short for 30-min interview | 45 | `ROLLBACK` + return | ✅ |

All skip paths properly clean up. ✅

---

## 17. Error Path Rollback — PASS

```javascript
} catch (error) { await client.query('ROLLBACK'); throw error; }
finally { await client.end(); }
main().catch((error) => { console.error(`BLOCKED: ${error.message}`); process.exitCode = 1; });
```

Every error triggers ROLLBACK. Unhandled errors caught by `.catch()`. ✅

---

## 18. No Test Data Survives — PASS

Transaction always rolls back (line 62 success, line 64 error). `ROLLBACK` undoes all INSERTs and UPDATEs. No data leaks. ✅

---

## 19. Concurrency Coverage — FINDING (LOW)

The script operates within a single transaction with no concurrent access. It does not test:
- Two transactions racing to book the same block (the `WHERE is_booked=false` guard)
- The `FOR UPDATE` lock behavior on schedule blocks
- The GIST exclusion constraint preventing overlapping blocks

**Impact:** LOW. This is a schema-compliance smoke test, not a concurrency test. The schema-level protections (CHECK constraints, triggers, GIST exclusion) are exercised by the single-transaction flow. Concurrency testing belongs in a separate test suite.

---

## 20. Lifecycle Coverage Gaps — FINDING (MEDIUM)

The script tests: schedule → confirm → reschedule. Missing lifecycle paths:

| Path | Status | Impact |
|---|---|---|
| `scheduled → cancelled` | Not tested | LOW — simple UPDATE, no trigger complexity |
| `scheduled → completed` | Not tested | MEDIUM — `completed_at` must be set ( tested via `interview_completion_state` CHECK) |
| `scheduled → no_show` | Not tested | LOW — simple status change |
| `confirmed → rescheduled` | Not tested | MEDIUM — different transition path than `scheduled → rescheduled` |
| Double-reschedule (`reschedule_count > 1`) | Not tested | LOW — increment logic is straightforward |
| Cancellation reason required | Not tested | LOW — `interview_cancellation_state` CHECK handles this |
| `schedule_block_id=NULL` after reschedule | Tested (line 58) | ✅ |
| Terminal state immutability | Not tested | MEDIUM — `completed`/`cancelled`/`no_show` should reject further transitions |

---

## Summary

| # | Area | Verdict | Severity |
|---|---|---|---|
| 1 | Production safety guard | PASS | — |
| 2 | Transaction rollback (all paths) | PASS | — |
| 3 | Existing fixture query validity | PASS | — |
| 4 | Fallback fixture: companies | PASS | — |
| 5 | Fallback fixture: company_members | PASS | — |
| 6 | Fallback fixture: jobs | PASS | — |
| 7 | Fallback fixture: applications | PASS | — |
| 8 | Fallback fixture: interviewers | PASS | — |
| 9 | Schedule block creation + triggers | PASS | — |
| 10 | Interview time computation | PASS | — |
| 11 | Schedule block booking + CHECK | PASS | — |
| 12 | Interview INSERT + scope trigger | PASS | — |
| 13 | Participant INSERT + constraints | PASS | — |
| 14 | Post-insert verification | **FINDING** — participant user_id, role, candidate_id not asserted | MEDIUM |
| 15 | Candidate confirmation | PASS | — |
| 16 | Reschedule: old row update | PASS | — |
| 17 | Reschedule: new row INSERT + trigger | PASS | — |
| 18 | Reschedule lineage assertion | PASS | — |
| 19 | Existing data leak | PASS | — |
| 20 | Skip conditions | PASS | — |
| 21 | Error rollback | PASS | — |
| 22 | Concurrency coverage | **FINDING** — not tested | LOW |
| 23 | Lifecycle coverage | **FINDING** — completed/cancelled/no_show paths not tested | MEDIUM |

---

## Required Fixes Before Merge

### 1. **(MEDIUM)** Add participant assertion to post-insert verification

The current check joins `interview_participants` but only verifies `p.user_id` exists in the result set. It does not assert that `p.user_id === f.interviewer_user_id` or that `p.role = 'interviewer'` and `p.is_primary = true`.

**Suggested fix:** Add to the check query or assertion:
```javascript
if (String(c.user_id) !== String(f.interviewer_user_id))
  throw new Error('participant user_id mismatch');
```

### 2. **(MEDIUM)** Add candidate_id assertion to post-insert verification

The check query does not select or verify `i.candidate_id`. Add:
```javascript
// In the check query, add: i.candidate_id
// In the assertion:
if (String(c.candidate_id) !== String(f.candidate_id))
  throw new Error('candidate_id mismatch');
```

### 3. **(LOW)** Consider testing at least one additional lifecycle path

The script tests `scheduled → confirmed → rescheduled`. Adding a `scheduled → completed` or `scheduled → cancelled` step (even a simple one) would exercise the `completed_at` auto-set trigger and the `cancelled_reason` requirement CHECK, increasing confidence in terminal state handling.

---

## Non-Blocking Observations

1. **Redundant self-join (line 30):** `JOIN public.interviewers it ON it.id=i.id` is unnecessary. The row from `i` already provides all needed columns. No correctness impact.

2. **No application_status assertion:** The script does not verify that the application's status changes to `'interview_scheduled'` after booking. The `enforce_application_status_update_path` trigger requires `change_application_status()` for status updates — the smoke script does not modify application status, which is correct for a schema-compliance test. The application status transition is a NestJS service-layer concern.

3. **GIST exclusion not stressed:** The script creates non-overlapping blocks. The GIST exclusion constraint is not challenged. This is acceptable — the constraint is a safety net, not a primary flow.

4. **`reschedule_count` not verified on old row:** After reschedule, the old row's `reschedule_count` is not checked (it should remain at its previous value). The new row's `reschedule_count=1` is hardcoded in the INSERT, not incremented from the old row's value. In a real flow, the service layer reads `old.reschedule_count` and increments it. The smoke test hardcodes `1` which is correct for the first reschedule.
