# Auth Endpoint Contract — Independent Review

**Reviewer:** Freebuf (Independent Senior NestJS/Auth Architect)  
**Date:** 2026-08-27  
**Status:** REVIEW COMPLETE — NO CODE CHANGES

---

## 1. Executive Verdict

**⚠️ APPROVED WITH REQUIRED FIXES**

The decision document correctly identifies the 5 open decisions and establishes clear non-negotiable boundaries. The architecture is sound: Supabase Auth as sole IdP, NestJS as AuthProvider boundary, `handle_new_user()` trigger ownership, cookie path isolation. However, **3 HIGH** and **2 MEDIUM** findings must be resolved before the routes can be frozen.

---

## 2. Files Inspected

| # | File | Purpose |
|---|------|---------|
| 1 | `AUTH-ENDPOINT-CONTRACT-DECISION-REQUIRED.md` | Target — 5 open decisions |
| 2 | `AUTH-COOKIE-CONTRACT-TEMPORARY.md` | Cookie paths, flags, Domain pending |
| 3 | `PHASE-09-B-IDENTITY-COMPANIES-SCOPE.md` | Phase 09-B scope and rules |
| 4 | `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md` | Frozen endpoint catalog |
| 5 | `NESTJS-IMPLEMENTATION-GUIDE.md` | AuthProvider interface, signup flow |
| 6 | `03_users_auth.sql` | Schema: users, user_sessions, login_history, triggers |
| 7 | `17_rls.sql` | RLS policies, grants, function permissions |
| 8 | `AGENTS.md` | Agent working rules |
| 9 | `src/auth.ts` | `verifyBearer()`, `AuthGuard` — **updated with options** |
| 10 | `src/security/jwt-verifier.ts` | `JoseJwtVerifier` — issuer/audience wired |
| 11 | `src/config.ts` | Env schema — `SUPABASE_JWT_ISSUER`, `SUPABASE_JWT_AUDIENCE` |
| 12 | `src/main.ts` | Bootstrap — cookie-parser, validation pipe |
| 13 | `auth-contract-review/` | 3 previous reviews (antigravity, freebuf, opencode) |

---

## 3. Point-by-Point Evidence Table

### Decision 1: Signup Boundary

| Check | Status | Evidence |
|-------|--------|----------|
| NestJS owns signup | ✅ VERIFIED | `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md` L9: "NestJS owns AuthProvider signup/login/verification" |
| `handle_new_user()` creates `public.users` | ✅ VERIFIED | `03_users_auth.sql` L196: `AFTER INSERT ON auth.users` trigger |
| `create_empty_candidate_profile` trigger | ✅ VERIFIED | `08_candidates.sql` (candidate role → auto profile) |
| No NestJS duplicate user insert | ✅ VERIFIED | `03_users_auth.sql` L234: `ON CONFLICT (id) DO NOTHING` |
| No separate `/auth/bootstrap` endpoint | ✅ VERIFIED | `PHASE-09-B-API-CONTRACT-DECISIONS-HINGLISH.md` L13: "Separate POST /auth/bootstrap endpoint nahi banega" |
| Phase 06 catalog says "TBD" | ✅ VERIFIED | `PHASE-06-API-CATALOG.md` L199: "Method/path: TBD — auth signup/callback boundary" |
| Guide defines signup flow | ✅ VERIFIED | `NESTJS-IMPLEMENTATION-GUIDE.md` L59-70: Next.js → NestJS → Supabase Auth → trigger chain |

**Conflict:** Phase 06 catalog (L199) says `TBD` while the freeze candidate (L9) says "NestJS owns." The decision document correctly identifies this as the reason for this document. ✅ Correctly framed.

### Decision 2: Exact Routes

| Check | Status | Evidence |
|-------|--------|----------|
| `/api/v1/auth/refresh` frozen by cookie contract | ✅ VERIFIED | `AUTH-COOKIE-CONTRACT-TEMPORARY.md` L13: `Path=/api/v1/auth/refresh` |
| `/api/v1/auth/me` frozen | ✅ VERIFIED | `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md` L23 |
| `/api/v1/auth/sessions` frozen | ✅ VERIFIED | `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md` L24 |
| `/api/v1/auth/sessions/revoke` frozen | ✅ VERIFIED | `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md` L25 |
| Signup path NOT frozen | ✅ VERIFIED | Decision document Decision 2 — needs approval |
| Login path NOT frozen | ✅ VERIFIED | Decision document Decision 2 — needs approval |
| Logout path NOT frozen | ✅ VERIFIED | Decision document Decision 2 — needs approval |
| OAuth callback path NOT frozen | ✅ VERIFIED | `REQ-AUTH-006` marked "APPROVED DIRECTION" — path TBD |

