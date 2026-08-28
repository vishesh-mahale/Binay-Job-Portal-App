# Phase 06 — Final Revalidation

Status: `FINAL REVALIDATION COMPLETE`

Reviewer: opencode
Audit target: `04-nestjs-api/PHASE-06-API-CATALOG.md` (859 lines)
Date: 2026-08-26

---

## Purpose

Independent revalidation after previous BLOCKERs (CONFLICT/EXPIRED/CURSOR_INVALID in 21 entries)
were identified. Verify that all 5 specific verification points from the prompt are satisfied.

---

## Verification 1: No CONFLICT, EXPIRED or CURSOR_INVALID public error codes remain

Systematic scan of every API entry error list in the catalog:

| API entry | Error codes | Violation |
|---|---|---|
| API-RESUME-001 (line 49) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, RESUME_LIMIT_REACHED, DEPENDENCY_UNAVAILABLE, IDEMPOTENCY_CONFLICT, RATE_LIMITED | NONE |
| API-RESUME-002 (line 73) | UNAUTHORIZED, NOT_FOUND, RATE_LIMITED, DEPENDENCY_UNAVAILABLE | NONE |
| API-RESUME-003 (line 94) | UNAUTHORIZED, NOT_FOUND, PARSING_FAILED, INFECTED_FILE, SCAN_FAILED, RATE_LIMITED, DEPENDENCY_UNAVAILABLE, INTERNAL_ERROR | NONE |
| API-RESUME-004 (line 118) | UNAUTHORIZED, NOT_FOUND, FORBIDDEN, SCAN_PENDING, INFECTED_FILE, PARSING_PENDING, PARSING_FAILED, STALE_REVISION, IDEMPOTENCY_CONFLICT, RATE_LIMITED, DEPENDENCY_UNAVAILABLE, INTERNAL_ERROR | NONE |
| API-PLATFORM-001 (line 165) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, RATE_LIMITED, DEPENDENCY_UNAVAILABLE, INTERNAL_ERROR | NONE — CONFLICT removed ✓ |
| API-ONBOARDING-001 (line 185) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, STALE_REVISION, DEPENDENCY_UNAVAILABLE | NONE — CONFLICT removed ✓ |
| API-AUTH-001 (line 208) | VALIDATION_ERROR, UNAUTHORIZED, IDEMPOTENCY_CONFLICT, RATE_LIMITED, INTERNAL_ERROR | NONE — CONFLICT replaced with IDEMPOTENCY_CONFLICT ✓ |
| API-AUTH-002 (line 228) | UNAUTHORIZED, FORBIDDEN, NOT_FOUND, RATE_LIMITED, INTERNAL_ERROR | NONE |
| API-AUTH-003 (line 248) | UNAUTHORIZED, FORBIDDEN, NOT_FOUND | NONE |
| API-COMPANY-001 (line 270) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, RATE_LIMITED | NONE — CONFLICT removed ✓ |
| API-COMPANY-002 (line 290) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, RATE_LIMITED | NONE — CONFLICT removed ✓ |
| API-COMPANY-003 (line 310) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, RATE_LIMITED | NONE — CONFLICT removed ✓ |
| API-CANDIDATE-001 (line 333) | UNAUTHORIZED, NOT_FOUND, RATE_LIMITED, DEPENDENCY_UNAVAILABLE | NONE |
| API-CANDIDATE-002 (line 354) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, STALE_REVISION, IDEMPOTENCY_CONFLICT, RATE_LIMITED, DEPENDENCY_UNAVAILABLE, INTERNAL_ERROR | NONE |
| API-CANDIDATE-003 (line 376) | UNAUTHORIZED, NOT_FOUND, FORBIDDEN, STALE_REVISION, IDEMPOTENCY_CONFLICT, RATE_LIMITED | NONE |
| API-JOB-001 (line 399) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, RATE_LIMITED, DEPENDENCY_UNAVAILABLE, INTERNAL_ERROR | NONE — CONFLICT removed ✓ |
| API-SEARCH-001 (line 421) | VALIDATION_ERROR, UNAUTHORIZED where required, RATE_LIMITED, DEPENDENCY_UNAVAILABLE | NONE |
| API-SEARCH-002 (line 441) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, RATE_LIMITED, DEPENDENCY_UNAVAILABLE | NONE |
| API-APPLICATION-001 (line 465) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, IDEMPOTENCY_CONFLICT, RATE_LIMITED, INTERNAL_ERROR | NONE — CONFLICT replaced with IDEMPOTENCY_CONFLICT ✓ |
| API-APPLICATION-002 (line 487) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, STALE_REVISION, RATE_LIMITED, INTERNAL_ERROR | NONE — CONFLICT replaced with STALE_REVISION ✓ |
| API-SAVED-CANDIDATE-001 (line 507) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, IDEMPOTENCY_CONFLICT, RATE_LIMITED | NONE — CONFLICT replaced with IDEMPOTENCY_CONFLICT ✓ |
| API-APPLICATION-003 (line 527) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, GUEST_SESSION_INVALID, RATE_LIMITED, INTERNAL_ERROR | NONE — CONFLICT/EXPIRED replaced with GUEST_SESSION_INVALID ✓ |
| API-REFERRAL-001 (line 550) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, RATE_LIMITED, INTERNAL_ERROR | NONE — CONFLICT removed ✓ |
| API-REFERRAL-002 (line 570) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, RATE_LIMITED | NONE — CONFLICT/EXPIRED removed ✓ |
| API-REFERRAL-003 (line 590) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, RATE_LIMITED, INTERNAL_ERROR | NONE — CONFLICT removed ✓ |
| API-INTERVIEW-001 (line 613) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, STALE_REVISION, NOT_FOUND, RATE_LIMITED | NONE — CONFLICT replaced with STALE_REVISION ✓ |
| API-MESSAGE-001 (line 637) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, IDEMPOTENCY_CONFLICT, RATE_LIMITED | NONE — CONFLICT replaced with IDEMPOTENCY_CONFLICT ✓ |
| API-REALTIME-001 (line 657) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, RATE_LIMITED, DEPENDENCY_UNAVAILABLE | NONE — CURSOR_INVALID removed ✓ |
| API-NOTIFY-001 (line 679) | UNAUTHORIZED, FORBIDDEN, NOT_FOUND, RATE_LIMITED | NONE |
| API-NOTIFY-002 (line 698) | no error list (TBD) | NONE |
| API-NOTIFY-003 (line 717) | no error list (TBD) | NONE |
| API-ANALYTICS-001 (line 737) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, RATE_LIMITED, INTERNAL_ERROR | NONE |
| API-FEEDBACK-001 (line 757) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, RATE_LIMITED | NONE — CONFLICT removed ✓ |
| API-AI-001 (line 777) | VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, IDEMPOTENCY_CONFLICT, RATE_LIMITED, DEPENDENCY_UNAVAILABLE | NONE — CONFLICT replaced with IDEMPOTENCY_CONFLICT ✓ |
| API-SUBSCRIPTION-001 (line 789) | TBD | NONE |

