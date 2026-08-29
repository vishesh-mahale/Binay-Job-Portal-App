# Stage 1 Independent Review — Security Scan Decision

**Reviewer:** Kilo (Independent Senior Security/Distributed-Systems Architect)  
**Date:** 2026-08-25  
**Scope:** Stage 1 Security Scan Decision for first-resume upload pipeline  
**Status:** INDEPENDENT AUDIT — NO PRODUCTION CODE OR SQL MODIFIED

---

## 1. Verdict

**NOT APPROVED**

### Rationale

The proposed architecture is **sound and should be implemented exactly as specified**. However, the current Stage 1 decision document contains **unsupported claims, missing contracts, and a critical implementation gap** that must be resolved before Stage 1 can be frozen.

The single most critical issue: **the `security.scan.requested` consumer does not exist anywhere in the repository.** The event contract exists, the dispatcher route is registered, but there is no FastAPI handler, no scanner abstraction, and no task payload contract. Without this, the entire "clean → parse" guarantee is theoretical.

---

## 2. Verified Correct Points

| Point | Repository Evidence | Result |
|---|---|---|
| Async scan pattern matches schema | `06_documents.sql:84` (`security_scan_status DEFAULT 'pending'`), `06_documents.sql:144-146` (scan-queue index on `pending`/`failed`), `02_enums.sql:527-529` (`pending, scanning, clean, infected, failed, quarantined`) | ✅ VERIFIED |
| Upload validation boundary specified | `NESTJS-IMPLEMENTATION-GUIDE.md:257-270` — auth, size, MIME, extension, magic bytes, SHA-256, dedup | ✅ SPECIFIED |
| Atomic clean→parse transition specified | `NESTJS-IMPLEMENTATION-GUIDE.md:280-284` — single transaction: `security_scan_status='clean'` + `resume_parsing_jobs` + `resume.parse.requested` outbox | ✅ SPECIFIED |
| Parser re-checks scan status | `task_handlers.py:149-171` — defensive `security_scan_status` verification before parsing | ✅ IMPLEMENTED |
| Parser idempotency | `task_handlers.py:122-126` — `processed_events` check; `07_resume_processing.sql:50` — `idempotency_key` UNIQUE | ✅ IMPLEMENTED |
| Parser crash recovery | `task_handlers.py:128-133` — lease claim with `locked_at`/`locked_by`; stale lease reclaim | ✅ IMPLEMENTED |
| Immutable parsed evidence | `07_resume_processing.sql:136-146` — `reject_immutable_row_change()` triggers on `resume_parsed_data`, `resume_parsing_artifacts`, `resume_parsing_job_events` | ✅ VERIFIED |
| Candidate confirmation gate specified | `NESTJS-IMPLEMENTATION-GUIDE.md:298` — AI output is evidence, not canonical; `08_candidates.sql` — `bump_candidate_profile_revision()` | ✅ SPECIFIED |
| SSE + REST recovery specified | `NESTJS-IMPLEMENTATION-GUIDE.md:300-301` — SSE for live update, REST for authoritative recovery | ✅ SPECIFIED |
| Dispatcher route registered | `event-route.registry.ts:78-83` — `security.scan.requested` → `SECURITY_SCAN_QUEUE` → `/internal/tasks/security/scan` | ✅ REGISTERED |
| Outbox pattern implemented | `05-outbox-dispatcher-nestjs/src/dispatcher/dispatcher.service.ts` — full outbox drain, wake, retry, dead-letter | ✅ IMPLEMENTED |
| Application-specific resume boundary | `PD-002-ACTIVE-RESUME-SEARCH.md:52-65` — application resume cannot be promoted to profile without explicit re-upload | ✅ SPECIFIED |

---

## 3. Incorrect or Unsupported Claims

