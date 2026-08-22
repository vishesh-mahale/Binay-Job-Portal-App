# Candidate Profile se HR Search tak — Supabase Test Flow

[← Database index](../README.md) · [Main project](../../README.md)

## Purpose

Is guide ka purpose actual Supabase database mein complete flow test karna hai:

```text
Candidate account
→ candidate profile
→ skills/experience/education
→ search projection
→ HR-authorized candidate search
→ RLS verification
```

Database ki `01` se `18` files execute ho chuki hain. Ab hum controlled test data
dalenge aur har stage ke baad result verify karenge.

Current clean-run status:

```text
01–18 execution        = passed
public tables          = 82
RLS-enabled tables     = 82
candidate/HR test data = fresh flow ke liye create karna baaki
```

Purane Vishesh UUID aur pehle manually-created projection ko current result nahi maana jayega. Yeh
repeatable test plan hai; checkbox isi clean run ke evidence ke baad complete hoga.

## Important architecture rule

HR browser ko `candidate_search_profiles` par direct unrestricted access nahi
diya gaya hai.

```text
HR browser
→ NestJS Candidate Search API
→ HR/company membership authorization
→ service-role database query
→ safe candidate search DTO
```

Supabase SQL Editor service/admin context mein query chala sakta hai aur RLS bypass
kar sakta hai. Isliye data-flow test aur RLS test अलग steps होंगे।

---

## Application ki complete story: screen se HR result tak

Neeche production application ka actual intended flow hai. SQL Editor testing
isi story ke database effects ko manually reproduce करेगी।

### Story 1: Vishesh Next.js se candidate account banata hai

Vishesh signup screen par enter karta hai:

```text
First name = Vishesh
Last name  = Mahale
Email      = vishesh.candidate@example.com
Password   = ********
```

Call chain:

```text
Vishesh ka browser
→ Next.js signup form
→ POST /api/auth/register
→ NestJS AuthController
→ AuthService.registerCandidate()
```

Next.js password ko database mein direct insert नहीं करती। NestJS validated DTO
receive karta hai:

```json
{
  "firstName": "Vishesh",
  "lastName": "Mahale",
  "email": "vishesh.candidate@example.com",
  "password": "not-logged-or-stored-by-application"
}
```

Normal self-signup mein NestJS Supabase **Server Auth SDK** call karta hai:

```text
supabase.auth.signUp(...)
```

`auth.admin.createUser(...)` normal public signup path नहीं है। वह केवल trusted
admin/import/test flow में use होगा। Browser Supabase Auth को directly call नहीं
करेगा; request NestJS के through जाएगी।

Isse Supabase ki managed `auth.users` table mein identity banti hai:

```text
auth.users.id    = user-candidate-uuid
auth.users.email = vishesh.candidate@example.com
```

Password/hash Supabase Auth manage karta hai; `public.users` mein password column
hai hi nahi.

`auth.users` INSERT ke baad database ka `on_auth_user_created` trigger
`handle_new_user()` call karta hai. Function conceptually ye insert karti hai:

```sql
INSERT INTO public.users (
    id, email, first_name, last_name, role, status
) VALUES (
    :auth_user_id,
    :auth_email,
    :first_name_from_auth_metadata_or_email,
    :last_name_from_auth_metadata,
    :trusted_application_role_or_candidate,
    :active_if_already_confirmed_else_pending_verification
);
```

Production signup mein NestJS duplicate `public.users` INSERT नहीं करेगा।
`public.users` INSERT ke baad दूसरा database trigger:

```text
create_candidate_profile_on_user_signup
→ create_empty_candidate_profile()
→ candidate_profiles INSERT
```

Expected empty profile:

```text
candidate_profiles.user_id              = user-candidate-uuid
candidate_profiles.profile_revision     = 1
candidate_profiles.profile_completed_at = NULL
```

Complete signup sequence:

```text
Next.js
→ NestJS
→ Supabase Auth identity
→ auth.users AFTER INSERT trigger
→ public.users
→ public.users AFTER INSERT trigger
→ empty candidate_profiles
→ verification email/response
```

अगर signup trigger fail होता है तो Auth creation भी fail/rollback होनी चाहिए।
NestJS safe error return करेगा; duplicate manual insert करके trigger failure को
hide नहीं करना है।

### Story 2: Vishesh email verify karke login karta hai

```text
Verification link
→ Next.js verify page
→ NestJS verify endpoint
→ Supabase Auth verify
→ public.users.status = active
```

Login ke baad JWT Vishesh ki identity carry karta hai. Next.js request body se
`user_id` decide नहीं करेगी; NestJS verified token se `auth user id` निकालेगा।

### Story 3: Vishesh profile manually complete karta hai

Vishesh profile page par title, summary, location aur preferences save karta hai:

```text
Next.js Profile Form
→ PATCH /api/candidates/me/profile
→ CandidateController
→ CandidateProfileService.saveProfile()
```

NestJS ownership token se resolve karta hai:

```sql
SELECT id, profile_revision
FROM candidate_profiles
WHERE user_id = :authenticated_user_id
  AND deleted_at IS NULL
FOR UPDATE;
```

Phir same transaction mein:

```text
candidate_profiles basic fields UPDATE
candidate_skills INSERT/UPDATE/soft-delete
candidate_experiences INSERT/UPDATE/soft-delete
candidate_educations INSERT/UPDATE/soft-delete
profile_change_history INSERT
bump_candidate_profile_revision(candidate_id) exactly once
outbox_events INSERT: candidate.profile.changed
COMMIT
```

Pseudo transaction:

```sql
BEGIN;

UPDATE candidate_profiles
SET professional_title = :title,
    summary = :summary,
    current_location = :location,
    profile_completed_at = COALESCE(profile_completed_at, NOW())
WHERE id = :candidate_id;

-- Child skills/experience/education changes happen here.

SELECT bump_candidate_profile_revision(:candidate_id);

INSERT INTO outbox_events (
    aggregate_type, aggregate_id, event_type, payload
) VALUES (
    'candidate',
    :candidate_id,
    'candidate.profile.changed',
    :payload_with_profile_revision
);

COMMIT;
```

अगर skill insert fail हो जाए तो basic profile, revision और outbox event भी rollback
होंगे। Half-save allowed नहीं है।

### Story 4: Background worker Vishesh ko searchable banata hai

Profile Save HTTP response ko projection/embedding बनने का wait नहीं करना है। Final
background chain:

```text
NestJS profile transaction COMMIT
→ outbox_events INSERT webhook
→ Supabase Async Database Webhook Dispatcher को wake करती है
→ NestJS Outbox Dispatcher pending event claim करता है
→ Google Cloud Tasks Queue में deterministic task बनती है
→ Cloud Run पर FastAPI Candidate Projection Worker task consume करता है
```

Normal path webhook hai. Missed/stuck event ke liye GCP Cloud Scheduler (`dev-outbox-recovery-sweep`) har 10 min
lightweight check karke Dispatcher ko wake karti hai.

Projection Worker पूरा canonical aggregate read karta hai:

```text
candidate_profiles
+ candidate_skills
+ candidate_experiences
+ candidate_educations
+ candidate_projects
+ candidate_certifications
+ candidate_languages
+ candidate_awards
+ candidate_links
+ latest active resume parsed facts
```

Worker normalized text बनाता है:

```text
Java Backend Developer. Skills: Java, Spring Boot, PostgreSQL, Docker.
4 years backend experience. B.Tech Computer Science. Location: Noida.
```

Phir:

```text
normalized text
├→ searchable_text
├→ PostgreSQL to_tsvector(...) → search_vector
└→ Embedding API → vector response → embedding
```

Final database operation conceptually:

```sql
INSERT INTO candidate_search_profiles (...)
VALUES (...)
ON CONFLICT (candidate_id)
DO UPDATE SET ...;
```

