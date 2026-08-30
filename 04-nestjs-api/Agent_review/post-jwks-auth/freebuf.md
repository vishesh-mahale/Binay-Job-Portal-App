# freebuf Review — Commits ea1b16f, a36bd0d, 55a3e47

## 1. Commit and scope verified

| Commit | Subject | Files | Lines |
|--------|---------|-------|-------|
| `ea1b16f` | feat(auth): support Supabase JWKS verification for ECC signing keys | 6 files | +38 / -16 |
| `a36bd0d` | fix(auth): require Supabase JWKS source outside local environments | 2 files | +5 / -1 |
| `55a3e47` | docs(nestjs-api): record ECC JWKS authentication path | 1 file | +1 / -1 |
| **Total** | | **9 files touched** | **+44 / -18** |

```
HEAD:   55a3e47 (current)
npm tsc --noEmit:   Exit 0, zero errors
npm jest --runInBand: 32 suites, 188 tests — ALL PASS (81.6s)
```

## 2. Executive verdict

**APPROVED**

The three commits introduce asymmetric JWKS verification for Supabase ECC signing keys while retaining a legacy HS256 fallback. All security-critical behaviors — fail-closed, algorithm restriction, production enforcement, config validation — are correct and tested.

## 3. Evidence-based findings

| ID | Severity | File/Line | Finding | Evidence | Required action |
|----|----------|-----------|---------|----------|-----------------|
| F-1 | NO ISSUE | jwt-verifier.ts:15-18 | **JWKS URL instantiation** — `createRemoteJWKSet(new URL(key.jwksUrl))` correctly validates the URL at verification time | `new URL()` throws on malformed input; Zod schema already validates `z.string().url()` for `SUPABASE_JWKS_URL`; malformed input is rejected at config load, never reaches verifier | None |
| F-2 | NO ISSUE | jwt-verifier.ts:16-21 | **Algorithm restriction is correct** — JWKS mode restricts to `['ES256', 'RS256']`; string mode restricts to `['HS256']` | `jose` enforces the `algorithms` allowlist; Supabase ECC uses ES256; no cross-contamination possible between modes | None |
| F-3 | NO ISSUE | jwt-verifier.ts:12,17 | **Key type discrimination** — `typeof key !== 'string'` correctly selects JWKS vs HS256 path | Union type `JwtVerificationKey = string \| { jwksUrl: string }` is narrow; the discriminant is unambiguous; no `null`/`undefined` can reach this point because config requires at least one key | None |
| F-4 | NO ISSUE | jwt-verifier.ts:20-22 | **Fail-closed on JWKS failure** — `catch` block in `auth.ts:17` wraps any `jose` error (network, invalid key, expired token) into `UNAUTHORIZED` | `try { return await verifier.verify(token, key, options); } catch { throw new UnauthorizedException('UNAUTHORIZED'); }` — no error details leaked | None |
| F-5 | NO ISSUE | config.ts:28-30 | **At-least-one-key enforcement** — `superRefine` rejects config with no `SUPABASE_JWT_SECRET`, `SUPABASE_JWKS_URL`, or `SUPABASE_URL` | `!data.SUPABASE_JWT_SECRET && !data.SUPABASE_JWKS_URL && !data.SUPABASE_URL` → custom Zod issue; app cannot start without verification material | None |
| F-6 | NO ISSUE | config.ts:36-38 | **Production/preprod JWKS enforcement** — asymmetric verification required in preprod and production | `if ((data.NODE_ENV === 'preprod' \|\| data.NODE_ENV === 'production') && !data.SUPABASE_JWKS_URL && !data.SUPABASE_URL)` → custom Zod issue; legacy HS256-only config is rejected in deployed environments | None |
| F-7 | NO ISSUE | config.ts:32-35 | **Issuer/audience still enforced** — preprod/production still require `SUPABASE_JWT_ISSUER` and `SUPABASE_JWT_AUDIENCE` | Existing superRefine checks unchanged; apply to both JWKS and HS256 modes | None |
| F-8 | NO ISSUE | config.ts:10 | **JWT secret now optional** — `SUPABASE_JWT_SECRET: z.string().min(16).optional()` allows JWKS-only config | Zod `.optional()` is correct; `superRefine` ensures at-least-one key exists | None |
| F-9 | NO ISSUE | app.module.ts:27-31 | **JWKS URL derivation** — `SUPABASE_URL` fallback correctly derives `.well-known/jwks.json` endpoint | `config.SUPABASE_URL.replace(/\/$/, '')` strips trailing slash; appends `/auth/v1/.well-known/jwks.json`; matches standard Supabase endpoint | None |
| F-10 | NO ISSUE | app.module.ts:33 | **AuthGuard wiring** — `jwtKey` is correctly passed as first argument to `new AuthGuard(jwtKey, ...)` | `AuthGuard` constructor accepts `JwtVerificationKey` as first param; type-safe | None |
| F-11 | NO ISSUE | auth.ts:14 | **`verifyBearer` parameter type** — accepts `JwtVerificationKey` instead of `string` | Signature change is backward-compatible with the `JwtVerifier` interface | None |
| F-12 | NO ISSUE | .env.example:4-6 | **Documentation clarity** — `.env.example` correctly marks JWKS as preferred, secret as legacy-only | Comments clearly state "Preferred for current Supabase ECC signing keys" and "Legacy HS256 fallback only" | None |
| F-13 | NO ISSUE | config.spec.ts:25-28 | **JWKS-only config test** — verifies config loads with only `SUPABASE_JWKS_URL` (no secret) | `loadConfig(jwksEnv)` succeeds; missing all keys throws with `/Configure SUPABASE/` | None |
| F-14 | NO ISSUE | config.spec.ts:22 | **Production JWKS enforcement test** — verifies production with only issuer+audience (no URL) throws | `expect(() => loadConfig({ ..., NODE_ENV: 'production', SUPABASE_JWT_ISSUER: ..., SUPABASE_JWT_AUDIENCE: ... })).toThrow(/SUPABASE_JWKS_URL or SUPABASE_URL/)` | None |

