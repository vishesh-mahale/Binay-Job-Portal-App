# ox-alpha — In-App Header Notification Architecture Audit (Independent)

**Auditor:** ox-alpha (Independent Senior Tech Architect — NestJS / Distributed Systems, 15+ YOE perspective)
**Date:** 2026-08-24
**Mode:** Read-only audit — कोई code implement नहीं किया, कोई SQL modify नहीं किया। Single deliverable = यह report file.
**Scope:** In-app header notification processing path — requirement validation vs repository ground truth
**Final Status:** **`READY`** (architecture decision के लिए; 7 non-blocking decisions Section 15 में listed)
**Target file:** `04-nestjs-api/04-nestjs-api-app/temp1/ox-alpha-IN-APP-NOTIFICATION-AUDIT.md`

> ⚠️ **Independence note:** `antigravity-IN-APP-NOTIFICATION-AUDIT.md` को source नहीं, केवल comparison object माना गया। हर claim नीचे baseline SQL / frozen ADRs / dispatcher source से independently verify किया गया है। जहाँ मैं antigravity से disagree करता हूँ, Section 16 में explicit reasons हैं। NFR §7 rule follow किया गया: docs/code conflict पर guess नहीं, conflict report किया (Section 4)।

---

## 1. Executive Verdict (एक paragraph में)

Actual product requirement सिर्फ तीन चीज़ें हैं: **(1)** durable per-user notification rows, **(2)** active user को live header update, **(3)** offline user को login/reconnect पर unread recovery — in-app channel only. इन तीनों के लिए **Option A (same-transaction direct insert → post-commit SSE nudge → REST recovery)** पर्याप्त है और यही recommended architecture है। Option B (Outbox Dispatcher → Cloud Tasks → Notification Consumer) in-app notifications के लिए **अनिवार्य नहीं है — यह overengineering है**, क्योंकि notification insert business action के same transaction में होने पर lost-notification class ही exist नहीं करती, और retry करने के लिए कुछ बचता ही नहीं (TX commit = row exists; TX rollback = कोई business action हुआ ही नहीं, तो notification भी नहीं होनी चाहिए)। Existing Outbox Dispatcher अपने current AI/heavy pipeline के लिए वैसे ही रहेगा — उसे touch नहीं करना। Future email channel के लिए outbox infrastructure **फिर reuse होगा** (OD-3 `notification.email.requested` already reserved), यही सही boundary है।

---

## 2. Ground Truth Inventory (verified evidence anchors)

