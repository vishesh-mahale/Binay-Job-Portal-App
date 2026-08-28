# Stage 2 Independent Contract Review

**Reviewer:** Qoder (Independent Senior API-Contract / Distributed-Systems Architect)
**Date:** 2026-08-25
**Scope:** `s1/codex/STAGE-02-CONTRACT-INVENTORY-AND-GAP-ANALYSIS.md` का independent audit। हर claim actual contract files, executable SQL, dispatcher/FastAPI code से verify किया गया; किसी previous agent claim पर भरोसा नहीं किया।
**Inputs read:** AGENTS.md, STAGE-01-FOUR-DECISIONS-CONSOLIDATED.md, 06_documents.sql, 07_resume_processing.sql, 15_infrastructure.sql, contracts/README.md, contracts/events/* (12), contracts/tasks/* (6), AGGREGATE-ID-SEMANTICS.md, G1-ENVELOPE-ALIGNMENT.md, event-route.registry.ts, routing/payload.builder.ts, routing.spec.ts, task_handlers.py, schemas/tasks.py, 07-fastapi README, tests inventory, 06-google-cloud-tasks-queue/।
**Note:** Prompt में `src/payload.builder.ts` path था; actual path `src/routing/payload.builder.ts` है (minor prompt typo, substance unaffected)।
**Edits:** कोई contract/SQL/code edit नहीं — यह audit-only report है।

---

## 1. Verdict

**APPROVED WITH CHANGES**

Draft inventory factually accurate है — कोई invented contract/field नहीं मिला। लेकिन contract freeze से पहले Section 8 के corrections जरूरी हैं: 4 नए contract files create, registry reference fix, `storage_url` treatment पर user decision, और result-schema location approval।

---

## 2. Verified Correct Points

| Point | Repository Evidence | Result |
|---|---|---|
| Uniform task payload shape (4 fields) | `payload.builder.ts:12-27`; सभी 6 `contracts/tasks/*.v1.json` में `required: [schema_version, event_id, aggregate_id, trace_id]` + `additionalProperties:false`; test `routing.spec.ts:104-131` (payload-leak guard included) | ✅ Verified |
| `security-scan-task.v1.json` missing | `contracts/tasks/` glob — सिर्फ 6 files; security-scan absent | ✅ Gap confirmed |
| `candidate-resume-parsed.v1.json` missing | `contracts/events/` glob — file absent; semantics frozen at `AGGREGATE-ID-SEMANTICS.md:35` (aggregate = candidate UUID) | ✅ Gap confirmed |
| Registry event-contract-as-taskContract | `event-route.registry.ts:82` `taskContract: 'contracts/events/security-scan-requested.v1.json'`; Phase 1 routes सब `contracts/tasks/...` point करते हैं (:39,45,51) | ✅ Mismatch confirmed |
| `security.scan.requested` aggregate semantics | `AGGREGATE-ID-SEMANTICS.md:27`: aggregate_type `uploaded_document`, aggregate_id = uploaded document UUID | ✅ Verified |
| `payload.storage_url` required + signed-URL ambiguity | `security-scan-requested.v1.json:33,40-44` ("GCS/S3 signed URL or object path") | ✅ Conflict real है |
| Stage-1 approved document-ID-only payload | `STAGE-01-FOUR-DECISIONS-CONSOLIDATED.md:89-115` (Decision 2, user-approved) | ✅ Binding direction |
| `security_scan_result` JSONB support | `06_documents.sql:85` nullable JSONB; `:100-102` object-type CHECK | ✅ Verified |
| Approved result shape (verdict clean\|infected\|error, `error` nullable) | `STAGE-01-FOUR-DECISIONS-CONSOLIDATED.md:154-193` (Decision 4, user-approved) | ✅ Binding shape |
| Draft-version mismatch | `security-scan-requested.v1.json:2` = 2020-12; `resume-parse-requested.v1.json:2` = draft-07; tasks में भी mix (`resume-parse-task` draft-07 vs `job-screening-questions-task` 2020-12) | ✅ Verified — repo convention currently mixed |
| FastAPI `candidate.resume.parsed` emission | `task_handlers.py:275-286`: aggregate_type=`candidate`, aggregate_id=candidate_id, payload = `{candidate_id, reason:"active_resume_parsed", trace_id}` — **conditional** (`if candidate_id_for_event`) | ✅ Code verified |
| Queue provisioning gap | `06-google-cloud-tasks-queue/` में सिर्फ `projection-queue.json` + `deploy-queue.sh`; `security-scan-queue` और `ai-heavy-queue` का कोई artifact नहीं | ✅ Gap confirmed |
| G-1 envelope alignment pending | `G1-ENVELOPE-ALIGNMENT.md:3` status PENDING (blocked by producer freeze) | ✅ Verified |
| Security route queue/endpoint values | `event-route.registry.ts:79-83` + test `routing.spec.ts:65-67` (`security-scan-queue`, `/internal/tasks/security/scan`) | ✅ Consistent |
| Draft के non-goals respected | कोई contract file modified नहीं (git-state read verification) | ✅ Verified |

---

## 3. Incorrect or Unsupported Claims

| Claim | Actual Evidence | Severity | Required Action |
|---|---|---|---|
| `event-route.registry.ts:11-12,55-57` comments: "Endpoint paths verified against task_handlers.py" / "FastAPI handlers verified" | `/internal/tasks/security/scan` handler exists नहीं करता (0 matches `app/` में); `schemas/tasks.py` में `SecurityScanTaskPayload` भी नहीं | 🔴 HIGH | Comment fix (AGENTS.md: exact conflict report mandatory); Stage-2 freeze language में "verified" avoid |
| `routing.spec.ts:48-52` — contract-path regex test सिर्फ `PHASE_1_ROUTES` पर | Security route (`contracts/events/...`) यह pattern fail करती, पर test scope से बाहर — false confidence | 🟡 MEDIUM | Test को ALL_ROUTES पर extend करो (task-contract creation के बाद) |
| Draft inventory line 28: `candidate-projection-rebuilt.v1.json` — "verify producer/task boundary" | स्थिति draft ने कही तो सही, पर actual risk बड़ा है: `candidate.projection.rebuilt` एक **output** event है (FastAPI emit करता है, `README.md:140`), फिर भी registry:85-89 इसे input route की तरह उसी endpoint `/internal/tasks/candidate/projection` पर register करती है — re-dispatch loop design question | 🔴 HIGH | Intent verify करो: यह route consumer कौन? Loop risk report (→ GAP-S2-07) |
| `G1-ENVELOPE-ALIGNMENT.md:66-69` action item: "Create 3 Phase 1 trigger event contracts" | तीनों flat draft-07 form में already exist करते हैं (`resume-parse-requested`, `candidate-profile-changed`, `job-ai-enrichment-requested`) — G1 doc partially stale | 🟢 LOW | G1 doc wording sync (creation नहीं, alignment बाकी है) |
| Draft line 30: `candidate-resume-parsed` "worker output event documented/emitted" | Emission verified, पर **conditional** है — guest/no-candidate upload पर event emit ही नहीं होता (`task_handlers.py:275`) | 🟡 MEDIUM | Contract में conditional emission explicitly document करो; "हर parse completion पर event" claim invent न करो |

---

## 4. Contract Gaps

### GAP-S2-01 — `contracts/tasks/security-scan-task.v1.json` missing
- **Exact source:** `contracts/tasks/` (6 files, security absent); registry:82 wrong reference
- **Problem:** Dispatcher जो body भेजता है (`TaskPayloadV1`) उसका security route के लिए कोई contract नहीं।
- **Impact:** Registry traceability गलत; worker-side validation contract absent।
- **Recommendation:** नया file, मौजूदा 6 task contracts का exact clone — 4 required fields, `additionalProperties:false`, `aggregate_id` description = "The uploaded_document UUID"। Draft convention: 2020-12 (Phase-2 style) — see GAP-S2-05।
- **User decision required:** नहीं — shape evidence-decided (Stage-1 Decision 2)।

### GAP-S2-02 — `security-scan-requested.v1.json` में `payload.storage_url` treatment
- **Exact source:** `security-scan-requested.v1.json:33,40-44`; conflict: `STAGE-01-FOUR-DECISIONS-CONSOLIDATED.md:104-109` (document-ID-only approved)
- **Problem:** Event payload में required `storage_url` — signed URL semantics expiry risk और approved decision से inconsistent।
- **Options:**
  (a) `storage_url` required से हटाओ, optional + description "storage object path only (never a signed URL)";
  (b) पूरी तरह remove — payload में सिर्फ `document_id` (+ user/session identity, trace_id);
  (c) status-quo।
- **Recommendation:** **(b) remove** — worker DB से `storage_bucket/storage_path` पढ़ेगा (`task_handlers.py:140-143` existing pattern); event payload में path रखना duplication + drift risk है। Producer freeze (G-1) अभी pending है और producer code exists नहीं करता, इसलिए यह breaking-change-with-new-version का मामला नहीं — pre-freeze correction है।
- **User decision required:** हाँ (existing file modify होने वाला है)।

### GAP-S2-03 — `contracts/events/candidate-resume-parsed.v1.json` missing
- **Exact source:** `AGGREGATE-ID-SEMANTICS.md:35` (semantics frozen, file नहीं); `task_handlers.py:275-286`
- **Proven fields (code से — कुछ भी invent नहीं):**
  Envelope: `schema_version`, `event_id`, `aggregate_type="candidate"`, `aggregate_id` (candidate UUID), `event_type="candidate.resume.parsed"`, `occurred_at`
  Payload: `candidate_id` (uuid), `reason` (observed const `"active_resume_parsed"`), `trace_id` (uuid)
- **Impact:** Downstream consumers (projection trigger, UI recovery) के लिए shared contract नहीं; हर consumer code-inspect करता रहेगा।
- **Recommendation:** Full outbox envelope (Phase-2 style) में create; conditional emission note mandatory — guest/no-candidate parse पर event emit नहीं होता (REST/DB recovery authoritative, PD-002/DECISION-02)।
- **User decision required:** हाँ (field set + `reason` enum freeze)।

### GAP-S2-04 — `security_scan_result` schema location/versioning
- **Exact source:** `STAGE-01-FOUR-DECISIONS-CONSOLIDATED.md:193`; `contracts/README.md:7-11` सिर्फ `api/`, `events/`, `tasks/` areas define करता है
- **Problem:** Proposed `contracts/schemas/security-scan-result.v1.json` एक नया area (`schemas/`) introduce करता है जो README convention में नहीं है।
- **Options:** (a) नया `contracts/schemas/` area + README update; (b) `contracts/tasks/` में रखो (misleading — यह task payload नहीं); (c) सिर्फ doc-level spec, JSON Schema file नहीं।
- **Recommendation:** **(a)** — यह reusable validation schema है (DB JSONB shape), events/tasks से अलग category; README में area add करो।
- **Shape binding source:** Consolidated Decision 4 (verdict `clean|infected|error`; `status=failed ⇒ verdict=error` bounded error metadata; clean ⇒ `threats=[]`; infected ⇒ threat names only; कभी raw content/PII/secrets/signed URLs नहीं)।
- **Conflict note:** कुछ earlier agent reviews (मेरे Stage-1 review सहित) ने `error` verdict के बजाय "failure पर result NULL" shape propose किया था — **user-approved consolidated shape ही binding है**; Stage 2 उसे ही freeze करे।
- **User decision required:** हाँ (location approval)।

### GAP-S2-05 — JSON Schema draft convention
- **Exact source:** Section 2 row 10 evidence
- **Problem:** Repo में दो conventions coexist: Phase-1 era (draft-07, flat, no `$id`) vs Phase-2 era (2020-12, `$id` URI, PascalCase title, full envelope)।
- **Recommendation:** नए contracts के लिए **2020-12 + full envelope** convention record करो (`contracts/README.md` या G1 doc में); मौजूदा draft-07 contracts को अभी touch न करो — producer freeze (G-1) के बाद alignment, वरना unnecessary churn। Breaking change होने पर contracts/README:13-14 rule: नया version।
- **User decision required:** हाँ (convention record)।

### GAP-S2-06 — Registry `taskContract` references
- **Exact source:** `event-route.registry.ts:82` (security), `:88` (`candidate.projection.rebuilt` भी event contract reference करती है)
- **Recommendation:** GAP-S2-01 file बनने के बाद :82 → `contracts/tasks/security-scan-task.v1.json`। `:88` का treatment GAP-S2-07 resolution पर depend करता है। साथ में false "verified" comments fix (Section 3 row 1)।
- **User decision required:** नहीं (code fix, contract content unaffected)।

### GAP-S2-07 — `candidate.projection.rebuilt` route boundary
- **Exact source:** `event-route.registry.ts:84-89`; `AGGREGATE-ID-SEMANTICS.md:36` (chained output event); `07-fastapi README.md:140`
- **Problem:** FastAPI projection handler `candidate.projection.rebuilt` emit करता है; registry उसी event को वापस `/internal/tasks/candidate/projection` पर route करती है। हर नया event नया `event_id` लाता है, इसलिए `processed_events` idempotency इसे dedupe नहीं करेगी → potential rebuild loop।
- **Impact:** आज non-operational (producer/handler partially pending), पर contract freeze से पहले boundary clear होना mandatory।
- **Options:** (a) route हटाओ — output event को downstream consumer (future) तक registry में मत रखो; (b) अलग consumer endpoint define करो; (c) intentional re-projection — evidence दो।
- **User decision required:** हाँ (intent question)।

### GAP-S2-08 — Queue provisioning artifacts
- **Exact source:** `06-google-cloud-tasks-queue/` (सिर्फ projection-queue)
- **Problem:** `security-scan-queue` और `ai-heavy-queue` दोनों registry में used, repo artifact दोनों का missing।
- **Recommendation:** `security-scan-queue.json` + deploy script extension Stage-2 deliverables में add; GCP live state अलग से verify (repo evidence ≠ live state)।
- **User decision required:** नहीं (artifact creation — approval के बाद)।

### GAP-S2-09 — Contract validation tests missing
- **Exact source:** `07-fastapi-ai-worker/tests/` — 77 files; `jsonschema`/contracts references के 0 matches (सिर्फ README table)। Dispatcher side: `routing.spec.ts` contract-path check Phase-1-only।
- **Impact:** Contract drift silently possible — pydantic `schemas/tasks.py` और `contracts/tasks/*.json` parity आज किसी test से guarded नहीं।
- **User decision required:** नहीं (test plan Section 7 में)।

### GAP-S2-10 — `resume-parse-requested.v1.json` event/task boundary confusion
- **Exact source:** file content (flat 4+2 fields) लगभग `resume-parse-task.v1.json` जैसा; `G1-ENVELOPE-ALIGNMENT.md:16`
- **Problem:** `events/` folder में task-shaped flat contract — event/task boundary ambiguous। Aggregate semantics भी अलग: event का aggregate = parsing job UUID (`AGGREGATE-ID-SEMANTICS.md:14`), जो G1 target table से match करता है।
- **Recommendation:** G-1 producer freeze तक status-quo; freeze के बाद full-envelope rewrite (v1 amendment pre-producer safe)। अभी edit NOT RECOMMENDED।
- **User decision required:** नहीं (G1 gate पर already tracked)।

---

## 5. Proposed Contract Changes

| # | Change | Marking |
|---|---|---|
| 1 | Create `contracts/tasks/security-scan-task.v1.json` (uniform 4-field) | **REQUIRED** |
| 2 | Create `contracts/events/candidate-resume-parsed.v1.json` (proven fields only, Section 4 GAP-S2-03) | **REQUIRED** |
| 3 | Create `contracts/schemas/security-scan-result.v1.json` + `contracts/README.md` area update | **NEEDS USER DECISION** (location) |
| 4 | Edit `security-scan-requested.v1.json` — `storage_url` remove/optional (GAP-S2-02) | **NEEDS USER DECISION** |
| 5 | Registry `taskContract` fix + false comments fix (`event-route.registry.ts`) | **REQUIRED** (code, post-contract) |
| 6 | `routing.spec.ts` contract checks ALL_ROUTES तक extend + contract-file-existence test | **REQUIRED** (test) |
| 7 | `resume-parse-requested.v1.json` full-envelope rewrite | **NOT RECOMMENDED** अब (G-1 producer freeze gate) |
| 8 | Draft-07 contracts का bulk 2020-12 migration | **NOT RECOMMENDED** अब (no producer; churn) |
| 9 | `candidate.projection.rebuilt` route removal/clarification | **NEEDS USER DECISION** (GAP-S2-07) |
| 10 | `schemas/tasks.py` में `SecurityScanTaskPayload` pydantic class | **REQUIRED** (worker-side, Stage 7 handler के साथ) |

---

## 6. Security and PII Review

1. **Signed URL in event payload** (`security-scan-requested.v1.json:40-44`) — async execution तक expiry + credential-adjacent semantics। Approved direction (document-ID-only) को contract में reflect करो; object-path semantics ही freeze हों।
2. **`security_scan_result` content policy** — consolidated Decision 4 rules binding: threat names only; error metadata bounded (`error_code` + safe message); resume text/credentials/signed URLs कभी नहीं। Schema में इन्हें prevent करने वाली constraints (additionalProperties:false + explicit properties) हों।
3. **Payload opacity test already exists** — `routing.spec.ts:120-130` ("never leaks outbox payload content into the task payload") — अच्छा defense; security-scan route पर भी यही guarantee apply होती है क्योंकि builder uniform है।
4. **Conditional `candidate.resume.parsed` emission** — guest/no-candidate upload पर event नहीं; consumers को DB/REST recovery पर rely करना होगा (DECISION-02 frozen: DB authoritative)। Contract में यह behavior document हो ताकि कोई consumer "event guaranteed" assume न करे।
5. **OIDC chain** — dispatcher attach (`cloud-tasks.publisher.ts:64-70`) → worker validate (`task_handlers.py:114-120`)। नया security-scan task इसी chain से चलेगा; contract flow compatible। Production checklist में `OIDC_AUTH_ENABLED=true` enforcement mandatory (Stage-1 review carry-over)।
6. **Clean gate bypassability** — scanner handler missing होने से `security_scan_status='clean'` DB-level writable है; contract freeze यह risk remove नहीं करता — Stage 7 implementation ही fix है।

---

## 7. Dispatcher/Worker Compatibility Review

1. **Publisher topology:** `cloud-tasks.publisher.ts:47-53` single `fastapiWorkerUrl` — security-scan task उसी service/URL पर जाएगा; queue अलग (`security-scan-queue`), URL same। Compatible, कोई publisher change नहीं चाहिए।
2. **Payload builder:** uniform `TaskPayloadV1` — नया task contract shape identical होने से builder/publisher दोनों untouched रहेंगे (`payload.builder.ts:19-27`)।
3. **Worker readiness:** `schemas/tasks.py` में 6 payload classes हैं, `SecurityScanTaskPayload` नहीं; endpoint `/internal/tasks/security/scan` implement नहीं। Contract freeze code से आगे हो सकता है (contract-first), पर Stage 2 completion claim में handler "done" नहीं कहा जाएगा।
4. **Idempotency compatibility:** deterministic task name `task-{sha256(event_id:route)}` + ALREADY_EXISTS dedup (`cloud-tasks.publisher.ts:95-106`) — route_key नया endpoint होगा, naming scheme unaffected।
5. **Queue provisioning:** `security-scan-queue` artifact missing (GAP-S2-08) — E2E से पहले mandatory; live GCP state repo evidence से prove नहीं होता।
6. **Contract testing plan (needed):**
   - Dispatcher: `routing.spec.ts` — ALL_ROUTES `contracts/tasks/` pattern + referenced file existence check
   - Dispatcher: sample outbox row → `buildTaskPayload` → task contract JSON Schema validation (security-scan included)
   - Worker: pydantic `SecurityScanTaskPayload` ↔ `security-scan-task.v1.json` parity test
   - Worker: `security_scan_result` writer को `security-scan-result.v1.json` से validate करने वाला unit test (clean/infected/error तीनों cases)
   - Producer (NestJS, build होने पर): outbox payload → event contract validation gate

---

## 8. Required Changes Before Contract Freeze

1. User decisions record करो: GAP-S2-02 (`storage_url`), GAP-S2-03 (output contract fields), GAP-S2-04 (schema location), GAP-S2-05 (draft convention), GAP-S2-07 (projection.rebuilt route intent)।
2. `event-route.registry.ts:11-12,55-57` false "verified" comments fix (handler exists नहीं करता)।
3. चार नए contract files create (Section 5 #1-3 + README area update) — approval के बाद।
4. Registry `taskContract` reference fix + `routing.spec.ts` Phase-2 coverage extend।
5. `security-scan-queue` provisioning artifact add (GAP-S2-08)।
6. `STAGE-02` draft का status resolutions के साथ update, तभी `CONTRACTS FROZEN` mark हो।

---

## 9. Final Recommendation

**क्या Stage 2 contract freeze किया जा सकता है?**
हाँ — **conditionally.** Draft inventory accurate है; freeze के लिए Section 8 के 6 items complete हों। 5 items user-decision-dependent हैं।

**कौन-से points पहले resolve होंगे?**
Priority: (1) registry false comments fix (factually wrong, तुरंत) → (2) GAP-S2-02/04 user decisions (existing file edit + नया area) → (3) GAP-S2-03 fields approval → (4) GAP-S2-07 route intent → (5) GAP-S2-05 convention record → (6) queue artifact।

**क्या actual contract files edit करना safe है?**
- **नए files बनाना safe** है (task contract, output contract, result schema) — कोई consumer आज depend नहीं करता।
- **`security-scan-requested.v1.json` edit pre-freeze safe** है (G-1 producer freeze pending, producer code absent) — पर user approval mandatory; `schema_version` silently bump न करो, amendment decision record करो।
- **मौजूदा draft-07 contracts touch करना safe नहीं/जरूरी नहीं** — producer freeze (G-1) के बाद ही; silent mutation contracts/README:13-14 versioning rule तोड़ेगी।

**Verdict:** `APPROVED WITH CHANGES` — user decisions + Section 8 corrections के बाद ही `STAGE 2 CONTRACTS FROZEN` किया जाए।
