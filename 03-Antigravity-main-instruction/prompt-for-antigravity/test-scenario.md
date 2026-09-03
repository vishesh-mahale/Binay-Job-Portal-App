# End-to-End Browser Testing Scenarios (Phase 09-B Option A Invite Flow)

## 🔑 Key Architecture Rule (Option A Flow)
> **Rule:** `company_members.user_id` PostgreSQL schema me `NOT NULL` hai.
> Isliye:
> 1. Invitee (`visheshmahale1@gmail.com`) pehle portal par signup karke apna user account banata hai.
> 2. Employer (`visheshmahale1994@gmail.com`) uske email se invite karta hai.
> 3. Backend existing user link karke `is_active = false` pending invitation banata hai.
> 4. Invitee login karke accept karta hai $\rightarrow$ `is_active = true` active member banta hai.
> 5. Agar email ka account pehle se nahi hoga, to invite par **HTTP 404 Not Found** milega.

---

## 👤 Test Accounts Configuration

| Role | Account Email | Signup Timing & Responsibilities |
| :--- | :--- | :--- |
| **Platform Admin** | `visheshmahale101@gmail.com` | Pre-registered admin. Approves Company Registration status (`verified`). |
| **Employer (Company Owner)** | `visheshmahale1994@gmail.com` | Pre-registered employer. Creates Company Profile, requests verification, invites HR members by email. |
| **HR Member 1** | `visheshmahale1@gmail.com` | Signup before invite. Employer invites by email, HR 1 logs in and accepts membership. |
| **HR Member 2** | `visheshmahale2@gmail.com` | Signup before invite. Employer invites by email, HR 2 logs in and accepts membership. |

---

## ⚙️ Server Endpoints
- ⚙️ **Backend NestJS API:** `http://localhost:3000`
- 💻 **Frontend Next.js Web App:** `http://localhost:3001`

---

## 🧪 Step-by-Step Test Execution Scenario

### Phase 1: Invitee Account Creation
1. Open `http://localhost:3001/signup`
2. Invitee 1 (`visheshmahale1@gmail.com`) signup karta hai (User account active ho jata hai).
3. Invitee 2 (`visheshmahale2@gmail.com`) signup karta hai (User account active ho jata hai).

---

### Phase 2: Employer Registration & Unverified State
1. Login as **Employer**: `visheshmahale1994@gmail.com` at `http://localhost:3001/login`.
2. Fill **Step 1: Create Company Profile**:
   - **Company Name:** `Acme Innovations`
   - **Slug:** `acme-innovations`
   - **Industry:** `Technology`
3. Verify status alert displays 🟡 **"UNVERIFIED / Pending with Platform Admin"**.
4. Verify Branch, Department, Team, and Member Invite forms are **locked/restricted**.
5. **Persistence Test:** Refresh browser (`F5`). Verify existing company profile persists without showing duplicate creation form.

---

### Phase 3: Platform Admin Verification
1. Login as **Platform Admin** (`visheshmahale101@gmail.com`) or issue HTTP request:
   - **Endpoint:** `PATCH /api/v1/admin/companies/{companyId}/verification`
   - **Header:** Admin Session Cookie
   - **Body:** `{ "verification_status": "verified" }`
2. Return to Employer Dashboard (`visheshmahale1994@gmail.com`) and click **"Refresh Status"**.
3. Verify status badge updates to 🟢 **"VERIFIED"** and all organization modules unlock.

---

### Phase 4: Organization Hierarchy & Email Member Invitations
1. **Branch Setup:** Create `Delhi HQ` branch.
2. **Department & Team Setup:** Create `Engineering` department and `Backend Team`.
3. **Negative Test (Unknown Email Invite):**
   - Attempt to invite `nonexistent999@gmail.com` (Unregistered email).
   - Verify UI displays **HTTP 404 Not Found** (User account not registered error).
4. **Invite Registered HR 1:**
   - Enter registered email `visheshmahale1@gmail.com` with title `Senior HR Manager` and click **"Send Invitation"**.
   - Verify invitation created with pending state (`is_active = false`, `invited_at` set).
5. **Invite Registered HR 2:**
   - Enter registered email `visheshmahale2@gmail.com` with title `Lead Recruiter` and click **"Send Invitation"**.

---

### Phase 5: HR Member Invitation Acceptance
1. In a separate browser window/tab, login as **HR 1** (`visheshmahale1@gmail.com`).
2. Accept invitation:
   - Issue `POST /api/v1/companies/{companyId}/membership/accept`.
3. Verify membership transitions to active (`is_active = true`) with `joined_at` timestamp.
4. Repeat acceptance for **HR 2** (`visheshmahale2@gmail.com`).