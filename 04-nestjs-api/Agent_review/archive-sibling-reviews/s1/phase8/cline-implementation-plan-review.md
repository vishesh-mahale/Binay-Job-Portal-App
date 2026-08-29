# Phase 08 Implementation Plan — Independent Review Report

- **Agent:** Cline (independent reviewer — NestJS / PostgreSQL / security / distributed-systems planning)
- **Date:** 2026-08-26
- **Audit target:** `04-nestjs-api/PHASE-08-IMPLEMENTATION-PLAN.md`
- **Review mode:** Review only. No code, SQL, contract or plan was modified. No new route/table/event/field/provider invented.
- **Prior-agent claims:** Antigravity's existing `s1/phase8/antigravity-implementation-plan-review.md` claims `PASS — zero issues`. That claim was **not relied upon**; every point below was independently verified against primary sources. This report contradicts the "zero blocker/high/medium issues" claim with reproducible evidence.

---

## 1. Executive Verdict

```text
CONDITIONAL PASS
```

The plan's architecture direction, module ordering, boundary preservation and fail-closed event discipline are **correct and consistent** with Phase 05/06/07, Decisions 01–06, baseline SQL 01–18, contracts and the dispatcher/FastAPI components. However, the plan **omits two assignments that Phase 07 explicitly delegated to it and that the plan's own §14 exit criteria require**: (a) the deterministic multi-entity row-lock order matrix, and (b) the client idempotency-key persistence mechanism/owner. Per the plan's own standard these must be assigned before the plan is considered ready. Both are fixable inside the Phase 08 document without reopening higher-phase decisions; neither requires inventing business behavior.

Conditions to upgrade to `PASS — IMPLEMENTATION PLAN APPROVED`: close P8-R1 and P8-R2 in `PHASE-08-IMPLEMENTATION-PLAN.md`, and record the P8-R3 reconciliation gate with an owner.

---

## 2. Sources inspected

| Source | Result |
|---|---|
| `AGENTS.md` | Read. No-invent / conflict-reporting / forward-migration rules used as evaluation baseline |
| `PHASE-05-FINAL-REQUIREMENTS.md` | Read incl. §9A seven-route registry, DB-write ownership boundary, blockers list |
| `PHASE-06-API-CATALOG.md` | Read fully (862 lines); all API entries inventoried |
| `PHASE-07-ARCHITECTURE.md` | Read fully incl. §6 lock-order delegation and §13 open items |
| `DECISION-01..06` | All six read fully |
| `PHASE-04-STATE-MACHINES-AND-TRANSACTIONS.md` | Read fully |
| `PHASE-03-GAP-CONFLICT-ANALYSIS.md` | Read fully (GAP-001..015) |
| Baseline SQL `01–18` (`02-database/migrations/baseline/`) | Table/function inventory extracted; key objects opened (`09_applications.sql`, `15_infrastructure.sql`) |
| `contracts/events/*`, `contracts/tasks/*`, `contracts/*.md` | All event/task schema files enumerated; `application-submitted.v1.json`, `candidate-profile-changed.v1.json`, `AGGREGATE-ID-SEMANTICS.md`, `G1-ENVELOPE-ALIGNMENT.md` opened |
| `05-outbox-dispatcher-nestjs/` | Registry source, README G-5 policy, `IMPLEMENTATION-PENDING.md` release-gate checklist read |
| `07-fastapi-ai-worker/` | README responsibilities/dual-idempotency/leases reviewed |

---

## 3. Twelve-point verification results

