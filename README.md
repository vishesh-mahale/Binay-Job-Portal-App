# Binay Job Portal App

यह clean production-oriented project repository है। पुराने `Binay-App` से content
यहाँ एक component at a time review, refine, validate और test करने के बाद आएगा।

## Start here

- [Agent working rules](AGENTS.md)
- [Project context map](PROJECT-CONTEXT-MAP.md)
- [System architecture diagram & blueprint](docs/architecture/ARCHITECTURE-DIAGRAM.md)
- [Repository migration plan (Hinglish)](MIGRATION-PLAN-HINGLISH.md)
- [Migrated-document coverage audit](MIGRATION-COVERAGE-AUDIT.md)
- [Architecture Decision Records](docs/adr/README.md)
- [Research library](docs/research/README.md)
- [Background-worker architecture](docs/architecture/background-processing/BACKGROUND-WORKER-ARCHITECTURE-OPTIONS-HINGLISH.md)
- [Background-worker implementation plan](docs/architecture/background-processing/BACKGROUND-WORKER-IMPLEMENTATION-PLAN-HINGLISH.md)
- [Shared contracts](contracts/README.md)

## 🗺️ Quick Links (Clickable)

**Start Here:**
- [AGENTS.md](AGENTS.md) — Agent working rules
- [PROJECT-CONTEXT-MAP.md](PROJECT-CONTEXT-MAP.md) — Architecture overview
- [ARCHITECTURE-DIAGRAM.md](docs/architecture/ARCHITECTURE-DIAGRAM.md) — System architecture diagram & layers
- [MIGRATION-PLAN-HINGLISH.md](MIGRATION-PLAN-HINGLISH.md) — Migration details
- [MIGRATION-COVERAGE-AUDIT.md](MIGRATION-COVERAGE-AUDIT.md) — Migration verification

**Main Sections:**
- [📌 01-requirements/](01-requirements/README.md) — All requirements & decisions
- [🗄️ 02-database/](02-database/README.md) — Database schema & migrations
- [🏗️ 04-nestjs-api/](04-nestjs-api/README.md) — NestJS implementation guide
- [📚 docs/](docs/) — Architecture, research & ADRs
- [📝 contracts/](contracts/README.md) — API/Event/Task contracts
- [🔍 Agent_review/](Agent_review/MERGED_COMPREHENSIVE_AUDIT.md) — Comprehensive audit

---

## 📁 Complete Repository Structure

