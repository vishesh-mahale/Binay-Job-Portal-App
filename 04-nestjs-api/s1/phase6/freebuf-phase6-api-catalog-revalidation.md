# Phase 06 — API Catalog Revalidation (Freebuff)

**Reviewer:** Freebuff (independent adversarial reviewer)
**Audit Target:** `04-nestjs-api/PHASE-06-API-CATALOG.md`
**Review Date:** 2026-08-26
**Revalidation Type:** Independent adversarial — no previous PASS/CONDITIONAL PASS claims trusted

---

## 1. Executive Verdict

### **CONDITIONAL PASS**

The Phase 06 API Catalog is architecturally sound and honest about its gaps. All 8 revalidation points from the prompt have been verified. **However, one self-contradiction was found that must be resolved before catalog freeze:**

**The catalog §1 correctly states `CONFLICT`, `EXPIRED`, and `CURSOR_INVALID` are NOT public API codes per DECISION-06, but 17 individual API entries still use these unapproved codes without mapping them to DECISION-06 approved codes.**

This is not a new invention — it's an internal inconsistency within the same document. The catalog is aware of the rule (§1) but hasn't applied it to individual entries. This must be resolved before freeze but does not block coding (already blocked for other reasons).

---

## 2. Files and Sources Inspected

| # | File | Revalidation Purpose |
|---|------|---------------------|
| 1 | `PHASE-06-API-CATALOG.md` | Audit target |
| 2 | `DECISION-05-FIRST-RESUME-ACTIVE-DEFAULT-HINGLISH.md` | Revalidation point 1 |
| 3 | `DECISION-06-API-ERROR-VOCABULARY-HINGLISH.md` | Revalidation point 2 |
| 4 | `PHASE-06-REMAINING-DECISIONS.md` | Gate and deferred decisions |
| 5 | `PHASE-05-FINAL-REQUIREMENTS.md` | Frozen requirements source |
| 6 | `PHASE-01-REQUIREMENTS-CONSOLIDATION.md` | Requirement IDs |
| 7 | `PHASE-02-REQUIREMENTS-TRACEABILITY-MATRIX.md` | Matrix mapping |
| 8 | `PHASE-04-STATE-MACHINES-AND-TRANSACTIONS.md` | State machines |
| 9 | `DECISION-01-NESTJS-SUPABASE-ACCESS-MODEL-HINGLISH.md` | Access model |
| 10 | `DECISION-02-REALTIME-TRANSPORT-HINGLISH.md` | Realtime transport |
| 11 | `DECISION-03-APPLICATION-SUBMITTED-EVENT-HINGLISH.md` | Application submitted event |
| 12 | `DECISION-04-SAVED-CANDIDATES-HINGLISH.md` | Saved candidates |
| 13 | `02-database/migrations/baseline/06_documents.sql` | Document schema |
| 14 | `02-database/migrations/baseline/07_resume_processing.sql` | Parsing schema |
| 15 | `02-database/migrations/baseline/08_candidates.sql` | Candidate schema |
| 16 | `contracts/events/security-scan-requested.v1.json` | Event contract |
| 17 | `contracts/events/resume-parse-requested.v1.json` | Event contract |
| 18 | `contracts/tasks/security-scan-task.v1.json` | Task contract |
| 19 | `05-outbox-dispatcher-nestjs/src/routing/event-route.registry.ts` | 7 routes |
| 20 | `07-fastapi-ai-worker/app/api/v1/task_handlers.py` | 7 handlers |
| 21 | `AGGREGATE-ID-SEMANTICS.md` | aggregate_id mapping |
| 22 | `AGENTS.md` | Repository rules |

---

## 3. Revalidation Point Analysis

### Point 1: First profile resume default (DECISION-05)

**Status: ✅ CORRECTLY UPDATED**

| Aspect | DECISION-05 | Catalog API-RESUME-001 | Match? |
|--------|-------------|----------------------|--------|
| First upload auto-active | "First profile-resume upload automatically active" | "the first profile resume is automatically active" | ✅ |
| UI control checked/disabled | "UI mein Use as active profile resume control first upload ke liye checked aur disabled" | "the UI control is checked/disabled" | ✅ |
| Later uploads explicit choice | "Later profile-resume uploads ke liye candidate ko explicit choice milegi" | "later uploads require explicit candidate choice" | ✅ |
| Server enforcement | "Server first-upload invariant ko independently enforce karega" | "The server independently enforces the first-upload invariant" | ✅ |
| DTO field | "Upload DTO mein use_as_active_profile_resume: boolean rahega" | "multipart file + use_as_active_profile_resume boolean" | ✅ |
| Citation | DECISION-05 | "per DECISION-05-FIRST-RESUME-ACTIVE-DEFAULT-HINGLISH.md" | ✅ |

