# OpenCode — NestJS Auth Cookie Contract Security Review

## 1. Executive Verdict

```text
APPROVED WITH FIXES
```

The auth contract is architecturally sound. The Supabase Auth token-issuance model, Controlled Hybrid access boundary, cookie path isolation, and HttpOnly/Secure/SameSite flags are correctly designed. The `auth.ts` JWT verification is cryptographically correct. However, several findings require resolution before production:

- **BLOCKER: 0**
- **HIGH: 4**
- **MEDIUM: 6**
- **LOW: 3**
- **NO ISSUE: 9**
- **OPEN DECISION: 1**

## 2. Files Reviewed

| # | File | Authority |
|---|---|---|
| 1 | `04-nestjs-api/AUTH-COOKIE-CONTRACT-TEMPORARY.md` | Auth cookie contract |
| 2 | `04-nestjs-api/PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md` | Final freeze candidate |
| 3 | `04-nestjs-api/PHASE-08-IMPLEMENTATION-PLAN.md` | Implementation plan |
| 4 | `04-nestjs-api/04-nestjs-api-app/src/auth.ts` | JWT verification guard |
| 5 | `04-nestjs-api/04-nestjs-api-app/src/config.ts` | Environment config |
| 6 | `04-nestjs-api/04-nestjs-api-app/src/main.ts` | Bootstrap |
| 7 | `04-nestjs-api/04-nestjs-api-app/src/app.module.ts` | Module wiring |
| 8 | `04-nestjs-api/04-nestjs-api-app/src/identity-company.ts` | Auth endpoints |
| 9 | `04-nestjs-api/04-nestjs-api-app/src/auth.spec.ts` | Auth tests |
| 10 | `02-database/migrations/baseline/03_users_auth.sql` | Users/sessions/auth SQL |
| 11 | `04-nestjs-api/PHASE-06-API-CATALOG.md` | API catalog |
| 12 | `04-nestjs-api/DECISION-01-NESTJS-SUPABASE-ACCESS-MODEL-HINGLISH.md` | Access model decision |

## 3. Findings

### HIGH-01 — `auth.ts` guard reads token from `Authorization` header only — no cookie-based token extraction

**Evidence:**
- `auth.ts:7` — `const value = request.header('authorization')` — reads only `Authorization: Bearer <token>`
- `AUTH-COOKIE-CONTRACT-TEMPORARY.md:12` — `binay_access_token` cookie carries the Supabase Auth access JWT
- `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md:18` — "`binay_access_token` uses `Path=/`"
- `identity-company.ts:17` — `request.header('authorization')?.slice(7)` — same header-only pattern

**Contract:** The cookie contract specifies that `binay_access_token` is set as an HttpOnly cookie with `Path=/`. Normal protected requests should use this cookie. However, the `AuthGuard` reads only from the `Authorization` header.

**Impact:** If the frontend sends the access token exclusively via cookie (as the contract intends), the guard will reject all requests with `UNAUTHORIZED`. The frontend must send the token BOTH as a cookie (for browser automatic inclusion) AND as an `Authorization` header (for the guard to read). This is a contract/code mismatch.

**Resolution options:**
1. Modify `auth.ts` to extract the token from the cookie when `Authorization` header is absent
2. Update the contract to require `Authorization: Bearer` header instead of cookie
3. Document that the frontend must set both cookie AND header

**Severity:** HIGH — The current guard implementation is incompatible with the cookie-only contract as written.

### HIGH-02 — No refresh token implementation exists in codebase

**Evidence:**
- `AUTH-COOKIE-CONTRACT-TEMPORARY.md:28` — "Refresh-token cookie sirf `/api/v1/auth/refresh` path par bheji jayegi"
- `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md:18-19` — refresh token uses `Path=/api/v1/auth/refresh`
- `app.module.ts` — No refresh endpoint registered; `IdentityController` has only `me`, `sessions`, `revoke`
- `identity-company.ts` — No `@Post('refresh')` handler exists

**Contract:** The cookie contract defines `binay_refresh_token` with `Path=/api/v1/auth/refresh`. The freeze candidate lists auth endpoints but does NOT include a refresh endpoint.

