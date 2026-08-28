# Phase 08 Implementation Plan — Final Revalidation Report

- **Agent:** Cline (independent reviewer — NestJS / PostgreSQL / security / distributed-systems planning)
- **Date:** 2026-08-26
- **Audit target:** `04-nestjs-api/PHASE-08-IMPLEMENTATION-PLAN.md` (latest revision, after first-round review `cline-implementation-plan-review.md` which returned CONDITIONAL PASS with P8-R1..R7)
- **Review mode:** Revalidation only. No code, SQL, contract or plan modified. No route/table/event/field/provider invented.
- **Test-execution honesty:** No tests were executed in this task; no executed-test claim is made anywhere below. All verdicts are static-inspection cross-checks against primary sources.
- **Prior reports:** Not relied upon blindly — every correction was re-verified against the current target text AND primary sources (`AGENTS.md`, Phase 05/06/07, Decisions 01–06, baseline SQL 01–18, contracts/, dispatcher/, FastAPI worker) with fresh evidence gathered in this session.

---

## 1. Executive Verdict

```text
PASS WITH MINOR FIXES
```

All three blocking conditions from the first-round review are now closed inside the plan document: the deterministic lock-order matrix exists (§6), the generic idempotency persistence has an explicit owner + forward-migration gate (§1), and the G-5 `application.submitted` disposition has named owners, audit and alert treatment (§10). The remaining findings are completeness/polish items that do not block implementation readiness.

Upgrade condition to `PASS — IMPLEMENTATION PLAN APPROVED`: extend the §6 lock-order matrix with the two missing multi-entity command families (company/member deactivation-with-reassignment; job-lifecycle child-table writes) — see P8-M1.

---

## 2. Ten-point correction verification

| # | Required verification | Result | Evidence in target |
|---|---|---|---|
| 1 | Deterministic row-lock order matrix present and implementable | ✅ VERIFIED (with 2 omissions noted → P8-M1) | §6 “Deterministic lock-order matrix” (L181–193): six command families, parent→child orders, owner column, stable-UUID tie-break rule, mandatory/ad-hoc-ban statement |
| 2 | Generic client idempotency persistence owner + forward-migration gate clear | ✅ VERIFIED | §1 “Generic client idempotency gate” (L22–29): Platform owns approved forward migration/design (durable key + request fingerprint + response reference, retention + tenant scope) before any generic command depends on it; domain keys remain authoritative meanwhile |
| 3 | G-5 `application.submitted` expected-unrouted owner, audit, alert disposition clear | ✅ VERIFIED | §10 “G-5 disposition” (L279–281): Applications owns atomic producer; Dispatcher owns allowlisted expected-unrouted/alert-suppression rule; must remain auditable; must not be silently dropped |
| 4 | Phase 03 GAP-003..015 owner/acceptance/gate defined | ✅ VERIFIED | §9 “Phase 03 gap ownership map” (L256–270): all 13 gaps enumerated, each accurate vs `PHASE-03` records |
| 5 | Realtime outage, ordered chat-gap recovery, notification recovery tests present | ✅ VERIFIED | §8 Tests (L234–237): transport-outage-does-not-fail-REST; gap recovery returns every missed durable message **in cursor order**; notification list/unread/ack correct while stream disconnected |
| 6 | `REQ-SEARCH-005` kept FUTURE | ✅ VERIFIED | §6 Scope (L156): `REQ-SEARCH-001..004` (current; `REQ-SEARCH-005` FUTURE/GAP-010) |
| 7 | Event producer ownership mapping correct | ✅ VERIFIED | §10 table (L283–293): exactly the seven registered routes mapped to emitting use cases + owning modules |
| 8 | No invented table/field/event/route/provider/role | ✅ VERIFIED | Matrix objects confirmed against baseline FK chains (see §3 below); idempotency store explicitly decision-gated, not assumed; event names = existing contracts only; no new error codes/routes/queues |
| 9 | All Phase 06 APIs mapped to work packages + tests | ✅ VERIFIED | Same mapping as prior review holds (30 catalog entries → 08-A..08-G); guest paths via 08-C/08-D; internal commands represented; subscription/email/template blocked without fake consumers |
| 10 | Security, RLS, clients, transaction, outbox, rollback rules intact | ✅ VERIFIED | §1 rules unchanged incl. client separation (L13–14), transaction boundary (L15–16), fail-closed events (L20); §11 secrets/RLS gates; §13 forward-only migrations/outbox preservation/runbook reconciliation |

---

## 3. Lock-order matrix implementability evidence (fresh FK verification)

Baseline foreign-key chains were re-extracted today to confirm each matrix row is executable without circular locking:

| Matrix family | Baseline FK evidence | Consistent? |
|---|---|---|
| Resume upload/confirm: `users → candidate_profiles → uploaded_documents → parsing/profile facts` | `uploaded_documents → users/guest_upload_sessions` (06_documents.sql); `candidate_profiles`, fact tables + `profile_change_history` + revision trigger (08_candidates.sql) | ✅ parent→child direction holds |
| Registered/guest application: `jobs → candidate/guest session → uploaded document → job application → snapshot` | `job_applications → jobs/users`; guest session consumption via approved function (09_applications.sql functions list); snapshot child of application | ✅ |
| Application status: `job_applications → company membership/actor context → status history` | `application_status_history → job_applications`; membership guard tables in 04_companies.sql; ad-hoc UPDATE blocked by `enforce_application_status_update_path()` | ✅ |
| Referral attribution: `job → invitation/claim → application → reward` | `referral_batches → jobs`; invitations/claims/rewards reference batch/application; identity guards exist (09_applications.sql L17–25) | ✅ |
| Interview scheduling: `application → interviewer/availability → schedule block → participants` | 10_interviews.sql: scope table references `job_applications` (L174); `interviews → jobs, candidate_profiles, interview_pools, interview_schedule_blocks` (L199–202); participants → interviews (L233), job_applications (L244) | ✅ application-before-interview matches FK graph |
| Message send/read: `conversation → participant membership → message/read receipt` | 11_messaging.sql: conversations → companies/job_applications/interviews/users (L37–46); participants → conversations (L78); messages → conversations (L108); attachments/receipts/reactions → messages (L116/164/174) | ✅ |

Cross-family deadlock check: the only shared-table ordering across families is `jobs` before application rows in both apply and referral families — no family reverses another family's order; status family does not touch `jobs`. The stable-UUID tie-break rule covers rows without parent locks. Conclusion: **matrix is internally consistent and implementable**.

---

## 4. Detailed correction validation

### P8-R1 → CLOSED: lock-order matrix (verification item 1)
- Matrix present at §6 with six families, owners, and the rule “no command may introduce an ad-hoc order”.
- Implementability verified against live baseline FK chains (§3 above).
- **Residual (→ P8-M1, minor):** two genuinely multi-entity command families are not listed: (a) company/branch/department/team member deactivation with the reassignment workflow required by `04_companies.sql` guards (`departments`/`teams` reference `company_members` as manager/lead/head — L187/L212); (b) job-lifecycle writes touching child requirement tables (`job_skills`, `job_locations`, shared `skills`). Both follow natural parent→child order consistent with the matrix, but Phase 07 §6 says “for each multi-entity command”, so completeness requires their explicit rows.

### P8-R2 → CLOSED: idempotency persistence owner/gate (item 2)
- §1 gate names the owning party (“Platform owns an approved forward migration/design”), the preconditions (durable key + request fingerprint + response reference; retention; tenant scope), the dependency rule (“before any generic command depends on it”), and the interim behaviour (“commands use their existing domain keys or remain explicitly TBD”).
- Verified truthful against baseline: grep confirms only domain-specific keys exist (`resume_parsing_jobs.idempotency_key` L50 of 07, `referral_batches` L246, notifications L145, analytics L27) plus worker-side `processed_events`; no generic store is claimed to exist.
- Consistent with Decision-01 no-invention discipline and AGENTS.md change rules. Phase-05 blocker 2 now has an assigned resolution path.

### P8-R3 → CLOSED: G-5 disposition (item 3)
- §10 assigns both sides: Applications = atomic producer; Dispatcher = allowlisted expected-unrouted/alert-suppression **rule** (an observability-layer classification, not a registry route) until GAP-012 notification route closes.
- Audit requirement explicit (“must remain auditable”), drop-protection explicit (“must not be silently dropped”).
- Reconciles Decision-03/GAP-012 sanctioned emission with dispatcher fail-closed claiming (`mark_outbox_event_failed(unknown_route:<type>)` per README §6; `retry_count/max_retries/dead_lettered_at` per 15_infrastructure.sql L40–85). Route authority sentence retained (“Dispatcher registry is the only route authority”), so no contradiction arises.

### P8-R5 → CLOSED: GAP ownership map (item 4)
- All thirteen gaps GAP-003..GAP-015 have owner/gate + treatment rows (L256–270). Spot-checked accuracy:
  - GAP-003 thresholds deferred to a Phase-09 SLO gate; §12 amended to state the plan invents no numeric values ✅
  - GAP-007 implemented within 08-D (baseline table already executable) ✅
  - GAP-009 generic producer + provider contract gate matches API-AI-001 “provider/model is deployment configuration” ✅
  - GAP-012/GAP-013/GAP-015 match PHASE-03 classifications verbatim in substance ✅
  - GAP-010 aligned with new SEARCH-005 FUTURE marking ✅

