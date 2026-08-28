# Phase 5 Final Requirements Validation Report — Qoder

**Audit target:** `04-nestjs-api/PHASE-05-FINAL-REQUIREMENTS.md` (193 lines, status `FREEZE CANDIDATE — API CATALOG BLOCKERS TRACKED — CODING NOT AUTHORIZED`)
**Auditor:** Qoder (independent Senior Product Architect / NestJS Architect / PostgreSQL Security Reviewer / Distributed-Systems Engineer)
**Date:** 2026-08-26
**Method:** Static source verification only. No code, SQL, contract or requirement file was modified. No runtime test was executed; nothing below is claimed as a passed test. The prior Antigravity Phase-5 review was re-verified against sources, not accepted at face value.

---

## 1. Executive verdict

### APPROVED WITH MINOR FIXES

The Phase-5 document is a disciplined, honest freeze candidate. Every concrete claim I could verify
against executable truth (access model, multipart upload, async scan, clean-only parsing, atomic
outbox, no external calls inside open transactions, `trace_id` propagation, SSE/REST/WS split,
stage vocabulary, confirm rules, registered + guest API paths, response envelope) matches the
baseline SQL, contracts, dispatcher registry, FastAPI worker and frozen decisions. **No invented
table, column, function, event or API path was found in the Phase-5 document itself.**

Three MEDIUM completeness gaps prevent an immediate `FINAL REQUIREMENTS FROZEN` status:

1. Saved candidates (`REQ-SAVED-CANDIDATE-001`, REQUIRED/FROZEN) is missing from the §2 scope enumeration.
2. The approved compensating cleanup event has no contract and no phased-gap record carried into Phase 5.
3. Phase-3 open gaps (GAP-003..015, including the still-blocking GAP-005 referral-program scope decision) are not explicitly re-carried in §8/§9.

All remaining findings are LOW upstream-document staleness items. The declared status line is
**honest**. None of the findings blocks Phase 6 catalog drafting; all MEDIUM items must be fixed
before the status is promoted to `FINAL REQUIREMENTS FROZEN`. Coding remains not authorized.

---

## 2. Files/sources inspected

| # | Source | Purpose |
|---|---|---|
| 1 | `AGENTS.md` | Working rules, authority/conflict discipline |
| 2 | `04-nestjs-api/PLAN-REQUIREMENTS-TO-IMPLEMENTATION-HINGLISH.md` | Phase gates, authority order, coding gate (§14) |
| 3 | `04-nestjs-api/PHASE-01-REQUIREMENTS-CONSOLIDATION.md` | Full REQ-* inventory (229 lines) |
| 4 | `04-nestjs-api/PHASE-02-REQUIREMENTS-TRACEABILITY-MATRIX.md` | Policy codes, matrix, GAP-001..012, dispatcher table |
| 5 | `04-nestjs-api/PHASE-03-GAP-CONFLICT-ANALYSIS.md` | GAP-001..015, CONFLICT-001..005, blocking decisions |
| 6 | `04-nestjs-api/PHASE-04-STATE-MACHINES-AND-TRANSACTIONS.md` | All state machines + transaction template (240 lines) |
| 7 | `s1/codex/STAGE-03-NESTJS-API-REQUIREMENTS-SYNC.md` | 4 resume APIs + guest boundary (278 lines) |
| 8 | `s1/codex/STAGE-03-REMAINING-DECISIONS.md` | Frozen §1B/§1A/§2/§5 + open decisions (275 lines) |
| 9 | `04-nestjs-api/DECISION-01-NESTJS-SUPABASE-ACCESS-MODEL-HINGLISH.md` | FROZEN controlled-hybrid |
| 10 | `04-nestjs-api/DECISION-02-REALTIME-TRANSPORT-HINGLISH.md` | FROZEN SSE/WS/REST split |
| 11 | `02-database/migrations/baseline/` — `05_jobs.sql`, `06_documents.sql`, `07_resume_processing.sql`, `09_applications.sql`, `15_infrastructure.sql`, `16_indexes.sql`, `17_rls.sql` (others read in prior audit turns) | Executable ground truth |
| 12 | `contracts/events/` (14 files), `contracts/tasks/` (7 files), `contracts/schemas/security-scan-result.v1.json` | Contract inventory |
| 13 | `05-outbox-dispatcher-nestjs/src/routing/event-route.registry.ts` | Route registry (7 input routes) |
| 14 | `07-fastapi-ai-worker/app/api/v1/task_handlers.py` | ClamAV handler, scan-gated parse handler |
| 15 | `01-requirements/current/PRODUCT-REQUIREMENTS.md`, PD-001..PD-004, `NON-FUNCTIONAL-REQUIREMENTS.md`, `MANUAL-REFERRAL-REQUIREMENT.md` | Current approved requirements |
| 16 | `s1/codex/STAGE-03-CONSOLIDATED-DTO-ERROR-CONTRACT-REVIEW.md` | Envelope/error vocabulary source cited by Phase-5 §5 |
| 17 | `s1/phase5/antigravity-phase5-final-requirements-validation.md` | Prior agent review (re-verified, not trusted) |

