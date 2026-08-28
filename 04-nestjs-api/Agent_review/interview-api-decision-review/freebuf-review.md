# Interview API Decisions — Independent Audit

**Auditor:** Freebuf  
**Date:** 2026-08-28  
**Audit Target:** `INTERVIEW-API-DECISION-QUESTIONS.md`  
**SQL Baseline:** `10_interviews.sql`, `02_enums.sql`  
**API Catalog:** `PHASE-06-API-CATALOG.md` §3G  
**Requirements:** `REQ-INTERVIEW-001..003` (Phase 1/2/5)  
**Dispatcher:** `event-route.registry.ts`  
**Contracts:** None exist for interview events/tasks

---

## 1. Executive Summary

**Verdict: APPROVED WITH CONDITIONS**

The decision document identifies 6 questions (Q1–Q6), not 10. The document is **honest and well-scoped** — it correctly avoids inventing behavior and correctly defers to SQL schema as ground truth. However, several questions are **incomplete** compared to what the SQL schema already provides, and one question conflates two distinct concerns.

| Issue | Severity | Finding |
|-------|----------|---------|
| Q1 | MEDIUM | Only 3 route options presented; SQL supports both company-scoped and application-scoped reads — Option C should be split |
| Q2 | HIGH | Permissions incomplete — no interviewer-as-actor for schedule, no `no_show` transition actor defined |
| Q3 | MEDIUM | No transition matrix provided; SQL has no transition function (unlike applications) — transitions are application-level only |
| Q4 | MEDIUM | Timezone handling underspecified — SQL stores per-availability, per-block, and per-interview timezone |
| Q5 | MEDIUM | Calendar/video correctly deferred as FUTURE; notification event ownership unclear |
| Q6 | MEDIUM | Slot locking uses GIST exclusion + `locked_by/locked_until` but no NestJS-level lock implementation path defined |

---

## 2. Evidence Table

| Source | File | Key Evidence |
|--------|------|-------------|
| Interview tables | `10_interviews.sql` | 8 tables: `interview_pools`, `interviewers`, `interviewer_availability`, `interview_schedule_blocks`, `interviews`, `interview_participants`, `interview_feedback`, `interview_documents` |
| Interview status enum | `02_enums.sql:341–347` | 6 values: `scheduled`, `confirmed`, `rescheduled`, `completed`, `cancelled`, `no_show` |
| Interview type enum | `02_enums.sql:330–337` | 6 values: `phone`, `video`, `in_person`, `technical_assessment`, `group`, `panel` |
| Interview decision enum | `02_enums.sql:356–365` | 5 values: `strong_hire`, `hire`, `maybe`, `no_hire`, `strong_no_hire` |
| Meeting provider enum | `02_enums.sql:439–444` | 5 values: `zoom`, `google_meet`, `microsoft_teams`, `webex`, `other` |
| Slot overlap prevention | `10_interviews.sql:100–105` | `EXCLUDE USING gist (interviewer_id WITH =, tstzrange(start_time, end_time) WITH &&)` |
| Slot locking | `10_interviews.sql:76–77` | `locked_by UUID`, `locked_until TIMESTAMPTZ` with CHECK constraint |
| Block booking state | `10_interviews.sql:82–88` | CHECK: booked block must have `booked_by`, `booked_at`, and `locked_by IS NULL` |
| Application scope guard | `10_interviews.sql:170–218` | `validate_interview_application_scope()` — validates application/job/candidate/pool/block same-company |
| Block scope guard | `10_interviews.sql:155–168` | `validate_interview_schedule_block_scope()` — validates job and interviewer same-company |
| Interviewer FK | `10_interviews.sql:46–48` | `interviewer_company_member_fk` — interviewer must be active `company_members` row |
| Feedback immutability | `10_interviews.sql:289–295` | `protect_final_interview_feedback()` — submitted feedback cannot be updated/deleted |
| Dispatcher route | `event-route.registry.ts:68–71` | `interview.summary.requested` → `/internal/tasks/interview/summary` |
| API catalog | `PHASE-06-API-CATALOG.md:683–705` | `API-INTERVIEW-001` — method/path TBD; actor: "authorized HR/interviewer and participating candidate where allowed" |
| Requirements | `PHASE-01-REQUIREMENTS-CONSOLIDATION.md:133–135` | `REQ-INTERVIEW-001` APPROVED DIRECTION; `REQ-INTERVIEW-002` APPROVED DIRECTION; `REQ-INTERVIEW-003` FUTURE |

---

