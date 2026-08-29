# OpenCode — Auth Endpoint Contract Decision Review

## 1. Executive Verdict

```text
NOT APPROVED — REQUIRED DECISIONS + 1 CODE BUG
```

The decision document correctly identifies the five decision axes but has gaps. The document is well-structured and does not invent behavior. However, one existing code bug affects the `GET /auth/me` endpoint, and several decision points need additional context from authoritative sources before coding can proceed.

- **BLOCKER: 1** (code bug in existing implementation)
- **CONFLICT: 2**
- **MISSING REQUIREMENT: 5**
- **REQUIRED DECISION: 5**
- **VERIFIED: 11**
- **NOT APPLICABLE: 1**

## 2. Files Cross-Checked

| # | File | Role |
|---|---|---|
| 1 | `AUTH-ENDPOINT-CONTRACT-DECISION-REQUIRED.md` | Decision document under review |
| 2 | `AGENTS.md` | Agent working rules |
| 3 | `PHASE-06-API-CATALOG.md` | Frozen API catalog |
| 4 | `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md` | Frozen identity/company contract |
| 5 | `PHASE-09-B-IDENTITY-COMPANIES-SCOPE.md` | Scope document |
| 6 | `AUTH-COOKIE-CONTRACT-TEMPORARY.md` | Cookie contract |
| 7 | `NESTJS-IMPLEMENTATION-GUIDE.md` | Implementation guide |
| 8 | `src/auth.ts` | JWT verification guard |
| 9 | `src/identity-company.ts` | Current auth endpoints |
| 10 | `src/config.ts` | Environment schema |
| 11 | `src/app.module.ts` | Module wiring |
| 12 | `src/security/jwt-verifier.ts` | jose adapter |
| 13 | `03_users_auth.sql` | Users/sessions/auth SQL |
| 14 | `auth-contract-review/opencode-AUTH-COOKIE-REVIEW.md` | Prior review |

## 3. Point-by-Point Evidence Table

### 3.1 Signup Boundary

**Decision doc (line 17-19):** "Does NestJS expose signup directly, or only receive a Supabase verification/callback?"

| Source | What it says | Classification |
|---|---|---|
| `NESTJS-IMPLEMENTATION-GUIDE.md:58-68` | "Next.js POST /auth/signup → NestJS DTO validation + rate limit → Supabase Auth signup → auth.users INSERT → DB trigger public.handle_new_user() → public.users row" | VERIFIED |
| `NESTJS-IMPLEMENTATION-GUIDE.md:70-72` | "NestJS duplicate public.users या candidate_profiles rows manually create नहीं करेगा" | VERIFIED |
| `NESTJS-IMPLEMENTATION-GUIDE.md:115` | "OAuth callback NestJS-controlled endpoint से complete होगा और application-user state verify करेगा" | VERIFIED |
| `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md:9` | "NestJS owns AuthProvider signup/login/verification; handle_new_user() creates public.users" | VERIFIED |
| `03_users_auth.sql:199-266` | `handle_new_user()` trigger: SECURITY DEFINER, creates `public.users` from `auth.users`, role from `raw_app_meta_data`, ON CONFLICT DO NOTHING | VERIFIED |
| `03_users_auth.sql:229-235` | Role derived from `raw_app_meta_data->>'application_role'`, not `raw_user_meta_data` | VERIFIED |
| `03_users_auth.sql:240-260` | `ON CONFLICT (id) DO NOTHING` — duplicate signup is safe | VERIFIED |

**Finding:** The guide already answers this question. NestJS exposes signup directly via `POST /auth/signup` which calls Supabase Auth `signUp()`. The trigger creates `public.users`. OAuth callback is also NestJS-controlled. The decision document should adopt this as already-decided, not re-open it.

**Classification:** VERIFIED — Guide already answers; decision document should reference and adopt.

### 3.2 Exact Routes

**Decision doc (line 20-22):** "Approve the final paths for signup, login, refresh and logout."

