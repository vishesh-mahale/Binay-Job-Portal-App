# Codex — Phase 06 API Catalog Independent Review

Date: 2026-08-27
Target: `04-nestjs-api/PHASE-06-API-CATALOG.md`

## Verdict

**CONDITIONAL PASS — API CATALOG NOT YET FROZEN**

The resume and guest API entries are detailed and aligned with the frozen requirements. The
catalog is not complete because most current domains are still represented only in a backlog
list, not as full API/use-case entries.

## Verified correct

- Public prefix `/api/v1` is consistent.
- Browser-to-Supabase direct access is prohibited.
- UserContextClient/RLS and SystemClient/ownership boundaries are consistent with Decision-01.
- Resume upload uses NestJS-mediated multipart and asynchronous ClamAV scanning.
- Upload transaction and `security.scan.requested` outbox behavior are correctly described.
- Checksum reuse is successful reuse, not a second scan/event.
- Status API exposes both tracks and deterministic stage recovery.
- Parsed-data response excludes raw extracted text, raw AI output, artifacts and internal errors.
- Confirm requires expected revision, allowlisted fields and atomic revision/history/outbox behavior.
- Guest paths and session invariants are consistent with Stage 3.
- Dispatcher route inventory and worker-output boundary are accurate.
- `application.status.changed` is correctly treated as an expected phased gap.
- No code or schema changes were made during this review.

## Findings

### API6-001 — HIGH — Catalog coverage incomplete

The following required groups are only backlog entries, not full catalog entries with the mandatory
15 fields:

```text
identity/auth
companies/memberships
candidate profile CRUD
jobs/search
applications/status transitions
referrals
interviews
messaging
notifications/realtime
saved candidates
feedback/analytics/subscriptions
AI use cases
```

Impact: Phase 6 exit criteria cannot be claimed until each current requirement has an HTTP route or
internal command entry with owner, transaction, event, errors and acceptance tests.

### API6-002 — MEDIUM — Exact idempotency persistence remains open

The catalog states the idempotency rule but does not identify the final persistence mechanism or
retention policy. This is correctly tracked as open; it must be resolved before implementation of
mutating endpoints.

### API6-003 — MEDIUM — Parsed-data field allowlist remains open

The catalog correctly avoids raw output, but the exact normalized field-to-canonical-column map is
not yet present. Confirm DTO implementation must wait for this mapping.

### API6-004 — MEDIUM — Guest token/header DTO details remain open

Guest paths are frozen, but token transport, one-time semantics and exact error details are not yet
specified. This blocks guest API implementation, not the catalog structure.

### API6-005 — LOW — Rate limits are categories only

This is acceptable at this stage because numeric values are environment/operations decisions, but
the final catalog should name the configuration keys and acceptance-test placeholders.

## Required next work

1. Expand every current requirement group from the backlog into the mandatory catalog template.
2. Resolve idempotency persistence/retention.
3. Freeze parsed-data/confirm field allowlist.
4. Freeze guest token/header DTO details.
5. Add rate-limit configuration keys and test criteria.
6. Re-run independent review after expansion.

## Final status

```text
API CATALOG: CONDITIONAL PASS
API CATALOG FROZEN: NO
ARCHITECTURE: NOT STARTED
CODING: NOT AUTHORIZED
```
