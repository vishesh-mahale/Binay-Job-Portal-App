# 07 Resume Processing — Detailed Hinglish Explanation

## 1. Is file ka kaam

[07_resume_processing.sql](07_resume_processing.sql) uploaded resume ko asynchronously parse karne ka job,
final AI result, supporting artifacts aur event timeline store karti hai.

```text
uploaded_documents
      ↓
resume_parsing_jobs
      ├→ resume_parsed_data
      ├→ resume_parsing_artifacts
      └→ resume_parsing_job_events
```

Candidate ko ye technical processing screen-by-screen nahi dikhani hai. UI par
sirf simple state dikh sakti hai:

```text
Resume uploaded → Processing → Ready
```

`07` ki tables backend ko batati hain ki processing ke andar kya hua.

## 2. Rahul ka complete flow: account se searchable profile tak

Is example mein same IDs ko poore flow mein follow karenge:

```text
Rahul user id       = user-101
Candidate profile   = candidate-201
Resume document     = document-301
Parsing job         = parsing-job-401
Parsed result       = parsed-result-501
```

### Step 1: Rahul account create karta hai ([03_users_auth.sql](03_users_auth.sql))

Rahul signup form mein deta hai:

```text
First name: Rahul
Last name: Sharma
Email: rahul@gmail.com
Password: ********
```

सबसे पहले Supabase Auth login identity बनाता है। उसके UUID से application की
`users` table में **नई row INSERT** होती है:

| Column | Value |
|---|---|
| `id` | `user-101` (Supabase Auth वाला same UUID) |
| `email` | `rahul@gmail.com` |
| `first_name` | `Rahul` |
| `middle_name` | `NULL` |
| `last_name` | `Sharma` |
| `display_name` | `Rahul Sharma` (DB generated) |
| `phone` | `NULL` या supplied phone |
| `role` | `candidate` |
| `status` | `pending_verification` |
| `created_at` | signup time |

यहाँ password `users` table में store नहीं होगा; authentication password
Supabase Auth manage करेगा।

Email link verify होने पर existing `users` row का column **UPDATE** होगा:

```text
users.status: pending_verification → active
```

### Step 2: Empty candidate profile create होती है ([08_candidates.sql](08_candidates.sql))

Signup complete होते ही **database trigger automatically** `candidate_profiles` में
**नई row INSERT** करती है (`create_candidate_profile_on_user_signup` trigger):

| Column | Value |
|---|---|
| `id` | `candidate-201` (auto UUID) |
| `user_id` | `user-101` |
| `professional_title` | `NULL` |
| `summary` | `NULL` |
| `profile_revision` | `1` |
| `profile_completed_at` | `NULL` |
| `is_open_to_work` | `TRUE` |
| `created_at` | current time |

**यह automatic है — NestJS को कुछ नहीं करना पड़ता!**

- Trigger केवल `role = 'candidate'` users के लिए काम करता है
- Admin/HR signup पर कोई `candidate_profiles` row नहीं बनता
- हर candidate के पास तुरंत एक empty profile ready रहता है

इस समय Rahul का account मौजूद है, professional profile empty/incomplete
है। UI अब `Complete your profile` दिखाएगी।

```text
users.id = user-101 (manual signup)
        ↓ trigger automatically creates
candidate_profiles.user_id = user-101
```

### Step 3: Rahul resume upload शुरू करता है ([06_documents.sql](06_documents.sql))

Rahul `rahul-resume.pdf` select करके इसे active profile resume बनाता है। NestJS:

```text
1. Login token से user-101 verify करता है
2. File type/size validate करता है
3. SHA-256 checksum निकालता है
4. Private storage में file upload करता है
5. uploaded_documents में row INSERT करता है
```

`uploaded_documents` की example row:

| Column | Value |
|---|---|
| `id` | `document-301` |
| `uploaded_by_user_id` | `user-101` |
| `guest_upload_session_id` | `NULL` |
| `document_type` | `resume` |
| `original_file_name` | `rahul-resume.pdf` |
| `file_extension` | `pdf` |
| `file_size_bytes` | `245760` |
| `mime_type` | `application/pdf` |
| `storage_bucket` | private resume bucket |
| `storage_path` | internal object path |
| `checksum_sha256` | 64-character hash |
| `security_scan_status` | `pending` |
| `processing_status` | `uploaded` |

