# Phase 07 — Independent Architecture Review

Status: `REVIEW COMPLETE`

Reviewer: opencode (Independent Senior NestJS, PostgreSQL/RLS and Distributed Systems Architect)
Audit target: `04-nestjs-api/PHASE-07-ARCHITECTURE.md` (235 lines)
Date: 2026-08-26

---

## Purpose

Independent verification of Phase 07 architecture against all 14 specified verification points.
No code, SQL, contract or architecture file is modified.

## Evidence files read

| File | Lines |
|---|---|
| AGENTS.md | 54 |
| PHASE-05-FINAL-REQUIREMENTS.md | 266 |
| PHASE-07-ARCHITECTURE.md | 235 |
| DECISION-01 (Access Model) | 178 |
| DECISION-02 (Realtime Transport) | 87 |
| DECISION-03 (application.submitted) | 46 |
| DECISION-04 (Saved Candidates) | 67 |
| DECISION-05 (First Resume Active) | 37 |
| DECISION-06 (Error Vocabulary) | 31 |
| PHASE-06-REMAINING-DECISIONS.md | 70 |
| PHASE-04-STATE-MACHINES-AND-TRANSACTIONS.md | 239 |
| PHASE-06-API-CATALOG.md | 859 |
| SQL baseline 01–18 (18 files) | ~3000+ |
| contracts/events (14 files) | ~500+ |
| contracts/tasks (7 files) | ~100+ |
| 05-outbox-dispatcher-nestjs (all source) | ~800+ |
| 07-fastapi-ai-worker (all source) | ~2500+ |

---

## Verification 1: Bounded contexts and module ownership

### Phase 07 §3 modules vs SQL tables

| Module | SQL files / tables | Match |
|---|---|---|
| identity-auth | 03 (users, user_sessions, user_security_log, login_history) | ✓ |
| companies | 04 (companies, branches, departments, teams, members, settings) | ✓ |
| candidates | 08 (candidate_profiles, 10 fact tables, search_profiles, history) | ✓ |
| resumes-documents | 06 (uploaded_documents, guest_upload_sessions) + 07 (resume_parsing_jobs, parsed_data, artifacts, events) | ✓ |
| jobs | 05 (jobs, skills, skill_requests, job_skills, job_locations, job_views, aggregates) | ✓ |
| search | No dedicated tables; reads jobs + candidate_search_profiles | ✓ (read model) |
| applications | 09 (job_applications, status_history, documents, snapshots, saved_jobs, saved_candidates) | ✓ |
| referrals | 09 (referral_batches, invitations, rewards) | ✓ |
| interviews | 10 (interview_pools, interviewers, availability, schedule_blocks, interviews, participants, feedback, documents) | ✓ |
| messaging | 11 (conversations, participants, messages, attachments, read_receipts, reactions) | ✓ |
| notifications | 12 (templates, preferences, notifications, delivery_log, device_tokens) | ✓ |
| realtime | No tables; adapter to SSE/WebSocket | ✓ (transport boundary) |
| analytics-feedback | 13 (analytics_events, aggregates, audit_logs, search_logs, error_logs) + 18 (platform_feedback) | ✓ |
| subscriptions | 14 (plans, subscriptions, invoices, coupons, eligibility, redemptions) | ✓ |
| ai-commands | No tables; orchestrates AI calls | ✓ (command boundary) |

**Infrastructure** (not a module): 15_infrastructure (outbox_events, processed_events, event_processing_leases) — correctly excluded from modules. ✓

### Requirements coverage

All requirement IDs from PHASE-05 §2 are covered by at least one module. Saved jobs (DEC-06-05, no REQ-ID) and subscription (GAP) are correctly tracked as open.

### Finding: search module cross-module read

The `search` module reads from `jobs` (jobs module) and `candidate_search_profiles` (candidates module). Architecture §3 says "Modules do not directly mutate another module's tables" but says nothing about cross-module reads. Cross-module reads are the norm for search/projection patterns and do not violate the mutation boundary.

**Verdict: PASS**

---

## Verification 2: Module dependency direction

### Phase 07 §4 declared direction

```text
HTTP/SSE/WebSocket adapters → Application commands/queries + guards → Domain policies and use cases → Infrastructure ports → PostgreSQL/storage/approved adapters
```

### Dependency analysis

- **Adapters → Application**: Controllers import application services. ✓
- **Application → Domain**: Use cases call domain policies. ✓
- **Domain → Infrastructure ports**: Domain code imports ports (repository interfaces), not implementations. ✓
- **Infrastructure → External**: Repositories use SystemClient/UserContextClient. ✓

### Cross-module imports

§3 says: "Modules do not directly mutate another module's tables. Cross-domain changes use an application service or approved database function and emit only approved contracts."

