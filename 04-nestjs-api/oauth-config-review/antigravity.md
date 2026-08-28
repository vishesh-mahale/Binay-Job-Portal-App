# Phase 09 OAuth Configuration & Security Review Report

**Target Document:** `04-nestjs-api/04-nestjs-api-app/PHASE-09-OAUTH-CONFIG-DECISION-REQUIRED.md`  
**Auditor:** Antigravity (Senior Auth & Security Architect)  
**Date:** 2026-08-27  
**Report Location:** `04-nestjs-api/oauth-config-review/antigravity.md`  

---

## 1. Executive Verdict

### **APPROVED WITH BASELINE SQL CONFIRMATION**

*(Reason: An independent cross-audit of `PHASE-09-OAUTH-CONFIG-DECISION-REQUIRED.md` against current NestJS code, Supabase Auth architecture, `AUTH-COOKIE-CONTRACT-TEMPORARY.md`, and baseline SQL migrations `03_users_auth.sql` confirms that the document establishes solid OAuth security gates. Client-supplied provider/redirect overrides are strictly forbidden, PKCE + state binding is mandated, and token leakage via URL query parameters is completely barred. Furthermore, baseline SQL [`03_users_auth.sql` L200–225] confirms that `handle_new_user()` already automatically sets `public.users.status = 'active'` for OAuth users with verified emails).*

---

## 2. Decision & Security Gate Verification Matrix

| Audit Item | Document Proposal | Ground-Truth SQL & Architecture Evidence | Audit Verdict & Classification |
|---|---|---|---|
| **1. Provider Allowlist** | Restrict OAuth providers to an explicit server-side allowlist (e.g. `google`, `github`). | `02_enums.sql` L96 (`auth_login_type: 'oauth'`) & `03_users_auth.sql` L401 (`auth_provider VARCHAR(50)`). | ✅ **VALIDATED & APPROVED** |
| **2. Redirect URLs & Wildcard Ban** | Restrict OAuth callbacks to exact environment-configured HTTPS URLs. No wildcard redirects. | Prevents Open Redirect vulnerability (OWASP A01). | ✅ **VALIDATED & APPROVED** |
| **3. Callback & Cookie Transport** | Exchange PKCE code on `GET /auth/oauth/callback`, set HttpOnly cookies, redirect to frontend. | `AUTH-COOKIE-CONTRACT-TEMPORARY.md` L10–14. Prevents token leakage in URL query parameters. | ✅ **VALIDATED & APPROVED** |
| **4. Account Linking Policy** | Email-matched OAuth account linking rules must be explicit. | Supabase Auth manages identity linking. `public.users.email` is CITEXT UNIQUE. | ✅ **VALIDATED & APPROVED** |
| **5. Email Verification & Status** | OAuth verified emails set `public.users.status = 'active'`. | `03_users_auth.sql` L200–225 (`handle_new_user()` trigger sets `status = 'active'` if `email_confirmed_at IS NOT NULL`). | ✅ **VERIFIED IN BASELINE SQL** |
| **6. PKCE & State Security** | Validate OAuth `state` and PKCE verifier on callback; reject replay attempts. | OAuth 2.0 PKCE specification (RFC 7636). Prevents authorization code injection & CSRF. | ✅ **VALIDATED & APPROVED** |
| **7. Transaction Boundaries** | External OAuth token exchange (`fetch`) MUST NOT run inside open DB transactions. | `NESTJS-IMPLEMENTATION-GUIDE.md` L16. | ✅ **VALIDATED & APPROVED** |

---

## 3. Detailed Architectural & Security Analysis

### **A. Token Exposure & Clean HTTP 302 Redirect Boundary**
- **Security Constraint:** Raw access tokens and refresh tokens MUST NEVER be transmitted in URL query strings (e.g. `https://app.binayjobportal.com/dashboard?access_token=xyz`). Query string tokens are logged in browser history, HTTP server access logs, and `Referer` headers sent to third-party assets.
- **Approved Solution:** NestJS handles `GET /api/v1/auth/oauth/callback?code=xxx&state=yyy`, exchanges the PKCE code via Supabase Auth REST `/auth/v1/token?grant_type=pkce`, receives the session tokens, sets `binay_access_token` and `binay_refresh_token` as HttpOnly, Secure, SameSite=Lax cookies, and issues a clean `302 Found` HTTP redirect to `FRONTEND_URL/dashboard`.

### **B. `handle_new_user()` Trigger OAuth Compatibility**
- **Baseline Verification:** `03_users_auth.sql` lines 200–225 define the trigger function `handle_new_user()`:
  ```sql
  status := CASE 
      WHEN (NEW.raw_user_meta_data->>'email_verified')::boolean = true 
        OR NEW.email_confirmed_at IS NOT NULL 
      THEN 'active'::public.account_status 
      ELSE 'pending_verification'::public.account_status 
  END;
  ```
- **Result:** When a user signs up via Google/GitHub OAuth, Supabase Auth populates `email_confirmed_at = NOW()`. The database trigger automatically creates `public.users` with `status = 'active'`, and `create_empty_candidate_profile()` creates `candidate_profiles` automatically. NestJS does NOT need to write custom status update queries for OAuth signup.

---

## 4. Recommended OAuth Implementation Route Matrix

```text
GET /api/v1/auth/oauth/authorize?provider=google
  Actor: Anonymous (@Public())
  Query Params: { provider, redirect_to? }
  Behavior: Validates provider against ALLOWED_OAUTH_PROVIDERS -> Generates PKCE code_challenge & state -> Stores state in short-lived encrypted cookie -> Returns Supabase OAuth authorization URL.

GET /api/v1/auth/oauth/callback
  Actor: Anonymous (@Public())
  Query Params: { code, state }
  Behavior: Validates state cookie match -> Calls Supabase Auth REST /auth/v1/token?grant_type=pkce -> Verifies public.users status ('active') -> Sets binay_access_token (Path=/) & binay_refresh_token (Path=/api/v1/auth/refresh) HttpOnly cookies -> Issues 302 Redirect to FRONTEND_URL/dashboard.
```

---

## 5. Implementation Gate & Next Steps

Upon client selection of the OAuth provider list (e.g. `google,github`):
1. Add `ALLOWED_OAUTH_PROVIDERS` and `OAUTH_REDIRECT_URL` to `src/config.ts`.
2. Implement `GET /api/v1/auth/oauth/authorize` and `GET /api/v1/auth/oauth/callback` in `AuthProviderController`.
3. Add PKCE state validation and HttpOnly cookie redirect tests.

---

## 6. No-Code-Change Confirmation

I explicitly confirm that **zero source code, SQL migrations, or configuration files were modified** during this independent architectural review.
