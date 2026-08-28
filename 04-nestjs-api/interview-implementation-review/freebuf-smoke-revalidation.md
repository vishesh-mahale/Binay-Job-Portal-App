# Interview Smoke Test — Focused Revalidation

**Script:** `04-nestjs-api/04-nestjs-api-app/scripts/interview-integration-smoke.js`
**Reviewer:** Freebuf
**Date:** 2026-08-28
**Verdict:** ✅ **PASS**

---

## 1. Scope

This review focuses **only** on the latest changes to the smoke test:

- Participant `user_id` assertion
- Participant `role` assertion
- Participant `is_primary` assertion
- Interview `candidate_id` assertion
- Transaction rollback guarantee
- Fixture creation and cleanup
- No data retention or production risk

---

## 2. Changes Verified

### 2.1 Check Query — New SELECT Fields

**Line 50 — Previous version:**
```sql
SELECT i.id,i.status,i.type,i.scheduled_at,i.duration_minutes,
       b.is_booked,b.start_time,b.end_time,b.application_id,p.user_id
```

**Line 50 — Current version:**
```sql
SELECT i.id,i.status,i.type,i.candidate_id,i.scheduled_at,i.duration_minutes,
       b.is_booked,b.start_time,b.end_time,b.application_id,
       p.user_id,p.role,p.is_primary
```

**3 new fields added to SELECT:** `i.candidate_id`, `p.role`, `p.is_primary`

| Field | Source Table | Column Exists? | SQL Evidence |
|-------|-------------|---------------|--------------|
| `i.candidate_id` | `interviews` | ✅ | `10_interviews.sql:180` — `candidate_id UUID REFERENCES candidate_profiles(id)` |
| `p.user_id` | `interview_participants` | ✅ | `10_interviews.sql:267` — `user_id UUID NOT NULL REFERENCES users(id)` |
| `p.role` | `interview_participants` | ✅ | `10_interviews.sql:268` — `role VARCHAR(100) NOT NULL DEFAULT 'interviewer'` |
| `p.is_primary` | `interview_participants` | ✅ | `10_interviews.sql:270` — `is_primary BOOLEAN NOT NULL DEFAULT false` |

**All 4 fields verified against SQL baselines. Zero invented columns.**

---

### 2.2 Assertion — Expanded from 6 to 11 Conditions

**Line 52 — Previous version (6 conditions):**
```js
if (!c || !c.is_booked || c.status !== 'scheduled' || c.type !== 'technical_assessment'
    || String(c.application_id) !== String(f.application_id)
    || new Date(c.scheduled_at).getTime() < new Date(c.start_time).getTime()
    || new Date(c.scheduled_at).getTime() + Number(c.duration_minutes) * 60000 > new Date(c.end_time).getTime())
```

**Line 52 — Current version (11 conditions):**
```js
if (!c || !c.is_booked || c.status !== 'scheduled' || c.type !== 'technical_assessment'
    || String(c.application_id) !== String(f.application_id)
    || String(c.candidate_id) !== String(f.candidate_id)           // NEW
    || String(c.user_id) !== String(f.interviewer_user_id)          // NEW
    || c.role !== 'interviewer'                                      // NEW
    || !c.is_primary                                                 // NEW
    || new Date(c.scheduled_at).getTime() < new Date(c.start_time).getTime()
    || new Date(c.scheduled_at).getTime() + Number(c.duration_minutes) * 60000 > new Date(c.end_time).getTime())
```

**5 new assertion conditions added:**

| # | Condition | What it verifies | Correct? |
|---|-----------|-----------------|----------|
| 1 | `String(c.candidate_id) !== String(f.candidate_id)` | Interview's `candidate_id` matches the fixture candidate | ✅ UUID comparison via String coercion |
| 2 | `String(c.user_id) !== String(f.interviewer_user_id)` | Participant's `user_id` matches the interviewer's user | ✅ UUID comparison via String coercion |
| 3 | `c.role !== 'interviewer'` | Participant role is exactly `'interviewer'` | ✅ Matches INSERT on line 47 |
| 4 | `!c.is_primary` | Participant is marked as primary interviewer | ✅ Matches INSERT on line 47 (`is_primary=true`) |

**All 4 new assertions are correct and meaningful.**

---

### 2.3 Candidate ID Assertion — Detailed Verification

```js
String(c.candidate_id) !== String(f.candidate_id)
```

