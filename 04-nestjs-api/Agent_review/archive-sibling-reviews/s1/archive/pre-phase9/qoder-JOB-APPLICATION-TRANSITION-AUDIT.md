# Qoder — Job/Application Transition Policy Audit

**Auditor:** Qoder (independent Senior NestJS / PostgreSQL / Product Workflow Architect)
**Date:** 2026-08-23
**Method:** Har claim baseline SQL se directly re-verify kiya gaya. Kisi previous agent report
(antigravity/kilo/freebuf/Codex) ko source of truth nahi maana gaya — unse sirf comparison kiya
gaya. Enum order ko transition policy nahi maana gaya. Koi naya state/event/table/role invent
nahi kiya. No files modified.

**Status-label convention used below:**

- `SQL-ENFORCED` — baseline SQL/trigger/function enforce karta hai (approved baseline behavior)
- `DOC-APPROVED` — approved product/phase document explicitly state karta hai
- `RECOMMENDED` — is audit ki recommendation; freeze nahi hui
- `NEEDS_CLARIFICATION` — product decision missing; freeze se pehle resolve karna hoga

---

## 1. Overall verdict: PASS WITH FIXES

Application lifecycle **fully SQL-enforced** hai (`change_application_status()` + guard
trigger + immutable history + atomic outbox). Job lifecycle ka **koi bhi DB-level enforcement
nahi hai** — no transition function, no history table, no guard trigger, no outbox event. Ye
asymmetry hi sabse bada structural gap hai. Iske alawa:

1. **FIX REQUIRED:** `application.status.changed` event SQL me har transition par emit hota hai
   lekin na contract file hai na dispatcher route — current dispatcher isse fail-closed
   (`unknown_route` → `failed` → `dead_letter`) karega. Explicit EXPECTED PHASED GAP
   classification record chahiye (application.submitted jaisa pattern).
2. **FIX REQUIRED:** Job status transitions ke liye approved policy + NestJS enforcement +
   history/audit decision chahiye (§7 G-1..G-4).
3. **CLARIFICATIONS:** 6 product decisions pending (§7 P-1..P-6) — inke bina API Catalog
   freeze nahi ho sakta.

---

## 2. Verified current behavior

### 2.1 Enums (`02_enums.sql`)

| Enum | Values | Line |
|---|---|---|
| `job_status` | `draft, pending_approval, published, paused, closed, expired, archived` | L161-169 |
| `application_status` | `applied, under_review, shortlisted, screening, interview_scheduled, interview_completed, selected, offer_extended, offer_accepted, offer_declined, rejected, withdrawn, on_hold` | L262-276 |

**WARNING (audit rule ke according):** `02_enums.sql` L261 ka comment
`applied -> under_review -> shortlisted -> screening -> ...` likhta hai — ye enum
declaration-order comment hai, **enforced graph nahi**. Actual SQL graph me
`screening <-> shortlisted` dono directions valid hain (§2.2). Enum order ko policy mat
samjho — ye point is audit me explicitly confirm hua.

### 2.2 Application transitions — SQL-ENFORCED (`09_applications.sql` L573-652)

`change_application_status(p_application_id, p_to_status, p_changed_by, p_change_reason,
p_metadata)` exact allow-list (L603-615):

| From | Allowed To |
|---|---|
| `applied` | `under_review`, `screening`, `shortlisted`, `rejected`, `withdrawn`, `on_hold` |
| `under_review` | `screening`, `shortlisted`, `rejected`, `withdrawn`, `on_hold` |
| `screening` | `shortlisted`, `interview_scheduled`, `rejected`, `withdrawn`, `on_hold` |
| `shortlisted` | `screening`, `interview_scheduled`, `rejected`, `withdrawn`, `on_hold` |
| `interview_scheduled` | `interview_completed`, `rejected`, `withdrawn`, `on_hold` |
| `interview_completed` | `selected`, `rejected`, `withdrawn`, `on_hold` |
| `selected` | `offer_extended`, `rejected`, `withdrawn`, `on_hold` |
| `offer_extended` | `offer_accepted`, `offer_declined`, `withdrawn`, `on_hold` |
| `on_hold` | `under_review`, `screening`, `shortlisted`, `interview_scheduled`, `interview_completed`, `selected`, `offer_extended`, `rejected`, `withdrawn` |
| `offer_accepted`, `offer_declined`, `rejected`, `withdrawn` | *(none — terminal)* |