## 3. Decision-by-Decision Audit

### Q1. Route Shape

**Decision document presents:** 3 options (company-scoped, application-scoped, both)

**SQL evidence:**
- `interviews` table has both `application_id` (NOT NULL) and `job_id` (NOT NULL) — `10_interviews.sql:219`
- `interview_participants` has `interview_id` and `user_id` — participants are users, not company members
- Candidate view: candidate needs to see their own interviews across all companies
- HR view: HR needs to see interviews scoped to a specific company/application
- `idx_interviews_candidate ON interviews(candidate_id, status)` — `10_interviews.sql:298`
- `idx_interviews_application ON interviews(application_id)` — `10_interviews.sql:304`

**Recommendation: Option C (both) but split into two distinct controllers**

| Route | Actor | Purpose | Evidence |
|-------|-------|---------|----------|
| `GET /api/v1/me/interviews` | Candidate | List own interviews across all companies | `idx_interviews_candidate` index exists |
| `GET /api/v1/me/interviews/:interviewId` | Candidate | Read own interview detail | Candidate owns via `candidate_id` |
| `GET /api/v1/companies/:companyId/applications/:applicationId/interviews` | HR/Employer | List interviews for a specific application | `idx_interviews_application` index exists |
| `POST /api/v1/companies/:companyId/applications/:applicationId/interviews` | HR/Employer | Schedule interview | Write operation, company-scoped |
| `PATCH /api/v1/companies/:companyId/interviews/:interviewId` | HR/Employer/Candidate(confirm/decline) | Reschedule/cancel/confirm | Company-scoped, multi-actor |
| `POST /api/v1/me/interviews/:interviewId/confirm` | Candidate | Confirm attendance | Candidate-scoped |
| `POST /api/v1/me/interviews/:interviewId/decline` | Candidate | Decline attendance | Candidate-scoped |

**Verdict:** ⚠️ **MEDIUM — Option C is correct but needs splitting into candidate-self-read and company-management routes. The document's Option C is too coarse.**

### Q2. Actor Permissions

**Decision document asks:** Who may schedule/reschedule/cancel?

**SQL evidence:**
- `interviewers` table requires `company_members` FK: `interviewer_company_member_fk FOREIGN KEY (company_id, user_id) REFERENCES company_members(company_id, user_id)` — `10_interviews.sql:46–48`
- `interview_participants.role` is a free-text VARCHAR, not an enum: `'interviewer', 'observer', 'note_taker', 'recruiter', 'hiring_manager'` — `10_interviews.sql:248`
- `interviews.is_candidate_confirmed BOOLEAN` — `10_interviews.sql:229`
- `interviews.cancelled_reason VARCHAR(500)` with CHECK `status <> 'cancelled' OR NULLIF(BTRIM(cancelled_reason), '') IS NOT NULL` — `10_interviews.sql:236`
- `interview_schedule_blocks.booked_by UUID REFERENCES users(id)` — `10_interviews.sql:74`

**Missing from document:**

| Missing Point | SQL Evidence | Impact |
|---------------|-------------|--------|
| Interviewer can schedule their own block? | `interviewers` FK requires `company_members` — interviewer IS a company member | Yes, if also HR/employer |
| Candidate can only confirm/decline, not reschedule? | `is_candidate_confirmed` boolean — no candidate-initiated reschedule path in schema | Correct — candidate scope is limited |
| `no_show` who marks it? | No CHECK constraint on who sets `no_show` — typically HR/employer after interview time passes | NEEDS_DECISION |
| Can interviewer cancel? | No schema restriction — but business logic should limit to HR/employer or primary interviewer | NEEDS_DECISION |

**Recommendation:**

| Actor | Schedule | Reschedule | Cancel | Confirm | Decline | No-show | Feedback |
|-------|----------|------------|--------|---------|---------|---------|----------|
| Company owner | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| HR (active member) | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Employer (active member) | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Primary interviewer | ❌ | ✅ (own interviews) | ✅ (own interviews) | ❌ | ❌ | ❌ | ✅ |
| Candidate | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |

**Verdict:** 🟡 **HIGH — Permissions incomplete. Document must define interviewer-as-actor for reschedule/cancel and `no_show` transition actor.**

### Q3. Status Transitions

**Decision document asks:** Approve exact transitions and terminal states.

