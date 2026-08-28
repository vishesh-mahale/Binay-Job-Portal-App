# Phase 09 — OAuth Implementation Plan Review

**Reviewer:** Freebuf (Independent Senior NestJS + PostgreSQL + Auth Architect)
**Date:** 2026-08-27
**Target:** `04-nestjs-api/04-nestjs-api-app/PHASE-09-OAUTH-IMPLEMENTATION-PLAN.md`
**Status:** `ARCHITECTURE READY; environment values pending`

---

## 1. Executive Verdict

**APPROVED WITH REQUIRED FIXES — 2 BLOCKERs + 3 HIGH gaps**

The plan is architecturally sound: NestJS owns the OAuth boundary, Supabase Auth handles provider exchange, state/PKCE are mentioned, and trigger ownership is preserved. However:

- **2 BLOCKERs**: `auth-audit.ts` will violate SQL CHECK constraint on OAuth login; required env vars missing from `config.ts`
- **3 HIGH gaps**: AuthProvider interface needs OAuth methods; encryption mechanism undefined; account-linking scope incomplete
- **Zero invented tables/columns/events** — all recommendations use existing schema
- **Multi-instance state is correctly addressed** via cookie-based storage

---

## 2. Files Reviewed

| # | File | Evidence Used |
|---|------|---------------|
| 1 | `PHASE-09-OAUTH-IMPLEMENTATION-PLAN.md` | Target document |
| 2 | `04-nestjs-api/04-nestjs-api-app/src/auth-provider.ts` | Current AuthProvider — no OAuth methods; `mapFailureReason` has `invalid_oauth_token` |
| 3 | `04-nestjs-api/04-nestjs-api-app/src/auth.ts` | AuthGuard — cookie/header extraction; no OAuth state handling |
| 4 | `04-nestjs-api/04-nestjs-api-app/src/auth-audit.ts` | `loginAttempt()` hardcodes `'email_password'` — BLOCKER for OAuth |
| 5 | `04-nestjs-api/04-nestjs-api-app/src/config.ts` | No OAuth env vars defined |
| 6 | `04-nestjs-api/04-nestjs-api-app/src/main.ts` | CORS configured; `credentials: true` |
| 7 | `04-nestjs-api/AUTH-COOKIE-CONTRACT-TEMPORARY.md` | Cookie paths/flags; no OAuth state cookie defined |
| 8 | `04-nestjs-api/PHASE-09-B-API-CONTRACT-DECISIONS-HINGLISH.md` | D1-D8 frozen decisions |
| 9 | `02-database/migrations/baseline/02_enums.sql` | `auth_login_type`, `login_failure_reason`, `security_event_type` |
| 10 | `02-database/migrations/baseline/03_users_auth.sql` | `login_history` CHECK constraints, `handle_new_user()` trigger |

---

## 3. Findings Table

