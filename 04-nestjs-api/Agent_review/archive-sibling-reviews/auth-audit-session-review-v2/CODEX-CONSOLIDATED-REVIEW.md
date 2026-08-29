# AuthProvider V2 — Consolidated Audit/Session Review

**Date:** 2026-08-27  
**Scope:** `04-nestjs-api/04-nestjs-api-app` ke latest AuthProvider, JWT context, audit aur presence-session slice  
**Inputs:** Antigravity, FreeBuf, OpenCode reports + independent source/SQL cross-check

## 1. Final verdict

```text
CORE AUTH PROVIDER SLICE: VERIFIED
JWT/RLS TOKEN PROPAGATION: VERIFIED
AUDIT + PRESENCE IMPLEMENTATION: NOT COMPLETE
PRODUCTION READY: NO
NEXT SAFE STEP: audit/session contract implementation, decisions ke baad
```

Agents ka common conclusion sahi hai ki recent v1 fixes regress nahi hue. Lekin “production ready” ya “all security requirements complete” claim sahi nahi hoga, kyunki current code me `login_history`, `user_security_log` aur `user_sessions` ke writes abhi zero hain.

## 2. Agent comparison

| Reviewer | Jo valid mila | Jahan wording/claim ko correct karna hai |
|---|---|---|
| Antigravity | raw token propagation, issuer/audience wiring, login/refresh account-state checks, logout guard, build/tests verified; audit/presence next slice | IP/user-agent ko ek jagah “logged” bola gaya, lekin code me capture nahi hai. Lockout threshold ko implementation requirement nahi maan sakte jab tak policy approve na ho. |
| FreeBuf | v1 fixes verified; exact SQL enums/nullable `login_history.user_id`; audit writes, IP/UA, presence missing; CORS/rate-limit/DTO production gaps | Signup ko successful login-history event banana schema se automatically prove nahi hota; isko business decision/contract se confirm karna hoga. Supabase refresh-token invalidation ko local code se verified nahi kaha ja sakta. |
| OpenCode | core routes/cookies/guard/RLS client behavior verified; audit writes and logout presence missing; generic Supabase errors mapping gap | `user_sessions` login timing explicitly pending decision hai; refresh heartbeat optional/contract-dependent hai. CORS/rate-limit production gates hain, current auth slice ke implemented facts nahi. |

## 3. Independently verified facts

### Implemented and passing

- `AuthGuard` cookie-first access token, then Bearer fallback use karta hai.
- `rawAccessToken` request context me set hota hai; identity/candidate personal reads UserContextClient ko wahi token dete hain.
- JWT verifier issuer/audience options receive karta hai; missing/invalid token fail-closed 401 hota hai.
- JOSE adapter isolated dynamic import use karta hai; manual HMAC fallback nahi hai.
- Login aur refresh dono `public.users.status`, `deleted_at`, `locked_until` check karte hain before cookies.
- Logout authenticated guard ke peeche hai aur dono cookies clear karta hai.
- Cookie paths/HttpOnly/SameSite contract ke saath aligned hain; domain intentionally pending hai.
- `npm test` ka latest result 16 suites / 38 tests pass aur build pass hai. Jest ka force-exit/open-handle warning ko “clean natural exit” nahi bolna chahiye.

### SQL-backed facts

- `login_history.user_id` nullable hai; unknown email attempts ke liye NULL valid hai.
- Successful login me `failure_reason` NULL aur failed attempt me enum reason required hai.
- `user_security_log.user_id` NOT NULL hai; unknown-email failure wahan insert nahi ho sakta.
- Dono audit tables append-only triggers se protected hain.
- `user_sessions` auth token storage nahi hai; realtime presence ke liye table hai.

## 4. Actual missing implementation

1. **`login_history` writes:** signup/login success aur failed login branches me koi insert nahi.
2. **Failure classification:** provider ke JSON error codes ko current generic `VALIDATION_ERROR`/`UNAUTHORIZED` me collapse kiya ja raha hai; exact enum mapping possible nahi.
3. **Request context:** login/signup me `req.ip` aur user-agent abhi capture nahi ho rahe.
4. **`user_security_log`:** known-user security events/login-failure writes absent.
5. **Presence lifecycle:** login row creation, refresh update aur logout deactivation absent. Identity session listing/revoke code alag se maujood hai, par login rows create nahi hoti.
6. **Lockout trigger:** `locked_until` enforce hota hai, par failed-attempt threshold/count/set logic current code me nahi hai.
7. **CORS, rate-limit, strong DTO validation:** current code me final environment policy/limits wired nahi hain; exact values approved nahi hain.

## 5. Decisions required before coding audit/session slice

- Signup ko `login_history` me record karna hai ya sirf authentication attempts (login/OAuth) ko?
- Supabase error-code → `login_failure_reason` mapping ka canonical table/behavior (especially invalid password vs unknown user vs unverified email) approve karo.
- `user_sessions` row login par banegi ya realtime WebSocket/SSE connection par? Existing contract logout par “current row when one exists” kehta hai.
- Presence identity: logout par current session kaise identify hogi? Current code ke paas session cookie me local `user_sessions.id` nahi hai; `WHERE user_id AND is_online` sab active sessions ko close kar sakta hai, jo single-session contract se conflict kar sakta hai.
- Failed login lockout threshold/window/atomic counter design approve karo; current schema me dedicated counter column nahi dikhta.
- CORS origins, cross-origin cookie mode, rate limits aur DTO password/email bounds environment-wise freeze karo.
- Reverse proxy trust configuration se `req.ip` ka source approve karo.

## 6. Security boundaries

- Audit/presence writes sirf server-side `SystemClient` se honge; UserContextClient se nahi.
- Password, access/refresh token, service key, raw JWT claims ya secrets logs/audit metadata me nahi jayenge.
- Unknown email ke liye `login_history` row possible hai; `user_security_log` row nahi.
- Kisi absent enum/event/table ko invent nahi karna. `account_banned` jaisa naya enum add nahi karna; existing approved enum mapping use hogi ya decision gap rahega.
- Audit failure se login ko silently successful nahi banana; failure handling/observability contract separately define hoga.

## 7. Test gate for next slice

- success/failure/unknown-email login history assertions
- exact enum and provider-consistency constraint tests
- IP/user-agent capture and PII redaction tests
- known-user security-log insert; unknown-user NULL behavior
- presence create/update/deactivate plus selected-session ownership
- locked/suspended/deleted account behavior
- append-only update/delete rejection
- concurrent login/logout/session revoke tests
- `npm test` + build, with open-handle warning separately reported

## 8. Status

```text
V2 AUDIT: CONDITIONAL PASS
CORE ROUTES: VERIFIED
AUDIT/PRESENCE: IMPLEMENTATION PENDING
PRODUCTION FREEZE: BLOCKED UNTIL ABOVE DECISIONS + TESTS
```

No source code or SQL was changed while performing this review.
