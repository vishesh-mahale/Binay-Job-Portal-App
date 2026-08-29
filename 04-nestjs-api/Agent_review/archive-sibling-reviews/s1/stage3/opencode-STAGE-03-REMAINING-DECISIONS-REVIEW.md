# Stage-03 Remaining Decisions Review

**Reviewer:** opencode (Independent Senior NestJS API Architect)
**Date:** 2026-08-26
**Status:** INDEPENDENT AUDIT COMPLETE
**Authority:** Actual SQL, frozen decisions, contracts, and approved product decisions only

---

## 1. Final verdict

**APPROVED WITH CHANGES**

The draft correctly identifies the 10 remaining decision areas and the decision-record rule. The questions are mostly well-defined, the options are realistic, and the security/performance/contract impacts are partially documented. However, the draft has three structural problems: (1) it lists one already-frozen decision as open, (2) it does not classify decisions as technical vs product/business vs operations, and (3) it omits several concrete missing decisions that the consolidated review and PD-002 surfaced. The decision-record template is sound but needs the type classification added.

---

## 2. Sources verified

| File | Path | Relevant Sections |
|---|---|---|
| Draft under review | `s1/codex/STAGE-03-REMAINING-DECISIONS.md` | Full file (148 lines) |
| STAGE-03-NESTJS-API-REQUIREMENTS-SYNC | `s1/codex/STAGE-03-NESTJS-API-REQUIREMENTS-SYNC.md` | Sections 2, 3, 6, 7 |
| STAGE-03-CONSOLIDATED-API-SYNC-REVIEW | `s1/codex/STAGE-03-CONSOLIDATED-API-SYNC-REVIEW.md` | S3-C-01 through S3-C-10 |
| DECISION-01 | `04-nestjs-api/DECISION-01-NESTJS-SUPABASE-ACCESS-MODEL-HINGLISH.md` | Client-boundary rule (§Mandatory) |
| DECISION-02 | `04-nestjs-api/DECISION-02-REALTIME-TRANSPORT-HINGLISH.md` | SSE auth, reconnect, recovery |
| PD-002 | `01-requirements/product-decisions/PD-002-ACTIVE-RESUME-SEARCH.md` | Active resume selection, 10-limit, non-promotion, library removal |
| PHASE-01 | `04-nestjs-api/PHASE-01-REQUIREMENTS-CONSOLIDATION.md` | REQ-RESUME-001..007 |
| PHASE-04 | `04-nestjs-api/PHASE-04-STATE-MACHINES-AND-TRANSACTIONS.md` | §6 Documents and resume processing, §8 Application lifecycle |
| NESTJS-IMPLEMENTATION-GUIDE | `04-nestjs-api/NESTJS-IMPLEMENTATION-GUIDE.md` | §8 Document upload, §9 Resume parsing, §11 Registered application |
| 02_enums.sql | `02-database/migrations/baseline/02_enums.sql:302-311,527-537` | `resume_processing_status`, `security_scan_status`, `parsing_job_status` |
| 06_documents.sql | `02-database/migrations/baseline/06_documents.sql` | `uploaded_documents`, `guest_upload_sessions` |
| 07_resume_processing.sql | `02-database/migrations/baseline/07_resume_processing.sql` | `resume_parsing_jobs`, `resume_parsed_data` |
| 08_candidates.sql | `02-database/migrations/baseline/08_candidates.sql` | `candidate_profiles`, `candidate_profile_documents`, `bump_candidate_profile_revision()`, `profile_change_history` |
| 09_applications.sql | `02-database/migrations/baseline/09_applications.sql:138-164` | `application_profile_snapshots` (immutable) |
| 17_rls.sql | `02-database/migrations/baseline/17_rls.sql` | No authenticated direct-read on `uploaded_documents`/parsing tables |
| candidate-profile-changed.v1.json | `contracts/events/candidate-profile-changed.v1.json` | `change_type` enum, `active_document_id` |
| security-scan-result.v1.json | `contracts/schemas/security-scan-result.v1.json` | Verdict enum: `clean`, `infected`, `error` |

---

## 3. Decision-by-decision review

