-- ============================================================================
-- Cross-domain Query Indexes
--
-- Domain-local FK, lifecycle and basic list indexes live beside their tables.
-- This file contains only indexes justified by a query spanning broader product
-- flows: candidate discovery, recruiter ranking, stale-work recovery and retention.
--
-- Inventory: 6 indexes.
-- Every index below must be verified with representative EXPLAIN (ANALYZE,
-- BUFFERS) tests after realistic seed volume. Unused indexes should be removed.
-- ============================================================================

-- Candidate filter/browse query when semantic matching is available.
CREATE INDEX idx_candidate_matching_ready
    ON candidate_search_profiles(total_experience_years, highest_education_level, generated_at DESC)
    WHERE embedding IS NOT NULL;

-- `skill_ids @> ARRAY[...]` / overlap filters used by recruiter candidate search.
CREATE INDEX idx_candidate_search_skill_ids
    ON candidate_search_profiles USING GIN(skill_ids);

-- Recruiter application queue: one job + selected workflow statuses, scored rows
-- first and newest applications first. Unscored rows must not sort above scores.
CREATE INDEX idx_application_recruiter_queue
    ON job_applications(job_id, ai_match_score DESC NULLS LAST, applied_at DESC)
    WHERE deleted_at IS NULL
      AND status IN ('applied', 'under_review', 'shortlisted', 'screening');

-- Worker recovery scans the claim timestamp, not unrelated later updates.
CREATE INDEX idx_resume_stale_processing_jobs
    ON resume_parsing_jobs(locked_at)
    WHERE status = 'processing' AND locked_at IS NOT NULL;

-- Active-session expiry already uses idx_guest_upload_sessions_expiry in 06.
-- This index is only for retention cleanup after expiry/revocation.
CREATE INDEX idx_guest_upload_cleanup
    ON guest_upload_sessions(status, expires_at)
    WHERE status IN ('expired', 'revoked');

-- Pending-claim expiry already uses idx_guest_claims_expiry in 09.
-- This index is only for terminal retention cleanup.
CREATE INDEX idx_guest_claim_cleanup
    ON guest_candidate_claims(status, expires_at)
    WHERE status IN ('expired', 'revoked', 'rejected');

-- Verify actual planner use with EXPLAIN (ANALYZE, BUFFERS) before adding more
-- indexes. Do not duplicate indexes created by UNIQUE constraints.
