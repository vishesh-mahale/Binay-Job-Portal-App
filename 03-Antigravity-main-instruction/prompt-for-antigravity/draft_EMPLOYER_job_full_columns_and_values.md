# Comprehensive Multi-Table Database Audit Report for Job (PUBLISHED)

**Target Job ID:** `f557a57c-64d4-499b-a55c-2872c0e4b0ea`<br/>
**Job Title:** **MY JOB Title**<br/>
**Status:** `published`<br/>
**Audit Time:** `2026-09-08T06:11:16.750Z`

<a id="table-of-contents"></a>
## 📌 Quick Navigation Index

1. 📊 [Multi-Table Data Distribution Summary](#1-multi-table-data-distribution-summary)
2. 📍 [Job Locations Table (`public.job_locations`)](#2-job-locations-table-publicjob_locations---2-records)
3. 🛠️ [Job Skills Table (`public.job_skills`)](#3-job-skills-table-publicjob_skills---3-records)
4. 🏢 [Linked Employer Company (`public.companies`)](#4-linked-employer-company-publiccompanies)
5. 👤 [Linked Users (`public.users`)](#5-linked-users-publicusers---created-by--hiring-manager)
6. 🏷️ [Linked Category (`public.job_categories`)](#6-linked-category-publicjob_categories)
7. 📤 [Outbox Events Table (`public.outbox_events`)](#7-outbox-events-table-publicoutbox_events---4-events)
8. 📋 [Main Job Record Table (`public.jobs` - 70 Columns) *(Placed at the End)*](#8-main-job-record-table-publicjobs---70-columns)

---

## 1. Multi-Table Data Distribution Summary

| Table Name | Relationship | Record Count / State | Status |
|---|---|---|---|
| `public.job_locations` | 1-to-N Locations | 2 Location Record(s) | ✅ Linked |
| `public.job_skills` | 1-to-N Master Skills | 3 Skill Record(s) | ✅ Linked |
| `public.companies` | Foreign Key (`company_id`) | Company: "COMPANY ABC 1 123" | ✅ Linked |
| `public.users` | Foreign Key (`created_by` / `hiring_manager_id`) | 1 User Record(s) Linked | ✅ Linked |
| `public.job_categories` | Foreign Key (`category_id`) | Category: "Marketing & Content" | ✅ Linked |
| `public.outbox_events` | Event Outbox Logs | 4 Outbox Event(s) | ✅ Logged |
| `public.saved_jobs` | Candidate Saves | 0 Save Record(s) | ℹ️ 0 Saves |
| `public.jobs` | Main Job Record | 1 Record (70 Columns) | ✅ Active |

[⬆️ Back to Top](#table-of-contents)

---

## 2. Job Locations Table (`public.job_locations` - 2 Records)

| # | Location ID | City | State | Country | Is Primary | Remote Type | Created At |
|---|---|---|---|---|---|---|---|
| 1 | `a5b4752b-27a5-43a8-ab85-6dde2eef186e` | Pune | Maharashtra | India | `true` | `-` | `Sun, 06 Sep 2026 17:21:30 GMT` |
| 2 | `bf08306b-046a-4481-8f7d-d651b1b05854` | Bengaluru | Karnataka | India | `false` | `-` | `Sun, 06 Sep 2026 17:21:30 GMT` |

[⬆️ Back to Top](#table-of-contents)

---

## 3. Job Skills Table (`public.job_skills` - 3 Records)

| # | Skill Name | Skill ID | Is Required | Min Years | Importance Score |
|---|---|---|---|---|---|
| 1 | **Agile / Scrum** | `622d0a90-1266-488d-a619-748f14502c2d` | `true` | 1.0 yrs | 5/10 |
| 2 | **Angular** | `fb39d1cb-3e37-4713-b38c-74387d5716f8` | `true` | 1.0 yrs | 5/10 |
| 3 | **Google Cloud Platform** | `af2fba2a-107c-4e81-b592-cc31d03cc753` | `true` | 1.0 yrs | 5/10 |

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
| **Verified At** | `Fri, 04 Sep 2026 08:25:42 GMT` |
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
| **Category ID** | `c0000000-0000-0000-0000-000000000005` |
| **Category Name** | **Marketing & Content** |
| **Slug** | `marketing-content` |
| **Icon** | `megaphone` |

[⬆️ Back to Top](#table-of-contents)

---

## 7. Outbox Events Table (`public.outbox_events` - 4 Events)

| # | Event ID | Event Type | Status | Retry Count | Occurred At | Published At | Last Error |
|---|---|---|---|---|---|---|---|
| 1 | `bc6d9871-21c1-4b01-abd6-d5afcc78daf5` | `job.enriched` | `failed` | 9 | `Tue, 08 Sep 2026 05:52:19 GMT` | *NULL* | `unknown_route:job.enriched` |
| 2 | `bfa85b02-85f1-4c0a-9c6d-1b504aa9786d` | `job.ai.enrichment.requested` | `published` | 0 | `Tue, 08 Sep 2026 05:51:47 GMT` | `Tue, 08 Sep 2026 05:51:48 GMT` | *NULL* |
| 3 | `41c4976c-6bc4-4065-8279-080a28415a4d` | `job.enriched` | `dead_letter` | 10 | `Sun, 06 Sep 2026 17:27:54 GMT` | *NULL* | `unknown_route:job.enriched` |
| 4 | `d83c14ce-b5ca-4814-ab61-8e3b5143d3f6` | `job.ai.enrichment.requested` | `published` | 0 | `Sun, 06 Sep 2026 17:27:29 GMT` | `Sun, 06 Sep 2026 17:27:31 GMT` | *NULL* |

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
| 6 | `category_id` | `uuid` | c0000000-0000-0000-0000-000000000005 |
| 7 | `created_by` | `uuid` | 80d8e17b-8682-4e52-ac3d-4ff3047e4590 |
| 8 | `published_by` | `uuid` | 80d8e17b-8682-4e52-ac3d-4ff3047e4590 |
| 9 | `approved_by` | `uuid` | *NULL* |
| 10 | `approved_at` | `timestamptz` | *NULL* |
| 11 | `hiring_manager_id` | `uuid` | *NULL* |
| 12 | `title` | `varchar` | MY JOB Title |
| 13 | `slug` | `varchar` | my-job-title |
| 14 | `reference_code` | `varchar` | *NULL* |
| 15 | `employment_type` | `employment_type` | part_time |
| 16 | `work_mode` | `work_mode` | remote |
| 17 | `experience_level` | `experience_level` | entry |
| 18 | `category` | `varchar` | Marketing & Content |
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
| 30 | `requirements` | `text` | Bachelor degree in Computer Science, Software Engineering, or a related technical field.\n- 5+ years of hands-on software development experience building scalable web applications.\n- Strong proficiency in Node.js, TypeScript, JavaScript (ES6+), and asynchronous programming.\n- Deep expertise in relational databases, particularly PostgreSQL, complex SQL queries, and schema design.\n- Hands-on experience with RESTful API design, microservices architecture, and security authentication protocols (JWT, OAuth2). |
| 31 | `preferred_qualifications` | `text` | Experience with Docker, Kubernetes, and cloud platforms (AWS / GCP / Azure).\n- Familiarity with frontend frameworks like React or Next.js.\n- Knowledge of Redis caching, message queues, transactional outbox pattern, or Event-Driven Architecture.\n- Strong problem-solving skills and experience with Agile/Scrum software development methodologies. |
| 32 | `benefits` | `text` | Competitive salary and performance-based annual bonuses.\n- Comprehensive medical and health insurance coverage for employee and dependents.\n- Flexible work hours and generous paid time off (PTO) policy.\n- Annual learning & professional development allowance for certifications and conferences.\n- Modern office environment with wellness perks and team outings. |
| 33 | `application_form_url` | `text` | *NULL* |
| 34 | `screening_questions_enabled` | `bool` | false |
| 35 | `screening_questions` | `jsonb` | `[]` |
| 36 | `ai_matching_enabled` | `bool` | true |
| 37 | `ai_ideal_candidate_profile` | `jsonb` | `{"inferred":{"keywords":["Software Engineer","Backend","Node.js","TypeScript","PostgreSQL","Microservices","REST API","Cloud","AWS","GCP","Docker","Kubernetes","Agile","CI/CD","Performance Optimization","Mentoring","Architecture","Distributed Systems"],"seniority":"Senior","role_family":"Software Engineering","soft_skills":["Problem-solving","Collaboration","Mentorship","Leadership","Communication","Establishing Best Practices"],"confidence_score":0.9,"industry_domains":["Technology"],"technical_domains":["Backend Development","Cloud Computing","Microservices","API Development","Database Management","DevOps","Web Development"],"likely_career_level":"Senior Engineer","primary_responsibilities":["Lead architecture, design, and implementation of scalable RESTful APIs and distributed backend microservices","Develop and maintain production-grade REST APIs and microservices using Node.js, TypeScript, and PostgreSQL","Perform rigorous code reviews and establish engineering best practices","Mentor junior and mid-level engineers","Optimize database queries, indexing, and application performance","Design CI/CD containerized deployment pipelines using Docker and cloud infrastructure","Collaborate with cross-functional teams (Product Managers, QA, UI/UX) to deliver scalable product features"]},"metadata":{"model":"gemini-2.0-flash","generated_at":"2026-09-08T06:00:09.372824+00:00","model_version":"v1","prompt_version":"v1","processing_time_ms":23484},"extracted":{"languages":[],"certifications":[],"must_have_skills":["Angular","Google Cloud Platform","Agile / Scrum","customskill2","custom skill 2","Node.js","TypeScript","JavaScript (ES6+)","Asynchronous Programming","Relational Databases","PostgreSQL","Complex SQL Queries","Schema Design","RESTful API Design","Microservices Architecture","Security Authentication Protocols (JWT, OAuth2)"],"nice_to_have_skills":["Docker","Kubernetes","AWS","Azure","React","Next.js","Redis Caching","Message Queues","Transactional Outbox Pattern","Event-Driven Architecture"],"preferred_education":["high_school (technical)"],"minimum_experience_years":2},"schema_version":1}` |
| 38 | `ai_profile_model` | `varchar` | gemini-2.0-flash |
| 39 | `ai_profile_version` | `int4` | 1 |
| 40 | `ai_generated_at` | `timestamptz` | `"2026-09-08T06:00:12.597Z"` |
| 41 | `embedding_model` | `varchar` | text-embedding-004 |
| 42 | `embedding_version` | `int4` | 1 |
| 43 | `embedding_generated_at` | `timestamptz` | `"2026-09-08T06:00:12.597Z"` |
| 44 | `status` | `job_status` | published |
| 45 | `published_at` | `timestamptz` | `"2026-09-06T17:27:29.737Z"` |
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
| 57 | `embedding_status` | `embedding_status` | completed |
| 58 | `embedding` | `vector` | [0.0429157,0.024922442,-0.03903048,-0.018374797,0.032786146,0.018139658,0.024828168,-0.04041563,0.0004375648,0.049899865,-0.047011834,0.03374436,0.05840002,-0.012731692,-0.016901834,0.015021224,0.0039487514,0.02981293,-0.031717513,-0.057982124,-0.022718854,0.013106202,-0.044079028,-0.026376307,-0.01276331,0.032769695,0.015810622,0.009532985,0.02634274,-0.00032534703,-0.0012831674,0.025334688,-0.022999724,-0.033600695,0.0016760416,0.013678711,0.009057264,0.009745352,0.085837506,-0.048547506,-0.05899984,-0.0044982177,-0.034916185,0.055819597,0.008765773,0.0028520816,-0.028954044,-0.0064973487,-0.061323896,0.047761694,0.01900325,-0.0075192866,-0.024784593,0.011144493,-0.04434864,-0.05989205,-0.016546337,-0.038809333,-0.0025616954,0.043696463,0.00040141793,-0.035593547,-0.050724007,-0.06646603,0.046917826,-0.026100326,-0.046933215,0.018056426,-0.07805594,-0.00379306,-0.010356155,0.006178963,-0.06428339,0.02908391,-0.04714543,0.0032775896,0.05481969,-0.050314542,-0.013341836,0.028181922,-0.029056124,0.0050905054,0.049982287,0.020854063,-0.010028341,-0.043020867,0.018394899,-0.07287429,-0.026248395,-0.016969275,0.08601178,0.014749507,0.004955146,-0.010051438,0.0005488142,-0.03800525,-0.042816173,-0.04296443,0.055494484,0.034522545,0.05811363,0.061744098,0.0112436395,0.009678931,0.00044647927,0.04438885,-0.07718111,-0.033970755,-0.080874324,0.014962921,-0.019161167,0.026084159,0.027352318,-0.0057859835,-0.0095671825,0.055748396,0.002070749,-0.03765756,-0.02229185,0.046829466,0.05385077,0.027995963,-0.05782384,0.07365614,0.040719733,0.0144902505,0.025598468,0.023998912,-0.023461817,-0.014653768,0.10289539,-0.06684156,-0.05955017,0.0056237066,0.015781095,0.0039415536,0.08144865,-0.058318786,-0.0054338872,0.013694474,-0.020268425,-0.04382784,-0.040946,0.013962188,-0.06807112,-0.0360445,0.0058265794,0.08469385,-0.009061573,0.03335522,-0.020735871,0.019860143,-0.006559541,0.014608556,-0.005235153,-0.026948575,0.04092527,-0.073384665,0.03448043,0.025370892,0.012073726,-0.065894425,-0.003233844,-0.02048519,-0.06849215,-0.102875374,0.010437801,0.012448917,-0.0041790246,-0.039621186,0.0070080543,-0.014864253,-0.04237415,-0.02277607,-0.0026934042,0.034390666,-0.030930813,-0.094327666,-0.045205332,-0.07669494,0.058208484,0.06535274,0.030505676,-0.0019319061,0.06575449,-0.0021557983,-0.018908126,0.02411622,0.034020398,0.05092277,0.017314246,-0.009636533,0.0058759428,0.0058273375,-0.008848678,-0.015698737,0.023040319,-0.04314147,0.06456305,-0.09175345,-0.0039745336,0.022420956,-3.326446e-05,0.0043136044,-0.037232216,0.029514482,-0.0008754061,-0.0056837457,0.0041066753,0.03140361,-0.021937609,0.0059628007,-0.021203756,-0.0524948,0.023102457,0.03325223,0.039406884,0.020346113,0.08844367,-0.05703221,0.04984954,-0.02044604,0.033355657,0.0358673,0.05646066,0.054516554,-0.02308082,0.002021556,-0.026854703,-0.031561155,0.016254477,0.021266285,0.017604731,-0.0033815342,0.003977088,0.026281955,-0.0151252765,-0.0060618203,-0.035986718,-0.026128685,-0.028900102,0.0480519,0.017233778,-0.0310795,0.011259567,0.06082229,0.019297814,0.032605186,-0.023059905,-0.111205555,-0.0027308613,-0.028803673,-0.016897235,0.021972377,-0.023361677,-0.013642475,-0.0240193,-0.02956426,-0.014952298,0.017354406,0.07278158,-0.015479343,0.007852477,-0.044384368,0.0062968023,-0.088458754,-0.06810818,-0.014636435,0.025296401,-0.052737467,0.035790678,-0.06676649,-0.031042136,-0.025274033,-0.027334621,0.04258205,-0.031717155,-0.00498117,-0.053501345,-0.007764486,0.0030399696,-0.010624358,0.06958193,0.029553453,-0.010797918,-0.025162576,-0.051920973,0.03530109,-0.0020639575,-0.062813394,0.07851394,0.024370171,-0.04736177,-0.065895356,0.023884885,-0.014355112,0.070030354,0.05117905,-0.0071612615,-0.012402439,0.04219737,0.04604088,-0.020240713,-0.026746085,-0.022929747,-0.026590554,-0.020479606,-0.0138871325,-0.017966622,0.02515546,0.018919555,-0.025885796,-0.017677225,0.03252258,-0.04353354,-0.02440182,-0.16552271,0.0170489,-0.025066681,0.02109599,0.010710667,-0.0110591175,-0.0014101187,-0.012309005,-0.046826288,-0.0139438715,-0.01687288,0.00062616356,0.030893657,0.032290433,0.025171751,-0.010192646,0.041605152,-0.006237142,0.047911994,0.013170188,-0.039527453,0.0019367487,0.07579989,-0.008102096,-0.0050637624,0.0031116456,0.09114084,0.012091266,-0.003963554,-0.0099281315,0.06565651,-0.038707215,0.037315562,0.0073456694,-0.008554692,0.020383058,0.01515992,0.020244133,-0.012114156,0.017903855,-0.0023394057,0.032973472,0.011154517,-0.009849888,-0.022278382,0.04688097,-0.034974318,0.057625737,-0.020977136,0.06944887,0.045141406,-0.0054250676,0.050289053,0.022184277,-0.04410196,-0.005341686,0.039677422,0.043328162,0.0069314637,-0.021980282,-0.028145088,0.0013316957,0.029451704,-0.02328003,0.042023215,-0.037946023,0.023355473,0.028215872,-0.007940926,0.06773399,-0.081427075,-0.020733034,0.06154219,0.0053768773,-0.060287364,-0.0045778854,0.03208594,0.008702918,-0.05376176,-0.0077248034,-0.011994758,0.02978575,0.041391093,-0.010882046,0.0064022476,0.013239789,0.015384142,-0.08215877,-0.036498513,-0.0010256463,0.04569048,-0.010396559,0.0115097035,-0.048169468,0.000702219,-0.05457361,-0.03383027,-0.035046678,-0.019873291,-0.031680595,-0.022944296,-0.0031461685,-0.012718146,0.025400884,-0.015823098,-0.0038485087,0.02319825,-0.022673491,-0.01378513,-0.06404603,-4.3515684e-05,0.017748222,-0.006353145,-0.0020310136,0.007641892,-0.029552203,-0.03982375,0.009801343,-0.020823225,0.03118324,0.014632045,-0.039838094,-0.046732478,0.020770675,-0.017732881,-0.0010443514,0.02998878,0.0008104402,-0.014394675,0.015035202,0.024085902,0.027978616,-0.0050863344,-0.0016866653,0.005921383,0.0019325595,-0.0014703274,-0.047202114,-0.061613772,0.050777577,-0.013282925,0.03620455,-0.00038733453,0.04862299,-0.006035093,0.004425164,-0.0066703474,0.0771208,0.024966579,-0.008575874,-0.0150678605,0.011474088,0.013906847,0.01624303,0.07722727,-0.011102931,0.017948436,-0.02239863,-0.010808325,-0.015973613,0.02690268,-0.010787068,-0.031135522,-0.023855511,0.0030642827,0.040645223,-0.06361096,-0.01959905,0.036561634,-0.004455208,-0.01316589,-0.05138581,-0.072207004,-0.033773497,-0.023462765,0.0032890534,-0.020110385,-0.016602684,-0.02220893,-0.010479524,0.05832297,-0.0064067384,-0.010111885,0.0659662,0.0725326,0.032839872,0.031795837,-0.040878143,-0.04372522,-0.0013386443,-0.044312708,0.036374453,0.06084741,0.01723978,0.018495368,-0.038814094,-0.0045467108,0.030393615,-0.01967101,0.017675381,0.06607918,0.0078922855,-0.0072379056,0.036554985,-0.05178318,-0.03614201,0.02168475,0.03206532,0.014310222,-0.024243122,-0.009154749,0.016032666,0.038371813,-0.07201644,0.014887356,0.056724716,0.0846848,0.005116883,-0.022293083,0.030844156,0.017436033,0.037390355,0.004267449,0.008624986,0.03362771,-0.012248159,-0.01941233,0.006962762,0.07682034,-0.007783313,0.0040173093,0.033769652,0.01793459,0.024131171,-0.006064905,-0.0101349065,0.04968237,0.052870493,-0.040606502,-0.014033272,0.014364467,0.0035774969,0.0022198805,-0.0100264205,0.017729543,0.010574405,0.0065518045,-0.033867747,-0.03701793,-0.0064337477,-0.058942426,0.0583226,0.011414449,0.00047915507,-0.019702338,-0.04867621,0.02905754,-0.01306709,0.007838284,-0.032115765,-0.062384948,0.02841365,0.04474326,0.015718596,-0.025027523,0.020402618,0.049118552,0.015072549,-0.019226268,-0.02630374,-0.00574169,0.04698039,0.008965026,-0.043214094,-0.022266781,0.0006361024,0.020606644,-0.018445784,0.025587883,-0.018888362,-0.00708703,0.033397485,0.0015192654,-0.023515033,-0.007319802,0.06201981,0.06891249,-0.0130651435,-0.05854786,-0.03414075,-6.999471e-05,-0.10379997,0.016181303,0.01181686,-0.004735792,0.0030427685,-0.012535653,-0.036872003,-0.09572282,0.00640712,-0.01812253,0.028609352,-0.0036402042,0.057557903,0.007400803,0.026104975,0.031239664,-0.026746267,0.00455693,0.022945568,-0.0647668,0.008116501,0.084578045,0.01525784,0.0066418787,0.04978976,0.017612211,-0.02472032,-0.013730639,0.017628485,-0.061975326,0.03360552,0.011974768,-0.08248748,-0.015927885,-0.037353706,0.039206214,0.02165638,-0.031713903,0.03640986,0.013199228,0.01629489,0.0021723448,0.0688266,0.030719185,0.09771113,-0.02984831,-0.015770417,0.0012896765,-0.059924297,-0.04214414,-0.0025021993,0.011979156,-0.026334986,-0.024761384,-0.010619484,-0.024976991,0.05624131,-0.057983674,-0.013904078,-0.033602305,0.006197,-0.00870435,-0.0020423515,0.019175742,-0.013387071,-0.025213882,0.05412847,0.003992444,-0.0069852513,-0.00494684,-0.06505716,0.011098223,0.058334514,-0.002782459,-0.052002035,0.006439689,-0.021273073,0.012213223,0.03747204,0.013763782,-0.038738277,-0.018943097,0.028510619,0.0045189676,-0.03527093,-0.018481018,-0.011255162,-0.016991852,0.07020029,-0.015390274,0.016368879,-0.051157143,0.0068886043,-0.05988956,-0.02417596,-0.055450294,-0.028688032,0.023810841,-0.0029947439,0.027779493,0.034447618,-0.035122525,-0.011875305,-0.04940007,-0.0038632893,0.028793145,-0.0069978894,-0.00981988,-0.026597094,0.023114339,0.05254321,-0.0028223216,0.033883616,-0.008382217,-0.036948137,0.10014254,0.030145707,-0.0024081524,0.02587841,-0.013957451,-0.036843818,0.01467915,0.020847702,-0.009558294,-0.007742893,-0.041293632,0.016088877,-0.0101288175,-0.018572075,-0.016722055,-0.02714668,-0.0137853185,-0.0053650616,0.015680095,-0.041979905,-0.03712508,-0.037881665,0.0005419571,-0.01436848,0.00097058073,0.011441245,-0.009354126,0.009712904,-0.063052595,-0.02991994,0.0061644106,0.033054113,0.049106337,0.032976482,0.057182297,-0.036104374,-0.00020662927,0.03204306,-0.016183756,0.07605166,-0.032229993,-0.041523118,-0.03459251,-0.034796786,0.013868651,0.0035893521] |
| 59 | `search_vector` | `tsvector` | '2':323B '5':75B 'agil':318B 'agile/scrum':170B 'allow':299 'angular':314B 'annual':270,295 'api':38B,117B,182C 'applic':87B,213C 'architect':174C 'architectur':31B,120B,160B 'asynchron':96B 'authent':123B 'aw':134B 'aws/gcp':231C 'azur':136B 'bachelor':63B 'backend':41B 'base':269 'bengaluru':260C 'best':197C 'bonus':271 'build':56B,84B 'cach':150B 'certif':301 'ci/cd':222C 'close':46B 'cloud':61B,132B,229C,316B 'code':193C 'collabor':233C 'competit':264 'complex':105B 'comprehens':273 'comput':66B 'concurr':219C 'confer':303 'container':223C 'content':249C 'core':19B 'coverag':278 'cross':49B 'cross-funct':48B 'custom':321B 'customskill2':320B 'databas':102B,209C 'deep':98B 'degre':64B 'deliv':242C 'depend':282 'deploy':224C 'design':32B,110B,118B,221C 'develop':82B,172B,175C,298 'distribut':40B 'docker':129B,227C 'driven':159B 'employe':280 'engin':12B,20B,53B,69B,196C,206C 'entri':257C 'environ':307 'es6':94B 'establish':195C 'event':158B 'event-driven':157B 'experi':83B,114B,127B,168B 'experienc':9B 'expertis':99B 'familiar':138B 'featur':245C 'field':74B 'flexibl':284 'framework':141B 'frontend':140B 'function':50B 'gcp':135B 'generous':288 'googl':315B 'grade':180C 'hand':79B,112B 'hands-on':78B,111B 'health':276 'high':17B,217C,255C 'high-perform':16B 'high-throughput':216C 'hour':286 'implement':34B 'index':211C 'india':262C,263 'infrastructur':230C 'insur':277 'javascript':93B 'job':2A 'join':14B 'junior':201C 'jwt':125B 'karnataka':261C 'knowledg':147B 'kubernet':130B 'lead':29B 'learn':296 'level':205C 'like':142B 'look':6B 'maharashtra':259C 'maintain':177C 'manag':236C 'market':248C 'medic':274 'mentor':200C 'messag':151B 'methodolog':173B 'microservic':42B,119B,184C 'mid':204C 'mid-level':203C 'modern':305 'n':137B,146B,161B,190C,207C,220C,232C,272,283,294,304 'next.js':145B 'night':253C 'node.js':91B,186C 'oauth2':126B 'offic':306 'optim':208C 'outbox':154B 'outing':313 'paid':289 'part':250C 'particular':103B 'pattern':155B 'perform':18B,191C,214C,268 'performance-bas':267 'perk':310 'pipelin':225C 'platform':133B,317B 'polici':293 'postgresql':104B,189C 'practic':198C 'problem':164B 'problem-solv':163B 'product':51B,179C,235C,244C 'production-grad':178C 'profession':297 'profici':89B 'program':97B 'protocol':124B 'pto':292 'pune':23B,258C 'qa':237C 'queri':107B,210C 'queue':152B 'react':143B 'redi':149B 'relat':72B,101B 'remot':252C 'resili':60B 'rest':37B,116B,181C 'review':194C 'rigor':192C 'robust':57B 'role':26B 'salari':265 'scalabl':36B,85B,243C 'schedul':247C 'schema':109B 'school':256C 'scienc':67B 'scrum':319B 'secur':58B,122B 'senior':10B 'skill':166B,322B 'softwar':11B,68B,81B,171B 'solut':62B 'solv':165B 'sql':106B 'strong':88B,162B 'team':21B,54B,240C,312 'technic':73B,254C 'throughput':218C 'time':251C,290 'titl':3A 'transact':153B 'typescript':92B,187C 'ui/ux':239C 'use':185C,226C 'web':86B 'well':309 'work':45B,285 'year':76B |
| 60 | `deleted_at` | `timestamptz` | *NULL* |
| 61 | `created_at` | `timestamptz` | `"2026-09-06T04:29:38.260Z"` |
| 62 | `updated_at` | `timestamptz` | `"2026-09-08T06:00:12.597Z"` |
| 63 | `experience_min` | `int4` | 2 |
| 64 | `experience_max` | `int4` | 5 |
| 65 | `max_notice_period_days` | `int4` | 30 |
| 66 | `work_shift` | `varchar` | night |
| 67 | `education_type` | `varchar` | technical |
| 68 | `min_education_level` | `varchar` | high_school |
| 69 | `interview_rounds` | `jsonb` | `[{"name":"round 1","round":1,"description":"aaaa"},{"name":"round 2","round":2,"description":"bbbb"}]` |
| 70 | `custom_skills` | `jsonb` | `["customskill2","custom skill 2"]` |

[⬆️ Back to Top](#table-of-contents)
