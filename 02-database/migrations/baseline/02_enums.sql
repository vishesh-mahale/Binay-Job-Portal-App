-- ============================================================================
-- ENUM Type Definitions
-- Centralized enum types for data consistency across all tables
-- Har value ka comment diya gaya hai taaki samajh mein aaye kab kya use karna hai
--
-- CURRENT TESTING-BASELINE RULE:
-- Production baseline freeze hone se pehle enum definitions correct karke intended
-- Supabase test database ko explicitly reset aur complete 01-18 rerun kiya ja sakta hai.
-- CREATE TYPE statements repeat-safe nahi hain; existing schema par is poori file ko
-- silently rerun na karein. Enum value change production deployment ke baad reviewed
-- forward migration se hoga.
-- ============================================================================

-- ============================================================================
-- HOW TO VIEW ENUMS IN SUPABASE
-- ============================================================================
--
-- Query 1: Show each ENUM with all its values in one row
-- My favorite — useful for a compact overview of enum definitions
-- SELECT
--     t.typname AS enum_name,
--     string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS values
-- FROM pg_type t
-- JOIN pg_enum e
--     ON t.oid = e.enumtypid
-- JOIN pg_namespace n
--     ON n.oid = t.typnamespace
-- WHERE n.nspname = 'public'
-- GROUP BY t.typname
-- ORDER BY t.typname;
--
-- Query 2: View ALL ENUMs with their Values
-- Use this to see all enum types and their values in your database
-- Useful for: Debugging, validation, documentation
-- SELECT 
--     t.typname AS enum_name,
--     e.enumlabel AS enum_value
-- FROM pg_type t
-- JOIN pg_enum e ON t.oid = e.enumtypid
-- ORDER BY t.typname, e.enumsortorder;
--
-- Query 3: View Specific ENUM (e.g., user_role)
-- Use this to see values for only one ENUM type
-- Useful for: Checking specific ENUM values, validation
-- SELECT enumlabel 
-- FROM pg_enum
-- WHERE enumtypid = 'user_role'::regtype
-- ORDER BY enumsortorder;
-- (Replace 'user_role' with any other enum name like 'job_status', 'application_status', etc.)
--
-- HOW TO RUN: Copy query → Supabase SQL Editor → Run
-- ============================================================================

-- ============================================================================
-- USER & AUTH ENUMS
-- ============================================================================

-- Current application account roles. Referral koi separate role nahi hai.
-- NOTE: Auth is handled by Supabase Auth (email + password)
-- These roles are for APPLICATION-LEVEL authorization only
CREATE TYPE user_role AS ENUM (
    'candidate',    -- Job seeker
    'employer',     -- Company owner / primary contact
    'hr',           -- HR user (works under employer)
    'admin'         -- Platform admin
);

-- Account status lifecycle
CREATE TYPE account_status AS ENUM (
    'pending_verification',  -- Email not yet verified
    'active',               -- Fully active
    'suspended',            -- Temporarily suspended
    'deactivated',          -- User deactivated voluntarily
    'banned'                -- Permanently banned
);

-- Login failure reasons (structured ENUM for clean analytics)
CREATE TYPE login_failure_reason AS ENUM (
    'invalid_password',
    'user_not_found',
    'account_locked',
    'email_not_verified',
    'too_many_attempts',
    'suspended',
    'banned',
    'invalid_oauth_token',
    'unknown'
);

-- Authentication method used for one login attempt. OAuth provider identity
-- login_history.auth_provider mein separately store hogi.
CREATE TYPE auth_login_type AS ENUM (
    'email_password',
    'magic_link',
    'otp',
    'oauth',
    'sso'
);

-- Security event types for user_security_log
-- These values are a stable domain and rarely change, hence ENUM over VARCHAR.
-- Using ENUM prevents typos and ensures data consistency.
CREATE TYPE security_event_type AS ENUM (
    'password_changed',
    'password_reset',
    'email_verified',
    'email_changed',
    'account_locked',
    'account_unlocked',
    'role_changed',
    'mfa_enabled',
    'mfa_disabled',
    'login_failed',
    'account_suspended',
    'account_reactivated',
    'account_deleted',
    'phone_changed'
);

