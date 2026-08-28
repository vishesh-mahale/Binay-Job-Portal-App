# Phase 09 Foundation Slice — Final Security Review

Status: `REVIEW COMPLETE`

Reviewer: opencode (Independent Senior NestJS, PostgreSQL and Application Security reviewer)
Audit target: `04-nestjs-api/04-nestjs-api-app/` (Foundation slice implementation)
Date: 2026-08-26

---

## Build and test evidence

| Command | Result | Output |
|---|---|---|
| `node node_modules/typescript/bin/tsc --noEmit` | **PASS** | 0 errors |
| `node node_modules/typescript/bin/tsc -p tsconfig.build.json` | **PASS** | 0 errors, dist/ created |
| `node node_modules/jest/bin/jest.js --runInBand` | **PASS** | 9 suites, 12 tests, 14.5s |

All commands executed successfully. No failures.

---

## Source file inventory

| File | Lines | Purpose |
|---|---|---|
| `src/main.ts` | 11 | NestJS bootstrap, ValidationPipe, exception filter, logger, shutdown |
| `src/app.module.ts` | 10 | Module wiring: config, database, health, clients, auth guard |
| `src/config.ts` | 11 | Zod schema, fail-fast `loadConfig()` |
| `src/auth.ts` | 9 | HS256 JWT verification, timing-safe compare, expiry check, AuthGuard |
| `src/clients.ts` | 18 | UserContextClient, SystemClient (separate injectable boundaries) |
| `src/database.ts` | 15 | Pg Pool, transaction wrapper with BEGIN/COMMIT/ROLLBACK, pool cleanup |
| `src/errors.ts` | 12 | ApiExceptionFilter: HTTP status → Decision-06 error code mapping |
| `src/health.ts` | 7 | Liveness (no deps), readiness (SELECT 1) |
| `src/observability.ts` | 13 | SafeLogger with PII/secret redaction |
| `src/request-context.ts` | 4 | x-request-id correlation middleware |
| `src/*.spec.ts` (9 files) | 40 | Unit tests for all modules |
| `.env.example` | 5 | Safe placeholder environment variables |
| `README.md` | 26 | Local run instructions, foundation scope |
| `package.json` | 9 | Dependencies, scripts, jest config |
| `tsconfig.json` | 4 | TypeScript strict mode, decorators |
| `tsconfig.build.json` | 1 | Build excludes test files |
| `PHASE-09-FOUNDATION-IMPLEMENTATION-REPORT.md` | 32 | Implementation report |

---

## Verification of all 18 security points

### 1. NestJS bootstrap — PASS

`main.ts`:
- Creates app with `NestFactory.create(AppModule, { bufferLogs: true })` ✓
- Applies `requestContext` middleware ✓
- Applies global `ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })` ✓
- Applies global `ApiExceptionFilter` ✓
- Applies `SafeLogger` ✓
- Calls `app.enableShutdownHooks()` ✓
- Binds to `0.0.0.0` (correct for Cloud Run) ✓

### 2. Environment fail-fast validation — PASS

`config.ts`:
- Zod schema validates all required env vars at startup ✓
- `envSchema.parse(env)` throws on missing/invalid values ✓
- `NODE_ENV`: restricted enum (development/test/preprod/production) ✓
- `PORT`: coerced int, range 1–65535, default 3000 ✓
- `DATABASE_URL`: URL format or postgres prefix ✓
- `SUPABASE_JWT_SECRET`: min 16 chars ✓
- `LOG_LEVEL`: restricted enum ✓

`config.spec.ts`: Tests that `loadConfig({})` throws ✓

### 3. Secret handling and redaction — PASS WITH MINOR

**Positive:**
- `.env.example` uses safe placeholder values, no real secrets ✓
- No `.env` file committed ✓
- `SafeLogger.redact()` strips bearer tokens, passwords, secrets, API keys, authorization headers ✓
- `observability.spec.ts`: Tests redaction removes actual secret values ✓