**Impact:** Token refresh flow is entirely unimplemented. When the access JWT expires (Supabase default ~1 hour), the user has no mechanism to obtain a new token pair without re-authenticating. This is a critical gap for session continuity.

**Severity:** HIGH — Token refresh is a core auth flow; absence forces re-login on every JWT expiry.

### HIGH-03 — `auth.ts` does not verify `aud` (audience) or `iss` (issuer) claims

**Evidence:**
- `auth.ts:7` — Checks: `header.alg !== 'HS256'`, `!payload.sub`, signature, `payload.exp`. Does NOT check `aud` or `iss`.
- `config.ts:7` — `SUPABASE_JWT_SECRET` is required; `SUPABASE_URL` is optional
- Supabase Auth JWTs typically include `aud: 'authenticated'` and `iss: 'https://<project-ref>.supabase.co/auth/v1'`

**Impact:** Without `aud`/`iss` validation, a JWT minted by a different Supabase project (or another HS256 service sharing the same secret) would be accepted. In practice, the secret is project-specific so exploitation is unlikely, but defense-in-depth is incomplete.

**Severity:** HIGH — Security hardening gap. Production JWT verification should validate `aud` and `iss`.

### HIGH-04 — `config.ts` marks `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as optional

**Evidence:**
- `config.ts:8-9` — `SUPABASE_URL: z.string().url().optional()`, `SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional()`
- `config.ts:7` — `SUPABASE_JWT_SECRET: z.string().min(16)` — this is required (correct)

**Impact:** If `SUPABASE_URL` is missing, any code path that calls Supabase Auth (signup, login, token refresh) will fail at runtime with an unclear error rather than a fail-fast startup error. The JWT secret is correctly required, but the Auth provider URL should also be required for any auth flow that calls Supabase Auth.

**Severity:** HIGH — Missing fail-fast validation for auth-critical configuration.

### MEDIUM-01 — No signup/login endpoint exists in the codebase

**Evidence:**
- `identity-company.ts:51-65` — `IdentityController` has only `GET /me`, `GET /sessions`, `POST /sessions/revoke`
- `app.module.ts` — No signup/login controller registered
- `PHASE-06-API-CATALOG.md:199` — "Method/path: TBD — auth signup/callback boundary must be confirmed with Supabase Auth"
- `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md:9` — "NestJS owns AuthProvider signup/login/verification"

**Contract:** The freeze candidate says NestJS owns signup/login, but the API catalog says paths are `TBD`. No signup/login endpoint is implemented.

**Impact:** Users cannot authenticate through the NestJS API. The entire auth flow (signup → email verification → login → cookie setting) is not implemented.

**Severity:** MEDIUM — Expected for current development stage, but must be resolved before any auth flow works.

### MEDIUM-02 — Logout endpoint does not exist

**Evidence:**
- `identity-company.ts` — No `@Post('logout')` handler
- `AUTH-COOKIE-CONTRACT-TEMPORARY.md:31` — "Logout par NestJS dono cookies ko `Max-Age=0`/expired `Set-Cookie` se clear karega"
- `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md:16` — "Normal logout clears the HttpOnly cookie and current presence row"

**Impact:** No logout mechanism exists. Cookies cannot be cleared server-side.

**Severity:** MEDIUM — Must be implemented for session termination.

### MEDIUM-03 — `auth.ts` does not extract token from cookies — only from `Authorization` header

**Evidence:** Already covered in HIGH-01. The cookie contract says tokens come via cookies, but the guard reads only from headers.

**Severity:** MEDIUM — Duplicate of HIGH-01 for tracking purposes.

### MEDIUM-04 — No CORS configuration in `main.ts`

**Evidence:**
- `main.ts:10` — No `app.enableCors()` or CORS middleware configured
- The NestJS API runs on `0.0.0.0` (line 10) and the frontend (Next.js) runs on a different port/origin

**Impact:** Cross-origin requests from the Next.js frontend to the NestJS API will be blocked by browser CORS policy. Cookies with `SameSite=Lax` require the top-level navigation to be same-site; for API calls, `SameSite=None; Secure` may be needed for cross-origin cookie sending.

