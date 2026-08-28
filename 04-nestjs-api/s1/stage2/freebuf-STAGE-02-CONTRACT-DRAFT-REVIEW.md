# Stage 2 Independent Contract Draft Review — FreeBuf

**Agent:** FreeBuf  
**Date:** 2026-08-26  
**Status:** APPROVED WITH CHANGES  

---

## 1. Executive Verdict

**APPROVED WITH CHANGES**

Contract drafts are **architecturally correct and well-designed**. 2 BLOCKERs, 3 HIGHs, and 4 MEDIUMs must be resolved before contract freeze. No invented fields detected. No production code was modified.

---

## 2. File-by-File Review Table

| # | File | Exists | Draft | Verdict | Key Issue |
|---|---|---|---|---|---|
| 1 | `contracts/events/security-scan-requested.v1.json` | ✅ | draft/2020-12 | ✅ CORRECT | `storage_url` removed from payload — correct per Decision B |
| 2 | `contracts/tasks/security-scan-task.v1.json` | ✅ | draft/2020-12 | ✅ CORRECT | Uniform 4-field pattern, `aggregate_id` = `uploaded_documents.id` |
| 3 | `contracts/events/candidate-resume-parsed.v1.json` | ✅ | draft/2020-12 | ⚠️ CONDITIONAL | Missing `event_id`, `occurred_at` in envelope; conditional emission not documented |
| 4 | `contracts/schemas/security-scan-result.v1.json` | ✅ | draft/2020-12 | ✅ CORRECT | Clean/infected/error verdicts, no raw content, no PII |
| 5 | `contracts/schemas/README.md` | ✅ | — | ✅ CORRECT | Convention documented, `security_scan_status` authoritative |
| 6 | `contracts/events/resume-parse-requested.v1.json` | ✅ | draft-07 | ⚠️ GAP | Flat task-like fields, missing envelope fields (`aggregate_type`, `event_type`, `payload`, `occurred_at`) |
| 7 | `contracts/events/candidate-projection-rebuilt.v1.json` | ✅ | draft-07 | ⚠️ RISK | Registered in dispatcher as input route — potential projection loop |
| 8 | `05-outbox-dispatcher-nestjs/src/routing/event-route.registry.ts` | ✅ | — | ⚠️ MISMATCH | Security route references event contract, not task contract |
| 9 | `05-outbox-dispatcher-nestjs/src/routing/payload.builder.ts` | ✅ | — | ✅ CORRECT | Uniform 4-field payload, never leaks outbox content |
| 10 | `07-fastapi-ai-worker/app/schemas/tasks.py` | ✅ | — | ⚠️ MISSING | No `SecurityScanTaskPayload` Pydantic model |
| 11 | `contracts/AGGREGATE-ID-SEMANTICS.md` | ✅ | — | ✅ CORRECT | All routes and chained events documented |
| 12 | `contracts/G1-ENVELOPE-ALIGNMENT.md` | ✅ | — | ⚠️ STALE | Says "Phase 1 trigger contracts don't exist" — they do |

---

## 3. Contract Compatibility Findings

### Section A: Security-scan task contract

| Check | Status | Evidence |
|---|---|---|
| `schema_version` present | ✅ | `security-scan-task.v1.json` L6: `"const": 1` |
| `event_id` present | ✅ | `security-scan-task.v1.json` L7: `"format": "uuid"` |
| `aggregate_id` present | ✅ | `security-scan-task.v1.json` L8-9: `"description": "uploaded_documents.id"` |
| `trace_id` present | ✅ | `security-scan-task.v1.json` L10: `"format": "uuid"` |
| `aggregate_id` = `uploaded_documents.id` | ✅ | Matches `AGGREGATE-ID-SEMANTICS.md` L30: `aggregate_type = uploaded_document` |
| Storage URLs excluded | ✅ | No `storage_url`, `bucket`, `path`, `token`, `credential` fields |
| Matches Stage-1 decisions | ✅ | Decision 2: "Task payload: document_id only" |
| Matches FastAPI lookup behavior | ✅ | `task_handlers.py` L141: queries DB by `document_id` |
| `additionalProperties: false` | ✅ | Rejects unexpected fields |