This is correct for writes. For reads, modules may read other modules' tables through repositories (e.g., search reads jobs + candidate_search_profiles). The architecture does not forbid cross-module reads — only cross-module mutations.

### Missing: explicit NestJS @Module import rules

The architecture does not specify whether NestJS `@Module` imports are allowed between domain modules. In a scalable NestJS architecture, domain modules should NOT import each other directly; cross-domain coordination should go through application services or shared infrastructure. This is implied but not stated.

**Severity: MINOR** — §3 says "Cross-domain changes use an application service" but does not explicitly say "NestJS @Module imports between domain modules are forbidden."

**Impact:** Low. The implied pattern is correct; an implementation-time decision could violate it without an explicit rule.

**Recommended correction:** Add to §3: "NestJS @Module imports between domain modules are forbidden; cross-domain coordination uses application services, shared infrastructure or approved database functions."

**Blocks architecture approval: No**

**Verdict: PASS WITH MINOR**

---

## Verification 3: UserContextClient/SystemClient vs Decision-01 and 17_rls.sql

### Decision-01 frozen rules

- UserContextClient: approved user-context reads with RLS
- SystemClient: trusted business writes and protected document reads
- Separate providers; no accidental cross-injection
- `service_role`/trusted credentials never reach browser
- RLS remains active as defense-in-depth
- Future expansion only with explicit grants/policies and tests

### Phase 07 §5 compliance

| Rule | Architecture §5 | Decision-01 | Compliant |
|---|---|---|---|
| UserContextClient for RLS reads | "Use only for explicitly approved personal/catalog reads where 17_rls.sql grants and SELECT RLS policies exist" | "Personal read where an explicit RLS SELECT policy exists" | ✓ |
| SystemClient for writes | "Use for all business writes, document/parsing reads, guest protected paths and background/system work" | "Business read/write or transaction → server-only trusted database path" | ✓ |
| Separate providers | "Separate UserContextClient and SystemClient providers; no accidental cross-injection" | "NestJS mein do explicitly separated adapters/clients honge" | ✓ |
| No browser credential leak | "service_role/trusted credentials never reach Next.js or browser responses" | "Browser ko Supabase service_role nahi milegi" | ✓ |
| RLS as defense-in-depth | "RLS remains active as the approved direct-read defense; default-deny tables stay backend-only" | "RLS remove nahi hogi...default-deny defense-in-depth ke roop mein rahegi" | ✓ |
| Server-only for workers | "Background workers use server-only credentials and approved functions/transactions" | Background services use server-only trusted role | ✓ |
| Cross-tenant tests mandatory | "Cross-tenant negative reads/writes and direct authenticated DML-denial tests are mandatory" | Required access tests in Decision-01 §6 | ✓ |

### 17_rls.sql actual grants verification

- `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated` — blanket revoke ✓
- Authenticated SELECT on ~30 tables (users, candidate_*, application_*, saved_*, referral_*, conversation_*, message_*) — matches UserContextClient scope ✓
- `consume_guest_upload_session`, `change_application_status`, outbox functions → service_role only — matches SystemClient scope ✓
- Helper functions (`owns_candidate`, `can_read_application`, `is_active_conversation_participant`) → authenticated + service_role — ✓
- 25 RLS policies enforce ownership/participant/candidate bounds — ✓

### Phase 05 §3 compliance

"Approved personal/catalog reads use UserContextClient with existing RLS SELECT policies; tables without an explicit grant/policy remain default-deny." — §5 mirrors this exactly.

**Verdict: PASS**

---

## Verification 4: REST, SSE and WebSocket split vs Decision-02

### Decision-02 frozen rules

| Use case | Transport | Recovery |
|---|---|---|
| Resume parsing/progress | SSE | REST status read |
| Candidate projection | SSE nudge | Projection status/revision read |
| Job AI processing | SSE nudge | Job AI/enrichment status read |
| Application status | SSE nudge | Application detail/history read |
| In-app notifications | SSE stream | Notifications inbox/unread read |
| HR-Candidate chat | WebSocket | REST message history/cursor |
| Interview updates | SSE nudge | Interview detail/status read |

### Phase 07 §8 compliance

| Decision-02 rule | Phase 07 §8 | Compliant |
|---|---|---|
| SSE for status/nudges | "SSE: resume/projection/job/application/interview status and in-app notification nudges" | ✓ |
| WebSocket for chat | "WebSocket: HR-candidate chat, acknowledgements/read receipts and future ephemeral presence" | ✓ |
| REST as source of truth | "REST/database reads: recovery/source of truth after reconnect" | ✓ |
| Supabase Realtime not primary | "Supabase Realtime/Broadcast: not the initial browser primary transport" | ✓ |
| JWT verified at connection | "JWT/ticket is verified at connection; user/tenant authorization is rechecked" | ✓ |
| Lightweight payloads | "Event payloads are lightweight references/revisions; no resume content, tokens or signed URLs" | ✓ |

