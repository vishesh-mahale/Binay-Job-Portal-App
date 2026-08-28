# Phase 08 — NestJS API Detailed Implementation Plan

Status: `IMPLEMENTATION PLAN APPROVED — PHASE 09 CODING PROVISIONING NEXT`

यह plan `PHASE-05-FINAL-REQUIREMENTS.md`, frozen `PHASE-06-API-CATALOG.md`, approved
`PHASE-07-ARCHITECTURE.md`, Decision-01..06, SQL baseline 01–18 और shared contracts से derived है।
यह coding task नहीं है; Phase 09 में ही implementation शुरू होगी।

## 1. Global implementation rules

- Next.js browser केवल NestJS API को call करेगा; direct Supabase Auth/DB/Storage business access नहीं।
- User JWT हर REST request पर verify होगा; SSE/WS connection पर JWT/ticket verify होगा।
- `UserContextClient` केवल approved RLS personal/catalog reads के लिए।
- `SystemClient` सभी business writes, protected document/parsing reads, guest paths और system work के लिए।
- हर mutating command: validate → authorize → BEGIN → business + history/audit + outbox → COMMIT।
- Transaction के अंदर Cloud Tasks, FastAPI, email, WebSocket या external provider call नहीं।
- Existing SQL functions/triggers/contracts को bypass करने वाला ad-hoc mutation नहीं।
- Idempotency key, expected revision और deterministic row-lock order अनिवार्य जहाँ catalog कहता है।
- Secrets/PII/raw resume text/storage paths/tokens logs या task payloads में नहीं।
- Unknown/unrouted events fail-closed रहेंगे।

### Generic client idempotency gate

Existing domain-specific keys (`resume_parsing_jobs`, referrals, notifications and analytics) remain
authoritative where their schemas already provide them. A generic client-command idempotency store
is not present in SQL 01–18, so Phase 09 must not invent an in-memory-only guarantee. Platform owns
an approved forward migration/design for durable key + request fingerprint + response reference,
with retention and tenant scope defined before any generic command depends on it. Until that gate
closes, commands use their existing domain keys or remain explicitly `TBD`.

## 2. Dependency order

```text
Foundation/config/errors/observability
        ↓
Identity + auth guards + database clients
        ↓
Companies/membership + tenant authorization
        ↓
Candidates + resumes/documents + onboarding
        ↓
Jobs + search
        ↓
Applications + guest claims + saved candidates/jobs boundary
        ↓
Referrals + interviews
        ↓
Notifications + SSE + messaging WebSocket
        ↓
AI command producers + admin/analytics/feedback
        ↓
E2E, load, security and production gates
```

## 3. Phase 08-A — Foundation and infrastructure

### Scope/requirements

`REQ-PLATFORM-001..008`, `REQ-API-001..007` and cross-cutting SEC/TX/IDEM/RATE/AUD/OBS policies.

### Modules/files

```text
src/main.ts
src/app.module.ts
src/common/errors/
src/common/validation/
src/common/guards/
src/common/idempotency/
src/common/observability/
src/common/health/
src/infrastructure/config/
src/infrastructure/database/system-client/
src/infrastructure/database/user-context-client/
src/infrastructure/database/transaction/
src/infrastructure/storage/
```

### Work

- Configuration schema and fail-fast secret validation.
- Sanitized success/error envelope from Decision-06.
- Global exception filter, validation pipe, request/trace correlation.
- JWT verification, active-account guard and trusted internal caller guard.
- Separate injectable `UserContextClient` and `SystemClient` tokens.
- Transaction helper with deterministic lock-order hooks.
- Storage adapter with private bucket policy and checksum metadata.
- Liveness/readiness/DB dependency health endpoints.

### Tests/exit criteria

- Invalid/expired JWT, inactive account, malformed DTO and oversized payload tests.
- Service credential cannot be serialized into responses/logs.
- User client cannot perform trusted write; SystemClient is not injectable into browser read adapter.
- Error envelope snapshot and PII-redaction tests pass.

## 4. Phase 08-B — Identity, companies and authorization

### Scope

`REQ-AUTH-001..007`, `REQ-ONBOARDING-001`, `REQ-COMPANY-001..005`.

