# Stage 2 Independent Contract Review — FreeBuf

**Agent:** FreeBuf  
**Date:** 2026-08-25  
**Status:** APPROVED WITH CHANGES  

---

## 1. Verdict

**APPROVED WITH CHANGES**

Contract inventory is **accurate and well-documented**. 3 critical gaps and 4 medium issues must be resolved before contract freeze.

---

## 2. Verified Correct Points

| # | Point | Repository Evidence | Result |
|---|---|---|---|
| 1 | **6 task contracts exist** with uniform pattern: `schema_version`, `event_id`, `aggregate_id`, `trace_id` | `contracts/tasks/*.v1.json` — all 6 files verified | ✅ CORRECT |
| 2 | **`security-scan-requested.v1.json`** has full outbox envelope | `contracts/events/security-scan-requested.v1.json` — `aggregate_type`, `aggregate_id`, `event_type`, `payload`, `occurred_at` | ✅ CORRECT |
| 3 | **`resume-parse-requested.v1.json`** exists but uses draft-07 | `contracts/events/resume-parse-requested.v1.json` — flat fields, no envelope | ✅ CORRECT (gap noted) |
| 4 | **Dispatcher builds uniform task payload** from outbox event | `payload.builder.ts` L19-27: `buildTaskPayload()` extracts only 4 fields | ✅ CORRECT |
| 5 | **Test proves payload opacity** — never leaks outbox content | `routing.spec.ts` L120-130: `"never leaks outbox payload content into the task payload"` | ✅ CORRECT |
| 6 | **Aggregate ID semantics documented** | `AGGREGATE-ID-SEMANTICS.md` — all 6 routes + 6 chained events mapped | ✅ CORRECT |
| 7 | **G-1 envelope alignment** properly identifies Phase 1 trigger contracts as missing | `G1-ENVELOPE-ALIGNMENT.md` — "Phase 1 trigger event contracts don't exist yet" | ✅ CORRECT |
| 8 | **`candidate.resume.parsed`** referenced in AGGREGATE-ID-SEMANTICS but contract file missing | `AGGREGATE-ID-SEMANTICS.md` L35 references it, no file in `contracts/events/` | ✅ CORRECT (gap noted) |
| 9 | **Security route references event contract, not task contract** | `event-route.registry.ts` L57: `taskContract: 'contracts/events/security-scan-requested.v1.json'` | ✅ CORRECT (mismatch noted) |
| 10 | **FastAPI Pydantic schemas** match task contract pattern | `app/schemas/tasks.py` — all 6 payloads use same 4-field pattern | ✅ CORRECT |

---

## 3. Incorrect or Unsupported Claims

| # | Claim | Actual Evidence | Severity | Required Action |
|---|---|---|---|---|
| 1 | **"Phase 1 trigger event contracts don't exist yet"** | Partially incorrect. `resume-parse-requested.v1.json` EXISTS in `contracts/events/`. But `candidate-profile-changed.v1.json` and `job-ai-enrichment-requested.v1.json` also exist. | **LOW** | Update G1-ENVELOPE-ALIGNMENT.md — 3 Phase 1 trigger contracts DO exist |
| 2 | **Stage 2 inventory says "8 contracted producer events (3 Phase 1 + 5 Phase 2)"** | Test confirms 8 routes. But `application.submitted` is NOT in the registry (correctly excluded per routing.spec.ts L44). Claim is accurate. | **NONE** | No action needed |
| 3 | **`security_scan_result` shape "proposed" with schema_version, verdict, etc.** | No such schema exists in repository. This is a proposal, not evidence. | **LOW** | Mark clearly as "PROPOSED" not "existing" |

---

## 4. Contract Gaps

### GAP-01: `security-scan-task.v1.json` Missing

| Field | Detail |
|---|---|
| **Gap ID** | GAP-01 |
| **Source** | `contracts/tasks/` — no `security-scan-task.v1.json` file |
| **Problem** | Dispatcher routes `security.scan.requested` but has no task contract to reference. All other 5 routes have dedicated task contracts. |
| **Impact** | **HIGH** — Dispatcher `taskContract` field points to event contract instead of task contract. Inconsistent with all other routes. |
| **Recommended Options** | A) Create `contracts/tasks/security-scan-task.v1.json` with standard 4-field pattern<br>B) Leave as-is and document exception |
| **Your Recommendation** | **Option A** — Create the task contract. It's a 10-line JSON file following the exact same pattern as the other 5. |
| **User Decision Required?** | NO |

