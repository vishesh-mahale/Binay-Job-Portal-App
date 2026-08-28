# ox-alpha — Automatic Job Expiry Architecture Audit (Unbiased)

**Auditor:** ox-alpha (Independent, 15+ YOE distributed-systems & NestJS perspective)
**Date:** 2026-08-24
**Mode:** Read-only audit — कोई file modify नहीं की गई; कोई नया table/event/endpoint/scheduler assume नहीं किया गया।
**Scope:** Binay Job Portal — automatic job expiry concern
**Final Status:** **`NEEDS_DECISION`** (Section 14)

> ⚠️ Independence note: पहले के agent reports (`antigravity-JOB-EXPIRY-AUDIT.md`, `freebuf-JOB-EXPIRY-AUDIT.md`) को source नहीं, सिर्फ comparison object माना गया। हर claim baseline SQL/docs से independently verify है। जहाँ disagree हूँ, Section 11.3 में reasons हैं।

---

## 1. Root Cause

Expiry concern किसी bug से नहीं निकला — यह **schema capability और runtime mechanism के बीच का ownership vacuum** है:

1. **Baseline schema expiry को first-class store करता है** — `jobs.expires_at` ("Auto-close after this date"), `job_status` enum में `'expired'`, dedicated partial index `idx_jobs_expiring` — लेकिन **कोई executable auto-close mechanism exist नहीं करता**। `05_jobs.sql` के 8 triggers में expiry trigger नहीं; कोई scheduled SQL function jobs को touch नहीं करता।
2. **Read-side contract तय है, write-side owner नहीं** — `SEARCH-STRATEGY.md` demand करता है कि expired jobs search से "पहले ही exclude" हों, और `analytics_daily_aggregates.jobs_expired` counter expiry को business metric मानता है। पर कौन `published → expired` flip करेगा — कोई doc freeze नहीं करता।
3. **PHASE-04 इसे deliberately open छोड़ता है** — state machine में `published/paused -> expired` legal है, पर document `Draft` है और transition policy `TBD` है। Origin = **planned-but-unassigned behavior**, accident नहीं।

**मूल प्रश्न:** क्या expiry query-time predicate से solve होता है (virtual), या physical flip चाहिए — और हो तो किस existing component में?

## 2. Existing Repository Evidence

### 2.1 Schema evidence (`02-database/migrations/baseline/`)

| File : Line | Evidence | Architectural implication |
|---|---|---|
| `02_enums.sql` L161–169 | `job_status AS ENUM ('draft','pending_approval','published','paused','closed','expired','archived')`; `'expired'` = *"Past the expiry date"* | Expiry distinct terminal reason है, employer-driven `'closed'` (filled) से अलग |
| `05_jobs.sql` L165 | `expires_at TIMESTAMPTZ, -- Auto-close after this date` | Nullable → expiry optional per job |
| `05_jobs.sql` L166–168 | `paused_at`, `closed_at`, `closed_reason` present; **कोई `expired_at` column नहीं** | Physical flip पर expiry timestamp के लिए dedicated field absent — evidence `updated_at`/audit_logs में ही बचेगा |
| `05_jobs.sql` L203 | `valid_dates CHECK (expires_at IS NULL OR expires_at > created_at)` | सिर्फ validation, enforcement नहीं |
| `05_jobs.sql` L18–28 | Trigger inventory: updated_at ×4, view aggregates, FTS ×3 — **कोई expiry trigger/function नहीं** | DB-side auto-close baseline में exist ही नहीं करता |
| `05_jobs.sql` L271–274 | "Only verified companies can publish… enforced by NestJS business layer" | Repo convention: job business rules NestJS ownership |
| `05_jobs.sql` L483–485 | `jobs_refresh_views_count_from_aggregates()` — *"run every 5–15 minutes via pg_cron or an external scheduler"* | Periodic maintenance intent exists, पर owner choose नहीं; comment derived-counter (views_count) के लिए है, business-status के लिए नहीं |
| `16_indexes.sql` L646–648 | `idx_jobs_expiring ON jobs(expires_at) WHERE status='published' AND expires_at IS NOT NULL AND deleted_at IS NULL`; comment: *"Upcoming expiry for notifications"* | Index upcoming expiries + pre-expiry reminder intent दिखाता है; past-due sweep भी इसी index से efficient; **पर paused rows इसमें नहीं** (partial predicate) |
| `16_indexes.sql` L634–664 | सभी listing indexes partial on `status='published' AND deleted_at IS NULL` | Candidate-facing performance physical status पर keyed |
| `13_analytics.sql` L111, L122 | `analytics_daily_aggregates` — *"Updated by scheduled cron jobs or triggers"*; `jobs_expired INTEGER NOT NULL DEFAULT 0` | Expiry counted business metric; populate करने वाला function अभी absent |
| `13_analytics.sql` L173–230 | `audit_logs`: `actor_service` (*"Required when a trusted system/worker… performs the action"*), action format `'job.created'`-style, `old_values/new_values/changes JSONB`, actor-XOR-service CHECK | System-initiated expiry के लिए **existing audit infrastructure ready** |
| `15_infrastructure.sql` L4–13 | Header: *"Google Cloud Scheduler only checks whether due/stale work exists and wakes Dispatcher. Webhook/Cron payload is never business truth."* | Scheduler defined role = dumb wake signal only |
| `15_infrastructure.sql` L315–328 | `outbox_recovery_needed()` — STABLE SECURITY DEFINER EXISTS check | **एकमात्र defined scheduled DB touchpoint**, strictly outbox-scoped |
| `17_rls.sql` L7, L79 | jobs RLS enabled; public candidate-browse SELECT policy नहीं | Candidate reads NestJS trusted path से → query-layer filtering का single natural enforcement point |

