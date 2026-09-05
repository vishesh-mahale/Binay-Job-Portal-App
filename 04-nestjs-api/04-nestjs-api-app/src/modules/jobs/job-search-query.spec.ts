import { buildPublicJobSearch } from './job-search-query';

describe('public job search query', () => {
  it('always applies visibility guards and stable ordering', () => {
    const q = buildPublicJobSearch({ query: 'java', workMode: 'hybrid' }, 20);
    expect(q.text).toContain("j.status = 'published'");
    expect(q.text).toContain('j.deleted_at IS NULL');
    expect(q.text).toContain('(j.expires_at IS NULL OR j.expires_at > NOW())');
    expect(q.text).toContain("c.verification_status = 'verified'");
    expect(q.text).toContain('c.deleted_at IS NULL');
    expect(q.text).toContain('JOIN public.companies c ON c.id = j.company_id');
    expect(q.text).toContain('ORDER BY j.published_at DESC, j.id DESC');
    expect(q.values).toEqual(['java', 'hybrid', 20]);
  });

  it('keeps parameter numbering valid without a keyword', () => {
    const q = buildPublicJobSearch({ employmentType: 'full_time' }, 50);
    expect(q.values).toEqual(['', 'full_time', 50]);
    expect(q.text).not.toContain('j.search_vector @@');
  });

  it('applies cursor position predicate when cursorPosition is provided', () => {
    const q = buildPublicJobSearch({ query: 'dev' }, 20, { publishedAt: '2026-09-01T00:00:00Z', id: 'job-uuid-1' });
    expect(q.text).toContain('(j.published_at < $2 OR (j.published_at = $2 AND j.id < $3))');
    expect(q.values).toEqual(['dev', '2026-09-01T00:00:00Z', 'job-uuid-1', 20]);
  });

  it('rejects an unsafe page size', () => {
    expect(() => buildPublicJobSearch({}, 51)).toThrow('VALIDATION_ERROR');
  });
});