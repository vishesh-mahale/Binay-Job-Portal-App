# Why this job schema is designed this way

This document explains why a job portal schema uses multiple related tables instead of storing everything inside a single `jobs` table.

> Different kinds of data belong in different places: core job details, skills, locations, analytics, and AI metadata all have different lifecycles.

---

## 1. Why not keep everything in one table?

Imagine a company like Microsoft creates a job posting.

```text
Company: Microsoft
Job: Senior Java Backend Developer
Location: Hyderabad
Experience: 5-8 years
Salary: 20-30 LPA
Skills: Java, Spring Boot, Kafka, Docker, AWS
Description: Very long description
Benefits: Insurance, WFH, Bonus
```

Technically, all of this could go into one table.

Practically, it should not.

Why?

- Some fields are simple and static, such as title or salary.
- Some fields are repeated, such as multiple locations or multiple skill links.
- Some fields grow very fast, such as page views.
- Some fields need special search or AI processing, such as `search_vector`, `embedding`, and `ai_ideal_candidate_profile`.

That is why the design is split into multiple tables.

---

## 2. Table 1: job_categories

This table stores the broad job classification hierarchy.

```text
Engineering
├── Backend
├── Frontend
├── Full Stack
└── QA
```

Example data:

| id | name        | parent |
| -- | ----------- | ------ |
| 1  | Engineering | NULL   |
| 2  | Backend     | 1      |
| 3  | Frontend    | 1      |

Important design rules:

- categories should stay broad and reusable
- specific technologies and skills should be stored in `skills` and linked through `job_skills`
- avoid category nodes like Java, Python, React, AWS

Why this helps:

- fast filtering
- clean analytics
- stable historical data when categories change

Example query:

```sql
SELECT *
FROM jobs
WHERE category_id IN (
  SELECT id FROM job_categories WHERE parent_id = 2
);
```

---

## 3. Table 2: jobs

This is the main job posting record.

Important fields include:

| Column | Why it exists |
| ------ | ------------- |
| company_id | Company owning the job |
| category_id | Category reference for filtering |
| title | Job title |
| slug | URL-friendly identifier (lowercased) |
| salary_min / salary_max | Salary range |
| description | Full job description |
| status | Workflow status: draft/published/closed |
| published_at | When the job was published |
| views_count | Cached view count from daily aggregates |
| embedding_status | AI embedding state |
| embedding | Vector used for semantic matching |

Example row:

| Column     | Value                 |
| ---------- | --------------------- |
| title      | Senior Java Developer |
| company_id | Microsoft             |
| salary_min | 20.00                 |
| salary_max | 30.00                 |
| status     | published             |

Why this table is separate:

- it stores the core job data used by listings and dashboards
- it keeps workflow fields like approvals, publish dates, and closure data together
- it stores denormalized search fields such as `category`, `location_city`, and `location_country`

---

## 4. Table 3: skills

This is the canonical skills catalog.

Example:

| id | name        | slug      | aliases | is_active |
| -- | ----------- | --------- | ------- | --------- |
| 1  | Java        | java      | ["Core Java", "Java SE"] | true |
| 2  | Spring Boot | spring-boot | ["Spring"] | true |
| 3  | React       | react     | ["ReactJS"] | true |

Why this is better:

- prevents duplicate entries such as `Java`, `JAVA`, `java`
- supports autocomplete and consistent skill selection
- stores aliases for matching resumes and search
- keeps skill metadata reusable across jobs

Schema rules:

- slug is enforced lowercase
- aliases are validated as a JSON array
- skill names are unique ignoring case through the expression index `idx_skills_name_ci`
- the expression index is used because PostgreSQL does not allow `UNIQUE (lower(name))` as a table constraint

---

## 5. Table 4: skill_requests

If HR needs a new skill that is not already in `skills`, they create a request.

Example request:

| requested_name | status  | requested_by |
| -------------- | ------- | ------------ |
| LangGraph      | pending | HR User 1    |

Workflow:

1. HR searches the skill catalog.
2. If not found, they request a new skill.
3. Admin reviews the request.
4. Approved skills move into `skills`.

This keeps the skill catalog clean and controlled.

---

## 6. Table 5: job_skills

This table links jobs to canonical skills.

Example:

| job_id | skill_id | is_required | importance_score |
| ------ | -------- | ----------- | ---------------- |
| 1      | 1        | true        | 10               |
| 1      | 2        | true        | 8                |
| 1      | 3        | false       | 6                |

Why this table exists:

