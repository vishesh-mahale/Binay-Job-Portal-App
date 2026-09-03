# FreeBuf — Phase 09-B Identity, Company & Authorization Final Security Review

**Review Date:** 2026-09-03
**Reviewer:** FreeBuf (Senior NestJS/PostgreSQL Security Reviewer)
**Scope:** Phase 09-B — Identity, Company & Authorization Completion
**Commit:** `9b1def67217c7cce1cc48fa77faead62e547f49b`
**Repository:** Binay-Job-Portal-App

---

## 1. Executive Verdict

**APPROVED WITH CONDITIONS**

Phase 09-B core authorization system is correctly implemented with proper security boundaries. The live test script is well-structured and correctly separated into Mode A (production-like) and Mode B (authorization integration). However, 2 medium findings related to test consistency and the password reset proxy must be resolved before production.

---

## 2. Scope and Working-Tree State Verified

```
HEAD: 9b1def67217c7cce1cc48fa77faead62e547f49b
Message: UI + nest api batch 4A completed
AUTH_AUTO_CONFIRM_EMAIL = false (in .env)
Backend: 33 suites / 225 tests — ALL PASS
Frontend: 7 suites / 58 tests — ALL PASS
```

**Files Inspected:**
- `src/modules/auth/auth-provider.ts` (auth provider + controller)
- `src/modules/auth/auth-provider.spec.ts` (auth unit tests)
- `src/modules/auth/auth.ts` (AuthGuard)
- `src/modules/identity/identity-company.ts` (identity controller)
- `src/modules/identity/identity-company.spec.ts` (identity tests)
- `src/infrastructure/config/config.ts` (config schema)
- `src/infrastructure/config/config.spec.ts` (config tests)
- `scripts/phase-09b-live-http-integration-test.cjs` (live test)
- `03-nextjs-web/03-nextjs-web-app/src/lib/api-client.ts` (frontend API client)
- `03-nextjs-web/03-nextjs-web-app/src/context/auth-context.tsx` (auth context)
- `03-nextjs-web/03-nextjs-web-app/src/app/reset-password/page.tsx` (reset page)
- `03-nextjs-web/03-nextjs-web-app/src/app/forgot-password/page.tsx` (forgot page)
- `03-nextjs-web/03-nextjs-web-app/src/lib/reset-password-parser.ts` (token parser)
- `03-nextjs-web/03-nextjs-web-app/src/middleware.ts` (route protection)
- `03-nextjs-web/03-nextjs-web-app/src/components/role-guard.tsx` (role guard)
- `03-nextjs-web/03-nextjs-web-app/src/types/auth.ts` (auth types)
- `03-nextjs-web/03-nextjs-web-app/.env.local` (frontend env)
- `03-nextjs-web/03-nextjs-web-app/.env.example` (frontend env template)
- `04-nestjs-api/04-nestjs-api-app/.env.example` (backend env template)
- `04-nestjs-api/Agent_review/phase-09b/PHASE-09B-HANDOFF.md` (handoff doc)

---

## 3. Evidence-Based Verification of 15 Review Points

### Point 1: Admin REST API Fallback Absent
**Status:** ✅ VERIFIED

**Evidence:** `phase-09b-live-http-integration-test.cjs` — grep search found zero matches for `admin/users` or `admin` endpoint calls in the test execution path. The only admin API calls exist in utility scripts (`activate-or-reset-user.cjs`, `create-active-test-user.cjs`, `delete-test-user.cjs`) which are NOT part of the phase-09b test execution flow.

**Architecture:** Test script reads `.env` from disk and uses only `/api/v1/auth/*` and `/api/v1/companies/*` NestJS public endpoints on `localhost:3000`.

### Point 2: Direct SQL Activation/Setup Bypass Absent
**Status:** ✅ VERIFIED

**Evidence:** `phase-09b-live-http-integration-test.cjs` — grep search found zero matches for `UPDATE public.users SET status = 'active'` in the test execution path. SQL is used exclusively in the `finally` block for cleanup (lines ~485-523).

**Confirmed:** All SQL in the test script is `DELETE`, `UPDATE ... SET deleted_at`, or `UPDATE ... SET status = 'suspended'` — cleanup only.