Function mechanics (verified):

- **Row lock / concurrency:** `SELECT ... FOR UPDATE` (L590-593) — pessimistic lock;
  concurrent transitions serialize hote hain. Optimistic versioning column koi nahi hai.
- **Idempotency:** `p_to_status = v_from_status` → returns current status **without any
  write** (L599-601) — no duplicate history/outbox rows. Same-target repeat = silent success
  at DB level (HTTP semantics API Catalog decision, §8).
- **Invalid transition:** `RAISE EXCEPTION 'Invalid application status transition: % -> %'`
  (L613-614) — fail-closed. Not-found: `'Active application % not found'` (L595-597),
  `deleted_at IS NULL` filter included.
- **Audit fields:** `reviewed_by/at`, `shortlisted_by/at`, `rejected_by/at` +
  `rejection_reason` only on `rejected` (L621-627).
- **Atomicity:** status UPDATE + `application_status_history` INSERT + `outbox_events`
  INSERT (`application.status.changed`, aggregate `job_application`) sab same transaction
  (L619-648).
- **Metadata:** JSON object enforced (L586-588); payload merge: caller metadata ||
  `{applicationId, fromStatus, toStatus, changedBy}` (L642-647). Note: camelCase keys —
  future contract design me envelope convention (snake_case) se reconcile karna hoga.
- **rejection_reason optional at DB level:** `p_change_reason DEFAULT NULL` (L577);
  mandatory karna ho to NestJS DTO policy (see P-3).
- **Actor validation ABSENT in SQL:** function `p_changed_by` accept karta hai par role/
  permission check nahi karta — ye declared NestJS responsibility hai
  (`09_applications_Explanation.md` §13, L459-461).

### 2.3 Direct-update protection — SQL-ENFORCED

- `job_applications_status_update_guard` BEFORE UPDATE OF status →
  `enforce_application_status_update_path()` (trigger L994-996; function L654-666).
  `set_config('app.application_status_change','allowed',TRUE)` flag ke bina status update
  exception raise karta hai — **service_role/trusted path ke liye bhi** (triggers role-agnostic).
- `application_status_history_immutable` trigger (L1022) → history append-only, UPDATE/DELETE
  blocked. PD-003 "append-only status history" consistent.
- Initial history row: `from_status = NULL, to_status = applied`; same from/to stored nahi
  hota (`09_applications_Explanation.md` §4 L141-142).
- `job_applications_no_hard_delete` (L992-993) — soft-delete only.

### 2.4 Application uniqueness / reapply — SQL-ENFORCED

- `uq_registered_application_per_job` UNIQUE `(job_id, candidate_id) WHERE is_guest = FALSE`
  (L1066-1068); `uq_guest_application_per_job` UNIQUE `(job_id, guest_email_normalized)
  WHERE is_guest = TRUE` (L1069-1071).
- Dono indexes status/deleted_at se filter NAHI hote → **withdrawn/rejected/soft-deleted
  application ke baad same job par reapply impossible** — PD-003 L11-14 se exact match
  (`DOC-APPROVED`). Re-entry sirf naye `job_id` (repost) se.

### 2.5 Job lifecycle — NO SQL ENFORCEMENT

`05_jobs.sql` verified facts:

- `status job_status NOT NULL DEFAULT 'draft'` (L163); timestamp columns `published_at`,
  `expires_at` (comment: "Auto-close after this date", L165), `paused_at`, `closed_at`,
  `closed_reason` (L164-168); soft-delete `deleted_at` (L193).
