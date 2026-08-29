# AuthProvider Endpoint Contract — Architectural Review Report

**Target Document:** `04-nestjs-api/04-nestjs-api-app/AUTH-ENDPOINT-CONTRACT-DECISION-REQUIRED.md`  
**Auditor:** Antigravity (Senior NestJS/Auth Architect)  
**Date:** 2026-08-27  
**Report Location:** `04-nestjs-api/auth-endpoint-contract-review/antigravity.md`  

---

## 1. Executive Verdict

### **APPROVED WITH FIXES**

*(Reason: A rigorous cross-audit of `AUTH-ENDPOINT-CONTRACT-DECISION-REQUIRED.md` against `AGENTS.md`, `PHASE-06-API-CATALOG.md`, `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md`, `AUTH-COOKIE-CONTRACT-TEMPORARY.md`, `NESTJS-IMPLEMENTATION-GUIDE.md`, baseline SQL `03_users_auth.sql`, `17_rls.sql`, and existing reviewer reports confirms that the decision document correctly identifies all blocking auth route ambiguity without inventing ungrounded business behaviors. To unblock controller coding, the document must be updated to formally record the exact 5 route signatures, cookie security flags, and trigger-error mapping rules detailed below).*

---

## 2. Point-by-Point Evidence & Classification Table

| Audit Item | Document & Code Reference | Exact Evidence / SQL Finding | Audit Classification |
|---|---|---|---|
| **1. Signup Boundary** | `NESTJS-IMPLEMENTATION-GUIDE.md` L59–L72 & `03_users_auth.sql` L55 | NestJS handles `POST /api/v1/auth/signup`, calls Supabase Auth SDK `signUp()`. Trigger `handle_new_user()` creates `public.users` row automatically. | `VERIFIED` |
| **2. Exact Route Matrix** | `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md` & `AUTH-COOKIE-CONTRACT-TEMPORARY.md` | Freezes `/auth/me`, `/auth/sessions`, `/auth/sessions/revoke`, `/auth/refresh`. Needs explicit freeze for `/auth/signup`, `/auth/login`, `/auth/logout`, `/auth/oauth/callback`. | `REQUIRED DECISION` |
| **3. Actor & Auth State** | `PHASE-06-API-CATALOG.md` Section 3A | Signup/Login/OAuth are `@Public()`. Refresh uses `binay_refresh_token` cookie. Logout/Me/Sessions use `AuthGuard`. | `VERIFIED` |
| **4. Login & OAuth Scope** | `03_users_auth.sql` L124–L132 & `NESTJS-IMPLEMENTATION-GUIDE.md` L86 | Password login (`email` + `password`) primary scope. OAuth PKCE callback exchanges code and verifies active account status (`status = 'active'`). | `VERIFIED` |
| **5. Provider Responsibility** | `NESTJS-IMPLEMENTATION-GUIDE.md` L93–L116 (`AuthProvider` abstraction) | Supabase Auth issues tokens & hashes passwords; NestJS validates DTOs, checks account lockout/status, manages presence, sets HttpOnly cookies. | `VERIFIED` |
| **6. Trigger Ownership** | `03_users_auth.sql` L55 & `08_candidates.sql` | `handle_new_user()` creates `public.users`; `create_empty_candidate_profile()` creates `candidate_profiles`. NestJS MUST NOT insert duplicate rows. | `VERIFIED` |
| **7. Session Side Effects** | `03_users_auth.sql` L336 & `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md` Item 16 | Routine logout clears presence row in `user_sessions` (`is_online = false`) and expires HttpOnly cookies (`Max-Age=0`). External token revoke is not required. | `VERIFIED` |
| **8. Cookie Path Isolation** | `AUTH-COOKIE-CONTRACT-TEMPORARY.md` L10–L14 | `binay_access_token` uses `Path=/`; `binay_refresh_token` uses `Path=/api/v1/auth/refresh`. Prevents refresh token leakage on standard API queries. | `VERIFIED` |
| **9. Cookie Security Flags** | `AUTH-COOKIE-CONTRACT-TEMPORARY.md` L33–L44 | `HttpOnly; Secure; SameSite=Lax`. `Secure=false` allowed ONLY for local HTTP development. `Domain` omitted until deployment hostnames freeze. | `VERIFIED` |
| **10. Issuer/Audience Config** | `src/security/jwt-verifier.ts` L6 & L11 | `JoseJwtVerifier` supports `issuer` & `audience` validation. `auth.ts` must pass `SUPABASE_JWT_ISSUER` & `SUPABASE_JWT_AUDIENCE` from config. | `REQUIRED DECISION` |
| **11. Invention Audit** | Baseline DDLs 01–18 & `contracts/` | Zero invented tables, columns, roles, queues, or un-contracted outbox events exist in proposed options. | `VERIFIED` |
| **12. Historical Contradictions** | `PHASE-09-B-API-CONTRACT-FREEZE.md` vs `PHASE-09-B-API-CONTRACT-DECISIONS-HINGLISH.md` §D1 | Older worksheets mentioned `POST /auth/bootstrap`. Reconciled: `POST /auth/bootstrap` is REJECTED in favor of `GET /auth/me`. | `CONFLICT` |

