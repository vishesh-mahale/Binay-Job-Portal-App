# Stage-03 API Sync Independent Review

Reviewer: qoder (Senior NestJS API Architect — independent review)

Draft under review: `04-nestjs-api/04-nestjs-api-app/s1/codex/STAGE-03-NESTJS-API-REQUIREMENTS-SYNC.md` (205 lines, DRAFT, dated 2026-08-26)

Review date: 2026-08-26

Method: every claim in the draft was re-verified against executable SQL baseline, frozen
decisions, contracts, dispatcher/FastAPI code and Phase-00..04 documents. Nothing was
accepted on the draft's own authority. Distinctions preserved throughout:
**confirmed requirement / current implementation / expected future behavior / phased gap /
unresolved decision**.

## 1. Final verdict

**APPROVED WITH CHANGES**

The draft is conservative, structurally sound and contains no invented tables, events or
transitions. Its upload → outbox → scan → parse chain and its confirm-transaction skeleton
match the executable baseline and the implemented async path. However it omits several
approved requirements that are binding for the four APIs (PD-002 upload-time active-resume
selection, library limit, duplicate-reuse policy, full profile-save transaction pattern
including `profile_change_history` / optimistic concurrency), does not state the per-API
trusted-access consequence of `17_rls.sql`, and uses self-invented `API-RESUME-*` IDs without
mapping them to the frozen `REQ-RESUME-*` requirement IDs. These are document fixes, not
architecture changes.

## 2. Repository evidence checked

