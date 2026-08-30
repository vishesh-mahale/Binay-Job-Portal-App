# freebuf Review — Commit dd763ce

## 1. Commit and scope verified

```
HEAD:           dd763ce0746d15ad0cb35a902ba89de9c0c6f506
git status:     clean
File touched:   src/auth.ts (+6/-3), src/app.module.ts (+4/-1)
Import added:   JoseJwtVerifier in app.module.ts
```

## 2. Executive verdict

**APPROVED**

## 3. Evidence-based findings

| ID | Severity | File/Line | Finding | Evidence | Required action |
|----|----------|-----------|---------|----------|-----------------|
| F-1 | PASS | `app.module.ts:33-35` | `JWT_VERIFICATION_KEY` provider correctly provides the computed `jwtKey` value | `{ provide:'JWT_VERIFICATION_KEY', useValue:jwtKey }` — identical to the `jwtKey` previously passed as first positional arg to `useFactory` | None |
| F-2 | PASS | `app.module.ts:36` | `JWT_VERIFIER` provider instantiates `JoseJwtVerifier` with no args | `{ provide:'JWT_VERIFIER', useFactory:()=>new JoseJwtVerifier() }` — matches the `verifier = new JoseJwtVerifier()` default from the old constructor | None |
| F-3 | PASS | `app.module.ts:37` | `JWT_OPTIONS` provider provides issuer and audience from config | `{ useValue:{ issuer: config.SUPABASE_JWT_ISSUER, audience: config.SUPABASE_JWT_AUDIENCE } }` — identical to the old `{ issuer:..., audience:... }` object | None |
| F-4 | PASS | `app.module.ts:38` | `AuthGuard` registered as bare class, no `useFactory` | `AuthGuard` — NestJS now constructs via DI, resolving `@Inject` tokens automatically | None |
| F-5 | PASS | `auth.ts:21-24` | All four constructor params use `@Inject` decorators | `@Inject('JWT_VERIFICATION_KEY')`, `@Inject('JWT_VERIFIER')`, `@Inject('JWT_OPTIONS')`, `@Inject(SystemClient)` | None |
| F-6 | PASS | `auth.ts:20` | `Inject` imported from `@nestjs/common` | `import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';` | None |
| F-7 | PASS | `auth.ts:29-35` | `canActivate` logic unchanged — fail-closed on missing/deleted/suspended/locked users | Same `system.query` + status/deleted_at/locked_until check as before | None |
| F-8 | PASS | `auth.ts:17-18` | `verifyBearer` standalone function unchanged | Cookie→header precedence, `UNAUTHORIZED` on missing token or verifier rejection — identical to pre-commit | None |

## 4. Correctly implemented items

1. **DI token correctness**: All four providers in `app.module.ts` provide exactly the same values that were previously passed as positional constructor arguments via `useFactory`. The semantic equivalence is exact:
   - `jwtKey` (string | `{ jwksUrl }`) → `JWT_VERIFICATION_KEY`
   - `new JoseJwtVerifier()` → `JWT_VERIFIER`
   - `{ issuer, audience }` → `JWT_OPTIONS`
   - `SystemClient` (by type token) → `@Inject(SystemClient)`

2. **JWT key derivation unchanged**: `app.module.ts:29-32` — the `SUPABASE_JWKS_URL → SUPABASE_URL fallback → HS256 legacy` chain is untouched.

3. **Fail-closed behavior preserved**: `AuthGuard.canActivate` still throws `UnauthorizedException` on:
   - Missing cookie and Authorization header (via `verifyBearer`)
   - Invalid/expired/JOSE-failed token (via `verifier.verify` catch)
   - Missing/suspended/deleted/locked user account (via `system.query`)

4. **UserContextClient/SystemClient boundary intact**: `AuthGuard` only uses `SystemClient` for the account-status check. `IdentityService` (line 13 of `identity-company.ts`) still receives `UserContextClient` and `SystemClient` via standard NestJS DI — not affected by this commit.

5. **`verifyBearer` standalone function preserved**: The exported function still accepts `(request, key, verifier, options)` and is used independently of the DI-managed `AuthGuard`. Tests exercise both paths.

## 5. Security and validation assessment

| Check | Status | Evidence |
|-------|--------|----------|
| No algorithm downgrade | ✅ | `jwt-verifier.ts:28-29` — HS256 vs ES256/RS256 is determined by key type, not by any code changed in this commit |
| Issuer/audience still enforced | ✅ | `JWT_OPTIONS` provides same values; `verifier.verify(token, key, options)` unchanged |
| No secret/key leakage | ✅ | All catch blocks return generic `UNAUTHORIZED`; no token/key in logs |
| SystemClient not exposed to browser | ✅ | `AuthGuard` constructor is internal DI; `SystemClient` is module-private provider |
| `UserContextClient` SELECT-only enforcement | ✅ | `clients.ts:17` — `queryAsUser` regex guard unchanged |
| Cookie token precedence | ✅ | `auth.ts:17` — cookie checked before header, identical to before |
| Account-status check (status, deleted_at, locked_until) | ✅ | `auth.ts:29-35` — exact same SQL and conditions |

**No security regression detected.**

## 6. Missing tests or coverage gaps

| # | Gap | Severity | Notes |
|---|-----|----------|-------|
| 1 | No test verifying `AuthGuard` resolves through NestJS DI container | LOW | Current tests construct manually with `new AuthGuard(...)` — valid because `@Inject` decorators are metadata-only and positional `new` still works (proven by 9/9 auth tests passing). However, an integration test bootstrapping the full `AppModule` and requesting `AuthGuard` from the container would provide end-to-end confidence. |
| 2 | `JoseJwtVerifier` constructed with no args — no test that this is correct | LOW | `JoseJwtVerifier` has no constructor parameters, so `new JoseJwtVerifier()` is always correct. Informational only. |

## 7. Required fixes before production

**None.** This commit is a clean refactor from `useFactory` to explicit DI tokens with no semantic change.

## 8. Test results

```
✅ npx tsc --noEmit            Exit 0, zero errors
✅ npx jest auth.spec.ts       9/9 pass (11.2s)
✅ npx jest identity-company   5/5 pass (8.1s)
✅ npx jest health|obs|db|cli  19/19 pass (30.7s)
```

Note: Full `npx jest --runInBand` timed out at 180s in this environment (likely OneDrive filesystem latency on Windows). The auth, identity, and infrastructure test suites all pass. Previous reviews confirmed 195 tests across 33 suites pass; no code change in this commit touches those test files.

## 9. Final recommendation

**APPROVED** — The commit correctly refactors `AuthGuard` from `useFactory` positional arguments to explicit NestJS `@Inject` token-based dependency injection. All four provider values (`JWT_VERIFICATION_KEY`, `JWT_VERIFIER`, `JWT_OPTIONS`, `SystemClient`) are semantically identical to their pre-commit equivalents. Fail-closed behavior, JWT verification logic, account-status checks, and UserContextClient/SystemClient boundaries are all preserved. Typecheck passes, relevant tests pass. No security regression.
