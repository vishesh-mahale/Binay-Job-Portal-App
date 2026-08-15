# Production-Ready FastAPI AI Worker — Master Implementation Blueprint & Senior Architect Prompt

> **Role & Authority**: You are acting as a **15+ Years Experienced Principal Python Architect, Application Security Specialist, and Cloud Systems Engineer**. You build enterprise-grade, zero-trust, highly resilient, and scalable backend services.
>
> **Target Component**: `07-fastapi-ai-worker` (Private, trusted Cloud Run service for AI processing, document parsing, embeddings, and derived search projections).

---

## 1. Executive Summary & Core Identity

You are **not** building a typical public REST API or a monolithic web app. Your service is a **specialized, private background AI worker** that operates inside an asynchronous, event-driven architecture.

### 1.1 The Complete System Topology

```text
┌──────────────────────────────────────────────────────────────────────────────────┐
│                               USER-FACING BOUNDARY                               │
└──────────────────────────────────────────────────────────────────────────────────┘
   Candidate / HR / Employer Browser
                 │
                 ▼ HTTPS (REST / WebSockets / SSE)
   NestJS Main API (04-nestjs-api)
      │  - Supabase Auth session validation & Role-based Authorization
      │  - Validates business rules & owns canonical database transactions
      │  - Generates short-lived private Supabase Storage signed URLs
      │  - Inserts business state + pending outbox_events in SAME DB transaction
      ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                               PERSISTENCE & OUTBOX                               │
└──────────────────────────────────────────────────────────────────────────────────┘
   Supabase PostgreSQL (82 base tables, 82/82 RLS enabled)
      │
      │ Database INSERT Webhook on public.outbox_events (Primary asynchronous wake-up)
      ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                          DISPATCH & QUEUE ORCHESTRATION                          │
└──────────────────────────────────────────────────────────────────────────────────┘
   NestJS Outbox Dispatcher (05-outbox-dispatcher-nestjs - Separate Cloud Run Service)
      │  - Claims bounded batch using SELECT ... FOR UPDATE SKIP LOCKED
      │  - Computes deterministic task name: sha256(event_id + route)
      │  - Publishes tasks to Google Cloud Tasks
      ▼
   Google Cloud Tasks Queues (ai-heavy-queue, projection-queue)
      │  - Controlled concurrency (e.g. 5–20 workers), rate-limiting, bounded exponential backoff
      │  - Generates Google OIDC Identity Token with dedicated Service Account
      ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                       YOUR SERVICE (07-fastapi-ai-worker)                        │
└──────────────────────────────────────────────────────────────────────────────────┘
   Private Cloud Run FastAPI Worker (NO PUBLIC ACCESS)
      │  - Validates Google OIDC token (Signature, Issuer, Audience, Service Account allowlist)
      │  - Enforces dual idempotency: pre-claim job lease + processed_events check
      │  - Downloads document via fresh signed URL (Hostile document defense)
      │  - Performs OCR / Text Extraction & Sandboxed AI Prompting (Prompt Injection defense)
      │  - Generates 768-dimensional embeddings via pluggable AI Provider (Gemini / OpenAI / Mock)
      │  - Executes short DB transaction:
      │      * Writes immutable parsed results & evidence
      │      * Upserts search projections with strict revision guards
      │      * Records processed_events idempotency
      │      * Optionally inserts chained outbox_events
      ▼
   Supabase PostgreSQL (Restricted Least-Privilege DB Role)
```

---

## 2. Source-of-Truth Hierarchy & Agent Working Rules

When designing and writing code, you must strictly respect the following precedence rules (defined in `AGENTS.md` and repository standards):

| Priority | Source | Authority Level |
|---|---|---|
| **1** | Actual baseline migrations `02-database/migrations/baseline/01_*.sql` to `18_*.sql` | **Executable Absolute Truth** |
| **2** | `02-database/schema-docs/PRODUCTION-SCHEMA-BLUEPRINT.md` & `SEARCH-STRATEGY.md` | **Database Contract Authority** |
| **3** | Approved Architecture Docs (`docs/architecture/background-processing/`) | **System Architecture Truth** |
| **4** | Shared Contracts in `contracts/events/` and `contracts/tasks/` | **Payload & Schema Contracts** |
| **5** | `04-nestjs-api/NESTJS-IMPLEMENTATION-GUIDE.md` | **Service Boundaries** |
| **6** | `01-requirements/current/` and `01-requirements/product-decisions/` | **Product Requirements & Decisions** |
| **7** | `docs/research/ai/` | **Research Input Only** (Non-authoritative) |
| **8** | Old sibling `Binay-App` code | **Legacy Reference Only** — NEVER copy blindly! |

