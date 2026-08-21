# Implementation Pending Items — `05-outbox-dispatcher-nestjs`

> **Last updated:** Phase 2 completion audit (August 2026)
>
> This document tracks all items from IMPLEMENTATION-PLAN.md that are not yet implemented.
> Items are categorized by blocker type so we know what can be done independently vs what
> needs external dependencies.

---

## Category A: Missing Files (No External Dependency)

These items can be implemented immediately without any external blocker.

### A-1: `src/observability/metrics.ts`

**Plan reference:** Section 2 (file structure) + Section 15 (logging, metrics, health checks)

**What's needed:** A metrics module exposing counters and histograms for dispatcher observability.

| Metric Name | Type | Alert Condition |
|---|---|---|
| `dispatcher_wake_total{reason}` | Counter | — |
| `dispatcher_events_claimed_total{queue}` | Counter | drop/spike |
| `dispatcher_events_published_total{queue}` | Counter | drop/spike |
| `dispatcher_events_failed_total{queue}` | Counter | spike |
| `dispatcher_dead_letter_total` | Counter | **> 0 → page** |
| `dispatcher_task_create_latency` | Histogram | p95 > 5s |
| `dispatcher_claim_latency` | Histogram | p95 > 500ms |
| `dispatcher_already_exists_total` | Counter | spike → duplicate dispatch investigate |
| due-pending backlog gauge (DB query) | Gauge | > 500 for 15 min → backlog alert |

**Implementation approach:**
- Define metric interfaces (counter increment, histogram observe)
- Dispatcher service calls metric hooks at appropriate points
- Cloud Monitoring export is G-3/G-4 gated — module structure should exist now, export wiring later
- Consider `prom-client` or OpenTelemetry SDK for actual metric collection

**Impact without this:** No visibility into dispatcher behavior in production. Dead letters go unnoticed until manual DB check.

---

### A-2: `.dockerignore`

**Plan reference:** Section 2 (Dockerfile + .env.example + standard Node.js project hygiene)

**What's needed:** Standard Node.js `.dockerignore` to prevent unnecessary files from entering Docker build context.

**Expected content:**
```
node_modules
dist
.git
.gitignore
coverage
test
*.md
.env
.env.*
!.env.example
.vscode
```

**Impact without this:** Docker build copies `node_modules`, `test/`, `coverage/`, `.git/` into build context → slower builds, larger images, potential secret leak via `.env`.

---

## Category B: Blocked by GCP Project / Cloud Infrastructure (G-3 / G-4)

These items require an actual Google Cloud project with Cloud Run, Cloud Tasks, and IAM configured.

### B-1: `src/publishing/cloud-tasks.publisher.ts` (G-3 + G-4)

**Plan reference:** Section 10 (Google Cloud Tasks integration) + Section 12 (IAM wiring)

**What's needed:** Production publisher that creates Cloud Tasks via `@google-cloud/tasks` SDK.

**Key implementation points:**
- SDK: `@google-cloud/tasks` v3+
- Deterministic task name: `task-{sha256hex(event_id + ":" + route_key)}` (same as DirectHttpPublisher)
- OIDC token: `service_account_email` from env, `audience` = worker URL
- Bounded parallel creates: 5 concurrent, per-task ~10s timeout
- `ALREADY_EXISTS` (409) = success → `mark_outbox_event_published`
- Dispatch deadline: 30 min

**Blockers:**
- G-3: IAM wiring (`cloudtasks.enqueuer` + `iam.serviceAccountUser` on OIDC task SA)
- G-4: Cloud Run ingress decision (webhook reachability + rate-limiting)
- Needs `<YOUR_PROJECT_ID>`, `<YOUR_REGION>`, queue names in env
- Needs dispatcher SA + OIDC task SA created in GCP

**IAM wiring (from plan Section 12):**

| SA | Role | Where |
|---|---|---|
| `<DISPATCHER_SA>` | `roles/cloudtasks.enqueuer` | dev/prod queues |
| `<DISPATCHER_SA>` | `roles/iam.serviceAccountUser` | on `<OIDC_TASK_SA>` (actAs) |
| `<OIDC_TASK_SA>` | `roles/run.invoker` | FastAPI Cloud Run service |

