# Phase 02 — NestJS API Requirements Traceability Matrix

**Status:** Draft — traceability started; gaps and decisions intentionally visible.

**Purpose:** Phase 1 ke har `REQ-*` ko source, DB contract, NestJS use case, transaction, event/worker, security, idempotency, rate-limit, audit aur acceptance surface se map karna.

`TBD` ka matlab missing decision/contract hai; agent is value ko assume karke implementation nahi karega.

Readability ke liye matrix mein related fields grouped hain. Grouped value ke andar DB, API, transaction, outbox event, dispatcher route aur consumer ko separately identify kiya gaya hai; missing value ko explicit `TBD/NEEDS_DECISION` mark kiya gaya hai.

## 1. Cross-cutting policy references

| Code | Applies to | Rule / evidence |
|---|---|---|
| SEC-01 | Protected API | Authenticated user + account status + role + permission + tenant/resource ownership; `17_rls.sql`, Product §3, guide §4 |
| SEC-02 | Browser | Service-role/database privileged secret browser ko nahi; server-only adapter |
| SEC-03 | Candidate/guest data | Consent, privacy, signed/private document access and PII-redacted logs |
| TX-01 | Business write | Canonical row + history/audit + outbox same PostgreSQL transaction; external network call transaction ke andar nahi |
| IDEM-01 | Mutating request | DB unique constraint/idempotency key or approved DB function; exact key per API catalog TBD |
| IDEM-02 | Async event | `processed_events`/event identity and deterministic task behavior |
| RATE-01 | Public/auth endpoints | Limit/burst/window values TBD; no endpoint goes live without a policy decision |
| AUD-01 | Security/business mutation | Actor, reason/context, correlation ID and timestamps where schema supports it |
| OBS-01 | All service calls | request ID, trace ID, event ID and structured error; no secrets/PII in logs |
| TEST-01 | Every API | happy path + authorization failure + validation failure + transaction rollback + idempotency test |

## 2. Matrix columns

| Column | Meaning |
|---|---|
| Flow | User/request start se end tak short sequence |
| Source/DB | Exact source and executable DB objects |
| API/use case | NestJS business operation; HTTP path freeze nahi hua to `TBD` |
| Tx/event/consumer | Transaction boundary, outbox event, dispatcher route and worker |
| Controls | Security, idempotency, rate limit and audit reference |
| Acceptance/status | Testable condition and canonical status |

## 3. Platform and non-functional

| ID | Flow | Source/DB | API/use case | Tx/event/consumer | Controls | Acceptance/status |
|---|---|---|---|---|---|---|
| REQ-PLATFORM-001 | User enters secure portal → role workflow | Product §1; all baseline | API boundary and module ownership; path TBD | Domain transactions/events per feature | SEC-01, OBS-01 | AI assists, human decision remains; REQUIRED |
| REQ-PLATFORM-002 | High load request/list → bounded response; workers scale separately | NFR §§1–2; indexes | Paginated query/use cases | Async heavy work; queue/worker | RATE-01, OBS-01 | Load thresholds TBD; REQUIRED + decision |
| REQ-PLATFORM-003 | API accepts upload/business command → returns without deep AI wait | NFR §3; guide §§5,9 | Command returns accepted/status; path TBD | TX-01 + outbox → dispatcher/worker | IDEM-01, OBS-01 | Deep processing never blocks normal request; REQUIRED |
| REQ-PLATFORM-004 | Multi-row operation → all rows commit or rollback | NFR §5; `15_infrastructure.sql` | Transactional use-case service | TX-01 | AUD-01, TEST-01 | Failure leaves no partial business/history/outbox data; REQUIRED |
| REQ-PLATFORM-005 | Request/event/task/worker correlation | NFR §8; service docs | Health/readiness and observability adapters | Event/task trace propagation | OBS-01 | IDs queryable across flow; REQUIRED |
| REQ-PLATFORM-006 | Request/data access → policy checks and protected persistence | NFR §4; `17_rls.sql` | Guards/policy services | Audit/outbox where mutation | SEC-01–03, RATE-01, AUD-01 | Unauthorized/secret leakage tests pass; REQUIRED |
| REQ-PLATFORM-007 | Define SLO/file/load acceptance | NFR §§2–3 | N/A until decision | N/A | RATE-01 | Numeric thresholds approved; NEEDS_CLARIFICATION |
| REQ-PLATFORM-008 | User opens UI → responsive/keyboard/screen-reader controls | NFR §9 | API error/validation responses accessible to UI | N/A | TEST-01 | Accessibility acceptance tests pass; REQUIRED |

