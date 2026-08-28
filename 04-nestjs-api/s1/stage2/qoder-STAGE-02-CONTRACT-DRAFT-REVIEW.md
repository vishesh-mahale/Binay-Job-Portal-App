# Stage 2 — Contract DRAFT Independent Review

**Reviewer:** Qoder (Independent Senior Distributed-Systems / API-Contract Reviewer)
**Date:** 2026-08-26
**Scope:** नए contract drafts (security-scan-task, candidate-resume-parsed, security-scan-result, schemas/README), amended `security-scan-requested.v1.json`, Codex consolidated review doc, और dispatcher/FastAPI compatibility।
**Method:** हर claim actual files + `git status` से verify; कोई production code/contract edit नहीं; drafts को drafts की तरह treat किया (compatibility tests तक non-binding)।

**Git-state evidence (review के समय):**
- Modified: `contracts/events/security-scan-requested.v1.json` (storage_url removed)
- New: `contracts/tasks/security-scan-task.v1.json`, `contracts/events/candidate-resume-parsed.v1.json`, `contracts/schemas/` (2 files)
- Dispatcher (`event-route.registry.ts`, `payload.builder.ts`, tests) और FastAPI (`tasks.py`, `task_handlers.py`) — **कोई change नहीं**

---

## 1. Executive Verdict

**APPROVED WITH CHANGES**

Contract drafts दिशा में सही हैं और Stage-1 frozen decisions का पालन करते हैं, पर 2 drafts में actual outbox envelope / approved shape से deviations हैं (F-01, F-02)। Dispatcher/FastAPI alignment (Decision F/G deliverables) अभी NOT STARTED है — यह planned sequencing है, पर freeze इन्हीं के बाद होगा।

**Stage-2 readiness (Section 9): NOT READY FOR CONTRACT FREEZE**

---

## 2. File-by-file Review Table

| # | File | Status | Verdict | Notes |
|---|---|---|---|---|
| 1 | `contracts/tasks/security-scan-task.v1.json` | NEW draft | ✅ NO ISSUE | Uniform 4-field; aggregate_id doc सही; कुछ micro-consistency notes (F-07) |
| 2 | `contracts/events/security-scan-requested.v1.json` | AMENDED draft | ✅ NO ISSUE (amendment) | `storage_url` removal सही और pre-freeze legitimate (Section 3, B) |
| 3 | `contracts/events/candidate-resume-parsed.v1.json` | NEW draft | 🔴 BLOCKER (fixable) | Envelope में `event_id`/`occurred_at` missing; `schema_version` required नहीं — actual outbox row से incompatible (F-01) |
| 4 | `contracts/schemas/security-scan-result.v1.json` | NEW draft | 🟠 HIGH | `verdict` enum में `quarantined` — approved Decision 4/D में नहीं; scanner shape deviation (F-02) |
| 5 | `contracts/schemas/README.md` | NEW | ✅ NO ISSUE | Convention + draft-status disclaimer सही |
| 6 | `s1/codex/STAGE-02-CONSOLIDATED-CONTRACT-REVIEW.md` | Decision doc | 🟡 MEDIUM | Decisions sound; पर drafts ने Decision C/D से 2 deviations लिए (F-01, F-02); doc का own fact #2 अब stale (task contract अब exists) |
| 7 | `event-route.registry.ts` | UNCHANGED | 🔴 BLOCKER (planned fix pending) | :82 अब **non-existent reference नहीं पर WRONG contract** reference करता है (events/... instead of tasks/security-scan-task); :85-89 projection.rebuilt route अभी भी; :11-12,57 false comments अभी भी |
| 8 | `payload.builder.ts` | UNCHANGED | ✅ NO ISSUE | Contract के 4ों fields emit करता है (:19-27); leak-guard test मौजूद |
| 9 | `app/schemas/tasks.py` | UNCHANGED | 🟠 HIGH (dependency missing) | `SecurityScanTaskPayload` अभी भी absent |
| 10 | `app/api/v1/task_handlers.py` | UNCHANGED | 🟠 HIGH (dependency missing) | `/internal/tasks/security/scan` अभी भी absent (0 grep matches) |
| 11 | `AGGREGATE-ID-SEMANTICS.md` | UNCHANGED | ✅ NO ISSUE | security.scan aggregate (:27) और candidate.resume.parsed aggregate (:35) दोनों नए drafts से match |
| 12 | `G1-ENVELOPE-ALIGNMENT.md` | UNCHANGED | 🟡 MEDIUM | :90 "G-1(a.1): DONE — security.scan.requested contract + **dedicated handler**" — handler exists नहीं करता; claim false बना हुआ है |

---

## 3. Contract Compatibility Findings