**Severity:** MEDIUM — Will block all frontend-to-API communication in development (different ports) and potentially in production (different subdomains).

### MEDIUM-05 — `SameSite=Lax` may not work for cross-origin API calls

**Evidence:**
- `AUTH-COOKIE-CONTRACT-TEMPORARY.md:12-13` — Both cookies use `SameSite=Lax`
- If frontend (e.g., `localhost:3000`) and API (e.g., `localhost:3001`) are on different ports, they are different origins

**Impact:** `SameSite=Lax` cookies are NOT sent on cross-origin `POST` requests (only top-level `GET` navigations). If the frontend makes `POST` requests to the API from a different origin, the `binay_access_token` cookie will not be included. This compounds HIGH-01.

**Severity:** MEDIUM — Cookie won't be sent on cross-origin POST; must be addressed with either `SameSite=None; Secure` or same-origin deployment.

### MEDIUM-06 — `auth.ts` `RequestUser` interface allows arbitrary JWT claims via `[key: string]: unknown`

**Evidence:**
- `auth.ts:5` — `export interface RequestUser { sub: string; role?: string; [key: string]: unknown; }`
- The index signature means any property access on `RequestUser` compiles without error, even if the property doesn't exist

**Impact:** TypeScript cannot catch accidental misuse of undefined JWT claims. For example, `request.user?.company_id` compiles but may be `undefined` at runtime. This is a type-safety concern, not a security vulnerability.

**Severity:** LOW — Type-safety improvement; not exploitable.

### LOW-01 — `auth.spec.ts` has only 2 tests (valid token, expired token)

**Evidence:**
- `auth.spec.ts` — 2 tests: valid non-expired token verification, expired token rejection
- Missing tests: malformed token, wrong algorithm, missing `sub`, invalid signature, missing `Authorization` header, `Bearer` prefix missing

**Impact:** Critical auth guard paths are untested. A regression in JWT verification could go undetected.

**Severity:** LOW — Test coverage gap; not a contract violation.

### LOW-02 — `handle_new_user()` trigger reads role from `raw_app_meta_data` — server-controlled but not audited

**Evidence:**
- `03_users_auth.sql:229-235` — `application_role := CASE NEW.raw_app_meta_data ->> 'application_role' ...`
- Comment at line 227-228: "raw_app_meta_data is server/admin-controlled. Public user metadata se elevated role trust nahi karna hai."

**Impact:** The role is derived from `raw_app_meta_data` which is set by Supabase Auth admin. If a future code path allows user-controlled `app_meta_data`, privilege escalation is possible. The current design is safe because `app_meta_data` is server-only.

**Severity:** LOW — Current design is correct; this is a forward-looking concern.

### LOW-03 — Cookie Domain is PENDING — correct decision

**Evidence:**
- `AUTH-COOKIE-CONTRACT-TEMPORARY.md:39-43` — "Pre-prod/production deployment hostnames final hone ke baad exact cookie `Domain` value approve karni hai... Domain final hone tak code/config mein `Domain` attribute set nahi karna hai."
- `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md:21-22` — "Exact cookie `Domain` remains deployment-specific and is tracked as pending"

**Impact:** Omitting `Domain` creates a host-only cookie (most restrictive). This is the correct default for development and avoids accidental cross-subdomain cookie leakage.

**Severity:** LOW — Correct decision to defer; host-only cookie is the safest default.

## 4. Verification Results

### Q1: Supabase Auth ही access JWT और refresh token issue करता है या नहीं?

**YES — Confirmed.**
- `AUTH-COOKIE-CONTRACT-TEMPORARY.md:20` — "access JWT + refresh token" from "Supabase Auth"
- `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md:17` — "Supabase Auth issues the access JWT and refresh token"
- `DECISION-01:48-49` — "Dispatcher aur FastAPI background services ko user JWT available nahi hota" — confirms JWT originates from Supabase, not from NestJS

### Q2: Next.js JWT mint नहीं करता और direct Supabase access नहीं करता?

