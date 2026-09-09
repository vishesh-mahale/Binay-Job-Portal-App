# Public Job Search — Verification Status

**Status:** IMPLEMENTED AND VERIFIED (frontend + NestJS public API)

## Implemented routes

- `/` — landing page with the reusable `PublicJobList` section.
- `/jobs` — dedicated public jobs listing using the same `PublicJobList` component.
- `/jobs/[slug]` — standalone public job detail route.

## Component hierarchy

```text
PublicJobList
├── PublicJobFilters
├── PublicJobCard (one per result)
└── PublicJobDetailPane (desktop split view)
```

The listing uses the centralized `apiClient`; it does not query Supabase directly.

## Public API behavior verified

- `GET /api/v1/jobs`
- `GET /api/v1/jobs/slug/:slug`
- `GET /api/v1/jobs/:id`
- Published, non-deleted, non-expired jobs from verified companies are returned.
- Draft, pending approval, paused, closed, archived and expired jobs are hidden by the backend.
- Confidential employers are returned as `Confidential Employer`; company ID, slug and logo are masked.
- Cursor pagination and supported filters (`q`, category, employment type, work mode and country) are wired.

## UI behavior verified

- Unauthenticated visitors can browse jobs.
- Home listing and `/jobs` share the same reusable component.
- Master-detail split view selects the first job automatically and updates the right pane when a card is clicked.
- “Open in New Tab” opens `/jobs/[slug]` with `target="_blank"`.
- Salary is shown only when `salary_visible` permits it.
- Work shift, education, notice period, openings, skills and custom skills are shown when present in the approved public DTO.
- Guest users see “Sign in to Apply”; authenticated candidates see “Apply Now”.
- Public pages do not redirect guests to login when `/auth/me` returns 401; dashboard session expiry still redirects to login.

## Custom skill input behavior

- Comma-separated custom skills are supported.
- Whitespace and case-insensitive duplicates are removed.
- A custom value matching a Master Skill is not added as custom; the Master Skill is auto-selected and a temporary notice is shown.
- Custom-skill success notice is shown for 5 seconds; duplicate Master Skill notice is shown for 10 seconds.

## Verification evidence

- Public jobs UI suite: 12 tests passed.
- NestJS jobs/public-search tests and frontend typecheck were run during the implementation.
- Next.js production build was previously verified after the public jobs route integration; rerun it before release if dev-server processes were active during the last attempt.
- No git commit or push was performed.

## Remaining work

All four job publish workflow gates (HR submit, owner/admin approve, owner/admin reject and direct publish with approval disabled) have also been manually verified. The next Phase 09-D priority is not another public-listing rewrite. Remaining work is:

1. Complete registered application idempotency and immutable snapshot E2E tests.
2. Complete application status transition, terminal-state and concurrency tests.
3. Verify job expiry scheduling, notifications and candidate visibility.
4. Keep Phase 09-A CSRF production gate and Phase 09-C resume/ClamAV gates pending until separately evidenced.
