# OAuth Implementation Plan — Review

**Document under review:** `04-nestjs-api/04-nestjs-api-app/PHASE-09-OAUTH-IMPLEMENTATION-PLAN.md`
**Status:** ARCHITECTURE READY; environment values pending
**Review date:** 2026-08-27

---

## Verdict

**NOT APPROVED — 3 BLOCKERS, 4 CONFLICTS, 8 MISSING REQUIREMENTS, 3 SECURITY GAPS**

---

## 1. BLOCKERS

### BLOCKER-1: No state/PKCE storage mechanism specified — architecture incomplete

The plan says (line 17): "store encrypted HttpOnly short-lived state cookie"

This stores the STATE parameter in a cookie, but **does not store the PKCE code_verifier anywhere**:

- Line 16: "generate one-time state + PKCE verifier"
- Line 34: "PKCE verifier is never placed in URL, response body, logs or database"
- Line 22: "validate state + one-time expiry" (callback)

**The plan specifies WHERE the verifier is NOT stored (URL, body, logs, database) but never specifies where it IS stored.**

Options the plan doesn't choose:
1. **Database table** — requires new migration (`oauth_sessions` or similar), which contradicts "no new tables" freeze
2. **Redis/KV** — requires new infrastructure dependency not in current stack
3. **Signed cookie** — verifier visible in transit (must be HttpOnly+Secure), but then "never placed in database" is satisfied; however, the plan says state is in a cookie, not the verifier
4. **In-memory Map** — lost on restart, multi-instance broken

**Why this is a blocker:** The plan claims "ARCHITECTURE READY" but the architecture has a critical gap — the PKCE verifier has no specified home. This is not an environment-value decision; it's a fundamental architectural choice.

---

### BLOCKER-2: No `oauth_sessions` or state table — state cannot be server-validated

The plan says (line 22): "validate state + one-time expiry" and (line 35): "Callback rejects missing, expired or replayed state/code"

But the SQL baseline has **no table for storing OAuth state**:

- `02_enums.sql` — no OAuth-related enums
- `03_users_auth.sql` — no `oauth_sessions`, `oauth_state`, or `authorization_codes` table
- No migration exists for OAuth state storage

The plan stores state in a cookie (line 17), but server-side validation of state requires **the original state value to compare against**. If state is only in a cookie:
- The callback receives `state` as a query parameter
- The server compares cookie state vs query parameter state
- This works for CSRF protection (the cookie proves the request came from the same browser)
- **But replay detection requires knowing if a state was already used** — a cookie alone cannot enforce single-use

**Why this is a blocker:** The plan says "one-time" and "replay rejection" but provides no mechanism to track whether a state has been used before. Cookie-based state is not single-use — the cookie persists until the browser deletes it.

---

### BLOCKER-3: `AuthProvider` interface does not include OAuth

The plan assumes OAuth will be implemented within the existing `AuthProvider` boundary, but the interface (`auth-provider.ts:12`) defines only:

```typescript
export interface AuthProvider {
  signup(input: { email: string; password: string }): Promise<AuthSession>;
  login(input: { email: string; password: string }): Promise<AuthSession>;
  refresh(refreshToken: string): Promise<AuthSession>;
}
```

No `oauthCallback`, `exchangeCode`, or `authorize` method exists. The plan says (line 7-8): "NestJS OAuth boundary own karega aur Supabase Auth intermediary/provider exchange handle karega" but provides no interface design for how OAuth fits into the `AuthProvider` contract.

**Why this is a blocker:** The `AuthProvider` interface is the frozen boundary between NestJS and Supabase Auth. Adding OAuth without updating the interface would either:
- Bypass the interface (violating the isolation boundary)
- Or require an interface change that hasn't been decided

---

## 2. CONFLICTS with frozen contracts

### CONFLICT-1: Callback route not in frozen endpoint catalog

**Frozen contract** (`AUTH-ENDPOINT-CONTRACT-DECISION-REQUIRED.md:16`):
```
GET | /api/v1/auth/oauth/callback | Public provider callback
```

**Frozen endpoint catalog** (`PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md:26-46`):
- Lists `auth/me`, `auth/sessions`, `auth/sessions/revoke`
- Lists `companies`, `members`, `ownership-transfer`
- **No `auth/oauth/*` routes in the frozen catalog**

