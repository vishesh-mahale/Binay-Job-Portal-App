# Outbox Dispatcher & Background Processing — Consolidated Master Testing Scenarios (TESTING-SCENARIOS-1)

[← Back to Outbox Dispatcher README](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/05-outbox-dispatcher-nestjs/README.md) · [Local Testing Options](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/05-outbox-dispatcher-nestjs/LOCAL-TESTING-OPTIONS.md) · [Implementation Plan](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/05-outbox-dispatcher-nestjs/IMPLEMENTATION-PLAN.md) · [Antigravity Audit](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/Agent_review/final-antigravity.md) · [Codex Audit](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/Agent_review/final-codex.md) · [Cline Audit](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/Agent_review/Cline-testing-scenarios-audit.md) · [SQL Infrastructure DDL](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/02-database/migrations/baseline/15_infrastructure.sql)

---

## 1. Executive Architecture & Verification Principles

Background asynchronous processing in the Binay Job Portal architecture is designed across four distributed tiers:
1. **Supabase PostgreSQL** ([`15_infrastructure.sql`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/02-database/migrations/baseline/15_infrastructure.sql)): Transactional envelope storage, atomic lifecycle procedures, state-machine check constraints, and 300s TTL row locks.
2. **Outbox Dispatcher** ([`05-outbox-dispatcher-nestjs`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/05-outbox-dispatcher-nestjs)): Bounded claim loops, single-flight latching, deterministic SHA256 task naming, and constant-time webhook ingress.
3. **Google Cloud Tasks** (`asia-south1/ai-heavy-queue`, `projection-queue`): At-least-once delivery, exponential backoff retries, and 30-minute HTTP execution deadlines.
4. **FastAPI AI Worker** ([`07-fastapi-ai-worker`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/07-fastapi-ai-worker)): Idempotent task handlers, 768-dim embeddings, atomic multi-table transaction commits, in-flight lease guards, and stale revision coalescing.

