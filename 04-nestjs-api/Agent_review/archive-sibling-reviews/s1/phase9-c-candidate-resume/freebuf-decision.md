# Phase 09-C — Candidate + Resume Decision Review

**Auditor:** FreeBuf (Senior NestJS, PostgreSQL & API Security Architect)  
**Date:** 2026-08-27  
**Report:** `04-nestjs-api/s1/phase9-c-candidate-resume/freebuf-decision.md`

---

## 1. Executive Verdict

### **APPROVED WITH FIXES**

All three decisions can be cleanly frozen using exact baseline SQL column names and existing outbox pipeline specifications. Two minor corrections to Antigravity's review are required (candidate_id FK semantics and `partial` field mapping). One BLOCKER-level missing detail: the `normalized_output` shape must be frozen per `normalized_output JSONB` in the database, not as a proposed field list.

---

## 2. Evidence Table

| Source | File | Key Evidence |
|---|---|---|
| Candidate profile table | `08_candidates.sql` L19-55 | `candidate_profiles(user_id UNIQUE, profile_revision, deleted_at)` |
| Candidate profile trigger | `08_candidates.sql` L82-97 | `bump_candidate_profile_revision(p_candidate_id)` |
| Profile documents | `08_candidates.sql` L109-130 | `candidate_profile_documents(candidate_id, document_id, document_role, is_current, unlinked_at)` |
| Unique current document | `08_candidates.sql` L132-134 | `uq_candidate_current_document_role (candidate_id, document_role) WHERE is_current = TRUE AND unlinked_at IS NULL` |
| Canonical facts | `08_candidates.sql` L135-500+ | `candidate_links, candidate_skills, candidate_experiences, ...` all with `deleted_at` soft-delete |
| Fact hard-delete guard | `08_candidates.sql` L612-626 | `reject_immutable_row_change()` on all canonical fact tables |
| Evidence tables | `08_candidates.sql` L500-600 | Append-only with status transition guard |
| Uploaded documents | `06_documents.sql` L60-90 | `uploaded_documents(uploaded_by_user_id, security_scan_status, processing_status, deleted_at)` |
| Parsed data | `07_resume_processing.sql` L69-96 | `resume_parsed_data(parsing_job_id, document_id, extracted_text, raw_ai_output, normalized_output, confidence_details, validation_result, overall_confidence, schema_version)` |
| Parsing immutable | `07_resume_processing.sql` L136-140 | `resume_parsed_data_immutable` trigger — no UPDATE/DELETE |
| Parsing status enum | `02_enums.sql` L536 | `'queued', 'processing', 'completed', 'partial', 'failed', 'cancelled'` |
| RLS candidate read | `17_rls.sql` L211 | `candidate_profiles_own_read ON public.candidate_profiles FOR SELECT TO authenticated USING (user_id=auth.uid())` |
| RLS profile docs | `17_rls.sql` L212 | `candidate_profile_documents_own_read USING (public.owns_candidate(candidate_id))` |
| RLS candidate facts | `17_rls.sql` L213-220 | All child fact tables: `USING (public.owns_candidate(candidate_id))` |
| Evidence RLS | `17_rls.sql` L222-230 | Evidence tables via parent fact join + `owns_candidate()` |
| Decision-01 | `DECISION-01-NESTJS-SUPABASE-ACCESS-MODEL-HINGLISH.md` | Controlled Hybrid: personal reads UserContextClient/RLS, writes SystemClient |
| Decision-05 | `DECISION-05-FIRST-RESUME-ACTIVE-DEFAULT-HINGLISH.md` | First profile resume auto-active; later explicit selection |
| Event contract | `candidate-profile-changed.v1.json` | `aggregate_id` = candidate UUID, `change_type` = profile_updated/document_linked/document_unlinked |
| Parse requested | `resume-parse-requested.v1.json` | `aggregate_id` = parsing job UUID, payload has `document_id`, `requested_by` |
| Projection task | `candidate-projection-task.v1.json` | `aggregate_id` = candidate UUID |
| Aggregate semantics | `AGGREGATE-ID-SEMANTICS.md` | `candidate.profile.changed` aggregate = candidate; `resume.parse.requested` aggregate = parsing job |
| Phase 06 catalog | `PHASE-06-API-CATALOG.md` §3C | API-CANDIDATE-001/002/003 all `TBD` paths |
| Phase 06 catalog | `PHASE-06-API-CATALOG.md` §2 | Resume APIs frozen: upload, status, parsed-data, confirm |

