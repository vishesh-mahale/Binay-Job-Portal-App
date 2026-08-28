# Phase-9C Review: Candidate + Resume API Contract

**Agent:** cline
**Mode:** Plan (no source code or SQL modified in this review)

## 1. Evidence Table

| Requirement Section | Source File | Key Lines | Confirmed Detail |
|---|---|---|---|
| Resume upload route | `PHASE-06-API-CATALOG.md` §2 | 34–99 | `POST /api/v1/candidates/me/resumes` — single multipart file (file) + metadata. |
| Resume upload DTO | `PHASE-06-API-CATALOG.md` §2 | 53–57 | Fields: file, original_file_name, mime_type, file_size_bytes. No client-controlled document_id/storage_path/checksum. |
| Upload outbox event | `PHASE-06-API-CATALOG.md` §2 | 104 | Emits `security.scan.requested`. |
| Uploaded documents table | `06_documents.sql` | 72–106 | `uploaded_documents`: id, uploaded_by_user_id/guest_upload_session_id (XOR CHECK L91–95), document_type, storage_path, checksum_sha256, security_scan_status, processing_status, metadata JSONB. |
| Checksum reuse indexes | `06_documents.sql` | 122–130 | `uq_uploaded_document_checksum_owner` and `uq_uploaded_document_checksum_guest_session` — partial unique indexes on (owner/guest, checksum) WHERE deleted_at IS NULL. |
| Security scan status enum | `02_enums.sql` | 527–529 | `'pending','scanning','clean','infected','failed','quarantined'` |
| Upload transaction | `PHASE-06-API-CATALOG.md` §2 | 95–100 | Metadata INSERT + `security.scan.requested` outbox in one atomic transaction. |
| Security scan event contract | `contracts/events/security-scan-requested.v1.json` | 7–15 | Required: schema_version, event_id, aggregate_type="uploaded_document", aggregate_id, event_type="security.scan.requested", payload{document_id, uploaded_by_user_id, guest_upload_session_id, trace_id}, occurred_at. |
| Security scan task contract | `contracts/tasks/security-scan-task.v1.json` | 7–17 | Required: schema_version, event_id, aggregate_id (uploaded_document.id), trace_id. No storage_url. |
| Security scan worker | `task_handlers.py` | 62–205 | `@router.post("/tasks/security/scan")`. Claims doc, downloads, ClamAV, sets clean/infected/failed, emits `resume.parse.requested` after clean scan. |
| Resume parse event contract | `contracts/events/resume-parse-requested.v1.json` | 6–15 | Required: schema_version, event_id, aggregate_id, trace_id, document_id, requested_by. No storage_url. |
| Resume parse task contract | `contracts/tasks/resume-parse-task.v1.json` | 7–29 | Required: schema_version, event_id, aggregate_id (parsing_job_id), trace_id. |
| Dispatcher parse route | `event-route.registry.ts` | 36–41 | `resume.parse.requested` → `ai-heavy-queue` → `/internal/tasks/resume/parse`. Registered in PHASE_1_ROUTES. |
| Resume parse worker | `task_handlers.py` | 220–444 | Downloads, validates magic bytes, AI extraction, inserts `resume_parsed_data` (immutable), emits `candidate.resume.parsed` if active resume. |
| Worker OIDC auth | `task_handlers.py` | 75–79, 243–248 | `get_oidc_validator(settings)` validates Bearer token when OIDC_AUTH_ENABLED. |
| Worker idempotency | `task_handlers.py` | 81–82, 250–254 | Checks `processed_events` before processing. |
| Resume processing table | `07_resume_processing.sql` | 39–67 | `resume_parsing_jobs`: id, document_id, parser_provider/model/version, status, idempotency_key UNIQUE. |
| Resume parsed data table | `07_resume_processing.sql` | 69–100 | `resume_parsed_data`: extracted_text (TEXT), raw_ai_output (JSONB req), normalized_output (JSONB). Immutable trigger L136. |
| Parsing artifacts/events | `07_resume_processing.sql` | 102–130 | `resume_parsing_artifacts` + `resume_parsing_job_events` — both immutable. |
| Resume status route | `PHASE-06-API-CATALOG.md` §2 | 68–70 | `GET /api/v1/candidates/me/resumes/:id/status` |
| Parsed-data route | `PHASE-06-API-CATALOG.md` §2 | 72–102 | `GET /api/v1/candidates/me/resumes/:id/parsed-data` — allowlisted facts only; raw text/AI/artifact/error JSON excluded. |
| Confirm parsed profile | `PHASE-06-API-CATALOG.md` §2 | 105–127 | `POST /api/v1/resumes/:id/confirm` — expected_profile_revision + allowlisted facts + Idempotency-Key. Atomic: row lock + revision bump + `candidate.profile.changed`. |
| Candidate profile read | `PHASE-06-API-CATALOG.md` §3C | 325–344 | API-CANDIDATE-001 — TBD path, UserContextClient + RLS read. |
| Candidate profile save | `PHASE-06-API-CATALOG.md` §3C | 346–367 | API-CANDIDATE-002 — TBD path, allowlisted fields. bump_candidate_profile_revision() once. Outbox `candidate.profile.changed`. |
| Candidate profile archive | `PHASE-06-API-CATALOG.md` §3C | 369–387 | API-CANDIDATE-003 — TBD path, soft-delete via deleted_at, revision bump, outbox. |
| Candidate profiles table | `08_candidates.sql` | 54–85 | profile_revision (BIGINT CHECK>0), profile_completed_at, deleted_at. |
| bump_candidate_profile_revision | `08_candidates.sql` | 87–109 | Updates profile_revision+1, sets last_profile_change_at, raises if not found. |
| candidate_profile_documents | `08_candidates.sql` | 111–129 | Junction: document_role, version_number, is_current (UNIQUE one current per candidate+role). |
| candidate_search_profiles | `08_candidates.sql` | 418–470 | Projection: active_resume_document_id, search_vector, embedding (vector 768). Revision consistency CHECK (projection_revision <= source_profile_revision). |
| profile_change_history | `08_candidates.sql` | 472–491 | Immutable: profile_revision, entity_type, operation, before/after_data. |
| DECISION-01 (access model) | `DECISION-01` | — | UserContextClient for RLS reads; SystemClient for writes. |
| DECISION-05 (first resume active) | `DECISION-05` | — | First resume auto-activates. Later selection explicit. |
| RLS on candidate tables | `17_rls.sql` | 161–176 | `authenticated` SELECT on candidate_*. INSERT/UPDATE/DELETE via service_role only. |
| RLS on documents/parsing | `17_rls.sql` | 248–250 | Service-only default-deny; outbox/processed_events functions restricted to service_role. |
| Candidate resume parsed event | `contracts/events/candidate-resume-parsed.v1.json` | 6–27 | aggregate_type="candidate", event_type="candidate.resume.parsed", payload{candidate_id, reason="active_resume_parsed", trace_id}. |
| Candidate projection event | `contracts/events/candidate-projection-rebuilt.v1.json` | — | Output-only event; no dispatcher input route (prevents loops). |
| Candidate projection task | `contracts/tasks/candidate-projection-task.v1.json` | 7–29 | Payload: schema_version, event_id, aggregate_id (candidate UUID), trace_id. |
| Dispatcher projection route | `event-route.registry.ts` | 42–47 | `candidate.profile.changed` → `projection-queue` → `/internal/tasks/candidate/projection`. |
| Worker projection handler | `task_handlers.py` | 452+ | `@router.post("/tasks/candidate/projection")` — builds candidate_search_profiles. |
| Profile fact enums | `02_enums.sql` | 550–562 | profile_fact_source, profile_fact_verification_status, evidence_status, document_role. |
| Allowlist blocker note | `PHASE-06-API-CATALOG.md` §2 | 99–103 | "field-by-field normalized allowlist remains API-catalog blocker" |
| Phase-04 transaction template | `PHASE-05-FINAL-REQUIREMENTS.md` §8 | 95–115 | validate → authorize → BEGIN → business + audit/history + outbox → COMMIT. No external calls in transactions. |
| Security scan event draft | `security-scan-requested.v1.json` | L63 | _draft_note: "document identity only; no storage_url." |
| Test reference | `routing.spec.ts` | 64–67 | Tests security.scan.requested route resolution. |

