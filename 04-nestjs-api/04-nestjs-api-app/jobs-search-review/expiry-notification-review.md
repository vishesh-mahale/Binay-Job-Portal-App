# Expiry-notification decision review

Reviewer: Codex (independent revalidation)
Date: 2026-08-27
Source reviewed: `EXPIRY-NOTIFICATION-DECISION.md`

## Verdict

The decision document correctly identifies a real blocker: `notifications.user_id` is mandatory,
while the approved expiry decision requires an in-app notification row. Neither the jobs schema,
requirements, nor the approved expiry policy freezes who receives that row. The recipient options
must remain `NEEDS_DECISION`; no SQL function should guess among creator, hiring manager, owner/admin,
or a multi-recipient fan-out.

## Source-supported facts

- `jobs.created_by` is mandatory; `hiring_manager_id` is nullable (`05_jobs.sql`, job columns
  around lines 101–106).
- `company_id` is mandatory, but owner/admin recipients require a company-membership/owner lookup;
  the jobs row itself does not identify an admin recipient.
- `notifications.user_id` is mandatory, while `company_id`, `entity_type`, and `entity_id` are
  available (`12_notifications.sql`, lines 143–153).
- Notification identity is globally unique on `idempotency_key` and the notification identity is
  immutable after creation (`12_notifications.sql`, lines 143–146 and 349–381).
- `REQ-NOTIFY-001` requires relevant employer events to notify users, but does not specify expiry
  recipient selection. Email/provider behavior remains deferred; current scope is in-app.
- Approved `DECISION-07-JOBS-SEARCH-FINAL.md` / archived expiry policy selects an atomic expiry
  transition plus in-app row, but does not add recipient semantics.

## Recipient recommendation

### Recommended minimum policy: creator-only, pending explicit product approval

If one deterministic policy must be selected, use the job creator (`jobs.created_by`) as the sole
recipient. This is the only candidate in the proposed list guaranteed non-null by the jobs schema,
requires no ambiguous “which admin?” selection, and naturally represents the employer actor who
created the posting. Use `hiring_manager_id` only if a later approved policy explicitly chooses
manager notification; it is nullable. Do not silently add owner/admin fan-out: membership changes,
multiple admins, inactive members, and duplicate delivery semantics are not defined.

This is a recommendation, not a frozen repository decision. Approval must state whether creator-only
is intended and whether creator notification still applies when the creator is no longer active or
has left the company.

### Alternative multi-recipient policy: not currently safe to implement

Creator + hiring manager + owner/admin would require a deduplication rule, stable recipient query,
authorization/tenant policy, and one notification row per recipient. None is specified. It also
cannot use a single job-only idempotency key because the column is globally unique and each row has a
different mandatory `user_id`.

## Idempotency recommendation

The proposed example `job-expired:<job_id>:<expiry_date>` is adequate only for a single recipient
and assumes an expiry date normalization that is not defined. If multiple recipients are approved,
that key would collide and suppress legitimate recipient rows. Recommend a deterministic key scoped
to the event, job, and recipient, for example:

```text
job-expired:v1:<job_id>:<recipient_user_id>
```

The exact string remains a decision/contract detail. It should be derived from the stable job UUID
and recipient UUID, not a localized date, and inserted with `ON CONFLICT (idempotency_key) DO NOTHING`
or equivalent idempotent behavior. Re-running `expire_due_jobs()` after a partial failure must not
create a second notification for the same job/recipient. If the job can somehow transition to
expired more than once, the job-history/event identity must also remain stable; the normal transition
guard should make the state transition one-time.

## Fields still requiring approval

The notification schema requires `title`, `event_type`, and `idempotency_key`; it permits but does
not require `template_id`, entity references, category, action URL, priority, and channel JSON. The
following must be approved before the expiry function inserts rows:

- event type and category for expiry;
- title/body or approved template/version;
- `entity_type = 'job'` and `entity_id = job.id` usage;
- action URL/type, if any;
- recipient inactive/deleted behavior;
- one row per recipient and duplicate-recipient handling;
- whether notification preferences suppress this in-app row (email preferences are not a substitute);
- audit metadata and trace/service actor fields, if recorded alongside the transition.

Do not invent a `notification.email.requested` event: Phase 05/06/08 explicitly keeps email/provider
routes deferred. The approved current behavior is an in-app notification transaction only.

## Acceptance tests to add after approval

- One due job produces exactly one notification for each approved recipient policy.
- Repeated/concurrent sweeper runs are idempotent and do not duplicate rows.
- Notification insert and `published/paused → expired` transition commit or roll back together.
- Multiple recipients (if approved) receive independent keys and cannot collide.
- Recipient deletion/inactivation follows the explicitly approved policy.
- Search/apply expiry guards remain independent of notification creation and continue to hide due
  jobs before the daily sweep.

## Gate

Status: `EXPIRY NOTIFICATION RECIPIENT — NEEDS_DECISION`.

The safest pre-approval work is schema/function design and tests that leave the notification insert
behind an explicit recipient-policy gate. Once creator-only (or another policy) is approved, sync
Decision-07, the notification contract/catalog, and the reviewed SQL migration before enabling
`expire_due_jobs()` in pg_cron.

