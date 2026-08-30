# OpenCode — Password-Auth HTTP Smoke Review (`0d5b253`)

- **Reviewer:** opencode
- **Mode:** read-only (no source/test/config modified)
- **Commit:** `0d5b253d2d81f5f9fbca5155b1345e852749be22` — `test(nestjs-api): add opt-in password auth HTTP smoke`
- **Files changed:** `scripts/password-auth-http-smoke.cjs` (new, 53 lines), `package.json` (+1 script). No source change.
- **Related commit verified:** `dd763ce` (AuthGuard explicit DI) — no conflict (see §10).
- **Verdict:** **APPROVED**

## 1. Smoke test runs only with RUN_PASSWORD_AUTH_HTTP_SMOKE=true

**VERIFIED.** `scripts/password-auth-http-smoke.cjs:6-9`:
```js
if (process.env.RUN_PASSWORD_AUTH_HTTP_SMOKE !== 'true') {
  console.log('SKIPPED: set RUN_PASSWORD_AUTH_HTTP_SMOKE=true to run password-auth smoke');
  process.exit(0);
}
```
Runtime check: running the script with default env printed `SKIPPED: …` and exited **0** (no network, no credentials). ✅

## 2. Test flow is correct: login → access/refresh cookies → /auth/me → refresh → logout

**VERIFIED (source order `password-auth-http-smoke.cjs:36-51`):**
1. `POST /api/v1/auth/login` with `{email,password}` → asserts `201`, and that `setCookies` includes `binay_access_token=` and `binay_refresh_token=` (`:37-39`).
2. `GET /api/v1/auth/me` with the captured cookies → asserts `200` and `body.id` is a string (`:41-43`).
3. `POST /api/v1/auth/refresh` with the cookies → asserts `201` and rotated `binay_access_token=` (`:45-47`).
4. `POST /api/v1/auth/logout` with the cookies → asserts `201` (`:49-51`).

Flow matches the intended lifecycle. ✅

## 3. Credentials or tokens are not exposed in logs

**VERIFIED.**
- `AUTH_TEST_EMAIL` / `AUTH_TEST_PASSWORD` are read from env (`:11-13`) and placed only into the request **body** (`JSON.stringify({email,password})`, `:37`); they are never passed to `console.log`/`console.error`.
- Tokens live only in the in-memory `login.setCookies` / `refresh.setCookies` strings (derived from `Set-Cookie` via `cookieHeader`, `:15-19`); they are **never printed**. The only stdout/stderr outputs are: the SKIP line, the success line `'Password auth HTTP smoke passed: login → me → refresh → logout'` (`:53`), and on failure `console.error(error.message)` (`:55`) — which carries only assertion status text (e.g. `login failed: 401`, `me failed: 200`), no credential/token.
- `error.message` is derived from `assert` messages (status codes / cookie-name presence), not from response bodies or secrets. ✅

## 4. Safe for a dedicated existing account; no signup or destructive mutation

**VERIFIED.**
- The script calls only `login`, `me`, `refresh`, `logout`. It **never calls `signup`** (`:36-51`). No account creation.
- Side effects are bounded auth artifacts, not destructive data mutation: `login` inserts a transient `user_sessions` presence row (`auth-provider.ts:90`); `logout` sets that row `is_online = FALSE` (`auth-provider.ts:100`). No business rows (users/jobs/applications/etc.) are deleted or altered.
- The header comment explicitly states `Requires a dedicated test account` (`password-auth-http-smoke.cjs:1`), steering operators away from production/real users. ✅ (Minor note: repeated runs accumulate `is_online=FALSE` presence rows for the test account; non-destructive and bounded, but a periodic sweep would keep it tidy — not a defect.)

## 5. Cookie handling and logout presence-session behavior are correct

**VERIFIED.**
- **Capture/replay:** `cookieHeader` (`:15-19`) uses `response.headers.getSetCookie()` (guarded for Node 20+), takes the `name=value` prefix before `;`, and joins with `'; '`; `request` replays them in the `cookie` header (`:23-31`). Correct round-trip of `binay_access_token`, `binay_refresh_token`, `binay_presence_session`.
- **Login sets cookies:** `setSessionCookies` + `setPresenceCookie` (`auth-provider.ts:51-52,55-56`) set all three cookies; script asserts the two auth cookies (`:38-39`).
- **Refresh rotates access cookie:** `refresh` calls `setSessionCookies` (`auth-provider.ts:94`); script asserts new `binay_access_token=` (`:46-47`).
- **Logout presence-session:** `logout` (`auth-provider.ts:95-102`) reads `binay_presence_session`, sets `is_online = FALSE` for that session, and `clearCookie` for all three (`access`, `refresh`, `presence_session`) — `:99-101`. The smoke invokes logout and asserts `201`, exercising that path. The server-side presence-session teardown is correct; the smoke does not separately assert the cleared presence cookie, but the controller behavior is verified and the flow is covered. ✅

## 6. HTTP status assertions match current controller behavior

