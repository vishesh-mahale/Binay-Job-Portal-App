# Phase 5 Final Requirements — RE-VALIDATION Report

**Audit target:** `04-nestjs-api/PHASE-05-FINAL-REQUIREMENTS.md` (corrected, 26-08-2026 18:22, 11016 bytes)
**Auditor:** Cadence (Senior Product Architect, NestJS Architect, PostgreSQL/RLS Reviewer, Distributed-Systems Engineer)
**Date:** 2026-08-26
**Report:** `04-nestjs-api/04-nestjs-api-app/s1/phase5/cadence-phase5-revalidation.md`
**Type:** RE-VALIDATION after corrections (not a first review)

> Method notice — **independent re-approval.** I re-read the corrected `PHASE-05` from disk and
> cross-checked every claim against the executable SQL baseline, the shared contracts, the
> dispatcher route registry, the FastAPI worker docs and Phase-1..4. I did **not** inherit or
> blindly copy the earlier `antigravity` revalidation (it claims `PASS — FINAL REQUIREMENTS
> FROZEN` with "ZERO issues"; my own note shows two traceability items it did not flag — see
> Issues RV-1/RV-2). No automated test was executed in this environment (PowerShell execution
> policy blocks `npm.ps1`); **no test is asserted as passed**. All findings below are static-source
> cross-checks.

---

## 1. Final Verdict

### `PASS WITH MINOR FIXES`

The corrections fixed **all previously reported significant findings** and introduced **no
regressions**. The updated document is an accurate, honest and disciplined freeze candidate:

- `REQ-SAVED-CANDIDATE-001` is now plainly current scope (§2 bullet + Requirement-ID index row).
- A complete Requirement-ID coverage index was added and is **verified accurate** against
  Phase-1 (`REQ-CANDIDATE-001..006`, `REQ-INTERVIEW-001..003`, `REQ-MESSAGE-001`,
  `REQ-NOTIFY-001..003`, `REQ-REALTIME-001`, `REQ-ANALYTICS-001`, `REQ-SAVED-CANDIDATE-001`,
  etc. all exist in `PHASE_01`).
- §3 explicitly separates `UserContextClient`+RLS reads / `SystemClient`+ownership for
  document/parsing reads / trusted business writes.
- §8 now references `GAP-003..015`; §9 adds a blocker for requirement-by-requirement review of
  Phase-3/4.
- §9A lists **exactly the seven** dispatcher input routes present in
  `event-route.registry.ts`, correctly treats `application.status.changed` as a phased gap, and
  correctly leaves worker outputs (`candidate.projection.rebuilt`, `candidate.resume.parsed`) out
  of the input-route list.
- §6 supplies deterministic two-track (security + parsing) UI-stage derivation.

I am **not** declaring `FINAL REQUIREMENTS FROZEN`, consistently with the document's own
status (still `FREEZE CANDIDATE`) and its open §9 blockers. Two LOW traceability notes remain
(orphan-object sweeper and the G-1 contract-envelope reconciliation / `application.status.changed`
contract-file gap) that should be recorded before declaring freeze; they block neither Phase 6 nor
coding.

---

## 2. Files & sources inspected (re-verified)

1. `AGENTS.md`
2. `04-nestjs-api/PHASE-01-REQUIREMENTS-CONSOLIDATION.md`
3. `04-nestjs-api/PHASE-02-REQUIREMENTS-TRACEABILITY-MATRIX.md`
4. `04-nestjs-api/PHASE-03-GAP-CONFLICT-ANALYSIS.md`
5. `04-nestjs-api/PHASE-04-STATE-MACHINES-AND-TRANSACTIONS.md`
6. `04-nestjs-api/PLAN-REQUIREMENTS-TO-IMPLEMENTATION-HINGLISH.md`
7. `04-nestjs-api/DECISION-01-NESTJS-SUPABASE-ACCESS-MODEL-HINGLISH.md`
8. `04-nestjs-api/DECISION-02-REALTIME-TRANSPORT-HINGLISH.md`
9. `04-nestjs-api/04-nestjs-api-app/s1/codex/STAGE-03-REMAINING-DECISIONS.md`
10. `04-nestjs-api/04-nestjs-api-app/s1/codex/STAGE-03-NESTJS-API-REQUIREMENTS-SYNC.md`
11. `02-database/migrations/baseline/*.sql` (02, 03, 04, 06, 07, 08, 09, 10, 11, 12, 15, 17, 18)
12. `contracts/events/*` and `contracts/tasks/*`
13. `05-outbox-dispatcher-nestjs/src/routing/event-route.registry.ts`
14. `07-fastapi-ai-worker/` (README + task-handler evidence)
15. `04-nestjs-api/04-nestjs-api-app/s1/phase5/antigravity-phase5-revalidation.md` (prior re-approval — read and re-verified, not inherited)
---

