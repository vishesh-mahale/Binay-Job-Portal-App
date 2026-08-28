# Phase 6 API Catalog — Independent Re-Review, Round 2 (Qoder)

**Review target:** `04-nestjs-api/PHASE-06-API-CATALOG.md` (revised, 795 lines; status `DRAFT — RESUME/GUEST FLOWS CATALOGUED — COMPLETE DOMAIN CATALOG PENDING`)
**Reviewer:** Qoder (independent Senior NestJS API / PostgreSQL-RLS / Security / Distributed-Systems reviewer)
**Date:** 2026-08-26
**Mode:** Re-review after catalog expansion. My round-1 approval was **not inherited**; every claim below was re-verified against executable SQL, contracts, the dispatcher registry and frozen decisions in this session. No code, SQL, contract or catalog file was modified. **No runtime test was executed**; nothing is claimed as a passed test.

---

## 1. Executive verdict

### CONDITIONAL PASS

The catalog was expanded from 189 to 795 lines: §3A–§3H now give full 13-field entries for AUTH,
COMPANY, CANDIDATE, JOB, SEARCH, APPLICATION, SAVED-CANDIDATE, REFERRAL, INTERVIEW, MESSAGE,
REALTIME, NOTIFY, ANALYTICS, FEEDBACK, AI and an honest gap entry for SUBSCRIPTION. This resolves
round-1 HIGH finding C-01. Every table, function, constraint and event name in the new entries was
re-verified against the baseline SQL and contracts — **no invented route, table, column, event or
contract was found**. Freeze is still blocked by three verifiable items: error codes used outside
the approved vocabulary (R2-01), missing entries for REQUIRED `REQ-NOTIFY-002/003` (R2-02), and
unresolved `TBD` paths that §7 requires (honest, but undecided). Coding remains NOT AUTHORIZED.

## 2. Sources inspected this round

- `PHASE-06-API-CATALOG.md` (revised 795-line target)
- `PHASE-05-FINAL-REQUIREMENTS.md` §2 coverage index (:54–66), §5 error rules (:136–153), blockers (:208–212)
- `PHASE-02-REQUIREMENTS-TRACEABILITY-MATRIX.md` (REQ-AUTH :54–60, REQ-COMPANY :66–70, REQ-CANDIDATE-006 :82, REQ-RESUME-007 :94, REQ-JOB :100–102, REQ-SEARCH :105–107, REQ-APPLICATION :113–118, REQ-REFERRAL :125–131, REQ-INTERVIEW :137–139, REQ-MESSAGE :140, REQ-NOTIFY :141–143, REQ-SAVED-CANDIDATE :150, REQ-ANALYTICS/FEEDBACK/SUBSCRIPTION :156–158, REQ-AI :164–167, REQ-PLATFORM :41–48, REQ-ONBOARDING :76, GAP-001..010)
- `PHASE-01-REQUIREMENTS-CONSOLIDATION.md` (:146, :189, :219 — saved candidates vs saved_jobs)
- `DECISION-03-APPLICATION-SUBMITTED-EVENT-HINGLISH.md` (full, 47 lines)
- `s1/codex/STAGE-03-CONSOLIDATED-DTO-ERROR-CONTRACT-REVIEW.md` §4 (:56–86) — authoritative error vocabulary per Phase-5 §5
- `s1/codex/STAGE-03-REMAINING-DECISIONS.md` :69–77 (frozen guest paths), :97–100
- Baseline SQL re-verified: `03_users_auth.sql` (users/user_sessions/user_security_log/login_history), `04_companies.sql` (companies/company_branches/departments/teams/company_members/company_settings), `05_jobs.sql` (jobs/job_skills/job_locations/job_categories/…), `08_candidates.sql` (candidate_profiles + 8 fact tables + candidate_search_profiles + `profile_change_history` :472), `09_applications.sql` (job_applications/application_status_history/application_documents/application_profile_snapshots/guest_candidate_claims/saved_jobs/saved_candidates + `saved_candidates_owner_candidate_unique` :236 + referral tables + `change_application_status` :573), `10_interviews.sql` (8 tables), `11_messaging.sql` (conversations/conversation_participants/messages/message_attachments/message_read_receipts), `12_notifications.sql`, `13_analytics.sql` (analytics_events/analytics_daily_aggregates/audit_logs), `14_subscriptions.sql`, `17_rls.sql` (:106–138 RLS enable list, :162–176 grants), `18_feedback.sql` (platform_feedback), `06_documents.sql` (:57–69 guest count/byte/expiry CHECKs)
- `contracts/` (22 JSON; includes `application-submitted.v1.json`; no cleanup contract)
- `05-outbox-dispatcher-nestjs/src/routing/event-route.registry.ts` (7 routes re-confirmed; `application.submitted` NOT registered)
- Prior phase-6 reviews re-read this round: antigravity, codex, codex-PHASE-06-CONSOLIDATED, cadence, freebuf

