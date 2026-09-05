# Phase 09-D — Employer Job Posting Workstream

## Current Project Decision

- Phase 09-B Identity/Company/Authorization: **COMPLETE**
- Phase 09-C Candidate/Resume/AI: **DEFERRED**
- Phase 09-D Jobs/Search/Applications: **CURRENT PRIORITY**
- Phase 09-A CSRF production gate: **PENDING; do not mark complete**
- Existing database migration: **do not re-apply**
- No new migration unless a real schema gap is proven and approved

## Single Prompt for Antigravity

```text
We are starting Phase 09-D: Employer Job Posting.

Before coding, perform a complete read-only audit.

Read every Markdown file in:
C:\Users\ADMIN\Desktop\Vishesh\Binay-Job-Portal-App\03-Antigravity-main-instruction\prompt-for-antigravity

Also read these source-of-truth files:
1. 03-Antigravity-main-instruction/ANTIGRAVITY-MASTER-IMPLEMENTATION-PROMPT.md
2. 04-nestjs-api/IMPLEMENTATION-TRACKER-HINGLISH.md
3. 03-Antigravity-main-instruction/prompt-for-antigravity/4 Batch4.md
4. Current Phase 09-D contracts, project-docs and reviewer files
5. Baseline SQL for companies, jobs, applications, enums and infrastructure
6. Existing NestJS jobs/search/application modules, controllers, services, DTOs and tests
7. Existing Next.js employer/job UI and API client

Do not blindly merge old instructions. Latest approved contract and actual schema take priority. Identify contradictions explicitly.

Prepare a read-only audit containing:
- Phase 09-D requirements checklist
- Existing implementation versus requirement gap matrix
- Exact tables, columns, enums, routes and permissions available
- Owner/admin/HR authorization rules
- Verified-company and job approval requirements
- Tenant-isolation and sensitive-data risks
- Audit/outbox/event requirements
- Required unit, integration, HTTP and browser tests
- Whether any database migration is genuinely necessary
- Bounded implementation sequence

Phase 09-D scope:
- Employer creates and edits a job draft
- Save/update draft safely
- Submit/publish workflow
- Verified-company publish guard
- company_settings.job_approval_required behavior
- Job status transition matrix and terminal-state rules
- Owner/platform-admin/authorized-HR permission mapping
- Tenant-safe company/branch/department references
- Audit and outbox behavior
- Public visibility/search rules
- Cross-company negative tests
- Idempotency and concurrency tests
- Browser -> Next.js -> NestJS -> Supabase architecture

Do not invent tables, columns, routes, events, permissions or provider behavior.
Do not modify Phase 09-C.
Do not re-apply the existing migration.
Do not start application coding yet.

Save the audit and proposed implementation plan to:
04-nestjs-api/project-docs/PHASE-09-D-JOB-POSTING-IMPLEMENTATION-PLAN.md

Update only the tracker status after the audit:
- Phase 09-B = COMPLETE
- Phase 09-C = DEFERRED
- Phase 09-D = CURRENT / PLAN REVIEW
- Replace any stale “09-B integration tests continue” note

Stop after the audit and plan. Wait for explicit approval before bounded coding units begin.
```

## Execution Order After Approval

1. Read-only audit and gap matrix
2. Review/approve Phase 09-D plan
3. Backend create/save-draft bounded unit
4. Publish, approval and verification guards
5. Employer Job Management UI
6. Public job visibility/search
7. Unit tests, builds, live HTTP and browser E2E
8. FreeBuf/OpenCode read-only review
9. Final tracker and walkthrough update

Use this file as the only Phase 09-D prompt. Do not send the earlier duplicate prompt.

---

## 🟢 Bounded Unit Execution Status & Evidence

- **Bounded Unit 5 — Employer Job Posting UI:** `COMPLETE & VERIFIED`
  - **Component:** `JobPostingManager` (`src/components/employer/job-posting-manager.tsx`) embedded into Employer (`/dashboard/employer`) & HR (`/dashboard/hr`) portals.
  - **Flows Implemented & Verified:**
    1. Create Job Draft & Edit Job Draft.
    2. Company Job Approval Policy Toggle (`job_approval_required`) for Owner/Admin.
    3. Direct Publish by HR when `job_approval_required = false` & company verified.
    4. Move to `pending_approval` when `job_approval_required = true`.
    5. Owner/Admin Approve & Reject (with reason) controls.
    6. Pause, Resume (with unverified company check), Close, and Archive lifecycle actions.
    7. Unverified company warning banner and HTTP 403 error alerts.
  - **Verification Evidence:**
    - Frontend Unit Tests: **3 / 3 test suites passed (17 / 17 tests passed)** including 8 dedicated tests in `job-posting-manager.spec.tsx`.
    - Next.js Production Build: **0 errors, 17 / 17 static pages generated**.
    - NestJS Backend: `listCompanyJobs` added to `JobService` & `JobController`, **41 / 41 test suites passed (277 / 277 total tests)**, NestJS build `0 errors`.
  - **Strict Interview Rounds Validation:** `COMPLETE & VERIFIED` (`validateInterviewRounds` rejects malformed items, blank names, non-positive round numbers, and duplicate rounds with 400 VALIDATION_ERROR. Optional empty/undefined rounds pass gracefully).
  - **Fail-Visible UI Error Handling:** `COMPLETE & VERIFIED` (`getCompanySettings` catch fallback removed. Primary data load failures render red alert banner with Retry button; master catalog failures render warning banner).
  - **Git Migration Source Control Tracking:** `COMPLETE & VERIFIED` (All 5 standalone migrations `20260903000000` to `20260906000001` + baseline SQL files staged & tracked in Git index).
  - **Security Rotation & Fail-Closed Enforcement:** `COMPLETE & VERIFIED` (No hardcoded secret fallbacks in any script across workspace; rotated 256-bit secret configured in `.env`).