| Evidence | Objects/sections used |
|---|---|
| `AGENTS.md` | conflict-reporting rule (:17-22), contracts-in-`contracts/` rule (:44), no-resume-content-in-repo rule (:47) |
| `04-nestjs-api/README.md` | NestJS = public API boundary; app code not yet built (:33-36) |
| `04-nestjs-api/PLAN-REQUIREMENTS-TO-IMPLEMENTATION-HINGLISH.md` | authority order (:19-36), REQ-* ID scheme (:145-163), Phase-1 mandatory fields (:165-183), phased-dispatcher rule (:221), transaction template, Phase-6 catalog fields |
| `04-nestjs-api/PHASE-01-REQUIREMENTS-CONSOLIDATION.md` | `REQ-RESUME-001..007` (:82-90) — statuses APPROVED / APPROVED DIRECTION / NEEDS_DECISION |
| `04-nestjs-api/PHASE-04-STATE-MACHINES-AND-TRANSACTIONS.md` | §6.1 document ownership (:89-91), §6.2 guest session states (:93-103), §6.3 parsing-job machine (:105-117), §8.1 application TX (:140-142), §8.2 guest claim states (:144-155) |
| `04-nestjs-api/NESTJS-IMPLEMENTATION-GUIDE.md` | §5 transaction rule (:188-202), §6 candidate profile save (:204-234), §7 search projection (:236-255), §8 document upload (:257-270), §9 resume parsing (:272-301), §10 evidence acceptance (:303-316), §11 registered application (:318-330) |
| `04-nestjs-api/DECISION-01-NESTJS-SUPABASE-ACCESS-MODEL-HINGLISH.md` | FROZEN controlled-hybrid; UserContextClient vs SystemClient; browser never gets service credentials |
| `04-nestjs-api/DECISION-02-REALTIME-TRANSPORT-HINGLISH.md` | FROZEN; resume row = SSE live + REST recovery; sanitized nudges only; exact endpoint/DTO = API-catalog work (:74) |
| `s1/codex/SECURITY-SCAN-IMPLEMENTATION-STAGES-AND-VERIFICATION-PLAN.md` | Stage-1 frozen direction (:25-57), Stage-3 API list and per-API field list (:77-106), non-negotiable rules (:183-191) |
| `01-requirements/product-decisions/PD-002-ACTIVE-RESUME-SEARCH.md` | APPROVED: upload-time "Use as active profile resume" choice (:61-82), 10-resume library limit + soft archive (:25-50), application-only resume non-promotion (:52-59), background flow (:131-168), service responsibilities (:204-214) |
| `02-database/migrations/baseline/02_enums.sql` | `security_scan_status`, `resume_processing_status` (:302-311), `parsing_job_status`, `document_role`, `profile_fact_source`, `guest_claim_status` |
| `02-database/migrations/baseline/06_documents.sql` | `guest_upload_sessions` (:39-59), `uploaded_documents` (:72-106) incl. XOR owner check (:91-95), defaults `security_scan_status='pending'` / `processing_status='uploaded'` (:84-86), soft-delete rule (:116-117) |
| `02-database/migrations/baseline/07_resume_processing.sql` | `resume_parsing_jobs` (:39-67, idempotency_key UNIQUE :50), `resume_parsed_data` (:69-100, immutable), artifacts/job_events, write-flow comments (:20-31) |
| `02-database/migrations/baseline/08_candidates.sql` | header rule "one logical save writes history, bumps revision once and emits outbox event" (:33), `bump_candidate_profile_revision()` (:89-109), `candidate_profile_documents` + one-current-role unique index (:111-125), canonical fact tables with `primary_source_type`/`verification_status`, `candidate_search_profiles` (:418-470), `profile_change_history` with operation CHECK incl. `'confirm'` (:472-491), evidence transition trigger (:493-520) |
| `02-database/migrations/baseline/09_applications.sql` | `application_documents` (:130-136), `application_profile_snapshots` (:138+) |
| `02-database/migrations/baseline/15_infrastructure.sql` | `outbox_events` envelope columns (event_id/aggregate/event_type/payload/status) — verified in Stage 2 |
| `02-database/migrations/baseline/17_rls.sql` | `REVOKE ALL FROM anon, authenticated` (:151-152); authenticated SELECT grant list (:162-176) does NOT include `uploaded_documents`, `guest_upload_sessions`, `resume_parsing_jobs`, `resume_parsed_data`; `consume_guest_upload_session(UUID,UUID)` GRANT EXECUTE TO service_role only (:234-237); candidate personal tables own-read policies (:182-201) |
| `contracts/events/security-scan-requested.v1.json` | amended payload = document_id only (Stage-2 verified) |
| `contracts/events/resume-parse-requested.v1.json`, `contracts/tasks/security-scan-task.v1.json`, `contracts/tasks/resume-parse-task.v1.json` | uniform 4-field task payloads; aggregate semantics per `contracts/AGGREGATE-ID-SEMANTICS.md` |
| `contracts/events/candidate-profile-changed.v1.json` | draft-07 flat contract; required `schema_version/event_id/aggregate_id/trace_id`; `change_type` enum `profile_updated / document_linked / document_unlinked`; `active_document_id` |
| `contracts/events/candidate-resume-parsed.v1.json` + Stage-2 review `s1/stage2/qoder-STAGE-02-CONTRACT-DRAFT-REVIEW.md` | envelope BLOCKER F-01 still open (missing `event_id`/`occurred_at`) — dependency for the parse-time projection chain |
| `05-outbox-dispatcher-nestjs/src/routing/event-route.registry.ts` | `resume.parse.requested` → ai-heavy-queue → `/internal/tasks/resume/parse` (Phase-1 route :35-41); `candidate.profile.changed` → projection-queue → `/internal/tasks/candidate/projection` (:42-47); `security.scan.requested` → security-scan-queue → `/internal/tasks/security/scan` (Phase-2 route :79-84); output events not registered as input (:12-13); unknown events fail closed (:16) |
| `07-fastapi-ai-worker/app/api/v1/task_handlers.py` | `/internal/tasks/security/scan` handler (:62-185): idempotency via `processed_events` (:81-82), claim-to-`scanning` guard (:86-109), fail-closed `failed`+retryable error on scanner unavailable (:115-127), result JSON `{schema_version:1, verdict, scanner{provider,engine_version,signature_version}, ...}` (:129-139), atomic clean→parse TX: status update + `resume_parsing_jobs` insert (`ON CONFLICT (idempotency_key) DO NOTHING`, key `security_scan:{event_id}`) + `resume.parse.requested` outbox in one transaction (:141-183) |
| `07-fastapi-ai-worker/app/services/security_scanner.py`, `app/core/config.py` | `ClamAVScannerProvider`; `CLAMAV_HOST/PORT/TIMEOUT` settings (:148-151) |
| `06-google-cloud-tasks-queue/` | `projection-queue.json`, `security-scan-queue.json` both present |

