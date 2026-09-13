# Consolidated Review: Resume Extraction Pipeline

**Source Reviews:** prompt.md, chatgpt.md, qoder.md, opencode-review.md, RESUME_EXTRACTION_AUDIT.md
**Date:** 2026-09-11
**Status:** RECONCILED — All findings verified against actual code, SQL, and product decisions

---

## Executive Summary

The resume extraction pipeline extracts only **7 fields** from a resume, while the database has **~75 candidate content columns**. Effective extraction-to-persistence coverage is **~1.3%**. The NestJS confirm endpoint (`POST /api/v1/resumes/:id/confirm`) has **3 independent SQL errors** that cause it to always fail with 500. Silent data loss occurs throughout the pipeline — the candidate sees a success message while zero facts are written.

The pipeline architecture is correct (upload → scan → parse → review → confirm → canonical). The gap is in completeness and correctness, not boundaries.

---

## Product Goal (Auto-Fill Rules)

### Rule 1: Auto-fill happens ONLY ONCE in candidate's life

```
1st Resume Upload → Extract → Auto-fill profile form → Candidate reviews/edits → Save
                                                              ↓
                                                    DONE (profile_completed_at = NOW())

2nd/3rd Resume Upload → Extract → Store in resume list ONLY → NO auto-fill
```

**Implementation:**
- Check `candidate_profiles.profile_completed_at` — if NULL → auto-fill allowed
- After 1st confirm → set `profile_completed_at = NOW()`
- Subsequent confirms → only link resume to `candidate_profile_documents`, never touch `candidate_profiles` columns or child fact tables

**Detection in code:**
```typescript
// resume.ts — confirm endpoint
const isFirstTime = !candidateProfile.profile_completed_at;

if (isFirstTime) {
    // AUTO-FILL: Update candidate_profiles, insert candidate_skills, experiences, etc.
    // Set profile_completed_at = NOW()
} else {
    // SUBSEQUENT: Only link resume as current document
    // DO NOT touch candidate_profiles columns
    // DO NOT insert candidate_skills/experiences/educations
}
```

### Rule 2: Only CLEAN files trigger auto-fill

```
Resume Upload → Security Scan (ClamAV)
    ↓
    ├── clean    → Resume parsing → Auto-fill (if 1st time) → Candidate review
    ├── infected → BLOCK: No parsing, no auto-fill, show warning, allow delete
    ├── pending  → Wait for scan result before any action
    └── failed   → Show error, no parsing
```

**Implementation:**
- Auto-fill is **conditional on `security_scan_status = 'clean'`**
- Infected/quarantined files → no parsing job created, no `normalized_output`, no auto-fill
- The scan check already exists at `resume.ts:104-107` — verify it blocks confirm for non-clean files
- Frontend must disable "Review & Confirm" button for infected/pending files (already partially done)

**Why this matters:**
- Infected file might contain malicious content that could influence LLM output
- No point auto-filling from a file that will be deleted
- Candidate should re-upload a clean file instead

### Combined Flow

```
Candidate uploads resume (1st time)
    ↓
Security Scan
    ├── infected → STOP. Show warning. No auto-fill.
    └── clean → Continue
        ↓
    Parse resume → Extract structured data
        ↓
    Auto-fill profile form (because profile_completed_at IS NULL)
        ↓
    Candidate reviews extracted data in form
        ↓
    Candidate edits if needed → Saves
        ↓
    profile_completed_at = NOW() → Auto-fill locked forever
        ↓
    Candidate uploads 2nd resume → Parse → Store in resume list ONLY
                                            (no auto-fill, profile already filled)
```

---

## Current End-to-End Flow

