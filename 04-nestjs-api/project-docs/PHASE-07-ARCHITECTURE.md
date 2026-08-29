# Phase 07 — Scalable NestJS API Architecture

Status: `ARCHITECTURE APPROVED — PHASE 08 IMPLEMENTATION PLAN NEXT — CODING NOT AUTHORIZED`

This document defines the architecture boundary for the main NestJS API. It does not authorize
implementation code. Public paths/DTOs that remain `TBD` in Phase 06 are finalized during the
Phase 07 API-design step without inventing new business behavior.

## 1. Source and authority

Architecture is derived from:

- `PHASE-05-FINAL-REQUIREMENTS.md`
- `PHASE-06-API-CATALOG.md`
- `DECISION-01-NESTJS-SUPABASE-ACCESS-MODEL-HINGLISH.md`
- `DECISION-02-REALTIME-TRANSPORT-HINGLISH.md`
- `DECISION-03-APPLICATION-SUBMITTED-EVENT-HINGLISH.md`
- `DECISION-04-SAVED-CANDIDATES-HINGLISH.md`
- `DECISION-05-FIRST-RESUME-ACTIVE-DEFAULT-HINGLISH.md`
- `DECISION-06-API-ERROR-VOCABULARY-HINGLISH.md`
- SQL baseline `01–18`, contracts, dispatcher registry and FastAPI worker

No module may create a new table, event, enum or contract without an approved forward decision.

## 2. High-level runtime flow

```text
Next.js browser
   | user JWT / SSE ticket / WebSocket handshake
   v
NestJS API (Cloud Run)
   | guards + DTO validation + ownership + rate limits
   | UserContextClient for approved personal/catalog reads
   | SystemClient for business writes and protected document reads
   | BEGIN: business rows + history/audit + outbox_events
   | COMMIT
   v
Post-commit realtime nudge / outbox wake-up
   |
   +--> SSE per-user status/notification stream
   +--> WebSocket conversation delivery (chat only)
   +--> Outbox Dispatcher -> Cloud Tasks -> private FastAPI worker
                                  |
                                  +--> result/evidence/projection transaction
```

Durable PostgreSQL rows and histories are the source of truth. Realtime delivery is an optimization;
its failure never rolls back a business transaction.

## 3. Bounded contexts and ownership

```text
modules/
├── identity-auth/          users, sessions, verification, protected-request context
├── companies/              companies, branches, departments, teams, memberships
├── candidates/             canonical profile, facts, revisions, saved_candidates, search projection request
├── resumes-documents/      upload metadata, ownership, scan/parsing status and review data
├── jobs/                   job CRUD, approval/publish/lifecycle, saved_jobs and expiry command boundary
├── search/                 job/candidate query and explainable ranking read models
├── applications/           apply, snapshots, guest apply/claims, status transitions
├── referrals/              manual batches, invitations, attribution and reward state
├── interviews/             schedules, participants, availability and feedback
├── messaging/              durable messages, participants, read receipts and chat commands
├── notifications/          in-app notification query/ack and notification-domain boundary
├── realtime/                SSE status stream, WebSocket chat adapter, recovery and auth
├── analytics-feedback/     approved analytics and feedback use cases
├── subscriptions/          explicit provider gap; no implementation until decision
└── ai-commands/            approved AI request commands; worker execution remains external
```

Each module owns its use cases, authorization policy, repositories and transaction orchestration.
Modules do not directly mutate another module’s tables. Cross-domain changes use an application
service or approved database function and emit only approved contracts.

## 4. Shared layers and dependency direction

```text
HTTP/SSE/WebSocket adapters
          ↓
Application commands/queries + guards
          ↓
Domain policies and use cases
          ↓
Infrastructure ports
   ├── SystemClient/UserContextClient repositories
   ├── storage adapter
   ├── outbox repository
   ├── realtime fan-out adapter
   └── observability/config
          ↓
Supabase PostgreSQL / private storage / approved external adapters
```

Adapters may depend on application ports. Domain code must not import NestJS controllers, Supabase
SDK globals, Cloud Tasks clients or FastAPI URLs.

## 5. Supabase access model — Controlled Hybrid

### UserContextClient

Use only for explicitly approved personal/catalog reads where `17_rls.sql` grants and SELECT RLS
policies exist. The request JWT context must be propagated safely; `auth.uid()` is evaluated by
PostgreSQL RLS. No browser credential is elevated.

### SystemClient

Use for all business writes, document/parsing reads, guest protected paths and background/system
work. NestJS must verify JWT, account status, role, company scope and ownership before opening the
trusted transaction. The trusted credential is server-only and injected through Secret Manager.

### Hard rules

- Separate `UserContextClient` and `SystemClient` providers; no accidental cross-injection.
- `service_role`/trusted credentials never reach Next.js or browser responses.
- RLS remains active as the approved direct-read defense; default-deny tables stay backend-only.
- Background workers use server-only credentials and approved functions/transactions.
- Cross-tenant negative reads/writes and direct authenticated DML-denial tests are mandatory.

## 6. Transaction and outbox boundary

Every mutating command follows:

```text
authenticate → authorize → validate DTO/ownership
      ↓
BEGIN trusted transaction
  lock rows in deterministic order
  write business rows
  write history/audit
  write approved outbox_events
COMMIT
      ↓
publish realtime nudge / wake dispatcher
```