Registered candidate होने के कारण `guest_upload_session_id` हमेशा `NULL` है।

### Step 4: Resume profile से link होती है ([08_candidates.sql](08_candidates.sql))

`candidate_profile_documents` में **नई row INSERT** होगी:

| Column | Value |
|---|---|
| `candidate_id` | `candidate-201` |
| `document_id` | `document-301` |
| `document_role` | `resume` |
| `version_number` | `1` |
| `is_current` | `TRUE` |
| `linked_at` | current time |
| `unlinked_at` | `NULL` |

इस row का अर्थ है: `document-301` Rahul का current/active profile resume है।
Actual PDF इस table में नहीं, private storage में है।

### Step 5: Security scan complete होता है ([06_documents.sql](06_documents.sql))

Security worker file scan करता है। Clean मिलने पर उसी `uploaded_documents` row
के columns **UPDATE** होते हैं:

```text
security_scan_status: pending → clean
security_scan_result: NULL → {"engine":"...","threats":[]}
```

Unsafe file होने पर parsing शुरू नहीं होगी। Clean होने पर resume-processing
event enqueue होगा।

### Step 6: Parsing job create होती है ([07_resume_processing.sql](07_resume_processing.sql))

NestJS या trusted security-scan completion handler, file को `clean` mark करने वाली
उसी transaction में `resume_parsing_jobs` की **नई row INSERT** करता है और
`resume.parse.requested` outbox event भी लिखता है:

| Column | Value |
|---|---|
| `id` | `parsing-job-401` |
| `document_id` | `document-301` |
| `parser_provider` | `internal_fastapi` |
| `parser_model` | configured resume model |
| `status` | `queued` |
| `priority` | `normal` |
| `requested_by_user_id` | `user-101` |
| `idempotency_key` | unique stable request key |
| `attempt_number` | `1` |
| `max_attempts` | `3` |

`resume_parsing_job_events` में `queued` event भी **INSERT** होगा।

### Step 7: Worker job process करता है ([07_resume_processing.sql](07_resume_processing.sql))

Worker job claim करता है और `resume_parsing_jobs` row **UPDATE** करता है:

```text
status: queued → processing
locked_by: NULL → resume-worker-3
locked_at: NULL → 10:01
started_at: NULL → 10:01
```

फिर private FastAPI worker:

```text
Private storage से document-301 पढ़ता है
→ OCR/parser/LLM चलाता है
→ structured response लेता है
→ output validate करता है
```

### Step 8: Parsed result save होता है ([07_resume_processing.sql](07_resume_processing.sql))

मान लेते हैं resume से निकला:

```text
Title: Frontend Developer
Skills: Angular, React, Java
Experience: 3 years
Education: B.Tech
```

`resume_parsed_data` में **नई immutable row INSERT** होगी:

| Column | Value |
|---|---|
| `id` | `parsed-result-501` |
| `parsing_job_id` | `parsing-job-401` |
| `document_id` | `document-301` |
| `extracted_text` | resume का plain text |
| `raw_ai_output` | model का original JSON |
| `normalized_output` | validated skills/experience/education JSON |
| `overall_confidence` | `91.50` |
| `schema_version` | `resume-schema-v1` |

Supporting output `resume_parsing_artifacts` में और timeline events
`resume_parsing_job_events` में INSERT होंगे। अंत में job row **UPDATE** होगी:

```text
status: processing → completed
completed_at: NULL → 10:05
```

Document की processing state भी orchestration service completed/parsed state में
UPDATE करेगी।

### Step 9: First-time profile setup ([08_candidates.sql](08_candidates.sql))

क्योंकि यह Rahul का first profile setup है, UI parsed information दिखाकर उसे
एक बार confirm/correct करने दे सकती है। Rahul save करता है तो transaction में:

```text
candidate_profiles       → title/summary/location UPDATE
candidate_skills         → Angular, React, Java rows INSERT
candidate_experiences    → experience rows INSERT
candidate_educations     → education rows INSERT
profile_change_history   → change records INSERT
candidate_profiles.profile_revision: 1 → 2
candidate_profiles.profile_completed_at: NULL → current time
outbox event             → projection rebuild request INSERT
```

