# Candidate/Resume/Guest API — Independent Code Audit

**Auditor:** opencode (Senior NestJS, PostgreSQL & Distributed-Systems Reviewer)
**Date:** 2026-08-27
**Report:** `04-nestjs-api/Agent_review/opencode-candidate-resume-guest-api-review.md`

---

## 1. Executive Summary

### Verdict: **APPROVED WITH FIXES — 0 BLOCKERs, 4 HIGH, 7 MEDIUM, 5 LOW findings**

The implementation covers candidate profile read/update/archive, resume upload/status/parsed-data/confirm, and guest session/resume/apply/claim flows. Tests pass (35/35), build succeeds. No blockers found — all initial BLOCKER classifications were retracted upon careful code review:

- **BLOCKER-01 RETRACTED:** `user_id` IS excluded from GET `/api/v1/candidates/me` via `to_jsonb(cp) - ARRAY['deleted_at','user_id']` at `candidate.ts:43`.
- **BLOCKER-02 RETRACTED:** `consume_guest_upload_session()` at `guest.ts:104` works because `SystemClient` connects via `service_role` which has EXECUTE permission (`17_rls.sql:236`). The implementation report's claim about "guest upload remaining the next slice" is a documentation inaccuracy, not a code defect.

**Overall assessment:** The code demonstrates solid security-first thinking (checksum reuse, magic-byte validation, append-only triggers, RLS defense-in-depth, atomic transactions). 4 HIGH findings must be resolved before production.

---

## 2. Files Inspected

| File | Lines | Purpose |
|---|---|---|
| `src/app.module.ts` | 19 | Module wiring, dependency injection |
| `src/main.ts` | 11 | Bootstrap, ValidationPipe, error filter, logger |
| `src/auth.ts` | 9 | JWT HMAC-SHA256 verification, AuthGuard |
| `src/clients.ts` | 23 | UserContextClient (SELECT-only + RLS), SystemClient (trusted) |
| `src/candidate.ts` | 226 | Profile GET/PATCH, fact archive, resume status/parsed-data |
| `src/resume.ts` | 129 | Upload, confirm, child-fact insertion |
| `src/guest.ts` | 149 | Guest session, resume upload, apply, claim |
| `src/storage.ts` | 35 | StorageAdapter abstract + SupabaseStorageAdapter |
| `src/resume-upload-validation.ts` | 29 | File validation: MIME, extension, magic bytes, checksum |
| `src/errors.ts` | 15 | ApiExceptionFilter → approved error envelope |
| `src/database.ts` | 15 | pg Pool, transaction helper |
| `src/config.ts` | 17 | Zod env schema |
| `src/observability.ts` | 13 | SafeLogger with credential redaction |
| `src/request-context.ts` | 4 | x-request-id middleware |
| `src/identity-company.ts` | 66 | Auth/me, sessions, revoke |
| `src/*.spec.ts` | 35 tests | Unit tests across all modules |

**Authoritative sources read:**
- `AGENTS.md` (54 lines)
- `PHASE-05-FINAL-REQUIREMENTS.md` (266 lines)
- `PHASE-06-API-CATALOG.md` (888 lines)
- `PHASE-07-ARCHITECTURE.md` (245 lines)
- `06_documents.sql` (146 lines)
- `08_candidates.sql` (662 lines)
- `09_applications.sql` (150 lines)
- `15_infrastructure.sql` (100 lines)
- `17_rls.sql` (250 lines)
- `contracts/events/security-scan-requested.v1.json` (64 lines)
- `contracts/events/candidate-profile-changed.v1.json` (16 lines)
- `contracts/events/application-submitted.v1.json` (87 lines)

---

## 3. Commands/Tests Executed

```text
npm test -- --runInBand   → PASS (16 suites, 35 tests, 18.88s)
npm run build             → PASS (tsc -p tsconfig.build.json, 0 errors)
```

---

## 4. Findings Table

