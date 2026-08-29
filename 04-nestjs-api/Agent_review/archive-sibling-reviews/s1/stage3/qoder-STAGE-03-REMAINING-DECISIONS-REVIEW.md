# Stage-03 Remaining Decisions Review

Reviewer: qoder (independent Senior NestJS API Architect + Product-Technical Reviewer)

File under review: `04-nestjs-api/04-nestjs-api-app/s1/codex/STAGE-03-REMAINING-DECISIONS.md`
(149 lines, `DECISIONS PENDING — NO CODE`, decisions D-1..D-10 + decision-record template)

Review date: 2026-08-26

Method: every claim cross-checked against executable SQL, frozen decisions, contracts,
dispatcher registry and FastAPI worker code. Frozen decisions were not reopened; product and
technical decisions are classified separately. "Approved" is used only where source evidence
exists.

## 1. Final verdict

**APPROVED WITH CHANGES**

The decisions file is well-structured, invents no numbers/DTOs/rules, correctly keeps frozen
decisions closed (SSE/REST split, compensating cleanup event, 409 rule, security direction),
and correctly separates agent-reviewable items from user/business decisions. However:

- it uses `/api/v1/...` paths as if the prefix were frozen (it is not — consolidated review
  S3-C-07 explicitly requires recording it as a convention decision first);
- it omits six decisions/constraints that the consolidated review and the executable baseline
  require (active-profile selection DTO, two-track status mapping, library limit, confirm event
  field usage, trusted-access constraint, notification behavior);
- the upload-handshake section presents multipart and storage-handshake as equally open without
  citing the signed-URL APPROVED DIRECTION evidence that favors the handshake option.

## 2. Sources verified

