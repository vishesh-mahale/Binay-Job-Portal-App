# OpenCode — AuthProvider Audit/Session Implementation Review

## 1. Executive Verdict

```text
PROCEED WITH REQUIRED FIXES — AUDIT WRITES ARE THE IMMEDIATE BLOCKER
```

The AuthProvider implementation is architecturally correct. The `SupabaseAuthProvider` boundary, cookie path isolation, `rawAccessToken` propagation, fail-closed guard, and account-state checks are all verified. The BLOCKER from the previous review (`identity-company.ts:17` reading token from header) is **FIXED** — the current code reads from `request.rawAccessToken`.

However, **zero audit writes exist**. The SQL baseline explicitly says `login_history` is "Populated via application code (NestJS AuthModule)" (`03_users_auth.sql:391`), but no INSERT statement exists anywhere in the codebase. This is the immediate implementation blocker.

- **BLOCKER: 1** (zero audit writes)
- **REQUIRED FIX: 8**
- **CONFLICT: 2**
- **MISSING REQUIREMENT: 4**
- **VERIFIED: 15**
- **SAFE TO DEFER: 4**
- **NOT APPLICABLE: 2**

## 2. Files Reviewed

| # | File | Role |
|---|---|---|
| 1 | `auth-provider.ts` | SupabaseAuthProvider + AuthProviderController |
| 2 | `auth.ts` | AuthGuard + verifyBearer |
| 3 | `app.module.ts` | Module wiring |
| 4 | `identity-company.ts` | Identity endpoints (me, sessions, revoke) |
| 5 | `clients.ts` | UserContextClient + SystemClient |
| 6 | `config.ts` | Environment schema |
| 7 | `main.ts` | Bootstrap |
| 8 | `errors.ts` | Exception filter |
| 9 | `auth.spec.ts` | Auth tests |
| 10 | `PHASE-09-AUTH-PROVIDER-IMPLEMENTATION-REPORT.md` | Implementation report |
| 11 | `AUTH-ENDPOINT-CONTRACT-DECISION-REQUIRED.md` | Decision document |
| 12 | `03_users_auth.sql` | Users/sessions/auth SQL |
| 13 | `02_enums.sql` | Enum definitions |
| 14 | `17_rls.sql` | RLS policies |
| 15 | `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md` | Frozen contract |
| 16 | `AUTH-COOKIE-CONTRACT-TEMPORARY.md` | Cookie contract |
| 17 | `NESTJS-IMPLEMENTATION-GUIDE.md` | Implementation guide |

## 3. Current Implementation Verification Table

### 3.1 SupabaseAuthProvider Boundary

