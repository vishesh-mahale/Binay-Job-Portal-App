# Stage 2 Independent Contract Review

**Reviewer:** opencode (Independent Senior API-Contract and Distributed-Systems Architect)
**Date:** 2026-08-25
**Status:** INDEPENDENT AUDIT COMPLETE
**Primary Draft Audited:** `s1/codex/STAGE-02-CONTRACT-INVENTORY-AND-GAP-ANALYSIS.md`

---

## 1. Verdict

**APPROVED WITH CHANGES**

The inventory is comprehensive and the gap analysis is accurate. However, several critical contract issues must be resolved before Stage 2 freeze.

---

## 2. Verified Correct Points

| Point | Repository Evidence | Result |
|---|---|---|
| `security-scan-requested.v1.json` exists with full envelope | `contracts/events/security-scan-requested.v1.json` — has `aggregate_type`, `aggregate_id`, `event_type`, `payload`, `occurred_at` | ✅ CORRECT |
| `resume-parse-requested.v1.json` uses draft-07 and flat fields | `contracts/events/resume-parse-requested.v1.json` — draft-07, missing `aggregate_type`, `event_type`, `payload`, `occurred_at` | ✅ CORRECT |
| Dispatcher security route references event contract | `event-route.registry.ts:82` — `taskContract: 'contracts/events/security-scan-requested.v1.json'` | ✅ CORRECT (but this is a problem) |
| `candidate-resume-parsed.v1.json` is missing | No file found in `contracts/events/` | ✅ CORRECT |
| Task contracts use uniform payload pattern | All 6 task contracts in `contracts/tasks/` have same 4-field pattern | ✅ CORRECT |
| `security-scan-queue` provisioning artifact missing | Only `projection-queue.json` exists in `06-google-cloud-tasks-queue/` | ✅ CORRECT |
| JSON Schema draft versions are inconsistent | Mixed draft-07 and 2020-12 across contracts | ✅ CORRECT |
| `storage_url` in security-scan event creates security concern | Contract has `storage_url` as required field with `format: "uri"` | ✅ CORRECT |

---

## 3. Incorrect or Unsupported Claims

| Claim | Actual Evidence | Severity | Required Action |
|---|---|---|---|
| "Phase 1 trigger event contracts don't exist" (G1-ENVELOPE-ALIGNMENT.md:21-23) | `resume-parse-requested.v1.json`, `candidate-profile-changed.v1.json`, `job-ai-enrichment-requested.v1.json` ALL EXIST in `contracts/events/` | HIGH | G1-ENVELOPE-ALIGNMENT.md must be updated — these are not missing, they are flat/draft-07 and need envelope alignment |
| "candidate-projection-task.v1.json is a task contract" (G1-ENVELOPE-ALIGNMENT.md:20) | File is in `contracts/tasks/` directory, not `contracts/events/` | LOW | This is correct naming — task contracts are separate from event contracts |
| "All 6 task contracts have same 4-field pattern" (codex draft) | Verified: `resume-parse-task.v1.json`, `candidate-projection-task.v1.json`, `job-enrich-task.v1.json`, `match-analyze-task.v1.json`, `interview-summary-task.v1.json`, `job-screening-questions-task.v1.json` — ALL have same 4 required fields | ✅ CORRECT | No action needed |

---

## 4. Contract Gaps

### Gap-1: `security-scan-task.v1.json` Missing

- **Gap ID:** G-2.1
- **Exact source:** `contracts/tasks/` directory — no `security-scan-task.v1.json` file
- **Problem:** Dispatcher registry references `contracts/events/security-scan-requested.v1.json` as `taskContract`, but this is an EVENT contract, not a TASK contract. All other routes reference TASK contracts.
- **Impact:** BREAKING — Security scan route uses wrong contract type. Dispatcher sends uniform 4-field payload, but event contract has 7+ fields with `payload.storage_url`.
- **Recommended options:**
  1. Create `contracts/tasks/security-scan-task.v1.json` with uniform 4-field pattern
  2. Update dispatcher registry to reference event contract (NOT RECOMMENDED — breaks pattern)
- **Your recommendation:** Create `contracts/tasks/security-scan-task.v1.json`
- **User decision required:** YES

### Gap-2: `security-scan-requested.v1.json` Has `storage_url` Security Risk

- **Gap ID:** G-2.2
- **Exact source:** `contracts/events/security-scan-requested.v1.json:36-39`
- **Problem:** `payload.storage_url` is required with `format: "uri"`. This would expose signed URLs in outbox events that travel through webhooks and dispatcher.
- **Impact:** SECURITY RISK — Signed URLs in transit could be intercepted. URLs have expiry, creating operational complexity.
- **Recommended options:**
  1. Remove `storage_url` from event contract; worker fetches document via `document_id` using server-side credentials
  2. Make `storage_url` optional with clear expiry documentation
- **Your recommendation:** Remove `storage_url` — worker should use `document_id` to fetch from private storage
- **User decision required:** YES

### Gap-3: Missing Phase 1 Trigger Event Contracts (Envelope Alignment)

