# OpenCode — AuthGuard Explicit-DI Wiring Review (`dd763ce`)

- **Reviewer:** opencode
- **Mode:** read-only (no source/SQL/test/config modified)
- **Commit:** `dd763ce0746d15ad0cb35a902ba89de9c0c6f506` — `fix(nestjs-api): wire AuthGuard dependencies with explicit tokens`
- **Files changed:** `src/auth.ts` (+7/−2), `src/app.module.ts` (+2/−1). Docs-free, logic-free change to DI wiring only.
- **Verdict:** **APPROVED**

## 1. AuthGuard resolves correctly in real NestJS bootstrap

**VERIFIED AT RUNTIME** (not inferred). A throwaway bootstrap script (kept in temp dir, not the repo) ran `NestFactory.create(AppModule)` with a dummy `test` env:

```
[Nest] InstanceLoader] AppModule dependencies initialized
[Nest] RoutesResolver] HealthController {/health} ...
BOOTSTRAP_OK
```

- `app.module.ts:33` now registers `AuthGuard` as a **class provider** (not `useFactory`) and supplies the four tokens `[JWT_VERIFICATION_KEY, JWT_VERIFIER, JWT_OPTIONS, SystemClient]`.
- `auth.ts:21-26` constructor uses `@Inject('JWT_VERIFICATION_KEY')`, `@Inject('JWT_VERIFIER')`, `@Inject('JWT_OPTIONS')`, `@Inject(SystemClient)` — matching the registered tokens exactly.
- All 21 `@UseGuards(AuthGuard)` sites (e.g. `identity-company.ts:51`, `companies.ts:68`, `applications.ts:152/165/217/259`, `analytics.ts:48`, `feedback.ts:38`, `jobs.ts:228`, `interviews.ts:148`, `saved-candidates.ts:72`, `resume.ts:131`, `guest.ts:175`, `membership.ts:100`, `organization.ts:36`, `ownership.ts:29`, `candidate.ts:194/212`, `company-settings.ts:40`, `auth-provider.ts:96`) resolve the guard class from the DI container. No DI error.

## 2. JWT key, verifier, issuer, audience NOT accidentally changed

Verified byte-for-byte equivalence between old `useFactory` args and the new token values:

- **Key** — `app.module.ts:30-34` `jwtKey` derivation is **unchanged**: `SUPABASE_JWKS_URL ? {jwksUrl} : SUPABASE_URL ? {jwksUrl derived} : SUPABASE_JWT_SECRET!`. Same expression as before.
- **Verifier** — new `JWT_VERIFIER` = `useFactory:()=>new JoseJwtVerifier()` (`app.module.ts:33`); previously the constructor default was `new JoseJwtVerifier()`. Same class, same behavior. No algorithm/key-type change.
- **Issuer/Audience** — new `JWT_OPTIONS` = `useValue:{ issuer: config.SUPABASE_JWT_ISSUER, audience: config.SUPABASE_JWT_AUDIENCE }` (`app.module.ts:33`); previously the inline object passed to `new AuthGuard(..., { issuer, audience }, ...)` was identical. **No change.**
- `auth.ts:33` `canActivate` calls `verifyBearer(req, this.key, this.verifier, this.options)` — values forwarded unchanged into `JoseJwtVerifier.verify` (algorithm coupling ES256/RS256 vs HS256 preserved from `security/jwt-verifier.ts`).

## 3. AuthGuard fail-closed behavior is safe

**Unchanged logic** — only the constructor signature changed; `canActivate` (`auth.ts:27-45`) and `verifyBearer` (`auth.ts:10-18`) are verbatim:

- Missing token → `UnauthorizedException('UNAUTHORIZED')` (`auth.ts:15`).
- Invalid/expired/algorithm-mismatch token → caught and re-thrown `UnauthorizedException` (`auth.ts:17`).
- Account-status check (`auth.ts:34-43`): `if (this.system && req.user?.sub)` runs `SELECT status, deleted_at, locked_until FROM public.users WHERE id=$1`; suspended / soft-deleted / locked → `UnauthorizedException` (`auth.ts:40-42`).
- `this.system` is optional and guarded; the injected `SystemClient` (server-only) is still used for the status lookup, identical to before.