### GAP-02: `candidate-resume-parsed.v1.json` Missing

| Field | Detail |
|---|---|
| **Gap ID** | GAP-02 |
| **Source** | `AGGREGATE-ID-SEMANTICS.md` L35 references `candidate.resume.parsed` event, but no contract file exists in `contracts/events/` |
| **Problem** | FastAPI `task_handlers.py` L206-212 emits this event: `await outbox_repo.emit_event(aggregate_type="candidate", event_type="candidate.resume.parsed", ...)`. Event is emitted but contract is undocumented. |
| **Impact** | **MEDIUM** — Downstream consumers (notification engine, analytics) cannot validate payload without a contract. |
| **Recommended Options** | A) Create `contracts/events/candidate-resume-parsed.v1.json` based on actual emitted payload<br>B) Defer to Phase 3 (notification engine implementation) |
| **Your Recommendation** | **Option A** — Contract should exist when event is emitted. Evidence from code: `payload = {"candidate_id", "reason", "trace_id"}` |
| **User Decision Required?** | NO |

### GAP-03: Dispatcher `taskContract` References Event Contract

| Field | Detail |
|---|---|
| **Gap ID** | GAP-03 |
| **Source** | `event-route.registry.ts` L57: `taskContract: 'contracts/events/security-scan-requested.v1.json'` |
| **Problem** | All other Phase 2 routes reference `contracts/tasks/*.v1.json`. Security route uniquely references an event contract. The `taskContract` field name implies task contract, not event contract. |
| **Impact** | **MEDIUM** — Confusing for developers; test `expect(route.taskContract).toMatch(/^contracts\/tasks\/.+\.v1\.json$/)` would fail for security route. |
| **Recommended Options** | A) Change reference to `contracts/tasks/security-scan-task.v1.json` after creating it<br>B) Rename field to `contractReference` and accept either |
| **Your Recommendation** | **Option A** — Standardize on task contracts for `taskContract` field |
| **User Decision Required?** | NO |

### GAP-04: JSON Schema Draft Inconsistency

| Field | Detail |
|---|---|
| **Gap ID** | GAP-04 |
| **Source** | `security-scan-requested.v1.json` uses `draft/2020-12`, `resume-parse-requested.v1.json` uses `draft-07`, task contracts use `draft-07` |
| **Problem** | No repository-wide convention documented. Mixed drafts create confusion. |
| **Impact** | **LOW** — Functionally works, but inconsistent. |
| **Recommended Options** | A) Standardize all new contracts to `draft/2020-12` (latest)<br>B) Standardize all to `draft-07` (widest tooling support)<br>C) Document mixed convention as intentional |
| **Your Recommendation** | **Option A** — `draft/2020-12` is current standard. Existing `draft-07` contracts can remain until next version bump. |
| **User Decision Required?** | YES — Convention decision needed |

### GAP-05: `resume-parse-requested.v1.json` Missing Envelope Fields

| Field | Detail |
|---|---|
| **Gap ID** | GAP-05 |
| **Source** | `contracts/events/resume-parse-requested.v1.json` — has `schema_version`, `event_id`, `aggregate_id`, `trace_id`, `document_id`, `requested_by` |
| **Problem** | Missing `aggregate_type`, `event_type`, `payload`, `occurred_at` that define a proper outbox envelope. `G1-ENVELOPE-ALIGNMENT.md` correctly identifies this. |
| **Impact** | **MEDIUM** — Consumer cannot validate full event envelope. However, dispatcher is payload-opaque so this doesn't break routing. |
| **Recommended Options** | A) Rewrite to full envelope format (breaking change → version bump to v2)<br>B) Keep as task-like event contract, document as intentional exception<br>C) Create v2 with full envelope, keep v1 for backward compatibility |
| **Your Recommendation** | **Option C** — Create `resume-parse-requested.v2.json` with full envelope. Keep v1 until producer (NestJS) migrates. |
| **User Decision Required?** | YES |