---

## 3. Requirement coverage table

Phase 5 is a navigation document: it states (lines 46–47) that the complete requirement-ID
inventory remains in Phase 1/2. Coverage below is evaluated against the Phase-1 REQ-* inventory.

| Requirement group | Phase-1 status | Represented in Phase 5 | Verdict |
|---|---|---|---|
| REQ-PLATFORM-001..008 | REQUIRED / NEEDS_CLARIFICATION (007) | §3 rules, §5 envelope, exit criteria | OK |
| REQ-AUTH-001..007 | REQUIRED (005/007 FROZEN) | §2 bullet 1; §3 access model | OK |
| REQ-COMPANY-001..005 | REQUIRED | §2 bullet 2 | OK |
| REQ-ONBOARDING-001 | REQUIRED | Implicit in §2 bullet 3 (candidate profile) | OK (minor) |
| REQ-CANDIDATE-001..006 | REQUIRED | §2 bullet 3; §7 confirm rules | OK |
| REQ-RESUME-001..006 | REQUIRED | §2 bullet 4; §§3, 4, 6 | OK |
| REQ-RESUME-007 fast-track | NEEDS_DECISION | §8 excluded | OK — correctly excluded |
| REQ-JOB-001..003, REQ-SEARCH-001..005 | REQUIRED / NEEDS_DECISION (SEARCH-005) | §2 bullet 5 | OK |
| REQ-APPLICATION-001..007 | REQUIRED | §2 bullet 6; §7 last bullet | OK |
| REQ-REFERRAL-001..006 | REQUIRED | §2 bullet 7 | OK |
| REQ-REFERRAL-007 configurable programs | PLANNED CURRENT / GAP | Not mentioned in §8/§9 → **P5-03** | GAP |
| REQ-INTERVIEW-001..002 | REQUIRED | §2 bullet 7; §9.7 | OK |
| REQ-INTERVIEW-003 calendar/video | FUTURE | §8 excluded class | OK |
| REQ-MESSAGE-001 | REQUIRED | §2 bullet 7; §3 WS-for-chat; §8 catalog details | OK |
| REQ-NOTIFY-001..002 | REQUIRED | §2 bullet 7; email route excluded §8 | OK |
| REQ-NOTIFY-003 email templates | PLANNED CURRENT / GAP | Not mentioned → **P5-03** | GAP |
| REQ-REALTIME-001 | REQUIRED / FROZEN | §2 bullet 9; §3 realtime | OK |
| REQ-SAVED-CANDIDATE-001 | REQUIRED / FROZEN | Only §9.7; absent from §2 → **P5-01** | GAP |
| REQ-SAVED-JOBS (Product §4) | REQUIRED | §2 bullet 5 | OK |
| REQ-ANALYTICS-001 / FEEDBACK-001 / SUBSCRIPTION-001 | PLANNED | Not addressed in §2/§8 → **P5-10** | MINOR |
| REQ-AI-001..004 | PLANNED / APPROVED DIRECTION / NEEDS_DECISION (004) | §8 excluded class (unrouted/unapproved) | OK |
| REQ-API-001..007 | REQUIRED | §3, §5, §9 | OK |
| Compensating cleanup event (approved in Stage-03) | Approved requirement | Absent; no contract; no phased-gap record → **P5-02** | GAP |

No REQUIRED requirement was found silently removed repo-wide: every omission above is either
tracked in Phase-3/Stage-03 linked documents or flagged here. Future items (fast-track, calendar
integration, email delivery routes, CMS, external search) are correctly kept out of current scope.

---

## 4. Domain coverage findings (checklist B)

