# Jobs + Search independent decision review

Reviewer: Codex (independent review)
Date: 2026-08-27

## Verdict

Jobs/search is not ready for public endpoint coding. The repository has a usable database foundation and a cataloged use-case boundary, but public paths, DTOs, approval policy, and expiry authority remain unresolved. The next safe slice is a decision/contract freeze followed by a bounded read-only query adapter and tests; job lifecycle commands should wait for approval and expiry decisions.

## Findings and recommendations

### Job API surface — `NEEDS_DECISION`

`PHASE-06-API-CATALOG.md` records `API-JOB-001` as `TBD` for the company resource and lifecycle commands (around lines 391–410). It does establish authorized employer/HR access, atomic job/history/audit/outbox writes, `Idempotency-Key`, and invalid-transition protection. SQL defines `draft`, `pending_approval`, `published`, `paused`, `closed`, `expired`, and `archived` (`02-database/migrations/baseline/02_enums.sql`, lines 159–169), plus publisher/approver fields and lifecycle timestamps (`05_jobs.sql`, lines 93–168). This supports a lifecycle command boundary, but does not select exact routes, separate versus combined commands, or role-by-role permissions. Do not infer routes from the table or enum.

### Approval — `NEEDS_DECISION`

The schema has `pending_approval`, `approved_by`, and `approved_at`, and Phase 06 requires an approval policy to be captured, but no `auto_approve_jobs` setting/configuration path or approval transition function is present in the reviewed SQL. Configuration ownership, reviewer eligibility, and rejected-job resubmission therefore cannot be frozen from current sources. Retain these as explicit product/API decisions and implement only after a transition matrix and authorization policy are recorded against existing requirement IDs.

### Expiry — `NEEDS_DECISION`

`jobs.expires_at` and `expired` exist (`05_jobs.sql`, lines 163–168), and the partial expiry index supports finding published jobs nearing expiry (lines 646–648). The SQL comments describe scheduled work, but no authoritative expiry transition owner/sweeper is frozen. Decide whether the existing dispatcher/scheduler or database cron owns the state transition, then define atomic history/audit/outbox behavior and notification scope. Do not add an expiry worker or notification route before that decision.

### Candidate/public job search — `NEEDS_DECISION` for route/DTO/provider order

The catalog freezes active/published/non-expired visibility, bounded pagination, keyword/FTS plus location, skill, experience, salary, company, job type, work-mode and posted-date filters, safe job cards, and cursor/next-page metadata (`PHASE-06-API-CATALOG.md`, around lines 413–431). SQL provides weighted PostgreSQL `search_vector` and a GIN index (`05_jobs.sql`, lines 518–563 and 628–665). Phase 08 defers an external search engine (`GAP-010`) and keeps PostgreSQL search as current scope.

Recommendation: freeze PostgreSQL FTS as the first implementation layer; semantic/vector and external search remain later gates. Exact public route, DTO field list, cursor encoding, and filter semantics still require approval. Candidate search must filter lifecycle visibility and `expires_at > NOW()`, not status alone.

### Recruiter candidate search — `NEEDS_DECISION` for public contract; policy direction is frozen

The catalog specifies authorized HR/employer access, active company membership, bounded keyword/FTS/semantic filters, projection cards with explainable source/trust labels, and no raw evidence selector (`PHASE-06-API-CATALOG.md`, around lines 434–451). SQL provides `candidate_search_profiles` with FTS and HNSW embedding indexes (`08_candidates.sql`, lines 418–468 and 611–615). RLS grants only creator-owned SELECT for `saved_candidates` and says company membership, candidate visibility, and all writes are NestJS-enforced (`17_rls.sql`, lines 207–212).

Enforce company tenant scope and recruiter permission in NestJS/SystemClient. Return saved-candidate state only through the separately cataloged bookmark capability unless the final DTO decision explicitly joins it. Ranking explanations should use the required source/trust labels; raw evidence remains withheld.

### Contracts and tests

The approved job-related producer is `job.ai.enrichment.requested`; its v1 schema allows `job_id` and triggers `created`, `updated`, or `reparsed` (`contracts/events/job-ai-enrichment-requested.v1.json`). No job lifecycle/search event contract is approved. `application.submitted` and `application.status.changed` are application events and must not be reused for jobs/search. `G1-ENVELOPE-ALIGNMENT.md` marks Phase 1 trigger-envelope alignment pending, including job enrichment producer alignment. Keep missing contracts `TBD`; create a new version only after purpose, envelope, and consumer are approved.

Minimum supported test set from Phase 08: cross-company authorization negatives; lifecycle invalid-transition and approval tests; closed/expired/deleted search exclusion and bounded pagination; recruiter tenant/restricted-candidate and saved-candidate privacy; concurrent lifecycle updates using `company → job → approval/history/skill/screening` lock order; and atomic outbox/idempotency/schema compatibility for job enrichment.

## Safe next implementation slice

1. Freeze routes/DTOs, approval matrix/configuration, expiry owner, cursor format, and ranking explanation shape.
2. Reconcile Gate G-1 and freeze the job-enrichment trigger envelope before writing a producer.
3. Implement/test a private bounded PostgreSQL FTS query adapter against `jobs.search_vector` and `candidate_search_profiles.search_vector`, with visibility/tenant predicates and no public controller until route/DTO approval. Semantic and external providers remain deferred.
4. Implement job commands only after the decisions, using the Phase 08 lock order and atomic business + history/audit + outbox transaction.

## Existing app observation

`04-nestjs-api-app/src/app.module.ts` registers identity, company, candidate, resume, and guest modules but no jobs or search module. `src/guest.ts` checks guest applications for `status = 'published'` and `deleted_at IS NULL`; its visible query does not check `expires_at > NOW()`. Reconcile this with the frozen unexpired-job policy before jobs/search or guest application behavior is considered complete. This review makes no code changes.

