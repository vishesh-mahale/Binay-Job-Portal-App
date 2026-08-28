# Phase 05 Re-validation Prompt

This is a **re-validation after corrections**, not a first-time review. Earlier agent reports
reviewed an older version. Verify that the newly applied changes fixed earlier findings and did
not introduce regressions. Repeat the complete coverage audit; do not inherit earlier approval
automatically.

Act as an independent Senior Product Architect, NestJS Architect, PostgreSQL/RLS reviewer and
Distributed-Systems Engineer.

Audit the updated file:

`04-nestjs-api/PHASE-05-FINAL-REQUIREMENTS.md`

Read and cross-check:

- `AGENTS.md`
- `04-nestjs-api/PHASE-01-REQUIREMENTS-CONSOLIDATION.md`
- `04-nestjs-api/PHASE-02-REQUIREMENTS-TRACEABILITY-MATRIX.md`
- `04-nestjs-api/PHASE-03-GAP-CONFLICT-ANALYSIS.md`
- `04-nestjs-api/PHASE-04-STATE-MACHINES-AND-TRANSACTIONS.md`
- `04-nestjs-api/04-nestjs-api-app/s1/codex/STAGE-03-REMAINING-DECISIONS.md`
- Decision-01 and Decision-02
- Database baseline SQL 01–18, especially `08_candidates.sql`, `09_applications.sql`,
  `15_infrastructure.sql` and `17_rls.sql`
- `contracts/events/` and `contracts/tasks/`
- `05-outbox-dispatcher-nestjs/src/routing/event-route.registry.ts`
- `07-fastapi-ai-worker/`

Do not modify any source file. Do not blindly accept the earlier reviews. Do not invent missing
requirements, routes, events, tables or columns. Do not claim tests passed unless actually run.

Verify specifically:

1. All Phase-1 REQUIRED requirement groups and `REQ-*` IDs are represented or explicitly linked.
2. `REQ-SAVED-CANDIDATE-001` is current scope and not future/excluded.
3. Phase-3 gaps/conflicts and Phase-4 state machines are honestly carried forward.
4. RLS wording correctly separates personal/catalog `UserContextClient` reads from trusted
   `SystemClient` document/parsing reads and business writes.
5. Upload is NestJS-mediated multipart; validation is synchronous and ClamAV scanning asynchronous.
6. Seven dispatcher input routes are accurate.
7. `application.status.changed` is documented as an expected phased gap, not an invented route.
8. Worker output events are not incorrectly presented as dispatcher input routes.
9. UI stage derivation matches the two database status tracks and security precedence.
10. Current, future, planned and unresolved requirements are not silently merged.
11. Exit criteria are sufficient for declaring `FINAL REQUIREMENTS FROZEN`.
12. Coding remains blocked until the exit criteria pass.

For every issue report:

- Issue ID
- Severity
- Exact file/section
- Evidence from source of truth
- Impact
- Recommended correction
- Whether it blocks Phase 6 or coding

Write your report here:

`04-nestjs-api/04-nestjs-api-app/s1/phase5/<agent-name>-phase5-revalidation.md`

Final verdict must be one of:

- `PASS — FINAL REQUIREMENTS FROZEN`
- `PASS WITH MINOR FIXES`
- `CONDITIONAL PASS`
- `NOT READY`