```
Resume Upload (Next.js → NestJS → uploaded_documents)
    ↓
Security Scan (outbox event → ClamAV → security_scan_status)
    ↓
INSERT resume_parsing_jobs (status='queued')
    ↓
Dispatcher → Worker: /internal/tasks/resume/parse
    ↓
OIDC → Idempotency → Claim Job → Security Check
    ↓
Download file → Validate size + magic bytes
    ↓
DocumentExtractor.extract_from_bytes() → ResumeExtractedSchema (text only)
    ↓
LLM call (7-field schema) → ai_output dict
    ↓
Build normalized_output (LOSSY — experience/education detail destroyed)
    ↓
INSERT resume_parsed_data (immutable)
    ↓
Candidate sees raw JSON textarea → edits → confirms
    ↓
NestJS confirm → 3 SQL errors → TRANSACTION ABORTS → 500 returned
    ↓
Zero facts written, candidate sees "success"
```

---

## Critical Findings

### BLOCKERS (Must Fix Before Anything Works) — ALL VERIFIED

| # | Finding | Source | Verified At |
|---|---|---|---|
| B-1 | **`confirm` endpoint always fails** — `profile_change_history.change_source = 'candidate_confirmed'` is invalid enum. Correct: `profile_fact_source` enum has `candidate_manual`, `resume_ai`, `candidate_corrected`, etc. `'candidate_confirmed'` belongs to `profile_fact_verification_status`. | qoder | `resume.ts:125` ✅ |
| B-2 | **Same invalid enum on all 6 fact INSERTs** — `primary_source_type = 'candidate_confirmed'` passed to every `candidate_*` row. All are `profile_fact_source NOT NULL`. | qoder | `resume.ts:24` → `:28,32,36,40,44,48` ✅ |
| B-3 | **Non-existent columns on `candidate_experiences`** — INSERT references `source_document_id, source_parsing_result_id` which don't exist on this table (only on `candidate_projects`, `candidate_languages`, `candidate_awards`). | qoder | `resume.ts:32` ✅ — SQL verified |
| B-4 | **Silent data loss in `insertConfirmedFacts`** — every loop uses bare `continue` on shape mismatch (no log, no error). Worker sends `skills: ["Python"]` (strings), NestJS expects `item.name` (objects). Result: zero facts written, confirm returns 200 success. | qoder | `resume.ts:26,31,35,39,43,47` ✅ |
| B-5 | **Skills shape mismatch** — Worker outputs `skills: ["Python", "FastAPI"]` (flat string array). NestJS `insertConfirmedFacts` expects `skills: [{name: "Python"}]` (object array with `.name` property). Every skill silently skipped via bare `continue`. | reconciled | `task_handlers.py:397` vs `resume.ts:26` ✅ |

### CRITICAL GAPS (Must Fix for Production)

| # | Finding | Impact |
|---|---|---|
| C-1 | **LLM schema is 7 fields** — `name, email, phone, skills[], experience_years, current_title, education[]`. DB has ~75 columns. 90% of resume detail discarded. | Cannot autofill profile |
| C-2 | **Experience data destroyed** — `experience_years: number` replaces per-role detail (company, title, dates, responsibilities). Work history irrecoverably lost in immutable `resume_parsed_data`. | Single most valuable resume section wasted |
| C-3 | **Education not structured** — `education[] = ["B.Tech CS"]`. DB expects `institution_name`, `degree`, `field_of_study`, dates, grade. | Every education row silently dropped |
| C-4 | **No canonical fact persistence** — After parsing, no code writes to `candidate_skills`, `candidate_experiences`, `candidate_educations`, etc. | Pipeline dead-ends at parsed data |
| C-5 | **No evidence table writes** — 4 evidence tables exist (`candidate_skill_evidence`, etc.) but are never written to. Provenance trail missing. | Cannot trace facts to source |
| C-6 | **normalized_output is lossy** — `experiences: [{"years_total": N}]`, `educations: [{"raw": "..."}]`. All structured detail lost. | Downstream consumers get useless shapes |
| C-7 | **Writer/reader key mismatch in projection** — `projection_service.py:137` reads `experience_years` (never written), `:148` reads `education` (worker writes `educations`). Fallbacks never fire. | `total_experience_years = NULL`, `highest_education_level = NULL` for all resume-only candidates |
| C-8 | **No typing/validation anywhere** — `raw_ai_output`, `normalized_output` are `Dict[str, Any]`. Malformed-but-parseable JSON accepted. Empty LLM response `{}` → all-null row marked completed. | Garbage in, garbage out, marked as success |