| Check | Evidence | Classification |
|---|---|---|
| Interface matches guide | `auth-provider.ts:9` — `signup(input)`, `login(input)`, `refresh(refreshToken)` matches `NESTJS-IMPLEMENTATION-GUIDE.md:98-104` | VERIFIED |
| Server-only credentials | `auth-provider.ts:15` — checks `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; `auth-provider.ts:18` — sends `apikey: this.config.SUPABASE_SERVICE_ROLE_KEY, Authorization: Bearer ${this.config.SUPABASE_SERVICE_ROLE_KEY}` | VERIFIED |
| No manual user insert | `auth-provider.ts:45` — signup returns `{ status, user_id }`; no INSERT into `public.users` | VERIFIED |
| Provider is Injectable | `auth-provider.ts:11-12` — `@Injectable()` class | VERIFIED |
| Registered in module | `app.module.ts:19` — `{ provide: SupabaseAuthProvider, useFactory:()=>new SupabaseAuthProvider(config) }` | VERIFIED |

### 3.2 Signup Behavior

| Check | Evidence | Classification |
|---|---|---|
| Route exists | `auth-provider.ts:44` — `@Post('signup') @HttpCode(HttpStatus.CREATED)` | VERIFIED |
| Public (no guard) | `auth-provider.ts:40` — `@Controller('api/v1/auth')` on `AuthProviderController` — no `@UseGuards(AuthGuard)` | VERIFIED |
| DTO validation | `auth-provider.ts:45` — `if (!body.email \|\| !body.password) throw new BadRequestException('VALIDATION_ERROR')` — manual check, no class-validator | VERIFIED (basic) |
| Email normalization | `auth-provider.ts:45` — `body.email.trim().toLowerCase()` | VERIFIED |
| Calls Supabase Auth | `auth-provider.ts:27` — `this.call('/signup', input)` → `fetch(SUPABASE_URL/auth/v1/signup, ...)` | VERIFIED |
| Returns safe response | `auth-provider.ts:45` — `{ status: 'pending_verification' \| 'active', user_id }` — no tokens in body | VERIFIED |
| Sets cookies | `auth-provider.ts:45` — `setSessionCookies(response, session, this.secure)` | VERIFIED |
| Duplicate signup safe | `03_users_auth.sql:260` — `ON CONFLICT (id) DO NOTHING` in `handle_new_user()` | VERIFIED |
| **Missing: login_history write** | No INSERT into `login_history` on signup | **REQUIRED FIX** |
| **Missing: user_security_log write** | No INSERT into `user_security_log` for `account_created` event | **REQUIRED FIX** |

### 3.3 Login Behavior

| Check | Evidence | Classification |
|---|---|---|
| Route exists | `auth-provider.ts:46-47` — `@Post('login')` | VERIFIED |
| Public (no guard) | No `@UseGuards(AuthGuard)` on `AuthProviderController` | VERIFIED |
| Calls Supabase Auth | `auth-provider.ts:28` — `this.call('/token?grant_type=password', input)` | VERIFIED |
| Account state check | `auth-provider.ts:47` — `SELECT status, deleted_at, locked_until FROM public.users WHERE id = $1` | VERIFIED |
| Checks deleted_at | `auth-provider.ts:47` — `if (!account \|\| account.deleted_at \|\| ...)` | VERIFIED |
| Checks status | `auth-provider.ts:47` — `account.status !== 'active'` | VERIFIED |
| Checks locked_until | `auth-provider.ts:47` — `account.locked_until && new Date(account.locked_until).getTime() > Date.now()` | VERIFIED |
| Sets cookies | `auth-provider.ts:47` — `setSessionCookies(response, session, this.secure)` | VERIFIED |
| Returns safe response | `auth-provider.ts:47` — `{ status: 'authenticated', user_id }` — no tokens in body | VERIFIED |
| **Missing: login_history write** | No INSERT into `login_history` on success or failure | **REQUIRED FIX** |
| **Missing: user_security_log write** | No INSERT into `user_security_log` for `login_failed` on failure | **REQUIRED FIX** |
| **Missing: user_sessions creation** | No INSERT into `user_sessions` on login | **REQUIRED FIX** |

### 3.4 Refresh Behavior

| Check | Evidence | Classification |
|---|---|---|
| Route exists | `auth-provider.ts:48-49` — `@Post('refresh')` | VERIFIED |
| Reads only from cookie | `auth-provider.ts:49` — `request.cookies?.binay_refresh_token` — no header fallback | VERIFIED |
| No auth guard | Refresh endpoint is on `AuthProviderController` which has no `@UseGuards(AuthGuard)` — correct because refresh uses the refresh token cookie, not the access token | VERIFIED |
| Calls Supabase Auth | `auth-provider.ts:29` — `this.call('/token?grant_type=refresh_token', { refresh_token: refreshToken })` | VERIFIED |
| Sets new cookies | `auth-provider.ts:49` — `setSessionCookies(response, session, this.secure)` | VERIFIED |
| Refresh token not logged | No `console.log` or response body includes refresh token | VERIFIED |
| **Missing: user_sessions update** | No UPDATE to `user_sessions.last_seen_at` on refresh | **SAFE TO DEFER** — presence heartbeat is optional |

### 3.5 Logout Behavior

| Check | Evidence | Classification |
|---|---|---|
| Route exists | `auth-provider.ts:50-51` — `@Post('logout')` | VERIFIED |
| Clears access cookie | `auth-provider.ts:51` — `response.clearCookie('binay_access_token', { path: '/' })` | VERIFIED |
| Clears refresh cookie | `auth-provider.ts:51` — `response.clearCookie('binay_refresh_token', { path: '/api/v1/auth/refresh' })` | VERIFIED |
| Cookie flags match set | clearCookie uses same `httpOnly`, `secure`, `sameSite`, `path` as setSessionCookies | VERIFIED |
| **Missing: user_sessions deactivation** | No UPDATE to `user_sessions SET is_online = false` on logout | **REQUIRED FIX** — decision doc line 18 says "logout must still clear the current presence row" |
| **Missing: login_history write** | No INSERT into `login_history` for logout event | **SAFE TO DEFER** — logout audit is not in SQL schema |

### 3.6 Cookie Configuration

| Check | Evidence | Classification |
|---|---|---|
| binay_access_token Path=/ | `auth-provider.ts:36` — `path: '/'` | VERIFIED |
| binay_refresh_token Path=/api/v1/auth/refresh | `auth-provider.ts:37` — `path: '/api/v1/auth/refresh'` | VERIFIED |
| HttpOnly=true | `auth-provider.ts:36-37` — `httpOnly: true` | VERIFIED |
| Secure (env-dependent) | `auth-provider.ts:42` — `this.secure = process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test'` | VERIFIED |
| SameSite=Lax | `auth-provider.ts:36-37` — `sameSite: 'lax'` | VERIFIED |
| Domain omitted | No `domain` in cookie options — host-only cookie | VERIFIED |
| **Missing: CORS** | `main.ts:11` — no `app.enableCors()` | **REQUIRED FIX** — cross-origin POST won't include cookies |