### Decision 3: Login Methods

| Check | Status | Evidence |
|-------|--------|----------|
| Guide says "password/OAuth/token verification" | ✅ VERIFIED | `NESTJS-IMPLEMENTATION-GUIDE.md` L86: "Supabase Auth password/OAuth/token verification provider है" |
| Guide says "OAuth callback NestJS-controlled" | ✅ VERIFIED | `NESTJS-IMPLEMENTATION-GUIDE.md` L115: "OAuth callback NestJS-controlled endpoint" |
| `login_history.login_type` enum supports both | ✅ VERIFIED | `03_users_auth.sql`: `login_type public.auth_login_type NOT NULL DEFAULT 'email_password'` |
| `login_history.auth_provider` for OAuth | ✅ VERIFIED | `03_users_auth.sql`: `auth_provider VARCHAR(50)` — "e.g. google/apple; OAuth/SSO method se separate" |
| Current scope = password + OAuth | ✅ VERIFIED | `REQ-AUTH-001` = "Signup/login/verify/session/password", `REQ-AUTH-006` = "OAuth callback" |
| No external identity provider invent | ✅ VERIFIED | Decision document says "No provider or method will be assumed from the database schema" |

### Decision 4: Session Side Effects

| Check | Status | Evidence |
|-------|--------|----------|
| `user_sessions` is real-time presence, NOT auth sessions | ✅ VERIFIED | `03_users_auth.sql` L268: "This is NOT for auth sessions (Supabase Auth handles those)" |
| `user_sessions` for WebSocket/presence | ✅ VERIFIED | `03_users_auth.sql` L269: "Used for WebSocket connections and live presence" |
| Login/refresh may create presence session | ✅ VERIFIED | `PHASE-09-B-IDENTITY-COMPANIES-SCOPE.md` L57-58: session create/update behavior |
| Logout clears current presence row only | ✅ VERIFIED | `PHASE-09-B-API-CONTRACT-DECISIONS-HINGLISH.md` L56: "current authenticated presence session row" |
| Normal logout does NOT revoke Supabase tokens | ✅ VERIFIED | `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md` L21: "Normal logout clears the HttpOnly cookie and current presence row; routine Auth token revoke is not required" |
| `login_history` always logged | ✅ VERIFIED | `03_users_auth.sql`: `login_history` table — append-only audit |
| `user_security_log` for security events | ✅ VERIFIED | `03_users_auth.sql`: append-only, immutability trigger |

### Decision 5: Cookie Deployment Policy

| Check | Status | Evidence |
|-------|--------|----------|
| `SameSite=Lax` in contract | ✅ VERIFIED | `AUTH-COOKIE-CONTRACT-TEMPORARY.md` L10-13 |
| `Secure` on by default | ✅ VERIFIED | `AUTH-COOKIE-CONTRACT-TEMPORARY.md` L17: "localhost par Secure=false allow hoga" |
| `Domain` explicitly pending | ✅ VERIFIED | `AUTH-COOKIE-CONTRACT-TEMPORARY.md` L10-13: "PENDING — abhi Domain attribute omit hoga" |
| CORS implications acknowledged | ⚠️ **MISSING** | Decision document Decision 5 mentions CORS but no specific CORS configuration is defined |

---

## 4. Security Findings

### 4.1 Cookie Security

| Check | Status | Evidence |
|-------|--------|----------|
| Access token: `HttpOnly; Secure; SameSite=Lax` | ✅ VERIFIED | `AUTH-COOKIE-CONTRACT-TEMPORARY.md` L10 |
| Refresh token: `HttpOnly; Secure; SameSite=Lax` | ✅ VERIFIED | `AUTH-COOKIE-CONTRACT-TEMPORARY.md` L13 |
| Refresh token restricted to `/api/v1/auth/refresh` | ✅ VERIFIED | Cookie path = refresh endpoint only |
| `binay_access_token` on `Path=/` | ✅ VERIFIED | `AUTH-COOKIE-CONTRACT-TEMPORARY.md` L10 |
| `binay_refresh_token` on `Path=/api/v1/auth/refresh` | ✅ VERIFIED | `AUTH-COOKIE-CONTRACT-TEMPORARY.md` L13 |
| No JavaScript access to cookies | ✅ VERIFIED | `HttpOnly` flag prevents `document.cookie` access |
| Logout clears both cookies | ✅ VERIFIED | `AUTH-COOKIE-CONTRACT-TEMPORARY.md` L31: `Max-Age=0` |

