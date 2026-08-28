# Implementation Pending — `05-outbox-dispatcher-nestjs`

> **Last reviewed:** 27 August 2026 (Webhook Live Verification)  
> **Purpose:** केवल genuinely बाकी काम यहाँ रखे जाएँ। Complete काम नीचे अलग record में है।

## Current status

Dispatcher का core implementation, security hardening और cloud end-to-end path live deployed और verified हैं:

```
Supabase outbox_events
  → NestJS Dispatcher (Cloud Run: dev-outbox-dispatcher-00003-rv9)
  → Google Cloud Tasks (asia-south1 / projection-queue)
  → FastAPI Worker (Cloud Run: dev-fastapi-ai-worker-00007-dmd, OIDC Protected)
  → Supabase result / processed_events / candidate_search_profiles
```

Live & Unit Verification Summary:

- **Dispatcher Jest Unit Tests:** **104/104 passed (100%)** across 12 suites.
- **FastAPI Pytest Suite:** **311 non-integration tests passed**. Two live Vertex AI integration tests remain environment-blocked because outbound traffic is routed through local proxy `127.0.0.1:9`; they were not counted as passing.
- **Lockfile & Dependencies:** `uv.lock` regenerated with `uv lock` (stale `pypdf2` removed, locked `pypdf v6.16.1`, `pyproject.toml` policy `"pypdf>=6.16.1,<7.0.0"`).
- **Cloud Run Dispatcher:** Revision `dev-outbox-dispatcher-00003-rv9` live deployed, 100% traffic, strict TLS verification.
- **Cloud Run AI Worker:** Revision `dev-fastapi-ai-worker-00007-dmd` live deployed, 100% traffic, private ingress (OIDC authenticated), `postgresql+asyncpg://` DB driver.
- **Cloud Scheduler Recovery Sweeper:** Cron `dev-outbox-recovery-sweep` (`*/10 * * * *`) created, verified, and running live.
- **Option 5 Live E2E Verification:** `scratch/test_option_5_full_cloud_live.py` passes **6/6 steps live** in environments with direct Cloud Run HTTPS outbound access. Environments with local loopback proxy (`HTTP_PROXY=127.0.0.1:9`) require `NO_PROXY=*` or proxy bypass to reach Cloud Run endpoints.

---

## 🔴 P0 — Security blockers before production

### P0-2. Secrets को Secret Manager में move करना और credentials rotate करना

Live report के अनुसार environment variable injection me plain text parameters हैं। Production baseline se pehle:

- Supabase database password rotate करें।
- Strong नया webhook secret generate करें।
- `DATABASE_URL` और `WEBHOOK_SECRET` को Secret Manager references से inject करें।
- Local files, deploy commands, scripts और docs से plain secrets audit/scrub करें।

---

## P1 — Additional reliability and architecture gates

### P1-5. Queue provisioning और runtime configuration re-verify करना

हर deployed queue के लिए current GCP configuration evidence सुरक्षित करें:

- `ai-heavy-queue`, `projection-queue` और `security-scan-queue` मौजूद हों।
- retry policy, rate limits और `dispatchDeadline` approved values से match हों।
- deterministic task name और queue location (`asia-south1`) match हो।
- dispatcher service account को केवल required Cloud Tasks permissions मिले हों।

### P1-6. Supabase webhook को scheduler से अलग verify करना — CLOSED (27 Aug 2026)

Webhook configuration और live INSERT-trigger path independently verify हो चुका है:

- `outbox_events` पर केवल INSERT async webhook configured हो।
- target dispatcher wake URL सही हो।
- strong `x-webhook-secret` configured हो।
- webhook failure के बावजूद scheduler recovery काम करे।

Live evidence: valid `candidate.profile.changed` INSERT से Dispatcher wake हुआ, event `publishing → published` हुआ, deterministic Cloud Task बना और FastAPI ने `processed_events` में `candidate_projection` row लिखी। Recovery Scheduler अलग backstop के रूप में retained है।

### G-1(b). Producer event-envelope alignment

`04-nestjs-api` बनने के बाद Phase-1 producer events के final contracts freeze करें। Existing flat contracts को outbox envelope fields से align करना है:

- `aggregate_type`
- `event_type`
- `payload`
- `occurred_at`
- `correlation_id` / `causation_id` जहाँ applicable हों

