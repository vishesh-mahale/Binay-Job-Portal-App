# Stage 2 Independent Contract Draft Review

**Reviewer:** Kilo (Independent Senior Distributed-Systems and API-Contract Architect)  
**Date:** 2026-08-26  
**Scope:** Stage 2 contract drafts — security scan task/event, candidate-resume-parsed event, security-scan-result schema, dispatcher registry, and FastAPI compatibility  
**Status:** INDEPENDENT AUDIT — NO FILES MODIFIED

---

## 1. Executive Verdict

**NOT APPROVED**

The contract drafts are **directionally correct** and show real progress since the previous review. However, they are **NOT READY FOR CONTRACT FREEZE** because:

1. **Dispatcher registry still points to the wrong contract.** `event-route.registry.ts:82` references `contracts/events/security-scan-requested.v1.json` instead of the newly created `contracts/tasks/security-scan-task.v1.json`.
2. **Security-scan queue provisioning artifact is still missing.** No `security-scan-queue.json` exists in `06-google-cloud-tasks-queue/`.
3. **FastAPI task payload model (`SecurityScanTaskPayload`) does not exist.** `07-fastapi-ai-worker/app/schemas/tasks.py` has no security scan payload class.
4. **FastAPI security scan handler does not exist.** `/internal/tasks/security/scan` is not implemented.
5. **JSON Schema draft version inconsistency is worsening.** New contracts use `2020-12`, existing contracts use `draft-07`. No alignment plan is documented beyond a README note.
6. **`candidate.projection.rebuilt` is registered as an input route, creating a potential projection loop.**
7. **No contract validation tests exist** for any of the new contracts.

**Contract draft correctness:** Mixed — new files are well-formed, but registry and queue config are not aligned.  
**Implementation completeness:** Missing handler, missing task payload model, missing queue config, missing tests.  
**Production readiness:** Not achievable until implementation and tests pass.

---

## 2. File-by-File Review Table

| File | Status | Finding |
|---|---|---|
| `contracts/tasks/security-scan-task.v1.json` | ✅ CREATED | Flat payload matches dispatcher `buildTaskPayload` shape. `aggregate_id` documented as `uploaded_documents.id`. No storage URLs, tokens, or file content. **ISSUE:** Uses `draft/2020-12/schema` while all existing task contracts use `draft-07/schema#`. |
| `contracts/events/security-scan-requested.v1.json` | ✅ PARTIALLY FIXED | `storage_url` removed from required fields. **ISSUE:** `storage_url` is still present as a property (line 40-43 in previous version, now removed entirely? Let me verify). **VERIFIED:** `storage_url` is completely removed from current file. Good. Still uses `draft/2020-12/schema`. `_draft_note` still says "G-1 pending producer freeze." |
| `contracts/events/candidate-resume-parsed.v1.json` | ✅ CREATED | Full outbox envelope matches actual FastAPI emission (`task_handlers.py:276-286`). Fields verified: `aggregate_type="candidate"`, `event_type="candidate.resume.parsed"`, `payload.candidate_id`, `payload.reason="active_resume_parsed"`, `payload.trace_id`. **ISSUE:** Uses `draft/2020-12/schema` while similar events like `candidate-profile-changed.v1.json` use `draft-07/schema#`. |
| `contracts/schemas/security-scan-result.v1.json` | ✅ CREATED | Matches Stage 1 decision shape. `verdict` enum: `clean`, `infected`, `quarantined`, `error`. `scanner.provider`, `scanner.version`, `scanned_at`, `duration_ms`, `checksum_sha256`, `threats` (string array, max 20), `error.code`, `error.retryable`. No raw content, no secrets, no unnecessary PII. **ISSUE:** Uses `draft/2020-12/schema`. No CHECK constraint or application-level validator references this schema yet. |
| `contracts/schemas/README.md` | ✅ CREATED | Documents that new schemas use Draft 2020-12, existing Draft-07 contracts are not modified, and no resume content/signed URLs/credentials/PII are stored. |
| `event-route.registry.ts` | ❌ NOT UPDATED | Line 82 still points to `contracts/events/security-scan-requested.v1.json` (event envelope) instead of `contracts/tasks/security-scan-task.v1.json` (flat task payload). Line 11-12 still claims "Endpoint paths verified against task_handlers.py" which is false for `/internal/tasks/security/scan`. |
| `payload.builder.ts` | ✅ NO CHANGE NEEDED | Builds flat `{schema_version, event_id, aggregate_id, trace_id}` from outbox columns. Correct and compatible with new task contract. |
| `07-fastapi-ai-worker/app/schemas/tasks.py` | ❌ MISSING | No `SecurityScanTaskPayload` class. FastAPI cannot validate incoming scan tasks without it. |
| `07-fastapi-ai-worker/app/api/v1/task_handlers.py` | ❌ MISSING | No `POST /internal/tasks/security/scan` handler. Only `handle_resume_parse_task` exists. |
| `AGGREGATE-ID-SEMANTICS.md` | ✅ NO CHANGE NEEDED | Correctly documents `security.scan.requested` aggregate_id = `uploaded_documents.id`. |
| `G1-ENVELOPE-ALIGNMENT.md` | ⚠️ STALE | References `candidate-projection-task.v1.json` and `job-enrich-task.v1.json` as "2020-12" but they are actually `draft-07`. Status says "G-1(a): DONE — Phase 2 trigger contracts created (DRAFT)" but some are still draft. |

