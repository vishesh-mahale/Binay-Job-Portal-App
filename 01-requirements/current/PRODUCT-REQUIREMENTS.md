# Master Product Requirements

[← Requirements index](../README.md) · [Main project](../../README.md)

## 1. Product vision — APPROVED

एक secure, scalable, multi-company recruitment/job portal बनाना है जो traditional
hiring workflows को AI-assisted resume parsing, search, matching, screening,
interviews, referrals, messaging, notifications और analytics के साथ combine करे।

Core principle:

> AI recruiter/candidate को assist करेगी; final hiring decision replace नहीं करेगी।

### Public website scope — PLANNED

Public experience में home, company/product information, contact, authentication और required legal
pages representable हों। Pricing/features pages commercial decision के अनुसार enabled होंगी। Blog,
FAQ और admin-managed static content का full CMS [future roadmap](../future/FUTURE-ROADMAP.md) में है।
पुरानी estimated page count implementation contract नहीं है; responsive routes/components UX design
के अनुसार तय होंगे।

## 2. Account model — APPROVED

Current production scope में एक account पर एक application role होगा:

```text
candidate
employer
hr
admin
```

Referral कोई अलग role नहीं है। Eligibility का final rule
[PD-001](../product-decisions/PD-001-ACCOUNT-AND-REFERRAL-ROLES.md) में है।

## 3. Authentication and authorization — APPROVED

- Secure registration, login, verification, session और password flows चाहिए।
- Authorization identity, active account status, role, permission, tenant/company
  membership और resource ownership verify करेगी।
- Browser privileged service-role credentials use नहीं करेगा।
- HR permissions company context में configurable होनी चाहिए।
- Admin/employer/HR designation alone किसी resource का automatic access नहीं देती।

## 4. Candidate capabilities — APPROVED/PLANNED

Candidate को:

- register/login और account manage करना;
- minimal onboarding complete करना;
- editable professional profile maintain करना;
- resume/documents upload और versions manage करना;
- authorized resume/document preview देखना;
- jobs browse/search/filter/save करना;
- registered या guest flow से job apply करना;
- applications track करना;
- interview invitations और schedule manage करना;
- notifications और messages receive करना;
- match/gap information देखना जहाँ feature enabled हो;
- feedback submit करना;
- eligible jobs पर candidates refer करना

support होना चाहिए।

Canonical profile facts manually editable रहेंगी। Resume-derived data canonical
truth को silently overwrite नहीं करेगी। Active-resume search behavior
[PD-002](../product-decisions/PD-002-ACTIVE-RESUME-SEARCH.md) में है।

## 5. Employer and HR capabilities — APPROVED/PLANNED

Employer/company owner को:

- company profile, branches, departments और members manage करना;
- HR users invite/manage करना;
- permissions और company settings manage करना;
- jobs create/manage/approve करना;
- applicants, shortlist और hiring pipeline देखना;
- interviews, feedback, analytics, subscription/billing और audit information manage
  करना जहाँ relevant feature implemented हो

support होना चाहिए।

Authorized HR को assigned permissions के अनुसार jobs, candidates, applications,
shortlisting, interviews, messaging और recruiter search workflows use करने होंगे।

## 6. Admin capabilities — PLANNED

Admin को companies/users/jobs/applications, operational status, plans/coupons,
analytics, notification templates, security/audit/error logs और platform feedback
manage/monitor करने की क्षमता चाहिए। Future-only admin modules roadmap में हैं।

## 7. Candidate onboarding — APPROVED

Onboarding short और responsive रहनी चाहिए। Minimum initial data product flow के
अनुसार name, verified contact और resume हो सकता है; account-based profile बाद में
progressively complete हो सकती है। Long mandatory profile form first step नहीं होगा।

Guest apply और registered onboarding अलग flows हैं; guest को application submit करने
से पहले full account/profile create करने के लिए force नहीं करना है।

## 8. Documents and resume parsing — APPROVED DIRECTION

- Resume/document private storage में जाएगा।
- Type, size, signature, ownership और security-scan validation आवश्यक है।
- Heavy parsing asynchronous होगी; UI request को deep AI processing का wait नहीं।
- Structured parse results/evidence auditable और historical होंगी।
- Candidate canonical profile और immutable resume evidence अलग concepts हैं।
- Same resume reprocessing/history representable होनी चाहिए।
- Candidate को parsing progress/completion दिखाई देनी चाहिए।

Immediate “fast-track name extraction” पुराने source में suggested था लेकिन अभी
`NEEDS_DECISION` है; इसे mandatory production requirement नहीं माना जाएगा जब तक UX,
latency और duplicate-processing benefit approve न हो।

## 9. Job management and discovery — APPROVED

- Authorized company users jobs create/edit/publish/close/archive कर सकें।
- Job skills, locations, work mode, compensation, experience और other structured
  requirements representable हों।
- Candidate job search keyword relevance, structured filters और semantic matching
  combine कर सके।
- Common filters: location, skills, experience, salary, company, job type, work mode
  और posted date।
- Search behavior fast, paginated और explainable होना चाहिए।

## 10. Candidate recruiter search and matching — APPROVED DIRECTION

- Authorized recruiter canonical candidate information की derived search projection
  search करेगा; raw internal/evidence fields blindly expose नहीं होंगे।
- Search structured filters, keyword/FTS और semantic similarity combine कर सकती है।
- Candidate open-to-work/visibility और tenant authorization enforce होंगे।
- Job/candidate matching skill, experience, education, location और other approved
  factors पर structured result दे सकती है।
