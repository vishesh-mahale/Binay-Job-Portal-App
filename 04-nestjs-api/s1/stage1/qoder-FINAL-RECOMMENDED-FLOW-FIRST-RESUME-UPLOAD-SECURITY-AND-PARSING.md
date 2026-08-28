# Final Recommended Flow — First Resume Upload: Security Scan & Parsed Review Form

**Author:** Qoder (final consolidation of all s1 reviews)
**Date:** 2026-08-25
**Inputs consolidated:** `FIRST-RESUME-UPLOAD-SECURITY-AND-PARSING-FLOW-QUESTION.md`,
antigravity, arch-reviewer, cline, chatgpt, freebuf, opencode, qoder (first-round) reviews
**Method:** हर review पढ़ा + contested facts repository ground truth से re-verify किए।
कोई नई table / event / queue / contract invent नहीं की गई — सिर्फ existing structures use हुए हैं।

---

## 0. Executive Verdict

**Architecture: APPROVED.** सभी reviews core flow (sync validation → quarantine →
clean-gated parse → candidate confirm → canonical) पर agree करते हैं।
Note: scanner provider और ownership पर reviews की recommendations पूरी तरह identical
नहीं थीं — consolidated final position Section 3 में दी गई है।
Proposed flow — sync validation → quarantine upload → 202 ACK → async scan →
clean-only atomic parse handoff → FastAPI parse → review/edit form → candidate
confirm → canonical transaction — सही है और schema/contracts से fully compatible है।

**Implementation: NOT OPERATIONAL.** पाँचों reviews इस पर agree करते हैं कि security
scan stage (contract + queue + route मौजूद, consumer गायब) critical path पर missing है।
नीचे Section 5 में exact build order दिया है जिससे आगे बढ़ा जा सकता है।

Verified ground truth (re-checked during consolidation):
- `contracts/tasks/security-scan-task.v1.json` — **exists नहीं करता**; registry
  `event-route.registry.ts:79-83` event contract को `taskContract` के तौर पर reference
  करती है → payload mismatch risk (qoder/cline/freebuf का finding सही)।
- `contracts/events/candidate-resume-parsed.v1.json` — **missing**, जबकि
  `task_handlers.py` यह event emit करता है।
- FastAPI में `/internal/tasks/security/scan` endpoint **implemented नहीं** — सिर्फ
  resume parser का defensive `security_scan_status` reader (`task_handlers.py:141-166`) मौजूद है।
- Resume parsing side (idempotency, lease/claim, immutable result, retries) **fully implemented** है।

---

## 1. आठों questions के final answers

### Q1 — क्या NestJS upload के दौरान basic validation करे?
**हाँ — lightweight synchronous validation, यहीं रुक जाए।**
Auth + ownership (user XOR guest session), size limit, extension, declared MIME,
magic bytes (actual type), extension/MIME/signature consistency, SHA-256 checksum,
`(owner, checksum)` dedup। यह सब cheap/deterministic है — `NESTJS-IMPLEMENTATION-GUIDE.md`
§8 (lines 257-270) में already specified। Malware scanning यहाँ नहीं होगी।

### Q2 — Full malware scan sync या async?
**Async — सभी reviews इस पर converge हुए, कोई dissent नहीं।**
Reasons (सभी reviews converge):
- Question-file constraint: external scanner call open PostgreSQL transaction के अंदर नहीं।
- Schema (`security_scan_status` enum: pending/scanning/clean/infected/failed/quarantined,
  `02_enums.sql:527-529`; partial scan-queue index `06_documents.sql:144-146`)
  async lifecycle के लिए hard-wired है।
- Sync scan = 3-30s blocked HTTP socket, DoS vector, scanner outage = upload failure।
- Async = <200ms 202 ACK, quarantine semantics, Cloud Tasks retries, independent scaling।

### Q3 — Candidate को कौन-सा status/SSE flow मिलेगा?
**Persisted DB state = source of truth; SSE = realtime optimization; REST = recovery।**
(chatgpt का model — सभी के लिए binding बनाया जाता है)

UI progression (exact enum names existing schema से):
```text
uploaded → (scan) pending/scanning → clean → (parse) queued/processing/parsed → completed
```
- `uploaded_documents.security_scan_status` + `processing_status`
  (`resume_processing_status`: uploaded, queued, processing, parsed, ai_enriching,
  completed, failed, partial) — नए status invent नहीं करने।
- NestJS authenticated SSE नudge भेजे ("कुछ बदल गया"); UI हमेशा
  `GET /documents/:id/status` (या equivalent) से authoritative state refetch करे।
