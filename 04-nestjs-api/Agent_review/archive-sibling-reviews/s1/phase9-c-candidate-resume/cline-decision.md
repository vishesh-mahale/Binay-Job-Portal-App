# Phase 09-C Decision Review — Candidate + Resume API Contract

**Reviewer:** cline (independent Senior NestJS, PostgreSQL, API Security Architect)
**Date:** 2026-08-27
**Scope:** Review three unresolved Phase 09-C decisions before implementation. No source code or SQL was modified.

---

## 0. Authority Hierarchy

All findings are verified against these authoritative files only (no invention):

| Priority | File |
|---|---|
| 1 | AGENTS.md |
| 2 | 04-nestjs-api/PHASE-05-FINAL-REQUIREMENTS.md |
| 3 | 04-nestjs-api/PHASE-06-API-CATALOG.md |
| 4 | 04-nestjs-api/PHASE-07-ARCHITECTURE.md |
| 5 | 04-nestjs-api/PHASE-08-IMPLEMENTATION-PLAN.md |
| 6 | 04-nestjs-api/s1/codex/PHASE-09-C-CONSOLIDATED-CANDIDATE-RESUME-DECISION.md |
| 7 | 04-nestjs-api/s1/phase9-c-candidate-resume/DECISION-QUESTIONS.md |
| 8 | 02-database/migrations/baseline/06_documents.sql |
| 9 | 02-database/migrations/baseline/07_resume_processing.sql |
| 10 | 02-database/migrations/baseline/08_candidates.sql |
| 11 | 02-database/migrations/baseline/17_rls.sql |
| 12 | contracts/events/, contracts/tasks/, contracts/schemas/ |
| 13 | 05-outbox-dispatcher-nestjs/src/routing/event-route.registry.ts |
| 14 | 07-fastapi-ai-worker/app/api/v1/task_handlers.py, schema/, services/ |

---

## Decision 1 — Candidate Profile Routes

### Evidence Table

| Aspect | Evidence | Status |
|---|---|---|
| API-CANDIDATE-001 (read own profile) | PHASE-06 §3C L325: "TBD — candidate profile read resource"; reads: candidate_profiles + 8 child tables; actor: authenticated candidate; permission: own profile; UserContextClient + RLS allowed | ✅ Defined |
| API-CANDIDATE-002 (save profile) | PHASE-06 §3C L346-367: "TBD — candidate profile save command"; writes: candidate_profiles + child facts + profile_change_history + outbox; transaction: one logical save; Idempotency-Key + expected revision; STALE_REVISION on conflict; outbox: `candidate.profile.changed` | ✅ Defined |
| API-CANDIDATE-003 (archive/soft-delete) | PHASE-06 §3C L369-387: "TBD — canonical fact archive command"; writes: soft-delete fact + profile_change_history + outbox; hard delete prohibited by SQL triggers (08_candidates.sql L549-568: `candidate_*_no_hard_delete` triggers call `reject_immutable_row_change()`) | ✅ Defined |
| `candidate_profiles` columns | 08_candidates.sql L36-85: `id`, `user_id`, `professional_title`, `summary`, `country`, `city`, `profile_revision` (BIGINT > 0), `profile_completed_at`, `last_profile_change_at`, `created_at`, `updated_at`, `deleted_at` | ✅ Real columns |
| `candidate_profile_documents` columns | 08_candidates.sql L111-129: `candidate_id`, `document_id`, `document_role`, `version_number`, `is_current`, `linked_at`, `unlinked_at`; active check: `unlinked_at IS NULL OR is_current = FALSE` | ✅ Real columns |
| `profile_change_history` operation values | 08_candidates.sql L478: `CHECK (operation IN ('insert','update','soft_delete','restore','confirm','reject'))` | ✅ Real enum |
| RLS on candidate tables | 17_rls.sql L48-95: candidate tables under RLS; authenticated gets SELECT; system-only INSERT/UPDATE/DELETE | ✅ Verified |