---

## 2. Proposed API Contract

### A. Resume Lifecycle Routes (Candidate-facing)

| # | Method | Path | Purpose |
|---|---|---|---|
| 1 | `POST` | `/api/v1/candidates/me/resumes` | Upload resume document (multipart: file + metadata DTO) |
| 2 | `GET` | `/api/v1/candidates/me/resumes/:id/status` | Poll upload/scan/parse status |
| 3 | `GET` | `/api/v1/candidates/me/resumes/:id/parsed-data` | Read allowlisted parsed facts |
| 4 | `POST` | `/api/v1/resumes/:id/confirm` | Confirm parsed facts → canonical profile (atomic) |

**Upload DTO (Phase-6 approved fields):** file (binary, required), original_file_name (string), mime_type (string), file_size_bytes (integer). No client-controlled document_id/storage_path/checksum.

**Status response:** document_id (uuid), document_status (resume_processing_status), security_scan_status, security_scan_result (bounded metadata), processing_status.

**Parsed-data response:** Normalized canonical facts only. Explicitly EXCLUDES extracted_text, raw_ai_output, resume_parsing_artifacts, error_details.

**Confirm DTO:** expected_profile_revision (bigint), canonical_facts (allowlisted), Idempotency-Key (header, required).

### B. Candidate Profile Routes (§3C)