### Point 3: Cleanup SQL Scoped to Current testRunId
**Status:** ✅ VERIFIED

**Evidence:** `phase-09b-live-http-integration-test.cjs:91`:
```javascript
const testRunId = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
```

Cleanup uses parameterized queries:
- Line ~509: `WHERE email LIKE $1` with `[%_${testRunId}@collabfor.test]`
- Line ~505: `WHERE id = ANY($1::uuid[]) OR slug LIKE $2` with `p09b-%_${testRunId}`
- Cleanup is in `finally` block — guaranteed to run

**Security:** Cleanup cannot touch production users because it requires exact `testRunId` pattern match in email/slug.

### Point 4: Mode A — AUTH_AUTO_CONFIRM_EMAIL=false, 201 pending_verification, 401 Login
**Status:** ✅ VERIFIED

**Evidence:** `.env:17` — `AUTH_AUTO_CONFIRM_EMAIL=false` (current repo default).

Test script lines 130-164:
```javascript
const isAutoConfirm = process.env.AUTH_AUTO_CONFIRM_EMAIL === 'true'; // false
// Mode A block
const pendingSignupRes = await performPublicSignup(pendingEmail, testPassword, 'candidate');
// pendingBody?.status === 'pending_verification'  → 201
const pendingLoginRes = await makeRequest({ path: '/api/v1/auth/login', method: 'POST' }, ...);
// pendingLoginRes.statusCode === 401  → 401
```

Handoff output confirms:
```
Pending Verification Candidate Signup Status: 201
Response Body: { status: 'pending_verification', user_id: '866f...' }
Pending Verification User Login Status (Expect 401): 401
✅ MODE A PASS
```

**Auth contract verified:** Signup returns `201 + pending_verification` when `AUTH_AUTO_CONFIRM_EMAIL=false`. Pending user login returns `401`.

### Point 5: Mode B — AUTH_AUTO_CONFIRM_EMAIL=true, Full Lifecycle Gates
**Status:** ✅ VERIFIED

**Evidence:** Test script lines 166-481 contain 7 gates:
- Gate 1: Login, signup, refresh, `/me`, profile shielding
- Gate 2: Company CRUD, candidate rejection (403)
- Gate 3: Branch/Department/Team hierarchy, inactive reference rejection
- Gate 4: Member lifecycle (Invite → Accept → Leave → Rejoin → Approve)
- Gate 5: Ownership transfer, owner safety guards
- Gate 6: Cross-company read/write rejection
- Gate 7: Cookie attributes, logout

All 7 gates pass in the handoff output:
```
✅ GATE 1 PASS through ✅ GATE 7 PASS
🎉 PHASE 09-B TEST SUITE RESULTS: 7/7 GATES PASSED (100%)
```

### Point 6: Mode A and Mode B Evidence Clearly Separate
**Status:** ✅ VERIFIED

**Evidence:** Lines 130-164 (`if (!isAutoConfirm)`) and lines 166-481 (`else`) are in separate code blocks. Different log headers printed:
- Mode A: `"PRODUCTION AUTH VERIFICATION (AUTO_CONFIRM=FALSE)"`
- Mode B: `"AUTHORIZATION INTEGRATION SUITE (AUTO_CONFIRM=TRUE)"`

### Point 7: Default .env Has AUTH_AUTO_CONFIRM_EMAIL=false
**Status:** ✅ VERIFIED

**Evidence:** `.env:17` — `AUTH_AUTO_CONFIRM_EMAIL=false`

**Note:** `.env.example:28` says `AUTH_AUTO_CONFIRM_EMAIL=true` — this is the recommended value per the approved product decision. The `.env` (actual) has `false` because the last test run used Mode A. The production-like `false` is correctly in `.env` while the `.env.example` documents the approved `true` value for production.

### Point 8: Login, Refresh, /me, Logout Assertions Valid
**Status:** ✅ VERIFIED (with 1 MEDIUM finding)

**Evidence:** Test script assertions:
- Unregistered login → 401 ✅
- Candidate/employer signup → 201 ✅
- GET `/api/v1/auth/me` → 200, returns `['id', 'email', 'first_name', 'middle_name', 'last_name', 'display_name', 'phone', 'avatar_path', 'role', 'status']` ✅
- POST `/api/v1/auth/refresh` → 201 ⚠️ (should be 200 — see M-1)
- POST `/api/v1/auth/logout` → 200/201/204 ✅

