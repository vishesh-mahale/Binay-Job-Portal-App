# Phase 09-C Candidate & Resume API Contract Review

**Scope:** Candidate + Resume API contract pre-implementation review  
**Auditor:** Kilo  
**Date:** 2026-08-27  
**Report File Location:** `04-nestjs-api/s1/phase9-c-candidate-resume/kilo-review.md`

---

## 1. Evidence Table

| Verification Point | Source | Finding |
|---|---|---|
| **Resume upload route** | `PHASE-06` API-RESUME-001 | `POST /api/v1/resumes/upload` — actor: authenticated candidate; request: multipart + `use_as_active_profile_resume` boolean + optional Idempotency-Key; transaction: `uploaded_documents` metadata + `security.scan.requested` outbox atomic. |
| **Resume status route** | `PHASE-06` API-RESUME-002 | `GET /api/v1/resumes/:id/status` — actor: document owner; response: `document_id, security_scan_status, processing_status, stage, retryable, timestamps`. |
| **Parsed-data route** | `PHASE-06` API-RESUME-003 | `GET /api/v1/resumes/:id/parsed-data` — actor: document owner; allowlisted `normalized_output, confidence_details, validation_result, overall_confidence, schema_version, partial`. **BLOCKER:** field-by-field allowlist is explicitly marked as API-catalog blocker (PHASE-06 line 102). |
| **Confirm route** | `PHASE-06` API-RESUME-004 | `POST /api/v1/resumes/:id/confirm` — actor: document owner; request: `expected_profile_revision` + allowlisted facts + Idempotency-Key; atomic: facts + `bump_candidate_profile_revision()` + `profile_change_history` + `candidate.profile.changed` outbox. |
| **Candidate read/save/archive** | `PHASE-06` API-CANDIDATE-001..003 | Paths are `TBD` in Phase 06. **BLOCKER:** These routes are NOT included in `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md`. Exact paths/DTOs remain unfrozen. |
| **First resume active default** | `DECISION-05` | First profile resume is automatically active; UI control checked/disabled; server enforces invariant independently. Confirmed in worker projection (`active_resume_document_id` usage). |
| **Later resume active selection** | `DECISION-05`, `PHASE-06` API-RESUME-001 | Later uploads require explicit `use_as_active_profile_resume` boolean. Application-only uploads are separate scope. |
| **Ownership & JWT auth** | `DECISION-01`, `17_rls.sql`, `PHASE-06` | `uploaded_by_user_id` derived from JWT `sub`, never request body. `UserContextClient` for approved reads; `SystemClient` for writes and protected reads. RLS `candidate_profiles_own_read` via `public.owns_candidate()`. |
| **Private storage & checksum reuse** | `06_documents.sql`, `PHASE-05` line 94 | Browser uploads to NestJS (not direct Supabase Storage). Unique index `uq_uploaded_document_checksum_owner` on `(uploaded_by_user_id, checksum_sha256)` enables reuse without duplicate scan/event. |
| **`uploaded_documents` transaction** | `PHASE-06` API-RESUME-001, `15_infrastructure.sql` | Atomic: insert `uploaded_documents` row + `security.scan.requested` outbox event. No external call inside transaction. |
| **`security.scan.requested` event** | `contracts/events/security-scan-requested.v1.json`, `event-route.registry.ts`, `task_handlers.py:62` | Contract exists, registered on `security-scan-queue` → `/internal/tasks/security/scan`, worker handler implemented. |
| **Security scan → parsing → confirmation → projection** | `contracts/`, `event-route.registry.ts`, `task_handlers.py`, `projection_service.py` | Full pipeline contracted and implemented: `security.scan.requested` → clean → `resume.parse.requested` → `candidate.resume.parsed` → confirm → `candidate.profile.changed` → `candidate.projection.rebuilt`. |
| **Raw text / AI output / storage path / secrets leak** | `PHASE-05` lines 92-93, `PHASE-06`, `task_handlers.py` | `extracted_text`, `raw_ai_output`, `storage_path`, tokens excluded from API responses. Worker logs use sanitized metadata only. |
| **UserContextClient / SystemClient usage** | `DECISION-01`, `PHASE-07`, `PHASE-08` | Reads with explicit RLS policies use `UserContextClient`; all writes, document/parsing reads, and outbox creation use `SystemClient`. Separation is architecturally mandated. |
| **RLS & NestJS auth interaction** | `17_rls.sql`, `DECISION-01` | RLS enabled on all 03-15 tables. Browser roles have no DML grants. `uploaded_documents`, `resume_parsing_jobs`, `resume_parsed_data` have no authenticated SELECT grant — default-deny, SystemClient-only. |
| **Missing contract / schema gap / wrong event / wrong queue / invented behavior** | `contracts/`, `event-route.registry.ts` | No invented events found. `resume.parse.requested` → `ai-heavy-queue`, `candidate.profile.changed` → `projection-queue`, `security.scan.requested` → `security-scan-queue` — all match registry. |
| **Unit / integration / concurrency / failure / live E2E tests** | Repository search | **GAP:** No NestJS resume/candidate test files exist in the repository. Worker has inline handlers but no dedicated test suite for the resume/candidate pipeline was found. |