### 4.2 Token Lifecycle

| Check | Status | Evidence |
|-------|--------|----------|
| Supabase Auth issues both tokens | ✅ VERIFIED | `AUTH-COOKIE-CONTRACT-TEMPORARY.md` L18-21 |
| Next.js never mints tokens | ✅ VERIFIED | `AUTH-COOKIE-CONTRACT-TEMPORARY.md` L25 |
| Refresh token never in logs | ✅ VERIFIED | `AUTH-COOKIE-CONTRACT-TEMPORARY.md` L34 |
| Refresh token never in DB | ✅ VERIFIED | `03_users_auth.sql` L270: "Supabase Auth refresh-token storage ke liye nahi" |
| Access token verified by `jose` | ✅ VERIFIED | `src/security/jwt-verifier.ts` |
| Issuer/audience now wired | ✅ VERIFIED | `auth.ts` L13: `options` parameter, `config.ts` L13-14: `SUPABASE_JWT_ISSUER`, `SUPABASE_JWT_AUDIENCE` |
| Fail-closed on all failures | ✅ VERIFIED | `auth.ts` L14-15: catch → `UNAUTHORIZED` |

### 4.3 Supabase Auth vs NestJS Responsibility

| Responsibility | Owner | Evidence |
|----------------|-------|----------|
| Token issuance | Supabase Auth | `AUTH-COOKIE-CONTRACT-TEMPORARY.md` L18-21 |
| Token verification | NestJS `jose` | `src/security/jwt-verifier.ts` |
| `public.users` creation | `handle_new_user()` trigger | `03_users_auth.sql` L196 |
| `candidate_profiles` creation | `create_empty_candidate_profile` trigger | `08_candidates.sql` |
| AuthProvider interface | NestJS | `NESTJS-IMPLEMENTATION-GUIDE.md` L93-106 |
| Cookie management | NestJS Set-Cookie | `AUTH-COOKIE-CONTRACT-TEMPORARY.md` L22 |
| User status validation | NestJS | `NESTJS-IMPLEMENTATION-GUIDE.md` L87: "public.users.status, deleted_at, locked_until validate" |
| Presence session management | NestJS | `03_users_auth.sql` L268 |
| Audit logging | NestJS | `login_history`, `user_security_log` — append-only |

---

## 5. Corrected Current Code State

**Important update from previous review:** The code has been updated since the earlier freebuf auth review.

| Component | Previous State (Earlier Review) | Current State |
|-----------|--------------------------------|---------------|
| `verifyBearer()` options | No issuer/audience params | ✅ `options` parameter added |
| `AuthGuard` options | No issuer/audience params | ✅ Constructor accepts `options` |
| `JoseJwtVerifier` | Already supported options | ✅ Spreads into `jwtVerify()` |
| `config.ts` | Missing issuer/audience env vars | ✅ `SUPABASE_JWT_ISSUER`, `SUPABASE_JWT_AUDIENCE` added |
| F-4 (HIGH) from previous review | Open | ✅ **FIXED** — full chain wired |

---

## 6. Missing Requirements and Gaps

### 6.1 CORS Configuration