### A. Security-scan task contract — NO ISSUE
- चारों fields (`schema_version` const 1, `event_id`, `aggregate_id`, `trace_id`) मौजूद और required — `payload.builder.ts:19-27` के output से exact match; builder `trace_id` कभी null नहीं छोड़ता (event_id fallback), इसलिए `trace_id` required रखना compatible।
- `aggregate_id` description `"uploaded_documents.id"` — `AGGREGATE-ID-SEMANTICS.md:27` से match।
- Storage URL/signed URL/token/credential/file content — कुछ भी नहीं; Stage-1 Decision 2 compliant।
- FastAPI lookup behavior से compatible: worker `aggregate_id` से DB read करेगा (existing pattern `task_handlers.py:140-143`)।
- Micro-notes (LOW, F-07): title style "Security Scan Task V1" sibling contracts ("Resume Parse Task") से aligned, पर `$id` style sibling task contracts के relative `$id` (`contracts/tasks/...`) से अलग URI style है; pydantic future model `trace_id: str | None = None` होगा जबकि contract required — builder guarantee के कारण runtime issue नहीं, पर parity test में ध्यान रहे।

### B. Security-scan event contract amendment — NO ISSUE (with notes)
- `storage_url` removal **correct**: Stage-1 Decision 2 (document-ID-only) binding; worker DB से metadata पढ़ेगा।
- **Draft vs deployed distinction:** producer (04-nestjs-api) अभी exists नहीं करता, G-1 producer freeze PENDING (`G1-ENVELOPE-ALIGNMENT.md:3`) — यह contract कभी release/deploy नहीं हुआ। इसलिए v1 in-place amendment legitimate है; नए v2/event-type की जरूरत नहीं। Codex Decision B यही कहता है — सही।
- बाकी envelope intact: full outbox shape (`aggregate_type`, `event_type`, `payload`, `occurred_at`), `additionalProperties:false`।
- **Notes:**
  - `_draft_note:63` में amendment record नहीं — recommended कि note में "storage_url removed per Stage-2 Decision B (2026-08-26)" line add हो (traceability)।
  - `payload.guest_upload_session_id:47` description "**Guest session token**" — event payload में token-जैसी language security smell है (F-05); DB में यह `guest_upload_sessions.id` UUID FK है (`06_documents.sql:75`), token नहीं। Description fix recommended।

### C. Candidate resume parsed event — BLOCKER (envelope)
- Payload fields 100% code-proven (`task_handlers.py:275-286`): `candidate_id`, `reason:"active_resume_parsed"` (const), `trace_id` — कोई invented field नहीं। ✅
- `aggregate_type="candidate"`, `aggregate_id`=candidate UUID, `event_type` const — `AGGREGATE-ID-SEMANTICS.md:35` से match। ✅
- Conditional emission (guest/no-candidate पर event नहीं) — description "emitted ... after a candidate resume parse completes successfully" acceptable, पर explicit "not emitted when no candidate is linked" note बेहतर होगा (LOW)।
- 🔴 **F-01:** Envelope incompatible with actual outbox row:
  - `event_id` contract में है ही नहीं — पर emission `outbox_events` INSERT है जहाँ `id UUID PRIMARY KEY NOT NULL` (`15_infrastructure.sql:24`); sibling Phase-2 event contracts (security-scan-requested:7, interview-summary-requested) `event_id` require करते हैं।
  - `occurred_at` missing — `outbox_events.occurred_at NOT NULL DEFAULT NOW()` (`15_infrastructure.sql:34`)।
  - `schema_version` property में है पर `required:7` में नहीं — हर sibling contract required रखता है; outbox column NOT NULL (`:30`)।
  - Impact: actual emitted row इस contract को validate नहीं करेगी (extra fields `additionalProperties:false` से reject होंगे)।

### D. Security scan result schema — HIGH
- Good: bounded fields (threats maxItems 20, string caps), `additionalProperties:false` हर level पर, no raw content/PII/secret fields, `security_scan_status` authoritative (schemas/README.md:8)।
- 🟠 **F-02a:** `verdict` enum `["clean","infected","quarantined","error"]` — user-approved Stage-1 Decision 4 और Codex Decision D दोनों allowed values `clean | infected | error` freeze करते हैं। `quarantined` **invented addition** है: (i) DB enum में `quarantined` document lifecycle status है (`02_enums.sql:527-529`) जो infected documents के quarantine action से set होता है — scanner verdict नहीं; (ii) किसी approved decision में नहीं। Fix: enum से हटाओ, या explicit user decision लो (तो consolidated doc amend हो)।
- 🟠 **F-02b:** `scanner` shape deviation — approved Decision 4 shape `{provider, engine_version, signature_version}`; contract में `{provider, version}`। Codex Decision D का generic "scanner/provider/version" wording cover करता है, पर signature-version freshness audit metadata खोता है (AV context में important)। User decision: simplified बनाए रखें या approved shape restore करें।
- **Fields produced/consumed today: कोई नहीं** — scanner handler missing; यह pure contract-first schema है। Legitimate per drafts-till-tests rule, पर "implementation completeness" section में tracked।
- `file_size_bytes` approved Stage-1 shape में था, consolidated Decision D में नहीं, contract में नहीं — consistent omission, NO ISSUE (flag केवल इसलिए कि earlier reviews में था)।

