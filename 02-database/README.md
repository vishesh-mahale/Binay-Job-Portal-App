# Database

[← Main project](../README.md) · [Requirements](../01-requirements/README.md)

यह component Supabase PostgreSQL schema, migrations, RLS, indexes, seed/test data और database flows
का owner है।

## Scope and design principles

यह database multi-company recruitment platform के लिए ये capabilities own करती है:

- Supabase Auth-linked users और company tenancy;
- jobs, applications, referrals और interview scheduling;
- private documents और versioned resume processing;
- editable candidate canonical facts, immutable AI evidence और recruiter-search projection;
- messaging, notifications, analytics, subscriptions और platform feedback;
- PostgreSQL filters/FTS/`pg_trgm`/`pgvector` hybrid search foundation;
- transactional outbox और idempotent background consumers।

External Meilisearch/OpenSearch current baseline का हिस्सा नहीं है। Measured scale/capability need और
approved ADR के बाद future evaluation होगी; PostgreSQL relational data source of truth रहेगी।

Core principles:

- UUID primary keys, normalized relational domain data और explicit foreign keys;
- domain-appropriate soft delete/retention; history/evidence/snapshots जहाँ required वहाँ immutable;
- audit timestamps, actor/history rows और controlled lifecycle transitions;
- raw AI output canonical candidate truth नहीं;
- application-time snapshot historical truth है;
- RLS/default-deny browser boundary के साथ NestJS primary business authorization;
- private storage objects के लिए stored paths और runtime authorized signed access;
- indexing measured query shapes के लिए, speculative guarantees के लिए नहीं।

## Start here

- [Production schema blueprint](schema-docs/PRODUCTION-SCHEMA-BLUEPRINT.md)
- [Job and candidate search strategy](schema-docs/SEARCH-STRATEGY.md)
- [Supabase PostgreSQL query and index guide](schema-docs/supabase-query-index-use-approach.md)
- [RLS review checklist for 01–17 dependencies](RLS-REVIEW-CHECKLIST.md)
- [Jobs schema explanation](migrations/baseline/05_jobs_Explanation.md)
- [AI job profile JSONB contract](migrations/baseline/05_jobs_AI_Job_Profile_JSONB_Contract_v1_step1.md)
- [AI job embedding architecture](migrations/baseline/05_jobs_AI_Job_Embedding_Architecture_v1_step2.md)
- [Job search layers](migrations/baseline/05_jobs_AI_Make_Job_searchable_step3.md)
- [Job edit and corner-case guidelines](migrations/baseline/05_jobs_AI_Job_Edit_Corner_Case_Guidelines.md)
- [Documents and guest-upload flow](migrations/baseline/06_documents_Explanation.md)
- [Resume processing and AI parsing flow](migrations/baseline/07_resume_processing_Explanation.md)
- [Candidate canonical profile and recruiter-search projection](migrations/baseline/08_candidates_Explanation.md)
- [Applications, snapshots, guest claims and referrals](migrations/baseline/09_applications_Explanation.md)
- [Interview scheduling, slots, panels and feedback](migrations/baseline/10_interviews_Explanation.md)
- [Authorized messaging, attachments and realtime boundary](migrations/baseline/11_messaging_Explanation.md)
- [Versioned templates, inbox notifications and channel delivery](migrations/baseline/12_notifications_Explanation.md)
- [Analytics, daily dashboards, audit and sanitized errors](migrations/baseline/13_analytics_Explanation.md)
- [Plans, subscription history, invoices and coupons](migrations/baseline/14_subscriptions_Explanation.md)
- [Transactional outbox, Dispatcher leases and consumer idempotency](migrations/baseline/15_infrastructure_Explanation.md)
- [Cross-domain query indexes](migrations/baseline/16_indexes_Explanation.md)
- [RLS authorization and runtime grants](migrations/baseline/17_rls_Explanation.md)
- [One-shot registered/guest platform feedback](migrations/baseline/18_feedback_Explanation.md)
- [Candidate profile to authorized HR search test flow](flows/CANDIDATE-TO-HR-VISIBILITY-TEST-HINGLISH.md)
- [Active-resume recruiter-search decision](../01-requirements/product-decisions/PD-002-ACTIVE-RESUME-SEARCH.md)
- [NestJS implementation guide](../04-nestjs-api/NESTJS-IMPLEMENTATION-GUIDE.md)
- [Background-worker architecture](../docs/architecture/background-processing/BACKGROUND-WORKER-ARCHITECTURE-OPTIONS-HINGLISH.md)
- [Background-worker implementation plan](../docs/architecture/background-processing/BACKGROUND-WORKER-IMPLEMENTATION-PLAN-HINGLISH.md)

