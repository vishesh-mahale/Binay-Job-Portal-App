# Phase 06 API Catalog Review Prompt

Act as an independent Senior NestJS API, PostgreSQL/RLS, security and distributed-systems
reviewer.

This is a review of the Phase 6 catalog, not an implementation task. Do not modify code, SQL,
contracts or the catalog. Do not invent routes, tables, events, columns or behaviors. Verify every
claim against the repository source of truth.

Audit target:

`04-nestjs-api/PHASE-06-API-CATALOG.md`

Read:

- `AGENTS.md`
- `04-nestjs-api/PHASE-05-FINAL-REQUIREMENTS.md`
- `04-nestjs-api/PHASE-01-REQUIREMENTS-CONSOLIDATION.md`
- `04-nestjs-api/PHASE-02-REQUIREMENTS-TRACEABILITY-MATRIX.md`
- `04-nestjs-api/PHASE-03-GAP-CONFLICT-ANALYSIS.md`
- `04-nestjs-api/PHASE-04-STATE-MACHINES-AND-TRANSACTIONS.md`
- `04-nestjs-api/04-nestjs-api-app/s1/codex/STAGE-03-REMAINING-DECISIONS.md`
- Decision-01 and Decision-02
- Database baseline SQL 01–18
- `contracts/events/` and `contracts/tasks/`
- `05-outbox-dispatcher-nestjs/`
- `07-fastapi-ai-worker/`

Verify every catalog entry for:

1. API ID and requirement ID traceability.
2. HTTP path/method or internal command accuracy.
3. Actor, role, tenant and ownership checks.
4. Correct UserContextClient versus SystemClient access path.
5. DTO fields and validation against real schema/contracts.
6. Tables/functions read and written.
7. Transaction boundary and no external calls inside transactions.
8. Outbox event, contract, dispatcher route and consumer.
9. Idempotency and optimistic concurrency behavior.
10. Rate-limit classification without invented numeric values.
11. Audit/security event requirements.
12. Error codes, HTTP statuses and sanitized details.
13. Acceptance criteria and negative tests.
14. Guest-session active/unexpired/unrevoked ownership rules.
15. Application-only resume versus canonical profile behavior.
16. SSE/REST recovery and WebSocket chat boundary.
17. Saved-candidate private HR/employer ownership and uniqueness.
18. Referral/interview/notification/messaging scope and phased gaps.
19. Seven dispatcher input routes and expected phased gaps.
20. No worker output event incorrectly treated as dispatcher input.

Report any issue with:

- Issue ID and severity
- Exact catalog/source section
- Evidence
- Impact
- Recommended correction
- Whether it blocks catalog freeze, architecture or coding

Do not claim tests passed unless actually executed with evidence.

Write your report here:

`04-nestjs-api/04-nestjs-api-app/s1/phase6/<agent-name>-phase6-api-catalog-review.md`

Final verdict must be one of:

- `PASS — API CATALOG FROZEN`
- `PASS WITH MINOR FIXES`
- `CONDITIONAL PASS`
- `NOT READY`
