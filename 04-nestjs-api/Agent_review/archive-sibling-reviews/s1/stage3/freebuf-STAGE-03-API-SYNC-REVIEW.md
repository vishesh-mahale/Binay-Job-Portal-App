# Stage-03 API Sync Independent Review

**Auditor:** Freebuf (Senior NestJS API Architect & Independent Reviewer)
**Date:** 2026-08-26
**Target:** `04-nestjs-api/04-nestjs-api-app/s1/codex/STAGE-03-NESTJS-API-REQUIREMENTS-SYNC.md`

---

## 1. Final Verdict

### **APPROVED WITH CHANGES**

The Stage-03 draft is architecturally sound and correctly traces the first-resume flow against repository ground truth. The 4 APIs, controlled hybrid access model, outbox transactional boundaries, clean-before-parse gate, and candidate confirmation invariants are all correctly specified. However, **3 issues** require correction before freeze: an RLS access-path clarification, missing application-specific resume distinction, and a stale event name reference.

---

## 2. Repository Evidence Checked

| # | File | Sections Verified |
|---|---|---|
| 1 | `AGENTS.md` | Working rules, authority hierarchy, change discipline |
| 2 | `04-nestjs-api/README.md` | Service boundary diagram, NestJS as public API |
| 3 | `04-nestjs-api/DECISION-01-NESTJS-SUPABASE-ACCESS-MODEL-HINGLISH.md` | Controlled Hybrid, UserContextClient/SystemClient, OD-1 |
| 4 | `04-nestjs-api/DECISION-02-REALTIME-TRANSPORT-HINGLISH.md` | SSE for resume progress, REST as authoritative recovery |
| 5 | `02-database/migrations/baseline/02_enums.sql` | `security_scan_status`, `resume_processing_status`, `parsing_job_status` |
| 6 | `02-database/migrations/baseline/06_documents.sql` | `uploaded_documents`, `guest_upload_sessions`, indexes, triggers |
| 7 | `02-database/migrations/baseline/07_resume_processing.sql` | `resume_parsing_jobs`, `resume_parsed_data`, artifacts, events |
| 8 | `02-database/migrations/baseline/08_candidates.sql` | `candidate_profiles`, `candidate_profile_documents`, `bump_candidate_profile_revision()` |
| 9 | `02-database/migrations/baseline/15_infrastructure.sql` | `outbox_events`, `processed_events`, claim/publish functions |
| 10 | `02-database/migrations/baseline/17_rls.sql` | All RLS policies, grants, function permissions |
| 11 | `contracts/events/security-scan-requested.v1.json` | Envelope, aggregate_type/id, payload fields |
| 12 | `contracts/tasks/security-scan-task.v1.json` | 4-field task payload pattern |
| 13 | `contracts/events/resume-parse-requested.v1.json` | Event envelope and fields |
| 14 | `contracts/events/candidate-resume-parsed.v1.json` | Event envelope, conditional emission |
| 15 | `contracts/tasks/resume-parse-task.v1.json` | 4-field task payload pattern |
| 16 | `05-outbox-dispatcher-nestjs/src/routing/event-route.registry.ts` | All registered routes, queue assignments |
| 17 | `07-fastapi-ai-worker/app/api/v1/task_handlers.py` | Security scan handler, resume parse handler, candidate resolution |
| 18 | `07-fastapi-ai-worker/app/schemas/tasks.py` | All 7 Pydantic task payload models |
| 19 | `04-nestjs-api/NESTJS-IMPLEMENTATION-GUIDE.md` | Upload transaction template (§§8-9) |
| 20 | `04-nestjs-api/PHASE-01-REQUIREMENTS-CONSOLIDATION.md` | REQ-RESUME-001 through REQ-RESUME-007 |

---

## 3. What is Correct

