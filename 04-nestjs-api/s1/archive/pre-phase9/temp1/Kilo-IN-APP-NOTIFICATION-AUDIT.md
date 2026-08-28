# In-App Notification Architecture — Independent Audit Report

**File:** `04-nestjs-api/04-nestjs-api-app/temp1/Kilo-IN-APP-NOTIFICATION-AUDIT.md`  
**Date:** 2026-08-24  
**Auditor:** Kilo  
**Verdict:** ⚠️ **NEEDS_DECISION — Option A is sufficient for Phase 1; Option B is overengineering for in-app notifications**

---

## Executive Summary

The requirement document correctly identifies the core need: **header badge/list updates for in-app notifications**. However, it presents two options (A: direct NestJS; B: Outbox Dispatcher + Cloud Tasks) without clearly distinguishing between **actual requirements** and **optional reliability hardening**.

**Key finding:** For in-app notifications, **Option A (Direct NestJS)** is sufficient and matches the repository's architecture. Option B is **overengineering** for this use case.

The job-expiry flow described in the document is **correct and final** — it uses `pg_cron` + PostgreSQL function directly, bypassing the Outbox Dispatcher entirely. This is the right pattern for scheduled/system-generated notifications.

---

## 1. Actual Requirements vs Optional Hardening vs Overengineering

### Actual Requirements (Must Have)

| # | Requirement | Evidence |
|---|---|---|
| R-1 | Active user sees live header badge/list update | `PRODUCT-REQUIREMENTS.md` §12; requirement doc §1 |
| R-2 | Offline user sees unread notifications on login | Requirement doc §1 |
| R-3 | Notifications durable in DB (notifications table) | `12_notifications.sql` lines 143-200 |
| R-4 | Idempotent notification creation | `12_notifications.sql` line 145: `idempotency_key VARCHAR(255) NOT NULL UNIQUE` |
| R-5 | Reconnect recovery from DB | Requirement doc §4; NESTJS-IMPLEMENTATION-GUIDE §9 |
| R-6 | Job-expiry notifications via pg_cron | Requirement doc §3; `12_notifications.sql` runtime flow |

### Optional Reliability Hardening (Nice to Have)

| # | Pattern | When to Add | Evidence |
|---|---|---|---|
| H-1 | Realtime transport for active users | Phase 1 | Requirement doc §4 |
| H-2 | Unread count badge | Phase 1 | Requirement doc §1 |
| H-3 | Notification grouping/stacking | Phase 2 | `12_notifications.sql` lines 188-190 |
| H-4 | Quiet hours / preferences | Phase 2 | `12_notifications.sql` lines 109-131 |
| H-5 | Email/push/SMS channels | Future | `12_notifications.sql` lines 172-175 |

### Overengineering (Do Not Add for In-App Notifications)

| # | Pattern | Why Overengineering | Evidence |
|---|---|---|---|
| O-1 | Outbox Dispatcher for in-app notifications | Adds latency, complexity, and failure surface for no benefit. Notifications are not AI work. | Requirement doc §5 explicitly questions this |
| O-2 | Cloud Tasks queue for notifications | Unnecessary queue hop. NestJS can write to notifications table directly in the same transaction. | `12_notifications.sql` runtime flow shows "domain transaction + outbox event → notification worker/NestJS inserts notification" |
| O-3 | Separate Notification Consumer worker | No AI/parsing/embedding work. NestJS is already the notification worker. | `12_notifications.sql` line 12: "notification worker/NestJS" |
| O-4 | `notification-queue` for in-app | Queue is provision-only (event-route.registry.ts line 32). No handler exists. | `05-outbox-dispatcher-nestjs/src/routing/event-route.registry.ts` |

---

## 2. Use Case Analysis

### 2.1 Resume Parsing/Progress Update

**Flow:**
```
NestJS business transaction
  -> resume_parsing_jobs (status: queued -> processing -> completed)
  -> optional notifications row (resume.processing.completed)
  -> COMMIT
  -> Realtime event to connected user
```