### 2.2 Architecture-document evidence

| Document : Section | Evidence | Implication |
|---|---|---|
| `PHASE-04` L3, L9–17 | Status **Draft**; authority order; "NestJS must use an explicit transition policy and tests" | Transition policy freeze बाकी phase का काम |
| `PHASE-04` L19–43 | Global transaction template; *"A status update that requires history must update current state, append history, audit, and outbox atomically"*; external calls commit के बाद only | Physical expiry हो तो यह template binding है |
| `PHASE-04` L119–132 | `published -> closed/expired/archived`; `paused -> closed/expired/archived`; reopen assumed नहीं; repost = new `job_id` | `expired` legal one-way transition; **trigger/owner undefined** |
| `PHASE-04` L214–225 | State-machine test exit criteria (timestamps/history per accepted transition) | Sweep implement हो तो tests mandatory |
| `DECISION-01` (APPROVED/FROZEN) | Controlled Hybrid: system/worker operations trusted server role से; NestJS main business layer | System-actor DB writes का approved access model exists |
| `DECISION-02` (APPROVED/FROZEN) | *"Realtime delivery sirf UI optimization hai. Durable truth PostgreSQL rows aur histories hain."* | Passive expiry के लिए realtime push की ज़रूरत ही नहीं |
| `SEARCH-STRATEGY.md` L196, L323 | *"Unpublished, expired, soft-deleted… पहले ही exclude होगी"*; *"Published active jobs ही public search में आएँ"* | **Hard read-side contract** |
| `PRODUCTION-SCHEMA-BLUEPRINT.md` L96–112 | Write ownership matrix; FastAPI = parsing/evidence/projection only | Jobs domain writes NestJS/recruiter side के, AI worker के नहीं |
| `PRODUCTION-SCHEMA-BLUEPRINT.md` L123–124, L238–239 | Scheduler = *"missed/stuck event recovery only (final backup)"* (`dev-outbox-recovery-sweep`, 10 min) | मौजूदा scheduler job का contract outbox-tak limited है |
| `BACKGROUND-WORKER-ARCHITECTURE-OPTIONS` §8 L236–313 | Dispatcher wake = Supabase INSERT webhook (primary); Cloud Run `min=0, max=1`; Cron recovery-only हर 10 min | Scale-to-zero + wake-driven processing established system pattern |
| Dispatcher `src/routing/event-route.registry.ts` | Registered: `resume.parse.requested`, `candidate.profile.changed`, `job.ai.enrichment.requested` + Phase-2 AI events; `notification.email.requested` unregistered (OD-3); *"Unknown event types are handled fail-closed"*; Gate G-5 unroutable-event discipline | कोई job-lifecycle/expiry event route **exist नहीं करता** — आज expiry outbox event emit होते ही dispatcher fail-closed करेगा |
| `05-outbox-dispatcher-nestjs/IMPLEMENTATION-PENDING.md` | P0–P4 gates; G-1(b) producer envelope alignment; OD-1 least-privilege dispatcher DB role | Dispatcher खुद pre-production; नई responsibility add करना risk |
| `NESTJS-IMPLEMENTATION-GUIDE.md` §15–18 L408–493 | "NestJS API outbox publish/dispatch नहीं करती"; module list में `JobsModule`; Jobs ownership row: *list, detail, search / save-unsave / create, publish, close, update owned job*; aggregate-oriented repositories; required tests | Expiry logic का natural home planned `JobsModule` है |

---

## 3. Actual Business Requirement

Evidence से requirements दो tiers में split होते हैं:

### Tier 1 — Non-negotiable (documented contract)

| # | Requirement | Source |
|---|---|---|
| B1 | `expires_at` pass हो चुकी job candidate search/listing/detail में **कभी न दिखे** | `SEARCH-STRATEGY.md` L196, L323 |
| B2 | Expired job पर **apply reject** — transaction के अंदर re-validation के साथ (race-proof) | `PHASE-04` §2 template + terminal-state semantics |
| B3 | Expiry handling Cloud Run scale-to-zero + multi-instance safety तोड़े नहीं | Background-worker docs §8; blueprint delivery path |

