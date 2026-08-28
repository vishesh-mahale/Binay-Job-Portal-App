# Qoder — Automatic Job Expiry Architecture Audit

**Auditor:** Qoder (independent 15+ YOE Distributed-Systems / NestJS Architect)
**Date:** 2026-08-24
**Method:** Koi previous agent recommendation (including antigravity-JOB-EXPIRY-AUDIT.md)
blindly accept nahi ki gayi — har claim baseline SQL, requirements aur architecture docs se
re-verify hua. Alternatives independently derive kiye. Koi naya table/event/endpoint/scheduler
invent karke APPROVED nahi maana gaya. No files modified.

**Labels:** `RECOMMENDED` = is audit ki recommendation (product approval pending);
`DOC-APPROVED` = repo approved source me explicit; `NEEDS_DECISION` = product decision missing.

---

## 1. Root cause

Ye concern **schema capability vs missing enforcement mechanism** ke gap se originate hota hai:

1. Baseline me `expired` ek formal `job_status` enum value hai (`02_enums.sql` L161-169) aur
   `jobs.expires_at TIMESTAMPTZ` column exist karta hai (`05_jobs.sql` L165, comment
   "Auto-close after this date").
2. Lekin `expires_at` pass hone par status flip karne ka **koi mechanism kahin defined nahi**
   — na SQL function/trigger, na NestJS use-case, na scheduler job, na worker task.
3. Transition audit (`qoder-JOB-APPLICATION-TRANSITION-AUDIT.md` P-6) ne isse explicit
   `NEEDS_CLARIFICATION` mark kiya tha; PHASE-04 §7 `published/paused -> expired` edge
   likhta hai par executor define nahi karta.
4. Sath hi search design (`schema-docs/SEARCH-STRATEGY.md` L196) kehta hai expired jobs
   search se exclude hongi — isliye "exclude kaise hoga, physical flip zaroori hai ya nahi"
   ye architectural sawal bana.

Root cause summary: **enum + column + index design me aa gaye, execution policy nahi aayi.**

## 2. Existing repository evidence

| Evidence | Location | Verified fact |
|---|---|---|
| `expired` enum value | `02_enums.sql` L167 | Formal job status; enum comment "Past the expiry date" |
| `expires_at` column | `05_jobs.sql` L165 | Optional TIMESTAMPTZ; comment "Auto-close after this date" (wording ambiguity — G-7 transition audit) |
| Positive-duration constraint | `05_jobs.sql` L203 | `valid_dates CHECK (expires_at IS NULL OR expires_at > created_at)` |
| `idx_jobs_expiring` | `05_jobs.sql` L646-648 | Partial index `ON jobs(expires_at) WHERE status='published' AND expires_at IS NOT NULL AND deleted_at IS NULL`; comment: **"Jobs: Upcoming expiry for notifications"** — schema intent expiry-sweep/notification support ka explicit hai |
| Terminal state freeze | `DECISION-05-...-HINGLISH.md` L26-27 | `closed, expired, archived` terminal honge; reopen nahi; repost = new job_id (**DOC-APPROVED**) |
| Transition edges | `PHASE-04` L128-129 | `published -> expired`, `paused -> expired` baseline candidate flow me listed |
| Search exclusion intent | `SEARCH-STRATEGY.md` L196 | "Unpublished, expired, soft-deleted ... job pehle hi exclude hogi"; L85 filter columns me "published/expires dates" |
| Product requirement | `PRODUCT-REQUIREMENTS.md` §9 (L116-125) | Approved wording: "create/edit/publish/**close/archive**" — **expiry/expire ka koi zikr NAHI**; repo-wide grep: 01-requirements me job-expiry requirement NAHI mila (sirf guest-session/invitation expiry milte hain) |
| Existing scheduler | `docs/architecture/background-processing/*.md` | Google Cloud Scheduler **approved hai, sirf recovery role me** (missed/stuck outbox events, ~10 min, Phase 8); "Cron main worker nahi" |
| Dispatcher boundary | `05-outbox-dispatcher-nestjs/src/**` | Wake-driven outbox publisher only; koi scheduler/business-sweep component nahi |
| Read-time enforcement precedent | `NESTJS-IMPLEMENTATION-GUIDE.md` L350; `PHASE-04` §6.2/L103 | Guest sessions/claims me expiry **verification-time** enforce hoti hai ("active + unexpired verify") — physical flip alag workflow hai |
| Apply transaction | `09_applications_Explanation.md` L64 | "lock/check published job" — apply guard already job state check karta hai; expiry predicate wahan natural fit hai |
| Audit table | `13_analytics.sql` L173 | `audit_logs` exist karta hai (invent nahi karna padega) |
| Job status event/history | `DECISION-05` L33-34 | "Job status history representation" + "Job status event contract and realtime notification behavior" **still open** |

