# Application Read APIs — Requirement Gap Note

**Status:** `NEEDS CATALOG DECISION — NO CODE`

Current API catalog defines registered apply, status mutation, guest apply/claim, but it does not
freeze separate read commands for:

1. Candidate's own application list/detail/history.
2. HR/company application list/detail/snapshot view.

## Evidence

- `job_applications`, `application_status_history`, `application_documents` and immutable
  `application_profile_snapshots` exist in `09_applications.sql`.
- Product requirements require authenticated applications to remain linked to the candidate and
  submitted history to remain unchanged after later profile edits.
- Existing API catalog section 3E has no concrete read route for either actor.

## Required decisions before coding

- Candidate route shape and whether deleted/withdrawn applications remain visible.
- HR route shape, company boundary and exact fields allowed from the submitted snapshot.
- Pagination/cursor and filtering by job/status/date.
- Whether candidate and HR detail responses use separate DTOs (recommended: yes).
- Redaction rules for recruiter notes, contact data and internal AI fields.

## Non-negotiable boundaries

- Candidate can read only applications linked to its JWT-derived candidate/user.
- HR can read only applications for jobs belonging to an authorized active company scope.
- Submitted snapshot is read-only and must not be rebuilt from current profile data.
- No raw resume bytes or private recruiter notes in candidate responses.