> [!IMPORTANT]
> **Zero-Assumption Rule**: If any requirement or schema field is ambiguous or contradictory between authoritative documents, do NOT guess. Raise it as an explicit decision/blocker with clear technical options.

---

## 3. Strict Service Boundaries: What FastAPI Owns vs. Does NOT Own

### 3.1 What FastAPI OWNS (Your Responsibilities)
1. **Private Task Handlers**: Idempotent HTTP endpoints called solely by Google Cloud Tasks via OIDC.
2. **Hostile Document Ingestion & Parsing**: Secure extraction of text and OCR from PDF/DOCX with memory caps, zip-bomb defenses, and magic-byte checks.
3. **AI / LLM Structured Extraction**: Extracting structured candidate/job profiles using validated JSON schemas and Pydantic models.
4. **Embedding Generation**: Producing **768-dimensional** vector embeddings for jobs and candidate search projections using symmetric semantic text builders.
5. **Candidate Search Projection Maintenance**: Rebuilding `candidate_search_profiles` (keyword tsvector + embedding + `fact_sources`) conforming to **PD-002**.
6. **Job AI Enrichment**: Generating `jobs.ai_ideal_candidate_profile` JSONB and `jobs.embedding` conforming to `05_jobs_AI_*` contracts.
7. **Immutable Writes & Evidence**: Inserting into `resume_parsed_data`, `resume_parsing_artifacts`, `resume_parsing_job_events`, and `candidate_*_evidence`.
8. **Idempotency & Lease Management**: Atomic job locking (`SELECT ... FOR UPDATE SKIP LOCKED`) and `processed_events` logging.
9. **Chained Outbox Events**: Emitting downstream `outbox_events` (e.g. `candidate.projection.rebuilt`) in the final database commit.
10. **Shared Contract Definitions**: Authoring and maintaining JSON Schemas in `contracts/events/` and `contracts/tasks/`.

### 3.2 What FastAPI MUST NOT DO (Explicitly Out of Scope)
1. **No Public REST API / Direct Browser Requests**: Direct browser traffic must be rejected (Cloud Run IAM blocks it; service endpoints validate OIDC).
2. **No User Authentication**: User signup, login, JWT issuance, and password resets belong to Supabase Auth & NestJS.
3. **No Direct Mutation of Canonical Business Tables**: Never update `candidate_profiles`, `candidate_skills`, `candidate_experiences`, or `job_applications` directly. Only insert evidence or update worker-owned projection/AI columns.
4. **No Rewriting of Historical Snapshots**: `application_profile_snapshots` and submitted application data are immutable historical records.
5. **No Outbox Polling / Dispatching**: Outbox polling and Cloud Tasks dispatching is owned by `05-outbox-dispatcher-nestjs`.
6. **No Trigger Overrides**: Do not attempt to compute `jobs.search_vector` manually; it is maintained by database triggers (`jobs_search_vector_update()`).
7. **No Direct Malware Scanning**: Document security scan (`security.scan.requested`) precedes parsing. FastAPI only parses documents that have already passed security status `clean`.

---

## 4. Non-Negotiable Database Architecture & Write Ownership

