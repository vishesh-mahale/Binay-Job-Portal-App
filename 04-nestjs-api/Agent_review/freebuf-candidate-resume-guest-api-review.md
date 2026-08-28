# Freebuf — Candidate/Resume/Guest API Independent Code Audit

**Date:** August 27, 2026
**Audit scope:** 04-nestjs-api/04-nestjs-api-app/ — Phase 09-C implementation
**Auditor:** Freebuf (independent senior NestJS/PostgreSQL/security reviewer)

---

## 1. Executive Summary

The Phase 09-C implementation covers **candidate profile management**, **registered resume upload/validation/confirmation**, **parsed-data response filtering**, **guest session creation/upload/apply/claim**, and **security scan event emission**. All three verification commands pass:

```
✅ npm run build        (exit code 0)
✅ npm run lint:types   (exit code 0)
✅ npm test -- --runInBand  (16 suites, 35 tests, ALL PASS)
```

**Architecture is sound.** The core patterns — UserContextClient for approved RLS reads, SystemClient for explicit-ownership writes, transaction + history + outbox atomicity, validation-before-transaction, storage compensation on DB failure, token hashing, and PII/secret exclusion from responses — are correctly implemented.

**However, 2 contract mismatches and 4 medium-severity issues exist** that must be resolved before production. No BLOCKER-level findings exist.

**Overall verdict: PASS WITH REQUIRED FIXES**

---

## 2. Files Inspected

### Source files (15)
| File | Lines | Purpose |
|------|-------|---------|
| `src/main.ts` | 14 | Bootstrap, ValidationPipe, shutdown hooks |
| `src/app.module.ts` | 22 | Module wiring |
| `src/config.ts` | 22 | Zod fail-fast config |
| `src/auth.ts` | 22 | JWT HS256 verification, AuthGuard |
| `src/clients.ts` | 27 | UserContextClient/SystemClient separation |
| `src/database.ts` | 24 | pg Pool, BEGIN/COMMIT/ROLLBACK |
| `src/errors.ts` | 21 | Decision-06 error envelope |
| `src/health.ts` | 12 | Liveness/readiness |
| `src/observability.ts` | 15 | PII/secret redaction |
| `src/request-context.ts` | 10 | Correlation ID |
| `src/storage.ts` | 31 | Supabase Storage adapter |
| `src/resume-upload-validation.ts` | 30 | File validation + checksum |
| `src/candidate.ts` | 163 | Profile GET/PATCH, fact archive, status, parsed-data |
| `src/resume.ts` | 156 | Upload, confirm, fact insertion |
| `src/guest.ts` | 197 | Session, guest upload, status, parsed-data, apply, claim |

### Test files (16)
| File | Tests | Coverage |
|------|-------|----------|
| `candidate.spec.ts` | 7 | Profile read, NOT_FOUND, STALE_REVISION, empty mutation, unknown fact, parsed-data allowlist, non-clean scan |
| `resume.spec.ts` | 2 | Confirm input validation, STALE_REVISION |
| `resume-upload-validation.spec.ts` | 3 | PDF accept, MIME mismatch, path traversal/oversize |
| `errors.spec.ts` | — | Error envelope |
| `clients.spec.ts` | 3 | Class separation, non-SELECT rejection, malformed JWT |
| `auth.spec.ts` | 2 | Valid/expired token verification |
| `config.spec.ts` | — | Config validation |
| `database.spec.ts` | — | Transaction, pool |
| `health.spec.ts` | — | Readiness |
| `failure.spec.ts` | 2 | DB outage propagation, pool shutdown |
| `observability.spec.ts` | — | Redaction |
| `request-context.spec.ts` | — | Correlation ID |
| `membership.spec.ts` | — | Membership |
| `organization.spec.ts` | — | Organization |
| `companies.spec.ts` | — | Companies |
| `ownership.spec.ts` | — | Ownership transfer |

### SQL baselines (6)
| File | Relevant tables/functions |
|------|--------------------------|
| `02_enums.sql` | All enum types |
| `06_documents.sql` | `guest_upload_sessions`, `uploaded_documents` |
| `07_resume_processing.sql` | `resume_parsing_jobs`, `resume_parsed_data` |
| `08_candidates.sql` | `candidate_profiles`, `candidate_profile_documents`, child-fact tables, `profile_change_history` |
| `09_applications.sql` | `job_applications`, `application_documents`, `application_profile_snapshots`, `guest_candidate_claims` |
| `15_infrastructure.sql` | `outbox_events` |

