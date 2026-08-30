# freebuf Review — Commit 9e91cd6

## 1. Commit and scope verified

```
HEAD:   9e91cd63eea4fbcc2ada4150efa6648d1b98529d
Subject: test(identity): add opt-in company authorization HTTP smoke
Files:   package.json (+1), scripts/identity-company-http-smoke.cjs (+39 new)
```

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | ✅ Exit 0, zero errors |
| `npm test -- --runInBand --forceExit` | ✅ 33 suites, 193 tests — ALL PASS (previous commit verified; this commit adds only a script, no `.spec.ts` changes) |
| `smoke:identity-http` without env var | ✅ Prints "SKIPPED" and exits 0 |

## 2. Executive verdict

**APPROVED**

This commit adds an opt-in, read-only HTTP smoke test that verifies `/auth/me`, `/auth/sessions`, own-company read, and cross-company denial against a live (or pre-seeded) API instance. The script is well-guarded, reads-only, and handles secrets safely.

## 3. Evidence-based findings

| ID | Severity | File/Line | Finding | Evidence | Required action |
|----|----------|-----------|---------|----------|-----------------|
| F-1 | NO ISSUE | identity-company-http-smoke.cjs:3-6 | **Default skip behavior** — Script exits 0 with informational message when `RUN_IDENTITY_COMPANY_HTTP_SMOKE !== 'true'`. | `if (process.env.RUN_IDENTITY_COMPANY_HTTP_SMOKE !== 'true')` → `console.log('SKIPPED: ...')` → `process.exit(0)`. Never runs unless explicitly opted in. Safe to wire into package.json without affecting `npm test`. | None |
| F-2 | NO ISSUE | identity-company-http-smoke.cjs:8-11 | **Required env var validation** — Throws immediately if any of `API_BASE_URL`, `ACCESS_TOKEN`, `COMPANY_ID`, `OTHER_COMPANY_ID` is missing. | `if (!baseUrl \|\| !token \|\| !companyId \|\| !otherCompanyId) throw new Error(...)`. Fail-fast prevents undefined behavior. | None |
| F-3 | NO ISSUE | identity-company-http-smoke.cjs:13-18 | **Bearer token handling** — Token sent via `Authorization: Bearer` header; trailing slash on base URL stripped. | `headers: { authorization: \`Bearer ${token}\`, accept: 'application/json' }`. `baseUrl.replace(/\/$/, '')` prevents double-slash in URL. Token never logged or included in error output. | None |
| F-4 | NO ISSUE | identity-company-http-smoke.cjs:20-22 | **`/auth/me` assertions** — Status 200 + response contains `id` string. | `assert.equal(me.status, 200, ...)` + `assert.ok(me.body && typeof me.body.id === 'string', ...)`. Validates both HTTP status and response shape. Route matches `identity-company.ts:55` `@Get('me')` on controller `api/v1/auth`. | None |
| F-5 | NO ISSUE | identity-company-http-smoke.cjs:24-26 | **`/auth/sessions` assertions** — Status 200 + response is array. | `assert.equal(sessions.status, 200, ...)` + `assert.ok(Array.isArray(sessions.body), ...)`. Route matches `identity-company.ts:58` `@Get('sessions')` on controller `api/v1/auth`. | None |
| F-6 | NO ISSUE | identity-company-http-smoke.cjs:28-30 | **Own-company read** — Status 200 for company user belongs to. | `assert.equal(ownCompany.status, 200, ...)`. Route matches `companies.ts:72` `@Get(':companyId')` on controller `api/v1/companies`. SQL at `companies.ts:46` checks `owner_id=$2 OR EXISTS (company_members ...)`. | None |
| F-7 | NO ISSUE | identity-company-http-smoke.cjs:32-34 | **Cross-company denial** — Status must be 403 or 404. | `assert.ok([403, 404].includes(otherCompany.status), ...)`. The actual implementation at `companies.ts:47` throws `ForbiddenException('FORBIDDEN')` when the WHERE clause returns no rows (403). Accepting 404 covers the case where `AuthGuard` or route-level checks might throw `NotFoundException` first. This is a defensive assertion — not a weakness. | None |
| F-8 | NO ISSUE | identity-company-http-smoke.cjs:17 | **Error handling** — `response.json()` wrapped in try/catch to handle empty/non-JSON responses gracefully. | `try { body = await response.json(); } catch { /* empty response */ }`. Prevents crash on 204/empty-body responses. | None |
| F-9 | NO ISSUE | identity-company-http-smoke.cjs:36 | **Fail-closed on error** — `main().catch(...)` sets `process.exitCode = 1` and logs error message (not full error object). | `console.error(error.message)` — only the message is logged, not stack trace with potential internal paths. `process.exitCode = 1` ensures CI catches failures. | None |
| F-10 | NO ISSUE | identity-company-http-smoke.cjs:14 | **`encodeURIComponent` on companyId** — Both `companyId` and `otherCompanyId` are URL-encoded. | `${encodeURIComponent(companyId)}` prevents path traversal or injection via malformed company IDs. | None |
| F-11 | NO ISSUE | package.json:11 | **Script wiring** — `smoke:identity-http` script added; does not interfere with `test`, `test:jwt`, or `build`. | Script is independent (`node scripts/...`); no build step required (plain CJS). Not part of `npm test` pipeline. | None |
| F-12 | NO ISSUE | identity-company-http-smoke.cjs:1-2 | **Read-only guarantee** — Script only makes GET requests. No POST/PUT/PATCH/DELETE. | All 4 requests use the `request()` helper which hardcodes no method (defaults to GET per Fetch API spec). No write operations possible. | None |
| F-13 | NO ISSUE | identity-company-http-smoke.cjs:15 | **Secret not leaked in output** — Token and company IDs are read from env vars and used only in request headers/URLs. Never printed, logged, or included in error messages. | `console.log` only prints status messages; `console.error(error.message)` prints assertion messages which reference status codes, not secrets. | None |
| F-14 | NO ISSUE | identity-company-http-smoke.cjs:36 | **Error output sanitized** — `error.message` logged, not `error.stack` or full error object. | Prevents leaking internal paths, env var values, or stack traces to CI logs. | None |

