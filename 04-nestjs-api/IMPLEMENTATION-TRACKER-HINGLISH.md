# NestJS API — Remaining Implementation Tracker

**Repository:** `Binay-Job-Portal-App`  
**Scope:** `04-nestjs-api/04-nestjs-api-app` aur uske required integrations  
**Last updated:** 29 August 2026

### Progress legend

| Marker | Meaning |
|---|---|
| <span style="color:#16a34a">🟢 **COMPLETE** / `[x]`</span> | Evidence-backed and verified |
| 🟡 **PENDING** / `[ ]` | Work, decision or verification still required |
| <span style="color:#2563eb">🔵 **CURRENT**</span> | Currently active sub-step |
| 🔴 **BLOCKED** | Cannot proceed until an external decision/dependency is resolved |

> हर `[x]` item को **🟢 COMPLETE** और हर `[ ]` item को **🟡 PENDING** समझें। Phase heading में status summary दिया गया है ताकि progress तुरंत दिखाई दे।

### Overall sub-step progress

🟢 **18 / 56 sub-steps complete** · 🟡 **38 / 56 pending**

> यह गणना केवल ऊपर दिए गए phase sub-step checklists की है; पुराने detailed task bullets अलग evidence/reference सूची हैं।

## Is tracker ka purpose

Ye file sirf **baaki implementation, testing aur release-gate work** track karne ke liye hai. Jo kaam README ya approved decision files me complete/verified hai, use dobara pending nahi maana gaya hai.

## Agent ownership rule

```text
Codex        → implementation, tests, fixes aur commit
Antigravity  → same commit ka read-only review
FreeBuf      → same commit ka read-only review
OpenCode     → same commit ka read-only review
Codex        → teen reviews ko independently verify karke valid fixes apply karega
```

Reviewers source code, SQL, contracts ya configuration modify nahi karenge. Har review **same commit/hash** par hona chahiye. Kisi suggestion ko requirements, migrations, contracts aur tests se verify kiye bina apply nahi karna hai.

## Current implementation snapshot

Already available/implemented slices ko yahan repeat nahi kiya gaya: foundation, authentication core, candidate/resume/guest core, jobs/search groundwork, registered apply, saved candidates, feedback/analytics ingestion aur interview core. In slices ke remaining tests ya contract gates neeche alag se listed hain.

> **Important:** Purane review documents me kuch findings stale ho sakti hain. Neeche diye items ko Antigravity current code, approved decisions aur SQL ke against re-verify karega; stale review ko automatic truth nahi maana jayega.

---

## 🟢 Phase 09-A — Foundation/auth residual verification

**Status:** `VERIFIED & COMPLETE EXCEPT OPEN CSRF-TOKEN GATE`

**Sub-step progress:** Total **8** · 🟢 Complete **7** · 🟡 Pending **1**

### 09-A sub-step tracking

- [x] <span style="color:#16a34a">UserContextClient/SystemClient boundary verified.</span>
- [x] <span style="color:#16a34a">Supabase ECC/JWKS verification, issuer, audience, expiry and fail-closed checks verified.</span>
- [x] <span style="color:#16a34a">Legacy HS256 path isolated to explicit local/test fallback.</span>
- [x] <span style="color:#16a34a">Access/refresh/presence cookie paths and security flags verified.</span>
- [x] <span style="color:#16a34a">Email verification status transition verified.</span>
- [x] <span style="color:#16a34a">Single-session revoke and logout behavior unit-tested.</span>
- [x] <span style="color:#16a34a">Domain-specific idempotency boundaries documented.</span>
- [ ] <span style="color:#ca8a04">Explicit CSRF-token strategy decided and production-tested.</span>

- [x] <span style="color:#16a34a">`UserContextClient` aur `SystemClient` ka separation current repositories/DI graph me verify karna.</span>
- [x] <span style="color:#16a34a">JOSE verifier: current Supabase ECC signing keys ke liye JWKS (`SUPABASE_JWKS_URL`, ya `SUPABASE_URL` se derived endpoint) primary hai; explicit legacy HS256 fallback sirf local/test ke liye. Issuer/audience/expiry checks aur fail-closed behavior maintained.</span>
- [x] <span style="color:#16a34a">Access-cookie/refresh-cookie path, CORS, proxy/trust settings verify karna; `SameSite=Lax` current CSRF mitigation hai.</span>
- [ ] <span style="color:#ca8a04">Explicit CSRF-token strategy ko production security gate ke roop me decide/verify karna; ise abhi complete claim nahi maana jayega.</span>
- [x] <span style="color:#16a34a">Auth email-verification callback aur `pending_verification → active` timing ko approved contract se reconcile karna.</span>
- [x] <span style="color:#16a34a">Session revoke semantics (single matching session) aur logout/replay tests.</span>
- [x] <span style="color:#16a34a">Generic idempotency promise sirf wahi rakhna jahan durable DB/domain key available ho; unsupported global guarantee document na ho.</span>

