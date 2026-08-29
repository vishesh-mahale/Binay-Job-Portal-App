# Stage-03 — Consolidated NestJS API Sync Review

Date: 2026-08-26
Target: `STAGE-03-NESTJS-API-REQUIREMENTS-SYNC.md`

## 1. Review coverage

Reviewed agent reports:

- `stage3/antigravity-STAGE-03-API-SYNC-REVIEW.md`
- `stage3/freebuf-STAGE-03-API-SYNC-REVIEW.md`
- `stage3/opencode-STAGE-03-API-SYNC-REVIEW.md`
- `stage3/qoder-STAGE-03-API-SYNC-REVIEW.md` — file is empty (0 bytes), therefore no evidence or verdict was available.
- Codex independent review: `codex/CODEX-STAGE-03-API-SYNC-REVIEW.md`

Authoritative cross-checks were made against the executable SQL baseline, current contracts,
Decision-01/02, dispatcher registry and FastAPI task handlers. Agent claims were not accepted
without source verification.

## 2. Agent verdict comparison

| Reviewer | Verdict | Main valid findings | Findings not accepted as-is |
|---|---|---|---|
| Antigravity | Approved with changes | Guest claim/API gap; application-specific resume distinction; possible `/api/v1` convention | `/api/v1` is a convention recommendation, not a currently frozen route in the source contract |
| FreeBuf | Approved with changes | RLS read-path clarification; two status columns; application-specific flow; SystemClient/UserContextClient boundary; document role and event details | “`candidate.profile.changed` contract missing” is incorrect: `contracts/events/candidate-profile-changed.v1.json` exists |
| OpenCode | Approved with changes | Status-track mismatch; exact confirm event fields; client separation; active/deleted checks; guest-session checks; soft-delete; recovery details | File transport is directionally resolved, but exact multipart/handshake implementation is still not frozen |
| Qoder | Approved with changes | PD-002 active-resume selection, 10-resume limit, duplicate reuse, profile history/optimistic concurrency, REQ-ID traceability, SystemClient-only document reads | Its old `candidate-resume-parsed.v1` blocker is stale: current contract already contains `event_id` and `occurred_at` |
| Codex | Approved with changes | Same core gaps; no invented DTOs/limits; application-specific and guest-flow gaps explicitly recorded | No material disagreement with verified source facts |

## 3. Ground-truth decision

### Confirmed correct in the Stage-03 draft

- Four first-resume APIs are the correct minimum flow boundary.
- Security scan must precede parsing; only `clean` may create the parse handoff.
- `uploaded_documents` and `outbox_events` are written atomically after storage handling.
- Scanner, Cloud Tasks and FastAPI calls remain outside an open DB transaction.
- Canonical candidate tables are not changed before explicit confirmation.
- Confirmation must bump profile revision once and emit `candidate.profile.changed`.
- `candidate.projection.rebuilt` is a FastAPI output event, not a dispatcher input route.
- SSE is only a live optimization; REST/database state is authoritative recovery.
- Browser never receives trusted/service credentials.

Additional approved requirements verified from PD-002 and the implementation guide:

- Upload-time “Use as active profile resume” selection is required.
- Profile-resume library maximum is 10 active library resumes; removal is soft archive.
- Same owner/session plus checksum must reuse the existing document, without a second scan event.
- Confirm follows the full profile-save pattern: row lock, expected-revision check, history row,
  server-owned provenance fields and stale-write `409 Conflict`.
- Each endpoint must map to frozen `REQ-RESUME-001..007` IDs; local API labels are not substitutes.

### Corrections required before Stage-03 freeze

#### S3-C-01 — Make the two status tracks explicit (HIGH)

`uploaded_documents` has separate columns and enums:

```text
security_scan_status:
pending → scanning → clean / infected / failed / quarantined

processing_status:
uploaded → queued → processing → parsed / completed / failed / partial / ai_enriching
```

The status API must read and expose both tracks through one deterministic UI mapping. It must not
merge values from different columns into an ambiguous single lifecycle.

#### S3-C-02 — Add the mandatory NestJS client-boundary rule (HIGH)

The catalog must explicitly require separate adapters:

```text
UserContextClient  → only approved user-context reads with JWT/RLS
SystemClient       → trusted business transactions and worker/system operations
```

`SystemClient` must not be accidentally injectable into user-facing repositories.

Important correction from FreeBuf: uploaded-document and parsing tables do not have a general
authenticated direct-read path in `17_rls.sql`; their user-facing reads must be mediated by
NestJS ownership checks through the trusted path unless a later approved RLS policy changes that.

#### S3-C-03 — Make confirmation event details exact (HIGH)

The existing contract `contracts/events/candidate-profile-changed.v1.json` exists and must be
used. The confirm transaction must emit:

```text
event_type          = candidate.profile.changed
change_type         = approved enum value
active_document_id  = confirmed resume document UUID or null
```

