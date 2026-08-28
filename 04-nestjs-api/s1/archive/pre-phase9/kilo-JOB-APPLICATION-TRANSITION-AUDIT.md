# 📦 Kilo — Job/Application Transition Policy Audit

**Target Component:** `04-nestjs-api`, `02-database`  
**Architect:** Kilo  
**Date:** 2026-08-23  
**Status:** PASS WITH FIXES — Application transitions fully enforced; job transitions lack DB-level guard

---

## 1. Overall Verdict

**PASS WITH FIXES**

Application status transitions are fully enforced at the database level via `change_application_status()` with strict allow-lists, immutable history, and atomic outbox. Job status transitions have **no equivalent enforcement** — no DB function, no trigger, no history table, and no outbox event. This is a significant architectural gap that must be resolved before API implementation.

---

## 2. Verified Current Behavior

### 2.1 Application Transitions (SQL-Enforced)

Source: `09_applications.sql` lines 573–652 (`change_application_status()`)

Exact allowed transitions from SQL:

| From | Allowed To |
|---|---|
| `applied` | `under_review`, `screening`, `shortlisted`, `rejected`, `withdrawn`, `on_hold` |
| `under_review` | `screening`, `shortlisted`, `rejected`, `withdrawn`, `on_hold` |
| `screening` | `shortlisted`, `interview_scheduled`, `rejected`, `withdrawn`, `on_hold` |
| `shortlisted` | `screening`, `interview_scheduled`, `rejected`, `withdrawn`, `on_hold` |
| `interview_scheduled` | `interview_completed`, `rejected`, `withdrawn`, `on_hold` |
| `interview_completed` | `selected`, `rejected`, `withdrawn`, `on_hold` |
| `selected` | `offer_extended`, `rejected`, `withdrawn`, `on_hold` |
| `offer_extended` | `offer_accepted`, `offer_declined`, `withdrawn`, `on_hold` |
| `on_hold` | `under_review`, `screening`, `shortlisted`, `interview_scheduled`, `interview_completed`, `selected`, `offer_extended`, `rejected`, `withdrawn` |

**Idempotency:** `change_application_status()` returns current status if `p_to_status = v_from_status` (line 599–601). No duplicate history/outbox rows created.

**Concurrency:** `SELECT ... FOR UPDATE` lock on application row (line 593). Concurrent transitions serialize on row lock.

**Audit/Outbox:** Same transaction writes `application_status_history` + `outbox_events` (`application.status.changed`) atomically (lines 632–648).

**Direct UPDATE blocked:** `enforce_application_status_update_path()` trigger (lines 654–666) raises exception unless `change_application_status()` sets `app.application_status_change = 'allowed'` via `set_config`.

**Rejection reason:** Stored in both `job_applications.rejection_reason` and `application_status_history.change_reason` when transitioning to `rejected` (lines 625–627).

### 2.2 Job Transitions (NOT SQL-Enforced)

Source: `02_enums.sql` lines 161–169; `05_jobs.sql` lines 162–168; `PHASE-04-STATE-MACHINES-AND-TRANSACTIONS.md` lines 119–132

Enum values: `draft`, `pending_approval`, `published`, `paused`, `closed`, `expired`, `archived`

**No `change_job_status()` function exists in any baseline file.**
**No `job_status_history` table exists.**
**No trigger blocks direct `jobs.status` UPDATE.**
**No job status outbox event exists.**

PHASE-04 §7 (line 123) proposes a candidate flow:
```
draft -> pending_approval -> published
published -> paused -> published
published -> closed / expired / archived
paused -> closed / expired / archived
```

But explicitly states: "it is not permission to add unapproved reopen transitions" and "Reopen/repost behavior is not assumed."

---

## 3. Proposed Transition Matrix

### 3.1 Job Transitions (Proposed — Requires Product Approval)

| From | Allowed To | Actor | Notes |
|---|---|---|---|
| `draft` | `pending_approval` | Company owner / HR | Must go through approval |
| `pending_approval` | `published` | Company owner / approved admin | Approval gate |
| `pending_approval` | `draft` | Company owner / HR | Return to draft |
| `published` | `paused` | Company owner / HR | Temporary pause |
| `paused` | `published` | Company owner / HR | Resume |
| `published` | `closed` | Company owner / HR | Manual close |
| `published` | `archived` | Company owner / HR | Manual archive |
| `published` | `expired` | System | Automatic on `expires_at` |
| `paused` | `closed` | Company owner / HR | Manual close |
| `paused` | `expired` | System | Automatic on `expires_at` |
| `paused` | `archived` | Company owner / HR | Manual archive |