| Domain | Phase-5 location | Finding |
|---|---|---|
| Identity/authentication | §2.1, §3 access model | Covered; matches `03_users_auth.sql` + Decision-01 |
| Companies/memberships | §2.2 | Covered; matches Phase-4 §4 invariants |
| Candidates/canonical profile | §2.3, §7 | Covered; revision/history/allowlist rules intact |
| Resume upload/security scan/parsing | §2.4, §3, §4, §6 | Covered in depth; verified against `06`/`07` SQL + FastAPI handler |
| Jobs and search | §2.5 | Covered |
| Applications/immutable snapshots | §2.6, §7 | Covered; snapshot immutability preserved (PD-003) |
| Referrals | §2.7 | Manual referral covered; configurable-program decision not re-carried (P5-03) |
| Interviews | §2.7, §9.7 | Covered as requirement scope; catalog deferred honestly |
| Notifications | §2.7, §8 | Covered; email route correctly an excluded phased gap |
| Messaging/chat | §2.7, §3, §8 | Covered; WS chat ≠ SSE notifications kept separate |
| Saved jobs | §2.5 | Covered (`saved_jobs`, RLS `saved_jobs_own_read` at `17_rls.sql:207`) |
| Saved candidates | §9.7 only | **P5-01**: missing from §2 enumeration despite REQUIRED/FROZEN status and baseline now containing `saved_candidates` (`09_applications.sql:228`, RLS at `17_rls.sql:211`, index at `09_applications.sql:1081`) |
| Realtime UI updates | §2.9, §3, §6 | Covered; matches Decision-02 exactly |
| Outbox/background processing | §2.8/2.10, §3 | Covered; matches `15_infrastructure.sql` + registry |
| Admin/system operations | — | **P5-10**: PLANNED admin/analytics/feedback/subscription domains not explicitly placed in §2 or §8 |

---

## 5. Database/RLS findings (checklist C)

1. **No invented objects.** Every DB object named in Phase-5 or its cited Stage-03 scope exists in
   the executable baseline: `uploaded_documents`, `guest_upload_sessions`, `resume_parsing_jobs`,
   `resume_parsing_job_events`, `resume_parsed_data`, `candidate_profile_documents`,
   `profile_change_history`, `application_documents`, `application_profile_snapshots`,
   `outbox_events`, `processed_events`, `saved_jobs`, `saved_candidates`,
   `consume_guest_upload_session(UUID,UUID)` (`09_applications.sql:503`).
2. **RLS accuracy.** Phase-5 §3 "default-deny tables are not made public by inventing policies"
   is accurate: `17_rls.sql` grants no authenticated SELECT on the four resume-scope tables;
   `consume_guest_upload_session` is `REVOKE ... FROM PUBLIC, anon, authenticated` /
   `GRANT ... TO service_role` only (`17_rls.sql:234–236`). SystemClient + NestJS ownership
   checks for these tables (REMAINING-DECISIONS §1A) are therefore the only viable path.
3. **DB-write ownership.** Confirm writes (§7) map to the Phase-4 §5 template (facts + history +
   one revision bump + one outbox event, one transaction). Upload writes map to §6 + Stage-03 §3
   write path. Worker writes (scan result, parse result) remain FastAPI-owned via
   `processed_events` idempotency — correctly not claimed by NestJS.
4. **`trace_id` claim is precise.** `outbox_events` has `correlation_id`/`causation_id` but **no
   `trace_id` column** (`15_infrastructure.sql`); Phase-5 §3 says "`trace_id` is propagated in
   event/task payloads; `request_id` is HTTP/log correlation only" — this matches ground truth
   (e.g. `security-scan-requested.v1.json` payload `trace_id`).
5. **Enums preserved.** `security_scan_status` (pending/scanning/clean/infected/failed/quarantined)
   and `resume_processing_status` (uploaded/queued/processing/parsed/ai_enriching/completed/
   failed/partial) match `06_documents.sql`/`07_resume_processing.sql`. Phase-5 §6 stage
   vocabulary is explicitly a derived projection, not a new enum — correct.

## 6. State-machine/transaction findings

1. **Transaction template.** Phase-5 §3 "Business row, audit/history and outbox event commit
   atomically; no Cloud Tasks, FastAPI, email or other external call occurs inside the open DB
   transaction" matches PHASE-04 §2 and PLAN §8 verbatim semantics.