**Minor: `.env.example` password placeholder**
- Line 3: `DATABASE_URL=postgresql://user:password@localhost:5432/binay`
- The placeholder `password` is weak and could be mistaken for a real credential if copied without change.
- **Recommended**: Use `replace-with-secret-manager-value` or `changeme` pattern (consistent with `SUPABASE_JWT_SECRET` placeholder).
- **Impact**: Low. The file is explicitly documented as a template.

### 4. JWT verification and expiry — PASS

`auth.ts`:
- Extracts Bearer token from Authorization header ✓
- Splits JWT into 3 parts, validates structure ✓
- Parses header, verifies `alg: 'HS256'` ✓
- Verifies `payload.sub` exists ✓
- HMAC-SHA256 signature verification with `timingSafeEqual` ✓
- Expiry check: `payload.exp <= Math.floor(Date.now() / 1000)` ✓

`auth.spec.ts`:
- Tests valid non-expired token ✓
- Tests expired token rejection ✓

**Missing tests**: Algorithm confusion (none/HS384/HS512), missing Bearer prefix, malformed Base64, missing `sub` claim, invalid signature. These are unit-test-level gaps; the core verification logic is correct.

### 5. UserContextClient/SystemClient separation — PASS WITH MINOR

`clients.ts`:
- Two separate `@Injectable()` classes ✓
- `UserContextClient`: query-only, no transaction method ✓
- `SystemClient`: query + transaction method ✓
- JSDoc boundary comments: "User-context reads are deliberately a separate injectable boundary" and "System client is server-only and must never be exposed to controllers/browser DTOs" ✓

`app.module.ts`:
- Both registered as providers ✓
- `UserContextClient` and `SystemClient` are separate NestJS DI tokens ✓

`clients.spec.ts`: Tests they are distinct classes ✓

**Minor: No code-level enforcement of SystemClient exclusion from controllers**
- The boundary is enforced by DI registration (no controller injects SystemClient in this slice) and documentation.
- For future slices, a custom decorator or guard could enforce that SystemClient is not injected into HTTP-exposed controllers.
- **Impact**: Low for foundation slice (no controllers use SystemClient). Medium risk for future business modules.

### 6. Transaction commit/rollback — PASS

`database.ts` line 13:
```typescript
async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const c = await this.pool.connect();
  try { await c.query('BEGIN'); const result = await work(c); await c.query('COMMIT'); return result; }
  catch (e) { await c.query('ROLLBACK'); throw e; }
  finally { c.release(); }
}
```

- BEGIN → work → COMMIT on success ✓
- BEGIN → work → ROLLBACK on error ✓
- Client always released (finally block) ✓
- Error re-thrown after rollback ✓

`database.spec.ts`: Tests rollback on work error ✓

### 7. No external calls inside transactions — PASS

`database.ts`: Transaction wrapper contains only `BEGIN`, `work(c)`, `COMMIT`/`ROLLBACK`. No external calls (HTTP, Cloud Tasks, email, WebSocket) inside the transaction path. ✓

`SystemClient.transaction()` delegates to `DatabaseService.transaction()`. ✓

### 8. Error envelope and ValidationPipe — CONDITIONAL PASS

**ValidationPipe**: `whitelist: true, transform: true, forbidNonWhitelisted: true` ✓

**ApiExceptionFilter** (`errors.ts`):
- Maps HTTP status to Decision-06 error codes ✓
- 401 → UNAUTHORIZED ✓
- 403 → FORBIDDEN ✓
- 404 → NOT_FOUND ✓
- 500+ → INTERNAL_ERROR ✓
- 400 → VALIDATION_ERROR ✓

**Issues with error envelope:**

1. **Wrong envelope shape**: Returns `{ error: { code, message } }` instead of approved `{ success, data, request_id, trace_id, schema_version }` (Phase 05 §5).
2. **Missing `request_id`**: The correlation ID from request-context is not included in the error response.
3. **Missing `trace_id`**: No distributed trace ID in the response.
4. **Missing `schema_version`**: Envelope version not declared.
5. **Missing `success: false`**: Error responses don't include the success flag.