### HIGH-PRIORITY GAPS

| # | Finding | Impact |
|---|---|---|
| H-1 | **No summary extracted** — `candidate_profiles.summary` exists but LLM doesn't extract it | Profile incomplete |
| H-2 | **No links extracted** — `candidate_links` table exists (LinkedIn, GitHub) | Professional presence lost |
| H-3 | **No certifications** — `candidate_certifications` table exists | Certifications lost |
| H-4 | **No projects** — `candidate_projects` table exists | Portfolio lost |
| H-5 | **No languages** — `candidate_languages` table exists | Language skills lost |
| H-6 | **No location** — city/state/country in DB but not extracted | Location-based search broken |
| H-7 | **Contact info not persisted** — name/email/phone extracted but never saved to `users` or `candidate_profiles` | No autofill |
| H-8 | **`overall_confidence` defaults to 100.0** — text extraction success ≠ candidate info correct | Misleading confidence |
| H-9 | **AI failure recorded as success** — `{"fallback": True}` → `mark_completed` | Candidates see empty review |
| H-10 | **`AIProviderError` re-raised bare** — `mark_failed` never called, job stuck `processing` forever | No dead-letter sweeper |
| H-11 | **`RateLimitError` not caught as `AIProviderError`** — 429 → `{"fallback": True}` → `mark_completed` | Transient error = permanent data loss |
| H-12 | **No attempt guard on claim** — 4th claim violates `CHECK (attempt_number <= max_attempts)` → raw DB error | Not a clean terminal state |
| H-13 | **`available_at` ignored** — no exponential backoff against rate-limited provider | Hot-loop retries |
| H-14 | **`failed` jobs re-claimable** — `WHERE status NOT IN ('completed','cancelled')` includes `failed` | Resurrected zombie jobs |
| H-15 | **OCR is dead code** — `ocr_image()` exists but has zero call sites. Scanned PDF → empty text → `mark_failed` | Common Indian resume format unsupported |
| H-16 | **DOCX drops tables/headers/footers** — only reads `document.paragraphs` | Contact info in headers lost |
| H-17 | **Hard page limit (10)** — 12-page CV = total failure instead of partial parse | `partial` status plumbed but never emitted |
| H-18 | **`.doc` accepted by frontend, rejected by worker** | Upload succeeds, parse always fails |
| H-19 | **No `normalized_output` contract** — `contracts/schemas/` has no resume output schema | Violates AGENTS.md |
| H-20 | **`domain/enums.py` diverges from SQL** — `ProfileFactSource` has 0/5 overlap with SQL enum | Landmine for future code |
| H-21 | **No prompt/model version tracking** — `prompt_version` always NULL, `parser_model='pending'` (hardcoded placeholder at `task_handlers.py:162`, never updated to actual model name) | Cannot re-parse version-specific rows |
| H-22 | **`to_tsvector('english')` only** — Hindi/Tamil/Telugu resumes indexed as noise | Multilingual broken |
| H-23 | **Skill alias matching ignored** — `skills.aliases JSONB` exists but `resume.ts:27` only matches slug | "React.js" ≠ "React" ≠ "ReactJS" |
| H-24 | **`candidate.resume.parsed` event emitted into void** — no dispatcher route | Dead event |
| H-25 | **NULL-overwrite destroys candidate data** — confirm always writes all `ALLOWED_PROFILE_FIELDS` including nulls | Candidate-entered "Senior Backend Engineer" erased to NULL if LLM returns null |

