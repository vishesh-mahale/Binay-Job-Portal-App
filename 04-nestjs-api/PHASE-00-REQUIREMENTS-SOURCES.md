# Phase 00 — NestJS API Requirements Source Inventory

**Status:** In progress — inventory created; requirement interpretation and consolidation not started.

**Purpose:** `04-nestjs-api` ke liye relevant requirement, database, contract, service aur architecture sources ko identify karna. Ye file authority decide karne ka map hai; isme abhi requirements ko merge ya approve nahi kiya gaya hai.

## Authority rule

Conflict hone par current repository ke rules ke अनुसार priority:

1. `AGENTS.md`
2. Approved ADRs/product decisions
3. Executable database baseline `02-database/migrations/baseline/01–18`
4. Shared machine-readable contracts in `contracts/`
5. Existing executable service code/tests
6. Current curated requirements and explanatory documents
7. Old reviews, drafts, raw source inputs and old `Binay-App` reference material

`19_supabase_webhook_prerequisites.sql` schema baseline nahi hai; ye webhook operational prerequisite/fallback hai.

## Classification values

| Classification | Meaning |
|---|---|
| `AUTHORITY` | Conflict mein primary source |
| `CURRENT-REQUIREMENT` | Current product behavior input |
| `PRODUCT-DECISION` | Explicit approved business decision |
| `EXECUTABLE-CONTRACT` | SQL, API/event/task contract ya code behavior |
| `SUPPORTING` | Explanation/flow/documentation; executable truth nahi |
| `FUTURE` | Roadmap ya later scope |
| `RESEARCH` | Investigation/reference; commitment nahi |
| `REVIEW-EVIDENCE` | Agent/audit evidence; authority nahi |
| `NEEDS-REVIEW` | Source scan ho gaya, interpretation pending |

## A. Repository governance and navigation

| Source | Classification | NestJS API use |
|---|---|---|
| `AGENTS.md` | `AUTHORITY` | Working rules, conflict handling, security, migration/change discipline |
| `README.md` | `SUPPORTING` | Repository navigation and component links |
| `PROJECT-CONTEXT-MAP.md` | `SUPPORTING` | Component ownership and cross-service context |
| `MIGRATION-PLAN-HINGLISH.md` | `AUTHORITY` for migration process | Source classification, component order and migration boundaries |
| `MIGRATION-COVERAGE-AUDIT.md` | `REVIEW-EVIDENCE` | Old-to-new migration traceability |
| `docs/adr/` | `AUTHORITY` when ADR is accepted | Technical decisions and supersession history |
| `docs/architecture/` | `SUPPORTING` / accepted architecture input | Cross-service boundaries and diagrams |
| `Agent_review/` | `REVIEW-EVIDENCE` | Independent validation only; never silently overrides authority |

## B. Product requirements

| Source | Classification | NestJS API use |
|---|---|---|
| `01-requirements/current/PRODUCT-REQUIREMENTS.md` | `CURRENT-REQUIREMENT` | Curated product behavior, approved/planned scope, links to product decisions |
| `01-requirements/current/NON-FUNCTIONAL-REQUIREMENTS.md` | `CURRENT-REQUIREMENT` | Performance, availability, security, scalability and operational constraints |
| `01-requirements/current/MANUAL-REFERRAL-REQUIREMENT.md` | `CURRENT-REQUIREMENT` | Manual referral input, invitation and application behavior |
| `01-requirements/current/MANUAL-REFERRAL-SUMMARY-HINGLISH.md` | `SUPPORTING` | Referral flow explanation/navigation |
| `01-requirements/source-inputs/REQUIREMENT.txt` | `NEEDS-REVIEW` raw input | Detailed raw vision, roles, workflows, AI, search, security and scale requirements |
| `01-requirements/source-inputs/CLIENT-REQUIRED-FUTURE-CATEGORIZED.md` | `NEEDS-REVIEW` raw client ledger | Feature/page inventory; current vs future classification input |
| `01-requirements/Binay-discussion/` | `NEEDS-REVIEW` | Original client documents, chat and audio evidence; transcribe/review before claiming coverage |
| `01-requirements/product-decisions/PD-001-ACCOUNT-AND-REFERRAL-ROLES.md` | `PRODUCT-DECISION` | Account role and referral eligibility |
| `01-requirements/product-decisions/PD-002-ACTIVE-RESUME-SEARCH.md` | `PRODUCT-DECISION` | Active resume/search visibility behavior |
| `01-requirements/product-decisions/PD-003-APPLICATION-HISTORY.md` | `PRODUCT-DECISION` | Application snapshot/history semantics |
| `01-requirements/product-decisions/PD-004-MULTI-SELECT-WORK-MODE.md` | `PRODUCT-DECISION` | Work-mode data and selection behavior |
| `01-requirements/future/FUTURE-ROADMAP.md` | `FUTURE` | Roadmap only; do not implement as current API without approval |
| `01-requirements/future/-- pending-items-for-future.md` | `FUTURE` | Pending/current-scope candidates to verify individually |
| `01-requirements/future/FAST-API*`, `FUTURE-API-LIVE-E2E-TESTING-GUIDE.md` | `FUTURE` / supporting | FastAPI future work; use only where current service contract agrees |
| `01-requirements/SOURCE-CLASSIFICATION.md` | `REVIEW-EVIDENCE` | Old source migration map |

