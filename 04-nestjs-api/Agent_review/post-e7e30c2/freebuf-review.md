# freebuf Review — Commit e7e30c2

## 1. Commit and scope verified

```
HEAD:   e7e30c2f2ea8f842d99ec598aeec029f9288f5be
Subject: test(identity): cover user context and session revocation boundaries
Files:   identity-company.spec.ts (+37 new file, 5 tests)
```

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | ✅ Exit 0, zero errors |
| `npm test -- --runInBand --forceExit` | ✅ 33 suites, 193 tests — ALL PASS (25s) |
| `identity-company.spec.ts` | ✅ 5/5 tests pass |

## 2. Executive verdict

**APPROVED**

This commit adds 5 targeted tests covering the security-critical boundaries of `IdentityService`: UserContextClient-based `/me` reads, session listing isolation, single-session revoke with UUID validation, and fail-closed behavior. All tests are well-designed and pass cleanly.

## 3. Evidence-based findings

| ID | Severity | File/Line | Finding | Evidence | Required action |
|----|----------|-----------|---------|----------|-----------------|
| F-1 | NO ISSUE | identity-company.spec.ts:4-11 | **`/me` reads through UserContextClient only** — Verifies `queryAsUser` is called with the raw access token, SQL contains `deleted_at IS NULL`, and `system.query` is NOT called. | `me()` at identity-company.ts:13-20 — calls `this.userClient.queryAsUser(token, ...)` with `request.rawAccessToken` and `[request.user?.sub]`. Test asserts `userClient.queryAsUser` called with correct args AND `system.query` never called. This proves identity reads bypass the trusted SystemClient. | None |
| F-2 | NO ISSUE | identity-company.spec.ts:13-16 | **Fail-closed on absent user row** — When `queryAsUser` returns empty rows, `me()` throws `NotFoundException`. | `me()` at identity-company.ts:18 — `if (!result.rows[0]) throw new NotFoundException('NOT_FOUND')`. Test mocks empty rows and asserts `rejects.toBeInstanceOf(NotFoundException)`. | None |
| F-3 | NO ISSUE | identity-company.spec.ts:18-22 | **Session listing scoped to authenticated user** — Verifies SQL query contains `WHERE user_id = $1` and uses `system.query` (not `userClient`). | `sessions()` at identity-company.ts:23-28 — `WHERE user_id = $1` with `[userId]`. Test asserts both `stringContaining('FROM public.user_sessions')` and `toContain('WHERE user_id = $1')`. Confirms cross-user session leakage is impossible. | None |
| F-4 | NO ISSUE | identity-company.spec.ts:24-28 | **Session revoke UUID validation + user scoping** — Verifies `revoke()` uses `WHERE id = $1 AND user_id = $2` with both session ID and user ID. | `revoke()` at identity-company.ts:30-38 — UUID regex guard at line 31, then `WHERE id = $1 AND user_id = $2`. Test asserts correct SQL and parameters `[sessionId, 'u1']`. | None |
| F-5 | NO ISSUE | identity-company.spec.ts:30-34 | **Revoke rejects malformed UUID and unknown sessions** — `'not-a-uuid'` → `BadRequestException`; valid UUID but no matching row → `NotFoundException`. | `revoke()` at identity-company.ts:31 — regex test rejects invalid UUIDs. Line 36 — `if (!result.rows[0]) throw new NotFoundException('NOT_FOUND')`. Both paths tested. | None |
| F-6 | NO ISSUE | identity-company.spec.ts:7 | **Raw access token propagation verified** — `me()` receives `rawAccessToken` from request and passes it to `queryAsUser`. | `me()` at identity-company.ts:14 — `const token = request.rawAccessToken ?? ''`. Test passes `{ rawAccessToken: 'token', user: { sub: 'u1' } }` and asserts `queryAsUser` called with `'token'`. | None |

## 4. Correctly implemented items

| Item | Evidence |
|------|----------|
| `/me` uses UserContextClient only | `system.query` explicitly asserted NOT called |
| Fail-closed on absent user | `NotFoundException` thrown when rows empty |
| Session listing scoped by user_id | SQL contains `WHERE user_id = $1` |
| Revoke validates UUID format | Regex `/^[0-9a-f]{8}-...$/i` before DB query |
| Revoke scoped by both session + user | `WHERE id = $1 AND user_id = $2` |
| Malformed UUID → `BadRequestException` | Tested with `'not-a-uuid'` |
| Unknown session → `NotFoundException` | Tested with valid UUID that returns empty rows |
| All 5 tests pass | 5/5 in identity-company.spec.ts |
| Zero regressions | 193/193 tests pass across 33 suites |

