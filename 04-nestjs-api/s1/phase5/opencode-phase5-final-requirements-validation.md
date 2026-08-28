# Phase 05 — Final Requirements Validation Report

> **Independent audit of `PHASE-05-FINAL-REQUIREMENTS.md` against Phase 1–4, executable SQL baseline, contracts, dispatcher/worker code, and approved decisions.**

Date: 2026-08-26
Target: `04-nestjs-api/PHASE-05-FINAL-REQUIREMENTS.md`
Reviewer: OpenCode (Senior Product Architect + NestJS Architect + PostgreSQL Security Reviewer + Distributed-Systems Engineer)

---

## 1. Executive verdict

```text
Reviewer:              OpenCode
Verdict:               CONDITIONAL PASS — NOT READY FOR FREEZE
Status claimed:        FREEZE CANDIDATE — API CATALOG BLOCKERS TRACKED — CODING NOT AUTHORIZED
Status accurate:       NO — exit criteria not met; document is a navigation stub, not a freeze candidate
Blocking issues:       4 BLOCKER, 6 HIGH, 5 MEDIUM, 4 LOW
Coding authorized:     NO
```

**Summary:** Phase 5 is a high-level scope/rules document, not a verifiable final-requirements freeze. It lists frozen rules and scope but does not demonstrate compliance with its own exit criteria (§10). It lacks a requirement-ID coverage table, DB-write owner mapping, async event inventory, state-machine traceability, and honest boundary documentation for items that are genuinely frozen vs. still open. The status claim `FREEZE CANDIDATE` is premature.

---

## 2. Files/sources inspected

| # | Source | What was checked |
|---|---|---|
| 1 | `AGENTS.md` | Working rules, authority order, validation expectations |
| 2 | `PHASE-05-FINAL-REQUIREMENTS.md` | **Audit target** — all 10 sections |
| 3 | `PLAN-REQUIREMENTS-TO-IMPLEMENTATION-HINGLISH.md` | Phase workflow, coding gate, authority order |
| 4 | `PHASE-01-REQUIREMENTS-CONSOLIDATION.md` | 50+ requirement IDs, status labels, source references |
| 5 | `PHASE-02-REQUIREMENTS-TRACEABILITY-MATRIX.md` | Traceability mapping, 12 gaps, dispatcher routing |
| 6 | `PHASE-03-GAP-CONFLICT-ANALYSIS.md` | 15 gaps, 5 conflicts, decision status |
| 7 | `PHASE-04-STATE-MACHINES-AND-TRANSACTIONS.md` | State machines, transaction templates, lifecycle rules |
| 8 | `STAGE-03-NESTJS-API-REQUIREMENTS-SYNC.md` | Four resume API flows, DTOs, validation, error behavior |
| 9 | `STAGE-03-REMAINING-DECISIONS.md` | 11 open decision areas including DTOs, idempotency, rate limits |
| 10 | `DECISION-01-NESTJS-SUPABASE-ACCESS-MODEL-HINGLISH.md` | Controlled hybrid model, UserContextClient/SystemClient |
| 11 | `DECISION-02-REALTIME-TRANSPORT-HINGLISH.md` | SSE/WebSocket split, reconnect, chat boundary |
| 12 | `02-database/migrations/baseline/01-18` | All enums, tables, functions, RLS, indexes |
| 13 | `contracts/events/` (14 files) | Event schemas, envelope alignment |
| 14 | `contracts/tasks/` (7 files) | Task payload contracts |
| 15 | `05-outbox-dispatcher-nestjs/src/routing/event-route.registry.ts` | 7 registered routes, phased gaps |
| 16 | `07-fastapi-ai-worker/app/` | Exception hierarchy, task handlers |
| 17 | `01-requirements/product-decisions/PD-001..004` | Frozen product decisions |
| 18 | `01-requirements/current/PRODUCT-REQUIREMENTS.md` | Current product requirements |
| 19 | `02-database/migrations/baseline/17_rls.sql` | RLS policies, grants, function permissions |

---

## 3. Requirement coverage table

### 3.1 BLOCKER — No requirement-ID coverage table exists

