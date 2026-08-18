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
2. **Hostile Document Ingestion & Parsing**: Secure extraction of text and OCR from PDF/DOCX with memory caps, zip-bomb defenses, and magic-byte checks. Understand `guest_upload_sessions` context for guest applications.
3. **AI / LLM Structured Extraction**: Extracting structured candidate/job profiles, match analysis, screening questions, and interview summaries using validated JSON schemas and Pydantic models.
4. **Embedding Generation**: Producing **768-dimensional** vector embeddings for jobs and candidate search projections using symmetric semantic text builders.
5. **Candidate Search Projection Maintenance**: Rebuilding `candidate_search_profiles` (keyword tsvector + embedding + `fact_sources`) conforming to **PD-002**.
6. **Job AI Enrichment**: Generating `jobs.ai_ideal_candidate_profile` JSONB and `jobs.embedding` conforming to `05_jobs_AI_*` contracts.
7. **Match/Gap Analysis**: Calculating candidate-job match scores (`ai_match_score`, `ai_match_details`, `ai_ranking_score`) and appending versioned enriched snapshots.
8. **Immutable Writes & Evidence**: Inserting into `resume_parsed_data`, `resume_parsing_artifacts`, `resume_parsing_job_events`, `candidate_*_evidence`, and analytics events.
9. **Idempotency & Lease Management**: Atomic job locking (`SELECT ... FOR UPDATE SKIP LOCKED`) and `processed_events` logging.
10. **Chained Outbox Events**: Emitting downstream `outbox_events` (e.g. `candidate.projection.rebuilt`, `job.enriched`) in the final database commit.
11. **Shared Contract Definitions**: Authoring and maintaining JSON Schemas in `contracts/events/` and `contracts/tasks/`.
12. **Analytics Events**: Emitting idempotent `analytics_events` for worker activities (parsing completed, projection rebuilt, job enriched, etc.).

