# 15 Infrastructure — Outbox Flow Explanation (Hinglish)

## 1. Ye file kis problem ko solve karti hai?

Business transaction successful hone ke baad email, resume parsing, embedding ya notification jaise background kaam reliably queue karne hain.

Direct pattern unsafe hai:

```text
DB commit successful
-> direct FastAPI call fail
-> business data save ho gaya, background work lost
```

Transactional outbox pattern:

```text
BEGIN
  business rows
  audit/history rows
  outbox_events(pending)
COMMIT
```

Business data aur event dono commit honge ya dono rollback honge.

## 2. Final architecture

```text
Next.js
   |
   v
NestJS API / trusted FastAPI result transaction
   |  business rows + outbox_events INSERT
   v
Supabase PostgreSQL
   |  asynchronous INSERT webhook = wake-up signal
   v
Cloud Run par NestJS Outbox Dispatcher
   |  claim_outbox_events() / FOR UPDATE SKIP LOCKED
   |  short transaction commit
   |  network call DB transaction ke bahar
   v
Google Cloud Tasks Queue
   |  deterministic task name + retry + rate limit + Google OIDC
   v
Private Cloud Run FastAPI/NestJS handler
   |  processed_events check + domain job lease
   |  actual scan/parsing/AI/embedding/email work
   v
Supabase result transaction
   |  result/evidence/projection
   |  processed_events
   |  optional chained outbox_events INSERT
   v
Next step ka wahi webhook -> Dispatcher -> Queue flow
```

Webhook event process nahi karti. Woh Dispatcher endpoint ko sirf HTTP signal deti hai. Dispatcher webhook payload par trust nahi karti; database se due events claim karti hai.

## 3. `outbox_events` row me kya hota hai?

Immutable envelope:

- aggregate type/id;
- event type and schema version;
- versioned JSON payload;
- correlation/causation IDs;
- original occurrence time.

Mutable dispatch state:

- status;
- available/retry time;
- lock owner and lease expiry;
- Cloud Task name;
- published/dead-letter timestamps;
- retry count and sanitized last error.

Example:

```json
{
  "aggregate_type": "resume_parsing_job",
  "aggregate_id": "job-uuid",
  "event_type": "resume.parse.requested",
  "schema_version": 1,
  "payload": {
    "parsingJobId": "job-uuid",
    "documentId": "document-uuid"
  },
  "correlation_id": "request-trace-uuid"
}
```

Payload me raw resume text, signed URL, password, token, authorization header ya private secret nahi jayega. Worker IDs se authorized data khud load karega.

## 4. Status lifecycle

```text
pending
   |
   | claim + lease
   v
publishing
   |             |
   | task made   | Cloud Tasks API failed
   v             v
published      failed -- available_at/backoff --> publishing
                 |
                 | max retries
                 v
             dead_letter
```

`published` ka matlab Cloud Task successfully create/accept hui; iska matlab worker ka actual AI/process work complete hona nahi hai.

## 5. Claim function kya karti hai?

Dispatcher calls:

```text
claim_outbox_events(worker_id, batch_size, lease_seconds)
```

Database:

```text
due pending/failed rows
OR stale publishing lease
-> ORDER BY available_at, occurred_at
-> FOR UPDATE SKIP LOCKED
-> maximum 100 rows
-> status=publishing + locked_by + lease_expires_at
-> COMMIT
```

Isliye parallel webhook/Cron wake calls same row claim nahi kar sakte. Cloud Tasks API call ke dauran DB row lock open nahi rahega.

## 6. Dispatcher crash aur stale lease

Maan lo Dispatcher ne row claim ki aur task mark karne se pehle crash ho gayi:

```text
publishing + lease expiry
-> Recovery Cron detects stale row
-> Dispatcher wakes
-> stale row re-claim
-> deterministic Cloud Task name se create/reconcile
```

Repeated stale leases retry budget consume karti hain. Budget exhaust hone par row `dead_letter` hoti hai; endlessly reclaim nahi hoti.

Cloud Task pehle create ho chuki ho aur DB mark miss hua ho to same deterministic task name par `Already Exists` success-equivalent treat hoga, phir event published mark hoga.

## 7. Publish/failure functions

Task accepted:

```text
mark_outbox_event_published(event_id, worker_id, task_name)
```

Task creation failed:

```text
mark_outbox_event_failed(event_id, worker_id, sanitized_error, next_available_at)
```

Functions current worker lease verify karti hain. Dusra Dispatcher instance kisi aur worker ki claimed row mark nahi kar sakta.

Retry backoff Dispatcher calculate karegi. Example policy configuration ho sakti hai:

```text
1m -> 5m -> 15m -> 1h ... bounded max retries
```

Exact per-event retry policy shared event/task contract me freeze hogi.

## 8. Recovery Cron exactly kya karegi?

Har scheduled run heavy polling/processing nahi karega. Woh indexed function call karegi:

```text
outbox_recovery_needed()
   |
   +-- false -> finish; Dispatcher HTTP call nahi
   |
   +-- true  -> Dispatcher recovery endpoint ko wake
```

Recovery Cron fallback hai. Normal event INSERT ka primary wake-up Supabase asynchronous Database Webhook hai.

## 9. `processed_events` kyun hai?

Google Cloud Tasks at-least-once delivery karti hai; duplicate delivery possible hai.

Worker final transaction:

```text
BEGIN
  processed_events(consumer_name, event_id) already exists?
    yes -> duplicate success response
    no  -> validated result save
           domain job completed
           processed_events insert
           optional next outbox insert
COMMIT
```

Primary key `(consumer_name, event_id)` same consumer ko same event completion do baar record karne se rokti hai. Expensive work overlap ko रोकने के लिए domain job claim/lease bhi mandatory hai; `processed_events` alone sufficient nahi.

## 10. Teen layers ki duplicate safety

```text
Dispatcher claim safety = SKIP LOCKED + publishing lease
Queue duplicate safety  = deterministic Cloud Task name
Worker result safety     = domain lease + processed_events + domain UNIQUE constraints
```

Queue “exactly once” guarantee nahi karti. Hamara complete flow duplicate delivery ko harmless banata hai.

## 11. NestJS Dispatcher responsibility

- webhook/recovery endpoint authentication;
- in-memory single-flight only as optimization;
- DB claim function call;
- event router and task queue selection;
- deterministic task name;
- Cloud Tasks API create outside DB transaction;
- published/failed function call;
- bounded batches/time;
- structured logs without payload secrets.

Dispatcher AI/OCR/embedding execute nahi karegi.

## 12. RLS/grants requirements

`17_rls.sql` me:

- browser/anon/authenticated ko outbox/processed table access na mile;
- business NestJS/FastAPI roles ko approved transaction me pending outbox INSERT mile;
- envelope writer dispatch fields forge na kar sake;
- Dispatcher role ko direct arbitrary UPDATE ke bajay claim/mark/recovery functions ka EXECUTE mile;
- function EXECUTE `PUBLIC`, `anon`, `authenticated` se revoke ho;
- worker role ko own consumer `processed_events` insert aur required chained event permission mile;
- dead-letter/error payload admin operational access tak limited ho;
- retention DELETE separate trusted maintenance role ko mile.

## 13. Monitoring

Minimum metrics:

```text
pending/failed count
oldest due event age
stale publishing count
dead-letter count
claim batch size/latency
Cloud Task create error/rate
worker retry and domain completion latency
```

Alert examples: oldest due event SLA cross kare, stale leases repeat hon ya dead-letter count zero se zyada ho.

