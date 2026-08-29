# In-App Notification API — Implementation Plan

**Status:** `PLAN DRAFT — EVENT CONSUMER OWNERSHIP REQUIRED`

## Verified scope

`12_notifications.sql` provides durable `notifications`, user preferences, delivery logs and
template lifecycle. The notification row is the source of truth; SSE/WebSocket only pushes a
post-commit hint to an online user. Offline users read the same rows later.

## Proposed user APIs

```text
GET   /api/v1/me/notifications
PATCH /api/v1/me/notifications/:notificationId/read
PATCH /api/v1/me/notifications/read-all
```

Exact acknowledgement method and unread-count response shape need catalog freeze.

## Processing boundary

- Approved domain event/consumer resolves recipient and preference policy, then inserts one
  idempotent `notifications` row.
- NestJS realtime gateway publishes only after the insert transaction commits.
- The gateway never becomes the durable store and never sends email in the current in-app scope.
- Future email delivery remains a separate channel/contract; do not add an unapproved dispatcher route.

## Security and tests

- JWT-derived user can read/acknowledge only its own notifications.
- Notification identity and soft-delete triggers remain authoritative.
- Duplicate event delivery must not create duplicate notification rows (use the baseline
  idempotency key contract).
- Test offline read-after-reconnect, unread count, cross-user access denial and post-commit push.
