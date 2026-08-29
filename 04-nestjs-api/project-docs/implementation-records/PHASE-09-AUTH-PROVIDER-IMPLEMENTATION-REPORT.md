# Phase 09 — AuthProvider Initial Implementation Report

Status: `INITIAL PROVIDER SLICE IMPLEMENTED — INTEGRATION HARDENING REQUIRED`

## Implemented

- `AuthProvider` interface with signup, password login and refresh operations.
- `SupabaseAuthProvider` using the server-side Supabase Auth REST boundary.
- `POST /api/v1/auth/signup` and `POST /api/v1/auth/login`.
- `POST /api/v1/auth/refresh` reading only the path-scoped refresh cookie.
- `POST /api/v1/auth/logout` clearing both HttpOnly cookies.
- Access/refresh cookie path isolation from the approved cookie contract.
- No manual `public.users` or `candidate_profiles` insert; database triggers remain the owner.
- Raw tokens are not returned in response bodies or written to logs.
- Successful login checks `public.users.status`, `deleted_at` and `locked_until` before setting cookies.
- Refresh repeats the same account-state checks before issuing a new cookie pair.
- Logout now requires the authenticated access-token guard before clearing cookies.

## Verification

```text
npm run build                       PASS
npm test -- --runInBand --forceExit PASS — 16 suites, 38 tests
```

No live Supabase Auth call was performed because deployment credentials are not
available in the repository environment. Live signup, login, refresh and
trigger verification are still required in the dev project.

## Explicit remaining work

- Add DTO class validation and approved rate limits after their exact limits are frozen.
- Add append-only login/security audit writes.
- Add presence-session creation/update behavior once realtime session ownership is frozen.
- Implement and test OAuth callback with an approved provider allowlist and redirect URL.
- Configure CORS origins and credential handling per environment.

## Audit slice update

- Added server-only `AuthAuditService` for append-only `login_history` and known-user `user_security_log` writes.
- Login success, provider failures, and account-state rejections now record safe audit metadata (IP/user-agent only; no passwords/tokens).
- Unknown-email failures are written only to `login_history`, because `user_security_log.user_id` is NOT NULL.
- Provider error mapping is fail-closed and limited to the approved `login_failure_reason` enum values.
- Realtime presence connection/heartbeat remains pending; HTTP login creates a presence row and session-ID logout deactivates only that row. Lockout threshold/counter, rate limits and final DTO bounds remain separate pending slices.
- Add controller/provider unit tests and Supabase integration tests.
- Verify production issuer/audience values are present and enforced.

## Configuration hardening update

- `CORS_ORIGINS` is an explicit comma-separated allowlist; wildcard CORS is not enabled by default.
- `TRUST_PROXY` defaults to `false` and is enabled only after deployed proxy topology verification.
- Configuration regression tests cover defaults and explicit values.
- Rate-limit values, credential bounds and final proxy policy remain deployment decisions; arbitrary defaults were not introduced.