**Data flow:**
1. `f.candidate_id` comes from fixture query (line 19): `cp.id AS candidate_id`
2. Interview INSERT (line 48): `$3` = `f.candidate_id` → `candidate_id` column
3. Check query (line 50): `i.candidate_id` → read back
4. Assertion: compare read-back value against original

**SQL column:** `interviews.candidate_id UUID REFERENCES candidate_profiles(id) ON DELETE RESTRICT` (`10_interviews.sql:180`)

**Trigger validation:** `interview_application_scope_guard` (`10_interviews.sql:193`) verifies that `candidate_id` matches the application's candidate for registered applications.

**Correct.** The assertion confirms the `candidate_id` roundtrip: INSERT → SELECT → compare.

---

### 2.4 Participant User ID Assertion — Detailed Verification

```js
String(c.user_id) !== String(f.interviewer_user_id)
```

**Data flow:**
1. `f.interviewer_user_id` comes from fixture query (line 19): `i.user_id AS interviewer_user_id`
2. Participant INSERT (line 47): `$2` = `f.interviewer_user_id` → `user_id` column
3. Check query (line 50): `p.user_id` → read back via JOIN `p.interview_id=i.id`
4. Assertion: compare read-back value against original

**SQL column:** `interview_participants.user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT` (`10_interviews.sql:267`)

**Correct.** Confirms participant linkage to the correct interviewer user.

---

### 2.5 Participant Role Assertion — Detailed Verification

```js
c.role !== 'interviewer'
```

**Data flow:**
1. Participant INSERT (line 47): hardcoded `'interviewer'` → `role` column
2. Check query (line 50): `p.role` → read back
3. Assertion: `c.role !== 'interviewer'` — must be exactly `'interviewer'`

**SQL column:** `interview_participants.role VARCHAR(100) NOT NULL DEFAULT 'interviewer'` (`10_interviews.sql:268`)

**SQL CHECK:** `interview_participant_role_nonblank CHECK (role = BTRIM(role) AND role <> '')` (`10_interviews.sql:272`)

**Correct.** The hardcoded INSERT value and assertion value match exactly.

---

### 2.6 Participant Is Primary Assertion — Detailed Verification

```js
!c.is_primary
```

**Data flow:**
1. Participant INSERT (line 47): hardcoded `true` → `is_primary` column
2. Check query (line 50): `p.is_primary` → read back
3. Assertion: `!c.is_primary` — must be truthy (i.e., `true`)

**SQL column:** `interview_participants.is_primary BOOLEAN NOT NULL DEFAULT false` (`10_interviews.sql:270`)

**SQL unique index:** `idx_interview_participants_primary UNIQUE (interview_id) WHERE is_primary = true` (`10_interviews.sql:293`) — ensures only one primary interviewer per interview.

**Correct.** Confirms the participant is the lead interviewer.

---

## 3. Transaction Rollback Guarantee

| Path | Line | Behavior | Result |
|------|------|----------|--------|
| Success | 120 | `await client.query('ROLLBACK')` | ✅ |
| Skip (no fixture) | 30 | `await client.query('ROLLBACK'); return` | ✅ |
| Skip (block too short) | 37 | `await client.query('ROLLBACK'); return` | ✅ |
| Error | 122 | `await client.query('ROLLBACK')` in catch | ✅ |
| Connection cleanup | 122 | `finally { await client.end() }` | ✅ |

**No COMMIT path exists.** All 5 execution paths end with ROLLBACK + client.end(). **Guaranteed rollback.**

---

## 4. Fixture Creation and Cleanup

### Creation (lines 23-43)

| INSERT | Table | FK/Check Validated? | Result |
|--------|-------|---------------------|--------|
| Company | `companies` | `owner_id → users.id`, `slug UNIQUE`, `email` | ✅ |
| Member | `company_members` | `company_id → companies.id`, `user_id → users.id`, `is_active + joined_at` CHECK | ✅ |
| Job | `jobs` | `company_id → companies.id`, `created_by → users.id`, `slug UNIQUE per company` | ✅ |
| Application | `job_applications` | `job_id → jobs.id`, `(candidate_id, user_id) → candidate_profiles(id, user_id)`, identity CHECK | ✅ |
| Interviewer | `interviewers` | `user_id → users.id`, `company_id → companies.id`, FK → `company_members(company_id, user_id)` | ✅ |
| Block | `interview_schedule_blocks` | `interviewer_id → interviewers.id`, `job_id → jobs.id`, time CHECK, GIST exclusion | ✅ |

