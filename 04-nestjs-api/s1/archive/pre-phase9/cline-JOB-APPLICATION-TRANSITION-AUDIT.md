# Cline — Job/Application Transition Policy Audit Report

**Auditor:** Cline (independent Senior NestJS, PostgreSQL & Product Workflow Architect)
**Date:** 2026-08-23
**Target File Location:** `04-nestjs-api/04-nestjs-api-app/cline-JOB-APPLICATION-TRANSITION-AUDIT.md`
**Method:** Every claim below was verified directly against the executable baseline SQL and approved product/phase documents. No previous agent report (antigravity, kilo, freebuf, qoder, codex) was treated as a source of truth — they were used only for cross-reference comparison. Enum declaration order was not interpreted as a transition policy. No new states, events, tables, roles, or permissions were invented. No files were modified.

---

## Overall Verdict: **PASS WITH FIXES**

| Area | Verdict | Evidence |
|---|---|---|
| Application transition enforcement | ✅ SQL-ENFORCED (PASS) | `change_application_status()` at `09_applications.sql` L573–651; guard trigger L654–664 / L994–996 |
| Application terminal-state enforcement | ✅ SQL-ENFORCED (PASS) | No outbound transitions in allow-list at L603–613 |
| Application idempotency | ✅ SQL-ENFORCED (PASS) | Same-status early return at L599–601 |
| Application concurrency | ✅ SQL-ENFORCED (PASS) | `FOR UPDATE` row lock at L590–593 |
| Application outbox + history atomicity | ✅ SQL-ENFORCED (PASS) | L617–648 insert both in same function call |
| Job transition enforcement | ⚠️ NOT SQL-ENFORCED (FIX REQUIRED) | No `change_job_status()`, no `job_status_history`, no guard trigger, no outbox event |
| Job terminal-state enforcement | ⚠️ NOT ENFORCED (FIX REQUIRED) | Direct `UPDATE jobs.status` possible via trusted path |
| Actor/permission validation | ⚠️ NOT IN SQL (NEEDS_CLARIFICATION) | `change_application_status()` accepts `p_changed_by` but validates no role; NestJS is sole authority |
| Interview → application wiring | ⚠️ NOT LINKED (NEEDS_CLARIFICATION) | `10_interviews.sql` has zero references to `change_application_status` |
| API Catalog freeze | ⚠️ BLOCKED (NEEDS_CLARIFICATION) | 11 product decisions unresolved |

---

## Verified Current Behavior

### Enum Definitions (`02_enums.sql`)

**`job_status`** — L161–169: `draft`, `pending_approval`, `published`, `paused`, `closed`, `expired`, `archived`

**`application_status`** — L262–276: `applied`, `under_review`, `shortlisted`, `screening`, `interview_scheduled`, `interview_completed`, `selected`, `offer_extended`, `offer_accepted`, `offer_declined`, `rejected`, `withdrawn`, `on_hold`

**CRITICAL WARNING:** Enum comment at L261 (`-- applied -> under_review -> shortlisted -> screening -> ...`) is a **declaration-order comment**, NOT an enforced graph. The actual SQL allow-list (L603–613) is non-linear and bidirectional (e.g., `screening ↔ shortlisted` both directions valid). Previous agent reports inferring transitions from enum order are **incorrect**.

### Application Transition Enforcement — SQL-ENFORCED

**Source:** `change_application_status()` at `09_applications.sql` L573–651.

**Function signature:**
```sql
change_application_status(p_application_id UUID, p_to_status application_status,
  p_changed_by UUID, p_change_reason VARCHAR(500) DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB) RETURNS application_status
```
Matches RLS grant at `17_rls.sql` L235–237: `change_application_status(UUID, public.application_status, UUID, VARCHAR, JSONB)` granted to `service_role` only.

**Transaction steps (L583–650):** Metadata validation (L586–588) → row lock `FOR UPDATE` (L590–593) → existence check (L595–597) → idempotency early-return (L599–601) → allow-list validation (L603–615) → set session flag (L617) → UPDATE status+audit cols (L619–628) → reset flag (L630) → INSERT history (L632–637) → INSERT outbox event (L639–648) → RETURN (L650).

**Guard trigger:** `enforce_application_status_update_path()` function L654–664, attached as `job_applications_status_update_guard` trigger at L994–996. Raises exception unless `app.application_status_change = 'allowed'` session var is set. **Role-agnostic — blocks even service_role.**


**Initial state:** `enforce_initial_lifecycle_state()` L455–477, trigger L986–988 — forces `status = 'applied'` on INSERT.

**Identity immutability:** `enforce_application_identity()` L479–495, trigger L973–975 — blocks changes to `job_id`, `candidate_id`, `user_id`, `is_guest`, guest fields.

**History immutability:** `application_status_history_immutable` trigger L1004–1006; CHECK constraint at L122–124.

