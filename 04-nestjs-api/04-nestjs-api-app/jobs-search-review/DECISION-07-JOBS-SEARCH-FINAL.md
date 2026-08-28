# Decision 07 — Jobs/Search API and Lifecycle

Status: `APPROVED / FROZEN`
Date: 2026-08-27

This decision records the approved Jobs/Search direction after independent agent review. Existing
SQL/contracts remain authoritative; missing executable objects are implementation work and will be
added only through reviewed pre-production SQL changes.

## J1 — Routes and commands

Use company-scoped REST resources with named lifecycle commands:

```text
POST  /api/v1/companies/:companyId/jobs
GET   /api/v1/companies/:companyId/jobs/:jobId
PATCH /api/v1/companies/:companyId/jobs/:jobId
POST  /api/v1/companies/:companyId/jobs/:jobId/publish
POST  /api/v1/companies/:companyId/jobs/:jobId/pause
POST  /api/v1/companies/:companyId/jobs/:jobId/resume
POST  /api/v1/companies/:companyId/jobs/:jobId/close
POST  /api/v1/companies/:companyId/jobs/:jobId/archive
POST  /api/v1/companies/:companyId/jobs/:jobId/submit-for-approval
POST  /api/v1/companies/:companyId/jobs/:jobId/approve
POST  /api/v1/companies/:companyId/jobs/:jobId/reject
```

Arbitrary status PATCH is forbidden. Terminal states `closed`, `expired`, and `archived` cannot be
reopened; repost creates a new job id.

## J2 — Permissions

- Active company member with approved job-management permission may create/edit drafts.
- Owner/admin controls approval setting and approve/reject/archive operations.
- HR/employer may manage jobs only within their active company membership and granted permission.
- Hiring-manager extra rights are not implicit; pause/close permission must be explicitly granted.
- Platform admin exceptional access is company-scoped/audited, not an unlogged global bypass.
- Cross-company access is denied.

## J3 — Approval

Approved product policy is direct publish by default:

```text
job_approval_required = false (default)
  draft -> published

approval enabled by company owner/admin
  job_approval_required = true
  draft -> pending_approval -> approve -> published
```

Executable mapping is frozen as: `job_approval_required = false` (the SQL default) means direct
publish; `true` means approval required. The company owner/admin (authorized employer-side actor) may
change this setting. Already submitted jobs keep their current workflow; the setting applies to future
publish submissions. Rejected edits require resubmission/approval.

The archived `auto_approve_jobs` JSON example is documentation only; implementation must use the
real `company_settings.job_approval_required` column.

## J4 — Expiry

Supabase `pg_cron` runs daily at **12:05 AM Asia/Kolkata** and invokes `expire_due_jobs()`.
The function atomically transitions due `published` and `paused` jobs to `expired` and creates the
approved in-app notification row. Search and apply queries always enforce:

```sql
expires_at IS NULL OR expires_at > NOW()
```

The function, schedule, job-history/audit representation and permissions are implementation SQL
work; no external scheduler or Cloud Tasks path is added for expiry.

Operational detail: the current function processes at most 100 due jobs per invocation using
`FOR UPDATE SKIP LOCKED`. This bounded batch is intentional for lock duration; deployment must
monitor backlog and document the next-run drain behavior. The function writes the existing
`audit_logs` row and the approved creator-only in-app notification directly in the same transaction;
this is a narrow deterministic expiry exception, not a general database-owned notification system.

## J5 — Search

- PostgreSQL relational filters + FTS are the first implementation layer.
- First release ranking is weighted FTS; deterministic order is `score DESC, published_at DESC,
  id DESC`.
- Compatible vector ranking may be added only when model/version matches, with mandatory FTS-only
  fallback when vectors are missing or incompatible.
- External search engine is future ADR scope.
- Recruiter stale projections return only approved projected fields plus
  `projection_freshness: "stale"`; raw resume/evidence is never returned.

## J6 — Pagination

- Public API uses opaque signed/versioned cursors; raw offset is not exposed.
- Cursor binds sort mode and canonical filter hash.
- Approved limits: default 20, maximum 50. Cursor TTL is 30 minutes for public job search and
  10 minutes for recruiter candidate search.
- Invalid/tampered/expired cursor maps to the approved validation error vocabulary.

## J7 — Visibility and freshness

- Public job search returns only published, non-deleted, non-expired jobs; confidential jobs use a
  masked company identity rather than being silently exposed.
- Recruiter candidate search requires active company membership and approved visibility policy.
- Current policy requires `is_open_to_work = true` in addition to active membership and the approved
  recruiter-search permission. Cross-company search is allowed only for such eligible candidates.
- `is_open_to_work` is an eligibility signal, not the sole authorization boundary.
- Stale candidate projections return only approved projected fields with an explicit freshness marker;
  raw resume/evidence is never returned.
- Saved-candidate state remains private, recruiter-scoped, and non-job-specific.
- Confidential jobs remain searchable publicly with company identity masked; authorized company users
  see the real identity.

## J8 — Events and analytics

- Emit `job.ai.enrichment.requested` at the approved publish/enrichment point only after Gate G-1
  envelope/schema validation and idempotency rules.
- The event is emitted on first publish and when approved AI-relevant fields change on an already
  published job. The v1 contract must be aligned to the full G-1 outbox envelope before producer
  implementation.
- Do not invent job lifecycle or search-impression events until a versioned contract and consumer are
  approved. Expiry currently writes the approved in-app notification row in its atomic function.
- Search analytics/impressions remain a separate bounded analytics path and never block search reads.

## Implementation gate and order

1. Sync API catalog and requirements traceability with this decision. **API-JOB-001 is now
   synchronized in `04-nestjs-api/PHASE-06-API-CATALOG.md`; exact public and recruiter search
   paths remain intentionally TBD because this decision does not define them.**
2. Add reviewed pre-production SQL for expiry function/schedule/history requirements if required.
3. Reconcile Gate G-1 and validate job AI contract.
4. Implement private bounded FTS query adapters and tests.
5. Implement job lifecycle commands with company → job → child lock order and atomic business +
   history/audit + outbox transaction.
6. Implement controllers, cursor utility and integration/concurrency tests.

`JOBS/SEARCH DECISION: FINAL — IMPLEMENTATION MAY START AFTER DOCUMENT SYNC; JOB-AI PRODUCER REMAINS BLOCKED BY G-1`