## 4. Identity and authorization

| ID | Flow | Source/DB | API/use case | Tx/event/consumer | Controls | Acceptance/status |
|---|---|---|---|---|---|---|
| REQ-AUTH-001 | Signup/login/verify/session/password | Product §§2–3; `03_users_auth.sql` | Auth commands/controllers; exact paths TBD | Auth/audit transaction | SEC-01/02, IDEM-01, AUD-01 | Valid flow works; inactive/invalid account rejected; REQUIRED |
| REQ-AUTH-002 | Authenticated user gets one application role | PD-001; `03_users_auth.sql`; guide §§3,21 | Role load/guard | Role change audit if allowed | SEC-01, AUD-01 | Referral role is never required; REQUIRED |
| REQ-AUTH-003 | Request → identity/status/role/permission/tenant/ownership checks | Product §3; `17_rls.sql`; guide §4 | Policy guard/decorator | N/A | SEC-01 | Cross-tenant/resource access denied; REQUIRED |
| REQ-AUTH-004 | Browser calls API without privileged DB secret | Product §3; NFR §4 | Server adapter only | N/A | SEC-02, OBS-01 | Secret absent from browser/log/response; REQUIRED |
| REQ-AUTH-005 | Use the approved controlled-hybrid DB access model | Plan §11; `17_rls.sql`; Decision-01 | UserContextClient only for approved personal/catalog reads; SystemClient for business transactions and workers | N/A | SEC-01/02 | Client separation, RLS read tests and trusted-write authorization tests pass; REQUIRED |
| REQ-AUTH-006 | OAuth callback → verify token → load app user/status | `03_users_auth.sql`; guide §3 | OAuth callback/verification use case; path TBD | Auth audit event if defined | SEC-01/02, IDEM-01, AUD-01 | Unverified/inactive state handled; REQUIRED |
| REQ-AUTH-007 | Realtime connection → authenticate/authorize/reconnect | Product §15; PD-002; guide §§9,15; Decision-02 | RealtimeModule: SSE user stream + WebSocket chat gateway; exact paths/DTOs in API catalog | Notification/status events after commit | SEC-01, IDEM-02 | Authenticated reconnect and tenant isolation tests; REQUIRED |

## 5. Company and membership

| ID | Flow | Source/DB | API/use case | Tx/event/consumer | Controls | Acceptance/status |
|---|---|---|---|---|---|---|
| REQ-COMPANY-001 | Owner creates/edits company/branch/department/team/member | Product §5; `04_companies.sql`; guide §16 | Company/member commands; paths TBD | TX-01; event TBD by contract | SEC-01, IDEM-01, AUD-01 | Authorized owner changes persist; REQUIRED |
| REQ-COMPANY-002 | Owner invites/manages HR and permissions | Product §5; `04_companies.sql` | Membership invite/update | TX-01 + notification event if contract approved | SEC-01, IDEM-01, AUD-01 | Unauthorized company member cannot manage; REQUIRED |
| REQ-COMPANY-003 | HR uses assigned job/candidate/application/interview/message/search permissions | Product §5; `04_companies.sql` | Permissioned use cases | Domain events per mutation | SEC-01, RATE-01, AUD-01 | Permission matrix tests; REQUIRED |
| REQ-COMPANY-004 | Role alone never grants resource access | Product §3; `17_rls.sql`; guide §4 | Policy service on every resource use case | N/A | SEC-01 | Same role in different company cannot cross-read/write; REQUIRED |
| REQ-COMPANY-005 | Deactivate/ownership/team relationship safely reassigns/blocks | `04_companies.sql` | Guarded membership transition | TX-01 + audit | SEC-01, IDEM-01, AUD-01 | Unsafe deactivation returns actionable error; REQUIRED DIRECTION |