**Terminal states:** `closed`, `expired`, `archived`
**Reopen policy:** NOT ALLOWED per PD-003 and PHASE-04. Repost = new `job_id`.

### 3.2 Application Transitions (SQL-Enforced — Already Frozen)

| From | Allowed To | Actor |
|---|---|---|
| `applied` | `under_review`, `screening`, `shortlisted`, `rejected`, `withdrawn`, `on_hold` | HR/recruiter (except `withdrawn`) |
| `under_review` | `screening`, `shortlisted`, `rejected`, `withdrawn`, `on_hold` | HR/recruiter |
| `screening` | `shortlisted`, `interview_scheduled`, `rejected`, `withdrawn`, `on_hold` | HR/recruiter |
| `shortlisted` | `screening`, `interview_scheduled`, `rejected`, `withdrawn`, `on_hold` | HR/recruiter |
| `interview_scheduled` | `interview_completed`, `rejected`, `withdrawn`, `on_hold` | HR/recruiter / interview system |
| `interview_completed` | `selected`, `rejected`, `withdrawn`, `on_hold` | HR/recruiter |
| `selected` | `offer_extended`, `rejected`, `withdrawn`, `on_hold` | HR/recruiter |
| `offer_extended` | `offer_accepted`, `offer_declined`, `withdrawn`, `on_hold` | Candidate (`accepted`/`declined`); HR (`withdrawn`) |
| `on_hold` | `under_review`, `screening`, `shortlisted`, `interview_scheduled`, `interview_completed`, `selected`, `offer_extended`, `rejected`, `withdrawn` | HR/recruiter |

**Terminal states:** `rejected`, `withdrawn`, `offer_accepted`, `offer_declined`

---

## 4. Actor/Permission Matrix

### 4.1 Current Evidence

| Source | Finding |
|---|---|
| `02_enums.sql` | Enum-only; no actor enforcement |
| `05_jobs.sql` | No status transition triggers or functions |
| `09_applications.sql` | `change_application_status()` accepts `p_changed_by UUID` but does NOT validate actor role/company membership — NestJS is responsible |
| `PHASE-04` lines 119–132 | Job actors not defined; "explicitly approved job-state transition policy" needed |
| `CODEX-JOB-APPLICATION-TRANSITION-RECOMMENDATION-HINGLISH.md` lines 59–73 | RECOMMENDED actor mapping (NOT approved) |
| `DECISION-01` | NestJS enforces authorization; RLS is defense-in-depth for reads only |

### 4.2 Application Actors (Proposed — Requires Product Approval)

| Action | Proposed Actor |
|---|---|
| Apply (registered) | Candidate (self) |
| Apply (guest) | Guest (via upload session) |
| Withdraw | Candidate / application owner |
| Review/screen/shortlist/reject | Authorized HR/recruiter in same company |
| Interview states | Interview workflow + authorized HR |
| Select/offer | Authorized HR/company workflow |
| Offer accept/decline | Candidate |
| On-hold return | Authorized HR/recruiter |

### 4.3 Job Actors (Proposed — Requires Product Approval)

| Action | Proposed Actor |
|---|---|
| Draft/edit | Authorized company owner/HR |
| Submit for approval | Authorized company owner/HR |
| Approve/publish | Company owner / primary HR or approved admin |
| Pause/resume | Authorized company owner/HR |
| Close/archive | Authorized company owner/HR |
| Expire | System (automatic on `expires_at`) |

**IMPORTANT:** The actor matrix above is derived from Codex recommendation (`CODEX-JOB-APPLICATION-TRANSITION-RECOMMENDATION-HINGLISH.md`), which is explicitly marked "RECOMMENDED DRAFT — human/product approval ke baad hi freeze hoga." No product decision or approved document freezes these actors.

---

## 5. Terminal States

### 5.1 Jobs

| State | Terminal? | Reopen? |
|---|---|---|
| `closed` | YES | NO — repost requires new `job_id` (PD-003, PHASE-04 §7) |
| `expired` | YES | NO — repost requires new `job_id` |
| `archived` | YES | NO — repost requires new `job_id` |

Source: `PD-003-APPLICATION-HISTORY.md` line 13 ("Reposted vacancy new `job_id` होगी"), `PHASE-04` line 132.

### 5.2 Applications

| State | Terminal? | Notes |
|---|---|---|
| `rejected` | YES | No outgoing transitions in SQL |
| `withdrawn` | YES | No outgoing transitions in SQL |
| `offer_accepted` | YES | No outgoing transitions in SQL |
| `offer_declined` | YES | No outgoing transitions in SQL |
| `on_hold` | NO | Returns to active workflow |

