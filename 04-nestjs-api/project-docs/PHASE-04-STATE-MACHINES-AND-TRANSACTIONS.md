# Phase 04 - State Machines and Transaction Rules

**Status:** Draft - state definitions grounded in baseline SQL; API transition policy and open-decision domains remain marked `TBD`.

## 1. Purpose and authority

This document freezes the lifecycle states, legal transition boundaries and database transaction rules that NestJS use-cases must follow. It does not create new tables, events, routes or enum values.

Authority order:

1. `AGENTS.md`
2. `04-nestjs-api/project-docs/PLAN-REQUIREMENTS-TO-IMPLEMENTATION-HINGLISH.md`
3. executable baseline SQL `01-18`
4. `contracts/`
5. current requirements and approved product decisions

Where the SQL enum exists but the complete transition graph is not enforced by SQL, NestJS must use an explicit transition policy and tests. It must not silently invent a new state.

## 2. Global transaction template

Every business command follows this boundary:

```text
request
  -> authenticate + authorize + validate
  -> BEGIN
  -> lock/read required rows
  -> write business rows and history/audit rows
  -> write outbox_events in the same transaction
  -> COMMIT
  -> return accepted/result

After COMMIT only:
  dispatcher / Cloud Tasks / FastAPI / email / external provider
```

Rules:

- No Cloud Tasks, FastAPI, email, storage network call or payment-provider call inside the open DB transaction.
- A failed transaction writes neither partial business state nor an orphan outbox event.
- Outbox insertion is idempotent through the approved event/idempotency rules; the dispatcher is separately idempotent.
- Every multi-row logical profile/application/referral operation uses one transaction.
- A status update that requires history must update current state, append history, audit, and outbox atomically.

## 3. Identity and account lifecycle

**Baseline enum:** `account_status` = `pending_verification`, `active`, `suspended`, `deactivated`, `banned` (`03_users_auth.sql`).

| Transition/use case | Required behavior | Transactional work |
|---|---|---|
| Signup | Auth user and application user/profile integration follows the existing trigger/provider contract | Auth integration and application-user row must not diverge; audit where defined |
| Pending verification -> active | Only verified auth flow/NestJS verification path | Update user status + verification/security audit atomically |
| Active -> suspended/deactivated/banned | Authorized admin/system policy only; ownership/membership guards apply | Update status + audit; reject unsafe company-owner/member transitions |
| Suspended/deactivated/banned -> active | Only an explicitly authorized recovery/reactivation policy; exact permissions remain `TBD` | Status + audit atomically |

No browser request may set `role`, `status`, ownership, or privileged flags directly. Referral capability is not a separate user role (`PD-001`).

## 4. Company and membership lifecycle

Company, branch, department, team and membership rows are retained/deactivated according to the approved `04_companies.sql` behavior. NestJS must verify company ownership/membership before every tenant operation.

Required invariants:

- A member/team lead/department head/manager reference cannot be removed without a valid reassignment workflow when the baseline guard requires it.
- Role alone never grants cross-company access.
- Rejoining follows the approved membership-row policy; no duplicate membership is created where the schema prevents it.
- Company/job ownership changes and related audit/outbox writes are one transaction.

## 5. Candidate canonical profile lifecycle

Canonical facts are editable state, not append-only evidence. Hard delete is not the normal operation; soft-delete/status rules in `08_candidates.sql` apply.

```text
profile save command
  -> validate complete request
  -> update candidate_profiles/fact tables
  -> write profile_change_history
  -> bump profile_revision exactly once per logical save
  -> insert one candidate.profile.changed event
  -> COMMIT
```

The projection worker reads the canonical profile tables and writes `candidate_search_profiles`; the projection is rebuildable and never the source of truth.

AI evidence/results are not allowed to overwrite canonical facts silently. Candidate acceptance/correction is a separate authorized transaction with evidence status/content rules and a new profile revision when canonical data changes.

## 6. Documents and resume processing

### 6.1 Document ownership

`uploaded_documents` ownership is origin-specific: registered upload belongs to `uploaded_by_user_id`; guest upload belongs to `guest_upload_session_id`. Storage is private and access uses authorized signed URLs.

### 6.2 Guest upload session

**Baseline states:** `active`, `consumed`, `expired`, `revoked`.

```text
active -> consumed       (application transaction)
active -> expired        (expiry workflow)
active -> revoked        (security/admin workflow)
```

The guest application trigger/function must verify same job, active status, unexpired timestamp and not revoked before creating the application.

### 6.3 Parsing job

**Baseline states:** `queued`, `processing`, `completed`, `partial`, `failed`, `cancelled`.

```text
queued -> processing -> completed
                    \-> partial
                    \-> failed
queued/processing -> cancelled   (only approved cancellation policy)
failed -> queued                  (retry policy, if retryable)
```

Parsing results, artifacts and processing events are immutable/append-only according to the baseline. A new attempt is represented by a new job where the schema/flow requires it; do not mutate historical result rows.

## 7. Job lifecycle

**Baseline enum:** `draft`, `pending_approval`, `published`, `paused`, `closed`, `expired`, `archived`.

NestJS must enforce authorization and an explicitly approved job-state transition policy. The following is the baseline candidate flow derived from the enum/comments; it is not permission to add unapproved reopen transitions:

```text
draft -> pending_approval -> published
published -> paused -> published
published -> closed / expired / archived
paused -> closed / expired / archived
```