### 3.2 What FastAPI MUST NOT DO (Explicitly Out of Scope)
1. **No Public REST API / Direct Browser Requests**: Direct browser traffic must be rejected (Cloud Run IAM blocks it; service endpoints validate OIDC).
2. **No User Authentication**: User signup, login, JWT issuance, and password resets belong to Supabase Auth & NestJS.
3. **No Direct Mutation of Canonical Business Tables**: Never update `candidate_profiles`, `candidate_skills`, `candidate_experiences`, or `job_applications` directly. Only insert evidence or update worker-owned projection/AI columns.
4. **No Rewriting of Historical Snapshots**: `application_profile_snapshots` and submitted application data are immutable historical records.
5. **No Outbox Polling / Dispatching**: Outbox polling and Cloud Tasks dispatching is owned by `05-outbox-dispatcher-nestjs`.
6. **No Trigger Overrides**: Do not attempt to compute `jobs.search_vector` manually; it is maintained by database triggers (`jobs_search_vector_update()`).
7. **No Direct Malware Scanning**: Document security scan (`security.scan.requested`) precedes parsing. FastAPI only parses documents that have already passed security status `clean`. FastAPI must still validate document integrity at extraction time.
8. **No User-Facing Application State Mutation**: FastAPI may append match analysis and AI summaries to worker-owned columns only. It must never mutate candidate profile, job posting, application status, or interview scheduling state.

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
│ `jobs`                           │ SELECT, UPDATE    │ Update ONLY ai_ideal_candidate_profile,│
│                                  │ (Target Columns)  │ embedding, embedding_status,            │
│                                  │                   │ embedding_model, embedding_version.     │
├──────────────────────────────────┼───────────────────┼─────────────────────────────────────────┤
│ `job_applications`               │ SELECT, UPDATE    │ Append ai_match_score, ai_match_details,│
│                                  │ (Target Columns)  │ ai_ranking_score only. Never UPDATE     │
│                                  │                   │ candidate, job, status, or snapshots.   │
├──────────────────────────────────┼───────────────────┼─────────────────────────────────────────┤
│ `analytics_events`               │ INSERT ONLY       │ Idempotent event ingestion;            │
│                                  │                   │ idempotency_key must be unique.         │
├──────────────────────────────────┼───────────────────┼─────────────────────────────────────────┤
│ `interview_feedback`             │ SELECT, UPDATE    │ Update ONLY ai_summary. Never UPDATE    │
│                                  │ (Target Column)   │ ratings, decision, or final feedback.   │
├──────────────────────────────────┼───────────────────┼─────────────────────────────────────────┤
│ `processed_events`               │ INSERT ONLY       │ Immutable trigger blocks UPDATE.        │
│                                  │                   │ PK: (consumer_name, event_id).          │
├──────────────────────────────────┼───────────────────┼─────────────────────────────────────────┤
│ `event_processing_leases`        │ INSERT, DELETE    │ Processing lease for concurrent        │
│                                  │                   │ duplicate prevention. PK: lease_key.    │
│                                  │                   │ Stale leases cleaned by expires_at.     │
├──────────────────────────────────┼───────────────────┼─────────────────────────────────────────┤
│ `outbox_events`                  │ INSERT ONLY       │ Trigger enforces initial 'pending' state│
│                                  │                   │ and immutable envelope.                 │
├──────────────────────────────────┼───────────────────┼─────────────────────────────────────────┤
│ `candidate_*_evidence`           │ INSERT, UPDATE    │ Append-only; status transition: active  │
│                                  │                   │ -> superseded / rejected / invalidated. │
├──────────────────────────────────┼───────────────────┼─────────────────────────────────────────┤
│ `candidate_profiles`             │ SELECT ONLY       │ Canonical profile is user-editable only.│
└──────────────────────────────────┴───────────────────┴─────────────────────────────────────────┘
```

---

## 5. Security Architecture (Zero-Trust & Defense-in-Depth)

As a Principal Security Architect, you must implement multi-layered defenses:

### 5.1 Google Cloud OIDC Authentication (Zero-Trust)
1. **Cloud Run IAM** is the primary perimeter (`roles/run.invoker` granted only to Cloud Tasks Service Account).
2. **Application-Level OIDC Verification Middleware** (Defense-in-Depth):
    - Extract `Bearer <token>` from the `Authorization` header.
    - Use a Google-supported JWT/auth library for token verification (do not implement custom JWT crypto).
    - The library handles JWKS fetching, caching, key rotation, RS256 signature verification, expiry (`exp`), issue time (`iat`), issuer, and audience checks.
    - After library validation, enforce application-level checks: `token['email']` matches `ALLOWED_TASK_SERVICE_ACCOUNTS` and authorized service identity.
    - Note: `Bearer` is the HTTP `Authorization` header scheme, not a JWT claim. Do not look for `token_type == 'bearer'` inside the JWT payload.
    - Reject unauthenticated requests with `401 Unauthorized` and unauthorized identities with `403 Forbidden`.
    - Provide a safe local bypass flag (`OIDC_AUTH_ENABLED=False`) strictly for local development and unit tests.

### 5.2 Hostile Document & Extraction Defense
Resumes uploaded by untrusted candidates are potentially hostile vectors:
- **Magic-Byte Sniffing**: Inspect initial bytes to verify genuine PDF (`%PDF-`) or DOCX (`PK\x03\x04`) structures; reject renamed `.exe`, `.sh`, `.bat`, or SVG files.
- **DOCX ZIP Hardening**: DOCX is a ZIP container. Validate: max ZIP entries (e.g. 1000), max total uncompressed bytes (e.g. 50MB), max compression ratio, reject nested archives, reject path traversal entries (`../`), and validate expected DOCX structure (`[Content_Types].xml`, `word/document.xml`).
- **Decompression Bomb & Size Caps**: Max document size = 10 MB; max extracted text size = 100,000 characters; max pages = 10.
- **Sandboxed Temp-File Lifecycle**: Stream files to isolated temp files using Python `tempfile.NamedTemporaryFile`, ensuring immediate and reliable deletion in a `finally:` block.
- **Parser Timeout & Memory Limits**: Run CPU-heavy extraction in an isolated subprocess with strict timeouts (e.g. 30 seconds max) and memory limits. Subprocess isolation is preferred over thread pools because thread timeout cannot reliably kill runaway native PDF/OCR parsers. Do not run blocking PDF/OCR work directly in the async event loop.

### 5.3 Prompt Injection & AI Sandboxing
Candidate resumes and job descriptions contain untrusted free text that may attempt prompt injection:
- **Strict Instruction Isolation**: Wrap untrusted resume/job text inside explicit XML-like delimiters (e.g. `<untrusted_resume_content>...</untrusted_resume_content>`). This reduces injection risk but is NOT a security boundary by itself.
- **System Prompt Hardening**: Instruct the LLM that text inside delimiters must be treated purely as raw data to be extracted, never as instructions to be executed.
- **Structured Outputs Only**: Enforce strict JSON Schema validation. Rejects any LLM response containing markdown codeblocks, extra keys, or invalid types.
- **Zero Execution**: LLM output is never evaluated (`eval()`), executed as SQL, used in shell commands, or used to formulate dynamic database queries.
- **Actual Security Boundary**: The worker must maintain strict capability isolation: LLM has no tools, cannot execute code, cannot query the database, and its output is strictly schema-validated before persistence.

### 5.4 Privacy & Secret Hygiene
- **Zero Credentials in Code/Logs**: All secrets (`DATABASE_URL`, `AI_PROVIDER_API_KEY`, etc.) loaded via Pydantic `BaseSettings` from environment/Secret Manager.
- **Structured Log Redaction**: Configure `structlog` or standard logging with automatic PII and secret redaction (mask emails, phone numbers, bearer tokens, passwords, and raw resume text).
- **No Stack Traces to Callers**: In case of errors, return sanitized JSON error envelopes with `trace_id` and generic error codes.
- **Raw AI Output Retention**: `resume_parsed_data.raw_ai_output` may contain sensitive PII extracted from resumes. Define explicit retention period, access controls, and encryption expectations. Do not retain raw AI output indefinitely unless debugging/audit requirements explicitly justify it. Prefer storing only validated `normalized_output` for long-term use.

---

## 6. End-to-End Core Pipelines & Implementation Details

### 6.1 Resume Parsing Pipeline (`/internal/tasks/resume/parse`)

```text
Step 1: Receive Cloud Task POST payload:
        { "schema_version": 1, "event_id": "UUID", "aggregate_id": "PARSING_JOB_UUID", "trace_id": "UUID" }