**Recommended**: Refactor `ApiExceptionFilter` to produce:
```json
{
  "success": false,
  "data": null,
  "error": { "code": "VALIDATION_ERROR", "message": "..." },
  "request_id": "from-request-context",
  "trace_id": "uuid",
  "schema_version": 1
}
```

**Impact**: MEDIUM. The error code mapping is correct, but the envelope shape doesn't match the approved Phase 05 §5 format. Business modules will need the correct envelope to avoid double-refactoring.

### 9. Health liveness/readiness — PASS

`health.ts`:
- Liveness: `GET /health/liveness` → `{ status: 'ok' }` (no dependencies) ✓
- Readiness: `GET /health/readiness` → executes `SELECT 1` → `{ status: 'ready' }` ✓
- Readiness propagates DB errors (verified in `failure.spec.ts`) ✓

### 10. Graceful shutdown — PASS

- `main.ts`: `app.enableShutdownHooks()` ✓
- `database.ts`: `onModuleDestroy()` calls `pool.end()` ✓
- `failure.spec.ts`: Tests pool cleanup on destroy ✓

**Missing**: In-flight request draining is handled by NestJS default behavior. No custom timeout configured. Acceptable for foundation slice.

### 11. Request correlation ID — PASS

`request-context.ts`:
- Reads `x-request-id` from incoming request ✓
- Validates format: `/^[A-Za-z0-9._:-]{1,128}$/` (prevents injection) ✓
- Generates `randomUUID()` if missing or invalid ✓
- Sets `x-request-id` response header ✓
- Attaches `requestId` to request object ✓

`request-context.spec.ts`: Tests safe incoming ID preservation ✓

**Missing tests**: Invalid characters in incoming ID (should generate new UUID), missing header, oversized ID.

### 12. PII/secret redaction — PASS

`observability.ts`:
- `redact()` function with regex: `/(bearer\s+|password|token|secret|api[_-]?key|authorization)([=:]\s*|\s+)[^\s,;]+/gi` ✓
- Replaces matched values with `[REDACTED]` ✓
- `SafeLogger` wraps all log methods with `redact()` ✓
- Error traces always replaced with `[REDACTED]` ✓
- Debug logging gated by `LOG_LEVEL === 'debug'` ✓

`observability.spec.ts`: Tests credential removal ✓

**Minor: Overly broad regex**
- The pattern `token` matches legitimate strings like `token_count=5` or `rate_limit_tokens=100`.
- `secret` matches `secretary`, `section` etc.
- **Impact**: Low. False positives are acceptable for security (over-redact vs under-redact).

### 13. Database outage handling — PASS

`health.ts`: Readiness check executes `SELECT 1`; on failure, error propagates to HTTP 500. ✓

`failure.spec.ts`:
- Tests readiness propagates DB outage error ✓
- Tests pool cleanup on module destroy ✓

**Missing**: Startup behavior when DB is unreachable (NestJS will fail to create the module). Pool `max: 10` with `connectionTimeout` not configured (defaults to pg default). Acceptable for foundation.

### 14. Test quality and actual test output — PASS WITH MINOR

**Test results**: 9 suites, 12 tests, all PASS.

| Suite | Tests | What's tested |
|---|---|---|
| config.spec.ts | 1 | Fail-fast on missing config |
| auth.spec.ts | 2 | Valid token, expired token |
| clients.spec.ts | 1 | Class separation |
| database.spec.ts | 1 | Transaction rollback |
| errors.spec.ts | 2 | 400→VALIDATION_ERROR, 404→NOT_FOUND |
| health.spec.ts | 1 | Readiness DB check |
| observability.spec.ts | 1 | PII redaction |
| request-context.spec.ts | 1 | Safe incoming ID |
| failure.spec.ts | 2 | DB outage propagation, pool cleanup |