**SQL evidence:**
- `interview_status` enum: `scheduled`, `confirmed`, `rescheduled`, `completed`, `cancelled`, `no_show` — `02_enums.sql:341–347`
- **No SQL function enforces transitions** (unlike `change_application_status()` in `09_applications.sql`). The `interviews` table has NO `BEFORE UPDATE OF status` trigger.
- `interviews_no_hard_delete` trigger exists — `10_interviews.sql:240` — but only blocks DELETE, not status UPDATE.
- `interview_completion_state` CHECK: `(status = 'completed' AND completed_at IS NOT NULL) OR (status <> 'completed' AND completed_at IS NULL)` — `10_interviews.sql:233`
- `interview_cancellation_state` CHECK: `status <> 'cancelled' OR NULLIF(BTRIM(cancelled_reason), '') IS NOT NULL` — `10_interviews.sql:236`
- `rescheduled_from UUID REFERENCES interviews(id)` — `10_interviews.sql:223`

**Critical finding:** Unlike applications, interviews have **NO SQL-level transition enforcement**. NestJS must enforce all transitions application-side.

**Recommended transition matrix:**

```
scheduled → confirmed (candidate confirms)
scheduled → rescheduled (HR reschedules)
scheduled → cancelled (HR/interviewer cancels)
scheduled → no_show (HR marks after time passes)

confirmed → rescheduled (HR reschedules)
confirmed → cancelled (HR/interviewer cancels)
confirmed → completed (HR/interviewer marks done)
confirmed → no_show (HR marks after time passes)

rescheduled → confirmed (candidate confirms new time)
rescheduled → cancelled (HR cancels)
rescheduled → completed (HR marks done)
rescheduled → no_show (HR marks after time passes)

completed → (TERMINAL — no further transitions)
cancelled → (TERMINAL — no further transitions)
no_show → (TERMINAL — no further transitions)
```

**Terminal states:** `completed`, `cancelled`, `no_show`

**Verdict:** 🟡 **MEDIUM — No SQL transition function exists; NestJS must enforce transitions. Document must provide explicit matrix. Reschedule creates a NEW interview row (via `rescheduled_from` FK), not an in-place status change.**

### Q4. Time Handling

**Decision document asks:** Timezone format, DST, lead time, past-slot rejection.

**SQL evidence:**
- `interviewer_availability.timezone VARCHAR(50) NOT NULL DEFAULT 'UTC'` — `10_interviews.sql:62`
- `interview_schedule_blocks.start_time TIMESTAMPTZ`, `end_time TIMESTAMPTZ` — `10_interviews.sql:70–71`
- `interview_schedule_blocks.timezone VARCHAR(50) NOT NULL DEFAULT 'UTC'` — `10_interviews.sql:74`
- `interviews.scheduled_at TIMESTAMPTZ`, `interviews.timezone VARCHAR(50) NOT NULL DEFAULT 'UTC'` — `10_interviews.sql:214–217`
- GIST exclusion uses `tstzrange(start_time, end_time)` — `10_interviews.sql:100–105`

**Three timezone layers exist:**

| Layer | Column | Purpose |
|-------|--------|---------|
| Availability | `interviewer_availability.timezone` | Which timezone the interviewer's weekly windows are defined in |
| Schedule block | `interview_schedule_blocks.timezone` | Which timezone the specific slot was created in |
| Interview | `interviews.timezone` | Which timezone the final interview is in |

**Recommendation:**
- **Storage:** All timestamps use `TIMESTAMPTZ` (correct — already done in SQL)
- **API input:** Accept ISO 8601 with timezone offset (e.g., `2026-09-01T10:00:00+05:30`)
- **DST:** `TIMESTAMPTZ` handles DST automatically — no special handling needed
- **Past-slot rejection:** NestJS must reject `start_time <= NOW()` before GIST constraint triggers
- **Minimum lead time:** NEEDS_DECISION — 1 hour? 2 hours? 24 hours?

**Verdict:** 🟡 **MEDIUM — Three timezone layers are correct but underspecified. Document must define input format, DST behavior, and minimum lead time.**

### Q5. Notifications and External Integrations

**Decision document asks:** Event contracts, calendar/video scope, reminder ownership.

**SQL evidence:**
- `interviews.reminder_sent_at TIMESTAMPTZ` — `10_interviews.sql:228` — field exists but no mechanism populates it
- `interviews.candidate_confirmed_at TIMESTAMPTZ` — `10_interviews.sql:230`
- No `interview_reminder` or `interview_notification` table exists
- Dispatcher has `interview.summary.requested` route — `event-route.registry.ts:68–71`
- No `interview-summary-task.v1.json` contract exists in `contracts/tasks/`
- No FastAPI handler for interview tasks exists in `07-fastapi-ai-worker/`

