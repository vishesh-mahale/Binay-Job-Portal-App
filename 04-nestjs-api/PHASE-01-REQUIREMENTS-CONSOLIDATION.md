# Phase 01 — NestJS API Requirements Consolidation

**Status:** Draft consolidation — not frozen; API paths and implementation plan intentionally not finalized.

**Scope:** Current curated requirements, approved product decisions, executable SQL, shared contracts, NestJS guide and related service contracts ko stable requirement IDs mein map karna.

## How to read this document

- `APPROVED` = current behavior/decision; implementation must honor it.
- `APPROVED DIRECTION` = architecture direction approved, exact API/UX detail still needs design.
- `PLANNED CURRENT` = current product scope, but supporting DB/API/UI work remains.
- `FUTURE` = roadmap; current NestJS implementation mein automatically include nahi hoga.
- `NEEDS_DECISION` = source mein open question; agent guess nahi karega.
- `GAP` = requirement hai lekin DB/contract/API support verify or add karna pending hai.

Source references are kept with every requirement. Table/function names executable baseline se verify hone hain; old names assumptions nahi hain.

### Phase 1 format and status mapping

Ye phase source-level consolidation hai, final acceptance/API specification nahi. Isliye domain tables mein DB/API/async impact compact form mein hai. Phase 2 matrix mein har requirement ke liye user flow, security/RLS, idempotency, rate limit, audit requirement aur acceptance criteria separately expand honge.

Working labels ka canonical mapping:

| Phase 1 label | Canonical status |
|---|---|
| `APPROVED`, `APPROVED DIRECTION`, `PLANNED CURRENT` | `REQUIRED` |
| `FUTURE` | `FUTURE` |
| `NEEDS_DECISION` | `NEEDS_CLARIFICATION` |
| `GAP` | `REQUIRED` + unresolved implementation gap |
| `REJECTED` | `REJECTED` |
| `CONFLICT` | `CONFLICT` |

## 1. Product and non-functional requirements

| ID | Requirement / behavior | Actor | Source | DB/API/async impact | Status |
|---|---|---|---|---|---|
| REQ-PLATFORM-001 | Secure multi-company recruitment/job portal with AI-assisted workflows; AI recruiter/hiring decision ko replace nahi karegi | All users | `PRODUCT-REQUIREMENTS.md` §1 | Cross-service module boundaries; audit and human-review rules | APPROVED |
| REQ-PLATFORM-002 | API, workers aur search components independently scale hone chahiye; large document processing aur concurrent users support | Platform | `NON-FUNCTIONAL-REQUIREMENTS.md` §§1–2 | Pagination, bounded queries, async outbox/worker; load tests | APPROVED TARGET |
| REQ-PLATFORM-003 | Normal API request deep parsing/embedding ka wait nahi karegi | Candidate, employer, HR | `NON-FUNCTIONAL-REQUIREMENTS.md` §3; `NESTJS-IMPLEMENTATION-GUIDE.md` §§5,9 | Business transaction + outbox; post-commit worker | APPROVED DIRECTION |
| REQ-PLATFORM-004 | Multi-row business operation atomic; partial business/history/outbox commit allowed nahi | All business workflows | `NON-FUNCTIONAL-REQUIREMENTS.md` §5; guide §5 | PostgreSQL transaction boundary; DB functions where required | APPROVED |
| REQ-PLATFORM-005 | Correlation/request/event IDs API → outbox → task → worker; liveness/readiness endpoints | Platform | `NON-FUNCTIONAL-REQUIREMENTS.md` §8; dispatcher/worker docs | Logging, metrics, health modules | APPROVED DIRECTION |
| REQ-PLATFORM-006 | Rate limiting, audit logging, secure documents, secret/PII protection and least-privilege roles | Platform | `NON-FUNCTIONAL-REQUIREMENTS.md` §4; `17_rls.sql` | Guards, RLS, audit tables, request limits; no secret in logs | APPROVED |
| REQ-PLATFORM-007 | Exact SLO/percentile, file-size and load-test thresholds decide karne hain | Platform owner | `NON-FUNCTIONAL-REQUIREMENTS.md` §§2–3 | Performance test acceptance criteria | NEEDS_DECISION |
| REQ-PLATFORM-008 | Responsive interfaces, keyboard-friendly controls aur screen-reader-friendly interaction support karna | All users | `NON-FUNCTIONAL-REQUIREMENTS.md` §9 | NestJS response/error consistency; UI accessibility validation and E2E acceptance criteria | PLANNED CURRENT |