## 3. Round-1 issue disposition

| Round-1 ID | Status | Evidence in revised catalog |
|---|---|---|
| C-01 (HIGH, 16 backlog groups) | **FIXED** | §3A–§3H full entries now exist for all listed groups |
| C-02 (SystemClient declaration, API-RESUME-001) | PARTIAL | :36 "trusted ownership query" implies SystemClient; Decision-01 clause still not explicit |
| C-03 (SCAN_FAILED missing) | **FIXED** | API-RESUME-003 :83–84 and API-RESUME-004 error lists include SCAN_FAILED |
| C-04 (INTERNAL_ERROR fallback) | **FIXED** | Present in 003/004 and in §3A API-PLATFORM-001 :151 |
| C-05 (resume_parsing_jobs write wording) | NOT FIXED | :37 still "resume_parsing_jobs when scheduled"; verified ground truth: the row is created by the scan worker's clean→parse transaction, not by upload |
| C-06 (resume_parsing_job_events naming) | NOT FIXED | :58 still "safe job events where approved" |
| C-07 (per-entry audit/rate lines) | **FIXED** | All four resume entries carry explicit Rate-limit and Audit/security lines |
| C-08 (cleanup event phased gap) | **FIXED** | §4 :743 internal command + §6 :769–771 explicit phased-gap record |
| C-09 (reject Antigravity FIX-01) | HELD | Guest DTOs still honestly deferred (:130–131) |

## 4. 20-point verification matrix (revised catalog)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Requirement-ID traceability | PASS WITH GAPS → R2-03 | All cited IDs exist in the Phase-2 matrix; REQ-AUTH-005/006/007 covered implicitly but never cited |
| 2 | Method/path accuracy | PASS (honest TBD) | Registered resume + 6 guest paths byte-identical to REMAINING-DECISIONS :71–76; all new entries use `TBD` where no source freezes a path — nothing invented |
| 3 | Actor/role/tenant/ownership | PASS | JWT-derived ownership throughout; "role is never accepted from request body" (API-AUTH-003 :225); cross-company fail-closed acceptance lines |
| 4 | UserContextClient vs SystemClient | PASS | §1 :13–15 unchanged and correct; API-CANDIDATE-001 :308 permits UserContextClient+RLS for personal reads consistent with `17_rls.sql:162–176`; document/parsing reads on SystemClient |
| 5 | DTO fields vs real schema | PASS | `use_as_active_profile_resume`, `expected_profile_revision`, allowlisted `normalized_output` — all grounded; new entries avoid field invention by marking DTOs TBD |
| 6 | Tables/functions read/written | PASS | Every named table verified in §2 above; `change_application_status` exists (`09_applications.sql:573`); "guest claims" = `guest_candidate_claims` |
| 7 | Transaction boundaries | PASS | All write entries state atomicity with audit/history/outbox; §1 :17 "no external call inside a DB transaction"; DECISION-03 TX shape matches API-APPLICATION-001 |
| 8 | Outbox/contract/route/consumer | PASS WITH GAPS → R2-04 | Named events all exist (`candidate.profile.changed`, `job.ai.enrichment.requested`, `interview.summary.requested`, `security.scan.requested`); `application.submitted` is approved (DECISION-03) but API-APPLICATION-001 stays vague |
| 9 | Idempotency/concurrency | PASS | Idempotency-Key + expected-revision pattern consistent; saved-candidate uniqueness cites real constraint `(recruiter_user_id, candidate_id)` (`09_applications.sql:236`) |
| 10 | Rate limits, no invented numbers | PASS | Every entry: "environment-configured … limit"; zero numeric thresholds |
| 11 | Audit/security | PASS | Every new entry carries an Audit/security line (§7 template compliance achieved) |
| 12 | Error codes/sanitized responses | PARTIAL → R2-01 | `CONFLICT`, `EXPIRED`, `CURSOR_INVALID` are not in the authoritative 16-code vocabulary (consolidated DTO review §4 :58–75) |
| 13 | Acceptance/negative tests | PASS | Every entry has an acceptance line incl. negative behavior (cross-user denial, terminal-state refusal, duplicate blocking) |
| 14 | Guest session/claim rules | PASS | §3 :128–131 unchanged; grounded in `06_documents.sql:57–69` CHECKs and service-role-only consume; API-APPLICATION-003 adds claim handoff rules without inventing DTOs |
| 15 | Application-only vs canonical | PASS | API-APPLICATION-001 :440 "approved application-only resume"; no promotion path invented |
| 16 | SSE/REST recovery + WS chat | PASS | API-REALTIME-001 :631–632 transport ≠ source of truth; API-MESSAGE-001 :612 realtime publish post-commit; Decision-02 boundary kept |
| 17 | Saved-candidate privacy/uniqueness | PASS | API-SAVED-CANDIDATE-001 :489 exact DB unique constraint; owner-only visibility; no outbox invented |
| 18 | Referral/interview/notification/AI gaps | PASS WITH GAPS → R2-02 | Referral reward program and notification route gaps recorded; but REQ-NOTIFY-002/003 have no entries |
| 19 | Seven dispatcher input routes | PASS | §6 :762–763 matches registry `PHASE_1_ROUTES`+`PHASE_2_ROUTES` exactly; `application.submitted` correctly absent |
| 20 | Worker outputs not routed | PASS | §6 :766–767 names both worker outputs; matches registry header + GAP-013 |

