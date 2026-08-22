# Architecture Compliance Audit: `19_outbox_webhook_trigger.sql`

**File:** `02-database/migrations/19_outbox_webhook_trigger.sql`  
**Date:** 2026-08-22  
**Auditor:** Kilo  
**Verdict:** ❌ **NOT COMPLIANT** — Do NOT apply to production. Contains hardcoded secrets, wrong mechanism, and violates approved architecture.

---

## Critical Findings

### ❌ Finding 1: Wrong Mechanism — `pg_net` vs Supabase Webhooks

**Architecture requirement** (`15_infrastructure.sql` + `IMPLEMENTATION-PLAN.md` Section 13):

> Outbox wake is delivered via **Supabase Async Database Webhook** (INSERT-ONLY).  
> `pg_net` is documented only as a **future option**:
> "future option: custom `pg_net`/SQL wake function (standard row-payload webhook ki jagah)"

**What this file does:**
- Uses `pg_net` extension + SQL trigger to make HTTP POST calls directly from PostgreSQL
- Bypasses Supabase's native webhook infrastructure entirely

**Why this is wrong:**
1. Supabase already provides INSERT webhooks as a managed feature — no need to reinvent
2. `pg_net` requires `SECURITY DEFINER` functions with elevated privileges
3. `pg_net` HTTP calls run inside the database process — network failures affect DB stability
4. The approved architecture explicitly chose Supabase webhooks to keep DB logic pure

**Required fix:** Remove this file. Configure the webhook via Supabase Dashboard → Database → Webhooks.

---

### ❌ Finding 2: Hardcoded Production URL (Governance Violation)

**Line 29:**
```sql
url := 'https://dev-outbox-dispatcher-163481994238.asia-south1.run.app/internal/dispatcher/wake'
```

**Violations:**
1. **AGENTS.md rule:** "Docs/deploy configs mein real project refs NAHI — `<YOUR_PROJECT_ID>` placeholders"
2. **Architecture rule:** Environment-specific values belong in config/env, not in SQL migrations
3. **Security:** Exposes internal Cloud Run URL in version control

**Required fix:** If `pg_net` approach is ever adopted, the URL must come from a config table or environment variable, never hardcoded.

---

### ❌ Finding 3: Hardcoded Secret in SQL (Security Vulnerability)

**Line 30:**
```sql
headers := '{"x-webhook-secret": "dev-secret", "Content-Type": "application/json"}'::jsonb
```

**Violations:**
1. **Secret in version control** — `dev-secret` is committed to the repository
2. **Secret in SQL** — Even if rotated, the historical value remains in git history
3. **Architecture requirement** (`IMPLEMENTATION-PLAN.md` Section 12): `WEBHOOK_SECRET` must live in Secret Manager / Cloud Run env, never in code or SQL

**Required fix:** Remove. Secrets must never appear in SQL files.

---

### ❌ Finding 4: No Event-Type Filtering (Violates G-5 Unroutable-Event Policy)

**Line 43–46:**
```sql
CREATE TRIGGER trigger_outbox_dispatcher_wake
AFTER INSERT ON outbox_events
FOR EACH ROW
EXECUTE FUNCTION notify_outbox_dispatcher_wake();
```

**Problem:** This fires for **every** INSERT into `outbox_events`, including:
- Worker-emitted chained events (`candidate.resume.parsed`, `job.enriched`, etc.)
- Test data
- Any future event types without a consumer

**Architecture requirement** (`IMPLEMENTATION-PLAN.md` Section 9, G-5):
> "Jab tak kisi event ka consumer contract + registry entry exist na kare, producer us event ko `outbox_events` mein emit hi NAHI karega."
> "Registry entry consumer banne par hi aayegi (OD-4 tracking)."

Additionally, `TESTING-SCENARIOS-1.md` Section 5 (M-04) confirms:
> Recovery with Stale `publishing` Leases — `outbox_recovery_needed()` checks `(status = 'publishing' AND lease_expires_at <= NOW())`

But this trigger bypasses recovery logic entirely — it fires on every insert regardless of status or event type.

**Required fix:** At minimum, filter to only contracted Phase 1 event types:
```sql
WHEN (NEW.event_type IN (
  'resume.parse.requested',
  'candidate.profile.changed',
  'job.ai.enrichment.requested'
))
```

However, the better fix is to use Supabase's webhook INSERT-only filter at the platform level.

---

### ❌ Finding 5: No Idempotency / Duplicate Protection

