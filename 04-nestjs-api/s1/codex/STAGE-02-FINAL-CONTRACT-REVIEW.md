# Stage 2 — Final Contract Draft Review

Date: 2026-08-26
Reviewed reports:

- `s1/stage2/antigravity-STAGE-02-CONTRACT-DRAFT-REVIEW.md`
- `s1/stage2/freebuf-STAGE-02-CONTRACT-DRAFT-REVIEW.md`
- `s1/stage2/kilo-STAGE-02-CONTRACT-DRAFT-REVIEW.md`
- `s1/stage2/opencode-STAGE-02-CONTRACT-DRAFT-REVIEW.md`
- `s1/stage2/qoder-STAGE-02-CONTRACT-DRAFT-REVIEW.md`

## Final verdict

**APPROVED WITH CHANGES — IMPLEMENTATION IN PROGRESS; CONTRACT FREEZE NOT READY**

All agents agreed that the contract direction is sound, but the repository still has
runtime and compatibility gaps. No agent's “ready” wording is treated as a freeze
approval when the actual handler, registry and queue artifacts are missing.

## Cross-agent consensus

| Area | Consolidated result |
|---|---|
| Document-ID-only security task | Correct and aligned with Stage 1 |
| `storage_url` removal | Correct; draft v1 was not released, so the explicit amendment is acceptable |
| Candidate parsed event | Needed, but envelope fields were initially incomplete; now corrected |
| Security result schema | Needed; initial draft had non-approved `quarantined` and `version` fields; now aligned with Stage 1 |
| JSON Schema | New contracts use Draft 2020-12; existing Draft-07 contracts are unchanged |
| Security route | Registry/task contract alignment verified in dispatcher compatibility tests |
| Projection route | `candidate.projection.rebuilt` remains an output event and must not be dispatched back to the projection handler |
| Worker integration | Security task model/handler implemented; ClamAV runtime remains pending |
| Queue | `security-scan-queue` provisioning artifact is still missing |

## Corrections applied after review

1. `candidate-resume-parsed.v1.json` now requires `schema_version`, `event_id`,
   `occurred_at`, and the complete outbox envelope.
2. `security-scan-result.v1.json` now follows the Stage 1 approved shape:
   - verdict: `clean | infected | error`
   - scanner: `provider`, `engine_version`, `signature_version`
   - bounded timestamp, duration, file size, checksum, threats and error metadata
3. Raw resume content, signed URLs, credentials, tokens and unnecessary PII remain
   forbidden.

## Remaining blockers before freeze

1. Complete producer → outbox → dispatcher → worker envelope compatibility coverage; the
   security-task schema/model and dispatcher payload compatibility tests now pass, but the
   NestJS API producer path is not yet implemented.
2. Refresh `uv.lock` in a network-enabled environment after the `clamd` dependency is
   installed/declared; do not hand-edit the lockfile.
3. Verify the private ClamAV daemon and `security-scan-queue` retry/dead-letter policy.
4. Complete the live security-scan E2E path before declaring freeze.

## Important boundary

Contract drafts are now internally corrected, but implementation is not complete.
The security handler must own the scanner call outside the DB transaction and perform
the guarded status/result/outbox transition inside one transaction. The parser must
re-check clean status; this is a state guard, not a second antivirus scan.

## Current status

```text
Agent review                 COMPLETE
Contract draft corrections   COMPLETE
JSON syntax validation       PASS
Dispatcher/worker alignment  IMPLEMENTED; dispatcher 12 suites/104 tests PASS
Queue provisioning           ARTIFACT IMPLEMENTED; live verification pending
Scanner/unit tests           ADDED; FastAPI non-integration suite 311 PASS
Compatibility tests          Security schema/model + dispatcher payload PASS; producer path PENDING
Local ClamAV daemon          NOT AVAILABLE on current machine (Docker/clamd absent)
Stage 2 contract freeze      NOT READY (producer compatibility + ClamAV/runtime gates remain)
```