Reopen/repost behavior is not assumed. A repost is a new `job_id` under the approved application uniqueness policy.

## 8. Application, snapshot and claim lifecycles

### 8.1 Application

**Baseline states:** `applied`, `under_review`, `shortlisted`, `screening`, `interview_scheduled`, `interview_completed`, `selected`, `offer_extended`, `offer_accepted`, `offer_declined`, `rejected`, `withdrawn`, `on_hold`.

The current status, `application_status_history`, rejection reason, audit and approved outbox event must be changed atomically through one authorized status command. The complete transition graph must be approved in the API catalog; invalid transitions must fail closed rather than be inferred from enum order.

Registered and guest apply both create the appropriate application record, immutable submitted snapshot and `application.submitted` v1 outbox event in one transaction. The event is PII-minimized and currently has no dispatcher route; notification routing is phased. A submitted snapshot is never updated or deleted; later enrichment creates a new snapshot version.

### 8.2 Guest claim

**Baseline states:** `pending`, `verified`, `merged`, `expired`, `revoked`, `rejected`.

```text
pending -> verified -> merged
pending -> expired / revoked / rejected
verified -> merged / revoked / rejected
merged = terminal
```

Claim identity fields remain immutable. Claim/application/candidate ownership, timestamps and audit/outbox writes are checked atomically.

### 8.3 Referral batch and invitation

**Batch states:** `draft`, `ready`, `processing`, `completed`, `partially_failed`, `cancelled`.

```text
draft -> ready -> processing -> completed / partially_failed
draft/ready/processing -> cancelled
```

**Invitation states:** `pending`, `queued`, `sent`, `opened`, `applied`, `declined`, `expired`, `failed`, `cancelled`.

Normal delivery retry uses the same invitation (`failed -> queued` only where the approved retry guard allows it). Reissue creates a new invitation only for an explicitly reissuable terminal row; token and identity are not rewritten.

### 8.4 Rewards

**Baseline states:** `not_eligible`, `pending_eligibility`, `eligible`, `approved`, `paid`, `cancelled`.

Financial terms become immutable after approval/paid according to `09_applications.sql`; paid is terminal. Amount/metadata validation is reward-type-specific and must not be guessed by the API.

## 9. Interviews, messaging and notifications

### Interviews

**Baseline states:** `scheduled`, `confirmed`, `rescheduled`, `completed`, `cancelled`, `no_show`.

Each schedule/reschedule/cancel/complete operation validates participants and timestamps, writes the current row plus audit/history/event data atomically. Meeting-provider integration occurs after commit.

### Messaging

Conversation participant states are `active`, `left`, `removed`, `blocked`. Message creation is transactional with attachment ownership checks; delivery/read/reaction side effects are idempotent and must not expose cross-tenant conversations.

### Notifications

Notification creation, preference evaluation and delivery-log creation are separated from external email/push calls. `notification.email.requested` is currently an expected phased gap: no queue/endpoint/contract may be guessed. Delivery retries and provider calls happen after commit.

Realtime transport and reconnect semantics are resolved by Decision-02; the authoritative status/read endpoint must exist independently of WebSocket/SSE/Realtime.

## 10. Outbox lifecycle

**Baseline states:** `pending`, `publishing`, `published`, `failed`, `dead_letter`.

```text
pending -> publishing -> published
                     \-> failed -> publishing (retry)
                     \-> dead_letter (retry limit)
```

Claiming uses the approved DB procedure and `FOR UPDATE SKIP LOCKED`; lease recovery returns stale publishing work to the approved retry path. External queue calls happen after claim transaction commit. Unknown/unregistered events fail closed and remain observable.

## 11. Idempotency and locking requirements

- Use request idempotency for commands that can be retried by the client.
- Use database uniqueness/approved functions for one-candidate-one-job, one submitted snapshot, one processed event and invitation identity rules.
- Lock rows in a deterministic order for multi-entity commands to reduce deadlocks.
- Never hold a DB transaction open while waiting for AI, Cloud Tasks, email or payment providers.
- Worker result commits use `processed_events` idempotency before/with result writes as defined by the worker contract.

## 12. State-machine test exit criteria

Before API implementation, tests must prove:

1. Every accepted transition succeeds with required timestamps/history.
2. Invalid, backward or terminal-state transitions fail without partial writes.
3. Retry of the same idempotent command does not duplicate business/history/outbox rows.
4. Concurrent updates do not bypass ownership, uniqueness or revision rules.
5. External calls are absent from open transaction code paths.
6. Guest/registered document and application ownership cannot cross.
7. Stale outbox leases recover without duplicate processing.

## 13. Open decisions and phase boundary

State machines above are grounded in current enums and SQL. The following remain blocked/TBD and must be resolved before final requirements freeze/API catalog freeze:

- Supabase access model: resolved by approved Decision-01; implement UserContextClient/SystemClient separation
- Realtime transport/reconnect: resolved by Decision-02; exact paths/DTOs remain API catalog work
- `application.submitted` contract: resolved v1; notification dispatcher route remains phased
- Saved candidates policy: resolved by Decision-04; implement `saved_candidates` model and APIs
- Configurable referral program/reward rules (`GAP-005`)
- Other phased items: SLO, templates, AI provider, payments, external search, accessibility, notification route

**Current status:** `STATE MACHINES DRAFT COMPLETE - DECISION-DEPENDENT AREAS MARKED`

**Next phase:** API catalog and final requirements freeze only after blocking decisions are resolved or explicitly phased.