**Missing test coverage:**

| Area | Missing test | Impact |
|---|---|---|
| config | Valid config returns parsed values | Low |
| config | Invalid PORT range rejection | Low |
| auth | Missing Authorization header | Medium |
| auth | Malformed JWT (not 3 parts) | Medium |
| auth | Invalid algorithm (HS384) | Medium |
| auth | Invalid signature | Medium |
| auth | Missing `sub` claim | Low |
| errors | 401→UNAUTHORIZED mapping | Low |
| errors | 500→INTERNAL_ERROR mapping | Low |
| request-context | Invalid characters in x-request-id | Low |
| request-context | Missing x-request-id generates UUID | Low |
| database | Successful commit path | Low |
| validation | forbidNonWhitelisted rejects unknown fields | Medium |

**Test quality**: Tests are focused and correct. Mock patterns are appropriate. No flaky tests. However, coverage is thin (12 tests for 10 source modules). Security-critical paths (auth edge cases, validation pipe behavior) need more tests.

### 15. No invented tables, events, queues or providers — PASS

- No SQL files created ✓
- No event contracts created ✓
- No queue configurations created ✓
- No provider adapters created ✓
- Only existing baseline SQL objects referenced (none in this slice) ✓

### 16. No generic in-memory idempotency guarantee — PASS

- No idempotency module or in-memory store created ✓
- No `Map` or `Set` used for deduplication ✓
- Domain-specific keys (resume_parsing_jobs, referrals) remain authoritative ✓

### 17. README/navigation accuracy — PASS WITH MINOR

**README.md**:
- Local run instructions: `npm install`, `npm run build`, `npm test`, `npm run start:dev` ✓
- `.env.example` copy instruction ✓
- Foundation scope correctly listed ✓
- Business endpoint exclusion correctly stated ✓

**Implementation report line 27**: References `../s1/archive/pre-phase9/` for old audit documents. This path appears correct relative to the report location.

**Minor: No `s1/phase9-foundation/README.md`**
- The review report directory `04-nestjs-api/s1/phase9-foundation/` has no local README.
- **Impact**: Low. Navigation from parent README is sufficient.

### 18. Clean standalone npm install concern — OPEN

From the implementation report (line 25):
> "Dependencies were resolved from the existing local development dependency cache/shared workspace installation for this verification. A clean standalone install still needs to be verified in an internet-enabled environment."

This is an honest disclosure. The `node_modules/` directory exists and contains all dependencies. However:
- No `package-lock.json` was found in the directory listing.
- Clean `npm install` in an isolated environment has not been verified.
- CI/CD pipelines require a lockfile for reproducible builds.

**Impact**: MEDIUM. Without a lockfile, dependency versions may drift. This must be verified before CI integration.

---

## ISSUE LOG

