# Buffy Review — Batch 4A Password Recovery & Security

## 1. Scope and repository state verified

**HEAD:** `093ef0cf` (uncommitted changes)
**Review target:** Batch 4A — Native Password Recovery & Password Security Enforcement

### Files inspected:
- `04-nestjs-api/04-nestjs-api-app/src/modules/auth/auth-provider.ts`
- `04-nestjs-api/04-nestjs-api-app/src/modules/auth/auth.ts`
- `04-nestjs-api/04-nestjs-api-app/src/modules/auth/auth-provider.spec.ts`
- `03-nextjs-web/03-nextjs-web-app/src/app/forgot-password/page.tsx`
- `03-nextjs-web/03-nextjs-web-app/src/app/reset-password/page.tsx`
- `03-nextjs-web/03-nextjs-web-app/src/lib/reset-password-parser.ts`
- `03-nextjs-web/03-nextjs-web-app/src/lib/api-client.ts`
- `03-nextjs-web/03-nextjs-web-app/src/app/auth-pages.spec.tsx`
- `03-nextjs-web/03-nextjs-web-app/src/context/auth-context.tsx`
- `03-nextjs-web/03-nextjs-web-app/src/types/auth.ts`
- `02-database/migrations/baseline/04_password_change_trigger.sql`
- `02-database/migrations/baseline/03_users_auth.sql` (line 136: `last_password_changed_at`)

### Commands executed:
| Command | Result |
|---------|--------|
| `npx jest --runInBand --forceExit` (backend) | ✅ 33/33 suites, 223/223 tests PASS |
| `npx tsc --noEmit` (backend) | ✅ Exit 0, zero errors |
| `npx jest --runInBand` (frontend) | ✅ 7/7 suites, 58/58 tests PASS |

---

## 2. Executive verdict

**⚠️ APPROVED WITH REQUIRED FIXES**

One **CRITICAL** finding: the Supabase service-role JWT key is **hardcoded as a fallback** in the client-side `reset-password/page.tsx` source code. This must be fixed before any merge or deployment.

---

## 3. Evidence-based findings

| ID | Severity | Area | Finding | Exact evidence | Required action |
|----|----------|------|---------|----------------|-----------------|
| **F-1** | **CRITICAL** | `reset-password/page.tsx:24-25` | **Service-role JWT key hardcoded in client code.** The hardcoded fallback string `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6cHZzc3J5b291Y3lnbnVpZmtiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjY2MDU5OCwiZXhwIjoyMTAyMjM2NTk4fQ...` decodes to `{"role":"service_role","ref":"jzpvssryooucygnuifkb",...}`. This is the **service role key**, not the anon key. Anyone viewing the page source or JS bundle can extract it. It grants **full admin access** to the Supabase project. The variable name `anonKey` is misleading. | Remove the hardcoded fallback. Either (a) use only the `NEXT_PUBLIC_SUPABASE_ANON_KEY` env var with no fallback, or (b) route the recovery reset through the NestJS backend (`POST /api/v1/auth/reset-password`) which already has the secret key server-side. The Supabase `/auth/v1/user` endpoint requires the **anon key** for recovery token operations, not the service role key — confirm which key the Supabase recovery flow actually needs. |
| **F-2** | HIGH | `reset-password/page.tsx:26-35` | Recovery password reset bypasses NestJS entirely. The client sends `PUT /auth/v1/user` directly to Supabase, skipping the NestJS `changePassword()` flow. This means: (1) no `last_password_changed_at` update via the trigger (trigger fires on `encrypted_password` change in `auth.users`, which this PUT does trigger — **needs Supabase-side verification**); (2) no NestJS audit event; (3) no global session revocation before password change; (4) the recovery token is used as a Bearer token directly in the browser. | Verify with Supabase docs or test whether `PUT /auth/v1/user` with a recovery token triggers the `on_auth_user_password_updated` trigger on `auth.users.encrypted_password`. If it does not, `last_password_changed_at` will not be updated and old tokens will not be rejected by the AuthGuard. Add NestJS-side audit logging for recovery resets. |
| **F-3** | HIGH | `reset-password/page.tsx:24` | `NEXT_PUBLIC_SUPABASE_URL` has a hardcoded fallback to a real Supabase project URL (`https://jzpvssryooucygnuifkb.supabase.co`). This leaks the project reference. | Remove the hardcoded fallback. Require the env var at build time or use a config check. |
| **F-4** | MEDIUM | `auth-provider.ts` console logging | Multiple `console.error` and `console.log` calls expose error codes, HTTP statuses, user IDs, and operation outcomes. Examples: `[SupabaseAuth] Path: ${path}, Status: ${response.status}, ErrorCode: ...` (line 84), `[SupabaseAuthAdmin] Delete user ${userId} failed` (line 99), `[SupabaseAuth] logoutGlobalUser HTTP status: ${res.status}` (line 118). | Replace with structured logger at `warn` level. Do not log user IDs, HTTP status codes, or error details to stdout in production. Use a structured logger with redaction. |
| **F-5** | MEDIUM | `auth-provider.ts` test suite | No unit test for `forgotPassword()` on the `SupabaseAuthProvider` class itself (only the controller is tested). No unit test for `changePassword()` success path through the controller with audit verification. No test for the `reset-password-parser.ts` in a dedicated spec file (covered indirectly by `auth-pages.spec.tsx`). | Add: (1) `SupabaseAuthProvider.forgotPassword()` unit test verifying correct URL, headers, and email_redirect_to; (2) controller change-password success test verifying audit call; (3) dedicated `reset-password-parser.spec.ts` with edge-case coverage. |
| **F-6** | LOW | `auth-provider.ts:117` | `logoutGlobalUser()` logs `[SupabaseAuth] logoutGlobalUser HTTP status: ${res.status}` via `console.log`. This is not an error but still exposes HTTP status details. | Change to debug-level structured logging or remove. |
| **F-7** | LOW | `ForgotPasswordDto` | `@IsEmail()` decorator is present, but the controller also has a manual `if (!body.email)` check. Redundant but harmless. | Remove manual check (ValidationPipe already rejects invalid emails) or remove decorator (keep manual). Choose one pattern. |