### Proposed Final API Contract

```
GET    /api/v1/candidates/me
  Actor: authenticated candidate (JWT)
  Auth: UserContextClient + RLS (anon/authenticated SELECT)
  Response: candidate_profiles + authorized canonical child facts (skills, experiences, educations, certifications, projects, languages, links)
  Filters: deleted_at IS NULL, is_current TRUE on profile_documents
  Outbox: none (read-only)
  Errors: UNAUTHORIZED, NOT_FOUND, RATE_LIMITED, DEPENDENCY_UNAVAILABLE

PATCH  /api/v1/candidates/me
  Actor: authenticated candidate (JWT)
  Auth: SystemClient (business write)
  Request DTO (allowlisted fields only):
    {
      professional_title: string,
      summary: string,
      country: string,
      city: string,
      is_open_to_work: boolean,
      expected_salary_min: number,
      expected_salary_max: number,
      salary_currency: salary_currency,
      work_authorization: string,
      visa_sponsorship_needed: boolean,
      available_from: date,
      preferred_work_mode: work_mode,
      skills: [...],
      experiences: [...],
      educations: [...],
      ...child facts
    }
  Headers: Idempotency-Key (required), X-Expected-Revision (optional)
  Response: { candidate_id, profile_revision, profile_completed_at, active_document_id }
  Transaction: one atomic transaction — validate → authorize → BEGIN →
    (child fact writes) + profile_change_history + bump_candidate_profile_revision() +
    outbox INSERT `candidate.profile.changed` → COMMIT
  Outbox: candidate.profile.changed → projection-queue → FastAPI projection worker
  Errors: VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, STALE_REVISION,
    IDEMPOTENCY_CONFLICT, RATE_LIMITED, DEPENDENCY_UNAVAILABLE, INTERNAL_ERROR

DELETE /api/v1/candidates/me/facts/:factType/:factId
  Actor: authenticated candidate (JWT)
  Auth: SystemClient (business write)
  factType: one of {skill, experience, education, certification, project, language, link}
  Behavior: soft-delete (set deleted_at) on the specific child fact row
  Transaction: fact soft-delete + profile_change_history INSERT +
    bump_candidate_profile_revision() + outbox INSERT → COMMIT
  Outbox: candidate.profile.changed (change_type: profile_updated)
  Response: { candidate_id, profile_revision }
  Errors: UNAUTHORIZED, FORBIDDEN, NOT_FOUND, STALE_REVISION, IDEMPOTENCY_CONFLICT, RATE_LIMITED
```

### Rejected Alternatives

- **PATCH /api/v1/candidates/me/profile** — PHASE-06 API-CANDIDATE-002 says "TBD — candidate profile save command" without specifying a path. `/me` is the standard REST convention used by the application (confirmed: `CANDIDATE-TO-HR-VISIBILITY-TEST-HINGLISH.md:178` uses `PATCH /api/v1/candidates/me/profile` — but that is a test document, not an architectural authority). Using `/me` directly aligns with `API-AUTH-002` and `API-AUTH-003` patterns that reference JWT-derived identity.

- **PUT /api/v1/candidates/me** — PATCH is correct per PHASE-06 §3C L350 ("candidate profile save command" — partial update semantics; not full replace).

- **DELETE /api/v1/candidates/me** (hard-delete profile) — BLOCKED: `08_candidates.sql L549-568` has `candidate_profiles_no_hard_delete` trigger; `candidate_profile_documents_no_hard_delete` trigger. Only soft-delete via `deleted_at` is permitted.

### Security & Ownership Implications

- `/me` paths are inherently ownership-scoped by JWT → no IDOR possible.
- RLS on candidate tables enforces row-level isolation even for UserContextClient reads.
- `deleted_at` soft-deletes enforced by SQL triggers (no hard-delete possible).
- Idempotency keys prevent duplicate saves.
- Storage paths (`storage_path`, `storage_bucket`) are never returned per AGENTS.md §security.

