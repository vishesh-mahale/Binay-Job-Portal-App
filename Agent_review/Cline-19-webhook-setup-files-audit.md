# Audit: Webhook Secret Setup Trio (19-EASY-GUIDE + 19_IMP + 19_prerequisites)

**Auditor:** Cline · **Date:** 2026-08-22
**Files reviewed** (all under `02-database/migrations/baseline/`):
1. `19-EASY-GUIDE-DEV-PROD-WEBHOOK-SECRET-SETUP.md` (118 lines — Operational Master Guide)
2. `19_IMP-Follow-Section-8-9-of-19SQL_file.md` (13 lines — Quick Directive)
3. `19_supabase_webhook_prerequisites.sql` (64 lines — pg_net + `supabase_functions` helper)

**Cross-checked against:** `05-outbox-dispatcher-nestjs/IMPLEMENTATION-PLAN.md` §13, `docs/architecture/background-processing/BACKGROUND-WORKER-IMPLEMENTATION-PLAN-HINGLISH.md` §12, actual dispatcher code (`dispatcher.controller.ts`, `webhook-secret.guard.ts`, `app-config.service.ts`, `env.validation.ts`, `dispatcher.service.ts`), `15_infrastructure.sql`, `17_rls.sql`, `01_extensions.sql`, and `AGENTS.md`.

> **Context:** This trio **replaces** the previously reviewed `19_outbox_webhook_trigger.sql` (root of `migrations/`) which was flagged ❌ non-compliant (hardcoded URL/secret + direct `pg_net` SQL trigger instead of the approved Supabase Dashboard webhook). That file is now **gone** from the repo — only `baseline/19_supabase_webhook_prerequisites.sql` remains. Good pivot.

---

## 1. Verdict Table

| File | Mechanism matches approved architecture? | Secrets handled correctly? | Re-runnable / non-destructive? | Verdict |
|---|---|---|---|---|
| `19-EASY-GUIDE-...md` | ✅ Primary wake = **Supabase Dashboard Database Webhook (INSERT-only)** — exactly §13/§12 | ✅ No real secret value; Secret-Manager placeholders | ✅ (doc) | **APPROVED with minor fixes** |
| `19_IMP-Follow-...md` | ✅ routes reader to §8 (DEV) / §9 (PROD) | ✅ | — | APPROVED (minor link fixes) |
| `19_supabase_webhook_prerequisites.sql` | ✅ Only enables `pg_net` + `supabase_functions` helper the Dashboard needs | ✅ No URL/secret/host in file | ✅ All `IF NOT EXISTS` / `CREATE OR REPLACE` | **APPROVED with hardening notes** |

---

## 2. What is Architecturally Correct (verified against code)

