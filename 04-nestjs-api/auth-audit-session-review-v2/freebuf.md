# Auth Audit & Session — Independent Review v2

**Reviewer:** Freebuf (Independent Senior NestJS + PostgreSQL Security Architect)  
**Date:** 2026-08-27  
**Status:** REVIEW COMPLETE — NO CODE CHANGES  
**Focus:** Next audit/session implementation after v1 fixes

---

## 1. Executive Verdict

**⚠️ PROCEED TO AUDIT SLICE — 3 prior HIGH items FIXED, remaining gaps well-defined and bounded**

Previous v1 review found 3 HIGH + 4 MEDIUM issues. The 3 HIGH items (logout guard, refresh account check, rawAccessToken propagation) are now **all FIXED**. The remaining work is a well-scoped audit/session implementation slice: `login_history` writes, `user_security_log` writes, presence session lifecycle, and DTO validation. None of these are architecture defects — they are the **next implementation slice** as documented in the implementation report.

---

## 2. Previous v1 Fixes — Verified

| v1 Finding | v1 Severity | Current Status | Evidence |
|-----------|-------------|----------------|----------|
| S-1: Logout unauthenticated | HIGH | ✅ **FIXED** | `auth-provider.ts` L56: `@UseGuards(AuthGuard)` on logout method |
| S-4: Refresh no account status check | MEDIUM | ✅ **FIXED** | `auth-provider.ts` L50-55: same `status/deleted_at/locked_until` check as login |
| rawAccessToken not propagated | — | ✅ **FIXED** | `auth.ts` L23: `req.rawAccessToken = cookieToken \|\| headerToken` |
| Identity reads use rawAccessToken | — | ✅ **FIXED** | `identity-company.ts` L13: `this.userClient.queryAsUser(token, ...)` |
| Candidate reads use rawAccessToken | — | ✅ **FIXED** | `candidate.ts` L20: `this.userClient.queryAsUser(token, ...)` |
| Issuer/audience not wired | — | ✅ **FIXED** | `app.module.ts`: `AuthGuard` constructed with `{ issuer, audience }` |

**All 3 HIGH items from v1 are resolved.** No regressions detected.

---

## 3. Current Implementation Verification Table

### 3.1 AuthProviderController

| Check | Status | Line | Classification |
|-------|--------|------|----------------|
| `POST /auth/signup` — public, no guard | ✅ | L39 | VERIFIED |
| `POST /auth/login` — public, no guard | ✅ | L43 | VERIFIED |
| `POST /auth/refresh` — reads refresh cookie only | ✅ | L49 | VERIFIED |
| `POST /auth/logout` — `@UseGuards(AuthGuard)` | ✅ | L56 | VERIFIED |
| Login checks `status`, `deleted_at`, `locked_until` | ✅ | L45-46 | VERIFIED |
| Refresh checks `status`, `deleted_at`, `locked_until` | ✅ | L51-52 | VERIFIED |
| Cookie path isolation (access `/`, refresh `/api/v1/auth/refresh`) | ✅ | L37-38 | VERIFIED |
| HttpOnly + Secure + SameSite=Lax | ✅ | L37-38 | VERIFIED |
| Secure flag = false in dev/test | ✅ | L36 | VERIFIED |
| `clearCookie` matches `setSessionCookies` options | ✅ | L57-58 | VERIFIED |
| No manual `public.users` INSERT | ✅ | — | VERIFIED |
| No manual `candidate_profiles` INSERT | ✅ | — | VERIFIED |
| Service-role credential never in response | ✅ | — | VERIFIED |
| Raw tokens never in response body | ✅ | — | VERIFIED |

### 3.2 AuthGuard

| Check | Status | Line | Classification |
|-------|--------|------|----------------|
| Cookie token extracted first | ✅ | L21 | VERIFIED |
| Bearer header fallback | ✅ | L22-23 | VERIFIED |
| `rawAccessToken` stored on request | ✅ | L24 | VERIFIED |
| Fail-closed on all errors | ✅ | L15, L27 | VERIFIED |
| Issuer/audience options passed through | ✅ | L28 | VERIFIED |
| HS256 algorithm hardcoded | ✅ | `jwt-verifier.ts` L12 | VERIFIED |

### 3.3 UserContextClient

| Check | Status | Line | Classification |
|-------|--------|------|----------------|
| SELECT-only enforcement | ✅ | `clients.ts` L8 | VERIFIED |
| JWT claims decoded and set as `request.jwt.claims` | ✅ | `clients.ts` L10-12 | VERIFIED |
| Transaction wraps set_config + query | ✅ | `clients.ts` L12 | VERIFIED |

