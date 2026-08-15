# 10 Interviews — Detailed Hinglish Explanation

## 1. Is file ka kaam

`10_interviews.sql` application के interview stage को manage करती है:

```text
Shortlisted/screened application
        ↓
Interviewer availability + optional slot booking
        ↓
Scheduled interview + participants
        ↓
Candidate confirmation / reschedule / completion
        ↓
Participant feedback
```

External Google/Microsoft calendar और Zoom/Meet API integration अभी इस SQL का काम नहीं है।
Database internal schedule, meeting metadata और future integration के लिए required state रखती है।

## 2. Tables

| Table | Kaam |
|---|---|
| `interview_pools` | Company के Engineering/HR जैसे panels |
| `interviewers` | Active company members जो interview ले सकते हैं |
| `interviewer_availability` | Weekly recurring availability windows |
| `interview_schedule_blocks` | Actual bookable/lockable time blocks |
| `interviews` | Application का scheduled interview |
| `interview_participants` | Interview panel/recruiter/observer members |
| `interview_feedback` | Participant का structured rating और decision |
| `interview_documents` | Interview-specific uploaded document links |

## 3. Company और pool setup

Example:

```text
Company: ABC Software
Pool: Backend Engineering Panel
Interviewer: Neha (ABC की active company_member)
```

Important integrity rules:

- interviewer उसी company का `company_member` होना चाहिए;
- interviewer का pool भी उसी company का होना चाहिए;
- same user एक company में duplicate interviewer row नहीं रखेगा;
- pool और interviewer को deactivate करके history retain की जा सकती है।

## 4. Availability और schedule block

Weekly preference:

```json
{
  "day_of_week": 1,
  "start_time": "10:00",
  "end_time": "13:00",
  "timezone": "Asia/Kolkata"
}
```

Actual block:

```json
{
  "interviewer_id": "interviewer-neha",
  "job_id": "job-java-101",
  "start_time": "2026-08-20T10:00:00+05:30",
  "end_time": "2026-08-20T10:30:00+05:30",
  "slot_duration": 30,
  "is_booked": false
}
```

`btree_gist` exclusion constraint same interviewer के overlapping blocks reject करती है।
Job-specific block का job और interviewer same company के होने चाहिए।

## 5. Temporary lock और booking

Candidate/HR slot select करता है:

```text
BEGIN
  SELECT block FOR UPDATE
  require is_booked = false
  require existing lock absent/expired
  set locked_by + locked_until
COMMIT
```

Confirmation transaction:

```text
BEGIN
  lock same block
  validate lock owner/expiry
  set is_booked=true, booked_by, booked_at, application_id
  clear temporary lock
  create interviews row with schedule_block_id
  add participants
  create notification/outbox events
COMMIT
```

Booked block और interview का application/job identical होना जरूरी है। एक block maximum one
interview से link होता है। Recruiter direct scheduling में `schedule_block_id` NULL हो सकती है।

## 6. Registered application interview

```text
job_applications
  application_id = application-rahul
  job_id = job-java-101
  candidate_id = candidate-rahul

interviews
  application_id = application-rahul
  job_id = job-java-101
  candidate_id = candidate-rahul
```

Database application/job mismatch और wrong candidate reject करेगी।

## 7. Guest application interview

Guest apply के समय candidate profile जरूरी नहीं है:

```text
guest job_application
        ↓
interviews.candidate_id = NULL allowed
```

Guest बाद में verified claim से registered profile merge करता है तो interview candidate link केवल
उसी application के `merged` claim वाले candidate से set हो सकता है। Original guest application
rewrite नहीं होगी।

## 8. Interview row

Example:

```json
{
  "application_id": "application-rahul",
  "job_id": "job-java-101",
  "candidate_id": "candidate-rahul",
  "interview_pool_id": "backend-panel",
  "schedule_block_id": "block-20-aug-10am",
  "title": "Java Technical Round 1",
  "type": "video",
  "round": 1,
  "scheduled_at": "2026-08-20T10:00:00+05:30",
  "duration_minutes": 30,
  "timezone": "Asia/Kolkata",
  "status": "scheduled"
}
```

Status enum:

```text
scheduled / confirmed / rescheduled / completed / cancelled / no_show
```

`completed` के साथ `completed_at`, `cancelled` के साथ reason और candidate confirmation के साथ
confirmation timestamp consistent होना चाहिए। Reschedule में old interview history retain करके new
interview `rescheduled_from` से link की जा सकती है।

Actual interview row hard-delete नहीं होगी। Cancel/reschedule/status history retain होगा; draft
availability और configuration का lifecycle अलग है।

## 9. Participants और feedback

Panel example:

```text
Neha  — primary interviewer
Amit  — interviewer
Riya  — recruiter/observer
```

एक user same interview में duplicate participant नहीं हो सकता और maximum one primary participant
हो सकता है। Feedback का `participant_id` उसी interview का participant होना जरूरी है।

Draft feedback editable है:

```json
{
  "technical_skill": 4,
  "communication": 4,
  "problem_solving": 5,
  "decision": "hire",
  "is_final": false
}
```

Submit करते समय:

```text
is_final = true
submitted_at = now
decision required
```

Final feedback update/delete नहीं होगी। Interviewer recommendation automatic hiring decision नहीं;
authorized application workflow final status decide करेगी।

## 10. Documents

`interview_documents` generic `uploaded_documents` को interview role से link करती है, जैसे coding
exercise, evaluation sheet या candidate instructions। Storage path या public URL इस table में नहीं होगा।

## 11. Service responsibilities

| Caller | Target | Purpose |
|---|---|---|
| Next.js | NestJS Interviews API | Availability देखना, slot select, interview view |
| NestJS | Schedule blocks | Lock/book transaction और authorization |
| NestJS | Interviews/participants | Same-company application workflow |
| NestJS | Feedback | Draft save और final submission |
| NestJS | Outbox | Scheduled/rescheduled/cancelled/reminder events |
| Notification worker | Email/in-app adapters | Candidate/recruiter reminders |

Browser direct service-role writes नहीं करेगा। NestJS company membership, application access और
participant authorization verify करेगा।

## 12. One-line memory rule

> `10` application को safe time slot, interview panel और immutable final feedback से जोड़ती है;
> external calendar/video APIs बाद की integration हैं, database की automatic capability नहीं।
