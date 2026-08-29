# NestJS Authentication & Cookie Contract Security Review Report

**Target Domain:** NestJS AuthProvider Boundary, Cookie Security, and Token Transport  
**Auditor:** Antigravity (Senior Auth & Security Architect)  
**Date:** 2026-08-27  
**Report Location:** `04-nestjs-api/auth-contract-review/antigravity-AUTH-COOKIE-REVIEW.md`  

---

## 1. Executive Verdict

### **APPROVED WITH FIXES**

*(Reason: The authentication architecture, token lifecycle, and cookie contract strictly follow zero-trust security principles. Supabase Auth acts as the sole Identity Provider issuing access JWTs and refresh tokens; Next.js never mints tokens or accesses Supabase directly. Access and refresh token cookies are properly isolated via HTTP paths to eliminate refresh token leakage. One minor implementation update is required in `src/auth.ts` to support reading the `binay_access_token` HttpOnly cookie in addition to the `Authorization: Bearer` header).*

---

## 2. Files Reviewed

1. `AGENTS.md` (Mandatory Working Rules)
2. `04-nestjs-api/AUTH-COOKIE-CONTRACT-TEMPORARY.md` (Provisional Cookie Specifications)
3. `04-nestjs-api/PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md` (Frozen API & Token Catalog)
4. `04-nestjs-api/PHASE-08-IMPLEMENTATION-PLAN.md` (Work Package 08-A Foundation & Auth)
5. `04-nestjs-api/04-nestjs-api-app/src/auth.ts` (Implemented AuthGuard & JWT verification helper)
6. Baseline SQL: `02-database/migrations/baseline/03_users_auth.sql`
7. Requirements: `04-nestjs-api/PHASE-05-FINAL-REQUIREMENTS.md`

---

## 3. Evidence-Based Security Verification Matrix

| Verification Criterion | Approved Requirement & Architecture | Executable Code / SQL Evidence | Audit Result & Status |
|---|---|---|---|
| **Token Issuer** | Supabase Auth is the sole Identity Provider issuing access JWTs and refresh tokens. | `03_users_auth.sql` L34–L46 & `AUTH-COOKIE-CONTRACT-TEMPORARY.md` L18–L21. | ✅ **VALIDATED** |
| **Next.js Boundary** | Next.js browser client never mints tokens, never accesses Supabase Auth/DB directly, and calls NestJS API exclusively. | `PHASE-08-IMPLEMENTATION-PLAN.md` §1 L11 & `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md` Item 10. | ✅ **VALIDATED** |
| **AuthProvider Scope** | NestJS owns AuthProvider signup/login/verification/refresh. `handle_new_user()` trigger owns `public.users` creation. | `03_users_auth.sql` L55 (`on_auth_user_created` trigger) & `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md` Item 9. | ✅ **VALIDATED** |
| **Cookie Path Isolation** | `binay_access_token` uses `Path=/`; `binay_refresh_token` uses `Path=/api/v1/auth/refresh`. | `AUTH-COOKIE-CONTRACT-TEMPORARY.md` L10–L14. Refresh token is NEVER sent on standard `/api/v1/*` requests. | ✅ **VALIDATED** |
| **Security Flags & Localhost** | `HttpOnly; Secure; SameSite=Lax`. `Secure=false` allowed ONLY for local HTTP development. | `AUTH-COOKIE-CONTRACT-TEMPORARY.md` L33–L35. Prevents XSS token theft. | ✅ **VALIDATED** |
| **Logout & Revocation** | Logout clears HttpOnly cookies via `Max-Age=0` and presence row in `user_sessions`. Routine Auth token revocation not required. | `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md` Item 16 & `03_users_auth.sql` L336 (`user_sessions`). | ✅ **VALIDATED** |
| **Cookie Domain Status** | Omitted in development/config until deployment hostnames are finalized. | `AUTH-COOKIE-CONTRACT-TEMPORARY.md` L37–L44. Prevents cross-domain security misconfigurations. | 🟡 **OPEN DECISION** (Pending deployment config) |

---

## 4. Code vs Documentation Contradiction & Gap Analysis

### **FINDING-01 (Severity: MEDIUM)**
- **File & Line:** `04-nestjs-api/04-nestjs-api-app/src/auth.ts` Line 7
- **Issue:** `verifyBearer()` currently extracts the JWT strictly from the `Authorization: Bearer <token>` HTTP header:
  ```typescript
  const value = request.header('authorization');
  if (!value?.startsWith('Bearer ')) throw new UnauthorizedException('UNAUTHORIZED');
  ```
- **Contradiction / Gap:** `AUTH-COOKIE-CONTRACT-TEMPORARY.md` and `PHASE-09-B-API-CONTRACT-FINAL-FREEZE-CANDIDATE.md` establish that web browsers authenticate primarily via the `binay_access_token` HttpOnly cookie.
- **Required Fix:** Update `verifyBearer()` to extract the access token from cookies first (`request.cookies?.['binay_access_token']`), falling back to the `Authorization: Bearer` header for non-browser API clients:
  ```typescript
  const token = request.cookies?.['binay_access_token'] || 
                (request.header('authorization')?.startsWith('Bearer ') ? request.header('authorization')?.slice(7) : null);
  if (!token) throw new UnauthorizedException('UNAUTHORIZED');
  ```

---

## 5. Security & Authorization Analysis

1. **XSS Protection:** Setting `HttpOnly` on both `binay_access_token` and `binay_refresh_token` ensures that client-side JavaScript (`document.cookie`) cannot access or read authentication tokens, rendering XSS-based token exfiltration impossible.
2. **CSRF Mitigation:** `SameSite=Lax` combined with custom API headers and NestJS CORS configuration prevents cross-site request forgery attacks on state-changing REST endpoints.
3. **Refresh Token Exfiltration Prevention:** Restricting `binay_refresh_token` to `Path=/api/v1/auth/refresh` ensures that the refresh token is never transmitted on standard API queries (`/candidates`, `/jobs`, `/companies`), minimizing network exposure.
4. **Tenant Isolation:** All candidate, employer, and admin authorization rules derive identity server-side from `request.user.sub` (verified JWT claim). Client-supplied tenant IDs or user IDs are un-trusted.

---

## 6. Open Decisions

1. **Deployment Cookie Domain Configuration (`OPEN DECISION`):**
   - **Current State:** Domain attribute is intentionally omitted (host-only cookie).
   - **Resolution Trigger:** When production and staging deployment hostnames (e.g. `api.binayjobportal.com` vs `app.binayjobportal.com`) are finalized, evaluate whether to specify `Domain=.binayjobportal.com` or keep host-only cookies.

---

## 7. Required Fixes Before Production Freeze

1. **Update `src/auth.ts` Token Extraction:** Enable `verifyBearer()` to read `request.cookies['binay_access_token']` to support browser cookie authentication seamlessly alongside Bearer headers.

---

## 8. Final Implementation Readiness

```text
Status: APPROVED WITH FIXES
Reason: Authentication architecture, cookie paths, security flags, and Supabase Auth boundaries are completely sound. Updating src/auth.ts to extract tokens from cookies alongside Authorization headers will achieve 100% production readiness.
```

---

## 9. No-Code-Change Confirmation

I explicitly confirm that **zero source code, SQL migrations, or configuration files were modified** during this independent security audit.