## 6. Candidate and onboarding

| ID | Flow | Source/DB | API/use case | Tx/event/consumer | Controls | Acceptance/status |
|---|---|---|---|---|---|---|
| REQ-ONBOARDING-001 | Candidate registers → minimal contact/name/resume → progressively completes profile | Product §7; raw §5 | Onboarding/profile commands; paths TBD | Profile/document transaction; event TBD | SEC-01/03, IDEM-01, AUD-01 | Long mandatory first form not required; REQUIRED |
| REQ-CANDIDATE-001 | Candidate reads/edits canonical professional profile | Product §4; guide §6; `08_candidates.sql` | Profile read/update | TX-01 + profile event | SEC-01/03, IDEM-01, AUD-01 | Only owner edits; REQUIRED |
| REQ-CANDIDATE-002 | Candidate facts stored relationally | `08_candidates.sql`; guide §6 | Fact CRUD/merge commands | TX-01 | SEC-01/03, IDEM-01, AUD-01 | Fact constraints and soft-delete rules honored; REQUIRED |
| REQ-CANDIDATE-003 | One logical multi-fact save → revision +1 and one change event | `08_candidates.sql`; guide §§6,18 | Profile save command | TX-01 → `candidate.profile.changed` → projection consumer | SEC-01, IDEM-01/02, AUD-01 | Exactly one revision/event; REQUIRED |
| REQ-CANDIDATE-004 | AI suggestion → candidate accept/correct → canonical merge | Product §4; guide §10 | Evidence review/merge command | TX-01 + projection event | SEC-01/03, IDEM-01, AUD-01 | Evidence immutable/status rules; REQUIRED |
| REQ-CANDIDATE-005 | Candidate selects multiple work modes | PD-004; `08_candidates.sql` | Profile preference update | TX-01 + profile event | SEC-01, IDEM-01 | Multi-select persists/validates; REQUIRED |
| REQ-CANDIDATE-006 | Canonical facts/active resume → rebuild search projection | PD-002; `08_candidates.sql`; guide §7 | Projection status/read endpoint TBD | `candidate.profile.changed`/projection event → dispatcher/worker | SEC-01, IDEM-02, OBS-01 | Projection revision cannot be stale after successful processing; REQUIRED |

## 7. Documents and resume

| ID | Flow | Source/DB | API/use case | Tx/event/consumer | Controls | Acceptance/status |
|---|---|---|---|---|---|---|
| REQ-RESUME-001 | Upload → validate ownership/type/size/signature → private storage record | Product §8; `06_documents.sql`; guide §8 | Document upload/read/signed URL commands | TX-01; `security.scan.requested` | SEC-01/03, IDEM-01, RATE-01, AUD-01 | Invalid/private access blocked; REQUIRED |
| REQ-RESUME-002 | Upload accepted → async parsing, UI remains responsive | Product §8; NFR §3; guide §§8–9 | Upload returns status; path TBD | Outbox → dispatcher → Cloud Task → FastAPI | IDEM-01/02, OBS-01 | No synchronous deep AI wait; REQUIRED |
| REQ-RESUME-003 | Parse result/evidence historical and auditable | Product §8; `07_resume_processing.sql` | Parsing status/result read | Worker transaction + processed event | SEC-01/03, IDEM-02, AUD-01 | Immutable evidence/result behavior; REQUIRED |
| REQ-RESUME-004 | Reprocess/history + one current active role document | PD-002; `06_documents.sql` | Active document selection/reprocess command | TX-01 → parse event | SEC-01/03, IDEM-01/02, AUD-01 | Only one current active role; REQUIRED |
| REQ-RESUME-005 | Security scan clean → parse event; no direct synchronous FastAPI call | Guide §§8–9; contracts | Document processing orchestration | `security-scan.requested` → `resume.parse.requested` | IDEM-02, OBS-01 | Unsafe/unclean document never parsed; REQUIRED |
| REQ-RESUME-006 | Candidate sees progress/live status and can recover via status endpoint | PD-002; guide §9 | Processing status/read use case | Worker events/notifications; transport TBD | SEC-01, IDEM-02, OBS-01 | Reconnect returns authoritative state; REQUIRED DIRECTION |
| REQ-RESUME-007 | Decide immediate name extraction fast track | Product §8; raw §6; guide §9 | Optional command only after decision | Separate event/worker contract TBD | RATE-01, IDEM-01 | UX/latency benefit approved before implementation; NEEDS_CLARIFICATION |