### 3.4 Candidate Service

| Check | Status | Line | Classification |
|-------|--------|------|----------------|
| `getOwnProfile` uses UserContextClient + rawAccessToken | ✅ | `candidate.ts` L20 | VERIFIED |
| `updateOwnProfile` uses SystemClient + transaction | ✅ | `candidate.ts` L78 | VERIFIED |
| Profile revision check with `FOR UPDATE` | ✅ | `candidate.ts` L80 | VERIFIED |
| `STALE_REVISION` on mismatch | ✅ | `candidate.ts` L83 | VERIFIED |
| Outbox event atomic with business write | ✅ | `candidate.ts` L91-93 | VERIFIED |
| `profile_change_history` atomic with business write | ✅ | `candidate.ts` L89 | VERIFIED |

---

## 4. `login_history` — Correct Design

### 4.1 SQL Schema

```sql
-- 03_users_auth.sql L354-386
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

### 4.2 Constraints (SQL-enforced)

| Constraint | Rule | Impact |
|-----------|------|--------|
| `login_history_result_consistency` | success=TRUE → failure_reason IS NULL; success=FALSE → failure_reason IS NOT NULL | Must set both consistently |
| `login_history_provider_consistency` | login_type IN ('oauth','sso') → auth_provider IS NOT NULL AND trimmed; else auth_provider IS NULL | Must set provider for OAuth only |
| `login_history_auth_provider_trimmed` | auth_provider must equal btrim(auth_provider) | Must trim before INSERT |
| Immutability trigger | UPDATE/DELETE rejected | Append-only — correct |

### 4.3 Enum Values

**`login_failure_reason`** (from `02_enums.sql` L78-88):
```
invalid_password, user_not_found, account_locked, email_not_verified,
too_many_attempts, suspended, banned, invalid_oauth_token, unknown
```

**`auth_login_type`** (from `02_enums.sql` L92-98):
```
email_password, magic_link, otp, oauth, sso
```

### 4.4 Required INSERT Mapping

| Scenario | `user_id` | `email` | `login_type` | `auth_provider` | `success` | `failure_reason` | `ip_address` | `user_agent` |
|----------|-----------|---------|-------------|-----------------|-----------|-------------------|-------------|-------------|
| Successful email login | `session.userId` | `body.email` | `email_password` | `NULL` | `TRUE` | `NULL` | `req.ip` | `req.headers['user-agent']` |
| Wrong password (Supabase 400) | `NULL` | `body.email` | `email_password` | `NULL` | `FALSE` | `invalid_password` | `req.ip` | `req.headers['user-agent']` |
| User not found (Supabase 400) | `NULL` | `body.email` | `email_password` | `NULL` | `FALSE` | `user_not_found` | `req.ip` | `req.headers['user-agent']` |
| Account locked | `session.userId` | `body.email` | `email_password` | `NULL` | `FALSE` | `account_locked` | `req.ip` | `req.headers['user-agent']` |
| Account suspended | `session.userId` | `body.email` | `email_password` | `NULL` | `FALSE` | `suspended` | `req.ip` | `req.headers['user-agent']` |
| Account banned | `session.userId` | `body.email` | `email_password` | `NULL` | `FALSE` | `banned` | `req.ip` | `req.headers['user-agent']` |
| Email not verified | `session.userId` | `body.email` | `email_password` | `NULL` | `FALSE` | `email_not_verified` | `req.ip` | `req.headers['user-agent']` |
| Deleted account | `session.userId` | `body.email` | `email_password` | `NULL` | `FALSE` | `unknown` | `req.ip` | `req.headers['user-agent']` |

### 4.5 Critical: `user_id` Can Be NULL for Failed Login

**`login_history.user_id` is nullable** (SQL: `UUID REFERENCES public.users(id) ON DELETE RESTRICT` — no NOT NULL). This is by design — when Supabase Auth returns 400 for wrong password or user not found, there is no `session.userId` to reference. The `email` column captures the attempted identity.

### 4.6 Implementation Gap

**Current code: ZERO `login_history` INSERTs.** The table exists, the enum exists, the constraints exist, but the application code never writes to it.

---

## 5. `user_security_log` — Correct Design

### 5.1 SQL Schema

```sql
-- 03_users_auth.sql L339-352
CREATE TABLE public.user_security_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    event_type  public.security_event_type NOT NULL,
    description TEXT,
    metadata    JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 5.2 Enum Values