## 3. Actual business requirement

Honest finding — **expiry ek frozen business requirement NAHI hai:**

- Approved product text (§9) me publish/close/archive hai, expire nahi. `AGENTS.md` rule:
  "Missing requirement invent न करें" — isliye "candidates MUST NEVER see expired jobs"
  jaise strong rules ko main approved requirement nahi maanunga; ye SEARCH-STRATEGY (design
  intent) se derive hota hai.
- Jo actually evidence se support hota hai:
  1. **DOC-APPROVED:** `expired` ek valid terminal state hai (DECISION-05) — agar expiry use
     hi na ho to state kabhi enter nahi hogi; enum/column dead capacity ban jayenge.
  2. **Design intent:** expired jobs public search me nahi aani chahiye (SEARCH-STRATEGY L196).
  3. **Schema intent:** `idx_jobs_expiring` comment "for notifications" — upcoming-expiry
     notifications ka design-time iraada tha (requirement freeze nahi).
- Isliye pehla product decision khud ye hai: **expiry current production scope me hai ya
  future** (§12 D-1). Scope me ho to derivable requirements:
  - Candidate search/detail/apply se expired job exclude (read-time safety).
  - Apply attempt on expired job reject (transaction guard).
  - Employer dashboard me expired categorization consistent (status physically flip ho ya
    read-time compute — dono se achievable).

## 4. All viable alternatives (independently discovered)

### A — Pure query-layer filtering (virtual expiry), no physical flip
Har candidate-facing query me `status='published' AND (expires_at IS NULL OR expires_at > now())`.
Detail/dashboard responses me expiry read-time compute (`now() > expires_at` → display `expired`).
Koi background write nahi.
- Zero new infra; scale-to-zero perfect; zero race.
- Physical `status` `published` hi rehta hai — dashboards/DB truth me divergence; koi
  audit/event kabhi generate nahi hoga; `expired` enum effectively dead.

### B — Query-layer filtering + periodic batch sweep (hybrid)
Read path A jaisa hi (safety invariant). Alag se ek scheduled invocation NestJS ke
authorized system sweep command ko wake karta hai jo single transaction me:
`UPDATE jobs SET status='expired' ... WHERE status IN ('published','paused') AND
expires_at <= now() AND deleted_at IS NULL` (+ per-row audit/outbox writes jab contract
approved ho). Sweep trigger source ke 2 sub-options:
- **B1:** dedicated Google Cloud Scheduler job → NestJS (new scheduler job — product
  approval chahiye, invent mat karo bina decision ke).
- **B2:** existing Phase-8 recovery wake ka reuse — recovery invocation dispatcher ke
  through/saath NestJS sweep ko bhi trigger kare. Zero naya infra, lekin recovery job ka
  scope expand hota hai (boundary purity vs infra reuse tradeoff).

### C — Lazy materialization on read (first read par flip)
Detail/search request handler me expired detect hote hi write kar do.
- REJECTED as primary: read path me write side-effect = transaction boundary violation
  (PHASE-04 §2 template), multi-instance duplicate-event races, aur kabhi-na-readhe-gaye
  jobs kabhi flip nahi honge (dashboard inconsistency).

### D — In-database mechanism (pg_cron / trigger / view)
- REJECTED: `pg_cron` availability/privilege Supabase tier-dependent; DB-side trigger-based
  status flip NestJS business boundary + outbox pattern bypass karta hai (PHASE-04 §2:
  business rows + outbox ek hi authorized transaction me; DB triggers business policy
  execute karenge to actor/audit/event contract DB me bikhar jayega — house precedent me
  triggers sirf guard/enforcement ke liye hain, business initiation ke liye nahi).
- Materialized "effective status" view read-only queries ke liye acceptable tooling ho
  sakta hai, par authoritative status replace nahi kar sakta.

