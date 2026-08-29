# Decision 02 - Realtime Transport and Recovery

**Status:** APPROVED / FROZEN - corrected use-case-wise transport split

## 1. Core rule

Realtime delivery sirf UI optimization hai. Durable truth PostgreSQL rows aur histories hain. Har stream ke saath NestJS REST read/recovery path mandatory hai.

## 2. Final transport decision

| Use case | Primary transport | Recovery/source of truth |
|---|---|---|
| Resume parsing/progress | SSE, single authenticated user stream | NestJS status/timeline read; `resume_parsing_jobs` and job events |
| Candidate projection/embedding | SSE lightweight nudge; dedicated stream unnecessary | Projection status/revision read; `candidate_profiles` + `candidate_search_profiles` |
| Job AI processing | SSE lightweight nudge | Job AI/enrichment status read; PostgreSQL job state |
| Application status | SSE nudge/status update | Application detail/history read; `job_applications` + history |
| In-app notifications | Same per-user SSE stream | Notifications inbox/unread read |
| HR-Candidate chat | WebSocket per conversation | REST message history/cursor; `messages` and participant/read-receipt rows |
| Interview updates | SSE nudge/status update | Interview detail/status read |

One-way status ke liye WebSocket nahi use hoga. Chat ke liye SSE nahi use hoga.

## 3. Supabase Realtime/Broadcast

Initial browser-facing primary transport ke रूप mein Supabase Realtime/Broadcast use nahi hoga.

- NestJS client-facing realtime authorization boundary रहेगा.
- Direct browser Postgres Changes subscriptions business tables पर नहीं होंगी.
- Future multi-instance fan-out/scaling need prove होने पर अलग ADR में sanitized internal Broadcast bridge evaluate होगा.

## 4. Authentication and authorization

- REST: every request carries user JWT; NestJS verifies authentication, status, role, tenant and ownership.
- SSE: authenticated short-lived ticket/secure cookie/fetch-based JWT mechanism; long-lived JWT query string में नहीं जाएगा. Stream user-scoped होगा.
- WebSocket: authenticated handshake JWT/ticket; conversation join और sensitive actions पर active participant/tenant authorization दोबारा check होगी.
- Browser को service-role/trusted credential कभी नहीं मिलेगा.

## 5. Reconnect and recovery

```text
SSE/WS disconnect
  -> exponential reconnect with jitter
  -> authenticate again
  -> REST authoritative state/history fetch
  -> stream resume
```

`Last-Event-ID`, event IDs और revisions duplicate/out-of-order handling में मदद कर सकते हैं, लेकिन correctness in-memory replay पर depend नहीं करेगी. Missed status event होने पर REST current state recover करेगा. Chat में durable message cursor से gap fetch होगा.

## 6. Event payload and delivery rules

- Realtime event lightweight sanitized nudge/reference होगा; raw resume text, secrets, signed URLs या unnecessary PII नहीं.
- Durable state change पहले database transaction में commit होगा; realtime push बाद में होगा.
- Event IDs/revisions client deduplication और stale update rejection में use होंगे.
- Realtime failure business command या database transaction को fail नहीं कराएगा.
- Realtime disabled होने पर page-scoped controlled polling/manual refresh fallback रहेगा.

## 7. Chat boundary

WebSocket live message delivery, acknowledgements/read-receipt fan-out और future ephemeral typing/presence के लिए है. Durable message write NestJS authorization और normal database transaction/service path से होगी; WebSocket business security bypass नहीं करेगा.

## 8. Module boundary (implementation guidance)

एक NestJS `RealtimeModule` में अलग adapters होंगे:

```text
RealtimeModule
  - transport-neutral fan-out/event serializer
  - SSE controller/connection service
  - WebSocket chat gateway
  - realtime authorization service
```

Exact HTTP paths, DTOs, ticket storage और shared multi-instance fan-out implementation API catalog/implementation plan में freeze होंगे; इस decision में invent नहीं किए गए हैं.

## 9. Acceptance tests

1. Invalid/expired REST, SSE and WebSocket authentication rejects.
2. User A never receives User B or another company’s events.
3. Non-participant cannot join a conversation.
4. Database rollback produces no realtime notification.
5. Reconnect recovers current REST state/history.
6. Duplicate/stale events are ignored safely.
7. Realtime outage does not break REST business operations.
8. Chat gap recovery returns all missed durable messages in order.

**GAP-002 and GAP-011:** Resolved by this decision. Exact endpoints/DTOs remain API-catalog work.