```
Binay-Job-Portal-App/
├── 📋 Root Files
│   ├── README.md (यह file)
│   ├── AGENTS.md
│   ├── PROJECT-CONTEXT-MAP.md
│   ├── MIGRATION-PLAN-HINGLISH.md
│   └── MIGRATION-COVERAGE-AUDIT.md
│
├── 📌 01-requirements/
│   ├── README.md
│   ├── SOURCE-CLASSIFICATION.md
│   ├── current/
│   │   ├── PRODUCT-REQUIREMENTS.md
│   │   ├── NON-FUNCTIONAL-REQUIREMENTS.md
│   │   ├── MANUAL-REFERRAL-REQUIREMENT.md
│   │   └── MANUAL-REFERRAL-SUMMARY-HINGLISH.md
│   ├── product-decisions/
│   │   ├── PD-001-ACCOUNT-AND-REFERRAL-ROLES.md
│   │   ├── PD-002-ACTIVE-RESUME-SEARCH.md
│   │   └── PD-003-APPLICATION-HISTORY.md
│   ├── future/
│   │   ├── FUTURE-ROADMAP.md
│   │   └── -- pending-items-for-future.md
│   └── source-inputs/
│       ├── ALL-FEATURES.md
│       └── REQUIREMENT.txt
│
├── 🗄️ 02-database/
│   ├── README.md
│   ├── RLS-REVIEW-CHECKLIST.md
│   ├── migrations/
│   │   └── baseline/
│   │       ├── 01_extensions.sql
│   │       ├── 02_enums.sql
│   │       ├── 03_users_auth.sql
│   │       ├── 04_companies.sql
│   │       ├── 05_jobs.sql
│   │       ├── 05_jobs_Explanation.md
│   │       ├── 06_documents.sql
│   │       ├── 06_documents_Explanation.md
│   │       ├── 07_resume_processing.sql
│   │       ├── 07_resume_processing_Explanation.md
│   │       ├── 08_candidates.sql
│   │       ├── 08_candidates_Explanation.md
│   │       ├── 09_applications.sql
│   │       ├── 09_applications_Explanation.md
│   │       ├── 10_interviews.sql
│   │       ├── 10_interviews_Explanation.md
│   │       ├── 11_messaging.sql
│   │       ├── 11_messaging_Explanation.md
│   │       ├── 12_notifications.sql
│   │       ├── 12_notifications_Explanation.md
│   │       ├── 13_analytics.sql
│   │       ├── 13_analytics_Explanation.md
│   │       ├── 14_subscriptions.sql
│   │       ├── 14_subscriptions_Explanation.md
│   │       ├── 15_infrastructure.sql
│   │       ├── 15_infrastructure_Explanation.md
│   │       ├── 16_indexes.sql
│   │       ├── 16_indexes_Explanation.md
│   │       ├── 17_rls.sql
│   │       ├── 17_rls_Explanation.md
│   │       ├── 18_feedback.sql
│   │       ├── 18_feedback_Explanation.md
│   │       ├── 05_jobs_AI_Job_Embedding_Architecture_v1_step2.md
│   │       ├── 05_jobs_AI_Job_Profile_JSONB_Contract_v1_step1.md
│   │       ├── 05_jobs_AI_Make_Job_searchable_step3.md
│   │       └── 05_jobs_AI_Job_Edit_Corner_Case_Guidelines.md
│   ├── schema-docs/
│   │   ├── SEARCH-STRATEGY.md
│   │   ├── PRODUCTION-SCHEMA-BLUEPRINT.md
│   │   └── supabase-query-index-use-approach.md
│   └── flows/
│       └── CANDIDATE-TO-HR-VISIBILITY-TEST-HINGLISH.md
│
├── 🏗️ 04-nestjs-api/
│   ├── README.md
│   └── NESTJS-IMPLEMENTATION-GUIDE.md
│
├── ⚡ 05-outbox-dispatcher-nestjs/
│   ├── README.md
│   ├── IMPLEMENTATION-PLAN.md
│   ├── LOCAL-TESTING-OPTIONS.md
│   ├── TESTING-SCENARIOS.md
│   └── TESTING-SCENARIOS-1.md
│
├── 🤖 07-fastapi-ai-worker/
│   ├── README.md
│   └── pyproject.toml
│
├── 📚 docs/
│   ├── adr/
│   │   └── README.md
│   ├── architecture/
│   │   ├── ARCHITECTURE-DIAGRAM.md
│   │   └── background-processing/
│   │       ├── BACKGROUND-WORKER-ARCHITECTURE-OPTIONS-HINGLISH.md
│   │       └── BACKGROUND-WORKER-IMPLEMENTATION-PLAN-HINGLISH.md
│   └── research/
│       ├── README.md
│       └── ai/
│           ├── README.md
│           ├── AI-PIPELINE-ARCHITECTURE-INPUT.md
│           └── AI-MODEL-VS-PARSER-LIBRARY-RESEARCH.md
│
├── 📝 contracts/
│   ├── README.md
│   ├── events/
│   │   ├── candidate-profile-changed.v1.json
│   │   ├── candidate-projection-rebuilt.v1.json
│   │   ├── job-ai-enrichment-requested.v1.json
│   │   ├── job-enriched.v1.json
│   │   └── resume-parse-requested.v1.json
│   └── tasks/
│       ├── candidate-projection-task.v1.json
│       ├── job-enrich-task.v1.json
│       └── resume-parse-task.v1.json
│
└── 🔍 Agent_review/
    ├── copilotk.md
    ├── kilocode.md
    └── MERGED_COMPREHENSIVE_AUDIT.md
```

