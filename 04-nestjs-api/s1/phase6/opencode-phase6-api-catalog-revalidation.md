# Phase 06 — API Catalog Revalidation

Status: `REVALIDATION COMPLETE`

Reviewer: opencode
Audit target: `04-nestjs-api/PHASE-06-API-CATALOG.md` (857 lines)
Date: 2026-08-26

---

## Source documents read and cross-checked

| Source | Lines |
|---|---|
| PHASE-06-API-CATALOG.md | 857 |
| PHASE-05-FINAL-REQUIREMENTS.md | 266 |
| PHASE-01-REQUIREMENTS-CONSOLIDATION.md | 228 |
| PHASE-03-GAP-CONFLICT-ANALYSIS.md | 259 |
| PHASE-04-STATE-MACHINES-AND-TRANSACTIONS.md | 239 |
| PHASE-06-REMAINING-DECISIONS.md | 70 |
| DECISION-01 (Controlled Hybrid) | 178 |
| DECISION-02 (Realtime Transport) | 87 |
| DECISION-03 (application.submitted) | 46 |
| DECISION-04 (Saved Candidates) | 67 |
| DECISION-05 (First Resume Active Default) | 37 |
| DECISION-06 (API Error Vocabulary) | 31 |
| STAGE-03 Remaining Decisions | 275 |
| SQL 02_enums.sql | 583 |
| SQL 06_documents.sql | 162 |
| SQL 07_resume_processing.sql | 162 |
| SQL 09_applications.sql | 259+ |
| SQL 17_rls.sql | 250 |
| event-route.registry.ts | 107 |
| FastAPI task_handlers.py | 1074 |
| FastAPI exceptions.py | 235 |

---

## Verification Point 1: First profile resume default (Decision-05)

**Decision-05 frozen rule:** First profile-resume upload is automatically active; UI control checked/disabled for first upload; later uploads require explicit candidate choice; server independently enforces the invariant.

**Catalog evidence (API-RESUME-001, lines 39-41):**
```
Default: per `DECISION-05-FIRST-RESUME-ACTIVE-DEFAULT-HINGLISH.md`, the first profile resume is
automatically active and the UI control is checked/disabled; later uploads require explicit
candidate choice. The server independently enforces the first-upload invariant.
```

**Acceptance criteria match:**
- Decision-05 AC-1: "First eligible profile resume upload cannot be stored as non-active" — server invariant enforced ✓
- Decision-05 AC-2: "Later upload may remain non-active until explicitly selected" — explicit choice ✓
- Decision-05 AC-3: "Application-only upload never changes canonical profile/search projection" — correctly scoped out ✓
- Decision-05 AC-4: "Cross-user selection and client-forged role/status are rejected" — ownership from JWT ✓

**Verdict: PASS**

---

## Verification Point 2: Error codes match Decision-06

**Decision-06 approved public codes:**

| Code | HTTP | Approved |
|---|---|---|
| VALIDATION_ERROR | 400 | YES |
| UNAUTHORIZED | 401 | YES |
| FORBIDDEN | 403 | YES |
| NOT_FOUND | 404 | YES |
| GUEST_SESSION_INVALID | 403 | YES |
| RESUME_LIMIT_REACHED | 409 | YES |
| SCAN_PENDING | 409 | YES |
| SCAN_FAILED | 409 | YES |
| INFECTED_FILE | 422 | YES |
| PARSING_PENDING | 409 | YES |
| PARSING_FAILED | 422 | YES |
| STALE_REVISION | 409 | YES |
| IDEMPOTENCY_CONFLICT | 409 | YES |
| DEPENDENCY_UNAVAILABLE | 503 | YES |
| RATE_LIMITED | 429 | YES |
| INTERNAL_ERROR | 500 | YES |
| **CONFLICT** | — | **NOT APPROVED** |
| **EXPIRED** | — | **NOT APPROVED** |
| **CURSOR_INVALID** | — | **NOT APPROVED** |

Decision-06 §1 (lines 26–28): "`CONFLICT`, `EXPIRED` और `CURSOR_INVALID` को नया public code बनाकर use नहीं किया जाएगा।"