**`application_status_history` table** — L113–128: `id`, `application_id` (FK CASCADE), `from_status` (nullable), `to_status`, `changed_by`, `change_reason`, `metadata` (JSONB), `created_at`. CHECK constraint: `from_status IS NULL OR from_status IS DISTINCT FROM to_status`.

### Job Transition Enforcement — NOT SQL-ENFORCED

**`job_status` enum** — `02_enums.sql` L161–169 (7 values). **`jobs` table** — `05_jobs.sql` L163–168: `status` (L163, default `'draft'`), `published_at` (L164), `expires_at` (L165, comment: "Auto-close after this date"), `paused_at` (L166), `closed_at` (L167), `closed_reason` (L168).

**No `archived_at` column exists** — qoder audit incorrectly claimed it at L165/L193. L165 is `expires_at`; L193 is `deleted_at`. No `archived_at` timestamp.

**CHECK constraints** L217–237: only timestamp-ordering (`published_after_created`, `approved_after_created`, `paused_after_created`, `closed_after_created`). **No status-transition CHECK.**

**Triggers on `jobs`:** only `jobs_updated_at` (L277–280). **No `jobs_status_update_guard` trigger.** Direct `UPDATE jobs SET status = ...` succeeds.

**No `job_status_history` table**, **no `job.status.changed` outbox event**, **no job transition function** — confirmed by repo-wide grep.

**PHASE-04 proposed flow** L119–132 (not approved, not enforced).



### Access Model & RLS (`17_rls.sql`)

`change_application_status()` EXECUTE: revoked from PUBLIC/anon/authenticated, granted to `service_role` only (L235–237). **No RLS policies or grants for job status writes** — entirely trusted backend path with no DB-level guard.

### Audit Column Gap

`job_applications` (L50–107) has dedicated audit columns ONLY for three states: `under_review` (`reviewed_by/at` L67–68), `shortlisted` (`shortlisted_by/at` L69–70), `rejected` (`rejected_by/at/rejection_reason` L71–73). **Missing:** `interview_scheduled_by/at`, `interview_completed_by/at`, `selected_by/at`, `offer_extended_by/at`, `offer_accepted_by/at`, `offer_declined_by/at`, `withdrawn_by/at`, `withdrawal_reason`, `on_hold_by/at`, `on_hold_reason`.

`change_application_status()` (L619–628) only sets `reviewed_by/at`, `shortlisted_by/at`, `rejected_by/at`, `rejection_reason`. All other transitions recorded only in `application_status_history`.

### One-Candidate-One-Job Enforcement Gap

PD-003 (APPROVED) L11: "Same registered candidate + same `job_id` = one application।" SQL reality: **No `UNIQUE(job_id, candidate_id)` constraint exists.** Only `uq_guest_application_upload_session` (L109–111) for guests. `application_job_identity` (L82) is `UNIQUE (id, job_id)` — trivially unique since `id` is PK. **Previous agent reports incorrect** — qoder L162, antigravity L162, kilo L402 cite a non-existent `uq_registered_application_per_job`.
---

## Proposed Transition Matrix

### Application Transition Matrix (SQL-ENFORCED — adopt as frozen policy)

Source: `change_application_status()` allow-list at `09_applications.sql` L603–613.

| From Status | Allowed To Status |
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

**Terminal states (no outbound — SQL-ENFORCED):** `offer_accepted`, `offer_declined`, `rejected`, `withdrawn` (not a source in any allow-list row; L603–613).
**Non-terminal:** All others including `on_hold` (has 9 outbound transitions).

**Special `on_hold` transitions:**
- `on_hold → under_review` ✅ (allowed)
- `on_hold → applied` ❌ (NOT allowed — cannot return to initial state)
- `on_hold → on_hold` ❌ (idempotency early return, L599–601)

### Job Transition Matrix (PROPOSED — REQUIRES PRODUCT APPROVAL + SQL ENFORCEMENT)

Source: `PHASE-04-STATE-MACHINES-AND-TRANSACTIONS.md` L119–132 + CODEX recommendation (all RECOMMENDED, NOT approved).

| From Status | Allowed To | Actor (RECOMMENDED) |
|---|---|---|
| `draft` | `pending_approval`, `published` | Owner/Primary HR / Admin |
| `pending_approval` | `published`, `draft` | Owner/Admin |
| `published` | `paused`, `closed`, `expired`, `archived` | HR / System (expired) |
| `paused` | `published`, `closed`, `expired`, `archived` | HR / System |
| `closed` | (terminal) | — |
| `expired` | (terminal) | — |
| `archived` | (terminal) | — |

---

## 3. Actor/Permission Matrix

### 3.1 What SQL Enforces

**Application transitions:** `change_application_status()` accepts `p_changed_by UUID` (L576) but performs **NO role validation**. It does not check `user_role`, company membership, or ownership. RLS (`17_rls.sql` L235–237) only grants EXECUTE to `service_role` — meaning **all callers are trusted backend processes**. Actor validation is **100% a NestJS responsibility**.

