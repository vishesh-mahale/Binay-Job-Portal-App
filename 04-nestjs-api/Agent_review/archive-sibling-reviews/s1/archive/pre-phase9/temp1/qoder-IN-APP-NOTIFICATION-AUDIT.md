# In-App Header Notification — Independent Architecture Audit

**Agent:** qoder (independent reviewer)
**Date:** 2026-08-24
**Requirement doc:** `04-nestjs-api/04-nestjs-api-app/temp1/IN-APP-NOTIFICATION-REQUIREMENT-AND-CURRENT-ARCHITECTURE-HINGLISH.md`
**Final Status:** **NEEDS_DECISION** (core path RECOMMENDED and MVP-implementable; lekin common processing path ka final freeze product ka DECISION-07 hoga — agent freeze nahi kar sakta)

> Methodology: requirement doc + dono existing agent reports (antigravity, freebuf) padhe,
> phir har claim repo files se independently verify kiya. Jahan agent reports ne repo evidence
> galat cite kiya hai, wo Section 12 mein flagged hai. Koi file modify nahi hui, koi code/SQL
> change nahi.

---

## 1. Actual requirement — kya genuinely required hai

Verified from `PRODUCT-REQUIREMENTS.md` §15 (APPROVED DIRECTION, L198-218), §13 (L176-184),
`PHASE-01` REQ-NOTIFY-001..003 / REQ-REALTIME-001 (L137-140), aur temp1 requirement doc §1:

| # | Requirement | Source | Status |
|---|---|---|---|
| R1 | Header badge + unread notification list (in-app) | temp1 doc §1; Product §15 | REQUIRED |
| R2 | Active user ko live header update bina manual refresh | Product §15 L203-204; REQ-REALTIME-001 | REQUIRED (transport frozen by DECISION-02) |
| R3 | Offline user ke liye notifications durable save; login/open par unread dikhe | temp1 doc §1; `12_notifications.sql` | REQUIRED |
| R4 | Abhi sirf in-app channel; email future, conditional (preference/policy/rate-limit/template) | temp1 doc §1; Product §15 L205-206 | REQUIRED (in-app) / FUTURE (email) |
| R5 | Chat content `messages` me, header alert `notifications` me — alag cheezein | temp1 doc §1; `11_messaging.sql` | REQUIRED |
| R6 | Application/interview/referral/account events notifications bana saken | Product §15 L201 | REQUIRED DIRECTION |
| R7 | Interview reminders + lifecycle notifications | Product §13 L182 | REQUIRED (mechanism future-phase — see U-5) |
| R8 | Delivery-channel state aur in-app read-state alag track hon | Product §15 L202; `notification_delivery_log` | REQUIRED (schema ready) |
| R9 | Admin-manageable email templates (versioned, safe rendering) | Product §15 L213-218; REQ-NOTIFY-003 | PLANNED CURRENT / GAP-006 |

**Exact recipient/channel/default matrix Product §15 L210-211 explicitly "notification
contract में freeze" ke liye defer karta hai** — ye abhi likhna overreach hoga.

---

## 2. Repository ground truth (verified)

### 2.1 `12_notifications.sql` (456 lines, pura padha)

- Header runtime flow (L10-16): `domain transaction + outbox event -> notification
  worker/NestJS resolves template + preferences -> inserts one idempotent notification ->
  per-channel delivery rows -> provider adapter -> realtime transport nudge`. Note: doc
  **"worker/NestJS"** dono allow karta hai — NestJS-as-resolver schema-design se
  contradict nahi hota.
- Boundary (L18-19): *"Database rows are the durable truth; realtime delivery is only
  transport."*
- `notifications` table (L143-216): `idempotency_key VARCHAR(255) NOT NULL UNIQUE` (L145),
  `user_id`, `company_id`, `template_id`, `entity_type/entity_id` pair (L151-152),
  `title VARCHAR(500)` (L155), `action_url`, `action_type`, `event_type`, `category`,
  `priority`, `channels JSONB DEFAULT '{"in_app": true}'` (L173), `delivery_status JSONB`,
  `is_read/read_at` (L178-179), `is_archived`, `deleted_at` (soft-delete),
  `expires_at` (L186), `group_key/group_count`, `scheduled_at/sent_at` (L193-194).
  **`metadata` naam ka koi column NAHI hai.**
