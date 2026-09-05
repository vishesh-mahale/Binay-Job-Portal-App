# CODEX COMPREHENSIVE UI, API & ARCHITECTURAL CHANGES HANDOFF PROMPT

> **Target Audience:** Codex / Agent Reviewers / AI Coding Assistants  
> **Purpose:** Detailed summary of all system changes, architectural decisions, UI components, DB migrations, NestJS API enhancements, data integrity rules, and feature additions implemented since UI development started in `Binay-Job-Portal-App`. Use this context to verify, re-validate, or continue development.

---

## 1. Executive Summary & Overview

Since the commencement of UI development (Phase 09-A to Phase 09-D+), the codebase has evolved from pure backend database schemas to a fully integrated **Next.js 15 App Router Frontend (`03-nextjs-web`)** communicating with the **NestJS Core REST API (`04-nestjs-api`)** over a **Supabase PostgreSQL** database.

Key functional milestones implemented:
1. **Authentication & Session Router:** Full Next.js frontend login, signup, email verification, invite acceptance, and dashboard role router.
2. **Company & Organization Management (Phase 09-B Option B):** Company registration, branch/department/team hierarchy, HR team invite system via email outbox worker (`05-outbox-dispatcher-nestjs`), and Admin verification approval workflow.
3. **Employer Job Management & Posting Workflow (Phase 09-D):** Draft job creation, multi-city hiring locations, master skills autocomplete, salary range visibility, role-based approval policy (`job_approval_required`), and job lifecycle state machine (`draft` -> `pending_approval` -> `published` -> `paused` / `closed` -> `archived`).
4. **Client Requested Job Enhancements:**
   - **Notice Period Restriction:** `max_notice_period_days` (0, 15, 30, 60, 90 days).
   - **Master Cities & Request Pipeline:** `master_cities` autocomplete with "+ Add Other City" fallback and `city_requests` audit logging.
   - **Shift Timing (`work_shift`):** Day Shift, Night Shift, Rotational Shift, Flexible Shift, US Shift, UK Shift.
   - **Education Stream (`education_type` & `min_education_level`):** Technical vs Non-Technical stream classification with dynamic UI degree labels (`B.Tech, B.E` for Technical vs `B.A, B.Com, BBA` for Non-Technical).
   - **Phases of Interview (`interview_rounds`):** Dynamic hiring rounds builder saved as JSONB array (`[{round: 1, name: "HR Screening", description: "..."}]`).
5. **Data Integrity & Strict Validation Rules (Codex Review Resolution):**
   - **Strict Location Item Validation:** `validateLocations()` rejects malformed array items or empty cities with `400 VALIDATION_ERROR` immediately instead of silently skipping.
   - **Strict Skill Item Validation:** `validateSkills()` rejects malformed skill objects, invalid UUIDs, or empty skill names with `400 VALIDATION_ERROR`.
   -25. **Skill Policy Enforcement (`processSkillsInput`):**
    - **Active Master Skills (`is_active = TRUE`):** Attached to `job_skills`.
    - **Inactive Skills (`is_active = FALSE`) / Non-existent UUIDs:** Rejected immediately with `400 VALIDATION_ERROR`.
    - **Unknown Custom Skill Names:** Logged as pending in `public.skill_requests` ONLY. They are NOT created as inactive rows in `public.skills` and are NOT attached to `job_skills` until admin approval.
    - **Atomic Rollback:** `processSkillsInput` runs before `INSERT INTO public.jobs` inside the transaction to prevent orphan job rows on invalid skill inputs.
26. **City Request Audit:** Custom city strings log pending entries in `public.city_requests` for admin review.

---

## 2. Comprehensive Component & File Changes Index

### A. Next.js Web Application (`03-nextjs-web/03-nextjs-web-app`)

