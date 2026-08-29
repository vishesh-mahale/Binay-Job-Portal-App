# Phase 03 — Gap and Conflict Analysis

**Status:** Draft — decisions required; coding and final requirements freeze blocked until material items are resolved.

**Inputs:**

- `PHASE-01-REQUIREMENTS-CONSOLIDATION.md`
- `PHASE-02-REQUIREMENTS-TRACEABILITY-MATRIX.md`
- `PRODUCT-REQUIREMENTS.md`
- approved product decisions `PD-001` to `PD-004`
- executable SQL baseline 01–18
- `contracts/`
- `NESTJS-IMPLEMENTATION-GUIDE.md`

## 1. Classification

| Classification | Meaning |
|---|---|
| `GAP` | Requirement/behavior hai, lekin DB/API/contract/operational support missing ya verify nahi |
| `CONFLICT` | Do authoritative/current sources materially different behavior bolte hain |
| `NEEDS_CLARIFICATION` | Business/technical decision intentionally open hai |
| `EXPECTED PHASED GAP` | Valid event/feature known hai, current component phase mein deliberately implement nahi; fail-closed owner phase documented hai |
| `NO CONFLICT` | Sources consistent; normal design/implementation work baaki |

Agent kisi `GAP` ko apni taraf se silently invent karke close nahi karega.

## 2. Decision summary

| ID | Type | Priority | Related requirements | Current status |
|---|---|---:|---|---|
| GAP-001 | `NO CONFLICT` | High | REQ-AUTH-005 | Resolved by approved Decision-01: corrected controlled hybrid |
| GAP-002 | `NO CONFLICT` | High | REQ-AUTH-007, REQ-REALTIME-001 | Resolved by approved Decision-02 |
| GAP-003 | `NEEDS_CLARIFICATION` | High | REQ-PLATFORM-007 | Open |
| GAP-004 | `NEEDS_CLARIFICATION` | Medium | REQ-RESUME-007 | Open |
| GAP-005 | `GAP` | High | REQ-REFERRAL-007 | Open |
| GAP-006 | `GAP` | High | REQ-NOTIFY-003 | Open |
| GAP-007 | `NO CONFLICT` | High | REQ-SAVED-CANDIDATE-001 | Resolved by approved Decision-04; implementation remains |
| GAP-008 | `GAP` | Medium | REQ-SUBSCRIPTION-001 | Open |
| GAP-009 | `NEEDS_CLARIFICATION` | Medium | REQ-AI-004 | Open |
| GAP-010 | `NEEDS_CLARIFICATION` | Medium | REQ-SEARCH-005 | Open |
| GAP-011 | `NO CONFLICT` | High | REQ-REALTIME-001, REQ-RESUME-006 | Resolved by approved Decision-02; exact paths remain API catalog |
| GAP-012 | `EXPECTED PHASED GAP` | High | REQ-APPLICATION-001 | Contract resolved; notification route phased |
| GAP-013 | `EXPECTED PHASED GAP` | Medium | Valid event contracts without current dispatcher route | Phase-owned |
| GAP-014 | `NEEDS_CLARIFICATION` | Medium | REQ-PLATFORM-008 | Open |
| GAP-015 | `EXPECTED PHASED GAP` | Medium | REQ-NOTIFY-002, REQ-NOTIFY-003 | Owner phase required |

## 3. Detailed gap analysis

### GAP-001 — Supabase database access model

**Evidence:** `PRODUCT-REQUIREMENTS.md` §3, `17_rls.sql`, `NESTJS-IMPLEMENTATION-GUIDE.md` §§3,17, planning document §11.

**Resolved decision:** Corrected controlled hybrid: approved personal/catalog reads may use UserContextClient + existing RLS; business reads/writes and all system workflows use NestJS/SystemClient trusted server access. Browser never receives trusted credentials.

**Options:**

1. Per-user JWT/database session: RLS primary enforcement; user context DB tak propagate.
2. Trusted backend role/service role: API guards, ownership checks, approved DB functions and audit controls primary.
3. Hybrid: user-facing reads/writes user context se, controlled system workflows trusted role se.

**Recommendation:** Hybrid only if every path ka ownership/credential boundary documented ho; otherwise one primary model choose karo. Browser ko service-role kabhi nahi.

**Decision required:** None - approved in `DECISION-01-NESTJS-SUPABASE-ACCESS-MODEL-HINGLISH.md`.

**Blocks:** None. Adapter separation, authorization tests and OD-1 future hardening remain implementation requirements.

### GAP-002 — Realtime transport

**Evidence:** Product §15, `PD-002`, guide §§9,15, plan §10.

**Resolved decision:** SSE for one-way status/notification updates, WebSocket for chat, REST as authoritative recovery, Supabase Realtime not primary.

**Required rules:** Authentication, tenant filtering, reconnect, backpressure, event naming, fallback status endpoint and test strategy.

**Recommendation:** One primary transport plus authoritative status/read endpoint; exact choice ADR mein freeze ho.

**Decision required:** None for transport policy; exact endpoint/DTO design belongs to API catalog.

