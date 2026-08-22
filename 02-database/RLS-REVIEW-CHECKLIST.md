# 17 RLS Review Checklist

[← Database index](README.md) · [Main project](../README.md)

## Purpose

यह file `01_extensions.sql` से आगे review करते समय मिले cross-file authorization points track करती है।
इन्हें domain SQL files में duplicate करने के बजाय `17_rls.sql` review में एक साथ implement और test करना है।

> `17_rls.sql` का design approved/migrated है। Design alternatives नीचे status में documented हैं;
> execution/test items evidence मिलने तक unchecked रहेंगे।

## Global boundary

- [ ] Finalize consistent rule: Next.js database mutation directly नहीं करेगी; normal product writes
  NestJS authorization/transactions से होंगी। Existing authenticated `FOR ALL` policies इस rule को
  bypass नहीं कर सकतीं।
- [ ] `anon` और `authenticated` grants/policies का table-by-table audit करें; केवल explicitly approved
  direct reads/limited writes रहें। Supabase service-role key server-only रहे।
- [ ] Tenant authorization केवल request-body `company_id`, `candidate_id`, `application_id` पर trust न करे।
- [ ] Known UUID के बावजूद cross-company/cross-user access fail हो।

## 01 — Extensions

- [ ] Extension creation केवल privileged baseline/migration execution से हो; runtime application roles को
  `CREATE EXTENSION` या schema ownership न मिले।
- [ ] `vector`, `pg_trgm`, `unaccent`, `btree_gist`, `citext` आदि runtime functions/operators के grants
  expected query use तक सीमित हों; extension installation को RLS substitute न माना जाए।
- [ ] Classification: tables/policies नहीं हैं, इसलिए row-level policy `NOT APPLICABLE`; privilege review
  फिर भी deployment checklist में दर्ज हो।

## 02 — Enums

- [ ] Classification: enums पर RLS लागू नहीं होती (`NOT APPLICABLE`), लेकिन enum value authorization
  नहीं है। Request-body `role`, `status`, lifecycle या source enum trusted permission proof नहीं बने।
- [ ] `user_role` single application role है; company-scoped access `company_members` और permissions से
  derive हो, केवल JWT/enum role से नहीं। Referral के लिए separate recruiter role require न हो।

## 03 — Users and auth

- [ ] **BLOCKER:** current `users_own_update` policy user को own row के sensitive columns (`role`, `status`,
  email verification/lock/security state) बदलने की अनुमति न दे। Global NestJS-only rule के अनुसार direct
  authenticated UPDATE revoke करें या explicitly safe column-level/function path define करें।
- [ ] Candidate/user profile-safe fields update और admin/security-owned fields update अलग authorization
  paths हों। Client request से admin/employer/hr self-promotion impossible हो।
- [ ] `current_user_role()` और `is_company_member()` जैसे `SECURITY DEFINER` helpers minimal/empty
  `search_path`, fully-qualified objects और reviewed execute grants use करें।
- [ ] Suspended/locked/deleted public user valid Supabase token के बावजूद application authorization pass न
  करे। Helper/Guard `users.status`, `deleted_at`, `locked_until` verify करे।
- [ ] `user_sessions` direct read में IP/device/socket/session metadata exposure consciously approve करें;
  otherwise NestJS safe-session DTO use करें। Session mutations service-only रहें।
- [ ] `user_security_log` और `login_history` append-only/service-write; ordinary user को केवल explicitly
  approved safe audit view मिले, raw operational metadata broad policy से नहीं।
- [ ] Auth signup trigger function execution/ownership test करें; browser-supplied user metadata trusted role
  source न बने। `raw_app_meta_data` privileged provider/admin path ही रहे।

## 04 — Companies

- [ ] **BLOCKER:** `companies_public_read` पूरे `companies` row के private/internal columns expose न करे।
  Public company profile के लिए safe view/NestJS DTO/column privileges define करें।
- [ ] `company_members_own_read` से ordinary member को सभी member columns/permissions/work-contact fields
  मिलेंगे या नहीं, explicit product decision और least-privilege DTO/policy से तय करें।
- [ ] `company_settings_member_read` को ordinary member बनाम owner/admin permission के अनुसार restrict करें;
  future secrets/integration credentials इस table policy से expose न हों।
