# Stage 2 Independent Contract Review

**Reviewer:** Kilo (Independent Senior API-Contract and Distributed-Systems Architect)  
**Date:** 2026-08-25  
**Scope:** Stage 2 — Contract Finalization for first-resume security scan and parsing flow  
**Status:** INDEPENDENT AUDIT — NO CONTRACTS, SQL OR CODE MODIFIED

---

## 1. Verdict

**NOT APPROVED**

### Rationale

The Stage 2 draft correctly identifies most gaps, but it contains **unsupported claims, contract mismatches, and missing artifacts** that must be resolved before contract freeze. The most critical issue is that the draft treats an **event contract as a task contract** and proposes changes that would break the existing dispatcher pipeline if implemented without correction.

Specifically:
- `event-route.registry.ts:82` references `contracts/events/security-scan-requested.v1.json` as `taskContract`. This is an **event envelope**, not a Cloud Task payload.
- The dispatcher's `buildTaskPayload` function (`payload.builder.ts:19-26`) builds a **uniform flat payload** from outbox columns and never reads the event `payload` content. If the event contract's nested `payload.storage_url` is forwarded as-is, the FastAPI handler will receive a malformed request.
- `security-scan-queue` provisioning artifact is **missing** from `06-google-cloud-tasks-queue/`.
- `candidate-resume-parsed.v1.json` is **missing** while FastAPI already emits this event.
- JSON Schema draft versions are inconsistent across contracts.

---

## 2. Verified Correct Points

| Point | Repository Evidence | Result |
|---|---|---|
| Uniform task payload pattern | `contracts/tasks/resume-parse-task.v1.json`, `candidate-projection-task.v1.json` — both use flat `{schema_version, event_id, aggregate_id, trace_id}` | ✅ VERIFIED |
| Dispatcher builds uniform task payload | `05-outbox-dispatcher-nestjs/src/routing/payload.builder.ts:19-26` — builds from outbox row columns only, never reads `payload` JSONB | ✅ VERIFIED |
| `aggregate_id` semantics for security scan | `contracts/AGGREGATE-ID-SEMANTICS.md:27` — `security.scan.requested` aggregate_id = `uploaded_documents.id` | ✅ VERIFIED |
| `uploaded_documents` has scan state columns | `02-database/migrations/baseline/06_documents.sql:84-86` — `security_scan_status`, `security_scan_result`, `processing_status` | ✅ VERIFIED |
| Scan queue index exists | `06_documents.sql:144-146` — `idx_uploaded_documents_scan_queue` on `(security_scan_status, created_at)` where `status IN ('pending', 'failed')` | ✅ VERIFIED |
| Parser defensive scan check | `07-fastapi-ai-worker/app/api/v1/task_handlers.py:149-171` — checks `security_scan_status` before parsing | ✅ IMPLEMENTED |
| Parser idempotency | `task_handlers.py:122-126` + `07_resume_processing.sql:50` (`idempotency_key` UNIQUE) | ✅ IMPLEMENTED |
| Outbox event status lifecycle | `15_infrastructure.sql:23-89` — `outbox_events` with `pending/publishing/published/failed/dead_letter` states | ✅ VERIFIED |
| `processed_events` for idempotency | `15_infrastructure.sql:91-102` — `(consumer_name, event_id)` primary key | ✅ VERIFIED |
| Dispatcher route registered | `event-route.registry.ts:78-83` — `security.scan.requested` → `SECURITY_SCAN_QUEUE` → `/internal/tasks/security/scan` | ✅ REGISTERED |
| `DocumentSecurityError` exists | `07-fastapi-ai-worker/app/core/exceptions.py:160-168` — custom exception for scan failures | ✅ VERIFIED |
| OIDC auth pattern exists | `task_handlers.py:114-120` — existing OIDC validation for resume parse | ✅ VERIFIED |
| PII redaction tests exist | `07-fastapi-ai-worker/tests/unit/test_logging_branches.py`, `test_logging_edge_cases.py` — PII redaction patterns tested | ✅ VERIFIED |

