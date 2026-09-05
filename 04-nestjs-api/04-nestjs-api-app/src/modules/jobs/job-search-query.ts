export type JobSearchFilters = {
  query?: string;
  employmentType?: string;
  workMode?: string;
  locationCountry?: string;
  categoryId?: string;
};

export type CursorPosition = { publishedAt: string; id: string };

export type BuiltJobSearch = { text: string; values: unknown[] };

/** Builds the bounded public-job query with optional cursor predicate for page skipping. */
export function buildPublicJobSearch(
  filters: JobSearchFilters,
  limit: number,
  cursorPosition?: CursorPosition,
): BuiltJobSearch {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('VALIDATION_ERROR');
  const values: unknown[] = [];
  const where = [
    "j.status = 'published'",
    'j.deleted_at IS NULL',
    '(j.expires_at IS NULL OR j.expires_at > NOW())',
    "c.verification_status = 'verified'",
    'c.deleted_at IS NULL',
  ];
  // Keep the text-search parameter stable so the score expression is always $1.
  values.push(filters.query?.trim() ?? '');
  const add = (sql: string, value: unknown) => { values.push(value); where.push(sql.replace('$N', `$${values.length}`)); };
  if (filters.query?.trim()) where.push("j.search_vector @@ websearch_to_tsquery('english', $1)");
  if (filters.employmentType) add('j.employment_type = $N', filters.employmentType);
  if (filters.workMode) add('j.work_mode = $N', filters.workMode);
  if (filters.locationCountry) add('j.location_country = $N', filters.locationCountry);
  if (filters.categoryId) add('j.category_id = $N', filters.categoryId);

  if (cursorPosition?.publishedAt && cursorPosition?.id) {
    values.push(cursorPosition.publishedAt);
    const pAtIdx = values.length;
    values.push(cursorPosition.id);
    const idIdx = values.length;
    where.push(`(j.published_at < $${pAtIdx} OR (j.published_at = $${pAtIdx} AND j.id < $${idIdx}))`);
  }

  values.push(limit);
  return {
    text: `SELECT j.id, j.title, j.slug, j.company_id, j.branch_id, j.department_id, j.team_id,
                  j.reference_code, j.employment_type, j.work_mode, j.experience_level, j.category,
                  j.location_city, j.location_state, j.location_country, j.location_remote,
                  j.salary_min, j.salary_max, j.salary_currency, j.salary_period, j.salary_visible,
                  j.description, j.responsibilities, j.requirements, j.preferred_qualifications,
                  j.benefits, j.vacancies, j.status, j.published_at, j.expires_at, j.is_featured,
                  j.is_urgent, j.is_confidential,
                  c.name AS company_name, c.logo_path AS company_logo_path, c.slug AS company_slug,
                  ts_rank_cd(j.search_vector, websearch_to_tsquery('english', $1)) AS score
           FROM public.jobs j
           JOIN public.companies c ON c.id = j.company_id
           WHERE ${where.join(' AND ')}
           ORDER BY j.published_at DESC, j.id DESC
           LIMIT $${values.length}`,
    values,
  };
}