**`security_event_type`** (from `02_enums.sql` L103-118):
```
password_changed, password_reset, email_verified, email_changed,
account_locked, account_unlocked, role_changed, mfa_enabled,
mfa_disabled, login_failed, account_suspended, account_reactivated,
account_deleted, phone_changed
```

### 5.3 Required INSERT Mapping for Auth Slice

| Trigger Event | `user_id` | `event_type` | `description` | `metadata` |
|--------------|-----------|-------------|---------------|------------|
| Failed login (any reason) | `NULL` if user_id unknown, else user ID | `login_failed` | "Failed login for {email}" | `{ email, failure_reason, ip }` |
| Account locked (too many attempts) | user ID | `account_locked` | "Account locked" | `{ locked_until }` |
| Successful email verification | user ID | `email_verified` | "Email verified" | `{ verified_at }` |

**Note:** `user_security_log.user_id` is NOT NULL (unlike `login_history`). For `login_failed` events where user_id is unknown (wrong password/user not found), the event cannot be written to `user_security_log` because there is no user_id. This is correct — `login_failed` in `user_security_log` is for tracking repeated failures against a known user, not for unknown-email attempts.

### 5.4 Constraints

- Append-only (trigger rejects UPDATE/DELETE)
- `metadata` must be JSONB object
- Never store secrets/raw tokens in metadata

### 5.5 Implementation Gap

**Current code: ZERO `user_security_log` INSERTs.**

---

## 6. Presence Session — Correct Design

### 6.1 SQL Schema