## 3. Verification matrix (14 points)

| # | Verification criterion | Evidence (file / section) | Result |
|---|---|---|---|
| 1 | All REQUIRED Phase-1 requirement groups / `REQ-*` IDs represented or linked | §2 Requirement-ID coverage index lists `REQ-PLATFORM-001..008`, `REQ-AUTH-001..007`, `REQ-COMPANY-001..005`, `REQ-ONBOARDING-001`, `REQ-CANDIDATE-001..006`, `REQ-RESUME-001..007`, `REQ-JOB-001..003`, `REQ-SEARCH-001..005`, `REQ-APPLICATION-001..007`, `REQ-REFERRAL-001..007`, `REQ-INTERVIEW-001..003`, `REQ-MESSAGE-001`, `REQ-NOTIFY-001..003`, `REQ-REALTIME-001`, `REQ-SAVED-CANDIDATE-001`, `REQ-ANALYTICS-001`, `REQ-FEEDBACK-001`, `REQ-SUBSCRIPTION-001`, `REQ-AI-001..004`, `REQ-API-001..007` | PASS |
| 2 | `REQ-SAVED-CANDIDATE-001` is current scope | §2 bullet "recruiter saved-candidates bookmarks (private per HR/employer and non-job-specific)"; index row "Current/frozen policy; Phase 6 CRUD catalog" | PASS |
| 3 | Phase-3 gaps/conflicts and Phase-4 state machines honestly carried forward | §8 "Phase-3 gaps `GAP-003..015` remain individually classified as phased/open"; §9 item 8 (requirement-by-requirement review of Phase-3 gaps/conflicts and Phase-4 transitions); §3 transaction/terminal rules | PASS |
| 4 | RLS wording separates UserContextClient reads / SystemClient document-parsing reads / trusted writes | §3 Access model: "Approved personal/catalog reads use `UserContextClient` with existing RLS SELECT policies"; "`uploaded_documents`, `resume_parsing_jobs` and `resume_parsed_data` have no authenticated direct read path; reads use `SystemClient` plus NestJS ownership checks"; "Business writes and system/background work use the trusted server path with explicit NestJS authorization/ownership checks" | PASS |
| 5 | Upload is NestJS-mediated multipart | §3 Upload: "Browser uploads multipart data to NestJS; direct browser-to-Supabase Storage is prohibited"; NestJS auth/guest/ownership/size/type/extension/magic-byte/checksum validation | PASS |
| 6 | Validation synchronous; ClamAV async | §3: NestJS synchronous validation list; "ClamAV/security scanning is asynchronous; upload response does not wait for a full scan"; "Only clean documents may enter parsing" | PASS |
| 7 | Seven dispatcher input routes are accurate | §9A lists: `resume.parse.requested`, `candidate.profile.changed`, `job.ai.enrichment.requested`, `match.analyze.requested`, `interview.summary.requested`, `job.screening_questions.requested`, `security.scan.requested`. Matches `event-route.registry.ts` ALL_ROUTES (count = 7) | PASS |
| 8 | `application.status.changed` documented as expected phased gap | §9A: "has no dispatcher route; it is an expected phased gap, not an invented route". CORRECT — emitted by `change_application_status` in `09_applications.sql` L639-641 | PASS |
| 9 | Worker output events not presented as dispatcher inputs | §9A: "Output events such as `candidate.projection.rebuilt` and `candidate.resume.parsed` are worker outputs, not dispatcher inputs" | PASS |
| 10 | UI stages derive from both DB status tracks | §6: deterministic derivation from `security_scan_status` (pending/scanning→upload/scanning; infected/quarantined→rejected; failed→retryable; clean-only for parsing) and `processing_status` (queued/processing→stages; completed→review-ready; partial→partial; failed→parsing-failed) with security precedence | PASS |
| 11 | Current/future/planned/unresolved not silently merged | §2 index marks each track (e.g., "Planned/gap or future provider work", "Current/frozen policy", "clarification"); §8 explicitly isolates future/excluded classes | PASS |
| 12 | Phase-3 `GAP-003..015` treatment visible and honest | §8 references GAP-003..015 as individually classified; §9 item 8 adds explicit review blocker | PASS |
| 13 | Exit criteria sufficient before `FINAL REQUIREMENTS FROZEN` | §10 lists source+owner per REQ, DB-write owner, event contract/consumer or phased-gap record, security/RLS/negative documented, blockers resolved-or-assigned, independent verification of Phase 1-4 + baseline | PASS (with note RV-4) |
| 14 | Coding remains blocked until exit criteria pass | Status line + §10 "Until then: CODING NOT AUTHORIZED"; PLAN §14 additionally gates coding on Phase 6/7/8 + independent review | PASS |