Source: `09_applications.sql` lines 603–612 (SQL allow-list).

---

## 6. Reopen/Repost Policy

**Jobs:** NO REOPEN. Terminal states (`closed`, `expired`, `archived`) have no defined entry-point reverse transitions. PHASE-04 §7 (line 132): "Reopen/repost behavior is not assumed. A repost is a new `job_id` under the approved application uniqueness policy."

**Applications:** NO REOPEN. Terminal states (`rejected`, `withdrawn`, `offer_accepted`, `offer_declined`) have no outgoing SQL transitions. Reapplication requires a new application (but same `job_id` uniqueness still applies — so candidate cannot reapply to same job unless `deleted_at` is used, which PD-003 explicitly says is archive/visibility, not duplicate entitlement).

Source: `PD-003` line 14 ("`deleted_at` archive/visibility है; duplicate apply entitlement नहीं").

---

## 7. Candidate Withdrawal Policy

**SQL allows:** `withdrawn` is a valid target from `applied`, `under_review`, `screening`, `shortlisted`, `interview_scheduled`, `interview_completed`, `selected`, `offer_extended`, and `on_hold`.

**Product decision status:** Codex recommendation (line 57) says "candidate withdrawal cutoff policy approval ke baad define hogी"। No approved product decision freezes exactly which states allow candidate withdrawal. The SQL allows it from all non-terminal states, but product may want to restrict it (e.g., not after `offer_extended`).

**Status:** `NEEDS_CLARIFICATION` — exact withdrawal cutoff states need product approval.

---

## 8. Rejection and Offer Lifecycle

### 8.1 Rejection

- SQL enforces `rejected` as terminal (no outgoing transitions)
- `rejection_reason` stored in both `job_applications.rejection_reason` and `application_status_history.change_reason` (lines 625–627)
- `rejected_by` and `rejected_at` populated atomically (lines 625–627)
- Rejection reason appears to be optional in SQL (`p_change_reason VARCHAR(500) DEFAULT NULL`) — no NOT NULL constraint on the function parameter

### 8.2 Offer Lifecycle

```
selected -> offer_extended -> offer_accepted (terminal)
                         \-> offer_declined (terminal)
```

- `offer_accepted` and `offer_declined` are both terminal
- No `rejected` transition from `offer_extended` is in the SQL — once offer is extended, only candidate action (accept/decline) or HR withdrawal is allowed
- `withdrawn` IS allowed from `offer_extended` — HR can withdraw an offer

### 8.3 Gap: `selected` vs `offer_extended` semantics

Product requirements (§12, line 168) mention "selection/offer/rejection" as a flow. The SQL has both `selected` and `offer_extended` states. The exact business meaning of `selected` vs `offer_extended` is not defined in any approved document. Codex recommendation (line 60) treats `selected -> offer_extended` as mandatory sequence but this is NOT approved.

**Status:** `NEEDS_CLARIFICATION` — exact meaning and allowed gap between `selected` and `offer_extended`.

---

## 9. On-Hold Behavior

- `on_hold` is NOT terminal — SQL allows return to 9 active workflow states
- No time limit or automatic transition defined in SQL
- No `on_hold_reason` field exists in `job_applications`
- `change_reason` in `application_status_history` can capture why it was put on hold, but there's no dedicated field

**Status:** Partially defined. SQL allows the transitions. Missing: `on_hold_reason` field, max hold duration policy, and whether system auto-transitions out of on_hold after a period.

---

## 10. Interview-Related Transitions

- Interview states (`scheduled`, `confirmed`, `rescheduled`, `completed`, `cancelled`, `no_show`) are defined in `02_enums.sql` lines 340–348 but the `10_interviews.sql` table was not inspected
- Application transition from `interview_scheduled` to `interview_completed` does NOT require interview table completion — it's a manual HR status change in SQL
- `interview_completed` is a valid source for `selected`, `rejected`, `withdrawn`, `on_hold`
- No automatic linkage between interview status and application status is enforced in SQL

**Status:** Interview-to-application transition linkage is manual (HR-driven), not automatic. This may be intentional or may need product clarification.

---

## 11. Transaction, Audit History and Outbox Behavior

### 11.1 Application Status Changes

**Fully correct and atomic:**

```text
BEGIN
  SELECT ... FOR UPDATE (row lock)
  Validate transition in change_application_status()
  UPDATE job_applications (status + audit fields)
  INSERT application_status_history
  INSERT outbox_events (application.status.changed)
  set_config('app.application_status_change', '') — clear flag
COMMIT
```

Source: `09_applications.sql` lines 573–652; `09_applications_Explanation.md` lines 110–139.