- **No `change_job_status()` function, no `job_status_history` table, no status guard
  trigger** — repo-wide grep confirmed (sirf `jobs_updated_at` trigger L277-280).
  Trusted path se `UPDATE jobs SET status = ...` bina kisi transition check ke possible hai.
- Publish gate: "Only verified companies can publish — enforced by NestJS, not DB"
  (L271-274 comment).

### 2.6 Interview linkage — verified ABSENT

`10_interviews.sql` me `change_application_status`, `application_status` ya outbox ka **koi
reference nahi** (grep: 0 matches). Matlab:

- `interview_scheduled -> interview_completed` interview module automatically NAHI karta —
  authorized NestJS command ko explicitly `change_application_status()` call karna hoga
  (Questions doc B.10 ka evidence-based answer).
- Interview `cancelled`/`no_show` ka application status par koi automatic effect nahi.

### 2.7 Outbox/dispatcher state — verified

- `application.status.changed`: emitted by SQL (L639-648), **no contract file**
  (`contracts/events/` me 13 contracts, status-changed absent), **no dispatcher route**
  (`event-route.registry.ts` — 8 registered routes, status.changed unme). Dispatcher
  fail-closed path (`unknown_route` → failed → dead_letter) isse reject karega — interim
  behavior test-codified pattern jaisa, lekin **kisi phase doc me classified nahi** (gap §6).
- Job status ka koi outbox event kahin nahi (`job.status.changed` exists nahi — invent nahi
  kiya ja raha, absence report ho rahi hai).

### 2.8 Documents read

`02_enums.sql`, `05_jobs.sql`, `05_jobs_Explanation.md`, `09_applications.sql`
(L50-111, L162-164, L573-696, L981-1071), `09_applications_Explanation.md` (§2-4, §13),
`10_interviews.sql` (grep), `13_analytics.sql` (`audit_logs` L170-239), `PD-003`,
`PHASE-04`, `DECISION-01`, questions doc, Codex recommendation, `event-route.registry.ts`,
`contracts/events/` listing, plus 3 prior agent reports (comparison only).

---

## 3. Proposed transition matrix

### 3.1 Jobs — RECOMMENDED (koi SQL enforcement exist nahi karta; PHASE-04 §7 candidate
flow + Codex recommendation se aligned)

```text
draft -> pending_approval -> published
published <-> paused
published -> closed / expired / archived
paused   -> closed / expired / archived
expired  -> (automatic system transition from published/paused; sweep on expires_at)
```

Open edges (NEEDS_CLARIFICATION — §7 P-1/P-2):

- `draft -> published` direct (owner/primary HR bypass approval)? Codex draft me nahi;
  antigravity ne recommend kiya. **Repo me kahin frozen nahi.**
- `pending_approval -> draft` (send back for edits)? **Repo me kahin frozen nahi.**

Terminal: `closed`, `expired`, `archived` — reopen prohibited; repost = **new `job_id`**
(`DOC-APPROVED` via PD-003 L13 + PHASE-04 §7 L132; final freeze API Catalog me).

### 3.2 Applications — SQL-ENFORCED graph hi frozen policy hai

§2.2 table hi exact matrix hai. Codex recommendation (§3 high-level flow) iska strict
subset describe karta hai — actual SQL graph more permissive hai (e.g., `applied` se direct
`shortlisted`/`screening`, `shortlisted <-> screening` two-way). Koi deviation nahi chahiye;
NestJS SQL ke bahar transition invent nahi karega (PHASE-04 §8.1 + Codex §3).

Notable verified semantics:

- `selected -> offer_extended` **only** path to `offer_extended` (plus `on_hold ->
  offer_extended` return) — sequence SQL-enforced.
- `on_hold` return set me `applied` NAHI hai — `applied -> on_hold` ke baad wapas `applied`
  impossible; minimum return `under_review`.
- Withdrawal (`-> withdrawn`) har non-terminal state se SQL-allowed hai — including
  `offer_extended` aur `on_hold` (see P-4 cutoff question).
