# Phase 07 NestJS Architecture Review Prompt

Act as an independent Senior NestJS, PostgreSQL/RLS and distributed-systems architect.

Review only; do not modify architecture, code, SQL or contracts. Do not trust prior PASS claims.
Do not invent missing routes, tables, events, roles or providers.

Audit target:

`04-nestjs-api/PHASE-07-ARCHITECTURE.md`

Read and cross-check:

- `AGENTS.md`
- `PHASE-05-FINAL-REQUIREMENTS.md`
- `PHASE-06-API-CATALOG.md`
- `PHASE-06-REMAINING-DECISIONS.md`
- `DECISION-01` through `DECISION-06`
- `PHASE-04-STATE-MACHINES-AND-TRANSACTIONS.md`
- SQL baseline 01–18
- `contracts/`
- `05-outbox-dispatcher-nestjs/`
- `07-fastapi-ai-worker/`

Verify:

1. Bounded contexts and module ownership match requirements and SQL ownership.
2. Dependency direction prevents cross-module table mutation and circular dependencies.
3. UserContextClient/SystemClient hybrid model matches Decision-01 and `17_rls.sql`.
4. REST/SSE/WebSocket split and reconnect/recovery match Decision-02.
5. Resume, guest, application snapshot and canonical-profile boundaries are preserved.
6. Transaction + audit/history + outbox rules are atomic and external calls are post-commit.
7. `application.submitted`, seven dispatcher routes, worker outputs and phased gaps are accurate.
8. FastAPI/Outbox Dispatcher responsibilities are not duplicated in NestJS.
9. Security, secrets, PII logging, tenant isolation, idempotency and observability are adequate.
10. Proposed folder structure is scalable without prematurely inventing implementation details.
11. Architecture acceptance tests cover failure, concurrency, reconnect and authorization cases.
12. Phase 08 dependencies/open decisions are honestly recorded.

For each issue write: issue ID, severity, exact section, evidence, impact, correction and whether
it blocks architecture approval or coding. Tests may be claimed only when actually executed.

Write report here:

`04-nestjs-api/04-nestjs-api-app/s1/phase7/<agent-name>-architecture-review.md`

Final verdict:

- `PASS — ARCHITECTURE APPROVED`
- `PASS WITH MINOR FIXES`
- `CONDITIONAL PASS`
- `NOT READY`
