# Owner-recipient fix review

## Verdict

The revised predicate is syntactically correct and fixes the prior valid-owner omission: an active, non-deleted creator is now eligible when they are either the company owner or an active company member with `left_at IS NULL`. The `OR` branches are correctly correlated to `v_job.company_id` and `u.id`, and the user-level active/deleted checks remain in force.

## Remaining correctness/security note

The owner branch now checks both `c.is_active = TRUE` and `c.deleted_at IS NULL`:

```sql
WHERE c.id = v_job.company_id
  AND c.owner_id = u.id
  AND c.is_active = TRUE
  AND c.deleted_at IS NULL
```

The repository’s canonical `is_company_member` helper requires both an active company and `deleted_at IS NULL` (`17_rls.sql:20-34`). The predicate is now aligned with that helper; no remaining owner-branch concern exists.

The member branch now correctly checks both `cm.is_active` and `cm.left_at IS NULL`, matching the helper semantics. No privilege escalation is introduced by the owner check: the function still has no browser-role execute grant, and the creator-only notification remains limited to the job’s own creator. Existing unresolved concerns—scheduler invocation role, direct notification contract/template flow, and batch/transaction observability—are unaffected by this predicate change.

## Recommendation

Accept the owner/member predicate. Add tests for active owner without membership row, inactive company owner, active member, departed member, deleted/inactive creator, and creator from another company.