## 2. Identity, accounts and authorization

| ID | Requirement / behavior | Actor | Source | DB/API/async impact | Status |
|---|---|---|---|---|---|
| REQ-AUTH-001 | Register, login, verification, session and password flows | Candidate, employer, HR, admin | `PRODUCT-REQUIREMENTS.md` §§2–3; `03_users_auth.sql`; guide §3 | `users`, auth provider/session/audit functions; AuthProvider adapter | APPROVED |
| REQ-AUTH-002 | Current account has one application role: `candidate`, `employer`, `hr`, `admin`; referral separate role nahi | All users | `PD-001`; `03_users_auth.sql`; guide §§3,21 | Role/status/tenant guards; request body role trust nahi karna | APPROVED |
| REQ-AUTH-003 | Authorization identity + active status + role + permission + company membership + resource ownership verify kare | All protected requests | `PRODUCT-REQUIREMENTS.md` §3; `17_rls.sql`; guide §4 | NestJS guards/decorators, RLS defense-in-depth | APPROVED |
| REQ-AUTH-004 | Browser ko service-role/database privileged credential nahi milega | Browser/API | `PRODUCT-REQUIREMENTS.md` §3; NFR §4; guide §3 | Server-only secret; explicit DB access model decision | APPROVED |
| REQ-AUTH-005 | Supabase access model: corrected controlled hybrid (approved personal/catalog reads via UserContextClient + RLS; business writes and system work via trusted SystemClient) | NestJS/platform | `PLAN-REQUIREMENTS-TO-IMPLEMENTATION-HINGLISH.md` §11; `DECISION-01-NESTJS-SUPABASE-ACCESS-MODEL-HINGLISH.md` | Separate UserContextClient/SystemClient, grants, transaction context and RLS behavior | REQUIRED / FROZEN |
| REQ-AUTH-006 | OAuth callback/verification NestJS-controlled flow se application user/status verify kare | OAuth user | `03_users_auth.sql`; guide §3 | Auth callback endpoint/use case; audit event | APPROVED DIRECTION |
| REQ-AUTH-007 | SSE status/notification stream, WebSocket chat, authenticated reconnect/recovery | UI users | Product requirements §15; plan §10; Decision-02 | Realtime gateway and status recovery API; exact paths/DTOs remain API catalog | REQUIRED / FROZEN |

## 3. Company, membership and employer/HR workflows

| ID | Requirement / behavior | Actor | Source | DB/API/async impact | Status |
|---|---|---|---|---|---|
| REQ-COMPANY-001 | Company profile, branches, departments, teams and members manage karna | Employer/owner | `PRODUCT-REQUIREMENTS.md` §5; `04_companies.sql`; guide §16 | Company/member repositories and ownership checks | APPROVED/PLANNED |
| REQ-COMPANY-002 | Employer/owner HR users invite/manage kare; permissions/company settings configurable | Employer/owner | Product §5; `04_companies.sql` | Membership invite/update transactions, audit/outbox as contract requires | APPROVED/PLANNED |
| REQ-COMPANY-003 | HR job, candidate, application, shortlist, interview, messaging/search workflows assigned permissions ke अनुसार use kare | HR | Product §5; `04_companies.sql`; guide §4 | Permission + company/tenant authorization on every use case | APPROVED/PLANNED |
| REQ-COMPANY-004 | Role alone resource access grant nahi karta; company membership/ownership verify hogi | Employer/HR/admin | Product §3; `17_rls.sql`; guide §4 | Guards + query predicates/RLS | APPROVED |
| REQ-COMPANY-005 | Membership deactivate/ownership/team relationship transitions safe/reassignable hon | Owner/admin | `04_companies.sql` executable rules | Guarded DB transitions and transactional API use cases | APPROVED DIRECTION |

## 4. Candidate onboarding and canonical profile