### Use cases

- Registration/bootstrap/OAuth verification boundary.
- Session/security operations and protected-request context.
- Company/branch/department/team management.
- Membership invite/activate/deactivate and ownership/tenant guards.

### DB/contracts

Use only `03_users_auth.sql`, `04_companies.sql`, `17_rls.sql`, approved audit/security functions and
existing auth contracts. Exact public paths/DTOs from Phase 06 `TBD` are finalized before coding.

### Tests

- Cross-user and cross-company negative reads/writes.
- Owner/member deactivation guard and role/status transition tests.
- OAuth callback replay, duplicate bootstrap and session revocation tests.
- Direct authenticated DML denial and trusted-role transaction tests.

## 5. Phase 08-C — Candidate, resume, guest and onboarding workflows

### Scope

`REQ-CANDIDATE-001..006`, `REQ-RESUME-001..007`, guest application requirements and Decision-05.

### Use cases

1. Upload profile resume: validate/store metadata + `security.scan.requested` atomically.
2. First upload active invariant; later explicit active selection.
3. Status/parsed-data read with ownership-safe `404` and deterministic stage.
4. Clean scan → parsing job/event boundary; parsing remains asynchronous.
5. Confirm allowlisted facts with expected revision; canonical facts/history/outbox atomic.
6. Guest session/upload/status/claim with active/unexpired/unrevoked/job-bound rules.
7. Application-only resume remains application snapshot-only and never promotes to search profile.

### DB/events

`06_documents.sql`, `07_resume_processing.sql`, `08_candidates.sql`, approved resume/security/parse/
profile contracts and seven-route dispatcher registry. No worker output is treated as browser input.

### Tests

- First resume checked/disabled and server invariant cannot be bypassed.
- Checksum reuse creates no duplicate document/scan event.
- Infected/quarantined/failed/pending/partial states map to approved codes/stages.
- Concurrent confirmation: one revision/event; stale revision produces `STALE_REVISION`.
- Guest XOR, expiry/revocation, session reuse, token protection and claim transitions.
- Storage orphan/cleanup compensation remains phased and auditable.

## 6. Phase 08-D — Jobs, search and applications

> **Decision sync (2026-08-27):** Jobs/Search J1–J8 are now approved in
> `04-nestjs-api/04-nestjs-api-app/jobs-search-review/DECISION-07-JOBS-SEARCH-FINAL.md`.
> Follow that decision for routes, permissions, approval, expiry, search, pagination, visibility and
> event boundaries; remaining SQL objects and DTO details are implementation deliverables.

### Scope

`REQ-JOB-001..003`, `REQ-SEARCH-001..004` (current; `REQ-SEARCH-005` FUTURE/GAP-010), `REQ-APPLICATION-001..007`, saved-candidate decision and
saved-jobs upstream decision.

### Use cases

- Job create/update/approval/publish/pause/expiry lifecycle.
- Expiry runtime: `daily_job_expiry_sweep` (Supabase `pg_cron`, `35 18 * * *` UTC) invokes
  `public.expire_due_jobs()`; it updates status, audit and creator in-app notification atomically.
- Candidate/job search with tenant visibility and explainable ranking.
- Registered and guest application with immutable submitted snapshot.
- `application.submitted` v1 emitted atomically; no current dispatcher route, fail closed.
- Application status transition through approved function/command with history/audit/outbox.
- HR saved-candidate owner-scoped create/remove/list; unique recruiter+candidate behavior.

### DB/events

Use `09_applications.sql`, `08_candidates.sql`, job/search tables and `application-submitted.v1.json`.
Do not invent `application.status.changed` contract; keep it as phased gap.

### Tests

- One logical candidate+job application and idempotent retry.
- Snapshot immutability after candidate profile changes.
- Invalid/terminal application transitions and rejection-reason rules.
- Cross-company application visibility and saved-candidate privacy.
- Concurrent job/application updates and deterministic lock order.

### Deterministic lock-order matrix

