# Jobs/Search — Consolidated Go/No-Go Decision

> Superseded status: the previously recorded no-go has been resolved by approved Decision 07.
> See `DECISION-07-JOBS-SEARCH-FINAL.md` for the active authority.

Date: 2026-08-27

## Final verdict

Jobs/Search business endpoint coding abhi start nahi karni chahiye. Dono independent reviews ka
evidence-based conclusion same hai: SQL foundation available hai, lekin public routes, DTOs aur
important lifecycle/search policies abhi freeze nahi hui hain. Abhi coding karna route ya behavior
invent karna hoga, jo project rules ke khilaaf hai.

## Jo current sources se confirmed hai

- Job statuses: `draft`, `pending_approval`, `published`, `paused`, `closed`, `expired`, `archived`.
- `company_settings.job_approval_required` authoritative-looking setting hai; `auto_approve_jobs`
  sirf example/documented key hai, isliye precedence abhi decide nahi.
- `jobs.expires_at` aur published-job expiry index available hain, lekin authoritative sweeper,
  transition function, history/audit/outbox side-effects frozen nahi hain.
- PostgreSQL filters + FTS current search direction hai; pgvector compatible mode baad mein, external
  search future ADR ke baad.
- Recruiter search service-side tenant/permission checks ke through chalegi; projection row khud
  authorization proof nahi hai.
- Saved candidates recruiter+candidate private, non-job-specific aur unique hain.
- Approved job AI event `job.ai.enrichment.requested` hai; lifecycle/search ke naye events invent nahi
  kiye jayenge. `application.submitted` ko job event ke roop mein reuse nahi karna.

## Decisions required before implementation

| ID | Decision | Freeze kya karna hai |
|---|---|---|
| J1 | Job API surface | Exact routes, resource CRUD, named lifecycle commands; arbitrary status PATCH nahi |
| J2 | Permissions | Owner/admin, HR/employer roles, company membership aur approval authority |
| J3 | Approval | `job_approval_required` default/precedence, auto-approve behavior, rejection reason, resubmit |
| J4 | Expiry | Single sweeper owner, `published -> expired` atomic update, audit/history/event policy; search me `expires_at > NOW()` guard |
| J5 | Ranking | PostgreSQL FTS/filter first, vector compatibility/fallback, score/tie-break/explanation |
| J6 | Pagination | Opaque signed cursor, filter binding, max page size, expiry, invalid-cursor error |
| J7 | Visibility/freshness | Public/recruiter candidate scope, stale projection handling, returned fields, saved flag placement |
| J8 | Contracts/analytics | Job AI trigger timing/envelope; lifecycle/search/view events only when separately approved |
| J9 | Tests | Tenant/role negatives, lifecycle concurrency, expiry exclusion, cursor stability, FTS/vector fallback, outbox atomicity |

## Important existing gap

Guest application query currently checks published/deleted job but visibly does not check
`expires_at > NOW()`. This must be reconciled with the approved unexpired-job rule before the guest
application path is considered complete.

## Safe next order

1. Record J1–J8 in the decision/API-catalog documents.
2. Reconcile Gate G-1 and the `job.ai.enrichment.requested` envelope.
3. Add/test a private bounded PostgreSQL FTS adapter only after query DTO/cursor semantics are frozen.
4. Implement job lifecycle commands with approved lock order and business+history/audit+outbox transaction.
5. Add controllers and full integration tests only after the above gates pass.

## Go/no-go

`NO-GO FOR JOBS/SEARCH PUBLIC ENDPOINT CODING` until J1–J8 are explicitly decided and documented.
Foundation and already implemented candidate/resume work remain unaffected.
