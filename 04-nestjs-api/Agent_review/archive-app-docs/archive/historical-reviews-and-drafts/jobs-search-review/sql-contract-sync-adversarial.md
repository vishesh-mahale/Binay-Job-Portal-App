# Decision 07 SQL/contract synchronization review

## Verdict

Decision 07 is directionally coherent, but its implementation gate is not yet safe to execute as written. The proposed expiry function/schedule and notification side effect require a reviewed forward migration plus an operational/permissions design. The AI event already has v1 event/task contracts and a dispatcher route, but Gate G-1 remains a real blocker: the producer envelope and task transformation must be reconciled before any producer is enabled.

## Expiry SQL risks and required corrections

1. `jobs.expires_at` and the filtered `idx_jobs_expiring` index exist, but baseline 01–18 contains no `expire_due_jobs()` function, job-history table, or pg_cron schedule (`05_jobs.sql:163-168, 646-648`). The only scheduler precedent is a comment for refreshing view aggregates via pg_cron **or an external scheduler** (`05_jobs.sql:431-485`); it does not establish that pg_cron is installed or that Asia/Kolkata is the database timezone. Migration must verify/install the extension under approved operational policy and make timezone handling explicit.

2. `published/paused -> expired` is consistent with the Phase 4 candidate flow, but the function must be concurrency-safe: select due rows in stable UUID order with row locks/`SKIP LOCKED` (or an equivalent bounded update), re-check status and expiry under lock, and be rerunnable without duplicate effects. It must not transition `draft`, `pending_approval`, `closed`, `archived`, or already expired rows.

3. “History/audit representation” is underspecified. There is no job-specific history table in `05_jobs.sql`; `audit_logs` is generic and immutable (`13_analytics.sql:170-175, 384-387`). Decide whether each expiry writes an audit row only or introduce a reviewed job-history table. If audit-only, freeze entity/action/actor/source/metadata fields and ensure the scheduled actor is represented consistently (not a fabricated user ID).

4. The in-app notification claim is not directly supported by the baseline function ownership. `notifications` requires a unique nonblank `idempotency_key`, user, title, and lifecycle fields (`12_notifications.sql:140-216`), and the runtime flow says domain transaction/outbox then notification worker resolves templates/preferences (`12_notifications.sql:10-14`). A job expiry function cannot safely “create the approved notification row” without defining recipients (owner, hiring manager, company HR, or subscribers), template/event type, preference behavior, idempotency key, and whether this bypasses the documented worker flow. Recommendation: atomically write job state plus audit/outbox event, then let the approved notification consumer create notifications; if direct insertion is intended, add a reviewed contract and function-level tests.

5. `pg_cron` execution needs least-privilege controls. Baseline 17 revokes broad function/table privileges and labels job internals service-only (`17_rls.sql:148-150, 248-250`). The migration must set a fixed `search_path`, use a narrowly granted security-definer function only if necessary, avoid dynamic SQL, and document who owns/reconciles failed runs. A daily run also implies up-to-24-hour application/search display lag; the defensive `expires_at > NOW()` predicate is mandatory, and application creation must still validate job status/expiry transactionally.

## Job lifecycle/history synchronization

- The enum supports `draft`, `pending_approval`, `published`, `paused`, `closed`, `expired`, `archived`, but there is no DB transition guard. The NestJS command must enforce the frozen matrix and expected-revision/lock semantics; SQL migration must not silently add reopen behavior.
- Decision 07’s direct-publish mapping (`job_approval_required=false`) intentionally changes the executable column’s baseline default (`true` in `04_companies.sql:335-340`). This is safe only if the approved migration explicitly changes the default and existing company rows are handled. `auto_approve_jobs` in `companies.settings` is documentation, not a second source of truth (`04_companies.sql:85-89`).
- “Already submitted jobs keep their current workflow” requires an immutable per-job decision at submit time or a rule derived from status. The current `jobs` table has no approval-policy snapshot column. Do not claim this behavior is guaranteed until the implementation defines how it is preserved under later setting changes.

## AI contract synchronization

1. `job-ai-enrichment-requested.v1.json`, `job-enrich-task.v1.json`, and the dispatcher route `/internal/tasks/job/enrich` exist (`contracts/events/`, `contracts/tasks/`; `05-outbox-dispatcher-nestjs/src/routing/event-route.registry.ts:49-53`). Therefore creating a new job-AI contract is unnecessary and would risk version drift.

2. Gate G-1 is still material. The alignment document explicitly requires freezing producer payload field names and updating worker validation (`contracts/G1-ENVELOPE-ALIGNMENT.md:66-72`), including `aggregate_type=job`, job UUID aggregate ID, and payload `job_id/company_id` (`G1-ENVELOPE-ALIGNMENT.md:46-50`). Validate the exact outbox envelope, `trace_id`/causation/request metadata, schema version, and task mapping in an integration test before enabling publish-triggered emission.

3. “Approved publish/enrichment point” is not an executable trigger. Freeze whether enrichment is emitted on first publish, every semantic edit, explicit command, or retry; use deterministic event/task idempotency and model/version compatibility. Do not emit from the expiry function or search query. AI writes remain worker-owned; the API only writes the approved outbox event in the business transaction.

## Required gate amendments

1. Replace “add expiry SQL” with a migration specification covering extension availability, timezone, bounded locking, status predicate, audit/history representation, function grants/search path, retry/observability, and rollback.
2. Resolve notification ownership/recipient/template/idempotency; prefer outbox-to-notification-worker over direct notification insertion.
3. Add tests for concurrent sweepers, late runs, duplicate notification prevention, paused expiry, status races with publish/resume/close, and unauthorized function execution.
4. Attach an explicit migration for the `job_approval_required` default change and define how setting changes affect already-submitted jobs.
5. Close G-1 with event-envelope/task-contract integration fixtures before registering/enabling the job AI producer.

## Go/no-go

Private query-adapter work can proceed after Decision 07 document sync. Expiry function/schedule, lifecycle SQL, notification side effects, and job-AI producer activation remain blocked until the above SQL/contract artifacts are reviewed and tested against baseline 01–18.