- Identity guard trigger (L349-381): recipient/content/context immutable; soft-delete only;
  mutable sirf channels/delivery_status/read/archive/delete/group/schedule fields.
- `notification_templates` (L33-83): lifecycle = `is_active/activated_by/activated_at/
  retired_at` columns + trigger guard (L294-347). **`status` enum column NAHI hai.**
- `user_notification_preferences` (L95-131): `in_app_enabled/email_enabled/push_enabled/
  sms_enabled`, per-event overrides, quiet hours, digest.
- `notification_delivery_log` (L224-256): per-channel delivery state/retry — external
  channels ke liye; in-app ke liye row-level `delivery_status` JSONB sufficient.
- Indexes: `idx_notifications_unread` (L415-416, unread badge query ke liye ready),
  `idx_notifications_scheduled` (L418-419, future reminders ke liye ready).

### 2.2 `17_rls.sql`

- L6: *"service_role is server-only. Tables without a policy are default-deny."*
- L134: `notifications` RLS enabled — **aur is table ke liye koi CREATE POLICY NAHI hai**
  (poore file mein notif* ka sirf ENABLE-line match). Matlab browser roles ke liye
  default-deny; saara read/write NestJS service_role se hoga.
- L237: `change_application_status` GRANT EXECUTE sirf service_role.

### 2.3 `09_applications.sql`

- `change_application_status()` (L573-652) aaj yahi karta hai: status UPDATE +
  `application_status_history` INSERT + `outbox_events` INSERT (`application.status.changed`,
  L639-648). **Ye function aaj `notifications` row INSERT NAHI karta.** Jo bhi reports
  "inserted inside change_application_status()" ko current behavior bol rahe hain, wo
  future modification ko present-tense mein likh rahe hain.

### 2.4 Frozen decisions

- **DECISION-02 (APPROVED/FROZEN)** — transport table row: *"In-app notifications → Same
  per-user SSE stream → Notifications inbox/unread read"* (L17). One-way status ke liye
  WebSocket mana hai (L21); Supabase Realtime primary transport nahi (L25-29); reconnect =
  exponential backoff + REST authoritative fetch (L40-48); *"Durable state change pehle
  database transaction mein commit hoga; realtime push baad mein hoga"* (L53); realtime
  failure business transaction fail nahi karega (L55); exact endpoints/DTOs API-catalog
  work hain, decision mein invent nahi (L74).
- **DECISION-06 (FINAL)** — job expiry: daily 12:05 AM IST Supabase pg_cron →
  `expire_due_jobs()` → published/paused due jobs → `expired` + notifications row **same
  atomic transaction** (L26-33). *"Expiry notification ke liye Cloud Scheduler, NestJS cron,
  Cloud Tasks ya Outbox Dispatcher ka upayog nahin hoga"* (L35). Email future approved
  outbox/email flow se (L53). Note: `expire_due_jobs()` function baseline mein **abhi exist
  nahi karta** — banega (pre-freeze baseline policy ke under).
- **DECISION-03** — *"Analytics event ko NestJS same application transaction mein
  idempotently record kar sakta hai"* (L28) — same-transaction idempotent row write ka
  house precedent already approved hai. Notification worker/queue/endpoint contract
  approved nahi, isliye `application.submitted` route register nahi hoga (L30-31).

### 2.5 Dispatcher / contracts

- `event-route.registry.ts`: 8 registered routes; `NOTIFICATION_QUEUE = 'notification-queue'`
  **provision-only** (L31); `notification.email.requested` NOT registered, unresolved OD-3
  (L14); unknown events fail-closed.
- `contracts/events/` — 13 contracts; **koi bhi "processing completed" notification-oriented
  contract nahi** (no resume-parse-completed, no notification.email.requested contract).
- PHASE-02 L208-209: `application.submitted` + `notification.email.requested` dono
  `EXPECTED PHASED GAP` — dispatcher inhe fail-closed reject karega, guess nahi karega (L212).
- PHASE-04 L188-192: *"Notification creation, preference evaluation and delivery-log
  creation are separated from external email/push calls… Delivery retries and provider
  calls happen after commit."*

---

