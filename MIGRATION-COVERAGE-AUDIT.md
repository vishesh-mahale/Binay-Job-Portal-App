# Migrated Documentation Coverage Audit

[← Main project](README.md) · [Migration plan](MIGRATION-PLAN-HINGLISH.md)

## उद्देश्य

यह report verify करती है कि अब तक migrated/refined documents में useful source information silently
remove नहीं हुई।

- `EXACT`: source bytes/lines unchanged copy हुए।
- `FULL PRESERVED`: navigation/status note add हुई, source की सभी ordered lines मौजूद हैं।
- `REFINED + COVERAGE`: facts current architecture से update हुए और section mapping destination में है।
- `SYNTHESIZED`: multiple mixed sources से clean document बना; raw source copies भी new repo में सुरक्षित हैं।

## Audit result

| Source | Destination | Status | Verification/result |
|---|---|---|---|
| `old_All-Features.md` | `01-requirements/source-inputs/CLIENT-REQUIRED-FUTURE-CATEGORIZED.md` | CATEGORY-PRESERVED | Client feature list reorganized by category; original markers and commercial notes retained in the categorized document |
| `old_Requirement.txt` | `01-requirements/source-inputs/REQUIREMENT.txt` | EXACT | 339/339 lines, matching SHA-256 |
| `Old_CLIENT-MANUAL-REFERRAL-REQUIREMENT.md` | `current/MANUAL-REFERRAL-REQUIREMENT.md` | FULL PRESERVED | All 294 source lines ordered; only navigation/status note added |
| `old_3_AI model vs parser library.md` | `docs/research/ai/AI-MODEL-VS-PARSER-LIBRARY-RESEARCH.md` | FULL PRESERVED | Full 303-line source contained; non-authoritative research warning added |
| `old_AI-PIPELINE.md` | `docs/research/ai/AI-PIPELINE-ARCHITECTURE-INPUT.md` | FULL PRESERVED | Full 270-line source contained; stale-example warning added |
| `08_ACTIVE-RESUME-CANDIDATE-SEARCH-POLICY.md` | `PD-002-ACTIVE-RESUME-SEARCH.md` | REFINED + COVERAGE | Initial condensation defect fixed; example, table, flow, service responsibilities and memory rule restored |
| `old_NESTJS-GUIDE.md` | `04-nestjs-api/NESTJS-IMPLEMENTATION-GUIDE.md` | REFINED + COVERAGE | Useful sections mapped in Section 22; obsolete mechanisms have explicit replacements |
| `old_PRODUCTION-SCHEMA-BLUEPRINT.md` | `02-database/schema-docs/PRODUCTION-SCHEMA-BLUEPRINT.md` | REFINED + COVERAGE | Every original heading preserved/expanded; source coverage appendix added |
| `oldSearch-Strategy.md` | `02-database/schema-docs/SEARCH-STRATEGY.md` | REFINED + COVERAGE | Missing overview table restored; Section 17 maps every original area |
| `supabase-query-index-use-approach.md` | `02-database/schema-docs/supabase-query-index-use-approach.md` | REFINED + COVERAGE | Original filename retained; stale examples corrected and all original sections mapped in Section 15 |
| `database/01_extensions.sql` | `02-database/migrations/baseline/01_extensions.sql` | APPROVED EXACT COPY | Old file reviewed first; all seven extension statements preserved; source and destination SHA-256 match |
| `database/02_enums.sql` | `02-database/migrations/baseline/02_enums.sql` | APPROVED EXACT COPY | Current 03–18 usages cross-checked; three zero-reference legacy enums removed; auth login type plus email-verified/account-unlocked audit values added; source and destination SHA-256 match |
| `database/03_users_auth.sql` | `02-database/migrations/baseline/03_users_auth.sql` | APPROVED EXACT COPY | Full architecture/review hardening applied before approval: Supabase trigger, trusted role/status, defensive names, constraints, append-only audit, RLS-compatible ownership and index cleanup; source and destination SHA-256 match |
| `database/04_companies.sql` | `02-database/migrations/baseline/04_companies.sql` | APPROVED EXACT COPY | Focused current-scope review applied before approval: tenant-safe member/branch/department/team/manager relationships, same-unit head/lead binding, inactive invitation default, branch activation state, JSON permission shape and future integration fields removed; source and destination SHA-256 match |
| `database/05_jobs.sql` | `02-database/migrations/baseline/05_jobs.sql` | APPROVED EXACT COPY | Focused review applied before approval: tenant-safe branch/department/team references, accurate function/trigger inventory, AI/embedding metadata consistency and portable documentation references; source and destination SHA-256 match |
| `database/05_jobs_Explanation.md` | `02-database/migrations/baseline/05_jobs_Explanation.md` | APPROVED EXACT COPY | Main explanation synchronized with the v1 JSON contract, all four embedding states and finalized outbox/Cloud Tasks/Cloud Run flow; source and destination SHA-256 match |
| `database/05_jobs_AI_Job_Profile_JSONB_Contract_v1_step1.md` | same filename under `02-database/migrations/baseline/` | APPROVED EXACT COPY | Contract preserved and corrected for publish/semantic-edit regeneration, structured validation, current background ownership and removal of the unusable sandbox appendix; source and destination SHA-256 match |
| `database/05_jobs_AI_Job_Embedding_Architecture_v1_step2.md` | same filename under `02-database/migrations/baseline/` | APPROVED EXACT COPY | Embedding inputs preserved; provider-neutral compatible model/version rule and finalized worker flow added before approval; source and destination SHA-256 match |
| `database/05_jobs_AI_Make_Job_searchable_step3.md` | same filename under `02-database/migrations/baseline/` | APPROVED EXACT COPY | B-tree, FTS and HNSW explanations preserved; combined NestJS search/fallback semantics clarified; source and destination SHA-256 match |
| `database/05_jobs_AI_Job_Edit_Corner_Case_Guidelines.md` | same filename under `02-database/migrations/baseline/` | APPROVED EXACT COPY | Existing corner cases retained and current authority warning, deactivate-and-retain branch rule, outbox delivery and replay/re-embedding semantics added; source and destination SHA-256 match |
| `database/06_documents.sql` | `02-database/migrations/baseline/06_documents.sql` | APPROVED EXACT COPY | Focused review applied before approval: mandatory job-scoped guest sessions/checksums, XOR ownership, mutable-state timestamp, JSON shape checks, deduplication and hard-delete protection; source and destination SHA-256 match |
| `database/06_documents_Explanation.md` | `02-database/migrations/baseline/06_documents_Explanation.md` | APPROVED EXACT COPY | Registered/guest upload examples retained and synchronized with mandatory checksum/job scope plus scan-first outbox/Cloud Tasks/FastAPI parsing order; source and destination SHA-256 match |
| `database/07_resume_processing.sql` | `02-database/migrations/baseline/07_resume_processing.sql` | APPROVED EXACT COPY | Focused review applied before approval: mandatory parser/extraction versions, JSON-object validation, artifact checksum validation and immutable result/artifact/event history; source and destination SHA-256 match |
| `database/07_resume_processing_Explanation.md` | `02-database/migrations/baseline/07_resume_processing_Explanation.md` | APPROVED EXACT COPY | Rahul example and scan-first flow preserved and synchronized with NestJS/trusted scan completion, outbox dispatch, Cloud Tasks and private Cloud Run FastAPI ownership; source and destination SHA-256 match |
| `database/08_candidates.sql` | `02-database/migrations/baseline/08_candidates.sql` | APPROVED EXACT COPY | Focused review applied before approval: canonical facts/evidence retained, active-resume source identity and fact labels added to projection, embedding version aligned with jobs, JSON shapes and signup function security hardened; source and destination SHA-256 match |
| `database/08_candidates_Explanation.md` | `02-database/migrations/baseline/08_candidates_Explanation.md` | APPROVED EXACT COPY | Candidate flow preserved and synchronized with canonical-plus-active-resume projection, compatible embedding contract, source labels and stale-worker identity checks; source and destination SHA-256 match |
| `database/09_applications.sql` | `02-database/migrations/baseline/09_applications.sql` | APPROVED EXACT COPY | Focused review applied before approval: existing application/referral state machines retained; JSON payload shapes, token/idempotency keys, snapshot revision/schema and status-history integrity hardened; source and destination SHA-256 match |
| `database/09_applications_Explanation.md` | `02-database/migrations/baseline/09_applications_Explanation.md` | APPROVED EXACT COPY | Registered/guest/referral flows preserved and clarified so application snapshots follow the selected application resume, never block on pending parsing and remain immutable across later enrichment; source and destination SHA-256 match |
| `database/10_interviews.sql` | `02-database/migrations/baseline/10_interviews.sql` | APPROVED EXACT COPY | Focused review applied before approval: guest interviews enabled, application/job/candidate and company/pool/block scope enforced, booking state hardened and submitted feedback/interview history protected; source and destination SHA-256 match |
| `database/10_interviews_Explanation.md` | `02-database/migrations/baseline/10_interviews_Explanation.md` | APPROVED EXACT COPY | New Hinglish guide documents availability, lock/booking, registered/guest interview, panels, final feedback and future external-calendar boundary; source and destination SHA-256 match |
| `database/11_messaging.sql` | `02-database/migrations/baseline/11_messaging.sql` | APPROVED EXACT COPY | Focused review applied before approval: application/interview company scope, participant-role/thread checks, message lifecycle, clean attachment ownership, receipts/reactions and latest-preview identity hardened; source and destination SHA-256 match |
| `database/11_messaging_Explanation.md` | `02-database/migrations/baseline/11_messaging_Explanation.md` | APPROVED EXACT COPY | New Hinglish guide documents durable messaging, system/user sender rules, file transaction, unread/read flow, soft deletion and transport ADR boundary; source and destination SHA-256 match |
| `database/12_notifications.sql` | `02-database/migrations/baseline/12_notifications.sql` | APPROVED EXACT COPY | Focused review applied before approval: versioned draft/active/retired templates, scoped preference uniqueness, idempotent durable notifications, immutable identity, per-channel retry state and device-token validation; source and destination SHA-256 match |
| `database/12_notifications_Explanation.md` | `02-database/migrations/baseline/12_notifications_Explanation.md` | APPROVED EXACT COPY | New Hinglish guide documents outbox-to-inbox flow, template rendering boundary, preference resolution, external channel delivery/retry, device-token safety and deferred RLS enforcement; source and destination SHA-256 match |
| `database/13_analytics.sql` | `02-database/migrations/baseline/13_analytics.sql` | APPROVED EXACT COPY | Focused current-requirement review applied before approval: idempotent analytics/search ingestion, nonnegative daily aggregates with NULL-safe identity, immutable audit history, sanitized error lifecycle and privacy-safe operational boundaries; source and destination SHA-256 match |
| `database/13_analytics_Explanation.md` | `02-database/migrations/baseline/13_analytics_Explanation.md` | APPROVED EXACT COPY | New Hinglish guide documents event ingestion, authoritative-table aggregation, audit actor identity, search telemetry, error observability split, retention and service/RLS ownership; source and destination SHA-256 match |
| `database/14_subscriptions.sql` | `02-database/migrations/baseline/14_subscriptions.sql` | APPROVED EXACT COPY | Focused current-requirement review applied before approval: provider-neutral pricing, quarterly interval coverage, current/history subscription identity, cross-company invoice integrity, immutable charge/refund state and normalized coupon-plan/redemption rules; source and destination SHA-256 match |
| `database/14_subscriptions_Explanation.md` | `02-database/migrations/baseline/14_subscriptions_Explanation.md` | APPROVED EXACT COPY | New Hinglish guide documents plan/interval behavior, subscription replacement history, invoice/refund lifecycle, coupon transaction locking, provider-contract boundary and billing RLS ownership; source and destination SHA-256 match |
| `database/15_infrastructure.sql` | `02-database/migrations/baseline/15_infrastructure.sql` | APPROVED EXACT COPY | Final background architecture implemented before approval: immutable versioned event envelopes, SKIP LOCKED bounded claims, explicit leases/stale recovery, deterministic task identity, retry/dead-letter transitions, secured dispatch functions and processed-event idempotency; source and destination SHA-256 match |
| `database/15_infrastructure_Explanation.md` | `02-database/migrations/baseline/15_infrastructure_Explanation.md` | APPROVED EXACT COPY | New Hinglish guide documents webhook wake-up, NestJS Dispatcher, Cloud Tasks queue, private Cloud Run worker, lease recovery, three-layer duplicate safety, Cron existence check, grants and monitoring; source and destination SHA-256 match |
| `database/16_indexes.sql` | `02-database/migrations/baseline/16_indexes.sql` | APPROVED EXACT COPY | Six reviewed cross-domain indexes cover candidate readiness/skills, recruiter queue, stale resume work and terminal guest cleanup; duplicate outbox index removed; source and destination SHA-256 match |
| `database/16_indexes_Explanation.md` | `02-database/migrations/baseline/16_indexes_Explanation.md` | APPROVED EXACT COPY | Explains each cross-domain query shape, ownership boundary and why outbox indexing remains in 15; source and destination SHA-256 match |
| `database/17_rls.sql` | `02-database/migrations/baseline/17_rls.sql` | APPROVED EXACT COPY | All 81 business tables covered; unsafe browser write policies removed; direct reads limited to reviewed safe rows/catalogs; mixed-sensitivity domains route through NestJS safe DTOs; controlled application/outbox functions are server-only; source and destination SHA-256 match |
| `database/17_rls_Explanation.md` | `02-database/migrations/baseline/17_rls_Explanation.md` | APPROVED EXACT COPY | Hinglish guide explains the RLS/grant boundary, safe DTO rationale, corrected risks, outbox permissions and required authorization tests; source and destination SHA-256 match |
| `database/18_feedback.sql` | `02-database/migrations/baseline/18_feedback.sql` | APPROVED EXACT COPY | One-shot registered/guest feedback with exact submitter modes, immutable submission content, controlled status transitions, RLS/default-deny browser access and explicit server grants; source and destination SHA-256 match |
| `database/18_feedback_Explanation.md` | `02-database/migrations/baseline/18_feedback_Explanation.md` | APPROVED EXACT COPY | Hinglish flow, field ownership, lifecycle, safe DTO boundary, tests and section-by-section old-file coverage are documented; source and destination SHA-256 match |
| `database/CANDIDATE-TO-HR-VISIBILITY-TEST-HINGLISH.md` | `02-database/flows/CANDIDATE-TO-HR-VISIBILITY-TEST-HINGLISH.md` | REFINED EXACT COPY | Full flow retained; confirmed-signup status, trusted application-role metadata, complete projection inputs and current 17 raw-projection denial corrected; stale UUID/completed checkboxes reset; source and destination SHA-256 match |
| `database/README.md` | `02-database/README.md` | MERGED + COVERAGE | Duplicate component README not created; capability overview, design principles, `01–18` navigation, explanation-guide intent, path/URL naming rules and related links preserved in current form; stale Meilisearch commitment, old paths and execution status replaced; coverage table added |
| Cross-file authorization findings from `01` onward | `02-database/RLS-REVIEW-CHECKLIST.md` | DESIGN CLOSED; EXECUTION TESTS OPEN | `17_rls.sql` implements the reviewed design or records the service-role alternative. Behavioral role/tenant tests remain mandatory after the clean 01–18 test deployment. |
| `BACKGROUND-WORKER-ARCHITECTURE-OPTIONS-HINGLISH.md` | same filename under `docs/architecture/background-processing/` | FULL PRESERVED | Complete source copied first; navigation/status note added and five project-name references updated, with no architecture section removed |
| `BACKGROUND-WORKER-IMPLEMENTATION-PLAN-HINGLISH.md` | same filename under `docs/architecture/background-processing/` | FULL PRESERVED | Complete source copied first; navigation/status note added and two project-name references updated, with no implementation section removed |
| root `PROJECT-CONTEXT-MAP.md` | root `PROJECT-CONTEXT-MAP.md` | REFINED + COVERAGE | Original filename retained; old paths/status replaced with current repository map and every original section mapped in Section 17 |
| mixed requirements/features/future inputs | Product requirements, NFR, roadmap, PDs | SYNTHESIZED | Exact master sources retained; missing public-site, preview, inbox, AI/admin future details restored |