Step 2: Validate OIDC Token & Task Schema.
Step 3: Check processed_events table. If (consumer_name='resume_parser', event_id) exists -> Return HTTP 200 OK (idempotent skip).
Step 4: Atomic Job Claim (Conditional UPDATE - Preferred):
        - Use a single atomic UPDATE to claim the job:
            UPDATE resume_parsing_jobs
            SET status = 'processing', locked_by = WORKER_ID, locked_at = NOW(), started_at = COALESCE(started_at, NOW())
            WHERE id = aggregate_id
              AND status NOT IN ('completed', 'cancelled')
              AND (locked_at IS NULL OR locked_at < NOW() - INTERVAL '10 minutes')
            RETURNING id, status, attempt_number, document_id;
        - If 0 rows returned -> job already completed, cancelled, or actively locked by another worker; Return HTTP 200 OK.
        - If 1 row returned -> claim successful; proceed.
        NOTE: attempt_number semantics must match baseline SQL DEFAULT. Verify baseline DEFAULT value before incrementing. Do NOT increment on first claim unless baseline semantics require it.
        Alternative: For batch workers, use SELECT ... FOR UPDATE SKIP LOCKED. For single-aggregate handlers, conditional UPDATE is simpler and reduces lock wait.
Step 5: Fetch Document Metadata from uploaded_documents:
        - Verify security_scan_status:
            - 'clean' -> proceed to extraction
            - 'pending' / 'scanning' -> retryable; release claim, return HTTP 503 Service Unavailable (Cloud Tasks will retry with backoff)
            - 'infected' / 'quarantined' -> terminal; mark job failed permanently, release claim, return HTTP 200 OK
            - 'failed' / NULL -> policy-based; default to retryable defer unless explicitly terminal
        - If terminal scan failure -> INSERT resume_parsing_job_events (event_type='failed', event_data={'reason': 'security_scan_terminal', ...}), UPDATE status='failed', COMMIT, return HTTP 200 OK.
Step 6: Download & Extract Document (Outside DB Transaction):
        - Obtain a fresh short-lived signed URL using the worker's own storage credentials/authorization.
        - Do NOT carry NestJS-generated signed URLs in the task payload; they may expire before processing.
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
             If yes -> INSERT INTO outbox_events (aggregate_type, candidate_id, event_type, payload) VALUES ('candidate', candidate_id, 'candidate.resume.parsed', '{"candidate_id": "...", "reason": "active_resume_parsed"}')
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
Step 3.5: Acquire Processing Lease (Atomic):
          INSERT INTO event_processing_leases (lease_key, consumer_name, event_id, expires_at, worker_id)
          VALUES ('candidate_projection:' || :candidate_id, 'candidate_projection', event_id, NOW() + INTERVAL '5 minutes', :worker_id)
          ON CONFLICT (lease_key) DO NOTHING;
          - If 0 rows inserted -> duplicate task / another worker holds lease; Return HTTP 200 OK.
Step 4: Load Canonical Profile & Active Resume State (Read-only query):
        - Read candidate_profiles (id, profile_revision, professional_title, city, state, country, ...).
        - Read active child facts where deleted_at IS NULL:
            candidate_skills, candidate_experiences, candidate_educations,
            candidate_projects, candidate_certifications, candidate_languages.
        - Read current active resume document from `candidate_profile_documents`:
            SELECT document_id FROM candidate_profile_documents WHERE candidate_id = :id AND document_role = 'resume' AND is_current = TRUE AND unlinked_at IS NULL;
        - If active resume exists, load its authoritative parsed result:
            SELECT rp.id, rp.normalized_output
            FROM resume_parsing_jobs rpj
            JOIN resume_parsed_data rp ON rp.parsing_job_id = rpj.id
            WHERE rpj.document_id = :active_document_id
              AND rpj.status = 'completed'
            ORDER BY rpj.completed_at DESC, rp.created_at DESC
            LIMIT 1;
        NOTE: Relationship direction is resume_parsed_data.parsing_job_id -> resume_parsing_jobs.id.
              There is NO parsing_result_id column on resume_parsing_jobs.
              "Latest" = most recent successfully completed parsing job for the current active document.
