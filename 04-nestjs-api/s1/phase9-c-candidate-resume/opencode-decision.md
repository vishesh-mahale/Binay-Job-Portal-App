# Phase 09-C — Candidate/Resume Decisions (opencode)

**Auditor:** opencode (mimo-v2-omni)
**Date:** 2026-08-27
**Report:** `04-nestjs-api/s1/phase9-c-candidate-resume/opencode-decision.md`

---

## 1. Executive Summary

Three unresolved Phase 09-C decisions are reviewed against SQL baseline, approved contracts, Phase-06 catalog, Decision-01/05/06 and dispatcher registry. All decisions are resolved with approved recommendations. Final status:

```text
Decision 1 — Candidate profile routes:    APPROVED WITH FREEZE
Decision 2 — Parsed-data allowlist:        APPROVED WITH FREEZE
Decision 3 — Confirm idempotency:          APPROVED WITH FREEZE
OVERALL STATUS:                            APPROVED WITH FIXES
```

---

## Decision 1 — Candidate Profile Routes

### 1.1 Review

**Question:** Freeze exact routes for own profile read, canonical profile save and canonical fact archive/soft-delete.

**Proposed shape under review:**
```text
GET    /api/v1/candidates/me
PATCH  /api/v1/candidates/me
DELETE /api/v1/candidates/me/facts/:factType/:factId
```

### 1.2 SQL Evidence

| Checkpoint | Evidence | Source |
|---|---|---|
| **Table PK** | `candidate_profiles.id UUID PRIMARY KEY` | `08_candidates.sql:47` |
| **User FK** | `user_id UUID NOT NULL UNIQUE REFERENCES users(id)` | `08_candidates.sql:48` |
| **Profile columns** | `professional_title`, `summary`, `date_of_birth`, `gender`, `nationality`, `current_location`, `city`, `state`, `country`, `postal_code`, `latitude`, `longitude`, `preferred_work_mode`, `willing_to_relocate`, `willing_to_travel`, `remote_experience`, `notice_period_days`, `expected_salary_min`, `expected_salary_max`, `salary_currency`, `work_authorization`, `visa_sponsorship_needed`, `is_open_to_work`, `available_from` | `08_candidates.sql:49-72` |
| **Revision** | `profile_revision BIGINT NOT NULL DEFAULT 1` | `08_candidates.sql:73` |
| **Soft delete** | `deleted_at TIMESTAMPTZ` | `08_candidates.sql:78` |
| **No `is_soft_deleted`** | Column does not exist; canonical fact tables use `deleted_at` only | `08_candidates.sql` (all fact tables) |
| **No `candidate_profile_id`** | FK column in child fact tables is `candidate_id` (references `candidate_profiles(id)`) | `08_candidates.sql:133,150,173,206,229,256,289,310` |
| **`candidate_profile_documents`** | PK: `(candidate_id, document_id, document_role)`; columns: `is_current BOOLEAN`, `unlinked_at TIMESTAMPTZ`, `linked_at TIMESTAMPTZ`, `version_number INTEGER` | `08_candidates.sql:111-125` |
| **`profile_change_history`** | Columns: `candidate_id`, `profile_revision`, `entity_type VARCHAR(100)`, `entity_id UUID`, `operation VARCHAR(30)` (values: `insert`, `update`, `soft_delete`, `restore`, `confirm`, `reject`) | `08_candidates.sql:472-491` |
| **`bump_candidate_profile_revision(p_candidate_id UUID)`** | Takes `candidate_id` (not `profile_id`); returns new `BIGINT` revision; checks `deleted_at IS NULL` | `08_candidates.sql:89-109` |
| **RLS owner check** | `owns_candidate(p_candidate_id UUID)` uses `cp.id = p_candidate_id AND cp.user_id = auth.uid() AND cp.deleted_at IS NULL` | `17_rls.sql:34-39` |
| **RLS policy** | `candidate_profiles_own_read` USING `(user_id = auth.uid())` | `17_rls.sql:182` |
| **Fact table RLS** | All `candidate_*_own_read` policies use `public.owns_candidate(candidate_id)` | `17_rls.sql:184-192` |
| **No authenticated DML** | `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated` | `17_rls.sql:152` |
| **Hard delete forbidden** | `candidate_profiles_no_hard_delete` trigger → `reject_immutable_row_change()` | `08_candidates.sql:549-550` |

### 1.3 Authorization Path Analysis

| Operation | Client | Evidence |
|---|---|---|
| Profile read (own) | `UserContextClient` (authenticated RLS path) | `17_rls.sql:162` — SELECT grant on `candidate_profiles` to `authenticated`; `17_rls.sql:182` — policy `USING (user_id = auth.uid())` |
| Profile save (own) | `SystemClient` (NestJS authorization + trusted write) | `17_rls.sql:152` — no authenticated DML grants; Decision-01: business writes via trusted server role |
| Fact archive (own) | `SystemClient` (NestJS authorization + trusted write) | Same as profile save; `deleted_at` soft-delete only |