---

## 4. Correctly implemented items

| # | Item | Evidence |
|---|------|----------|
| 1 | **Anti-enumeration:** `forgotPassword()` returns identical `{ success: true, message: '...' }` for both known and unknown emails | `auth-provider.ts:292-306` — catch block falls through to same return; unit test `auth-provider.spec.ts` line ~234 |
| 2 | **Supabase `/auth/v1/recover` contract** used correctly | `auth-provider.ts:275-289` — POST with `email`, `email_redirect_to`, secret key auth |
| 3 | **Address bar scrubbing:** `window.history.replaceState({}, document.title, window.location.pathname)` immediately after token extraction | `reset-password/page.tsx:38-40` |
| 4 | **Token in-memory only:** Recovery token stored only in React `useState`, never in localStorage/sessionStorage/cookies | `reset-password-page.tsx:18-21` |
| 5 | **Hash parsing error-first:** `parseResetPasswordHash()` evaluates error parameters BEFORE checking for recovery token (expired link case) | `reset-password-parser.ts:15-24` |
| 6 | **fail-closed changePassword():** If `logoutGlobalUser()` returns false, `ServiceUnavailableException('GLOBAL_LOGOUT_FAILED')` thrown, password NOT changed | `auth-provider.ts:169-171` |
| 7 | **Change password requires authentication:** `@UseGuards(AuthGuard)` on `change-password` endpoint | `auth-provider.ts:328` |
| 8 | **Math.ceil cutoff** correctly implemented in both `AuthGuard.canActivate()` and `AuthProviderController.refresh()` | `auth.ts:55-61`, `auth-provider.ts:238-249` |
| 9 | **PostgreSQL trigger** is fail-closed with `SECURITY DEFINER`, `search_path`, and `IF NOT FOUND THEN RAISE EXCEPTION` | `04_password_change_trigger.sql:10-11` |
| 10 | **Old token rejection after password change:** Both access and refresh tokens with `iat < cutoffSeconds` are rejected; cookies cleared | `auth.ts:55-61`, `auth-provider.ts:238-249` |
| 11 | **Global logout before password change:** `POST /auth/v1/logout?scope=global` with user's access token | `auth-provider.ts:155-165` |
| 12 | **ForgotPassword page anti-enumeration fallback:** Client-side catch also shows generic message | `forgot-password/page.tsx:30-32` |
| 13 | **ResetPassword validation:** Min 8 chars, password confirmation match, missing token check | `reset-password/page.tsx:49-60` |
| 14 | **All 223 backend tests pass, 58 frontend tests pass** | Verified via `npx jest` |

---

## 5. Required fixes before merge