```sql
-- 03_users_auth.sql L268-289
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

### 6.2 SQL Purpose

`03_users_auth.sql` L268: "Purpose: Active user session tracking for real-time features. Used for WebSocket connections and live presence. **This is NOT for auth sessions (Supabase Auth handles those).**"

### 6.3 Recommended Lifecycle

| Event | Operation | SQL |
|-------|-----------|-----|
| Login | INSERT `user_sessions` | `INSERT INTO user_sessions (user_id, is_online, device_type, user_agent) VALUES ($1, true, $2, $3)` |
| Refresh | UPDATE `last_seen_at` | `UPDATE user_sessions SET last_seen_at = NOW() WHERE user_id = $1 AND is_online = true` |
| Logout | Deactivate current row | `UPDATE user_sessions SET is_online = false, socket_id = NULL WHERE user_id = $1 AND is_online = true` |
| WebSocket connect | UPDATE `socket_id` | `UPDATE user_sessions SET socket_id = $2 WHERE user_id = $1 AND is_online = true` |
| WebSocket disconnect | Deactivate row | `UPDATE user_sessions SET is_online = false, socket_id = NULL WHERE socket_id = $1` |

### 6.4 Device Type Extraction

Express request provides:
- `req.headers['user-agent']` → `user_agent` column
- Device type can be derived from user-agent string (desktop/mobile/tablet)
- Or left as `NULL` for simple implementation

### 6.5 Implementation Gap

**Current code:**
- Login: No INSERT into `user_sessions`
- Refresh: No UPDATE of `last_seen_at`
- Logout: Only clears cookies, no session row update
- `IdentityController.sessions()` and `.revoke()` exist but return empty results (no rows created)

---

## 7. IP Address and User-Agent Capture

### 7.1 Express Request Properties

| Property | Source | Notes |
|----------|--------|-------|
| `req.ip` | Express built-in | Returns client IP; respects `trust proxy` setting |
| `req.headers['user-agent']` | HTTP header | May be absent or spoofed |
| `req.headers['x-forwarded-for']` | Reverse proxy | Only present behind load balancer |

### 7.2 Recommended Approach

- `ip_address`: Use `req.ip` (Express resolves behind trust proxy)
- `user_agent`: Use `req.headers['user-agent'] ?? null`
- Both are optional in the SQL schema (nullable)

### 7.3 Implementation Gap

**Current code: Neither `req.ip` nor `req.headers['user-agent']` are captured in any auth endpoint.**

---

## 8. Account Lockout Behavior

### 8.1 Current State

| Check | Status | Evidence |
|-------|--------|----------|
| `locked_until` column exists | ✅ | `03_users_auth.sql` L117 |
| Login checks `locked_until > NOW()` | ✅ | `auth-provider.ts` L46 |
| Refresh checks `locked_until > NOW()` | ✅ | `auth-provider.ts` L52 |
| `locked_until` is ever SET by application code | ❌ | No UPDATE to `users.locked_until` anywhere |
| `locked_until` index exists | ✅ | `03_users_auth.sql` L441: `idx_users_locked_until` |

### 8.2 Required Lockout Policy

The lockout mechanism needs:
1. Track failed login count per user (in-memory, Redis, or DB)
2. After N failures within time window, SET `locked_until = NOW() + interval`
3. Write `account_locked` to `user_security_log`
4. Reset count on successful login

**Current implementation:** Login checks `locked_until` but never sets it. The column is dead code until lockout logic is implemented.

---

## 9. Transaction Boundaries

### 9.1 Current Auth Endpoints

| Endpoint | External Call | DB Call | Transaction? | Correct? |
|----------|-------------|---------|-------------|----------|
| Signup | Supabase Auth `/signup` | None (trigger) | No | ✅ Correct — external call outside TX |
| Login | Supabase Auth `/token` | `SELECT status...` | No | ✅ Correct — external call outside TX |
| Refresh | Supabase Auth `/token` | `SELECT status...` | No | ✅ Correct — external call outside TX |
| Logout | None | None | No | ✅ Correct |

### 9.2 Future Audit Writes

When `login_history` and `user_security_log` writes are added:
- Audit writes should be in the **same DB transaction** as any business state change
- But login itself is just Supabase Auth call + cookie set — no business state change
- **Recommendation:** Audit writes can be standalone (non-transactional) since they are append-only and idempotent by UUID

### 9.3 Presence Session Writes

| Operation | Should be in TX? | Reason |
|-----------|------------------|--------|
| Login INSERT | Optional | Single INSERT, no rollback needed |
| Refresh UPDATE | Optional | Single UPDATE, best-effort |
| Logout UPDATE | Optional | Single UPDATE, best-effort |

**Conclusion:** No transaction boundary issues. All external calls (Supabase Auth) are outside DB transactions. Audit writes are append-only and don't require transactional wrapping.

---

## 10. PII/Token/Password Leakage

| Risk | Status | Evidence |
|------|--------|----------|
| Password in logs | ✅ SAFE | `SafeLogger.redact()` catches `password=...` patterns |
| Access token in logs | ✅ SAFE | `SafeLogger.redact()` catches `bearer ...` patterns |
| Refresh token in logs | ✅ SAFE | Never logged; only read from cookie |
| Service-role key in response | ✅ SAFE | Never exposed in any response |
| `SUPABASE_SERVICE_ROLE_KEY` in fetch header | ✅ SAFE | Server-side only; never sent to browser |
| Password in login_history | ✅ SAFE | `login_history` has no password column |
| Password in user_security_log | ✅ SAFE | `user_security_log` has no password column |
| JWT claims in `request.jwt.claims` | ✅ SAFE | Set via `set_config` in transaction; not exposed |

**No PII/token/password leakage paths identified.**

---

## 11. CORS, Rate Limiting, DTO Validation — Block Assessment

| Gap | Blocks Audit Slice? | Blocks Production? | Priority |
|-----|--------------------|--------------------|----------|
| CORS configuration | ❌ No | ⚠️ Yes — browser requests from different origin blocked | MEDIUM |
| Rate limiting | ❌ No | ⚠️ Yes — brute force possible | MEDIUM |
| DTO class-validator decorators | ❌ No | ⚠️ Yes — no email format validation, no password min-length | MEDIUM |
| `login_history` writes | ❌ No | ❌ Yes — security audit requirement | HIGH |
| `user_security_log` writes | ❌ No | ❌ Yes — security audit requirement | HIGH |
| Presence session lifecycle | ❌ No | ❌ Yes — `IdentityController.sessions()` returns empty | HIGH |

**None of these block the audit slice.** The audit slice (`login_history` + `user_security_log` writes) can be implemented independently. CORS, rate limiting, and DTO validation are parallel tracks.

---

## 12. Invented Tables/Columns/Events Check

| Item | Invented? | Evidence |
|------|-----------|----------|
| `login_history` table | ❌ No | `03_users_auth.sql` L354 |
| `user_security_log` table | ❌ No | `03_users_auth.sql` L339 |
| `user_sessions` table | ❌ No | `03_users_auth.sql` L268 |
| `login_failure_reason` enum | ❌ No | `02_enums.sql` L78 |
| `security_event_type` enum | ❌ No | `02_enums.sql` L103 |
| `auth_login_type` enum | ❌ No | `02_enums.sql` L92 |
| Any new column | ❌ No | All columns exist in baseline |
| Any new table | ❌ No | All tables exist in baseline |
| Any new event type | ❌ No | No outbox events in auth slice |
| Any new route | ❌ No | All routes frozen in Phase 09-B |

**Zero inventions.** All recommendations use existing schema objects only.

---

## 13. Implementation Order

```
1. login_history INSERT on every login attempt (success + failure)
   - Capture ip_address and user_agent from request
   - Map failure reasons to exact enum values
   - user_id nullable for unknown-user failures