## 8. Jobs and search

| ID | Flow | Source/DB | API/use case | Tx/event/consumer | Controls | Acceptance/status |
|---|---|---|---|---|---|---|
| REQ-JOB-001 | Authorized company user creates/edits/publishes/closes job | Product §9; `05_jobs.sql`; guide §4 | Job lifecycle commands | TX-01 → job AI event where applicable | SEC-01, IDEM-01, AUD-01 | Only authorized membership changes job; REQUIRED |
| REQ-JOB-002 | Job stores structured skills/location/work-mode/compensation/experience | Product §9; `05_jobs.sql` | Job DTO validation/update | TX-01 | SEC-01, IDEM-01, AUD-01 | Structured constraints/search fields valid; REQUIRED |
| REQ-JOB-003 | Job save → AI ideal profile/enrichment asynchronously | `05_jobs.sql` docs; contracts | Job enrichment command/status | Outbox → `job-ai-enrichment-requested` → worker | IDEM-02, OBS-01 | HTTP does not wait for AI; REQUIRED DIRECTION |
| REQ-SEARCH-001 | Candidate search → keyword/FTS + filters + semantic result | Product §9; `SEARCH-STRATEGY.md` | Job search query; path TBD | Read-only query; embedding worker separate | SEC-01, RATE-01, OBS-01 | Paginated/relevance result; REQUIRED DIRECTION |
| REQ-SEARCH-002 | Search filters location/skill/experience/salary/company/type/work mode/date | Product §9; `05_jobs.sql` | Filtered search query | Read-only | SEC-01, RATE-01 | Bounded/paginated filters; REQUIRED |
| REQ-SEARCH-003 | Recruiter searches authorized canonical candidate projection | Product §10; PD-002; guide §7 | Candidate search query | Projection worker maintains index | SEC-01/03, RATE-01, AUD-01 | Raw evidence not exposed/cross-tenant blocked; REQUIRED |
| REQ-SEARCH-004 | Match output explains skill/experience/education/location/salary gaps | Product §§10,17; contracts | Match read/request use case | Match event/task → FastAPI | SEC-01/03, IDEM-01/02, OBS-01 | Explainable structured result; REQUIRED DIRECTION |
| REQ-SEARCH-005 | External search provider only after ADR/evidence | `SEARCH-STRATEGY.md` | No provider-specific API yet | N/A | N/A | PostgreSQL hybrid baseline retained; NEEDS_CLARIFICATION/FUTURE |

## 9. Applications