---

## Database Mapping: Resume → LLM → DB

### What the LLM Currently Extracts vs What DB Needs

| Resume Info | Current LLM | DB Table | DB Column | Status |
|---|---|---|---|---|
| Full name | `name` (string) | `users` | `first_name`, `middle_name`, `last_name` | ⚠️ extracted, never persisted, wrong target |
| Email | `email` (string) | `users` | `email` (CITEXT UNIQUE — login credential) | ⚠️ extracted, must NOT auto-write |
| Phone | `phone` (string) | `users` | `phone` (VARCHAR(20)) | ⚠️ extracted, no E.164 normalization |
| Current title | `current_title` | `candidate_profiles` | `professional_title` | ⚠️ only single title |
| Total experience | `experience_years` (number) | `candidate_search_profiles` | `total_experience_years` | ⚠️ writer/reader key mismatch |
| Skills | `skills[]` (strings) | `candidate_skills` | `custom_skill_name` or `skill_id` | ⚠️ names only, no proficiency/years |
| Education | `education[]` (strings) | `candidate_educations` | `institution_name`, `degree`, etc. | ❌ raw strings → silently dropped |
| Summary | — | `candidate_profiles` | `summary` | ❌ not extracted |
| Location | — | `candidate_profiles` | `city`, `state`, `country` | ❌ not extracted |
| Experience detail | — | `candidate_experiences` | `company_name`, `job_title`, dates, etc. | ❌ not extracted (destroyed by `experience_years`) |
| Certifications | — | `candidate_certifications` | `name`, `issuer`, etc. | ❌ not extracted |
| Projects | — | `candidate_projects` | `title`, `technologies`, etc. | ❌ not extracted |
| Languages | — | `candidate_languages` | `language_name`, `proficiency` | ❌ not extracted |
| Awards | — | `candidate_awards` | `title`, `issuer`, etc. | ❌ not extracted |
| Links | — | `candidate_links` | `link_type`, `url` | ❌ not extracted |
| Evidence | — | `candidate_*_evidence` | `extracted_value`, `confidence_score` | ❌ tables exist, zero INSERTs |

---

## Conflicts Requiring Decision

### C-1: `candidate_experiences.start_date DATE NOT NULL` vs "never fabricate dates"

- **SQL:** `start_date DATE NOT NULL`
- **Prompt:** "don't fabricate exact dates"
- **Resume reality:** "2020 – 2023", "Summer 2021", "5+ years"
- **Resolution:** LLM returns `PartialDate{raw, year, month, day, precision}`. NestJS applies ONE widening rule: `year` → `YYYY-01-01`, `year_month` → `YYYY-MM-01`, `exact` → as-is. Verbatim `PartialDate` preserved in evidence.

### C-2: Should AI-extracted identity data touch `users.email`?

- `users.email` is the Supabase Auth login identifier
- Auto-writing would risk account takeover, UNIQUE collision, bypass verification
- **Resolution:** Email → display only, never auto-write. Name → suggest only, write on confirm when existing is empty. Phone → suggest, normalize to E.164, write on confirm.

### C-3: What should `primary_source_type` / `verification_status` be on confirm?

- `primary_source_type` = where the value came from (`resume_ai`, `candidate_corrected`, `candidate_manual`)
- `verification_status` = how much it's trusted (`candidate_confirmed`)
- **Resolution:** `primary_source_type = 'resume_ai'` if candidate accepted AI value verbatim; `'candidate_corrected'` if edited; `'candidate_manual'` if typed from scratch. `verification_status = 'candidate_confirmed'` in all cases.

### C-4: Dead `normalized_output.ai` shim

- `candidate.ts:146-157` reads `raw.ai` — but worker writes to `raw_ai_output.ai`, never `normalized_output.ai`
- `projection_service.py:89` has same dead expectation
- **Resolution:** Delete the dead shim. Align both readers to flat shape.

