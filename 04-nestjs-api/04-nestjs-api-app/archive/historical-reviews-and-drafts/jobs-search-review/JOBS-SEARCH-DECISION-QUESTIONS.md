# Jobs/Search — Decision Questions Before Coding

> Status update (2026-08-28): J1–J8 have been approved/frozen in
> `DECISION-07-JOBS-SEARCH-FINAL.md`. This file is retained as the decision trace.

Ye questions current SQL baseline, frozen API catalog aur independent reviews ke basis par hain.
J1–J4 ke answers ab Decision-07 me recorded hain. Neeche unka trace diya gaya hai; sirf J5–J8 ke
implementation-level details abhi open hain. Kisi missing detail ko source ke bina assume nahi karna.

## J1 — Job routes aur command shape — FROZEN

Kya exact routes honge? Recommended shape ko approve ya modify karein:

- `POST /api/v1/companies/:companyId/jobs`
- `GET /api/v1/companies/:companyId/jobs/:jobId`
- `PATCH /api/v1/companies/:companyId/jobs/:jobId`
- Separate commands: `publish`, `pause`, `resume`, `close/archive`

Generic arbitrary `status` PATCH allowed nahi hona chahiye. Final request/response DTO aur error codes
likhne hain.

## J2 — Job permissions — FROZEN

- Draft create/edit kaun karega: HR/employer, owner/admin, ya dono?
- Publish/approve kaun karega?
- Kya active company membership mandatory hogi?
- Cross-company job access ka exact deny behavior kya hoga?

## J3 — Approval setting — FROZEN

`company_settings.job_approval_required` ko authoritative maana jaye ya koi aur setting?

- Default approval required ya auto-approve?
- Setting change ka permission owner/admin ko?
- Rejected job edit ke baad dobara approval required?
- Rejection reason mandatory?

## J4 — Expiry ownership — FROZEN

Authoritative sweeper: Supabase `pg_cron` + `public.expire_due_jobs()`; daily schedule
`daily_job_expiry_sweep` (12:05 AM Asia/Kolkata). Dispatcher/Cloud Tasks expiry path nahi hai.

Saath me freeze karein: `published -> expired` transaction, history/audit, outbox event/notification,
late sweep behavior, aur search-time defensive `expires_at > NOW()` filter.

## J5 — Search rollout aur ranking

Current first layer PostgreSQL filters + FTS hai. Freeze karein:

- Candidate job search me lexical FTS only ya compatible vector mode bhi?
- Recruiter candidate search me vector mismatch par lexical fallback?
- Score formula, deterministic tie-breaker aur ranking explanation fields?
- Zero-result/low-confidence behavior?
- External search engine future ADR ke bina nahi add hoga.

## J6 — Pagination contract

Cursor behavior freeze karein:

- Opaque signed/versioned cursor
- Cursor me filters/sort hash binding
- Maximum page size
- Cursor expiry
- Invalid cursor ka exact error code

Raw offset fallback accidentally expose nahi karna hai.

## J7 — Visibility aur projection freshness

Candidate search ke liye decide karein:

- Candidate visibility public/open-to-work/company/application based?
- HR ko kaunse fields/source-trust labels milenge?
- Stale `candidate_search_profiles` projection return, exclude, ya freshness flag?
- Saved-candidate state search card me embedded hogi ya separate endpoint se?

Raw resume evidence/search text response me nahi aayega.

## J8 — Events aur analytics

- `job.ai.enrichment.requested` exactly kis lifecycle point par emit hoga?
- Existing v1 envelope/payload ko Gate G-1 ke according validate kaun karega?
- Publish/pause/expire ke liye event chahiye ya history/audit enough hai?
- Search impressions/clicks record karne hain? Agar haan, sync, outbox, ya separate analytics path?

Naya event/route tabhi banega jab versioned contract aur consumer approve ho.

## Required test acceptance

Decision freeze ke baad tests mandatory honge: role/company negative access, invalid transitions,
approval/rejection/resubmit, expiry exclusion, bounded cursor pagination, FTS/vector fallback,
projection staleness, saved-candidate privacy, deterministic concurrency lock order, and atomic
business + history/audit + outbox transaction.

## Current gate

`NO-GO FOR PUBLIC JOBS/SEARCH CONTROLLERS` until the remaining J5–J8 details (search route/DTO,
cursor, visibility freshness and event/analytics boundaries) are recorded. Job lifecycle routes
J1 ke basis par implementable hain, subject to SQL/contract validation and tests.