### Tier 2 — Implied capability, product approval pending

| # | Item | Evidence | Missing decision |
|---|---|---|---|
| B4 | Physical `status='expired'` flip | Enum value + `idx_jobs_expiring` + PHASE-04 graph | Flip करना ही है या नहीं; cadence |
| B5 | Employer expiry notification / pre-expiry reminder | Index comment *"Upcoming expiry for notifications"* | Consumer कौन; OD-3 unresolved |
| B6 | Expiry का audit record | `audit_logs.actor_service` system actors के लिए designed; PHASE-04 L43 rule | क्या expiry "requires history" category में है |
| B7 | `jobs_expired` analytics counting | `analytics_daily_aggregates` schema | Aggregation कौन चलाएगा |

**Verdict (Q3):** Expiry एक **real business requirement (visibility + apply-guard)** है। लेकिन **physical status transition अभी सिर्फ schema capability** है — runtime owner और cadence product-approved नहीं। Tier-1 implement-ready है; Tier-2 approval के बिना freeze नहीं होना चाहिए।

---

## 4. All Viable Alternatives Discovered Independently

मैंने कोई predefined option list use नहीं की; नीचे सात options हैं जो repo में मौजूद components से construct होते हैं।

### Option A — Virtual Expiry (pure query-layer predicate, कोई physical change नहीं)

```sql
-- हर candidate-facing query में mandatory predicate:
WHERE status = 'published'
  AND deleted_at IS NULL
  AND (expires_at IS NULL OR expires_at > NOW())
```

- **Mechanism:** `JobsModule` repository/query service हर read path (list, detail, FTS, semantic, saved-jobs join) पर यह predicate लगाता है; apply command transaction के अंदर same check करता है।
- **Pros:** Zero new infrastructure; exact-time correctness (`NOW()` DB clock); scale-to-zero perfect; multi-instance trivially safe; `$0`.
- **Cons:** Employer dashboard में job अब भी physically `'published'` दिखेगी (effective-status CASE से label compute करना पड़ेगा); कोई system audit row नहीं बनता; `jobs_expired` counter aggregation-query से derive होगा; future notification features के लिए base नहीं बनता।
- **Boundary compliance:** ✅ पूरा — NestJS business layer + trusted path (DECISION-01), RLS jobs browse के लिए design भी नहीं है।

### Option B — Hybrid: Option A + Periodic Physical Reconciliation Sweep

- **Mechanism:** Read path वही Option A वाला; इसके ऊपर periodic batch reconciliation:
  `UPDATE jobs SET status='expired' WHERE status IN ('published','paused') AND expires_at <= NOW() AND deleted_at IS NULL` — same transaction में per-job `audit_logs` row (`actor_service` set) PHASE-04 §2 template के अनुसार।
- **Trigger (यहाँ honesty ज़रूरी है):** Cloud Run `min=0` पर in-process timer unreliable है। Repo-consistent pattern = scheduler HTTP wake → internal NestJS endpoint. लेकिन **आज ऐसा कोई endpoint और कोई scheduler job exist नहीं करता** — दोनों NEW infrastructure हैं जिन्हें मैं assume नहीं कर सकता; product/architecture approval चाहिए।
- **Pros:** Dashboard/analytics/notifications के लिए clean physical state; candidate correctness फिर भी Option A predicate से exact रहती है (sweep latency correctness affect नहीं करती); idempotent.
- **Cons:** नया schedule + नया guarded internal endpoint; operational surface बढ़ती है।

### Option C — Continuous Daemon / In-process Poller (`@nestjs/schedule` interval)

- 1–5s polling loop API instance के अंदर।
- **REJECTED.** Cloud Run `min instances=0` पर instance बंद = cron fire ही नहीं (reliability zero); traffic होने पर multiple instances parallel fire (idempotency से harm नहीं पर waste); "always-on" economics scale-to-zero के खिलाफ; background-worker docs के wake-driven pattern के सीधे विरुद्ध।

### Option D — Database-side Scheduled Transition (`pg_cron` + SQL function)

- **Mechanism:** Supabase Postgres में pg_cron extension से हर N मिनट SQL function jobs.status flip करे (+ optionally audit_logs insert same function में)।
- **Analysis:** Schema comments (`05_jobs.sql` L483–485, `13_analytics.sql` L111) pg_cron को derived counters/aggregates के लिए contemplate करते हैं — वह acceptable category हो सकती है। पर **business workflow status** अलग बात है:
  - DECISION-01/blueprint के अनुसार business writes NestJS trusted path से जाते हैं;
  - PHASE-04 L17/L123: transition policy + tests NestJS enforce करेगा — DB cron वह policy duplicate/bypass करेगा (policy drift risk);
  - transition validation के लिए applications domain में DB function (`09_applications.sql` ~L600) exists, **jobs के लिए कोई equivalent function baseline में नहीं** — नया function लिखना = schema change;
  - pg_cron Supabase project/plan availability repo में कहीं established नहीं;
  - audit/outbox atomicity SQL में reimplement करनी पड़ेगी।
