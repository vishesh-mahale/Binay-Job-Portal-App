# Decision-07 SQL/contract synchronization review

Reviewer: Codex (independent revalidation)
Date: 2026-08-27
Source: `DECISION-07-JOBS-SEARCH-FINAL.md`

## Verdict

Decision-07 is approved as product/API direction, but the stated implementation gate is not yet
executable. The baseline lacks a job status-history table, lifecycle transition function/guard,
expiry function/schedule, and a contract-aligned job-enrichment trigger. These must be delivered as
reviewed forward migrations and contract changes. Notification recipients/content and exact event
payload semantics are still blockers; they cannot be inferred safely.

## Required SQL synchronization

### 1. `job_status_history` — required unless audit-only is explicitly approved

The `jobs` table has lifecycle state/timestamps but no status-history table (`05_jobs.sql`, around
lines 93–197). `audit_logs` is generic and immutable (`13_analytics.sql`, lines 173–230), while
Decision-07 requires lifecycle history/audit representation. Add a reviewed append-only history
table only if this is the selected representation. The source-supported minimum is:

- generated UUID primary key;
- `job_id` foreign key with retention/deletion behavior explicitly chosen;
- `from_status` nullable for initial creation and `to_status` required, both `job_status`;
- actor identity (`changed_by` user or service actor), request/trace correlation;
- reason/metadata and created timestamp;
- a check preventing a non-null `from_status` equal to `to_status`;
- indexes by `(job_id, created_at)` and company/job query needs.

Do not invent retention, actor column names, or a public history endpoint. Decide whether each
transition writes both this row and `audit_logs`, or whether generic audit is sufficient. Decision-07
explicitly leaves this as implementation SQL work, so status remains a migration blocker.

### 2. Transition guard/function — required before lifecycle commands

No job lifecycle function or trigger is present in `05_jobs.sql`; direct status writes are therefore
not yet constrained by the approved state machine. Add a trusted transaction function or equivalent
command path that:

1. locks the company then job in the mandated Phase 08 order (`company → job → approval/history/
   skill/screening`);
2. validates the actor and company scope in NestJS/SystemClient;
3. validates the approved transition matrix, including `draft → published` only when
   `job_approval_required = false`, `draft → pending_approval`, pending approval approve/reject,
   pause/resume, close, archive, and terminal-state non-reopen;
4. updates the lifecycle timestamp/actor fields consistently;
5. inserts history, audit and any approved outbox row in one transaction.

If a DB trigger blocks ad-hoc status updates, it needs a transaction-local trusted marker (analogous
to `app.application_status_change` in `09_applications.sql`) and must reject all unmarked updates.
The trigger must not be a way to bypass NestJS authorization. Exact rejected-state transitions and
whether `rejected → draft` or direct resubmission is allowed require the Decision-07 wording to be
expanded before freezing the matrix.

### 3. Approval setting migration/precedence — required sync

`company_settings.job_approval_required BOOLEAN NOT NULL DEFAULT true` is the executable schema
default (`04_companies.sql`, around line 339), while Decision-07 freezes direct publish by default:
`false = direct publish`, `true = approval required`. The migration must change the SQL default to
`false` (and safely backfill/assess existing rows) only after the product owner confirms that this
approved Decision-07 supersedes the archived Decision-05 representation. The archived document uses
`auto_approve_jobs = true` and opposite semantics; it must be marked documentation-only or formally
amended. Owner/admin setting authorization and already-submitted-job behavior require tests and a
catalog sync; no JSONB `companies.settings` key should be introduced.

### 4. Expiry function and pg_cron — required forward SQL, with notification blockers

Decision-07 selects Supabase pg_cron daily at 12:05 AM Asia/Kolkata and `expire_due_jobs()` for due
`published` and `paused` rows. The baseline currently contains only `expires_at` and an expiry index
(`05_jobs.sql`, around lines 163–168 and 646–648). Add a reviewed function that atomically:

- locks/selects due rows safely and transitions only `published`/`paused` jobs;
- writes lifecycle history and audit using a service actor;
- creates the approved in-app notification row idempotently;
- is safe on retry/concurrent invocation;
- returns/records counts and exposes failure observability.

The `notifications` table supports an idempotency key, user/company/entity references and event type
(`12_notifications.sql`, lines 143–216), but Decision-07 does not specify recipient(s), template,
title/body, event type, group key, or idempotency-key derivation. Those are blockers to implementing
the notification insert. No notification row should be guessed. The pg_cron extension, ownership,
timezone behavior, permissions, and monitoring also need an operational migration/runbook; the
baseline does not establish them.

All public search and apply SQL must include `(expires_at IS NULL OR expires_at > NOW())`, even before
the sweep runs. The current visible guest application query in `src/guest.ts` checks `published` and
`deleted_at` but does not visibly include this expiry predicate; reconcile it before declaring apply
behavior compliant.

## Required contract synchronization

### Job AI enrichment event — Gate G-1 blocker

`contracts/events/job-ai-enrichment-requested.v1.json` currently describes a flat envelope requiring
`schema_version`, `event_id`, `aggregate_id`, and `trace_id`, with optional `job_id`/`trigger`. The
G-1 alignment document says the target outbox envelope requires `aggregate_type`, `aggregate_id`,
`event_type`, `payload`, and `occurred_at`, with job payload fields including `job_id` and
`company_id`. This is an actual contract mismatch, not merely a DTO detail.

Before a producer is implemented:

- decide whether the current v1 file is still draft/unconsumed and may be aligned in place, or issue
  a new version for a breaking envelope change;
- freeze aggregate type (`job`), event type (`job.ai.enrichment.requested`), payload fields, trigger
  enum, trace propagation, and `occurred_at` semantics;
- validate the producer and dispatcher/task adapter against the same schema;
- preserve the existing dispatcher registry as the only route authority.

Decision-07’s “publish/enrichment point only” is not enough to define trigger semantics: the current
schema permits `created`, `updated`, and `reparsed`, and Phase 06 says enrichment occurs when
approved fields require it. Do not silently reduce this set to publish-only. No job lifecycle or
search-impression event should be added without a versioned contract and consumer.

## Required catalog/document sync

Before coding, sync Phase 06 `API-JOB-001`, `API-SEARCH-001/002`, permissions, error vocabulary,
cursor contract, and event notes with Decision-07. In particular, add the approved routes and named
commands, but keep exact DTO fields, cursor signing/expiry/error mapping, recruiter visibility and
freshness marker explicit. Phase 06 currently disallows public `CURSOR_INVALID`; the Decision-07
validation mapping must select an existing approved code or amend the vocabulary.

## Blocking checklist

- [ ] Confirm Decision-07 supersedes archived approval default and approve `job_approval_required`
  default/backfill.
- [ ] Freeze status-history representation and exact transition matrix/rejected resubmission.
- [ ] Define expiry notification recipient/template/payload/idempotency and pg_cron operational owner.
- [ ] Decide whether job-enrichment v1 can be edited or v2 is required; freeze full envelope.
- [ ] Sync catalog routes/DTOs/cursor/error and recruiter freshness policy.
- [ ] Add migration tests for concurrent lifecycle/expiry invocations, terminal non-reopen,
  atomic history/audit/notification behavior, and search/apply expiry guards.

Until these items close, only private read-only FTS adapter work is safe; lifecycle SQL, expiry
scheduler, event producer, and public controllers remain blocked by the implementation gate.