### Contracts (8)
| File | Status |
|------|--------|
| `security-scan-requested.v1.json` | ✅ Verified |
| `candidate-profile-changed.v1.json` | ⚠️ Mismatch (finding C-2) |
| `application-submitted.v1.json` | ⚠️ Mismatch (finding C-1) |
| `resume-parse-requested.v1.json` | ✅ Not yet produced by NestJS |
| `candidate-resume-parsed.v1.json` | ✅ FastAPI consumer |
| `security-scan-task.v1.json` | ✅ Dispatcher task |
| `resume-parse-task.v1.json` | ✅ Dispatcher task |
| `AGGREGATE-ID-SEMANTICS.md` | ✅ Verified |

### Design documents (6)
- `PHASE-09-C-API-CONTRACT-AMENDMENT.md`
- `PHASE-08-IMPLEMENTATION-PLAN.md`
- `AGENTS.md`

---

## 3. Commands/Test Results

| Command | Exit Code | Output |
|---------|-----------|--------|
| `npm run build` | 0 | Clean, zero errors |
| `npm run lint:types` | 0 | Clean, zero TypeScript errors |
| `npm test -- --runInBand` | 0 | 16 suites, 35 tests, ALL PASS |

**No tests were fabricated. All results were verified via terminal execution.**

---

## 4. Findings Table

### Contract/Schema Mismatches

| ID | Severity | Area | Finding | Source | Impact | Fix | Decision Required |
|----|----------|------|---------|--------|--------|-----|-------------------|
| **C-1** | **HIGH** | Guest apply → `application.submitted` event | Payload **omits required fields** `snapshot_id` and `occurred_at`. Contract requires `payload.snapshot_id` (string, uuid) and `payload.occurred_at` (date-time). Code only emits `application_id`, `job_id`, `company_id`, `is_guest`, `submitted_at`. | `guest.ts` L170-176, `application-submitted.v1.json` L40-60 | Dispatcher → FastAPI consumer will receive incomplete event. `snapshot_id` is needed for downstream correlation. `occurred_at` is needed for event ordering. | Add `snapshot_id` (from the INSERT result above) and `occurred_at` (use `new Date().toISOString()`) to the payload JSON. | No — fix is mechanical |
| **C-2** | **MEDIUM** | `candidate.profile.changed` event | Contract requires top-level `trace_id` field. Code only puts `trace_id` inside `payload`. The outbox row does not have a `trace_id` column; it uses `correlation_id` and `causation_id`. But the **contract's required field** `trace_id` is absent from the event structure written to `payload.trace_id` — wait, it IS in the payload. The issue is the **outer envelope**: the contract defines `trace_id` as a top-level required property, but the outbox row writes it only inside `payload`. | `candidate.ts` L91, L153, `resume.ts` L115, `candidate-profile-changed.v1.json` L8 | If consumers read `trace_id` from the top-level event (not payload), they will get `undefined`. The contract and implementation disagree on where `trace_id` lives. | Either: (a) add `trace_id` to the outbox row metadata alongside `correlation_id`/`causation_id`, or (b) update the contract to remove the top-level `trace_id` and keep it only in `payload`. Option (b) is simpler. | YES — contract change needed |

### Data Integrity Findings

| ID | Severity | Area | Finding | Source | Impact | Fix |
|----|----------|------|---------|--------|--------|-----|
| **D-1** | **MEDIUM** | Confirm idempotency race condition | The idempotency check (`existing` query) joins on `profile_change_history WHERE entity_type = 'resume_confirmation' AND operation = 'confirm'`. This query runs **before** the history row is inserted. Two concurrent `confirm` calls for the same document will both pass the idempotency check, both insert child facts, both bump revision, and both emit an outbox event. The `profile_change_history` row prevents a **third** call, but not the second concurrent one. | `resume.ts` L96-103 | Duplicate child facts, extra revision bump, duplicate `candidate.profile.changed` event. | Add a `SELECT ... FOR UPDATE` on `candidate_profile_documents` before the idempotency check, or use a `SELECT ... FOR UPDATE` on a sentinel row. The current `FOR UPDATE` is on `uploaded_documents`, which doesn't guard the confirm-specific path. | No — can be fixed in code |
| **D-2** | **LOW** | Resume confirm — `processing_status` not checked | The confirm endpoint checks `security_scan_status = 'clean'` but does **not** check `processing_status`. A document with `processing_status = 'queued'` (parsing not started) would be rejected by the "parsed data not found" check, which is correct. But the code could be more explicit. | `resume.ts` L99-102 | Minor defense-in-depth gap. Current behavior is correct (parsed-data JOIN enforces it). | Add explicit comment or check: `if (processing === 'uploaded' \|\| processing === 'queued') throw ConflictException('PARSING_NOT_READY')`. | No |

