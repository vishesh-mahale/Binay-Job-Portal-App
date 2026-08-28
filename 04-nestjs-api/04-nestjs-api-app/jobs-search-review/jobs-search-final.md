# Jobs/Search final review (independent, pre-coding)

## Verdict

Do not start the Jobs/Search business slice yet. The database has a credible search substrate, but the public command/query contract and several lifecycle policies are still explicitly `TBD` or only a “baseline candidate.” Coding now would require inventing route, DTO, authorization, transition, ranking, and expiry behavior. Foundation work may proceed; this slice should wait for the decisions below and a small contract/catalog amendment.

## Evidence and findings

1. **Job lifecycle is not frozen.** The enum is `draft`, `pending_approval`, `published`, `paused`, `closed`, `expired`, `archived` (`02-database/migrations/baseline/02_enums.sql:161-169`). Phase 4 labels the proposed transitions as a candidate flow and expressly disallows assuming reopen transitions (`PHASE-04-STATE-MACHINES-AND-TRANSACTIONS.md:121-132`). SQL has job timestamps/approval actors but no job transition function/guard; NestJS therefore needs an approved transition matrix, revision/concurrency rule, history/audit rows, and exact commands before implementation.

2. **Approval configuration exists but behavior does not.** `company_settings.job_approval_required` defaults true (`02-database/migrations/baseline/04_companies.sql:335-340`), while `companies.settings` merely gives `auto_approve_jobs` as an example JSON key (`04_companies.sql:85-89`). Decide one authoritative setting, its precedence/default, who may change it, and whether changing it affects already-submitted jobs. Define reviewer roles and rejected-job edit/resubmit transitions; none are frozen by the catalog.

3. **Every relevant public path is still TBD.** API-JOB-001 says “company job resource and lifecycle commands” with method/path TBD and only “authorized employer/HR” (`PHASE-06-API-CATALOG.md:391-410`). API-SEARCH-001 and -002 likewise leave both paths and concrete DTOs TBD (`PHASE-06-API-CATALOG.md:413-451`). Freeze separate resource CRUD plus named lifecycle commands (or one explicit command endpoint), actor/role matrix, response cards/detail DTOs, field allowlists, and error mappings.

4. **Expiry ownership is unresolved.** `jobs.expires_at` is an ordinary nullable column with only `expires_at > created_at` validation (`05_jobs.sql:163-168, 200-204`); the only expiry index is for upcoming published jobs (`05_jobs.sql:646-648`). There is no DB job-expiry function or outbox trigger. Choose one authoritative sweeper (dispatcher/Cron/other), lock/update semantics, lateness policy, and whether expiry writes history/audit and an event/notification. Search must defensively exclude `expires_at <= now()` even if the sweeper is late.

5. **Search technology direction is clear, but the API ranking contract is not.** Current strategy is relational filters + PostgreSQL FTS/targeted trigram + compatible pgvector; external search is future and requires evidence/ADR (`02-database/schema-docs/SEARCH-STRATEGY.md:22-37, 338-369`). Jobs have trigger-maintained `search_vector` and GIN/filtered indexes (`05_jobs.sql:518-563, 628-664`), and candidate projections have FTS/HNSW indexes (`08_candidates.sql:418-466, 611-615`). Freeze rollout as PostgreSQL filters/FTS first, semantic only when model/version-compatible, external provider later. Specify query modes, normalized score/RRF or other tested formula, missing-vector fallback, deterministic tie-break, low-confidence/zero-result behavior, and whether ranking explanation is public.

6. **Pagination should be cursor-based, but cursor semantics remain a decision.** Strategy explicitly prefers stable cursor pagination and deterministic ties (`SEARCH-STRATEGY.md:235-245`); catalog only says bounded pagination and cursor metadata (`PHASE-06-API-CATALOG.md:420-431`). Freeze opaque signed/versioned cursor contents (sort mode, filters hash, score/timestamp/UUID), maximum page size, expiry, and invalid-cursor error mapping. Do not expose raw offset as an accidental fallback.

