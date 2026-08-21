# 05-outbox-dispatcher-nestjs — Transactional Outbox Dispatcher

> **Private, zero-trust, event-driven microservice that drains the `outbox_events` table and publishes background tasks to FastAPI workers (Phase 1) or Google Cloud Tasks (future).**

[← Main Project README](../README.md) · [Implementation Plan](IMPLEMENTATION-PLAN.md) · [Shared Contracts](../contracts/README.md) · [Infrastructure Baseline](../02-database/migrations/baseline/15_infrastructure.sql)

---

## 1. Executive Summary & Component Purpose

`05-outbox-dispatcher-nestjs` is a **private, stateless, wake-driven dispatcher** deployed on Google Cloud Run. Its sole responsibility is to drain the Supabase `outbox_events` table and publish tasks to downstream workers — reliably, idempotently, and without holding long transactions.

### 🚫 Single Responsibility Rule
- ❌ **No Business Logic** — no profile creation, resume parsing, job editing, or email generation.
- ❌ **No Direct AI Calls** — no LLM or embedding invocations.
- ❌ **No Producer Behavior** — does not insert into `outbox_events`; producers own that transaction.
- ✅ **Pure Dispatching** — claim due events ➔ resolve target queue/URL ➔ publish task ➔ mark published or failed.

---

## 2. Architecture & End-to-End System Topology

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        NESTJS CORE API (04-nestjs-api)                     │
│  - User authentication & tenant business logic                              │
│  - Inserts aggregate row + outbox_events(pending) in a single transaction   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
                       Supabase PostgreSQL Database
                            (outbox_events table)
                                       │
                                       │ Database Webhook (INSERT only)
                                       │  + Cron 10-min recovery backstop
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              OUTBOX DISPATCHER (05-outbox-dispatcher-nestjs)                │
│                                                                             │
│  1. Validate x-webhook-secret (constant-time, dual-secret rotation)         │
│  2. Single-flight latch: queue concurrent wakes instead of discarding       │
│  3. Claim batch via SKIP LOCKED (lease ownership)                           │
│  4. Resolve route — fail closed for unknown event types                     │
│  5. Build uniform task payload v1 (UUIDs only, no PII)                      │
│  6. Publish via DirectHttpPublisher (dev) or CloudTasksPublisher (prod)     │
│  7. Idempotent mark_outbox_event_published (ALREADY_EXISTS = success)       │
│  8. Backoff mark_outbox_event_failed (DB owns dead-letter authority)        │
│  9. Bounded drain loop with 240s request budget < Cloud Run 300s timeout    │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
              ┌────────────────────────┴────────────────────────┐
              │                                                 │
              ▼                                                 ▼
   Direct HTTP POST (dev)                           Cloud Tasks (production)
   → FastAPI AI Worker                            → OIDC Bearer → FastAPI Worker
```

---

## 3. Wake Endpoint & Health Probes

### Wake
| Method | Route | Auth | Behavior |
|---|---|---|---|
| `POST` | `/internal/dispatcher/wake` | `x-webhook-secret` header (constant-time compare, dual-secret rotation) | Triggers a bounded drain; body is discarded (PII rule). Returns `{accepted, claimed, published, failed}` or `{accepted: true, reason: "queued_pending_wake"}` when a drain is already active. |

### Health
| Method | Route | Behavior |
|---|---|---|
| `GET` | `/health/liveness` | Process alive, no dependency checks. |
| `GET` | `/health/readiness` | Calls `outbox_recovery_needed()` to prove DB reachability; returns `503` on failure. |

---

## 4. Security — Webhook Secret Guard

The wake endpoint is guarded by a shared secret, not by user JWTs:

1. **Constant-Time Comparison** — `timingSafeEqual` over UTF-8 digests; length mismatch compares against self to keep the timing profile uniform.
2. **Dual-Secret Rotation** — accepts the current `WEBHOOK_SECRET` or the optional `WEBHOOK_SECRET_PREVIOUS` during a rotation window.
3. **Webhook Body Discarded** — Supabase Database Webhooks send the inserted row as the payload; the dispatcher never parses or logs it. Producer-side rule: `outbox_events.payload` must never contain raw resume text, email, phone, tokens, or signed URLs.

---

## 5. Single-Flight + Pending-Wake Latch + Bounded Drain

Concurrency coordination for a Cloud Run deployment with `max-instances=1`:

### Single-Flight
Only one drain runs per instance. A wake arriving while a drain is active is NOT discarded.

### Pending-Wake Latch (Critical Correctness Fix)
```
wake arrives during active drain
  → set wakePending = true
  → return { accepted: true, reason: "queued_pending_wake" }

