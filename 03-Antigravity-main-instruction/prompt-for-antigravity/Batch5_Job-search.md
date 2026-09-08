Anti ko ye exact prompt do:

```markdown
# Public Jobs Listing UI — Landing Page Integration & Verification

Repository:
C:\Users\ADMIN\Desktop\Vishesh\Binay-Job-Portal-App

Current requirement:

Landing/home page par public published jobs ki listing dikhni chahiye. Job seekers bina login ke jobs browse/search/filter kar saken. Existing NestJS public job APIs ko use karo; direct Supabase access bilkul mat karo.

## First read-only audit

Pehle run karo:

```text
git status
git diff --stat
```

Phir inspect karo:

- `03-nextjs-web/03-nextjs-web-app/src/app/page.tsx`
- `03-nextjs-web/03-nextjs-web-app/src/app/jobs/`
- existing public jobs components
- `03-nextjs-web/03-nextjs-web-app/src/lib/api-client.ts`
- frontend job types and API DTOs
- NestJS public job search controller/service
- `job-search-query.ts`
- existing public job tests
- `05_jobs.sql`
- `job_publish.md`
- `PHASE-09D-HANDOFF.md`

Do not overwrite unrelated uncommitted changes.

## Required UI behavior

Landing page/home page par:

1. Public published jobs fetch karo.
2. Sirf ye jobs show hon:
   - `status = published`
   - `deleted_at IS NULL`
   - non-expired
   - verified company rules pass
3. Draft, pending approval, paused, closed, archived aur expired jobs frontend par kabhi display nahi hone chahiye.
4. Confidential jobs ke liye company name backend ke masked response ke according display ho:
   - `Confidential Employer`
   - internal `company_id` ya private fields expose na hon.
5. Job card me relevant public fields show karo:
   - title
   - company name/masked name
   - category
   - location
   - employment type
   - work mode
   - experience
   - relevant skills/custom skills if public DTO provides them
   - published date if contract allows

6. Authentication required nahi honi chahiye.

## Filters/search

Existing backend-supported filters ko inspect karke sirf wahi filters wire karo. Invented filters mat add karo.

At minimum, agar backend support karta hai:

- keyword
- location/city
- category
- employment type
- work mode
- experience
- cursor pagination

Filter changes par:

- cursor reset to first page
- stale results clear/loading state
- filter mismatch ya invalid cursor safely handle
- empty state show
- API error state + Retry button show
- loading skeleton/spinner show

## API rules

- Next.js only `apiClient`/central typed client use kare.
- Direct Supabase query forbidden.
- Public API response DTO ke bahar fields render mat karo.
- Backend visibility/masking rules ko duplicate karke trust mat karo; frontend sirf safe response render kare.
- Existing cursor signing/filter hash behavior preserve karo.

## UI tests required

Add/update frontend tests for:

1. Published jobs render on landing/home page.
2. Draft/pending/paused/closed/archived/expired jobs are not rendered when returned/filtered.
3. Confidential company name renders as masked value.
4. Search/filter request sends correct query parameters.
5. Changing filters resets pagination/cursor.
6. Empty results state renders.
7. API failure renders error banner and Retry action.
8. Job card opens public detail/slug route.
9. No authentication required for public listing.
10. Custom skills render only if present in the approved public DTO.

If current backend response already guarantees visibility, test that frontend renders only returned public records and does not expose internal fields.

## Manual UI verification

Start/confirm services:

- Next.js: `http://localhost:3001`
- NestJS API: `http://localhost:3000`

Using the UI, verify:

1. Home page opens without login.
2. Published job appears.
3. Search keyword works.
4. Location/category/work-mode filters work.
5. Clear filters restores first page.
6. Empty result message appears.
7. Job detail opens.
8. Confidential company is masked.
9. Draft/pending/paused/closed jobs do not appear.
10. API failure and Retry behavior work.

Do not fake success using manually inserted frontend data. Use real API responses and existing approved database fixtures. If a fixture is required, create it only through the approved API/test environment and clean it up safely.

## Scope boundary

Do not change:

- AI profile contract
- embedding architecture
- database schema/migrations
- job lifecycle rules
- public API visibility rules unless an actual backend bug is proven
- unrelated employer dashboard code

If a backend issue blocks the UI, report the exact endpoint/file/field and make the smallest scoped fix only after verifying it against the API contract.

## Verification commands

Run relevant frontend tests first, then:

```text
npm test
npm run typecheck
npm run build
```

Run backend public-search tests only if frontend reveals an API contract/visibility problem.

Report:

- files changed
- API endpoints used
- filters implemented
- UI scenarios tested
- exact test/build output
- remaining manual limitations
- git status

Strict Git rule:

```text
No commit/push unless user explicitly asks.
```
```