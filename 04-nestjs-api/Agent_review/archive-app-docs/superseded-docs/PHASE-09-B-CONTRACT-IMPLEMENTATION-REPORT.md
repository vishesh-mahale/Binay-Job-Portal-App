# Phase 09-B — Identity & Company Contract Implementation Report

Date: 2026-08-27
Status: `IMPLEMENTED — FINAL FREEZE REVIEW PENDING`

## Implemented contract/security fixes

- Company update DTO now contains only approved mutable fields; owner, slug, verification and
  deletion fields cannot be submitted through the update contract.
- Company GET/PATCH responses project approved safe fields rather than returning internal columns.
- Membership responses project approved membership summary fields; permissions, employee code,
  work email and work phone are not returned by default.
- Membership add validates optional branch, department, team and manager references against the
  same company before writing.
- Membership leave/deactivate both reject removal while the member is a department head, team lead
  or active manager; reassignment is required first.
- Public error mapping uses approved vocabulary (`VALIDATION_ERROR`, `IDEMPOTENCY_CONFLICT`,
  `PARSING_FAILED`, `DEPENDENCY_UNAVAILABLE`, `RATE_LIMITED`, etc.).

## Verification evidence

```text
npm test -- --runInBand  -> 16 suites passed, 35 tests passed
npm run build            -> passed
```

## Deliberately separate gates

These are not silently invented or closed by this report:

- Exact OpenAPI/DTO decorator generation and final API path publication.
- Live Supabase integration tests for every membership/organization command.
- Employment-type enum validation once the API validation mechanism is frozen.
- Final contract review and approval by an independent reviewer.

Until those gates pass, `PHASE-09-B-API-CONTRACT-FREEZE.md` remains a freeze candidate rather than
an unconditional production approval.