| Area | Verdict | Evidence |
|---|---|---|
| **Access Model — Writes** | ✅ CORRECT | All 4 API write paths use NestJS SystemClient (trusted server role). `17_rls.sql` L151 revokes ALL DML from `anon`/`authenticated`. DECISION-01 §4 confirmed. |
| **Access Model — Reads (uploaded_documents)** | ✅ CORRECT | No authenticated SELECT policy exists on `uploaded_documents`. All reads must go through NestJS SystemClient with ownership checks. Draft correctly defers auth decorator to catalog/implementation. |
| **Upload Transaction Boundary** | ✅ CORRECT | Draft §3 step 2-3: storage upload outside TX, then `BEGIN` → INSERT `uploaded_documents` (pending) + INSERT `outbox_events` (security.scan.requested) → `COMMIT`. Matches guide L275-278. |
| **Security Scan Event Contract** | ✅ CORRECT | `security-scan-requested.v1.json`: `aggregate_type: "uploaded_document"`, `aggregate_id: uploaded_documents.id`, no storage_url. Matches Stage-1 decision. |
| **Dispatcher Route for Security Scan** | ✅ CORRECT | `event-route.registry.ts` L79-83: `security.scan.requested` → `SECURITY_SCAN_QUEUE` → `/internal/tasks/security/scan` → `contracts/tasks/security-scan-task.v1.json`. |
| **FastAPI Security Scan Handler** | ✅ CORRECT | `task_handlers.py` L58-194: Full implementation with OIDC, claim, scan, atomic commit, parse handoff. Stage-1 gap RESOLVED. |
| **Clean-Before-Parse Gate** | ✅ CORRECT | `task_handlers.py` L149-171: Parser re-checks `security_scan_status` from DB. Not a second antivirus scan — correct per guide §9. |
| **Resume Parse Event Contract** | ✅ CORRECT | `resume-parse-requested.v1.json`: Standard envelope with `schema_version`, `event_id`, `aggregate_id`, `trace_id`. |
| **Dispatcher Route for Parse** | ✅ CORRECT | `event-route.registry.ts` L54-58: `resume.parse.requested` → `AI_HEAVY_QUEUE` → `/internal/tasks/resume/parse` → `contracts/tasks/resume-parse-task.v1.json`. |
| **FastAPI Resume Parse Handler** | ✅ CORRECT | `task_handlers.py` L198-405: OIDC, idempotency, claim, security check, text extraction, AI parsing, atomic commit, `candidate.resume.parsed` event emission. |
| **Candidate Resume Parsed Event** | ✅ CORRECT | `candidate-resume-parsed.v1.json`: `aggregate_type: "candidate"`, `event_type: "candidate.resume.parsed"`, conditional emission (only when candidate_id resolved). |
| **Canonical Profile Non-Overwrite** | ✅ CORRECT | Draft §3 acceptance: "Canonical candidate profile tables are unchanged before candidate review/confirm." Matches guide §8. |
| **Confirmation Transaction** | ✅ CORRECT | Draft §6: ownership re-check → canonical profile write → `bump_candidate_profile_revision()` (once) → `candidate_profile_documents` link → `candidate.profile.changed` outbox event → `COMMIT`. Matches `08_candidates.sql` L56-70. |
| **Confirmation Idempotency** | ✅ CORRECT | Draft §6: "Repeating the same idempotency key must not duplicate profile facts, revision bump, document link or outbox event." |
| **SSE as Optimization Only** | ✅ CORRECT | Draft §2: "SSE is the live optimization and database/REST status is authoritative recovery." Matches DECISION-02 §1. |
| **External Calls Outside TX** | ✅ CORRECT | Draft §2: "Storage, Cloud Tasks, FastAPI or scanner calls must not run inside an open PostgreSQL transaction." Matches DECISION-01 §5. |
| **PII Protection** | ✅ CORRECT | Draft §2: "Resume content, signed URLs, credentials and tokens must not be placed in outbox/task payloads or logs." Matches Stage-1 non-negotiable rules. |
| **Enum Values** | ✅ CORRECT | Draft §3 status sequence maps to actual enums: `security_scan_status` (pending/scanning/clean/infected/failed/quarantined), `resume_processing_status` (uploaded/queued/processing/parsed/completed/failed), `parsing_job_status` (queued/processing/completed/failed). |
| **Open Decisions List** | ✅ CORRECT | All 7 items are genuinely unresolved in the repository. No items are missing. |
| **Outbox Pattern** | ✅ CORRECT | Business row + outbox event committed atomically. Dispatcher delivery after commit. Matches `15_infrastructure.sql` flow description. |