| Command family | Lock order (parent to child) | Owner |
|---|---|---|
| Resume upload/confirm | users → candidate_profiles → uploaded_documents → parsing/profile facts | resumes-documents/candidates |
| Registered/guest application | jobs → candidate/guest session → uploaded document → job application → snapshot | applications |
| Application status | job_applications → company membership/actor context → status history | applications |
| Referral attribution | job → invitation/claim → application → reward | referrals |
| Interview scheduling | application → interviewer/availability → schedule block → participants | interviews |
| Message send/read | conversation → participant membership → message/read receipt | messaging |
| Company/member deactivation | company → member → department head/team lead/manager references → membership state | companies |
| Job lifecycle | company → job → approval/history/skill/screening child rows | jobs |

Child rows with no parent lock are locked in stable UUID order. This matrix is mandatory for Phase 09
implementation and concurrency tests; no command may introduce an ad-hoc order.

## 7. Phase 08-E — Referrals and interviews

### Scope

`REQ-REFERRAL-001..007`, `REQ-INTERVIEW-001..002`; `REQ-INTERVIEW-003` remains future.

### Use cases

- Any eligible active authenticated user referral policy (no invented HR-only gate).
- Referral batch/invitation lifecycle, attribution and reissue policy.
- Reward state transitions and type-specific terms; provider/payment calls remain phased.
- Interview schedule/reschedule/cancel with participants, availability and schedule blocks.

### Tests

- Active invitation uniqueness/reissue and immutable claim identity.
- Referral attribution cannot cross application/company scope.
- Reward terminal-state and financial-term immutability.
- Interview overlap, participant authorization, reschedule/cancel history and concurrency.

## 8. Phase 08-F — Notifications, realtime and messaging

### Scope

`REQ-NOTIFY-001..003`, `REQ-MESSAGE-001`, `REQ-REALTIME-001` and Decision-02.

### Use cases

- In-app notification list/unread/ack through NestJS.
- SSE per-user status/notification nudge with REST recovery.
- WebSocket chat with participant authorization and durable message cursor.
- `REQ-NOTIFY-002/003` email/provider/template work remains deferred; no fake route/consumer.

### Tests

- JWT/ticket auth at REST/SSE/WS connect and tenant isolation.
- SSE reconnect recovers authoritative state; missed events do not lose truth.
- WS reconnect recovers durable message cursor; non-participant cannot join.
- DB rollback emits no realtime event; duplicate message/idempotency behavior is safe.
- Realtime transport outage does not fail or roll back REST business commands; recovery fetches
  authoritative rows after reconnect.
- Chat gap recovery returns every missed durable message in cursor order.
- Notification list/unread/ack remains correct when the SSE stream is disconnected.

## 9. Phase 08-G — AI commands, analytics, feedback and gaps

### Scope

`REQ-AI-001..004`, `REQ-ANALYTICS-001`, `REQ-FEEDBACK-001`, subscription gap and Phase 03 GAP-003..015.

### Work

- NestJS validates/authorizes AI command and creates only approved outbox events.
- Dispatcher/FastAPI retain execution, leases, idempotency and result writes.
- Analytics/feedback follow tenant, PII and idempotency policies.
- Subscription/provider APIs remain explicitly blocked until product/provider decision.
- Every Phase 03 gap receives the owner/gate mapping below; out-of-scope gaps remain blocked rather
  than being silently implemented.

### Phase 03 gap ownership map

| Gap | Owner/gate | Treatment |
|---|---|---|
| GAP-003 SLO/performance | Platform/Operations gate | Phase 09 load test thresholds before production |
| GAP-004 fast-track extraction | Resume/AI product decision | Deferred; no fast-track path invented |
| GAP-005 configurable referral reward | Referrals + Product decision | Manual referral scope proceeds; configurable program blocked |
| GAP-006 email templates | Notifications + Product/provider decision | Deferred; no template table/API invented |
| GAP-007 saved candidates | Candidates module | Implemented in Phase 08-D scope |
| GAP-008 subscription provider | Subscriptions + Product decision | Explicitly blocked |
| GAP-009 AI provider/model/cost | AI commands + Product/AI decision | Generic producer only; provider contract gate |
| GAP-010 external search engine | Search + Product/Infrastructure decision | PostgreSQL search scope only; external engine deferred |
| GAP-011 realtime reconnect | Realtime module | SSE/WS cursor recovery tests required |
| GAP-012 application.submitted | Applications + Contracts gate | Atomic emit; unrouted fail-closed |
| GAP-013 dispatcher phased routes | Dispatcher owner | Registry authority and phased-gap tests |
| GAP-014 accessibility target | Next.js/Product quality gate | API remains unaffected; WCAG target before UI release |
| GAP-015 notification email dispatcher | Notifications/Dispatcher gate | Deferred until versioned contract/provider exists |