## Information restored during this audit

1. Active-resume policy का detailed Java example और source labels।
2. Resume-change impact table और complete background flow।
3. Active-resume service responsibilities और optional canonical-merge action।
4. Public website capability scope और candidate resume preview।
5. Recruiter/candidate live-inbox event examples।
6. Screening-question inputs और explainable match factors।
7. Future AI summary, search suggestions, controlled email drafting और cover-letter analysis।
8. Future backup/recovery और operational monitoring admin capability।
9. Search strategy की easy layer overview table।

## Intentionally not treated as approved facts

- approximate UI page count;
- unverified speed/capacity/cost guarantees;
- “zero infrastructure cost for more than one year”;
- fixed AI provider/pricing recommendations;
- calendar-only external-search adoption;
- old schema names and superseded guest-merge mechanism;
- comments/arrows जिनका approval unclear था।

इनका useful functional intent जहाँ valid था वहाँ corrected form में रखा गया है। Raw feature/requirement
और research inputs retained हैं। पुराना `Binay-App` final verification तक delete नहीं होगा।

## Not yet migrated components

Database `01–18` baseline और ऊपर listed database flow migrate हो चुके हैं। Remaining non-database
component files अपनी phase में इसी coverage rule से audit होंगी; उन्हें इस report में complete नहीं
माना गया है।