The frozen contract document says (line 30): "Core controller and provider implementation may now start using the frozen route matrix above." The OAuth callback is in the frozen contract but NOT in the endpoint catalog.

**Conflict:** The endpoint catalog was independently reviewed and frozen. Adding OAuth routes after the catalog freeze requires either:
- A catalog amendment (unreviewed)
- Or the OAuth routes are considered part of the auth boundary that supersedes the catalog

The plan treats this as a non-issue, but it's a governance conflict.

---

### CONFLICT-2: `login_history` audit — `login_type` hardcoded to `email_password`

The plan says (line 25): "write provider-aware login_history audit"

But `auth-audit.ts:16` hardcodes:
```sql
INSERT INTO public.login_history
  (user_id, email, login_type, auth_provider, success, failure_reason, ip_address, user_agent)
  VALUES ($1, $2, 'email_password'::public.auth_login_type, NULL, ...)
```

`login_type` is always `'email_password'` and `auth_provider` is always `NULL`. The SQL CHECK constraint (`03_users_auth.sql:415-418`) requires:
```sql
(login_type IN ('oauth', 'sso') AND auth_provider IS NOT NULL AND btrim(auth_provider) <> '')
OR (login_type NOT IN ('oauth', 'sso') AND auth_provider IS NULL)
```

To use `login_type='oauth'`, the `AuthAuditService.loginAttempt()` method needs a new parameter for `login_type` and `auth_provider`. The plan doesn't mention modifying `AuthAuditService`.

**Conflict:** The plan assumes audit writes will work, but the current audit service will violate the CHECK constraint if called with `login_type='oauth'` and `auth_provider='google'` — it will insert `login_type='email_password'` with `auth_provider=NULL`, which is correct for password but wrong for OAuth.

---

### CONFLICT-3: CORS configuration missing for callback redirect

The plan says (line 27): "clean 302 redirect to approved frontend URL"

The callback is a `GET` request. If the API and frontend are on different origins:
- The 302 redirect from the callback goes to the frontend URL
- The frontend then makes API calls (e.g., `/auth/me`) which need CORS
- The `main.ts:11` supports CORS via `CORS_ORIGINS` env var

But the plan doesn't address:
- Does the callback response include CORS headers? (It's a redirect, so CORS doesn't apply to the redirect itself)
- Does the frontend URL need to be in `CORS_ORIGINS`? (Yes, for subsequent API calls)
- Does `OAUTH_FRONTEND_SUCCESS_URL` need to match an entry in `CORS_ORIGINS`?

**Conflict:** The plan defines `OAUTH_FRONTEND_SUCCESS_URL` and `OAUTH_FRONTEND_ERROR_URL` as separate config from `CORS_ORIGINS`, but they must be consistent. If `OAUTH_FRONTEND_SUCCESS_URL=https://app.example.com` but `CORS_ORIGINS` doesn't include `https://app.example.com`, the frontend can't make API calls after the redirect.

---

### CONFLICT-4: `SameSite=Lax` blocks OAuth callback on cross-origin redirects

The cookie contract (`AUTH-COOKIE-CONTRACT-TEMPORARY.md:12-13`) specifies `SameSite=Lax` for all auth cookies.

The OAuth flow:
1. User is on `https://app.example.com` (frontend)
2. Clicks "Login with Google"
3. Browser goes to `https://api.example.com/api/v1/auth/oauth/authorize?provider=google`
4. NestJS redirects to Google
5. Google redirects back to `https://api.example.com/api/v1/auth/oauth/callback`
6. NestJS sets cookies and redirects to `https://app.example.com`

Step 6 is a **cross-origin 302 redirect**. With `SameSite=Lax`:
- The redirect arrives at `https://app.example.com`
- The cookies set in step 6 were set by `https://api.example.com`
- **`SameSite=Lax` cookies ARE sent on top-level cross-origin GET navigations** (this is correct behavior)

But if the callback sets cookies and then redirects, the cookies are set on the API domain. The frontend on a different domain won't see them — this is correct behavior (cookies are API-domain HttpOnly).

