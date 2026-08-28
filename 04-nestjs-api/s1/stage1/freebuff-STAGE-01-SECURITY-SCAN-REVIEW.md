# Stage 1 Independent Review — FreeBuf

**Agent:** FreeBuf  
**Date:** 2026-08-25  
**Status:** APPROVED WITH CHANGES  

---

## 1. Verdict

**APPROVED WITH CHANGES**

Stage 1 architecture direction is **correct and production-aligned**. One critical implementation gap (missing security-scan handler) and 2 medium issues must be resolved before Stage 1 freeze.

---

## 2. Verified Correct Points

| # | Point | Repository Evidence | Result |
|---|---|---|---|
| 1 | `uploaded_documents` has `security_scan_status` column with enum `security_scan_status` | `06_documents.sql` L50: `security_scan_status security_scan_status NOT NULL DEFAULT 'pending'` | ✅ CORRECT |
| 2 | `security_scan_result` JSONB column exists for scan outcome storage | `06_documents.sql` L51: `security_scan_result JSONB` | ✅ CORRECT |
| 3 | Scan-queue index optimized for pending/failed scanning | `06_documents.sql` L96: `idx_uploaded_documents_scan_queue WHERE security_scan_status IN ('pending', 'failed')` | ✅ CORRECT |
| 4 | Owner XOR constraint — exactly one upload origin | `06_documents.sql` L59-63: `uploaded_document_owner_check CHECK` | ✅ CORRECT |
| 5 | `security-scan-requested.v1.json` contract exists | `contracts/events/security-scan-requested.v1.json` — complete with schema_version, event_id, aggregate_type, aggregate_id, event_type, payload, occurred_at | ✅ CORRECT |
| 6 | Dispatcher route for `security.scan.requested` registered | `event-route.registry.ts` L55-60: PHASE_2_ROUTES → `SECURITY_SCAN_QUEUE` → `/internal/tasks/security/scan` | ✅ CORRECT |
| 7 | Parser checks `security_scan_status` before processing | `task_handlers.py` L149-166: reads `security_scan_status`, raises 503 for pending/scanning, fails for infected/quarantined | ✅ CORRECT |
| 8 | AI prompt injection protection via `<untrusted_resume_content>` wrapping | `task_handlers.py` L175-178: system prompt + user input with XML tags | ✅ CORRECT |
| 9 | Parser verifies clean status from DB (not a second scan) | `task_handlers.py` L149-151: reads `security_scan_status` from `uploaded_documents` | ✅ CORRECT |
| 10 | Idempotency via `processed_events` table | `task_handlers.py` L87-90: `is_processed()` check before processing | ✅ CORRECT |
| 11 | Duplicate task claim via `FOR UPDATE` lock | `task_handlers.py` L92-95: `claim_job()` with worker_id | ✅ CORRECT |
| 12 | Parsed result requires candidate confirmation before canonical update | `task_handlers.py` L198-212: inserts `resume_parsed_data` + `candidate.resume.parsed` outbox event, NOT direct profile update | ✅ CORRECT |
| 13 | Application-specific resume uses isolated `application_profile_snapshots` | `07_resume_processing.sql` + `09_applications.sql` — separate snapshot table | ✅ CORRECT |
| 14 | Outbox → Dispatcher → Cloud Tasks flow defined | `05-outbox-dispatcher-nestjs/src/routing/event-route.registry.ts` — complete route mapping | ✅ CORRECT |
| 15 | Non-negotiable rules from Stage 1 decision match architecture | `SECURITY-SCAN-IMPLEMENTATION-STAGES-AND-VERIFICATION-PLAN.md` — all 7 rules verified | ✅ CORRECT |

---

## 3. Incorrect or Unsupported Claims

| # | Claim | Actual Evidence | Severity | Required Action |
|---|---|---|---|---|
| 1 | **FastAPI security-scan handler exists and is "DONE"** | `task_handlers.py` has NO `/internal/tasks/security/scan` endpoint. Only resume/parse, candidate/projection, job/enrich, match/analyze, interview/summary, job/screening-questions exist. | **HIGH** | Create `handle_security_scan_task` handler or explicitly mark as "NOT IMPLEMENTED" |
| 2 | **`security-scan-requested` route in dispatcher points to working handler** | `event-route.registry.ts` L57: `urlPath: '/internal/tasks/security/scan'` — but this endpoint does not exist in FastAPI | **HIGH** | Either implement handler or remove route until handler exists |
| 3 | **`resume-parse-requested.v1.json` uses draft-07** | `security-scan-requested.v1.json` uses `draft/2020-12`, while `resume-parse-requested.v1.json` uses `draft-07`. Schema draft inconsistency. | **LOW** | Standardize both contracts to same JSON Schema draft |

---

## 4. Missing Decisions or Gaps

### GAP-01: Security-Scan FastAPI Handler Missing

