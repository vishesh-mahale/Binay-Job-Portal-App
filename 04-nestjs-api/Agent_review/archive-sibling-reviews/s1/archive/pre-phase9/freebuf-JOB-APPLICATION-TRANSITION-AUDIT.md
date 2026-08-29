# Freebuf - Job/Application Transition Policy Audit Report

**Status:** INDEPENDENT AUDIT COMPLETE  
**Date:** 2026-08-23  
**Agent:** Freebuf  
**Auditor Role:** Senior NestJS, PostgreSQL and Product Workflow Architect

---

## 1. Overall Verdict

### **APPROVED WITH MINOR FIXES**

| Category | Status |
|---|---|
| **Job Lifecycle** | ✅ APPROVED (enum-based, no SQL enforcement) |
| **Application Lifecycle** | ✅ APPROVED (SQL-enforced via `change_application_status()`) |
| **Terminal States** | ✅ CORRECT |
| **SQL Mismatches** | ⚠️ 2 MEDIUM (Job status not enforced in SQL) |
| **Product Decisions Required** | 6 items need clarification |
| **API Catalog Ready** | ✅ YES (pending final actor permissions) |

---

## 2. Files Inspected

| # | File | Purpose |
|---|---|---|
| 1 | `02_enums.sql` | Job and application status enum definitions |
| 2 | `05_jobs.sql` | Job table and lifecycle (no transition function) |
| 3 | `05_jobs_Explanation.md` | Job lifecycle documentation |
| 4 | `09_applications.sql` | Application table + `change_application_status()` function |
| 5 | `09_applications_Explanation.md` | Application lifecycle documentation |
| 6 | `PD-003-APPLICATION-HISTORY.md` | Application history product decision |
| 7 | `PHASE-04-STATE-MACHINES-AND-TRANSACTIONS.md` | State machine definitions |
| 8 | `DECISION-01-NESTJS-SUPABASE-ACCESS-MODEL-HINGLISH.md` | Access model |
| 9 | `JOB-APPLICATION-TRANSITION-QUESTIONS-HINGLISH.md` | Review questions |
| 10 | `CODEX-JOB-APPLICATION-TRANSITION-RECOMMENDATION-HINGLISH.md` | Codex recommendation |

---

## 3. Verified Current Behavior

### 3.1 Job Lifecycle (from `02_enums.sql`)

**Enum definition:**
```sql
CREATE TYPE job_status AS ENUM (
    'draft',
    'pending_approval',
    'published',
    'paused',
    'closed',
    'expired',
    'archived'
);
```

**Current enforcement:** NONE in SQL — NestJS must enforce transitions via application logic.

**Existing behavior:**
- No `change_job_status()` function exists
- Direct UPDATE on `jobs.status` is NOT blocked
- No `application_status_history` equivalent for jobs

### 3.2 Application Lifecycle (from `09_applications.sql`)

**Enum definition:**
```sql
CREATE TYPE application_status AS ENUM (
    'applied', 'under_review', 'shortlisted', 'screening',
    'interview_scheduled', 'interview_completed', 'selected',
    'offer_extended', 'offer_accepted', 'offer_declined',
    'rejected', 'withdrawn', 'on_hold'
);
```

**Current enforcement:** YES — `change_application_status()` function with explicit transition validation.

**Existing behavior:**
- Direct UPDATE blocked by trigger `enforce_application_status_update_path()`
- Status change + history + outbox event in single transaction
- Transition validation enforced at DB level

---

## 4. Proposed Transition Matrix

### 4.1 Job Status Transitions (Proposed — NOT in SQL)

```text
                    ┌─────────────────────────────────────────────────┐
                    │                    JOB LIFECYCLE                │
                    └─────────────────────────────────────────────────┘

draft ──────────────► pending_approval ──────────────► published
  │                       │                              │
  │                       │                              ├──────► paused
  │                       │                              │          │
  │                       │                              │          └──────► published
  │                       │                              │
  │                       │                              ├──────► closed (TERMINAL)
  │                       │                              ├──────► expired (TERMINAL)
  │                       │                              └──────► archived (TERMINAL)
  │                       │
  │                       └──────► draft (edit before approval)
  │
  └──────► archived (direct archive from draft)
```