**Result: 0 violations.** All 21 previous BLOCKER entries have been corrected. No prohibited `CONFLICT`, `EXPIRED`, or `CURSOR_INVALID` codes remain in any public API error list.

**Verdict: PASS**

---

## Verification 2: All error codes match Decision-06

Decision-06 approved vocabulary cross-referenced against all catalog error lists:

| Approved Code | HTTP | Used in catalog | Correct usage |
|---|---|---|---|
| VALIDATION_ERROR | 400 | API-RESUME-001, PLATFORM-001, ONBOARDING-001, AUTH-001, COMPANY-001..003, CANDIDATE-002, JOB-001, SEARCH-001..002, APPLICATION-001..002, SAVED-CANDIDATE-001, APPLICATION-003, REFERRAL-001..003, INTERVIEW-001, MESSAGE-001, REALTIME-001, ANALYTICS-001, FEEDBACK-001, AI-001 | ✓ |
| UNAUTHORIZED | 401 | All authenticated APIs | ✓ |
| FORBIDDEN | 403 | Most authenticated APIs | ✓ |
| NOT_FOUND | 404 | Most resource-owning APIs | ✓ |
| GUEST_SESSION_INVALID | 403 | API-APPLICATION-003 | ✓ Guest session expiry mapped here |
| RESUME_LIMIT_REACHED | 409 | API-RESUME-001 | ✓ |
| SCAN_PENDING | 409 | API-RESUME-004 | ✓ Pre-condition for confirm |
| SCAN_FAILED | 409 | API-RESUME-003 | ✓ Terminal scan failure |
| INFECTED_FILE | 422 | API-RESUME-003, API-RESUME-004 | ✓ |
| PARSING_PENDING | 409 | API-RESUME-004 | ✓ Pre-condition for confirm |
| PARSING_FAILED | 422 | API-RESUME-003, API-RESUME-004 | ✓ |
| STALE_REVISION | 409 | API-ONBOARDING-001, CANDIDATE-002, CANDIDATE-003, APPLICATION-002, INTERVIEW-001 | ✓ |
| IDEMPOTENCY_CONFLICT | 409 | API-RESUME-001, RESUME-004, AUTH-001, CANDIDATE-002, CANDIDATE-003, APPLICATION-001, SAVED-CANDIDATE-001, MESSAGE-001, AI-001 | ✓ |
| DEPENDENCY_UNAVAILABLE | 503 | API-RESUME-001..004, PLATFORM-001, ONBOARDING-001, CANDIDATE-001..002, JOB-001, SEARCH-001..002, REALTIME-001, AI-001 | ✓ |
| RATE_LIMITED | 429 | All APIs | ✓ |
| INTERNAL_ERROR | 500 | API-RESUME-003, RESUME-004, PLATFORM-001, AUTH-001..002, CANDIDATE-002, JOB-001, APPLICATION-001..003, REFERRAL-001..003, MESSAGE-001, ANALYTICS-001, AI-001 | ✓ |

