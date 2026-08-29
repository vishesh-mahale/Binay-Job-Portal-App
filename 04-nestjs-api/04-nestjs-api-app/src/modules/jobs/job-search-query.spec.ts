import { buildPublicJobSearch } from './job-search-query';

describe('public job search query', () => {
  it('always applies visibility guards and stable ordering', () => {
    const q = buildPublicJobSearch({ query: 'java', workMode: 'hybrid' }, 20);
    expect(q.text).toContain("j.status = 'published'");
    expect(q.text).toContain('j.deleted_at IS NULL');
    expect(q.text).toContain('(j.expires_at IS NULL OR j.expires_at > NOW())');
    expect(q.text).toContain('ORDER BY score DESC NULLS LAST, j.published_at DESC, j.id DESC');
    expect(q.values).toEqual(['java', 'hybrid', 20]);
  });

  it('keeps parameter numbering valid without a keyword', () => {
    const q = buildPublicJobSearch({ employmentType: 'full_time' }, 50);
    expect(q.values).toEqual(['', 'full_time', 50]);
    expect(q.text).not.toContain('j.search_vector @@');
  });

  it('rejects an unsafe page size', () => {
    expect(() => buildPublicJobSearch({}, 51)).toThrow('VALIDATION_ERROR');
  });
});