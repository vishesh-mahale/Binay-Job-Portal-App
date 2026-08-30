# Agent Review — JWKS / ECC Authentication Path (ea1b16f + a36bd0d + 55a3e47)

- **Reviewer:** opencode
- **Mode:** read-only (no source/SQL/test/config changes, no commit)
- **Commits reviewed:** `ea1b16f` (feat auth: Supabase JWKS verification for ECC signing keys), `a36bd0d` (fix auth: require Supabase JWKS source outside local), `55a3e47` (docs: record ECC JWKS auth path)
- **Result HEAD:** `55a3e47`
- **Scope:** security correctness of asymmetric (JWKS/ES256/RS256) JWT verification, config enforcement, and guard wiring

## Verdict

**APPROVED WITH REQUIRED FIXES**

The implementation is **secure and correct**: algorithm selection is correctly coupled to the key type (no algorithm-confusion path), asymmetric verification is preferred and enforced outside local environments (fail-closed), and issuer/audience checks are required in non-local environments. `tsc --noEmit` exits 0 and the auth/config/oauth specs pass (20/20). However, the security-critical `JoseJwtVerifier` (the actual jose integration: JWKS fetch, algorithm restriction, `sub` enforcement) has **no direct test** — `auth.spec.ts` mocks the verifier entirely. This is a regression/security-test-coverage gap that should be closed before the production baseline freeze.

## What the commits do

### ea1b16f — add JWKS / ECC verification
- `security/jwt-verifier.ts`
  - `JwtVerificationKey = string | { jwksUrl: string }` — discriminated by type.
  - `JoseJwtVerifier.verify`: dynamically imports `jose` via `new Function('return import("jose")')` (ESM/CJS isolation), then:
    - `isJwks = typeof key !== 'string'`
    - JWKS → `createRemoteJWKSet(new URL(key.jwksUrl))` with `algorithms: ['ES256','RS256']`
    - string → `new TextEncoder().encode(key)` with `algorithms: ['HS256']`
    - throws if `payload.sub` is not a non-empty string.
- `auth.ts` — imports `JoseJwtVerifier` and uses it inside `verifyBearer`/`AuthGuard` (auth boundary unchanged otherwise).
- `app.module.ts` — derives `jwtKey`:
  - `SUPABASE_JWKS_URL` set → `{ jwksUrl }` (explicit)
  - else `SUPABASE_URL` set → `{ jwksUrl: '<SUPABASE_URL>/auth/v1/.well-known/jwks.json' }` (derived)
  - else → `SUPABASE_JWT_SECRET!` (HS256 legacy)
  - `AuthGuard` provider wired with `jwtKey`, `undefined` rate-limit, `{ issuer, audience }` from config, `SystemClient`.
- `config.ts` — `SUPABASE_JWKS_URL` schema (URL, optional); derivation logic in `loadConfig`.
- `config.spec.ts` — adds config tests for the JWKS path.
- `.env.example` — documents `SUPABASE_JWKS_URL` and legacy `SUPABASE_JWT_SECRET`.

### a36bd0d — require JWKS outside local
- `config.ts` — in `preproduction`/`production` `NODE_ENV`, throws if neither `SUPABASE_JWKS_URL` nor `SUPABASE_URL` is set.
- `config.spec.ts` — adds the local-vs-nonlocal enforcement tests.

### 55a3e47 — docs only
- `IMPLEMENTATION-TRACKER-HINGLISH.md` updated with the ECC/JWKS authentication path. No code impact.

## Security analysis

**Pass — no algorithm-confusion vulnerability.** `algorithms` is derived from `isJwks` (the same boolean that selects the key), so:
- JWKS (public asymmetric keys) → only `ES256`/`RS256` accepted; an HS256 token is rejected (alg not in list, and a public key cannot serve as an HMAC secret). The classic "forge HS256 with the public JWK" attack is blocked.
- HS256 (string secret) → only `HS256` accepted; an ES256/RS256 token is rejected (key type mismatch).
The coupling is structural, not config-dependent, which is the correct defense.

**Pass — fail-closed.** Any thrown error in `JoseJwtVerifier.verify` (bad token, missing `sub`, JWKS fetch failure, network error) propagates to the existing `try/catch` in `verifyBearer`/`AuthGuard` and yields `UNAUTHORIZED`. `auth.spec.ts` confirms fail-closed for rejected verifier and missing/malformed tokens.