---

## 3. Incorrect or Unsupported Claims

| Claim | Actual Evidence | Severity | Required Action |
|---|---|---|---|
| **"Dedicated handler (not inline) — separate workflow step"** is implemented or near-complete | `07-fastapi-ai-worker/app/api/v1/task_handlers.py` contains ONLY `handle_resume_parse_task`. No `/internal/tasks/security/scan` handler exists. Grep for `security_scan` returns only defensive reads in the resume parser. | **CRITICAL** | Do not mark any scan-related contract as "ready" until handler is implemented. |
| **`event-route.registry.ts:11` claims "Endpoint paths verified against task_handlers.py"** | `/internal/tasks/security/scan` is **not present** in `task_handlers.py`. Only 6 handlers exist; security scan handler is absent. | **HIGH** | Fix documentation; do not claim verification that did not happen. |
| **Event contract can be used as task contract** | `event-route.registry.ts:82` uses `contracts/events/security-scan-requested.v1.json` as `taskContract`. This contract has nested `payload` object with `document_id`, `storage_url`, etc. But `payload.builder.ts` builds a **flat task payload** `{schema_version, event_id, aggregate_id, trace_id}` and never reads the event `payload`. The dispatcher will forward the flat payload, but the registry points to the wrong contract. | **CRITICAL** | Create `contracts/tasks/security-scan-task.v1.json` and update registry. |
| **`security_scan_result` JSONB has "versioned compact schema"** | `06_documents.sql:85` defines `security_scan_result JSONB` with only a `jsonb_typeof = 'object'` check. No schema contract, no version field, no required properties. | **HIGH** | Create `contracts/schemas/security-scan-result.v1.json` or add CHECK constraint. |
| **`candidate.resume.parsed.v1.json` is "documented/emitted"** | `task_handlers.py:276-286` emits `candidate.resume.parsed`, but **no `contracts/events/candidate-resume-parsed.v1.json` exists**. | **MEDIUM** | Create missing contract before any consumer is built. |
| **JSON Schema consistency is "pending alignment"** | The draft says alignment is pending, but `security-scan-requested.v1.json` uses `draft/2020-12/schema` while all existing task contracts and most event contracts use `draft-07/schema#`. This is not a "pending" item — it is an **active inconsistency** that will break tooling. | **MEDIUM** | Decide on single version; align all contracts. |
| **`storage_url` in event contract is "required"** | `security-scan-requested.v1.json:33` requires `payload.storage_url`. Stage 1 decision explicitly rejects signed URLs in task payloads ("Document-ID-only task payload"). The event contract still requires it, creating a **direct conflict** between Stage 1 decision and current contract. | **HIGH** | Remove `storage_url` from event contract payload or make it optional; worker must read storage metadata from DB. |
| **`resume-parse-requested.v1.json` is an "event contract" with flat fields** | `contracts/events/resume-parse-requested.v1.json` has flat fields (`schema_version`, `event_id`, `aggregate_id`, `trace_id`, `document_id`, `requested_by`) — no `aggregate_type`, `event_type`, `payload`, `occurred_at`. This is a **task payload shape in the events directory**. Meanwhile `G1-ENVELOPE-ALIGNMENT.md` says Phase 1 trigger event contracts need full envelope alignment. | **HIGH** | Either move to `contracts/tasks/` or add full envelope fields. Cannot be both event and task. |
| **Queue provisioning exists** | `06-google-cloud-tasks-queue/` contains `projection-queue.json` and `cloud-tasks-invoker-policy.json` but **no `security-scan-queue.json`**. | **HIGH** | Create queue provisioning artifact or confirm queue exists in GCP. |
| **`candidate-profile-changed.v1.json` uses draft-07 flat envelope** | `contracts/events/candidate-profile-changed.v1.json` uses flat fields without full outbox envelope. `G1-ENVELOPE-ALIGNMENT.md` says Phase 1 trigger contracts need alignment, but this file is already in `contracts/events/` with the wrong shape. | **MEDIUM** | Clarify: is this a trigger event contract (needs envelope) or a task contract (belongs in `contracts/tasks/`)? |