- Match result recruiter decision support है, automatic hiring verdict नहीं।
- Missing/gap requirements explainable form में दिख सकती हैं।

## 11. Job applications — APPROVED

### Registered apply

Authenticated candidate application अपने candidate profile से link करेगी और
submission-time immutable historical snapshot बनाएगी।

### Guest apply

Guest job-scoped, expiring upload/session flow से apply कर सकता है। बाद में account
बनाने पर verified claim/merge flow application को candidate से link कर सकता है।

### Common rules

- Application candidate consent/action के बाद ही बनेगी।
- One candidate/normalized guest identity एक `job_id` पर एक application रखेगी।
- Reposted vacancy नया `job_id` use करेगी।
- बाद के profile/resume changes submitted application history नहीं बदलेंगे।
- Status changes authorized, audited और history के साथ होंगी।

[PD-003](../product-decisions/PD-003-APPLICATION-HISTORY.md) देखें।

## 12. Recruitment workflow — PLANNED

```text
Application
→ HR review
→ shortlist/reject
→ employer/authorized review
→ screening/interview
→ selection/offer/rejection
```

Exact configurable workflow/offer module acceptance criteria relevant component
phase में freeze होंगे; पुराने arrow diagram को rigid universal state machine नहीं
मानना है।

## 13. Interviews — APPROVED DIRECTION

- Availability और rolling slots;
- temporary slot lock;
- conflict/double-booking prevention;
- participants and interview feedback;
- candidate/recruiter calendar updates;
- reminders और lifecycle notifications

support होने चाहिए। External calendar/video integrations future roadmap में हैं।

## 14. Referrals — APPROVED

First version manual multi-candidate invitation flow use करेगी। Full contract:
[Manual Referral Requirement](MANUAL-REFERRAL-REQUIREMENT.md)।

### Configurable referral programs and rewards — PLANNED CURRENT SCOPE

Company/admin को referral program और reward rules configure करने की क्षमता चाहिए। Existing
`referral_batches`, `referral_invitations` और `referral_rewards` operational-record foundation
हैं; configurable program/rule tables, authorization, APIs, UI और tests अभी implement करने हैं।
Reward rule company/job/campaign context, eligibility, reward type और lifecycle define करेगा।

## 15. Messaging and notifications — APPROVED DIRECTION

- Authorized conversation participants messaging कर सकें।
- Application/interview/referral/account events notifications बना सकें।
- Delivery channel state और in-app notification state अलग track हों।
- UI को relevant updates बिना manual refresh उपलब्ध कराने का mechanism होगा। Exact
  WebSocket/SSE/realtime transport component ADR में freeze होगा।
- Email हर possible event पर unconditional नहीं जाएगी; event, preference, policy,
  rate-limit और template के अनुसार delivery होगी।

Recruiter/candidate live inbox relevant events दिखा सके, जैसे resume processing complete, new
application, candidate/application status, match/screening update, interview booked/reminder,
selection/rejection, offer outcome, message और referral update। Exact recipient/channel/default matrix
notification contract में freeze होगी।

### Admin-manageable email templates — PLANNED CURRENT SCOPE

Referral invitation, application confirmation, interview invitation/reminder और account-related
emails के templates admin manage कर सकेगा। Existing `notification_templates` foundation को
evaluate/extend करके HTML/text content, approved variables, preview, version history, activation
और safe rendering support करना है।

## 15A. Recruiter saved candidates — PLANNED CURRENT SCOPE

Authorized employer/HR candidate search या profile view से candidate bookmark कर सकेगा। Record
recruiter/user और company scope में रहेगा, optional notes support करेगा और tenant boundaries के
बाहर expose नहीं होगा। Existing `saved_jobs` यह requirement satisfy नहीं करता। `saved_candidates`
database model, permissions, NestJS APIs, UI और tests अभी implement करने हैं।

## 16. Analytics, feedback and subscriptions — PLANNED

- Job views/applications/conversions, registrations, referral performance,
  recruitment funnel, recruiter/candidate activity और interview metrics capture हों।
- Registered और guest platform feedback supported हो।
- Company subscription, plans, invoices, coupons और commercial status representable
  हों। Payment-provider integration अलग approved contract माँगेगी।

## 17. AI screening and recommendations — PLANNED

AI resume/job analysis के आधार पर contextual screening questions, candidate/job
recommendations और gap analysis बना सकती है। Generated output:

- structured और versioned हो;
- source/model/version trace करे;
- unsafe/unverified claim को confirmed canonical fact न बनाए;
- human review/override support करे।

Screening context resume evidence, job requirements और approved employer preferences से आ सकता है।
Example topics relocation, shift preference, notice period, expected salary, work authorization और
work-mode preference हैं; sensitive/illegal question policies लागू होंगी। Match explanation skill,
experience, education, location, salary/expectation और other approved factors separately report कर
सकती है—एक unexplained percentage अकेला decision नहीं होगा।

Exact model/provider product requirement नहीं; वह ADR और replaceable provider
contract का विषय है।

## 18. Acceptance-level product principles

- Short, understandable user journeys;
- secure guest और registered flows;
- candidate consent और privacy;
- tenant isolation;
- immutable historical application/evidence records;
- AI provenance और human control;
- asynchronous heavy work;
- incremental scalability बिना unnecessary day-one feature expansion।
