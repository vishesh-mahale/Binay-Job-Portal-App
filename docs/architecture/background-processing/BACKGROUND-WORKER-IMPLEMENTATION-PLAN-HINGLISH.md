# Binay Job Portal App Background Worker — Implementation Plan (Hinglish)

[← Main project](../../../README.md) · [Architecture options and decision](BACKGROUND-WORKER-ARCHITECTURE-OPTIONS-HINGLISH.md)

> **Migration status:** Old source का complete implementation detail preserved है। Project-name
> reference new repository के अनुसार update की गई है। Code/config अभी implementation phases में बनेगा।

## 1. इस file का उद्देश्य

यह file बताती है कि finalized background architecture को code और cloud में किस
क्रम में implement करना है। यह architecture-options document नहीं है; यह actual
implementation roadmap है।

Final architecture:

```text
Next.js → NestJS
             |
             | business transaction + outbox_events
             v
      Supabase PostgreSQL
             |
             | INSERT webhook
             v
 Supabase Async Database Webhook
             |
             v
      Outbox Dispatcher ← Recovery Cron
             |
             v
   Google Cloud Tasks Queue
             |
             v
 Google Cloud Run पर deployed private FastAPI
             |
             | result + processed_events
             | optional next outbox_event
             v
      Supabase PostgreSQL
```

## 2. अभी repo में क्या मौजूद है?

| चीज | वर्तमान स्थिति |
|---|---|
| `outbox_events` | Database table मौजूद |
| `processed_events` | Database table मौजूद |
| Resume parsing domain tables | मौजूद |
| Candidate search projection table | मौजूद |
| FastAPI basic service | मौजूद |
| FastAPI Dockerfile | मौजूद |
| `/resume/process` | Basic synchronous implementation |
| `/resume/enqueue` | Placeholder |
| `/resume/status` | Placeholder |
| FastAPI production DB writes | अभी implement करना है |
| Atomic job claim/lease | अभी implement करना है |
| NestJS/TypeScript Outbox Dispatcher | अभी बनाना है |
| Cloud Tasks integration | अभी बनानी है |
| Cloud Run deployment | अभी configure करना है |
| Supabase async webhook | अभी configure करना है |
| Recovery Cron | अभी configure करना है |

FastAPI की active production base directory:

```text
Fast-Api/Fast-API-Service-AI/
```

## 3. हर component की जिम्मेदारी

### NestJS

```text
Request validate/authorize
→ business data save
→ उसी transaction में outbox event insert
→ commit
→ user को response
```

NestJS queue या FastAPI response की प्रतीक्षा नहीं करेगा।

### Supabase Database Webhook

```text
outbox_events में INSERT
→ Dispatcher को asynchronous wake-up call
```

Webhook केवल signal है। वह resume parse या event publish नहीं करेगा।

### Outbox Dispatcher

```text
Pending events claim
→ Google Cloud Task create
→ event published mark
```

Dispatcher AI work नहीं करेगा।

यह pattern language-neutral है, लेकिन Binay Job Portal App की frozen implementation choice
`NestJS/TypeScript` है। Python केवल AI/OCR/parsing/embedding worker के लिए रहेगा।

### Google Cloud Tasks

> **याद रखें:** Google Cloud Tasks एक **Google-managed queue service** है। यह कोई
> Cloud Run container, FastAPI worker या background job process नहीं है। Queue के
> अंदर रखा प्रत्येक work item एक `task` कहलाता है।

```text
Google Cloud Tasks = managed queue service
Queue में एक work item = task
Actual काम करने वाला = Cloud Run पर FastAPI Worker
```

Queue खाली होने पर Cloud Tasks बंद या scale-to-zero नहीं होती। Google इसकी
availability manage करता है और idle queue के लिए हमारा कोई server instance चालू
नहीं रहता। नया task आते ही queue उसे स्वीकार करके configured FastAPI endpoint को
deliver करती है। Cold start केवल Cloud Run Dispatcher या Cloud Run FastAPI Worker
को हो सकता है, Cloud Tasks queue को नहीं।