| ID | Severity | File:Line | Finding | Source |
|---|---|---|---|---|
| **HIGH-01** | HIGH | `resume.ts:90-91` | Confirm idempotency check joins `profile_change_history` on `entity_type = 'resume_confirmation'` — fragile coupling to naming convention | Phase-06:126 |
| **HIGH-02** | HIGH | `resume.ts:92` | `ConflictException('SCAN_NOT_READY')` — not in DECISION-06 error vocabulary | DECISION-06 |
| **HIGH-03** | HIGH | `errors.ts:9` | All 4xx (except 401/403/404) mapped to `VALIDATION_ERROR` — `STALE_REVISION`, `SCAN_NOT_READY` lose identity | DECISION-06 |
| **HIGH-04** | HIGH | `resume.ts:15-42` | `insertConfirmedFacts` uses `any` typed input — no DTO validation on child facts | Phase-07:80 |
| **MEDIUM-01** | MEDIUM | `guest.ts:33` | Guest session query missing `consumed_at IS NULL` check | 06_documents.sql:62 |
| **MEDIUM-02** | MEDIUM | `candidate.ts:82-89` | Status derivation: `scan === 'clean'` case implicit fallthrough | Phase-05:174 |
| **MEDIUM-03** | MEDIUM | `candidate.ts:153` | SQL column name interpolation via whitelist map — fragile pattern | Phase-07:113 |
| **MEDIUM-04** | MEDIUM | `candidate.ts:182` | `archiveFact` uses `public.${table}` interpolation — same fragile pattern | Phase-07:113 |
| **MEDIUM-05** | MEDIUM | `candidate.ts:159,187` | Inconsistent `entity_type` values: `'candidate_profile'` vs `factType` | 08_candidates.sql:476 |
| **MEDIUM-06** | MEDIUM | `resume.ts:106` | Confirm omits `before_data` in `profile_change_history` — incomplete audit trail | Phase-05:100 |
| **MEDIUM-07** | MEDIUM | `PHASE-09-C-REPORT.md:45` | Implementation report claims "guest upload remain the next slice" but guest upload IS implemented | Implementation report |
| **LOW-01** | LOW | `auth.ts:7` | JWT missing `iss`/`aud` claim validation | Phase-05:76 |
| **LOW-02** | LOW | `candidate.ts:9` | `UpdateCandidateProfileDto` without `class-validator` decorators | Phase-07:80 |
| **LOW-03** | LOW | `resume-upload-validation.ts:24` | PDF magic byte check: no `%%EOF` verification | Phase-05:87 |
| **LOW-04** | LOW | `guest.ts:17` | Guest token returned in plaintext — correct but should be audit-logged | Phase-06:56 |
| **LOW-05** | LOW | `resume.ts:62` | Storage path contains candidate UUID — not secret but reveals identity | Phase-06:30 |

---

## 5. Detailed Findings

### HIGH-01 — Confirm Idempotency Check Fragility

**File:** `src/resume.ts:90-91`
**Code:**
```sql
SELECT cpd.document_id FROM public.candidate_profile_documents cpd
JOIN public.profile_change_history h ON h.candidate_id = cpd.candidate_id
  AND h.entity_id = cpd.document_id
  AND h.entity_type = 'resume_confirmation'
  AND h.operation = 'confirm'
WHERE cpd.candidate_id = $1 AND cpd.document_id = $2
  AND cpd.document_role = 'resume' AND cpd.unlinked_at IS NULL
LIMIT 1
```

The idempotency check relies on `entity_type = 'resume_confirmation'` in `profile_change_history`. This is a convention — not enforced by any CHECK constraint or trigger. If a future code path uses a different `entity_type` string, or if the naming convention changes, the check silently breaks and duplicate confirmations could occur.

**Impact:** Under specific conditions, a repeated confirm could bypass the guard and create duplicate revision bumps and outbox events.

**Recommended fix:** Either (a) add a `confirmed_at TIMESTAMPTZ` column to `candidate_profile_documents` and check it directly, or (b) add a CHECK constraint on `profile_change_history.entity_type` to enforce allowed values.

**Schema/contract decision required:** Yes — adding `confirmed_at` column is the cleanest fix.

---

### HIGH-02 — Incorrect Error Code for Scan State

**File:** `src/resume.ts:92`
**Code:** `throw new ConflictException('SCAN_NOT_READY')`
**DECISION-06:** Defines `SCAN_PENDING`, `INFECTED_FILE`, `SCAN_FAILED` as separate codes

The code uses a non-existent error code `SCAN_NOT_READY`. Combined with HIGH-03 (the filter maps all 4xx to `VALIDATION_ERROR`), the actual response is `VALIDATION_ERROR` with message `SCAN_NOT_READY`.