- **REJECTED for business status** (derived-counter refresh के लिए future में acceptable, वह अलग concern है)।

### Option E — Event-driven Delayed Task (publish पर outbox event → Cloud Tasks `scheduleTime = expires_at`)

- **REJECTED.**
  - नया event type + route + contract चाहिए (G-1(b)/G-5 gates pending; मैं invent नहीं कर सकता);
  - Cloud Tasks scheduled dispatch documented ~30-day advance limit — लंबी postings के लिए fallback फिर भी sweep जैसा mechanism चाहिए;
  - Manual close/pause/repost के साथ cancellation races (task आएगा और job पहले ही closed — harmless idempotent skip लिखना पड़ेगा);
  - हर publish पर future task create = queue cost/ops बढ़ती; benefit सिर्फ physical-flip latency कम करना है, जो candidate correctness के लिए irrelevant है (Option A predicate देखता है)।

### Option F — मौजूदा Outbox Recovery Sweep को extend करना (dispatcher/scheduler path reuse)

- **Mechanism idea:** `outbox_recovery_needed()` में "expirable jobs exist?" जोड़ दो; 10-min scheduler wake पर dispatcher recovery flow expiry भी process कर दे।
- **REJECTED — architecture boundary violation:**
  - Dispatcher README §1 **Single Responsibility Rule** explicitly: *"❌ No Business Logic… ❌ No Producer Behavior… ✅ Pure Dispatching"*; `15_infrastructure.sql` L12–13 scheduler role fix करता है: *"only checks whether due/stale work exists"* — outbox-tak scoped;
  - Blueprint §Outbox dispatch boundary + write-ownership matrix के अनुसार Dispatcher = transport/publishing only, domain state writes उसका काम नहीं;
  - `NESTJS-IMPLEMENTATION-GUIDE.md` §16 explicitly कहता है dispatcher को API module में background loop की तरह embed नहीं करना — domain maintenance responsibilities add करना उसी boundary को erode करेगा;
  - Dispatcher खुद pre-production gates (P0–P4) से गुज़र रहा है।

### Option G — DB VIEW / computed effective-status projection

- **Mechanism idea:** `jobs_effective_public` view जो `CASE WHEN status='published' AND expires_at<=NOW() THEN 'expired' …` expose करे; queries view पर चलें।
- **REJECTED as necessary.** यह Option A का schema-object variant है — नया schema object बिना need के; jobs reads पहले से NestJS trusted path से जाते हैं (17_rls में public browse policy नहीं), इसलिए predicate centralization repository layer में ही पूरा हो जाता है। FTS/HNSW indexes partial predicates views के नीचे भी वैसे ही काम करेंगे; view बस indirection जोड़ता।

---

## 5. Option Comparison Table

| Criteria | **A: Virtual only** | **B: Hybrid (A + sweep)** | C: Daemon poller | D: pg_cron DB flip | E: Delayed Cloud Task | F: Extend recovery sweep | G: Effective-status VIEW |
|---|---|---|---|---|---|---|---|
| Candidate correctness latency | ✅ exact (`NOW()`) | ✅ exact | ~1–5s | ~sweep interval | near-0 | sweep interval | ✅ exact |
| Physical `expired` flip | ❌ none | ✅ periodic | continuous | scheduled | event-time | sweep interval | virtual only |
| New infra required | ✅ zero | ⚠️ endpoint+schedule (approval) | ❌ none but wrong | SQL fn + extension | event+route+contract | behavior change in frozen contract | new view object |
| Cloud Run scale-to-zero | ✅ | ✅ | ❌ breaks | n/a (DB) | ✅ | ✅ | ✅ |
| Multi-instance safety | ✅ trivially | ✅ idempotent batch | ⚠️ duplicate fires | ✅ single writer | ⚠️ cancel races | ✅ idempotent | ✅ |
| DB lock contention | 🟢 none (reads) | 🟢 low (bounded, one-shot per job) | 🔴 high frequency | 🟡 moderate | 🟢 low | 🟢 low | 🟢 none |
| Audit consistency | 🟡 derive-only | ✅ audit_logs atomic | ✅ | ⚠️ policy drift risk | ✅ | ❌ out-of-template | 🟡 derive-only |
| Service-boundary compliance | ✅ | ✅ (JobsModule owns) | ❌ ops anti-pattern | ❌ bypasses NestJS policy | ⚠️ contract invention | ❌ **violates** dispatcher boundary | ⚠️ unnecessary indirection |
| Cost | 🟢 $0 | 🟢 ≈$0 (free-tier slots) | 🔴 always-on | 🟢 $0 | 🟡 queue ops | 🟢 $0 | 🟢 $0 |
| Implementation effort | 🟢 low | 🟡 medium | 🟢 low | 🟡 medium | 🔴 high | 🔴 high + risky | 🟢 low |