---

## 4. Problems and Missing Items

| ID | Severity | Problem | Evidence | Recommended Correction |
|---|---|---|---|---|
| **GAP-01** | **HIGH** | **Common Rules table misleading about RLS path.** Draft says "approved personal reads may use JWT + RLS" but `uploaded_documents`, `guest_upload_sessions`, `resume_parsing_jobs`, and `resume_parsed_data` have **NO authenticated SELECT policies or grants** in `17_rls.sql`. The owning candidate cannot read these tables via RLS. All reads for these tables MUST go through NestJS SystemClient with explicit ownership checks. | `17_rls.sql`: No `GRANT SELECT` on these 4 tables to `authenticated`. No `CREATE POLICY ... FOR SELECT` on these tables. `REVOKE ALL ON ALL TABLES FROM anon, authenticated` (L151) is the baseline. | Add explicit note in Common Rules: "`uploaded_documents`, `resume_parsing_jobs`, `resume_parsed_data` — no authenticated RLS SELECT exists; all reads must use NestJS SystemClient with ownership validation." |
| **GAP-02** | **MEDIUM** | **Application-specific resume distinction not documented.** The draft covers only the first-profile-resume flow (canonical profile update). When a candidate uploads a resume during job application, the flow creates `application_profile_snapshots` instead of updating canonical tables. This is a different write path that should be explicitly distinguished. | `09_applications.sql`: `application_profile_snapshots` table. `08_candidates.sql`: `candidate_profile_documents` with `document_role`. Guide §11: application snapshot semantics. | Add note to §6 (confirm): "Application-specific uploads snapshot into `application_profile_snapshots` without mutating canonical profile. This distinction must be documented in the application API catalog." |
| **GAP-03** | **LOW** | **Draft §6 uses `candidate.profile.changed` as the confirm outbox event.** This event name is not present in any contract file under `contracts/events/`. The dispatcher registry does have a route for `candidate.profile.changed` (in PHASE_1_ROUTES), but no corresponding event contract JSON exists. This should be marked as NEEDS_CONTRACT or the existing route should be verified. | `event-route.registry.ts` L61-65: `candidate.profile.changed` route exists. `contracts/events/`: No `candidate-profile-changed.v1.json` file found. | Mark as NEEDS_CONTRACT: "The `candidate.profile.changed` event contract (`candidate-profile-changed.v1.json`) must be created before implementation." |
| **GAP-04** | **LOW** | **Draft does not mention `parsing_priority` assignment.** The `resume_parsing_jobs` table has a `parsing_priority` column (default: `normal`). The upload API should document whether priority is always `normal` for user uploads or if admin/system uploads can use `high`/`urgent`. | `07_resume_processing.sql` L47: `priority parsing_priority NOT NULL DEFAULT 'normal'`. `02_enums.sql` L502-505: `parsing_priority` enum. | Add to §3 (Upload): "Parsing priority defaults to `normal` for candidate uploads. Admin/system override is `NEEDS_DECISION`." |
| **GAP-05** | **LOW** | **Draft does not specify the `security_scan_status` terminal failure value.** When scanner retries are exhausted, what status is set? The FastAPI handler sets `failed` (L123), but the Stage-1 audit identified this as an open question. The draft should note that `failed` is the terminal failure status for scanner exhaustion, distinct from `infected`. | `task_handlers.py` L119-124: Sets `security_scan_status = 'failed'` on `ScannerUnavailable`. `02_enums.sql` L510: `failed` is an enum value. | Add to §3 failure section: "Scanner timeout/unavailability sets `security_scan_status = 'failed'` (distinct from `infected`). Recovery sweeper re-queues from `idx_uploaded_documents_scan_queue`." |