### Missing from §8

- **WebSocket reconnect recovery**: Decision-02 §5 says "Chat mein durable message cursor se gap fetch hoga." §8 says "REST/database reads: recovery/source of truth" but does not explicitly state that WebSocket reconnect recovers via message cursor. Phase 07 §12 test #5 says "WebSocket reconnect recovers message cursor" which is correct, but §8 (the architecture description) should also state this.

**Severity: MINOR** — §8 describes the transport split correctly but does not explicitly state the WebSocket reconnect recovery path (message cursor). The test in §12 covers it.

**Impact:** Low. The test covers the behavior; the architectural description is slightly incomplete.

**Recommended correction:** Add to §8: "WebSocket reconnect recovers via durable message cursor; REST message history is the source of truth."

**Blocks architecture approval: No**

**Verdict: PASS WITH MINOR**

---

## Verification 5: Resume, guest, application snapshot and canonical profile boundaries

### Resume boundary (§7)

| Rule | Phase 07 §7 | Source | Compliant |
|---|---|---|---|
| Upload = auth + ownership + validation + storage + metadata + outbox | "Upload command performs authentication, ownership, file validation, private storage write and document metadata + security.scan.requested outbox commit" | Phase 05 §3, REQ-RESUME-001 | ✓ |
| First resume active (Decision-05) | "First profile resume is active by Decision-05; later selection is explicit" | Decision-05 | ✓ |
| Security scan clean → parsing | "Security scan clean transition creates the parsing job and resume.parse.requested; parsing is never treated as synchronous upload work" | Phase 05 §3, REQ-RESUME-002 | ✓ |
| Parsed review data allowlisted | "Parsed review data is allowlisted; candidate confirmation alone promotes approved facts to canonical profile tables" | Phase 05 §7 | ✓ |
| Application-only not promoted | "Application-only resume writes application links/snapshot only; it never mutates canonical profile or candidate search projection" | Decision-05, Phase 05 §7 | ✓ |

### Guest boundary (§7)

| Rule | Phase 07 §7 | Source | Compliant |
|---|---|---|---|
| Session/claim service-protected | "Guest session/claim operations remain service-protected and enforce active, unexpired, unrevoked, job-bound and ownership/XOR rules" | Phase 04 §6.2, REQ-APPLICATION-003..005 | ✓ |
| Ownership XOR | Owner CHECK in 06_documents.sql: exactly one of `uploaded_by_user_id` XOR `guest_upload_session_id` | 06_documents.sql | ✓ |

### Application snapshot boundary (Phase 04 §8.1)

"Submitted snapshot is never updated or deleted; later enrichment creates a new snapshot version." — immutable per `application_snapshots_immutable` trigger in 09_applications.sql. ✓

### Canonical profile boundary (Phase 04 §5)

"Canonical facts are editable state, not append-only evidence." — confirmed by `candidate_profiles` having mutable columns and `profile_change_history` tracking changes. ✓

### Resume ↔ Candidate cross-domain write

When the FastAPI worker completes resume parsing, it emits `candidate.resume.parsed` which triggers `candidate.profile.changed` → projection rebuild. This is a cross-domain write (resumes → candidates) mediated by an approved outbox event contract. The architecture correctly describes this as "candidate confirmation alone promotes approved facts to canonical profile tables" (§7). The worker's `candidate.profile.changed` event is a registered dispatcher route. ✓

**Verdict: PASS**

---

## Verification 6: Transaction + history/audit + outbox atomic

### Phase 07 §6 template

```text
BEGIN trusted transaction
  lock rows in deterministic order
  write business rows
  write history/audit
  write approved outbox_events
COMMIT
```

### Phase 05 §3 rule

"Business row, audit/history and outbox event commit atomically."

### Phase 04 §2 template

"write business rows and history/audit rows → write outbox_events in the same transaction → COMMIT"

### Verification against actual SQL

- `change_application_status()` in 09_applications.sql: writes `job_applications` + `application_status_history` + `outbox_events` in one function (SECURITY DEFINER) — atomic ✓
- `bump_candidate_profile_revision()` in 08_candidates.sql: updates profile + inserts history + inserts outbox event — atomic ✓
- `consume_guest_upload_session()` in 09_applications.sql: updates session + inserts application + inserts outbox — atomic ✓

### Missing: deterministic row locking order

Phase 07 §6 says "lock rows in deterministic order" but does not specify what the order is. Phase 04 §11 says "Lock rows in a deterministic order for multi-entity commands to reduce deadlocks." Neither document specifies the actual ordering.