## 5. Security and tenant-isolation assessment

| Check | Status | Notes |
|-------|--------|-------|
| **UserContextClient boundary** | ✅ VERIFIED | `/me` uses `queryAsUser(token, ...)` — RLS-scoped; SystemClient never called |
| **Session listing isolation** | ✅ VERIFIED | `WHERE user_id = $1` — user cannot see other users' sessions |
| **Revoke user scoping** | ✅ VERIFIED | `WHERE id = $1 AND user_id = $2` — user cannot revoke other users' sessions |
| **UUID validation** | ✅ VERIFIED | Regex guard rejects malformed IDs before DB query |
| **Fail-closed behavior** | ✅ VERIFIED | Absent user → `NotFoundException`; unknown session → `NotFoundException` |
| **No raw SQL injection risk** | ✅ VERIFIED | All queries use parameterized `$1`, `$2` placeholders |
| **No invented tables/columns/events** | ✅ VERIFIED | Only test file added; no production code changed |
| **Cross-user data leakage** | ✅ VERIFIED | Session listing and revoke both scoped by `user_id` |

## 6. SQL baseline cross-check

| Table/Column | Used in code | SQL baseline match |
|-------------|-------------|-------------------|
| `public.users.id` | `WHERE id = $1` in `me()` | ✅ `03_users_auth.sql:57` |
| `public.users.deleted_at` | `deleted_at IS NULL` in `me()` | ✅ `03_users_auth.sql:78` |
| `public.user_sessions.id` | `WHERE id = $1` in `revoke()` | ✅ `03_users_auth.sql:208` |
| `public.user_sessions.user_id` | `WHERE user_id = $1` in `sessions()` and `revoke()` | ✅ `03_users_auth.sql:209` |
| `public.user_sessions.is_online` | `SET is_online = false` in `revoke()` | ✅ `03_users_auth.sql:212` |
| `public.user_sessions.socket_id` | `SET socket_id = NULL` in `revoke()` | ✅ `03_users_auth.sql:213` |

## 7. Test quality assessment

| Test | What it proves | Mock accuracy | Assertion strength |
|------|---------------|---------------|-------------------|
| `/me` reads through UserContextClient | RLS boundary maintained | Correct: `queryAsUser` mock, `system.query` spy | Strong: positive + negative assertion |
| Fail-closed on absent user | No silent failure | Correct: empty rows mock | Strong: `toBeInstanceOf(NotFoundException)` |
| Session listing scoped | Cross-user leakage prevented | Correct: `system.query` mock | Strong: 3 assertions (table, WHERE, params) |
| Revoke UUID + scoping | UUID guard + ownership check | Correct: `system.query` mock | Strong: 2 assertions (SQL content + params) |
| Revoke rejects bad UUIDs | Input validation works | Correct: empty rows for valid UUID | Strong: 2 assertions (BadRequest + NotFound) |

## 8. Missing tests or coverage gaps

| Priority | Gap | Description |
|----------|-----|-------------|
| LOW | No test for `me()` with missing `rawAccessToken` | When `rawAccessToken` is `undefined`, `token` defaults to `''`. The DB query with empty token and valid `sub` would return rows (since RLS handles the real auth). A test verifying the `?? ''` fallback would be useful. |
| LOW | No test for session listing with empty results | Only the happy path is tested. A test verifying `sessions('nonexistent-user')` returns `[]` would be valuable. |
| LOW | No test for revoke by non-owner | The test verifies the SQL WHERE clause includes `user_id = $2`, but a test showing that another user's session ID returns `NotFoundException` would strengthen the ownership claim. |

## 9. Tracker/documentation impact

No tracker file was modified. The new test suite adds coverage for the identity/session security boundary which was previously untested. The IMPLEMENTATION-TRACKER-HINGLISH.md test count should be updated from 188 to 193.

## 10. Final recommendation

**APPROVED** — All 5 tests are well-designed, correctly mock the real service behavior, and verify security-critical boundaries: UserContextClient isolation for `/me` reads, session listing user scoping, revoke UUID validation + ownership, and fail-closed behavior. Zero production code changed. Zero regressions. The 3 LOW follow-ups are test hardening opportunities, not security gaps.
