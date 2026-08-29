# Phase 06 API Catalog Revalidation Prompt

Act as an independent adversarial reviewer. Do not trust previous PASS/CONDITIONAL PASS claims.
Do not modify code, SQL, contracts or the catalog.

Audit:

`04-nestjs-api/PHASE-06-API-CATALOG.md`

Also read:

- `04-nestjs-api/DECISION-05-FIRST-RESUME-ACTIVE-DEFAULT-HINGLISH.md`
- `04-nestjs-api/DECISION-06-API-ERROR-VOCABULARY-HINGLISH.md`
- `04-nestjs-api/PHASE-06-REMAINING-DECISIONS.md`
- `04-nestjs-api/PHASE-05-FINAL-REQUIREMENTS.md`
- Phase 01–04 documents
- Decision-01, Decision-02 and Decision-03
- SQL baseline 01–18
- contracts/events and contracts/tasks
- dispatcher route registry and FastAPI handlers

Revalidate specifically:

1. First profile resume default is now approved: first upload active and UI control checked/disabled;
   later uploads require explicit choice; server enforcement is mandatory.
2. Error codes match Decision-06; no unapproved `CONFLICT`, `EXPIRED` or `CURSOR_INVALID` public code
   remains without an explicit mapping/change request.
3. Parsed-data allowlist and progress-stage/error distinction.
4. Upload does not incorrectly create `resume_parsing_jobs` before the clean security-scan transition.
5. Referral actor is any eligible active authenticated user, not an invented HR-only gate.
6. `application.submitted` v1 is emitted atomically and remains fail-closed/unrouted.
7. `REQ-NOTIFY-002/003`, saved-jobs, subscription, G-1 and all TBD boundaries remain honestly tracked.
8. All 15-field API entries, requirement IDs, tables/functions, access model, idempotency, security,
   rate limits, errors and acceptance criteria remain grounded in repository evidence.

For every issue provide: ID, severity, exact section, evidence, impact, correction and whether it
blocks catalog freeze or coding. Do not claim tests passed unless executed.

Write the report to:

`04-nestjs-api/04-nestjs-api-app/s1/phase6/<agent-name>-phase6-api-catalog-revalidation.md`

Final verdict: `PASS — API CATALOG FROZEN`, `PASS WITH MINOR FIXES`, `CONDITIONAL PASS`, or `NOT READY`.