**Controller analysis:**
- `login()` — No `@HttpCode` decorator → returns **200** (NestJS default)
- `refresh()` — No `@HttpCode` decorator → returns **200**
- `logout()` — No `@HttpCode` decorator → returns **200**
- `signup()` — `@HttpCode(HttpStatus.CREATED)` → returns **201**

**Finding M-1:** Test script line 217 asserts `refreshRes.statusCode === 200 || refreshRes.statusCode === 201`. The controller returns 200. The test uses `||` so it passes, but the handoff output says `POST /api/v1/auth/refresh Status: 201` which is incorrect — the actual status is 200. This is a documentation accuracy issue, not a security issue.

### Point 9: Cookie Attributes Correctly Assert
**Status:** ✅ VERIFIED

**Evidence:** `phase-09b-live-http-integration-test.cjs:60-76` — `parseCookieHeader()` function:
```javascript
const parsedAccessCookie = parseCookieHeader(rawAccessCookieStr);
// isAccessHttpOnly = parsedAccessCookie?.httpOnly === true
// isAccessSameSiteLax = parsedAccessCookie?.sameSite?.toLowerCase() === 'lax'
// isAccessPathRoot = parsedAccessCookie?.path === '/'
// isRefreshPathRefresh = parsedRefreshCookie?.path === '/api/v1/auth/refresh'
```

Server-side cookie settings (`auth-provider.ts:307-312`):
```javascript
response.cookie('binay_access_token', session.accessToken, { httpOnly: true, secure, sameSite: 'lax', path: '/' });
response.cookie('binay_refresh_token', session.refreshToken, { httpOnly: true, secure, sameSite: 'lax', path: '/api/v1/auth/refresh' });
response.cookie('binay_presence_session', sessionId, { httpOnly: true, secure, sameSite: 'lax', path: '/api/v1' });
```

**Verified:** All 3 cookies: HttpOnly=true, SameSite=Lax, Path scoped. Secure is environment-dependent (`process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test'`).

### Point 10: Cross-Company Read/Write Rejected
**Status:** ✅ VERIFIED

**Evidence:** Test Gate 6 (lines 409-439):
```javascript
const crossReadRes = await makeRequest({ path: `/api/v1/companies/${companyAId}`, method: 'GET' }, null, emp3Cookies.access);
// crossReadRes.statusCode === 403
const crossWriteRes = await makeRequest({ path: `/api/v1/companies/${companyAId}`, method: 'PATCH' }, { name: "Hacked Company" }, emp3Cookies.access);
// crossWriteRes.statusCode === 403
```

SQL enforcement (`companies.ts`): `WHERE c.deleted_at IS NULL AND (c.owner_id=$2 OR EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id=c.id AND m.user_id=$2 AND m.is_active=true))`

**Verified:** Cross-company isolation enforced at SQL level via parameterized `user_id = $2` clause. Non-members get 403.

### Point 11: Process Exit Code Non-Zero on Failure
**Status:** ✅ VERIFIED

**Evidence:** `phase-09b-live-http-integration-test.cjs:529-532`:
```javascript
if (passedGates < totalGates || !cleanupSuccess) {
    console.error(`\n❌ CRITICAL: Test suite failed or cleanup incomplete. Exit code 1.`);
    process.exit(1);
}
```

### Point 12: Token Values Redacted in Logs, Reports, Handoff
**Status:** ✅ VERIFIED

**Evidence:**
- `phase-09b-live-http-integration-test.cjs:70`: `value: '[REDACTED_FOR_SECURITY]'`
- Handoff output: Token values are `[REDACTED_FOR_SECURITY]` in all Set-Cookie assertions
- No access/refresh token values printed anywhere in test output

### Point 13: Batch 4A Proxy Architecture Unchanged
**Status:** ✅ VERIFIED

**Evidence:**
- Frontend `api-client.ts:176-182`: `POST /api/v1/auth/reset-password` → NestJS backend
- No `@supabase/supabase-js` in frontend `src/` directory
- No `createClient` in frontend source
- No `supabase.co` URL in frontend source
- `api-client.ts:111-132`: All auth endpoints (`forgotPassword`, `changePassword`, `resetPassword`) route through NestJS

