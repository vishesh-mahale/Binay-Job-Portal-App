# Aggregate ID Semantics (Gate G-2)

> **Authoritative mapping of `outbox_events.aggregate_id` to domain entity UUIDs per event route.**
>
> The dispatcher forwards `aggregate_id` generically without parsing payload content.
> This document freezes what each route's `aggregate_id` represents at the producer level.

---

## Phase 1 Routes (Contracted)

| Event Type | `aggregate_type` | `aggregate_id` represents | Rationale |
|---|---|---|---|
| `resume.parse.requested` | `resume_parsing_job` | Resume parsing job UUID | The async parsing task operates on a `resume_parsing_jobs` row, not the raw document. The document_id is in `payload`. |
| `candidate.profile.changed` | `candidate` | Candidate UUID | Profile projection rebuilds the candidate's search profile. Aggregate is the candidate entity. |
| `job.ai.enrichment.requested` | `job` | Job UUID | AI enrichment populates `ai_ideal_candidate_profile` and `embedding` on the `jobs` row. |

---

## Phase 2 Routes (G-1 Pending Producer Freeze)

| Event Type | `aggregate_type` | `aggregate_id` represents | Rationale |
|---|---|---|---|
| `match.analyze.requested` | `job_application` | Job application UUID | Match analysis evaluates the fit between a specific application and job. Aggregate is the application entity. |
| `interview.summary.requested` | `interview` | Interview UUID | Interview summary generates structured feedback for a specific interview session. |
| `job.screening_questions.requested` | `job` | Job UUID | Screening questions are generated per job posting, not per application. |
| `security.scan.requested` | `uploaded_document` | Uploaded document UUID | Security scan operates on the raw uploaded file before any parsing begins. |

---

## Chained Output Events (FastAPI Worker Emits)

| Event Type | `aggregate_type` | `aggregate_id` represents | Notes |
|---|---|---|---|
| `candidate.resume.parsed` | `candidate` | Candidate UUID | Emitted after resume parsing completes; aggregate is the candidate (not the parsing job). |
| `candidate.projection.rebuilt` | `candidate` | Candidate UUID | Emitted after projection rebuild; same aggregate as input. |
| `job.enriched` | `job` | Job UUID | Emitted after AI enrichment; same aggregate as input. |
| `application.match_analyzed` | `job_application` | Job application UUID | Emitted after match analysis; same aggregate as input. |
| `interview.summary.generated` | `interview` | Interview UUID | Emitted after interview summary; same aggregate as input. |
| `job.screening_questions.generated` | `job` | Job UUID | Emitted after screening questions; same aggregate as input. |

---

## Governance Rules

1. **Producer discipline**: 04-nestjs-api MUST set `aggregate_id` to the UUID specified above. Dispatcher does not validate or transform it.
2. **Consumer expectation**: FastAPI worker and downstream consumers MUST treat `aggregate_id` as the primary entity being operated on.
3. **Trace correlation**: `trace_id = correlation_id ?? event_id` (dispatcher logic). Producers SHOULD set `correlation_id` when chaining events (e.g., `security.scan.requested` → `resume.parse.requested` share the same trace).
4. **Payload opacity**: Dispatcher NEVER reads `payload` content. All route-specific fields (document_id, job_id, candidate_id, etc.) live in `payload` JSONB and are opaque to the dispatcher.

---

## Status

- **G-2 Phase 1**: FROZEN (3 routes, contracted)
- **G-2 Phase 2**: DRAFT (4 routes, pending producer freeze)
- **Last updated**: Phase 2 implementation (August 2026)