**YES — Contractually confirmed, but no code enforcement exists.**
- `AUTH-COOKIE-CONTRACT-TEMPORARY.md:25` — "Next.js JWT ya refresh token mint nahi karega"
- `PHASE-08-IMPLEMENTATION-PLAN.md:11` — "Next.js browser केवल NestJS API को call करेगा; direct Supabase Auth/DB/Storage business access नहीं"
- `03_users_auth.sql:38` — "Next.js privileged database/Auth administration writes nahi karegi"
- No Next.js code exists in this repository to verify, but the contract is explicit.

### Q3: NestJS AuthProvider boundary सही defined है या नहीं?

**PARTIALLY — Contract exists, implementation is incomplete.**
- `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md:9` — "NestJS owns AuthProvider signup/login/verification; `handle_new_user()` creates `public.users`"
- `03_users_auth.sql:199-266` — `handle_new_user()` trigger correctly creates `public.users` from `auth.users`
- `auth.ts` — JWT verification guard exists and works
- Missing: signup, login, refresh, logout endpoints (see MEDIUM-01, MEDIUM-02, HIGH-02)

### Q4: Access-token और refresh-token cookie paths सही हैं या नहीं?

**YES — Path design is correct.**
- `binay_access_token`: `Path=/` — sent on all requests (correct for access token)
- `binay_refresh_token`: `Path=/api/v1/auth/refresh` — sent only to refresh endpoint (correct for isolation)
- This prevents the refresh token from leaking in normal API calls.

### Q5: Refresh token normal API requests में leak तो नहीं होगा?

**YES — Path isolation prevents leak.**
- `binay_refresh_token` uses `Path=/api/v1/auth/refresh` — browser will ONLY include this cookie when the request path starts with `/api/v1/auth/refresh`
- Normal API requests (e.g., `GET /api/v1/companies`) will NOT include the refresh token cookie
- This is correctly designed.

### Q6: HttpOnly, Secure, SameSite और localhost exception सुरक्षित हैं या नहीं?

**PARTIALLY — Flags are correct, but localhost exception needs care.**
- `HttpOnly: true` — prevents JavaScript access (correct)
- `Secure: true` in production — prevents HTTP transmission (correct)
- `Secure: false` on localhost — allows HTTP for development (correct with documented caveat)
- `SameSite=Lax` — reasonable default but see MEDIUM-05 for cross-origin concerns
- The localhost exception is correctly documented as development-only.

### Q7: Signup, login, refresh, logout और `/auth/me` flow में कोई gap/conflict है या नहीं?

**YES — Multiple gaps.**
- **Signup:** Not implemented (MEDIUM-01)
- **Login:** Not implemented (MEDIUM-01)
- **Refresh:** Not implemented (HIGH-02)
- **Logout:** Not implemented (MEDIUM-02)
- **`/auth/me`:** Implemented (`identity-company.ts:16-26`) — uses `UserContextClient` with RLS, correctly reads safe fields

### Q8: Exact cookie Domain को pending रखना सही है या नहीं?

**YES — Correct decision.**
- `AUTH-COOKIE-CONTRACT-TEMPORARY.md:39-43` — Explicitly deferred until deployment hostnames are finalized
- Host-only cookie (omitting Domain) is the most restrictive and safest default
- Prevents accidental cross-subdomain cookie leakage

### Q9: कोई table, endpoint, token behavior या security rule invent तो नहीं किया गया?

**NO — No invented elements.**
- All tables referenced exist in `03_users_auth.sql` (`users`, `user_sessions`, `user_security_log`, `login_history`)
- All endpoints match the catalog (where implemented)
- Token behavior matches Supabase Auth model
- Security rules trace to DECISION-01 and 17_rls.sql

### Q10: Current code/docs में कोई contradiction है?

**YES — One contradiction found.**
- **Contradiction:** Cookie contract says tokens come via cookies (`AUTH-COOKIE-CONTRACT-TEMPORARY.md:12-13`), but `AuthGuard` reads only from `Authorization` header (`auth.ts:7`). These are incompatible.
- **File/line:** `auth.ts:7` vs `AUTH-COOKIE-CONTRACT-TEMPORARY.md:12`

## 5. Security Architecture Assessment

