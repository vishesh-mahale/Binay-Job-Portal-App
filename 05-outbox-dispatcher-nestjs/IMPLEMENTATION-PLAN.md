# FINAL CONSOLIDATED PLAN — `05-outbox-dispatcher-nestjs`

> **Source:** Plan folder ki saari 6 agent-plans ka verified merge
> (`Quodro-plan.md`, `freebuf-plan.md`, `cline-plan.md`, `codex-plan.md`, `antigravity.md`, `kilocode-plan.md`)
> **Authority:** executable baseline SQL (`02-database/migrations/baseline/01–18`) + `contracts/` +
> `07-fastapi-ai-worker` code + approved background-processing docs. Koi table/column/event invent nahi.
> **Status:** har identified problem ka resolution is document mein hai (Section 24).

---

## 1. Dispatcher ki exact responsibility aur boundaries

### Dispatcher kya karega (single responsibility)

```text
wake signal (Supabase webhook / recovery cron / manual) receive karo
→ DB se bounded batch claim karo (claim_outbox_events — short txn, turant COMMIT)
→ har event ka route resolve karo (event_type → queue + FastAPI endpoint, config-driven registry)
→ deterministic Cloud Task create karo (DB transaction ke BAHAR)
→ success/ALREADY_EXISTS → mark_outbox_event_published()
→ failure → mark_outbox_event_failed() (backoff available_at ke saath)
```

### Dispatcher KABHI nahi karega (hard boundaries)

- Koi business logic / AI / parsing / embedding / OCR / email nahi.
- Business tables (jobs, candidates, applications…) par koi direct write nahi.
- `processed_events` / `event_processing_leases` touch nahi — worker-side idempotency hai.
- Raw `UPDATE outbox_events` nahi — sirf 4 approved SQL functions.
- Webhook/Cron payload ko business truth nahi maanega — payload sirf wake signal; truth hamesha DB re-read.
- Task payload mein resume text / signed URL / token / PII kabhi nahi.
- Normal user JWT se koi matlab nahi — pure machine-to-machine service.
- Koi busy-polling nahi (architecture rule: Supabase ko khali queries se busy nahi rakhna).

### Success criterion

> Har due `pending/failed` outbox event bounded delay mein sahi queue mein publish ho — ya budget
> exhaust par `dead_letter` + alert. Silently kuch bhi lost nahi hota.

---

## 2. NestJS project / module structure (consolidated best-of)

```text
05-outbox-dispatcher-nestjs/
├── src/
│   ├── main.ts                          # bootstrap, ValidationPipe(whitelist), graceful shutdown
│   ├── app.module.ts                    # Config + Database + Dispatcher + Health + Metrics
│   ├── config/
│   │   ├── configuration.ts             # strongly-typed config
│   │   └── env.validation.ts            # Joi/zod — boot par fail-fast, secrets ke defaults NAHI
│   ├── database/
│   │   ├── database.module.ts
│   │   ├── database.service.ts          # pg Pool lifecycle, tx helper, shutdown drain
│   │   └── outbox.repository.ts         # SIRF 4 function calls (claim/mark*/recoveryNeeded)
│   ├── routing/
│   │   ├── event-route.registry.ts      # typed Map: event_type → {queue, urlPath, contract}
│   │   └── payload.builder.ts           # outbox row → flat task payload v1 (columns only)
│   ├── publishing/
│   │   ├── task-publisher.interface.ts  # publish(req) → ok | alreadyExists | error
│   │   ├── cloud-tasks.publisher.ts     # production (DISPATCH_MODE=cloud_tasks)
│   │   └── direct-http.publisher.ts     # local dev (DISPATCH_MODE=direct) — same registry/serializer
│   ├── dispatcher/
│   │   ├── dispatcher.module.ts
│   │   ├── dispatcher.controller.ts     # POST /internal/dispatcher/wake
│   │   ├── dispatcher.service.ts        # single-flight + bounded drain loop
│   │   ├── backoff.policy.ts            # pure fn: retry_count → available_at (exp + cap + jitter)
│   │   └── guards/webhook-secret.guard.ts  # constant-time compare, dual-secret rotation support
│   ├── health/health.controller.ts      # /health/live, /health/ready
│   ├── observability/
│   │   ├── logger.ts                    # structured JSON + PII redaction
│   │   └── metrics.ts                   # counters/histograms (Cloud Monitoring export)
│   └── common/errors.ts                 # error classifier (transient vs permanent) + sanitizer
├── test/                                # unit + integration + concurrency + failure + load
├── Dockerfile                           # multi-stage, dist-only, non-root (USER node)
├── .env.example                         # placeholders only, no secrets/real project refs
└── package.json
```

Design rules:

- `task-publisher.interface.ts` hi woh seam hai jisse local HTTP mode aur production Cloud Tasks mode
  **same routing + payload code** share karte hain — production logic duplicate nahi hoti.
- Koi `recovery.module`/in-process scheduler NAHI — recovery Supabase-side hai (Section 14).
- Shared event-contract lib abhi overengineering hai (04-nestjs-api unimplemented); dispatcher ke
  andar typed constants rahenge, baad mein promote honge.

---

## 3. Supabase PostgreSQL connectivity

**Default choice (chatgpt review corrected):** production Cloud Run ke liye **Transaction Pooler
(6543)** default hai — Supabase serverless/autoscaling traffic ke liye yahi recommend karta hai, aur
dispatcher sirf single SECURITY DEFINER function calls karta hai. Node `pg` driver default par
anonymous prepared statements use karta hai jo transaction pooling ke saath compatible hain.
Local dev + migrations ke liye session-mode direct connection (`<YOUR_DB_HOST>:5432`).

**Phase 1 spike mein verify hoga (OD-10):** Cloud Run → pooler/direct connectivity, TLS cert
validation (`rejectUnauthorized: true` pass), connection limits, claim/mark calls pooler ke through.

> Pehle ka wording (`statement_cache_size=0` + `prepared_statement_cache_size=0`) **Python/asyncpg-
> specific** FastAPI worker pattern tha — Node `pg` dispatcher par apply nahi hota, isliye removed.

