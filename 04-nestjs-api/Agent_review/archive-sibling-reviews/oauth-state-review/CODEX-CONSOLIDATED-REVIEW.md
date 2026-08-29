# OAuth State Helper — Consolidated Re-review

**Reviewers:** Antigravity, FreeBuf, OpenCode  
**Date:** 2026-08-27

## Verdict

```text
Crypto helper: PASS
Plan: PASS with implementation clarifications
OAuth controller: NOT IMPLEMENTED
```

## Verified

- AES-256-GCM with random 12-byte IV and authenticated tag.
- Minimum 32-character secret guard.
- Expiry and tamper rejection are fail-closed.
- PKCE verifier is sealed with state and is not placed in URL/logs/database.
- Stateless cookie design is multi-instance compatible when every instance has the same Secret Manager secret.
- Constant-time comparison helper exists.
- Provider-aware audit service refactor is complete.

## Valid remaining fixes

1. State cookie must be added to the authoritative cookie contract with `HttpOnly`, `Secure` outside local development, `SameSite=Lax`, path `/api/v1/auth/oauth`, and `Max-Age` from configured TTL.
2. OAuth controller must call `statesEqual(decrypted.state, query.state)`, clear the state cookie before redirect, and reject missing/expired/replayed state.
3. `AuthProvider` needs an explicit OAuth authorize/code-exchange interface (or a separate `OAuthProvider` abstraction) before controller coding.
4. Provider allowlist, exact callback/frontend URLs, account-linking policy and callback rate limits remain deployment/architecture decisions.
5. If key rotation is implemented, all instances must share the same active/overlap key configuration; key version acceptance policy must be documented.

## Findings not accepted as blockers

- A database/Redis state table is not mandatory if the encrypted cookie design and clear-on-use semantics are explicitly accepted. True cross-tab atomic single-use would require additional shared storage, but that has not been approved.
- A new `public.users.auth_provider` column is not required by the current schema and must not be invented.
- Signup inclusion in `login_history` remains the separate audit decision; it is not settled by OAuth mechanics.
- The callback route is already in the frozen auth contract; any endpoint-catalog omission should be handled as a catalog amendment, not by inventing a second route.

## Next safe implementation order

```text
Update cookie contract
→ define OAuthProvider interface
→ configure approved providers/URLs
→ authorize endpoint (state + PKCE)
→ callback exchange + status check + provider-aware audit
→ cookies/clean redirect
→ replay, multi-instance and linking tests
```

No source code or SQL was modified during this review.