- skills are repeated data and should not be duplicated inside `jobs`
- it enables structured matching and filtering by skill
- it supports AI scoring with `importance_score`

Key rules:

- `importance_score` must be between 1 and 10
- `min_years` must be non-negative
- each job can only link to the same skill once

---

## 7. Table 6: job_locations

A job can have multiple location records.

Example:

```text
Amazon is hiring in:
- Hyderabad
- Bangalore
- Pune
```

Example rows:

| job_id | city      | country |
| ------ | --------- | ------- |
| 10     | Hyderabad | India   |
| 10     | Pune      | India   |
| 10     | Bangalore | India   |

Why separate locations:

- jobs can be hybrid, remote, or multi-office
- each location can be tracked independently
- one primary location is enforced by a unique index

Location integrity rule:

- if a location row has a city, it must also have a country
- otherwise the row must be fully empty

---

## 8. Table 7: job_views

Every time someone opens a job page, a view row is recorded.

Example:

| job_id | user_id | viewed_at |
| ------ | ------- | --------- |
| 10     | NULL    | 2026-07-30T10:00:00Z |
| 10     | 9001    | 2026-07-30T10:01:30Z |

This table can become very large, so raw views are used only for analytics and event history.

---

## 9. Table 8: job_view_aggregates_daily

Daily view counts are aggregated from `job_views`.

Example:

| job_id | view_date | views_count |
| ------ | --------- | ----------- |
| 10     | 2026-07-30 | 25000 |

Why use daily aggregates:

- dashboards can read one row per job per day
- the `jobs.views_count` denormalized counter can be refreshed from aggregates
- raw view traffic does not stress the main `jobs` table

Refresh function:

- `jobs_refresh_views_count_from_aggregates()` sums daily counts
- it updates `jobs.views_count` only when the value changes

---

## 10. Search layer: search_vector

`jobs.search_vector` is PostgreSQL full-text search.

Example input fields:

- title (Weight A)
- description, requirements, preferred_qualifications, job skill names, custom_skills (Weight B)
- responsibilities, category, employment_type, work_mode, work_shift, education_type, min_education_level, experience_level, location_city, location_state, secondary locations (Weight C)
- location_country, benefits (Weight D)

> **Note on Numeric Experience:** Numeric experience fields (`experience_min`, `experience_max`) are structured B-Tree filtering parameters (`WHERE experience_min <= X AND experience_max >= Y`) and AI matching context in `ai_ideal_candidate_profile`. They are NOT indexed as FTS tokens in `search_vector`.

Example search:

```sql
SELECT *
FROM jobs
WHERE search_vector @@ plainto_tsquery('english', 'Java Backend');
```

Why this helps:

- keyword search becomes fast
- search ranks by weighted fields
- the trigger keeps the vector updated automatically

Trigger behavior:

- job inserts/updates rebuild `search_vector`
- changes in `job_skills` rebuild the job's `search_vector`
- skill name updates rebuild related job vectors

Detailed implementation: [Make Job Searchable](05_jobs_AI_Make_Job_searchable_step3.md)

---

## 11. AI layer: embedding vector(768)

Jobs store a 768-dimensional embedding for semantic search.

Example:

```text
[0.25, -0.14, 0.72, ..., 768 values]
```

Why embeddings matter:

- they capture meaning, not just exact words
- they support AI candidate matching
- they let the system compare resumes and job descriptions by similarity

This schema also stores embedding metadata:

- `embedding_model`
- `embedding_version`
- `embedding_generated_at`

Detailed architecture: [AI Job Embedding Architecture](05_jobs_AI_Job_Embedding_Architecture_v1_step2.md)

---

## 12. embedding_status

The embedding generation workflow is tracked with `embedding_status`.

Example:

| embedding_status | meaning |
| --------------- | ------- |
| pending | not generated yet or semantic input changed |
| processing | worker is generating the vector |
| completed | vector and required metadata are available for semantic search |
| failed | generation failed and can be retried through the background workflow |

When `embedding_status` is `completed`, the job is eligible for vector search.

Consistency check:

- all embedding metadata fields are present together, or none are present
- `completed` cannot be stored without an embedding
- job, candidate and query vectors must use a compatible model/version

---

## 13. AI profile JSON

The job can store an AI-generated ideal candidate profile.

Example:

```json
{
  "schema_version": 1,
  "extracted": {
    "must_have_skills": ["Java", "Spring Boot", "Kafka"],
    "nice_to_have_skills": ["AWS", "Docker"],
    "minimum_experience_years": 5,
    "preferred_education": ["B.Tech"],
    "certifications": [],
    "languages": ["English"]
  },
  "inferred": {
    "role_family": "Backend Engineering",
    "seniority": "senior",
    "technical_domains": ["distributed systems"],
    "industry_domains": [],
    "soft_skills": ["communication"],
    "primary_responsibilities": ["design backend services"],
    "likely_career_level": "senior individual contributor",
    "keywords": ["event-driven architecture"],
    "confidence_score": 0.91
  },
  "metadata": {
    "model": "configured-model",
    "model_version": "configured-version",
    "prompt_version": "job-profile-v1",
    "generated_at": "2026-08-15T10:00:00Z",
    "processing_time_ms": 850
  }
}
```

This is stored in `ai_ideal_candidate_profile` as JSON.

The JSONB contract is documented in [AI Job Profile JSONB Contract](05_jobs_AI_Job_Profile_JSONB_Contract_v1_step1.md).

Why this is useful:

- it captures hiring intent as structured data
- it can be reused for smarter matching
- the field is validated as JSON object in the schema

---

## 14. HNSW index

The schema includes an HNSW index for semantic embedding search.

Example:

```sql
CREATE INDEX idx_jobs_embedding ON jobs
USING hnsw (embedding vector_cosine_ops)
WHERE embedding_status = 'completed';
```

Why this is useful:

- HNSW is optimized for fast approximate nearest neighbor search
- it makes semantic candidate matching scalable
- it avoids linear scans over large embedding data

---

## 15. End-to-end flow

```text
Company creates job
↓
Job row inserted into jobs
↓
Job skills linked through job_skills
↓
Job locations stored in job_locations
↓
search_vector built automatically
↓
NestJS commits job AI outbox event
↓
Webhook → Dispatcher → Google Cloud Tasks → Cloud Run FastAPI
↓
Validated AI profile and compatible embedding stored
↓
Raw views recorded in job_views
↓
Daily aggregates updated in job_view_aggregates_daily
↓
jobs.views_count refreshed from aggregates
↓
Semantic search becomes available
```

---

## 16. Why both search_vector and embedding are needed

These solve different problems.

| Feature | search_vector | embedding |
| ------- | ------------- | --------- |
| Technology | PostgreSQL full-text search | pgvector / semantic search |
| Searches by | exact words and stems | meaning and context |
| Good for | keyword search, title/description filters | resume matching, recommendation |
| Example | "Java Backend" | "Backend engineer with cloud experience" |

Use both together for the best candidate experience.

---

## 17. Why this architecture is useful

This design separates:

- core job data in `jobs`
- skill taxonomy in `skills` and `job_skills`
- location variants in `job_locations`
- analytics events in `job_views`
- daily reporting in `job_view_aggregates_daily`
- text search in `search_vector`
- semantic search in `embedding`

That makes the platform easier to scale and maintain.

---

## 18. Final recommendation for this project

The schema should keep categories broad and use skills for technology-specific matching.

Example:

- `Category: Engineering > Backend`
- `Skills: Java, Spring Boot, Kafka, Docker, AWS`

This avoids mixing category hierarchy with edge-case skill names.

---

## 19. Short answer: why use job_categories?

One line:

> `job_categories` gives every job a standard classification, while skills capture the actual technical requirements.

Example:

```text
Title: Senior Java Backend Developer
Category: Engineering > Backend
Skills: Java, Spring Boot, Kafka, Docker, AWS
```

This is the cleanest way to keep filtering, search, and AI matching reliable.

---

## 20. Product Policy: Direct `jobs.custom_skills` JSONB vs `skill_requests` Master Catalog Workflow

### Design Decision & Rationale

1. **`jobs.custom_skills` (Job-Entity Free-Text Tags)**:
   - Used for employer flexibility when adding niche, emerging, or job-specific free-text skill tags (e.g. Bun, Mojo, Qdrant, proprietary tools) without waiting for catalog approval.
   - Prevents **master skill catalog pollution** with one-off, misspelled, or hyper-niche terms.

2. **`skill_requests` & `skills` (Global Master Skill Catalog)**:
   - Used when an HR or employer explicitly requests that a new skill be added permanently to the platform's standardized, normalized master catalog (`skills` table).
   - Once approved by Admin, the skill becomes available to all employers in the catalog UI and is used for site-wide taxonomy and candidate profile indexing.

3. **Bypass Intentionality**:
   - Storing custom skills directly inside `jobs.custom_skills` JSONB is an **intentional product design decision** to ensure instant posting velocity for employers while keeping the master `skills` taxonomy clean and curated.
