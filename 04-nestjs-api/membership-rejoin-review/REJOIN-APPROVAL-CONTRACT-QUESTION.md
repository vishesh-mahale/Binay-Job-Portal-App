# Membership Rejoin — Approval Contract Question

## Verified current decision

D6 says: a previously associated user requests rejoin; owner/admin approves; rejoin reactivates the existing `company_members` row and preserves `joined_at`.

## Why clarification is required

The current proposed route is:

`POST /api/v1/companies/:companyId/membership/rejoin`

It has no target-member DTO. One request cannot identify both the requester and a different member whose rejoin an owner/admin must approve. The baseline has no pending-rejoin status column or approval table.

## Options to evaluate

1. **Two-step commands (recommended candidate):**
   - member requests rejoin using own identity;
   - owner/admin approves using `member_id` in a separate command;
   - requires an approved durable request state/table or an existing field mapping.
2. **Owner/admin-only reactivation:** owner/admin calls one endpoint with `member_id`; no self-request state is stored. This changes the “member requests” wording and must be explicitly approved.
3. **Single self-service rejoin:** member directly reactivates own row; no owner/admin approval. This conflicts with D6 and is not acceptable without changing D6.

No implementation may silently select an option. Until resolved, membership rejoin remains blocked while other membership commands may proceed.
