# Interview API Decisions Architectural Review Report

**Target Scope:** `04-nestjs-api/project-docs/implementation-records/INTERVIEW-API-DECISION-QUESTIONS.md`  
**Auditor:** Antigravity (Senior Interview API Architect)  
**Date:** 2026-08-28  
**Report Location:** `04-nestjs-api/Agent_review/interview-api-decision-review/antigravity-review.md`  

---

## 1. Executive Verdict

### **APPROVED WITH CONDITIONS**

*(Reason: An independent cross-audit of `INTERVIEW-API-DECISION-QUESTIONS.md` against baseline SQL migration `10_interviews.sql`, `02_enums.sql`, `PHASE-06-API-CATALOG.md`, and event contracts confirms that the interview scheduling domain has robust database-level constraints [GIST overlap exclusion, company scope guards, immutable status transition triggers]. To unblock controller implementation, the 10 decision areas must be frozen according to the exact architectural recommendations below).*

---

## 2. 10-Point Architectural & Security Verification Table

| # | Decision Area | Recommended Decision & Evidence | Ground-Truth SQL Citation | Status |
|---|---|---|---|---|
| 1 | **Route Structure** | **Option C (Dual Route Architecture):** Company recruiter commands (`/api/v1/companies/:companyId/interviews/*`) + Participant self-service (`/api/v1/me/interviews/*`). | `10_interviews.sql` L201–202 & `PHASE-06-API-CATALOG.md`. | ✅ **RECOMMENDED** |
| 2 | **Actor Permissions** | Recruiter schedule/reschedule requires active company membership (`company_members`). Interviewers MUST belong to the hiring company (`interviewers` FK). Candidates confirm/decline only. | `10_interviews.sql` L74–76 (`interviewer_company_member_fk`). | ✅ **VERIFIED** |
| 3 | **Status Transitions** | `scheduled` -> `confirmed` / `rescheduled` / `completed` / `cancelled` / `no_show`. Terminal states (`completed`, `cancelled`, `no_show`) cannot be reopened. | `02_enums.sql` L341–348 (`interview_status`). | ✅ **VERIFIED** |
| 4 | **Schedule Locking** | PostgreSQL `EXCLUDE USING gist` prevents overlapping interviewer schedule blocks. Booking locks slot via `locked_by` / `locked_until` or atomic UPDATE. | `10_interviews.sql` L180–184 (GIST EXCLUDE) & L154–163. | ✅ **VERIFIED** |
| 5 | **Timezone & Time Rules** | All timestamps stored in `TIMESTAMPTZ` (UTC); IANA timezone string preserved (`timezone`). Past slots (`scheduled_at <= NOW()`) rejected with HTTP 400. | `10_interviews.sql` L133 & L212 (`timezone VARCHAR(50)`). | ✅ **RECOMMENDED** |
| 6 | **Candidate Confirmation** | `POST /me/interviews/:id/confirm` updates `is_candidate_confirmed = true` & `candidate_confirmed_at = NOW()`. Decline sets `status = 'cancelled'`. | `10_interviews.sql` L255–258 (`interview_candidate_confirmation_state`). | ✅ **VERIFIED** |
| 7 | **Notifications & Outbox** | Emit `interview.scheduled.v1`, `interview.rescheduled.v1`, `interview.cancelled.v1` in atomic outbox. Asynchronous dispatch via Cloud Tasks. | `DECISION-02` Realtime/Notification transport architecture. | ✅ **RECOMMENDED** |
| 8 | **External Integrations** | External Google/Outlook calendar API sync & automated Zoom room creation are **FUTURE SCOPE**. Phase 09 accepts manual `meeting_link` in DTO. | `10_interviews.sql` L5 ("External calendar/video integrations are future scope"). | ✅ **VERIFIED** |
| 9 | **Idempotency & Concurrency** | `schedule_block_id UNIQUE` constraint on `interviews` table prevents duplicate booking. Concurrent attempt returns `409 SLOT_ALREADY_BOOKED`. | `10_interviews.sql` L202 (`schedule_block_id UNIQUE`). | ✅ **VERIFIED** |
| 10 | **Required Testing Suite** | Unit tests for GIST overlap rejection, company scope guard trigger, terminal state reopen rejection, and atomic outbox emission. | Testing requirement. | ✅ **REQUIRED** |

