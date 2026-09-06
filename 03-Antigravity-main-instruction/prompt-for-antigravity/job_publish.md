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

### 4. Search Indexing (FTS Search Vector)
* Live PostgreSQL database trigger `jobs_search_vector_trigger` run hoga aur job title, description, skills, location, experience etc. ka TSVECTOR update kar dega. 
* Isse ye job candidate portal par live search, filter aur candidate job listings me instantly visible hone lagegi.

---

### 5. UI Feedback & Tab Movement
* Backend se success response milte hi UI me:
  - Green success banner dikhega: **`"Job 'Backend Developer' published successfully!"`**
  - Job card **DRAFT** tab se hatt kar **PUBLISHED** tab me move ho jayega.
  - Job badge green **`Published`** dikhane lagega.

---

> 💡 **Note (Approval Policy Case):** Agar future me Owner/Admin **"Require Approval"** toggle turn ON kar dete hain, to HR / Employer ke Publish click karne par status `'published'` ke bajaye `'pending_approval'` hoga aur message dikhega: `"Job submitted for approval (pending Owner/Admin review)"`.