## C. Database executable contract

| Source | Classification | NestJS API use |
|---|---|---|
| `02-database/migrations/baseline/01_extensions.sql` | `EXECUTABLE-CONTRACT` | PostgreSQL extensions and database capability |
| `02-database/migrations/baseline/02_enums.sql` | `EXECUTABLE-CONTRACT` | Shared enum values |
| `03_users_auth.sql` | `EXECUTABLE-CONTRACT` | Users, roles, account status, auth audit and guards |
| `04_companies.sql` | `EXECUTABLE-CONTRACT` | Companies, memberships, branches, departments, teams and ownership |
| `05_jobs.sql` | `EXECUTABLE-CONTRACT` | Jobs, structured requirements, AI/search fields and job lifecycle |
| `06_documents.sql` | `EXECUTABLE-CONTRACT` | Uploaded documents, ownership and document associations |
| `07_resume_processing.sql` | `EXECUTABLE-CONTRACT` | Parsing jobs/results/artifacts and resume processing lifecycle |
| `08_candidates.sql` | `EXECUTABLE-CONTRACT` | Canonical profile, facts, evidence, revisions and search projection |
| `09_applications.sql` | `EXECUTABLE-CONTRACT` | Registered/guest applications, snapshots, referrals and saved jobs |
| `10_interviews.sql` | `EXECUTABLE-CONTRACT` | Interview scheduling, slots, feedback and lifecycle |
| `11_messaging.sql` | `EXECUTABLE-CONTRACT` | Conversations, participants and messages |
| `12_notifications.sql` | `EXECUTABLE-CONTRACT` | In-app/email notification state and templates |
| `13_analytics.sql` | `EXECUTABLE-CONTRACT` | Analytics events/aggregates |
| `14_subscriptions.sql` | `EXECUTABLE-CONTRACT` | Plans, subscriptions, billing foundation |
| `15_infrastructure.sql` | `EXECUTABLE-CONTRACT` | Outbox, processed events, leases and infrastructure functions |
| `16_indexes.sql` | `EXECUTABLE-CONTRACT` | Query/index behavior |
| `17_rls.sql` | `AUTHORITY` executable security contract | RLS, grants and database authorization boundary |
| `18_feedback.sql` | `EXECUTABLE-CONTRACT` | Registered/guest feedback |
| `19_supabase_webhook_prerequisites.sql` | `SUPPORTING` operational fallback | `pg_net`/webhook prerequisite only; not business schema |
| `19-EASY-GUIDE-DEV-PROD-WEBHOOK-SECRET-SETUP.md` | `SUPPORTING` | Webhook, secret binding and environment setup |
| `19_IMP-Follow-Section-8-9-of-19SQL_file.md` | `SUPPORTING` | Webhook setup directive |
| `02-database/flows/` | `SUPPORTING` | End-to-end DB flow examples and visibility tests |
| `02-database/RLS-REVIEW-CHECKLIST.md` | `REVIEW-EVIDENCE` | RLS verification checklist |
| `02-database/schema-docs/` | `SUPPORTING` | Human explanations; SQL files remain executable truth |
| `02-database/README.md` | `SUPPORTING` | Database navigation and execution order |

Each SQL table/function referenced by a NestJS use case must be verified against the actual executable baseline; old schema names are not valid assumptions.

## D. Shared contracts

| Source | Classification | NestJS API use |
|---|---|---|
| `contracts/README.md` | `EXECUTABLE-CONTRACT` | Contract ownership and versioning rules |
| `contracts/AGGREGATE-ID-SEMANTICS.md` | `EXECUTABLE-CONTRACT` | Event aggregate identity semantics |
| `contracts/G1-ENVELOPE-ALIGNMENT.md` | `EXECUTABLE-CONTRACT` | Envelope alignment between producer, dispatcher and worker |
| `contracts/events/*.v1.json` | `EXECUTABLE-CONTRACT` | Outbox event names, versions and payload schemas |
| `contracts/tasks/*.v1.json` | `EXECUTABLE-CONTRACT` | Cloud Tasks payload and worker task contract |
| `contracts/api/` | `EXECUTABLE-CONTRACT` if/when populated | NestJS public API request/response contracts |