**Job transitions:** No SQL function exists. No RLS policy governs job status writes. Actor validation is entirely a NestJS responsibility.
### 3.2 What is NOT in any approved document

| Action | Documented Actor | Source |
|---|---|---|
| Job draft/edit | Company owner/HR | CODEX recommendation (RECOMMENDED, NOT APPROVED) |
| Job approve/publish | Company owner/Primary HR or admin | CODEX recommendation (RECOMMENDED, NOT APPROVED) |
| Job pause/close/archive | Authorized company owner/HR | CODEX recommendation (RECOMMENDED, NOT APPROVED) |
| Job expiry | System | CODEX recommendation (RECOMMENDED, NOT APPROVED) |
| Application status change | Authorized HR/recruiter | CODEX recommendation (RECOMMENDED, NOT APPROVED) |
| Interview states | Interview workflow + authorized HR | CODEX recommendation (RECOMMENDED, NOT APPROVED) |
| Select/offer | Authorized HR/company workflow | CODEX recommendation (RECOMMENDED, NOT APPROVED) |
| Offer accept/decline | Candidate (application owner) | CODEX recommendation (RECOMMENDED, NOT APPROVED) |
| Application withdraw | Candidate/application owner | CODEX recommendation (RECOMMENDED, NOT APPROVED) |

**NEEDS_CLARIFICATION:** No approved product decision document specifies the exact actor for any transition. CODEX (`CODEX-JOB-APPLICATION-TRANSITION-RECOMMENDATION-HINGLISH.md` L73) explicitly states: "Ye actor mapping recommendation hai, final product approval ke bina frozen nahi hai."

`PD-001-ACCOUNT-AND-REFERRAL-ROLES.md` defines `user_role` enum (`candidate`, `employer`, `hr`, `admin`) (`02_enums.sql` L61–66) but does **NOT** map roles to specific job/application transitions.

---

## 4. Terminal States

### 4.1 Jobs — Terminal: `closed`, `expired`, `archived`

**ENFORCEMENT: NOT SQL-ENFORCED.** No SQL function, trigger, or constraint prevents a job from being updated from `closed`, `expired`, or `archived` to any other status. Direct `UPDATE jobs SET status = 'published' WHERE status = 'closed'` succeeds.

**Repost policy:** PD-003 (APPROVED) L13: "Reposted vacancy new `job_id` होगी।" — reposting always creates a new `job_id`.

**NEEDS_CLARIFICATION:** No SQL enforcement of "terminal = no reopen" for jobs. Either (a) a `change_job_status()` function with terminal-state guards must be created, or (b) NestJS must enforce terminal-state prohibition in domain logic.
### 4.2 Applications — Terminal: `offer_accepted`, `offer_declined`, `rejected`, `withdrawn`

**ENFORCEMENT: SQL-ENFORCED.** The allow-list (L603–613) does not include any of these four as a source (`v_from_status`). Any attempt raises `'Invalid application status transition: % -> %'` (L614). `09_applications_Explanation.md` L122–124 confirms: "Terminal statuses जैसे rejected, withdrawn, offer_accepted और offer_declined reverse transition नहीं कर सकते।"

**Reapply:** PD-003 L14: "`deleted_at` archive/visibility है; duplicate apply entitlement नहीं।"

**NEEDS_CLARIFICATION:** Whether a candidate can reapply to a reposted job (new `job_id`). PD-003 says repost creates new `job_id` (implying reapply is possible), but not explicitly stated.

---

## 5. Reopen/Repost Policy

| Entity | Policy | Enforcement |
|---|---|---|
| Jobs | Terminal (`closed`, `expired`, `archived`) cannot reopen. Repost = new `job_id`. | **NOT SQL-ENFORCED** — no job status function/trigger. NestJS must enforce. |
| Applications | Terminal (`offer_accepted`, `offer_declined`, `rejected`, `withdrawn`) cannot reopen. | **SQL-ENFORCED** — allow-list excludes terminal states as source (L603–613). |

PD-003 (APPROVED) L13–14:
- "Reposted vacancy new `job_id` होगी।"
- "`deleted_at` archive/visibility है; duplicate apply entitlement नहीं।"

PHASE-04 proposed flow L119–123 / CODEX recommendation (RECOMMENDED, NOT approved):
```
draft → pending_approval → published
published ↔ paused
published → closed / expired / archived
paused → closed / expired / archived
```

---

## 6. Candidate Withdrawal Policy

### 6.1 SQL Behavior (verified `change_application_status()` L603–613)

| From Status | Can Withdraw? |
|---|---|
| `applied` | ✅ Yes |
| `under_review` | ✅ Yes |
| `screening` | ✅ Yes |
| `shortlisted` | ✅ Yes |
| `interview_scheduled` | ✅ Yes |
| `interview_completed` | ✅ Yes |
| `selected` | ✅ Yes |
| `offer_extended` | ✅ Yes |
| `on_hold` | ✅ Yes |

