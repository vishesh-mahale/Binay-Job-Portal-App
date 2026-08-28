export type RecruiterCandidateFilters = { query?: string; minExperience?: number; maxExperience?: number };

export function buildRecruiterCandidateSearch(companyId: string, recruiterUserId: string, filters: RecruiterCandidateFilters, limit: number) {
  if (!companyId || !recruiterUserId || !Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('VALIDATION_ERROR');
  const values: unknown[] = [companyId, recruiterUserId, filters.query?.trim() ?? ''];
  const where = [
    'cm.company_id = $1',
    'cm.user_id = $2',
    'cm.is_active = TRUE',
    'cm.left_at IS NULL',
    'cp.is_open_to_work = TRUE',
    'cp.deleted_at IS NULL',
  ];
  if (filters.query?.trim()) where.push("csp.search_vector @@ websearch_to_tsquery('english', $3)");
  if (filters.minExperience !== undefined) { values.push(filters.minExperience); where.push(`csp.total_experience_years >= $${values.length}`); }
  if (filters.maxExperience !== undefined) { values.push(filters.maxExperience); where.push(`csp.total_experience_years <= $${values.length}`); }
  values.push(limit);
  return {
    text: `SELECT csp.candidate_id, csp.professional_title, csp.skill_names, csp.locations,
                  csp.total_experience_years, csp.highest_education_level,
                  CASE WHEN csp.projection_revision < cp.profile_revision THEN 'stale' ELSE 'current' END AS projection_freshness,
                  ts_rank_cd(csp.search_vector, websearch_to_tsquery('english', $3)) AS score
           FROM public.company_members cm
           JOIN public.candidate_profiles cp ON TRUE
           JOIN public.candidate_search_profiles csp ON csp.candidate_id = cp.id
           WHERE ${where.join(' AND ')}
           ORDER BY score DESC NULLS LAST, csp.generated_at DESC, csp.candidate_id DESC
           LIMIT $${values.length}`,
    values,
  };
}
