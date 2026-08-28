# Stage 2 Independent Contract Draft Review

**Reviewer:** opencode (Independent Senior Distributed-Systems and API-Contract Reviewer)
**Date:** 2026-08-26
**Status:** INDEPENDENT AUDIT COMPLETE
**Authority:** Actual repository code, SQL, and contracts only

---

## 1. Executive Verdict

**APPROVED WITH CHANGES**

The new contract drafts are structurally correct and follow the established uniform task payload pattern. However, the dispatcher registry still references the wrong contract for the security scan route, the `candidate.projection.rebuilt` routing creates a potential projection loop, and several implementation dependencies remain missing.

---

## 2. File-by-File Review Table

| File | Schema Draft | Status | Findings |
|---|---|---|---|
| `contracts/tasks/security-scan-task.v1.json` | 2020-12 | ✅ CORRECT | Uniform 4-field pattern matches all other task contracts. `aggregate_id` correctly documented as `uploaded_documents.id`. No storage URLs, tokens, or credentials. |
| `contracts/events/security-scan-requested.v1.json` | 2020-12 | ⚠️ NEEDS FIX | `storage_url` removed from payload. But dispatcher registry STILL references this event contract instead of the new task contract (line 82). |
| `contracts/events/candidate-resume-parsed.v1.json` | 2020-12 | ⚠️ PARTIAL | Fields match FastAPI emission (lines 276-286). Missing `event_id`, `occurred_at` in required fields. Guest behavior correctly not guaranteed. |
| `contracts/schemas/security-scan-result.v1.json` | 2020-12 | ✅ CORRECT | Verdict enum covers all states. No raw content, secrets, or unnecessary PII. Schema version, scanner, timestamp, duration, checksum, threats, error all present. |
| `contracts/schemas/README.md` | N/A | ✅ CORRECT | Documents Draft 2020-12 convention, no-silent-edit rule, and `security_scan_status` as authoritative state. |
| `05-outbox-dispatcher-nestjs/src/routing/event-route.registry.ts` | N/A | ❌ BLOCKER | Line 82: `taskContract: 'contracts/events/security-scan-requested.v1.json'` — MUST reference `contracts/tasks/security-scan-task.v1.json`. Line 85-89: `candidate.projection.rebuilt` route creates projection loop risk. |
| `05-outbox-dispatcher-nestjs/src/routing/payload.builder.ts` | N/A | ✅ CORRECT | Builds uniform 4-field payload from outbox row. Never reads `payload` content. Compatible with all task contracts. |
| `07-fastapi-ai-worker/app/schemas/tasks.py` | N/A | ❌ MISSING | No `SecurityScanTaskPayload` model. No security scan handler in `task_handlers.py`. |
| `07-fastapi-ai-worker/app/api/v1/task_handlers.py` | N/A | ❌ MISSING | No `POST /internal/tasks/security/scan` endpoint. Worker cannot receive security scan tasks. |
| `contracts/AGGREGATE-ID-SEMANTICS.md` | N/A | ✅ CORRECT | Line 27: `security.scan.requested` → `uploaded_document` UUID. Line 35: `candidate.resume.parsed` → candidate UUID. Matches contract definitions. |
| `contracts/G1-ENVELOPE-ALIGNMENT.md` | N/A | ⚠️ STALE | Line 20-23 claims Phase 1 trigger contracts don't exist, but `resume-parse-requested.v1.json`, `candidate-profile-changed.v1.json`, `job-ai-enrichment-requested.v1.json` all exist. |

---

## 3. Contract Compatibility Findings

### A. Security-scan task contract

| Check | Evidence | Result |
|---|---|---|
| `schema_version` present and const 1 | `security-scan-task.v1.json:9` | ✅ CORRECT |
| `event_id` present as UUID | `security-scan-task.v1.json:10` | ✅ CORRECT |
| `aggregate_id` present as UUID | `security-scan-task.v1.json:11-14` | ✅ CORRECT |
| `trace_id` present as UUID | `security-scan-task.v1.json:16` | ✅ CORRECT |
| `aggregate_id` documented as `uploaded_documents.id` | `security-scan-task.v1.json:14` | ✅ CORRECT |
| No storage URLs, tokens, credentials | `security-scan-task.v1.json:18` — `additionalProperties: false` | ✅ CORRECT |
| Matches uniform task payload pattern | Same 4 fields as `resume-parse-task.v1.json`, `candidate-projection-task.v1.json`, etc. | ✅ CORRECT |
| Compatible with FastAPI lookup behavior | Worker would use `aggregate_id` to query `uploaded_documents` table | ✅ CORRECT |