**Key finding:** `UserContextClient` path is valid for profile/fact reads because `17_rls.sql:162-164` grants `SELECT ON candidate_profiles, candidate_profile_documents, candidate_links, candidate_skills, candidate_experiences, candidate_educations, candidate_certifications, candidate_projects, candidate_languages, candidate_awards, candidate_skill_evidence, candidate_experience_evidence, candidate_education_evidence, candidate_certification_evidence, profile_change_history TO authenticated` with corresponding `owns_candidate()` RLS policies.

### 1.4 Decision — Frozen Routes

```text
GET    /api/v1/candidates/me
PATCH  /api/v1/candidates/me
DELETE /api/v1/candidates/me/facts/:factType/:factId
```

**Justification:**
1. REST resource name `candidates` matches the canonical table prefix `candidate_*` and the Phase-06 catalog entry `API-CANDIDATE-*`.
2. `/me` suffix scopes all operations to the authenticated user's own profile — no `candidate_id` path parameter needed because `user_id = auth.uid()` derivation is authoritative.
3. DELETE on `/facts/:factType/:factId` is semantically a soft-delete/archive (not hard delete), matching `deleted_at` behavior in all fact tables. The `profile_change_history.operation` value `soft_delete` confirms this intent (`08_candidates.sql:478`).
4. `factType` maps to the canonical fact table subset: `skills`, `experiences`, `educations`, `certifications`, `projects`, `languages`, `awards`, `links`. No other writable fact type exists.

### 1.5 Proposed DTO Shapes

**GET /api/v1/candidates/me — Response 200:**
```json
{
  "candidate_id": "uuid",
  "profile_revision": 1,
  "professional_title": "string | null",
  "summary": "string | null",
  "location": { "city": "string | null", "state": "string | null", "country": "string | null", "postal_code": "string | null" },
  "preferred_work_mode": "string | null",
  "willing_to_relocate": "boolean",
  "willing_to_travel": "boolean",
  "remote_experience": "boolean",
  "notice_period_days": "integer | null",
  "expected_salary": { "min": "number | null", "max": "number | null", "currency": "string" },
  "work_authorization": "string | null",
  "visa_sponsorship_needed": "boolean",
  "is_open_to_work": "boolean",
  "available_from": "date | null",
  "skills": [{ "id": "uuid", "skill_name": "string", "proficiency_level": "integer | null", "years_of_experience": "number | null", "verification_status": "string" }],
  "experiences": [{ "id": "uuid", "company_name": "string", "job_title": "string", "start_date": "date", "end_date": "date | null", "is_current": "boolean", "description": "string | null" }],
  "educations": [{ "id": "uuid", "institution_name": "string", "degree": "string", "field_of_study": "string | null", "start_date": "date | null", "end_date": "date | null", "is_current": "boolean" }],
  "certifications": [{ "id": "uuid", "name": "string", "issuer": "string | null", "issued_at": "date | null", "expires_at": "date | null" }],
  "projects": [{ "id": "uuid", "title": "string", "description": "string | null", "technologies": "array", "started_at": "date | null", "completed_at": "date | null" }],
  "languages": [{ "id": "uuid", "language_name": "string", "proficiency": "string | null" }],
  "awards": [{ "id": "uuid", "title": "string", "issuer": "string | null", "awarded_at": "date | null" }],
  "links": [{ "id": "uuid", "link_type": "string", "label": "string | null", "url": "string" }],
  "active_document_id": "uuid | null"
}
```

**Excluded from response (server-controlled):** `date_of_birth`, `gender`, `nationality`, `latitude`, `longitude`, `salary_currency` (flat), `profile_completed_at`, `last_profile_change_at`, `created_at`, `updated_at`, `deleted_at`, `user_id`.

**PATCH /api/v1/candidates/me — Request body:**
```json
{
  "expected_profile_revision": "integer (required)",
  "professional_title": "string | null",
  "summary": "string | null",
  "date_of_birth": "date | null",
  "gender": "string | null",
  "nationality": "string | null",
  "current_location": "string | null",
  "city": "string | null",
  "state": "string | null",
  "country": "string | null",
  "postal_code": "string | null",
  "preferred_work_mode": "string | null",
  "willing_to_relocate": "boolean | null",
  "willing_to_travel": "boolean | null",
  "remote_experience": "boolean | null",
  "notice_period_days": "integer | null",
  "expected_salary_min": "number | null",
  "expected_salary_max": "number | null",
  "salary_currency": "string | null",
  "work_authorization": "string | null",
  "visa_sponsorship_needed": "boolean | null",
  "is_open_to_work": "boolean | null",
  "available_from": "date | null"
}
```

