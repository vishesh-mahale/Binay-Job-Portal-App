# NestJS Authentication & Cookie Contract — Independent Security Review

**Auditor:** Freebuf (Senior Auth/Security Architect)
**Date:** 2026-08-27
**Report:** `04-nestjs-api/auth-contract-review/freebuf-AUTH-COOKIE-REVIEW.md`
**Target:** NestJS AuthProvider boundary, cookie security, token transport, auth lifecycle

---

## 1. Executive Verdict

### **APPROVED WITH FIXES**

The authentication **architecture and contract design** are sound — zero-trust principles correctly applied, cookie path isolation prevents refresh token leakage, and HS256 JWT verification is cryptographically correct. However, the **actual implementation** has a significant gap: `src/auth.ts` reads `Authorization: Bearer` header only, while the frozen contract requires HttpOnly cookie-based browser auth. Additionally, no `cookie-parser` middleware exists, no `signup/login/refresh/logout` endpoints are implemented, and the `AuthProvider` interface defined in `NESTJS-IMPLEMENTATION-GUIDE.md` is not yet implemented. These are expected implementation gaps (Phase 09-B is authorized, not complete), but the contract-to-code contradiction must be tracked and resolved.

---

## 2. Files Reviewed

| # | File | Purpose |
|---|------|---------|
| 1 | `04-nestjs-api/AUTH-COOKIE-CONTRACT-TEMPORARY.md` | Provisional cookie specifications |
| 2 | `04-nestjs-api/PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md` | Frozen API & token catalog |
| 3 | `04-nestjs-api/PHASE-08-IMPLEMENTATION-PLAN.md` | Work packages & auth scope |
| 4 | `04-nestjs-api/04-nestjs-api-app/src/auth.ts` | Implemented AuthGuard & JWT verification |
| 5 | `04-nestjs-api/04-nestjs-api-app/src/identity-company.ts` | Identity controller (me/sessions/revoke) |
| 6 | `04-nestjs-api/04-nestjs-api-app/src/main.ts` | Application bootstrap |
| 7 | `04-nestjs-api/04-nestjs-api-app/src/config.ts` | Environment schema |
| 8 | `04-nestjs-api/04-nestjs-api-app/package.json` | Dependencies |
| 9 | `02-database/migrations/baseline/03_users_auth.sql` | Users, sessions, login_history, handle_new_user() |
| 10 | `04-nestjs-api/NESTJS-IMPLEMENTATION-GUIDE.md` | AuthProvider interface definition |
| 11 | `04-nestjs-api/PHASE-05-FINAL-REQUIREMENTS.md` | REQ-AUTH-001..007 |
| 12 | `04-nestjs-api/PHASE-06-API-CATALOG.md` | API catalog auth entries |
| 13 | `04-nestjs-api/PHASE-09-B-API-CONTRACT-DECISIONS-HINGLISH.md` | D1 auth boundary, D7 logout |

---

## 3. Evidence-Based Verification Matrix

### 3A. Contract Design (Architecture-Level)