### GAP-003 — SLO, performance and load thresholds

**Evidence:** `NON-FUNCTIONAL-REQUIREMENTS.md` §§1–3; raw requirement high-volume resume statement.

**Missing values:** API latency percentiles, upload limits, parsing completion target, queue delay, concurrency, 1000-event burst success threshold.

**Recommendation:** Dev/pre-prod targets aur production targets separately define karo; normal API latency ko deep AI latency se separate measure karo.

**Decision required:** Product/operations.

### GAP-004 — Fast-track name extraction

**Evidence:** `PRODUCT-REQUIREMENTS.md` §8, `REQUIREMENT.txt` §6, guide §9.

**Conflict status:** Actual contradiction nahi; source explicitly `NEEDS_DECISION` hai.

**Options:**

1. Only asynchronous deep parsing.
2. Lightweight synchronous/local extraction, followed by async deep parsing.

**Recommendation:** Option 1 current architecture ke saath default; fast-track tabhi add ho jab UX/latency benefit measured aur contract defined ho.

**Decision required:** Product/UX owner.

### GAP-005 — Configurable referral programs and rewards

**Evidence:** Product §14, `09_applications.sql`, manual referral requirement.

**Missing:** Company/job/campaign rule model, eligibility policy, reward type metadata, authorization, APIs, UI and tests.

**Recommendation:** Existing invitation/reward operational records ko preserve karke separate program/rule design banao; financial state transitions immutable/audited rahen.

**Decision required:** Product + database/API design.

### GAP-006 — Admin email-template management

**Evidence:** Product §15, `12_notifications.sql`, guide §15.

**Missing:** Template CRUD API, approved variable registry, safe rendering, preview, versioning, activation, rollback and permissions.

**Recommendation:** Versioned template rows; raw arbitrary HTML/script execution nahi; render tests mandatory.

**Decision required:** Product/security/API design.

### GAP-007 — Recruiter saved candidates

**Evidence:** Product §15A, `09_applications.sql` explanation, Phase 1/2 `REQ-SAVED-CANDIDATE-001`.

**Resolved policy:** Private, non-job-specific bookmark owned by the HR/recruiter who saved it. Same recruiter + candidate is unique; another HR may save the same candidate independently. Existing `saved_jobs` is not equivalent. Remaining work is the SQL model, APIs, UI, indexes and tests.

**Recommendation:** Add the approved model to `09_applications.sql` for a clean dev/pre-prod reset, or use a forward migration when the database is not reset.

**Decision required:** None for policy; exact API paths/DTOs remain API-catalog work.

### GAP-008 — Subscription/payment provider

**Evidence:** Product §16, `14_subscriptions.sql`.

**Missing:** Provider, webhook contract, payment status mapping, retry/reconciliation, refund/cancellation and compliance requirements.

**Recommendation:** Keep schema foundation but do not expose provider-dependent production behavior until provider ADR/contract approved.

**Decision required:** Product/finance.

### GAP-009 — AI provider/model and cost policy

**Evidence:** Product §17, AI research docs, worker provider adapters.

**Missing:** Approved provider/model, embedding dimension compatibility, fallback policy, budget/rate limits, data handling and model version policy.

**Recommendation:** Provider adapter + versioned output contract; same embedding model/provider for comparable vectors; no provider name in business API contract.

**Decision required:** Architecture/product/operations.

### GAP-010 — External search engine adoption

**Evidence:** `SEARCH-STRATEGY.md`, `05_jobs` search docs.

**Current baseline:** PostgreSQL FTS + pgvector hybrid search.

**Missing decision:** Whether/when Meilisearch or another external provider is justified by measured query volume/latency.

**Recommendation:** Keep PostgreSQL baseline; external provider only after evidence and ADR. No speculative NestJS dependency.

**Decision required:** Architecture/operations.

### GAP-011 — Realtime status/reconnect contract

**Evidence:** `PD-002`, guide §§9,15, product §15.

**Resolved policy:** Reconnect with authenticated backoff, REST authoritative refetch, durable chat cursor recovery, and event/version deduplication. Exact endpoint/resource/DTO names remain API catalog work.

**Recommendation:** Define authoritative read endpoint independent of transport; realtime is an optimization, not source of truth.

**Decision required:** None for policy; API catalog must specify concrete paths and DTOs.

### GAP-012 — `application.submitted` shared event contract

**Evidence:** Guide §§11–12 mention `application.submitted`; `contracts/events/application-submitted.v1.json` now defines the versioned envelope.

**Classification:** Contract gap resolved. Dispatcher/notification routing remains an `EXPECTED PHASED GAP`.

**Required action:** NestJS emits the approved v1 domain event atomically with registered/guest application rows and snapshot. Do not route it to `match.analyze.requested`; matching remains a separate event. Notification route/consumer is added only after its queue, endpoint and task contract are approved. Event payload must remain PII-minimized; consumers fetch sensitive contact data through authorized server-side access.

**Decision required:** None for the domain contract; notification route remains owned by the notification/dispatcher phase.

