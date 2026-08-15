# NestJS Implementation Guide

[← NestJS index](README.md) · [Requirements](../01-requirements/README.md) · [Main project](../README.md)

## 1. इस document का उद्देश्य

यह current production architecture के लिए NestJS की responsibilities और transactional rules बताता
है। यह पुराने `Binay-App/Requirement/old_NESTJS-GUIDE.md` का reviewed replacement है। पुराने guide के
contradictory historical examples यहाँ migrate नहीं किए गए हैं।

Current database baseline `01_extensions.sql` से `18_feedback.sql` तक numeric order में Supabase पर
execute हो चुकी है। Database component migrate होने के बाद executable SQL की authority
`02-database/migrations/` होगी।

## 2. Final service architecture

```text
Next.js
   |
   | HTTPS API / WebSocket or SSE
   v
NestJS API
   |-- Supabase Auth operations
   |-- input validation + authorization
   |-- PostgreSQL business transactions
   |-- private Storage authorization/signed URLs
   |-- business rows + outbox_events in same transaction
   v
Supabase
   |
   | INSERT webhook on outbox_events
   v
NestJS Outbox Dispatcher
   v
Google Cloud Tasks Queue
   v
Private Cloud Run FastAPI Worker
   |-- parsing / OCR / AI / embeddings
   |-- restricted result/evidence/projection writes
   |-- processed_events + optional chained outbox event
   v
Supabase
```

Important boundaries:

- Next.js application data सीधे Supabase में write नहीं करेगी।
- NestJS normal request path में FastAPI का heavy work पूरा होने का wait नहीं करेगा।
- NestJS Supabase से बात करने वाली अकेली service नहीं है। Restricted FastAPI worker भी approved
  result/evidence/projection और chained-outbox writes कर सकती है।
- Supabase Database Webhook FastAPI को सीधे call नहीं करती; वह Dispatcher को wake करती है।
- Cloud Tasks Queue Google OIDC के साथ private FastAPI endpoint invoke करती है।

## 3. Authentication और account creation

### Signup flow

```text
Next.js POST /auth/signup
  -> NestJS DTO validation + rate limit
  -> Supabase Auth signup
  -> auth.users INSERT
  -> DB trigger public.handle_new_user()
  -> public.users row
  -> candidate role होने पर create_empty_candidate_profile trigger
  -> candidate_profiles row
  -> NestJS safe response
```

NestJS duplicate `public.users` या `candidate_profiles` rows manually create नहीं करेगा। ये current
database triggers की responsibility हैं। Signup response देने से पहले trigger failure को handle करना
और user-facing safe error देना जरूरी है।

Current application roles एक `users.role` enum से आते हैं:

```text
candidate | employer | hr | admin
```

`user_roles` table current schema में active/existing table नहीं है। Future multi-role design implement
होने तक authorization में उसे query नहीं करना है। Referral भेजने के लिए अलग recruiter role आवश्यक
नहीं है; हर eligible active authenticated user referral भेज सकता है।

### Login/session rules

- Supabase Auth password/OAuth/token verification provider है।
- Application access से पहले `public.users.status`, `deleted_at` और `locked_until` validate करें।
- Current schema में custom `refresh_tokens` table नहीं है; guide/code में उसे assume न करें।
- `user_sessions` real-time presence/session tracking के लिए है, Supabase Auth refresh-token storage
  के लिए नहीं।
- Service-role credentials server-only रहें और logs/responses में कभी न जाएँ।

### AuthProvider abstraction

Business modules को Supabase SDK calls से tightly couple न करें। NestJS में provider interface रखें:

```text
AuthProvider
  signup(input)
  login(credentials)
  refresh(refreshToken)
  verifyAccessToken(accessToken)
  getAuthUser(authUserId)
  logout(sessionContext)

SupabaseAuthProvider implements AuthProvider
```