**Issue ID:** P5-001
**Severity:** BLOCKER
**Section:** Whole document
**What Phase 5 says:** "The complete requirement-ID inventory remains in Phase 1/2" (§2)
**What source says:** PLAN §9 requires Phase 5 to contain "har required feature ka requirement ID hai" and "har requirement ka source hai"
**Why it matters:** A final-requirements document without a requirement-ID coverage table cannot demonstrate that all REQUIRED requirements are represented. The exit criteria (§10) explicitly requires "every required requirement ID has a source and owner" — Phase 5 does not provide this.
**Recommended correction:** Add a full requirement-ID coverage table with columns: Requirement ID | Status (REQUIRED/FUTURE/NEEDS_CLARIFICATION) | Source | Owner | Phase 5 section reference | Verified
**Blocks Phase 6:** YES — API catalog cannot be built without verified requirement coverage
**Blocks coding:** YES — coding gate requires this (PLAN §14)

### 3.2 HIGH — Requirement IDs not mapped

**Issue ID:** P5-002
**Severity:** HIGH
**Section:** §2 (Current production scope)
**What Phase 5 says:** Lists 13 domain areas (identity, companies, candidates, etc.)
**What source says:** Phase 1 has 50+ specific `REQ-*` IDs across 15 domains
**Why it matters:** Domain-area listing is not requirement-ID mapping. A requirement can be present in a domain area but still be missing, compressed, or incorrectly classified.
**Recommended correction:** Map each domain area to its requirement IDs and verify status

---

## 4. Domain coverage findings

### 4.1 HIGH — Saved candidates scope boundary incorrect

**Issue ID:** P5-003
**Severity:** HIGH
**Section:** §8 (Explicitly excluded or future scope)
**What Phase 5 says:** "Exact chat/message API catalog details" listed as excluded
**What source says:** `REQ-SAVED-CANDIDATE-001` is `REQUIRED / FROZEN` in Phase 1 (:146), resolved by approved Decision-04 in Phase 3 (:37), and GAP-007 is marked `NO CONFLICT` (:37). Phase 2 (:150) lists it as `REQUIRED`.
**Why it matters:** Saved candidates is an approved current-scope requirement with a frozen policy decision. Omitting it from the scope or treating it as future contradicts three prior phases.
**Recommended correction:** Add saved candidates to §2 domain areas or explicitly document why it is excluded despite being REQUIRED/FROZEN
**Blocks Phase 6:** YES — API catalog must include saved-candidate endpoints
**Blocks coding:** YES

### 4.2 MEDIUM — Messaging/notification scope unclear

**Issue ID:** P5-004
**Severity:** MEDIUM
**Section:** §2, §8
**What Phase 5 says:** §2 mentions "referrals, interviews, notifications and messaging according to the approved requirement IDs"; §8 excludes "Exact chat/message API catalog details"
**What source says:** `REQ-MESSAGE-001` is `APPROVED DIRECTION` → `REQUIRED`; `REQ-NOTIFY-001/002` are `APPROVED`/`APPROVED DIRECTION` → `REQUIRED`; `REQ-NOTIFY-003` is `PLANNED CURRENT / GAP`
**Why it matters:** The boundary between "messaging is in scope" and "chat API catalog details are excluded" is not clearly defined. Readers cannot determine which messaging/notification requirements are current vs. future.
**Recommended correction:** Clarify: messaging/notification requirements are in scope; exact API catalog DTOs/paths are Phase 6 work

### 4.3 MEDIUM — Referral program scope compressed

**Issue ID:** P5-005
**Severity:** MEDIUM
**Section:** §2, §8
**What Phase 5 says:** Referrals listed in §2 scope; no mention of GAP-005 (configurable reward programs)
**What source says:** `REQ-REFERRAL-007` is `PLANNED CURRENT / GAP` (:127); Phase 3 GAP-005 is `GAP` with `High` priority (:35)
**Why it matters:** The referral reward program is a current-scope gap, not a future item. Phase 5 does not track it as an open gap.
**Recommended correction:** Add GAP-005 to §9 blockers or explicitly document its phased treatment

---

## 5. Database/RLS findings

### 5.1 BLOCKER — RLS claim contradicts executable SQL