### E — Publish-time scheduled delayed task (per-job timer)
Publish par `expires_at` par fire hone wala delayed Cloud Task enqueue; expiry date edit par
replace (purana task fire hone par guard: status/expiry re-check → no-op).
- Repo me delayed-task-per-row precedent NAHI; task update/delete management overhead;
  bulk edits par task churn. RECOMMENDED NAHI for v1 — lekin future "exact-minute expiry +
  instant notification" requirement aaye to ye sahi tool hai.

### F — Dispatcher/worker me sweep logic
- REJECTED (boundary): dispatcher sirf outbox→queue publisher hai
  (`05-outbox-dispatcher-nestjs` scope); FastAPI worker AI/parsing/projection/worker-owned
  writes tak limited (BACKGROUND-WORKER docs role table). Job lifecycle commands NestJS API
  ke paas hi rehne chahiye — Decision-01 trusted business path bhi NestJS me hai.

**Placement summary:** safety invariant **query layer** me (mandatory), business command
**NestJS** me, trigger source **Cloud Scheduler** (existing approved component; role
expansion decision pending), DB/dispatcher/worker me nahi.

## 5. Option comparison table

| Criterion | A: query-only | B: hybrid sweep | C: lazy read-flip | D: pg_cron/DB | E: per-job delayed task |
|---|---|---|---|---|---|
| Candidate never sees expired job | ✅ instant | ✅ instant | ✅ instant | ✅ | ✅ |
| Physical status truth consistent | ❌ | ✅ (sweep interval tak lag) | ⚠️ partial | ✅ | ✅ (~exact) |
| Audit trail possible | ❌ | ✅ | ⚠️ racy | ⚠️ boundary-bypass | ✅ |
| Future notification hook (outbox) | ❌ | ✅ jab contract approve | ⚠️ | ❌ outbox bypass | ✅ |
| `expired` enum meaningful | ❌ dead | ✅ | ⚠️ | ✅ | ✅ |
| Cloud Run scale-to-zero | ✅ perfect | ✅ (scheduled wake) | ✅ | ✅ | ✅ |
| Multi-instance safety | ✅ trivial | ✅ idempotent atomic UPDATE | ❌ races | ✅ | ⚠️ guard needed |
| New infra needed | none | scheduler invocation (B1 new job / B2 reuse) | none | extension/privileges | task lifecycle mgmt |
| Boundary compliance | ✅ | ✅ | ❌ | ❌ | ✅ |
| Operational complexity | minimal | low-medium | low but risky | high | high |
| Boundary-violation reason | — | — | read=write mix | business logic DB me; outbox bypass | — (sirf cost/complexity) |

## 6. Performance analysis

- **Read path:** `(expires_at IS NULL OR expires_at > now())` predicate existing
  `status='published'` partial indexes (e.g., `idx_jobs_category` L643-644) ke upar residual
  filter chalega; published job count ke scale par negligible. `idx_jobs_expiring` read-path
  search ka primary index NAHI hai — ye sweep/upcoming-expiry scans ke liye perfect match hai
  (`WHERE status='published' AND expires_at <= now()` predicate ke sath exact partial-index
  hit). Claim verification: exact latency numbers (kisi bhi report ke "<0.5ms" style)
  UNVERIFIED hain; `16_indexes.sql` L46-47 rule ke hisaab se planner use EXPLAIN (ANALYZE,
  BUFFERS) se confirm karna chahiye, naye index add karne se pehle.
- **Sweep:** partial-index range scan + chhota batch UPDATE; typical dev/early-prod volume me
  trivially cheap. Bounded batch (`LIMIT` + repeat) tab hi chahiye jab thousands of jobs
  ek sath expire hon — v1 me zaroori nahi.
- **Apply guard:** apply transaction me already job row lock hota hai; extra expiry
  predicate zero additional cost.

## 7. Reliability analysis

- **Safety invariant independent of sweep:** read-time filter + apply-transaction guard ki
  wajah se sweep late/failed ho to bhi candidate expired job dekh/apply nahi kar sakta. Ye
  is design ka core reliability argument hai — physical flip sirf consistency/audit ke liye.
- **Sweep idempotency:** `UPDATE ... WHERE status IN ('published','paused') AND expires_at
  <= now()` — dobara chalane par 0 rows match; `RETURNING id` se per-flipped-row outbox/audit
  insert same transaction me → duplicate events impossible.
- **Concurrent wakes:** scheduler double-fire ya B2 me recovery+sweep overlap — pehla
  transaction rows flip karta hai, doosre ka `RETURNING` empty → no-op. Multi-instance safe
  bina kisi lock ke (atomic conditional UPDATE hi synchronization hai).
