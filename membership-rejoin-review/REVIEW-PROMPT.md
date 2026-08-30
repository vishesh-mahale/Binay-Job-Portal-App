# Membership Rejoin Contract Review Prompt

Review `04-nestjs-api/membership-rejoin-review/REJOIN-APPROVAL-CONTRACT-QUESTION.md` against:

- `04-nestjs-api/project-docs/PHASE-09-B-API-CONTRACT-DECISIONS-HINGLISH.md`
- `04-nestjs-api/project-docs/PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md`
- `04-nestjs-api/project-docs/PHASE-09-B-DTO-FIELD-MAPPING-WORKSHEET.md`
- `04-nestjs-api/project-docs/PHASE-06-API-CATALOG.md`
- `02-database/migrations/baseline/04_companies.sql`
- `02-database/migrations/baseline/17_rls.sql`
- `AGENTS.md`

Do not invent tables, columns, statuses or routes. Determine whether an existing durable mechanism supports the D6 request/approval flow. Compare the three options, identify the option that preserves the approved requirement with least unsupported change, and list exact contract/migration updates required.

Write the report to:

`04-nestjs-api/membership-rejoin-review/<agent-name>.md`

Do not modify implementation, SQL or canonical contract files.
