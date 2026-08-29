# Independent review — registered application API contract

Act as an independent senior NestJS/PostgreSQL architect. Do not modify code or SQL.

Read:

- `AGENTS.md`
- `04-nestjs-api/04-nestjs-api-app/APPLICATION-API-OPEN-DECISIONS.md`
- `04-nestjs-api/PHASE-06-API-CATALOG.md` API-APPLICATION-001/002
- `01-requirements/current/PRODUCT-REQUIREMENTS.md` §11
- `02-database/migrations/baseline/09_applications.sql`
- `02-database/migrations/baseline/05_jobs.sql`
- `02-database/migrations/baseline/06_documents.sql`
- `02-database/migrations/baseline/07_resume_processing.sql`
- `contracts/`
- current `04-nestjs-api/04-nestjs-api-app/src/` implementation

Review only these open points:

1. Exact registered-apply route shape.
2. Request DTO: library resume/application-only resume, consent and screening answers.
3. Immutable snapshot contents and provenance.
4. Idempotency scope/replay and candidate+job uniqueness.
5. `application.submitted` contract and dispatcher/consumer ownership.
6. Eligibility for expired, paused, closed and confidential jobs.

Rules:

- Do not trust previous agent recommendations blindly.
- Do not invent routes, columns, events, contracts or permissions.
- Cite exact source file/section/line evidence.
- If evidence is insufficient or conflicting, mark `NEEDS_HUMAN_DECISION`.
- Preserve the non-negotiable boundaries: atomic snapshot/outbox transaction, parsing non-blocking,
  canonical profile unchanged, no raw resume in response, and cross-tenant denial.

Write the report to:

`04-nestjs-api/04-nestjs-api-app/<agent-name>-APPLICATION-API-DECISION-REVIEW.md`