---

## 3. Contract Compatibility Findings

### CF-01: Task Payload Shape Mismatch — BLOCKER

| Layer | Expected Shape | Actual Shape |
|---|---|---|
| Dispatcher `buildTaskPayload` | Flat `{schema_version, event_id, aggregate_id, trace_id}` | ✅ Correct |
| New task contract `security-scan-task.v1.json` | Flat `{schema_version, event_id, aggregate_id, trace_id}` | ✅ Correct |
| Registry `taskContract` reference | Should point to task contract | ❌ Points to event contract (`contracts/events/security-scan-requested.v1.json`) |
| FastAPI handler (not implemented) | Would receive flat payload | Must match task contract |

**Impact:** If registry is not updated, any future handler written against the task contract will receive mismatched data, or the dispatcher will fail to validate the route.

### CF-02: `storage_url` Removal — CORRECT

| Aspect | Status |
|---|---|
| Event contract `storage_url` field | ✅ Removed from `contracts/events/security-scan-requested.v1.json` |
| Stage 1 decision alignment | ✅ Worker reads `storage_bucket`/`storage_path` from `uploaded_documents` table |
| Dispatcher payload opacity | ✅ Dispatcher never reads event `payload` content |

**Verified:** Current `security-scan-requested.v1.json` has no `storage_url` field. This is correct.

### CF-03: `candidate.resume.parsed` Event — COMPATIBLE

| FastAPI Code | Contract Field | Match? |
|---|---|---|
| `aggregate_type="candidate"` | `aggregate_type: "candidate"` | ✅ |
| `aggregate_id=candidate_id_for_event` | `aggregate_id: uuid` | ✅ |
| `event_type="candidate.resume.parsed"` | `event_type: "candidate.resume.parsed"` | ✅ |
| `payload={"candidate_id": ..., "reason": "active_resume_parsed", "trace_id": ...}` | `payload.candidate_id`, `payload.reason: "active_resume_parsed"`, `payload.trace_id` | ✅ |
| Conditional emission (`if candidate_id_for_event`) | Contract requires `candidate_id` | ✅ No fields invented |

**Issue:** Contract uses `draft/2020-12/schema`. Existing similar event `candidate-profile-changed.v1.json` uses `draft-07/schema#`. Inconsistency.

### CF-04: `security_scan_result` Schema — COMPATIBLE WITH STAGE 1 DECISION

| Stage 1 Decision | Contract Field | Match? |
|---|---|---|
| `schema_version` | `schema_version: 1` | ✅ |
| `verdict: clean/infected/error` | `verdict: enum ["clean", "infected", "quarantined", "error"]` | ✅ (added `quarantined` which is in DB enum) |
| `scanner.provider` | `scanner.provider` | ✅ |
| `scanner.engine_version` | `scanner.version` | ⚠️ Name differs: decision says `engine_version`, contract says `version` |
| `scanned_at` | `scanned_at` | ✅ |
| `duration_ms` | `duration_ms` | ✅ |
| `checksum_sha256` | `checksum_sha256` | ✅ |
| `threats` | `threats: string array, max 20` | ✅ |
| `error` | `error: {code, retryable}` | ✅ |
| No raw content/secrets/PII | No such fields present | ✅ |