- Guest vs registered: **same graph** — function `is_guest` se discriminate nahi karta
  (Questions doc B.15 answer: transitions same; actor identification NestJS policy).

---

## 4. Actor/permission matrix

SQL me actor enforcement NAHI hai; niche ka split verified evidence + declared
responsibility par based hai. Permission names `RECOMMENDED/PROPOSED` hain — repo me koi
frozen permission catalog nahi hai, isliye invent karke frozen mat maano.

| Transition | Actor (recommended) | Status |
|---|---|---|
| Submit application (`-> applied`) | Registered candidate (auth identity) / active guest session | DOC-APPROVED (Explanation §2-3; ownership from auth, not request body) |
| Withdraw (`* -> withdrawn`) | Application owner — candidate | RECOMMENDED (Codex §4); guest-claim ownership case NEEDS_CLARIFICATION (P-5) |
| Review/screen/shortlist/on_hold/reject | Authorized HR/employer of the job's company | RECOMMENDED; company membership + active-HR check NestJS me mandatory (DB level par nahi) |
| `interview_scheduled -> interview_completed` | Authorized HR command (interview module wiring absent — §2.6) | RECOMMENDED |
| Select / offer extend | Authorized company HR/owner workflow | RECOMMENDED (Codex §4) |
| Offer accept/decline | Candidate (application owner) | RECOMMENDED (Codex §4) |
| Job draft/edit | Authorized company owner/HR | RECOMMENDED |
| Job submit/approve/publish | Owner/primary HR vs member split = NEEDS_CLARIFICATION (P-1) | NEEDS_CLARIFICATION |
| Job pause/resume/close/archive | Authorized company owner/HR | RECOMMENDED |
| Job expiry | System sweep (worker/service path) | RECOMMENDED; mechanism not in baseline (P-6) |

Universal rules (DOC-APPROVED):

- Har operation se pehle company ownership/membership verify (PHASE-04 §4; role alone
  cross-company access nahi deta).
- Writes sirf trusted NestJS SystemClient path se; browser ko koi DML grant nahi
  (DECISION-01 corrected hybrid; `17_rls.sql` no-DML rule).
- Candidate/guest HR transitions kabhi nahi kar sakte; admin ka extra scope product
  decision pending (Questions B.4 — NEEDS_CLARIFICATION, P-1 me included).

---

## 5. Terminal states

| Domain | Terminal | Enforcement |
|---|---|---|
| Application | `offer_accepted`, `offer_declined`, `rejected`, `withdrawn` | **SQL-ENFORCED** — allow-list me koi outbound edge nahi (L603-613); Explanation §4 L122-124 confirms |
| Job | `closed`, `expired`, `archived` | **RECOMMENDED / DOC-ALIGNED** (Codex §2, PHASE-04 §7) — SQL enforcement absent; NestJS policy + tests me freeze karna hoga |

Reopen:

- Application terminal reopen: SQL me **impossible** (enforced). Rejected candidate same
  job par reapply nahi kar sakta (unique index, §2.4) — new `job_id` hi route.
- Job terminal reopen: `RECOMMENDED prohibited`; repost = new `job_id` (PD-003
  DOC-APPROVED).

---

## 6. SQL mismatches / gaps

| # | Gap | Evidence | Severity |
|---|---|---|---|
| G-1 | No `change_job_status()` equivalent | `05_jobs.sql` — function absent; applications ka canonical path L573 exist karta hai | HIGH |
| G-2 | No `job_status_history` table | `05_jobs.sql` — absent; `application_status_history` (L113) precedent exist karta hai | HIGH |
| G-3 | No guard trigger on `jobs.status` | Direct trusted-path `UPDATE jobs SET status` unrestricted; contrast: `job_applications_status_update_guard` (L994) | HIGH |
| G-4 | No job status outbox event / contract | Baseline me `job.status.changed` kahin nahi; `contracts/events/` me absent | MEDIUM (decision needed — event chahiye ya notification phase tak none) |
| G-5 | `application.status.changed` unclassified | Emit hota hai (L641) but no contract + no dispatcher route → runtime fail-closed dead-letter; kisi phase doc me EXPECTED PHASED GAP record nahi | MEDIUM |
| G-6 | Enum comment ≠ enforced graph | `02_enums.sql` L261 comment `shortlisted -> screening` order imply karta hai; SQL graph two-way hai | LOW (doc hygiene) |
| G-7 | `expires_at` comment ambiguity | `05_jobs.sql` L165 "Auto-close after this date" vs enum ka separate `expired` state — expiry transition `expired` hona chahiye, comment "close" bolta hai | LOW (doc hygiene) |
| G-8 | Metadata key casing | Function payload camelCase (`applicationId`...) vs house contract envelope snake_case | LOW (future contract design note) |

