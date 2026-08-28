# Phase 08 Implementation Plan Review Prompt

Act as an independent Senior NestJS, PostgreSQL, security and distributed-systems implementation
planner. Review only; do not write code, SQL, contracts or modify the plan.

Audit target:

`04-nestjs-api/PHASE-08-IMPLEMENTATION-PLAN.md`

Read and cross-check:

- `AGENTS.md`
- `PHASE-05-FINAL-REQUIREMENTS.md`
- `PHASE-06-API-CATALOG.md`
- `PHASE-07-ARCHITECTURE.md`
- `DECISION-01` through `DECISION-06`
- `PHASE-04-STATE-MACHINES-AND-TRANSACTIONS.md`
- SQL baseline 01–18
- `contracts/`
- `05-outbox-dispatcher-nestjs/`
- `07-fastapi-ai-worker/`

Verify:

1. Every Phase 06 API/use case maps to a Phase 08 work item and tests.
2. Dependency order has no missing prerequisite or circular module ownership.
3. Every named SQL table/function/event/contract really exists and is used correctly.
4. UserContextClient/SystemClient, RLS, guards and trusted credentials are correctly separated.
5. Transaction, audit/history, outbox, idempotency and deterministic lock-order rules are implementable.
6. Resume, guest, application snapshot, canonical profile and saved-candidate boundaries are preserved.
7. Dispatcher/FastAPI responsibilities are not duplicated in NestJS.
8. SSE/WS/recovery, notification and chat tests are complete.
9. Failure, concurrency, retry, dead-letter, 1000-event load and deployment tests are realistic.
10. G-1, Phase 03 GAP-003..015, provider gaps and TBD paths have explicit owners/gates.
11. Rollback, migration, secrets, observability and CI/CD gates are safe and actionable.
12. No implementation detail is silently invented where the source is TBD.

For every issue provide: ID, severity, exact section, evidence, impact, correction and whether it
blocks implementation readiness. Do not claim tests passed unless actually executed.

Write your report here:

`04-nestjs-api/04-nestjs-api-app/s1/phase8/<agent-name>-implementation-plan-review.md`

Final verdict:

- `PASS — IMPLEMENTATION PLAN APPROVED`
- `PASS WITH MINOR FIXES`
- `CONDITIONAL PASS`
- `NOT READY`