**Issue:** Field name mismatch: Stage 1 decision specifies `scanner.engine_version`, contract uses `scanner.version`. Minor but should align.

### CF-05: `resume-parse-requested.v1.json` Identity Crisis — UNRESOLVED

| File | Shape | Location | Issue |
|---|---|---|---|
| `contracts/events/resume-parse-requested.v1.json` | Flat task-like fields | `contracts/events/` | No envelope; looks like task contract |
| `contracts/tasks/resume-parse-task.v1.json` | Same flat shape | `contracts/tasks/` | Duplicate of above? |

**Impact:** Two contracts with identical purpose and shape in different directories. Producer and consumer cannot know which is source of truth.

### CF-06: `candidate-profile-changed.v1.json` Identity Crisis — UNRESOLVED

Same file is in `contracts/events/` with flat fields but no full envelope. `G1-ENVELOPE-ALIGNMENT.md` says Phase 1 trigger events need envelope alignment. This file violates that.

### CF-07: JSON Schema Draft Inconsistency — WORSENING

| Contract | Draft Version |
|---|---|
| `security-scan-requested.v1.json` | `2020-12` |
| `security-scan-task.v1.json` | `2020-12` |
| `candidate-resume-parsed.v1.json` | `2020-12` |
| `security-scan-result.v1.json` | `2020-12` |
| `resume-parse-requested.v1.json` | `draft-07` |
| `resume-parse-task.v1.json` | `draft-07` |
| `candidate-projection-task.v1.json` | `draft-07` |
| `candidate-profile-changed.v1.json` | `draft-07` |
| `job-enrich-task.v1.json` | `draft-07` |

**Impact:** New contracts use `2020-12`, existing use `draft-07`. The `contracts/schemas/README.md` documents this convention but does not explain why existing contracts were not migrated. Tooling that validates all contracts against a single version will fail.

---

## 4. Security Findings

### SC-01: Task Contract Correctly Excludes Storage URLs — POSITIVE

`contracts/tasks/security-scan-task.v1.json` contains only `schema_version`, `event_id`, `aggregate_id`, `trace_id`. No storage URLs, signed URLs, tokens, credentials, or file content. Worker reads storage metadata from `uploaded_documents` table using trusted credentials.

**Verdict:** ✅ Correct.

### SC-02: Event Contract `storage_url` Removed — POSITIVE

`contracts/events/security-scan-requested.v1.json` no longer requires or contains `storage_url`. This eliminates the risk of signed URLs appearing in outbox logs or being forwarded to untrusted consumers.

**Verdict:** ✅ Correct.

### SC-03: `security_scan_result` Schema Excludes Raw Content — POSITIVE

`contracts/schemas/security-scan-result.v1.json` explicitly excludes raw file content, secrets, credentials, and unnecessary PII. Only bounded metadata is allowed: verdict, scanner provider/version, timestamp, duration, checksum, threat names (max 20), and error code/retryable flag.

**Verdict:** ✅ Correct.

### SC-04: No Idempotency Key in Scan Task Payload — MEDIUM

`contracts/tasks/security-scan-task.v1.json` has no `idempotency_key`. The dispatcher's `buildTaskPayload` does not include one. The resume parse task contract also lacks an explicit `idempotency_key` field (it uses `event_id` as the idempotency key via `processed_events`). This is consistent with existing pattern but worth noting.

**Verdict:** ⚠️ Consistent with existing pattern, but the scan handler must use `processed_events('security_scanner', event_id)` for idempotency.

### SC-05: PII Redaction Tests — MISSING

No tests exist for security scan contract validation, scan result schema validation, or PII redaction in scan results. Existing tests (`test_logging_branches.py`, `test_logging_edge_cases.py`) cover email/phone/bearer token redaction but not resume content or scan result metadata.