---

### B-2: Cloud Run Deployment (G-4)

**Plan reference:** Section 11 (Private Cloud Run deployment)

**What's needed:** Actual deployment configuration for the dispatcher on Cloud Run.

**Target config:**
```
ingress: all (public)
platform auth: unauthenticated invocation ENABLED (webhook requirement)
application security: webhook secret guard MANDATORY
min-instances 0, max-instances 1, concurrency 20, 1 vCPU, 512Mi, timeout 300s
SA: <DISPATCHER_SA>; secrets Secret Manager se env inject
```

**Blockers:**
- GCP project with Cloud Run enabled
- Cloud Run service created with above config
- Secret Manager entries for `DATABASE_URL`, `WEBHOOK_SECRET`
- Actual domain/URL for webhook configuration in Supabase

---

### B-3: Supabase Webhook Configuration (G-4)

**Plan reference:** Section 13 (Supabase webhook / wake-up strategy)

**What's needed:** Supabase Async Database Webhook on `outbox_events` table.

**Config:**
- Trigger: INSERT only (UPDATE/DELETE par kabhi nahi)
- Target: `POST https://<DISPATCHER_URL>/internal/dispatcher/wake`
- Header: `x-webhook-secret: <WEBHOOK_SECRET>`

**Blockers:**
- Dispatcher must be deployed on Cloud Run (B-2)
- Supabase project must be set up with webhook feature enabled

---

### B-4: Supabase Cron Recovery (G-4)

**Plan reference:** Section 14 (Recovery cron)

**What's needed:** Supabase Cron job running every 10 minutes.

**Config:**
```sql
SELECT public.outbox_recovery_needed();
-- true hone par: POST <DISPATCHER_URL>/internal/dispatcher/wake (reason=recovery_cron, secret header)
```

**Blockers:**
- Supabase Cron feature enabled
- Dispatcher deployed and reachable (B-2)
- `outbox_recovery_needed()` function deployed (B-5)

---

## Category C: Blocked by Supabase / Database (OD-1 / OD-10)

These items need an actual Supabase project with the baseline SQL applied.

### C-1: OD-1 — Dedicated LOGIN Role Migration

**Plan reference:** Section 3 (Supabase PostgreSQL connectivity) + Section 25 (OD-1)

**What's needed:** A dedicated PostgreSQL LOGIN role (`dispatcher_role`) with least-privilege access.

**Migration content:**
```sql
CREATE ROLE dispatcher_role LOGIN PASSWORD '<from_secret_manager>';
GRANT EXECUTE ON FUNCTION public.claim_outbox_events TO dispatcher_role;
GRANT EXECUTE ON FUNCTION public.mark_outbox_event_published TO dispatcher_role;
GRANT EXECUTE ON FUNCTION public.mark_outbox_event_failed TO dispatcher_role;
GRANT EXECUTE ON FUNCTION public.outbox_recovery_needed TO dispatcher_role;
GRANT USAGE ON SCHEMA public TO dispatcher_role;
```

**Blockers:**
- Needs DBA review before applying
- Needs actual Supabase project
- Current baseline: `postgres` credential (acceptable for Phase 1)

---

### C-2: OD-10 — DB Connectivity Spike

**Plan reference:** Section 3 (connectivity) + Section 25 (OD-10)

**What's needed:** Verify connectivity from Cloud Run to Supabase.

**Verify checklist:**
- [ ] Transaction Pooler (port 6543) reachable from Cloud Run
- [ ] TLS cert validation (`rejectUnauthorized: true`) passes
- [ ] Connection limits work with pool max=10
- [ ] `claim_outbox_events()` callable through pooler
- [ ] `mark_outbox_event_published/failed` callable through pooler
- [ ] Connection drain on SIGTERM works correctly

**Blockers:**
- Needs actual Supabase project credentials
- Needs Cloud Run deployed (B-2)

---

