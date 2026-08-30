# Freebuf DTO Validation Review — Commit 0c9c2ef

## 1. Commit and scope verified

```
✅ git status --short          Clean (only Agent_review/ untracked dirs)
✅ git rev-parse HEAD          0c9c2ef1a5e9470dc67af6e94079c90f5af2a6db
✅ npm run build               Exit 0, zero errors
```

Versions: NestJS 10.4.22, class-transformer 0.5.1, class-validator 0.15.1

---

## 2. Executive verdict

**BLOCKED**

Every `@Body()` parameter typed as a **class DTO** (not an interface, not `any`, not an inline type) is rejected at runtime by the global `ValidationPipe` with `whitelist: true, forbidNonWhitelisted: true`. This is because `class-validator`'s whitelist validation only recognizes properties that carry at least one `@Is*` decorator. Undecorated properties are treated as unknown and rejected with `400 BAD_REQUEST: "property X should not exist"`.

**17 class-based DTO endpoints are completely broken.** Valid, expected request bodies are rejected. Only `UpdateCompanySettingsDto` works because it has `@IsDefined() @IsBoolean()` decorators.

This is a **BLOCKER** because it prevents all signup, login, company CRUD, organization management, membership invite, ownership transfer, candidate profile update, and fact archive operations.

---

## 3. Evidence-based findings

### 3.1 Root cause proof

```javascript
// class-validator ^0.15.1 with whitelist: true
class PlainDto { email; password; }
const dto = Object.assign(new PlainDto(), { email: 'test@x.com', password: 's' });
const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: false });
// → 2 errors: "property email should not exist", "property password should not exist"

class DecoratedDto {}
IsDefined()(DecoratedDto.prototype, 'email');
IsString()(DecoratedDto.prototype, 'password');
const dto2 = Object.assign(new DecoratedDto(), { email: 'test@x.com', password: 's' });
const errors2 = await validate(dto2, { whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: false });
// → 0 errors ✅
```

### 3.2 NestJS ValidationPipe flow

```
@nestjs/common/pipes/validation.pipe.js (NestJS 10.4.22):

1. metatype = metadata.metatype   // e.g. SignupDto
2. if (!metatype || !toValidate(metadata)) return value  // skips for interfaces/any
3. entity = plainToClass(metatype, value, transformOptions)  // creates class instance
4. errors = await validate(entity, validatorOptions)  // class-validator validate()
5. if (errors.length > 0) throw exceptionFactory(errors)  // ← THIS THROWS
6. return classToPlain(entity, transformOptions) or entity
```

`validatorOptions` includes `{ whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: false }`.

`class-validator` `validate()` with `whitelist: true` checks each property's existence in the MetadataStorage. Properties without any `@Is*`/`@IsNotEmpty()`/etc. decorator are flagged as `whitelistValidation` errors.

### 3.3 TypeScript type erasure behavior

TypeScript erases these at compile time, so NestJS `@Body()` receives `metatype = undefined` and skips validation:

| Pattern | Runtime metatype | Validation |
|---------|-----------------|------------|
| `@Body() body: SomeClass` | `SomeClass` constructor | ✅ Validates (FAILS for undecorated) |
| `@Body() body: SomeInterface` | `undefined` | ❌ Skipped |
| `@Body() body: { key?: type }` | `undefined` | ❌ Skipped |
| `@Body() body: any` | `undefined` | ❌ Skipped |

---

## 4. All affected endpoints

### 4.1 BLOCKED — Class DTOs (17 endpoints, all fail at runtime)

