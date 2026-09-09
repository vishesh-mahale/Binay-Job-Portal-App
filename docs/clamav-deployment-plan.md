# ClamAV Deployment Implementation Plan (v3 — Cloud Run, Zero Cost)

## Current State (Verified)

| Item | Status |
|------|--------|
| GCP Project | `project-8b4c2600-aeab-484d-82e` |
| Authenticated As | `visheshmahale1994@gmail.com` |
| Compute Engine API | NOT enabled (not needed) |
| Artifact Registry API | ✅ Enabled |
| Cloud Run API | ✅ Enabled |
| ClamAV Docker Image | `clamav/clamav:stable-debian13-slim` |
| ClamAV Port | 3310 (TCP, internal to container) |
| Deployed Service | `clamav-scanner` (asia-south1) |

## Architecture — Cloud Run, Zero Cost

```
FastAPI Worker (07-fastapi-ai-worker)
    │
    │  POST /scan (HTTPS + OIDC ID token)
    │
    ▼
Cloud Run: clamav-scanner (asia-south1)
    │  Memory: 2Gi, CPU: 1
    │  Min instances: 0 (scale to zero = ₹0 when idle)
    │  Max instances: 2
    │  Auth: --no-allow-unauthenticated (OIDC ID token required)
    │
    ▼
ClamAV daemon (port 3310, internal to container)
    │
    ▼
HTTP wrapper (port 8080, exposed)
```

## Security Layers

| Layer | Detail |
|-------|--------|
| **Network** | HTTPS only via Cloud Run URL. |
| **Auth** | OIDC ID token — caller must have `roles/run.invoker` |
| **Token** | ID token with ClamAV URL as audience (Google-signed) |
| **No DB access** | ClamAV wrapper has no database credentials |
| **Ephemeral** | Container restarts, no persistent state |
| **Signature updates** | On container startup via freshclam (auto-updated) |

## Implementation Steps

### Phase 1: Build ClamAV Wrapper (15 min)

**Step 1.1: Project structure**
```
08-clamav-cloudrun/
├── Dockerfile
├── requirements.txt
├── app.py          — HTTP wrapper (INSTREAM over socket)
├── start.sh        — freshclam → clamd → Python entrypoint
├── deploy.sh       — One-click deploy (Artifact Registry + Cloud Run)
└── DEPLOY-RUNBOOK.md — Full deployment guide + gotchas
```

**Step 1.2: Key gotchas (read DEPLOY-RUNBOOK.md)**
- Use Artifact Registry (`asia-south1-docker.pkg.dev`), NOT `gcr.io`
- `clamd` has NO `--daemon` flag — use `clamd &`
- INSTREAM terminator: `\x00\x00\x00\x00` (NOT `\n`)
- Memory: 2Gi minimum (1Gi causes OOM)
- `freshclam` MUST run before clamd starts
- `netcat` required for readiness check
- Cloud Run timeout: 300s (not 60s)

### Phase 2: Deploy to Cloud Run (10 min)

```bash
cd 08-clamav-cloudrun
./deploy.sh
```

Script handles: prerequisite checks, Artifact Registry repo creation, container build, Cloud Run deploy, IAM role grant, health check.

### Phase 3: Update .env

```bash
# 07-fastapi-ai-worker/.env
CLAMAV_HOST=https://clamav-scanner-xxxx.a.run.app
CLAMAV_PORT=443
CLAMAV_TIMEOUT_SECONDS=120
```

### Phase 4: Verification

**Health check:**
```bash
TOKEN=$(gcloud auth print-identity-token)
curl -H "Authorization: Bearer $TOKEN" https://clamav-scanner-xxxx.a.run.app/health
# → {"status":"ok","clamav":"PONG"}
```

**Scan test:**
```bash
curl -H "Authorization: Bearer $TOKEN" -F "file=@test.txt" https://clamav-scanner-xxxx.a.run.app/scan
# → {"verdict":"clean"}
```

## Files

| File | Description |
|------|-------------|
| `08-clamav-cloudrun/Dockerfile` | Container definition |
| `08-clamav-cloudrun/app.py` | HTTP wrapper for clamd |
| `08-clamav-cloudrun/start.sh` | Container startup (freshclam → clamd → Python) |
| `08-clamav-cloudrun/deploy.sh` | One-click deployment |
| `08-clamav-cloudrun/DEPLOY-RUNBOOK.md` | Full deployment guide + gotchas |
| `07-fastapi-ai-worker/.env` | `CLAMAV_HOST` = Cloud Run URL |
| `07-fastapi-ai-worker/app/services/security_scanner.py` | HTTP client with OIDC ID token |

## Security Scanner

The scanner uses `google.oauth2.id_token` for production ADC and falls back to `gcloud auth print-identity-token` for local development. Cloud Run URL is used as the token audience.

## Cost Estimate

| Resource | Free Tier | Usage | Monthly Cost |
|----------|-----------|-------|-------------|
| Cloud Run (requests) | 2M/month | ~10,000 scans | ₹0 |
| Cloud Run (memory) | 360,000 GiB-s | ~10,000 GiB-s | ₹0 |
| Cloud Run (CPU) | 180,000 vCPU-s | ~20,000 vCPU-s | ₹0 |
| Container Registry | 500 MB | ~200 MB | ₹0 |
| **Total** | | | **₹0** |

## Rollback Plan

If Cloud Run deployment fails:
1. Revert `.env` to placeholder value
2. Delete Cloud Run service: `gcloud run services delete clamav-scanner --region=asia-south1`
3. App continues to work — scan will fail with `ScannerUnavailable`, status = `failed`