## 3. Har notification event ka verified flow-map

| Event | Producer/writer | Same-tx insert possible? | Recommended path | Blocker/open item |
|---|---|---|---|---|
| `job.expired` | DB function `expire_due_jobs()` (pg_cron) | — (DB-direct) | DECISION-06 FINAL: sweep + notification row same atomic tx | Function abhi bana nahi (implementation) |
| `application.received` | NestJS apply transaction | HAAN | Writer = NestJS; same-tx insert (HR/company recipients) | Recipient resolution rule (company membership) — U-1 |
| `application.status.changed` | NestJS tx via `change_application_status()` | HAAN — function call ke baad same tx mein NestJS insert | NestJS same-tx insert; function SQL modify karna zaroori NAHI | Outbox event already emitted (L639) — reconciliation U-3 |
| `interview.scheduled/rescheduled/cancelled` | NestJS interview transaction | HAAN | Same-tx insert (candidate + authorized HR) | Recipient matrix U-1 |
| `message.created` | NestJS message transaction | HAAN | Same-tx insert receiver ke liye; chat WS frame alag (DECISION-02 §7) | Group conversation fan-out recipient rule U-1 |
| `resume.processing.completed` | **FastAPI worker** (writer NestJS NAHI) | NAHI (NestJS us tx mein nahi hai) | Future: worker completion outbox event → NestJS consumer; interim: DECISION-02 SSE/status-read path sufficient | Koi approved completion event/contract NAHI — U-2 |
| `referral update` | NestJS referral transaction | HAAN (in-app); invitation EMAIL future outbox worker (REQ-REFERRAL-004) | In-app same-tx; email = future phase | Product §15 live-inbox list mein included |
| Future email | Business tx outbox | — | Outbox → Dispatcher → Cloud Tasks `notification-queue` → email worker | OD-3; contract/queue/endpoint approval pending (GAP-015) |

**Critical insight jo dono existing reports miss karte hain:** "direct NestJS same-tx insert"
har event ke liye applicable NAHI hai — worker-originated events (resume/profile processing)
ka writer FastAPI hai, aur `PRODUCTION-SCHEMA-BLUEPRINT` write-ownership FastAPI ko
parsing/evidence/projection tak limit karta hai. Un events ke liye async consumer path
(option C mein) genuinely justified hai — lekin uska event contract aaj approved nahi hai.

---

## 4. Options — independent analysis (A/B se aage bhi)

### Option A — Writer-direct same-transaction insert + post-commit SSE nudge (RECOMMENDED for NestJS-originated + DB-originated)

```text
NestJS business transaction
  BEGIN
    business rows (application/interview/message/etc.)
    preference evaluation (in_app_enabled + event_preferences)
    INSERT INTO notifications (idempotency_key, user_id, event_type, title, body,
                               entity_type, entity_id, channels='{"in_app": true}')
    [existing business outbox events unchanged]
  COMMIT
  post-commit -> RealtimeModule SSE nudge (per-user stream, DECISION-02)
```

- **Components:** NestJS + PostgreSQL + RealtimeModule (SSE) — koi naya infra nahi.
- **Advantages:** zero missing notification (atomic with business row); near-zero extra
  latency; DECISION-02 ke "commit pehle, push baad mein" se exact match; DECISION-03
  precedent; idempotency_key UNIQUE se duplicate-safe (L145); crash-after-commit par
  REST unread recovery (R3) automatic.
- **Disadvantages:** business tx mein 1 row ka write + preference lookup add hota hai;
  template rendering NestJS mein karna hoga (future i18n); multi-instance fan-out solved
  hona chahiye (U-4).
- **Cost:** incremental ~$0. **Ops complexity:** minimal.
- **Repo fit:** 12_notifications.sql boundary L18-19, DECISION-02, DECISION-03, DECISION-06
  — sab se consistent.

### Option B — Har notification: Outbox → Dispatcher → Cloud Tasks → NestJS Notification Consumer (REJECTED for in-app)

```text
business tx -> outbox event -> Supabase webhook/dispatcher wake -> claim_outbox_events()
  -> Cloud Tasks notification-queue -> NestJS consumer -> notifications row -> SSE push
```

- **Advantages:** built-in retry/DLQ; producer/consumer decouple; external provider
  rate-limiting ke liye natural (email future).