The event must be written in the same transaction as canonical facts, audit/history and the
single profile-revision bump.

#### S3-C-04 — Include document and active-state invariants (MEDIUM)

Confirm must explicitly require:

- `uploaded_documents.deleted_at IS NULL`;
- `security_scan_status = 'clean'` (all other scan states rejected);
- linked document role is `resume`;
- guest sessions, when applicable, are `active`, unexpired and not revoked;
- normal orphan handling uses soft-delete/retention policy, not product hard delete.

#### S3-C-05 — Record parsing/default and idempotency behavior (MEDIUM)

The upload catalog must state whether candidate uploads use `priority = 'normal'` (the DB default)
and how duplicate checksum/idempotency-key retries behave. Exact key/header/replay semantics still
need an approved API decision.

#### S3-C-06 — Add non-profile flows explicitly (HIGH scope gap)

This Stage-03 draft is specifically the first-profile-resume flow. It must link to a separate
future/current API catalog entry for:

- guest upload and guest-to-account claim;
- application-specific resume upload;
- `application_profile_snapshots` creation without changing canonical candidate facts.

These are not optional details; they must not disappear when the complete API catalog is built.

#### S3-C-07 — Resolve public route prefix deliberately (MEDIUM)

Several existing API documents use `/api/v1/...`, but the first-resume stage plan lists paths
without the prefix. Standardize on `/api/v1/resumes/*` only after recording this as the canonical
NestJS public route convention. Until then, the draft must mark the prefix as a convention decision,
not as an already verified route.

#### S3-C-08 — Add PD-002 active-resume and library rules (HIGH)

The upload contract must capture the approved active-profile selection and its selected/unselected
consequences. The catalog must also state the 10-active-library-resume limit, soft archive
behavior, application-only non-promotion and duplicate-checksum reuse semantics.

#### S3-C-09 — Complete the profile-confirm transaction (HIGH)

Confirmation must include `candidate_profiles ... FOR UPDATE`, expected-revision verification,
stale-write `409 Conflict`, `profile_change_history` insertion, server-owned provenance/
verification/audit fields and soft-delete-only behavior, as required by the implementation guide.

#### S3-C-10 — Restore frozen requirement traceability (HIGH)

Map `API-RESUME-001..004` to `REQ-RESUME-001..007`; explicitly retain `REQ-RESUME-007` as a
`NEEDS_DECISION` fast-track-name-extraction requirement.

## 4. Findings rejected or downgraded after evidence check

1. **“`candidate.profile.changed` contract is missing” — rejected.**
   `contracts/events/candidate-profile-changed.v1.json` exists. The real gap is that the draft
   did not state its required fields explicitly.

2. **“All exact file transport is already frozen” — partially accepted only.**
   Stage-01 freezes private storage, NestJS validation and pending scan. It does not freeze whether
   the browser sends multipart data to NestJS or uses an approved storage handshake. Keep this as
   an implementation/API decision, without changing the security direction.

3. **“The flow is 100% verified” — rejected as wording.**
   The architecture is source-compatible, but NestJS producer implementation, ClamAV sidecar
   runtime and live security-scan E2E are still pending.

4. **“`candidate-resume-parsed.v1` still lacks `event_id`/`occurred_at`” — stale finding.**
   The current contract requires both fields. Keep it as an output-only dependency, but do not
   reopen this already corrected contract issue.

## 5. Consolidated API status

| API | Status | Required before freeze |
|---|---|---|
| Upload | Direction approved | transport, DTO, rate limit, checksum/idempotency replay, guest scope |
| Status | Direction approved | two-track enum mapping, exact response/recovery DTO |
| Parsed data | Direction approved | safe field allowlist, not-ready/error DTO, guest/application scope |
| Confirm | Direction approved | writable-field allowlist, exact event fields, document role, revision conflict/idempotency behavior |

## 6. Consolidated open decisions

1. Canonical public route prefix (`/api/v1`).
2. Upload transport within the already-approved private-storage direction.
3. Exact DTOs and HTTP status/error codes.
4. Numeric rate limits.
5. SSE endpoint/authentication/reconnect/recovery envelope.
6. Guest upload and guest claim API surface.
7. Application-specific resume/snapshot API surface.
8. Confirm writable-field allowlist and revision-conflict behavior.
9. Idempotency key scope, retention and replay response.
10. Orphan-object cleanup/retention ownership.
11. Optional `REQ-RESUME-007` fast-track name-extraction path.

## 7. Final consolidated verdict

```text
Stage-03 architecture direction       APPROVED
Source/SQL/contract alignment          APPROVED WITH CORRECTIONS
API catalog freeze                     NOT READY
NestJS coding                          NOT AUTHORIZED YET
Next action                            Apply S3-C-01..S3-C-10, then independent re-review
```

No agent report authorizes coding. The empty Qoder file is not evidence of approval.