**Severity: MINOR** — The principle is stated; the implementation detail is deferred. For an architecture document, this is acceptable if the Phase 08 implementation plan specifies the order.

**Impact:** Low for architecture approval; high for implementation. Deadlock risk if locking order is not defined before coding.

**Recommended correction:** Add a note: "The deterministic locking order per command type is defined in the Phase 08 implementation plan."

**Blocks architecture approval: No**

**Verdict: PASS**

---

## Verification 7: External calls outside transaction

### Phase 07 §6

"No Cloud Tasks, FastAPI, email, WebSocket or external provider call occurs inside the transaction."

### Phase 04 §2

"No Cloud Tasks, FastAPI, email, storage network call or payment-provider call inside the open DB transaction."

### Verification against actual code

| Component | External call | Inside transaction? |
|---|---|---|
| NestJS business commands | Outbox write → COMMIT → realtime nudge + dispatcher wake | After COMMIT ✓ |
| Outbox Dispatcher | Cloud Tasks API `createTask()` | After claim COMMIT ✓ |
| FastAPI security scan | ClamAV TCP socket, Supabase Storage HTTP | Before claim; result write in separate transaction ✓ |
| FastAPI resume parse | Gemini API, Supabase Storage HTTP | Before claim; result write in separate transaction ✓ |
| FastAPI projection | Gemini embedding API | Before claim; result write in separate transaction ✓ |
| FastAPI job enrichment | Gemini API | Before claim; result write in separate transaction ✓ |
| FastAPI match analysis | Gemini API | Before claim; result write in separate transaction ✓ |

All external calls occur outside open DB transactions. ✓

**Verdict: PASS**

---

## Verification 8: application.submitted and 7 dispatcher routes

### application.submitted

- Phase 07 §6: "application.submitted is emitted atomically but currently has no dispatcher route and must remain fail-closed." ✓
- Decision-03: "Notification worker/queue/endpoint contract abhi approved nahi hai, isliye application.submitted ka dispatcher route abhi register nahi hoga." ✓
- Phase 05 §9A: "application.status.changed is emitted by the approved application status function but currently has no contract file or dispatcher route" ✓
- Contract exists: `contracts/events/application-submitted.v1.json` ✓

### 7 dispatcher routes

Phase 07 §9: "Current dispatcher input routes are exactly those registered in its registry; unknown/unrouted events fail closed."

Verified against `05-outbox-dispatcher-nestjs/src/routing/event-route.registry.ts`:

| # | Event type | Queue | Contract | Architecture §9 |
|---|---|---|---|---|
| 1 | resume.parse.requested | ai-heavy-queue | resume-parse-task.v1.json | ✓ |
| 2 | candidate.profile.changed | projection-queue | candidate-projection-task.v1.json | ✓ |
| 3 | job.ai.enrichment.requested | ai-heavy-queue | job-enrich-task.v1.json | ✓ |
| 4 | match.analyze.requested | ai-heavy-queue | match-analyze-task.v1.json | ✓ |
| 5 | interview.summary.requested | ai-heavy-queue | interview-summary-task.v1.json | ✓ |
| 6 | job.screening_questions.requested | ai-heavy-queue | job-screening-questions-task.v1.json | ✓ |
| 7 | security.scan.requested | security-scan-queue | security-scan-task.v1.json | ✓ |

All 7 routes match. ✓

### Worker output events (NOT dispatcher inputs)

Phase 05 §9A correctly identifies: `candidate.projection.rebuilt`, `candidate.resume.parsed`, `job.enriched`, `application.match.analyzed`, `interview.summary_generated`, `job.screening_questions_generated` — all are FastAPI outputs, not dispatcher inputs. ✓

### Missing from §9: worker output → outbox chain

§9 says "FastAPI owns AI/scanning execution and result/evidence transactions, using processed_events idempotency and revision/lease guards." But it does not describe the mechanism by which worker output events (e.g., `candidate.resume.parsed`) are written as new outbox events from FastAPI. The actual mechanism is: FastAPI inserts directly into `outbox_events` within its own transaction (verified in task_handlers.py). This is correct but undocumented in the architecture.

**Severity: MINOR** — The mechanism is verified correct in code; the architecture description is incomplete.

**Impact:** Low for architecture; the pattern is standard for outbox-based choreography.

**Recommended correction:** Add to §9: "FastAPI worker result transactions may insert approved outbox events for downstream chained processing."

**Blocks architecture approval: No**

**Verdict: PASS**

---

## Verification 9: FastAPI and Outbox Dispatcher responsibility not duplicated in NestJS

### Responsibility matrix

