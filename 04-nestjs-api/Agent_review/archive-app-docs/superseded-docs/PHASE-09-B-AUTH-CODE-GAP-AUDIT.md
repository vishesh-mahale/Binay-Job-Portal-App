# Phase 09-B Auth Code-Gap Audit

**Date:** 29 August 2026  
**Scope:** `04-nestjs-api/04-nestjs-api-app`  
**Status:** AUDIT COMPLETE — password authentication is current scope; OAuth is explicitly deferred

## Evidence summary

| Area | Current evidence | Classification |
|---|---|---|
| Signup | `src/auth-provider.ts` exposes `POST /api/v1/auth/signup` and calls the Supabase Auth provider boundary. | Implemented; live verification pending |
| Password login | `POST /api/v1/auth/login`, account-state checks, audit row and presence session are implemented. | Implemented; live verification pending |
| Refresh | `POST /api/v1/auth/refresh` reads the refresh-token cookie and re-checks account state. | Implemented; live verification pending |
| Logout | Auth-guarded `POST /api/v1/auth/logout` clears cookies and revokes the matching presence session. | Implemented; live verification pending |
| OAuth state/PKCE helpers | `src/oauth-state.ts`, `src/oauth-config.ts`, and `PHASE-09-OAUTH-IMPLEMENTATION-PLAN.md` define the security boundary and helper primitives. | Partial foundation |
| OAuth authorize/callback endpoints | No concrete controller route or `OAuthProvider` implementation is wired in `src/app.module.ts`; `src/oauth-provider.ts` is only an interface. | **Deferred by product scope; not a current code gap** |
| OAuth configuration | Provider list, callback URL, frontend URLs, state secret and account-linking policy are not frozen. | **Deferred; revisit when OAuth is approved** |

## Required next order

1. Run live integration for current password signup/login/refresh/logout.
2. Keep OAuth interfaces/helpers documented but do not expose or implement OAuth routes in the current release.
3. When OAuth is approved, freeze its decisions and then add the provider adapter, callback controller and security tests.

No OAuth route or provider behavior is invented in this audit. The existing password-auth code is the current authentication scope; OAuth is explicitly future/deferred.