**VERIFIED against `auth-provider.ts` / `identity-company.ts`:**
- `login` — `@Post('login')` with **no `@HttpCode`** → NestJS default **201** (`auth-provider.ts:65`). Script asserts `201` (`:37`). MATCH.
- `refresh` — `@Post('refresh')` no `@HttpCode` → **201** (`auth-provider.ts:93`). Script asserts `201` (`:45`). MATCH.
- `logout` — `@Post('logout')` no `@HttpCode` → **201** (`auth-provider.ts:95`). Script asserts `201` (`:49`). MATCH.
- `me` — `IdentityController` `@Get('me')` → **200** (`identity-company.ts:55-56`); returns the user row which includes `id`. Script asserts `200` and `typeof body.id === 'string'` (`:41-43`). MATCH.

All four assertions align with the actual controllers. ✅

## 7. Script failure yields a non-zero exit code

**VERIFIED.**
- Assertion failure inside `main()` → `main().catch((error) => { console.error(error.message); process.exitCode = 1; })` (`password-auth-http-smoke.cjs:55`) → exit **1**.
- Missing required env (`!baseUrl || !email || !password`) → top-level `throw new Error(...)` (`:13`) → uncaught exception → Node exit **1** (no false success).
- Opt-in not set → `process.exit(0)` (`:8`) → exit **0** (clean skip). ✅

## 8. npm script is correctly registered

**VERIFIED.** `package.json`:
```json
"smoke:password-auth": "node scripts/password-auth-http-smoke.cjs",
```
Consistent with the sibling `smoke:identity-http` script; file exists; uses `node` directly (not `npm.cmd`), so it runs in this PowerShell environment. ✅

## 9. Existing build and 195 tests do not regress

**VERIFIED.**
- The commit adds only a `.cjs` script (not a jest spec) and one `package.json` script line — no `src/` change, so `tsc -p tsconfig.build.json` output is unaffected.
- Full suite: `node ./node_modules/jest/bin/jest.js` → **Test Suites: 33 passed, Tests: 195 passed, exit 0** at HEAD `0d5b253`. No regression vs the `195` baseline.
- `node --check scripts/password-auth-http-smoke.cjs` → exit 0 (valid syntax). ✅

## 10. No conflict with `dd763ce` (AuthGuard explicit DI)

**VERIFIED.**
- The smoke script is a **standalone HTTP client** (`fetch` only); it does **not** import `AuthGuard`, `app.module.ts`, or any DI token. There is no shared code or token/provider overlap with `dd763ce`.
- It exercises exactly the endpoints that depend on the `dd763ce`-wired `AuthGuard`: `/auth/me` (`@UseGuards(AuthGuard)`, `identity-company.ts:51`) and `/auth/logout` (`@UseGuards(AuthGuard)`, `auth-provider.ts:96`). So the smoke **validates** the `dd763ce` fix end-to-end rather than conflicting with it.
- `dd763ce` changed only DI metadata; this commit adds an orthogonal HTTP test. No behavioral or wiring interaction. ✅

## Evidence index (file:line)

- `scripts/password-auth-http-smoke.cjs:6-9` — opt-in guard (skip unless `true`), exit 0.
- `scripts/password-auth-http-smoke.cjs:11-13` — required env check (email/password from env, never logged).
- `scripts/password-auth-http-smoke.cjs:15-19` — `cookieHeader`: `getSetCookie()` → `name=value` prefix.
- `scripts/password-auth-http-smoke.cjs:21-31` — `request`: fetch + silent JSON parse.
- `scripts/password-auth-http-smoke.cjs:36-51` — login/me/refresh/logout flow + status/cookie assertions.
- `scripts/password-auth-http-smoke.cjs:53` — success log (no secrets).
- `scripts/password-auth-http-smoke.cjs:55` — `main().catch` → `process.exitCode = 1`.
- `auth-provider.ts:65` — `@Post('login')` (default 201).
- `auth-provider.ts:51-52,55-56` — `setSessionCookies` / `setPresenceCookie` (access, refresh, presence).
- `auth-provider.ts:90` — login inserts `user_sessions` presence row.
- `auth-provider.ts:93-94` — `@Post('refresh')` rotates access cookie (201).
- `auth-provider.ts:95-102` — `@Post('logout')` `@UseGuards(AuthGuard)`, clears 3 cookies incl. presence session (201).
- `identity-company.ts:55-56` — `@Get('me')` returns user (`id`) → 200.
- `package.json` — `"smoke:password-auth": "node scripts/password-auth-http-smoke.cjs"`.
- Runtime: `node --check` exit 0; default skip exit 0; jest 33 suites / 195 tests exit 0.

## Recommendation
No fix required. The smoke is correctly opt-in, read/log-safe, non-destructive, asserts statuses that match the current controllers, fails with a non-zero exit, and is registered properly. Optional (non-blocking) hygiene: the smoke could additionally assert that `/auth/logout` clears the `binay_presence_session` cookie and that the emitted `user_sessions` rows are eventually swept, but neither is a defect.

No source, SQL, contract, configuration, test, or tracker file was modified by this review.
