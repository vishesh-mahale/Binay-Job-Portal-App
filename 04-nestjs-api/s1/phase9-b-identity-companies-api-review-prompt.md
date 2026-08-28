# Phase 09-B API Contract Review Prompt

Act as an independent API and security architect. Review:

`04-nestjs-api/PHASE-09-B-API-CONTRACT-FREEZE.md`

Against:

- `AGENTS.md`
- `PHASE-05-FINAL-REQUIREMENTS.md`
- `PHASE-06-API-CATALOG.md` §3A–§3B
- `PHASE-07-ARCHITECTURE.md`
- `PHASE-08-IMPLEMENTATION-PLAN.md` Phase 08-B
- `PHASE-09-B-IDENTITY-COMPANIES-SCOPE.md`
- `03_users_auth.sql`, `04_companies.sql`, `17_rls.sql`
- Decision-01 and Decision-06

Do not invent requirements. For each contract row, recommend only a path/method/DTO when source evidence supports it; otherwise keep `NEEDS_DECISION`. Check tenant derivation, actor permissions, owner transfer, membership lifecycle, rejoin-same-row policy, transaction/audit/outbox behavior, error envelope, idempotency and response PII.

Also identify any missing Identity/Company API capability from the catalog. Do not write code or modify the worksheet.

Use verdict: `PASS`, `PASS WITH MINOR FIXES`, `CONDITIONAL PASS` or `BLOCKED`.
Every finding must include exact source reference, evidence, impact and fix.

Save report as:

`04-nestjs-api/s1/phase9-b-identity-companies-api/<agent-name>-contract-review.md`