## 4. Regression check — earlier findings vs corrected document

| Earlier finding (Cadence v1 / qoder) | Corrected? | Evidence |
|---|---|---|
| `saved_candidates` missing from §2 overview | ✅ Fixed | §2 bullet + index row present |
| PLANNED/GAP domains not enumerated | ✅ Fixed | §2 index rows "Analytics/feedback/subscription … Planned/gap or future provider work", "AI … Planned/direction" |
| Phase-3 gaps not visible | ✅ Fixed | §8 `GAP-003..015` reference |
| Phase-4 review not tracked | ✅ Fixed | §9 item 8 |
| Two-track UI derivation absent | ✅ Fixed | §6 derivation paragraph |
| Dispatcher route coverage absent | ✅ Fixed | §9A (7 routes) |
| Worker outputs / `application.status.changed` boundary not addressed | ✅ Fixed | §9A |
| Orphan-object compensating-cleanup sweeper not named | ⚠️ Partial | §9 item 8 covers "gaps/conflicts" generically but does not name it (RV-1) |
| G-1 contract-envelope reconciliation not recorded | ⚠️ Not explicit | §9A/§9 do not name Gate G-1 / flat-envelope drift (RV-2) |

No regression introduced by the corrections.
---

## 5. Issue register

### RV-1 — LOW — Upload-object compensating-cleanup sweeper not explicitly recorded
- **File/section:** `PHASE-05-FINAL-REQUIREMENTS.md` §3 (upload) / §9 (blockers).
- **What PHASE-05 says:** §9 item 8 requires "requirement-by-requirement review of Phase-3
  gaps/conflicts and Phase-4 state transitions", but does not name the object-orphan cleanup path.
- **Evidence (source of truth):** `STAGE-03-NESTJS-API-REQUIREMENTS-SYNC.md` §8 item 7 and
  `STAGE-03-REMAINING-DECISIONS.md` §9 state the compensating cleanup event is an **approved
  requirement** and only sweeper ownership/timing remain open.
- **Impact:** the async object written before the metadata transaction commits can orphan on rollback;
  that approved-but-open async item should carry an explicit phased-gap record per §10 exit criteria.
- **Recommended correction:** add one §9 bullet: "upload object-cleanup / orphan sweeper ownership &
  timing (approved compensating cleanup event) — phased gap".
- **Blocks Phase 6:** No. **Blocks coding:** No.

### RV-2 — LOW (traceability) — G-1 contract-envelope reconciliation / `application.status.changed` contract file
- **File/section:** `PHASE-05-FINAL-REQUIREMENTS.md` §9A, §9.
- **What PHASE-05 says:** lists 7 routes and notes `application.status.changed` as a phased gap,
  but does not record that (a) `resume-parse-requested.v1.json` and `candidate-profile-changed.v1.json`
  use a flat draft-07 envelope that differs from the DB `outbox_events` envelope, or (b)
  `application.status.changed` has **no contract file** yet.
- **Evidence (source of truth):** the two flat-envelope contracts vs the 2020-12-envelope
  `security-scan-requested.v1`/`application-submitted.v1`; dispatcher README keeps Gate **G-1
  (event-contract reconciliation) OPEN**; `contracts/events/` contains no
  `application-status-changed.v1.json`.