**Issue ID:** P5-006
**Severity:** BLOCKER
**Section:** §3 (Access model)
**What Phase 5 says:** "Approved direct reads remain subject to the existing RLS policies; default-deny tables are not made public by inventing policies"
**What source says:** `17_rls.sql` lines 162-176 grant SELECT on 30+ tables to `authenticated` role. Lines 178-230 create explicit RLS policies for personal reads (`users_own_read`, `candidate_profiles_own_read`, `applications_candidate_read`, `saved_candidates_own_read`, etc.). Line 152 revokes ALL, then lines 155-176 selectively re-grant SELECT.
**Why it matters:** The statement implies RLS is only default-deny, but the executable SQL has extensive authenticated SELECT grants and RLS policies for personal reads. This misrepresents the actual security model and could cause incorrect NestJS implementation (e.g., using SystemClient for reads that could use UserContextClient + RLS).
**Recommended correction:** State accurately: "Authenticated personal reads use UserContextClient + existing RLS SELECT policies (17_rls.sql lines 162-230). Tables without explicit SELECT grants remain default-deny. Business writes use SystemClient."
**Blocks Phase 6:** YES — API catalog must correctly assign UserContextClient vs SystemClient per use-case
**Blocks coding:** YES

### 5.2 MEDIUM — uploaded_documents RLS not documented

**Issue ID:** P5-007
**Severity:** MEDIUM
**Section:** §3 (Upload and parsing)
**What Phase 5 says:** "Browser uploads multipart data to NestJS; direct browser-to-Supabase Storage is prohibited"
**What source says:** `17_rls.sql` line 87 enables RLS on `uploaded_documents`, line 152 revokes ALL, and lines 248+ mark it as service-only (no authenticated SELECT grant)
**Why it matters:** The document correctly states browser cannot access Storage, but does not note that `uploaded_documents` has no authenticated RLS read path — all reads must go through NestJS SystemClient with ownership checks. This is a critical implementation detail.
**Recommended correction:** Add to §3: "`uploaded_documents`, `resume_parsing_jobs`, `resume_parsed_data` have no authenticated RLS read grant; all reads use SystemClient with NestJS ownership verification"

---

## 6. State-machine/transaction findings

### 6.1 MEDIUM — UI status contract not traceable to DB enums

**Issue ID:** P5-008
**Severity:** MEDIUM
**Section:** §6 (UI status contract)
**What Phase 5 says:** Lists 9 UI stages: UPLOADED, SECURITY_SCANNING, SECURITY_REJECTED, SECURITY_RETRYABLE_FAILURE, PARSING_QUEUED, PARSING_IN_PROGRESS, REVIEW_READY, REVIEW_READY_PARTIAL, PARSING_FAILED
**What source says:** `02_enums.sql` has `security_scan_status` = pending/scanning/clean/infected/failed/quarantined and `resume_processing_status` = uploaded/queued/processing/parsed/ai_enriching/completed/failed/partial
**Why it matters:** The UI stages are a projection of two DB enums, but the derivation rule is not documented. For example:
- SECURITY_REJECTED maps to `security_scan_status IN ('infected','quarantined')` — not stated
- SECURITY_RETRYABLE_FAILURE maps to `security_scan_status = 'failed'` — not stated
- REVIEW_READY_PARTIAL maps to `resume_processing_status = 'partial'` — not stated
Without the derivation rule, the status API implementation may be inconsistent.
**Recommended correction:** Add a derivation table mapping `(security_scan_status, processing_status)` → UI stage

### 6.2 MEDIUM — Application status transition graph not frozen

**Issue ID:** P5-009
**Severity:** MEDIUM
**Section:** §7 (Canonical profile confirmation)
**What Phase 5 says:** No mention of application status transitions
**What source says:** Phase 4 §8.1 (:134-142) states "The complete transition graph must be approved in the API catalog; invalid transitions must fail closed" and lists 13 application statuses
**Why it matters:** Application status transitions are explicitly marked as requiring API catalog approval. Phase 5 should note this as an open item, not silently omit it.
**Recommended correction:** Add to §9: "Application status transition graph requires API catalog approval (Phase 4 §8.1)"

---

## 7. Async/event findings