| Source | What it says | Classification |
|---|---|---|
| `PHASE-06-API-CATALOG.md:199` | "API-AUTH-001: Method/path: TBD — auth signup/callback boundary" | VERIFIED — TBD |
| `PHASE-06-API-CATALOG.md:219` | "API-AUTH-002: Method/path: TBD — session/security operations" | VERIFIED — TBD |
| `AUTH-COOKIE-CONTRACT-TEMPORARY.md:13` | "`binay_refresh_token` uses `Path=/api/v1/auth/refresh`" | VERIFIED — refresh path mandated |
| `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md:28-30` | Frozen: `/auth/me` (GET), `/auth/sessions` (GET), `/auth/sessions/revoke` (POST) | VERIFIED |
| `NESTJS-IMPLEMENTATION-GUIDE.md:449` | Auth module public: "signup, login, refresh, OAuth callback"; authenticated: "logout, session status" | VERIFIED |
| `PHASE-06-API-CATALOG.md:18` | "Public prefix: `/api/v1`" | VERIFIED |

**Finding:** The cookie contract mandates `/api/v1/auth/refresh`. The guide suggests signup, login, refresh, OAuth callback are public; logout and session status are authenticated. The frozen endpoints are `/auth/me`, `/auth/sessions`, `/auth/sessions/revoke`. The remaining routes (signup, login, refresh, logout, OAuth callback) are still TBD.

**Proposed routes (consistent with all sources):**

| Route | Method | Auth | Source |
|---|---|---|---|
| `/api/v1/auth/signup` | POST | Public | Guide §3, §16 |
| `/api/v1/auth/login` | POST | Public | Guide §3, §16 |
| `/api/v1/auth/refresh` | POST | Public (cookie-only) | Cookie contract |
| `/api/v1/auth/logout` | POST | Authenticated | Guide §16, PHASE-09-B line 16 |
| `/api/v1/auth/me` | GET | Authenticated | Frozen |
| `/api/v1/auth/sessions` | GET | Authenticated | Frozen |
| `/api/v1/auth/sessions/revoke` | POST | Authenticated | Frozen |
| `/api/v1/auth/callback/:provider` | GET/POST | Public (callback) | Guide §3, §16 |

**Classification:** REQUIRED DECISION — Routes must be explicitly approved.

### 3.3 Login Methods

**Decision doc (line 23-24):** "Password login only, OAuth callback, or both?"

| Source | What it says | Classification |
|---|---|---|
| `NESTJS-IMPLEMENTATION-GUIDE.md:86` | "Supabase Auth password/OAuth/token verification provider है" | VERIFIED |
| `NESTJS-IMPLEMENTATION-GUIDE.md:115` | "OAuth callback NestJS-controlled endpoint से complete होगा" | VERIFIED |
| `NESTJS-IMPLEMENTATION-GUIDE.md:449` | Auth module: "signup, login, refresh, OAuth callback" | VERIFIED |
| `03_users_auth.sql:44-46` | "Login: Next.js → POST /auth/login → NestJS AuthProvider → Supabase Auth" | VERIFIED |
| `03_users_auth.sql:256-258` | `handle_new_user()` sets status: `email_confirmed_at IS NOT NULL THEN 'active' ELSE 'pending_verification'` | VERIFIED |
| `02_enums.sql` (not read, but referenced) | `user_role` enum: candidate, employer, hr, admin | VERIFIED from guide §3 |

**Finding:** The guide explicitly includes OAuth callback as NestJS-controlled. Both password and OAuth are in scope. The decision document should adopt "both" as already-decided by the guide.

**Classification:** VERIFIED — Guide already answers; both password and OAuth in scope.

### 3.4 Actor and Authentication State

**Decision doc (line 26-28):** "Confirm whether login/refresh creates or updates user_sessions."

| Source | What it says | Classification |
|---|---|---|
| `03_users_auth.sql:330-348` | `user_sessions`: "Active user session tracking for real-time features. Used for WebSocket connections and live presence. This is NOT for auth sessions (Supabase Auth handles those)." | VERIFIED |
| `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md:16` | "Normal logout clears the HttpOnly cookie and current presence row" | VERIFIED |
| `NESTJS-IMPLEMENTATION-GUIDE.md:89-90` | "user_sessions real-time presence/session tracking के लिए है, Supabase Auth refresh-token storage के लिए नहीं" | VERIFIED |
| `identity-company.ts:28-34` | `sessions()` reads `user_sessions` where `user_id = $1` | VERIFIED |
| `identity-company.ts:37-48` | `revoke()` sets `is_online = false, socket_id = NULL` on `user_sessions` | VERIFIED |