**Terminal States:** `closed`, `expired`, `archived`

**Reopen Policy:** NOT ALLOWED — Repost = new `job_id` (consistent with PD-003 one-application-per-job)

### 4.2 Application Status Transitions (from SQL)

```text
                    ┌─────────────────────────────────────────────────┐
                    │               APPLICATION LIFECYCLE             │
                    └─────────────────────────────────────────────────┘

applied ────────────► under_review ────────────► screening ────────────► shortlisted
  │                       │                         │                       │
  │                       │                         │                       │
  ▼                       ▼                         ▼                       ▼
rejected              rejected                  rejected                  rejected
withdrawn            withdrawn                withdrawn                withdrawn
on_hold              on_hold                  on_hold                  on_hold
                                            interview_scheduled ◄────────────┘
                                                  │
                                                  ▼
                                           interview_completed
                                                  │
                                                  ▼
                                              selected
                                                  │
                                                  ▼
                                          offer_extended
                                                  │
                                          ┌───────┴───────┐
                                          ▼               ▼
                                   offer_accepted    offer_declined
                                     (TERMINAL)       (TERMINAL)

on_hold ────────────► (can return to any workflow state)
    │
    ├──────► under_review
    ├──────► screening
    ├──────► shortlisted
    ├──────► interview_scheduled
    ├──────► interview_completed
    ├──────► selected
    ├──────► offer_extended
    ├──────► rejected
    └──────► withdrawn
```

**Terminal States:** `offer_accepted`, `offer_declined`, `rejected`, `withdrawn`

---

## 5. Actor/Permission Matrix

### 5.1 Job Status Actors

| Transition | Actor | Status |
|---|---|---|
| `draft -> pending_approval` | Company Owner / Primary HR | ⚠️ NEEDS CLARIFICATION |
| `pending_approval -> draft` (edit) | Company Owner / Primary HR | ⚠️ NEEDS CLARIFICATION |
| `pending_approval -> published` | Company Owner / Admin | ⚠️ NEEDS CLARIFICATION |
| `published -> paused` | Company Owner / HR | ⚠️ NEEDS CLARIFICATION |
| `paused -> published` | Company Owner / HR | ⚠️ NEEDS CLARIFICATION |
| `published -> closed` | Company Owner / HR | ⚠️ NEEDS CLARIFICATION |
| `published -> expired` | System (automatic) | ✅ CONFIRMED |
| `published -> archived` | Company Owner / Admin | ⚠️ NEEDS CLARIFICATION |
| `closed/expired/archived -> any` | NOT ALLOWED | ✅ CONFIRMED |

### 5.2 Application Status Actors

| Transition | Actor | Source |
|---|---|---|
| `applied -> withdrawn` | Candidate (application owner) | SQL + Codex |
| `* -> under_review` | Authorized HR/Recruiter | Codex |
| `* -> screening` | Authorized HR/Recruiter | Codex |
| `* -> shortlisted` | Authorized HR/Recruiter | Codex |
| `* -> rejected` | Authorized HR/Recruiter | SQL + Codex |
| `* -> on_hold` | Authorized HR/Recruiter | Codex |
| `interview_* -> *` | Interview workflow + HR | Codex |
| `selected -> offer_extended` | Authorized HR/Company | Codex |
| `offer_extended -> offer_accepted` | Candidate | Codex |
| `offer_extended -> offer_declined` | Candidate | Codex |

**Note:** Exact actor permissions are NOT enforced in SQL — only transition rules are enforced. NestJS Guards must enforce actor permissions.

---

## 6. Terminal States

### 6.1 Job Terminal States

| State | Terminal? | Reopen Allowed? | Repost Policy |
|---|---|---|---|
| `closed` | ✅ YES | ❌ NO | New `job_id` required |
| `expired` | ✅ YES | ❌ NO | New `job_id` required |
| `archived` | ✅ YES | ❌ NO | New `job_id` required |

### 6.2 Application Terminal States