| Issue ID | Severity | Section | Finding | Impact | Recommended fix | Blocks |
|---|---|---|---|---|---|---|
| SEC-01 | **MEDIUM** | errors.ts:10 | Error envelope shape `{ error: { code, message } }` doesn't match approved Phase 05 §5 format `{ success, data, error, request_id, trace_id, schema_version }` | Business modules will double-refactor; API consumers receive non-standard envelope | Refactor ApiExceptionFilter to produce approved envelope with request_id from context | No (foundation works; future modules need fix) |
| SEC-02 | **MEDIUM** | errors.ts:10 | Missing `request_id` in error response despite request-context middleware setting it | Correlation broken in error responses | Read `requestId` from request object and include in envelope | No |
| SEC-03 | **MEDIUM** | — | No `package-lock.json` found; clean standalone `npm install` unverified | Reproducible builds not guaranteed; CI may fail | Run `npm install` in clean environment, commit lockfile | No (but required before CI) |
| SEC-04 | **LOW** | .env.example:3 | DATABASE_URL placeholder uses `password` which is weak and could be mistaken for real | Credential confusion if copied without change | Use `replace-with-secret-manager-value` pattern | No |
| SEC-05 | **LOW** | auth.ts | No test coverage for algorithm confusion, missing header, malformed JWT, invalid signature | Auth edge cases untested | Add auth.spec.ts tests for these scenarios | No |
| SEC-06 | **LOW** | clients.ts | SystemClient boundary enforced by documentation only; no code-level guard against controller injection | Future business modules might accidentally inject SystemClient into HTTP controllers | Consider custom `@SystemOnly()` decorator or DI scope guard in future slices | No |
| SEC-07 | **LOW** | observability.ts:3 | Redaction regex `token` matches legitimate strings like `token_count` | Over-redaction in logs | Acceptable for security; no fix needed | No |
| SEC-08 | **LOW** | — | 12 tests for 10 source modules; security-critical auth edge cases have only 2 tests | Thin test coverage | Add missing auth, validation, error mapping tests | No |
| SEC-09 | **LOW** | — | No global `/api/v1` prefix configured | API versioning not established | Add `app.setGlobalPrefix('api/v1')` in main.ts | No |
| SEC-10 | **INFO** | PHASE-09-FOUNDATION-IMPLEMENTATION-REPORT.md:25 | Clean standalone npm install unverified (honest disclosure) | Build reproducibility unknown | Verify in internet-enabled environment | No |

---

## Verification summary

| # | Point | Result |
|---|---|---|
| 1 | NestJS bootstrap | PASS |
| 2 | Environment fail-fast validation | PASS |
| 3 | Secret handling and redaction | PASS WITH MINOR (SEC-04) |
| 4 | JWT verification and expiry | PASS |
| 5 | UserContextClient/SystemClient separation | PASS WITH MINOR (SEC-06) |
| 6 | Transaction commit/rollback | PASS |
| 7 | No external calls inside transactions | PASS |
| 8 | Error envelope and ValidationPipe | CONDITIONAL PASS (SEC-01, SEC-02) |
| 9 | Health liveness/readiness | PASS |
| 10 | Graceful shutdown | PASS |
| 11 | Request correlation ID | PASS |
| 12 | PII/secret redaction | PASS |
| 13 | Database outage handling | PASS |
| 14 | Test quality and actual test output | PASS WITH MINOR (SEC-08) |
| 15 | No invented tables/events/queues/providers | PASS |
| 16 | No generic in-memory idempotency guarantee | PASS |
| 17 | README/navigation accuracy | PASS |
| 18 | Clean standalone npm install | OPEN (SEC-03) |

---

## FINAL VERDICT

### **PASS WITH MINOR FIXES**

The Phase 09 Foundation slice is implemented, builds cleanly, and all 12 tests pass. The core security boundaries are correct:

- **Fail-fast config**: Zod validation catches missing/invalid env vars at startup ✓
- **JWT verification**: HS256 with timing-safe compare and expiry check ✓
- **Client separation**: Separate injectable classes with boundary documentation ✓
- **Transaction safety**: BEGIN/COMMIT/ROLLBACK with proper error handling ✓
- **No external calls in transactions**: Verified ✓
- **PII redaction**: Regex-based redaction in SafeLogger ✓
- **Health endpoints**: Liveness (no deps) and readiness (DB check) ✓
- **Correlation IDs**: x-request-id with format validation ✓
- **No inventions**: Zero new tables, events, queues, or providers ✓

**3 MEDIUM findings** that should be addressed before business module implementation:

1. **SEC-01/SEC-02**: Error envelope shape must match Phase 05 §5 approved format (with `request_id`, `trace_id`, `schema_version`). This is the most important fix — business modules will depend on the correct envelope.

2. **SEC-03**: `package-lock.json` must be generated and clean standalone install verified before CI integration.

**7 LOW/INFO findings** are acceptable for the foundation slice and can be addressed incrementally.

**The foundation is safe to build upon.** Business modules should proceed after:
1. Error envelope refactored to approved format (SEC-01/SEC-02)
2. Lockfile generated and standalone install verified (SEC-03)