- **Impact:** "every async event has an existing contract and consumer or phased gap" is only fully
  honest if the flat-envelope producer events are reconciled (G-1) and any contract-file gaps are
  flagged.
- **Recommended correction:** add a §9A/§9 line: "reconcile `resume-parse-requested.v1` and
  `candidate-profile-changed.v1` envelopes to the outbox envelope (Gate G-1); add a contract file for
  `application.status.changed` before routing".
- **Blocks Phase 6:** No (Phase 6 must close it before the confirm producer is coded).
  **Blocks coding:** No.

### RV-3 — LOW (informational) — §9A describes registry-level routes, not proven E2E delivery
- **File/section:** `PHASE-05-FINAL-REQUIREMENTS.md` §9A.
- **What PHASE-05 says:** "Current registered dispatcher input routes are: [7]".
- **Evidence (source of truth):** the 7 routes are registered in `event-route.registry.ts`
  (ALL_ROUTES), but the dispatcher README lists open gates: G-1 contract reconciliation,
  `CloudTasksPublisher` implementation, IAM (G-3), Cloud Run ingress (G-4). Registry-registered ≠
  live E2E delivery.
- **Impact:** a reader must not conclude background routing is already end-to-end operational.
- **Recommended correction:** keep §9A as-is (it says "registered"), optionally add "registry-registered;
  dispatcher production delivery (G-3 CloudTasksPublisher) is dispatcher scope" for clarity.
- **Blocks Phase 6:** No. **Blocks coding:** No.

### RV-4 — INFO — Freeze is gated on the document's own blocker list; do not mark FROZEN early
- **File/section:** `PHASE-05-FINAL-REQUIREMENTS.md` §9 (8 items) and §10.
- **What PHASE-05 says:** blockers (DTOs, idempotency retention, confirm allowlist, rate limits,
  guest transport, app-specific resume DTOs, full API catalog coverage, Phase-3/4 review) are "not
  silently decided in this document", and §10 defines freeze conditions.
- **Impact:** the doc intentionally remains `FREEZE CANDIDATE`; declaring `FINAL REQUIREMENTS
  FROZEN` now (as the prior antigravity revalidation did) overstates readiness before blocker #8 is
  performed and the others are assigned to Phase 6 with a decision record.
- **Recommended correction:** transition to `FINAL REQUIREMENTS FROZEN` only after: (a) the §9
  blockers are explicitly assigned to Phase 6 with owners, (b) RV-1/RV-2 (optional) are recorded,
  (c) a human accepts this re-validation, (d) Phase 6/7/8 + independent review complete per PLAN §14.
- **Blocks Phase 6:** No. **Blocks coding:** Not by itself — coding is already gated by PLAN §14.

---

## 6. Phase 6 blocker status

- **None of RV-1..RV-4 blocks Phase 6.** Phase 6 may proceed and must author the API catalog
  (including `saved_candidates` CRUD, application-specific resume DTOs, rate-limit values, guest
  token transport, and the envelope/G-1 reconciliation for the confirm producer).

## 7. Coding authorization status

- Declared status verified **HONEST**: `FREEZE CANDIDATE — API CATALOG BLOCKERS TRACKED —
  CODING NOT AUTHORIZED`.
- Coding must remain **blocked** until, at a minimum, Phase 6 (complete API catalog) and Phase 7/8
  (architecture + implementation plan) plus independent review are approved and the §9-issue items
  are closed (PLAN §14). PHASE-05 does not authorize coding; it explicitly forbids it until §10
  passes.

## 8. Final verdict

### `PASS WITH MINOR FIXES`

- All 14 verification criteria PASS.
- All significant prior findings are correctly fixed; **no regressions**.
- Two LOW traceability notes (RV-1 orphan sweeper; RV-2 G-1 envelope + `application.status.changed`
  contract file) are recommended for a one-line record to make §10 exit criteria fully provable.
- The document should **not yet** be declared `FINAL REQUIREMENTS FROZEN` (kept as `FREEZE
  CANDIDATE`) until §9 blockers are resolved/owner-assigned and human + independent reviews accept —
  this is the document's own stated discipline, and it differs from the prior `antigravity`
  revalidation conclusion.
- Test evidence: none executed in this environment (static-source cross-checks only).