# Phase 09-B Review Prompt

Act as an independent Senior NestJS/PostgreSQL multi-tenant security reviewer.

Review `04-nestjs-api/PHASE-09-B-IDENTITY-COMPANIES-SCOPE.md` against:

- `AGENTS.md`
- `PHASE-05-FINAL-REQUIREMENTS.md`
- `PHASE-06-API-CATALOG.md` §3A–§3B
- `PHASE-07-ARCHITECTURE.md`
- `PHASE-08-IMPLEMENTATION-PLAN.md` §4
- baseline SQL `03_users_auth.sql` and `04_companies.sql`
- Decision-01 and Decision-06

Do not invent endpoint paths, tables, events, roles or business rules. Check that the scope preserves tenant isolation, trusted-write/RLS boundaries, membership lifecycle, deterministic lock order, audit/outbox transaction rules and explicit exclusions. Identify missing requirements, contradictions and overreach.

Use verdict: `PASS`, `PASS WITH MINOR FIXES`, `CONDITIONAL PASS` or `BLOCKED`.
Every finding must include exact source/file reference, evidence, impact and fix. Do not modify implementation code.

Save report as:

`04-nestjs-api/s1/phase9-b-identity-companies/<agent-name>-scope-review.md`
