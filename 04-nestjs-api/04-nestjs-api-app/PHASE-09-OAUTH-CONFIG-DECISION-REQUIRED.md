# Phase 09 — OAuth Configuration Decision

**Status:** OPEN — callback implementation gate

## Decisions required

1. **Providers:** Current scope me kaun se providers enable honge? (Google, GitHub,
   Microsoft, Apple etc.) Sirf approved allowlist providers accept honge.
2. **Redirect URLs:** Development, pre-prod aur production ke exact HTTPS callback
   URLs kya honge? Wildcard redirect allowed nahi hoga.
3. **Callback result:** Success par NestJS auth/presence cookies set karke frontend
   redirect karega; failure par sanitized error page/response hoga. Raw provider
   error/token URL me nahi aayega.
4. **Account linking:** Existing email account se OAuth identity link karna allowed
   hai ya duplicate/explicit-link flow chahiye?
5. **Email verification:** OAuth provider verified email ko `public.users` status
   active banane ka exact rule approve karna hoga. `handle_new_user()` trigger ka
   ownership replace nahi hoga.

## Non-negotiable security rules

- Client-supplied provider/redirect ko trust nahi karna; server allowlist se validate.
- OAuth `state` aur PKCE verifier bind/expire honge; replay reject hoga.
- Access/refresh token response body, logs, database ya query string me nahi jayenge.
- Callback external provider exchange database transaction ke andar nahi chalega.
- Invalid/expired state, code ya provider par fail closed response.

## Implementation gate

Providers, redirect allowlist, account-linking aur verification policy approve hone
ke baad hi `GET /api/v1/auth/oauth/callback` implement hoga.