- **Disadvantages:** internal single-row INSERT ke liye 4+ extra hops/components; delivery
  eventual-consistent (webhook wake + claim + task dispatch); dispatcher G-1/G-5 gates
  abhi pre-production (`IMPLEMENTATION-PENDING`); consumer endpoint/contract aaj exist
  nahi — banana = new approvals; in-app alert me seconds-scale delay user-perceived hoga.
  (antigravity/freebuf ke "2-5s" figures UNVERIFIED hain — wake-driven design mein kam bhi
  ho sakta hai; lekin directionally async lag real hai.)
- **Cost/ops:** Cloud Tasks invocations + consumer scaling + queue/DLQ monitoring.
- **Repo fit:** outbox pipeline AI/projection/security-scan heavy work ke liye established
  hai — simple row insert ke liye design-intent match nahi karta.
- **Verdict:** in-app-only scope ke liye **OVERENGINEERING**. Email/external channels ke
  liye future mein justified (Section 5).

### Option C — Hybrid: writer-direct in-app + selective async consumer (RECOMMENDED end-state)

In-app MVP = Option A (NestJS events) + DECISION-06 DB-direct (expiry). Async consumer
sirf tab add hoga jab uska actual driver prove ho:
1. **Worker-originated events** (resume/profile completion) — jab approved completion
   event contract bane (U-2).
2. **External email/push** — jab REQ-NOTIFY-002/003 phase start ho (OD-3 route,
   GAP-015 owner phase).
- Ye B ka "always async" nahi, aur A ka "kabhi async nahi" nahi — evidence-driven phasing.
- `notification-queue` provision-only rahega jab tak consumer contract approve na ho.

### Option D — pg_cron/DB-function-driven notifications for ALL events (REJECTED)

DECISION-06 ne expiry ke liye DB-direct approve kiya — lekin **sirf expiry** (simple,
scheduled, single producer). Business events (apply/interview/chat) user-request-driven
hain; unhe DB functions/triggers mein push karna PHASE-04 authority-order (business
workflow policy NestJS mandate) ke against hai, template/preference/i18n logic DB mein
gusa dega, aur realtime authorization boundary (DECISION-02 §4) kamzor karega.

### Option E — Supabase Realtime / Postgres Changes direct browser subscription (REJECTED)

DECISION-02 L25-29 explicitly: initial primary transport nahi; business tables par direct
browser subscription nahi. Frozen decision — reopen karna process violation.

### Option F — pg_notify as primary delivery channel (REJECTED as primary; see U-4 nuance)

pg_notify fire-and-forget hai — delivery ke liye nahi. **Lekin** multi-instance SSE fan-out
bus ke taur par (COMMIT par notify → sab instances LISTEN → apne connected users ko push)
ye ek implementation candidate hai. Ye "delivery mechanism" nahi "instance fan-out glue"
hai — DECISION-02 §8 ne ise API-catalog ke liye open rakha hai. freebuf ne isse primary
delivery bol kar reject kiya — wo framing incorrect hai.

---

## 5. Prompt ke 18 questions — direct answers

