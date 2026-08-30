# opencode DTO Validation Review

## 1. Commit and scope verified

- `git rev-parse HEAD`: `0c9c2ef1a5e9470dc67af6e94079c90f5af2a6db` (HEAD). This commit only adds a tracker line; the global `ValidationPipe` config under review was introduced earlier in `381701c` and has been active since, with request DTOs never decorated (except `UpdateCompanySettingsDto`, added in `ced9ffe`).
- Scope reviewed: `src/main.ts` global `ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })` (`main.ts:11`) and **every** `@Body()` DTO in `src/`.
- Method: static read of all DTOs + controllers, cross-checked against `AGENTS.md`, `PHASE-06-API-CATALOG.md`, `NESTJS-IMPLEMENTATION-GUIDE.md` (not present in repo — noted), service-level allowlists, and existing `*.spec.ts`. **Behavior was empirically proven** with a standalone script that exercises the real `@nestjs/common` `ValidationPipe` from `node_modules` (no DB, no destructive action).
- Read-only review; no source/SQL/test/config modified.

## 2. Executive verdict

**BLOCKED**

The global strict `ValidationPipe` (`forbidNonWhitelisted: true`) is correct and must stay. However, every request DTO passed as a **named class** is currently **undecorated**, so NestJS whitelist logic treats *all* of its properties as non-whitelisted and rejects **every valid request body** with `400 "property X should not exist"`. This was reproduced against the actual `ValidationPipe`. The result is that authentication (signup/login), company create/update, membership add, all organization branch/department/team writes, ownership transfer, candidate profile update, and presence-session revoke are **completely non-functional**. This is a release-blocking defect. The fix is to decorate the DTOs (the approach the tracker already mandates) — not to weaken the pipe.

## 3. Evidence-based findings

| ID | Severity | DTO/Endpoint | Exact evidence | Impact | Required action |
|---|---|---|---|---|---|
| F1 | Blocker | All `@Body()` named-DTO endpoints (see §5 list) | `main.ts:11` global `ValidationPipe({whitelist:true,transform:true,forbidNonWhitelisted:true})`. Only `company-settings.ts:2,7-8` imports `class-validator`/`@IsDefined() @IsBoolean()`. Repro with real `ValidationPipe`: undecorated `SignupDto` body `{email,password}` → `BadRequestException: ["property email should not exist","property password should not exist"]`. Decorated DTO → accepted; interface/inline `Object` metatype → pipe skips. | Every valid request to affected endpoints is rejected (availability/functional break). Auth, company, membership, org, ownership, candidate, identity flows inoperable. | Decorate every request DTO property with `class-validator` decorators (or convert to interface/inline type + explicit service allowlist — see §6). Do **not** remove `whitelist`/`forbidNonWhitelisted`. |
| F2 | Recommendation | Interface-typed `@Body()` endpoints (applications submit `SubmitApplicationDto` `applications.ts:13`; interviews `ScheduleInterviewDto`/`InterviewStatusDto`/`RescheduleInterviewDto` `interviews.ts:16,28,29`) | These are `interface`s, erased at runtime → `metatype=Object` → `ValidationPipe` skips (`toValidate(Object)` is false). Services validate manually (`applications.ts:25`, `interviews.ts:46,99`). | Pipe-level whitelist/mass-assignment protection is **absent** for these routes; safety currently relies entirely on manual allowlists. Inconsistent with the strict-pipe intent. | Convert these to decorated DTO **classes** for uniform whitelist protection (per tracker `IMPLEMENTATION-TRACKER-HINGLISH.md:56`). Verify the existing manual allowlists remain. |
| F3 | Informational | Inline-object / `any` `@Body()` endpoints (jobs, feedback, guest, resume, saved-candidates, analytics) | `@Body() dto: { … }` inline types / `any` (`jobs.ts:213,219,261,267`; `feedback.ts:33`; `guest.ts:133,148,152`; `resume.ts:135`; `saved-candidates.ts:70`; `analytics.ts:35`). Pipe skips (metatype `Object`/undefined). | Functionally OK (services validate), but not whitelist-hardened at the pipe. | Optional: migrate to decorated DTO classes for consistency; ensure service allowlists persist. |

