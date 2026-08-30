# OpenCode — IMPLEMENTATION TRACKER ARCHITECTURE REVIEW

## 1. Commit and repository state verified

- **Current HEAD:** `bd427b103137b421658832c3874a900d755af956` — `docs(nestjs-api): align tracker review ownership and next step`
- **Branch:** `main`
- **Git status:** clean working tree except untracked `04-nestjs-api/Agent_review/**` review folders (this audit is read-only; nothing modified).
- **Tracker file verified:** `04-nestjs-api/project-docs/implementation-records/IMPLEMENTATION-TRACKER-HINGLISH.md` (218 lines, "Last updated: 29 August 2026").
- **Verification performed:** full jest run at HEAD (33 suites / **195** tests, exit 0), `node --check` on smoke scripts, `git show` of the commit, plus three parallel read-only explorations covering (a) security/integration architecture, (b) requirements→API coverage, (c) smoke-script behavior vs tracker claims. All agent findings were cross-checked against source (e.g., CSRF grep, cookie config) by the reviewer.

## 2. Executive verdict

**APPROVED WITH REQUIRED TRACKER FIXES**

The project direction is correct and the large majority of tracker claims are accurate and genuinely backed by code/SQL/tests. However, the tracker is **not safe to follow verbatim** because:

1. **Phase 09-A marks cookie/CSRF/CORS verification as `VERIFIED & COMPLETE`, but CSRF protection does not exist** in the code (only `sameSite:'lax'` partial mitigation). A follower could ship believing CSRF is handled.
2. **Test-evidence number is wrong** (claims 193 tests; HEAD is 195).
3. **Referrals (§14, APPROVED first-production) and guest feedback (§16, explicitly registered+guest) are presented as "pending finalize/test" items, implying they exist** — but neither has any API or contract. They are MISSING, not pending.

These are tracker-accuracy defects, not fundamental architecture failures. Fix the tracker and the plan is sound to follow.

## 3. Is the project direction correct?

**Yes.** The requirements → approved decisions → Phase 00–08 planning → Phase 09 execution approach is coherent:

- No implemented NestJS controller lacks a backing requirement (verified by requirements→API mapping).
- No invented table/column/event/route/provider was found; the AI/resume/interview/job pipelines are event/task-driven exactly as `contracts/events` + `contracts/tasks` define.
- Foundation, auth (incl. JWKS/ECC), DTO hardening, company/member/ownership authorization, outbox + `SKIP LOCKED` dispatcher, and FastAPI worker with `processed_events` idempotency are real and architecturally sound.
- The tracker honestly separates unit-test evidence from live Dev/Test SQL evidence and from production/deployment proof (a strength — it does **not** falsely mark unit tests as live/E2E proof).

## 4. Tracker accuracy audit

