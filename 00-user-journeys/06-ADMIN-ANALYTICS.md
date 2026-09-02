# Admin and Analytics Journey

## Admin

`Admin opens protected screen → NestJS verifies admin role → scoped operation → audit/history → typed response`

Admin-only operations must never be exposed through public signup or client-side
role selection.

## Analytics and feedback

Event ownership, permissions, rate limits, PII handling, idempotency and guest
feedback behavior are governed by Phase 09-G decisions and contracts.

## Current status

Analytics, feedback, AI provider decisions and remaining product gaps are still
tracked as pending where the tracker says so.

## References

- `04-nestjs-api/IMPLEMENTATION-TRACKER-HINGLISH.md`
- `contracts/`
- `02-database/migrations/baseline/18_feedback.sql`