### C-3: Baseline SQL Applied to Target DB

**Plan reference:** Section 21 (production-readiness checklist)

**What's needed:** Apply `02-database/migrations/baseline/01-18` to actual Supabase database.

**Blockers:**
- Needs Supabase project
- Note: `02_enums.sql` has `CREATE TYPE` which is not repeat-safe on existing DB

---

## Category D: Integration / Load Testing (Needs Real DB + Infra)

These tests are defined in the plan's testing strategy (Section 20) but require real infrastructure.

### D-1: Integration Tests (Real DB)

**Plan reference:** Section 20 (Testing strategy → Integration)

**Test cases needed:**
- [ ] Full lifecycle: pending → claim → publish → published (state machine verification)
- [ ] `mark_published` idempotency (same task_name OK, different worker → raise)
- [ ] `mark_failed` backoff + budget-exhaust → dead_letter shape
- [ ] Trigger regression: dirty INSERT reject, envelope immutability
- [ ] RLS/grant boundary with dispatcher DB role context

**Blockers:**
- Needs ephemeral Postgres with baseline SQL applied
- CI service container for Postgres

---

### D-2: Concurrency Tests

**Plan reference:** Section 20 (Testing strategy → Concurrency)

**Test cases needed:**
- [ ] 2-5 parallel dispatchers + 200 events: no double publish, no duplicate task names
- [ ] Exactly one terminal state per event
- [ ] Single-flight overlapping-wake test (already partially done in unit tests)
- [ ] Lease-steal: A claim → hang; lease expire; B reclaim; A's mark attempt → DB raise → A gracefully drops

**Blockers:**
- Needs real Postgres with `FOR UPDATE SKIP LOCKED` semantics
- Cannot be fully tested with mocks

---

### D-3: Failure Tests

**Plan reference:** Section 20 (Testing strategy → Failure)

**Test cases needed:**
- [ ] Cloud Tasks 503 → failed + backoff
- [ ] ALREADY_EXISTS injection → published (partially done in unit tests)
- [ ] Claim → kill → stale reclaim/dead-letter
- [ ] DB drop mid-batch → no half-state
- [ ] Invalid secret → 401 no state change
- [ ] "110 repeated recovery wakes → 110 duplicate tasks NAHI" (codex test case)

**Blockers:**
- Real Cloud Tasks for 503/kill scenarios
- Real Postgres for claim→kill→reclaim flow

---

### D-4: Load Test (1000-Event Burst)

**Plan reference:** Section 20 (Testing strategy → Load)

**Test scenario:**
- Seed: 1000 `resume.parse.requested` + 200 `candidate.profile.changed`
- Simulate webhook storm
- Single instance drain — chained pending-wake latch iterations expected

**Assertions:**
- [ ] Zero lost events
- [ ] Zero duplicate task names
- [ ] All terminal states correct
- [ ] Drain < 5 min (initial target)
- [ ] p95 claim latency < 500ms
- [ ] No DB pool exhaustion
- [ ] Every HTTP request bounded

**Blockers:**
- Needs real DB + FastAPI worker (mock mode) + Cloud Tasks (or DirectHttpPublisher with real endpoints)
- This test is the baseline for future `max-instances` decision

---

## Category E: Producer-Dependent (04-nestjs-api Not Built)

These items need the producer module to exist before they can be finalized.

### E-1: G-1(b) — Phase 1 Trigger Contract Envelope Alignment

**Plan reference:** Section 25 (Gate G-1, part b)

**What's needed:** Create 3 Phase 1 trigger event contracts with full outbox envelope:
- `contracts/events/resume-parse-requested.v1.json` (full envelope, draft-07 → 2020-12)
- `contracts/events/candidate-profile-changed.v1.json` (new)
- `contracts/events/job-ai-enrichment-requested.v1.json` (new)

**Current state:** Existing `resume-parse-requested.v1.json` uses old draft-07 flat format (missing `aggregate_type`, `event_type`, `payload`, `occurred_at`).

**Detailed action items:** Documented in `contracts/G1-ENVELOPE-ALIGNMENT.md`