### Cleanup

All created inside `BEGIN ... ROLLBACK`. **No test data survives.** ✅

---

## 5. No Data Retention or Production Risk

| Risk | Mitigation | Result |
|------|-----------|--------|
| Production data modified | Read-only fixture SELECT; UPDATE only on freshly created unbooked blocks | ✅ |
| Test data retained | Entire transaction rolled back; no COMMIT path | ✅ |
| Production environment | `NODE_ENV === 'production'` guard + explicit opt-in flag | ✅ |
| Orphan rows | All FKs enforced by PostgreSQL; ROLLBACK removes all test rows | ✅ |
| Existing bookings touched | Fixture query filters `is_booked=false AND application_id IS NULL` | ✅ |

**No production risk.**

---

## 6. Previous Review Findings — Status

| Finding | Previous Severity | Status | Evidence |
|---------|-------------------|--------|----------|
| H-1: Lock overwrite in booking UPDATE | HIGH | ⚠️ Still present | `locked_by=NULL, locked_until=NULL` in SET clause |
| M-1: `NODE_ENV` insufficient guard | MEDIUM | ⚠️ Still present | Only checks `'production'` |
| M-2: No negative constraint tests | MEDIUM | ⚠️ Still present | No constraint-violation tests |
| M-3: No terminal state tests | MEDIUM | ⚠️ Still present | No `completed`/`cancelled`/`no_show` tests |
| L-1: `rejectUnauthorized: false` | LOW | ⚠️ Still present | Same SSL config |
| L-2: ROLLBACK edge case | LOW | ⚠️ Still present | Same catch block |

**Note:** These findings are carried forward from the previous review. The current review scope is **only** the latest changes (participant/candidate assertions), not the full script. The carried-forward findings remain valid but are out of scope for this revalidation.

---

## 7. Summary

### What Changed (This Review)

| Change | Verified? | Correct? |
|--------|-----------|----------|
| `i.candidate_id` added to SELECT | ✅ Column exists in `interviews` table | ✅ |
| `p.user_id` added to SELECT | ✅ Column exists in `interview_participants` table | ✅ |
| `p.role` added to SELECT | ✅ Column exists in `interview_participants` table | ✅ |
| `p.is_primary` added to SELECT | ✅ Column exists in `interview_participants` table | ✅ |
| `candidate_id` assertion | ✅ UUID roundtrip verified | ✅ |
| `user_id` assertion | ✅ Participant→interviewer linkage verified | ✅ |
| `role` assertion | ✅ Matches hardcoded INSERT value | ✅ |
| `is_primary` assertion | ✅ Matches hardcoded INSERT value | ✅ |
| Transaction rollback | ✅ All 5 paths covered | ✅ |
| Fixture creation | ✅ All 6 INSERTs valid | ✅ |
| No data retention | ✅ No COMMIT path | ✅ |

### Findings

| # | Severity | Finding | In Scope? |
|---|----------|---------|-----------|
| — | ✅ PASS | All 4 new assertions are correct and meaningful | Yes |
| — | ✅ PASS | Transaction rollback guaranteed on all paths | Yes |
| — | ✅ PASS | Fixture creation valid against all FK/check/trigger constraints | Yes |
| — | ✅ PASS | No test data survives (no COMMIT path) | Yes |
| — | ✅ PASS | No production risk | Yes |
| H-1 | 🟡 HIGH | Lock overwrite in booking UPDATE | Previous (carried forward) |
| M-1..M-3 | 🟡 MEDIUM | Production guard, negative tests, terminal states | Previous (carried forward) |
| L-1..L-2 | 🟢 LOW | SSL, ROLLBACK edge case | Previous (carried forward) |

---

## 8. Final Verdict

| Category | Status |
|----------|--------|
| **BLOCKERs** | ✅ Zero |
| **New HIGH** | ✅ Zero |
| **New MEDIUM** | ✅ Zero |
| **New LOW** | ✅ Zero |
| **Carried-forward** | 1 HIGH, 3 MEDIUM, 2 LOW (out of scope for this revalidation) |
| **Overall** | ✅ **PASS** |

**All 4 latest changes (candidate_id, user_id, role, is_primary assertions) are correct, meaningful, and verified against SQL baselines. The transaction rollback guarantee, fixture creation, and data retention safety are all sound.**
