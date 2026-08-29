# Stage-03 API Sync Independent Review

**Reviewer:** opencode (Independent Senior NestJS API Architect)
**Date:** 2026-08-26
**Status:** INDEPENDENT AUDIT COMPLETE
**Authority:** Actual SQL, contracts, code, and approved decision records only

---

## 1. Final verdict

**APPROVED WITH CHANGES**

The draft is structurally sound and correctly traces the first-resume flow from upload through confirm. The four APIs are correctly identified, the controlled hybrid access model is correctly applied, and the transaction boundaries are correctly described. However, the draft has several factual inaccuracies against the actual codebase, missing critical details that would block implementation, and contains an outdated contract reference that must be corrected.

---

## 2. Repository evidence checked

| File | Path | Relevant Sections |
|---|---|---|
| Draft under review | `s1/codex/STAGE-03-NESTJS-API-REQUIREMENTS-SYNC.md` | Full file (204 lines) |
| AGENTS.md | Root `AGENTS.md` | Working rules, authority order |
| Security scan plan | `s1/codex/SECURITY-SCAN-IMPLEMENTATION-STAGES-AND-VERIFICATION-PLAN.md` | Stage 3 definition, non-negotiable rules |
| DECISION-01 | `04-nestjs-api/DECISION-01-NESTJS-SUPABASE-ACCESS-MODEL-HINGLISH.md` | Controlled hybrid model, UserContextClient/SystemClient |
| DECISION-02 | `04-nestjs-api/DECISION-02-REALTIME-TRANSPORT-HINGLISH.md` | SSE transport, recovery rules |
| PLAN-REQUIREMENTS | `04-nestjs-api/PLAN-REQUIREMENTS-TO-IMPLEMENTATION-HINGLISH.md` | Phase 0-9 process, authority order |
| 02_enums.sql | `02-database/migrations/baseline/02_enums.sql:527-537` | `security_scan_status`, `parsing_job_status` enums |
| 06_documents.sql | `02-database/migrations/baseline/06_documents.sql` | `uploaded_documents`, `guest_upload_sessions` tables |
| 07_resume_processing.sql | `02-database/migrations/baseline/07_resume_processing.sql` | `resume_parsing_jobs`, `resume_parsed_data` tables |
| 08_candidates.sql | `02-database/migrations/baseline/08_candidates.sql` | `candidate_profiles`, `candidate_profile_documents`, `bump_candidate_profile_revision()` |
| 15_infrastructure.sql | `02-database/migrations/baseline/15_infrastructure.sql` | `outbox_events`, `processed_events` tables |
| 17_rls.sql | `02-database/migrations/baseline/17_rls.sql` | RLS policies, grants, `owns_candidate()` |
| security-scan-requested.v1.json | `contracts/events/security-scan-requested.v1.json` | Event contract: `document_id`, no `storage_url` |
| security-scan-task.v1.json | `contracts/tasks/security-scan-task.v1.json` | Task contract: 4-field uniform pattern |
| resume-parse-requested.v1.json | `contracts/events/resume-parse-requested.v1.json` | Event contract: flat draft-07 |
| resume-parse-task.v1.json | `contracts/tasks/resume-parse-task.v1.json` | Task contract: 4-field uniform pattern |
| candidate-resume-parsed.v1.json | `contracts/events/candidate-resume-parsed.v1.json` | Chained output event |
| candidate-profile-changed.v1.json | `contracts/events/candidate-profile-changed.v1.json` | Event contract: `change_type`, `active_document_id` |
| AGGREGATE-ID-SEMANTICS.md | `contracts/AGGREGATE-ID-SEMANTICS.md` | Phase 1/2 route aggregate_id mapping |
| G1-ENVELOPE-ALIGNMENT.md | `contracts/G1-ENVELOPE-ALIGNMENT.md` | Phase 1 trigger contract alignment status |
| event-route.registry.ts | `05-outbox-dispatcher-nestjs/src/routing/event-route.registry.ts` | Dispatcher routes for all event types |
| payload.builder.ts | `05-outbox-dispatcher-nestjs/src/routing/payload.builder.ts` | Uniform 4-field task payload builder |
| tasks.py (FastAPI) | `07-fastapi-ai-worker/app/schemas/tasks.py` | Pydantic models including `SecurityScanTaskPayload` |
| task_handlers.py (FastAPI) | `07-fastapi-ai-worker/app/api/v1/task_handlers.py` | Security scan handler, resume parse handler |