### Security Findings

| ID | Severity | Area | Finding | Source | Impact | Fix |
|----|----------|------|---------|--------|--------|-----|
| **S-1** | **PASS** | Parsed-data allowlist | `getParsedData` correctly filters `normalized_output` to 8 allowed keys: `contact_info`, `professional_title`, `summary`, `skills`, `experiences`, `educations`, `certifications`, `languages`. `extracted_text`, `raw_ai_output`, `artifacts`, `internal error details`, `storage_bucket`, `storage_path`, `tokens`, `credentials` are all excluded. | `candidate.ts` L82-84, test at `candidate.spec.ts` L40-52 | PII and secrets correctly protected. | None |
| **S-2** | **PASS** | Token hashing | Guest tokens are hashed with SHA-256 before storage/lookup. Raw tokens are returned to the client only at creation time. | `guest.ts` L28-30, L44 | Token leakage prevented. | None |
| **S-3** | **PASS** | Storage credentials | `SupabaseStorageAdapter` uses `SUPABASE_SERVICE_ROLE_KEY` internally. Controllers never receive it. Headers are constructed inside the adapter. | `storage.ts` L14-16 | No credential exposure to controllers/browser. | None |
| **S-4** | **PASS** | Private storage | Registered uploads use `candidates/{candidateId}/resumes/{documentId}.{ext}`. Guest uploads use `guest/{jobId}/sessions/{sessionId}/{documentId}.{ext}`. Storage paths do not contain PII. | `resume.ts` L51, `guest.ts` L56 | Storage paths are non-guessable. | None |
| **S-5** | **PASS** | Guest session ownership isolation | Guest upload lookup joins on `token_hash` AND `session_id`. Guest status lookup joins on `token_hash` AND `document_id → guest_upload_sessions`. Registered user reads filter on `uploaded_by_user_id = $2`. | `guest.ts` L44, L79, `candidate.ts` L45, L66, L80 | Guest and registered users cannot cross-access documents. | None |
| **S-6** | **PASS** | Guest session expiry/revocation | Session lookup includes `status = 'active' AND expires_at > NOW() AND revoked_at IS NULL`. Apply validates session ownership via `consume_guest_upload_session()` SQL function. | `guest.ts` L44, L122 | Expired/revoked sessions cannot be used. | None |
| **S-7** | **PASS** | Storage compensation | Both `resume.ts` L58-60 and `guest.ts` L66-68 wrap the storage cleanup in try/catch that does NOT mask the original DB error. | Both files | DB errors propagate correctly; storage cleanup is best-effort. | None |
| **S-8** | **PASS** | UserContextClient SELECT-only | `UserContextClient.queryAsUser()` rejects non-SELECT SQL. JWT claims are decoded and passed via `set_config('request.jwt.claims', ...)`. | `clients.ts` L8-13 | Untrusted code cannot perform writes through UserContextClient. | None |

### Missing or Incomplete Test Coverage

| ID | Severity | Area | Finding | Impact |
|----|----------|------|---------|--------|
| **T-1** | **MEDIUM** | Guest session creation | No unit test for `GuestSessionService.create()` | Cannot verify token generation, job existence check, TTL behavior |
| **T-2** | **MEDIUM** | Guest resume upload | No unit test for `GuestSessionService.uploadResume()` | Cannot verify limit enforcement, storage write, outbox emission |
| **T-3** | **MEDIUM** | Guest apply | No unit test for `GuestSessionService.apply()` | Cannot verify session consumption, snapshot creation, event emission |
| **T-4** | **MEDIUM** | Guest claim | No unit test for `GuestSessionService.claim()` | Cannot verify token validation, email match, status transitions |
| **T-5** | **MEDIUM** | Resume upload registered | No unit test for `ResumeService.upload()` | Cannot verify checksum reuse, first-active logic, storage + transaction atomicity |
| **T-6** | **MEDIUM** | Confirm idempotency (second call) | Existing test only checks STALE_REVISION. No test for repeated confirm returning `already_confirmed: true` | Cannot verify idempotency behavior |
| **T-7** | **MEDIUM** | Candidate fact archive | No unit test for `CandidateService.archiveFact()` | Cannot verify revision bump, history row, outbox emission |
| **T-8** | **LOW** | Security scan event structure | No test validates emitted event payload against `security-scan-requested.v1.json` contract schema | Contract drift possible |
| **T-9** | **LOW** | Application submitted event structure | No test validates emitted event payload against `application-submitted.v1.json` contract schema | Contract drift possible |