### C-5: `.doc` accepted by frontend, rejected by worker

- Frontend: `accept=".pdf,.doc,.docx"`. Worker: raises `ValueError` for `.doc`
- **Resolution:** Remove `.doc` from accept list (real `.doc` support = LibreOffice on Cloud Run = separate effort).

### C-6: Three competing `fact_sources` vocabularies

- SQL enum: `candidate_manual`, `resume_ai`, etc.
- `projection_service.py`: `"confirmed_profile"`, `"latest_active_resume"`
- `08_candidates_Explanation.md`: `"canonical_confirmed"`, `"active_resume"`
- **Resolution:** Use SQL `profile_fact_source` vocabulary everywhere.

---

## Recommended LLM Output Schema

Based on actual DB design. All fields nullable. No `required` that forces invention.

```python
{
    "schema_version": "2.0",
    "identity": {
        "name": {"first": null, "middle": null, "last": null, "raw": null},
        "emails": [{"value": null, "label": null, "is_primary": false}],
        "phones": [{"value": null, "e164": null, "label": null, "is_primary": false}]
    },
    "location": {
        "raw": null, "city": null, "state": null,
        "country": null, "postal_code": null
    },
    "preferences": {
        "professional_title": null,
        "all_titles": [],
        "summary": null,
        "preferred_work_mode": null,
        "notice_period_days": null
    },
    "facts": {
        "skills": [{"name": null, "proficiency_level": null, "years_of_experience": null}],
        "experiences": [{
            "company_name": null, "job_title": null,
            "employment_type": null, "location": null,
            "start_date": {"raw": null, "year": null, "month": null, "precision": "unknown"},
            "end_date": {"raw": null, "year": null, "month": null, "precision": "unknown", "is_open_ended": false},
            "is_current": false, "description": null,
            "responsibilities": [], "achievements": []
        }],
        "educations": [{
            "institution_name": null, "degree": null, "field_of_study": null,
            "start_date": null, "end_date": null, "grade": null
        }],
        "certifications": [{"name": null, "issuer": null, "credential_id": null, "issued_at": null, "expires_at": null}],
        "projects": [{"title": null, "description": null, "project_url": null, "repository_url": null, "technologies": []}],
        "languages": [{"language_name": null, "proficiency": null}],
        "awards": [{"title": null, "issuer": null, "awarded_at": null, "description": null}],
        "links": [{"link_type": null, "url": null, "label": null}]
    }
}
```

---

## Implementation Plan

### Phase 1: Fix Blockers (Unblock Confirm Flow) — VERIFIED

| # | Change | File | Verified |
|---|---|---|---|
| 1.1 | Fix `change_source` → `'resume_ai'` | `resume.ts:125` | ✅ |
| 1.2 | Fix `primary_source_type` → `'resume_ai'` | `resume.ts:24` | ✅ |
| 1.3 | Remove `source_document_id`, `source_parsing_result_id` from experiences INSERT | `resume.ts:32` | ✅ |
| 1.4 | Fix skills shape mismatch — either change worker output to `[{name: "Python"}]` or change NestJS reader to accept strings | `task_handlers.py:397` OR `resume.ts:26` | ✅ |
| 1.5 | Add `awards` and `links` loops in `insertConfirmedFacts` | `resume.ts` | ✅ |
| 1.6 | **Add "only first time" guard** — check `profile_completed_at IS NULL` before auto-filling. Column exists at `08_candidates.sql:74` as nullable TIMESTAMPTZ. | `resume.ts:confirm()` | ✅ |
| 1.7 | **"Clean file only" guard** — ALREADY EXISTS at `resume.ts:104-107`. Blocks `pending/scanning/infected/quarantined/failed`. No new code needed. | Already implemented | ✅ |

### Phase 2: Expand LLM Schema (Rich Extraction)

