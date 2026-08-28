# Phase 09 — OAuth Implementation Plan

**Status:** ARCHITECTURE READY; environment values pending

## Boundary

NestJS OAuth boundary own karega aur Supabase Auth intermediary/provider exchange
handle karega. Browser direct provider token ya Supabase credential nahi dekhega.

## Planned flow

```text
Browser
  → GET /api/v1/auth/oauth/authorize?provider=<allowlisted>
NestJS
  → generate random state + PKCE verifier (`code_challenge_method=S256`)
  → store encrypted HttpOnly short-lived state cookie
  → redirect to Supabase Auth authorize URL
Provider/Supabase
  → GET /api/v1/auth/oauth/callback?code=...&state=...
NestJS
  → validate state + one-time expiry
  → exchange code outside DB transaction
  → verify public.users status (trigger remains owner)
  → write provider-aware login_history audit
  → set auth cookies + presence-session cookie
  → clean 302 redirect to approved frontend URL
```

## Security rules

- Provider and redirect are checked against server allowlists and Supabase Dashboard configuration.
- State cookie is HttpOnly, Secure outside local development, short-lived and single-use.
- State cookie payload contains state, PKCE verifier, issued-at and key-version;
  it is authenticated/encrypted with AES-256-GCM using `OAUTH_STATE_SECRET`.
- `OAUTH_STATE_SECRET` is identical across all API instances and is delivered by
  Secret Manager; key rotation requires a short overlap of key versions.
- Callback compares query `state` with the cookie state, rejects expiry/replay,
  and clears the state cookie before redirecting (clear-on-use).
- PKCE verifier is sent only in the server-to-Supabase token exchange body.
- PKCE verifier is never placed in URL, response body, logs or database.
- Callback rejects missing, expired or replayed state/code.
- Raw provider/access/refresh tokens never enter logs, URLs, database or JSON responses.
- OAuth callback database writes happen only after external exchange; no provider call inside a DB transaction.

## Required configuration (values not invented)

```text
ALLOWED_OAUTH_PROVIDERS=<approved comma-separated list>
OAUTH_CALLBACK_URL=<exact API callback URL for this environment>
OAUTH_FRONTEND_SUCCESS_URL=<approved frontend URL>
OAUTH_FRONTEND_ERROR_URL=<approved sanitized error URL>
OAUTH_STATE_SECRET=<Secret Manager secret, minimum strong entropy>
OAUTH_STATE_TTL_SECONDS=<approved short TTL>
```

Exact values, provider list, account-linking policy and rate limit require approval. Wildcards are prohibited.

## Account and audit behavior

- Existing `handle_new_user()` trigger creates `public.users` and derives initial status.
- Callback only reads/validates account state; it does not insert duplicate users or override trigger ownership.
- OAuth login audit uses `login_type='oauth'` and trimmed approved `auth_provider`.
- `AuthAuditService` must accept `loginType` and `authProvider`; the current
  email-password hardcoding cannot be reused for OAuth.
- Whether signup/first OAuth authentication is additionally recorded must follow the separate audit decision.
- Explicit-link/no-link behavior must be implemented according to the approved account-linking decision; no automatic email merge.

## Tests and release gate

- allowlist and redirect rejection
- state mismatch, expiry and replay rejection
- PKCE exchange success/failure without token leakage
- inactive/deleted account rejection
- provider-aware audit constraint test
- cookie flags and clean redirect test
- multi-instance state behavior test
- OAuth callback rate-limit test

Implementation starts only after the required environment and account-linking decisions are frozen. Automatic cross-provider email merge is prohibited until an explicit-link decision is approved.