2. **Terminal states.** Infected/quarantined never parsed-ready (FastAPI parse handler returns
   503 `SCAN_PENDING` for pending/scanning and terminal failure for infected/quarantined —
   `task_handlers.py` gating); §6 stage precedence ("security precedence") encodes this correctly.
   `SECURITY_RETRYABLE_FAILURE` maps to the fail-closed scanner-unavailable `failed` + retryable
   path in the ClamAV handler; `REVIEW_READY_PARTIAL` maps to `partial` (not failure), matching
   the consolidated DTO review.
3. **Guest session/claim machines.** Phase-4 §6.2/§8.2 states (active/consumed/expired/revoked;
   pending/verified/merged/expired/revoked/rejected) are unchanged by Phase-5; guest paths in §4
   inherit them via REMAINING-DECISIONS §1B/§5 (active, unexpired, not revoked enforcement).
4. **Confirm stale-revision rule.** `expected_profile_revision` mandatory + `409 STALE_REVISION`
   matches PHASE-04 §5, Stage-03 §6 and the consolidated DTO review.
5. One minor gap: the parsing-job `cancelled` state (PHASE-04 §6.3) has no corresponding UI stage
   in §6; cancellation policy remains catalog work — acceptable, noted for Phase 6.

## 7. Async/event findings (checklist D)

1. **Events named by Phase-5 all have contracts:** `security.scan.requested`,
   `resume.parse.requested`, `candidate.profile.changed`, `application.submitted` (via Phase-4 §8.1
   reference chain) — all present in `contracts/events/`.
2. **Dispatcher alignment.** Registry registers exactly the seven input routes recorded in
   PHASE-03 GAP-013 (`resume.parse.requested`, `candidate.profile.changed`,
   `job.ai.enrichment.requested`, `match.analyze.requested`, `interview.summary.requested`,
   `job.screening_questions.requested`, `security.scan.requested`). Output events
   (`candidate.resume.parsed`, `candidate.projection.rebuilt`, `job.enriched`, etc.) are correctly
   not treated as input routes. Phase-5 §8 "Any event/route not present in the approved
   contracts/dispatcher registry" exclusion is consistent with fail-closed behavior.
3. **`notification.email.requested`** remains an EXPECTED PHASED GAP (GAP-015); Phase-5 §8
   excludes it honestly.
4. **Exception — P5-02:** the approved compensating cleanup event (REMAINING-DECISIONS §1A:
   "Compensating cleanup event is required"; SYNC §3 failure/compensation) has **no contract file**
   in `contracts/` and is **not** present in Phase-5 §3, §8 or §9, and has no phased-gap record.
   Checklist D requires every event to have a contract or an explicit phased-gap record.

## 8. Security/privacy findings (checklist E)

| Check | Result |
|---|---|
| Browser never calls Supabase | PASS — §3 bullets 2, "direct Browser-to-Supabase Storage prohibited" |
| Upload through NestJS (frozen multipart) | PASS — matches REMAINING-DECISIONS §1A/§2 owner decision |
| Sync validation vs async ClamAV separation | PASS — §3: response after metadata+outbox commit; scan asynchronous |
| Only clean documents parsed | PASS — §3 + FastAPI gating verified |
| Guest session ownership/expiry/revocation | PARTIAL — rules exist in cited sources (REMAINING-DECISIONS §1B/§5; `consume_guest_upload_session` service-role-only) but Phase-5 §3 states them only tersely → P5-08 |
| Raw resume text/AI output/paths/tokens/scanner internals protected | PASS — §3 bullet, §5 sanitized details |
| Application-only resume not promoted | PASS — §7 last bullet; matches `application_documents` + immutable snapshots |
| Ownership-safe 404 / no leak | PASS — via cited consolidated DTO review (§5 reference) |

## 9. Realtime findings (checklist F)

- SSE = live optimization, REST/DB authoritative: matches Decision-02 §§1–2 verbatim (Phase-5 §3 + §6).
- Reconnect recovery: Decision-02 §5 (exponential backoff, REST refetch) carried via §3/§6; no in-memory replay correctness.
- WebSocket chat kept separate from SSE notifications: §3 bullet 3 matches Decision-02 §2/§7.
- No polling requirement introduced: Decision-02 §6 permits only page-scoped fallback when realtime is disabled; Phase-5 adds nothing stronger. PASS.

## 10. Missing or conflicting requirements