Existing versions must not be silently mutated when a breaking change requires a new contract version.

## E. NestJS API-specific sources

| Source | Classification | NestJS API use |
|---|---|---|
| `04-nestjs-api/NESTJS-IMPLEMENTATION-GUIDE.md` | `CURRENT architecture/service input` | Responsibilities, transaction boundaries, auth, DB access and service expectations; mandatory section coverage audit |
| `04-nestjs-api/PLAN-REQUIREMENTS-TO-IMPLEMENTATION-HINGLISH.md` | `AUTHORITY planning process` | Phase gates, deliverables and coding start gate |
| `04-nestjs-api/README.md` | `SUPPORTING` | Component navigation and ownership |
| `04-nestjs-api/04-nestjs-api-app/` | `NOT IMPLEMENTED` | Reserved NestJS application code directory; currently empty |

## F. Outbox Dispatcher and background processing

| Source | Classification | NestJS API use |
|---|---|---|
| `05-outbox-dispatcher-nestjs/README.md` | `EXECUTABLE component contract` | Dispatcher responsibility and boundaries |
| `05-outbox-dispatcher-nestjs/IMPLEMENTATION-PLAN.md` | `EXECUTABLE component plan` | Dispatcher DB claiming, routing, Cloud Tasks, retries and security |
| `05-outbox-dispatcher-nestjs/IMPLEMENTATION-PENDING.md` | `REVIEW-EVIDENCE / pending gates` | Remaining production work; not API business requirements |
| `05-outbox-dispatcher-nestjs/src/` and tests | `EXECUTABLE code` | Existing route/event/task behavior to integrate with |
| `05-outbox-dispatcher-nestjs/TESTING-SCENARIOS-1.md` | `SUPPORTING test contract` | Failure, concurrency and E2E scenarios |
| `05-outbox-dispatcher-nestjs/RUNBOOK-DEAD-LETTER.md` | `SUPPORTING operational contract` | Dead-letter handling and replay constraints |
| `docs/architecture/background-processing/` | `CURRENT architecture` | Webhook wake, Google Cloud Scheduler recovery, Cloud Tasks and FastAPI flow |
| `06-google-cloud-tasks-queue/` | `EXECUTABLE infrastructure config` | Queue, IAM, retry and deployment configuration |

## G. FastAPI AI Worker sources

| Source | Classification | NestJS API use |
|---|---|---|
| `07-fastapi-ai-worker/README.md` | `EXECUTABLE component contract` | Worker responsibilities and task endpoints |
| `07-fastapi-ai-worker/app/` | `EXECUTABLE code` | Actual task handlers, persistence and AI behavior |
| `07-fastapi-ai-worker/tests/` | `EXECUTABLE tests` | Worker contract and failure behavior |
| `07-fastapi-ai-worker/pyproject.toml` / `uv.lock` | `EXECUTABLE dependency contract` | Runtime/dependency facts |
| `07-fastapi-ai-worker/Dockerfile` | `EXECUTABLE deployment` | Container/runtime behavior |
| `07-fastapi-ai-worker/sample_resumes/` | `TEST DATA` | Non-production test fixtures only |

## H. Research and non-authoritative evidence

| Source | Classification | Rule |
|---|---|---|
| `docs/research/ai/` | `RESEARCH` | Provider/parser research; current behavior requires ADR/contract approval |
| `Agent_review/` | `REVIEW-EVIDENCE` | Cross-check findings; never override SQL/ADR/contract |
| `scratch/` | `TEST/DIAGNOSTIC` | Development verification only; no business requirement authority |
| Old `Binay-App/` | `REFERENCE ONLY` | Do not copy blindly; use only to trace migration/history |

## Inventory result and next action

Phase 0 inventory is structurally complete. The following items remain **review tasks**, not silently accepted requirements:

1. `01-requirements/Binay-discussion/` audio/docx evidence coverage;
2. section-by-section coverage of `NESTJS-IMPLEMENTATION-GUIDE.md`;
3. all `PRODUCT-REQUIREMENTS.md` rules mapped to DB/contracts/API candidates;
4. current vs future classification from raw sources reconciled with product decisions;
5. Supabase access model (user JWT/RLS vs trusted backend database role) recorded as an explicit decision;
6. transport choice (WebSocket/SSE/Supabase Realtime) recorded as an ADR;
7. contract versioning and API contract gaps recorded.

**Phase 0 status:** `INVENTORY COMPLETE — CONSOLIDATION NOT STARTED`

**Next deliverable:** `PHASE-01-REQUIREMENTS-CONSOLIDATION.md`