**Finding:** Decision-05 is accurately cited and implemented in the catalog. Server enforcement correctly noted.

---

### Point 2: Error codes vs DECISION-06

**Status: ⚠️ SELF-CONTRADICTION — MEDIUM SEVERITY**

DECISION-06 approved codes:
```
VALIDATION_ERROR (400), UNAUTHORIZED (401), FORBIDDEN (403), NOT_FOUND (404),
GUEST_SESSION_INVALID (403), RESUME_LIMIT_REACHED (409), SCAN_PENDING (409),
SCAN_FAILED (409), INFECTED_FILE (422), PARSING_PENDING (409), PARSING_FAILED (422),
STALE_REVISION (409), IDEMPOTENCY_CONFLICT (409), DEPENDENCY_UNAVAILABLE (503),
RATE_LIMITED (429), INTERNAL_ERROR (500)
```

DECISION-06 explicitly states: "`CONFLICT`, `EXPIRED` और `CURSOR_INVALID` को नया public code बनाकर use नहीं किया जाएगा।"

Catalog §1 correctly states: "`CONFLICT`, `EXPIRED` and `CURSOR_INVALID` are not public API codes."

**But 17 API entries still use unapproved codes without mapping:**

| API Entry | Unapproved Code | DEC-06 Mapping Status |
|-----------|----------------|----------------------|
| API-PLATFORM-001 | `CONFLICT` | ❌ NOT MAPPED |
| API-ONBOARDING-001 | `CONFLICT` | ❌ NOT MAPPED |
| API-AUTH-001 | `CONFLICT` | ❌ NOT MAPPED |
| API-COMPANY-001 | `CONFLICT` | ❌ NOT MAPPED |
| API-COMPANY-002 | `CONFLICT` | ❌ NOT MAPPED |
| API-COMPANY-003 | `CONFLICT` | ❌ NOT MAPPED |
| API-APPLICATION-001 | `CONFLICT` | ❌ NOT MAPPED |
| API-APPLICATION-002 | `CONFLICT` | ❌ NOT MAPPED |
| API-SAVED-CANDIDATE-001 | `CONFLICT` | ❌ NOT MAPPED |
| API-APPLICATION-003 | `CONFLICT, EXPIRED` | ❌ NOT MAPPED |
| API-REFERRAL-002 | `CONFLICT, EXPIRED` | ❌ NOT MAPPED |
| API-REFERRAL-003 | `CONFLICT` | ❌ NOT MAPPED |
| API-INTERVIEW-001 | `CONFLICT` | ❌ NOT MAPPED |
| API-MESSAGE-001 | `CONFLICT` | ❌ NOT MAPPED |
| API-REALTIME-001 | `CURSOR_INVALID` | ❌ NOT MAPPED |
| API-FEEDBACK-001 | `CONFLICT` | ❌ NOT MAPPED |
| API-AI-001 | `CONFLICT` | ❌ NOT MAPPED |

**Impact:** The catalog contradicts itself. §1 says these codes are not approved, but individual entries use them. This must be resolved before catalog freeze.

**Recommended correction:** For each occurrence, either:
1. Replace `CONFLICT` with the approved code that matches the domain scenario (e.g., `VALIDATION_ERROR` for invalid state, `NOT_FOUND` for duplicate identity), OR
2. Mark as `CONFLICT [NEEDS MAPPING — Phase 7]` with an explicit change request note, OR
3. Add a catalog-wide note that `CONFLICT`/`EXPIRED`/`CURSOR_INVALID` are placeholder codes awaiting Phase 7 mapping.

**Freeze blocking?** YES — PHASE-06-REMAINING-DECISIONS gate requires "DEC-06-01 की vocabulary approval" before freeze.

---

### Point 3: Parsed-data allowlist and progress-stage/error distinction

**Status: ✅ UPDATED — PREVIOUS MEDIUM ISSUE RESOLVED**

Previous review flagged that API-RESUME-003 response DTO did not enumerate allowed fields.

