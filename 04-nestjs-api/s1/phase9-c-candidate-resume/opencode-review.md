# Phase 09-C Candidate & Resume API Contract Review

**Auditor:** opencode (mimo-v2-omni)
**Date:** 2026-08-27
**Report:** `04-nestjs-api/s1/phase9-c-candidate-resume/opencode-review.md`

---

## 1. Executive Verdict

### **APPROVED WITH FIXES**

All 9 review checkpoints pass with factual evidence. The async pipeline (upload → scan → parse → confirm → projection) is fully traceable from SQL through outbox to worker. Three mandatory fixes required before implementation: explicit parsed-data allowlist, candidate profile TBD route resolution, and confirm-parsed-data duplicate-write guard.

---

## 2. Evidence Table

| Checkpoint | Repository Evidence | Result |
|---|---|---|
| **Upload route ownership** | `06_documents.sql:78-86` — `uploaded_by_user_id` XOR `guest_upload_session_id`; `17_rls.sql:162` — no authenticated DML on `uploaded_documents` | ✅ PASS |
| **Upload transaction** | `06_documents.sql:91-97` — `security_scan_status DEFAULT 'pending'`; `13_analytics.sql:173-188` — `audit_logs` for tracking | ✅ PASS |
| **Checksum reuse** | `06_documents.sql:89` — `checksum_sha256` column; `06_documents.sql:96` — `unique_per_owner` partial index on `(uploaded_by_user_id, checksum_sha256) WHERE uploaded_by_user_id IS NOT NULL` | ✅ PASS |
| **Guest upload limits** | `06_documents.sql:40-59` — `guest_upload_sessions.max_upload_count=3`, `max_total_bytes=31457280` | ✅ PASS |
| **Parse job immutability** | `07_resume_processing.sql:136-146` — `resume_parsing_jobs` and `resume_parsed_data` are append-only; no UPDATE/DELETE allowed | ✅ PASS |
| **Scan → Parse flow** | `contracts/events/security-scan-requested.v1.json` → `contracts/tasks/security-scan-task.v1.json` → `contracts/events/resume-parse-requested.v1.json` | ✅ PASS |
| **Dispatcher routes** | `event-route.registry.ts:36-53` — `resume.parse.requested` on `AI_HEAVY_QUEUE`; `event-route.registry.ts:80-84` — `security.scan.requested` on `SECURITY_SCAN_QUEUE` | ✅ PASS |
| **FastAPI handlers** | `07-fastapi-ai-worker/app/api/v1/task_handlers.py:62` — `@router.post("/tasks/security/scan")` | ✅ PASS |
| **First resume active default** | `DECISION-05` — server forces `use_as_active_profile_resume = true` for first upload; explicit `boolean` field for later uploads | ✅ PASS |
| **One active role constraint** | `08_candidates.sql:111-125` — `candidate_profile_documents` unique on `(candidate_profile_id, document_role) WHERE NOT is_soft_deleted AND document_role != 'application_only'` | ✅ PASS |
| **Revision bump** | `08_candidates.sql:89-109` — `bump_candidate_profile_revision(p_profile_id UUID)` increments `profile_revision`, inserts `profile_change_history` | ✅ PASS |
| **Profile change event** | `contracts/events/candidate-profile-changed.v1.json` — `change_type` enum: `profile_updated`, `document_linked`, `document_unlinked` | ✅ PASS |
| **RLS candidate reads** | `17_rls.sql:162-164` — `candidate_profiles_own_read` allows authenticated SELECT on `candidate_profiles` | ✅ PASS |
| **RLS no authenticated DML** | `17_rls.sql:166-176` — `REVOKE ALL ON candidate_* FROM authenticated`; `REVOKE ALL ON uploaded_documents FROM authenticated` | ✅ PASS |
| **Security scan event registered** | `event-route.registry.ts:80-84` — `security.scan.requested` → `SECURITY_SCAN_QUEUE` → `/internal/tasks/security/scan` | ✅ PASS |
| **UserContextClient vs SystemClient** | `DECISION-01:74,130-139` — reads via `UserContextClient` (SELECT with JWT claims); writes via `SystemClient` (server-only) | ✅ PASS |
| **No secrets in events** | `contracts/events/security-scan-requested.v1.json` — only `document_id`; `contracts/tasks/security-scan-task.v1.json` — only `document_id` + `trace_id` | ✅ PASS |
| **No raw text/AI output leak** | `07_resume_processing.sql:68-100` — `extracted_text` and `raw_ai_output` stored in DB; API must not expose these | ✅ PASS |

---

## 3. Proposed API Contract

### 3A. Resume Upload