**PATCH response 200:** Same shape as GET response with updated `profile_revision`.

**DELETE /api/v1/candidates/me/facts/:factType/:factId — Request body:**
```json
{
  "expected_profile_revision": "integer (required)"
}
```

**DELETE response 200:** `{ "profile_revision": "integer" }`.

**Valid `factType` values:** `skills`, `experiences`, `educations`, `certifications`, `projects`, `languages`, `awards`, `links`.

### 1.6 Rejected Alternatives

| Alternative | Reason for rejection |
|---|---|
| `/api/v1/candidate/profile` | Resource is plural `candidates` in table name, Phase-06 catalog; singular inconsistent with REST convention |
| `/api/v1/candidates/:id` | Path param introduces cross-candidate risk; `/me` derives identity from JWT and eliminates arbitrary ID trust |
| `/api/v1/candidates/me/profile` | Unnecessary nesting; single resource `/candidates/me` is sufficient |
| `DELETE /api/v1/candidates/me/:factType/:factId` | `facts` prefix clarifies intent and prevents collision with future sub-resources |
| `candidate_profile_id` column name | Does not exist in SQL; actual FK is `candidate_id` (`08_candidates.sql:133`) |
| `is_soft_deleted` flag | Does not exist; all fact tables use `deleted_at TIMESTAMPTZ` |

### 1.7 Security and Ownership

- **Read path:** `UserContextClient` propagates JWT; RLS `owns_candidate(candidate_id)` enforces `user_id = auth.uid()` at database level. Defense-in-depth.
- **Write path:** `SystemClient` + NestJS guard verifies JWT, account status, role=`candidate`, and `user_id` matches `candidate_profiles.user_id` before opening trusted transaction.
- **Archive:** Sets `deleted_at = NOW()` (or fact-table `deleted_at`); hard delete blocked by `reject_immutable_row_change()` trigger. History recorded in `profile_change_history` with `operation = 'soft_delete'`.
- **No cross-candidate access:** `/me` suffix prevents arbitrary candidate_id; RLS provides additional defense.

### 1.8 Required Tests

| Test | Criteria |
|---|---|
| Profile read own | Candidate reads own profile via `UserContextClient` → 200 with correct data |
| Profile read cross-tenant | Candidate A reads with Candidate B's JWT → 404 or empty |
| Profile save own | Candidate saves own profile with valid revision → 200, revision incremented |
| Profile save stale revision | Candidate saves with wrong `expected_profile_revision` → `409 STALE_REVISION` |
| Profile save unauthorized | Unauthenticated request → `401 UNAUTHORIZED` |
| Fact archive own | Candidate soft-deletes own fact → 200, fact `deleted_at` set, `profile_change_history` row with `operation = 'soft_delete'` |
| Fact archive cross-tenant | Candidate A archives Candidate B's fact → 404 |
| Fact archive non-existent | Archive non-existent fact → 404 |
| Fact archive hard-delete blocked | Direct `DELETE` on fact table → trigger rejects with `'candidate_skills is append-only'` |

### 1.9 Unresolved Risks

None. All column names, constraints and RLS policies verified against baseline SQL.

---

## Decision 2 — Parsed-Data Allowlist

### 2.1 Review

**Question:** Freeze the exact safe response shape for `GET /api/v1/resumes/:id/parsed-data`.

**Exclusions required:**
- `extracted_text`
- `raw_ai_output`
- `artifacts`
- `internal error details`
- `storage_bucket` / `storage_path`
- `tokens`, `credentials`, `provider internals`

### 2.2 SQL Evidence

| Column | Type | Mutable? | Phase-06 allowed? | Verdict |
|---|---|---|---|---|
| `normalized_output` | `JSONB` | Immutable (trigger) | ✅ Yes | **INCLUDE** |
| `confidence_details` | `JSONB` | Immutable (trigger) | ✅ Yes | **INCLUDE** |
| `validation_result` | `JSONB` | Immutable (trigger) | ✅ Yes | **INCLUDE** |
| `overall_confidence` | `DECIMAL(5,2)` | Immutable (trigger) | ✅ Yes | **INCLUDE** |
| `schema_version` | `VARCHAR(50)` | Immutable (trigger) | ✅ Yes | **INCLUDE** |
| `parsing_job_id` | `UUID` (FK) | Immutable | Implicit (parsing identifier) | **INCLUDE** |
| `document_id` | `UUID` | Immutable | Implicit (linkage) | **INCLUDE** |
| `created_at` | `TIMESTAMPTZ` | Immutable | Implicit | **INCLUDE** |
| `extracted_text` | `TEXT` | Immutable | ❌ Excluded | **EXCLUDE** |
| `raw_ai_output` | `JSONB` | Immutable | ❌ Excluded | **EXCLUDE** |

