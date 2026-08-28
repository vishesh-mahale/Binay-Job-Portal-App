# Final Freeze-Candidate Review Prompt — Phase 09-B

Act as an independent senior NestJS/PostgreSQL API reviewer. Do not trust earlier agent verdicts. Review only the current repository evidence.

## Canonical document under review

`04-nestjs-api/PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md`

## Evidence to cross-check

1. `04-nestjs-api/PHASE-05-FINAL-REQUIREMENTS.md`
2. `04-nestjs-api/PHASE-06-API-CATALOG.md`
3. `04-nestjs-api/PHASE-07-ARCHITECTURE.md`
4. `04-nestjs-api/PHASE-09-B-API-CONTRACT-DECISIONS-HINGLISH.md`
5. `04-nestjs-api/PHASE-09-B-DTO-FIELD-MAPPING-WORKSHEET.md`
6. `04-nestjs-api/PHASE-09-B-DTO-CLASS-CATALOG.md`
7. `02-database/migrations/baseline/03_users_auth.sql`
8. `02-database/migrations/baseline/04_companies.sql`
9. `02-database/migrations/baseline/17_rls.sql`
10. `AGENTS.md`

## Required checks

- Every endpoint and DTO in the candidate has a traceable requirement/catalog source.
- Every field is present in SQL or explicitly derived; report phantom fields.
- Actor, ownership, company scoping, single-owner, membership, rejoin and session semantics are consistent with D1–D8.
- `UserContextClient` vs `SystemClient` boundaries and RLS implications are accurate.
- Transaction, audit/history, idempotency, external-call and sensitive-field rules are implementable and not invented.
- Error vocabulary and acceptance criteria are either exact or clearly marked as pending.
- Ownership-transfer DTO/path and acceptance criteria are fully mapped; flag anything still conditional.
- Historical proposal/worksheet wording must not contradict the canonical candidate.

## Verdict rules

Use one of: `PASS`, `PASS WITH REQUIRED FIXES`, or `BLOCKED`. Do not call the contract frozen unless every required check passes. Distinguish architecture defects from documentation cleanup.

## Output

Write the review to:

`04-nestjs-api/s1/phase9-b-identity-companies-api/final-contract-review/<your-agent-name>-final-freeze-candidate-review.md`

Include: evidence paths/sections, findings by severity, exact fixes (if any), and a final verdict. Do not modify source or implementation files.
