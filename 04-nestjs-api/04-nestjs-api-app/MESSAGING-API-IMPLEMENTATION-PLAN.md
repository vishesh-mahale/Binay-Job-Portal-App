# Messaging API — Implementation Plan

**Status:** `PLAN DRAFT — ROUTE AND CHAT POLICY FREEZE REQUIRED`

## Verified database scope

`11_messaging.sql` owns conversations, participants, messages, attachments, read receipts and
reactions. Database triggers validate conversation context, sender identity, participant actions,
attachment ownership/scan state and soft-delete lifecycle.

## Proposed API surface

```text
GET  /api/v1/conversations
GET  /api/v1/conversations/:conversationId/messages
POST /api/v1/conversations/:conversationId/messages
POST /api/v1/messages/:messageId/read
```

Exact paths and whether reactions/attachments are included in the first implementation need catalog
freeze.

## Required rules

- Only active conversation participants may read or send.
- Application/interview conversation context must remain within the same company/application scope.
- Sender identity comes from JWT, never request body.
- Message insert and delivery/read metadata are transactional; realtime publish happens after commit.
- Attachments reference already uploaded, clean documents; raw bytes are handled by storage flow.
- Client message idempotency is not currently persisted in baseline; do not advertise exactly-once
  semantics without a reviewed schema change.
- SSE/WebSocket event delivery is a projection of committed data; reconnect uses REST cursor recovery.

## Tests

- Participant and cross-conversation authorization.
- Sender spoofing rejection.
- Message content/attachment validation.
- Read receipt and reaction membership checks.
- Concurrent sends preserve ordering/counters.
- Reconnect recovery returns messages after the last acknowledged cursor.
