/* Rollback-safe interview schema smoke test. Never run against production. */
require('dotenv').config();
const { Client } = require('pg');

if (process.env.RUN_INTERVIEW_INTEGRATION !== 'true') {
  console.log('SKIPPED: set RUN_INTERVIEW_INTEGRATION=true explicitly to run this Dev/Test smoke test');
  process.exit(0);
}
if (process.env.NODE_ENV === 'production') throw new Error('Refusing to run integration smoke test in production');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('BEGIN');
    const fixture = await client.query(`
      SELECT c.id AS company_id, j.id AS job_id, a.id AS application_id,
             i.id AS interviewer_id, cp.id AS candidate_id, i.user_id AS interviewer_user_id
      FROM public.companies c
      JOIN public.jobs j ON j.company_id=c.id AND j.deleted_at IS NULL
      JOIN public.job_applications a ON a.job_id=j.id AND a.is_guest=false
      JOIN public.candidate_profiles cp ON cp.id=a.candidate_id AND cp.deleted_at IS NULL
      JOIN public.interviewers i ON i.company_id=c.id AND i.is_active=true
      JOIN public.users it_user ON it_user.id=i.user_id AND it_user.status='active' AND it_user.deleted_at IS NULL
      LIMIT 1`);
    let f = fixture.rows[0];
    if (!f) {
      const users = await client.query(`SELECT id FROM public.users WHERE status='active' AND deleted_at IS NULL AND role='employer' LIMIT 1`);
      const candidate = await client.query(`SELECT cp.id AS candidate_id,cp.user_id AS candidate_user_id FROM public.candidate_profiles cp JOIN public.users u ON u.id=cp.user_id WHERE cp.deleted_at IS NULL AND u.status='active' AND u.deleted_at IS NULL LIMIT 1`);
      if (!users.rows[0] || !candidate.rows[0]) { console.log('SKIPPED: no active employer and candidate fixtures available'); await client.query('ROLLBACK'); return; }
      const company = await client.query(`INSERT INTO public.companies (name,slug,owner_id,email,verification_status) VALUES ('Integration Smoke Company',$1,$2,$3,'verified') RETURNING id`, [`integration-smoke-${Date.now()}`, users.rows[0].id, `smoke-${Date.now()}@example.invalid`]);
      await client.query(`INSERT INTO public.company_members (company_id,user_id,is_active,joined_at) VALUES ($1,$2,true,NOW())`, [company.rows[0].id, users.rows[0].id]);
      const job = await client.query(`INSERT INTO public.jobs (company_id,created_by,title,slug,description,status) VALUES ($1,$2,'Integration Smoke Job',$3,'Temporary rollback-only job','published') RETURNING id`, [company.rows[0].id, users.rows[0].id, `integration-smoke-job-${Date.now()}`]);
      const application = await client.query(`INSERT INTO public.job_applications (job_id,candidate_id,user_id,is_guest) VALUES ($1,$2,$3,false) RETURNING id`, [job.rows[0].id, candidate.rows[0].candidate_id, candidate.rows[0].candidate_user_id]);
      const interviewer = await client.query(`INSERT INTO public.interviewers (user_id,company_id,title,is_active) VALUES ($1,$2,'Smoke interviewer',true) RETURNING id,user_id`, [users.rows[0].id, company.rows[0].id]);
      f = { company_id: company.rows[0].id, job_id: job.rows[0].id, application_id: application.rows[0].id, interviewer_id: interviewer.rows[0].id, candidate_id: candidate.rows[0].candidate_id, interviewer_user_id: interviewer.rows[0].user_id };
    }
    const blockStart = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const blockEnd = new Date(blockStart.getTime() + 60 * 60 * 1000);
    const createdBlock = await client.query(`INSERT INTO public.interview_schedule_blocks (interviewer_id,job_id,start_time,end_time,slot_duration,timezone) VALUES ($1,$2,$3,$4,30,'UTC') RETURNING id,start_time,end_time`, [f.interviewer_id, f.job_id, blockStart.toISOString(), blockEnd.toISOString()]);
    const b = createdBlock.rows[0];
    const start = new Date(Math.max(Date.now() + 60 * 60 * 1000 + 60_000, new Date(b.start_time).getTime())).toISOString();
    const end = new Date(start).getTime() + 30 * 60 * 1000;
    if (end > new Date(b.end_time).getTime()) { console.log('SKIPPED: generated block is too short for 30-minute smoke interview'); await client.query('ROLLBACK'); return; }
    const booked = await client.query(`UPDATE public.interview_schedule_blocks SET is_booked=true, application_id=$1, job_id=$2, booked_by=$3, booked_at=NOW(), locked_by=NULL, locked_until=NULL WHERE id=$4 AND is_booked=false RETURNING id`, [f.application_id, f.job_id, f.interviewer_user_id, b.id]);
    if (booked.rowCount !== 1) throw new Error('fixture block could not be booked');
    const interview = await client.query(`INSERT INTO public.interviews (application_id,job_id,candidate_id,schedule_block_id,title,type,round,scheduled_at,duration_minutes,timezone,status) VALUES ($1,$2,$3,$4,'Integration smoke','technical_assessment',1,$5,30,'UTC','scheduled') RETURNING id`, [f.application_id, f.job_id, f.candidate_id, b.id, start]);
    await client.query(`INSERT INTO public.interview_participants (interview_id,user_id,role,is_primary) VALUES ($1,$2,'interviewer',true)`, [interview.rows[0].id, f.interviewer_user_id]);
    const check = await client.query(`SELECT i.id,i.status,i.type,i.candidate_id,i.scheduled_at,i.duration_minutes,b.is_booked,b.start_time,b.end_time,b.application_id,p.user_id,p.role,p.is_primary FROM public.interviews i JOIN public.interview_schedule_blocks b ON b.id=i.schedule_block_id JOIN public.interview_participants p ON p.interview_id=i.id WHERE i.id=$1`, [interview.rows[0].id]);
    const c = check.rows[0];
    if (!c || !c.is_booked || c.status !== 'scheduled' || c.type !== 'technical_assessment' || String(c.application_id) !== String(f.application_id) || String(c.candidate_id) !== String(f.candidate_id) || String(c.user_id) !== String(f.interviewer_user_id) || c.role !== 'interviewer' || !c.is_primary || new Date(c.scheduled_at).getTime() < new Date(c.start_time).getTime() || new Date(c.scheduled_at).getTime() + Number(c.duration_minutes) * 60000 > new Date(c.end_time).getTime()) throw new Error('post-insert invariant failed');
    const confirmed = await client.query(`UPDATE public.interviews SET status='confirmed', is_candidate_confirmed=true, candidate_confirmed_at=NOW() WHERE id=$1 RETURNING status,is_candidate_confirmed,candidate_confirmed_at`, [interview.rows[0].id]);
    if (confirmed.rows[0]?.status !== 'confirmed' || !confirmed.rows[0]?.is_candidate_confirmed || !confirmed.rows[0]?.candidate_confirmed_at) throw new Error('confirmation invariant failed');
    const secondBlock = await client.query(`INSERT INTO public.interview_schedule_blocks (interviewer_id,job_id,start_time,end_time,slot_duration,timezone) VALUES ($1,$2,$3,$4,30,'UTC') RETURNING id,start_time,end_time`, [f.interviewer_id, f.job_id, new Date(blockEnd.getTime() + 2 * 60 * 60 * 1000).toISOString(), new Date(blockEnd.getTime() + 3 * 60 * 60 * 1000).toISOString()]);
    const nb = secondBlock.rows[0];
    await client.query(`UPDATE public.interview_schedule_blocks SET is_booked=true, application_id=$1, job_id=$2, booked_by=$3, booked_at=NOW(), locked_by=NULL, locked_until=NULL WHERE id=$4`, [f.application_id, f.job_id, f.interviewer_user_id, nb.id]);
    await client.query(`UPDATE public.interviews SET status='rescheduled', schedule_block_id=NULL WHERE id=$1`, [interview.rows[0].id]);
    const linked = await client.query(`INSERT INTO public.interviews (application_id,job_id,candidate_id,schedule_block_id,title,type,round,scheduled_at,duration_minutes,timezone,status,rescheduled_from,reschedule_count) VALUES ($1,$2,$3,$4,'Integration smoke','technical_assessment',1,$5,30,'UTC','scheduled',$6,1) RETURNING id,rescheduled_from`, [f.application_id, f.job_id, f.candidate_id, nb.id, new Date(blockEnd.getTime() + 2 * 60 * 60 * 1000 + 60_000).toISOString(), interview.rows[0].id]);
    if (String(linked.rows[0]?.rescheduled_from) !== String(interview.rows[0].id)) throw new Error('reschedule lineage invariant failed');
    console.log('PASS: insert, booking, participant, confirmation and reschedule lineage invariants verified');
    await client.query('ROLLBACK');
    console.log('PASS: transaction rolled back; no test rows retained');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { await client.end(); }
}
main().catch((error) => { console.error(`BLOCKED: ${error.message}`); process.exitCode = 1; });