---

## 4. Contract Gaps

### Gap C2-01: Missing `contracts/tasks/security-scan-task.v1.json`

- **Exact source:** `contracts/tasks/` — file does not exist. `event-route.registry.ts:82` incorrectly uses event contract as task contract.
- **Problem:** Cloud Tasks delivers a flat task payload, not an outbox event envelope. The dispatcher's `buildTaskPayload` builds `{schema_version, event_id, aggregate_id, trace_id}` from outbox columns. The security scan event contract has nested `payload` with `document_id`, `storage_url`, etc. These are incompatible shapes.
- **Impact:** When dispatcher forwards the event, the FastAPI handler will receive a payload missing required fields (or with wrong structure). Handler cannot be implemented without a valid task contract.
- **Recommended options:**
  1. Create `contracts/tasks/security-scan-task.v1.json` matching existing task payload pattern: `{schema_version: 1, event_id, aggregate_id, trace_id}` — **RECOMMENDED**
  2. Keep event contract as producer-side only; task contract as worker-side only
- **User decision required:** NO — straightforward creation.

### Gap C2-02: `storage_url` Conflict Between Stage 1 Decision and Event Contract

- **Exact source:** `STAGE-01-FOUR-DECISIONS-CONSOLIDATED.md:93-109` (document-ID-only task payload) vs `contracts/events/security-scan-requested.v1.json:33` (requires `payload.storage_url`)
- **Problem:** Stage 1 explicitly decided task payload must NOT carry signed URLs or storage paths. Worker reads storage metadata from `uploaded_documents` table. But the event contract still requires `storage_url`.
- **Impact:** Producer (NestJS) cannot emit the event contract as specified while respecting the Stage 1 decision. If `storage_url` is kept, it violates the document-ID-only boundary. If removed, the event contract changes.
- **Recommended options:**
  1. Remove `storage_url` from event contract payload — worker reads from DB
  2. Make `storage_url` optional in event contract, absent in task contract
- **User decision required:** NO — Stage 1 decision is clear; event contract must align.

### Gap C2-03: Missing `contracts/events/candidate-resume-parsed.v1.json`

- **Exact source:** `task_handlers.py:276-286` emits `candidate.resume.parsed` event, but no contract file exists in `contracts/events/`.
- **Problem:** Downstream consumers (SSE gateway, projection worker) have no formal contract to validate against.
- **Impact:** Schema drift between producer and consumer; no validation possible.
- **Recommended options:** Create contract with `candidate_id`, `document_id`, `parsing_job_id`, `trace_id`, `is_active_profile_resume`.
- **User decision required:** NO — straightforward creation.

### Gap C2-04: Missing `contracts/schemas/security-scan-result.v1.json`

- **Exact source:** `06_documents.sql:85` (`security_scan_result JSONB`) — only has `jsonb_typeof = 'object'` check. Stage 1 decision specifies shape but no contract exists.
- **Problem:** Scanner output is unstructured JSONB. Different providers will produce incompatible formats. Audit trail incomplete.
- **Impact:** Cannot verify scan provenance; cannot switch providers without migration; cannot audit security decisions.
- **Recommended options:**
  1. Create JSON Schema contract: `contracts/schemas/security-scan-result.v1.json`
  2. Add CHECK constraint in SQL (optional hardening)
- **User decision required:** NO — Stage 1 decision already specifies shape.

### Gap C2-05: Missing `security-scan-queue` Provisioning Artifact

- **Exact source:** `06-google-cloud-tasks-queue/` — contains `projection-queue.json` but no `security-scan-queue.json`.
- **Problem:** Cannot provision the queue via IaC without a config file.
- **Impact:** Deployment blocked; no retry config, rate limits, or concurrency settings defined for scan queue.
- **Recommended options:** Create `security-scan-queue.json` with appropriate retry/backoff settings.
- **User decision required:** NO — standard IaC artifact.

### Gap C2-06: `resume-parse-requested.v1.json` Identity Crisis

