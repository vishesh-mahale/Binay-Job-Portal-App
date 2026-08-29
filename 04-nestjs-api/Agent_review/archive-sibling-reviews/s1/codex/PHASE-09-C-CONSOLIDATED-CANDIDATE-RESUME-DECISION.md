# Phase 09-C — Candidate + Resume Consolidated Decision

**Date:** 27 August 2026  
**Status:** `BLOCKED FOR FULL IMPLEMENTATION — CONTRACT FIXES REQUIRED`

## 1. Final evidence-based verdict

चारों agent reports ने सही रूप से confirm किया है कि resume pipeline का मुख्य architecture मौजूद और aligned है:

```text
Resume upload
  → uploaded_documents
  → security.scan.requested
  → security-scan-queue
  → FastAPI ClamAV scan
  → resume.parse.requested
  → ai-heavy-queue
  → parsed immutable evidence
  → candidate confirmation
  → candidate.profile.changed
  → projection worker
```

लेकिन full Candidate/Resume implementation अभी शुरू नहीं होगी, क्योंकि दो contract blockers खुले हैं:

1. Candidate profile read/save/archive के exact public paths और DTOs अभी Phase-06 में `TBD` हैं।
2. Parsed-data response का field-by-field allowlist अभी explicitly unresolved है।

## 2. Confirmed contract — source of truth

इन resume paths को Phase-06 API catalog में exact रूप से define किया गया है और इन्हीं को follow किया जाएगा:

| Capability | Method/path |
|---|---|
| Profile resume upload | `POST /api/v1/resumes/upload` |
| Resume status | `GET /api/v1/resumes/:id/status` |
| Parsed review data | `GET /api/v1/resumes/:id/parsed-data` |
| Confirm parsed facts | `POST /api/v1/resumes/:id/confirm` |

Candidate profile paths अभी तय नहीं हैं; किसी report में सुझाया गया path अभी approved contract नहीं माना जाएगा।

## 3. Decisions confirmed

- First eligible profile resume server-side automatically active होगा; UI checkbox checked/disabled रहेगा।
- Later resume के लिए candidate explicit active-selection भेजेगा।
- Upload ownership JWT `sub` से derive होगी; request body से नहीं।
- Binary private storage में रहेगा; DB में केवल metadata रहेगा।
- Upload transaction में metadata और `security.scan.requested` outbox event atomic होंगे।
- External storage/Cloud Tasks/FastAPI calls open DB transaction के अंदर नहीं होंगी।
- Checksum reuse same owner scope में duplicate document/scan event नहीं बनाएगा।
- Infected, failed, quarantined या non-clean document parsing/confirmation gate पार नहीं करेगा।
- Sensitive reads SystemClient + explicit ownership check से होंगे; approved personal profile read UserContextClient/RLS boundary follow करेगा।
- Raw `extracted_text`, `raw_ai_output`, storage bucket/path, tokens और secrets API response/log में नहीं आएँगे।
- Confirm operation idempotent होना चाहिए; duplicate confirm से duplicate document link/revision/event नहीं बनना चाहिए।

## 4. Agent-report corrections

Reports में निम्न claims को approved fact नहीं माना गया:

- `/api/v1/candidates/me/resumes` upload path — Phase-06 के approved path से conflict करता है; इसे use नहीं करना है।
- `candidate_profile_id` और `is_soft_deleted` columns — current `08_candidates.sql` में actual names `candidate_id`, `is_current`, `unlinked_at` और `deleted_at` हैं।
- Parsed allowlist में `confidence_score` नाम — DB/API catalog का canonical field `overall_confidence` है; exact response DTO freeze होने तक कोई alias invent नहीं होगा।
- “All RLS enabled on every table” जैसे broad claims को current DB verification के बिना implementation evidence नहीं माना जाएगा।

## 5. Mandatory fixes before coding

### FIX-01 — Candidate profile contract freeze

Freeze exact paths, request/response DTOs और child-fact representation for:

- own profile read
- canonical profile save
- canonical fact archive/soft-delete

### FIX-02 — Parsed-data allowlist freeze

Define and document the exact allowlisted shape for `normalized_output`, `confidence_details`,
`validation_result`, `overall_confidence`, `schema_version` and `partial`.
Raw text/AI output/artifacts/error details must remain excluded.

### FIX-03 — Confirm duplicate guard

Define the exact database/API behavior for repeated or concurrent confirm requests:
same successful result, no duplicate link, no second revision bump and no second outbox event.

### FIX-04 — Test gate

Before implementation is called complete, add NestJS tests for upload, ownership, checksum reuse,
scan-gate failures, parsed-data redaction, confirm idempotency, stale revision and rollback.

## 6. Test acceptance matrix

- Unit: file validation, checksum, DTO allowlist, ownership and error mapping.
- Integration: metadata + outbox atomicity; confirm + revision/history/outbox atomicity.
- Concurrency: duplicate upload/confirm and stale revision.
- Failure: infected/quarantined/failed scan and storage compensation.
- E2E: upload → scan → parse → status → parsed-data → confirm → projection.

## 7. Final implementation gate

```text
Current state: ARCHITECTURE APPROVED
Resume event/queue pipeline: VERIFIED
Candidate paths/DTOs: NOT FROZEN
Parsed response allowlist: NOT FROZEN
NestJS Candidate/Resume coding: BLOCKED UNTIL FIX-01..03 ARE FROZEN
```

Implementation may start immediately after these contract fixes are reviewed and recorded; no new
table, column, event, queue or storage behavior may be invented during coding.
