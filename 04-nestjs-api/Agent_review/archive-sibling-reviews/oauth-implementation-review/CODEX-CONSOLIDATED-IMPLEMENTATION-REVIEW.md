# OAuth Implementation Plan — Consolidated Review

**Reviewers:** Antigravity, FreeBuf, OpenCode  
**Date:** 2026-08-27

## Verdict

```text
Plan direction: APPROVED
Implementation readiness: NOT READY
Required hardening: state/PKCE mechanics, provider-aware audit, config contract,
account-linking decision and callback flow details
```

## Findings

| Area | Final assessment |
|---|---|
| NestJS → Supabase Auth boundary | Correct; preserve it |
| External exchange outside DB transaction | Correct |
| Clean redirect and HttpOnly cookies | Correct |
| Provider/redirect allowlists | Mandatory and valid |
| Trigger-owned `public.users` creation/status | Correct; callback must read, not duplicate |
| AuthAuditService | Must become provider-aware (`login_type`, `auth_provider`) |
| State + PKCE | Requirement valid, but storage format, S256, TTL, replay/one-time behavior missing |
| Multi-instance | Cookie design can be stateless-safe only when every instance shares the same secret and key version |
| Account linking | Unresolved; no automatic email merge may be assumed |
| CORS | Frontend success URL must be compatible with `CORS_ORIGINS`; redirect itself is not a CORS API call |
| Rate limiting | Required production gate, exact values pending |

## Corrections to agent reports

1. The callback route is already present in the frozen auth contract; it is not an invented route. If the API catalog omits it, amend the catalog rather than treating the route as invalid.
2. “Signup must be audited as login” remains a separate audit decision; it is not proven by the OAuth plan.
3. `public.users.auth_provider` does not exist. Do not add it just for OAuth; provider-aware `login_history` and Supabase identity metadata are separate concerns.
4. Cookie-based state can provide CSRF binding and replay rejection by strict expiry plus clear-on-use, but the plan must explicitly define this. If true server-side one-time revocation is required across concurrent tabs, a durable/shared store or reviewed token design is needed.
5. OAuth verified-email activation is already trigger-owned via `email_confirmed_at`; NestJS should only verify the resulting account state and record the approved security event.

## Mandatory plan amendments before coding

- Specify `code_challenge_method=S256`, verifier generation, state payload, integrity/confidentiality protection, TTL, key rotation and clear-on-use behavior.
- State that all instances use the same `OAUTH_STATE_SECRET` through Secret Manager.
- Add provider-aware `AuthAuditService` contract and `login_history` constraint tests.
- Freeze no-link vs explicit-link policy. Automatic email merge is prohibited until explicitly approved.
- Add OAuth methods to the `AuthProvider` interface and identify Supabase token exchange endpoint/parameters.
- Add exact callback success/error redirect semantics and frontend/API origin relationship.
- Define provider allowlist authority: Supabase Dashboard enables providers; NestJS validates request values.
- Keep callback rate limiting as a release gate with environment-configured values.

## Recommended next sequence

```text
Amend plan with above mechanics
→ obtain final provider/linking/URL decisions
→ refactor audit service
→ implement authorize + callback
→ add replay, cookie, redirect and provider tests
→ agent review
```

No source code or SQL was modified during this review.