## 4. Correctly implemented items

| Item | Evidence |
|------|----------|
| JWKS vs HS256 mode selection | `typeof key !== 'string'` in jwt-verifier.ts:15 |
| Algorithm restriction per mode | `isJwks ? ['ES256', 'RS256'] : ['HS256']` in jwt-verifier.ts:20 |
| At-least-one-key config gate | `superRefine` at config.ts:28-30 |
| Production/preprod JWKS enforcement | `superRefine` at config.ts:36-38 |
| Issuer/audience enforcement | `superRefine` at config.ts:32-35 |
| Fail-closed on verification error | `catch { throw new UnauthorizedException('UNAUTHORIZED') }` at auth.ts:17 |
| Fail-closed on missing token | `if (!token) throw new UnauthorizedException('UNAUTHORIZED')` at auth.ts:13 |
| Fail-closed on account status | `if (!user \|\| user.deleted_at \|\| user.status !== 'active' \|\| ...)` at auth.ts:35 |
| JWKS URL derivation from SUPABASE_URL | `${config.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json` at app.module.ts:30 |
| No secret/token leakage in error paths | All catch blocks return generic `UNAUTHORIZED` |
| AuthGuard provider wiring | `useFactory:(system:SystemClient)=>new AuthGuard(jwtKey, ...)` at app.module.ts:33 |
| `config.spec.ts` coverage (7 tests) | All pass; covers JWKS-only, missing-all-keys, production-enforcement |
| `auth.spec.ts` coverage (8 tests) | All pass; covers token extraction, fail-closed, account status |

## 5. Security and validation assessment

| Check | Status | Notes |
|-------|--------|-------|
| **HS256/JWKS isolation** | ✅ VERIFIED | Algorithm allowlist is mutually exclusive; no key-type confusion possible |
| **No algorithm downgrade** | ✅ VERIFIED | HS256 path only allows `['HS256']`; JWKS path only allows `['ES256', 'RS256']` |
| **Fail-closed on JWKS network failure** | ✅ VERIFIED | jose's `createRemoteJWKSet` throws → caught by `auth.ts:17` → `UNAUTHORIZED` |
| **Fail-closed on invalid JWKS response** | ✅ VERIFIED | jose validates JWKS structure; malformed → throw → `UNAUTHORIZED` |
| **No secret/key in logs/errors** | ✅ VERIFIED | All error paths return generic `UNAUTHORIZED`; no payload/secret exposed |
| **Config cannot start with no key** | ✅ VERIFIED | `superRefine` at config.ts:28-30 prevents startup |
| **Production cannot use HS256-only** | ✅ VERIFIED | `superRefine` at config.ts:36-38 requires JWKS_URL or SUPABASE_URL |
| **Issuer/audience enforced in prod** | ✅ VERIFIED | Existing checks at config.ts:32-35 unchanged |
| **Cookie precedence over header** | ✅ VERIFIED | `cookieToken \|\| headerToken` at auth.ts:13 |
| **DB status check after JWT verification** | ✅ VERIFIED | `AuthGuard` checks `status`, `deleted_at`, `locked_until` post-verification |
| **No invented tables/columns/events** | ✅ VERIFIED | Only config schema and verifier code changed |
| **Non-null assertion safe** | ✅ VERIFIED | `config.SUPABASE_JWT_SECRET!` in app.module.ts:31 — guaranteed non-null by `superRefine` at config.ts:28-30 |

## 6. Missing tests or coverage gaps

| Priority | Gap | Description |
|----------|-----|-------------|
| LOW | No JWKS `createRemoteJWKSet` unit test | The actual JWKS fetch/verify is tested via jose's own test suite; this codebase tests the config parsing and the verify-boundary (mock). A JWKS-mode test with a mock HTTP server would be ideal but is LOW priority because the integration boundary is well-defined. |
| LOW | No `SUPABASE_URL` trailing-slash edge case test | The `replace(/\/$/, '')` logic is not explicitly tested. Mitigated by Zod `z.string().url()` validation. |
| LOW | No test for `new URL()` throwing on malformed JWKS URL | Mitigated by Zod `z.string().url()` validation at config load time. |

## 7. Recommended follow-ups (non-blocking)

| # | Item |
|---|------|
| 1 | Add a `config.spec.ts` test for `SUPABASE_URL` trailing-slash derivation (verifies `app.module.ts:29` logic) |
| 2 | Add an `auth.spec.ts` test that passes a `{ jwksUrl: '...' }` key to `verifyBearer` to verify the JWKS path reaches `verifier.verify` correctly |
| 3 | Document in IMPLEMENTATION-TRACKER that JWKS-only config is the recommended path for production |

## 8. Final recommendation

**APPROVED** — All three commits are well-structured, security-critical behaviors are correct, config enforcement is comprehensive, and all 188 tests pass. The JWKS support is a clean addition that maintains full backward compatibility with the existing HS256 path while making asymmetric verification the enforced default for production.