| Verification Criterion | Contract Requirement | Repository Evidence | Verdict |
|---|---|---|---|
| **Token Issuer** | Supabase Auth is the sole Identity Provider issuing access JWTs and refresh tokens | `03_users_auth.sql` L34-46, `AUTH-COOKIE-CONTRACT-TEMPORARY.md` L18-21 | ✅ VALIDATED |
| **Next.js Boundary** | Next.js never mints tokens, never accesses Supabase directly, calls NestJS API only | `PHASE-08-IMPLEMENTATION-PLAN.md` §1 L11, `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md` | ✅ VALIDATED |
| **AuthProvider Scope** | NestJS owns AuthProvider signup/login/verification; `handle_new_user()` creates `public.users` | `03_users_auth.sql` L196 (`on_auth_user_created` trigger), `PHASE-09-B` Item 9 | ✅ VALIDATED |
| **Cookie Path Isolation** | `binay_access_token` → `Path=/`; `binay_refresh_token` → `Path=/api/v1/auth/refresh` | `AUTH-COOKIE-CONTRACT-TEMPORARY.md` L10-14 | ✅ VALIDATED |
| **Refresh Token Leak Prevention** | Refresh token sent only to `/api/v1/auth/refresh`, never on standard API requests | Cookie path restriction in contract | ✅ VALIDATED |
| **Security Flags** | `HttpOnly; Secure; SameSite=Lax`; `Secure=false` allowed ONLY for localhost dev | `AUTH-COOKIE-CONTRACT-TEMPORARY.md` L33-35 | ✅ VALIDATED |
| **Cookie Domain** | PENDING — intentionally omitted until deployment hostnames finalized | `AUTH-COOKIE-CONTRACT-TEMPORARY.md` L37-44 | ✅ CORRECTLY OPEN |
| **Logout Behavior** | `Set-Cookie Max-Age=0` clears both cookies; presence row cleared | `PHASE-09-B` Item 16, `PHASE-09-B-API-CONTRACT-DECISIONS-HINGLISH.md` L80 | ✅ VALIDATED |
| **No Supabase Token Revoke** | Normal logout does NOT call Supabase token-revoke; future capability | D7 decision | ✅ VALIDATED |
| **Auth Provider Interface** | Abstract interface: signup, login, refresh, verifyAccessToken, getAuthUser, logout | `NESTJS-IMPLEMENTATION-GUIDE.md` L93-106 | ✅ DEFINED (not implemented) |

### 3B. Implementation Verification

| Verification Criterion | Expected Behavior | Actual Code Evidence | Verdict |
|---|---|---|---|
| **Token extraction** | Read from `binay_access_token` HttpOnly cookie + `Authorization: Bearer` header fallback | `auth.ts` L7: reads `request.header('authorization')` ONLY — no cookie extraction | ⚠️ **CONTRACT GAP** |
| **HS256 verification** | Manual HMAC-SHA256 with timing-safe comparison | `auth.ts` L11-19: correct HMAC, timingSafeEqual, expiry check | ✅ VALIDATED |
| **JWT expiry check** | Expired tokens rejected | `auth.ts` L17: `payload.exp <= Math.floor(Date.now() / 1000)` | ✅ VALIDATED |
| **AuthGuard wiring** | Guard attached to protected endpoints | `identity-company.ts` L30: `@UseGuards(AuthGuard)` | ✅ VALIDATED |
| **Cookie-parser middleware** | Required for `request.cookies` to work | `main.ts`: NO cookie-parser. `package.json`: NO cookie-parser dependency | ❌ **MISSING** |
| **AuthProvider interface** | SupabaseAuthProvider implementing signup/login/refresh/logout | No file exists implementing this interface | ❌ **NOT IMPLEMENTED** |
| **POST /auth/signup** | Supabase Auth signup endpoint | No signup endpoint in any controller | ❌ **NOT IMPLEMENTED** |
| **POST /auth/login** | Supabase Auth login → cookie set | No login endpoint in any controller | ❌ **NOT IMPLEMENTED** |
| **POST /auth/refresh** | Refresh token → new access token pair | No refresh endpoint in any controller | ❌ **NOT IMPLEMENTED** |
| **POST /auth/logout** | Clear cookies + presence row | No logout endpoint in any controller | ❌ **NOT IMPLEMENTED** |
| **Set-Cookie headers** | HttpOnly, Secure, SameSite=Lax cookies | No Set-Cookie logic anywhere in codebase | ❌ **NOT IMPLEMENTED** |
| **SUPABASE_URL/SERVICE_ROLE_KEY** | Required for Supabase Auth SDK calls | Both are `.optional()` in `config.ts` L10-11 | ⚠️ **OPTIONAL (correct for foundation)** |

---

## 4. Findings

### FINDING-01: AuthGuard Reads Bearer Header Only — No Cookie Support