Every table in PostgreSQL has strict ownership and immutability triggers defined in baseline SQL:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ DATABASE WRITE PERMISSIONS FOR FASTAPI WORKER                                                 │
├──────────────────────────────────┬───────────────────┬─────────────────────────────────────────┤
│ Target Table                     │ Allowed DML       │ Invariants & Trigger Constraints        │
├──────────────────────────────────┼───────────────────┼─────────────────────────────────────────┤
│ `resume_parsing_jobs`            │ SELECT, UPDATE    │ Claim via FOR UPDATE; update status,    │
│                                  │                   │ locked_at, locked_by, error_details     │
├──────────────────────────────────┼───────────────────┼─────────────────────────────────────────┤
│ `resume_parsed_data`             │ INSERT ONLY       │ Immutable trigger blocks UPDATE/DELETE. │
│                                  │                   │ Max 1 result per parsing_job_id.        │
├──────────────────────────────────┼───────────────────┼─────────────────────────────────────────┤
│ `resume_parsing_artifacts`       │ INSERT ONLY       │ Immutable trigger blocks UPDATE/DELETE. │
│ `resume_parsing_job_events`      │ INSERT ONLY       │ Immutable trigger blocks UPDATE/DELETE. │
├──────────────────────────────────┼───────────────────┼─────────────────────────────────────────┤
│ `candidate_search_profiles`      │ INSERT, UPDATE    │ CHECK: projection_revision <=           │
│                                  │ (UPSERT)          │ source_profile_revision.                │
│                                  │                   │ Embedding must be vector(768).          │
│                                  │                   │ fact_sources must track source labels.  │
├──────────────────────────────────┼───────────────────┼─────────────────────────────────────────┤
│ `jobs`                           │ SELECT, UPDATE    │ Update ONLY ai_ideal_candidate_profile, │
│                                  │ (Target Columns)  │ embedding, embedding_status,            │
│                                  │                   │ embedding_model, embedding_version.     │
├──────────────────────────────────┼───────────────────┼─────────────────────────────────────────┤
│ `processed_events`               │ INSERT ONLY       │ Immutable trigger blocks UPDATE.        │
│                                  │                   │ PK: (consumer_name, event_id).          │
├──────────────────────────────────┼───────────────────┼─────────────────────────────────────────┤
│ `outbox_events`                  │ INSERT ONLY       │ Trigger enforces initial 'pending' state│
│                                  │                   │ and immutable envelope.                 │
├──────────────────────────────────┼───────────────────┼─────────────────────────────────────────┤
│ `candidate_*_evidence`           │ INSERT, UPDATE    │ Append-only; status transition: active  │
│                                  │                   │ -> superseded / rejected / invalidated. │
├──────────────────────────────────┼───────────────────┼─────────────────────────────────────────┤
│ `candidate_profiles`             │ SELECT ONLY       │ Canonical profile is user-editable only.│
│ `job_applications`               │ SELECT ONLY       │ Submitted applications are immutable.   │
└──────────────────────────────────┴───────────────────┴─────────────────────────────────────────┘
```

---

## 5. Security Architecture (Zero-Trust & Defense-in-Depth)

As a Principal Security Architect, you must implement multi-layered defenses:

### 5.1 Google Cloud OIDC Authentication (Zero-Trust)
1. **Cloud Run IAM** is the primary perimeter (`roles/run.invoker` granted only to Cloud Tasks Service Account).
2. **Application-Level OIDC Verification Middleware** (Defense-in-Depth):
   - Extract `Bearer <token>` from the `Authorization` header.
   - Fetch & cache Google Public Certificates from `https://www.googleapis.com/oauth2/v3/certs` with automatic TTL cache and key rotation.
   - Validate RS256 signature, expiry (`exp`), issue time (`iat`), issuer (`https://accounts.google.com`), and expected audience (`aud == CLOUD_RUN_SERVICE_URL`).
   - Validate that `token['email']` matches the configured `ALLOWED_TASK_SERVICE_ACCOUNTS`.
   - Reject unauthenticated requests with `401 Unauthorized` and unauthorized identities with `403 Forbidden`.
   - Provide a safe local bypass flag (`OIDC_AUTH_ENABLED=False`) strictly for local development and unit tests.

### 5.2 Hostile Document & Extraction Defense
Resumes uploaded by untrusted candidates are potentially hostile vectors:
- **Magic-Byte Sniffing**: Inspect initial bytes to verify genuine PDF (`%PDF-`) or DOCX (`PK\x03\x04`) structures; reject renamed `.exe`, `.sh`, `.bat`, or SVG files.
- **Decompression Bomb & Size Caps**: Max document size = 10 MB; max extracted text size = 100,000 characters; max pages = 10.
- **Sandboxed Temp-File Lifecycle**: Stream files to isolated temp files using Python `tempfile.NamedTemporaryFile`, ensuring immediate and reliable deletion in a `finally:` block.
- **Parser Timeout & Memory Limits**: Set strict sub-process or worker execution timeouts on PDF/OCR extraction (e.g. 30 seconds max) to prevent CPU starvation attacks.