Rationale: dispatcher sirf 4 SECURITY DEFINER functions call karta hai, traffic wake-driven aur
bounded hai; multi-statement transactions ki zaroorat nahi, isliye transaction pooler clean fit hai.

Config:

| Setting | Value |
|---|---|
| Driver | `pg` (node-postgres) raw — ORM nahi |
| Pool | max 10, idleTimeout 30s, connectionTimeout 10s |
| SSL | `ssl: { rejectUnauthorized: true }` non-localhost par (kilocode ka `false` fix kiya) |
| Timeouts | statement_timeout 30s |
| Queries | 100% parameterized `$1..$n` — string interpolation forbidden |
| Credential | **Dedicated PostgreSQL LOGIN role preferred** (reviewed forward migration mein 4 functions par GRANT EXECUTE explicitly add hoga — OD-1); temporary baseline fallback = `postgres` login credential. **Correction (chatgpt review):** Supabase `service_role` API/PostgREST JWT concept hai, direct Postgres login credential NAHI — purana wording galat tha. 17_rls.sql ke grants (EXECUTE → service_role) API-level design intent reflect karte hain; direct-connection role ke grants migration mein explicitly aane chahiye |
| Shutdown | SIGTERM par pool drain; in-flight publish ko abrupt success mark nahi |

Dedicated least-privilege `dispatcher_role` (PostgreSQL LOGIN role + sirf 4 functions par EXECUTE)
future hardening hai — jab tak reviewed forward migration SQL mein na aaye, baseline `postgres`
credential use hoga (SQL truth se bahar role invent nahi; OD-1).

---

## 4. `outbox_events` claiming — `FOR UPDATE SKIP LOCKED`

Dispatcher raw SQL nahi likhta; baseline function call karta hai:

```sql
SELECT * FROM public.claim_outbox_events($1, $2, $3);
-- $1 worker_id (unique per instance+boot: "outbox-dispatcher-<hostname>-<random8>")
-- $2 batch_size = 50   (DB bounds 1–100)
-- $3 lease_seconds = 300 (DB bounds 30–900; 50 tasks create+confirm ka headroom)
```

Function semantics (15_infrastructure.sql verified):

1. Pehle stale-lease sweep: `publishing` + `lease_expires_at <= NOW()` + `retry_count+1 >= max_retries` → `dead_letter`.
2. Candidates: due `pending/failed` (`available_at <= NOW()`, budget left) OR stale `publishing` (budget left).
3. `ORDER BY available_at, occurred_at, id` + `FOR UPDATE SKIP LOCKED` + `LIMIT batch`.
4. Claim: `status='publishing'`, lease set, `locked_by=worker_id`; stale reclaim par `retry_count+1`.

Transaction discipline (non-negotiable):

```text
TXN-1: claim_outbox_events(...) → COMMIT (short)
per event, DB txn ke BAHAR: Cloud Tasks createTask
  ├─ success / ALREADY_EXISTS → TXN-2: mark_outbox_event_published(id, worker_id, task_name)
  └─ error                    → TXN-2: mark_outbox_event_failed(id, worker_id, sanitized_err, next_available_at)
```

Drain loop: batch empty hone tak repeat, **max 5 batches per drain iteration** (250 events; chatgpt
review — 20×50 worst-case Cloud Tasks latency mein lease/timeout ke paas ja sakta tha). Work remaining
(last batch full) ya drain ke dauran naya wake aane par **pending-wake latch** next iteration trigger
karta hai (Section 5) — **self-POST removed** (chatgpt round-2: `max-instances=1` par self-POST current
run ke dauran hi single-flight se discard ho jata aur bache events 10-min cron tak ruk jaate).
Backstop: Supabase Cron 10-min recovery. Batch 50 hi rahega; lease 300s single bounded iteration ke
liye comfortable hai.

---

## 5. Multi-instance safety

Correctness instance-count par depend nahi karti — 3 layers:

1. **DB:** `FOR UPDATE SKIP LOCKED` → kabhi double-claim nahi; `mark_*` functions `WHERE status='publishing' AND locked_by=<worker>` guard → lease kho dene wala instance confirm nahi kar sakta.
2. **Cloud Tasks:** deterministic task name → duplicate create par `ALREADY_EXISTS` (= success).
3. **Worker:** `processed_events` + `event_processing_leases` → at-least-once delivery safe.

Deployment posture:

- **Initial: Cloud Run `min-instances 0`, `max-instances 1`** (scale-to-zero, low idle cost).
- In-process **single-flight flag + pending-wake latch** — optimization only, correctness ka basis NAHI
  (chatgpt round-2 critical fix — plain single-flight self-wake ko discard kar deta tha):

```typescript
private dispatchRunning = false;
private wakePending = false;

async wake(reason: string) {
  // Drain ke dauran aaye wakes discard NAHI hote — latch mein queue hote hain
  if (this.dispatchRunning) { this.wakePending = true; return { accepted: true, reason: 'queued_pending_wake' }; }
  this.dispatchRunning = true;
  try {
    let result;
    do {
      this.wakePending = false;
      result = await this.drainBounded(reason);          // max 5 batches (250 events)
      if (!this.wakePending && result.lastBatchWasFull) this.wakePending = true; // work remaining
    } while (this.wakePending && this.elapsed() < REQUEST_BUDGET_MS); // 240s < Cloud Run timeout 300s
    // Budget cross par loop exit; baaki work ke liye Supabase Cron + agle webhooks backstop hain
    return result;
  } finally { this.dispatchRunning = false; }
}
```

- Latch ke baad self-POST ki zaroorat NAHI — dono cases (drain-during wake + work remaining) in-process
  handle ho jaate hain; crash/scale-down par Supabase Cron 10-min recovery backstop hai.

- Scale-out (`max > 1`) tabhi jab 1000-burst load test SLO miss dikhaye; SKIP LOCKED ki wajah se
  code already instance-agnostic hai (optional advisory-lock coordination future tuning).
- Koi leader-election / dispatcher-lease table NAHI — DB-level locking sufficient (kilocode stance sahi).