| # | Prompt criterion | Result | Notes |
|---|---|---|---|
| 1 | Every Phase 06 API/use case maps to a Phase 08 work item and tests | PASS (minor) | All 30 catalog entries map into 08-A..08-G (see §4). Guest routes covered via API-APPLICATION-003 + 08-D; cleanup sweeper stays external. Test-name parity gaps → P8-R6 |
| 2 | Dependency order has no missing prerequisite / circular ownership | PASS (minor) | Order Foundation→Identity→Companies→Candidates/Documents→Jobs/Search→Applications/Guest/Saved→Referrals/Interviews→Notifications/Realtime→AI producers/admin→Gates is acyclic; search precedes saved-candidate search; applications precede referral attribution. AI-producer layering nuance → P8-R7 |
| 3 | Named SQL tables/functions/events/contracts really exist | PASS | Verified programmatically: `saved_candidates` (09_applications.sql L228–238, UNIQUE(recruiter_user_id,candidate_id)), `change_application_status()`, `enforce_guest_claim_transition()` etc., `outbox_events`/`processed_events`/`event_processing_leases` (15_infrastructure.sql), all files named in the plan exist; 7-route registry confirmed in `event-route.registry.ts`; `application-submitted.v1.json` confirmed |
| 4 | UserContextClient/SystemClient, RLS, guards, trusted credentials separation | PASS | §1 + 08-A match Decision-01 mandatory client-boundary rule incl. negative tests; OD-1 correctly left out |
| 5 | Transaction, audit/history, outbox, idempotency, lock-order rules implementable | FAIL (partial) | Transaction/outbox/audit template faithful to Phase 04 §2; **lock order only hooked, never assigned → P8-R1; idempotency persistence unassigned → P8-R2** |
| 6 | Resume / guest / snapshot / canonical / saved-candidate boundaries preserved | PASS | 08-C use cases 1–7 mirror Decision-05 invariant, guest XOR/expiry/revocation, application-only-resume never promotes; 08-D saved-candidate uniqueness matches Decision-04 and baseline constraint |
| 7 | Dispatcher/FastAPI responsibilities not duplicated | PASS | 08-G keeps execution, leases, idempotency and result writes outside NestJS; matches FastAPI dual-guard model |
| 8 | SSE/WS/recovery, notification and chat tests complete | PASS (minor) | Core Decision-02 acceptances mirrored; two acceptances unnamed → P8-R6 |
| 9 | Failure/concurrency/retry/dead-letter/1000-event/deployment tests realistic | PASS | Mirrors real dispatcher gates (SKIP LOCKED, stale lease, Cloud Tasks DLQ, P2-4 1000-event burst) and dispatcher pending release-gate culture |
| 10 | G-1, GAP-003..015, provider gaps, TBD paths owned/gated | FAIL (partial) | G-1 gated pre-producer ✓; subscription/email/template properly blocked ✓; but gap-by-gap owner enumeration absent → P8-R5; G-5 conflict unreconciled → P8-R3 |
| 11 | Rollback/migration/secrets/observability/CI-CD safe and actionable | PASS | Forward-only migrations per AGENTS.md, feature flags, runbooks exist (`RUNBOOK-DEAD-LETTER.md`), Secret Manager bindings cover dispatcher P0-2 pending item |
| 12 | No invented detail where source is TBD | PASS (minor) | Checked suspicious items — all grounded: "OAuth callback replay" ← REQ-AUTH-006 (PHASE-01 L55); STALE_REVISION ← Decision-06; guest limits ← REQ-APPLICATION-003..005; no invented route/queue/code found. One scope over-inclusion → P8-R4 |

---

## 4. Phase 06 → Phase 08 mapping (criterion 1 evidence)

| Phase 06 entries | Phase 08 package |
|---|---|
| API-PLATFORM-001 | 08-A (REQ-PLATFORM-001..008, REQ-API-001..007) |
| API-AUTH-001..003, API-ONBOARDING-001, API-COMPANY-001..003 | 08-B |
| API-RESUME-001..004, API-CANDIDATE-001..003, guest session/upload/status/claim (§3), API-APPLICATION-003 | 08-C |
| API-JOB-001, API-SEARCH-001..002, API-APPLICATION-001..002, API-SAVED-CANDIDATE-001 | 08-D |
| API-REFERRAL-001..003, API-INTERVIEW-001 | 08-E |
| API-NOTIFY-001..003, API-MESSAGE-001, API-REALTIME-001 | 08-F |
| API-AI-001, API-ANALYTICS-001, API-FEEDBACK-001, API-SUBSCRIPTION-001 | 08-G |