| ID | Requirement / behavior | Actor | Source | DB/API/async impact | Status |
|---|---|---|---|---|---|
| REQ-ONBOARDING-001 | Short onboarding; name, verified contact aur resume sufficient initial data ho sakta hai; long mandatory form first step nahi | Candidate | Product §7; `REQUIREMENT.txt` §5 | Candidate profile + document upload flow | APPROVED |
| REQ-CANDIDATE-001 | Candidate profile editable canonical professional facts maintain kare | Candidate | Product §4; guide §6,10 | `candidate_profiles` and canonical fact tables; ownership/RLS | APPROVED |
| REQ-CANDIDATE-002 | Skills, experience, education, projects, certifications, languages/links etc. relational canonical facts hon | Candidate | `08_candidates.sql`; guide §§6–7 | Fact repositories; soft-delete/revision rules | APPROVED |
| REQ-CANDIDATE-003 | One logical profile save with many fact changes increments `profile_revision` exactly once and emits one profile-change event | Candidate/API | `08_candidates.sql`; guide §§6,18 | Same transaction: facts + history + revision + `candidate.profile.changed` outbox | APPROVED |
| REQ-CANDIDATE-004 | AI evidence canonical facts ko silently overwrite nahi karegi; accept/correct merge audited transaction se hoga | Candidate/service | Product §4; guide §10; `08_candidates.sql` | Evidence status/content rules, revision bump, audit/outbox | APPROVED |
| REQ-CANDIDATE-005 | Candidate preferred work mode multi-select support kare | Candidate | `PD-004`; `08_candidates.sql` | DTO validation and profile persistence | APPROVED |
| REQ-CANDIDATE-006 | Profile search projection canonical tables se rebuildable hai; projection source of truth nahi | Recruiter/search worker | `08_candidates.sql`; `PD-002`; guide §7 | `candidate_search_profiles`, projection event/task | APPROVED |

## 5. Documents and resume processing

| ID | Requirement / behavior | Actor | Source | DB/API/async impact | Status |
|---|---|---|---|---|---|
| REQ-RESUME-001 | Resume/document private storage mein upload; type, size, signature, ownership and security validation | Candidate/guest | Product §8; `06_documents.sql`; guide §8 | Storage adapter + `uploaded_documents`; signed URL only | APPROVED DIRECTION |
| REQ-RESUME-002 | Heavy parsing asynchronous; UI deep AI processing ka wait nahi karegi | Candidate/platform | Product §8; NFR §3; guide §§8–9 | Parsing job + security scan + outbox/task chain | APPROVED DIRECTION |
| REQ-RESUME-003 | Parsing results/evidence historical/auditable; canonical profile separate concept | Candidate/service | Product §8; `07_resume_processing.sql`; guide §9–10 | Immutable parsed result/artifacts/evidence; status transitions | APPROVED |
| REQ-RESUME-004 | Same document reprocessing/history representable; one current active document role policy | Candidate | `PD-002`; `06_documents.sql`; guide §7–9 | Active document selection transaction + parsing idempotency | APPROVED |
| REQ-RESUME-005 | Clean upload ke baad security scan completion se parsing event; NestJS external worker ko synchronously call nahi karega | Candidate/service | Guide §§8–9; contracts `security-scan-requested.v1`, `resume-parse-requested.v1` | Transactional outbox events; dispatcher/worker | APPROVED DIRECTION |
| REQ-RESUME-006 | Parsing/projection progress UI ko live update aur reconnect/status endpoint se recover karni hai | Candidate | `PD-002`; guide §9 | Notification/realtime API contract | APPROVED DIRECTION |
| REQ-RESUME-007 | Immediate fast-track name extraction mandatory hai ya nahi, separately decide hoga | Candidate | Product §8; `REQUIREMENT.txt` §6; guide §9 | Optional endpoint/worker path only after decision | NEEDS_DECISION |

## 6. Jobs, search and matching

