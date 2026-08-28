# Phase 05 — Consolidated Agent Validation

Date: 2026-08-27
Target: `04-nestjs-api/PHASE-05-FINAL-REQUIREMENTS.md`

## Agent verdict summary

| Agent | Verdict | Valid findings |
|---|---|---|
| Antigravity | Approved with minor changes | Upload response status clarification; coding correctly blocked |
| FreeBuf | Approved with changes | Missing saved-candidate scope, dispatcher route inventory, `application.status.changed` phased gap |
| OpenCode | Conditional pass/not ready | Requirement-ID coverage, RLS wording/read ownership, stage derivation, referral gap |
| Qoder | Conditional pass | Saved-candidate scope, Phase-3 gap carry-forward, stale open-item wording |
| Codex | Conditional pass | Independent source/exit-criteria review required |
| KiloCode | No report content supplied | No verdict accepted from empty file |

## Independent resolution

The reports were not accepted blindly. Their claims were checked against Phase 1–4 documents,
`17_rls.sql`, `09_applications.sql` and the dispatcher route registry.

Applied corrections:

1. Added `REQ-SAVED-CANDIDATE-001` explicitly to the current scope and coverage index.
2. Added a requirement-ID coverage index for all Phase-1 requirement groups.
3. Clarified RLS: approved personal/catalog reads use UserContextClient + existing RLS policies;
   document/parsing tables without authenticated grants use SystemClient + ownership checks.
4. Added deterministic UI-stage derivation from the two database status tracks.
5. Added Phase-3 `GAP-003..015` carry-forward and explicitly retained referral-program `GAP-005`.
6. Added all seven current dispatcher input routes.
7. Added `application.status.changed` as an expected phased gap; no route was invented.
8. Corrected stale wording in the Stage-03 remaining-decisions document so frozen guest paths and
   stage mapping are not presented as open alternatives.

## Remaining blockers

These remain honest API-catalog work, not silently finalized requirements:

- exact DTO field-level schemas and per-code error-details schemas;
- idempotency retention and persistence mechanism;
- parsed-data/confirm field-by-field allowlist, especially sensitive fields;
- numeric rate-limit values and environment configuration;
- complete API catalog coverage and acceptance tests for every requirement ID.

## Final verdict

`PHASE-05-FINAL-REQUIREMENTS.md` is now **APPROVED WITH CHANGES — FINAL REVIEW REQUIRED**.

It may proceed to the final independent coverage check and then Phase 6 API catalog. It must not
be labelled `FINAL REQUIREMENTS FROZEN` until the remaining blockers are either resolved or
explicitly assigned to Phase 6 with owners and acceptance criteria.

Coding remains not authorized.