| ID | Tracker section / item | Classification | Evidence | Required correction |
|----|------------------------|----------------|----------|---------------------|
| T1 | 09-A: "Access-cookie/refresh-cookie path, CSRF/CORS, proxy/trust … verify" `[x]` | **INCORRECT/OVERSTATED** (CSRF) | Cookies `httpOnly/secure/sameSite:'lax'` present (`auth-provider.ts:51-56`); CORS (`main.ts:11`) + `TRUST_PROXY` (`config.ts:19`) present; **CSRF token = ABSENT** (`grep csrf\|xsrf\|double-submit` = 0). `sameSite:'lax'` partially mitigates CSRF. | Re-label CSRF as a **PENDING required security gate**; do not claim "verified". Note `sameSite:'lax'` mitigation. |
| T2 | 09-A regression: "33 suites / **193 tests** passed" | **INCORRECT/OVERSTATED** (minor) | Head jest = **33 suites / 195 tests**, exit 0 (`jest-head.log`). Suite count matches; test count off by 2. | Correct to 195. |
| T3 | 09-A: JOSE/JWKS asymmetric verification | **VERIFIED COMPLETE** | `security/jwt-verifier.ts`, `config.ts` JWKS derivation, `a36bd0d` non-local enforcement, `test:jwt` passed (prior review). | none |
| T4 | 09-B: HTTP DTO validation hardening `[x]` | **VERIFIED COMPLETE** | 32 `@Body()` all class DTOs with decorators; global `ValidationPipe({whitelist,forbidNonWhitelisted})` (`main.ts:11`, `validation-pipe.spec.ts`); grep `@Body() any` = 0. | none |
| T5 | 09-B: member-invite rejects inactive branch/dept/team/manager `[x]` | **VERIFIED COMPLETE** | `membership.ts:27-32` (active checks + throw). | none |
| T6 | 09-B: `GET\|PATCH /companies/:companyId/settings` + audit `[x]` | **VERIFIED COMPLETE** | `company-settings.ts:39-44`; owner/admin auth; audit row. | none |
| T7 | 09-B: identity/company integration smoke `[x]` | **IMPLEMENTED BUT NOT LIVE-VERIFIED** (opt-in) | `scripts/identity-company-integration-smoke.js` exists; agent confirmed real-DB + rollback + cross-company FK reject; runs only with `RUN_IDENTITY_COMPANY_INTEGRATION=true`. | Keep as opt-in live evidence; note CI does not run it by default. |
| T8 | 09-B: RLS integration smoke (line 63) | **IMPLEMENTED BUT NOT LIVE-VERIFIED** (opt-in) | `scripts/rls-integration-smoke.js`; agent confirmed `authenticated`+claims, own=1 / cross=0; opt-in `RUN_RLS_INTEGRATION`. | Same; expand RLS coverage beyond `candidate_profiles` (see T19). |
| T9 | 09-B: ownership transfer safety guards | **PARTIALLY COMPLETE** | `ownership.ts:13-25` (self/owner/active-user guards + audit). But no guard preventing promotion of a dept head / team lead / active manager to owner (`membership.ts:61-62,74-75` guard only deactivate/leave). | Add transfer head/lead/manager check or document as accepted. |
| T10 | 09-E referrals listed as pending "finalize/test" | **MISSING** (maturity overstated) | §14 APPROVED first-production; **no referral controller/route**; **no `contracts/events\|tasks` referral schema** (agent-2). Tracker implies existence. | State referral API + contract are **entirely unimplemented**, not just pending tests. |
| T11 | 09-G: "Feedback registered/guest flow … test" | **MISSING** (maturity overstated) | §16 explicitly registered **and guest**; only `POST /api/v1/feedback` exists, requires `AuthGuard` and hardcodes `is_guest=FALSE` (`feedback.ts:42`); no anonymous path. | State guest-feedback API is **absent**; add as missing work. |
| T12 | 09-F messaging/chat | **MISSING** (tracked pending) | No conversation/message controller (agent-2). Tracker lists as plan/contract-pending — consistent. | Ensure contract planned before enable. |
| T13 | 09-F notifications + SSE/realtime | **MISSING** (tracked pending) | No notification read/list/subscribe controller, no SSE/WS gateway (agent-2). Tracker pending — consistent. | none beyond tracking. |
| T14 | 09-D job search / candidate search | **MISSING** (intentionally deferred) | No search controller; `job-search-query.ts`/`candidate-search-query.ts` are builders only. Tracker explicitly notes wiring absent pending contract freeze. | Acceptable; record as first-production requirement deferred. |
| T15 | 09-G analytics read/reporting | **PARTIALLY COMPLETE** | Only `POST /api/v1/analytics/events` ingest; no read/dashboard (agent-2). Tracker "partially implemented" — consistent. | none |
| T16 | Outbox / Dispatcher / FastAPI | **IMPLEMENTED BUT NOT LIVE-VERIFIED** (release gates pending) | `outbox_events`+`processed_events`+`claim_outbox_events` w/ `SKIP LOCKED` (`02-database/migrations/baseline/15_infrastructure.sql:23,91,105,149`); NestJS writers (`applications.ts:115`, `resume.ts:79`, etc.); dispatcher Cloud Tasks publisher (`05-outbox-dispatcher-nestjs`); FastAPI `processed_events` idempotency (`07-fastapi-ai-worker/app/core/database.py:197,251`). Release-gate checkboxes `[ ]` correctly pending. | Keep gates; document outbox backlog/retention while dispatcher not yet live. |
| T17 | "Next actionable step" = Codex continues 09-B | **PARTIALLY CORRECT** | 09-B Dev/Test integration tests are a reasonable next batch. But CSRF (T1) must be opened as an explicit security gate, and missing APIs (T10/T11) clarified, before production readiness. | Add CSRF gate + missing-API clarification to the next step. |
| T18 | UserContextClient JWT handling | **ARCHITECTURAL NOTE** (not blocker) | `clients.ts:12` base64-decodes JWT claims **without signature verification**, trusting upstream `AuthGuard` (all call sites are `@UseGuards(AuthGuard)`). Latent trust-boundary risk if ever called outside a guard. | Document trust boundary; optionally verify signature inside client or assert guard precedence. |
| T19 | RLS tenant-isolation coverage | **PARTIALLY COMPLETE** | RLS smoke covers `candidate_profiles` only; other tenant tables (company_members, jobs, applications, etc.) not smoke-verified for cross-tenant leakage. | Expand RLS smoke to all tenant tables or record coverage gap. |