| State | Terminal? | Reverse Allowed? | Reapply for Same Job? |
|---|---|---|---|
| `offer_accepted` | ✅ YES | ❌ NO | ❌ NO (one-app-per-job) |
| `offer_declined` | ✅ YES | ❌ NO | ❌ NO (one-app-per-job) |
| `rejected` | ✅ YES | ❌ NO | ❌ NO (one-app-per-job) |
| `withdrawn` | ✅ YES | ❌ NO | ⚠️ NEEDS CLARIFICATION |

---

## 7. SQL Mismatch/Gaps

### 7.1 Job Status — NO SQL Enforcement

**Issue:** No `change_job_status()` function exists.

**Impact:**
- Direct `UPDATE jobs SET status = ...` is NOT blocked
- No transition validation at DB level
- No history/audit trail in SQL
- No outbox event on status change

**Recommendation:** Create `change_job_status()` function similar to `change_application_status()` OR document that NestJS will enforce all job transitions.

**Severity:** MEDIUM

### 7.2 Application Status — SQL Exists but Incomplete

**Issue:** `change_application_status()` does NOT set:
- `interview_scheduled_by` / `interview_scheduled_at`
- `offer_extended_by` / `offer_extended_at`
- `offer_accepted_by` / `offer_accepted_at`

**Current behavior:**
```sql
reviewed_by = CASE WHEN p_to_status = 'under_review' THEN p_changed_by ...
shortlisted_by = CASE WHEN p_to_status = 'shortlisted' THEN p_changed_by ...
rejected_by = CASE WHEN p_to_status = 'rejected' THEN p_changed_by ...
```

**Missing:**
- `interview_scheduled_by` / `interview_scheduled_at`
- `offer_extended_by` / `offer_extended_at`
- `offer_accepted_by` / `offer_accepted_at`

**Recommendation:** Extend `change_application_status()` to set all actor/timestamp fields.

**Severity:** LOW (can be handled in NestJS)

### 7.3 `on_hold` Transition — Overly Permissive

**Issue:** From `on_hold`, can transition to ANY workflow state:
```sql
(v_from_status = 'on_hold' AND p_to_status IN (
    'under_review','screening','shortlisted','interview_scheduled',
    'interview_completed','selected','offer_extended','rejected','withdrawn'
))
```

**Impact:** Allows `on_hold -> offer_extended` (skipping interview), `on_hold -> selected` (skipping screening)

**Recommendation:** Restrict `on_hold` returns to states that make business sense:
```sql
on_hold -> under_review, screening, shortlisted, interview_scheduled, rejected, withdrawn
```

**Severity:** MEDIUM (business logic gap)

---

## 8. Product Decisions Required

### 8.1 NEEDS CLARIFICATION Items

| # | Question | Current State | Decision Required |
|---|---|---|---|
| 1 | Who can publish a job? | Not defined | Company Owner? Primary HR? Admin? |
| 2 | Who can close/pause a job? | Not defined | Company Owner only? Any HR? |
| 3 | Can a withdrawn application be re-applied? | Not defined | `withdrawn` -> same job? Different job? |
| 4 | Can `on_hold` -> `selected` (skip interview)? | SQL allows | Business: Should this be blocked? |
| 5 | Is `rejection_reason` mandatory on reject? | SQL allows NULL | Business: Should it be required? |
| 6 | Who can archive a job? | Not defined | Company Owner? Admin? Auto-archive? |

### 8.2 Recommended Decisions (Pending Approval)

| # | Question | Recommendation | Rationale |
|---|---|---|---|
| 1 | Job publish actor | Company Owner + Primary HR approval | Standard approval workflow |
| 2 | Job close/pause actor | Company Owner or Primary HR | Owner-level control |
| 3 | Withdrawn re-apply | Allow re-apply for DIFFERENT job only | One-app-per-job policy |
| 4 | `on_hold` -> `selected` | Block (require interview) | Interview is mandatory before selection |
| 5 | `rejection_reason` mandatory | YES for HR-initiated rejection | Audit trail completeness |
| 6 | Archive actor | Company Owner or Admin | Administrative action |