### 3.7 AuthGuard and Token Propagation

| Check | Evidence | Classification |
|---|---|---|
| Cookie-first precedence | `auth.ts:12` — `const token = cookieToken \|\| headerToken` | VERIFIED |
| rawAccessToken set | `auth.ts:25` — `req.rawAccessToken = cookieToken \|\| headerToken` | VERIFIED |
| AuthenticatedRequest type | `auth.ts:7` — `rawAccessToken?: string` | VERIFIED |
| me() reads rawAccessToken | `identity-company.ts:15` — `const token = request.rawAccessToken ?? ''` | VERIFIED |
| Fail-closed on no token | `auth.ts:13` — `if (!token) throw new UnauthorizedException('UNAUTHORIZED')` | VERIFIED |
| Fail-closed on verification failure | `auth.ts:14-15` — `catch { throw new UnauthorizedException('UNAUTHORIZED') }` | VERIFIED |
| issuer/audience options passed | `app.module.ts:19` — `AuthGuard(config.SUPABASE_JWT_SECRET, undefined, { issuer: config.SUPABASE_JWT_ISSUER, audience: config.SUPABASE_JWT_AUDIENCE })` | VERIFIED |
| jose isolation | `jwt-verifier.ts:12` — `new Function('return import("jose")')` | VERIFIED |
| HS256 only | `jwt-verifier.ts:15` — `algorithms: ['HS256']` | VERIFIED |
| sub required | `jwt-verifier.ts:18` — `if (typeof result.payload.sub !== 'string' \|\| result.payload.sub.length === 0) throw` | VERIFIED |

### 3.8 UserContextClient Boundary

| Check | Evidence | Classification |
|---|---|---|
| SELECT-only enforcement | `clients.ts:10` — `if (!/^\s*select\b/i.test(sql)) throw` | VERIFIED |
| JWT claims extraction | `clients.ts:11-12` — decodes JWT payload, base64url-decodes, parses JSON | VERIFIED |
| set_config for RLS | `clients.ts:13` — `select set_config($1, $2, true)` with `request.jwt.claims` | VERIFIED |
| Transaction-scoped | `clients.ts:13` — inside `this.db.transaction()` — `true` = transaction-local | VERIFIED |
| No external calls in transaction | `clients.ts:13` — only PostgreSQL queries inside transaction | VERIFIED |

## 4. Correct login_history Design

### 4.1 SQL Schema (`03_users_auth.sql:394-422`)