Step 5: Merge & Deduplicate Search Facts (In-Memory Transformation):
        - Combine canonical skills (source: 'confirmed_profile') + resume skills (source: 'latest_active_resume').
        - Deduplicate by normalized name; confirmed canonical facts take highest priority.
        - Build fact_sources JSONB tracking origin of each skill/title/experience.
        - Calculate total_experience_years and highest_education_level.
Step 6: Build Semantic Search Representation:
        - Format clean semantic text via CandidateSemanticTextBuilder (versioned).
        - Generate 768-dimensional embedding via EmbeddingProvider.
        - Verify len(embedding) == 768.
        - Build searchable_text and PostgreSQL tsvector tokens.
Step 7: Check Stale Revision Guard (Concurrency & Coalescing Protection):
        - Re-read current state from DB:
            SELECT profile_revision FROM candidate_profiles WHERE id = :candidate_id;
        - Re-read current active resume document from candidate_profile_documents:
            SELECT document_id FROM candidate_profile_documents WHERE candidate_id = :id AND document_role = 'resume' AND is_current = TRUE AND unlinked_at IS NULL;
        - If active resume exists, resolve authoritative parsing result:
            SELECT rp.id FROM resume_parsing_jobs rpj
            JOIN resume_parsed_data rp ON rp.parsing_job_id = rpj.id
            WHERE rpj.document_id = :current_document_id AND rpj.status = 'completed'
            ORDER BY rpj.completed_at DESC, rp.created_at DESC LIMIT 1;
        - If any of: current profile_revision != revision read in Step 4
                     OR current active_document_id != document_id read in Step 4
                     OR current authoritative_result_id != result_id read in Step 4:
            Log "Stale projection detected (newer source state exists); skipping write to coalesce."
            Return HTTP 200 OK.
        NOTE: candidate_profiles does NOT contain active_resume_document_id or active_resume_parsing_result_id.
              Those live in candidate_profile_documents and resume_parsed_data/resume_parsing_jobs.
              Stale guard must check the full derived source tuple, NOT just profile_revision.
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
Step 9: Release Processing Lease:
        DELETE FROM event_processing_leases WHERE lease_key = 'candidate_projection:' || :candidate_id;
Step 10: Return HTTP 200 OK.
```

### 6.3 Job AI Enrichment & Embedding Pipeline (`/internal/tasks/job/enrich`)

Conforms strictly to `05_jobs_AI_Job_Profile_JSONB_Contract_v1_step1.md` and `05_jobs_AI_Job_Embedding_Architecture_v1_step2.md`:

```text
Step 1: Receive Cloud Task POST payload:
        { "schema_version": 1, "event_id": "UUID", "aggregate_id": "JOB_ID", "trace_id": "UUID" }
Step 2: Validate OIDC Token & Check processed_events for ('job_enrichment', event_id).
Step 3: Acquire Processing Lease (Atomic):
          INSERT INTO event_processing_leases (lease_key, consumer_name, event_id, expires_at, worker_id)
          VALUES ('job_enrichment:' || :job_id, 'job_enrichment', event_id, NOW() + INTERVAL '5 minutes', :worker_id)
          ON CONFLICT (lease_key) DO NOTHING;
          - If 0 rows inserted -> duplicate task / another worker holds lease; Return HTTP 200 OK.
Step 4: Load Job & Related Metadata (Read-Only):
        - SELECT id, updated_at, title, description, requirements, responsibilities, employment_type, work_mode, experience_min_years, experience_max_years, salary_min, salary_max, currency, location_city, location_state, location_country, location_remote, deleted_at FROM jobs WHERE id = aggregate_id AND deleted_at IS NULL;
        - Load job_skills, job_locations, job_categories.
        - Store current updated_at for stale guard.
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
Step 5.5: Check Stale Job Guard (Optimistic Concurrency):
        - Re-read current updated_at from jobs WHERE id = aggregate_id.
        - If current updated_at != stored updated_at:
            Log "Stale job enrichment detected; skipping write."
            Return HTTP 200 OK.
Step 6: Atomic Commit:
        BEGIN;
          - UPDATE jobs SET
              ai_ideal_candidate_profile = :ai_profile_json,
              embedding = :embedding_vector,
              embedding_status = 'completed',
              embedding_model = :model_name,
              embedding_version = :model_version,
              embedding_generated_at = NOW()
            WHERE id = aggregate_id
              AND updated_at = :stored_updated_at;
          - Verify row count = 1. If 0 rows updated -> stale guard already caught it; handle gracefully.
          - INSERT INTO processed_events (consumer_name, event_id, result_metadata) VALUES ('job_enrichment', event_id, ...);
        COMMIT;
Step 7: Release Processing Lease:
        DELETE FROM event_processing_leases WHERE lease_key = 'job_enrichment:' || :job_id;
