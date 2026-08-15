# PD-003 — Application Identity and Historical Truth

[← Requirements index](../README.md) · [Main project](../../README.md)

## Status

`APPROVED`

## Decision

- Same registered candidate + same `job_id` = one application।
- Same guest normalized identity + same `job_id` = one application।
- Reposted vacancy new `job_id` होगी।
- `deleted_at` archive/visibility है; duplicate apply entitlement नहीं।
- Submission-time snapshot immutable historical truth है।

## Consequences

```text
Application submit
→ exactly one immutable submitted snapshot
→ append-only status history
→ append-only application document links
```

Registered submission snapshot transaction-time confirmed canonical facts और उस application के लिए selected
resume के available parsed facts को normalize/deduplicate करके freeze करेगी; duplicate पर canonical source को
priority मिलेगी। Selected resume parse pending होने पर apply block नहीं होगी। Selected resume document identity
snapshot/application-document relation में preserve होगी और later parsed/enriched output नया immutable
snapshot version बनेगा—submitted snapshot rewrite नहीं होगा।

Selected application resume active profile resume या application-only resume हो सकती है। यह decision global
recruiter-search projection की active-resume policy को silently change नहीं करेगा।

Later profile/resume change submitted representation नहीं बदलती। Parsed/enriched/
reviewed snapshot बदलना हो तो नया version insert होगा, existing row update नहीं।

Guest claim verified identity flow से होगा; application ownership silently rewrite
नहीं होगी। Current status change, history और outbox transactional रहें।