Decision-06 §1 (line 30): "Progress states error नहीं हैं: status APIs deterministic `stage` return करेंगी।"

**Catalog error list audit — ALL API entries:**

| API entry | Error codes used | Decision-06 violation |
|---|---|---|
| API-RESUME-001 (line 49) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, RESUME_LIMIT_REACHED, DEPENDENCY_UNAVAILABLE, IDEMPOTENCY_CONFLICT, RATE_LIMITED | NONE — all approved ✓ |
| API-RESUME-002 (line 71) | UNAUTHORIZED, NOT_FOUND, RATE_LIMITED, DEPENDENCY_UNAVAILABLE | NONE ✓ |
| API-RESUME-003 (line 92) | UNAUTHORIZED, NOT_FOUND, PARSING_FAILED, INFECTED_FILE, SCAN_FAILED, RATE_LIMITED, DEPENDENCY_UNAVAILABLE, INTERNAL_ERROR | NONE — SCAN_FAILED is newly approved ✓ |
| API-RESUME-004 (line 116) | UNAUTHORIZED, NOT_FOUND, FORBIDDEN, SCAN_PENDING, INFECTED_FILE, PARSING_PENDING, PARSING_FAILED, STALE_REVISION, IDEMPOTENCY_CONFLICT, RATE_LIMITED, DEPENDENCY_UNAVAILABLE, INTERNAL_ERROR | NONE ✓ |
| API-PLATFORM-001 (line 163) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, **CONFLICT**, RATE_LIMITED, DEPENDENCY_UNAVAILABLE, INTERNAL_ERROR | **CONFLICT — NOT APPROVED** |
| API-ONBOARDING-001 (line 183) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, **CONFLICT**, DEPENDENCY_UNAVAILABLE | **CONFLICT — NOT APPROVED** |
| API-AUTH-001 (line 206) | VALIDATION_ERROR, UNAUTHORIZED, **CONFLICT**/duplicate identity, RATE_LIMITED, INTERNAL_ERROR | **CONFLICT — NOT APPROVED** |
| API-AUTH-002 (line 226) | UNAUTHORIZED, FORBIDDEN, NOT_FOUND, RATE_LIMITED, INTERNAL_ERROR | NONE ✓ |
| API-AUTH-003 (line 246) | UNAUTHORIZED, FORBIDDEN, NOT_FOUND | NONE ✓ |
| API-COMPANY-001 (line 268) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, **CONFLICT**, RATE_LIMITED | **CONFLICT — NOT APPROVED** |
| API-COMPANY-002 (line 288) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, **CONFLICT**, RATE_LIMITED | **CONFLICT — NOT APPROVED** |
| API-COMPANY-003 (line 308) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, **CONFLICT**, RATE_LIMITED | **CONFLICT — NOT APPROVED** |
| API-CANDIDATE-001 (line 331) | UNAUTHORIZED, NOT_FOUND, RATE_LIMITED, DEPENDENCY_UNAVAILABLE | NONE ✓ |
| API-CANDIDATE-002 (line 352) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, STALE_REVISION, IDEMPOTENCY_CONFLICT, RATE_LIMITED, DEPENDENCY_UNAVAILABLE, INTERNAL_ERROR | NONE ✓ |
| API-CANDIDATE-003 (line 374) | UNAUTHORIZED, NOT_FOUND, FORBIDDEN, STALE_REVISION, IDEMPOTENCY_CONFLICT, RATE_LIMITED | NONE ✓ |
| API-JOB-001 (line 397) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, **CONFLICT**, RATE_LIMITED, DEPENDENCY_UNAVAILABLE, INTERNAL_ERROR | **CONFLICT — NOT APPROVED** |
| API-SEARCH-001 (line 419) | VALIDATION_ERROR, UNAUTHORIZED where required, RATE_LIMITED, DEPENDENCY_UNAVAILABLE | NONE ✓ |
| API-SEARCH-002 (line 439) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, RATE_LIMITED, DEPENDENCY_UNAVAILABLE | NONE ✓ |
| API-APPLICATION-001 (line 463) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, **CONFLICT**, IDEMPOTENCY_CONFLICT, RATE_LIMITED, INTERNAL_ERROR | **CONFLICT — NOT APPROVED** |
| API-APPLICATION-002 (line 485) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, **CONFLICT**, RATE_LIMITED, INTERNAL_ERROR | **CONFLICT — NOT APPROVED** |
| API-SAVED-CANDIDATE-001 (line 505) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, **CONFLICT**, RATE_LIMITED | **CONFLICT — NOT APPROVED** |
| API-APPLICATION-003 (line 525) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, **CONFLICT**, **EXPIRED**, RATE_LIMITED, INTERNAL_ERROR | **CONFLICT + EXPIRED — NOT APPROVED** |
| API-REFERRAL-001 (line 548) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, **CONFLICT**, RATE_LIMITED, INTERNAL_ERROR | **CONFLICT — NOT APPROVED** |
| API-REFERRAL-002 (line 568) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, **CONFLICT**, **EXPIRED**, RATE_LIMITED | **CONFLICT + EXPIRED — NOT APPROVED** |
| API-REFERRAL-003 (line 588) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, **CONFLICT**, RATE_LIMITED, INTERNAL_ERROR | **CONFLICT — NOT APPROVED** |
| API-INTERVIEW-001 (line 611) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, **CONFLICT**, NOT_FOUND, RATE_LIMITED | **CONFLICT — NOT APPROVED** |
| API-MESSAGE-001 (line 635) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, **CONFLICT**, RATE_LIMITED | **CONFLICT — NOT APPROVED** |
| API-REALTIME-001 (line 655) | UNAUTHORIZED, FORBIDDEN, **CURSOR_INVALID**, RATE_LIMITED, DEPENDENCY_UNAVAILABLE | **CURSOR_INVALID — NOT APPROVED** |
| API-NOTIFY-001 (line 677) | UNAUTHORIZED, FORBIDDEN, NOT_FOUND, RATE_LIMITED | NONE ✓ |
| API-NOTIFY-002 (line 696) | no error list (TBD) | NONE ✓ |
| API-NOTIFY-003 (line 715) | no error list (TBD) | NONE ✓ |
| API-ANALYTICS-001 (line 735) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, RATE_LIMITED, INTERNAL_ERROR | NONE ✓ |
| API-FEEDBACK-001 (line 755) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, **CONFLICT**, RATE_LIMITED | **CONFLICT — NOT APPROVED** |
| API-AI-001 (line 775) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, **CONFLICT**, RATE_LIMITED, DEPENDENCY_UNAVAILABLE | **CONFLICT — NOT APPROVED** |
| API-SUBSCRIPTION-001 (line 787) | TBD | NONE ✓ |

