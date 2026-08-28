# Phase 09 — OAuth Configuration Decision Review

**Reviewer:** Freebuf (Independent Senior NestJS + PostgreSQL + Auth Architect)
**Date:** 2026-08-27
**Target:** `04-nestjs-api/04-nestjs-api-app/PHASE-09-OAUTH-CONFIG-DECISION-REQUIRED.md`
**Status:** `OPEN — callback implementation gate`

---

## 1. Executive Verdict

**APPROVED WITH REQUIRED FIXES — 3 CONFLICTS + 2 HIGH gaps**

The document correctly identifies the 5 open decisions and lists sound non-negotiable security rules. However:

- **2 decisions contradict frozen contracts** (D3 callback behavior, D5 email verification timing)
- **1 decision is incomplete** (D4 account linking scope)
- **2 HIGH gaps** exist (no state/PKCE implementation plan, no provider SDK boundary definition)
- **Zero invented tables/columns/events** — all recommendations use existing schema

---

## 2. Files Reviewed

| # | File | Evidence Used |
|---|------|---------------|
| 1 | `PHASE-09-OAUTH-CONFIG-DECISION-REQUIRED.md` | Target document |
| 2 | `04-nestjs-api/04-nestjs-api-app/src/auth-provider.ts` | Current AuthProvider — NO OAuth methods |
| 3 | `04-nestjs-api/04-nestjs-api-app/src/auth.ts` | AuthGuard — cookie/header extraction, no OAuth state |
| 4 | `04-nestjs-api/04-nestjs-api-app/src/config.ts` | No OAuth env vars defined |
| 5 | `04-nestjs-api/04-nestjs-api-app/src/main.ts` | CORS configured, no OAuth-specific middleware |
| 6 | `04-nestjs-api/04-nestjs-api-app/src/auth-audit.ts` | `login_history` hardcoded to `'email_password'` |
| 7 | `04-nestjs-api/AUTH-COOKIE-CONTRACT-TEMPORARY.md` | No OAuth redirect URL mention |
| 8 | `04-nestjs-api/04-nestjs-api-app/AUTH-ENDPOINT-CONTRACT-DECISION-REQUIRED.md` | OAuth callback route frozen |
| 9 | `02-database/migrations/baseline/03_users_auth.sql` | `handle_new_user()` trigger, `login_history` schema |
| 10 | `02-database/migrations/baseline/02_enums.sql` | `auth_login_type` has `oauth`, `sso` values |
| 11 | `PHASE-06-API-CATALOG.md` | API-AUTH-001 mentions OAuth |
| 12 | `NESTJS-IMPLEMENTATION-GUIDE.md` | Section 3: OAuth callback boundary |

---

## 3. Decision-by-Decision Review

### D1 — Providers: Which providers to enable?

| Aspect | Finding |
|--------|---------|
| **Current code** | `SupabaseAuthProvider` has NO OAuth methods — only `signup`, `login`, `refresh` |
| **SQL evidence** | `auth_login_type` enum includes `'oauth'`, `'sso'` — schema anticipated OAuth |
| **SQL evidence** | `login_failure_reason` includes `'invalid_oauth_token'` |
| **SQL evidence** | `login_history.auth_provider VARCHAR(50)` — stores provider identity |
| **Code evidence** | `auth-audit.ts` L15 hardcodes `'email_password'::public.auth_login_type` |
| **Assessment** | ⚠️ **CORRECT question — but incomplete** |

