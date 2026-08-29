# Phase 5 Final Requirements — RE-VALIDATION REPORT (Qoder)

**Audit target:** `04-nestjs-api/PHASE-05-FINAL-REQUIREMENTS.md` (243 lines, revised after first-round reviews)
**Auditor:** Qoder (independent Senior Product Architect / NestJS Architect / PostgreSQL-RLS Reviewer / Distributed-Systems Engineer)
**Date:** 2026-08-26
**Mode:** Re-validation after corrections. No earlier approval was inherited. Every claim below was re-verified against executable SQL, contracts, dispatcher code and frozen decisions in this session. No code, SQL, contract or target requirement file was modified. **No runtime test was executed**; nothing is claimed as a passed test.

---

## 1. Re-validation summary

The revised Phase-5 document fixed the major first-round findings:

| First-round finding | Status in revised doc |
|---|---|
| P5-01 saved candidates missing from §2 scope | **FIXED** — §2 bullet (:40) + coverage index row (:63) |
| P5-03 Phase-3 GAP-003..015 not carried | **FIXED** — §8 bullet (:192–193) names GAP-005/REQ-REFERRAL-007 |
| P5-10 admin/analytics/feedback/subscription unplaced | **FIXED** — coverage index row (:64) marks them Planned/gap/future |
| P5-08 guest invariant terse | **PARTIALLY FIXED** — §3 bullets improved, but see RV-02 |
| No requirement-ID index | **FIXED** — new §2 coverage index (:50–68) with no-silent-upgrade note (:68) |
| No dispatcher/route transparency | **FIXED** — new §9A with exact 7 routes + phased gaps |
| Stage derivation undocumented | **MOSTLY FIXED** — new §6 derivation text (:172–175); see RV-03 |
| P5-02 compensating cleanup event untracked | **NOT FIXED** — still absent from §3/§8/§9/§9A (RV-01) |

Two MEDIUM residual issues remain (RV-01, RV-02); both are small text corrections, not architecture problems.

## 2. Files/sources inspected (this session)

- `PHASE-05-FINAL-REQUIREMENTS.md` (revised, 243 lines)
- `AGENTS.md`; `PLAN-REQUIREMENTS-TO-IMPLEMENTATION-HINGLISH.md` (§14 coding gate)
- `PHASE-01-REQUIREMENTS-CONSOLIDATION.md` (:82–90, :177–196 re-checked)
- `PHASE-02-REQUIREMENTS-TRACEABILITY-MATRIX.md` (:88, :92, :207 re-checked)
- `PHASE-03-GAP-CONFLICT-ANALYSIS.md` (:37, :124–127 re-checked)
- `PHASE-04-STATE-MACHINES-AND-TRANSACTIONS.md` (full, prior read re-applied)
- `s1/codex/STAGE-03-REMAINING-DECISIONS.md` (:24–100 re-checked — §1B tail contradiction now fixed)
- `DECISION-01-...-HINGLISH.md`, `DECISION-02-...-HINGLISH.md`
- `02-database/migrations/baseline/09_applications.sql` (:615–660), `17_rls.sql` (:85–90, :155–188, :162–176, :234–236)
- `contracts/events/` (14 files), `contracts/tasks/` (7 files) — full inventory re-globbed; no new files
- `05-outbox-dispatcher-nestjs/src/routing/event-route.registry.ts` (full 108 lines)
- `07-fastapi-ai-worker/app/api/v1/task_handlers.py` (scan/parse gating, prior read re-applied)
- Prior phase5 reviews present in `s1/phase5/` (antigravity, cadence, my first-round qoder report) — treated as evidence only, not trusted

