# Runbook: Dead-Letter Event Operations — `05-outbox-dispatcher-nestjs`

> **Purpose:** Standard Operating Procedure (SOP) for identifying, inspecting, diagnosing, and safely replaying `dead_letter` outbox events in Binay Job Portal.

---

## 1. Dead-Letter Event Overview

An outbox event reaches `dead_letter` status in the Supabase `outbox_events` table under two conditions:
1. **Max Retries Exceeded:** The event failed delivery `max_retries` times (default: 10 attempts with exponential backoff).
2. **Permanent Error / Fail-Closed:** A non-retryable failure occurred (e.g. `unknown_route`, `permanent_permission`, or unroutable event type).

When an event transitions to `dead_letter`, the database sets:
- `status = 'dead_letter'`
- `dead_lettered_at = NOW()`
- `last_error = '<error_class>: <sanitized_message>'`

---

## 2. Step 1: Identifying Dead-Lettered Events

Run the following SQL query in Supabase SQL Editor:

```sql
SELECT 
  id,
  event_type,
  aggregate_type,
  aggregate_id,
  retry_count,
  max_retries,
  last_error,
  occurred_at,
  dead_lettered_at
FROM outbox_events
WHERE status = 'dead_letter'
ORDER BY dead_lettered_at DESC;
```

---

## 3. Step 2: Inspection & Root Cause Diagnosis

Inspect the `last_error` field to classify the root cause:

| Error Class Prefix | Meaning | Corrective Action |
|---|---|---|
| `unknown_route:<type>` | Event type is not registered in `EventRouteRegistry`. | Register event type in `05-outbox-dispatcher-nestjs/src/routing/event-route.registry.ts` and deploy dispatcher. |
| `permanent_permission:...` | Worker IAM or Cloud Tasks authorization failed. | Verify Cloud Tasks service account permissions (`roles/run.invoker`) and OIDC audience headers. |
| `transient_server:...` | Target worker returned `5xx` repeatedly. | Check Cloud Run AI Worker logs (`gcloud logging read`) for application exceptions. |
| `transient_network:...` | Connection timeout to worker or queue. | Check GCP Cloud Tasks queue quota and Cloud Run concurrency limits. |

To view full event payload details:
```sql
SELECT id, event_type, payload, correlation_id, causation_id
FROM outbox_events
WHERE id = '<DEAD_LETTER_EVENT_ID>';
```

---

## 4. Step 3: Safe Event Replay Procedure

> ?? **CRITICAL RULE:** Never modify or manually edit existing `dead_letter` rows in `outbox_events`. Outbox events are an **immutable audit log**. Replaying MUST be done by inserting a **NEW outbox event**.

### Replay Query (Insert New Pending Event)

Once the underlying issue (code fix, IAM policy, or worker deployment) is resolved, replay the event by inserting a new row:

```sql
INSERT INTO outbox_events (
  id,
  aggregate_type,
  aggregate_id,
  event_type,
  schema_version,
  payload,
  correlation_id,
  causation_id,
  status,
  retry_count,
  max_retries
)
SELECT
  gen_random_uuid(), -- Fresh event ID (ensures unique task name)
  aggregate_type,
  aggregate_id,
  event_type,
  schema_version,
  payload,
  id, -- Set causation_id to original dead_letter event ID for audit traceability
  causation_id,
  'pending',
  0,
  max_retries
FROM outbox_events
WHERE id = '<DEAD_LETTER_EVENT_ID>';
```

---

## 5. Step 4: Wake Dispatcher & Verify Replay

Trigger an immediate dispatcher wake to process the new pending event:

```bash
curl -X POST https://dev-outbox-dispatcher-163481994238.asia-south1.run.app/internal/dispatcher/wake \
  -H "x-webhook-secret: dev-secret"
```

Verify that the replayed event transitions to `published` and is processed by `processed_events`:

```sql
SELECT id, event_type, status, published_at, last_error
FROM outbox_events
WHERE causation_id = '<ORIGINAL_DEAD_LETTER_EVENT_ID>';
```



---

## ðŸ“§ Future Operational Scope: Unroutable & Dead-Letter Email Alerting

Future scope me system ko automated email alerting se enhance kiya jayega:

- **Trigger:** Jab bhi outbox_events me koi unroutable event aaye (jiski registry routing missing ho) ya koi event Max Retries complete karke dead_letter me jaye.
- **Action:** System Admin / DevOps Engineering Team ko immediate **Email Alert Notification** send karega (via GCP Cloud Monitoring Alerts / SendGrid / Supabase Email Service).
- **Email Payload:** Notification mail me event_type, ggregate_id, outbox_event_id, aur error traceback error details included rahenge.
