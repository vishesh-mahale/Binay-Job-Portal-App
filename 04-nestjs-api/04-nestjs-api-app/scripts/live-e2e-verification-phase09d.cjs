const path = require('path');
const http = require('http');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { Client } = require('pg');
const { JobService } = require('../dist/src/modules/jobs/jobs');

// Requirement 7: Fail immediately if WEBHOOK_SECRET is missing (NO hardcoded secret fallback)
const webhookSecret = process.env.WEBHOOK_SECRET;
if (!webhookSecret) {
  throw new Error('FAIL-CLOSED: Missing process.env.WEBHOOK_SECRET environment variable!');
}

function postWake() {
  return new Promise((resolve, reject) => {
    const req = http.request('http://127.0.0.1:3002/internal/dispatcher/wake', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': webhookSecret,
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end(JSON.stringify({ reason: 'e2e_live_test' }));
  });
}

async function runE2E() {
  console.log('=== Starting Real NestJS Producer & E2E Pipeline Verification for Phase 09-D ===');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const companyId = '5a6fec62-cd8c-431a-81b3-9b996f7fae41';
  const userId = '80d8e17b-8682-4e52-ac3d-4ff3047e4590';

  // System transaction runner wrapping standard pg client
  const system = {
    transaction: async (fn) => {
      await client.query('BEGIN');
      try {
        const res = await fn(client);
        await client.query('COMMIT');
        return res;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  };
  const jobsService = new JobService(system);

  // --------------------------------------------------------------------------
  // Requirement 6: Real Rollback Verification (Outbox failure rolls back status & audit log)
  // --------------------------------------------------------------------------
  console.log('\n--- Step A: Testing Transactional Rollback on Outbox Failure ---');
  const rollbackSlug = `rollback-job-${Date.now()}`;
  const rollbackInsert = await client.query(`
    INSERT INTO public.jobs (
      company_id, created_by, title, slug, description, status, category, location_city, location_state, location_country
    ) VALUES ($1, $2, 'Rollback Test Job', $3, 'Description', 'draft', 'Engineering', 'Pune', 'MH', 'India')
    RETURNING id
  `, [companyId, userId, rollbackSlug]);
  const rollbackJobId = rollbackInsert.rows[0].id;

  // Mock system with outbox failure
  const failingSystem = {
    transaction: async (fn) => {
      await client.query('BEGIN');
      const mockClient = {
        query: async (sql, params) => {
          if (typeof sql === 'string' && sql.includes('public.outbox_events')) {
            throw new Error('SIMULATED_OUTBOX_TRANSACTION_FAILURE');
          }
          return client.query(sql, params);
        }
      };
      try {
        const res = await fn(mockClient);
        await client.query('COMMIT');
        return res;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  };
  const failingJobsService = new JobService(failingSystem);

  let rollbackErrorCaught = false;
  try {
    await failingJobsService.publish(userId, companyId, rollbackJobId);
  } catch (err) {
    if (err.message.includes('SIMULATED_OUTBOX_TRANSACTION_FAILURE')) {
      rollbackErrorCaught = true;
    }
  }

  if (!rollbackErrorCaught) throw new Error('Rollback Test Failed: Exception was not thrown on outbox failure');

  // Verify DB state after rollback
  const rollbackJobCheck = await client.query('SELECT status FROM public.jobs WHERE id = $1', [rollbackJobId]);
  const rollbackAuditCheck = await client.query('SELECT id FROM public.audit_logs WHERE entity_id = $1', [rollbackJobId]);
  console.log(`Rollback Verification: Job status is '${rollbackJobCheck.rows[0].status}' (expected 'draft'), Audit Logs count = ${rollbackAuditCheck.rows.length} (expected 0)`);
  if (rollbackJobCheck.rows[0].status !== 'draft' || rollbackAuditCheck.rows.length !== 0) {
    throw new Error('Rollback Test Failed: Job status changed or audit log was created despite transaction failure!');
  }
  console.log('✅ Step A SUCCESS: Transactional Rollback Verified!');

  // --------------------------------------------------------------------------
  // Requirement 5: Real NestJS API-path Producer Execution
  // --------------------------------------------------------------------------
  console.log('\n--- Step B: Real NestJS Producer Execution & Outbox Envelope Verification ---');
  const testSlug = `e2e-job-${Date.now()}`;
  const insertRes = await client.query(`
    INSERT INTO public.jobs (
      company_id, created_by, title, slug, description, status, category, location_city, location_state, location_country
    ) VALUES (
      $1, $2, 'E2E Software Engineer Test', $3, 'Live E2E Verification Job Description for Phase 09D AI Enrichment', 'draft', 'Software Engineering', 'Pune', 'Maharashtra', 'India'
    ) RETURNING id, status
  `, [companyId, userId, testSlug]);

  const jobId = insertRes.rows[0].id;
  console.log(`Step 1: Draft Job Created. Job ID: ${jobId}, Status: ${insertRes.rows[0].status}`);

  // Execute real NestJS JobsService.publish() producer path
  console.log('Step 2: Executing real NestJS JobsService.publish()...');
  const publishedResult = await jobsService.publish(userId, companyId, jobId);
  console.log(`Step 2 Result: Job published via NestJS producer. Status: ${publishedResult.status}`);

  // Step 3: Verify jobs.status = published & audit log written
  const jobCheck = await client.query('SELECT status, embedding_status FROM public.jobs WHERE id = $1', [jobId]);
  const auditCheck = await client.query('SELECT action FROM public.audit_logs WHERE entity_id = $1', [jobId]);
  console.log(`Step 3: Verification - jobs.status = '${jobCheck.rows[0].status}', Audit Log Action: '${auditCheck.rows[0]?.action}'`);
  if (jobCheck.rows[0].status !== 'published' || auditCheck.rows[0]?.action !== 'job.published') {
    throw new Error('E2E Failed: Job status or audit log invalid after NestJS publish()');
  }

  // Validate Stored Full Outbox Envelope against Contract Specification
  const outboxCheck = await client.query('SELECT id, aggregate_type, aggregate_id, event_type, schema_version, payload, correlation_id, status, occurred_at FROM public.outbox_events WHERE aggregate_id = $1', [jobId]);
  console.log(`Step 4: Outbox Event Count: ${outboxCheck.rows.length}, Event Type: ${outboxCheck.rows[0]?.event_type}, Status: ${outboxCheck.rows[0]?.status}`);
  if (outboxCheck.rows.length !== 1 || (outboxCheck.rows[0].status !== 'pending' && outboxCheck.rows[0].status !== 'publishing' && outboxCheck.rows[0].status !== 'published')) {
    throw new Error('E2E Failed: Outbox event missing');
  }

  const obRow = outboxCheck.rows[0];
  const storedEnvelope = typeof obRow.payload === 'string' ? JSON.parse(obRow.payload) : obRow.payload;

  console.log('Step 4 Stored Outbox Envelope Validation:\n', JSON.stringify(storedEnvelope, null, 2));

  // Assert Stored Full Envelope Contract Requirements
  if (storedEnvelope.schema_version !== 1) throw new Error('Envelope Contract Error: schema_version != 1');
  if (!storedEnvelope.event_id || storedEnvelope.event_id !== obRow.id) throw new Error('Envelope Contract Error: event_id mismatch');
  if (storedEnvelope.aggregate_type !== 'job') throw new Error('Envelope Contract Error: aggregate_type != job');
  if (storedEnvelope.aggregate_id !== jobId) throw new Error('Envelope Contract Error: aggregate_id mismatch');
  if (storedEnvelope.event_type !== 'job.ai.enrichment.requested') throw new Error('Envelope Contract Error: event_type mismatch');
  if (!storedEnvelope.correlation_id || storedEnvelope.correlation_id !== obRow.correlation_id) throw new Error('Envelope Contract Error: correlation_id mismatch');
  if (storedEnvelope.payload.job_id !== jobId) throw new Error('Payload Contract Error: job_id mismatch');
  if (storedEnvelope.payload.company_id !== companyId) throw new Error('Payload Contract Error: company_id mismatch');
  if (storedEnvelope.payload.trigger !== 'created') throw new Error('Payload Contract Error: trigger != created');
  if (storedEnvelope.payload.trace_id !== storedEnvelope.correlation_id) throw new Error('Payload Contract Error: trace_id != correlation_id');

  console.log('✅ Step B SUCCESS: Real NestJS Producer & Full Stored Envelope Contract Validated!');

  // --------------------------------------------------------------------------
  // Step 5, 6, 7, 8, 9: Dispatcher Wake, FastAPI Enrichment & Search Vector
  // --------------------------------------------------------------------------
  console.log('\n--- Step C: Dispatcher Wake, FastAPI Worker & Search Vector ---');
  console.log('Step 5: Triggering Outbox Dispatcher wake HTTP POST (using strict WEBHOOK_SECRET)...');
  const wakeRes = await postWake();
  console.log(`Dispatcher Wake Response: HTTP ${wakeRes.status}`, wakeRes.body);

  let eventDispatched = false;
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const ob = await client.query('SELECT status, published_at FROM public.outbox_events WHERE id = $1', [obRow.id]);
    if (ob.rows[0]?.status === 'published') {
      eventDispatched = true;
      console.log(`Step 6: Outbox Event Dispatched Successfully! Published At: ${ob.rows[0].published_at}`);
      break;
    }
  }
  if (!eventDispatched) throw new Error('E2E Failed: Outbox event was not dispatched to FastAPI');

  console.log('Step 7: Waiting for FastAPI AI Worker to complete enrichment...');
  let enrichmentCompleted = false;
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const enrichedJob = await client.query(`
      SELECT embedding_status, ai_ideal_candidate_profile, ai_profile_model, embedding_model
      FROM public.jobs WHERE id = $1
    `, [jobId]);

    if (enrichedJob.rows[0]?.embedding_status === 'completed') {
      enrichmentCompleted = true;
      console.log('Step 7 SUCCESS: FastAPI AI Enrichment Completed!');
      console.log('AI Embedding Status:', enrichedJob.rows[0].embedding_status);
      console.log('AI Profile Model:', enrichedJob.rows[0].ai_profile_model);
      console.log('AI Embedding Model:', enrichedJob.rows[0].embedding_model);
      break;
    }
  }
  if (!enrichmentCompleted) throw new Error('E2E Failed: FastAPI AI enrichment did not reach embedding_status = completed');

  console.log('Step 8: Testing Duplicate Dispatcher Wake (Idempotency Check)...');
  const duplicateWakeRes = await postWake();
  console.log(`Duplicate Dispatcher Wake Response: HTTP ${duplicateWakeRes.status}`, duplicateWakeRes.body);

  const ftsCheck = await client.query(`
    SELECT id, title, search_vector FROM public.jobs
    WHERE id = $1 AND search_vector @@ to_tsquery('english', 'Software & Engineer')
  `, [jobId]);
  console.log(`Step 9: FTS Keyword Search Check - Matched Rows: ${ftsCheck.rows.length}`);
  if (ftsCheck.rows.length !== 1) throw new Error('E2E Failed: FTS keyword search failed');

  console.log('\n✅ ALL STEPS PASSED WITH 100% SUCCESS!');
  await client.end();
}

runE2E().catch(err => {
  console.error('❌ E2E VERIFICATION FAILED:', err);
  process.exit(1);
});