- **Gap ID:** G-2.3
- **Exact source:** `G1-ENVELOPE-ALIGNMENT.md:16-18`, `contracts/events/resume-parse-requested.v1.json`
- **Problem:** Phase 1 trigger event contracts (`resume-parse-requested.v1.json`, `candidate-profile-changed.v1.json`, `job-ai-enrichment-requested.v1.json`) use flat draft-07 format, missing outbox envelope fields (`aggregate_type`, `event_type`, `payload`, `occurred_at`).
- **Impact:** INTEGRATION RISK — When 04-nestjs-api emits these events, format mismatch will cause dispatcher/worker issues.
- **Recommended options:**
  1. Create new versioned contracts with full envelope (e.g., `resume-parse-requested.v2.json`)
  2. Update existing contracts to full envelope format (BREAKING — need version bump)
- **Your recommendation:** Create v2 contracts with full envelope; keep v1 for backward compatibility during transition
- **User decision required:** YES

### Gap-4: `candidate-resume-parsed.v1.json` Missing

- **Gap ID:** G-2.4
- **Exact source:** FastAPI `task_handlers.py:279` emits `candidate.resume.parsed` event; no contract file exists
- **Problem:** Worker emits output event without shared contract. Downstream consumers cannot validate payload.
- **Impact:** RELIABILITY RISK — No schema validation for chained output events.
- **Recommended options:**
  1. Create `contracts/events/candidate-resume-parsed.v1.json` with full envelope
  2. Add `_draft_note` indicating worker-emitted, pending producer freeze
- **Your recommendation:** Create contract — FastAPI code already defines the fields
- **User decision required:** YES

### Gap-5: `security_scan_result` JSONB Schema Missing

- **Gap ID:** G-2.5
- **Exact source:** `06_documents.sql:85` — `security_scan_result JSONB`; no schema definition
- **Problem:** `uploaded_documents.security_scan_result` column has no documented JSONB shape. Different scanners could write different formats.
- **Impact:** INTEROPERABILITY RISK — Scanner output format undefined.
- **Recommended options:**
  1. Create `contracts/schemas/security-scan-result.v1.json`
  2. Document shape in `06_documents_Explanation.md`
- **Your recommendation:** Create JSON schema contract
- **User decision required:** YES

### Gap-6: JSON Schema Draft Version Inconsistency

- **Gap ID:** G-2.6
- **Exact source:** Multiple contract files
- **Problem:** Mixed JSON Schema versions:
  - `security-scan-requested.v1.json`: `draft/2020-12/schema`
  - `match-analyze-task.v1.json`: `draft/2020-12/schema`
  - `interview-summary-task.v1.json`: `draft/2020-12/schema`
  - `job-screening-questions-task.v1.json`: `draft/2020-12/schema`
  - `application-submitted.v1.json`: `draft/2020-12/schema`
  - `resume-parse-requested.v1.json`: `draft-07/schema#`
  - `resume-parse-task.v1.json`: `draft-07/schema#`
  - `candidate-projection-task.v1.json`: `draft-07/schema#`
  - `job-enrich-task.v1.json`: `draft-07/schema#`
  - `candidate-profile-changed.v1.json`: `draft-07/schema#`
  - `job-ai-enrichment-requested.v1.json`: `draft-07/schema#`
- **Impact:** LOW — Both drafts work, but inconsistency makes tooling harder.
- **Recommended options:**
  1. Standardize on `draft/2020-12/schema` (newer, recommended)
  2. Standardize on `draft-07/schema` (more tooling support)
- **Your recommendation:** Standardize on `draft/2020-12/schema` for new contracts
- **User decision required:** YES

### Gap-7: `security-scan-queue` Provisioning Missing

- **Gap ID:** G-2.7
- **Exact source:** `06-google-cloud-tasks-queue/` — only `projection-queue.json` exists
- **Problem:** No `security-scan-queue.json` provisioning artifact for the security scan queue.
- **Impact:** DEPLOYMENT RISK — Queue won't exist when dispatcher tries to route security scan tasks.
- **Recommended options:**
  1. Create `06-google-cloud-tasks-queue/security-scan-queue.json`
  2. Create deployment script or add to existing `deploy-queue.sh`
- **Your recommendation:** Create provisioning artifact with same pattern as `projection-queue.json`
- **User decision required:** YES

### Gap-8: `candidate.projection.rebuilt` Route in Phase 2 (Wrong)

- **Gap ID:** G-2.8
- **Exact source:** `event-route.registry.ts:85-89`
- **Problem:** `candidate.projection.rebuilt` is registered as a Phase 2 route with `taskContract: 'contracts/events/candidate-projection-rebuilt.v1.json'`. This is a CHAINED OUTPUT event from FastAPI, not a trigger event from NestJS. It should not be in the dispatcher registry — FastAPI emits it, not NestJS.
- **Impact:** LOW — This route would never be triggered by the dispatcher since NestJS doesn't emit `candidate.projection.rebuilt`.
- **Recommended options:**
  1. Remove `candidate.projection.rebuilt` from dispatcher registry
  2. Move to a separate consumer routing table if needed
