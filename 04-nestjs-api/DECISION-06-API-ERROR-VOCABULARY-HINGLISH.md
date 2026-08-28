# Decision 06 — NestJS API Error Vocabulary

Status: `APPROVED DIRECTION — PHASE 06 CATALOG REVALIDATION REQUIRED`

NestJS public API ke liye Stage-03 consolidated DTO review wali vocabulary authoritative hai:

| Code | HTTP | Meaning |
|---|---:|---|
| VALIDATION_ERROR | 400 | Invalid DTO/input |
| UNAUTHORIZED | 401 | Missing/invalid/expired JWT |
| FORBIDDEN | 403 | Disclosed resource par action denied |
| NOT_FOUND | 404 | Unknown/not-owned/soft-deleted resource |
| GUEST_SESSION_INVALID | 403 | Guest session active/unexpired/unrevoked nahi |
| RESUME_LIMIT_REACHED | 409 | Active resume library limit reached |
| SCAN_PENDING | 409 | Scan complete hone tak operation blocked |
| SCAN_FAILED | 409 | Scan failed/retryable state |
| INFECTED_FILE | 422 | Infected/quarantined content |
| PARSING_PENDING | 409 | Parsing incomplete |
| PARSING_FAILED | 422 | Parsing terminal failure |
| STALE_REVISION | 409 | Optimistic concurrency mismatch |
| IDEMPOTENCY_CONFLICT | 409 | Same key with different payload |
| DEPENDENCY_UNAVAILABLE | 503 | Storage/DB/dependency unavailable |
| RATE_LIMITED | 429 | Rate limit exceeded |
| INTERNAL_ERROR | 500 | Unexpected server failure |

`CONFLICT`, `EXPIRED` और `CURSOR_INVALID` को नया public code बनाकर use नहीं किया जाएगा। किसी
domain-specific conflict को ऊपर के approved code में map किया जाएगा; यदि accurate mapping संभव नहीं
होती, तो Phase 7 API design में explicit change request बनेगी।

Progress states error नहीं हैं: status APIs deterministic `stage` return करेंगी। Raw scanner,
storage, provider या database details response/log में नहीं जाएँगी।