`withdrawn` is terminal — no outbound transitions (not a source in any allow-list row).

### 6.2 SQL Audit Gaps

The `change_application_status()` function **does NOT set any dedicated audit columns** for the `withdrawn` state:
- No `withdrawn_by` / `withdrawn_at` columns exist in `job_applications` table (L50–107).
- No `withdrawal_reason` column exists.
- `p_change_reason` is stored in `application_status_history.change_reason` (L636) and outbox payload, but not in any dedicated column on `job_applications`.

**NEEDS_CLARIFICATION (Q-B.2):** Is `offer_extended → withdrawn` acceptable after an offer is made? SQL allows it; product may want to block it.

**NEEDS_CLARIFICATION (Q-B.6):** Same job reapply after `withdrawn`? SQL blocks only via terminal-state enforcement + (missing) uniqueness constraint.
---

## 7. Rejection and Offer Lifecycle

### 7.1 Rejection

| Aspect | SQL Behavior | Line |
|---|---|---|
| `rejected` is terminal | ✅ Yes — not a source in any allow-list row | L603–613 |
| `rejected_by` set | ✅ Yes — `CASE WHEN p_to_status = 'rejected' THEN p_changed_by` | L625 |
| `rejected_at` set | ✅ Yes — `CASE WHEN p_to_status = 'rejected' THEN NOW()` | L626 |
| `rejection_reason` set | ✅ Yes — `CASE WHEN p_to_status = 'rejected' THEN p_change_reason` | L627 |
| `rejection_reason` mandatory | ❌ No — nullable `VARCHAR(500)` | L73 |
| Any state can reject | ✅ Yes — `rejected` in every non-terminal allow-list row | L603–613 |

**NEEDS_CLARIFICATION (Q-B.12):** Should `rejection_reason` be mandatory for `rejected` status? SQL allows NULL.

### 7.2 Offer Lifecycle

| Transition | SQL Allowed? | Line |
|---|---|---|
| `interview_completed → selected` | ✅ Yes | L594 |
| `selected → offer_extended` | ✅ Yes | L595 |
| `offer_extended → offer_accepted` | ✅ Yes | L611 |
| `offer_extended → offer_declined` | ✅ Yes | L611 |
| `offer_extended → rejected` | ✅ Yes | L611 |
| `offer_extended → withdrawn` | ✅ Yes | L611 |
| `offer_extended → on_hold` | ✅ Yes | L611 |
| `offer_accepted` | Terminal — no outbound | L603–613 |
| `offer_declined` | Terminal — no outbound | L603–613 |

**Gap:** No dedicated audit columns for offer/interview/selected states (see §1.6). Only `reviewed_by/at`, `shortlisted_by/at`, `rejected_by/at` have dedicated columns.

**NEEDS_CLARIFICATION (Q-B.11):** Exact business meaning of `selected` vs `offer_extended`.

---

## 8. On-Hold Behavior

### 8.1 SQL Behavior

`on_hold` is **non-terminal** (L612):
```sql
(v_from_status = 'on_hold' AND p_to_status IN ('under_review','screening','shortlisted','interview_scheduled','interview_completed','selected','offer_extended','rejected','withdrawn'))
```

| To Status | Allowed? |
|---|---|
| `under_review`, `screening`, `shortlisted`, `interview_scheduled`, `interview_completed`, `selected`, `offer_extended` | ✅ |
| `rejected` | ✅ |
| `withdrawn` | ✅ |
| `applied` | ❌ (NOT in list) |
| `on_hold` | ❌ (idempotency early return, L599–601) |

### 8.2 SQL Audit Gap

Function does **NOT set any dedicated columns** when transitioning TO `on_hold`:
- No `on_hold_by` / `on_hold_at` / `on_hold_reason` columns exist in `job_applications` (L50–107).
- All on_hold transitions recorded only in `application_status_history`.

**NEEDS_CLARIFICATION (Q-B.9):** Should `on_hold` have dedicated audit columns?
---

## 9. Interview-Related Transitions

| Aspect | SQL Behavior | Evidence |
|---|---|---|
| `interview_scheduled → interview_completed` | ✅ Allowed in `change_application_status()` | `09_applications.sql` L592 |
| Interview module calls `change_application_status()` | ❌ NO | `10_interviews.sql` has ZERO references (repo-wide grep) |
| Interview `cancelled`/`no_show` → application effect | ❌ NO rule | No SQL linkage; no product decision |
| Interview states enum | Separate enum (`interview_schedule_status`) | `02_enums.sql` L340–348 |

**Q-B.10:** Interview `scheduled → completed` — SQL answer: HR/authorized NestJS command must explicitly call `change_application_status(..., 'interview_completed', ...)`. The interview module does NOT automatically update application status.

