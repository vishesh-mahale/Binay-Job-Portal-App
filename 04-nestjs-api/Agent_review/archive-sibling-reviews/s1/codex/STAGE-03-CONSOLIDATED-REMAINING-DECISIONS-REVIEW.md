# Stage-03 Consolidated Remaining-Decisions Review

> **Subsequent owner decision:** upload transport is now frozen as NestJS-mediated multipart.
> Browser-to-Supabase direct access and browser-issued storage tokens are not allowed. The
> binding decision is recorded in `STAGE-03-REMAINING-DECISIONS.md` and supersedes the earlier
> open-transport wording below.

Date: 2026-08-26
Target: `STAGE-03-REMAINING-DECISIONS.md`

## 1. Reports reviewed

| Reviewer | Verdict | Assessment |
|---|---|---|
| Antigravity | Approved with changes | Strong technical review; recommends multipart, but this conflicts with the signed-URL approved direction unless an explicit decision changes it. |
| FreeBuf | Approved with changes | Correctly identifies active selection, 10-limit, duplicate reuse, profile history/lock, application non-promotion and writable-field corrections. |
| OpenCode | Approved with changes | Correctly identifies route-prefix, deterministic status mapping, parsed-data allowlist, upload handshake security and guest/session details. |
| Qoder | Approved with changes | Most complete gap list; correctly adds notification scope, active selection, limit timing, event field usage and requirement traceability. |
| Codex | Approved with changes | Independent review agrees with the source-grounded findings and separates technical from product decisions. |

## 2. Ground-truth corrections

### 2.1 Upload transport

Agents disagreed: Antigravity/OpenCode recommend multipart-to-NestJS; FreeBuf/Qoder recommend a
short-lived private-storage handshake. The executable requirements currently state **signed/private
storage direction** (`REQ-RESUME-001`, `NESTJS-IMPLEMENTATION-GUIDE.md §8`). Therefore this
consolidation does not silently select multipart. The safe current position is:

```text
Security direction: FROZEN — private storage, NestJS validation/finalization, no URL/token in events
Exact transport: OPEN — must remain compatible with signed-upload direction unless a new decision record changes it
```

Recommendation: choose the short-lived private-storage handshake (Option B) for large resume files;
the finalize step must verify the server-side checksum/magic bytes before the DB/outbox transaction.

### 2.2 Error envelope and status codes

RFC-7807-style machine-readable errors are a good technical recommendation, but no repository file
freezes the exact envelope. Keep it as an API-catalog decision, not an already-approved contract.
`202 Accepted` for newly accepted async upload, `200` for reads/replay and `409` for stale revision
are recommendations pending catalog confirmation.

### 2.3 Realtime

SSE + REST recovery is already frozen by Decision-02. Only exact path, short-lived ticket/cookie
mechanism, sanitized event envelope, reconnect and status mapping remain API-catalog work. A server
side replay/event store is not required for correctness; REST remains authoritative recovery.

### 2.4 Existing contracts and boundaries

- `candidate-profile-changed.v1.json` exists; no new contract is needed.
- `candidate-resume-parsed.v1.json` currently contains `event_id` and `occurred_at`; old reports
  claiming those fields are missing are stale.
- `candidate.resume.parsed` and `candidate.projection.rebuilt` are worker output events, not
  dispatcher input routes.
- Decision-01 `UserContextClient`/`SystemClient` separation and trusted document/parsing reads are
  binding constraints.

## 3. Consolidated decision matrix