| Concern | NestJS | Outbox Dispatcher | FastAPI |
|---|---|---|---|
| Business event creation | ✓ (§9) | — | — |
| Event claiming/publishing | — | ✓ (§9) | — |
| Cloud Tasks publishing | — | ✓ | — |
| AI/scanning execution | — | — | ✓ (§9) |
| Result/evidence transactions | — | — | ✓ (§9) |
| processed_events idempotency | — | — | ✓ |
| Business row writes | ✓ | — | Only approved result writes |
| DTO validation | ✓ | — | — |
| JWT/auth checks | ✓ | — | — (OIDC only) |

### Duplication check

- Does NestJS have an event-route registry? **No** — the registry is in the dispatcher. ✓
- Does NestJS claim/publish outbox events? **No** — uses DB functions; dispatcher does the claiming. ✓
- Does NestJS do AI processing? **No** — delegates to FastAPI via outbox. ✓
- Does the dispatcher do business writes? **No** — only marks outbox events published/failed. ✓
- Does FastAPI do business writes beyond its domain? **No** — only writes results, artifacts, outbox events, and processed_events. ✓

No responsibility duplication found. ✓

**Verdict: PASS**

---

## Verification 10: Security, secrets, PII logging, tenant isolation, idempotency

### Security (§10)

| Rule | Phase 07 §10 | Compliant |
|---|---|---|
| Global JWT/auth guards | "Global JWT/auth-status/role/tenant/ownership guards" | ✓ |
| DTO validation + error envelope | "DTO validation and approved error envelope from Decision-06" | ✓ |
| Rate limits (no numeric invention) | "Per-route configurable rate limits; no numeric thresholds invented here" | ✓ |
| Correlation/trace IDs | "Correlation/request/trace IDs across HTTP, DB, outbox, task and worker calls" | ✓ |
| Redacted logs | "Structured redacted logs; no raw resume text, storage paths, secrets, tokens or provider internals" | ✓ |
| Health endpoints | "Health endpoints distinguish liveness, readiness, database and dependency status" | ✓ |

### Secrets

- Phase 05 §3: "The trusted credential is server-only and injected through Secret Manager." ✓
- Phase 07 §5: "service_role/trusted credentials never reach Next.js or browser responses" ✓
- FastAPI: OIDC validation for Cloud Tasks Bearer tokens (task_handlers.py) ✓

### PII logging

- Phase 07 §10: "no raw resume text, storage paths, secrets, tokens or provider internals" ✓
- FastAPI: System prompt includes `<untrusted_resume_content>` tag for injection defense ✓
- Dispatcher: `sanitizeErrorMessage()` strips credentials, Postgres connection strings, Bearer tokens, signed URLs ✓

### Tenant isolation

- Phase 07 §5: "Cross-tenant negative reads/writes and direct authenticated DML-denial tests are mandatory" ✓
- 17_rls.sql: RLS policies enforce `company_id` bounds for companies, jobs, applications ✓
- Saved candidates: private per recruiter, `company_id` tenant boundary (Decision-04) ✓
- Conversations: `is_active_conversation_participant()` RLS helper ✓

### Idempotency

| Layer | Mechanism | Verified |
|---|---|---|
| HTTP idempotency | IDEMPOTENCY_CONFLICT error code (Decision-06) | ✓ |
| Outbox | Deterministic task names (`task-{sha256(event_id:urlPath)}`) | ✓ |
| Dispatcher | `alreadyExists` treated as success | ✓ |
| FastAPI | `processed_events` table (consumer, event_id) | ✓ |
| FastAPI | `event_processing_leases` for concurrent processing | ✓ |
| FastAPI | Optimistic concurrency (profile_revision, updated_at) | ✓ |
| SQL | `ON CONFLICT DO NOTHING` / `ON CONFLICT DO UPDATE WHERE revision <=` | ✓ |

### Missing security items

| Item | Status |
|---|---|
| CORS configuration | Not mentioned — implementation-time decision |
| CSRF protection | Not mentioned — implementation-time decision |
| `service_role` credential rotation | Not mentioned — OD-1 in Decision-01 covers future least-privilege role |
| Helmet/security headers | Not mentioned — implementation-time decision |
| Input sanitization (XSS) | Not mentioned — DTO validation covers structured input |

These are implementation-time concerns, not architecture gaps. The architecture correctly defers framework-specific security middleware to Phase 08.

**Verdict: PASS**

---

## Verification 11: Proposed NestJS folder/module structure scalability

### Phase 07 §11 structure

```text
src/
├── main.ts
├── app.module.ts
├── modules/                 # bounded contexts
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
└── contracts/              # references/validators
```

### Scalability analysis

