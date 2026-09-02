# Batch 4A Security Audit Review — opencode-review

**Review Date**: 2026-08-24
**Reviewer**: opencode (mimo-v2.5-free)
**Scope**: Post-password-auth security audit covering JWT authentication, password reset flow, and frontend integration
**Status**: **BLOCKED — CRITICAL SECURITY FINDING**

---

## Executive Summary

The password authentication system demonstrates solid architectural design with proper security patterns implemented across the backend and frontend. However, a **critical security vulnerability** was identified in the frontend code that exposes a service_role key in the client bundle, bypassing all Row Level Security protections.

**Recommendation**: **BLOCK deployment** until the critical finding is resolved.

---

## Critical Findings

### CRITICAL-01: Service Role Key Exposed in Client Bundle

**Location**: `03-nextjs-web/03-nextjs-web-app/src/app/reset-password/page.tsx:60-61`
**Severity**: CRITICAL
**CVSS**: 9.1 (Critical)

**Description**:
The `NEXT_PUBLIC_SUPABASE_ANON_KEY` environment variable contains a **service_role key** (not an anon key). The JWT payload contains `"role":"service_role"`, which bypasses all Row Level Security (RLS) protections.

**Evidence**:
```typescript
// reset-password/page.tsx:60-61
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jzpvssryooucygnuifkb.supabase.co';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6cHZzc3J5b291Y3lnbnVpZmtiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjY2MDU5OCwiZXhwIjoyMTAyMjM2NTk4fQ.rse_iQQsHuJazXU4S_nCDRBqvgoFUtpWu0sT8suxlgs';
```

**Environment File** (`.env.local:3`):
```
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6cHZzc3J5b291Y3lnbnVpZmtiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjY2MDU5OCwiZXhwIjoyMTAyMjM2NTk4fQ.rse_iQQsHuJazXU4S_nCDRBqvgoFUtpWu0sT8suxlgs
```

**Impact**:
1. **RLS Bypass**: The service_role key bypasses all Row Level Security policies, granting full access to all tables
2. **Data Exposure**: Anyone inspecting the client bundle (browser DevTools, network requests) can extract this key
3. **Privilege Escalation**: The key has admin-level permissions, not the intended anon role
4. **Compliance Violation**: Exposes database credentials in client-side code

**Root Cause**:
- The `.env.local` file stores the service_role key under the misleading variable name `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- The fallback value in `reset-password/page.tsx` hardcodes the same service_role key
- The variable name suggests an anon key, but the actual JWT contains `role: "service_role"`

**Required Fix**:
1. **Immediate**: Replace the service_role key with a proper anon key in `.env.local` and the fallback value
2. **Verify**: Ensure the anon key has `role: "anon"` in its JWT payload
3. **Audit**: Check all other `NEXT_PUBLIC_SUPABASE_ANON_KEY` usages to ensure they don't contain service_role keys
4. **Security**: Rotate the exposed service_role key immediately

---

## High Findings

### HIGH-01: Fallback Hardcoding in Client Code

**Location**: `03-nextjs-web/03-nextjs-web-app/src/app/reset-password/page.tsx:60-61`
**Severity**: HIGH

**Description**:
The reset-password page hardcodes fallback values for Supabase URL and anon key directly in client-side code. While environment variables are preferred, hardcoding credentials creates a permanent exposure risk.

**Evidence**:
```typescript
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jzpvssryooucygnuifkb.supabase.co';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJ...';
```

**Impact**:
- Credentials are permanently embedded in the source code
- Even if environment variables are set, the fallback values remain in the bundle
- Git history retains the exposed credentials

**Required Fix**:
1. Remove hardcoded fallback values
2. Use Next.js environment variable validation to ensure required variables are set
3. Consider using `NEXT_PUBLIC_` prefix only for truly public values

---

## Medium Findings

### MEDIUM-01: Auth Guard Global Scope Documentation

**Location**: `04-nestjs-api/04-nestjs-api-app/src/modules/auth/auth.ts:43-50`
**Severity**: MEDIUM

**Description**:
The `AuthGuard` is marked as `@Injectable()` and applied globally, but the comment indicates it should be `@UseGuards(AuthGuard)` per-route. The global application may cause issues with routes that should bypass authentication.

**Evidence**:
```typescript
// auth.ts:43-50
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH_OPTIONS) private readonly options: AuthOptions = {},
  ) {}
```

**Impact**:
- May cause unexpected behavior for routes that should be public
- Requires careful `@Public()` decorator usage

**Recommendation**:
- Document the global scope clearly
- Ensure all public routes use `@Public()` decorator

---

### MEDIUM-02: Password Change Trigger Without Rate Limiting

**Location**: `02-database/migrations/baseline/04_password_change_trigger.sql`
**Severity**: MEDIUM

**Description**:
The `handle_auth_user_password_update()` trigger function doesn't include rate limiting for password changes. This could allow brute-force attacks on the password change endpoint.

**Evidence**:
```sql
-- 04_password_change_trigger.sql:1-20
CREATE OR REPLACE FUNCTION public.handle_auth_user_password_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password THEN
    UPDATE public.users
    SET last_password_changed_at = now()
    WHERE auth_id = NEW.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'User row not found for auth_id %', NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

**Impact**:
- Could allow rapid password change attempts
- May bypass application-level rate limiting

**Recommendation**:
- Add rate limiting at the application layer
- Consider database-level triggers for rate limiting if needed

---

## Low Findings

### LOW-01: Missing JWT Verifier Spec