---

## 5. Detailed Verification: 10-Point Checklist

### 1. Repeated/concurrent resume confirmation

**Status: PARTIAL PASS**

- The idempotency check uses `profile_change_history WHERE entity_type = 'resume_confirmation' AND operation = 'confirm'` — this correctly detects a **sequentially repeated** confirmation.
- However, **two concurrent confirm calls** can both pass the check before either inserts the history row. The `FOR UPDATE` lock is on `uploaded_documents`, not on `candidate_profile_documents` or `profile_change_history`.
- **Impact:** Duplicate child facts, extra revision bump, duplicate outbox event on concurrent calls.
- **Fix:** Add `SELECT ... FOR UPDATE` on `candidate_profile_documents` before the idempotency check.

### 2. Changed confirmation payload behavior

**Status: PASS**

- The code does NOT invent any generic idempotency table or column. It uses `profile_change_history` (existing SQL table) for domain-level duplicate detection.
- The `expected_profile_revision` check provides optimistic concurrency control.
- This is honest and consistent with Phase 08 plan: "existing domain-specific keys remain authoritative; a generic client-command idempotency store is not present."

### 3. Candidate child facts — server-controlled provenance

**Status: PASS**

- `primary_source_type` is hardcoded to `'candidate_confirmed'` for all confirmed facts (which maps to the `profile_fact_source` enum value `candidate_confirmed`).
- The `candidate_confirmed_at` is set to `NOW()` by the server.
- No client-controlled provenance fields are accepted.
- Evidence tables (`candidate_skill_evidence`, etc.) are not written during confirmation — only canonical fact tables are.

### 4. Uploaded document ownership cannot cross

**Status: PASS**

- Registered reads: `WHERE d.uploaded_by_user_id = $2` (JWT sub).
- Guest reads: `WHERE s.token_hash = $2` (token hash from header).
- Upload: `uploaded_by_user_id = request.user?.sub` (registered) or `guest_upload_session_id = sessionId` (guest).
- `uploaded_documents` CHECK constraint enforces XOR: exactly one of `uploaded_by_user_id` or `guest_upload_session_id` is non-null.

### 5. Guest session reuse after consume/expiry/revocation

**Status: PASS**

- Session lookup always includes `status = 'active' AND expires_at > NOW() AND revoked_at IS NULL`.
- `consume_guest_upload_session()` SQL function transitions to `consumed` status atomically.
- After consumption, the session status check fails and returns `GUEST_SESSION_INVALID`.

### 6. Raw resume text, AI output, storage paths, secrets never reach API responses

**Status: PASS**

- `getParsedData()` filters `normalized_output` to 8 allowed keys.
- `getResumeStatus()` returns only: `document_id`, `security_scan_status`, `processing_status`, `stage`, `retryable`, `parsing_job_id`, and timestamps. No storage_bucket, storage_path, tokens, or raw content.
- `getOwnProfile()` strips `deleted_at`, `user_id`, and sensitive evidence fields from child facts.
- `SafeLogger` redacts tokens, passwords, secrets from log output.

### 7. `security.scan.requested` and `application.submitted` payloads match contracts

**Status: PARTIAL PASS**

**security.scan.requested:**
- `schema_version: 1` ✅
- `event_id` ✅
- `aggregate_type: 'uploaded_document'` ✅
- `aggregate_id: documentId` ✅
- `event_type: 'security.scan.requested'` ✅
- `payload.document_id` ✅
- `payload.uploaded_by_user_id` ✅ (or null for guest)
- `payload.guest_upload_session_id` ✅ (or null for registered)
- `payload.trace_id` ✅
- **Extra fields in payload:** `aggregate_type`, `aggregate_type`, `event_type`, `occurred_at` — these duplicate envelope fields. The contract has `additionalProperties: false`. Whether the dispatcher validates the payload against the contract schema is unclear. If it does, these extras would be rejected.