---

## 3. What is correct

| Area | Verdict | Evidence |
|---|---|---|
| Four API endpoints correctly identified | ✅ CORRECT | `SECURITY-SCAN-IMPLEMENTATION-STAGES-AND-VERIFICATION-PLAN.md:82-86` lists exactly these four endpoints |
| Upload writes `uploaded_documents` with `security_scan_status = 'pending'` | ✅ CORRECT | `06_documents.sql:84` — default is `'pending'`; `02_enums.sql:527-528` — `'pending'` is valid |
| Upload writes `security.scan.requested` outbox event | ✅ CORRECT | `security-scan-requested.v1.json:29` — `event_type = 'security.scan.requested'` |
| Upload stores file in private storage outside DB transaction | ✅ CORRECT | `SECURITY-SCAN-IMPLEMENTATION-STAGES-AND-VERIFICATION-PLAN.md:31-32` — file goes to private storage, DB records metadata |
| Status API reads `uploaded_documents` + `resume_parsing_jobs` | ✅ CORRECT | `06_documents.sql:72-106` (uploaded_documents), `07_resume_processing.sql:39-67` (resume_parsing_jobs) |
| Parsed-data API reads `resume_parsed_data` | ✅ CORRECT | `07_resume_processing.sql:69-100` — immutable result table |
| Confirm writes `candidate_profile_documents` | ✅ CORRECT | `08_candidates.sql:111-125` — document linking table |
| Confirm bumps `profile_revision` via `bump_candidate_profile_revision()` | ✅ CORRECT | `08_candidates.sql:89-109` — function exists, called once per logical save |
| Controlled hybrid access model correctly described | ✅ CORRECT | `DECISION-01:60-115` — limited RLS reads + trusted server writes |
| Outbox event + DB row committed atomically | ✅ CORRECT | `15_infrastructure.sql:23-89` — outbox in same transaction; `DECISION-01:92` — external calls outside transaction |
| No signed URLs/task payload in outbox events | ✅ CORRECT | `security-scan-requested.v1.json:31-55` — only `document_id`, no storage URLs |
| SSE is live optimization, DB/REST is recovery | ✅ CORRECT | `DECISION-02:7` — "Realtime delivery sirf UI optimization hai" |
| Security scan fail-closed: infected does not enqueue parsing | ✅ CORRECT | `task_handlers.py:154` — only `status == "clean"` triggers parsing job insert |
| Guest upload session exists | ✅ CORRECT | `06_documents.sql:51-70` — `guest_upload_sessions` table with constraints |
| `consume_guest_upload_session()` function exists | ✅ CORRECT | `09_applications.sql:503-530` — atomic one-time consumption |
| Dispatcher route for `security.scan.requested` exists | ✅ CORRECT | `event-route.registry.ts:80-84` — Phase 2 route with correct task contract |
| `SecurityScanTaskPayload` Pydantic model exists | ✅ CORRECT | `tasks.py:56-61` — matches 4-field uniform pattern |
| Security scan handler exists in FastAPI | ✅ CORRECT | `task_handlers.py:62-185` — `/internal/tasks/security/scan` endpoint |
| Resume parse handler checks `security_scan_status == "clean"` | ✅ CORRECT | `task_handlers.py:278` — `if security_status == "clean": pass` |
| `candidate.resume.parsed` event emitted after parsing | ✅ CORRECT | `task_handlers.py:404-414` — emitted only when `candidate_id_for_event` exists |
| `bump_candidate_profile_revision()` increments revision | ✅ CORRECT | `08_candidates.sql:89-109` — `profile_revision + 1`, `last_profile_change_at = NOW()` |
| `profile_change_history` is append-only | ✅ CORRECT | `08_candidates.sql:577-578` — immutable trigger |

---

