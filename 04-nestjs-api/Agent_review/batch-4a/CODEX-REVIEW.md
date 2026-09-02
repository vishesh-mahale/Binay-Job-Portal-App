# Codex Independent Review — Batch 4A

**Scope:** Native Supabase Password Recovery & Password Security

**Review mode:** Read-only source, migration, test and handoff review

**Reviewer:** Codex

**Date:** 2026-09-02

## Verdict

No confirmed Critical blocker was found in the current implementation. The
authenticated change-password revocation path is suitable for read-only
review closure, subject to the evidence and hardening items below.

## Verified Positive Findings

- Missing Supabase access token fails closed before password mutation.
- Global logout failure fails closed before password mutation.
- Global logout uses `POST /auth/v1/logout?scope=global` with the user access token.
- Old access-token requests are rejected by the password-change cutoff.
- Old refresh-token requests are rejected after Supabase global logout.
- New login and new refresh succeed after the documented one-second boundary.
- PostgreSQL password trigger re-raises failures and updates
  `public.users.last_password_changed_at` atomically.
- Forgot-password response is generic for known and unknown email addresses.
- Recovery token is not forwarded to the NestJS custom API or persisted in web storage.
- Passwords, tokens and SMTP credentials are not intentionally included in logs.

## Findings

### Medium — Real recovery E2E evidence is not detailed enough

The handoff marks real recovery as PASS, but does not include a complete
redacted trace for:

```text
forgot request → Brevo delivery → reset link → password update
→ old password rejection → new password success → old-session behavior
```

Add HTTP statuses, callback path, reset result and login/session results without
including private tokens, passwords or SMTP keys.

### Medium — Recovery-reset session revocation needs separate proof

The integrated seven-step test proves the authenticated
`POST /api/v1/auth/change-password` path. It does not by itself prove that the
direct Supabase `/reset-password` recovery path invalidates old access and
refresh sessions. Run and record that scenario separately.

### Low/Medium — Unchecked JWT payload decoding

`parseJwtPayloadUnchecked()` decodes the JWT payload without signature
verification. The value currently comes from a Supabase response rather than
direct client input, so no immediate exploit was confirmed. Nevertheless, this
should remain an explicit security risk or be replaced with a verified JWT
claims path where practical.

### Low — Global logout ordering should be documented

Global logout occurs before the password mutation. If the later password update
fails, the old password remains usable for a new login, while existing sessions
have already been revoked. This is fail-closed from a security perspective,
but the operational behavior should be documented and tested.

## Required Follow-up Evidence

1. Redacted real Brevo recovery trace.
2. Old access/refresh behavior after direct recovery reset.
3. Confirmation that the production migration/trigger is applied to the target
   Supabase project.
4. Explicit documentation of the one-second ceil cutoff boundary.

## Security Rules Confirmed

- No custom recovery-token generator or resend-token system.
- Supabase Auth remains the recovery-token authority.
- No token/password/SMTP secret should be copied into review artifacts.
- Reviewers remain read-only and must not modify application source.

## Final Recommendation

`IMPLEMENTED — READ-ONLY REVIEW PENDING`.

FreeBuf and OpenCode may now perform independent read-only reviews. After their
findings are consolidated, apply only validated fixes and rerun the complete
backend/frontend/integration verification gates.