---

## 2. Proposed API Contract

Based on `PHASE-06` and verified against baseline SQL + worker implementation:

### Resume APIs (catalogued in Phase 06; exact DTO class names remain TBD until Phase 09-C or equivalent freeze)

| Endpoint | Method | Actor | Request | Response | Transaction | Outbox |
|---|---|---|---|---|---|---|
| `/api/v1/resumes/upload` | POST | Authenticated candidate | multipart file + `use_as_active_profile_resume` boolean + optional Idempotency-Key | `201` new document or `200` reused document; `document_id`, both status tracks, `stage`, `reused` | `uploaded_documents` insert + `security.scan.requested` atomic | `security.scan.requested` → `security-scan-queue` |
| `/api/v1/resumes/:id/status` | GET | Document owner | `document_id` path param | `document_id`, `security_scan_status`, `processing_status`, `stage`, `retryable`, timestamps | Read-only bounded query via `SystemClient` | None |
| `/api/v1/resumes/:id/parsed-data` | GET | Document owner | `document_id` path param | Allowlisted `normalized_output`, `confidence_details`, `validation_result`, `overall_confidence`, `schema_version`, `partial` | Read-only bounded query via `SystemClient` | None |
| `/api/v1/resumes/:id/confirm` | POST | Document owner | `expected_profile_revision` + allowlisted canonical facts + Idempotency-Key | `candidate_id`, new `profile_revision`, `active_document_id`, projection queued state | Atomic: row lock + fact updates + `bump_candidate_profile_revision()` + `profile_change_history` + outbox | `candidate.profile.changed` → `projection-queue` |

### Candidate Profile APIs (paths TBD in Phase 06; NOT frozen in Phase 09-B)

| Endpoint | Method | Actor | Request | Response | Transaction | Outbox |
|---|---|---|---|---|---|---|
| `TBD` — read own profile | GET | Authenticated candidate | none | `candidate_profiles` + authorized child facts (system fields filtered) | Read-only via `UserContextClient` + RLS | None |
| `TBD` — save canonical facts | PATCH/POST | Authenticated candidate | allowlisted facts + `expected_profile_revision` + Idempotency-Key | updated profile, new `profile_revision`, projection queued state | Atomic: facts + revision + `profile_change_history` + outbox | `candidate.profile.changed` → `projection-queue` |
| `TBD` — archive fact | POST/DELETE | Authenticated candidate | fact identifier + `expected_profile_revision` | updated `profile_revision`, projection queued state | Atomic: soft-delete fact + revision + history + outbox | `candidate.profile.changed` → `projection-queue` |

---

## 3. Gaps / Conflicts

| ID | Severity | Description | Evidence |
|---|---|---|---|
| **GAP-01** | **BLOCKER** | Candidate profile API paths (`API-CANDIDATE-001..003`) are `TBD` in Phase 06 and **not included** in `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md`. Implementation cannot proceed without a Phase 09-C (or equivalent) freeze that finalizes paths, DTOs, and authorization rules. | `PHASE-09-B` lines 18-39: only identity/company endpoints listed. No candidate endpoints. |
| **GAP-02** | **BLOCKER** | `API-RESUME-003` parsed-data field-by-field `normalized_output` allowlist is explicitly unresolved. PHASE-06 line 102 states: "field-by-field normalized allowlist remains API-catalog blocker." | `PHASE-06` line 102 |
| **GAP-03** | **MEDIUM** | `resume_parse_requested.v1.json` uses JSON Schema draft-07 while `security_scan_requested.v1.json` uses draft-2020-12. Inconsistent contract versions; no functional impact but should be normalized before producer freeze. | `contracts/tasks/resume-parse-task.v1.json` (draft-07) vs `contracts/events/security-scan-requested.v1.json` (draft-2020-12) |
| **GAP-04** | **MEDIUM** | No NestJS-side unit/integration tests for resume or candidate modules exist in the repository. Worker has inline handlers but no test suite. Phase 08 requires test coverage before implementation authorization. | `PHASE-08` lines 143-150; repository glob search returned no `*resume*.spec.ts` or `*candidate*.spec.ts` files. |
| **GAP-05** | **LOW** | `security-scan-requested.v1.json` `aggregate_type` is `"uploaded_document"` (singular) while the DB table is `uploaded_documents` (plural). Dispatcher routes by `event_type`, so this does not break routing, but it is an inconsistency in aggregate naming. | `contracts/events/security-scan-requested.v1.json` line 21 vs `06_documents.sql` table name |

