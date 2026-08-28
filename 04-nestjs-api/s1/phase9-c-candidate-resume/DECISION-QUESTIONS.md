# Phase 09-C — Decisions Required Before Candidate/Resume Coding

इन decisions को `PHASE-09-C-CONSOLIDATED-CANDIDATE-RESUME-DECISION.md` और approved SQL/contracts
के against review करना है। कोई नया table, column, event या queue invent नहीं करना है।

## Decision 1 — Candidate profile public paths

Exact routes freeze करें:

- own profile read
- canonical profile save
- canonical fact archive/soft-delete

Suggested REST shape review करें, लेकिन इसे बिना evidence blindly approve न करें:

```text
GET    /api/v1/candidates/me
PATCH  /api/v1/candidates/me
DELETE /api/v1/candidates/me/facts/:factType/:factId
```

DB names current baseline के अनुसार ही रहें: `candidate_id`, `deleted_at`, `is_current`,
`unlinked_at`; `candidate_profile_id` या `is_soft_deleted` invent नहीं करना है।

## Decision 2 — Parsed-data response allowlist

`GET /api/v1/resumes/:id/parsed-data` में exact safe response shape freeze करें।

Must exclude:

- `extracted_text`
- `raw_ai_output`
- artifacts और internal error details
- `storage_bucket` / `storage_path`
- tokens, credentials और provider internals

Canonical DB names और existing parser output से field-by-field mapping verify करें।
`overall_confidence` को बिना decision के `confidence_score` rename न करें।

## Decision 3 — Confirm idempotency

Repeated/concurrent `POST /api/v1/resumes/:id/confirm` का behavior freeze करें:

- same request दोबारा आने पर same successful result मिले
- duplicate `candidate_profile_documents` link न बने
- दूसरी profile revision न बने
- दूसरा `candidate.profile.changed` event न बने
- stale revision और changed payload अलग request हों तो deterministic conflict मिले

## Required report

हर agent अपनी independent recommendation, evidence, rejected alternatives और final verdict लिखे:

`04-nestjs-api/s1/phase9-c-candidate-resume/<agent-name>-decision.md`

Status केवल इनमें से एक रखें: `APPROVED`, `APPROVED WITH FIXES`, `BLOCKED`.
