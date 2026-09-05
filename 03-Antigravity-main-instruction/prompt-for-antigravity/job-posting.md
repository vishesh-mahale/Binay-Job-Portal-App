Browser se UI testing karne ke liye ye saare **Employer & HR Job Posting** scenarios 100% ready hain:

---

## 🚀 Pre-requisite (Live Architecture Setup)

Hmare saare background services active aur running hain:

1. **NestJS Core API Backend:** `http://localhost:3000`
2. **Next.js Web Frontend:** `http://localhost:3001`
3. **Outbox Dispatcher Service:** `http://localhost:3002`
4. **FastAPI AI Worker:** `http://127.0.0.1:8080`
5. **Local Outbox Auto-Wake Cron:** Running every 10 minutes (`*/10 * * * *`)

Browser me open karein: `http://localhost:3001/dashboard/employer`

---

## 📋 Ready UI Test Scenarios

### 1. Job Draft Create & Edit Flow
- **Step 1:** Employer / HR user se login karein (`/login`) aur `/dashboard/employer` par jayein.
- **Step 2:** **"+ Create New Job Draft"** button par click karein.
- **Step 3:** Job Title, Slug, Description enter karein (optional Branch/Department/Team select karein) aur **"Create Draft"** click karein.
- **Step 4:** Verify karein ki naya job card **DRAFTS** tab me gray `Draft` badge ke saath dikh raha hai.
- **Step 5:** **"Edit Draft"** click karke details update karein aur **"Save Changes"** click karein.

---

### 2. Unverified Company Publish Guard Test
- **Step 1:** Agar company **UNVERIFIED** status me hai, to top par `🟡 Company Unverified` banner dikhega.
- **Step 2:** Draft job par **"Publish Job"** click karein.
- **Step 3:** Verify karein ki server se HTTP 403 error catch hoga aur alert dikhega: *"Publishing restricted until company is verified"*.

---

### 3. HR Direct Publish Test (`job_approval_required = false`)
- **Step 1:** Verified company me default policy **DIRECT PUBLISH** hoti hai (`job_approval_required = false`).
- **Step 2:** Draft job par **"Publish Job"** click karein.
- **Step 3:** Verify karein ki job direct **PUBLISHED** tab me green `Published` badge ke saath chala jaata hai.

---

### 4. Approval Workflow Test (`job_approval_required = true`)
- **Step 1 (Owner/Admin):** Company Owner / Admin user se login karein.
- **Step 2 (Owner/Admin):** Job Approval Settings card me **"Require Approval"** toggle click karein. Policy text change ho jayega: `APPROVAL REQUIRED`.
- **Step 3 (HR):** Regular HR user se login karke Draft job par **"Publish Job"** (ya **"Submit for Approval"**) click karein.
- **Step 4 (HR):** Verify karein ki job **PENDING APPROVAL** status me chala jata hai aur HR ko `⏳ Pending Owner/Admin Approval` badge dikhta hai (Approve/Reject buttons HR ko nahi dikhte).
- **Step 5 (Owner/Admin):** Owner/Admin se login karke **PENDING APPROVAL** tab par jayein:
  - **Approve:** **"Approve & Publish"** click karein $\rightarrow$ Job `Published` ho jaata hai.
  - **Reject:** Rejection reason type karein (e.g. *"Salary missing"*) aur **"Reject"** click karein $\rightarrow$ Job dobara `Draft` status me chala jaata hai.

---

### 5. Job Lifecycle Actions Test (Pause, Resume, Close, Archive)
- **Pause Job:** Published job par **"Pause Job"** click karein $\rightarrow$ Status `Paused` badge me change hota hai.
- **Resume Job:** Paused job par **"Resume Job"** click karein $\rightarrow$ Status dobara `Published` ho jaata hai (unverified company hone par 403 block hota hai).
- **Close Job:** Published ya Paused job par **"Close Job"** click karein $\rightarrow$ Status `Closed` badge (red) me change hota hai.
- **Archive Job:** Closed job par archive reason input karke **"Archive Job"** click karein $\rightarrow$ Terminal status `Archived` me chala jaata hai (read-only).

---

### 6. Company Verification by Platform Admin
- **Step 1:** Admin account (`/dashboard/admin`) se login karein.
- **Step 2:** Unverified company ko **Verify** ya **Reject** (with reason) karein.
- **Step 3:** Employer dashboard par **"Refresh Status"** click karke live status sync verify karein.

---

### 7. Confidential Job Toggle & Employer Masking Test
- **Step 1:** Create/Edit Job Form me **"Confidential Job"** toggle select karein (`is_confidential = true`).
- **Step 2:** Job Publish karein.
- **Step 3:** Verify karein ki public Job view me company name `"Confidential Employer"` mask ho raha hai aur internal company details leak nahi hoti.

---

### 8. End-to-End Outbox & Worker Event Trace
- **Step 1:** UI par koi bhi Job action perform karein (Create, Publish, Approve, Pause).
- **Step 2:** NestJS API single transaction me database `outbox_events` me pending event write karta hai.
- **Step 3:** Outbox Dispatcher (`http://localhost:3002`) event claim karke FastAPI AI Worker (`http://127.0.0.1:8080`) ko payload deliver karta hai.
- **Step 4:** Worker `processed_events` log updates & AI processing complete karta hai.

---

Aap in sabhi scenarios ko browser me test karke feedback de sakte hain!