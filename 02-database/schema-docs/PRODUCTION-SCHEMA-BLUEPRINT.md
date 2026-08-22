# Production Database Schema Blueprint

[← Database index](../README.md) · [Main project](../../README.md)

## Status

This is the approved first production database contract. The numeric SQL baseline
`01_extensions.sql` through `18_feedback.sql` has been executed successfully in the
current Supabase **testing environment**. Production is not deployed yet. During this
testing/schema-finalization phase, baseline SQL files may still be corrected and the
test database may be explicitly reset and rebuilt from `01` through `18`.

Baseline re-execution must be deliberate: reset the intended testing environment,
run the complete ordered baseline, rerun seed/integration tests and record the result.
Do not edit a file and assume an already-created database changed automatically.

The verified baseline SQL will be migrated into `02-database/migrations/baseline/`.
Until the production-baseline freeze, these files remain refinable. After production
deployment, applied baseline files become immutable history and later changes must be
new reviewed forward-only migrations. This document remains the human-readable guide;
executable SQL plus the explicitly targeted environment define actual schema state.

## Non-negotiable architecture rules

1. Uploaded files and AI parsing results are immutable evidence.
2. Candidate-editable profile facts are relational and canonical.
3. `candidate_profiles` does not contain `resume_data`.
4. One uploaded resume may have many parsing jobs; each parsing job has at most
   one parsed result.
5. Skills, experience, education, and certifications have dedicated evidence
   tables. Projects, languages, and awards retain embedded provenance and stable
   identifiers so evidence tables can be added later.
6. Search fields and embeddings are derived projections, never user-editable
   source data.
7. Every application snapshot is append-only. Parsed and enriched changes create
   new versioned records instead of updating existing rows.
8. Guest uploads use short-lived hashed-token sessions and guest-to-user claims
   are explicit and audited.
9. Canonical facts are editable and soft-deleted. Evidence payloads and all
   snapshots are never hard-deleted or overwritten; invalid evidence follows a
   controlled one-way status transition.
10. Database transactions write outbox events. Queue consumers are idempotent.
11. Application identity, application-document links, parsing artifacts, submitted
    history and lifecycle audit rows cannot be rewritten to change historical truth.
12. One candidate plus one job is one application. A reposted position gets a new
    `job_id`.
13. Referral invitation is not an application. An application exists only after
    the invited person chooses to apply.

## Dependency and file order

```text
01_extensions.sql
02_enums.sql
03_users_auth.sql
04_companies.sql
05_jobs.sql
06_documents.sql
07_resume_processing.sql
08_candidates.sql
09_applications.sql
10_interviews.sql
11_messaging.sql
12_notifications.sql
13_analytics.sql
14_subscriptions.sql
15_infrastructure.sql
16_indexes.sql
17_rls.sql
18_feedback.sql
```

## Domain ownership

| File/domain | Main owned objects |
|---|---|
| Extensions | `pgcrypto`, `vector`, `pg_trgm`, `unaccent`, `fuzzystrmatch`, `citext` capabilities |
| Enums | Shared lifecycle and domain enum types |
| Users/Auth | `users`, `user_sessions`, `user_security_log`, `login_history`, auth-user synchronization trigger |
| Companies | `companies`, `company_branches`, `departments`, `teams`, `company_members`, `company_settings` |
| Jobs | `job_categories`, `jobs`, `skills`, `skill_requests`, `job_skills`, `job_locations`, view tracking/aggregates, job FTS functions |
| Documents | `guest_upload_sessions`, `uploaded_documents` |
| Resume processing | `resume_parsing_jobs`, `resume_parsed_data`, `resume_parsing_artifacts`, `resume_parsing_job_events` |
| Candidates | `candidate_profiles`, `candidate_profile_documents`, `candidate_links`, seven canonical fact domains, four evidence tables, `candidate_search_profiles`, `profile_change_history` |
| Applications | `job_applications`, status history, application documents/snapshots, guest claims, saved jobs, referral batches/invitations/rewards and controlled lifecycle functions |
| Interviews | Interview pools, interviewers, availability, schedule blocks, interviews, participants, feedback, documents |
| Messaging | Conversations, participants, messages, attachments, receipts and reactions |
| Notifications | Templates, preferences, notifications, delivery log and device tokens |
| Analytics | Events, daily aggregates, audit logs, search logs and error logs |
| Subscriptions | Plans, company subscriptions, invoices, coupons and redemptions |
| Infrastructure | `outbox_events`, `processed_events` |
| Indexes | Cross-domain query/performance indexes |
| RLS | Client-visible/service-only access decisions and helper functions |
| Feedback | `platform_feedback` |