current bounded drain finishes
  → if wakePending OR last batch was full (work remaining)
  → run another bounded drain iteration

loop exits when:
  → wakePending is false AND last batch was partial, OR
  → elapsed > DRAIN_REQUEST_BUDGET_MS (default 240s < Cloud Run 300s)
```

Self-POST is **intentionally absent** — with `max-instances=1`, a self-POST would hit the same single-flight flag and deadlock. Supabase Cron (10-min recovery) is the backstop for any work remaining after budget exhaustion.

### Bounded Drain
- Default `DRAIN_MAX_BATCHES = 5`, `CLAIM_BATCH_SIZE = 50` → up to 250 events per iteration.
- Full last batch (`events.length === batchSize`) signals work remaining → loop continues.
- Partial last batch → queue drained → loop exits.

---

## 6. Phase-1 Route Registry

Only the three contracted producer events are routable. Unknown event types fail closed to `mark_outbox_event_failed` with `unknown_route:<sanitized_event_type>` — they are never silently skipped.

| `event_type` | Queue | Endpoint | Contract |
|---|---|---|---|
| `resume.parse.requested` | `ai-heavy-queue` | `/internal/tasks/resume/parse` | `contracts/tasks/resume-parse-task.v1.json` |
| `candidate.profile.changed` | `projection-queue` | `/internal/tasks/candidate/projection` | `contracts/tasks/candidate-projection-task.v1.json` |
| `job.ai.enrichment.requested` | `ai-heavy-queue` | `/internal/tasks/job/enrich` | `contracts/tasks/job-enrich-task.v1.json` |

### G-5 Policy (Enforced)
An event without a finalized consumer contract/route MUST NOT silently become routable. The dispatcher never invents destination semantics.

---

## 7. Publisher Abstraction

| Mode | Implementation | Scope |
|---|---|---|
| `DISPATCH_MODE=direct` | `DirectHttpPublisher` — POSTs uniform task payload v1 to the local FastAPI worker. In-memory `Set<taskName>` simulates Cloud Tasks `ALREADY_EXISTS` semantics. | **Phase 1** (rejected by env validation when `NODE_ENV=production`). |
| `DISPATCH_MODE=cloud_tasks` | `CloudTasksPublisher` — NOT implemented in Phase 1. Fails fast at boot (gated by G-3 IAM bindings + G-4 queue provisioning). | Future integration. |

Both modes share the same route registry, payload builder, deterministic task names, and dispatcher domain logic.

### Deterministic Task Identity
`task-{sha256hex(event_id + ":" + route_key)}` — same input always yields the same name, so duplicate publishes (Cloud Tasks retry or local re-POST) hit `ALREADY_EXISTS` and the dispatcher marks the event published.

### Uniform Task Payload v1
```json
{
  "schema_version": 1,
  "event_id": "uuid",
  "aggregate_id": "uuid",
  "trace_id": "uuid"
}
```
Built ONLY from outbox row columns. `trace_id = correlation_id ?? event_id`. No route-specific fields.

---

## 8. Database Alignment — The Four Approved Functions

The repository is the **only** database surface of the dispatcher. Zero ad-hoc `UPDATE`/`INSERT`/`DELETE` on `outbox_events` exists anywhere in application code. All state transitions go through `SECURITY DEFINER` functions defined in [`15_infrastructure.sql`](../02-database/migrations/baseline/15_infrastructure.sql):

| Function | Purpose |
|---|---|
| `claim_outbox_events(p_worker_id, p_batch_size [1..100], p_lease_seconds [30..900])` | Stale-sweep dead-letters exhausted `publishing` rows, then `FOR UPDATE SKIP LOCKED` claim due rows. |
| `mark_outbox_event_published(p_event_id, p_worker_id, p_task_name)` | Idempotent for the same `(event_id, task_name)`; raises if the row is not `publishing` under this worker's lease. |
| `mark_outbox_event_failed(p_event_id, p_worker_id, p_error, p_available_at)` | Requires `p_available_at >= NOW()`; increments `retry_count`; dead-letters when budget exhausted; `LEFT(error, 4000)`. |
| `outbox_recovery_needed()` | `STABLE` boolean — indexed existence check used by readiness probes and Supabase Cron recovery. |

Lease, retry, stale recovery, and dead-letter authority live in the SQL — the dispatcher reproduces none of them.

---

## 9. Error Classification & Backoff Policy

### Classifier (`classifyError`)
| Signal | Error Class | Transient? |
|---|---|---|
| Timeout | `transient_deadline` | yes |
| Network failure | `transient_network` | yes |
| `429` / `RESOURCE_EXHAUSTED` | `transient_rate_limited` | yes |
| `5xx` | `transient_server` | yes |
| `403` / `PERMISSION_DENIED` | `permanent_permission` | no |
| `400` / `INVALID_ARGUMENT` | `permanent_invalid_argument` | no |
| `404` / `NOT_FOUND` | `permanent_not_found` | no |

`last_error` stored via `mark_outbox_event_failed` is sanitized (postgres URLs, bearer tokens, signed URL params scrubbed) and capped at 500 chars; the DB additionally truncates to 4000.

### Backoff Policy (`backoff.policy.ts`)
```
capped  = min(30s × 2^retry_count, 15min)
delay   = full_jitter([0, capped]) + 250ms floor
```
Full jitter follows the AWS "Full Jitter" shape. The 250ms floor ensures `p_available_at >= NOW()` holds in SQL. DB `max_retries` is authoritative for dead-letter decisions.

---

## 10. Local Development & Setup

### Prerequisites
- Node.js `>= 20` (tested on `20.19.x` and `24.18.x`)
- PostgreSQL (for live-flow verification; mocked tests require zero DB)
- Running `07-fastapi-ai-worker` on `http://127.0.0.1:8000` for end-to-end local verification