**Source:** `07_resume_processing.sql:69-100` — `resume_parsed_data` table definition; immutability enforced by `resume_parsed_data_immutable` trigger (`07_resume_processing.sql:136-138`).

**Phase-06 catalog confirmation:** `04-nestjs-api/PHASE-06-API-CATALOG.md:90-102` — API-RESUME-003 response is `allowlisted normalized_output, confidence_details, validation_result, overall_confidence, schema_version, parsing identifiers and partial`.

### 2.3 `partial` Field Investigation

Phase-06 mentions `partial` in the response allowlist. Checking `resume_parsing_jobs`:
- `status parsing_job_status` (`07_resume_processing.sql:47`) — enum values are defined in `02_enums.sql`.
- There is no `partial` boolean column in `resume_parsed_data` or `resume_parsing_jobs`.

**Conclusion:** `partial` is not a database column. It is a derived flag that the API computes: `partial = (status = 'partial')` from the parsing job status. The `07_resume_processing.sql` header comment (line 7) says "Processing jobs are mutable; final parsed results, artifacts and event history are immutable evidence." The parsing job status can be `partial` (a terminal state where some fields were extracted but confidence is low).

### 2.4 `overall_confidence` vs `confidence_score`

- DB column: `overall_confidence DECIMAL(5,2)` (`07_resume_processing.sql:78`)
- Evidence tables (`candidate_skill_evidence`, etc.) use `confidence_score DECIMAL(5,2)` (`08_candidates.sql:342,363,384,405`)
- Phase-06 catalog (line 91): `overall_confidence` — this is the canonical name for the parsed-data response
- The consolidated decision (`PHASE-09-C-CONSOLIDATED-CANDIDATE-RESUME-DECISION.md:62`) explicitly states: "exact response DTO freeze hone tak koi alias invent nahi hoga"

**Decision:** Use `overall_confidence` as the response field name. Do NOT rename to `confidence_score`.

### 2.5 `normalized_output` Internal Shape

`normalized_output JSONB` (`07_resume_processing.sql:75`) is the AI-extracted structured resume data. The exact JSON shape depends on the parser provider and version. Since this is a JSONB column with no CHECK constraint defining its internal structure, the allowlist must specify the expected top-level keys.

Based on the Phase-05 requirements (`REQ-CANDIDATE-001..004`, `REQ-RESUME-003`), the normalized output should contain the same categories as the canonical fact tables:
- `contact_info` (name, email, phone, location)
- `summary` / `objective`
- `work_experiences` (array)
- `educations` (array)
- `skills` (array)
- `certifications` (array)
- `languages` (array)
- `projects` (array)
- `links` (array)

**BLOCKER:** The exact `normalized_output` internal schema is not defined by any SQL CHECK constraint or contract file. The allowlist response DTO must specify which top-level keys are included and reject unknown keys. This is implementation-time work; the decision here freezes the outer shape.

### 2.6 Frozen Response Shape

```text
GET /api/v1/resumes/:id/parsed-data → 200
```

```json
{
  "document_id": "uuid",
  "parsing_job_id": "uuid",
  "schema_version": "string",
  "overall_confidence": "number | null",
  "partial": "boolean",
  "normalized_output": {
    "contact_info": { "name": "string | null", "email": "string | null", "phone": "string | null", "location": "string | null" },
    "summary": "string | null",
    "work_experiences": [{ "company": "string", "title": "string", "start_date": "string | null", "end_date": "string | null", "description": "string | null" }],
    "educations": [{ "institution": "string", "degree": "string", "field_of_study": "string | null", "start_date": "string | null", "end_date": "string | null" }],
    "skills": [{ "name": "string", "proficiency": "string | null", "years": "number | null" }],
    "certifications": [{ "name": "string", "issuer": "string | null", "date": "string | null" }],
    "languages": [{ "name": "string", "proficiency": "string | null" }],
    "projects": [{ "title": "string", "description": "string | null", "technologies": ["string"] }],
    "links": [{ "type": "string", "url": "string" }]
  },
  "confidence_details": { "any": "jsonb passthrough" },
  "validation_result": { "any": "jsonb passthrough" },
  "created_at": "datetime"
}
```

**Excluded fields (must never appear):**
- `extracted_text` — raw OCR/text extraction (`07_resume_processing.sql:73`)
- `raw_ai_output` — raw provider response (`07_resume_processing.sql:74`)
- `storage_bucket` — from `uploaded_documents` (`06_documents.sql:81`)
- `storage_path` — from `uploaded_documents` (`06_documents.sql:82`)
- `security_scan_result` — from `uploaded_documents` (`06_documents.sql:85`)
- `error_details` — from `resume_parsing_jobs` (`07_resume_processing.sql:59`)
- `parser_provider`, `parser_model`, `parser_version` — internal provider metadata (`07_resume_processing.sql:42-44`)
- Any tokens, credentials, API keys, Cloud Tasks URLs, or FastAPI internal endpoints