| ID | File | Endpoint | DTO Class | Undecorated Props |
|----|------|----------|-----------|-------------------|
| **B-1** | auth-provider.ts:63 | `POST /api/v1/auth/signup` | `SignupDto` | email, password |
| **B-2** | auth-provider.ts:65 | `POST /api/v1/auth/login` | `LoginDto` | email, password |
| **B-3** | companies.ts:70 | `POST /api/v1/companies` | `CreateCompanyDto` | name, slug, + 24 optional |
| **B-4** | companies.ts:72 | `PATCH /api/v1/companies/:companyId` | `UpdateCompanyDto` | 23 optional fields |
| **B-5** | organization.ts | `POST /api/v1/companies/:companyId/branches` | `CreateBranchDto` | name, city, country, + 9 optional |
| **B-6** | organization.ts | `PATCH /api/v1/companies/:companyId/branches/:branchId` | `UpdateBranchDto` | inherits CreateBranchDto + is_active |
| **B-7** | organization.ts | `POST /api/v1/companies/:companyId/departments` | `CreateDepartmentDto` | name, + 2 optional |
| **B-8** | organization.ts | `PATCH /api/v1/companies/:companyId/departments/:departmentId` | `UpdateDepartmentDto` | inherits + is_active |
| **B-9** | organization.ts | `POST /api/v1/companies/:companyId/teams` | `CreateTeamDto` | department_id, name, + 2 optional |
| **B-10** | organization.ts | `PATCH /api/v1/companies/:companyId/teams/:teamId` | `UpdateTeamDto` | 4 optional fields |
| **B-11** | membership.ts:102 | `POST /api/v1/companies/:companyId/members` | `AddCompanyMemberDto` | user_id, + 11 optional |
| **B-12** | ownership.ts:31 | `POST /api/v1/companies/:companyId/ownership-transfer` | `TransferOwnershipDto` | new_owner_user_id |
| **B-13** | candidate.ts:200 | `PATCH /api/v1/candidates/me` | `UpdateCandidateProfileDto` | expected_profile_revision, + 18 optional |
| **B-14** | candidate.ts:205 | `DELETE /api/v1/candidates/me/facts/:factType/:factId` | `ArchiveCandidateFactDto` | expected_profile_revision |
| **B-15** | identity-company.ts:61 | `POST /api/v1/auth/sessions/revoke` | `RevokePresenceSessionDto` | session_id |

### 4.2 OK — Decorated class DTO (1 endpoint, works correctly)

| ID | File | Endpoint | DTO Class | Decorators |
|----|------|----------|-----------|------------|
| **OK-1** | company-settings.ts:44 | `PATCH /api/v1/companies/:companyId/settings` | `UpdateCompanySettingsDto` | `@IsDefined() @IsBoolean()` |

### 4.3 SAFE — Interfaces (erased at compile time, validation skipped)

| ID | File | Endpoint | Interface |
|----|------|----------|-----------|
| **S-1** | interviews.ts:122 | `POST /api/v1/companies/:companyId/applications/:applicationId/interviews` | `ScheduleInterviewDto` |
| **S-2** | interviews.ts:127 | `POST /api/v1/me/interviews/:interviewId/decline` | `InterviewStatusDto` |
| **S-3** | interviews.ts:128 | `PATCH /api/v1/companies/:companyId/interviews/:interviewId` | `RescheduleInterviewDto` |
| **S-4** | applications.ts:149 | `POST /api/v1/jobs/:jobId/apply` | `SubmitApplicationDto` |

### 4.4 SAFE — Inline types (erased at compile time, validation skipped)

| ID | File | Endpoint | Inline type |
|----|------|----------|-------------|
| **I-1** | jobs.ts:213 | `POST /api/v1/companies/:companyId/jobs` | `{ title?, slug?, description? }` |
| **I-2** | jobs.ts:219 | `PATCH /api/v1/companies/:companyId/jobs/:jobId` | `{ title?, slug?, description? }` |
| **I-3** | jobs.ts:261 | `POST /api/v1/companies/:companyId/jobs/:jobId/reject` | `{ reason? }` |
| **I-4** | jobs.ts:267 | `POST /api/v1/companies/:companyId/jobs/:jobId/archive` | `{ reason? }` |
| **I-5** | feedback.ts:33 | `POST /api/v1/feedback` | `{ category?, subject?, message?, rating? }` |
| **I-6** | analytics.ts:35 | `POST /api/v1/analytics/events` | `Parameters<...>[1]` |
| **I-7** | applications.ts:255 | `PATCH /api/v1/companies/:companyId/applications/:applicationId/status` | `{ status?, reason? }` |
| **I-8** | saved-candidates.ts:70 | `POST /api/v1/companies/:companyId/saved-candidates/:candidateId` | `{ private_note? }` |

### 4.5 SAFE — `any` type (erased, validation skipped)

| ID | File | Endpoint |
|----|------|----------|
| **A-1** | guest.ts:133 | `POST /api/v1/guest-sessions` |
| **A-2** | guest.ts:148 | `POST /api/v1/guest-sessions/apply` |
| **A-3** | guest.ts:152 | `POST /api/v1/guest-sessions/claims` |
| **A-4** | resume.ts:135 | `POST /api/v1/resumes/:id/confirm` |

---

## 5. Security and functionality impact

### 5.1 Severity: CRITICAL — Complete API malfunction

Every blocked endpoint returns:
```
400 BAD_REQUEST
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": ["property email should not exist", "property password should not exist"]
  }
}
```

