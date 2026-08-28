# OAuth Configuration — Consolidated Review

**Date:** 2026-08-27  
**Reviewers:** Antigravity, FreeBuf, OpenCode + independent cross-check

## Verdict

```text
Decision document: structurally valid
OAuth code: not implemented
Callback architecture: route already frozen, implementation gated by missing details
Production readiness: NOT READY
```

## Findings table

| Area | Independent conclusion |
|---|---|
| Provider allowlist | Required; server-side allowlist plus Supabase Dashboard enablement. Do not trust client provider blindly. |
| Redirect URI | Exact per-environment allowlist required in both Supabase and NestJS. No wildcard. |
| Callback behavior | Frozen contract already requires server-side exchange, HttpOnly cookies and sanitized redirect; mechanics still need documenting. |
| State/PKCE | Mandatory security requirement, but storage, TTL, one-time use and multi-instance behavior are not yet specified. |
| Account linking | Open decision. “Auto-link” cannot be assumed; explicit-link/no-link policy must be chosen. |
| Email verification | SQL trigger already derives initial `public.users.status` from `auth.users.email_confirmed_at`; callback should read/verify status, not duplicate trigger ownership. |
| OAuth audit | `login_history.login_type='oauth'` and non-empty trimmed `auth_provider` are required if OAuth attempts are audited. Current `AuthAuditService` is hardcoded to `email_password`, so it needs a provider-aware method. |
| OAuth refresh token | Same HttpOnly refresh-cookie contract applies; provider access/refresh tokens must never be stored or exposed. |
| Callback CORS | Browser provider redirect lands on API callback; final frontend/API origin and redirect registration must be explicit. |
| Callback rate limit | Required production control, exact limits pending. |

## Corrections to agent claims

1. “Signup must be in `login_history`” is not proven. SQL describes login attempts; signup audit scope remains a conscious security decision.
2. The callback route is already present in the frozen endpoint matrix. Provider configuration gates safe implementation details; it does not invalidate the route freeze.
3. `handle_new_user()` owns initial user-row creation/status derivation. NestJS must not set OAuth status directly or create duplicate users.
4. `public.users` has no `auth_provider` column. Provider identity belongs in the login audit record or Supabase Auth identity metadata; adding a new users column requires a separate migration decision.
5. A signed-cookie or database state store cannot be selected silently. In-memory state alone is unsafe for multi-instance deployment unless routing affinity is explicitly guaranteed.

## Required decisions before callback coding

1. Approved OAuth providers and Supabase Dashboard enablement.
2. Exact API callback and frontend redirect URLs for dev/pre-prod/prod.
3. State/PKCE storage: durable shared store or a reviewed signed-cookie design; TTL and replay handling.
4. Account linking: explicit-link or no cross-provider linking in current scope.
5. OAuth login-history audit scope and provider-aware audit contract.
6. Callback sanitized failure response and frontend error route.
7. Callback rate-limit threshold and CORS/credential deployment settings.

## Safe implementation order after decisions

```text
Freeze architecture + environment values
→ add provider-aware AuthProvider interface
→ authorize endpoint with state + PKCE
→ callback code exchange outside DB transaction
→ verify public.users status
→ write OAuth audit record
→ set auth + presence cookies
→ sanitized 302 redirect
→ unit/integration/replay/linking tests
```

No source code or SQL was modified while performing this review.