Internal commands table (Phase 06 §4) is also represented (create+outbox per command family, status function, confirm flow, SSE recovery, cleanup phased). `SUBSCRIPTION-001` correctly NOT implementation-authorised; email/template work deferred without fake consumers.

---

## 5. Findings

### P8-R1 — Deterministic row-lock order never assigned (HIGH)

- **Exact section:** Target plan §1 (rule), §3 (08-A “Transaction helper with deterministic lock-order hooks”), §6 tests, §12 tests, §14 exit-criterion 3.
- **Evidence:** `PHASE-07-ARCHITECTURE.md` §6: “The exact deterministic row-lock order for each multi-entity command is defined in the Phase 08 implementation plan; implementation must not choose ad-hoc lock order.” Target §14 exit-criterion 3 requires “Lock order … assigned”. A full read of the 274-line plan shows **no lock-order matrix/table anywhere** — only the word “hooks”.
- **Impact:** Implementers would be forced to choose per-command ad-hoc orders, directly violating target §1 (“deterministic row-lock order अनिवार्य”) and Phase 07 §6, reintroducing deadlock risk exactly where Phase 04 §11 and Phase 07 acceptance test 9 demand determinism. The plan’s own exit criteria are unmet by the plan itself.
- **Correction:** Add an explicit lock-order assignment covering every multi-entity command family (company/member ops; job create/update lifecycle; registered apply [job→snapshot→application→history→outbox]; guest apply [session consume→document origin→application→snapshot→claim]; confirm parsed facts [document→parsed data→profile revision→facts→history→outbox]; saved-candidate writes; messaging send [conversation→participants→message]). State the single global ascending-UUID/timestamp tie-break policy and which commands are single-row/trusted-SQL-function exempt.
- **Blocks implementation readiness:** YES — as written (fixable in-document).

### P8-R2 — Client idempotency-key persistence mechanism unassigned (HIGH)

- **Exact section:** Target §3 (08-A lists `src/common/idempotency/` but no design), §5/§6/§8 tests that depend on it, §14 exit-criterion 3.
- **Evidence:** `PHASE-05-FINAL-REQUIREMENTS.md` §9 blocker 2: “Idempotency key retention and persistence mechanism.” `PHASE-07-ARCHITECTURE.md` §13 open item: “Message idempotency persistence mechanism.” Baseline grep confirms **no generic client-idempotency store exists** in SQL 01–18 — only domain-specific unique keys (`resume_parsing_jobs.idempotency_key`, `referral_batches.idempotency_key`, `notifications.idempotency_key`, `analytics_events.idempotency_key`) plus worker-side `processed_events`. Any new replay-store table is a schema addition requiring an approved forward decision (Phase 07 §1: no new table without approved forward decision; AGENTS.md forbids silent invention).
- **Impact:** Named tests (concurrent confirmation “one revision/event”, guest retry/XOR safety, WS duplicate-message idempotency) cannot be implemented safely; implementers must either invent persistence (policy violation) or ship unsafe replays. Exit criterion 3 again unmet by the plan itself.
- **Correction:** Assign the mechanism and owner gate in Phase 08 before coding: either (a) record the required forward-migration decision for a dedicated idempotency/request-dedupe store with retention policy, or (b) explicitly freeze scope-wise reuse of existing domain keys + DB uniqueness with a documented mapping of which catalogued commands rely on what, noting residual risk for commands lacking a server-side key column (messaging). Include retention/TTL and conflict-response mapping to Decision-06 (`IDEMPOTENCY_CONFLICT`).
- **Blocks implementation readiness:** YES — as written (fixable in-document).

### P8-R3 — G-5 producer-discipline vs sanctioned unrouted `application.submitted` not reconciled (MEDIUM)