| Aspect | Assessment |
|---|---|
| Module separation | 15 bounded contexts as independent NestJS modules — each grows independently ✓ |
| Infrastructure isolation | SystemClient, UserContextClient, repositories cleanly separated ✓ |
| Common shared layer | Guards, decorators, validation, errors, idempotency, observability, health — standard NestJS pattern ✓ |
| Contract references | Contracts kept as references; source remains in shared `contracts/` directory ✓ |
| Adding new modules | New bounded context → new folder under `modules/` with its own use cases, controllers, repositories ✓ |
| Adding new infrastructure | New adapter → new folder under `infrastructure/` ✓ |
| Testing | Module-level testing possible with NestJS testing utilities ✓ |

### Missing from §11

- **No explicit mention of how modules are registered in `app.module.ts`** — whether all modules are eagerly loaded or some use dynamic modules. This is an implementation-time decision.
- **No mention of shared DTOs/envelope** — the response envelope from Phase 05 §5 is not represented in the structure. Could go in `common/` or `contracts/`.

**Severity: MINOR** — The structure is sound and follows standard NestJS patterns. The missing items are implementation-time decisions.

**Impact:** Low.

**Recommended correction:** Consider adding `common/envelope/` or `contracts/response-envelope` for the shared success/error envelope.

**Blocks architecture approval: No**

**Verdict: PASS**

---

## Verification 12: Acceptance tests cover failure, concurrency, reconnect and authorization

### Phase 07 §12 tests

| # | Test | Covers |
|---|---|---|
| 1 | Cross-tenant and cross-user negative authorization tests pass | Authorization ✓ |
| 2 | Every mutating command commits business rows/history/outbox atomically | Atomicity ✓ |
| 3 | Rollback produces no realtime event or external task | Failure/rollback ✓ |
| 4 | Duplicate idempotency replay produces no duplicate side effect | Idempotency/concurrency ✓ |
| 5 | SSE reconnect recovers authoritative status; WebSocket reconnect recovers message cursor | Reconnect ✓ |
| 6 | Unrouted outbox events fail closed and remain auditable | Failure ✓ |
| 7 | Browser never receives trusted database credentials | Security ✓ |
| 8 | Resume/application-only/guest flows preserve their separate canonical/snapshot boundaries | Boundary integrity ✓ |

### Coverage gaps

| Scenario | Covered? | Source |
|---|---|---|
| Cross-tenant negative authorization | ✓ Test #1 | |
| Atomic commit (rows + history + outbox) | ✓ Test #2 | |
| Rollback produces no side effects | ✓ Test #3 | |
| Idempotent replay | ✓ Test #4 | |
| SSE reconnect | ✓ Test #5 | |
| WebSocket reconnect | ✓ Test #5 | |
| Unrouted events fail closed | ✓ Test #6 | |
| Credential leak prevention | ✓ Test #7 | |
| Boundary preservation | ✓ Test #8 | |
| Concurrent status updates | Not explicitly tested | Phase 04 §12 #4 covers this; should be in Phase 07 |
| Stale outbox lease recovery | Not explicitly tested | Phase 04 §12 #7 covers this; should be in Phase 07 |
| Guest session expiry/revocation during apply | Not explicitly tested | Phase 04 §6.2 covers this |
| Deterministic locking order deadlock prevention | Not explicitly tested | Phase 04 §11 covers this |

### Missing tests

**Severity: MINOR** — Phase 04 §12 provides more comprehensive test exit criteria (7 tests including concurrent updates, stale lease recovery, guest ownership, external call absence). Phase 07 §12 is a subset. For architecture approval, the 8 tests are sufficient; the full suite from Phase 04 should be referenced.

**Impact:** Low. Phase 04 tests are authoritative and should be referenced rather than duplicated.

**Recommended correction:** Add to §12: "For complete test exit criteria, see also Phase 04 §12."

**Blocks architecture approval: No**

**Verdict: PASS**

---

## Verification 13: Open decisions and Phase 8 dependencies honestly documented

### Phase 07 §13 open items

| Item | Status | Honest? |
|---|---|---|
| Gate G-1 producer/envelope reconciliation | Open | ✓ Matches DEC-06-03 |
| Exact public paths and DTO schemas for TBD catalog entries | Open | ✓ Matches DEC-06-02 |
| Message idempotency persistence mechanism | Open | ✓ Matches DEC-06-06 |
| Notification email/template provider contracts | Open | ✓ Matches DEC-06-04 |
| Subscription provider decision | Open | ✓ Matches API-SUBSCRIPTION-001 GAP |
| Saved-jobs requirement ownership | Open | ✓ Matches DEC-06-05 |

### Additional open items NOT listed in §13

| Item | Source | Missing? |
|---|---|---|
| Parsed-data field-by-field allowlist | Phase 05 §9, API-RESUME-003 | Yes — not in §13 |
| Numeric rate-limit values | Phase 05 §9 | Yes — not in §13 |
| Exact guest token/header transport | Phase 05 §9 | Yes — not in §13 |
| Final application-specific resume DTOs | Phase 05 §9 | Yes — not in §13 |
| Configurable referral program/reward rules (GAP-005) | Phase 04 §13 | Yes — not in §13 |