---

## 🟢 Next.js Web Frontend — Vertical Slice 1: Foundation + Auth Core & Auth UI (Batch 1, 2 & 3)

**Primary Implementer:** Anti-Gravity  
**Reviewers:** FreeBuf, OpenCode, Codex  
**Status:** `BATCH 1, 2 & 3: FULLY IMPLEMENTED & VERIFIED, FRONTEND TESTS PASS (45/45), BACKEND TESTS PASS (217/217), REAL AUTH PUBLIC SIGNUP INTEGRATION FLOW PASS (100%), BUILD PASS`

### Batch 1 Sub-step Tracking
- [x] <span style="color:#16a34a">Next.js 15 App Router scaffold, TypeScript strict config, Tailwind CSS, Jest setup initialized in `03-nextjs-web/03-nextjs-web-app/`.</span>
- [x] <span style="color:#16a34a">Standardized API envelopes (`src/types/api.ts`) and Auth models (`src/types/auth.ts`) defined and reconciled with backend DTOs (`SignupRequest.role` removed).</span>
- [x] <span style="color:#16a34a">Error handling standard and `AppApiError` class with correlation IDs implemented (`src/lib/errors.ts`).</span>
- [x] <span style="color:#16a34a">Centralized typed `ApiClient` with cookie credentials, correlation headers, auto-retry on 401 implemented (`src/lib/api-client.ts`).</span>
- [x] <span style="color:#16a34a">UI primitives created (`Button`, `Input`, `Label`, `Card`, `Alert`, `Badge`, `Spinner`).</span>
- [x] <span style="color:#16a34a">Jest setup wired via `setupFilesAfterEnv: ['<rootDir>/jest.setup.ts']`.</span>

### Batch 2 Sub-step Tracking
- [x] <span style="color:#16a34a">Signup UI page (`src/app/signup/page.tsx`) with client validation, loading/error states, and NestJS `POST /api/v1/auth/signup` integration.</span>
- [x] <span style="color:#16a34a">Login UI page (`src/app/login/page.tsx`) with email/password validation, `credentials: 'include'`, loading/error states, safe `redirectTo` open redirect prevention (`getSafeRedirectUrl`), and `POST /api/v1/auth/login` integration.</span>
- [x] <span style="color:#16a34a">Auth Context (`src/context/auth-context.tsx`) for session state management, `GET /api/v1/auth/me` user profile loading, and logout handling.</span>
- [x] <span style="color:#16a34a">UserSummary interface reconciled with NestJS `/auth/me` query response (`first_name`, `middle_name`, `last_name`, `display_name`, `phone`, `avatar_path`) & `getUserDisplayName` helper added.</span>
- [x] <span style="color:#16a34a">Protected Route Edge Middleware (`src/middleware.ts`) intercepting `/dashboard/:path*` unauthenticated access & unit test suite (`src/middleware.spec.ts`) created.</span>
- [x] <span style="color:#16a34a">Client-side `RoleGuard` component (`src/components/role-guard.tsx`) updated with stable `rolesKey` dependencies & unit test suite (`src/components/role-guard.spec.tsx`) created.</span>
- [x] <span style="color:#16a34a">Role-aware entry dashboard pages created (`/dashboard`, `/dashboard/candidate`, `/dashboard/employer`, `/dashboard/admin`).</span>
- [x] <span style="color:#16a34a">Status pages created (`/verify-email`, `/unauthorized`, `/forbidden`).</span>
- [x] <span style="color:#16a34a">Automated frontend unit test suites (`auth-pages.spec.tsx`, `role-guard.spec.tsx`, `middleware.spec.tsx`, `api-client.spec.ts`, `errors.spec.ts`, UI primitives) — **7 suites / 40 tests passing**.</span>
- [x] <span style="color:#16a34a">Backend NestJS test suite executed separately — **33 suites / 195 tests passing**.</span>
- [x] <span style="color:#16a34a">Live NestJS backend auth flow verified — **login → /auth/me → refresh → logout → post-logout 401 verification PASS 100%** (zero tokens in response bodies, HttpOnly cookies verified).</span>
- [x] <span style="color:#16a34a">Production build verified — **auth and dashboard routes added, 0 build errors**. Windows `spawn EPERM` / trace process limits documented as environment-specific.</span>