- **Exact source:** `contracts/events/resume-parse-requested.v1.json` — flat task-like fields in `contracts/events/` directory.
- **Problem:** This contract has no `aggregate_type`, `event_type`, `payload`, or `occurred_at` — it is a task payload shape, not an event envelope. Meanwhile `G1-ENVELOPE-ALIGNMENT.md` says Phase 1 trigger event contracts need full envelope alignment.
- **Impact:** Confusion about whether this is a trigger event contract or task contract. If it's both, it cannot satisfy both shapes simultaneously.
- **Recommended options:**
  1. Move to `contracts/tasks/resume-parse-task.v1.json` (already exists there? No — `resume-parse-task.v1.json` exists in `contracts/tasks/` with same flat shape)
  2. Actually, `contracts/tasks/resume-parse-task.v1.json` already exists with the same flat shape. The `contracts/events/resume-parse-requested.v1.json` is a **duplicate** with a different name but same content. This is a conflict.
- **User decision required:** YES — which contract is the source of truth?

### Gap C2-07: `candidate-profile-changed.v1.json` Identity Crisis

- **Exact source:** `contracts/events/candidate-profile-changed.v1.json` — flat fields without full outbox envelope.
- **Problem:** Same as C2-06. If Phase 1 trigger events need full envelope alignment (per `G1-ENVELOPE-ALIGNMENT.md`), this contract is incomplete. If it's a task contract, it belongs in `contracts/tasks/`.
- **Impact:** Producer/consumer contract mismatch risk.
- **Recommended options:**
  1. Add full envelope fields (`aggregate_type`, `event_type`, `payload`, `occurred_at`)
  2. Move to `contracts/tasks/` if it's a task contract
- **User decision required:** YES — depends on whether this is a trigger event or task contract.

### Gap C2-08: JSON Schema Draft Version Inconsistency

- **Exact source:** 
  - `security-scan-requested.v1.json:2` — `draft/2020-12/schema`
  - `resume-parse-requested.v1.json:2` — `draft-07/schema#`
  - `contracts/tasks/resume-parse-task.v1.json:2` — `draft-07/schema#`
  - `contracts/tasks/candidate-projection-task.v1.json:2` — `draft-07/schema#`
- **Problem:** Mixed schema versions break validation tooling and create confusion about which version to use for new contracts.
- **Impact:** New contracts will likely use whichever version is convenient, perpetuating inconsistency.
- **Recommended options:**
  1. Standardize on `draft-07` (broader tooling support) — **RECOMMENDED**
  2. Standardize on `2020-12` (if all tooling supports it)
- **User decision required:** NO — pick one and align all.

---

## 5. Proposed Contract Changes

### REQUIRED

| # | Change | File | Reason |
|---|---|---|---|
| R1 | Create `contracts/tasks/security-scan-task.v1.json` | New file | Dispatcher needs flat task payload; event contract cannot be used as task contract |
| R2 | Update `event-route.registry.ts:82` to reference `contracts/tasks/security-scan-task.v1.json` | `event-route.registry.ts` | Current reference is wrong; causes payload mismatch |
| R3 | Remove `storage_url` from `contracts/events/security-scan-requested.v1.json` payload or make it optional | `security-scan-requested.v1.json` | Conflicts with Stage 1 decision (document-ID-only task payload); worker reads storage from DB |
| R4 | Create `contracts/events/candidate-resume-parsed.v1.json` | New file | FastAPI emits this event; no contract exists |
| R5 | Create `contracts/schemas/security-scan-result.v1.json` | New file | `security_scan_result` JSONB has no schema; audit trail incomplete |
| R6 | Create `06-google-cloud-tasks-queue/security-scan-queue.json` | New file | Queue provisioning missing; cannot deploy without IaC config |
| R7 | Align all contracts to single JSON Schema draft version (recommend `draft-07`) | All contract files | Mixed `draft-07` and `2020-12` breaks tooling |
| R8 | Fix `event-route.registry.ts:11` documentation claim ("Endpoint paths verified against task_handlers.py") | `event-route.registry.ts` | False claim; `/internal/tasks/security/scan` not implemented |