**Transport:** SSE or WebSocket for active user; DB fallback for reconnect.

**Why not Dispatcher?** Resume parsing is already handled by Cloud Tasks → FastAPI worker. The worker writes `resume_parsed_data` and optionally emits a chained outbox event. Adding a notification-specific outbox event → dispatcher → Cloud Tasks → NestJS consumer would add:
- One more queue hop
- One more Cloud Tasks create/delete
- One more worker endpoint
- All for a simple "insert row + send realtime event" operation

**Recommendation:** FastAPI worker (or NestJS after commit) inserts notification directly. No Dispatcher needed.

### 2.2 Candidate Profile Projection/Embedding Update

**Flow:**
```
NestJS profile save
  -> candidate_profiles + profile_change_history
  -> outbox_events(candidate.profile.changed)
  -> COMMIT
  -> Dispatcher -> Cloud Tasks -> FastAPI projection worker
  -> FastAPI writes candidate_search_profiles
  -> Optional: notifications row (profile.processing.completed)
```

**Transport:** DB-driven (notifications table). No realtime needed — projection rebuild is background.

**Why not Dispatcher for notification?** The projection worker can insert the notification directly using its trusted DB role. The worker already has `service_role` access. No need to round-trip through Dispatcher.

### 2.3 Job AI Processing Update

**Flow:**
```
NestJS job create/update
  -> jobs + outbox_events(job.ai.enrichment.requested)
  -> COMMIT
  -> Dispatcher -> Cloud Tasks -> FastAPI worker
  -> FastAPI writes job AI enrichment
  -> Optional: notifications row (job.enrichment.completed)
```

**Transport:** DB-driven. Job owner can poll status or get notification on completion.

**Why not Dispatcher for notification?** Same as above. FastAPI worker inserts notification directly.

### 2.4 Application Status Update

**Flow:**
```
NestJS status change (e.g., shortlisted)
  -> job_applications + application_status_history
  -> outbox_events(application.status.changed) — if this contract exists
  -> COMMIT
  -> notifications row for candidate
  -> Realtime event to connected candidate
```

**Transport:** SSE/WebSocket for active candidate; DB fallback for reconnect.

**Critical:** `change_application_status()` is a SECURITY DEFINER function granted only to `service_role` (`17_rls.sql` lines 228-230). NestJS must call this function in the same transaction as the notification insert.

**Why not Dispatcher?** The status change already happens in NestJS. Adding notification to the same transaction is trivial. Dispatcher would add unnecessary complexity.

### 2.5 Live Notifications (General)

**Flow:**
```
Business event in NestJS
  -> notifications row (idempotent insert)
  -> COMMIT
  -> Realtime event to connected user(s)
```

**Transport:** SSE or WebSocket.

**Why not Dispatcher?** Notifications are synchronous side effects of business transactions. They should be in the same transaction as the business event (or at least in the same NestJS request). Dispatcher is for async AI/parsing work, not for notification fan-out.

### 2.6 HR ↔ Candidate Chat

**Flow:**
```
NestJS message validation + insert
  -> messages + message_attachments
  -> conversation preview update (trigger)
  -> notifications row for recipient (message.created)
  -> COMMIT
  -> Realtime event to connected recipient
```

**Transport:** **WebSocket only** — requires two-way communication (typing indicators, read receipts, online/offline state).

**Why WebSocket?**
- Two-way: typing indicators, read receipts, presence
- Low latency: messages should appear instantly
- Persistent connection: chat sessions are long-lived

**Why not SSE?** SSE is one-way (server → client). Chat requires client → server messages.

**Why not Dispatcher?** Chat messages are not background AI work. They are immediate user-facing events.

### 2.7 Interview Updates

**Flow:**
```
NestJS schedule/reschedule/cancel
  -> interviews + interview_participants + audit
  -> notifications row for participants
  -> COMMIT
  -> Realtime event to connected participants
```

