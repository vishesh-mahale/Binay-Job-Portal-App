# Phase 09-D — Employer Job Posting Read-Only Audit & Implementation Plan (Final Product Decision Reconciled)

**Document Path:** `04-nestjs-api/project-docs/PHASE-09-D-JOB-POSTING-IMPLEMENTATION-PLAN.md`  
**Date:** 04 September 2026  
**Status:** `IMPLEMENTATION IN PROGRESS — BOUNDED UNIT 2 COMPLETE`  
**Scope:** Phase 09-D Employer Job Posting Workstream  

---

## 1. Executive Summary & Audit Reconciliations

Following direct source and schema verification against baseline SQL (`02_enums.sql`, `05_jobs.sql`, `04_companies.sql`), NestJS code (`jobs.ts`), Outbox Dispatcher registry (`05-outbox-dispatcher-nestjs`), and contracts (`contracts/events`), the implementation plan and codebase are fully reconciled under the final product decisions:

1. **Job Status Enum Alignment:** Baseline database enum `job_status` values are strictly: `'draft'`, `'pending_approval'`, `'published'`, `'paused'`, `'closed'`, `'expired'`, `'archived'`. Approval directly sets status to `published`, and rejection returns status to `draft`.
2. **Final HR & Actor Authorization Rules (No `manage_jobs` concept):**
   - **Verified Company Owner & Platform Admin:**
     - Full job control across all company jobs.
     - Approve / Reject authority.
   - **Active HR Member of the Same Company (`u.role = 'hr'`, `cm.is_active = TRUE`, `cm.left_at IS NULL`):**
     - Job create (`POST /api/v1/companies/:companyId/jobs`)
     - Draft edit (`PATCH /api/v1/companies/:companyId/jobs/:jobId`)
     - Submit for approval (`POST /api/v1/companies/:companyId/jobs/:jobId/submit-for-approval`)
     - Direct publish (`POST /api/v1/companies/:companyId/jobs/:jobId/publish`) ONLY when company is verified AND `job_approval_required = false`.
     - Pause / Resume / Close (`pause`, `resume`, `close`).
     - **Approve / Reject FORBIDDEN (returns HTTP 403 Forbidden).**
   - **Candidate, Guest, Inactive Member, or Left Member:**
     - Job mutations strictly forbidden (HTTP 403 Forbidden).
     - Published jobs read-only.
   - **Unverified Company:**
     - Public job publish forbidden.
   - **`job_approval_required = true`:**
     - HR draft moves to `pending_approval`.
     - Only Owner / Platform Admin can approve or reject.
   - **`job_approval_required = false`:**
     - Verified company active HR can direct publish.
3. **Outbox Events vs Audit Logging (No Invented Events):**
   - **Audit Logs:** Standard `public.audit_logs` entries written for all job CRUD and status actions (`job.created`, `job.updated`, `job.published`, `job.publish_requested`, `job.approved`, `job.rejected`, `job.status_changed`, `job.archived`).
   - **Outbox Events:** **Audit Only / No Outbox Event** for standard job lifecycle transitions (draft, publish, pause, resume, close, archive, approve, reject). Outbox events are strictly limited to contracted schemas (`job.ai.enrichment.requested`, `job.screening_questions.requested`). Uncontracted outbox events are forbidden to prevent dispatcher fail-closed errors.
4. **Canonical API Route Reconciliation:** API endpoints match exact NestJS routes under `@Controller('api/v1/companies/:companyId/jobs')`.
5. **Zero Database Migrations:** 100% verified. Baseline SQL schema is authoritative and requires no schema changes.

---

## 2. Phase 09-D Requirements Checklist