## 3. Verification of the 14 mandated checks

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | All REQUIRED Phase-1 IDs represented or explicitly linked | **PASS** | New §2 coverage index (:50–68) maps every Phase-1 group (PLATFORM, AUTH, COMPANY, ONBOARDING, CANDIDATE, RESUME, JOB, SEARCH, APPLICATION, REFERRAL, INTERVIEW, MESSAGE, NOTIFY, REALTIME, SAVED-CANDIDATE, ANALYTICS, FEEDBACK, SUBSCRIPTION, AI, API) with treatment; :68 "no status is silently upgraded" |
| 2 | REQ-SAVED-CANDIDATE-001 clearly current scope | **PASS** | §2 :40 bullet + :63 index row "Current/frozen policy; Phase 6 CRUD catalog"; baseline `saved_candidates` exists (`09_applications.sql:228`, RLS `17_rls.sql:211`, authenticated SELECT grant `17_rls.sql:172`) |
| 3 | Phase-3 gaps/conflicts and Phase-4 state machines preserved | **PASS** | §8 :192–193 carries GAP-003..015 by reference with GAP-005 explicit; §9.8 adds blocker "Requirement-by-requirement review of Phase-3 gaps/conflicts and Phase-4 state transitions"; Phase-3/4 listed as primary evidence §1 |
| 4 | RLS wording separates UserContextClient reads / SystemClient document reads / trusted writes | **PASS WITH GAP → RV-02** | §3 :77–82 now states all three tiers correctly; but the SystemClient/no-authenticated-read table list omits `guest_upload_sessions` (baseline: no grant/policy for it in `17_rls.sql:162–176`; RLS enabled :86) |
| 5 | Upload is NestJS-mediated multipart | **PASS** | §3 :86 matches frozen owner decision (REMAINING-DECISIONS §1A :39–41, §2) |
| 6 | Validation synchronous, ClamAV scan asynchronous | **PASS** | §3 :87–90: sync auth/ownership/size/type/magic-byte/checksum validation; commit metadata + `security.scan.requested`; "upload response does not wait for a full scan" — matches FastAPI handler gating |
| 7 | All seven dispatcher input routes accurate | **PASS** | §9A :216–224 matches `event-route.registry.ts` exactly, including queue names (`ai-heavy-queue`, `projection-queue`, `security-scan-queue`) and the `security.scan.requested` (dot) spelling |
| 8 | `application.status.changed` documented as expected phased gap | **PASS** | §9A :226–227; ground truth verified: emitted by baseline function `09_applications.sql:639–648`; no contract file in `contracts/`; not in registry. Record is factually correct; minor completeness note → RV-04 |
| 9 | Worker output events not listed as dispatcher inputs | **PASS** | §9A :227–229 names `candidate.projection.rebuilt` and `candidate.resume.parsed` as worker outputs; matches registry comment "Output events are not registered as dispatcher input routes" and PHASE-03 GAP-013 |
| 10 | UI stages derive from both DB status tracks | **MOSTLY PASS → RV-03** | §6 :172–175 gives deterministic security-precedence derivation verified against enums; `parsed` and `ai_enriching` processing states are not mapped |
| 11 | Current/future/planned/unresolved not silently merged | **PASS** | Index "Current treatment" column keeps PLANNED rows planned (:64–65); REQ-RESUME-007 marked clarification (:58); fast-track excluded §8; :68 explicit no-upgrade statement |
| 12 | Phase-3 GAP-003..015 treatment visible and honest | **PASS** | §8 :192–193 explicit; consistent with PHASE-03 §2/§5 (GAP-005 still a blocking product decision — honestly flagged) |
| 13 | Exit criteria sufficient before `FINAL REQUIREMENTS FROZEN` | **PASS** | §10 criteria unchanged and complete; §9 blocker 8 now forces the Phase-3/4 requirement-by-requirement review before status change; the status itself correctly remains `FREEZE CANDIDATE` |
| 14 | Coding blocked until exit criteria pass | **PASS** | §10 :242 "Until then: CODING NOT AUTHORIZED"; consistent with PLAN §14 (Phase 6–8 + independent review required first); no runtime evidence exists that would justify a different claim |

## 4. Residual issues

