# Registered Application API — Implementation Plan

**Status:** `PLAN DRAFT — CODE NOT STARTED`

## 1. Scope

Registered candidate ke liye job apply command implement karna. Guest apply flow ko modify nahi karna,
lekin uske atomic transaction aur event envelope ko reference maana jayega.

Proposed endpoint (route freeze pending):

```text
POST /api/v1/jobs/:jobId/apply
```

## 2. Dependencies and authority

1. `02-database/migrations/baseline/09_applications.sql`
2. `02-database/migrations/baseline/05_jobs.sql`
3. `02-database/migrations/baseline/06_documents.sql`
4. `02-database/migrations/baseline/08_candidates.sql`
5. `contracts/events/application-submitted.v1.json`
6. `04-nestjs-api/PHASE-06-API-CATALOG.md`
7. `04-nestjs-api/04-nestjs-api-app/CODEX-CONSOLIDATED-APPLICATION-API-DECISION.md`

## 3. Coding gates (must be frozen first)

- Exact public route spelling.
- Registered snapshot JSON keys and maximum size.
- Consent acknowledgement and audit metadata.
- Whether application-only pre-uploaded documents are accepted.
- Duplicate replay response convention.
- `application.submitted` consumer/dispatcher route ownership (event writing can proceed; delivery remains phased).

## 4. Controller and DTO

Controller responsibilities:

- Authenticate candidate JWT through the existing auth guard.
- Read `jobId` from the route; never accept candidate/user/company identity from the body.
- Validate DTO and map domain errors to the existing API error format.
- Do not accept raw resume bytes in this command.

DTO (proposed):

```text
document_id: UUID
cover_letter?: string
answers_to_screening_questions?: JSON array
consent: true
```

## 5. Service transaction

Use the existing trusted server DB transaction abstraction. No Cloud Tasks, FastAPI, email, storage or
other network call may occur before commit.

Inside one transaction:

1. Resolve authenticated user to its candidate profile.
2. Lock/re-read the target job and enforce `published`, non-deleted and non-expired.
3. Validate selected document ownership, role/origin and approved security state.
4. Validate screening answer ids against the job's stored questions.
5. Insert registered `job_applications` row with `is_guest = false` and status `applied`.
6. Insert immutable `application_documents` link.
7. Build and insert one `submitted` `application_profile_snapshots` row with source profile revision.
8. Insert initial `application_status_history` row.
9. Insert consent/audit metadata in the approved audit structure.
10. Insert `application.submitted` v1 outbox envelope with `snapshot_id`, `submitted_at` and `occurred_at`.
11. Commit and return only the application id/status/timestamps and safe snapshot summary.

Any error rolls back all rows. Canonical candidate profile tables are never mutated by apply.

## 6. Duplicate and concurrency handling

Baseline unique index `(job_id, candidate_id) WHERE is_guest = FALSE` is the current idempotency authority.
Concurrent unique violations must be mapped to a safe read of the existing application. The handler must
not create a second snapshot, history row or outbox event. A persisted Idempotency-Key store is out of scope
until separately approved.

## 7. Eligibility rules

```text
status = 'published'
deleted_at IS NULL
(expires_at IS NULL OR expires_at > NOW())
```

Paused, closed, expired, draft, pending-approval and archived jobs reject. Confidential published jobs may
accept applications; confidentiality affects presentation, not eligibility.

## 8. Tests and exit criteria

- DTO/auth/consent validation.
- Owned library document success and invalid-owner rejection.
- Expired/paused/closed/deleted/non-published rejection.
- Confidential published job success.
- Screening answer validation.
- Full snapshot immutability after profile edits.
- Duplicate and concurrent submit produce exactly one application/snapshot/outbox event.
- Transaction rollback leaves no partial rows.
- Event validates against `application-submitted.v1.json`.
- Response and outbox task payload contain no raw resume content.

Implementation is complete only when unit, database integration and concurrency tests pass and the route,
snapshot and consent gates above are recorded as approved.
