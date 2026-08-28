# Smoke Script Revalidation — Focused Review

**Reviewer:** opencode  
**Script:** `04-nestjs-api/04-nestjs-api-app/scripts/interview-integration-smoke.js` (67 lines)  
**Scope:** Participant assertions, candidate_id assertion, rollback guarantee, fixture creation/cleanup  
**Date:** 2026-08-28

---

## Final Verdict: **PASS**

All four previously missing assertions are now present and correct. Transaction rollback guarantee is intact. No data retention or production risk introduced.

---

## Changes Since Last Review

The previous review (BLOCKED) identified two MEDIUM findings:

1. Post-insert verification did not assert `p.user_id`, `p.role`, `p.is_primary` on the participant row
2. Post-insert verification did not assert `i.candidate_id` on the interview row

Both have been fixed. The relevant lines are:

**Line 50 (check query SELECT):** Now selects `i.candidate_id`, `p.role`, `p.is_primary` in addition to the previous columns.

**Line 52 (assertion block):** Now includes:
- `String(c.candidate_id) !== String(f.candidate_id)` — candidate_id match
- `String(c.user_id) !== String(f.interviewer_user_id)` — participant user match
- `c.role !== 'interviewer'` — participant role match
- `!c.is_primary` — participant primary flag match

---

## Assertion Validation Against Schema

### 1. Participant `user_id` assertion — PASS

**Script:** `String(c.user_id) !== String(f.interviewer_user_id)`  
**Schema (`10_interviews.sql:391`):** `user_id UUID NOT NULL REFERENCES users(id)`

- Fixture `f.interviewer_user_id` comes from `i.user_id AS interviewer_user_id` (line 19), which JOINs `users it_user ON it_user.id=i.user_id` — guaranteed to be a valid `users(id)`.
- INSERT on line 49 uses `f.interviewer_user_id` as the `user_id` value.
- The assertion confirms the stored `user_id` matches the inserted value.
- FK `REFERENCES users(id)` is satisfied by construction.
- If the participant row doesn't exist, the INNER JOIN returns 0 rows → `!c` catches it. No false positive. ✅

### 2. Participant `role` assertion — PASS

**Script:** `c.role !== 'interviewer'`  
**Schema (`10_interviews.sql:392,400`):** `role VARCHAR(100) NOT NULL DEFAULT 'interviewer'` with `CHECK (role = BTRIM(role) AND role <> '')`

- INSERT on line 49 explicitly sets `role='interviewer'`.
- The assertion confirms the stored value matches.
- The CHECK constraint ensures non-blank trimmed role; `'interviewer'` satisfies this.
- If the participant row doesn't exist, the INNER JOIN returns 0 rows → `!c` catches it. No false positive. ✅

### 3. Participant `is_primary` assertion — PASS

**Script:** `!c.is_primary`  
**Schema (`10_interviews.sql:395,521-523`):** `is_primary BOOLEAN NOT NULL DEFAULT false` with partial unique index `idx_interview_participants_primary ON interview_participants(interview_id) WHERE is_primary = true`

- INSERT on line 49 explicitly sets `is_primary=true`.
- The assertion confirms the stored value is `true` (the `!c.is_primary` check throws if false).
- The partial unique index ensures at most one primary per interview; this is the only participant insert, so no conflict.
- If the participant row doesn't exist, the INNER JOIN returns 0 rows → `!c` catches it. No false positive. ✅

### 4. Interview `candidate_id` assertion — PASS

**Script:** `String(c.candidate_id) !== String(f.candidate_id)`  
**Schema (`10_interviews.sql:200,334`):** `candidate_id UUID REFERENCES candidate_profiles(id)` with trigger `validate_interview_application_scope` that checks `ELSIF NEW.candidate_id IS DISTINCT FROM v_application_candidate_id THEN RAISE EXCEPTION` for non-guest applications.

- Fixture `f.candidate_id` comes from `cp.id AS candidate_id` (line 19), which JOINs `job_applications a ON a.candidate_id=cp.id` — guaranteed to match the application's candidate.
- INSERT on line 48 uses `f.candidate_id` as the `candidate_id` value.
- The trigger on `10_interviews.sql:334` would reject the INSERT if `candidate_id` didn't match the application's `candidate_id` for non-guest apps.
- The assertion confirms the stored value matches the inserted value.
- If the interview row doesn't exist, the `!c` check catches it. No false positive. ✅