### Setup Instructions
```powershell
# Navigate to dispatcher directory
cd 05-outbox-dispatcher-nestjs

# Install dependencies
npm.cmd install --no-audit --no-fund

# Configure environment variables
cp .env.example .env

# Type-check without emit
npm.cmd run lint:types

# Build
npm.cmd run build

# Run the test suite
npm.cmd test

# Run development server (requires a valid .env)
npm.cmd run start:dev
```

### Manual Local Wake
```bash
curl -X POST localhost:3000/internal/dispatcher/wake \
  -H "x-webhook-secret: dev-secret"
```

### Environment Bounds
- `CLAIM_BATCH_SIZE` [1..100] (default 50)
- `CLAIM_LEASE_SECONDS` [30..900] (default 300)
- `DRAIN_MAX_BATCHES` [1..20] (default 5)
- `DRAIN_REQUEST_BUDGET_MS` [1000..290000] (default 240000, < Cloud Run 300s timeout)
- `DISPATCH_MODE=direct` is rejected when `NODE_ENV=production` (fail-fast).

---

## 11. Containerization & Production Cloud Run Deployment

### Docker Multi-Stage Build
- **Base Image**: `node:20-alpine`
- **Builder Stage**: `npm ci`, TypeScript build, `npm prune --omit=dev`.
- **Runtime Stage**: non-root `node` user, copies `/dist` + pruned `node_modules`.
- **Port**: `3000` (Cloud Run injects `PORT`).

### Future Cloud Run Deployment (Gated)
```bash
gcloud run deploy outbox-dispatcher \
  --image gcr.io/$PROJECT_ID/outbox-dispatcher:latest \
  --platform managed \
  --region asia-south1 \
  --no-allow-unauthenticated \
  --ingress internal \
  --service-account outbox-dispatcher-sa@$PROJECT_ID.iam.gserviceaccount.com \
  --memory 512Mi \
  --cpu 1 \
  --concurrency 80 \
  --min-instances 0 \
  --max-instances 1
```

Gated by: **G-3** IAM bindings (dispatcher SA → `cloudtasks.enqueuer` + `iam.serviceAccountUser` actAs on OIDC task SA; OIDC task SA → `run.invoker`), **G-4** ingress/topology verification.

