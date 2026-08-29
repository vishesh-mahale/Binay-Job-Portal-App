# Decision 05 - Job Approval and Conditional Direct Publish

**Status:** APPROVED / FROZEN - policy decision

## Final decision

```text
auto_approve_jobs = true (default)
    draft -> published

auto_approve_jobs = false
    draft -> pending_approval -> published
```

Company owner ya authorized platform admin `companies.settings.auto_approve_jobs`
ko enable/disable kar sakta hai. Default `true` hai, isliye normal case mein job
direct publish hogi. Setting `false` hone par approval workflow mandatory hoga.

Direct publish ke liye NestJS ko authenticated active company member, approved
job-publish permission, active/eligible company, complete job validation aur
ownership boundary verify karni hogi. Setting direct permission ka replacement nahi hai.

Setting disabled hone par authorized HR job submit karega aur owner/admin approval
ke baad job publish hogi. `pending_approval -> draft` correction ke liye allowed रहेगा.

`closed`, `expired`, `archived` terminal job states honge; terminal job reopen nahi
hogi. Repost par naya `job_id` बनेगा.

## Still open

- Exact permission key/catalog mapping
- Platform admin exceptional moderation scope
- Job status history representation
- Job status event contract and realtime notification behavior