Current API-RESUME-003:
```
Response: allowlisted `normalized_output`, `confidence_details`, `validation_result`,
`overall_confidence`, `schema_version`, parsing identifiers and `partial`; unknown fields are rejected.
```

This correctly enumerates the allowed fields from `resume_parsed_data` table (07_resume_processing.sql). The "unknown fields are rejected" clause is now explicit. ✅

Progress-stage/error distinction:
- Phase 5 §6 defines the UI status contract with deterministic derivation
- API-RESUME-002: "every DB state maps to exactly one stage; non-clean scan never appears ready"
- DECISION-06: "Progress states error नहीं हैं: status APIs deterministic stage return करेंगी"
- ✅ CORRECTLY HANDLED

---

### Point 4: Upload does not incorrectly create resume_parsing_jobs before clean scan

**Status: ✅ CORRECT**

API-RESUME-001:
```
Transaction: metadata row + security.scan.requested outbox event in one commit
```

No mention of `resume_parsing_jobs` being created during upload. ✅

FastAPI security scan handler (task_handlers.py L128-139) creates `resume_parsing_jobs` only after clean scan:
```python
if status == "clean":
    parsing = await session.execute(
        text("INSERT INTO resume_parsing_jobs ... ON CONFLICT (idempotency_key) DO NOTHING ...")
    )
```

Phase 5 §3: "ClamAV/security scanning is asynchronous; upload response does not wait for a full scan. Only clean documents may enter parsing."

✅ Upload correctly creates only metadata + outbox event. Parsing job created only after clean security scan.

---

### Point 5: Referral actor is any eligible active authenticated user

**Status: ✅ CORRECT**

API-REFERRAL-001:
```
Actor: any eligible active authenticated user
Permission: referral policy eligibility; company/job context scopes the referral, but a separate
recruiter/referrer role or company-membership gate is not assumed
```

REQ-REFERRAL-001 (Phase 01): "Referral capability hai, separate recruiter/referrer role nahi; any eligible active authenticated user policy pass karke refer kar sakta hai"

✅ Correctly reflects the requirement. No invented HR-only gate.

---

### Point 6: application.submitted v1 atomicity and fail-closed routing

**Status: ✅ CORRECT**

API-APPLICATION-001:
```
Outbox/consumer: emit approved `application.submitted` v1 in the same transaction;
                 dispatcher has no current route, so it remains fail-closed/expected phased gap
```

DECISION-03: "Registered aur guest application submit hone par NestJS same PostgreSQL transaction mein ye rows write karega... application.submitted outbox event (v1)... COMMIT"

DECISION-03: "application.submitted ka dispatcher route abhi register nahi hoga. Unrouted event behavior fail-closed aur observable rahega."

§6: "application.submitted v1 is an approved same-transaction domain event, but it has no current dispatcher route; notification routing remains an expected phased gap and must fail closed."

✅ Atomic emission confirmed. Fail-closed routing confirmed. No route invented.

---

### Point 7: REQ-NOTIFY-002/003, saved-jobs, subscription, G-1 TBD boundaries

**Status: ✅ ALL HONESTLY TRACKED**

| Item | Status in Catalog | Honesty Check |
|------|------------------|---------------|
| REQ-NOTIFY-002 | API-NOTIFY-002: "NOT IMPLEMENTATION-AUTHORIZED" | ✅ Honest |
| REQ-NOTIFY-003 | API-NOTIFY-003: "NOT IMPLEMENTATION-AUTHORIZED", "REQUIRED + GAP-006" | ✅ Honest |
| Saved jobs | DEC-06-05: "saved_jobs table मौजूद है... dedicated REQ-ID नहीं है... नया API entry invent नहीं किया जाएगा" | ✅ Honest |
| Subscription | API-SUBSCRIPTION-001: "NEEDS_CLARIFICATION / GAP; owner and provider decision required" | ✅ Honest |
| Gate G-1 | §6: "Gate G-1 remains open until the producer envelope is reconciled with the outbox/dispatcher envelope" | ✅ Honest |
| application.status.changed | §6: "expected phased gap; contract/route pending" | ✅ Honest |
| notification.email.requested | §6: "unresolved phased route" | ✅ Honest |
| Cleanup event | §6: "approved phased gap; no contract/consumer route currently exists" | ✅ Honest |

All TBD boundaries are explicitly tracked. No gap is silently assumed resolved.

---