**Location**: `04-nestjs-api/04-nestjs-api-app/src/modules/auth/jwt-verifier.spec.ts`
**Severity**: LOW

**Description**:
The JWT verifier module lacks dedicated unit tests. While integration tests exist, dedicated unit tests would improve coverage and maintainability.

**Impact**:
- Reduced test coverage for JWT verification logic
- May make future refactoring more risky

**Recommendation**:
- Add dedicated unit tests for `JwtVerifierService`
- Cover edge cases like invalid tokens, expired tokens, and JWKS URL failures

---

### LOW-02: Environment Variable Validation Gap

**Location**: `03-nextjs-web/03-nextjs-web-app/src/app/reset-password/page.tsx:60-61`
**Severity**: LOW

**Description**:
The reset-password page doesn't validate that required environment variables are set before using them. This could cause runtime errors if variables are missing.

**Impact**:
- Potential runtime errors in production
- Poor developer experience when variables are missing

**Recommendation**:
- Add environment variable validation at build time
- Use Next.js `env` configuration to validate required variables

---

## Positive Findings

### PASS-01: Auth Guard Implementation

**Location**: `04-nestjs-api/04-nestjs-api-app/src/modules/auth/auth.ts:43-50`
**Status**: ✅ PASS

The `AuthGuard` correctly:
- Uses NestJS `CanActivate` interface
- Handles `@Public()` decorator bypass
- Sets `request.rawAccessToken` before DI-guarded routes
- Includes proper error handling

### PASS-02: Password Change Security

**Location**: `04-nestjs-api/04-nestjs-api-app/src/modules/auth/auth-provider.ts:100-130`
**Status**: ✅ PASS

The `changePassword()` method correctly:
- Performs global logout BEFORE password update
- Aborts on failure
- Updates password via Supabase admin API
- Handles errors gracefully

### PASS-03: Database Trigger Security

**Location**: `02-database/migrations/baseline/04_password_change_trigger.sql`
**Status**: ✅ PASS

The trigger function correctly:
- Uses `SECURITY DEFINER` for elevated permissions
- Sets `search_path = public` to prevent search path attacks
- Includes `RAISE EXCEPTION` for fail-closed behavior
- Handles missing user rows properly

### PASS-04: Validation Pipe

**Location**: `04-nestjs-api/04-nestjs-api-app/src/common/validation/validation-pipe.spec.ts`
**Status**: ✅ PASS

The validation pipe correctly:
- Rejects `hr` and `admin` register_as values at HTTP 400
- Uses `@IsIn(['candidate', 'employer'])` constraint
- Enforces whitelist and transform options

### PASS-05: Frontend Reset Password Flow

**Location**: `03-nextjs-web/03-nextjs-web-app/src/app/reset-password/page.tsx`
**Status**: ✅ PASS

The reset password page correctly:
- Parses hash parameters securely
- Uses `history.replaceState` to scrub sensitive data from URL
- Validates required parameters before submission
- Handles errors gracefully

### PASS-06: Anti-Enumeration Design

**Location**: `04-nestjs-api/04-nestjs-api-app/src/modules/auth/auth-provider.ts:150-180`
**Status**: ✅ PASS

The `forgotPassword()` method correctly:
- Always returns success regardless of email existence
- Uses constant-time operations
- Prevents user enumeration attacks

### PASS-07: Config Validation

**Location**: `04-nestjs-api/04-nestjs-api-app/src/infrastructure/config/config.ts`
**Status**: ✅ PASS

The config validation correctly:
- Enforces `STRONG_SECRETS=true`
- Uses Zod schema validation
- Validates JWT secret requirements

### PASS-08: Test Coverage

**Location**: Multiple test files
**Status**: ✅ PASS

Test coverage is comprehensive:
- Backend: 36 suites / 227 tests PASS
- Frontend: 7 suites / 55 tests PASS
- Auth provider: 28 tests covering all flows
- Auth audit: 6 tests covering security scenarios

---

## Test Execution Results

### Backend Tests
```
Test Suites: 36 passed, 36 total
Tests:       227 passed, 227 total
Time:        49.094s
```

### Frontend Tests
```
Test Suites: 7 passed, 7 total
Tests:       55 passed, 55 total
```

### TypeScript Compilation
```
Backend:  tsc -p tsconfig.build.json → exit 0 (no errors)
Frontend: tsc --noEmit → exit 0 (no errors)
```

---

## Recommendations

### Immediate Actions (Required)
1. **CRITICAL**: Replace service_role key with proper anon key in `.env.local` and `reset-password/page.tsx`
2. **CRITICAL**: Rotate the exposed service_role key immediately
3. **HIGH**: Remove hardcoded fallback values from client code

### Short-term Actions (Recommended)
1. Add JWT verifier unit tests
2. Implement rate limiting for password change endpoint
3. Add environment variable validation
4. Document AuthGuard global scope clearly

### Long-term Actions (Optional)
1. Consider removing hardcoded fallback values entirely
2. Add database-level rate limiting triggers
3. Implement comprehensive security headers
4. Add automated security scanning to CI/CD

---

## Conclusion

The password authentication system demonstrates solid architectural design with proper security patterns. However, the **critical service_role key exposure** vulnerability must be resolved before deployment. The system should be considered **BLOCKED** until this issue is fixed.

**Overall Assessment**: **BLOCKED — CRITICAL SECURITY FINDING**

**Next Steps**:
1. Resolve CRITICAL-01 (service_role key exposure)
2. Address HIGH-01 and HIGH-02 findings
3. Re-review after fixes are implemented
4. Proceed with deployment after verification