## 5. Missing requirements or omitted work

Requirement-present items with **no API and no contract** (some are honestly marked pending in the tracker, but two are misrepresented as existing):

- **Referrals (§14, APPROVED first-production):** no controller, no `contracts/events|tasks` referral schema. Tracker 09-E frames it as pending "finalize/test" — should state it is entirely unbuilt.
- **Guest feedback (§16, explicit registered + guest):** only registered (auth-gated) endpoint exists; no anonymous guest-feedback path.
- **Messaging / chat (§15):** no API/contract (tracker pending — OK).
- **Notifications + SSE/realtime (§15):** no API/contract (tracker pending — OK).
- **Job discovery/search (§9) and candidate recruiter search/matching (§10):** deferred by tracker pending route/DTO/permission contract freeze — acceptable but they are APPROVED first-production requirements currently absent.
- **Analytics read side (§16):** only ingest exists.
- **Explicit CSRF control (security, not a product requirement but a production gate):** absent; only `sameSite:'lax'` mitigation.
- **RLS cross-tenant verification** limited to `candidate_profiles` (T19).

Not missing: subscriptions/billing, admin modules are PLANNED/future and the tracker does not over-claim them.

## 6. Incorrect or overstated completion claims

1. **Phase 09-A CSRF/CORS verification `[x]`** — CSRF mechanism does not exist. Overstated (see T1).
2. **Test count "193"** — actual 195 at HEAD (see T2).
3. **Referrals "finalize/test" (09-E)** — implies an existing feature; it is entirely unimplemented (T10).
4. **Guest feedback "registered/guest flow … test" (09-G)** — implies both flows exist; only registered exists (T11).

All other completion claims (JWKS, DTO hardening, member-invite inactive rejection, company-settings GET/PATCH+audit, ownership-transfer base guards, outbox/dispatcher/FastAPI structure, smoke-script behaviors) were verified as accurate.

## 7. Phase order and dependency review