---

## 6. Performance Analysis

1. **Read path (both A and B):** Candidate listing/search queries पहले से partial indexes (`idx_jobs_active_listings`, `idx_jobs_published_date`, `idx_jobs_filters`, HNSW) के through `status='published' AND deleted_at IS NULL` subset scan करते हैं; `expires_at` residual predicate उसी subset पर apply होता है — extra index requirement नहीं। `idx_jobs_expiring` (`expires_at` ascending on published) range conditions (`expires_at > NOW()` / `<= NOW()`) दोनों serve कर सकता है। Repo discipline (`16_indexes.sql` L8–10, L46) के अनुसार realistic seed volume पर `EXPLAIN (ANALYZE, BUFFERS)` verification mandatory है — यह recommendation उस discipline के अधीन है।
2. **Sweep write path (B):** Past-due rows `idx_jobs_expiring` के leading edge पर होती हैं → indexed bounded batch; हर job lifetime में एक बार flip होती है (terminal), hot-row contention practically zero; single-statement UPDATE atomic — crash का अर्थ "कुछ नहीं हुआ", next tick catch-up।
3. **Paused-jobs gap (B):** `idx_jobs_expiring` partial predicate `status='published'` है — paused past-due rows इस index में **नहीं मिलतीं**, जबकि PHASE-04 `paused -> expired` allow करता है। Sweep को paused coverage के लिए अलग condition/index strategy चाहिए — अगर EXPLAIN बड़ा seq-scan दिखाए तो index extension एक reviewed forward-migration item बनेगा (schema change = approval)।
4. **Clock authority:** Query predicate और sweep दोनों DB `NOW()` use करें — application-clock skew irrelevant रहता है; read/write consistency एक ही clock से आती है।
5. **FTS/semantic paths:** Expiry exclusion ranking को affect नहीं करती — यह hard eligibility filter है (`SEARCH-STRATEGY.md`: "Exact eligibility filters score नहीं, hard constraints हैं"), hybrid scoring से पहले apply होगी।
6. **Partial-index implication rule (verified):** `supabase-query-index-use-approach.md` §5 — *"Query predicate planner को index predicate imply करने देना चाहिए"*। Read predicate का `(expires_at IS NULL OR expires_at > NOW())` OR-shape `idx_jobs_expiring` के partial predicate (`expires_at IS NOT NULL`) को imply **नहीं** करता → listings status-partial indexes (`idx_jobs_active_listings` आदि) + residual filter use करेंगी, जैसा ऊपर point 1 में है — कोई नया index mandatory नहीं। Sweep का past-due predicate (`expires_at <= NOW()`, no OR) implication satisfy करता है। Measurement workflow उसी guide के §3 (`EXPLAIN ANALYZE, BUFFERS`, "rows removed by filter") और §11 (baseline refinable → measured change → reset/rerun; freeze के बाद forward migration) के अधीन — PD-E6 का approval path यही है।


## 7. Reliability Analysis

| Failure scenario | Option A behavior | Option B behavior |
|---|---|---|
| Sweep/scheduler down | N/A — correctness unaffected | Physical labels stale; **candidates फिर भी protected** (query predicate) |
| Sweep fails repeatedly | N/A | Next tick catch-up; degraded only dashboard/analytics freshness |
| Crash mid-sweep | N/A | Single-statement atomicity → all-or-nothing batch; idempotent retry |
| Duplicate wake / two instances | N/A | Second execution 0 rows update — harmless |
| DB failover | Read predicate same query path | Same |
| Webhook/outbox outage | Unaffected (no outbox dependency for expiry itself) | Unaffected, जब तक sweep outbox-emit नहीं करता |

**Key reliability insight:** Query-layer predicate को "correctness-critical" मानें और physical sweep को "eventually-consistent reconciliation" — इस decoupling से expiry subsystem का blast radius candidate experience से पूरा निकल जाता है। Monitoring: per-run `rows_expired` count log + consecutive-failure alert (worker docs §15 monitoring philosophy के अनुरूप)।

---

## 8. Cost / Operational Analysis

