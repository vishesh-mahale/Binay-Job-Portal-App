# Application Read APIs — Codex Recommendation

**Status:** `RECOMMENDATION — HUMAN CATALOG FREEZE PENDING`

## Candidate APIs

```text
GET /api/v1/me/applications
GET /api/v1/me/applications/:applicationId
GET /api/v1/me/applications/:applicationId/history
```

- Identity only JWT se derive hogi.
- List filters: status, date range; cursor pagination.
- Detail mein job summary, submitted status, applied time aur safe snapshot summary.
- Recruiter notes, internal AI fields aur raw resume content candidate ko nahi dena.

## HR/company APIs

```text
GET /api/v1/companies/:companyId/applications
GET /api/v1/companies/:companyId/applications/:applicationId
```

- Active company membership + approved application-view permission required.
- Query job/status/date filters aur cursor pagination support karegi.
- Detail response submitted snapshot ko immutable record ke roop mein read karega; current
  candidate profile se values merge/rebuild nahi karega.
- Private recruiter notes sirf authorized HR scope mein; candidate response mein kabhi nahi.

## Common rules

- `deleted_at` rows default se hide; explicit archive policy ke bina restore/read nahi.
- Cross-candidate aur cross-company access `404`/existing safe-not-found policy se hide.
- Snapshot/document references metadata-only; storage bytes separate authorized download flow se.
- Reads trusted NestJS boundary se; browser direct Supabase access nahi.
- Response DTOs candidate aur HR ke liye alag rahenge.

## Implementation order

1. Freeze routes, fields, permission key and deleted/withdrawn visibility.
2. Add query builders with allowlisted filters and deterministic cursor ordering.
3. Add ownership/company-scope tests and snapshot immutability regression tests.
4. Add API catalog entries and integration tests against reset database.