| ID | Requirement / behavior | Actor | Source | DB/API/async impact | Status |
|---|---|---|---|---|---|
| REQ-JOB-001 | Authorized company users jobs create/edit/publish/close/archive/manage kare | Employer/HR | Product §9; `05_jobs.sql`; guide §4 | Job lifecycle transaction, permission checks | APPROVED |
| REQ-JOB-002 | Job structured requirements: skills, location, work mode, compensation, experience and other approved fields | Employer/HR | Product §9; `05_jobs.sql` | DTO validation and job tables | APPROVED |
| REQ-JOB-003 | Job AI ideal candidate JSON/profile background workflow se generate/update ho sakta hai; API deep AI wait nahi karegi | Employer/AI worker | `05_jobs.sql` explanations; contracts job enrichment | Job write + `job.ai.enrichment.requested` outbox | APPROVED DIRECTION |
| REQ-SEARCH-001 | Candidate job search keyword/FTS, structured filters and semantic matching combine kare | Candidate | Product §9; `SEARCH-STRATEGY.md`; `05_jobs.sql` | Search query endpoints, pagination and indexes | APPROVED DIRECTION |
| REQ-SEARCH-002 | Job filters location, skill, experience, salary, company, job type, work mode, posted date | Candidate | Product §9; `05_jobs.sql` | Bounded/paginated query; filter validation | APPROVED |
| REQ-SEARCH-003 | Authorized recruiter canonical candidate projection search kare; raw evidence/internal fields blindly expose nahi honge | HR/employer | Product §10; `PD-002`; guide §7 | Visibility/tenant checks + projection query | APPROVED |
| REQ-SEARCH-004 | Matching result skills, experience, education, location, salary/approved factors separately explain kare; automatic hiring verdict nahi | Candidate/recruiter | Product §10; `REQUIREMENT.txt` §§8,17 | Match analysis task/event and response schema | APPROVED DIRECTION |
| REQ-SEARCH-005 | External search provider/Meilisearch adoption evidence/ADR ke baad; current PostgreSQL hybrid behavior baseline hai | Platform | `SEARCH-STRATEGY.md`; `05_jobs.sql` docs | No speculative provider API now | NEEDS_DECISION/FUTURE |

## 7. Applications and guest apply

| ID | Requirement / behavior | Actor | Source | DB/API/async impact | Status |
|---|---|---|---|---|---|
| REQ-APPLICATION-001 | Registered candidate job apply kare; application candidate profile se link ho | Candidate | Product §11; `09_applications.sql`; guide §11 | Apply transaction + submitted snapshot + outbox | APPROVED |
| REQ-APPLICATION-002 | Submission-time immutable application profile/snapshot historical truth ho; later profile/resume edits old submission nahi badlenge | Candidate/recruiter | `PD-003`; `09_applications.sql` | Immutable snapshot transaction | APPROVED |
| REQ-APPLICATION-003 | Guest job-scoped expiring upload/session se apply kar sake; full account ke liye force nahi | Guest candidate | Product §§7,11; `06_documents.sql`, `09_applications.sql`; guide §12 | Guest session/document/application transaction | APPROVED |
| REQ-APPLICATION-004 | Guest later verified claim/merge se application candidate account se link ho sake | Guest/candidate | Product §11; `09_applications.sql`; guide §12 | Claim identity immutable; merge/audit/outbox atomic | APPROVED |
| REQ-APPLICATION-005 | Application candidate consent/action ke baad hi bane; one candidate/normalized guest identity per job; repost = new `job_id` | Candidate/guest | `PD-003`; `09_applications.sql` | Unique constraints + API idempotency | APPROVED |
| REQ-APPLICATION-006 | Application status changes authorized, audited and history ke saath atomic hon; rejection reason current/history mein ho | HR/employer/admin | Product §12; `09_applications.sql`; guide §13 | Status function/use case + history + outbox | APPROVED |
| REQ-APPLICATION-007 | Candidate apply selected resume parsing pending hone par block nahi; available snapshot semantics follow hon | Candidate | `PD-003`; guide §11 | Apply transaction reads approved available state | APPROVED DIRECTION |

## 8. Referral system