```text
काम buffer करना
→ dispatch rate control
→ concurrency control
→ failure पर retry
→ OIDC से private FastAPI call
```

### Google Cloud Run पर deployed FastAPI

```text
Task authenticate
→ duplicate check
→ domain job lease
→ parsing/AI/embedding
→ validated result DB में save
→ processed_events insert
→ जरूरत पर अगला outbox event insert
```

### Recovery Cron

Normal processing नहीं करेगा। केवल missed और stuck events के लिए Dispatcher को
जगाएगा।

## 4. Proposed code structure

### FastAPI

```text
Fast-Api/Fast-API-Service-AI/
├── Dockerfile                         # पहले से मौजूद; verify/update
├── requirements.txt                   # DB + Google auth dependencies
└── app/
    ├── main.py
    ├── api/v1/
    │   ├── routes.py                  # existing public/dev routes
    │   └── worker_routes.py           # private Cloud Tasks endpoints
    ├── core/
    │   ├── config.py
    │   ├── database.py                # connection pool
    │   └── security.py                # OIDC/task validation
    ├── repositories/
    │   ├── outbox_repository.py
    │   ├── resume_job_repository.py
    │   └── projection_repository.py
    ├── workers/
    │   ├── resume_parse_worker.py
    │   ├── candidate_projection_worker.py
    │   └── job_embedding_worker.py
    └── services/
        ├── parse_service.py
        └── embedding_service.py
```

### NestJS Outbox Dispatcher

NestJS application repository अभी बनना बाकी है। Proposed monorepo structure:

```text
NestJs/
├── apps/
│   ├── api/                         # Main business API
│   └── outbox-dispatcher/
│       └── src/
│           ├── main.ts
│           ├── dispatcher.module.ts
│           ├── dispatcher.controller.ts
│           ├── claim.service.ts
│           ├── cloud-tasks.publisher.ts
│           ├── event-router.ts
│           └── webhook-auth.guard.ts
└── libs/
    ├── event-contracts/             # API और Dispatcher के shared types
    ├── database/
    └── observability/
```

Dispatcher और Python FastAPI worker अलग codebases/images और अलग Cloud Run services
होंगी। Supabase webhook NestJS Dispatcher को shared-secret/signature से call करेगी;
FastAPI worker केवल Cloud Tasks OIDC से private रहेगा।

Logical separation:

```text
Dispatcher endpoint → केवल outbox पढ़े और Cloud Tasks बनाए
Worker endpoint     → केवल assigned domain task process करे
```

## 5. Event contract पहले freeze करें

हर Cloud Task में पूरा resume/profile payload नहीं भेजना है। छोटा reference payload
भेजें:

```json
{
  "schema_version": 1,
  "event_id": "outbox-event-uuid",
  "event_type": "resume.parse.requested",
  "aggregate_id": "parsing-job-uuid",
  "trace_id": "request-trace-uuid"
}
```

मुख्य events शुरुआत में:

```text
resume.parse.requested
candidate.profile.changed
job.ai.enrichment.requested
application.submitted
notification.email.requested
```

हर event के लिए define करें:

- producer कौन है;
- consumer कौन है;
- `aggregate_id` किस table की ID है;
- success में कौन-सी rows लिखेंगी;
- retryable और permanent errors कौन-से हैं;
- downstream event कौन-सा बनेगा।

## 6. Phase 1 — FastAPI production worker foundation

### Implement

- Environment-based configuration;
- Supabase/PostgreSQL connection pool;
- structured JSON logging;
- request/trace/event ID logging;
- private worker endpoints;
- graceful shutdown;
- `/health`, `/ready`, `/live` checks;
- task request authentication;
- error classification।

### जरूरी environment variables