**Pass — non-local enforcement.** `a36bd0d` guarantees that preproduction/production cannot start with only `SUPABASE_JWT_SECRET`; a JWKS source is mandatory. Because `app.module.ts` prioritizes `SUPABASE_JWKS_URL`/`SUPABASE_URL` over the secret, HS256 is effectively dev/test-only. This is the intended asymmetric-by-default posture.

**Pass — `sub` enforcement.** Verifier rejects tokens without a non-empty `sub`, which downstream account-status lookup depends on.

**Pass — issuer/audience.** `app.module.ts` passes `config.SUPABASE_JWT_ISSUER`/`config.SUPABASE_JWT_AUDIENCE` to the guard; in non-local environments `config.ts` requires these (per prior review of `config.ts:57-72` issuer/audience), so they are enforced in prod/preprod.

**Informational — jose loaded via `new Function('return import("jose")')`.** The import specifier is a hardcoded constant (`"jose"`), not user input, so there is no injection risk. It is a CJS/ESM interop shim; acceptable, but a short comment noting *why* a dynamic import is used would help maintainers.

**Informational — availability.** `createRemoteJWKSet` fetches the JWKS over the network on first use / cache miss. A slow/unreachable Supabase JWKS endpoint causes request latency/failures (fail-closed, not fail-open). Consider documenting JWKS caching/refresh expectations for on-call.

## Required fixes

1. **Add direct tests for `JoseJwtVerifier`** (`security/jwt-verifier.spec.ts` does not exist today; `auth.spec.ts` mocks the verifier). The most security-critical logic — algorithm restriction, JWKS selection, and `sub` enforcement — is currently unexercised. Minimum coverage:
   - asymmetric path: a valid ES256 token signed by a local test ES256 key, verified through `createRemoteJWKSet` (or a stubbed JWKS endpoint) → resolves with `sub`.
   - **algorithm-confusion prevention**: an HS256-signed token presented against a JWKS (`{ jwksUrl }`) key → rejected.
   - HS256 string-key path still resolves for a correctly signed HS256 token.
   - missing/empty `sub` → throws.
   - JWKS URL derivation from `SUPABASE_URL` (covered indirectly by `config.spec.ts`, but the verifier's `new URL(key.jwksUrl)` branch should be exercised end-to-end).
   These can be implemented with `jose` test keys (generate an ES256 key pair, serve the public JWK via a local JWKS route or `createLocalJWKSet`) and do not require a live Supabase project.

## Recommendations

- Add a brief comment in `jwt-verifier.ts` explaining the `new Function('return import("jose")')` ESM/CJS isolation rationale.
- Document JWKS cache/refresh and failure-mode expectations in the auth runbook (referencing `55a3e47` docs) so on-call understands the network dependency.
- Consider asserting in `app.module.ts` (defense-in-depth, not required since config already enforces it) that non-local environments never construct a string `jwtKey`.

## Verification performed

- `node ./node_modules/jest/bin/jest.js auth.spec.ts config.spec.ts` → **20 passed, 20 total** (suites: auth.spec.ts, config.spec.ts, oauth-config.spec.ts). Note: the `verifier` in `auth.spec.ts` is a `jest.fn()` mock, so these pass against the auth *boundary* only.
- `node ./node_modules/typescript/bin/tsc --noEmit` → **exit 0** (clean) on `04-nestjs-api-app`.
- Grep/static checks: `security/jwt-verifier.ts:18-25` algorithm/key coupling confirmed; `app.module.ts:32` AuthGuard wiring confirmed; `config.ts` enforcement confirmed via `a36bd0d` diff; no `jwt-verifier.spec.ts` present.
- Repo state: working tree clean apart from `Agent_review/` (untracked). No source/config/SQL changes made.

## Files inspected
- `04-nestjs-api/04-nestjs-api-app/src/security/jwt-verifier.ts`
- `04-nestjs-api/04-nestjs-api-app/src/auth.ts`
- `04-nestjs-api/04-nestjs-api-app/src/app.module.ts` (AuthGuard provider block)
- `04-nestjs-api/04-nestjs-api-app/src/config.ts`
- `04-nestjs-api/04-nestjs-api-app/src/config.spec.ts`
- `04-nestjs-api/04-nestjs-api-app/src/auth.spec.ts`
- `04-nestjs-api/04-nestjs-api-app/.env.example`
- `04-nestjs-api/IMPLEMENTATION-TRACKER-HINGLISH.md` (docs only in `55a3e47`)