इस gate के बिना dispatcher route test pass हो सकता है, लेकिन producer-to-worker E2E contract complete नहीं माना जाएगा।

### G-5. Producer-side unroutable-event discipline

Producer को ऐसा event `outbox_events` में emit नहीं करना चाहिए जिसका dispatcher registry और consumer contract मौजूद न हो। `04-nestjs-api` event emitters को registry से cross-check करें और chained events की ownership freeze करें।

### OD-1. Dedicated least-privilege dispatcher DB role

Production में baseline credential को dedicated PostgreSQL LOGIN role से replace करने का reviewed forward migration तैयार/apply करें। Role को केवल approved outbox functions पर `EXECUTE` मिले; raw table writes नहीं।

### OD-10. Supabase Pooler connectivity spike

Cloud Run से final DB mode verify करें: Transaction Pooler `6543`, TLS validation, pool/connection limits, चार approved outbox functions और SIGTERM connection drain।

### OD-6/OD-7/OD-8. Configuration decisions freeze करना

- Queue rate/concurrency और retry values load test के बाद freeze करें।
- DB lease (`120s` default बनाम runtime value) का final operational value document करें।
- Event contract draft version (`draft-07` बनाम `2020-12`) standardize करें।

---

## P2 — Database, integration and load verification

### P2-1. Real-Postgres integration suite

Baseline schema के साथ verify करें:

- `pending → publishing → published`
- publish idempotency और deterministic task name
- failure backoff और `dead_letter`
- stale publishing lease recovery
- trigger/immutability violations reject
- dispatcher DB role केवल approved functions execute करे

### P2-2. Multi-dispatcher concurrency test

2–5 parallel dispatchers और कम-से-कम 200 events के साथ verify करें:

- `FOR UPDATE SKIP LOCKED` से double claim न हो
- duplicate Cloud Task names न बनें
- प्रत्येक event का consistent terminal outcome हो
- lease steal के बाद पुराने worker का mark safely reject हो

### P2-3. Failure-injection suite

Test करें:

- Cloud Tasks `503`
- `ALREADY_EXISTS` (`409`) को successful publish मानना
- dispatcher crash after claim
- database disconnect mid-batch
- worker unavailable / `401` / `5xx`
- repeated recovery wakes से duplicate tasks न बनना

### P2-4. 1000-event burst/load test

Assertions:

- zero lost events
- zero duplicate task names
- correct terminal states
- bounded DB pool usage
- p95 claim latency target
- wake latch पूरा backlog drain करे
- HTTP/task timeouts bounded रहें

### P2-5. Live Vertex tests का network prerequisite

FastAPI के 2 live Vertex tests local proxy/network (`127.0.0.1:9`) failure से fail हुए। Pass कराने के लिए valid ADC/API credentials और working outbound network/proxy चाहिए। Credentials code/logs में न रखें।

---

## P3 — Observability and operations

### P3-1. Dispatcher metrics/export

यदि अभी production exporter नहीं है तो add करें:

- wake count
- claimed/published/failed/dead-letter count
- claim/task-create latency
- `ALREADY_EXISTS` count
- due-pending backlog gauge

Metrics के साथ alerts और dashboard/runbook रखें।

### P3-2. Health और graceful shutdown verification

Verify करें:

- liveness dependency-free रहे
- readiness DB connectivity reflect करे
- SIGTERM पर new claims रुकें
- active DB connections/tasks safely drain हों
- Cloud Run timeout/concurrency documented values से match करें

### P3-3. Secret rotation/incident runbook

Secret rotation, exposed credential incident, webhook secret replacement और rollback के exact steps लिखें।

### P3-4. CI/CD gates

GitHub Actions में कम-से-कम:

- `npm ci`, typecheck, lint, unit tests
- FastAPI pytest
- integration tests with ephemeral Postgres
- secret scan
- Docker/image scan
- Artifact Registry push
- approved Cloud Run deploy
- GitHub OIDC federation; long-lived keys नहीं

### P3-5. Unroutable Event & Dead-Letter Email Alerting (Future Scope)

यदि `outbox_events` में कोई unroutable event (जिसका consumer registry / routing table में mapped न हो) आए, या continuous retries के बाद कोई event `dead_letter` status में जाए, तो system को:

- Admin / DevOps engineering team को automatic **Email Alert Notification** भेजनी चाहिए (via GCP Cloud Monitoring Email Alerts / SendGrid / Supabase Email Webhook).
- Notification email में `event_type`, `aggregate_id`, `id`, और error traceback payload शामिल हो ताकि immediate manual/automated intervention हो सके।