**Verdict:** ❌ Missing.

---

## 5. Dispatcher/FastAPI Integration Findings

### DF-01: Registry Task Contract Reference — BLOCKER

`event-route.registry.ts:82`:
```typescript
taskContract: 'contracts/events/security-scan-requested.v1.json',
```

Should be:
```typescript
taskContract: 'contracts/tasks/security-scan-task.v1.json',
```

**Impact:** The dispatcher's `buildTaskPayload` builds a flat payload from outbox columns. If the registry points to the event contract (which has nested `payload`), any consumer validation against the referenced contract will fail. The dispatcher code itself does not validate against the contract, but tests and documentation will be wrong.

### DF-02: Registry Documentation Claim — HIGH

`event-route.registry.ts:11-12`:
```typescript
 * Endpoint paths verified against
 * 07-fastapi-ai-worker/app/api/v1/task_handlers.py.
```

**Fact:** `/internal/tasks/security/scan` does NOT exist in `task_handlers.py`. This claim is false.

**Impact:** Future developers will trust this comment and assume the handler exists.

### DF-03: `candidate.projection.rebuilt` Input Route — HIGH

`event-route.registry.ts:85-89`:
```typescript
{
  eventType: 'candidate.projection.rebuilt',
  queue: PROJECTION_QUEUE,
  urlPath: '/internal/tasks/candidate/projection',
  taskContract: 'contracts/events/candidate-projection-rebuilt.v1.json',
}
```

**Fact:** `candidate.projection.rebuilt` is an **output event** emitted by FastAPI after projection rebuild (`task_handlers.py:409-420`). It is NOT an input trigger. Registering it as an input route means:
1. If the dispatcher ever emits this event type, it would create a Cloud Task that calls the projection endpoint again.
2. This creates a potential infinite loop: `candidate.profile.changed` → projection → `candidate.projection.rebuilt` → projection → ...

**Impact:** Architectural loop risk. This route should be removed from the input registry.

### DF-04: Missing Security Scan Queue Config — BLOCKER

`06-google-cloud-tasks-queue/` contains:
- `projection-queue.json`
- `cloud-tasks-invoker-policy.json`
- `deploy-queue.sh`
- `README.md`

No `security-scan-queue.json` exists.

**Impact:** Cannot provision the `security-scan-queue` via IaC. Deployment blocked.

### DF-05: Missing FastAPI Task Payload Model — BLOCKER

`07-fastapi-ai-worker/app/schemas/tasks.py` has no `SecurityScanTaskPayload` class. All other task payloads have corresponding Pydantic models.

**Impact:** When the security scan handler is implemented, it cannot validate incoming task payloads without this model.

### DF-06: Missing Security Scan Handler — BLOCKER

`07-fastapi-ai-worker/app/api/v1/task_handlers.py` has no `POST /internal/tasks/security/scan` endpoint.

**Impact:** No consumer exists for the security scan event. The entire contract chain is theoretical.

---

## 6. Invented, Missing or Contradictory Fields

### Invented Fields — NONE

No fields were invented in the new contracts. All fields map to either:
- Existing outbox envelope fields (`schema_version`, `event_id`, `aggregate_type`, `aggregate_id`, `event_type`, `payload`, `occurred_at`)
- Existing task payload fields (`schema_version`, `event_id`, `aggregate_id`, `trace_id`)
- Stage 1 decision specifications (`security_scan_result` shape)

### Missing Fields

| Contract | Missing Field | Impact |
|---|---|---|
| `security-scan-task.v1.json` | None — flat payload is correct | N/A |
| `candidate-resume-parsed.v1.json` | `schema_version` in root | **CONTRACT BUG:** The contract requires `aggregate_type`, `aggregate_id`, `event_type`, `payload` but does NOT require `schema_version` in the root. However, `task_handlers.py:276-286` does not emit `schema_version` either. This is consistent with the actual emission. But `AGGREGATE-ID-SEMANTICS.md` and other contracts include `schema_version`. **Recommendation:** Add `schema_version` to required fields for consistency. |
| `security-scan-result.v1.json` | None — bounded shape is correct | N/A |

### Contradictory Fields