-- ============================================================================
-- COMPANY ENUMS
-- ============================================================================

-- Company verification status
-- ⚠️ STRICT VERIFICATION FLOW (Option B):
--    1. Employer signup karega → Company create karega → Status: 'unverified'
--    2. Employer documents submit karega → Status: 'pending'
--    3. Admin documents check karega:
--         ✅ Sab sahi → 'verified' (jobs publish kar sakta hai)
--         ❌ Issue hai → 'rejected' (employer dobara submit kar sakta hai)
--
--    IMPORTANT: Jobs tab tak PUBLISH nahi ho sakti jab tak company 'verified' nahi hai.
--    Current baseline mein cross-table verification NestJS publish transaction enforce
--    karegi; PostgreSQL CHECK constraint doosri table query nahi kar sakta.

CREATE TYPE company_verification_status AS ENUM (
    'unverified',   -- 🆕 Default status — company abhi create hui hai, kuch submit nahi kiya
    'pending',      -- 📄 Documents submit kiye — admin review kar raha hai
    'verified',     -- ✅ Sab documents sahi hai — company verified hai, jobs publish kar sakta hai
    'rejected'      -- ❌ Documents mein issue tha — admin ne reject kiya, employer re-submit kar sakta hai
);

-- Company size ranges
-- Company mein kitne log kaam karte hain
CREATE TYPE company_size AS ENUM (
    '1-10',         -- Startup / very small team — 1 se 10 employees
    '11-50',        -- Small company — 11 se 50 employees
    '51-200',       -- Medium company — 51 se 200 employees
    '201-500',      -- Large company — 201 se 500 employees
    '501-1000',     -- Enterprise — 501 se 1000 employees
    '1001-5000',    -- Large enterprise — 1001 se 5000 employees
    '5001+'         -- MNC / Conglomerate — 5001+ employees (Google, Microsoft, etc.)
);

-- ============================================================================
-- JOB ENUMS
-- ============================================================================

-- Job status workflow
-- Job posting abhi kis stage mein hai
CREATE TYPE job_status AS ENUM (
    'draft',            -- Not yet published — HR bana raha hai, abhi publish nahi kiya
    'pending_approval', -- Awaiting owner/admin approval — employer/owner approve karega tab publish hoga
    'published',        -- Live and accepting applications — sab dekh sakte hain, apply kar sakte hain
    'paused',           -- Temporarily not accepting applications — temporarily band kiya, baad mein resume karega
    'closed',           -- Filled / no longer accepting — candidate mil gaya, ab apply nahi kar sakte
    'expired',          -- Past the expiry date — jo end date thi wo nikal gayi
    'archived'          -- Hidden but retained — history mein hai but dikhta nahi
);

-- Employment types
-- Job kis tarah ki hai?
CREATE TYPE employment_type AS ENUM (
    'full_time',    -- Pura time, 8-9 hours — regular job (e.g., Monday-Friday 9 to 6)
    'part_time',    -- Part time, 4-5 hours — kam ghante ka kaam
    'contract',     -- Fixed term contract — 6 month / 1 year ka contract
    'temporary',    -- Temporary position — kuch din/mahine ke liye
    'internship',   -- Intern / trainee — freshers ke liye, generally 3-6 months
    'freelance',    -- Project-based — project khatam = kaam khatam
    'volunteer'     -- Unpaid / social work — bina salary ke, NGO/social work
);

-- Company member employment status
-- Employee lifecycle state for HR/operational queries
CREATE TYPE employment_status AS ENUM (
    'active',
    'inactive',
    'probation',
    'terminated',
    'on_leave',
    'retired'
);

-- Work mode / location type
-- Candidate kahan se kaam karega?
CREATE TYPE work_mode AS ENUM (
    'remote',   -- Ghar se / anywhere — kahi se bhi kaam kar sakta hai
    'onsite',   -- Office se — roz office aana hoga
    'hybrid'    -- Mix — kuch din office, kuch din ghar se
);

