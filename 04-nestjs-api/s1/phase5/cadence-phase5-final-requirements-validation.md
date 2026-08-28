# Phase 5 Final Requirements Validation Report

**Audit target:** `04-nestjs-api/PHASE-05-FINAL-REQUIREMENTS.md`
**Auditor:** Cadence (Senior Product Architect, NestJS Architect, PostgreSQL Security Reviewer, Distributed-Systems Engineer)
**Date:** 2026-08-26
**Report:** `04-nestjs-api/04-nestjs-api-app/s1/phase5/cadence-phase5-final-requirements-validation.md`

> Method notice: This is an **independent** audit. I re-read every listed source from disk and
> cross-checked every PHASE-05 claim against the executable SQL baseline, the shared contracts,
> the dispatcher registry and the FastAPI worker docs. I did **not** blindly approve prior agent
> reviews (the existing `antigravity-*` phase5 report was read and its claims re-verified; see
> Issue 05). No automated test was executed in this environment (PowerShell execution policy
> blocked `npm.ps1`; a direct `jest` invocation on `src/routing/routing.spec.ts` exceeded the 30 s
> command budget). Therefore **no test result is asserted as passed** here. All findings below are
> documentary cross-checks against static truth.

---

## 1. Executive Verdict

### RECOMMENDED: `CONDITIONAL PASS`

`PHASE-05-FINAL-REQUIREMENTS.md` is substantively accurate and honest: the status line
`FREEZE CANDIDATE — API CATALOG BLOCKERS TRACKED — CODING NOT AUTHORIZED` is a **true
representation** of the document's own scope and of the repository state. It does not invent
tables/columns/enums, it does not authorize premature coding, it keeps exact DTO/error detail
work in Phase 6, it defers unapproved/future items to §8, and it tracks 7 explicit blockers in §9.
The controlled-hybrid access model, the SSE/REST-recovery rule, the transactional-outbox
invariant, the "clean-only parsing" rule, checksum deduplication, the 10-active-profile-resume
policy (PD-002) and the "application-only resume is not promoted" rule are all faithful to the
executable baseline, `DECISION-01/02/03/04` and the Stage-03 sync/decision docs.

It cannot be marked `FINAL REQUIREMENTS FROZEN` yet (and it does not claim to be). Three
corrective gaps must be recorded before final freeze; the §9 blocker list is **incomplete**
relative to its own §10 exit criteria:

- (1) §2 "current production scope" does not enumerate `saved_candidates`
  (REQ-SAVED-CANDIDATE-001, REQUIRED/FROZEN) in the overview bullet list (only §9#7 references it),
  and it does not enumerate PLANNED/GAP domains (analytics, subscriptions, admin, feedback,
  configurable referral programs, AI screening) in either the in-scope or excluded/future lists.
- (2) §9 omits the approved **object-upload compensating-cleanup sweeper ownership/timing**
  (STAGE-03 §7 and `STAGE-03-REMAINING-DECISIONS.md` §9), which §10 exit criteria
  ("every async event has existing consumer or explicit phased-gap record") require.
- (3) §3/§4/§7 rely on event contracts `resume-parse-requested.v1.json` and
  `candidate-profile-changed.v1.json` that use a **flat draft-07 envelope** that does not match
  the DB `outbox_events` envelope used by `security-scan-requested.v1.json` /
  `application-submitted.v1.json`. The dispatcher's Gate **G-1 (event-contract reconciliation) is
  OPEN**; PHASE-05 should not present these events as reconciled.

These are documentation/traceability defects, not architectural contradictions, so Phase 6
catalog work may proceed and coding stays unauthorized. **Designation: approved for Phase-6
eligibility subject to the corrections in §11-§13.**

---

## 2. Files & sources inspected

1. `AGENTS.md`
2. `04-nestjs-api/PLAN-REQUIREMENTS-TO-IMPLEMENTATION-HINGLISH.md`
3. `04-nestjs-api/PHASE-01-REQUIREMENTS-CONSOLIDATION.md`
4. `04-nestjs-api/PHASE-02-REQUIREMENTS-TRACEABILITY-MATRIX.md`
5. `04-nestjs-api/PHASE-03-GAP-CONFLICT-ANALYSIS.md`
6. `04-nestjs-api/PHASE-04-STATE-MACHINES-AND-TRANSACTIONS.md`
7. `04-nestjs-api/DECISION-01-NESTJS-SUPABASE-ACCESS-MODEL-HINGLISH.md`
8. `04-nestjs-api/DECISION-02-REALTIME-TRANSPORT-HINGLISH.md`
9. `04-nestjs-api/DECISION-04-SAVED-CANDIDATES-HINGLISH.md`
10. `04-nestjs-api/04-nestjs-api-app/s1/codex/STAGE-03-NESTJS-API-REQUIREMENTS-SYNC.md`
11. `04-nestjs-api/04-nestjs-api-app/s1/codex/STAGE-03-REMAINING-DECISIONS.md`
12. `02-database/migrations/baseline/02_enums.sql`, `06_documents.sql`,
    `07_resume_processing.sql`, `08_candidates.sql`, `09_applications.sql`,
    `15_infrastructure.sql`, `17_rls.sql`
13. `contracts/events/*` (incl. `security-scan-requested.v1.json`,
    `resume-parse-requested.v1.json`, `application-submitted.v1.json`,
    `candidate-profile-changed.v1.json`) and `contracts/tasks/*`
14. `05-outbox-dispatcher-nestjs/README.md`, `src/routing/event-route.registry.ts`,
    `src/routing/payload.builder.ts`
15. `07-fastapi-ai-worker/README.md`
16. `01-requirements/current/PRODUCT-REQUIREMENTS.md`,
    `01-requirements/product-decisions/PD-001..PD-004`
17. `04-nestjs-api/04-nestjs-api-app/s1/phase5/antigravity-phase5-final-requirements-validation.md`
    (prior review — read and re-verified, not trusted blindly)
---

## 3. Requirement coverage table

| Area | PHASE-05 representation (current doc) | Traceability source | Verdict |
|---|---|---|---|
| Identity/authentication | auth, guest/session ownership, UserContext/SystemClient split | `03_users_auth.sql`, `17_rls.sql`, DECISION-01, REQ-AUTH-001..007 | present |
| Companies & memberships | §2 "companies, memberships, departments, teams, ownership" | `04_companies.sql`, REQ-COMPANY-001..005 | present |
| Candidates & canonical profile | §2 "candidate canonical profile and profile-fact updates"; §7 confirm allowlist + revision | `08_candidates.sql`, PD-002, STAGE-03 | present |
| Resume upload / scan / parse | §3, §4, §6 fully | `06_documents.sql`, `07_resume_processing.sql`, DECISION-01, STAGE-03 sync | present |
| Jobs & search | §2 "jobs, search and saved jobs" | `05_jobs.sql`, REQ-JOB/SEARCH-* | present |
| Applications & immutable snapshots | §2 "applications, immutable snapshots, application-specific resumes" | `09_applications.sql`, PD-003, REQ-APPLICATION-* | present |
| Referrals | §2 "referrals" (manual); configurable programs (REQ-REFERRAL-007) NOT enumerated | `09_applications.sql`, REQ-REFERRAL-001..007 | partial (Issue 01) |
| Interviews | §9 blockers mention interviews | `10_interviews.sql`, REQ-INTERVIEW-* | referenced |
| Notifications | §2, §6; email routes excluded | `12_notifications.sql`, DECISION-02, GAP-015 | present (phased) |
| Messaging / chat | §2 "messaging", §3 realtime (WS chat) | `11_messaging.sql`, DECISION-02 | present |
| Saved jobs | §2 "saved jobs" | `09_applications.sql` | present |
| **Saved candidates** | **only §9 blocker #7** — NOT in §2 overview | REQ-SAVED-CANDIDATE-001 (REQUIRED/FROZEN), `09_applications.sql` (`saved_candidates` + RLS), DECISION-04 | gap in overview (Issue 01) |
| Realtime UI updates | §2, §3 (SSE) | DECISION-02, REQ-AUTH-007/REALTIME | present |
| Outbox / background | §2, §3; §5 envelopes | `15_infrastructure.sql`, dispatcher | present |
| Admin/system operations | only implicit ("system/background work trusts") | REQ-ADMIN/ANALYTICS are PLANNED/GAP | not enumerated (Issue 01) |

**Future/unresolved (correctly excluded or deferred):** email delivery & unapproved
notification routes (§8), fast-track name extraction (REQ-RESUME-007, NEEDS_DECISION, §8),
exact chat API (§8), events not in contracts/registry (§8) — all consistent with Phase 1/2 and
STAGE-03.

**Silently removed / compressed?** No REQUIRED requirement is represented as removed. The
REQUIRED/FROZEN `saved_candidates` is under-represented in the §2 overview (only §9#7), and
several PLANNED/GAP categories are absent from both the scope and exclude lists — a traceability
defect (Issue 01).

---

## 4. Domain coverage findings

- All 15 core functional domains named in the audit brief map to at least one requirement ID that
  exists in Phase 1/2 with backing SQL. The audit target is **not** silent on any one of them; its
  §2 overview omits *saved candidates* (REQUIRED) and does **not** state the status of *analytics,
  subscriptions, admin, feedback, configurable referral programs, AI-screening* (all
  PLANNED/GAP/OPEN). This is a traceability gap, not a deleted feature.
- Guest flow is covered (§4 guest paths); guest session XOR ownership, active/expire/revoke and
  pending→verified→merged claim semantics align with the approved DB rules
  (`guest_upload_session_status`, `guest_claim_status` enums; `validate_guest_*` guards).

---

## 5. Database / RLS findings

- **No invented table/column/function/enum.** All names PHASE-05 references
  (`uploaded_documents`, `resume_parsing_jobs`, `resume_parsed_data`, `candidate_profiles`,
  `candidate_search_profiles`, `application_documents`, `application_profile_snapshots`,
  `saved_candidates`, `guest_candidate_claims`, `notifications`, `messages`, `outbox_events`,
  `processed_events`, `security.scan.requested`, ...) exist in the executable baseline.
- **Owners:** every upload/scan/parse write has an owner (NestJS for metadata+outbox; FastAPI
  worker for scan/parse output) — consistent with `06_documents.sql` / `07_resume_processing.sql`
  header comments.
- **Access model (§3):** Browser→NestJS only; `UserContextClient`/`SystemClient` split; trusted
  system path for writes/workers — matches DECISION-01 and `17_rls.sql` (REVOKE ALL + selected
  grants; no direct authenticated DML).
- **RLS accuracy:** `17_rls.sql` does NOT grant `authenticated` SELECTs on `uploaded_documents` /
  `resume_parsing_*` (grants at lines 162-176 cover user/candidate/application/conversation rows
  only; documents & parsing stay in the service-only/default-deny block), so PHASE-05/STAGE-03
  correctly route those reads to `SystemClient`. `saved_candidates` has an owner-only SELECT
  policy (17_rls.sql lines 211-212). No policy contradicts the document.

---

## 6. State-machine / transaction findings

- PHASE-05 preserves the Phase-4 boundaries by reference (§3: "Business row, audit/history and
  outbox event commit atomically"; no external storage/tasks/AI within a transaction). Consistent
  with PHASE-04 §2 and the `outbox_events` lifecycle trigger
  (`enforce_outbox_event_lifecycle` in `15_infrastructure.sql`).
- Terminal-state invariants (terminal outbox rows immutable; `pending` insert-state enforcement;
  `status`/`retry_count` CHECKs) are honored and match PHASE-05's atomicity claims.
- "No Cloud Tasks/FastAPI/email inside an open DB transaction" is accurate; the FastAPI worker
  also runs provider calls outside its write transaction (worker README §2).
- Document state-machine transitions (pending→scanning→clean, queued→processing→completed) are
  correctly not re-invented; PHASE-05 delegates them to the §6 status derivation.
---

## 7. Async / event alignment findings

- All outbox events referenced by PHASE-05 have a contract file in `contracts/events/` and a task
  file (or FastAPI output event) in `contracts/tasks/`. The dispatcher registry
  (`event-route.registry.ts`) registers `security.scan.requested`, `resume.parse.requested`,
  `candidate.profile.changed`, `job.ai.enrichment.requested` (Phase-1) plus
  `match.analyze.requested`, `interview.summary.requested`, `job.screening_questions.requested`
  (Phase-2). `application.submitted` and `notification.email.requested` are intentionally **not**
  routed (phased gaps, consistent with PHASE-02 §17 and the registry header note).
- **trace_id / idempotency / processed-events:** `trace_id` travels inside
  `outbox_events.payload` (there is **no `trace_id` column** — chaining columns are
  `correlation_id`/`causation_id`; dispatcher rule `trace_id = correlation_id ?? event_id` in
  `payload.builder.ts`). PHASE-05 §3's wording ("trace_id in payloads; request_id HTTP/log only")
  is consistent with the schema and the dispatcher.
- **Contract-envelope inconsistency (Issue 03):** `security-scan-requested.v1.json` /
  `application-submitted.v1.json` use the 2020-12 envelope form
  (`required: [schema_version, event_id, aggregate_type, aggregate_id, event_type, payload,
  occurred_at]`), which matches the DB `outbox_events` columns. `resume-parse-requested.v1.json`
  and `candidate-profile-changed.v1.json` use a **flat draft-07** form
  (`required: [schema_version, event_id, aggregate_id, trace_id]`, top-level
  `document_id`/`requested_by` / `change_type`/`active_document_id`, no
  `payload`/`occurred_at`). The dispatcher README keeps Gate **G-1 (event-contract
  reconciliation) OPEN**; PHASE-05 does not record this gate or the two flat-envelope contracts.
- Outbox insert is atomic with business writes (PHASE-05 §3) — consistent with producer contract
  and `15_infrastructure.sql`; producer ownership (NestJS confirm, NestJS upload, FastAPI chained
  events) is correctly separated from the Dispatcher (no producer / no business logic per
  dispatcher README §1).

---

## 8. Security / privacy findings

- Upload is NestJS-mediated (multipart); browser never calls Supabase Storage/API; validation
  (auth, guest/session ownership, size/type/extension, magic bytes, checksum) precedes a private
  object write and an atomic metadata + `security.scan.requested` transaction (§3) — consistent
  with `06_documents.sql`, STAGE-03 §2 and §1B.
- Synchronous validation is separated from async ClamAV scanning; **only clean** documents enter
  parsing (`security.scan.requested` → clean-only `resume.parse.requested`, per STAGE-03 §6B and
  the worker's scanner-before-parse sequence).
- Guest session ownership/expiry/revocation rules are present and grounded in
  `guest_upload_sessions` (status enum, `expires_at`, `revoked_at`, `consumed_at`,
  `consume_guest_upload_session` service-only function in `17_rls.sql`).
- Protected data: raw resume text, raw AI output, artifacts, storage paths, tokens and scanner
  internals are not returned by default (§2/§5) — consistent with STAGE-03 §1B and §4.
- Application-only resumes do not promote to canonical profile/library (PD-002) — §7 correct.
- Low nuance: §5 maps `503` to dependency outage; that aligns with the "scanner unavailable" error
  family in STAGE-03 §8, but PHASE-05 should cross-reference the source (Issue 04).

---

## 9. Realtime behavior

- SSE = live optimization only; REST/database state remains authoritative after reconnect or
  missed events (§2, §6) — matches DECISION-02. WebSocket is correctly reserved for the
  separately-catalogued chat use case.
- Controlled page-scoped polling/manual refresh is only a fallback when realtime is disabled
  (DECISION-02 §6); no unconditional polling requirement is introduced by PHASE-05.
- Realtime payloads are sanitized nudges; no resume content/signed URLs/secrets (DECISION-02 §6).
- The §6 derived-stage list matches the frozen 9-state contract
  (`STAGE-03-REMAINING-DECISIONS` §1: `UPLOADED … PARSING_FAILED`); security precedence is correct.

---

## 10. Missing or conflicting requirements

1. No PHASE-01…04 requirement-to-requirement conflict was proven from the sources read; the docs
   are mutually consistent.
2. The real inconsistency is **contract-envelope drift** (Issue 03): two producer event contracts
   do not match the DB `outbox_events` envelope and Gate G-1 is open.
3. `saved_candidates` (REQUIRED/FROZEN) is under-weighted in the §2 overview (Issue 01).
4. PLANNED/GAP items (REQ-REFERRAL-007, analytics, feedback, subscriptions, AI-screening,
   search-provider) are neither "in scope" nor "excluded/future" in PHASE-05 — a reader cannot
   tell they are intentionally phased (Issue 01).
---

## 11. Required corrections (issue register)

### ISSUE-01 — MEDIUM
- **File/Section:** `PHASE-05-FINAL-REQUIREMENTS.md` §2, §8, §9.
- **What PHASE-05 says:** §2 lists identity, companies, candidates, resume,
  jobs/search/saved-jobs, applications, referrals/interviews/notifications/messaging, outbox,
  SSE, integration.
- **What the source of truth says:** `REQ-SAVED-CANDIDATE-001` is REQUIRED/FROZEN (PHASE-01
  §9/§15; `saved_candidates` table + RLS in `09_applications.sql`/`17_rls.sql`; DECISION-04), and
  REQ-REFERRAL-007 (PLANNED/GAP), REQ-ANALYTICS-001, REQ-FEEDBACK-001, REQ-SUBSCRIPTION-001,
  REQ-AI-001/002, REQ-SEARCH-005 exist as non-frozen scope.
- **Why it matters:** a REQUIRED domain is missing from the "current scope" summary and several
  non-frozen domains are not marked in/out of scope, so PHASE-05 does not fully satisfy its own
  §10 exit criterion ("every required ID has a source and owner").
- **Recommended correction:** add a `saved_candidates` bullet to §2; add a note in §8/§9
  enumerating REQ-REFERRAL-007, analytics, feedback, subscriptions, AI-screening, admin as
  PLANNED/GAP/PHASED (not frozen) with pointers to GAP-005/006/008/009/010/014.
- **Blocks Phase 6:** No. **Blocks coding:** No.

### ISSUE-02 — MEDIUM
- **File/Section:** `PHASE-05-FINAL-REQUIREMENTS.md` §3 (upload flow); missing from §9.
- **What PHASE-05 says:** nothing about upload-orphan cleanup.
- **What the source of truth says:** `STAGE-03-NESTJS-API-REQUIREMENTS-SYNC.md` §8 item 7 and
  `STAGE-03-REMAINING-DECISIONS.md` §9 — "the compensating cleanup event is an approved
  requirement; only sweeper/cleanup ownership & timing remain open" (orphan age threshold,
  `deleted_at`/retention interaction, storage deletion authorization).
- **Why it matters:** the private object is written before the metadata transaction commits, so a
  failed transaction leaves an orphan; PHASE-05 §10 exit criterion ("every async event has an
  existing consumer or explicit phased-gap record") is not satisfied unless this approved-but-open
  item is recorded.
- **Recommended correction:** add "upload object-cleanup/orphan sweeper ownership & timing" as an
  explicit phased-gap/blocker in §9.
- **Blocks Phase 6:** No (must be decided/tracked before FROZEN). **Blocks coding:** No.

### ISSUE-03 — HIGH (traceability; "all events contracted" overstatement)
- **File/Section:** `PHASE-05-FINAL-REQUIREMENTS.md` §3, §7 and §9.
- **What PHASE-05 says:** implies producer events are approved/aligned; §9 does not record a
  contract-envelope gate.
- **What the source of truth says:** `contracts/events/resume-parse-requested.v1.json` and
  `candidate-profile-changed.v1.json` are flat draft-07 envelopes
  (`required: [schema_version, event_id, aggregate_id, trace_id]`, no `payload`/`occurred_at`),
  whereas `security-scan-requested.v1.json` / `application-submitted.v1.json` match the DB
  `outbox_events` envelope. Dispatcher README marks Gate **G-1 (event-contract reconciliation)
  OPEN**; stage-2/stage-3 contract reviews confirm G-1 pending.
- **Why it matters:** the confirm-side producer must emit one of these event shapes; without
  recording the G-1 gate, PHASE-05 overstates "all events have existing contract" and the Phase-6
  catalog could pick an envelope that does not match the DB.
- **Recommended correction:** add a §9 blocker/phased-gap item: "reconcile
  `resume-parse-requested.v1` and `candidate-profile-changed.v1` envelopes to the outbox envelope
  (dispatcher Gate G-1 closure) before producer freeze".
- **Blocks Phase 6:** No (Phase 6 must resolve it before the confirm producer is coded).
  **Blocks coding:** No (coding not authorized anyway).
### ISSUE-04 — LOW
- **File/Section:** `PHASE-05-FINAL-REQUIREMENTS.md` §5 ("dependency outage is 503").
- **What the source of truth says:** STAGE-03 §8 defines an error family "scanner unavailable"
  and rate-limit `429`, but the synced sources do not fix numeric statuses for dependency outages.
- **Why it matters:** the number is reasonable but uncited; leaving it uncited invites the same
  "invented" criticism the document tries to avoid.
- **Recommended correction:** cross-reference the error-family table / mark the 503 mapping as a
  Phase-6 code decision.
- **Blocks Phase 6 / coding:** No.

### ISSUE-05 — LOW (governance; prior review is stale)
- **What PHASE-05 already contains:** `201` new upload / `200` checksum reuse (§5) and the full
  guest path set (§4) including `POST /api/v1/guest/claims`.
- **What the prior review says:** `antigravity-phase5-final-requirements-validation.md` lists
  these as its only two missing "LOW fixes" (FIX-01, FIX-02).
- **Why it matters:** the prior review was written against an older snapshot; its "fixes" are
  already satisfied, so it must not be blindly approved or re-applied. This validates the
  instruction to not trust previous agent reviews.
- **Recommended correction:** supersede/reference the stale fixes as resolved in the current
  PHASE-05.
- **Blocks Phase 6 / coding:** No.

---

## 12. Phase 6 blockers

- PHASE-05's own 7 blockers are correct and complete for the first-resume/guest flow.
- Add the 3 items from Issues 01-03 (saved-candidates/PLANNED-GAP enumeration; orphan-cleanup
  sweeper phased-gap; G-1 contract-envelope reconciliation) to the §9 list so the §10 exit
  criteria are actually provable.
- Phase 6 catalog work can start now; it must resolve Issue 03 before the confirm-side producer
  and Issue 02 before upload goes to production.

---

## 13. Coding authorization status

- The declared status is **HONEST**:
  `FREEZE CANDIDATE — API CATALOG BLOCKERS TRACKED — CODING NOT AUTHORIZED`.
- PHASE-05 does not authorize coding; §10 explicitly gates `FINAL REQUIREMENTS FROZEN` on
  ownership/event/security completeness and independent review, and the PLAN (§14) additionally
  gates coding on Phase 6 (API catalog), Phase 7 (architecture), Phase 8 (implementation plan)
  and independent review. Since Phase 1-4 are still DRAFTS and Issues 01-03 remain, **CODING MUST
  STAY PROHIBITED**.

---

## 14. Final verdict

**`CONDITIONAL PASS` (approve-as-candidate; NOT `FINAL REQUIREMENTS FROZEN`).**

The document is an accurate and honest freeze *candidate*: no invented schema/contract, correct
access model, correct transaction/outbox semantics, correct security/scan/parse ordering, correct
realtime role, correct exclusion of future scope, and a truthful non-authorization of coding.
It may proceed to Phase 6, provided Issues 01-03 are recorded (and Issue 04 annotated) so the
document's own exit criteria become verifiable.

- **Blocks `FINAL REQUIREMENTS FROZEN`:** Yes (Issues 01-03 must be fixed or explicitly assigned).
- **Blocks Phase-6 API catalog:** No.
- **Blocks coding execution:** Yes (coding not authorized in any scenario until Phase 6/7/8 gates).
- **Test evidence:** None executed in this environment; all findings are static-source
  cross-checks (see Method notice).