---

## 6. Claim/lease aur stale `publishing` recovery

| Situation | Behavior |
|---|---|
| Claim → task create OK | `mark_outbox_event_published` → `published`, `task_name` stored |
| Claim → Cloud Tasks fail | `mark_outbox_event_failed` → `failed` + retry_count+1 + backoff (ya dead_letter) |
| Dispatcher crash claim ke baad | row `publishing` mein lease ke saath; agla claim reclaim karta hai (`retry_count+1`) |
| Stale + budget exhaust | claim function ka sweep `dead_letter` karta hai |

Lease hygiene:

- Lease 300s vs per-task create timeout ~10s + bounded parallelism (5 concurrent creates) → comfortable.
- **NO lease watchdog** (codex review correction): in-flight create ke dauran watchdog ka `mark_failed`
  duplicate-task race bana sakta hai. Correctness ka basis: lease itni badi rakho ki bounded batch
  comfortably finish ho; agar phir bhi crash/timeout ho to stale recovery `claim_outbox_events()` ke
  andar hi hoti hai (deterministic name + ALREADY_EXISTS race ko anyway safe karte hain).
- **Koi ad-hoc stale-reset SQL NAHI** (antigravity plan ka `locked_at < now()-5min` custom reclaim
  REJECTED — recovery claim function ke andar hi hoti hai, DB function hi authority hai).

---

## 7. Retry / backoff / dead-letter

### Dispatch-side (Cloud Tasks create failures)

- Backoff (pure function): `delay = min(30s * 2^retry_count, 15min) + full jitter`; `p_available_at >= NOW()` DB rule respected. `max_retries` default 10 (DB).
- Error classification:
  - **Transient** (network, 5xx, 429/RESOURCE_EXHAUSTED, deadline): mark_failed + backoff.
  - **Permanent-ish** (PERMISSION_DENIED, INVALID_ARGUMENT, queue-not-found 404): mark_failed + instant
    operator alert; DB budget hi dead-letter karega (naya column/behavior invent nahi).
- `last_error` sanitized: error class + truncated message only; PII/secrets/payload kabhi nahi
  (DB `LEFT(...,4000)` aur truncate karta hai).

### Task-execution-side retries

- Cloud Tasks queue retry config + FastAPI worker ki zimmedari — dispatcher scope se bahar.
- Dispatch deadline: **30 min** (AI tasks long-running; Cloud Tasks HTTP deadline max).

### Dead-letter authority

- `outbox_events.status='dead_letter'` + `last_error` + `dead_lettered_at` = single source of truth.
- Alert: `dead_letter` counter > 0 → immediate page.
- **Replay rule (resolved):** lifecycle trigger `retry_count` decrease nahi karne deta — isliye replay
  hamesha **naya outbox event INSERT** karke hoga (kilocode ka "retry_count=0 reset" impossible hai).

---

## 8. Deterministic Cloud Task IDs

**Formula (resolved — sha256, charset-safe):**

```text
taskName  = "task-" + sha256hex(event_id + ":" + route_key)     // 64 hex chars
fullName  = projects/<YOUR_PROJECT_ID>/locations/<YOUR_REGION>/queues/<queue>/tasks/<taskName>
```

- `route_key` = endpoint path (jaise `/internal/tasks/resume/parse`) — FAST-API PROMPT.md ke
  `sha256(event_id + route)` ke according.
- sha256 hex choose kiya kyunki `aggregate_type` mein dots/underscores ho sakte hain (DB regex `[._-]`
  allow karta hai) jo Cloud Tasks task-ID charset mein invalid hain (kilocode/antigravity ke
  readable-name formats ka risk eliminate).
- `uq_outbox_task_name` partial unique index DB-side guarantee.
- `ALREADY_EXISTS (409)` = **success** → same task_name se `mark_outbox_event_published` (function idempotent).
- Cloud Tasks name-dedupe time-bounded (~24h) — permanent idempotency worker-side
  `processed_events` + leases se aati hai.

---

## 9. Event → queue → FastAPI endpoint routing

### Worker endpoints (07-fastapi-ai-worker verified)

```text
POST /internal/tasks/resume/parse            POST /internal/tasks/match/analyze
POST /internal/tasks/candidate/projection    POST /internal/tasks/interview/summary
POST /internal/tasks/job/enrich              POST /internal/tasks/job/screening-questions
GET  /health/liveness | /health/readiness | /health/metrics
```

### Phase 1 registry (sirf contracted events — approved queue names)

| `event_type` | Queue | Endpoint | Contracts |
|---|---|---|---|
| `resume.parse.requested` | `ai-heavy-queue` | `/internal/tasks/resume/parse` | task contract v1 available; event contract reconciliation required (G-1) |
| `candidate.profile.changed` | `projection-queue` | `/internal/tasks/candidate/projection` | task contract v1 available; event contract reconciliation required (G-1) |
| `job.ai.enrichment.requested` | `ai-heavy-queue` | `/internal/tasks/job/enrich` | task contract v1 available; event contract reconciliation required (G-1) |

### Phase 2 registry (DRAFT/G-1 pending producer freeze)

| `event_type` | Queue | Endpoint | Contracts |
|---|---|---|---|
| `match.analyze.requested` | `ai-heavy-queue` | `/internal/tasks/match/analyze` | task contract v1 available; trigger event contract DRAFT (G-1) |
| `interview.summary.requested` | `ai-heavy-queue` | `/internal/tasks/interview/summary` | task contract v1 available; trigger event contract DRAFT (G-1) |
| `job.screening_questions.requested` | `ai-heavy-queue` | `/internal/tasks/job/screening-questions` | task contract v1 available; trigger event contract DRAFT (G-1) |
| `security.scan.requested` | `security-scan-queue` | `/internal/tasks/security/scan` | trigger event contract DRAFT; dedicated handler (G-1) |

### Phase 2 (jab 04-nestjs-api trigger contracts freeze kare)

