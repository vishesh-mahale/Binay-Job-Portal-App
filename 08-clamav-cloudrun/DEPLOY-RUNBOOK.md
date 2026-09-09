# ClamAV Cloud Run — Deployment Runbook

## Quick Deploy

```bash
cd 08-clamav-cloudrun
./deploy.sh
```

## Architecture

```
FastAPI Worker (07-fastapi-ai-worker)
    │
    │  POST /scan (multipart file)
    │  GET  /health
    │
    ▼
Cloud Run: clamav-scanner (asia-south1)
    │  Memory: 2Gi, CPU: 1
    │  Min instances: 0 (scales to zero = ₹0 when idle)
    │  Max instances: 2
    │  Auth: --no-allow-unauthenticated (needs IAM token)
    │
    ▼
ClamAV daemon (port 3310, internal)
    │
    ▼
HTTP wrapper (port 8080, exposed)
```

## Service Details

| Property | Value |
|----------|-------|
| Service name | `clamav-scanner` |
| Region | `asia-south1` |
| Image | `REGION-docker.pkg.dev/<PROJECT_ID>/clamav-repo/clamav-scanner` |
| Health URL | `GET {SERVICE_URL}/health` → `{"status":"ok","clamav":"PONG"}` |
| Scan URL | `POST {SERVICE_URL}/scan` (multipart file upload) |
| FastAPI SA | `<COMPUTE_SA>@<PROJECT_ID>.iam.gserviceaccount.com` |
| IAM role | `roles/run.invoker` (required, not public) |

## Endpoints

### GET /health
```bash
TOKEN=$(gcloud auth print-identity-token)
curl -H "Authorization: Bearer $TOKEN" {SERVICE_URL}/health
# → {"status":"ok","clamav":"PONG"}
```

### POST /scan
```bash
TOKEN=$(gcloud auth print-identity-token)
curl -H "Authorization: Bearer $TOKEN" -F "file=@resume.pdf" {SERVICE_URL}/scan
# Clean: {"verdict":"clean"}
# Infected: {"verdict":"infected","reason":"Eicar-Test-Signature"}
```

## Known Gotchas (Critical — Read Before Deploying)

### 1. Use Artifact Registry, NOT gcr.io
```
❌ gcr.io/<PROJECT_ID>/clamav-scanner
✅ REGION-docker.pkg.dev/<PROJECT_ID>/clamav-repo/clamav-scanner
```
**Why:** `gcr.io` push fails with `artifactregistry.repositories.createOnPush` permission denied. The project has Artifact Registry enabled but not the legacy Container Registry.

### 2. clamd startup — NO --daemon flag
```bash
❌ clamd --daemon
✅ clamd &
```
**Why:** ClamAV's `clamd` binary does not accept `--daemon`. It runs in foreground by default. Use `&` to background it.

### 3. INSTREAM terminator must be 4 null bytes
```python
❌ sock.send(b"\n")
✅ sock.send(b"\x00\x00\x00\x00")
```
**Why:** ClamAV INSTREAM protocol requires 4 null bytes as terminator, not a newline. Using `\n` causes the scan to hang until timeout.

### 4. Memory must be 2Gi minimum
```
❌ --memory=1Gi   (OOM during freshclam + scan)
✅ --memory=2Gi
```
**Why:** Freshclam downloads ~200MB of signatures. ClamAV daemon uses ~400MB. Python wrapper + OS overhead pushes past 1Gi.

### 5. freshclam MUST run before clamd
```bash
# start.sh must do:
freshclam || true        # Update signatures first
clamd &                  # Then start daemon
# Then wait for port 3310 to be ready
```
**Why:** Stale virus DB = scan failures. Freshclam takes 30-60s on first run.

### 6. netcat required for readiness check
```bash
❌ curl -s http://127.0.0.1:3310  (clamd doesn't speak HTTP)
✅ nc -z 127.0.0.1 3310            (TCP connection check)
```

### 7. Cloud Run timeout must be 300s
```
❌ --timeout=60    (freshclam alone can take 60s+)
✅ --timeout=300
```

## Troubleshooting