### Batch 3 Sub-step Tracking — Auth Onboarding Role Selection & Explicit Auto-Confirm Configuration
- [x] <span style="color:#16a34a">Explicit `AUTH_AUTO_CONFIRM_EMAIL` configuration added to Zod schema (`src/infrastructure/config/config.ts`), `.env`, `.env.example`, and config unit test suite. Defaults to `true` in dev/test, and strictly requires explicit variable definition in `preprod` and `production` environments to prevent silent policy drift.</span>
- [x] <span style="color:#16a34a">Approved product decision documented: Current dev/preprod/production environment has email auto-confirm intentionally enabled (`AUTH_AUTO_CONFIRM_EMAIL=true`) because custom domain SMTP is pending. Real email verification (`email_not_verified`) is deferred to the future custom domain/Brevo SMTP phase.</span>
- [x] <span style="color:#16a34a">Supabase Dashboard current Auth configuration recorded: **Allow new users ON**, **Email provider enabled**, **Confirm email OFF**, aligned with the current `AUTH_AUTO_CONFIRM_EMAIL=true` policy. Future SMTP/domain phase will switch to **Confirm email ON** and `AUTH_AUTO_CONFIRM_EMAIL=false`.</span>
- [x] <span style="color:#16a34a">No inference from token absence: `SupabaseAuthProvider.signup` explicitly reads `AUTH_AUTO_CONFIRM_EMAIL` flag; does not infer auto-confirm behavior from `accessToken` absence.</span>
- [x] <span style="color:#16a34a">Recovery & Provisioning Behavior (PF-01, PF-04): (1) Cleanup succeeds → Auth user deleted from Supabase Auth, HTTP 503 ROLE_PROVISIONING_FAILED returned, zero cookies issued. (2) Cleanup fails + suspended fallback succeeds → schema-valid `status = 'suspended'` DB record persisted, subsequent login durably blocked with HTTP 401 UNAUTHORIZED. (3) Cleanup fails + suspended fallback fails → audit metadata records `cleanup_success: false, fallback_success: false` (no false "persisted" claim), HTTP 503 returned, zero cookies issued. (4) Future operational retry/recovery remains an explicit follow-up item if required.</span>
- [x] <span style="color:#16a34a">Row-Count Enforcement: `AuthProviderController.signup()` strictly verifies `rowCount === 1` on UPDATE queries. `rowCount === 0` is treated as provisioning failure and triggers compensating cleanup + audit event + HTTP 503 response (unit tested).</span>
- [x] <span style="color:#16a34a">Manual verification mode (`AUTH_AUTO_CONFIRM_EMAIL=false`): Account remains `pending_verification` while role assignment still succeeds authoritatively via NestJS `SystemClient`.</span>
- [x] <span style="color:#16a34a">Future configuration-only switch-off: Setting `AUTH_AUTO_CONFIRM_EMAIL=false` switches off auto-confirm purely via configuration without code changes; returns `{ status: 'pending_verification' }` requiring email confirmation.</span>
- [x] <span style="color:#16a34a">Email-verification callback slice (COMPLETE): Implemented on Next.js `/verify-email` page adhering 100% to mandatory security rules. Success occurs ONLY when `type === 'signup'` AND a non-empty `access_token` is present AND no error/error_code parameters exist. URL hash scrubbed in-memory. Empirically verified with real Brevo Custom SMTP email delivery, link click verification, and post-confirmation login (7/7 frontend test suites / 49/49 tests passed, 33/33 backend test suites / 217/217 tests passed).</span>
- [x] <span style="color:#16a34a">Uniform `register_as: 'candidate' | 'employer'` naming enforced across backend DTOs, ValidationPipe, frontend interfaces, and unit tests. Omitted `register_as` defaults to `candidate` (unit tested).</span>
- [x] <span style="color:#16a34a">Token request body isolation: Post-signup auto-confirm login passes only `{ email, password }` in the `/token?grant_type=password` request payload (unit tested).</span>
- [x] <span style="color:#16a34a">Trusted role provisioning: NestJS validates `register_as` in `SignupDto` and authoritatively updates `public.users.role` using `SystemClient`. Client `app_metadata` role tampering is untrusted and forbidden.</span>
- [x] <span style="color:#16a34a">Strict role rejection: Signup requests specifying `register_as: 'hr'`, `register_as: 'admin'`, or invalid values are rejected at HTTP boundary with HTTP 400 Bad Request.</span>
- [x] <span style="color:#16a34a">Frontend Candidate vs Employer role selection toggle added to Signup UI (`src/app/signup/page.tsx`).</span>
- [x] <span style="color:#16a34a">Server-role-based post-login redirects verified: `candidate` → `/dashboard/candidate`, `employer` → `/dashboard/employer`, `hr` → `/dashboard/employer`, `admin` → `/dashboard/admin`.</span>
- [x] <span style="color:#16a34a">Frontend unit tests updated & executed — **7 test suites / 45 tests passing (100%)**.</span>
- [x] <span style="color:#16a34a">Backend unit tests updated & executed — **33 test suites / 217 tests passing (100%)**. Includes 15 mandatory test scenarios for the entire failure state-machine, single delete execution, schema-valid suspended DB cleanup fallback, zero-row update failure, and suspended status login rejection.</span>
- [x] <span style="color:#16a34a">Real Email Verification & Brevo Custom SMTP Live Phase Completed: Domain `collabfor.com` authenticated on Cloudflare DNS (SPF, DKIM, DMARC, `auth` branded subdomain). Supabase Custom SMTP enabled (`smtp-relay.brevo.com`:587) with **Confirm Email = ON**. NestJS `AUTH_AUTO_CONFIRM_EMAIL=false` enabled. Real signup flow empirically verified: candidate/employer signup returns HTTP 201 `pending_verification` with zero session cookies, pre-confirmation login rejected with HTTP 401 UNAUTHORIZED (`email_not_verified`), real confirmation email delivered from `noreply@collabfor.com` via Brevo SMTP directly to Primary Inbox. Clicking link in email confirmed account, and post-confirmation login succeeded returning HTTP 201 with session cookies and authoritative profile role from `/api/v1/auth/me` (`status = 'active'`).</span>
- [ ] **Future Production UI Hardening Backlog (Deferred for Motive API Testing):** Future UI work will enforce 11 mandatory requirements: (1) Zero visible Home Page flash, (2) Root hash detection renders minimal loading shell, (3) Safe effect/blocking redirect strategy, (4) Deterministic `/verify-email` state (success / error / pending), (5) No intermediate card flips, (6) Zero SSR/hydration mismatch & console warnings, (7) Immediate hash scrubbing, (8) Zero token storage or custom API forwarding, (9) Slow network and 2nd-click expired-link browser tests, (10) Document as "flash minimized" unless proven zero-flash, (11) Supabase Auth remains sole authority for confirmation tokens and state.