Step 8: Return HTTP 200 OK.
```

### 6.3 AI Match/Gap Analysis Pipeline (`/internal/tasks/match/analyze`)

Conforms to `REQUIREMENT.txt` Section 8 and `PRODUCT-REQUIREMENTS.md` Section 10:

**Snapshot Policy**: Match analysis MUST use the application-time state (job requirements and candidate profile as-of submission) to ensure score stability. If `application_profile_snapshots` or equivalent application-time state capture is available, use it. Otherwise, use current job and candidate state and document that scores may drift if source data changes.

```text
Step 1: Receive Cloud Task POST payload:
        { "schema_version": 1, "event_id": "UUID", "aggregate_id": "APPLICATION_ID", "trace_id": "UUID" }
Step 2: Validate OIDC Token & Check processed_events for ('match_analysis', event_id).
Step 3: Acquire Processing Lease (Atomic):
          INSERT INTO event_processing_leases (lease_key, consumer_name, event_id, expires_at, worker_id)
          VALUES ('match_analysis:' || :application_id, 'match_analysis', event_id, NOW() + INTERVAL '5 minutes', :worker_id)
          ON CONFLICT (lease_key) DO NOTHING;
          - If 0 rows inserted -> duplicate task / another worker holds lease; Return HTTP 200 OK.
Step 4: Load Application + Job + Candidate Data (Read-Only):
        - SELECT FROM job_applications WHERE id = aggregate_id AND deleted_at IS NULL
        - Load application-time job snapshot if available, else current job
        - Load application-time candidate snapshot if available, else current candidate profile + active resume parsed data
Step 4: AI Structured Match Calculation (Outside DB Transaction):
        - Call AI Provider with candidate evidence vs job requirements
        - Validate output against MatchAnalysisSchema:
          {
            "schema_version": 1,
            "overall_match_percentage": 0-100,
            "skill_match": {"score": 0-100, "matched": [], "missing": []},
            "experience_match": {"score": 0-100, "details": "..."},
            "education_match": {"score": 0-100, "details": "..."},
            "location_match": {"score": 0-100, "details": "..."},
            "salary_match": {"score": 0-100, "details": "..."},
            "requirement_gap": ["Docker", "Kubernetes", "AWS"],
            "metadata": {"model": "...", "model_version": "...", "generated_at": "..."}
          }
Step 5: Atomic Commit:
        BEGIN;
          - UPDATE job_applications SET
              ai_match_score = :overall_score,
              ai_match_details = :match_json,
              ai_ranking_score = :ranking_score
            WHERE id = aggregate_id;
          - INSERT INTO processed_events (consumer_name, event_id, result_metadata) VALUES ('match_analysis', event_id, ...);
          - OPTIONAL: INSERT INTO outbox_events for downstream notification
        COMMIT;
Step 6: Release Processing Lease:
        DELETE FROM event_processing_leases WHERE lease_key = 'match_analysis:' || :application_id;
Step 7: Return HTTP 200 OK.
```

Rules: Match calculation is **decision support only**, not automatic hiring verdict. Gap analysis must list specific missing requirements. Human review/override must be supported.

### 6.5 Analytics Events Emission

FastAPI must emit idempotent `analytics_events` for worker activities. Verified against `13_analytics.sql`:

| Event name | Category | Entity type | When |
|---|---|---|---|
| `resume_parsed` | recruitment | document | Parsing completed/failed |
| `candidate_projection_rebuilt` | recruitment | candidate | Projection upserted |
| `job_enriched` | recruitment | job | Job AI profile + embedding completed |
| `match_analyzed` | recruitment | application | Match analysis completed |
| `embedding_generated` | system | job/candidate | Embedding created/updated |

Rules:
- `idempotency_key` format: `fastapi:worker_name:event_type:event_id` (unique, non-blank, lowercase)
- `event_name` must match pattern `^[a-z0-9]+([._-][a-z0-9]+)*$` (lowercase enforced by trigger)
- `event_category` must be one of: `engagement`, `conversion`, `recruitment`, `user`, `search`, `feature`, `system`
- `source` = `fastapi` (valid enum value in baseline)
- `entity_type`/`entity_id` must both be NULL or both non-NULL
- `event_data` must be JSONB object
- Strip all PII, secrets, raw resume text from `event_data`
- `trace_id` should link to the worker execution trace
- Emit in same transaction as domain result when possible

### 6.6 Interview AI Summary (`/internal/tasks/interview/summary`)

Conforms to `10_interviews.sql` `interview_feedback.ai_summary`:

```text
Step 1: Receive Cloud Task POST payload:
        { "schema_version": 1, "event_id": "UUID", "aggregate_id": "INTERVIEW_ID", "trace_id": "UUID" }
Step 2: Validate OIDC Token & Check processed_events.
Step 3: Load interview + feedback + context (read-only).
Step 4: AI generates concise summary of strengths, weaknesses, and overall assessment.
Step 5: Atomic Commit:
        BEGIN;
          - UPDATE interview_feedback SET ai_summary = :summary WHERE participant_id = :participant_id AND interview_id = aggregate_id;
          - INSERT INTO processed_events ...
        COMMIT;
