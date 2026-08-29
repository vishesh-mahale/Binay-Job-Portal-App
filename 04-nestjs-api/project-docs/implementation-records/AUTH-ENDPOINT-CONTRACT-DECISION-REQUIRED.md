# AuthProvider Endpoint Contract — Decision Required

Status: `CORE ROUTES FROZEN — ENVIRONMENT-SPECIFIC CONFIGURATION PENDING`

## Decision outcome

The repository evidence and independent reviews establish the following core
contract. `/auth/bootstrap` is not a separate endpoint. NestJS is the
AuthProvider boundary and calls Supabase Auth; database triggers create the
application user rows.

| Method | Path | Actor | Core responsibility |
|---|---|---|---|
| POST | `/api/v1/auth/signup` | Public | Validate signup DTO, call Supabase Auth signup, return safe status; never insert `public.users` manually |
| POST | `/api/v1/auth/login` | Public | Password login through Supabase Auth, account-state checks, set auth cookies and one presence-session cookie |
| GET | `/api/v1/auth/oauth/callback` | Public provider callback | Exchange approved OAuth callback data, verify application account state, set cookies/redirect |
| POST | `/api/v1/auth/refresh` | Refresh-cookie holder | Use only `binay_refresh_token`, rotate token pair through Supabase Auth |
| POST | `/api/v1/auth/logout` | Authenticated | Clear auth/presence cookies and deactivate only the matching current presence row |
| GET | `/api/v1/auth/me` | Authenticated | Existing frozen endpoint; safe personal read through UserContextClient/RLS |

Password and OAuth are both in current scope. Supabase Auth remains the token
issuer; Next.js never talks directly to Supabase Auth and never mints tokens.

## Why this decision is required

The current repository freezes `/api/v1/auth/me` and session endpoints, but the
public paths and exact boundary for signup, login, refresh and logout are still
`TBD` in the API catalog. Older documents use an `auth/bootstrap` concept, while
the cookie contract requires a concrete `/api/v1/auth/refresh` path.

Implementing controllers before this is resolved can create duplicate or
conflicting auth flows.

## Remaining configuration decisions (do not block core controller structure)

1. Exact DTO field limits and validation messages.
2. OAuth provider allowlist and callback redirect URL per environment.
3. Exact CORS origin allowlist and cross-origin cookie mode.
4. Auth rate-limit thresholds and lockout policy values.
5. Realtime connection/heartbeat behavior and session-ID handoff remain pending;
   HTTP login currently creates the presence row and logout matches its secure
   `binay_presence_session` cookie to the authenticated user.
6. Email-verification callback details and pending-to-active status timing.

## Current non-negotiable boundaries

- Next.js never talks directly to Supabase Auth.
- NestJS is the AuthProvider boundary; Supabase Auth remains the token issuer.
- `handle_new_user()` creates `public.users`; NestJS must not insert a duplicate
  user row.
- Refresh token is accepted only by the refresh endpoint and is never logged.
- Access-token verification uses the isolated JOSE adapter and fails closed.
- `binay_presence_session` is an HttpOnly identifier only; it is not an auth
  token and is never logged or accepted as a replacement for the JWT.

## Implementation gate

Core controller and provider implementation may now start using the frozen route
matrix above. Environment-specific values and DTO/rate-limit details must be
implemented from explicit configuration, never hardcoded. After implementation,
run unit, Supabase integration, cookie, failure, audit and refresh-rotation
tests; unresolved configuration items remain release gates.