- Provider बदलने पर controllers और business use cases rewrite न हों।
- Admin/service-role client और normal user-context client अलग configuration रखें।
- Token verification के बाद application user/status database से load करें; JWT role को अकेला
  authorization truth न मानें।
- Refresh token का raw value application database/log में store न करें। Supabase Auth का supported
  refresh flow use करें।
- OAuth callback NestJS-controlled endpoint से complete होगा और application-user state verify करेगा।

## 4. API validation और authorization

- DTO allow-list रखें: `whitelist: true`, `forbidNonWhitelisted: true`।
- Authentication identity से owner/user/company derive करें; request body के owner UUID पर trust न करें।
- Company membership, permissions, job ownership और application context check करें।
- UUID पता होना access permission नहीं है।
- Request body size, upload size, rate limit और idempotency key enforce करें।
- DB constraint और serialization errors भी handle करें; pre-check concurrency guarantee नहीं है।
- Internal storage paths, token hashes, raw AI payload, recruiter-only notes और stack traces expose न करें।

### Guards और decorators

```text
JwtAuthGuard / SupabaseAuthGuard -> verified auth identity
ActiveAccountGuard             -> status, deleted_at, locked_until
RolesGuard                     -> current users.role
CompanyPermissionGuard         -> membership + granular permission
Ownership/policy check         -> candidate/job/document/application context
```

Suggested decorators:

```text
@Public()
@CurrentUser()
@Roles('hr', 'employer')
@CompanyPermissions('can_create_jobs')
@IdempotencyKey()
```

Role check अकेला पर्याप्त नहीं है। उदाहरण: `hr` केवल उस company का job manage कर सकता है जहाँ
उसकी active membership और required permission हो।

### Example: HR नया job create करता है

```text
Next.js POST /jobs
  Authorization: Bearer <access-token>
  Idempotency-Key: <client-generated-key>
  Body: allowed job fields only
          |
          v
NestJS AuthGuard
  -> token verify
  -> public.users load + active-account check
          |
          v
DTO validation
  -> unknown/system fields reject
          |
          v
Company authorization
  -> active membership?
  -> can_create_jobs permission?
  -> company_id caller के scope में?
          |
          v
Transaction
  -> idempotency/replay check
  -> jobs row in valid initial state
  -> audit/history where required
  -> job AI/profile generation outbox event
COMMIT
          |
          v
201/202 safe response
```

Job AI profile और embedding background pipeline में process होगी; HTTP request FastAPI completion का
wait नहीं करेगी।

## 5. Transaction rule

जहाँ business state के बाद background side effect चाहिए, उसी transaction में outbox event लिखें:

```text
BEGIN
  -> ownership/version lock
  -> business rows
  -> audit/history rows
  -> outbox_events(pending)
COMMIT
```

Queue/email/FastAPI/storage जैसी network call के दौरान DB transaction open न रखें। Queue publish को
business commit से पहले करना मना है।

## 6. Candidate profile save

एक UI Save action एक logical profile revision है। पाँच skills change होने का अर्थ revision `+5` नहीं,
केवल `+1` है।

```text
BEGIN
  -> candidate_profiles SELECT ... FOR UPDATE
  -> authenticated ownership + expected revision verify
  -> candidate_profiles और canonical child facts mutate
  -> removed facts पर deleted_at; hard DELETE नहीं
  -> profile_change_history rows insert
  -> bump_candidate_profile_revision(candidate_id) exactly once
  -> candidate.profile.changed outbox event with new revision
COMMIT
```

Canonical source tables में profile के साथ active rows पढ़ी जाती हैं:

- `candidate_profiles`
- `candidate_skills`
- `candidate_experiences`
- `candidate_educations`
- `candidate_projects`
- `candidate_certifications`
- `candidate_languages`
- `candidate_awards`
- `candidate_links`

Candidate client provenance, verification status, revision, ownership और audit timestamps set नहीं
कर सकता। Stale expected revision/row version पर HTTP `409 Conflict` दें।

## 7. Search projection