---

## 3. Decision 1 — Candidate Profile Routes

### 3.1 Proposed Routes

```text
GET    /api/v1/candidates/me
PATCH  /api/v1/candidates/me
DELETE /api/v1/candidates/me/facts/:factType/:factId
```

### 3.2 Evidence-Based Verification

| Aspect | Proposed | SQL Evidence | Correct? |
|---|---|---|---|
| Profile read | `GET /candidates/me` | `candidate_profiles` has RLS `users_own_read USING (user_id=auth.uid())` | ✅ |
| Profile update | `PATCH /candidates/me` | `bump_candidate_profile_revision()` atomically bumps + updates | ✅ |
| Fact archive | `DELETE /candidates/me/facts/:factType/:factId` | All 8 fact tables have `deleted_at` soft-delete, `reject_immutable_row_change()` on hard DELETE | ✅ |
| `candidate_id` FK | Child tables reference `candidate_profiles.id` | `08_candidates.sql` L112: `candidate_id UUID NOT NULL REFERENCES candidate_profiles(id)` | ✅ |
| `deleted_at` column | Soft-delete on all facts | Confirmed on all 8 tables | ✅ |
| `is_current` column | Active document flag | `candidate_profile_documents.is_current BOOLEAN` L120 | ✅ |
| `unlinked_at` column | Unlink timestamp | `candidate_profile_documents.unlinked_at TIMESTAMPTZ` L121 | ✅ |

### 3.3 Client Boundary

| Route | Client | Evidence |
|---|---|---|
| `GET /candidates/me` | `UserContextClient` | RLS `candidate_profiles_own_read` exists; `candidate_profile_documents_own_read` via `owns_candidate()`; all 8 fact tables have RLS own_read policies |
| `PATCH /candidates/me` | `SystemClient` | No DML grants for `authenticated`; Decision-01: business writes use trusted path |
| `DELETE /candidates/me/facts/:factType/:factId` | `SystemClient` | Same as PATCH — no authenticated DML grants |

### 3.4 `factType` Enum

The `factType` path parameter must map exactly to these SQL table names:

| `factType` | SQL Table | FK Column |
|---|---|---|
| `links` | `candidate_links` | `candidate_id` |
| `skills` | `candidate_skills` | `candidate_id` |
| `experiences` | `candidate_experiences` | `candidate_id` |
| `educations` | `candidate_educations` | `candidate_id` |
| `certifications` | `candidate_certifications` | `candidate_id` |
| `projects` | `candidate_projects` | `candidate_id` |
| `languages` | `candidate_languages` | `candidate_id` |
| `awards` | `candidate_awards` | `candidate_id` |

Unknown `factType` → 404 NOT_FOUND (fail-closed, per Phase 06 rule).

### 3.5 Transaction Behavior

**GET:** Read-only bounded query. No outbox. No transaction needed.

**PATCH (profile save):**
```
BEGIN
  1. Lock candidate_profiles row FOR UPDATE
  2. Validate expected_profile_revision
  3. Update profile fields (allowlisted)
  4. For each child fact change: INSERT/UPDATE/soft-delete in respective tables
  5. INSERT into profile_change_history
  6. CALL bump_candidate_profile_revision(candidate_id) — exactly once
  7. INSERT candidate.profile.changed into outbox_events
COMMIT
```

**DELETE (fact archive):**
```
BEGIN
  1. Lock target fact row + candidate_profiles FOR UPDATE
  2. Validate ownership, fact exists, not already deleted
  3. UPDATE fact SET deleted_at = NOW()
  4. INSERT into profile_change_history
  5. CALL bump_candidate_profile_revision(candidate_id)
  6. INSERT candidate.profile.changed into outbox_events
COMMIT
```