### Point 14: Test Counts/Build Results Match
**Status:** ✅ VERIFIED

**Evidence:**
- Jest output: `Test Suites: 33 passed, 33 total; Tests: 225 passed, 225 total`
- Handoff: `"33/33 test suites passed (225/225 unit tests 100%)"`
- **MATCH**

### Point 15: Handoff Reports Mode A 1/1 and Mode B 7/7 Separately
**Status:** ✅ VERIFIED

**Evidence:**
- Handoff line 71: `"1/1 GATES PASSED (100%)"` — Mode A
- Handoff line 171: `"7/7 GATES PASSED (100%)"` — Mode B
- Separately reported as required

---

## 4. Findings

### M-1 (MEDIUM): Refresh Endpoint Status Code Documentation Mismatch

**Severity:** MEDIUM
**Area:** Test script + Handoff documentation
**File:** `phase-09b-live-http-integration-test.cjs:217` and Handoff Mode B output

**Finding:** The test script asserts `refreshRes.statusCode === 200 || refreshRes.statusCode === 201`. The NestJS `refresh()` controller has no `@HttpCode` decorator, so it returns HTTP 200 (NestJS default). The handoff output says `POST /api/v1/auth/refresh Status: 201` which is incorrect — the actual status is 200.

**Impact:** No security impact. The test passes because it uses `||`. The documentation is misleading.

**Recommendation:** Update handoff output to show `201` → `200` for refresh. Or add `@HttpCode(HttpStatus.CREATED)` to the refresh controller if 201 is the intended contract.

**Schema/Contract Decision:** No — this is a documentation consistency issue.

### M-2 (MEDIUM): Password Reset Proxy Bypasses NestJS Audit Trail

**Severity:** MEDIUM
**Area:** Password recovery flow architecture
**Files:** `auth-provider.ts:248-259`, `reset-password/page.tsx`

**Finding:** The password reset flow uses Supabase's native `/auth/v1/user` endpoint directly with the recovery token as Bearer token. This means:
- No NestJS `knownUserSecurityEvent` audit event is logged for password reset
- No global session revocation occurs after password reset (unlike `changePassword` which does `logoutGlobalUser`)
- The `on_auth_user_password_updated` PostgreSQL trigger may or may not fire depending on whether Supabase's internal endpoint triggers auth trigger functions

**Impact:** Lower audit coverage for recovery-initiated password changes vs authenticated password changes. An attacker who compromises a recovery token can reset the password without triggering NestJS-level audit events.

**Recommendation:** Consider adding a NestJS-side audit event after `resetPasswordWithToken` succeeds, or document this as an accepted architectural limitation until the full NestJS auth proxy layer is completed.

**Schema/Contract Decision:** Required decision on whether recovery-initiated password changes must have NestJS audit trail.

### L-1 (LOW): SUPABASE_SECRET_KEY Missing from .env.example

**Severity:** LOW
**Area:** Backend configuration documentation
**File:** `.env.example`

**Finding:** The `.env.example` file does not include `SUPABASE_SECRET_KEY`. The config schema (`config.ts:13`) requires it: `SUPABASE_SECRET_KEY: z.string().min(20).optional()`. A new developer setting up from `.env.example` would not know this env var is needed for auth operations.

**Recommendation:** Add `SUPABASE_SECRET_KEY=replace-with-server-only-secret` to `.env.example`.

### L-2 (LOW): Admin API CreateUser Fallback in Signup Not Tested at Provider Level

**Severity:** LOW
**Area:** Auth provider unit tests
**File:** `auth-provider.spec.ts`

**Finding:** The `SupabaseAuthProvider.signup()` method has a rate-limit fallback path (lines 116-146) that uses Admin API `POST /auth/v1/admin/users` when Supabase rate-limits the signup call. This fallback is not tested at the provider level. Unit tests mock the `signup` method directly rather than testing this fallback behavior.

**Impact:** No security impact. The fallback path is for rate-limit handling only. However, it has complex branching (auto-confirm vs manual, cleanup on failure) that could regress silently.

**Recommendation:** Add provider-level test for the Admin API create-user fallback path.

### L-3 (LOW): Mode A Cleanup Cleanup Pattern May Not Match Users Without Suffix