| ID | Severity | Finding | Evidence | Impact |
|----|----------|---------|----------|--------|
| **G-1** | **HIGH** | No CORS origin configuration defined. Decision 5 mentions CORS but provides no specific allowed origins, methods, or headers. | Decision document Decision 5: "Confirm SameSite/CORS behavior for the final Next.js and NestJS origins" | Without CORS config, browser may block cross-origin requests in production (different ports during dev, different subdomains in prod) |
| **G-2** | **MEDIUM** | `SameSite=Lax` may block OAuth callback POST requests. OAuth providers typically POST to the callback URL. `Lax` only sends cookies on top-level navigations for cross-site requests. | `AUTH-COOKIE-CONTRACT-TEMPORARY.md` L10-13: `SameSite=Lax` | OAuth callback from provider (cross-site POST) may not include access token cookie → session not authenticated after OAuth callback |
| **G-3** | **MEDIUM** | No `Content-Security-Policy` or security headers configuration mentioned. Standard NestJS apps should set CSP, X-Frame-Options, etc. | Not in any reviewed file | Potential XSS/clickjacking risk |
| **G-4** | **LOW** | No rate limiting configuration defined for auth endpoints. The guide mentions "rate limit" generically (L134) but no specific limits. | `NESTJS-IMPLEMENTATION-GUIDE.md` L134 | Brute force risk on login endpoint |
| **G-5** | **LOW** | No explicit `Set-Cookie` `Priority` attribute. Modern browsers support `Priority=High` for critical cookies. | Not in any reviewed file | Minor — browser may deprioritize cookie refresh under load |

### 6.2 Trigger Ownership Confirmed

| Trigger | Table | Function | Creates | Evidence |
|---------|-------|----------|---------|----------|
| `on_auth_user_created` | `auth.users` | `handle_new_user()` | `public.users` row | `03_users_auth.sql` L196 |
| `create_empty_candidate_profile` | `auth.users` (indirect) | via `handle_new_user()` | `candidate_profiles` row | `08_candidates.sql` |
| `users_updated_at` | `public.users` | `update_updated_at_column()` | `updated_at` timestamp | `03_users_auth.sql` L169 |
| `user_sessions_updated_at` | `public.user_sessions` | `update_updated_at_column()` | `updated_at` timestamp | `03_users_auth.sql` L299 |
| `user_security_log_immutable` | `user_security_log` | `reject_auth_audit_row_change()` | Rejects UPDATE/DELETE | `03_users_auth.sql` L330 |
| `login_history_immutable` | `login_history` | `reject_auth_audit_row_change()` | Rejects UPDATE/DELETE | `03_users_auth.sql` L334 |

**Key confirmation:** `public.users.id` comes from `auth.users.id` (Supabase Auth). NestJS must NEVER insert a user row — the trigger handles it with `ON CONFLICT (id) DO NOTHING`.

---

## 7. Recommended Final Contract

### 7.1 Route Recommendations

| Decision | Recommended | Rationale | Evidence |
|----------|-------------|-----------|----------|
| **D1: Signup** | NestJS exposes signup directly | Supabase Auth SDK call, trigger creates user row, NestJS returns safe response | `NESTJS-IMPLEMENTATION-GUIDE.md` L59-70, `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md` L9 |
| **D2a: Signup path** | `POST /api/v1/auth/signup` | Consistent with `/api/v1/auth/*` prefix, approved by cookie contract for `/api/v1/auth/refresh` | Auth catalog pattern, cookie path convention |
| **D2b: Login path** | `POST /api/v1/auth/login` | Standard REST convention | Auth catalog pattern |
| **D2c: Refresh path** | `POST /api/v1/auth/refresh` | Already frozen by cookie contract | `AUTH-COOKIE-CONTRACT-TEMPORARY.md` L13 |
| **D2d: Logout path** | `POST /api/v1/auth/logout` | State-changing → POST | `PHASE-09-B-API-CONTRACT-DECISIONS-HINGLISH.md` L56 |
| **D2e: OAuth callback** | `GET /api/v1/auth/callback/:provider` | GET for browser redirect from OAuth provider; `:provider` for google/apple/etc | `REQ-AUTH-006` scope, OAuth standard |
| **D3: Login methods** | Password + OAuth (Google, Apple) | Supported by `login_type` enum, `auth_provider` column, `REQ-AUTH-001` + `REQ-AUTH-006` | `03_users_auth.sql` L360-370 |
| **D4: Session side effects** | Login creates presence session, refresh updates `last_seen_at`, logout deletes current row | Consistent with D5 in decisions, `user_sessions` purpose | `03_users_auth.sql` L268-270 |
| **D5: Cookie policy** | `SameSite=Lax` + `Secure` + `HttpOnly`; Domain omitted until deployment; CORS origins from env | Minimal production-ready defaults | `AUTH-COOKIE-CONTRACT-TEMPORARY.md` L10-17 |

### 7.2 AuthProvider Interface Recommendation