## 4. Problems and missing items

| ID | Severity | Problem | Evidence | Recommended correction |
|---|---|---|---|---|
| P-01 | BLOCKER | Draft line 80-82 status sequence does not match actual enum values. Lists "uploaded → security scan pending → scanning → clean/failed/infected → parsing queued/processing → parsed review ready or failed" but this mixes two different status columns. `uploaded_documents.security_scan_status` has `pending/scanning/clean/infected/failed/quarantined` and `uploaded_documents.processing_status` has `uploaded/queued/processing/parsed/ai_enriching/completed/failed/partial`. The draft never mentions `processing_status` or how it transitions. | `02_enums.sql:302-311` (resume_processing_status), `02_enums.sql:527-528` (security_scan_status) | Split the status sequence into two parallel tracks: (1) security_scan_status: pending → scanning → clean/infected/failed/quarantined; (2) processing_status: uploaded → queued → processing → parsed → completed/failed. Document which column the API reads for each stage. |
| P-02 | HIGH | Draft line 168 says "Write the approved profile-change outbox event for projection/embedding rebuild" but does not specify the exact event type. The correct event type is `candidate.profile.changed` (not `candidate.projection.rebuilt`). The contract has specific fields: `change_type` and `active_document_id`. | `candidate-profile-changed.v1.json:12-13` — `change_type` enum and `active_document_id` field | Specify: emit `candidate.profile.changed` event with `change_type = 'profile_updated'` (or `'document_linked'` if document linking triggers it) and `active_document_id`. |
| P-03 | HIGH | Draft does not mention the `UserContextClient` / `SystemClient` separation that DECISION-01 defines as mandatory. DECISION-01 line 132-139 explicitly requires "do explicitly separated adapters/clients" in NestJS. This is a core architectural constraint for all four APIs. | `DECISION-01:132-139` — mandatory client-boundary rule | Add to Common Rules (Section 2): "NestJS MUST use two explicitly separated clients: UserContextClient for approved user-context reads with RLS, and SystemClient for trusted business transactions/workers. SystemClient MUST NOT be accidentally injectable in user-facing repositories." |
| P-04 | HIGH | Draft line 52 says file transport is `NEEDS_DECISION` ("multipart versus storage-upload/presigned flow"). However, the security scan decision (Stage 1) already resolved this: file goes to private storage, NestJS validates and records metadata. The decision is made; it should not be listed as open. | `SECURITY-SCAN-IMPLEMENTATION-STAGES-AND-VERIFICATION-PLAN.md:31-32` — file in private storage with `security_scan_status = pending` | Change to: "File transport: NestJS receives file, validates, stores in private storage, records metadata. Exact multipart vs presigned handshake is implementation detail within this approved direction." |
| P-05 | HIGH | Draft does not mention `processing_status` on `uploaded_documents` at all. This column (`resume_processing_status` enum) tracks document-level processing lifecycle (`uploaded → queued → processing → parsed → completed/failed`). The status API needs to read this column, and the confirm/projection flow depends on it. | `06_documents.sql:86` — `processing_status resume_processing_status NOT NULL DEFAULT 'uploaded'` | Add to API-RESUME-002 and the status sequence: "The API reads both `security_scan_status` and `processing_status` from `uploaded_documents` to determine the full status picture." |
| P-06 | MEDIUM | Draft line 157 says preconditions for confirm include "security status is `clean`" but the `security_scan_status` enum also includes `quarantined` and `failed`. The confirm endpoint should explicitly reject `infected`, `quarantined`, `failed`, and `pending`/`scanning` states. | `02_enums.sql:527-528` — enum values | Clarify: "security_scan_status MUST be 'clean'; all other states (`pending`, `scanning`, `infected`, `failed`, `quarantined`) are rejected." |
| P-07 | MEDIUM | Draft line 84-86 discusses orphan object compensation but does not specify the cleanup mechanism. The `uploaded_documents` table has `deleted_at` (soft delete) and a hard-delete trigger guard (`uploaded_documents_no_hard_delete`). The draft should mention that orphan objects use soft delete, not physical deletion. | `06_documents.sql:116-120` — `reject_immutable_row_change()` on DELETE; `06_documents.sql:90` — `deleted_at` column | Clarify: "Orphan objects are soft-deleted via `deleted_at`. Physical deletion is reserved for a separately authorized retention/purge workflow." |
| P-08 | MEDIUM | Draft line 157 says preconditions include "document is active" but does not define what "active" means. The `uploaded_documents` table uses `deleted_at IS NULL` to indicate active documents. The confirm endpoint must check `deleted_at IS NULL`. | `06_documents.sql:90` — `deleted_at TIMESTAMPTZ` | Define: "Document is active means `deleted_at IS NULL`." |
| P-09 | MEDIUM | Draft line 48-50 mentions "guest upload only through an explicitly approved guest session" but does not reference the `guest_upload_session_status` enum or the session validation constraints. The `guest_upload_sessions` table has `status`, `expires_at`, `revoked_at` checks. | `06_documents.sql:51-70` — session constraints; `02_enums.sql:531-533` — `guest_upload_session_status` enum | Add: "Guest session validation must check `status = 'active'`, `expires_at > NOW()`, `revoked_at IS NULL` per the `guest_upload_sessions` table constraints." |
| P-10 | MEDIUM | Draft line 167 mentions `candidate_profile_documents` for document linking but does not specify the `document_role` value. For resume uploads, `document_role` should be `'resume'`. The `document_role` enum exists in the database. | `08_candidates.sql:114` — `document_role document_role NOT NULL` | Specify: "Link the document through `candidate_profile_documents` with `document_role = 'resume'`." |
| P-11 | MEDIUM | Draft line 80-82 status sequence mentions "infected" as a terminal state but does not mention `quarantined`. The `security_scan_status` enum includes `quarantined` as a valid state. The FastAPI security scan handler only maps to `clean` or `infected` (`task_handlers.py:142`), but the database supports `quarantined`. | `02_enums.sql:527-528` — `quarantined` in enum; `task_handlers.py:142` — only `clean`/`infected` | Add `quarantined` to the status sequence. Note that `quarantined` may be set by a separate manual/admin workflow, not the automated scanner. |
| P-12 | MEDIUM | Draft line 181 says "One logical confirmation causes one revision bump and one downstream projection request" but does not specify which outbox event triggers the projection. The projection is triggered by `candidate.profile.changed`, which is routed to the `projection-queue` in the dispatcher. | `event-route.registry.ts:43-47` — `candidate.profile.changed` → `projection-queue` | Specify: "One revision bump produces one `candidate.profile.changed` outbox event, dispatched to the projection-queue for `candidate_search_profiles` rebuild." |
| P-13 | LOW | Draft line 20-21 references `contracts/events/candidate-resume-parsed.v1.json` as an authoritative source, but this is a chained output event from FastAPI, not a NestJS-produced contract. NestJS does not produce this event. | `AGGREGATE-ID-SEMANTICS.md:35` — "Emitted after resume parsing completes" (FastAPI) | Clarify: `candidate-resume-parsed.v1.json` is a FastAPI output event; NestJS is the consumer (if needed), not the producer. |
| P-14 | LOW | Draft line 190 says "SSE nudge" but does not mention the DECISION-02 reconnect/recovery rules. DECISION-02 line 40-48 specifies: exponential reconnect with jitter → authenticate again → REST authoritative state fetch → stream resume. | `DECISION-02:40-48` — reconnect and recovery rules | Add: "SSE reconnect follows DECISION-02: exponential backoff with jitter, re-authenticate, then REST-fetch authoritative state." |
| P-15 | LOW | Draft line 174-176 discusses idempotency for confirm but does not mention the `idempotency_key` column on `resume_parsing_jobs` (`07_resume_processing.sql:50`). The pattern of using idempotency keys for deduplication is established in the codebase. | `07_resume_processing.sql:50` — `idempotency_key VARCHAR(255) NOT NULL UNIQUE` | Reference the established idempotency pattern: "Use a unique idempotency key per confirmation attempt, following the pattern established in `resume_parsing_jobs.idempotency_key`." |