---

## 🎯 Quick Navigation Tree (All Clickable)

📋 **START HERE**
- [AGENTS.md](AGENTS.md)
- [PROJECT-CONTEXT-MAP.md](PROJECT-CONTEXT-MAP.md)
- [MIGRATION-PLAN-HINGLISH.md](MIGRATION-PLAN-HINGLISH.md)
- [MIGRATION-COVERAGE-AUDIT.md](MIGRATION-COVERAGE-AUDIT.md)

📌 **REQUIREMENTS**
- Current Scope
  - [PRODUCT-REQUIREMENTS.md](01-requirements/current/PRODUCT-REQUIREMENTS.md)
  - [NON-FUNCTIONAL-REQUIREMENTS.md](01-requirements/current/NON-FUNCTIONAL-REQUIREMENTS.md)
  - [MANUAL-REFERRAL-REQUIREMENT.md](01-requirements/current/MANUAL-REFERRAL-REQUIREMENT.md)
- Product Decisions
  - [PD-001: Roles](01-requirements/product-decisions/PD-001-ACCOUNT-AND-REFERRAL-ROLES.md)
  - [PD-002: Active Resume](01-requirements/product-decisions/PD-002-ACTIVE-RESUME-SEARCH.md)
  - [PD-003: Application History](01-requirements/product-decisions/PD-003-APPLICATION-HISTORY.md)
- Future
  - [FUTURE-ROADMAP.md](01-requirements/future/FUTURE-ROADMAP.md)
  - [pending-items-for-future.md](01-requirements/future/--pending-items-for-future.md)
- Source Inputs
  - [ALL-FEATURES.md](01-requirements/source-inputs/ALL-FEATURES.md)
  - [REQUIREMENT.txt](01-requirements/source-inputs/REQUIREMENT.txt)

🗄️ **DATABASE**
- [Schema README](02-database/README.md)
- [RLS Checklist](02-database/RLS-REVIEW-CHECKLIST.md)
- Schema Docs
  - [Search Strategy](02-database/schema-docs/SEARCH-STRATEGY.md)
  - [Production Blueprint](02-database/schema-docs/PRODUCTION-SCHEMA-BLUEPRINT.md)
  - [Supabase Approach](02-database/schema-docs/supabase-query-index-use-approach.md)
- Flows
  - [Candidate to HR Visibility Test](02-database/flows/CANDIDATE-TO-HR-VISIBILITY-TEST-HINGLISH.md)

🚀 **MIGRATIONS (01-04) - Core Setup**
- [01: Extensions](02-database/migrations/baseline/01_extensions.sql)
- [02: Enums](02-database/migrations/baseline/02_enums.sql)
- [03: Auth](02-database/migrations/baseline/03_users_auth.sql)
- [04: Companies](02-database/migrations/baseline/04_companies.sql)

**05: JOBS** (Schema + Explanation)
- [Schema File](02-database/migrations/baseline/05_jobs.sql)
- [Explanation](02-database/migrations/baseline/05_jobs_Explanation.md)

**06: DOCUMENTS** (Schema + Explanation)
- [Schema File](02-database/migrations/baseline/06_documents.sql)
- [Explanation](02-database/migrations/baseline/06_documents_Explanation.md)

**07: RESUME PROCESSING** (Schema + Explanation)
- [Schema File](02-database/migrations/baseline/07_resume_processing.sql)
- [Explanation](02-database/migrations/baseline/07_resume_processing_Explanation.md)

**08: CANDIDATES** (Schema + Explanation)
- [Schema File](02-database/migrations/baseline/08_candidates.sql)
- [Explanation](02-database/migrations/baseline/08_candidates_Explanation.md)