### 7.1 HIGH — Async event inventory absent

**Issue ID:** P5-010
**Severity:** HIGH
**Section:** §3 (Transactions and async work)
**What Phase 5 says:** "Dispatcher/worker processing is idempotent and uses approved event/task contracts"
**What source says:** Phase 2 §17 (:198-212) identifies 7 registered dispatcher routes and 6+ expected phased gaps. Phase 3 §3 (:186-212) documents GAP-012, GAP-013, GAP-015.
**Why it matters:** The exit criteria (§10) requires "every async event has an existing contract and consumer or an explicit phased-gap record." Phase 5 does not enumerate events or demonstrate compliance.
**Recommended correction:** Add an async event inventory table with: Event name | Contract exists | Dispatcher route | Consumer | Status (registered/phased gap)

### 7.2 HIGH — application.submitted event treatment unclear

**Issue ID:** P5-011
**Severity:** HIGH
**Section:** §7, §8
**What Phase 5 says:** No mention of `application.submitted` event
**What source says:** `contracts/events/application-submitted.v1.json` exists and is approved (Phase 3 GAP-012). Phase 3 (:182) requires "NestJS emits the approved v1 domain event atomically." No dispatcher route exists yet.
**Why it matters:** This is an approved contract that NestJS must emit atomically with the apply transaction. Phase 5 should document this as a current-scope requirement with phased dispatcher routing.
**Recommended correction:** Add to §3: "NestJS emits `application.submitted` v1 atomically with application+snapshot transaction; dispatcher notification route remains phased (GAP-012)"

### 7.3 MEDIUM — notification.email.requested not tracked

**Issue ID:** P5-012
**Severity:** MEDIUM
**Section:** §8 (Explicitly excluded)
**What Phase 5 says:** "Future email delivery and unapproved notification event routes"
**What source says:** `event-route.registry.ts` line 15 explicitly documents `notification.email.requested` as "NOT registered (unresolved — Gate G-1/G-5)". Phase 3 GAP-015 (:206-212) is `EXPECTED PHASED GAP`.
**Why it matters:** The event is an expected phased gap with a documented owner, not a generic "future" item. Phase 5 should reference GAP-015 specifically.
**Recommended correction:** Replace generic statement with: "`notification.email.requested` is an expected phased gap (GAP-015); dispatcher rejects/unroutes it safely"

---

## 8. Security/privacy findings

### 8.1 HIGH — Error envelope not frozen

**Issue ID:** P5-013
**Severity:** HIGH
**Section:** §5 (Public response/error rules)
**What Phase 5 says:** "Both success and error responses use the approved envelope direction" with a JSON example containing `success`, `data`, `request_id`, `trace_id`, `schema_version`
**What source says:** STAGE-03-REMAINING-DECISIONS §1 (:9-22) lists "Exact DTOs, status codes and error contract" as open. STAGE-03-CONSOLIDATED-REMAINING-DECISIONS-REVIEW §2.2 (:41-43) states "no repository file freezes the exact envelope." The DTO review (opencode-STAGE-03-DTO-ERROR-CONTRACT-REVIEW.md) identifies 3 blocking issues with the error contract.
**Why it matters:** The envelope is presented as "approved" but is actually still an open decision. The `schema_version` field in the example is not in the DTO review's recommended envelope. Presenting an unfrozen contract as approved misleads implementers.
**Recommended correction:** Change to: "The error envelope direction is under review (Stage 3 DTO review). The proposed format is TBD pending resolution of blocking issues."
**Blocks Phase 6:** YES — API catalog requires frozen error contract
**Blocks coding:** YES

### 8.2 MEDIUM — 10-resume limit presented as frozen

**Issue ID:** P5-014
**Severity:** MEDIUM
**Section:** §3 (Upload and parsing)
**What Phase 5 says:** "Profile library limit is 10 active resumes"
**What source says:** PD-002 defines the 10-limit. Phase 3 §3 (:76-77) lists "10-resume limit enforcement timing and error behavior" as an open decision. STAGE-03-CONSOLIDATED (:76) lists it as "Missing required decision."
**Why it matters:** The limit exists in PD-002, but enforcement timing (upload-time reject vs. confirm-time re-check) and error behavior are still open decisions. Presenting it as frozen is inaccurate.
**Recommended correction:** Add: "10-resume limit is approved (PD-002); enforcement timing and error code are open decisions"