| # | Method | Path | Purpose |
|---|---|---|---|
| 1 | `GET` | `/api/v1/candidates/me/profile` (API-CANDIDATE-001) | Read own canonical profile + child facts |
| 2 | `PATCH` | `/api/v1/candidates/me/profile` (API-CANDIDATE-002) | Save canonical profile facts (one revision bump) |
| 3 | `DELETE` | `/api/v1/candidates/me/profile/facts/:id` (API-CANDIDATE-003) | Archive/soft-delete a fact row |

**Profile save allowlisted fields:** professional_title, summary, country, city, salary_currency, expected_salary_min/max, work_authorization, visa_sponsorship_needed, is_open_to_work, available_from, preferred_work_modes[], preferred_job_types[], skills[], experiences[], educations[], certifications[], links[].

**Server-controlled (not accepted from client):** id, user_id, profile_revision, profile_completed_at, timestamps, deleted_at, primary_source_type, verification_status, candidate_confirmed_at, row_version, all evidence/provenance fields.

### C. Event/Task Flow (contract-verified)

```
1. Candidate uploads resume (NestJS)
   → INSERT uploaded_documents (atomic with outbox)
   → OUTBOX: security.scan.requested (aggregate_type=uploaded_document)
   → Dispatcher → security-scan-queue → /internal/tasks/security/scan

2. Security scan (FastAPI worker)
   → Downloads file from private storage
   → ClamAV scan
   → UPDATE uploaded_documents.security_scan_status
   → If clean → OUTBOX: resume.parse.requested
   → If infected → NO parse, document quarantined

3. Resume parsing (FastAPI worker)
   → Downloads, validates magic bytes
   → Extracts text, runs AI
   → INSERT resume_parsed_data (immutable)
   → INSERT artifacts + events (immutable)
   → If active resume → OUTBOX: candidate.resume.parsed (NO dispatcher route)

4. Candidate confirms (NestJS, POST /resumes/:id/confirm)
   → Validate scan clean + parse complete + revision matches
   → INSERT/UPDATE canonical facts
   → bump_candidate_profile_revision() (once)
   → INSERT profile_change_history (immutable)
   → Link document to candidate_profile_documents (is_current=true)
   → OUTBOX: candidate.profile.changed
   → Dispatcher → projection-queue → /internal/tasks/candidate/projection

5. Profile save (NestJS, PATCH /candidates/me/profile)
   → INSERT/UPDATE candidate_* facts
   → bump_candidate_profile_revision() (once)
   → INSERT profile_change_history
   → OUTBOX: candidate.profile.changed → projection queue

6. Projection (FastAPI worker)
   → Reads candidate_profiles + candidate_* + active resume parsed data
   → Generates embedding
   → UPSERT candidate_search_profiles (revision consistency check)
   → OUTBOX: candidate.projection.rebuilt (output-only)
```

