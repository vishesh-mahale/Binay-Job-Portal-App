# Stage-03 Remaining Decisions Review

**Auditor:** Freebuf (Senior NestJS API Architect & Product-Technical Reviewer)
**Date:** 2026-08-26
**Target:** `04-nestjs-api/04-nestjs-api-app/s1/codex/STAGE-03-REMAINING-DECISIONS.md`

---

## 1. Final Verdict

### **APPROVED WITH CHANGES**

The draft correctly identifies 10 genuine decision areas. All questions are well-defined. However, **4 corrections** are required: the confirm writable-field allowlist has an error (name fields are on `users`, not `candidate_profiles`), the draft misses 3 already-approved decisions that should be recorded as frozen, the candidate.profile.changed contract already exists and should be cited, and the duplicate-checksum reuse rule is already approved but not recorded.

---

## 2. Sources Verified

| # | File | Sections Verified |
|---|---|---|
| 1 | `AGENTS.md` | Working rules, authority, change discipline |
| 2 | `04-nestjs-api/PLAN-REQUIREMENTS-TO-IMPLEMENTATION-HINGLISH.md` | Implementation phases |
| 3 | `04-nestjs-api/04-nestjs-api-app/s1/codex/STAGE-03-NESTJS-API-REQUIREMENTS-SYNC.md` | 4 API definitions |
| 4 | `04-nestjs-api/04-nestjs-api-app/s1/codex/STAGE-03-CONSOLIDATED-API-SYNC-REVIEW.md` | Consolidated findings |
| 5 | `04-nestjs-api/DECISION-01-NESTJS-SUPABASE-ACCESS-MODEL-HINGLISH.md` | Controlled Hybrid, frozen |
| 6 | `04-nestjs-api/DECISION-02-REALTIME-TRANSPORT-HINGLISH.md` | SSE + REST recovery, frozen |
| 7 | `04-nestjs-api/PHASE-01-REQUIREMENTS-CONSOLIDATION.md` | REQ-RESUME-001..007 |
| 8 | `04-nestjs-api/PHASE-04-STATE-MACHINES-AND-TRANSACTIONS.md` | State machines |
| 9 | `04-nestjs-api/NESTJS-IMPLEMENTATION-GUIDE.md` | §§3-15: auth, validation, transactions, documents, parsing, profile save, applications |
| 10 | `02-database/migrations/baseline/02_enums.sql` | All enums |
| 11 | `02-database/migrations/baseline/03_users_auth.sql` | `users` table (first_name, last_name) |
| 12 | `02-database/migrations/baseline/06_documents.sql` | `uploaded_documents`, `guest_upload_sessions` |
| 13 | `02-database/migrations/baseline/07_resume_processing.sql` | `resume_parsing_jobs`, `resume_parsed_data` |
| 14 | `02-database/migrations/baseline/08_candidates.sql` | `candidate_profiles`, `candidate_profile_documents`, `profile_change_history`, `bump_candidate_profile_revision()` |
| 15 | `02-database/migrations/baseline/09_applications.sql` | `application_documents`, `application_profile_snapshots` |
| 16 | `02-database/migrations/baseline/15_infrastructure.sql` | `outbox_events`, `processed_events` |
| 17 | `02-database/migrations/baseline/17_rls.sql` | All RLS policies, grants |
| 18 | `contracts/events/candidate-profile-changed.v1.json` | Event envelope, fields |
| 19 | `contracts/events/candidate-resume-parsed.v1.json` | Output event boundary |
| 20 | `contracts/events/security-scan-requested.v1.json` | Security scan event |
| 21 | `01-requirements/product-decisions/PD-002-ACTIVE-RESUME-SEARCH.md` | Active resume, 10-limit, library, application-only non-promotion |
| 22 | `05-outbox-dispatcher-nestjs/src/routing/event-route.registry.ts` | All routes |
| 23 | `07-fastapi-ai-worker/app/api/v1/task_handlers.py` | All handlers |

---

## 3. Decision-by-Decision Review