No Cloud Tasks, FastAPI, email, WebSocket or external provider call occurs inside the transaction.
The exact deterministic row-lock order for each multi-entity command is defined in the Phase 08
implementation plan; implementation must not choose ad-hoc lock order.
`application.submitted` is emitted atomically but currently has no dispatcher route and must remain
fail-closed. Gate G-1 envelope reconciliation is required before producer implementation.

## 7. Resume and guest architecture boundary

- Upload command performs authentication, ownership, file validation, private storage write and
  document metadata + `security.scan.requested` outbox commit.
- First profile resume is active by Decision-05; later selection is explicit.
- Security scan clean transition creates the parsing job and `resume.parse.requested`; parsing is
  never treated as synchronous upload work.
- Parsed review data is allowlisted; candidate confirmation alone promotes approved facts to
  canonical profile tables and emits `candidate.profile.changed`.
- Application-only resume writes application links/snapshot only; it never mutates canonical profile
  or candidate search projection.
- Guest session/claim operations remain service-protected and enforce active, unexpired, unrevoked,
  job-bound and ownership/XOR rules.

## 7A. Job expiry scheduler boundary

```text
Supabase pg_cron
  schedule: daily_job_expiry_sweep (35 18 * * * UTC = 12:05 AM IST)
        |
        v
public.expire_due_jobs()
        |
        +--> published/paused due job -> expired
        +--> audit_logs row
        +--> creator-only in-app notifications row
```

`daily_job_expiry_sweep` is configured after `pg_cron` is enabled by
`02-database/migrations/baseline/01_extensions.sql`; its idempotent creation is recorded after the
function in `15_infrastructure.sql`. Search and apply still enforce the defensive `expires_at`
condition, so scheduler delay does not expose an expired job. This path does not use NestJS,
Outbox Dispatcher or Cloud Tasks.

## 8. Realtime architecture

Decision-02 is authoritative:

- SSE: resume/projection/job/application/interview status and in-app notification nudges.
- WebSocket: HR-candidate chat, acknowledgements/read receipts and future ephemeral presence.
- REST/database reads: recovery/source of truth after reconnect.
- Supabase Realtime/Broadcast: not the initial browser primary transport.
- JWT/ticket is verified at connection; user/tenant authorization is rechecked for subscriptions and
  conversation joins.
- Event payloads are lightweight references/revisions; no resume content, tokens or signed URLs.
- WebSocket reconnect recovers through the durable message cursor; REST message history remains the
  source of truth for missed chat messages.

## 9. Outbox and worker boundary

NestJS owns business-event creation. The separate Outbox Dispatcher owns claiming/publishing and is
not duplicated inside this API. Current dispatcher input routes are exactly those registered in its
registry; unknown/unrouted events fail closed. FastAPI owns AI/scanning execution and result/evidence
transactions, using `processed_events` idempotency and revision/lease guards.

## 10. Security and observability

- Global JWT/auth-status/role/tenant/ownership guards.
- DTO validation and approved error envelope from Decision-06.
- Per-route configurable rate limits; no numeric thresholds invented here.
- Correlation/request/trace IDs across HTTP, DB, outbox, task and worker calls.
- Structured redacted logs; no raw resume text, storage paths, secrets, tokens or provider internals.
- Health endpoints distinguish liveness, readiness, database and dependency status.
- Metrics: request latency/errors, transaction failures, outbox insert count, realtime connections,
  notification lag and worker task correlation.

## 11. Proposed implementation structure

```text
src/
├── main.ts
├── app.module.ts
├── modules/                 # bounded contexts above
├── infrastructure/
│   ├── database/
│   │   ├── system-client/
│   │   ├── user-context-client/
│   │   ├── transaction/
│   │   └── repositories/
│   ├── storage/
│   ├── outbox/
│   ├── realtime/
│   └── config/
├── common/
│   ├── guards/
│   ├── decorators/
│   ├── validation/
│   ├── errors/
│   ├── idempotency/
│   ├── observability/
│   └── health/
└── contracts/              # references/validators; source remains shared contracts/
```

Exact filenames and framework adapters are Phase 08 implementation-plan decisions.

## 12. Architecture acceptance tests

1. Cross-tenant and cross-user negative authorization tests pass.
2. Every mutating command commits business rows/history/outbox atomically.
3. Rollback produces no realtime event or external task.
4. Duplicate idempotency replay produces no duplicate side effect.
5. SSE reconnect recovers authoritative status; WebSocket reconnect recovers message cursor.
6. Unrouted outbox events fail closed and remain auditable.
7. Browser never receives trusted database credentials.
8. Resume/application-only/guest flows preserve their separate canonical/snapshot boundaries.
9. Concurrent multi-entity commands use the Phase 08 lock order without deadlocks.
10. Worker crash after claim/lease is recovered without duplicate business effects.
11. Database outage rolls back the command and emits no realtime/task side effect.
12. Duplicate idempotency commands remain safe under concurrent load.

## 13. Phase 07 open items

- Gate G-1 producer/envelope reconciliation.
- Exact public paths and DTO schemas for `TBD` catalog entries.
- Message idempotency persistence mechanism.
- Notification email/template provider contracts.
- Subscription provider decision.
- Saved-jobs requirement ownership.
- Phase 03 GAP-003..015 remain tracked as phased/open items; Phase 08 must carry each owner,
  acceptance test and implementation gate forward.

Status remains `NOT READY FOR IMPLEMENTATION` until Phase 08 implementation plan and independent
architecture review pass.