### 5.3 Prompt Injection & AI Sandboxing
Candidate resumes and job descriptions contain untrusted free text that may attempt prompt injection:
- **Strict Instruction Isolation**: Wrap untrusted resume/job text inside explicit XML-like delimiters (e.g. `<untrusted_resume_content>...</untrusted_resume_content>`).
- **System Prompt Hardening**: Instruct the LLM that text inside delimiters must be treated purely as raw data to be extracted, never as instructions to be executed.
- **Structured Outputs Only**: Enforce strict JSON Schema validation. Rejects any LLM response containing markdown codeblocks, extra keys, or invalid types.
- **Zero Execution**: LLM output is never evaluated (`eval()`), executed as SQL, used in shell commands, or used to formulate dynamic database queries.

### 5.4 Privacy & Secret Hygiene
- **Zero Credentials in Code/Logs**: All secrets (`DATABASE_URL`, `AI_PROVIDER_API_KEY`, etc.) loaded via Pydantic `BaseSettings` from environment/Secret Manager.
- **Structured Log Redaction**: Configure `structlog` or standard logging with automatic PII and secret redaction (mask emails, phone numbers, bearer tokens, passwords, and raw resume text).
- **No Stack Traces to Callers**: In case of errors, return sanitized JSON error envelopes with `trace_id` and generic error codes.

---

## 6. End-to-End Core Pipelines & Implementation Details

### 6.1 Resume Parsing Pipeline (`/internal/tasks/resume/parse`)

```text
Step 1: Receive Cloud Task POST payload:
        { "schema_version": 1, "event_id": "UUID", "aggregate_id": "PARSING_JOB_UUID", "trace_id": "UUID" }
Step 2: Validate OIDC Token & Task Schema.
Step 3: Check processed_events table. If (consumer_name='resume_parser', event_id) exists -> Return HTTP 200 OK (idempotent skip).
Step 4: Atomic Job Claim (Short DB Transaction 1):
        SELECT * FROM resume_parsing_jobs WHERE id = aggregate_id FOR UPDATE;
        - If status in ('completed', 'cancelled') -> Return HTTP 200 OK.
        - If locked_by is set and locked_at > NOW() - interval '10 minutes' -> Return HTTP 200 OK / 409 (another worker active).
        - UPDATE resume_parsing_jobs SET status = 'processing', locked_by = WORKER_ID, locked_at = NOW(), started_at = COALESCE(started_at, NOW()), attempt_number = attempt_number + 1;
        - COMMIT.
Step 5: Fetch Document Metadata from uploaded_documents:
        - Verify security_scan_status == 'clean' (If not clean -> log error, update job status='failed', COMMIT, return 200).
Step 6: Download & Extract Document (Outside DB Transaction):
        - Generate / use fresh short-lived signed URL or direct storage client.
        - Stream download to secure tempfile.
        - Extract text (PyPDF / pdfplumber / python-docx / OCR fallback with memory caps).
        - Hash extracted text / store artifact metadata.
Step 7: AI Structured Extraction (Outside DB Transaction):
        - Call configured AI Provider (e.g. Gemini 2.5 Flash / OpenAI / Mock).
        - Validate structured output against ResumeExtractedSchema (Pydantic).
Step 8: Final Atomic Commit (Short DB Transaction 2):
        BEGIN;
          - INSERT INTO resume_parsed_data (parsing_job_id, document_id, extracted_text, raw_ai_output, normalized_output, confidence_details, validation_result, overall_confidence, schema_version) ...
          - INSERT INTO resume_parsing_artifacts (parsing_job_id, artifact_type, inline_data, checksum_sha256) ...
          - INSERT INTO resume_parsing_job_events (parsing_job_id, event_type, event_data) VALUES (..., 'completed', ...)
          - UPDATE resume_parsing_jobs SET status = 'completed', completed_at = NOW(), locked_at = NULL, locked_by = NULL WHERE id = aggregate_id;
          - INSERT INTO processed_events (consumer_name, event_id, result_metadata) VALUES ('resume_parser', event_id, ...)
          - Check if document is linked as is_current=TRUE in candidate_profile_documents:
            If yes -> INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload) VALUES ('candidate', candidate_id, 'candidate.profile.changed', '{"candidate_id": "...", "reason": "active_resume_parsed"}')
        COMMIT;
Step 9: Return HTTP 200 OK {"status": "success", "parsing_job_id": "..."}.
```