- [ ] `is_company_member()` active membership के साथ active/non-deleted user और non-deleted company भी
  verify करे; stale member row suspended user को access न दे।
- [ ] Branch/department/team/member/settings mutations NestJS company authorization से हों। Owner transfer,
  membership/permission changes और hierarchy assignments direct browser writes से न हों।
- [ ] Company owner/member cross-tenant tests और inactive/left member denial tests pass हों।

## 05 — Jobs and skills

- [ ] **BLOCKER:** `jobs_public_read` published job के सभी internal/AI/audit columns expose न करे। Public job
  listing/detail safe view या NestJS DTO से approved columns ही return हों।
- [ ] Draft/closed/internal job reads same-company authorized members तक NestJS permission context से सीमित हों।
- [ ] Job create/edit/publish/approve, skill assignments और locations service-only transactional writes हों;
  request-body `company_id`, creator/publisher/approver IDs trusted न हों।
- [ ] Public `job_categories`, active `skills`, published job skills/locations के read columns safe हैं या
  column filtering चाहिए—explicit review करें।
- [ ] `skill_requests` creation/review और master-skill approval NestJS workflow से हो; ordinary requester
  master catalog activate/rename न कर सके।
- [ ] `job_views` anonymous/authenticated direct insert abuse से protected रहे; NestJS rate-limit/dedup policy
  और service write use हो। Aggregate tables browser-writeable न हों।
- [ ] Public search केवल published/non-deleted jobs return करे; semantic/FTS query भी वही visibility predicate
  लगाए और service-role query accidentally draft jobs leak न करे।

## 06 — Documents

- [ ] `guest_upload_sessions` mutations token-scoped NestJS/service path तक सीमित रहें।
- [ ] `uploaded_documents` owner को safe metadata read मिल सकती है; insert/update/delete और signed URL
  issuance service-only रहें।
- [ ] Guest token hash, storage path और security-scan internals browser policies से expose न हों।
- [ ] `candidate_profile_documents` linking service transaction से हो; candidate केवल authorized read पाए।

## 07 — Resume processing

- [ ] Parsing jobs/results/artifacts/events browser-writeable न हों।
- [ ] Candidate को केवल safe processing-status DTO NestJS से मिले; raw worker errors/artifacts/evidence
  blindly expose न हों।
- [ ] FastAPI restricted worker role केवल approved processing/result tables और chained outbox flow लिखे।

## 08 — Candidates

- [ ] Current `candidate_*_own_all` direct-write policies को NestJS-only logical-save architecture से
  reconcile करें। Browser direct child-row mutation `profile_change_history`, exactly-one revision bump
  और outbox event bypass नहीं कर सकती।
- [ ] Recommended final direction: candidate canonical tables पर direct authenticated mutations revoke;
  NestJS service transaction ownership verify करके write करे। Candidate own reads retain हो सकती हैं।
- [ ] Evidence और `candidate_search_profiles` writes service/worker-only रहें।
- [ ] Recruiter candidate search/read NestJS authorized company/job context से हो; candidate private/raw
  evidence के लिए broad authenticated policy न बने।
- [ ] Active-resume source labels और safe recruiter DTO expose हों; raw parsed output नहीं।

## 09 — Applications and referrals

- [ ] Applications, status history, documents, snapshots, guest claims, referral batches/invitations और
  rewards की mutations service-only रहें।
- [ ] `change_application_status(...)` execute permission `anon/authenticated` से revoked और trusted
  service role तक granted रहे।
- [ ] Candidate own application reads और company-member recruiter reads tenant-safe रहें।
- [ ] Guest claim/invitation token hashes किसी client SELECT policy में expose न हों।
- [ ] `saved_jobs` direct-write policy को global NestJS-only boundary से reconcile करें।

## 10 — Interviews

- [ ] Interview mutations service-only रहें; NestJS application/company/participant authorization करे।
- [ ] Candidate को own registered interview read मिले; guest interview access token-scoped NestJS endpoint
  से हो, broad anonymous table policy से नहीं।
- [ ] Recruiter/interviewer reads same-company membership और authorized interview participation/context
  require करें।
