# Agent Review Prompt — Phase 09-C Candidate/Resume API Contract

Act as an independent Senior NestJS, PostgreSQL and security architect. Review the
Candidate + Resume API contract before implementation. Do not write application code.

## Authoritative sources (priority order)

1. `AGENTS.md`
2. `04-nestjs-api/PHASE-05-FINAL-REQUIREMENTS.md`
3. `04-nestjs-api/PHASE-06-API-CATALOG.md`
4. `04-nestjs-api/PHASE-07-ARCHITECTURE.md`
5. `04-nestjs-api/PHASE-08-IMPLEMENTATION-PLAN.md`
6. `04-nestjs-api/DECISION-01-NESTJS-SUPABASE-ACCESS-MODEL-HINGLISH.md`
7. `04-nestjs-api/DECISION-05-FIRST-RESUME-ACTIVE-DEFAULT-HINGLISH.md`
8. `02-database/migrations/baseline/06_documents.sql`, `07_resume_processing.sql`, `08_candidates.sql`, `17_rls.sql`
9. `contracts/` resume/security-scan/profile event and task schemas
10. Existing `05-outbox-dispatcher-nestjs` and `07-fastapi-ai-worker` code

## Review questions

1. Confirm the exact routes, actors, permissions and DTOs for:
   - `POST /api/v1/resumes/upload`
   - `GET /api/v1/resumes/:id/status`
   - `GET /api/v1/resumes/:id/parsed-data`
   - `POST /api/v1/resumes/:id/confirm`
   - candidate profile read/save/archive routes currently marked `TBD`.
2. Verify first-resume active-default and later explicit active-selection behavior.
3. Verify upload ownership, private storage, checksum reuse, document limits and soft-delete rules.
4. Verify the exact transaction: storage compensation boundary, `uploaded_documents`, parsing rows,
   audit/history and `security.scan.requested` / `resume.parse.requested` outbox events.
5. Verify scanner → parser → candidate confirmation → canonical profile → projection flow.
6. Verify parsed-data response allowlist; raw text, raw AI output, storage path and secrets must not leak.
7. Verify JWT/UserContextClient versus SystemClient usage and RLS/ownership checks.
8. Identify missing contracts, schema gaps, invented event names, unresolved paths or unsafe assumptions.
9. Define mandatory unit, integration, concurrency, failure and live E2E acceptance tests.

## Rules

- Never invent a route, table, column, event, queue or provider behavior.
- Mark every unresolved point as `NEEDS_DECISION` or `BLOCKER`.
- Distinguish confirmed repository facts from recommendations.
- Do not modify SQL or code in this review.

## Output

Write your report to:

`04-nestjs-api/s1/phase9-c-candidate-resume/<agent-name>-review.md`

Include: evidence table, proposed contract, gaps/conflicts, security findings,
test matrix, and final verdict (`APPROVED`, `APPROVED WITH FIXES`, or `BLOCKED`).