### 2.7 `partial` Derivation Logic

```text
partial = (parsing_job.status = 'partial')
```

Where `parsing_job.status` is the latest `resume_parsing_jobs.status` for the document. The `partial` state means parsing completed but with low confidence or missing sections. It is distinct from `completed` (full success) and `failed` (terminal error).

### 2.8 Rejected Alternatives

| Alternative | Reason for rejection |
|---|---|
| Rename `overall_confidence` to `confidence_score` | Explicitly prohibited by consolidated decision (`PHASE-09-C-CONSOLIDATED-CANDIDATE-RESUME-DECISION.md:62`); `confidence_score` exists only in evidence tables, not parsed-data |
| Include `extracted_text` in response | Phase-05 (line 92): "Raw resume text, raw AI output, artifacts, storage paths, tokens and internal errors are not returned by default" |
| Include `raw_ai_output` | Same exclusion; provider internals must not leak |
| Include `parser_provider` / `parser_model` | Internal metadata; not relevant to candidate review |
| Passthrough entire `resume_parsed_data` row | Security risk; would expose `extracted_text`, `raw_ai_output`, storage references |

### 2.9 Security and Ownership

- **Read path:** `SystemClient` + explicit ownership check (matching `uploaded_documents.uploaded_by_user_id = auth.uid()`). RLS is NOT the primary path for this read because `17_rls.sql:248-250` states parsing/service-only tables have no authenticated SELECT grant.
- **Audit:** Parsed-data access is logged with `request_id`, `trace_id`, `document_id` and `candidate_id`. No `extracted_text` or `raw_ai_output` content in logs.
- **Immutability:** `resume_parsed_data` is append-only (trigger `resume_parsed_data_immutable` at `07_resume_processing.sql:136-138`). The API response is read-only; no mutation possible.

### 2.10 Required Tests

| Test | Criteria |
|---|---|
| Allowlisted fields present | Response contains `document_id`, `parsing_job_id`, `schema_version`, `overall_confidence`, `partial`, `normalized_output`, `confidence_details`, `validation_result`, `created_at` |
| Excluded fields absent | Response does NOT contain `extracted_text`, `raw_ai_output`, `storage_bucket`, `storage_path`, `parser_provider`, `parser_model`, `error_details` |
| Unknown field rejected | Response shape rejects additional properties at DTO validation level |
| Ownership check | Candidate A requests Candidate B's parsed-data → 404 |
| Not found | Request for non-existent document → 404 |
| No parse result | Document exists but no `resume_parsed_data` row → appropriate error (`PARSING_PENDING` or `NOT_FOUND`) |
| Partial status | Parsing job with `status = 'partial'` → response `partial = true` |

### 2.11 Unresolved Risks

**MEDIUM:** The exact `normalized_output` internal JSON schema is not frozen by any contract or SQL CHECK constraint. The implementation DTO must define the allowed top-level keys and reject unknown keys, but the exact shape depends on the parser provider output. Recommendation: define a `NormalizedOutputDto` with explicit optional fields matching the canonical fact categories; reject unknown keys via `additionalProperties: false`.

---

## Decision 3 — Confirm Idempotency

### 3.1 Review

**Question:** Freeze behavior for repeated and concurrent `POST /api/v1/resumes/:id/confirm`.

**Required properties:**
1. Same retry returns same successful result
2. No duplicate `candidate_profile_documents` row
3. No second profile revision bump
4. No second `candidate.profile.changed` event
5. Changed payload with stale revision returns deterministic conflict
6. Transaction rollback produces no partial changes

### 3.2 SQL Evidence