### 8.3 MEDIUM — Saved candidates listed as excluded

**Issue ID:** P5-015 (same root as P5-003, different section)
**Severity:** MEDIUM
**Section:** §8
**What Phase 5 says:** §8 does not list saved candidates as excluded, but also does not list it as included
**What source says:** `REQ-SAVED-CANDIDATE-001` is `REQUIRED / FROZEN` with approved Decision-04
**Why it matters:** An approved requirement with frozen policy should not be ambiguously positioned
**Recommended correction:** Move saved candidates from implicit exclusion to explicit current scope

---

## 9. Realtime findings

### 9.1 LOW — Realtime section incomplete

**Issue ID:** P5-016
**Severity:** LOW
**Section:** §3 (Realtime)
**What Phase 5 says:** "SSE is the live optimization for status/notification updates. REST/database state remains authoritative. WebSocket is reserved for chat."
**What source says:** Decision-02 (:9-21) provides a detailed per-use-case transport mapping (7 use cases). Decision-02 §7 (:60) defines chat boundary. Decision-02 §8 (:64-74) defines module boundary.
**Why it matters:** The summary is correct but lacks the per-use-case mapping that would help implementers. For example, whether application status uses SSE or polling is not clear from Phase 5 alone.
**Recommended correction:** Reference Decision-02 for the detailed transport mapping; do not reinvent the summary

---

## 10. Missing or conflicting requirements

### 10.1 BLOCKER — Document is a navigation stub, not a freeze candidate

**Issue ID:** P5-017
**Severity:** BLOCKER
**Section:** Whole document
**What Phase 5 says:** Status is `FREEZE CANDIDATE — API CATALOG BLOCKERS TRACKED — CODING NOT AUTHORIZED`
**What source says:** PLAN §9 (:294-311) requires Phase 5 to contain "approved current production scope" with every requirement ID having a source and owner. The exit criteria (Phase 5 §10) requires verification against Phase 1–4.
**Why it matters:** Phase 5 is 192 lines. Phase 1 is 228 lines, Phase 2 is 228 lines, Phase 3 is 259 lines, Phase 4 is 239 lines. A final-requirements document that is shorter than any of its input phases cannot possibly contain the consolidated, verified, traceable requirements it claims. It is a summary, not a freeze.
**Recommended correction:** Either expand Phase 5 to include full requirement-ID coverage, DB-write owner mapping, async event inventory, and state-machine traceability — or rename it to "Phase 5 Draft Summary" and create a separate freeze document.

### 10.2 BLOCKER — Exit criteria not demonstrated

**Issue ID:** P5-018
**Severity:** BLOCKER
**Section:** §10 (Exit criteria)
**What Phase 5 says:** Lists 6 exit criteria
**What source says:** None of the 6 criteria are demonstrated in the document:
1. "every required requirement ID has a source and owner" — NO TABLE
2. "every DB write has a NestJS/system owner" — NO MAPPING
3. "every async event has an existing contract and consumer or an explicit phased-gap record" — NO INVENTORY
4. "security/RLS/ownership and negative behavior are documented" — PARTIAL (§3 rules exist but not verified against SQL)
5. "the blockers above are resolved or explicitly assigned to Phase 6" — §9 lists 7 items but does not assign owners
6. "an independent agent verifies this document against Phase 1–4" — THIS REPORT is the independent verification, and it finds gaps
**Why it matters:** The exit criteria are the gate for freeze. If they are not met, the document cannot be `FINAL REQUIREMENTS FROZEN`.
**Recommended correction:** Demonstrate each criterion with evidence before claiming freeze readiness

---

## 11. Required corrections