---

## 5. API-by-API review

### API-RESUME-001 — POST /resumes/upload

| Check | Verdict | Evidence |
|---|---|---|
| Requirement traceability | ✅ | Security scan plan Stage 3 line 82 |
| Actor/auth | ✅ | DECISION-01 controlled hybrid; `17_rls.sql:162-176` authenticated SELECT grants |
| Guest session behavior | ⚠️ INCOMPLETE | Draft mentions guest sessions but does not reference session validation constraints (`status='active'`, `expires_at`, `revoked_at`) from `06_documents.sql:51-70` |
| Request DTO | ✅ NEEDS_DECISION | Correctly marked as TBD; file transport is implementation detail |
| Validation rules | ✅ CORRECT | Auth, size, MIME, extension, magic bytes, checksum correctly listed |
| Tables read/written | ✅ CORRECT | `uploaded_documents` (write), `outbox_events` (write), `guest_upload_sessions` (read for guest) |
| Transaction boundary | ✅ CORRECT | Storage upload outside DB transaction; DB insert + outbox in single transaction |
| Outbox event | ✅ CORRECT | `security.scan.requested` with `document_id` only |
| Event contract | ✅ CORRECT | `security-scan-requested.v1.json` — no `storage_url`, only `document_id` |
| Dispatcher route | ✅ CORRECT | `event-route.registry.ts:80-84` — `security-scan-queue` |
| FastAPI consumer | ✅ CORRECT | `task_handlers.py:62-185` — security scan handler exists |
| Idempotency | ⚠️ INCOMPLETE | Draft says "need an idempotency strategy" but does not specify the duplicate checksum indexes (`uq_uploaded_document_checksum_owner`, `uq_uploaded_document_checksum_guest_session` at `06_documents.sql:122-130`) |
| Rate limit | ✅ CORRECT | Marked as `NEEDS_DECISION` |
| Error behavior | ⚠️ INCOMPLETE | Draft mentions orphan compensation but does not define soft-delete mechanism or the `uploaded_documents_no_hard_delete` trigger |
| PII/security | ✅ CORRECT | No signed URLs, tokens, or resume content in payloads |
| Acceptance criteria | ✅ CORRECT | Valid criteria present |

