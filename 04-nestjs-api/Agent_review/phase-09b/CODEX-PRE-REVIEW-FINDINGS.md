# Phase 09-B Pre-Review Findings

## Verdict

The current handoff must remain **pending verification**. The source authorization changes may be valid, but the supplied live script does not yet prove all seven gates under the project's integration-test rules.

## Blocking finding 1 — admin fixture fallback is used in the live proof

`scripts/phase-09b-live-http-integration-test.cjs` calls Supabase Admin REST endpoints to create users and directly patch `public.users` role/status when login fails. This bypasses the public NestJS signup/provisioning flow. Therefore the run cannot be labelled a pure live password-auth integration proof.

Required correction: create fresh synthetic users through `POST /api/v1/auth/signup` and use the normal login/verification contract. If a pre-provisioned fixture is unavoidable, label the run as fixture-backed smoke only and do not mark the live signup gate complete.

## Blocking finding 2 — Gate 1 does not test the claimed flow

The script's Gate 1 only obtains active users (or admin-creates them), performs login, and calls `/auth/me`. It does not execute signup, refresh, or the unverified-user rejection path, despite the handoff claiming signup/login/refresh/cookie behavior.

Required correction: add explicit HTTP assertions for signup, pending/unverified login rejection, login, refresh, `/me`, and logout. Do not mark the gate passed unless each assertion executes through NestJS.

Additional environment note: the current local `.env` has `AUTH_AUTO_CONFIRM_EMAIL=true`, so this run cannot prove the production-like unverified signup rejection contract. A separate controlled run with `AUTH_AUTO_CONFIRM_EMAIL=false` (and real confirmation or an explicitly documented confirmation fixture) is required.

## Coverage-quality finding 3 — cookie assertions are too weak

`hasAccessCookie` only checks that a cookie string contains `binay_access_token=`. It does not parse or assert `HttpOnly`, `SameSite`, `Secure` (where applicable), `Path`, or refresh-cookie attributes.

Required correction: parse `Set-Cookie` headers and assert the exact environment-appropriate security attributes; document localhost exceptions explicitly.

## Coverage-quality finding 4 — cleanup/reproducibility is not demonstrated

The script creates companies, hierarchy rows, memberships, and users but contains no guaranteed `finally` cleanup or rollback verification. Repeated runs can leave state and make later results non-independent.

Required correction: add deterministic cleanup (or transaction/ephemeral fixture strategy), and report cleanup success/failure separately. Soft-deactivating companies alone does not remove or isolate the created users, memberships, and hierarchy rows.

## Architecture decision

Do not alter the approved boundary: `Next.js browser -> NestJS API -> Supabase`. Do not solve these findings by adding direct frontend Supabase calls or new client-side secrets.

## Reopened blocking finding — hidden admin confirmation fallback remains

Current `scripts/phase-09b-live-http-integration-test.cjs` still contains `confirmAndLoginUser()`, which calls Supabase Admin REST `PUT /auth/v1/admin/users/:id` and directly updates `public.users` when signup produces no session. This contradicts the handoff's claim of zero Admin/DB bypasses and means authenticated company/member gates are not proven through the public signup/confirmation contract.

Required correction: remove this helper from any script labelled pure public proof. Either (a) run a genuine confirmation-link flow before public login, or (b) split the evidence into a separate `AUTH_AUTO_CONFIRM_EMAIL=false` auth-verification run and a clearly labelled authenticated company smoke run using approved pre-provisioned fixtures. Do not mark the combined run as 7/7 pure public gates while the fallback exists.

## Reopened security finding — session token values are printed in evidence

The current Gate 7 output/handoff includes parsed cookie objects with `value` fields (access and refresh token values). Even if an access value is truncated in a pasted report, token values must never be logged or committed to evidence artifacts.

Required correction: make cookie parsing return/assert metadata without retaining or printing cookie values; redact `value` from all console output and handoff/walkthrough artifacts. Regenerate the evidence after sanitization and scan source, logs, and docs for token-like output.

## Evidence reproducibility note — mode commands must be explicit

The same command is documented for both `AUTH_AUTO_CONFIRM_EMAIL=false` and `true`, while the repository `.env` is false. Document the exact environment override and server restart used for each mode; do not claim both modes from one ambiguous command.
