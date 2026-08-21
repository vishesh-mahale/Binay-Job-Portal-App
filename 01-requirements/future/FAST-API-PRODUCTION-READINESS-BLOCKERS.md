# 🔴 Production Readiness Blockers — `07-fastapi-ai-worker`

> **Status**: NOT Production-Ready (Estimated ~60-70% Complete)
> **Last Audited**: 2026-08-18
> **Auditor Role**: Principal Python Architect / Cloud Architect / AppSec Engineer

---

## Current State Summary

```text
┌─────────────────────────────────────────────────────────────┐
│  Foundation/Architecture:  ████████████████████░  95%       │
│  Code Implementation:      █████████████████░░░░  75%       │
│  Testing & Verification:   ██████████████░░░░░░░  60%       │
│  DevOps & Deployment:      ████░░░░░░░░░░░░░░░░  15%       │
│  Monitoring & Observability:███░░░░░░░░░░░░░░░░░  10%       │
└─────────────────────────────────────────────────────────────┘
```

---

## BLOCKER 1: No Real E2E Test With Live Supabase + Cloud Tasks

### Problem

Code likhna aur unit tests pass karna alag baat hai. Abhi tak ek bhi real resume upload
karke poora chain **live environment mein test nahi hua hai**:

```text
Candidate Browser
    → NestJS API (upload resume)
        → Supabase PostgreSQL (outbox_events INSERT)
            → Outbox Dispatcher (Cloud Tasks publish)
                → Google Cloud Tasks Queue
                    → FastAPI AI Worker (OIDC validated)
                        → Gemini/Vertex AI (parse + embed)
                            → Supabase PostgreSQL (write results)
```

Agar ye chain mein koi ek bhi step fail ho raha hai (DNS resolution, SSL handshake,
OIDC audience mismatch, database connection timeout, vector dimension mismatch), to
wo bug **sirf live E2E test mein hi dikhega**, unit tests mein kabhi nahi.

### What Needs To Be Done

- [ ] Ek real Supabase project par baseline SQL migrations apply karo
- [ ] Cloud Tasks queue create karo (`ai-heavy-queue`, `projection-queue`)
- [ ] FastAPI worker Cloud Run par deploy karo (ya local Docker container mein)
- [ ] NestJS API se ek real resume upload karo aur track karo:
  - [ ] `outbox_events` mein row bani ya nahi
  - [ ] Cloud Tasks ne task dispatch kiya ya nahi
  - [ ] FastAPI worker ne OIDC token validate kiya ya nahi
  - [ ] `resume_parsing_jobs` status `queued` → `processing` → `completed` hua ya nahi
  - [ ] `resume_parsed_data` mein immutable row insert hui ya nahi
  - [ ] `candidate_search_profiles` mein 768-dim embedding vector store hua ya nahi
- [ ] Failure scenarios test karo:
  - [ ] Invalid PDF upload (magic bytes check)
  - [ ] Gemini API 429 rate limit → Cloud Tasks auto-retry
  - [ ] Duplicate task delivery → idempotency guard (`processed_events`)
  - [ ] Worker crash mid-processing → stale lease recovery

### Acceptance Criteria

Ek real resume upload karne par 60 seconds ke andar `candidate_search_profiles` mein
valid embedding aur `fact_sources` JSONB dikhna chahiye, aur candidate ke UI par
`processing_status = 'completed'` show hona chahiye.

---

## BLOCKER 2: No CI/CD Pipeline

### Problem

Abhi koi bhi code change **manually deploy** karna padega. Iske risks:

1. **Human Error**: Developer galti se `main` branch mein untested code push kar de
   aur production break ho jaye.
2. **No Automated Gate**: Koi automated check nahi hai jo ensure kare ki tests pass
   hain, linting clean hai, aur Docker image build ho raha hai.
3. **Rollback Difficulty**: Agar deploy ke baad bug aaye to manually previous version
   dhundhke redeploy karna padega.

### What Needs To Be Done

- [ ] GitHub Actions workflow create karo:

```yaml
# .github/workflows/fastapi-worker-ci.yml
name: FastAPI AI Worker CI/CD

on:
  push:
    branches: [main]
    paths: ['07-fastapi-ai-worker/**']
  pull_request:
    paths: ['07-fastapi-ai-worker/**']

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - run: pip install -e ".[dev]"
        working-directory: 07-fastapi-ai-worker
      - run: pytest tests/unit/ --cov=app --cov-fail-under=80
        working-directory: 07-fastapi-ai-worker

  build-and-deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: google-github-actions/auth@v2
        with: { credentials_json: '${{ secrets.GCP_SA_KEY }}' }
      - run: |
          gcloud builds submit \
            --tag gcr.io/$PROJECT_ID/fastapi-ai-worker:$GITHUB_SHA \
            07-fastapi-ai-worker/
      - run: |
          gcloud run deploy fastapi-ai-worker \
            --image gcr.io/$PROJECT_ID/fastapi-ai-worker:$GITHUB_SHA \
            --region asia-south1 \
            --no-allow-unauthenticated \
            --service-account fastapi-worker-sa@$PROJECT_ID.iam.gserviceaccount.com
```

- [ ] Branch protection rule lagao: `main` branch par direct push block karo,
      PR review + CI pass mandatory karo.
- [ ] Cloud Build trigger as alternative (agar GitHub Actions nahi use karna ho).

### Acceptance Criteria

Har PR par automatically tests run hon, aur `main` merge hone par Cloud Run par
auto-deploy ho jaye bina kisi manual step ke.

---

## BLOCKER 3: No Real Cloud Run Deployment Test

### Problem

`Dockerfile` exist karta hai lekin:

1. Kabhi `docker build` run karke verify nahi kiya ki image successfully banta hai ya nahi.
2. Kabhi real Cloud Run par deploy nahi kiya.
3. Cloud Run ke specific behaviors (cold start, request timeout, memory limits,
   concurrency settings) test nahi hue.
4. Tesseract OCR binary Docker image mein install hota hai ya nahi — verify nahi hua.

### What Needs To Be Done

- [ ] Local Docker build aur run test karo:

```bash
# Step 1: Build
docker build -t fastapi-ai-worker:dev ./07-fastapi-ai-worker/

# Step 2: Run locally
docker run -p 8080:8080 \
  -e DATABASE_URL="postgresql+asyncpg://..." \
  -e GOOGLE_CLOUD_PROJECT_ID="binay-job-portal-dev" \
  -e AI_PROVIDER="mock" \
  -e OIDC_AUTH_ENABLED="false" \
  fastapi-ai-worker:dev

# Step 3: Health check
curl http://localhost:8080/health/liveness
curl http://localhost:8080/health/readiness
```

- [ ] Cloud Run deployment test karo:

```bash
# Push to Google Container Registry
gcloud builds submit --tag gcr.io/PROJECT_ID/fastapi-ai-worker:v1 ./07-fastapi-ai-worker/

# Deploy to Cloud Run
gcloud run deploy fastapi-ai-worker \
  --image gcr.io/PROJECT_ID/fastapi-ai-worker:v1 \
  --region asia-south1 \
  --no-allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300 \
  --concurrency 10 \
  --min-instances 0 \
  --max-instances 5 \
  --service-account fastapi-worker-sa@PROJECT_ID.iam.gserviceaccount.com
```

- [ ] Cloud Run specific settings verify karo:
  - [ ] Cold start time < 10 seconds
  - [ ] Memory usage < 512MB under normal resume parsing
  - [ ] Request timeout (300s) enough hai heavy OCR resumes ke liye
  - [ ] Concurrency=10 (ek container mein 10 simultaneous requests) load handle kar raha hai
  - [ ] Tesseract OCR binary Docker image mein functional hai

### Acceptance Criteria

`/health/readiness` endpoint Cloud Run par HTTP 200 return kare, aur ek mock resume
parse task POST karne par HTTP 200 aaye.

---

## BLOCKER 4: Secrets Still in `.env` Files

### Problem

Abhi sab secrets (database password, API keys, Supabase storage key) `.env` file mein
plain text mein rakhe hue hain. Production mein ye ek **critical security vulnerability** hai:

1. **Leak Risk**: Agar koi developer galti se `.env` file commit kar de to saare secrets
   public ho jayenge.
2. **No Rotation**: `.env` mein key change karne ke liye redeploy karna padega.
3. **No Audit Trail**: Kisko pata kaun kab secrets access kar raha hai.
4. **Multi-Environment Chaos**: Dev, staging, prod ke liye alag-alag `.env` files
   manage karna error-prone hai.

### What Needs To Be Done

- [ ] Google Secret Manager mein secrets create karo:

```bash
# Database URL
echo -n "postgresql+asyncpg://user:pass@host:5432/db?sslmode=require" | \
  gcloud secrets create DATABASE_URL --data-file=-

# Supabase Storage Key
echo -n "eyJhbGci..." | \
  gcloud secrets create SUPABASE_STORAGE_KEY --data-file=-

# Secret Key (for internal signing)
python -c "import secrets; print(secrets.token_hex(32))" | \
  gcloud secrets create FASTAPI_SECRET_KEY --data-file=-
```

