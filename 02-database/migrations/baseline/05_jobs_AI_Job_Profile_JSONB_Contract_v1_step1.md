# AI Job Profile JSONB Contract v1

## Objective

Generate `jobs.ai_ideal_candidate_profile` after first publish. If semantic
fields such as title, description, requirements, responsibilities or job skills
change, generate a new profile and embedding. Never generate either one during
every search request.

## End-to-End Flow

1.  HR fills the Job form in Next.js.
2.  Next.js sends validated payload to NestJS.
3.  NestJS validates business rules.
4.  NestJS saves:
    -   jobs
    -   job_skills
    -   job_locations
5.  On first publish—or a semantic edit of an already published job—the same
    transaction inserts a pending `outbox_events` row and commits. Saving an
    incomplete draft does not require AI generation.
6.  Supabase asynchronous Database Webhook wakes the NestJS Outbox Dispatcher.
7.  Dispatcher creates a deterministic Google Cloud Task.
8.  Google Cloud Tasks calls the private Cloud Run FastAPI worker.
9.  FastAPI loads:
    -   jobs row
    -   job_skills
    -   category
    -   job_locations
10. FastAPI builds the AI prompt.
11. LLM returns JSON following the contract below.
12. Validate the JSON schema and reject unknown fields.
13. Store JSON plus model/version/generated-at metadata.
14. Build semantic text and generate the compatible job embedding separately.
15. Store embedding plus its model/version/generated-at metadata and record
    `processed_events` idempotency in the final transaction.

------------------------------------------------------------------------

# Final JSON Contract (v1)

``` json
{
  "schema_version": 1,
  "extracted": {
    "must_have_skills": [],
    "nice_to_have_skills": [],
    "minimum_experience_years": null,
    "preferred_education": [],
    "certifications": [],
    "languages": []
  },
  "inferred": {
    "role_family": "",
    "seniority": "",
    "technical_domains": [],
    "industry_domains": [],
    "soft_skills": [],
    "primary_responsibilities": [],
    "likely_career_level": "",
    "keywords": [],
    "confidence_score": 0.0
  },
  "metadata": {
    "model": "",
    "model_version": "",
    "prompt_version": "",
    "generated_at": "",
    "processing_time_ms": 0
  }
}
```

## Meaning

### extracted

Only facts explicitly present in the Job Description.

### inferred

High-confidence AI understanding. Never invent mandatory skills,
certifications or experience.

### metadata

Audit/debug information for regeneration and model tracking.

## LLM Input

-   Job title
-   Description
-   Responsibilities
-   Requirements
-   Benefits
-   Employment type
-   Work mode
-   Experience level
-   Category
-   Skills from job_skills

## Recommended Prompt

``` text
You are an expert technical recruiter.

Your task is to enrich an existing job posting.

The database already stores the original job description.

Do NOT duplicate the original job.

Return ONLY additional AI-enriched information.

Rules:
1. Return valid JSON only.
2. Follow the schema exactly.
3. extracted = explicit facts only.
4. inferred = high-confidence inference only.
5. Never invent mandatory technologies.
6. Never invent certifications.
7. Never invent years of experience.
8. If uncertain use null or [].
9. Do not add extra fields.
```

## Validation

-   Parse JSON
-   Verify top-level keys
-   Validate schema
-   Save JSONB
-   Log model/version

# Future Roadmap

## Phase 2

Create a common AI object library: - Skill - Education - Experience -
Certification - Language - Metadata

## Phase 3

Create Resume AI Profile using the same object definitions.

## Phase 4

Create Common AI Contract shared by: - Job AI Profile - Resume AI
Profile - AI Matching Engine - AI Recommendation Engine

Benefits: - One schema across the platform - Easier model upgrades -
Easier analytics - Cleaner matching - Lower maintenance


## Current implementation ownership

```text
Next.js       -> job form
NestJS        -> validation, authorization, transaction and outbox event
Dispatcher    -> outbox claim and Cloud Task creation
Cloud Tasks   -> managed delivery, rate limit and retry
FastAPI       -> prompt, structured-output validation, AI profile and embedding
Supabase      -> source rows, AI result metadata and processed-event record
```

The JSON contract is versioned. Any incompatible field change requires a new
schema/prompt version and reviewed regeneration strategy; workers must not add
undeclared fields silently.
