# 07-fastapi-ai-worker — FastAPI AI Background Worker

> Production-grade private Cloud Run service for AI-powered resume parsing, candidate search projections, and job enrichment within the Binay Job Portal ecosystem.

## Quick Links

- [Main Project README](../README.md)
- [Phase 1: Core Foundation & Infrastructure](#phase-1-complete)
- [Phase 2: Resume Parsing](./docs/PHASE_2_RESUME_PARSING.md) (upcoming)
- [Phase 3: Candidate Projections](./docs/PHASE_3_PROJECTIONS.md) (upcoming)
- [Database Schema](../02-database/README.md)
- [Implementation Contract](../01-requirements/future/FAST-API%20PROMPT.md)

---

## 1. What Is This Service?

This is a **private, trusted background worker** deployed on Google Cloud Run. It processes asynchronous events (via Cloud Tasks) from the NestJS API to perform expensive, AI-heavy operations:

1. **Resume Parsing** — Extract text, OCR, and structured candidate data from uploaded documents
2. **Candidate Search Projections** — Rebuild semantic embeddings for candidate search
3. **Job AI Enrichment** — Generate ideal candidate profiles and embeddings for jobs
4. **Match Analysis** — Calculate candidate-job fit scores
5. **Interview Summaries** — AI-powered feedback synthesis

**Key Characteristics:**
- ✅ Private: No public REST API; invoked only by Cloud Tasks via OIDC
- ✅ Zero-trust: Every request validates Google OIDC bearer token
- ✅ Async: Never blocks on external AI/storage calls
- ✅ Idempotent: Processed events + processing leases prevent duplicate work
- ✅ Observable: Structured JSON logging with trace IDs
- ✅ Secure: PII redaction, prompt injection defense, hostile document handling

---

## 2. System Topology

```
┌─ NestJS Main API ─────────────────┐
│ - Business logic & authorization  │
│ - Inserts outbox events + results │
└───────────────┬───────────────────┘
                │
                ▼
        Supabase PostgreSQL
                │
                │ INSERT webhook
                ▼
    Outbox Dispatcher (separate Cloud Run)
                │
                ▼
        Google Cloud Tasks Queue
                │
                ▼
    THIS SERVICE (FastAPI AI Worker)
                │
                ├─ Download document
                ├─ Extract text/OCR
                ├─ Call AI provider
                ├─ Generate embeddings
                │
                ▼
        Insert results + processed_events
```

---

## 3. Architecture Components (Phase 1)

### Core Infrastructure

| Module | Purpose | Key Classes |
|--------|---------|-------------|
| `app/core/config.py` | Pydantic settings | `Settings`, `get_settings()` |
| `app/core/logging.py` | Structured JSON logging + PII redaction | `PIIRedactor`, `configure_logging()` |
| `app/core/security.py` | Google OIDC token validation | `OIDCTokenValidator` |
| `app/core/database.py` | Async PostgreSQL connection pool | `DatabaseManager` |
| `app/core/exceptions.py` | Custom exception hierarchy | `WorkerException`, subclasses |

### Providers (Pluggable AI)

| Module | Purpose |
|--------|---------|
| `app/providers/base.py` | Abstract base classes: `LLMProvider`, `EmbeddingProvider` |
| `app/providers/mock.py` | Mock implementations for deterministic testing |

### Domain Models

| Module | Purpose |
|--------|---------|
| `app/domain/enums.py` | Enum definitions mirroring baseline SQL |

### API Routes

| Module | Purpose |
|--------|---------|
| `app/api/health.py` | `/health/liveness`, `/health/readiness` |
| `app/main.py` | FastAPI app factory with lifespan management |

### Testing

| Module | Purpose |
|--------|---------|
| `tests/conftest.py` | Shared pytest fixtures (mock providers, test DB, etc.) |

### Shared Contracts

| File | Purpose |
|------|---------|
| `contracts/tasks/resume-parse-task.v1.json` | Cloud Task payload schema |
| `contracts/tasks/candidate-projection-task.v1.json` | Candidate projection task schema |
| `contracts/tasks/job-enrich-task.v1.json` | Job enrichment task schema |
| `contracts/events/candidate-projection-rebuilt.v1.json` | Emitted event schema |

---

## 4. Local Development Setup

### Prerequisites

- Python 3.11+
- Tesseract OCR (`sudo apt-get install tesseract-ocr` on Linux)
- PostgreSQL 14+ (or use Docker)

### Installation

```bash
# Clone project & navigate to worker directory
cd 07-fastapi-ai-worker

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -e ".[dev]"

# Copy environment template
cp .env.example .env

# Edit .env with your values (especially DATABASE_URL, AI API keys)
```

### Running Locally

```bash
# Start development server
uvicorn app.main:app --reload --port 8000

# Server will be available at http://localhost:8000
# Health checks: http://localhost:8000/health/liveness
```

### Running Tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=app --cov-report=html

# Run specific test file
pytest tests/unit/test_oidc_security.py -v

# Run async tests
pytest -m asyncio
```

---

## 5. Configuration (Environment Variables)

See `.env.example` for complete list. Key variables:

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/binay

# Google Cloud
GOOGLE_CLOUD_PROJECT_ID=binay-job-portal-prod
GOOGLE_OIDC_ALLOWED_SERVICE_ACCOUNTS=cloud-tasks@project.iam.gserviceaccount.com
OIDC_AUTH_ENABLED=true

# AI Provider
AI_PROVIDER=gemini  # or openai, mock
GEMINI_API_KEY=your-key
GEMINI_MODEL=gemini-2.5-flash

# Logging
LOG_LEVEL=INFO
LOG_FORMAT=json
LOG_REDACT_PII=true
```

---

## 6. OIDC Authentication (Zero-Trust)

Every task request must include a valid Google OIDC bearer token:

```
POST /internal/tasks/resume/parse HTTP/1.1
Authorization: Bearer eyJhbGciOiJSUzI1NiIsI...
```

**Validation Pipeline:**
1. Extract Bearer token from Authorization header
2. Verify RS256 signature using Google JWKS (cached, auto-rotating)
3. Check issuer: `https://accounts.google.com`
4. Check audience: configured URL
5. Check service account email: must be in `ALLOWED_SERVICE_ACCOUNTS`
6. Check expiration: token must be recent (< 1 hour old)

**Result:**
- ✅ Valid → Request proceeds with authenticated claims
- ❌ Invalid → HTTP 401 Unauthorized
- ❌ Unauthorized → HTTP 403 Forbidden

---

## 7. Database Interactions

### Key Tables (Read-Only Audit)

| Table | Purpose | Worker Access |
|-------|---------|----------------|
| `outbox_events` | Event queue | SELECT only |
| `processed_events` | Idempotency records | INSERT only |
| `event_processing_leases` | Concurrent duplicate prevention | INSERT, DELETE |
| `resume_parsing_jobs` | Parse job lifecycle | SELECT, UPDATE (status/lock columns) |
| `resume_parsed_data` | Immutable parse results | INSERT only |
| `candidate_search_profiles` | Search projection cache | UPSERT (with revision guards) |
| `jobs` | Job AI enrichment | UPDATE (ai_ideal_candidate_profile, embedding) |

### Idempotency Strategy (Dual Guard)

**Phase 1 (Resume Parsing):**
```sql
-- Atomic job claim (single operator)
UPDATE resume_parsing_jobs
SET status = 'processing', locked_by = WORKER_ID, locked_at = NOW()
WHERE id = aggregate_id AND status NOT IN ('completed', 'cancelled')
RETURNING ...;
```

**Phases 2+ (Other Pipelines):**
```sql
-- Atomic lease acquisition (prevents concurrent duplicates)
INSERT INTO event_processing_leases (lease_key, consumer_name, event_id, expires_at)
VALUES ('pipeline:' || aggregate_id, 'pipeline_name', event_id, NOW() + 5 min)
ON CONFLICT (lease_key) DO NOTHING;  -- Fail if another worker holds lease
```

**Final Commit:**
```sql
INSERT INTO processed_events (consumer_name, event_id, result_metadata)
VALUES (...) ON CONFLICT (consumer_name, event_id) DO NOTHING;
```

---

## 8. Error Handling & HTTP Status Codes

| Scenario | HTTP Status | Cloud Tasks Action |
|----------|-------------|-------------------|
| Task already processed (duplicate) | `200 OK` | No retry |
| Stale data (coalesced) | `200 OK` | No retry |
| Document validation failed (terminal) | `200 OK` | No retry; dead-letter |
| Document pending security scan | `503 Service Unavailable` | Retry with backoff |
| AI provider rate limit | `503 Service Unavailable` | Retry with backoff |
| Database unavailable | `503 Service Unavailable` | Retry with backoff |
| Bug / unhandled exception | `500 Internal Server Error` | Retry (then dead-letter) |

---

## 9. Logging & Observability

### Structured JSON Format

```json
{
  "timestamp": "2026-08-16T10:30:45.123Z",
  "level": "INFO",
  "logger": "app.services.resume_service",
  "message": "Resume parsing completed",
  "trace_id": "550e8400-e29b-41d4-a716-446655440000",
  "worker_id": "worker-123",
  "parsing_job_id": "660e8400-e29b-41d4-a716-446655440000",
  "duration_ms": 2345
}
```

### PII Redaction

Sensitive data is automatically redacted:
- Emails → `[EMAIL_REDACTED]`
- Phone numbers → `(555) XXX-XXXX`
- Tokens/Keys → `[BEARER_REDACTED]`, `[API_KEY_REDACTED]`
- Resume text → `[REDACTED]` (raw extracted text never logged)

---

## 10. Testing Strategy

### Unit Tests (`tests/unit/`)
- Config validation
- OIDC token parsing
- Enum definitions
- Mock AI provider

### Integration Tests (`tests/integration/`)
- End-to-end resume parsing flow
- Idempotency guards (duplicate suppression)
- Database transactions
- Error scenarios

### Test Fixtures (`tests/conftest.py`)
- Mock AI providers
- In-memory SQLite database
- TestClient for HTTP requests
- Sample Cloud Task payloads

---

## 11. Deployment (Cloud Run)

### Dockerfile

Multi-stage build:
1. **Builder stage:** Install system deps, create venv, pip install
2. **Runtime stage:** Copy venv, non-root user, minimal footprint

### Build & Deploy

```bash
# Build image
docker build -t gcr.io/PROJECT/fastapi-ai-worker:latest .

# Push to GCP
docker push gcr.io/PROJECT/fastapi-ai-worker:latest

# Deploy to Cloud Run (replace PROJECT, REGION, etc.)
gcloud run deploy fastapi-ai-worker \
  --image gcr.io/PROJECT/fastapi-ai-worker:latest \
  --region REGION \
  --service-account cloud-tasks-invoker@PROJECT.iam.gserviceaccount.com \
  --no-allow-unauthenticated \
  --port 8000 \
  --memory 2Gi \
  --timeout 540 \
  --env-file .env.production
```

### IAM Setup

```bash
# Grant Cloud Tasks permission to invoke this service
gcloud run services add-iam-policy-binding fastapi-ai-worker \
  --member=serviceAccount:cloud-tasks@PROJECT.iam.gserviceaccount.com \
  --role=roles/run.invoker
```

---

## 12. Roadmap: Phases 2-7

| Phase | Deliverables | Timeline |
|-------|--------------|----------|
| **Phase 2** | Resume parsing pipeline, document extraction, OCR | Week 2 |
| **Phase 3** | Candidate search projections, semantic builders | Week 3 |
| **Phase 4** | Job AI enrichment, embeddings | Week 3 |
| **Phase 5** | Match analysis, analytics events | Week 4 |
| **Phase 6** | Interview summaries, screening questions | Week 4 |
| **Phase 7** | Containerization, full test coverage, hardening | Week 5 |

---

## 13. Troubleshooting

### Database Connection Fails
```
Error: could not connect to server: Connection refused
```
- Check `DATABASE_URL` in `.env`
- Verify PostgreSQL is running: `pg_isready -h localhost`
- Ensure SSL mode matches: `sslmode=require` for production

### OIDC Token Invalid
```
401 Unauthorized: Invalid issuer
```
- Verify `OIDC_AUTH_ENABLED=true`
- Check `GOOGLE_OIDC_ALLOWED_SERVICE_ACCOUNTS` (comma-separated list)
- Ensure token is fresh (< 1 hour old)

### Tests Fail with "EventLoop"
```
RuntimeError: Event loop is closed
```
- Ensure `pytest-asyncio` is installed
- Use `pytest.mark.asyncio` on async test functions
- Run: `pytest --co -q` to verify test discovery

---

## Contributing

1. Follow Python PEP-8 style (enforced by Black)
2. Add type hints to all functions
3. Write tests for new features
4. Document changes in commit messages
5. Never commit `.env` or secrets

---

## License

Proprietary — Binay Inc.

---

**Last Updated:** 2026-08-16 | **Phase:** 1 (Core Foundation) | **Status:** ✅ Complete