| # | Change | File | Why |
|---|---|---|---|
| 2.1 | Create `app/schemas/resume_extraction.py` | New file | Typed Pydantic models for v2 schema — `PartialDate`, `Evidence`, `Identity`, `Location`, `Preferences`, all fact groups |
| 2.2 | Replace 7-field schema with rich schema | `task_handlers.py:337-350` | Extract experience/education/certifications/projects/languages/awards/links |
| 2.3 | Update system prompt | `task_handlers.py:327-332` | Add anti-hallucination rules, evidence requirement, date handling policy |
| 2.4 | Update `normalized_output` builder | `task_handlers.py:389-400` | Preserve all structured data instead of lossy `[{years_total: N}]` |
| 2.5 | Add LLM response validation | `task_handlers.py` | Validate against Pydantic model before persisting; reject empty/malformed output |
| 2.6 | Add `PROMPT_VERSION`, `EXTRACTION_VERSION` to config | `config.py` | Track versions for re-parsing capability |
| 2.7 | Write correct `parser_model` | `task_handlers.py:162` | Change `'pending'` → actual model name (e.g. `'gemini-2.5-flash'`) |

### Phase 3: First-Time Profile Auto-Fill + Candidate Confirmation

| # | Change | File | Why |
|---|---|---|---|
| 3.1 | **Add "only first time" branching** — if `profile_completed_at IS NULL` → auto-fill profile + facts. Else → only link resume. | `resume.ts:confirm()` | Core product requirement |
| 3.2 | Add `PartialDate` → `date` widening logic | `resume.ts` | Satisfy `DATE NOT NULL` without fabricating. Rule: `year` → `YYYY-01-01`, `year_month` → `YYYY-MM-01`, `exact` → as-is |
| 3.3 | Add evidence table writes | `resume.ts` | Write to `candidate_*_evidence` on confirm with `extracted_value` + `confidence_score` |
| 3.4 | Add NULL-overwrite protection | `resume.ts:111-118` | Only write keys explicitly sent by candidate; absent key = "don't touch" |
| 3.5 | Update parsed-data allowlist | `candidate.ts:158` | Add `projects`, `awards`, `links` (currently excluded) |
| 3.6 | Delete dead `.ai` shim | `candidate.ts:146-157` | Unreachable code — worker writes `raw_ai_output.ai`, not `normalized_output.ai` |

### Phase 4: Worker Quality + Later Resume Processing

| # | Change | File | Why |
|---|---|---|---|
| 4.1 | Fix `AIProviderError` handling — call `mark_failed` instead of bare re-raise | `task_handlers.py:461-462` | Job stuck `processing` forever otherwise |
| 4.2 | Fix `RateLimitError` inheritance — make it extend `AIProviderError` | `exceptions.py` | 429 currently treated as success |
| 4.3 | Fix LLM failure → `mark_completed` — don't mark fallback as completed | `task_handlers.py:356-360,454` | Fallback data ≠ successful parse |
| 4.4 | Add attempt guard | `parsing_job_repo.py:29-61` | Add `AND attempt_number < max_attempts` |
| 4.5 | Respect `available_at` | `parsing_job_repo.py` | Add backoff scheduling |
| 4.6 | Exclude `failed` from claim | `parsing_job_repo.py` | Add `AND status != 'failed'` |
| 4.7 | Fix writer/reader key mismatch | `projection_service.py:137,148` | Read `experiences`/`educations` not `experience_years`/`education` |
| 4.8 | Fix `_calculate_experience_years` overlap | `projection_service.py:244-275` | Remove overlapping date ranges |
| 4.9 | Fix `overall_confidence` default | `task_handlers.py:403` | Use `None` not `100.0` |
| 4.10 | Use `response_schema` in provider | `vertexai.py` | Enable Gemini's constrained decoding |
| 4.11 | Use `system_instruction` role | `vertexai.py` | Separate system from untrusted resume |
| 4.12 | Set `temperature=0.0` | `vertexai.py` | Deterministic extraction |
| 4.13 | Fix `domain/enums.py` | `app/domain/enums.py` | Align with SQL `profile_fact_source` enum (0/5 overlap currently) |
| 4.14 | Use SQL `profile_fact_source` vocabulary everywhere | `projection_service.py`, `08_candidates_Explanation.md` | Three competing vocabularies currently |

