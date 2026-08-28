# 07-fastapi-ai-worker — FastAPI AI Background Worker

> **Production-grade private Cloud Run service for AI-powered resume parsing, candidate search projections, and job enrichment within the Binay Job Portal ecosystem.**

[← Main Project README](../README.md) · [Requirements](../01-requirements/README.md) · [Database](../02-database/README.md) · [Shared Contracts](../contracts/README.md)

---

## 1. Executive Summary & Component Purpose

`07-fastapi-ai-worker` is a **private, zero-trust, asynchronous background worker** deployed on Google Cloud Run. It executes resource-intensive AI and vector-embedding workloads dispatched via Google Cloud Tasks by the NestJS core backend.

Security-scan deployment artifacts: [`deployment/README.md`](deployment/README.md) · [`deployment/cloud-run-sidecar.yaml`](deployment/cloud-run-sidecar.yaml) · [`docker-compose.security-scan.yml`](docker-compose.security-scan.yml)

### Primary Responsibilities:
1. **Resume Parsing (PD-001)**: Extracts unstructured text, performs OCR fallback, runs structured candidate data extraction via LLM, and persists immutable parsing results and artifacts.
2. **Candidate Search Projection (PD-002)**: Rebuilds search profiles by merging canonical profile facts with active resume data, generating symmetric semantic text, and producing 768-dimensional vector embeddings stored in `candidate_search_profiles`.
3. **Job AI Enrichment (JD-001)**: Enriches job descriptions into structured `ai_ideal_candidate_profile` JSONB (contract v1) and generates 768-dimensional semantic embeddings stored directly in `jobs`.
4. **Resume Security Scan**: Calls the private ClamAV daemon through the `clamd` client before parsing is queued. The daemon is supplied by the Cloud Run `clamav` sidecar; the Python image alone is not a scanner.

---

## 2. Architecture & End-to-End System Topology

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            NESTJS CORE API (04)                            │
│  - User authentication & tenant business logic                              │
│  - Inserts state changes + records transactional outbox_events              │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
                       Supabase PostgreSQL Database
                                       │
                                       │ Realtime CDC / Polling
                                       ▼
                      Outbox Dispatcher (Cloud Run)
                                       │
                                       │ Creates Tasks with OIDC Token
                                       ▼
                          Google Cloud Tasks Queue
                                       │
                                       │ POST with Bearer OIDC Token
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                  FASTAPI AI WORKER (07-fastapi-ai-worker)                  │
│                                                                             │
│   1. Validate Google OIDC Bearer Token                                      │
│   2. Idempotency Check on processed_events (dual guard)                    │
│   3. Acquire 5-Minute Atomic Lease (event_processing_leases)                │
│   4. Download Document / Read DB Aggregate                                 │
│   5. Execute LLM Structured Extraction / 768-dim Embedding (Outside DB TX)  │
│   6. Optimistic Stale Concurrency Check (Coalescing Protection)            │
│   7. Atomic DB Commit (UPSERT + processed_events + outbox_events)           │
│   8. Release Lease & Return HTTP 200 OK                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

Security-scan deployment topology (Cloud Run multi-container service):

```text
Cloud Tasks (OIDC) -> FastAPI ingress :8080 -> clamd sidecar :3310 (localhost)
                                             -> scan result + status transaction
```

---

## 3. Task Endpoints & Workloads

All endpoints are hosted under the `/internal` prefix and expect structured task payloads:

| Route | Payload Contract | DB Constraint / Baseline | Chained Outbox Event |
|---|---|---|---|
| `POST /internal/tasks/resume/parse` | `contracts/tasks/resume-parse-task.v1.json` | `07_resume_processing.sql` | `candidate.resume.parsed` |
| `POST /internal/tasks/candidate/projection` | `contracts/tasks/candidate-projection-task.v1.json` | `08_candidates.sql` | `candidate.projection.rebuilt` |
| `POST /internal/tasks/job/enrich` | `contracts/tasks/job-enrich-task.v1.json` | `05_jobs.sql` | `job.enriched` |
| `POST /internal/tasks/security/scan` | `contracts/tasks/security-scan-task.v1.json` | `06_documents.sql` | `resume.parse.requested` after clean scan |