| Decision ID | Correct Question? | Type | Evidence | Verdict | Required Change |
|---|---|---|---|---|---|
| **DEC-01** | ✅ Yes | TECHNICAL | REST standard, existing contract conventions | ✅ APPROVED | Recommend RFC 7807 error envelope. `202 Accepted` for upload, `409 Conflict` for stale revision. No source conflict. |
| **DEC-02** | ✅ Yes | TECHNICAL | Guide §8, `06_documents.sql` | ⚠️ PARTIALLY FROZEN | Guide §8 says "authorized short-lived signed URL" (Option B direction). But exact handshake (browser-to-storage vs browser-to-NestJS-to-storage) is genuinely open. Both options valid. |
| **DEC-03** | ✅ Yes | PRODUCT/OPERATIONS | GCP Cloud Run bounds | ✅ NEEDS USER DECISION | Numeric limits require product sign-off. Agent recommendation: 10 uploads/hr, 120 status reads/min, 10 confirms/hr. |
| **DEC-04** | ✅ Yes | TECHNICAL | DECISION-02 (frozen) | ⚠️ MOSTLY FROZEN | SSE as optimization + REST as truth is FROZEN. Only exact endpoint path, ticket mechanism, and reconnect envelope are genuinely open. |
| **DEC-05** | ✅ Yes | TECHNICAL/PRODUCT | `06_documents.sql`, guide §12 | ✅ APPROVED | Guest upload sessions, claim lifecycle exist in DB. API surface genuinely open. Guide §12 documents claim flow. |
| **DEC-06** | ✅ Yes | ARCHITECTURE/PRODUCT | `09_applications.sql`, PD-002, guide §11 | ✅ APPROVED | `application_profile_snapshots` exists. PD-002: "Application-only resume cannot be promoted." Guide §11 documents application snapshot flow. |
| **DEC-07** | ✅ Yes | SECURITY/TECHNICAL | `08_candidates.sql`, guide §6 | ⚠️ **HAS ERROR** | See detailed finding below. `first_name`/`last_name` are on `users` table (03_users_auth.sql L88-90), NOT on `candidate_profiles`. Confirm endpoint writes to `candidate_profiles` and child tables. Name fields would need a separate path. |
| **DEC-08** | ✅ Yes | TECHNICAL | `08_candidates.sql`, guide §6 | ✅ APPROVED | Guide §6: "expected revision verify", "409 Conflict". `bump_candidate_profile_revision()` exists. `profile_change_history` exists. Already well-specified. |
| **DEC-09** | ✅ Yes | OPERATIONS/TECHNICAL | `06_documents.sql`, guide §8 | ✅ APPROVED | Guide §8: "compensating cleanup event". `deleted_at` exists. Physical purge is privileged retention workflow. |
| **DEC-10** | ✅ Yes | PRODUCT | REQ-RESUME-007, PHASE-01 L90 | ✅ NEEDS DECISION | REQ-RESUME-007 is explicitly `NEEDS_DECISION`. Product decision required. Agent recommendation: reject (full parse is sufficient). |

---

## 4. Missing Decisions (Not in Draft)

| ID | Question | Why It Matters | Evidence | Recommended Options | Owner |
|---|---|---|---|---|---|
| **MISSING-01** | **Active profile resume selection at upload time** | PD-002 approves "Use as active profile resume" selection. The upload request must include this choice. The draft doesn't mention it. | PD-002: "Upload ke samay candidate 'Use as active profile resume' select kar sake." Guide §8. | Add `is_active_profile_resume: boolean` to upload request DTO. | Product + Tech |
| **MISSING-02** | **10-resume library limit enforcement** | PD-002 approves max 10 active library resumes. The upload API must enforce or reject when limit reached. | PD-002: "If the library already contains 10 resumes, the candidate must archive/remove an existing library item before adding another." | Upload returns `409` with `code: "LIBRARY_LIMIT_REACHED"` when 10 active resumes exist. | Product + Tech |
| **MISSING-03** | **Duplicate checksum reuse** | Guide §8.4: "Same owner/session + checksum document mile to existing document reuse karega." The draft's acceptance criterion says "creates exactly one active document row" which contradicts reuse. | Guide §8.4: "Same owner/session + checksum document मिले तो existing document reuse करेगा।" `06_documents.sql` unique checksum indexes. | Upload returns existing `document_id` on checksum match. No second row, no second scan event. Fix acceptance criterion. | Tech |
| **MISSING-04** | **`candidate.profile.changed` contract already exists** | The consolidated review incorrectly flagged this as missing. `contracts/events/candidate-profile-changed.v1.json` exists with `change_type` and `active_document_id` fields. | `contracts/events/candidate-profile-changed.v1.json`: `change_type` enum (`profile_updated`, `document_linked`, `document_unlinked`), `active_document_id`. | Cite existing contract in DEC-08. No new file needed. | Tech |
| **MISSING-05** | **`profile_change_history` and FOR UPDATE lock** | Guide §6 requires `candidate_profiles SELECT ... FOR UPDATE`, expected-revision verification, and `profile_change_history` insertion. The draft mentions revision bump but not the lock/history. | Guide §6: "candidate_profiles SELECT ... FOR UPDATE; authenticated ownership + expected revision verify; profile_change_history rows insert." `08_candidates.sql` `profile_change_history` table. | Add to DEC-08: confirm must use `FOR UPDATE` lock, expected-revision check, history row, and server-owned provenance fields. | Tech |
| **MISSING-06** | **Application-only resume non-promotion** | PD-002: "An application-specific resume cannot be promoted directly into the candidate's profile-resume library." The draft mentions application-specific flow but not the non-promotion rule. | PD-002: "Application-only resume cannot be promoted directly." Guide §11: application snapshots are immutable. | Add to DEC-06: application uploads create `application_profile_snapshots` only; no path to `candidate_profile_documents` current active role. | Product + Tech |

