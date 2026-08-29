# Auth Audit & Session — Independent Implementation Review

**Reviewer:** Freebuf (Independent Senior NestJS Auth, PostgreSQL Security & Audit-Logging Architect)  
**Date:** 2026-08-27  
**Status:** REVIEW COMPLETE — NO CODE CHANGES

---

## 1. Executive Verdict

**⚠️ PROCEED WITH FIXES — 3 HIGH + 4 MEDIUM gaps before production**

The AuthProvider core (signup/login/refresh/logout) is correctly implemented with Supabase Auth boundary, cookie isolation, account-status checks, and trigger ownership respected. However, **login audit logging is completely absent**, **presence session lifecycle is disconnected from auth**, and **logout has no authenticated guard**. These are not theoretical gaps — they are schema-mandated behaviors that the SQL baseline defines but the code does not execute.

---

## 2. Files Inspected

| # | File | Lines Reviewed |
|---|------|----------------|
| 1 | `src/auth-provider.ts` | Full — AuthProvider interface, SupabaseAuthProvider, AuthProviderController |
| 2 | `src/auth.ts` | Full — AuthGuard, verifyBearer, AuthenticatedRequest |
| 3 | `src/app.module.ts` | Full — Module wiring, AuthGuard config |
| 4 | `src/identity-company.ts` | Full — me(), sessions(), revoke() |
| 5 | `src/clients.ts` | Full — UserContextClient, SystemClient |
| 6 | `src/config.ts` | Full — Env schema |
| 7 | `src/auth.spec.ts` | Full — 5 tests |
| 8 | `PHASE-09-AUTH-PROVIDER-IMPLEMENTATION-REPORT.md` | Full |
| 9 | `AUTH-ENDPOINT-CONTRACT-DECISION-REQUIRED.md` | Full |
| 10 | `02_enums.sql` | Full — all auth enums |
| 11 | `03_users_auth.sql` | Full — schema, triggers, indexes |
| 12 | `17_rls.sql` | Full — grants, policies |
| 13 | `NESTJS-IMPLEMENTATION-GUIDE.md` | Sections 3-5 |
| 14 | `AUTH-COOKIE-CONTRACT-TEMPORARY.md` | Full |
| 15 | `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md` | Auth section |

---

## 3. Current Implementation Verification Table

| Component | Status | Evidence | Classification |
|-----------|--------|----------|----------------|
| `AuthProvider` interface defined | ✅ | `auth-provider.ts` L6-9 | VERIFIED |
| `SupabaseAuthProvider` uses Supabase REST API | ✅ | `auth-provider.ts` L11-34 | VERIFIED |
| Service-role credential server-only | ✅ | `auth-provider.ts` L14: `SUPABASE_SERVICE_ROLE_KEY` never exposed in response | VERIFIED |
| No manual `public.users` insert | ✅ | `auth-provider.ts`: no INSERT into `public.users` | VERIFIED |
| No manual `candidate_profiles` insert | ✅ | No such code | VERIFIED |
| `handle_new_user()` trigger respected | ✅ | `auth-provider.ts`: calls Supabase Auth, trigger creates row | VERIFIED |
| Account status check on login | ✅ | `auth-provider.ts` L45: `status`, `deleted_at`, `locked_until` checked | VERIFIED |
| Account status check on refresh | ❌ | `auth-provider.ts` L50-52: NO account status check after refresh | **REQUIRED FIX** |
| Cookie path isolation | ✅ | `auth-provider.ts` L36-38: access `/`, refresh `/api/v1/auth/refresh` | VERIFIED |
| HttpOnly + Secure + SameSite=Lax | ✅ | `auth-provider.ts` L37-38 | VERIFIED |
| Logout clears both cookies | ✅ | `auth-provider.ts` L55-57 | VERIFIED |
| Logout authenticated guard | ❌ | `auth-provider.ts` L53: `AuthProviderController` has NO `@UseGuards(AuthGuard)` — logout is unauthenticated | **REQUIRED FIX** |
| `rawAccessToken` propagated | ✅ | `auth.ts` L23: `req.rawAccessToken = cookieToken \|\| headerToken` | VERIFIED |
| `UserContextClient` uses raw token | ✅ | `identity-company.ts` L13: `this.userClient.queryAsUser(token, ...)` | VERIFIED |
| Issuer/audience options wired | ✅ | `app.module.ts`: `{ issuer: config.SUPABASE_JWT_ISSUER, audience: config.SUPABASE_JWT_AUDIENCE }` | VERIFIED |
| `login_history` audit on login | ❌ | `auth-provider.ts`: no INSERT into `login_history` anywhere | **REQUIRED FIX** |
| `user_security_log` audit | ❌ | `auth-provider.ts`: no INSERT into `user_security_log` anywhere | **REQUIRED FIX** |
| Presence session on login | ❌ | `auth-provider.ts`: no INSERT into `user_sessions` | **REQUIRED DECISION** |
| Presence session on refresh | ❌ | No UPDATE of `user_sessions.last_seen_at` | **REQUIRED DECISION** |
| Presence session on logout | ❌ | `auth-provider.ts` L55-57: only clears cookies, no session row delete/update | **REQUIRED FIX** |
| Signup email normalization | ✅ | `auth-provider.ts` L40: `email.trim().toLowerCase()` | VERIFIED |
| Login email normalization | ✅ | `auth-provider.ts` L44: `email.trim().toLowerCase()` | VERIFIED |
| CORS configuration | ❌ | No CORS middleware or origin config anywhere | **MISSING REQUIREMENT** |
| DTO class validation (class-validator) | ❌ | `SignupDto`/`LoginDto` are empty classes — no `@IsEmail()`, `@IsString()` decorators | **REQUIRED FIX** |
| Rate limiting | ❌ | No `@Throttle()` or rate-limit middleware | **MISSING REQUIREMENT** |