## 3. What is correct

| Area | Verdict | Evidence |
|---|---|---|
| Upload write path (validate → store object outside TX → one trusted TX: `uploaded_documents` `pending`/`uploaded` + `security.scan.requested` outbox → dispatch only after commit) | Correct — confirmed requirement + matches current async implementation | Guide §9 (:274-284); PLAN transaction template; `06_documents.sql` defaults (:84-86); `security-scan-requested.v1` payload = document_id only; registry route :79-84 |
| Status label sequence (pending → scanning → clean/infected/failed → queued/processing → parsed/failed) maps to real enums, no invented enum | Correct | `02_enums.sql` `security_scan_status`, `resume_processing_status` (:302-311), `parsing_job_status`; PHASE-04 §6.3 |
| No external calls inside open PostgreSQL transaction | Correct | Guide §5 (:201-202); SECURITY-SCAN plan non-negotiables (:186) |
| Business row + outbox committed atomically; dispatcher after commit | Correct | Guide §5; `15_infrastructure.sql` outbox model |
| PII rule (no resume bytes/signed URLs/tokens in payloads or logs) | Correct | Amended `security-scan-requested` payload; DECISION-02 sanitized nudges; AGENTS.md :47; implemented task payload is 4-field uniform |
| Clean-only parsing, fail-closed scanner failure | Correct — current implementation matches | task_handlers.py :115-127 (failed + retryable error), :141-176 (clean branch only); Stage-1 approved decisions |
| FastAPI owns the guarded clean→parse atomic transition | Correct — current implementation | task_handlers.py :141-183; matches Stage-1 decision 3 |
| Status/parsed-data read targets (`uploaded_documents`, `resume_parsing_jobs`, `resume_parsed_data`) | Correct — tables/columns exist | `06_documents.sql` :72-106; `07_resume_processing.sql` :39-100 |
| Confirm preconditions (parsed data exists, document active, scan `clean`, ownership) | Correct | fail-closed policy; `uploaded_documents.deleted_at`; confirm operation present in `profile_change_history` CHECK (:478) |
| Confirm steps: revision bump exactly once via `bump_candidate_profile_revision()`; link via `candidate_profile_documents` one-current-role policy | Correct | `08_candidates.sql` :89-109, :111-125 + `uq_candidate_current_document_role`; REQ-RESUME-004 |
| Confirm emits a profile-change event consumed by the projection worker | Correct — route exists | `candidate-profile-changed.v1.json`; registry :42-47 → `/internal/tasks/candidate/projection` |
| SSE = live optimization, REST/DB authoritative recovery; missed SSE never breaks workflow | Correct — frozen | DECISION-02 (frozen); PD-002 :170-171; Guide §9 :300-301 |
| Guest flow baseline exists (sessions, XOR ownership, service-only consume function, claim machine) | Correct as expected future behavior for the API surface | `06_documents.sql` :91-95; `17_rls.sql` :234-237; PHASE-04 §6.2/§8.2 |
| Open decisions §7 are real (no invented decisions) | Correct, with 2 corrections — see S3-05 and S3-07 | See section 7 |
| Draft invents no table, column, function, event or transition | Correct | Full cross-check above |

## 4. Problems and missing items