| ID | Severity | Finding | Evidence | Required Fix |
|----|----------|---------|----------|-------------|
| **B-1** | **BLOCKER** | `auth-audit.ts` `loginAttempt()` hardcodes `'email_password'::public.auth_login_type` and `NULL` for `auth_provider` | `auth-audit.ts` L15: `VALUES ($1, $2, 'email_password'::public.auth_login_type, NULL, ...)` | Refactor to accept `loginType` and `authProvider` parameters |
| **B-2** | **BLOCKER** | `login_history` CHECK constraint `login_history_provider_consistency` will reject OAuth rows if `auth_provider` is NULL | `03_users_auth.sql`: `CONSTRAINT login_history_provider_consistency CHECK ((login_type IN ('oauth', 'sso') AND auth_provider IS NOT NULL AND btrim(auth_provider) <> '') ...)` | Pass non-empty `auth_provider` string for every OAuth login |
| **B-3** | **BLOCKER** | Required env vars (`ALLOWED_OAUTH_PROVIDERS`, `OAUTH_CALLBACK_URL`, `OAUTH_FRONTEND_SUCCESS_URL`, `OAUTH_FRONTEND_ERROR_URL`, `OAUTH_STATE_SECRET`, `OAUTH_STATE_TTL_SECONDS`) not in `config.ts` `envSchema` | `config.ts` — zero OAuth-related env vars | Add all 6 env vars to `envSchema` with appropriate Zod validation |
| **H-1** | **HIGH** | `AuthProvider` interface only has `signup`, `login`, `refresh` — no OAuth methods | `auth-provider.ts`: `interface AuthProvider { signup(...); login(...); refresh(...); }` | Add `getOAuthRedirectUrl(provider, redirectTo)` and `exchangeOAuthCode(code, state)` |
| **H-2** | **HIGH** | "encrypted HttpOnly state cookie" — encryption mechanism undefined; what cipher, what key derivation, what IV? | Plan: "store encrypted HttpOnly short-lived state cookie" | Define: AES-256-GCM with `OAUTH_STATE_SECRET` as key; or use plaintext signed cookie (simpler) |
| **H-3** | **HIGH** | Account-linking scope says "follow approved account-linking decision" but no such decision exists in frozen documents | Plan: "Explicit-link/no-link behavior must be implemented according to the approved account-linking decision" | Explicitly state: no cross-provider linking; `handle_new_user()` ON CONFLICT DO NOTHING is correct behavior |
| **H-4** | **HIGH** | No `binay_oauth_state` cookie defined in `AUTH-COOKIE-CONTRACT-TEMPORARY.md` | Cookie contract lists only 3 cookies (access, refresh, presence) | Add state cookie to contract: `binay_oauth_state`, path `/api/v1/auth/oauth`, HttpOnly, Secure, SameSite=Lax, 10-min TTL |
| **M-1** | **MEDIUM** | Plan doesn't specify whether NestJS uses Supabase JS client (`signInWithOAuth()`) or constructs redirect URL manually | `SupabaseAuthProvider` uses raw `fetch` to Supabase REST API | Decision: NestJS constructs redirect URL manually using Supabase Auth REST API; or add `@supabase/supabase-js` dependency |
| **M-2** | **MEDIUM** | `SupabaseAuthProvider.call()` method only handles POST JSON responses — OAuth token exchange may return different format | `auth-provider.ts`: `const payload = await response.json()` | Verify Supabase Auth `/auth/v1/token?grant_type=authorization_code` response format |
| **M-3** | **MEDIUM** | Plan mentions "provider-aware login_history audit" but doesn't specify how `auth_provider` value is derived from Supabase response | `login_history.auth_provider VARCHAR(50)` expects trimmed provider name | Extract provider from Supabase Auth user metadata (`app_metadata.provider`) or callback query param |
| **M-4** | **MEDIUM** | Plan says "multi-instance state behavior test" but doesn't explain why multi-instance is a concern | State stored in HttpOnly cookie — each instance decrypts independently | Clarify: state cookie is per-request, not server-side; multi-instance is safe IF same `OAUTH_STATE_SECRET` on all instances |
| **M-5** | **MEDIUM** | `SameSite=Lax` on auth cookies — OAuth callback from Supabase is same-origin redirect, but if Supabase is on different domain (e.g., `xxx.supabase.co`), callback cookies may be stripped | Cookie contract: `SameSite: Lax` | Verify: if Supabase Auth callback is server-side redirect (not cross-origin POST), `SameSite=Lax` is fine |
| **L-1** | **LOW** | Plan lists "OAuth callback rate-limit test" but no rate-limit mechanism exists for any endpoint | No rate-limit middleware in `main.ts` | Acceptable: rate limiting is a separate concern; document as future gate |
| **L-2** | **LOW** | `OAUTH_STATE_TTL_SECONDS` type not specified in plan | Plan just lists env var name | Specify: integer, default 600 (10 minutes), min 60, max 3600 |
| **L-3** | **LOW** | Plan doesn't mention `email_verified` event write to `user_security_log` on OAuth first login | `security_event_type` enum includes `email_verified` | Add: write `email_verified` event when OAuth provider confirms email |
| **L-4** | **LOW** | `handle_new_user()` uses `ON CONFLICT DO NOTHING` — if Supabase creates duplicate auth user with same email, silent skip may hide data inconsistency | `03_users_auth.sql`: `ON CONFLICT (id) DO NOTHING` | Acceptable for idempotency; document as intentional behavior |