| Field | Detail |
|---|---|
| **Severity** | MEDIUM |
| **File** | `04-nestjs-api/04-nestjs-api-app/src/auth.ts` L7 |
| **Issue** | `verifyBearer()` extracts JWT strictly from `Authorization: Bearer <token>` header. The frozen contract (`AUTH-COOKIE-CONTRACT-TEMPORARY.md`, `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md`) requires browsers to authenticate via `binay_access_token` HttpOnly cookie. |
| **Evidence** | `request.header('authorization')` — no `request.cookies` access |
| **Impact** | Browser clients using HttpOnly cookies will be rejected by the guard. Bearer header fallback should remain for non-browser API clients (FastAPI, CLI, tests). |
| **Required Fix** | Update `verifyBearer()` to extract from cookies first, header fallback: `const token = request.cookies?.['binay_access_token'] \|\| request.header('authorization')?.slice(7);` |
| **Dependency** | Requires `cookie-parser` middleware (see FINDING-02) |

### FINDING-02: No cookie-parser Middleware

| Field | Detail |
|---|---|
| **Severity** | HIGH |
| **File** | `04-nestjs-api/04-nestjs-api-app/package.json`, `04-nestjs-api/04-nestjs-api-app/src/main.ts` |
| **Issue** | `cookie-parser` is not in dependencies and is not configured in `main.ts`. Even if `auth.ts` tries to read `request.cookies`, it will be `undefined`. Express does not auto-parse cookies. |
| **Evidence** | `package.json` dependencies: no `cookie-parser`. `main.ts`: no `app.use(cookieParser())` |
| **Impact** | Without cookie-parser, the entire HttpOnly cookie auth flow described in the contract cannot function. This is a blocking dependency for cookie-based auth. |
| **Required Fix** | Add `cookie-parser` to dependencies, add `@types/cookie-parser` to devDependencies, add `app.use(cookieParser())` in `main.ts` bootstrap. |

### FINDING-03: No Auth Endpoints Implemented