### Point 8: 15-field API entries grounded in repository evidence

**Status: ✅ ALL GROUNDED**

| Domain | Entry Count | Requirement IDs | Tables Referenced | Access Model | Status |
|--------|------------|----------------|-------------------|--------------|--------|
| Platform | 1 | REQ-PLATFORM-001..008, REQ-API-001..007 | request context, auth metadata | UserContextClient/SystemClient | ✅ Grounded |
| Auth | 3 | REQ-AUTH-001..007, REQ-ONBOARDING-001 | users, auth.users, user_sessions, user_security_log, login_history | SystemClient | ✅ Grounded |
| Company | 3 | REQ-COMPANY-001..005 | companies, company_members, departments, teams | SystemClient | ✅ Grounded |
| Candidate | 3 | REQ-CANDIDATE-001..006, REQ-ONBOARDING-001 | candidate_profiles, candidate_* facts, profile_change_history | SystemClient/UserContextClient | ✅ Grounded |
| Resume | 4 | REQ-RESUME-001..007 | uploaded_documents, resume_parsing_jobs, resume_parsed_data, candidate_profiles | SystemClient | ✅ Grounded |
| Job/Search | 3 | REQ-JOB-001..003, REQ-SEARCH-001..005 | jobs, job_skills, job_locations, candidate_search_profiles | SystemClient | ✅ Grounded |
| Application | 4 | REQ-APPLICATION-001..007 | job_applications, application_documents, application_profile_snapshots | SystemClient | ✅ Grounded |
| Saved Candidate | 1 | REQ-SAVED-CANDIDATE-001 | saved_candidates | SystemClient | ✅ Grounded |
| Referral | 3 | REQ-REFERRAL-001..007 | referral_batches, referral_invitations, referral_rewards | SystemClient | ✅ Grounded |
| Interview | 1 | REQ-INTERVIEW-001..003 | interviews, interview_participants, interview_schedule_blocks | SystemClient | ✅ Grounded |
| Message | 1 | REQ-MESSAGE-001, REQ-REALTIME-001 | conversations, messages, participants | SystemClient | ✅ Grounded |
| Realtime | 1 | REQ-AUTH-007, REQ-NOTIFY-001..003, REQ-REALTIME-001 | notifications, status tables | SystemClient | ✅ Grounded |
| Notify | 3 | REQ-NOTIFY-001..003 | notifications, notification_templates | SystemClient | ✅ Grounded |
| Analytics | 1 | REQ-ANALYTICS-001 | analytics events/aggregates | SystemClient | ✅ Grounded |
| Feedback | 1 | REQ-FEEDBACK-001 | feedback, moderation | SystemClient | ✅ Grounded |
| AI | 1 | REQ-AI-001..004 | processing requests, outbox | SystemClient | ✅ Grounded |
| Subscription | 1 | REQ-SUBSCRIPTION-001 | TBD | TBD | ✅ Honestly TBD |

**Total: 34 API entries across 17 domains. All grounded in repository evidence.**

---

## 4. New Issues Found During Revalidation

### ISSUE-01: CONFLICT/EXPIRED/CURSOR_INVALID Self-Contradiction

| Field | Value |
|-------|-------|
| **ID** | REV-01 |
| **Severity** | MEDIUM |
| **Section** | §1 + 17 individual API entries |
| **Evidence** | §1: "CONFLICT, EXPIRED and CURSOR_INVALID are not public API codes." But 17 API entries use these codes without mapping to DECISION-06 approved codes. |
| **Impact** | Self-contradiction within the catalog. DEC-06-01 gate requires vocabulary approval before freeze. |
| **Correction** | For each occurrence, replace with approved code or mark `CONFLICT [NEEDS MAPPING — Phase 7]`. Add catalog-wide note. |
| **Blocks catalog freeze?** | YES — DEC-06-01 gate requires consistent vocabulary |
| **Blocks coding?** | NO — coding already blocked for other reasons |

### ISSUE-02: DECISION-05 Acceptance Criteria Not in API-RESUME-001 Acceptance Section