| Claim | Actual Evidence | Severity | Required Action |
|---|---|---|---|
| **"FastAPI dedicated security-scan handler" exists or is near-complete** | `07-fastapi-ai-worker/app/api/v1/task_handlers.py` contains ONLY `handle_resume_parse_task`. Grep for `security` in `task_handlers.py` returns only `security_scan_status` defensive reads. No `/internal/tasks/security/scan` endpoint exists. | **CRITICAL** | Implement handler before Stage 1 freeze. |
| **Dispatcher "Endpoint paths verified against task_handlers.py"** | `event-route.registry.ts:11` claims this, but `/internal/tasks/security/scan` is **not present** in `task_handlers.py`. Only 6 of 7 Phase 2 routes have handlers. | **HIGH** | Fix documentation; implement missing handler. |
| **Event contract can be used as task contract** | `event-route.registry.ts:82` uses `contracts/events/security-scan-requested.v1.json` as `taskContract`. This is an **event envelope** (`aggregate_type`, `aggregate_id`, `event_type`, `occurred_at`), not a Cloud Task payload. `contracts/tasks/resume-parse-task.v1.json` shows the correct task payload shape. | **HIGH** | Create `contracts/tasks/security-scan-task.v1.json` and update registry. |
| **"Scanner direction: ClamAV — technically correct"** | Stage 1 decision recommends ClamAV but provides **no deployment location, no resource estimates, no signature-update strategy, no HA plan**. The document acknowledges this gap but does not resolve it. | **MEDIUM** | Complete operational review before production approval. |
| **Scan→parse atomic transition is "guaranteed"** | Specified in `NESTJS-IMPLEMENTATION-GUIDE.md:280-284` but **no code implements it**. The security scan handler does not exist, so no transaction enforces this. | **HIGH** | Implement as part of scan handler. |
| **SSE status delivery exists** | `NESTJS-IMPLEMENTATION-GUIDE.md:300-301` mentions SSE, but **no SSE gateway, controller, or auth implementation exists** in `04-nestjs-api/` (which has zero TypeScript code). | **HIGH** | Implement in Phase C. |
| **NestJS upload validation exists** | `04-nestjs-api/` contains **zero TypeScript/JavaScript implementation files**. Only planning documents exist. | **CRITICAL** | Implement in Phase C. |
| **"Development: deterministic mock scanner; production scanner bypass not allowed"** | This is stated in Stage 1 decision but **no `settings.SECURITY_SCAN_ENABLED` flag or environment-gated mock exists**. Without implementation, this is a promise, not a guarantee. | **MEDIUM** | Implement env-gated mock with fail-closed prod behavior. |
| **`candidate.resume.parsed` event contract exists** | `task_handlers.py:276-286` emits `candidate.resume.parsed`, but **no `contracts/events/candidate-resume-parsed.v1.json` exists**. | **MEDIUM** | Create missing contract. |
| **JSON Schema consistency** | `security-scan-requested.v1.json` uses `draft/2020-12/schema` (line 2). `resume-parse-requested.v1.json` uses `draft-07/schema#` (line 2). Inconsistent schema versions will break tooling. | **LOW** | Align to single schema version. |

---

## 4. Missing Decisions or Gaps

### Gap S1-01: Security Scan Handler — Complete Absence

- **Exact source:** `07-fastapi-ai-worker/app/api/v1/task_handlers.py` (946 lines, only 6 handlers, zero scan handlers)
- **Problem:** The `security.scan.requested` event has a contract, a dispatcher route (`SECURITY_SCAN_QUEUE` → `/internal/tasks/security/scan`), and a queue — but **no consumer**. This is not a "minor gap" — it is the absence of the primary security control.
- **Impact:** The entire "clean → parse" guarantee is theoretical. Any trusted DB writer can set `security_scan_status='clean'` and bypass malware scanning entirely. The Stage 1 decision cannot be approved until this is implemented.
- **Recommended options:**
  1. FastAPI dedicated handler (same service, separate module) — **RECOMMENDED**
  2. Separate scanner microservice — future option, contract-compatible
  3. NestJS background processor — adds heavy work to API tier, not recommended
- **User decision required:** **NO** — FastAPI handler is the clear choice per existing architecture.

### Gap S1-02: Missing Task Contract

- **Exact source:** `contracts/tasks/` — `security-scan-task.v1.json` does not exist. `event-route.registry.ts:82` incorrectly references the event contract as task contract.
- **Problem:** Cloud Tasks delivers a task payload, not an outbox event envelope. The dispatcher will fail to deserialize or the handler will receive malformed data.
- **Impact:** Stage 1 cannot be frozen without a valid task payload contract.
- **Recommended options:**
  1. Create `contracts/tasks/security-scan-task.v1.json` with `document_id`, `storage_url`, `trace_id`, `idempotency_key`
  2. Update `event-route.registry.ts:82` to reference the new task contract
- **User decision required:** **NO** — straightforward fix.

