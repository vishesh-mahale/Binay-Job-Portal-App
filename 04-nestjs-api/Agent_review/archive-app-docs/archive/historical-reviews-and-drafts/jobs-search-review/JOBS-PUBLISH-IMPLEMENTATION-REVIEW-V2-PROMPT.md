# Fresh review task — job draft/publish implementation (post-fix)

Perform an independent post-fix review of the current working tree. Do not rely on earlier reports;
the implementation changed after those reports.

Read `AGENTS.md`, current `src/jobs.ts`, `src/jobs.spec.ts`, `src/app.module.ts`, baseline
`02_enums.sql`, `04_companies.sql`, `05_jobs.sql`, `13_analytics.sql`, `15_infrastructure.sql`,
`17_rls.sql`, and `jobs-search-review/DECISION-07-JOBS-SEARCH-FINAL.md`.

Verify specifically that the latest code correctly handles:

- active requester and role checks;
- owner/creator and active company-member scope for create, draft update and publish;
- verified-company requirement for direct publish, while approval-required jobs may enter
  `pending_approval`;
- draft-only transition guard;
- transaction + audit atomicity and semantically correct audit action;
- SQL parameterization, enum/constraint compatibility and duplicate slug rollback;
- intentional deferral of the job-AI outbox event until Gate G-1 alignment;
- test coverage and any remaining production/security gaps.

Do not modify code or SQL. Do not invent permission keys or business rules. Classify each finding as
`PASS`, `FIX REQUIRED`, or `NEEDS_HUMAN_DECISION`, with exact evidence.

Write your fresh report to:

`04-nestjs-api/04-nestjs-api-app/jobs-search-review/<agent-name>-JOBS-PUBLISH-IMPLEMENTATION-REVIEW-V2.md`