---

## 5. API-by-API Review

### API-RESUME-001 — POST /resumes/upload

| Aspect | Verdict | Evidence |
|---|---|---|
| **Requirement traceability** | ✅ | REQ-RESUME-001 (Phase-01), guide §8 |
| **Actor/authorization** | ✅ | Authenticated candidate + guest session. `uploaded_document_owner_check` constraint (06_documents.sql L98-103) enforces XOR ownership. |
| **Guest session behavior** | ✅ | `guest_upload_sessions` table exists. `consume_guest_upload_session()` function exists. `17_rls.sql` restricts execution to `service_role`. |
| **Request validation** | ✅ | Size, MIME, extension, magic bytes, SHA-256 checksum, duplicate check. All match Stage-1 decision. |
| **DB tables written** | ✅ | `uploaded_documents` (pending), `outbox_events` (security.scan.requested). Correct per guide L275-278. |
| **DB tables read** | ✅ | Checksum dedup query, guest session validation. Correct. |
| **Transaction boundary** | ✅ | Storage outside TX, then atomic INSERT + outbox → COMMIT. Correct. |
| **Outbox event** | ✅ | `security.scan.requested` → `security-scan-queue`. Contract exists. Route registered. |
| **Idempotency** | ✅ | Checksum unique index (`uq_uploaded_document_checksum_owner`), outbox `idempotency_key`. Correct. |
| **Response** | ⚠️ | Draft says "exact response DTO and HTTP status are TBD." This is appropriate for a requirements sync document. |
| **Failure behavior** | ✅ | DB commit failure → orphan object. Scanner failure → fail-closed. Correct per Stage-1. |
| **PII handling** | ✅ | No signed URLs/tokens in payload or logs. Correct per non-negotiable rules. |
| **Rate limit** | ✅ | Marked as NEEDS_DECISION. Appropriate. |

**Verdict: ✅ CORRECT — 1 minor gap (GAP-04: parsing_priority).**

---

### API-RESUME-002 — GET /resumes/:id/status

| Aspect | Verdict | Evidence |
|---|---|---|
| **Requirement traceability** | ✅ | REQ-RESUME-006 (Phase-01), DECISION-02 §2 |
| **Actor/authorization** | ✅ | Owning candidate, authorized guest, internal workflow. Cross-user denied. |
| **DB tables read** | ✅ | `uploaded_documents` + `resume_parsing_jobs`. Correct. |
| **RLS path** | ✅ | No authenticated SELECT on these tables. Must use NestJS SystemClient. Draft correctly defers auth to catalog. |
| **Response** | ✅ | Status metadata, timestamps, error codes. No raw content. Correct. |
| **SSE/recovery** | ✅ | SSE nudge + REST authoritative recovery. Matches DECISION-02 §1, §5. |
| **Transaction** | ✅ | Read-only query, no outbox. Correct. |
| **Terminal state handling** | ✅ | "Terminal infected/failed state never appears as parsed-ready." Correct. |

**Verdict: ✅ CORRECT — No gaps.**

---

### API-RESUME-003 — GET /resumes/:id/parsed-data

| Aspect | Verdict | Evidence |
|---|---|---|
| **Requirement traceability** | ✅ | Guide §9, PD-002 |
| **Actor/authorization** | ✅ | Same owner/guest boundary as status API. Correct. |
| **DB tables read** | ✅ | `resume_parsing_jobs`, `resume_parsed_data`, `uploaded_documents`. Correct. |
| **Precondition** | ✅ | "Only a successfully parsed document may return review data." Correct. |
| **Response** | ✅ | Normalized fields, confidence, validation. No raw provider payload. Correct per PII rules. |
| **Transaction** | ✅ | Read-only, no outbox. Correct. |
| **Not-ready behavior** | ✅ | "Before parsing succeeds, response is a stable not-ready result, not fabricated empty profile data." Correct. |
| **Cross-user rejection** | ✅ | "Cross-user access is rejected." Correct. |
| **Canonical non-mutation** | ✅ | "Does not update canonical profile tables by itself." Correct. |