**Blockers:**
- 04-nestjs-api producer must exist and freeze trigger contract field names
- Dispatcher is envelope-agnostic (unaffected), but E2E integration needs alignment

---

### E-2: G-5 — Unroutable-Event Policy Enforcement

**Plan reference:** Section 25 (Gate G-5)

**What's needed:** Verify that 04-nestjs-api NEVER emits events to `outbox_events` without a corresponding consumer contract + registry entry.

**Frozen rule:** `claim_outbox_events()` claims every due row (no destination column), so if producer emits an event without a consumer, dispatcher will fail-closed → false dead letters.

**Before full integration:**
- [ ] Producer-side emit discipline verify (code review of 04-nestjs-api)
- [ ] Decide: forward migration needed? (claim allow-list parameter OR destination column)
- [ ] Registry entry only when consumer exists (OD-4 tracking)

**Blockers:**
- 04-nestjs-api must exist for code review
- Decision on claim function enhancement (allow-list vs destination column)

---

## Category F: CI/CD & Operational Readiness

### F-1: CI Pipeline

**Plan reference:** Section 21 (CI/CD)

**What's needed:** GitHub Actions workflow.

**Pipeline steps:**
1. `npm ci` → lint + format + `tsc --noEmit`
2. Unit tests → integration + concurrency (Postgres service container + baseline SQL)
3. Secret scan (gitleaks) → Docker build → image scan (trivy; high/critical gate)
4. Push Artifact Registry (dev) on `main`; prod deploy manual approval + tagged image
5. GCP auth via GitHub OIDC federation — key files NAHI

**Blockers:**
- GCP project for Artifact Registry
- GitHub Actions runner with Postgres service container support

---

### F-2: Runbooks

**Plan reference:** Section 21 (production-readiness checklist)

**Runbooks needed:**
- [ ] Dead-letter triage (naya event insert for replay)
- [ ] Secret rotation (dual-secret window procedure)
- [ ] Manual wake (curl command + expected response)
- [ ] Backlog drain (monitoring + manual intervention)

---

### F-3: Production Readiness Checklist

**Plan reference:** Section 21

| # | Item | Status |
|---|---|---|
| 1 | Baseline SQL 01–18 applied to target DB | ❌ |
| 2 | Supabase webhook INSERT-only + secret header configured | ❌ |
| 3 | Supabase Cron 10-min conditional wake configured | ❌ |
| 4 | Queues created (baseline rates); dispatch deadline 30m | ❌ |
| 5 | IAM: `cloudtasks.enqueuer` + `serviceAccountUser` + `run.invoker` | ❌ |
| 6 | Cloud Run: min 0 / max 1, secret env, guard verified | ❌ |
| 7 | Logs/metrics/alerts live | ❌ |
| 8 | Runbooks written | ❌ |
| 9 | 1000-burst load test pass | ❌ |
| 10 | No real project refs/secrets in docs | ✅ |

---

## Summary

| Category | Count | Unblockable? |
|---|---|---|
| **A: Missing files** | 2 | **Yes — implement now** |
| **B: Cloud infrastructure** | 4 | No — needs GCP project |
| **C: Database** | 3 | No — needs Supabase |
| **D: Testing** | 4 | No — needs real DB + infra |
| **E: Producer-dependent** | 2 | No — needs 04-nestjs-api |
| **F: CI/CD & ops** | 3 | No — needs GCP + GitHub Actions |
| **Total** | **18** | **2 actionable now, 16 blocked** |

---

## Recommended Next Steps

1. **Immediately:** Implement Category A (metrics.ts + .dockerignore) — no external dependency
2. **Priority 1:** Build 04-nestjs-api producer (unblocks Category E)
3. **Priority 2:** Set up Supabase project + apply baseline SQL (unblocks Category C + D)
4. **Priority 3:** Set up GCP project + Cloud Run deploy (unblocks Category B + F)
5. **Priority 4:** Run integration/concurrency/load tests (Category D)
6. **Priority 5:** CI pipeline + runbooks (Category F)