```text
APP_ENV
PORT
DATABASE_URL
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY            # केवल server secret; logs में कभी नहीं
SUPABASE_STORAGE_BUCKET
GOOGLE_CLOUD_PROJECT
GOOGLE_CLOUD_LOCATION
GEMINI_API_KEY / selected provider key
EMBEDDING_MODEL
EMBEDDING_DIMENSION=768
WORKER_NAME
```

Production में secrets source code या committed `.env` में नहीं होंगे। Google Secret
Manager/Cloud Run secrets का उपयोग करें।

### Phase 1 test

```text
Docker build
→ local container start
→ health/ready pass
→ test DB connection
→ invalid worker request rejected
→ valid local test request accepted
```

## 7. Phase 2 — Atomic job claim और idempotency

Cloud Tasks at-least-once delivery कर सकती है। इसलिए same event दो workers को मिल
सकता है। केवल `processed_events` check करना पर्याप्त नहीं है।

Worker flow:

```text
BEGIN
→ processed_events already exists?
   ├─ yes: return success (duplicate harmless)
   └─ no
→ domain job atomic claim/lease
→ COMMIT

expensive AI work

BEGIN
→ result/evidence/projection save
→ domain job completed
→ processed_events insert
→ optional next outbox event insert
→ COMMIT
```

Lease में कम से कम:

```text
locked_at
locked_by
status
attempt count
lease expiry/recovery rule
```

Rules:

- Completed result दोबारा insert नहीं होगा;
- retry पुराने immutable result को overwrite नहीं करेगी;
- worker crash होने पर expired lease recover होगी;
- canonical candidate profile बिना merge policy overwrite नहीं होगी।

### Phase 2 test

```text
Same event 2 बार parallel भेजें
→ expensive work केवल एक worker claim करे
→ result एक बार save हो
→ processed_events एक row हो
```

## 8. Phase 3 — Resume parsing handler

```text
resume.parse.requested
→ resume_parsing_jobs claim
→ uploaded_documents metadata पढ़ना
→ authorized private file download
→ OCR/text extraction
→ LLM structured parsing
→ schema validation
→ artifacts + immutable parsed result
→ job completed
→ processed_events
→ optional profile-suggestions-ready event
```

FastAPI लिख सकती है:

```text
resume_parsing_jobs
resume_parsing_job_events
resume_parsing_artifacts
resume_parsed_data
processed_events
outbox_events (केवल downstream event)
```

Large OCR output/page images DB JSONB में न भरें। उन्हें Storage artifact रखें और
DB में path/checksum/metadata रखें।

## 9. Phase 4 — Candidate projection handler

```text
candidate.profile.changed(revision=7)
→ candidate_profiles.profile_revision पढ़ना
→ revision stale है तो पुराना event skip
→ canonical profile tables पढ़ना
→ searchable_text बनाना
→ PostgreSQL search_vector बनाना
→ compatible embedding model call
→ candidate_search_profiles UPSERT revision=7
→ processed_events insert
```

Canonical input tables:

```text
candidate_profiles
candidate_skills
candidate_experiences
candidate_educations
candidate_projects
candidate_certifications
candidate_languages
candidate_links
```

Resume का raw parsed JSON permanent candidate embedding का direct source नहीं होगा।

## 10. Phase 5 — Outbox Dispatcher

Dispatcher wake endpoint:

```text
POST /internal/dispatcher/wake
```

Endpoint behavior:

```text
Webhook shared secret/signature authenticate
→ छोटा pending batch claim
→ FOR UPDATE SKIP LOCKED
→ status = publishing, locked_at, locked_by
→ commit
→ हर event के लिए Cloud Task create
→ success: published
→ failure: failed + retry_count + available_at + last_error
```

### Duplicate/parallel wake handling (mandatory)

Supabase Webhook, Recovery Cron या delayed `pg_net` requests एक साथ कई wake calls
भेज सकती हैं। शुरुआत में Dispatcher Cloud Run configuration:

```text
maximum instances = 1
minimum instances = 0
```

NestJS process RAM में local single-flight flag रहेगा:

```typescript
private dispatchRunning = false;

async wake() {
  if (this.dispatchRunning) {
    return { accepted: true, reason: 'dispatcher_already_running' };
  }

  this.dispatchRunning = true;
  try {
    return await this.dispatchPendingEvents();
  } finally {
    this.dispatchRunning = false;
  }
}
```

यह flag केवल wake requests coalesce करने की optimization है, correctness guard नहीं।
Container restart पर यह reset होगा। Actual event safety:

```text
Wake-level optimization = in-memory single-flight
Event claim safety       = FOR UPDATE SKIP LOCKED + publishing status/lease
Queue duplicate safety   = deterministic Cloud Task name
Consumer safety          = processed_events + domain job lease
```

पहले phase में `maximum instances = 1` होने से local flag पर्याप्त coalescing देगा।
Future में Dispatcher को multiple instances पर scale करना पड़े तो PostgreSQL
session advisory lock (dedicated connection और explicit unlock) या dedicated
dispatcher-lease row उपयोग करेंगे। उस समय in-memory flag अकेला पर्याप्त नहीं होगा।

Network/Cloud Tasks call के दौरान row-lock transaction open नहीं रखेंगे:

```text
short transaction में claim + commit
→ Cloud Tasks API calls outside transaction
→ short transaction में published/failed update
```

एक run bounded रहेगा, उदाहरणतः batch 50–100 और configured maximum batches/time।
Backlog बचने पर अगली wake/recovery run उसे process करेगी।

Cloud Task name deterministic रखें:

```text
task-{hash(event_id + consumer_name)}
```

यह queue-level short-term dedupe में मदद करता है; permanent idempotency फिर भी
`processed_events` और DB constraints से आएगी।

Stale publishing recovery:

```text
status = publishing
AND lease_expires_at <= now()
→ bounded stale-lease retry/reclaim
→ retry budget खत्म होने पर dead_letter
```

### Phase 5 test

```text
100 pending events
→ 2 dispatcher calls parallel
→ हर event एक बार claim
→ task-create failure पर event retryable रहे
→ dispatcher crash के बाद stale lock recover हो

110 duplicate wake calls
→ एक active publishing run
→ बाकी calls 202/already-running या empty no-op
→ duplicate task/result नहीं
```

## 11. Phase 6 — Google Cloud setup

### एक बार manually/IaC से करना होगा

1. Google Cloud project select/create;
2. Billing और required APIs enable;
3. Artifact Registry repository;
4. NestJS Dispatcher container build/push;
5. FastAPI worker container build/push;
6. Private FastAPI worker Cloud Run service deploy;
7. Separate lightweight NestJS Dispatcher Cloud Run service deploy;
8. Worker और task-invoker service accounts;
9. IAM permissions;
10. Cloud Tasks queues;
11. Secret Manager values;
12. Logs/alerts।

Recommended initial queues:

```text
ai-heavy-queue       → resume parsing, job AI, embeddings
projection-queue     → candidate/job search projection
notification-queue   → email/notifications
```

Starting configuration केवल baseline है; load test के बाद tune करें:

| Queue | Concurrent tasks | Dispatch/sec | कारण |
|---|---:|---:|---|
| AI heavy | 2–5 | 1–3 | LLM rate/cost control |
| Projection | 5–10 | 5–10 | छोटे derived-data jobs |
| Notification | 10–20 | Provider limit के अनुसार | IO-heavy work |

Private FastAPI worker Cloud Run baseline:

```text
Authentication    = required/private
Minimum instances = 0
Maximum instances = शुरुआत में bounded (उदा. 2–5)
Concurrency       = AI workload के लिए low (उदा. 1–5)
Port              = $PORT / 8080
Secrets           = Secret Manager
Invoker           = Cloud Tasks service account only
```

Exact CPU, memory, timeout और concurrency resume size तथा load testing से तय होंगे।

Official references:

- [Deploy containers to Cloud Run](https://docs.cloud.google.com/run/docs/deploying)
- [Configure Cloud Run](https://docs.cloud.google.com/run/docs/configuring)
- [Create Cloud Tasks](https://docs.cloud.google.com/tasks/docs/create-tasks)
- [Cloud Tasks rate and retry configuration](https://docs.cloud.google.com/tasks/docs/configuring-queues)

## 12. Phase 7 — Supabase asynchronous webhook

Webhook configuration:

```text
Table  = public.outbox_events
Event  = INSERT
Target = Dispatcher wake endpoint
Mode   = asynchronous (pg_net)
Header = rotating shared secret/signature
```

`UPDATE` और `DELETE` webhook events disabled रहेंगे। वरना outbox status update खुद
नया wake-up loop बना सकती है। Supabase webhook Google Cloud OIDC identity token
अपने-आप नहीं बनाती, इसलिए Dispatcher और worker की authentication अलग है:

```text
Supabase webhook -> internet-reachable Dispatcher + shared-secret verification
Cloud Tasks      -> IAM-private FastAPI worker + Google OIDC
```

Webhook payload को business truth न मानें। Dispatcher हमेशा DB से current pending
events claim करेगी। इससे duplicate, late या tampered payload का प्रभाव कम होगा।

Security:

- HTTPS only;
- secret/signature header verify;
- secret rotate करने की प्रक्रिया;
- webhook endpoint AI processing न करे;
- payload/log में resume या sensitive candidate data न भेजें।

Delivery behavior:

```text
Outbox transaction rollback
-> committed pending row नहीं
-> Dispatcher के लिए कोई काम नहीं

Outbox commit लेकिन webhook fail
-> event pending सुरक्षित
-> Recovery Cron बाद में Dispatcher जगाएगी
```

Database webhook row-level है। 1000 outbox inserts लगभग 1000 wake requests बना सकते
हैं। Bulk referral/upload में जहाँ business semantics allow करें वहाँ एक batch event
बनाएँ। Dispatcher हर wake पर bounded batch claim करे और duplicate/parallel calls को
`FOR UPDATE SKIP LOCKED` से harmless बनाए।

Official reference:

- [Supabase Database Webhooks](https://supabase.com/docs/guides/database/webhooks)

### Phase 7 test

```text
Test outbox INSERT
→ webhook log success
→ dispatcher wakes
→ Cloud Task बनती है
→ worker invoked
→ event published
```

## 13. Phase 8 — Recovery Cron

Cron primary dispatcher नहीं है। शुरुआती implementation में यह **हर 10 मिनट** एक
छोटी indexed recovery query चलाएगा:

```text
due pending/failed event available है?
OR publishing lease stale है?
→ नहीं: समाप्त; कोई HTTP call नहीं
→ हाँ: Dispatcher recovery endpoint wake
```

Cron को सारे events/process payload नहीं भेजने हैं। केवल recovery wake-up देना है।
Normal processing को INSERT webhook तुरंत शुरू करती है; 10 मिनट केवल missed/stuck
event की recovery bound है। Monitoring/SLA के आधार पर इसे बाद में tune कर सकते हैं।

Supabase recommendation के अनुसार concurrent Cron jobs सीमित रखें और job छोटी रखें।

Official reference:

- [Supabase Cron](https://supabase.com/docs/guides/cron)

### Phase 8 test

```text
Webhook temporarily disable
→ outbox event insert
→ event pending रहे
→ Cron wake करे
→ dispatcher/task/worker flow पूरा हो
```

## 14. Failure handling matrix

| Failure | Expected behavior |
|---|---|
| Webhook miss | Cron dispatcher को जगाए |
| Dispatcher crash after claim | Stale publishing lease recover |
| Cloud Task create fail | Outbox failed/pending retry |
| Duplicate Cloud Task | processed_events/domain claim रोकें |
| FastAPI timeout | Cloud Tasks retry; lease prevents overlap damage |
| LLM 429/5xx | Retryable failure + backoff |
| Invalid resume/schema | Permanent failure + reason |
| Worker DB commit fail | Task non-2xx; safe retry |
| Projection old revision | Stale event safely skip |
| Secret/auth failure | 401/403 + alert; blind retry सीमित |

Cloud Tasks timeout का अर्थ यह नहीं कि पुराना worker तुरंत रुक गया। इसलिए domain
lease और idempotent final transaction mandatory हैं।

## 15. Monitoring और alerts

कम से कम ये metrics/logs चाहिए:

```text
pending outbox count
oldest pending age
failed/dead-letter count
stale publishing count
Cloud Tasks queue depth
task retry count
FastAPI latency/error rate
resume parse success/failure
LLM 429/timeout rate
projection revision lag
DB/storage/egress usage
```

Alert examples:

```text
oldest pending > 5 minutes
dead-letter > 0
parse failure rate > threshold
projection lag > SLA
Cloud Run 5xx spike
Supabase DB/storage > 70%, 85%, 95%
```

## 16. Security checklist

- Next.js को service-role secret नहीं मिलेगा;
- FastAPI worker Cloud Run service private रहेगी;
- Cloud Tasks OIDC token worker पर verify होगा;
- Dispatcher अलग internet-reachable service होगी और webhook shared secret/signature
  verify करेगी;
- Webhook secret और worker OIDC दो अलग credentials/boundaries हैं;
- FastAPI restricted DB credentials उपयोग करेगी;
- Storage signed access short-lived होगा;
- raw resume/outbox sensitive payload logs में नहीं आएगा;
- secrets Secret Manager/environment से आएँगे;
- current hard-coded provider keys rotate/remove किए जाएँगे;
- all worker writes ownership और domain invariants enforce करेंगे।

## 17. End-to-end acceptance test

```text
1. Candidate resume upload करता है
2. NestJS document + `security.scan.requested` outbox event commit करता है
3. Scan task file को validate करके clean/infected result persist करती है
4. केवल clean result पर parsing job + `resume.parse.requested` outbox event commit होता है
5. Webhook Dispatcher को जगाती है
6. Dispatcher event claim करके Cloud Task बनाता है
7. Cloud Tasks private Cloud Run FastAPI call करती है
8. FastAPI job lease लेकर resume parse करती है
9. Parsed result/artifacts/events save होते हैं
10. processed_events insert होता है
11. जरूरत पर projection event बनता है
12. वही webhook/dispatcher/task flow projection चलाता है
13. candidate_search_profiles latest revision पर बनती है
14. HR keyword/vector/filter query में candidate दिखाई देता है
```

Acceptance conditions:

- User request parsing के लिए block न हो;
- event loss न हो;
- duplicate result न बने;
- retries audit में दिखाई दें;
- old revision latest projection overwrite न करे;
- unauthorized endpoint call reject हो;
- webhook बंद होने पर Cron recovery काम करे।

## 18. सही implementation order

```text
1. Event contracts freeze
2. FastAPI DB foundation
3. Job claim/lease + processed_events
4. Resume worker
5. Candidate projection worker
6. NestJS/TypeScript Dispatcher
7. Local duplicate/failure tests
8. Artifact Registry + private Cloud Run
9. Cloud Tasks + OIDC
10. Supabase webhook
11. Recovery Cron
12. Full end-to-end test
13. Monitoring + load test
```

Cloud setup पहले करके placeholder code deploy करना उपयोगी नहीं है। पहले local
worker contracts और database correctness complete करें, फिर managed infrastructure
connect करें।

## 19. Final याद रखने वाला diagram

```text
NestJS/FastAPI transaction
        |
        | outbox event
        v
Supabase async webhook
        |
        v
Dispatcher
        |
        v
Google Cloud Tasks Queue
        |
        v
Google Cloud Run पर FastAPI
        |
        v
Supabase result + processed_events + optional next event

Recovery Cron = केवल छूटा हुआ flow दोबारा जगाने के लिए
```