| ID | Severity | Problem | Evidence | Recommended correction |
|---|---|---|---|---|
| S3-01 | HIGH | PD-002's **upload-time "Use as active profile resume" candidate choice** is missing from API-RESUME-001 request contract. PD-002 (APPROVED) fixes the selection at upload time; the draft instead links the document only in confirm step 4, leaving the two models silently inconsistent. Also missing: selection = projection enrichment after parse; not-selected = application-only, no global search impact | PD-002 :61-82, :119-129, :131-156; Guide §7 (:238-241) "active-profile-resume selection/parse-completion event" | Add the selection flag to the upload request contract (or explicitly record it as confirm-time-only if that is the intended deviation — which then needs a decision record). State selected/unselected consequences per PD-002 |
| S3-02 | HIGH | Confirm write transaction omits mandatory parts of the approved profile-save pattern: `profile_change_history` insert, `candidate_profiles SELECT ... FOR UPDATE`, expected-revision verification with HTTP `409`, soft-delete-only rule (`deleted_at`, no hard DELETE), and the rule that the client cannot set provenance/`verification_status`/revision/audit fields | Guide §6 (:210-234); `08_candidates.sql` header (:33); `profile_change_history` operation incl. `'confirm'` (:478) | Expand draft §6 write steps to the full Guide §6 pattern; add acceptance criteria for 409 on stale revision and for history rows |
| S3-03 | HIGH | **Requirement traceability missing.** Draft uses self-invented `API-RESUME-001..004` IDs; its own §8 exit criterion demands a requirement ID per endpoint. Frozen IDs `REQ-RESUME-001..007` exist and are not referenced. `REQ-RESUME-007` (fast-track name extraction, `NEEDS_DECISION`) is not mentioned anywhere | PHASE-01 :82-90; PLAN :145-163, :204-221 | Add a mapping table API-RESUME-00n ↔ REQ-RESUME-00n; note REQ-RESUME-007 as an unresolved decision that may add a later endpoint |
| S3-04 | HIGH | **Per-API access path not stated.** `17_rls.sql` grants authenticated SELECT on none of `uploaded_documents`, `guest_upload_sessions`, `resume_parsing_jobs`, `resume_parsed_data`. Therefore every read/write of all four APIs must go through the trusted SystemClient (DECISION-01). The draft's common rule "approved personal reads may use JWT + RLS" (:32) applies to none of these tables and is misleading here | `17_rls.sql` :151-152, :162-176, :248-250; DECISION-01 (frozen) | State per API: all document/parsing reads and writes via trusted SystemClient; no UserContextClient path for these tables in this scope |
| S3-05 | MEDIUM | File transport presented as fully open (`multipart` vs presigned `NEEDS_DECISION`), but `REQ-RESUME-001` is APPROVED DIRECTION "signed URL only" and Guide §8.7 fixes "authorized short-lived signed URL; internal bucket path not exposed" | PHASE-01 :84; Guide §8 :257-268 | Cite the signed-URL direction as the approved baseline; keep only genuinely open details (exact handshake/DTO) as TBD, or record an explicit conflict |
| S3-06 | MEDIUM | Duplicate-upload behavior: approved rule is **reuse** — same owner/session + SHA-256 checksum returns the existing document. Draft mentions a "duplicate policy" without stating reuse, and its acceptance criterion "creates exactly one active document row ... for the idempotency key" contradicts reuse semantics | Guide §8.4 (:264); `06_documents.sql` duplicate-checksum indexes (:29) | State the reuse rule in API-001 and fix the acceptance criterion: duplicate returns the existing document_id (no second row, no second scan event) |
| S3-07 | MEDIUM | Compensation on storage-success + DB-failure is left fully open ("orphan candidate for the approved cleanup workflow"), but the approved rule is a **compensating cleanup event**; only ownership/timing of the sweeper is genuinely open | Guide §8.6 (:267) | State the compensating cleanup event as requirement; keep sweeper ownership as the open decision |
| S3-08 | MEDIUM | **Application-specific resume flow absent without a scope statement.** PD-002 distinguishes application-only resumes (never promotable to library; attached via `application_documents` inside the application transaction). The draft's four APIs cover only profile resumes and never say so | PD-002 :52-59, :78-82; `09_applications.sql` :130-136; Guide §11 (:318-330); PHASE-04 §8.1 | Add explicit scope: this catalog = profile-resume first-upload flow; application-resume attach happens in the application use case (separate catalog entry, phased gap for this stage) |
| S3-09 | MEDIUM | **10-resume profile-library limit** and soft-archive/removal policy (PD-002) are not reflected as an upload/confirm validation or as an explicit deferral | PD-002 :25-50 | Add library-limit check to API-001/API-004 requirements or mark it an explicit catalog-phase gap with owner |
| S3-10 | MEDIUM | Confirm's outbox event is described generically ("approved profile-change outbox event"). The actual contract is `candidate.profile.changed` v1 (draft-07 flat envelope; `change_type` incl. `document_linked`; `active_document_id`), routed to projection-queue. Draft should name it and note its Phase-1-era envelope as a dependency | `candidate-profile-changed.v1.json`; registry :42-47 | Name the contract and route in API-004; add dependency note that confirm payload must satisfy both this contract and `outbox_events` envelope |
| S3-11 | LOW | Draft does not record current implementation status of the async chain (all now implemented/registered: security-scan route Phase-2, ClamAV handler, clean→parse handoff, `security-scan-queue.json` present), nor that `candidate.resume.parsed` is an output-only event (deliberately not an input route — projection-loop guard). Reviewers of the frozen catalog need this distinction | registry :12-13, :79-84; task_handlers.py :62-185; `06-google-cloud-tasks-queue/security-scan-queue.json` | Add a short "current implementation status" subsection distinguishing implemented routes/consumers from pending items |
| S3-12 | LOW | Parse-time projection trigger dependency not flagged: active-resume parse completion must also trigger projection rebuild (Guide §7), via conditional `candidate.resume.parsed`, whose contract still has Stage-2 BLOCKER F-01 (missing `event_id`/`occurred_at`) | Guide §7 (:238-241); `s1/stage2/qoder-STAGE-02-CONTRACT-DRAFT-REVIEW.md` F-01 | Add dependency note under E2E flow: freeze of `candidate-resume-parsed.v1` envelope is a precondition for the parse-time enrichment leg |
| S3-13 | LOW | Guest-confirm path cites no baseline; the claim state machine already exists (PHASE-04 §8.2, `guest_claim_status`); notification phasing (`notification.email.requested` unrouted, OD-3) not mentioned under status/notification behavior | PHASE-04 :144-155; registry :15 | Cite the claim machine for open decision §7.5; note notification routing as phased gap (REST/SSE covers this stage) |
| S3-14 | LOW | Error-behavior section is thin: only status-API acceptance mentions not-found/forbidden; no common error-code policy reference for the four endpoints (PLAN Phase-1 fields require Idempotency/Rate limit/Audit/Error per requirement) | PLAN :165-183 | Add a one-line common error policy (404-vs-403 ownership-leak rule, validation 422, 409 stale revision, 503 scanner-unavailable analogue) or mark it catalog work explicitly |