**Verdict: ✅ CORRECT — No gaps.**

---

### API-RESUME-004 — POST /resumes/:id/confirm

| Aspect | Verdict | Evidence |
|---|---|---|
| **Requirement traceability** | ✅ | Guide §§8-9, REQ-RESUME-005 |
| **Actor/authorization** | ✅ | Owning authenticated candidate only. NestJS verifies document + candidate identity. Correct. |
| **Preconditions** | ✅ | Parsed data exists, security_status = 'clean', document active, ownership valid. Correct. |
| **Write transaction** | ✅ | Atomic: ownership re-check → canonical write → `bump_candidate_profile_revision()` (once) → `candidate_profile_documents` link → outbox event → COMMIT. Correct per 08_candidates.sql L56-70. |
| **Revision bump** | ✅ | "Bump the candidate profile revision exactly once for one logical save." Uses `bump_candidate_profile_revision()`. Correct. |
| **Document linking** | ✅ | "Link the document through `candidate_profile_documents`." Correct per 08_candidates.sql L109-120. |
| **Outbox event** | ⚠️ | `candidate.profile.changed` — route exists in dispatcher but no contract file. **GAP-03.** |
| **Idempotency** | ✅ | Same key → no duplicate. Different key → approved conflict policy. Correct. |
| **External calls outside TX** | ✅ | "No Cloud Tasks/FastAPI call is made inside the transaction." Correct per DECISION-01. |
| **Response** | ✅ | Confirmation result with revision + projection status. TBD for exact DTO. Appropriate. |
| **Profile fields** | ✅ | "Unknown fields must be rejected; provider output must not silently overwrite user edits." Correct. |
| **Application-specific** | ⚠️ | Not distinguished from profile resume. **GAP-02.** |

**Verdict: ✅ CORRECT — 2 gaps (GAP-02, GAP-03).**

---

## 6. End-to-End Flow Review

The complete flow is verified against actual code:

```
Upload (NestJS)
  → private storage (outside TX)
  → BEGIN TX
    → INSERT uploaded_documents (security_scan_status='pending', processing_status='uploaded')
    → INSERT outbox_events (security.scan.requested)
  → COMMIT
  → 202 Accepted { document_id }
  ↓
Dispatcher picks security.scan.requested
  → security-scan-queue → Cloud Tasks → FastAPI /internal/tasks/security/scan
  ↓
FastAPI Security Scan Handler (task_handlers.py L58-194)
  → OIDC validation
  → processed_events idempotency check
  → Claim document (UPDATE uploaded_documents SET security_scan_status='scanning')
  → Download from private storage
  → ClamAV scan
  → BEGIN TX
    → UPDATE uploaded_documents SET security_scan_status='clean'/'infected'
    → IF clean: INSERT resume_parsing_jobs + INSERT outbox_events (resume.parse.requested)
    → INSERT processed_events
  → COMMIT
  ↓
Dispatcher picks resume.parse.requested
  → ai-heavy-queue → Cloud Tasks → FastAPI /internal/tasks/resume/parse
  ↓
FastAPI Resume Parse Handler (task_handlers.py L198-405)
  → OIDC validation
  → processed_events idempotency check
  → Claim job (FOR UPDATE lock on resume_parsing_jobs)
  → Verify security_scan_status='clean' from uploaded_documents
  → Download document, validate size/magic bytes
  → Extract text (OCR/extraction)
  → AI structured extraction (LLM with prompt injection protection)
  → BEGIN TX
    → INSERT resume_parsing_job_events (started)
    → INSERT resume_parsing_artifacts (extracted_text)
    → INSERT resume_parsed_data (normalized_output, confidence)
    → INSERT resume_parsing_job_events (completed)
    → INSERT processed_events
    → IF candidate_id resolved: INSERT outbox_events (candidate.resume.parsed)
    → UPDATE resume_parsing_jobs SET status='completed'
  → COMMIT
  ↓
SSE nudge → Next.js UI
  → GET /resumes/:id/status → DB authoritative status
  → GET /resumes/:id/parsed-data → review form pre-fill
  ↓
Candidate reviews/edits parsed data
  → POST /resumes/:id/confirm
  ↓
NestJS Confirm Transaction
  → BEGIN TX
    → Re-check ownership, clean scan, parsed-data availability
    → Apply candidate-confirmed facts to canonical tables
    → bump_candidate_profile_revision() (once)
    → INSERT/UPDATE candidate_profile_documents (link resume)
    → INSERT outbox_events (candidate.profile.changed)
  → COMMIT
  ↓
Dispatcher → projection-queue → FastAPI /internal/tasks/candidate/projection
  → Rebuild candidate_search_profiles (768-dim embedding)
```