### D. Active Resume Rules (DECISION-05)

- **First resume auto-active:** First document linked with `document_role='resume'` and `is_current=TRUE` in `candidate_profile_documents`.
- **Later resume selection:** Explicit update to set `is_current=TRUE` on new doc; unique constraint on `is_current` per (candidate, document_role) ensures only one active.
- **Active resume usage:** Parsed data from active resume used as additional search evidence alongside canonical profile; canonical profile not overwritten by AI.

### E. Security & Storage (06_documents.sql + DECISION-01)

- **Private storage:** `storage_bucket` + `storage_path` columns; file stored in private Supabase bucket. service_role required for download.
- **Checksum reuse:** Partial unique indexes on `(owner, checksum)` / `(guest, checksum)` WHERE deleted_at IS NULL — reuse only within same upload origin.
- **RLS:** `authenticated` has SELECT on candidate tables; document/parsing/outbox/processed_events are service-only (default-deny).

---

## 3. Gaps/Conflicts

| # | Gap/Conflict | Detail | Status |
|---|---|---|---|
| G-1 | **Parsed-data allowlist not specified** | PHASE-06 §2 L99–103: "field-by-field normalized allowlist remains API-catalog blocker." No exact DTO allowlist exists. | NEEDS_DECISION |
| G-2 | **`candidate.resume.parsed` has no dispatcher route** | Worker emits `candidate.resume.parsed` (`task_handlers.py` L407) with `contracts/events/candidate-resume-parsed.v1.json`. But `event-route.registry.ts` PHASE_1/2_ROUTES have **no route** for `candidate.resume.parsed`. If NestJS needs to react, no path exists. | NEEDS_DECISION |
| G-3 | **Candidate API paths are TBD** | API-CANDIDATE-001/002/003 all say `Method/path: TBD`. No exact route path specified. | NEEDS_DECISION |
| G-4 | **`candidate.profile.changed` contract missing profile_revision** | Projection worker needs `profile_revision` for revision consistency CHECK (`08_candidates.sql` L438–440). Event contract `candidate-profile-changed.v1.json` only has: schema_version, event_id, aggregate_id, trace_id, change_type, active_document_id. **Missing `profile_revision: bigint`.** | BLOCKER |
| G-5 | **Guest resume routes stubbed** | PHASE-06 §3: guest parsed-data route listed as frozen path but exact DTO "remain to be filled before freeze." | NEEDS_DECISION |
| G-6 | **`resume.parse.requested` task payload lacks document_id** | Task contract has only aggregate_id (parsing_job_id). Worker resolves document_id from DB. This is correct by design. | RESOLVED |
| G-7 | **Security scan result schema alignment** | Event payload document_id, task aggregate_id, and worker DB query all use uploaded_documents.id. Consistent. | RESOLVED |

---

## 4. Security Findings

### A. Secrets & PII Exposure Prevention

