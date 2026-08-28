# Phase 6 — NestJS API Catalog Review (Independent, expanded catalog)

**Audit target:** `04-nestjs-api/PHASE-06-API-CATALOG.md` (expanded version, 26-08-2026 19:59, 44016 bytes)
**Auditor:** Cadence (Senior NestJS API, PostgreSQL/RLS, Security and Distributed-Systems Reviewer)
**Date:** 2026-08-26
**Report:** `04-nestjs-api/04-nestjs-api-app/s1/phase6/cadence-phase6-api-catalog-review.md`

> Method notice — **independent**. The catalog was substantially expanded since the last review
> (from resume/guest only to full-domain entries §3A–§3H). I re-read the complete file and
> cross-checked every entry against `PHASE-05`, Stage-03 decisions, the SQL baseline, `contracts/`,
> the dispatcher registry and the FastAPI worker. I did **not** inherit the earlier `antigravity` /
> `codex` / `freebuf` / `qoder` / `opencode` reviews. No automated test executed (PowerShell blocks
> `npm.ps1`); **no test claimed passed**. Findings are static-source cross-checks.

---

## 1. Final Verdict

### `CONDITIONAL PASS`

The expanded catalog is a large step forward and the vast majority of entries are accurate and
non-invented: the seven dispatcher routes, worker-output boundaries, saved-candidate uniqueness,
guest rules, transaction/outbox semantics, UserContextClient/SystemClient split, and all `TBD`
markers are honest. **However**, one **HIGH** issue introduces an invented business rule
(API-RESUME-001 "approved onboarding rule" default) that silently resolves an explicitly open
product decision, and one **MEDIUM** issue narrows the referral actor/permission against the
approved requirement. These must be corrected before `API CATALOG FROZEN`. Because paths/DTOs for
most domains remain `TBD` per §7 exit criteria, the catalog cannot be marked frozen yet.

---

## 2. Sources inspected

1. `AGENTS.md`
2. `04-nestjs-api/PHASE-05-FINAL-REQUIREMENTS.md`
3. `04-nestjs-api/PHASE-01/-02/-03/-04-*.md`
4. `04-nestjs-api/DECISION-01`, `DECISION-02`, `DECISION-03`, `DECISION-04`
5. `04-nestjs-api/NESTJS-IMPLEMENTATION-GUIDE.md` (referral capability, guide §14)
6. `04-nestjs-api/04-nestjs-api-app/s1/codex/STAGE-03-REMAINING-DECISIONS.md`
7. `01-requirements/current/MANUAL-REFERRAL-REQUIREMENT.md` + `PD-001`
8. `02-database/migrations/baseline/02,06,07,08,09,10,11,12,15,17` SQL
9. `contracts/events/*`, `contracts/tasks/*`
10. `05-outbox-dispatcher-nestjs/src/routing/event-route.registry.ts`
11. `07-fastapi-ai-worker/README.md`
12. `02-database/schema-docs/PRODUCTION-SCHEMA-BLUEPRINT.md` (referral integrity)

## 3. Scope of the expanded catalog (verified)

All domains named in §5 now have entries:
`API-PLATFORM-001`, `API-AUTH-001`, `API-ONBOARDING-001`, `API-COMPANY-001..003`,
`API-CANDIDATE-001..003`, `API-JOB-001`, `API-SEARCH-001..002`, `API-APPLICATION-001..003`,
`API-SAVED-CANDIDATE-001`, `API-REFERRAL-001..003`, `API-INTERVIEW-001`, `API-MESSAGE-001`,
`API-REALTIME-001`, `API-NOTIFY-001`, `API-ANALYTICS-001`, `API-FEEDBACK-001`, `API-AI-001`,
`API-SUBSCRIPTION-001`, plus resume/guest entries. Most public paths remain honest `TBD`.
---

## 4. Verification matrix (20 review points)