---

## P4 — Maintenance (non-blocking)

- `google.generativeai` → supported `google-genai`
- Pydantic v1 `Config` → `model_config`
- `PyPDF2` → `pypdf`
- Local ADC setup ताकि private-worker probe skip न हो
- Docs में service names, env names और deployment commands sync रखना

---

## Already verified / not pending (Closed Items)

इनको दोबारा pending न लिखें, जब तक नया failure evidence न मिले:

- Baseline SQL `01–18` execution और RLS enabled होना
- Dispatcher core NestJS implementation
- Local Dispatcher → Cloud Tasks → DevTunnel → FastAPI smoke flow
- deterministic task naming और `ALREADY_EXISTS` tests
- local Jest suite (**104/104 passed; 12 suites**)
- FastAPI unit/non-integration pytest suite (**311 passed**; live Vertex tests environment-blocked)
- dispatcher `.dockerignore` & worker port consistency (`8080`)
- CORS methods restricted to `POST` aur `GET`
- **P0-1 (Worker OIDC enforcement):** `dev-fastapi-ai-worker` Cloud Run `--no-allow-unauthenticated`, `allUsers` removed, 403 on unauthenticated request, live verified.
- **P0-3 (Current source & revision parity):** `dev-outbox-dispatcher-00003-rv9` aur `dev-fastapi-ai-worker-00007-dmd` live deployed directly from Git source.
- **P1-1 (`candidate.projection.rebuilt` route policy):** Corrected in the Stage-2 contract pass: this is a FastAPI output event, not a dispatcher input. The route was removed from the registry to prevent a projection loop; routing tests must now verify 7 input routes.
- **P1-2 (Wake-up & recovery strategy):** Cloud Scheduler cron `dev-outbox-recovery-sweep` (`*/10 * * * *`) created, verified, and running live.
- **P1-3 (Category-B live gates):** `scratch/test_option_5_full_cloud_live.py` passes all 6 gates live in 2.92s.
- **P1-4 (Dead-Letter Runbook):** Created `05-outbox-dispatcher-nestjs/RUNBOOK-DEAD-LETTER.md` (identification, error classification, immutable audit replay SQL).
- **P4 (PDF Deprecation Cleanup):** Replaced deprecated `PyPDF2` with `pypdf` (v6.16.1) in `document_extractor.py`, `pyproject.toml`, and unit tests. Fixed `datetime.utcnow()` deprecation to `datetime.now(timezone.utc)`.

---

## Final release gate

Production-ready declaration तभी करें जब:

```
[x] P0-1 OIDC enforcement live verified
[ ] P0-2 secrets moved + DB password/webhook secret rotated
[x] P0-3 deployed revision matches current source
[x] P1-1 projection output event excluded from dispatcher input routes
[x] P1-2 webhook + recovery scheduler verified
[x] P1-3 strong Category-B gates pass
[ ] P1-5 queue provisioning/rate/deadline/IAM re-verified
[x] P1-6 Supabase INSERT webhook independently verified (live event c561c77a…)
[ ] G-1(b) producer envelope contracts frozen
[ ] G-5 producer unroutable-event discipline verified
[ ] OD-1 dedicated least-privilege DB role applied
[ ] OD-10 Pooler/TLS/connectivity spike passed
[ ] P2-1 integration suite pass
[ ] P2-2 concurrency suite pass
[ ] P2-3 failure-injection suite pass
[ ] P2-4 1000-event burst pass
[ ] P3-1 metrics/alerts available
[ ] P3-2 shutdown/health behavior verified
[ ] P3-4 CI/CD security gates pass
```

**Current honest status:** Dispatcher registry, contract drafts, FastAPI security-scan handler/model, ClamAV adapter configuration, and security queue artifact were added in this pass. A Cloud Run multi-container sidecar template and a local Compose setup now document how the actual ClamAV daemon is supplied. Dispatcher tests (12 suites/104 tests), dispatcher-to-contract compatibility, and FastAPI non-integration tests (311) pass. Live Vertex tests are blocked by the local proxy, while dependency lock refresh, ClamAV runtime verification, sidecar deployment validation, and final security-scan E2E remain pending. Existing live E2E claims do not prove the new security-scan path until these gates pass.
