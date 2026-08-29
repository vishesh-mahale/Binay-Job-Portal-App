# Adversarial audit: EXPIRY-NOTIFICATION-DECISION

## Verdict

The decision correctly identifies a blocker: `notifications.user_id` is mandatory, while the job-expiry baseline defines no recipient policy. None of the four options is currently source-approved as the required recipient. The columns make options technically possible (`jobs.created_by`, nullable `hiring_manager_id`, and `companies.owner_id`), but existence of a foreign key is not product authorization to notify that person. Do not implement notification insertion until a human approves the recipient, event/template, privacy, and durable idempotency rules.

## Option audit

| Option | Repository support | Unresolved risk |
|---|---|---|
| Creator | `jobs.created_by` is required (`05_jobs.sql:101`); this is the strongest deterministic candidate. | Creator may be inactive/deleted/left company; notification may disclose job details after membership loss. Need active-account/tenant check and fallback/skip policy. |
| Hiring manager fallback creator | `hiring_manager_id` exists but is nullable (`05_jobs.sql:102-106`). | Hiring-manager role is not frozen as a notification recipient; manager may not have company membership or may be removed. Fallback can cause duplicate/ambiguous ownership. |
| Company owner/admin | `companies.owner_id` exists (`04_companies.sql:80`), but “admin recipients” has no company-scoped recipient relation in the cited schema. | Platform admins are not automatically entitled to every company’s job data. Owner transfer/deactivation and tenant privacy need explicit rules. |
| Multiple recipients | All candidate foreign keys can be joined. | Recipient fan-out, duplicate identities (creator = owner = manager), cross-tenant leakage, preference evaluation, and per-recipient idempotency are unspecified. |

The documented requirements establish job write ownership and owner/HR authorization, but do not say who receives expiry notifications. Notification SQL describes a durable row and worker/template/preferences flow, not an expiry audience (`12_notifications.sql:10-14, 140-216`). Therefore the decision must remain `NEEDS_DECISION`, not be inferred from the schema.

## Privacy and tenant risks

- A notification row has `user_id` and optional `company_id`; every insert must verify the recipient belongs to the same active company at notification time and must not turn a platform-admin role into an unlogged global bypass.
- Do not include confidential job description, candidate data, internal compensation, storage paths, or raw AI content in title/body/action URL. `is_confidential` is documented as hiding the company identity, so even a legitimate recipient policy must specify the minimum safe fields.
- If a creator/manager leaves after publishing, retaining a notification to that account may be inappropriate; deletion/inactive behavior must be deterministic (skip, owner fallback, or audit-only), and must not silently notify an unrelated user.
- Owner transfer between expiry and sweep creates a race. Define whether recipient is resolved from the locked job/company row at sweep time or snapshotted at publish time.
- Public search/apply exclusion is independent and must continue to enforce `expires_at IS NULL OR expires_at > NOW()`; no notification decision may delay expiry visibility.

## Idempotency and transaction risks

`notifications.idempotency_key` is globally unique and nonblank (`12_notifications.sql:145, 197-199`). A key such as `job-expired:<job_id>:<expiry_date>` is sufficient only for one notification per job globally. For multiple recipients it must include a canonical recipient ID (and preferably a stable event/transition identifier), e.g. `job-expired:<job_id>:<transition-id>:<user_id>`. Do not key solely on wall-clock sweep time or mutable `expires_at` if the expiry date can be edited before transition.

The expiry update and the “already notified” decision must be atomic or backed by the unique key/`ON CONFLICT` behavior. Concurrent sweepers must not produce duplicate rows or conflicting status transitions. If the documented architecture is followed, prefer an atomic job state update plus approved outbox event and let the notification worker resolve preferences/templates; direct SQL insertion from `expire_due_jobs()` requires explicit function ownership, template selection, and tests.

The proposed event/category/title/body/action URL fields are not frozen. Existing notification templates are keyed by `event_type`, and template activation/version rules apply (`12_notifications.sql:29-83, 294-347`). Freeze a versioned event/template before SQL references it; never insert a guessed template ID or event string.

## Human approval required before SQL

1. Select one recipient rule and explicitly define active-membership, deleted/inactive-account, owner-transfer, and hiring-manager-null behavior.
2. Decide whether “admin” means company owner only or a separately enumerated company-scoped administrative membership; platform admin access must be exceptional and audited.
3. Decide one-per-recipient versus one-per-job semantics and approve an immutable transition/event identifier for idempotency. Confirm deduplication when roles collapse to the same user.
4. Freeze event type, template/version, locale/fallback, safe title/body variables, action URL, company_id, priority, and notification preference behavior.
5. Choose direct function insertion versus outbox-to-notification-worker, including transaction boundary, permissions, `search_path`, retry/failed-run handling, and concurrency tests.
6. Approve the retention/read visibility policy for expiry notifications and audit rows.

## Go/no-go

Expiry state transition may be designed/tested with notification insertion disabled. Production SQL implementing notification creation is blocked until items 1–6 are recorded in the decision log and catalog, then validated with concurrent sweeper, duplicate-recipient, membership-change, inactive-user, tenant-isolation, and rollback tests.
