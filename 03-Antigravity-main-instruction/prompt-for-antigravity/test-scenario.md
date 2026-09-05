Ran command: `node -e "const { Pool } = require('./04-nestjs-api/04-nestjs-api-app/node_modules/pg'); const fs = require('fs'); const env = fs.readFileSync('./04-nestjs-api/04-nestjs-api-app/.env', 'utf8'); const dbUrl = env.match(/DATABASE_URL=(.*)/)[1].trim(); const pool = new Pool({ connectionString: dbUrl }); pool.query(\`CREATE OR REPLACE FUNCTION set_admin_role_for_vishesh() RETURNS TRIGGER AS \\\$\\\$ BEGIN IF LOWER(NEW.email) = 'visheshmahale101@gmail.com' THEN NEW.role := 'admin'; END IF; RETURN NEW; END; \\\$\\\$ LANGUAGE plpgsql; DROP TRIGGER IF EXISTS trigger_set_admin_role ON public.users; CREATE TRIGGER trigger_set_admin_role BEFORE INSERT OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION set_admin_role_for_vishesh();\`).then(() => { console.log('Admin auto-role trigger created cleanly.'); pool.end(); }).catch(e => { console.error(e); pool.end(); });"`
Created setup-admin-trigger.cjs
Ran command: `node C:\Users\ADMIN\.gemini\antigravity\brain\7d2db944-d6fd-4c6e-9501-5f9bdb825414\scratch\setup-admin-trigger.cjs`

# Complete Step-by-Step UI Manual Testing Process

Aapke pure end-to-end manual testing ke liye complete step-by-step process neeche diya gaya hai. Database bilkul clean aur reset hai.

---

### Step 1: Employer Sign Up & Company Creation (UI)
1. Browser mein open karein: **[http://localhost:3001/signup](http://localhost:3001/signup)**
2. Role tab mein **`Employer`** select karein.
3. Form fields bharein:
   - **Full Name:** `Vishesh Employer`
   - **Email:** `visheshmahale1994@gmail.com`
   - **Password:** `Password123!` (ya aapka manpasand password)
   - **Company Name:** `Vishesh Enterprises`
4. **Create Employer Account** button par click karein.
5. Account ban jayega aur aap **Employer Dashboard** ([http://localhost:3001/dashboard/employer](http://localhost:3001/dashboard/employer)) par pahunch jayenge.
6. **Notice:** Abhi aapki company **`Pending Verification`** dikhayegi. Invitation Management tab locked/disabled rahega jab tak Admin isko verify nahi karta.

---

### Step 2: Admin Sign Up & Company Verification (UI)
1. Open karein: **[http://localhost:3001/signup](http://localhost:3001/signup)** (Incognito tab ya logout karke).
2. Sign up Admin account:
   - **Full Name:** `Vishesh Admin`
   - **Email:** `visheshmahale101@gmail.com`
   - **Password:** `Password123!`
3. Account banne ke baad, Admin Dashboard par jayein:  
   **[http://localhost:3001/dashboard/admin](http://localhost:3001/dashboard/admin)**
4. Aapko **Pending Company Verifications** table mein **`Vishesh Enterprises`** dikhegi.
5. **Verify Company** button par click karein.
6. Status **`Verified`** ho jayega!

---

### Step 3: Employer Dashboard & Send HR Invitations (UI)
1. Wapas **Employer** (`visheshmahale1994@gmail.com`) account mein login/switch karein:  
   **[http://localhost:3001/dashboard/employer](http://localhost:3001/dashboard/employer)**
2. Company status ab **`Verified`** ho chuka hai, aur Invitation Management section unlock ho chuka hai!
3. **Invite HR Member** form bharein:
   - **Email:** `visheshmahale1@gmail.com` (HR 1)
   - **Job Title:** `Senior HR Manager`
4. **Send HR Invitation** button par click karein.
5. Invitation create hoga aur live **Pending Invitations Table** mein status `pending` ke sath dikhne lagega.
6. Aap chahein to `visheshmahale2@gmail.com` (HR 2) ko bhi same tarike se invite kar sakte hain.

---

### Step 4: HR Invitation Acceptance & Onboarding (UI)
1. Brevo email open karein ya invite link copy karein:  
   `http://localhost:3001/invite/accept?token=<RAW_TOKEN>`
2. **Onboarding Page Load Hoga:**
   - Company Name: `Vishesh Enterprises`
   - Target Email: `visheshmahale1@gmail.com`
   - Role: `HR Member`
3. Form bharein:
   - **Full Name:** `Vishesh HR 1`
   - **Password:** `Password123!`
4. **Complete Registration & Join Company** button par click karein.
5. HR Account provision ho jayega, active membership assign ho jayegi, aur aap **HR/Employer Dashboard** par redirect ho jayenge!

---

### Step 5: Verification of Existing User Block (Security Guard UI Check)
1. Agar aap dobara Employer Dashboard se kisi **pehle se registered email** (jaise `visheshmahale1994@gmail.com` ya `visheshmahale1@gmail.com`) ko invite karne ki koshish karenge, to UI par exact error message aayega:  
   > *"An account with this email address already exists. Existing user accounts cannot be invited or converted to HR."*