### GAP-013 — Dispatcher phased routing

**Evidence:** `05-outbox-dispatcher-nestjs` route registry, `IMPLEMENTATION-PENDING.md`, contracts/events.

**Rule:** Valid event contract without current dispatcher route is an `EXPECTED PHASED GAP`.

**Required record for every such event:** contract name, owning future phase, queue owner, fail-closed behavior and no guessed routing.

**Current registry evidence (source-verified 2026-08-26):** The dispatcher currently registers seven input routes: `resume.parse.requested`, `candidate.profile.changed`, `job.ai.enrichment.requested`, `match.analyze.requested`, `interview.summary.requested`, `job.screening_questions.requested`, and `security.scan.requested`. `candidate.projection.rebuilt` is emitted by FastAPI after projection and is intentionally output-only, so it is not registered as a dispatcher input. Any older eight-route statement is superseded.

**Actual phased gap:** The remaining contract event files such as `job.enriched`, `application-match-analyzed`, `job-screening-questions-generated`, and `interview-summary-generated` are worker/output events, not automatically dispatcher input routes. They must not be added to the dispatcher registry unless a producer/queue contract explicitly requires it. Any future producer event that has a valid contract but no registry entry must be recorded here with owner phase and fail-closed behavior.

### GAP-014 — Accessibility acceptance detail

**Evidence:** `NON-FUNCTIONAL-REQUIREMENTS.md` §9; `REQ-PLATFORM-008`.

**Missing:** Exact WCAG target, keyboard/screen-reader test tooling and acceptance threshold.

**Recommendation:** Product/UX decision on target level and automated/manual test set; NestJS must return stable validation/error semantics for accessible UI handling.

### GAP-015 — Notification email dispatcher route

**Evidence:** `05-outbox-dispatcher-nestjs/src/routing/event-route.registry.ts` explicitly documents `notification.email.requested` as not registered and unresolved under Gate G-1/G-5; `12_notifications.sql` and notification requirements describe email delivery behavior.

**Classification:** `EXPECTED PHASED GAP`, not a missing architecture decision. The notification email producer/adapter may be a later phase, but the current dispatcher must fail closed for this event and must not guess a queue, endpoint, or task contract.

**Required record:** owner = notification/dispatcher routing phase; queue, worker endpoint, task contract, retry policy and authorization must be approved before registration. Until then, an attempted event is rejected/observed as unroutable according to the dispatcher failure policy.

## 4. Conflict analysis

| Conflict ID | Sources | Finding | Resolution |
|---|---|---|---|
| CONFLICT-001 | Raw requirement fast-track suggestion vs current product `NEEDS_DECISION` | Not a contradiction; current decision is intentionally open | Keep `NEEDS_CLARIFICATION`; do not implement guessed fast-track |
| CONFLICT-002 | Guide mention versus previously missing contract | Contract v1 now resolves the gap; routing remains phased | `application.submitted` contract approved; no guessed dispatcher route |
| CONFLICT-003 | Categorized page list vs current curated product scope | Page inventory includes future/estimated pages; product doc marks scope | Product requirements/PDs win; page list is navigation/roadmap input |
| CONFLICT-004 | Old `Binay-App` schema/examples vs executable baseline | Old names are reference only | Baseline 01–18 and contracts win |
| CONFLICT-005 | Supabase webhook fallback docs vs deployed operational behavior | Fallback prerequisite is not business schema | Native webhook + documented operational setup; verify deployment separately |

No other material conflict is currently proven from the inspected sources. Missing details are recorded as gaps rather than fabricated conflicts.

## 5. Decisions needed before final requirements freeze

### Blocking decisions

1. Supabase database access model: resolved by approved Decision-01; no longer blocking.
2. Realtime transport and reconnect contract: resolved by approved Decision-02; exact API catalog details remain.
3. Application submitted event contract: resolved by approved Decision-03; notification route remains phased.
4. Saved candidates policy: resolved by approved Decision-04; SQL/API implementation remains.
5. Referral configuration/reward scope (`GAP-005`) if it remains current scope.

### Important but can be phased

6. Performance/SLO thresholds (`GAP-003`).
7. Email template management (`GAP-006`).
8. AI provider/model policy (`GAP-009`).
9. Payment provider (`GAP-008`).
10. External search engine (`GAP-010`).
11. Accessibility target (`GAP-014`).
12. Notification email route/contract owner phase (`GAP-015`).

## 6. Exit criteria for Phase 3

Phase 3 complete tab maana jayega jab:

- every Phase 2 gap has owner, type, impact and next action;
- actual conflicts aur missing decisions separate hain;
- no invented event, table, route or API remains;
- phased dispatcher gaps fail-closed documented hain;
- blocking decisions user/product owner ke saamne clearly listed hain;
- resolved decisions Phase 5 final requirements aur relevant ADR/contract mein reflected hain.

**Current status:** `ANALYSIS COMPLETE — HUMAN DECISIONS REQUIRED`

**Next phase after decisions:** `PHASE-04-STATE-MACHINES-AND-TRANSACTIONS.md`