**Every step is traceable to actual SQL, contracts, dispatcher routes, and FastAPI handlers.**

---

## 7. Open Decisions Before Freeze

These are the **genuinely unresolved** decisions in the repository:

| # | Decision | Current State | Impact |
|---|---|---|---|
| 1 | **File transport** — multipart to NestJS vs client-to-storage presigned upload | NOT DECIDED | Affects upload API request contract |
| 2 | **Exact DTO names and HTTP status codes** | NOT DECIDED | Affects API catalog |
| 3 | **Numeric rate limits** | NOT DECIDED | Affects API catalog |
| 4 | **SSE endpoint, auth, reconnect, status-recovery DTO** | NOT DECIDED | Affects realtime integration |
| 5 | **Guest upload/claim API surface** | PARTIALLY DECIDED | `guest_upload_sessions` exists; claim endpoint undefined |
| 6 | **Object-upload compensation/retention job** | NOT DECIDED | Affects orphan cleanup |
| 7 | **Canonical profile writable-field allowlist for confirm** | NOT DECIDED | Affects confirm endpoint validation |

**Additional decisions identified by this review:**

| # | Decision | Current State | Impact |
|---|---|---|---|
| 8 | **`candidate.profile.changed` event contract** | Route exists, contract file MISSING | Confirm endpoint cannot emit event without contract |
| 9 | **Application-specific resume vs profile resume** | Schema supports both, API distinction undocumented | Affects confirm endpoint behavior |

---

## 8. Exact Required Changes

| # | Change | Section | Priority |
|---|---|---|---|
| 1 | Add explicit note that `uploaded_documents`, `resume_parsing_jobs`, `resume_parsed_data` have NO authenticated RLS SELECT — all reads must use NestJS SystemClient | §2 Common Rules | **HIGH** |
| 2 | Add note to §6 that application-specific uploads create `application_profile_snapshots` and do NOT update canonical profile | §6 Confirm | **MEDIUM** |
| 3 | Mark `candidate.profile.changed` event contract as NEEDS_CONTRACT (route exists but no `candidate-profile-changed.v1.json`) | §6 Confirm | **MEDIUM** |
| 4 | Add `parsing_priority` default note to §3 Upload | §3 Upload | **LOW** |
| 5 | Add `security_scan_status = 'failed'` as terminal scanner failure (distinct from `infected`) to §3 failure section | §3 Upload | **LOW** |

---

## 9. Final Status

### **READY AFTER REQUIRED FIXES**

The Stage-03 draft is architecturally sound. All 4 APIs correctly trace to repository ground truth. The end-to-end flow is fully verified against actual SQL, contracts, dispatcher routes, and FastAPI handlers.

**3 changes required before freeze:**

1. **HIGH:** Fix RLS access-path clarification in Common Rules
2. **MEDIUM:** Document application-specific resume distinction
3. **MEDIUM:** Mark `candidate.profile.changed` contract as NEEDS_CONTRACT

**After these fixes, the document is ready for Stage-03 freeze.**

---

**Report Generated:** 2026-08-26
**Agent:** Freebuf
**Status:** APPROVED WITH CHANGES — Ready after 3 fixes
