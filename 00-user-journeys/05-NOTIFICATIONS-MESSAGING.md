# Notifications and Messaging Journey

## In-app notification

`Business event → notification processing → notifications row → SSE nudge → Next.js header`

If user offline:

`notifications row remains durable → user opens app → REST recovery/list API → header displays unread item`

## Messaging

`Authorized participant → WebSocket message flow → durable message record → missed-message recovery`

Participant authorization, cursor/reconnect behavior, attachments and idempotency
must be defined by the approved realtime and messaging contracts.

## Current status

09-F notification APIs, SSE recovery and WebSocket chat implementation remain
pending.

## References

- `04-nestjs-api/IMPLEMENTATION-TRACKER-HINGLISH.md`
- `contracts/`
- relevant realtime ADR/decision documents