- [ ] Cloud Run ko Secret Manager se secrets inject karne ka configuration:

```bash
gcloud run deploy fastapi-ai-worker \
  --set-secrets="DATABASE_URL=DATABASE_URL:latest" \
  --set-secrets="SUPABASE_STORAGE_KEY=SUPABASE_STORAGE_KEY:latest" \
  --set-secrets="SECRET_KEY=FASTAPI_SECRET_KEY:latest" \
  ...
```

- [ ] Service Account ko Secret Accessor role do:

```bash
gcloud secrets add-iam-policy-binding DATABASE_URL \
  --member="serviceAccount:fastapi-worker-sa@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

- [ ] `.env` file se production secrets hatao, sirf non-secret config rakho (log level,
      region, model names).

### Acceptance Criteria

Cloud Run deployment mein zero secrets environment variables mein visible hon.
Saare sensitive values Google Secret Manager se runtime par inject hon.
`gcloud run services describe fastapi-ai-worker` mein koi plaintext password na dikhe.

---

## BLOCKER 5: No Monitoring / Alerting

### Problem

Agar production mein kuch bhi galat ho jaye, to **kisi ko pata hi nahi chalega** jab
tak koi user manually complain na kare:

1. Worker crash ho jaye → Koi alert nahi aayega.
2. Gemini API continuous 429 errors de → Resumes silently queue mein pade rahenge.
3. Database connection pool exhaust ho jaye → Saare requests fail honge.
4. Memory leak se container OOM (Out of Memory) ho jaye → Cloud Run silently restart
   karega, lekin in-flight tasks lost ho jayenge.

### What Needs To Be Done

- [ ] **Structured Logging** (Already partial — complete karo):
  - [ ] Har request mein `trace_id`, `event_id`, `task_type` log karo
  - [ ] AI provider response time (latency) log karo
  - [ ] Token usage (input/output tokens) per request log karo
  - [ ] Error logs mein full stack trace + retry count include karo

- [ ] **Cloud Monitoring Metrics** setup karo:
  - [ ] `resume_parse_duration_seconds` (Histogram)
  - [ ] `embedding_generation_duration_seconds` (Histogram)
  - [ ] `ai_provider_errors_total` (Counter, labeled by provider + error_type)
  - [ ] `active_db_connections` (Gauge)
  - [ ] `task_processing_total` (Counter, labeled by task_type + status)

- [ ] **Alerting Policies** create karo:

| Alert | Condition | Severity | Action |
|---|---|---|---|
| Worker Error Rate > 5% | 5xx responses > 5% of total in 5 min window | 🔴 Critical | PagerDuty / SMS |
| AI Provider Rate Limited | 429 errors > 10 in 1 minute | 🟡 Warning | Slack notification |
| Database Connection Pool Full | Active connections = max_pool_size | 🔴 Critical | PagerDuty / SMS |
| Resume Parse Latency > 30s | P95 latency > 30 seconds | 🟡 Warning | Slack notification |
| Cloud Run Instance OOM | Container memory > 90% | 🔴 Critical | Auto-scale + alert |
| Dead Letter Queue Growing | `outbox_events` with `status='dead_letter'` > 0 | 🟡 Warning | Slack + dashboard |

- [ ] **Dashboard** create karo (Google Cloud Monitoring ya Grafana):
  - [ ] Real-time request rate, error rate, latency percentiles
  - [ ] AI token consumption per hour/day
  - [ ] Database connection pool utilization
  - [ ] Queue depth (pending outbox_events count)

### Acceptance Criteria

Production mein worker 5 minute se zyada down rahe to team ko automatically SMS/Slack
alert aaye. Dashboard par real-time request flow visible ho.

---

## Priority Order for Fixing

```text
Priority 1 (Week 1):  BLOCKER 3 → Docker Build + Local Run Verify
Priority 2 (Week 1):  BLOCKER 1 → E2E Test with Real Supabase
Priority 3 (Week 2):  BLOCKER 4 → Secrets to Google Secret Manager
Priority 4 (Week 2):  BLOCKER 2 → CI/CD Pipeline Setup
Priority 5 (Week 3):  BLOCKER 5 → Monitoring, Alerting & Dashboard
```

> [!IMPORTANT]
> In 5 blockers ke bina production deploy karna **risk hai**. Architecture aur code
> foundation solid hai, lekin DevOps, Security, aur Observability layers abhi missing
> hain. Estimated **3 weeks of focused work** mein ye sab complete ho sakta hai.
