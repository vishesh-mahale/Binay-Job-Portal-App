# 05 — Outbox Dispatcher (NestJS / TypeScript)

[← Main README](../README.md) · [System Architecture Diagram](../docs/architecture/ARCHITECTURE-DIAGRAM.md) · [Background Architecture](../docs/architecture/background-processing/BACKGROUND-WORKER-ARCHITECTURE-OPTIONS-HINGLISH.md) · [Shared Contracts](../contracts/README.md)

---

## 1. Component Purpose & Scope

`05-outbox-dispatcher-nestjs` ek dedicated, ultra-fast, stateless **Transactional Outbox Dispatcher Microservice** hai.

Iska akela kaam Supabase Database ke `outbox_events` table ko background task queues (**Google Cloud Tasks**) aur background processing workers (**FastAPI AI Worker**) ke sath reliably connect karna hai.

### 🚫 Single Responsibility Rule:
- ❌ **No Business Logic:** Profile creation, resume parsing, job editing ya email generation nahi karega.
- ❌ **No Direct AI Calls:** LLM ya embedding APIs ko directly call nahi karega.
- ✅ **Pure Dispatching:** Database se event claim karega ➔ Target queue/URL resolve karega ➔ Publish karega ➔ Status update karega.

---

## 2. Technical Stack

* **Framework:** NestJS 10+ (TypeScript 5+)
* **Database Driver:** `pg` (node-postgres with connection pooling & transaction handling)
* **Task Queues:** `@google-cloud/tasks` (Production) & `@nestjs/axios` (Local Direct HTTP)
* **Scheduler:** `@nestjs/schedule` (For 10-minute fallback Recovery Cron)
* **Configuration:** `@nestjs/config` with `class-validator` schema enforcement

---

## 3. Detailed Documentation & Links

* 📋 **[Complete Implementation Plan & Execution Roadmap](IMPLEMENTATION-PLAN.md)** — Phased development steps, 3 operational modes (Local vs Cloud), event routing registry, and testing strategy.
* 🗺️ **[System Architecture Diagram & Blueprint](../docs/architecture/ARCHITECTURE-DIAGRAM.md)** — End-to-end system context.
* 📝 **[Shared Event & Task Contracts](../contracts/README.md)** — Versioned event schemas and task payloads.
* 🗄️ **[Infrastructure Baseline Migration](../02-database/migrations/baseline/15_infrastructure.sql)** — `outbox_events` table and `claim_outbox_events()` stored procedure.