| # | Fix | Severity | Blocks? |
|---|-----|----------|---------|
| **F-1** | **Remove service-role JWT hardcoded fallback** from `reset-password/page.tsx`. Either use only env var with no fallback, or route through NestJS backend. | CRITICAL | YES |
| **F-2** | **Verify recovery reset triggers `last_password_changed_at`**. Test whether Supabase `PUT /auth/v1/user` with recovery token triggers the `on_auth_user_password_updated` trigger. If not, add NestJS-side update. | HIGH | YES |
| **F-3** | **Remove hardcoded Supabase project URL fallback** from `reset-password/page.tsx`. | HIGH | YES |
| **F-4** | **Replace console.error/console.log with structured logger** in `auth-provider.ts`. Do not log user IDs or HTTP status codes. | MEDIUM | No |
| **F-5** | **Add unit tests** for `SupabaseAuthProvider.forgotPassword()`, controller change-password success path, and dedicated `reset-password-parser.spec.ts`. | MEDIUM | No |

---

## 6. Security and authorization findings

| Check | Result |
|-------|--------|
| Service-role key in browser bundle? | ❌ **YES — CRITICAL** (F-1) |
| Recovery token leaked to logs/storage/analytics? | ✅ No (in-memory only, scrubbed) |
| Old tokens rejected after password change? | ✅ Yes (Math.ceil cutoff) |
| Global logout before authenticated change? | ✅ Yes (fail-closed) |
| PostgreSQL trigger fail-closed? | ✅ Yes |
| Anti-enumeration on forgot-password? | ✅ Yes |
| AuthGuard protects change-password? | ✅ Yes |
| No password in audit events? | ✅ Only IP logged |
| `credentials: include` on frontend API calls? | ✅ Yes (api-client.ts) |

---

## 7. Contract and database review

| Check | Result |
|-------|--------|
| `ForgotPasswordDto` has `@IsEmail()` | ✅ |
| `ChangePasswordDto` has `@IsString() @MinLength(8)` | ✅ |
| `last_password_changed_at` exists in SQL | ✅ `03_users_auth.sql:136` |
| Trigger `SECURITY DEFINER` + `search_path` | ✅ |
| Trigger `IF NOT FOUND` raises exception | ✅ |
| Supabase `/auth/v1/recover` endpoint used | ✅ |
| Supabase `/auth/v1/logout?scope=global` used | ✅ |
| Supabase `/auth/v1/user` (PUT) for recovery reset | ⚠️ Needs verification that it triggers `encrypted_password` trigger |

---

## 8. Test and integration review

| Suite | Count | Pass | Notes |
|-------|-------|------|-------|
| Backend unit tests | 223 | ✅ 223 | 33 suites |
| Frontend unit tests | 58 | ✅ 58 | 7 suites |
| `parseResetPasswordHash` tests | 3 | ✅ 3 | In `auth-pages.spec.tsx` |
| `forgotPassword` controller test | 2 | ✅ 2 | Anti-enumeration verified |
| `changePassword` controller test | 3 | ✅ 3 | Invalid password, success, GLOBAL_LOGOUT_FAILED |
| `changePassword` provider test | 2 | ✅ 2 | Missing token, failed global logout |
| Dedicated `reset-password-parser.spec.ts` | 0 | ❌ | Missing — only covered indirectly |

---

## 9. Documentation/tracker corrections

| Item | Issue |
|------|-------|
| Handoff claims "No tokens or passwords are retained in client logs" | Verified correct — no localStorage/sessionStorage/cookie usage for recovery token |
| Handoff claims "Fail-closed behavior enforced at database trigger level, provider API level, and guard level" | Verified correct — trigger raises exception, changePassword throws GLOBAL_LOGOUT_FAILED, AuthGuard rejects expired iat |
| Handoff claims "223/223 tests passed" | ✅ Verified |
| Handoff claims "58/58 frontend tests" | ✅ Verified |
| Handoff does NOT mention hardcoded service-role key in reset-password page | ⚠️ **Omission — CRITICAL security gap not acknowledged** |

---

## 10. Final recommendation

**APPROVED WITH REQUIRED FIXES**

**Batch 4A is NOT production-ready** due to F-1 (service-role key in client code). However, the core architecture is sound:

- Anti-enumeration ✅
- fail-closed change password ✅
- Math.ceil cutoff ✅
- Token scrubbing ✅
- Global logout ✅
- PostgreSQL trigger ✅

**Immediate next steps:**
1. **Fix F-1:** Remove hardcoded service-role JWT from `reset-password/page.tsx`. Route recovery reset through NestJS or use correct anon key.
2. **Fix F-2:** Verify Supabase recovery PUT triggers `last_password_changed_at` trigger. Add NestJS-side audit.
3. **Fix F-3:** Remove hardcoded Supabase URL fallback.
4. After fixes, re-run full test suite and verify trigger behavior with integration test.

**Batch 4B is blocked until F-1 is resolved.**

---

## 11. No-code-change confirmation

This is a read-only review. No source code, SQL, tests, or configuration files were modified.
