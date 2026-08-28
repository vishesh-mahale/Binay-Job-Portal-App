# Job Expiry Notification — Remaining Decision

`notifications.user_id` mandatory hai, isliye `expire_due_jobs()` implement karne se pehle exact
recipient policy freeze karni hogi. Current repository job expiry transition batata hai, lekin expired
job notification kis user ko milegi ye executable SQL me defined nahi hai.

Archived notification reviews sirf itna specify karte hain ki **HR ko dashboard alert** milega; exact
HR recipient resolution (creator, hiring manager, owner/admin ya multiple) define nahi hai.

## Decision required

Choose one approved recipient rule:

1. Job creator (`jobs.created_by`)
2. Hiring manager (`jobs.hiring_manager_id`) when present, otherwise creator
3. Company owner/admin recipients
4. Multiple recipients (creator + hiring manager + owner/admin)

Also freeze:

- idempotency key format, e.g. `job-expired:<job_id>:<expiry_date>`
- event/category/title/body/action URL fields
- behavior when recipient user is deleted/inactive
- whether one notification per recipient is required

Until this is decided, expiry status transition and notification insert ko production-ready claim nahi
kiya jayega. Search/apply ka defensive `expires_at` predicate independent rahega.