Worker upsert se pehle verify karega ki requested revision abhi bhi latest hai.
Purana worker newer profile projection overwrite नहीं कर सकता। Event successfully
process hone par `processed_events` mein idempotency record बनेगा।

### Story 5: Priya HR account aur company context

Priya HR identity creation:

```text
Next.js
→ NestJS register/login
→ auth.users
→ handle_new_user() की default public.users row
```

Current `handle_new_user()` public `raw_user_meta_data` se role trust nahi karti. Sirf
server/admin-controlled `raw_app_meta_data.application_role` mein valid value hone par
`candidate`, `employer`, `hr` ya `admin` role liya jata hai; missing/invalid value safely
`candidate` banti hai. Isliye public request body mein `role=hr` bhejkar koi HR nahi ban sakta.

Auth row insert ke samay `email_confirmed_at` populated ho to `public.users.status = active` banta hai;
warna `pending_verification` banta hai aur NestJS verification workflow baad mein ise active karta hai.
Trusted HR/company onboarding browser ke bajay admin/server flow se hoga.

Uske baad company relation:

```text
companies.owner_id = Priya UUID
OR
company_members(company_id, user_id = Priya UUID, is_active = true)
```

HR hona केवल request body में `role=hr` भेजने से authorize नहीं होगा। NestJS
authenticated user और active company membership verify करेगा।

### Story 6: Priya HR Java candidate search karti hai

Priya search form mein enter karti hai:

```text
Keywords       = Java Spring Boot
Location       = Noida
Min experience = 3 years
```

Call chain:

```text
HR browser
→ Next.js Candidate Search page
→ GET /api/recruiter/candidates?...filters
→ NestJS CandidateSearchController
→ CandidateSearchService.search()
```

NestJS pehle authorization karta hai:

```text
JWT user exists and active?
→ company owner/active member?
→ candidate-search permission available?
```

Uske baad service-role database query conceptually:

```sql
SELECT
    csp.candidate_id,
    csp.professional_title,
    csp.skill_names,
    csp.locations,
    csp.total_experience_years,
    ts_rank(csp.search_vector, websearch_to_tsquery('english', :keywords)) AS keyword_score
FROM candidate_search_profiles csp
JOIN candidate_profiles cp ON cp.id = csp.candidate_id
JOIN users u ON u.id = cp.user_id
WHERE cp.deleted_at IS NULL
  AND u.status = 'active'
  AND u.deleted_at IS NULL
  AND cp.is_open_to_work = TRUE
  AND csp.source_profile_revision = cp.profile_revision
  AND csp.projection_revision = csp.source_profile_revision
  AND csp.search_vector @@ websearch_to_tsquery('english', :keywords)
  AND csp.total_experience_years >= :minimum_experience
ORDER BY keyword_score DESC;
```

Later hybrid ranking:

```text
structured filters
+ keyword score
+ embedding similarity score
→ final ordered HR results
```

NestJS safe DTO return करेगा; raw evidence, internal storage path, token hash,
salary-sensitive/internal fields blindly browser ko return नहीं होंगे।

### Story 7: Vishesh HR screen par appear hota hai

Vishesh तभी result में आएगा जब:

```text
public.users status active है और deleted_at NULL है
AND candidate_profiles.deleted_at NULL है
AND candidate_profiles.is_open_to_work = true
AND search projection latest hai
AND keyword/filter conditions match karti hain
AND Priya authorized company member/owner hai
```

Result example:

```json
{
  "candidateId": "candidate-uuid",
  "professionalTitle": "Java Backend Developer",
  "skills": ["Java", "Spring Boot", "PostgreSQL", "Docker"],
  "location": "Noida",
  "experienceYears": 4,
  "matchReason": ["Java", "Spring Boot", "Noida"]
}
```

### Story 8: Direct Supabase access kyon nahi?

