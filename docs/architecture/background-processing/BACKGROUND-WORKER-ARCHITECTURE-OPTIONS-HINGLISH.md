# Binay Job Portal App Background Worker Architecture — आसान Hinglish Guide

[← Main project](../../../README.md) · [Implementation plan](BACKGROUND-WORKER-IMPLEMENTATION-PLAN-HINGLISH.md)

> **Migration status:** Old source की सभी architecture details preserved हैं। Project-name references
> new repository के अनुसार update की गई हैं। यह cross-service approved architecture guide है।

> **Final approved version:** Primary wake-up `Supabase asynchronous Database
> Webhook` है। पुराना `NestJS post-commit best-effort wake-up` diagram rejected है
> और current architecture का हिस्सा नहीं है।

## 1. यह file क्यों बनाई गई है?

पुराने Binay-App में background processing से जुड़ी बातें कई files में बिखरी हुई थीं।
इस file में requirement, सभी practical options, उनके फायदे-नुकसान और final
recommendation एक जगह दी गई है।

पुरानी files में जहाँ `Django` लिखा है, वहाँ उसे एक backend/API service समझो।
हमारे current project में business backend `NestJS` है और AI/document processing
के लिए `FastAPI` service है।

## 2. हमारी मुख्य requirement

हम चाहते हैं कि application:

- लगभग 1000 resume uploads एक साथ accept कर सके;
- resume parse होने तक user की request को रोककर न रखे;
- कम traffic में server का खर्च बहुत कम रहे;
- parsing, OCR, AI, embedding, email और search projection background में चले;
- service fail होने पर काम दोबारा try हो;
- same event दो बार आए तो duplicate data न बने;
- candidate का historical evidence overwrite न हो;
- candidate profile बदलते ही HR search data अपने-आप update हो;
- Supabase को हर 5 seconds खाली query करके busy न रखा जाए;
- शुरुआत manageable हो, लेकिन architecture production-grade रहे।

सबसे जरूरी अंतर:

```text
1000 resume uploads accept करना
!= 1000 PDF parser एक साथ चलाना
!= 1000 LLM API calls एक साथ करना
```

हम 1000 uploads safely store/queue करेंगे, लेकिन processing controlled संख्या में
होगी, जैसे 10, 20 या 30 concurrent jobs। Exact संख्या load testing और AI provider
limit के अनुसार तय होगी।

## 3. Background worker की जरूरत क्यों है?

मान लो candidate resume upload करता है। यदि NestJS उसी HTTP request में:

```text
PDF पढ़े
-> OCR करे
-> AI call करे
-> embedding बनाए
-> database update करे
```

तो request slow होगी, timeout हो सकती है और 1000 uploads पर API crash हो सकती है।

इसलिए user-facing request केवल जरूरी synchronous काम करेगी:

```text
Resume accept
-> private storage में save
-> database metadata/job save
-> user को “processing started” response
```

भारी processing बाद में background worker करेगा।

## 4. Current database में हमारे पास क्या है?

`database/15_infrastructure.sql` में दो important tables हैं:

### `outbox_events`

यह database की reliable “काम बाकी है” list है।

```text
pending
-> publishing
-> published

failure पर:
failed -> retry -> dead_letter
```

Important fields:

| Column | आसान मतलब |
|---|---|
| `aggregate_type` | Candidate, job, application आदि किस domain का काम है |
| `aggregate_id` | किस candidate/job/application का काम है |
| `event_type` | क्या हुआ, जैसे `candidate.profile.changed` |
| `payload` | Worker को चाहिए IDs और revision |
| `status` | Event अभी pending, publishing, published या failed है |
| `available_at` | अगला retry कब हो सकता है |
| `locked_at`, `locked_by` | कौन dispatcher अभी event पर काम कर रहा है |
| `retry_count` | कितनी बार retry हो चुकी है |
| `last_error` | पिछली failure का कारण |

### `processed_events`

यह बताती है कि किसी consumer ने event पहले process कर ली है या नहीं।

