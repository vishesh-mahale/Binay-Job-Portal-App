# Decision 05 — First Profile Resume Active Default

Status: `APPROVED / FROZEN`

## Decision

Candidate ke account ka first profile-resume upload automatically active profile resume banega.
UI mein `Use as active profile resume` control first upload ke liye checked aur disabled rahega.

Later profile-resume uploads ke liye candidate ko explicit choice milegi:

- `true`: upload parse/confirm ke baad active profile resume ban sakta hai.
- `false`: resume library/history mein rahega, canonical recruiter-search projection ko change nahi karega.

Application-only resume is decision ka part nahi hai; woh application snapshot ke andar scoped rahega
aur canonical profile/search projection mein promote nahi hoga.

## API impact

- Upload DTO mein `use_as_active_profile_resume: boolean` rahega.
- Server first-upload invariant ko independently enforce karega; client ke disabled control par trust
  nahi karega.
- Active selection ke baad canonical confirmation/projection flow existing revision and outbox rules
  follow karega.
- Duplicate checksum reuse existing idempotency rule follow karega.

## Acceptance criteria

1. First eligible profile resume upload cannot be stored as non-active.
2. Later upload may remain non-active until explicitly selected.
3. Application-only upload never changes canonical profile/search projection.
4. Cross-user selection and client-forged role/status are rejected.

## Authority

This decision resolves the open first-upload default noted in Stage-03 remaining decisions and is
the product-owner decision to be used by Phase 06 API catalog and later implementation planning.