| Decision ID | Correct question? | Type | Evidence | Verdict | Required change |
|---|---|---|---|---|---|
| D-01: DTOs/status codes/error envelope | ✅ Yes | TECHNICAL | 4 APIs correctly listed; error families correctly identified | ✅ CORRECT | Add: envelope format is `{ statusCode, error: { code, message, details? }, trace_id }`. Add: response DTOs must include `trace_id` for distributed tracing. |
| D-02: Upload handshake | ✅ Yes | TECHNICAL | Security direction fixed in Stage 1; two options correctly listed | ⚠️ INCOMPLETE | Missing: security asymmetry between options (Option B needs server-side checksum verification before DB write). Missing: Option B needs an idempotent finalize step if client upload succeeds but metadata commit fails. |
| D-03: Rate limits | ✅ Yes | PRODUCT/BUSINESS + OPERATIONS | No authoritative numeric source exists | ⚠️ INCOMPLETE | Missing: status polling separate limit (high-frequency polling is the primary abuse vector for this API). Missing: per-guest-session rate limits (guest sessions have no authenticated identity to rate-limit against). |
| D-04: SSE endpoint/recovery | ✅ Yes | TECHNICAL | Decision-02 correctly referenced; freeze items accurately listed | ✅ CORRECT | Add: connection authentication must use short-lived ticket, not long-lived JWT in query string (per Decision-02 §4). Add: `Last-Event-ID` handling must be defined per use-case. |
| D-05: Guest upload/claim | ✅ Yes | PRODUCT/BUSINESS + TECHNICAL | DB rules correctly referenced; `consume_guest_upload_session` in `09_applications.sql` | ⚠️ INCOMPLETE | Missing: guest session consumption is specifically part of the application transaction (`09_applications.sql:503-530`), not a separate upload flow. Missing: guest claim is a separate state machine (`pending → verified → merged`) that needs its own API surface. |
| D-06: Application-specific resume | ✅ Yes | PRODUCT/BUSINESS + TECHNICAL | PD-002 non-promotion rule; `application_profile_snapshots` immutable | ✅ CORRECT | Add: application-specific resume uses the same security scan + parse pipeline but does NOT create `candidate_profile_documents` link or trigger `candidate.profile.changed` event. |
| D-07: Confirm writable-field allowlist | ✅ Yes | TECHNICAL | `08_candidates.sql` canonical tables; `candidate_profiles` column list | ⚠️ INCOMPLETE | Missing: explicit list of writable tables (`candidate_profiles`, `candidate_links`, `candidate_skills`, `candidate_experiences`, `candidate_educations`, `candidate_certifications`, `candidate_projects`, `candidate_languages`, `candidate_awards`). Missing: `profile_change_history` is written by server, not client. |
| D-08: Idempotency/optimistic concurrency | ✅ Yes | TECHNICAL | `resume_parsing_jobs.idempotency_key` pattern; `profile_revision` + `FOR UPDATE` | ⚠️ INCOMPLETE | Missing: the confirm idempotency key scope must be `user + document` (not just document). Missing: same-key replay must return the original result with the current `profile_revision`, not a fresh computation. Missing: `expected_revision` must be in the request, not the response. |
| D-09: Object cleanup ownership | ✅ Yes | OPERATIONS | `deleted_at` soft-delete; `uploaded_documents_no_hard_delete` trigger | ⚠️ INCOMPLETE | Missing: the compensating cleanup event should be emitted when DB commit fails after storage upload (per `NESTJS-IMPLEMENTATION-GUIDE.md:267`). Missing: the cleanup sweeper should also handle orphaned `resume_parsing_jobs` rows (document deleted but job still references it). |
| D-10: Fast-track name extraction | ✅ Yes | NEEDS USER DECISION | `REQ-RESUME-007` marked `NEEDS_DECISION` in PHASE-01 | ✅ CORRECT | No change needed. This is correctly identified as optional and requiring user decision. |

---

## 4. Missing decisions