| ID | Severity | Exact reference | Phase-5 says | Source of truth says | Why it matters | Recommended correction | Blocks Phase 6? | Blocks coding? |
|---|---|---|---|---|---|---|---|---|
| P5-01 | MEDIUM | PHASE-05 §2 (scope bullets) vs Phase-1 §9A :146, Product §15A, Decision-04 | §2 lists saved jobs but not saved candidates; saved candidates appears only in §9.7 blocker | `REQ-SAVED-CANDIDATE-001` is REQUIRED/FROZEN; baseline `saved_candidates` table, unique constraint and RLS policy now exist (`09_applications.sql:228–236`, `17_rls.sql:211`) | A REQUIRED frozen requirement is absent from the freeze document's own scope enumeration, weakening exit criterion "every required requirement ID has a source and owner" | Add saved candidates to §2 scope bullets (Decision-04 policy; APIs in Phase 6) | No | No |
| P5-02 | MEDIUM | PHASE-05 §§3, 8, 9 vs REMAINING-DECISIONS §1A :38, SYNC §3 (failure/compensation) | Silent — cleanup event not mentioned | Compensating cleanup event is an approved requirement; no contract exists in `contracts/`; only sweeper ownership/timing is tracked as open (SYNC §7.7) | Checklist D: an approved async event has neither a contract nor an explicit phased-gap record in the freeze document | Add cleanup event to §3 upload rules and either a contract task or an EXPECTED PHASED GAP record with owner phase in §9 | No | No |
| P5-03 | MEDIUM | PHASE-05 §§8–9 vs PHASE-03 §2/§5 (GAP-003..015) | §8 excludes only email routes, fast-track, chat catalog details, unrouted events | Phase-3 lists GAP-003 (SLO), GAP-005 (referral programs — still a *blocking* human decision), GAP-006 (templates), GAP-008..010, GAP-014 as open; REQ-REFERRAL-007/REQ-NOTIFY-003 are PLANNED CURRENT/GAP | Freeze honesty: open product decisions that Phase 3 marked blocking/phasable are not visibly carried into the freeze candidate | Add one §8/§9 line: "PHASE-03 GAP-003..015 remain open/phased; referral program scope (GAP-005) requires the Phase-3 §5 product decision" | No | No |
| P5-04 | LOW | PHASE-01 §13 :183–184 and §5 :84 vs DECISION-01/02 (FROZEN) and REMAINING-DECISIONS §1A/§2 | Phase-5 itself is correct (multipart, decisions frozen) | Phase-1 gaps table still says access model "decision pending" and realtime "ADR pending"; REQ-RESUME-001 DB/API column still says "signed URL only" | Stale upstream rows can mislead Phase-6 catalog authors using Phase-1 as inventory | Update Phase-1 rows or add supersession notes pointing to DECISION-01/02 and the frozen multipart decision | No | No |
| P5-05 | LOW | REMAINING-DECISIONS §1B :97–99 vs §1B :69–95 and §5 :149–152 | Phase-5 §4/§6 adopt the frozen guest paths and stage table | The same document's tail still lists "guest API paths" and "final two-track UI stage table" as open even though §1B/§5 freeze them | Internal contradiction in a cited authority; could cause Phase 6 to re-open settled items | Delete/rewrite the stale tail sentence to list only the genuinely open items (per-code details schemas, idempotency retention, numeric rate limits, field-by-field allowlist) | No | No |
| P5-06 | LOW | PHASE-02 §7 :92 | Phase-5 uses the correct event name | Phase-2 prints `security-scan.requested` (dash); contract/registry name is `security.scan.requested` | Wrong event names break route matching in catalog/tests | Fix the typo to `security.scan.requested` | No | No |
| P5-07 | LOW | PHASE-03 GAP-007 :128–130 | Phase-5 does not repeat the claim | GAP-007 says saved-candidates "remaining work is the SQL model", but the baseline now contains the table/constraint/RLS/index; only APIs/UI/tests remain | Stale gap classification overstates remaining DB work | Update GAP-007: SQL model complete; NestJS APIs/UI/tests remain | No | No |
| P5-08 | LOW | PHASE-05 §3 (upload bullet) vs REMAINING-DECISIONS §1B/§5, `09_applications.sql:503`, `17_rls.sql:234–236` | Guest ownership rules only implied via "guest/session ownership" bullet | Baseline enforces active/unexpired/not-revoked sessions and a service-role-only consume function | Freeze doc should state the guest invariant in one line so catalog authors cannot weaken it | Add: "guest session must be active, unexpired and not revoked; consumption only via service-role `consume_guest_upload_session`" | No | No |
| P5-09 | LOW (review quality) | `s1/phase5/antigravity-phase5-final-requirements-validation.md` FIX-02, §2, §3 | Prior review recommends adding `POST /api/v1/candidates/claim-guest-session` and cites `03_auth.sql` | Frozen guest claim path is `POST /api/v1/guest/claims` (REMAINING-DECISIONS §1B); actual file is `03_users_auth.sql`; prior review also missed P5-01/P5-02 and its saved_candidates "VERIFIED" row does not address the §2 omission | Adopting FIX-02 would invent an API path, violating AGENTS.md "missing requirement invent न करें"; prior approval cannot be inherited blindly | Reject FIX-02; keep only the frozen six guest paths; treat the prior review as evidence input only | No | No |
| P5-10 | LOW | PHASE-05 §§2, 8 vs Product §6/§16, Phase-1 §10 | Admin/analytics/feedback/subscription domains not placed | These are PLANNED (not REQUIRED) in Phase 1; Product §6 admin is PLANNED | Freeze document should explicitly locate them (excluded/phased) to satisfy "future requirements excluded or clearly marked" | One §8 line: analytics/feedback/subscriptions/admin modules remain PLANNED scope per Phase-1 §10 | No | No |