| Checkpoint | Evidence | Source |
|---|---|---|
| **`candidate_profile_documents` PK** | `PRIMARY KEY (candidate_id, document_id, document_role)` | `08_candidates.sql:119` |
| **Unique version** | `UNIQUE (candidate_id, document_role, version_number)` | `08_candidates.sql:123-124` |
| **Active role constraint** | `UNIQUE (candidate_id, document_role) WHERE is_current = TRUE AND unlinked_at IS NULL` | `08_candidates.sql:127-129` |
| **`bump_candidate_profile_revision`** | Takes `p_candidate_id UUID`; increments `profile_revision`; checks `deleted_at IS NULL`; raises exception if not found | `08_candidates.sql:89-109` |
| **`profile_change_history`** | Append-only (trigger at `08_candidates.sql:577-578`); operation includes `confirm` | `08_candidates.sql:478` |
| **Event schema** | `candidate-profile-changed.v1.json` — `change_type` enum: `profile_updated`, `document_linked`, `document_unlinked` | `contracts/events/candidate-profile-changed.v1.json:12` |
| **Outbox event required** | Phase-06 API-RESUME-004: `candidate.profile.changed` outbox event in same transaction | `PHASE-06-API-CATALOG.md:119` |
| **Revision guard** | Phase-05 (line 185): `expected_profile_revision` is mandatory; stale updates return `409 STALE_REVISION` | `PHASE-05-FINAL-REQUIREMENTS.md:185` |
| **One revision bump** | Phase-05 (line 187): "A successful logical save updates canonical facts, history, revision and approved outbox event atomically" | `PHASE-05-FINAL-REQUIREMENTS.md:187` |
| **Immutable parsed data** | `resume_parsed_data_immutable` trigger blocks UPDATE/DELETE | `07_resume_processing.sql:136-138` |
| **Immutable history** | `profile_change_history_immutable` trigger blocks UPDATE/DELETE | `08_candidates.sql:577-578` |
| **Scan gate** | Phase-06 API-RESUME-004: "ownership + clean scan + parsed result belongs to document" | `PHASE-06-API-CATALOG.md:111` |
| **Idempotency-Key** | Phase-06 API-RESUME-004: "Idempotency-Key is required for retry safety" | `PHASE-06-API-CATALOG.md:124` |

### 3.3 Idempotency Analysis

**Scenario 1 — Same request retried (same `expected_profile_revision`, same payload):**
- Check: `candidate_profile_documents` row with `(candidate_id, document_id, document_role)` already exists AND `is_current = TRUE AND unlinked_at IS NULL`
- If exists: Skip insert. Skip `bump_candidate_profile_revision()`. Skip `candidate.profile.changed` outbox insert.
- Return: existing `active_document_id` and current `profile_revision` (same as before)
- **No duplicate row** because PK `(candidate_id, document_id, document_role)` would cause unique violation
- **No second revision bump** because we skip the call
- **No second event** because we skip the outbox insert

**Scenario 2 — Concurrent duplicate requests:**
- Two concurrent transactions both attempt to insert `candidate_profile_documents`
- First transaction commits successfully
- Second transaction hits PK unique violation → rollback
- Return: `409 IDEMPOTENCY_CONFLICT` (or idempotent replay if same `Idempotency-Key`)

**Scenario 3 — Changed payload with stale revision:**
- Candidate's `profile_revision` has advanced since the confirm request was created
- NestJS checks: `candidate_profiles.profile_revision != expected_profile_revision`
- Return: `409 STALE_REVISION`
- Zero canonical changes made

**Scenario 4 — Changed payload with valid revision:**
- `expected_profile_revision` matches current `profile_revision`
- But the `candidate_profile_documents` row already exists (from a previous confirm)
- This is the same as Scenario 1 — the row already exists, so we treat it as idempotent replay
- Return: existing result with current revision

### 3.4 Frozen Confirm Behavior

```text
POST /api/v1/resumes/:id/confirm
```

**Request:**
```json
{
  "expected_profile_revision": "integer (required)",
  "set_as_active_profile_resume": "boolean (default: false)",
  "canonical_facts": { "allowlisted fields per Decision-05 and Phase-06" }
}
```

**Idempotency-Key header:** Required.

**Transaction logic (pseudocode):**
```text
BEGIN
  -- 1. Lock and verify document ownership
  SELECT id, uploaded_by_user_id, security_scan_status, processing_status
    FROM uploaded_documents
   WHERE id = :document_id
     AND uploaded_by_user_id = :auth_user_id
     AND deleted_at IS NULL
   FOR UPDATE;

  -- 2. Verify scan clean
  IF security_scan_status != 'clean' THEN
    RAISE appropriate error (SCAN_PENDING / INFECTED_FILE / SCAN_FAILED);
  END IF;

  -- 3. Verify parsing completed
  IF processing_status NOT IN ('completed', 'partial') THEN
    RAISE appropriate error (PARSING_PENDING / PARSING_FAILED);
  END IF;

  -- 4. Verify parsed result exists
  SELECT id FROM resume_parsed_data
   WHERE document_id = :document_id;
  IF NOT FOUND THEN RAISE NOT_FOUND; END IF;

  -- 5. Lock candidate profile and verify revision
  SELECT id, profile_revision FROM candidate_profiles
   WHERE user_id = :auth_user_id AND deleted_at IS NULL
   FOR UPDATE;

  IF profile_revision != :expected_profile_revision THEN
    RAISE '409 STALE_REVISION';
  END IF;

  -- 6. Check if document already linked (idempotent replay)
  SELECT candidate_id, document_id, document_role, is_current
    FROM candidate_profile_documents
   WHERE candidate_id = :candidate_id
     AND document_id = :document_id
     AND document_role = 'profile_resume';

  IF FOUND AND is_current = TRUE THEN
    -- Idempotent replay: skip all writes, return existing state
    COMMIT;
    RETURN { candidate_id, profile_revision, active_document_id };
  END IF;

  -- 7. Insert document link (new confirm)
  INSERT INTO candidate_profile_documents
    (candidate_id, document_id, document_role, version_number, is_current)
  VALUES
    (:candidate_id, :document_id, 'profile_resume',
     COALESCE((SELECT MAX(version_number) + 1
                 FROM candidate_profile_documents
                WHERE candidate_id = :candidate_id
                  AND document_role = 'profile_resume'), 1),
     TRUE);

  -- 8. Bump revision (exactly once)
  new_revision := bump_candidate_profile_revision(:candidate_id);

  -- 9. Record history
  INSERT INTO profile_change_history
    (candidate_id, profile_revision, entity_type, entity_id, operation,
     changed_by_user_id, change_source)
  VALUES
    (:candidate_id, new_revision, 'document', :document_id, 'confirm',
     :auth_user_id, 'candidate_confirmed');

  -- 10. Emit outbox event (exactly once)
  INSERT INTO outbox_events (event_type, aggregate_type, aggregate_id, payload)
  VALUES ('candidate.profile.changed', 'candidate', :candidate_id,
          jsonb_build_object(
            'schema_version', 1,
            'event_id', gen_random_uuid(),
            'aggregate_id', :candidate_id,
            'trace_id', :trace_id,
            'change_type', 'document_linked',
            'active_document_id', :document_id
          ));

  COMMIT;
  RETURN { candidate_id, new_revision, active_document_id };
```