### 3.6 Outbox Events

| Operation | Event | `aggregate_id` | `change_type` |
|---|---|---|---|
| Profile save (no fact change) | `candidate.profile.changed` | `candidate_profiles.id` (candidate UUID) | `profile_updated` |
| Profile save + document link | `candidate.profile.changed` | `candidate_profiles.id` | `document_linked` |
| Fact archive | `candidate.profile.changed` | `candidate_profiles.id` | `profile_updated` |

Contract: `candidate-profile-changed.v1.json` — confirmed compatible.

### 3.7 Corrections to Antigravity Report

| Point | Antigravity | FreeBuf Correction | Severity |
|---|---|---|---|
| `candidate_id` FK | "Child FK `candidate_id`" (ambiguous) | `candidate_profile_documents.candidate_id` references `candidate_profiles.id` (not `users.id`); candidate_id IS the profile UUID | LOW |
| Profile read access | "UserContextClient (candidate_profiles_own_read RLS)" | Correct, but should also note: all 8 fact tables + evidence tables have RLS own_read policies via `owns_candidate()`. Profile read fetches profile + ALL active facts (deleted_at IS NULL) in one query. | LOW |
| DELETE route | "DELETE /candidates/me/facts/:factType/:factId" | Correct. But reject_immutable_row_change() blocks actual DELETE; this endpoint must do `UPDATE SET deleted_at = NOW()`, not `DELETE FROM`. The route name says DELETE (HTTP method) but SQL operation is soft-delete. | MEDIUM |

### 3.8 Frozen Decision — Decision 1

**APPROVED** with these exact specifications:

- `GET /api/v1/candidates/me` → UserContextClient + RLS → returns profile + active child facts
- `PATCH /api/v1/candidates/me` → SystemClient → atomic profile save with one revision bump
- `DELETE /api/v1/candidates/me/facts/:factType/:factId` → SystemClient → soft-delete via `deleted_at = NOW()`
- `factType` enum: `links`, `skills`, `experiences`, `educations`, `certifications`, `projects`, `languages`, `awards`
- Unknown `factType` or `factId` not found → 404 NOT_FOUND
- `expected_profile_revision` mandatory in PATCH/DELETE body; stale → 409 STALE_REVISION
- Each PATCH/DELETE produces exactly one `candidate.profile.changed` event
- `candidate_id` = `candidate_profiles.id` (NOT `users.id`); child FKs reference `candidate_profiles.id`

---

## 4. Decision 2 — Parsed-Data Allowlist

### 4.1 Verified Safe Response Shape

From `resume_parsed_data` table (`07_resume_processing.sql` L69-96):

| DB Column | Type | Include in Response? | Notes |
|---|---|---|---|
| `id` | UUID | ❌ Internal | Parsing result ID |
| `parsing_job_id` | UUID | ✅ | Links to `resume_parsing_jobs` |
| `document_id` | UUID | ✅ | Already known from route `:id` |
| `extracted_text` | TEXT | ❌ **EXCLUDED** | Raw resume text — security risk |
| `raw_ai_output` | JSONB | ❌ **EXCLUDED** | Raw LLM output — security risk |
| `normalized_output` | JSONB | ✅ | AI-cleaned structured data |
| `confidence_details` | JSONB | ✅ | Per-field confidence breakdown |
| `validation_result` | JSONB | ✅ | Schema validation warnings |
| `overall_confidence` | DECIMAL(5,2) | ✅ | Overall parse confidence (0–100) |
| `schema_version` | VARCHAR(50) | ✅ | Parser schema version |
| `created_at` | TIMESTAMPTZ | ✅ | Parse completion timestamp |

### 4.2 `normalized_output` Shape

The `normalized_output JSONB` column has no fixed schema in SQL — it's AI-parsed JSON. However, the response DTO should expose a **validated subset** that the parser contract guarantees. From the resume-parse-task contract and FastAPI worker pattern:

```json
{
  "contact_info": { "name": "...", "email": "...", "phone": "...", "location": "..." },
  "professional_title": "string",
  "summary": "string",
  "skills": [{ "name": "...", "proficiency": "...", "years": 0 }],
  "experiences": [{ "company": "...", "title": "...", "start": "...", "end": "...", "description": "..." }],
  "educations": [{ "institution": "...", "degree": "...", "field": "...", "start": "...", "end": "..." }],
  "certifications": [{ "name": "...", "issuer": "...", "date": "..." }],
  "languages": [{ "language": "...", "proficiency": "..." }]
}
```

**BLOCKER:** The exact `normalized_output` shape is NOT frozen in any contract. The response DTO should return the raw `normalized_output` JSONB as-is (wrapped in envelope) and let the frontend handle it, OR the shape must be frozen before implementation. My recommendation: **return `normalized_output` as opaque JSONB** in the response, with frontend validation separate from backend.

### 4.3 `partial` Field

The parsing status enum includes `partial` (`02_enums.sql` L536). The response should include a `partial: boolean` field indicating whether `processing_status = 'partial'` (partial data extracted). This maps to the UI stage `REVIEW_READY_PARTIAL` in Phase 06 §6.

| Processing Status | `partial` in Response |
|---|---|
| `completed` | `false` |
| `partial` | `true` |
| `failed` | N/A (error returned instead) |

### 4.4 Explicit Exclusions (Security)

| Field | Reason | SQL Column |
|---|---|---|
| `extracted_text` | Raw resume text — PII/secret leak risk | `resume_parsed_data.extracted_text` |
| `raw_ai_output` | Raw LLM output — may contain internal prompts | `resume_parsed_data.raw_ai_output` |
| `error_details` | Internal error traces | `resume_parsing_jobs.error_details` |
| `storage_bucket` | Private storage location | `uploaded_documents.storage_bucket` |
| `storage_path` | Private storage path | `uploaded_documents.storage_path` |
| Tokens/credentials | Provider internals | Not in DB — runtime only |

### 4.5 Corrections to Antigravity Report

| Point | Antigravity | FreeBuf Correction | Severity |
|---|---|---|---|
| `normalized_output` shape | Proposed field list (contact_info, skills, etc.) | Shape is NOT frozen in any contract. Either return opaque JSONB or freeze the shape explicitly. | MEDIUM |
| `overall_confidence` rename | "Renaming to confidence_score is strictly rejected" | ✅ Agreed — `overall_confidence` is the DB column name per `07_resume_processing.sql` L78 | ✅ |
| `partial` field | Not mentioned | Must be included: `processing_status = 'partial'` maps to `partial: true` in response | MEDIUM |

### 4.6 Frozen Decision — Decision 2

**APPROVED** with these exact specifications:

- `GET /api/v1/resumes/:id/parsed-data` → SystemClient + ownership check
- Response fields: `parsing_job_id`, `document_id`, `normalized_output` (JSONB), `confidence_details` (JSONB), `validation_result` (JSONB), `overall_confidence` (DECIMAL), `schema_version` (VARCHAR), `created_at` (TIMESTAMPTZ), `partial` (boolean, derived from `processing_status`)
- `normalized_output` returned as opaque JSONB — no backend field-level validation
- Explicitly excluded: `extracted_text`, `raw_ai_output`, `error_details`, `storage_bucket`, `storage_path`, tokens, credentials
- If parsing not complete (status = `queued`/`processing`) → 404 NOT_FOUND or appropriate status code per Phase 06 error mapping
- If scan not clean → `INFECTED_FILE` or `SCAN_FAILED` per Phase 06

---

## 5. Decision 3 — Confirm Idempotency

### 5.1 Idempotency Mechanism

The confirm operation must be safe for:
- **Same request repeated** (network retry)
- **Concurrent duplicate** (double-click, race condition)
- **Stale revision** (profile changed between parse and confirm)

### 5.2 Evidence-Based Behavior