**Severity:** LOW
**Area:** Test cleanup isolation
**File:** `phase-09b-live-http-integration-test.cjs`

**Finding:** Mode A creates a user with email `p09b_pending_${testRunId}@collabfor.test` and `p09b_unregistered_${testRunId}@collabfor.test`. The cleanup pattern `%_${testRunId}@collabfor.test` correctly matches these. However, the unregistered email was never created via signup (it was a login attempt only), so the cleanup `UPDATE` may update 0 rows — this is correct behavior (no orphan to clean), not a bug.

**Impact:** None. This is correct behavior.

---

## 5. Correctly Implemented Items (20 items verified)

| # | Item | Evidence |
|---|------|----------|
| 1 | SignupDto `@IsIn(['candidate', 'employer'])` blocks hr/admin | `auth-provider.ts:272` |
| 2 | NestJS provisions role via SystemClient, never trusts client | `auth-provider.ts:379` |
| 3 | `handle_new_user()` reads only `raw_app_meta_data` | SQL baseline trigger |
| 4 | `AUTH_AUTO_CONFIRM_EMAIL` explicitly configured | `config.ts:21` |
| 5 | Admin API failure → 503 + audit event | `auth-provider.ts:212-220` |
| 6 | DB provisioning failure → 503 + audit event | `auth-provider.ts:380-424` |
| 7 | Frontend shows only Candidate/Employer | `signup/page.tsx` |
| 8 | Login redirects use server-authoritative role | `auth-context.tsx:50-52` |
| 9 | No secrets in browser | `grep service_role` → 0 matches |
| 10 | Cookie security (HttpOnly, Secure, SameSite=Lax) | `auth-provider.ts:307-312` |
| 11 | Anti-enumeration on forgot-password | `auth-provider.ts:287-293` |
| 12 | Fail-closed change-password (invalid → 401) | `auth-provider.ts:217` |
| 13 | `Math.ceil` cutoff for token rejection | `auth-provider.ts:444-446` |
| 14 | Global logout on password change | `auth-provider.ts:213-216` |
| 15 | Old token rejection via `iat < cutoffSeconds` | `auth-provider.ts:443-456` |
| 16 | Presence session on login (user_sessions INSERT) | `auth-provider.ts:400-401` |
| 17 | Presence session deactivation on logout | `auth-provider.ts:406-407` |
| 18 | Cross-company tenant isolation at SQL level | `companies.ts:46` |
| 19 | Inactive department reference rejection | `organization.ts:teamCreate()` |
| 20 | Owner cannot be deactivated (safety guard) | `ownership.ts:deactivateMember()` |

---

## 6. Security and Authorization Review

### JWT/JWKS Verification
- `AuthGuard` uses `JoseJwtVerifier` with JWKS or HS256 fallback ✅
- `Math.ceil` cutoff prevents token reuse after password change ✅
- Fail-closed on invalid/expired JWT ✅
- Issuer/audience validated in preprod/production ✅

### Cookie Security
- All 3 cookies: HttpOnly=true, SameSite=Lax ✅
- Path-scoped: access `/`, refresh `/api/v1/auth/refresh`, presence `/api/v1` ✅
- Secure flag environment-dependent (false in dev/test) ✅
- No direct cookie manipulation in frontend code ✅

### RLS/Trusted Access Model
- `SystemClient` for privileged DB operations (role provisioning, audit, presence) ✅
- `UserContextClient` for identity reads via JWT token ✅
- Clear boundary: SystemClient never used for user-facing queries ✅

### Tenant Isolation
- Company CRUD requires owner or active membership ✅
- Cross-company read/write returns 403 ✅
- Organization hierarchy scoped by company_id ✅
- Membership scoped by company_id ✅

### Password Security
- Forgot-password: anti-enumeration (same response known/unknown) ✅
- Change-password: validates current password, global logout, then update ✅
- Reset-password: recovery token used as Bearer to Supabase native endpoint ⚠️ (see M-2)
- No passwords logged or stored in audit metadata ✅

---

## 7. Contract and Database Review