| Endpoint | Task contract | Trigger event | Status |
|---|---|---|---|
| `/internal/tasks/match/analyze` | ✅ | `match.analyze.requested` (contract DRAFT) | G-1 |
| `/internal/tasks/interview/summary` | ✅ | `interview.summary.requested` (contract DRAFT) | G-1 |
| `/internal/tasks/job/screening-questions` | ✅ | `job.screening_questions.requested` (contract DRAFT) | G-1 |
| `/internal/tasks/security/scan` | — | `security.scan.requested` (contract DRAFT, dedicated handler) | G-1 |

**Phase 2 trigger event contracts (created, DRAFT/G-1 pending producer freeze):**
- `contracts/events/match-analyze-requested.v1.json`
- `contracts/events/interview-summary-requested.v1.json`
- `contracts/events/job-screening-questions-requested.v1.json`
- `contracts/events/security-scan-requested.v1.json`

**Aggregate ID semantics:** `contracts/AGGREGATE-ID-SEMANTICS.md` (G-2 frozen for Phase 1, DRAFT for Phase 2).

**Rejected (invented queue names):** `resume-parsing-queue`, `candidate-projection-queue`,
`ai-interactive-queue`, `ai-matching-queue` — yeh repo ke kisi authoritative source mein nahi hain,
sirf agent-plans ki inventions hain.

**Documented-but-uncontracted events (invention NAHI — registry mein tab bhi abhi entry NAHI):**

| Event | Documented kahan | Missing | Action |
|---|---|---|---|
| `security.scan.requested` | `06_documents_Explanation.md`, NESTJS guide, background-worker implementation plan, FAST-API PROMPT | contract file NAHI; worker mein dedicated security-scan handler NAHI (scan inline hota hai resume-parse ke andar) | **G-1 gate** mein reconcile; registry entry tab tak nahi (cline audit correction — pehle ise galat tarike se "invention" likha tha) | **UPDATED**: Contract created (`contracts/events/security-scan-requested.v1.json`), dedicated handler registered (`/internal/tasks/security/scan`), queue `security-scan-queue` |
| `notification.email.requested` | Background-worker plan ki initial event list | koi consumer/contract nahi | OD-3 — queue provisioned only (already correctly tracked) |

### Router policy

- Unknown `event_type` → **fail-closed**: `mark_failed` + `last_error='unknown_route:<event_type>'` +
  metric + alert; repeated failures dead-letter tak. Silently skip kabhi nahi.
- **UNROUTABLE-EVENT POLICY — FROZEN RULE (chatgpt review):** `claim_outbox_events()` table ka har
  due row claim karta hai (schema mein koi `consumer/destination` column nahi hai), isliye agar
  worker chained output events (`candidate.resume.parsed`, `job.enriched`, etc.) same `outbox_events`
  mein emit karega to dispatcher unhe repeatedly fail karke **false dead letters** bana dega. Rule:
  1. Jab tak kisi event ka consumer contract + registry entry exist na kare, producer us event ko
     `outbox_events` mein emit hi NAHI karega. (Yeh **Gate G-5** hai — optional OD item nahi.)
  2. Jab routing dimension chahiye ho to reviewed forward migration decide karo (claim mein allow-list
     parameter ya destination column) — tab tak producer discipline hi protection hai.
  3. Registry entry consumer banne par hi aayegi (OD-4 tracking).
- Task payload (uniform, sab 6 contracts verified — additionalProperties:false):

```json
{ "schema_version": 1, "event_id": "<uuid>", "aggregate_id": "<uuid>", "trace_id": "<uuid>" }
```

- `trace_id` = outbox row ka `correlation_id`; null par deterministic fallback `event_id`.
- **Koi "route-specific fields" NAHI** (codex plan ka claim contracts se contradict karta tha).
- Dispatcher outbox `payload` content parse/validate nahi karta — envelope format (flat vs nested)
  producer/consumer concern hai, dispatcher concern nahi.

---

## 10. Google Cloud Tasks integration

- SDK: `@google-cloud/tasks` v3+; queues deployment-time create (runtime create nahi).
- Queues + baseline tuning (approved docs):

| Queue | Purpose | Baseline |
|---|---|---|
| `ai-heavy-queue` | resume parse, job enrichment | ~2–5 concurrent, ~1–3/sec |
| `projection-queue` | candidate projection rebuild | ~5–10 concurrent, ~5–10/sec |
| `notification-queue` | future email (OD-3) | ~10–20 concurrent |

- Task create shape:

```text
task.name          = deterministic full name (Section 8)
task.http_request  = { POST, url: <FASTAPI_URL><endpoint>,
                       headers: Content-Type: application/json,
                       body: base64(task payload),
                       oidc_token: { service_account_email: <DISPATCHER_SA>,
                                     audience: <FASTAPI_URL> } }
task.dispatch_deadline = 30m
```

- Batch mein bounded parallel creates (5 concurrent, per-task ~10s timeout) — lease window ke andar.
- Exact rate limits/load-test ke baad finalize (values env/IaC mein, code mein hardcode nahi).

---

## 11. Private Cloud Run deployment

**Resolved ingress contradiction** (cline/codex/kilocode sab mein flaw tha): dispatcher ko Supabase
webhook (public internet) se wake milta hai, isliye `ingress internal` + IAM-only auth dispatcher ke
liye WORK NAHI KARTA. Platform-level unauthenticated invoke ALLOW karni padti hai; security
app-layer secret guard se aati hai. Final config:

```text
Dispatcher (outbox-dispatcher):
  ingress: all (public)
  platform auth: unauthenticated invocation ENABLED (webhook requirement)
  application security: webhook secret guard MANDATORY (constant-time compare, dual-secret rotation)
  abuse protection: rate limiting / request size limits MANDATORY
  min-instances 0, max-instances 1, concurrency 20, 1 vCPU, 512Mi, timeout 300s
  SA: <DISPATCHER_SA>; secrets Secret Manager se env inject

FastAPI worker (already designed):
  private, ingress internal, unauthenticated invocation DISABLED, OIDC-only task delivery
```