| ID | Flow | Source/DB | API/use case | Tx/event/consumer | Controls | Acceptance/status |
|---|---|---|---|---|---|---|
| REQ-APPLICATION-001 | Registered candidate → apply → application + snapshot | Product §11; `09_applications.sql`; guide §11; `contracts/events/application-submitted.v1.json` | Apply command; path TBD | TX-01 → `application.submitted` v1; no dispatcher route yet; notification route is phased | SEC-01/03, IDEM-01, AUD-01 | Candidate/job/consent valid; PII-minimized event; REQUIRED |
| REQ-APPLICATION-002 | Snapshot captures submission-time facts and never mutates | PD-003; `09_applications.sql` | Snapshot read only | Same apply transaction | SEC-01/03, AUD-01 | Later profile changes do not alter snapshot; REQUIRED |
| REQ-APPLICATION-003 | Guest scoped session/document → apply without account | Product §§7,11; `06_documents.sql`, `09_applications.sql` | Guest apply command | TX-01 → application event | SEC-03, IDEM-01, RATE-01, AUD-01 | Expired/wrong-job session rejected; REQUIRED |
| REQ-APPLICATION-004 | Guest verifies claim → link/merge application to candidate | Product §11; `09_applications.sql`; guide §12 | Claim/merge command | TX-01 + claim/audit/outbox | SEC-01/03, IDEM-01, AUD-01 | Claim identity immutable; REQUIRED |
| REQ-APPLICATION-005 | One candidate/guest identity per job; repost new job ID | PD-003; `09_applications.sql` | Apply idempotency/duplicate check | TX-01 | SEC-01/03, IDEM-01 | Duplicate application blocked; REQUIRED |
| REQ-APPLICATION-006 | HR status update → current status + history + reason | Product §12; `09_applications.sql`; guide §13 | Status transition command | TX-01 + status event | SEC-01, IDEM-01, AUD-01 | Unauthorized/invalid transition rejected; REQUIRED |
| REQ-APPLICATION-007 | Apply does not wait for selected resume parse | PD-003; guide §11 | Apply command | TX-01; parse may continue async | IDEM-01/02, OBS-01 | Pending parse does not incorrectly block apply; REQUIRED DIRECTION |

## 10. Referrals

| ID | Flow | Source/DB | API/use case | Tx/event/consumer | Controls | Acceptance/status |
|---|---|---|---|---|---|---|
| REQ-REFERRAL-001 | Eligible active user opens referral form → backend derives referrer | PD-001; manual referral; guide §14 | Create batch/invitation command | TX-01 | SEC-01, IDEM-01, AUD-01 | No separate recruiter role/body trust; REQUIRED |
| REQ-REFERRAL-002 | Manual multi-entry → validate/preview → send selected valid invitations | Manual referral requirement | Batch preview/submit commands | Batch + invitation + outbox per invitation | SEC-01/03, IDEM-01, RATE-01, AUD-01 | Invalid/duplicate rows reported; REQUIRED |
| REQ-REFERRAL-003 | Invitation → candidate decides guest/register/apply; no auto profile/application | Manual referral requirement | Invitation landing/decision flow | Invitation event; application optional | SEC-03, IDEM-01 | 50 invites do not create 50 applications; REQUIRED |
| REQ-REFERRAL-004 | Invitation token hash stored; email sent asynchronously | Manual referral; `09_applications.sql` | Invitation delivery command | TX-01 → notification/outbox worker | SEC-03, IDEM-02, OBS-01 | Raw token absent DB/log; REQUIRED |
| REQ-REFERRAL-005 | Explicit invitation confirmation + matching application → attribution | Manual referral; `09_applications.sql` | Attribution inside apply transaction | Application/referral events | SEC-01/03, IDEM-01, AUD-01 | No automatic attribution; REQUIRED |
| REQ-REFERRAL-006 | Invitation/reward lifecycle transitions and reissue rules | Manual referral; `09_applications.sql` | Transition/retry/reissue commands | TX-01 + outbox where applicable | SEC-01, IDEM-01, AUD-01 | Invalid state transitions rejected; REQUIRED |
| REQ-REFERRAL-007 | Company/admin configures reward program/rules | Product §14; `09_applications.sql` | Program/rule CRUD TBD | Financial/reward events TBD | SEC-01, IDEM-01, AUD-01 | Model/API/UI/tests specified; REQUIRED + GAP |

## 11. Interviews, messaging and notifications

