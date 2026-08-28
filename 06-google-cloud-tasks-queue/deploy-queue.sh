#!/usr/bin/env bash
# ============================================================================
# Binay Job Portal — GCP Cloud Tasks Queue Provisioning Script
# Location: asia-south1
# Queue Names: projection-queue, security-scan-queue
# ============================================================================

set -euo pipefail

LOCATION="asia-south1"
for QUEUE_NAME in projection-queue security-scan-queue; do
    echo "==== 📦 Provisioning GCP Cloud Tasks Queue: ${QUEUE_NAME} ===="

    if [ "${QUEUE_NAME}" = "security-scan-queue" ]; then
        MAX_DISPATCHES=5
        MAX_CONCURRENT=5
    else
        MAX_DISPATCHES=10
        MAX_CONCURRENT=10
    fi

    if gcloud tasks queues describe "${QUEUE_NAME}" --location="${LOCATION}" &>/dev/null; then
        echo "[OK] Queue '${QUEUE_NAME}' already exists. Updating rate-limits and retry policy..."
        gcloud tasks queues update "${QUEUE_NAME}" \
            --location="${LOCATION}" \
            --max-dispatches-per-second="${MAX_DISPATCHES}" \
            --max-concurrent-dispatches="${MAX_CONCURRENT}" \
            --max-attempts=10 \
            --min-backoff=5s \
            --max-backoff=300s \
            --max-doublings=16
    else
        echo "[CREATE] Creating new Cloud Tasks Queue '${QUEUE_NAME}'..."
        gcloud tasks queues create "${QUEUE_NAME}" \
            --location="${LOCATION}" \
            --max-dispatches-per-second="${MAX_DISPATCHES}" \
            --max-concurrent-dispatches="${MAX_CONCURRENT}" \
            --max-attempts=10 \
            --min-backoff=5s \
            --max-backoff=300s \
            --max-doublings=16
    fi
done

echo "==== ✅ Queue Provisioning Complete! ===="