**application.submitted:**
- `schema_version: 1` ✅
- `event_id` ✅
- `aggregate_type: 'job_application'` ✅
- `aggregate_id: applicationId` ✅
- `event_type: 'application.submitted'` ✅
- `payload.application_id` ✅
- `payload.job_id` ✅
- `payload.company_id` ✅
- `payload.is_guest: true` ✅
- `payload.submitted_at` ✅
- ❌ `payload.snapshot_id` — **MISSING** (required by contract)
- ❌ `payload.occurred_at` — **MISSING** (required by contract)

### 8. Database transactions do not contain external HTTP/storage calls

**Status: PASS**

- `resume.ts`: Storage upload (`this.storage.put()`) happens **before** the transaction. If the transaction fails, cleanup calls `this.storage.remove()` in a try/catch that does NOT mask the original error.
- `guest.ts`: Same pattern — storage upload before transaction, compensation on failure.
- No Cloud Tasks, FastAPI, email, WebSocket, or external provider calls inside any transaction.

### 9. Storage cleanup after DB failure is best-effort

**Status: PASS**

- Both `resume.ts` L58-60 and `guest.ts` L66-68: `try { await this.storage.remove(...) } catch { /* cleanup is best-effort and must not mask DB error */ }`.
- The original DB error is always re-thrown.

### 10. Implementation completeness — honest reporting

**Status: PARTIAL PASS**

The following areas are implemented and verified:
- ✅ NestJS bootstrap, ValidationPipe, fail-fast config
- ✅ JWT verification, AuthGuard, timing-safe comparison
- ✅ UserContextClient/SystemClient separation
- ✅ Transaction BEGIN/COMMIT/ROLLBACK
- ✅ Error envelope (Decision-06)
- ✅ PII/secret redaction
- ✅ Health liveness/readiness
- ✅ Request correlation ID
- ✅ Graceful shutdown
- ✅ Candidate profile GET/PATCH
- ✅ Candidate fact archive (soft-delete)
- ✅ Resume upload with validation, checksum, private storage
- ✅ Resume status endpoint
- ✅ Parsed-data response allowlist
- ✅ Resume confirmation with revision check
- ✅ Canonical child-fact insertion
- ✅ Revision bump + history + outbox atomic
- ✅ Guest session creation, upload, status, parsed-data
- ✅ Guest application submit
- ✅ Guest claim flow
- ✅ Security scan event emission

The following are **NOT implemented** (honestly reported):
- ❌ Registered application submit (candidate apply) — only guest apply is implemented
- ❌ Application status transitions
- ❌ Candidate projection/embedding trigger
- ❌ `resume.parse.requested` event emission (triggered by security-scan-clean transition, not by NestJS)
- ❌ SSE/live-status endpoint
- ❌ File size limit configuration validation (env var is optional; if missing, upload silently fails)

---

## 6. Security Matrix

| Operation | Authorization Method | Client Boundary | RLS Interaction |
|-----------|---------------------|-----------------|-----------------|
| GET /candidates/me | JWT `sub` = `cp.user_id` | UserContextClient | RLS `auth.uid()` applies |
| PATCH /candidates/me | JWT `sub` + expected_revision | SystemClient | Explicit ownership check in SQL |
| DELETE /candidates/me/facts/:type/:id | JWT `sub` + expected_revision | SystemClient | Explicit ownership check in SQL |
| POST /resumes/upload | JWT `sub` = `uploaded_by_user_id` | SystemClient | Explicit ownership in CHECK constraint |
| GET /resumes/:id/status | JWT `sub` = `uploaded_by_user_id` | SystemClient | Explicit `WHERE` filter |
| GET /resumes/:id/parsed-data | JWT `sub` = `uploaded_by_user_id` + `clean` scan | SystemClient | Explicit `WHERE` filter |
| POST /resumes/:id/confirm | JWT `sub` + scan clean + parsed data + revision | SystemClient | Explicit ownership in JOIN |
| POST /guest-sessions | No auth required | SystemClient | N/A — no user context |
| POST /guest-sessions/:id/resumes | Guest token hash | SystemClient | Token hash lookup |
| GET /guest-sessions/:id/status | Guest token hash | SystemClient | Token hash + session join |
| GET /guest-sessions/:id/parsed-data | Guest token hash + `clean` scan | SystemClient | Token hash + session join |
| POST /guest-sessions/apply | Guest token hash | SystemClient | Session lock + consume |
| POST /guest-sessions/claims | JWT + claim token hash | SystemClient | Email match + status check |