- [ ] Confidential feedback candidate policy से कभी expose न हो। Interviewer feedback access केवल own/
  authorized company workflow के अनुसार हो।

## 11 — Messaging

- [ ] Conversation/message read policy participant के लिए दोनों require करे:

  ```text
  status = 'active'
  AND left_at IS NULL
  ```

- [ ] Existing policies जो केवल `left_at IS NULL` check करती हैं update हों; removed/blocked participant
  read access retain न करे।
- [ ] Message, participant, attachment, receipt और reaction mutations NestJS/service-only boundary से
  reconcile हों।
- [ ] Application/interview conversation recruiter access same-company context और candidate access own
  application/participant identity से derive हो।
- [ ] Soft-deleted message body/attachments raw browser SELECT से expose न हों; safe NestJS DTO policy लागू हो।
- [ ] Realtime connection/event authorization HTTP/API authorization के समान हो; channel name जानना access
  grant न बने। Reconnect database history से missed state recover करे।

## 12 — Notifications

- [ ] `notification_templates` create/edit/activate/retire केवल admin-controlled NestJS path से हो; ordinary
  authenticated user template content या lifecycle mutate न कर सके।
- [ ] User केवल अपनी safe, non-deleted notification DTO/read model पढ़ सके। Current full-row own UPDATE policy हटे;
  read/archive/soft-delete केवल constrained NestJS workflow या narrow database function से हो।
- [ ] `user_notification_preferences` और `device_tokens` की direct broad `FOR ALL` policies global NestJS-only
  mutation boundary के साथ reconcile हों।
- [ ] `notification_delivery_log`, provider IDs/errors और retry metadata browser/service consumers को expose न हों;
  worker/provider callback path service-only रहे।
- [ ] Device-token table पर client SELECT बंद रहे; authenticated device केवल NestJS से register/rotate/deactivate करे।
- [ ] Company-context notification read/create में tenant authorization validate हो; request-body `company_id` trusted न हो।
- [ ] Expired/soft-deleted notifications की visibility consciously define हो और raw rows accidentally leak न हों।
- [ ] Realtime topic/channel recipient identity से authorize हो; realtime miss होने पर database/API recovery काम करे।
- [ ] Template HTML, placeholders और `allowed_variables` ordinary browser mutation से सुरक्षित रहें; preview/rendering
  NestJS escaping/sanitization policy use करे।

## 13 — Analytics, audit and error records

- [ ] `analytics_events`, `search_logs`, `audit_logs` और `error_logs` पर direct browser INSERT/UPDATE/DELETE बंद हों;
  validated NestJS/service ingestion ही allow हो।
- [ ] Company daily aggregate read केवल active authorized company members तक limited हो; platform-wide
  `company_id IS NULL` aggregate admin-only रहे।
- [ ] Raw IP address, user-agent, search query, event payload, audit diffs और error context normal recruiter/candidate
  dashboard policies से expose न हों; safe aggregate/DTO ही लौटे।
- [ ] Audit logs ordinary roles के लिए immutable और admin/security read तक सीमित हों; sensitive fields की column-level
  exposure भी review हो।
- [ ] Error resolution admin/authorized operations path से हो; arbitrary user `resolved_by` identity forge न कर सके।
- [ ] Aggregation worker को authoritative domain tables पर केवल required read और daily aggregate upsert permission मिले।
- [ ] Raw analytics/search physical DELETE केवल separate approved retention role/job कर सके; ordinary service/browser नहीं।
- [ ] Analytics/search `user_id` और `company_id` request body से blindly trusted न हों; authenticated/tenant context से derive हों।

## 14 — Subscriptions and billing

- [ ] Public plan read केवल `is_active = TRUE AND is_public = TRUE` safe columns तक limited हो; internal feature
  administration/audit fields public full-row policy से expose न हों।
- [ ] `company_subscriptions` और `invoices` read केवल active company member होना पर्याप्त न माने; approved billing
  permission/owner authorization require हो।
- [ ] Billing address, provider customer/subscription/payment IDs और feature overrides safe DTO/column boundary से protect हों।
- [ ] Plan/coupon create-update-deactivate admin-only हों; company member commercial configuration mutate न कर सके।
- [x] New `coupon_plan_eligibility` table पर RLS explicitly enabled है; browser roles के लिए यह
  service-only/default-deny है और billing workflow NestJS/provider service से चलेगा।
