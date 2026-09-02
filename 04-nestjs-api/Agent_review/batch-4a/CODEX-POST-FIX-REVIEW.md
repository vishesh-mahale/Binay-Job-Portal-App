# Codex Post-Fix Review — Batch 4A

**Review mode:** Read-only

**Date:** 2026-09-02

## Verdict

No new Critical or High source-level blocker was found after the CRITICAL-01
frontend secret-removal fix. The current recovery architecture is consistent
with the approved project boundary:

```text
Next.js → NestJS reset-password proxy → Supabase Auth
```

Final closure remains conditional on independent confirmation of the external
Supabase key rotation and the reported real-inbox evidence.

## Verified Findings

- `reset-password/page.tsx` no longer contains hardcoded Supabase URL or key
  fallbacks.
- Frontend `.env.local` contains only the API URL; no Supabase secret is shipped
  to the browser.
- Frontend reset calls the NestJS proxy rather than Supabase directly.
- NestJS forwards the recovery token only to Supabase's native `/auth/v1/user`
  endpoint and does not intentionally log, store or return it.
- Change-password requires a session access token and successful global logout
  before password mutation.
- PostgreSQL trigger is fail-closed and updates `last_password_changed_at`.
- AuthGuard and refresh cutoff checks are present.
- The canonical handoff exists under `04-nestjs-api/Agent_review/batch-4a/`.

## Remaining Verification Notes

### External key rotation

Repository inspection cannot independently prove the Supabase Dashboard action.
The reported old-key `401` test is evidence, but the dashboard revocation and
new server-key configuration should remain recorded as an operational gate.

### Real inbox evidence

The reported recovery E2E is accepted as evidence if the actual Brevo/Gmail link
was clicked. Keep the redacted trace separate from synthetic-token tests and do
not include complete tokens, passwords or SMTP credentials.

### Recovery error policy

Continue returning safe generic errors for invalid/expired/reused recovery
tokens; do not expose raw upstream payloads or token values in API responses.

## Recommendation

`READY FOR READ-ONLY RE-REVIEW — FreeBuf & OpenCode`.

After both post-fix reviews report no Critical/High findings, consolidate the
three reviews and rerun the final verification gates before marking Batch 4A
fully closed.
