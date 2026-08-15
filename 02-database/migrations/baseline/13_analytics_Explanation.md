# 13 Analytics — Explanation (Hinglish)

## 1. Is file ka purpose

`13_analytics.sql` teen alag concerns ko clearly store karta hai:

```text
Product usage events  -> analytics_events / search_logs
Dashboard projection  -> analytics_daily_aggregates
Security/operations   -> audit_logs / error_logs
```

Ye tables business source of truth replace nahi karti. Application status ka authoritative data `09_applications.sql` me hi rahega; interview truth `10_interviews.sql` me rahega.

## 2. End-to-end flow

```text
Next.js user action
      |
      v
NestJS endpoint
  |-- auth + tenant authorization
  |-- business transaction
  |-- safe analytics event / audit event
  |-- secret/PII redaction
      v
Supabase PostgreSQL
  |-- analytics_events (append-only usage event)
  |-- audit_logs       (immutable sensitive-action history)
      |
      v
Scheduled aggregation worker
  |-- authoritative business tables read
  |-- analytics/search events read where relevant
      v
analytics_daily_aggregates
      |
      v
NestJS authorized dashboard DTO
      |
      v
Recruiter/Admin dashboard
```

Browser ko analytics tables par direct unrestricted INSERT/SELECT nahi milega. NestJS recipient/company context verify karke allow-listed payload store karega.

## 3. `analytics_events`

Ye product/business event stream hai, jaise:

```text
job.viewed
application.submitted
candidate.search_performed
interview.scheduled
referral.invitation_opened
```

`idempotency_key` retry ke waqt duplicate event rokta hai. Same user action ko NestJS stable key ke saath retry karega.

Example:

```json
{
  "idempotency_key": "application-submitted:application-uuid",
  "user_id": "candidate-user-uuid",
  "company_id": "company-uuid",
  "event_name": "application.submitted",
  "event_category": "conversion",
  "source": "nestjs",
  "entity_type": "application",
  "entity_id": "application-uuid",
  "event_data": {
    "job_id": "job-uuid",
    "apply_mode": "registered"
  }
}
```

Raw tokens, passwords, authorization headers, resume text, guest claim hashes aur unnecessary contact details `event_data` me kabhi store nahi honge.

## 4. `analytics_daily_aggregates`

Dashboard har request par millions of events scan na kare, isliye daily projection store hoti hai.

```text
Company A + 2026-08-15 -> one company row
Platform  + 2026-08-15 -> one row where company_id is NULL
```

Do partial unique indexes NULL-company duplicate problem ko solve karte hain.

Important calculation rule:

- Financial/business/funnel counts authoritative domain tables se calculate honge.
- UI engagement/search counts analytics events/search logs se aa sakte hain.
- Aggregate worker same date/company row ko idempotently upsert karega.
- Late event/correction par day ko safely rebuild kiya ja sakta hai.
- Counters negative ya NULL nahi ho sakte.

## 5. `audit_logs`

Audit event batata hai kis actor ne sensitive change kiya:

```text
user actor    -> user_id
system actor  -> actor_service
target user   -> target_user_id (optional)
```

Example actions:

```text
job.published
application.status_changed
company.permission_changed
user.account_suspended
```

Audit row insert ke baad UPDATE/DELETE blocked hai. `old_values`, `new_values`, `changes` aur `metadata` me sirf approved/sanitized fields jayenge—password hashes, tokens aur full sensitive documents nahi.

## 6. `search_logs`

Har executed search ka quality/performance context store hota hai:

- query and filters;
- result count;
- FTS/pgvector/hybrid engine;
- duration and pagination;
- optional clicked job/position.

`idempotency_key` request retry duplicate search log rokta hai. Row immutable hai. Query TEXT par normal B-tree ke bajay hash equality index use hua hai, isliye long search text B-tree index-size failure nahi karega.

Ek search ke multiple click events chahiye hon to har click `analytics_events` me separate event hoga; `search_logs.clicked_job_id` primary/first attributed click ke liye hai.

## 7. `error_logs`

Ye user-facing/admin-manageable sanitized error occurrence aur resolution state rakhta hai. Full stack trace aur raw request body database me nahi rakhe jayenge.

```text
Cloud Logging/Sentry:
  full structured operational details and stack trace

error_logs:
  safe error type/message/fingerprint
  request_id + trace_id
  service/environment
  allow-listed request_context
  resolution state/note
```

Error occurrence payload immutable hai. Sirf resolution fields update ho sakte hain; resolved record dobara reopen/edit nahi hoga. Automated resolution `resolved_by_service` use kar sakta hai, manual resolution `resolved_by`.

## 8. Retention aur privacy

Analytics, search, IP address aur user-agent personal/sensitive telemetry ban sakte hain. Retention duration deployment jurisdiction aur client policy ke baad freeze hogi.

- Raw analytics/search delete sirf controlled retention job karega.
- Ordinary user/browser delete nahi karega.
- Audit history ordinary flow me physically delete nahi hogi.
- Aggregates rebuildable hain, source of truth nahi.
- Data export/deletion policy legal requirement ke hisab se pseudonymize/delete karegi.

## 9. RLS aur service ownership

`17_rls.sql` review me:

- analytics/search/error/audit direct browser writes block hon;
- company dashboard read active authorized company members tak limited ho;
- platform aggregate/admin logs admin-only hon;
- raw IP, user-agent, query, provider/error details normal dashboard DTO me expose na hon;
- restricted worker ko sirf aggregation ke required read/write permissions milen;
- retention job ka delete permission separate trusted role tak limited ho.

## 10. Kya SQL karega aur kya service karegi

SQL:

- uniqueness, JSON shape, nonnegative counters;
- append-only/immutable history;
- daily identity and query indexes;
- safe resolution lifecycle.

NestJS/worker:

- event naming contract and idempotency key;
- actor/company authorization;
- secret/PII redaction;
- authoritative-table based daily rebuild/upsert;
- dashboard DTO and metric definitions;
- retention, rate limits and access audit.

Cloud Logging/Sentry:

- high-volume operational logs, stack traces, alerting and log search.