**Verdict: CORRECT — No changes needed.**

### Section B: Security-scan event contract

| Check | Status | Evidence |
|---|---|---|
| `storage_url` removed | ✅ | Current file has `required: ["document_id"]` only — `storage_url` NOT present |
| Still compatible with outbox envelope | ✅ | Has `aggregate_type`, `aggregate_id`, `event_type`, `payload`, `occurred_at` |
| Draft note documented | ✅ | `_draft_note`: "G-1 pending producer freeze" |
| Not yet released/deployed | ✅ | No NestJS producer exists; contract is draft |
| Breaking change acceptable | ✅ | v1 is draft, never deployed — amending v1 is correct |

**Verdict: CORRECT — `storage_url` already removed. No v2 needed.**

**NOTE:** The Codex consolidated review (line 28) says `storage_url` is still required. This is **INCORRECT** — the actual file at `contracts/events/security-scan-requested.v1.json` has `required: ["document_id"]` only. The Codex review was written before the file was updated.

### Section C: Candidate resume parsed event

| Check | Status | Evidence |
|---|---|---|
| `aggregate_type` = `candidate` | ✅ | Contract L9: `"const": "candidate"` |
| `aggregate_id` = candidate UUID | ✅ | Contract L10: `"format": "uuid"` |
| `event_type` = `candidate.resume.parsed` | ✅ | Contract L11: `"const": "candidate.resume.parsed"` |
| `payload.candidate_id` exists | ✅ | Contract L14: required |
| `payload.reason` = `active_resume_parsed` | ✅ | Contract L15: `"const": "active_resume_parsed"` |
| `payload.trace_id` exists | ✅ | Contract L16: required |
| Matches FastAPI emission code | ✅ | `task_handlers.py` L279-284: exact same 3 fields |
| No invented fields | ✅ | All 3 fields present in actual emission code |

**BLOCKER: Missing envelope fields**

| Field | Status | Impact |
|---|---|---|
| `event_id` | ❌ MISSING | Not in `required` or `properties` |
| `occurred_at` | ❌ MISSING | Not in `required` or `properties` |
| `schema_version` | ⚠️ OPTIONAL | In `properties` but not in `required` |

**Evidence:** All other event contracts (e.g., `security-scan-requested.v1.json`) include `event_id` and `occurred_at` as required fields. The `candidate-resume-parsed.v1.json` contract is missing these.

**Conditional emission not documented:** `task_handlers.py` L275 shows `if candidate_id_for_event:` — event is only emitted when `candidate_id` is resolved (registered candidate with active resume document). Guest/no-candidate uploads do NOT emit this event. Contract description says "emitted after a candidate resume parse completes successfully" — should clarify conditional nature.

**Verdict: NEEDS CHANGES — Add `event_id`, `occurred_at`, document conditional emission.**

### Section D: Security scan result schema

| Check | Status | Evidence |
|---|---|---|
| Verdict enum: clean/infected/quarantined/error | ✅ | Contract L9: `"enum": ["clean", "infected", "quarantined", "error"]` |
| Scanner provider/version | ✅ | Contract L10-17: `scanner.provider`, `scanner.version` |
| `scanned_at` timestamp | ✅ | Contract L18: `"format": "date-time"` |
| `duration_ms` | ✅ | Contract L19: `"minimum": 0` |
| `checksum_sha256` | ✅ | Contract L20: `"pattern": "^[A-Fa-f0-9]{64}$"` |
| `threats` array bounded | ✅ | Contract L21-22: `"maxItems": 20`, `"maxLength": 200` |
| `error` object bounded | ✅ | Contract L23-27: `code` + `retryable` only |
| Raw content excluded | ✅ | No `raw_text`, `file_content`, `resume_text` fields |
| Secrets excluded | ✅ | No `token`, `key`, `credential` fields |
| PII excluded | ✅ | No `name`, `email`, `phone` fields |
| `security_scan_status` authoritative | ✅ | `schemas/README.md`: "database का `security_scan_status` authoritative state रहेगा" |