```text
Next.js → direct service-role Supabase query ❌
Next.js → NestJS → authorized service query ✅
```

Current RLS raw `candidate_search_profiles` ko candidate ya HR browser ke liye direct readable nahi
banati. Candidate ko own profile/search readiness aur HR ko authorized talent results NestJS safe DTOs
se milenge. Raw projection mein embedding, source labels aur internal ranking fields hote hain.

---

## Complete checklist

- [ ] Step 1: Candidate Auth user create
- [ ] Step 2: HR Auth user create
- [ ] Step 3: `public.users` rows create
- [ ] Step 4: Empty candidate profile verify
- [ ] Step 5: Test company create
- [ ] Step 6: HR company membership create
- [ ] Step 7: Candidate basic profile save
- [ ] Step 8: Skills insert
- [ ] Step 9: Experience insert
- [ ] Step 10: Education insert
- [ ] Step 11: Profile revision/history/outbox verify
- [ ] Step 12: Candidate search projection create (manual bootstrap)
- [ ] Step 13: Keyword search test (`Java` और `Microservices`)
- [ ] Step 14: HR-authorized service query test
- [ ] Step 15: Candidate RLS test
- [ ] Step 16: HR direct-browser RLS test
- [ ] Step 17: Results document
- [ ] Step 18: Embedding/hybrid test when worker/model is configured

---

## Step 1–2: Supabase Auth users

Supabase Dashboard:

```text
Authentication
→ Users
→ Add user
→ Create new user
```

### Candidate user

```text
Email: vishesh.candidate@example.com
Auto Confirm User: ON
```

Dashboard ka `Auto Confirm User: ON` Auth row create karte samay `email_confirmed_at` populate karta
hai. Current signup trigger aisi row ke liye `public.users.status = active` banata hai. Auto Confirm
OFF ho to status `pending_verification` hogi aur production NestJS verification workflow ise active
karke security log append karega.

### HR user

```text
Email: hr.flow.test@example.com
Auto Confirm User: ON
```

Dashboard se ordinary HR test identity create karne par trusted application-role metadata nahi hogi,
isliye row default `candidate` banegi. Test mein trusted admin SQL/server onboarding se role `hr` karein.
Auto Confirm ON hone par status pehle se `active` hoga. Production trusted Admin API
`raw_app_meta_data.application_role = hr` ke saath identity create kar sakti hai.

Temporary passwords private rakhein. Password SQL file ya chat mein share nahi
karna hai.

Create hone ke baad note karein:

```text
Candidate Auth UUID = ________________________________
HR Auth UUID        = ________________________________
```

`public.users.id` exactly corresponding `auth.users.id` ke equal hoga.

---

## Step 3: Application users

Supabase Auth user create होते ही `on_auth_user_created` trigger `public.users`
row automatically बनाएगा:

```text
Candidate with Auto Confirm ON:
role   = candidate
status = active

Dashboard-created HR test identity initially:
role   = candidate
status = active (Auto Confirm ON)

Trusted HR onboarding के बाद:
role   = hr
status = active
```

Candidate `public.users` row insert hone par दूसरा database trigger automatically empty
`candidate_profiles` row create karega.

Expected relation:

```text
auth.users.id
      =
public.users.id
      ↓
candidate_profiles.user_id
```

---

## Step 4: Empty candidate profile

Verify karenge:

```text
candidate_profiles.user_id = Candidate Auth UUID
profile_revision            = 1
profile_completed_at        = NULL
professional_title          = NULL
```

Meaning: account ready hai, lekin professional profile abhi incomplete hai.

---

## Step 5–6: Company aur HR membership

Test company example:

```text
Name                = Flow Test Technologies
Slug                = flow-test-technologies
Owner               = HR user
Verification status = verified
Active              = true
```

`company_members` mein HR membership bhi create करेंगे:

```text
company_id       = test company
user_id          = HR UUID
title            = Talent Acquisition HR
is_primary_hr    = true
is_active        = true
employment_status = active
```