**However:** If the frontend and API are on different domains, the `binay_access_token` cookie set by the API won't be sent to the frontend. The frontend needs to either:
- Make a separate request to `/auth/me` (which sends the cookie because it's same-site)
- Or receive the token in the response body (violates "no tokens in response body")

The plan doesn't address how the frontend gets authenticated after the redirect.

---

## 3. MISSING REQUIREMENTS

### MISSING-1: No `auth_provider` tracking on `public.users`

The plan says (line 54-55): "Existing `handle_new_user()` trigger creates `public.users` and derives initial status" and "Callback only reads/validates account state; it does not insert duplicate users or override trigger ownership."

But the `public.users` table has **no `auth_provider` column**. The trigger (`03_users_auth.sql:229-235`) reads `raw_app_meta_data ->> 'application_role'` but not provider. Questions the plan doesn't answer:

- How does the callback know which provider the user registered with?
- What if a user signed up with email/password and later connects Google OAuth? Where is that stored?
- Can a user have multiple OAuth providers linked? (Supabase Auth supports this, but the application doesn't model it)
- What prevents duplicate accounts (email/password + Google) for the same email?

---

### MISSING-2: Account linking policy not specified

The plan says (line 58): "Explicit-link/no-link behavior must be implemented according to the approved account-linking decision"

But **no account-linking decision exists**. The decision document (`PHASE-09-OAUTH-CONFIG-DECISION-REQUIRED.md:14`) asks: "Existing email account se OAuth identity link karna allowed hai ya duplicate/explicit-link flow chahiye?" — this is still OPEN.

Without this decision, the callback handler cannot be implemented because:
- **Auto-link**: callback matches email, updates `auth.providers` metadata, logs in
- **Explicit-link**: requires authenticated session, different callback flow
- **No-link**: creates separate account, potential duplicate email issue

The plan defers this to "approved account-linking decision" but this decision is not yet approved.

---

### MISSING-3: No rate limiting on authorize or callback endpoints

The plan's test list (line 69) includes "OAuth callback rate-limit test" but the plan itself doesn't specify:
- Rate limit on `GET /api/v1/auth/oauth/authorize` (prevent authorize flooding)
- Rate limit on `GET /api/v1/auth/oauth/callback` (prevent code replay/brute force)
- What rate limit values to use
- Where rate limiting is implemented (middleware? decorator? Supabase Dashboard config?)

The current codebase has no rate limiting infrastructure (`main.ts` has no rate-limit middleware).

---

### MISSING-4: No PKCE code_challenge_method specified

The plan mentions PKCE (line 16, 34) but doesn't specify:
- `code_challenge_method`: `S256` (required) or `plain` (insecure)?
- Whether Supabase Auth supports PKCE natively or if NestJS must handle it
- How the `code_verifier` is generated (crypto.randomBytes? crypto.randomUUID?)
- How the `code_challenge` is computed (SHA-256 hash → base64url)

If using Supabase Auth as intermediary, Supabase handles the PKCE exchange. But the plan says NestJS generates the PKCE verifier (line 16) — this implies NestJS manages PKCE, not Supabase.

---

### MISSING-5: No redirect URI validation specification

The plan says (line 32): "Provider and redirect are checked against server allowlists and Supabase Dashboard configuration"

But:
- How is the allowlist stored? (env var `ALLOWED_OAUTH_PROVIDERS` is a comma-separated list of provider names, not redirect URIs)
- How is the callback redirect validated? (Supabase Dashboard config is not accessible from code)
- What happens if the redirect URL in the callback doesn't match the registered URL?
- The plan says `OAUTH_CALLBACK_URL=<exact API callback URL>` — but this is the URL the provider redirects TO, not the URL the provider validates against

---

### MISSING-6: No provider token exchange mechanism specified

The plan says (line 23): "exchange code outside DB transaction"

But HOW? The plan says Supabase Auth is the intermediary (line 7-8). If Supabase Auth handles the exchange:
- Does NestJS call `POST /auth/v1/authorize` with the callback code?
- Or does Supabase Auth handle the callback directly (provider → Supabase → NestJS)?
- If Supabase handles the callback, why does the plan show NestJS as the callback handler (line 20)?

The flow diagram shows:
```
Provider/Supabase → GET /api/v1/auth/oauth/callback?code=...&state=...
```

This implies the provider redirects to NestJS, not to Supabase. But if NestJS receives the code, NestJS must exchange it with the provider — which contradicts "Supabase Auth intermediary."

---

### MISSING-7: No cleanup of state cookie after use

The plan says (line 17): "store encrypted HttpOnly short-lived state cookie" and (line 22): "validate state + one-time expiry"

But:
- After validation, is the state cookie cleared? (Should be, for single-use)
- If not cleared, what prevents the browser from reusing it?
- The plan says "single-use" but doesn't specify the clear mechanism

---

### MISSING-8: No error redirect specification

The plan says (line 27): "clean 302 redirect to approved frontend URL" for success.

For failure, the plan says (line 35): "Callback rejects missing, expired or replayed state/code" but doesn't specify:
- Does the callback return an HTML error page?
- Does it redirect to `OAUTH_FRONTEND_ERROR_URL` with error query params?
- What error codes are communicated to the frontend?
- Does the error URL receive sensitive error details? (Should not, per line 36)

---

## 4. SECURITY GAPS

### SECURITY-1: State cookie not bound to session

The plan stores state in a cookie (line 17) but doesn't specify:
- Is the state cookie scoped to the browser session? (Should be, to prevent cross-session replay)
- Is the state cookie bound to a specific user? (Not applicable — user isn't authenticated yet during authorize)
- What prevents a different browser from replaying the state? (The cookie is HttpOnly, so only the same browser can send it — this is correct)

But the plan doesn't address: what if an attacker sets a state cookie in the victim's browser (XSS on the API domain)? The state cookie is HttpOnly (no XSS read), but an attacker could trigger a navigate to the authorize endpoint with a known state.

---

### SECURITY-2: No CSRF protection beyond state parameter

The OAuth state parameter protects against CSRF in the OAuth flow. But the plan doesn't address:
- CSRF on the authorize endpoint itself (an attacker could initiate an OAuth flow with the victim's browser, but the state would be set by NestJS, so this is safe)
- CSRF on the callback endpoint (the state parameter validates this — correct)
- Whether the authorize endpoint needs additional CSRF protection (e.g., `SameSite=Strict` on the state cookie)

---

### SECURITY-3: No token validation after exchange

The plan says (line 23): "exchange code outside DB transaction" and (line 24): "verify public.users status"

But after the exchange, NestJS receives access and refresh tokens from Supabase Auth. The plan doesn't specify:
- Does NestJS validate the access token immediately? (Should, per frozen contract — `AuthGuard` verifies JWT)
- Does NestJS store the refresh token? (Cookie contract says no — correct)
- What if the access token from Supabase Auth is malformed or expired? (Should reject)

---

## 5. NO-ISSUE ITEMS

These items are correctly specified:

- **Security rules** (lines 31-37) — Correctly prohibits provider/redirect trust, requires state/PKCE, prohibits token logging, requires fail-closed behavior, requires external exchange outside DB transaction
- **Non-negotiable boundaries** — Correctly states NestJS owns OAuth boundary, Supabase Auth is intermediary, browser never sees tokens
- **Configuration values** (lines 41-48) — Appropriately lists required env vars without inventing values
- **Implementation gate** (line 71) — Appropriately gates implementation on environment + account-linking decisions
- **Trigger ownership** (line 54-55) — Correctly states `handle_new_user()` remains owner of `public.users` row creation
- **Audit approach** (line 56-57) — Correctly states OAuth login uses `login_type='oauth'` and trimmed provider name

---

## 6. RECOMMENDATIONS

1. **Specify PKCE verifier storage** — choose between signed cookie (simplest, no new infra) or database table (most secure, requires migration). In-memory is not viable for multi-instance.
2. **Add state single-use enforcement** — either database lookup (query `oauth_state` table, delete after use) or signed cookie with timestamp + HMAC (verify timestamp is recent and HMAC is valid, then reject if seen before via short-TTL cache).
3. **Update `AuthProvider` interface** — add `authorize(provider, redirectUri)` and `callback(code, state, codeVerifier)` methods, or create a separate `OAuthProvider` interface.
4. **Update `AuthAuditService`** — add `loginType` and `authProvider` parameters to `loginAttempt()` to support `login_type='oauth'` with non-null `auth_provider`.
5. **Resolve account linking before implementation** — this is not an environment-value decision; it changes the callback handler logic.
6. **Specify how frontend receives auth after redirect** — the redirect sets cookies on the API domain; the frontend on a different domain needs a mechanism to know authentication succeeded.
7. **Add rate limiting infrastructure** — middleware or decorator for authorize and callback endpoints.
8. **Specify `code_challenge_method=S256`** — explicitly state this is required; `plain` is insecure.