**Findings:**

| Point | Status | Evidence |
|-------|--------|----------|
| `interview.summary.requested` event exists | ✅ Dispatcher route registered | `event-route.registry.ts:68–71` |
| Interview task contract missing | ❌ `contracts/tasks/interview-summary-task.v1.json` does not exist | `contracts/tasks/` directory search |
| FastAPI handler missing | ❌ No interview handler in `07-fastapi-ai-worker/` | Code search |
| Calendar/video = FUTURE | ✅ Correct per REQ-INTERVIEW-003 | `PHASE-01:135`, `PHASE-06:704` |
| Reminder mechanism undefined | ⚠️ `reminder_sent_at` field exists but no cron/worker populates it | `10_interviews.sql:228` |
| Notification event for candidate confirmation | ⚠️ No approved event contract for "candidate confirmed interview" | No contract in `contracts/events/` |

**Recommendation:**
- Calendar/video: **FUTURE scope** — correctly deferred
- Reminders: Should be a background worker (not NestJS sync) that queries `interviews WHERE scheduled_at - interval '24 hours' > NOW() AND reminder_sent_at IS NULL`
- Candidate confirmation notification: Requires a new event contract OR reuse of existing notification template
- `interview.summary.requested`: Dispatcher route exists but task contract + FastAPI handler must be created before implementation

**Verdict:** 🟡 **MEDIUM — Calendar/video correctly deferred; reminder mechanism and notification events need explicit design. Task contract and FastAPI handler are missing.**

### Q6. Concurrency and Idempotency

**Decision document asks:** Slot booking lock, overlap prevention, idempotency key.

**SQL evidence:**
- **GIST exclusion constraint:** `EXCLUDE USING gist (interviewer_id WITH =, tstzrange(start_time, end_time) WITH &&)` — `10_interviews.sql:100–105`
  - Prevents overlapping blocks for the same interviewer at the DB level
  - Requires `btree_gist` extension (listed in `01_extensions.sql`)
- **Temporary lock:** `locked_by UUID`, `locked_until TIMESTAMPTZ` — `10_interviews.sql:76–77`
  - CHECK: both NULL or both non-NULL — `10_interviews.sql:82–84`
  - Booking clears lock: `locked_by IS NULL AND locked_until IS NULL` when `is_booked = TRUE` — `10_interviews.sql:85–88`
- **`schedule_block_id UNIQUE`** on `interviews` — `10_interviews.sql:213` — one interview per block
- **No idempotency key column** on `interviews` or `interview_schedule_blocks`

**Concurrency flow (inferred from SQL):**

```
1. HR queries available blocks (WHERE is_booked = FALSE)
2. HR creates interview → system locks block (locked_by = userId, locked_until = NOW() + interval)
3. Within lock: validate scope, insert interview, update block (is_booked = TRUE, booked_by = userId)
4. Lock auto-expires if transaction fails
```

**Findings:**

| Point | Status | Evidence |
|-------|--------|----------|
| GIST overlap prevention | ✅ DB-level enforcement | `10_interviews.sql:100–105` |
| Temporary lock mechanism | ✅ `locked_by/locked_until` fields exist | `10_interviews.sql:76–77` |
| Lock timeout undefined | ⚠️ No CHECK constraint on lock duration | NestJS must enforce (e.g., 5 minutes) |
| No idempotency key | ⚠️ No `idempotency_key` column on interviews | Client must use `schedule_block_id` as natural idempotency key |
| Reschedule = new row | ✅ `rescheduled_from UUID` FK creates new interview | `10_interviews.sql:223` |

**Recommendation:**
- Use `schedule_block_id` as natural idempotency key — re-booking the same block is idempotent
- NestJS must enforce lock timeout (e.g., 5 minutes) — check `locked_until > NOW()` before proceeding
- Use `SELECT ... FOR UPDATE` on `interview_schedule_blocks` within the booking transaction
- Two-phase lock: (1) acquire lock, (2) validate + book + insert interview atomically

**Verdict:** 🟡 **MEDIUM — DB-level overlap prevention is solid; NestJS lock timeout and idempotency strategy need definition.**

---

## 4. Additional Findings Beyond Q1–Q6

### Missing Decision: Reschedule Creates New Interview

The SQL schema has `rescheduled_from UUID REFERENCES interviews(id)` — this means **reschedule creates a NEW interview row**, not an in-place status change. The document does not mention this.

**Impact:** The API must return the new interview ID on reschedule, and the old interview's status changes to `rescheduled`.