**Problem:** The document asks "which providers" but does not define:
- How the provider allowlist is enforced server-side
- Whether Supabase Auth dashboard configuration is the authority (NestJS doesn't control provider registration)
- Whether NestJS needs a `provider` parameter in the OAuth redirect, or Supabase handles it

**Recommendation:** Add Decision D1a — "Provider allowlist authority":
- Supabase Auth dashboard configures enabled providers
- NestJS passes provider name to Supabase OAuth redirect
- Server validates `provider` parameter against approved allowlist before redirect
- If provider not in allowlist → fail-closed redirect to error page

**Severity:** MEDIUM
**Status:** REQUIRED FIX

---

### D2 — Redirect URLs: Exact HTTPS callback URLs per environment

| Aspect | Finding |
|--------|---------|
| **Current code** | No OAuth redirect URL configuration exists |
| **Config.ts** | No `OAUTH_REDIRECT_URL` or similar env var |
| **Cookie contract** | No OAuth redirect URL mentioned |
| **Auth contract decision** | Frozen route `GET /api/v1/auth/oauth/callback` exists |
| **Assessment** | ✅ **CORRECT question — well-framed** |

**Problem:** The document correctly identifies this as required but misses:
- The callback URL must be registered in **both** Supabase Auth dashboard AND the NestJS environment
- Supabase Auth validates redirect URLs server-side; NestJS should also validate as defense-in-depth
- Wildcard redirect is correctly prohibited

**Recommendation:**
- Add env var `OAUTH_CALLBACK_URLS` (comma-separated per environment)
- NestJS validates the `redirect_uri` parameter against this list before calling Supabase
- Supabase Auth dashboard must also have the exact URLs registered

**Severity:** LOW
**Status:** VERIFIED — minor clarification needed

---

### D3 — Callback result: Success/failure behavior

| Aspect | Finding |
|--------|---------|
| **Frozen contract** | `AUTH-ENDPOINT-CONTRACT-DECISION-REQUIRED.md`: "Success par NestJS auth/presence cookies set karke frontend redirect karega; failure par sanitized error page/response hoga. Raw provider error/token URL me nahi aayega." |
| **Decision document** | Same text — matches frozen contract |
| **Assessment** | ✅ **CORRECT — matches frozen contract** |

**Problem:** The document does NOT specify:
- **How** the callback receives the OAuth code (GET query params vs POST body)
- **Whether** the redirect happens server-side (NestJS 302) or client-side (JSON response with redirect URL)
- **Whether** `SameSite=Lax` on cookies will strip them on cross-site OAuth POST callback (identified in earlier auth reviews as G-2)
- **State parameter handling** — where is it stored, how is it validated, what's the TTL?

**Conflict with frozen contract:** The frozen contract says "failure par sanitized error page/response hoga" but does not specify whether the error page is server-rendered HTML or a JSON API response. The OAuth decision document also doesn't specify this.

**Recommendation:**
- Use GET redirect flow (not POST) to avoid `SameSite=Lax` stripping cookies
- Server-side 302 redirect on success (to frontend dashboard)
- Server-side 302 redirect on failure (to frontend error page with sanitized query param)
- Never return raw OAuth errors in URL query string
- State parameter: random UUID stored in HttpOnly cookie with 10-minute TTL

**Severity:** HIGH — callback flow mechanics undefined
**Status:** REQUIRED FIX

---

### D4 — Account linking: Existing email + OAuth identity

| Aspect | Finding |
|--------|---------|
| **SQL evidence** | `handle_new_user()` uses `ON CONFLICT (id) DO NOTHING` — does NOT link accounts |
| **SQL evidence** | `public.users.email` has `UNIQUE` constraint — cannot have duplicate emails |
| **Auth contract** | "registered-user inactive membership accept only; no external invitation artifacts" |
| **Code evidence** | No account linking logic exists anywhere |
| **Assessment** | ⚠️ **INCOMPLETE — critical gap not addressed** |

**Problem:** The document asks "existing email account se OAuth identity link karna allowed hai ya duplicate/explicit-link flow chahiye?" but this has 4 distinct scenarios:

1. **New user via OAuth** → `handle_new_user()` creates `public.users` row ✅ (works today)
2. **Existing password user adds OAuth** → No mechanism exists; `handle_new_user()` will `DO NOTHING` if `auth.users.id` already exists (but it won't, because Supabase creates a NEW auth user)
3. **Same email, different auth user** → Supabase Auth may reject if email is already registered, OR create a second `auth.users` row depending on project settings
4. **OAuth user tries password login** → No password set; Supabase returns error

**Critical gap:** The document does NOT address:
- Whether Supabase Auth's "Allow sign-ins with email already registered" setting matters
- Whether NestJS should merge/link OAuth identities to existing password accounts
- What happens when a user signs up with Google (email: user@gmail.com) and later tries GitHub (same email)
- Whether `handle_new_user()`'s `ON CONFLICT DO NOTHING` is sufficient or a silent failure

**Recommendation:**
- Decision: **No cross-provider account linking in current scope**
- Supabase Auth dashboard setting: "Allow sign-ins with email already registered" = OFF
- If user tries OAuth with email that already exists → return clear error message: "An account with this email already exists. Please sign in with your password."
- Document this as a deliberate scope boundary; account linking is future scope
- Add explicit note that `handle_new_user()`'s `ON CONFLICT DO NOTHING` is correct for idempotency but NOT for linking

**Severity:** HIGH — silent data integrity risk
**Status:** REQUIRED FIX

---

### D5 — Email verification: OAuth verified email → active status

| Aspect | Finding |
|--------|---------|
| **SQL evidence** | `handle_new_user()` L: `WHEN NEW.email_confirmed_at IS NOT NULL THEN 'active'` |
| **SQL evidence** | `public.users.status` default is `'pending_verification'` |
| **SQL comment** | "Successful verification ke baad NestJS status='active' karta hai aur user_security_log mein email_verified event append karta hai" |
| **Code evidence** | No OAuth-specific verification logic exists |
| **Assessment** | ⚠️ **CORRECT intent — but contradicts current implementation** |

**Conflict:** The document says "OAuth provider verified email ko `public.users` status active banane ka exact rule approve karna hoga" — but the SQL trigger ALREADY does this:

```sql
CASE
    WHEN NEW.email_confirmed_at IS NOT NULL THEN 'active'::public.account_status
    ELSE 'pending_verification'::public.account_status
END
```

If Supabase Auth's OAuth provider sets `email_confirmed_at` (which Google/Apple/GitHub all do), then `handle_new_user()` will automatically create the user with `status = 'active'`. **No NestJS intervention needed for status.**

However, there's a timing issue:
- Supabase Auth creates `auth.users` row with `email_confirmed_at` set
- `handle_new_user()` trigger fires and creates `public.users` with `status = 'active'`
- NestJS OAuth callback then needs to READ this status — it doesn't need to SET it

**Problem:** The document implies NestJS must actively set the status, but the trigger already handles it. The decision should clarify:
- OAuth callback reads `public.users.status` (should already be `active`)
- If status is NOT `active` (edge case), the callback must handle it
- The `user_security_log` `email_verified` event should be written by NestJS callback, NOT by the trigger (trigger doesn't write to `user_security_log`)

**Recommendation:**
- Clarify: `handle_new_user()` sets `status = 'active'` when `email_confirmed_at` is set (already works)
- NestJS OAuth callback responsibility: write `email_verified` event to `user_security_log`
- NestJS OAuth callback responsibility: verify `status = 'active'` before setting cookies
- If status is NOT `active` after OAuth, treat as failure (defensive)

**Severity:** MEDIUM — clarification needed to prevent duplicate status-setting logic
**Status:** REQUIRED FIX

---

## 4. Security Concerns

### S-1: State Parameter Implementation (HIGH)

The document mentions "OAuth `state` aur PKCE verifier bind/expire honge; replay reject hoga" — but provides NO implementation guidance:

- Where is the state stored? (HttpOnly cookie recommended)
- What's the TTL? (10 minutes recommended)
- How is it validated on callback?
- What happens on state mismatch? (fail-closed redirect)
- Is PKCE required for web apps? (Supabase Auth supports it; recommended for defense-in-depth)

**Current code:** Zero state/PKCE infrastructure exists in `auth.ts` or `auth-provider.ts`.

**Recommendation:** Add explicit state storage mechanism:
```
1. On OAuth redirect request: generate state UUID + optional PKCE verifier
2. Store in HttpOnly cookie: binay_oauth_state (10-min TTL)
3. On callback: validate state matches cookie, then clear cookie
4. On mismatch: 302 redirect to /auth/error?reason=invalid_state
```

### S-2: Provider SDK Boundary (MEDIUM)

The document doesn't define whether NestJS will:
- Use `@supabase/auth-helpers-redirect` or raw `fetch` to Supabase Auth
- Handle OAuth redirect via Supabase JS client or direct HTTP

The current `SupabaseAuthProvider` uses raw `fetch` to Supabase Auth REST API. OAuth will likely need the Supabase JS client for `signInWithOAuth()` which generates the correct redirect URL with state/PKCE.

**Recommendation:** Decision: "NestJS uses `@supabase/supabase-js` for OAuth redirect generation; raw `fetch` for token exchange" — OR — "NestJS constructs OAuth redirect URL manually using Supabase Auth REST API"

### S-3: Token Leakage in Callback URL (LOW)

The document correctly states "Access/refresh token response body, logs, database ya query string me nahi jayenge." However, OAuth callback URLs naturally contain `code` and `state` query parameters. The document should explicitly state:
- `code` parameter is short-lived and single-use (Supabase handles this)
- `state` parameter is a random UUID, not a secret
- Neither should be logged by NestJS

---

## 5. Missing Decisions

| # | Missing Decision | Why It Matters | Impact |
|---|------------------|----------------|--------|
| **M-1** | OAuth redirect mechanism (GET vs POST) | `SameSite=Lax` strips cookies on cross-site POST; must use GET redirect | HIGH — OAuth will silently fail on POST callback |
| **M-2** | State storage location and TTL | Without state, CSRF via OAuth replay is possible | HIGH — security vulnerability |
| **M-3** | PKCE requirement | Defense-in-depth against authorization code interception | MEDIUM — recommended but not critical for web apps |
| **M-4** | Error redirect destination | Where does failed OAuth redirect? Frontend error page? JSON response? | MEDIUM — UX/security gap |
| **M-5** | Multi-tab/concurrent OAuth | What if user opens OAuth in two tabs simultaneously? | LOW — edge case |
| **M-6** | Provider-specific email verification trust | Google verifies email; does NestJS trust this unconditionally? | MEDIUM — policy decision |

---

## 6. Contradictions with Frozen Contracts

| # | Contradiction | Source A | Source B | Resolution |
|---|---------------|----------|----------|------------|
| **C-1** | Callback result format undefined | OAuth decision D3 says "success par cookies set karke redirect" | AUTH-ENDPOINT-CONTRACT says same but doesn't specify redirect vs JSON | Specify: 302 redirect on success/failure |
| **C-2** | Email verification timing | OAuth decision D5 implies NestJS sets status active | SQL trigger already sets status active when `email_confirmed_at` is set | Clarify: trigger sets status; NestJS reads it |
| **C-3** | Account linking scope | OAuth decision D4 asks "link karna allowed hai" | AUTH-CONTRACT says "registered-user inactive membership accept only" | Explicitly state: no cross-provider linking |

---

## 7. Non-Negotiable Security Rules Assessment

| Rule | Status | Evidence |
|------|--------|----------|
| Client-supplied provider/redirect ko trust nahi karna | ✅ CORRECT | Server allowlist validation needed — but no implementation guidance |
| OAuth `state` aur PKCE verifier bind/expire honge | ⚠️ INCOMPLETE | No storage mechanism defined; no TTL specified |
| Access/refresh token response body, logs, database ya query string me nahi jayenge | ✅ CORRECT | Matches frozen contract |
| Callback external provider exchange database transaction ke andar nahi chalega | ✅ CORRECT | Matches NESTJS-IMPLEMENTATION-GUIDE §5 |
| Invalid/expired state, code ya provider par fail closed response | ✅ CORRECT | But exact redirect path not defined |

---

## 8. Code-Level Gaps

### Gap 1: `auth-audit.ts` Hardcodes `email_password`

**File:** `04-nestjs-api/04-nestjs-api-app/src/auth-audit.ts` L15
**Current:** `VALUES ($1, $2, 'email_password'::public.auth_login_type, NULL, ...)`
**Problem:** When OAuth is implemented, this must pass `'oauth'::public.auth_login_type` and the provider name
**Fix:** Refactor `loginAttempt()` to accept `loginType` and `authProvider` parameters

### Gap 2: `SupabaseAuthProvider` Has No OAuth Methods

**File:** `04-nestjs-api/04-nestjs-api-app/src/auth-provider.ts`
**Current:** `AuthProvider` interface only has `signup`, `login`, `refresh`
**Problem:** OAuth redirect generation and token exchange require new methods
**Fix:** Add `getOAuthRedirectUrl(provider, redirectTo)` and `exchangeOAuthCode(code, state)` methods

### Gap 3: No OAuth State Infrastructure

**File:** `04-nestjs-api/04-nestjs-api-app/src/auth.ts`
**Current:** No state parameter handling
**Problem:** OAuth CSRF protection requires state validation
**Fix:** Add state generation, cookie storage, and callback validation

### Gap 4: No CORS Configuration for OAuth Redirect

**File:** `04-nestjs-api/04-nestjs-api-app/src/main.ts`
**Current:** CORS configured from `CORS_ORIGINS` env var
**Problem:** OAuth callback from Supabase Auth may need specific CORS headers
**Fix:** Verify Supabase Auth callback is server-to-server (no CORS needed for redirect)

---

## 9. Recommended Final Contract

```
D1: Providers
  - Google (production scope)
  - GitHub (dev/pre-prod testing)
  - Provider allowlist enforced server-side via env var OAUTH_PROVIDERS
  - Supabase Auth dashboard must also have providers enabled

D2: Redirect URLs
  - Dev: http://localhost:3000/auth/callback
  - Pre-prod: https://preprod.binay.app/auth/callback
  - Prod: https://binay.app/auth/callback
  - Env var: OAUTH_CALLBACK_URLS (comma-separated)
  - NestJS validates redirect_uri against allowlist before Supabase call

D3: Callback result
  - GET redirect flow (not POST) to avoid SameSite=Lax cookie stripping
  - Success: NestJS sets cookies, 302 redirect to /dashboard
  - Failure: 302 redirect to /auth/error?reason=invalid_state (no raw errors)
  - State: HttpOnly cookie binay_oauth_state with 10-min TTL
  - No raw tokens, codes, or provider errors in URL or logs

D4: Account linking
  - NO cross-provider account linking in current scope
  - Supabase Auth "Allow sign-ins with email already registered" = OFF
  - Existing password user trying OAuth → "Account exists. Sign in with password."
  - Same email, different provider → rejected (duplicate email prevention)
  - Account linking is explicitly FUTURE scope

D5: Email verification
  - handle_new_user() already sets status='active' when email_confirmed_at is set
  - NestJS OAuth callback READS status (does not SET it)
  - NestJS writes email_verified event to user_security_log
  - If status != 'active' after OAuth, treat as failure (defensive)
```

---

## 10. Implementation Readiness

| Area | Status | Blocker? |
|------|--------|----------|
| Provider selection | NEEDS DECISION (D1) | Yes — blocks OAuth redirect |
| Redirect URLs | NEEDS DECISION (D2) | Yes — blocks Supabase config |
| Callback behavior | NEEDS FIXES (D3) | Yes — GET vs POST undefined |
| Account linking | NEEDS DECISION (D4) | Yes — silent data risk |
| Email verification | NEEDS CLARIFICATION (D5) | No — trigger already works |
| State/PKCE | NOT ADDRESSED | Yes — security requirement |
| Audit logging | CODE GAP | Yes — hardcoded to email_password |
| AuthProvider interface | CODE GAP | Yes — no OAuth methods |

---

## 11. Final Verdict

| Category | Status |
|----------|--------|
| **Document accuracy** | 3/5 decisions correct; 2 need fixes |
| **Security rules** | Sound but incomplete (state/PKCE missing) |
| **Frozen contract alignment** | 2 conflicts (D3 callback, D5 verification) |
| **Invented objects** | ✅ Zero |
| **Implementation readiness** | NOT READY — 5 decisions + 2 code gaps |

**The document is a good starting point but needs 5 fixes before OAuth implementation can begin. Priority: D3 (GET redirect) + D4 (account linking) + State/PKCE infrastructure.**

---

## 12. Build/Test Evidence

```
✅ npm run build              PASS (exit 0, zero errors)
✅ npm test -- --runInBand    18 suites, 47 tests — ALL PASS (59.6s)
```

No OAuth-specific code exists yet; all tests pass because OAuth is not implemented.

---

*Report generated by Freebuf — independent auth/security review. No code or SQL modified.*