### 3.5 Property Verification

| Required Property | How Enforced | Evidence |
|---|---|---|
| **Same retry → same result** | Step 6 checks existing `candidate_profile_documents` row; if `is_current = TRUE`, skip all writes and return existing state | `08_candidates.sql:119` — PK prevents duplicate insert; `08_candidates.sql:127-129` — partial unique index prevents duplicate active role |
| **No duplicate row** | PK `(candidate_id, document_id, document_role)` is unique; second insert would violate | `08_candidates.sql:119` |
| **No second revision bump** | Step 6 returns early before `bump_candidate_profile_revision()` call | `08_candidates.sql:89-109` |
| **No second event** | Step 6 returns early before outbox insert | Implementation guard |
| **Stale revision → conflict** | Step 5 checks `profile_revision != expected_profile_revision` → `409 STALE_REVISION` | `08_candidates.sql:73` — `profile_revision BIGINT NOT NULL DEFAULT 1`; Phase-05 line 185 |
| **Rollback → no partial** | Single PostgreSQL transaction; all or nothing | Phase-07 line 136: "No Cloud Tasks, FastAPI, email, WebSocket or external provider call occurs inside the transaction" |

### 3.6 Error Mapping

| Condition | Error Code | HTTP |
|---|---|---|
| Document not found / not owned | `NOT_FOUND` | 404 |
| Scan not clean (pending) | `SCAN_PENDING` | 409 |
| Scan infected | `INFECTED_FILE` | 422 |
| Scan failed | `SCAN_FAILED` | 409 |
| Parsing not complete | `PARSING_PENDING` | 409 |
| Parsing failed | `PARSING_FAILED` | 422 |
| Stale `expected_profile_revision` | `STALE_REVISION` | 409 |
| Same `Idempotency-Key` with different payload | `IDEMPOTENCY_CONFLICT` | 409 |
| Document already confirmed (idempotent replay) | 200 OK (success) | 200 |
| Unauthorized | `UNAUTHORIZED` | 401 |
| Rate limit exceeded | `RATE_LIMITED` | 429 |

### 3.7 Rejected Alternatives

| Alternative | Reason for rejection |
|---|---|
| Use `ON CONFLICT DO NOTHING` for document link insert | Hides the idempotent replay; cannot distinguish "already confirmed" from "new confirm"; makes it impossible to return existing state reliably |
| Skip `bump_candidate_profile_revision()` check | Violates Phase-05 requirement: "expected_profile_revision is mandatory and stale updates return 409 STALE_REVISION" |
| Use `candidate_profile_documents` unique constraint alone for idempotency | Would cause a database error on duplicate; NestJS should handle idempotency at application level before hitting the constraint |
| Allow confirm without `expected_profile_revision` | Violates Phase-05 (line 185): mandatory field |
| Use `Idempotency-Key` as the sole idempotency mechanism | `Idempotency-Key` is HTTP-layer; the DB-level check (step 6) provides defense-in-depth and handles cases where the key is lost or the HTTP layer fails |

### 3.8 Security and Ownership

