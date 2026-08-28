# System Architecture Diagram & Complete Technical Blueprint

[← Main README](../../README.md) · [Project Context Map](../../PROJECT-CONTEXT-MAP.md) · [Migration Plan](../../MIGRATION-PLAN-HINGLISH.md)

---

## 🗺️ End-to-End System Architecture

```mermaid
flowchart TD
    subgraph Frontend_Layer["1. Frontend Layer (Next.js 14 / React)"]
        UI_Candidate["Candidate Portal\n(Profile, Resume, Job Search)"]
        UI_Employer["Employer Portal\n(Job Posting, Candidate Match)"]
        UI_Admin["Admin Dashboard\n(Verification, CMS, Analytics)"]
    end

    subgraph Backend_API_Layer["2. Backend Core API (NestJS / TypeScript)"]
        NestJS_API["NestJS API Gateway\n- Auth & RBAC (Jwt, RolesGuard)\n- Business Logic & DTO Validation\n- Atomic Transactions (BEGIN...COMMIT)"]
    end

    subgraph DB_Storage_Layer["3. Database & Storage Layer (Supabase / PostgreSQL)"]
        Supabase_Auth["Supabase Auth\n(auth.users)"]
        Supabase_Storage["Supabase Private Storage\n(job-portal-uploads / Resumes)"]
        Postgres_DB[("Supabase PostgreSQL\n- 82 Tables with RLS Security\n- pgvector (768-dim Vectors)\n- FTS (Full-Text tsvector)\n- outbox_events table")]
    end

    subgraph Event_Dispatcher_Layer["4. Async Event Dispatcher Layer (Cloud Run)"]
        Outbox_Dispatcher["NestJS Outbox Dispatcher\n- Polls / Webhook on outbox_events\n- FOR UPDATE SKIP LOCKED batching\n- Deterministic Task Creation"]
        Cloud_Tasks["Google Cloud Tasks\n- Rate Limiting & Flow Control\n- Bounded Retries with Exponential Backoff\n- Google OIDC Token Security"]
    end

    subgraph AI_Worker_Layer["5. AI & Heavy Processing Worker (FastAPI / Python)"]
        FastAPI_Worker["FastAPI AI Worker (Cloud Run ingress)\n- Document Extraction (PyPDF / Tesseract OCR)\n- Security scan via local ClamAV sidecar\n- Idempotency via processed_events\n- Resume Parser & Job Enricher\n- Candidate Projection Rebuilder"]
        ClamAV_Sidecar["ClamAV clamd sidecar\nlocalhost:3310\nprivate, no public port"]
    end

    subgraph Google_AI_Layer["6. Foundation AI Infrastructure (Google Vertex AI)"]
        Gemini_Flash["Google Vertex AI Gemini Flash\n(Structured JSON Extraction & Reasoning)"]
        Vertex_Embedding["Google Vertex AI text-embedding-004\n(768-dimensional Vector Embeddings)"]
    end

    Expiry_Scheduler["Supabase pg_cron\ndaily_job_expiry_sweep\n35 18 UTC / 12:05 AM IST"]
    Expiry_Function["public.expire_due_jobs()\nstatus + audit + in-app notification"]

    %% Flow Connections
    UI_Candidate & UI_Employer & UI_Admin -->|HTTPS / REST / JWT| NestJS_API
    NestJS_API -->|Auth Validate| Supabase_Auth
    NestJS_API -->|Direct Secure Signed URLs| Supabase_Storage
    NestJS_API -->|Atomic Write: Business Data + outbox_events| Postgres_DB

    Postgres_DB -->|1. Outbox Event Insert Webhook / Claim| Outbox_Dispatcher
    Outbox_Dispatcher -->|2. Push Task with Payload| Cloud_Tasks
    Cloud_Tasks -->|3. POST /internal/tasks/* with OIDC| FastAPI_Worker
    FastAPI_Worker -->|security scan over localhost:3310| ClamAV_Sidecar

    FastAPI_Worker -->|Download Resume PDF| Supabase_Storage
    FastAPI_Worker -->|LLM Structured Extraction| Gemini_Flash
    FastAPI_Worker -->|Generate 768-dim Vector| Vertex_Embedding

    FastAPI_Worker -->|4. Write Immutable Artifacts, Vectors & Projections| Postgres_DB
    Postgres_DB -.->|5. pgvector 768-dim Cosine Match Search| NestJS_API
    Expiry_Scheduler -->|scheduled SQL call| Expiry_Function
    Expiry_Function -->|expire due published/paused jobs| Postgres_DB
```