---

## 🟢 Batch 4A — Native Password Recovery & Password Security (COMPLETE — SECURITY REVIEW PASSED)

**Owner:** Codex / Antigravity  
**Status:** `FINAL VERDICT: BATCH 4A SECURITY REVIEW PASSED (100% APPROVED)`  
**Canonical Handoff Path:** `04-nestjs-api/Agent_review/batch-4a/BATCH-4A-SECURITY-AUDIT-HANDOFF.md`  
**Prerequisite:** Completed. Proceeding to Phase 09-B.

### Batch 4A Completed Milestones:
- [x] <span style="color:#16a34a">`POST /api/v1/auth/forgot-password` anti-enumeration endpoint verified: returns identical HTTP 200 generic success for both known (`visheshmahale1994@gmail.com`) and unknown emails.</span>
- [x] <span style="color:#16a34a">Supabase native recovery email via Brevo Custom SMTP (`noreply@collabfor.com`) with `email_redirect_to: http://localhost:3001/reset-password`.</span>
- [x] <span style="color:#16a34a">`/reset-password` unauthenticated recovery callback page implemented: parses recovery token in-memory, scrubs URL hash immediately via `history.replaceState`, routes recovery reset via NestJS backend proxy (`POST /api/v1/auth/reset-password`), redirects to `/login` upon success.</span>
- [x] <span style="color:#16a34a">Approved Proxy Architecture Specification: Recovery token is captured in memory by Next.js and sent only over HTTPS to the NestJS reset-password proxy (`POST /api/v1/auth/reset-password`). NestJS forwards it only to Supabase Auth's native password-update endpoint (`PUT /auth/v1/user`) and never stores, logs, caches, audits or returns it. Supabase Auth remains the sole authority for recovery-token validation and password update.</span>
- [x] <span style="color:#16a34a">CRITICAL-01 Source Fix Resolution: Removed all hardcoded fallbacks and service-role key references from frontend source code (`reset-password/page.tsx`), `.env.local`, and build artifacts. Production bundle scan (`grep_search` on `.next/`) proved `service_role` and JWT keys are **100% ABSENT**. Zero keys shipped to client browser!</span>
- [x] <span style="color:#16a34a">Supabase Key Rotation & Old Key Revocation Verified: Legacy key revoked in Supabase Dashboard (returns `HTTP 401 Unauthorized`), new modern secret key configured in NestJS `.env`.</span>
- [x] <span style="color:#16a34a">Real Brevo Gmail Inbox Recovery Test Verified: Email received in Gmail inbox (`visheshmahale1994@gmail.com`), link clicked, password reset via NestJS proxy (`POST /api/v1/auth/reset-password`), old password rejected (`401`), new password login succeeded (`201`).</span>
- [x] <span style="color:#16a34a">Backend NestJS unit tests executed — **33 test suites / 225 tests passing (100%)**.</span>
- [x] <span style="color:#16a34a">Frontend TypeScript typecheck & Jest unit tests executed — **7 test suites / 64 tests passing (100%)**, `tsc --noEmit` 0 errors, Next.js production build **15/15 static pages generated**.</span>
- [x] <span style="color:#16a34a">`ResetPasswordPage` Component UI Unit Tests Added (`03-nextjs-web/03-nextjs-web-app/src/app/auth-pages.spec.tsx`): 6 deterministic component tests covering missing/expired tokens, form rendering, `apiClient.resetPassword` proxy invocation, success state & `/login` redirect, safe API error handling, and zero token leakage in storage.</span>
- [x] <span style="color:#16a34a">Scope Specification: `ChangePasswordPage` UI is explicitly OUT OF SCOPE for Batch 4A and will be planned in a future frontend slice.</span>

