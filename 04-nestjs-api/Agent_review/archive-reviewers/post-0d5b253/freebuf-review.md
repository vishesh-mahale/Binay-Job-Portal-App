# freebuf Review — Commit 0d5b253

## 1. Commit and scope verified

```
HEAD:           0d5b253d2d81f5f9fbca5155b1345e852749be22
git status:     clean
Files touched:  2 files — new script + package.json entry
Lines added:    +54 (script: 53, package.json: 1)
```

## 2. Executive verdict

**APPROVED WITH REQUIRED FIXES**

## 3. Evidence-based findings

| ID | Severity | File/Line | Finding | Evidence | Required action |
|----|----------|-----------|---------|----------|-----------------|
| F-1 | **HIGH** | `password-auth-http-smoke.cjs:35` | Smoke test asserts HTTP 201 for login, but controller returns 200 | `auth-provider.ts:65` — `@Post('login')` has NO `@HttpCode` decorator → NestJS default is 200. Only `signup` at line 63 has `@HttpCode(HttpStatus.CREATED)`. | Change `assert.equal(login.response.status, 201, ...)` to `assert.equal(login.response.status, 200, ...)` |
| F-2 | **HIGH** | `password-auth-http-smoke.cjs:41` | Smoke test asserts HTTP 201 for refresh, but controller returns 200 | `auth-provider.ts:93` — `@Post('refresh')` has NO `@HttpCode` decorator → NestJS default is 200. | Change `assert.equal(refresh.response.status, 201, ...)` to `assert.equal(refresh.response.status, 200, ...)` |
| F-3 | **HIGH** | `password-auth-http-smoke.cjs:46` | Smoke test asserts HTTP 201 for logout, but controller returns 200 | `auth-provider.ts:95` — `@Post('logout')` has NO `@HttpCode` decorator → NestJS default is 200. | Change `assert.equal(logout.response.status, 201, ...)` to `assert.equal(logout.response.status, 200, ...)` |
| F-4 | PASS | `password-auth-http-smoke.cjs:3-6` | Opt-in gate correct | `RUN_PASSWORD_AUTH_HTTP_SMOKE !== 'true'` → prints SKIPPED, exits 0 | None |
| F-5 | PASS | `password-auth-http-smoke.cjs:8-10` | Required env validation correct | 3 vars checked: `API_BASE_URL`, `AUTH_TEST_EMAIL`, `AUTH_TEST_PASSWORD` | None |
| F-6 | PASS | `password-auth-http-smoke.cjs:12-20` | Cookie extraction uses `getSetCookie()` with safe fallback | `typeof response.headers.getSetCookie === 'function'` → falls back to `[]` on Node < 18.15 | None |
| F-7 | PASS | `password-auth-http-smoke.cjs:26-29` | Login cookie assertions correct | Asserts `binay_access_token=` and `binay_refresh_token=` in Set-Cookie — matches `setSessionCookies()` at `auth-provider.ts:55-56` | None |
| F-8 | PASS | `password-auth-http-smoke.cjs:31-33` | /auth/me endpoint and assertion correct | `GET /api/v1/auth/me` with cookies → status 200 + `body.id` is string — matches `identity-company.ts` GET handler | None |
| F-9 | PASS | `password-auth-http-smoke.cjs:38-39` | Refresh cookie rotation assertion correct | Asserts `binay_access_token=` in refresh Set-Cookie — matches `setSessionCookies()` called in refresh handler | None |
| F-10 | PASS | `password-auth-http-smoke.cjs:43-47` | Logout cookie concatenation works | `${login.setCookies}; ${refreshedCookies}` — login access token still valid for AuthGuard. Refreshed cookies are redundant but harmless | None |
| F-11 | PASS | `password-auth-http-smoke.cjs:53` | Non-zero exit on failure | `process.exitCode = 1` in `.catch()` | None |
| F-12 | PASS | `password-auth-http-smoke.cjs:2` | No credentials/tokens logged | Only `error.message` printed; success message is generic | None |
| F-13 | PASS | `password-auth-http-smoke.cjs:1-53` | No signup or destructive mutation | All operations: login (POST), me (GET), refresh (POST), logout (POST) — read-only after initial login | None |
| F-14 | PASS | `package.json:12` | npm script registered correctly | `"smoke:password-auth": "node scripts/password-auth-http-smoke.cjs"` | None |
| F-15 | PASS | `auth.ts` | AuthGuard DI from dd763ce not conflicted | No auth.ts changes in this commit; `AuthGuard` constructor uses `@Inject` tokens — no interaction with the smoke script | None |

## 4. Correctly implemented items

1. **Opt-in gate** — Cannot run accidentally; safe to wire into CI
2. **Full auth lifecycle tested** — login → me → refresh → logout covers the complete password-auth happy path
3. **Cookie-based flow** — Correctly tests the HttpOnly cookie path (not Bearer header)
4. **Cookie extraction** — `getSetCookie()` with fallback handles Node version differences
5. **No secret leakage** — Credentials and tokens never appear in console output
6. **Non-destructive** — No signup, no data mutation, relies on existing test account
7. **Error propagation** — `process.exitCode = 1` on any failure

## 5. HTTP status code mismatch — the core issue

The controller status codes are:

| Endpoint | Controller decorator | Actual HTTP status | Smoke test assertion |
|----------|---------------------|--------------------|---------------------|
| `POST /auth/signup` | `@HttpCode(HttpStatus.CREATED)` | 201 | N/A (not tested) |
| `POST /auth/login` | None | **200** (default) | **201** ❌ |
| `POST /auth/refresh` | None | **200** (default) | **201** ❌ |
| `POST /auth/logout` | None | **200** (default) | **201** ❌ |

**Impact**: The smoke test would fail at the very first assertion (`login failed: 200`). The test never reaches `/auth/me`, refresh, or logout.

**Fix options** (pick one):
- **Option A (preferred)**: Fix the smoke test to expect `200` — matches current controller behavior
- **Option B**: Add `@HttpCode(HttpStatus.CREATED)` to login/refresh/logout in `auth-provider.ts` — but this is a separate controller change and should be a conscious decision

## 6. Required fixes before production

| # | Fix | Priority |
|---|-----|----------|
| 1 | `password-auth-http-smoke.cjs:35` — change `201` to `200` for login | HIGH |
| 2 | `password-auth-http-smoke.cjs:41` — change `201` to `200` for refresh | HIGH |
| 3 | `password-auth-http-smoke.cjs:46` — change `201` to `200` for logout | HIGH |

## 7. Test results

```
✅ npx tsc --noEmit            Exit 0, zero errors
✅ npx jest auth.spec.ts       9/9 pass
✅ npx jest auth-provider      5/5 pass
✅ npx jest identity-company   4/4 pass
Total: 18/18 pass (auth-related suites)
```

No regressions from dd763ce DI wiring or this commit.

## 8. Final recommendation

**APPROVED WITH REQUIRED FIXES** — The smoke test script is well-structured with correct opt-in gating, cookie handling, and non-destructive flow. However, the 3 HTTP status assertions (`201` → `200`) are wrong and would cause the test to fail at the first assertion. Fix the 3 status codes from `201` to `200` to match the actual controller behavior (NestJS default POST status is 200 unless `@HttpCode` is specified).