**NEEDS_CLARIFICATION:** Interview completion → application status linkage (automatic vs manual).
**NEEDS_CLARIFICATION:** Interview `cancelled`/`no_show` effect on application status — no rule in SQL or docs.

---

## 10. Transaction, Audit History and Outbox Behavior

### 10.1 Application Status Transaction

Full atomic sequence in `change_application_status()` (`09_applications.sql` L573–651):

| Step | Operation | Line |
|---|---|---|
| 1 | Metadata validation | L586–L588 |
| 2 | Row lock (`FOR UPDATE`) | L590–L593 |
| 3 | Existence check | L595–L597 |
| 4 | Idempotency (same status → early return) | L599–L601 |
| 5 | Transition allow-list validation | L603–L615 |
| 6 | Set session config flag | L617 |
| 7 | UPDATE `job_applications.status` + audit columns | L619–L628 |
| 8 | Reset session config flag | L630 |
| 9 | INSERT `application_status_history` | L632–L637 |
| 10 | INSERT `outbox_events` | L639–L648 |
| 11 | Return | L650 |

All in one function call within the caller's transaction. Guard trigger (L654–664 / L994–996) ensures no other code path can update `status` without the session flag.

### 10.2 Outbox Event Details

**Event type:** `application.status.changed` (L641), aggregate_type `job_application`, payload includes `applicationId`, `fromStatus`, `toStatus`, `changedBy`.

**Outbox states** — `02_enums.sql` L580–582: `pending`, `publishing`, `published`, `failed`, `dead_letter`.

### 10.3 Job Outbox — ABSENT

No `job.status.changed` event anywhere in baseline or `contracts/events/`.

### 10.4 Event Classification Gap

- `application.submitted` — contract exists (`contracts/events/application-submitted.v1.json`), dispatcher routing returns `undefined` → fail-closed dead-letter (`routing.spec.ts` L44). EXPECTED PHASED GAP.
- `application.status.changed` — emitted by SQL (L641) but **no contract file**, **no documented dispatcher route**. Must be classified as EXPECTED PHASED GAP.
- `job.status.changed` — does not exist at all.
---

## 11. Existing SQL Function Compatibility

### 11.1 `change_application_status()` — COMPATIBLE

| Aspect | Value | Source |
|---|---|---|
| Function definition | `change_application_status(p_application_id, p_to_status, p_changed_by, p_change_reason, p_metadata)` | `09_applications.sql` L573–579 |
| RLS grant signature | `change_application_status(UUID, public.application_status, UUID, VARCHAR, JSONB)` | `17_rls.sql` L237 |
| Match? | ✅ Yes — `VARCHAR(500)` ≡ `VARCHAR` in PostgreSQL | N/A |

### 11.2 `enforce_application_status_update_path()` — COMPATIBLE

- Function L654–664; trigger `job_applications_status_update_guard` L994–996
- Checks `current_setting('app.application_status_change', TRUE) IS DISTINCT FROM 'allowed'`
- Set by `change_application_status()` at L617, reset at L630

### 11.3 `enforce_initial_lifecycle_state()` — COMPATIBLE

- Function L455–477; triggers at L986–988, L1003, L1011, L1016, L1018 (for `job_applications`, `guest_candidate_claims`, `referral_batches`, `referral_invitations`, `referral_rewards`)

### 11.4 `enforce_application_identity()` — COMPATIBLE

- Function L479–495; trigger `job_applications_identity_guard` L973–975
- Blocks changes to `job_id`, `candidate_id`, `user_id`, `is_guest`, `guest_upload_session_id`, `guest_email`, `guest_email_normalized`, `guest_phone`, `guest_name`

### 11.5 Missing Job Functions — CONFIRMED

No `change_job_status()`, `enforce_job_status_update_path()`, `job_status_history` table, or `job.status.changed` outbox event exists anywhere in the baseline.

---

## 12. Missing Job Status Transition Enforcement

| Missing Item | File:Line | Description | Severity |
|---|---|---|---|
| `change_job_status()` function | `05_jobs.sql` — absent | Applications have `change_application_status()` at L573; jobs have no equivalent | HIGH |
| `job_status_history` table | `05_jobs.sql` — absent | `application_status_history` exists at `09_applications.sql` L113 as precedent | HIGH |
| `jobs.status` guard trigger | `05_jobs.sql` — absent | Applications blocked by `job_applications_status_update_guard` at L994–996; jobs have only `jobs_updated_at` at L277–280 | HIGH |
| `job.status.changed` outbox event | — absent | No `job.status.changed` event_type in baseline or `contracts/events/` | MEDIUM |
| No `archived_at` timestamp column | `05_jobs.sql` L162–168 | `archived` status exists (L168) but no dedicated timestamp column | LOW |
| `expires_at` comment mismatch | `05_jobs.sql` L165 | Comment says "Auto-close" but resulting enum state is `expired`, not `closed` | LOW |