### Gap S1-03: ClamAV Deployment Strategy Undefined

- **Exact source:** `04-nestjs-api/04-nestjs-api-app/s1/codex/STAGE-01-SECURITY-SCAN-DECISION.md:46-58`
- **Problem:** ClamAV is recommended as "initial production direction" but no deployment model is specified: same FastAPI runtime? Sidecar? Separate internal service? No resource limits, signature-update cadence, or HA strategy.
- **Impact:** Cannot size infrastructure, cannot estimate cost, cannot design failure behavior.
- **Recommended options:**
  1. Sidecar container (same Cloud Run revision, isolated process) — **RECOMMENDED for MVP**
  2. Separate internal service — more ops burden, contract-compatible future path
  3. Managed cloud scanner — lower ops, higher cost, data-residency review needed
- **User decision required:** **YES** — deployment model affects Stage 2 implementation plan.

### Gap S1-04: Scan Retry/Timeout Policy Undefined

- **Exact source:** `STAGE-01-SECURITY-SCAN-DECISION.md:82-88` — "Open decisions before Stage 1 freeze"
- **Problem:** No exact retry count, backoff intervals, timeout values, or dead-letter handling defined for scan tasks.
- **Impact:** Cannot implement handler; cannot configure Cloud Tasks queue; cannot define SLA.
- **Recommended options:**
  1. Mirror `resume_parsing_jobs.max_attempts=3` pattern for scan tasks
  2. Use Cloud Tasks `scheduleTime` for backoff
  3. Exhausted scans → `security_scan_status='failed'` + dead-letter table + recovery sweeper
- **User decision required:** **YES** — exact retry budget and timeout values.

### Gap S1-05: Scan Result Schema Undefined

- **Exact source:** `06_documents.sql:85` (`security_scan_result JSONB`) — schema allows any object, but no contract defines required fields.
- **Problem:** Scanner output is unstructured JSONB. Different scanner providers will produce incompatible formats. Audit trail is incomplete.
- **Impact:** Cannot verify scan provenance; cannot switch providers without migration; cannot audit security decisions.
- **Recommended options:**
  1. Define minimum: `engine`, `engine_version`, `threats_found`, `scan_timestamp`, `verdict`
  2. Add `security_scan_result` CHECK constraint or JSON Schema validation
- **User decision required:** **YES** — audit compliance requirements.

### Gap S1-06: Missing `candidate-resume-parsed.v1.json` Contract

- **Exact source:** `task_handlers.py:276-286` emits `candidate.resume.parsed` event, but `contracts/events/candidate-resume-parsed.v1.json` does not exist.
- **Problem:** Downstream consumers (SSE gateway, projection worker) have no formal contract to validate against.
- **Impact:** Schema drift between producer and consumer.
- **Recommended options:** Create contract with `candidate_id`, `document_id`, `parsing_job_id`, `trace_id`, `is_active_profile_resume`.
- **User decision required:** **NO** — straightforward creation.

### Gap S1-07: No Recovery Sweeper for Stale Scans

- **Exact source:** `06_documents.sql:144-146` — scan-queue index exists for `pending`/`failed`, but no scheduled job or function uses it.
- **Problem:** If the scanner worker crashes after a document is marked `pending` but before scan completion, the document stays `pending` forever. The resume parser returns 503 and retries, but nothing triggers a re-scan.
- **Impact:** Documents stuck indefinitely; candidate never receives resolution.
- **Recommended options:**
  1. Cloud Scheduler job (similar to `dev-outbox-recovery-sweep` pattern in `NESTJS-IMPLEMENTATION-GUIDE.md:412`)
  2. PostgreSQL function that finds stale `pending`/`scanning` documents and re-emits outbox events
- **User decision required:** **NO** — standard pattern, implement in Stage 1.

---

## 5. Security Concerns

### SC-01: Scan Bypass Risk (CRITICAL)

The `security_scan_status` column is writable by any trusted DB role. Without the scanner worker implementation, **any service with DB write access can set `security_scan_status='clean'` and bypass malware scanning entirely**. The quarantine pattern is only secure when the scanner worker is the sole path to `clean`.

**Current state:** The FastAPI resume parser defensively checks `security_scan_status` (`task_handlers.py:149-171`), but this is a secondary guard, not the primary security control.