## Write ownership

| Data | Candidate API | Recruiter API | AI worker | System worker |
|---|---:|---:|---:|---:|
| Candidate canonical facts | Own rows | No | Suggestions only | Merge policy only |
| Parsing jobs/results/artifacts | Read status | Authorized read | Create/update job, append result | Retry/cleanup |
| Evidence | Accept/reject via API | Verification append | Append AI evidence | Invalidate/supersede |
| Search projection | Read | Authorized read | FastAPI projection handler rebuilds | Rebuild/recovery |
| Submitted application snapshot | Create once/read | Authorized read | No | No update/delete |
| Enriched snapshot | Read | Authorized read | Append version | Append regenerated version |
| Outbox | No direct access | No direct access | Transactional insert | Publish/retry |

The production FastAPI service is a trusted private worker and may use a
restricted server-side DB role. Its parsing and projection handlers persist
worker-owned results directly, insert `processed_events`, and may atomically add
the next `outbox_events` row when a downstream step is required. It never
overwrites candidate canonical facts outside the approved merge policy.

All trusted writers are covered by one delivery path:

```text
outbox_events INSERT
  -> Supabase asynchronous Database Webhook
  -> Outbox Dispatcher
  -> Cloud Tasks
  -> private FastAPI worker

Google Cloud Scheduler -> missed/stuck event recovery only (final backup)
GCP Cloud Scheduler (dev-outbox-recovery-sweep every 10 min) -> Primary Recovery Sweeper (Option 5)
```

Binay-App implements the Outbox Dispatcher as a separate lightweight
NestJS/TypeScript Cloud Run service. Python/FastAPI remains the private AI,
document-processing and embedding worker.

## Immutability rules

- `resume_parsed_data`, parsing artifacts, evidence payloads, every application
  snapshot, and published outbox payloads are append-only.
- Evidence may move only from `active` to `superseded`, `rejected`, or
  `invalidated`; reactivation requires a new evidence row.
- Immutability is enforced with RLS plus database triggers that reject updates
  or deletes where appropriate.
- Canonical fact removal sets `deleted_at`; partial unique indexes ignore deleted
  rows.
- `candidate_search_profiles` is rebuilt only when the requested profile revision
  is still current, preventing stale workers from overwriting newer projections.
- One logical canonical-profile save calls `bump_candidate_profile_revision`
  exactly once, writes change-history rows and an outbox event in the same
  transaction.

## Application snapshot semantics

- `submitted`: exactly one immutable snapshot per application.
- `parsed`: versioned extraction of the submitted resume.
- `enriched`: versioned and recomputable AI/search enrichment.
- `reviewed`: optional recruiter-review record; versioned and auditable.

No snapshot row is updated in place. A changed parsed, enriched, or reviewed
representation is inserted with the next `snapshot_version`.

## Account creation and identity

Supabase Auth owns credentials and creates `auth.users`. The database trigger
`public.handle_new_user()` creates the matching `public.users` row with the same
UUID. When that application user has the candidate role, the candidate-signup
trigger creates one empty `candidate_profiles` row.

```text
Supabase Auth signup
  -> auth.users
  -> public.handle_new_user()
  -> public.users
  -> create_empty_candidate_profile()
  -> candidate_profiles (candidate only)
```

NestJS must not duplicate these trigger-owned inserts. Current authorization uses
the single `users.role` enum (`candidate`, `employer`, `hr`, `admin`). The proposed
multi-role `user_roles` table is not active in the current baseline.

## Application and guest integrity

- Registered application ownership is enforced through the candidate/user pair.
- Registered application documents must be active and owned by the application user.
- Guest application documents must be active and originate from the application's
  exact job-scoped guest upload session.
- Guest Apply locks and validates an active, unexpired session and consumes it in
  the same transaction that inserts the application, documents, submitted snapshot,
  initial history and outbox event.
- Application identity is immutable after insert.
- `application_documents` is append-only.
- `change_application_status(...)` is the controlled path that locks the application,
  validates the transition, updates current status, appends immutable history and
  inserts the outbox event atomically.
- A guest application is never rewritten into a registered application. Explicit
  `guest_candidate_claims` verify and associate the historical application through
  a guarded `pending -> verified -> merged` lifecycle.

## Referral integrity

