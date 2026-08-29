# NestJS API — Remaining Implementation Tracker

**Repository:** `Binay-Job-Portal-App`  
**Scope:** `04-nestjs-api/04-nestjs-api-app` aur uske required integrations  
**Last updated:** 29 August 2026

## Is tracker ka purpose

Ye file sirf **baaki implementation, testing aur release-gate work** track karne ke liye hai. Jo kaam README ya approved decision files me complete/verified hai, use dobara pending nahi maana gaya hai.

## Agent ownership rule

```text
Antigravity  → implementation, tests, fixes aur commit
FreeBuf      → same commit ka read-only review
OpenCode     → same commit ka read-only review
Codex        → same commit ka read-only review + final verification
Antigravity  → teen reviews ko consolidate karke valid fixes apply karega
```

Reviewers source code, SQL, contracts ya configuration modify nahi karenge. Har review **same commit/hash** par hona chahiye. Kisi suggestion ko requirements, migrations, contracts aur tests se verify kiye bina apply nahi karna hai.

## Current implementation snapshot

Already available/implemented slices ko yahan repeat nahi kiya gaya: foundation, authentication core, candidate/resume/guest core, jobs/search groundwork, registered apply, saved candidates, feedback/analytics ingestion aur interview core. In slices ke remaining tests ya contract gates neeche alag se listed hain.

> **Important:** Purane review documents me kuch findings stale ho sakti hain. Neeche diye items ko Antigravity current code, approved decisions aur SQL ke against re-verify karega; stale review ko automatic truth nahi maana jayega.

---

## Phase 09-A — Foundation/auth residual verification

**Status:** `VERIFIED & COMPLETE`

- [x] `UserContextClient` aur `SystemClient` ka separation current repositories/DI graph me verify karna.
- [x] JOSE/JWKS verifier, issuer/audience/expiry checks aur fail-closed behavior ka integration test.
- [x] Access-cookie/refresh-cookie path, CSRF/CORS, proxy/trust settings aur cookie-domain configuration verify karna.
- [x] Auth email-verification callback aur `pending_verification → active` timing ko approved contract se reconcile karna.
- [x] Session revoke semantics (single matching session) aur logout/replay tests.
- [x] Generic idempotency promise sirf wahi rakhna jahan durable DB/domain key available ho; unsupported global guarantee document na ho.


## Phase 09-B — Identity, company aur authorization completion

**Owner:** Antigravity  
**Status:** `PARTIALLY IMPLEMENTED — integration/freeze work baki`

- [ ] Signup, login, refresh, logout aur OAuth callback ka dev/pre-prod integration test.
- [ ] Company create/read/update ka live rollback-safe test.
- [ ] Branch, department aur team create/update/deactivate test.
- [ ] Member invite, accept, leave, rejoin aur deactivate test.
- [ ] Ownership transfer aur owner/member safety-guard test.
- [x] Rollback-safe PostgreSQL company/member hierarchy, tenant-FK aur ownership invariant smoke test (`scripts/identity-company-integration-smoke.js`).
- [ ] Cross-company read/write negative tests; sensitive fields response me leak na hon.
- [ ] HR permission-key mapping ko approved API catalog ke saath freeze karna.
- [x] Member invite me inactive branch/department/team/manager references reject karna (deactivate-and-retain policy).
- [ ] Cookie domain, secure/samesite settings aur deployment env values fill karna.
- [ ] Same-commit review: FreeBuf + OpenCode + Codex; phir Antigravity fixes.

**Latest verification evidence (29 Aug 2026):** `RUN_IDENTITY_COMPANY_INTEGRATION=true node scripts/identity-company-integration-smoke.js` Dev/Test Supabase database ke against pass hua. Cross-company branch assignment `company_members_branch_tenant_fk` se reject hua, hierarchy/ownership invariants verify hue, aur transaction rollback ke baad test rows retain nahi hue. Ye SQL-level evidence hai; HTTP auth/company integration gates abhi pending hain.

RLS user-context smoke (`RUN_RLS_INTEGRATION=true node scripts/rls-integration-smoke.js`) bhi live rollback transaction me pass hua: `authenticated` role + JWT claims ke saath own `candidate_profiles` row 1 aur cross-user row 0.

NestJS regression verification (29 Aug 2026): `npm.cmd test -- --runInBand` = **30 suites / 144 tests passed**, `npm.cmd run build` aur `npm.cmd run lint:types` bhi passed. Resume/guest/application/job guard coverage unit-level hai; ise live ClamAV/guest E2E ka substitute nahi maana gaya hai.

Cross-service Vertex AI live checks (29 Aug 2026): `07-fastapi-ai-worker/tests/integration/test_vertexai_live.py` proxy variables clear karke **2/2 passed**. Ye Vertex provider proof hai; security-scan/ClamAV runtime aur guest end-to-end flow abhi separately pending hain.