### GAP-06: `security_scan_result` Schema Location Undefined

| Field | Detail |
|---|---|
| **Gap ID** | GAP-06 |
| **Source** | `06_documents.sql` L51: `security_scan_result JSONB` — column exists but no schema contract |
| **Problem** | Stage 2 inventory proposes `contracts/schemas/security-scan-result.v1.json` but this directory/file doesn't exist. |
| **Impact** | **LOW** — Works functionally, but different agents may write different JSON shapes. |
| **Recommended Options** | A) Create `contracts/schemas/security-scan-result.v1.json`<br>B) Document shape in SQL comment only |
| **Your Recommendation** | **Option A** — Create schema contract for consistency |
| **User Decision Required?** | NO |

### GAP-07: `security-scan-queue` Provisioning Artifact Missing

| Field | Detail |
|---|---|
| **Gap ID** | GAP-07 |
| **Source** | `event-route.registry.ts` L18: `SECURITY_SCAN_QUEUE = 'security-scan-queue'` — defined but no provisioning artifact |
| **Problem** | No Terraform/Pulumi/GCP config found for queue creation. Other queues (`ai-heavy-queue`, `projection-queue`) also lack provisioning artifacts in repository. |
| **Impact** | **LOW** — Queue provisioning is infrastructure concern, not application code. But should be documented. |
| **Recommended Options** | A) Add `infrastructure/cloud-tasks.tf` with queue definitions<br>B) Document queue names in README only |
| **Your Recommendation** | **Option B for MVP** — Document in dispatcher README. Provisioning is deployment-time concern. |
| **User Decision Required?** | NO |

---

## 5. Proposed Contract Changes

| # | Change | Classification | Rationale |
|---|---|---|---|
| 1 | Create `contracts/tasks/security-scan-task.v1.json` | **REQUIRED** | All other routes have task contracts. Consistency mandatory. |
| 2 | Update dispatcher `taskContract` to reference task contract | **REQUIRED** | Field name implies task contract, not event contract. |
| 3 | Create `contracts/events/candidate-resume-parsed.v1.json` | **REQUIRED** | Event is emitted by FastAPI but contract undocumented. |
| 4 | Standardize JSON Schema draft to `draft/2020-12` | **RECOMMENDED** | Current standard, widest future tooling support. |
| 5 | Create `resume-parse-requested.v2.json` with full envelope | **RECOMMENDED** | Aligns with outbox envelope format per G-1. |
| 6 | Create `contracts/schemas/security-scan-result.v1.json` | **OPTIONAL** | Documents JSONB shape for consistency. |
| 7 | Add queue provisioning documentation | **OPTIONAL** | Infrastructure concern, not blocking. |
| 8 | Update `G1-ENVELOPE-ALIGNMENT.md` to reflect existing Phase 1 contracts | **REQUIRED** | Document incorrectly says contracts don't exist. |

---

## 6. Security and PII Review

| # | Concern | Status | Detail |
|---|---|---|---|
| 1 | **`storage_url` in event contract** | ⚠️ REVIEW NEEDED | `security-scan-requested.v1.json` has required `payload.storage_url`. If this is a signed URL, it expires. If it's a bucket path, it exposes storage structure. Recommendation: remove from event contract, let handler query DB. |
| 2 | **Task payload opacity** | ✅ SECURE | `buildTaskPayload()` extracts only 4 fields. Test proves no outbox content leaks. |
| 3 | **Aggregate ID as document identity** | ✅ SECURE | `uploaded_documents.id` is UUID, not a path or name. No PII exposure. |
| 4 | **`security_scan_result` PII** | ⚠️ REVIEW NEEDED | If scan result contains `virus_name` or raw content, ensure no resume text leaks. Recommendation: result schema should exclude raw content. |
| 5 | **Event contract `payload.storage_url` signed URL expiry** | ⚠️ REVIEW NEEDED | Signed URLs expire (default 900s per `config.py` L89). If dispatcher delays >15min, URL is stale. Recommendation: handler should generate fresh signed URL from storage_path. |

---

## 7. Dispatcher/Worker Compatibility Review

