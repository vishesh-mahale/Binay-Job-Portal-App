# Phase 09-C API Contract Amendment

**Status:** `APPROVED — supersedes Phase-06 Candidate TBD entries`

This amendment is the implementation authority for Candidate/Resume Phase 09-C. It does not add
tables, columns, events or queues.

## Candidate profile routes

```text
GET    /api/v1/candidates/me
PATCH  /api/v1/candidates/me
DELETE /api/v1/candidates/me/facts/:factType/:factId
```

The DELETE route performs `UPDATE ... SET deleted_at = NOW()`; physical DELETE is prohibited.
`factType` is limited to `links`, `skills`, `experiences`, `educations`, `certifications`,
`projects`, `languages`, and `awards`. Every mutation requires ownership and expected profile
revision; one logical mutation creates one history row, one revision bump and one
`candidate.profile.changed` event.

## Resume routes (unchanged)

```text
POST /api/v1/resumes/upload
GET  /api/v1/resumes/:id/status
GET  /api/v1/resumes/:id/parsed-data
POST /api/v1/resumes/:id/confirm
```

## Parsed-data response

Outer response fields:

```text
document_id, parsing_job_id, schema_version, overall_confidence,
confidence_details, validation_result, normalized_output, partial, created_at
```

`partial` is derived from parsing status. `normalized_output` is validated against the versioned
allowlist of top-level categories: `contact_info`, `professional_title`, `summary`, `skills`,
`experiences`, `educations`, `certifications`, and `languages`. Unknown keys are rejected/omitted.
Raw text, raw AI output, artifacts, internal errors, storage location and secrets are excluded.

## Confirm retry behavior

Repeated or concurrent confirmation of the same document returns the existing successful state.
It creates no duplicate link, revision, history row or outbox event. A changed payload conflicts;
stale expected revision returns `STALE_REVISION`. The baseline has no generic outbox idempotency
column, so domain uniqueness and locked existing-link detection remain the database guard.