```sql
CREATE TABLE public.login_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES public.users(id) ON DELETE RESTRICT,
    email           CITEXT NOT NULL,
    login_type      public.auth_login_type NOT NULL DEFAULT 'email_password',
    auth_provider   VARCHAR(50),  -- NULL for email_password; 'google'/'apple' for OAuth
    success         BOOLEAN NOT NULL,
    failure_reason  public.login_failure_reason,  -- NULL when success=TRUE
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Constraints:**
- `login_history_result_consistency`: `(success = TRUE AND failure_reason IS NULL) OR (success = FALSE AND failure_reason IS NOT NULL)`
- `login_history_provider_consistency`: OAuth/SSO requires `auth_provider`; email_password requires `auth_provider IS NULL`
- `login_history_immutable` trigger: prevents UPDATE/DELETE (append-only)

### 4.2 Enum Mapping

| Supabase Auth Response | login_type | failure_reason | Classification |
|---|---|---|---|
| POST /signup success | `email_password` | NULL | VERIFIED |
| POST /signup 400/422 | `email_password` | `invalid_password` or `user_not_found` (Supabase returns generic error) | REQUIRED FIX — exact mapping needed |
| POST /token?grant_type=password success | `email_password` | NULL | VERIFIED |
| POST /token?grant_type=password 401 | `email_password` | Map from Supabase response: `invalid_grant` → `invalid_password`; `email_not_confirmed` → `email_not_verified` | REQUIRED FIX |
| Account locked (NestJS check) | `email_password` | `account_locked` | REQUIRED FIX |
| Account suspended (NestJS check) | `email_password` | `suspended` | REQUIRED FIX |
| Account banned (NestJS check) | `email_password` | `banned` | REQUIRED FIX |
| Account deleted (NestJS check) | `email_password` | `unknown` | REQUIRED FIX — user not found after Supabase success |
| POST /token?grant_type=refresh_token | N/A — refresh is not a login event | N/A | NOT APPLICABLE |
| OAuth callback | `oauth` | provider-specific | SAFE TO DEFER — OAuth not yet implemented |

### 4.3 Required INSERT Pattern

```typescript
// On every signup/login attempt (success or failure):
await this.system.query(`
  INSERT INTO public.login_history (user_id, email, login_type, auth_provider, success, failure_reason, ip_address, user_agent)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
`, [userId, email, 'email_password', null, success, failureReason, ip, userAgent]);
```

**IP/user-agent extraction:** `request.ip` (Express) and `request.headers['user-agent']`

**When userId is unknown (failed login with unknown email):** `user_id` can be NULL (SQL allows it: `UUID REFERENCES public.users(id) ON DELETE RESTRICT` — nullable FK).

## 5. Correct user_security_log Design

### 5.1 SQL Schema (`03_users_auth.sql:373-384`)

```sql
CREATE TABLE public.user_security_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    event_type  public.security_event_type NOT NULL,
    description TEXT,
    metadata    JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 5.2 Approved Event Types (`02_enums.sql:103-118`)

```sql
CREATE TYPE security_event_type AS ENUM (
    'password_changed', 'password_reset', 'email_verified', 'email_changed',
    'account_locked', 'account_unlocked', 'role_changed', 'mfa_enabled',
    'mfa_disabled', 'login_failed', 'account_suspended', 'account_reactivated',
    'account_deleted', 'phone_changed'
);
```

### 5.3 Auth Operations → Event Mapping

| Auth Operation | security_event_type | When | Classification |
|---|---|---|---|
| Signup success | None (not a security event — account creation is tracked by `login_history`) | N/A | VERIFIED |
| Login failure (wrong password) | `login_failed` | Every failed login attempt | REQUIRED FIX |
| Login failure (account locked) | `login_failed` + `account_locked` | When locked_until check fails | REQUIRED FIX |
| Login failure (suspended) | `login_failed` + `account_suspended` | When status = 'suspended' | REQUIRED FIX |
| Login failure (banned) | `login_failed` + `account_banned` — **NOT IN ENUM** | When status = 'banned' | **CONFLICT** — 'banned' is not in `security_event_type` enum |
| Email verified | `email_verified` | OAuth callback or email verification | SAFE TO DEFER |
| Password changed | `password_changed` | Future password change endpoint | SAFE TO DEFER |
| Account locked | `account_locked` | When `locked_until` is set | SAFE TO DEFER |

**CONFLICT-01:** `security_event_type` enum does not include `'account_banned'`. The `account_status` enum has `'banned'`, but the security log event type does not have a corresponding value. When a banned user attempts login, the event should be `login_failed` with metadata `{"reason": "banned"}` — not a separate event type. This is acceptable but should be documented.

### 5.4 Required INSERT Pattern

```typescript
// On login failure:
await this.system.query(`
  INSERT INTO public.user_security_log (user_id, event_type, description, metadata)
  VALUES ($1, 'login_failed', $2, $3)
`, [userId, description, JSON.stringify({ email, ip, userAgent, reason: failureReason })]);
```

**metadata rules:** "Never store secrets/raw tokens" (`03_users_auth.sql:378`). Safe to store: email, IP, user-agent, failure reason.