| # | Check | Status | Detail |
|---|---|---|---|
| 1 | **Dispatcher builds correct task payload** | ✅ COMPATIBLE | `buildTaskPayload()` produces `{schema_version, event_id, aggregate_id, trace_id}` — matches all 6 Pydantic schemas |
| 2 | **FastAPI Pydantic schemas validate incoming payloads** | ✅ COMPATIBLE | `app/schemas/tasks.py` — all 6 schemas use same pattern, `model_config = ConfigDict(extra="forbid")` rejects unexpected fields |
| 3 | **Security route endpoint exists** | ❌ INCOMPATIBLE | `/internal/tasks/security/scan` — no handler in FastAPI |
| 4 | **Queue names match** | ✅ COMPATIBLE | `SECURITY_SCAN_QUEUE = 'security-scan-queue'` — consistent across registry and tests |
| 5 | **OIDC validation** | ✅ COMPATIBLE | All handlers check `OIDC_AUTH_ENABLED` and validate bearer token |
| 6 | **Deterministic task names** | ✅ COMPATIBLE | `deterministicTaskName()` uses route_key + aggregate_id — works for security scan |

---

## 8. Required Changes Before Contract Freeze

| # | Change | Priority | Owner |
|---|---|---|---|
| 1 | Create `contracts/tasks/security-scan-task.v1.json` | **CRITICAL** | Contracts team |
| 2 | Update dispatcher `taskContract` reference | **CRITICAL** | Dispatcher team |
| 3 | Create `contracts/events/candidate-resume-parsed.v1.json` | **HIGH** | Contracts team |
| 4 | Update `G1-ENVELOPE-ALIGNMENT.md` | **HIGH** | Documentation |
| 5 | Decide JSON Schema draft convention | **MEDIUM** | Architecture decision |
| 6 | Decide `resume-parse-requested` envelope format | **MEDIUM** | Architecture decision |
| 7 | Remove `storage_url` from event contract (or document as signed URL) | **MEDIUM** | Security review |

---

## 9. Final Recommendation

### Can Stage 2 Contract Freeze?

**NOT YET** — Two critical blockers:

```
❌ CRITICAL: security-scan-task.v1.json does not exist
   → Dispatcher has no task contract to reference
   → Inconsistent with all other routes

❌ CRITICAL: candidate-resume-parsed.v1.json does not exist
   → FastAPI emits event but contract undocumented
   → Downstream consumers cannot validate
```

### What Must Be Resolved First?

1. **Create `contracts/tasks/security-scan-task.v1.json`** — 10-line JSON, same pattern as others
2. **Create `contracts/events/candidate-resume-parsed.v1.json`** — based on actual emitted payload
3. **Update dispatcher `taskContract`** to reference new task contract
4. **Update `G1-ENVELOPE-ALIGNMENT.md`** to reflect existing Phase 1 contracts

### Is It Safe to Proceed to Stage 3 (API Catalog)?

**YES, conditionally** — Stage 3 (API catalog) is independent of contract files. API endpoints can be documented while contracts are being finalized. But Stage 3 exit criterion should include "all referenced contracts exist."

### Architecture Assessment

The contract architecture is **sound**:

| Component | Assessment |
|---|---|
| Uniform task payload pattern | ✅ Correct — 4 fields, payload-opaque dispatcher |
| Event envelope format | ✅ Correct — full envelope for Phase 2 events |
| Aggregate ID semantics | ✅ Correct — documented per route |
| Dispatcher payload opacity | ✅ Correct — test-proven, never leaks content |
| Task contract separation | ✅ Correct — event contract ≠ task contract |
| Pydantic validation | ✅ Correct — `extra="forbid"` rejects unexpected fields |

**The only gaps are missing files, not wrong architecture.**

---

### 📌 Decision Record

```text
Stage: 2 — Contract Finalization
Status: APPROVED WITH CHANGES
Critical Gaps: 2 (security-scan-task.v1.json, candidate-resume-parsed.v1.json)
Medium Gaps: 4 (draft convention, envelope format, storage_url, G1 update)
Architecture: SOUND
Safe for Stage 3: YES (conditional)
Contract Edit Safe: YES (after creating missing files)
```

---

**Report Generated:** 2026-08-25  
**Agent:** FreeBuf  
**Status:** APPROVED WITH CHANGES — 2 critical files missing, architecture correct