### Missing Decision: Feedback Submission Actor

`interview_feedback` requires `participant_id` which FK to `interview_participants` — only participants can submit feedback. The document does not address:
- Who can submit feedback?
- When is feedback finalized (`is_final = TRUE`)?
- Can feedback be edited before finalization?

**SQL evidence:** `protect_final_interview_feedback()` — `10_interviews.sql:289–295` — submitted feedback is immutable.

### Missing Decision: Interviewer Management

The document does not address how interviewers are created/managed. SQL has:
- `interviewers` table with `company_members` FK
- `interview_pools` for organizational grouping
- `interviewer_availability` for weekly windows

These need CRUD endpoints before scheduling can work.

### Missing Decision: `no_show` Transition Actor

`no_show` status exists in the enum but no actor or timing rule is defined. Typically:
- HR/employer marks `no_show` after interview time has passed
- Should require `scheduled_at + duration_minutes < NOW()`

---

## 5. SQL/Schema Findings

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| **S-1** | 🟡 MEDIUM | No SQL transition enforcement function (unlike `change_application_status()`) — all transition logic must be in NestJS | `10_interviews.sql` — no `BEFORE UPDATE OF status` trigger |
| **S-2** | 🟢 LOW | `interview_participants.role` is free-text VARCHAR, not enum — inconsistent with other enum patterns | `10_interviews.sql:248` |
| **S-3** | 🟢 LOW | `interview_documents.document_role` uses `document_role` enum from `06_documents.sql` — cross-file dependency | `10_interviews.sql:279` |

---

## 6. Contract/Dispatcher Findings

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| **C-1** | 🟡 MEDIUM | `interview.summary.requested` dispatcher route registered but task contract `interview-summary-task.v1.json` does not exist | `event-route.registry.ts:68–71`, `contracts/tasks/` empty for interview |
| **C-2** | 🟡 MEDIUM | No FastAPI handler for interview summary tasks | `07-fastapi-ai-worker/` — no interview code |
| **C-3** | 🟢 LOW | No event contract for "interview scheduled" or "candidate confirmed" notifications | `contracts/events/` — no interview events |

---

## 7. Requirements Compliance

| Requirement | Status | Evidence |
|-------------|--------|----------|
| REQ-INTERVIEW-001: Availability → slot lock → booking | ✅ APPROVED DIRECTION | SQL supports full flow; NestJS implementation pending |
| REQ-INTERVIEW-002: Lifecycle, feedback, reminders | ✅ APPROVED DIRECTION | SQL supports lifecycle; reminders need worker |
| REQ-INTERVIEW-003: Calendar/video integration | ✅ FUTURE | Correctly deferred; no provider contract invented |

---

## 8. Conflicts Found

| # | Conflict | Source A | Source B | Resolution |
|---|----------|----------|----------|------------|
| **CONFLICT-1** | Document Q1 Option C says "both" but doesn't distinguish candidate-self-read from company-management | `INTERVIEW-API-DECISION-QUESTIONS.md:11` | `PHASE-06-API-CATALOG.md:687` — "TBD" path | Split into two route families: `/me/interviews` (candidate) + `/companies/:companyId/applications/:applicationId/interviews` (HR) |
| **CONFLICT-2** | Document Q3 says "Approve exact transitions from the enum/function" but NO transition function exists in SQL | `INTERVIEW-API-DECISION-QUESTIONS.md:15` | `10_interviews.sql` — no `change_interview_status()` function | Transitions must be enforced in NestJS application code; SQL only has CHECK constraints on `completed_at` and `cancelled_reason` |
| **CONFLICT-3** | API catalog says "interview.summary.requested only where applicable" but no task contract or handler exists | `PHASE-06-API-CATALOG.md:696` | `contracts/tasks/` — no interview contract; `07-fastapi-ai-worker/` — no handler | Task contract + FastAPI handler must be created before this route can function |

---

## 9. Recommended Final Decisions

### Q1: Route Shape — APPROVED WITH SPLIT

```
Candidate reads:
  GET /api/v1/me/interviews
  GET /api/v1/me/interviews/:interviewId
  POST /api/v1/me/interviews/:interviewId/confirm
  POST /api/v1/me/interviews/:interviewId/decline

Company management:
  POST /api/v1/companies/:companyId/applications/:applicationId/interviews
  GET  /api/v1/companies/:companyId/applications/:applicationId/interviews
  PATCH /api/v1/companies/:companyId/interviews/:interviewId
```