---

## 13. SQL Mismatch/Gaps (vs Previous Agent Reports)

| # | Previous Agent Claim | Actual SQL | Correction |
|---|---|---|---|
| 1 | qoder L119–121: `archived_at` column exists | Only `deleted_at` at L193; no `archived_at` exists | L165 is `expires_at`; L193 is `deleted_at`. Qoder confused `deleted_at` for `archived_at`. |
| 2 | qoder L162, antigravity L162, kilo L402: `uq_registered_application_per_job` / `UNIQUE(job_id, candidate_id)` exists | Only `application_job_identity UNIQUE (id, job_id)` at L82 (trivially unique since id is PK) | `UNIQUE(job_id, candidate_id)` constraint does NOT exist. One-candidate-one-job enforced by NestJS only. |
| 3 | antigravity L16: "lines 654–664" for guard trigger | 654–664 is the **function**; trigger is at L994–996 | Minor line reference error. |
| 4 | All agents cite CODEX proposed flow as "the flow" | CODEX L3: "RECOMMENDED DRAFT"; PHASE-04 L120: "not permission to add unapproved" | Proposed flow is NOT approved or SQL-enforced. |
| 5 | qoder L46: claims `interview_scheduled_by/at` audit columns exist | Do NOT exist in `job_applications` (L50–107) | Function only sets `reviewed_by/at`, `shortlisted_by/at`, `rejected_by/at`, `rejection_reason`. |
---

## 14. API Catalog Requirements

### 14.1 Job Status Endpoints (PROPOSED — REQUIRES PRODUCT APPROVAL)

| Method | Path | Purpose | Actor (RECOMMENDED, NOT APPROVED) |
|---|---|---|---|
| POST | `/api/v1/jobs/:id/submit-for-approval` | `draft → pending_approval` | Company owner/Primary HR |
| POST | `/api/v1/jobs/:id/publish` | `pending_approval → published` OR `draft → published` | Owner/Admin (approval) / Owner/Primary HR (direct) |
| POST | `/api/v1/jobs/:id/pause` | `published → paused` | Authorized HR |
| POST | `/api/v1/jobs/:id/resume` | `paused → published` | Authorized HR |
| POST | `/api/v1/jobs/:id/close` | `published/paused → closed` | Authorized owner/HR |
| POST | `/api/v1/jobs/:id/archive` | `→ archived` | Authorized owner/HR |
| POST | `/api/v1/jobs/:id/expiry-complete` | `published → expired` | System (automated) |

### 14.2 Application Status Endpoints

| Method | Path | Purpose | Actor |
|---|---|---|---|
| POST | `/api/v1/applications/:id/status` | Call `change_application_status()` | Authorized HR/recruiter |
| POST | `/api/v1/applications/:id/withdraw` | `→ withdrawn` | Candidate (application owner) |
| POST | `/api/v1/applications/:id/respond-offer` | `offer_extended → offer_accepted/declined` | Candidate |

### 14.3 HTTP Response Standards (RECOMMENDED — NOT APPROVED)

| Scenario | Status Code | Body |
|---|---|---|
| Valid transition | 200 OK | Updated application + new history ID |
| Invalid transition | 400 Bad Request | `{"error": "Invalid status transition from X to Y"}` |
| Permission denied | 403 Forbidden | `{"error": "Insufficient permission for status transition"}` |
| Idempotent repeat (same status) | 200 OK | Current state (no duplicate rows) |
| Terminal state exit attempt | 400 Bad Request | `{"error": "Cannot transition from terminal state X"}` |
| Concurrent conflict | 409 Conflict | `{"error": "Concurrent update, retry"}` |

### 14.4 Event Contract Requirements

| Event | Contract Exists? | Dispatcher Route? | Source |
|---|---|---|---|
| `application.submitted` | ✅ Yes (`contracts/events/application-submitted.v1.json`) | ❌ No (fail-closed) | `routing.spec.ts` L44 |
| `application.status.changed` | ❌ No | ❌ No | Emitted by SQL L641, no contract/route |
| `job.status.changed` | ❌ No | ❌ No | Not emitted anywhere |
---

## 15. Invalid / Concurrent / Idempotent Transition Behavior

### 15.1 Invalid Transitions

**Applications:** `change_application_status()` raises `'Invalid application status transition: % -> %'` (L614). NestJS → HTTP 400. Direct `UPDATE job_applications SET status = ...` blocked by guard trigger (L645): `'Application status must be changed with change_application_status()'` — **even for service_role** (trigger is role-agnostic, L654–664 / L994–996).

**Jobs:** No guard exists. `UPDATE jobs SET status = 'published' WHERE status = 'closed'` **succeeds silently**. ❌ Not enforced.

### 15.2 Idempotency

**Applications:** L599–601:
```sql
IF p_to_status = v_from_status THEN
    RETURN v_from_status;
END IF;
```
Same-status call → early return. No history row, no outbox event, no error. **Silent idempotency.**

