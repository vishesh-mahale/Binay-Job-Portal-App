# Review task — job draft/publish implementation

Act as an independent senior NestJS/PostgreSQL reviewer. Do not modify code.

Read:

- `AGENTS.md`
- `04-nestjs-api/04-nestjs-api-app/src/jobs.ts`
- `04-nestjs-api/04-nestjs-api-app/src/jobs.spec.ts`
- `04-nestjs-api/04-nestjs-api-app/src/app.module.ts`
- `02-database/migrations/baseline/02_enums.sql`
- `02-database/migrations/baseline/04_companies.sql`
- `02-database/migrations/baseline/05_jobs.sql`
- `02-database/migrations/baseline/13_analytics.sql`
- `02-database/migrations/baseline/15_infrastructure.sql`
- `02-database/migrations/baseline/17_rls.sql`
- `04-nestjs-api/04-nestjs-api-app/jobs-search-review/DECISION-07-JOBS-SEARCH-FINAL.md`

Review the draft create/update and named publish command for:

1. Route/controller wiring and authentication.
2. Active-user, company-owner/member and cross-company authorization.
3. Approval setting behavior (`job_approval_required`) and allowed state transitions.
4. Transaction atomicity, audit record correctness and rollback behavior.
5. SQL parameterization, enum/constraint compatibility and duplicate slug handling.
6. Whether AI outbox emission is correctly deferred until Gate G-1 alignment.
7. Test adequacy, including negative and concurrent cases.

Do not invent permission keys, event types, tables or lifecycle rules. If the source does not define
something, classify it as `NEEDS_HUMAN_DECISION`. Clearly classify every finding as PASS, FIX
REQUIRED or NEEDS_HUMAN_DECISION.

Write your report to:

`04-nestjs-api/04-nestjs-api-app/jobs-search-review/<agent-name>-JOBS-PUBLISH-IMPLEMENTATION-REVIEW.md`
