# Independent Review Prompt — Phase 09 Foundation Slice

Act as an independent Senior NestJS, PostgreSQL and application-security reviewer.

Review these authoritative files first:

1. `AGENTS.md`
2. `04-nestjs-api/PHASE-05-FINAL-REQUIREMENTS.md`
3. `04-nestjs-api/PHASE-06-API-CATALOG.md`
4. `04-nestjs-api/PHASE-07-ARCHITECTURE.md`
5. `04-nestjs-api/PHASE-08-IMPLEMENTATION-PLAN.md`
6. `04-nestjs-api/PHASE-09-CODING-START-GATE.md`
7. `04-nestjs-api/PHASE-09-FOUNDATION-SLICE-SCOPE.md`
8. Relevant baseline SQL, contracts, ADRs and the actual Phase 09 implementation files.

## Review boundary

Review only the Phase 09 Foundation slice. Do not approve business endpoints or event producers that are outside this slice. Do not invent missing tables, events, providers, queue names or security behavior.

## Verify

- configuration and secret validation are fail-fast and never log secrets;
- JWT/request context is separated from trusted system access;
- `UserContextClient` cannot accidentally receive the trusted credential;
- transaction rollback is safe and no external call happens inside a DB transaction;
- approved error vocabulary and validation behavior are consistent;
- health/readiness and graceful shutdown are operationally correct;
- correlation IDs, structured logs and PII redaction are safe;
- tests cover security boundaries, configuration failures, rollback and database outage;
- no generic in-memory idempotency guarantee or invented contract was added;
- README and test navigation are synchronized.

## Output

Write the report as:

`04-nestjs-api/s1/phase9-foundation/<agent-name>-phase9-foundation-review.md`

Use this verdict vocabulary:

- `PASS`
- `PASS WITH MINOR FIXES`
- `CONDITIONAL PASS`
- `BLOCKED`

For every finding include severity, exact file/line, evidence, impact, and a concrete fix. Do not claim tests passed unless you actually ran them and recorded the command/output.