### 6.2 Candidate Search Projection Pipeline (`/internal/tasks/candidate/projection`)

Conforms strictly to **PD-002 (Active Resume Search)**:

```text
Step 1: Receive Cloud Task POST payload:
        { "schema_version": 1, "event_id": "UUID", "aggregate_id": "CANDIDATE_ID", "trace_id": "UUID" }
Step 2: Validate OIDC Token & Task Schema.
Step 3: Check processed_events for ('candidate_projection', event_id). If exists -> Return HTTP 200 OK.
Step 4: Load Canonical Profile & Active Resume State (Read-only query):
        - Read candidate_profiles (id, profile_revision, professional_title, city, state, country, ...).
        - Read active child facts where deleted_at IS NULL:
            candidate_skills, candidate_experiences, candidate_educations,
            candidate_projects, candidate_certifications, candidate_languages.
        - Read current active resume document:
            SELECT document_id FROM candidate_profile_documents WHERE candidate_id = :id AND is_current = TRUE AND unlinked_at IS NULL;
        - If active resume exists, load its latest resume_parsed_data (id, normalized_output).
Step 5: Merge & Deduplicate Search Facts (In-Memory Transformation):
        - Combine canonical skills (source: 'confirmed_profile') + resume skills (source: 'latest_active_resume').
        - Deduplicate by normalized name; confirmed canonical facts take highest priority.
        - Build fact_sources JSONB tracking origin of each skill/title/experience.
        - Calculate total_experience_years and highest_education_level.
Step 6: Build Semantic Search Representation:
        - Format clean semantic text via CandidateSemanticTextBuilder.
        - Generate 768-dimensional embedding via EmbeddingProvider.
        - Verify len(embedding) == 768.
        - Build searchable_text and PostgreSQL tsvector tokens.
Step 7: Check Stale Revision Guard (Concurrency & Coalescing Protection):
        - SELECT profile_revision FROM candidate_profiles WHERE id = :candidate_id;
        - If current DB revision != revision read in Step 4:
            Log "Stale projection detected (newer revision exists); skipping write to coalesce."
            INSERT INTO processed_events ('candidate_projection', event_id, {"status": "coalesced_stale_revision"});
            Return HTTP 200 OK.
Step 8: Final Atomic Commit:
        BEGIN;
          - INSERT INTO candidate_search_profiles (
              candidate_id, source_profile_revision, projection_revision,
              active_resume_document_id, active_resume_parsing_result_id,
              professional_title, normalized_titles, skill_ids, skill_names,
              locations, fact_sources, total_experience_years, highest_education_level,
              searchable_text, search_vector, embedding, embedding_model, embedding_version, generated_at
            ) VALUES (...)
            ON CONFLICT (candidate_id) DO UPDATE SET
              source_profile_revision = EXCLUDED.source_profile_revision,
              projection_revision = EXCLUDED.projection_revision,
              active_resume_document_id = EXCLUDED.active_resume_document_id,
              active_resume_parsing_result_id = EXCLUDED.active_resume_parsing_result_id,
              professional_title = EXCLUDED.professional_title,
              normalized_titles = EXCLUDED.normalized_titles,
              skill_ids = EXCLUDED.skill_ids,
              skill_names = EXCLUDED.skill_names,
              locations = EXCLUDED.locations,
              fact_sources = EXCLUDED.fact_sources,
              total_experience_years = EXCLUDED.total_experience_years,
              highest_education_level = EXCLUDED.highest_education_level,
              searchable_text = EXCLUDED.searchable_text,
              search_vector = to_tsvector('english', EXCLUDED.searchable_text),
              embedding = EXCLUDED.embedding,
              embedding_model = EXCLUDED.embedding_model,
              embedding_version = EXCLUDED.embedding_version,
              generated_at = NOW()
            WHERE candidate_search_profiles.projection_revision <= EXCLUDED.projection_revision;
          - INSERT INTO processed_events (consumer_name, event_id, result_metadata) VALUES ('candidate_projection', event_id, ...);
        COMMIT;
Step 9: Return HTTP 200 OK.
```