- Candidate offline होकर लौटे तो भी page-load refetch से `ready_for_review` दिखे —
  SSE miss होने पर UI कभी permanently stuck नहीं होनी चाहिए।

### Q4 — `resume.parse.requested` सिर्फ clean scan के बाद?
**हाँ — strict invariant, fail-closed।**
```text
security_scan_status != clean  →  NO resume.parse.requested (कभी नहीं)
scan failed / timeout          →  infected मत मानो; verdict नहीं मिला = retry path
infected / quarantined         →  terminal, safe user-facing message, parsing कभी नहीं
```
Double safety: FastAPI parser पहले से ही `security_scan_status` re-check करता है
(`task_handlers.py:149-171`: pending/scanning → 503 retryable; infected/quarantined → terminal fail)।

### Q5 — Scan→parse transition atomic और idempotent?
**हाँ — single DB transaction, scanner call transaction के बाहर।**
```text
[बाहर, कोई DB txn नहीं]  file download → scan → verdict
[एक ही transaction]
  UPDATE uploaded_documents
     SET security_scan_status = 'clean', security_scan_result = {...}
   WHERE id = :doc AND security_scan_status IN ('pending','scanning')   -- guard
  INSERT resume_parsing_jobs (idempotency_key UNIQUE, ...)
  INSERT outbox_events (event_type = 'resume.parse.requested')
COMMIT → dispatcher → Cloud Tasks → FastAPI
```
- Guarded UPDATE से duplicate completion (`clean → clean`) safe/no-op बनता है;
  parse event सिर्फ पहली successful transition पर बनता है।
- Crash safety: status और outbox event एक साथ commit होते हैं —
  "clean but parse कभी शुरू नहीं" और "parse event before clean" दोनों impossible।