---

## 4. Security Analysis

### 4.1 State/PKCE Implementation

**Plan says:** "generate one-time state + PKCE verifier; store encrypted HttpOnly short-lived state cookie"

**Problems:**

1. **Encryption undefined** — "encrypted" implies AES/GCM but no cipher, key derivation, or IV mechanism is specified. For a state parameter, **plaintext signed cookie** (HMAC-SHA256 with `OAUTH_STATE_SECRET`) is simpler and sufficient — the state is not a secret, it's a CSRF token that must be unforgeable.

2. **PKCE verifier storage** — The plan says "PKCE verifier is never placed in URL, response body, logs or database" but doesn't say WHERE it's stored. It must be in the same state cookie or a separate cookie. If in a separate cookie, it needs its own HttpOnly/Secure/SameSite flags.

3. **Single-use enforcement** — "one-time expiry" mentioned but mechanism unclear. After successful validation, the cookie must be cleared. On replay, the missing cookie causes rejection. This is correct but should be explicit.

**Recommendation:**
```
State cookie: binay_oauth_state
  Value: HMAC-SHA256(random_state, OAUTH_STATE_SECRET) || "." || random_state
  HttpOnly: true
  Secure: true (outside dev)
  SameSite: Lax
  Path: /api/v1/auth/oauth
  Max-Age: OAUTH_STATE_TTL_SECONDS (default 600)

PKCE verifier: stored in separate cookie or same cookie payload
  binay_oauth_pkce: base64url(PKCEVerifier)
  Same flags as state cookie
```

### 4.2 Multi-Instance Safety

**Plan says:** "multi-instance state behavior test"

**Analysis:** State stored in HttpOnly cookie means:
- Instance A generates state → cookie set in browser
- Browser redirects to provider → provider redirects back to Instance B
- Instance B reads state from cookie → validates against `OAUTH_STATE_SECRET`

This is **safe IF** all instances share the same `OAUTH_STATE_SECRET`. The plan correctly identifies this as a test requirement but doesn't explicitly state the shared-secret requirement.

**Recommendation:** Add explicit note: "`OAUTH_STATE_SECRET` must be identical across all API instances; rotate via Secret Manager with overlap period."

### 4.3 Cookie/CORS Conflicts

**Analysis:**
- `binay_access_token`: `SameSite=Lax`, `Path=/` — works for same-origin OAuth callback
- `binay_refresh_token`: `SameSite=Lax`, `Path=/api/v1/auth/refresh` — only sent to refresh endpoint
- OAuth callback is same-origin (NestJS endpoint), so `SameSite=Lax` does NOT strip cookies
- If Supabase Auth callback goes through `xxx.supabase.co` first, that's a redirect (not a cross-origin POST), so cookies are still set by NestJS response

**No conflict found.** ✅

### 4.4 CORS Configuration

**Current:** `main.ts` enables CORS with `credentials: true` for configured origins.

**OAuth impact:** OAuth callback is same-origin (browser → NestJS), so CORS doesn't apply. However, if the frontend makes AJAX calls to `/api/v1/auth/oauth/authorize` from a different origin, CORS must allow it.

**Recommendation:** Verify that `OAUTH_FRONTEND_SUCCESS_URL` is included in `CORS_ORIGINS`.

---

## 5. SQL Constraint Analysis

### 5.1 `login_history_provider_consistency`

