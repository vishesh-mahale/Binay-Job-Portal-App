# Jobs, Search and Applications Journey

## Story format

`User opens job/search screen → Next.js calls NestJS → authorization/visibility checks → database query → typed response → UI state`

## Main journeys

- Employer creates and manages a job.
- Approved job is published, paused, resumed, closed or archived.
- Candidate searches visible jobs and opens job details.
- Candidate submits an application with a selected resume and immutable snapshot.
- Employer/HR reviews applications within the company boundary.
- Recruiter saves or removes a candidate within the recruiter/company scope.

Exact routes, transition matrix, snapshot behavior, expiry and saved-candidate
privacy must follow the API Catalog, SQL baseline and approved decisions.

## Current status

09-D route wiring and several lifecycle E2E gates remain pending.

## References

- `04-nestjs-api/project-docs/API-CATALOG.md`
- `01-requirements/product-decisions/PD-003-APPLICATION-HISTORY.md`
- `02-database/migrations/baseline/09_applications.sql`
- `04-nestjs-api/IMPLEMENTATION-TRACKER-HINGLISH.md`