**Total violations:**
- `CONFLICT` used in 18 API entries
- `EXPIRED` used in 2 API entries
- `CURSOR_INVALID` used in 1 API entry

This is a systematic violation of Decision-06. The catalog §1 (lines 24–26) correctly documents the rule, but §3A–§3H entries do not comply.

**BLOCKER-01**: 18 API entries use `CONFLICT` which Decision-06 explicitly prohibits as a public code. The approved alternatives are: map to STALE_REVISION (for optimistic concurrency), NOT_FOUND (for resource state), or return to Phase 7 as explicit change request if accurate mapping is not possible.

**BLOCKER-02**: 2 API entries use `EXPIRED` which Decision-06 explicitly prohibits. Guest session expiry and referral invitation expiry must map to an approved code (likely GUEST_SESSION_INVALID or NOT_FOUND for session expiry; NOT_FOUND for expired invitation).

**BLOCKER-03**: 1 API entry uses `CURSOR_INVALID` which Decision-06 explicitly prohibits. SSE recovery cursor errors must map to an approved code.

---

## Verification Point 3: Parsed-data allowlist and progress-stage/error distinction

**Progress states as error check:**

Decision-06 §1 (line 30): "Progress states error नहीं हैं: status APIs deterministic `stage` return करेंगी।"

- API-RESUME-003 (status read): error list includes `SCAN_FAILED` and `PARSING_FAILED` only — NOT progress states. `SCAN_PENDING` and `PARSING_PENDING` are correctly absent ✓
- API-RESUME-004 (confirm): includes `SCAN_PENDING` and `PARSING_PENDING` — these are valid for confirm because confirm cannot proceed until scan/parsing is done; this is a pre-condition error, not progress-as-error ✓