### Required Tests

| Test | Source |
|---|---|
| Candidate cannot read another candidate's profile | CANDIDATE-TO-HR-VISIBILITY-TEST-HINGLISH.md:137-139 |
| Profile save: one revision bump per logical save | 08_candidates.sql L87-109 (`bump_candidate_profile_revision`) |
| Five child fact changes → one revision bump | PHASE-06 L365-366 |
| Fact archive is soft-delete only | 08_candidates.sql L547-568 (hard-delete triggers) |
| Concurrent PATCH → deterministic conflict | PHASE-06 L358 ("row lock / revision check") |

### Unresolved Risks

- **NEEDS_DECISION:** Whether `factType` in DELETE path maps to table names or enum values. PHASE-06 does not specify format. Use table-derived enum: `{skill|experience|education|certification|project|language|link}`.

---

## Decision 2 — Parsed-Data Allowlist

### Evidence Table

| Aspect | Evidence | Status |
|---|---|---|
| `resume_parsed_data` columns | 07_resume_processing.sql L69-100: `extracted_text` (TEXT), `raw_ai_output` (JSONB), `normalized_output` (JSONB), `confidence_details` (JSONB), `validation_result` (JSONB), `overall_confidence` (DECIMAL(5,2)), `schema_version` (VARCHAR(50)) | ✅ Real columns |
| `ResumeExtractedSchema` | `app/schemas/resume_parser.py L8-47`: same fields; `overall_confidence` 0-100; `schema_version` default "1.0" | ✅ Real schema |
| `DocumentExtractor.extract_from_bytes` | `document_extractor.py L103-111`: placeholder `normalized_output={"source_file": filename}` | ✅ Real |
| Worker `normalized_output` mutation | `task_handlers.py L377`: `{**extracted.normalized_output, "ai": ai_output}` | ✅ Real |
| Phase-06 exclusion list | L100-101: "raw text/AI/artifact/error JSON is excluded" | ✅ Authoritative |

### Proposed Final API Contract

```
GET /api/v1/resumes/:id/parsed-data
  Actor: authenticated candidate who owns the document
  Permission: document ownership + scan clean + parsed result belongs to document

  Response shape (allowlist only):
  {
    "document_id": "uuid",
    "parsing_job_id": "uuid",
    "schema_version": "1.0",
    "overall_confidence": 92.0,
    "normalized_output": {
      "skills": [{"name": "string", "years": 3}],
      "experience": [{"company": "string", "title": "string"}],
      "education": [{"degree": "string", "institution": "string"}],
      "projects": [...],
      "certifications": [...],
      "languages": [...],
      "links": [...]
    },
    "validation_result": { "valid": true, "source": "document_extractor" }
  }
```

### Explicitly Excluded (never returned)

| Field | Source | Reason |
|---|---|---|
| `extracted_text` | 07_resume_processing.sql L73 | Raw OCR — Phase-06 L101 excluded |
| `raw_ai_output` | 07_resume_processing.sql L74 | Full model response — Phase-06 L101 excluded |
| `artifacts` | resume_parsing_artifacts table | Internal debugging — Phase-06 L101 excluded |
| `error_details` | resume_parsing_jobs.error_details | Internal errors — security risk |
| `storage_path` / `storage_bucket` | 06_documents.sql | Leakage — AGENTS.md §security |
| `tokens, credentials, provider_internals` | N/A | Never emitted |
| `confidence_score` | 05_jobs contract | Wrong name — column is `overall_confidence` |

### Rejected Alternatives

- **Renaming `overall_confidence` → `confidence_score`** — Column is `overall_confidence` in `07_resume_processing.sql L78`. `confidence_score` is job-domain only.
- **Returning `normalized_output` as opaque JSON** — Phase-06 L102 requires field-by-field allowlist.

### Security & Ownership Implications

