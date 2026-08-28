# Stage-03 Remaining Decisions Review

Reviewer: Codex
Date: 2026-08-26

## 1. Final verdict

**APPROVED WITH CHANGES**

The decision list is complete enough for agent review and does not invent architecture. However,
some items are not equal: several are implementation/catalog decisions, while guest behavior,
application-only resume behavior and fast-track extraction require explicit product confirmation.

## 2. Sources verified

- `s1/codex/STAGE-03-REMAINING-DECISIONS.md`
- `s1/codex/STAGE-03-NESTJS-API-REQUIREMENTS-SYNC.md`
- `s1/codex/STAGE-03-CONSOLIDATED-API-SYNC-REVIEW.md`
- `DECISION-01-NESTJS-SUPABASE-ACCESS-MODEL-HINGLISH.md`
- `DECISION-02-REALTIME-TRANSPORT-HINGLISH.md`
- `PHASE-01-REQUIREMENTS-CONSOLIDATION.md`
- `PHASE-04-STATE-MACHINES-AND-TRANSACTIONS.md`
- `NESTJS-IMPLEMENTATION-GUIDE.md`
- Baseline SQL 02, 06, 07, 08, 09, 12, 15 and 17
- Contracts under `contracts/events`, `contracts/tasks` and `contracts/schemas`

## 3. Decision-by-decision review

| Decision | Type | Verdict | Recommendation |
|---|---|---|---|
| Exact DTO/status/error envelope | TECHNICAL | Correct open item | Define one versioned API error envelope; use 202 for accepted async upload, 200 for reads, 409 for stale/replay conflict, 422 validation, 404/403 ownership-safe behavior, 503 only for retryable dependency unavailability. Final values still need catalog approval. |
| Upload handshake | TECHNICAL + SECURITY | Correctly narrowed | Keep approved private-storage/signed-upload direction. Prefer short-lived authorized upload handshake for large resumes; NestJS must finalize metadata/checksum before DB/outbox commit. Do not put signed URLs in events/tasks. |
| Rate limits | PRODUCT/OPERATIONS | Correct open item | Freeze numeric per-user, guest-session/IP and polling limits only after capacity/cost decision. Do not invent numbers in schema or contracts. |
| SSE endpoint/recovery | TECHNICAL | Correct open item | Use authenticated per-user SSE, sanitized event IDs/revisions, reconnect with jitter, then REST authoritative recovery. Exact path/ticket/DTO must be cataloged. |
| Guest upload/claim API | PRODUCT + SECURITY | Correct, blocking for guest scope | Reuse active/unexpired/not-revoked session rules and service-only consume function. Decide whether guest endpoints are separate or resource-shared; do not silently expose registered-only APIs to guests. |
| Application-specific resume API | PRODUCT + DOMAIN | Correct, blocking for complete catalog | Keep separate from profile-resume APIs. Use `application_documents` and immutable `application_profile_snapshots`; never promote application-only resume automatically. |
| Confirm writable fields | TECHNICAL + PRODUCT | Correct open item | Allowlist canonical candidate facts only. Server owns provenance, verification, revision, audit and projection fields. Unknown fields rejected. |
| Idempotency/concurrency | TECHNICAL | Correct open item | Define key scope/retention/replay; lock candidate row, compare expected revision and return 409 without mutation on stale revision. |
| Cleanup ownership | OPERATIONS | Correctly narrowed | Compensating cleanup event is required; choose sweeper owner, retention window, retry/dead-letter and storage authorization separately. |
| Fast-track name extraction | PRODUCT | Correct unresolved decision | Keep `REQ-RESUME-007` as `NEEDS_DECISION`; do not add a special endpoint until product confirms latency/UX need. |
| `/api/v1` prefix | TECHNICAL | Should be frozen convention | Apply consistently to public NestJS routes and document it once; do not mix prefixed/unprefixed paths. |

## 4. Missing decisions or clarifications

| ID | Missing/clarify | Why it matters | Owner |
|---|---|---|---|
| R-01 | Upload-time active-profile selection request field and consequences | PD-002 makes selection part of upload behavior; it decides library/search projection | Product + API |
| R-02 | Duplicate checksum reuse response | Prevents second document/scan and defines UI behavior | API/DB |
| R-03 | Ten active profile-library resume limit and soft archive API | Required by PD-002; otherwise upload acceptance is incomplete | Product + API |
| R-04 | Confirm profile history and server-owned provenance fields | Required for audit and prevents client tampering | API/DB |
| R-05 | Candidate-resume-parsed output event dependency | Current contract is corrected; it remains output-only and must not be routed back as input | Worker/contracts |
| R-06 | Per-API trusted access statement | Document/parsing tables have no authenticated direct-read path in baseline | API/security |

## 5. Incorrect or already-frozen decisions

1. Private storage, clean-only parsing, transactional outbox and SSE-plus-REST recovery are already
   frozen; they should not be reopened as architecture alternatives.
2. `candidate.profile.changed` contract exists. It must be referenced with its fields, not recreated.
3. `candidate.resume.parsed` currently has the corrected envelope (`event_id`, `occurred_at`); any
   report saying those fields are missing is stale.
4. `candidate.projection.rebuilt` is a worker output event, not a dispatcher input route.
5. Service-role/trusted writes and explicit client separation are already part of Decision-01.

## 6. Recommended choices

- Public API convention: `/api/v1`.
- Large-file upload: short-lived private-storage handshake, followed by NestJS metadata finalization.
- Status transport: authenticated SSE nudge plus REST recovery; no direct browser DB subscription.
- Confirm: one transaction with row lock, expected revision, history, canonical facts, document link,
  one revision bump and `candidate.profile.changed` outbox event.
- Application-only resumes: separate application transaction and immutable snapshot; no canonical
  profile/library promotion.
- Duplicate checksum: return/reuse the existing active document for the same owner/session.

These are technical recommendations. Product choices (guest UX, library actions and fast-track
name extraction) still require user/business confirmation.

## 7. Acceptance tests

- Same owner/checksum upload returns the same document ID and does not create a second scan event.
- A 10th/11th active library resume follows the approved limit/archive behavior.
- Candidate A cannot read Candidate B’s document status or parsed data.
- Stale confirm revision returns 409 and creates no profile/history/outbox mutation.
- Confirm creates exactly one history row, one profile revision bump and one
  `candidate.profile.changed` event.
- Missed SSE event is recovered through REST status/history.
- Application-only resume creates an immutable application snapshot and does not alter canonical
  candidate search data.
- Guest session with expired/revoked status is rejected.
- No task/outbox/realtime payload contains raw resume bytes, signed URLs or credentials.

## 8. Freeze readiness

### Can be closed through technical review

- DTO/error envelope shape
- `/api/v1` convention
- trusted-client boundary
- status mapping
- idempotency/concurrency mechanics
- SSE reconnect/recovery mechanics

### Requires user/business decision

- Guest API UX/scope
- Application-only resume product behavior
- Numeric rate limits/capacity targets
- Fast-track name extraction
- Resume library user-facing archive behavior

### Current blockers

- Exact DTOs/status/error codes
- Guest/application API catalog entries
- Numeric rate limits
- SSE endpoint contract
- Confirm writable-field allowlist
- Idempotency replay policy

## 9. Final status

```text
READY FOR FINAL USER/BUSINESS DECISIONS
API catalog freeze: NOT READY
Coding: NOT AUTHORIZED
```