**FastAPI internal-ingress topology condition** (chatgpt round-2 — explicitly documented):
Cloud Tasks se `ingress: internal` Cloud Run tabhi reachable hai jab **Cloud Tasks queue aur FastAPI
service same Google Cloud project / VPC-SC perimeter mein hon aur target default `run.app` URL ho**
(Google Cloud Tasks internal sources ki accepted list mein hai). Isliye:

```text
Cloud Tasks queue + FastAPI Cloud Run service → same-project/internal topology MAINTAIN karo
Target URL = default run.app URL (custom domain/internal LB par revisit karo)
OIDC auth phir bhi MANDATORY — internal ingress auth replace nahi karta
```

- Scale-to-zero allowed: webhook cold start acceptable; 10-min recovery cron safety net hai.
- Graceful shutdown: SIGTERM par current drain iteration complete; nayi wakes pending-wake latch mein
  queue (discard NAHI); shutdown ke baad baaki work Supabase Cron backstop uthata hai.
- Docker: multi-stage, dist-only, non-root user, prod deps only.
- Docs/deploy configs mein real project refs NAHI — `<YOUR_PROJECT_ID>` placeholders (AGENTS.md rule).

---

## 12. Machine-to-machine security / OIDC / IAM (user JWT nahi)

Do alag boundaries — kabhi mix nahi:

### Boundary A: Supabase webhook / cron → Dispatcher

- Supabase OIDC issue nahi kar sakta → **shared-secret header** (`x-webhook-secret`),
  `crypto.timingSafeEqual`, mismatch → 401 (no detail leak).
- **Rotation (resolved):** dual-secret window — env mein current+previous dono accept;
  rotation = naya add → webhook config update → purana remove (zero-downtime).
- Wake endpoint size/rate limits; duplicate wakes harmless by design.
- "Supabase webhook OIDC JWT" wale claims (antigravity/kilocode) REJECTED — factually impossible.

### Boundary B: Cloud Tasks → FastAPI worker

- Task `oidc_token`: dispatcher SA ka Google ID token, audience = worker URL; worker issuer/audience/SA verify karta hai (worker-side already designed).

### IAM wiring (codex review corrected)

Cloud Tasks OIDC task create karne wale caller ko OIDC task SA par `iam.serviceAccounts.actAs`
permission chahiye (`roles/iam.serviceAccountUser`) — `serviceAccountTokenCreator` sirf tab
chahiye jab code explicitly IAM Credentials API se token mint kare (hamare case mein nahi).

| SA | Role | Where |
|---|---|---|
| `<DISPATCHER_SA>` | `roles/cloudtasks.enqueuer` | dev/prod queues |
| `<DISPATCHER_SA>` | `roles/iam.serviceAccountUser` | on `<OIDC_TASK_SA>` (actAs) |
| `<OIDC_TASK_SA>` | `roles/run.invoker` | FastAPI Cloud Run service |

(`<DISPATCHER_SA>` khud hi `<OIDC_TASK_SA>` ho sakta hai — initial setup simple rakhne ke liye
ek hi SA dono roles ke saath acceptable; separation hardening future scope.)

- DB access: PostgreSQL login credential — baseline `postgres`, production dedicated LOGIN role (Section 3).
- Koi SA key JSON repo/code mein nahi; Cloud Run attached SA + Secret Manager only.
- `WEBHOOK_SECRET` ≠ `service_role` key ≠ SA token — teeno alag credentials.

---

## 13. Supabase webhook / wake-up strategy

```text
outbox_events INSERT (NestJS API ya FastAPI worker — koi bhi trusted writer)
  → Supabase Async Database Webhook (INSERT-ONLY; UPDATE/DELETE par kabhi nahi)
  → POST https://<DISPATCHER_URL>/internal/dispatcher/wake  (+ x-webhook-secret)
  → Dispatcher payload ignore karta hai; DB se pending batch claim karta hai
```

- Endpoint name approved doc ke according: `/internal/dispatcher/wake` (codex ka `/internal/wake/outbox` deviating tha).
- Webhook payload parse/log NAHI hota — secret check ke baad discard (PII logs mein aa hi nahi sakta).
- **Payload privacy nuance (chatgpt round-2):** Supabase Database Webhooks inserted row ka generated
  payload network par bhejte hain — dispatcher body ignore karta hai, par payload travel phir bhi karta
  hai. Isliye producer-side rule: `outbox_events.payload` mein **raw resume content, email, phone,
  access token, signed URL ya koi sensitive PII kabhi NAHI** — sirf IDs/references. Truly wake-only
  `{}` body chahiye ho to future option: custom `pg_net`/SQL wake function (standard row-payload
  webhook ki jagah); Supabase custom headers support karta hai.
- 1000 INSERT = 1000 wakes possible; single-flight + **pending-wake latch** (Section 5) + SKIP LOCKED
  se effectively kuch bounded drain iterations.
- Wake response: `200 {accepted, claimed, published, failed}` ya `{accepted:true, reason:"queued_pending_wake"}`
  (drain ke dauran aaya wake discard NAHI hota — latch mein queue hota hai).

---

## 14. Recovery cron

**Resolved:** recovery hamesha **Supabase-side** hogi — in-process `@nestjs/schedule` rejected
(scale-to-zero instance mein cron chal hi nahi sakta; antigravity/freebuf flaw), self-polling rejected
(approved "no busy polling" rule; kilocode flaw).

```text
Supabase Cron (har 10 min):
  SELECT public.outbox_recovery_needed();   -- indexed existence check (STABLE, SECURITY DEFINER)
  → true hone par: POST <DISPATCHER_URL>/internal/dispatcher/wake  (reason=recovery_cron, secret header)
```

- `outbox_recovery_needed()` actual conditions (verified): due `pending/failed`
  (`available_at <= NOW()`, budget left) OR stale `publishing` (`lease_expires_at <= NOW()`).
- Cron khud claim/process nahi karta — sirf wake. Healthy system mein >99% wakes webhook se.
- Alert: cron-driven wake share spike → webhook pipeline problem.

---

## 15. Logging, metrics, health checks

### Structured JSON logging (Cloud Logging)

