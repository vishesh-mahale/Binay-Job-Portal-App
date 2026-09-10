const fs = require('fs');
const { Client } = require('pg');
for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const q = async (n, t, p = []) => { const r = await c.query(t, p); console.log(`\n## ${n}\n` + JSON.stringify(r.rows, null, 2)); };

  // User
  await q('users_all', `SELECT * FROM users WHERE id = $1`, ['f0149de7-ff89-4184-977c-6de1bb071a3c']);

  // Candidate profile - all columns
  await q('profile_all', `SELECT * FROM candidate_profiles WHERE id = $1`, ['b15d064e-080b-4e79-97bb-5517cae382f5']);

  // All documents for this user
  await q('docs_all', `SELECT d.* FROM uploaded_documents d WHERE d.uploaded_by_user_id = $1 ORDER BY d.created_at`, ['f0149de7-ff89-4184-977c-6de1bb071a3c']);

  // Profile documents
  await q('cpd_all', `SELECT cpd.* FROM candidate_profile_documents cpd WHERE cpd.candidate_id = $1 ORDER BY cpd.linked_at`, ['b15d064e-080b-4e79-97bb-5517cae382f5']);

  // All parsing jobs
  await q('jobs_all', `SELECT j.* FROM resume_parsing_jobs j JOIN uploaded_documents d ON d.id = j.document_id WHERE d.uploaded_by_user_id = $1 ORDER BY j.created_at`, ['f0149de7-ff89-4184-977c-6de1bb071a3c']);

  // All parsed data
  await q('parsed_all', `SELECT p.id, p.parsing_job_id, p.document_id, LEFT(p.extracted_text, 500) as text_preview, p.normalized_output, p.confidence_details, p.validation_result, p.overall_confidence, p.schema_version, p.created_at FROM resume_parsed_data p JOIN resume_parsing_jobs j ON j.id = p.parsing_job_id JOIN uploaded_documents d ON d.id = j.document_id WHERE d.uploaded_by_user_id = $1 ORDER BY p.created_at`, ['f0149de7-ff89-4184-977c-6de1bb071a3c']);

  // All job events
  await q('events_all', `SELECT e.* FROM resume_parsing_job_events e JOIN resume_parsing_jobs j ON j.id = e.parsing_job_id JOIN uploaded_documents d ON d.id = j.document_id WHERE d.uploaded_by_user_id = $1 ORDER BY e.occurred_at`, ['f0149de7-ff89-4184-977c-6de1bb071a3c']);

  // Facts counts
  await q('facts_counts', `SELECT 'skills' AS kind, count(*)::int AS cnt FROM candidate_skills WHERE candidate_id = $1 UNION ALL SELECT 'experiences', count(*) FROM candidate_experiences WHERE candidate_id = $1 UNION ALL SELECT 'educations', count(*) FROM candidate_educations WHERE candidate_id = $1 UNION ALL SELECT 'certifications', count(*) FROM candidate_certifications WHERE candidate_id = $1 UNION ALL SELECT 'projects', count(*) FROM candidate_projects WHERE candidate_id = $1 UNION ALL SELECT 'languages', count(*) FROM candidate_languages WHERE candidate_id = $1`, ['b15d064e-080b-4e79-97bb-5517cae382f5']);

  // Search profile
  await q('search_profile', `SELECT * FROM candidate_search_profiles WHERE candidate_id = $1`, ['b15d064e-080b-4e79-97bb-5517cae382f5']);

  // analytics_events schema
  await q('analytics_cols', `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'analytics_events' AND table_schema = 'public' ORDER BY ordinal_position`);

  // users schema
  await q('users_cols', `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users' AND table_schema = 'public' ORDER BY ordinal_position`);

  await c.end();
})().catch(e => { console.error(e.stack); process.exitCode = 1; });
