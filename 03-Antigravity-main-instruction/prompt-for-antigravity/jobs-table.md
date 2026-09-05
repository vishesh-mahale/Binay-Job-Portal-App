Searched for files: *.sql
Viewed 02_enums.sql:1-584
Viewed 05_jobs.sql:1-708

Is form (**"Create New Job Draft"**) ka data database ki primary table **`public.jobs`** mein save hota hai.

Niche **`public.jobs`** table ke sabhi **62 Columns** ki poori list hai dummy values ke saath. Jahan bhi ENUM column hai, uske aage comment mein uski saari possible values di gayi hain:

---

### 📋 **`public.jobs` Table Schema & Dummy Data List**

| # | Column Name | Data Type | Sample Dummy Value | Comments & ENUM Possible Values |
|---|---|---|---|---|
| 1 | `id` | `UUID` | `'a1b2c3d4-e5f6-7890-abcd-1234567890ab'` | Primary Key (auto-generated) |
| 2 | `company_id` | `UUID` | `'c0m1p2n3-y4id-5678-90ab-cdef12345678'` | Foreign Key $\rightarrow$ `companies(id)` |
| 3 | `branch_id` | `UUID` | `'b1r2a3n4-c5h6-7890-abcd-1234567890ab'` | Foreign Key $\rightarrow$ `company_branches(id)` (From Form: Branch) |
| 4 | `department_id` | `UUID` | `'d1e2p3t4-m5e6-7890-abcd-1234567890ab'` | Foreign Key $\rightarrow$ `departments(id)` (From Form: Department) |
| 5 | `team_id` | `UUID` | `'t1e2a3m4-i5d6-7890-abcd-1234567890ab'` | Foreign Key $\rightarrow$ `teams(id)` (From Form: Team) |
| 6 | `category_id` | `UUID` | `NULL` | Foreign Key $\rightarrow$ `job_categories(id)` |
| 7 | `created_by` | `UUID` | `'u1s2e3r4-i5d6-7890-abcd-1234567890ab'` | Foreign Key $\rightarrow$ `users(id)` (Creator HR/Owner ID) |
| 8 | `published_by` | `UUID` | `NULL` | Foreign Key $\rightarrow$ `users(id)` (Publisher User ID) |
| 9 | `approved_by` | `UUID` | `NULL` | Foreign Key $\rightarrow$ `users(id)` (Owner/Admin Approver ID) |
| 10 | `approved_at` | `TIMESTAMPTZ` | `NULL` | Approval Timestamp |
| 11 | `hiring_manager_id` | `UUID` | `NULL` | Foreign Key $\rightarrow$ `users(id)` |
| 12 | **`title`** | `VARCHAR(255)` | `'Senior Fullstack Developer'` | **From Form (\*Job Title)** |
| 13 | **`slug`** | `VARCHAR(255)` | `'senior-fullstack-developer'` | **From Form (\*URL Slug)** |
| 14 | `reference_code` | `VARCHAR(100)` | `'JOB-2026-000123'` | Auto-generated Reference Code |
| 15 | `employment_type` | `ENUM` | `'full_time'` | **ENUM (`employment_type`)**: `'full_time'`, `'part_time'`, `'contract'`, `'temporary'`, `'internship'`, `'freelance'`, `'volunteer'` |
| 16 | `work_mode` | `ENUM` | `'onsite'` | **ENUM (`work_mode`)**: `'remote'`, `'onsite'`, `'hybrid'` |
| 17 | `experience_level` | `ENUM` | `'senior'` | **ENUM (`experience_level`)**: `'entry'`, `'junior'`, `'mid'`, `'senior'`, `'lead'`, `'principal'`, `'executive'` |
| 18 | `category` | `VARCHAR(100)` | `'Engineering'` | Denormalized category snapshot |
| 19 | `location_city` | `VARCHAR(100)` | `'Mumbai'` | Branch location city snapshot |
| 20 | `location_state` | `VARCHAR(100)` | `'Maharashtra'` | Branch location state snapshot |
| 21 | `location_country` | `VARCHAR(100)` | `'India'` | Branch location country snapshot |
| 22 | `location_remote` | `BOOLEAN` | `false` | Remote job flag |
| 23 | `salary_min` | `DECIMAL(12,2)` | `1200000.00` | Minimum Salary |
| 24 | `salary_max` | `DECIMAL(12,2)` | `1800000.00` | Maximum Salary |
| 25 | `salary_currency` | `ENUM` | `'INR'` | **ENUM (`salary_currency`)**: `'INR'`, `'USD'`, `'EUR'`, `'GBP'`, `'CAD'`, `'AUD'`, `'SGD'`, `'AED'` |
| 26 | `salary_period` | `ENUM` | `'yearly'` | **ENUM (`salary_period`)**: `'hourly'`, `'daily'`, `'weekly'`, `'monthly'`, `'yearly'` |
| 27 | `salary_visible` | `BOOLEAN` | `true` | Show salary in listing flag |
| 28 | **`description`** | `TEXT` | `'Detailed job description and responsibilities...'` | **From Form (\*Job Description)** |
| 29 | `responsibilities` | `TEXT` | `NULL` | Key responsibilities text |
| 30 | `requirements` | `TEXT` | `NULL` | Requirements & qualifications text |
| 31 | `preferred_qualifications` | `TEXT` | `NULL` | Preferred qualifications text |
| 32 | `benefits` | `TEXT` | `NULL` | Job perks and benefits |
| 33 | `application_form_url` | `TEXT` | `NULL` | Custom application form URL |
| 34 | `screening_questions_enabled` | `BOOLEAN` | `false` | Screening questions enabled flag |
| 35 | `screening_questions` | `JSONB` | `'[]'` | JSONB list of screening questions |
| 36 | `ai_matching_enabled` | `BOOLEAN` | `true` | AI matching toggle |
| 37 | `ai_ideal_candidate_profile` | `JSONB` | `NULL` | AI candidate persona object |
| 38 | `ai_profile_model` | `VARCHAR(100)` | `NULL` | AI model name |
| 39 | `ai_profile_version` | `INTEGER` | `NULL` | AI profile version |
| 40 | `ai_generated_at` | `TIMESTAMPTZ` | `NULL` | AI generation timestamp |
| 41 | `embedding_model` | `VARCHAR(100)` | `NULL` | Vector embedding model name |
| 42 | `embedding_version` | `INTEGER` | `NULL` | Vector embedding version |
| 43 | `embedding_generated_at` | `TIMESTAMPTZ` | `NULL` | Embedding generation timestamp |
| 44 | **`status`** | `ENUM` | `'draft'` | **ENUM (`job_status`)**: `'draft'`, `'pending_approval'`, `'published'`, `'paused'`, `'closed'`, `'expired'`, `'archived'` *(Default for this form: `'draft'`)* |
| 45 | `published_at` | `TIMESTAMPTZ` | `NULL` | Published timestamp |
| 46 | `expires_at` | `TIMESTAMPTZ` | `NULL` | Expiry timestamp |
| 47 | `paused_at` | `TIMESTAMPTZ` | `NULL` | Paused timestamp |
| 48 | `closed_at` | `TIMESTAMPTZ` | `NULL` | Closed timestamp |
| 49 | `closed_reason` | `VARCHAR(500)` | `NULL` | Closed reason note |
| 50 | `vacancies` | `INTEGER` | `1` | Vacancies count |
| 51 | `applications_count` | `INTEGER` | `0` | Total applications count |
| 52 | `last_application_at` | `TIMESTAMPTZ` | `NULL` | Last application timestamp |
| 53 | `views_count` | `INTEGER` | `0` | Total views count |
| 54 | `is_featured` | `BOOLEAN` | `false` | Featured job flag |
| 55 | `is_urgent` | `BOOLEAN` | `false` | Urgent job flag |
| 56 | `is_confidential` | `BOOLEAN` | `false` | Confidential job flag (Mask employer) |
| 57 | `embedding_status` | `ENUM` | `'pending'` | **ENUM (`embedding_status`)**: `'pending'`, `'processing'`, `'completed'`, `'failed'` |
| 58 | `embedding` | `vector(768)` | `NULL` | 768-dim pgvector vector |
| 59 | `search_vector` | `TSVECTOR` | `'senior':1 'fullstack':2 'developer':3` | PostgreSQL Full-Text Search Vector (Auto-generated by trigger) |
| 60 | `deleted_at` | `TIMESTAMPTZ` | `NULL` | Soft-delete timestamp |
| 61 | `created_at` | `TIMESTAMPTZ` | `'2026-09-04 19:51:00+05:30'` | Created timestamp |
| 62 | `updated_at` | `TIMESTAMPTZ` | `'2026-09-04 19:51:00+05:30'` | Updated timestamp |