- Allowed fields: `severity, message, event_id, event_type, aggregate_id, trace_id, queue,
  task_name, worker_id, duration_ms, outcome, error_class`.
- Kabhi NAHI: outbox `payload` content, resume text, naam/email/phone, signed URLs, Bearer/OIDC tokens,
  connection strings, secrets. Redaction middleware + no-PII-leak tests.

### Metrics

| Metric | Alert |
|---|---|
| `dispatcher_wake_total{reason}` | — |
| `dispatcher_events_claimed/published/failed_total{queue}` | drop/spike |
| `dispatcher_dead_letter_total` | **> 0 → page** |
| `dispatcher_task_create_latency`, `dispatcher_claim_latency` | p95 > 5s / > 500ms |
| `dispatcher_already_exists_total` | spike → duplicate dispatch investigate |
| due-pending backlog gauge (DB query) | > 500 for 15 min → backlog alert |

### Health

- `GET /health/liveness` — process alive, no deps.
- `GET /health/readiness` — DB reachable (cheap `SELECT outbox_recovery_needed()`) — Cloud Run probe.

---

## 16. Secrets / PII protection

- `DATABASE_URL`, `WEBHOOK_SECRET` (+previous) → Secret Manager / Cloud Run secret env; repo mein `.env` kabhi nahi.
- Google creds: attached SA (no key file); local dev ADC.
- Task payload = sirf UUIDs (contract-enforced); `last_error` sanitized; webhook payload discarded.
- **Producer-side outbox payload rule (chatgpt round-2):** `outbox_events.payload` mein raw resume,
  email, phone, access token, signed URL ya sensitive PII kabhi NAHI — webhook body network par travel
  karti hai, isliye wake-only wake signal hi safe posture hai (detail Section 13).
- Local/test DB mein synthetic data only.
- Governance: docs mein real project IDs/SA emails NAHI — placeholders only.

---

## 17. Local VS Code testing

Mode switch: `DISPATCH_MODE=direct` (local) | `cloud_tasks` (dev/prod).

1. Local Supabase stack / docker Postgres par baseline 01–18 apply (note: `02_enums.sql` fresh DB par hi — CREATE TYPE repeat-safe nahi).
2. `07-fastapi-ai-worker` local with provider=`mock`.
3. Dispatcher `.env.local`: `DATABASE_URL` (localhost:5432), `DISPATCH_MODE=direct`,
   `FASTAPI_WORKER_URL=http://127.0.0.1:8000`, `WEBHOOK_SECRET=dev-secret`.
4. Manual wake: `curl -X POST localhost:3000/internal/dispatcher/wake -H "x-webhook-secret: dev-secret"`.
5. Seed events: `INSERT INTO outbox_events(aggregate_type, aggregate_id, event_type, payload, correlation_id)`
   — **sirf envelope columns, UUIDs** (trigger clean-pending enforce karta hai; kilocode ka
   `'test-candidate-id'` wala example invalid tha — `aggregate_id` UUID column hai).

---

## 18. Local Dispatcher → Local FastAPI (production code duplicate NAHI)

`TaskPublisher` interface hi solution hai:

```text
CloudTasksPublisher (DISPATCH_MODE=cloud_tasks)  ┐ same route registry
DirectHttpPublisher (DISPATCH_MODE=direct)       ┘ same payload.builder
```

- DirectHttpPublisher same deterministic task name banata hai; in-memory `Set<taskName>` se
  `alreadyExists` simulate karta hai → ALREADY_EXISTS path bhi locally test hota hai.
- Claim/mark/router/backoff/logging — 100% production code path.
- Worker ka local-test mode (OIDC bypass sirf explicit flag + localhost target; production config
  mein reject — codex safety pattern adopted).

---

## 19. Local Dispatcher → Real Cloud Tasks → Dev Cloud Run FastAPI

1. Prereqs: dev Cloud Run FastAPI healthy (OIDC on); dev queues exist; dispatcher SA ke paas
   enqueuer + serviceAccountUser(actAs) + run.invoker. (Pehle ka `google-genai` missing-dependency
   finding STALE tha — dependency ab pyproject.toml/uv.lock mein verified maujood hai; codex review
   se corrected.)
2. Local dispatcher `gcloud auth application-default login` (ADC) — dev only.
3. `DATABASE_URL` dev Supabase; manual wake se test.
4. Verify: seed `resume.parse.requested` → wake → task visible (`gcloud tasks`) → worker process →
   `processed_events` row + optional chained outbox → published row with task_name; crash-reclaim test.
5. Koi production data/queue touch nahi — dev project only.

---

## 20. Testing strategy

### Unit (no IO)

- backoff boundaries/cap/jitter/`>= NOW()` invariant; router accuracy + unknown route; task-name
  sha256 stability vectors; webhook guard valid/invalid/rotation; error classifier mapping;
  payload.builder contract conformance.

### Integration (ephemeral Postgres + baseline SQL)

- full lifecycle pending→claim→publish→published (state shape `outbox_status_state` satisfy);
- `mark_published` idempotency (same task_name OK, dusra worker raise);
- `mark_failed` backoff + budget-exhaust dead_letter shape;
- trigger regression: dirty INSERT reject, envelope immutability;
- RLS/grant boundary with dispatcher DB role context (baseline `postgres` / future dedicated role).

### Concurrency

- 2–5 parallel dispatchers + 200 events: no double publish, no duplicate task names, exactly one
  terminal state per event; single-flight overlapping-wake test.
- Lease-steal: A claim→hang; lease expire; B reclaim; A ka mark attempt → DB raise → A gracefully drop.

### Failure

- Cloud Tasks 503 → failed + backoff; ALREADY_EXISTS injection → published; claim ke baad kill →
  stale reclaim/dead-letter; DB drop mid-batch → no half-state; invalid secret → 401 no state change;
- "110 repeated recovery wakes → 110 duplicate tasks NAHI" (codex ka best test-case adopted).

### Load — 1000-event burst