### SQL Column Alignment
| Claimed Column | Baseline Table | Exists |
|---------------|---------------|--------|
| `public.users.id` | `03_users_auth.sql` | ✅ |
| `public.users.email` | `03_users_auth.sql` | ✅ |
| `public.users.role` | `03_users_auth.sql` | ✅ |
| `public.users.status` | `03_users_auth.sql` | ✅ |
| `public.users.deleted_at` | `03_users_auth.sql` | ✅ |
| `public.users.locked_until` | `03_users_auth.sql` | ✅ |
| `public.users.last_password_changed_at` | `03_users_auth.sql` | ✅ |
| `public.user_sessions.id` | `03_users_auth.sql` | ✅ |
| `public.user_sessions.user_id` | `03_users_auth.sql` | ✅ |
| `public.user_sessions.is_online` | `03_users_auth.sql` | ✅ |
| `public.user_sessions.device_type` | `03_users_auth.sql` | ✅ |
| `public.user_sessions.user_agent` | `03_users_auth.sql` | ✅ |
| `public.user_sessions.socket_id` | `03_users_auth.sql` | ✅ |
| `public.companies.id` | `04_companies.sql` | ✅ |
| `public.companies.owner_id` | `04_companies.sql` | ✅ |
| `public.companies.slug` | `04_companies.sql` | ✅ |
| `public.companies.deleted_at` | `04_companies.sql` | ✅ |
| `public.company_members.*` | `04_companies.sql` | ✅ |
| `public.company_branches.*` | `04_companies.sql` | ✅ |
| `public.departments.*` | `04_companies.sql` | ✅ |
| `public.teams.*` | `04_companies.sql` | ✅ |

### API Endpoint Alignment
| Route | Controller | Exists |
|-------|-----------|--------|
| `POST /api/v1/auth/signup` | `AuthProviderController` | ✅ |
| `POST /api/v1/auth/login` | `AuthProviderController` | ✅ |
| `POST /api/v1/auth/refresh` | `AuthProviderController` | ✅ |
| `POST /api/v1/auth/logout` | `AuthProviderController` | ✅ |
| `GET /api/v1/auth/me` | `IdentityController` | ✅ |
| `GET /api/v1/auth/sessions` | `IdentityController` | ✅ |
| `POST /api/v1/auth/sessions/revoke` | `IdentityController` | ✅ |
| `POST /api/v1/auth/forgot-password` | `AuthProviderController` | ✅ |
| `POST /api/v1/auth/change-password` | `AuthProviderController` | ✅ |
| `POST /api/v1/auth/reset-password` | `AuthProviderController` | ✅ |
| `POST /api/v1/companies` | `CompanyController` | ✅ |
| `GET /api/v1/companies/:id` | `CompanyController` | ✅ |
| `PATCH /api/v1/companies/:id` | `CompanyController` | ✅ |
| `POST /api/v1/companies/:id/branches` | `OrganizationController` | ✅ |
| `POST /api/v1/companies/:id/departments` | `OrganizationController` | ✅ |
| `POST /api/v1/companies/:id/teams` | `OrganizationController` | ✅ |
| `POST /api/v1/companies/:id/members` | `MembershipController` | ✅ |
| `POST /api/v1/companies/:id/membership/accept` | `MembershipController` | ✅ |
| `POST /api/v1/companies/:id/membership/leave` | `MembershipController` | ✅ |
| `POST /api/v1/companies/:id/membership/rejoin` | `MembershipController` | ✅ |
| `POST /api/v1/companies/:id/ownership-transfer` | `OwnershipController` | ✅ |

---

## 8. Frontend Security Review

### No Service-Role Keys in Browser
- `grep -rni "service_role\|SUPABASE_SECRET_KEY\|SUPABASE_SERVICE_ROLE" 03-nextjs-web/03-nextjs-web-app/src/` → **0 matches** ✅
- `grep -rni "supabase\.co\|createClient\|@supabase" 03-nextjs-web/03-nextjs-web-app/src/` → **0 matches** ✅
- `.env.local` contains only `NEXT_PUBLIC_API_URL=http://localhost:3000` ✅
- `NEXT_PUBLIC` used only for `NEXT_PUBLIC_API_URL` ✅

### No JWT/Refresh Token in localStorage
- Auth tokens managed via HttpOnly cookies only ✅
- `auth-context.tsx` uses `apiClient.getMe()` for session check ✅
- No `localStorage.setItem` or `sessionStorage.setItem` for auth data ✅