**Jobs:** No function exists.

### 15.3 Concurrency

**Applications:** `SELECT status ... FOR UPDATE` (L590–593) locks the row. Concurrent calls serialize. Second caller sees updated status and validates transition from new state.

**Jobs:** No row lock. Concurrent `UPDATE jobs` calls can race.

### 15.4 Outbox Idempotency

`outbox_events` (`15_infrastructure.sql` L23–60): each event gets unique `id` (UUID PK). `change_application_status()` inserts a new outbox event on each **valid** transition (L639–648). Idempotency at function level (same status → early return, L599–601) prevents duplicate events for repeated same-status calls. No `deduplication_key` column in `outbox_events` table.

---

## 16. Product Decisions Required (NEEDS_CLARIFICATION)

| ID | Decision | Source | Why Blocking |
|---|---|---|---|
| P-1 | Job draft/publish approval flow: Is `draft → pending_approval` mandatory, or can owner direct-publish from `draft`? | CODEX recommendation (NOT approved) | Determines job endpoints + actor matrix |
| P-2 | Job status actors: Who can publish/pause/close/archive? | CODEX recommendation (NOT approved) | No approved doc defines this |
| P-3 | Candidate withdrawal after `offer_extended`? | CODEX says "policy approval ke baad define hogi" | SQL allows; product must decide |
| P-4 | Reapply to reposted job (new job_id)? | PD-003 implies new job_id but not explicit | Affects API behavior |
| P-5 | Rejection reason mandatory? | `rejection_reason VARCHAR(500)` nullable (L73) | NestJS DTO validation needed |
| P-6 | Interview completion → application status: automatic or manual? | `10_interviews.sql` has zero references | Interview integration design |
| P-7 | Interview `cancelled`/`no_show` → application status policy? | No rule in SQL or docs | Interview integration design |
| P-8 | `selected` vs `offer_extended` business semantics? | Both in SQL allow-list but meaning unclear | API design |
| P-9 | Withdrawal/on_hold dedicated audit columns? | No such columns exist (L50–107) | Data model completeness |
| P-10 | `application.status.changed` event: contract + dispatcher route? | No contract file; routing unknown | Event-driven architecture |
| P-11 | One-candidate-one-job: Add DB `UNIQUE(job_id, candidate_id)`? | No such constraint exists (L82 is trivially unique) | Data integrity |
---

## 17. Exact Recommendations

### 17.1 Before API Catalog Freeze (MUST DO)

| # | Recommendation | Evidence |
|---|---|---|
| R1 | **Adopt SQL allow-list as frozen application transition matrix.** NestJS duplicates the map at L603–613 for HTTP-friendly errors (defense in depth; DB fails closed). | `09_applications.sql` L603–613 |
| R2 | **Classify `application.status.changed` as EXPECTED PHASED GAP.** Currently emitted (L641) but no contract + no dispatcher route → dead-letter. Add contract file + routing entry before production. | L641; `routing.spec.ts` |
| R3 | **Block direct `UPDATE jobs.status` in SQL** via `change_job_status()` function + guard trigger mirroring the application pattern. OR explicitly document NestJS-only enforcement as a deliberate architecture decision with test coverage. | `05_jobs.sql` (absent) vs `09_applications.sql` L654–664 |
| R4 | **Never invent new application states.** Enum at `02_enums.sql` L262–276 is frozen. | `02_enums.sql` L262–276 |

### 17.2 Should Fix Before API Catalog Freeze (HIGH)

| # | Recommendation | Evidence |
|---|---|---|
| R5 | Freeze job transition matrix (P-1) + actor matrix (P-2) in a product decision document. | PHASE-04 L119–132 (proposed only) |
| R6 | Decide on `job_status_history` table creation + `change_job_status()` function. | No precedent exists for jobs |
| R7 | Resolve `application.status.changed` dispatcher route + contract. | No contract file; `routing.spec.ts` only tests `application.submitted` |
| R8 | Remove or correct misleading enum comment at `02_enums.sql` L261. | Comment implies linear order that does not match SQL allow-list |
| R9 | Fix `expires_at` comment at `05_jobs.sql` L165 ("Auto-close" → "Auto-expire to `expired`"). | L165 |

### 17.3 Medium Priority

| # | Recommendation | Evidence |
|---|---|---|
| R10 | Decide rejection_reason mandatory? | L73 (nullable) |
| R11 | Decide withdrawal from `offer_extended`? | SQL allows (L611) |
| R12 | Resolve interview completion → application status linkage (automatic vs manual). | `10_interviews.sql` zero references |
| R13 | Add `on_hold_reason` / dedicated audit columns or use `change_reason` + history only. | L50–107 (no dedicated columns) |
| R14 | Decide on `job.status.changed` outbox event + contract. | Not emitted anywhere |

### 17.4 Low Priority / Future