### Health check returns 503
```bash
# Check logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=clamav-scanner" --limit=20

# Common causes:
# 1. clamd not starting → check if freshclam is taking too long
# 2. Port 3310 not ready → increase sleep in start.sh
# 3. OOM → increase memory to 2Gi
```

### Scan returns timeout
```bash
# Increase CLAMAV_TIMEOUT_SECONDS in .env (default: 120)
# Cloud Run timeout must also be >= CLAMAV_TIMEOUT_SECONDS
```

### Cold start takes too long
```bash
# Set min-instances=1 to keep one warm (costs ~₹0 with free tier)
gcloud run services update clamav-scanner --min-instances=1 --region=asia-south1
```

### 401 Unauthorized
```bash
# Service has --no-allow-unauthenticated
# Must use identity token, not access token:
TOKEN=$(gcloud auth print-identity-token)    # ✅
TOKEN=$(gcloud auth print-access-token)      # ❌
```

## Cost

- **Min instances 0:** ₹0 when idle (scales to zero)
- **Free tier:** 180,000 vCPU-seconds, 360,000 GiB-seconds, 2 million requests/month
- **Expected usage:** ~₹0 for development/low traffic
- **Monitor:** GCP Console → Billing → Cloud Run

## Production Deployment (New GCP Account/Project)

Jab naye GCP account ya project mein deploy karna ho, sirf 3 cheezein change karni hain — baaki sab same hai.

### Step-by-Step

#### 1. GCP APIs Enable Karo
```bash
gcloud services enable compute.googleapis.com run.googleapis.com artifactregistry.googleapis.com \
  --project=PROD_PROJECT_ID
```

#### 2. deploy.sh Mein PROJECT_ID Change Karo
```bash
# deploy.sh line 4 — sirf ye change:
PROJECT_ID="PROD_PROJECT_ID"    # ← naya project ID daalo
# Baaki sab same hai (region, service name, memory, etc.)
```

#### 3. Deploy Karo
```bash
cd 08-clamav-cloudrun
./deploy.sh
```
Deploy ke baad terminal mein SERVICE_URL milega — wo automatically .env mein dalna hai.

#### 4. .env Mein 3 Values Update Karo
```bash
# 07-fastapi-ai-worker/.env
CLAMAV_HOST=https://clamav-scanner-NEW_URL.a.run.app    # deploy ke baad milega
CLAMAV_PORT=443
CLAMAV_TIMEOUT_SECONDS=120
```

#### 5. OIDC Allowlist Update Karo (Agar OIDC enabled hai)
```bash
# 07-fastapi-ai-worker/.env
GOOGLE_OIDC_ALLOWED_SERVICE_ACCOUNTS=PROD_COMPUTE_SA@PROD_PROJECT_ID.iam.gserviceaccount.com
```

### What DOESN'T Change (Same for Dev + Prod)
- Dockerfile
- start.sh
- app.py (ClamAV wrapper)
- security_scanner.py
- config.py
- deploy.sh (sirf PROJECT_ID line)
- All ClamAV gotchas (2Gi, netcat, INSTREAM, etc.)

### Security Flow — Dev vs Prod

| Layer | Dev (current) | Prod (new account) |
|-------|--------------|-------------------|
| Cloud Run IAM | `--no-allow-unauthenticated` | Same — auto-configured by deploy.sh |
| FastAPI → ClamAV auth | OIDC ID token (via gcloud) | Same — OIDC ID token (via service account ADC) |
| OIDC validation | `OIDC_AUTH_ENABLED=false` (local) | `OIDC_AUTH_ENABLED=true` (prod) |
| Service account | `<COMPUTE_SA>@<PROJECT_ID>` | New project's compute SA |
| Virus DB | Auto-updated via freshclam | Same — runs on every container start |

## Rollback

```bash
# List revisions
gcloud run services describe clamav-scanner --region=asia-south1 --format="value(status.traffic)"

# Rollback to previous revision
gcloud run services update-traffic clamav-scanner --region=asia-south1 --to-revisions=PREVIOUS_REVISION=100

# Delete service entirely
gcloud run services delete clamav-scanner --region=asia-south1
```