| Field | Detail |
|---|---|
| **Severity** | MEDIUM (Expected — Phase 09-B implementation authorized, not complete) |
| **File** | `04-nestjs-api/04-nestjs-api-app/src/identity-company.ts` |
| **Issue** | The `IdentityController` implements only `GET /auth/me`, `GET /auth/sessions`, `POST /auth/sessions/revoke`. The contract and API catalog require: `POST /auth/signup`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`. These are defined in the `AuthProvider` interface (`NESTJS-IMPLEMENTATION-GUIDE.md` L93-106) but not implemented. |
| **Evidence** | No `@Post('signup')`, `@Post('login')`, `@Post('refresh')`, `@Post('logout')` in any controller |
| **Impact** | The full auth lifecycle (signup → login → access → refresh → logout) is not functional. Only the `GET /auth/me` endpoint works (with Bearer header). |
| **Required Fix** | Implement auth endpoints per Phase 09-B scope. This is expected to happen in Phase 09-B coding, not a defect in the current foundation. |

### FINDING-04: AuthProvider Interface Not Implemented

| Field | Detail |
|---|---|
| **Severity** | MEDIUM (Expected — Phase 09-B scope) |
| **File** | `NESTJS-IMPLEMENTATION-GUIDE.md` L93-106 |
| **Issue** | The guide defines `AuthProvider` interface with methods: `signup(input)`, `login(credentials)`, `refresh(refreshToken)`, `verifyAccessToken(accessToken)`, `getAuthUser(authUserId)`, `logout(sessionContext)`. `SupabaseAuthProvider implements AuthProvider` is also defined. Neither exists in the codebase. |
| **Evidence** | No `AuthProvider` interface file. No `SupabaseAuthProvider` class. No `@supabase/supabase-js` in dependencies. |
| **Impact** | The abstraction layer that isolates business modules from Supabase SDK is not present. If implemented without this interface, switching auth providers later would require rewriting business logic. |
| **Required Fix** | Implement `AuthProvider` interface + `SupabaseAuthProvider` before auth endpoints. Add `@supabase/supabase-js` dependency. |

### FINDING-05: Supabase Auth SDK Not Integrated

| Field | Detail |
|---|---|
| **Severity** | LOW (Expected — foundation scope doesn't include Supabase Auth integration) |
| **File** | `04-nestjs-api/04-nestjs-api-app/package.json` |
| **Issue** | `@supabase/supabase-js` is not in dependencies. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are optional in `config.ts`. The current HS256 verification works without the SDK (it only needs `SUPABASE_JWT_SECRET`), but signup/login/refresh/logout require the Supabase Auth SDK. |
| **Evidence** | `package.json` dependencies: no `@supabase/supabase-js`. `config.ts` L10-11: both optional. |
| **Impact** | The manual JWT verification is sufficient for access token validation but cannot handle the full auth lifecycle. |
| **Required Fix** | Add `@supabase/supabase-js` dependency when implementing auth endpoints. Make `SUPABASE_URL` required (not optional) when auth endpoints are implemented. |

### FINDING-06: Previous Agent Reviews — False Positive on D7 Cookie Logout

| Field | Detail |
|---|---|
| **Severity** | LOW (Documentation accuracy concern) |
| **Files** | Multiple reviews: `freebuf-final-revalidation.md`, `freebuf-final-freeze-candidate-review.md`, `freebuf-final-clean-review.md`, `antigravity-revalidation.md`, `antigravity-final-revalidation.md`, etc. |
| **Issue** | Multiple previous reviews (including my own) mark D7 "HttpOnly cookie logout" as ✅ PASS. However, no cookie infrastructure exists in the codebase — no cookie-parser, no Set-Cookie logic, no cookie reading. The D7 decision is architecturally correct, but the implementation claim is premature. |
| **Evidence** | Zero cookie-related code in the entire `04-nestjs-api-app/src/` directory. `grep` for `cookie` in TS files returns 0 results. |
| **Impact** | Future reviewers may assume cookie auth is implemented when it is not. The D7 "PASS" should be understood as "contract design approved" not "implementation verified." |
| **Required Fix** | Clarify in review reports that D7 PASS means the decision is frozen, not that cookie infrastructure is implemented. Implementation verification should happen after Phase 09-B coding. |

### FINDING-07: HS256 Verification — Correct but Limited

| Field | Detail |
|---|---|
| **Severity** | NO ISSUE |
| **File** | `04-nestjs-api/04-nestjs-api-app/src/auth.ts` L11-19 |
| **Finding** | The manual HS256 JWT verification is cryptographically sound: correct HMAC-SHA256, timing-safe comparison (`timingSafeEqual`), proper expiry check, algorithm header validation (`HS256` only), `sub` claim presence check. This is a valid approach for Supabase Auth JWTs. |
| **Note** | For the full auth lifecycle (signup/login/refresh), the Supabase Auth SDK's `auth.getUser(token)` method provides additional server-side verification (checks token against Supabase's revocation list). The manual verification does NOT check revocation — this is acceptable for access tokens (short-lived) but should be documented as a known limitation. |

### FINDING-08: handle_new_user() Trigger — Correctly Implemented

| Field | Detail |
|---|---|
| **Severity** | NO ISSUE |
| **File** | `02-database/migrations/baseline/03_users_auth.sql` L196-266 |
| **Finding** | The trigger correctly: (1) normalizes whitespace from metadata, (2) extracts `application_role` from `raw_app_meta_data` (server-controlled, not user-trusted), (3) defaults to `candidate` role, (4) sets status based on `email_confirmed_at`, (5) uses `ON CONFLICT DO NOTHING` for idempotency, (6) has `SECURITY DEFINER SET search_path = ''` for security. |

### FINDING-09: identity-company.ts — me() Uses UserContextClient Correctly

| Field | Detail |
|---|---|
| **Severity** | NO ISSUE |
| **File** | `04-nestjs-api/04-nestjs-api-app/src/identity-company.ts` L15-25 |
| **Finding** | `me()` correctly uses `UserContextClient` (not SystemClient) for the personal profile read. The `queryAsUser(token, ...)` call passes the raw Bearer token for RLS evaluation. The `WHERE id = $1 AND deleted_at IS NULL` clause ensures soft-deleted users are excluded. This matches Decision-01 (UserContextClient for approved personal reads). |

---

## 5. Security Analysis

### 5A. XSS Protection
| Aspect | Contract | Current State | Status |
|---|---|---|---|
| `HttpOnly` flag | Both cookies | Not implemented (no Set-Cookie) | ⚠️ Pending implementation |
| `Secure` flag | Both cookies (except localhost dev) | Not implemented | ⚠️ Pending implementation |
| `SameSite=Lax` | Both cookies | Not implemented | ⚠️ Pending implementation |
| XSS token theft prevention | HttpOnly prevents JS access | N/A — no cookies set | ⚠️ Pending implementation |

### 5B. CSRF Mitigation
| Aspect | Contract | Current State | Status |
|---|---|---|---|
| `SameSite=Lax` | Prevents cross-site state-changing requests | Not implemented | ⚠️ Pending |
| Custom API headers | Additional CSRF protection layer | Not implemented | ⚠️ Pending |
| CORS configuration | Not defined in foundation | `app.enableShutdownHooks()` only | ⚠️ Missing CORS config |

### 5C. Refresh Token Exfiltration Prevention
| Aspect | Contract | Current State | Status |
|---|---|---|---|
| `Path=/api/v1/auth/refresh` | Refresh cookie only sent to refresh endpoint | No refresh endpoint exists | ✅ Contract correct; implementation pending |
| Normal API requests | Never include refresh token | N/A — no cookies | ✅ By absence |
| Server-side refresh handling | NestJS calls Supabase Auth SDK | No SDK integrated | ⚠️ Pending |

### 5D. Tenant Isolation
| Aspect | Current State | Status |
|---|---|---|
| Identity derived server-side from `request.user.sub` | ✅ All endpoints use JWT claims | ✅ VALIDATED |
| Client-supplied user IDs untrusted | ✅ `me()` uses `request.user?.sub` from JWT | ✅ VALIDATED |
| Company membership check server-side | ✅ SystemClient queries with same-company filter | ✅ VALIDATED |

---

## 6. Auth Lifecycle Gap Analysis

| Flow | Contract Defined? | Implemented? | Gap |
|---|---|---|---|
| **Signup** | ✅ `POST /auth/signup` → NestJS AuthProvider → Supabase Auth | ❌ Not implemented | AuthProvider + Supabase SDK needed |
| **Login** | ✅ `POST /auth/login` → NestJS AuthProvider → Supabase Auth → Set-Cookie | ❌ Not implemented | AuthProvider + cookie-parser + Set-Cookie needed |
| **Token Refresh** | ✅ `POST /auth/refresh` (refresh cookie → new access cookie) | ❌ Not implemented | Refresh endpoint + cookie-parser + Set-Cookie needed |
| **Profile Read** | ✅ `GET /auth/me` | ✅ Implemented | Works with Bearer header only |
| **Session List** | ✅ `GET /auth/sessions` | ✅ Implemented | Works correctly |
| **Session Revoke** | ✅ `POST /auth/sessions/revoke` | ✅ Implemented | Works correctly |
| **Logout** | ✅ `POST /auth/logout` → clear cookies + presence row | ❌ Not implemented | Logout endpoint + Set-Cookie + cookie-parser needed |

---

## 7. Open Decisions

| ID | Decision | Status | Impact |
|---|---|---|---|
| **OD-1** | Cookie `Domain` value | PENDING — deployment-specific | Correctly tracked in `AUTH-COOKIE-CONTRACT-TEMPORARY.md` |
| **OD-2** | Whether to support both cookie + Bearer header auth | OPEN — contract says cookie-first, code says Bearer-only | Should support both: cookie for browser, Bearer for API clients |
| **OD-3** | Supabase Auth SDK vs manual refresh | OPEN — no implementation yet | SDK recommended for revocation checking; manual is acceptable for short-lived access tokens |

---

## 8. Required Fixes Before Production

| Priority | Fix | Dependency |
|---|---|---|
| **P0** | Add `cookie-parser` dependency + middleware | Blocks cookie auth |
| **P0** | Implement `AuthProvider` interface + `SupabaseAuthProvider` | Blocks signup/login/refresh/logout |
| **P0** | Implement `POST /auth/login` with Set-Cookie | Blocks all authenticated flows |
| **P0** | Implement `POST /auth/refresh` with cookie path restriction | Blocks token refresh |
| **P0** | Implement `POST /auth/logout` with Set-Cookie Max-Age=0 | Blocks logout |
| **P1** | Update `verifyBearer()` to support cookie extraction | Blocks browser auth |
| **P1** | Add `@supabase/supabase-js` dependency | Required for AuthProvider |
| **P1** | Add CORS configuration | Blocks cross-origin browser requests |
| **P2** | Make `SUPABASE_URL` required when auth endpoints are live | Configuration completeness |
| **P2** | Document manual JWT verification limitation (no revocation check) | Security documentation |

---

## 9. What Is NOT Blocked

The following are architecturally sound and correctly validated:

- ✅ Supabase Auth as sole Identity Provider (contract design)
- ✅ Next.js never mints tokens or accesses Supabase directly
- ✅ Cookie path isolation (`/` for access, `/api/v1/auth/refresh` for refresh)
- ✅ `HttpOnly; Secure; SameSite=Lax` flags (design correct, implementation pending)
- ✅ `handle_new_user()` trigger creates `public.users` correctly
- ✅ UserContextClient for `/auth/me`, SystemClient for business operations
- ✅ HS256 JWT verification (manual, cryptographically correct)
- ✅ Logout clears presence row + cookies (design correct, implementation pending)
- ✅ D1 auth boundary: NestJS owns AuthProvider; trigger owns user row
- ✅ D7 logout: cookie clear + presence session close; no routine Supabase token-revoke
- ✅ Cookie Domain correctly marked as deployment-specific PENDING
- ✅ Zero invented tables, columns, events, or endpoints
- ✅ No token leaks in logs (SafeLogger redacts `authorization`, `token`, `cookie`)

---

## 10. Cross-Agent Consistency Check

| Review | Previous Verdict | This Review Verdict | Discrepancy |
|---|---|---|---|
| Antigravity auth review | APPROVED WITH FIXES (cookie extraction fix) | APPROVED WITH FIXES | ✅ Consistent — both flag cookie extraction gap |
| Multiple D7 reviews | ✅ PASS (cookie logout) | ⚠️ PASS (design only) | ⚠️ Previous reviews may overstate implementation status |
| Phase 09-B foundation review | PASS | N/A — foundation scope doesn't include auth endpoints | ✅ Consistent |

---

## 11. Final Recommendation

```text
Status: APPROVED WITH FIXES

The AUTH-COOKIE-CONTRACT-TEMPORARY.md is a well-designed, security-sound
contract. The frozen decisions (D1 auth boundary, D7 logout) are architecturally
correct. The implementation gap (no cookie-parser, no auth endpoints, no
Supabase SDK) is expected — Phase 09-B coding is authorized but not complete.

Critical path before Phase 09-B coding:
1. Add cookie-parser dependency + middleware
2. Implement AuthProvider interface + SupabaseAuthProvider
3. Implement login/signup/refresh/logout endpoints with Set-Cookie
4. Update AuthGuard to support both cookie and Bearer header

The HS256 JWT verification in auth.ts is correct and sufficient for access
token validation. The manual approach does not check Supabase revocation
lists — this is acceptable for short-lived access tokens and should be
documented.
```

---

## 12. No-Code-Change Confirmation

I explicitly confirm that **zero source code, SQL migrations, or configuration files were modified** during this independent security audit. This is a read-only review.