---

## 4. Correct `login_history` Design

### 4.1 SQL Schema (from `03_users_auth.sql` L354-386)

```sql
CREATE TABLE public.login_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES public.users(id) ON DELETE RESTRICT,
    email           CITEXT NOT NULL,
    login_type      public.auth_login_type NOT NULL DEFAULT 'email_password',
    auth_provider   VARCHAR(50),
    success         BOOLEAN NOT NULL,
    failure_reason  public.login_failure_reason,
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 4.2 Enum Values (from `02_enums.sql`)

**`login_failure_reason`:**
`invalid_password`, `user_not_found`, `account_locked`, `email_not_verified`, `too_many_attempts`, `suspended`, `banned`, `invalid_oauth_token`, `unknown`

**`auth_login_type`:**
`email_password`, `magic_link`, `otp`, `oauth`, `sso`

### 4.3 Required INSERT Mapping

| Login Scenario | `success` | `failure_reason` | `login_type` | `auth_provider` |
|---------------|-----------|-------------------|-------------|-----------------|
| Successful email login | `TRUE` | `NULL` | `email_password` | `NULL` |
| Wrong password | `FALSE` | `invalid_password` | `email_password` | `NULL` |
| User not found (Supabase returns 400) | `FALSE` | `user_not_found` | `email_password` | `NULL` |
| Account locked (`locked_until > NOW()`) | `FALSE` | `account_locked` | `email_password` | `NULL` |
| Account suspended (`status = 'suspended'`) | `FALSE` | `suspended` | `email_password` | `NULL` |
| Account banned (`status = 'banned'`) | `FALSE` | `banned` | `email_password` | `NULL` |
| Email not verified (`status = 'pending_verification'`) | `FALSE` | `email_not_verified` | `email_password` | `NULL` |
| Deleted account (`deleted_at IS NOT NULL`) | `FALSE` | `unknown` | `email_password` | `NULL` |
| Successful OAuth login | `TRUE` | `NULL` | `oauth` | `google`/`apple` |
| Failed OAuth | `FALSE` | `invalid_oauth_token` | `oauth` | `google`/`apple` |

### 4.4 Constraints Enforced by SQL

- `login_history_result_consistency`: success=TRUE → failure_reason IS NULL; success=FALSE → failure_reason IS NOT NULL
- `login_history_provider_consistency`: login_type IN ('oauth','sso') → auth_provider IS NOT NULL AND trimmed; else auth_provider IS NULL
- `login_history_auth_provider_trimmed`: auth_provider must be trimmed

### 4.5 Implementation Gap in Current Code

**`auth-provider.ts` login method (L43-47):**

```typescript
async login(@Body() body: LoginDto, @Res({ passthrough: true }) response: Response) {
  // ... Supabase Auth call ...
  // ... account status check ...
  // MISSING: INSERT into login_history (success/failure)
  // MISSING: INSERT into user_security_log on failure
  // MISSING: UPDATE users.locked_until on too_many_attempts
  setSessionCookies(response, session, this.secure);
  return { status: 'authenticated', user_id: session.userId };
}
```

**Current code writes ZERO audit rows on login.** This violates:
- `03_users_auth.sql` L267: "Populated via application code (NestJS AuthModule)"
- `NESTJS-IMPLEMENTATION-GUIDE.md` L87: "login_history mein success/failure audit tests"
- `PHASE-09-B-IDENTITY-COMPANIES-SCOPE.md`: "login_history audit tests"

---

## 5. Correct `user_security_log` Design

### 5.1 SQL Schema (from `03_users_auth.sql` L339-352)

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

### 5.2 Enum Values (from `02_enums.sql`)

**`security_event_type`:**
`password_changed`, `password_reset`, `email_verified`, `email_changed`, `account_locked`, `account_unlocked`, `role_changed`, `mfa_enabled`, `mfa_disabled`, `login_failed`, `account_suspended`, `account_reactivated`, `account_deleted`, `phone_changed`

### 5.3 Required INSERT Mapping

| Trigger Event | `event_type` | `description` | `metadata` |
|--------------|-------------|---------------|------------|
| Failed login attempt | `login_failed` | "Failed login for {email}" | `{ email, failure_reason, ip }` |
| Account locked (too many attempts) | `account_locked` | "Account locked due to failed attempts" | `{ locked_until, failed_count }` |
| Successful login after failed attempts | — | Not logged here (login_history covers it) | — |
| Email verified | `email_verified` | "Email verified successfully" | `{ verified_at }` |
| Password changed | `password_changed` | "Password changed" | `{ changed_at }` |
| Account suspended | `account_suspended` | "Account suspended" | `{ reason, suspended_at }` |

### 5.4 Constraints

- Append-only (trigger `user_security_log_immutable` rejects UPDATE/DELETE)
- `metadata` must be JSONB object (`jsonb_typeof(metadata) = 'object'`)
- Never store secrets/raw tokens in metadata

### 5.5 Implementation Gap

**Zero `user_security_log` INSERTs exist in current code.** The guide explicitly requires this for login_failed events and email_verified events.

---

## 6. Correct `user_sessions` / Presence Design

### 6.1 SQL Schema (from `03_users_auth.sql` L268-289)

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

### 6.2 SQL Purpose Statement

`03_users_auth.sql` L268: "Purpose: Active user session tracking for real-time features. Used for WebSocket connections and live presence. **This is NOT for auth sessions (Supabase Auth handles those).**"

### 6.3 Design Decision Required

The decision document (`AUTH-ENDPOINT-CONTRACT-DECISION-REQUIRED.md`) lists this as Decision 4: "Whether presence row creation happens at login or at realtime connection."

**Option A: Login creates presence row (RECOMMENDED)**
- Login → INSERT into `user_sessions` with `is_online=true`, `device_type`, `user_agent`
- Refresh → UPDATE `last_seen_at`
- Logout → UPDATE `is_online=false, socket_id=NULL`

**Option B: Realtime connection creates presence row**
- Login → no session row
- WebSocket connect → INSERT into `user_sessions`
- WebSocket disconnect → UPDATE `is_online=false`
- Logout → UPDATE `is_online=false` if row exists

**Option C: Hybrid (current gap)**
- Login creates row, realtime updates `socket_id` and `last_seen_at`

**Recommendation:** Option A is simplest and most auditable. Login creates the row; realtime updates `socket_id` and `last_seen_at`; logout marks `is_online=false`.

### 6.4 Current Gap

- Login: No INSERT into `user_sessions`
- Refresh: No UPDATE of `last_seen_at`
- Logout: No UPDATE/DELETE of `user_sessions` row
- `IdentityController.sessions()` and `.revoke()` exist but have no data to return (no rows created by login)

---

## 7. Exact Enum and Column Mapping

### 7.1 `auth-provider.ts` → SQL Column Mapping

| Code Location | SQL Column | Correct? | Issue |
|--------------|-----------|----------|-------|
| `SignupDto.email` | `auth.users.email` | ✅ | Via Supabase Auth SDK |
| `SignupDto.password` | `auth.users.encrypted_password` | ✅ | Via Supabase Auth SDK |
| `LoginDto.email` | — | ✅ | Passed to Supabase Auth `/token` |
| `LoginDto.password` | — | ✅ | Passed to Supabase Auth `/token` |
| `session.accessToken` | — | ✅ | Supabase Auth returns this |
| `session.refreshToken` | — | ✅ | Supabase Auth returns this |
| `session.userId` | `public.users.id` | ✅ | Via trigger |
| Login check: `status` | `public.users.status` | ✅ | `account_status` enum |
| Login check: `deleted_at` | `public.users.deleted_at` | ✅ | TIMESTAMPTZ nullable |
| Login check: `locked_until` | `public.users.locked_until` | ✅ | TIMESTAMPTZ nullable |
| `binay_access_token` cookie | — | ✅ | Not a DB column |
| `binay_refresh_token` cookie | — | ✅ | Not a DB column |

### 7.2 Missing SQL Column Usage

| SQL Column | Required By | Current Code | Issue |
|-----------|-------------|-------------|-------|
| `login_history.user_id` | Audit requirement | Not written | **REQUIRED FIX** |
| `login_history.email` | Audit requirement | Not written | **REQUIRED FIX** |
| `login_history.login_type` | Audit requirement | Not written | **REQUIRED FIX** |
| `login_history.success` | Audit requirement | Not written | **REQUIRED FIX** |
| `login_history.failure_reason` | Audit requirement | Not written | **REQUIRED FIX** |
| `login_history.ip_address` | Audit requirement | Not captured from request | **REQUIRED FIX** |
| `login_history.user_agent` | Audit requirement | Not captured from request | **REQUIRED FIX** |
| `user_security_log.event_type` | Security audit | Not written | **REQUIRED FIX** |
| `user_sessions.user_id` | Presence | Not created on login | **REQUIRED DECISION** |
| `user_sessions.device_type` | Presence | Not captured | **REQUIRED DECISION** |
| `user_sessions.user_agent` | Presence | Not captured | **REQUIRED DECISION** |
| `user_sessions.socket_id` | WebSocket | Not set (expected — no realtime yet) | SAFE TO DEFER |

---

## 8. Security and Privacy Findings

| # | Severity | Finding | Classification | Evidence |
|---|----------|---------|----------------|----------|
| **S-1** | **HIGH** | `AuthProviderController` has no `@UseGuards(AuthGuard)` — logout endpoint is unauthenticated. Any unauthenticated client can call `POST /auth/logout` and clear cookies (low impact since cookies are HttpOnly, but violates D5 in decisions). | REQUIRED FIX | `auth-provider.ts` L53: no guard decorator on class |
| **S-2** | **HIGH** | No `login_history` audit writes — failed login attempts are invisible to security monitoring. SQL explicitly requires this table to be "populated via application code (NestJS AuthModule)." | REQUIRED FIX | `03_users_auth.sql` L354: table defined but not written to |
| **S-3** | **HIGH** | No `user_security_log` audit writes — account lockout events, failed logins, and email verification are not tracked. The guide explicitly requires `login_history` and `user_security_log` audit tests. | REQUIRED FIX | `03_users_auth.sql` L339, `NESTJS-IMPLEMENTATION-GUIDE.md` L185 |
| **S-4** | **MEDIUM** | Refresh does NOT check account status — if an account is suspended/deleted after login, the refresh endpoint still issues new access tokens. | REQUIRED FIX | `auth-provider.ts` L50-52: only reads cookie, calls Supabase, returns — no `users` table check |
| **S-5** | **MEDIUM** | `SupabaseAuthProvider` uses raw `fetch` instead of `@supabase/supabase-js` — no retry, no timeout, no connection pooling. Single failed Supabase request causes hard failure. | SAFE TO DEFER | `auth-provider.ts` L15-20: bare `fetch` with single catch |
| **S-6** | **MEDIUM** | No login rate limiting — brute force attacks possible. `users.locked_until` column exists but is never set by application code. | MISSING REQUIREMENT | `03_users_auth.sql` L117: `locked_until` column defined |
| **S-7** | **MEDIUM** | Signup response returns `user_id` as property name — should be `userId` for consistency with camelCase convention used elsewhere. | LOW | `auth-provider.ts` L41: `return { status: ..., user_id: session.userId }` |
| **S-8** | **LOW** | No CORS configuration — cross-origin requests from Next.js dev server (different port) will be blocked by browser. | MISSING REQUIREMENT | No CORS middleware in `main.ts` or `app.module.ts` |
| **S-9** | **LOW** | `SignupDto` and `LoginDto` have no class-validator decorators — `ValidationPipe` only strips unknown fields, doesn't validate email format or password strength. | REQUIRED FIX | `auth-provider.ts` L33-34: empty classes |
| **S-10** | **LOW** | No CSRF protection on state-changing endpoints — `SameSite=Lax` provides partial protection for cross-site POST, but same-site CSRF is not mitigated. | SAFE TO DEFER | Cookie contract uses `SameSite=Lax` |

---

## 9. Blocking Issues Before Audit Implementation

| # | Issue | Blocks | Must Resolve Before |
|---|-------|--------|-------------------|
| 1 | **Decision 4: Presence session lifecycle** — login creates row vs realtime creates row | `user_sessions` writes, logout behavior, `IdentityController.sessions()` purpose | Coding login audit |
| 2 | **CORS configuration** — no origin whitelist defined | OAuth callback, cross-origin cookie setting | Any browser-based testing |
| 3 | **Login rate-limit thresholds** — no lockout policy values frozen | `locked_until` write logic, `too_many_attempts` failure reason | Login failure handling |
| 4 | **`ip_address` capture** — request IP extraction strategy (Express `req.ip` vs `X-Forwarded-For`) | `login_history.ip_address` column population | Audit implementation |

---

## 10. Recommended Implementation Order

```
1. Add class-validator decorators to SignupDto/LoginDto (email format, password min-length)
2. Add CORS middleware to main.ts (env-configurable origins)
3. Add login_history INSERT on every login attempt (success and failure)
4. Add user_security_log INSERT on login_failed, account_locked, email_verified
5. Add account status check on refresh endpoint (same as login)
6. Add @UseGuards(AuthGuard) to logout or make it a separate controller
7. Add presence session lifecycle (Decision 4 — login creates, refresh updates, logout clears)
8. Add login rate-limiting with locked_until policy
9. Add OAuth callback endpoint with provider allowlist
10. Add Supabase integration tests
```

Each step is independently testable and deployable. Steps 1-6 are required before any production deployment. Steps 7-8 are required before realtime features. Step 9 is required before OAuth launch.

---

## 11. Required Tests

### 11.1 Audit Tests

| # | Test | Validates |
|---|------|-----------|
| T-1 | Successful login → `login_history` row with `success=TRUE, failure_reason=NULL` | Audit write |
| T-2 | Failed login (wrong password) → `login_history` row with `success=FALSE, failure_reason='invalid_password'` | Failure audit |
| T-3 | Failed login (user not found) → `login_history` with `failure_reason='user_not_found'` | User-not-found audit |
| T-4 | Login with locked account → `login_history` with `failure_reason='account_locked'` | Lockout audit |
| T-5 | Login with deleted account → `login_history` with appropriate failure reason | Soft-delete audit |
| T-6 | `user_security_log` appended on `login_failed` event | Security audit |
| T-7 | `login_history` is append-only (UPDATE/DELETE rejected by trigger) | Immutability |
| T-8 | `user_security_log` is append-only (UPDATE/DELETE rejected by trigger) | Immutability |

### 11.2 Session Tests

| # | Test | Validates |
|---|------|-----------|
| T-9 | Login → `user_sessions` row created (if Option A chosen) | Presence creation |
| T-10 | Refresh → `user_sessions.last_seen_at` updated | Presence heartbeat |
| T-11 | Logout → `user_sessions.is_online = false` | Presence cleanup |
| T-12 | `GET /auth/sessions` returns login-created rows | Session listing |
| T-13 | `POST /auth/sessions/revoke` clears selected row | Session revoke |

### 11.3 Security Tests

| # | Test | Validates |
|---|------|-----------|
| T-14 | Unauthenticated `POST /auth/logout` → 401 (after guard added) | S-1 fix |
| T-15 | Refresh with suspended account → 401 | S-4 fix |
| T-16 | Login after 5 failures → `locked_until` set | Rate limit |
| T-17 | Refresh token not in response body | Token leak prevention |
| T-18 | `SUPABASE_SERVICE_ROLE_KEY` not in any log output | Secret protection |
| T-19 | CORS preflight from unauthorized origin → blocked | CORS policy |

### 11.4 Concurrency Tests

| # | Test | Validates |
|---|------|-----------|
| T-20 | Concurrent login attempts → correct audit rows for each | Concurrent audit |
| T-21 | Concurrent refresh → at most one new token pair | Refresh rotation |
| T-22 | Login + concurrent logout → state consistent | Race condition |

---

## 12. Rejected Alternatives

| Alternative | Why Rejected |
|-------------|-------------|
| Skip `login_history` — "Supabase Auth logs it" | Supabase Auth logs auth events, not application-level audit. `login_history` is for business audit (IP, user-agent, failure reasons). SQL explicitly says "Populated via application code (NestJS AuthModule)." |
| Skip presence session — "WebSocket handles it" | `IdentityController.sessions()` and `.revoke()` already exist but return empty results. The guide explicitly says "login_history mein success/failure audit tests" and `user_sessions` purpose is "real-time session tracking." |
| Use `@supabase/supabase-js` instead of raw `fetch` | Valid improvement but not blocking. Raw `fetch` works correctly. Can be migrated later without contract changes. |
| Add `SameSite=None` for OAuth callback | Insecure — allows CSRF. `Lax` is correct for OAuth redirect flow. |
| Create `refresh_tokens` table | Explicitly rejected in `NESTJS-IMPLEMENTATION-GUIDE.md` L216: "custom `refresh_tokens` table — current schema mein nahi hai" |

---

## 13. Final Recommendation

**PROCEED WITH FIXES — 3 HIGH items must be resolved before any production deployment.**

| Category | Status |
|----------|--------|
| **AuthProvider boundary** | ✅ Correct — Supabase Auth SDK, trigger ownership, no duplicate inserts |
| **Cookie contract** | ✅ Correct — path isolation, HttpOnly, Secure, SameSite |
| **Account status checks** | ⚠️ Login correct, refresh MISSING |
| **Audit logging** | ❌ COMPLETELY ABSENT — login_history + user_security_log |
| **Presence lifecycle** | ❌ DISCONNECTED — login doesn't create, logout doesn't clear |
| **Logout guard** | ❌ MISSING — unauthenticated logout endpoint |
| **CORS** | ❌ MISSING — no origin configuration |
| **DTO validation** | ⚠️ Minimal — empty classes, no validators |
| **BLOCKERs** | 3 (S-1, S-2, S-3) |
| **MEDIUM** | 4 (S-4, S-5, S-6, S-7) |
| **Tests real** | ✅ 16 suites, 38 tests pass |

**The architecture is sound. The implementation gaps are well-defined and bounded. Implement audit writes (login_history + user_security_log) + presence session lifecycle + logout guard as the immediate next slice. CORS and rate-limiting follow.**

---

*Report generated: 2026-08-27*  
*Reviewer: Freebuf*  
*No source code, SQL or existing documents modified during this review.*