- **Exact section:** Target §1 (“Unknown/unrouted events fail-closed”), §10 bullets 3 & 5.
- **Evidence:** Decision-03 / GAP-012 / Phase 05 §9A / Phase 06 §6 approve emitting `application.submitted` atomically with **no dispatcher route** until notification routing is decided. Dispatcher side enforces fail-closed claiming: `README.md` §6 — unknown types go to `mark_outbox_event_failed` with `unknown_route:<type>`; `15_infrastructure.sql` carries `retry_count / max_retries / dead_lettered_at`; dispatcher `IMPLEMENTATION-PLAN.md` G-5 goes further (producer emits no event without consumer contract) and `IMPLEMENTATION-PENDING.md` still shows `[ ] G-5 producer unroutable-event discipline verified`. The current schema has no destination column, so every pre-route application submit will cycle failed→retry and ultimately dead_letter on a normal production action.
- **Impact:** Operators cannot distinguish expected-unrouted from genuine failures; failure metrics/DLQ alerts get polluted from day one of application flows; the G-5 gate remains formally unpassed while the plan relies on the D03 exception.
- **Correction:** In §10 assign an owner + gate that records the reconciliation: classification of `application.submitted` rows as expected-unrouted until GAP-012 closes (monitoring filter/annotation strategy agreed with dispatcher owners), no-replay requirement for historical rows via the §13 runbook (“fresh causation-linked events”), and disposition choice when the notification route lands (replay vs ignore).
- **Blocks implementation readiness:** NO (application-flow deployment gate, not plan-blocking).

### P8-R4 — `REQ-SEARCH-001..005` over-includes a FUTURE requirement (MINOR)

- **Exact section:** Target §6 Scope line.
- **Evidence:** `PHASE-01-REQUIREMENTS-CONSOLIDATION.md` L103 and `PHASE-02-REQUIREMENTS-TRACEABILITY-MATRIX.md` L107/L194 mark REQ-SEARCH-005 (external search provider adoption) as `NEEDS_DECISION/FUTURE`; `PHASE-06-API-CATALOG.md` §5: “REQ-SEARCH-005 is FUTURE”. Target cites `REQ-SEARCH-001..005` with no exclusion note.
- **Impact:** Cosmetic scope drift; an implementer could read GAP-010 provider work into current build although no provider APIs are allowed yet.
- **Correction:** Replace with `REQ-SEARCH-001..004 (current); REQ-SEARCH-005 FUTURE — GAP-010 owner`.
- **Blocks:** NO.

### P8-R5 — GAP-003..015 owner/acceptance/gate promised, not enumerated (MINOR)

- **Exact section:** Target §9 (last bullet) and §14 exit-criterion 4.
- **Evidence:** “Every Phase 03 gap receives owner, acceptance test and implementation gate” is asserted in one sentence; there is no per-gap table. Major gaps are materially handled inline (GAP-015 → email deferred without fake consumer; GAP-008 → subscriptions blocked; cleanup event → phased auditable; G-1 → pre-producer gate), but GAP-003 thresholds (including the named 1000-event burst success threshold), GAP-004/009/010/014 have no owner/phase/gate listing.
- **Impact:** Exit-criterion 4 is demonstrated rhetorically rather than structurally; downstream phases inherit ambiguity about who closes what.
- **Correction:** Add a compact table: GAP-ID → owner phase/person → acceptance artefact → gate placement within 08-A..08-G.
- **Blocks:** NO (included among pass conditions).

### P8-R6 — Realtime/chat test list misses two Decision-02 acceptances (MINOR)