**Impact:** Clients cannot distinguish between pending scan, infected file, and failed scan.

**Recommended fix:** Check `security_scan_status` value and throw the appropriate error: `SCAN_PENDING` for pending/scanning, `INFECTED_FILE` for infected/quarantined, `SCAN_FAILED` for failed.

**Schema/contract decision required:** No

---

### HIGH-03 — Error Filter Maps All 4xx to VALIDATION_ERROR

**File:** `src/errors.ts:9`
**Code:**
```typescript
const code = status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN'
  : status === 404 ? 'NOT_FOUND' : status >= 500 ? 'INTERNAL_ERROR'
  : 'VALIDATION_ERROR';
```

All 4xx errors except 401, 403, 404 become `VALIDATION_ERROR`. This means `STALE_REVISION` (409), `SCAN_NOT_READY` (409), `PARSING_NOT_READY` (409), `UPLOAD_LIMIT_REACHED` (400), `GUEST_SESSION_INVALID` (403) all lose their domain-specific identity.

**Impact:** Clients cannot programmatically distinguish different error conditions. The approved DECISION-06 error vocabulary is not honored.

**Recommended fix:** Create domain-specific NestJS exception classes (e.g., `StaleRevisionException`, `ScanPendingException`) that carry the approved error code. Update `ApiExceptionFilter` to extract the code from the exception.

**Schema/contract decision required:** No

---

### HIGH-04 — `insertConfirmedFacts` Uses Untyped Input

**File:** `src/resume.ts:15-42`
**Code:** `private async insertConfirmedFacts(client: any, candidateId: string, documentId: string, parsingResultId: string, input: any)`

The child-fact insertion function accepts `any` typed input. The `confirm` endpoint at `resume.ts:100` passes `profileInput.facts` which is also untyped. No DTO validation is performed on the facts object shape.

**Impact:** Malformed input could cause runtime SQL errors or insert unexpected data. A skill without `name`, an experience without `company_name`/`job_title`/`start_date` — these are caught by individual `if (!item?.field)` checks, but the overall shape is not validated.

**Recommended fix:** Define `ConfirmFactsDto` with validated sub-DTOs for each fact type (skills, experiences, educations, certifications, projects, languages). Apply `class-validator` decorators.

**Schema/contract decision required:** No

---

### MEDIUM-01 — Guest Session Not Checking `consumed_at`

**File:** `src/guest.ts:33`
**Code:** `WHERE id = $1 AND token_hash = $2 AND status = 'active' AND expires_at > NOW() AND revoked_at IS NULL`

The query does not check `consumed_at IS NULL`. The `consume_guest_upload_session()` function (called at `guest.ts:104`) sets `consumed_at`. If a session is consumed but `status` is still `'active'`, the session could theoretically be reused for uploads.

**Impact:** Potential session reuse after consumption. The `consume_guest_upload_session()` function may or may not update `status` — the implementation is in the SQL function which we cannot see the body of.

**Recommended fix:** Add `AND consumed_at IS NULL` to the session lookup query at `guest.ts:33,41,86`.

**Schema/contract decision required:** No

---

### MEDIUM-02 — Status Derivation Implicit Clean-Scan Fallthrough

**File:** `src/candidate.ts:82-89`
**Code:**
```typescript
if (scan === 'pending' || scan === 'scanning') stage = ...;
else if (scan === 'infected' || scan === 'quarantined') stage = ...;
else if (scan === 'failed') { stage = ...; }
else if (!processing || processing === 'uploaded' || processing === 'queued') stage = ...;
// ... etc
```

When `scan === 'clean'`, the code falls through to the processing status checks. This is correct behavior (clean scan → check parsing status) but the logic is implicit. A future maintainer might not realize that `scan === 'clean'` is the intended path.

**Impact:** None — code is correct.
**Recommended fix:** Add explicit `else if (scan === 'clean')` branch for clarity.

---

### MEDIUM-03 — SQL Column Name Interpolation (Two Locations)

**Files:** `candidate.ts:153`, `candidate.ts:182`
**Code:** `"${allowed[field]}" = $${index + 1}` and `public.${table}`