```sql
CONSTRAINT login_history_provider_consistency CHECK (
    (login_type IN ('oauth', 'sso') AND auth_provider IS NOT NULL AND btrim(auth_provider) <> '')
    OR (login_type NOT IN ('oauth', 'sso') AND auth_provider IS NULL)
)
```

**Impact:** If `auth-audit.ts` passes `login_type='oauth'` with `auth_provider=NULL`, the INSERT will **fail** with a CHECK constraint violation. This is a **BLOCKER**.

**Current code:** `auth-audit.ts` L15 hardcodes `'email_password'::public.auth_login_type` and `NULL` for auth_provider.

**Required fix:** `loginAttempt()` must accept `loginType` and `authProvider` parameters:
```typescript
async loginAttempt(input: {
    userId?: string | null;
    email: string;
    success: boolean;
    failureReason?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    loginType?: string;        // NEW: 'email_password' | 'oauth' | 'sso'
    authProvider?: string | null;  // NEW: 'google' | 'apple' | etc.
}): Promise<void>
```

### 5.2 `login_history_result_consistency`

```sql
CONSTRAINT login_history_result_consistency CHECK (
    (success = TRUE AND failure_reason IS NULL)
    OR (success = FALSE AND failure_reason IS NOT NULL)
)
```

**Impact:** Successful OAuth login must have `failure_reason=NULL`. Failed OAuth must have non-NULL `failure_reason`. This is already handled by current code logic. ✅

### 5.3 `handle_new_user()` Trigger

```sql
INSERT INTO public.users (...) VALUES (...) ON CONFLICT (id) DO NOTHING;
```

**OAuth behavior:**
- New OAuth user → Supabase creates `auth.users` row → trigger creates `public.users` ✅
- Existing password user tries OAuth → Supabase may create SECOND `auth.users` row (different ID) → trigger creates SECOND `public.users` row → **email UNIQUE constraint fails** → trigger `DO NOTHING` → silent skip

**Problem:** If Supabase Auth allows "sign in with Google" for an existing email account, the second `auth.users` row will have a different UUID. The trigger will try to INSERT into `public.users` with a new UUID but same email → **UNIQUE constraint violation** → `ON CONFLICT (id) DO NOTHING` does NOT catch email conflicts (it only catches ID conflicts).

**Wait** — re-reading the trigger: `ON CONFLICT (id) DO NOTHING` only catches conflicts on the `id` column. If the email is the same but ID is different, it will be a **different conflict** (unique email constraint) that `ON CONFLICT (id)` does NOT handle. The INSERT will raise an **unhandled exception**.

**Impact:** This is actually a **data integrity issue** if Supabase Auth is configured to allow sign-in with existing email. However, if Supabase Auth dashboard has "Allow sign-ins with email already registered" = OFF (which is the default), this scenario cannot occur.

**Recommendation:** The plan must explicitly state: "Supabase Auth dashboard setting 'Allow sign-ins with email already registered' must be OFF. This prevents duplicate `auth.users` rows for the same email."

---

## 6. Missing Implementation Details

### 6.1 AuthProvider Interface Gap

The current `AuthProvider` interface:
```typescript
interface AuthProvider {
    signup(input: { email: string; password: string }): Promise<AuthSession>;
    login(input: { email: string; password: string }): Promise<AuthSession>;
    refresh(refreshToken: string): Promise<AuthSession>;
}
```

**Missing for OAuth:**
```typescript
interface AuthProvider {
    // ... existing methods ...
    getOAuthRedirectUrl(provider: string, redirectTo: string): Promise<string>;
    exchangeOAuthCode(code: string, codeVerifier?: string): Promise<AuthSession>;
}
```

The plan doesn't mention this interface change. Without it, the OAuth controller has no way to call Supabase Auth.

### 6.2 Supabase Auth OAuth Endpoint