1. **Cloud Scheduler free tier = 3 jobs/month.** `dev-outbox-recovery-sweep` पहले से 1 slot use करता है; एक नया expiry schedule (Option B) total 2 ≤ 3 → free tier में fit। (पिछले reports का "$0.00" claim तब तक ही सही जब slot accounting ऐसे रहे; third/fourth schedule add होते ही paid ~$0.10/job/month।)
2. **Cloud Run:** Sweep invocation ≈ sub-second cold-or-warm run, 96–288 invocations/month — free-tier requests/CPU-seconds में negligible; scale-to-zero preserved (min instances=0)।
3. **Database:** Bounded indexed UPDATE every N minutes + read-path residual filter — Supabase compute पर negligible; कोई नया table/queue/storage नहीं।
4. **Operational surface:** Option A = zero new ops. Option B = +1 guarded endpoint, +1 schedule, +1 secret rotation item, monitoring metric. Option C/E/F = materially higher ops (always-on compute / queue contracts / dispatcher re-governance) — cost-benefit negative क्योंकि user-visible correctness gain = 0 (A already exact).

---

## 9. Security and Authorization

1. **Candidate reads:** jobs table पर public browse RLS policy नहीं है (`17_rls.sql` L7 comment) — सारे candidate-facing reads NestJS trusted path (DECISION-01) से जाते हैं → expiry predicate server-side single-point enforcement; client tampering irrelevant.
2. **Apply-guard:** Application submission transaction के अंदर job state re-read/re-validate (PHASE-04 §2 template) — TOCTOU race between sweep ticks और apply request inherently covered.
3. **Internal sweep endpoint (अगर B approve हो):**
   - Dedicated shared-secret header guard — concrete repo precedent: dispatcher wake endpoint `POST /internal/dispatcher/wake` with **constant-time comparison + dual-secret rotation + body discarded** (`05-outbox-dispatcher-nestjs/README.md` §3–4);
   - Secret Secret Manager में (dispatcher P0-2 gate के अनुरूप), Cloud Run binding से inject; browser/client/logs/task payload में kabhi नहीं;
   - Endpoint system-only route category; scheduler identity के अलावा कोई caller authorize नहीं; rate-limit + payload-size validation dispatcher-wake discipline के अनुसार।
4. **DB actor:** Trusted server role (DECISION-01 mapping: "Controlled admin/system cleanup ho → Trusted server role") — least-privilege role OD-1 discipline से align; service_role browser तक kabhi nahi.
5. **No PII in any expiry path:** Expiry payload/audit में job id, status transition, reason — candidate data नहीं।

## 10. Audit / Outbox / Realtime Impact (Q6)

| Concern | Analysis | Position |
|---|---|---|
| **Audit/history** | `audit_logs` table system actors के लिए designed है (`actor_service`, old/new values, action `'job.…'` format)। PHASE-04 L43 rule: history-requiring status update = state + history + audit + outbox atomic। अगर physical sweep approve हो तो per-job audit row same transaction में **mandatory** मानना चाहिए; dedicated `expired_at` column baseline में नहीं — expiry timestamp का durable evidence audit_logs + `updated_at` ही होगा | RECOMMENDED (B adopt होने पर); A-only पर audit derive-only रहेगा |
| **Outbox** | Dispatcher registry में कोई job-lifecycle event route नहीं; unknown events fail-closed (G-5 discipline); `notification.email.requested` खुद unregistered है (OD-3)। आज expiry event emit करना = guaranteed unroutable/dead-letter noise | ❌ अभी नहीं — consumer + contract approval के बिना emit मत करो |
| **Realtime** | DECISION-02: realtime सिर्फ UI optimization; passive expiry candidate को push करने की ज़रूरत ही नहीं — dashboard REST refetch/recovery path sufficient; SSE use-case table में job-expiry entry है ही नहीं | ✅ No impact — कुछ add मत करो |
| **Analytics** | `jobs_expired` counter populate करने वाला कोई function baseline में absent; physical flip हो तो sweep-run counts natural source; virtual-only पर daily aggregation query से derivable | Implementation item, product decision नहीं |

---

## 11. Recommended Architecture

### 11.1 Placement verdict — कौन component expiry own करे (Q7 + placement question)

| Component | Expiry ownership? | Reason |
|---|---|---|
| **Query layer (NestJS repository/query service)** | ✅ **YES — mandatory** (RECOMMENDED now) | SEARCH-STRATEGY contract यहीं enforce होता है; jobs public RLS browse path नहीं → single enforcement point; zero infra |
| **NestJS business layer (`JobsModule`) — physical sweep** | ✅ YES, **पर सिर्फ Tier-2 approvals के बाद** (RECOMMENDED, NEEDS_DECISION) | Blueprint write-ownership + PHASE-04 transition policy + PHASE-04 §2 transaction template यहीं fit होते हैं; DECISION-01 trusted role path ready |
| **Database (trigger/pg_cron)** | ❌ NO for business status | Business-transition policy NestJS का mandate (PHASE-04 L17/L123); jobs के लिए DB transition function baseline में absent; policy drift + pg_cron availability unestablished |
| **Dispatcher (05)** | ❌ NO — boundary violation | Transport/publishing only (blueprint dispatch boundary; write-ownership matrix); guide §16 embed prohibition; pre-production gates |
| **Scheduler (Cloud Scheduler)** | ⚠️ Only as dumb wake signal, नए schedule के रूप में — payload business truth कभी नहीं | Existing recovery-sweep contract frozen to outbox ("recovery only"); उसे extend करना Option F violation है |
| **FastAPI worker (07)** | ❌ NO | Write-ownership: AI/document/projection domain only; jobs lifecycle recruiter-domain है |
| **Realtime layer** | ❌ NO | DECISION-02 |

