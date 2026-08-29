# Codex Consolidated Review — Phase 09-B API Decisions

Date: 2026-08-26

## Verdict

**CONDITIONAL PASS — decision sheet is grounded, but API freeze is still blocked.**

All three agent reports were compared against the actual proposal, SQL baseline and existing access-model decision. Their common findings are valid where they match the repository. Recommendations that assumed unsupported RLS or invented invitation artifacts were not accepted as facts.

## Final cross-checked findings

| Area | Final position |
|---|---|
| Auth bootstrap | Supabase `handle_new_user()` owns `public.users` creation. NestJS may verify/read callback state, but must not duplicate row creation. Endpoint existence and responsibility remain D1. |
| Company creation | SQL does not define eligibility. Creator `owner_id` must always come from verified JWT, never request input. Eligibility remains D2. |
| Membership invite/accept | `company_members.user_id` is `NOT NULL`; no invitation token/table exists. Existing-user inactive-row acceptance is source-faithful. External email requires approved migration/contracts. Accept and rejoin are separate flows. |
| Organization resources | Separate nested resources fit the three distinct baseline tables; final path shape remains D4. |
| Sessions | `user_sessions` is realtime presence, not Supabase Auth sessions and has no approved authenticated RLS policy. Use SystemClient plus ownership checks. Revoke semantics remain D5/D7. |
| Owner protection/rejoin | Sole owner/last admin cannot leave or deactivate without transfer/reassignment. Rejoin reactivates the existing row; actor and `joined_at` behavior remain D6. |
| Ownership transfer | Transfer capability is not defined as a final API contract and must be decided explicitly (D8). |

## Agent recommendations not blindly accepted

- “Company reads always use UserContextClient” is incorrect for company tables without approved direct RLS policies; the frozen hybrid model requires SystemClient plus server authorization there.
- A concrete invitation endpoint/token was not accepted because the baseline has no invitation artifact.
- Supabase Auth token revocation was not assumed from the presence table; it remains a separate decision.

## Current decision inventory

Decision D1 is now approved: NestJS owns the AuthProvider signup/login/verification boundary, while `handle_new_user()` owns `public.users` creation; no separate bootstrap endpoint is required. Pending decisions are D2–D8 and cover company eligibility, invitation/accept, organization paths, presence revoke, owner/rejoin rules, token-level revoke, and ownership transfer.

## Gate

Do not freeze public routes or start controllers until D1–D8 receive explicit human decisions, the proposal and API catalog are updated, and one final independent review passes.

**Status: READY FOR HUMAN DECISIONS — NOT READY FOR API CODING.**
