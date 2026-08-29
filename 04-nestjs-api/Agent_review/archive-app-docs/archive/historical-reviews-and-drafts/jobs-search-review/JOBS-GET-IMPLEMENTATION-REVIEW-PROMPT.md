# Review task — company job GET implementation

Act as an independent senior NestJS/PostgreSQL security reviewer. Do not modify code.

Read:

- `AGENTS.md`
- `04-nestjs-api/04-nestjs-api-app/src/jobs.ts`
- `04-nestjs-api/04-nestjs-api-app/src/jobs.spec.ts`
- `04-nestjs-api/04-nestjs-api-app/src/app.module.ts`
- `02-database/migrations/baseline/04_companies.sql`
- `02-database/migrations/baseline/05_jobs.sql`
- `02-database/migrations/baseline/17_rls.sql`
- `04-nestjs-api/04-nestjs-api-app/jobs-search-review/DECISION-07-JOBS-SEARCH-FINAL.md`

Verify:

1. Route path and AuthGuard wiring.
2. Company membership/owner authorization and cross-company denial.
3. Selected response fields, deleted-job behavior and PII exposure.
4. SQL parameterization and injection safety.
5. Alignment with the controlled-hybrid DB access model.
6. Test adequacy and any missing negative/concurrency cases.

Do not assume a permission key, role rule, or schema object that is not present in the sources.
Report conflicts instead of guessing. Clearly classify each finding as PASS, FIX REQUIRED, or
NEEDS_HUMAN_DECISION.

Write the report to:

`04-nestjs-api/04-nestjs-api-app/jobs-search-review/<agent-name>-JOBS-GET-IMPLEMENTATION-REVIEW.md`