### OPTIONAL

| # | Change | File | Reason |
|---|---|---|---|
| O1 | Add `idempotency_key` to security scan task payload | `contracts/tasks/security-scan-task.v1.json` | Enables duplicate task detection at handler level (existing pattern in `processed_events`) |
| O2 | Add full outbox envelope to `contracts/events/resume-parse-requested.v1.json` or move to `contracts/tasks/` | `contracts/events/resume-parse-requested.v1.json` | Currently a task-shaped contract in events directory |
| O3 | Add full outbox envelope to `contracts/events/candidate-profile-changed.v1.json` or move to `contracts/tasks/` | `contracts/events/candidate-profile-changed.v1.json` | Same identity crisis as O2 |

### NOT RECOMMENDED

| # | Change | Reason |
|---|---|---|
| NR1 | Keep `storage_url` in event contract | Violates Stage 1 decision; worker must read storage from DB |
| NR2 | Use event contract as task contract | Dispatcher payload builder is payload-opaque; shapes are incompatible |
| NR3 | Invent new envelope format | Existing outbox envelope (`15_infrastructure.sql`) is sufficient |

### NEEDS USER DECISION

| # | Decision | Options |
|---|---|---|
| UD1 | `resume-parse-requested.v1.json` — is this a trigger event contract or task contract? | If trigger event: add full envelope. If task: move to `contracts/tasks/`. Cannot be both. |
| UD2 | `candidate-profile-changed.v1.json` — same question as UD1 | Same options. |

---

## 6. Security and PII Review

### SC-01: `storage_url` in Event Contract — Security Risk

`security-scan-requested.v1.json` requires `payload.storage_url` (GCS/S3 signed URL or object path). If this event is logged, forwarded, or exposed to any non-trusted consumer, the signed URL could leak.

**Stage 1 decision explicitly removed this from task payload.** The event contract must align.

**Required:** Remove `storage_url` from event contract. Worker reads `storage_bucket` + `storage_path` from `uploaded_documents` table using trusted server-side credentials.

### SC-02: `security_scan_result` PII Protection

No schema contract exists for `security_scan_result`. If a scanner returns file content, paths, or candidate PII in the result JSONB, it will be stored without validation.

**Required:** Define `security-scan-result.v1.json` schema that explicitly excludes:
- Raw file content
- Full file paths
- Candidate PII (names, emails, phone numbers)
- Secrets/credentials

Allowed fields: `verdict`, `scanner.provider`, `scanner.engine_version`, `scanner.signature_version`, `scanned_at`, `duration_ms`, `file_size_bytes`, `checksum_sha256`, `threats` (names only), `error_code`, `error_message` (safe).

### SC-03: No Scan-Specific Idempotency Key

`security-scan-requested.v1.json` has no `idempotency_key`. If the outbox dispatcher retries the event, the scanner worker could be invoked multiple times for the same document.

**Required:** Add `idempotency_key` to task payload contract. Handler must check `processed_events('security_scanner', idempotency_key)` before scanning.

### SC-04: PII Redaction in Logs

Existing tests (`test_logging_branches.py`, `test_logging_edge_cases.py`) verify PII redaction for email, phone, bearer tokens, and API keys. However, no tests verify redaction of:
- Resume content (raw extracted text)
- Scan result details (threat names, file paths)
- Storage paths/bucket names

**Required:** Add PII redaction tests for resume content and scan results.

---

## 7. Dispatcher/Worker Compatibility Review

### DC-01: Task Payload Mismatch — CRITICAL

| Component | Current State | Expected State |
|---|---|---|
| Dispatcher `buildTaskPayload` | Builds flat `{schema_version, event_id, aggregate_id, trace_id}` from outbox columns | ✅ Correct |
| Registry `taskContract` for security scan | Points to `contracts/events/security-scan-requested.v1.json` (event envelope with nested `payload`) | ❌ Wrong — should point to `contracts/tasks/security-scan-task.v1.json` |
| FastAPI handler (not implemented) | Would receive flat task payload from dispatcher | Must match `contracts/tasks/security-scan-task.v1.json` |