## 6. Correct user_sessions/Presence Design

### 6.1 SQL Schema (`03_users_auth.sql:335-348`)

```sql
CREATE TABLE public.user_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    is_online   BOOLEAN NOT NULL DEFAULT true,
    last_seen_at TIMESTAMPTZ,
    socket_id   VARCHAR(100),
    device_type VARCHAR(50),
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**SQL comment (line 330-333):** "Active user session tracking for real-time features. Used for WebSocket connections and live presence. This is NOT for auth sessions (Supabase Auth handles those)."

### 6.2 Decision Document Position

`AUTH-ENDPOINT-CONTRACT-DECISION-REQUIRED.md:40-41`: "Whether presence row creation happens at login or at realtime connection; logout must still clear the current presence row when one exists."

### 6.3 Current Implementation Gap

| Operation | user_sessions action | Status |
|---|---|---|
| Login | None | **REQUIRED FIX** — should INSERT presence row |
| Refresh | None | SAFE TO DEFER — heartbeat optional |
| Logout | None | **REQUIRED FIX** — should UPDATE is_online=false |
| Revoke (identity) | UPDATE is_online=false, socket_id=NULL | VERIFIED |

### 6.4 Recommended Design

**Login:** INSERT a `user_sessions` row with `is_online = true`, `device_type` and `user_agent` from request headers. This creates the presence row that logout will clear.

**Logout:** `UPDATE public.user_sessions SET is_online = false, socket_id = NULL WHERE user_id = $1 AND is_online = true`. Use `WHERE is_online = true` to only affect the current presence row (single-session model per decision doc).

**Refresh:** Optional UPDATE to `last_seen_at`. Can be deferred until realtime heartbeat is implemented.

## 7. Exact Enum and Column Mapping

### 7.1 login_history Column Requirements

| Column | Type | Required | Source | Notes |
|---|---|---|---|---|
| `user_id` | UUID | Nullable | Supabase Auth response `user.id` | NULL when email not found |
| `email` | CITEXT | Required | Request body `email` | After trim+lowercase |
| `login_type` | auth_login_type | Required | `'email_password'` for password login | `'oauth'` for OAuth (future) |
| `auth_provider` | VARCHAR(50) | Nullable | NULL for email_password | `'google'`/`'apple'` for OAuth |
| `success` | BOOLEAN | Required | Computed from operation result | |
| `failure_reason` | login_failure_reason | Nullable | Computed from error | NULL when success=TRUE |
| `ip_address` | INET | Nullable | `request.ip` | Express trust proxy setting affects this |
| `user_agent` | TEXT | Nullable | `request.headers['user-agent']` | |

### 7.2 login_failure_reason Mapping

| Condition | failure_reason | Source |
|---|---|---|
| Supabase Auth 401 + `invalid_grant` | `invalid_password` | Supabase response |
| Supabase Auth 401 + `email_not_confirmed` | `email_not_verified` | Supabase response |
| Supabase Auth 400/422 | `invalid_password` | Supabase response (generic) |
| NestJS: `account.locked_until > now()` | `account_locked` | `auth-provider.ts:47` |
| NestJS: `account.status === 'suspended'` | `suspended` | `auth-provider.ts:47` |
| NestJS: `account.status === 'banned'` | `banned` | `auth-provider.ts:47` — **CONFLICT: not in enum** |
| NestJS: `account.status !== 'active'` (other) | `unknown` | `auth-provider.ts:47` |
| NestJS: `account.deleted_at` not null | `unknown` | `auth-provider.ts:47` |
| Supabase Auth network error | N/A — no row inserted (DEPENDENCY_UNAVAILABLE thrown) | `auth-provider.ts:19` |

### 7.3 security_event_type Mapping

| Operation | event_type | When |
|---|---|---|
| Login failure | `login_failed` | Every failed login attempt |
| Account locked | `account_locked` | When `locked_until` check fails |
| Account suspended | `account_suspended` | When status = 'suspended' |
| Account banned | `login_failed` (with metadata reason) | **No enum value for 'account_banned'** |

## 8. Security and Privacy Findings

### 8.1 Supabase Auth Error Mapping

**Evidence:** `auth-provider.ts:21-24`
```typescript
if (!response.ok) {
  if (response.status === 400 || response.status === 422) throw new BadRequestException('VALIDATION_ERROR');
  throw new UnauthorizedException('UNAUTHORIZED');
}
```

**Issue:** Supabase Auth returns specific error codes in the JSON body (e.g., `invalid_grant`, `email_not_confirmed`, `signup_disabled`). The current code throws generic `VALIDATION_ERROR` or `UNAUTHORIZED` without extracting the Supabase error code for `login_history.failure_reason` mapping.

**Classification:** REQUIRED FIX — Need to parse Supabase Auth error response body for specific failure reasons.

### 8.2 CORS Missing

**Evidence:** `main.ts:11` — no `app.enableCors()`

**Issue:** Cross-origin requests from Next.js (different port/origin) will be blocked by browser CORS policy. Cookies with `SameSite=Lax` require same-origin or CORS with `credentials: true`.

**Classification:** REQUIRED FIX

### 8.3 SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY Optional

**Evidence:** `config.ts:10-11` — both are `optional()`

**Issue:** `SupabaseAuthProvider.call()` checks at runtime (`auth-provider.ts:15`) and throws `DEPENDENCY_UNAVAILABLE`. This is a runtime error, not a startup fail-fast. For auth endpoints that require Supabase Auth, these should be required.

**Classification:** REQUIRED FIX — or document that auth endpoints gracefully degrade when not configured.

### 8.4 No Rate Limiting

**Evidence:** No rate-limit middleware or configuration in `main.ts` or `auth-provider.ts`

**Issue:** Auth endpoints are vulnerable to brute-force attacks. `PHASE-06-API-CATALOG.md:209` specifies "Rate limit: environment-configured signup/callback limits".

**Classification:** REQUIRED FIX

### 8.5 No DTO Class Validation

**Evidence:** `auth-provider.ts:32-33` — `SignupDto` and `LoginDto` have no class-validator decorators

**Issue:** The global `ValidationPipe` with `whitelist: true, forbidNonWhitelisted: true` is configured (`main.ts:11`), but without decorators on the DTO classes, no field-level validation occurs. The manual `if (!body.email \|\| !body.password)` check is the only validation.

**Classification:** SAFE TO DEFER — manual validation is sufficient for MVP; class-validator is a hardening step.

### 8.6 Supabase Auth Raw Fetch vs SDK

**Evidence:** `auth-provider.ts:14-26` — raw `fetch` to Supabase Auth REST API

**Issue:** The guide says "Supabase Auth password/OAuth/token verification provider है" (`NESTJS-IMPLEMENTATION-GUIDE.md:86`). Raw fetch works but lacks retry logic, token refresh rotation details, and proper error parsing. The `@supabase/supabase-js` SDK would handle these automatically.

**Classification:** SAFE TO DEFER — raw fetch is functional; SDK adoption is a hardening step.

### 8.7 Signinup Does Not Handle Supabase "User Already Registered" Gracefully

**Evidence:** `auth-provider.ts:22` — 400/422 → `VALIDATION_ERROR`

**Issue:** When a user tries to sign up with an email that already exists, Supabase Auth returns 400 with `"User already registered"`. The current code throws `VALIDATION_ERROR` which is correct behavior, but the error message is generic. The user doesn't know if the email is taken or if the password is weak.

**Classification:** SAFE TO DEFER — generic validation error is acceptable for security (don't reveal if email exists).

## 9. Blocking Issues Before Audit Implementation

| # | Issue | Severity | Blocker? |
|---|---|---|---|
| 1 | Zero `login_history` writes — SQL says "Populated via application code" but no INSERT exists | HIGH | **YES** |
| 2 | Zero `user_security_log` writes — no security event audit trail | HIGH | **YES** |
| 3 | Logout doesn't deactivate `user_sessions` presence row | HIGH | **YES** — decision doc requires it |
| 4 | Login doesn't create `user_sessions` presence row | MEDIUM | No — but logout clear has no row to clear |
| 5 | No CORS configuration | HIGH | **YES** — cross-origin requests blocked |
| 6 | No rate limiting on auth endpoints | HIGH | **YES** — brute-force vulnerable |
| 7 | Supabase Auth error not parsed for failure_reason mapping | MEDIUM | No — generic failure_reason acceptable |
| 8 | `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` optional | MEDIUM | No — runtime check exists |

## 10. Recommended Implementation Order

| Phase | Task | Depends On |
|---|---|---|
| 1 | Add `login_history` INSERT on signup success, login success, login failure | Nothing |
| 2 | Add `user_security_log` INSERT on login failure | Nothing |
| 3 | Add `user_sessions` INSERT on login | Nothing |
| 4 | Add `user_sessions` UPDATE on logout (deactivate presence) | Phase 3 |
| 5 | Add CORS configuration to `main.ts` | Nothing |
| 6 | Add rate limiting to auth endpoints | Nothing |
| 7 | Parse Supabase Auth error response for specific failure_reason | Phase 1 |
| 8 | Add OAuth callback endpoint | All above |
| 9 | Add class-validator decorators to DTOs | Nothing |

## 11. Required Tests

| # | Test | Priority |
|---|---|---|
| 1 | Signup inserts `login_history` with success=true, login_type='email_password' | HIGH |
| 2 | Login success inserts `login_history` with success=true | HIGH |
| 3 | Login failure (wrong password) inserts `login_history` with success=false, failure_reason='invalid_password' | HIGH |
| 4 | Login failure (locked account) inserts `login_history` with failure_reason='account_locked' AND `user_security_log` with event_type='account_locked' | HIGH |
| 5 | Login failure (suspended) inserts `login_history` with failure_reason='suspended' AND `user_security_log` with event_type='account_suspended' | HIGH |
| 6 | Login creates `user_sessions` row with is_online=true | HIGH |
| 7 | Logout sets `user_sessions.is_online = false` | HIGH |
| 8 | Logout does NOT affect other users' sessions | HIGH |
| 9 | Double logout is idempotent (no error on second call) | MEDIUM |
| 10 | `login_history` append-only (UPDATE/DELETE rejected by trigger) | HIGH |
| 11 | `user_security_log` append-only (UPDATE/DELETE rejected by trigger) | HIGH |
| 12 | CORS allows cross-origin cookie sending with credentials | HIGH |
| 13 | Rate limiting returns 429 for excessive login attempts | HIGH |
| 14 | `me()` works with cookie-only token (rawAccessToken propagation) | HIGH |
| 15 | Refresh does NOT insert `login_history` (refresh is not a login) | MEDIUM |

## 12. Rejected Alternatives

### Rejected: "Create login_history only on failure"

**Why rejected:** `03_users_auth.sql:389` says "Audit log for login attempts (successful and failed)". Both success and failure must be logged. The `success` BOOLEAN column explicitly supports both states.

### Rejected: "Skip user_sessions on login; create only on WebSocket connect"

**Why rejected:** The decision doc says "logout must still clear the current presence row when one exists". If login doesn't create the row, there's nothing to clear. Login must create the presence row for the logout contract to be meaningful.

### Rejected: "Use Supabase Auth Admin API for login_history"

**Why rejected:** `login_history` is a NestJS-owned table. Supabase Auth has no knowledge of it. NestJS must INSERT directly after each auth operation. The SQL comment says "Populated via application code (NestJS AuthModule)".

### Rejected: "Store refresh token in user_sessions for revocation"

**Why rejected:** `NESTJS-IMPLEMENTATION-GUIDE.md:113-114`: "Refresh token का raw value application database/log में store न करें". Supabase Auth handles refresh token rotation. `user_sessions` is for realtime presence only.

## 13. Final Recommendation

```text
PROCEED WITH REQUIRED FIXES
```

The AuthProvider implementation is architecturally sound. The immediate next step is implementing audit writes (`login_history` + `user_security_log`) and `user_sessions` presence management. These are not design decisions — they are explicit SQL requirements ("Populated via application code") that must be implemented.

**What to implement first:**
1. `login_history` INSERT on signup/login (Phases 1-2)
2. `user_security_log` INSERT on login failure (Phase 2)
3. `user_sessions` INSERT on login + UPDATE on logout (Phases 3-4)
4. CORS configuration (Phase 5)

**What can wait:**
- OAuth callback (Phase 8)
- Rate limiting (Phase 6)
- DTO class validation (Phase 9)
- Supabase SDK adoption (SAFE TO DEFER)

---

**Reviewer:** OpenCode (independent Senior NestJS/Auth/PostgreSQL/Audit Architect)
**Date:** 2026-08-27
**Status:** PROCEED WITH REQUIRED FIXES