### 11.2 Layered recommendation

```text
LAYER 1 (mandatory, implement-ready):        [RECOMMENDED]
  JobsModule query service/repository
    -> हर candidate-facing read: status='published' AND deleted_at IS NULL
       AND (expires_at IS NULL OR expires_at > NOW())
    -> Apply command: BEGIN -> lock/read job row -> reject if expired/closed
    -> Saved-jobs listing join पर वही predicate
    -> Employer dashboard: effective-status CASE label (virtual)

LAYER 2 (value-add, blocked on product decisions):   [RECOMMENDED, NEEDS_DECISION]
  JobsExpirySweepService (system use-case in JobsModule)
    UPDATE ... WHERE status IN ('published','paused')
      AND expires_at <= NOW() AND deleted_at IS NULL
    + audit_logs rows (actor_service='jobs-expiry-sweep') same TX   [if PD-E4=yes]
    Trigger: NEW guarded internal endpoint + NEW Cloud Scheduler schedule
             (cadence default-proposal: 15 min; wake-only, no payload truth)
    Monitoring: rows_expired metric + consecutive-failure alert
    Explicitly OUT OF SCOPE until approved:
      - कोई outbox emission (कोई registered route/consumer नहीं)
      - कोई realtime push (DECISION-02)
```

**Design invariant:** Layer 1 और Layer 2 independent fail कर सकते हैं; किसी भी combination में candidate correctness exact रहती है। Physical sweep latency सिर्फ employer-facing labels/analytics timing affect करती है — इसलिए "exact-second flip" कोई requirement नहीं बनता।

### 11.3 Divergence from previous agent reports (explicit reasons)

| Previous claim | My position | Reason |
|---|---|---|
| antigravity/freebuf: Final status **READY** | **NEEDS_DECISION** | दोनों ने नया endpoint (`POST /internal/jobs/expiry-sweep`), नया Cloud Scheduler job, और नया outbox event type (`job.status.changed`) assume कर लिया — तीनों repo governance (PHASE-04 authority order; G-1(b)/G-5 gates; OD-3; blueprint delivery contract) के अधीन unapproved inventions हैं। Bina product sign-off ke READY likhna isi process ko bypass karta hai. |
| Both: sweep हर expired job पर `job.status.changed` outbox event emit करे | **Reject for today** | Registry में route नहीं → dispatcher fail-closed → dead-letter noise; notification consumer OD-3 unresolved |
| freebuf: "No `job_status_history` table = gap" | Partially agree, but not a blocker | PHASE-04 template history requirement ko audit_logs se satisfy hota dekh sakta hai; naya table invent karne ki zaroorat evidence se force nahi hoti |
| Both: "$0.00 cost" | Approximately correct but slot-aware | Scheduler free tier 3 jobs; existing recovery sweep already occupies one |

---

## 12. Required Product Decisions

यह सब architecture में नहीं, product/approval layer में pending हैं — इन्हीं के कारण final status `NEEDS_DECISION` है:

| # | Decision | Options | My default-proposal (RECOMMENDED, not APPROVED) |
|---|---|---|---|
| PD-E1 | Auto-expiry product behavior ON है या नहीं; `expires_at` default/max duration policy; employer set करे या system enforce | (product) | Publish flow में optional field, employer-set, sane max cap |
| PD-E2 | Physical flip चाहिए या virtual-only ठीक है | A vs B | B (hybrid) — dashboard/analytics/notifications clean state देता है |
| PD-E3 (अगर B) | Sweep cadence + trigger infra approval: NEW scheduler schedule + NEW guarded internal endpoint | 10/15/60 min | 15 min; endpoint shared-secret guard pattern पर |
| PD-E4 | Expiry "requires history" category में है? → per-job `audit_logs` row sweep transaction में | yes/no | Yes — PHASE-04 L43 rule के consistent |
| PD-E5 | Employer expiry notification / pre-expiry reminder (`idx_jobs_expiring` comment का implied feature) चाहिए? | now/later/never | Later — OD-3 notification contract resolve होने के बाद separate decision |
| PD-E6 | Paused jobs expiry coverage + possible `idx_jobs_expiring` predicate extension (paused rows index में नहीं) | approve EXPLAIN first | EXPLAIN evidence के बाद forward-migration item |

