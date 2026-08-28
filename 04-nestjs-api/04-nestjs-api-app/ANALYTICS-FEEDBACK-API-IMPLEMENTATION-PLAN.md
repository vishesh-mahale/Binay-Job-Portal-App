# Analytics and Feedback API — Implementation Plan

**Status:** `PLAN DRAFT — METRIC OWNERSHIP/PERMISSIONS FREEZE REQUIRED`

## Scope from catalog and schema

Analytics must cover job views/applications/conversions, registrations, referral performance,
recruitment funnel, recruiter/candidate activity and interview metrics. Feedback supports registered
and guest submissions. Existing tables and SQL remain authoritative; no new metric table or provider
is invented in this plan.

## Boundaries

- Product analytics events are recorded through NestJS-authorized commands or approved internal
  consumers, never directly from the browser to Supabase.
- Company reports are tenant-scoped; candidates can see only their own permitted activity.
- Feedback submission must validate actor/session, rate limits and content policy, then persist with
  audit metadata in one transaction.
- Aggregation queries must not expose another company's candidate PII.

## Decisions required

- Exact analytics event vocabulary and retention window.
- Real-time counters versus scheduled aggregates.
- Report route/permission matrix for owner, HR and admin.
- Feedback moderation states and anonymous/guest visibility.
- Whether any external analytics provider is in scope.

## Tests

- Cross-tenant report denial.
- Guest and registered feedback validation.
- Rate-limit and duplicate submission behavior.
- PII redaction in report responses.
- Deterministic date/timezone filtering and pagination.