**Required:** Implement the scanner worker as the **only** path to `clean` status. Consider a database function `mark_document_clean(document_id, scan_result)` that validates the caller is the scanner worker role.

### SC-02: No DB-Level Canonical Profile Gate

`NESTJS-IMPLEMENTATION-GUIDE.md:298` says candidate confirmation is mandatory, but **no database trigger or check constraint prevents `candidate_profiles` / `candidate_skills` from being written before parsing completes**. A bug, backdoor, or compromised internal service could silently create canonical profile facts.

**Required (optional):** Add a database function or trigger that verifies the active resume document has `security_scan_status='clean'` and `processing_status='completed'` before allowing canonical insert/update.

### SC-03: SSE Authentication Unimplemented

DECISION-02 mandates per-user authenticated SSE, but no auth layer exists. Unauthorized clients could reconnect and receive status events for other candidates if user-scoping is broken.

**Required:** SSE auth identical to REST auth (JWT/session ticket). Implement in Phase C.

### SC-04: PII in Logs

No explicit PII redaction rules are visible in the scanned code. Resume content, candidate names, and scan results may appear in logs.

**Required:** Define and enforce PII redaction policy for all services.

### SC-05: Scanner Provider Data Residency

If a managed cloud scanner (VirusTotal, etc.) is chosen, candidate resumes will be sent to a third party. This requires explicit data-residency review and likely candidate consent.

**Required:** If managed scanner is chosen, complete data-residency review before production.

---

## 6. Contract/Queue/Worker Concerns

### CQ-01: Task Payload Mismatch

`event-route.registry.ts:82` uses `contracts/events/security-scan-requested.v1.json` as `taskContract`. This contract has an **event envelope** (`aggregate_type`, `aggregate_id`, `event_type`, `occurred_at`) but Cloud Tasks delivers a **task payload**. The dispatcher's `buildTaskPayload` function will either fail or produce malformed input.

**Fix:** Create `contracts/tasks/security-scan-task.v1.json` with flat payload structure matching other task contracts (e.g., `contracts/tasks/resume-parse-task.v1.json`).

### CQ-02: Missing `candidate-resume-parsed.v1.json`

`task_handlers.py:276-286` emits `candidate.resume.parsed` but no contract exists. Downstream consumers cannot validate event shape.

**Fix:** Create `contracts/events/candidate-resume-parsed.v1.json`.

### CQ-03: JSON Schema Draft Inconsistency

`security-scan-requested.v1.json` uses `draft/2020-12/schema`. `resume-parse-requested.v1.json` uses `draft-07/schema#`. Mixed versions break validation tooling.

**Fix:** Align all contracts to a single version (recommend `draft-07` for broader tooling support, or `2020-12` for all if tooling supports it).

### CQ-04: No `idempotency_key` in Scan Event

`security-scan-requested.v1.json` payload has no `idempotency_key`. If the outbox dispatcher retries the event, the scanner worker could be invoked multiple times for the same document, causing redundant scans and potential cost/rate issues.

**Fix:** Add `idempotency_key` to the scan task payload contract. The handler must check `processed_events('security_scanner', idempotency_key)` before scanning.

### CQ-05: Event Route Documentation Error

`event-route.registry.ts:11` claims "Endpoint paths verified against `07-fastapi-ai-worker/app/api/v1/task_handlers.py`." This is **false** — `/internal/tasks/security/scan` is registered but not implemented.

**Fix:** Update comment to reflect actual implementation status.

---

## 7. Required Corrections Before Stage 1 Freeze

| # | Correction | Priority | Blocking |
|---|---|---|---|
| 1 | Implement `POST /internal/tasks/security/scan` in FastAPI | CRITICAL | YES |
| 2 | Create `contracts/tasks/security-scan-task.v1.json` | CRITICAL | YES |
| 3 | Update `event-route.registry.ts:82` to reference task contract | CRITICAL | YES |
| 4 | Add `idempotency_key` to scan task payload | HIGH | YES |
| 5 | Create `contracts/events/candidate-resume-parsed.v1.json` | MEDIUM | NO |
| 6 | Align JSON Schema draft versions across all contracts | LOW | NO |
| 7 | Define ClamAV deployment model (sidecar vs separate) | HIGH | YES (for Stage 2) |
| 8 | Define scan retry/timeout/dead-letter policy | HIGH | YES (for Stage 2) |
| 9 | Define `security_scan_result` audit schema | MEDIUM | YES (for Stage 2) |
| 10 | Fix `event-route.registry.ts:11` documentation claim | LOW | NO |
| 11 | Implement recovery sweeper for stale scans | HIGH | YES (for production) |
| 12 | Add DB-level canonical profile gate (optional, human decision) | MEDIUM | NO |