### P8-R6 → CLOSED: realtime/chat/notification tests (item 5)
- Three added tests match exactly what was missing from Decision-02 §9 parity: outage-does-not-break-REST (#7), ordered cursor gap recovery (#8 wording strengthened from “recovers cursor” to “every missed durable message in cursor order”), notification correctness under stream disconnect.
- Existing tests (auth-at-connect, tenant isolation, non-participant join, rollback-no-realtime, duplicate safety) remain intact at L230–233 — no regression.

### P8-R4 → CLOSED; P8-R7 → CLOSED (items 6–7)
- SEARCH-005 explicitly excluded from current scope with GAP-010 pointer.
- Producer table covers exactly the seven registered routes with plausible emitters matching approved flows (`security.scan.requested` ← upload incl. guest; `resume.parse.requested` ← clean-scan transition; `candidate.profile.changed` ← confirmation; `match.analyze.requested` ← application/matching trigger, respecting D03 “not routed from application.submitted”; job enrichment/screening ← job lifecycle points; interview summary ← interview completion). No extra event invented.

---

## 5. Residual minor items (non-blocking)

### P8-M1 — Lock-order matrix incomplete for two multi-entity families (MINOR)
- **Section:** Target §6 matrix (L181–193).
- **Evidence:** 04_companies.sql L187/L212: `departments`/`teams` reference `company_members` (manager/lead/head) — the deactivation-with-reassignment workflow mandated by Phase 04 §4 is multi-entity; job create/update writes `jobs` + `job_skills`/`job_locations` (+ shared `skills`) per baseline 05_jobs.sql and API-JOB-001. Neither appears as a matrix row.
- **Impact:** Low — both follow the obvious parent→child pattern the matrix already mandates, contention is low-frequency, and the matrix’s own ban on ad-hoc orders forces Phase 09 to extend under review. But Phase 07 §6 wording (“for each multi-entity command”) makes explicit rows the cleaner compliance path.
- **Correction:** Add two rows: `Company/member ops: company → membership/manager references → branch/department/team reassignment | companies`; `Job lifecycle: jobs → job_skills/job_locations children → shared skills/skill_requests | jobs`.
- **Blocks:** NO.

### P8-M2 — Exit-criterion wording could include G-5 disposition (COSMETIC)
- **Section:** Target §14 criterion 3: “Lock order, idempotency persistence and G-1 ownership are assigned.”
- **Note:** G-5 disposition is now also assigned in §10; adding “G-5 disposition” to criterion 3 would keep the exit checklist co-extensive with plan content. Pure documentation polish; current text is a subset and not false.
- **Blocks:** NO.

### Observations verified as NOT defects
- Status header remains `REVIEW REQUIRED` until this revalidation — correct process posture.
- Idempotency-gate “durable key + request fingerprint + response reference” phrasing is decision *requirement* language inside a gated forward migration, not an invented schema.
- Dispatcher alert-suppression allowlist is explicitly owned by the Dispatcher component and does not alter route authority or fail-closed behaviour.

---

## 6. Source cross-check ledger (this session)

| Source | Re-checked for this revalidation |
|---|---|
| `AGENTS.md` | No-invent/conflict rules applied to every new plan section |
| `PHASE-05-FINAL-REQUIREMENTS.md` | Blocker #2 resolution path confirmed; §9A registry intact |
| `PHASE-06-API-CATALOG.md` | Mapping coverage unchanged; subscription/email/template blocking intact |
| `PHASE-07-ARCHITECTURE.md` | §6 delegation satisfied by matrix (with P8-M1 completeness note); §13 open items now owned |
| `DECISION-01..06` | Client boundary, D03 routing boundary, D05 invariant, D06 vocabulary all preserved; no new codes |
| Baseline SQL 01–18 | FK chains for interviews/messaging/companies re-extracted; idempotency-key grep re-run; table/function inventory reused from first-round verification |
| `contracts/` | Producer table = exactly the seven registered contracts; envelope/G-1 gates untouched |
| `05-outbox-dispatcher-nestjs/` | G-5 disposition validated against registry/fail-closed claiming/P1-1 output-event exclusion; release-gate items respected as upstream gates |
| `07-fastapi-ai-worker/` | 08-G non-duplication of execution/leases/idempotency/result-writes still holds |

---

## 7. Final Verdict

```text
VERDICT: PASS WITH MINOR FIXES

First-round CONDITIONAL PASS conditions:
  P8-R1 lock-order matrix ............ CLOSED (verified implementable vs baseline FKs)
  P8-R2 idempotency owner/gate ....... CLOSED (Platform + forward-migration gate)
  P8-R3 G-5 unrouted disposition ..... CLOSED (owners + audit + alert suppression)
Also closed: P8-R4 (SEARCH-005 FUTURE), P8-R5 (GAP map), P8-R6 (3 realtime tests),
             P8-R7 (producer ownership table).

Remaining minor fixes before/during Phase 09 start:
  P8-M1 add two missing lock-order family rows (company/member ops; job lifecycle)
  P8-M2 optional exit-criterion wording inclusion of G-5 disposition

NESTJS CODING AUTHORIZED: NO
(Unchanged by this document verdict — Phase 09 still gated by dispatcher-side open
items: G-1(b) producer-envelope freeze, G-5 verification evidence, P0-2 secrets,
plus product decisions GAP-008/009 where applicable.)
```

No tests were executed during this revalidation; every claim above is a static source-inspection result with cited line-level evidence.