---

## Assertion Correctness Analysis

The check query on line 50 uses INNER JOINs:

```sql
FROM public.interviews i
JOIN public.interview_schedule_blocks b ON b.id=i.schedule_block_id
JOIN public.interview_participants p ON p.interview_id=i.id
WHERE i.id=$1
```

| Scenario | Rows Returned | `!c` check | Assertion behavior |
|---|---|---|---|
| Interview exists, block exists, participant exists | 1 row | passes | assertions run |
| Interview exists, block exists, participant missing | 0 rows | **throws** | correct — participant required |
| Interview exists, block missing | 0 rows | **throws** | correct — block required |
| Interview missing | 0 rows | **throws** | correct — interview required |
| Participant exists with wrong user_id/role/is_primary | 1 row | passes | **assertion throws** — correct |
| Interview exists with wrong candidate_id | 1 row | passes | **assertion throws** — correct |

No false positive path exists. Every invariant failure is caught. ✅

---

## Transaction Rollback Guarantee — PASS (unchanged)

| Path | Line | Behavior |
|---|---|---|
| Success | 62 | `ROLLBACK` |
| Error (any) | 64 | `ROLLBACK` + re-throw |
| Skip (no fixture) | 31 | `ROLLBACK` + return |
| Skip (block too short) | 45 | `ROLLBACK` + return |

The new assertions on line 52 are pure reads (SELECT result checks). They do not introduce new writes. If an assertion throws, the catch block on line 64 triggers ROLLBACK. Rollback guarantee is intact. ✅

---

## Fixture Creation and Cleanup — PASS (unchanged)

**Primary path (existing data, lines 17-27):** Read-only SELECT. No writes. ✅

**Fallback path (temp fixtures, lines 28-37):**

| INSERT | Table | Key Constraints Satisfied |
|---|---|---|
| Line 32 | `companies` | `companies_contact_check` (email provided), FK `owner_id → users(id)`, UNIQUE `slug` |
| Line 33 | `company_members` | FK `(company_id, user_id)` refs `company_members`, `company_members_active_joined` (`is_active=true` + `joined_at=NOW()`) |
| Line 34 | `jobs` | FK `company_id → companies(id)`, FK `created_by → users(id)`, UNIQUE `(company_id, slug)`, `jobs_slug_lowercase` (digits only) |
| Line 35 | `job_applications` | FK `job_id → jobs(id)`, `application_candidate_user_fk` (composite FK from same `candidate_profiles` row), `application_identity_check` (`is_guest=FALSE` path) |
| Line 36 | `interviewers` | FK `user_id → users(id)`, FK `company_id → companies(id)`, `interviewer_company_member_fk` (composite FK satisfied by line 33) |

All fallback INSERTs satisfy their respective FK, CHECK, and trigger constraints. ✅

**Cleanup:** All writes inside `BEGIN`/`ROLLBACK`. No test data survives. ✅

---

## No Data Retention or Production Risk — PASS

- Primary path: read-only SELECT, no data modified
- Fallback path: all INSERTs inside rolled-back transaction
- Production guard: `NODE_ENV === 'production'` throws before connection
- Opt-in gate: `RUN_INTERVIEW_INTEGRATION !== 'true'` exits before connection
- No secrets, tokens, or credentials in the script

✅

---

## Summary

| Check | Result |
|---|---|
| Participant `user_id` assertion | ✅ correct, no false positive |
| Participant `role` assertion | ✅ correct, no false positive |
| Participant `is_primary` assertion | ✅ correct, no false positive |
| Interview `candidate_id` assertion | ✅ correct, no false positive |
| Assertion JOIN logic (no false positives) | ✅ verified |
| Transaction rollback guarantee | ✅ intact |
| Fixture creation constraints | ✅ all satisfied |
| Fixture cleanup (rollback) | ✅ no data survives |
| No production risk | ✅ |