- [ ] Subscription, invoice और coupon-redemption mutations trusted NestJS/provider workflow-only हों; browser direct write बंद हो।
- [ ] Coupon usage transaction row lock, same-company ownership और usage-limit policy bypass न कर सके।
- [ ] Invoice PDF signed URL केवल authorized company billing viewer को मिले; storage bucket/path raw public exposure न बने।
- [ ] Provider webhook role/service role least-privilege हो; raw provider payload/secrets table या client policy में expose न हों।
- [ ] Company A Company B की subscription/invoice/redemption read या infer न कर सके; cross-tenant tests mandatory हों।

## 15 — Transactional outbox infrastructure

- [ ] `outbox_events` और `processed_events` पर `anon`/`authenticated` का direct read/write पूर्णतः बंद हो।
- [ ] NestJS/FastAPI business writers को केवल clean `pending` outbox INSERT मिले; dispatch status/lock/task/error fields
  forge करने का direct permission न मिले।
- [ ] Dispatcher restricted role को arbitrary table UPDATE के बजाय `claim_outbox_events`,
  `mark_outbox_event_published`, `mark_outbox_event_failed` और `outbox_recovery_needed` EXECUTE मिले।
- [ ] सभी SECURITY DEFINER dispatch/recovery functions का EXECUTE `PUBLIC`, `anon`, `authenticated` से revoke हो;
  owner/search-path और exact service-role grants verify हों।
- [ ] Restricted FastAPI consumer केवल own approved domain result tables, own consumer-name `processed_events`
  insert और approved chained pending outbox event लिख सके।
- [ ] Outbox payload/last error में secrets, raw resume/contact payload या signed URL न हो; operational/admin reads limited हों।
- [ ] Dead-letter replay ordinary UPDATE से न हो; future explicit audited replay function/operation separately approve हो।
- [ ] Raw outbox/processed retention DELETE अलग maintenance role/job तक limited हो और FK-safe order follow करे।
- [ ] Supabase asynchronous webhook secret verification और Google Cloud Scheduler recovery job में database/browser keys reuse न करें।

## 16 — Cross-domain indexes

- [x] पुराना `idx_outbox_retry_work` updated `15_infrastructure.sql` के publish/stale/dead-letter indexes से
  overlap करता था; `16_indexes.sql` से हटा दिया गया।
- [ ] Candidate matching/skill indexes use करने वाली recruiter queries वही authorized candidate-visibility/company
  predicates लागू करें; fast index path private candidates expose न करे।
- [ ] Recruiter application queue query same-company authorized job context require करे; `job_id` जानना access grant न बने।
- [ ] Resume stale-work और guest cleanup queries केवल restricted worker/maintenance roles execute करें।
- [ ] `EXPLAIN (ANALYZE, BUFFERS)` tests authorized query shape के साथ run हों; RLS predicate के कारण plan changes भी review हों।

## 17 completion tests

- [ ] Candidate A Candidate B की profile/application/document/message नहीं पढ़ या बदल सकता।
- [ ] Company A member Company B की jobs/applications/interviews/messages नहीं पढ़ सकता।
- [ ] Removed/blocked conversation participant message history/realtime channel access खो देता है।
- [ ] Viewer message/reaction mutation नहीं कर सकता।
- [ ] Candidate canonical direct SQL mutation logical revision/outbox workflow bypass नहीं करती।
- [ ] Guest tokens scope, expiry, job/application और hashed-secret exposure tests pass हों।
- [ ] `anon`, `authenticated`, service role और restricted FastAPI worker role अलग test हों।

## Status

`DESIGN APPROVED — 17_rls.sql exact-copy baseline में migrated`

Design decisions `17_rls.sql` और `17_rls_Explanation.md` में implement/document हो चुके हैं। ऊपर के
unchecked boxes अब clean `01–18` test deployment के बाद evidence-backed execution/authorization audit
के लिए retained हैं; उन्हें SQL review के आधार पर falsely complete mark नहीं किया गया। खास तौर पर
cross-user, cross-company, removed participant, browser-write denial और server-role function tests अभी
run करने हैं।
