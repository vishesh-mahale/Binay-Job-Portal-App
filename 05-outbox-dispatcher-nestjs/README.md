# 05 — Outbox Dispatcher (NestJS / TypeScript)

[← Main README](../README.md) · [System Architecture Diagram](../docs/architecture/ARCHITECTURE-DIAGRAM.md) · [Background Architecture](../docs/architecture/background-processing/BACKGROUND-WORKER-ARCHITECTURE-OPTIONS-HINGLISH.md) · [Shared Contracts](../contracts/README.md)

---

## 1. Overview & Core Philosophy

`05-outbox-dispatcher-nestjs` ek dedicated, ultra-fast, stateless **Transactional Outbox Dispatcher Microservice** hai.

### 🚫 Single Responsibility Rule:
Dispatcher **kisi bhi tarah ka business logic, OCR, resume parsing, email sending, ya AI processing nahi karega**.

**Iska akela kaam hai:**
1. Supabase Database se pending `outbox_events` ko safely aur atomically **CLAIM** karna (`FOR UPDATE SKIP LOCKED`).
2. Event type ko `contracts/events/` se `contracts/tasks/` ke payload aur target queue/URL mein **TRANSLATE** karna.
3. Target destination par **PUBLISH** karna (Deterministic Task ID ke sath).
4. Database mein status update karna (`published`, `failed` + backoff, ya `dead_letter`).

---

## 2. Master System Architecture Flow

```text
Trusted Producer (NestJS API / FastAPI)
                 │
                 ▼
       [outbox_events INSERT] (status='pending')
                 │
                 ▼
  Supabase Async Webhook / Post-Commit Wake-up
                 │  (POST /internal/dispatcher/wake)
                 ▼
     05-outbox-dispatcher-nestjs
                 │
                 ├─ 1. Atomic Claim Transaction (Short DB Lock):
                 │     `SELECT * FROM claim_outbox_events(:worker_id, 50, 120)`
                 │
                 ├─ 2. Config-Driven Event Routing Registry
                 │
                 ├─ 3. Task Publisher Strategy:
                 │     ├─ Mode A (Local Dev): DirectHttpPublisher ➔ FastAPI (http://127.0.0.1:8080)
                 │     ├─ Mode B (Hybrid Dev): CloudTasksPublisher (Local ADC) ➔ Real Cloud Tasks
                 │     └─ Mode C (Production): CloudTasksPublisher (Cloud Run OIDC) ➔ Cloud Tasks Queue
                 │
                 ├─ 4. Google Cloud Tasks Deduplication (Custom Deterministic Task Name)
                 │     `task_name = "task-{aggregate_type}-{aggregate_id}-{event_id}"`
                 │     (Catches `409 ALREADY_EXISTS` as safe idempotent published-equivalent)
                 │
                 ▼
    Update outbox_events status to 'published' (or retry backoff)
```

---

## 3. The 3 Operational Environment Modes

| Mode | Environment Config | Dispatcher Behavior | Target Worker | Setup Requirement |
|---|---|---|---|---|
| **Mode A: Pure Local (Fastest Loop)** | `DISPATCH_MODE=direct`<br>`FASTAPI_LOCAL_URL=http://127.0.0.1:8080` | Directly calls local FastAPI HTTP endpoint. | Local FastAPI (`localhost:8080`) | **Zero Cloud setup**, no tunnels needed. |
| **Mode B: Hybrid Integration** | `DISPATCH_MODE=cloud_tasks`<br>`GCP_AUTH=adc` | Uses Google Application Default Credentials (`gcloud auth`) to push real Cloud Tasks. | Deployed Dev Cloud Run Worker | Local `gcloud auth login`. |
| **Mode C: Production** | `DISPATCH_MODE=cloud_tasks`<br>`GCP_AUTH=service_account` | Pushes to Cloud Tasks with signed Google OIDC tokens. | Private Cloud Run FastAPI Worker | Full Cloud Run IAM & Queues. |

---

## 4. Config-Driven Event Routing Registry

Dispatcher ke andar giant switch-case nahi hoga; clean config registry `contracts/` ke hisaab se route resolve karegi:

| Domain Event (`contracts/events/`) | Target Queue | Target Task Route | Payload Contract |
|---|---|---|---|
| `resume.parse.requested` | `resume-parsing-queue` | `/internal/tasks/resume/parse` | `resume-parse-task.v1.json` |
| `candidate.profile.changed` | `candidate-projection-queue` | `/internal/tasks/candidate/projection` | `candidate-projection-task.v1.json` |
| `job.ai.enrichment.requested` | `ai-heavy-queue` | `/internal/tasks/job/enrich` | `job-enrich-task.v1.json` |
| `job.screening_questions.requested` | `ai-interactive-queue` | `/internal/tasks/job/screening-questions` | `job-screening-questions-task.v1.json` |
| `match.analyze.requested` | `ai-matching-queue` | `/internal/tasks/match/analyze` | `match-analyze-task.v1.json` |
| `interview.summary.requested` | `ai-heavy-queue` | `/internal/tasks/interview/summary` | `interview-summary-task.v1.json` |

