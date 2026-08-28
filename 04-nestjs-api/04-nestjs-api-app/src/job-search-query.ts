export type JobSearchFilters = {
  query?: string;
  employmentType?: string;
  workMode?: string;
  locationCountry?: string;
  categoryId?: string;
};

export type BuiltJobSearch = { text: string; values: unknown[] };

/** Builds the bounded public-job query; callers must add cursor predicates separately. */
export function buildPublicJobSearch(filters: JobSearchFilters, limit: number): BuiltJobSearch {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('VALIDATION_ERROR');
  const values: unknown[] = [];
  const where = [
    "j.status = 'published'",
    'j.deleted_at IS NULL',
    '(j.expires_at IS NULL OR j.expires_at > NOW())',
  ];
  // Keep the text-search parameter stable so the score expression is always $1.
  values.push(filters.query?.trim() ?? '');
  const add = (sql: string, value: unknown) => { values.push(value); where.push(sql.replace('$N', `$${values.length}`)); };
  if (filters.query?.trim()) where.push("j.search_vector @@ websearch_to_tsquery('english', $1)");
  if (filters.employmentType) add('j.employment_type = $N', filters.employmentType);
  if (filters.workMode) add('j.work_mode = $N', filters.workMode);
  if (filters.locationCountry) add('j.location_country = $N', filters.locationCountry);
  if (filters.categoryId) add('j.category_id = $N', filters.categoryId);
  values.push(limit);
  return {
    text: `SELECT j.id, j.title, j.slug, j.company_id, j.category, j.location_city, j.location_state,
                  j.location_country, j.work_mode, j.employment_type, j.experience_level,
                  j.published_at, j.expires_at, j.is_confidential,
                  ts_rank_cd(j.search_vector, websearch_to_tsquery('english', $1)) AS score
           FROM public.jobs j
           WHERE ${where.join(' AND ')}
           ORDER BY score DESC NULLS LAST, j.published_at DESC, j.id DESC
           LIMIT $${values.length}`,
    values,
  };
}
