# Codex recommended freeze — Jobs/Search J5–J8

Date: 2026-08-28  
Status: `APPROVED AND SYNCED INTO DECISION-07`

These defaults reconcile the three agent reviews with the frozen Decision-07 and existing SQL. They
have now been copied into Decision-07 and the API catalog; code/contracts/migrations are still
unchanged.

## J5 — Search

- First release uses PostgreSQL relational filters + weighted FTS.
- Vector ranking is enabled only when the query/job vectors use the configured same model/version;
  otherwise FTS-only fallback is mandatory.
- FTS score is primary. Deterministic order is `score DESC, published_at DESC, id DESC`.
- Recruiter stale projection returns only approved projection fields plus
  `projection_freshness: "stale"`; raw resume/evidence is never returned.

Reason: this uses the already-provisioned SQL FTS/index path and avoids making semantic ranking a
correctness dependency.

## J6 — Pagination

- Opaque signed/versioned keyset cursor.
- Cursor binds canonical filter hash and sort mode; tampering/mismatch is rejected.
- Default page size `20`, maximum `50`.
- TTL: public job search `30 minutes`; recruiter candidate search `10 minutes`.
- Invalid, tampered or expired cursor uses the existing validation error envelope with the approved
  cursor-invalid mapping; no new error family is invented.

## J7 — Visibility

- Public jobs: published, non-deleted and non-expired only.
- Confidential jobs remain searchable but company identity is masked in public responses; authorized
  company users see the real identity.
- Recruiter search requires active company membership plus the approved recruiter-search permission;
  current-scope candidate eligibility is `is_open_to_work = true`.
- Cross-company candidate search is allowed only for eligible/open-to-work candidates; membership is
  the authorization to use the search capability, not permission to bypass candidate privacy.
- Saved-candidate state is private to the recruiter and non-job-specific.

## J8 — Events/analytics

- Align `job-ai-enrichment-requested.v1.json` with the full Gate G-1 outbox envelope before producer
  implementation.
- Emit only when a job is first published or an approved AI-relevant field changes on an already
  published job.
- Do not emit lifecycle or impression events without a versioned contract and consumer.
- Search impressions/views remain a separate non-blocking analytics path.

## Completion gate

After these values are approved and synced, implement
the private query adapters and job lifecycle controllers in that order. Until approval, this file is
only a recommendation and no public Jobs/Search contract is considered frozen.