The plan says "exchange code outside DB transaction" but doesn't specify the Supabase Auth endpoint. Supabase Auth PKCE flow uses:
```
POST /auth/v1/token?grant_type=authorization_code
Body: { code, code_verifier, redirect_uri }
```

This is the same `call()` method pattern as `login()` and `refresh()`, but with different grant_type and parameters. The `SupabaseAuthProvider` needs a new method or the `call()` method needs to support this.

### 6.3 Provider Metadata Extraction

After successful OAuth exchange, the provider name must be extracted for:
- `login_history.auth_provider` (required by CHECK constraint)
- `user_security_log` metadata

Supabase Auth returns user metadata in the token exchange response:
```json
{
  "user": {
    "app_metadata": {
      "provider": "google"
    }
  }
}
```

The current `AuthSession` interface only extracts `userId`, `accessToken`, `refreshToken`, and `requiresVerification`. It needs to also extract `provider` from `user.app_metadata.provider`.

---

## 7. Plan Accuracy Assessment

| Plan Statement | Accurate? | Evidence |
|----------------|-----------|----------|
| "NestJS OAuth boundary own karega" | ✅ YES | Matches D1 frozen decision |
| "Supabase Auth intermediary/provider exchange handle karega" | ✅ YES | Matches architecture |
| "Browser direct provider token ya Supabase credential nahi dekhega" | ✅ YES | Matches non-negotiable rules |
| "generate one-time state + PKCE verifier" | ✅ YES | Correct security approach |
| "store encrypted HttpOnly short-lived state cookie" | ⚠️ PARTIAL | Encryption mechanism undefined |
| "redirect to Supabase Auth authorize URL" | ✅ YES | Correct Supabase OAuth flow |
| "validate state + one-time expiry" | ✅ YES | Correct |
| "exchange code outside DB transaction" | ✅ YES | Matches NESTJS-IMPLEMENTATION-GUIDE §5 |
| "verify public.users status (trigger remains owner)" | ✅ YES | Matches D1 |
| "write provider-aware login_history audit" | ⚠️ PARTIAL | Code doesn't support this yet (BLOCKER) |
| "set auth cookies + presence-session cookie" | ✅ YES | Matches existing login flow |
| "clean 302 redirect to approved frontend URL" | ✅ YES | Correct |
| "Provider and redirect are checked against server allowlists" | ✅ YES | Correct |
| "State cookie is HttpOnly, Secure outside local development" | ✅ YES | Correct |
| "PKCE verifier is never placed in URL, response body, logs or database" | ✅ YES | Correct principle |
| "Callback rejects missing, expired or replayed state/code" | ✅ YES | Correct |
| "Raw provider/access/refresh tokens never enter logs, URLs, database or JSON responses" | ✅ YES | Correct |
| "OAuth callback database writes happen only after external exchange" | ✅ YES | Correct |
| "Existing handle_new_user() trigger creates public.users" | ✅ YES | Correct |
| "Callback only reads/validates account state" | ✅ YES | Correct |
| "Explicit-link/no-link behavior must be implemented according to the approved account-linking decision" | ❌ NO | No such decision exists |

---

## 8. Configuration Gap Analysis

| Required Env Var | In `config.ts`? | Type | Default | Notes |
|------------------|-----------------|------|---------|-------|
| `ALLOWED_OAUTH_PROVIDERS` | ❌ NO | string (comma-separated) | — | Must be non-empty for OAuth to work |
| `OAUTH_CALLBACK_URL` | ❌ NO | string (URL) | — | Exact callback URL per environment |
| `OAUTH_FRONTEND_SUCCESS_URL` | ❌ NO | string (URL) | — | Post-login redirect target |
| `OAUTH_FRONTEND_ERROR_URL` | ❌ NO | string (URL) | — | Post-failure redirect target |
| `OAUTH_STATE_SECRET` | ❌ NO | string (min 32 chars) | — | HMAC key for state signing; must be same across instances |
| `OAUTH_STATE_TTL_SECONDS` | ❌ NO | number (60-3600) | 600 | State cookie lifetime |