`candidate_search_profiles` derived projection है, canonical source नहीं। Profile-change event या
active-profile-resume selection/parse-completion event के बाद FastAPI projection worker active canonical
tables और latest active resume parse पढ़कर `searchable_text`, `search_vector`, filters, source labels और
embedding बनाता है। Resume-derived facts canonical tables को silently overwrite नहीं करते।

Worker rule:

```text
event requested revision/resume identity
  -> canonical facts + latest active resume parse load
  -> projection/embedding build
  -> current profile_revision + active resume document/result identity फिर verify
  -> all source identities same: upsert
  -> any source newer/different: stale result discard/requeue latest
```

NestJS projection columns manually edit नहीं करेगा। HR search normal filters + PostgreSQL keyword
search + compatible embedding-model semantic similarity को query policy के अनुसार combine करेगी।

## 8. Document और resume upload

NestJS:

1. Registered identity या guest token/session validate करेगा।
2. Extension, MIME, file signature, filename और size validate करेगा।
3. Private storage path server-side बनाएगा और SHA-256 निकालेगा।
4. Same owner/session + checksum document मिले तो existing document reuse करेगा।
5. New row में exactly one origin होगा:
   `uploaded_by_user_id` XOR `guest_upload_session_id`।
6. Storage success लेकिन DB failure पर compensating cleanup event बनाएगा।
7. Authorized short-lived signed URL देगा; internal bucket path expose नहीं करेगा।

Normal deletion `deleted_at` है। Physical DB/storage purge केवल privileged retention workflow से होगा।

## 9. Resume parsing

```text
NestJS upload transaction
  -> uploaded_documents
  -> outbox_events(security.scan.requested)
COMMIT

Security scan completion transaction (only when scan result is clean)
  -> uploaded_documents.security_scan_status = clean
  -> resume_parsing_jobs (idempotency key)
  -> outbox_events(resume.parse.requested)
COMMIT

... Dispatcher -> Cloud Tasks -> FastAPI ...

FastAPI final transaction
  -> immutable resume_parsed_data
  -> immutable artifacts/events/evidence
  -> processed_events
  -> optional downstream outbox event
COMMIT
```

- Parsing job lifecycle mutable है; result, artifacts और event history append-only हैं।
- Reparse नया parsing job/result बनाता है।
- AI output suggestion/evidence है; candidate-confirmed canonical facts automatic overwrite नहीं होंगे।
- `document_id` और `parsing_result_id` source pair consistent रहना चाहिए।
- UI को completion WebSocket/SSE से live बताई जा सकती है; reconnect recovery के लिए status endpoint भी
  authoritative state return करेगा।

## 10. Evidence acceptance

Candidate AI evidence payload सीधे insert/update नहीं कर सकता। Evidence payload/source/confidence/
document/result immutable रहते हैं। Allowed evidence transitions:

```text
active -> superseded
active -> rejected
active -> invalidated
```

Suggestion accept/correct transaction canonical row update, history, evidence transition, one profile
revision bump और outbox event atomically करेगी। Terminal evidence को वापस active नहीं किया जाएगा;
नया evidence row बनेगा।

## 11. Registered application

```text
BEGIN
  -> authenticated candidate ownership
  -> job/application eligibility
  -> one candidate + one job uniqueness
  -> job_applications INSERT
  -> active, same-user application_documents INSERT
  -> confirmed canonical profile + selected application resume parse normalize/deduplicate
  -> immutable submitted snapshot + selected resume_document_id INSERT
  -> initial application_status_history INSERT
  -> application.submitted outbox event
COMMIT
```

Selected application resume parse अभी ready नहीं है तो HTTP apply request block नहीं होगी। Transaction-time available
facts submitted snapshot में freeze होंगे; later parsing/enrichment existing submitted row update करने के
बजाय नया immutable parsed/enriched snapshot version insert करेगी।

Selected resume active profile resume या application-only resume हो सकती है। Snapshot selected document
follow करेगी; global candidate search projection केवल active profile resume follow करती है।

