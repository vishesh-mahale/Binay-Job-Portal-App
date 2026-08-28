# OAuth Configuration Decision — Review

**Document under review:** `04-nestjs-api/04-nestjs-api-app/PHASE-09-OAUTH-CONFIG-DECISION-REQUIRED.md`
**Status:** OPEN — callback implementation gate
**Review date:** 2026-08-27

---

## Verdict

**NOT APPROVED — 2 BLOCKERS, 2 CONFLICTS, 5 MISSING REQUIREMENTS, 2 SECURITY GAPS**

---

## 1. BLOCKERS

### BLOCKER-1: No existing OAuth infrastructure in codebase

The document assumes OAuth callback will be implemented as `GET /api/v1/auth/oauth/callback`, but **zero OAuth code exists anywhere**:

- `auth-provider.ts:12` — `AuthProvider` interface defines only `signup`, `login`, `refresh`
- `auth-provider.ts:28-44` — `SupabaseAuthProvider` implements only password-based flows
- `auth-provider.ts:58-101` — `AuthProviderController` has no `@Get('oauth/callback')` route
- `app.module.ts:20` — No OAuth-related providers or imports

**Why this is a blocker:** The document frames itself as a "decision required" before implementation, but the 5 decisions it raises (providers, redirect URLs, callback result, account linking, email verification) are all environment-specific configuration that cannot be resolved without knowing the deployment topology. The implementation gate is premature — the architectural decisions (provider interface, PKCE binding, state management, token handling) should be resolved first, then environment-specific values.

**Recommendation:** Split into two documents:
1. **Architecture decision** — OAuth provider interface, PKCE/state design, token handling, account linking policy (resolvable now)
2. **Environment configuration** — Provider allowlist, redirect URLs, CORS origins (resolvable at deploy time)

---

### BLOCKER-2: No PKCE or state infrastructure exists

The document states "OAuth `state` aur PKCE verifier bind/expire honge; replay reject hoga" as a non-negotiable rule, but:

- No state store (Redis, database, or in-memory) exists
- No PKCE verifier generation or storage mechanism exists
- No OAuth state table in SQL baseline (`02_enums.sql`, `03_users_auth.sql`)
- No `crypto.randomUUID()` or `code_verifier`/`code_challenge` generation anywhere in auth code

**Why this is a blocker:** PKCE requires server-side state management (verifier storage, expiration, one-time use enforcement). This is a new architectural component that doesn't exist. The document assumes it will work but provides no design for where state lives.

---

## 2. CONFLICTS with frozen contracts

### CONFLICT-1: Callback route path not in frozen endpoint catalog

**Frozen contract** (`AUTH-ENDPOINT-CONTRACT-DECISION-REQUIRED.md:16`):
```
GET | /api/v1/auth/oauth/callback | Public provider callback | Exchange approved OAuth callback data...
```

**Document says** (line 30): "Providers, redirect allowlist, account-linking aur verification policy approve hone ke baad hi `GET /api/v1/auth/oauth/callback` implement hoga."

**Conflict:** The frozen contract already approves the callback route for implementation. The document adds a new prerequisite (provider-specific approval) that contradicts the freeze gate. The frozen contract says "Core controller and provider implementation may now start using the frozen route matrix above." OAuth callback IS in that matrix.

---

### CONFLICT-2: Email verification rule conflicts with handle_new_user() trigger

**Document says** (line 17): "OAuth provider verified email ko `public.users` status active banane ka exact rule approve karna hoga. `handle_new_user()` trigger ka ownership replace nahi hoga."

**SQL baseline** (`03_users_auth.sql:255-258`):
```sql
CASE
    WHEN NEW.email_confirmed_at IS NOT NULL THEN 'active'::public.account_status
    ELSE 'pending_verification'::public.account_status
END
```

**Conflict:** The trigger already handles OAuth-verified email automatically. If `auth.users` has `email_confirmed_at` set (which Google/Microsoft OAuth always does), the trigger creates the user with `status = 'active'`. The document says this rule needs approval, but the trigger already implements it. The real question is: **what happens when the trigger creates an active user row but the OAuth callback hasn't set cookies yet?** This timing question is not addressed.

---

## 3. MISSING REQUIREMENTS

### MISSING-1: No `auth_provider` column on `public.users`

The SQL `login_history` table has `auth_provider VARCHAR(50)` for OAuth provider tracking (`03_users_auth.sql:401`), and the `login_history_provider_consistency` CHECK constraint enforces that OAuth logins must have a non-null `auth_provider` (`03_users_auth.sql:415-418`):

```sql
CONSTRAINT login_history_provider_consistency CHECK (
    (login_type IN ('oauth', 'sso') AND auth_provider IS NOT NULL AND btrim(auth_provider) <> '')
    OR (login_type NOT IN ('oauth', 'sso') AND auth_provider IS NULL)
)
```

But the `public.users` table has **no `auth_provider` column** to track which provider a user registered with. The document doesn't address:
- How to store which OAuth provider a user linked their account to
- How to enforce one-provider-per-user or multi-provider rules
- How `handle_new_user()` trigger populates provider metadata (it reads `raw_app_meta_data ->> 'application_role'` but not provider)

---

### MISSING-2: No account linking policy

The document asks (line 14): "Existing email account se OAuth identity link karna allowed hai ya duplicate/explicit-link flow chahiye?"

But it doesn't provide any analysis of the two options:

**Option A — Auto-link (recommended for most apps):**
- User signs up with email/password → later connects Google OAuth
- Upsert: match on email, update `auth.providers` metadata
- Risk: email takeover if email verification is bypassed

**Option B — Explicit link with verification:**
- User must be authenticated, then initiate OAuth flow with `link=true` flag
- Supabase Auth `linkIdentity()` API handles this
- Risk: more complex UX, but more secure

The document needs to specify which option because:
- Auto-link requires trusting OAuth email verification (Supabase Auth does this by default)
- Explicit link requires an authenticated session BEFORE the OAuth flow starts
- The callback handler design is completely different for each option

---

### MISSING-3: No token handling specification

The document says (line 24): "Access/refresh token response body, logs, database ya query string me nahi jayenge."

But the OAuth callback flow involves exchanging an authorization code for tokens. The document doesn't specify:

1. **Who calls Supabase Auth token exchange?** — NestJS `SupabaseAuthProvider` via `call('/token?grant_type=oauth', ...)`? Or Supabase Auth handles the exchange server-side?
2. **What happens to the OAuth provider's access token?** — Google/Microsoft return their own access tokens for API access. Are these stored? Discarded? The document says "tokens in logs/database no" but doesn't say what happens to the Google access token itself.
3. **Supabase Auth OAuth flow** — Does the app use Supabase Auth as the OAuth intermediary (Supabase handles provider exchange), or does NestJS call Google directly?

---

### MISSING-4: No CORS specification for callback

The callback is a `GET` request from the browser (after provider redirect). If the frontend and API are on different origins:

- `GET /api/v1/auth/oauth/callback` needs CORS headers
- `credentials: true` requires explicit `Access-Control-Allow-Origin` (no wildcard)
- The current `main.ts` (`main.ts:11`) supports CORS via `CORS_ORIGINS` env var
- But the document doesn't specify: does the callback redirect go to the API domain or the frontend domain?

**Architecture implication:** OAuth callbacks from providers (Google, Microsoft) always redirect to a single registered redirect URI. If the API handles the callback, the API domain must be the redirect URI. If the frontend handles it, the frontend domain must be the redirect URI. This is a fundamental architectural choice that affects:
- Cookie domain (cross-origin vs same-origin)
- CORS configuration
- How tokens are passed from callback handler to the frontend

---

### MISSING-5: No refresh token storage for OAuth sessions

The cookie contract (`AUTH-COOKIE-CONTRACT-TEMPORARY.md:29`) says: "Refresh token application database, logs, task payloads ya normal API response body mein store nahi hoga."

But OAuth sessions need refresh token rotation just like password sessions. The document doesn't address:
- Does OAuth callback create a `binay_refresh_token` cookie? (Should, per frozen contract)
- Does the refresh endpoint handle OAuth-issued refresh tokens differently?
- What happens when the OAuth provider's refresh token expires (Google refresh tokens don't expire if used regularly, but Microsoft ones do)?

---

## 4. SECURITY GAPS

### SECURITY-1: No provider token validation specified

The document says invalid/expired codes should "fail closed" but doesn't specify:
- How to validate the `state` parameter (HMAC? Database lookup? In-memory?)
- How to handle CSRF if state validation fails
- Whether the callback endpoint should be rate-limited (it's currently not guarded by `AuthGuard`)
- Whether OAuth callback should log to `login_history` (the frozen contract implies yes, but the document doesn't say)

---

### SECURITY-2: No PKCE storage location specified

PKCE requires storing the `code_verifier` between the authorization request and the callback. Options:
- **Database table** — persistent, survives server restarts, but adds latency
- **Redis/KV** — fast, but adds infrastructure dependency
- **Signed cookie** — no server state, but verifier is visible in transit (must be HttpOnly+Secure)
- **In-memory Map** — fast, but lost on restart, doesn't work with multiple instances

The document says PKCE "bind/expire honge" but doesn't say WHERE they're stored. This is an architectural decision that affects:
- Infrastructure requirements (Redis vs PostgreSQL vs cookie)
- Scalability (in-memory won't work with multiple instances)
- Security (signed cookie is less secure than server-side storage)

---

## 5. NO-ISSUE ITEMS

These items are correctly specified or appropriately deferred:

- **Non-negotiable security rules** (lines 21-27) — Correctly prohibits trusting client-supplied provider/redirect, requires state/PKCE, prohibits token logging, requires fail-closed behavior
- **Implementation gate** (lines 29-31) — Appropriately gates implementation on decision approval
- **Provider allowlist concept** — Correctly states only approved providers accepted
- **No wildcard redirects** — Correctly prohibits wildcard redirect URLs
- **Callback result handling** — Correctly specifies success = cookies + redirect, failure = sanitized error

---

## 6. RECOMMENDATIONS

1. **Split the document** into architecture decisions (resolvable now) and environment configuration (resolvable at deploy time)
2. **Add PKCE/state storage design** — specify where verifiers live (recommend: database table with TTL or signed cookie)
3. **Add account linking policy** — specify auto-link vs explicit-link (recommend: explicit-link for security)
4. **Clarify Supabase Auth OAuth flow** — does NestJS call provider directly or use Supabase Auth as intermediary?
5. **Add `auth_provider` tracking** — either new column on `public.users` or metadata in `raw_app_meta_data`
6. **Specify callback origin** — API domain or frontend domain for redirect URI
7. **Add OAuth callback to `login_history`** — frozen contract implies it, document should explicitly require it
8. **Add rate limiting to callback** — prevent authorization code replay attacks
