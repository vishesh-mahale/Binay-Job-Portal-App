# Stage 1 Independent Audit — Security Scan Decision

**Reviewer:** arch-auditor (independent security/distributed-systems reviewer)
**Status:** INDEPENDENT REVIEW
**Scope:** Verify the Stage-1 “security scan decision” (codex `STAGE-01-SECURITY-SCAN-IMPLEMENTATION-STAGES-AND-VERIFICATION-PLAN.md`, Section 1 “Final direction”) against **committed repository ground truth only** — SQL, contracts, dispatcher source, and FastAPI/NestJS code. No documents are treated as authoritative because of authorship.

> Authority: `AGENTS.md` (repo rules) + `02-database/migrations/baseline/*` (executable truth) + `contracts/*` + `05-outbox-dispatcher-nestjs/src/**` (committed TS) + `07-fastapi-ai-worker/app/**` (committed Python). `Binay-App/` is legacy reference only.

## 1. Verdict

**NOT APPROVED — Stage 1 freeze is NOT safe.**

The **direction** (async quarantine, clean-only parse, fail-closed) is correct and matches the baseline schema. But the Stage 1 exit criterion is **not met**: the scan handler, the scanner provider abstraction, and the task contract that the handler needs **do not exist**, and the dispatcher registration contains a **documentation-vs-reality defect** that will cause runtime 404/dead-letter. Stage 1 must be held until the scan worker + provider abstraction + task contract exist; the *direction* can be recorded as approved-in-principle.

## 2. Verified correct points (evidence)

| # | Point | Repository evidence | Result |
|---|---|---|---|
| 1 | Fast (synchronous) upload validation only; no AV in upload request | `NESTJS-IMPLEMENTATION-GUIDE.md:257-270` (§8: auth/ownership, ext/MIME/signature/size, server-side path, SHA-256, dedup, 202); constraint in `FAST-API PROMPT.md` no-AV-in-txn | ✅ Correct |
| 2 | Private storage + `security_scan_status='pending'` | `06_documents.sql:84` (DEFAULT 'pending'); `:7-7` “binary file stays in private object storage” | ✅ Correct |
| 3 | `security.scan.requested` outbox in the upload txn; 202 ACK | `NESTJS-IMPLEMENTATION-GUIDE.md:274-278` (upload txn → uploaded_documents + outbox_events(security.scan.requested) → COMMIT → 202); `06_documents_Explanation.md:90` | ✅ Correct |
| 4 | Async scan; queue ≠ upload request | `event-route.registry.ts:78-83` (`security.scan.requested`→`security-scan-queue`→`/internal/tasks/security/scan`); `:32` `SECURITY_SCAN_QUEUE`; `06_documents.sql:144-146` scan-queue index on `pending/failed` | ✅ Correct pattern |
| 5 | Scanner call NOT inside an open DB transaction | `NESTJS-IMPLEMENTATION-GUIDE.md:47` “NestJS normal request path में FastAPI का heavy work … wait नहीं करेगा”; `FAST-API PROMPT.md` no-AV-in-txn | ✅ Correct rule |
| 6 | Clean-only parse gate | `task_handlers.py:149-171` (clean→proceed; pending/scanning→503; infected/quarantined→fail+200); `security_scan_status` enum `:02_enums.sql:527-529`; `06_documents_Explanation.md:67` “pending → clean” | ✅ Correct + enforced |
| 7 | FastAPI parser re-checks `security_scan_status` (not a 2nd AV scan) | `task_handlers.py:149-153` re-selects status from `uploaded_documents`; §9 “parser clean status को दोबारा verify करेगा; यह दूसरा antivirus scan नहीं है” | ✅ Correct |
| 8 | Fail-closed dispatcher; unknown events not silently skipped | `event-route.registry.ts:15` | ✅ Correct |
| 9 | Presence/status substrate exists | `03_users_auth.sql:335-342` `user_sessions(is_online,…)`; `NESTJS-IMPLEMENTATION-GUIDE.md:300-301` status endpoint authoritative + SSE optimization | ✅ Correct substrate |
| 10 | Canonical profile only after candidate confirmation | `08_candidates.sql:111-130` `is_current`; `NESTJS-IMPLEMENTATION-GUIDE.md:200-234` (§6 candidate save txn, 409 stale); `PD-002` §Canonical profile editing | ✅ Correct