---

## 12. Automated Test Suite

Run the full suite with `npm test`. Tests live beside sources as `*.spec.ts` and under `test/`.

```
src/
├── config/env.validation.spec.ts              # fail-fast env validation + bound enforcement
├── routing/routing.spec.ts                    # registry (3 routes) + payload builder + PII non-leak
├── publishing/task-name.spec.ts               # deterministic sha256 task names + backoff policy
├── publishing/direct-http.publisher.spec.ts   # fetch mocking, dedupe, HTTP error classification
├── common/errors.spec.ts                      # classifyError mapping + sanitize
├── observability/logger.spec.ts               # redaction of keys/values, JSON structure
├── database/outbox.repository.spec.ts         # the 4 approved SQL strings + params
├── dispatcher/guards/webhook-secret.guard.spec.ts  # constant-time, dual-secret rotation
├── dispatcher/dispatcher.service.spec.ts      # single-flight, latch, bounded drain, budget
└── health/  (covered by the HTTP suite)
test/
└── dispatcher.http.spec.ts                    # real Nest app boot over HTTP (guard + health)
```

### Current Status
- **92 tests passing across 10 suites** (0 failures)
- `npm run build` and `npx tsc --noEmit` clean

### BLOCKED Tests (Not Faked)
| Test | Reason |
|---|---|
| Real PostgreSQL `SKIP LOCKED` concurrency | No local Postgres/Supabase DB in this environment |
| Local integration flow (curl wake → FastAPI) | No local Supabase stack or running FastAPI worker |
| Cloud Tasks / OIDC / Cloud Run / production webhook E2E | Gated (G-1…G-5); no GCP credentials |

---

## 13. Phase-1 Status & Gates

**Status: READY FOR PHASE-1 SCAFFOLDING — NOT READY FOR FULL INTEGRATION**

| Gate | Status | Blocker |
|---|---|---|
| **G-1** Contract reconciliation | OPEN | Task contracts exist; event-contract reconciliation required before Phase 2 routes. |
| **G-2** aggregate_id semantics | OPEN | Dispatcher only forwards the column; semantics decision unaffected. |
| **G-3** IAM bindings | OPEN | No IAM code added; `cloud_tasks` mode fails fast at boot. |
| **G-4** Ingress/topology verify | OPEN | No Cloud Run work done. |
| **G-5** Unroutable-event policy | **ENFORCED** | Unknown types fail closed; no invented routes. |

### Remaining Work Before Phase 2
- Resolve G-1 (event contract reconciliation), G-2, G-3, G-4
- OD-1 dedicated LOGIN role + GRANT EXECUTE migration (baseline uses `postgres` credential)
- OD-10 connectivity spike with real Supabase credentials (Transaction Pooler 6543, TLS, function invocation)
- `CloudTasksPublisher` implementation
- Supabase webhook + cron provisioning (out of dispatcher scope; Supabase-side)
- Cloud Run deployment
- Metrics module (counters/histograms → Cloud Monitoring export)

---

## 3. Detailed Documentation & Links

* 📋 **[Complete Implementation Plan & Execution Roadmap](IMPLEMENTATION-PLAN.md)** — Phased development steps, 3 operational modes, event routing registry, and testing strategy.
* 🧪 **[Local Testing Options & Architecture Blueprint](LOCAL-TESTING-OPTIONS.md)** — All 4 local testing architectures with diagrams, commands & setup guide.
* 🗺️ **[System Architecture Diagram & Blueprint](../docs/architecture/ARCHITECTURE-DIAGRAM.md)** — End-to-end system context.
* 📝 **[Shared Event & Task Contracts](../contracts/README.md)** — Versioned event schemas and task payloads.
* 🗄️ **[Infrastructure Baseline Migration](../02-database/migrations/baseline/15_infrastructure.sql)** — `outbox_events` table and `claim_outbox_events()` stored procedure.nctions, lifecycle trigger, indexes.
- 🔒 **[RLS Policies](../02-database/migrations/baseline/17_rls.sql)** — Row-level grants governing `outbox_events` access.
- 🤖 **[FastAPI AI Worker](../07-fastapi-ai-worker/README.md)** — Downstream consumer of the dispatcher's published tasks.