## Baseline migration progress

Files are reviewed in the old repository first and copied here only after approval:

1. [01_extensions.sql](migrations/baseline/01_extensions.sql) — approved and migrated as an
   exact copy; all seven extension statements preserved.
2. [02_enums.sql](migrations/baseline/02_enums.sql) — approved and re-synced as an exact copy;
   current enum set includes auth login methods and verified/unlocked security events; three
   unreferenced legacy resume enums were removed during review.
3. [03_users_auth.sql](migrations/baseline/03_users_auth.sql) — approved and migrated as an exact
   copy; Supabase signup synchronization, trusted role boundary, presence, immutable auth audit,
   hard-delete protection, constraints and reviewed indexes included.
4. [04_companies.sql](migrations/baseline/04_companies.sql) — approved and migrated as an exact
   copy; tenant-safe organization relationships, inactive invitation membership, branch lifecycle,
   permissions shape validation and current-scope company settings included.
5. [05_jobs.sql](migrations/baseline/05_jobs.sql) — approved and migrated as an exact copy;
   tenant-safe branch/department/team references, FTS, compatible embedding metadata, skills,
   locations and view aggregation included. Five reviewed job documents are kept beside the SQL
   under [`migrations/baseline/`](migrations/baseline/).
6. [06_documents.sql](migrations/baseline/06_documents.sql) — approved and migrated as an exact
   copy; job-scoped guest sessions, XOR upload ownership, mandatory checksums, scan/processing
   timestamps, deduplication and private-document lifecycle included.
7. [07_resume_processing.sql](migrations/baseline/07_resume_processing.sql) — approved and migrated
   as an exact copy; versioned parsing jobs, immutable results/artifacts/events, JSON/checksum
   validation and scan-first background-processing ownership included.
8. [08_candidates.sql](migrations/baseline/08_candidates.sql) — approved and migrated as an exact
   copy; editable canonical facts, immutable evidence, logical profile revisions and source-labelled
   canonical-plus-active-resume search projection included.
9. [09_applications.sql](migrations/baseline/09_applications.sql) — approved and migrated as an exact
   copy; registered/guest apply, immutable submission history, controlled lifecycle transitions,
   manual referral invitations and flexible reward accounting included.
10. [10_interviews.sql](migrations/baseline/10_interviews.sql) — approved and migrated as an exact
    copy; same-company pools/interviewers, conflict-safe slots, registered/guest interviews,
    application-scoped booking and immutable final feedback included.
11. [11_messaging.sql](migrations/baseline/11_messaging.sql) — approved and migrated as an exact
    copy; application/interview conversation scope, participant authorization, durable messages,
    clean immutable attachments and source-backed inbox summaries included.
12. [12_notifications.sql](migrations/baseline/12_notifications.sql) — approved and migrated as an
    exact copy; versioned template lifecycle, scoped preferences, idempotent durable notifications,
    per-channel delivery/retry state and device-token integrity included.
13. [13_analytics.sql](migrations/baseline/13_analytics.sql) — approved and migrated as an exact
    copy; idempotent product/search events, rebuildable daily aggregates, immutable audit history,
    sanitized error resolution and explicit privacy/retention boundaries included.
14. [14_subscriptions.sql](migrations/baseline/14_subscriptions.sql) — approved and migrated as an
    exact copy; provider-neutral plans, current plus historical subscriptions, immutable invoice
    snapshots/refunds, normalized coupon eligibility and cross-company financial integrity included.
15. [15_infrastructure.sql](migrations/baseline/15_infrastructure.sql) — approved and migrated as an
    exact copy; immutable outbox envelopes, bounded lease-based dispatch, dead-letter handling,
    deterministic task identity, recovery check and consumer idempotency included.
16. [16_indexes.sql](migrations/baseline/16_indexes.sql) — approved and migrated as an exact copy;
    candidate matching, recruiter queue, stale resume work and terminal guest cleanup paths are
    indexed without duplicating the outbox work indexes owned by `15_infrastructure.sql`.