| # | Recommendation | Priority |
|---|---|---|
| R15 | Add `archived_at` timestamp column to match `published_at`/`paused_at`/`closed_at` pattern | LOW |
| R16 | Add `job_status_history` table mirroring `application_status_history` (L113–128) | LOW (requires P-1/P-2) |
| R17 | Add `job.status.changed` outbox event + contract file | LOW (requires P-10) |
| R18 | Evaluate dedicated least-privilege DB role for job writes (OD-1 pattern from Decision-01) | LOW |
---

## 18. Implementation Readiness

### 18.1 Application Side — READY

| Component | Status | Notes |
|---|---|---|
| Status transition allow-list | ✅ SQL-ENFORCED | `change_application_status()` L603–613 |
| Invalid transition rejection | ✅ SQL-ENFORCED | RAISE EXCEPTION L614 |
| Terminal state guard | ✅ SQL-ENFORCED | No outbound in allow-list |
| Direct UPDATE guard | ✅ SQL-ENFORCED | `enforce_application_status_update_path()` L654–664, trigger L994–996 |
| Idempotency (same status) | ✅ SQL-ENFORCED | Early return L599–601 |
| Concurrency (row lock) | ✅ SQL-ENFORCED | `FOR UPDATE` L593 |
| History (immutable, append-only) | ✅ SQL-ENFORCED | Table L113, immutability trigger L1004–1006, CHECK L122–124 |
| Outbox event (atomic) | ✅ SQL-ENFORCED | `application.status.changed` L639–648 |
| Initial state enforcement | ✅ SQL-ENFORCED | `enforce_initial_lifecycle_state()` L455–477, trigger L986–988 |
| Identity immutability | ✅ SQL-ENFORCED | `enforce_application_identity()` L479–495, trigger L973–975 |

**NestJS must still implement:**
- Actor/permission validation (SQL intentionally omits this)
- Rejection reason mandatory check (if P-5 approves)
- HTTP response codes and DTOs
- `application.status.changed` dispatcher route + contract (P-10)

### 18.2 Job Side — NOT READY

| Component | Status | Notes |
|---|---|---|
| Status transition allow-list | ❌ NOT ENFORCED | No `change_job_status()` function |
| Terminal state guard | ❌ NOT ENFORCED | No guard on terminal states |
| Direct UPDATE guard | ❌ NOT ENFORCED | No `enforce_job_status_update_path()` trigger |
| Idempotency | ❌ NOT ENFORCED | No function |
| Concurrency (row lock) | ❌ NOT ENFORCED | No locking mechanism |
| History (audit trail) | ❌ NOT ENFORCED | No `job_status_history` table |
| Outbox event | ❌ NOT ENFORCED | No `job.status.changed` event |

### 18.3 Cross-Cutting Readiness

| Component | Status | Notes |
|---|---|---|
| RLS/actor separation | ✅ APPROVED | Decision-01 frozen; `service_role` only for `change_application_status()` (L235–237) |
| Access model | ✅ APPROVED | UserContextClient + SystemClient per Decision-01 |
| Phase-04 transaction template | ✅ APPROVED | PHASE-04 L19–35; applies to both job and application writes |
| Idempotency/locking requirements | ✅ APPROVED | PHASE-04 L206–212 |
| State-machine test exit criteria | ✅ APPROVED | PHASE-04 L214–224 |
| API Catalog | ⚠️ BLOCKED | Cannot freeze without P-1, P-2, P-10 |

---

## Summary

The **application** transition lifecycle is **fully SQL-enforced** and production-ready at the database level. The `change_application_status()` function (`09_applications.sql` L573–651), backed by the guard trigger (`09_applications.sql` L654–664 / L994–996), the immutable history table (`application_status_history`, L113–128), and the atomic outbox insertion (`application.status.changed`, L639–648), provides a complete, correct, and testable transition policy. NestJS must consume this function as the canonical path and add actor/permission validation (which SQL intentionally omits).

The **job** transition lifecycle has **zero DB-level enforcement**. The `job_status` enum exists (`02_enums.sql` L161–169) with 7 values, but there is no `change_job_status()` function, no `job_status_history` table, no `jobs.status` guard trigger, no job outbox event, and no job transition allow-list in SQL. The proposed flow in PHASE-04 (L119–132) and CODEX recommendations are **not approved, not enforced, and not frozen**.

**Blocking requirements before API Catalog freeze:**
1. Job transition policy must be product-approved (P-1, P-2) and SQL-enforced (R3)
2. Job actor matrix must be product-approved (P-2)
3. `application.status.changed` event must be classified/contracted/routed (R2, P-10)
4. 11 product decisions (P-1 through P-11) must be resolved

**Report saved to:** `04-nestjs-api/04-nestjs-api-app/cline-JOB-APPLICATION-TRANSITION-AUDIT.md`
**Date:** 2026-08-23
**No files were modified. No code or SQL changes were made.**