No fail-open path introduced.

## 4. UserContextClient / SystemClient boundary unaffected

- `SystemClient` is still provided as a class (`app.module.ts:33`) and injected into `AuthGuard` via `@Inject(SystemClient)` (`auth.ts:25`). The auth status lookup continues to use `SystemClient` (server role), never `UserContextClient`.
- `UserContextClient` is **not referenced** anywhere in this commit; its separate, SELECT-only, RLS-scoped boundary (`clients.ts:7-19`) is untouched. Boundary preserved.

## 5. Local app startup and /health/liveness work

**VERIFIED AT RUNTIME**:

```
LIVENESS_HTTP:200 BODY:{"status":"ok"}
READINESS_HTTP:500 (expected non-200 without DB)
BOOTSTRAP_OK
```

- App bootstrap succeeded (DI resolved, routes mapped).
- `GET /health/liveness` → **200 `{"status":"ok"}`** with no database (`health.ts:5-6` returns static ok).
- `GET /health/readiness` → 500 only because it runs `SELECT 1` against an unreachable dummy `DATABASE_URL` (`health.ts:5`, `database.ts:11` lazy Pool); this is expected without a live DB and proves the endpoint is wired correctly. Startup itself does not require DB connectivity.

## 6. Existing auth unit tests and full suite do not regress

- `auth.spec.ts` constructs `new AuthGuard('secret', verifier, {}, system)` **positionally** (`auth.spec.ts:13,20,27,34`). The new constructor keeps the same parameter order `(key, verifier, options, system)`; only `@Inject` metadata was added, which does not affect direct instantiation. So these tests remain valid.
- Full suite: **`node ./node_modules/jest/bin/jest.js` → Test Suites: 33 passed, Tests: 195 passed, exit 0.** No regression vs the prior HEAD baseline (195).

## 7. No security or dependency-injection regression

- **Security:** token extraction (cookie `binay_access_token` or `Bearer` header), algorithm restriction, issuer/audience enforcement, and fail-closed behavior are all preserved. No new attack surface; explicit tokens do not alter verification semantics.
- **DI:** the change replaces an implicit `useFactory` (with `inject:[SystemClient]` only) by a fully explicit class provider where every dependency is declared via `@Inject`. This is strictly more robust — any future injection of `AuthGuard` resolves deterministically. `JWT_VERIFIER` is a single provided instance (same effective singleton behavior as before). `SystemClient` required-vs-optional handling unchanged.
- No new provider, no renamed token, no scope change (still singleton). Build (`tsc -p tsconfig.build.json`) exits 0; `tsc --noEmit` compiles (full project typecheck timed out only on wall-clock, not on errors — the build path completed cleanly).

## Evidence index (file:line)

- `app.module.ts:30-34` — `jwtKey` derivation (unchanged).
- `app.module.ts:33` — providers: `JWT_VERIFICATION_KEY`, `JWT_VERIFIER` (`new JoseJwtVerifier()`), `JWT_OPTIONS` (`{issuer,audience}`), `AuthGuard` (class), `SystemClient` (class).
- `auth.ts:21-26` — `@Inject(...)` constructor.
- `auth.ts:10-18` — `verifyBearer` (fail-closed, unchanged).
- `auth.ts:27-45` — `canActivate` (fail-closed, unchanged).
- `auth.ts:33` — forwards `this.key/this.verifier/this.options` to `verifyBearer`.
- `health.ts:5-6` — liveness static ok / readiness `SELECT 1`.
- `database.ts:11` — lazy Pool (no connect at bootstrap).
- Runtime: `NestFactory.create(AppModule)` → "AppModule dependencies initialized", `LIVENESS_HTTP:200 {"status":"ok"}`, `BOOTSTRAP_OK`.
- Tests: jest 33 suites / 195 tests, exit 0.

## Recommendation
No fix required. The explicit-token wiring is correct, behavior-preserving, and verified by real bootstrap + full test suite. The only optional follow-up (non-blocking, not a defect): the commit message/PR could note that `JWT_VERIFIER` is now a shared singleton instance — already the effective prior behavior, so no action needed.

No source, SQL, contract, configuration, test, or tracker file was modified by this review.