एक Save action में तीन skills insert हुईं, फिर भी `profile_revision` केवल एक बार
बढ़ेगी।

### Step 10: Rahul recruiter search के लिए searchable बनता है (`08`) — **Asynchronous** ⏱️

**Important:** यह step **immediately नहीं** होता — background worker करता है!

#### Timeline:
```
Step 9: Rahul profile save करता है (synchronous)
        ↓
        outbox event insert होती है: "profile_changed"
        ↓
        [Background worker यह event pick करने का wait करता है]
        ↓ (कुछ सेकंड बाद)
Step 10: Projection worker trigger होता है (asynchronous)
```

#### क्या होता है Step 10 में:

Outbox event को देखकर projection worker:

1. **पूरा canonical profile aggregate read करता है** — इसका मतलब केवल latest
   `candidate_profiles` row नहीं है। Worker इन सभी tables से data पढ़ेगा:

   ```text
   candidate_profiles
   + candidate_skills
   + candidate_experiences
   + candidate_educations
   + candidate_projects
   + candidate_certifications
   + candidate_languages
   + candidate_links
   ```

   | Table | Projection के लिए data |
   |---|---|
   | `candidate_profiles` | Title, summary, location और work preferences |
   | `candidate_skills` | Skills, proficiency और experience |
   | `candidate_experiences` | Companies, job titles और work duration |
   | `candidate_educations` | Degree, institution और education level |
   | `candidate_projects` | Projects, descriptions और technologies |
   | `candidate_certifications` | Certificates और issuing organizations |
   | `candidate_languages` | Languages और proficiency |
   | `candidate_links` | Portfolio, LinkedIn और GitHub links |

   `candidate_profiles.profile_revision` इस पूरे aggregate की logical revision
   है। इनमें से किसी child table में एक logical Save से बदलाव होने पर भी revision
   केवल एक बार बढ़ेगी।

2. **Active resume का parsed data fetch करता है** — `resume_parsed_data`
3. **Embedding service को call करता है** — normalized text की embedding बनाने के लिए
4. **`candidate_search_profiles` में insert/update करता है:**

| Column | Example | Meaning |
|---|---|---|
| `candidate_id` | `candidate-201` | Rahul का profile |
| `source_profile_revision` | `2` | Step 9 से आया |
| `projection_revision` | `2` | Rebuild version |
| `professional_title` | `Frontend Developer` | Parsed से |
| `skill_names` | Angular, React, Java | Canonical facts |
| `total_experience_years` | `3.0` | Aggregated |
| `searchable_text` | Full normalized text | Search index के लिए |
| `search_vector` | PostgreSQL tsvector | Keyword search data |
| `embedding` | `vector(768)` | Semantic search (768D) |   
| `generated_at` | current time | Projection time |

#### `searchable_text`, `search_vector` और `embedding` कब और कैसे भरते हैं?

ये तीनों columns Rahul के profile Save request के दौरान नहीं भरते। Step 9 की
transaction commit होने और outbox event मिलने के बाद **Projection Worker** इन्हें
background में तैयार करता है।

##### A. `searchable_text`

Projection Worker canonical aggregate और latest active resume के parsed facts को
normalize करके एक readable text बनाता है:

```text
Frontend Developer
Skills: Angular, React, Java
Experience: 3 years
Education: B.Tech
Location: Delhi
```

यही text `candidate_search_profiles.searchable_text` में save होगा। यह बाकी दो
search representations बनाने का common input भी है।

##### B. `search_vector`

Embedding API इसे नहीं बनाती। PostgreSQL `searchable_text` को Full Text Search
format में convert करता है:

```sql
to_tsvector('english', searchable_text)
```

Conceptual result:

```text
'angular':4 'develop':2 'frontend':1 'java':6 'react':5
```

Projection Worker की INSERT/UPDATE query यह generated value
`candidate_search_profiles.search_vector` में save करवाती है। यह exact keyword
search, जैसे `Java` या `Frontend Developer`, के लिए है।

##### C. `embedding`

Projection Worker normalized `searchable_text` embedding service को भेजता है:

```text
Projection Worker
→ Gemini/OpenAI-compatible embedding API
→ [0.023, -0.117, 0.842, ... कुल 768 numbers]
→ Projection Worker
→ candidate_search_profiles.embedding
```