---

## 🟡 Phase 09-B — Identity, company aur authorization completion

**Owner:** Codex  
**Status:** `PARTIALLY IMPLEMENTED — integration/freeze work baki`

**Core milestone progress:** Total **12** · 🟢 Complete **7** · 🟡 Pending **5**

### 09-B sub-step tracking

> Neeche ke 12 items **core milestones** hain. Iske baad diya gaya detailed checklist alag follow-up breakdown hai; uske items upar ke 12-count me include nahi hain.

<div style="color:#2563eb"><strong>🔵 CURRENT SUB-STEP:</strong> Phase 09-B ke remaining live integration gates — password auth, company/member/ownership HTTP flows, cross-company checks, then same-commit reviewer gate.</div>

<div style="color:#2563eb"><strong>🔵 CURRENT SUB-SUB-STEP:</strong> Live password-auth aur company/authorization HTTP verification. Code-gap audits complete hain; evidence: `04-nestjs-api/project-docs/PHASE-09-B-AUTH-CODE-GAP-AUDIT.md` aur `04-nestjs-api/project-docs/PHASE-09-B-COMPANY-CODE-GAP-AUDIT.md`.</div>

- [x] <span style="color:#16a34a">Company/member hierarchy SQL invariants and rollback smoke verified.</span>
- [x] <span style="color:#16a34a">Active branch/department/team/manager reference validation verified.</span>
- [x] <span style="color:#16a34a">Company settings default and audit behavior verified.</span>
- [x] <span style="color:#16a34a">Request DTO typing and strict whitelist validation verified.</span>
- [x] <span style="color:#16a34a">`/me`, session listing and single-session revoke service boundaries unit-tested.</span>
- [x] <span style="color:#16a34a">Organization branch/department/team tenant-boundary unit tests added.</span>
- [x] <span style="color:#16a34a">Opt-in read-only HTTP smoke harness added for `/me`, sessions and company isolation.</span>
- [ ] <span style="color:#ca8a04">Live password signup/login/refresh/logout integration executed; OAuth is deferred.</span>
- [ ] <span style="color:#ca8a04">Live company/member/ownership HTTP flows executed.</span>
- [ ] <span style="color:#ca8a04">Cross-company HTTP negative and sensitive-response checks executed.</span>
- [ ] <span style="color:#ca8a04">Cookie domain and deployed environment values finalized.</span>
- [ ] <span style="color:#ca8a04">Same-commit three-reviewer gate completed for the current 09-B batch.</span>

### 09-B detailed follow-up checklist (separate count)

**Detailed progress:** Total **16** · 🟢 Complete **3** · 🟡 Pending **13**