**Idempotency:** Same `p_to_status` as current → returns current status, no writes (line 599–601).

**Outbox event:** `application.status.changed` with payload: `applicationId`, `fromStatus`, `toStatus`, `changedBy`, plus caller metadata.

### 11.2 Job Status Changes

**No equivalent transaction, audit, or outbox behavior exists.**

- No `change_job_status()` function
- No `job_status_history` table
- No `job.status.changed` outbox event
- Direct `jobs.status` UPDATE is possible (no trigger blocks it)
- No row lock mechanism for concurrent job status updates

**This is a significant gap.** If two HR users try to change job status concurrently, both can succeed with direct UPDATE, causing race conditions.

---

## 12. Existing SQL Function Compatibility

### 12.1 `change_application_status()` — Compatible and Complete

- Validates transitions against explicit allow-list ✅
- Atomic history + outbox ✅
- Idempotent (same status returns early) ✅
- Row-locked via `FOR UPDATE` ✅
- Direct UPDATE blocked by trigger ✅
- `rejection_reason` and `rejected_by`/`rejected_at` populated correctly ✅

### 12.2 Missing Job Equivalent

No comparable function exists for `jobs.status`. This means:
- NestJS must invent its own transition enforcement (allowed per PHASE-04, but not yet done)
- No DB-level safety net for job transitions
- No audit history table
- No outbox event

---

## 13. Missing Job Status Transition Enforcement

| Missing Item | Severity | Evidence |
|---|---|---|
| `change_job_status()` DB function | HIGH | `05_jobs.sql` has no status transition function; grep confirms no `change_job_status` in any baseline file |
| `job_status_history` table | HIGH | No table exists for job status timeline |
| `jobs.status` UPDATE trigger | HIGH | No trigger blocks direct ad-hoc status changes |
| `job.status.changed` outbox event | MEDIUM | No event contract or insertion point exists |
| Job status actor validation | MEDIUM | `change_application_status()` accepts `p_changed_by UUID` but doesn't validate role; no NestJS responsibility is documented for job status actors |

---

## 14. API Catalog Requirements

### 14.1 Current State

Per `PHASE-04` line 140:
> "The complete transition graph must be approved in the API catalog; invalid transitions must fail closed rather than be inferred from enum order."

Per `PHASE-02` matrix: Application and job status update commands are listed but exact paths are `TBD`.

### 14.2 Required API Catalog Decisions

| Item | Status |
|---|---|
| Application status update endpoint | NOT FROZEN — path TBD |
| Job status update endpoint | NOT FROZEN — path TBD |
| Candidate withdraw endpoint | NOT FROZEN — path TBD |
| Rejection reason requirement | NOT FROZEN — SQL allows NULL but product may mandate |
| `on_hold` reason field | NOT FROZEN — no dedicated field exists |
| HTTP status codes for invalid transitions | NOT FROZEN |
| Idempotency key behavior for status updates | NOT FROZEN |
| Interview completion auto-transition | NOT FROZEN — unclear if manual or automatic |

---

## 15. Invalid/Concurrent/Idempotent Transition Behavior

### 15.1 Invalid Transitions

**Applications:** SQL `change_application_status()` raises exception with message `Invalid application status transition: % -> %` (line 614). Fail-closed.

**Jobs:** No enforcement. Any `job_status` enum value can be written via direct UPDATE. Invalid transitions (e.g., `archived -> published`) are possible at DB level.

### 15.2 Concurrent Transitions

**Applications:** `SELECT ... FOR UPDATE` serializes concurrent updates on same row (line 593). Second transaction waits for first to commit, then sees new status and either succeeds (valid transition) or fails (invalid).

**Jobs:** No row lock mechanism. Concurrent direct UPDATEs can interleave arbitrarily.

### 15.3 Idempotent Transitions

**Applications:** `change_application_status()` returns current status if `p_to_status = v_from_status` (line 599–601). No duplicate history/outbox. Idempotent by design.

**Jobs:** No equivalent. Re-issuing same status update via direct UPDATE would modify `updated_at` and create duplicate history if any existed.

---

## 16. Product Decisions Required