-- Experience level
-- Kitne saal ka experience chahiye?
CREATE TYPE experience_level AS ENUM (
    'entry',        -- 0-2 years — fresher / entry level, training di jayegi
    'junior',       -- 1-3 years — thoda experience hai but still learning
    'mid',          -- 3-5 years — comfortable hai, independently kaam kar sakta hai
    'senior',       -- 5-8 years — expert, juniors ko lead kar sakta hai
    'lead',         -- 8-12 years — team lead, project lead
    'principal',    -- 12+ years — architect level, company ke technical decisions
    'executive'     -- C-level / VP — CXO level, company ke top management
);

-- Salary currency
-- Kis currency mein salary hai?
-- NOTE: App initially India mein work karegi, isliye INR default hai
-- Baad mein foreign expansion ke liye other currencies add ki gayi hain
CREATE TYPE salary_currency AS ENUM (
    'INR',  -- 🇮🇳 Indian Rupee (₹) — PRIMARY CURRENCY, initially India-focussed app
    'USD',  -- US Dollar ($) — foreign expansion ke liye
    'EUR',  -- Euro (€) — European countries ke liye
    'GBP',  -- British Pound (£) — UK ke liye
    'CAD',  -- Canadian Dollar (C$) — Canada ke liye
    'AUD',  -- Australian Dollar (A$) — Australia ke liye
    'SGD',  -- Singapore Dollar (S$) — Singapore ke liye
    'AED'   -- UAE Dirham (د.إ) — UAE/Middle East ke liye
);
-- ORDER NOTE: INR pehle rakha gaya hai kyunki yeh primary currency hai

-- Billing / payment currency
-- Yeh currency SIRF billing aur payment ke liye hai.
-- NOTE: salary_currency salary display ke liye hai (jobs table)
--       currency_code billing ke liye hai (subscriptions, invoices)
-- Dono alag-alag ENUMs hain kyunki billing aur salary alag contexts hain.
CREATE TYPE currency_code AS ENUM (
    'INR',  -- 🇮🇳 Indian Rupee (₹) — PRIMARY BILLING CURRENCY
    'USD',  -- US Dollar ($)
    'EUR',  -- Euro (€)
    'GBP',  -- British Pound (£)
    'CAD',  -- Canadian Dollar (C$)
    'AUD',  -- Australian Dollar (A$)
    'SGD',  -- Singapore Dollar (S$)
    'AED'   -- UAE Dirham (د.إ)
);

-- Salary period
-- Salary kitne time ke liye hai?
CREATE TYPE salary_period AS ENUM (
    'hourly',   -- Per hour — like ₹500/hour
    'daily',    -- Per day — like ₹2000/day (daily wagers)
    'weekly',   -- Per week — like ₹15000/week (rare)
    'monthly',  -- Per month — like ₹5 LPA = ₹41,666/month (most common in India)
    'yearly'    -- Per annum — like ₹20 LPA (standard for salaried jobs)
);

-- ============================================================================
-- APPLICATION ENUMS
-- ============================================================================

-- Application status tracking
-- applied -> under_review -> shortlisted -> screening -> interview_scheduled -> interview_completed -> selected/rejected
CREATE TYPE application_status AS ENUM (
    'applied',
    'under_review',
    'shortlisted',
    'screening',
    'interview_scheduled',
    'interview_completed',
    'selected',
    'offer_extended',
    'offer_accepted',
    'offer_declined',
    'rejected',
    'withdrawn',
    'on_hold'
);

-- Feedback categories for platform feedback
CREATE TYPE feedback_category AS ENUM (
    'platform_experience',
    'recruitment_process',
    'bug_report',
    'suggestion',
    'feature_request',
    'other'
);

-- Platform feedback lifecycle status
CREATE TYPE feedback_status AS ENUM (
    'new',
    'in_progress',
    'resolved',
    'closed'
);

-- ============================================================================
-- RESUME / PARSING ENUMS
-- ============================================================================