| ID | Question | Why it matters | Evidence | Recommended options | Owner |
|---|---|---|---|---|---|
| MD-01 | `/api/v1` route prefix convention — is this the canonical NestJS public route prefix? | All four API paths use `/api/v1/resumes/*` in the requirements sync but the prefix is not formally frozen. Every controller and test must use the same prefix. | `STAGE-03-NESTJS-API-REQUIREMENTS-SYNC.md:254-255` lists it as open decision #1 | Freeze `/api/v1` as the canonical prefix. Record it as a convention decision, not a feature decision. | Architect |
| MD-02 | Status API response DTO: how to map the two-track enums to a single UI-safe `stage` field? | The UI needs a deterministic projection of `security_scan_status` + `processing_status` into a single displayable stage. Without this, the frontend team cannot implement the status screen. | `02_enums.sql:302-311,527-528` — two separate enums | Define a deterministic mapping function (e.g., `scan=clean + processing=parsed → "review_ready"`). Record the complete stage mapping table. | Product + Architect |
| MD-03 | Parsed-data API response field allowlist — which fields from `resume_parsed_data.normalized_output` are exposed? | The review form needs specific fields (name, email, phone, skills, experience, education, etc.). Without an allowlist, the API either over-exposes or under-exposes parsed data. | `07_resume_processing.sql:69-100` — `normalized_output JSONB` | Define a fixed allowlist of safe fields. Do not expose `raw_ai_output` or `extracted_text`. | Product + Architect |
| MD-04 | Upload response DTO — what exactly is returned on successful upload? | The candidate needs `document_id` and initial status. The exact shape affects frontend implementation. | `STAGE-03-NESTJS-API-REQUIREMENTS-SYNC.md:102-103` — "immediate acknowledgement" | Return `{ document_id, security_scan_status, processing_status, created_at }` | Architect |
| MD-05 | Confirm response DTO — what exactly is returned on successful confirmation? | The candidate needs the new `profile_revision` and projection status. The exact shape affects frontend implementation. | `STAGE-03-NESTJS-API-REQUIREMENTS-SYNC.md:211-212` — "confirmation result with candidate/profile revision" | Return `{ candidate_id, profile_revision, projection_status, document_linked }` | Architect |
| MD-06 | Error envelope format — what JSON structure for all error responses? | Every API needs a consistent error shape. Without this, frontend error handling is ad-hoc. | Common REST API practice; not defined anywhere in repository | Define `{ statusCode, error: { code, message, details? }, trace_id }` | Architect |
| MD-07 | Active profile resume selection: does the upload request carry a boolean `use_as_active_profile_resume` field, or is it a separate endpoint? | PD-002 requires this choice at upload time. The exact mechanism (boolean in upload request vs separate selection endpoint) affects the API contract. | `PD-002:61-65` — "Upload ke samaye candidate select kar sake" | Include a boolean `use_as_active_profile_resume` field in the upload request DTO. | Product + Architect |
| MD-08 | 10-resume library limit enforcement: where is the check performed — upload time or confirm time? | PD-002 says maximum 10 active library resumes. The limit check timing affects the user experience (upload rejection vs confirm rejection). | `PD-002:27-30,47-50` — library limit and archive-before-add rule | Check at confirm time (when the document is linked to `candidate_profile_documents`), not at upload time. Allow upload; reject confirm if limit exceeded. | Product |

---

## 5. Incorrect or already-frozen decisions

| ID | Decision in draft | Actual status | Source | Correction |
|---|---|---|---|---|
| CD-01 | D-02 lists upload handshake as open: "Only the client-to-storage handshake detail remains" | **ALREADY FROZEN** at security direction level | `SECURITY-SCAN-IMPLEMENTATION-STAGES-AND-VERIFICATION-PLAN.md:31-32` — "file private storage mein `security_scan_status = pending` ke saath jayegi" | The security direction (private storage, NestJS validation, no signed URL in outbox) is frozen. What remains is the implementation-level choice between multipart-to-NestJS vs presigned-to-storage. The draft should clarify: "Security direction frozen; only the implementation-level transport choice remains open." |
| CD-02 | D-07 lists confirm writable-field restrictions but does not reference the frozen client-boundary rule | **ALREADY FROZEN** | `DECISION-01:130-139` — mandatory UserContextClient/SystemClient separation | The writable-field allowlist must be enforced through SystemClient. Add: "Server-side field filtering uses SystemClient; client-supplied fields that match server-owned columns are rejected." |
| CD-03 | D-04 references Decision-02 but does not mention the frozen auth mechanism | **ALREADY FROZEN** | `DECISION-02:34` — "authenticated short-lived ticket/secure cookie/fetch-based JWT mechanism; long-lived JWT query string mein nahi jayega" | Add: "SSE connection auth uses short-lived ticket mechanism per Decision-02. Long-lived JWT in query string is forbidden." |