**Missing from upload API:**
- `processing_status` initial value (`'uploaded'`) not mentioned
- Duplicate checksum detection behavior (reuse existing document vs reject)
- Document type parameter (resume vs cover letter vs certificate)

### API-RESUME-002 — GET /resumes/:id/status

| Check | Verdict | Evidence |
|---|---|---|
| Requirement traceability | ✅ | Security scan plan Stage 3 |
| Actor/auth | ✅ | Owner/guest session boundary correct |
| Tables read | ✅ CORRECT | `uploaded_documents` + `resume_parsing_jobs` |
| Response DTO | ⚠️ INCOMPLETE | Draft mentions "stable status DTO" but does not specify that it reads BOTH `security_scan_status` AND `processing_status` from `uploaded_documents` |
| Transaction boundary | ✅ CORRECT | Read-only query |
| SSE/recovery | ✅ CORRECT | Database/REST is authoritative; SSE is nudge |
| Acceptance criteria | ✅ CORRECT | Terminal states correctly handled |

**Missing from status API:**
- Does not mention reading `processing_status` column
- Does not mention reading `resume_parsed_data` for parsed status details
- Does not mention `resume_parsing_job_events` for timeline/progress
- Does not specify how to differentiate "scan in progress" from "parse in progress" from "ready for review"

### API-RESUME-003 — GET /resumes/:id/parsed-data

| Check | Verdict | Evidence |
|---|---|---|
| Tables read | ✅ CORRECT | `resume_parsing_jobs`, `resume_parsed_data`, `uploaded_documents` |
| Immutability | ✅ CORRECT | `resume_parsed_data` has immutable trigger |
| Precondition | ✅ CORRECT | Only successfully parsed documents return data |
| Cross-user rejection | ✅ CORRECT | Owner/guest session boundary |
| Transaction boundary | ✅ CORRECT | Read-only query |
| Acceptance criteria | ✅ CORRECT | Not-ready response for unparsed data |