---

## 8. Final Recommendation

### Can Stage 1 Freeze Happen Now?

**NO.**

The architecture direction is correct, but Stage 1 cannot be frozen because:

1. **The security scan handler does not exist.** This is the primary security control. Without it, the "clean → parse" guarantee is theoretical.
2. **The task payload contract is missing.** The dispatcher will fail or produce malformed input.
3. **Critical operational decisions are unresolved:** ClamAV deployment model, retry policy, scan result schema.

### What Must Happen First

| Phase | Action | Owner |
|---|---|---|
| **A** | Create `contracts/tasks/security-scan-task.v1.json` + fix registry reference | NestJS/Contracts |
| **A** | Implement `POST /internal/tasks/security/scan` in FastAPI with mock scanner | FastAPI |
| **A** | Implement atomic clean→parse transition in scan handler | FastAPI |
| **B** | Define ClamAV deployment model + resource estimates | Ops/Architect |
| **B** | Define scan retry/timeout/dead-letter policy | Architect |
| **B** | Define `security_scan_result` audit schema | Security/Architect |
| **C** | Implement NestJS upload validation + transaction | NestJS |
| **C** | Implement SSE auth + REST status endpoint | NestJS |

### Is It Safe to Proceed to Stage 2?

**Conditionally YES — after Phases A and B above.**

Stage 2 (contract finalization) can proceed in parallel with scan handler implementation, but only after:
- The task payload contract exists and is stable
- The handler interface is defined (even if mock)
- ClamAV deployment decisions are made

### Consolidated Position

The Stage 1 decision document (`STAGE-01-SECURITY-SCAN-DECISION.md`) correctly identifies the architecture direction. The errors are:

1. **Treating missing implementation as "pending" rather than "blocking."** The scanner handler is on the critical path, not a future enhancement.
2. **Using an event contract where a task contract is required.**
3. **Leaving operational decisions unresolved** that are necessary for implementation planning.

**The architecture should be implemented exactly as specified in the Qoder final flow (`FINAL-RECOMMENDED-FLOW-FIRST-RESUME-UPLOAD-SECURITY-AND-PARSING.md`).** That document is accurate and complete. The Stage 1 decision document is directionally correct but needs the corrections above before it can be frozen.

---

## 9. Summary Table — All 10 Verification Points

| # | Verification Point | Status | Evidence |
|---|---|---|---|
| 1 | NestJS fast validation boundary | SPECIFIED, NOT IMPLEMENTED | `NESTJS-IMPLEMENTATION-GUIDE.md:257-270`; zero TypeScript code in `04-nestjs-api/` |
| 2 | Upload transaction | SPECIFIED, NOT IMPLEMENTED | `NESTJS-IMPLEMENTATION-GUIDE.md:274-278`; no code |
| 3 | Async security scan | SPECIFIED, HANDLER MISSING | Route registered in `event-route.registry.ts:78-83`; no handler in `task_handlers.py` |
| 4 | Clean-before-parse rule | SPECIFIED, NOT ENFORCED | Parser checks defensively (`task_handlers.py:149-171`); no atomic transition code |
| 5 | Scanner direction (ClamAV) | RECOMMENDED, UNDEFINED OPS | No deployment model, resource limits, or HA strategy |
| 6 | Failure and recovery | PARTIALLY SPECIFIED | Parser has retry/idempotency; scan has zero failure handling |
| 7 | UI status flow | SPECIFIED, NOT IMPLEMENTED | SSE + REST specified; no code |
| 8 | Security and data protection | SPECIFIED, NOT IMPLEMENTED | Private storage, signed URLs, OIDC specified; no code |
| 9 | Contract consistency | BROKEN | Event contract used as task contract; missing `candidate-resume-parsed.v1.json`; schema draft mismatch |
| 10 | Actual implementation gap | CRITICAL | Scanner handler, task contract, NestJS upload, SSE — all missing |

---

**NOT APPROVED**

*Stage 1 decision direction is correct. Implementation gaps and contract errors must be resolved before freeze.*