## 5. New issues (round 2)

| Issue ID | Severity | Exact catalog/source section | Evidence | Impact | Recommended correction | Blocks freeze? | Blocks architecture? | Blocks coding? |
|---|---|---|---|---|---|---|---|---|
| R2-01 | MEDIUM | Error lists of §3A–§3F entries (:151, :171, :194, :256, :276, :296, :385, :450, :472, :492, :512, :534, :554, :574, :616, :636) vs `STAGE-03-CONSOLIDATED-DTO-ERROR-CONTRACT-REVIEW.md` §4 :58–75 | Phase-5 §5 :151–152 designates the consolidated DTO review as vocabulary source; its 16 codes contain no `CONFLICT`, no `EXPIRED`, no `CURSOR_INVALID`. 409 is already typed as STALE_REVISION / IDEMPOTENCY_CONFLICT / RESUME_LIMIT_REACHED / GUEST_SESSION_INVALID | The new domain entries silently extend the vocabulary; implementers cannot tell which codes are frozen and which are draft additions; overlaps with typed 409 codes | Either map to approved codes or add one §1 rule: "CONFLICT/EXPIRED/CURSOR_INVALID are catalog-proposed extensions pending vocabulary freeze approval", with per-code HTTP mapping and justification | YES (vocabulary must be frozen) | No | Coding already blocked |
| R2-02 | MEDIUM | Catalog §3H vs Phase-2 matrix :141–143 (REQ-NOTIFY-002 REQUIRED; REQ-NOTIFY-003 REQUIRED + GAP-006) | API-NOTIFY-001 cites REQ-NOTIFY-001..003 but implements only in-app list/ack; no entry exists for email delivery policy (002) or versioned template admin (003); §5 open decisions mention only the `notification.email.requested` route | §7 exit criterion ("every required ID has an API/use-case entry") fails for two REQUIRED IDs | Add a deferred/gap entry in the API-SUBSCRIPTION-001 style for email delivery + template management, citing GAP-006 and the unresolved dispatcher route | YES | No | Coding already blocked |
| R2-03 | LOW | §3A/§3G entries vs matrix REQ-AUTH-005/006/007 (:58–60) | REQ-AUTH-005 (access model) is enforced by §1 rules; REQ-AUTH-006 (OAuth callback) is implicit in API-AUTH-001 "signup/callback"; REQ-AUTH-007 (realtime connection auth) is implicit in API-REALTIME-001 "JWT at connect" — none is cited by ID | Traceability index cannot prove coverage of the full REQ-AUTH range | Add the three IDs to the matching entries' Requirement-ID lines | No | No | No |
| R2-04 | LOW | API-APPLICATION-001 Outbox (:446) vs DECISION-03 (APPROVED/FROZEN) | `application.submitted` v1 is a frozen contract (`contracts/events/application-submitted.v1.json`) with a documented unrouted/fail-closed phased state (DECISION-03 :26–31, GAP-012); the catalog says only "application event only where an existing contract is approved" | Understates a decided contract; a reader may think the apply event is still undecided | Name `application.submitted` (v1), its same-transaction emission, and its no-route/fail-closed phased state; add it to §6 guardrails alongside `application.status.changed` | No | No | No |
| R2-05 | LOW | Catalog status line :3 and §5 :755–756 vs §3A–§3H | Status still says "RESUME/GUEST FLOWS CATALOGUED" though 15 more groups are now detailed; §5 also says "configurable referral program" where the matrix REQ-REFERRAL-007/GAP-005 says "configurable **reward** program" | Status understates coverage (conservative, not dangerous); naming drift creates search misses | Update status to reflect expanded scope + remaining TBD paths/DTOs; align wording with GAP-005 | No | No | No |
| R2-06 | LOW | §5 open decisions vs matrix REQ-SEARCH-005 :107 (FUTURE) and REQ-RESUME-007 :94 (NEEDS_CLARIFICATION, GAP-004) | Neither has an entry (correct — not REQUIRED/current) but neither is listed in §5 open decisions | Deferred-status IDs become invisible in the freeze checklist | Add both as explicitly deferred/future lines in §5 | No | No | No |
| R2-07 | LOW | API-INTERVIEW-001 (:583–597) | Cites REQ-INTERVIEW-003 which the matrix marks FUTURE ("No API until provider contract"); Reads/Writes name only `interviews` though scheduling touches `interview_schedule_blocks`/`interviewer_availability`/`interview_participants` (`10_interviews.sql`) | Loose FUTURE citation; table list incomplete for the availability/slot-lock behavior of REQ-INTERVIEW-001 | Drop the 003 citation or mark it FUTURE-only; name the availability/schedule tables in Reads/Writes | No | No | No |
| R2-08 | LOW | Phase-5 §2 :39 ("jobs, search and saved jobs") vs catalog §3D/§5 | `saved_jobs` table exists (`09_applications.sql:213`) but the matrix defines **no** REQ-SAVED-JOB ID; the catalog has no saved-jobs CRUD entry and does not record the omission | Saved-jobs bookmarking is in Phase-5 scope but has no requirement ID upstream and no catalog record — silently invisible | Add one §5 line: saved-jobs CRUD has no REQ-ID yet; requirement decision belongs upstream before a catalog entry can be written (do not invent an entry) | No | No | No |
| R2-09 | LOW (carry-over) | API-RESUME-001 Writes (:37); API-RESUME-002 Reads (:58); API-RESUME-001 Reads (:36) | Round-1 C-02/C-05/C-06 not applied: parsing-job row is created by the scan worker's clean→parse transaction (verified chain), not upload; `resume_parsing_job_events` still unnamed; Decision-01 clause still absent | Minor precision risks for implementers | Apply the three round-1 wording fixes | No | No | No |