## 4. Correctly implemented validation

- `main.ts:11` enables the strict `ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })` — the **correct, secure** global policy (matches `AGENTS.md` security posture and `IMPLEMENTATION-TRACKER-HINGLISH.md:56`).
- `UpdateCompanySettingsDto` (`company-settings.ts:7-8`) is correctly decorated with `@IsDefined() @IsBoolean() job_approval_required` and works as proven (repro: accepted; extra field rejected). This confirms the pipeline itself is sound — the problem is purely missing decorators elsewhere.
- Affected services already perform **manual** validation/allowlisting (e.g., `companies.ts:34,56` filters to `COMPANY_FIELDS`; `organization.ts:27,32` uses `allowed` arrays; `interviews.ts:46` exhaustive checks), so when the pipe is bypassed (interface/inline types) mass-assignment is still prevented at the service layer.
- `forbidNonWhitelisted` correctly rejects unknown fields on the one decorated DTO (repro: extra `evil` field → rejected), proving the security control works where decorators exist.

## 5. Missing or incorrect validation (exact affected, broken endpoints)

All of the following use an **undecorated named DTO class** as `@Body()` → rejected by the pipe for any valid body (proven):

- `auth-provider.ts:63` `signup(@Body() body: SignupDto)` — `SignupDto` `auth-provider.ts:46` (`email!; password!`). **Auth signup broken.**
- `auth-provider.ts:65` `login(@Body() body: LoginDto)` — `LoginDto` `auth-provider.ts:47`. **Auth login broken.**
- `companies.ts:70` `create(@Body() dto: CreateCompanyDto)` — `CreateCompanyDto` `companies.ts:6` (name, slug, email, …). **Company creation broken.**
- `companies.ts:72` `update(@Body() dto: UpdateCompanyDto)` — `UpdateCompanyDto` `companies.ts:13`. **Company update broken.**
- `membership.ts:102` `add(@Body() d: AddCompanyMemberDto)` — `AddCompanyMemberDto` `membership.ts:6` (user_id, branch_id, …). **Membership add broken.**
- `organization.ts:36` branches/departments/teams: `CreateBranchDto` (`:6`), `UpdateBranchDto` (`:7`, has `[key:string]:unknown`), `CreateDepartmentDto` (`:8`), `UpdateDepartmentDto` (`:9`), `CreateTeamDto` (`:10`), `UpdateTeamDto` (`:11`). **All org writes broken.**
- `ownership.ts:31` `transfer(@Body() dto: TransferOwnershipDto)` — `TransferOwnershipDto` `ownership.ts:6` (`new_owner_user_id!`). **Ownership transfer broken.**
- `candidate.ts:200` `update(@Body() body: UpdateCandidateProfileDto)` — `UpdateCandidateProfileDto` `candidate.ts:6`. **Candidate profile update broken.**
- `candidate.ts:205` `archive(@Body() body: ArchiveCandidateFactDto)` — `ArchiveCandidateFactDto` `candidate.ts:28`. **Candidate fact archive broken.**
- `identity-company.ts:61` `revoke(@Body() body: RevokePresenceSessionDto)` — `RevokePresenceSessionDto` `identity-company.ts:5`. **Presence-session revoke broken.**

Not broken by the pipe (interface/inline metatype → skipped, manual validation): `applications.ts:149,255`; `interviews.ts:122,127,128`; `jobs.ts`; `feedback.ts`; `guest.ts`; `resume.ts`; `saved-candidates.ts`; `analytics.ts` — see F2/F3.

## 6. Secure remediation recommendation

**Primary (recommended, and what the tracker already mandates — `IMPLEMENTATION-TRACKER-HINGLISH.md:56`): decorate every request DTO property with `class-validator` decorators and keep the strict pipe.** This restores correct acceptance of valid bodies *and* uniform whitelist/mass-assignment protection, with no weakening of `whitelist`/`forbidNonWhitelisted`.