| Check | Finding | Status |
|---|---|---|
| Raw extracted_text excluded from API | PHASE-06 §2 L100–101: "raw extracted_text/raw_ai_output/artifacts/error_details never returned" | ✅ PASS |
| AI output excluded from API | Same lines — only normalized_output allowlist returned | ✅ PASS |
| Storage path never exposed in events | Security scan event contract has `_draft_note: "no storage_url"`. Task contract has no storage_url. Worker resolves from DB only. | ✅ PASS |
| Private storage enforcement | `06_documents.sql` L2–7: file in private object storage; PG stores metadata only. RLS: documents service-only (17_rls.sql L248–250). | ✅ PASS |
| Checksum format enforced | SQL CHECK L97–99: `checksum_sha256 ~ '^[0-9a-f]{64}$'` | ✅ PASS |
| Checksum reuse is owner-scoped | Partial unique indexes prevent cross-user dedup attacks | ✅ PASS |

### B. Secrets Leak in Worker Code

| Check | Finding | Status |
|---|---|---|
| Raw text in logs | Worker logs trace_id, document_id, parsing_job_id — never extracted_text or raw_ai_output | ✅ PASS |
| AI output in logs | `logger.warning("AI extraction failed...", error=str(exc))` — no AI output logged | ✅ PASS |
| Storage path in error responses | `document_path` used internally, never returned in HTTP error responses | ✅ PASS |

### C. Authorization & RLS

| Check | Finding | Status |
|---|---|---|
| UserContextClient isolation | DECISION-01: UserContextClient for RLS reads only; SystemClient for all business writes | ✅ PASS |
| No client-controlled ownership | All user_id, candidate_id, document_id derived from JWT context | ✅ PASS |
| Candidate cross-read blocked | RLS policy: `candidate A cannot read candidate B's private profile facts` (PHASE-06 §3C L343) | ✅ PASS |
| Documents service-only | INSERT/UPDATE/DELETE on uploaded_documents via service_role only | ✅ PASS |

### D. Transaction Safety

| Check | Finding | Status |
|---|---|---|
| Upload + outbox atomic | Single transaction: INSERT uploaded_documents + outbox `security.scan.requested` | ✅ PASS |
| Confirm + profile + outbox atomic | Row lock + revision bump + history + outbox `candidate.profile.changed` in one transaction | ✅ PASS |
| No external calls in transactions | Phase-4 template (PHASE-05 §8 L95–115): no Cloud Tasks/FastAPI/email/WebSocket inside DB txn | ✅ PASS |
| Immutability enforced | resume_parsed_data, artifacts, events, profile_change_history all have BEFORE UPDATE/DELETE RAISE triggers | ✅ PASS |
| Hard delete blocked | All candidate/document tables have `no_hard_delete` triggers; soft-delete via deleted_at only | ✅ PASS |

### E. Worker Trust Boundary

| Check | Finding | Status |
|---|---|---|
| Worker is private | README: "private FastAPI worker, not a browser-facing database writer" | ✅ PASS |
| Worker auth required | OIDC bearer validation when OIDC_AUTH_ENABLED (L75–79, L243–248) | ✅ PASS |
| Worker idempotency | processed_events table checked before processing (L81–82, L250–254) | ✅ PASS |
| Worker job claiming | claim_job() with lock prevents concurrent processing | ✅ PASS |

---

## 5. Test Matrix