Application identity creation के बाद immutable है। Reposted position नया `job_id` उपयोग करेगी। Profile
बाद में बदले तो submitted snapshot नहीं बदलेगा। Supporting document replace/update/delete नहीं होगा;
नई append-only link row बनेगी।

## 12. Guest Apply और claim

```text
BEGIN
  -> guest_upload_sessions SELECT ... FOR UPDATE
  -> same job + active + unexpired + not revoked verify
  -> guest job_applications INSERT
  -> उसी session के active documents link
  -> immutable submitted snapshot
  -> initial status history
  -> application.submitted outbox event
  -> consume_guest_upload_session(session_id, application_id)
COMMIT
```

Email trim + lowercase करके `guest_email_normalized` में store करें; Gmail-specific dot/plus rewrite न
करें। Guest application को बाद में registered application में rewrite नहीं किया जाएगा। Claim lifecycle:

```text
pending -> verified -> merged
pending -> expired / revoked / rejected
verified -> revoked / rejected
```

Token का केवल hash store/log होगा। Claim identity immutable है और merge/audit/outbox atomic होंगे।

## 13. Application status

NestJS direct `UPDATE job_applications SET status = ...` नहीं करेगा। वह controlled database function
`change_application_status(...)` call करेगा, जो lock, allowed transition, current status, immutable
history और outbox atomically handle करती है। Rejection reason current row और history दोनों में जाएगा।

## 14. Manual referral

[Full approved referral requirement](../01-requirements/current/MANUAL-REFERRAL-REQUIREMENT.md)

- हर eligible active authenticated user refer कर सकता है; separate recruiter role नहीं।
- Current production scope manual rows है; CSV/XLSX/paste parser/ATS import future scope है।
- Candidate name/email required; phone/note optional।
- एक submission में multiple candidates और one `referral_batches` row बन सकती है।
- प्रत्येक valid candidate के लिए `referral_invitations`; invitation application नहीं है।
- Self-referral/duplicate रोकें, email normalize करें, phone संभव हो तो E.164 करें।
- Batch idempotency key और hashed invitation token उपयोग करें।
- Candidate Guest Apply, Register/Login & Apply, Decline या ignore चुन सकता है।
- Application attribution केवल application creation transaction में होगी।
- Delivery retry existing invitation पर होगा; duplicate invitation नहीं।

Lifecycles arbitrary request-body status से update नहीं होंगे:

```text
Batch: draft -> ready -> processing -> completed / partially_failed
       draft / ready / processing -> cancelled

Invitation: pending -> queued -> sent -> opened -> applied
            failed -> queued

Reward: not_eligible -> pending_eligibility -> eligible -> approved -> paid
        paid terminal; cancellation paid से पहले policy के अनुसार
```

Expired/cancelled invitation का explicit reissue नई row/token से हो सकता है। Applied/declined reissue
नहीं होगा। Temporary failure पर उसी invitation को retry करें।

## 15. Outbox responsibility

NestJS API outbox publish/dispatch नहीं करती। वह business transaction में event insert करती है। अलग
NestJS Dispatcher pending events claim करके Google Cloud Tasks Queue में डालता है। Primary wake-up
Supabase asynchronous INSERT webhook है; slow Supabase Cron recovery-only है।

FastAPI completed processing transaction downstream work शुरू करने के लिए chained outbox event लिख
सकती है। इसलिए webhook सभी trusted writers cover करती है। Consumers `processed_events` से
idempotency enforce करेंगे।

## 16. Suggested NestJS modules

```text
AuthModule
UsersModule
CompaniesModule
JobsModule
DocumentsModule
ResumeProcessingModule
CandidatesModule
ApplicationsModule
ReferralsModule
InterviewsModule
MessagingModule
NotificationsModule
AnalyticsModule
SubscriptionsModule
FeedbackModule
OutboxWriterModule
RealtimeGatewayModule
```