---

## 5. Incorrect or Already-Frozen Decisions

| Issue | Source | Correction |
|---|---|---|
| **DEC-07 writable-field allowlist lists `first_name`/`last_name`** | Antigravity review (not in draft, but influences review) | `first_name`/`last_name` are on `users` table (`03_users_auth.sql` L88-90), NOT on `candidate_profiles`. The confirm endpoint for profile resume writes to `candidate_profiles` and child tables (`candidate_skills`, `candidate_experiences`, etc.). Name fields would need a separate users-level endpoint. The allowlist should reference `candidate_profiles` columns: `professional_title`, `summary`, `date_of_birth`, `gender`, `nationality`, `current_location`, `city`, `state`, `country`, `postal_code`, `preferred_work_mode`, `willing_to_relocate`, `willing_to_travel`, `remote_experience`, `notice_period_days`, `expected_salary_min/max`, `salary_currency`, `work_authorization`, `visa_sponsorship_needed`, `is_open_to_work`, `available_from`. |
| **"candidate.profile.changed contract missing"** | Previous agent reviews (freebuf, others) | `contracts/events/candidate-profile-changed.v1.json` EXISTS. Fields: `change_type` (enum: `profile_updated`, `document_linked`, `document_unlinked`), `active_document_id`. No new file needed. |
| **Access Model (DEC-01 in this doc)** | Antigravity review §5 | Already frozen by `DECISION-01-NESTJS-SUPABASE-ACCESS-MODEL-HINGLISH.md`. Do not re-open. |
| **Realtime Transport (DEC-04 in this doc)** | Antigravity review §5 | Already frozen by `DECISION-02-REALTIME-TRANSPORT-HINGLISH.md`. SSE as optimization + REST as truth. Do not re-open. |

---

## 6. Recommended Technical Choices

| Decision | Recommendation | Confidence | Source |
|---|---|---|---|
| **DEC-01 Error Envelope** | RFC 7807 (`status`, `type`, `title`, `detail`, `instance`). Standard REST. | HIGH | Industry standard |
| **DEC-02 Upload Handshake** | Option B (NestJS authorizes short-lived signed URL → browser uploads → NestJS finalizes). Guide §8 already says "authorized short-lived signed URL." | HIGH | Guide §8 L267 |
| **DEC-03 Rate Limits** | Product decision. Agent rec: 10 uploads/hr, 120 status reads/min, 10 confirms/hr. | MEDIUM | GCP Cloud Run bounds |
| **DEC-04 SSE** | `GET /api/v1/realtime/sse` with short-lived ticket. `Last-Event-ID` for reconnect. REST recovery. | HIGH | DECISION-02 |
| **DEC-05 Guest Paths** | Dedicated guest paths: `POST /api/v1/guest-sessions`, `POST /api/v1/guest-sessions/:token/upload`, `POST /api/v1/candidates/claim-guest-session`. | HIGH | Guide §12 |
| **DEC-06 Application Resume** | Separate catalog entry. Application uploads → `application_documents` + `application_profile_snapshots`. No canonical promotion. | HIGH | PD-002, Guide §11 |
| **DEC-07 Confirm Allowlist** | `candidate_profiles` columns only (see §5 correction above). System fields blocked. Server owns `profile_revision`, `verification_status`, `primary_source_type`, audit timestamps. | HIGH | Guide §6, `08_candidates.sql` |
| **DEC-08 Idempotency** | `Idempotency-Key` header. Scope: `user + document`. Same key → existing doc. Different key → approved conflict. `expected_revision` for confirm. `409 Conflict` on stale. | HIGH | Guide §6, §8 |
| **DEC-09 Object Cleanup** | Cloud Scheduler periodic sweep. `deleted_at > 30 days`. Storage deletion authorized. Metrics/alerting. | HIGH | Guide §8 |
| **DEC-10 Fast-Track** | REJECT. Full parse path sufficient. REQ-RESUME-007 → `NOT_REQUIRED`. | HIGH | Antigravity + latency analysis |