1. **Primary wake mechanism — now correct.** Guide §8 configures a **Supabase Native Database Webhook, INSERT-only, POST**, targeting the dispatcher. This matches:
   - `IMPLEMENTATION-PLAN.md` §13: *"Supabase Async Database Webhook (INSERT-ONLY; UPDATE/DELETE par kabhi nahi) → POST https://<DISPATCHER_URL>/internal/dispatcher/wake (+ x-webhook-secret)"*.
   - Hinglish plan §12 (Mode = asynchronous / pg_net backed, i.e. the dashboard's async webhook mode).
   - The earlier direct-SQL-trigger approach (which I rejected) is **not used anymore**.

2. **Wire contract matches the dispatcher code exactly:**
   - Endpoint `/internal/dispatcher/wake` ↔ `dispatcher.controller.ts:15,19` (`@Controller('internal/dispatcher')` + `@Post('wake')`).
   - Header `x-webhook-secret` ↔ `webhook-secret.guard.ts:21,29` (constant-time, dual-secret).
   - POST ↔ controller. 200 OK ↔ `@HttpCode(200)`.
   - Body discarded ↔ controller comment "body intentionally discarded; `reason` diagnostic only" — consistent with §13 PII rule.

3. **Secrets — handled correctly (AGENTS.md §7 compliant):**
   - Guide uses `<DEV_OUTBOX_WEBHOOK_SECRET_FROM_SECRET_MANAGER>` placeholder, never a real value (unlike the old trigger's `dev-secret`).
   - §3 explicitly teaches *why* hardcoding raw secrets in git is wrong (with a sample/dummy string as the ❌ example).

4. **Dual-secret zero-downtime rotation (§9) matches the actual code:** `env.validation.ts:31` supports `WEBHOOK_SECRET_PREVIOUS` and `webhook-secret.guard.ts:37-38` accepts old+new during rotation. The guide's "deploy old+new → rotate → remove old" SOP is precisely what the guard implements.

5. **RAM caching description (§7) matches `app-config.service.ts`:** env validated once at boot, stored in process RAM, constant-time in-process comparison per request (no per-request Secret Manager call). Text is accurate.

6. **Recovery safety net (§1) matches §14:** "GCP Cloud Scheduler recovery sweeper every 10 min, wake-only, no business processing" — aligned. (Whether `dev-outbox-recovery-sweep` actually exists is GCP infra, not verifiable from the repo — an ops check.)

7. **Prerequisite SQL is technically sound and idempotent:**
   - `CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions` — no-op if already present (Supabase pre-installs it); safe to re-run.
   - `CREATE SCHEMA IF NOT EXISTS supabase_functions` + `CREATE OR REPLACE FUNCTION supabase_functions.http_request()` — this is the exact known fix for the *"schema supabase_functions does not exist / function http_request() does not exist"* error that blocks Dashboard webhook creation.
   - Function calls `net.http_post(url :=, headers :=, body :=, timeout_milliseconds :=)` with **named arguments** → safe across old/new pg_net signatures; schema-qualified → low hijack risk.
   - Grants to `postgres, supabase_admin, service_role` are the correct Supabase roles.
   - Commit-consistency semantics are correct: the request row is written in the same transaction as the outbox INSERT, so a rollback cancels the wake (no orphan wake for a rolled-back event); a commit guarantees wake (with Google Cloud Scheduler as backstop).

---

## 3. Issues Found (severity-ordered)

### 🔴 None blocking. Highest are doc/ops-grade:

### ⚠️ 1. Real project refs embedded in the guide (AGENTS.md line 47 + "no real refs" convention)
- `jzpvssryooucygnuifkb` — real Supabase project ref (Guide §8 step 1).
- `https://dev-outbox-dispatcher-163481994238.asia-south1.run.app` — real Cloud Run URL (Guide §8 step 3).
- `dev-outbox-recovery-sweep` — real scheduler name (Guide §1).
This is the **same URL/string the old trigger was rejected for** (see `Agent_review/Kilo_19_outbox_webhook_trigger_audit.md` finding 2). It is lower risk here because this is a *document*, not a SQL trigger making calls, and these are DEV endpoints — but the repo rule says real refs stay out of docs/deploy configs. **Fix:** replace with `<SUPABASE_PROJECT_REF>`, `<DISPATCHER_URL>`, `<RECOVERY_SWEEPER_NAME>` and keep actual values in a gitignored env/ops sheet.

### ⚠️ 2. Webhook timeout `5000 ms` vs. synchronous drain latency — will produce noisy "failed" webhook events under backlog
- The wake endpoint returns only **after** a drain completes when it is the first wake (`dispatcher.service.ts:106-108`; drain default budget = 240 s).
- If the drain exceeds 5 s, Supabase's webhook client times out → logs "failed" and retries. Correctness survives (single-flight `wakePending` latch + `SKIP LOCKED` + Google Cloud Scheduler absorbs missed work; the drain keeps running server-side), **but** alerts/`webhook_log` will show repeated timeouts on healthy-but-busy systems, causing alert fatigue.
- **Fix (doc):** explicitly state in §8 that a 5 s timeout is a *monitoring* threshold for the wake POST, not a drain deadline — a longer drain is expected and safe, and Google Cloud Scheduler is the backstop. Optionally note the dashboard's larger timeout presets (15 s / custom) if the team prefers fewer retry-noise events.

### ⚠️ 3. PII/body-travel nuance of §13 is not restated near the webhook config
- `IMPLEMENTATION-PLAN.md` §13: dashboard webhooks **send the inserted row (record)** over the wire; body must be discarded by the dispatcher (it is), and producer-side `outbox_events.payload` must stay IDs-only. Guide §8 gives URL/headers but not this one-line reminder. **Fix:** add a note: "Webhook body row payload travels over network; dispatcher discards it; never put raw resume/email/phone/signed URLs in `outbox_events.payload`."

### ⚠️ 4. `19_IMP-Follow` intra-repo links likely broken on GitHub + misleading filename
- Section-8 heading starts with emoji `🚨`, Section-9 with `🏭` → GitHub anchors typically become `#-8-dev-supabase-dashboard-setup-checklist-mandatory-action-required` and `#-9-production-setup--secret-rotation-procedure-op-3-compliance` (leading hyphen). The quick file links omit the leading `-` (`#8-dev-...`, `#9-production-...`) → likely dead anchors on GitHub (renderers vary).
- Guide §10 links to the prereq SQL via an absolute `file:///c:/Users/...` path → broken on GitHub. Should be a relative link `./19_supabase_webhook_prerequisites.sql`.
- Filename `19_IMP-Follow-Section-8-9-of-19SQL_file.md` still references the now-deleted old trigger file ("19SQL_file") — rename to `19_IMP-Follow-Section-8-9-of-19-EASY-GUIDE.md` (or similar) for clarity.

### ⚠️ 5. `19_supabase_webhook_prerequisites.sql` — minor hardening vs. repo convention
- `SECURITY DEFINER` without `SET search_path = pg_catalog` (every other SECURITY DEFINER object in `15_infrastructure.sql` / `17_rls.sql` sets it). The function only calls schema-qualified `net.http_post` + built-ins, so the practical risk is tiny — but for consistency add `SET search_path = pg_catalog` (note: canonical Supabase helper also omits it).
- No `REVOKE ALL ON FUNCTION ... FROM PUBLIC` (repo convention in 15/17). Recommend adding after the GRANTs.
- `GRANT ... TO supabase_admin` will fail on non-Supabase Postgres (role missing). Fine for its stated Supabase-only purpose — add a one-line comment: "Supabase-only script".

### ℹ️ 6. Unverifiable-from-repo claim
- "GCP Cloud Scheduler Recovery Sweeper (`dev-outbox-recovery-sweep`) every 10 min" — GCP infra, not in repo. Ops must confirm the scheduler + its wake-only behavior before relying on §1's fail-safe claim.

---

## 4. Final Verdict

# **APPROVED WITH MINOR FIXES**

The trio **implements the approved architecture correctly the second time around**: primary wake = Supabase Dashboard asynchronous Database Webhook (INSERT-only), correct endpoint/header/secret-placeholder, dual-secret rotation aligned with `WEBHOOK_SECRET_PREVIOUS`, Google Cloud Scheduler as backstop, and an idempotent, non-destructive prereq script that fixes the classic `supabase_functions` schema/function error. No blocking or security issues. Remaining items are documentation-grade (real-ref placeholders, anchor/link fixes, timeout-note, PII line, search_path hardening) — all cheap to apply and none change behavior.

Per the working rules I made **no source/doc edits** in this audit. If you approve, I can apply the fix list (§3) as one small PR-style edit.
