# Phase 09-B Company/Authorization Code-Gap Audit

**Date:** 29 August 2026  
**Scope:** company, organization, membership and ownership routes in `04-nestjs-api-app`  
**Status:** CODE AUDIT COMPLETE — live HTTP verification remains

## Verified route coverage

- Company create/read/update: `src/companies.ts`
- Branch, department and team create/update: `src/organization.ts`
- Member invite, accept, deactivate, leave, rejoin and approve-rejoin: `src/membership.ts`
- Ownership transfer: `src/ownership.ts`
- Company settings GET/PATCH: `src/company-settings.ts`
- AuthGuard is applied to the company, organization, membership, ownership and settings controllers.

## Authorization and isolation checks found

- Company creation requires an active employer/admin account.
- Company reads require owner or active company membership.
- Company updates require the company owner.
- Member administration requires company owner or approved company-management permission.
- Branch/department/team/manager references are checked for the same company and active state.
- Ownership transfer requires the current owner and an active target member in the same company.
- Membership and ownership mutations use trusted transactional database access and audit rows.

## Remaining verification gates

These are verification/deployment gates, not confirmed missing route code:

1. Live password signup/login/refresh/logout flow.
2. Live company/member/ownership HTTP flow with a dedicated test tenant.
3. Cross-company negative responses and sensitive-field assertions.
4. Cookie domain and deployed environment values.
5. Same-commit reviewer gate for the completed batch.

OAuth remains explicitly deferred and is not part of the current release scope.