**No conflict found** between SQL-enforced graph and PHASE-04/Codex/Explanation documents —
PHASE-04 §8.1 correctly kehta hai "complete transition graph must be approved in the API
catalog; invalid transitions fail closed". Interview module non-wiring (§2.6) conflict nahi,
missing integration hai.

---

## 7. Product decisions required (NEEDS_CLARIFICATION)

| # | Decision | Context |
|---|---|---|
| P-1 | Job approval/publish model: `draft -> published` direct allowed for owner/primary HR? `pending_approval -> draft` send-back allowed? Admin ka role? | Questions A.2/A.3/A.4/A.11; Codex §6 unresolved; kahin frozen nahi |
| P-2 | Job reopen policy final confirmation (terminal = no reopen) + `expired -> anything` kabhi allowed? | Questions A.9/A.10; PHASE-04 "not assumed" — explicit freeze chahiye |
| P-3 | `rejection_reason` mandatory for `rejected`? | DB level optional (L577/L627); NestJS DTO se enforce ho sakta hai — product call |
| P-4 | Candidate withdrawal cutoff: `offer_extended` (aur `on_hold`) ke baad withdraw allowed rahe? SQL abhi allow karta hai | Questions B.2; Codex "policy approval ke baad define hogi" |
| P-5 | Guest application withdrawal/offer-response actor identification (claim-verified user only?) | Questions B.15; SQL graph same hai, identity policy missing |
| P-6 | Job expiry mechanism: sweeper/cron frequency, `expires_at` null behavior, expiry event needed? | Questions A.7; baseline me sirf column hai, koi worker nahi |

Codex recommendation khud in items ko "unresolved" (§6) maanta hai — isliye Codex draft ko
freeze decision ki tarah treat nahi kiya jayega.

---

## 8. API Catalog requirements

Koi API path repo me frozen NAHI hai — niche sab **PROPOSED, API Catalog pending**:

```http
(proposed) POST   /jobs/:jobId/submit-approval
(proposed) POST   /jobs/:jobId/publish
(proposed) POST   /jobs/:jobId/pause | /resume | /close | /archive
(proposed) POST   /applications/:applicationId/status        (HR transition command)
(proposed) POST   /applications/:applicationId/withdraw      (candidate)
(proposed) POST   /applications/:applicationId/offer-response (accept/decline)
```

Catalog ko freeze karna hoga:

1. Transition command shape: generic `status` endpoint vs action-specific endpoints
   (withdraw/offer separate — actor separation clean rahegi).
2. HTTP codes: invalid transition = 409 Conflict vs 400 vs 422 — **unfrozen** (DB exception
   message deterministic hai: `Invalid application status transition: X -> Y`).
3. Idempotency: DB same-target no-op (L599-601) → repeat request success returning current
   state, no duplicate rows — HTTP 200 vs 409 choice catalog decision. Request-level
   idempotency control PHASE-04 §11 pattern follow karega.
4. Concurrency: pessimistic `FOR UPDATE` (SQL) — client-side optimistic versioning ki
   zaroorat nahi; catalog me stale-read behavior document karna.
5. `application.status.changed` contract (`application-status-changed.v1.json`) + phasing
   classification (G-5).
6. Job status history/audit representation (history table vs `audit_logs` — table
   `13_analytics.sql` L173 exist karta hai, invent nahi karna padega) + event decision (G-4).