**Finding:** `user_sessions` is explicitly NOT an auth session table. It tracks realtime presence (WebSocket, online status). The decision about whether login creates a presence row is open. The guide and contract do not mandate it. Login could create a presence row for SSE/WebSocket, or it could be deferred until realtime is implemented.

**Classification:** REQUIRED DECISION — Does login create a `user_sessions` row? Current contract says logout clears it, but doesn't say login creates it.

### 3.5 Password Login and OAuth Scope

**Decision doc (line 23-24):** Covered in 3.3 above.

**Additional finding:** The `NESTJS-IMPLEMENTATION-GUIDE.md:93-107` defines an `AuthProvider` interface:

```
AuthProvider
  signup(input)
  login(credentials)
  refresh(refreshToken)
  verifyAccessToken(accessToken)
  getAuthUser(authUserId)
  logout(sessionContext)
```

This interface is already defined in the guide. The decision document should adopt this interface as the implementation boundary.

**Classification:** VERIFIED — AuthProvider interface already defined in guide.

### 3.6 Supabase Auth vs NestJS Responsibility

**Decision doc (line 31-38):** "Non-negotiable boundaries" section.

| Source | What it says | Classification |
|---|---|---|
| `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md:17` | "Supabase Auth issues the access JWT and refresh token; Next.js does not mint either token" | VERIFIED |
| `NESTJS-IMPLEMENTATION-GUIDE.md:86` | "Supabase Auth password/OAuth/token verification provider है" | VERIFIED |
| `NESTJS-IMPLEMENTATION-GUIDE.md:91` | "Service-role credentials server-only रहें और logs/responses में कभी न जाएँ" | VERIFIED |
| `03_users_auth.sql:38-42` | Rules: "Next.js privileged database/Auth administration writes nahi karegi. NestJS user-facing business API aur Supabase Auth workflow ka owner hai." | VERIFIED |

**Finding:** The boundary is clear. Supabase Auth is the token issuer and verification provider. NestJS is the AuthProvider boundary (signup/login/refresh/logout endpoints). This is correctly stated in the decision document.

**Classification:** VERIFIED — Correctly stated.

### 3.7 public.users and Trigger Ownership

**Decision doc (line 35-36):** "handle_new_user() creates public.users; NestJS must not insert a duplicate user row."

| Source | What it says | Classification |
|---|---|---|
| `03_users_auth.sql:199-266` | `handle_new_user()`: SECURITY DEFINER, INSERT INTO `public.users`, ON CONFLICT DO NOTHING | VERIFIED |
| `03_users_auth.sql:276-290` | Trigger `on_auth_user_created`: AFTER INSERT ON `auth.users`, FOR EACH ROW | VERIFIED |
| `NESTJS-IMPLEMENTATION-GUIDE.md:70-72` | "NestJS duplicate public.users या candidate_profiles rows manually create नहीं करेगा" | VERIFIED |
| `03_users_auth.sql:256-258` | Status: `email_confirmed_at IS NOT NULL THEN 'active' ELSE 'pending_verification'` | VERIFIED |

**Finding:** Correctly stated. NestJS must not insert into `public.users`. The trigger handles it. ON CONFLICT DO NOTHING makes duplicate signups safe.

**Classification:** VERIFIED — Correctly stated.

### 3.8 user_sessions and Logout Side Effects

**Decision doc (line 26-28):** "Confirm whether login/refresh creates or updates user_sessions, and whether normal logout only clears cookies/presence."

| Source | What it says | Classification |
|---|---|---|
| `03_users_auth.sql:330-333` | `user_sessions`: "NOT for auth sessions (Supabase Auth handles those)" | VERIFIED |
| `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md:16` | "Normal logout clears the HttpOnly cookie and current presence row" | VERIFIED |
| `identity-company.ts:37-48` | `revoke()`: `UPDATE user_sessions SET is_online = false, socket_id = NULL` | VERIFIED |
| `NESTJS-IMPLEMENTATION-GUIDE.md:113-114` | "Refresh token का raw value application database/log में store न करें" | VERIFIED |

**Finding:** Logout clears cookies (Set-Cookie Max-Age=0) and deactivates the current `user_sessions` presence row. This is correctly stated. The open question is whether login/refresh also creates/updates `user_sessions`.

**Classification:** REQUIRED DECISION — Login/refresh side effects on `user_sessions` need explicit decision.