| Issue ID | Severity | Exact file & section | Evidence from source of truth | Impact | Recommended correction | Blocks Phase 6? | Blocks coding? |
|---|---|---|---|---|---|---|---|
| RV-01 | MEDIUM | PHASE-05 §§3, 8, 9, 9A | Compensating cleanup event is an approved requirement (`STAGE-03-REMAINING-DECISIONS.md` §1A :38, §9 :199; SYNC draft :115, :261; Guide §8.6). No contract file exists in `contracts/` (re-globbed: 0 matches) and §9A does not record it as a phased gap | First-round finding P5-02 unfixed: an approved async event still has neither a contract nor an explicit phased-gap record in the freeze document, failing exit criterion "every async event has an existing contract and consumer or an explicit phased-gap record" | Add one line to §3 upload rules and a phased-gap entry in §9A: compensating cleanup event approved; contract + sweeper consumer/owner phase pending; fail-closed (no silent orphan retention) | No | No |
| RV-02 | MEDIUM | PHASE-05 §3, :81–82 | `17_rls.sql:162–176` grants authenticated SELECT on a closed list that excludes **four** resume-scope tables: `uploaded_documents`, `guest_upload_sessions`, `resume_parsing_jobs`, `resume_parsed_data` (RLS enabled :86–89); the SYNC draft §2 DB-access row lists all four | The new frozen enumeration lists only three tables; omitting `guest_upload_sessions` while guest flows are current scope (§4) can mislead Phase-6 authors into assuming an authenticated read path exists for guest sessions | Add `guest_upload_sessions` to the :81–82 table list | No | No |
| RV-03 | LOW | PHASE-05 §6, :174–175 | `resume_processing_status` includes `parsed` and `ai_enriching` (`07_resume_processing.sql`; SYNC §3 two-track list :109) | The "deterministic" derivation is silent on two enum values; a catalog author must guess their stage | Add one clause, e.g. `parsed`/`ai_enriching` map to REVIEW_READY (or PARSING_IN_PROGRESS) — exact value is a catalog decision but must be stated as open, not silent | No | No |
| RV-04 | LOW | PHASE-05 §9A, :226–227 | PHASE-03 GAP-013 requires every phased-gap record to state contract name, owning future phase, queue owner and fail-closed behavior; `application.status.changed` has no contract file in `contracts/` | The phased-gap record is accurate but thinner than the GAP-013 template | Extend the record: note no versioned contract exists yet, name the owning phase (application/notification routing), and state fail-closed dispatcher behavior | No | No |
| RV-05 | LOW (upstream, unchanged) | PHASE-01 §13 :183–184, :84; PHASE-02 :92; PHASE-03 GAP-007 :37 | First-round P5-04/P5-06/P5-07 were upstream hygiene items: Phase-1 still says access model/realtime "pending" and "signed URL only"; Phase-2 still prints `security-scan.requested` (dash); GAP-007 still says "implementation remains" though `saved_candidates` SQL now exists in baseline | Phase-5 itself is correct and now self-contained, so impact is reduced; but Phase-6 authors using Phase-1/2 as inventory may still read stale rows | Fix the three upstream rows or add supersession notes; not a Phase-5 gate | No | No |

## 5. Regression check (did the corrections break anything?)

- §2 scope bullets and §4–§7 frozen rules are textually unchanged where they were previously verified correct (multipart, async scan, clean-only parsing, checksum reuse, 10-resume limit, atomic outbox, no external calls in TX, `trace_id`-in-payload, SSE/REST/WS split, confirm allowlist + `409 STALE_REVISION`, application-only non-promotion). **No regression.**
- Guest paths in §4 (:125–130) still byte-identical to the frozen paths in REMAINING-DECISIONS §1B :71–76. **No regression.**
- §5 envelope unchanged and still matches the consolidated DTO review. **No regression.**
- The new §3 access-model bullets (:79–82) are consistent with DECISION-01 §6 and `17_rls.sql` except the RV-02 omission. **One new incomplete enumeration** (not a contradiction).
- The new §9A route list introduces no invented route; each line was diff-checked against `event-route.registry.ts`. **No regression.**
- REMAINING-DECISIONS §1B tail (:97–100) now correctly states guest paths, active-profile default and stage table are frozen — first-round P5-05 upstream contradiction **fixed**, consistent with Phase-5 §4/§6.

## 6. Exit-criteria and status assessment

- §10 exit criteria are met in substance for requirement coverage, DB-write ownership, security/RLS documentation and independent verification — **except** "every async event has an existing contract and consumer or an explicit phased-gap record" (RV-01) and complete RLS enumeration accuracy (RV-02).
- The declared status `FREEZE CANDIDATE — API CATALOG BLOCKERS TRACKED — CODING NOT AUTHORIZED` remains **honest**. It must not be promoted to `FINAL REQUIREMENTS FROZEN` until RV-01 and RV-02 are applied and re-verified.
- Coding authorization: **still blocked** (PLAN §14 gates on Phase 6–8 deliverables; none exist). No test execution was performed in this audit; no test-based claim is made.

## 7. Final verdict

### PASS WITH MINOR FIXES

The revised Phase-5 document correctly incorporated the substantive first-round corrections
(saved-candidates scope, requirement-ID index, GAP-003..015 carry-over, dispatcher transparency,
stage derivation, access-model tiers) and introduced no regression. Two MEDIUM text-level items
remain: **RV-01** (compensating cleanup event still lacks a contract/phased-gap record in this
document) and **RV-02** (`guest_upload_sessions` missing from the SystemClient table enumeration).
After these two corrections are applied and re-verified, the document may be promoted to
`PASS — FINAL REQUIREMENTS FROZEN`. Phase 6 catalog drafting is not blocked; **coding remains NOT
AUTHORIZED**.
