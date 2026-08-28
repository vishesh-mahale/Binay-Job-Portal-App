# Phase 08 — Final Revalidation

Status: `REVALIDATION COMPLETE`

Reviewer: opencode
Audit target: `04-nestjs-api/PHASE-08-IMPLEMENTATION-PLAN.md` (338 lines)
Date: 2026-08-26

---

## Purpose

Verify that all 10 correction points from the revalidation prompt are satisfied in the
latest version of the Phase 08 implementation plan. Independent verification against all
source documents.

## Changes since previous review

The plan has been significantly updated. Key additions:

| Section | Change | Previous finding addressed |
|---|---|---|
| §1 Generic client idempotency gate | NEW 8-line gate section added | IMP-04 (idempotency persistence unspecified) |
| §6 Deterministic lock-order matrix | NEW 6-row matrix with owners | IMP-03 (lock order principle stated but order undefined) |
| §6 REQ-SEARCH-005 | Explicitly marked `FUTURE/GAP-010` | Now explicitly tracked |
| §8 Tests | 3 new tests added (outage, chat-gap, notification) | IMP-04 (Decision-02 test #7 missing) |
| §9 Phase 03 gap ownership map | NEW 13-row ownership table | IMP-07 (6 gaps lacked specific owners) |
| §10 G-5 disposition | NEW 3-line disposition for application.submitted | Not previously covered |
| §10 Registered event producer ownership | NEW 7-row ownership table | Not previously covered |
| §12 Load-test thresholds | Clarified as Phase 09 gate | IMP-05 (pass criteria undefined) |

---

## Verification 1: Deterministic row-lock order matrix exists and is implementable

### §6 matrix content

| Command family | Lock order (parent to child) | Owner |
|---|---|---|
| Resume upload/confirm | users → candidate_profiles → uploaded_documents → parsing/profile facts | resumes-documents/candidates |
| Registered/guest application | jobs → candidate/guest session → uploaded document → job application → snapshot | applications |
| Application status | job_applications → company membership/actor context → status history | applications |
| Referral attribution | job → invitation/claim → application → reward | referrals |
| Interview scheduling | application → interviewer/availability → schedule block → participants | interviews |
| Message send/read | conversation → participant membership → message/read receipt | messaging |

Plus: "Child rows with no parent lock are locked in stable UUID order."
Plus: "This matrix is mandatory for Phase 09 implementation and concurrency tests; no command may introduce an ad-hoc order."

### Table existence verification

All 21 tables referenced in the matrix verified against SQL baseline:

| Table | Baseline file | Exists |
|---|---|---|
| users | 03_users_auth.sql | ✓ |
| candidate_profiles | 08_candidates.sql | ✓ |
| uploaded_documents | 06_documents.sql | ✓ |
| resume_parsing_jobs | 07_resume_processing.sql | ✓ |
| jobs | 05_jobs.sql | ✓ |
| guest_upload_sessions | 06_documents.sql | ✓ |
| job_applications | 09_applications.sql | ✓ |
| application_profile_snapshots | 09_applications.sql | ✓ |
| application_status_history | 09_applications.sql | ✓ |
| company_members | 04_companies.sql | ✓ |
| referral_batches | 09_applications.sql | ✓ |
| referral_invitations | 09_applications.sql | ✓ |
| referral_rewards | 09_applications.sql | ✓ |
| interviews | 10_interviews.sql | ✓ |
| interviewer_availability | 10_interviews.sql | ✓ |
| interview_schedule_blocks | 10_interviews.sql | ✓ |
| interview_participants | 10_interviews.sql | ✓ |
| conversations | 11_messaging.sql | ✓ |
| conversation_participants | 11_messaging.sql | ✓ |
| messages | 11_messaging.sql | ✓ |
| message_read_receipts | 11_messaging.sql | ✓ |

**0 invented tables.** The matrix is implementable — every lock target has a corresponding `CREATE TABLE` in the baseline.

**Verdict: PASS**

---

## Verification 2: Generic client idempotency persistence has owner and forward-migration gate

### §1 gate content

"Existing domain-specific keys (`resume_parsing_jobs`, referrals, notifications and analytics) remain
authoritative where their schemas already provide them. A generic client-command idempotency store
is not present in SQL 01–18, so Phase 09 must not invent an in-memory-only guarantee. Platform owns
an approved forward migration/design for durable key + request fingerprint + response reference,
with retention and tenant scope defined before any generic command depends on it. Until that gate
closes, commands use their existing domain keys or remain explicitly `TBD`."

### Verification

| Claim | Correct? |
|---|---|
| Domain-specific keys remain authoritative | ✓ `resume_parsing_jobs.idempotency_key` UNIQUE, referral invitation identity UNIQUE, notification idempotency_key UNIQUE, analytics idempotency_key UNIQUE |
| Generic store not in SQL 01–18 | ✓ No generic idempotency table exists in baseline |
| Phase 09 must not invent in-memory-only | ✓ Explicit prohibition |
| Platform owns forward migration/design | ✓ Owner assigned |
| Retention + tenant scope defined before dependency | ✓ Gate specified |
| Until gate closes: existing domain keys or TBD | ✓ Fallback rule |

**Verdict: PASS**

---

## Verification 3: G-5 `application.submitted` expected-unrouted event has owner, audit and alert disposition

### §10 disposition content

"G-5 disposition: `application.submitted` is an approved, expected-unrouted event. Applications
owns its atomic producer; Dispatcher owns an allowlisted expected-unrouted/alert-suppression rule
until the notification route is approved. It must remain auditable and must not be silently dropped."

### Cross-check against Decision-03

| Decision-03 rule | §10 disposition | Consistent |
|---|---|---|
| "dispatcher route abhi register nahi hoga" | "expected-unrouted event" | ✓ |
| "Unrouted event behavior fail-closed aur observable rahega" | "must remain auditable and must not be silently dropped" | ✓ |
| "notification phase mein route add hoga" | "until the notification route is approved" | ✓ |
| Same-transaction atomic emit | "Applications owns its atomic producer" | ✓ |

### Audit mechanism

The `outbox_events` table (15_infrastructure.sql) retains the row with status `pending`. The dispatcher's fail-closed behavior means the row stays auditable — it transitions to `failed` with an `unknown_route` error but remains in the table. The "alert-suppression rule" means monitoring does not fire false alerts for this known-unrouted event.

**Verdict: PASS**

---

## Verification 4: Phase 03 GAP-003..015 owners, acceptance and gates defined

### §9 ownership map

| Gap | Owner/gate | Treatment | Consistent with Phase 03 |
|---|---|---|---|
| GAP-003 SLO | Platform/Operations gate | Phase 09 load test thresholds before production | ✓ |
| GAP-004 fast-track | Resume/AI product decision | Deferred; no fast-track invented | ✓ |
| GAP-005 referral programs | Referrals + Product decision | Manual scope proceeds; configurable blocked | ✓ |
| GAP-006 email templates | Notifications + Product/provider | Deferred; no template invented | ✓ |
| GAP-007 saved candidates | Candidates module | Implemented in Phase 08-D | ✓ |
| GAP-008 subscription | Subscriptions + Product decision | Explicitly blocked | ✓ |
| GAP-009 AI provider | AI commands + Product/AI decision | Generic producer only; provider gate | ✓ |
| GAP-010 external search | Search + Product/Infrastructure | PostgreSQL only; external deferred | ✓ |
| GAP-011 realtime reconnect | Realtime module | SSE/WS cursor recovery tests required | ✓ |
| GAP-012 application.submitted | Applications + Contracts gate | Atomic emit; unrouted fail-closed | ✓ |
| GAP-013 dispatcher routing | Dispatcher owner | Registry authority; phased-gap tests | ✓ |
| GAP-014 accessibility | Next.js/Product quality gate | API unaffected; WCAG before UI release | ✓ |
| GAP-015 notification email | Notifications/Dispatcher gate | Deferred until contract/provider | ✓ |

**All 13 gaps have specific owners, acceptance criteria (via treatment) and phase gates.** Exit criterion #4 is fully satisfied.

**Verdict: PASS**

---

## Verification 5: Realtime outage, ordered chat-gap recovery and notification recovery tests present

### §8 tests (lines 230-237)

| Test | Covers | Source rule |
|---|---|---|
| JWT/ticket auth at REST/SSE/WS connect and tenant isolation | Authentication | Decision-02 §4 |
| SSE reconnect recovers authoritative state; missed events do not lose truth | SSE recovery | Decision-02 §5 |
| WS reconnect recovers durable message cursor; non-participant cannot join | Chat recovery | Decision-02 §7 |
| DB rollback emits no realtime event; duplicate message/idempotency is safe | Rollback + idempotency | Decision-02 §6 |
| **Realtime transport outage does not fail or roll back REST business commands; recovery fetches authoritative rows after reconnect** | **Outage resilience** | **Decision-02 §1, §5** |
| **Chat gap recovery returns every missed durable message in cursor order** | **Ordered chat recovery** | **Decision-02 §7, §5** |
| **Notification list/unread/ack remains correct when the SSE stream is disconnected** | **Notification recovery** | **Decision-02 §5, REQ-NOTIFY-001** |

All 3 new tests present and correctly covering:
1. Realtime outage → REST commands unaffected ✓
2. Ordered chat-gap recovery via cursor ✓
3. Notification correctness during SSE disconnect ✓

**Verdict: PASS**

---

## Verification 6: `REQ-SEARCH-005` kept as FUTURE

### §6 line 156

"`REQ-JOB-001..003`, `REQ-SEARCH-001..004` (current; `REQ-SEARCH-005` FUTURE/GAP-010), `REQ-APPLICATION-001..007`"

### §9 GAP-010 row

"GAP-010 external search engine | Search + Product/Infrastructure decision | PostgreSQL search scope only; external engine deferred"

REQ-SEARCH-005 is explicitly marked FUTURE and deferred. No external search engine work is included in Phase 08 scope.

**Verdict: PASS**

---

## Verification 7: Event producer ownership mapping is correct

### §10 producer ownership table

| Event | Emitting use case | Phase 08 owner | Dispatcher route exists | Contract exists | Worker handler exists |
|---|---|---|---|---|---|
| security.scan.requested | profile/guest document upload | resumes-documents | ✓ | ✓ | ✓ |
| resume.parse.requested | clean security-scan transition | resumes-documents/AI boundary | ✓ | ✓ | ✓ |
| candidate.profile.changed | candidate confirmation | candidates | ✓ | ✓ | ✓ |
| match.analyze.requested | approved application/matching trigger | applications/ai-commands | ✓ | ✓ | ✓ |
| job.ai.enrichment.requested | approved job lifecycle point | jobs/ai-commands | ✓ | ✓ | ✓ |
| job.screening_questions.requested | approved job lifecycle point | jobs/ai-commands | ✓ | ✓ | ✓ |
| interview.summary.requested | approved interview completion point | interviews/ai-commands | ✓ | ✓ | ✓ |

All 7 events:
- Match dispatcher registry exactly ✓
- Have correct emitting use case descriptions ✓
- Have correct Phase 08 owner assignments ✓
- Have existing contracts ✓
- Have existing worker handlers ✓
- Are the only 7 dispatcher-routable request events ✓

**application.submitted** correctly excluded from this table and covered separately under G-5 ✓

**Verdict: PASS**

---

## Verification 8: No invented table, field, event, route, provider or role

| Category | Check | Result |
|---|---|---|
| Tables | All lock-order matrix tables exist in SQL baseline | ✓ 0 invented |
| Fields | No column-level details proposed in Phase 08 | ✓ 0 invented |
| Events | All 7 events match dispatcher registry + contracts | ✓ 0 invented |
| Routes | All routes from dispatcher registry; no new API routes invented | ✓ 0 invented |
| Providers | Supabase, Cloud Tasks, ClamAV, Gemini/Vertex/OpenAI only | ✓ 0 invented |
| Roles | Existing roles from 02_enums.sql (candidate, hr, employer, admin) | ✓ 0 invented |

**Verdict: PASS**

---

## Verification 9: All Phase 06 APIs mapped to implementation work packages and tests

| Phase 08 | APIs | Count | Tests |
|---|---|---|---|
| 08-A | API-PLATFORM-001 | 1 | 4 exit criteria |
| 08-B | API-AUTH-001..003, API-ONBOARDING-001, API-COMPANY-001..003 | 7 | 4 tests |
| 08-C | API-RESUME-001..004, API-CANDIDATE-001..003, API-APPLICATION-003 | 8 | 6 tests |
| 08-D | API-JOB-001, API-SEARCH-001..002, API-APPLICATION-001..002, API-SAVED-CANDIDATE-001 | 6 | 5 tests + lock-order matrix |
| 08-E | API-REFERRAL-001..003, API-INTERVIEW-001 | 4 | 4 tests |
| 08-F | API-NOTIFY-001..003, API-MESSAGE-001, API-REALTIME-001 | 5 | 7 tests |
| 08-G | API-AI-001, API-ANALYTICS-001, API-FEEDBACK-001, API-SUBSCRIPTION-001 | 4 | gap ownership map |
| **Total** | | **35** | **34+ tests** |

All 35 Phase 06 API entries mapped. No unmapped entries.

**Verdict: PASS**

---

## Verification 10: Security, RLS, SystemClient/UserContextClient, transaction, outbox and rollback rules intact

### Security (§11)

- Secret Manager bindings ✓
- No service-role in browser/logs/task payloads ✓
- RLS negative tests + NestJS guard/ownership tests ✓
- Rate limits as configuration ✓
- Structured logs, traces, health, audit retention ✓

### RLS + SystemClient/UserContextClient (§1)

- UserContextClient for approved RLS reads only ✓
- SystemClient for all writes + protected reads ✓
- Separate injectable tokens (§3) ✓
- Cross-tenant negative tests (§4, §11) ✓
- 17_rls.sql policies enforce tenant bounds ✓

### Transaction (§1)

- validate → authorize → BEGIN → business + history/audit + outbox → COMMIT ✓
- No external calls inside transaction ✓
- Deterministic lock-order matrix (§6) ✓

### Outbox (§10)

- 7 registered events with producer ownership ✓
- application.submitted atomic + fail-closed ✓
- Dispatcher registry is route authority ✓
- Gate G-1 envelope reconciliation required before producer implementation ✓

### Rollback (§13)

- Feature flags for phased behavior ✓
- Forward-only migrations ✓
- Disable consumer before rollback ✓
- Preserve outbox/audit/history ✓
- Dead-letter reconciliation via runbooks ✓

All rules intact and consistent with Decision-01..06, Phase 05, Phase 07, and SQL baseline.

**Verdict: PASS**

---

## Revalidation summary

| # | Correction point | Result |
|---|---|---|
| 1 | Deterministic row-lock order matrix exists and is implementable | PASS — 6 command families, 21 tables verified, 0 inventions |
| 2 | Generic client idempotency persistence has owner and forward-migration gate | PASS — §1 gate section with Platform owner, retention/tenant scope gate |
| 3 | G-5 application.submitted expected-unrouted event has owner, audit and alert disposition | PASS — §10 disposition with Applications owner, Dispatcher alert-suppression, auditable |
| 4 | Phase 03 GAP-003..015 owners, acceptance and gates defined | PASS — §9 ownership map with all 13 gaps assigned |
| 5 | Realtime outage, ordered chat-gap recovery and notification recovery tests present | PASS — §8: 3 new tests added |
| 6 | REQ-SEARCH-005 kept as FUTURE | PASS — §6 explicitly marks FUTURE/GAP-010 |
| 7 | Event producer ownership mapping is correct | PASS — §10: 7 events correctly mapped |
| 8 | No invented table, field, event, route, provider or role | PASS — 0 inventions |
| 9 | All Phase 06 APIs mapped to implementation work packages and tests | PASS — 35/35 APIs mapped |
| 10 | Security, RLS, SystemClient/UserContextClient, transaction, outbox and rollback rules intact | PASS — all rules intact |

**10 of 10 correction points satisfied.**

---

## ISSUE LOG

| Issue ID | Severity | Finding | Blocks approval |
|---|---|---|---|
| (none) | — | No issues found | — |

---

## FINAL VERDICT

### **PASS — IMPLEMENTATION PLAN APPROVED**

All 10 correction points verified and satisfied. The Phase 08 implementation plan is comprehensive, evidence-grounded, and correctly addresses all findings from the previous review:

- **Lock-order matrix**: 6 command families with specific parent-to-child ordering, 21 verified tables, UUID fallback for childless rows, mandatory for Phase 09
- **Idempotency gate**: Generic store explicitly prohibited from in-memory-only; Platform owns forward migration with retention/tenant scope gate
- **G-5 disposition**: application.submitted has owner (Applications), audit (outbox_events retention), alert-suppression (Dispatcher), and non-drop guarantee
- **Gap ownership**: All 13 Phase 03 gaps have specific owners, treatments, and phase gates
- **Tests**: 7 tests in §8 covering auth, SSE reconnect, WS cursor, rollback, outage resilience, ordered chat-gap, and notification recovery
- **REQ-SEARCH-005**: Explicitly FUTURE/GAP-010
- **Producer ownership**: 7 events mapped to emitting use cases and Phase 08 owners
- **Zero inventions**: No invented tables, fields, events, routes, providers or roles
- **Full API coverage**: 35/35 Phase 06 APIs mapped to work packages and tests
- **All rules intact**: Security, RLS, client separation, transaction, outbox, rollback consistent with all authority documents

The plan is approved for Phase 09 implementation coding.
