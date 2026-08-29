# Codex Consolidated Verdict — Phase 09-B Final API Contract Review

Date: 2026-08-27

## Verdict

**CONDITIONAL PASS — NOT READY FOR CONTRACT FREEZE.**

The three reports were independently compared with the actual SQL baseline and approved decisions. The general boundaries are correct, but one report incorrectly declared the contract frozen while still containing unsupported fields and unresolved path/actor details.

## Accepted findings

1. `AUTH-BOOTSTRAP` is removed as a separate endpoint. Supabase Auth + `handle_new_user()` owns user-row creation; NestJS never duplicates it. Profile summary uses `/auth/me`.
2. `AUTH-SESSION` is realtime presence data. It requires SystemClient plus explicit ownership checks, not an implied Supabase Auth token revoke.
3. Company/organization/membership operations require SystemClient and same-company authorization because no approved direct company RLS policy exists.
4. `company_members.user_id` is `NOT NULL`; external email invitation cannot be implemented without a new approved invitation artifact.
5. Sole owner/last-admin and relationship reassignment guards are mandatory.

## Findings rejected as unsupported assumptions

- `ip_address`, `last_activity_at`, `user_type` and similar fields must not appear unless present in SQL. `user_sessions` exposes only its actual baseline columns.
- `head_user_id` / `lead_user_id` are not valid names for the FK columns; the baseline uses member references (`head_member_id` / `lead_member_id`).
- A concrete ownership-transfer endpoint is not automatically approved merely because D8 requires a policy; its exact path/DTO/audit behavior still needs catalog and contract mapping.
- “All endpoints frozen” is incorrect while the freeze worksheet still has TBD DTO/response/error details and membership accept/rejoin actor/path ambiguity.

## Required corrections before freeze

1. Update the freeze worksheet so D1–D8 decisions are reflected and the removed bootstrap endpoint is not marked `NEEDS_DECISION`.
2. Replace every DTO field with exact SQL-backed names; explicitly exclude internal/sensitive fields from responses.
3. Resolve membership accept and rejoin as separate operations and actors; preserve the current-scope registered-user limitation.
4. Decide whether ownership transfer is in this implementation slice; if yes, add a catalog-backed contract, otherwise mark it deferred.
5. Add per-endpoint error, idempotency, audit/history and transaction mapping without inventing outbox events.
6. Run one final independent review after these corrections.

## Current gate

```text
Business decisions D1–D8: resolved for current scope
API contract freeze: pending worksheet/DTO/path cleanup
Controller coding: not authorized yet
```