| Test Area | Scenarios | Evidence |
|---|---|---|
| **Unit** | DTO validation (file type/size), allowlist field filtering, verification status mapping | PHASE-06 §2 L57 (DTO validation), §2 L95–102 (allowlist) |
| **Unit** | bump_candidate_profile_revision() returns new revision, raises if deleted | `08_candidates.sql` L87–109 |
| **Unit** | Event route registry resolves correct queue/path/contract per event | `routing.spec.ts` L64–67 |
| **Integration** | Upload → security.scan.requested outbox in same transaction | PHASE-06 §2 L95 |
| **Integration** | Scan clean → resume.parse.requested emitted; infected → no parse | `task_handlers.py` L62–205 |
| **Integration** | Parse + active resume → candidate.resume.parsed emitted | `task_handlers.py` L403–414 |
| **Integration** | Confirm → facts + revision bump + candidate.profile.changed atomic | PHASE-06 §2 L105–127 |
| **Integration** | Profile save with 5 child changes → one revision bump, one history, one event | PHASE-06 §3C L365–366 |
| **Concurrency** | Idempotent retry with Idempotency-Key + expected revision → 409 STALE_REVISION | PHASE-06 §2 L124 |
| **Concurrency** | Parallel confirm of same resume → deterministic lock-order prevents corruption | Phase-4 template; row locks |
| **Failure** | Scan pending → parse handler returns 503 SCAN_PENDING | `task_handlers.py` L280–281 |
| **Failure** | Infected document → parse blocked, quarantined | `task_handlers.py` L282–297 |
| **Failure** | AI extraction failure → fallback logged, job marked failed | `task_handlers.py` L344–348, L442–444 |
| **Failure** | Stale profile_revision → 409 STALE_REVISION, zero changes | PHASE-06 §2 L121–123 |
| **Live E2E** | Guest session → upload → scan → parse → profile → search projection | `FUTURE-API-LIVE-E2E-TESTING-GUIDE.md` |

---

## 6. Final Verdict

### ✅ APPROVED with critical blockers (G-2, G-4)

The Candidate + Resume API architecture is fundamentally sound and well-designed. All core flows have authoritative source schema, versioned contracts, registered dispatcher routes, worker implementations, security boundaries, and atomic transaction discipline.

### BLOCKERs to resolve before implementation:

1. **BLOCKER — `candidate.profile.changed` event contract missing `profile_revision` (G-4):**
   - The FastAPI projection worker needs `profile_revision` for the revision consistency CHECK constraint (`08_candidates.sql` L438–440: `projection_revision <= source_profile_revision`).
   - The event contract `candidate-profile-changed.v1.json` only has: `schema_version`, `event_id`, `aggregate_id`, `trace_id`, `change_type`, `active_document_id`.
   - **Fix:** Add `profile_revision: bigint` to `candidate-profile-changed.v1.json`.

2. **NEEDS_DECISION — `candidate.resume.parsed` event with no consumer (G-2):**
   - Worker emits `candidate.resume.parsed` (`task_handlers.py` L407) but no dispatcher route exists in `event-route.registry.ts`.
   - If this event should trigger NestJS-side processing, a dispatcher route + consumer must be defined.
   - If purely informational, document as output-only with no consumer.

### NEEDS_DECISION before implementation freeze:

3. **G-1 — Parsed-data allowlist:** PHASE-06 §2 L99–103 explicitly defers the field-by-field normalized allowlist. Must be resolved.

4. **G-3 — Candidate API exact paths:** API-CANDIDATE-001/002/003 paths are TBD. Must be defined.

5. **G-5 — Guest resume parsed-data DTO:** Exact DTO "remain to be filled before freeze" (PHASE-06 §3).

### What IS approved:
- ✅ Resume upload route + DTO (file, original_file_name, mime_type, file_size_bytes)
- ✅ `uploaded_documents` schema + XOR ownership + checksum reuse indexes + immutability
- ✅ `security.scan.requested` event/task contract + dispatcher route + worker handler
- ✅ `resume.parse.requested` event/task contract + dispatcher route + worker handler
- ✅ `resume_parsed_data` immutable table + parsing artifacts/events
- ✅ Resume status + parsed-data routes + exclusion of raw text/AI/artifacts
- ✅ Confirm route with atomic transaction (scan clean + revision + outbox)
- ✅ `bump_candidate_profile_revision()` function (one revision per logical save)
- ✅ `profile_change_history` immutable table
- ✅ Active resume rules (first auto-active, later explicit, unique constraint)
- ✅ RLS + DECISION-01 (UserContextClient/SystemClient split)
- ✅ Private storage + checksum reuse + no secrets leak in logs
- ✅ Phase-04 transaction template discipline

**No source code or SQL was modified in this review.**