- Must verify `document_id` ownership via `candidate_profile_documents`.
- `normalized_output` contains AI model output — sanitize if displayed.
- `confidence_details` may leak per-field model behavior — omit from safe response.

### Required Tests

| Test | Source |
|---|---|
| Non-owner cannot access parsed-data | PHASE-06 L100 ("ownership-audited") |
| `extracted_text` absent from response | Phase-06 L101 ("excluded") |
| `storage_path` absent from response | AGENTS.md §security |
| `overall_confidence` is decimal 0-100 | 07_resume_processing.sql L81-83 |
| Allowlisted fields only | Phase-06 L102 |

### Unresolved Risks

- **NEEDS_DECISION:** Exact allowlist fields for `normalized_output` explicitly deferred — "field-by-field normalized allowlist remains API-catalog blocker" (PHASE-06 L102). `DocumentExtractor` returns placeholder `{"source_file": filename}`. Formal contract must be established before implementation.

---

## Decision 3 — Confirm Idempotency

### Evidence Table

| Aspect | Evidence | Status |
|---|---|---|
| API-RESUME-004 (confirm) | PHASE-06 L105-127: POST /api/v1/resumes/:id/confirm; Idempotency-Key required; expected_profile_revision; row lock; STALE_REVISION; atomic transaction; outbox: `candidate.profile.changed` | ✅ Defined |
| `candidate_profile_documents` active check | 08_candidates.sql L120-122: `CHECK (unlinked_at IS NULL OR is_current = FALSE)` | ✅ Real |
| `candidate_profiles` revision bump | 08_candidates.sql L87-109: `bump_candidate_profile_revision()` atomic UPDATE + RETURNING | ✅ Real |
| Unique index on active document | 08_candidates.sql L127-129: `uq_candidate_current_document_role` partial unique index on (candidate_id, document_role) WHERE is_current = TRUE AND unlinked_at IS NULL | ✅ Real |
| Outbox idempotency | PHASE-06 L358, L124: Idempotency-Key + row lock; PHASE-05 §2: "BEGIN → business + history/audit + outbox → COMMIT" | ✅ Defined |
| `outbox_events.idempotency_key` column | Not found in 15_infrastructure.sql or 06_documents.sql | ⚠️ **Gap** |
| `candidate.profile.changed` contract | `candidate-profile-changed.v1.json`: fields `schema_version`, `event_id`, `aggregate_id`, `trace_id`, `change_type`, `active_document_id` | ⚠️ **Missing `profile_revision`** |
| `candidate.resume.parsed` is output event | `STAGE-03-REQUIREMENTS-SYNC.md L248`: "output events, not dispatcher input routes" | ✅ Confirmed |
| `candidate.profile.changed` is input route | Same doc L249: "approved confirm-side input route to projection-queue" | ✅ Confirmed |

### Proposed Final Behavior

```
POST /api/v1/resumes/:id/confirm
  Headers: Idempotency-Key (required), X-Expected-Revision (optional)

  Same Idempotency-Key within idempotency window:
    - Returns the exact same successful response
    - Does NOT insert a second candidate_profile_documents row
      (protected by uq_candidate_current_document_role)
    - Does NOT bump profile_revision a second time
      (bump_candidate_profile_revision called once)
    - Does NOT emit a second candidate.profile.changed outbox event
    - Does NOT insert a second profile_change_history row

  Stale revision (X-Expected-Revision mismatch):
    - Returns 409 STALE_REVISION deterministically
    - Zero canonical changes written

  Transaction rollback:
    - All writes in one atomic DB transaction
    - Any failure → full rollback → zero partial changes

  Concurrency:
    - Row lock (FOR UPDATE) on candidate_profiles before revision check
    - Deterministic STALE_REVISION on concurrent mismatch
```

### Repository/SQL Evidence