| # | Point | Catalog evidence | Source of truth | Result |
|---|---|---|---|---|
| 1 | Requirement-ID traceability | every entry carries `REQ-*` IDs; §5 coverage list matches Phase-1 groups | PHASE-01/02 | PASS |
| 2 | Method/path accuracy | resume/guest paths concrete; all others `TBD` | PHASE-05 §4; STAGE-03 | PASS |
| 3 | Actor/role/tenant/ownership | per entry; ownership server-derived; **EXCEPT referral (see Issue CB-C2)** | PD-001, REQ-REFERRAL-001 | **FAIL (one entry)** |
| 4 | UserContextClient vs SystemClient | §1 + per-read split correct | DECISION-01; `17_rls.sql` grants | PASS |
| 5 | DTO validation vs schema/contracts | multipart+`use_as_active_profile_resume`, allowlist, revision | `06/07/08*.sql`, PD-002, stage-03 | PASS (see CB-C1 default) |
| 6 | Tables/functions read/written | names match baseline exactly (verified per entry) | SQL 06-12,15 | PASS |
| 7 | Transaction boundaries | business+audit+outbox atomic; external post-commit | PHASE-04 §2; `15_infrastructure.sql` | PASS |
| 8 | Outbox event/contract/route/consumer | route/queue/consumer mappings match registry | registry ALL_ROUTES (7) | PASS |
| 9 | Idempotency & concurrency | Idempotency-Key, checksum reuse, expected revision, terminal-state guards | STAGE-03 §1B/§8, PD-003 | PASS (see CB-C4 for messages) |
| 10 | Rate limits without invented numbers | "environment-configured" everywhere; no numeric values | STAGE-03 §2/§8 | PASS |
| 11 | Audit/security events | actor/provenance/audit retention in every write entry | SQL/RLS | PASS |
| 12 | Error codes & sanitized responses | typed codes; no raw resume/AI/path/token in responses | STAGE-03 §1B | PASS |
| 13 | Acceptance & negative tests | per-entry acceptance; cross-tenant/two-track/stale-revision tests | STAGE-03 | PASS |
| 14 | Guest session & claim rules | active/unexpired/unrevoked, XOR, count/byte limits, claim state machine | `06_documents.sql`, `09_applications.sql`, `guest_claim_status` | PASS |
| 15 | Application-only vs canonical resume | confirm non-promotion explicit; app-only resume separate | PD-002 §§52-59 | PASS |
| 16 | Realtime SSE recovery + WS chat boundary | SSE nudge/REST truth; WS only chat; post-commit push | DECISION-02 | PASS |
| 17 | Saved-candidate privacy & uniqueness | owner-only RLS + `UNIQUE(recruiter_user_id, candidate_id)`; "no job_id (non-job-specific)" | `09_applications.sql` 228-238; `17_rls.sql` 211 | PASS |
| 18 | Referral/interview/notification/AI flows | entries exist; **referral permission narrowed** (see CB-C2) | REQ-REFERRAL-001, PD-001 | **FAIL (one entry)** |
| 19 | Seven dispatcher routes & phased gaps | §6 lists exactly 7; cleanup event now recorded; `application.status.changed` gap | registry ALL_ROUTES | PASS |
| 20 | Worker outputs not routed | `candidate.resume.parsed`, `candidate.projection.rebuilt` = outputs only | registry comments | PASS |
---

## 5. Issue register