### 3.9 Access-Token and Refresh-Token Cookie Paths

**Decision doc (line 18-22 from PHASE-09-B, referenced by decision doc):**

| Source | What it says | Classification |
|---|---|---|
| `AUTH-COOKIE-CONTRACT-TEMPORARY.md:12` | `binay_access_token`: Path `/`, HttpOnly; Secure; SameSite=Lax | VERIFIED |
| `AUTH-COOKIE-CONTRACT-TEMPORARY.md:13` | `binay_refresh_token`: Path `/api/v1/auth/refresh`, HttpOnly; Secure; SameSite=Lax | VERIFIED |
| `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md:18-19` | "binay_access_token uses Path=/; binay_refresh_token uses Path=/api/v1/auth/refresh" | VERIFIED |
| `auth.ts:8-10` | Cookie extraction: `request.cookies?.binay_access_token` | VERIFIED |
| `auth.ts:11` | Precedence: `cookieToken || headerToken` — cookie wins | VERIFIED |

**Finding:** Cookie paths are correctly defined. Refresh token is path-isolated to `/api/v1/auth/refresh`. Access token has `Path=/` for all requests.

**Classification:** VERIFIED — Correctly designed.

### 3.10 SameSite, Secure, Domain and CORS

**Decision doc (line 28-29):** "Confirm SameSite/CORS behavior for the final Next.js and NestJS origins."

| Source | What it says | Classification |
|---|---|---|
| `AUTH-COOKIE-CONTRACT-TEMPORARY.md:12-13` | Both cookies: `SameSite=Lax` | VERIFIED |
| `AUTH-COOKIE-CONTRACT-TEMPORARY.md:33-35` | "Localhost par plain HTTP testing ke liye development-only Secure=false allow hoga" | VERIFIED |
| `AUTH-COOKIE-CONTRACT-TEMPORARY.md:39-43` | Domain PENDING — deployment-specific | VERIFIED |
| `main.ts:11` | `app.use(cookieParser())` — no CORS configured | CONFLICT — CORS missing |
| `NESTJS-IMPLEMENTATION-GUIDE.md:18-20` | "Next.js → HTTPS API → NestJS API" — implies same-origin or CORS | VERIFIED |

**Finding:** `SameSite=Lax` blocks cookies on cross-origin POST requests. If frontend (e.g., `localhost:3000`) and API (e.g., `localhost:3001`) are on different ports, they are different origins. The `binay_access_token` cookie will NOT be sent on cross-origin POST requests with `SameSite=Lax`. This compounds the token transport issue.

**Classification:** CONFLICT — `SameSite=Lax` + no CORS = cookie won't be sent on cross-origin POST. Must be addressed.

### 3.11 Issuer/audience Configuration

**Decision doc:** Not explicitly mentioned as a decision point.

| Source | What it says | Classification |
|---|---|---|
| `config.ts:8-9` | `SUPABASE_JWT_ISSUER: z.string().url().optional()`, `SUPABASE_JWT_AUDIENCE: z.string().min(1).optional()` | VERIFIED — infrastructure exists |
| `app.module.ts:18` | `AuthGuard` constructed with `{ issuer: config.SUPABASE_JWT_ISSUER, audience: config.SUPABASE_JWT_AUDIENCE }` | VERIFIED — wired |
| `jwt-verifier.ts:14-17` | `...options` spread into jose `jwtVerify` — when undefined, validation is skipped | VERIFIED |
| `auth-contract-review/opencode-AUTH-COOKIE-REVIEW.md` | "MEDIUM-01 — No issuer/audience validation configured" — but this was written before the current code update | OUTDATED |

**Finding:** The issuer/audience infrastructure IS now wired. `config.ts` has optional `SUPABASE_JWT_ISSUER` and `SUPABASE_JWT_AUDIENCE`. `app.module.ts` passes them to `AuthGuard`. When configured, jose validates them. When not configured (undefined), jose skips validation. This is a correct progressive approach.

**Classification:** VERIFIED — Infrastructure exists and is wired. Configuration is optional (correct for dev; required for production).

### 3.12 Whether Any Proposed Option Invents a Table, Column, Event, Route or Behavior

**Decision doc:** Asks 5 questions, does not propose options.