| ID | Flow | Source/DB | API/use case | Tx/event/consumer | Controls | Acceptance/status |
|---|---|---|---|---|---|---|
| REQ-INTERVIEW-001 | Candidate/recruiter availability → slot lock → booking | Product §13; `10_interviews.sql` | Availability/booking commands | TX-01; notification event | SEC-01, IDEM-01, AUD-01 | Double booking prevented; REQUIRED DIRECTION |
| REQ-INTERVIEW-002 | Booking/status → participant calendars, feedback, reminders | Product §13; `10_interviews.sql` | Interview lifecycle commands | TX-01 → notifications/outbox | SEC-01, IDEM-01/02, AUD-01 | Updates/reminders delivered according to policy; REQUIRED DIRECTION |
| REQ-INTERVIEW-003 | External calendar/video provider integration | Product §13 | No API until provider contract | Future event/task | SEC-02 | Not implemented without ADR; FUTURE |
| REQ-MESSAGE-001 | Authorized participant opens conversation → sends/reads message | Product §15; `11_messaging.sql` | Conversation/message use cases | TX-01; realtime notification event | SEC-01/03, IDEM-01, RATE-01, AUD-01 | Non-participant blocked; REQUIRED DIRECTION |
| REQ-NOTIFY-001 | Business event → in-app/user notification | Product §15; `12_notifications.sql` | Notification read/preferences commands | Outbox → notification worker | SEC-01, IDEM-02, OBS-01 | Required event types create correct recipient record; REQUIRED DIRECTION |
| REQ-NOTIFY-002 | Email delivery follows event/preferences/policy/template/rate limit | Product §15; guide §15 | Notification preference/use case | Outbox/email adapter | SEC-03, IDEM-02, RATE-01, AUD-01 | No unconditional/duplicate email; REQUIRED |
| REQ-NOTIFY-003 | Admin manages safe, versioned email templates | Product §15 | Template CRUD/preview/activate | TX-01 + notification event | SEC-01, IDEM-01, AUD-01 | Variables/rendering/version tests; REQUIRED + GAP |
| REQ-REALTIME-001 | User connects → receives authorized update → reconnects/status recovers | Product §15; PD-002; guide §§9,15; Decision-02 | SSE for one-way updates, WebSocket for chat, REST recovery | Domain notification/status events after commit | SEC-01, IDEM-02, OBS-01 | DB truth recoverable after reconnect; REQUIRED |

## 12. Recruiter saved candidates

| ID | Flow | Source/DB | API/use case | Tx/event/consumer | Controls | Acceptance/status |
|---|---|---|---|---|---|---|
| REQ-SAVED-CANDIDATE-001 | Authorized HR/employer search/profile → private bookmark/unbookmark + optional note; no job link | Product §15A; `09_applications.sql` explanation; Decision-04 | Saved-candidate CRUD; exact paths remain API catalog | TX-01; no outbox event required | SEC-01/03, IDEM-01, AUD-01 | Same HR+candidate unique; owner-only visibility; `saved_jobs` cannot substitute; REQUIRED |

## 13. Analytics, feedback and subscriptions

| ID | Flow | Source/DB | API/use case | Tx/event/consumer | Controls | Acceptance/status |
|---|---|---|---|---|---|---|
| REQ-ANALYTICS-001 | Business action → analytics event/aggregate → authorized report | Product §16; `13_analytics.sql` | Analytics query/report use cases | Async analytics update where approved | SEC-01/03, IDEM-02, AUD-01 | Same source event counted once; authorized report returns expected aggregate; REQUIRED (planned detail) |
| REQ-FEEDBACK-001 | Registered/guest user → feedback submit → moderation/admin view | Product §16; `18_feedback.sql` | Feedback submit/list commands | TX-01; notification/audit event TBD | SEC-01/03, RATE-01, AUD-01 | Valid registered/guest feedback persists; unauthorized moderation read is rejected; REQUIRED (planned detail) |
| REQ-SUBSCRIPTION-001 | Company/admin → plans/subscription/invoice/coupon status | Product §16; `14_subscriptions.sql` | Subscription/billing use cases TBD | Provider events TBD | SEC-01/02, IDEM-01, AUD-01 | No provider-dependent operation is enabled before contract approval; REQUIRED (planned detail + GAP) |