### Health Probes:
- `GET /health/liveness` — Returns HTTP 200 if ASGI process is alive.
- `GET /health/readiness` — Tests PostgreSQL connectivity and connection pool readiness.

---

## 4. Zero-Trust Security & Google OIDC Verification

The worker implements defense-in-depth security:
1. **Cloud Run IAM Ingress**: Configured with `--ingress=internal` to reject public traffic at the infrastructure perimeter.
2. **Application-Level OIDC Verification**: [`OIDCTokenValidator`](app/core/security.py) fetches Google's public JWKS (`https://www.googleapis.com/oauth2/v1/certs`), checks RS256 signature, validates issuer (`https://accounts.google.com`), verifies expected audience, and enforces strict service account allowlisting (`GCP_ALLOWED_SERVICE_ACCOUNTS`).
3. **Non-Root Container Execution**: Runs as non-root user `appuser` (UID 1000).

---

## 5. Dual Idempotency & Concurrency Model

To prevent redundant AI API expenses and race conditions:

### Dual Guard Architecture:
1. **Committed Idempotency (`processed_events`)**:
   - Every completed task records `(consumer_name, event_id)` inside the final atomic transaction.
   - If a duplicate task arrives after completion, it immediately returns `HTTP 200 OK (skipped=True)`.
2. **In-Flight Concurrency Lease (`event_processing_leases`)**:
   - Before starting expensive AI processing, the worker attempts an atomic `INSERT INTO event_processing_leases (lease_key, expires_at) ... ON CONFLICT DO NOTHING`.
   - If 0 rows are inserted, another concurrent worker is already handling the item. The task skips and returns `HTTP 200 OK (reason="lease_held")`.
3. **Optimistic Concurrency & Stale Revision Guard**:
   - For candidate search projections: If `candidate_profiles.profile_revision` or active resume ID changed during LLM/Embedding calls, the update aborts and returns `HTTP 200 OK (coalesced=True)`.
   - For jobs: `WHERE id = :job_id AND updated_at = :stored_updated_at` guarantees recent HR edits are never overwritten by stale background AI tasks.

---

## 6. Symmetric Semantic Search Architecture

Search symmetry ensures cosine distance in `pgvector` accurately reflects candidate-job fit:

- **Candidate Builder**: [`CandidateSemanticTextBuilder`](app/services/semantic_builders.py)
  - Assembles: Title, Headline, Location, Total Experience, Canonical Skills, Active Resume Skills, Experience Summary, Education, Certifications.
- **Job Builder**: [`JobSemanticTextBuilder`](app/services/semantic_builders.py)
  - Assembles: Title, Category, Employment Type, Work Mode, Experience Required, Location, Required Skills, Responsibilities, Requirements, AI Domain & Concepts.
- **Embedding Dimensions**: Exact **768-dimensional float vectors** matching `vector(768)` in `08_candidates.sql` and `05_jobs.sql`.

---

## 7. Pluggable AI Providers (4 Universal Modes)

AI provider architecture is decoupled via [`LLMProvider`](app/providers/base.py) and [`EmbeddingProvider`](app/providers/base.py):

| Provider (`AI_PROVIDER`) | LLM Implementation | Embedding Model | Auth Mechanism & Key Handling |
|---|---|---|---|
| **`vertexai`** *(Recommended)* | `VertexAILLMProvider` (`gemini-2.0-flash`) | `VertexAIEmbeddingProvider` (`text-embedding-004`) | **0-Key IAM** via Google Cloud ADC / Cloud Run SA |
| **`gemini`** | `GeminiLLMProvider` (`gemini-2.5-flash`) | `GeminiEmbeddingProvider` (`text-embedding-004`) | API Key via `GEMINI_API_KEY` (AI Studio Free Tier) |
| **`openai`** | `OpenAILLMProvider` (`gpt-4o-mini`) | `OpenAIEmbeddingProvider` (`text-embedding-3-small`) | API Key via `OPENAI_API_KEY` (768-dim) |
| **`mock`** | `MockLLMProvider` | `MockEmbeddingProvider` | Zero Keys / Deterministic 768-dim in-memory fixtures |