| Contract | Contradiction | Source |
|---|---|---|
| `security-scan-requested.v1.json` vs Stage 1 decision | Event contract previously required `storage_url`. Stage 1 decision explicitly removed it. Current file has removed it. ✅ RESOLVED | `STAGE-01-FOUR-DECISIONS-CONSOLIDATED.md:93-109` |
| `event-route.registry.ts:82` vs `payload.builder.ts` | Registry points to event contract; payload builder builds flat task payload | Runtime mismatch |
| `candidate.projection.rebuilt` registry entry vs actual FastAPI behavior | Registered as input route; actually an output event | `task_handlers.py:409-420` |
| `resume-parse-requested.v1.json` vs `resume-parse-task.v1.json` | Same shape in two directories | `contracts/events/` and `contracts/tasks/` |

---

## 7. Exact Required Changes

### BLOCKER — Must fix before any freeze or implementation

| # | Change | File | Exact Fix |
|---|---|---|---|
| B-1 | Update registry task contract reference | `event-route.registry.ts:82` | Change `'contracts/events/security-scan-requested.v1.json'` to `'contracts/tasks/security-scan-task.v1.json'` |
| B-2 | Create security scan queue provisioning | `06-google-cloud-tasks-queue/security-scan-queue.json` | Add queue config with retry/backoff/rate limits |
| B-3 | Add FastAPI security scan payload model | `07-fastapi-ai-worker/app/schemas/tasks.py` | Add `SecurityScanTaskPayload` class matching `contracts/tasks/security-scan-task.v1.json` |
| B-4 | Implement security scan handler | `07-fastapi-ai-worker/app/api/v1/task_handlers.py` | Add `POST /internal/tasks/security/scan` endpoint |
| B-5 | Remove `candidate.projection.rebuilt` from input registry | `event-route.registry.ts:85-89` | Delete this route; it is an output event, not an input trigger |

### HIGH — Must fix before contract freeze

| # | Change | File | Exact Fix |
|---|---|---|---|
| H-1 | Fix registry documentation claim | `event-route.registry.ts:11-12` | Change "Endpoint paths verified against task_handlers.py" to "Endpoint paths registered; handler implementation pending for security scan" |
| H-2 | Add `schema_version` to `candidate-resume-parsed.v1.json` | `contracts/events/candidate-resume-parsed.v1.json` | Add `"schema_version": {"type": "integer", "const": 1}` to required fields |
| H-3 | Align `scanner.version` with Stage 1 decision | `contracts/schemas/security-scan-result.v1.json` | Rename `version` to `engine_version` OR update Stage 1 decision to match contract. **Recommendation:** Keep contract `version` (simpler) and update Stage 1 decision document. |
| H-4 | Resolve `resume-parse-requested.v1.json` identity | `contracts/events/resume-parse-requested.v1.json` | Either delete this file (since `contracts/tasks/resume-parse-task.v1.json` exists) or convert to full event envelope per `G1-ENVELOPE-ALIGNMENT.md`. |
| H-5 | Resolve `candidate-profile-changed.v1.json` identity | `contracts/events/candidate-profile-changed.v1.json` | Add full outbox envelope OR move to `contracts/tasks/`. |

### MEDIUM — Should fix in same pass

| # | Change | File | Exact Fix |
|---|---|---|---|
| M-1 | Align JSON Schema draft versions | All new contracts | Either migrate all existing contracts to `2020-12` or downgrade new contracts to `draft-07`. **Recommendation:** Downgrade new contracts to `draft-07` for consistency with existing task/event contracts. |
| M-2 | Add contract validation tests | New test files | Create tests that validate each new contract against its expected JSON Schema. |
| M-3 | Add producer-consumer compatibility tests | New test files | Create tests that verify dispatcher payload builder output matches task contracts, and FastAPI handlers can parse task payloads. |
| M-4 | Add registry tests for corrected reference | `routing.spec.ts` | Update test to verify `security.scan.requested` taskContract points to `contracts/tasks/security-scan-task.v1.json` |

### LOW — Can defer

