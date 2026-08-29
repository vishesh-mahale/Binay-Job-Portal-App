# Jobs/Search — Final Cross-Review of Three Agent Reports

Date: 2026-08-27

## Final verdict

Jobs/Search public coding ke liye abhi `NO-GO` hai. Freebuf aur Opencode ka cautious conclusion
repository evidence se match karta hai. Antigravity ne useful candidate routes diye, lekin un routes
ko `SUPPORTED` bolna premature hai kyunki API catalog khud method/path ko `TBD` rakhta hai. Isliye
routes ko recommendation samjha jayega, final architecture nahi.

## Consensus findings

- SQL me job enum, lifecycle timestamps, approval columns, expiry column/index aur FTS/vector
  substrate available hai.
- API catalog me job and search method/path, DTOs, cursor semantics aur several permissions still TBD hain.
- `company_settings.job_approval_required` executable schema truth hai; archived `auto_approve_jobs`
  wording ke saath conflict resolve karke single authority record karni hogi.
- Expiry enum/index present hain, lekin baseline me authoritative `expire_due_jobs()` function/cron
  owner/history policy nahi hai. Search/apply dono me defensive non-expired predicate mandatory hai.
- PostgreSQL FTS first layer safe direction hai; vector/external search fallback and ranking details
  freeze hone baaki hain.
- Recruiter search company/permission boundary ke through server-side enforce hogi; projection row
  authorization ka substitute nahi hai.
- Job lifecycle/search ke liye naya event invent nahi karna. Existing `job.ai.enrichment.requested`
  ko Gate G-1 envelope reconciliation ke baad hi producer se emit karna hai.

## Agent disagreement resolved

| Topic | Antigravity | Freebuf/Opencode + Codex conclusion |
|---|---|---|
| Exact REST routes | `SUPPORTED` | Catalog says `TBD` |
| Approval behavior | Direct recommendation | SQL vs archived decision conflict |
| Expiry owner | NestJS endpoint recommendation | Owner still unresolved; archived pg_cron is not executable baseline |
| Cursor max/default | 50/20 recommendation | Not source-frozen; human decision required |
| Visibility | `is_open_to_work` recommendation | Policy scope still needs decision |
| Missing DB objects | Implied implementation | Must not add until schema/decision gate approves |

## Decisions required before implementation

1. Exact job routes, DTOs and named lifecycle commands.
2. Role/permission matrix including owner, admin, HR, employer and hiring manager.
3. Approval setting authority, default, reviewer, rejection/resubmission behavior.
4. One expiry sweeper owner and atomic history/audit/outbox/notification policy.
5. Search ranking formula, fallback, tie-break and explanation fields.
6. Signed cursor format, filter binding, page size, expiry and error code.
7. Candidate visibility and stale projection behavior.
8. Job AI envelope/trigger timing and analytics/impression policy.

## Additional implementation gaps to track

- No baseline job-status transition guard or job-status-history table was found; decide whether these
  are required before modifying SQL.
- No baseline `expire_due_jobs()` function/pg_cron schedule was found.
- Candidate projection FTS freshness/population path must be verified before recruiter search coding.
- Saved-jobs table exists but has no dedicated requirement/API decision.
- Guest application expiry guard has been added in the current NestJS code.

## Safe next order

1. Record the eight decisions above in the API catalog/decision log.
2. Reconcile Gate G-1 and the job AI contract.
3. Only then implement/test private bounded PostgreSQL FTS adapters.
4. Implement job lifecycle commands with approved lock order and atomic business + history/audit +
   outbox transaction.
5. Add controllers and integration/concurrency tests.

`NO-GO FOR PUBLIC JOBS/SEARCH CODING UNTIL DECISIONS ARE FROZEN`