### What is correct:

1. **Supabase Auth as sole token issuer** — NestJS never mints tokens; it only verifies them
2. **Cookie path isolation** — Refresh token is restricted to `/api/v1/auth/refresh`
3. **HttpOnly + Secure flags** — Prevents XSS and MITM token theft
4. **`handle_new_user()` trigger** — Server-controlled role derivation; no user metadata trust
5. **`user_sessions` is NOT an auth session table** — Correctly documented as realtime-presence only
6. **`UserContextClient` SELECT-only enforcement** — `clients.ts:10` prevents any write via user-context path
7. **SystemClient/UserContextClient separation** — Architecturally enforced
8. **JWT signature verification** — `auth.ts:7` uses HMAC-SHA256 with timing-safe comparison
9. **JWT expiry check** — `auth.ts:7` checks `payload.exp`
10. **Security audit tables append-only** — `03_users_auth.sql:428-461` triggers prevent UPDATE/DELETE

### What needs fixing:

1. **Cookie/header token extraction** — `auth.ts` must support cookie-based token extraction
2. **Refresh endpoint** — Must be implemented for session continuity
3. **CORS configuration** — Must be enabled for cross-origin frontend access
4. **Signup/login/logout endpoints** — Must be implemented for complete auth flow
5. **`aud`/`iss` claim validation** — Should be added for defense-in-depth
6. **`SUPABASE_URL` should be required** — Fail-fast on missing auth provider URL

## 6. Required Fixes

### FIX-01 (HIGH) — Add cookie-based token extraction to `auth.ts`

**Current:** `auth.ts:7` — reads only from `Authorization` header
**Required:** When `Authorization` header is absent, extract token from `binay_access_token` cookie using `request.cookies?.binay_access_token` (requires `cookie-parser` middleware)
**Reason:** Cookie contract says tokens come via cookies; guard must support this
**File:** `04-nestjs-api/04-nestjs-api-app/src/auth.ts:7`

### FIX-02 (HIGH) — Implement refresh token endpoint

**Current:** No refresh endpoint exists
**Required:** `POST /api/v1/auth/refresh` that:
1. Reads `binay_refresh_token` from cookie (path-scoped)
2. Calls Supabase Auth `refreshSession()` with the refresh token
3. Sets new `binay_access_token` and `binay_refresh_token` cookies
4. Returns success response
**Reason:** Token refresh is core to session continuity
**File:** New endpoint in `identity-company.ts` or new `auth-refresh` module

### FIX-03 (HIGH) — Add `aud`/`iss` claim validation to `auth.ts`

**Current:** `auth.ts:7` — checks only `alg`, `sub`, signature, `exp`
**Required:** Add `aud` check (expect `'authenticated'` for Supabase) and `iss` check (expect Supabase project URL)
**Reason:** Defense-in-depth against cross-project JWT acceptance
**File:** `04-nestjs-api/04-nestjs-api-app/src/auth.ts:7`

### FIX-04 (HIGH) — Make `SUPABASE_URL` required in `config.ts`

**Current:** `config.ts:8` — `SUPABASE_URL: z.string().url().optional()`
**Required:** `SUPABASE_URL: z.string().url()` (remove `.optional()`)
**Reason:** Auth flows (signup, login, refresh) require the Supabase Auth URL; missing value should fail at startup
**File:** `04-nestjs-api/04-nestjs-api-app/src/config.ts:8`

### FIX-05 (MEDIUM) — Add CORS configuration to `main.ts`

**Current:** `main.ts:10` — No CORS setup
**Required:** `app.enableCors({ origin: config.CORS_ORIGIN, credentials: true })` — `credentials: true` is required for cookie-based auth
**Reason:** Cross-origin requests from Next.js frontend will be blocked without CORS
**File:** `04-nestjs-api/04-nestjs-api-app/src/main.ts`

### FIX-06 (MEDIUM) — Implement signup endpoint

**Current:** No signup endpoint
**Required:** `POST /api/v1/auth/signup` that calls Supabase Auth `signUp()` and returns safe account summary
**Reason:** User registration is a core auth flow
**File:** New endpoint