### Q2: Permissions — APPROVED WITH EXPANSION

Schedule/Reschedule/Cancel: Company owner, HR, employer (active members)
Confirm/Decline: Candidate only (via `candidate_id` match)
No-show: Company owner, HR, employer (after `scheduled_at + duration_minutes`)
Feedback: Interview participants only (via `interview_participants`)

### Q3: Transitions — APPROVED WITH MATRIX

```
scheduled → confirmed, rescheduled, cancelled, no_show
confirmed → rescheduled, cancelled, completed, no_show
rescheduled → confirmed, cancelled, completed, no_show
completed → TERMINAL
cancelled → TERMINAL
no_show → TERMINAL
```

**Reschedule creates a NEW interview row** (via `rescheduled_from` FK).

### Q4: Time — APPROVED WITH CONDITIONS

- Input: ISO 8601 with timezone offset
- Storage: `TIMESTAMPTZ` (already correct)
- DST: Handled by PostgreSQL `TIMESTAMPTZ`
- Past-slot: Reject `start_time <= NOW()`
- Minimum lead time: **NEEDS_DECISION** — recommend 2 hours

### Q5: Notifications — APPROVED WITH CONDITIONS

- Calendar/video: **FUTURE** (REQ-INTERVIEW-003)
- Reminders: Background worker, not NestJS sync
- `interview.summary.requested`: Requires task contract + FastAPI handler
- Candidate confirmation notification: Requires new event contract

### Q6: Concurrency — APPROVED

- GIST exclusion: ✅ DB-level overlap prevention
- Temporary lock: ✅ `locked_by/locked_until` fields exist
- Lock timeout: NestJS enforces (recommend 5 minutes)
- Idempotency: Use `schedule_block_id` as natural key
- Booking transaction: `SELECT ... FOR UPDATE` on block + insert interview atomically

---

## 10. Required Tests

| # | Test | Priority | Type |
|---|------|----------|------|
| T-1 | Double-booking prevention — two concurrent schedule attempts for same block | HIGH | Concurrency |
| T-2 | Lock expiry — schedule attempt after `locked_until` passes | HIGH | Integration |
| T-3 | Reschedule creates new interview with `rescheduled_from` FK | HIGH | Unit |
| T-4 | Terminal state immutability — cannot transition from `completed`/`cancelled`/`no_show` | HIGH | Unit |
| T-5 | Candidate confirm/decline — only candidate_id owner can confirm | HIGH | Unit |
| T-6 | Cross-company isolation — HR A cannot see/modify Company B's interviews | HIGH | Unit |
| T-7 | Past-slot rejection — `start_time <= NOW()` rejected | MEDIUM | Unit |
| T-8 | `cancelled_reason` required on cancel — CHECK constraint | MEDIUM | Unit |
| T-9 | `completed_at` required on complete — CHECK constraint | MEDIUM | Unit |
| T-10 | Feedback immutability — submitted feedback cannot be updated | MEDIUM | Unit |
| T-11 | GIST exclusion — overlapping blocks for same interviewer rejected | MEDIUM | Integration |
| T-12 | Interviewer must be active company member — FK enforcement | MEDIUM | Unit |

---

## 11. Final Verdict

**APPROVED WITH CONDITIONS**

| Category | Status |
|----------|--------|
| **Document honesty** | ✅ Correctly defers to SQL; does not invent behavior |
| **Q1 Route shape** | ⚠️ MEDIUM — needs split into candidate + company routes |
| **Q2 Permissions** | 🟡 HIGH — incomplete; missing interviewer-as-actor and `no_show` actor |
| **Q3 Transitions** | ⚠️ MEDIUM — no SQL transition function; NestJS must enforce |
| **Q4 Time handling** | ⚠️ MEDIUM — three timezone layers correct but underspecified |
| **Q5 Notifications** | ⚠️ MEDIUM — calendar/video correctly FUTURE; reminders/events need design |
| **Q6 Concurrency** | ⚠️ MEDIUM — DB solid; NestJS lock strategy needs definition |
| **SQL alignment** | ✅ All table/column/enum names match |
| **Contract gaps** | 🟡 Task contract + FastAPI handler missing |
| **Invented objects** | ✅ Zero |
| **Blocking issues** | None — all conditions are design decisions, not schema conflicts |

**Coding authorized after:**
1. Q2 permissions matrix frozen (HIGH)
2. Reschedule-as-new-row behavior documented (MEDIUM)
3. Lock timeout value decided (MEDIUM)
4. Minimum lead time decided (MEDIUM)