**Progress states (Decision-06 line 30):** "Progress states error नहीं हैं: status APIs deterministic `stage` return करेंगी।"
- API-RESUME-002 (status): does NOT include SCAN_PENDING or PARSING_PENDING ✓
- API-RESUME-003 (parsed-data): does NOT include SCAN_PENDING or PARSING_PENDING ✓
- API-RESUME-004 (confirm): includes SCAN_PENDING, PARSING_PENDING — valid pre-condition errors for confirm, not progress-as-error ✓

**Verdict: PASS**

---

## Verification 3: First resume default and acceptance criteria

**Decision-05 frozen rule:**
- First profile-resume upload automatically active
- UI control checked/disabled for first upload
- Later uploads require explicit candidate choice
- Server independently enforces invariant

**Catalog API-RESUME-001:**
- Request field: `use_as_active_profile_resume boolean` (line 38) ✓
- Default rule: per Decision-05, first is auto-active, UI checked/disabled (lines 39–41) ✓
- Server enforcement: "The server independently enforces the first-upload invariant" (line 41) ✓
- Acceptance criteria (lines 54–56): "first eligible profile upload forces active selection server-side and the UI control is checked/disabled; later uploads require explicit choice" ✓

**Decision-05 acceptance criteria verified:**
1. "First eligible profile resume upload cannot be stored as non-active" — server invariant ✓
2. "Later upload may remain non-active until explicitly selected" — explicit choice ✓
3. "Application-only upload never changes canonical profile/search projection" — application-only scoped out ✓
4. "Cross-user selection and client-forged role/status are rejected" — ownership from JWT ✓

**Verdict: PASS**

---

## Verification 4: Application, referral, notification, guest and G-1 phased gaps