### 6.3 Job AI Enrichment & Embedding Pipeline (`/internal/tasks/job/enrich`)

Conforms strictly to `05_jobs_AI_Job_Profile_JSONB_Contract_v1_step1.md` and `05_jobs_AI_Job_Embedding_Architecture_v1_step2.md`:

```text
Step 1: Receive Cloud Task POST payload:
        { "schema_version": 1, "event_id": "UUID", "aggregate_id": "JOB_ID", "trace_id": "UUID" }
Step 2: Validate OIDC Token & Check processed_events for ('job_enrichment', event_id).
Step 3: Load Job & Related Metadata (Read-Only):
        - SELECT * FROM jobs WHERE id = aggregate_id AND deleted_at IS NULL;
        - Load job_skills, job_locations, job_categories.
Step 4: AI Job Profile Generation (Outside DB Transaction):
        - Call AI Provider with Job Description + Skills + Locations.
        - Validate output against JobAIProfileV1Schema:
          {
            "schema_version": 1,
            "extracted": { "must_have_skills": [], "nice_to_have_skills": [], "minimum_experience_years": ..., ... },
            "inferred": { "role_family": "...", "seniority": "...", "technical_domains": [], "confidence_score": ... },
            "metadata": { "model": "...", "model_version": "...", "prompt_version": "v1", "generated_at": "...", "processing_time_ms": ... }
          }
Step 5: Semantic Embedding Generation:
        - Use JobSemanticTextBuilder to assemble combined text:
          Title + Description + Requirements + Responsibilities + Skills + Categories + Locations + AI Inferred Domains.
        - Generate 768-dimensional vector via EmbeddingProvider.
        - Assert len(vector) == 768.
Step 6: Atomic Commit:
        BEGIN;
          - UPDATE jobs SET
              ai_ideal_candidate_profile = :ai_profile_json,
              embedding = :embedding_vector,
              embedding_status = 'completed',
              embedding_model = :model_name,
              embedding_version = :model_version,
              embedding_generated_at = NOW()
            WHERE id = aggregate_id;
          - INSERT INTO processed_events (consumer_name, event_id, result_metadata) VALUES ('job_enrichment', event_id, ...);
        COMMIT;
Step 7: Return HTTP 200 OK.
```

---

## 7. Embedding Compatibility & Symmetric Semantic Text Builders

> [!CAUTION]
> **Cosine Similarity Correctness Rule**: Two vectors in pgvector are **only** comparable if generated with the **exact same model, dimensions, and normalized text format**.
> Current Baseline Schema hardcodes: `vector(768)`.

### 7.1 Job Semantic Text Builder Structure
```text
Title: {job.title}
Category: {category.name}
Employment Type: {job.employment_type} | Work Mode: {job.work_mode}
Experience Required: {job.experience_min_years}-{job.experience_max_years} years
Location: {job_locations_list}
Required Skills: {skills_list}
Responsibilities:
{job.responsibilities}
Requirements:
{job.requirements}
AI Domain & Concepts: {inferred.technical_domains}, {inferred.industry_domains}, {inferred.role_family}
```

### 7.2 Candidate Semantic Text Builder Structure
```text
Professional Title: {profile.professional_title}
Experience Level: {total_experience_years} years
Work Preference: {profile.preferred_work_mode} | Willing to Relocate: {profile.willing_to_relocate}
Locations: {locations_list}
Confirmed Skills: {confirmed_skills_list}
Resume Extracted Skills: {resume_skills_list}
Experience Summary:
{experience_roles_and_descriptions}
Education: {highest_education} in {fields_of_study}
Certifications: {certifications_list}
```

---

## 8. Target Directory Structure for `07-fastapi-ai-worker`

You will build the component cleanly under `07-fastapi-ai-worker/`:

```text
07-fastapi-ai-worker/
├── README.md                      # Complete 13-section component documentation
├── Dockerfile                     # Multi-stage, non-root, slim Python container with Tesseract OCR
├── pyproject.toml                 # Poetry / Hatch / Pip-tools dependency configuration
├── requirements.txt               # Pinned production dependencies with hashes
├── requirements-dev.txt           # Test & lint dependencies (pytest, ruff, mypy)
├── .env.example                   # Complete template of required environment variables
├── .dockerignore
├── app/
│   ├── __init__.py
│   ├── main.py                    # FastAPI application initialization & lifespan management
│   ├── api/
│   │   ├── __init__.py
│   │   ├── health.py              # /health/liveness and /health/readiness probes
│   │   └── v1/
│   │       ├── __init__.py
│   │       └── task_handlers.py   # Private Cloud Tasks HTTP handlers (OIDC protected)
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py              # Pydantic BaseSettings with strict validation
│   │   ├── database.py            # Asyncpg / SQLAlchemy engine & session factory
│   │   ├── logging.py             # Structured JSON logger with PII & credential redaction
│   │   ├── security.py            # Google OIDC token validator & JWKS key cache
│   │   └── exceptions.py          # Custom exception hierarchy & global error handlers
│   ├── domain/
│   │   ├── __init__.py
│   │   └── enums.py               # Mirror baseline SQL enums (parsing_job_status, etc.)
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── tasks.py               # Cloud Task incoming payload schemas
│   │   ├── resume_parser.py       # Extracted resume structured output schema
│   │   ├── candidate_search.py    # Candidate projection & fact_sources schemas
│   │   └── job_enrichment.py      # Job AI Profile JSONB v1 schema
│   ├── services/
│   │   ├── __init__.py
│   │   ├── document_extractor.py  # PDF/DOCX text & OCR extraction with safety limits
│   │   ├── semantic_builders.py   # Symmetric text builders for Jobs and Candidates
│   │   ├── resume_service.py      # Resume parsing orchestration service
│   │   ├── projection_service.py  # Candidate search projection builder service
│   │   └── job_ai_service.py      # Job AI enrichment & embedding service
│   ├── providers/
│   │   ├── __init__.py
│   │   ├── base.py                # Abstract Base Classes (LLMProvider, EmbeddingProvider)
│   │   ├── gemini.py              # Google Gemini 2.5 Flash & text-embedding-004 provider
│   │   ├── openai.py              # OpenAI fallback provider
│   │   └── mock.py                # Mock AI provider for fast deterministic testing
│   ├── repositories/
│   │   ├── __init__.py
│   │   ├── parsing_job_repo.py    # Claim/lease operations for resume_parsing_jobs
│   │   ├── resume_parsed_repo.py  # Immutable writes to resume_parsed_data & artifacts
│   │   ├── projection_repo.py     # Revision-guarded upsert to candidate_search_profiles
│   │   ├── job_repo.py            # Job AI profile & embedding updates
│   │   ├── processed_events_repo.py # processed_events idempotency operations
│   │   └── outbox_repo.py         # Transactional chained outbox event insertions
│   └── storage/
│       ├── __init__.py
│       └── supabase_storage.py    # Secure document download via signed URLs
└── tests/
    ├── __init__.py
    ├── conftest.py                # Async client fixtures, test DB, mock providers
    ├── unit/
    │   ├── test_oidc_security.py
    │   ├── test_document_extractor.py
    │   ├── test_prompt_injection_defense.py
    │   ├── test_schemas.py
    │   └── test_semantic_builders.py
    ├── integration/
    │   ├── test_resume_parsing_flow.py
    │   ├── test_candidate_projection_flow.py
    │   ├── test_job_enrichment_flow.py
    │   ├── test_idempotency_dual_guard.py
    │   └── test_stale_revision_coalescing.py
    └── mocks/
        ├── sample_resumes/        # Real & synthetic PDF/DOCX test samples
        └── mock_llm_responses.py
```

---

## 9. Shared Contracts Deliverables (`contracts/`)

You must populate the versioned contract definitions in the root `contracts/` directory:

1. **`contracts/events/`**:
   - `resume-parse-requested.v1.json`
   - `candidate-profile-changed.v1.json`
   - `job-ai-enrichment-requested.v1.json`