- 1000 `resume.parse.requested` + 200 `candidate.profile.changed` seed; webhook storm simulate;
  single instance drain — max 5 batches/iteration hone par **chained pending-wake latch iterations** expected (yahi design hai; self-POST NAHI).
- Assertions: zero lost, zero duplicate task names, sab terminal states; drain < 5 min (initial target);
  p95 claim < 500ms; no DB pool exhaustion; har HTTP request bounded; worker duplicate deliveries harmless (mock mode).
- Yahi test future `max-instances` decision ka baseline.

### CI scope

Unit + integration + concurrency har PR; load/failure nightly-manual.

---

## 21. CI/CD + production-readiness checklist

### CI pipeline

1. `npm ci` → lint + format + `tsc --noEmit`.
2. Unit tests → integration + concurrency (Postgres service container + baseline SQL fresh apply).
3. Secret scan (gitleaks) → Docker build → image scan (trivy; high/critical gate).
4. Push Artifact Registry (dev) on `main`; prod deploy manual approval + tagged image.
5. GCP auth via GitHub OIDC federation — key files NAHI.

### Production-readiness checklist

- [ ] Baseline SQL 01–18 target DB par applied; `outbox_recovery_needed()` callable
- [ ] Supabase webhook INSERT-only + secret header configured; rotation runbook ready
- [ ] Supabase Cron 10-min conditional wake configured
- [ ] Queues created (baseline rates); dispatch deadline 30m
- [ ] IAM: `cloudtasks.enqueuer` + `iam.serviceAccountUser` (actAs on OIDC task SA) + `run.invoker` (OIDC task SA par) — exactly itna hi
- [ ] Cloud Run: min 0 / max 1, secret env, app-layer secret guard verified
- [ ] Logs/metrics/alerts live (dead_letter, backlog, failed-sustained)
- [ ] Runbooks: dead-letter triage (naya event insert), secret rotation, manual wake, backlog drain
- [ ] 1000-burst load test pass; secret rotation drill executed once
- [ ] Docs mein koi real project ref/secret NAHI

### Implementation order

1. Scaffold + env validation + health + logging → 2. DB module + repository →
3. Router + backoff + publisher interface + DirectHttp (local E2E) →
4. Webhook guard + wake + single-flight → 5. CloudTasksPublisher + OIDC + deterministic names →
6. Dev deploy + webhook + cron → 7. Full test suites → runbook → checklist.

---

## 22. Non-goals (overengineering se bachav)

- Koi message broker (Pub/Sub/Kafka/RabbitMQ) nahi — Cloud Tasks approved.
- Dispatcher mein saga/orchestration nahi — chaining worker-side outbox INSERT se.
- Leader election / dispatcher-lease table nahi — SKIP LOCKED sufficient.
- In-process scheduler / self-polling nahi — wake-driven only.
- Payload versioning engine nahi — `schema_version` contract mein hai.
- Multi-region / custom autoscaling — future scope.

---

## 23. Kis plan se kya aaya (merge trace)

| Source | Adopted | Rejected/Fixed |
|---|---|---|
| Quodro | base structure, decisions, open-items | — |
| freebuf | security pillars intent, modes | in-process cron → Supabase Cron; invented queues |
| cline | fail-closed routing, source-of-truth table, `/recover`-style clarity | NOT READY stance; ingress flaw |
| codex | "no invented role" posture, ALREADY_EXISTS caution, 110-recovery test, OIDC-bypass guard | `/internal/wake/outbox` name; route-specific fields claim |
| antigravity | 3-modes table, bounded loop (5×50 spirit) | custom stale-reclaim SQL; in-process ScheduleModule |
| kilocode | pool settings, no-leader-election, chaos test ideas, contract-draft observation | self-polling; wrong recovery conditions; retry_count reset replay; `security.scan.requested` route kar diya jabki wo uncontracted hai (registry mein nahi aana chahiye tha); `rejectUnauthorized:false` |

---

## 24. Saare identified problems → resolutions (cross-plan)

| # | Problem (kis plan mein dikha) | Resolution |
|---|---|---|
| P1 | 3 uncontracted trigger events (screening/match/interview) sab plans mein route table mein | Phase 1 registry = sirf 3 contracted events; unknown fail-closed; Phase 2 contracts ke saath extend (G-1) |
| P2 | Invented queue names (5 plans) | Approved hi use honge: `ai-heavy-queue`, `projection-queue`, `notification-queue` |
| P3 | Flat vs versioned envelope conflict (cline B2) | Dispatcher ke liye non-issue (wo payload parse nahi karta; task payload uniform flat v1) — lekin producer-side envelope alignment **Gate G-1** ka hissa hai (E2E integration ke liye mandatory) |
| P4 | Recovery cron in-process vs Supabase (freebuf/antigravity/kilocode) | Supabase Cron 10 min + `outbox_recovery_needed()` — final |
| P5 | Custom stale-reclaim SQL (antigravity) | Rejected — recovery claim function ke andar |
| P6 | Dispatcher ingress internal vs webhook reachability (cline/codex/kilocode) | Internet-reachable wake endpoint + app-layer shared-secret guard |
| P7 | Webhook auth OIDC confusion (antigravity/kilocode) | Shared-secret header (Supabase OIDC issue nahi kar sakta) |
| P8 | Secret rotation undecided (freebuf) | Dual-secret window procedure |
| P9 | `serviceAccountTokenCreator` role claim (Quodro) | Corrected: Cloud Tasks OIDC tasks ke liye `iam.serviceAccounts.actAs` chahiye → `roles/iam.serviceAccountUser` on OIDC task SA; token-creator sirf explicit minting par (Section 12) |
| P10 | Task-ID charset risk (readable names, kilocode/antigravity) | sha256hex(event_id + route) formula |
| P11 | Dead-letter replay via retry_count reset (kilocode) | Impossible (trigger) — replay = naya event insert |
| P12 | `outbox_recovery_needed()` wrong conditions (kilocode) | Verified conditions Section 14 mein |
| P13 | `security.scan.requested` (kilocode) | Corrected (cline audit): **invention NAHI** — approved flow mein documented (06_docs/NESTJS guide/worker plan), par contract file + dedicated worker handler nahi → uncontracted, **G-1 gate** mein reconcile; registry mein abhi entry nahi |
| P14 | Cloud SQL role (freebuf) | Supabase Postgres Cloud SQL nahi — removed |
| P15 | `rejectUnauthorized: false` (kilocode) | `true` (full TLS verification) |
| P16 | Self-polling fallback (kilocode) | Rejected — no busy polling rule |
| P17 | DB role dedicated vs service_role (codex OD-8) | Corrected (chatgpt review): `service_role` API/JWT concept hai, Postgres login credential nahi — baseline `postgres` credential; dedicated LOGIN role + GRANT EXECUTE = future reviewed migration (OD-1) |
| P18 | ~~FastAPI `google-genai` missing from pyproject~~ | **ALREADY RESOLVED** — pyproject.toml + uv.lock dono mein `google-genai>=1.0.0` verified (codex review); finding stale thi |
| P19 | Notification email consumer absent | `notification-queue` provision only; router entry tab tak nahi (OD-3) |
| P20 | Real project refs in docs/env examples (freebuf/kilocode) | Placeholders only — governance rule |