### E. JSON Schema convention — NO ISSUE / LOW
- चारों नए files Draft 2020-12 + `$id` URI — Phase-2 convention से consistent। ✅
- कोई भी draft-07 contract touch नहीं हुआ — `git status` से confirmed (सिर्फ security-scan-requested modified)। ✅
- `required`/`additionalProperties` discipline सभी नए files में ठीक; issue सिर्फ F-01 (missing required fields)।
- LOW: root `contracts/README.md:7-11` में `schemas/` area listed नहीं — Decision D ने `schemas/README.md` **या** root README allow किया था और schemas/README बना है, तो technically compliant; root README sync recommended (AGENTS.md: doc-sync rule)।

---

## 4. Security Findings

| ID | Finding | Severity |
|---|---|---|
| S-1 | Task/event/result तीनों contracts से signed URLs, tokens, credentials, file content excluded — Stage-1 non-negotiables compliant | NO ISSUE |
| S-2 | `security-scan-requested.v1.json:45-48` `guest_upload_session_id` description "Guest session token" — payload में token language; actual value session-row UUID है। Description fix करो; token कभी payload में न हो | LOW |
| S-3 | `security_scan_result` schema में raw content/secrets structurally impossible (closed schema) — good; schema-level description भी यह कहता है | NO ISSUE |
| S-4 | Clean gate अभी भी bypassable — scanner handler missing होने से `security_scan_status='clean'` DB-writable; contract drafts यह fix नहीं करते (Stage 7 implementation dependency) | MEDIUM (carry-over, tracked) |
| S-5 | Result schema में `error.code`/`retryable` — bounded, safe message pattern; पर producer को instruction चाहिए कि error message में path/PII न डाले (consumer-side validation test से enforce होगा) | LOW |

---

## 5. Dispatcher / FastAPI Integration Findings

| ID | Finding | Severity |
|---|---|---|
| I-1 | `event-route.registry.ts:82` अभी भी `contracts/events/security-scan-requested.v1.json` reference करता है — अब dedicated task contract **exists** करता है, reference stale/wrong हो चुका। Decision F fix pending (planned) | BLOCKER (freeze से पहले mandatory) |
| I-2 | `/internal/tasks/security/scan` FastAPI में absent (0 matches); `SecurityScanTaskPayload` absent — contract drafts valid हैं पर endpoint dead है | HIGH (implementation dependency, planned Stage 7) |
| I-3 | `payload.builder.ts` चारों contract fields preserve करता है; uniform builder किसी route-specific change के बिना security route support करेगा | NO ISSUE |
| I-4 | **Projection loop:** `candidate.projection.rebuilt` route (:85-89) अभी भी registered — FastAPI output event वापस उसी endpoint पर dispatch होगा; नया event_id `processed_events` dedupe bypass करेगा → rebuild loop risk कायम। Decision F removal pending | BLOCKER (freeze से पहले mandatory) |
| I-5 | Route removal के side-effects: `routing.spec.ts:8-21` exact-8-route assertion, `:12` candidate.projection.rebuilt entry; registry count test `:70-73` (8) — removal पर tests update mandatory। साथ में `AGGREGATE-ID-SEMANTICS.md:36` row documentation-only रहेगी (output event semantics) — delete नहीं करनी | HIGH (change-plan में शामिल करो) |
| I-6 | `G1-ENVELOPE-ALIGNMENT.md:90` "dedicated handler" DONE claim false — handler absent; registry header comments (:11-12, :57) भी अभी false | MEDIUM |
| I-7 | Queue provisioning: `security-scan-queue` artifact अभी भी missing (`06-google-cloud-tasks-queue/` सिर्फ projection-queue); Decision G pending | HIGH (E2E से पहले mandatory) |
| I-8 | Contract validation tests: dispatcher का contract-path regex सिर्फ Phase-1 (`routing.spec.ts:48-52`); FastAPI में jsonschema/contract parity tests 0 — दोनों planned deliverables, NOT STARTED | HIGH (freeze gate) |

---

## 6. Invented / Missing / Contradictory Fields