### B. Security-scan event contract

| Check | Evidence | Result |
|---|---|---|
| `storage_url` removed | `security-scan-requested.v1.json:31-55` — payload only has `document_id`, `uploaded_by_user_id`, `guest_upload_session_id`, `trace_id` | ✅ CORRECT |
| Compatible with outbox envelope | Has `aggregate_type`, `aggregate_id`, `event_type`, `payload`, `occurred_at` | ✅ CORRECT |
| Draft amendment acceptable | No production deployment; `_draft_note` present | ✅ CORRECT |
| Draft vs released distinction | File has `_draft_note` indicating pending status | ✅ CORRECT |

### C. Candidate resume parsed event

| Check | Evidence | Result |
|---|---|---|
| `aggregate_type` = `candidate` | `candidate-resume-parsed.v1.json:10` | ✅ MATCHES FastAPI code line 277 |
| `aggregate_id` = candidate UUID | `candidate-resume-parsed.v1.json:11` | ✅ MATCHES FastAPI code line 278 |
| `event_type` = `candidate.resume.parsed` | `candidate-resume-parsed.v1.json:12` | ✅ MATCHES FastAPI code line 279 |
| `payload.candidate_id` | `candidate-resume-parsed.v1.json:17` | ✅ MATCHES FastAPI code line 281 |
| `payload.reason` = `active_resume_parsed` | `candidate-resume-parsed.v1.json:18` | ✅ MATCHES FastAPI code line 282 |
| `payload.trace_id` | `candidate-resume-parsed.v1.json:19` | ✅ MATCHES FastAPI code line 283 |
| No invented fields | All fields trace to `task_handlers.py:276-286` | ✅ CORRECT |
| Guest/no-candidate behavior | FastAPI code line 275: `if candidate_id_for_event:` — event only emitted when candidate exists | ✅ CORRECT |

**Missing from contract:**
- `event_id` (not in required) — FastAPI `emit_event` likely generates this
- `occurred_at` (not in required) — FastAPI `emit_event` likely generates this
- `schema_version` (not in required) — should be const 1

### D. Security scan result schema

| Check | Evidence | Result |
|---|---|---|
| `verdict` enum | `security-scan-result.v1.json:10` — `clean`, `infected`, `quarantined`, `error` | ✅ CORRECT |
| `scanner.provider` and `scanner.version` | `security-scan-result.v1.json:11-18` | ✅ CORRECT |
| `scanned_at` timestamp | `security-scan-result.v1.json:20` | ✅ CORRECT |
| `duration_ms` | `security-scan-result.v1.json:21` | ✅ CORRECT |
| `checksum_sha256` | `security-scan-result.v1.json:22` | ✅ CORRECT |
| `threats` bounded array | `security-scan-result.v1.json:23-26` — maxItems 20, maxLength 200 | ✅ CORRECT |
| `error` metadata | `security-scan-result.v1.json:27-34` — code, retryable | ✅ CORRECT |
| No raw resume content | Schema has no text/content fields | ✅ CORRECT |
| No secrets/credentials | Schema has no token/key fields | ✅ CORRECT |
| `security_scan_status` remains authoritative | `schemas/README.md:8` — explicitly documented | ✅ CORRECT |

**Fields not currently produced/consumed by code:**
- `duration_ms` — no scanner implementation exists
- `checksum_sha256` — no scanner implementation exists
- `threats` — no scanner implementation exists
- `error` — no scanner implementation exists

These are schema definitions for future implementation, not current code gaps.

### E. JSON Schema convention

| Check | Evidence | Result |
|---|---|---|
| New contracts use Draft 2020-12 | `security-scan-task.v1.json:2`, `candidate-resume-parsed.v1.json:2`, `security-scan-result.v1.json:2` | ✅ CORRECT |
| Existing Draft-07 contracts not changed | `resume-parse-requested.v1.json:2` still draft-07, `candidate-profile-changed.v1.json:2` still draft-07 | ✅ CORRECT |
| `$id` format consistent | New contracts use `https://binay-job-portal.internal/contracts/...` | ✅ CORRECT |
| `additionalProperties: false` on all | All new contracts have this | ✅ CORRECT |
| `required` fields present | All new contracts have required arrays | ✅ CORRECT |