| ID | Requirement / behavior | Actor | Source | DB/API/async impact | Status |
|---|---|---|---|---|---|
| REQ-REFERRAL-001 | Referral capability hai, separate recruiter/referrer role nahi; any eligible active authenticated user policy pass karke refer kar sakta hai | Any active user | `PD-001`; Manual referral requirement; guide §14 | `referrer_user_id` auth se derive; role body se trust nahi | APPROVED |
| REQ-REFERRAL-002 | First version manual multi-candidate referral: name, email, optional phone/note; preview/validation and duplicate handling | Referrer | `MANUAL-REFERRAL-REQUIREMENT.md` | Referral batch/invitation DTOs and validation | APPROVED |
| REQ-REFERRAL-003 | Creating referral invitation candidate profile/application automatically create nahi karega; candidate link open karke guest/register/apply decide karega | Referrer/candidate | Manual referral requirement | `referral_invitations`; application optional | APPROVED |
| REQ-REFERRAL-004 | Invitation email outbox/notification worker ke through; raw token sirf link generation mein, DB/log mein hash | Platform | Manual referral requirement; `09_applications.sql` | Invitation + outbox same transaction; token security | APPROVED |
| REQ-REFERRAL-005 | Referral application attribution only explicit approved invitation-confirmed flow mein; automatic attribution nahi | Referrer/candidate | Manual referral requirement; `09_applications.sql` | Application/referral attribution transaction + audit/outbox | APPROVED |
| REQ-REFERRAL-006 | Referral lifecycle, retry/reissue and reward states guarded; duplicate active invitation blocked | Platform | Manual referral requirement; `09_applications.sql` | State transition functions and indexes | APPROVED |
| REQ-REFERRAL-007 | Configurable company/admin referral programs and rewards: points/cash/other incentive | Company/admin | Product §14; `09_applications.sql` | Program/rule model, APIs, authorization, UI and tests still required | PLANNED CURRENT / GAP |

## 9. Interviews, messaging and notifications

| ID | Requirement / behavior | Actor | Source | DB/API/async impact | Status |
|---|---|---|---|---|---|
| REQ-INTERVIEW-001 | Interview availability, rolling slots, temporary lock and conflict/double-booking prevention | Candidate/recruiter | Product §13; `10_interviews.sql` | Slot locking transaction and status history | APPROVED DIRECTION |
| REQ-INTERVIEW-002 | Participants, feedback, calendar updates, reminders and lifecycle notifications | Candidate/recruiter | Product §13; `10_interviews.sql` | Interview transaction + notification/outbox events | APPROVED DIRECTION |
| REQ-INTERVIEW-003 | External calendar/video integration future roadmap; current API must not invent provider contract | Platform | Product §13 | Future ADR/contract | FUTURE |
| REQ-MESSAGE-001 | Authorized conversation participants messaging kar sakte hain | Candidate/HR/employer | Product §15; `11_messaging.sql` | Participant authorization, message persistence and realtime delivery | APPROVED DIRECTION |
| REQ-NOTIFY-001 | Application, resume processing, interview, shortlist, selection/rejection, message, referral and employer events notify users | Platform | Product §15; `12_notifications.sql` | Notification records + outbox/email workers | APPROVED DIRECTION |
| REQ-NOTIFY-002 | Email delivery event, preference, policy, rate limit and template ke according; unconditional every event nahi | Platform | Product §15; guide §15 | Notification/email adapter, retry/idempotency | APPROVED |
| REQ-NOTIFY-003 | Admin-manageable email templates: approved variables, preview, version history, activation and safe rendering | Admin | Product §15 | `notification_templates` evaluation/extension, APIs/UI/tests | PLANNED CURRENT / GAP |
| REQ-REALTIME-001 | UI ko relevant status/messages/notifications manual refresh ke bina milne chahiye; SSE status, WebSocket chat, REST recovery | Users | Product §15; `PD-002`; guide §§9,15; Decision-02 | Realtime gateway and authoritative status recovery API; exact paths/DTOs remain API catalog | REQUIRED / FROZEN |

## 9A. Recruiter saved candidates

| ID | Requirement / behavior | Actor | Source | DB/API/async impact | Status |
|---|---|---|---|---|---|
| REQ-SAVED-CANDIDATE-001 | Authorized HR/employer candidate search/profile se private, non-job-specific bookmark kare; same HR + candidate ek hi baar; optional note | Employer/HR | `PRODUCT-REQUIREMENTS.md` §15A; `09_applications.sql` explanation; Decision-04 | `saved_candidates` model, ownership, NestJS APIs, UI and tests required; existing `saved_jobs` is not sufficient | REQUIRED / FROZEN |

