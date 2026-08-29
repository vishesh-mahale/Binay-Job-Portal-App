# Stage 03 — Consolidated DTO and Error Contract Review

Status: `APPROVED WITH CHANGES — API CATALOG NOT YET FROZEN`

This report consolidates the Antigravity, FreeBuf, OpenCode and Qoder reviews. No code,
SQL or shared contract was changed by the reviews.

## 1. Consensus findings

- `{ success, data, request_id, trace_id }` and the symmetric error envelope are suitable.
- `trace_id` must be propagated in outbox/task payloads; `request_id` remains HTTP/log scope.
- `expected_profile_revision` is mandatory for confirm and stale updates return `409 STALE_REVISION`.
- Same-owner/session checksum reuse is a successful reuse (`200`, `reused=true`), not a duplicate error.
- Unknown or not-owned document reads should return the same `404 NOT_FOUND` shape to avoid ownership leaks.
- Error messages/details must never expose resume text, filenames, storage paths, tokens, scanner
  signatures, stack traces, provider errors or raw `error_details` JSON.
- The 10-resume library rule is enforced by NestJS application logic; it is not a database CHECK.

## 2. Important correction applied

The upload flow is asynchronous for malware scanning. Synchronous NestJS work is limited to
authentication/authorization, size/type/extension/magic-byte/checksum validation and storage
write. The response is returned after the document row and `security.scan.requested` outbox row
commit with `security_scan_status=pending`. ClamAV runs later; an infected result is never a
synchronous upload response.

## 3. Recommended envelope

```json
{
  "success": true,
  "data": {},
  "request_id": "uuid",
  "trace_id": "uuid",
  "schema_version": 1
}
```

```json
{
  "success": false,
  "error": {
    "code": "PARSING_PENDING",
    "message": "Resume parsing is still in progress",
    "details": {}
  },
  "request_id": "uuid",
  "trace_id": "uuid",
  "schema_version": 1
}
```

`schema_version` is recommended for the public envelope; it must be frozen in the API catalog
before implementation. `details` is typed per error code and is never a free-form internal dump.

## 4. Recommended error vocabulary and HTTP mapping

| Code | HTTP | Meaning |
|---|---:|---|
| `VALIDATION_ERROR` | 400 | DTO/input validation; use safe `details.code` for size/type/checksum |
| `UNAUTHORIZED` | 401 | Missing, invalid or expired user JWT |
| `FORBIDDEN` | 403 | Action denied on an already-disclosed resource |
| `NOT_FOUND` | 404 | Unknown, not-owned or soft-deleted resource |
| `RESUME_LIMIT_REACHED` | 409 | Active library limit prevents another profile resume |
| `GUEST_SESSION_INVALID` | 403 | Guest session missing required active/unexpired/not-revoked state |
| `SCAN_PENDING` | 409 | Confirm/parsed-data operation blocked while scan is pending |
| `SCAN_FAILED` | 409 | Scan failed; status response should additionally expose safe retryability |
| `INFECTED_FILE` | 422 | Confirm/processing blocked by infected or quarantined content |
| `PARSING_PENDING` | 409 | Confirm/parsed-data operation blocked while parsing is incomplete |
| `PARSING_FAILED` | 422 | Parsing reached a terminal failed state |
| `STALE_REVISION` | 409 | Expected profile revision does not match current revision |
| `IDEMPOTENCY_CONFLICT` | 409 | Same key with a different request payload |
| `DEPENDENCY_UNAVAILABLE` | 503 | Storage/DB dependency unavailable at NestJS boundary |
| `RATE_LIMITED` | 429 | Approved rate limit exceeded; include retry information |
| `INTERNAL_ERROR` | 500 | Generic unexpected failure |

Notes:

- `DUPLICATE_RESUME` is removed as an error. Same-owner checksum reuse returns success with
  `reused=true` and `existing_document_id`; no second scan/outbox event is created.
- `QUARANTINED_FILE` is not a separate public code unless product explicitly needs that distinction;
  map it to `INFECTED_FILE` with a safe internal/state detail.
- `SCAN_IN_PROGRESS` is an internal worker code. The public status API should return a deterministic
  `stage`, not an error, for normal in-progress states.
- `partial` parsing is not `PARSING_FAILED`; parsed-data may return a safe `partial=true` marker.
- Guest claim-specific errors remain outside these four resume APIs and belong in the guest API catalog.

## 5. DTO requirements

### Upload request/response

- Multipart request through NestJS only.
- Request includes the approved active-profile selection field and guest binding where applicable.
- Response includes `document_id`, `security_scan_status`, `processing_status`, deterministic `stage`,
  `created_at`, and `reused`/`existing_document_id` when checksum reuse occurs.
- New upload returns `201`; successful reuse returns `200`.

### Status response

Return both state tracks (`security_scan_status`, `processing_status`), deterministic UI `stage`,
safe error category, retryability, timestamps and parsing job status when present. Do not return
storage paths, raw scan results or internal JSONB error details.

### Parsed-data response

Return only the approved normalized review-field allowlist, source identifiers, confidence/schema
metadata and `partial` marker. Never return raw extracted text, raw AI output or artifacts by default.

### Confirm request/response

- `expected_profile_revision` is mandatory.
- Only the approved canonical writable-field allowlist is accepted; unknown/system/provenance fields
  are rejected.
- Response includes the new profile revision, candidate/document linkage and projection queued state.

## 6. Open items before API catalog freeze

1. Final public envelope field name/version (`schema_version` and exact `details` schemas).
2. Idempotency key scope, retention and persistence mechanism.
3. Guest API paths and exact session error behavior.
4. Parsed-data normalized-field allowlist.
5. Numeric rate limits and retry headers.
6. Active-profile default and 10-resume limit enforcement timing.
7. Exact two-track stage mapping table.

These are catalog decisions, not reasons to invent code or alter the database baseline now.

## 7. Acceptance tests

1. No NestJS default error shape escapes the global error filter.
2. Same checksum/owner returns one row, one outbox event and `reused=true`.
3. Cross-user document access returns indistinguishable `404 NOT_FOUND`.
4. Infected/quarantined content never reaches parsed-ready or confirm success.
5. Partial parsing is represented as partial, not failed.
6. Stale confirm returns `409 STALE_REVISION` and makes no canonical change.
7. Same idempotency key/same payload replays success; different payload returns `409`.
8. No response/log contains resume content, paths, tokens, scanner internals or stack traces.

## Final verdict

The common envelope and core error semantics are approved. The previous proposal needs the
corrections above, especially async scan ordering, checksum reuse semantics, ownership-safe 404,
guest-session handling and PII-safe details. Do not start implementation until the seven catalog
items are either decided or explicitly carried as tracked API-catalog gaps.