Outbox Dispatcher अलग deployable NestJS application है; उसे main API module में background loop की
तरह embed नहीं करना है। FastAPI AI/OCR code NestJS repository module में नहीं आएगा।

### API ownership overview

Exact DTOs बाद में root `contracts/` में version किए जाएँगे। Broad ownership:

| Module | Public examples | Authenticated examples | Privileged/company examples |
|---|---|---|---|
| Auth | signup, login, refresh, OAuth callback | logout, session status | account-security administration |
| Users | — | own settings/profile | admin user lifecycle |
| Companies | public company view | membership context | company/profile/member management |
| Jobs | list, detail, search | save/unsave | create, publish, close, update owned job |
| Documents | guest-session upload | own upload/status/signed URL | authorized application document read |
| Resume Processing | — | own parsing status | worker/admin diagnostics by policy |
| Candidates | — | canonical profile read/save | authorized recruiter search/read |
| Applications | Guest Apply | registered apply, own applications | controlled status workflow |
| Referrals | invitation open/decline entry | create/resend eligible referral | reward/admin operations by policy |
| Interviews | limited invite action | candidate schedule/view | interviewer/HR schedule and feedback |
| Messaging | — | own conversations/messages | explicit moderation policy only |
| Notifications | — | own list/read/preferences | template/system operations |
| Analytics | — | own allowed views | company-scoped/admin analytics |
| Subscriptions | public plan view | billing-owner views | company billing/admin operations |
| Feedback | permitted guest flow | own feedback | moderation/reporting |

यह table automatic authorization नहीं देती। हर resource पर ownership, company scope और lifecycle
policy अलग से लागू होगी।

## 17. Persistence rules

- SQL migrations schema authority हैं; ORM `synchronize: true` मना है।
- हर table के लिए mechanically entity बनाना आवश्यक नहीं; aggregate/use-case oriented repositories रखें।
- Complex lifecycle के लिए existing database functions/triggers bypass न करें।
- Database transactions direct PostgreSQL connection/pool से चलें; Supabase Auth SDK और PostgreSQL
  persistence को एक ही “Supabase Server SDK query” abstraction समझकर mix न करें।
- Service/API contracts versioned और root `contracts/` में shared होंगे।

## 18. Required tests

- Signup से exactly one `public.users` और candidate के लिए one `candidate_profiles` row बने।
- Inactive/deleted/locked account protected access न पाए।
- One profile save with many facts से revision exactly `+1` और one outbox event हो।
- Transaction rollback पर business/history/outbox कोई partial commit न हो।
- Stale profile update `409`; stale projection newer revision overwrite न करे।
- Duplicate checksum existing document reuse करे।
- Wrong-owner/session या soft-deleted application document reject हो।
- Concurrent Guest Apply एक upload session reuse न कर सके।
- Duplicate candidate/job application policy enforce हो।
- Snapshot/evidence/artifact mutation fail हो।
- Application status + history + outbox atomic हों।
- Referral retry idempotent हो; invalid lifecycle/reissue/reward transition reject हो।
- Raw invitation/claim tokens और internal storage path responses/logs में न आएँ।
- Redelivered event duplicate side effect न बनाए।
- Known UUID के बावजूद unauthorized tenant/candidate/application access fail हो।

## 19. Implementation order

```text
1. Configuration, structured logging, error mapping
2. PostgreSQL transaction layer + Supabase Auth/Storage clients
3. Auth and account-status guards
4. Users/companies/jobs
5. Documents + resume parsing job creation
6. Candidate canonical profile + revision transactions
7. Registered/guest applications + snapshots/status
8. Manual referrals
9. Interviews/messaging/notifications
10. Realtime completion/status delivery
11. Integration, concurrency and authorization tests
```

हर module implement करते समय requirement, DB migration/function, API contract और tests को साथ sync
करना जरूरी है।

## 20. NestJS project bootstrap