Embedding API database में direct write नहीं करती। API केवल vector response देती
है; Projection Worker उसे validate करके `embedding` column में save करता है। यह
meaning-based/semantic matching के लिए है। चुना हुआ embedding model database के
`vector(768)` dimension के compatible होना चाहिए।

तीनों का final creation order:

```text
Profile Save transaction COMMIT
→ outbox event
→ Projection Worker canonical + active-resume data पढ़ता है
→ searchable_text बनाता है
→ PostgreSQL search_vector बनाता है
→ Embedding API vector लौटाती है
→ Projection Worker candidate_search_profiles UPSERT करता है
```

एक ही projection rebuild में final row INSERT/UPDATE होगी। अगर embedding API
temporary fail हो तो worker retry करेगा; पुरानी valid projection को अधूरी/stale
नई projection से overwrite नहीं करना चाहिए।

#### अब Rahul recruiter को मिलता है:

- ✅ Keyword search: "Frontend Developer" से खोज
- ✅ Skill filter: "Angular" candidates
- ✅ Semantic search: "Web development" जैसी query
- ✅ Embedding similarity: "Similar candidate profiles"

#### Implementation details:

```text
Step 9 में INSERT: outbox.events table में
{
  "event_type": "candidate.profile.changed",
  "candidate_id": "candidate-201",
  "profile_revision": 2
}

Outbox consumer (background):
  ├─ Event देखता है
  ├─ canonical + active-resume data से searchable_text बनाता है
  ├─ PostgreSQL से search_vector बनवाता है
  ├─ Embedding API से vector लेता है
  └─ candidate_search_profiles upsert करता है

Final state:
  candidate_search_profiles.searchable_text ← Projection Worker
  candidate_search_profiles.search_vector ← PostgreSQL FTS conversion
  candidate_search_profiles.embedding ← Projection Worker saves API response
  candidate_search_profiles.source_profile_revision = 2
```

**इसीलिए recruiter को Rahul मिलता है!** 👍

### Complete table journey

```text
Supabase auth.users
        ↓
03 users (user-101)
        ↓
08 candidate_profiles (candidate-201, incomplete)
        ↓
06 uploaded_documents (document-301, scan pending)
        ↓
08 candidate_profile_documents (active resume link)
        ↓
06 uploaded_documents (scan clean)
        ↓
07 resume_parsing_jobs (parsing-job-401)
        ↓
07 artifacts + events + resume_parsed_data (parsed-result-501)
        ↓
08 canonical facts + profile revision 2
        ↓
08 candidate_search_profiles
        ↓
Rahul recruiter search mein available
```

## 3. `resume_parsing_jobs`

One row = one parse attempt/job. Same document future mein new parser se reparse
ho to new job row banegi.

| Column | Example | Kab/kaun likhega |
|---|---|---|
| `document_id` | `doc-101` | NestJS/worker after clean scan |
| `parser_provider` | `internal_fastapi` | Processing config |
| `parser_model` | `gemini-resume-parser` | Processing config |
| `parser_version` | `2.1.0` | Version tracking |
| `prompt_version` | `resume-prompt-v3` | Prompt audit |
| `extraction_version` | `resume-schema-v1` | Output contract |
| `status` | `queued` | Create time; worker updates |
| `priority` | `normal` | NestJS business priority |
| `requested_by_user_id` | Candidate UUID | Request origin |
| `idempotency_key` | Stable key | Duplicate job prevention |
| `attempt_number` | `1` | Retry worker |
| `max_attempts` | `3` | Retry policy |
| `available_at` | Timestamp | Queue/backoff time |
| `locked_at`, `locked_by` | Worker claim | Queue worker |
| `started_at` | Timestamp | Processing start |
| `completed_at` | Timestamp | Success |
| `failed_at` | Timestamp | Terminal/current failure |
| `error_details` | Structured JSON | Worker; client-safe DTO अलग |

Lifecycle:

```text
queued → processing → completed
                    ├→ partial
                    ├→ failed/retry
                    └→ cancelled
```

## 4. `resume_parsed_data`

One parsing job ka maximum one immutable final result.