-- Document-level processing status (uploaded_documents.processing_status).
-- Yeh resume_parsing_jobs ke attempt-level parsing_job_status se alag hai.
CREATE TYPE resume_processing_status AS ENUM (
    'uploaded',         -- File received — resume upload ho gaya, abhi process karna baaki hai
    'queued',           -- Waiting in processing queue — line mein hai, jaldi hi process hoga
    'processing',       -- Currently being parsed — abhi data extract ho raha hai
    'parsed',           -- Basic parsing complete — basic details nikal liye (name, email, phone)
    'ai_enriching',     -- AI enrichment in progress — AI additional details nikal raha hai
    'completed',        -- Fully processed — sab kuch complete, data ready hai
    'failed',           -- Processing failed — kuch error aaya, resume parse nahi ho paya
    'partial'           -- Partial data extracted — kuch data mila but poori nahi (e.g., blurry PDF)
);

-- Uploaded file ki broad classification.
-- Yeh document_role se alag hai: document_type file batata hai; document_role kisi
-- candidate/application/interview association mein us file ka purpose batata hai.
CREATE TYPE document_type AS ENUM (
    'resume',        -- Resume / CV — main document, candidate ka profile
    'cover_letter',  -- Cover letter — job ke liye personal letter
    'certificate',   -- Certificate / degree — degree, diploma, course completion
    'portfolio',     -- Portfolio — work samples, projects
    'other'          -- Other documents — koi bhi other document
);

-- ============================================================================
-- INTERVIEW ENUMS
-- ============================================================================

-- Interview type
-- Interview kaise hoga?
CREATE TYPE interview_type AS ENUM (
    'phone',                -- Phone call interview — simple call pe questions
    'video',                -- Video call (Zoom/Google Meet) — face-to-face online
    'in_person',            -- Face-to-face at office — office aake interview
    'technical_assessment', -- Take-home test / coding challenge — ghar se karo, submit karo
    'group',                -- Group discussion / panel — ek saath multiple candidates
    'panel'                 -- Multiple interviewers — ek candidate, 2-3 interviewers
);

-- Interview status
-- Interview ka kya haal hai?
CREATE TYPE interview_status AS ENUM (
    'scheduled',    -- Interview fix ho gaya hai — time, date, meeting link sab set
    'confirmed',    -- Candidate ne confirm kar diya — haan, main aaunga
    'rescheduled',  -- Dobara schedule kiya — pehla time cancel, naya time set
    'completed',    -- Interview ho gaya — done!
    'cancelled',    -- Cancel ho gaya — kisi reason se nahi hua
    'no_show'       -- Candidate nahi aaya — bina bataye absent
);

-- Interview feedback recommendation. Yeh interviewer input hai, automatic hiring
-- verdict nahi. Multiple participant feedback ke baad authorized hiring workflow
-- final application decision lega.
-- Har interviewer ka feedback store hota hai interview_feedback table mein.
-- Multiple interviewers ka feedback combined hota hai → management final decision leta hai.
--
CREATE TYPE interview_decision AS ENUM (
    'strong_hire',      -- ⭐⭐⭐⭐⭐ Definitely hire! — Bahut accha tha, exceptional candidate
                        --     Google mein iska matlab: "champion this candidate, hire no matter what"
    'hire',             -- ⭐⭐⭐⭐ Good hire — Accha hai, confidently hire kar sakte hain
                        --     Thoda improvement required but overall strong candidate
    'maybe',            -- ⭐⭐⭐ Mixed / On the fence — Confuse hain, kuch points strong hain kuch weak
                        --     Is case mein usually panel discussion hoti hai ya additional round liya jata hai
    'no_hire',          -- ⭐⭐ Not suitable — Suitable nahi hai, missing key requirements
                        --     No major red flags but overall not matching
    'strong_no_hire'    -- ⭐ Strong No — Serious issues hain, should not hire under any circumstances
                        --     Major red flags: behavior issues, skill gaps, culture mismatch
);

-- ============================================================================
-- NOTIFICATION ENUMS
-- ============================================================================