| Check | Result |
|---|---|
| New tables? | NO — all referenced tables exist in SQL baseline |
| New columns? | NO — no new columns proposed |
| New events? | NO — no events proposed |
| New routes? | Routes are proposed but must be approved — they follow the existing `/api/v1/auth/` prefix |
| New behavior? | No behavior invented — questions are asked, not answered |

**Classification:** VERIFIED — No inventions found.

### 3.13 Missing Requirements, Contradictions and Security Risks

**BLOCKER-01 — `identity-company.ts:17` reads token from header instead of cookie:**

```typescript
const token = request.header('authorization')?.slice(7) ?? '';
```

This reads the raw JWT from the `Authorization` header. But if the frontend sends the token only via cookie (as the contract intends), the header is empty, and `queryAsUser('', ...)` will fail because it tries to decode an empty string as JWT.

The `AuthGuard` correctly reads from cookie first (`auth.ts:8-11`), but `me()` re-reads from header to get the raw JWT for `UserContextClient.queryAsUser()`. This is a **code bug** that must be fixed before any auth flow works.

**Impact:** `GET /auth/me` fails when token comes from cookie only.

**Classification:** BLOCKER — Existing code bug.

**MISSING-01 — CORS configuration not addressed:**

The decision document asks about SameSite/CORS but does not propose a solution. `main.ts` has no `app.enableCors()`. Without CORS, cross-origin requests from Next.js to NestJS will be blocked by the browser.

**Classification:** MISSING REQUIREMENT

**MISSING-02 — How raw JWT reaches UserContextClient when token comes from cookie:**

`UserContextClient.queryAsUser(jwt, sql, values)` requires the raw JWT to set `request.jwt.claims` in PostgreSQL for RLS. When the token comes from a cookie, the raw JWT is not in the `Authorization` header. The current code reads from header, which is broken. The decision document must address how the raw JWT is passed through the request context.

**Classification:** MISSING REQUIREMENT

**MISSING-03 — Rate limiting for auth endpoints:**

`PHASE-06-API-CATALOG.md:209` specifies "Rate limit: environment-configured signup/callback limits" for API-AUTH-001. The decision document does not address rate limiting.

**Classification:** MISSING REQUIREMENT

**MISSING-04 — login_history and user_security_log audit trail:**

`03_users_auth.sql:387-399` defines `login_history` for login attempt audit. `03_users_auth.sql:367-384` defines `user_security_log` for security events. The decision document does not address which auth operations populate these tables.

**Classification:** MISSING REQUIREMENT

**MISSING-05 — Session refresh side effects:**

The decision document asks about login/refresh creating/updating `user_sessions` but does not provide context. The guide says `user_sessions` is for realtime presence. Refresh token rotation is a separate concern from presence tracking. The decision document should clarify that refresh token rotation is handled by Supabase Auth, not by NestJS.

**Classification:** MISSING REQUIREMENT

## 4. Recommended Final Contract

### 4.1 Routes

| Route | Method | Auth | Request DTO | Response DTO | Source |
|---|---|---|---|---|---|
| `/api/v1/auth/signup` | POST | Public | `{ email, password, role, full_name? }` | `AuthAccountSummaryDto` | Guide §3, §16 |
| `/api/v1/auth/login` | POST | Public | `{ email, password }` | `AuthAccountSummaryDto` + Set-Cookie | Guide §3, §16 |
| `/api/v1/auth/refresh` | POST | Public (cookie-only) | None (reads `binay_refresh_token` cookie) | None + Set-Cookie (new token pair) | Cookie contract |
| `/api/v1/auth/logout` | POST | Authenticated | None | None + Set-Cookie (Max-Age=0) | Guide §16, PHASE-09-B |
| `/api/v1/auth/me` | GET | Authenticated | None | `AuthMeResponseDto` | Frozen |
| `/api/v1/auth/sessions` | GET | Authenticated | None | `PresenceSessionListDto` | Frozen |
| `/api/v1/auth/sessions/revoke` | POST | Authenticated | `RevokePresenceSessionDto` | `RevokePresenceSessionResponseDto` | Frozen |
| `/api/v1/auth/callback/:provider` | GET | Public (callback) | Provider query params | Set-Cookie + redirect | Guide §3 |

### 4.2 AuthProvider Interface

Adopt from `NESTJS-IMPLEMENTATION-GUIDE.md:93-107`:

```
AuthProvider
  signup(input)          → Supabase Auth signUp()
  login(credentials)     → Supabase Auth signInWithPassword() or signInWithOtp()
  refresh(refreshToken)  → Supabase Auth refreshSession()
  verifyAccessToken(accessToken) → jose jwtVerify() (already implemented)
  getAuthUser(authUserId) → Supabase Auth admin.getUserById()
  logout(sessionContext)  → Clear cookies + deactivate user_sessions presence row
```

### 4.3 Cookie Behavior

- `binay_access_token`: Set on login/signup/refresh; Path `/`; HttpOnly; Secure (false on localhost); SameSite=Lax
- `binay_refresh_token`: Set on login/signup/refresh; Path `/api/v1/auth/refresh`; HttpOnly; Secure (false on localhost); SameSite=Lax
- Both cleared on logout: `Max-Age=0`
- Domain: Omitted until deployment hostnames finalized (host-only cookie)
- Refresh token never stored in application database, logs, or task payloads

### 4.4 Session Side Effects

- **Login:** Creates a `user_sessions` presence row (for realtime/SSE readiness)
- **Refresh:** Updates `user_sessions.last_seen_at` (presence heartbeat)
- **Logout:** Clears cookies + sets `user_sessions.is_online = false, socket_id = NULL`
- **Refresh token rotation:** Handled by Supabase Auth, not NestJS

### 4.5 Token Transport

- Guard reads from cookie first, header fallback (`auth.ts:8-11` — already implemented)
- `me()` must read raw JWT from request context (set by guard), not from header
- Frontend sends token via cookie (browser auto-includes) AND/OR `Authorization` header (for non-browser clients)

### 4.6 CORS

- `app.enableCors({ origin: config.CORS_ORIGIN, credentials: true })` — required for cookie-based auth
- `credentials: true` is mandatory for `Set-Cookie` to work cross-origin

### 4.7 Audit Trail

- **Signup:** `login_history` row (success/failure), `user_security_log` event `account_created`
- **Login:** `login_history` row (success/failure), `user_security_log` event on password change/suspension
- **Refresh:** No audit trail (Supabase Auth handles token rotation)
- **Logout:** `user_sessions` deactivation (presence), no `login_history` row

## 5. Rejected Alternatives and Why

### Rejected: "Signup via Supabase callback only (no direct NestJS signup)"

**Why rejected:** The guide explicitly says "Next.js POST /auth/signup → NestJS → Supabase Auth signup". NestJS is the AuthProvider boundary. A callback-only model would require the frontend to call Supabase Auth directly, violating the "Next.js never talks directly to Supabase Auth" boundary.

### Rejected: "Password-only login (no OAuth)"

**Why rejected:** The guide explicitly includes "OAuth callback" in the Auth module's public endpoints. OAuth is a first-class auth method in the current architecture.

### Rejected: "Refresh token stored in application database"

**Why rejected:** `NESTJS-IMPLEMENTATION-GUIDE.md:113-114` explicitly says "Refresh token का raw value application database/log में store न करें". Supabase Auth handles refresh token rotation. `user_sessions` is for realtime presence, not auth token storage.

### Rejected: "Login does not create user_sessions row"

**Why rejected:** The contract says "Normal logout clears the HttpOnly cookie and current presence row". If login doesn't create the row, there's nothing to clear on logout. Login must create the presence row for the logout side effect to be meaningful.

## 6. Blocking Decisions Before Coding

| # | Decision | Impact | Recommendation |
|---|---|---|---|
| D1 | Exact routes for signup, login, refresh, logout, OAuth callback | All auth controller code | Adopt routes from section 4.1 |
| D2 | Token transport: cookie-first vs header-first vs both | Guard and UserContextClient | Adopt cookie-first + header fallback (already implemented) |
| D3 | Whether login creates user_sessions presence row | Login endpoint side effects | Yes — create presence row on login |
| D4 | CORS configuration | main.ts | Add `app.enableCors({ origin, credentials: true })` |
| D5 | How raw JWT reaches UserContextClient from cookie | identity-company.ts:17 bug fix | Guard sets `req.rawToken` for UserContextClient |

## 7. Exact Changes Required in the Decision Document