## 14. AI screening and recommendations

| ID | Flow | Source/DB | API/use case | Tx/event/consumer | Controls | Acceptance/status |
|---|---|---|---|---|---|---|
| REQ-AI-001 | Resume/job/preferences → contextual screening questions → candidate/recruiter response | Product §17; raw §9; contracts | Screening request/result use cases | Outbox → FastAPI task → versioned result | SEC-01/03, IDEM-02, AUD-01 | Approved context produces versioned questions; prohibited/sensitive topic is rejected or flagged; REQUIRED (planned detail) |
| REQ-AI-002 | Candidate/job data → recommendations/gap analysis | Product §§10,17; contracts | Match/recommendation use cases | Outbox → match worker → result event | SEC-01/03, IDEM-02, OBS-01 | Result contains structured factors and explainable gaps; REQUIRED (planned detail) |
| REQ-AI-003 | AI output → provenance/version/human review; never auto-canonical overwrite | Product §17; NFR §6 | Evidence review/AI result read | Worker result + processed event | SEC-01/03, AUD-01 | Source/model/version and override trace; REQUIRED (detail direction retained) |
| REQ-AI-004 | Choose replaceable provider/model and cost policy | Product §17; AI research | Provider/config ADR, not business endpoint | Worker-specific contract TBD | SEC-02, OBS-01 | Provider ADR approved before hard-coding; NEEDS_CLARIFICATION |

## 15. API behavior, contracts and observability

| ID | Flow | Source/DB | API/use case | Tx/event/consumer | Controls | Acceptance/status |
|---|---|---|---|---|---|---|
| REQ-API-001 | Every protected request → policy guard → resource operation | Product §3; `17_rls.sql`; guide §4 | Common guards/decorators | N/A or TX-01 | SEC-01 | Cross-tenant negative tests; REQUIRED |
| REQ-API-002 | Client request → backend DTO normalization/validation | Manual referral; NFR | DTO pipes/validation | N/A | RATE-01, OBS-01 | Invalid data rejected server-side; REQUIRED |
| REQ-API-003 | Retry/duplicate request → same safe result or explicit conflict | `09_applications.sql`, `15_infrastructure.sql`; guide | Idempotency policy per command | TX-01/IDEM-02 | IDEM-01/02 | Duplicate apply/referral/upload tests; REQUIRED DIRECTION |
| REQ-API-004 | Business state + history/audit + outbox → commit; external side effect after | Guide §§5,15; `15_infrastructure.sql` | OutboxWriterModule + transaction manager | TX-01 | AUD-01, OBS-01 | Rollback leaves no partial rows; REQUIRED |
| REQ-API-005 | Producer/consumer payload → versioned root contract | `contracts/README.md`, G1 alignment | Contract adapters/validation | Events/tasks to dispatcher/worker | IDEM-02, OBS-01 | Breaking change creates new version; REQUIRED |
| REQ-API-006 | API documentation → shared contract remains authoritative | Guide §20 | OpenAPI generation + contract files | N/A | OBS-01 | OpenAPI does not replace versioned contract; REQUIRED |
| REQ-API-007 | Error/trace/log → safe actionable response | NFR §§4,8; service logging docs | Error mapper/observability | Trace through outbox/task | SEC-02/03, OBS-01, AUD-01 | No secret/PII leakage; REQUIRED |

## 16. Explicit gaps and decisions