## Phase 09-C — Candidate, resume aur AI command completion

**Status:** `CORE PRESENT — end-to-end gates baki`

- [ ] First-resume security scan → parse → review/edit data flow ka live test.
- [ ] ClamAV runtime (local/dev Cloud Run) verify karna; sirf adapter configuration ko success na maana jaye.
- [ ] Clean, infected, quarantined, failed, timeout aur retry states ka UI-safe status mapping test.
- [ ] Resume confirm par canonical facts, revision, audit aur outbox atomicity test.
- [ ] Guest upload/apply/claim flow ka ownership, expiry aur replay test.
- [ ] Approved event schemas ke against producer payload validation.
- [ ] AI command producers ke liye G-1 envelope alignment complete karna; provider/contract missing ho to event invent na karna.
- [ ] FastAPI worker ke result, `processed_events` idempotency aur stale-revision behavior ka E2E test.

## Phase 09-D — Jobs, search aur applications hardening

**Status:** `CORE COMMANDS PRESENT — contract/coverage hardening baki`

- [ ] Job create/update, approval, publish, pause, resume, close aur archive ke full transition tests.
- [x] Approval policy freeze: `company_settings.job_approval_required` ka default `false` (direct publish) rahega; company owner/admin (authorized employer-side actor) ise `true` karke approval required kar sakta hai. Existing submitted jobs ka current workflow change nahi hoga.
- [x] Approval-setting API implemented/frozen: `GET|PATCH /api/v1/companies/:companyId/settings`; owner ya platform admin update kar sakte hain, active members read kar sakte hain; audit + atomic update + validation tests included. Primary-HR/delegated-member mutation ko bina explicit product approval allow nahi kiya gaya.
- [ ] Production rollout ke liye forward migration/backfill policy decide karna; baseline default change pre-prod rebuild ke liye hai, existing deployed company rows automatically change nahi hongi.
- [ ] `daily_job_expiry_sweep` / `expire_due_jobs()` ka schedule, timezone aur notification behavior verify karna.
- [ ] Expired job candidate search se hide ho, lekin existing applications me safe visibility rahe.
- [ ] Public job search aur recruiter candidate search ke exact routes/DTOs freeze karna.
- [ ] Current note: `src/job-search-query.ts` aur `src/candidate-search-query.ts` me bounded SQL builders hain, lekin unke liye controller/service wiring abhi intentionally absent hai; approved route/DTO/permission contract freeze hone ke baad hi wire karna hai.
- [ ] FTS ranking, semantic ranking, filters, cursor validation aur visibility negative tests.
- [ ] Registered apply ka idempotent retry aur immutable snapshot test.
- [ ] Application status transition: allowed actors, terminal states, rejection reason, history/audit aur concurrency test.
- [ ] `application.submitted` v1 payload verify karna; dispatcher route tabhi add ho jab consumer/contract approved ho.
- [ ] Saved-candidate create/list/delete privacy aur unique owner-candidate behavior ka test.
- [ ] Application API ka exact route, request DTO, duplicate response aur actor/permission contract final freeze.
- [ ] Application read/list/detail APIs (candidate aur company views) catalog me missing hon to add/freeze karna.
- [ ] Application status route aur allowed transition matrix ko current SQL function ke saath implement/test karna; terminal reopen reject ho.
- [ ] Job expiry documentation, SQL function aur `daily_job_expiry_sweep` schedule ko ek hi approved source me reconcile karna; conflicting drafts ko archive/mark stale karna.

## Phase 09-E — Referrals aur interview completion

**Status:** `INTERVIEW CORE PRESENT; REFERRAL/REMAINING LIFECYCLE GATES BAKI`

- [ ] Referral invitation, accept/claim, attribution, reissue aur duplicate behavior finalize/test.
- [ ] Referral company/application boundary aur reward terminal-state rules test.
- [ ] Interview scheduled → confirmed → completed/cancelled/no-show transitions test.
- [ ] Reschedule/cancel history, slot release, overlap aur concurrent booking test.
- [ ] Participant authorization aur candidate/HR safe projections test.
- [ ] Calendar/video/summary events tabhi implement karna jab versioned contracts approve hon.
- [ ] Interview minimum lead-time value (current approved value) aur timezone validation freeze/re-test karna.
- [ ] Interview notification/reminder ownership aur `interview.summary.requested` consumer contract ko explicit gate dena.
- [ ] Remaining interview terminal-path tests (completed, cancelled, no-show, terminal immutability) complete karna.

## Phase 09-F — Notifications, SSE aur messaging

**Status:** `PLAN/CONTRACT GATES PENDING`