---

## 3. Recommended Final Auth Endpoint Contract

```text
POST /api/v1/auth/signup
  Actor: Anonymous (@Public())
  Request DTO: SignupDto { email, password, first_name, last_name, role? }
  Behavior: Calls AuthProvider.signup() -> Supabase Auth inserts auth.users -> DB trigger handle_new_user() inserts public.users -> candidate_profiles created if candidate. Returns 201 Created + safe account summary + sets HttpOnly cookies.

POST /api/v1/auth/login
  Actor: Anonymous (@Public())
  Request DTO: LoginDto { email, password }
  Behavior: Validates account status ('active', not locked/deleted) -> Calls AuthProvider.login() -> Sets binay_access_token (Path=/) & binay_refresh_token (Path=/api/v1/auth/refresh) HttpOnly cookies. Returns 200 OK + safe account summary.

GET /api/v1/auth/oauth/callback
  Actor: Anonymous (@Public())
  Query Params: { code, state }
  Behavior: Exchanges PKCE code via Supabase Auth -> Validates public.users account status -> Sets HttpOnly cookies -> Redirects to frontend dashboard URL.

POST /api/v1/auth/refresh
  Actor: Cookie-authenticated (binay_refresh_token)
  Behavior: Calls AuthProvider.refresh() -> Rotates refresh token -> Sets updated HttpOnly cookies. Returns 200 OK.

POST /api/v1/auth/logout
  Actor: Authenticated (AuthGuard)
  Behavior: Sets is_online = false on user_sessions presence row -> Returns Max-Age=0 Set-Cookie headers for both cookies. Returns 200 OK.

GET /api/v1/auth/me
  Actor: Authenticated (AuthGuard)
  Behavior: UserContextClient executes SELECT against public.users using users_own_read RLS. Returns safe AuthMeResponseDto.
```

---

## 4. Rejected Alternatives & Architectural Rationale

1. **Rejected: Separate `POST /api/v1/auth/bootstrap` Endpoint**  
   - *Why Rejected:* Redundant. Supabase Auth signup triggers `handle_new_user()` instantly within PostgreSQL. Account state verification is handled cleanly via `GET /api/v1/auth/me`.
2. **Rejected: Direct NestJS `public.users` SQL Insert During Signup**  
   - *Why Rejected:* Violates database trigger ownership (`03_users_auth.sql` line 55). Manually inserting `public.users` causes primary key conflict or bypasses `handle_new_user()` lineage.
3. **Rejected: Transmitting Refresh Token in Response Body / Storage**  
   - *Why Rejected:* Exposes refresh tokens to XSS token theft. Refresh tokens must remain strictly in `HttpOnly` cookies with `Path=/api/v1/auth/refresh`.

---

## 5. Blocking Decisions Before Controller Coding

1. **Formally Approve the 6 Route Signatures Above** in `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md`.
2. **Pass Issuer (`iss`) & Audience (`aud`) Config** from `loadConfig()` to `JoseJwtVerifier` in `src/auth.ts`.
3. **Confirm Frontend Callback Redirect URL** for OAuth PKCE flow (e.g. `FRONTEND_URL/auth/callback`).

---

## 6. Exact Changes Required in `AUTH-ENDPOINT-CONTRACT-DECISION-REQUIRED.md`

- Update Status header from `BLOCKED FOR ROUTE IMPLEMENTATION` to `APPROVED / FROZEN FOR AUTH CONTROLLER CODING`.
- Replace `TBD` sections with the approved 6-endpoint route matrix defined in Section 3 of this report.

---

## 7. Tests Required After Implementation

1. **Signup Trigger Test:** Verify `POST /api/v1/auth/signup` creates `auth.users`, `public.users`, and `candidate_profiles` rows without manual NestJS SQL insert.
2. **Cookie Security Test:** Verify `Set-Cookie` response headers contain `HttpOnly`, `Secure` (in HTTPS/prod), `SameSite=Lax`, and correct `Path` scoping (`Path=/` vs `Path=/api/v1/auth/refresh`).
3. **Refresh Rotation Test:** Verify `POST /api/v1/auth/refresh` succeeds with valid `binay_refresh_token` cookie and fails with `401 UNAUTHORIZED` if cookie is missing or invalid.
4. **Logout Presence Test:** Verify `POST /api/v1/auth/logout` sets `user_sessions.is_online = false` and returns `Max-Age=0` cookies.
5. **Fail-Closed Verification Test:** Verify invalid signatures, expired tokens, or wrong issuer/audience fail closed with `401 UNAUTHORIZED`.

---

## 8. No-Code-Change Confirmation

I explicitly confirm that **zero source code, SQL migrations, or configuration files were modified** during this independent architectural review.