Both locations use string interpolation with hardcoded whitelist maps. The maps are closed and verified at code-review time, but the pattern is fragile. If someone adds a field to the map with a SQL-special character, it would be injected.

**Impact:** Low practical risk due to hardcoded whitelists, but violates the principle of parameterized queries.
**Recommended fix:** Use a builder pattern or column-name validation against information_schema.

---

### MEDIUM-04 — Inconsistent `entity_type` Values

**Files:** `candidate.ts:159,187`
**Code:** Profile update: `entity_type = 'candidate_profile'`; fact archive: `entity_type = factType` (e.g., `'skills'`, `'experiences'`)

The `entity_type` column is `VARCHAR(100)` with no CHECK constraint. The values are inconsistent: `'candidate_profile'` is a conceptual name, while `'skills'` is a table name.

**Impact:** Audit trail inconsistency; future queries on `entity_type` must handle both conventions.
**Recommended fix:** Define a consistent convention and document it.

---

### MEDIUM-05 — Confirm Omits `before_data` in History

**File:** `src/resume.ts:106`
**Code:** `profile_change_history` insert only provides `after_data`

The `before_data` column exists (`08_candidates.sql:481`) but is not populated during confirmation. The audit trail cannot show what the profile looked like before confirmation.

**Impact:** Incomplete audit trail for compliance/debugging.
**Recommended fix:** Capture the profile state before the confirmation update and include it as `before_data`.

---

### MEDIUM-06 — Implementation Report Inaccuracy

**File:** `PHASE-09-C-CANDIDATE-RESUME-IMPLEMENTATION-REPORT.md:45`
**Claim:** "guest upload... remain the next slice"
**Reality:** Guest session creation (`guest.ts:13-24`), guest resume upload (`guest.ts:26-53`), guest apply (`guest.ts:82-107`), and guest claim (`guest.ts:109-122`) are all implemented.

**Impact:** Misleading status claim could cause confusion during code review or sprint planning.
**Recommended fix:** Update the implementation report to accurately reflect what IS implemented.

---

### LOW-01 — JWT Missing `iss`/`aud` Validation

**File:** `src/auth.ts:7`
**Code:** Only checks `HS256` algorithm, `sub` claim, and `exp` expiry

Supabase JWTs include `iss` (issuer) and `aud` (audience) claims. Not checking these means any valid HMAC-SHA256 token with a `sub` claim would be accepted, even if issued for a different Supabase project.

**Impact:** Low — requires knowledge of the JWT secret.
**Recommended fix:** Add `iss` and `aud` validation against configured Supabase project values.

---

### LOW-02 — DTO Without Class-Validator Decorators

**File:** `src/candidate.ts:9-29`
**Code:** `UpdateCandidateProfileDto` has no `@IsNumber()`, `@IsString()`, etc.

The `ValidationPipe` with `whitelist: true` strips unknown properties, but without type decorators, it cannot validate that `expected_profile_revision` is actually a number.

**Impact:** Invalid types could pass validation.
**Recommended fix:** Add `class-validator` decorators to all DTOs.

---

### LOW-03 — PDF Magic Byte Check Incomplete

**File:** `src/resume-upload-validation.ts:24`
**Code:** `file.buffer.subarray(0, 5).toString('ascii') === '%PDF-'`

Only checks the PDF header. Does not verify the EOF marker `%%EOF`. A truncated PDF would pass validation.

**Impact:** Low — truncated PDFs would fail during parsing.
**Recommended fix:** Also check for `%%EOF` in the last 1024 bytes.

---

### LOW-04 — Guest Token Returned in Plaintext

**File:** `src/guest.ts:23`
**Code:** `return { session_id, job_id, token, expires_at }`

The guest token is returned in the API response. This is correct — it's a one-time bearer token. But it should be logged as a security-sensitive operation.

**Impact:** None — this is correct behavior.
**Recommended fix:** Add audit logging for guest session creation.

---

### LOW-05 — Storage Path Contains Candidate UUID

**File:** `src/resume.ts:62`
**Code:** `candidates/${candidateId}/resumes/${documentId}.${validated.extension}`

The storage path embeds the candidate UUID. While storage paths are not exposed to the browser, they are stored in `uploaded_documents.storage_path`. The path reveals candidate identity to anyone with database access.