| Column | Example | Meaning |
|---|---|---|
| `parsing_job_id` | `parse-201` | Result owner; UNIQUE |
| `document_id` | `doc-101` | Same document as job |
| `extracted_text` | Resume plain text | Extraction result |
| `raw_ai_output` | Original model JSON | Immutable evidence |
| `normalized_output` | Platform contract JSON | Validated normalized data |
| `confidence_details` | Per-field scores | Review hints |
| `validation_result` | Warnings/errors JSON | Schema validation |
| `overall_confidence` | `91.50` | Optional summary |
| `schema_version` | `resume-schema-v1` | Reader compatibility |

Example normalized output:

```json
{
  "fullName": "Rahul Sharma",
  "skills": ["Java", "Spring Boot", "Docker"],
  "experience": [{"company": "ABC", "title": "Backend Developer"}],
  "education": [{"degree": "B.Tech", "field": "Computer Science"}]
}
```

Result update/delete blocked hai. Better parser result ke liye new job/result.

### 4A. तीनों stored fields: क्यों, कब, कहाँ use होते हैं?

`resume_parsed_data` में तीन बड़े TEXT/JSONB fields immutable store होते हैं:

| Field | Example | Purpose | Future use |
|---|---|---|---|
| **`extracted_text`** | Raw OCR text: "Rahul Sharma, 5 years Java..." | Debug/reparse | Re-parse नया model से |
| **`raw_ai_output`** | Original model JSON: `{"skills":["Java"],"years":3}` | Audit trail | Model accuracy tracking |
| **`normalized_output`** | Validated platform format: `{"skills":[{"name":"Java","years":3}]}` | Profile suggestions | Candidate को "Accept/Reject" दिखाना |

#### 1️⃣ `extracted_text` — Re-parsing के लिए

```text
Scenario: Gemini parser से OpenAI parser में shift होना

Today:        extracted_text + raw_ai_output + normalized_output
              ↓ Gemini से parse

Future:       extracted_text को फिर से OpenAI को भेज सकते हो
              ├─ FastAPI call दोबारा न करना पड़े
              ├─ Storage cost optimize कर सकते हो
              └─ OCR accuracy unchanged रहेगी
```

#### 2️⃣ `raw_ai_output` — Audit & Compliance

```text
Scenario 1: Candidate dispute
  "मैंने 5 साल Java दिया था, ये 3 साल कहाँ से आया?"
  → extracted_text मिलेगी: "...5 years of Java..."
  → raw_ai_output मिलेगी: {"years": 3} ← Model error
  → Model को retrain/reprompt करना पड़ेगा

Scenario 2: Model accuracy audit
  सभी parsed-result के raw_ai_output compare कर सकते हो
  → Which model version का accuracy बेहतर है
  → Confidence score के साथ analysis कर सकते हो

Scenario 3: API decision history
  "हमने Gemini v2.0 से parse किया था"
  → raw_ai_output में timestamp + model version store है
  → Future में मिलेगा model को retrain करने के लिए
```

#### 3️⃣ `normalized_output` — Profile suggestions

```text
Scenario: Candidate first-time onboarding

Parsed resume:
  raw_ai_output: {"skills": ["Java", "React"], "years": 3}
         ↓ validation
  normalized_output: {"skills": [{"name": "Java", "years": 3}, ...]}
         ↓ UI को दिखाना
  UI: "Accept / Edit / Reject ये skills?"
         ↓ candidate save करो
  candidate_skills: table में insert

यही `normalized_output` का काम है — validated suggestions देना
```

#### सारांश: क्यों तीनों store करते हैं?

```json
{
  "extracted_text": "Raw OCR → Re-parse के लिए",
  "raw_ai_output": "Model response → Audit/compliance",
  "normalized_output": "Validated data → Profile suggestions"
}
```

अगर सिर्फ `normalized_output` store करते तो:
❌ Re-parsing नहीं कर सकते
❌ Model accuracy track नहीं कर सकते
❌ Dispute resolve नहीं कर सकते

---

## 5. `resume_parsing_artifacts`

Intermediate/supporting output:

```text
extracted_text
ocr_output
page_image
normalized_json
validation_report
```

Small structured artifact `inline_data` JSONB mein ho sakta hai. Large/page file
private storage document se referenced ho sakti hai. At least one payload required.

