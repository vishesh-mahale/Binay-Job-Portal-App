# Agent Review — Identity /me + Session Revocation Boundaries (`e7e30c2`)

- **Reviewer:** opencode
- **Mode:** read-only (no source/test/config changes)
- **Commit:** `e7e30c2f2ea8f842d99ec598aeec029f9288f5be` — `test(identity): cover user context and session revocation boundaries`
- **Files changed by the commit:** `src/identity-company.spec.ts` (new, 37 lines) — **test file only**
- **Verdict:** **APPROVED**

## Scope coverage

| # | Scope item | Result | Notes |
|---|-----------|--------|-------|
| 1 | `src/identity-company.spec.ts` | PASS | 5 focused tests, all meaningful, all green (see Evidence). |
| 2 | `src/identity-company.ts` | PASS | No change in this commit (pre-existing, correct). `me`/`sessions`/`revoke` implement the asserted behavior. |
| 3 | UserContextClient-based `/me` access | PASS | `me` calls `userClient.queryAsUser(token, …)`; `system.query` is never used for `/me` (asserted by test 1). `UserContextClient` runs `SET LOCAL ROLE authenticated` + `set_config('request.jwt.claims', …)` so the read executes under the caller's verified JWT/RLS (`clients.ts:13-16`). |
| 4 | session listing user isolation | PASS | `sessions(userId)` = `SELECT … FROM public.user_sessions WHERE user_id = $1`. Controller passes `request.user!.sub` (server-derived, never client-supplied). |
| 5 | single-session revoke ownership + UUID validation | PASS | `revoke` = `UPDATE … WHERE id = $1 AND user_id = $2` (ownership enforced server-side); malformed id → `BadRequestException` via UUID regex; DTO `@IsUUID()` adds HTTP-boundary defense-in-depth. |
| 6 | fail-closed behavior | PASS | `/me` empty → `NotFoundException`; `revoke` malformed id → `BadRequestException`; `revoke` valid-but-unknown (or owned by another user) → `NotFoundException` via 0 affected rows (no existence/ownership leak). |
| 7 | regression impact | PASS | Commit adds a test file only → zero implementation regression. Tests lock in the secure behavior and will catch future regressions (dropped `WHERE user_id`, removed UUID check, or `/me` switching to `system` client). |

## Behavior verification (implementation vs tests)

**`me` (`identity-company.ts:15-25`)**
- Uses `request.rawAccessToken` as the JWT for `userClient.queryAsUser`, with SQL `SELECT … FROM public.users WHERE id = $1 AND deleted_at IS NULL` and `$1 = request.user?.sub`.
- `rawAccessToken` is populated by `AuthGuard` (`auth.ts:27`, `cookieToken || headerToken`), so `/me` genuinely runs in the authenticated user's RLS context; the `WHERE id = $1` clause is a second, explicit scoping on top of RLS.
- Empty result → `NotFoundException` (fail-closed; no profile/null leak).
- Test 1 asserts `system.query` is **not** called → confirms `/me` does not bypass into the server-only `SystemClient`.

**`sessions` (`identity-company.ts:27-34`)**
- `system.query(SELECT … FROM public.user_sessions WHERE user_id = $1 …)`; `userId` comes from `request.user!.sub` in `IdentityController.sessions` (`identity-company.ts:59`). User can only list their own sessions.

**`revoke` (`identity-company.ts:36-47`)**
- UUID shape enforced by regex `/^[0-9a-f]{8}-…-[0-9a-f]{12}$/i` → `BadRequestException('VALIDATION_ERROR')` for malformed ids (e.g. `'not-a-uuid'`).
- `UPDATE public.user_sessions SET … WHERE id = $1 AND user_id = $2 RETURNING …` → a user can only revoke their own session; a valid UUID owned by another user affects 0 rows → `NotFoundException` (no cross-user revoke, no leak).
- `RevokePresenceSessionDto` (`@Allow() @IsUUID() session_id`) enforces UUID at the HTTP boundary via the global `ValidationPipe` (defense-in-depth).

## Security assessment
- **No horizontal privilege escalation:** session listing and single-session revoke are both scoped to `request.user.sub` server-side; the userId is never taken from the request body.
- **No confusion of trust boundaries:** `/me` is the only identity read and it goes through `UserContextClient` (SELECT-only + `authenticated` role + JWT claims), never `SystemClient`.
- **Fail-closed:** every missing/unknown/malformed case throws (`NotFoundException`/`BadRequestException`); nothing returns `null`/empty in a way that leaks existence.
- **Defense-in-depth:** UUID validated in both the service and the DTO; ownership enforced in SQL `WHERE` and by RLS via `request.jwt.claims`.
- No secrets, tokens, or PII appear in the spec (only dummy ids/emails like `u1`, `u@example.test`, `token`). None are reproduced in this report.

## Evidence
- `node ./node_modules/jest/bin/jest.js identity-company.spec.ts` → **Tests: 5 passed, 5 total; Test Suites: 1 passed; ID-EXIT 0**.
  - √ identity me reads only through the user-context client and raw access token
  - √ identity me fails closed when the user row is absent
  - √ sessions are listed for the authenticated user only
  - √ single-session revoke validates UUID and scopes the update to the user
  - √ single-session revoke rejects malformed ids and unknown sessions
- `git show --stat` confirms the commit touches **only** `src/identity-company.spec.ts` (no source/config change).

## Recommendations (non-blocking)
- `me` uses `request.user?.sub` (optional chain) while the controller uses `request.user!.sub`. Both are safe (fail-closed), but aligning the type (e.g. non-optional `user` on `AuthenticatedRequest`) would remove the asymmetry. Informational only.
- If `rawAccessToken` were ever absent when the guard passes, `queryAsUser('')` throws a generic `Error('Invalid user JWT')` rather than `NotFoundException`. The `AuthGuard` always sets it today, so this is only a theoretical edge; consider normalizing the error type if it matters for client messaging.

## Files inspected
- `04-nestjs-api/04-nestjs-api-app/src/identity-company.spec.ts` (added by this commit)
- `04-nestjs-api/04-nestjs-api-app/src/identity-company.ts` (implementation under test)
- `04-nestjs-api/04-nestjs-api-app/src/clients.ts` (`UserContextClient.queryAsUser` RLS/SELECT-only boundary)
- `04-nestjs-api/04-nestjs-api-app/src/auth.ts:9,27` (`AuthenticatedRequest`, `rawAccessToken` population)
- `04-nestjs-api/04-nestjs-api-app/src/app.module.ts:7,32` (IdentityController/IdentityService wiring)

## Repo state
Working tree clean apart from `Agent_review/` (untracked). No source, test, or configuration file was modified by this review.