1. **Actual requirement:** Section 1 (R1-R9). In-app only, header badge/list, live + offline recovery.
2. **Active-user live update:** post-commit SSE nudge per-user stream (DECISION-02 row L17). WebSocket NAHI (one-way status ke liye WS mana, L21).
3. **Offline recovery:** `notifications` table durable truth; login/open par REST unread fetch — index ready (L415-416). Exact endpoint API-catalog freeze hoga (DECISION-02 §8) — proposed: unread list + count + mark-read family.
4. **Job-expiry notification:** DECISION-06 FINAL — pg_cron → `expire_due_jobs()` same-tx status flip + notification row; no outbox/dispatcher/tasks. Function implementation pending.
5. **Candidate application notification (`application.received`):** NestJS apply tx mein same-tx insert → HR recipients. Recipient rule = company-membership/active-HR resolution (NestJS policy) — U-1.
6. **Application status notification:** NestJS status-change tx mein `change_application_status()` call ke BAAD same tx mein insert — SQL function modify kiye bina possible. Existing `application.status.changed` outbox event reconciliation U-3.
7. **Interview notifications:** booking/reschedule/cancel tx mein same-tx insert (candidate + authorized HR). Reminders (R7) = `scheduled_at` mechanism future phase (U-5). Interview-summary etc. notification scope mein abhi nahi.
8. **Chat/message alert:** message tx mein receiver ke liye same-tx header notification; chat WS frame (conversation gateway) alag cheez hai (DECISION-02 §7, requirement doc §1).
9. **Resume/profile processing:** writer FastAPI hai → same-tx NestJS insert NAHI possible; interim DECISION-02 resume SSE status stream sufficient; durable header notification = approved completion event ke baad (U-2).
10. **Future email:** Outbox → Dispatcher → Cloud Tasks `notification-queue` → email worker; `notification.email.requested` contract/queue/endpoint approval pending (OD-3, GAP-015). In-app path par zero impact.
11. **Outbox Dispatcher really required?** In-app ke liye **NAHI**. Dispatcher already exists/required hai AI/projection/security workloads ke liye — notification ke liye EXTRA use karna scope addition hoga.
12. **Cloud Tasks/notification-queue required?** In-app ke liye **NAHI**. Queue provision-only hai; email phase ke liye reserved.
13. **Direct NestJS processing sufficient?** NestJS-originated events ke liye **HAAN** (Option A). Worker-originated events ke liye nahi — Section 3 insight.
14. **PostgreSQL function/direct insert suitable?** SIRF expiry ke liye (DECISION-06 FINAL). Business events ke liye Option D reasons se nahi.
15. **WebSocket vs SSE vs Supabase Realtime:** Frozen by DECISION-02 — notifications = per-user SSE; chat = WebSocket; Supabase Realtime = not primary. Naya transport decision ki zaroorat NAHI.
16. **Reconnect/unread recovery:** DECISION-02 §5 pattern — exponential backoff + re-auth + REST authoritative fetch; correctness in-memory replay par depend nahi; `idempotency_key` + REST re-fetch se duplicates/stale safe.
17. **Crash/retry/duplicate:** (a) pre-commit crash → rollback, no orphan notification (correct); (b) post-commit pre-push crash → row safe, REST recovery; (c) duplicate producer attempts → `idempotency_key UNIQUE`; (d) realtime outage → business ops unaffected (DECISION-02 §6 rule). External-channel retry = future delivery_log mechanism.
18. **Cost/ops complexity:** Option A/C = incremental $0, no new infra. Option B = Cloud Tasks invocations + consumer service + queue monitoring. SSE connections Cloud Run instances hold karte hain — ye DECISION-02 already accepted trade-off hai.

---

## 6. What is ACTUAL requirement (summary)

- Writer ke saath same transaction mein idempotent `notifications` row.
- Commit ke baad per-user SSE nudge (frozen transport).
- REST unread list/count/mark-read endpoints (API-catalog freeze pending).
- Expiry notification via DECISION-06 DB sweep.
- Preference evaluation (`in_app_enabled`) before insert — schema isliye bana hai.

## 7. What is OPTIONAL reliability hardening (abhi mat karo)

- Template rendering via `notification_templates` (REQ-NOTIFY-003 planned/gap — product
  call par phase mein; v1 direct title/body valid hai).
- `notification_delivery_log` rows — sirf external channels ke saath relevant.
- Scheduled reminders (`scheduled_at` scan) — interview-reminder phase.
- Digest/quiet-hours enforcement — preferences schema ready, enforcement future.
- Notification archival/cleanup — `is_archived`/`deleted_at`/expiry indexes ready; policy future.

## 8. What is OVERENGINEERING (avoid)