-- Notification channels
-- User ko notification kaise milegi?
CREATE TYPE notification_channel AS ENUM (
    'in_app',   -- App ke andar — notification bell icon par dikhega
    'email',    -- Email pe — registered email ID par jayega
    'push',     -- Push notification — mobile/desktop notification
    'sms'       -- SMS — phone pe text message
);

-- Notification priority
-- Kitna urgent hai notification?
CREATE TYPE notification_priority AS ENUM (
    'low',      -- Not important — marketing, tips, suggestions (user ko disturb nahi karna)
    'normal',   -- Normal — general updates (e.g., "Your profile was viewed")
    'high',     -- Important — jald dekhna chahiye (e.g., interview reminder in 1 hour)
    'urgent'    -- Very urgent — immediately action chahiye (e.g., interview in 15 mins)
);

-- ============================================================================
-- SUBSCRIPTION ENUMS
-- ============================================================================

-- Billing interval
-- Bill kitne time par aayega?
CREATE TYPE billing_interval AS ENUM (
    'monthly',   -- Har mahine — ₹999/month (flexible, but thoda mehnga)
    'quarterly', -- Har 3 mahine — ₹2,499/quarter (sasta, 3 months ka combo)
    'yearly'     -- Har saal — ₹9,999/year (sabse sasta, 2 months free)
);

-- Subscription status
-- Subscription ka current status kya hai?
CREATE TYPE subscription_status AS ENUM (
    'active',       -- Subscription chal raha hai — sab features available
    'past_due',     -- Payment nahi aaya — card fail hua, retry hoga
    'canceled',     -- Cancel kar diya — user ne plan band kar diya
    'expired',      -- Time khatam ho gaya — renew nahi kiya
    'trialing',     -- Trial period mein hai — free use kar raha hai, paise nahi lage
    'incomplete'    -- Signup beech mein chhoda — payment process complete nahi hua
);

-- Payment status
-- Payment ka kya status hai?
CREATE TYPE payment_status AS ENUM (
    'pending',              -- Payment process ho raha hai — abhi complete nahi hua
    'succeeded',            -- Payment successful — paise aa gaye ✅
    'failed',               -- Payment fail — card issue, insufficient balance, etc.
    'refunded',             -- Pura refund — saare paise wapas
    'partially_refunded'    -- Aadha refund — kuch paise wapas kiye
);

-- ============================================================================
-- EMBEDDING STATUS
-- ============================================================================
-- Current use: jobs.embedding_status. Candidate projection freshness
-- candidate_search_profiles revision fields se track hoti hai.
CREATE TYPE embedding_status AS ENUM (
    'pending',      -- Embedding not yet generated
    'processing',   -- Currently generating embedding
    'completed',    -- Embedding stored and ready for vector search
    'failed'        -- Embedding generation failed — retry scheduled
);

-- ============================================================================
-- MEETING PROVIDER
-- ============================================================================
CREATE TYPE meeting_provider AS ENUM (
    'zoom',             -- Zoom Video Conferencing
    'google_meet',      -- Google Meet
    'microsoft_teams',  -- Microsoft Teams
    'webex',            -- Cisco WebEx
    'other'             -- Other / custom meeting provider
);

-- ============================================================================
-- PARSING PRIORITY
-- ============================================================================
CREATE TYPE parsing_priority AS ENUM (
    'low',      -- Low priority — bulk imports, background processing
    'normal',   -- Normal priority — regular user uploads (default)
    'high',     -- High priority — approved time-sensitive processing policy
    'urgent'    -- Urgent — controlled admin/operations use; normal uploads ke liye nahi
);

-- ============================================================================
-- MESSAGING ENUMS
-- ============================================================================

-- Conversation type
-- Kaunsi type ki conversation hai?
CREATE TYPE conversation_type AS ENUM (
    'direct',        -- 1:1 chat — do log baat kar rahe hain
    'group',         -- Group chat — multiple log ek saath
    'application',   -- Job application thread — application se related chat
    'interview',     -- Interview coordination — interview ke liye chat
    'support',       -- Support chat — customer support se baat
    'ai'             -- AI assistant — AI se baat
);

