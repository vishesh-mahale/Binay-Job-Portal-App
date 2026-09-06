# Comprehensive Multi-Table Database Audit Report for Draft Job

**Target Job ID:** `f557a57c-64d4-499b-a55c-2872c0e4b0ea`  
**Job Title:** **Front End Developer**  
**Status:** `draft`  
**Audit Time:** `2026-09-06T05:50:29.804Z`  

<a id="table-of-contents"></a>
## 📌 Quick Navigation Index

1. 📊 [Multi-Table Data Distribution Summary](#1-multi-table-data-distribution-summary)
2. 📍 [Job Locations Table (`public.job_locations`)](#2-job-locations-table-publicjob_locations---2-records)
3. 🛠️ [Job Skills Table (`public.job_skills`)](#3-job-skills-table-publicjob_skills---3-records)
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
| `public.job_skills` | 1-to-N Master Skills | 3 Skill Record(s) | ✅ Linked |
| `public.companies` | Foreign Key (`company_id`) | Company: "COMPANY ABC 1 123" | ✅ Linked |
| `public.users` | Foreign Key (`created_by` / `hiring_manager_id`) | 1 User Record(s) Linked | ✅ Linked |
| `public.job_categories` | Foreign Key (`category_id`) | Category: "Frontend Development" | ✅ Linked |
| `public.outbox_events` | Event Outbox Logs | 0 Outbox Event(s) | ℹ️ No Event |
| `public.saved_jobs` | Candidate Saves | 0 Save Record(s) | ℹ️ 0 Saves |
| `public.jobs` | Main Job Record | 1 Record (70 Columns) | ✅ Active |

[⬆️ Back to Top](#table-of-contents)

---

## 2. Job Locations Table (`public.job_locations` - 2 Records)

| # | Location ID | City | State | Country | Is Primary | Remote Type | Created At |
|---|---|---|---|---|---|---|---| 
| 1 | `440c1967-a9ca-47fd-92bb-14543054af90` | Pune | Maharashtra | India | `true` | `-` | `Sun Sep 06 2026 11:02:24 GMT+0530 (India Standard Time)` |
| 2 | `8a89cccb-1341-48ed-9edd-e58fcf00f9f3` | Bengaluru | Karnataka | India | `false` | `-` | `Sun Sep 06 2026 11:02:24 GMT+0530 (India Standard Time)` |

[⬆️ Back to Top](#table-of-contents)

---

## 3. Job Skills Table (`public.job_skills` - 3 Records)

| # | Skill Name | Skill ID | Is Required | Min Years | Importance Score |
|---|---|---|---|---|---| 
| 1 | **Angular** | `fb39d1cb-3e37-4713-b38c-74387d5716f8` | `true` | 1.0 yrs | 5/10 |
| 2 | **AWS** | `d3ec89f6-ce05-4f7d-9185-b32b7219b485` | `true` | 1.0 yrs | 5/10 |
| 3 | **B2B Sales** | `a2fb0d06-fd59-4738-a3e0-cddfd9cdc3f7` | `true` | 1.0 yrs | 5/10 |

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
| **Created By (Job Poster)** | `80d8e17b-8682-4e52-ac3d-4ff3047e4590` | visheshmahale1994  | visheshmahale1994@gmail.com | `employer` |

[⬆️ Back to Top](#table-of-contents)

---

## 6. Linked Category (`public.job_categories`)

| Field | Value |
|---|---|
| **Category ID** | `c0000000-0000-0000-0000-000000000102` |
| **Category Name** | **Frontend Development** |
| **Slug** | `frontend-development` |
| **Icon** | `monitor` |

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
| 6 | `category_id` | `uuid` | c0000000-0000-0000-0000-000000000102 |
| 7 | `created_by` | `uuid` | 80d8e17b-8682-4e52-ac3d-4ff3047e4590 |
| 8 | `published_by` | `uuid` | *NULL* |
| 9 | `approved_by` | `uuid` | *NULL* |
| 10 | `approved_at` | `timestamp with time zone` | *NULL* |
| 11 | `hiring_manager_id` | `uuid` | *NULL* |
| 12 | `title` | `character varying` | Front End Developer |
| 13 | `slug` | `character varying` | front-end-developer |
| 14 | `reference_code` | `character varying` | *NULL* |
| 15 | `employment_type` | `employment_type` | part_time |
| 16 | `work_mode` | `work_mode` | remote |
| 17 | `experience_level` | `experience_level` | entry |
| 18 | `category` | `character varying` | Frontend Development |
| 19 | `location_city` | `character varying` | Pune |
| 20 | `location_state` | `character varying` | Maharashtra |
| 21 | `location_country` | `character varying` | India |
| 22 | `location_remote` | `boolean` | `true` |
| 23 | `salary_min` | `numeric` | 100000.00 |
| 24 | `salary_max` | `numeric` | 100000.00 |
| 25 | `salary_currency` | `salary_currency` | INR |
| 26 | `salary_period` | `salary_period` | yearly |
| 27 | `salary_visible` | `boolean` | `true` |
| 28 | `description` | `text` | We are looking for an experienced Senior Software Engineer to join our high-performing core engineering team in Pune. In this role, you will lead the architecture, design, and implementation of scalable RESTful APIs and distributed backend microservices. You will work closely with cross-functional product and engineering teams to build robust, secure, and resilient cloud solutions. |
| 29 | `responsibilities` | `text` | Architect, develop, and maintain production-grade REST APIs and microservices using Node.js, TypeScript, and PostgreSQL.<br/>- Perform rigorous code reviews, establish engineering best practices, and mentor junior and mid-level engineers.<br/>- Optimize database queries, indexing, and application performance for high-throughput concurrency.<br/>- Design CI/CD containerized deployment pipelines using Docker and cloud infrastructure (AWS/GCP).<br/>- Collaborate with Product Managers, QA, and UI/UX teams to deliver scalable product features on schedule. |
| 30 | `requirements` | `text` | Bachelor degree in Computer Science, Software Engineering, or a related technical field.<br/>- 5+ years of hands-on software development experience building scalable web applications.<br/>- Strong proficiency in Node.js, TypeScript, JavaScript (ES6+), and asynchronous programming.<br/>- Deep expertise in relational databases, particularly PostgreSQL, complex SQL queries, and schema design.<br/>- Hands-on experience with RESTful API design, microservices architecture, and security authentication protocols (JWT, OAuth2). |
| 31 | `preferred_qualifications` | `text` | Experience with Docker, Kubernetes, and cloud platforms (AWS / GCP / Azure).<br/>- Familiarity with frontend frameworks like React or Next.js.<br/>- Knowledge of Redis caching, message queues, transactional outbox pattern, or Event-Driven Architecture.<br/>- Strong problem-solving skills and experience with Agile/Scrum software development methodologies. |
| 32 | `benefits` | `text` | Competitive salary and performance-based annual bonuses.<br/>- Comprehensive medical and health insurance coverage for employee and dependents.<br/>- Flexible work hours and generous paid time off (PTO) policy.<br/>- Annual learning & professional development allowance for certifications and conferences.<br/>- Modern office environment with wellness perks and team outings. |
| 33 | `application_form_url` | `text` | *NULL* |
| 34 | `screening_questions_enabled` | `boolean` | `false` |
| 35 | `screening_questions` | `jsonb` | `[]` |
| 36 | `ai_matching_enabled` | `boolean` | `true` |
| 37 | `ai_ideal_candidate_profile` | `jsonb` | *NULL* |
| 38 | `ai_profile_model` | `character varying` | *NULL* |
| 39 | `ai_profile_version` | `integer` | *NULL* |
| 40 | `ai_generated_at` | `timestamp with time zone` | *NULL* |
| 41 | `embedding_model` | `character varying` | *NULL* |
| 42 | `embedding_version` | `integer` | *NULL* |
| 43 | `embedding_generated_at` | `timestamp with time zone` | *NULL* |
| 44 | `status` | `job_status` | draft |
| 45 | `published_at` | `timestamp with time zone` | *NULL* |
| 46 | `expires_at` | `timestamp with time zone` | *NULL* |
| 47 | `paused_at` | `timestamp with time zone` | *NULL* |
| 48 | `closed_at` | `timestamp with time zone` | *NULL* |
| 49 | `closed_reason` | `character varying` | *NULL* |
| 50 | `vacancies` | `integer` | 4 |
| 51 | `applications_count` | `integer` | 0 |
| 52 | `last_application_at` | `timestamp with time zone` | *NULL* |
| 53 | `views_count` | `integer` | 0 |
| 54 | `is_featured` | `boolean` | `true` |
| 55 | `is_urgent` | `boolean` | `true` |
| 56 | `is_confidential` | `boolean` | `true` |
| 57 | `embedding_status` | `embedding_status` | pending |
| 58 | `embedding` | `vector` | *NULL* |
| 59 | `search_vector` | `tsvector` | '5':75B 'allow':244 'angular':259B 'annual':215,240 'api':38B,117B,135C 'applic':87B,166C 'architect':127C 'architectur':31B,120B 'asynchron':96B 'authent':123B 'aw':260B 'aws/gcp':184C 'b2b':261B 'bachelor':63B 'backend':41B 'base':214 'best':150C 'bonus':216 'build':56B,84B 'certif':246 'ci/cd':175C 'close':46B 'cloud':61B,182C 'code':146C 'collabor':186C 'competit':209 'complex':105B 'comprehens':218 'comput':66B 'concurr':172C 'confer':248 'container':176C 'core':19B 'coverag':223 'cross':49B 'cross-funct':48B 'databas':102B,162C 'deep':98B 'degre':64B 'deliv':195C 'depend':227 'deploy':177C 'design':32B,110B,118B,174C 'develop':3A,82B,128C,202C,243 'distribut':40B 'docker':180C 'employe':225 'end':2A 'engin':12B,20B,53B,69B,149C,159C 'entri':206C 'environ':252 'es6':94B 'establish':148C 'experi':83B,114B 'experienc':9B 'expertis':99B 'featur':198C 'field':74B 'flexibl':229 'front':1A 'frontend':201C 'function':50B 'generous':233 'grade':133C 'hand':79B,112B 'hands-on':78B,111B 'health':221 'high':17B,170C 'high-perform':16B 'high-throughput':169C 'hour':231 'implement':34B 'index':164C 'india':208 'infrastructur':183C 'insur':222 'javascript':93B 'join':14B 'junior':154C 'jwt':125B 'lead':29B 'learn':241 'level':158C 'look':6B 'maintain':130C 'manag':189C 'medic':219 'mentor':153C 'microservic':42B,119B,137C 'mid':157C 'mid-level':156C 'modern':250 'n':143C,160C,173C,185C,217,228,239,249 'node.js':91B,139C 'oauth2':126B 'offic':251 'optim':161C 'outing':258 'paid':234 'part':203C 'particular':103B 'perform':18B,144C,167C,213 'performance-bas':212 'perk':255 'pipelin':178C 'polici':238 'postgresql':104B,142C 'practic':151C 'product':51B,132C,188C,197C 'production-grad':131C 'profession':242 'profici':89B 'program':97B 'protocol':124B 'pto':237 'pune':23B,207C 'qa':190C 'queri':107B,163C 'relat':72B,101B 'remot':205C 'resili':60B 'rest':37B,116B,134C 'review':147C 'rigor':145C 'robust':57B 'role':26B 'salari':210 'sale':262B 'scalabl':36B,85B,196C 'schedul':200C 'schema':109B 'scienc':67B 'secur':58B,122B 'senior':10B 'softwar':11B,68B,81B 'solut':62B 'sql':106B 'strong':88B 'team':21B,54B,193C,257 'technic':73B 'throughput':171C 'time':204C,235 'typescript':92B,140C 'ui/ux':192C 'use':138C,179C 'web':86B 'well':254 'work':45B,230 'year':76B |
| 60 | `deleted_at` | `timestamp with time zone` | *NULL* |
| 61 | `created_at` | `timestamp with time zone` | `"2026-09-06T04:29:38.260Z"` |
| 62 | `updated_at` | `timestamp with time zone` | `"2026-09-06T05:50:05.896Z"` |
| 63 | `experience_min` | `integer` | 2 |
| 64 | `experience_max` | `integer` | 5 |
| 65 | `max_notice_period_days` | `integer` | 30 |
| 66 | `work_shift` | `character varying` | night |
| 67 | `education_type` | `character varying` | technical |
| 68 | `min_education_level` | `character varying` | high_school |
| 69 | `interview_rounds` | `jsonb` | `[{"name":"round 1","round":1,"description":"aaaa"},{"name":"round 2","round":2,"description":"bbbb"}]` |
| 70 | `custom_skills` | `jsonb` | `["customskill1","customskill2"]` |

[⬆️ Back to Top](#table-of-contents)