| # | File : Lines | Verified fact | Architectural implication |
|---|---|---|---|
| G1 | `12_notifications.sql` L143–216 | `notifications`: `idempotency_key VARCHAR(255) NOT NULL UNIQUE`, `channels JSONB DEFAULT '{"in_app": true}'`, `is_read`+`read_at` paired CHECK, soft-delete only, identity-guard trigger | Durable truth + DB-level duplicate protection **already exists**. कोई नया table नहीं चाहिए। |
| G2 | `12_notifications.sql` L413–419 | `idx_notifications_unread ON notifications(user_id, created_at DESC) WHERE is_read=false AND is_archived=false` | Unread header query के लिए purpose-built partial index ready. |
| G3 | `12_notifications.sql` L10–16 | Header comment: runtime flow = "domain transaction + **outbox event** → notification worker resolves template + preferences → inserts idempotent notification" | ⚠️ Proposed simple path से **conflict** (Section 4, C-1). |
| G4 | `12_notifications.sql` L224–256 | `notification_delivery_log` with `next_retry_at ... WHERE status IN ('failed','pending')` index | Per-channel external delivery state/retry schema **email/push के लिए designed**, in-app के लिए unnecessary. |
| G5 | `12_notifications.sql` L294–347 | Template lifecycle: insert always draft, activation requires `activated_by`, published versions immutable | MVP में direct title/body insert (template_id=NULL) practical; templates adopt करना = admin seeding workflow भी चाहिए. |
| G6 | `15_infrastructure.sql` L23–48, L315–328 | `outbox_events` claim/lease/retry/dead-letter, `processed_events`, `outbox_recovery_needed()`; webhook wake + Scheduler backstop | Outbox infra heavy/AI pipelines के लिए built; in-app insert इसका beneficiary नहीं. |
| G7 | dispatcher `event-route.registry.ts` | `NOTIFICATION_QUEUE` **provision-only**; `notification.email.requested` (OD-3) explicitly NOT registered; unknown types fail-closed | Dispatcher में आज कोई in-app notification route exist नहीं करता. Option B = नया route + consumer + contract work (Gate G-1 open). |
| G8 | Dispatcher `README.md` §12–13 | Phase 1 done (103 tests); gates G-1…G-4 OPEN; `CloudTasksPublisher` NOT yet implemented | Option B की production transport खुद अभी pending है. |
| G9 | DECISION-02 §2 (APPROVED/FROZEN) | "In-app notifications → **Same per-user SSE stream**"; chat only WebSocket; recovery = REST authoritative read | Transport question **पहले ही freeze है** — WebSocket-vs-SSE debate reopen करना unjustified. |
| G10 | DECISION-02 §3 | Supabase Realtime/Broadcast browser-facing primary transport नहीं होगा; NestJS authorization boundary रहेगा | Supabase Realtime option repo-level rejected. |
| G11 | `17_rls.sql` L128–160 | RLS enabled on all 5 notification tables; **कोई SELECT grant नहीं** anon/authenticated को | Browser direct read/subscription impossible — NestJS inbox API mandatory; Supabase Realtime on `notifications` grants बदले बिना असंभव. |
| G12 | `PRODUCT-REQUIREMENTS.md` §15 | Events approved; delivery-channel state ≠ in-app state; email conditional; recipient/channel matrix "notification contract" में freeze होगी | Event scope PR से aligned; per-event matrix open product item. |
| G13 | DECISION-06 L3, L28–53 | `FINAL — SIMPLE DAILY DATABASE SWEEP`: pg_cron → `expire_due_jobs()`, atomic flip + notification insert; Cloud Tasks/Dispatcher excluded | Job-expiry final; पर function baseline में **exist नहीं करता** (`05_jobs.sql` L484 pg_cron केवल views_count context) — implementation pending. |
| G14 | `temp1.md` | Decision space में **3 options**: (1) Outbox→Cloud Tasks→Consumer, (2) Outbox→Direct Processor, (3) PG function direct insert — requirement doc का A/B subset है | Option 2 separately evaluate किया (Section 8, Option C). |
| G15 | `11_messaging.sql` L106–233, L445–484 | `messages`, read receipts, `conversation_participants.unread_count` (trigger-maintained) | Chat का durable unread system **पहले से है** — chat-alert design में double-counting risk (Section 6.8). |
| G16 | NFR §1–§8 | Duplicate delivery ⇒ duplicate result नहीं; outage delays processing, committed data safe; cost-efficient + budget alerts; observability defined | Reliability bar: at-least-once + idempotency, not zero-loss-at-all-costs. |
| G17 | `04-nestjs-api-app/` directory | **कोई src/package.json नहीं** — API implementation docs-only | Decision pre-implementation window में — कोई migration lock-in नहीं. |
| G18 | `contracts/events/*.json` | 10 contracts सब AI/projection domain के; कोई notification event contract नहीं | In-app path के लिए contract work needed ही नहीं; email पर OD-3 contract बनेगा. |

---

## 3. Requirement Document vs Ground Truth — Cross-Check Result

| Requirement doc claim | Ground truth | Verdict |
|---|---|---|
| Header badge + list, in-app only, email future | PR §15 + `channels` default `{"in_app": true}` + OD-3 reserved | ✅ Consistent |
| Active user → live header; offline → durable rows + login recovery | DECISION-02 SSE + G1/G2 schema/indexes | ✅ Consistent |
| Job-expiry final: pg_cron → `expire_due_jobs()` direct insert, no Tasks/Dispatcher | DECISION-06 FINAL; function baseline में absent | ✅ Decision consistent, ⚠️ implementation pending |
| Simple path: NestJS TX में notifications row → COMMIT → WS/SSE | Schema supports; DECISION-02 says **SSE** (doc का "WebSocket/SSE" से specific) | ✅ with correction: transport = per-user SSE stream (chat alert exception, Section 6.8) |
| Recovery: `GET /notifications?unread=true` | G2 partial index ready; RLS के चलते read NestJS से ही | ✅ |
| Alternative B under review | temp1.md में तीसरा option भी है (Outbox→Direct Processor) | ✅ तीनों evaluated (Section 8) |

---

## 4. Conflict Register (NFR §7 — report, don't guess)

**C-1 · `12_notifications.sql` header comment vs proposed simple path.**
Baseline header (L10–16) runtime flow बताता है: *domain TX + outbox event → notification worker template/preferences resolve → idempotent insert → per-channel delivery rows → provider send*. Proposed Option A में business service **खुद same-TX में row insert करता है**, outbox/worker skip करता है। DDL दोनों को allow करता है (`template_id` nullable, direct title/body valid), पर documented flow अलग है। **Resolution needed:** Option A adopt होने पर `12_notifications.sql` header comment + `12_notifications_Explanation.md` update हों (in-app = direct insert; outbox worker flow external channels के लिए scoped). SQL behavior नहीं, सिर्फ documentation drift है — पर repo discipline के अनुसार explicit fix चाहिए।