- [ ] <span style="color:#ca8a04">Password signup, login, refresh aur logout ka dev/pre-prod integration test; OAuth deferred.</span>
- [ ] <span style="color:#ca8a04">Company create/read/update ka live rollback-safe test.</span>
- [ ] <span style="color:#ca8a04">Branch, department aur team create/update/deactivate test.</span>
- [ ] <span style="color:#ca8a04">Member invite, accept, leave, rejoin aur deactivate test.</span>
- [ ] <span style="color:#ca8a04">Ownership transfer aur owner/member safety-guard test.</span>
- [x] <span style="color:#16a34a">Rollback-safe PostgreSQL company/member hierarchy, tenant-FK aur ownership invariant smoke test (`scripts/identity-company-integration-smoke.js`).</span>
- [ ] <span style="color:#ca8a04">Cross-company read/write negative tests; sensitive fields response me leak na hon.</span>
- [ ] <span style="color:#ca8a04">Ownership-transfer ke dauran department head/team lead/active manager references ka explicit product/security decision aur test.</span>
- [ ] <span style="color:#ca8a04">UserContextClient ke decoded JWT claims ka trust boundary (AuthGuard signature verification prerequisite) document/test.</span>
- [ ] <span style="color:#ca8a04">RLS smoke coverage ko `candidate_profiles` se other tenant tables tak expand karna ya accepted coverage boundary record karna.</span>
- [ ] <span style="color:#ca8a04">HR permission-key mapping ko approved API catalog ke saath freeze karna.</span>
- [x] <span style="color:#16a34a">HTTP DTO validation hardening: global `whitelist + forbidNonWhitelisted` ke saath sabhi request DTOs par approved field decorators/allowlists add karke real request-body acceptance verify karna; pipe ko weaken karke bypass nahi karna. Identity/company/candidate/organization/jobs/applications/saved-candidates/feedback/analytics/guest/resume/interview request DTOs typed aur whitelist-safe hain; repo-wide source audit me koi untyped `@Body() any`, interface DTO ya type DTO remaining nahi mila. Full validation coverage aur build verified.</span>
- [x] <span style="color:#16a34a">Member invite me inactive branch/department/team/manager references reject karna (deactivate-and-retain policy).</span>
- [ ] <span style="color:#ca8a04">Cookie domain, secure/samesite settings aur deployment env values fill karna.</span>
- [ ] <span style="color:#ca8a04">Same-commit review: Antigravity + FreeBuf + OpenCode; Codex independently consolidates evidence aur sirf valid fixes apply karega.</span>

**Latest verification evidence (29 Aug 2026):** `RUN_IDENTITY_COMPANY_INTEGRATION=true node scripts/identity-company-integration-smoke.js` Dev/Test Supabase database ke against pass hua. Cross-company branch assignment `company_members_branch_tenant_fk` se reject hua, hierarchy/ownership invariants verify hue, aur transaction rollback ke baad test rows retain nahi hue. Ye SQL-level evidence hai; HTTP auth/company integration gates abhi pending hain.

RLS user-context smoke (`RUN_RLS_INTEGRATION=true node scripts/rls-integration-smoke.js`) bhi live rollback transaction me pass hua: `authenticated` role + JWT claims ke saath own `candidate_profiles` row 1 aur cross-user row 0.

NestJS regression verification (29 Aug 2026): `npm.cmd test -- --runInBand --forceExit` = **33 suites / 195 tests passed**, `npm.cmd run build` aur `npm.cmd run lint:types` bhi passed. `npm.cmd run test:jwt` real ES256/JWKS, HS256 boundary aur missing-sub checks ke saath passed. `npm.cmd run smoke:identity-http` opt-in read-only harness hai; credentials ke bina default skip hota hai, isliye ise live auth proof nahi maana gaya hai. Resume/guest/application/job guard coverage unit-level hai; ise live ClamAV/guest E2E ka substitute nahi maana gaya hai.

Cross-service Vertex AI live checks (29 Aug 2026): `07-fastapi-ai-worker/tests/integration/test_vertexai_live.py` proxy variables clear karke **2/2 passed**. Ye Vertex provider proof hai; security-scan/ClamAV runtime aur guest end-to-end flow abhi separately pending hain.

## 🟡 Phase 09-C — Candidate, resume aur AI command completion

**Status:** `CORE PRESENT — end-to-end gates baki`

**Sub-step progress:** Total **7** · 🟢 Complete **0** · 🟡 Pending **7**

### 09-C sub-step tracking