**09: APPLICATIONS** (Schema + Explanation)
- [Schema File](02-database/migrations/baseline/09_applications.sql)
- [Explanation](02-database/migrations/baseline/09_applications_Explanation.md)

**10: INTERVIEWS** (Schema + Explanation)
- [Schema File](02-database/migrations/baseline/10_interviews.sql)
- [Explanation](02-database/migrations/baseline/10_interviews_Explanation.md)

**11: MESSAGING** (Schema + Explanation)
- [Schema File](02-database/migrations/baseline/11_messaging.sql)
- [Explanation](02-database/migrations/baseline/11_messaging_Explanation.md)

**12: NOTIFICATIONS** (Schema + Explanation)
- [Schema File](02-database/migrations/baseline/12_notifications.sql)
- [Explanation](02-database/migrations/baseline/12_notifications_Explanation.md)

**13: ANALYTICS** (Schema + Explanation)
- [Schema File](02-database/migrations/baseline/13_analytics.sql)
- [Explanation](02-database/migrations/baseline/13_analytics_Explanation.md)

**14: SUBSCRIPTIONS** (Schema + Explanation)
- [Schema File](02-database/migrations/baseline/14_subscriptions.sql)
- [Explanation](02-database/migrations/baseline/14_subscriptions_Explanation.md)

**15: INFRASTRUCTURE** (Schema + Explanation)
- [Schema File](02-database/migrations/baseline/15_infrastructure.sql)
- [Explanation](02-database/migrations/baseline/15_infrastructure_Explanation.md)

**16: INDEXES** (Schema + Explanation)
- [Schema File](02-database/migrations/baseline/16_indexes.sql)
- [Explanation](02-database/migrations/baseline/16_indexes_Explanation.md)

**17: RLS** (Schema + Explanation)
- [Schema File](02-database/migrations/baseline/17_rls.sql)
- [Explanation](02-database/migrations/baseline/17_rls_Explanation.md)

**18: FEEDBACK** (Schema + Explanation)
- [Schema File](02-database/migrations/baseline/18_feedback.sql)
- [Explanation](02-database/migrations/baseline/18_feedback_Explanation.md)

📚 **05: JOBS - AI & ARCHITECTURE FILES** (Separate Deep-Dive)
- [Jobs Explanation](02-database/migrations/baseline/05_jobs_Explanation.md)
- [AI Job Embedding Architecture v1 (Step 2)](02-database/migrations/baseline/05_jobs_AI_Job_Embedding_Architecture_v1_step2.md)
- [AI Job Profile JSONB Contract v1 (Step 1)](02-database/migrations/baseline/05_jobs_AI_Job_Profile_JSONB_Contract_v1_step1.md)
- [AI Make Job Searchable (Step 3)](02-database/migrations/baseline/05_jobs_AI_Make_Job_searchable_step3.md)
- [AI Job Edit Corner Case Guidelines](02-database/migrations/baseline/05_jobs_AI_Job_Edit_Corner_Case_Guidelines.md)

🏗️ **NESTJS API**
- [API README](04-nestjs-api/README.md)
- [Implementation Guide](04-nestjs-api/NESTJS-IMPLEMENTATION-GUIDE.md)

⚡ **OUTBOX DISPATCHER (05-outbox-dispatcher-nestjs)**
- [Dispatcher README](05-outbox-dispatcher-nestjs/README.md)
- [Implementation Plan](05-outbox-dispatcher-nestjs/IMPLEMENTATION-PLAN.md)
- [Local Testing Options](05-outbox-dispatcher-nestjs/LOCAL-TESTING-OPTIONS.md)
- [Testing Scenarios (Master)](05-outbox-dispatcher-nestjs/TESTING-SCENARIOS.md)
- [Testing Scenarios (Consolidated)](05-outbox-dispatcher-nestjs/TESTING-SCENARIOS-1.md)