### Phase 5: Frontend + Extraction Quality (Later)

| # | Change | File | Why |
|---|---|---|---|
| 5.1 | Replace JSON textarea with typed sections | `page.tsx` | Profile, skills, experience, education, certifications, projects, languages, awards, links |
| 5.2 | Fix `saveProfile` NULL-overwrite | `page.tsx:145-169` | Only send changed keys; absent key = "don't touch" |
| 5.3 | Show evidence/confidence in review | `page.tsx` | Candidate can see source text for each extracted fact |
| 5.4 | Add per-fact edit endpoints | NestJS | Create/edit individual skills, experiences, etc. |
| 5.5 | Collect name/phone at signup | `signup/page.tsx` | Populate `users.first_name`/`phone` |
| 5.16 | Remove `.doc` from frontend accept | `page.tsx:260` | Prevent guaranteed parse failures |
| 5.14 | Fix DOCX extraction | `document_extractor.py:134-141` | Read tables, headers, footers (currently paragraphs only) |
| 5.15 | Change hard page limit to partial | `document_extractor.py:120-132` | Emit `partial` status instead of failing |
| 5.13 | Delete dead `ocr_image` or wire it up | `document_extractor.py` | Currently dead code — zero call sites |

---

## Test Plan

| # | Test Case | Purpose | Phase |
|---|---|---|---|
| 1 | Confirm with valid enum values | B-1/B-2 fixed | 1 |
| 2 | Confirm without source_document_id on experiences | B-3 fixed | 1 |
| 3 | Skills shape: worker strings → NestJS objects | B-4/B-5 fixed | 1 |
| 4 | Awards/links loops process data | 1.5 fixed | 1 |
| 5 | **1st resume auto-fills profile** | `profile_completed_at` NULL → auto-fill works | 3 |
| 6 | **2nd resume does NOT auto-fill** | `profile_completed_at` set → only resume link | 3 |
| 7 | **Infected file rejected from confirm** | `security_scan_status = 'infected'` → 409 | existing |
| 8 | **Pending scan rejected from confirm** | `security_scan_status = 'pending'` → 409 | existing |
| 9 | **Clean file passes confirm** | `security_scan_status = 'clean'` → auto-fill allowed | existing |
| 10 | Simple one-page resume | Basic extraction | 2 |
| 11 | Multi-page resume | Full extraction | 2 |
| 12 | Senior developer resume | Experience-heavy | 2 |
| 13 | Resume with missing email | Nullable handling | 2 |
| 14 | Resume with missing phone | Nullable handling | 2 |
| 15 | Resume with no experience | Empty array | 2 |
| 16 | Fresher resume | Education-heavy | 2 |
| 17 | Multiple jobs | Array handling | 2 |
| 18 | Current job (no end date) | `is_current: true` | 2 |
| 19 | Multiple skills | Array handling | 2 |
| 20 | Skill with proficiency | `proficiency_level` extraction | 2 |
| 21 | Skill without proficiency | `null` handling | 2 |
| 22 | Skill with years | `years_of_experience` extraction | 2 |
| 23 | Education with GPA | `grade` extraction | 2 |
| 24 | Education without dates | `null` date handling | 2 |
| 25 | Certifications | Certification extraction | 2 |
| 26 | Projects | Project extraction | 2 |
| 27 | Multiple languages | Language array | 2 |
| 28 | LinkedIn/GitHub URLs | URL extraction | 2 |
| 29 | Badly formatted PDF | Graceful fallback | 5 |
| 30 | Multi-column PDF | Text ordering | 5 |
| 31 | Resume with tables | Table text extraction | 5 |
| 32 | Resume with ambiguous dates | PartialDate handling | 3 |
| 33 | Resume with duplicate skills | Deduplication | 2 |
| 34 | Resume with no extractable text | Error handling | 4 |
| 35 | LLM malformed JSON | Error handling | 4 |
| 36 | LLM missing optional fields | Default handling | 2 |
| 37 | LLM hallucination attempt | Instruction following | 2 |
| 38 | Very large resume | Size limits | 5 |
| 39 | Resume with Unicode/non-English | Encoding handling | 5 |
| 40 | Confirm writes canonical tables | End-to-end persistence | 3 |
| 41 | Confirm is idempotent | Duplicate confirm safe | 1 |
| 42 | Stale `profile_revision` rejected | Concurrency safety | 3 |
| 43 | NULL-overwrite protection | Candidate data preserved | 3 |
| 44 | Evidence tables populated | Provenance trail | 3 |