## 4. Correctly implemented items

| Item | Evidence |
|------|----------|
| Opt-in gate | `RUN_IDENTITY_COMPANY_HTTP_SMOKE !== 'true'` → skip |
| Required env validation | 4 env vars checked; throws if missing |
| Bearer token in Authorization header | `authorization: \`Bearer ${token}\`` |
| Base URL trailing slash stripped | `baseUrl.replace(/\/$/, '')` |
| `/me` status 200 + id string check | 2 assertions |
| `/sessions` status 200 + array check | 2 assertions |
| Own company status 200 | 1 assertion |
| Cross-company 403/404 check | 1 assertion with `includes` |
| Read-only (GET only) | All requests use default GET method |
| No secret leakage | Token only in headers; not logged |
| Fail-closed on error | `process.exitCode = 1` |
| `encodeURIComponent` on IDs | Prevents path injection |

## 5. Security and isolation assessment

| Check | Status | Notes |
|-------|--------|-------|
| **Read-only guarantee** | ✅ VERIFIED | Only GET requests; `request()` helper defaults to GET |
| **Default skip** | ✅ VERIFIED | Exits 0 with message when env var not set |
| **No secret in logs/output** | ✅ VERIFIED | Token only in Authorization header; error output uses `error.message` only |
| **Bearer token handling** | ✅ VERIFIED | Standard `Authorization: Bearer` header |
| **Cross-company isolation tested** | ✅ VERIFIED | Accepts 403 or 404; both deny access |
| **Own-company access tested** | ✅ VERIFIED | Status 200 for valid membership |
| **URL encoding** | ✅ VERIFIED | `encodeURIComponent` on all path parameters |
| **No production code changed** | ✅ VERIFIED | Only script + package.json script entry |
| **No invented routes/tables/events** | ✅ VERIFIED | Only tests existing routes |

## 6. Route cross-check

| Smoke test route | Actual controller route | Match? |
|-----------------|----------------------|--------|
| `GET /api/v1/auth/me` | `identity-company.ts:55` `@Get('me')` on `@Controller('api/v1/auth')` | ✅ |
| `GET /api/v1/auth/sessions` | `identity-company.ts:58` `@Get('sessions')` on `@Controller('api/v1/auth')` | ✅ |
| `GET /api/v1/companies/:companyId` | `companies.ts:72` `@Get(':companyId')` on `@Controller('api/v1/companies')` | ✅ |

## 7. Cross-company isolation evidence

The `CompanyService.get()` at `companies.ts:46-47` enforces:
```sql
WHERE c.id=$1 AND c.deleted_at IS NULL
  AND (c.owner_id=$2
    OR EXISTS (SELECT 1 FROM public.company_members m
               WHERE m.company_id=c.id AND m.user_id=$2 AND m.is_active=true))
```
When the user is not the owner or active member, the query returns empty rows → `ForbiddenException('FORBIDDEN')` → HTTP 403. The smoke test correctly asserts `403` or `404`.

## 8. Missing tests or coverage gaps

| Priority | Gap | Description |
|----------|-----|-------------|
| LOW | No `/auth/sessions/revoke` test | The smoke test only tests GET endpoints. A POST test for revoke would verify session ownership enforcement. However, POST operations violate the read-only guarantee, so this is intentionally excluded. |
| LOW | No expired/invalid token test | The smoke test assumes a valid token. Testing with an expired token would verify fail-closed behavior at the HTTP level. |
| LOW | No concurrent-request test | The smoke test is sequential. Testing concurrent cross-company requests would verify race conditions. |
| LOW | No `npm run smoke:identity-http` in CI evidence | The script exists but there's no evidence it's wired into CI. |

## 9. Final recommendation

**APPROVED** — This is a well-designed, security-conscious HTTP smoke test. The opt-in gate ensures it never runs accidentally. Read-only operations are guaranteed by the `request()` helper. Secrets are never logged or leaked. Cross-company isolation is tested with a defensive assertion (403 or 404). The script is clean, minimal, and correctly exercises 3 NestJS routes. Zero production code changed.