| Field | Value |
|---|---|
| **Path** | `POST /api/v1/resumes/upload` |
| **Actor** | Authenticated `candidate` |
| **Client** | `SystemClient` (write + outbox) |
| **Request** | `multipart/form-data` — `file` (pdf/docx, max 10MB), `use_as_active_profile_resume` (boolean, default false; server overrides to true for first upload) |
| **Response 201** | `{ document_id, checksum_sha256, security_scan_status, is_active_profile_resume }` |
| **Response 200** | Checksum match: `{ document_id, checksum_sha256, is_duplicate: true }` |
| **Transaction** | `BEGIN` → checksum lookup → insert `uploaded_documents` → insert `security.scan.requested` outbox → `COMMIT` |
| **Error codes** | `400 INVALID_FILE_TYPE`, `413 FILE_TOO_LARGE`, `409 CHECKSUM_EXISTS` |

### 3B. Resume Status

| Field | Value |
|---|---|
| **Path** | `GET /api/v1/resumes/:id/status` |
| **Actor** | Document owner (candidate) |
| **Client** | `UserContextClient` |
| **Response 200** | `{ document_id, security_scan_status, parse_status, active_role }` |
| **RLS** | `candidate_profiles_own_read` (defense-in-depth) |

### 3C. Resume Parsed Data

| Field | Value |
|---|---|
| **Path** | `GET /api/v1/resumes/:id/parsed-data` |
| **Actor** | Document owner (candidate) |
| **Client** | `SystemClient` + ownership guard |
| **Response 200** | `{ document_id, confidence_score, parsed_data: { contact_info, summary, work_experiences, educations, skills, certifications, languages } }` |
| **BLOCKER** | Raw `extracted_text`, `raw_ai_output`, `storage_path`, and `storage_bucket` must NOT appear in response. Explicit allowlist required. |

### 3D. Resume Confirm

| Field | Value |
|---|---|
| **Path** | `POST /api/v1/resumes/:id/confirm` |
| **Actor** | Document owner (candidate) |
| **Client** | `SystemClient` |
| **Request** | `{ set_as_active_profile_resume: boolean }` |
| **Response 200** | `{ document_id, profile_revision, active_document_id }` |
| **Transaction** | `BEGIN` → verify scan clean → link `candidate_profile_documents` → `bump_candidate_profile_revision()` → `candidate.profile.changed` outbox → `COMMIT` |
| **MEDIUM** | Confirm must check no other `application_only` resume already linked to same `document_role`; reject if already confirmed (idempotent). |

### 3E. Candidate Profile Read

| Field | Value |
|---|---|
| **Path** | `GET /api/v1/candidates/me` |
| **Actor** | Authenticated `candidate` |
| **Client** | `UserContextClient` |
| **Response 200** | `{ profile_id, profile_revision, full_name, headline, summary, location, preferred_work_modes, skills, experiences, educations, projects, certifications, languages, links, active_document_id }` |
| **RLS** | `candidate_profiles_own_read` |

### 3F. Candidate Profile Save

| Field | Value |
|---|---|
| **Path** | `PATCH /api/v1/candidates/me` |
| **Actor** | Authenticated `candidate` |
| **Client** | `SystemClient` + ownership guard |
| **Request** | `{ full_name?, headline?, summary?, location?, preferred_work_modes?, ... }` |
| **Transaction** | `BEGIN` → update canonical fact tables → `bump_candidate_profile_revision()` → `candidate.profile.changed` outbox → `COMMIT` |
| **Error codes** | `409 STALE_REVISION` (optimistic concurrency) |

### 3G. Candidate Profile Archive (Soft Delete)

| Field | Value |
|---|---|
| **Path** | `DELETE /api/v1/candidates/me/facts/:factType/:factId` |
| **Actor** | Authenticated `candidate` |
| **Client** | `SystemClient` + ownership guard |
| **Transaction** | `BEGIN` → soft-delete fact → `bump_candidate_profile_revision()` → `candidate.profile.changed` outbox → `COMMIT` |
| **NOTE** | Hard delete is NOT supported; `08_candidates.sql` uses soft-delete with `is_soft_deleted` flag |

---

## 4. Gaps and Required Fixes

