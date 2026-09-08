Ran command: `node -e "const http=require('http'); Promise.all([ new Promise(r => http.get('http://localhost:3000/api/v1/jobs', res => r('NestJS API: ' + res.statusCode))), new Promise(r => http.get('http://localhost:3001/', res => r('Next.js Web: ' + res.statusCode))) ]).then(console.log);"`

Checking dev server ports 3000 and 3001...

Aap ab browser me UI se testing kar sakte hain! Frontend aur Backend dono dev servers live container me ready hain:

🌐 **Application URL**: [http://localhost:3001](http://localhost:3001)

---

### 🧪 UI Testing Checklist (Step-by-step):

1. **Home Page Listing (`http://localhost:3001`)**:
   - Page open karke niche scroll karein — **"Explore Opportunities"** section me published jobs ke cards dikhenge.
   - **Confidential Employer Masking Check**: Verify karein ki confidential job par real company name/logo nahi hai, balki **"Confidential Employer"** (with Shield icon 🛡️) display ho raha hai.

2. **Search & Filters Test**:
   - **Search Input**: `"HR"` type karke **Search** button click karein — filter hoke HR position dikhegi.
   - **Work Mode Dropdown**: `"Remote"`, `"Hybrid"`, ya `"Onsite"` select karke filter behavior check karein.
   - **Clear Filters**: **"Clear Filters"** click karne par search reset hoke saare published jobs wapas aayenge.

3. **Public Job Detail Page (`http://localhost:3001/jobs/hr-resource`)**:
   - Kisi bhi job card ke title par click karein ya direct URL `/jobs/hr-resource` open karein.
   - **New Fields Verification**: Side panel / specs card me:
     - **Work Shift**: e.g., `night`
     - **Min Education**: e.g., `masters`
     - **Skills Breakdown**: Must Have / Nice to Have / Additional Skills (e.g., `communication skills`, `polite`)
   - **CTA Behavior**:
     - Binay Login (Guest Visitor): **"Sign in to Apply"** button dikhega jo `/login?redirect=/jobs/hr-resource` par le jayega.
     - Candidate Logged In: **"Apply Now"** button dikhega.
     - **Share Button**: Click karne par link clipboard me copy ho jayega ("Link Copied!").