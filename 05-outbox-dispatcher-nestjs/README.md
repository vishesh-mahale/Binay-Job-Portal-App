# 05 — Outbox Dispatcher (NestJS / TypeScript)

[← Main README](../README.md) · [System Architecture Diagram](../docs/architecture/ARCHITECTURE-DIAGRAM.md) · [Background Architecture](../docs/architecture/background-processing/BACKGROUND-WORKER-ARCHITECTURE-OPTIONS-HINGLISH.md) · [Contracts](../contracts/README.md)

---

## 1. Overview & System Role

`05-outbox-dispatcher-nestjs` ek lightweight, standalone **NestJS Microservice** hai jo Supabase PostgreSQL Database ke `outbox_events` table ko background consumers (**Google Cloud Tasks** aur **FastAPI AI Worker**) se connect karta hai.

```text
Database Transaction Commit (outbox_events row INSERT)
                     │
                     ▼
       Supabase Async Database Webhook
                     │ (POST /internal/outbox/wake)
                     ▼
         NestJS Outbox Dispatcher
                     │
                     ├─ 1. Atomic Batch Claim: `SELECT * FROM claim_outbox_events('dispatcher-1', 50, 120)`
                     ├─ 2. Event-to-Task Payload Translation (contracts/events -> contracts/tasks)
                     └─ 3. Task Dispatch Strategy:
                            ├─ Local Dev Mode: Direct HTTP POST to FastAPI (http://localhost:8080)
                            └─ Cloud Prod Mode: Push deterministic task to Google Cloud Tasks Queue
                     │
                     ▼
       Update outbox_events status to 'published'
```

---

## 2. Core Operational Modes

| Mode | Trigger Setting | Task Dispatch Target | Target Environment |
|---|---|---|---|
| **Local Dev Mode** | `DISPATCH_TARGET=direct_http` | `http://localhost:8080/internal/tasks/*` | Local Developer Machine (Zero GCP setup) |
| **Cloud Production** | `DISPATCH_TARGET=cloud_tasks` | Google Cloud Tasks (with OIDC Auth) | Google Cloud Run (Managed Infrastructure) |

---

## 3. Approved Event-to-Task Mappings

Dispatcher `contracts/events/` ke events ko padh kar unhe corresponding `contracts/tasks/` format mein translate karta hai:

| Domain Event (`contracts/events/`) | Target Task Route | Task Payload Contract (`contracts/tasks/`) | Target Consumer |
|---|---|---|---|
| `resume.parse.requested` | `/internal/tasks/resume/parse` | `resume-parse-task.v1.json` | FastAPI AI Worker |
| `candidate.profile.changed` | `/internal/tasks/candidate/projection` | `candidate-projection-task.v1.json` | FastAPI AI Worker |
| `job.ai.enrichment.requested` | `/internal/tasks/job/enrich` | `job-enrich-task.v1.json` | FastAPI AI Worker |
| `job.screening_questions.requested` | `/internal/tasks/job/screening-questions` | `job-screening-questions-task.v1.json` | FastAPI AI Worker |
| `match.analyze.requested` | `/internal/tasks/match/analyze` | `match-analyze-task.v1.json` | FastAPI AI Worker |
| `interview.summary.requested` | `/internal/tasks/interview/summary` | `interview-summary-task.v1.json` | FastAPI AI Worker |

---

## 4. Component Structure

```text
05-outbox-dispatcher-nestjs/
├── src/
│   ├── main.ts                           # Bootstrap, validation pipes, graceful shutdown
│   ├── app.module.ts                     # Root module wiring config, db, dispatcher, and cron
│   ├── config/
│   │   ├── configuration.ts              # Strongly typed config schema
│   │   └── env.validation.ts             # Joi / class-validator schema for .env
│   ├── database/
│   │   ├── database.module.ts            # PostgreSQL pool provider
│   │   ├── database.service.ts           # Query execution & transaction helper
│   │   └── outbox-claim.repository.ts    # claim_outbox_events() & status update queries
│   ├── dispatcher/
│   │   ├── dispatcher.module.ts          # Core dispatcher orchestration module
│   │   ├── dispatcher.service.ts         # Coordinates claim -> translate -> publish -> mark published
│   │   ├── event-translator.service.ts   # Maps contracts/events to contracts/tasks
│   │   └── publishers/
│   │       ├── task-publisher.interface.ts # Abstract publisher contract
│   │       ├── direct-http.publisher.ts    # Local dev publisher (calls FastAPI directly)
│   │       └── cloud-tasks.publisher.ts    # Production publisher (Google Cloud Tasks API)
│   ├── webhook/
│   │   ├── webhook.controller.ts         # POST /internal/outbox/wake & GET /health
│   │   └── webhook.module.ts             # Webhook endpoint module
│   └── recovery/
│       ├── recovery.cron.service.ts      # Periodic fallback drainer for missed wakeups
│       └── recovery.module.ts            # ScheduleModule integration
├── test/
│   ├── unit/                             # Unit tests (Translator, Claim, Publishers)
│   └── integration/                      # Live database claim & dispatch tests
├── package.json
├── tsconfig.json
├── nest-cli.json
├── .env.example
├── Dockerfile
└── README.md
```

---

## 5. Phased Implementation Roadmap

1. **Phase 1 — Project Scaffolding & Configuration:**
   - Setup `package.json`, `tsconfig.json`, `nest-cli.json` (NestJS 10, TypeScript 5, `pg`, `@nestjs/schedule`, `@nestjs/axios`, `@google-cloud/tasks`).
   - Setup strongly-typed environment config & validation.
2. **Phase 2 — Database Connection & Atomic Claim Engine:**
   - PostgreSQL connection pool configured with SSL and timeouts.
   - `claim_outbox_events()` execution with `FOR UPDATE SKIP LOCKED`.
   - Outbox status updates (`pending` ➔ `publishing` ➔ `published` / `failed`).
3. **Phase 3 — Event Translation Engine:**
   - Strict mapping and schema validation for all 6 contract event types.
4. **Phase 4 — Dual Task Publisher Strategy:**
   - Direct HTTP Publisher (Local) + Google Cloud Tasks Publisher (Cloud).
5. **Phase 5 — Webhook Wake-Up Controller & Recovery Cron:**
   - `POST /internal/outbox/wake` endpoint + `@Cron('*/10 * * * *')` recovery fallback.
6. **Phase 6 — Automated Unit & Integration Tests:**
   - Jest test suites with coverage.
7. **Phase 7 — Live E2E Verification:**
   - End-to-end test with Supabase Database and FastAPI AI Worker.