---

## 9. API Catalog Requirements

### 9.1 Job Status API

```http
PATCH /jobs/:jobId/status
Authorization: Company Owner / Primary HR
Body: { "status": "published", "reason": "Approved after review" }
Response: 200 OK / 400 Invalid Transition / 403 Forbidden
```

### 9.2 Application Status API

```http
PATCH /applications/:applicationId/status
Authorization: Authorized HR / Recruiter
Body: { "status": "shortlisted", "reason": "Strong resume match" }
Response: 200 OK / 400 Invalid Transition / 403 Forbidden
```

### 9.3 Application Withdraw API

```http
POST /applications/:applicationId/withdraw
Authorization: Candidate (application owner)
Body: { "reason": "Found better opportunity" }
Response: 200 OK / 403 Not Owner / 400 Already Terminal
```

---

## 10. Exact Recommendations

### 10.1 Immediate Fixes (Before API Implementation)

1. **Extend `change_application_status()`** to set all actor/timestamp fields:
   - `interview_scheduled_by` / `interview_scheduled_at`
   - `offer_extended_by` / `offer_extended_at`
   - `offer_accepted_by` / `offer_accepted_at`

2. **Restrict `on_hold` transitions** to prevent skipping interview:
   ```sql
   on_hold -> under_review, screening, shortlisted, interview_scheduled, rejected, withdrawn
   ```

### 10.2 Decision Required (Before API Catalog Freeze)

3. **Clarify job status actors** — Who can publish/pause/close/archive?
4. **Clarify withdrawn re-apply policy** — Same job or different job only?
5. **Clarify rejection reason mandatory** — Required or optional?

### 10.3 Recommended (Not Blocking)

6. **Create `change_job_status()` function** — Optional but recommended for consistency
7. **Add job status history table** — For audit trail (if not using outbox only)

---

## 11. Implementation Readiness

### 11.1 Ready for NestJS Implementation

| Component | Status | Notes |
|---|---|---|
| **Application transition SQL** | ✅ READY | `change_application_status()` exists and works |
| **Job transition SQL** | ⚠️ PARTIAL | No function — NestJS must enforce |
| **Actor permissions** | ⚠️ TBD | SQL doesn't enforce — NestJS Guards required |
| **History/audit** | ✅ READY | `application_status_history` table exists |
| **Outbox events** | ✅ READY | `application.status.changed` event in function |
| **Idempotency** | ✅ READY | Same status = no-op (returns current status) |

### 11.2 NestJS Implementation Requirements

1. **Job Status Service:**
   - Explicit transition map (like SQL but in TypeScript)
   - Actor permission checks via Guards
   - History/audit writing (if no SQL function)
   - Outbox event insertion

2. **Application Status Service:**
   - Call `change_application_status()` via trusted DB connection
   - Actor permission checks via Guards
   - Return proper error codes for invalid transitions

3. **Transition Tests:**
   - Every valid transition succeeds
   - Every invalid transition fails with proper error
   - Terminal states cannot be exited
   - Concurrent updates handled correctly

---

## 12. Conclusion

### 12.1 What's SOLID

- ✅ Application transition SQL is well-enforced at DB level
- ✅ Terminal states are correctly defined
- ✅ One-app-per-job policy is enforced via UNIQUE constraint
- ✅ History/audit trail exists for applications
- ✅ Outbox events are emitted on status change
- ✅ Idempotency is handled (same status = no-op)

### 12.2 What Needs Work

- ⚠️ Job status has NO SQL enforcement (NestJS must handle)
- ⚠️ `on_hold` transitions are overly permissive
- ⚠️ Some actor permissions are undefined
- ⚠️ Application function missing some actor/timestamp fields

### 12.3 Final Status

**APPROVED WITH MINOR FIXES** — Safe to proceed with NestJS implementation after:
1. Extending `change_application_status()` function
2. Restricting `on_hold` transitions
3. Clarifying 3-4 product decisions (non-blocking for MVP)

---

**Report Generated:** 2026-08-23  
**Agent:** Freebuf  
**Status:** AUDIT COMPLETE