**Parsed-data allowlist:**

- API-RESUME-003 response (lines 85–86): "allowlisted `normalized_output`, `confidence_details`, `validation_result`, `overall_confidence`, `schema_version`, parsing identifiers and `partial`; unknown fields are rejected"
- Open detail (line 97): "field-by-field normalized allowlist remains API-catalog blocker"
- The response field list is specified; the field-by-field allowlist within `normalized_output` is correctly deferred ✓

**Verdict: PASS** — progress states correctly handled; allowlist correctly deferred

---

## Verification Point 4: Upload does not create resume_parsing_jobs before clean scan

**Catalog claim (API-RESUME-001, lines 45-47):**
```
Writes: private storage, uploaded_documents
Transaction: metadata row + security.scan.requested outbox event in one commit
Outbox: security.scan.requested
Consumer: dispatcher → security-scan-queue → FastAPI security worker
```

**SQL evidence (06_documents.sql:84):** `security_scan_status security_scan_status NOT NULL DEFAULT 'pending'` — upload sets pending.

**FastAPI security scan handler (task_handlers.py:154-176):** Only AFTER scan is clean does the security worker create `resume_parsing_jobs` row and emit `resume.parse.requested`:
```python
if status == "clean":
    parsing = await session.execute(
        text("INSERT INTO resume_parsing_jobs ... ON CONFLICT (idempotency_key) DO NOTHING ..."),
        ...
    )
    if parsing_row:
        await OutboxRepository(db_manager).emit_event(
            event_type="resume.parse.requested", ...
        )
```

**Chain:** NestJS upload → `uploaded_documents` (pending) + `security.scan.requested` outbox → dispatcher → FastAPI security scan → if clean → `resume_parsing_jobs` + `resume.parse.requested` outbox → dispatcher → FastAPI resume parse

No parsing job is created before the security scan transition to clean. ✓

**Verdict: PASS**

---

## Verification Point 5: Referral actor is any eligible active authenticated user

**Catalog claim (API-REFERRAL-001, lines 536-538):**
```
Actor: any eligible active authenticated user
Permission: referral policy eligibility; company/job context scopes the referral, but a separate
recruiter/referrer role or company-membership gate is not assumed
```

**Phase 1 §8 (REQ-REFERRAL-001, line 121):** "Referral capability hai, separate recruiter/referrer role nahi; any eligible active authenticated user policy pass karke refer kar sakta hai"

**SQL (09_applications.sql:245):** `referrer_user_id UUID NOT NULL REFERENCES users(id)` — no role check at DB level

**RLS (17_rls.sql:213):** `saved_candidates_own_read` and referral policies use `referrer_user_id=auth.uid()` — owner-scoped read only

**No invented HR-only gate.** The catalog correctly reflects the requirement. ✓

**Verdict: PASS**

---

## Verification Point 6: application.submitted v1 atomic and fail-closed

**Catalog claim (API-APPLICATION-001, lines 457-459):**
```
Outbox/consumer: emit approved `application.submitted` v1 in the same transaction;
                 dispatcher has no current route, so it remains fail-closed/expected phased gap
```

**Decision-03 frozen rule:**
- Same-transaction: job_applications + application_profile_snapshots + history + outbox event COMMIT atomically ✓
- No dispatcher route: "notification worker/queue/endpoint contract abhi approved nahi hai, isliye application.submitted ka dispatcher route abhi register nahi hoga" ✓
- Fail-closed: "Unrouted event behavior fail-closed aur observable rahega" ✓
- No match routing: "application.submitted ko match endpoint par route nahi karna" ✓

**Contract (application-submitted.v1.json):** approved and exists ✓

**Verdict: PASS**

---

## Verification Point 7: REQ-NOTIFY-002/003, saved-jobs, subscription, G-1, TBD boundaries

