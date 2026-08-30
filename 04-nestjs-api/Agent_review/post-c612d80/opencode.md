# Post-Review Report — commit c612d80

- **Commit**: `c612d80794921e4ebf9927cfedc407dd636ed3a5`
- **Title**: fix(nestjs-api): type guest resume and interview request DTOs
- **Reviewer**: opencode (independent senior review)
- **Date**: 2026-08-29
- **Scope**: `src/guest.ts`, `src/interviews.ts`, `src/resume.ts`, `src/validation-pipe.spec.ts` (+ `src/main.ts` ValidationPipe config, reviewed unchanged)
- **Mode**: read-only; no source/SQL/test/config modified; no commit; verified against committed code + running `ValidationPipe` + existing service logic.

## Verdict: APPROVED WITH REQUIRED FIXES

The DTO design is sound and introduces **no runtime, auth, ownership, tenant, scan-gating, transaction, replay, or state-transition regression**. One mechanical fix is required for the "build and tests pass" gate: a pre-existing test (`resume.spec.ts`) no longer type-checks after this commit tightened `ResumeService.confirm`'s signature. The fix is confined to that test and does not change runtime behavior.

## Git / environment
- `git rev-parse HEAD` = `c612d80794921e4ebf9927cfedc407dd636ed3a5` (exact target).
- `git status --short` clean except untracked `Agent_review/` directories (this review's output).
- `main.ts:11` ValidationPipe is unchanged: `{ whitelist: true, transform: true, forbidNonWhitelisted: true }`.
- No SQL migrations ship with this commit; the DTOs are validated against existing service queries in the changed files.

## Verification performed
- `node ./node_modules/jest/bin/jest.js validation-pipe.spec.ts` → **all green** (the spec was extended with valid-accept cases for all new DTOs and malformed-reject cases for `GuestSessionCreateDto.job_id`, `ConfirmResumeDto.expected_profile_revision`, `ScheduleInterviewDto.schedule_block_id`).
- Throwaway repro (`src/__c612_repro.spec.ts`, deleted after) against the **actual** DTO classes — 10/10 as expected:
  - `GuestSessionCreateDto` + unknown extra field → **400** (forbidNonWhitelisted active, despite index signature)
  - `GuestApplicationDto` missing `token` → **400** (token now mandatory)
  - `GuestApplicationDto` non-email `email` → **400** (`@IsEmail`)
  - `ScheduleInterviewDto` `duration_minutes: 500` → **400** (`@Max(480)`)
  - `RescheduleInterviewDto` missing `scheduled_at` → **400** (required)
  - `InterviewUpdateDto` status-only `{status:'cancelled',reason:'x'}` → accept
  - `InterviewUpdateDto` empty `{}` → accept (all-optional)
  - `InterviewStatusDto` reason-only (no status) → accept
  - `ConfirmResumeDto` top-level arbitrary field → **400** (strict whitelist)
  - `ConfirmResumeDto` nested `profile` with arbitrary inner field → accept (service `ALLOWED_PROFILE_FIELDS` allowlist guards)
- `node ./node_modules/typescript/bin/tsc --noEmit` → **1 error** (`resume.spec.ts:7`).
- `node ./node_modules/jest/bin/jest.js resume.spec.ts` → **suite fails to run** (ts-jest aborts on the same TS2345 error).

## DTO → service-contract mapping

| DTO | Decorated fields | Service requirement (proof) | Match |
|-----|------------------|------------------------------|-------|
| `GuestSessionCreateDto` | `job_id! @IsUUID`, `email? @IsEmail`, index sig | `create()` requires `isUuid`-style 36-char `job_id` (guest.ts:38); `email ?? null` stored (45) | OK; email format now enforced (stricter, see Rec) |
| `GuestApplicationDto` | `job_id!/session_id!/document_id! @IsUUID`, `name! @IsString`, `email! @IsEmail`, `phone? @IsString`, `cover_letter? @IsString`, `token! @IsString`, index sig | `apply()` requires job_id/session_id/document_id/name/email (107); `token` hashed for session lookup (108, 110) | OK; `token` now **required** (was tolerated as `''` → functionally required anyway) |
| `GuestClaimDto` | `claim_token! @IsString`, index sig | `claim()` throws if `!token` (137–138); controller passes `body?.claim_token` (176) | OK |
| `ConfirmResumeDto` | `expected_profile_revision! @IsInt`, `profile? @IsObject`, `facts? @IsObject`, index sig | `confirm()` requires integer `expected_profile_revision` (89); `profile`/`facts` read from nested objects (91, 117); `ALLOWED_PROFILE_FIELDS` allowlist + re-check (90, 92, 111) | OK; arbitrary fields blocked by service allowlist |
| `ScheduleInterviewDto` | `schedule_block_id!/interviewer_id! @IsUUID`, `title!/type! @IsString`, `round? @IsInt @Min(1)`, `scheduled_at! @IsString`, `duration_minutes! @IsInt @Min(1) @Max(480)`, `timezone! @IsString`, `meeting_link? @IsString`, index sig | `schedule()` requires UUIDs, trimmed title, `INTERVIEW_TYPES`, round≥1, future `scheduled_at`, duration 1–480, valid timezone (75) | OK; adds UUID/range checks consistent with service |
| `InterviewStatusDto` | `status? @IsString`, `reason? @IsString`, index sig | Used only in `decline` (156) which reads `dto?.reason`; status hardcoded `'cancelled'` | OK; `status` effectively unused there |
| `RescheduleInterviewDto` | `schedule_block_id!/interviewer_id! @IsUUID`, `scheduled_at! @IsString`, `duration_minutes! @IsInt @Min(1) @Max(480)`, `timezone! @IsString`, `meeting_link? @IsString`, `status?/reason? @IsString`, index sig | `reschedule()` requires UUIDs, `validTime(scheduled_at)`, timezone, duration 1–480 (128) | OK; status/reason not consumed by `reschedule` |
| `InterviewUpdateDto` | all fields optional (`schedule_block_id/interviewer_id @IsUUID`, `scheduled_at @IsString`, `duration_minutes @IsInt @Min(1) @Max(480)`, `timezone/meeting_link/status/reason @IsString`), index sig | PATCH route (157): `status==='rescheduled' ? reschedule(...) : changeStatus(...)`. Both `changeStatus` (108–125) and `reschedule` (127–144) **re-validate** all required inputs | OK; permissive DTO is safe because services are authority |

## Blockers
- **None.** Production code is correct; no security or business-rule regression was found.

## Required Fixes
1. **`resume.spec.ts:7` breaks build + test run.** The commit changed `ResumeService.confirm(request, documentId, body: any)` → `body: ConfirmResumeDto` (mandatory `expected_profile_revision`), but did not update the existing test that calls `service.confirm(..., 'bad-id', {})`. Result: `tsc --noEmit` errors (TS2345) and `jest resume.spec.ts` fails to start (ts-jest type-checks). The runtime assertion (expects `VALIDATION_ERROR`) still holds once the type is satisfied. **Fix:** change `{}` to a valid `ConfirmResumeDto`, e.g. `{ expected_profile_revision: 1, profile: {} }`. This is the only file failing `tsc`, and no other spec has a type error. Required for point 12 ("build and tests pass").

## Recommendations
1. **Confirm frontend always sends `token` on guest apply.** `GuestApplicationDto.token` is now required (`@IsString`). The service already hashed `token` for the session lookup, so valid flows already supply it; still worth a client-side check to avoid a new 400 at the pipe.
2. **Confirm guest/feedback email input matches `@IsEmail`.** `GuestSessionCreateDto.email` and `GuestApplicationDto.email` now enforce email *format* (previously only presence). Trivially stricter; verify no client sends loosely-formatted addresses.
3. **`ConfirmResumeDto` is a nested contract.** Top-level profile fields are now rejected by the pipe (strict whitelist). The service's legacy top-level fallback (`profileInput = body.profile ? body.profile : body`) is unreachable through the validated path. Verify clients send `{ profile: {...}, facts: {...} }` (the spec's accepted shape), not flat fields. (Per point 4, the service `ALLOWED_PROFILE_FIELDS` allowlist still prevents arbitrary fields from being written regardless.)
4. **Add explicit unknown-field rejection assertions for the new DTOs** to the committed spec. Currently only `SignupDto` is asserted for `forbidNonWhitelisted`; the new DTOs were not, though proven via repro. Locks the contract against accidental `@Allow()`/index-signature loosening.