```text
PRIMARY KEY (consumer_name, event_id)
```

इससे same event दोबारा आने पर duplicate final result रोका जा सकता है।

## 5. Outbox pattern कैसे काम करता है?

Candidate ने skill add की:

```text
BEGIN
  candidate_skills update
  profile_revision +1
  profile_change_history insert
  outbox_events insert
COMMIT
```

इसका फायदा:

```text
Profile save + background event
-> दोनों save होंगे
या
-> दोनों rollback होंगे
```

यदि Cloud Tasks API उस समय unavailable हो, create attempt से पहले event `pending`
रहेगी या failed create attempt के बाद `failed` + `available_at` backoff में जाएगी।
वह `published` तभी होगी जब task create हो जाए या deterministic task name पर
`ALREADY_EXISTS` मिले। इसलिए profile save होने के बाद background काम silently lost
नहीं होगा।

## 6. हर component का काम

| Component | जिम्मेदारी |
|---|---|
| Next.js | User interface और NestJS को request |
| NestJS API | Authentication, authorization, validation और business transaction |
| NestJS Outbox Dispatcher | Webhook से wake होकर pending events को managed queue में डालना |
| Google Cloud Tasks | काम को buffer, rate-limit और retry करना |
| FastAPI Worker | Resume parsing, AI, embedding, projection और worker-owned DB writes |
| Supabase | Main data, evidence, jobs, events और projection store करना |
| Recovery Cron | छूटी/stuck events को बाद में recover करना |

### Google Cloud Tasks को सही तरह समझें

```text
Google Cloud Tasks Queue
= Google की managed queue service

Queue में रखा individual work item
= task

Actual resume parsing / AI / embedding
= Cloud Run पर FastAPI Worker
```

Cloud Tasks कोई Cloud Run service नहीं है। Queue खाली होने पर यह बंद या
scale-to-zero नहीं होती और इसे start करने के लिए wake-up request नहीं चाहिए। Google
queue service को available रखता है; खाली queue का अर्थ केवल यह है कि process करने
के लिए कोई task नहीं है। नया task आने पर Cloud Tasks उसे FastAPI Worker को deliver
करती है।

```text
Cloud Tasks queue      = managed और available; इसका cold start नहीं
Cloud Run Dispatcher   = idle पर scale-to-zero; cold start हो सकता है
Cloud Run FastAPI      = idle पर scale-to-zero; cold start हो सकता है
```

ध्यान रहे:

```text
NestJS Outbox Dispatcher
= TypeScript में बना event को queue तक पहुँचाने वाला छोटा publisher

FastAPI Worker
= actual parsing/embedding करने और validated result DB में लिखने वाली private service
```

Dispatcher language-neutral concept है, लेकिन Binay Job Portal App की implementation choice
`NestJS/TypeScript` है। Main NestJS API और Dispatcher event contracts/types share कर
सकते हैं, फिर भी production में वे अलग Cloud Run services रहेंगी। Supabase webhook
Dispatcher को shared-secret से call करेगी, जबकि Python FastAPI worker केवल Cloud
Tasks OIDC से private रहेगा।

## 7. हमारी recommended architecture

```text
Next.js → NestJS API
             |
             | BEGIN
             | business data + outbox_events(pending)
             | COMMIT
             v
      Supabase PostgreSQL
             |
             | outbox INSERT (NestJS या FastAPI से)
             v
 Supabase Async Database Webhook
             |
             v
      NestJS Outbox Dispatcher <─ Recovery Cron
             |                     केवल missed/stuck recovery
             | pending batch claim
             | FOR UPDATE SKIP LOCKED
             v
   Google Cloud Tasks Queue
   | task name = hash(event_id)
   | controlled rate + retry + OIDC
   v
Google Cloud Run पर deployed private FastAPI Worker
             |
             | domain job claim/lease
             | parsing / AI / embedding
             | BEGIN
             | result/evidence/projection
             | processed_events
             | optional next outbox_event
             | COMMIT
             v
      Supabase PostgreSQL
             |
             └── नया outbox event हुआ तो वही webhook flow फिर शुरू
```