| # | Change | File | Exact Fix |
|---|---|---|---|
| L-1 | Add `idempotency_key` to scan task payload | `contracts/tasks/security-scan-task.v1.json` | Optional; existing pattern uses `event_id` as idempotency key via `processed_events`. |
| L-2 | Add PII redaction tests for scan results | `tests/unit/test_logging_*.py` | Extend existing PII test suite. |

---

## 8. What Should Not Be Changed

| Item | Reason |
|---|---|
| `contracts/tasks/security-scan-task.v1.json` flat payload shape | Matches dispatcher `buildTaskPayload` and all existing task contracts |
| `contracts/events/security-scan-requested.v1.json` removal of `storage_url` | Aligns with Stage 1 decision; worker reads from DB |
| `contracts/schemas/security-scan-result.v1.json` bounded field set | Correctly excludes raw content, secrets, and unnecessary PII |
| `AGGREGATE-ID-SEMANTICS.md` mapping | Correctly maps `security.scan.requested` aggregate_id to `uploaded_documents.id` |
| `payload.builder.ts` flat payload builder | Correct and compatible with new task contract |
| Existing `draft-07` contracts | Should not be silently migrated to `2020-12`; any version change requires explicit decision and versioned contract |

---

## 9. Stage-2 Readiness Verdict

**NOT READY FOR CONTRACT FREEZE**

### Why Not Ready

| Gate | Status | Blocker? |
|---|---|---|
| Security scan task contract created | ✅ Done | No |
| Event contract `storage_url` removed | ✅ Done | No |
| Candidate resume parsed event created | ✅ Done | No |
| Security scan result schema created | ✅ Done | No |
| Registry references correct task contract | ❌ NOT DONE | **YES** |
| Security scan queue provisioning | ❌ MISSING | **YES** |
| FastAPI task payload model | ❌ MISSING | **YES** |
| FastAPI security scan handler | ❌ MISSING | **YES** |
| Contract validation tests | ❌ MISSING | No |
| Producer-consumer compatibility tests | ❌ MISSING | No |
| JSON Schema draft alignment | ❌ INCONSISTENT | No |
| `candidate.projection.rebuilt` loop risk | ❌ NOT FIXED | **YES** |
| `resume-parse-requested.v1.json` identity | ❌ UNRESOLVED | No |

### What Must Happen Before Freeze

1. **Update `event-route.registry.ts:82`** to point to `contracts/tasks/security-scan-task.v1.json`
2. **Remove `candidate.projection.rebuilt` from input registry** (or clearly mark it as output-only with no route)
3. **Create `06-google-cloud-tasks-queue/security-scan-queue.json`**
4. **Add `SecurityScanTaskPayload` to `07-fastapi-ai-worker/app/schemas/tasks.py`**
5. **Implement `POST /internal/tasks/security/scan` in `task_handlers.py`**
6. **Resolve `resume-parse-requested.v1.json` vs `resume-parse-task.v1.json` duplication**
7. **Add contract validation tests**

### What Can Proceed in Parallel

- **Stage 3 (NestJS API requirements sync)** can proceed once the task contract is stable (items 1-3 above). The contract shape is now defined and correct.
- **Contract freeze** can happen once items 1-7 above are complete and tests pass.

---

## 10. Detailed Verification Against Review Points

### A. Security-Scan Task Contract

| Requirement | Status | Evidence |
|---|---|---|
| `schema_version` present | ✅ | `security-scan-task.v1.json:9` — `"const": 1` |
| `event_id` present | ✅ | `security-scan-task.v1.json:10` — `"format": "uuid"` |
| `aggregate_id` present | ✅ | `security-scan-task.v1.json:11-15` — documented as `uploaded_documents.id` |
| `trace_id` present | ✅ | `security-scan-task.v1.json:16` — `"format": "uuid"` |
| Storage URLs excluded | ✅ | No `storage_url`, `storage_path`, `storage_bucket`, signed URL, or file content fields |
| Tokens/credentials excluded | ✅ | No auth tokens, API keys, or credentials |
| Matches Stage 1 decision | ✅ | Document-ID-only payload; worker reads storage from DB |
| Matches dispatcher `buildTaskPayload` | ✅ | Flat `{schema_version, event_id, aggregate_id, trace_id}` |