Minimum decoration example for each broken DTO (apply the same rigor to all fields):
- `SignupDto`/`LoginDto`: `@IsEmail() email; @IsString() @MinLength(8) password;` (also `@IsNotEmpty`).
- `CreateCompanyDto`/`UpdateCompanyDto`: `@IsString() @IsNotEmpty() name; @IsString() slug; @IsOptional() @IsEmail() email; @IsOptional() @IsUrl() website; …` per `04_companies.sql` column semantics.
- `AddCompanyMemberDto`: `@IsUUID() user_id; @IsOptional() @IsUUID() branch_id/department_id/team_id/manager_member_id; @IsOptional() @IsString() title/employee_code/work_email/work_phone; @IsOptional() @IsBoolean() is_primary_hr; @IsOptional() @IsObject() permissions; …`.
- `CreateBranchDto`/`UpdateBranchDto` etc.: `@IsString() @IsNotEmpty() name/city/country; @IsOptional() @IsBoolean() is_headquarters/is_active; @IsOptional() @IsString() …`.
- `TransferOwnershipDto`: `@IsUUID() new_owner_user_id;`.
- `UpdateCandidateProfileDto`/`ArchiveCandidateFactDto`/`RevokePresenceSessionDto`: decorate each field (`@IsUUID()`, `@IsString()`, etc.).

**Secondary (architecture-compliant alternative, only if decoration is undesirable):** convert the broken named DTOs to inline object types / `interface`s (as `jobs.ts` already does) **and** guarantee each service builds an explicit field allowlist (the codebase already does this for `companies`/`organization`). This bypasses the pipe and relies on manual allowlists — acceptable and secure, but the tracker explicitly says "pipe ko weaken karke bypass nahi karna" (do not weaken the pipe to bypass), so decoration is preferred. **Do NOT** simply delete `forbidNonWhitelisted`/`whitelist` — that would remove mass-assignment protection globally (security regression). No evidence supports weakening the pipe; the only defect is missing decorators.

## 7. Required tests

- **Pipe-level regression unit test** (e.g., `src/validation.pipe.spec.ts`): instantiate the real `ValidationPipe({whitelist:true,transform:true,forbidNonWhitelisted:true})` and assert:
  - a **valid** body for each affected DTO class (`SignupDto`, `LoginDto`, `CreateCompanyDto`, `UpdateCompanyDto`, `AddCompanyMemberDto`, the six `organization` DTOs, `TransferOwnershipDto`, `UpdateCandidateProfileDto`, `ArchiveCandidateFactDto`, `RevokePresenceSessionDto`) is **accepted** (not `400`);
  - an **unknown** field on any DTO is **rejected** with `400` (proves `forbidNonWhitelisted` still active).
  - (This directly reproduces the bug class and prevents recurrence — equivalent to the repro executed during this review.)
- **Endpoint integration tests** (jest + mocked/sandbox DB or e2e): `POST /api/v1/auth/signup` and `/login` with a valid body return `201`/`200` (not `400`); `POST /api/v1/companies` returns `201`; `PATCH /api/v1/companies/:id` returns `200`; org branch/dept/team create+update succeed; `POST …/ownership-transfer` succeeds; candidate profile update succeeds.
- **Negative tests**: unknown field on any decorated DTO → `400`; missing required field → `400`.
- **Coverage for F2/F3**: after converting interface DTOs to decorated classes, repeat the same acceptance/whitelist tests for `SubmitApplicationDto`/`ScheduleInterviewDto`/`InterviewStatusDto`/`RescheduleInterviewDto` and the inline-typed routes.

## 8. Final recommendation

**BLOCKED** for production. The strict `ValidationPipe` is correct and must remain; the defect is that 10+ request DTOs used as `@Body()` classes lack `class-validator` decorators, causing the pipe to reject **all valid request bodies** — empirically verified against the real `ValidationPipe`. This renders authentication, company, membership, organization, ownership-transfer, candidate-profile, and presence-revocation endpoints inoperable. Required fix: add `class-validator` decorators to every request DTO property (the path the `IMPLEMENTATION-TRACKER-HINGLISH.md:56` gate already prescribes). Do not weaken `whitelist`/`forbidNonWhitelisted`. The one decorated DTO (`UpdateCompanySettingsDto`) and the manually-validated inline/interface routes prove the intended architecture works; the gap is purely the missing decorations. No source, SQL, tests, or configuration was modified during this review.