---

## 3. Deep-Dive Analysis of Decisions Q1–Q6

### **Q1. Recommended Route Structure (Option C)**
- **Recruiter / Company Management Routes:**
  - `POST /api/v1/companies/:companyId/interviews` (Schedule new interview)
  - `GET /api/v1/companies/:companyId/interviews` (List company interviews)
  - `GET /api/v1/companies/:companyId/interviews/:interviewId` (Get detail)
  - `PATCH /api/v1/companies/:companyId/interviews/:interviewId` (Reschedule)
  - `POST /api/v1/companies/:companyId/interviews/:interviewId/cancel` (Cancel)
- **Candidate / Participant Routes:**
  - `GET /api/v1/me/interviews` (List candidate's scheduled interviews)
  - `GET /api/v1/me/interviews/:interviewId` (Get detail)
  - `POST /api/v1/me/interviews/:interviewId/confirm` (Confirm attendance)
  - `POST /api/v1/me/interviews/:interviewId/decline` (Decline attendance)

### **Q2. Actor Permissions & Interviewer Scope Guard**
- **Interviewer Company Isolation:** `10_interviews.sql` lines 74–76 enforce composite foreign key `CONSTRAINT interviewer_company_member_fk FOREIGN KEY (company_id, user_id) REFERENCES company_members(company_id, user_id)`. An interviewer CANNOT be assigned to an interview outside their active company membership.
- **Candidate Scope:** Candidates cannot arbitrary reschedule or cancel; candidates are restricted to `confirm` or `decline`.

### **Q3. Status Transition Matrix**
```text
scheduled -> confirmed           (Candidate confirm action)
scheduled -> rescheduled         (Recruiter reschedule action)
scheduled/confirmed -> completed (Recruiter/Interviewer post-interview mark)
scheduled/confirmed -> cancelled (Recruiter cancel or candidate decline)
scheduled/confirmed -> no_show   (Interviewer/Recruiter failure to appear)
```
- **Terminal States:** `completed`, `cancelled`, `no_show`. Once reached, no state mutation is allowed. Re-interviewing requires creating a new interview round (`round = round + 1`).

### **Q4. Schedule Block Overlap & Slot Locking**
- `10_interviews.sql` lines 180–184 define an `EXCLUDE USING gist` constraint on `interview_schedule_blocks(interviewer_id WITH =, tstzrange(start_time, end_time) WITH &&)`.
- Overlapping time slots for the same interviewer are impossible at the database layer.

### **Q5. Calendar & Video Integration Boundary**
- `10_interviews.sql` line 5 explicitly states: *"External Google/Microsoft calendar and video-provider integrations are future scope"*.
- NestJS DTO accepts `meeting_link` (string) and `meeting_provider` (`'zoom'`, `'google_meet'`, `'microsoft_teams'`, `'other'`) as manual input fields provided by the recruiter during scheduling.

---

## 4. Conflict Analysis

1. **API Catalog TBD Placeholder vs Database Schema:** `PHASE-06-API-CATALOG.md` marks interview routes as `TBD`. Baseline SQL `10_interviews.sql` has complete schema support. Resolution: Freeze Option C route signatures in API catalog.
2. **Video Integration Ambiguity:** `meeting_provider` enum exists in `02_enums.sql` L439, but automated video room generation is future scope per `10_interviews.sql` L5. Resolution: Accept manual meeting URLs in request DTO.

---

## 5. Conditions for Approval

1. **Freeze Option C Route Matrix** in `PHASE-06-API-CATALOG.md`.
2. **Enforce Past-Slot Rejection** (`scheduled_at > NOW() + INTERVAL '15 minutes'`).
3. **Defer External API Integrations** (Google/Outlook Calendar APIs); accept manual meeting URLs in DTO.

---

## 6. No-Code-Change Confirmation

I explicitly confirm that **zero source code, SQL migrations, or configuration files were modified** during this independent architectural review.
