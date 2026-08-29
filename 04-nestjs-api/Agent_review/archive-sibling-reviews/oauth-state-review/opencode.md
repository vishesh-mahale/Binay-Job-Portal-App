# OAuth Implementation Plan + OAuth State Helper — Re-Review

**Documents under review:**
- `04-nestjs-api/04-nestjs-api-app/PHASE-09-OAUTH-IMPLEMENTATION-PLAN.md` (updated)
- `04-nestjs-api/04-nestjs-api-app/src/oauth-state.ts`
- `04-nestjs-api/04-nestjs-api-app/src/oauth-state.spec.ts`

**Review date:** 2026-08-27

---

## Verdict

**CONDITIONAL PASS — 1 BLOCKER, 2 HIGH, 6 MEDIUM, 4 LOW**

The `oauth-state.ts` helper is well-implemented: AES-256-GCM with per-request IV, timing-safe comparison, key versioning, and a clean test suite. The updated plan addresses several prior review findings. One blocker remains before implementation can proceed.

---

## 1. BLOCKER

### BLOCKER-1: `AuthProvider` interface still does not include OAuth

`auth-provider.ts:12`:
```typescript
export interface AuthProvider {
  signup(input: { email: string; password: string }): Promise<AuthSession>;
  login(input: { email: string; password: string }): Promise<AuthSession>;
  refresh(refreshToken: string): Promise<AuthSession>;
}
```

The plan says (line 7-8): "NestJS OAuth boundary own karega aur Supabase Auth intermediary/provider exchange handle karega." The plan also says (line 23): "exchange code outside DB transaction" — implying NestJS calls Supabase Auth `/token?grant_type=...` or `/authorize` with the OAuth code.

But the `AuthProvider` interface has no method for OAuth. The frozen contract (`AUTH-ENDPOINT-CONTRACT-DECISION-REQUIRED.md:16`) says `GET /api/v1/auth/oauth/callback` is a current-scope route. The plan says implementation starts after environment values are frozen, but the interface design decision (add `authorize()`/`callback()` to `AuthProvider`, or create a separate `OAuthProvider` interface) has not been resolved.

**Why this is a blocker:** Adding OAuth routes to `AuthProviderController` without updating the `AuthProvider` interface would either bypass the isolation boundary (violating frozen contract D1) or require an interface change that hasn't been decided. The plan assumes this works but provides no interface design.

**Recommendation:** Resolve interface design before implementation. Two clean options:
1. Add `authorize(provider, redirectUri)` and `callback(code, state, codeVerifier)` to `AuthProvider`
2. Create a separate `OAuthProvider` interface with `SupabaseOAuthProvider` implementation

---

## 2. HIGH FINDINGS

### HIGH-1: Replay protection relies on timing, not enforcement

The plan says (line 22): "validate state + one-time expiry" and (line 38): "Callback compares query `state` with the cookie state, rejects expiry/replay"

The `oauth-state.ts` helper validates:
- ✅ AES-256-GCM integrity (tampered ciphertext rejected)
- ✅ Expiry via `expiresAt` timestamp (line 22)
- ✅ State comparison via `statesEqual()` (timing-safe)

But **single-use enforcement is not in the helper**. The helper is a stateless encrypt/decrypt utility. "One-time" and "replay rejection" require the callback to:
1. Decrypt the state cookie
2. Check if `state` was already used (requires storage)
3. Mark it as used (requires storage)
4. Then proceed

