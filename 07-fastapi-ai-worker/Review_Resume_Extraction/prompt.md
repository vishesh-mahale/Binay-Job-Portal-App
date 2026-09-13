Haan. Is prompt ko aise modify karna chahiye ki agent **sirf `task_handlers.py` review na kare**, balki poore `07-fastapi-ai-worker` flow + candidate/resume related SQL schema ko trace karke **DB ke canonical columns ko LLM extraction output se map** kare.

Aap AntiGravity/Kilo/Codex ko ye **exact prompt** de sakte ho:

```text
# Resume Data Extraction & LLM Output — Full Application + Database Alignment Review

Repository:
C:\Users\ADMIN\Desktop\Vishesh\Binay-Job-Portal-App

## Objective

Hum Job Portal ke resume-processing pipeline ko production-grade bana rahe hain.

Current focus:

1. Resume se maximum useful structured data accurately extract karna.
2. LLM output ko robust, deterministic, schema-safe aur production-ready banana.
3. Resume me available information ko database ke canonical candidate/profile-related columns ke saath properly map karna.
4. Koi bhi important resume information sirf isliye lose nahi honi chahiye kyunki current LLM schema me uska field nahi hai.
5. LLM output aisa hona chahiye ki later NestJS backend transactionally canonical candidate tables me data save kar sake.
6. Existing database design ko blindly change mat karo. Pehle complete flow aur SQL schema samjho, phir gaps identify karo.

---

# IMPORTANT — READ-ONLY AUDIT FIRST

Implementation/change start karne se pehle poore repository ko inspect karo.

Especially:

## 1. FastAPI AI Worker

Completely inspect:

07-fastapi-ai-worker/

including:

- app/
- api/
- services/
- schemas/
- models/
- extractors/
- parsers/
- prompts/
- workers/
- task handlers
- utilities
- configuration
- tests
- requirements/dependencies
- any resume/document processing related files

Most importantly review:

C:\Users\ADMIN\Desktop\Vishesh\Binay-Job-Portal-App\07-fastapi-ai-worker\app\api\v1\task_handlers.py

But DO NOT review this file in isolation.

Trace every function/class/import called by the resume-processing flow.

Build the actual runtime flow:

Resume upload
→ uploaded_documents
→ security scan
→ resume parsing job
→ document extraction
→ text extraction
→ LLM call
→ LLM structured output
→ validation/normalization
→ resume_parsed_data
→ downstream NestJS/candidate profile flow

Identify exactly where each step happens in the current code.

---

# 2. Read ALL relevant SQL files

Read ALL .sql files in the repository.

Do not assume that only candidate SQL files matter.

Especially inspect:

02-database/
02-database/migrations/
02-database/migrations/baseline/

and all migration SQL files related to:

- users
- companies
- jobs
- documents
- resume processing
- candidates
- candidate profiles
- candidate skills
- experience
- education
- certifications
- languages
- projects
- achievements
- social/profile links
- preferences
- locations
- any other candidate/resume-related tables

Do not just search table names.

Read the actual:

- CREATE TABLE
- columns
- data types
- NOT NULL
- DEFAULT
- CHECK constraints
- ENUMs
- foreign keys
- unique constraints
- indexes
- triggers
- functions
- JSONB structures
- vector/embedding columns
- provenance/source columns
- verification columns
- timestamps

Also inspect relationships between candidate-related tables.

---

# 3. Understand the CANONICAL database model

Before modifying extraction, create a complete mapping of:

RESUME INFORMATION
        ↓
LLM OUTPUT
        ↓
resume_parsed_data
        ↓
CANONICAL CANDIDATE TABLE/COLUMNS

The canonical database schema is the source of truth for what information the application ultimately needs.

Do NOT invent random LLM fields without checking whether they have a downstream purpose.

At the same time, do NOT ignore useful resume information simply because the current DB mapping is incomplete.

---

# 4. Create a Resume → DB Column Mapping

Create a detailed mapping table internally/review document like:

| Resume Information | LLM Output Field | Parsed Data Field | Canonical DB Table | DB Column | Data Type | Required? | Transformation |
|---|---|---|---|---|---|---|---|
| Full name | personal_info.full_name | ... | candidate_profiles | ... | text | ... | normalize |
| Email | personal_info.email | ... | candidate_profiles | ... | text | ... | lowercase |
| Phone | personal_info.phone | ... | candidate_profiles | ... | text | ... | normalize |
| Location | location.current | ... | ... | ... | ... | ... | ... |
| Skills | skills[] | ... | candidate_skills | ... | ... | ... | ... |
| Work experience | experience[] | ... | candidate_experiences | ... | ... | ... | ... |
| Education | education[] | ... | candidate_education | ... | ... | ... | ... |
| Certification | certifications[] | ... | ... | ... | ... | ... | ... |
| Project | projects[] | ... | ... | ... | ... | ... | ... |
| Language | languages[] | ... | ... | ... | ... | ... | ... |

The exact table/column names MUST come from the actual SQL files.

Do not guess column names.

---

# 5. Identify missing mappings

For every candidate/resume-related DB column, determine:

A. Can this value realistically be extracted from a resume?

B. Is the current LLM schema capable of returning it?

C. Is it currently extracted?

D. Is it currently validated?

E. Is it currently persisted?

Classify each field:

- ✅ Fully covered
- ⚠️ Partially covered
- ❌ Missing from LLM output
- ❌ Missing from extraction
- ❌ Extracted but not persisted
- ❌ DB column exists but has no clear source
- ℹ️ Not normally obtainable from resume

Do NOT force resume extraction for fields that logically cannot come from a resume.

---

# 6. Review the CURRENT LLM schema

Inspect the exact schema currently sent to/expected from the LLM.

Review:

- Pydantic models
- JSON schema
- prompt
- system prompt
- extraction instructions
- examples
- field descriptions
- nullable fields
- arrays
- nested objects
- enums
- confidence fields
- source/evidence fields
- validation
- normalization
- fallback handling

Determine whether the current schema is capable of representing all important resume data required by the DB.

---

# 7. Make LLM extraction ROBUST

The LLM should NOT hallucinate missing resume information.

Rules:

### If information exists in resume:
Extract it.

### If information does not exist:
Return null / empty array according to schema semantics.

### Never:
- invent dates
- invent company names
- invent education
- infer certifications that are not present
- infer exact years of experience without evidence
- fabricate skill proficiency
- fabricate salary
- fabricate notice period
- fabricate location
- fabricate links

For every extracted field, prefer evidence from the actual resume text.

Where useful, support:

- `source_text`
- `evidence`
- `confidence`

But only add these where they are useful for downstream validation/provenance and consistent with the architecture.

---

# 8. Preserve information instead of over-normalizing

Resume formats vary heavily.

Examples:

"Java Developer"
"Senior Java Engineer"
"Software Engineer - Java/Spring Boot"

should not accidentally become one incorrect title.

Similarly:

"5+ years"
"2019 - Present"
"Jan 2020 – Dec 2023"

must be handled safely.

Support common resume variations:

- different date formats
- current/present jobs
- missing end dates
- overlapping employment
- internships
- freelance work
- contract work
- multiple phone numbers
- multiple emails
- multiple locations
- skill aliases
- abbreviations
- bullet-based resumes
- tables
- multi-column extracted text
- PDF formatting issues
- DOC/DOCX formatting issues

---

# 9. Skills extraction must be especially robust

Review the existing DB design for:

- canonical skills
- custom skills
- proficiency
- years of experience
- source
- verification

The LLM should distinguish between:

- explicitly mentioned skills
- skills inferred from job descriptions/projects
- skills with explicit proficiency
- skills with explicit years
- tools/technologies/frameworks/languages/databases/cloud platforms

Do NOT invent proficiency or years.

If the DB supports `skill_id` OR `custom_skill_name`, ensure the AI worker does not incorrectly assume it knows the canonical skill ID unless that lookup is explicitly part of the architecture.

AI worker should return normalized skill names where appropriate, while canonical skill matching can happen downstream if that is the intended architecture.

---

# 10. Experience extraction

For each experience, inspect DB requirements and ensure the LLM can capture, where present:

- company
- job title
- employment type
- start date
- end date
- current/employed flag
- location
- description
- responsibilities
- achievements
- technologies/skills
- projects
- relevant metadata supported by DB

Do not convert uncertain dates into fake exact dates.

For example:

"2019 - 2022"

should not become:

"2019-01-01 - 2022-12-31"

unless the architecture explicitly permits such normalization.

---

# 11. Education extraction

Capture, where present:

- institution
- degree
- field of study
- specialization
- start date
- end date
- graduation year
- grade/GPA/percentage
- location
- relevant details

Again, follow the actual SQL schema.

---

# 12. Other resume sections

Check the DB and current architecture for support for:

- certifications
- licenses
- projects
- achievements
- awards
- publications
- languages
- portfolios
- LinkedIn
- GitHub
- other URLs
- professional summary
- career objective
- interests
- volunteering
- internships
- courses/training
- professional memberships
- references

Only add fields where they have a meaningful place in the existing architecture or are clearly needed for the product.

---

# 13. Resume text extraction quality

Review the extractor before blaming the LLM.

Check:

- PDF extraction
- DOC/DOCX extraction
- scanned PDF handling
- OCR if applicable
- encoding
- Unicode
- reading order
- columns
- tables
- headers/footers
- page boundaries
- malformed text
- empty extraction
- very large resumes

Determine whether the LLM is receiving clean enough text.

If extraction quality is causing downstream LLM errors, identify it separately.

---

# 14. LLM prompt engineering

Review the current prompt and improve it for:

- strict JSON output
- schema adherence
- no hallucination
- null handling
- date handling
- duplicate handling
- skill normalization
- preserving original information
- evidence-based extraction
- consistent arrays
- consistent field naming
- multilingual resumes where reasonably supported
- noisy PDF extraction
- ambiguous information
- partial resumes

Do not over-constrain the prompt in a way that causes information loss.

---

# 15. Validation strategy

Review the Pydantic/schema validation.

The system should handle:

- malformed LLM JSON
- missing optional fields
- wrong data types
- invalid enum values
- unexpected fields
- null vs empty arrays
- invalid dates
- duplicate entries
- excessively long strings
- huge arrays
- model refusal/empty output
- transient LLM failures

Do not silently discard useful data during validation.

If normalization is required, make it deterministic and explainable.

---

# 16. Do NOT break the architecture

Current architecture:

Next.js
   ↓
NestJS
   ↓
Supabase
   ↓
uploaded_documents / resume processing
   ↓
FastAPI AI worker

The FastAPI AI worker should NOT directly own canonical candidate business data unless the existing architecture explicitly says so.

Respect the existing separation:

- AI worker = extraction/parsing/AI processing
- NestJS = business logic + canonical persistence
- Supabase = database/storage/auth as already designed

Do not introduce direct frontend → Supabase access.

Do not bypass NestJS.

Do not create duplicate canonical candidate tables.

---

# 17. Important: resume_parsed_data vs canonical profile

Clearly determine what belongs in:

`resume_parsed_data`

versus what ultimately belongs in:

`candidate_profiles`
`candidate_skills`
`candidate_experiences`
`candidate_education`
etc.

The parsed result should preserve enough structured information for NestJS to create/update canonical records after candidate review/confirmation.

Do not make the AI worker directly overwrite candidate canonical data unless current architecture explicitly requires that.

---

# 18. Check candidate review/edit flow

The product requirement is:

Resume upload
→ AI parses resume
→ Candidate sees extracted information
→ Candidate can review/edit
→ Candidate confirms
→ Canonical candidate profile is saved

Verify that the LLM output supports this UX.

A candidate should be able to see and edit extracted:

- personal details
- skills
- experience
- education
- certifications
- projects
- etc.

where supported by DB.

---

# 19. Backward compatibility

Before changing any schema/model:

Find all consumers of the current LLM output.

Search the entire repository for:

- current schema class names
- field names
- `resume_parsed_data`
- parsing result fields
- task result fields
- API response fields
- frontend consumers if any
- tests
- fixtures
- mocks

Do not rename/remove fields without checking all consumers.

If changing the output schema is necessary, provide a migration/compatibility strategy.

---

# 20. Production-grade requirements

The final implementation should be:

- deterministic where possible
- strongly typed
- validated
- observable
- retry-safe
- idempotent where applicable
- resistant to malformed LLM output
- resistant to hallucination
- safe for partial resumes
- safe for large resumes
- backward compatible where practical

Do not optimize only for one sample resume.

---

# REQUIRED OUTPUT FROM YOUR REVIEW

Before making code changes, provide:

## A. Current End-to-End Flow

Show the actual current flow from:

Upload
→ scan
→ extraction
→ LLM
→ parsed output
→ DB
→ candidate profile

using actual filenames/functions/classes.

## B. File Dependency Map

List the important files involved in resume processing and explain each file's responsibility.

## C. Database Mapping

Provide a complete:

Resume Field
→ LLM Field
→ Parsed Field
→ DB Table
→ DB Column

mapping based on the actual SQL schema.

## D. Gap Analysis

Clearly list:

- missing LLM fields
- missing DB mappings
- incorrect mappings
- fields extracted but not persisted
- DB fields that cannot/should not come from resume
- validation problems
- normalization problems
- hallucination risks
- extraction problems
- architectural problems

## E. Recommended LLM Output Schema

Show the proposed final structured output schema.

It must be based on the ACTUAL database design, not a generic resume parser schema.

## F. Prompt Changes

Show the exact recommended prompt/system instructions for the LLM.

## G. Code Changes

Only after the above analysis, propose the exact files that need modification.

For every proposed change explain:

- current behavior
- problem
- proposed change
- why
- downstream impact

## H. SQL Changes

If SQL changes are genuinely required:

- identify exact SQL file
- exact table
- exact column
- reason
- migration impact

Do NOT modify SQL merely to make the AI output easier.

The existing DB architecture is the source of truth unless there is a demonstrable schema gap.

## I. Test Plan

Create test cases for at least:

1. Simple one-page resume
2. Multi-page resume
3. Senior developer resume
4. Resume with missing email
5. Resume with missing phone
6. Resume with no experience
7. Fresher resume
8. Multiple jobs
9. Current job
10. Multiple skills
11. Skill with proficiency
12. Skill without proficiency
13. Skill with years
14. Education with GPA
15. Education without dates
16. Certifications
17. Projects
18. Multiple languages
19. LinkedIn/GitHub URLs
20. Badly formatted PDF
21. Multi-column PDF
22. Resume containing tables
23. Resume with ambiguous dates
24. Resume with duplicate skills
25. Resume with no extractable text
26. LLM malformed JSON
27. LLM missing optional fields
28. LLM hallucination attempt
29. Very large resume
30. Resume with Unicode/non-English text

---

# IMPORTANT IMPLEMENTATION RULE

Do NOT immediately start editing files.

First perform the complete read-only audit and give me the findings.

After the audit, clearly state:

"READY FOR IMPLEMENTATION"

Only then should code changes be made.

If you find conflicting assumptions between:

- SQL schema
- FastAPI models
- LLM schema
- resume_parsed_data
- NestJS flow

call them out explicitly instead of silently choosing one.

The goal is NOT simply to "extract more fields".

The goal is:

        Resume
           ↓
    High-quality text extraction
           ↓
       Robust LLM
           ↓
   Strongly typed structured output
           ↓
     resume_parsed_data
           ↓
 Candidate review/edit/confirmation
           ↓
 Canonical candidate tables
           ↓
 Search / matching / AI / recruiter workflows

with minimum information loss, minimum hallucination and complete alignment with the actual production database schema.
```