2. user_security_log INSERT on login_failed (known user only)
   - Only when user_id is known (account locked/suspended/banned)
   - event_type = 'login_failed'

3. Account lockout: SET locked_until after N failures
   - Track failure count (in-memory or DB)
   - Write user_security_log event_type = 'account_locked'

4. Presence session lifecycle
   - Login → INSERT user_sessions
   - Refresh → UPDATE last_seen_at
   - Logout → UPDATE is_online = false

5. DTO class-validator decorators (parallel track)
6. CORS configuration (parallel track)
7. Rate limiting (parallel track)
```

---

## 14. Required Tests

### 14.1 Audit Tests

| # | Test | Validates |
|---|------|-----------|
| T-1 | Successful login → `login_history` row with `success=TRUE, failure_reason=NULL, login_type='email_password'` | Audit write |
| T-2 | Failed login (wrong password) → `login_history` with `failure_reason='invalid_password', user_id=NULL` | Failure audit, nullable user_id |
| T-3 | Failed login (user not found) → `login_history` with `failure_reason='user_not_found'` | User-not-found audit |
| T-4 | Login with locked account → `login_history` with `failure_reason='account_locked'` | Lockout audit |
| T-5 | `login_history` is append-only (UPDATE/DELETE rejected by trigger) | Immutability |
| T-6 | `user_security_log` appended on `account_locked` event | Security audit |
| T-7 | `user_security_log` is append-only | Immutability |
| T-8 | `login_history.ip_address` and `user_agent` are captured | Context capture |

### 14.2 Session Tests

| # | Test | Validates |
|---|------|-----------|
| T-9 | Login → `user_sessions` row created with `is_online=true` | Presence creation |
| T-10 | Refresh → `user_sessions.last_seen_at` updated | Presence heartbeat |
| T-11 | Logout → `user_sessions.is_online = false` | Presence cleanup |
| T-12 | `GET /auth/sessions` returns login-created rows | Session listing |
| T-13 | `POST /auth/sessions/revoke` clears selected row | Session revoke |

### 14.3 Lockout Tests

| # | Test | Validates |
|---|------|-----------|
| T-14 | 5 failed logins → `locked_until` set, `user_security_log` event | Lockout activation |
| T-15 | Login after lockout expiry → success | Lockout expiry |
| T-16 | Login during lockout → `failure_reason='account_locked'` | Lockout enforcement |

### 14.4 Negative Tests

| # | Test | Validates |
|---|------|-----------|
| T-17 | Concurrent login attempts → correct audit rows for each | Concurrent audit |
| T-18 | Refresh with suspended account → 401, no new cookie | S-4 fix verified |
| T-19 | Unauthenticated logout → 401 (after guard) | S-1 fix verified |

---

## 15. Verdict Summary

| Category | Status |
|----------|--------|
| **v1 HIGH fixes** | ✅ All 3 FIXED (logout guard, refresh check, rawAccessToken) |
| **AuthProvider boundary** | ✅ Correct |
| **Cookie contract** | ✅ Correct |
| **Trigger ownership** | ✅ Correct |
| **Account status checks** | ✅ Login + Refresh |
| **Audit logging** | ❌ ABSENT — next slice |
| **Presence lifecycle** | ❌ DISCONNECTED — next slice |
| **Account lockout** | ⚠️ Check exists, set never happens — next slice |
| **CORS** | ❌ MISSING — parallel track |
| **Rate limiting** | ❌ MISSING — parallel track |
| **DTO validation** | ⚠️ Minimal — parallel track |
| **BLOCKERs** | ✅ Zero architecture blockers |
| **Inventions** | ✅ Zero invented objects |
| **Tests real** | ✅ 16 suites, 38 tests pass |

**Previous v1 HIGH items are all fixed. The audit/session slice is unblocked and well-scoped. Proceed with `login_history` + `user_security_log` writes + presence session lifecycle as the next implementation slice.**

---

*Report generated: 2026-08-27*  
*Reviewer: Freebuf*  
*No source code, SQL or existing documents modified during this review.*