---

## 🧩 Architectural Layers & Responsibilities

### 1. Frontend Layer (`03-nextjs-web`)
* **Framework:** Next.js 14 (App Router) + React + Tailwind CSS + TypeScript.
* **Target Users:** Candidates (Job Seekers), Employers (Recruiters / Hiring Managers), System Admins.
* **Key Features:** Drag & Drop Resume Upload, Real-Time Fitment Score Badges, Kanban Application Pipeline, AI Matched Job Recommendations.

### 2. Backend Core API Gateway (`04-nestjs-api`)
* **Framework:** NestJS + Fastify / Express + TypeScript.
* **Security & Auth:** JWT Guards, RBAC (`candidate`, `employer`, `hr`, `admin`), Supabase Auth token verification.
* **Transactional Outbox:** Har write transaction mein business rows ke saath `outbox_events` table mein state-change event synchronously commit karta hai (Zero Data Loss guarantee).

### 3. Database & Object Storage Layer (`02-database`)
* **Database:** Supabase Managed PostgreSQL.
* **Scale & Schema:** 82 Normalized relational tables, 82/82 Row Level Security (RLS) policies enabled.
* **AI & Search Extensions:** `pgvector` (for 768-dimensional Vector Cosine Similarity), `pg_trgm` (fuzzy matching), `to_tsvector` (PostgreSQL Full-Text Search).
* **Storage:** Supabase Storage Private Bucket (`job-portal-uploads`) for resumes, certificates, and company verification documents.
* **Job expiry:** Supabase `pg_cron` runs `daily_job_expiry_sweep` at `35 18 * * *` UTC
  (12:05 AM Asia/Kolkata) and calls `public.expire_due_jobs()`. The function atomically updates
  due published/paused jobs, writes `audit_logs`, and creates the approved creator-only in-app
  notification. This deterministic path does not use the Dispatcher or Cloud Tasks.

### 4. Async Event Dispatcher Layer (`05-outbox-dispatcher` & `06-google-cloud-tasks`)
* **Dispatcher:** Lightweight NestJS microservice running on Google Cloud Run.
* **Batch Claiming:** Uses `SELECT ... FOR UPDATE SKIP LOCKED` to prevent duplicate task scheduling across multiple dispatcher instances.
* **Queue:** Google Cloud Tasks provides rate-limiting, exponential backoff retries, dead-lettering, and Google OIDC authentication tokens.

### 5. AI Worker Layer (`07-fastapi-ai-worker`)
* **Framework:** FastAPI (Python 3.12) + SQLAlchemy 2.0 Async + Pydantic v2.
* **Idempotency:** Strictly verifies incoming task IDs against `processed_events` table.
* **Capabilities:**
  - PDF / DOCX native parsing and OCR fallback (Tesseract).
  - Resume structured fact extraction (PD-001).
  - Symmetric Semantic Text compilation for 8-table candidate aggregates (PD-002).
  - Job Description AI Enrichment (JD-001).

### 6. Foundation AI Models (Google Cloud Vertex AI)
* **LLM Extraction & Reasoning:** Google Vertex AI `gemini-2.5-flash` / `gemini-2.0-flash` (Structured Output Schema enforcement).
* **Vector Embeddings:** Google Vertex AI `text-embedding-004` (768-dimensional dense numerical coordinates).