**Verdict: CORRECT — No changes needed.**

### Section E: JSON Schema convention

| Check | Status | Evidence |
|---|---|---|
| New contracts use draft/2020-12 | ✅ | All 4 new files use `https://json-schema.org/draft/2020-12/schema` |
| Existing draft-07 not modified | ✅ | `resume-parse-requested.v1.json` still uses `draft-07` |
| `candidate-projection-rebuilt.v1.json` still draft-07 | ✅ | Not modified |
| Convention documented | ✅ | `schemas/README.md`: "नए schemas JSON Schema Draft 2020-12 में बनाए जाएंगे" |
| `$id` format consistent | ✅ | All use `https://binay-job-portal.internal/contracts/...` |
| `additionalProperties: false` on all | ✅ | All new contracts enforce this |

**Verdict: CORRECT — Convention properly applied.**

### Section F: Dispatcher compatibility

| Check | Status | Evidence | Severity |
|---|---|---|---|
| Security route references event contract | ⚠️ MISMATCH | `event-route.registry.ts` L82: `taskContract: 'contracts/events/security-scan-requested.v1.json'` | **BLOCKER** |
| `/internal/tasks/security/scan` exists in FastAPI | ❌ NO HANDLER | `code_search` found 0 matches in `task_handlers.py` | **BLOCKER** |
| Payload builder preserves contract fields | ✅ | `payload.builder.ts` L19-27: `{schema_version, event_id, aggregate_id, trace_id}` | NO ISSUE |
| `candidate.projection.rebuilt` loop risk | ⚠️ RISK | `event-route.registry.ts` L85-89: output event registered as input route | **HIGH** |
| Test expects security route task contract pattern | ❌ WOULD FAIL | `routing.spec.ts` L67: `expect(route.taskContract).toMatch(/^contracts\/tasks\/.+\.v1\.json$/)` | **HIGH** |

**Detailed `candidate.projection.rebuilt` loop analysis:**

```text
FastAPI handler receives candidate.profile.changed
  → processes projection
  → emits candidate.projection.rebuilt (task_handlers.py L412)
  → Dispatcher sees candidate.projection.rebuilt in registry
  → Routes to /internal/tasks/candidate/projection (same endpoint!)
  → FastAPI processes again
  → Emits candidate.projection.rebuilt again
  → INFINITE LOOP (until processed_events dedup kicks in)
```

**However:** Each emission creates a NEW `event_id`, so `processed_events.is_processed()` will NOT dedup (different event_id each time). The `processing_lease` guard would block concurrent re-processing, but after lease expires, the next event would process again.

**Recommendation:** Remove `candidate.projection.rebuilt` from dispatcher registry. It's a chained output event, not a trigger event. `candidate.profile.changed` is the only approved input for projection rebuild.

### Section G: Missing implementation dependencies

| # | Dependency | Status | Severity |
|---|---|---|---|
| 1 | `security-scan-queue` provisioning artifact | ❌ MISSING | **MEDIUM** |
| 2 | `SecurityScanTaskPayload` Pydantic model | ❌ MISSING | **HIGH** |
| 3 | `handle_security_scan_task` FastAPI handler | ❌ MISSING | **BLOCKER** |
| 4 | Contract validation tests (JSON Schema) | ❌ MISSING | **HIGH** |
| 5 | Producer-consumer compatibility tests | ❌ MISSING | **HIGH** |
| 6 | Registry tests for security route | ⚠️ PARTIAL | **MEDIUM** |
| 7 | Deployment/config for ClamAV | ❌ MISSING | **MEDIUM** |

---

## 4. Security Findings

