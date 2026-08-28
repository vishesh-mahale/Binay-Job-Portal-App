# Jobs/Search — Codex Proposed Decisions (Approval Required)

Date: 2026-08-27

Ye document final freeze nahi hai. Isme repository evidence, agent reviews aur pehle discuss hui
product direction ko mila kar practical recommendation di gayi hai. User approval ke baad hi ise
API catalog/decision log me `FINAL` mark kiya jayega.

## Proposed decisions

| ID | Proposed decision | Reason / boundary |
|---|---|---|
| J1 | Company-nested REST resource + named commands: create, read, update, publish, pause, resume, close, archive; arbitrary status PATCH nahi | Tenant scope clear; catalog currently path `TBD` rakhta hai |
| J2 | Active company member with job-management permission draft create/edit; owner/admin approval and sensitive lifecycle control | Existing membership/permission patterns reuse honge; hiring-manager rights separately explicit honge |
| J3 | Existing product decision says `auto_approve_jobs = true` default: draft → published. When approval is enabled, draft → pending_approval → approve → published. Implementation must map this to the executable `job_approval_required` column (true = approval required, false = direct publish) through an explicit reviewed migration/document update | Archived decision and current SQL use opposite names/semantics; do not silently choose one |
| J4 | Existing product decision says daily Supabase `pg_cron` at 12:05 AM Asia/Kolkata calls `expire_due_jobs()`, atomically transitions due published/paused jobs to expired and inserts the in-app notification row. Search/apply still use `expires_at IS NULL OR expires_at > NOW()` | Function, schedule and job-history representation are absent from baseline and require reviewed SQL implementation |
| J5 | PostgreSQL relational filters + FTS first. Compatible vector mode later; mismatch par lexical fallback. Deterministic score/tie-break aur explainable labels response contract me freeze honge | External search future ADR ke baad |
| J6 | Opaque signed versioned cursor; filter hash binding; bounded page size (suggested default 20, max 50); invalid cursor mapped to approved validation error | Exact values approval ke baad catalog me add honge |
| J7 | Public job search: published, non-deleted, non-expired jobs only. Recruiter search: active company membership + approved candidate visibility policy; stale projection ko `is_stale` indicator ke saath return karna proposed | `is_open_to_work` ko sole authorization proof nahi maana jayega |
| J8 | `job.ai.enrichment.requested` sirf approved publish/enrichment point par, Gate G-1 envelope validation ke baad. Job lifecycle ke liye naya event tabhi jab contract/consumer approved ho; search impressions separate analytics path | Unknown/unrouted events fail-closed |

## Explicit items still needing human confirmation

1. Kya archived product decision (`auto_approve_jobs=true` default) ko executable `job_approval_required=false` ke roop me map karna hai, ya SQL ka current default `true` retain karna hai?
2. Exact job routes aur DTO field allowlist.
3. Hiring manager ko pause/close permission deni hai ya nahi.
4. Expiry sweep ke approved 12:05 AM Asia/Kolkata schedule aur paused-job expiry ko executable SQL me implement karna hai ya change karna hai.
5. Job status history ke liye new table/forward migration required hai ya existing audit strategy sufficient hai.
6. Cursor max/default/expiry and exact error code.
7. Candidate visibility: open-to-work only, company-wide, application-based, ya combined rule.
8. Stale projection response policy and search explanation fields.

## Implementation gate

In decisions ko approve/update kiye bina public Jobs/Search controller, lifecycle SQL function, new event,
or ranking/cursor code implement nahi kiya jayega. Approval ke baad pehle catalog/decision docs sync,
phir contract/SQL changes, phir private query adapter, aur last me controllers/tests implement honge.
