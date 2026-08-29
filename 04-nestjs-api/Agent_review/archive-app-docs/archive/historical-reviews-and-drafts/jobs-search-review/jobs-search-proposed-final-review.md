# Review of CODEX-PROPOSED-DECISIONS-FOR-APPROVAL

## Verdict

The proposal is a useful decision agenda, but it is not source-aligned enough to mark `FINAL`. J1, J5 and most of J8 are directionally safe. J3 and J4 currently assert product/operational choices that are not established by the executable baseline; J2 and J7 contain undefined policy terms; J6 includes unapproved numeric defaults; and J1/J8 still need contract-level detail. Approve only after the explicit human confirmations are recorded in the catalog/decision log.

## Adversarial findings by decision

### J1 — routes and named commands: conditional approval

Named lifecycle commands and avoiding arbitrary status PATCH align with the Phase 4 warning not to assume reopen transitions (`PHASE-04-STATE-MACHINES-AND-TRANSACTIONS.md:121-132`). However, “company-nested REST resource” and the complete command list are not frozen: API-JOB-001 still says method/path `TBD` (`PHASE-06-API-CATALOG.md:391-410`). `close` versus `archive` semantics, whether `read` is company-only or includes public detail, expected revision/idempotency, and whether approval is a separate command must be frozen. Do not implement routes from this proposal alone.

### J2 — permissions: needs a concrete authorization record

The role vocabulary (`candidate`, `employer`, `hr`, `admin`) exists (`02_enums.sql:61-66`), and membership rows have JSONB permission overrides (`04_companies.sql:234-250`). But “job-management permission,” “sensitive lifecycle control,” and “hiring-manager rights” are not executable permissions or an approved matrix. Freeze owner versus employer versus HR versus platform-admin behavior for create/edit/publish/pause/resume/close/archive/approve, including inactive/left members and cross-company IDs. Verification is also relevant: the SQL comment says only verified companies may publish, with enforcement delegated to NestJS (`05_jobs.sql` job constraints/comment).

### J3 — approval setting/default: reject current proposal as written

`company_settings.job_approval_required` is the executable setting and defaults **true** (`04_companies.sql:335-340`). The `auto_approve_jobs` JSON example is not an authority (`04_companies.sql:85-89`). The proposed default `false` therefore conflicts with the baseline and has no cited approved product decision. Retain `true` unless a human explicitly approves a forward/default migration and documents its rollout effect. Also specify whether setting changes apply only to future submissions, who may change them, and the rejection reason/edit/resubmit state. `pending_approval` and approval actor fields are supported by the enum/table, but no job transition function/guard exists.

### J4 — expiry: reject “simple daily Supabase pg_cron” as established fact

The baseline has `expires_at`, a validity check, and an index for expiring published jobs (`05_jobs.sql:163-168, 200-204, 646-648`), but no expiry function or cron schedule. The only scheduler wording in this SQL concerns refreshing view aggregates every 5–15 minutes via pg_cron **or an external scheduler** (`05_jobs.sql:431-485`); it does not authorize pg_cron for job expiry. Phase 4 permits `published/paused -> expired` as a candidate flow but does not select an owner (`PHASE-04-STATE-MACHINES-AND-TRANSACTIONS.md:121-132`). Keep the owner/schedule/timezone as `NEEDS_DECISION`; require an atomic lock/update, audit/history, retry/late-sweep behavior, and approved outbox event policy. Search/apply must independently enforce `expires_at IS NULL OR expires_at > NOW()`.

### J5 — search rollout/ranking: directionally aligned, incomplete contract

PostgreSQL filters + FTS first, compatible vector retrieval later, lexical fallback, and external search only after ADR match the strategy (`SEARCH-STRATEGY.md:22-37, 235-245`). Freeze what “later” means operationally: request mode, model/version compatibility, no-vector behavior, score normalization/RRF or another formula, deterministic tie-break, and explanation labels. The proposal wisely avoids permanent guessed weights; implementation must still use a tested provisional formula or filter-only ordering.

### J6 — cursor: revise before approval

Opaque signed/versioned cursor and filter binding align with the stable-cursor recommendation (`SEARCH-STRATEGY.md:235-245`). Suggested default 20/max 50 are invented numeric limits; keep them explicitly proposed until approved. Freeze cursor sort mode, score/timestamp/UUID tie fields, filter hash canonicalization, signature/key rotation, cursor lifetime, and behavior when records change between pages. `CURSOR_INVALID` is expressly not a public error code (`PHASE-06-API-CATALOG.md:28-33`); map invalid/expired/tampered cursors to the approved validation vocabulary only after confirming the exact code/details schema.

### J7 — visibility and stale projection: needs policy and DTO decision

Recruiter membership plus candidate visibility policy is aligned with the strategy’s warning that projection presence is not authorization (`SEARCH-STRATEGY.md:198-217`) and RLS’s service-only recruiter-search boundary (`17_rls.sql:248-250`). “Published, non-deleted, non-expired” is necessary but the proposal’s public exclusion of all confidential jobs needs confirmation: `jobs.is_confidential` is documented as “hide company name,” not necessarily hide the whole listing (`05_jobs.sql:176-179`). Define public confidential-card masking versus exclusion.

`is_stale` is a new response field, not present in `candidate_search_profiles`; it is a reasonable option but cannot be treated as frozen. Choose stale projection behavior (return with indicator, lexical-only, or exclude), define freshness calculation from `source_profile_revision`/`projection_revision`, and freeze candidate fields/source-trust/ranking explanation. Do not use `is_open_to_work` as sole authorization without an approved visibility rule.

### J8 — event gating: aligned but “publish point” is not frozen

The existing `job.ai.enrichment.requested` route is registered, while unknown/unrouted events must fail closed and new contracts require approval (`PHASE-05-FINAL-REQUIREMENTS.md:9A`; `PHASE-08-IMPLEMENTATION-PLAN.md:10`). Gate G-1 must close before any producer implementation. “Approved publish/enrichment point” still needs an exact trigger, payload fields, version, idempotency key, and consumer. No job lifecycle event or search-impression event should be added by inference; analytics remains a separately catalogued path. `15_infrastructure.sql` makes outbox/dispatcher state durable, but does not define a job event contract.

## Required edits before human approval

1. Change J3 to baseline default `true`, or attach an explicit approved decision and migration for `false`.
2. Change J4 from “simple daily Supabase pg_cron” to an owner/scheduler decision; cite only the view-refresh scheduler as precedent, not expiry authority.
3. Replace J2’s generic permissions with a role/action matrix and verification requirement.
4. Mark J6 numbers as unapproved proposals and map invalid cursors to an existing public error code.
5. Resolve whether confidential jobs are masked or excluded publicly; approve the `is_stale` field and freshness semantics.
6. Add exact event trigger/schema/idempotency details for J8 and reconcile with the dispatcher registry.
7. Only then sync the approved outcomes into API-SEARCH/API-JOB DTOs, tests, and SQL migration scope.

## Go/no-go

No Jobs/Search controller, lifecycle function, expiry cron, ranking/cursor implementation, or new event should be coded from this proposal yet. Foundation and read-only query scaffolding may proceed only behind the still-TBD contract gate; business-slice coding starts after the above conflicts are resolved and catalog/decision documents are updated.