Any eligible active authenticated user may refer; a dedicated recruiter role is
not required. Current production scope accepts manually entered candidate rows.

```text
referral_batches
  -> referral_invitations
  -> optional job_application only when recipient applies
  -> optional referral_rewards lifecycle
```

An invitation never creates a user, candidate profile or application by itself.
Identity and lifecycle triggers prevent arbitrary rewrites. Delivery retry reuses
the existing invitation. Expired/cancelled historical invitations may be explicitly
reissued with a new row and token; applied/declined invitations cannot be reissued.

Lifecycle state machines:

```text
Batch: draft -> ready -> processing -> completed / partially_failed
       draft / ready / processing -> cancelled

Invitation: pending -> queued -> sent -> opened -> applied
            failed -> queued for retry

Reward: not_eligible -> pending_eligibility -> eligible -> approved -> paid
        paid is terminal
```

## Outbox dispatch boundary

Business writers insert `outbox_events` atomically with their domain result. They do
not publish directly to FastAPI or rely on the webhook payload as business authority.

```text
NestJS/FastAPI transaction + outbox_events INSERT
  -> Supabase asynchronous INSERT webhook (primary wake-up)
  -> separate NestJS Outbox Dispatcher
  -> Google Cloud Tasks managed queue
  -> private Cloud Run FastAPI worker via Google OIDC
  -> result/evidence/projection + processed_events

GCP Cloud Scheduler (dev-outbox-recovery-sweep every 10 min)
  -> slow recovery wake-up for missed/stuck due events only
```

The Dispatcher claims a bounded database batch with safe locking. Cloud Tasks may
redeliver, so deterministic task identity, domain job leases and `processed_events`
make processing idempotent. FastAPI may add a chained outbox event only in the same
transaction as the result that requires the next step.

## Security rules

- Storage paths are never returned directly to clients; NestJS issues authorized
  signed URLs.
- Raw guest tokens are never stored. Only hashes are persisted and all sessions
  and claims expire.
- Candidates may edit only their canonical facts. AI evidence is not directly
  editable.
- Recruiters may read candidate data only through an authorized company job or
  application relationship and never edit candidate canonical facts.
- Service-role workers write parsing/evidence/projection data; they do not blindly
  overwrite candidate-confirmed facts.

## Search projection

`candidate_search_profiles` is the platform-neutral projection consumed by
PostgreSQL FTS, pg_trgm, pgvector, and future Meilisearch/OpenSearch sync. It
contains the source revision, normalized skills/titles/locations, searchable
text, vector metadata, and generation timestamps. It is not a source of truth.

Job search and candidate search use separate projections. PostgreSQL keyword search
(`search_vector`), normal filters and semantic embedding similarity solve different
parts of retrieval and may be combined explicitly by the query/service. Job and
candidate vectors compared for similarity must use the same embedding provider,
model, dimension and normalization contract.

## Implementation acceptance criteria

- SQL runs in numeric order with no forward references.
- No duplicate table, index, trigger, function, policy, or enum names.
- All foreign-key columns used by domain joins have supporting indexes.
- RLS is enabled for every client-visible table and each table has an explicit
  access decision, including service-only tables.
- Guest application, registered application, profile editing, resume reprocessing,
  evidence review, snapshot history, outbox retry, and stale-projection handling
  are representable without overwriting historical evidence.
- Signup triggers create exactly one matching application user and candidate profile.
- Registered/guest document-origin guards reject cross-owner/session attachment.
- Lifecycle insert/transition guards reject impossible application, claim, referral
  batch, invitation and reward states.
- Application status, history and outbox commit or roll back together.
- Replayed queue tasks do not duplicate results or downstream side effects.

## Source document coverage audit

| Original blueprint section | Current treatment |
|---|---|
| Status | Corrected for current Supabase testing environment and pre-production reset policy |
| Non-negotiable rules | All original rules preserved; application/referral historical-integrity rules added |
| Dependency/file order | Exact `01–18` order preserved |
| Domain ownership | Preserved and expanded from selected domains to all schema files |
| Write ownership | Preserved, including restricted FastAPI and outbox writers |
| Immutability rules | Preserved |
| Application snapshot semantics | Preserved |
| Security rules | Preserved |
| Search projection | Preserved and expanded with hybrid/embedding compatibility rule |
| Acceptance criteria | Preserved and expanded with trigger/lifecycle/idempotency tests |

Additional account-trigger, guest/application, referral और outbox sections clarification हैं; किसी original
architecture rule को silently remove नहीं किया गया।