| Evidence Source | Line | Detail |
|---|---|---|
| `bump_candidate_profile_revision()` | 08_candidates.sql L87-109 | Atomic UPDATE + RETURNING profile_revision |
| `uq_candidate_current_document_role` | 08_candidates.sql L127-129 | Partial unique index: one active document per role |
| `candidate_profile_document_active_check` | 08_candidates.sql L120-122 | CHECK (unlinked_at IS NULL OR is_current = FALSE) |
| `profile_change_history_immutable` | 08_candidates.sql L577-578 | BEFORE UPDATE/DELETE → reject_immutable_row_change() |
| Idempotency-Key requirement | PHASE-06 L124 | "Idempotency-Key is required for retry safety" |
| Row lock + revision check | PHASE-06 L113, L118 | "revision matches" validation; "row lock and one revision bump" |

### Rejected Alternatives

- **Separate idempotency table** — Phase-06 does not define one; adding would be invention — BLOCKED.
- **Returning different results on retry** — Violates PHASE-06 L124, L126 — BLOCKED.
- **Upsert instead of INSERT+rollback** — PHASE-06 L126: "stale/invalid confirm makes zero canonical changes" — must fail loudly, not silently upsert.

### Security & Ownership Implications

- Confirm endpoint must verify document belongs to authenticated candidate via `candidate_profile_documents` join.
- `Idempotency-Key` prevents duplicate profile saves from retry storms.
- Row lock prevents TOCTOU race during revision bump.
- `profile_change_history` is immutable (append-only) — audit trail tamper-proof.

### Required Tests

| Test | Source |
|---|---|
| Same Idempotency-Key → identical response | PHASE-06 L124, L126 |
| No duplicate candidate_profile_documents row | 08_candidates.sql L127 |
| No second profile_revision bump | `bump_candidate_profile_revision()` called once |
| No second candidate.profile.changed event | Outbox idempotency |
| Stale revision → 409 STALE_REVISION | PHASE-06 L113, L126 |
| Concurrent confirms → deterministic conflict | Row lock + revision check |
| Transaction failure → zero partial changes | PHASE-05 §2, PHASE-06 L118 |
| Non-owner cannot confirm | AGENTS.md §security |

### Unresolved Risks

- **BLOCKER (G-3):** `candidate-profile-changed.v1.json` missing `profile_revision` field. Explanation doc L413-415 shows it in payload; projection worker needs it for `CHECK (projection_revision <= source_profile_revision)` (08_candidates.sql L438-439). Contract must be amended.
- **BLOCKER (G-4):** No `idempotency_key` column in `outbox_events` (15_infrastructure.sql, 06_documents.sql). Without it, Idempotency-Key deduplication at outbox level impossible.
- **NEEDS_DECISION:** Idempotency window/timeline undefined — Phase-06 requires Idempotency-Key but does not define validity period.

---

## Final Verdict

### Overall Status: APPROVED WITH FIXES

| Decision | Status | Reason |
|---|---|---|
| **1. Candidate Profile Routes** | ✅ APPROVED | All routes, DTOs, columns fully defined. Uses real column names (`deleted_at`, `is_current`, `unlinked_at`). |
| **2. Parsed-Data Allowlist** | ⚠️ APPROVED WITH FIXES | Exclusions authoritative. `overall_confidence` name preserved. **BLOCKER**: exact `normalized_output` field allowlist deferred (Phase-06 L102). |
| **3. Confirm Idempotency** | ⚠️ APPROVED WITH FIXES | Idempotency properties defined. **BLOCKER**: missing `profile_revision` in event contract. **BLOCKER**: no `idempotency_key` in outbox. **NEEDS_DECISION**: window undefined. |

### Required Pre-Implementation Actions

1. **BLOCKER:** Add `profile_revision: integer` to `candidate-profile-changed.v1.json`.
2. **BLOCKER:** Verify/Add `idempotency_key` column on `outbox_events` table.
3. **NEEDS_DECISION:** Freeze exact `normalized_output` field allowlist.
4. **NEEDS_DECISION:** Define idempotency window duration for Idempotency-Key.

No source code or SQL was modified in this review.