| File / Component | Purpose & Changes Implemented |
| :--- | :--- |
| `src/context/auth-context.tsx` | Global authentication state, session sync, login/logout methods, and user role resolution. |
| `src/lib/api-client.ts` | Centralized API client. Handles all REST requests to `/api/v1/*`, header injection (`x-request-id`, `x-trace-id`), error mapping, company endpoints, and job endpoints. |
| `src/types/jobs.ts` | TypeScript interfaces for `Job`, `CompanySettings`, `CreateJobDto`, `UpdateJobDto`, `InterviewRoundItem`, `work_shift`, `education_type`, and `min_education_level`. |
| `src/types/company-invitation.ts` | Types for company team invitations, invite tokens, and sign-up flows. |
| `src/app/login/page.tsx` | Public login interface. |
| `src/app/signup/page.tsx` | Public candidate / employer signup page. |
| `src/app/verify-email/page.tsx` | OTP / link verification page. |
| `src/app/invite/page.tsx` | Invitation acceptance page for HR team members invited via email. |
| `src/app/dashboard/page.tsx` | Central dashboard router redirecting users to `/dashboard/admin`, `/dashboard/employer`, `/dashboard/hr`, or `/dashboard/candidate` based on user role and company status. |
| `src/app/dashboard/admin/page.tsx` | Platform Admin console for reviewing pending company verifications, approving/rejecting companies, and managing city/skill requests. |
| `src/app/dashboard/employer/page.tsx` | Employer dashboard page embedding `CompanyManager` and `JobPostingManager`. |
| `src/components/company/company-manager.tsx` | UI for company profile management, branch creation, department setup, team structure, and inviting HR team members. |
| `src/components/employer/job-posting-manager.tsx` | Full 8-section job creation/editing modal form, draft list cards, role-based action buttons (Hide "Submit for Approval" for Owner/Admin), lifecycle action buttons (Publish, Pause, Resume, Close, Archive with reasons), dynamic Interview Rounds builder, and dynamic degree options based on education stream. |
| `src/components/employer/job-posting-manager.spec.tsx` | 10 Jest unit tests verifying job creation, editing, approval toggles, lifecycle actions, unverified company warnings, and enhancement fields. |

---

### B. NestJS Core API (`04-nestjs-api/04-nestjs-api-app`)

| File / Module | Purpose & Changes Implemented |
| :--- | :--- |
| `src/modules/jobs/jobs.ts` | `CreateJobDto`, `UpdateJobDto`, `JobService`, and `JobController`. Contains `createDraft`, `updateDraft`, `publish`, `transition`, `approve`, `reject`, `listCompanyJobs`, `searchPublicJobs`, `validateInterviewRounds`, and strict `validateLocations`/`validateSkills`/`processSkillsInput` throwing `400 VALIDATION_ERROR` on malformed items/inactive skills. Parameterized `$X::jsonb` SQL casting added for `interview_rounds` and `screening_questions`. |
| `src/modules/jobs/job-search-query.ts` | Query builder for public job search, keyword filtering, salary/location/experience filters, pagination cursor generation, and confidential employer detail masking. |
| `src/modules/jobs/jobs.spec.ts` | 42 Jest unit tests covering all job creation, updates, lifecycle state transitions, permissions, data integrity validation, inactive/non-existent skill rejections, custom skill request logging, and malformed payload rejections. |
| `src/modules/identity/companies.ts` | Company profile CRUD, verification status updates, branch/department/team operations, and company settings management (`job_approval_required`). |
| `src/modules/identity/company-invitation.ts` | HR invitation creation, token generation, email dispatching to outbox, and invitation status tracking. |
| `src/modules/identity/admin-company.ts` | Admin endpoints for approving or rejecting company verification requests. |
| `src/modules/auth/auth-provider.ts` | Authentication guard, session validation, and JWT token verifier. |

---

### C. Database Migrations & Baseline (`02-database`)

