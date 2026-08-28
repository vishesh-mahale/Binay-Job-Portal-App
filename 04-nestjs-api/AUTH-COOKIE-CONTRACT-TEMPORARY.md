# Auth Cookie Contract — Temporary Development Values

Status: `FLOW FINAL — COOKIE DOMAIN DECISION PENDING`

Cookie flow final hai. Sirf deployment hostname ke hisaab se exact `Domain` value
abhi pending hai; neeche diye gaye names/paths current implementation defaults hain.

## Provisional cookies

| Cookie | Value | Path | Flags | Domain |
|---|---|---|---|---|
| `binay_access_token` | Supabase Auth access JWT | `/` | `HttpOnly; Secure; SameSite=Lax`* | **PENDING — abhi Domain attribute omit hoga** |
| `binay_refresh_token` | Supabase Auth refresh token | `/api/v1/auth/refresh` | `HttpOnly; Secure; SameSite=Lax`* | **PENDING — abhi Domain attribute omit hoga** |

## Current flow

```text
Next.js → NestJS auth endpoint → Supabase Auth
                                ↓
                       access JWT + refresh token
                                ↓
                 NestJS Set-Cookie response
```

- Next.js JWT ya refresh token mint nahi karega.
- Browser JavaScript in cookies ko read nahi kar sakega.
- Normal protected request mein access-token cookie use hogi.
- Refresh-token cookie sirf `/api/v1/auth/refresh` path par bheji jayegi.
- Refresh token application database, logs, task payloads ya normal API response
  body mein store nahi hoga.
- Logout par NestJS dono cookies ko `Max-Age=0`/expired `Set-Cookie` se clear karega.

`*` Localhost par plain HTTP testing ke liye development-only configuration mein
`Secure=false` allow hoga; HTTPS dev-tunnel, pre-prod aur production mein `Secure=true`
mandatory rahega.

## Pending decision

Pre-prod/production deployment hostnames final hone ke baad exact cookie `Domain`
value approve karni hai. Agar frontend aur API same parent domain par honge, tab
hi shared parent-domain cookie consider hogi; warna host-only cookie use hogi.

Domain final hone tak code/config mein `Domain` attribute set nahi karna hai.
# Presence session cookie (Option A)

Successful password login creates a `public.user_sessions` presence row. NestJS
stores only its UUID in an additional HttpOnly cookie:

```text
Name: binay_presence_session
Path: /api/v1
HttpOnly: true
Secure: true outside local development
SameSite: Lax (temporary)
Domain: intentionally omitted until deployment hostnames are frozen
```

On logout NestJS verifies the JWT subject and updates only the row matching
`user_sessions.id = binay_presence_session` and `user_id = JWT.sub`. Other device
sessions are not affected. The cookie is then cleared. This cookie is a presence
identifier only; it is not an auth token and its value is never logged.

## OAuth state cookie

```text
Name: binay_oauth_state
Path: /api/v1/auth/oauth
HttpOnly: true
Secure: true outside local development
SameSite: Lax
Max-Age: OAUTH_STATE_TTL_SECONDS
Domain: intentionally omitted until deployment hostnames are frozen
```

It contains the encrypted state/PKCE payload, is cleared on callback use, and is
never returned in an API body or written to logs.
