# Phase 09-C — Final Candidate/Resume Contract Decision

**Date:** 27 August 2026  
**Status:** `APPROVED WITH FIXES — IMPLEMENTATION AFTER CONTRACT PATCHES`

## Consensus

All reports agree on the main architecture: NestJS owns authenticated commands, private storage
metadata and outbox creation; FastAPI owns asynchronous scanning/parsing/projection; RLS remains
defense-in-depth. I independently cross-checked the reports against the actual SQL and contracts.

## Decision 1 — Candidate profile routes

Freeze these routes:

```text
GET    /api/v1/candidates/me
PATCH  /api/v1/candidates/me
DELETE /api/v1/candidates/me/facts/:factType/:factId
```

The DELETE operation is a soft-delete update (`deleted_at = NOW()`), never a physical SQL DELETE.
Allowed `factType` values are `links`, `skills`, `experiences`, `educations`, `certifications`,
`projects`, `languages`, and `awards`. Child foreign key is `candidate_id` referencing
`candidate_profiles.id`; `is_soft_deleted` and `candidate_profile_id` are not valid names.

Profile read uses UserContextClient/RLS. Profile mutation and fact archive use SystemClient,
ownership checks, expected revision, one history row, one revision bump and one
`candidate.profile.changed` event per logical command.

## Decision 2 — Parsed-data response

The outer response is frozen as:

```text
document_id
parsing_job_id
schema_version
overall_confidence
confidence_details
validation_result
normalized_output
partial
created_at
```

`partial` is derived from the actual parsing status enum (`partial`). It is not a database column.

`normalized_output` must be validated against an explicit versioned allowlist before returning it.
Top-level approved categories are:

```text
contact_info
professional_title
summary
skills
experiences
educations
certifications
languages
```

Unknown top-level keys are rejected or omitted according to the final DTO policy. The API must
never return `extracted_text`, `raw_ai_output`, artifacts, internal error details,
`storage_bucket`, `storage_path`, tokens or secrets. Returning opaque unvalidated JSONB is rejected.

## Decision 3 — Confirm idempotency

For `POST /api/v1/resumes/:id/confirm`:

- document ownership, clean scan, completed/partial parse and expected revision are checked;
- candidate profile row is locked before mutation;
- an already-confirmed same document returns the existing successful state;
- no duplicate `candidate_profile_documents` row is created;
- no second revision bump, history row or `candidate.profile.changed` event is created;
- same document with materially different payload returns a deterministic conflict;
- stale expected revision returns `409 STALE_REVISION`;
- all writes and outbox work commit or roll back together.

The current baseline has no generic `idempotency_key` column in `outbox_events`; do not invent one
inside this slice. Domain uniqueness plus locked existing-link detection is the authoritative
database guard. HTTP `Idempotency-Key` remains an input for replay correlation until a separate
approved persistence design exists.

## Corrections to agent reports

- The alternate upload route `/api/v1/candidates/me/resumes` is rejected; the catalog route is
  `/api/v1/resumes/upload`.
- Current schema uses `candidate_id`, `deleted_at`, `is_current`, and `unlinked_at`.
- `bump_candidate_profile_revision()` only bumps the profile row; history insertion remains an
  explicit service transaction step.
- `candidate-profile-changed.v1.json` currently does not contain `profile_revision`; do not add it
  silently. Projection reads the authoritative profile revision from DB. A contract amendment is
  a separate producer/consumer decision if needed.

## Implementation gate

Before coding, update the API catalog/DTO contract with the outer parsed-data schema and the
candidate routes above. Then implement NestJS tests for ownership, upload atomicity, scan gates,
redaction, duplicate confirm, stale revision and rollback. No further architecture redesign is
required for this slice.