| # | Finding | Status | Detail |
|---|---|---|---|
| 1 | No `storage_url` in task payload | ✅ SECURE | Handler queries DB for storage metadata |
| 2 | No `storage_url` in event payload | ✅ SECURE | Already removed from contract |
| 3 | No raw resume content in any contract | ✅ SECURE | All contracts exclude file content |
| 4 | No secrets/credentials in contracts | ✅ SECURE | No tokens, keys, or credentials |
| 5 | No PII in scan result schema | ✅ SECURE | Only scanner metadata and threat names |
| 6 | `additionalProperties: false` on all | ✅ SECURE | Rejects unexpected fields |
| 7 | `checksum_sha256` pattern validated | ✅ SECURE | Regex: `^[A-Fa-f0-9]{64}$` |
| 8 | `threats` array bounded (maxItems: 20) | ✅ SECURE | Prevents unbounded arrays |
| 9 | `error` object bounded | ✅ SECURE | Only `code` and `retryable` allowed |
| 10 | `security_scan_status` authoritative | ✅ SECURE | Schema is metadata, DB is source of truth |

---

## 5. Dispatcher/FastAPI Integration Findings

| # | Finding | Severity | Detail |
|---|---|---|---|
| 1 | Security route `taskContract` references event contract | **BLOCKER** | Must change to `contracts/tasks/security-scan-task.v1.json` |
| 2 | No FastAPI handler for `/internal/tasks/security/scan` | **BLOCKER** | Cloud Tasks will 404 |
| 3 | No `SecurityScanTaskPayload` in `app/schemas/tasks.py` | **HIGH** | Handler cannot validate incoming payload |
| 4 | `candidate.projection.rebuilt` registered as input route | **HIGH** | Potential projection rebuild loop |
| 5 | Test `routing.spec.ts` L67 would fail for security route | **HIGH** | Regex expects `contracts/tasks/` prefix |
| 6 | `buildTaskPayload()` produces correct 4-field shape | ✅ | Compatible with all task contracts |
| 7 | Pydantic `extra="forbid"` on all existing payloads | ✅ | Will reject unexpected fields |

---

## 6. Invented, Missing or Contradictory Fields

| # | Field/Claim | Status | Detail |
|---|---|---|---|
| 1 | `candidate-resume-parsed.v1.json` missing `event_id` | **MISSING** | All other event contracts include this |
| 2 | `candidate-resume-parsed.v1.json` missing `occurred_at` | **MISSING** | All other event contracts include this |
| 3 | `candidate-resume-parsed.v1.json` conditional emission undocumented | **CONTRADICTION** | Contract says "emitted after parse completes" but code only emits when `candidate_id` resolved |
| 4 | `security-scan-requested.v1.json` `storage_url` | **RESOLVED** | Already removed — Codex review was stale |
| 5 | No invented fields detected | ✅ | All fields in new contracts match actual code/SQL |
| 6 | No invented event types | ✅ | All event types exist in code or are documented |
| 7 | No invented aggregate types | ✅ | All match `AGGREGATE-ID-SEMANTICS.md` |

---

## 7. Exact Required Changes

| # | Change | File | Priority | Reason |
|---|---|---|---|---|
| 1 | Add `event_id` and `occurred_at` to required fields | `candidate-resume-parsed.v1.json` | **BLOCKER** | Missing envelope fields inconsistent with other event contracts |
| 2 | Update dispatcher `taskContract` reference | `event-route.registry.ts` L82 | **BLOCKER** | Must reference task contract, not event contract |
| 3 | Document conditional emission | `candidate-resume-parsed.v1.json` description | **HIGH** | "Only emitted when candidate_id is resolved (registered candidate). Guest/no-candidate uploads do not emit this event." |
| 4 | Remove `candidate.projection.rebuilt` from registry | `event-route.registry.ts` L84-89 | **HIGH** | Output event, not trigger; loop risk |
| 5 | Update `G1-ENVELOPE-ALIGNMENT.md` | `G1-ENVELOPE-ALIGNMENT.md` L28-30 | **HIGH** | Says "Phase 1 trigger contracts don't exist" — they do |
| 6 | Add `SecurityScanTaskPayload` to Pydantic schemas | `app/schemas/tasks.py` | **HIGH** | Handler cannot validate without model |
| 7 | Add contract validation tests | New test file | **MEDIUM** | Verify JSON Schema validates actual payloads |
| 8 | Update `routing.spec.ts` test expectations | `routing.spec.ts` L67 | **MEDIUM** | Security route would fail regex test |