---

## 6. Recommended choices

For technical decisions where the repository provides sufficient evidence:

| Decision | Recommendation | Confidence | Evidence |
|---|---|---|---|
| D-01 (Error envelope) | `{ statusCode, error: { code, message, details? }, trace_id }` | HIGH | Standard REST pattern; `trace_id` already used in contracts/tasks |
| D-02 (Upload handshake) | **Option A** (multipart → NestJS → storage) for first version | HIGH | Simpler; NestJS controls checksum computation server-side; no client-provided checksum forgery risk; matches `NESTJS-IMPLEMENTATION-GUIDE.md:263` — "SHA-256 nikalega" (server computes) |
| D-04 (SSE auth) | Short-lived ticket per Decision-02; no JWT in query string | FROZEN | `DECISION-02:34` |
| D-07 (Writable-field allowlist) | Server-side allowlist of writable columns per canonical table; reject unknowns; server owns `profile_revision`, `primary_source_type`, `verification_status`, `row_version`, audit timestamps | HIGH | `08_candidates.sql` column definitions; `NESTJS-IMPLEMENTATION-GUIDE.md:303-316` evidence rules |
| D-08 (Idempotency) | `Idempotency-Key` header; scope = `user_id + document_id`; same-key replay returns cached result with current `profile_revision`; different-key duplicate returns `409 Conflict` | HIGH | `resume_parsing_jobs.idempotency_key` pattern; `profile_revision` optimistic concurrency |
| MD-01 (Route prefix) | Freeze `/api/v1` as canonical prefix | HIGH | Already used in requirements sync |
| MD-02 (Status mapping) | Deterministic function: `compute_ui_stage(scan_status, processing_status)` | HIGH | Two enums exist; deterministic projection is required |
| MD-07 (Active resume selection) | Boolean `use_as_active_profile_resume` in upload request DTO | HIGH | `PD-002:61-65` — "Upload ke samaye candidate select kar sake" |

For product/business decisions — these require user/product-owner approval:

| Decision | Recommendation | Needs approval? |
|---|---|---|
| D-03 (Rate limits) | Needs product/capacity input | YES — product owner |
| D-05 (Guest API surface) | Needs product decision on guest flow scope | YES — product owner |
| D-10 (Fast-track name extraction) | Needs product decision on whether to include | YES — product owner |
| MD-08 (10-limit enforcement timing) | Check at confirm time | YES — product owner |

---

## 7. Acceptance tests

| Decision | Acceptance test |
|---|---|
| D-01 (DTOs/error envelope) | All four APIs return responses matching the frozen envelope. Invalid requests return the defined error shape with `code`, `message`, and `trace_id`. |
| D-02 (Upload handshake) | Upload succeeds only when NestJS validates MIME/extension/magic bytes/checksum server-side. Client-provided checksums that differ from server-computed checksums are rejected. |
| D-03 (Rate limits) | Exceeding the defined rate limit returns HTTP 429 with `Retry-After` header. Authenticated users and guest sessions have separate limit buckets. |
| D-04 (SSE endpoint/recovery) | SSE connection with expired ticket is rejected. Disconnect + reconnect + REST fetch recovers the correct authoritative state. `Last-Event-ID` is handled correctly. |
| D-05 (Guest upload/claim) | Guest session validation checks `status = 'active'`, `expires_at > NOW()`, `revoked_at IS NULL`. Guest claim transitions follow the approved state machine. |
| D-06 (Application-specific resume) | Application-only resume does NOT create `candidate_profile_documents` link. Application-only resume does NOT emit `candidate.profile.changed` event. `application_profile_snapshots` is immutable. |
| D-07 (Writable-field allowlist) | Confirm request with a server-owned field (e.g., `profile_revision`) returns HTTP 400 validation error. Confirm request with unknown field returns HTTP 400. |
| D-08 (Idempotency/concurrency) | Same `Idempotency-Key` on confirm returns the original result. Different key with same document returns `409 Conflict` if `profile_revision` has changed. Stale `expected_revision` returns `409 Conflict`. |
| D-09 (Object cleanup) | Storage upload succeeds but DB commit fails → compensating cleanup event is emitted. Orphaned `resume_parsing_jobs` (document soft-deleted) are cleaned up by sweeper. |
| D-10 (Fast-track name extraction) | If approved: lightweight extraction returns name within 2 seconds. If rejected: no additional endpoint exists. |
| MD-01 (Route prefix) | All four APIs respond at `/api/v1/resumes/*`. Non-prefixed paths return 404. |
| MD-02 (Status mapping) | Status API returns a deterministic `stage` field. Same `security_scan_status` + `processing_status` always produces the same `stage`. |
| MD-03 (Parsed-data allowlist) | Parsed-data API returns only the defined allowlisted fields. `raw_ai_output` is never returned. |
| MD-07 (Active resume selection) | Upload with `use_as_active_profile_resume = true` creates `candidate_profile_documents` link on confirm. Upload with `false` does not. |