- **Exact section:** Target §8 Tests list.
- **Evidence:** Decision-02 §9 defines eight acceptance tests. Target covers auth-at-connect (#1), tenant isolation (#2), non-participant join (#3), rollback-no-realtime (#4), reconnect recovery (#5) and partial duplicate-safety (#6). Missing explicitly-named tests: **(a)** “Realtime outage does not break REST business operations” (#7); **(b)** ordered full gap recovery for chat — Decision-02 #8 requires all missed durable messages **in order**, stricter than the plan’s cursor-recovery wording. In-app notification list/unread/ack also lacks a named test beyond generic tenant isolation.
- **Impact:** Acceptance coverage of the approved transport decision is weaker than its source; risks silent scope reduction at test-authoring time.
- **Correction:** Extend §8 tests with the three named cases.
- **Blocks:** NO.

### P8-R7 — AI-producer layering vs interview-driven `interview.summary.requested` (INFO/MINOR)

- **Exact section:** Target §2 dependency order; §7; §9.
- **Evidence:** Seven-route registry includes `interview.summary.requested`; 08-E builds Interviews **before** 08-G “AI command producers”. Outbox insertion infrastructure arrives in 08-A, so nothing is technically impossible; but the owning emitter for `interview.summary.requested` (generic API-AI-001 command vs interview-complete command) is stated nowhere — Phase 06 leaves AI-001 path `TBD`.
- **Impact:** Risk of a second producer pattern emerging ad-hoc in 08-E before 08-G fixes producer conventions.
- **Correction:** One clarifying sentence in §7/§9 mapping each registered request event to its emitting use case (`security.scan.requested` — upload; `resume.parse.requested` — scan-clean transition; `candidate.profile.changed` — confirm; `match.analyze.requested` — apply/matching trigger; `job.ai.enrichment.requested`, `job.screening_questions.requested` — job lifecycle points; `interview.summary.requested` — interview completion).
- **Blocks:** NO.

---

## 6. Positive verifications (explicitly checked, found correct)

1. **SQL objects named in the plan all exist** — `03_users_auth.sql`, `04_companies.sql`, `06_documents.sql`, `07_resume_processing.sql`, `08_candidates.sql`, `09_applications.sql`, `17_rls.sql`.
2. **Decision-04 model already executable** — `saved_candidates` with `UNIQUE (recruiter_user_id, candidate_id)` present in baseline `09_applications.sql` L228–238.
3. **Application status path honest** — transitions only through approved function/command; `change_application_status()` exists and ad-hoc UPDATEs blocked by `enforce_application_status_update_path()`.
4. **Seven-route registry claim accurate** — verified directly in `src/routing/event-route.registry.ts` (7 input routes; output events excluded per P1-1 correction).
5. **Referral policy faithful** — “Any eligible active authenticated user (no invented HR-only gate)” matches baseline comment (“authenticated-user capability … intentionally not tied to a user role”).
6. **OAuth reference grounded** — REQ-AUTH-006 (PHASE-01 L55); not invented.
7. **Fail-closed event posture consistent** — dispatcher `resolve()` returns undefined → caller must fail closed; plan §1/§10 mirror this exactly.
8. **Load/failure gates realistic** — 1000-event burst mirrors dispatcher pending gate P2-4; dead-letter runbook exists; dispatcher P0-2 secrets pending reflected via plan §11 Secret Manager gate.
9. **Error vocabulary aligned** — STALE_REVISION etc. per Decision-06; CONFLICT/EXPIRED/CURSOR_INVALID not introduced publicly anywhere in the plan.
10. **Boundaries carried into both use cases AND tests** — first-resume-active invariant (D05), guest XOR/expiry/revocation, snapshot immutability, canonical-promotion-only-via-confirm, saved-candidate privacy/uniqueness.

---

## 7. Final Verdict

```text
VERDICT: CONDITIONAL PASS

PASS CONDITIONS (all within Phase 08 document edit scope):
  1. P8-R1 — Add the deterministic lock-order assignment matrix
     (Phase 07 §6 delegation + self exit-criterion 3).
  2. P8-R2 — Assign the client idempotency-key persistence mechanism
     + owner/forward-migration gate.
  3. P8-R3 — Record G-5 ⇔ unrouted `application.submitted`
     reconciliation owner/gate (operator-facing disposition).

RECOMMENDED (non-blocking):
  P8-R4 scope footnote; P8-R5 GAP-owner enumeration;
  P8-R6 test-parity additions; P8-R7 producer-emitter mapping note.

NESTJS CODING AUTHORIZED: NO
(unchanged; pending conditions above and existing upstream open gates,
including dispatcher G-1(b)/G-5/P0-2 release-gate items that Phase 09
must not shortcut.)
```

No tests were executed and no claims of executed tests are made here — this is a documentation/architecture-plan audit performed by static inspection of the cited sources.