- **Sweep failure:** agla scheduled run recover karta hai; read-path safety unaffected.
- **Race between view and apply:** candidate ne job dekhi, submit karte waqt expiry nikal
  gayi → apply guard reject karega; acceptable UX, data-integrity preserved.
- **Clock skew:** DB server `now()` hi single time source (queries aur sweep dono DB-side)
  — application-server clocks irrelevant.
- **Paused jobs:** `paused -> expired` PHASE-04 me listed hai; sweep me `paused` include
  karna DOC-ALIGNED hai (final call D-4).

## 8. Cost/operational analysis

- **A:** $0, zero ops surface; lekin dead enum-state + no audit — hidden product debt.
- **B1:** ek additional Cloud Scheduler job. Note honestly: Cloud Scheduler free allowance
  limited jobs tak hai; recovery job (Phase 8) already ek job lega — exact free-tier headroom
  deployment-time verify karna, cost directionally negligible (~$0.10/job/month worst case).
  NestJS request cost Cloud Run request pricing me negligible (sweep ~few ms).
- **B2:** zero naya infra — existing recovery cadence reuse; tradeoff: recovery role ka
  documented scope ("keval missed/stuck recovery", BACKGROUND-WORKER docs) expand hota hai —
  documentation update + approval chahiye.
- **C/D/E:** upar comparison; E me task create/update/delete churn ops cost badhata hai.
- **Scale-to-zero:** A/B dono min-instances=0 preserve karte hain; scheduled HTTP wake
  established recovery pattern jaisa hi hai. C bhi compatible par racy.

## 9. Security and authorization

- **Sweep actor = system** (koi user nahi). Trigger-source→NestJS authentication ke liye
  house precedent **OIDC service-account token verification** hai (worker contract me
  established pattern: OIDC verify + service-account allowlist; FAST-API worker docs).
  Dedicated new secret header invent karna weaker choice hai — OIDC pattern reuse RECOMMENDED.
  (Dispatcher wake ka shared-webhook-secret pattern dispatcher-specific hai; usse copy karna
  zaroori nahi.)
- Sweep command Decision-01 corrected hybrid ke according **NestJS trusted SystemClient**
  path se chalega; browser/RLS path ka koi role nahi.
- Endpoint kabhi public/catalog API nahi hoga — internal system invocation only; path/auth
  freeze API Catalog/infra decision me.
- Candidate-side exclusion server-side enforce hogi (client filter trust nahi).

## 10. Audit/outbox/realtime impact

- **Job status history/event contract abhi EXIST NAHI karte** — DECISION-05 "Still open" me
  dono explicitly listed. Isliye sweep ke sath outbox event emit karna **abhi implement nahi
  kiya ja sakta bina contract approval ke** (house rule: unroutable/uncontracted events
  fail-closed dead-letter hote hain — dispatcher evidence).
- Interim RECOMMENDED sequencing:
  1. Sweep UPDATE + `audit_logs` write (table exists, `13_analytics.sql` L173) — actor=system,
     action=`job.expired`, old/new status values.
  2. `job.status.changed` (naam tentative — contract freeze ke baad hi final) outbox event +
     dispatcher route + notification consumer — notification phase ke sath, DECISION-05 open
     items resolve hone par.
- **Realtime:** expiry ek passive system event hai — candidate ko push ki zaroorat nahi
  (job unke liye bas disappear hoti hai). Employer dashboard nudge (SSE per Decision-02/
  realtime decision) optional future; read REST authoritative rahega. Koi WS involvement nahi.
- **Upcoming-expiry notifications** (`idx_jobs_expiring` comment ka intent): alag feature —
  "N din baad job expire hogi" employer reminder; notification phase + contract decision
  pending, is audit ka scope nahi par index uske liye bhi ready hai.

## 11. Recommended architecture

**RECOMMENDED: Option B (hybrid) — query-layer safety + periodic sweep — product approval
pending. Agar product expiry ko current scope se bahar kare to Option A fallback
(query-only) acceptable hai; tab `expired` state ko docs me explicitly future-mark karo.**