## 8. Dispatcher को कौन जगाएगा?

### Primary तरीका: Supabase asynchronous Database Webhook

`outbox_events INSERT` होने पर Supabase asynchronous webhook से dispatcher को call
करेगा। यही primary wake-up है क्योंकि outbox event केवल NestJS नहीं, private FastAPI
worker भी downstream काम के लिए बना सकती है।

```text
NestJS outbox insert ──┐
                      ├─> एक centralized webhook ─> Dispatcher
FastAPI outbox insert ─┘
```

Webhook payload काम को सीधे process नहीं करेगा। वह केवल dispatcher को जगाएगा;
dispatcher DB से pending batch claim करेगा। Bulk operation में जहाँ संभव हो एक
logical batch event बनाया जाएगा। Duplicate wake-up harmless होगा क्योंकि dispatcher
`FOR UPDATE SKIP LOCKED` और event status का उपयोग करता है।

Webhook केवल `outbox_events` के `INSERT` पर configure होगी। `UPDATE`/`DELETE` पर
नहीं, वरना Dispatcher के `pending -> publishing -> published` updates unwanted
wake-up loop बना सकते हैं। Database transaction rollback हुई तो usable outbox event
नहीं बचेगी; committed insert ही Dispatcher द्वारा claim होगी।

Security boundary:

```text
Supabase Webhook
-> internet-reachable Dispatcher wake endpoint
-> shared secret/signature verify
-> केवल wake signal; business payload process नहीं

Cloud Tasks
-> Google OIDC
-> private FastAPI worker endpoint
```

Supabase Database Webhook Google Cloud service-account OIDC token अपने-आप नहीं
बनाती। इसलिए Dispatcher service को Cloud Run IAM-private worker जैसा treat नहीं
करेंगे। वह अलग lightweight service होगी जिसका endpoint application-level secret,
payload-size limit और request validation से protected होगा।

एक row पर सामान्यतः एक webhook request बनती है। इसलिए 1000 individual outbox rows
1000 wake calls बना सकती हैं। Bulk use case में logical batch event prefer करें;
फिर भी duplicate/parallel wakes आने पर Dispatcher bounded batch और locks के कारण
same event को दो बार claim नहीं करेगी।

Starting implementation में Dispatcher Cloud Run `maximum instances = 1` और
`minimum instances = 0` पर रहेगी। NestJS RAM का in-memory single-flight flag एक
active publishing run के दौरान बाकी wake calls को `already_running` no-op response
देगा। यह केवल optimization है; correctness `FOR UPDATE SKIP LOCKED`, deterministic
task names, `processed_events` और domain leases से आएगी। Multiple Dispatcher instances
की जरूरत होने पर PostgreSQL advisory/distributed lease जोड़ना mandatory होगा।