---

## 8. Document Processing & Security

- **Allowed Formats**: PDF (`application/pdf`), DOCX (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`), TXT (`text/plain`).
- **Magic Bytes Validation**: Verifies `%PDF` and `PK` ZIP archive signatures regardless of file extension.
- **Hostile Input Defense**: Untrusted text is strictly wrapped in `<untrusted_resume_content>` XML tags in the LLM prompt to prevent prompt injection attacks.
- **Limits**: Maximum file size 10MB, maximum PDF pages 15, text truncation cap 100,000 characters.

---

## 9. Database Alignment & Transactional Outbox

All writes occur in a single atomic `db_manager.transaction()`:
- `jobs`: Updates `ai_ideal_candidate_profile`, `ai_profile_model`, `ai_profile_version`, `ai_generated_at`, `embedding`, `embedding_status = 'completed'`, `embedding_model`, `embedding_version`, `embedding_generated_at`.
- `candidate_search_profiles`: Revision-guarded UPSERT with `search_vector`, `embedding`, `fact_sources`.
- `processed_events`: Inserts consumer tracking record.
- `outbox_events`: Emits downstream domain events (`job.enriched`, `candidate.projection.rebuilt`, `candidate.resume.parsed`).
- `analytics_events`: Emits observability events for AI processing latency, token usage, and outcome tracking.

---

## 10. Error Classification & Cloud Tasks Retry Matrix

| Outcome | HTTP Status | Cloud Tasks Action | Reason |
|---|---|---|---|
| Success | `200 OK` | Acknowledge (No Retry) | Completed normally |
| Duplicate / Lease Collision | `200 OK` | Acknowledge (No Retry) | Idempotently skipped |
| Stale Source Coalesced | `200 OK` | Acknowledge (No Retry) | Coalesced with newer state |
| Security Scan Pending | `503 Service Unavailable` | Retry with Backoff | Document being scanned by antivirus |
| AI Rate Limit / Timeout | `503 Service Unavailable` | Retry with Backoff | Transient provider error |
| DB Connection Timeout | `503 Service Unavailable` | Retry with Backoff | Transient infrastructure error |
| Fatal Bug / Unhandled | `500 Internal Server Error` | Retry → Dead Letter | Unexpected exception |

### Retry Tracking:
- Each task attempt increments an `attempt_number` counter in the task context to track retry progression and prevent infinite retry loops on unrecoverable errors.

---

## 11. Local Development & Setup

### Prerequisites:
- Python `>=3.11`
- PostgreSQL with `pgvector` extension (optional for unit tests; mock mode requires zero DB)

### Setup Instructions:
```powershell
# Navigate to worker directory
cd 07-fastapi-ai-worker

# Create virtual environment and install dependencies
python -m venv .venv
.venv\Scripts\python.exe -m pip install -e .[dev]

# Configure environment variables
cp .env.example .env

# Run development server
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

---

## 12. Containerization & Production Cloud Run Deployment

### Docker Multi-Stage Build:
- **Base Image**: `python:3.11-slim`
- **Builder Stage**: Installs `build-essential`, `libpq-dev`, creates virtualenv.
- **Runtime Stage**: Copies `/opt/venv`, installs `curl`, `tesseract-ocr`, `libtesseract5`, `postgresql-client`.
- **User**: `appuser` (UID 1000).
- **Healthcheck**: `HEALTHCHECK --interval=30s --timeout=10s CMD curl -f http://localhost:8000/health/liveness || exit 1`.

> This Dockerfile intentionally contains the FastAPI application only. It does
> not install or run the ClamAV daemon. For the security-scan route, deploy the
> application with the `clamav` sidecar using
> [`deployment/cloud-run-sidecar.yaml`](deployment/cloud-run-sidecar.yaml), or
> use [`docker-compose.security-scan.yml`](docker-compose.security-scan.yml)
> locally. The sidecar image must be pinned by digest before production.

### Cloud Run Deployment Command:
```bash
gcloud run deploy fastapi-ai-worker \
  --image gcr.io/$PROJECT_ID/fastapi-ai-worker:latest \
  --platform managed \
  --region asia-south1 \
  --no-allow-unauthenticated \
  --ingress internal \
  --service-account fastapi-worker-sa@$PROJECT_ID.iam.gserviceaccount.com \
  --memory 2Gi \
  --cpu 2 \
  --concurrency 10 \
  --min-instances 1 \
  --max-instances 10 \
  --set-env-vars OIDC_AUTH_ENABLED=true,AI_PROVIDER=gemini,EMBEDDING_PROVIDER=gemini
```

---

## 13. Automated Test Suite & Coverage Verification

Run all unit and integration tests with pytest coverage:
```powershell
.venv\Scripts\python.exe -m pytest -v --cov=app --cov-report=term-missing
```

### Test Suite Structure:
```
tests/
├── conftest.py                             # Async client fixtures & test configuration
├── mocks/
│   └── mock_llm_responses.py              # Synthetic LLM JSON fixtures
├── unit/
│   ├── test_oidc_security.py              # OIDC signature, audience & allowlist checks
│   ├── test_document_extractor.py         # PDF, DOCX, TXT magic bytes & limits
│   ├── test_document_extractor_branches.py # Document extractor validation branches
│   ├── test_document_extractor_edge_cases.py # Security: zip bomb, path traversal, size limits
│   ├── test_prompt_injection_defense.py   # Untrusted XML tagging & prompt defense
│   ├── test_schemas.py                    # Unified task payloads & validation
│   ├── test_semantic_builders.py          # Symmetric text templates & formatting
│   ├── test_health.py                     # Liveness and readiness endpoints
│   ├── test_repositories.py               # DB repository methods & transactions
│   ├── test_database_branches.py          # DatabaseManager branches (session, transaction, lease)
│   ├── test_database_lifecycle.py         # DB init, shutdown, session success/rollback
│   ├── test_logging_branches.py           # PII redaction patterns (email, phone, bearer, api_key)
│   ├── test_logging_edge_cases.py         # PII edge cases (empty, non-string, nested dicts)
│   ├── test_enums.py                      # Domain enums validation
│   ├── test_exceptions.py                 # Custom exception classes
│   ├── test_provider_factories.py         # LLM/embedding provider selection logic
│   ├── test_job_ai_service.py             # Job enrichment domain service
│   ├── test_job_ai_service_branches.py    # Job AI fallback skills, embedding, enrich_job
│   ├── test_job_schemas.py                # Job JSONB contract v1
│   ├── test_candidate_schemas.py          # Candidate projection & fact sources
│   ├── test_projection_service.py         # Candidate fact merging & ranking
│   ├── test_projection_service_branches.py # Empty aggregate, resume skills merge, generate_projection
│   ├── test_handler_idempotency.py        # Duplicate skip, lease held skip, job enrich skip
│   └── test_analytics_repo.py             # Analytics repository emission
├── integration/
│   ├── test_resume_parsing_flow.py        # Complete resume parsing pipeline (PD-001)
│   ├── test_candidate_projection_flow.py  # Complete candidate projection pipeline (PD-002)
│   ├── test_job_enrichment_flow.py        # Complete job enrichment pipeline (JD-001)
│   ├── test_idempotency_dual_guard.py     # processed_events + leases dual guard
│   └── test_stale_revision_coalescing.py  # Optimistic concurrency & stale update protection
```

### Current Status:
- **231 tests passing** (0 failures)
- **81% code coverage** (target >90%)
- Coverage gaps: `task_handlers.py` (73%), `logging.py` (63%), `database.py` (83%), `document_extractor.py` (77%)