- **09-A → 09-B → 09-C → 09-D → 09-E → 09-F → 09-G → Dispatcher/FastAPI+security+load+CI/CD → pre-prod E2E → prod readiness** is a sound topological order for the NestJS API.
- **Concern:** Phase 09-A is marked `VERIFIED & COMPLETE` while CSRF (a security control) is unaddressed. Security gates should be closed before "Production readiness approval"; the tracker should not present 09-A as fully closed until CSRF is explicitly resolved (T1).
- **Concern:** Phase 09-C's "FastAPI worker result / `processed_events` idempotency / stale-revision E2E" depends on the Dispatcher + FastAPI worker being live, which the release order places **after** 09-G. This is acceptable because those 09-C E2E items are already unchecked/pending, but it means 09-C cannot be declared complete before the dispatcher gates pass. The ordering itself is fine; just ensure 09-C is not closed prematurely.
- **Dependency correctness:** outbox writers exist in NestJS before the dispatcher is deployed — acceptable because events can queue; the tracker should record outbox backlog/retention behavior during that window (T16).
- Job-approval default `false` forward-migration/backfill is correctly flagged as a pending production decision (aligns with AGENTS.md: post-freeze changes are forward-only).

## 8. Security, data isolation and transaction review

- **JWT/JWKS:** Sound. Asymmetric (ES256/RS256 via JWKS) preferred; HS256 legacy only local/test; algorithm list coupled to key type (no confusion); fail-closed; issuer/audience enforced non-local (prior reviews + `config.ts`).
- **Cookies:** `binay_access_token`, `binay_refresh_token`, `binay_presence_session` are `httpOnly`, `secure`, `sameSite:'lax'`; refresh cookie scoped to `/api/v1/auth/refresh`. Good hygiene. **CSRF token absent** — `sameSite:'lax'` mitigates cross-site POST, but an explicit double-submit/CSRf token is not implemented and should be a documented decision (T1).
- **RLS / user context:** `UserContextClient` runs `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', …)` and enforces SELECT-only (`clients.ts:10,14,15`). RLS smoke proves own-row=1 / cross-row=0 for `candidate_profiles`. Other tenant tables not smoke-covered (T19). **Note:** client decodes JWT claims without verifying signature, relying on `AuthGuard` (T18).
- **Tenant isolation (DB):** FK constraints enforce it (`company_members_branch_tenant_fk` rejected in smoke); ownership-transfer and member guards in services.
- **Trusted access / authorization:** service-level ownership/role checks present (company-settings owner/admin, membership owner/deactivate guards, application status actors). No API was found that bypasses tenant/ownership checks.
- **Audit:** `audit_logs` writes present for company-settings update and ownership transfer.
- **Idempotency:** outbox + `processed_events` (`ON CONFLICT DO NOTHING`) + `event_processing_leases` dual guard in FastAPI; global idempotency is correctly NOT over-claimed (09-A note). Application/registered-apply idempotency still listed as pending tests (09-D) — appropriate.
- **Atomicity:** outbox/history/audit writes are within transactions; all smoke scripts wrap writes in `BEGIN…ROLLBACK` and refuse `NODE_ENV=production`. Correct.

## 9. Test-evidence review