### CB-C1 — HIGH — API-RESUME-001 invents an "approved onboarding rule" default
- **Catalog section:** §2 API-RESUME-001, lines 32-33 ("Default: first profile resume is selected
  by the approved onboarding rule; later uploads require explicit candidate choice.").
- **Evidence (source of truth):** `STAGE-03-REMAINING-DECISIONS.md` §11.1 — "Recommended field:
  `use_as_active_profile_resume: boolean`; **final default needs product confirmation**"; PD-002
  requires the candidate to explicitly choose "Use as active profile resume" at upload; no source
  defines an "approved onboarding rule" that auto-selects the first profile resume.
- **Impact:** silently resolves an explicitly OPEN product/business decision; changes
  recruiter-search-visibility semantics for first-time uploads without approval, and could drive
  implementation (and its tests) down a path the product owner never chose. This is exactly the
  kind of invented behavior AGENTS.md and the catalog header forbid.
- **Recommended correction:** delete or re-word the Default line to state the default is
  `NEEDS_PRODUCT_DECISION` (as Stage-03 §11.1), or mark it TBD; do not claim an approved rule.
- **Blocks catalog freeze:** **Yes.** **Blocks coding:** Yes (until product confirms the default).

### CB-C2 — MEDIUM — API-REFERRAL-001 narrows actor/permission vs approved requirement
- **Catalog section:** §3F API-REFERRAL-001, Actor "authorized referrer/HR"; Permission "active
  company/job membership and referral permission".
- **Evidence (source of truth):** `REQ-REFERRAL-001` (PHASE-01 §8) — "Referral capability hai,
  separate recruiter/referrer role nahi; **any eligible active authenticated user** policy pass
  karke refer kar sakta hai"; `PD-001`; `NESTJS-IMPLEMENTATION-GUIDE.md` §14 / line 381;
  `PRODUCTION-SCHEMA-BLUEPRINT.md` §Referral integrity — "Any eligible active authenticated user may
  refer; a dedicated recruiter role is not required".
- **Impact:** the catalog invents a company-membership + permission gate that is not in the
  approved requirement; a referrer without company membership would be incorrectly denied.
- **Recommended correction:** align Actor/Permission to "any eligible active authenticated user";
  note company/job context only as the referral batch scope (job_id), not as a membership gate.
- **Blocks catalog freeze:** Yes (until aligned). **Blocks coding:** No (implementation not started).

### CB-C3 — MEDIUM — Header status line is stale vs expanded content
- **Catalog section:** line 3 Status: `DRAFT — RESUME/GUEST FLOWS CATALOGUED — COMPLETE DOMAIN
  CATALOG PENDING`.
- **Evidence (source of truth):** §3A-§3H now contain detailed entries for AUTH, COMPANY,
  CANDIDATE, JOB, SEARCH, APPLICATION, REFERRAL, INTERVIEW, MESSAGE, REALTIME, NOTIFY, ANALYTICS,
  FEEDBACK, AI, SAVED-CANDIDATE (§5 own claim).
- **Impact:** the status understates the catalog's actual coverage and is internally inconsistent.
- **Recommended correction:** update status to e.g. `DRAFT — ALL DOMAINS CATALOGUED AT DIRECTION
  LEVEL — PUBLIC PATHS/DTO DETAILS PENDING FROZEN` (or equivalent) so the document's text and
  header agree.
- **Blocks catalog freeze:** No (informational/honesty). **Blocks coding:** No.

### CB-C4 — LOW — API-MESSAGE-001 "client message id" idempotency has no schema backing
- **Catalog section:** §3G API-MESSAGE-001 (Idempotency).
- **Evidence (source of truth):** `11_messaging.sql` `messages` table has no
  `client_message_id` / `idempotency_key` column; no idempotency table defines message keys.
- **Impact:** an implementer could invent a column or rely on an undocumented mechanism; REQ-API-003
  idempotency is "APPROVED DIRECTION" so a persisted mechanism is required.
- **Recommended correction:** state the idempotency key must be persisted via an approved mechanism
  (e.g., an idempotency/outbox pattern) or mark the exact mechanism TBD.
- **Blocks catalog freeze / coding:** No.

### CB-C5 — LOW — G-1 contract-envelope reconciliation still not named
- **Catalog section:** §6 guardrails.
- **Evidence (source of truth):** `resume-parse-requested.v1.json` / `candidate-profile-changed.v1.json`
  are flat draft-07 envelopes that do not match the DB `outbox_events` envelope; dispatcher README
  keeps Gate G-1 OPEN.
- **Impact:** the confirm/parse producers need an envelope decision; not recording G-1 leaves an
  ambiguity for implementation.
- **Recommended correction:** add one §6 line naming Gate G-1 (envelope reconciliation before
  producer freeze).
- **Blocks catalog freeze / coding:** No (must be resolved before producer coding).
---

## 6. Blocking matrix

| Issue | Severity | Blocks catalog freeze? | Blocks coding? |
|---|---|---|---|
| CB-C1 `use_as_active_profile_resume` invented default | HIGH | Yes | Yes (until product confirms) |
| CB-C2 referral actor/permission narrowing | MEDIUM | Yes (until aligned) | No |
| CB-C3 stale status line | MEDIUM | No | No |
| CB-C4 message idempotency mechanism | LOW | No | No |
| CB-C5 G-1 envelope reconciliation | LOW | No | No (resolve before producer) |

## 7. Catalog-freeze and coding authorization

- Declared `NO NESTJS IMPLEMENTATION CODE AUTHORIZED` remains correct and is honored.
- `API CATALOG FROZEN` must **not** be declared while: (1) CB-C1 silently invents a product rule,
  (2) CB-C2 mis-scopes referral permission, and (3) §7 exit criteria (concrete paths/DTOs) are still
  `TBD` for most domains.

## 8. Final verdict

### `CONDITIONAL PASS`

- The expanded catalog is accurate and disciplined across ~20 entries; the seven dispatcher routes,
  worker-output boundaries, saved-candidate uniqueness, guest/claim rules, transaction/outbox
  semantics and access-model split are all verified correct against the executable baseline.
- Two correctness issues must be fixed before freeze: **CB-C1 (HIGH)** invented onboarding-resume
  default (silently resolves an open product decision — contradicts Stage-03 §11.1) and
  **CB-C2 (MEDIUM)** referral actor/permission narrowing (contradicts REQ-REFERRAL-001 / PD-001).
  Plus CB-C3 (status line) should be updated for internal consistency.
- **Test evidence:** none executed in this environment; static-source cross-checks only.