---

## 8. Freeze readiness

### Decisions that can be closed with agent recommendation

| Decision | Agent recommendation | Action |
|---|---|---|
| D-01 (Error envelope) | `{ statusCode, error: { code, message, details? }, trace_id }` | Close with this recommendation |
| D-02 (Upload handshake) | Option A (multipart → NestJS → security direction frozen, implementation choice remains) | Close security direction; keep implementation choice open |
| D-04 (SSE endpoint/recovery) | Short-lived ticket, no JWT in query string, exponential reconnect, REST recovery | Close with Decision-02 frozen rules |
| D-07 (Writable-field allowlist) | Server-side allowlist; reject unknowns and server-owned fields | Close with this recommendation |
| D-08 (Idempotency) | `Idempotency-Key` header; `user + document` scope; same-key replay; `409` on stale revision | Close with this recommendation |
| MD-01 (Route prefix) | Freeze `/api/v1` | Close with this recommendation |
| MD-02 (Status mapping) | Deterministic function `compute_ui_stage()` | Close with this recommendation |
| MD-07 (Active resume selection) | Boolean in upload DTO | Close with this recommendation |

### Decisions that need user/business approval

| Decision | Why approval needed |
|---|---|
| D-03 (Rate limits) | Numeric values require product/capacity review |
| D-05 (Guest upload/claim API surface) | Scope decision: full guest flow vs deferral |
| D-10 (Fast-track name extraction) | Product decision: include vs exclude |
| MD-08 (10-limit enforcement timing) | UX decision: upload-time rejection vs confirm-time rejection |

### Decisions that block Stage-03 freeze

| Decision | Blocker reason |
|---|---|
| MD-02 (Status mapping) | Without the deterministic stage mapping, the status API cannot return a UI-consumable response. This blocks API-RESUME-002 implementation. |
| MD-03 (Parsed-data allowlist) | Without the field allowlist, the parsed-data API cannot define its response DTO. This blocks API-RESUME-003 implementation. |
| D-07 (Writable-field allowlist) | Without the explicit writable-field list, the confirm API cannot validate requests. This blocks API-RESUME-004 implementation. |
| D-08 (Idempotency/concurrency) | Without the idempotency key scope and revision conflict behavior, the confirm API cannot implement idempotency. This blocks API-RESUME-004 implementation. |

---

## 9. Final status

**READY AFTER DOCUMENT FIXES**

The draft is structurally sound and correctly identifies the decision areas. However, before Stage-03 freeze:

1. Add decision type classification (TECHNICAL / PRODUCT/BUSINESS / OPERATIONS / NEEDS USER DECISION) to each item
2. Correct D-02: clarify that security direction is frozen; only implementation choice remains
3. Add missing decisions MD-01 through MD-08
4. Reference frozen decisions (Decision-01 client-boundary, Decision-02 SSE auth) where applicable
5. Close technical decisions with agent recommendations (D-01, D-04, D-07, D-08, MD-01, MD-02, MD-07)
6. Identify which decisions need user/business approval (D-03, D-05, D-10, MD-08)
7. Identify which decisions block freeze (MD-02, MD-03, D-07, D-08)

**Status:** `READY AFTER DOCUMENT FIXES — USER/BUSINESS DECISIONS STILL REQUIRED`