-- Message type
-- Message ka type kya hai?
CREATE TYPE message_type AS ENUM (
    'text',               -- Plain text message
    'image',              -- Image file
    'file',               -- Document or other file
    'system',             -- System-generated message (e.g., "Interview scheduled")
    'interview_invite',   -- Interview invitation message
    'application_update'  -- Application status change notification
);

-- Participant role in conversation
-- Conversation mein user ka kya role hai?
CREATE TYPE participant_role AS ENUM (
    'admin',     -- Conversation admin — manage participants, settings
    'member',    -- Regular member — send messages, react
    'viewer'     -- View-only — can read but cannot send
);

-- Participant status in conversation
-- User conversation mein kis status mein hai?
CREATE TYPE participant_status AS ENUM (
    'active',   -- Active participant — sab kuch kar sakta hai
    'left',     -- Chhoda hai — leave kar diya
    'removed',  -- Removed by admin — admin ne nikaal diya
    'blocked'   -- Blocked — block ho gaya
);

-- ============================================================================
-- REFERRAL ENUMS
-- ============================================================================

-- Referral status
-- Referral ka kya status hai? Candidate ko refer kiya to ab kya hua?
CREATE TYPE referral_batch_status AS ENUM (
    'draft', 'ready', 'processing', 'completed', 'partially_failed', 'cancelled'
);

CREATE TYPE referral_invitation_status AS ENUM (
    'pending', 'queued', 'sent', 'opened', 'applied',
    'declined', 'expired', 'failed', 'cancelled'
);

CREATE TYPE referral_reward_status AS ENUM (
    'not_eligible', 'pending_eligibility', 'eligible',
    'approved', 'paid', 'cancelled'
);

-- ============================================================================
-- PRODUCTION DOCUMENT, PROFILE, EVIDENCE, SNAPSHOT & EVENT ENUMS
-- ============================================================================

-- Upload security scanner ka lifecycle. Infected/quarantined document ko parsing,
-- preview ya application attachment ke liye authorize nahi karna hai.

CREATE TYPE security_scan_status AS ENUM (
    'pending', 'scanning', 'clean', 'infected', 'failed', 'quarantined'
);

CREATE TYPE guest_upload_session_status AS ENUM (
    'active', 'consumed', 'expired', 'revoked'
);

CREATE TYPE parsing_job_status AS ENUM (
    'queued', 'processing', 'completed', 'partial', 'failed', 'cancelled'
);

CREATE TYPE parsing_artifact_type AS ENUM (
    'extracted_text', 'ocr_output', 'page_image', 'normalized_json',
    'validation_report', 'other'
);

CREATE TYPE parsing_event_type AS ENUM (
    'queued', 'started', 'extraction_completed', 'ocr_completed',
    'ai_completed', 'validation_completed', 'completed', 'retry_scheduled',
    'failed', 'cancelled'
);

CREATE TYPE profile_fact_source AS ENUM (
    'candidate_manual', 'resume_ai', 'candidate_corrected', 'assessment',
    'recruiter_verified', 'admin_import', 'external_import', 'system'
);

CREATE TYPE profile_fact_verification_status AS ENUM (
    'suggested', 'self_declared', 'candidate_confirmed', 'assessment_verified',
    'recruiter_verified', 'admin_verified', 'rejected', 'disputed'
);

CREATE TYPE evidence_status AS ENUM (
    'active', 'superseded', 'rejected', 'invalidated'
);

CREATE TYPE application_snapshot_type AS ENUM (
    'submitted', 'parsed', 'enriched', 'reviewed'
);

CREATE TYPE snapshot_generator AS ENUM (
    'candidate', 'guest', 'system', 'ai_worker', 'recruiter', 'admin'
);

CREATE TYPE document_role AS ENUM (
    'resume', 'cover_letter', 'certificate', 'portfolio', 'supporting', 'other'
);

CREATE TYPE guest_claim_status AS ENUM (
    'pending', 'verified', 'merged', 'expired', 'revoked', 'rejected'
);

CREATE TYPE outbox_event_status AS ENUM (
    'pending', 'publishing', 'published', 'failed', 'dead_letter'
);

