#!/usr/bin/env bash
# ============================================================================
# Binay Job Portal — GCP Cloud Tasks Queue Provisioning Script
# Location: asia-south1
# Queue Name: projection-queue
# ============================================================================

set -euo pipefail

LOCATION="asia-south1"
QUEUE_NAME="projection-queue"

echo "==== 📦 Provisioning GCP Cloud Tasks Queue: ${QUEUE_NAME} ===="

# 1. Create or Update Cloud Tasks Queue
if gcloud tasks queues describe "${QUEUE_NAME}" --location="${LOCATION}" &>/dev/null; then
    echo "[OK] Queue '${QUEUE_NAME}' already exists. Updating rate-limits and retry policy..."
    gcloud tasks queues update "${QUEUE_NAME}" \
        --location="${LOCATION}" \
        --max-dispatches-per-second=10 \
        --max-concurrent-dispatches=10 \
        --max-attempts=10 \
        --min-backoff=5s \
        --max-backoff=300s \
        --max-doublings=16
else
    echo "[CREATE] Creating new Cloud Tasks Queue '${QUEUE_NAME}'..."
    gcloud tasks queues create "${QUEUE_NAME}" \
        --location="${LOCATION}" \
        --max-dispatches-per-second=10 \
        --max-concurrent-dispatches=10 \
        --max-attempts=10 \
        --min-backoff=5s \
        --max-backoff=300s \
        --max-doublings=16
fi

echo "==== ✅ Queue Provisioning Complete! ===="