---

## 7. Outbox Event Summary

| Event | Emitted By | Contract Match | Issues |
|-------|-----------|----------------|--------|
| `security.scan.requested` | `resume.ts` (registered), `guest.ts` (guest) | ⚠️ Extra fields in payload | Duplicate `aggregate_type`, `event_type`, `occurred_at` in payload |
| `candidate.profile.changed` | `candidate.ts` (profile update, fact archive), `resume.ts` (confirm) | ⚠️ Top-level `trace_id` missing | Contract requires top-level `trace_id`; only in payload |
| `application.submitted` | `guest.ts` (guest apply) | ❌ Missing required fields | `snapshot_id` and `occurred_at` missing from payload |

---

## 8. Production-Readiness Verdict

| Category | Status |
|----------|--------|
| **Overall** | ⚠️ **PASS WITH REQUIRED FIXES** |
| **Build/Lint/Tests** | ✅ All pass (16 suites, 35 tests) |
| **Architecture** | ✅ Sound — foundation, clients, transactions, guards correct |
| **Security** | ✅ PII/secret/token handling correct |
| **Data Integrity** | ⚠️ Confirm idempotency race condition (D-1) |
| **Contract Compliance** | ⚠️ 2 contract mismatches (C-1, C-2) |
| **Test Coverage** | ⚠️ 8 areas with no unit tests (T-1 through T-8) |
| **BLOCKERs** | ✅ Zero |
| **HIGH** | 1 (C-1: application.submitted missing fields) |
| **MEDIUM** | 4 (C-2, D-1, T-1..T-7) |
| **LOW** | 3 (D-2, T-8, T-9) |

---

## 9. Required Corrections Before Production

### HIGH Priority

1. **C-1: Fix `application.submitted` event payload** — Add `snapshot_id` (from the snapshot INSERT result) and `occurred_at` (current timestamp) to the payload JSON in `guest.ts` `apply()` method.

### MEDIUM Priority

2. **C-2: Resolve `candidate.profile.changed` contract vs implementation** — Either: (a) update the contract to remove top-level `trace_id` (keep only in payload), or (b) store `trace_id` in the outbox row metadata. Recommend option (a) for simplicity.

3. **D-1: Fix confirm idempotency race** — Add `SELECT ... FOR UPDATE` on `candidate_profile_documents` for the exact `(candidate_id, document_id, document_role)` before the idempotency check.

4. **T-1 through T-7: Add unit tests for guest flow, resume upload, confirm idempotency, and fact archive** — At minimum, mock-based unit tests for `GuestSessionService` and `ResumeService.upload()`.

### LOW Priority

5. **D-2: Add explicit processing_status check in confirm** — Before the `security_scan_status = 'clean'` check, add: `if (processing_status in ('uploaded', 'queued')) throw CONFLICT`.

6. **T-8, T-9: Add contract validation tests** — Emit events in tests and validate against JSON Schema files.

7. **Security scan payload extras** — Remove `aggregate_type`, `event_type`, `occurred_at` from the payload object (they belong in the envelope, not the payload). Keep only `schema_version`, `event_id`, `aggregate_id`, `trace_id` as envelope fields.

---

## 10. What Should NOT Be Changed

- The `UserContextClient` / `SystemClient` separation pattern — it is correct per Decision-01.
- The `validateResumeFile()` function — it is thorough (extension, MIME, magic bytes, checksum, path traversal).
- The storage compensation pattern — it is correct and does not mask DB errors.
- The `SecurityScanRequestedEvent` envelope structure (top-level fields) — it matches the contract's required fields.
- The candidate profile GET query stripping `deleted_at`, `user_id`, and sensitive evidence fields.
- The `SafeLogger` redaction pattern.
- The `requestContext` middleware correlation ID behavior.
- The Zod fail-fast configuration validation.
- The `AuthGuard` with timing-safe HMAC comparison and expiry check.

---

*Report generated independently from previous agent reviews. All findings verified against actual source code, SQL baselines, and contract files.*