- [ ] <span style="color:#ca8a04">First-resume upload → scan → parse → review/edit flow live-tested.</span>
- [ ] <span style="color:#ca8a04">ClamAV runtime available and verified in the target environment.</span>
- [ ] <span style="color:#ca8a04">Clean/infected/quarantined/failed/timeout/retry status mapping verified.</span>
- [ ] <span style="color:#ca8a04">Resume confirmation canonical update, revision, audit and outbox atomicity verified.</span>
- [ ] <span style="color:#ca8a04">Guest upload/apply/claim ownership and replay flow live-tested.</span>
- [ ] <span style="color:#ca8a04">Producer payloads validated against approved contracts.</span>
- [ ] <span style="color:#ca8a04">FastAPI processed-events idempotency and stale-revision behavior E2E-tested.</span>

- [ ] First-resume security scan → parse → review/edit data flow ka live test.
- [ ] ClamAV runtime (local/dev Cloud Run) verify karna; sirf adapter configuration ko success na maana jaye.
- [ ] Clean, infected, quarantined, failed, timeout aur retry states ka UI-safe status mapping test.
- [ ] Resume confirm par canonical facts, revision, audit aur outbox atomicity test.
- [ ] Guest upload/apply/claim flow ka ownership, expiry aur replay test.
- [ ] Approved event schemas ke against producer payload validation.
- [ ] AI command producers ke liye G-1 envelope alignment complete karna; provider/contract missing ho to event invent na karna.
- [ ] FastAPI worker ke result, `processed_events` idempotency aur stale-revision behavior ka E2E test.

## 🟡 Phase 09-D — Jobs, search aur applications hardening

**Status:** `CORE COMMANDS PRESENT — contract/coverage hardening baki`

**Sub-step progress:** Total **9** · 🟢 Complete **2** · 🟡 Pending **7**

### 09-D sub-step tracking

- [ ] <span style="color:#ca8a04">Job draft → approval → publish/pause/resume/close/archive transitions fully tested.</span>
- [x] <span style="color:#16a34a">Job approval default `false` and owner/admin override decision frozen.</span>
- [x] <span style="color:#16a34a">Company job-approval settings GET/PATCH API and audit behavior implemented/tested.</span>
- [ ] <span style="color:#ca8a04">Search routes, DTOs and permissions frozen and wired.</span>
- [ ] <span style="color:#ca8a04">FTS/semantic ranking, filters, cursor and visibility tests completed.</span>
- [ ] <span style="color:#ca8a04">Registered application idempotency and immutable snapshot E2E-tested.</span>
- [ ] <span style="color:#ca8a04">Application status transition matrix, terminal-state and concurrency tests completed.</span>
- [ ] <span style="color:#ca8a04">Saved-candidate privacy, uniqueness and delete behavior fully tested.</span>
- [ ] <span style="color:#ca8a04">Job expiry schedule, notification behavior and candidate visibility verified.</span>

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

## 🟡 Phase 09-E — Referrals aur interview completion

**Status:** `INTERVIEW CORE PRESENT; REFERRAL/REMAINING LIFECYCLE GATES BAKI`

**Sub-step progress:** Total **7** · 🟢 Complete **2** · 🟡 Pending **5**

### 09-E sub-step tracking

- [ ] <span style="color:#ca8a04">Referral API/contracts implemented and invitation/claim/reissue behavior tested.</span>
- [x] <span style="color:#16a34a">Interview scheduling and core booking transaction smoke verified.</span>
- [x] <span style="color:#16a34a">Interview confirmation/reschedule lineage smoke verified.</span>
- [ ] <span style="color:#ca8a04">Completed/cancelled/no-show terminal paths tested.</span>
- [ ] <span style="color:#ca8a04">Participant authorization and safe projections tested.</span>
- [ ] <span style="color:#ca8a04">Lead-time and timezone rules freeze/re-test completed.</span>
- [ ] <span style="color:#ca8a04">Notification/reminder ownership and summary contract decided.</span>

- [ ] **MISSING:** Referral API aur shared event/task contracts abhi implemented nahi hain; invitation, accept/claim, attribution, reissue aur duplicate behavior finalize/test karna hai.
- [ ] Referral company/application boundary aur reward terminal-state rules test.
- [ ] Interview scheduled → confirmed → completed/cancelled/no-show transitions test.
- [ ] Reschedule/cancel history, slot release, overlap aur concurrent booking test.
- [ ] Participant authorization aur candidate/HR safe projections test.
- [ ] Calendar/video/summary events tabhi implement karna jab versioned contracts approve hon.
- [ ] Interview minimum lead-time value (current approved value) aur timezone validation freeze/re-test karna.
- [ ] Interview notification/reminder ownership aur `interview.summary.requested` consumer contract ko explicit gate dena.
- [ ] Remaining interview terminal-path tests (completed, cancelled, no-show, terminal immutability) complete karna.

## 🟡 Phase 09-F — Notifications, SSE aur messaging

