# Review of proposed Jobs/Search decisions

Reviewer: Codex (independent revalidation)
Date: 2026-08-27
Input reviewed: `CODEX-PROPOSED-DECISIONS-FOR-APPROVAL.md`

## Overall verdict

Do not mark J1–J8 fully supported or implementation-ready. The proposal is useful as an approval
sheet, but several rows turn catalog `TBD` items into concrete routes, defaults, cursor mechanics,
ranking fields, or freshness behavior without an approved source. J3 also conflicts with both the
executable SQL default and the archived approved job-approval decision. J4 is substantially
consistent with the archived expiry decision, but its proposed wording is less precise than that
decision. Keep unsupported elements explicitly `NEEDS_DECISION` until the user approves them and
the catalog/decision log is synchronized.

## Decision-by-decision findings

### J1 — Company-nested resource and named commands: `NEEDS_DECISION`

Named lifecycle commands are compatible with the job-state enum and the Phase 08 lifecycle command
boundary, and barring arbitrary status PATCH is a sound safety rule. However, the proposed
company-nested route shape and exact paths are not repository-supported: `API-JOB-001` explicitly
states `Method/path: TBD` (`PHASE-06-API-CATALOG.md`, around lines 391–410). The proposal also adds
`close` and omits an explicit approval/submit command despite `pending_approval` being an enum
state. Preserve the named-command recommendation as a candidate shape only; route list and command
coverage need approval.

### J2 — Permissions: partially supported, not fully supported

The catalog supports an active company member plus job-management permission and says authorized
employer/HR for the job command. It does not freeze the exact role-to-permission mapping or grant
hiring-manager rights. Therefore “owner/admin/HR/employer” may be a recommendation, not a final
rule. The tenant boundary is supported; choose 404 versus 403 only if the public error policy
approves it.

### J3 — Approval setting/default: conflict; `NEEDS_DECISION`

Using `company_settings.job_approval_required` as the physical setting is supported by
`02-database/migrations/baseline/04_companies.sql` (column default `true`). But the proposal’s
default `false` (direct publish) conflicts with that executable default. It also conflicts with
the archived approved/frozen `DECISION-05-JOB-APPROVAL-AND-DIRECT-PUBLISH-HINGLISH.md`, which says
`auto_approve_jobs = true` by default and direct publish in the normal case. The naming semantics
are opposite, so this cannot be resolved by a silent rename. The proposal correctly identifies
the conflict, but must not call `false` a product direction unless a new approval explicitly
overrides the archived decision and a migration/default change is approved.

The proposed “owner/admin can change” rule and rejection/resubmission semantics are also not
frozen in the current Phase 06 catalog. Keep them as open approval questions.

### J4 — Daily pg_cron expiry: mostly aligned, but preserve source detail

The archived approved expiry decision specifies Supabase `pg_cron`, daily `12:05 AM
Asia/Kolkata`, an atomic `expire_due_jobs()` function, `published/paused → expired`, an in-app
notification row, and candidate/apply guard `(expires_at IS NULL OR expires_at > NOW())`.
Accordingly, this proposal is directionally supported and does not need a Cloud Scheduler,
NestJS cron, Cloud Tasks, or Dispatcher route. However, the executable baseline currently has the
`expires_at` column/index but no expiry function, schedule, status-history mechanism, or notification
implementation. Those are forward SQL/implementation changes requiring separate review. The row
must retain the exact approved policy (including paused jobs and notification scope), not leave the
time/scope vague as “fixed agreed time.”

### J5 — FTS/vector/ranking: partially supported; ranking is unsupported

PostgreSQL FTS first and external search deferred are supported by `PHASE-08-IMPLEMENTATION-PLAN.md`
(`GAP-010`) and the `jobs.search_vector` GIN index in `05_jobs.sql`. Candidate projection also has
FTS and HNSW vector indexes in `08_candidates.sql`. “Vector later” is therefore a reasonable
phasing recommendation. Lexical fallback on vector model mismatch, `ts_rank_cd`, the exact
relational filter set, deterministic tie-break fields, and explainable-label response shape are
not frozen by these sources. Keep those as `NEEDS_DECISION`; do not add them to the catalog as
approved behavior.

### J6 — Signed cursor and page sizes: unsupported proposal details

The catalog requires bounded pagination and cursor/next-page metadata, but does not specify a
signed base64url JSON format, fields, default/max values, cursor TTL, or filter-hash algorithm.
Additionally, `CURSOR_INVALID` is explicitly not a public error code in Phase 06 common rules and
`PHASE-06-REMAINING-DECISIONS.md`; mapping it to `INVALID_CURSOR` is itself a new vocabulary
decision. Treat the opaque signed cursor and suggested 20/50 limits as design options only.

### J7 — Visibility and stale projection: partially supported; `is_stale` unsupported

Public search visibility (published, non-deleted, non-expired) is supported by the catalog and
archived expiry decision. Recruiter search must enforce active company membership and approved
candidate visibility policy; the actual policy remains open. SQL has `candidate_profiles.is_open_to_work`
and projection freshness fields/indexes, but no source makes `is_open_to_work` the complete recruiter
authorization rule. The proposal is correct not to use it as the sole proof. Conversely, an
`is_stale` response field is not present in the catalog or schema and must remain a proposed DTO
addition pending approval. Saved-candidate state is separately cataloged; do not assume an endpoint
or joined field from this proposal.

### J8 — Enrichment event and analytics: partially supported; trigger condition too narrow

Using the existing `job.ai.enrichment.requested` contract and Gate G-1 is supported. Atomic outbox
creation and dispatcher registry authority are also supported. But the catalog says the event is
emitted “when approved fields require enrichment,” while the contract allows `created`, `updated`,
and `reparsed` triggers. The proposal’s “only approved publish/enrichment point” must not suppress
approved create/update/reparse behavior without a new decision. No job lifecycle event may be
invented, and search itself has no outbox event; job impressions/analytics remain a separately
cataloged requirement using the SQL `job_views` structures.

## Missing decisions to add before approval

- Whether the archived Decision-05 policy is superseded, and the exact semantic mapping between
  `auto_approve_jobs` and `job_approval_required`.
- Exact job route/DTO catalog, including submit-for-approval/approve and terminal-state behavior.
- Role/permission matrix, including hiring manager and platform-admin exceptions.
- Job status history representation and any required forward migration.
- Exact expiry function ownership/permissions, failure monitoring, and notification atomicity.
- Recruiter candidate visibility policy and projection freshness contract.
- Cursor schema, signing/expiry/filter binding, page limits, and approved error code.
- Ranking formula/tie-break and any vector mismatch fallback.
- Exact event trigger semantics and Gate G-1 envelope producer freeze.

## Gate recommendation

The proposed implementation gate is correct in spirit: synchronize approved decisions into the
catalog first, then review SQL/contracts, then private query work, then controllers/tests. Until
the conflicts above are resolved, the status should be `APPROVAL PENDING — PUBLIC JOBS/SEARCH
CODING NOT AUTHORIZED`, not “J1–J8 fully supported.”