No BLOCKER found: nothing in the draft contradicts executable SQL, contracts or code in a way
that would corrupt data or security posture. The HIGH items are omissions of approved
requirements that must be added before freeze.

## 5. API-by-API review

### 5.1 API-RESUME-001 — POST /resumes/upload

| Axis | Verdict |
|---|---|
| Traceability | Partial — maps to REQ-RESUME-001/002/005 in substance but never cites them (S3-03); PD-002 upload-time selection not carried (S3-01) |
| Actor/authorization | Correct: authenticated candidate or approved guest session; ownership/session binding before acceptance (PHASE-04 §6.1-6.2; `06_documents.sql` XOR check :91-95) |
| JWT/RLS vs trusted access | Missing statement — must be trusted SystemClient only; no authenticated grants exist for `uploaded_documents` (S3-04) |
| Guest behavior | Direction correct; should name `guest_upload_sessions` limits (count/bytes, token_hash) and service-only `consume_guest_upload_session` (consumed at application TX, not upload — PHASE-04 §6.2) |
| Request DTO | Incomplete: missing PD-002 active-profile selection flag (S3-01); transport decision should cite signed-URL direction (S3-05) |
| Validation | Correct list (size, MIME, extension, magic bytes, checksum, duplicate); duplicate must be stated as reuse (S3-06); library-limit validation missing (S3-09) |
| Tables written | Correct: `uploaded_documents` + `outbox_events`; guest session touches per baseline |
| Transaction boundary | Correct: object outside TX; single trusted TX; dispatch after commit |
| Outbox event/contract | Correct: `security.scan.requested` v1, payload document_id only (amended contract verified) |
| Dispatcher route/consumer | Correct and now implemented: security-scan-queue → `/internal/tasks/security/scan` (registry Phase-2; ClamAV handler live) — draft should record this (S3-11) |
| Idempotency | Key format correctly left TBD; duplicate-reuse semantics must be aligned (S3-06) |
| Rate limit | Correctly NEEDS_DECISION (no authoritative numeric source found in repo) |
| Errors | Partial (S3-14); orphan-object handling present but should state compensating cleanup event (S3-07) |
| SSE/live status | Correct per DECISION-02 |
| Recovery | Correct — status endpoint authoritative |
| PII | Correct — no bytes/signed URL/token in payload or logs; verified against implemented handler |
| Acceptance criteria | Mostly good; "exactly one active document row" conflicts with reuse rule (S3-06) |