- [x] Read-only audit across prompt files, master instructions, tracker, baseline SQL, contracts, and existing code.
- [x] Reconcile status enum, routes, exact actor permissions, audit logs, and outbox contracts.
- [x] Bounded Unit 1: Employer job draft creation and update (`POST /api/v1/companies/:companyId/jobs`, `PATCH /api/v1/companies/:companyId/jobs/:jobId`) - **COMPLETE & VERIFIED**.
- [x] Bounded Unit 2: Job submission & approval engine (`POST .../submit-for-approval`, `POST .../approve`, `POST .../reject`, `POST .../publish`) - **COMPLETE & VERIFIED**.
- [ ] Bounded Unit 3: Job status lifecycle actions (`pause`, `resume`, `close`, `archive`).
- [ ] Bounded Unit 4: Public job search and listing routes (`status = 'published'`, non-expired, non-deleted).
- [ ] Bounded Unit 5: Next.js Employer Job Management UI pages and forms.
- [ ] Bounded Unit 6: Automated unit, live HTTP integration, cross-company negative, and browser E2E test suites.
- [ ] Bounded Unit 7: FreeBuf / OpenCode read-only review and tracker finalization.

---

## 3. Reconciled API Catalog & Authorization Matrix

| Endpoint | Method | Allowed Actors | DB Status Transition / Action | Audit & Outbox Behavior |
|---|---|---|---|---|
| `/api/v1/companies/:companyId/jobs` | `POST` | Owner, Admin, Active HR Member | Inserts `status = 'draft'` | Audit: `job.created`<br>Outbox: None |
| `/api/v1/companies/:companyId/jobs/:jobId` | `GET` | Owner, Admin, Active HR Member | Fetch job details | None |
| `/api/v1/companies/:companyId/jobs/:jobId` | `PATCH` | Owner, Admin, Active HR Member | Updates draft (`status = 'draft'`) | Audit: `job.updated`<br>Outbox: None |
| `/api/v1/companies/:companyId/jobs/:jobId/publish` | `POST` | Owner, Admin, Active HR Member | If `approval_required`: `pending_approval`<br>Else (if verified): `published` | Audit: `job.published` / `job.publish_requested`<br>Outbox: None |
| `/api/v1/companies/:companyId/jobs/:jobId/submit-for-approval` | `POST` | Active HR Member, Owner, Admin | `draft` $\rightarrow$ `pending_approval` | Audit: `job.publish_requested`<br>Outbox: None |
| `/api/v1/companies/:companyId/jobs/:jobId/approve` | `POST` | **Owner & Platform Admin ONLY** (HR $\rightarrow$ 403) | `pending_approval` $\rightarrow$ `published` (Requires verified company) | Audit: `job.approved`<br>Outbox: None |
| `/api/v1/companies/:companyId/jobs/:jobId/reject` | `POST` | **Owner & Platform Admin ONLY** (HR $\rightarrow$ 403) | `pending_approval` $\rightarrow$ `draft` (Stores rejection reason) | Audit: `job.rejected`<br>Outbox: None |
| `/api/v1/companies/:companyId/jobs/:jobId/pause` | `POST` | Owner, Admin, Active HR Member | `published` $\rightarrow$ `paused` | Audit: `job.status_changed`<br>Outbox: None |
| `/api/v1/companies/:companyId/jobs/:jobId/resume` | `POST` | Owner, Admin, Active HR Member | `paused` $\rightarrow$ `published` | Audit: `job.status_changed`<br>Outbox: None |
| `/api/v1/companies/:companyId/jobs/:jobId/close` | `POST` | Owner, Admin, Active HR Member | `published` $\rightarrow$ `closed` | Audit: `job.status_changed`<br>Outbox: None |
| `/api/v1/companies/:companyId/jobs/:jobId/archive` | `POST` | Owner, Admin, Active HR Member | `closed` / `expired` $\rightarrow$ `archived` | Audit: `job.archived`<br>Outbox: None |

---

## 4. Zero Database Migration Confirmation

- Database Enum `job_status`: `'draft'`, `'pending_approval'`, `'published'`, `'paused'`, `'closed'`, `'expired'`, `'archived'` matches `02_enums.sql` 100%.
- No new SQL migration required.