- **Unit-test evidence:** `npm test` (jest) = **33 suites / 195 tests passed, exit 0** at HEAD. Strong coverage of DTOs, auth boundary, identity/company, candidate, resume, guest, jobs, applications, saved-candidates, interview, config, jwt-verifier. *(Tracker's 193 is wrong — T2.)*
- **Integration-test evidence (script-based, opt-in, live Dev/Test, rolled-back):** `identity-company-integration-smoke.js`, `rls-integration-smoke.js`, `company-settings-integration-smoke.js`, `interview-integration-smoke.js` all exist and (per agent-3 source read) issue **real SQL against a live DB inside a rolled-back transaction**, with opt-in `RUN_*` guards and production refusal. These are genuine SQL/integration proofs but are **NOT executed in default CI** — they are opt-in live evidence only.
- **Live Dev/Test evidence (claimed by tracker, 29 Aug):** Vertex AI live `2/2` passed (per tracker text; not re-run by this review). Smoke scripts claimed passed in a Dev/Test run.
- **Production / deployment evidence:** **NONE.** The tracker explicitly states these smokes/unit tests are "not HTTP auth integration or production deployment proof." Correct and honest.
- **Missing evidence:** (a) CSRF control absent (no test possible); (b) cross-company **HTTP** negative tests pending (09-B); (c) ClamAV runtime + guest end-to-end flow pending (09-C); (d) notifications/SSE/messaging — no tests (no API); (e) referrals — no tests (no API); (f) job/candidate search — no tests (no API); (g) RLS cross-tenant verification limited to `candidate_profiles` (T19).
- **Unit-vs-live conflation:** The tracker does **NOT** incorrectly mark unit tests as live/E2E proof — it repeatedly separates the three tiers. This is a strength, not a defect.

## 10. Required tracker changes before following it

1. **T1:** In Phase 09-A, change the CSRF/CORS bullet from `[x]` (verified) to a **PENDING required security gate**; document that CSRF is currently mitigated only by `sameSite:'lax'` and that an explicit CSRF token is a pre-production decision. Do not mark 09-A fully `VERIFIED & COMPLETE` until CSRF is resolved.
2. **T2:** Correct the regression line to **"33 suites / 195 tests passed"**.
3. **T10:** In Phase 09-E, state explicitly that **referrals have no API and no contract** (MISSING), not merely pending "finalize/test". Flag §14 first-production scope at risk.
4. **T11:** In Phase 09-G, state explicitly that **guest feedback has no API** (only registered, auth-gated, `is_guest=FALSE`); add as missing work.
5. **T9:** Add an ownership-transfer decision: prevent promoting a department head / team lead / active manager to owner, or document as accepted.
6. **T18:** Add a security-design note on `UserContextClient` JWT-claims trust boundary (signature verified upstream by `AuthGuard` only).
7. **T19:** Expand RLS smoke coverage to all tenant tables, or record the cross-tenant verification gap.
8. **T16:** Note outbox backlog/retention behavior while the Dispatcher/FastAPI is not yet live (pre-prod gate).
9. **T17:** Update "next actionable step" to include opening the CSRF security gate and the T10/T11 missing-API clarifications.

No source, SQL, contract, configuration, test or tracker file was modified by this review.

## 11. Final recommendation

- **Is this tracker safe to follow?** *Partially* — **after** applying the required tracker fixes above. As written, a follower could (a) believe CSRF is handled and skip a real security gate, and (b) believe referrals and guest feedback already exist and only need testing. Both are incorrect. Once T1/T2/T10/T11 are corrected, the tracker accurately reflects state and is safe to drive the remaining phases.
- **Is the project direction correct?** **Yes.** Requirements→decisions→phases→implementation is coherent; no invented APIs/tables/events; no API without a requirement; security architecture (JWKS, RLS, outbox, idempotency) is sound.
- **What is the next correct phase/batch?** Continue **Phase 09-B** Dev/Test integration tests (identity/company, cross-company HTTP negatives, cookie-domain/env values, HR permission-key freeze) **and** open **CSRF** as an explicit required security gate. Then proceed 09-C → 09-D, keeping Dispatcher/FastAPI + security + load + CI/CD gates as pre-prod prerequisites.
- **Are any decisions/reviews required before proceeding?**
  - A **dedicated security review** of CSRF approach and the `UserContextClient` JWT-trust boundary before production readiness.
  - **Scope confirmation:** is Referrals (§14) truly first-production or explicitly deferred? The tracker currently implies it is partially built; it is not.
  - **Guest-feedback scope:** confirm whether anonymous guest feedback is first-production or deferred.
  - **AI provider/model/cost decision (09-G)** and **configurable rewards/subscriptions** remain PENDING DECISION — correctly flagged; do not implement without approval.

**Overall status after fixes:** `NESTJS API IN PROGRESS — PRODUCTION RELEASE GATES OPEN` remains accurate, provided the CSRF gate and the two missing-API clarifications are added.