### 5.2 API-RESUME-002 — GET /resumes/:id/status

| Axis | Verdict |
|---|---|
| Traceability | Maps to REQ-RESUME-006 (live update + reconnect recovery) — citation missing (S3-03) |
| Actor/authorization | Correct: owner / guest session / authorized internal; cross-user denied |
| JWT/RLS vs trusted | Missing statement — reads of `uploaded_documents`/`resume_parsing_jobs` are service-only in `17_rls.sql`, so trusted SystemClient (S3-04) |
| Guest behavior | Correct boundary; cite PHASE-04 §6.2 states |
| DTO | Fields reasonable (`document_id`, security/processing/parsing status, stage/code, timestamps); TBD acceptable at this stage; must be finalized against real enums (verified they exist) |
| Validation | UUID path param + ownership; OK |
| Tables read | Correct: `uploaded_documents` + `resume_parsing_jobs`; optional `resume_parsing_job_events` timeline — not required |
| Writes/events | Correct: read-only, no outbox |
| Transaction | Correct |
| Idempotency/rate limit | GET naturally idempotent; rate limit NEEDS_DECISION — acceptable |
| Errors | Not-found/forbidden without ownership leak — correct and testable |
| SSE/recovery | Correct per DECISION-02; missed SSE must not corrupt state — matches plan non-negotiables |
| PII | Correct — no raw content/signed URLs/stack traces (DECISION-02 :52) |
| Acceptance | Good, incl. "terminal infected/failed never appears parsed-ready" — matches fail-closed implementation |

### 5.3 API-RESUME-003 — GET /resumes/:id/parsed-data

| Axis | Verdict |
|---|---|
| Traceability | Maps to REQ-RESUME-003 (immutable parsed result, canonical separate) — citation missing (S3-03) |
| Actor/authorization | Correct — same boundary as status API |
| JWT/RLS vs trusted | Missing statement — `resume_parsed_data` has no authenticated grants; trusted path only (S3-04) |
| Guest behavior | Correct boundary; guest review before claim is an open surface question (§7.5 of draft — legitimate) |
| DTO | Correct direction: normalized fields + confidence/validation metadata; `raw_ai_output`/`extracted_text` withheld unless a privacy decision says otherwise — consistent with `resume_parsed_data` columns (:69-100) and Guide §8.7/§10 evidence-exposure caution |
| Preconditions | Correct: only successfully parsed document returns data; not-ready must be a stable result, not fabricated empty profile |
| Tables read | Correct: `resume_parsing_jobs`, `resume_parsed_data`, `uploaded_documents` |
| Writes/events | Correct: read-only, no outbox; parsed rows are immutable triggers-protected (`07_resume_processing.sql` :136-146) |
| Idempotency/rate/errors/SSE/PII | Consistent; no issues |
| Acceptance | Good — esp. "does not update canonical profile tables by itself" matches PD-002 :21/:76 and Guide §9 :298 |

### 5.4 API-RESUME-004 — POST /resumes/:id/confirm

| Axis | Verdict |
|---|---|
| Traceability | Maps to REQ-RESUME-003/004 + PD-002 canonical-protection rules — citation missing (S3-03) |
| Actor/authorization | Correct: owning candidate only; guest claim path correctly deferred to decision |
| JWT/RLS vs trusted | Missing statement — canonical writes are trusted SystemClient per DECISION-01 :74 (candidate tables have no authenticated DML) (S3-04) |
| Request DTO | Correctly deferred to catalog with allowlist decision; "unknown fields rejected; provider output never silently overwrites user edits" — matches PD-002 and Guide §9 :298 |
| Preconditions | Correct: parsed + active + `clean` + ownership |
| Write transaction | **Incomplete** — missing `profile_change_history`, `FOR UPDATE` lock, expected-revision 409, soft-delete rule, server-owned provenance/verification fields (S3-02). Steps present (re-check → facts → one revision bump → document link → outbox) are all real objects |
| Outbox event | Should name `candidate.profile.changed` v1 + projection-queue route; `change_type` `profile_updated`/`document_linked` fit the use case (S3-10) |
| Idempotency | Good — no duplicate facts/bump/link/event per key; different-key conflict policy TBD is legitimate |
| Rate limit | NEEDS_DECISION — acceptable |
| Errors | 409 stale-revision rule missing (S3-02/S3-14) |
| SSE/recovery | Acceptable; confirm result can be recovered via canonical read |
| PII | Correct |
| Acceptance | Good; add 409 and history-row criteria (S3-02) |