| Decision | Type | Final assessment | Recommendation/status |
|---|---|---|---|
| DTOs/status/error envelope | TECHNICAL | Correct open item | Freeze one versioned envelope and exact status codes in API catalog |
| Upload handshake | TECHNICAL/SECURITY | Direction frozen, exact transport open | Prefer short-lived private-storage handshake; finalize server checksum before DB commit |
| Rate limits | PRODUCT/OPERATIONS | Genuine user decision | Agents may recommend algorithm/buckets; product must approve numeric values |
| SSE/recovery | TECHNICAL | Base decision frozen | Catalog exact `/api/v1/realtime/sse`, auth ticket, reconnect and deterministic status mapping |
| Guest upload/claim surface | PRODUCT/SECURITY | Genuine scope decision | Decide shared resource paths vs dedicated guest paths; enforce active/unexpired/not-revoked state and claim machine |
| Application-specific resume | PRODUCT/DOMAIN | Architecture already clear | Separate application catalog; `application_documents` + immutable snapshots; no canonical/library promotion |
| Confirm writable allowlist | TECHNICAL/DOMAIN | Must be explicit | Candidate canonical fields/child facts only; names on `users` require separate user-profile API; reject system fields |
| Idempotency/concurrency | TECHNICAL | Mechanics mostly source-supported | `Idempotency-Key`, user+document scope, same-key replay, expected revision and 409 stale response |
| Cleanup ownership | OPERATIONS | Event requirement approved, owner open | Compensating cleanup event; choose scheduler/consumer, retention, retry and storage authorization |
| Fast-track name extraction | PRODUCT | Genuine unresolved requirement | Keep `REQ-RESUME-007` `NEEDS_DECISION`; do not add endpoint without approval |
| Active-profile selection | PRODUCT/API | Missing required decision | Upload DTO must carry a boolean/approved equivalent and define default/consequences |
| 10-resume limit timing | PRODUCT/API | Missing required decision | Decide upload-time reject versus confirm-time re-check; do not archive oldest automatically without approval |
| Duplicate checksum reuse | TECHNICAL | Already approved by Guide §8.4 | Same owner/session + checksum returns existing document; no second scan/event |
| Two-track UI status mapping | TECHNICAL/UX | Missing required catalog artifact | Define deterministic mapping with scan-bad states taking precedence |
| Parsed-data field allowlist | PRIVACY/API | Missing required catalog artifact | Return only safe normalized review fields; never raw AI output/extracted text by default |
| Notification scope | PRODUCT/ASYNC | Missing scope decision | Decide whether this stage writes `notifications` or uses SSE+REST only; email route remains phased |
| Requirement traceability | GOVERNANCE | Required correction | Map API decisions to `REQ-RESUME-001..007`; preserve `REQ-RESUME-007` as unresolved |

## 4. Findings rejected or downgraded

1. **Multipart is not automatically the final choice.** It conflicts with the currently approved
   signed/private-storage direction unless a new decision record explicitly changes that direction.
2. **`candidate.profile.changed` contract is not missing.** It exists; only its usage fields must be
   frozen (`change_type`, `active_document_id`).
3. **`candidate-resume-parsed.v1` envelope blocker is stale.** Current contract has the required
   envelope fields.
4. **Agent-proposed numeric limits are not final.** Values such as 10 uploads/hour or 120 status
   reads/minute require product/capacity approval.
5. **Automatic oldest-resume archival is not approved.** PD-002 says the candidate must archive/remove
   an existing item; it does not authorize silent automatic deletion.

## 5. Required document changes before Stage-03 freeze

1. Add decision type (`TECHNICAL`, `PRODUCT/BUSINESS`, `OPERATIONS`, `NEEDS_USER_DECISION`) to each item.
2. Add active-profile selection and its default/consequences.
3. Add 10-resume limit enforcement timing and error behavior.
4. Add deterministic two-track status-to-UI mapping.
5. Add parsed-data safe-field allowlist.
6. Add notification/SSE-only scope for scan/parse completion.
7. Add exact `candidate.profile.changed` field usage.
8. Add requirement-ID traceability to `REQ-RESUME-001..007`.
9. Record Decision-01/02 as binding constraints, not open alternatives.
10. Narrow upload-handshake wording to the approved signed/private-storage direction.

## 6. Freeze readiness

### Can be closed by technical catalog work

- Error envelope/status codes
- `/api/v1` convention
- Exact SSE ticket/reconnect/status mapping
- Confirm field allowlist and idempotency mechanics
- Duplicate checksum reuse
- Candidate profile-change event field usage

### Requires user/business approval

- Numeric rate limits
- Guest API surface/UX
- Application-only resume API exposure and parsing behavior
- Active-profile selection default
- 10-resume limit enforcement timing/UX
- Notification writes versus SSE+REST-only scope
- Fast-track name extraction

## 7. Final verdict

```text
Agent review: COMPLETE
Architecture: APPROVED
Remaining-decisions document: NEEDS DOCUMENT FIXES
API catalog freeze: NOT READY
Coding: NOT AUTHORIZED
Next action: Apply the 10 document corrections, then obtain final user/business decisions
```