---

## 5. Database Concurrency & State Machine

File: `02-database/migrations/baseline/15_infrastructure.sql`

### 1. Atomic Claim (Short Database Transaction):
```sql
-- Stored procedure execution with row-level concurrency protection
SELECT * FROM claim_outbox_events(
    p_worker_id := :instance_id,
    p_batch_size := 50,
    p_lease_seconds := 120
);
```

### 2. Status Transitions & Failure Handling:
- **Success:** `status='published'`, `published_at=now()`
- **ALREADY_EXISTS (409):** Cloud Tasks dedupe match ➔ `status='published'`, `published_at=now()`
- **Transient Failure:** `status='failed'`, `available_at = now() + (interval '1 second' * power(2, retry_count) * 10)`, `last_error=:error_msg`
- **Max Retries Exceeded (`retry_count >= 5`):** `status='dead_letter'`

---

## 6. Stale Lease Recovery (Crash-Safety)

Agar koi Dispatcher row claim karke `publishing` state mein crash ho jaye, toh **Stale Lease Recovery Service**:
```sql
SELECT id FROM outbox_events 
WHERE status = 'publishing' 
  AND locked_at < now() - interval '5 minutes';
```
Inhe automatically reclaim/reset karegi taaki koi bhi task network ya container crash mein permanently atka na rahe.

---

## 7. Recommended NestJS Component Structure

```text
05-outbox-dispatcher-nestjs/
├── src/
│   ├── main.ts                           # Bootstrap, CORS, ValidationPipe, graceful shutdown
│   ├── app.module.ts                     # Root module wiring config, database, dispatcher, recovery
│   │
│   ├── config/
│   │   ├── configuration.ts              # Strongly typed config schema
│   │   └── env.validation.ts             # Joi / class-validator validation
│   │
│   ├── database/
│   │   ├── database.module.ts            # Raw pg (node-postgres) connection pool
│   │   ├── database.service.ts           # Pool management & transaction runner
│   │   └── outbox.repository.ts          # claim_outbox_events, markPublished, markFailed
│   │
│   ├── routing/
│   │   ├── event-route.registry.ts       # Event-to-Queue & Endpoint resolver
│   │   └── queue-config.ts               # Queue names & OIDC audiences
│   │
│   ├── publishers/
│   │   ├── task-publisher.interface.ts   # TaskPublisher abstraction
│   │   ├── direct-http.publisher.ts      # Mode A: Direct HTTP caller (Local dev)
│   │   └── cloud-tasks.publisher.ts      # Mode B & C: Google Cloud Tasks client
│   │
│   ├── dispatcher/
│   │   ├── dispatcher.module.ts          # Core orchestration module
│   │   ├── dispatcher.controller.ts      # POST /internal/dispatcher/wake
│   │   ├── dispatcher.service.ts         # Coordinates Claim ➔ Route ➔ Publish ➔ DB Update
│   │   └── dispatcher.guard.ts           # Webhook Secret / OIDC Auth Guard
│   │
│   ├── recovery/
│   │   ├── recovery.module.ts            # ScheduleModule integration
│   │   └── stale-publisher.service.ts    # Background cron for stuck publishing recovery
│   │
│   └── health/
│       ├── health.module.ts              # Health module
│       └── health.controller.ts          # GET /health/live, GET /health/ready
│
├── test/
│   ├── unit/                             # Unit tests (Routing, Dedupe, Retries, Direct/Fake Publishers)
│   └── integration/                      # Live Supabase DB claim concurrency tests
├── package.json
├── tsconfig.json
├── nest-cli.json
├── .env.example
├── Dockerfile
└── README.md
```

---

## 8. Implementation Phases

1. **Phase 0: Schema & Contract Freeze** — Verify `15_infrastructure.sql` and `contracts/events/`.
2. **Phase 1: Project Scaffolding & Database Engine** — NestJS 10, TypeScript 5, raw `pg` pool, `outbox.repository.ts`.
3. **Phase 2: Event Route Registry & Payload Translators** — Config-driven routing for all 6 events.
4. **Phase 3: Publishers (Direct HTTP + Google Cloud Tasks)** — Interface-based dual publisher with deterministic task deduplication.
5. **Phase 4: Dispatcher Core Engine & Controller** — Bounded batch processing (`LIMIT 50`, max 5 loops per wake).
6. **Phase 5: Stale Lease Recovery & Webhook Security** — Secret guard + `@Cron('*/10 * * * *')` stale recovery.
7. **Phase 6: Comprehensive Test Suite** — Jest unit tests + concurrency test with `FOR UPDATE SKIP LOCKED`.
8. **Phase 7: Live Local E2E Verification** — Automated test with Supabase and FastAPI AI Worker.