### Phase 05 §9 exit criteria (8 items)

Phase 05 lists 8 remaining blockers before FINAL FREEZE. Phase 07 §13 lists 6. The discrepancy is because some Phase 05 items are expected to be resolved during Phase 07 API-design, while others (like exact DTOs) are deferred.

**Severity: MINOR** — §13 is not comprehensive compared to Phase 05 §9. Some Phase 05 blockers are not mentioned as open items.

**Impact:** Low. The open items are tracked in Phase 05 and DEC-06-xx; §13 does not need to be exhaustive if it cross-references the source documents.

**Recommended correction:** Add to §13: "Additional open items from Phase 05 §9 (parsed-data allowlist, numeric rate limits, guest transport, application-specific DTOs) are resolved during Phase 08 implementation planning."

**Blocks architecture approval: No**

**Verdict: PASS**

---

## Verification 14: No invented tables, fields, events, routes, roles or providers

### Tables

Every table referenced in Phase 07 exists in SQL baseline 01–18:
- `candidate_profiles`, `candidate_search_profiles` → 08_candidates.sql ✓
- `uploaded_documents`, `guest_upload_sessions` → 06_documents.sql ✓
- `resume_parsing_jobs`, `resume_parsed_data` → 07_resume_processing.sql ✓
- `job_applications`, `application_status_history`, `application_profile_snapshots` → 09_applications.sql ✓
- `saved_candidates`, `saved_jobs` → 09_applications.sql ✓
- `outbox_events`, `processed_events`, `event_processing_leases` → 15_infrastructure.sql ✓
- `conversations`, `messages` → 11_messaging.sql ✓
- `notifications` → 12_notifications.sql ✓
- `analytics_events`, `audit_logs` → 13_analytics.sql ✓

**No invented tables.** ✓

### Fields

No specific new fields are proposed in Phase 07. The document operates at the module/boundary level, not the column level. ✓

### Events

| Event | Phase 07 reference | Contract exists? | Dispatcher route? |
|---|---|---|---|
| application.submitted | §6, §9 | ✓ | No (fail-closed) ✓ |
| candidate.profile.changed | §9 | ✓ | ✓ |
| resume.parse.requested | §7 | ✓ | ✓ |
| security.scan.requested | §7 | ✓ | ✓ |
| candidate.resume.parsed | §5 Phase 05 ref | ✓ | No (worker output) ✓ |
| candidate.projection.rebuilt | §5 Phase 05 ref | ✓ | No (worker output) ✓ |
| job.enriched | §5 Phase 05 ref | ✓ | No (worker output) ✓ |
| application.match.analyzed | §5 Phase 05 ref | ✓ | No (worker output) ✓ |
| interview.summary_generated | §5 Phase 05 ref | ✓ | No (worker output) ✓ |
| job.screening_questions_generated | §5 Phase 05 ref | ✓ | No (worker output) ✓ |

**No invented events.** ✓

### Routes

Phase 07 does not invent any new API routes. It correctly defers exact paths/DTOs to Phase 07 API-design (§1) and Phase 08 implementation. ✓

### Roles

No new roles are invented. The existing roles from `02_enums.sql` (`user_role`: candidate, hr, employer, admin) are not extended. ✓

### Providers

- Supabase PostgreSQL ✓
- Cloud Tasks (GCP) ✓
- ClamAV ✓
- Gemini / Vertex AI / OpenAI ✓
- Secret Manager ✓

**One concern:** Phase 07 §11 mentions `src/` structure implying a single deployment unit. The architecture does not explicitly state that the Outbox Dispatcher is a **separate** NestJS application (not a module within this API). The dispatcher code is in `05-outbox-dispatcher-nestjs/` — a separate directory. This is correctly reflected in §9 ("The separate Outbox Dispatcher owns claiming/publishing") but the separation could be more explicit.

**Severity: MINOR** — The separation is implied by "separate Outbox Dispatcher" wording but not structurally explicit.

**Impact:** Low.

**Recommended correction:** Add to §9: "The Outbox Dispatcher is a separate NestJS application (not a module within this API)."

**Blocks architecture approval: No**

**Invented items: NONE**

**Verdict: PASS**

---

## Additional findings

### FINDING-A: Two envelope contract styles exist

Contract analysis reveals two envelope styles:
1. **Full outbox envelope** with `aggregate_type`, `event_type`, `payload`, `occurred_at` — used by 10 events
2. **Flat envelope** with only `schema_version`, `event_id`, `aggregate_id`, `trace_id` — used by 3 events (`resume-parse-requested`, `job-ai-enrichment-requested`, `candidate-profile-changed`) and all 7 tasks