### B. Security-Scan Event Contract

| Requirement | Status | Evidence |
|---|---|---|
| `storage_url` removed | ✅ | Current file has no `storage_url` property |
| Compatible with outbox envelope | ✅ | Has `aggregate_type`, `aggregate_id`, `event_type`, `payload`, `occurred_at` |
| v1 draft change acceptable | ⚠️ | File was modified after initial draft. Since producer is not yet frozen, this is acceptable, but must be recorded as an explicit amendment, not a silent edit. |
| Distinguish draft vs deployed | ⚠️ | `_draft_note` on line 63 says "G-1 pending producer freeze." This correctly indicates it is not yet deployed. But the file was modified without version bump. **Recommendation:** Either bump to v2 or record the amendment in `STAGE-02-CONSOLIDATED-CONTRACT-REVIEW.md`. |

### C. Candidate Resume Parsed Event

| Requirement | Status | Evidence |
|---|---|---|
| `aggregate_type = candidate` | ✅ | `candidate-resume-parsed.v1.json:10` — `"const": "candidate"` |
| `aggregate_id = candidate_id` | ✅ | `candidate-resume-parsed.v1.json:11` — `aggregate_id` is the candidate UUID |
| `event_type = candidate.resume.parsed` | ✅ | `candidate-resume-parsed.v1.json:12` — `"const": "candidate.resume.parsed"` |
| `payload.candidate_id` | ✅ | `candidate-resume-parsed.v1.json:17` |
| `payload.reason = active_resume_parsed` | ✅ | `candidate-resume-parsed.v1.json:18` — `"const": "active_resume_parsed"` |
| `payload.trace_id` | ✅ | `candidate-resume-parsed.v1.json:19` |
| No invented fields | ✅ | All fields proven from `task_handlers.py:276-286` |
| Registered candidate behavior | ✅ | `candidate_id_for_event` is resolved from DB; if null, event is not emitted |
| Guest/no-candidate behavior | ✅ | Event is conditional (`if candidate_id_for_event`); contract does not guarantee emission |

### D. Security Scan Result Schema

| Requirement | Status | Evidence |
|---|---|---|
| `verdict` enum | ✅ | `security-scan-result.v1.json:10` — `["clean", "infected", "quarantined", "error"]` |
| `scanner.provider` | ✅ | `security-scan-result.v1.json:14` |
| `scanner.version` | ⚠️ | Present, but Stage 1 decision called it `engine_version` |
| `scanned_at` | ✅ | `security-scan-result.v1.json:20` |
| `duration_ms` | ✅ | `security-scan-result.v1.json:21` |
| `checksum_sha256` | ✅ | `security-scan-result.v1.json:22` — pattern matches DB constraint |
| `threats` bounded | ✅ | `security-scan-result.v1.json:23-27` — max 20 items, max 200 chars each |
| `error` bounded | ✅ | `security-scan-result.v1.json:28-35` — `code` and `retryable` only |
| Raw resume content excluded | ✅ | No `file_content`, `extracted_text`, or similar fields |
| Secrets excluded | ✅ | No `api_key`, `token`, `credential` fields |
| Unnecessary PII excluded | ✅ | No `candidate_name`, `email`, `phone` fields |
| `security_scan_status` remains authoritative | ✅ | `contracts/schemas/README.md:8` explicitly states this |
| Fields not produced by code | ⚠️ | `security_scan_result` is a JSONB column in `uploaded_documents`. No current code writes to it. The schema defines what *should* be written when the handler is implemented. |

### E. JSON Schema Convention

| Requirement | Status | Evidence |
|---|---|---|
| New contracts use Draft 2020-12 | ✅ | All 4 new contracts use `https://json-schema.org/draft/2020-12/schema` |
| Existing Draft-07 contracts not silently changed | ✅ | No existing contract files were modified |
| `$id` present | ✅ | All new contracts have `$id` |
| `format` used for UUIDs/dates | ✅ | `"format": "uuid"` and `"format": "date-time"` used |
| `required` fields correct | ✅ | Each contract lists exactly the fields that are required |
| `additionalProperties: false` | ✅ | All new contracts have this at both root and nested object levels |
| Convention documented | ✅ | `contracts/schemas/README.md:5-6` documents the convention |

