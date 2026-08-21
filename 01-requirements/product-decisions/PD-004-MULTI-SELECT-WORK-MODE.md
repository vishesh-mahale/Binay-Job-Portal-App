# PD-004 — Candidate Preferred Work Mode Multi-Selection Design

[← Requirements index](../README.md) · [Main project](../../README.md)

## Status

`APPROVED FOR UPCOMING BASELINE FREEZE / MIGRATION`

## Context & Motivation

Current baseline schema in `08_candidates.sql` specifies a scalar PostgreSQL enum for candidate work mode preferences:
```sql
preferred_work_mode work_mode -- ('remote', 'onsite', 'hybrid')
```

### Problem Statement (15+ YOE Senior Architect & UX Review):
Forcing a single radio-button option creates a false dichotomy for candidates and harms discovery:
1. **Candidate Dilemma:** A candidate open to both `remote` and `hybrid` jobs cannot express this without dropping out of one set of search filters.
2. **Flexible Candidates:** Candidates willing to work in any mode (`onsite`, `hybrid`, `remote`) cannot select all three.
3. **Recruiter Search Fit:** Recruiters filtering strictly for `hybrid` miss candidates who marked `remote` but would happily work 2-days onsite.

## Decision

1. **Frontend / UI Specification:**
   - Candidate onboarding and profile edit forms MUST present **multi-select checkboxes / chips**:
     - `[ ✓ ] Remote`
     - `[ ✓ ] Hybrid`
     - `[ ✓ ] Onsite`
   - Validation requires at least one work mode to be selected.

2. **Database Schema Evolution (PostgreSQL):**
   - Candidate profile work mode representation evolves from scalar `preferred_work_mode work_mode` to an array of enums:
     ```sql
     preferred_work_modes work_mode[] NOT NULL DEFAULT '{hybrid, remote}'
     ```
   - Alternatively, indexed boolean flags for high-frequency filtering:
     ```sql
     open_to_remote BOOLEAN NOT NULL DEFAULT TRUE,
     open_to_hybrid BOOLEAN NOT NULL DEFAULT TRUE,
     open_to_onsite BOOLEAN NOT NULL DEFAULT FALSE
     ```

3. **AI Search Projection (`candidate_search_profiles`):**
   - The semantic text builder format outputs all selected work modes:
     ```text
     Work Preference: Remote, Hybrid | Willing to Relocate: Yes
     ```
   - Vector embeddings symmetrically encode candidate openness across all chosen modes.

4. **Backward Compatibility & Transition:**
   - During the transition from current baseline to production freeze, single enum values are mapped to singleton arrays (`'hybrid'` ➔ `ARRAY['hybrid'::work_mode]`).