---

## 25. Open decisions aur gates (codex review ke baad updated)

### Phase 1 scaffolding ko block NAHI karte

| ID | Item | Handling |
|---|---|---|
| OD-1 | Dedicated least-privilege dispatcher DB LOGIN role | Reviewed forward migration (4 functions par GRANT EXECUTE) ke baad; tab tak baseline `postgres` credential (Section 3, chatgpt review corrected) |
| OD-3 | Email consumer (`notification.email.requested`) | Future phase; queue provisioned only |
| OD-4 | Worker chained output events ki routing | Consumer banne par hi registry entry; production tak **Gate G-5** (unroutable-event policy) enforce |
| OD-6 | Queue exact rate values | Load test ke baad IaC/env mein tune |
| OD-7 | Lease 300s default (DB default 120) | Load test ke baad finalize; SQL change NAHI |
| OD-8 | Contracts draft-standardization (draft-07 vs 2020-12) | Cosmetic; contracts owner decide kare |
| OD-10 | DB connection mode (Transaction Pooler 6543 default vs direct 5432) | Phase 1 environment spike: connectivity/TLS/limits/claim-through-pooler verify (Section 3) |

### FULL INTEGRATION gates (in ke bina cloud-integration phase start NAHI)

| GATE | Item | Detail |
|---|---|---|
| G-1 | **Request-event contract reconciliation** | (a) match/interview/screening ke `*.requested` trigger contracts create karo (producer = 04-nestjs-api ke saath) — **DONE**: 3 contracts created (DRAFT); (a.1) `security.scan.requested` — documented flow hai par contract + dedicated worker handler missing: decide karo (dedicated handler banega ya inline-scan hi rahega) aur uske hisaab se contract/registry entry — **DONE**: dedicated handler registered, contract created; (b) existing 3 flat request contracts mein `outbox_events` envelope fields (`aggregate_type`, `event_type`, `payload`, `occurred_at`) align karo — **PENDING**: dispatcher par direct effect nahi (wo payload parse nahi karta), lekin producer freeze ke bina E2E integration verify nahi ho sakta |
| G-2 | **aggregate_id semantics freeze** | **DONE**: `contracts/AGGREGATE-ID-SEMANTICS.md` created — Phase 1 frozen (3 routes), Phase 2 DRAFT (4 routes). Har route ke liye contract mein explicitly likho: resume → parsing job UUID; candidate → candidate UUID; job enrich/screening → job UUID; match → job_application UUID; interview → interview UUID; security.scan → uploaded_document UUID. Dispatcher generic `aggregate_id` forward karta hai, par producer contract mein identity clear honi chahiye |
| G-3 | IAM correction apply | Section 12 wala actAs/serviceAccountUser wiring actual project mein apply + verify |
| G-4 | Cloud Run ingress decision | Section 11 config deploy par apply; webhook reachability + rate-limiting live verify |
| G-5 | **Unroutable-event policy enforcement** (chatgpt review) | Frozen rule (Section 9): bina consumer contract ke producer koi bhi event `outbox_events` mein emit NAHI karega — warna dispatcher unhe fail-closed se false dead letters bana dega (schema mein destination column nahi; claim har due row leta hai). Full integration se pehle: (a) producer-side emit discipline verify; (b) decide karo ki forward migration (claim allow-list / destination column) chahiye ya nahi |

**Note:** `google-genai` dependency (purana OD-5) resolved hai — gate list se removed.

---

## FINAL STATUS

```text
PHASE 1: COMPLETE (all 94 tests pass)
- NestJS scaffold, config/env validation, pg pool, health endpoints
- Route registry (3 contracted routes), payload builder, backoff policy
- TaskPublisher interface + DirectHttpPublisher (local mode)
- Wake endpoint + webhook-secret guard + dispatcher (single-flight + pending-wake latch + bounded drain)
- Unit test suite: 10 suites, 94 tests (all genuinely passing)
- Dockerfile, .env.example, README.md

PHASE 2: PARTIALLY COMPLETE
- G-1(a): 3 Phase 2 trigger event contracts created (DRAFT/G-1 pending producer freeze)
- G-1(a.1): security.scan.requested contract created + dedicated handler registered
- G-2: aggregate_id semantics documented (contracts/AGGREGATE-ID-SEMANTICS.md)
- Route registry extended: 7 routes total (3 Phase 1 + 4 Phase 2)
- All tests updated and passing (94/94)

PHASE 2 REMAINING:
- G-1(b): Align existing 3 flat request contracts with outbox envelope fields (pending producer freeze)
- G-3/G-4: IAM + Cloud Run ingress (blocked — needs actual GCP project + deployment)
- OD-1: Dedicated LOGIN role + GRANT EXECUTE migration (reviewed forward migration)
- OD-10: DB connectivity spike (Pooler 6543 vs direct 5432)

NOT READY FOR FULL INTEGRATION
(Gates G-3, G-4, G-5 close hone ke baad hi cloud-integration phase)
```
