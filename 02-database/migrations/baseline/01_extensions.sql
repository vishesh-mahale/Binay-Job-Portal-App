-- ============================================================================
-- File: 01_extensions.sql
-- Purpose: Enable PostgreSQL extensions required by the Job Portal.
--
-- Current status:
--   This is the testing baseline. Production baseline freeze hone se pehle is
--   file ko correct karke intended Supabase test database reset/rerun ki ja sakti hai.
--
-- Safe to execute multiple times.
-- IF NOT EXISTS prevents errors if an extension is already enabled.
-- ============================================================================

-- WHAT IS A POSTGRESQL EXTENSION?
-- PostgreSQL extensions add extra functionality that is not available
-- in the default database installation.
--
-- Think of an extension like installing a library/package in a programming language.
--
-- Examples:
-- • pgcrypto      → UUID generation & cryptographic functions
-- • citext        → Case-insensitive text (for emails)
-- • vector        → AI vector search
-- • pg_trgm       → Fuzzy text search
-- • unaccent      → Accent-insensitive search
-- • fuzzystrmatch → Phonetic name matching

-- ============================================================================

-- 🔷 pgcrypto — UUID Generation, Hashing & Encryption
-- Required for:
--   • gen_random_uuid() → Automatically generates UUIDs for primary keys.
--   • Cryptographic helpers → hashing and secure token-related operations where approved.
-- NOTE:
--   We are using Supabase Auth, so user password hashing is handled by Supabase.
--   Application public tables must never store/hash raw user passwords.
--   We mainly use pgcrypto for UUID generation and approved security helpers.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 🔷 citext — Case-Insensitive Text
-- Required for: email columns to be case-insensitive.
-- "ABC@gmail.com" = "abc@gmail.com" = "Abc@Gmail.com"
-- Without CITEXT, equivalent case-insensitive behavior needs an explicitly
-- normalized column/expression and a matching index/query strategy.
-- Extension availability can vary by Supabase project, so this baseline enables it.
-- CITEXT is used only where current schema semantics require it; trim or other
-- approved normalization rules still belong to application/database logic.
CREATE EXTENSION IF NOT EXISTS citext;

-- 🔷 vector (pgvector) — AI Semantic Search (REQUIRED FOR AI FEATURES)
-- AI converts resume and job description into vectors (number arrays).
-- PostgreSQL then compares these vectors to find semantic similarity.
--
-- Example:
-- Resume: "Frontend Engineer with React"
-- Job:    "Senior React Developer"
--
-- Even if the wording is different, vector search can identify that
-- both have similar meaning.
--
-- Compared job/candidate embeddings must use a compatible approved model,
-- version, dimension and normalization contract.
CREATE EXTENSION IF NOT EXISTS vector;

-- 🔷 pg_trgm — Fuzzy / Approximate Text Search
-- PostgreSQL breaks words into groups of 3 characters (trigrams)
-- and compares similarity.
--
-- Example:
-- "Javascript" vs "JavaScript" → Similarity score ≈ 0.9
--
-- Useful for:
-- • Search suggestions
-- • Typo tolerance
-- • Company search
-- • Skill search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 🔷 unaccent — Remove Accents From Text
-- Removes accents from characters before comparison.
--
-- Example:
-- résumé  → resume
-- José    → Jose
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 🔷 fuzzystrmatch — Phonetic Name Matching
-- Performs phonetic (sound-based) matching instead of exact spelling.
--
-- Example:
-- Rahul, Rahool, Raahul → all match
-- Mohammad, Muhammad, Mohamad → all match
--
-- Useful when users spell names differently but pronounce them similarly.
-- Enabling this extension does not automatically apply phonetic matching;
-- an approved query/function must explicitly use it.
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;

-- 🔷 btree_gist — GiST Index Support for Range Types
-- Required for: EXCLUDE constraints that prevent overlapping schedule blocks.
--
-- Example:
--   Interviewer "Alice" cannot have two overlapping interview slots:
--     9:00-10:00 AND 9:30-10:30 → EXCLUDE constraint blocks this.
--
-- Without btree_gist, PostgreSQL cannot create GiST indexes on
-- standard data types (like UUID + timestamptz) needed for EXCLUDE.
--
-- Used in: interview_schedule_blocks table (10_interviews.sql)
--   EXCLUDE USING gist (
--     interviewer_id WITH =,
--     tstzrange(start_time, end_time) WITH &&
--   )
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================================================
-- NOTE:
-- We intentionally use gen_random_uuid() from pgcrypto instead of
-- uuid_generate_v4() from uuid-ossp.
--

-- ============================================================================
-- NOTE:
-- We intentionally use gen_random_uuid() from pgcrypto instead of
-- uuid_generate_v4() from uuid-ossp.
--
-- Reason:
-- • Simpler setup
-- • Modern PostgreSQL recommendation
-- • Fully supported by Supabase
-- ============================================================================

-- ============================================================================
-- HOW TO VERIFY EXTENSIONS ARE ENABLED IN SUPABASE
-- Run this query to check all enabled extensions:
-- ============================================================================
-- SELECT * FROM pg_extension;
--
-- OR, to see only the extensions we created:
-- SELECT extname, extversion FROM pg_extension
-- WHERE extname IN ('pgcrypto', 'citext', 'vector', 'pg_trgm', 'unaccent', 'fuzzystrmatch', 'btree_gist');
--
-- This will show a table with columns:
-- • extname       → Extension name
-- • extversion    → Version number
-- • extowner      → Owner ID
-- • extnamespace  → Namespace ID
-- • extrelocatable → Can it be relocated
-- • extconfig     → Configuration
-- • extcondition  → Condition
-- ============================================================================
