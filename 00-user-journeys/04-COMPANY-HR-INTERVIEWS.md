# Company, HR and Interviews Journey

## Company and membership

`Employer creates company → company settings → branches/departments/teams → invite HR → membership and permissions`

Every mutation passes NestJS role, membership, ownership and tenant checks.

## Interview

`Authorized participant selects slot → NestJS validates lead-time/timezone/overlap → booking transaction → confirmation/reschedule/history`

Completed, cancelled, no-show, participant authorization and notification
behaviors must follow approved contracts and current tracker status.

## Current status

Identity/company HTTP gates and remaining interview terminal-path tests are
tracked in Phase 09-B and 09-E.

## References

- `02-database/migrations/baseline/07_organizations.sql`
- `02-database/migrations/baseline/10_interviews.sql`
- `04-nestjs-api/IMPLEMENTATION-TRACKER-HINGLISH.md`