17. [17_rls.sql](migrations/baseline/17_rls.sql) — approved and migrated as an exact copy;
    all 81 preceding business tables have RLS, browser business writes are default-deny, mixed-sensitivity
    tables use NestJS safe DTOs, active chat membership is enforced and outbox function execution
    is server-only. The reviewed Hinglish explanation is stored beside the SQL.
18. [18_feedback.sql](migrations/baseline/18_feedback.sql) — approved and migrated as an exact copy;
    registered/guest submitter integrity, immutable submission content, controlled admin lifecycle,
    service-only raw rows, RLS and abuse-resistant NestJS submission ownership included.

Old `Binay-App/database` अब database migration evidence है। उसे पूरे repository migration, final coverage
verification और project-owner deletion approval से पहले delete नहीं किया जाएगा।

## Open cross-file schema item

- `PRODUCT-REQUIREMENTS.md` में recruiter **saved candidates** current scope में है, लेकिन approved
  `01–11` schema में अभी `saved_candidates` model मौजूद नहीं है; `saved_jobs` यह requirement satisfy नहीं करता।
  इसे notifications में गलत जगह जोड़ने के बजाय candidate/recruiter ownership, company scope, optional notes,
  uniqueness, indexes, NestJS API और RLS सहित अलग reviewed schema amendment के रूप में finalize करना है।

## Current status

- Reviewed `01–18` baseline SQL और approved explanation files यहाँ migrate हो चुकी हैं।
- Clean Supabase testing database पर ordered `01–18` execution सफल हुआ।
- `82` public base tables और `82` RLS-enabled tables verify हुईं; important tables/functions/triggers के
  smoke checks में missing object नहीं मिला।
- Production अभी deploy नहीं हुई है। Behavioral cross-user/cross-company RLS, worker और NestJS integration
  tests implementation के साथ अभी बाकी हैं।
- Production baseline freeze होने तक baseline files correct करके test database को explicitly reset,
  complete `01–18` rerun और retest किया जा सकता है।
- Production deployment के बाद baseline history edit नहीं होगी; उसके बाद changes
  `migrations/changes/` में forward-only migrations होंगे।

```text
02-database/
  migrations/
    baseline/   # executed and verified 01–18 baseline
    changes/    # production baseline freeze के बाद forward-only migrations
  schema-docs/  # human-readable explanations; executable truth नहीं
  supabase-config/
  seeds/
  tests/
  flows/
```

Testing में baseline SQL intended executable schema है और selected test environment की actual state
उसके last complete reset/run पर निर्भर है। Production deployment के बाद applied migrations operational
history होंगी। Blueprint mismatch को कभी छिपाया नहीं जाएगा।

## Naming conventions: internal paths और external URLs

- `*_path` database/private-storage location है; इसे public URL न मानें। Signed URL access के समय NestJS
  authorization के बाद बनेगी। Examples: `logo_path`, `storage_path`, `invoice_pdf_path`।
- `*_url` approved external HTTP(S) resource के लिए है। Current examples: `candidate_links.url` और
  `application_form_url`। Webhook endpoint configuration database business column में नहीं रखी गई है।
- Raw signed URLs, secrets, access tokens और personal resume content durable business columns/logs में store
  नहीं होंगे।

## Old README coverage audit

| Old section | Final treatment |
|---|---|
| Overview/capability list | Updated and preserved under Scope; fixed external-search commitment removed |
| Design principles | Preserved and aligned with actual immutability/RLS/outbox architecture |
| SQL file organization `01–18` | Preserved and expanded in Baseline migration progress with direct links |
| Hinglish explanation guides | Preserved and expanded from 05–09 to all available 05–18 guides |
| Active-resume policy | Moved to authoritative `PD-002` and linked here |
| Candidate-to-HR test flow | Refined, moved to `flows/` and linked here |
| `*_path` versus `*_url` rules | Preserved in current naming-conventions section |
| Related old project files | Replaced with current requirements/NestJS/background/schema links |
| Old execution status | Updated to migrated baseline, clean rerun and 82/82 RLS verification |

Old `database/README.md` को duplicate README के रूप में copy नहीं किया गया क्योंकि इस component का
authoritative README यही file है। उसकी useful information ऊपर merge की गई; stale paths/status carry
forward नहीं किए गए।