**REQ-NOTIFY-002 (email delivery):**
- API-NOTIFY-002 (lines 681-698): "NOT IMPLEMENTATION-AUTHORIZED in current notification phase"
- Status: "REQUIRED in final product scope, but implementation deferred until contract/provider/template decisions close" ✓
- `notification.email.requested` route: correctly tracked as phased gap ✓

**REQ-NOTIFY-003 (email templates):**
- API-NOTIFY-003 (lines 700-717): "NOT IMPLEMENTATION-AUTHORIZED in current notification phase"
- Status: "REQUIRED + GAP-006; deferred until template schema, API and contract are approved" ✓

**saved_jobs:**
- DEC-06-05 (PHASE-06-REMAINING-DECISIONS line 52-55): "`saved_jobs` table मौजूद है, लेकिन current frozen requirement ledger में इसका dedicated `REQ-ID` नहीं है। Upstream requirement ownership तय होने तक नया API entry invent नहीं किया जाएगा।"
- Catalog §5 (line 815): "saved_jobs CRUD has no REQ-ID yet and must be resolved upstream" ✓

**Subscription:**
- API-SUBSCRIPTION-001 (lines 779-789): "NOT IMPLEMENTATION-AUTHORIZED"
- Status: "NEEDS_CLARIFICATION / GAP; owner and provider decision required" ✓

**Gate G-1:**
- Catalog §6 (lines 834-835): "Gate G-1 remains open until the producer envelope is reconciled with the outbox/dispatcher envelope before producer implementation is frozen."
- DEC-06-03 (PHASE-06-REMAINING-DECISIONS lines 41-44): "outbox_events envelope, producer event contracts और dispatcher task envelope को implementation से पहले एक approved mapping में reconcile करना है" ✓

**All TBD boundaries tracked honestly.** ✓

**Verdict: PASS**

---

## Verification Point 8: All 15-field API entries grounded in evidence

Each API entry contains 15 fields per exit criteria (§7 lines 839-855): API/Requirement ID, HTTP method/path, Actor/permission, Request DTO/validation, Response DTO, Tables/functions, Transaction boundary, Outbox/event/consumer, Idempotency, Rate limit, Audit/security, Error codes, Acceptance tests.

Spot-check verification of tables/functions against SQL:

| API | Claimed tables | SQL source verified |
|---|---|---|
| API-RESUME-001 | users, candidate_profiles, uploaded_documents | 06_documents.sql:72-106 ✓ |
| API-RESUME-002 | uploaded_documents, resume_parsing_jobs | 06_documents.sql, 07_resume_processing.sql ✓ |
| API-RESUME-003 | resume_parsing_jobs, resume_parsed_data | 07_resume_processing.sql:39-100 ✓ |
| API-RESUME-004 | uploaded_documents, resume_parsing_jobs, resume_parsed_data, candidate_profiles | Multiple SQL files ✓ |
| API-APPLICATION-001 | job_applications, application_documents, application_profile_snapshots | 09_applications.sql:130-164 ✓ |
| API-SAVED-CANDIDATE-001 | saved_candidates, company membership | 09_applications.sql:228-238, 04_companies.sql ✓ |
| API-APPLICATION-002 | job_applications, application_status_history | 09_applications.sql ✓ |
| API-REFERRAL-001 | referral_batches, referral_invitations | 09_applications.sql:242+ ✓ |
| API-INTERVIEW-001 | interviews, interview_schedule_blocks, interview_participants | 10_interviews.sql ✓ |

Access model (Decision-01) correctly applied:
- Document/parsing reads: SystemClient + ownership checks ✓
- Business writes: SystemClient + NestJS authorization ✓
- Personal catalog reads: UserContextClient + RLS where approved ✓

**Verdict: PASS**

---

## ISSUE LOG

