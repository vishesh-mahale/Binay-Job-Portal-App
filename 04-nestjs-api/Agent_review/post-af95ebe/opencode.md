# Post-Review Report — commit af95ebe

- **Commit**: `af95ebe93a1f2890ab7588003e5891f27b31baea`
- **Title**: fix(nestjs-api): type application feedback analytics and saved-candidate DTOs
- **Reviewer**: opencode (independent senior review)
- **Date**: 2026-08-29
- **Scope**: `src/applications.ts`, `src/saved-candidates.ts`, `src/feedback.ts`, `src/analytics.ts`, `src/validation-pipe.spec.ts`
- **Mode**: read-only; no source/SQL/test/config modified; no commit; verified against committed code + running `ValidationPipe` + baseline SQL.

## Verdict: APPROVED

No blocking defects. The four request bodies that previously used undecorated `interface` / `unknown` / `any` metatypes are now bound to typed class DTOs under the global `ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })`. Every required-field tightening mirrors a pre-existing hard requirement in the corresponding service, so no previously-successful request is newly rejected. `validation-pipe.spec.ts` passes 26/26; a throwaway repro confirmed the edge cases below.

## What changed (verified against committed code)

| DTO | Decorated fields | Pre-existing service requirement (proof) | Match |
|-----|------------------|------------------------------------------|-------|
| `SubmitApplicationDto` | `document_id! @IsUUID`, `cover_letter? @IsString`, `answers_to_screening_questions? @IsArray (unknown[])`, `consent! @IsBoolean`, index sig | `submit()` requires `isUuid(dto.document_id)` (applications.ts:33,108) and `dto.consent !== true` (33); `answers` must be an array (36–37) | OK |
| `ChangeApplicationStatusDto` | `status! @IsString`, `reason? @IsString`, index sig | `changeStatus()` requires `dto.status` (123–124); allowed-status set + rejected-requires-reason enforced in service (125–127) | OK |
| `SaveCandidateDto` | `private_note? @IsString`, index sig | `saved.save()` reads `body?.private_note` only (saved-candidates.ts:78); the sole client-settable field | OK |
| `SubmitFeedbackDto` | `category? @IsString`, `subject? @IsString`, `message! @IsString`, `rating? @IsInt @Min(1) @Max(5)`, index sig | `submit()` requires a trimmed `message` (feedback.ts:22–23) and integer 1–5 rating (23) | OK |
| `IngestAnalyticsEventDto` | `idempotency_key! @IsString`, `event_name! @IsString`, `event_category! @IsString`, `source? @IsString`, `event_data! @IsObject`, `entity_type/entity_id/session_id/request_id/trace_id/page_url/referrer_url? @IsString`, index sig | `ingest()` requires key/name/category/event_data (analytics.ts:34); SOURCES/CATEGORIES membership, array-rejection, and entity pair-check all in service | OK |

## Verification
- Ran `node ./node_modules/jest/bin/jest.js validation-pipe.spec.ts` → **26 passed, 26 total** (valid-accept for all four new DTOs; malformed-reject for `document_id:'bad'`, `rating:6`, `event_data:[]`).
- Throwaway repro (`src/__af95ebe_repro.spec.ts`, deleted after run) against the **actual** DTO classes:
  - `SubmitApplicationDto` missing `document_id` → 400  OK
  - `SubmitApplicationDto` missing `consent` → 400  OK
  - `SubmitApplicationDto` `answers_to_screening_questions` non-array → 400  OK
  - `SubmitFeedbackDto` missing `message` → 400  OK
  - `IngestAnalyticsEventDto` missing `event_data` → 400  OK
  - `ChangeApplicationStatusDto` missing `status` → 400  OK
  - `SaveCandidateDto` `private_note: 5` (number) → 400  OK
  - Unknown extra field on `SubmitApplicationDto` → **400 (strictly rejected)** — see Behavior Change.

## Behavior change (intended, consistent with repo migration — flagged for awareness)
Previously these four endpoints used undecorated `interface`/`unknown`/`any` metatypes, so the global pipe **skipped** validation and **passed unknown fields through** to the service. Now, with typed DTOs under `forbidNonWhitelisted: true`, unknown extra fields are **rejected with 400**. This is strictly stricter but matches the security direction already applied to every other DTO in the series (companies, organization, membership, jobs, etc.) and the repo-wide baseline. Any client sending undocumented fields to these endpoints will now receive 400; such clients should be corrected to send only the documented fields. The four new DTOs retain `[key: string]: unknown` index signatures for TypeScript structural compatibility, but (confirmed by repro) the index signature does **not** weaken `forbidNonWhitelisted` — extra fields are still 400'd.

## Notes / non-blocking
1. **Provided diff is inaccurate for `feedback.ts`.** The inline diff and the task brief state `SubmitFeedbackDto` gained `comments?` / `page_url?`, but the committed code actually declares `category?` and `subject?` (which match the service at feedback.ts:11–15). This review was performed against the **actual committed source**, not the provided diff. The real DTO is functionally correct and fully validated; the discrepancy is documentation-only.
2. **Optional test hardening.** The spec covers valid-accept and one malformed value per typed field, but does not explicitly assert the missing-required-field cases (`document_id`/`consent`/`status`/`message`/`event_data`) or non-array `answers`. These are guaranteed by `class-validator` `@IsX()`-without-`@IsOptional`, but adding explicit "rejects missing required field" cases would lock the contract. Not required for approval.
3. **Service remains the authority for business rules.** Allowed application-status set, `rejected`-requires-`reason`, analytics `SOURCES`/`CATEGORIES` membership, `entity_type`/`entity_id` pairing, and strict `consent === true` are all still enforced in the services and intentionally not duplicated in the DTOs. Verified unchanged.

## Sign-off
APPROVED. The commit safely extends strict DTO validation to the application / feedback / analytics / saved-candidate request bodies without regressing valid traffic, and aligns these endpoints with the repository's established whitelist-everything validation contract.