Authorization function:

```text
is_company_member(company_id)
```

HR ko company owner ya active member hone par authorized मानेगी।

---

## Step 7: Candidate basic profile

Vishesh example profile:

```text
Professional title  = Java Backend Developer
Summary             = Backend developer with Spring Boot and PostgreSQL experience
Current location    = Noida, Uttar Pradesh, India
Preferred work mode = hybrid
Open to work        = true
Expected salary     = 900000–1300000 INR
Notice period       = 30 days
```

Update ke baad:

```text
profile_completed_at = current time
```

---

## Step 8: Candidate skills

Master `skills` rows:

```text
Java
Spring Boot
PostgreSQL
Docker
```

Candidate relation rows:

```text
candidate_skills
→ candidate_id
→ skill_id
→ years_of_experience
→ proficiency_level
→ candidate_manual
→ candidate_confirmed
```

Example:

| Skill | Experience | Proficiency |
|---|---:|---:|
| Java | 4 years | 8/10 |
| Spring Boot | 3.5 years | 8/10 |
| PostgreSQL | 3 years | 7/10 |
| Docker | 2 years | 6/10 |

---

## Step 9: Experience

`candidate_experiences` example:

```text
Company         = ABC Software Pvt Ltd
Job title       = Backend Developer
Employment type = full_time
Location        = Noida
Start date      = 2022-01-10
Current job     = true
Description     = Java/Spring Boot APIs and PostgreSQL systems
```

---

## Step 10: Education

`candidate_educations` example:

```text
Institution = Delhi Technical University
Degree      = B.Tech
Field       = Computer Science
Start date  = 2017-07-01
End date    = 2021-06-30
```

---

## Step 11: Revision, history aur outbox

Ek logical profile-save transaction ka expected behavior:

```text
Basic profile + skills + experience + education save
→ profile_change_history rows
→ bump_candidate_profile_revision(candidate_id) once
→ candidate.profile.changed outbox event
→ COMMIT
```

Expected:

```text
profile_revision: 1 → 2
```

चार skills होने का मतलब revision `+4` नहीं होगा। एक Save action = revision `+1`।

---

## Step 12: Candidate search projection

Production mein background Projection Worker canonical aggregate पढ़ेगा:

```text
candidate_profiles
+ candidate_skills
+ candidate_experiences
+ candidate_educations
+ candidate_projects
+ candidate_certifications
+ candidate_languages
+ candidate_awards
+ candidate_links
+ latest active profile resume parsed facts
```

First database test mein worker available na hone par SQL se equivalent projection
row manually create करेंगे। यह केवल database-flow bootstrap test है; production
में client/NestJS candidate projection row manually नहीं लिखेंगे।

Projection example:

```text
candidate_id            = Vishesh candidate id
source_profile_revision = 2
projection_revision     = 2
professional_title      = Java Backend Developer
skill_names             = Java, Spring Boot, PostgreSQL, Docker
locations               = Noida, Uttar Pradesh, India
experience_years        = 4
education_level         = B.Tech
searchable_text         = normalized combined profile text
search_vector           = PostgreSQL TSVECTOR
embedding               = NULL initially
```

`embedding` initially `NULL` rakhna intentional hai. Pehle relational filters aur
keyword search verify करेंगे। Real embedding बाद में configured API/worker से बनेगी।

---

## Step 13: Keyword aur filter search

Test queries:

```text
Keyword: Java Spring Boot
Location: Noida
Minimum experience: 3 years
Open to work: true
```

Expected result:

```text
Vishesh Mahale
Java Backend Developer
Java, Spring Boot, PostgreSQL, Docker
4 years
Noida
```

Negative checks:

```text
Python-only search → Vishesh नहीं मिलना चाहिए
Experience >= 6 years → Vishesh नहीं मिलना चाहिए
Location Pune-only → Vishesh नहीं मिलना चाहिए
```

---