- Har in-app notification ko Outbox → Cloud Tasks → consumer se guzarna (Option B as blanket rule).
- Notification ke liye alag microservice.
- Business events ke liye pg_cron/DB-trigger-based notification creation (Option D).
- Supabase Realtime browser subscriptions (Option E).
- Delivery-log/retry machinery for in-app channel.
- Naya event type/event contract invent karna bina product approval (house rule: "Missing
  requirement invent न करें", AGENTS.md).

---

## 9. Recommended architecture (RECOMMENDED — freeze product karega)

```text
NestJS-originated events (application.received, application.status.changed,
interview.*, message.created, referral in-app):
  Option A — same-transaction idempotent insert + post-commit SSE nudge

DB-originated (job.expired):
  DECISION-06 FINAL — expire_due_jobs() same atomic tx

Worker-originated (resume/profile processing completed):
  Future approved completion event -> consumer (Option C subset) — U-2 tak interim
  SSE status-read path (already DECISION-02)

Future external email:
  Option B pipeline — sirf email phase mein, OD-3/GAP-015 approvals ke baad
```

Implementation preconditions (schema ready; code abhi likhna hai):
- NestJS `NotificationsModule` (guide L432 module list mein planned) — `createInAppTx()`
  helper, preference check, idempotency-key convention (proposed:
  `{event_type}:{entity_id}:{user_id}` — freeze API-catalog mein).
- RealtimeModule SSE per-user stream (DECISION-02 §8).
- REST unread/count/read endpoints — API-catalog freeze.
- `expire_due_jobs()` function — DECISION-06 reminder: permissions, timezone, failure
  monitoring test-plan mein cover honge.

## 10. Rejected alternatives and reasons (compact)

| Option | Verdict | Primary reason |
|---|---|---|
| B (blanket outbox/tasks/consumer) | REJECTED for in-app | 4+ extra hops internal row-insert ke liye; eventual-consistent alert UX; consumer contract exist nahi karta; overengineering |
| D (DB function/trigger for business events) | REJECTED | PHASE-04 authority order; template/preference logic DB mein; sirf expiry approved (DECISION-06) |
| E (Supabase Realtime) | REJECTED | DECISION-02 frozen mana karta hai |
| F (pg_notify as delivery) | REJECTED as primary | Fire-and-forget; correctness DB row + REST recovery par hi rahegi |

---

## 11. Unresolved decisions (product/owner sign-off required)

| # | Decision | Why blocking |
|---|---|---|
| U-1 | **Recipient/channel matrix** — har event ka recipient (HR? all company members? candidate?), group chat fan-out rule | Product §15 L210-211 ne ise "notification contract में freeze" bola — agents decide nahi karenge |
| U-2 | **Worker-originated completion events** — resume/profile completion notification ke liye kaunsa event contract? kaunsa route? | contracts/ mein koi completion contract nahi; naya invent karna approval maangta hai |
| U-3 | **Existing outbox events reconciliation** — `application.status.changed` (09_applications.sql L639) aur `application.submitted` aaj emit hote hain par unroutable (fail-closed). In-app same-tx insert adopt hone par in events ka role kya (future email/analytics)? dead-letter noise acceptable ya producer change? | Dispatcher G-5 discipline; EXPECTED PHASED GAP record update |
| U-4 | **Multi-instance SSE fan-out** — Cloud Run scale-out par commit instance A pe, user connection instance B pe → in-process emit insufficient. pg_notify bus / shared fan-out — DECISION-02 §8 ne API-catalog ke liye open rakha | Correctness/live-delivery gap multi-instance par |
| U-5 | **Scheduled reminders mechanism** — interview reminders (Product §13 approved) ke liye `scheduled_at` kaun scan karega (pg_cron precedent vs NestJS wake)? | Product §13 requirement; mechanism unapproved |
| U-6 | **Template resolution timing** — v1 direct title/body vs day-1 template lookup (GAP-006 REQ-NOTIFY-003 scope) | Product phase call |

**Ye open items hi mera NEEDS_DECISION reason hain** — architecture direction clear hai,
lekin freeze + worker-event path + recipient matrix agent authority ke bahar hain.

---

## 12. Honest disagreement / existing reports ke incorrect claims

### antigravity-IN-APP-NOTIFICATION-AUDIT.md
| Claim | Reality |
|---|---|
| Final status READY + "FROZEN & APPROVED (Option A)" | Agent freeze nahi kar sakta; temp1 doc khud kehta hai "बाकी notification processing path अभी final नहीं है". Freeze = product DECISION-07 |
| `change_application_status()` inserts notifications row | Function aaj sirf status+history+outbox likhta hai (09_applications.sql L573-652); notifications insert future modification hai |
| `17_rls.sql` L133 owner-only SELECT policy `user_id = auth.uid()` | L133-134 sirf RLS ENABLE lines hain; notifications ke liye koi policy NAHI — default-deny (17_rls.sql L6). Read NestJS service_role se hoga, browser se NAHI |
| Option B latency "2,000-5,000ms" | UNVERIFIED figure; wake-driven design mein alag ho sakta hai |
| Endpoints `GET /api/v1/notifications/unread` etc. as if fixed | DECISION-02 §8: exact paths/DTOs API-catalog freeze honge — proposed maano, frozen nahi |
| Resume completion: "worker calls NestJS internal endpoint" | Aisa koi approved internal endpoint/contract repo mein nahi |

### freebuf-IN-APP-NOTIFICATION-AUDIT.md
| Claim | Reality |
|---|---|
| `notifications.metadata JSONB` column; `title VARCHAR(255)`; templates ka `status draft/active/retired` column | Baseline mein `metadata` column hai hi NAHI; title VARCHAR(500) (L155); template lifecycle `is_active/activated_*/retired_at` columns se hai (L56-61) — schema table fabricated |
| RLS "Owner-only SELECT (`user_id = auth.uid()`)" | Upar jaisa — koi policy NAHI; default-deny |
| "NESTJS-IMPLEMENTATION-GUIDE §15 says… Notifications are business actions — they write directly" | Guide mein aisa statement NAHI hai (guide mein NotificationsModule sirf module-list entry hai, L432) — quote fabricated |
| Interview scheduling "Candidate + Interviewer" recipients | Recipient matrix abhi unfrozen (U-1) — fact ki tarah present karna overreach |
| Pg_notify rejection reasoning | Fire-and-forget delivery ke liye sahi, par multi-instance fan-out bus use-case ko address kiye bina reject kiya (Section 4-F, U-4) |
| Latency/cost figures ("<10ms", "$0.00", "10K+ connections") | Directionally reasonable but UNVERIFIED — koi load-test evidence repo mein nahi |

### Dono reports ka shared blind spot
- Worker-originated events (resume/profile processing) ke liye "same-tx NestJS insert"
  impossible hai — writer FastAPI hai. Section 3 / U-2.
- Multi-instance SSE fan-out ka koi zikr nahi (U-4).
- Existing unroutable outbox events (`application.status.changed`, `application.submitted`)
  ka reconciliation unaddressed (U-3).
- Preference evaluation (`user_notification_preferences.in_app_enabled`) — schema ka
  designed step — dono mein missing/near-missing.

**Jahan main dono se agree karta hoon:** core conclusion sahi hai — pure in-app alerts ke
liye blanket outbox/Cloud-Tasks pipeline overengineering hai; same-transaction idempotent
insert + commit-ke-baad SSE nudge + REST recovery correct direction hai. Mera difference
verdict-label (READY vs NEEDS_DECISION) aur fabricated evidence par hai, conclusion par nahi.

---

## 13. Final status

### **NEEDS_DECISION**

**Justification:**
1. **RECOMMENDED direction clear & MVP-implementable:** NestJS-originated events ke liye
   Option A; expiry DECISION-06 FINAL; transport DECISION-02 FROZEN; schema 100% ready
   (`12_notifications.sql`); zero new infrastructure.
2. **Lekin final freeze product ka kaam hai:** temp1 doc khud processing path "final नहीं"
   bolta hai; recipient/channel matrix Product §15 ne contract ke liye defer kiya (U-1);
   worker-originated event path (U-2), outbox-event reconciliation (U-3), multi-instance
   fan-out (U-4), reminder mechanism (U-5) sab unresolved hain.
3. **READY isliye NAHI:** READY label = implementation unblock; lekin U-1/U-2 resolved
   hue bina complete event coverage implement karna invention hoga — aur dono existing
   READY reports ne exactly yahi galti fabricated evidence ke saath ki hai (Section 12).
4. **Decision path to READY:** product DECISION-07 likhe — (a) common path = Option C
   hybrid confirm; (b) recipient matrix approve; (c) worker completion event contract ka
   owner phase assign; (d) U-3/U-4/U-5/U-6 dispositions. Tab in-app MVP scope READY.

---

*Koi file modify nahi hui. Koi code/SQL change nahi. Sabhi claims file/line references se
verify kiye gaye hain; UNVERIFIED figures explicitly marked hain.*
