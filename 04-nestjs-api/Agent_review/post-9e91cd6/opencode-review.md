# Agent Review — Opt-in Company Authorization HTTP Smoke (`9e91cd6`)

- **Reviewer:** opencode
- **Mode:** read-only (no source/test/config changes)
- **Commit:** `9e91cd63eea4fbcc2ada4150efa6648d1b98529d` — `test(identity): add opt-in company authorization HTTP smoke`
- **Files changed by the commit:** `package.json` (+1: `smoke:identity-http` script), `scripts/identity-company-http-smoke.cjs` (new, 39 lines)
- **Verdict:** **APPROVED**

## Scope coverage

| # | Review item | Result | Notes |
|---|-------------|--------|-------|
| 1 | `identity-company-http-smoke.cjs` | PASS | 39-line standalone CommonJS script; valid syntax (`node --check` exit 0). Hits live endpoints via global `fetch` only. |
| 2 | read-only safety / default skip | PASS | Opt-in guard: `if (process.env.RUN_IDENTITY_COMPANY_HTTP_SMOKE !== 'true')` → prints `SKIPPED`, `process.exit(0)`. Default run confirmed exit 0 (no network, no credentials). All requests are GET only (no POST/PUT/DELETE) → read-only by construction. |
| 3 | bearer token handling | PASS | Token read from `process.env.ACCESS_TOKEN`; sent as `authorization: \`Bearer ${token}\``. Guard requires `token` to be present (`if (!… || !token …) throw`) so it can never send `Bearer undefined`. Token is never logged. |
| 4 | `/auth/me` and `/auth/sessions` assertions | PASS | `GET /api/v1/auth/me` → `200` and `body.id` is a string; `GET /api/v1/auth/sessions` → `200` and `body` is an array. |
| 5 | own-company & cross-company isolation | PASS | `GET /companies/<companyId>` → `200`; `GET /companies/<otherCompanyId>` → must be `403` or `404` (denied). `encodeURIComponent` used on both ids (path-injection safe). |
| 6 | error handling & secret leakage | PASS | `main().catch` logs only `error.message` (no stack, no env values, no token, no response body). `request()` swallows JSON-parse errors into `body = null`. No secret/PII is printed. |
| 7 | `package.json` script wiring | PASS | `"smoke:identity-http": "node scripts/identity-company-http-smoke.cjs"` added and correctly references the new script. |

## Detailed findings

**Opt-in / default-skip (items 2, 7)**
- The script does nothing unless `RUN_IDENTITY_COMPANY_HTTP_SMOKE=true`; otherwise it logs `SKIPPED` and exits `0`. This keeps it out of normal `npm test` / CI paths, so it cannot cause accidental live traffic or credential dependency. Verified by running the script with default env → `SKIPPED`, exit 0.
- Read-only: the only HTTP verb used is `fetch(...)` with no `method` override → GET. No state-changing calls.

**Bearer token handling (item 3)**
- `token` is taken solely from `process.env.ACCESS_TOKEN`; if unset (while the opt-in flag is on), the script throws `'API_BASE_URL, ACCESS_TOKEN, COMPANY_ID and OTHER_COMPANY_ID are required'` before any request. The token is placed only in the `authorization` header and is never written to stdout/stderr.

**Endpoint assertions (items 4, 5)**
- `/auth/me`: asserts `200` and a string `id` — confirms the authenticated identity endpoint is reachable and returns a user.
- `/auth/sessions`: asserts `200` and an array — confirms the session list endpoint responds.
- Own company read: asserts `200` — the caller's own company is visible.
- Cross-company read: asserts status ∈ `{403, 404}` — a different company's record is denied. Accepting either `403` (authorization) or `404` (not found) is a reasonable smoke-level assertion: the key guarantee (no cross-company data returned to the caller) holds because a `200` would fail the check. `encodeURIComponent` prevents path injection via the id values.

**Error handling & secret leakage (item 6)**
- Failures are surfaced via `assert` (messages contain only HTTP status / field-name expectations, never token/body) and the top-level handler prints `error.message` only, then sets `process.exitCode = 1`. No stack trace, response body, or environment value is logged, so there is no secret/PII leakage through the smoke output.
- `request()` wraps `response.json()` in try/catch so empty/non-JSON responses (e.g., `204`/health) don't crash the run.

## Security assessment
- **No privilege escalation / no write path:** read-only GET only; cannot mutate data.
- **No credential leakage:** `ACCESS_TOKEN` used solely in the request header and never logged; error output is limited to `.message`.
- **Opt-in by design:** cannot run unintentionally; safe in CI unless an operator explicitly enables it with trusted `API_BASE_URL` + a real token.
- **Isolation check present:** cross-company read is asserted denied (403/404). (Deeper ownership of `/auth/sessions` rows is covered by unit tests in `identity-company.spec.ts`; this smoke only asserts shape/status.)

## Recommendations (non-blocking)
- The cross-company assertion accepts `404` as "denied". If the deployment guarantees `403` for authorization failures (vs `404` only when the company truly doesn't exist), tightening to require `403` would make the smoke a stronger authorization signal and avoid a false-pass when the endpoint is misconfigured to `404` everything. Optional.
- Consider adding a brief comment in the script that `API_BASE_URL` must point to the trusted deployment, so operators don't point it at an untrusted host (which would expose the supplied access token). This is operational guidance, not a code defect.
- The smoke does not assert that `/auth/sessions` returns only the caller's own rows (shape-only check). Unit-level ownership is already enforced in `identity-company.ts` + `identity-company.spec.ts`; if desired, a future smoke addition could assert every returned `user_id` equals the caller.

## Evidence
- `node --check scripts/identity-company-http-smoke.cjs` → **CHECK-EXIT 0** (valid syntax).
- `node scripts/identity-company-http-smoke.cjs` (default, no opt-in flag) → prints `SKIPPED: set RUN_IDENTITY_COMPANY_HTTP_SMOKE=true to run this read-only smoke test`; **exit 0** (opt-in/read-only behavior confirmed; no network, no credentials used).
- `git show --stat` confirms the commit touches only `package.json` (+1) and `scripts/identity-company-http-smoke.cjs` (new) — no source/config/test logic modified.

## Files inspected
- `04-nestjs-api/04-nestjs-api-app/scripts/identity-company-http-smoke.cjs` (added by this commit)
- `04-nestjs-api/04-nestjs-api-app/package.json` (`smoke:identity-http` script)
- (context) `04-nestjs-api/04-nestjs-api-app/src/identity-company.ts` and `src/identity-company.spec.ts` — referenced for isolation guarantees asserted by the smoke

## Repo state
Working tree clean apart from `Agent_review/` (untracked). No source, test, or configuration file was modified by this review. No secrets or PII are included in this report.