Two events (`job-enriched`, `candidate-projection-rebuilt`) have the full envelope structure but omit `event_id` and `occurred_at` from required fields.

**Severity: MINOR** — This is a contract inconsistency, not an architecture gap. Gate G-1 (DEC-06-03) explicitly requires envelope reconciliation before producer implementation.

**Impact:** Low. Gate G-1 covers this.

**Blocks architecture approval: No**

### FINDING-B: FastAPI direct DB writes for outbox events

FastAPI worker handlers insert directly into `outbox_events` for chained events (e.g., `resume.parse.requested` after security scan clean, `candidate.resume.parsed` after parsing). This is architecturally correct — FastAPI uses the trusted server role and approved functions. But the architecture (§9) does not explicitly state that FastAPI may insert outbox events.

**Severity: MINOR** — The pattern is correct; the documentation is incomplete.

**Impact:** Low.

**Recommended correction:** Add to §9: "FastAPI worker result transactions may insert approved outbox events for downstream chained processing, subject to Gate G-1 envelope reconciliation."

**Blocks architecture approval: No**

### FINDING-C: `NOTIFICATION_QUEUE` constant defined but unused

The dispatcher defines `NOTIFICATION_QUEUE` as a constant but has no routes using it. This is provision-only and not an invented route. No issue.

**Severity: N/A**

**Blocks architecture approval: No**

---

## ISSUE LOG

| Issue ID | Severity | Section | Finding | Blocks freeze |
|---|---|---|---|---|
| ARCH-01 | MINOR | §3 | No explicit NestJS @Module import prohibition between domain modules | No |
| ARCH-02 | MINOR | §8 | WebSocket reconnect recovery via message cursor not explicitly stated in architecture description | No |
| ARCH-03 | MINOR | §6 | Deterministic row locking order not specified (deferred to Phase 08) | No |
| ARCH-04 | MINOR | §9 | Worker output → outbox chain mechanism not described | No |
| ARCH-05 | MINOR | §11 | Shared response envelope not represented in folder structure | No |
| ARCH-06 | MINOR | §12 | Phase 04 §12 test exit criteria not cross-referenced | No |
| ARCH-07 | MINOR | §13 | 5 Phase 05 §9 open items not listed in §13 | No |
| ARCH-08 | MINOR | §9 | Outbox Dispatcher separation as separate NestJS application not structurally explicit | No |
| ARCH-09 | MINOR | Contracts | Two envelope contract styles exist; Gate G-1 covers this | No |

**0 BLOCKERs, 9 MINORs**

---

## FINAL VERDICT

### **PASS — ARCHITECTURE APPROVED**

The Phase 07 architecture document is comprehensive, evidence-grounded and correctly derived from all frozen decisions, the SQL baseline, contracts, dispatcher registry and FastAPI worker.

**All 14 verification points satisfied:**

1. **Bounded contexts**: 15 modules correctly map to all SQL tables and requirement IDs. No gaps. ✓
2. **Module dependency direction**: Correct layered architecture (adapters → application → domain → infrastructure). Minor: no explicit @Module import rule. ✓
3. **UserContextClient/SystemClient**: Exactly matches Decision-01 and 17_rls.sql grants/RLS policies. ✓
4. **REST/SSE/WebSocket split**: Exactly matches Decision-02. Minor: WebSocket reconnect recovery description incomplete. ✓
5. **Resume/guest/snapshot/canonical boundaries**: All correctly described; cross-domain writes mediated by approved contracts. ✓
6. **Transaction + history + outbox atomic**: Correctly specified; deterministic locking principle stated but order deferred. ✓
7. **External calls outside transaction**: All verified — no external calls inside open DB transactions. ✓
8. **application.submitted + 7 routes**: All correctly documented; fail-closed for unrouted events. ✓
9. **No responsibility duplication**: NestJS, Dispatcher and FastAPI have clean, non-overlapping responsibilities. ✓
10. **Security/secrets/PII/tenant/idempotency**: All covered with correct patterns. ✓
11. **Folder/module structure**: Scalable, follows standard NestJS patterns. ✓
12. **Acceptance tests**: 8 tests cover key scenarios; Phase 04 §12 has comprehensive suite. ✓
13. **Open decisions**: All correctly tracked; 5 additional Phase 05 items not listed but tracked elsewhere. ✓
14. **No inventions**: Zero invented tables, fields, events, routes, roles or providers. ✓

**9 MINOR findings** — all correctly deferred to Phase 08 implementation or covered by existing Gate G-01. None block architecture approval or coding authorization.

**Architecture is approved for Phase 08 implementation planning.**