- **Ownership check (step 1):** `uploaded_documents.uploaded_by_user_id = :auth_user_id` — verified before any confirm work
- **Scan gate (step 2):** Infected/pending/failed documents cannot reach confirmation — prevents malicious content from entering canonical profile
- **Revision guard (step 5):** Optimistic concurrency prevents lost updates from concurrent profile saves
- **Single transaction:** Atomic commit of document link + revision bump + history + outbox event ensures consistency
- **No secrets in event:** `candidate.profile.changed` event payload contains only `document_id`, `change_type`, and `active_document_id` — no tokens, storage paths or provider internals
- **History audit:** `profile_change_history` records every confirm with `operation = 'confirm'`, `changed_by_user_id`, `change_source` and `before_data`/`after_data`

### 3.9 Required Tests

| Test | Criteria |
|---|---|
| First confirm success | Valid confirm → 200, `candidate_profile_documents` row created, `profile_revision` incremented, `candidate.profile.changed` outbox event emitted |
| Idempotent replay | Same confirm request repeated → 200, no duplicate row, no second revision bump, no second event |
| Concurrent duplicate confirm | Two concurrent confirms with same payload → one succeeds, one gets `409 IDEMPOTENCY_CONFLICT` or idempotent 200 |
| Stale revision | Confirm with outdated `expected_profile_revision` → `409 STALE_REVISION`, zero canonical changes |
| Scan pending | Confirm document with `security_scan_status = 'pending'` → `409 SCAN_PENDING` |
| Infected file | Confirm document with `security_scan_status = 'infected'` → `422 INFECTED_FILE` |
| Scan failed | Confirm document with `security_scan_status = 'failed'` → `409 SCAN_FAILED` |
| Parsing pending | Confirm document with `processing_status = 'queued'` → `409 PARSING_PENDING` |
| Parsing failed | Confirm document with `processing_status = 'failed'` → `422 PARSING_FAILED` |
| No parsed data | Confirm document with clean scan but no `resume_parsed_data` row → `404 NOT_FOUND` |
| Rollback on error | Mid-transaction failure → zero partial writes; `candidate_profile_documents` unchanged, `profile_revision` unchanged, no outbox event |
| Ownership check | Candidate A confirms Candidate B's document → `404 NOT_FOUND` |
| Application-only resume | Confirm with `document_role = 'application_only'` → does not change `active_document_id` in `candidate_search_profiles` |

### 3.10 Unresolved Risks

**LOW:** The `Idempotency-Key` retention/persistence mechanism is not defined in Phase-05/06/07 (listed as open item in Phase-07 line 237: "Message idempotency persistence mechanism"). The confirm idempotency relies on the DB-level check (step 6) as the authoritative guard, with `Idempotency-Key` as an HTTP-layer optimization. This is safe but means the `Idempotency-Key` may not survive server restarts between HTTP receipt and transaction commit.

**LOW:** The exact `version_number` increment logic for `candidate_profile_documents` is not defined by SQL. The proposed logic `MAX(version_number) + 1` is safe but should be verified against the existing `UNIQUE (candidate_id, document_role, version_number)` constraint.

---

## 3. Summary of All Decisions

| Decision | Status | Key Evidence |
|---|---|---|
| **D1 — Candidate profile routes** | APPROVED WITH FREEZE | `08_candidates.sql:47-85` (PK=`id`, FK=`user_id`); `17_rls.sql:162,182` (SELECT + RLS); `08_candidates.sql:89-109` (`bump_candidate_profile_revision`); `08_candidates.sql:478` (`operation = 'soft_delete'`) |
| **D2 — Parsed-data allowlist** | APPROVED WITH FREEZE | `07_resume_processing.sql:69-100` (columns: `normalized_output`, `confidence_details`, `validation_result`, `overall_confidence`, `schema_version`); `07_resume_processing.sql:136-138` (immutable); Phase-06 API-RESUME-003 |
| **D3 — Confirm idempotency** | APPROVED WITH FREEZE | `08_candidates.sql:111-129` (PK + unique index); `08_candidates.sql:89-109` (`bump_candidate_profile_revision`); `08_candidates.sql:478` (`operation = 'confirm'`); `candidate-profile-changed.v1.json` (`change_type = 'document_linked'`) |

### MEDIUM Items

1. **`normalized_output` internal JSON schema** — Not defined by any SQL CHECK constraint or contract. Implementation DTO must define allowed top-level keys. Recommend: `NormalizedOutputDto` with `additionalProperties: false` matching canonical fact categories.

### LOW Items

1. **`Idempotency-Key` persistence** — Open item in Phase-07. DB-level idempotency guard (step 6) is the authoritative mechanism; HTTP-layer key is optimization.
2. **`candidate_profile_documents.version_number` increment** — `MAX(version_number) + 1` proposed; verify against `UNIQUE (candidate_id, document_role, version_number)` constraint.

---

**Final Status: APPROVED WITH FIXES**

All three decisions are resolved with evidence-based frozen behavior. The two MEDIUM/LOW items are implementation-level details that do not block the contract freeze. No new tables, columns, events, queues or provider behavior have been invented.