**Impact:** Low — storage is private and paths are not returned in API responses.
**Recommended fix:** Consider using a non-identifying path structure (e.g., `docs/${documentId}.${ext}`).

---

## 6. Security Findings

| ID | Finding | Severity | Evidence |
|---|---|---|---|
| SEC-01 | `user_id` excluded from profile response | PASS | `candidate.ts:43` — `ARRAY['deleted_at','user_id']` |
| SEC-02 | Raw `extracted_text`/`raw_ai_output` excluded from parsed-data | PASS | `candidate.ts:115-116` — allowlist filter |
| SEC-03 | Storage paths not returned in API responses | PASS | No endpoint returns `storage_path` or `storage_bucket` |
| SEC-04 | Credentials not in logs | PASS | `observability.ts:3-4` — `redact()` function |
| SEC-05 | `UserContextClient` rejects non-SELECT SQL | PASS | `clients.ts:10` — regex check |
| SEC-06 | JWT verification uses timing-safe comparison | PASS | `auth.ts:7` — `timingSafeEqual` |
| SEC-07 | Guest token hashed with SHA-256 before storage | PASS | `guest.ts:18` — `createHash('sha256')` |
| SEC-08 | File validation checks magic bytes | PASS | `resume-upload-validation.ts:24-26` |
| SEC-09 | Path traversal rejected in filenames | PASS | `resume-upload-validation.ts:17` |
| SEC-10 | Storage cleanup on DB failure | PASS | `resume.ts:74-76`, `guest.ts:49-51` — best-effort cleanup |
| SEC-11 | `SystemClient` never exposed to controllers | PASS | `app.module.ts:18` — injected as provider only |
| SEC-12 | RLS enabled on all business tables | PASS | `17_rls.sql:68-149` |
| SEC-13 | No authenticated DML grants | PASS | `17_rls.sql:152` — `REVOKE ALL` |
| SEC-14 | Guest session not checking `consumed_at` | MEDIUM | `guest.ts:33` — missing guard |
| SEC-15 | JWT missing `iss`/`aud` validation | LOW | `auth.ts:7` — minimal claim checks |

---

## 7. Data-Integrity Findings

| ID | Finding | Severity | Evidence |
|---|---|---|---|
| DI-01 | Atomic transactions for all writes | PASS | `database.ts:13` — BEGIN/COMMIT/ROLLBACK |
| DI-02 | `bump_candidate_profile_revision()` called once per logical save | PASS | `candidate.ts:156,185`, `resume.ts:102` |
| DI-03 | Optimistic concurrency via `expected_profile_revision` | PASS | `candidate.ts:150,181`, `resume.ts:95` |
| DI-04 | Append-only triggers on immutable tables | PASS | `06_documents.sql:118-120`, `08_candidates.sql:549-578` |
| DI-05 | Checksum reuse prevents duplicate documents | PASS | `resume.ts:50-54` — queries existing by checksum |
| DI-06 | Confirm idempotency via `profile_change_history` check | HIGH | `resume.ts:90-91` — fragile join condition |
| DI-07 | `candidate_profile_documents` unique constraint prevents duplicate links | PASS | `08_candidates.sql:119,127-129` |
| DI-08 | Guest upload count/bytes limits enforced | PASS | `guest.ts:42` — `FOR UPDATE` + limit check |
| DI-09 | `application_profile_snapshots` immutable | PASS | `09_applications.sql:138+` |
| DI-10 | Outbox events committed atomically with business writes | PASS | All transaction blocks include outbox INSERT |

---

## 8. Contract/Schema Mismatches

| ID | Contract | Code | Mismatch | Severity |
|---|---|---|---|---|
| CM-01 | `application-submitted.v1.json` — `snapshot_id` optional | `guest.ts:103` | Not included (optional, not required) | LOW |
| CM-02 | `application-submitted.v1.json` — `trace_id` optional | `guest.ts:103` | Not included (optional, not required) | LOW |
| CM-03 | `candidate-profile-changed.v1.json` — `change_type` enum | `candidate.ts:161,189` | Uses `'profile_updated'` and `'document_linked'` — both in enum | PASS |
| CM-04 | `security-scan-requested.v1.json` — `payload.uploaded_by_user_id` | `resume.ts:71` | Set to `request.user?.sub` for registered users | PASS |
| CM-05 | `security-scan-requested.v1.json` — `payload.guest_upload_session_id` | `resume.ts:71` | Set to `null` for registered users | PASS |
| CM-06 | `security-scan.requested` event type | `resume.ts:71`, `guest.ts:46` | Correct event type string | PASS |
| CM-07 | Error vocabulary (DECISION-06) | `resume.ts:92` | Uses `SCAN_NOT_READY` — not in vocabulary | HIGH |