2. **`contracts/tasks/`**:
   - `resume-parse-task.v1.json`
   - `candidate-projection-task.v1.json`
   - `job-enrich-task.v1.json`

---

## 10. Phased Implementation Roadmap for the Senior Architect

Execute the build in clean, disciplined phases:

```text
┌───────────────────────────────────────────────────────────────────────────────┐
│ PHASE 0: Pre-Flight Audit, Environment & Contracts Initialization            │
├───────────────────────────────────────────────────────────────────────────────┤
│ 1. Validate baseline migrations 01–18 in database.                            │
│ 2. Create contracts/events/ and contracts/tasks/ JSON Schema definitions.     │
│ 3. Scaffold 07-fastapi-ai-worker/ with pyproject.toml and dependencies.       │
└───────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: Core Foundation, Security & Database Infrastructure                  │
├───────────────────────────────────────────────────────────────────────────────┤
│ 4. Implement core/config.py with Pydantic BaseSettings & env validation.      │
│ 5. Implement core/logging.py with structured JSON & PII/Secret redaction.     │
│ 6. Implement core/security.py with Google OIDC JWKS token validation.        │
│ 7. Implement core/database.py with Asyncpg/SQLAlchemy connection pool.        │
│ 8. Implement providers/base.py and providers/mock.py.                         │
│ 9. Implement /health/liveness and /health/readiness endpoints.                │
└───────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: Document Extractor & Resume Parsing Engine                           │
├───────────────────────────────────────────────────────────────────────────────┤
│ 10. Implement services/document_extractor.py (PDF/DOCX + Magic Bytes + OCR).  │
│ 11. Implement schemas/resume_parser.py with strict Pydantic validation.       │
│ 12. Implement repositories/parsing_job_repo.py (Atomic FOR UPDATE Claim).     │
│ 13. Implement repositories/resume_parsed_repo.py (Immutable writes).          │
│ 14. Implement providers/gemini.py with structured prompt injection defense.  │
│ 15. Implement /internal/tasks/resume/parse handler with dual idempotency.     │
└───────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: Candidate Search Projection Rebuild Engine (PD-002)                  │
├───────────────────────────────────────────────────────────────────────────────┤
│ 16. Implement services/semantic_builders.py (Candidate & Job builders).      │
│ 17. Implement schemas/candidate_search.py (fact_sources & normalized schema). │
│ 18. Implement repositories/projection_repo.py (Revision-guarded UPSERT).     │
│ 19. Implement Embedding generation (768-dim check) via providers.            │
│ 20. Implement /internal/tasks/candidate/projection task handler.              │
└───────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│ PHASE 4: Job AI Profile & Embedding Enrichment                                │
├───────────────────────────────────────────────────────────────────────────────┤
│ 21. Implement schemas/job_enrichment.py matching v1 JSONB contract.          │
│ 22. Implement services/job_ai_service.py (Profile extraction + Embedding).   │
│ 23. Implement repositories/job_repo.py (Atomic update).                       │
│ 24. Implement /internal/tasks/job/enrich task handler.                        │
└───────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│ PHASE 5: Containerization, Testing & Hardening                                │
├───────────────────────────────────────────────────────────────────────────────┤
│ 25. Build production multi-stage Dockerfile with non-root security.           │
│ 26. Write 100% comprehensive unit & integration tests (>90% coverage).        │
│ 27. Author component 07-fastapi-ai-worker/README.md in full 13-section format.│
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Key Technical Quality Standard

- **Zero "Magic" Strings**: Every event type, table name, status enum, and provider model is defined in typed Python enums and constants.
- **Strict Async I/O**: Use `async`/`await` throughout for all database queries (`asyncpg`), HTTP requests (`httpx`), and file processing.
- **Never Hold Transactions Open**: DB connections are checked out only for quick queries and atomic commits, NEVER during external LLM API calls or document downloads.
- **Clean Error Envelopes**: Errors return standard HTTP status codes (`200` for fatal non-retryable/dedup skip, `500` for retryable infrastructure transient errors) to guide Cloud Tasks retry policies accurately.
- **Production Standard**: Your code must be production-deployable without further architectural refactoring.