| # | Issue ID | Severity | Correction |
|---|---|---|---|
| 1 | P5-001 | BLOCKER | Add full requirement-ID coverage table (ID, status, source, owner, verified) |
| 2 | P5-006 | BLOCKER | Correct RLS claim: authenticated SELECT grants exist for 30+ tables; document UserContextClient/SystemClient assignment per use-case |
| 3 | P5-013 | BLOCKER | Change error envelope from "approved" to "under review"; note blocking issues from Stage 3 DTO review |
| 4 | P5-017 | BLOCKER | Either expand to meet exit criteria or rename status to "DRAFT SUMMARY" |
| 5 | P5-018 | BLOCKER | Demonstrate each exit criterion with evidence |
| 6 | P5-003 | HIGH | Add saved candidates to current scope (REQUIRED/FROZEN per Decision-04) |
| 7 | P5-010 | HIGH | Add async event inventory table (7 registered + 6+ phased gaps) |
| 8 | P5-011 | HIGH | Document `application.submitted` as current-scope requirement with phased routing |
| 9 | P5-002 | HIGH | Map domain areas to requirement IDs |
| 10 | P5-007 | MEDIUM | Document that `uploaded_documents`/parsing tables have no authenticated RLS read |
| 11 | P5-008 | MEDIUM | Add UI stage derivation table from DB enums |
| 12 | P5-009 | MEDIUM | Note application status transitions require API catalog approval |
| 13 | P5-012 | MEDIUM | Reference GAP-015 specifically for `notification.email.requested` |
| 14 | P5-014 | MEDIUM | Note 10-resume enforcement timing is still open |
| 15 | P5-004 | MEDIUM | Clarify messaging/notification scope boundary |
| 16 | P5-005 | MEDIUM | Track GAP-005 (referral reward programs) as current-scope gap |
| 17 | P5-016 | LOW | Reference Decision-02 for detailed transport mapping |

---

## 12. Phase 6 blockers

Phase 6 (API Catalog) requires these items to be resolved or explicitly documented:

| # | Blocker | Source | Status |
|---|---|---|---|
| 1 | Requirement-ID coverage table | P5-001 | NOT MET |
| 2 | RLS/UserContextClient/SystemClient assignment per use-case | P5-006 | NOT MET |
| 3 | Error envelope contract | P5-013 | OPEN (Stage 3 DTO review) |
| 4 | Async event inventory | P5-010 | NOT MET |
| 5 | Application status transition graph | P5-009 | NOT FROZEN |
| 6 | Saved candidates API surface | P5-003 | NOT DOCUMENTED |
| 7 | Numeric rate-limit values | §9 item 4 | OPEN |
| 8 | Idempotency key retention mechanism | §9 item 2 | OPEN |
| 9 | Parsed-data/confirm field allowlist | §9 item 3 | OPEN |
| 10 | Guest token/header transport | §9 item 5 | OPEN |

---

## 13. Coding authorization status

```text
CODING NOT AUTHORIZED

Reasons:
1. Phase 5 exit criteria not met (P5-018)
2. Requirement coverage not demonstrated (P5-001)
3. RLS/security model incorrectly stated (P5-006)
4. Error envelope not frozen (P5-013)
5. Phase 6 API catalog not built (PLAN §14)
6. Phase 7 architecture not designed (PLAN §14)
7. Phase 8 implementation plan not created (PLAN §14)
```

Per PLAN §14 (:466-492), coding requires ALL of: Phase 0–5 approved, Phase 6 API catalog, Phase 7 architecture, Phase 8 implementation plan, independent review. Currently only Phase 0–4 drafts exist and Phase 5 is a draft summary.

---

## 14. Final verdict

```text
Agent review:              COMPLETE
Document quality:          GOOD as a scope summary; POOR as a freeze candidate
Accuracy of claims:        MIXED — some correct (frozen rules), some incorrect (RLS, envelope)
Exit criteria:             NOT MET (0/6 demonstrated)
Freeze readiness:          NOT READY
Coding authorization:      NOT AUTHORIZED
Status claim accuracy:     INACCURATE — "FREEZE CANDIDATE" should be "DRAFT SUMMARY"
Next action:               Either expand Phase 5 to meet exit criteria, or create a
                           separate Phase 5-FINAL document with full traceability tables
```

### Honest status for the document:

```text
DRAFT SUMMARY — SCOPE/RULES DOCUMENTED — FREEZE CRITERIA NOT MET — CODING NOT AUTHORIZED
```