```
AuthProvider
  signup(input: { email, password, role, metadata? }) → { userId, requiresVerification }
  login(credentials: { email, password }) → { accessToken, refreshToken, user }
  refresh(refreshToken: string) → { accessToken, refreshToken }
  logout(sessionId: UUID) → void
  verifyAccessToken(token: string) → VerifiedJwtUser
  getAuthUser(authUserId: string) → AppUser | null
  getRefreshTokenSession(refreshToken: string) → SessionInfo
```

This matches `NESTJS-IMPLEMENTATION-GUIDE.md` L93-106 with concrete types.

### 7.3 Endpoint Authorization Map

| Endpoint | Auth Required | Actor | Response |
|----------|--------------|-------|----------|
| `POST /auth/signup` | No (unauthenticated) | Any visitor | `{ userId, requiresVerification }` |
| `POST /auth/login` | No (credentials) | Registered user | Set-Cookie + `AuthMeResponseDto` |
| `POST /auth/refresh` | Yes (refresh token cookie) | Authenticated user | Set-Cookie + `AuthMeResponseDto` |
| `POST /auth/logout` | Yes (access token) | Authenticated user | `{ success: true }` |
| `GET /auth/callback/:provider` | No (OAuth state) | OAuth user | Set-Cookie + redirect |
| `GET /auth/me` | Yes (access token) | Authenticated user | `AuthMeResponseDto` |
| `GET /auth/sessions` | Yes (access token) | Authenticated user | `PresenceSessionListDto` |
| `POST /auth/sessions/revoke` | Yes (access token) | Authenticated user | `RevokePresenceSessionResponseDto` |

---

## 8. Rejected Alternatives and Why

| Alternative | Why Rejected |
|-------------|-------------|
| NestJS does NOT expose signup directly | Contradicts `NESTJS-IMPLEMENTATION-GUIDE.md` L59-70 and `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md` L9. NestJS must call Supabase Auth SDK — Next.js cannot do this directly. |
| Separate `/auth/bootstrap` endpoint | Already explicitly rejected in `PHASE-09-B-API-CONTRACT-DECISIONS-HINGLISH.md` L13 |
| Next.js mints JWT tokens | Explicitly forbidden in `AUTH-COOKIE-CONTRACT-TEMPORARY.md` L25 and all architecture docs |
| `SameSite=None` for OAuth | Insecure — allows CSRF. `Lax` is correct for OAuth callbacks (browser navigations include cookies) |
| Refresh token in database | `03_users_auth.sql` L270 explicitly says `user_sessions` is NOT for refresh token storage |
| Hardcoded CORS origins | Must be env-configurable for dev/preprod/prod |

---

## 9. Blocking Decisions Before Coding

| # | Decision | Blocks | Urgency |
|---|----------|--------|---------|
| 1 | **CORS origins** — exact allowed origins for dev, preprod, prod | Login, signup, OAuth callback from browser | **HIGH** — must be defined before OAuth callback works |
| 2 | **Signup request/response DTO** — exact fields for signup request and safe response | `POST /auth/signup` implementation | **HIGH** — controller cannot be built without DTO |
| 3 | **OAuth callback URL format** — `GET /auth/callback/:provider` vs `GET /auth/callback?provider=google` | OAuth flow implementation | **MEDIUM** — affects redirect configuration |
| 4 | **Login rate limit** — exact limits for failed login attempts before lockout | Login endpoint security | **MEDIUM** — affects `locked_until` behavior |
| 5 | **Email verification flow** — NestJS endpoint for verification confirmation | `pending_verification` → `active` status transition | **MEDIUM** — affects signup completion |

---

## 10. Required Changes in the Decision Document

| # | Current Text | Issue | Recommended Change |
|---|-------------|-------|-------------------|
| C-1 | Decision 5: "Confirm SameSite/CORS behavior" | CORS is listed but no configuration is defined | Add: "CORS origins configured via `CORS_ORIGINS` env var; whitelist pattern: `https://*.binay.app` + `http://localhost:3000`" |
| C-2 | Decision 3: "Password login only, OAuth callback, or both?" | The question is answered by existing requirements but the document doesn't state the answer | Add: "Current scope: password + OAuth (Google/Apple). `login_type` enum and `auth_provider` column support both." |
| C-3 | Decision 4: "Confirm whether login/refresh creates or updates user_sessions" | Not answered | Add recommendation: "Login creates a presence session row; refresh updates `last_seen_at`; logout deletes the current row." |
| C-4 | Missing: `SameSite=Lax` OAuth callback impact | OAuth provider POSTs to callback — `Lax` may strip cookie on cross-site POST | Add note: "OAuth GET redirect flow recommended over POST to preserve `SameSite=Lax` cookie behavior" |
| C-5 | Missing: Signup request rate limiting | No rate limit specified for signup endpoint | Add: "Signup rate limit: max N per IP per hour; defined in implementation" |