---

## 9. Missing Tests

| Test | Priority | Current Coverage |
|---|---|---|
| Guest session creation + token hashing | HIGH | No test |
| Guest resume upload + session limit enforcement | HIGH | No test |
| Guest apply + claim flow | HIGH | No test |
| Resume upload + checksum reuse | HIGH | No test |
| Resume confirm idempotency (repeat same request) | HIGH | `resume.spec.ts` only tests stale revision |
| Confirm child-fact insertion | HIGH | No test |
| Storage adapter put/remove | MEDIUM | No test |
| `UserContextClient` JWT propagation to RLS | MEDIUM | No integration test |
| Concurrent confirm requests | MEDIUM | No test |
| Error envelope correct codes for all 409 types | MEDIUM | `errors.spec.ts` only tests 400/404 |
| Profile archive + revision bump + outbox atomicity | MEDIUM | No test |
| Guest parsed-data allowlist | MEDIUM | No test |
| `SafeLogger` redaction in all log levels | LOW | `observability.spec.ts` tests basic case |
| Request context ID generation | LOW | `request-context.spec.ts` tests safe input |

---

## 10. Production-Readiness Verdict

### **APPROVED WITH FIXES**

| Category | Status |
|---|---|
| Tests pass | ✅ 35/35 PASS |
| Build succeeds | ✅ PASS |
| PII exposure | ✅ `user_id` excluded from responses |
| Raw data exclusion | ✅ `extracted_text`/`raw_ai_output` filtered |
| Storage path exclusion | ✅ Not in responses |
| Credential logging | ✅ Redacted |
| Atomic transactions | ✅ All writes atomic |
| Optimistic concurrency | ✅ `expected_profile_revision` enforced |
| Checksum reuse | ✅ Prevents duplicate documents |
| RLS defense-in-depth | ✅ SELECT policies on candidate tables |
| SystemClient/UserContextClient separation | ✅ Enforced at code level |
| Idempotency | ⚠️ Confirm idempotency is fragile (HIGH-01) |
| Error codes | ❌ Incorrect codes (HIGH-02, HIGH-03) |
| Input validation | ❌ Child facts untyped (HIGH-04) |
| Guest session lifecycle | ⚠️ `consumed_at` not checked (MEDIUM-01) |
| Test coverage | ❌ No integration tests, no guest tests, no upload tests |
| Implementation report | ❌ Inaccurate status claim (MEDIUM-06) |

---

## 11. Exact Next Actions

### Must Fix Before Production

1. **HIGH-01:** Harden confirm idempotency — add `confirmed_at` column to `candidate_profile_documents` or use a CHECK-constrained `entity_type` enum
2. **HIGH-02:** Replace `SCAN_NOT_READY` with `SCAN_PENDING`/`INFECTED_FILE`/`SCAN_FAILED` based on actual `security_scan_status` value
3. **HIGH-03:** Create domain exception classes carrying DECISION-06 error codes; update `ApiExceptionFilter` to use them
4. **HIGH-04:** Define `ConfirmFactsDto` with validated sub-DTOs for child fact input

### Should Fix Before Production

5. **MEDIUM-01:** Add `AND consumed_at IS NULL` to guest session lookup queries
6. **MEDIUM-05:** Include `before_data` in confirmation `profile_change_history` insert
7. **MEDIUM-06:** Update implementation report to accurately reflect guest upload implementation status
8. **LOW-01:** Add `iss`/`aud` validation to JWT verification
9. **LOW-02:** Add `class-validator` decorators to all DTOs

### Tests to Add

10. Integration tests for guest session → upload → apply → claim flow
11. Integration tests for resume upload → confirm → child-fact insertion
12. Unit tests for confirm idempotency (repeat same request)
13. Unit tests for all 409 error code mappings
14. Integration test for `UserContextClient` JWT propagation through RLS

---

**Report complete. No code was modified.**