| Field | Detail |
|---|---|
| **Gap ID** | GAP-01 |
| **Source** | `07-fastapi-ai-worker/app/api/v1/task_handlers.py` — endpoint `/internal/tasks/security/scan` does not exist |
| **Problem** | Dispatcher routes `security.scan.requested` → `/internal/tasks/security/scan`, but FastAPI has no handler for this path. Cloud Tasks will deliver to a non-existent endpoint, resulting in HTTP 404/500 failures. |
| **Impact** | **HIGH** — Security scan pipeline is broken end-to-end. Upload works, outbox event is created, dispatcher claims and routes, but FastAPI cannot process. Documents stay in `pending` forever. Resume parsing blocked. |
| **Recommended Options** | A) Implement `handle_security_scan_task` in `task_handlers.py` with ClamAV provider interface<br>B) Remove `security.scan.requested` from dispatcher routes until handler exists |
| **Your Recommendation** | **Option A** — Implement the handler now. The architecture, schema, contracts, and dispatcher routing are all ready. Only the FastAPI handler body is missing. |
| **User Decision Required?** | YES — ClamAV deployment location (same Cloud Run, sidecar, or separate service) |

### GAP-02: ClamAV Deployment Location Undefined

| Field | Detail |
|---|---|
| **Gap ID** | GAP-02 |
| **Source** | `codex/STAGE-01-SECURITY-SCAN-DECISION.md` — "ClamAV deployment: same FastAPI runtime, sidecar, या separate internal service?" |
| **Problem** | Stage 1 decision document explicitly lists this as an open decision. No resolution found in repository. |
| **Impact** | **MEDIUM** — Affects operational complexity, resource allocation, and security boundary. |
| **Recommended Options** | A) Same Cloud Run instance with ClamAV binary (simplest, but increases memory)<br>B) Sidecar container (Kubernetes-style, not native to Cloud Run)<br>C) Separate Cloud Run service for scanning (cleanest boundary, but adds network hop)<br>D) GCP Cloud Anti-Virus API (managed, but vendor lock-in + cost) |
| **Your Recommendation** | **Option A for MVP** — ClamAV binary in same Cloud Run container. Cloud Run supports up to 8GB memory; ClamAV needs ~500MB-1GB. Provider abstraction allows switching later. |
| **User Decision Required?** | YES |

### GAP-03: Scanner Timeout/Retry Exhaustion Terminal Status

| Field | Detail |
|---|---|
| **Gap ID** | GAP-03 |
| **Source** | `codex/STAGE-01-SECURITY-SCAN-DECISION.md` — "Scanner timeout/retry exhaustion के बाद user-visible terminal status क्या होगा?" |
| **Problem** | Stage 1 decision lists this as open. Currently `uploaded_documents.security_scan_status` has values `pending`, `scanning`, `clean`, `infected`, `quarantined`, `failed`. If scanner exhausts retries, what status should be set? |
| **Impact** | **MEDIUM** — User sees stuck "scanning" state with no resolution. |
| **Recommended Options** | A) Set `security_scan_status = 'failed'` with `security_scan_result` containing error details<br>B) Add new enum value `'error'` for scanner-unavailable (distinct from infected) |
| **Your Recommendation** | **Option A** — Use existing `failed` status. `failed` means "scan could not complete" (distinct from `infected` which means "malware detected"). User sees "Scan failed — please re-upload." |
| **User Decision Required?** | YES |

### GAP-04: `security_scan_result` JSONB Shape Undefined

| Field | Detail |
|---|---|
| **Gap ID** | GAP-04 |
| **Source** | `codex/STAGE-01-SECURITY-SCAN-DECISION.md` — "`security_scan_result` का exact audit JSON shape क्या होगा?" |
| **Problem** | Column exists as JSONB but no contract or schema defines its shape. Different agents may write different structures. |
| **Impact** | **LOW** — Works functionally, but audit/monitoring queries will be fragile. |
| **Recommended Options** | A) Define `security-scan-result.v1.json` contract<br>B) Use inline documentation in SQL comment |
| **Your Recommendation** | **Option B for MVP** — SQL comment documenting expected shape: `{"scanner": "clamav", "version": "0.103.x", "result": "clean", "engine_version": "...", "scan_duration_ms": 123, "scanned_at": "2026-..."}` |
| **User Decision Required?** | NO — can proceed with documented convention |

### GAP-05: Dev/Pre-Prod Mock Scanner Policy

| Field | Detail |
|---|---|
| **Gap ID** | GAP-05 |
| **Source** | `codex/STAGE-01-SECURITY-SCAN-DECISION.md` — "Dev/pre-prod में mock और ClamAV का exact environment policy क्या होगा?" |
| **Problem** | No documented policy for when to use mock vs real scanner. |
| **Impact** | **LOW** — Development convenience vs security testing gap. |
| **Recommended Options** | A) `MOCK_SCANNER=true` env var in dev, `false` in staging/prod<br>B) Scanner provider abstraction auto-selects based on environment |
| **Your Recommendation** | **Option A** — Simple env var, same pattern as `MOCK_AI_PROVIDER` already used in FastAPI |
| **User Decision Required?** | NO |

---

## 5. Security Concerns