**Invented (हटाओ या user-approve करो):**
1. `security-scan-result.v1.json:10` — verdict `"quarantined"`: approved decision set (`clean|infected|error`) में नहीं; DB का document-status enum value scanner-verdict में mix हुआ (F-02a)।

**Missing (add करो):**
2. `candidate-resume-parsed.v1.json` — `event_id` और `occurred_at` properties+required; `schema_version` required में (F-01)।
3. `schemas/tasks.py` — `SecurityScanTaskPayload` (Stage 7)।
4. `06-google-cloud-tasks-queue/` — `security-scan-queue` artifact।

**Contradictory (record बनाओ):**
5. Consolidated doc fact #2 "`security-scan-task.v1.json` missing" अब stale — doc खुद drafts CREATED कहता है, पर facts section update नहीं हुआ।
6. Decision D shape (engine_version/signature_version) vs contract scanner {provider, version} (F-02b)।
7. `G1-ENVELOPE-ALIGNMENT.md:90` handler DONE claim vs actual absence (I-6)।

---

## 7. Exact Required Changes (freeze से पहले)

**Contract drafts (approval के साथ):**
1. `candidate-resume-parsed.v1.json`: `required` में `schema_version`, `event_id`, `occurred_at` add + properties में दोनों fields (uuid/date-time), full-outbox-envelope sibling pattern से align।
2. `security-scan-result.v1.json`: `verdict` enum से `quarantined` हटाओ (या explicit user decision record); scanner shape पर Decision D cross-check resolution record करो।
3. `security-scan-requested.v1.json`: `_draft_note` में amendment line; `guest_upload_session_id` description "session token" → "guest upload session row UUID"।
4. Root `contracts/README.md` में `schemas/` area add (optional but recommended)।

**Code (Decision F/G — drafts pass होने के बाद):**
5. `event-route.registry.ts:82` → `contracts/tasks/security-scan-task.v1.json`; :85-89 route removal; :11-12, :57 comments honest बनाओ।
6. `routing.spec.ts` route-count/list assertions + contract-path regex ALL_ROUTES तक update।
7. `G1-ENVELOPE-ALIGNMENT.md:90` wording fix (contract DRAFT, handler PENDING)।
8. `security-scan-queue.json` + deploy script provisioning artifact।
9. Contract validation tests (dispatcher schema-validate + file-existence; FastAPI pydantic↔contract parity; result-schema clean/infected/error cases)।

---

## 8. What Should NOT Be Changed

- कोई भी draft-07 contract (`resume-parse-requested`, `candidate-profile-changed`, `job-ai-enrichment-requested`, draft-07 task contracts) — G-1 producer freeze तक untouched रहें।
- `schema_version` values silently bump न हों (सब contracts const 1; amendment decision record के साथ ही change)।
- Task payload में storage path/signed URL कभी add न हो (Stage-1 Decision 2)।
- `candidate-resume-parsed` payload में code-proven 3 fields के अलावा कुछ invent न हो।
- `AGGREGATE-ID-SEMANTICS.md` की output-event rows delete न हों (route removal documentation को invalidate नहीं करता)।
- `payload.builder.ts` uniform shape — किसी route-specific field के लिए modify न हो।
- Missing handler को "implemented/done" न कहा जाए।

---

## 9. Stage-2 Readiness Verdict

**NOT READY FOR CONTRACT FREEZE**

Freeze gates (priority order):
1. F-01 envelope fix (BLOCKER) — actual outbox row से validation fail होगा
2. F-02 verdict/scanner shape resolution (HIGH) — user decision से
3. Registry corrections + projection route removal + test updates (I-1, I-4, I-5)
4. Queue provisioning artifact (I-7)
5. Contract validation tests pass (I-8) — drafts तब तक drafts रहेंगे

---

## 10. Draft Correctness vs Implementation vs Production Readiness

| Dimension | Status | Basis |
|---|---|---|
| **Contract draft correctness** | ~90% — 2 drafts में deviations (F-01 BLOCKER, F-02 HIGH); task contract और event amendment correct | Section 3 |
| **Implementation completeness** | NOT STARTED — registry fix, route removal, `SecurityScanTaskPayload`, scan handler, queue artifact, tests सब pending (codex doc खुद कहता है: code changes NOT STARTED) | Section 5, 7 |
| **Production readiness** | दूर — producer (NestJS) absent, scanner handler absent, OIDC prod enforcement checklist pending, queue live-state verify pending | Stage 6/7 scope |

**Final:** Drafts की architecture/direction sound है; F-01/F-02 fix + Section 7 items के बाद ही `CONTRACTS FROZEN` mark हो। तब तक सभी नई files **contract drafts** हैं — इन्हें implement कर चुका या freeze हुआ न माना जाए।
