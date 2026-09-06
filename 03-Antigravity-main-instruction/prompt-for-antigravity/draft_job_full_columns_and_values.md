# Comprehensive Multi-Table Database Audit Report for Draft Job

**Target Job ID:** `f557a57c-64d4-499b-a55c-2872c0e4b0ea`<br/>
**Job Title:** **MY JOB Title**<br/>
**Status:** `draft`<br/>
**Audit Time:** `2026-09-06T12:26:54.330Z`

<a id="table-of-contents"></a>
## 📌 Quick Navigation Index

1. 📊 [Multi-Table Data Distribution Summary](#1-multi-table-data-distribution-summary)
2. 📍 [Job Locations Table (`public.job_locations`)](#2-job-locations-table-publicjob_locations---2-records)
3. 🛠️ [Job Skills Table (`public.job_skills`)](#3-job-skills-table-publicjob_skills---2-records)
4. 🏢 [Linked Employer Company (`public.companies`)](#4-linked-employer-company-publiccompanies)
5. 👤 [Linked Users (`public.users`)](#5-linked-users-publicusers---created-by--hiring-manager)
6. 🏷️ [Linked Category (`public.job_categories`)](#6-linked-category-publicjob_categories)
7. 📤 [Outbox Events Table (`public.outbox_events`)](#7-outbox-events-table-publicoutbox_events---0-events)
8. 📋 [Main Job Record Table (`public.jobs` - 70 Columns) *(Placed at the End)*](#8-main-job-record-table-publicjobs---70-columns)

---

## 1. Multi-Table Data Distribution Summary

| Table Name | Relationship | Record Count / State | Status |
|---|---|---|---|
| `public.job_locations` | 1-to-N Locations | 2 Location Record(s) | ✅ Linked |
| `public.job_skills` | 1-to-N Master Skills | 2 Skill Record(s) | ✅ Linked |
| `public.companies` | Foreign Key (`company_id`) | Company: "COMPANY ABC 1 123" | ✅ Linked |
| `public.users` | Foreign Key (`created_by` / `hiring_manager_id`) | 1 User Record(s) Linked | ✅ Linked |
| `public.job_categories` | Foreign Key (`category_id`) | Category: "Product & Design" | ✅ Linked |
| `public.outbox_events` | Event Outbox Logs | 0 Outbox Event(s) | ℹ️ No Event |
| `public.saved_jobs` | Candidate Saves | 0 Save Record(s) | ℹ️ 0 Saves |
| `public.jobs` | Main Job Record | 1 Record (70 Columns) | ✅ Active |

[⬆️ Back to Top](#table-of-contents)

---

## 2. Job Locations Table (`public.job_locations` - 2 Records)

| # | Location ID | City | State | Country | Is Primary | Remote Type | Created At |
|---|---|---|---|---|---|---|---|
| 1 | `977630b8-6db3-4eb8-a990-476fd4eb80b3` | Pune | Maharashtra | India | `true` | `-` | `Sun Sep 06 2026 17:14:55 GMT+0530 (India Standard Time)` |
| 2 | `9e6d4d53-2afc-4818-a9d1-9dcffd98e37c` | Bengaluru | Karnataka | India | `false` | `-` | `Sun Sep 06 2026 17:14:55 GMT+0530 (India Standard Time)` |

[⬆️ Back to Top](#table-of-contents)

---

## 3. Job Skills Table (`public.job_skills` - 2 Records)

| # | Skill Name | Skill ID | Is Required | Min Years | Importance Score |
|---|---|---|---|---|---|
| 1 | **Angular** | `fb39d1cb-3e37-4713-b38c-74387d5716f8` | `true` | 1.0 yrs | 5/10 |
| 2 | **Google Cloud Platform** | `af2fba2a-107c-4e81-b592-cc31d03cc753` | `true` | 1.0 yrs | 5/10 |

[⬆️ Back to Top](#table-of-contents)

---

## 4. Linked Employer Company (`public.companies`)

| Field | Value |
|---|---|
| **Company ID** | `5a6fec62-cd8c-431a-81b3-9b996f7fae41` |
| **Company Name** | **COMPANY ABC 1 123** |
| **Slug** | `company abc slug` |
| **Industry** | Technology |
| **Email** | visheshmahale1994@gmail.com |
| **Verification Status** | `verified` |
| **Verified At** | `Fri Sep 04 2026 13:55:42 GMT+0530 (India Standard Time)` |
| **Is Active** | `true` |

[⬆️ Back to Top](#table-of-contents)

---

## 5. Linked Users (`public.users` - Created By & Hiring Manager)

| User Role in Job | User ID | Name | Email | System Role |
|---|---|---|---|---|
| **Created By (Job Poster)** | `80d8e17b-8682-4e52-ac3d-4ff3047e4590` | visheshmahale1994 | visheshmahale1994@gmail.com | `employer` |

[⬆️ Back to Top](#table-of-contents)

---

## 6. Linked Category (`public.job_categories`)

| Field | Value |
|---|---|
| **Category ID** | `c0000000-0000-0000-0000-000000000003` |
| **Category Name** | **Product & Design** |
| **Slug** | `product-design` |
| **Icon** | `layout` |

[⬆️ Back to Top](#table-of-contents)

---

## 7. Outbox Events Table (`public.outbox_events` - 0 Events)

*No outbox events generated yet for this draft job.*

[⬆️ Back to Top](#table-of-contents)

---

## 8. Main Job Record Table (`public.jobs` - 70 Columns)

| # | Column Name | Data Type | Current Database Value |
|---|---|---|---|
| 1 | `id` | `uuid` | f557a57c-64d4-499b-a55c-2872c0e4b0ea |
| 2 | `company_id` | `uuid` | 5a6fec62-cd8c-431a-81b3-9b996f7fae41 |
| 3 | `branch_id` | `uuid` | *NULL* |
| 4 | `department_id` | `uuid` | *NULL* |
| 5 | `team_id` | `uuid` | *NULL* |
| 6 | `category_id` | `uuid` | c0000000-0000-0000-0000-000000000003 |
| 7 | `created_by` | `uuid` | 80d8e17b-8682-4e52-ac3d-4ff3047e4590 |
| 8 | `published_by` | `uuid` | *NULL* |
| 9 | `approved_by` | `uuid` | *NULL* |
| 10 | `approved_at` | `timestamptz` | *NULL* |
| 11 | `hiring_manager_id` | `uuid` | *NULL* |
| 12 | `title` | `varchar` | MY JOB Title |
| 13 | `slug` | `varchar` | my-job-title |
| 14 | `reference_code` | `varchar` | *NULL* |
| 15 | `employment_type` | `employment_type` | part_time |
| 16 | `work_mode` | `work_mode` | remote |
| 17 | `experience_level` | `experience_level` | entry |
| 18 | `category` | `varchar` | Product & Design |
| 19 | `location_city` | `varchar` | Pune |
| 20 | `location_state` | `varchar` | Maharashtra |
| 21 | `location_country` | `varchar` | India |
| 22 | `location_remote` | `bool` | true |
| 23 | `salary_min` | `numeric` | 100000.00 |
| 24 | `salary_max` | `numeric` | 130000.00 |
| 25 | `salary_currency` | `salary_currency` | INR |
| 26 | `salary_period` | `salary_period` | yearly |
| 27 | `salary_visible` | `bool` | true |
| 28 | `description` | `text` | We are looking for an experienced Senior Software Engineer to join our high-performing core engineering team in Pune. In this role, you will lead the architecture, design, and implementation of scalable RESTful APIs and distributed backend microservices. You will work closely with cross-functional product and engineering teams to build robust, secure, and resilient cloud solutions. |
| 29 | `responsibilities` | `text` | Architect, develop, and maintain production-grade REST APIs and microservices using Node.js, TypeScript, and PostgreSQL.\n- Perform rigorous code reviews, establish engineering best practices, and mentor junior and mid-level engineers.\n- Optimize database queries, indexing, and application performance for high-throughput concurrency.\n- Design CI/CD containerized deployment pipelines using Docker and cloud infrastructure (AWS/GCP).\n- Collaborate with Product Managers, QA, and UI/UX teams to deliver scalable product features on schedule. |
| 30 | `requirements` | `text` | Bachelor degree in Computer Science, Software Engineering, or a related technical field.<br/>- 5+ years of hands-on software development experience building scalable web applications.<br/>- Strong proficiency in Node.js, TypeScript, JavaScript (ES6+), and asynchronous programming.<br/>- Deep expertise in relational databases, particularly PostgreSQL, complex SQL queries, and schema design.<br/>- Hands-on experience with RESTful API design, microservices architecture, and security authentication protocols (JWT, OAuth2). |
| 31 | `preferred_qualifications` | `text` | Experience with Docker, Kubernetes, and cloud platforms (AWS / GCP / Azure).\n- Familiarity with frontend frameworks like React or Next.js.\n- Knowledge of Redis caching, message queues, transactional outbox pattern, or Event-Driven Architecture.\n- Strong problem-solving skills and experience with Agile/Scrum software development methodologies. |
| 32 | `benefits` | `text` | Competitive salary and performance-based annual bonuses.\n- Comprehensive medical and health insurance coverage for employee and dependents.\n- Flexible work hours and generous paid time off (PTO) policy.\n- Annual learning & professional development allowance for certifications and conferences.\n- Modern office environment with wellness perks and team outings. |
| 33 | `application_form_url` | `text` | *NULL* |
| 34 | `screening_questions_enabled` | `bool` | false |
| 35 | `screening_questions` | `jsonb` | `[]` |
| 36 | `ai_matching_enabled` | `bool` | true |
| 37 | `ai_ideal_candidate_profile` | `jsonb` | *NULL* |
| 38 | `ai_profile_model` | `varchar` | *NULL* |
| 39 | `ai_profile_version` | `int4` | *NULL* |
| 40 | `ai_generated_at` | `timestamptz` | *NULL* |
| 41 | `embedding_model` | `varchar` | *NULL* |
| 42 | `embedding_version` | `int4` | *NULL* |
| 43 | `embedding_generated_at` | `timestamptz` | *NULL* |
| 44 | `status` | `job_status` | draft |
| 45 | `published_at` | `timestamptz` | *NULL* |
| 46 | `expires_at` | `timestamptz` | *NULL* |
| 47 | `paused_at` | `timestamptz` | *NULL* |
| 48 | `closed_at` | `timestamptz` | *NULL* |
| 49 | `closed_reason` | `varchar` | *NULL* |
| 50 | `vacancies` | `int4` | 4 |
| 51 | `applications_count` | `int4` | 0 |
| 52 | `last_application_at` | `timestamptz` | *NULL* |
| 53 | `views_count` | `int4` | 0 |
| 54 | `is_featured` | `bool` | true |
| 55 | `is_urgent` | `bool` | true |
| 56 | `is_confidential` | `bool` | true |
| 57 | `embedding_status` | `embedding_status` | pending |
| 58 | `embedding` | `vector` | *NULL* |
| 59 | `search_vector` | `tsvector` | '2':321B '5':75B 'agile/scrum':170B 'allow':299 'angular':314B 'annual':270,295 'api':38B,117B,182C 'applic':87B,213C 'architect':174C 'architectur':31B,120B,160B 'asynchron':96B 'authent':123B 'aw':134B 'aws/gcp':231C 'azur':136B 'bachelor':63B 'backend':41B 'base':269 'bengaluru':260C 'best':197C 'bonus':271 'build':56B,84B 'cach':150B 'certif':301 'ci/cd':222C 'close':46B 'cloud':61B,132B,229C,316B 'code':193C 'collabor':233C 'competit':264 'complex':105B 'comprehens':273 'comput':66B 'concurr':219C 'confer':303 'container':223C 'core':19B 'coverag':278 'cross':49B 'cross-funct':48B 'custom':319B 'customskill2':318B 'databas':102B,209C 'deep':98B 'degre':64B 'deliv':242C 'depend':282 'deploy':224C 'design':32B,110B,118B,221C,249C 'develop':82B,172B,175C,298 'distribut':40B 'docker':129B,227C 'driven':159B 'employe':280 'engin':12B,20B,53B,69B,196C,206C 'entri':257C 'environ':307 'es6':94B 'establish':195C 'event':158B 'event-driven':157B 'experi':83B,114B,127B,168B 'experienc':9B 'expertis':99B 'familiar':138B 'featur':245C 'field':74B 'flexibl':284 'framework':141B 'frontend':140B 'function':50B 'gcp':135B 'generous':288 'googl':315B 'grade':180C 'hand':79B,112B 'hands-on':78B,111B 'health':276 'high':17B,217C,255C 'high-perform':16B 'high-throughput':216C 'hour':286 'implement':34B 'index':211C 'india':262C,263 'infrastructur':230C 'insur':277 'javascript':93B 'job':2A 'join':14B 'junior':201C 'jwt':125B 'karnataka':261C 'knowledg':147B 'kubernet':130B 'lead':29B 'learn':296 'level':205C 'like':142B 'look':6B 'maharashtra':259C 'maintain':177C 'manag':236C 'medic':274 'mentor':200C 'messag':151B 'methodolog':173B 'microservic':42B,119B,184C 'mid':204C 'mid-level':203C 'modern':305 'n':137B,146B,161B,190C,207C,220C,232C,272,283,294,304 'next.js':145B 'night':253C 'node.js':91B,186C 'oauth2':126B 'offic':306 'optim':208C 'outbox':154B 'outing':313 'paid':289 'part':250C 'particular':103B 'pattern':155B 'perform':18B,191C,214C,268 'performance-bas':267 'perk':310 'pipelin':225C 'platform':133B,317B 'polici':293 'postgresql':104B,189C 'practic':198C 'problem':164B 'problem-solv':163B 'product':51B,179C,235C,244C,248C 'production-grad':178C 'profession':297 'profici':89B 'program':97B 'protocol':124B 'pto':292 'pune':23B,258C 'qa':237C 'queri':107B,210C 'queue':152B 'react':143B 'redi':149B 'relat':72B,101B 'remot':252C 'resili':60B 'rest':37B,116B,181C 'review':194C 'rigor':192C 'robust':57B 'role':26B 'salari':265 'scalabl':36B,85B,243C 'schedul':247C 'schema':109B 'school':256C 'scienc':67B 'secur':58B,122B 'senior':10B 'skill':166B,320B 'softwar':11B,68B,81B,171B 'solut':62B 'solv':165B 'sql':106B 'strong':88B,162B 'team':21B,54B,240C,312 'technic':73B,254C 'throughput':218C 'time':251C,290 'titl':3A 'transact':153B 'typescript':92B,187C 'ui/ux':239C 'use':185C,226C 'web':86B 'well':309 'work':45B,285 'year':76B |
| 60 | `deleted_at` | `timestamptz` | *NULL* |
| 61 | `created_at` | `timestamptz` | `"2026-09-06T04:29:38.260Z"` |
| 62 | `updated_at` | `timestamptz` | `"2026-09-06T11:44:55.294Z"` |
| 63 | `experience_min` | `int4` | 2 |
| 64 | `experience_max` | `int4` | 5 |
| 65 | `max_notice_period_days` | `int4` | 30 |
| 66 | `work_shift` | `varchar` | night |
| 67 | `education_type` | `varchar` | technical |
| 68 | `min_education_level` | `varchar` | high_school |
| 69 | `interview_rounds` | `jsonb` | `[{"name":"round 1","round":1,"description":"aaaa"},{"name":"round 2","round":2,"description":"bbbb"}]` |
| 70 | `custom_skills` | `jsonb` | `["customskill2","custom skill 2"]` |

[⬆️ Back to Top](#table-of-contents)