## 6. `resume_parsing_job_events`

Append-only timeline:

| Time | Event |
|---|---|
| 10:00 | `queued` |
| 10:01 | `started` |
| 10:02 | `extraction_completed` |
| 10:03 | `ai_completed` |
| 10:04 | `validation_completed` |
| 10:05 | `completed` |

Events audit/debug/monitoring ke liye hain; current status job row se मिलता है.

## 7. Complete successful call flow

```text
Security worker marks document clean
→ NestJS/trusted scan-completion transaction creates queued parse job + outbox event
→ Supabase async webhook wakes Outbox Dispatcher
→ Dispatcher claims the outbox event and creates a Google Cloud Task
→ Google Cloud Tasks calls private Cloud Run FastAPI
→ FastAPI atomically claims the parsing job using its DB lease fields
→ FastAPI marks processing + inserts started event
→ FastAPI reads the private file and runs parser/OCR/AI
→ FastAPI validates the extracted/normalized result
→ FastAPI inserts artifacts + final result + events
→ FastAPI marks job completed + records processed_events
→ If needed, FastAPI inserts profile-suggestions-ready outbox event
```

FastAPI browser-facing writer नहीं है। वही हमारा trusted private background worker
है और restricted worker DB role/service credential से केवल worker-owned tables में
लिखती है। Candidate की editable canonical profile को वह बिना approved merge policy
के overwrite नहीं करेगी।

```text
FastAPI DB में क्या लिख सकती है?
├─ resume_parsing_jobs status/lease
├─ resume_parsing_job_events
├─ resume_parsing_artifacts
├─ resume_parsed_data
├─ candidate_search_profiles (projection handler में)
├─ processed_events
└─ जरूरत पड़ने पर अगला outbox_events row
```

## 8. Failure example

```json
{
  "status": "failed",
  "attempt_number": 1,
  "error_details": {
    "code": "FASTAPI_TIMEOUT",
    "retryable": true
  }
}
```

Retry:

```text
available_at = future time
attempt_number = 2
status = queued
```

External AI call ke दौरान long DB transaction open nahi रखनी.

## 9. `07` se `08` connection

```text
07 immutable parsed result
      ├→ first onboarding suggestions/evidence
      ├→ active-resume search projection
      └→ application-resume enrichment
```

`07` ka result final canonical profile नहीं है. Canonical facts candidate की
editable/confirmed state हैं। लेकिन finalized policy के अनुसार latest active
profile resume के parsed facts canonical tables overwrite किए बिना recruiter
search में additional resume-derived evidence बन सकते हैं।

## 10. Kaun kisko call karta hai?

| Caller | Target | Purpose |
|---|---|---|
| Supabase webhook | NestJS Dispatcher | Pending outbox work wake-up |
| NestJS Dispatcher | Google Cloud Tasks | Deterministic managed task create |
| Google Cloud Tasks | Cloud Run FastAPI | Private worker invocation |
| FastAPI | PostgreSQL | Atomically claim/update parsing job |
| FastAPI | Private storage | Authorized resume read |
| FastAPI | PostgreSQL | Result/artifact/event and processed-event persist |
| Outbox/projection worker | `08` flow | Purpose के अनुसार suggestion/search/application enrichment |

## 11. Common confusions

### Resume upload होते ही parsed result मिलता है?

नहीं। Upload `06` में होता है; parsing background में `07` करती है।

### Job row और result row अलग क्यों हैं?

Job बदलती processing state है। Result completed attempt का immutable answer है।

### Same resume दोबारा parse हो सकता है?

हाँ। Same `document_id` के लिए नया job और नया result बनेगा। पुराने result को
update नहीं किया जाएगा।

### Parsing fail हुई तो resume/application delete होगी?

नहीं। Original resume सुरक्षित रहेगा। Retry हो सकती है और application valid
रह सकती है।

### AI output सीधे canonical profile में जाएगा?

नहीं। First onboarding में suggestion/confirmation policy लग सकती है। बाद के
active resume में output search projection enrich कर सकता है, लेकिन canonical
tables silently overwrite नहीं करेगा।

## 12. One-line memory rule

> Job row current processing state hai; parsed result AI ka immutable answer hai;
> artifacts supporting output hain; events complete timeline hain.