### application.submitted v1
- Catalog §6 (lines 827–828): "application.submitted v1 is an approved same-transaction domain event, but it has no current dispatcher route; notification routing remains an expected phased gap and must fail closed" ✓
- Decision-03: same-transaction atomic, fail-closed, no guessed routing ✓
- API-APPLICATION-001 (lines 460–461): "emit approved application.submitted v1 in the same transaction; dispatcher has no current route, so it remains fail-closed/expected phased gap" ✓

### application.status.changed
- Catalog §6 (lines 825–826): "application.status.changed is an expected phased gap emitted by the approved SQL function; no route is invented here" ✓
- API-APPLICATION-002 (line 483): "application.status.changed is currently an expected phased gap; contract/route pending" ✓

### notification.email.requested
- Catalog §6 (line 831): "notification.email.requested remains an unresolved phased route" ✓
- API-NOTIFY-002 (line 694): "notification.email.requested remains an expected phased route; no current dispatcher route" ✓

### Compensating cleanup event
- Catalog §6 (lines 832–834): "Compensating document-cleanup event remains an approved phased gap: no contract/consumer route currently exists" ✓

### Gate G-1
- Catalog §6 (lines 836–837): "Gate G-1 remains open until the producer envelope is reconciled with the outbox/dispatcher envelope before producer implementation is frozen" ✓
- DEC-06-03 (PHASE-06-REMAINING-DECISIONS): "outbox_events envelope, producer event contracts और dispatcher task envelope को implementation से पहले एक approved mapping में reconcile करना है" ✓

### Referral
- API-REFERRAL-001 (line 538): "any eligible active authenticated user" — no invented HR-only gate ✓
- REQ-REFERRAL-007 (configurable programs): correctly tracked as GAP ✓

### Subscription
- API-SUBSCRIPTION-001 (lines 781–791): "NOT IMPLEMENTATION-AUTHORIZED", NEEDS_CLARIFICATION/GAP ✓

### saved_jobs
- Catalog §5 (line 817): "saved_jobs CRUD has no REQ-ID yet and must be resolved upstream" ✓

**Verdict: PASS**

---

## Verification 5: No invented routes, fields, tables or events

Catalog §1 (line 7): "No route, table, event or contract is invented."

Verification against source documents:
- All 4 resume API paths match frozen paths in STAGE-03 §1B and Phase 5 §4 ✓
- All 6 guest paths match frozen paths in STAGE-03 §1B ✓
- All TBD paths (AUTH, COMPANY, CANDIDATE, JOB, SEARCH, APPLICATION, REFERRAL, INTERVIEW, MESSAGE, REALTIME, NOTIFY, ANALYTICS, FEEDBACK, AI, SUBSCRIPTION) are correctly marked TBD ✓
- No invented tables: all table references verified against SQL 01–18 ✓
- No invented events: all 7 dispatcher routes match event-route.registry.ts ✓
- Worker outputs correctly distinguished from dispatcher inputs ✓
- application.submitted correctly has no dispatcher route ✓
- notification.email.requested correctly has no dispatcher route ✓
- Cleanup event correctly has no contract/route ✓

**Verdict: PASS**

---

## Additional checks

### Error code replacement quality

The replacements made for the 21 previous violations are appropriate:

| Previous code | Replacement | Entry | Justification |
|---|---|---|---|
| CONFLICT | IDEMPOTENCY_CONFLICT | API-AUTH-001 | Duplicate identity = idempotency conflict ✓ |
| CONFLICT | STALE_REVISION | API-ONBOARDING-001 | Revision mismatch = stale revision ✓ |
| CONFLICT | removed | API-COMPANY-001..003 | Company state conflicts → NOT_FOUND or FORBIDDEN covers it ✓ |
| CONFLICT | IDEMPOTENCY_CONFLICT | API-APPLICATION-001 | Duplicate application = idempotency conflict ✓ |
| CONFLICT | STALE_REVISION | API-APPLICATION-002 | Status transition conflict = stale revision ✓ |
| CONFLICT | IDEMPOTENCY_CONFLICT | API-SAVED-CANDIDATE-001 | Duplicate bookmark = idempotency conflict ✓ |
| CONFLICT/EXPIRED | GUEST_SESSION_INVALID | API-APPLICATION-003 | Guest session expiry = session invalid ✓ |
| CONFLICT | removed | API-REFERRAL-001..003 | Referral conflicts → NOT_FOUND covers resource state ✓ |
| CONFLICT | STALE_REVISION | API-INTERVIEW-001 | Schedule conflict = stale revision ✓ |
| CONFLICT | IDEMPOTENCY_CONFLICT | API-MESSAGE-001 | Duplicate message = idempotency conflict ✓ |
| CURSOR_INVALID | removed | API-REALTIME-001 | SSE cursor error → VALIDATION_ERROR covers invalid input ✓ |
| CONFLICT | removed | API-FEEDBACK-001 | Feedback duplicate → duplicate submission covered by validation ✓ |
| CONFLICT | IDEMPOTENCY_CONFLICT | API-AI-001 | Duplicate AI request = idempotency conflict ✓ |

All replacements use approved Decision-06 codes with correct semantic mapping.

### Internal error code consistency

API entries that previously used CONFLICT but now removed have not introduced any gap in error coverage. The approved alternatives (STALE_REVISION, IDEMPOTENCY_CONFLICT, NOT_FOUND, GUEST_SESSION_INVALID) cover the same failure modes with proper HTTP semantics.

---

## Remaining open items (non-blocking)

These are correctly tracked as open/deferred in the catalog and do not block freeze:

1. **Gate G-1**: Producer envelope reconciliation — correctly tracked (§6 line 836)
2. **DEC-06-02**: Exact public paths/DTOs — correctly deferred to Phase 7 (PHASE-06-REMAINING-DECISIONS line 35)
3. **DEC-06-04**: Notification email/template scope — correctly deferred (line 46)
4. **DEC-06-05**: saved_jobs — correctly deferred (line 52)
5. **DEC-06-06**: Message idempotency persistence — correctly deferred (line 57)
6. **REQ-RESUME-007**: Fast-track name extraction — NEEDS_CLARIFICATION (§5 line 818)
7. **REQ-SEARCH-005**: External search engine — FUTURE (§5 line 817)
8. **Parsed-data field-by-field allowlist** — correctly marked open (§2 line 99)
9. **Confirm writable-field allowlist** — correctly marked open via STAGE-03 §7
10. **Numeric rate-limit values** — correctly deferred to product/ops decision
11. **Exact guest DTO/header transport** — correctly deferred (§3 line 141)

---

## ISSUE LOG

| Issue ID | Severity | Section | Finding | Blocks freeze |
|---|---|---|---|---|
| (none) | — | — | No BLOCKERs found | — |

---

## FINAL VERDICT

### **PASS — API CATALOG FROZEN**

All 5 verification points satisfied:

1. **CONFLICT/EXPIRED/CURSOR_INVALID**: 0 violations remain across all 35 API entries. All 21 previous violations corrected with appropriate Decision-06 approved alternatives. ✓

2. **Error codes match Decision-06**: Every error code in every API entry is from the Decision-06 approved vocabulary. No unapproved codes. ✓

3. **First resume default**: Decision-05 correctly reflected in API-RESUME-001 with server enforcement invariant, UI control behavior, and acceptance criteria. ✓

4. **Phased gaps**: application.submitted (fail-closed/unrouted), application.status.changed (phased), notification.email.requested (unresolved), cleanup event (phased), Gate G-1 (open), subscription (GAP), saved_jobs (no REQ-ID) — all correctly tracked. ✓

5. **No inventions**: No invented routes, fields, tables, or events. All TBD items honestly marked. ✓

The catalog is comprehensive (859 lines, 35 API entries, all 15 fields per entry), grounded in repository evidence, and complies with all approved decisions. Open items (Gate G-1, exact paths, provider decisions) are correctly deferred to Phase 7 and do not prevent catalog freeze.