### F. Dispatcher compatibility

| Check | Evidence | Result |
|---|---|---|
| Security route references correct task contract | `event-route.registry.ts:82` — references `contracts/events/security-scan-requested.v1.json` | ❌ BLOCKER — must reference `contracts/tasks/security-scan-task.v1.json` |
| `/internal/tasks/security/scan` exists in FastAPI | `task_handlers.py` — no such endpoint | ❌ NOT IMPLEMENTED |
| Payload builder preserves contract fields | `payload.builder.ts:19-26` — builds `{schema_version, event_id, aggregate_id, trace_id}` | ✅ CORRECT |
| `candidate.projection.rebuilt` routing | `event-route.registry.ts:85-89` — routes to same projection endpoint as `candidate.profile.changed` | ⚠️ LOOP RISK — FastAPI emits `candidate.projection.rebuilt` after projection, which would trigger another projection |

### G. Missing implementation dependencies

| Dependency | Status | Severity |
|---|---|---|
| `security-scan-queue` provisioning artifact | ❌ MISSING | HIGH |
| `SecurityScanTaskPayload` in FastAPI `schemas/tasks.py` | ❌ MISSING | HIGH |
| Security scan handler in `task_handlers.py` | ❌ MISSING | HIGH |
| Contract validation tests | ❌ MISSING | MEDIUM |
| Producer-consumer compatibility tests | ❌ MISSING | MEDIUM |
| Registry tests for new routes | ❌ MISSING | MEDIUM |
| Deployment/configuration updates | ❌ MISSING | LOW |

---

## 4. Security Findings

| Finding | Severity | Evidence | Recommendation |
|---|---|---|---|
| `storage_url` correctly removed from event contract | ✅ RESOLVED | `security-scan-requested.v1.json` no longer has `storage_url` | No action needed |
| Task contract has no PII fields | ✅ CORRECT | `security-scan-task.v1.json:18` — `additionalProperties: false` | No action needed |
| `guest_upload_session_id` in event contract could expose session token | LOW | `security-scan-requested.v1.json:46` | Consider hashing or removing (currently null for registered users) |
| Webhook body travels network | LOW | Event contract payload sent via Supabase webhook | Acceptable — body ignored by dispatcher |

---

## 5. Dispatcher/FastAPI Integration Findings

| Finding | Severity | Evidence | Required Action |
|---|---|---|---|
| Security route references event contract instead of task contract | BLOCKER | `event-route.registry.ts:82` | Update to `contracts/tasks/security-scan-task.v1.json` |
| `candidate.projection.rebuilt` route creates projection loop | HIGH | `event-route.registry.ts:85-89` — FastAPI emits this event (line 412), which would be routed back to the same projection handler | Remove from dispatcher registry or add loop prevention logic |
| No FastAPI security scan handler | HIGH | `task_handlers.py` — no `/internal/tasks/security/scan` endpoint | Implement handler or defer to Phase 2 |
| No `SecurityScanTaskPayload` Pydantic model | HIGH | `schemas/tasks.py` — only 6 models, no security scan | Add model matching contract |
| Payload builder compatible | ✅ CORRECT | `payload.builder.ts:19-26` — uniform 4-field output | No action needed |

---

## 6. Invented, Missing or Contradictory Fields

### Invented Fields

None found. All contract fields trace to actual code or database schema.

### Missing Fields

| Contract | Missing Field | Evidence | Impact |
|---|---|---|---|
| `candidate-resume-parsed.v1.json` | `event_id` in required | FastAPI `emit_event` likely generates this | LOW — dispatcher adds this |
| `candidate-resume-parsed.v1.json` | `occurred_at` in required | FastAPI `emit_event` likely generates this | LOW — dispatcher adds this |
| `candidate-resume-parsed.v1.json` | `schema_version` in required | Should be const 1 | LOW — can be added |

### Contradictory Fields