[Supabase Database Webhooks](https://supabase.com/docs/guides/database/webhooks)

### NestJS post-commit wake-up क्यों नहीं?

वह केवल NestJS द्वारा बनाए events cover करता। FastAPI या किसी future trusted writer
के event के लिए वही logic दोबारा लिखना पड़ता। इसलिए इसे primary या required path
नहीं रखा गया है।

### Recovery तरीका: Supabase Cron

Cron main worker नहीं है। इसका काम केवल missed/stuck events recover करना है। शुरुआती
implementation में एक lightweight recovery check **हर 10 मिनट** चलेगा:

```text
हर 10 मिनट
→ indexed EXISTS check: कोई due pending/failed या stale-publishing event है?
→ नहीं: समाप्त; Dispatcher को HTTP call नहीं
→ हाँ: Dispatcher recovery endpoint को केवल wake signal
```

यह primary processing latency नहीं है; normal event को INSERT webhook तुरंत wake
करती है। Production monitoring/SLA के आधार पर interval बाद में tune किया जा सकता है।

[Supabase Cron](https://supabase.com/docs/guides/cron)

## 9. Stale `publishing` event कैसे recover होगी?

Dispatcher event को `publishing` कर देता है और उसी समय crash हो जाता है:

```text
status = publishing
dispatcher बंद
```

Event हमेशा के लिए stuck नहीं रहनी चाहिए। Current columns से lease बन सकती है:

```text
status = publishing
AND lease_expires_at <= now()
-> पुरानी lease expired
-> bounded retry के साथ event reclaim/publish
-> retry budget खत्म होने पर dead_letter
```

Current `outbox_events` में `locked_at`, `lease_expires_at`, `locked_by`, `available_at`, `retry_count`
और `max_retries` मौजूद हैं। Implementation के समय stale-`publishing` recovery query
और supporting index add/verify करना होगा।

## 10. Resume processing का पूरा flow

```text
Candidate resume upload करता है
        |
        v
NestJS ownership/type/size validate करता है
        |
        v
Private Storage + uploaded_documents
        |
        v
Security scan = clean
        |
        v
resume_parsing_jobs(queued) + outbox event
        |
        v
Supabase Async Database Webhook
        |
        v
NestJS Outbox Dispatcher pending event claim करता है
        |
        v
Google Cloud Task बनती है
        |
        v
Google Cloud Run पर deployed private FastAPI को HTTP request
        |
        +-> job claim/lease
        +-> fresh signed URL
        +-> PDF/DOCX text extraction
        +-> जरूरत हो तो OCR
        +-> LLM structured parsing
        +-> validation
        |
        v
Immutable result + artifacts + events
        |
        v
Evidence/merge policy
        |
        v
Candidate profile-change event
        |
        v
Candidate Projection Worker
```

Cloud Tasks queue में concurrency और dispatch rate set कर सकते हैं। इससे 1000
queued jobs होने के बाद भी worker/provider overload नहीं होगा।

[Cloud Tasks rate limits and retries](https://docs.cloud.google.com/tasks/docs/configuring-queues)

## 11. Candidate projection और embedding flow

```text
Vishesh skill/profile save करता है
        |
        v
profile_revision +1
+ history
+ outbox event
        |
        v
Supabase Async Database Webhook
        |
        v
Outbox Dispatcher
        |
        v
Google Cloud Tasks projection queue
        |
        v
Google Cloud Run पर deployed FastAPI projection handler
        |
        +-> latest revision check
        +-> canonical tables read
        +-> searchable_text
        +-> search_vector
        +-> fixed model का 768D embedding
        v
candidate_search_profiles UPSERT
```

Rapid edits example:

```text
events: revision 6, 7, 8
current profile revision: 8

Worker revision 8 बनाता है
revision 6 और 7 stale/no-op
```

Cloud Tasks execution order guaranteed नहीं है। Execution `8 -> 6 -> 7` भी हो
सकता है। इसलिए revision check optional optimization नहीं, correctness rule है।

[Cloud Tasks ordering limitations](https://docs.cloud.google.com/tasks/docs/common-pitfalls)

## 12. सभी possible implementation options

### Option A — हर 5 seconds database polling

```text
Worker
-> हर 5 seconds pending event query
```

फायदे:

- सबसे आसान शुरुआती code;
- local testing में उपयोगी।

नुकसान:

- event न होने पर भी लगातार खाली queries;
- Supabase compute/connections/logs पर बेकार load;
- process को लगातार alive रखना पड़ सकता है;
- multiple workers के लिए locking जरूरी।

Decision: production में avoid; local prototype या temporary fallback only।

### Option B — Slow scheduled polling/Cron

```text
हर कुछ minutes
-> pending/stuck events check
```

फायदे:

- आसान और कम खर्च;
- missed webhook/wake-up recover कर सकता है।

नुकसान:

- primary तरीका बनाया तो processing delay होगा;
- heavy work database cron में नहीं चलना चाहिए।

Decision: recovery safety net के रूप में recommended।

### Option C — Supabase Database Webhook सीधे FastAPI को

```text
outbox INSERT
-> database webhook
-> FastAPI
```

फायदे:

- event आते ही request;
- empty polling नहीं;
- Cloud Run scale-to-zero के साथ काम कर सकता है।

नुकसान:

- managed queue जैसा strong buffering/rate control नहीं;
- 1000 inserts से request storm हो सकता है;
- retries/backpressure खुद handle करनी होगी।

Decision: dispatcher wake-up या छोटे काम के लिए अच्छा; heavy resume fan-out से पहले
managed queue लगानी चाहिए।

### Option D — Transactional Outbox + Cloud Tasks + Cloud Run

```text
outbox
-> Supabase async webhook
-> dispatcher
-> Cloud Tasks
-> Google Cloud Run पर deployed private FastAPI
```

फायदे:

- managed retry;
- dispatch rate और concurrent tasks control;
- provider/database को overload से बचाता है;
- FastAPI HTTP worker के साथ natural fit;
- Cloud Run idle पर scale-to-zero;
- current pricing में first 1 million Cloud Tasks operations/month free।

नुकसान/सीमाएँ:

- Google Cloud IAM और queue setup;
- delivery at-least-once है, इसलिए duplicate attempt possible;
- Cloud Tasks traditional permanent DLQ नहीं है;
- HTTP task default deadline 10 minute और maximum 30 minute है।

Decision: current Binay Job Portal App workload और early/moderate-scale production के लिए
सबसे अच्छा option।

References:

- [Cloud Tasks pricing](https://cloud.google.com/tasks/pricing)
- [Cloud Tasks delivery/idempotency](https://docs.cloud.google.com/tasks/docs/dual-overview)
- [Cloud Tasks HTTP targets](https://docs.cloud.google.com/tasks/docs/create-tasks)
- [Cloud Run scale-to-zero](https://docs.cloud.google.com/run/docs/overview/what-is-cloud-run)

### Option E — Supabase Queues (`pgmq`)

```text
Postgres/Supabase Queue
-> consumer message pull करता है
-> worker process करता है
```

Supabase Queues durable हैं और guaranteed delivery, visibility window,
exactly-once-delivery semantics तथा archival provide करती हैं।

फायदे:

- Supabase ecosystem के अंदर;
- external broker कम;
- strong durable queue features;
- dashboard/API support।

नुकसान:

- pull consumer को wake/alive रखने का तरीका चाहिए;
- queue workload same Supabase DB compute/storage पर रहता है;
- existing outbox के साथ overlap decide करना होगा।

Decision: reliability अच्छी है। हमारे लिए main trade-off reliability नहीं, बल्कि
pull/wake-up model और database coupling है। All-Supabase architecture चाहिए तो यह
strong alternative है।

[Supabase Queues](https://supabase.com/docs/guides/queues)

### Option F — Supabase Realtime/Broadcast

```text
Database event
-> Realtime connection
-> listener
```

फायदे:

- बहुत कम latency;
- live dashboard/UI updates के लिए अच्छा।

नुकसान:

- durable background job queue नहीं;
- connection/reconnect manage करना होगा;
- disconnected consumer के लिए recovery अलग चाहिए।

Decision: UI realtime के लिए use करें, critical AI job delivery के लिए नहीं।

[Supabase Realtime subscriptions](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)

### Option G — Google Pub/Sub

```text
Outbox Dispatcher
-> Pub/Sub topic
-> कई subscribers
```

फायदे:

- बहुत high throughput;
- same event के कई independent consumers;
- filtering, replay और dead-letter topics;
- current pricing में first 10 GiB/month message throughput free।

नुकसान:

- Cloud Tasks से ज्यादा architecture complexity;
- targeted per-job HTTP scheduling/rate-limit कम direct;
- duplicate/out-of-order handling जरूरी।

Decision: future में जब same event analytics, search, notifications और AI के कई
consumers को fan-out करना हो। Current workload के लिए Cloud Tasks सरल है।

- [Google Pub/Sub](https://cloud.google.com/pubsub)
- [Cloud Tasks vs Pub/Sub](https://docs.cloud.google.com/tasks/docs/comp-pub-sub)

### Option H — Supabase Edge Function background task

```text
Edge Function response
-> waitUntil(background work)
```

फायदे:

- Supabase-native;
- छोटे webhook/email forwarding जैसे काम में आसान।

नुकसान:

- heavy PDF/OCR/AI pipeline के लिए primary durable worker नहीं;
- runtime/memory/time limits;
- retry/idempotency फिर भी design करनी होगी।

Decision: short glue work के लिए; resume parsing के लिए FastAPI बेहतर।

[Supabase Edge background tasks](https://supabase.com/docs/guides/functions/background-tasks)

### Option I — Redis/BullMQ, Celery या RabbitMQ

```text
Producer
-> Redis/RabbitMQ
-> हमेशा चलने वाला consumer
```

फायदे:

- mature technology;
- BullMQ NestJS में अच्छा;
- Celery Python में अच्छा;
- retry/scheduling के rich features।

नुकसान:

- Redis/RabbitMQ का idle खर्च;
- अलग broker की maintenance;
- scale-to-zero HTTP model के लिए कम natural।

Decision: sustained high workload या existing Redis infrastructure पर अच्छा;
current low-idle-cost requirement में first choice नहीं।

### Option J — Kafka/Debezium/CDC

```text
Postgres WAL/CDC
-> Kafka event log
-> बहुत सारे consumers
```

फायदे:

- enterprise-scale streaming;
- replay और multiple consumers।

नुकसान:

- सबसे ज्यादा complexity और operations;
- partitions, ordering, schema registry और CDC management।

Decision: future enterprise phase; अभी overbuilt।

## 13. आसान comparison

| Option | खाली polling | Retry | Burst control | Scale-to-zero | हमारा निर्णय |
|---|---:|---:|---:|---:|---|
| 5-second DB polling | हाँ | खुद बनाना | खुद बनाना | कमजोर | Avoid |
| Supabase Cron | Scheduled | खुद बनाना | सीमित | अच्छा | Recovery |
| DB Webhook direct | नहीं | सीमित/custom | कमजोर | अच्छा | Wake-up |
| Outbox + Cloud Tasks | नहीं | मजबूत | मजबूत | बहुत अच्छा | **Recommended** |
| Supabase Queues | Consumer pull | मजबूत | अच्छा | मध्यम | Strong alternative |
| Realtime | Open socket | Job queue नहीं | कमजोर | कमजोर/मध्यम | UI only |
| Pub/Sub | नहीं | मजबूत | मजबूत | बहुत अच्छा | Future growth |
| Edge background | नहीं | सीमित/custom | सीमित | अच्छा | Short work |
| Redis/Celery/BullMQ | Consumer process | मजबूत | मजबूत | आम तौर पर कमजोर | Sustained load |
| Kafka/CDC | नहीं | मजबूत | बहुत मजबूत | deployment पर | Enterprise future |

## 14. Cloud Tasks को शुरुआत में क्यों चुनें?

हमारे jobs commands जैसे हैं:

```text
Parsing job X process करो
Candidate Y revision Z rebuild करो
Job J का embedding बनाओ
Invitation I की email भेजो
```

इनके लिए one task -> one target handler, retry, schedule, rate limit और concurrency
control चाहिए। Cloud Tasks यह सीधे provide करता है।

Pub/Sub तब बेहतर होगा जब same event कई subscribers को भेजना हो।

## 15. Deterministic Cloud Task name

Failure window:

```text
Cloud Task create successful
-> outbox को published mark करना fail
-> dispatcher retry
-> duplicate task बन सकती है
```

Protection:

```text
task name = stable hash(event_id + consumer/route)
create task
ALREADY_EXISTS -> queue में task पहले बन चुकी है
mark outbox published
```

लेकिन यह permanent idempotency नहीं है। Cloud Tasks task-name deduplication
time-bounded है; API-created deleted task names currently लगभग 24 hours तक remembered
हो सकते हैं। इसलिए permanent protection:

```text
deterministic task name
+ processed_events
+ domain unique constraints
+ job claim/lease
```

[Cloud Tasks task naming](https://docs.cloud.google.com/tasks/docs/create-tasks)

## 16. Worker lease और duplicate AI calls

केवल `processed_events` check पर्याप्त नहीं है। दो workers एक साथ check करके दोनों
AI call शुरू कर सकते हैं। Final duplicate DB commit रुक जाएगी, लेकिन AI cost दो बार
लग सकती है।

Resume processing में:

```text
Cloud Task Google Cloud Run पर deployed FastAPI को call करती है
-> resume_parsing_jobs row atomic claim
-> valid processing lease पहले से है: no-op/retry policy
-> नहीं है: locked_by + locked_at set
-> external AI call
-> final result + processed_events transaction
```

Exactly-once external AI execution assume नहीं करना है।

## 17. Cloud Tasks timeout का important rule

```text
Default HTTP deadline: 10 minute
Maximum HTTP deadline: 30 minute
```

यदि काम 30 minute से बड़ा हो:

```text
काम को छोटे stages में split करो
या
Cloud Run Job use करो
```

Timeout का मतलब worker तुरंत बंद हो गया, ऐसा guaranteed नहीं है:

```text
Attempt A deadline cross करता है
-> Cloud Tasks Attempt B retry कर सकती है
-> Attempt A कुछ समय continue कर सकता है
-> overlapping work possible
```

इसीलिए lease और idempotency mandatory हैं।

## 18. Dead-letter किसकी responsibility है?

Cloud Tasks traditional permanent DLQ नहीं है। उसका काम bounded retries करना है।

हमारा authoritative failure record:

```text
outbox_events.status = dead_letter
+ last_error
+ retry_count
+ admin alert
+ manual/replay tooling
```

```text
Cloud Tasks -> delivery और bounded retry
Application Outbox -> permanent failure history और replay
```

## 19. Queue कितनी बनानी हैं?

Queue केवल domain name से अलग न करें। अलग queue तब बनाओ जब concurrency, rate-limit,
timeout या retry behavior अलग हो।

शुरुआत में:

```text
ai-heavy-queue      -> resume parsing + job AI + embeddings
projection-queue    -> candidate/job search projection
notification-queue  -> email/push
```

बाद में जरूरत पर:

```text
resume-parse
candidate-projection
job-ai-enrichment
notifications-email
analytics-low-priority
```

## 20. Security rules

- FastAPI worker Cloud Run service private रहे;
- Cloud Tasks उसे OIDC service-account token से call करे;
- Dispatcher अलग internet-reachable Cloud Run service/endpoint हो और Supabase
  webhook shared secret/signature अनिवार्य रूप से verify करे;
- Dispatcher webhook body से business काम न करे; DB से pending events claim करे;
- Webhook केवल `outbox_events INSERT` पर configured हो;
- हर service का least-privilege service account;
- Supabase service-role key browser/task payload/log में नहीं;
- AI provider keys Secret Manager/environment में;
- raw resume, raw AI output और PII private;
- task payload में raw resume/signed URL/token नहीं।

Safe task payload:

```json
{
  "schemaVersion": 1,
  "eventId": "uuid",
  "eventType": "resume.parse.requested",
  "aggregateId": "parsing-job-uuid",
  "traceId": "uuid"
}
```

Worker authorization के बाद fresh short-lived signed URL लेगा।

- [Cloud Tasks OIDC](https://docs.cloud.google.com/tasks/docs/creating-http-target-tasks)
- [Cloud Run service authentication](https://docs.cloud.google.com/run/docs/authenticating/service-to-service)

## 21. खर्च कम रखने के नियम

Avoid:

```text
हर 5 seconds खाली DB query
छोटे workload के लिए always-on VM
सिर्फ queue के लिए महंगा always-on Redis
1000 uncontrolled LLM calls
हर छोटे edit पर unnecessary embedding
```

Prefer:

```text
Cloud Run min instances = 0
request-based processing
managed queue throttling
batch event claiming
latest revision coalescing
AI केवल जरूरत पर
same region जहाँ practical हो
```

Cloud Run idle पर scale-to-zero हो सकता है। Python concurrency low value, जैसे 8,
से शुरू करके load test के अनुसार tune करें।

[Cloud Run concurrency](https://docs.cloud.google.com/run/docs/about-concurrency)

## 22. Implementation phases

### Phase 0 — Security

- exposed API keys rotate/revoke;
- keys Secret Manager/environment में;
- private Cloud Run + OIDC।

### Phase 1 — Candidate projection automation

- logically separate outbox dispatcher;
- `outbox_events INSERT` पर Supabase asynchronous webhook;
- deterministic task name;
- stale `publishing` lease recovery;
- `projection` Cloud Tasks queue;
- FastAPI projection handler;
- worker claim/lease + `processed_events`;
- revision guard;
- searchable text/vector + fixed 768D embedding;
- SLA-based recovery cron।

Success:

```text
Vishesh skill add करे
-> कोई manual projection SQL नहीं
-> projection revision automatically update
-> keyword और semantic search में नई skill
```

### Phase 2 — Resume parsing

- security scan event;
- resume parsing task;
- immutable result/artifact/event writes;
- 30-minute boundary;
- retry/dead-letter test;
- पहले 100, फिर 1000 uploads का load test।

### Phase 3 — Job AI और embedding

- job ideal-profile contract;
- candidate/job के लिए compatible fixed embedding model/version;
- re-embedding migration strategy।

### Phase 4 — Application/notification workers

- application/referral events;
- email retry;
- realtime UI updates अलग notification layer से।

### Phase 5 — Growth

- जरूरत पर Pub/Sub fan-out;
- external search engine sync;
- admin replay और monitoring dashboard।

## 23. Binay Job Portal App का final decision

```text
Main database         = Supabase PostgreSQL
Business backend      = NestJS
Trusted DB writers    = NestJS + private FastAPI worker
Reliable event        = outbox_events
Primary wake          = Supabase asynchronous Database Webhook
Dispatcher            = NestJS/TypeScript की अलग lightweight Cloud Run service
Managed queue         = Google Cloud Tasks
Worker                = Google Cloud Run पर deployed private FastAPI
Worker DB writes      = results/evidence/projection/processed_events/next outbox
Recovery              = SLA-based Supabase Cron
Queue dedupe           = deterministic task name
Expensive-work guard   = domain job claim/lease
Final idempotency      = processed_events + DB constraints
UI realtime           = Supabase Realtime/Broadcast जहाँ जरूरी
Future fan-out         = Google Pub/Sub
```

## 24. एक line में याद रखने वाला flow

```text
NestJS/FastAPI transaction + outbox
-> Supabase async webhook
-> dispatcher
-> rate-limited Cloud Tasks
-> leased और idempotent FastAPI worker
-> Supabase result + processed_events + optional next outbox
-> slow Cron केवल recovery के लिए
```

## 25. Official references

- [Supabase Database Webhooks](https://supabase.com/docs/guides/database/webhooks)
- [Supabase Cron](https://supabase.com/docs/guides/cron)
- [Supabase Queues](https://supabase.com/docs/guides/queues)
- [Supabase Edge background tasks](https://supabase.com/docs/guides/functions/background-tasks)
- [Cloud Tasks configuration](https://docs.cloud.google.com/tasks/docs/configuring-queues)
- [Cloud Tasks task creation/dedup](https://docs.cloud.google.com/tasks/docs/create-tasks)
- [Cloud Tasks vs Pub/Sub](https://docs.cloud.google.com/tasks/docs/comp-pub-sub)
- [Cloud Run overview](https://docs.cloud.google.com/run/docs/overview/what-is-cloud-run)
- [Cloud Run authentication](https://docs.cloud.google.com/run/docs/authenticating/service-to-service)
- [Cloud Run concurrency](https://docs.cloud.google.com/run/docs/about-concurrency)