| Issue ID | Severity | Section | Evidence | Impact | Recommended correction | Blocks freeze |
|---|---|---|---|---|---|---|
| REV-01 | **BLOCKER** | §3A–§3H (18 entries) | `CONFLICT` used in 18 API entries; Decision-06 line 26 explicitly prohibits this as a public code | Catalog does not comply with approved error vocabulary; implementation would create unapproved public error codes | Replace each `CONFLICT` with approved alternative: STALE_REVISION (for optimistic concurrency), NOT_FOUND (for resource state), or explicitly request new code via Phase 7 change request | YES |
| REV-02 | **BLOCKER** | §3E (2 entries) | `EXPIRED` used in API-APPLICATION-003 and API-REFERRAL-002; Decision-06 line 26 explicitly prohibits this | Guest session expiry and referral expiry not mapped to approved vocabulary | Replace with GUEST_SESSION_INVALID (for session expiry), NOT_FOUND (for expired resources), or Phase 7 change request | YES |
| REV-03 | **BLOCKER** | §3G (1 entry) | `CURSOR_INVALID` used in API-REALTIME-001 line 655; Decision-06 line 26 explicitly prohibits this | SSE recovery cursor error code not in approved vocabulary | Replace with NOT_FOUND or VALIDATION_ERROR; or Phase 7 change request | YES |
| REV-04 | MINOR | §3A line 163 | API-PLATFORM-001 uses `CONFLICT` in its error list | Cross-cutting platform entry references unapproved code | Same correction as REV-01 | YES |
| REV-05 | MINOR | §5 line 816 | `REQ-RESUME-007` noted as NEEDS_CLARIFICATION/GAP-004 | Fast-track name extraction still open | Correctly tracked; no action needed for catalog | NO |

---

## Summary of verification points

| # | Point | Verdict |
|---|---|---|
| 1 | First profile resume default (Decision-05) | PASS |
| 2 | Error codes match Decision-06 | **FAIL — 3 BLOCKERs (21 entries total)** |
| 3 | Parsed-data allowlist and progress/error distinction | PASS |
| 4 | Upload does not create parsing jobs before clean scan | PASS |
| 5 | Referral actor is any eligible active authenticated user | PASS |
| 6 | application.submitted v1 atomic and fail-closed | PASS |
| 7 | REQ-NOTIFY/saved-jobs/subscription/G-1/TBD boundaries | PASS |
| 8 | All 15-field API entries grounded in evidence | PASS |

---

## FINAL VERDICT

### **CONDITIONAL PASS**

The Phase 06 API Catalog is structurally comprehensive (857 lines, all 15 fields per API entry, all domains catalogued). Decision-05 (first resume default), Decision-03 (application.submitted atomic/fail-closed), Decision-04 (saved candidates), and all access-model/transaction/outbox/idempotency/security patterns are correctly reflected.

However, **21 API entries** across §3A–§3H use error codes that Decision-06 explicitly prohibits as public codes:

- `CONFLICT` in 18 entries (API-PLATFORM-001, API-ONBOARDING-001, API-AUTH-001, API-COMPANY-001..003, API-JOB-001, API-APPLICATION-001..003, API-SAVED-CANDIDATE-001, API-REFERRAL-001..003, API-INTERVIEW-001, API-MESSAGE-001, API-FEEDBACK-001, API-AI-001)
- `EXPIRED` in 2 entries (API-APPLICATION-003, API-REFERRAL-002)
- `CURSOR_INVALID` in 1 entry (API-REALTIME-001)

Decision-06 §1 requires: these codes must be mapped to approved alternatives or returned to Phase 7 as explicit change requests. The catalog §1 correctly documents this rule but §3A–§3H entries do not comply.

### Required before API CATALOG FROZEN:

1. **REV-01**: Replace `CONFLICT` in all 18 entries with approved alternatives (STALE_REVISION, NOT_FOUND, GUEST_SESSION_INVALID) or mark as Phase 7 change request
2. **REV-02**: Replace `EXPIRED` in 2 entries with approved alternatives or Phase 7 change request
3. **REV-03**: Replace `CURSOR_INVALID` in 1 entry with approved alternative or Phase 7 change request

### What is NOT blocked:

- Resume APIs (API-RESUME-001..004) error lists are fully compliant with Decision-06 ✓
- Decision-05 first-upload invariant correctly enforced ✓
- Progress states correctly handled (not error on status endpoints) ✓
- Parsed-data allowlist correctly deferred ✓
- Upload → scan → parse chain correct ✓
- application.submitted v1 atomic and fail-closed ✓
- All deferred items honestly tracked ✓
- No invented routes, tables, events, or behaviors found ✓
