# Auth Implementation — Consolidated Independent Review

Date: 2026-08-27  
Scope: `04-nestjs-api/04-nestjs-api-app`

## Final verdict

**PRE-PROD FOUNDATION PASS — PRODUCTION AUTH FREEZE NOT YET READY**

The implemented foundation is valid for continued pre-production work. `jose` is isolated behind a verifier interface, manual HMAC fallback is removed, failures are fail-closed, cookie parsing is registered, and the project builds. It is not correct to call this production-ready yet because issuer/audience validation is not wired and the full signup/login/refresh/logout flow is not implemented in this slice.

## Independent verification

Commands run from `04-nestjs-api/04-nestjs-api-app`:

```text
npm.cmd run build                         PASS
npm.cmd test -- --runInBand --forceExit   PASS — 16 suites, 38 tests
```

The test run reports an open-handle warning when forced to exit. This does not invalidate the passing assertions, but it must be cleaned up before CI is considered clean.

## Agent review comparison

| Reviewer | Main verdict | Correct observations | Overstatement / correction |
|---|---|---|---|
| Antigravity | PASS / production ready | JOSE isolation, fail-closed behavior, cookie-parser, cookie-first extraction | “Production ready” was too strong because issuer/audience and full auth endpoints were absent at review time. |
| FreeBuf | Approved with fixes | Issuer/audience is not passed; expired-token and edge tests are missing; pre-prod acceptable | Correctly treats issuer/audience as a production gate, not a reason to redesign the foundation. |
| OpenCode | Pass with required fixes | Stale report count, optional `SUPABASE_URL`, missing issuer/audience wiring, redaction/test/open-handle gaps | `SUPABASE_URL` being required is relevant to future AuthProvider/storage flows, but is not necessarily a blocker for this foundation-only slice. |

## What is verified as correct

- `JoseJwtVerifier` uses a native dynamic ESM import for the CommonJS NestJS runtime.
- JWT verification is delegated to `jose`; no custom HMAC fallback remains.
- HS256 is explicitly allow-listed and `exp` is checked by `jose`.
- Missing token, invalid token, missing `sub`, and verifier/import errors fail as `401 UNAUTHORIZED`.
- `binay_access_token` cookie is read first, with Bearer header fallback.
- `cookie-parser` is registered before request handling.
- Secrets and raw tokens are not included in the auth error envelope.

## Remaining items (must remain tracked)

1. **Complete production configuration:** provide and verify Supabase JWT `issuer` and `audience` in every deployed environment; the wiring now exists and does not hardcode values.
2. Add real JOSE tests for expired token, wrong algorithm/signature, issuer/audience mismatch, missing `sub`, and malformed token. Existing `auth.spec.ts` intentionally tests the verifier boundary with a mock.
3. Add auth extraction edge tests for empty cookie and any final cookie/header policy cases (no-token and malformed-header tests are now covered).
4. Resolve Jest open handles so CI exits naturally without `--forceExit`.
5. Decide whether `SUPABASE_URL` becomes mandatory in the configuration when AuthProvider/storage endpoints are enabled; do not make this change solely on the basis of the foundation review.
6. Expand redaction patterns/tests only where the project’s actual logging contract requires them; never log raw JWTs to “improve diagnostics”.
7. Implement and test the business AuthProvider endpoints (signup/login/refresh/logout/email verification) in the next approved slice.

## Decision

Continue with the next authentication implementation slice in pre-prod. The cookie-to-RLS raw-token propagation bug identified by the endpoint review is now fixed: `AuthGuard` stores the selected token on request context and identity/candidate reads use it. Do **not** declare the authentication subsystem production-ready or freeze it until endpoint contract decisions, provider endpoints, and relevant integration tests are complete.