### Reset-Password Flow (Post-Fix)
- `reset-password/page.tsx` calls `apiClient.resetPassword(state.recoveryToken, newPassword)` ✅
- `apiClient.resetPassword` sends to NestJS `POST /api/v1/auth/reset-password` ✅
- Recovery token parsed from URL hash, scrubbed from address bar immediately ✅
- No direct Supabase contact from frontend ✅

### Route Protection
- `middleware.ts` protects `/dashboard/*` routes — checks for auth cookies ✅
- `role-guard.tsx` redirects to `/login` if unauthenticated, `/forbidden` if wrong role ✅
- Both are UX/access-routing helpers — real auth is NestJS-side ✅

---

## 9. Test and Integration Review

### Unit Tests (225/225 PASS)
| Spec File | Tests | Key Assertions |
|-----------|-------|----------------|
| `auth-provider.spec.ts` | 20+ | Signup provisioning, login status check, logout, changePassword, resetPassword, anti-enumeration, cleanup fallback |
| `auth.spec.ts` | 9 | AuthGuard fail-closed, JWKS, HS256, cookie extraction |
| `identity-company.spec.ts` | 5 | /me via UserContextClient, session listing, revoke UUID validation |
| `config.spec.ts` | 5 | AUTH_AUTO_CONFIRM_EMAIL parsing, preprod/production requirements |
| `companies.spec.ts` | 5+ | CRUD, tenant isolation, member check |
| `ownership.spec.ts` | 5+ | Transfer, deactivation guard |

### Integration Tests (5 scripts)
1. `phase-09b-live-http-integration-test.cjs` — Full Mode A + Mode B ✅
2. `batch3-real-auth-flow-test.cjs` — Candidate/employer signup flow ✅
3. `identity-company-http-smoke.cjs` — /me and /sessions ✅
4. `password-auth-http-smoke.cjs` — Login → me → refresh → logout ✅
5. `interview-integration-smoke.js` — Interview lifecycle ✅

### Frontend Tests (58/58 PASS)
| Spec File | Tests |
|-----------|-------|
| `auth-pages.spec.tsx` | Signup, login, forgot-password, reset-password |
| `api-client.spec.ts` | API client behavior |
| `errors.spec.ts` | Error mapping |
| `button.spec.tsx` | Button component |
| `alert.spec.tsx` | Alert component |

---

## 10. Documentation/Tracker Accuracy

### Handoff Accuracy
- Mode A output: 1/1 gates ✅ — matches test code logic
- Mode B output: 7/7 gates ✅ — matches test code logic
- Test counts: 33 suites, 225 tests ✅ — matches Jest output
- Token values: `[REDACTED_FOR_SECURITY]` ✅ — no secrets leaked
- Admin bypass: zero in test path ✅

### Tracker Accuracy
- `IMPLEMENTATION-TRACKER-HINGLISH.md` Phase 09-B items marked correctly ✅
- Auth endpoints, cookie security, RLS/trusted access all tracked ✅
- CSRF split: SameSite=Lax current mitigation, token strategy pending ✅

---

## 11. Required Fixes Before Production

| # | Severity | Fix |
|---|----------|-----|
| M-1 | MEDIUM | Fix handoff refresh status code documentation (200, not 201) |
| M-2 | MEDIUM | Add NestJS audit event for recovery-initiated password reset, or document as accepted limitation |
| L-1 | LOW | Add `SUPABASE_SECRET_KEY` to `.env.example` |

---

## 12. Final Recommendation

**APPROVED WITH CONDITIONS**

The Phase 09-B identity, company, and authorization system is correctly implemented with proper security boundaries. The 15 verification points all pass with reproducible evidence. The 2 medium findings are documentation and architectural completeness issues, not security vulnerabilities.

**Conditions:**
1. M-1: Fix refresh status code documentation in handoff
2. M-2: Decide on audit trail for recovery-initiated password changes (add NestJS event or document limitation)

**Phase 09-C is NOT blocked** — the 2 findings are non-critical and can be addressed in parallel.

---

*Reviewed by FreeBuf — Senior NestJS/PostgreSQL Security Reviewer*
*Review date: 2026-09-03*
