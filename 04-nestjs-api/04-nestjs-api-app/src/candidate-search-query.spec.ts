import { buildRecruiterCandidateSearch } from './candidate-search-query';

describe('recruiter candidate search query', () => {
  it('enforces membership, open-to-work and safe projection fields', () => {
    const q = buildRecruiterCandidateSearch('company-1', 'user-1', { query: 'java', minExperience: 2 }, 20);
    expect(q.text).toContain('cm.company_id = $1');
    expect(q.text).toContain('cm.user_id = $2');
    expect(q.text).toContain('cm.is_active = TRUE');
    expect(q.text).toContain('cp.is_open_to_work = TRUE');
    expect(q.text).toContain("csp.search_vector @@ websearch_to_tsquery('english', $3)");
    expect(q.text).not.toContain('resume_parsed_data');
    expect(q.values).toEqual(['company-1', 'user-1', 'java', 2, 20]);
  });
});