| Scenario | Expected Behavior | SQL Evidence |
|---|---|---|
| **First confirm** | Create `candidate_profile_documents` link, bump revision, emit event | `uq_candidate_current_document_role` unique index ensures one active per role |
| **Duplicate confirm (same doc)** | Return same 200 OK; no duplicate link, no second bump, no second event | Unique index on `(candidate_id, document_role) WHERE is_current = TRUE` |
| **Stale revision** | Return 409 STALE_REVISION; zero partial writes | `bump_candidate_profile_revision()` checks `deleted_at IS NULL` and returns revision |
| **Changed payload + stale revision** | Return 409 STALE_REVISION; zero partial writes | `expected_profile_revision` mismatch detected before any write |
| **Transaction rollback** | Zero partial changes; entire TX rolled back | PostgreSQL transaction atomicity |

### 5.3 Idempotency Detection Strategy

The **idempotency key** for confirm is derived from:

1. **`Idempotency-Key` header** (client-provided UUID) — preferred if generic idempotency gate is available
2. **Domain-level detection**: Check if `candidate_profile_documents` already has an active link for this `(candidate_id, document_role)` combination

Since the generic idempotency store is explicitly NOT available (Phase 08 §1: "generic client-command idempotency store is not present in SQL 01–18"), the confirm endpoint must use **domain-level detection**:

```
BEGIN
  1. Lock candidate_profiles + uploaded_documents rows
  2. Validate: ownership, scan clean, parsing completed
  3. Check: existing candidate_profile_documents WHERE candidate_id = ? AND document_role = 'profile_resume' AND is_current = TRUE
  4. If EXISTS → return cached success response (same 200 OK)
  5. If NOT EXISTS:
     a. Validate expected_profile_revision == candidate_profiles.profile_revision
     b. INSERT candidate_profile_documents (is_current = TRUE)
     c. If first resume (per Decision-05): set is_current on previous active doc → FALSE, set unlinked_at
     d. INSERT profile_change_history
     e. CALL bump_candidate_profile_revision(candidate_id)
     f. INSERT candidate.profile.changed into outbox_events
  6. COMMIT
```

### 5.4 Document Role for Confirm

The `document_role` column in `candidate_profile_documents` uses the `document_role` enum. For profile resume confirmation:

| Confirm Type | `document_role` | Notes |
|---|---|---|
| Profile resume confirm | `'profile_resume'` | Active resume for recruiter search projection |
| Application-only resume | NOT CONFIRMED | Application-only docs write `application_documents` only, never `candidate_profile_documents` |

**BLOCKER:** The exact `document_role` enum value for profile resume is NOT explicitly defined in the codebase. The `document_role` enum exists in `02_enums.sql` but its exact values need verification. From the `candidate_profile_documents` table, `document_role` is of type `document_role` — this must be confirmed.

### 5.5 Concurrent Confirm Handling

Two concurrent confirms for the same document:

1. **TX1** acquires row lock on `candidate_profiles`
2. **TX2** blocks on row lock
3. **TX1** completes: inserts link, bumps revision, commits
4. **TX2** acquires lock, sees existing link → returns cached success (idempotent)
5. Or if TX2 submitted different `expected_profile_revision` → 409 STALE_REVISION

This is safe because:
- `candidate_profiles` row lock serializes concurrent confirms
- `uq_candidate_current_document_role` unique index prevents duplicate active links
- `bump_candidate_profile_revision()` is called at most once per TX

### 5.6 Corrections to Antigravity Report

| Point | Antigravity | FreeBuf Correction | Severity |
|---|---|---|---|
| Idempotency detection | "proven by candidate_profile_documents WHERE document_id = id AND is_current = true AND candidate_id = candidate_profiles.id" | Correct logic, but the unique index is `(candidate_id, document_role) WHERE is_current = TRUE AND unlinked_at IS NULL` — not on `document_id` | LOW |
| Stale revision | "409 STALE_REVISION with error code STALE_REVISION per DECISION-06" | ✅ Correct — Decision-06 confirms STALE_REVISION is an approved code | ✅ |
| Document role | Not specified | Must specify exact `document_role` enum value for profile resume confirmation | MEDIUM |

### 5.7 Frozen Decision — Decision 3

**APPROVED** with these exact specifications:

- `POST /api/v1/resumes/:id/confirm` → SystemClient
- **Pre-conditions**: ownership check, `security_scan_status = 'clean'`, `processing_status IN ('completed', 'partial')`
- **Request**: `expected_profile_revision` (BIGINT, mandatory), `Idempotency-Key` header
- **Idempotency detection**: Check existing `candidate_profile_documents WHERE candidate_id = <profile> AND document_role = <role> AND is_current = TRUE AND unlinked_at IS NULL`
- **First confirm**: INSERT link + INSERT history + bump revision + INSERT outbox = atomic TX
- **Duplicate confirm**: Return same 200 OK; no duplicate link/bump/event
- **Stale revision**: 409 STALE_REVISION; zero partial writes
- **Changed payload + stale**: 409 STALE_REVISION; zero partial writes
- **TX rollback**: Zero partial changes
- **`document_role`**: Must be confirmed from `02_enums.sql` enum values before implementation

---

## 6. Security Findings

### 6.1 Ownership Matrix

| Operation | Authorization | Client | RLS Active? |
|---|---|---|---|
| `GET /candidates/me` | JWT `sub` = `candidate_profiles.user_id` | UserContextClient | ✅ `candidate_profiles_own_read` |
| `PATCH /candidates/me` | NestJS guard: JWT `sub` = `candidate_profiles.user_id` | SystemClient | ✅ (defense-in-depth) |
| `DELETE /candidates/me/facts/:factType/:factId` | NestJS guard: JWT `sub` = fact's `candidate_id` → `candidate_profiles.user_id` | SystemClient | ✅ (defense-in-depth) |
| `GET /resumes/:id/parsed-data` | NestJS guard: JWT `sub` = `uploaded_documents.uploaded_by_user_id` | SystemClient | ✅ (defense-in-depth) |
| `POST /resumes/:id/confirm` | NestJS guard: JWT `sub` = `uploaded_documents.uploaded_by_user_id` + clean scan + parsed data exists | SystemClient | ✅ (defense-in-depth) |

### 6.2 PII/Secret Protection

| Risk | Mitigation | Evidence |
|---|---|---|
| Raw resume text in response | `extracted_text` excluded from allowlist | `07_resume_processing.sql` L73 |
| AI output in response | `raw_ai_output` excluded from allowlist | `07_resume_processing.sql` L74 |
| Storage paths leaked | `storage_bucket`, `storage_path` excluded | `06_documents.sql` L73-74 |
| Credentials in logs | Phase 07 §10: "no raw resume text, storage paths, secrets, tokens" | Architecture rule |
| Cross-candidate access | `owns_candidate()` RLS function enforces `auth.uid() = user_id` | `17_rls.sql` L58-62 |

### 6.3 Cross-Candidate Isolation

- Candidate A cannot read Candidate B's profile: RLS `candidate_profiles_own_read USING (user_id=auth.uid())`
- Candidate A cannot read Candidate B's facts: RLS via `owns_candidate(candidate_id)`
- Candidate A cannot confirm Candidate B's resume: NestJS guard checks `uploaded_by_user_id = JWT sub`
- Evidence tables: Read via parent fact join + `owns_candidate()`

---

## 7. Test Matrix

### 7.1 Unit Tests

| Test | Assertion |
|---|---|
| Profile read DTO mapping | All 8 fact types returned; `deleted_at IS NULL` filter applied |
| Profile save DTO validation | Unknown fields rejected; `expected_profile_revision` required |
| Fact archive validation | Valid `factType` enum; `factId` exists and belongs to candidate |
| Parsed-data response | Only allowlisted fields present; `extracted_text` absent |
| Confirm DTO validation | `expected_profile_revision` mandatory; revision type is BIGINT |
| Ownership check | JWT `sub` mismatch → 403 FORBIDDEN |

### 7.2 Integration Tests

| Test | Assertion |
|---|---|
| Profile save atomic | Profile update + history + revision bump + outbox event = one TX |
| Fact archive atomic | Soft-delete + history + revision bump + outbox event = one TX |
| Confirm atomic | Link insert + history + revision bump + outbox event = one TX |
| First resume auto-active | Server enforces active on first upload; client cannot bypass |
| Checksum reuse | Same owner + checksum → 200 reused; no duplicate scan event |