## Informational
- **No remaining untyped JSON `@Body()`.** A grep of all 27 `@Body()` sites shows every one is now a typed class DTO (no `any`/`unknown`/interface metatypes). The only `type`/`interface` DTO-like name in `src` is `SearchCursorPayload` (`search-cursor.ts`), used for search cursors, not a request body.
- **Remaining genuinely-untyped inputs are multipart file uploads** (out of scope for JSON DTO validation): `resume.ts:138` reads `(request as any).body?.use_as_active_profile_resume` in the upload endpoint, and upload interceptors type the file as `any` (validated separately by `validateResumeFile`). Not a regression from this commit.
- **Index signatures preserved** on all new DTOs; consistent with prior reviews, `forbidNonWhitelisted` still rejects unknown fields (proven: `GuestSessionCreateDto` + extra field → 400).
- **`InterviewStatusDto.status`** is now optional and, in the `decline` route, ignored (status hardcoded `'cancelled'`). Harmless.
- **`transform: true`** leaves `profile`/`facts` as plain objects (`Record<string, unknown>`, no `@Type`); the service reads them directly — same as other object-typed DTOs already in the repo (e.g. `IngestAnalyticsEventDto.event_data`).

## Point-by-point (task checklist)
1. `GuestSessionCreateDto` matches guest session contract — ✅
2. `GuestApplicationDto` validates IDs + applicant fields; token now required (strengthens, not weakens) — ✅ / see Rec 1
3. `GuestClaimDto` preserves authenticated claim — ✅ (AuthGuard + required `claim_token`; service unchanged)
4. `ConfirmResumeDto` preserves revision/profile/facts handling; service `ALLOWED_PROFILE_FIELDS` allowlist blocks arbitrary fields — ✅
5. `ScheduleInterviewDto` matches schedule/timing rules — ✅
6. `InterviewStatusDto` permits legitimate status/reason updates — ✅
7. `RescheduleInterviewDto` validates rescheduling fields — ✅
8. `InterviewUpdateDto` allows status-only PATCH and reschedule payloads — ✅ (verified)
9. Unknown fields rejected by whitelist + forbidNonWhitelisted — ✅ (verified)
10. Invalid types → HTTP 400 — ✅ (verified)
11. No auth/ownership/tenant/scan-gating/transaction/replay/state-transition regression — ✅
12. Build and tests pass — ❌ **fails**: `resume.spec.ts` (see Required Fix 1). All DTO spec cases pass; the break is a single dependent test.
13. Remaining untyped bodies — none for JSON `@Body()`; multipart upload fields noted (Informational).

## Sign-off
**APPROVED WITH REQUIRED FIXES.** The commit safely completes strict DTO typing for the guest, resume, and interview request bodies and aligns them with the repository's whitelist-everything validation contract. Merge only after Required Fix 1 (update `resume.spec.ts:7` to pass a valid `ConfirmResumeDto`) so the build and full test suite are green.