| Claim | Actual Evidence | Severity |
|---|---|---|
| G1-ENVELOPE-ALIGNMENT.md line 20-23: "Phase 1 trigger event contracts don't exist" | `resume-parse-requested.v1.json`, `candidate-profile-changed.v1.json`, `job-ai-enrichment-requested.v1.json` all exist in `contracts/events/` | MEDIUM — document is stale |

---

## 7. Exact Required Changes

### BLOCKER

1. **`event-route.registry.ts:82`**: Change `taskContract: 'contracts/events/security-scan-requested.v1.json'` to `taskContract: 'contracts/tasks/security-scan-task.v1.json'`

### HIGH

2. **`event-route.registry.ts:85-89`**: Remove `candidate.projection.rebuilt` route from dispatcher registry (it's a chained output event, not a trigger)
3. **`07-fastapi-ai-worker/app/schemas/tasks.py`**: Add `SecurityScanTaskPayload` model with same 4-field pattern
4. **`07-fastapi-ai-worker/app/api/v1/task_handlers.py`**: Add `POST /internal/tasks/security/scan` handler (or explicitly document as Phase 2)
5. **`06-google-cloud-tasks-queue/`**: Create `security-scan-queue.json` provisioning artifact

### MEDIUM

6. **`candidate-resume-parsed.v1.json`**: Add `event_id`, `occurred_at`, `schema_version` to required fields
7. **`contracts/G1-ENVELOPE-ALIGNMENT.md`**: Update line 20-23 to reflect that Phase 1 trigger contracts exist
8. **Contract validation tests**: Create tests validating contract schemas against dispatcher output and FastAPI input
9. **Producer-consumer compatibility tests**: Create tests for dispatcher → FastAPI contract compatibility

### LOW

10. **`security-scan-requested.v1.json:46`**: Consider hashing `guest_upload_session_id` or documenting security implications
11. **Registry comments**: Update "handler verified" claims to match actual code status

---

## 8. What Should Not Be Changed

1. **`contracts/tasks/security-scan-task.v1.json`** — contract draft is correct; do not add fields
2. **`contracts/schemas/security-scan-result.v1.json`** — schema is correct; do not add raw content fields
3. **`contracts/schemas/README.md`** — documentation is correct
4. **`payload.builder.ts`** — uniform payload generation is correct
5. **`AGGREGATE-ID-SEMANTICS.md`** — semantics are correct
6. **Existing Draft-07 contracts** — do not mass-edit; wait for producer freeze
7. **`security_scan_status`** — remains authoritative database state
8. **No PII/secrets in contracts** — maintain this discipline

---

## 9. Stage-2 Readiness Verdict

**NOT READY FOR CONTRACT FREEZE**

### Why Not Ready

1. Dispatcher registry has wrong contract reference for security scan route (BLOCKER)
2. `candidate.projection.rebuilt` routing creates projection loop risk (HIGH)
3. FastAPI has no security scan handler or Pydantic model (HIGH)
4. Queue provisioning artifact missing (HIGH)
5. Contract validation tests missing (MEDIUM)

### What Must Happen First

1. Fix dispatcher registry security route reference
2. Resolve `candidate.projection.rebuilt` routing intent
3. Decide: implement security scan handler now or defer to Phase 2
4. Create queue provisioning artifact
5. Add `SecurityScanTaskPayload` to FastAPI schemas

### What Can Proceed

- Contract draft correctness is verified
- Schema conventions are established
- Aggregate ID semantics are documented
- Security review is complete

---

## 10. Clear Distinctions

### Contract Draft Correctness

**CORRECT** — All new contract files (`security-scan-task.v1.json`, `candidate-resume-parsed.v1.json`, `security-scan-result.v1.json`) are structurally valid, follow the uniform pattern, and do not invent fields. The `storage_url` removal from the event contract is correct.

### Implementation Completeness

**INCOMPLETE** — FastAPI has no security scan handler, no `SecurityScanTaskPayload` model, and no queue provisioning artifact. The dispatcher registry has a wrong contract reference and a potential projection loop.

### Production Readiness

**NOT READY** — No contract validation tests, no producer-consumer compatibility tests, and the security scan flow is entirely unimplemented. These contracts are drafts until compatibility tests pass.

---

**Status:** `RESOLVED — INDEPENDENT CONTRACT DRAFT REVIEW COMPLETE`
