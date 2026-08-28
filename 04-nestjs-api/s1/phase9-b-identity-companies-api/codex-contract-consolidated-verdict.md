# Phase 09-B API Contract Freeze — Consolidated Verdict

Date: 2026-08-26  
Reviewers: Codex, Antigravity, Cline, Freebuff, Opencode

## Verdict

```text
CONDITIONAL PASS — CONTRACT WORKSHEET REQUIRES DECISIONS BEFORE CONTROLLER CODING
```

Agents agree that the worksheet is honest and does not invent paths or DTOs. However, Cline and Opencode correctly identified material freeze gaps: owner/admin derivation, exact RLS/trusted-read disposition, outbox behavior, and membership command decomposition. These clarifications have been added to the worksheet.

## Decisions applied

- Membership is decomposed into invite, accept, deactivate, leave and rejoin commands.
- `rejoin` reactivates the existing membership row; no duplicate row is created.
- Actor remains `NEEDS_DECISION` where the catalog does not explicitly define it; no “invited user” permission is silently assumed.
- Owner/admin derivation is explicitly pending mapping of `companies.owner_id`, membership roles/permissions and platform-admin boundary.
- Company-table reads use trusted NestJS authorization when no explicitly approved direct RLS policy exists; UserContextClient is limited to approved personal/catalog reads.
- Outbox event is emitted only with an approved versioned contract and registered route; no event is invented.

## Not accepted from reviews

Antigravity’s unconditional PASS is not sufficient because all contract rows were still `TBD`. Freebuff’s minor-only classification understates the need to split membership actions before DTO freeze. Opencode’s suggestion to treat rejoin as a new row conflicts with the previously frozen same-row policy and was rejected.

## Current state

```text
Worksheet structure: APPROVED
Paths/DTOs: PENDING HUMAN/PRODUCT-CONTRACT DECISIONS
Controller coding: NOT AUTHORIZED YET
Next gate: resolve NEEDS_DECISION rows, then independent re-review
```
