# Stage-03 DTO & Error Contract Independent Review

Reviewer: qoder (independent Senior NestJS API / PostgreSQL / distributed-systems reviewer)

Scope: proposed success/error envelope, 15 error codes and HTTP mapping for the four resume
APIs (`POST /api/v1/resumes/upload`, `GET /api/v1/resumes/:id/status`,
`GET /api/v1/resumes/:id/parsed-data`, `POST /api/v1/resumes/:id/confirm`).

Review date: 2026-08-26. No code, SQL or contract was modified. No tests were executed —
this review is static evidence-based verification only; nothing below claims runtime results.

## 1. Executive verdict

**APPROVED WITH CHANGES.**

The envelope shape is sound, the SCREAMING_SNAKE code convention matches the existing worker
vocabulary, and most proposed codes map to real database states. However:

- one example code (`RESUME_NOT_READY`) is not in the proposed code list — internal
  inconsistency;
- `DUPLICATE_RESUME` as an error conflicts with the approved duplicate-checksum REUSE rule
  (same owner/session + checksum returns the existing document as success);
- the `quarantined` scan state has no code or explicit mapping;
- `partial` parsing job status has no defined mapping;
- guest-session state errors (expired/revoked/consumed) and storage-dependency failure are
  missing;
- `RESUME_LIMIT_REACHED` and the scan/parsing-pending-on-confirm cases have no HTTP mapping
  entry;
- `IDEMPOTENCY_CONFLICT` depends on idempotency semantics that are still an open decision
  (REMAINING-DECISIONS §8) and needs storage support that does not exist yet;
- the ownership-error policy (403 vs 404) as written can leak document existence;
- one upstream wording conflict in the frozen multipart decision (scan ordering) affects which
  error codes can ever be synchronous.

## 2. Files and sources checked