### एक important बदलाव

मैंने prompt में खास तौर पर यह डाल दिया है कि agent **पहले पूरा audit करे और तुरंत code edit न करे**। आपके case में यह बहुत जरूरी है, क्योंकि अभी `task_handlers.py` को अकेले देखकर LLM schema बदलना risky होगा।

सबसे important output होना चाहिए:

**`Resume Field → LLM Field → resume_parsed_data → Actual SQL Table → Actual SQL Column`**

इससे पता चलेगा कि उदाहरण के लिए resume में कोई `skill`, `experience`, `education`, `certification`, `project` आदि आ रहा है, लेकिन उसका **canonical DB destination missing है या नहीं**।

और एक और महत्वपूर्ण बात: agent को **सिर्फ SQL में मौजूद columns भरने के लिए LLM को hallucinate नहीं करवाना है**। DB column मौजूद होने का मतलब यह नहीं कि उसका value resume से मिल ही जाएगा।

अगर आप चाहें तो **`task_handlers.py` और पूरा relevant repo/SQL files यहाँ upload कर सकते हैं**, तब मैं भी इसी mapping को actual files के against verify कर सकता हूँ।

hmara aim hai ki hmare paas ui me for candidate profile k liyejo imput fields hai na hum use autofill krke de
taki candidate ko jyda type na krna pde and form save ho jaye 
abhi current ui me jo fields hai wo thodi he hai and usme or bhi fields add krege based on the all the candidate table columns
 

write your response in the 
C:\Users\ADMIN\Desktop\Vishesh\Binay-Job-Portal-App\07-fastapi-ai-worker\Review_Resume_Extraction\<yourname>.md file

