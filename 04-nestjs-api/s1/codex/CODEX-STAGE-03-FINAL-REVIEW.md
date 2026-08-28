# Stage-03 Final Codex Review

Date: 2026-08-26
Target: `STAGE-03-NESTJS-API-REQUIREMENTS-SYNC.md`

## Verdict

**APPROVED WITH CHANGES — API CATALOG FREEZE NOT YET READY**

The corrections from Antigravity, FreeBuf, OpenCode, Qoder and the Codex audit are now present
in the draft. Source checks pass for the corrected requirement mapping, status tracks, access
boundary, active-resume rules, profile-save transaction and event contracts.

## Verified corrections

- Four endpoints now use the `/api/v1/resumes/*` catalog convention.
- `API-RESUME-*` labels map to frozen `REQ-RESUME-*` IDs.
- `UserContextClient`/`SystemClient` separation is explicit; document/parsing reads use the
  trusted path with ownership checks because the baseline grants no authenticated direct read.
- `security_scan_status` and `processing_status` are documented as separate tracks.
- Upload-time active-profile selection, 10-resume limit, soft archive and duplicate reuse are
  recorded from PD-002/Guide.
- Confirm includes active-document check, `FOR UPDATE`, expected-revision `409`, history row,
  server-owned fields, `document_role = 'resume'`, one revision bump and
  `candidate.profile.changed` v1 details.
- Application-only resume/snapshot and guest-claim flows are explicit scope boundaries.
- `candidate.profile.changed.v1.json` and `candidate-resume-parsed.v1.json` were source-verified;
  the old report claiming these contracts were missing is not current evidence.

## Remaining decisions before freeze

1. Exact DTOs and HTTP status/error codes.
2. Exact private-storage upload handshake/DTO within the approved signed/private-storage direction.
3. Numeric rate limits.
4. SSE endpoint, connection authentication and recovery envelope.
5. Guest upload/claim API surface.
6. Application-specific resume API catalog entry.
7. Confirm writable-field allowlist and idempotency replay/conflict behavior.
8. Cleanup-sweeper ownership/timing.
9. Optional `REQ-RESUME-007` fast-track name extraction decision.

## Implementation boundary

This review authorizes neither NestJS code nor schema changes. ClamAV sidecar runtime,
NestJS producer implementation and live security-scan E2E remain separate implementation gates.

```text
Stage-03 requirements sync: CORRECTED
Source alignment: PASS
API catalog freeze: PENDING DECISIONS
Coding: NOT AUTHORIZED
```
