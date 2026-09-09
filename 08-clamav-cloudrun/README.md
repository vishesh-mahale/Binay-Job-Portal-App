# 08-clamav-cloudrun

ClamAV antivirus scanning as a Cloud Run service — ₹0 cost (free tier).

## What It Does

Provides HTTP endpoint for virus scanning. Called by `07-fastapi-ai-worker` when users upload resumes.

```
POST /scan   → Scan file for viruses
GET  /health → Check if service is running
```

## Quick Start

### Deploy
```bash
cd 08-clamav-cloudrun
./deploy.sh
```

### Test
```bash
# Health check
TOKEN=$(gcloud auth print-identity-token)
curl -H "Authorization: Bearer $TOKEN" {SERVICE_URL}/health

# Scan file
curl -H "Authorization: Bearer $TOKEN" -F "file=@resume.pdf" {SERVICE_URL}/scan
```

## How It Works

```
1. freshclam     → Updates virus signatures (on container start)
2. clamd         → ClamAV daemon (port 3310, internal)
3. app.py        → FastAPI wrapper (port 8080, exposed)
4. start.sh      → Orchestrates startup sequence
```

## Files

| File | Purpose |
|------|---------|
| `Dockerfile` | Container image (ClamAV + Python) |
| `app.py` | HTTP wrapper for ClamAV |
| `start.sh` | Startup script (freshclam → clamd → app.py) |
| `deploy.sh` | One-click deploy to Cloud Run |
| `test-clamav.py` | Test script |
| `requirements.txt` | Python dependencies |
| `.dockerignore` | Docker build exclusions |
| `DEPLOY-RUNBOOK.md` | Deployment guide with gotchas |

## Configuration

| Variable | Value | Notes |
|----------|-------|-------|
| Memory | 2Gi | Minimum required (1Gi causes OOM) |
| CPU | 1 | |
| Min instances | 0 | Scales to zero = ₹0 when idle |
| Max instances | 2 | |
| Timeout | 300s | Freshclam can take 60s+ |

## Security

- `--no-allow-unauthenticated` — Only authorized accounts can call
- OIDC ID token required in request header
- Invoker role (`roles/run.invoker`) must be granted

## Gotchas

See `DEPLOY-RUNBOOK.md` for 7 critical gotchas (Artifact Registry, clamd flags, INSTREAM terminator, memory, etc.).