All 6 env vars are **required** before OAuth implementation can start.

---

## 9. Test Coverage Assessment

| Planned Test | Adequate? | Missing Detail |
|--------------|-----------|----------------|
| allowlist and redirect rejection | ✅ | — |
| state mismatch, expiry and replay rejection | ✅ | — |
| PKCE exchange success/failure without token leakage | ✅ | — |
| inactive/deleted account rejection | ✅ | — |
| provider-aware audit constraint test | ⚠️ | Must test CHECK constraint with `login_type='oauth'` + `auth_provider='google'` |
| cookie flags and clean redirect test | ✅ | — |
| multi-instance state behavior test | ⚠️ | Must verify same `OAUTH_STATE_SECRET` on both instances |
| OAuth callback rate-limit test | ⚠️ | No rate-limit mechanism exists yet |

**Missing tests:**
- `handle_new_user()` idempotency with OAuth (second call with same auth user ID)
- Email collision when Supabase creates duplicate auth user
- State cookie cleared after successful callback
- PKCE verifier cleared after successful exchange
- `email_verified` security event written on first OAuth login
- CSRF protection: callback without valid state cookie is rejected

---

## 10. Recommended Corrections

| # | Correction | Priority | Blocks Implementation? |
|---|------------|----------|----------------------|
| **C-1** | Refactor `auth-audit.ts` `loginAttempt()` to accept `loginType` and `authProvider` params | BLOCKER | Yes |
| **C-2** | Add all 6 OAuth env vars to `config.ts` `envSchema` | BLOCKER | Yes |
| **C-3** | Add `getOAuthRedirectUrl()` and `exchangeOAuthCode()` to `AuthProvider` interface | HIGH | Yes |
| **C-4** | Add `provider` field to `AuthSession` interface (extract from `user.app_metadata.provider`) | HIGH | Yes |
| **C-5** | Define state cookie in `AUTH-COOKIE-CONTRACT-TEMPORARY.md` | HIGH | No (can defer) |
| **C-6** | Replace "encrypted" with "HMAC-signed" for state cookie | HIGH | No (design clarity) |
| **C-7** | Explicitly state: no cross-provider account linking; Supabase dashboard "Allow sign-ins with email already registered" = OFF | HIGH | No (design clarity) |
| **C-8** | Specify `OAUTH_STATE_TTL_SECONDS` type and defaults in plan | MEDIUM | No |
| **C-9** | Add `email_verified` security event write on first OAuth login | MEDIUM | No |
| **C-10** | Clarify multi-instance shared-secret requirement | MEDIUM | No |

---

## 11. Final Verdict

| Category | Status |
|----------|--------|
| **Architecture** | ✅ Sound — zero defects |
| **Flow correctness** | ✅ Correct — matches Supabase Auth PKCE pattern |
| **Trigger ownership** | ✅ Preserved — `handle_new_user()` not bypassed |
| **Security rules** | ✅ Comprehensive — state, PKCE, no-leak, no-TX |
| **SQL compatibility** | ❌ BLOCKED — `login_history` CHECK constraint violation |
| **Config readiness** | ❌ BLOCKED — 6 env vars missing from schema |
| **Interface readiness** | ❌ BLOCKED — `AuthProvider` missing OAuth methods |
| **Account linking** | ⚠️ INCOMPLETE — no decision exists |
| **Invented objects** | ✅ Zero |
| **BLOCKERs** | 3 (C-1, C-2, C-3) |
| **Implementation readiness** | NOT READY — 3 BLOCKERs + 4 HIGH fixes |

**3 BLOCKERs (auth-audit refactor + config vars + AuthProvider interface) resolve karne ke baad OAuth implementation authorized hai.** 🚀

---

*Report generated by Freebuf — independent auth/security review. No code or SQL modified.*