**Impact:** If a security scan handler is written to parse the event contract's nested `payload`, it will fail because the dispatcher never forwards that structure.

### DC-02: Event Contract `storage_url` vs DB-Only Pattern

| Component | Current State | Expected State |
|---|---|---|
| Event contract | Requires `payload.storage_url` | Stage 1 decision: remove from task payload; worker reads from DB |
| Dispatcher | Never reads event `payload` content | ✅ Correct — payload is opaque |
| Worker (when implemented) | Should read `storage_bucket`, `storage_path` from `uploaded_documents` | ✅ Aligns with Stage 1 decision |

**Impact:** Event contract and Stage 1 decision are in direct conflict. The event contract must be updated.

### DC-03: Missing Queue Config

| Component | Current State | Expected State |
|---|---|---|
| `security-scan-queue` provisioning | No `security-scan-queue.json` in `06-google-cloud-tasks-queue/` | Must exist for IaC deployment |
| Other queues | `projection-queue.json` exists with retry config | ✅ Reference model |

**Impact:** Cannot provision queue via Terraform/Deployment Manager without config file.

### DC-04: Missing Handler Implementation

| Component | Current State | Expected State |
|---|---|---|
| FastAPI security scan handler | **Does not exist** | `POST /internal/tasks/security/scan` with `SecurityScanTaskPayload` schema |
| FastAPI resume parser | Fully implemented with idempotency, lease, defensive scan check | ✅ Reference model |

**Impact:** No consumer exists for the security scan event. The entire contract chain is theoretical.

---

## 8. Required Changes Before Contract Freeze

| # | Change | Priority | Blocking | Owner |
|---|---|---|---|---|
| 1 | Create `contracts/tasks/security-scan-task.v1.json` with flat payload `{schema_version, event_id, aggregate_id, trace_id}` | CRITICAL | YES | Contracts/API |
| 2 | Update `event-route.registry.ts:82` to reference new task contract | CRITICAL | YES | Dispatcher |
| 3 | Remove `storage_url` from `contracts/events/security-scan-requested.v1.json` payload | CRITICAL | YES | Contracts |
| 4 | Create `contracts/events/candidate-resume-parsed.v1.json` | HIGH | NO | Contracts |
| 5 | Create `contracts/schemas/security-scan-result.v1.json` | HIGH | YES (for Stage 2) | Contracts/Security |
| 6 | Create `06-google-cloud-tasks-queue/security-scan-queue.json` | HIGH | YES (for deployment) | Ops/Infrastructure |
| 7 | Align all contracts to single JSON Schema draft version (`draft-07` recommended) | MEDIUM | NO | Contracts |
| 8 | Fix `event-route.registry.ts:11` false documentation claim | MEDIUM | NO | Dispatcher |
| 9 | Resolve `resume-parse-requested.v1.json` identity crisis (event vs task) | HIGH | YES | Contracts/User |
| 10 | Resolve `candidate-profile-changed.v1.json` identity crisis | HIGH | YES | Contracts/User |
| 11 | Add `idempotency_key` to security scan task payload | MEDIUM | NO | Contracts |
| 12 | Add PII redaction tests for resume content and scan results | MEDIUM | NO | FastAPI |

---

## 9. Final Recommendation

### Can Stage 2 Contract Freeze Happen Now?

**NO.**

The draft identifies the right gaps, but it also contains **incorrect claims** (event contract usable as task contract) and **omits critical artifacts** (task contract, queue config, result schema). Freezing contracts in current state would:

1. Lock in a payload mismatch between dispatcher and handler
2. Perpetuate the `storage_url` security concern
3. Leave the scan result schema undefined
4. Block queue provisioning

### What Must Happen First