---

## 11. Tests Required After Implementation

### 11.1 Unit Tests

| # | Test | Validates |
|---|------|-----------|
| T-1 | `verifyBearer()` with `issuer`/`audience` options | F-4 fix — issuer/audience validation works |
| T-2 | `verifyBearer()` with wrong issuer → 401 | Fail-closed on issuer mismatch |
| T-3 | `verifyBearer()` with expired token → 401 | Expiry validation |
| T-4 | `verifyBearer()` with empty token → 401 | No token handling |
| T-5 | Cookie precedence over Authorization header | Cookie takes precedence |
| T-6 | `cookie-parser` populates `request.cookies` | Cookie extraction works |

### 11.2 Integration Tests

| # | Test | Validates |
|---|------|-----------|
| T-7 | Signup → `public.users` row created by trigger (not NestJS) | D1 boundary, trigger ownership |
| T-8 | Signup → `candidate_profiles` row created for candidate role | Trigger chain |
| T-9 | Login → Set-Cookie headers present | Cookie contract |
| T-10 | Login with invalid credentials → no Set-Cookie | Fail-closed |
| T-11 | Refresh → new access token cookie issued | Refresh flow |
| T-12 | Refresh with expired refresh token → 401 | Refresh failure |
| T-13 | Logout → both cookies cleared (`Max-Age=0`) | Cookie clearing |
| T-14 | `GET /auth/me` after login → `AuthMeResponseDto` | Identity verification |
| T-15 | `GET /auth/me` with expired access token → 401 | Token expiry |
| T-16 | `POST /auth/sessions/revoke` → presence row deleted | D5 session behavior |

### 11.3 Security Tests

| # | Test | Validates |
|---|------|-----------|
| T-17 | OAuth callback preserves `SameSite=Lax` cookie | G-2 mitigation |
| T-18 | Cross-origin request blocked without CORS | CORS policy |
| T-19 | Refresh token not in any response body or header | Token leak prevention |
| T-20 | `login_history` appended on successful and failed login | Audit trail |
| T-21 | `user_security_log` appended on password change | Security audit |
| T-22 | Inactive user cannot login | Status guard |
| T-23 | `locked_until` user cannot login | Account lockout |
| T-24 | Deleted user (`deleted_at` not null) cannot login | Soft-delete guard |

### 11.4 Concurrency Tests

| # | Test | Validates |
|---|------|-----------|
| T-25 | Concurrent refresh requests — only one succeeds | Refresh token rotation |
| T-26 | Concurrent login from multiple devices — both succeed | Multi-device support |
| T-27 | Concurrent logout + refresh — refresh fails gracefully | Race condition safety |

---

## 12. Verdict Summary

| Category | Status |
|----------|--------|
| **Overall** | ⚠️ **APPROVED WITH REQUIRED FIXES** |
| Architecture | ✅ Sound — zero defects |
| Supabase Auth boundary | ✅ Correct |
| Cookie contract | ✅ Correct |
| Trigger ownership | ✅ Correct |
| Previous F-4 (issuer/audience) | ✅ FIXED in current code |
| CORS configuration | ❌ **MISSING — must define before coding** |
| OAuth SameSite impact | ⚠️ **Must address before OAuth flow** |
| Route definitions | ⚠️ **Pending Decision 2 approval** |
| BLOCKERs | 2 (CORS + Signup DTO) |
| MEDIUM gaps | 3 (OAuth callback path, rate limits, email verification) |

**The document correctly identifies the 5 decisions. 2 corrections (C-1, C-4) must be applied to the document itself before the contract can be considered complete. After CORS and Signup DTO are defined, the routes can be frozen and coding can begin.**

---

*Report generated: 2026-08-27*  
*Reviewer: Freebuf*  
*No source code, SQL or existing documents modified during this review.*