---

## Key Principle

**Do NOT hallucinate to fill DB columns.** Only extract what's in the resume. If a DB column has no resume source, it stays null until the candidate manually fills it.

**Auto-fill is a ONE-TIME gift to the candidate.** After the first confirm, the profile is frozen — subsequent resumes never overwrite it.

**Only clean files earn the right to auto-fill.** Infected/pending files are blocked at the gate.

The goal is:

```
Resume (clean file only)
  → High-quality text extraction
  → Robust LLM (evidence-based, no hallucination)
  → Strongly typed structured output
  → resume_parsed_data (immutable evidence)
  → Candidate review/edit/confirmation
  → Auto-fill canonical candidate tables (FIRST TIME ONLY)
  → profile_completed_at = NOW() → Auto-fill locked forever
  → Search / matching / AI / recruiter workflows
```

with minimum information loss, minimum hallucination, and complete alignment with the actual production database schema.

---

## Reconciliation Log (Verified Against Actual Code)

### What was verified

| Item | File | Result |
|---|---|---|
| `resume.ts` confirm flow | `04-nestjs-api/.../candidates/resume.ts` | ✅ All blockers confirmed |
| `task_handlers.py` resume parse | `07-fastapi-ai-worker/app/api/v1/task_handlers.py` | ✅ All findings confirmed |
| `08_candidates.sql` schema | `02-database/migrations/baseline/08_candidates.sql` | ✅ `profile_completed_at` exists (line 74) |
| `02_enums.sql` enums | `02-database/migrations/baseline/02_enums.sql` | ✅ `profile_fact_source` has 8 values |
| `candidate_experiences` columns | `08_candidates.sql:171-192` | ✅ No `source_document_id`/`source_parsing_result_id` |
| `candidate_projects/languages/awards` | `08_candidates.sql:255-330` | ✅ Have both source columns |
| Security scan check in confirm | `resume.ts:104-107` | ✅ Already blocks non-clean files |
| `body.facts` vs `body.profile.facts` | `resume.ts:119` + `page.tsx:115` | ⚠️ Both use `body.facts` — no mismatch |
| PD-002 document | Entire repository | ❌ Does not exist |

### Corrections applied

| Original Claim | Corrected To |
|---|---|
| B-5: "Frontend sends `body.facts`, NestJS reads `body.profile.facts`" | **B-5: Skills shape mismatch** — worker sends `["Python"]` (strings), NestJS expects `[{name: "Python"}]` (objects). Field name is fine (`body.facts`), shape is wrong. |
| Phase 1 item 1.4: "Fix facts payload contract" | **Removed** — both already use `body.facts`, no contract fix needed |
| Phase 1 item 1.8: "Add clean file only guard" | **Changed to "Already exists"** — `resume.ts:104-107` already blocks non-clean files |
| `parser_model='pending'` not mentioned | **Added as H-21 detail** — hardcoded placeholder at `task_handlers.py:162` |