**Transport:** SSE/WebSocket for active users; DB fallback for reconnect.

**Why not Dispatcher?** Interview scheduling is a NestJS business operation. Notification is a synchronous side effect.

---

## 3. Transport Decision Matrix

| Use Case | Recommended Transport | Why | Two-Way? | Reconnect Strategy | Status Recovery API | Authorization Model | Source of Truth |
|---|---|---|---|---|---|---|---|
| **Resume parsing progress** | SSE or WebSocket | One-way status update; active user gets live push | No | GET /notifications?unread=true | `notifications` table | User JWT + RLS (read) | `notifications` table |
| **Candidate projection update** | None (DB-only) | Background rebuild; no live user waiting | No | GET /notifications?unread=true | `notifications` table | Trusted role (worker) | `notifications` table |
| **Job AI processing update** | None (DB-only) | Background AI; no live user waiting | No | GET /notifications?unread=true | `notifications` table | Trusted role (worker) | `notifications` table |
| **Application status update** | SSE or WebSocket | Active candidate/HR should see live update | No | GET /notifications?unread=true | `notifications` table | User JWT + RLS (read) | `notifications` table |
| **Live notifications (general)** | SSE or WebSocket | Header badge/list live update | No | GET /notifications?unread=true | `notifications` table | User JWT + RLS (read) | `notifications` table |
| **HR ↔ Candidate chat** | **WebSocket** | Two-way: messages, typing, presence, read receipts | Yes | GET /conversations/:id/messages | `messages` table | User JWT + RLS (read) | `messages` + `conversations` tables |
| **Interview updates** | SSE or WebSocket | Participants need live schedule changes | No | GET /notifications?unread=true | `notifications` table | User JWT + RLS (read) | `notifications` table |

---

## 4. Answers to Specific Questions

### Q1: Should SSE be used for one-way processing/status updates?

**Yes, for simple one-way status updates.** SSE is simpler than WebSocket for server-to-client streaming. However, WebSocket is acceptable if you want a single transport for all realtime needs.

**Recommendation:**
- Use **SSE** for in-app notifications (simpler, fire-and-forget, auto-reconnect)
- Use **WebSocket** for chat/messaging (requires two-way communication)

### Q2: Should WebSocket be reserved for chat/messaging?

**Yes.** WebSocket is the only transport that supports true two-way communication (typing indicators, read receipts, presence). Use it exclusively for chat.

**All other use cases:** SSE or REST fallback is sufficient.

### Q3: Should Supabase Realtime/Broadcast be primary, secondary, or not used?

**Secondary — at most.**

Supabase Realtime is useful for:
- Quick prototyping
- Apps that are already deeply integrated with Supabase

**Do NOT use Supabase Realtime as primary because:**
1. It adds a Supabase-specific dependency to your NestJS architecture
2. You lose control over authorization/tenant filtering at the application layer
3. It doesn't integrate cleanly with your existing NestJS guards/permissions
4. It's harder to test and debug than a native NestJS gateway

**Better approach:** Build a lightweight NestJS realtime gateway (SSE + WebSocket) that:
- Uses your existing auth guards
- Enforces tenant/ownership authorization
- Emits events from NestJS services after DB commit
- Falls back to REST status endpoints

### Q4: Can one NestJS realtime gateway support both SSE and WebSocket?

**Yes.** NestJS supports both transports in the same application:

```typescript
// SSE endpoint
@Get('notifications/stream')
@Sse()
streamNotifications(@Req() req: Request) {
  return this.notificationService.stream(req.user.id);
}

// WebSocket gateway
@WebSocketGateway()
chatGateway() {
  // Handle chat messages, typing, presence
}
```

