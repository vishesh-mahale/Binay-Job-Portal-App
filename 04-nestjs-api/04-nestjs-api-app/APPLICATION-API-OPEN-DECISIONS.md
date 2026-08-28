# Registered application API — contract decisions before coding

Status: `OPEN — NO CODE YET`

Repository evidence confirms the transaction shape (job eligibility, selected document, immutable
application snapshot, audit/history and approved outbox) but does not freeze the public route or
request DTO. Do not invent either.

## Decisions required

1. Exact route shape for registered apply (for example a job-nested command versus a candidate
   application collection).
2. Request fields: selected library resume versus application-only upload reference, consent and
   screening answers.
3. Snapshot contents and maximum size; snapshot must remain immutable after profile edits.
4. Idempotency-key scope and replay response for the one candidate+job uniqueness rule.
5. Exact approved application event contract. `application.submitted` is mentioned in requirements,
   but dispatcher routing/consumer ownership must remain explicit.
6. Eligibility behavior for expired, paused, closed and confidential jobs.

## Source references

- `02-database/migrations/baseline/09_applications.sql`
- `04-nestjs-api/PHASE-06-API-CATALOG.md` API-APPLICATION-001
- `01-requirements/current/PRODUCT-REQUIREMENTS.md` §11
- `contracts/` application event/task definitions

## Non-negotiable boundaries

- Apply never mutates the candidate canonical profile.
- Parsing must not block application submission.
- Business rows, immutable snapshot, audit/history and approved outbox write atomically.
- No raw resume content is returned in the application response.
- Cross-candidate and cross-company access is denied.

## Consolidated recommendations (not yet human-frozen)

- Route: `POST /api/v1/jobs/:jobId/apply`.
- Apply eligibility: only `published`, non-deleted, non-expired jobs; paused jobs reject.
- Request: one owned pre-uploaded `document_id`, optional cover letter/screening answers, and
  required consent acknowledgement. Inline file upload is outside this command.
- Snapshot: full submission-time canonical facts plus profile revision and document reference;
  exact JSON keys still need contract freeze.
- Idempotency: use the existing `(job_id, candidate_id)` unique index and return the existing
  application on a duplicate; do not advertise an unpersisted Idempotency-Key contract.
- Event: emit existing `application.submitted` v1 atomically; dispatcher routing remains an
  expected phased gap until consumer ownership is approved.