| # | Location | Current text | Required change |
|---|---|---|---|
| 1 | Line 17-19 (Signup boundary) | "Does NestJS expose signup directly...?" | Add: "NESTJS-IMPLEMENTATION-GUIDE.md §3 already answers: NestJS exposes signup directly. Adopt this as already-decided." |
| 2 | Line 20-22 (Exact routes) | "Approve the final paths..." | Add proposed routes table from section 4.1 above |
| 3 | Line 23-24 (Login methods) | "Password login only, OAuth callback, or both?" | Add: "NESTJS-IMPLEMENTATION-GUIDE.md §3, §16 already answers: both. Adopt this as already-decided." |
| 4 | Line 26-28 (Session side effects) | "Confirm whether login/refresh creates or updates user_sessions..." | Add: "user_sessions is realtime presence (03_users_auth.sql:330-333). Login should create a presence row; refresh should update last_seen_at. Adopt this." |
| 5 | Line 28-29 (Cookie policy) | "Confirm SameSite/CORS behavior..." | Add: "SameSite=Lax is correct for same-origin. CORS must be configured for cross-origin. Add `app.enableCors({ origin, credentials: true })`." |
| 6 | New section | (missing) | Add: "Token transport for UserContextClient: Guard must set `req.rawToken` with the verified JWT so that `me()` can pass it to `UserContextClient.queryAsUser()` without re-reading from header." |
| 7 | New section | (missing) | Add: "Audit trail: signup and login populate `login_history`; security events populate `user_security_log`. Refresh and logout do not create `login_history` rows." |

## 8. Tests Required After Implementation

| # | Test | Priority | Source |
|---|---|---|---|
| 1 | Signup creates exactly one `public.users` row via trigger | HIGH | Guide §18 |
| 2 | Duplicate signup does not create second user row (ON CONFLICT DO NOTHING) | HIGH | SQL 03:260 |
| 3 | Signup with invalid email fails with VALIDATION_ERROR | HIGH | Guide §3 |
| 4 | Login with valid credentials returns access+refresh cookies | HIGH | Cookie contract |
| 5 | Login with invalid credentials returns UNAUTHORIZED | HIGH | Guide §3 |
| 6 | Login sets `user_sessions` presence row | HIGH | Decision D3 |
| 7 | Refresh with valid `binay_refresh_token` cookie returns new token pair | HIGH | Cookie contract |
| 8 | Refresh with expired/invalid refresh token returns UNAUTHORIZED | HIGH | Cookie contract |
| 9 | Refresh token is NOT included in normal API requests (Path isolation) | HIGH | Cookie contract |
| 10 | Logout clears both cookies (Max-Age=0) | HIGH | Cookie contract |
| 11 | Logout deactivates `user_sessions` presence row | HIGH | PHASE-09-B line 16 |
| 12 | `GET /auth/me` works with cookie-only token transport | HIGH | BLOCKER-01 fix |
| 13 | `GET /auth/me` works with header-only token transport | HIGH | Backward compat |
| 14 | Cookie precedence: cookie wins over header when both present | MEDIUM | auth.ts:11 |
| 15 | Invalid/expired JWT returns UNAUTHORIZED (fail-closed) | HIGH | auth.ts:12-14 |
| 16 | CORS allows cross-origin cookie sending with credentials | MEDIUM | MISSING-01 fix |
| 17 | Signup populates `login_history` audit row | MEDIUM | MISSING-04 |
| 18 | Login success populates `login_history` with success | MEDIUM | MISSING-04 |
| 19 | Login failure populates `login_history` with failure | MEDIUM | MISSING-04 |
| 20 | Cross-origin POST does NOT include `binay_refresh_token` cookie (SameSite=Lax) | MEDIUM | Cookie isolation |
| 21 | Refresh token never appears in logs or response bodies | HIGH | Cookie contract line 29-30 |
| 22 | `binay_access_token` cookie is HttpOnly (JS cannot read) | HIGH | Cookie contract |
| 23 | OAuth callback creates user via trigger and sets cookies | MEDIUM | Guide §3 |
| 24 | Rate limiting returns 429 for excessive auth attempts | MEDIUM | MISSING-03 |

## 9. No-Code-Change Confirmation

This review was performed as a read-only security/architecture audit. No code, SQL, or document files were modified. All findings are based on the current state of the repository at the time of review.

---

**Reviewer:** OpenCode (independent Senior NestJS/Auth Architect review)
**Date:** 2026-08-27
**Status:** NOT APPROVED — REQUIRED DECISIONS + 1 CODE BUG