## 11. Required corrections (before `FINAL REQUIREMENTS FROZEN`)

1. **P5-01** — add saved candidates to PHASE-05 §2 scope.
2. **P5-02** — carry the compensating cleanup event into PHASE-05 (§3 + §9) with a contract task or explicit phased-gap record.
3. **P5-03** — add explicit carry-over line for PHASE-03 GAP-003..015, naming GAP-005 as the still-open product decision.
4. **P5-08 / P5-10** — two one-line clarifications (guest invariant; PLANNED domains).
5. Upstream hygiene (P5-04, P5-05, P5-06, P5-07) — fix stale rows/typos in Phase-1/2/3 and REMAINING-DECISIONS tail; not freeze-blocking but should be done before Phase 6 to avoid propagating stale facts.

## 12. Phase 6 blockers

- No finding in this audit blocks starting the Phase 6 API catalog draft; all MEDIUM items are
  additive clarifications that Phase 6 itself needs (cleanup consumer entry, saved-candidates
  endpoints, explicit phased-gap list).
- Phase 6 remains bound by the already-tracked items in PHASE-05 §9 (DTOs, idempotency
  persistence, allowlists, numeric rate limits, guest token transport, application-resume DTOs,
  full catalog coverage) plus the consolidated DTO review's open items.
- Antigravity FIX-02 must NOT enter Phase 6 (invented path).

## 13. Coding authorization status

`CODING NOT AUTHORIZED` is **correct and remains in force**. PLAN §14 requires Phase 6–8
deliverables plus independent review before `READY FOR IMPLEMENTATION`; none of those exist yet.
No finding in this audit changes that gate. No runtime tests were executed during this audit, so
no test-based authorization claim is made.

### Honesty of the declared status

`FREEZE CANDIDATE — API CATALOG BLOCKERS TRACKED — CODING NOT AUTHORIZED`

- **FREEZE CANDIDATE** — honest: the document is structurally complete and accurate, but exit
  criterion "every required requirement ID has a source and owner" is not fully met until P5-01/P5-02/P5-03 are fixed.
- **API CATALOG BLOCKERS TRACKED** — honest: §9's seven blockers match the consolidated DTO
  review's open items and REMAINING-DECISIONS open list (with the additions noted in P5-02/P5-03).
- **CODING NOT AUTHORIZED** — honest and consistent with PLAN §14.

## 14. Final verdict

### APPROVED WITH MINOR FIXES

Phase 5 is accurate on every verifiable security, transactional, state-machine, async and
realtime claim; it invents nothing and hides no known conflict of its own. It is **not yet**
`FINAL REQUIREMENTS FROZEN` because of three MEDIUM completeness items (P5-01, P5-02, P5-03) and
associated upstream staleness (P5-04..P5-07). After the corrections in section 11 are applied and
re-verified, the document may be promoted to `FINAL REQUIREMENTS FROZEN`. Phase 6 catalog drafting
may proceed in parallel; coding remains NOT AUTHORIZED.