7. Realtime: status nudges SSE (Decision-02/realtime decision), authoritative REST status
   endpoint hamesha independent (PHASE-04 §9 L192). Chat WS unrelated.
8. Reason/actor/timestamp requirements per transition (Questions A.12): application me
   `changed_by` mandatory param + history timestamp SQL-enforced; job side policy pending
   (G-2 resolve hone tak).

---

## 9. Exact recommendations

1. **Adopt SQL graph as frozen application policy** — `change_application_status()` allow-list
   (§2.2) hi canonical transition matrix hai; NestJS me same map duplicate karo taaki invalid
   transition DB tak jaane se pehle HTTP-friendly error de (defense in depth; DB fail-closed
   already hai).
2. **Job lifecycle: product decision P-1/P-2 freeze karo**, phir do options me se ek chuno
   (dono RECOMMENDED patterns hain, baseline me exist nahi karte):
   - Option A (strong): `change_job_status()` + `job_status_history` + guard trigger —
     application pattern ka mirror; baseline reset window me add ho sakta hai
     (`02_enums.sql` header testing-baseline rule reset allow karti hai).
   - Option B (light): NestJS domain service enforcement + `audit_logs` writes +
     transaction template; DB guard nahi. Risk: trusted-path mistake unguarded.
   Recommendation: **Option A** — house precedent (`enforce_referral_batch_transition`,
   `enforce_guest_claim_transition` etc. sab DB-enforced hain) consistency deta hai.
3. **G-5 classify karo:** `application.status.changed` ko PHASE-03 me EXPECTED PHASED GAP
   record karo (application.submitted jaisa) — interim fail-closed behavior acceptable hai,
   par dead-letter noise observable rahega; contract v1 API Catalog me define karo.
4. **Interview wiring plan:** interview `completed` hone par authorized NestJS command
   `change_application_status(..., 'interview_completed', ...)` call kare — ye orchestration
   API Catalog/use-case design me explicit ho (§2.6). Cancel/no_show ke application-level
   effect ka product rule bhi P-list me add karo (abhi koi rule nahi).
5. **Doc hygiene (G-6/G-7):** `02_enums.sql` L261 comment ko enforced graph ki taraf correct
   karo; `05_jobs.sql` L165 comment "Auto-close" → "Auto-expire (`expired`)" align karo —
   sirf tab jab reset window available ho (baseline edit policy ke according).
6. **Tests** (PHASE-04 §12 exit criteria ke against):
   - Har SQL-allowed transition success + history/outbox rows exactly one.
   - Har terminal state se koi bhi transition → exception, no partial writes.
   - Same-target repeat → no new rows.
   - Direct `UPDATE job_applications SET status` (trusted path se bhi) → guard exception.
   - History UPDATE/DELETE → blocked.
   - Concurrent competing transitions → serialized, ek fail-closed.
   - Job side: chosen enforcement (Option A/B) ke transition + unauthorized actor tests.
   - Cross-company HR transition attempts → 403 (membership guard tests).

## 10. Implementation readiness

| Area | Readiness |
|---|---|
| Application transition engine | ✅ READY — SQL-enforced; NestJS sirf canonical function call + actor guards banayega |
| History/audit/outbox (application) | ✅ READY — atomic, immutable, test-codified pattern |
| Job transition policy | ⚠️ BLOCKED ON P-1/P-2 + G-1..G-4 decision |
| Actor/permission matrix | ⚠️ Partially blocked — P-1 (publish/approval actors), P-5 (guest actor) pending |
| API Catalog | ⚠️ Can start, freeze only after P-1..P-6 + status-code/idempotency choices |
| Interview integration | ⚠️ Orchestration design required (§2.6) — DB side ready |

**Bottom line:** Application side implementation-ready hai; job side par ek explicit product +
schema/enforcement decision ke bina implementation start karna premature hoga. Ye report
koi file modify nahi karti; sab evidence file/line references se verify hai.