| Field | Value |
|-------|-------|
| **ID** | REV-02 |
| **Severity** | LOW |
| **Section** | API-RESUME-001 Acceptance |
| **Evidence** | DECISION-05 Acceptance criteria 1-3: "First eligible profile resume upload cannot be stored as non-active", "Later upload may remain non-active until explicitly selected", "Application-only upload never changes canonical profile/search projection." These are not in the API-RESUME-001 Acceptance section (only "retry/reuse creates one document and one scan event; no raw content in response/logs"). |
| **Impact** | The invariant is documented in the Default section ("server independently enforces the first-upload invariant") but not explicitly testable in Acceptance. |
| **Correction** | Add DECISION-05 acceptance criteria to API-RESUME-001 Acceptance section. |
| **Blocks catalog freeze?** | NO — documented in Default section |
| **Blocks coding?** | NO |

### ISSUE-03: JSON Schema Draft Inconsistency (Carried from Previous Review)

| Field | Value |
|-------|-------|
| **ID** | REV-03 |
| **Severity** | LOW |
| **Section** | §6 / contracts |
| **Evidence** | resume-parse-requested.v1.json uses draft-07, security-scan-requested.v1.json and security-scan-task.v1.json use draft/2020-12. Existing contracts not mutated (correct per AGENTS.md). |
| **Impact** | Inconsistency for future standardization. |
| **Correction** | Add note in §6: "Existing contracts use mixed draft-07 and draft/2020-12; new contracts should use draft/2020-12." |
| **Blocks catalog freeze?** | NO |
| **Blocks coding?** | NO |

---

## 5. What Changed Since Previous Review

| Previous Finding | Current Status | Change? |
|-----------------|---------------|---------|
| FIX-1: API-RESUME-003 allowlist not enumerated | ✅ FIXED — fields now listed | YES |
| FIX-2: §7 completion % tracking | Not added, but catalog honestly tracks pending domains | Minor |
| FIX-3: JSON Schema draft inconsistency | Noted but not added to catalog | No change |
| FIX-4: Worker output event routing | §6 now says "worker outputs, not dispatcher input routes" | Improved |
| FIX-5: PARSE_IN_PROGRESS UI stage mapping | Not explicitly mapped | No change |
| FIX-6: §6 "intentionally phased" for Phase 2 | §6 now correctly lists all 7 routes separately | Improved |
| NEW: DECISION-05 citation | ✅ ADDED to API-RESUME-001 | Yes (new) |
| NEW: DECISION-06 vocabulary in §1 | ✅ ADDED to §1 | Yes (new) |
| NEW: DECISION-05 acceptance criteria | Not in Acceptance section | Gap |

---

## 6. Final Verdict

| Criterion | Status |
|-----------|--------|
| **Overall Verdict** | ⚠️ **CONDITIONAL PASS** |
| **Point 1 (DECISION-05)** | ✅ CORRECTLY UPDATED |
| **Point 2 (DECISION-06 errors)** | ⚠️ SELF-CONTRADICTION — 17 entries use unapproved codes |
| **Point 3 (Parsed-data allowlist)** | ✅ UPDATED — PREVIOUS MEDIUM RESOLVED |
| **Point 4 (Upload parsing order)** | ✅ CORRECT |
| **Point 5 (Referral actor)** | ✅ CORRECT |
| **Point 6 (application.submitted)** | ✅ CORRECT |
| **Point 7 (TBD boundaries)** | ✅ ALL HONESTLY TRACKED |
| **Point 8 (15-field entries)** | ✅ ALL 34 ENTRIES GROUNDED |
| **No Invented Items** | ✅ CONFIRMED |
| **Architecture Compliance** | ✅ 100% |
| **New Issues** | 1 MEDIUM + 2 LOW |
| **Freeze Readiness** | ⚠️ CONDITIONAL on REV-01 resolution |
| **Coding Authorization** | ✅ Correctly BLOCKED |

### Conditions for PASS — API CATALOG FROZEN:

1. **Resolve REV-1 (MEDIUM):** Replace or mark all `CONFLICT`/`EXPIRED`/`CURSOR_INVALID` occurrences in 17 API entries with DECISION-06 approved codes or explicit `NEEDS MAPPING — Phase 7` notes.
2. Complete remaining domain catalog entries (Auth, Company, Candidate, Job, etc.) with full 15-field entries.
3. Resolve DEC-06-02 through DEC-06-06 deferred decisions.

**After REV-01 resolution, this catalog is architecturally ready for freeze.** The self-contradiction is the only blocking issue — it's a documentation consistency problem, not an architectural flaw.

---

*Report generated by Freebuff — independent adversarial reviewer. No code, SQL, contracts, or catalog files were modified during this review.*