| Phase | Action | Owner |
|---|---|---|
| **A** | Create `contracts/tasks/security-scan-task.v1.json` (flat payload, document-ID only) | Contracts |
| **A** | Update `event-route.registry.ts:82` to reference task contract | Dispatcher |
| **A** | Remove `storage_url` from `security-scan-requested.v1.json` or make optional | Contracts |
| **A** | Create `security-scan-result.v1.json` schema | Contracts/Security |
| **B** | Create `security-scan-queue.json` provisioning artifact | Ops |
| **B** | Create `candidate-resume-parsed.v1.json` | Contracts |
| **C** | Resolve `resume-parse-requested.v1.json` and `candidate-profile-changed.v1.json` identity crisis | Contracts/User |
| **C** | Align JSON Schema draft versions across all contracts | Contracts |

### Is It Safe to Proceed to Stage 3 (NestJS API Requirements Sync)?

**Conditionally YES — after Phase A above.**

Stage 3 can proceed in parallel with contract creation, but only after:
- The task payload contract exists and is stable
- The dispatcher registry reference is corrected
- The `storage_url` conflict is resolved

### Consolidated Position

The Stage 2 draft (`STAGE-02-CONTRACT-INVENTORY-AND-GAP-ANALYSIS.md`) correctly identifies most gaps. The errors are:

1. **Treating the event contract as a valid task contract reference.** The dispatcher payload builder is payload-opaque and builds a flat task payload. The event contract's nested structure cannot be forwarded.
2. **Not resolving the `storage_url` conflict.** Stage 1 decision explicitly removed signed URLs from task payloads, but the event contract still requires them.
3. **Missing queue provisioning artifact.** Cannot deploy without IaC config.
4. **Treating `resume-parse-requested.v1.json` as an event contract when it has task-shaped fields.** This creates confusion about source of truth.

**The contract architecture is sound.** The fixes above are straightforward and can be completed in 1-2 days. Once completed, Stage 2 can be frozen and Stage 3 can proceed.

---

## 10. Summary Table — All 10 Verification Points

| # | Verification Point | Status | Evidence |
|---|---|---|---|
| 1 | `security.scan.requested` event envelope | PARTIALLY CORRECT | `aggregate_type='uploaded_document'` and `aggregate_id=uploaded_documents.id` are correct per `AGGREGATE-ID-SEMANTICS.md:27`. But `payload.storage_url` conflicts with Stage 1 decision. |
| 2 | Security scan task contract needed | MISSING | `contracts/tasks/security-scan-task.v1.json` does not exist. Event contract cannot serve as task contract. |
| 3 | Dispatcher registry reference | INCORRECT | `event-route.registry.ts:82` points to event contract, not task contract. `payload.builder.ts` builds flat payload, never reads event `payload`. |
| 4 | Resume parsing contracts | CONFUSED | `resume-parse-requested.v1.json` is in `contracts/events/` but has task-shaped flat fields. `contracts/tasks/resume-parse-task.v1.json` exists with same shape. Duplicate/conflict. |
| 5 | Missing `candidate.resume.parsed.v1.json` | CONFIRMED MISSING | `task_handlers.py:276-286` emits event; no contract file exists. |
| 6 | `security_scan_result` JSONB schema | UNDEFINED | `06_documents.sql:85` allows any object. No contract, no CHECK constraint, no validation. |
| 7 | JSON Schema consistency | BROKEN | `security-scan-requested.v1.json` uses `draft-2020-12`; all other contracts use `draft-07`. |
| 8 | Aggregate ID semantics | CORRECT | `AGGREGATE-ID-SEMANTICS.md:27` confirms `aggregate_id = uploaded_documents.id`. Matches `06_documents.sql`. |
| 9 | Queue provisioning | MISSING | `security-scan-queue.json` does not exist in `06-google-cloud-tasks-queue/`. Only `projection-queue.json` exists. |
| 10 | Contract testing | PARTIAL | Existing tests cover task payload schemas (`test_schemas.py`) and handler idempotency (`test_handler_idempotency.py`), but no tests for security scan contract (because it doesn't exist). |

---

**NOT APPROVED**

*Stage 2 draft is directionally correct but contains critical contract mismatches and missing artifacts that must be resolved before freeze.*
