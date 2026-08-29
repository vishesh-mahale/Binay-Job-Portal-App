# Phase 09-D — Registered Application API

**Status:** `IMPLEMENTED — UNIT VERIFIED; DATABASE INTEGRATION PENDING`

## Implemented

- `POST /api/v1/jobs/:jobId/apply`
- Authenticated candidate identity derived from JWT
- Published/non-expired/non-deleted job eligibility
- Owned, clean uploaded-document validation
- Atomic application, document link, immutable submitted snapshot, history, audit and outbox event
- Existing `application-submitted.v1` envelope with snapshot and timestamps
- Duplicate candidate/job replay protection using baseline unique index
- Consent and screening-answer shape validation
- Controller/service registered in `AppModule`

## Verification

```text
npm run build                                      PASS
npm test -- --runInBand --forceExit src/applications.spec.ts   3/3 PASS
npm test -- --runInBand --forceExit --silent                       77/77 PASS (25 suites)
```

## Remaining gates

- Run against a reset/dev database with real candidate, document and job rows.
- Verify every selected document role/security transition against deployed SQL.
- Add concurrency integration test proving one application/snapshot/event under parallel submits.
- Freeze exact snapshot JSON contract and consumer ownership before routing `application.submitted`.
