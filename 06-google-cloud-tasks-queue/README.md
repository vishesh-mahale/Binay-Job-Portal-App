# 📦 Component 06: GCP Cloud Tasks Queue Configuration & Runbook

[← Main project README](../README.md) · [Outbox Dispatcher](../05-outbox-dispatcher-nestjs/README.md) · [AI Worker](../07-fastapi-ai-worker/README.md)

---

## 🎯 1. Purpose & Responsibilities

`06-google-cloud-tasks-queue` handles distributed queueing, rate limiting, retry backoff policies, and Google OIDC authentication between **Cloud Run Outbox Dispatcher** (`05-outbox-dispatcher-nestjs`) and **Private Cloud Run AI Worker** (`07-fastapi-ai-worker`).

### Key Responsibilities:
1. **Asynchronous Decoupling:** Decouples transactional DB outbox dispatching from heavy AI document processing and vector embedding generation.
2. **Rate Limiting & Concurrency Control:** Controls task dispatch rate (`maxDispatchesPerSecond: 10`, `maxConcurrentDispatches: 10`) to prevent Vertex AI quota rate limit exhaustion.
3. **Automatic Exponential Retries:** Handles transient network/worker failures with bounded exponential retries (up to 10 attempts, 5s to 300s backoff).
4. **OIDC Authentication Security:** Signs HTTP POST requests with a Google Service Account ID Token (`roles/run.invoker`) so the AI Worker remains strictly private.

---

## 🏗️ 2. Architecture & Service Flow

```mermaid
flowchart LR
    A["🚀 05-outbox-dispatcher\n(Cloud Run)"] -->|"Enqueue Task (gcloud tasks)"| B["📦 GCP Cloud Tasks\n(projection-queue in asia-south1)"]
    B -->|"Rate-Limited OIDC Token HTTP POST"| C["🤖 07-fastapi-ai-worker\n(Private Cloud Run)"]
    C -->|"Generate 768-dim Vector"| D["✨ Google Vertex AI\n(text-embedding-004)"]

    style A fill:#0f172a,stroke:#475569,color:#f8fafc
    style B fill:#0f172a,stroke:#475569,color:#f8fafc
    style C fill:#0f172a,stroke:#475569,color:#f8fafc
    style D fill:#0f172a,stroke:#475569,color:#f8fafc
```

---

## ⚙️ 3. Production Queue Configuration (`projection-queue`)

- **GCP Location:** `asia-south1`
- **Configuration File:** [`projection-queue.json`](./projection-queue.json)
- **Deployment Script:** [`deploy-queue.sh`](./deploy-queue.sh)

| Configuration Parameter | Live Value | Engineering Rationale |
|---|---|---|
| `maxDispatchesPerSecond` | `10.0` | Keeps worker API calls within Vertex AI quota bounds |
| `maxConcurrentDispatches` | `10` | Prevents worker container RAM/CPU exhaustion |
| `maxAttempts` | `10` | Bounded retries before dead-lettering |
| `minBackoff` | `5s` | Initial delay for transient network glitches |
| `maxBackoff` | `300s` (5m) | Maximum backoff delay cap |

---

## 🔐 4. IAM & OIDC Security Model

- **Service Account:** `cloud-tasks-invoker@binay-job-portal.iam.gserviceaccount.com`
- **IAM Policy Document:** [`cloud-tasks-invoker-policy.json`](./cloud-tasks-invoker-policy.json)
- **OIDC Audience:** `https://dev-fastapi-ai-worker-163481994238.asia-south1.run.app`

`07-fastapi-ai-worker` rejects all unauthenticated public requests with `403 Forbidden`. Only Google Cloud Tasks requests signed with this service account's OIDC ID token are accepted.

---

## 🛠️ 5. Operational Commands

### Verify Queue Live Status:
```bash
gcloud tasks queues describe projection-queue --location=asia-south1
```

### Pause Queue (Maintenance):
```bash
gcloud tasks queues pause projection-queue --location=asia-south1
```

### Resume Queue:
```bash
gcloud tasks queues resume projection-queue --location=asia-south1
```

### Purge All Tasks (Emergency Clean):
```bash
gcloud tasks queues purge projection-queue --location=asia-south1
```