**Recommendation:** Use one NestJS instance with:
- SSE for notifications (GET /notifications/stream)
- WebSocket for chat (ws://.../chat)
- REST fallback for both (GET /notifications, GET /conversations/:id/messages)

### Q5: How will reconnect work after browser/network disconnect?

**SSE reconnect:**
- Browser auto-reconnects with `Last-Event-ID` header
- NestJS tracks last delivered notification ID per user
- On reconnect, sends missed notifications since last ID
- If no `Last-Event-ID` or gap too large, returns `409 Retry-Full` → browser falls back to REST

**WebSocket reconnect:**
- Browser reconnects with auth token
- NestJS validates token, resumes stream
- Missed messages recovered via `GET /conversations/:id/messages?since=<timestamp>`
- Unread notifications recovered via `GET /notifications?unread=true`

**REST fallback (always available):**
```http
GET /notifications?unread=true&limit=50
GET /notifications/:id
GET /conversations/:id/messages?since=<timestamp>
```

### Q6: How will missed events be recovered?

**Notebook approach:**

| Transport | Recovery Mechanism |
|---|---|
| SSE | `Last-Event-ID` header → server sends missed events |
| WebSocket | `since` timestamp parameter → REST fallback |
| Offline | On login/app-open: `GET /notifications?unread=true` |
| Chat | On reconnect: `GET /conversations/:id/messages?since=<last_seen>` |

**Database is the source of truth.** Realtime is only a delivery optimization.

### Q7: Which database/API endpoint will be the authoritative status source?

**Authoritative sources:**

| Data | Authoritative Source | API Endpoint |
|---|---|---|
| Notifications list | `notifications` table | `GET /notifications?unread=true` |
| Unread count | `notifications` table (`COUNT is_read=false`) | `GET /notifications/unread-count` |
| Chat messages | `messages` table | `GET /conversations/:id/messages` |
| Conversation list | `conversations` + `conversation_participants` | `GET /conversations` |
| Resume parsing status | `resume_parsing_jobs` table | `GET /resume-parsing-jobs/:id` |
| Application status | `job_applications` table | `GET /applications/:id` |
| Interview schedule | `interviews` table | `GET /interviews/:id` |

**Rule:** No realtime event is the source of truth. All realtime events are "optimistic hints" that the UI can use for immediate updates. The UI must be able to reconstruct its state from the REST API alone.

### Q8: How will candidate/HR tenant authorization be enforced?

**For SSE/WebSocket connections:**
1. Connection requires valid JWT in query param or initial message
2. NestJS validates JWT, loads user
3. On each subscription/stream request, NestJS verifies:
   - User is active (`users.status = 'active'`)
   - User has access to the resource (candidate owns profile, HR is in company, etc.)
4. If authorization fails, connection is rejected or stream is closed

**For REST fallback:**
- Same guards as any other NestJS endpoint
- `JwtAuthGuard` → `ActiveAccountGuard` → `RolesGuard` → `OwnershipGuard`

**For notifications specifically:**
- `notifications.user_id = auth.uid()` — RLS ensures user only reads own notifications
- NestJS additionally verifies `user_id` matches authenticated user (defense-in-depth)

### Q9: How will duplicate events and out-of-order events be handled?

**Duplicate events:**
- `notifications.idempotency_key` is UNIQUE
- NestJS uses `INSERT ... ON CONFLICT DO NOTHING` or checks before insert
- Realtime events are idempotent by design (event ID + type + entity ID)

**Out-of-order events:**
- Notifications are ordered by `created_at` (DB default)
- UI sorts by `created_at` before display
- If realtime event arrives out of order, UI re-queries REST endpoint to reconcile
- `Last-Event-ID` ensures SSE delivers in order

**Chat messages:**
- `messages.created_at` + `id` (UUIDv7 or timestamp-based) ensures order
- UI shows messages in `created_at` order
- WebSocket delivers in order; REST fallback queries ordered by `created_at`

### Q10: What should happen if the realtime connection is unavailable?

**Graceful degradation:**

| Scenario | Behavior |
|---|---|
| SSE/WebSocket disconnected | UI shows cached notifications from last REST fetch |
| Reconnect succeeds | Missed events streamed; UI updates |
| Reconnect fails after N retries | UI shows "Refresh to see updates" banner |
| User offline (mobile) | No realtime; app uses REST on foreground |
| Server down | UI shows error; background sync when server recovers |

**Rule:** The UI must never block user actions waiting for realtime. Realtime is a UX enhancement, not a functional dependency.

---

## 5. Architecture Recommendation

### Recommended: Option A (Direct NestJS) + SSE/WebSocket Gateway

```
┌─────────────────────────────────────────────────────────────────────┐
│                         NestJS API                                   │
│                                                                       │
│  Business Transaction                                                │
│    -> write business rows                                            │
│    -> write notifications row (same transaction or immediate after)  │
│    -> COMMIT                                                         │
│                                                                       │
│  Post-Commit:                                                        │
│    -> RealtimeGateway.publish(userId, event)                        │
│       ├── SSE: event stream to connected browser                    │
│       └── WebSocket: message to connected browser                   │
│                                                                       │
│  REST Fallback (always available):                                   │
│    GET /notifications?unread=true                                    │
│    GET /notifications/:id                                            │
│    GET /conversations/:id/messages                                   │
└─────────────────────────────────────────────────────────────────────┘
          │                           │
          │ SSE                       │ WebSocket
          ▼                           ▼
┌─────────────────┐         ┌─────────────────┐
│  Next.js UI     │         │  Next.js UI     │
│  (notifications)│         │  (chat)         │
└─────────────────┘         └─────────────────┘
```

### Components

| Component | Technology | Responsibility |
|---|---|---|
| `RealtimeGateway` (SSE) | NestJS `@Sse()` | Stream notifications to active users |
| `ChatGateway` (WebSocket) | NestJS `@WebSocketGateway()` | Bidirectional chat, typing, presence |
| `NotificationsService` | NestJS service | Insert notifications, track delivery, manage preferences |
| `NotificationsController` | NestJS controller | REST endpoints for fallback |
| `RealtimeAuthGuard` | NestJS guard | Validate JWT on connection |
| `TenantFilter` | NestJS pipe | Filter notifications by user/company |

### Flow Examples

#### Example 1: Job Expiry (Scheduled)

```
pg_cron (every day 12:05 AM)
  -> expire_due_jobs() PostgreSQL function
  -> Updates jobs.status = 'expired'
  -> Inserts notifications for job owners/candidates
  -> COMMIT

No realtime needed for this flow (batch, not user-facing realtime).
Users see expired jobs on next page load / REST query.
```

#### Example 2: Application Status Change (Real-time)

```
HR updates application to "shortlisted"
  -> NestJS validates HR permission
  -> change_application_status() function
  -> Inserts notification for candidate
  -> COMMIT
  -> RealtimeGateway.publish(candidateId, {type: 'application.status.changed', ...})
  -> Connected candidate sees live badge update

If candidate offline:
  -> Notification in DB (is_read=false)
  -> Candidate sees it on next login / page load
```

#### Example 3: Chat Message (WebSocket)

```
HR sends message to candidate
  -> NestJS validates participant membership
  -> Inserts message
  -> Inserts notification for recipient
  -> COMMIT
  -> ChatGateway.serverSideEmit(conversationId, {type: 'message.new', ...})
  -> Connected recipient sees message instantly

If recipient offline:
  -> Message + notification in DB
  -> Recipient sees it on reconnect / next load
```

---

## 6. Why Option B (Outbox Dispatcher) is Overengineering for Notifications

### Option B Flow:
```
NestJS business transaction
  -> outbox_events(notification.requested)
  -> COMMIT
  -> Supabase webhook -> Dispatcher wake
  -> Dispatcher claims batch
  -> Cloud Tasks create task
  -> NestJS Notification Consumer receives task
  -> Inserts notification
  -> Realtime event
```

### Problems with Option B:

| Problem | Explanation |
|---|---|
| **Latency** | Adds 3-5 seconds minimum (webhook → dispatcher wake → Cloud Tasks → consumer). Users expect instant notifications. |
| **Complexity** | 4 additional components (webhook, dispatcher, Cloud Tasks, consumer) for a simple "insert row" operation. |
| **Failure surface** | Each component can fail: webhook delivery, dispatcher availability, Cloud Tasks quota, consumer crashes. |
| **Testing burden** | Need integration tests for webhook → dispatcher → Cloud Tasks → consumer → DB. |
| **Cost** | Cloud Tasks invocations, dispatcher CPU, network hops — all for free. |
| **No benefit** | The notification is already idempotent (idempotency_key). The DB transaction ensures durability. What does Dispatcher add? |

### When Option B WOULD be appropriate:

| Scenario | Why Dispatcher Helps |
|---|---|
| Email/SMS/Push notification delivery | External provider calls can fail; retry needed |
| Notification batching/digests | Complex scheduling; Dispatcher can manage retry/backoff |
| Multi-channel fan-out | One event → many channels; Dispatcher can parallelize |
| Notification template rendering | AI or complex template resolution; worker pattern fits |

**But these are all FUTURE phases.** For Phase 1 in-app notifications, Option A is sufficient.

---

## 7. Job-Expiry Flow Verification

The document states:
> "इस job-expiry path में Cloud Tasks, Outbox Dispatcher और notification worker नहीं लगेंगे।"

**This is CORRECT and matches `12_notifications.sql` runtime flow:**

```
12_notifications.sql lines 10-16:
  Runtime flow:
    domain transaction + outbox event
        -> notification worker/NestJS resolves template + preferences
        -> inserts one idempotent notification
        -> creates/updates one delivery row per selected external channel
        -> provider adapter sends email/push/SMS and records result
        -> authorized realtime transport tells the UI to refresh/read the row
```

Wait — this says "domain transaction + outbox event". But for job expiry, there is no outbox event. The `expire_due_jobs()` PostgreSQL function directly updates `jobs` and inserts `notifications` rows in the same transaction. This is correct because:
1. It's a scheduled batch job (not user-facing realtime)
2. The function is SECURITY DEFINER with `service_role` privileges
3. No external I/O is needed

**Verdict:** Job-expiry flow is correct as documented. No Dispatcher needed.

---

## 8. Reconnect and Unread-Notification Recovery

### SSE Reconnect Strategy

```typescript
// Next.js client
const eventSource = new EventSource('/notifications/stream', {
  headers: { Authorization: `Bearer ${token}` }
});

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  addNotification(data);
};

eventSource.onerror = () => {
  eventSource.close();
  // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
  setTimeout(() => reconnect(), backoff);
};

// On reconnect, browser sends Last-Event-ID
// NestJS responds with missed events since that ID
```

### REST Fallback

```typescript
// On app load / reconnect failure
const response = await fetch('/notifications?unread=true', {
  headers: { Authorization: `Bearer ${token}` }
});
const notifications = await response.json();
updateBadge(notifications.length);
```

### Unread Count Badge

```sql
-- Authoritative source
SELECT COUNT(*) FROM notifications
WHERE user_id = $1 AND is_read = false AND deleted_at IS NULL;
```

**No realtime dependency.** Badge updates on reconnect.

---

## 9. Crash, Retry, and Duplicate Handling

### Crash During Notification Insert

**Scenario:** NestJS writes business rows, but crashes before inserting notification.

**Option A (Direct):** Notification is missing. User doesn't see it.
- Mitigation: Insert notification in the SAME transaction as business event
- If transaction commits, notification exists
- If transaction fails, neither business event nor notification exists

**Option B (Outbox):** Business event commits, notification outbox event is pending. Dispatcher eventually creates notification.
- Mitigation: Dispatcher retries on failure
- But: adds latency and complexity

**Recommendation:** Use Option A with same-transaction insert. This is simpler and equally reliable for in-app notifications.

### Duplicate Notification Prevention

```sql
-- notifications table already has idempotency_key
INSERT INTO notifications (idempotency_key, ...) VALUES ($1, ...)
ON CONFLICT (idempotency_key) DO NOTHING;
```

### Realtime Event Duplication

- SSE/WebSocket events are fire-and-forget
- If connection drops and reconnects, missed events are recovered via REST
- Duplicate realtime events are harmless (UI deduplicates by notification ID)

---

## 10. Cost and Operational Complexity

### Option A (Direct NestJS)

| Component | Cost | Complexity |
|---|---|---|
| NestJS notification insert | $0 (existing compute) | Low |
| SSE/WebSocket gateway | $0 (existing NestJS) | Low |
| REST fallback | $0 (existing API) | Low |
| **Total** | **$0** | **Low** |

### Option B (Outbox Dispatcher + Cloud Tasks)

| Component | Cost | Complexity |
|---|---|---|
| Outbox event per notification | $0 (DB row) | Low |
| Supabase webhook | $0 (included) | Low |
| Dispatcher wake + claim | Cloud Run CPU | Medium |
| Cloud Tasks queue | $0.40/million tasks | Medium |
| Cloud Tasks create/delete | Network + API calls | Medium |
| NestJS Notification Consumer | Cloud Run CPU | Medium |
| Integration testing | Engineering time | High |
| **Total** | **$$ (compute + tasks)** | **High** |

**Cost difference:** For 1000 notifications/day:
- Option A: $0
- Option B: ~$0.0004 + significant engineering overhead

---

## 11. Recommended Architecture (Final)

### Phase 1: Direct NestJS + SSE/WebSocket

```
┌─────────────────────────────────────────────────────────────┐
│                    NestJS API                                │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ Business     │    │ Notification │    │ Realtime     │  │
│  │ Service      │ -> │ Service      │ -> │ Gateway      │  │
│  │ (job/app/   │    │ (insert row  │    │ (SSE/WS)     │  │
│  │  interview) │    │  + publish)  │    │              │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                              │
│  ┌──────────────┐                                           │
│  │ REST API     │ (fallback)                                │
│  │ /notifications│                                          │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
```

### What is REQUIRED:

| Component | Status |
|---|---|
| `notifications` table | ✅ Already exists in `12_notifications.sql` |
| Notification insert in business transactions | ✅ Must implement in NestJS |
| SSE gateway for notifications | ✅ Must implement |
| WebSocket gateway for chat | ✅ Must implement |
| REST fallback endpoints | ✅ Must implement |
| Reconnect with `Last-Event-ID` | ✅ Must implement |
| Unread count badge | ✅ Must implement |
| Authorization guards | ✅ Must implement (per Decision-01) |

### What is OPTIONAL (Future Phases):

| Component | When |
|---|---|
| `notification-queue` (Cloud Tasks) | Only if email/push/SMS channels are added |
| Dispatcher-based notification flow | Only if complex batching/digests are required |
| Notification template rendering service | When email/push channels are added |
| Notification preferences UI | Phase 2 |

### What is REJECTED:

| Alternative | Reason |
|---|---|
| Outbox Dispatcher for in-app notifications | Overengineering; adds latency and complexity for no benefit |
| Cloud Tasks queue for notifications | Unnecessary; NestJS can insert directly |
| Supabase Realtime as primary transport | Adds vendor lock-in; NestJS native gateway is cleaner |
| PostgreSQL `pg_net` webhook trigger | Violates architecture; Supabase webhooks or direct NestJS publish only |

---

## 12. Unresolved Decisions

| ID | Decision | Blocking | Owner |
|---|---|---|---|
| N-1 | SSE vs WebSocket for notifications (use both?) | No | Architecture |
| N-2 | Notification grouping/stacking rules | No | Product |
| N-3 | Notification preferences UI (Phase 1 or 2) | No | Product |
| N-4 | Email/push/SMS channel priority | No | Product |
| N-5 | Notification template versioning strategy | No | Product/Engineering |

---

## 13. Final Status

### READY for Phase 1 Implementation

| Criterion | Status |
|---|---|
| Actual requirements identified | ✅ |
| Option A (Direct NestJS) selected | ✅ |
| Job-expiry flow validated | ✅ |
| Transport decision made | ✅ SSE + WebSocket |
| Reconnect strategy defined | ✅ |
| Authorization model defined | ✅ Per Decision-01 |
| Source of truth identified | ✅ `notifications` table |
| Overengineering rejected | ✅ Option B rejected for in-app |

### NOT Ready (Future Phases)

| Item | Reason |
|---|---|
| Email/push/SMS channels | Future requirement; not in Phase 1 |
| Dispatcher-based notification flow | Overengineering for in-app; reconsider only if external channels added |
| Supabase Realtime integration | Not needed; NestJS native gateway sufficient |

---

## 14. Implementation Notes for NestJS Team

### Transaction Pattern (Required)

```typescript
// Every business operation that generates a notification:
async function someBusinessOperation(userId: UUID, ...) {
  return await this.db.transaction(async (tx) => {
    // 1. Business rows
    await tx.jobs.update(...);
    
    // 2. Notification (same transaction)
    await tx.notifications.insert({
      user_id: recipientId,
      event_type: 'job.status.changed',
      title: 'Job status updated',
      body: 'Your job posting has been...',
      entity_type: 'job',
      entity_id: jobId,
      idempotency_key: generateIdempotencyKey(),
      channels: { in_app: true },
    });
    
    // 3. Outbox (if needed for other async work)
    await tx.outboxEvents.insert(...);
    
    return result;
  });
}

// Post-commit (outside transaction):
await this.realtimeGateway.publish(recipientId, {
  type: 'notification.created',
  notificationId: notification.id,
});
```

### SSE Gateway Pattern

```typescript
@Get('notifications/stream')
@Sse()
@UseGuards(JwtAuthGuard, ActiveAccountGuard)
async streamNotifications(@Req() req: Request) {
  const userId = req.user.id;
  return this.realtimeService.createNotificationStream(userId);
}
```

### WebSocket Gateway Pattern (Chat)

```typescript
@WebSocketGateway({
  namespace: 'chat',
  transports: ['websocket'],
})
@UseGuards(RealtimeAuthGuard)
export class ChatGateway {
  @SubscribeMessage('message.send')
  async handleMessage(client: Socket, payload: { conversationId: UUID, content: string }) {
    // Validate participant membership
    // Insert message + notification
    // Emit to recipient
  }
}
```

---

## 15. Comparison with Document's Proposed Options

| Aspect | Document Option A | Document Option B | Kilo Recommendation |
|---|---|---|---|
| **Architecture match** | ✅ Matches repo | ❌ Adds unnecessary complexity | ✅ Option A |
| **Latency** | Low (same request) | High (3-5s queue hop) | ✅ Low |
| **Reliability** | High (same transaction) | Medium (multiple failure points) | ✅ High |
| **Cost** | $0 | $$ | ✅ $0 |
| **Operational complexity** | Low | High | ✅ Low |
| **Reconnect recovery** | Simple (REST fallback) | Complex (outbox replay) | ✅ Simple |
| **Testing burden** | Low | High | ✅ Low |
| **Fit with current architecture** | ✅ Native NestJS | ❌ Dispatcher for non-AI work | ✅ Native NestJS |
| **Overengineering risk** | Low | High | ✅ Low |

---

## Conclusion

**The document's Option A is correct and sufficient for Phase 1 in-app notifications.**

Option B (Outbox Dispatcher + Cloud Tasks) is **overengineering** for this use case. It should be rejected for in-app notifications and reserved for:
- Email/push/SMS delivery (external provider retry needed)
- Complex notification batching/digests
- Multi-channel fan-out scenarios

The job-expiry flow is **correct and final** as documented.

The SSE/WebSocket gateway + REST fallback pattern is the right architecture for realtime notifications in this repository.

---

*No files were modified. This is an audit-only report.*