The plan says "clear-on-use" (line 39: "clears the state cookie before redirecting"). Clearing the cookie prevents the same browser from replaying. But:
- What if the callback is called twice before the cookie is cleared? (Race condition with tabs)
- What if the attacker intercepts the callback URL and calls it directly? (State cookie is HttpOnly, so attacker can't read it — but the attacker has the `state` query parameter from the redirect URL)
- The plan doesn't address: what if two browser tabs both initiate OAuth flows simultaneously?

**Risk:** The current design allows a narrow race window where two simultaneous OAuth callbacks could both succeed if the second arrives before the first clears the cookie. This is low-probability but real.

**Recommendation:** Either:
- Accept the race condition as low-risk (the attacker would need to intercept the callback URL within the TTL window)
- Or add server-side state tracking (database or cache) for true single-use enforcement

---

### HIGH-2: `keyVersion` in ciphertext is not validated against current version

`oauth-state.ts:12`:
```typescript
return `v${payload.keyVersion}.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
```

`oauth-state.ts:15-24`:
```typescript
export function openOAuthState(value: string, secret: string, now = Date.now()): OAuthStatePayload {
  // ... parses parts[0] as version prefix but never validates it against current version
  const parsed = JSON.parse(...) as OAuthStatePayload;
  // ... only checks state, codeVerifier, expiresAt
  return parsed;
}
```

The `keyVersion` is stored in the ciphertext and returned in the payload, but `openOAuthState` **never checks if the version is the current version**. This means:
- Old keys can always decrypt old states (intentional for rotation)
- But there's no mechanism to reject states encrypted with deprecated keys after rotation completes
- The plan says (line 37): "key rotation requires a short overlap of key versions" — but the helper doesn't enforce this

**Risk:** After key rotation, old states remain valid until they expire. If the rotation overlap is short (plan says "short overlap"), this is acceptable. But if an attacker captured a state cookie before rotation, they can still use it after rotation if the TTL hasn't expired.

**Recommendation:** Add an optional `currentKeyVersion` parameter to `openOAuthState`. If provided, reject states with `keyVersion < currentKeyVersion` (allow current and next, reject old). This enforces the rotation policy.

---

## 3. MEDIUM FINDINGS

### MEDIUM-1: State cookie `SameSite` not specified

The plan says (line 33): "State cookie is HttpOnly, Secure outside local development, short-lived and single-use"

But the state cookie is set on the `/api/v1/auth/oauth/authorize` endpoint, which is a GET request from the browser. The callback comes from the provider (external redirect). For the state cookie to be sent on the callback:
- The callback is a redirect FROM the provider TO the NestJS API
- The browser receives the redirect and navigates to the callback URL
- The state cookie must be sent with this navigation

With `SameSite=Lax`: cookies ARE sent on top-level cross-origin GET navigations (redirects). This is correct.
With `SameSite=Strict`: cookies are NOT sent on cross-origin navigations. This would break OAuth.

The plan doesn't specify `SameSite` for the state cookie. The existing cookie contract (`AUTH-COOKIE-CONTRACT-TEMPORARY.md`) specifies `SameSite=Lax` for auth cookies but doesn't mention the state cookie.

**Recommendation:** Explicitly specify `SameSite=Lax` for the state cookie and document why `Strict` would break OAuth.

---

### MEDIUM-2: State cookie `Path` not specified

The state cookie should only be sent to the OAuth endpoints (`/api/v1/auth/oauth/authorize` and `/api/v1/auth/oauth/callback`). If the state cookie uses `Path=/`, it will be sent with every request to the API, which is unnecessary overhead.

**Recommendation:** Set `Path=/api/v1/auth/oauth` on the state cookie to limit its scope.

---

### MEDIUM-3: No `Max-Age` or `Expires` on state cookie

The plan says (line 33): "short-lived" but the `oauth-state.ts` helper doesn't set cookie attributes. The cookie attributes are set by the controller (which doesn't exist yet). The plan should specify:
- `Max-Age` matching `OAUTH_STATE_TTL_SECONDS` (or slightly longer to account for clock skew)
- Or `Expires` based on the `expiresAt` timestamp in the payload

Without this, the state cookie persists until the browser session ends, which could be much longer than the intended TTL.

**Recommendation:** Document that the controller must set `Max-Age` on the state cookie equal to `OAUTH_STATE_TTL_SECONDS + 30` (30-second buffer for clock skew).

---

### MEDIUM-4: `OAUTH_STATE_SECRET` minimum length check is inconsistent

`oauth-state.ts:8`:
```typescript
if (secret.length < 32) throw new Error('OAUTH_STATE_SECRET_TOO_WEAK');
```

`config.ts:23`:
```typescript
OAUTH_STATE_SECRET: z.string().min(32).optional(),
```

The helper requires 32 characters. The config requires 32 characters. But `config.ts` makes `OAUTH_STATE_SECRET` **optional**. If the env var is not set, `config.OAUTH_STATE_SECRET` is `undefined`. The helper will throw `OAUTH_STATE_SECRET_TOO_WEAK` when `secret.length` is checked against `undefined.length` (which is `0`).

This is fail-closed (correct), but the config should make `OAUTH_STATE_SECRET` **required** when OAuth is enabled. Currently, `ALLOWED_OAUTH_PROVIDERS` is also optional, so there's no guard that says "if providers are configured, the state secret must also be configured."

**Recommendation:** Add a Zod refinement: if `ALLOWED_OAUTH_PROVIDERS` is set, `OAUTH_STATE_SECRET` must also be set.

---

### MEDIUM-5: `statesEqual` comparison includes the `v{version}.` prefix

`oauth-state.ts:27-29`:
```typescript
export function statesEqual(expected: string, actual: string): boolean {
  const a = Buffer.from(expected); const b = Buffer.from(actual); return a.length === b.length && timingSafeEqual(a, b);
}
```

The `statesEqual` function compares the full sealed state string (including the `v{version}.` prefix). This is correct for comparing the state query parameter with the state cookie value — the callback receives the full state string from the query parameter and compares it with the decrypted state from the cookie.

But the plan says (line 38): "Callback compares query `state` with the cookie state." The cookie state is the encrypted blob; the query `state` is what the provider sent back. They should be identical (the provider echoes the state parameter).

Wait — there's a subtlety. The flow is:
1. NestJS generates `state` (random string), encrypts it into a cookie, and sends the plaintext `state` as a query parameter to the provider
2. Provider echoes `state` back in the callback URL
3. Callback receives `state` in query parameters and the encrypted cookie
4. Callback decrypts the cookie to get the original `state`
5. Callback compares decrypted `state` with query `state`

So `statesEqual` should compare the **decrypted state** with the **query state**, not the full sealed string. The function as written compares two full strings. This is fine if both inputs are the same format (both sealed or both plaintext). But the callback would be:
```typescript
const decrypted = openOAuthState(cookieValue, secret);
const queryState = request.query.state;
if (!statesEqual(decrypted.state, queryState)) throw ...;
```

This works correctly. The function is generic and compares any two strings.

**No issue here.** The function is correctly implemented.

---

### MEDIUM-6: Test doesn't verify different key versions

`oauth-state.spec.ts:3`:
```typescript
const payload = { state: 'state-1', codeVerifier: 'verifier-1', issuedAt: 1000, expiresAt: 2000, keyVersion: 1 };
```

The test always uses `keyVersion: 1`. It doesn't test:
- What happens when `keyVersion` differs between seal and open (different secrets)
- What happens when the secret changes (key rotation simulation)

**Recommendation:** Add a test that seals with `keyVersion: 1` and opens with a different secret (simulating key rotation), verifying that decryption fails (GCM tag mismatch).

---

## 4. LOW FINDINGS

### LOW-1: `key()` function uses SHA-256 to derive a 32-byte key from the secret

`oauth-state.ts:5`:
```typescript
function key(secret: string): Buffer { return createHash('sha256').update(secret, 'utf8').digest(); }
```

SHA-256 produces a 32-byte key from the secret. If the secret is already 32 bytes (as required by the length check), this is redundant but harmless. If the secret is longer than 32 bytes, SHA-256 normalizes it to 32 bytes.

This is fine. The SHA-256 derivation ensures the key is always exactly 32 bytes regardless of secret length, and it's a standard pattern for key derivation from a passphrase.

---

### LOW-2: Test secret is exactly 32 characters

`oauth-state.spec.ts:4`:
```typescript
const secret = '12345678901234567890123456789012';
```

This is a 32-character string. The test verifies the minimum-length path. No issue.

---

### LOW-3: `OAuthStatePayload` type exported but not used externally

`oauth-state.ts:31`:
```typescript
export type { OAuthStatePayload };
```

This is a clean export for consumers. No issue.

---

### LOW-4: Plan test list includes "multi-instance state behavior test"

The plan (line 77) lists "multi-instance state behavior test." The `oauth-state.ts` helper is stateless (no shared state between instances), so multi-instance behavior is inherently correct — any instance can decrypt the cookie as long as it has the same `OAUTH_STATE_SECRET`.

This test should verify that Instance A can decrypt a cookie sealed by Instance B (same secret). This is a valid test case.

---

## 5. NO-ISSUE ITEMS (correctly addressed)

These items from the prior review are now correctly addressed:

- **PKCE S256** — plan now explicitly specifies `code_challenge_method=S256` (line 16)
- **AES-256-GCM integrity** — `createCipheriv` with random 12-byte IV, auth tag stored, `decipher.final()` validates tag
- **Expiry** — `openOAuthState` checks `expiresAt <= now` (line 22)
- **Key versioning** — `keyVersion` stored in payload, encoded in prefix, available for rotation
- **Multi-instance safety** — stateless encrypt/decrypt, no shared state between instances
- **Cookie security** — HttpOnly, Secure outside dev, short-lived (plan line 33)
- **No token/secret leakage** — PKCE verifier "never placed in URL, response body, logs or database" (plan line 41), state cookie is encrypted
- **Supabase Auth compatibility** — plan correctly states Supabase Auth is intermediary (line 7-8)
- **Frozen API contract** — `GET /api/v1/auth/oauth/callback` is in the frozen contract (`AUTH-ENDPOINT-CONTRACT-DECISION-REQUIRED.md:16`)
- **`AuthAuditService` updated** — `loginType` and `authProvider` parameters added (`auth-audit.ts:12-13`), SQL will now pass `login_type='oauth'` with non-null `auth_provider`, satisfying the CHECK constraint
- **Config updated** — `OAUTH_STATE_SECRET` (min 32), `OAUTH_STATE_TTL_SECONDS` (60-3600, default 600), `ALLOWED_OAUTH_PROVIDERS`, `OAUTH_CALLBACK_URL`, `OAUTH_FRONTEND_SUCCESS_URL`, `OAUTH_FRONTEND_ERROR_URL` all added to `config.ts:19-24`

---

## 6. SUMMARY OF PRIOR REVIEW FINDINGS — STATUS

| Prior Finding | Status | Notes |
|---|---|---|
| BLOCKER-1: No PKCE verifier storage | **RESOLVED** | State cookie now stores encrypted payload with PKCE verifier |
| BLOCKER-2: No state/PKCE storage mechanism | **RESOLVED** | AES-256-GCM encrypted cookie is the storage mechanism |
| BLOCKER-3: `AuthProvider` interface no OAuth | **OPEN** | Interface still only has signup/login/refresh |
| CONFLICT-1: Callback route not in catalog | **OPEN** | OAuth routes still not in frozen endpoint catalog |
| CONFLICT-2: `login_history` hardcoded | **RESOLVED** | `AuthAuditService.loginAttempt()` now accepts `loginType`/`authProvider` |
| CONFLICT-3: CORS inconsistency | **OPEN** | `OAUTH_FRONTEND_SUCCESS_URL` must be in `CORS_ORIGINS` |
| CONFLICT-4: SameSite cross-origin | **PARTIAL** | State cookie flow works with Lax; frontend auth after redirect still unspecified |
| MISSING-1: No auth_provider column | **OPEN** | Still no column on `public.users` |
| MISSING-2: Account linking policy | **OPEN** | Still deferred to separate decision |
| MISSING-3: No rate limiting | **OPEN** | No infrastructure added |
| MISSING-4: No code_challenge_method | **RESOLVED** | Plan now specifies S256 |
| MISSING-5: No redirect URI validation | **OPEN** | Plan says "server allowlists" but no implementation specified |
| MISSING-6: No token exchange mechanism | **OPEN** | Plan says "exchange code outside DB transaction" but doesn't specify how |
| MISSING-7: No state cookie cleanup | **RESOLVED** | Plan now says "clear-on-use" (line 39) |
| MISSING-8: No error redirect | **OPEN** | Plan still doesn't specify error redirect behavior |

---

## 7. RECOMMENDATIONS

1. **Resolve `AuthProvider` interface design** before implementation (add methods or create separate `OAuthProvider` interface)
2. **Add `currentKeyVersion` parameter** to `openOAuthState` for rotation enforcement
3. **Specify `SameSite=Lax` and `Path=/api/v1/auth/oauth`** for the state cookie
4. **Add Zod refinement**: if `ALLOWED_OAUTH_PROVIDERS` is set, `OAUTH_STATE_SECRET` must also be set
5. **Add key rotation test** — seal with version 1, open with different secret, verify failure
6. **Specify error redirect behavior** — sanitize error, redirect to `OAUTH_FRONTEND_ERROR_URL`
7. **Specify redirect URI validation** — how the callback validates that the redirect URL matches the registered URL
8. **Address CORS consistency** — `OAUTH_FRONTEND_SUCCESS_URL` must be in `CORS_ORIGINS`
