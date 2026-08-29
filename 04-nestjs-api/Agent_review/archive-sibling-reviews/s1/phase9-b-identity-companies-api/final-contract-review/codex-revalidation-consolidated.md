# Codex Consolidated Revalidation — Phase 09-B API Contract

Date: 2026-08-27

## Verdict

**CONDITIONAL PASS — business decisions are aligned, but contract freeze still needs DTO/error finalization.**

### Accepted

- D1–D8 current-scope policies are consistently reflected.
- Supabase trigger owns `public.users` creation.
- Registered-user membership and owner-approved rejoin are correctly separated.
- Single-owner model and ownership protection are correctly documented.
- Client boundaries and no-external-call-inside-transaction rules are correct.

### Not accepted as final facts

- Antigravity’s “18 endpoints frozen” claim is premature.
- DTO fields such as `ip_address`, `head_user_id`, `lead_user_id`, `user_type`, and `role` require SQL/catalog proof; they must not be copied blindly.
- Ownership-transfer path is now recorded as a proposal only; its DTO, audit contract and catalog traceability still require review.

### Required before coding

1. Complete the freeze worksheet with SQL-backed request/response DTO fields.
2. Remove unsupported fields and sensitive response fields.
3. Map every endpoint to the Phase 06 catalog and approved actor/error vocabulary.
4. Confirm membership accept/rejoin paths and ownership-transfer scope.
5. Run one final review after the cleanup.

**Status: BUSINESS DECISIONS RESOLVED — API CONTRACT NOT YET FROZEN — CONTROLLER CODING BLOCKED.**