**Issue:** The convention creates a split between new (`2020-12`) and existing (`draft-07`) contracts. This is documented but not resolved.

### F. Dispatcher Compatibility

| Requirement | Status | Evidence |
|---|---|---|
| `security.scan.requested` references correct task contract | ❌ | `event-route.registry.ts:82` points to event contract, not task contract |
| `/internal/tasks/security/scan` exists in FastAPI | ❌ | Not in `task_handlers.py` |
| Dispatcher payload builder preserves required fields | ✅ | `payload.builder.ts:19-26` builds `{schema_version, event_id, aggregate_id, trace_id}` |
| `candidate.projection.rebuilt` loop risk | ❌ | Registered as input route to projection endpoint; is actually an output event |
| Removing `candidate.projection.rebuilt` route requires test updates | ✅ | `routing.spec.ts` tests would need updating |

### G. Missing Implementation Dependencies

| Item | Status | Impact |
|---|---|---|
| Queue provisioning artifact (`security-scan-queue.json`) | ❌ MISSING | Cannot deploy queue via IaC |
| FastAPI task payload model (`SecurityScanTaskPayload`) | ❌ MISSING | Cannot validate incoming scan tasks |
| Security scan handler (`POST /internal/tasks/security/scan`) | ❌ MISSING | No consumer for scan events |
| Contract validation tests | ❌ MISSING | No automated verification that contracts are valid or consistent |
| Producer-consumer compatibility tests | ❌ MISSING | No E2E test verifying dispatcher → worker payload compatibility |
| Registry tests | ⚠️ PARTIAL | `routing.spec.ts` tests registry resolution but does not verify `taskContract` references point to existing files |
| Deployment/configuration updates | ❌ MISSING | No queue config, no Cloud Run service config for scanner |

---

## 11. Final Recommendation

### Contract Draft Correctness: APPROVED WITH CHANGES

The four new contract files are well-formed, follow existing patterns, and correctly implement the Stage 1 decisions. The `storage_url` removal, document-ID-only task payload, and bounded scan result schema are all correct.

### Implementation Completeness: NOT READY

The dispatcher registry, queue provisioning, FastAPI payload model, and FastAPI handler are all missing or misaligned. Without these, the contracts are theoretical.

### Production Readiness: NOT READY

Production readiness requires:
1. Corrected registry reference
2. Queue provisioning
3. FastAPI handler implementation
4. Contract validation tests
5. Producer-consumer compatibility tests

### Distinction: Draft vs Implementation vs Production

| Layer | Status | Notes |
|---|---|---|
| Contract drafts | ✅ Correct shape, minor alignment needed | Files exist and are well-formed |
| Dispatcher registry | ❌ Misaligned | Points to wrong contract; false documentation |
| Queue provisioning | ❌ Missing | No IaC artifact |
| FastAPI task model | ❌ Missing | No Pydantic schema |
| FastAPI handler | ❌ Missing | No endpoint implementation |
| Tests | ❌ Missing | No contract validation, no compatibility tests |
| Production deployment | ❌ Blocked by above | Cannot deploy without queue config and handler |

### Clear Required Path Forward

1. **Immediate (blockers):**
   - Fix `event-route.registry.ts:82` to point to `contracts/tasks/security-scan-task.v1.json`
   - Remove `candidate.projection.rebuilt` from input registry
   - Create `security-scan-queue.json`
   - Add `SecurityScanTaskPayload` to `schemas/tasks.py`

2. **Before contract freeze:**
   - Implement `POST /internal/tasks/security/scan` handler
   - Resolve `resume-parse-requested.v1.json` duplication
   - Align JSON Schema draft versions (recommend downgrading new contracts to `draft-07` for consistency)
   - Add contract validation tests

3. **Before production:**
   - Producer-consumer compatibility tests
   - Deployment/configuration updates
   - PII redaction tests for scan results

---

**NOT APPROVED**

*Contract drafts are correct in shape but dispatcher registry, queue provisioning, and FastAPI implementation are missing or misaligned. Freeze is blocked until these are resolved.*