---

## 8. What Should NOT Be Changed

| # | Item | Reason |
|---|---|---|
| 1 | `security-scan-task.v1.json` content | Already correct — uniform 4-field pattern |
| 2 | `security-scan-requested.v1.json` payload fields | Already correct — `storage_url` removed |
| 3 | `security-scan-result.v1.json` schema | Already correct — no raw content, no PII |
| 4 | `schemas/README.md` | Already correct — convention documented |
| 5 | `AGGREGATE-ID-SEMANTICS.md` | Already correct — all routes documented |
| 6 | `payload.builder.ts` | Already correct — uniform 4-field output |
| 7 | Existing draft-07 contracts | Convention says "don't mass-edit" until producer freeze |
| 8 | `security_scan_status` DB column | Authoritative state — schema is metadata only |

---

## 9. Stage-2 Readiness Verdict

**NOT READY FOR CONTRACT FREEZE**

### Blockers to Freeze

| # | Blocker | Resolution |
|---|---|---|
| 1 | `candidate-resume-parsed.v1.json` missing `event_id`, `occurred_at` | Add fields to match envelope pattern |
| 2 | Dispatcher `taskContract` references event contract | Change to task contract reference |
| 3 | `candidate.projection.rebuilt` loop risk | Remove from registry or document as intentional |

### After Blockers Resolved

| # | Remaining Work | Classification |
|---|---|---|
| 1 | `SecurityScanTaskPayload` Pydantic model | Implementation (Stage 7) |
| 2 | FastAPI security scan handler | Implementation (Stage 7) |
| 3 | Contract validation tests | Testing (Stage 7) |
| 4 | Queue provisioning artifact | Infrastructure |
| 5 | `G1-ENVELOPE-ALIGNMENT.md` wording fix | Documentation |

---

## 10. Three-Tier Classification

### Contract Draft Correctness

| Draft | Correct? | Notes |
|---|---|---|
| `security-scan-task.v1.json` | ✅ YES | Uniform pattern, no invented fields |
| `security-scan-requested.v1.json` | ✅ YES | `storage_url` already removed |
| `candidate-resume-parsed.v1.json` | ⚠️ PARTIAL | Missing `event_id`, `occurred_at`; conditional emission undocumented |
| `security-scan-result.v1.json` | ✅ YES | Clean design, no PII, no raw content |

### Implementation Completeness

| Component | Complete? | Notes |
|---|---|---|
| Task contract files | ✅ YES | All 7 task contracts exist |
| Event contract files | ✅ YES | All relevant event contracts exist |
| Schema contract files | ✅ YES | `security-scan-result.v1.json` exists |
| Dispatcher registry | ⚠️ PARTIAL | Wrong reference, loop risk |
| FastAPI Pydantic models | ❌ NO | `SecurityScanTaskPayload` missing |
| FastAPI handlers | ❌ NO | Security scan handler missing |
| Contract tests | ❌ NO | No JSON Schema validation tests |
| Queue provisioning | ❌ NO | No infrastructure artifact |

### Production Readiness

| Component | Ready? | Notes |
|---|---|---|
| Contracts | ❌ NO | Drafts need freeze after blocker resolution |
| Dispatcher | ❌ NO | Wrong reference + loop risk |
| FastAPI worker | ❌ NO | Handler missing |
| Infrastructure | ❌ NO | Queue provisioning missing |
| Tests | ❌ NO | No contract validation tests |

---

### 📌 Final Verdict

```text
Stage 2 Contract Draft Review: APPROVED WITH CHANGES
Contract Drafts: 3/4 CORRECT, 1 NEEDS FIXES
Blockers: 3 (candidate-resume-parsed fields, dispatcher reference, projection loop)
Architecture: SOUND
No Invented Fields: CONFIRMED
Safe for Contract Freeze: NOT YET (after blockers resolved → YES)
```

---

**Report Generated:** 2026-08-26  
**Agent:** FreeBuf  
**Status:** APPROVED WITH CHANGES — 3 blockers, architecture correct, no invented fields