- **Your recommendation:** Remove from dispatcher registry
- **User decision required:** YES

---

## 5. Proposed Contract Changes

### REQUIRED

| Change | File | Rationale |
|---|---|---|
| Create `contracts/tasks/security-scan-task.v1.json` | NEW FILE | Dispatcher needs TASK contract, not EVENT contract |
| Remove `storage_url` from `security-scan-requested.v1.json` payload | EXISTING FILE | Security risk — signed URLs in transit |
| Create `contracts/events/candidate-resume-parsed.v1.json` | NEW FILE | Worker emits this event; no contract exists |
| Create `contracts/schemas/security-scan-result.v1.json` | NEW FILE | `uploaded_documents.security_scan_result` JSONB shape undefined |
| Create `06-google-cloud-tasks-queue/security-scan-queue.json` | NEW FILE | Queue provisioning artifact missing |

### OPTIONAL

| Change | File | Rationale |
|---|---|---|
| Standardize JSON Schema to `draft/2020-12/schema` | ALL CONTRACTS | Consistency; low priority |
| Create v2 Phase 1 trigger event contracts with full envelope | NEW FILES | G-1(b) alignment; can wait for producer freeze |

### NOT RECOMMENDED

| Change | File | Rationale |
|---|---|---|
| Reference event contract as task contract in dispatcher | `event-route.registry.ts` | Breaks uniform payload pattern |
| Add `storage_url` to task payload | `security-scan-task.v1.json` | Violates "worker reads from DB" principle |

### NEEDS USER DECISION

| Change | File | Rationale |
|---|---|---|
| Remove `candidate.projection.rebuilt` from dispatcher registry | `event-route.registry.ts` | Chained output event, not trigger |
| Phase 1 trigger event envelope alignment approach | `contracts/events/` | v2 vs update-in-place decision |

---

## 6. Security and PII Review

| Issue | Severity | Evidence | Recommendation |
|---|---|---|---|
| `storage_url` in event contract exposes signed URLs | HIGH | `security-scan-requested.v1.json:36-39` | Remove from contract; worker uses `document_id` + server-side credentials |
| `payload.storage_url` format allows external URLs | MEDIUM | `format: "uri"` could allow non-GCS URLs | Restrict to internal storage paths or remove |
| Task payload has no PII fields | LOW | All task contracts have only UUIDs | ✅ CORRECT |
| Event `payload` not validated by dispatcher | LOW | `payload.builder.ts:10` — dispatcher never reads payload | ✅ CORRECT |
| Webhook body travels network | LOW | `security-scan-requested.v1.json` payload sent via webhook | Acceptable — body ignored by dispatcher |

---

## 7. Dispatcher/Worker Compatibility Review

| Check | Evidence | Result |
|---|---|---|
| Dispatcher sends uniform 4-field payload | `payload.builder.ts:19-26` | ✅ COMPATIBLE |
| Worker validates 4-field payload | `tasks.py:8-53` — all Pydantic models have same 4 fields | ✅ COMPATIBLE |
| Security scan route references wrong contract | `event-route.registry.ts:82` | ❌ INCOMPATIBLE |
| Worker has no security scan handler | `task_handlers.py` — no `/internal/tasks/security/scan` endpoint | ❌ NOT IMPLEMENTED |
| Task contract `aggregate_id` semantics match | `AGGREGATE-ID-SEMANTICS.md:27` — `uploaded_document UUID` | ✅ CORRECT |

---

## 8. Required Changes Before Contract Freeze

1. **CREATE** `contracts/tasks/security-scan-task.v1.json` with uniform 4-field pattern
2. **UPDATE** `event-route.registry.ts:82` to reference `contracts/tasks/security-scan-task.v1.json`
3. **REMOVE** `storage_url` from `security-scan-requested.v1.json` or make it optional
4. **CREATE** `contracts/events/candidate-resume-parsed.v1.json` with full envelope
5. **CREATE** `contracts/schemas/security-scan-result.v1.json` for `uploaded_documents.security_scan_result` JSONB
6. **CREATE** `06-google-cloud-tasks-queue/security-scan-queue.json` provisioning artifact
7. **DECIDE** JSON Schema draft convention (recommend `draft/2020-12/schema`)
8. **DECIDE** Phase 1 trigger event envelope alignment approach

---

## 9. Final Recommendation

**Stage 2 contract freeze CANNOT proceed until:**

1. `security-scan-task.v1.json` is created and dispatcher registry is updated
2. `storage_url` security concern is resolved
3. `candidate-resume-parsed.v1.json` is created
4. `security-scan-queue.json` provisioning artifact is created

**Stage 2 contract freeze CAN proceed with:**
- Mixed JSON Schema drafts (document convention for future)
- Phase 1 trigger event alignment deferred to producer freeze
- `security_scan_result` schema deferred (worker implementation)

**Is it safe to edit actual contract files?**
YES — but only after user approves the changes listed above. Current contracts are DRAFT and can be modified without breaking production (no production deployment yet).

---

**Status:** `RESOLVED — INDEPENDENT CONTRACT AUDIT COMPLETE`