### FIX-07 (MEDIUM) — Implement login endpoint

**Current:** No login endpoint
**Required:** `POST /api/v1/auth/login` that calls Supabase Auth `signInWithPassword()` or `signInWithOtp()`, sets cookies, and returns safe account summary
**Reason:** User authentication is a core auth flow
**File:** New endpoint

### FIX-08 (MEDIUM) — Implement logout endpoint

**Current:** No logout endpoint
**Required:** `POST /api/v1/auth/logout` that:
1. Sets `binay_access_token` cookie to `Max-Age=0`
2. Sets `binay_refresh_token` cookie to `Max-Age=0`
3. Deactivates current `user_sessions` presence row
**Reason:** Session termination is required for security
**File:** New endpoint in `identity-company.ts`

### FIX-09 (MEDIUM) — Clarify `SameSite` policy for cross-origin deployments

**Current:** `AUTH-COOKIE-CONTRACT-TEMPORARY.md:12-13` — `SameSite=Lax`
**Required:** Document that:
- Same-origin deployment: `SameSite=Lax` is correct
- Cross-origin deployment: `SameSite=None; Secure` is required for cookies to be sent on API calls
- The `SameSite` value should be environment-configurable
**Reason:** `SameSite=Lax` blocks cookie sending on cross-origin POST requests
**File:** `04-nestjs-api/AUTH-COOKIE-CONTRACT-TEMPORARY.md`

## 7. Open Decision

### OPEN-01 — Auth token transport: cookie-only vs cookie+header vs header-only

**Status:** OPEN DECISION

The current contract says tokens come via cookies (`AUTH-COOKIE-CONTRACT-TEMPORARY.md`). The current code reads only from `Authorization` header (`auth.ts:7`). These are incompatible. The project must decide:

1. **Cookie-only** — `auth.ts` extracts from cookie; no `Authorization` header needed. Pros: simpler for browser. Cons: SSE/WebSocket connections may not send cookies.

2. **Cookie + header** — Frontend sets both cookie (for browser automatic inclusion) AND `Authorization` header (for guard). Pros: works for all transports. Cons: redundancy.

3. **Header-only** — Contract changes to `Authorization: Bearer` header; cookies used only for refresh token. Pros: simplest guard. Cons: access token not auto-included by browser.

**Recommendation:** Option 2 (cookie + header) for maximum compatibility. The guard should check `Authorization` header first, then fall back to cookie.

## 8. Final Implementation Readiness

### What is ready:
- JWT verification guard (`auth.ts`) — cryptographically correct
- Cookie contract design — path isolation, HttpOnly/Secure/SameSite flags correct
- Access model (Controlled Hybrid) — correctly defined in DECISION-01
- `handle_new_user()` trigger — correctly creates `public.users` from `auth.users`
- `UserContextClient`/`SystemClient` separation — correctly implemented
- `/auth/me` endpoint — correctly uses UserContextClient with RLS

### What must be fixed before auth flows work:
1. FIX-01: Cookie-based token extraction in guard (HIGH)
2. FIX-02: Refresh token endpoint (HIGH)
3. FIX-03: `aud`/`iss` claim validation (HIGH)
4. FIX-04: `SUPABASE_URL` required (HIGH)
5. FIX-05: CORS configuration (MEDIUM)
6. FIX-06: Signup endpoint (MEDIUM)
7. FIX-07: Login endpoint (MEDIUM)
8. FIX-08: Logout endpoint (MEDIUM)
9. FIX-09: `SameSite` policy clarification (MEDIUM)

### What is explicitly deferred:
- Cookie `Domain` value (deployment-specific)
- OAuth/SSO provider integration (future scope)
- Multi-factor authentication (not in current scope)
- Token refresh retry/backoff strategy (implementation detail)
- Rate limiting on auth endpoints (environment configuration)

## 9. No-Code-Change Confirmation

This review was performed as a read-only security audit. No code, SQL, or document files were modified. All findings are based on the current state of the repository at the time of review.

---

**Reviewer:** OpenCode (independent Senior Auth/Security Architect review)
**Date:** 2026-08-27
**Status:** APPROVED WITH FIXES
