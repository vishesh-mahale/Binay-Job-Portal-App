# Phase 09 Auth Audit/Session Decisions — Consolidated Review

**Date:** 2026-08-27  
**Reviewers:** Antigravity, FreeBuf, OpenCode + independent adjudication  
**Source of truth:** current NestJS code, SQL baseline and frozen endpoint documents

## Final status

```text
Document quality: GOOD
Recent recommendations: MOSTLY VALID
Contract conflicts: 1 real conflict (logout presence wording)
Audit implementation: NOT COMPLETE
Ready for implementation: NO — decisions below must be frozen first
```

## Agent comparison

| Topic | Consensus / valid finding | Independent decision |
|---|---|---|
| Recent JWT, issuer/audience, raw-token and account checks | All three verified these correctly | VERIFIED; no change needed |
| `login_history` schema and enum constraints | Correctly read from SQL; nullable `user_id` and append-only behavior valid | VERIFIED |
| Signup in `login_history` | OpenCode calls exclusion a gap; Antigravity/FreeBuf treat login-history scope as login attempts | **Still a decision**, not an evidence-proven contradiction. SQL says login attempts; do not silently add signup rows. Record client/security decision explicitly. |
| Presence created at realtime connection | SQL purpose/socket fields support this | REASONABLE recommendation, but logout contract must be aligned |
| Logout presence deferral | FreeBuf/OpenCode correctly found conflict with frozen logout contract | **Must amend either contract or implementation scope. Do not leave contradiction.** |
| Refresh as presence heartbeat | All agree it is token renewal, not heartbeat | VERIFIED; no presence update on refresh unless later contract says otherwise |
| Lockout | `locked_until` is enforced but never set; threshold/storage absent | Valid gap. Do not invent a default threshold without approval. Existing `login_history` count is a possible option, not yet a final rule. |
| Provider error mapping | Current provider collapses errors to generic exceptions | HIGH implementation gap; parse/map through a typed internal error, without exposing raw details |
| IP/user-agent | Columns exist but current auth handlers do not capture them | Valid missing implementation; proxy trust and retention need environment decision |
| CORS/rate-limit/DTO | Not configured/finalized | Production gates; safe to defer exact values, not to forget |

## Evidence-verified current gaps

1. `auth-provider.ts` has no `login_history` insert.
2. `auth-provider.ts` has no `user_security_log` insert.
3. Login/signup do not pass `req.ip` or user-agent into an audit service.
4. `SupabaseAuthProvider.call()` parses a body but does not map `error_code`/message to approved failure enums.
5. Login does not create presence; refresh does not update presence; logout only clears cookies.
6. `locked_until` is checked, but failed-attempt counting and lock activation are absent.
7. `main.ts` has no final CORS or trust-proxy configuration; DTO classes have no field decorators; rate limit is absent.

## Important corrections to agent claims

- “Signup must be in `login_history`” is a recommendation, not proven by the current schema. The SQL comment explicitly describes successful and failed **login attempts**. Decide whether signup authentication is intentionally outside this table or add a documented approved audit mapping; no enum/table change should be invented.
- `user_security_log.user_id` is NOT NULL. Unknown-email failures can go only to `login_history`; they cannot be inserted there with NULL user ID.
- A broad `UPDATE user_sessions WHERE user_id = $1 AND is_online = true` would close all sessions, not a single current session. It must not be implemented while the approved scope is single-session revoke.
- “Refresh invalidates old token” is provider behavior that must be verified against Supabase configuration; it is not proven by this NestJS code.
- A specific lockout policy such as “5 in 15 minutes” must not be treated as approved merely because an agent suggested it.

## Required resolution order

### 1. Resolve logout/presence contract conflict

Choose one and update the frozen document plus implementation contract:

- **Selected-session model:** realtime handshake provides a `user_sessions.id`; logout carries/derives that ID and deactivates only that row.
- **User-wide logout model:** explicitly change contract to deactivate every online presence row for the user.

Current architecture preference is selected-session model because single-session revoke was previously chosen. Until the session-ID transport contract exists, do not add a broad user-wide update just to make the code appear complete.

### 2. Decide signup audit scope

Document one of:

- login-history only (signup separately documented and intentionally not represented), or
- signup success is recorded using an approved existing login type and audit meaning.

No new `signup` enum value should be added without a reviewed migration.

### 3. Freeze provider error mapping

Define the approved mapping from Supabase `error_code`/safe status to:

```text
invalid_password, user_not_found, email_not_verified,
account_locked, too_many_attempts, suspended, banned,
invalid_oauth_token, unknown
```

Raw provider body must never be returned or logged.

### 4. Freeze lockout policy

Approve threshold, time window, duration, counting key (user/email/IP), atomic update owner and reset behavior. Existing `login_history` counting is an option, not a completed decision.

### 5. Freeze request metadata and production controls

Approve reverse-proxy trust configuration, IP/user-agent retention, CORS origins/credentials, rate limits and DTO bounds.

## Implementation gate after approval

```text
AuthAuditService
→ login_history success/failure writes
→ known-user user_security_log writes
→ exact provider error mapping
→ selected presence lifecycle
→ tests: constraints, PII, concurrency, lockout, session ownership
→ npm test + build (open-handle warning separately reported)
```

**No source code or SQL was modified during this review.**