**Missing from parsed-data API:**
- Does not mention `resume_parsing_artifacts` (OCR outputs, page images) that may be needed
- Does not specify which fields from `resume_parsed_data.normalized_output` are exposed
- Does not mention `resume_parsing_job_events` for processing timeline

### API-RESUME-004 — POST /resumes/:id/confirm

| Check | Verdict | Evidence |
|---|---|---|
| Actor/auth | ✅ CORRECT | Owning authenticated candidate only |
| Preconditions | ⚠️ PARTIAL | Missing `deleted_at IS NULL` check for document activity |
| Write transaction steps | ✅ MOSTLY CORRECT | 6 steps correctly identified |
| `bump_candidate_profile_revision()` | ✅ CORRECT | Called once per logical save |
| `candidate_profile_documents` linking | ⚠️ INCOMPLETE | Does not specify `document_role = 'resume'` |
| Outbox event | ⚠️ INCOMPLETE | Does not specify exact event type (`candidate.profile.changed`) or its fields (`change_type`, `active_document_id`) |
| Idempotency | ✅ CORRECT | Repeating key must not duplicate |
| Acceptance criteria | ✅ CORRECT | Canonical profile unchanged on failure; one revision bump; projection rebuild |

**Missing from confirm API:**
- Exact event type: `candidate.profile.changed`
- Event fields: `change_type` (enum: `profile_updated`, `document_linked`, `document_unlinked`), `active_document_id`
- `document_role` value for resume linking
- Which canonical profile tables are updated (the draft says "apply confirmed facts" but does not enumerate the writable tables: `candidate_profiles`, `candidate_links`, `candidate_skills`, `candidate_experiences`, `candidate_educations`, `candidate_certifications`, `candidate_projects`, `candidate_languages`, `candidate_awards`)
- `profile_change_history` audit record write
- How the confirm responseDTO maps to `candidate_profiles.profile_revision`

---

## 6. End-to-end flow review

### Flow under review

```
Upload
→ private storage
→ uploaded_documents
→ security.scan.requested
→ ClamAV security scan
→ clean-only resume.parse.requested
→ resume parsing
→ parsed review data
→ candidate review/edit
→ canonical profile update
→ profile revision bump
→ candidate projection/embedding event
```

### Step-by-step verification

| Step | Draft says | Actual code/SQL | Verdict |
|---|---|---|---|
| Upload → private storage | ✅ "Upload/store the private object outside the DB transaction" | `SECURITY-SCAN-IMPLEMENTATION-STAGES-AND-VERIFICATION-PLAN.md:31-32` | ✅ CORRECT |
| → `uploaded_documents` | ✅ "insert `uploaded_documents` with `security_scan_status = 'pending'`" | `06_documents.sql:84` — default `'pending'` | ✅ CORRECT |
| → `processing_status` | ❌ NOT MENTIONED | `06_documents.sql:86` — `processing_status = 'uploaded'` default | ❌ MISSING |
| → `security.scan.requested` | ✅ "write `security.scan.requested` to `outbox_events`" | `security-scan-requested.v1.json` | ✅ CORRECT |
| → ClamAV scan | ✅ "ClamAV security scan" | `task_handlers.py:113-114` — `ClamAVScannerProvider` | ✅ CORRECT |
| Scan status update | ❌ NOT DETAILED | `task_handlers.py:141-152` — updates `security_scan_status` to `clean`/`infected`, writes `security_scan_result` JSONB | ⚠️ PARTIAL |
| → clean-only parsing | ✅ "clean-only resume.parse.requested" | `task_handlers.py:154` — `if status == "clean"` | ✅ CORRECT |
| → `resume_parsing_jobs` insert | ❌ NOT DETAILED | `task_handlers.py:155-166` — inserts job with `ON CONFLICT (idempotency_key) DO NOTHING` | ⚠️ MISSING |
| → `resume.parse.requested` event | ✅ Mentioned | `task_handlers.py:170-176` — outbox event emitted | ✅ CORRECT |
| → FastAPI resume parse | ✅ Implied | `task_handlers.py:220-449` — full handler exists | ✅ CORRECT |
| → `resume_parsed_data` insert | ❌ NOT DETAILED | `task_handlers.py:372-383` — inserts parsed result | ⚠️ MISSING |
| → `candidate.resume.parsed` event | ❌ NOT MENTIONED IN FLOW | `task_handlers.py:404-414` — emitted when `candidate_id_for_event` exists | ❌ MISSING |
| → Candidate review/edit | ✅ "candidate review/edit" | API-RESUME-003 + API-RESUME-004 | ✅ CORRECT |
| → Canonical profile update | ✅ "canonical profile update" | `08_candidates.sql` tables | ✅ CORRECT |
| → Profile revision bump | ✅ "profile revision bump" | `08_candidates.sql:89-109` — `bump_candidate_profile_revision()` | ✅ CORRECT |
| → Projection event | ✅ "candidate projection/embedding event" | Should be `candidate.profile.changed` → projection-queue | ⚠️ EVENT TYPE NOT SPECIFIED |
| `candidate.projection.rebuilt` (chained) | ❌ NOT MENTIONED | `task_handlers.py:537-548` — FastAPI emits this after projection rebuild | ⚠️ NOT COVERED |