```text
04-nestjs-api/
  README.md
  docs/
  app/
    src/
      main.ts
      app.module.ts
      config/
      common/
        auth/ guards/ decorators/ errors/ logging/ validation/ idempotency/
      infrastructure/
        database/ supabase-auth/ supabase-storage/ outbox/
      modules/
        auth/ users/ companies/ jobs/ documents/ resume-processing/
        candidates/ applications/ referrals/ interviews/ messaging/
        notifications/ analytics/ subscriptions/ feedback/
      realtime/
    test/
      integration/ concurrency/ authorization/
```

Bootstrap rules:

- Startup पर environment/config schema validate करें।
- PostgreSQL pool/transaction manager और Supabase Auth/Storage clients अलग adapters हों।
- Global validation pipe, safe exception filter, correlation ID और structured logging पहले configure करें।
- OpenAPI उपयोगी है, लेकिन versioned API/event/task contracts का replacement नहीं।
- WebSocket/SSE authentication HTTP policy के समान हो; reconnect और missed-state recovery रखें।
- Readiness और liveness endpoints अलग रखें। Dependency unavailable हो तो readiness fail हो, process
  अनावश्यक restart loop में न जाए।
- Secrets runtime secret manager/environment injection से आएँ; source control में नहीं।

## 21. पुराने guide से क्या जानबूझकर नहीं रखा गया

ये missing requirements नहीं, corrected decisions हैं:

- `01 -> 14` schema instruction — current executed baseline `01 -> 18` है।
- custom `refresh_tokens` table — current schema में नहीं है।
- active `user_roles` table — current schema में केवल commented future design है।
- Guest application का `user_id` rewrite — immutable application + claim lifecycle ने replace किया।
- heavy work का direct synchronous `NestJS -> FastAPI` call — outbox/queue flow ने replace किया।
- “NestJS ही Supabase से बात करने वाली अकेली service है” — restricted FastAPI approved writes कर सकती है।
- “हर SQL table की exactly one ORM entity” — repositories/use cases aggregate boundary के अनुसार बनेंगे।

पुराने sections की उपयोगी intent updated form में इस guide में रखी गई है; incorrect mechanism दोबारा
नहीं रखा गया।

## 22. Original guide coverage audit

| Old guide area | Current treatment |
|---|---|
| Production schema application contract | Sections 5–15 में preserved और current DB functions/flows के अनुसार expanded |
| Candidate save/document/parsing/evidence/search | Sections 6–10 में preserved |
| Registered/guest application, referral, snapshots/status | Sections 11–14 में preserved और stale guest rewrite corrected |
| Outbox/retries/external side effects | Section 15 और final architecture में preserved; synchronous call corrected |
| Authorization/API safety/tests | Sections 3–4 और 18 में preserved/expanded |
| Architecture diagram | Section 2 में current webhook/Dispatcher/Queue/FastAPI flow के साथ updated |
| Frontend-direct-Supabase comparison | Boundary preserved; rationale auth/provider reuse, centralized policy और multi-client contract में रखा |
| Login/signup steps | Section 3 में actual DB trigger chain के साथ updated |
| AuthProvider/guards/decorators | Sections 3–4 में preserved/expanded |
| HR creates job example | Section 4 में background outbox step सहित updated |
| Module/endpoints table | Section 16 API ownership overview में preserved without pretending final DTOs are frozen |
| Historical guest merge example | Incorrect mechanism नहीं रखा; explicit claim lifecycle उसका replacement है |
| Multi-role note | Current single-role rule preserved; `user_roles` को correctly inactive future design बताया |
| Setup steps/folder structure | Sections 19–20 में updated |
| One-table-one-entity mapping | Rejected as mandatory rule; aggregate repositories वाला replacement Section 17 में है |
| Old final summary/non-negotiables | Correct decisions Sections 2 and 21 में trace; contradictions हटाए |

कोई useful responsibility silently drop नहीं की गई। Package versions/exact dependencies code bootstrap के
समय current official compatibility के अनुसार lock होंगे, इसलिए old unversioned install list को immutable
contract नहीं बनाया गया।