## 6. End-to-end flow review

Chain under verification:
Upload → private storage → `uploaded_documents` → `security.scan.requested` → ClamAV →
clean-only `resume.parse.requested` → parsing → parsed review data → candidate review/edit →
canonical profile update → revision bump → projection/embedding event.

| Step | Verdict | Evidence |
|---|---|---|
| Upload → private storage | Confirmed requirement; transport should cite signed-URL direction (S3-05) | Guide §8; REQ-RESUME-001 |
| Private storage → `uploaded_documents` (`pending`/`uploaded`) | Correct — draft + SQL defaults agree | `06_documents.sql` :84-86 |
| → `security.scan.requested` (same TX, document_id-only payload) | Correct; contract amended and verified in Stage 2 | `security-scan-requested.v1.json` |
| → ClamAV scan | Current implementation exists and is fail-closed (`failed` + retryable error on unavailable; no fail-open) | task_handlers.py :62-127; config.py :148-151 |
| clean-only → `resume.parse.requested` | Correct — FastAPI-owned atomic guarded TX with `ON CONFLICT` idempotency; matches Stage-1 decision | task_handlers.py :141-183 |
| → parsing (`/internal/tasks/resume/parse`, ai-heavy-queue) | Route registered (Phase 1); immutable result rows | registry :35-41; `07_resume_processing.sql` |
| → parsed review data (API-003) | Correct | `resume_parsed_data` immutable |
| → candidate review/edit → canonical update + one revision bump (API-004) | Direction correct; transaction pattern incomplete (S3-02) | Guide §6; `08_candidates.sql` |
| → `candidate_profile_documents` link (one current per role) | Correct | `08_candidates.sql` :111-125; REQ-RESUME-004 |
| → projection/embedding event | Confirm-leg correct (`candidate.profile.changed` → projection-queue). Parse-leg (active-resume enrichment) depends on `candidate.resume.parsed`, whose envelope still has Stage-2 BLOCKER F-01 (S3-12) | registry :42-47; Stage-2 review |

**Flow gaps found:**

- Missing input: upload-time active-profile selection (S3-01) — affects whether the parse-leg
  enrichment happens at all.
- Missing validation: library limit (S3-09).
- Missing scope statement: application-specific resume flow (S3-08). Application resumes attach
  via `application_documents` inside the application transaction (Guide §11, PHASE-04 §8.1) and
  are never promoted into the library (PD-002 :52-59) — the draft must say this flow is out of
  scope for the four profile-resume APIs.

**Explicit lists requested:**

- Missing APIs: none mandatory for this stage beyond the four; guest-session issuance and
  library archive/remove are separate use cases, correctly left as open decision / future scope.
- Unnecessary APIs: none — all four are mandated by the SECURITY-SCAN plan Stage 3.
- Incorrect DB references: none found (every table/function named in the draft exists).
- Incorrect event/contract references: none invented; one under-specified (S3-10) and one
  dependency with an open envelope blocker (S3-12).
- Missing guest flow: surface (issuance/claim endpoints) is an explicit open decision — acceptable;
  but per-API trusted-path statement is missing (S3-04).
- Missing application-specific resume flow: S3-08.
- Missing failure/retry/recovery behavior: compensating cleanup event wording (S3-07);
  scanner-failure fail-closed is already correct; reparse = new job is baseline (PHASE-04 §6.3)
  and need not be an API in this stage.