```

Rules: AI summary is optional assistance only. Never overwrite human-submitted final feedback (`is_final = TRUE`).

### 6.7 AI Screening Questions Generation

#### 6.7.1 Job-Level Screening Questions (`/internal/tasks/job/screening-questions`)

Conforms to `REQUIREMENT.txt` Section 9 and `05_jobs.sql` `jobs.screening_questions`:

```text
Step 1: Receive Cloud Task POST payload:
        { "schema_version": 1, "event_id": "UUID", "aggregate_id": "JOB_ID", "trace_id": "UUID" }
Step 2: Validate OIDC Token & Check processed_events.
Step 3: Load job + job_skills + job_requirements (read-only).
Step 4: AI generates generic screening questions based on job requirements and skills.
Step 5: Validate output schema:
        [
          {"id": "...", "question": "Willing to relocate?", "category": "logistics", "required": true},
          ...
        ]
Step 6: Atomic Commit:
        BEGIN;
          - UPDATE jobs SET screening_questions = :questions_json WHERE id = aggregate_id;
          - INSERT INTO processed_events ...
        COMMIT;
```

Rules: Questions are decision support only. Sensitive/illegal question policies must be enforced. Generated questions must not replace human recruiter judgment.

#### 6.7.2 Candidate-Specific Screening Questions (Future)

Candidate-specific questions depend on individual resume evidence and are application/interview-contextual. They must NOT be stored in `jobs.screening_questions`. Storage schema and endpoint are **future scope** pending application-level or interview-specific entity definition.

---

## 7. Embedding Compatibility & Symmetric Semantic Text Builders

> [!CAUTION]
> **Cosine Similarity Correctness Rule**: Two vectors in pgvector are **comparable** if generated with the **same embedding model/version** and **same vector dimension**. Consistent symmetric semantic text construction is strongly recommended for matching quality and distribution consistency.
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

### 7.3 Universal Multi-Provider AI Architecture & 4 Runtime Modes

The service implements a **Universal Pluggable Provider Architecture** decoupled via `app/providers/base.py`. Any environment can select its AI backend seamlessly via `.env` configuration without code changes.

```text
┌──────────────────────────────────────────────────────────────────────────────────┐
│                         UNIVERSAL PROVIDER FACTORY (base.py)                     │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │
                 ┌───────────────────────┼───────────────────────┬───────────────────────┐
                 ▼                       ▼                       ▼                       ▼
    [1. vertexai.py]            [2. gemini.py]          [3. openai.py]          [4. mock.py]
    Google Cloud Vertex AI       Google AI Studio        OpenAI Provider         Offline Mock
    (0-Key IAM Enterprise)       (API Key Mode)          (API Key Mode)          (Deterministic Test)
```

#### 7.3.1 The 4 Supported Runtime Modes

| Mode (`AI_PROVIDER`) | Auth Mechanism | Primary Use Case | Concurrency & Limits | Data Privacy / Compliance |
|---|---|---|---|---|
| **`vertexai`** *(Recommended Prod/Dev)* | **0-Key IAM** via Google Cloud ADC / Service Account | Production Cloud Run & Local Dev | **2,000+ RPM** / 4M TPM (No daily cap) | **100% Private** (Google NEVER trains on candidate PII) |
| **`gemini`** | API Key (`GEMINI_API_KEY`) via Google AI Studio | Free Developer Testing / Staging | 15 RPM / 1,500 requests/day | Free tier prompts may be logged by Google |
| **`openai`** | API Key (`OPENAI_API_KEY`) | Cross-Vendor Deployment / Fallback | Based on OpenAI Tier (e.g. Tier 1-5) | Standard OpenAI enterprise terms |
| **`mock`** | Zero Keys / In-Memory | Unit Tests & CI/CD Pipelines | Unlimited / Instant | 100% In-Memory Synthetic Fixtures |

#### 7.3.2 0-Key IAM (Vertex AI) Local Dev & Production Workflow

* **Local Machine (Development)**:
  1. Developer logs in once via Google Cloud SDK: `gcloud auth application-default login`.
  2. Google stores Application Default Credentials (ADC) locally.
  3. Set `.env`: `AI_PROVIDER=vertexai`, `EMBEDDING_PROVIDER=vertexai`, `GOOGLE_CLOUD_PROJECT_ID=your-gcp-project`.
  4. Worker runs locally with 0 API keys, full 2,000+ RPM throughput, and enterprise privacy!
* **Cloud Run (Production)**:
  1. Cloud Run automatically attaches its runtime Service Account (`fastapi-worker-sa@project-id.iam.gserviceaccount.com`).
  2. IAM role `roles/aiplatform.user` grants direct Vertex AI access with zero secrets in environment variables.

#### 7.3.3 Configuration Reference (`.env.example`)

```bash
# Provider Selection: vertexai | gemini | openai | mock
AI_PROVIDER=vertexai
EMBEDDING_PROVIDER=vertexai