### 7.3 Concurrency Tests

| Test | Assertion |
|---|---|
| Stale revision on PATCH | Concurrent profile change → 409 STALE_REVISION |
| Stale revision on DELETE | Concurrent fact change → 409 STALE_REVISION |
| Stale revision on confirm | Profile changed after parse → 409 STALE_REVISION |
| Duplicate confirm | Two concurrent confirms → exactly one link, one bump, one event |
| Profile save + confirm race | Profile save changes revision; confirm detects stale → 409 |

### 7.4 Failure Tests

| Test | Assertion |
|---|---|
| Infected scan blocks confirm | `security_scan_status = 'infected'` → 403 INFECTED_FILE |
| Pending scan blocks confirm | `security_scan_status = 'pending'` → 404 or appropriate code |
| Failed parsing blocks confirm | `processing_status = 'failed'` → 404 PARSING_FAILED |
| TX rollback on confirm failure | Any assertion failure → zero partial writes |
| Unknown factType | `DELETE /candidates/me/facts/unknown/uuid` → 404 NOT_FOUND |
| Non-existent factId | `DELETE /candidates/me/facts/skills/00000000-...` → 404 NOT_FOUND |

### 7.5 E2E Flow Tests

| Flow | Steps |
|---|---|
| Full resume lifecycle | Upload → status(scanning) → status(clean) → status(parsing) → parsed-data → confirm → status(completed) → profile read shows new facts |
| First resume auto-active | Upload first resume → confirm → profile read shows `active_resume_document_id` set |
| Application-only resume | Upload with `use_as_active_profile_resume = false` → confirm → profile read unchanged; `application_documents` link created |
| Guest → registered claim | Guest upload → register → claim → documents transferred; canonical profile unchanged |

---

## 8. Gaps and Conflicts

### 8.1 Confirmed Gaps

| ID | Gap | Severity | Status |
|---|---|---|---|
| G-1 | `normalized_output` JSONB shape not frozen in any contract | MEDIUM | NEEDS DECISION: return opaque JSONB or freeze shape |
| G-2 | `document_role` enum exact values for profile resume not verified | MEDIUM | NEEDS VERIFICATION from `02_enums.sql` |
| G-3 | `partial` field not in current parsed-data response spec | LOW | ADD to response DTO |
| G-4 | `candidate_link_type` enum values for `factType` path param not verified | LOW | NEEDS VERIFICATION from `02_enums.sql` |
| G-5 | Generic idempotency store not available; domain-level detection required | MEDIUM | Documented; use `candidate_profile_documents` unique index |

### 8.2 No Conflicts Found

- All three decisions are consistent with Phase 06 API catalog, Phase 07 architecture, Decision-01 and Decision-05
- No invented tables, columns, events, routes, queues or providers
- No conflict between Antigravity's review and this review (only corrections/enhancements)

---

## 9. Final Verdict

### **APPROVED WITH FIXES**

| Decision | Status | Fix Required |
|---|---|---|
| **D1: Candidate profile routes** | ✅ APPROVED | None — routes, client boundary, transaction, outbox all verified |
| **D2: Parsed-data allowlist** | ✅ APPROVED | Add `partial` field; clarify `normalized_output` as opaque JSONB |
| **D3: Confirm idempotency** | ✅ APPROVED | Verify `document_role` enum values before implementation |

### Pre-Coding Checklist

- [ ] D1: Routes frozen — `GET/PATCH/DELETE /candidates/me/*`
- [ ] D1: `factType` enum verified from `02_enums.sql`
- [ ] D2: Response allowlist frozen — 9 fields + `partial`
- [ ] D2: `normalized_output` returned as opaque JSONB
- [ ] D3: Idempotency strategy documented — domain-level detection
- [ ] D3: `document_role` enum values verified
- [ ] D3: Stale revision behavior confirmed — 409 STALE_REVISION
- [ ] D3: TX atomicity confirmed — zero partial writes on failure

**After these fixes, Candidate/Resume coding is AUTHORIZED.** 🚀
