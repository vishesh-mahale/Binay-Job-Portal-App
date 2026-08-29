# Phase 09-B Auth Code-Gap Audit

**Date:** 29 August 2026  
**Scope:** `04-nestjs-api/04-nestjs-api-app`  
**Status:** AUDIT COMPLETE — OAuth implementation is decision/configuration blocked

## Evidence summary

| Area | Current evidence | Classification |
|---|---|---|
| Signup | `src/auth-provider.ts` exposes `POST /api/v1/auth/signup` and calls the Supabase Auth provider boundary. | Implemented; live verification pending |
| Password login | `POST /api/v1/auth/login`, account-state checks, audit row and presence session are implemented. | Implemented; live verification pending |
| Refresh | `POST /api/v1/auth/refresh` reads the refresh-token cookie and re-checks account state. | Implemented; live verification pending |
| Logout | Auth-guarded `POST /api/v1/auth/logout` clears cookies and revokes the matching presence session. | Implemented; live verification pending |
| OAuth state/PKCE helpers | `src/oauth-state.ts`, `src/oauth-config.ts`, and `PHASE-09-OAUTH-IMPLEMENTATION-PLAN.md` define the security boundary and helper primitives. | Partial foundation |
| OAuth authorize/callback endpoints | No concrete controller route or `OAuthProvider` implementation is wired in `src/app.module.ts`; `src/oauth-provider.ts` is only an interface. | **Code gap** |
| OAuth configuration | Required values are documented, but provider list, callback URL, frontend URLs, state secret and account-linking policy are not frozen for an environment. | **Decision/configuration blocker** |

## Required next order

1. Freeze the approved OAuth provider list, exact callback URL, frontend success/error URLs, rate limit and account-linking policy.
2. Add the concrete provider adapter and authorize/callback controller behind the existing interface boundary.
3. Add callback tests for state mismatch, expiry/replay, PKCE exchange, inactive account, cookie flags, sanitized redirect and audit.
4. Run live auth integration for signup/login/refresh/logout/OAuth.

No OAuth route or provider behavior is invented in this audit. The existing password-auth code must not be treated as proof that OAuth is complete.