### 🛡️ Consolidated Verification Disciplines (Antigravity + Codex + Cline Consensus):
- **Proof vs Claim Separation:** Unit test passes or static SQL definitions do not constitute live E2E proof. Live proof requires reproducible execution with event ID, timestamps, and database records.
- **Dual-Guard Idempotency & In-Flight Coalescing:** Publisher Level ([`task-name.ts`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/05-outbox-dispatcher-nestjs/src/publishing/task-name.ts)) + Worker Level ([`processed_events_repo.py`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/07-fastapi-ai-worker/app/repositories/processed_events_repo.py)) + In-Flight Concurrency Lease ([`task_handlers.py:363-374`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/07-fastapi-ai-worker/app/api/v1/task_handlers.py#L363-L374)).
- **Fail-Closed Security:** Unregistered routes, bad webhook secrets, and malformed contracts fail closed immediately and never block healthy event queues.
- **Zero-Mutation Test Discipline:** Test suites never execute raw state mutations (`UPDATE outbox_events SET status = ...`); all state transitions MUST flow through approved SQL procedures or Dispatcher/Worker endpoints.
- **Environment & Data Safety:** Smoke and integration tests must run only against dev/test environments with dynamic test entities and strict cleanup.

---

## 2. Master Verification Matrix

### 🟢 Category A: Local Development Testable Scenarios (17 Scenarios)

| ID | Scenario Name | Test Target | Verification Harness | Verified Code & SQL Truth | Verified Status |
|:---:|---|---|---|---|:---:|
| **A-01** | **Full Happy-Path E2E Pipeline** | Supabase ➔ Dispatcher ➔ GCP Tasks ➔ DevTunnel ➔ FastAPI ➔ Supabase | `[SMOKE-AUTOMATED]` (`run_scenario_1_happy_path`) | [`dispatcher.service.ts:178`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/05-outbox-dispatcher-nestjs/src/dispatcher/dispatcher.service.ts#L178) ➔ [`cloud-tasks.publisher.ts`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/05-outbox-dispatcher-nestjs/src/publishing/cloud-tasks.publisher.ts) ➔ [`task_handlers.py:324`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/07-fastapi-ai-worker/app/api/v1/task_handlers.py#L324) ➔ `processed_events` | ✅ **VERIFIED LIVE** |
| **A-02** | **Downstream Worker Outage** | Worker offline / 503 | `[MANUAL-FAULT-INJECTION]` | Cloud Tasks exponential backoff retry curve (min 5s, max 300s, max 10 attempts); holds tasks until worker restarts | 🟡 **MANUAL GATE** |
| **A-03** | **Cloud Tasks API 429/503 Outage** | GCP API rate limit / 503 | `[UNIT-TESTED]` ([`cloud-tasks.publisher.spec.ts`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/05-outbox-dispatcher-nestjs/src/publishing/cloud-tasks.publisher.spec.ts)) | [`errors.ts`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/05-outbox-dispatcher-nestjs/src/common/errors.ts): gRPC 14 ➔ 503, gRPC 8 ➔ 429; calls `mark_outbox_event_failed`, unlocks row | ✅ **UNIT VERIFIED** |
| **A-04** | **Dispatcher Crash Mid-Publishing** | `outbox_events` lock TTL | `[MANUAL-FAULT-INJECTION]` + SQL | [`15_infrastructure.sql:108`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/02-database/migrations/baseline/15_infrastructure.sql#L108) (`p_lease_seconds=120`), [`app-config.service.ts`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/05-outbox-dispatcher-nestjs/src/config/app-config.service.ts) (`CLAIM_LEASE_SECONDS=300`) | 🟡 **MANUAL GATE** |
| **A-05** | **Poison Pill / Max Retries (`dead_letter`)** | Retry budget exhaustion | `[INTEGRATION-TESTED]` (SQL) | [`15_infrastructure.sql:231-236`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/02-database/migrations/baseline/15_infrastructure.sql#L231-L236): `retry_count + 1 >= max_retries` ➔ `status = 'dead_letter'`, `dead_lettered_at = NOW()` | ✅ **SQL VERIFIED** |
| **A-06** | **Unknown / Unrouted Event** | Fail-Closed Route Security | `[SMOKE-AUTOMATED]` (`run_scenario_3_unknown_route`) | [`event-route.registry.ts:38`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/05-outbox-dispatcher-nestjs/src/routing/event-route.registry.ts#L38): returns null ➔ `outbox: failed`, `last_error: unknown_route:<type>` | ✅ **SMOKE VERIFIED** |
| **A-07** | **Cloud Tasks Publisher Dedup** | Publisher Idempotency | `[UNIT-TESTED]` ([`cloud-tasks.publisher.spec.ts`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/05-outbox-dispatcher-nestjs/src/publishing/cloud-tasks.publisher.spec.ts)) | [`task-name.ts:18`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/05-outbox-dispatcher-nestjs/src/publishing/task-name.ts#L18): `task-sha256(event_id:route)` ➔ GCP `409 ALREADY_EXISTS` ➔ Safe success (`published`) | ✅ **UNIT VERIFIED** |
| **A-08** | **Worker-Side Duplicate Delivery** | Worker Idempotency | `[SMOKE-AUTOMATED]` (`run_scenario_2_duplicate_idempotency`) | [`task_handlers.py:355`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/07-fastapi-ai-worker/app/api/v1/task_handlers.py#L355): `processed_repo.is_processed()` ➔ `{"status": "success", "skipped": true}`, 0 duplicate DB writes | ✅ **SMOKE VERIFIED** |
| **A-09** | **Webhook Security & Invalid Secret** | Ingress Authentication | `[SMOKE-AUTOMATED]` (`run_scenario_5_webhook_auth_rejection`) | [`webhook-secret.guard.ts:25`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/05-outbox-dispatcher-nestjs/src/dispatcher/guards/webhook-secret.guard.ts#L25): `crypto.timingSafeEqual` check ➔ `401 Unauthorized` | ✅ **SMOKE VERIFIED** |
| **A-10** | **Webhook Loss & Recovery Check** | SQL Recovery State Transition | `[SMOKE-AUTOMATED]` (`run_scenario_7_recovery_behavior_check`) | [`15_infrastructure.sql:322`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/02-database/migrations/baseline/15_infrastructure.sql#L322): `outbox_recovery_needed()` strict `False ➔ True ➔ Drained` transition | ✅ **SMOKE VERIFIED** |
| **A-11** | **Outbox Transactional Atomicity** | Atomic Domain Mutation | `[INTEGRATION-TESTED]` (Unit / SQL) | [`test_database_lifecycle.py`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/07-fastapi-ai-worker/tests/unit/test_database_lifecycle.py): Single PostgreSQL TX for business row + outbox event; error rolls back both | ✅ **UNIT/SQL VERIFIED** |
| **A-12** | **Worker Chained Outbox Commit** | Multi-Table Atomic Commit | `[INTEGRATION-TESTED]` ([`test_candidate_projection_flow.py`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/07-fastapi-ai-worker/tests/integration/test_candidate_projection_flow.py)) | Path 1: Projection ([`task_handlers.py:401-410`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/07-fastapi-ai-worker/app/api/v1/task_handlers.py#L401-L410)) in 1 TX<br>Path 2: Resume Parse ([`task_handlers.py:225-303`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/07-fastapi-ai-worker/app/api/v1/task_handlers.py#L225-L303)) in 1 TX | ✅ **INT VERIFIED** |
| **A-13** | **Task Contract Validation** | Schema Enforce (`schema_version`) | `[SMOKE-AUTOMATED]` (`run_scenario_4_contract_validation`) | [`tasks.py:18`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/07-fastapi-ai-worker/app/schemas/tasks.py#L18): `schema_version: Field(1, ge=1)` ➔ `422 Unprocessable Entity` on `schema_version = 0` | ✅ **SMOKE VERIFIED** |
| **A-14** | **Stale Revision Coalescing** | Out-of-Order Task Arrival | `[INTEGRATION-TESTED]` ([`test_stale_revision_coalescing.py`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/07-fastapi-ai-worker/tests/integration/test_stale_revision_coalescing.py)) | [`task_handlers.py:396-398`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/07-fastapi-ai-worker/app/api/v1/task_handlers.py#L396-L398): `check_stale_source_state()` ➔ `{"status": "success", "candidate_id": "...", "coalesced": true}` | ✅ **INT VERIFIED** |
| **A-15** | **Concurrent Wake Storm Latching** | Single-Flight Drain Loop | `[SMOKE-AUTOMATED]` (`run_scenario_6_concurrent_wake_storm`) | [`dispatcher.service.ts:80-135`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/05-outbox-dispatcher-nestjs/src/dispatcher/dispatcher.service.ts#L80-L135): `isDraining = true`; 10/10 get `200 OK`, `iterations >= 1`, `budget_exhausted = false` | ✅ **SMOKE VERIFIED** |
| **A-16** | **Observability & PII Redaction** | Structured JSON Logs | `[UNIT-TESTED]` ([`logger.spec.ts`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/05-outbox-dispatcher-nestjs/src/observability/logger.spec.ts), [`test_logging.py`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/07-fastapi-ai-worker/tests/unit/test_logging.py)) | NestJS: `[REDACTED]` ([`logger.ts:28`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/05-outbox-dispatcher-nestjs/src/observability/logger.ts#L28))<br>FastAPI: `[EMAIL_REDACTED]`, `[PASSWORD_REDACTED]`, `[BEARER_REDACTED]` ([`logging.py:60`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/07-fastapi-ai-worker/app/core/logging.py#L60)) | ✅ **UNIT VERIFIED** |
| **A-17** | **In-Flight Lease-Held Coalescing** | Concurrent duplicate for same candidate | `[INTEGRATION-TESTED]` ([`test_idempotency_dual_guard.py`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/07-fastapi-ai-worker/tests/integration/test_idempotency_dual_guard.py)) | [`task_handlers.py:371-374`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/07-fastapi-ai-worker/app/api/v1/task_handlers.py#L371-L374): `event_processing_leases` acquired ➔ second task returns `200 {"skipped": true, "reason": "lease_held"}` | ✅ **INT VERIFIED** |

---

### 🟡 Category B: Production Deployment Gates (6 Hardened Gates)

| ID | Gate Name | Infrastructure Prerequisite | Verification Method in Staging / Production | Verified Reference |
|:---:|---|---|---|:---:|
| **B-01** | **Google IAM OIDC Signature Validation** | Private Cloud Run Ingress | Cloud Tasks sends signed IAM JWT (`Authorization: Bearer <JWT>`); unauthenticated calls return `401 Unauthorized`. | [`security.py:30`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/07-fastapi-ai-worker/app/core/security.py#L30) |
| **B-02** | **Cloud Run SIGTERM Graceful Drain** | Cloud Run Container Lifecycle | Scale-down signal caught by [`database.service.ts:onModuleDestroy()`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/05-outbox-dispatcher-nestjs/src/database/database.service.ts); drains active batch and closes PG pool within 10s. | [`database.service.ts:35`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/05-outbox-dispatcher-nestjs/src/database/database.service.ts#L35) |
| **B-03** | **1000-Event Nightly Stress Benchmark** | Staging / Prod Supabase Pooler | Ingest 1000 bulk events; benchmark memory < 512MB, DB pool ≤ 10 connections, drain completes within 5 bounded batches. | [`app-config.service.ts`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/05-outbox-dispatcher-nestjs/src/config/app-config.service.ts) |
| **B-04** | **Supabase Browser Anon RLS Audit** | Baseline Migration Freeze ([`17_rls.sql`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/02-database/migrations/baseline/17_rls.sql)) | Verify that Supabase frontend clients using public `anon` key receive `42501 permission denied` on `outbox_events` and `processed_events`. | [`17_rls.sql`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/02-database/migrations/baseline/17_rls.sql) |
| **B-05** | **Supabase pg_cron Schedule Provisioning** | Operational Dashboard / SQL extension | Execute and verify: `SELECT cron.schedule('outbox-recovery', '*/10 * * * *', 'SELECT public.outbox_recovery_needed()')`. | [`15_infrastructure.sql:320`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/02-database/migrations/baseline/15_infrastructure.sql#L320) |
| **B-06** | **GCP Queue Retry Backoff Verification** | GCP Cloud Tasks Provisioning | Verify queue attributes via `gcloud tasks queues describe <queue>` for `minBackoff`, `maxBackoff`, and `maxAttempts`. | [`LOCAL-TESTING-OPTIONS.md`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/05-outbox-dispatcher-nestjs/LOCAL-TESTING-OPTIONS.md) |

---

## 3. Database Lifecycle & Trigger Ground Truth

### 3.1 SQL Trigger `enforce_outbox_event_lifecycle()` ([`15_infrastructure.sql:249-297`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/02-database/migrations/baseline/15_infrastructure.sql#L249-L297))
```sql
IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending'
       OR NEW.locked_at IS NOT NULL OR NEW.lease_expires_at IS NOT NULL OR NEW.locked_by IS NOT NULL
       OR NEW.task_name IS NOT NULL OR NEW.published_at IS NOT NULL OR NEW.dead_lettered_at IS NOT NULL
       OR NEW.retry_count <> 0 OR NEW.last_error IS NOT NULL THEN
        RAISE EXCEPTION 'New outbox event must start in a clean pending state';
    END IF;
    RETURN NEW;
END IF;
```
- **Physical Verification:** Setting `status = 'pending'` on INSERT is **100% allowed** as long as all mutable tracking columns remain at their defaults.

### 3.2 State Machine Transitions & Check Constraints ([`15_infrastructure.sql:66-89`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/02-database/migrations/baseline/15_infrastructure.sql#L66-L89))
- `pending`: Unlocked, no task name, no published timestamp.
- `publishing`: `locked_at`, `lease_expires_at`, `locked_by` MUST be populated.
- `published`: `published_at` and `task_name` MUST be populated; locks cleared.
- `failed`: `retry_count > 0` and `last_error` populated; locks cleared.
- `dead_letter`: `retry_count = max_retries`, `dead_lettered_at` populated, `last_error` populated; locks cleared.

---

## 4. Multi-Tier Service Implementation Details

### 4.1 PII & Credential Redaction
- **NestJS Dispatcher ([`logger.ts:28`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/05-outbox-dispatcher-nestjs/src/observability/logger.ts#L28)):** Uses `const REDACTED = '[REDACTED]'`. Redacts passwords, bearer tokens, DB connection strings, and secret keys.
- **FastAPI AI Worker ([`logging.py:60-75`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/07-fastapi-ai-worker/app/core/logging.py#L60-L75)):** Uses structured tokens: `[EMAIL_REDACTED]`, `[PASSWORD_REDACTED]`, `[BEARER_REDACTED]`, `[API_KEY_REDACTED]`, `[PHONE_REDACTED]`.

### 4.2 Lease Duration Hierarchy
- **SQL Procedure Default ([`15_infrastructure.sql:108`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/02-database/migrations/baseline/15_infrastructure.sql#L108)):** `p_lease_seconds INTEGER DEFAULT 120`.
- **Dispatcher Runtime Value ([`app-config.service.ts`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/05-outbox-dispatcher-nestjs/src/config/app-config.service.ts)):** `CLAIM_LEASE_SECONDS = 300` (5 minutes), passed dynamically to `claim_outbox_events()`.

### 4.3 Multi-Table Atomic Transaction Paths in Worker
1. **Candidate Search Projection Path ([`task_handlers.py:401-410`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/07-fastapi-ai-worker/app/api/v1/task_handlers.py#L401-L410)):**
   Commits `candidate_search_profiles` + `processed_events` + `candidate.projection.rebuilt` in single `db_manager.transaction()`.
2. **Resume Parsing Path ([`task_handlers.py:225-303`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/07-fastapi-ai-worker/app/api/v1/task_handlers.py#L225-L303)):**
   Commits `resume_parsed_data` + `processed_events` + `candidate.resume.parsed` (or marks job failed) in single `db_manager.transaction()`.

---

## 5. Extended Distributed Failure Scenarios Catalog (M-01 to M-08)

| # | Advanced Failure Mode | Trigger / Condition | System Defense & Invariant |
|:---:|---|---|---|
| **M-01** | **Lease-Loss During Cloud Tasks Call** | High network latency causes claim lease to expire before Cloud Tasks ACK | Safe mark functions ([`dispatcher.service.ts:206`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/05-outbox-dispatcher-nestjs/src/dispatcher/dispatcher.service.ts#L206)) catch lease-reject exceptions; next recovery sweep reclaims safely |
| **M-02** | **Cloud Tasks Queue Deletion / 404** | Queue deleted in GCP Console | Cloud Tasks returns `NOT_FOUND (5)` ➔ classified as permanent error ➔ row failed with alert |
| **M-03** | **Webhook Dual-Secret Grace Period** | Key rotation in progress | [`WebhookSecretGuard`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/05-outbox-dispatcher-nestjs/src/dispatcher/guards/webhook-secret.guard.ts) verifies both `WEBHOOK_SECRET` and `WEBHOOK_SECRET_PREVIOUS` |
| **M-04** | **Recovery with Stale `publishing` Leases** | Dispatcher killed while holding lock | `outbox_recovery_needed()` checks `(status = 'publishing' AND lease_expires_at <= NOW())` |
| **M-05** | **Dead-Letter Replay via Re-Insert** | Operator fixes bug and replays dead-lettered event | Operator inserts a NEW outbox row with new `event_id` referencing original payload; dead-letter row remains immutable for audit |
| **M-06** | **Outbox Schema Version Incompatibility** | Producer emits `schema_version = 2` while Worker expects `1` | Worker Pydantic schema rejects with `422 Unprocessable Entity` |
| **M-07** | **PostgreSQL Pool Exhaustion** | Worker spawns 100 parallel DB connections | `DATABASE_URL` pool size clamped (`max_connections=20`, `statement_cache_size=0` for Supabase Transaction Pooler) |
| **M-08** | **Payload Redaction in Dispatcher Logs** | Task creation fails on sensitive payload | Dispatcher never logs `event.payload`; only logs allow-listed envelope fields (`event_id`, `event_type`, `task_name`, `error_class`) |

---

## 6. Execution Commands & Test Harnesses

### Unified Local Smoke Suite ([`scratch/run_all_scenarios_suite.py`](file:///C:/Users/ADMIN/OneDrive/Desktop/Vishesh/Binay-Job-Portal-App/scratch/run_all_scenarios_suite.py)):
Executes the 7 automated ingress, idempotency, routing, and recovery scenarios:
```bash
# MUST be executed from Repository Root: C:\Users\ADMIN\OneDrive\Desktop\Vishesh\Binay-Job-Portal-App
python scratch/run_all_scenarios_suite.py
```

### Component Unit & Integration Test Suites:
```bash
# Outbox Dispatcher Unit Tests (11 test suites / 103 passed)
cd 05-outbox-dispatcher-nestjs
npm test

# FastAPI AI Worker Unit & Integration Tests (308 collected / 306 passed)
cd ../07-fastapi-ai-worker
pytest
```