## 10. Analytics, feedback and subscriptions

| ID | Requirement / behavior | Actor | Source | DB/API/async impact | Status |
|---|---|---|---|---|---|
| REQ-ANALYTICS-001 | Job views/applications/conversions, registrations, referral performance, recruiter/candidate activity, funnel and interview metrics capture | Platform/admin/company | Product §16; `13_analytics.sql` | Analytics events/aggregates, async update path | PLANNED |
| REQ-FEEDBACK-001 | Registered aur guest users platform/recruitment feedback submit kar sakte hain | User/guest | Product §16; `18_feedback.sql` | Feedback API, anti-abuse and moderation rules | PLANNED |
| REQ-SUBSCRIPTION-001 | Company subscription, plans, invoices, coupons and commercial status representable; payment provider separate approved contract | Company/admin | Product §16; `14_subscriptions.sql` | Subscription APIs and authorization | PLANNED / PAYMENT GAP |

## 11. AI screening and recommendations

| ID | Requirement / behavior | Actor | Source | DB/API/async impact | Status |
|---|---|---|---|---|---|
| REQ-AI-001 | Contextual screening questions resume evidence, job requirements and approved employer preferences se generate ho sakte hain | Candidate/recruiter | Product §17; `REQUIREMENT.txt` §9 | Worker task/event, versioned output and persistence contract | PLANNED |
| REQ-AI-002 | Candidate/job recommendations aur gap analysis explainable structured output ho | Candidate/recruiter | Product §§10,17; contracts match/screening | Match/screening APIs and worker events | PLANNED |
| REQ-AI-003 | AI output structured/versioned, source/model/version traceable, unverified claim canonical fact nahi, human review/override supported | Platform/recruiter | Product §17; NFR §6; worker docs | Evidence/provenance persistence and review API | APPROVED DIRECTION |
| REQ-AI-004 | Exact provider/model product requirement nahi; replaceable provider ADR/contract se decide hoga | Platform | Product §17; AI research docs | Provider adapter; no provider hard-code in API contract | NEEDS_DECISION |

## 12. Cross-cutting API behavior contract

| ID | Requirement / behavior | Actor | Source | DB/API/async impact | Status |
|---|---|---|---|---|---|
| REQ-API-001 | Har protected endpoint identity, account status, role, permission, tenant/resource ownership verify kare | API clients | Product §3; `17_rls.sql`; guide §4 | Guards/decorators/policy services | APPROVED |
| REQ-API-002 | Request DTO validation backend par repeat hogi; frontend validation trusted nahi | API clients | Manual referral requirement; NFR | DTO schemas, normalized email/phone and error contract | APPROVED |
| REQ-API-003 | Idempotency duplicate apply/referral/upload/event behavior explicitly define kare | API/platform | `09_applications.sql`, `15_infrastructure.sql`, guide §§5,11,14 | Idempotency keys/unique constraints/processed events | APPROVED DIRECTION |
| REQ-API-004 | Business write + audit/history + outbox same transaction; external queue/email/worker call transaction ke andar nahi | API/platform | Guide §§5,15; `15_infrastructure.sql` | Transaction manager and OutboxWriterModule | APPROVED |
| REQ-API-005 | Event/task contracts root `contracts/` mein versioned; breaking change par new version | API/dispatcher/worker | `contracts/README.md`, G1 alignment | Contract tests and producer/consumer rollout | APPROVED |
| REQ-API-006 | API OpenAPI useful hai, lekin shared versioned contracts ka replacement nahi | API consumers | Guide §20 | API catalog + machine-readable contract | APPROVED |
| REQ-API-007 | API errors actionable, no PII/secrets in logs/responses; request/event trace IDs consistent | Platform | NFR §§4,8; dispatcher/worker logging | Error mapper and observability | APPROVED |

## 13. Consolidated gaps and decisions

Ye items source mein present hain, lekin coding se pehle decision/contract chahiye:

| Gap/decision | Why it matters | Owner/status |
|---|---|---|
| Supabase access model: per-user JWT/RLS vs trusted backend database role | Har repository, transaction and RLS behavior depend karega | Product/architecture decision pending |
| WebSocket vs SSE vs Supabase Realtime/Broadcast | Notifications, messaging and parsing status transport | ADR pending |
| Exact API endpoint paths/versioning | Requirements behavior hai, paths freeze nahi | API catalog phase |
| Exact SLO, latency, file-size and 1000-event/load thresholds | NFR acceptance tests measurable nahi yet | Product/ops decision pending |
| Fast-track name extraction | Source itself `NEEDS_DECISION` hai | Product/UX decision pending |
| Configurable referral program/rule tables and APIs | Existing operational referral records sufficient nahi | DB/API design gap |
| Saved candidates model/API | Existing `saved_jobs` requirement satisfy nahi karta | DB/API design gap |
| Email templates management model | `notification_templates` foundation evaluate/extend karni hai | API/DB design gap |
| Payment provider contract | Subscription tables foundation hai, provider behavior approved nahi | Future/needs contract |
| Exact AI provider/model and cost policy | Replaceable provider required | ADR/provider decision pending |
| Existing dispatcher route coverage | Current dispatcher phased; valid but unrouted events expected phased gaps hain | Per-phase implementation |

## 14. Consolidation rules for Phase 2

1. Har `REQ-*` ID ko exact source section/line references ke saath traceability matrix mein map karna.
2. Har DB write ke liye owning NestJS module/use case aur approved table/function identify karna.
3. Har async side effect ke liye exact event contract, dispatcher route aur worker consumer map karna.
4. `PLANNED CURRENT`, `FUTURE`, `NEEDS_DECISION` ko ek status mein silently merge nahi karna.
5. Duplicate feature names (Interview Schedule, Notifications, Messages, Referrals) ko single requirement IDs ke under merge karna, source references retain karna.
6. Missing DB/API/contract support ko `GAP` mark karna; implementation se pehle resolve karna.
7. Is draft ko final authority tabhi maana jayega jab Phase 2–5 complete aur user-approved hon.

## 15. Client feature-ledger reconciliation

`01-requirements/source-inputs/CLIENT-REQUIRED-FUTURE-CATEGORIZED.md` ko page list ke roop mein blindly implement nahi kiya gaya. Uske features ko current curated requirements ke against reconcile kiya gaya:

| Ledger item/group | Consolidation treatment |
|---|---|
| Candidate profile, resume, jobs, applications | `REQ-CANDIDATE-*`, `REQ-RESUME-*`, `REQ-JOB-*`, `REQ-APPLICATION-*` |
| Interview Schedule, Notifications, Messages/Chat | `REQ-INTERVIEW-*`, `REQ-NOTIFY-*`, `REQ-MESSAGE-*`, `REQ-REALTIME-*` |
| Referral Feature | `REQ-REFERRAL-*`; manual referral approved, configurable programs planned current/gap |
| Guest Apply | `REQ-APPLICATION-003` and `REQ-APPLICATION-004` |
| Secure identity verification | `REQ-AUTH-*` and guest claim rules; exact method needs contract/decision where unspecified |
| Email notifications/templates | `REQ-NOTIFY-001` to `REQ-NOTIFY-003` |
| AI screening questions | `REQ-AI-001` |
| AI matching/recommendations/gap analysis | `REQ-SEARCH-004`, `REQ-AI-002`, `REQ-AI-003` |
| Recruiter saved candidates | `REQ-SAVED-CANDIDATE-001`; Product §15A explicitly requires a separate model/API, existing `saved_jobs` is not a replacement |
| Accessibility | `REQ-PLATFORM-008`; responsive, keyboard-friendly and screen-reader-friendly UI requirement |
| Explicit future pages/features | `FUTURE`; current API scope mein automatically include nahi |
| Commercial cost/timeline/infrastructure promise | Product/commercial note; API requirement nahi |

No `REJECTED` feature silently remove nahi kiya gaya. Later source conflict milega to Phase 2 mein `CONFLICT`/`NEEDS_CLARIFICATION` record hoga.

**Phase 1 status:** `DRAFT CONSOLIDATION COMPLETE — TRACEABILITY/GAP ANALYSIS NEXT`

**Next deliverable:** `PHASE-02-REQUIREMENTS-TRACEABILITY-MATRIX.md`