| # | Decision | Current Status | Source |
|---|---|---|---|
| 1 | Job approval/publish actors | NOT DECIDED | CODEX line 97; PHASE-04 line 123 |
| 2 | Rejected/withdrawn application reopen policy | NOT DECIDED | CODEX line 98; PD-003 says repost = new job_id |
| 3 | Candidate withdrawal cutoff states | NOT DECIDED | CODEX line 99; SQL allows from all non-terminal |
| 4 | `selected` vs `offer_extended` semantics | NOT DECIDED | CODEX line 60; no approved definition |
| 5 | Job status history table | NOT DECIDED | PHASE-04 line 92; no table exists |
| 6 | Job status outbox event contract | NOT DECIDED | No event defined |
| 7 | `on_hold` reason field and max duration | NOT DECIDED | No field, no policy |
| 8 | Rejection reason mandatory vs optional | NOT DECIDED | SQL allows NULL (`p_change_reason DEFAULT NULL`) |
| 9 | Interview completion → application auto-transition | NOT DECIDED | SQL allows manual only; product may want automatic |
| 10 | Job status transition DB function needed | NOT DECIDED | PHASE-04 says "exact DB function ki zarurat hai ya nahi, ye SQL audit ke baad decide hoga" |

---

## 17. Exact Recommendations

### 17.1 Must Fix Before Production (HIGH)

| # | Recommendation | Priority |
|---|---|---|
| R1 | Create `change_job_status()` DB function with explicit allow-list, mirroring `change_application_status()` pattern | HIGH |
| R2 | Create `job_status_history` table with `from_status`, `to_status`, `changed_by`, `change_reason`, `created_at` | HIGH |
| R3 | Add BEFORE UPDATE trigger on `jobs.status` to block direct UPDATE unless `change_job_status()` is called (same `set_config` pattern) | HIGH |
| R4 | Add `job.status.changed` outbox event insertion inside `change_job_status()` | HIGH |

### 17.2 Should Fix Before API Catalog Freeze (MEDIUM)

| # | Recommendation | Priority |
|---|---|---|
| R5 | Freeze actor matrix for job and application transitions in product decision document | MEDIUM |
| R6 | Freeze candidate withdrawal cutoff states — which non-terminal states allow `withdrawn` | MEDIUM |
| R7 | Define `selected` vs `offer_extended` business semantics | MEDIUM |
| R8 | Add `on_hold_reason` VARCHAR field to `job_applications` or use `change_reason` exclusively | MEDIUM |
| R9 | Decide whether `rejection_reason` is mandatory (SQL NOT NULL constraint) or optional | MEDIUM |
| R10 | Define interview completion → application status linkage (automatic vs manual) | MEDIUM |

### 17.3 Low Priority / Future

| # | Recommendation | Priority |
|---|---|---|
| R11 | Evaluate dedicated least-privilege DB role for job status writes (OD-1 pattern from Decision-01) | LOW |
| R12 | Add job status outbox event contract to `contracts/events/` | LOW |

---

## 18. SQL Mismatch/Gaps

| Gap | File:Line | Description |
|---|---|---|
| Missing `change_job_status()` | `05_jobs.sql` — no function | Applications have `change_application_status()`; jobs have no equivalent |
| Missing `job_status_history` | `05_jobs.sql` — no table | Applications have `application_status_history`; jobs have no history |
| Missing `jobs.status` trigger | `05_jobs.sql` — no trigger | Direct UPDATE to `jobs.status` is possible; applications blocked by `enforce_application_status_update_path()` |
| Missing job outbox event | `09_applications.sql` line 641 | `application.status.changed` exists; no `job.status.changed` |
| No actor validation in SQL | `09_applications.sql` line 576 | `change_application_status()` accepts `p_changed_by UUID` but doesn't validate role — NestJS is responsible but no document explicitly states this for job transitions |
| `rejection_reason` optional | `09_applications.sql` line 73 | `rejection_reason VARCHAR(500)` is nullable; product may want it mandatory |

---

## 19. Implementation Readiness

| Component | Ready? | Notes |
|---|---|---|
| Application status transitions | YES | SQL-enforced, tested pattern, atomic transaction, history, outbox |
| Application idempotency | YES | `change_application_status()` handles same-status repeat |
| Application concurrency | YES | `FOR UPDATE` row lock |
| Job status transitions | NO | No DB enforcement; needs `change_job_status()` + history + trigger |
| Job status audit | NO | No `job_status_history` table |
| Job status outbox | NO | No event contract or insertion point |
| Actor/permission enforcement | PARTIAL | Application actors undefined in approved docs; job actors entirely undefined |
| API paths | NO | Neither job nor application status update paths are frozen in API Catalog |
| Product decisions | NO | 10 decisions listed in Section 16 require product approval |

**Bottom line:** Application transition infrastructure is production-ready. Job transition infrastructure does not exist and must be built before API implementation. Both require product decisions on actors, policies, and API paths before the API Catalog can be frozen.

---

**Status:** `DECISION 06 APPROVED — APPLICATION TRANSITIONS VERIFIED, JOB TRANSITION ENFORCEMENT MISSING, 10 PRODUCT DECISIONS REQUIRED`