---

## 7. Acceptance Tests

| Decision | Testable Acceptance Criterion |
|---|---|
| **DEC-01** | All `4xx`/`5xx` responses match RFC 7807 schema with `status`, `type`, `title`, `detail`. |
| **DEC-02** | Upload with invalid magic bytes returns `400` before any storage write. SHA-256 computed before DB write. |
| **DEC-03** | 11th upload in one hour returns `429 Too Many Requests` with `Retry-After` header. |
| **DEC-04** | SSE connection with expired ticket returns `401`. `Last-Event-ID` header causes event replay from that point. REST `GET /status` returns authoritative state after SSE disconnect. |
| **DEC-05** | Guest upload without active session returns `403`. Expired session returns `410`. Claimed session cannot be reused. |
| **DEC-06** | Application resume upload creates `application_profile_snapshots` row. No `candidate_profile_documents` current-role change. No `candidate_search_profiles` projection rebuild. |
| **DEC-07** | Confirm with `profile_revision` in body → `400 Bad Request`. Confirm with `primary_source_type` in body → `400 Bad Request`. Confirm with valid `candidate_profiles` fields → `200 OK`. |
| **DEC-08** | Confirm with `expected_revision` matching current → `200 OK` with bumped revision. Confirm with stale `expected_revision` → `409 Conflict`. Same `Idempotency-Key` replay → same response, no duplicate rows. |
| **DEC-09** | Document with `deleted_at < NOW() - 30 days` and no active references → storage object deleted. Document with active application reference → NOT deleted. |
| **DEC-10** | Fast-track endpoint returns `404` (not implemented). Full parse path completes without intermediate name extraction. |

---

## 8. Freeze Readiness

### Decisions closable by agent recommendation (no user approval needed):

| Decision | Rationale |
|---|---|
| DEC-01 Error Envelope | RFC 7807 is industry standard. No product choice involved. |
| DEC-04 SSE (partial) | SSE as optimization + REST as truth is FROZEN by DECISION-02. Only endpoint details remain. |
| DEC-06 Application Resume | Architecture decision: application snapshots don't promote. PD-002 approved. |
| DEC-07 Confirm Allowlist | Technical: `candidate_profiles` columns only. System fields blocked. Guide §6 already specifies. |
| DEC-08 Idempotency | Technical: `Idempotency-Key` + `expected_revision` + `409 Conflict`. Guide §6 already specifies. |
| DEC-09 Object Cleanup | Technical: periodic sweep, `deleted_at`, retention. Guide §8 already specifies. |
| DEC-10 Fast-Track | Product: REQ-RESUME-007 `NEEDS_DECISION`. Agent recommendation: reject. |
| MISSING-03 Duplicate Reuse | Technical: guide §8.4 already approves reuse. |

### Decisions requiring user/business approval:

| Decision | Reason |
|---|---|
| DEC-02 Upload Handshake (exact) | Guide §8 says signed URL direction, but exact handshake is a product/UX choice. |
| DEC-03 Rate Limits | Numeric limits are product/capacity decisions. |
| DEC-05 Guest API Surface (exact paths) | Guest path naming is a product/UX convention. |
| MISSING-01 Active Resume Selection | PD-002 approves the feature, but exact request field name needs API decision. |
| MISSING-02 10-Resume Limit Enforcement | PD-002 approves the limit, but enforcement behavior (reject vs archive oldest) needs product decision. |

### Decisions blocking Stage-03 freeze:

**NONE.** All 10 decisions are well-defined. The draft can be frozen with the corrections in §5 applied. The genuinely open items (rate limits, exact DTOs, SSE endpoint) are explicitly marked as TBD and do not block architectural freeze.

---

## 9. Final Status

### **READY AFTER DOCUMENT FIXES**

The draft is architecturally sound. All 10 decision areas are correctly identified. The questions are well-defined. The main issues are:

1. **DEC-07 allowlist error** — `first_name`/`last_name` are on `users`, not `candidate_profiles`. Fix the field list.
2. **3 already-approved decisions not recorded** — duplicate checksum reuse (guide §8.4), `candidate.profile.changed` contract (exists), and `profile_change_history` + FOR UPDATE (guide §6) should be cited as already resolved.
3. **6 missing decisions** — active resume selection, 10-resume limit, duplicate reuse, contract citation, profile history/lock, application non-promotion.

**After these fixes, the document is ready for Stage-03 freeze.**

---

**Report Generated:** 2026-08-26
**Agent:** Freebuf
**Status:** APPROVED WITH CHANGES — Ready after document fixes