| # | Concern | Status | Detail |
|---|---|---|---|
| 1 | Browser never gets service credentials | ✅ SECURE | `06_documents.sql` stores `storage_bucket` + `storage_path` (private). `NESTJS-IMPLEMENTATION-GUIDE.md` §8 mandates signed URLs for browser access. |
| 2 | Private storage enforced | ✅ SECURE | `storage_bucket` + `storage_path` columns; no public URL pattern in schema. |
| 3 | OIDC/service-to-service auth | ✅ SECURE | `task_handlers.py` L73-80: OIDC validation on every handler when `OIDC_AUTH_ENABLED=true`. |
| 4 | PII/log redaction | ⚠️ PARTIAL | Logger uses structured logging but no explicit PII redaction middleware. Document file names and user IDs appear in logs. Recommendation: add PII scrubber for `original_file_name` in production logs. |
| 5 | Magic bytes validation before AI processing | ✅ SECURE | `task_handlers.py` L171-172: `extractor._validate_size()` + `_validate_magic_bytes()` before LLM call. |
| 6 | Checksum deduplication | ✅ SECURE | `06_documents.sql` L88-93: unique indexes on `(user_id, checksum)` and `(guest_session, checksum)` with `WHERE deleted_at IS NULL`. |
| 7 | Scanner outside DB transaction | ✅ CORRECT | Architecture requires scanner call outside open transaction. Currently N/A because handler doesn't exist yet — but design is correct. |

---

## 6. Contract/Queue/Worker Concerns

| # | Concern | Detail |
|---|---|---|
| 1 | **Dispatcher routes to non-existent endpoint** | `security-scan-queue` → `/internal/tasks/security/scan` → **404** in FastAPI. This will cause Cloud Tasks to retry exhaustively then dead-letter. |
| 2 | **Queue naming** | `SECURITY_SCAN_QUEUE = 'security-scan-queue'` — dedicated queue is correct design. Prevents scan latency from blocking AI-heavy tasks. |
| 3 | **`security-scan-requested.v1.json` references `contracts/events/` not `contracts/tasks/`** | The `taskContract` field in dispatcher points to event contract, not task payload contract. Other routes use `contracts/tasks/*.json`. This is inconsistent. |
| 4 | **Schema draft inconsistency** | `security-scan-requested.v1.json` uses `draft/2020-12`, `resume-parse-requested.v1.json` uses `draft-07`. Should standardize. |
| 5 | **resume-parse-requested missing `event_type` field** | `security-scan-requested.v1.json` has `event_type` as required. `resume-parse-requested.v1.json` does NOT have `event_type` as required or even present. This may cause envelope inconsistency. |

---

## 7. Required Corrections Before Stage 1 Freeze

| # | Correction | Priority | Owner |
|---|---|---|---|
| 1 | **Implement `handle_security_scan_task` in FastAPI** | **CRITICAL** | FastAPI team |
| 2 | **Add `security-scan-task.v1.json` contract** (separate from event contract) | **HIGH** | Contracts team |
| 3 | **Update dispatcher `taskContract` to point to task contract, not event contract** | **HIGH** | Dispatcher team |
| 4 | **Standardize JSON Schema draft** across all contracts | **LOW** | Contracts team |
| 5 | **Add `event_type` to `resume-parse-requested.v1.json`** | **LOW** | Contracts team |
| 6 | **Resolve ClamAV deployment location** | **MEDIUM** | Architecture decision |
| 7 | **Resolve scanner timeout terminal status** | **MEDIUM** | Architecture decision |

---

## 8. Final Recommendation

### Can Stage 1 Freeze?

**NOT YET** — One critical blocker:

```
❌ CRITICAL: FastAPI security-scan handler does not exist
   → Dispatcher will route to 404
   → Documents stuck in "pending" forever
   → Resume parsing permanently blocked
```

### What Must Be Resolved First?

1. **Implement `handle_security_scan_task`** in `07-fastapi-ai-worker/app/api/v1/task_handlers.py`
2. **Create `security-scan-task.v1.json`** contract (task payload, not event envelope)
3. **Update dispatcher route** to reference correct task contract

### Is It Safe to Proceed to Stage 2 Contracts?

**YES, conditionally** — Stage 2 (contract finalization) can run in parallel with handler implementation. The contracts themselves are independent of the handler code. But Stage 2 exit criterion should include "handler exists and responds to test payload."

### Architecture Assessment

The Stage 1 decision direction is **architecturally correct**:

| Component | Assessment |
|---|---|
| NestJS fast validation boundary | ✅ Correct — size, MIME, magic bytes, checksum, dedup |
| Upload transaction (private storage + outbox) | ✅ Correct — atomic row + event in single TX |
| Async scan (not in HTTP request) | ✅ Correct — Cloud Tasks async delivery |
| Clean-before-parse rule | ✅ Correct — parser re-checks DB status |
| Provider abstraction (ClamAV behind interface) | ✅ Correct — future-proof |
| Fail-closed (no bypass in production) | ✅ Correct |
| SSE + REST recovery | ✅ Correct — transport-only optimization |
| Candidate confirmation before profile update | ✅ Correct — review/edit form |

**The only gap is the missing implementation, not the architecture.**

---

**Report Generated:** 2026-08-25  
**Agent:** FreeBuf  
**Status:** APPROVED WITH CHANGES — Critical handler missing, architecture correct