| File Path | Description of Changes |
| :--- | :--- |
| `02-database/migrations/baseline/04_companies.sql` | Updated baseline with verification status, company settings (`job_approval_required`), branches, departments, teams, and `rejection_reason`. |
| `02-database/migrations/baseline/05_jobs.sql` | Baseline file updated with `work_shift`, `education_type`, `min_education_level`, `max_notice_period_days`, and `interview_rounds` (JSONB). |
| `02-database/migrations/20260903000000_option_b_company_invitations.sql` | Standalone migration for `company_invitations` table and outbox event triggers. |
| `02-database/migrations/20260904000000_add_company_rejection_reason.sql` | Standalone migration adding `rejection_reason` column to `public.companies`. |
| `02-database/migrations/20260905000000_master_cities_and_requests.sql` | Standalone migration creating `public.master_cities` and `public.city_requests` tables. |
| `02-database/migrations/20260906000000_add_max_notice_period.sql` | Standalone migration adding `max_notice_period_days` column to `public.jobs`. |
| `02-database/migrations/20260906000001_add_job_enhancement_fields.sql` | Standalone migration adding `work_shift`, `education_type`, `min_education_level`, and `interview_rounds` (JSONB) to `public.jobs`. |

---

## 3. Key Technical & Architectural Decisions

### 1. Role-Based Job Action Button Matrix (Owner/Admin vs Regular HR)
- **Problem:** Owners/Admins do not submit jobs to themselves for approval. Regular HR members must submit jobs for approval if the company policy requires it.
- **Solution in UI (`job-posting-manager.tsx`):**
  - If `isOwnerOrAdmin === true` OR `settings?.job_approval_required === false`:
    - Display **"Publish Job"** button directly on Draft job cards.
    - **"Submit for Approval"** button is HIDDEN.
  - If `isOwnerOrAdmin === false` AND `settings?.job_approval_required === true`:
    - Display **"Submit for Approval"** button on Draft job cards.
    - **"Publish Job"** button is HIDDEN for regular HR.

### 2. Auto-Slug Generation & Fallback Deduplication
- **Problem:** Saving multiple jobs with duplicate titles (e.g. `Draft 2`) caused PostgreSQL `23505` unique constraint errors on `slug`.
- **Solution in API (`jobs.ts`):** `createDraft` catches PostgreSQL error `23505` and automatically appends a timestamp suffix (`draft-2-1788534...`), preserving user draft save operations while keeping unit tests 100% compliant.

### 3. Dynamic Qualification Degree Labels
- **Problem:** Choosing `Non-Technical` education stream while seeing `(B.Tech, B.E)` under Minimum Qualification in UI created visual/logical confusion.
- **Solution in UI (`job-posting-manager.tsx`):** `select-min-education-level` options dynamically evaluate `educationType`:
  - `technical` -> `Bachelor's Degree (B.Tech, B.E, B.Sc CS, BCA, etc.)`
  - `non_technical` -> `Bachelor's Degree (B.A, B.Com, BBA, B.Sc, etc.)`
  - `any` -> `Bachelor's Degree (B.Tech, B.A, B.Com, B.Sc, etc.)`

### 4. Parameterized JSONB Casting in UPDATE Queries
- **Problem:** `UPDATE public.jobs SET interview_rounds = $X` without casting threw `column "interview_rounds" is of type jsonb but expression is of type text`.
- **Solution in API (`jobs.ts`):** In `updateDraft`, `JSONB_COLUMNS` (`interview_rounds`, `screening_questions`) are explicitly cast using `$${index + 4}::jsonb`.

### 5. Strict Data Integrity & Skill Policy Enforcement
- **Problem:** Silently ignoring malformed locations/skills, or linking unapproved inactive skills to jobs, creates data corruption and violates skill policy.
- **Solution in API (`jobs.ts`):** `validateLocations()` and `validateSkills()` throw `400 VALIDATION_ERROR` on malformed items. `processSkillsInput()` validates skill UUID `is_active = true` (rejecting inactive/non-existent UUIDs) and logs unknown skill strings to `skill_requests` without linking to `job_skills` before admin approval. `processSkillsInput` runs before job insertion to ensure zero orphan rows.