## 6. Prior-review cross-check (independent)

- **Codex consolidated (2026-08-27):** correctly lists the five applied corrections; all five verified present in the revised catalog. Agree.
- **Cadence:** reviewed the pre-expansion catalog; its P6-02 (domain expansion required) is now resolved; P6-01 (active-profile default) — catalog :32–33 now states the approved onboarding-rule default, acceptable; P6-03 (G-1 envelope) remains a valid open item not yet recorded in §6 — fold into R2-04 scope if desired.
- **Freebuf:** reviewed the pre-expansion catalog and claims "No previous Phase 6 review exists yet" (§7 :212) — factually false (antigravity/codex/qoder predate it); its CAT-1..CAT-4 largely overlap my round-1 C-02/C-03/C-07 and are now fixed. Not inherited.
- **Antigravity:** pre-expansion; its FIX-01 rejection (C-09) still stands — guest DTOs remain correctly deferred.

## 7. Status honesty and gates

- Status line `DRAFT — RESUME/GUEST FLOWS CATALOGUED — COMPLETE DOMAIN CATALOG PENDING` is **understated but honest** (R2-05); nothing overclaims.
- `NO NESTJS IMPLEMENTATION CODE AUTHORIZED` (:794) is **correct** (PLAN §14).
- `API CATALOG FROZEN` is **not yet reachable**: §7 requires method/path per entry, and most new entries honestly carry `TBD`; plus R2-01 (vocabulary) and R2-02 (REQ-NOTIFY-002/003) must close.

## 8. Final verdict

### CONDITIONAL PASS

The expansion is accurate, disciplined and invention-free: all 20 verification points pass or pass
with the recorded gaps. Conditions to reach `PASS — API CATALOG FROZEN`:

1. Resolve R2-01 (freeze or formally extend the error vocabulary).
2. Resolve R2-02 (add REQ-NOTIFY-002/003 deferred/gap entries).
3. Decide or formally defer the remaining `TBD` paths/DTOs per entry (§7 requirement).
4. Apply LOW fixes R2-03..R2-09.

Until then: **API CATALOG NOT FROZEN — ARCHITECTURE (Phase 7) NOT STARTED — CODING NOT AUTHORIZED**.