| Gap ID | Related requirements | Evidence/impact | Required next decision |
|---|---|---|---|
| GAP-001 | REQ-AUTH-005 | DB access model resolved | Decision-01; no remaining decision blocker; implementation must preserve UserContextClient/SystemClient separation |
| GAP-002 | REQ-AUTH-007, REQ-REALTIME-001 | Transport resolved | Decision-02; exact endpoint/DTO work remains API catalog |
| GAP-003 | REQ-PLATFORM-007 | Numeric SLO/load/file thresholds missing | Product/operations acceptance values |
| GAP-004 | REQ-RESUME-007 | Fast-track name extraction undecided | UX/latency decision |
| GAP-005 | REQ-REFERRAL-007 | Configurable reward program/rule schema/API missing | DB/API/security design |
| GAP-006 | REQ-NOTIFY-003 | Email template management API/model incomplete | DB/API/template contract |
| GAP-007 | REQ-SAVED-CANDIDATE-001 | Saved-candidate policy resolved; model/API implementation remains | Decision-04; add model to 09 baseline for clean reset or forward migration if DB is not reset |
| GAP-008 | REQ-SUBSCRIPTION-001 | Payment provider contract missing | Provider/financial lifecycle decision |
| GAP-009 | REQ-AI-004 | Model/provider/cost policy not frozen | AI provider ADR |
| GAP-010 | REQ-SEARCH-005 | External search engine adoption not approved | Evidence/ADR; PostgreSQL hybrid remains baseline |
| GAP-011 | REQ-REALTIME-001 | Reconnect/status contract resolved at policy level | Decision-02; exact recovery endpoints remain API catalog |
| GAP-012 | REQ-APPLICATION-001 | Contract v1 is now defined; dispatcher/notification route remains phased | Approve contract, emit atomically, keep route fail-closed until consumer contract is approved |

## 17. Dispatcher routing and phased gaps

Current dispatcher implementation is intentionally phased. A valid event requirement without a current dispatcher route is not silently treated as routable.

| Event/side effect | Contract/route evidence | Current route | Phase treatment |
|---|---|---|---|
| `candidate.profile.changed` | `contracts/events/candidate-profile-changed.v1.json` | `PROJECTION_QUEUE` → `/internal/tasks/candidate/projection` (registered) | Current route; contract/task payload must remain aligned |
| `candidate.projection.rebuilt` | `contracts/events/candidate-projection-rebuilt.v1.json` | No dispatcher input route (FastAPI output event) | `EXPECTED PHASED GAP`; output-only to prevent projection loops |
| `resume.parse.requested` | `contracts/events/resume-parse-requested.v1.json` | `AI_HEAVY_QUEUE` → `/internal/tasks/resume/parse` (registered) | Current route; contract/task payload must remain aligned |
| `security.scan.requested` | `contracts/events/security-scan-requested.v1.json` | `SECURITY_SCAN_QUEUE` → `/internal/tasks/security/scan` (registered) | Current route; contract/task payload must remain aligned |
| `application.submitted` | `contracts/events/application-submitted.v1.json` | No current dispatcher route | Domain event is approved; notification consumer route remains `EXPECTED PHASED GAP`; do not route to match analysis |
| `notification.email.requested` | Dispatcher registry explicitly marks this event unresolved; no current route/approved task contract | None | `EXPECTED PHASED GAP`; owner = notification/dispatcher phase; fail-closed |
| Job enrichment/match/screening/interview producer events | Corresponding request contracts and task files | Registered routes exist; verify producer ownership and payload alignment per phase | If a future producer event is not registered, mark `EXPECTED PHASED GAP`, assign owner phase, and fail-closed |

`EXPECTED PHASED GAP` means: requirement/contract is known, current component scope intentionally does not route it yet, and the dispatcher must reject/unroute it safely rather than guess a queue.

## 18. Traceability result

| Check | Result |
|---|---|
| Phase 1 requirement IDs mapped | ✅ |
| Source references present | ✅ |
| DB objects/API paths | DB references mapped; exact API paths intentionally TBD |
| Transactions/events/consumers | Mapped where approved; TBD marked where contract missing |
| Security/RLS/idempotency/rate/audit | Cross-cutting policy references applied; Phase 3/6 will refine values |
| Acceptance criteria | Initial criteria present; detailed test cases required in API catalog/implementation plan |
| Open gaps | 11 explicit gaps above |

**Phase 2 status:** `DRAFT TRACEABILITY COMPLETE — GAP/CONFLICT ANALYSIS NEXT`

**Next deliverable:** `PHASE-03-GAP-CONFLICT-ANALYSIS.md`