**Status:** `PLAN/CONTRACT GATES PENDING`

**Sub-step progress:** Total **7** · 🟢 Complete **0** · 🟡 Pending **7**

### 09-F sub-step tracking

- [ ] <span style="color:#ca8a04">Notification list/unread/read APIs implemented.</span>
- [ ] <span style="color:#ca8a04">Event → notification row → SSE → Next.js header flow tested.</span>
- [ ] <span style="color:#ca8a04">Offline recovery and reconnect cursor behavior tested.</span>
- [ ] <span style="color:#ca8a04">SSE JWT/ticket, heartbeat and per-user isolation tested.</span>
- [ ] <span style="color:#ca8a04">WebSocket participant authorization and missed-message recovery tested.</span>
- [ ] <span style="color:#ca8a04">Message/attachment idempotency and security rules tested.</span>
- [ ] <span style="color:#ca8a04">Email provider and template contract decided before enablement.</span>

- [ ] `notifications` table ko source of truth rakhte hue list, unread-count, acknowledge/read APIs freeze/implement karna.
- [ ] Event → notification row → SSE nudge → Next.js header flow implement/test.
- [ ] Offline user ke liye REST recovery; reconnect par missed notification state recover ho.
- [ ] SSE connection par JWT/ticket verification, per-user isolation aur heartbeat/reconnect contract test.
- [ ] WebSocket chat ka participant authorization, durable cursor, reconnect aur missed-message recovery implement/test.
- [ ] Message send/read idempotency aur attachment scan/ownership rules test.
- [ ] Email/provider/template work ko versioned contract aur provider decision ke baad hi enable karna.

## 🟡 Phase 09-G — Analytics, feedback, AI aur remaining product gaps

**Status:** `PARTIALLY IMPLEMENTED / SOME ITEMS BLOCKED BY DECISION`

**Sub-step progress:** Total **6** · 🟢 Complete **0** · 🟡 Pending **6**

### 09-G sub-step tracking

- [ ] <span style="color:#ca8a04">Analytics ownership, permissions and idempotency frozen.</span>
- [ ] <span style="color:#ca8a04">Registered feedback validation, rate limit, PII and audit tested.</span>
- [ ] <span style="color:#ca8a04">Guest feedback API/contract implemented or explicitly deferred.</span>
- [ ] <span style="color:#ca8a04">AI provider/model/cost and producer contracts finalized.</span>
- [ ] <span style="color:#ca8a04">Referral rewards/subscription/external search decisions recorded.</span>
- [ ] <span style="color:#ca8a04">Accessibility target added to the Next.js release gate.</span>

- [ ] Analytics metric ownership, permission aur idempotency rules freeze karna.
- [ ] Feedback registered flow ka validation, rate limit, PII aur audit test.
- [ ] **MISSING:** Guest/anonymous feedback API aur uska authorization/rate-limit contract define aur implement karna hai.
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

29 Aug live Dev/Test run me pehle smoke script ne `company_settings` row create nahi ki thi, isliye
empty result ko galat tarike se default drift report kiya. Script ko actual `CompanyService.create()`
lifecycle ke saath align kiya gaya (company-settings row explicitly insert hoti hai); environment
default bhi `false` verify hua. Final run:
`PASS: default false, toggle true and audit invariant verified` aur
`PASS: transaction rolled back; no smoke rows retained`.
Production rollout ke liye forward migration/backfill abhi bhi pending hai; existing deployed rows
automatically change nahi hongi.

Identity/company smoke aur interview smoke dono Dev/Test Supabase connection ke against pass hue.
Company hierarchy, cross-company FK, ownership transfer, interview booking/participant/confirmation/
reschedule lineage verify hue aur dono transactions rollback ho gaye. Ye HTTP auth integration ya
production deployment proof nahi hai.

Latest rollback-safe Dev/Test reruns: `identity-company-integration-smoke.js`,
`interview-integration-smoke.js`, aur `company-settings-integration-smoke.js` sab pass hue;
har run ke baad transaction rollback hua aur test rows retain nahi hue. Ye SQL/integration evidence
hai, HTTP auth integration aur production deployment proof nahi.

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

Codex ko **Phase 09-B Identity & Company integration tests** continue karne hain. Pehle implementation plan/contract ke against code gap list banaye, phir related code + tests kare. Uske baad same commit Antigravity, FreeBuf aur OpenCode ko read-only review ke liye diya jaye; Codex valid findings consolidate kare.

**Overall status:** `NESTJS API IN PROGRESS — PRODUCTION RELEASE GATES OPEN`