---

## 13. Required Schema / Code Changes

### 13.1 Database schema

- **Layer 1 के लिए ZERO schema changes.** `expires_at`, enum value, partial indexes baseline में पूरे हैं।
- **Layer 2 के लिए भी mandatory zero** — sweep plain UPDATE है। Conditional/pending items (सिर्फ़ approvals के बाद): paused-coverage index extension अगर EXPLAIN justify करे (PD-E6); कोई नया table/event/function मेरी recommendation में नहीं है।

### 13.2 NestJS API (`04-nestjs-api-app`, planned modules के भीतर)

1. `JobsModule` query service/repository: central visibility predicate helper (एक जगह define, सब read paths use करें) — list/detail/search/saved-jobs.
2. `ApplicationsModule` apply command: transaction-inside job-state re-validation (already template-mandated).
3. Employer dashboard DTO: effective-status label compute (virtual) — Layer 2 adopt होने पर भी यह helper physical/virtual दोनों handle करे।
4. (PD-E3 approval पर) `JobsExpirySweepService` + internal controller + secret guard + `rows_expired` metric/log.
5. Tests (PHASE-04 §12 + guide §18 discipline): expired job search/detail में invisible; expired पर apply reject inside TX; duplicate sweep idempotent (0 rows second run); invalid transitions fail without partial writes; audit row present when enabled.

### 13.3 Explicitly NOT changed (boundary preservation)

- Dispatcher service, event registry, queues — untouched.
- Existing `dev-outbox-recovery-sweep` contract — untouched.
- Baseline SQL files — untouched (blueprint pre-freeze reset policy के अलावा कोई edit justified नहीं).

---

## 14. Final Status

### `NEEDS_DECISION`

**Justification:**
1. **Implement-ready portion:** Tier-1 requirement (query-layer exclusion + apply-guard) पूरी तरह existing docs/schema से mandated है — इसे अभी implement किया जा सकता है, RECOMMENDED।
2. **Blocked portion:** Physical status flip (Tier-2) का trigger infrastructure आज repo में exist नहीं करता; उसे introduce करना = नया schedule + endpoint (+ optional audit policy + future notification consumer) — चारों explicit product/architecture approvals माँगते हैं (PD-E1…E6)। PHASE-04 खुद transition policy को TBD रखता है।
3. **Why not READY:** पिछले reports ने unapproved endpoint/schedule/event assume करके READY लिखा — repository की authority order और fail-closed dispatcher governance के अनुसार यह premature है।
4. **Why not NOT_REQUIRED:** Read-side contract (SEARCH-STRATEGY L196/L323), analytics counter, और PHASE-04 transition graph तीनों expiry को real behavior मानते हैं — concern ignore करना documented contract का violation होगा।

**Decision path to READY:** PD-E2=Yes → PD-E3 cadence+infra approve → PD-E4 audit=yes → implementation of Layer 2 → status upgrade. PD-E2=No (virtual-only) पर भी status READY-for-Layer-1-only हो सकता है — वह product का call है, architect का नहीं।

---

## Appendix A — Verification log (evidence anchors)

- Enum: `02_enums.sql` L161–169 · Column/check: `05_jobs.sql` L165/L203/L166–168 · Index: `16_indexes.sql` L646–648
- No expiry trigger/function: `05_jobs.sql` L18–28 trigger inventory · pg_cron mention: L483–485
- Analytics/audit: `13_analytics.sql` L108–122 (jobs_expired), L173–230 (audit_logs.actor_service)
- Outbox/scheduler scope: `15_infrastructure.sql` L4–13, L315–328, L372–377
- State machine/template/tests/open items: `PHASE-04` L3, L19–43, L119–132, L214–237
- Search contract: `SEARCH-STRATEGY.md` L196, L323
- Ownership/delivery: `PRODUCTION-SCHEMA-BLUEPRINT.md` L96–125, L225–245
- Access/realtime models: DECISION-01, DECISION-02 (दोनों APPROVED/FROZEN)
- Wake pattern/dispatcher limits: `BACKGROUND-WORKER-ARCHITECTURE-OPTIONS-HINGLISH.md` §8–9
- Dispatcher routes/fail-closed: `05-outbox-dispatcher-nestjs/src/routing/event-route.registry.ts`; gates: `IMPLEMENTATION-PENDING.md`; Single Responsibility + wake guard precedent: `05-outbox-dispatcher-nestjs/README.md` §1, §3–4
- Query/index discipline: `02-database/schema-docs/supabase-query-index-use-approach.md` §3 (EXPLAIN), §5 (partial-index implication rule), §11 (safe schema workflow)
- Module plan: `NESTJS-IMPLEMENTATION-GUIDE.md` §15–18

*Report generated by ox-alpha. कोई workspace file modify नहीं हुई — यह report file इस audit का single deliverable है.*