## 10. Contract and event implementation gates

- Close Gate G-1 envelope reconciliation before any producer implementation.
- Verify every producer payload against its versioned JSON Schema.
- `application.submitted` is emitted atomically but not routed until notification route is approved.
- Existing contracts are immutable; breaking changes require a new version and compatibility window.
- Dispatcher registry is the only route authority; unknown events fail closed.
- G-5 disposition: `application.submitted` is an approved, expected-unrouted event. Applications
  owns its atomic producer; Dispatcher owns an allowlisted expected-unrouted/alert-suppression rule
  until the notification route is approved. It must remain auditable and must not be silently dropped.

### Registered event producer ownership

| Event | Emitting use case | Phase 08 owner |
|---|---|---|
| `security.scan.requested` | profile/guest document upload | resumes-documents |
| `resume.parse.requested` | clean security-scan transition | resumes-documents/AI boundary |
| `candidate.profile.changed` | candidate confirmation | candidates |
| `match.analyze.requested` | approved application/matching trigger | applications/ai-commands |
| `job.ai.enrichment.requested` | approved job lifecycle point | jobs/ai-commands |
| `job.screening_questions.requested` | approved job lifecycle point | jobs/ai-commands |
| `interview.summary.requested` | approved interview completion point | interviews/ai-commands |

## 11. Security/operations gates

- Secret Manager bindings for database/trusted credentials and internal webhook secrets.
- No service-role credential in browser, logs, task payloads or error details.
- RLS negative tests plus NestJS guard/ownership tests.
- Rate limits remain configuration, with retry headers and metrics.
- Structured logs, traces, health checks and audit retention verified.

## 12. Load/failure and deployment testing

- Unit and integration suites per module.
- PostgreSQL concurrency/SKIP LOCKED and deterministic lock-order tests where applicable.
- Worker crash, stale lease, Cloud Tasks retry/dead-letter and database outage tests.
- 1000-event outbox burst and idempotency replay load test.
- Load-test pass thresholds (throughput, p95 latency, error rate, memory and queue lag) are defined
  by the Phase 09 environment/SLO gate before the test is marked passed; this plan does not invent
  numeric values.
- Local NestJS + local worker, real Cloud Tasks + dev Cloud Run, and pre-prod E2E tests.
- CI runs lint/typecheck/unit/integration/security-contract tests; deployment promotes only on green gates.

## 13. Rollback and operational notes

- Deploy modules behind feature flags/config where product behavior is phased.
- Database changes remain forward-only after baseline freeze; use reviewed migrations.
- Disable a consumer/route before rollback if an event contract is incompatible.
- Preserve outbox/audit/history rows; never hard-delete legal/audit records.
- Reconcile failed/dead-letter events through approved runbooks and fresh causation-linked events.

## 14. Phase exit criteria

Phase 08 implementation plan is ready for review when:

1. Every Phase 06 API/use case maps to a Phase 08 work item and test suite.
2. Every dependency, DB object, event/contract and security boundary is named or explicitly TBD.
3. Lock order, idempotency persistence and G-1 ownership are assigned.
4. Phase 03 GAP-003..015 have owner, acceptance and phase gates.
5. Independent Phase 08 review passes.

Phase 08 review and final revalidation complete होने के बाद, Phase 09 का shared Foundation slice अलग start gate के तहत authorized है। Full business endpoint/event implementation अभी domain gates के अधीन है:

```text
IMPLEMENTATION PLAN: APPROVED
PHASE 09 FOUNDATION SLICE: AUTHORIZED — see PHASE-09-CODING-START-GATE.md
FULL BUSINESS ENDPOINT/EVENT CODING: CONDITIONAL — G-1 और domain gates pending
```