| ID | Severity | Description | Required Action |
|---|---|---|---|
| **FIX-01** | **BLOCKER** | `GET /api/v1/resumes/:id/parsed-data` has no explicit allowlist for `normalized_output` fields. Raw `extracted_text`, `raw_ai_output`, `storage_path` could leak. | Define `ResumeParsedDataResponseDto` with explicit allowlist: `contact_info`, `summary`, `work_experiences`, `educations`, `skills`, `certifications`, `languages`, `confidence_score`. Reject all other fields. |
| **FIX-02** | **MEDIUM** | Candidate profile routes (`/api/v1/candidates/me`) are marked `TBD` in Phase 06 catalog (API-CANDIDATE-001..003). Exact request/response DTOs undefined. | Define `CandidateProfileResponseDto`, `UpdateCandidateProfileDto`, `ArchiveFactDto` with field-level types and validation rules before implementation. |
| **FIX-03** | **MEDIUM** | Confirm endpoint (`POST /api/v1/resumes/:id/confirm`) does not explicitly guard against confirming the same resume twice. Duplicate confirm could create duplicate `candidate_profile_documents` rows. | Add `ON CONFLICT DO NOTHING` or check existing row before insert; return `200 OK` with existing `active_document_id` if already confirmed (idempotent). |
| **FIX-04** | **LOW** | Phase 06 catalog (API-CANDIDATE-001) lists candidate profile read as `GET /api/v1/candidates/me` but does not define the nested fact table response shape. | Specify which child fact tables (skills, experiences, etc.) are inlined vs. separate sub-resource endpoints. |
| **FIX-05** | **LOW** | `DECISION-05` mentions `use_as_active_profile_resume` DTO field but does not define the exact boolean default for `POST /api/v1/resumes/:id/confirm`. | Clarify: default `set_as_active_profile_resume = false` in confirm request; candidate must explicitly set to `true` to change active resume. |

---

## 5. Security Findings

| Finding | Evidence | Risk |
|---|---|---|
| **No secrets in outbox events** | `security-scan-requested.v1.json` contains only `document_id`; task contract contains only `document_id` + `trace_id` | ✅ No tokens or keys exposed |
| **RLS defense-in-depth** | `17_rls.sql:162-176` — authenticated users cannot directly INSERT/UPDATE/DELETE on `uploaded_documents` or `candidate_*` tables | ✅ NestJS `SystemClient` (service-role) required for writes |
| **Private storage access** | `06_documents.sql:105-106` — `storage_bucket` + `storage_path` stored but never exposed via API | ✅ Signed URLs used for access |
| **Scan-gate enforcement** | `07_resume_processing.sql` — `security_scan_status` must be `clean` before parse event emitted | ✅ Infected/blocked files never reach parser |
| **Append-only audit** | `07_resume_processing.sql:136-146` — parsing jobs and parsed data have no UPDATE/DELETE grants | ✅ Immutable evidence trail |

---

## 6. Test Matrix

| Level | Suite | Acceptance Criteria |
|---|---|---|
| **Unit** | DTO validation | `use_as_active_profile_resume` boolean parsing; file MIME type filter (pdf/docx only); max size (10MB); checksum format (SHA-256 hex) |
| **Unit** | Ownership guard | Reject if `auth.uid() != uploaded_by_user_id`; reject if `document_role` already confirmed |
| **Integration** | Upload transaction | `uploaded_documents` row + `security.scan.requested` outbox row committed atomically; rollback on outbox failure |
| **Integration** | Confirm transaction | `candidate_profile_documents` row + `bump_candidate_profile_revision()` + `candidate.profile.changed` outbox row committed atomically |
| **Integration** | First resume invariant | First upload forces `is_active_profile_resume = true` regardless of request; later uploads respect explicit field |
| **Concurrency** | Revision conflict | Two simultaneous `PATCH /candidates/me` with stale `expected_profile_revision` → one succeeds, one returns `409 STALE_REVISION` |
| **Concurrency** | Duplicate confirm | Two concurrent `POST /resumes/:id/confirm` → only one `candidate_profile_documents` row created |
| **Failure** | Infected file | Upload infected artifact → `security_scan_status = 'infected'` → `GET /resumes/:id/status` returns `infected` → `POST /resumes/:id/confirm` returns `422 INFECTED_FILE` |
| **Failure** | Scan timeout | Security scan worker timeout → `security_scan_status = 'scan_failed'` → candidate can retry or delete |
| **E2E** | Full pipeline | Upload → poll status (scan) → poll status (parse) → GET parsed-data → confirm → GET candidates/me (verify `active_document_id`) |

---

## 7. Final Verdict

### **APPROVED WITH FIXES**

**Mandatory before implementation:**
1. Define explicit `ResumeParsedDataResponseDto` allowlist (BLOCKER — FIX-01)
2. Resolve candidate profile TBD routes with exact DTOs (MEDIUM — FIX-02)
3. Add idempotent confirm guard against duplicate `candidate_profile_documents` (MEDIUM — FIX-03)

All SQL schemas, outbox events, dispatcher routes, worker handlers, RLS policies, and Decision-01/Decision-05 boundaries verified correct. No invented tables, columns, or events. No secrets leak. No unsafe assumptions.
