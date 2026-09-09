#!/bin/bash
set -ex

echo "Updating ClamAV signatures..."
freshclam || true

echo "Starting ClamAV daemon..."
clamd --config /etc/clamav/clamd.conf &
CLAMD_PID=$!

echo "Waiting for ClamAV daemon to be ready (PID: $CLAMD_PID)..."
for i in $(seq 1 30); do
    if nc -z 127.0.0.1 3310 2>/dev/null; then
        echo "ClamAV daemon is ready on port 3310"
        break
    fi
    echo "Waiting... ($i/30)"
    sleep 2
done

echo "Starting HTTP wrapper on port 8080..."
exec python3 /app/app.py
