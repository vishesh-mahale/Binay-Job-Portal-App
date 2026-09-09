#!/bin/bash
# ============================================================================
# ClamAV Cloud Run — Production Deployment Script
# ============================================================================
# Usage: ./deploy.sh
#
# Prerequisites:
#   - gcloud CLI authenticated (gcloud auth login)
#   - Compute Engine API enabled
#   - Artifact Registry API enabled
#   - Cloud Run API enabled
#
# Known Gotchas (DO NOT CHANGE):
#   - Use Artifact Registry (asia-south1-docker.pkg.dev), NOT gcr.io (permission denied)
#   - clamd --daemon flag does NOT exist. Use: clamd &
#   - INSTREAM terminator MUST be \x00\x00\x00\x00 (4 null bytes), NOT \n
#   - Memory MUST be 2Gi (1Gi causes OOM during freshclam + scan)
#   - freshclam MUST run before clamd starts (stale DB = scan failures)
#   - netcat (nc) is required for readiness check in start.sh
# ============================================================================
set -e

PROJECT_ID="project-8b4c2600-aeab-484d-82e"
REGION="asia-south1"
SERVICE_NAME="clamav-scanner"
AR_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/clamav-repo/${SERVICE_NAME}"

echo "=== ClamAV Cloud Run Deployment ==="
echo "Project:  ${PROJECT_ID}"
echo "Region:   ${REGION}"
echo "Image:    ${AR_IMAGE}"
echo ""

# Step 0: Verify prerequisites
echo "[0/5] Verifying prerequisites..."
gcloud services list --enabled --filter="name:compute.googleapis.com" --project=${PROJECT_ID} --format="value(name)" | grep -q "compute" && echo "  ✓ Compute Engine API" || (echo "  ✗ Compute Engine API — enable with: gcloud services enable compute.googleapis.com" && exit 1)
gcloud services list --enabled --filter="name:artifactregistry.googleapis.com" --project=${PROJECT_ID} --format="value(name)" | grep -q "artifact" && echo "  ✓ Artifact Registry API" || (echo "  ✗ Artifact Registry API — enable with: gcloud services enable artifactregistry.googleapis.com" && exit 1)
gcloud services list --enabled --filter="name:run.googleapis.com" --project=${PROJECT_ID} --format="value(name)" | grep -q "run" && echo "  ✓ Cloud Run API" || (echo "  ✗ Cloud Run API — enable with: gcloud services enable run.googleapis.com" && exit 1)

# Ensure Artifact Registry repo exists
gcloud artifacts repositories describe clamav-repo --location=${REGION} --project=${PROJECT_ID} &>/dev/null && echo "  ✓ Artifact Registry repo 'clamav-repo'" || {
  echo "  → Creating Artifact Registry repo 'clamav-repo'..."
  gcloud artifacts repositories create clamav-repo --repository-format=docker --location=${REGION} --project=${PROJECT_ID}
}

# Step 1: Build container
echo ""
echo "[1/5] Building container (this takes 3-5 minutes)..."
gcloud builds submit --tag ${AR_IMAGE} \
  --project=${PROJECT_ID} \
  --timeout=600s \
  .

# Step 2: Deploy to Cloud Run
echo ""
echo "[2/5] Deploying to Cloud Run..."
gcloud run deploy ${SERVICE_NAME} \
  --image=${AR_IMAGE} \
  --region=${REGION} \
  --platform=managed \
  --memory=2Gi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=2 \
  --concurrency=1 \
  --timeout=300 \
  --no-allow-unauthenticated \
  --project=${PROJECT_ID}

# Step 3: Get service URL
echo ""
echo "[3/5] Getting service URL..."
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} \
  --region=${REGION} \
  --format="value(status.url)" \
  --project=${PROJECT_ID})

echo "  Service URL: ${SERVICE_URL}"

# Step 4: Grant invoker role to FastAPI service account
echo ""
echo "[4/5] Granting invoker role to FastAPI service account..."
FASTAPI_SA="${PROJECT_ID}-compute@developer.gserviceaccount.com"
gcloud run services add-iam-policy-binding ${SERVICE_NAME} \
  --region=${REGION} \
  --member="serviceAccount:${FASTAPI_SA}" \
  --role="roles/run.invoker" \
  --project=${PROJECT_ID} 2>/dev/null && echo "  ✓ Granted to ${FASTAPI_SA}" || echo "  ⚠ Could not grant — may already exist"

# Step 5: Health check
echo ""
echo "[5/5] Running health check..."
sleep 5
TOKEN=$(gcloud auth print-identity-token 2>/dev/null)
HEALTH=$(curl -s -H "Authorization: Bearer ${TOKEN}" "${SERVICE_URL}/health" 2>/dev/null || echo '{"status":"error"}')
echo "  ${HEALTH}"

if echo "${HEALTH}" | grep -q '"ok"'; then
  echo ""
  echo "=== Deployment Successful ==="
else
  echo ""
  echo "=== Deployment Complete but Health Check Failed ==="
  echo "Check logs: gcloud logging read \"resource.type=cloud_run_revision AND resource.labels.service_name=${SERVICE_NAME}\" --limit=20 --project=${PROJECT_ID}"
fi

echo ""
echo "Update .env with:"
echo "  CLAMAV_HOST=${SERVICE_URL}"
echo "  CLAMAV_PORT=443"
echo "  CLAMAV_TIMEOUT_SECONDS=120"