---

## 4. Security Findings

| Finding | Severity | Detail |
|---|---|---|
| **S-01: STRICT — Raw data exclusion** | Info | `extracted_text`, `raw_ai_output`, `storage_path`, `storage_bucket`, tokens, and secrets are architecturally excluded from API responses and NestJS logs. Contracts and Phase 05/06 rules enforce this. |
| **S-02: STRICT — SystemClient-only for sensitive reads** | Info | `uploaded_documents`, `resume_parsing_jobs`, `resume_parsed_data` have no authenticated SELECT grant in `17_rls.sql`. Any accidental `UserContextClient` usage fails closed with default-deny. This is correct. |
| **S-03: STRICT — Scan-gate enforcement** | Info | Only `clean` documents may enter parsing. Worker enforces this at DB level (`security_scan_status = 'clean'` check before parsing). Infected/quarantined/failed scans are terminal and halt the pipeline. |
| **S-04: STRICT — Ownership never from request body** | Info | `uploaded_by_user_id` is derived from JWT `sub`. `owner_id`, `company_id`, `actor` are server-derived. No client-forged identity is accepted. |
| **S-05: STRICT — Idempotency & duplicate prevention** | Info | Checksum reuse (`uq_uploaded_document_checksum_owner`) + Idempotency-Key on confirm + `processed_events` idempotency in worker + deterministic task-name deduplication in dispatcher. Multiple layers prevent duplicate side effects. |
| **S-06: OBSERVATION — RLS defense-in-depth** | Info | RLS remains active as secondary authorization even though NestJS guards are primary. Cross-tenant negative reads/writes are explicitly required by Phase 07 architecture acceptance tests. |

---

## 5. Test Matrix

| Test Level | Required Scope | Current Status | Gap |
|---|---|---|---|
| **Unit** | DTO validation, guard ownership extraction, magic-byte/MIME checks, checksum reuse logic | **MISSING** — no `*.spec.ts` files found for resume/candidate modules | Must be created before Phase 09-C implementation authorization |
| **Integration** | Atomic upload transaction (`uploaded_documents` + `security.scan.requested`), confirm transaction (facts + revision + history + outbox), checksum reuse returns `200` with existing `document_id` | **MISSING** | Must be created |
| **Concurrency** | Stale `expected_profile_revision` returns `409 STALE_REVISION`; concurrent uploads do not create duplicate documents | **MISSING** | Must be created |
| **Failure** | Infected/quarantined/failed scan halts pipeline; `SCAN_PENDING` blocks parse; malformed file rejected before storage | **PARTIAL** — worker has inline error handling but no NestJS-side failure tests | Must be created |
| **Live E2E** | Upload → Security Scan → Parse → Status Poll → Fetch Parsed Data → Confirm Profile → Projection Rebuild | **MISSING** | Must be created in Phase 09 |
| **Worker Idempotency** | `processed_events` deduplication; Cloud Task `ALREADY_EXISTS` handling | **PARTIAL** — worker code implements idempotency but no test suite found | Must be verified |

---

## 6. Final Verdict

**BLOCKED**

| Blocker | Reason | Required Resolution |
|---|---|---|
| **Candidate API paths not frozen** | `API-CANDIDATE-001..003` paths are `TBD` in Phase 06 and absent from Phase 09-B freeze candidate. | Finalize candidate profile read/save/archive paths and DTOs in a Phase 09-C (or equivalent) contract freeze before implementation. |
| **Parsed-data allowlist unresolved** | `API-RESUME-003` field-by-field `normalized_output` allowlist is explicitly an API-catalog blocker. | Complete the allowlist schema, register it in the contract, and update the API catalog. |
| **No test coverage** | No NestJS unit/integration tests exist for resume/candidate modules. Phase 08 requires test suites before implementation authorization. | Create test suites per Phase 08 Section 5 requirements. |

### What is confirmed correct (no changes needed):

- Resume upload/status/parsed-data/confirm routes and transaction boundaries are architecturally sound and fully contracted.
- The full async pipeline (`security.scan.requested` → `resume.parse.requested` → `candidate.resume.parsed` → `candidate.profile.changed` → `candidate.projection.rebuilt`) is correctly registered, routed, and implemented.
- First-resume-active rule from DECISION-05 is correctly enforced in both contract and worker projection logic.
- Access model (`UserContextClient` vs `SystemClient`) is correctly aligned with RLS and DECISION-01.
- Raw resume text, AI output, storage paths, and secrets are correctly excluded from API responses.
- Checksum reuse and idempotency mechanisms are correctly specified and implemented at multiple layers.

**No implementation may proceed until the three blockers above are resolved and a Phase 09-C (or equivalent) candidate/resume contract freeze is completed.**