- Cloud Tasks publish transaction के अंदर नहीं — outbox dispatcher का काम है।
- Transition का owner: **security scan handler खुद** (guide §9 का "trusted
  scan-completion handler" यही है)। NestJS callback की जरूरत नहीं।

### Q6 — Scanner unavailable / timeout / duplicate task / worker crash?
| Scenario | Handling |
|---|---|
| Scanner unavailable / timeout | `failed` मत समझो infected; retryable failure → Cloud Tasks bounded retry/backoff → exhaust होने पर `security_scan_status='failed'` + dead-letter/runbook (`RUNBOOK-DEAD-LETTER.md` pattern) |
| Crash scan के दौरान | Document `pending`/`scanning` में रहेगा (fail-closed)। Recovery sweeper (scheduled) stale `pending`/`failed` documents के लिए re-scan outbox event डाले — exact यही partial index `idx_uploaded_documents_scan_queue` (`06_documents.sql:144-146`) इसी के लिए बना है |
| Duplicate scan task | `processed_events('security_scanner', event_id)` check (resume parser वाला existing pattern) + Q5 का guarded transition |
| Duplicate parse task | Already handled: `processed_events` + `idempotency_key` + lease claim (`task_handlers.py:122-133`) |
| Parse worker crash | Already handled: stale lease reclaim (`locked_at < now()-10min`), attempt_number/max_attempts=3, immutable result |

Fail-closed rule: **no verified clean verdict → no parsing, कभी नहीं।**

### Q7 — Canonical profile update parser result से पहले रुके, enforcement?
**Application-level gate primary; existing enums से explicit बनाओ; DB trigger optional future hardening।**
- Parsing complete ≠ permission to mutate। असली invariant:
  `PARSED → REVIEWED/EDITED → CANDIDATE CONFIRMED → canonical mutation authorized`
- Schema में यह lifecycle पहले से model है — नई column की जरूरत नहीं:
  - `profile_fact_source` enum में `resume_ai` (`02_enums.sql:544-558`)
  - `profile_fact_verification_status` enum में `candidate_confirmed`
  - `parsing_event_type` में `retry_scheduled`, `failed` आदि
  Canonical commit transaction facts को `source=resume_ai` +
  `verification_status=candidate_confirmed` के साथ लिखे → provenance explicit और queryable।
- `resume_parsed_data` immutable है (trigger `reject_immutable_row_change`) —
  AI ने क्या निकाला vs candidate ने क्या confirm किया, दोनों अलग रहते हैं।
- नया DB trigger/`review_status` column = नया migration artifact → **human decision**,
  MVP blocker नहीं (constraint: existing structures के बाहर invent नहीं करना)।

### Q8 — Application-specific resume का flow अलग हो?
**Pipeline shared, downstream semantics अलग — सभी reviews agree।**
```text
Shared:      upload → validation → quarantine scan → parse (same infra, same gates)
Diverge:
  First profile resume   → review/edit form → candidate confirm → canonical profile
  Application resume     → application_documents → application_profile_snapshots
                           (canonical profile तब तक नहीं छूती जब तक candidate
                            explicitly profile sync न माँगे)
```

---

## 2. Final Recommended End-to-End Flow (frozen reference)

```text
[SYNCHRONOUS — NestJS]
Next.js POST resume upload
  → Auth (user XOR guest session) + ownership
  → Size / extension / MIME / magic-bytes / structural sanity / SHA-256 checksum
  → (owner, checksum) dedup check
  → Private Supabase Storage upload (quarantine = status-based, नया bucket नहीं)
  → BEGIN TX
      INSERT uploaded_documents (security_scan_status='pending', processing_status='uploaded')
      INSERT outbox_events ('security.scan.requested')
    COMMIT
  → HTTP 202 Accepted { document_id }          ← immediate ACK

[ASYNC — scan]
Outbox Dispatcher → Cloud Tasks (security-scan-queue)
  → Security Scan Handler  [POST /internal/tasks/security/scan — BUILD, Section 5]
      processed_events idempotency check
      file download → scan (provider-abstracted) — DB transaction के बाहर
      ├─ infected/quarantined → TX: UPDATE status (terminal) + safe user-facing message
      ├─ failed/timeout       → 503 → Cloud Tasks retry; exhaust → failed + sweeper
      └─ clean → TX (guarded, Section 1 Q5):
            status='clean' + security_scan_result + resume_parsing_jobs + outbox('resume.parse.requested')

[ASYNC — parse — EXISTS]
Dispatcher → Cloud Tasks (ai-heavy-queue) → FastAPI handle_resume_parse_task
  → processed_events → claim lease → re-check security_scan_status='clean'
  → safe extraction (page/text limits, timeout, prompt-injection defence) → AI parse
  → TX: INSERT resume_parsed_data (immutable) + artifacts + events
        + processed_events + mark_completion (+ candidate.resume.parsed outbox when applicable)

[STATUS — NestJS]
DB state = truth; authenticated SSE nudge + REST status endpoint (recovery)

[CONFIRM — NestJS]
Next.js GET parsed data → Review/Edit form auto-fill → candidate edits
  → "Confirm & Save" → BEGIN TX
      canonical tables (candidate_profiles/skills/experiences/educations)
      facts with source=resume_ai, verification_status=candidate_confirmed
      profile_change_history + bump profile_revision + outbox('candidate.profile.changed')
    COMMIT
```

---

## 3. Scanner ownership + provider — consolidated decision

Reviews में यही सबसे बड़ा open question था। Final recommendation:

**Handler location: FastAPI AI worker में dedicated security-scan module**
(`app/api/v1` में नया handler, parser से अलग module)।
- Dispatcher route/queue/endpoint path पहले से registered है → zero routing change।
- अलग `security-scan-queue` topology बरकरार → scan और parse independently scale होते हैं
  (qoder-review का queue-separation concern भी satisfy)।
- Same trust boundary: private OIDC-authenticated internal endpoint (existing pattern)।
- नया microservice = नया deployment/ops burden — MVP में जरूरी नहीं।
  Future में अलग service में move करना contract-compatible होगा क्योंकि scanner
  provider interface से decoupled रहेगा।

**Provider: abstraction layer (`ScanProvider` interface) — verdict: clean/infected/failed + engine metadata।**
- Dev: mock/deterministic scanner — environment-restricted flag
  (`settings.SECURITY_SCAN_MODE` जैसा pattern; existing `OIDC_AUTH_ENABLED` precedent)।
  Production में flag से scan disable होना कभी possible नहीं होना चाहिए — fail-closed।
- Prod: ClamAV (self-hosted, cheap, no data-sharing, high ops) vs managed scanner
  (low ops, per-file cost, data-residency review) — **final vendor = human decision**,
  लेकिन architecture provider-agnostic है, इसलिए यह decision implementation को block नहीं करता।

**Deliberately rejected alternatives:**
- Resume parse task के अंदर ही पहली बार malware scan करना — rejected। Clean-before-parse
  boundary कमज़ोर होती है और scanner/parser responsibilities mix होते हैं; `security-scan-queue`
  vs `ai-heavy-queue` separation भी टूटता है।
- Browser/client-side scan को trusted security boundary मानना — rejected। Client trusted नहीं है;
  scan verdict हमेशा server-side trusted handler से आएगा।

---

## 4. Contract fixes (handler लिखने से पहले, mandatory)

| # | Fix | Why |
|---|---|---|
| C1 | `contracts/tasks/security-scan-task.v1.json` बनाओ | Registry event contract को taskContract मान रही है → payload mismatch |
| C2 | `event-route.registry.ts:82` को C1 की ओर point करो | Documentation-vs-reality drift (`line 11` का "endpoint verified" claim false है) |
| C3 | `contracts/events/candidate-resume-parsed.v1.json` बनाओ | FastAPI emit करता है, contract गायब |
| C4 | JSON Schema draft align करो (security-scan: 2020-12 vs resume-parse: draft-07) | Tooling consistency |
| C5 | `security-scan-requested.v1.json` producer freeze (G-1 `_draft_note` clear) | Producer (NestJS) बनाने से पहले contract stable हो |
| C6 | Scan result provenance: `security_scan_result` JSONB में engine/verdict/timestamp structure freeze करो | Audit trail |

---

## 5. Build order — आगे कैसे बढ़ें

**Phase A — Contracts (blocker, ~1 दिन)**
C1–C6 ऊपर। इन्हें पहले freeze करो; बाकी सब इन्हीं पर depend करता है।

**Phase B — Security scan handler (critical path)**
1. FastAPI: `POST /internal/tasks/security/scan` handler — `SecurityScanTaskPayload` schema,
   `processed_events('security_scanner', event_id)` idempotency, provider interface + mock scanner।
2. Atomic guarded completion transaction (Section 1 Q5) — clean → status + parsing job + outbox।
3. Terminal paths (infected/quarantined) + retry semantics (503 on transient)।
4. Tests: existing `test_task_handlers.py` pattern follow करो (pending/infected/clean cases)।

**Phase C — NestJS upload path**
1. Upload controller + validation pipes (size/MIME/extension/magic-bytes/SHA-256/dedup)।
2. Upload transaction (uploaded_documents + security.scan.requested outbox) + 202 ACK।
3. REST status endpoint (DB-backed, authoritative) + authenticated SSE nudge
   (DECISION-02 के अनुसार; SSE = optimization only)।

**Phase D — Review/confirm path**
1. Parsed-data fetch endpoint (read-only evidence)।
2. Confirm endpoint: canonical transaction with existing enums
   (`profile_fact_source='resume_ai'`, `verification_status='candidate_confirmed'`),
   revision bump, history, outbox।

**Phase E — Hardening**
1. Recovery sweeper: stale `pending`/`scanning`/`failed` documents के लिए scheduled re-scan
   (existing scan-queue index का use)।
2. Prod scanner provider integrate करो (human decision के बाद) — mock replace।
3. Optional (human decision): DB-level canonical gate trigger / `review_status` column —
   नया migration, इसलिए अलग decision से।

---

## 6. Human decisions (बाकी, non-blocking for architecture)

1. **Scanner provider:** ClamAV self-hosted vs managed service (cost/ops/data-residency tradeoff)।
   Architecture दोनों support करती है; dev mock से शुरू करो।
2. **DB-level canonical gate:** trigger/column defense-in-depth चाहिए या app-level + enums काफी —
   नया schema artifact है, इसलिए explicit decision लो।
3. **Scan retry budget:** exact attempts/backoff numbers (dispatcher outbox `retry_count<=10`
   pattern exists; scan task के लिए Cloud Tasks queue config तय करो)।

---

## 7. Review discrepancies — consolidated position

| Point | कुछ reviews कहते हैं | Final position (verified) |
|---|---|---|
| Scanner gap severity | antigravity: "Phase 7-9 to be built" | cline/freebuf सही: यह critical-path blocker है, future enhancement नहीं |
| `processing_status` enum values | antigravity ने गलत quote किया | सही enum `02_enums.sql:302-311` (uploaded…partial) — arch-reviewer का correction accepted |
| `review_status` नई column | qoder first-round ने propose किया | Existing enums (`profile_fact_source`, `profile_fact_verification_status`) lifecycle cover करते हैं; नई column = schema change = human decision, MVP में नहीं |
| Scanner FastAPI में या अलग service | chatgpt: dedicated service preferred | MVP: FastAPI module (route already registered, ops simple); provider abstraction से future separation possible — contract-compatible |
| Verdict spread | 3× APPROVED-WITH-CHANGES, 3× NEEDS-DECISION, 1× RESOLVED | Consolidated: **Architecture APPROVED; implementation Phase A→E order में build करो** |

---

**Status:** `FINAL RECOMMENDATION — READY FOR IMPLEMENTATION PLANNING (Phase A first)`

**Authority decision (s1 review round final):**
```text
यह file (qoder/FINAL-RECOMMENDED-FLOW-...) = IMPLEMENTATION AUTHORITY (follow)
codex/CODEX-FINAL-RECOMMENDED-FLOW.md     = audit/reference (delete नहीं; cross-reference)
```
