Ran command: `node -e "
const { Client } = require('pg');
require('dotenv').config();
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(async () => {
  const company = await client.query('SELECT id, name, verification_status FROM public.companies WHERE id = \'5a6fec62-cd8c-431a-81b3-9b996f7fae41\'');
  console.log('--- COMPANY ---');
  console.table(company.rows);

  const settings = await client.query('SELECT company_id, job_approval_required FROM public.company_settings WHERE company_id = \'5a6fec62-cd8c-431a-81b3-9b996f7fae41\'');
  console.log('--- COMPANY SETTINGS ---');
  console.table(settings.rows);

  await client.end();
}).catch(console.error);
"`
Ran command: `node -e "
const { Client } = require('pg');
require('dotenv').config();
const client = new Client({ connectionString: process.env.DATABASE_URL });
client.connect().then(async () => {
  const triggers = await client.query(\`
    SELECT trigger_name, event_manipulation, action_statement 
    FROM information_schema.triggers 
    WHERE event_object_table = 'jobs'
  \`);
  console.log('--- TRIGGERS ON JOBS TABLE ---');
  console.table(triggers.rows);
  await client.end();
}).catch(console.error);
"`
Ran command: `node -e "const { Client } = require('pg'); require('dotenv').config(); const client = new Client({ connectionString: process.env.DATABASE_URL }); client.connect().then(async () => { const triggers = await client.query('SELECT trigger_name, event_manipulation, action_statement FROM information_schema.triggers WHERE event_object_table = \'jobs\''); console.log('--- TRIGGERS ON JOBS TABLE ---'); console.table(triggers.rows); await client.end(); }).catch(console.error);"`
Searched for files: *.sql
Viewed 05_jobs.sql:150-250

Jab aap **Employer Account** se **"Publish Job"** button par click karenge, toh application me ye exact steps and actions run honge:

---

### 1. Verification & Settings Check (Backend Validation)
NestJS Backend sabse pehle 2 key conditions check karta hai:
1. **Company Verification:** Check karta hai ki `companies.verification_status == 'verified'` hai ya nahi.
   - *Aapki company (`COMPANY ABC 1 123`) currently **Verified** status me hai.*
2. **Approval Policy:** Check karta hai ki company me `job_approval_required` setting enabled hai ya nahi.
   - *Aapki company ki policy currently **Direct Publish (false)** set hai.*

---

### 2. Direct Publish Execution (Database Updates)
Kyunki Company **Verified** hai aur **Direct Publish** enabled hai:
* **Job Status Update:** `public.jobs` table me job ka `status` `'draft'` se badal kar **`'published'`** ho jayega.
* **Timestamps & Publisher:** `published_at` timestamp currently **`NOW()`** ho jayega aur `published_by` me aapki **Employer User ID** save ho jayegi.
* **Audit Logging:** `public.audit_logs` table me `'job.published'` action ki timestamped entry enter ho jayegi.

---

### 3. Master Catalog Requests (If Custom City / Skill used)
* Agar job draft me koi aisa Custom City ya Custom Skill add kiya gaya tha jo master database list me active nahi hai, to backend automatically `city_requests` aur `skill_requests` tables me **Pending Admin Approval** request log kar dega.

---

### 4. Search Indexing (FTS Search Vector & AI Enrichment)
* Live PostgreSQL database trigger `jobs_search_vector_trigger` run hoga aur job title (Weight A), description, requirements, preferred_qualifications, skills, custom_skills (Weight B), responsibilities, category, employment_type, work_mode, work_shift, education_type, min_education_level, experience_level, location_city, location_state, secondary locations (Weight C), location_country, benefits (Weight D) ka `search_vector` TSVECTOR update kar dega.
* **Note on Numeric Experience:** Numeric experience (`experience_min`, `experience_max`) B-Tree structured range filtering aur `ai_ideal_candidate_profile` context ke liye use hota hai, `search_vector` FTS token me nahi.
* Isse ye job candidate portal par live search, filter aur candidate job listings me instantly visible hone lagegi.

---

### 5. UI Feedback & Tab Movement
* Backend se success response milte hi UI me:
  - Green success banner dikhega: **`"Job 'Backend Developer' published successfully!"`**
  - Job card **DRAFT** tab se hatt kar **PUBLISHED** tab me move ho jayega.
  - Job badge green **`Published`** dikhane lagega.

---

> 💡 **Note (Approval Policy Case):** Agar future me Owner/Admin **"Require Approval"** toggle turn ON kar dete hain, to HR / Employer ke Publish click karne par status `'published'` ke bajaye `'pending_approval'` hoga aur message dikhega: `"Job submitted for approval (pending Owner/Admin review)"`.



======================
++++++++++++++++++++++


### Manual Testing Instructions (Phase 09-D Flow) 🧪

Aap niche diye gaye step-by-step instructions ke dwara **Next.js Web UI (`http://localhost:3001`)** ya **Postman / REST API (`http://localhost:3000`)** se end-to-end publish & AI enrichment flow test kar sakte hain.

---

### Step-by-Step Manual Test Flow

#### Step 1: HR Account se Draft Job Create & Save karein
- **Web UI:** Employer dashboard me log in karke `Post a Job` par jayein aur Title, Category, Location, Skills fill karke **"Save as Draft"** par click karein.
- **REST API:**
  `POST http://localhost:3000/api/v1/companies/:companyId/jobs`
- **Expected DB Result:**
  - `jobs.status = 'draft'`
  - `jobs.embedding_status = 'pending'`

---

#### Step 2: HR Account se Publish / Submit for Approval karein
- **Web UI:** HR dashboard se draft job par **"Publish Job"** click karein.
  - Agar company policy me `job_approval_required = true` hai, to status `pending_approval` hoga.
  - Agar `job_approval_required = false` aur company verified hai, to status directly `published` hoga.
- **REST API:**
  `POST http://localhost:3000/api/v1/companies/:companyId/jobs/:jobId/publish`

---

#### Step 3: Owner / Admin Account se Approve karein (agar approval needed ho)
- **Web UI:** Company Owner / Admin account se log in karein, Pending Approval section me jaakar job ko **"Approve"** karein.
- **REST API:**
  `POST http://localhost:3000/api/v1/companies/:companyId/jobs/:jobId/approve`

---

#### Step 4, 5 & 6: Verification Checklist

Jaise hi Job `published` hoti hai:

1. **Job Status Check:** `jobs.status` update hokar `'published'` ho jayega aur `audit_logs` me `'job.published'` ya `'job.approved'` insert hoga.
2. **Outbox Event Check:** `public.outbox_events` me 1 pending event create hoga:
   - `event_type = 'job.ai.enrichment.requested'`
   - `payload` me full G-1 envelope JSON.
3. **Outbox Dispatcher Wake:** Background Dispatcher service outbox row ko claim karke FastAPI AI worker (`/internal/tasks/job/enrich`) ko push kar dega.
4. **AI Enrichment Completion:** FastAPI AI Worker Gemini LLM se ideal candidate profile JSONB aur 768-dim embeddings generate karke update kar dega:
   - `jobs.embedding_status = 'completed'`
   - `jobs.ai_profile_model = 'gemini-2.0-flash'`
   - `jobs.embedding_model = 'text-embedding-004'`

---

> [!NOTE]
> All code changes remain in uncommitted state as instructed. Ready for your manual testing!