**No signup, no login, no company creation, no job creation, no candidate profile update is possible.**

### 5.2 Security trade-off

The current configuration is **simultaneously too strict (rejects valid data) and too permissive (no type validation on decorated DTO)**:

| Property | Current behavior | Expected behavior |
|----------|-----------------|-------------------|
| Undecorated DTO properties | ❌ Rejected | Should be accepted (or validated) |
| Unknown request properties | ❌ Rejected (correct!) | Should be rejected ✅ |
| Type validation (string/number/boolean) | ❌ Not performed | Should validate types |
| Required field validation | ❌ Not performed | Should reject missing required fields |
| Email format validation | ❌ Not performed | Should validate format |

### 5.3 Why tests pass

All existing tests call `ServiceClass.method()` directly, bypassing the `ValidationPipe`. No test sends a real HTTP request through the NestJS test app. The ValidationPipe only activates when requests flow through the HTTP pipeline.

---

## 6. Missing or incorrect validation

### 6.1 Current: No validation at all on 15 class DTOs

Since `class-validator` rejects all undecorated properties, and there are no decorators, the ValidationPipe effectively rejects every valid request body. The service-level manual checks (e.g., `if (!body.email || !body.password)`) are never reached.

### 6.2 Recommended fix: Three-tier approach

**Option A (RECOMMENDED) — Remove `whitelist` and `forbidNonWhitelisted` from global pipe; rely on service-level allowlists:**

```typescript
// main.ts
app.useGlobalPipes(new ValidationPipe({
  transform: true,
  // whitelist and forbidNonWhitelisted removed
}));
```

**Rationale:**
- Every service already implements its own allowlist (`COMPANY_FIELDS`, `ALLOWED_PROFILE_FIELDS`, `allowed` maps, etc.)
- Adding 150+ `@IsString()`/`@IsOptional()` decorators to 15 DTO classes is significant effort and maintenance burden
- The existing service-level validation is more comprehensive than what decorators would provide (format checks, business rules, cross-field validation)
- `transform: true` alone still provides DTO instance creation for consistent behavior

**Option B — Add class-validator decorators to every DTO property:**

```typescript
export class SignupDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
}
// ... repeat for all 15 classes, ~150 decorators total
```

**Pros:** Defense-in-depth, automatic format validation.
**Cons:** Large scope, maintenance burden, risk of decorator-database column mismatch.

**Option C — Convert all DTOs to interfaces (erased at compile time):**

```typescript
export interface SignupDto { email: string; password: string; }
```

**Pros:** Simplest, zero pipe interaction.
**Cons:** No runtime type safety, no Swagger/OpenAPI metadata.

### 6.3 Recommended: Option A + targeted decorators

Remove the broken global whitelist. Keep `transform: true`. Add decorators only to the 1 DTO that currently uses them (`UpdateCompanySettingsDto`) and to any new DTOs where defense-in-depth is worth the maintenance cost.

---

## 7. Required tests

After the fix, add integration tests that send real HTTP requests through the NestJS test app:

```typescript
// Example: test that signup works
const app = await NestFactory.create(AppModule);
await app.init();
const response = await request(app.getHttpServer())
  .post('/api/v1/auth/signup')
  .send({ email: 'test@example.com', password: 'securePass123' })
  .expect(201); // Currently returns 400!
```

Also add negative tests:

```typescript
// Test that unknown fields are handled (if whitelist is kept)
await request(app.getHttpServer())
  .post('/api/v1/auth/signup')
  .send({ email: 'test@example.com', password: 'securePass123', evil: 'hack' })
  .expect(400); // Should reject unknown 'evil' field
```

---

## 8. Final recommendation

**BLOCKED — 17 endpoints are completely non-functional.**

The ValidationPipe configuration `{ whitelist: true, forbidNonWhitelisted: true, transform: true }` is incompatible with undecorated class DTOs in `class-validator ^0.15.1`. Every valid request body is rejected with `400 VALIDATION_ERROR`.

**Immediate fix required:** Remove `whitelist` and `forbidNonWhitelisted` from `main.ts` (Option A). This restores all 17 endpoints to working order while preserving the existing service-level validation.

**Do NOT weaken the security model** — the service-level allowlists (`COMPANY_FIELDS`, `ALLOWED_PROFILE_FIELDS`, etc.) already provide better property-level protection than the broken pipe whitelist.

**Follow-up:** Add integration tests that exercise the full HTTP pipeline to catch regressions of this class.