- [ ] `notifications` table ko source of truth rakhte hue list, unread-count, acknowledge/read APIs freeze/implement karna.
- [ ] Event → notification row → SSE nudge → Next.js header flow implement/test.
- [ ] Offline user ke liye REST recovery; reconnect par missed notification state recover ho.
- [ ] SSE connection par JWT/ticket verification, per-user isolation aur heartbeat/reconnect contract test.
- [ ] WebSocket chat ka participant authorization, durable cursor, reconnect aur missed-message recovery implement/test.
- [ ] Message send/read idempotency aur attachment scan/ownership rules test.
- [ ] Email/provider/template work ko versioned contract aur provider decision ke baad hi enable karna.

## Phase 09-G — Analytics, feedback, AI aur remaining product gaps

**Status:** `PARTIALLY IMPLEMENTED / SOME ITEMS BLOCKED BY DECISION`

- [ ] Analytics metric ownership, permission aur idempotency rules freeze karna.
- [ ] Feedback registered/guest flow ka validation, rate limit, PII aur audit test.
- [ ] AI provider/model/cost decision aur approved producer contracts close karna.
- [ ] Configurable referral rewards, subscriptions aur external search engine ko decision ke bina implement na karna.
- [ ] Accessibility target Next.js release gate me record karna.
- [ ] Har Phase-03 gap ko owner, acceptance criteria aur status ke saath close/defer karna.

## Dispatcher/FastAPI integration release gates

Ye NestJS API ke saath release se pehle parallel infrastructure gates hain:

- [ ] Secret Manager migration; exposed database password aur webhook secret rotate.
- [ ] Queue names, IAM, rate limits, retry policy aur dispatch deadline re-verify.
- [ ] Dedicated least-privilege dispatcher DB role aur pooler/TLS connectivity spike.
- [ ] Real-Postgres integration suite.
- [ ] Multi-dispatcher `SKIP LOCKED` concurrency suite.
- [ ] Cloud Tasks 503, `ALREADY_EXISTS`, worker 401/5xx, crash aur stale-lease failure tests.
- [ ] 1000-event burst/load test with zero-loss/duplicate assertions.
- [ ] Dispatcher metrics, alerts, health/readiness aur graceful shutdown verification.
- [ ] CI/CD: typecheck, lint, unit, integration, contract, secret scan, image scan aur approved deploy gate.
- [ ] Security-scan queue ka actual ClamAV runtime aur final E2E verification.

## Common definition of done (har phase)

### Latest rollback-safe smoke evidence (29 Aug 2026)

Company-settings rollback smoke script `scripts/company-settings-integration-smoke.js` add kiya gaya hai;
ye default `false`, toggle `true`, audit row aur rollback verify karta hai. Explicit Dev/Test database
credentials ke saath ise rollback-safe Dev/Test run me execute kiya gaya.

29 Aug live Dev/Test run me pehle default drift detect hua. Reviewed environment-only
`ALTER COLUMN ... SET DEFAULT false` ke baad script ko actual `CompanyService.create()` lifecycle ke
saath align kiya gaya (company-settings row explicitly insert hoti hai). Final run:
`PASS: default false, toggle true and audit invariant verified` aur
`PASS: transaction rolled back; no smoke rows retained`.
Production rollout ke liye forward migration/backfill abhi bhi pending hai; existing deployed rows
automatically change nahi hongi.

Identity/company smoke aur interview smoke dono Dev/Test Supabase connection ke against pass hue.
Company hierarchy, cross-company FK, ownership transfer, interview booking/participant/confirmation/
reschedule lineage verify hue aur dono transactions rollback ho gaye. Ye HTTP auth integration ya
production deployment proof nahi hai.

1. Approved requirements, SQL baseline, contracts aur existing service behavior cross-check.
2. Implementation + unit tests + relevant integration/E2E tests complete.
3. No invented table, column, event, route, permission ya provider behavior.
4. Transaction ke andar external call nahi; writes/audit/history/outbox atomic.
5. JWT, tenant ownership, RLS boundary, PII redaction aur idempotency verified.
6. README/contract/ADR/runbook links sync.
7. Antigravity commit banaye; FreeBuf/OpenCode/Codex same commit read-only review dein.
8. Reviews consolidate karke sirf valid fixes apply hon; final verification ke baad hi next phase.

## Final release order

```text
09-B Identity/Company
   ↓
09-C Candidate/Resume/AI
   ↓
09-D Jobs/Search/Applications
   ↓
09-E Referrals/Interviews
   ↓
09-F Notifications/SSE/Messaging
   ↓
09-G Analytics/Feedback/remaining decisions
   ↓
Dispatcher/FastAPI + security + load + CI/CD gates
   ↓
Pre-prod full E2E
   ↓
Production readiness approval
```

## Abhi ka next actionable step

Antigravity ko **Phase 09-B Identity & Company integration tests** se start karna hai. Pehle implementation plan/contract ke against code gap list banaye, phir code + tests kare. Uske baad same commit FreeBuf, OpenCode aur Codex ko read-only review ke liye diya jaye.

**Overall status:** `NESTJS API IN PROGRESS — PRODUCTION RELEASE GATES OPEN`