# Google Cloud Vertex AI (0-Key IAM Mode)
GOOGLE_CLOUD_PROJECT_ID=binay-job-portal-prod
GCP_REGION=asia-south1

# Optional API Keys (Only required if AI_PROVIDER is set to gemini or openai)
GEMINI_API_KEY=
OPENAI_API_KEY=
```

---

## 8. Target Directory Structure for `07-fastapi-ai-worker`

You will build the component cleanly under `07-fastapi-ai-worker/`:

```text
07-fastapi-ai-worker/
├── README.md                      # Complete 13-section component documentation
├── Dockerfile                     # Multi-stage, non-root, slim Python container with Tesseract OCR
├── pyproject.toml                 # Dependency declaration (single source of truth)
├── uv.lock                        # Deterministic lockfile
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
│   │   ├── base.py                # Abstract Base Classes & Universal Provider Factory
│   │   ├── vertexai.py            # Google Cloud Vertex AI (0-Key IAM Enterprise provider)
│   │   ├── gemini.py              # Google AI Studio (API Key mode provider)
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

## 10. Agent Execution Protocol & Source-of-Truth Rules

### 10.1 Hard Gate: Phase 0 Is Read-Only

> **During Phase 0, you MUST NOT create, edit, delete, rename, move, migrate, format, or auto-fix any project file. Phase 0 is strictly read-only analysis.**

After Phase 0, you MUST stop and present your audit report. Do not proceed to implementation without explicit user approval.

### 10.2 Conflict Resolution

See Section 2 for the full source-of-truth hierarchy. When documents conflict:
1. Do not silently ignore baseline SQL
2. Do not silently reinterpret this prompt
3. Do not write guessed workarounds in code
4. Report the exact conflict in Phase 0 as a blocker/decision required

### 10.3 Implementation Scope Restriction

Implementation changes are limited to:
- `07-fastapi-ai-worker/` — main worker code
- `contracts/events/` and `contracts/tasks/` — shared schemas

Database migration changes are allowed **only if**:
1. Phase 0 audit proves a genuine schema gap exists
2. The change is necessary for implementation
3. You have received explicit user approval

**Do NOT silently rewrite existing baseline migration files.**

### 10.4 Migration Creation Rule

`event_processing_leases` table already exists in `02-database/migrations/baseline/15_infrastructure.sql`. Do not create duplicate tables or migrations unless Phase 0 proves a schema change is actually required and missing.

---

## 11. Phased Implementation Roadmap for the Senior Architect

Execute the build in clean, disciplined phases:

```text
┌───────────────────────────────────────────────────────────────────────────────┐
│ PHASE 0: Pre-Flight Audit, Environment & Contracts Initialization            │
├───────────────────────────────────────────────────────────────────────────────┤
│ 1. Validate baseline migrations in 02-database/migrations/baseline/.         │
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

## 12. Phase 0 — Read-Only Audit Requirements

### 12.1 Phase 0 Gate

> **HARD GATE: During Phase 0, do NOT create, modify, delete, rename, move, migrate, format, or auto-fix any project file. Phase 0 is strictly read-only analysis.**

Only after the audit has been completed and validated may implementation begin.

### 12.2 Audit Checklist

Recursively inspect the repository and verify:

1. **Source-of-truth hierarchy** (see Section 2)
2. Existing architecture and component boundaries
3. Database contracts, constraints, triggers, RLS policies, and actual role grants
4. API/event/task payload contracts
5. Security boundaries and authentication flows
6. Existing FastAPI code (old reference code status)
7. Deployment assumptions and topology
8. **Contradictions and unresolved decisions**

### 12.3 Phase 0 Output Format

After completing the audit, present a structured report containing:

1. **VERIFIED**
   - Contracts from this prompt that match baseline SQL exactly

2. **BLOCKERS**
   - Implementation-stopping schema/architecture conflicts

3. **MISMATCHES**
   - Prompt vs baseline discrepancies that need resolution

4. **CLARIFICATIONS NEEDED**
   - Areas where authoritative sources are ambiguous

5. **OPTIONAL IMPROVEMENTS**
   - Non-blocking architecture/code-quality observations

6. **PROPOSED IMPLEMENTATION PLAN**
   - Exactly what will be built in each phase
   - Which files will be created
   - Which existing files will be modified
   - Whether any database migration is required

7. **FINAL PHASE-0 VERDICT**
   - `READY FOR IMPLEMENTATION`
   - OR `BLOCKED — DECISION REQUIRED`

### 12.4 Post-Audit Gate

After presenting the Phase 0 report, **STOP and wait for explicit user approval**. Do not proceed to implementation without it.

---

## 13. Error Handling & Retry Semantics

All worker endpoints must return explicit, deterministic HTTP status codes to guide Cloud Tasks retry behavior correctly:

| Condition | HTTP Status | Cloud Tasks Behavior | Internal Classification |
|---|---|---|---|
| Duplicate task / already processed | `200 OK` | No retry | `duplicate` |
| Already completed / terminal state | `200 OK` | No retry | `terminal` |
| Stale projection coalesced | `200 OK` | No retry | `coalesced` |
| Scan pending / not ready yet | `503 Service Unavailable` | Retries with backoff | `retryable` |
| AI provider timeout / rate limit | `503 Service Unavailable` | Retries with backoff | `retryable` |
| Database unavailable / constraint | `503 Service Unavailable` | Retries with backoff | `retryable` |
| Invalid permanent payload / malware | `200 OK` (dead-letter) | No retry | `terminal` |
| Programming bug / unhandled exception | `500 Internal Server Error` | Retries (then dead-letter) | `retryable` → `terminal` |

Rules:
- `2xx` means "this task is finished; do not retry." Use only for terminal, duplicate, or coalesced outcomes.
- `503` means "temporary failure; retry later." Use for transient infrastructure/provider issues.
- `500` means "unexpected error; investigate before retrying." Cloud Tasks will retry but should eventually dead-letter.
- Never return `200` for conditions that should be retried. Cloud Tasks does not retry `2xx`.
- Log every outcome with `event_id`, `trace_id`, worker type, duration, status, and internal classification.

---

## 14. Concurrent Duplicate Prevention: `event_processing_leases`

### 14.1 Why This Is Needed

`processed_events` provides idempotency for committed side effects, but it cannot prevent concurrent duplicate Cloud Tasks from both starting expensive AI work before either commits. The `event_processing_leases` table provides atomic, application-level processing ownership for non-resume pipelines.

### 12.2 Table Schema

Defined in `02-database/migrations/baseline/15_infrastructure.sql`:

```sql
CREATE TABLE event_processing_leases (
    lease_key       VARCHAR(255) PRIMARY KEY,
    consumer_name   VARCHAR(100) NOT NULL,
    event_id        UUID NOT NULL REFERENCES outbox_events(id) ON DELETE CASCADE,
    locked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,
    worker_id       VARCHAR(255),
    result_metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_worker_leases_expiry
    ON event_processing_leases(expires_at);
```

### 12.3 Lease Acquisition Pattern

```text
Step X: Acquire Processing Lease (Atomic):
        INSERT INTO event_processing_leases (lease_key, consumer_name, event_id, expires_at, worker_id)
        VALUES ('pipeline_name:' || :aggregate_id, 'pipeline_name', event_id, NOW() + INTERVAL '5 minutes', :worker_id)
        ON CONFLICT (lease_key) DO NOTHING;
        
        - If 0 rows inserted -> another worker holds lease; Return HTTP 200 OK (coalesced).
        - If 1 row inserted -> lease acquired; proceed with expensive work.
```

### 12.4 Lease Release Pattern

```text
Step Y: Release Processing Lease:
        DELETE FROM event_processing_leases WHERE lease_key = 'pipeline_name:' || :aggregate_id;
        - Execute in try/finally to ensure release even on errors.
```

### 12.5 Stale Lease Cleanup

Leases have `expires_at`. A Supabase Cron job or periodic cleanup task should:

```sql
DELETE FROM event_processing_leases
WHERE expires_at < NOW()
  AND locked_at < NOW() - INTERVAL '10 minutes';
```

This prevents abandoned leases from blocking future processing indefinitely.

### 12.6 Pipelines Using Leases

| Pipeline | Lease Key Pattern | Lease Duration |
|---|---|---|
| Candidate Projection | `candidate_projection:{candidate_id}` | 5 minutes |
| Job Enrichment | `job_enrichment:{job_id}` | 5 minutes |
| Match Analysis | `match_analysis:{application_id}` | 5 minutes |

Resume parsing uses `resume_parsing_jobs` claim/lease instead.

---

## 15. Key Technical Quality Standard

- **Zero "Magic" Strings**: Every event type, table name, status enum, database column, and internal capability/role is defined in typed Python enums and constants. External provider model names (e.g. `gemini-2.5-flash`, `text-embedding-004`) are runtime configuration validated via settings, NOT hardcoded enums, because they change frequently and must be swappable without code changes.
- **Strict Async for I/O; Blocking Work Isolated**: Use `async`/`await` for all database queries, HTTP requests, and storage operations. CPU-heavy parsers and OCR must run in isolated thread/process pools or subprocesses with timeouts — never directly in the async event loop.
- **Never Hold Transactions Open**: DB connections are checked out only for quick queries and atomic commits, NEVER during external LLM API calls or document downloads.
- **Clean Error Envelopes**: Errors return standard HTTP status codes (`200` for fatal non-retryable/dedup skip, `500` for retryable infrastructure transient errors) to guide Cloud Tasks retry policies accurately.
- **Production Standard**: Your code must be production-deployable without further architectural refactoring.
- **Single Dependency Source of Truth**: `pyproject.toml` is the single source of truth for dependencies. `uv.lock` provides deterministic builds. Do not maintain duplicate version pins in `requirements.txt` or other files.