## Step 14: HR-authorized service query

NestJS flow:

```text
HR JWT
→ users.status = active और role/context verify
→ company owner/member verify
→ candidate is_open_to_work verify
→ candidate_search_profiles query
→ safe result DTO
```

Test service query HR email/UUID और company membership दोनों verify करेगी। केवल
request-body में company UUID भेजना authorization नहीं माना जाएगा।

---

## Step 15: Candidate RLS test

Candidate JWT context से expected:

```text
Own candidate_profiles          → visible
Own skills/experience/education → visible
Own candidate_search_profiles   → direct permission denied; NestJS safe DTO
Another candidate profile       → hidden
```

---

## Step 16: HR direct-browser RLS test

Current architecture में expected:

```text
HR direct Supabase SELECT candidate_search_profiles
→ table permission denied (`42501`) expected
```

यह failure नहीं, intentional security design है। HR search NestJS service API से
होगी। Service role key कभी browser में expose नहीं होगी।

---

## Step 17: Results record

हर query के बाद record करेंगे:

| Test | Expected | Actual | Pass/Fail |
|---|---|---|---|
| Empty candidate profile trigger | 1 row |  |  |
| Canonical profile aggregate | Complete |  |  |
| Revision bump | 1 → 2 |  |  |
| Outbox event | 1 row |  |  |
| Java keyword search | Vishesh visible |  |  |
| Python negative search | Vishesh hidden |  |  |
| HR service authorization | Allowed |  |  |
| HR raw projection query | Permission denied |  |  |
| Candidate own canonical RLS query | Visible |  |  |
| Candidate raw projection query | Permission denied |  |  |

Schema issue मिलने पर seed data blindly बदलने के बजाय constraint/policy और
expected business rule compare करेंगे।

---

## Step 18: Embedding/hybrid test when worker/model is configured

Keyword/filter flow pass होने के बाद:

```text
searchable_text
→ embedding service
→ vector(768)
→ candidate_search_profiles.embedding
→ semantic similarity query
```

Embedding API database में direct write नहीं करेगी। Projection Worker API response
validate करके vector save करेगा।

Job और candidate vectors exactly same embedding provider/model, dimensions और
normalization contract से बनने चाहिए। अलग embedding spaces के vectors की cosine
similarity meaningful नहीं मानी जाएगी।

---

## Next immediate action

Clean baseline pass ho chuki hai, lekin is fresh run ka candidate/HR data-flow test abhi start nahi
hua. Ise sequence mein complete karna hai:

```text
1. Candidate Auth identity aur empty profile trigger verify karein
2. HR Auth identity create karke trusted onboarding se role set karein
3. Candidate canonical save + revision/history/outbox verify karein
4. Projection bootstrap/worker output aur keyword search verify karein
5. Test company, membership aur NestJS-equivalent authorized query chalayein
6. Candidate aur HR direct-browser denial/safe DTO behavior verify karein
```

Passwords document/chat में store नहीं करने हैं; केवल HR UUID आगे के test में use
होगा।

---

## Current architecture alignment audit

| Document area | Final treatment |
|---|---|
| Signup trigger chain | Preserved; confirmed-status aur trusted app-role behavior corrected |
| Candidate logical save/revision/outbox | Preserved; current 08/15 ownership ke saath aligned |
| Projection worker inputs | Preserved; `candidate_awards` sahit complete canonical aggregate listed |
| Webhook → Dispatcher → Cloud Tasks → FastAPI | Preserved as finalized background chain |
| HR search | Preserved behind NestJS company authorization and safe DTO |
| Candidate projection direct RLS read | Corrected: current 17 mein raw projection browser-readable nahi hai |
| Old completed checkboxes/UUID | Reset because clean database rerun ke baad old evidence current nahi hai |
| Embedding | Current architecture retained; execution worker/model configuration par dependent hai |
| SQL Editor use | Retained only as manual database-effect/bootstrap test, production write path nahi |