🤖 **FASTAPI AI WORKER (07-fastapi-ai-worker)**
- [Worker README](07-fastapi-ai-worker/README.md)

📚 **ARCHITECTURE & DOCS**
- System Overview
  - [System Architecture Diagram & Blueprint](docs/architecture/ARCHITECTURE-DIAGRAM.md)
- ADRs
  - [Architecture Decision Records](docs/adr/README.md)
- Background Processing
  - [Architecture Options](docs/architecture/background-processing/BACKGROUND-WORKER-ARCHITECTURE-OPTIONS-HINGLISH.md)
  - [Implementation Plan](docs/architecture/background-processing/BACKGROUND-WORKER-IMPLEMENTATION-PLAN-HINGLISH.md)

🔬 **RESEARCH**
- [Research Hub](docs/research/README.md)
- AI
  - [AI Hub](docs/research/ai/README.md)
  - [AI Pipeline Architecture](docs/research/ai/AI-PIPELINE-ARCHITECTURE-INPUT.md)
  - [Model vs Parser Library](docs/research/ai/AI-MODEL-VS-PARSER-LIBRARY-RESEARCH.md)

📝 **CONTRACTS**
- [Contracts README](contracts/README.md)
- Events
  - [candidate-profile-changed.v1.json](contracts/events/candidate-profile-changed.v1.json)
  - [candidate-projection-rebuilt.v1.json](contracts/events/candidate-projection-rebuilt.v1.json)
  - [job-ai-enrichment-requested.v1.json](contracts/events/job-ai-enrichment-requested.v1.json)
  - [job-enriched.v1.json](contracts/events/job-enriched.v1.json)
  - [resume-parse-requested.v1.json](contracts/events/resume-parse-requested.v1.json)
- Tasks
  - [candidate-projection-task.v1.json](contracts/tasks/candidate-projection-task.v1.json)
  - [job-enrich-task.v1.json](contracts/tasks/job-enrich-task.v1.json)
  - [resume-parse-task.v1.json](contracts/tasks/resume-parse-task.v1.json)

🔍 **AUDIT & REVIEWS**
- [Final Consolidated Synthesis (Antigravity)](Agent_review/final-antigravity.md)
- [Consolidated Codex Audit](Agent_review/final-codex.md)
- [Cline Independent Audit](Agent_review/Cline-testing-scenarios-audit.md)
- [Qoder Independent Audit](Agent_review/testing-scenarios-audit-qoder.md)
- [Freebuff Independent Audit](Agent_review/freebuf-testing-scenarios-audit.md)
- [Comprehensive Audit Report](Agent_review/MERGED_COMPREHENSIVE_AUDIT.md)

---

## Planned component navigation

> Component folders one-by-one बनाए जाएँगे। Folder बनने के बाद उसका README link
> यहाँ activate किया जाएगा।

1. [Requirements](01-requirements/README.md) — current, future और finalized product decisions
2. [Database](02-database/README.md) — authoritative migrations, schema docs, Supabase config, seeds, tests और flows
3. `03-nextjs-web/` — frontend application
4. [NestJS API](04-nestjs-api/README.md) — main backend/API
5. [Outbox Dispatcher NestJS](05-outbox-dispatcher-nestjs/README.md) — outbox publisher/dispatcher service
6. `06-google-cloud-tasks/` — managed queue configuration, IAM और retry policy
7. [FastAPI AI Worker](07-fastapi-ai-worker/README.md) — resume parsing, AI और embeddings

Cross-cutting areas:

- `docs/adr/` — approved architecture decisions और उनका reasoning
- `docs/architecture/` — cross-service diagrams और system views
- `contracts/` — APIs, events और Cloud Task payload contracts

## Navigation standard

```text
Main README
→ Component README
→ Detailed requirement / architecture / flow / test document
```

हर nested document में parent README और main README पर वापस जाने के links होंगे।