| Source | Relevant sections/objects |
|---|---|
| `s1/codex/STAGE-03-REMAINING-DECISIONS.md` (updated, 224 lines) | §1 error families; §1A binding constraints incl. **FROZEN NestJS-mediated multipart** (:39-41); §2 frozen upload flow (:46-68); §7 allowlist; §8 idempotency open items; §11.1-11.6 added decisions |
| `s1/codex/STAGE-03-NESTJS-API-REQUIREMENTS-SYNC.md` | four-API requirements; status sequence; ownership-safe not-found rule; PII rules |
| `s1/codex/STAGE-03-CONSOLIDATED-REMAINING-DECISIONS-REVIEW.md` | header owner-decision note (multipart supersedes signed-URL wording); §2.2 envelope not yet frozen by any repo file; §3 matrix |
| `04-nestjs-api/PHASE-01-REQUIREMENTS-CONSOLIDATION.md` | REQ-RESUME-001..007 (:82-90) |
| `04-nestjs-api/NESTJS-IMPLEMENTATION-GUIDE.md` | §6 profile save + 409 stale revision (:233-234); §8.4 checksum reuse (:264), §8.7 signed URL (:268 — superseded by owner decision for transport only); §9 scan/parse chain |
| `01-requirements/product-decisions/PD-002-ACTIVE-RESUME-SEARCH.md` | 10-resume library limit (:25-50); active-profile selection (:61-82) |
| `s1/codex/SECURITY-SCAN-IMPLEMENTATION-STAGES-AND-VERIFICATION-PLAN.md` | Stage-1 non-negotiables: "Full antivirus scan upload request में नहीं चलेगा" (:185); fail-closed; PII rules |
| `02-database/migrations/baseline/02_enums.sql` | `security_scan_status` = pending/scanning/clean/infected/failed/**quarantined**; `resume_processing_status` incl. **partial** (:302-311); `parsing_job_status` incl. **partial**, cancelled |
| `02-database/migrations/baseline/06_documents.sql` | `uploaded_documents` columns (:72-106); `guest_upload_sessions` limits max_upload_count=3, max_total_bytes=31457280 (:39-59); XOR owner check (:91-95) |
| `02-database/migrations/baseline/07_resume_processing.sql` | `resume_parsing_jobs` incl. `idempotency_key`, `attempt_number`, `max_attempts`, `error_details` (:39-67); `resume_parsed_data` columns (:69-100); immutability triggers |
| `02-database/migrations/baseline/08_candidates.sql` | `candidate_profiles.profile_revision`; `profile_change_history`; `bump_candidate_profile_revision` |
| `02-database/migrations/baseline/15_infrastructure.sql` | `outbox_events` has `correlation_id`/`causation_id` (:32-33) — **no trace_id column**; trace_id travels inside `payload` JSONB; `processed_events` (:91+) |
| `02-database/migrations/baseline/17_rls.sql` | no authenticated grants for document/parsing tables → trusted-path reads only; guest rules |
| `contracts/events/security-scan-requested.v1.json` | payload supports `trace_id` (uuid) (:49-51) |
| `contracts/events/resume-parse-requested.v1.json` + emitted payload | worker emits payload `{document_id, trace_id}` (task_handlers.py :174) |
| `07-fastapi-ai-worker/app/api/v1/task_handlers.py` | existing code vocabulary: `OIDC_UNAUTHORIZED`, `SCAN_IN_PROGRESS`, `DOCUMENT_NOT_FOUND`, `SCANNER_UNAVAILABLE`, `SCAN_PENDING` (:79-127, :281); infected/quarantined terminal handling (:282-297) |
| `04-nestjs-api/DECISION-01/02`, `AGENTS.md` | binding constraints; no secrets/resume content in repo/logs |
| Prior stage3 reviews (`qoder-STAGE-03-API-SYNC-REVIEW.md`, `qoder-STAGE-03-REMAINING-DECISIONS-REVIEW.md`) | carried context; both superseded where stale (see §4.7) |

## 3. Correct points

| Point | Verdict | Evidence |
|---|---|---|
| Envelope shape `{success, data/error, request_id, trace_id}` | Supported — clean, machine-readable, symmetric | No repo file freezes an envelope (consolidated §2.2), so this is a valid catalog proposal; nothing conflicts |
| SCREAMING_SNAKE error codes | Matches existing convention | FastAPI worker already uses `SCAN_PENDING`, `SCANNER_UNAVAILABLE`, `DOCUMENT_NOT_FOUND`, `OIDC_UNAUTHORIZED` (task_handlers.py :79-281) |
| `SCAN_PENDING` | Real state | `security_scan_status IN (pending, scanning)`; worker uses the identical code (:281) |
| `SCAN_FAILED` | Real state | `security_scan_status = 'failed'` (scanner-unavailable path writes `failed` + retryable error, task_handlers.py :115-127) |
| `INFECTED_FILE` | Real state | `security_scan_status = 'infected'`; parse handler treats infected as terminal (:282-297) |
| `PARSING_PENDING` / `PARSING_FAILED` | Real states | `parsing_job_status` queued/processing/failed (02_enums; PHASE-04 §6.3) |
| `STALE_REVISION` → 409 | Frozen behavior, not an invention | Guide §6 :234 explicitly mandates HTTP 409 on stale expected revision |
| `RESUME_LIMIT_REACHED` | Real approved rule | PD-002 :25-50 (10 active library resumes) |
| `RATE_LIMITED` → 429 | Standard; numbers correctly stay open | REMAINING-DECISIONS §3 (NEEDS_DECISION) |
| trace_id propagation design | Supported end-to-end | `security-scan-requested` payload supports `trace_id` (:49-51); worker forwards `trace_id` into `resume.parse.requested` payload (:174) and `processed_events` metadata (:294) |
| PII intent (generic messages, no content in `details`) | Matches frozen rules | SECURITY-SCAN plan non-negotiables; DECISION-02 sanitized nudges; AGENTS.md :47 |
| 401/429/500 mappings | Correct | Standard semantics; consistent with worker auth errors (:79) |

## 4. Incorrect or unsupported points

| # | Issue | Evidence | Correction |
|---|---|---|---|
| 4.1 | Example envelope uses code `RESUME_NOT_READY` which is absent from the 15-code list | Proposed contract text itself | Either add `RESUME_NOT_READY` as an umbrella "not-ready" code or change the example to `PARSING_PENDING`/`SCAN_PENDING`. Do not ship an example code outside the frozen list |
| 4.2 | `DUPLICATE_RESUME` as an ERROR contradicts the approved reuse rule: same owner/session + checksum returns the EXISTING document (success, no second scan event) | Guide §8.4 (:264); REMAINING-DECISIONS §1A (:36); consolidated matrix row "Duplicate checksum reuse — Already approved" | Redefine: duplicate for the SAME owner = success (200, `reused: true`). Keep `DUPLICATE_RESUME` only for a defined conflicting case (e.g., checksum collision across different owners/sessions under a unique constraint) or remove it |
| 4.3 | `quarantined` scan state unmapped — the enum has 6 values, the worker treats `quarantined` identically to `infected` as terminal | `02_enums.sql` security_scan_status; task_handlers.py :105, :282 | Either add `QUARANTINED_FILE` or state explicitly that quarantined maps to `INFECTED_FILE` (recommended: single code, distinction only in safe `details`) |
| 4.4 | `partial` parsing status unmapped — both `parsing_job_status` and `resume_processing_status` include `partial` ("blurry PDF" case) | `02_enums.sql` :310; PHASE-04 §6.3 | Define: `partial` returns parsed-data with a `partial: true` marker (review-ready with warning), or maps to a dedicated code. Must not fall silently into `PARSING_FAILED` |
| 4.5 | Ownership error policy leaks existence: mapping "403 → ownership/permission failure" for cross-user document reads reveals the document exists | SYNC draft acceptance rule: unauthorized IDs return not-found/forbidden "without leaking ownership" | Policy: unknown-or-not-owned resource → `NOT_FOUND` (404); reserve `FORBIDDEN` (403) for action denials where the resource is already disclosed (e.g., guest claim on consumed session) |
| 4.6 | Frozen multipart flow wording shows "→ security scan →" BEFORE storage write/outbox, implying a synchronous scan in the upload request — conflicts with the Stage-1 non-negotiable "full malware scan upload HTTP request में synchronous नहीं होगा" and with the implemented async chain (upload → pending → outbox → ClamAV) | REMAINING-DECISIONS §2 flow (:57-64) vs SECURITY-SCAN plan Stage-1 (:31, :185) and task_handlers.py :62-185 | Wording fix: NestJS validates auth/size/MIME/magic-bytes/checksum synchronously; storage write + `pending` row + outbox commit; ClamAV runs async. If the owner truly meant synchronous scanning, that is a NEW decision that contradicts the frozen Stage-1 direction and must be recorded explicitly. Until clarified, the error contract must assume async scan (so `INFECTED_FILE` is never a synchronous upload response) |
| 4.7 | Consolidated review §2.1 body still recommends Option B (signed handshake) while its own header note freezes multipart; my earlier qoder remaining-decisions recommendation (Option B) is therefore stale | Consolidated header note (:3-6); updated REMAINING-DECISIONS §1A/§2 | Transport = NestJS-mediated multipart is now the binding owner decision (authority: owner decision > doc wording, per PLAN authority order). This review treats it as frozen and does not reopen it |
| 4.8 | `IDEMPOTENCY_CONFLICT` presupposes replay semantics still open in REMAINING-DECISIONS §8 (key scope, retention, same-key replay response), and NO API-level idempotency store exists in the baseline SQL (only `resume_parsing_jobs.idempotency_key` for the worker and `processed_events` for consumers) | REMAINING-DECISIONS §8 (:129-143); 07/15 SQL | Keep the code but mark it dependent: define same-key+same-payload replay = original success response; `IDEMPOTENCY_CONFLICT` = same key + different payload (409). Storage table/column for API keys is catalog/implementation work and must not be invented now |
| 4.9 | `503` listed as "internal or dependency unavailable" but no code exists for dependency failure at the NestJS boundary (storage write failure, DB pool exhaustion) | Proposed mapping only has `INTERNAL_ERROR` | Add `DEPENDENCY_UNAVAILABLE` (503) distinct from `INTERNAL_ERROR` (500); scanner-unavailable stays an internal worker state surfaced to users only as retryable `SCAN_FAILED` via the status API |
| 4.10 | HTTP mapping omits `RESUME_LIMIT_REACHED` and the confirm-precondition cases (confirm attempted while scan/parsing pending) | Proposed mapping table | Map `RESUME_LIMIT_REACHED` → 409 (capacity conflict; 422 acceptable if kept consistent) and confirm-on-pending → 409/422 with `SCAN_PENDING`/`PARSING_PENDING` codes |

## 5. Missing DTO fields

| DTO | Missing / must-add fields | Evidence |
|---|---|---|
| Upload request (multipart) | `use_as_active_profile_resume: boolean` (+ product-approved default); guest session token binding; optional client `Idempotency-Key` header | PD-002 :61-82; REMAINING-DECISIONS §11.1; §8 |
| Upload response `data` | `document_id`, `security_scan_status`, `processing_status`, UI `stage`, `reused: boolean` (duplicate-checksum reuse must be visible), `created_at` | Guide §8.4; 06_documents.sql columns |
| Status response `data` | BOTH tracks separately: `security_scan_status` and `processing_status`; plus `parsing_job_status` when a job exists; deterministic UI `stage`; `created_at`/`updated_at`; `retryable: boolean` for failed scan; explicitly EXCLUDE `storage_path`, `security_scan_result` internals, `error_details` raw JSON | S3-C-01 two-track rule; 06 :81-89; 07 :59 |
| Parsed-data response `data` | `document_id`, source pair `parsing_job_id` + parsed-data id (Guide §9 :299 source-pair consistency), allowlisted normalized review fields, `overall_confidence`, `schema_version`, `partial: boolean`; EXCLUDE `extracted_text`, `raw_ai_output`, artifacts by default | 07_resume_processing.sql :69-100; REMAINING-DECISIONS §11.4; Guide §9 |
| Confirm request | `expected_profile_revision` (mandatory for the frozen 409 rule), allowlisted canonical fields only, `Idempotency-Key` header | Guide §6 :212, :234; REMAINING-DECISIONS §7/§8 |
| Confirm response `data` | new `profile_revision`, `candidate_id`, linked-document state (`active_document_id`), projection status flag (`projection: "queued"` — never a promise of completion) | 08_candidates.sql; registry projection route |
| Error envelope | `details` must be typed per-code (e.g., field names for `VALIDATION_ERROR`, `retry_after_seconds` for `RATE_LIMITED`) — free-form objects risk PII leakage | See §8 |

## 6. Missing or invalid error codes

**Invalid/conflicting:** `DUPLICATE_RESUME` (as currently defined — see 4.2).
**Inconsistent:** `RESUME_NOT_READY` (example-only — see 4.1).

**Missing codes:**

| Proposed code | State it must cover | Evidence |
|---|---|---|
| `GUEST_SESSION_INVALID` | guest session expired / revoked / consumed / wrong job | PHASE-04 §6.2 (:93-103); 06 guest session states |
| `DEPENDENCY_UNAVAILABLE` | storage/DB dependency failure at the NestJS boundary (503) | 4.9; worker precedent `SCANNER_UNAVAILABLE` 503 |
| `QUARANTINED_FILE` (or explicit mapping to `INFECTED_FILE`) | `security_scan_status='quarantined'` | 02_enums; task_handlers.py :282 |
| Optional split of `VALIDATION_ERROR` via `details.code`: `FILE_TOO_LARGE`, `UNSUPPORTED_FILE_TYPE`, `CHECKSUM_MISMATCH` | size/MIME/extension/magic-bytes/checksum rejections | Guide §8 (:259-268); SECURITY-SCAN plan :30 |

**Not needed / do not add:** any synchronous `SCAN_REJECTED_AT_UPLOAD` family (scan is async per
frozen Stage-1 direction — see 4.6); claim-machine codes belong to the future claim API surface,
not this four-API contract.

## 7. HTTP mapping review

| Mapping | Verdict | Note |
|---|---|---|
| 400 VALIDATION_ERROR | OK | Include typed field errors in `details`; never raw validator stack output |
| 401 UNAUTHORIZED | OK | Matches worker `OIDC_UNAUTHORIZED` precedent for the internal boundary; NestJS validates Supabase JWT |
| 403 FORBIDDEN | OK with restriction | Only for action denial on an already-disclosed resource; cross-user document access must be 404 (see 4.5) |
| 404 NOT_FOUND | OK | Default for unknown OR not-owned documents; also soft-deleted (`deleted_at`) documents |
| 409 conflict family | OK with fixes | `STALE_REVISION` frozen (Guide §6 :234); `IDEMPOTENCY_CONFLICT` per 4.8; `DUPLICATE_RESUME` only after 4.2 redefinition; add `RESUME_LIMIT_REACHED` and confirm-on-pending here |
| 422 infected/invalid business state | Acceptable | 422 vs 409 for `INFECTED_FILE` is a judgment call; 422 (unprocessable content) is defensible and consistent. Pick ONE and document it; do not mix |
| 429 RATE_LIMITED | OK | Add `Retry-After` / `retry_after_seconds`; numeric limits remain product-owned |
| 500 INTERNAL_ERROR | OK | Generic message only; full detail to logs with `request_id` |
| 503 dependency unavailable | OK but needs its own code | `DEPENDENCY_UNAVAILABLE` (4.9); upload success responses are 201 (new) / 200 (reuse) |

Additional note: consolidated §2.2 mentions `202 Accepted` as an upload-ack option. Since the
DB row + outbox event are committed synchronously before the response, `201 Created` (or `200`
on reuse) is more accurate than `202`; either is acceptable if documented.

## 8. Security and PII review

- **Messages must stay generic.** `INFECTED_FILE` must not echo scanner threat names or file
  internals; `SCAN_FAILED` must not expose ClamAV host/port/error strings
  (worker `SCANNER_UNAVAILABLE` message stays internal). Basis: SECURITY-SCAN plan PII rules;
  DECISION-02 sanitized nudges.
- **`details` is a leakage surface.** Restrict per code: `VALIDATION_ERROR` → field names only
  (no submitted values); `RATE_LIMITED` → retry seconds; state codes → no DB columns like
  `storage_path`, `security_scan_result`, `error_details`. Basis: AGENTS.md :47; Guide §8.7
  (internal paths never exposed).
- **No ownership leak** — 404 policy per 4.5.
- **trace_id is safe to echo** (UUID correlation, no PII) and MUST be propagated into the
  outbox payload (`security-scan-requested` payload supports `trace_id`; worker forwards it).
  Note for implementers: `outbox_events` has no `trace_id` COLUMN — propagation is via
  `payload.trace_id`; `correlation_id`/`causation_id` columns are available for chaining.
- **request_id** is HTTP-scoped, generated by NestJS, must appear in logs alongside any error;
  it is not persisted in the baseline — acceptable, but the log correlation requirement should
  be stated in the contract.
- **Error responses must never include** resume text, normalized profile data, signed URLs,
  tokens or guest session tokens. Guest session token transport: header/field naming and
  one-time semantics are still part of the open guest-surface decision (REMAINING-DECISIONS §5)
  — do not freeze token handling in this contract.

## 9. Cross-service compatibility review

| Boundary | Compatibility |
|---|---|
| Next.js UI | Envelope is client-friendly (machine `code` for branching, `stage` for polling UI). SSE nudges remain sanitized per DECISION-02; UI recovery = status endpoint. No conflict |
| NestJS API | Envelope applies at this public boundary only. Implementation note (not a contract change): NestJS default exception shape differs, so a global exception filter will be required — catalog/implementation work |
| Supabase DB/RLS | Codes map 1:1 to real enum states/columns after fixes 4.2-4.4. All reads/writes for these tables go through trusted SystemClient (DECISION-01; 17_rls.sql) — the error contract must not imply any direct client read path |
| Outbox Dispatcher | Unaffected — payload opacity preserved; only `trace_id` propagation requirement touches payload content, which the contracts already permit |
| FastAPI worker | No change required to the worker's internal error shape (`{"code","message"}` details). Vocabulary is already aligned (`SCAN_PENDING` identical). Worker errors are internal (OIDC-protected) and never surfaced verbatim to users |

## 10. Recommended final contract

Success envelope (unchanged from proposal — approved):

```json
{ "success": true, "data": {}, "request_id": "uuid", "trace_id": "uuid" }
```

Error envelope (unchanged shape; `details` typed per code):

```json
{ "success": false, "error": { "code": "PARSING_PENDING", "message": "Resume parsing is still in progress", "details": {} }, "request_id": "uuid", "trace_id": "uuid" }
```

Final code list (15 → 16):

```text
VALIDATION_ERROR        400   (+ details.code: FILE_TOO_LARGE / UNSUPPORTED_FILE_TYPE / CHECKSUM_MISMATCH)
UNAUTHORIZED            401
FORBIDDEN               403   (action denial on disclosed resource only)
NOT_FOUND               404   (unknown OR not-owned OR soft-deleted)
RESUME_LIMIT_REACHED    409   (PD-002 10-library limit)
SCAN_PENDING            409 on confirm / info state in status API
SCAN_FAILED             422 (terminal) or status field with retryable=true
INFECTED_FILE           422   (covers quarantined via details.scan_state, or separate QUARANTINED_FILE)
PARSING_PENDING         409 on confirm / info state in status API
PARSING_FAILED          422   (job failed; partial is NOT failed — returns data with partial=true)
STALE_REVISION          409   (frozen: Guide §6)
IDEMPOTENCY_CONFLICT    409   (same key, different payload only; same payload replays original success)
GUEST_SESSION_INVALID   403   (expired/revoked/consumed/wrong-job session)  [NEW]
DEPENDENCY_UNAVAILABLE  503   (storage/DB at NestJS boundary)               [NEW]
RATE_LIMITED            429   (+ retry_after_seconds)
INTERNAL_ERROR          500   (generic message; detail only in logs)
```

Removed/redefined vs proposal: `DUPLICATE_RESUME` removed (duplicate = success + `reused:true`);
example code `RESUME_NOT_READY` replaced by the concrete state codes.

Status/upload success codes: 201 new upload, 200 duplicate reuse, 200 reads/confirm (202
optional for upload ack — pick one and document).

## 11. Blocking decisions, if any

1. **Scan-ordering wording conflict (4.6)** — the frozen multipart flow must be corrected to the
   async-scan architecture (or a NEW owner decision must explicitly override the Stage-1
   non-negotiable). Blocks correct semantics for `INFECTED_FILE`/`SCAN_*` codes.
2. **Idempotency semantics (REMAINING-DECISIONS §8)** — key scope/retention/replay still open;
   `IDEMPOTENCY_CONFLICT` cannot be finalized until closed. No API-level idempotency store
   exists in baseline SQL; it must be designed, not invented.
3. **Guest surface (REMAINING-DECISIONS §5)** — `GUEST_SESSION_INVALID` behavior depends on the
   shared-vs-dedicated paths decision.
4. **Parsed-data allowlist (REMAINING-DECISIONS §11.4)** — parsed-data response fields cannot be
   frozen until the safe-field allowlist exists.
5. **Numeric rate limits** — product-owned; code/mapping can freeze without numbers.
6. Non-blocking but required before freeze: 403-vs-404 policy statement, quarantined/partial
   mapping statement, `RESUME_LIMIT_REACHED` HTTP code choice.

## 12. Tests / acceptance criteria

(Proposed criteria — none were executed; no test results are claimed.)

1. Envelope: every 4xx/5xx response of all four APIs matches the error envelope schema with a
   code from the frozen list; no NestJS default error shape escapes.
2. Traceability: the `trace_id` returned by upload equals `payload.trace_id` of the resulting
   `security.scan.requested` outbox row.
3. Reuse: uploading the same checksum twice for the same owner returns success with
   `reused: true`, one `uploaded_documents` row, one outbox event total.
4. Ownership: user B requesting user A's document gets 404 `NOT_FOUND`; response bodies for
   403/404 are indistinguishable in shape and leak no ownership.
5. States: infected document → status API never reports a parsed-ready stage; confirm returns
   422 `INFECTED_FILE`; quarantined maps identically.
6. Partial: a `partial` job returns parsed-data with `partial: true`, never `PARSING_FAILED`.
7. Concurrency: confirm with stale `expected_profile_revision` returns 409 `STALE_REVISION` and
   zero canonical changes; `profile_change_history` gains exactly one row per successful confirm.
8. Idempotency: same key + same payload → identical success response, no duplicate rows/events;
   same key + different payload → 409 `IDEMPOTENCY_CONFLICT`.
9. Guest: expired/revoked/consumed session → `GUEST_SESSION_INVALID`; limits (3 files /
   31,457,280 bytes) enforced.
10. PII scan: no response body or log line at error paths contains resume text, storage paths,
    signed URLs, tokens, scanner internals or stack traces (assert by pattern audit).
11. Limits: 11th library resume upload → `RESUME_LIMIT_REACHED` with the mapped status code and
    no storage object or row created.
12. Rate limit: exceeding the approved window returns 429 with `retry_after_seconds`.

## 13. Final status

**APPROVED WITH CHANGES**

Freeze is possible after: (a) fixes 4.1-4.10 applied to the proposed contract, (b) the
scan-ordering wording conflict (11.1) resolved, and (c) dependent open decisions (idempotency,
guest surface, parsed-data allowlist) closed or explicitly carried into the API catalog as
tracked gaps. No code, SQL or contract changes were made by this review.