### Missing flow steps

1. **`processing_status` transition**: The draft does not mention that `processing_status` on `uploaded_documents` must transition from `'uploaded'` through the parsing lifecycle. This is a separate column from `security_scan_status`.

2. **`candidate.resume.parsed` event**: After parsing completes, FastAPI emits `candidate.resume.parsed` (if candidate exists). This event is consumed by the dispatcher and may trigger projection. The draft does not mention this chained event.

3. **`candidate.profile.changed` event**: After confirm, the API must emit `candidate.profile.changed` with `change_type` and `active_document_id`. The draft mentions "profile-change outbox event" generically but does not name the event type or its required fields.

4. **`profile_change_history` audit**: The confirm transaction should write an audit record to `profile_change_history` (`08_candidates.sql:472-491`). The draft does not mention this.

5. **`resume_parsing_job_events` timeline**: During parsing, events are appended to `resume_parsing_job_events` (`07_resume_processing.sql:121-130`). The status API could expose this timeline. Not mentioned.

6. **Document linking `document_role`**: The confirm step says "link through `candidate_profile_documents`" but does not specify `document_role = 'resume'`.

### Incorrect references in flow

| Reference | Problem | Correct value |
|---|---|---|
| Draft line 168: "approved profile-change outbox event" | Generic; does not name the event type | `candidate.profile.changed` |
| Draft line 80-82: status sequence mixes two columns | `security_scan_status` and `processing_status` are separate columns | Split into two parallel status tracks |

---

## 7. Open decisions before freeze

Only real unresolved decisions that block the API catalog:

| ID | Decision | Status | Impact |
|---|---|---|---|
| OD-01 | File transport: multipart-to-NestJS vs client-to-storage presigned | Resolved in Stage 1 — NestJS receives, validates, stores. Exact handshake is implementation detail. | Should be removed from open decisions list |
| OD-02 | Exact request/response DTO names and HTTP status codes | Legitimately open — `NEEDS_DECISION` | Blocks API catalog finalization |
| OD-03 | Numeric rate limits | Legitimately open — `NEEDS_DECISION` | Blocks production deployment |
| OD-04 | SSE endpoint, auth, reconnect DTO | Legitimately open — `NEEDS_DECISION` (DECISION-02 provides rules, not exact endpoints) | Blocks realtime implementation |
| OD-05 | Guest upload/claim API surface | Legitimately open | Blocks guest flow API catalog |
| OD-06 | Object-upload compensation/retention job ownership | Legitimately open | Blocks orphan cleanup implementation |
| OD-07 | Canonical profile writable-field allowlist for confirm | Legitimately open — needs explicit field list | Blocks confirm DTO finalization |
| OD-08 | `candidate.profile.changed` event field values for confirm | NEEDS_DECISION — contract has `change_type` enum (`profile_updated`, `document_linked`, `document_unlinked`), need to decide which value confirm uses | Blocks confirm outbox event implementation |