7. **Visibility and tenant boundaries are server-side, not browser/RLS search APIs.** RLS grants no direct job/recruiter-search table access and labels recruiter search service-only/default-deny (`17_rls.sql:148-150, 248-250`). Public job search must hard-filter published, non-deleted, non-expired, non-confidential/allowed-visibility jobs. Recruiter search must require active company membership and policy-approved candidate visibility; a row in `candidate_search_profiles` is not itself authorization (`SEARCH-STRATEGY.md:198-217`). Freeze whether candidate visibility is company-wide, application-based, opt-in/open-to-work, and what fields/source-trust labels are returned.

8. **Candidate projection freshness and privacy need explicit API behavior.** Projection contains `source_profile_revision`, `projection_revision`, skill/title/location JSON, searchable text, vector/model/version (`08_candidates.sql:418-466`). Decide whether stale projections are returned with a freshness indicator, excluded, or lexical-only fallback; never return raw evidence/search text by default. Saved candidates are correctly private, non-job-specific, and unique per recruiter+candidate (`09_applications.sql:224-242`; catalog `PHASE-06-API-CATALOG.md:500-515`), but list/detail response and whether a bookmark is embedded in search cards versus a separate endpoint must be frozen.

9. **Contracts/events are incomplete for job lifecycle.** The approved dispatcher routes include `job.ai.enrichment.requested`, but no job lifecycle/search event is registered; `application.status.changed` is explicitly a phased gap (`PHASE-05-FINAL-REQUIREMENTS.md:9A`; `PHASE-08-IMPLEMENTATION-PLAN.md:10`). Decide exactly when job AI enrichment is emitted, payload/schema/version, and whether publish/pause/expire events are domain-only audit rows or outbox events. Never invent a dispatcher route or mutate an existing schema. Outbox writes must remain in the same transaction; dispatcher ownership/unknown-event fail-closed behavior follows `15_infrastructure.sql:23-35, 105-165`.

10. **Analytics/view writes must not leak into search command semantics.** `job_views` and aggregate refresh are separate high-volume concerns; SQL documents periodic refresh via scheduler (`05_jobs.sql:431-485`). Freeze whether search impressions/clicks are recorded, consent/PII policy, idempotency, and whether analytics is synchronous, outbox-backed, or omitted from the first slice.

## Required decisions before coding

| ID | Decision to record | Recommended disposition |
|---|---|---|
| J1 | Exact job routes and command shape | Freeze resource routes plus explicit `publish`, `pause`, `resume`, `close/archive` commands; no generic arbitrary status PATCH. |
| J2 | Actor/permission matrix | Owner/admin approval; authorized HR/employer draft management; exact role and company-membership checks documented per command. |
| J3 | Approval setting and rejected flow | Make `company_settings.job_approval_required` authoritative; define auto-approve interpretation, reviewer, rejection reason, edit/resubmit. |
| J4 | Expiry sweeper and side effects | Assign one scheduler owner; atomic `published -> expired`, audit/history and approved event policy; search-time defensive filter. |
| J5 | Search rollout/ranking | PostgreSQL filters + FTS now; compatible vectors opt-in/fallback; external engine only after ADR; freeze tested ranking/ties/explanations. |
| J6 | Cursor contract | Opaque signed cursor, filter/sort binding, bounded page size, expiry and approved invalid-cursor mapping. |
| J7 | Candidate visibility/freshness | Freeze lawful visibility scope, returned fields, stale projection behavior, and bookmark representation. |
| J8 | Job/AI/analytics contracts | Inventory existing `job.ai.enrichment.requested` schema and define lifecycle/analytics events only if approved; otherwise explicitly no event. |
| J9 | Minimum tests | Acceptance plus cross-company/role negatives, expired/paused/confidential exclusion, rejected/resubmit, concurrent lifecycle update, cursor duplicate/skip, FTS/vector fallback/model mismatch, projection staleness, saved-candidate privacy, and outbox atomicity. |

## Go/no-go gate

Go only after J1–J8 are recorded in the API catalog/decision log, DTOs and error codes are frozen, event schemas/routes are reconciled with the dispatcher registry, and the SQL query plans/lock order are tested against representative data. Until then, implementing Jobs/Search endpoints would violate Phase 5/6’s “no invented route or behavior” rule.