---

## 4. Verification & Testing Status

| Service / Test Suite / Verification Item | Command / Method | Result |
| :--- | :--- | :--- |
| **Strict Interview Rounds Validation** | `npm test -- src/modules/jobs/jobs.spec.ts` | **PASS** (Rejects blank names, non-positive rounds, duplicates) |
| **Fail-Visible UI Error Handling** | `npm test -- src/components/employer/job-posting-manager.spec.tsx` | **PASS** (`listCompanyJobs` & `getCompanySettings` 403/Network errors render red banner with Retry button) |
| **Git Migration Source Control Tracking** | `git status` / `git log` | **PASS** (Committed in Git commit `aa4dad6` — all 5 standalone migrations + baseline SQL files committed, working tree clean) |
| **Live Supabase DB Custom Skill Verification** | `node scratch/verify-codex-audit-live.cjs` | **PASS** (`skill_requests = 1`, `job_skills = 0`, `skills = 0`) |
| **Live Inactive Skill Rejection & Rollback** | `node scratch/verify-codex-audit-live.cjs` | **PASS** (`400 VALIDATION_ERROR` & 0 orphan job rows) |
| **Read-Only Migration & Schema Audit** | `node scratch/verify-codex-audit-live.cjs` | **PASS** (All 5 tables & job enhancement columns verified live) |
| **NestJS Core API Full Test Suite** | `npm test` (41 test suites) | **291 / 291 PASS** (100%) |
| **Next.js Web Frontend Full Test Suite** | `npm test` (3 test suites) | **19 / 19 PASS** (100%) |
| **NestJS Core API Production Build** | `npm run build` | **0 Errors (Clean TS Compile)** |
| **Next.js Web Production Build** | `npm run build` | **0 Errors (Clean Next.js Build)** |

---

## 5. Security Secret Rotation & Hardening Evidence

> [!IMPORTANT]
> 1. **Secret Rotation:** `WEBHOOK_SECRET` was rotated immediately to a fresh 256-bit cryptographically secure random 64-hex string in `.env` files. The previous exposed secret was completely invalidated.
> 2. **Fail-Closed Code Enforcement:** Hardcoded secret fallback string was removed from `scratch/test_option_5_full_cloud_live.py` and `verify-codex-audit-live.cjs`. Both scripts now enforce fail-closed behavior (`ValueError` / `Error` thrown) if `WEBHOOK_SECRET` environment variable is absent.
> 3. **Zero Plaintext Exposes:** Outbox dispatcher wake requests and live verification scripts dynamically load `process.env.WEBHOOK_SECRET` from environment variables without exposing literal secrets in command line calls or scripts.
> 4. **Live Security Re-verification:** Live PostgreSQL tests (`skill_requests`, `job_skills=0`, `skills=0`, `400 VALIDATION_ERROR` inactive skill rejection, atomic rollback, and 42/42 jobs tests + 10/10 web component tests) re-run and passed 100%.

---

## 6. Instructions for Codex / Future AI Agents

When verifying or building upon this codebase:
1. **Do not remove or alter** `preferred_qualifications` in Section 5 or `CreateJobDto`/`UpdateJobDto`. It complements the structured education stream selectors.
2. **Preserve unit test mocks:** When adding endpoints to `ApiClient` in Next.js web, ensure corresponding mocks in `job-posting-manager.spec.tsx` (`listJobCategories`, `listSkills`, `listCities`, etc.) are updated.
3. **Database migrations:** Any new columns added to any table must be reflected in both `02-database/migrations/baseline/` AND a new standalone migration file in `02-database/migrations/`.
4. **Environment Security:** Never introduce default string fallbacks for secrets in scripts or code. Always use `process.env.WEBHOOK_SECRET` / `os.getenv("WEBHOOK_SECRET")` with fail-closed checks.