| Source | Sections/objects used |
|---|---|
| `AGENTS.md` | conflict-reporting (:17-22), contracts in `contracts/` (:44), no resume content in repo (:47) |
| `04-nestjs-api/PLAN-REQUIREMENTS-TO-IMPLEMENTATION-HINGLISH.md` | authority order (:19-36), REQ-* scheme (:145-163), Phase-1 fields incl. Idempotency/Rate limit/Audit (:165-183), decision-record expectations (:227-243) |
| `s1/codex/STAGE-03-NESTJS-API-REQUIREMENTS-SYNC.md` | four-API draft under the decisions (205 lines) |
| `s1/codex/STAGE-03-CONSOLIDATED-API-SYNC-REVIEW.md` | S3-C-01..S3-C-10 corrections; consolidated open decisions list (:178-190); rejected/downgraded findings (:150-167) |
| `s1/stage3/qoder-STAGE-03-API-SYNC-REVIEW.md` | prior independent findings S3-01..S3-14 (note: file is 32 KB on disk; consolidated review's "empty file" observation is stale) |
| `04-nestjs-api/DECISION-01-NESTJS-SUPABASE-ACCESS-MODEL-HINGLISH.md` | FROZEN controlled-hybrid; UserContextClient/SystemClient separation; candidate writes trusted-only (:74, :130-139) |
| `04-nestjs-api/DECISION-02-REALTIME-TRANSPORT-HINGLISH.md` | FROZEN SSE = live optimization, REST/DB authoritative; sanitized nudges only (:52); endpoint/DTO delegated to API catalog (:74) |
| `04-nestjs-api/PHASE-01-REQUIREMENTS-CONSOLIDATION.md` | REQ-RESUME-001 "signed URL only" APPROVED DIRECTION (:84); REQ-RESUME-006 (:89); REQ-RESUME-007 NEEDS_DECISION (:90) |
| `04-nestjs-api/PHASE-04-STATE-MACHINES-AND-TRANSACTIONS.md` | §6.2 guest session active/consumed/expired/revoked (:93-103); §6.3 parsing machine (:105-117); §8.1 application TX + snapshot (:140-142); §8.2 guest claim machine (:144-155) |
| `04-nestjs-api/NESTJS-IMPLEMENTATION-GUIDE.md` | §5 transaction rule (:188-202); §6 profile save incl. FOR UPDATE, expected revision, 409, history, server-owned fields (:204-234); §8 upload rules incl. checksum reuse :264, compensating cleanup event :267, signed URL :268; §9 scan/parse chain (:272-301); §10 evidence (:303-316); §11 application submission (:318-330) |
| `01-requirements/product-decisions/PD-002-ACTIVE-RESUME-SEARCH.md` | upload-time active-profile selection (:61-82); 10-resume library limit + soft archive (:25-50); application-only non-promotion (:52-59) |
| `02-database/migrations/baseline/02_enums.sql` | `security_scan_status`, `resume_processing_status` (:302-311), `parsing_job_status`, `document_role`, `guest_claim_status` |
| `02-database/migrations/baseline/06_documents.sql` | `guest_upload_sessions` limits (max_upload_count=3, max_total_bytes=31457280) (:39-59); `uploaded_documents` incl. XOR owner check, defaults (:72-106); physical purge reserved (:116-117) |
| `02-database/migrations/baseline/07_resume_processing.sql` | `resume_parsing_jobs.idempotency_key` UNIQUE (:50); immutable result rows (:136-146) |
| `02-database/migrations/baseline/08_candidates.sql` | one-logical-save rule (:33); `bump_candidate_profile_revision` (:89-109); `candidate_profile_documents` one-current-role (:111-125); canonical fact tables; `profile_change_history` operation incl. `confirm` (:472-491) |
| `02-database/migrations/baseline/09_applications.sql` | `application_documents` (:130-136); `application_profile_snapshots` (:138+) |
| `02-database/migrations/baseline/12_notifications.sql` | `notification_templates`, `user_notification_preferences`, `notifications`, `notification_delivery_log`, `device_tokens` (:33-268) — in-app notification baseline exists |
| `02-database/migrations/baseline/15_infrastructure.sql` | `outbox_events` envelope; `processed_events` idempotency pattern |
| `02-database/migrations/baseline/17_rls.sql` | REVOKE ALL anon/authenticated (:151-152); no authenticated SELECT grants for document/parsing tables (:162-176); `consume_guest_upload_session` service_role-only (:234-237) |
| `contracts/events/candidate-profile-changed.v1.json` | required `schema_version/event_id/aggregate_id/trace_id`; `change_type` enum `profile_updated/document_linked/document_unlinked`; `active_document_id` |
| `contracts/events/candidate-resume-parsed.v1.json` | current version requires `event_id` and `occurred_at` (:7) — Stage-2 F-01 blocker RESOLVED |
| `contracts/events/security-scan-requested.v1.json`, `contracts/tasks/security-scan-task.v1.json` | document-id-only payload; uniform 4-field task |
| `05-outbox-dispatcher-nestjs/src/routing/event-route.registry.ts` | routes: security.scan.requested (:79-84), resume.parse.requested (:35-41), candidate.profile.changed → projection (:42-47); `notification.email.requested` NOT registered (:15); output events not inputs (:12-13) |
| `07-fastapi-ai-worker/app/api/v1/task_handlers.py`, `app/services/security_scanner.py` | implemented scan handler + ClamAV provider; fail-closed behavior (:62-185) |

## 3. Decision-by-decision review

| Decision ID | Correct question? | Type | Evidence | Verdict | Required change |
|---|---|---|---|---|---|
| D-1 DTOs / status codes / error envelope (§1) | Mostly — error families are complete and grounded, but the endpoint block hardcodes `/api/v1` as if frozen | TECHNICAL | consolidated S3-C-07; error families match enum states + Guide §6 409 (:234) | ACCEPT with change | Add `/api/v1` prefix as an explicit convention decision (see M-1); require the deterministic two-track `security_scan_status` × `processing_status` → UI stage mapping (S3-C-01) inside this item; add PD-002 selection flag to upload DTO scope (M-3) |
| D-2 Upload handshake (§2) | Yes, but options are presented as equally open | TECHNICAL (constrained by approved direction) | PHASE-01 REQ-RESUME-001 "signed URL only" APPROVED DIRECTION (:84); Guide §8.7 (:268) | ACCEPT with change | Cite the signed-URL direction as evidence favoring Option B; spell out per-option security impact (checksum ownership, magic-bytes validation timing, orphan semantics) — currently only selection criteria are listed |
| D-3 Rate limits (§3) | Yes | PRODUCT/BUSINESS (numbers) + TECHNICAL (algorithm) | no authoritative numeric source exists in repo; `guest_upload_sessions` DB limits exist (06 :39-59) | ACCEPT with change | Cite the guest-session DB limits (max_upload_count=3, max_total_bytes≈30 MB) as mandatory floor anchors so product numbers cannot weaken them |
| D-4 SSE endpoint / auth / reconnect / recovery (§4) | Yes | TECHNICAL | DECISION-02 frozen (:52, :74); REQ-RESUME-006 (:89) | ACCEPT with change | State explicitly that server-side SSE event-log/`Last-Event-ID` replay is NOT required because REST recovery is authoritative — otherwise implementers may build an unnecessary event store |
| D-5 Guest upload/claim surface (§5) | Yes | NEEDS USER DECISION (surface) + TECHNICAL | PHASE-04 §6.2 (:93-103), §8.2 (:144-155); `17_rls.sql` :234-237; `06_documents.sql` :91-95 | ACCEPT | Add explicit guest-session issuance question (how the job-scoped token is created/delivered) — "session creation" is listed but the issuance model is not |
| D-6 Application-specific resume (§6) | Yes | PRODUCT/BUSINESS (is parsing required?) + TECHNICAL | PD-002 :52-59; `09_applications.sql` :130-136; Guide §11 (:318-330) | ACCEPT | Note that snapshot creation happens inside the application-submission transaction (Guide §11), not as a separate resume-API write, so the catalog entry must reference the application use case |
| D-7 Confirm writable-field allowlist (§7) | Yes | TECHNICAL | Guide §6 (:233-234); `08_candidates.sql` canonical fact tables | ACCEPT | State that the allowlist is derived from the real canonical tables (`candidate_skills`..`candidate_links`); no invented fields |
| D-8 Idempotency + optimistic concurrency (§8) | Yes | TECHNICAL (key mechanics) + PRODUCT/BUSINESS (duplicate semantics) | Guide §8.4 reuse rule (:264); `resume_parsing_jobs.idempotency_key` (:50); `processed_events`; Guide §6 409 (:234) | ACCEPT with change | Explicitly link the duplicate-checksum REUSE rule (Guide §8.4) into "different-key duplicate behavior" — reuse and idempotency must not contradict |
| D-9 Object cleanup ownership (§9) | Yes | OPERATIONS + TECHNICAL | Guide §8.6 compensating cleanup event (:267); `06_documents.sql` purge reserved (:116-117) | ACCEPT | Correctly keeps the event as approved requirement; add one line that physical purge stays privileged-retention-only (06 :116-117) |
| D-10 REQ-RESUME-007 fast-track (§10) | Yes | PRODUCT/BUSINESS | PHASE-01 :90 NEEDS_DECISION | ACCEPT | None — the "do not add an endpoint merely because the old requirement mentions it" discipline is correct |

No decision reopens a frozen item. No invented tables/columns/events/DTOs/enums found.

## 4. Missing decisions

### M-1 — `/api/v1` public route prefix convention

- Question: Is `/api/v1` the canonical public NestJS route prefix?
- Why it matters: the decisions file already uses `/api/v1/resumes/*` as fact; the Stage-3 stage
  plan lists the four paths without a prefix. Catalog freeze is impossible with an unstated
  convention.
- Evidence: consolidated review S3-C-07; SECURITY-SCAN plan Stage-3 path list (no prefix);
  no frozen prefix convention exists anywhere in `04-nestjs-api/`.
- Recommended options: (a) adopt `/api/v1` now and record it as the convention; (b) defer with
  paths written prefix-agnostic.
- Owner: user/architecture approval (convention), then agent records it.

### M-2 — Confirm outbox event field usage (`candidate.profile.changed` v1)

- Question: One logical confirmation both applies facts AND links the document, but the
  contract's `change_type` enum is single-valued (`profile_updated / document_linked /
  document_unlinked`). Which value does confirm emit, and what goes in `active_document_id`?
- Why it matters: "one logical save … emits outbox event" (`08_candidates.sql` :33) forbids two
  events per confirmation; the projection consumer keys off this event (registry :42-47).
- Evidence: `contracts/events/candidate-profile-changed.v1.json`; Guide §6 (:217); registry
  Phase-1 route.
- Recommended options: emit ONE event with `change_type = profile_updated` and
  `active_document_id` set when the confirmed document becomes current (recommended);
  alternative = `document_linked` — weaker semantics for the projection worker.
- Owner: agent recommendation + user approval (contract usage).

### M-3 — PD-002 active-profile selection in upload DTO

- Question: The upload request must carry the "Use as active profile resume" flag; no decision
  item covers its DTO field, default, or guest behavior.
- Why it matters: selection determines whether parse completion enriches the global projection
  (PD-002 :61-82). Missing it breaks the parse-leg enrichment chain.
- Evidence: PD-002 :61-82; consolidated S3-C-08; my prior review S3-01.
- Recommended options: boolean `use_as_active_profile_resume` (default per product choice),
  validated against the 10-resume library limit before acceptance.
- Owner: PRODUCT/BUSINESS for default/semantics confirmation; TECHNICAL for field shape.

### M-4 — Two-track status mapping rule

- Question: Exact deterministic mapping from (`security_scan_status`, `processing_status`) to the
  UI-safe stage/code returned by the status API.
- Why it matters: merging the two enums into one ambiguous lifecycle is the S3-C-01 risk;
  infected/failed must never surface as parsed-ready.
- Evidence: `02_enums.sql`; consolidated S3-C-01.
- Recommended options: single mapping table in the catalog; scan track takes precedence for
  terminal bad states.
- Owner: agent (technical mapping), freeze with catalog.

### M-5 — 10-resume library limit enforcement point

- Question: Where is the PD-002 library limit validated — upload acceptance, confirm, or both —
  and what error family does the API return?
- Why it matters: approved product rule with no owner in the decisions file.
- Evidence: PD-002 :25-50; consolidated S3-C-08.
- Recommended options: enforce at upload acceptance (fast rejection) with a dedicated error
  code; confirm re-checks as defense in depth.
- Owner: PRODUCT/BUSINESS (UX of archive-before-add) + TECHNICAL (enforcement).

### M-6 — Notification behavior for scan/parse completion

- Question: Does scan-complete/parse-complete also produce an in-app notification, or is
  SSE + status polling sufficient for this stage?
- Why it matters: `12_notifications.sql` baseline exists, but `notification.email.requested`
  has no dispatcher route (registry :15, OD-3); scope must be stated, not discovered later.
- Evidence: `12_notifications.sql` (:33-268); registry :15; REQ-RESUME-006 (:89).
- Recommended options: (a) this stage = SSE + REST only, notifications phased (recommended for
  freeze speed); (b) add in-app notification writes to the worker's final transactions.
- Owner: PRODUCT/BUSINESS.

## 5. Incorrect or already-frozen decisions

| Item | Status | Source / correction |
|---|---|---|
| `/api/v1` prefix used as fact in D-1 | NOT FROZEN — must not be presented as settled | consolidated S3-C-07; no convention record exists. Correct by adding M-1 |
| SSE vs REST authority (D-4 preamble) | Already FROZEN — file correctly keeps it closed | DECISION-02. No reopening — correct handling |
| Security direction in D-2 ("already fixed") | FROZEN — correct; but presenting Option A (multipart→NestJS) as equal to Option B without citing REQ-RESUME-001 "signed URL only" APPROVED DIRECTION understates the evidence | PHASE-01 :84; Guide §8.7. Correct by citing the direction |
| Compensating cleanup event (D-9) | Already APPROVED requirement — file correctly keeps event as requirement and opens only ownership | Guide §8.6 (:267). Correct handling |
| 409 Conflict on stale revision (D-8) | Already FROZEN by Guide §6 (:234) — file correctly lists it as behavior to implement, not a decision | Correct handling |
| DECISION-01 client separation | Already FROZEN — the decisions file never restates it, but it must be carried into every decision record as a binding constraint: document/parsing table reads and all writes go through SystemClient; `17_rls.sql` grants no authenticated access to these tables | DECISION-01; `17_rls.sql` :151-152, :162-176. Add as constraint note, not a new decision |
| `candidate.resume.parsed` envelope | RESOLVED — current contract requires `event_id` + `occurred_at` (candidate-resume-parsed.v1.json :7). My earlier Stage-2 F-01 / Stage-3 S3-12 blocker is stale and is corrected here | consolidated review §4.4; current contract |
| `candidate.profile.changed` contract existence | EXISTS — confirmed; the real decision is field USAGE (M-2), not existence | contract file present |
| Guest session checks (active/unexpired/not revoked, XOR, service-only consume) | FROZEN baseline rules — file correctly lists them as mandatory, not open | PHASE-04 §6.2; `17_rls.sql` :234-237. Correct handling |

## 6. Recommended choices

Technical recommendations only. Product/business items are explicitly NOT finalized.

| Item | Recommendation | Basis |
|---|---|---|
| D-1 | One uniform error envelope `{code, message, trace_id}` with machine-readable codes per family; 201 on new document create, 200 on duplicate-reuse return | Consistency with trace_id propagation in contracts; Guide §8.4 reuse |
| D-2 | Option B (authorized private-storage handshake): short-lived upload authorization, browser uploads directly, NestJS finalizes metadata and computes SHA-256 server-side (client-supplied checksum advisory only), magic-bytes validated before the outbox transaction | REQ-RESUME-001 signed-URL direction; Guide §8.3/:8.7; keeps large bytes out of NestJS request memory |
| D-3 | Algorithm technical choice: sliding-window per user + per guest session/IP; numbers stay PRODUCT | No numeric source in repo |
| D-4 | Stateless reconnect; no server-side event-id store; recovery = GET status endpoint; sanitized event payload only | DECISION-02 :52, :74 |
| D-5 | Reuse the same four resource paths with session-token auth binding rather than parallel guest routes — recommendation only; final surface = USER DECISION | Reduces duplicated authorization logic; DB rules already origin-agnostic (XOR owner) |
| D-6 | Keep application parsing decision open (cost/product); snapshot write stays inside application submission TX | Guide §11 |
| D-7 | Allowlist derived strictly from canonical tables; server sets `primary_source_type = candidate_manual`/`candidate_corrected`, `verification_status`, revision, audit fields | Guide §6 :233-234; `08_candidates.sql` |
| D-8 | `Idempotency-Key` header; scope = user + SHA-256 checksum for upload, user + document for confirm; same-key replay returns original response; different-key duplicate follows reuse rule; expected-revision field mandatory on confirm with 409 | Guide §8.4/:234; `resume_parsing_jobs.idempotency_key` precedent |
| D-9 | Cleanup consumer in the existing async stack (outbox event → dispatcher route → worker) rather than a new synchronous path; thresholds = OPERATIONS | Matches frozen outbox architecture |
| M-2 | Single event: `change_type = profile_updated`, `active_document_id` set when linking makes it current | One-logical-save rule (08 :33) |
| M-4 | Mapping table where terminal scan-bad states (infected/failed/quarantined) override processing track in the UI stage | Fail-closed policy |

Not finalized (user/business approval required): numeric rate limits, guest surface final
choice, application-parsing requirement, REQ-RESUME-007 yes/no, library-limit UX, notification
scope, route prefix convention.

## 7. Acceptance tests

| Decision | Testable acceptance criterion |
|---|---|
| D-1 | Every error family returns the uniform envelope with a stable machine-readable `code`; a request for another user's document returns the ownership-safe not-found/forbidden code and never reveals ownership |
| D-2 | Upload completes with no file bytes in any outbox/task payload or log; server-computed SHA-256 is stored; a tampered/changed file between authorization and finalize is rejected before the outbox event |
| D-3 | A guest session exceeding 3 uploads or 31,457,280 total bytes is rejected with the rate/limit error even if product numbers are raised |
| D-4 | After SSE disconnect, calling GET status returns the authoritative current state; no SSE event contains resume text or signed URLs |
| D-5 | Guest requests with expired/revoked/consumed session are rejected; claim flow follows `pending → verified → merged` only |
| D-6 | Submitting an application with an application-only resume never creates/updates `candidate_profile_documents` or canonical facts; snapshot is immutable after submission |
| D-7 | A confirm payload containing `revision`, `primary_source_type`, `verification_status`, audit timestamps or projection fields is rejected (or ignored per frozen rule) and never persisted client-supplied |
| D-8 | Same idempotency key replayed → identical response, exactly one document row, one outbox event; confirm with stale expected revision → 409 and zero canonical changes |
| D-9 | Forced DB-commit failure after object upload produces the compensating cleanup event and the orphan object is removed only by the authorized cleanup consumer; no product flow physically deletes the document row |
| D-10 | If rejected: no fast-track endpoint exists and full parse path works; if accepted: fast-track failure never blocks or fails the full parse chain |
| M-1 | All four endpoints are documented and tested under exactly one recorded prefix convention |
| M-2 | One confirmation emits exactly one `candidate.profile.changed` event with valid `change_type` and `active_document_id`, consumed by the projection worker |
| M-3 | Upload without the selection flag behaves per frozen default; selected upload of an 11th library resume is rejected with the library-limit error |
| M-4 | Status API for an `infected` document never returns a parsed-ready stage regardless of `processing_status` |
| M-5 | Library-limit violation returns the dedicated error family before any storage object or document row is created |
| M-6 | If notifications phased out: no notification rows are written by this flow and this is asserted in the E2E test |

## 8. Freeze readiness

**Closeable by agent recommendation (no user approval needed):**

- D-1 error envelope shape and status-code mapping (after M-1 is recorded)
- D-2 transport choice within the approved signed-URL direction
- D-3 algorithm (not numbers)
- D-4 SSE contract details incl. stateless reconnect
- D-7 allowlist mapping from canonical tables
- D-8 idempotency/OCC mechanics
- D-9 cleanup consumer architecture
- M-2 event field usage (technical contract usage, low risk)
- M-4 two-track mapping table

**Require user/business approval:**

- M-1 route prefix convention
- D-3 numeric rate limits
- D-5 guest API surface final shape (recommendation exists)
- D-6 whether application-specific parsing is required
- D-10 REQ-RESUME-007 fast-track yes/no
- M-3 selection-flag default and guest behavior
- M-5 library-limit UX (archive-before-add flow)
- M-6 notification scope for this stage

**Blocking Stage-03 freeze until recorded:**

- M-1 (paths cannot be catalogued without the prefix decision)
- M-3 (upload DTO incomplete without the selection flag)
- D-2 final transport option (affects upload validation ordering and orphan semantics)
- D-7 allowlist (confirm contract cannot be written without it)
- D-8 replay semantics + M-2 event usage (confirm transaction spec depends on both)
- D-5 guest surface (four-API authorization model depends on it)
- D-3 numbers and D-4 DTO are catalog blockers but may be resolved inside the catalog phase
  without reopening Stage-03

## 9. Final status

**READY AFTER DOCUMENT FIXES**

Required document fixes (all in `STAGE-03-REMAINING-DECISIONS.md`, no code/SQL/contract
changes):

1. Stop presenting `/api/v1` as frozen; add it as decision M-1 (per consolidated S3-C-07).
2. Add M-2..M-6 as numbered decision items with the same record template.
3. In D-2, cite REQ-RESUME-001 "signed URL only" APPROVED DIRECTION and Guide §8.7, and add
   per-option security/performance impact.
4. In D-3, cite guest-session DB limits as mandatory floors.
5. In D-8, link the duplicate-checksum reuse rule (Guide §8.4).
6. Add a binding-constraints note: DECISION-01 SystemClient-only access for document/parsing
   tables (`17_rls.sql` evidence) and the frozen SSE/REST split apply to every decision record.
7. Note the correction that `candidate-resume-parsed.v1` envelope is fixed (event_id/occurred_at
   present) so the stale Stage-2 blocker is not carried into decision records.

After these fixes, the file is READY FOR USER DECISIONS.