- Missing notification/status behavior: REST/SSE covered; email/notification routing is a
  documented phased gap (registry OD-3) — draft should say so (S3-13).

## 7. Open decisions before freeze

Only real unresolved decisions (draft §7 kept unless noted):

1. **File transport** — now narrowed: signed-URL direction is APPROVED DIRECTION
   (REQ-RESUME-001); remaining decision = exact handshake/DTO, not multipart-vs-presigned
   from scratch (S3-05).
2. **Upload-time vs confirm-time active-resume selection** — NEW, created by the PD-002 vs
   draft mismatch (S3-01). Must be resolved before catalog freeze.
3. Exact request/response DTO names and HTTP status codes — legitimate catalog work.
4. Numeric rate limits — legitimate NEEDS_DECISION; no authoritative numbers exist in repo.
5. Idempotency key/header format — legitimate; note `resume_parsing_jobs.idempotency_key`
   and `processed_events` are the async-side precedents.
6. SSE endpoint, connection auth, reconnect/recovery DTO — legitimate; DECISION-02 :74
   explicitly delegates to the API catalog.
7. Guest upload/claim API surface — legitimate; baseline claim machine exists (PHASE-04 §8.2).
8. Compensation/retention sweeper ownership — narrowed: the compensating cleanup EVENT is an
   approved rule (Guide §8.6); only sweeper ownership/timing is open (S3-07).
9. Canonical writable-field allowlist for confirm — legitimate catalog work.
10. Dependency, not a new decision: `candidate-resume-parsed.v1` envelope fix (Stage-2 F-01)
    blocks the parse-time enrichment leg, not these four endpoints.

## 8. Exact required changes

Document changes required in `STAGE-03-NESTJS-API-REQUIREMENTS-SYNC.md` before Stage-03
approval (no code/schema/contract changes):

1. Add requirement-ID mapping table: API-RESUME-001..004 ↔ REQ-RESUME-001..007 (cite
   PHASE-01 :82-90); note REQ-RESUME-007 as unresolved future endpoint (fixes S3-03).
2. API-001: add PD-002 "Use as active profile resume" selection to the request contract with
   selected/unselected consequences, or record an explicit decision to move selection to confirm
   (fixes S3-01).
3. API-001: state duplicate-checksum REUSE rule and fix the "exactly one active document row"
   acceptance criterion (fixes S3-06).
4. API-001: cite signed-URL APPROVED DIRECTION as transport baseline; keep only handshake
   details TBD (fixes S3-05).
5. API-001: state compensating cleanup EVENT on storage-success + DB-failure (Guide §8.6);
   keep sweeper ownership as the open item (fixes S3-07).
6. API-004: expand the write transaction to the full Guide §6 pattern — `candidate_profiles`
   `FOR UPDATE`, expected-revision check with HTTP 409, `profile_change_history` insert
   (operation `confirm`), soft-delete-only, server-owned provenance/verification/revision
   fields (fixes S3-02).
7. API-004: name the outbox contract `candidate.profile.changed` v1 and its registered route
   (projection-queue → `/internal/tasks/candidate/projection`) (fixes S3-10).
8. All four APIs: add one line "access path = trusted SystemClient; no JWT+RLS path exists for
   these tables" with `17_rls.sql` evidence (fixes S3-04).
9. Add scope section: profile-resume first-upload flow only; application-specific resumes
   attach via `application_documents` in the application use case and are never promoted to the
   library (PD-002 :52-59) (fixes S3-08).
10. Add PD-002 library-limit (10 active library resumes) as upload/confirm validation or an
    explicit catalog-phase gap (fixes S3-09).
11. Add "current implementation status" note: security-scan route + ClamAV handler +
    clean→parse handoff + `security-scan-queue.json` implemented; `candidate.resume.parsed`
    output-only by design; envelope fix F-01 pending (fixes S3-11, S3-12).
12. Cite PHASE-04 §8.2 claim machine for the guest-confirm open decision and note
    notification routing as phased gap OD-3 (fixes S3-13).
13. Add a one-line common error policy (404/403 ownership-leak rule, 422 validation, 409 stale
    revision) or mark it explicit catalog work (fixes S3-14).

## 9. Final status

**READY AFTER REQUIRED FIXES**
