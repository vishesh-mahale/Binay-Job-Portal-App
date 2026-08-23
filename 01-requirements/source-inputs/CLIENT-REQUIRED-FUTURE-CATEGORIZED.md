# ALL-FEATURES — Category-wise View

> Ye file original client feature discussion ka category-wise maintained version hai. Features, scope classification aur commercial notes preserve kiye gaye hain; is summary mein koi feature intentionally delete nahi kiya gaya.

Final implementation status requirements consolidation ke baad freeze hoga. Ye file memory/navigation ke liye hai, final authority nahi.

**Related master requirement:** [REQUIREMENT.txt](REQUIREMENT.txt) — detailed business workflows, security, scalability, AI, search, application, referral, notification aur analytics requirements.

**Current curated requirements:** [PRODUCT-REQUIREMENTS.md](../current/PRODUCT-REQUIREMENTS.md) — refined current/planned behavior aur approved product decisions.

## Navigation

| Section | Jump link |
|---|---|
| Public Website | [Open](#1-public-website) |
| Candidate Module | [Open](#2-candidate-module) |
| HR / Recruiter Module | [Open](#3-hr--recruiter-module) |
| Company Owner Module | [Open](#4-company-owner-module) |
| Admin Panel | [Open](#5-admin-panel) |
| AI Features | [Open](#6-ai-features) |
| Real-time Features | [Open](#7-real-time-features) |
| New client features | [Open](#8-new-features-introduced--current-required-candidates) |
| Commercial/project notes | [Open](#9-commercialproject-notes--feature-nahi) |
| Estimated scope | [Open](#10-estimated-scope) |
| Consolidation next steps | [Open](#11-consolidation-ke-next-steps) |

## At-a-glance scope

| Scope | Meaning |
|---|---|
| Current/expected | Main product flow ke liye pehle verify/plan karne wali capabilities |
| Future scope | Later roadmap; current implementation mein automatically include nahi karna |
| New client additions | Current requirements mein consolidate karke acceptance criteria banani hain |

## 1. Public Website

<table border="1" cellpadding="6" cellspacing="0">
<tr><th align="left">Current/expected pages</th><th align="left">Future scope pages</th></tr>
<tr><td valign="top">Home<br>Contact Us<br>Login<br>Signup</td><td valign="top">About Us<br>Pricing<br>Features<br>Blog Listing<br>Blog Details<br>FAQ<br>Privacy Policy<br>Terms & Conditions</td></tr>
</table>

[↑ Back to Navigation](#navigation)

## 2. Candidate Module

<table border="1" cellpadding="6" cellspacing="0">
<tr><th align="left">Current/expected pages</th><th align="left">Future scope pages</th></tr>
<tr><td valign="top">Candidate Dashboard<br>My Profile<br>Edit Profile<br>Resume Management<br>Resume Upload<br>Resume Preview<br>AI Resume Analysis<br>Resume Version History<br>Job Search<br>Job Details<br>Saved Jobs<br>Applied Jobs<br>Application Details<br>AI Job Recommendations<br>Interview Schedule<br>Notifications<br>Messages / Chat<br>Account Settings<br>Change Password<br>Certificates<br>Experience<br>Education<br>Documents</td><td valign="top">Activity History<br>Skill Assessment</td></tr>
</table>

[↑ Back to Navigation](#navigation)

## 3. HR / Recruiter Module

<table border="1" cellpadding="6" cellspacing="0">
<tr><th align="left">Current/expected pages</th><th align="left">Future scope pages</th></tr>
<tr><td valign="top">HR Dashboard<br>Company Profile<br>Job List<br>Create Job<br>Edit Job<br>Job Preview<br>Candidate List<br>Candidate Details<br>Resume Viewer<br>AI Resume Match<br>AI Candidate Ranking<br>Shortlisted Candidates<br>Rejected Candidates<br>Interview Scheduling<br>Interview Calendar<br>Interview Feedback<br>Messages<br>Notifications<br>Team Members<br>Reports<br>Analytics<br>Search Candidates<br>Saved Candidates<br>Resume Database<br>Profile<br>Settings<br>Change Password</td><td valign="top">Activity Logs<br>Subscription<br>Billing</td></tr>
</table>

[↑ Back to Navigation](#navigation)

## 4. Company Owner Module

<table border="1" cellpadding="6" cellspacing="0">
<tr><th align="left">Current/expected pages</th><th align="left">Future scope pages</th></tr>
<tr><td valign="top">Owner Dashboard<br>Company Management<br>HR Management<br>Invite HR<br>Edit HR<br>Departments<br>Branches<br>Job Approval<br>Job Analytics<br>Recruitment Analytics<br>AI Hiring Analytics<br>Company Settings<br>Notifications<br>Reports<br>User Permissions<br>Profile<br>Change Password</td><td valign="top">Subscription<br>Billing<br>Invoice History<br>Audit Logs<br>Integrations<br>API Keys (Future)<br>Activity Timeline<br>Security Settings</td></tr>
</table>

[↑ Back to Navigation](#navigation)

## 5. Admin Panel

<table border="1" cellpadding="6" cellspacing="0">
<tr><th align="left">Current/expected pages</th><th align="left">Future scope pages</th></tr>
<tr><td valign="top">Admin Dashboard<br>Companies<br>Company Details<br>Candidates<br>Candidate Details<br>HR Users<br>Owner Users<br>Jobs<br>Applications<br>AI Monitoring<br>Coupons<br>Reports<br>Roles & Permissions<br>Admin Profile<br>Feature Flags</td><td valign="top">Resume Parser Logs<br>Search Index Status<br>Meilisearch Management<br>Queue Monitoring<br>Payments<br>Plans<br>Analytics<br>CMS Pages<br>Blogs<br>FAQ Management<br>Email Templates<br>Notification Templates<br>Support Tickets<br>Audit Logs<br>Security Logs<br>System Settings<br>Backup<br>Activity Logs<br>Error Logs<br>API Monitoring</td></tr>
</table>

[↑ Back to Navigation](#navigation)

## 6. AI Features

<table border="1" cellpadding="6" cellspacing="0">
<tr><th align="left">Current/expected AI features</th><th align="left">Future scope AI features</th></tr>
<tr><td valign="top">AI Resume Parsing<br>AI Resume Scoring<br>AI Skill Extraction<br>AI Candidate Ranking<br>AI Job Matching<br>AI Search Suggestions</td><td valign="top">AI Interview Question Generation<br>AI Resume Improvement Suggestions<br>AI Duplicate Detection<br>AI Hiring Analytics<br>AI Candidate Summary<br>AI Email Drafting<br>AI Cover Letter Analysis<br>AI Salary Insights<br>AI Recruitment Insights</td></tr>
</table>

[↑ Back to Navigation](#navigation)

## 7. Real-time Features

<table border="1" cellpadding="6" cellspacing="0">
<tr><th align="left">Current/expected</th><th align="left">Future scope</th></tr>
<tr><td valign="top">Live Notifications</td><td valign="top">Live Chat<br>Live Candidate Status<br>Live Interview Updates<br>Live HR Collaboration</td></tr>
</table>

[↑ Back to Navigation](#navigation)

## 8. New features introduced — current required candidates

Ye section client ki later discussion se aaya tha. In features ko initial consolidation mein `REQUIRED` mark kiya jayega; final API/DB/event mapping ke baad implementation order decide hoga.

- Referral Feature
  - Configurable reward mechanisms: points, cash, other incentives
- Interview Schedule
- Notifications
- Messages / Chat
- Guest Apply
  - Minimal onboarding: name, mobile number, resume upload
- Secure identity verification workflow
- Email notifications for all applicable business workflows
- Dynamic Interview Scheduling
- AI screening questions
- Backend aur supporting infrastructure ke liye more than one year tak no additional infrastructure cost — commercial/operational commitment; API feature nahi

## 9. Commercial/project notes — feature nahi

In points ko functional requirements ke saath mix nahi karna hai:

- Additional infrastructure cost: more than one year tak no additional cost (as discussed)
- Additional Value Included: Backend hosting and supporting infrastructure will be provided at no additional infrastructure cost for more than one year.
- Revised Project Cost: ₹2,10,000
- Estimated Project Timeline: 3–4 months
- Final Amount: ₹1,90,000

## 10. Estimated scope

- Approximate UI pages: 125–130

Ye estimate hai, final page count nahi. Final pages approved requirements, shared screens aur role-specific access ke baad derive honge.

## 11. Consolidation ke next steps

1. Har bullet ko stable `REQ-*` ID do.
2. Original source aur exact section reference preserve karo.
3. DB support, NestJS API/use case, contract, outbox event aur worker dependency map karo.
4. Future-marked items ko latest client decision ke against verify karo.
5. `New features introduced` items ke liye acceptance criteria likho.
6. Duplicate names ko merge karo, lekin original references retain karo. Example: Interview Schedule, Notifications, Messages/Chat.
7. Conflict ya missing decision ko `CONFLICT`/`NEEDS_CLARIFICATION` mark karo.
8. Final status sirf approved `FINAL-REQUIREMENTS.md` mein freeze hoga.