**C-2 · Requirement doc "WebSocket/SSE" vs DECISION-02 frozen split.**
Requirement doc और antigravity report दोनों "WebSocket/SSE" loosely use करते हैं। DECISION-02 §2 frozen है: in-app notifications = **same per-user SSE stream**; WebSocket सिर्फ chat के लिए। Chat-alert case में live delivery chat WS gateway ride कर सकता है (Section 6.8), पर notifications का primary transport SSE ही है। Implementation इसी से deviate न करे।

**C-3 · "expire_due_jobs()" नाम पर कोई baseline anchor नहीं.**
Function केवल requirement doc/temp1.md में named है; baseline SQL में नहीं। यह audit scope से बाहर implementation item है (DECISION-06 already final), पर जब तक migration लिखा न जाए, expiry-notification path "designed, not built" ही गिना जाएगा।

---

## 5. Detailed Analysis — Requirement Side (Q1–Q3)

### 5.1 (Q1) Actual in-app notification requirement

**क्या है:** PR §15 approved direction + temp1 requirement doc मिलकर एक crisp contract देते हैं:

1. `notifications` table में durable per-user rows (event_type-wise) — **storage requirement**
2. Active user का header badge/list live update — **latency requirement** (seconds, not minutes)
3. Offline user को login/open पर unread list — **recovery requirement**
4. Channel = in-app only; delivery-channel state in-app state से अलग track

**क्या requirement नहीं है (common confusion):**
- "Zero notification loss under every failure mode" नहीं है requirement। NFR §1 खुद कहती है: *one component outage processing delay कर सकती है, committed user data नहीं मिटाए* — delay acceptable है, permanent loss नहीं। Same-TX insert इस bar को पूरा करता है क्योंकि notification row business data के साथ commit होती है।
- Sub-second push guarantee नहीं है requirement। Header badge के लिए 1–5s भी fine है; DECISION-02 page-scoped polling fallback भी allow करता है।
- Per-event recipient/channel matrix अभी freeze नहीं — वह separate "notification contract" product work है (G12), architecture blocker नहीं।

**Schema fit check:** हर requirement के लिए column/index already exists — `is_read`/`read_at` (read state), `idx_notifications_unread` (inbox query), `channels` (channel scoping), `idempotency_key` (dedup), `entity_type/entity_id` (navigation), `group_key/group_count` (stacking), `expires_at` (auto-stale alerts). **Requirement ↔ schema gap = zero.**

### 5.2 (Q2) Active-user live header update

Frozen transport (DECISION-02): per-user authenticated **SSE stream**, event = lightweight sanitized nudge (`{notification_id, event_type}` या सिर्फ "unread-changed" signal), client फिर unread count/list REST से fetch करता है या payload से direct update करता है। Flow:

```text
NestJS command TX: business row + notifications row INSERT (same TX)
        ↓ COMMIT
post-commit, same process: RealtimeModule → SSE emit to user stream
        ↓
Next.js header: badge count + list prepend
```

Key properties:
- **Commit-first ordering** (DECISION-02 §6): DB commit पहले, SSE बाद में। SSE fail हो जाए तो business command और notification row दोनों safe — recovery path cover करेगा।
- **Single-instance fan-out:** Cloud Run min-instances=1 पर in-process connection registry से user-stream lookup trivial है। Multi-instance होने पर in-memory registry insufficient — यह documented future gap है जिसे DECISION-02 §3 already anticipates (Broadcast bridge via future ADR)। Current scale target (NFR §2 ~1000 uploads burst) single API instance से परे नहीं; hardening trigger criteria Section 15 ND-6 में।
- Nudge-only payloads = no PII leakage risk on stream, consistent with DECISION-02 §6.

### 5.3 (Q3) Offline-user notification recovery from notifications table

Recovery read path:

```text
login / app open / SSE reconnect / tab focus
        ↓
GET /api/v1/notifications?unread=true&limit=N   (NestJS-mediated; RLS grants browser को direct read देते ही नहीं)
        ↓
SELECT ... WHERE user_id=$1 AND is_read=false AND is_archived=false AND deleted_at IS NULL
ORDER BY created_at DESC LIMIT N
        ↓ hits idx_notifications_unread (G2)
header badge + list populate
```

- यही path crash/duplicate/disconnect सब कुछ recover करता है — WebSocket/SSE केवल optimization (baseline header comment L19 इसे explicitly कहता है: *"Database rows are the durable truth; realtime delivery is only transport"*).
- Mark-read: `PATCH /api/v1/notifications/:id/read` (और bulk mark-all); identity-guard trigger read/archive mutations allow करता है, content immutable रखता है — schema design पहले से इसी usage के लिए है।
- Pagination discipline (NFR §2 "bounded queries") के अनुसार limit+cursor; inbox infinite नहीं होगा।

---