**Problem:** If the same outbox event is inserted twice (shouldn't happen, but could during recovery or bugs), this trigger fires twice, sending two webhooks. The dispatcher's single-flight latch handles duplicates, but:
1. Unnecessary DB load
2. Unnecessary network calls
3. Potential race conditions

**Required fix:** Supabase webhooks have built-in retry logic. This SQL trigger has none.

---

### ❌ Finding 6: No Error Handling / Observability

**Problem:** `net.http_post` is fire-and-forget. If the dispatcher is down:
- No retry
- No backoff
- No alert
- No dead-letter
- No metric

**Architecture requirement:** Webhook delivery failures should be visible and recoverable via Google Cloud Scheduler 10-min recovery.

**Required fix:** Not applicable if using Supabase webhooks (Supabase handles retries). If `pg_net` is used, needs `EXCEPTION` handling + logging.

---

### ❌ Finding 7: `SECURITY DEFINER` Without Privilege Restriction

**Line 35:**
```sql
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Problem:** The function runs with the owner's privileges. Combined with `pg_net` making external HTTP calls, this is a privilege-escalation surface.

**Required fix:** If retained, add `SET search_path = pg_catalog` and revoke public execute:
```sql
REVOKE ALL ON FUNCTION notify_outbox_dispatcher_wake() FROM PUBLIC;
```

---

## What the Architecture Actually Requires

Per `IMPLEMENTATION-PLAN.md` Section 13 and `15_infrastructure.sql`:

```
outbox_events INSERT (trusted producer)
  → Supabase Async Database Webhook (INSERT-ONLY)
  → POST https://<DISPATCHER_URL>/internal/dispatcher/wake (+ x-webhook-secret)
  → Dispatcher ignores body, claims batch from DB
```

**Configuration belongs in:**
- **Supabase Dashboard** → Database → Webhooks → New Webhook
- **Table:** `outbox_events`
- **Events:** `INSERT` only
- **URL:** `https://<DISPATCHER_URL>/internal/dispatcher/wake`
- **Headers:** `x-webhook-secret: <from-secret-manager>`
- **Retry:** Supabase default (exponential backoff)

**No SQL migration needed for webhooks.** Supabase manages this as infrastructure config, not as versioned SQL.

---

## Comparison: Approved vs This File

| Aspect | Approved Architecture | This File |
|---|---|---|
| Mechanism | Supabase native webhook | `pg_net` + SQL trigger |
| URL source | Supabase dashboard config | Hardcoded in SQL |
| Secret source | Secret Manager / env var | Hardcoded in SQL |
| Event filter | Supabase INSERT-only | ALL inserts (no filter) |
| Error handling | Supabase retry + Cron backstop | None (fire-and-forget) |
| Idempotency | Dispatcher single-flight | None at DB level |
| Observability | Supabase webhook logs | None |
| Governance | No real refs in SQL | Real URL + secret committed |
| Security | Webhook secret in env | Secret in SQL text |

---

## Additional Concern: Trigger Conflict

`15_infrastructure.sql` already defines:
```sql
CREATE TRIGGER outbox_events_lifecycle_guard
    BEFORE INSERT OR UPDATE OR DELETE ON outbox_events
    FOR EACH ROW
    EXECUTE FUNCTION enforce_outbox_event_lifecycle();
```

Adding an `AFTER INSERT` trigger in a separate migration is technically valid, but:
1. Two triggers on the same table increase maintenance complexity
2. If `pg_net` extension is not enabled, this migration fails
3. Supabase free tier may not support `pg_net`

---

## Final Verdict

**DO NOT APPLY THIS MIGRATION.**

| Issue | Severity | Action |
|---|---|---|
| Wrong mechanism (`pg_net` instead of Supabase webhook) | HIGH | Delete file; use Supabase Dashboard |
| Hardcoded production URL | HIGH | Governance violation |
| Hardcoded secret in SQL | HIGH | Security vulnerability |
| No event-type filtering | HIGH | Would violate G-5 policy |
| No error handling / retry | MEDIUM | Architecturally incomplete |
| `SECURITY DEFINER` without restrictions | MEDIUM | Privilege escalation risk |

**Correct approach:**
1. **Delete `19_outbox_webhook_trigger.sql`** — it is not needed
2. **Configure webhook in Supabase Dashboard:**
   - Table: `outbox_events`
   - Event: `INSERT`
   - URL: `<dispatcher-url>/internal/dispatcher/wake`
   - Secret: `x-webhook-secret` from Secret Manager
3. **Let Supabase handle retries and delivery** — no custom SQL needed

---

*No files were modified. This is an audit-only report.*
