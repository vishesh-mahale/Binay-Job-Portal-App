# Phase 09-E — Saved Candidates

**Status:** `IMPLEMENTED — UNIT VERIFIED`

## Delivered routes

- `POST /api/v1/companies/:companyId/saved-candidates/:candidateId`
- `GET /api/v1/companies/:companyId/saved-candidates`
- `DELETE /api/v1/companies/:companyId/saved-candidates/:candidateId`

## Guarantees

- Authenticated employer/HR/admin with active company access only.
- Bookmark owner is always derived from JWT; another recruiter cannot see it.
- Candidate must be `is_open_to_work = TRUE` when saving.
- Existing `(recruiter_user_id, candidate_id)` uniqueness is reused.
- Optional note is private to the recruiter; no job id is stored.
- Save/list/remove run through the trusted NestJS DB path; no direct browser Supabase access.
- No outbox event was added because the approved catalog does not require one.

## Verification

```text
npm run build                                      PASS
saved-candidates.spec.ts                          3/3 PASS
full Jest suite                                   77/77 PASS before this feature;
                                                  targeted feature tests PASS after it
```

## Follow-up

Add database integration tests against reset schema for cross-recruiter isolation and concurrent
duplicate saves before production release.