---

## 8. Exact required changes

### BLOCKER

1. **Section 2 (Common Rules)**: Add the `UserContextClient` / `SystemClient` separation rule from `DECISION-01:132-139`. This is mandatory for all four APIs.

2. **Section 3 (Upload API), line 69-72**: Add `processing_status = 'uploaded'` to the initial `uploaded_documents` insert description. The column exists with this default (`06_documents.sql:86`).

3. **Section 80-82 (Status sequence)**: Rewrite to correctly reflect two parallel status columns:
   - `security_scan_status`: pending → scanning → clean/infected/failed/quarantined
   - `processing_status`: uploaded → queued → processing → parsed → completed/failed

### HIGH

4. **Section 6 (Confirm API), line 168**: Change "approved profile-change outbox event" to: "Emit `candidate.profile.changed` event with `change_type = 'profile_updated'` and `active_document_id` per `contracts/events/candidate-profile-changed.v1.json`."

5. **Section 6 (Confirm API), line 167**: Add: "Link through `candidate_profile_documents` with `document_role = 'resume'`, `version_number` from the active document, and `is_current = TRUE`."

6. **Section 7 (Open Decisions), line 187**: Remove item 1 (file transport). This was resolved in Stage 1. Replace with: "OD-08: `candidate.profile.changed` `change_type` value for confirm endpoint — `profile_updated` vs `document_linked`."

7. **Section 3 (Upload API), line 84-86**: Add: "Orphan objects are soft-deleted via `deleted_at`. Physical deletion is reserved for a separately authorized retention/purge workflow per `uploaded_documents_no_hard_delete` trigger."

### MEDIUM

8. **Section 5 (Parsed-data API)**: Add that the response should expose `resume_parsed_data.normalized_output` fields needed for the review form, and note that `raw_ai_output` should not be returned unless an approved privacy decision requires it.

9. **Section 4 (Status API), line 103**: Add: "The API reads both `security_scan_status` and `processing_status` from `uploaded_documents`, plus `status` from `resume_parsing_jobs`."

10. **Section 6 (Confirm API), line 161-169**: Add step 2.5: "Write audit record to `profile_change_history` with `entity_type`, `operation = 'confirm'`, `change_source = 'candidate_confirmed'`."

11. **Section 6 (Confirm API), line 157**: Clarify: "Document is active means `deleted_at IS NULL`. Security status must be exactly `'clean'`; all other states (`pending`, `scanning`, `infected`, `failed`, `quarantined`) are rejected."

12. **Section 3 (Upload API)**: Add mention of duplicate checksum detection: "If a matching checksum already exists for this owner/session (per `uq_uploaded_document_checksum_owner`), the API follows the approved reuse/reject policy."

### LOW

13. **Section 2 (Common Rules)**: Add: "SSE reconnect follows DECISION-02: exponential backoff with jitter, re-authenticate, REST-fetch authoritative state."

14. **Section 2 (Common Rules)**: Add: "Guest session validation checks `status = 'active'`, `expires_at > NOW()`, `revoked_at IS NULL` per `guest_upload_sessions` constraints."

15. **Section 8 (Stage-03 exit criteria)**: Add: "All `TBD/NEEDS_DECISION` items have an assigned owner and target resolution phase."

---

## 9. Final status

**READY AFTER REQUIRED FIXES**

The draft has a solid foundation — the four APIs are correctly identified, the transaction boundaries are correct, and the controlled hybrid model is properly applied. However, the BLOCKER and HIGH items must be resolved before Stage-03 can be frozen:

1. Add `UserContextClient`/`SystemClient` separation rule (BLOCKER)
2. Fix status sequence to reflect two parallel status columns (BLOCKER)
3. Add `processing_status` to upload insert (BLOCKER)
4. Specify exact outbox event type for confirm (HIGH)
5. Specify `document_role` for confirm document linking (HIGH)
6. Remove resolved file transport from open decisions (HIGH)
7. Add orphan soft-delete mechanism (HIGH)

**Status:** `READY AFTER REQUIRED FIXES — CODING NOT AUTHORIZED`