```text
Read path (always, v1 day-1):
  candidate search/detail/apply
    -> NestJS trusted query:
       status = 'published' AND (expires_at IS NULL OR expires_at > now()) AND deleted_at IS NULL
    -> apply transaction guard me same predicate (lock/check published job)

Write path (jab product approve kare):
  Cloud Scheduler invocation (B1 dedicated job ya B2 recovery-wake reuse)
    -> OIDC-authenticated internal NestJS sweep command (system actor)
    -> BEGIN
         UPDATE jobs SET status='expired'
          WHERE status IN ('published','paused') AND expires_at <= now() AND deleted_at IS NULL
          RETURNING id, <old status>
         audit_logs insert (one per flipped row, same tx)
         [future: job.status.changed outbox inserts — contract approval ke baad]
       COMMIT
    -> idempotent; multi-instance safe; scale-to-zero safe
```

Boundary rulings (explicit):

- **Dispatcher me NAHI** — outbox publishing boundary; business sweep allowed nahi.
- **FastAPI worker me NAHI** — AI/parsing/projection boundary.
- **DB pg_cron/trigger me NAHI** — business initiation DB me nahi; outbox/audit contract
  bypass.
- **Query layer me HAAN (safety), NestJS me HAAN (command), Cloud Scheduler me HAAN
  (trigger only — approval pending).**

## 12. Required product decisions (NEEDS_DECISION)

| # | Decision | Why blocking |
|---|---|---|
| D-1 | Job expiry current production scope me hai ya future? | Approved product text me expiry absent (§3); AGENTS.md missing-requirement rule |
| D-2 | Physical `expired` flip chahiye (B) ya virtual expiry acceptable (A)? | Employer dashboard truth, audit appetite par depend |
| D-3 | Sweep trigger: B1 dedicated scheduler job vs B2 recovery-wake reuse; cadence kya? | Infra + ops scope decision |
| D-4 | `paused` jobs bhi expiry se flip hon? | PHASE-04 edge likhta hai; explicit confirm |
| D-5 | Expiry par employer notification chahiye? Upcoming-expiry reminder chahiye? | `idx_jobs_expiring` comment intent; notification phase scope |
| D-6 | Job status history representation + `job.status.changed` contract (DECISION-05 open items) | Sweep event emission isi par depend |

## 13. Required schema/code changes

**Schema: ZERO baseline changes required** — `expires_at`, `valid_dates` CHECK,
`idx_jobs_expiring` sab already present aur verified. Koi naya table/index/event abhi nahi.

**Code/documentation (sirf approval ke baad):**

1. NestJS job read/search/detail/apply queries me expiry predicate (Option A ho ya B — dono
   me mandatory).
2. Apply transaction job-check me `(expires_at IS NULL OR expires_at > now())` — guide §11/§12
   apply steps me document karna.
3. Sweep command + OIDC-guarded internal endpoint (B choose hone par; path/endpoint API
   Catalog me freeze).
4. `audit_logs` write mapping (B).
5. Scheduler job config (B1) ya recovery-runbook scope update (B2) — infra docs sync
   (AGENTS.md rule: code/schema change ke sath docs/tests sync).
6. SEARCH-STRATEGY/guide me expiry predicate explicit karna (documentation hygiene).
7. Tests: expired job search/detail/apply exclusion; sweep idempotency + double-run no
   duplicate audit rows; paused inclusion per D-4; NULL `expires_at` jobs unaffected;
   concurrent sweep no-op; sweep auth failure → 401/403.

## 14. Final status: NEEDS_DECISION

Architecture recommendation complete hai (Option B RECOMMENDED, A fallback), lekin **expiry
khud ek frozen business requirement nahi hai** — D-1 se D-6 tak product decisions pending.
Unke bina isse READY ya implementation-approved treat karna AGENTS.md ke
missing-requirement rule ko violate karega. Technical readiness: read-path safety ka kaam
job API implementation ke saath naturally ho jayega; write-path sweep sirf approval ke baad.

**Differences with prior agent report (honest comparison):** antigravity report ka core
mechanics (query-filter + scheduler sweep hybrid) directionally same hai jo maine
independently bhi recommend kiya; lekin uska "Actual business requirement" section repo
sources se derive nahi hota (expiry approved requirements me absent hai — §3), uska final
status `READY` overclaim hai (jab tak D-1..D-6 unresolved hain), usne naya internal
endpoint + naya secret header invent kiya (house precedent OIDC hai), aur `idx_jobs_expiring`
ko read-path search index bataya jo uska primary role nahi (§6). Ye audit `NEEDS_DECISION`
par stand karta hai.

*No files modified. Unverifiable numbers marked UNVERIFIED. No new table/event/endpoint/
scheduler assumed as approved.*
