const http = require('http');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Read .env file from 04-nestjs-api-app directory
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  for (const line of envConfig.split('\n')) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      if (!process.env[match[1]]) process.env[match[1]] = value.trim();
    }
  }
}

function makeRequest(options, postData = null) {
  if (postData !== null && typeof postData === 'object') {
    postData = JSON.stringify(postData);
  }
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (postData) headers['Content-Length'] = Buffer.byteLength(postData);

    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: options.path,
      method: options.method || 'GET',
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let body = {};
        try { body = JSON.parse(data); } catch { body = data; }
        resolve({ statusCode: res.statusCode, body, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runUnit4LiveHttpTest() {
  console.log("==================================================================");
  console.log("🚀 PHASE 09-D BOUNDED UNIT 4 LIVE HTTP INTEGRATION TEST SUITE");
  console.log("   (Public Job Search & Listing Backend)");
  console.log("==================================================================");

  const dbClient = new Client({ connectionString: process.env.DATABASE_URL });
  await dbClient.connect();

  const testRunId = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const safeId = testRunId.replace(/_/g, '-');
  const compASlug = `comp-u4-a-${safeId}`;
  const compBSlug = `comp-u4-b-${safeId}`;
  const compCSlug = `comp-u4-c-${safeId}`;

  let compAId, compBId, compCId;
  let jobA1Id, jobA2Id, jobA3Id, jobA4Id, jobA5Id, jobA6Id, jobA7Id, jobB1Id, jobC1Id;

  try {
    // 1. Create synthetic user to set owner_id and created_by
    const userRes = await dbClient.query(`
      INSERT INTO public.users (id, email, first_name, last_name, role, status)
      VALUES (gen_random_uuid(), $1, 'Unit4', 'TestUser', 'employer', 'active')
      RETURNING id
    `, [`user_u4_${safeId}@collabfor.test`]);
    const userId = userRes.rows[0].id;

    // Setup Company A (Verified), Company B (Unverified), Company C (Verified)
    const compARes = await dbClient.query(`
      INSERT INTO public.companies (name, slug, email, verification_status, owner_id)
      VALUES ($1, $2, $3, 'verified', $4)
      RETURNING id
    `, [`Company Verified A ${safeId}`, compASlug, `comp_u4_a_${safeId}@collabfor.test`, userId]);
    compAId = compARes.rows[0].id;

    const compBRes = await dbClient.query(`
      INSERT INTO public.companies (name, slug, email, verification_status, owner_id)
      VALUES ($1, $2, $3, 'unverified', $4)
      RETURNING id
    `, [`Company Unverified B ${safeId}`, compBSlug, `comp_u4_b_${safeId}@collabfor.test`, userId]);
    compBId = compBRes.rows[0].id;

    const compCRes = await dbClient.query(`
      INSERT INTO public.companies (name, slug, email, verification_status, owner_id)
      VALUES ($1, $2, $3, 'verified', $4)
      RETURNING id
    `, [`Company Verified C ${safeId}`, compCSlug, `comp_u4_c_${safeId}@collabfor.test`, userId]);
    compCId = compCRes.rows[0].id;

    // 2. Setup Jobs under Company A (Verified)
    // Job A1: Published, Public, Remote, Full-time (shares slug with C1)
    const sharedSlug = `common-slug-${safeId}`;
    const jA1 = await dbClient.query(`
      INSERT INTO public.jobs (company_id, created_by, published_by, title, slug, description, status, published_at, work_mode, employment_type, is_confidential)
      VALUES ($1, $2, $2, 'Senior Backend Dev', $3, 'Public job desc', 'published', NOW(), 'remote', 'full_time', false)
      RETURNING id
    `, [compAId, userId, sharedSlug]);
    jobA1Id = jA1.rows[0].id;

    // Job C1 under Company C (Verified) - Same slug as A1
    const jC1 = await dbClient.query(`
      INSERT INTO public.jobs (company_id, created_by, published_by, title, slug, description, status, published_at, work_mode, employment_type, is_confidential)
      VALUES ($1, $2, $2, 'Another Backend Dev', $3, 'Company C public job desc', 'published', NOW(), 'remote', 'full_time', false)
      RETURNING id
    `, [compCId, userId, sharedSlug]);
    jobC1Id = jC1.rows[0].id;

    // Job A2: Published, Confidential
    const jA2 = await dbClient.query(`
      INSERT INTO public.jobs (company_id, created_by, published_by, title, slug, description, status, published_at, work_mode, employment_type, is_confidential)
      VALUES ($1, $2, $2, 'Stealth Team Lead', $3, 'Confidential job desc', 'published', NOW(), 'hybrid', 'full_time', true)
      RETURNING id
    `, [compAId, userId, `stealth-lead-${safeId}`]);
    jobA2Id = jA2.rows[0].id;

    // Job A3: Draft
    const jA3 = await dbClient.query(`
      INSERT INTO public.jobs (company_id, created_by, title, slug, description, status)
      VALUES ($1, $2, 'Draft Engineer', $3, 'Draft job desc', 'draft')
      RETURNING id
    `, [compAId, userId, `draft-eng-${safeId}`]);
    jobA3Id = jA3.rows[0].id;

    // Job A4: Paused
    const jA4 = await dbClient.query(`
      INSERT INTO public.jobs (company_id, created_by, published_by, title, slug, description, status, published_at, paused_at)
      VALUES ($1, $2, $2, 'Paused Engineer', $3, 'Paused job desc', 'paused', NOW(), NOW())
      RETURNING id
    `, [compAId, userId, `paused-eng-${safeId}`]);
    jobA4Id = jA4.rows[0].id;

    // Job A5: Closed
    const jA5 = await dbClient.query(`
      INSERT INTO public.jobs (company_id, created_by, published_by, title, slug, description, status, published_at, closed_at)
      VALUES ($1, $2, $2, 'Closed Engineer', $3, 'Closed job desc', 'closed', NOW(), NOW())
      RETURNING id
    `, [compAId, userId, `closed-eng-${safeId}`]);
    jobA5Id = jA5.rows[0].id;

    // Job A6: Archived
    const jA6 = await dbClient.query(`
      INSERT INTO public.jobs (company_id, created_by, published_by, title, slug, description, status, published_at, closed_at)
      VALUES ($1, $2, $2, 'Archived Engineer', $3, 'Archived job desc', 'archived', NOW(), NOW())
      RETURNING id
    `, [compAId, userId, `archived-eng-${safeId}`]);
    jobA6Id = jA6.rows[0].id;

    // Job A7: Expired
    const jA7 = await dbClient.query(`
      INSERT INTO public.jobs (company_id, created_by, published_by, title, slug, description, status, created_at, published_at, expires_at)
      VALUES ($1, $2, $2, 'Expired Engineer', $3, 'Expired job desc', 'published', NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day')
      RETURNING id
    `, [compAId, userId, `expired-eng-${safeId}`]);
    jobA7Id = jA7.rows[0].id;

    // 3. Setup Job under Company B (Unverified)
    const jB1 = await dbClient.query(`
      INSERT INTO public.jobs (company_id, created_by, published_by, title, slug, description, status, published_at)
      VALUES ($1, $2, $2, 'Unverified Company Job', $3, 'Unverified company job desc', 'published', NOW())
      RETURNING id
    `, [compBId, userId, `unverified-comp-job-${safeId}`]);
    jobB1Id = jB1.rows[0].id;

    console.log("✅ Synthetic test data setup complete.");

    // TEST 1: Unauthenticated GET /api/v1/jobs (Public listing)
    console.log("\n[TEST 1] Testing unauthenticated GET /api/v1/jobs (Public List & Filters)");
    const listRes = await makeRequest({ path: '/api/v1/jobs?limit=50', method: 'GET' });
    if (listRes.statusCode !== 200 || !Array.isArray(listRes.body.items)) {
      throw new Error(`Public listing failed with status ${listRes.statusCode}`);
    }

    const items = listRes.body.items;
    const foundA1 = items.find(j => j.id === jobA1Id);
    const foundA2 = items.find(j => j.id === jobA2Id);
    const foundC1 = items.find(j => j.id === jobC1Id);
    const foundA3 = items.find(j => j.id === jobA3Id);
    const foundA4 = items.find(j => j.id === jobA4Id);
    const foundA5 = items.find(j => j.id === jobA5Id);
    const foundA6 = items.find(j => j.id === jobA6Id);
    const foundA7 = items.find(j => j.id === jobA7Id);
    const foundB1 = items.find(j => j.id === jobB1Id);

    if (!foundA1 || !foundC1) throw new Error("TEST 1 FAILED: Published job A1 or C1 missing from public search");
    if (!foundA2) throw new Error("TEST 1 FAILED: Published confidential job A2 missing from public search");
    if (foundA3) throw new Error("TEST 1 FAILED: Draft job A3 leaked in public search");
    if (foundA4) throw new Error("TEST 1 FAILED: Paused job A4 leaked in public search");
    if (foundA5) throw new Error("TEST 1 FAILED: Closed job A5 leaked in public search");
    if (foundA6) throw new Error("TEST 1 FAILED: Archived job A6 leaked in public search");
    if (foundA7) throw new Error("TEST 1 FAILED: Expired job A7 leaked in public search");
    if (foundB1) throw new Error("TEST 1 FAILED: Unverified company job B1 leaked in public search");

    console.log("   ✔ Published verified jobs present");
    console.log("   ✔ Draft, paused, closed, archived, expired, & unverified company jobs strictly excluded");

    // TEST 2: Confidential Job Masking Verification
    console.log("\n[TEST 2] Verifying confidential job masking (is_confidential = true)");
    if (foundA2.company_name !== 'Confidential Employer') {
      throw new Error(`TEST 2 FAILED: Expected company_name 'Confidential Employer', got '${foundA2.company_name}'`);
    }
    if (foundA2.company_logo_path !== null || foundA2.company_id !== null || foundA2.company_slug !== null) {
      throw new Error("TEST 2 FAILED: Confidential job leaked company_logo_path, company_id, or company_slug");
    }
    console.log("   ✔ Confidential employer details masked (company_name: 'Confidential Employer', logo/id/slug: null)");

    // TEST 3: Query Filter & Cursor Pagination Verification
    console.log("\n[TEST 3] Testing search filter & cursor pagination");
    const filterRes = await makeRequest({ path: '/api/v1/jobs?work_mode=remote&limit=50', method: 'GET' });
    if (filterRes.statusCode !== 200 || !Array.isArray(filterRes.body.items)) {
      throw new Error(`Filtered search failed with status ${filterRes.statusCode}`);
    }
    const remoteItems = filterRes.body.items;
    const remoteA1 = remoteItems.find(j => j.id === jobA1Id);
    const remoteA2 = remoteItems.find(j => j.id === jobA2Id);
    if (!remoteA1 || remoteA2) {
      throw new Error("TEST 3 FAILED: Filter by work_mode=remote failed");
    }
    console.log("   ✔ work_mode=remote filter correctly filtered results");

    // Cursor validation: invalid cursor returns HTTP 400 INVALID_CURSOR
    const invalidCursorRes = await makeRequest({ path: '/api/v1/jobs?cursor=bad.token.signature', method: 'GET' });
    if (invalidCursorRes.statusCode !== 400 || !JSON.stringify(invalidCursorRes.body).includes('INVALID_CURSOR')) {
      throw new Error(`Invalid cursor expected status 400 INVALID_CURSOR, got ${invalidCursorRes.statusCode}`);
    }
    console.log("   ✔ Invalid cursor token rejected with 400 INVALID_CURSOR");

    // Pagination cursor generation and page-1/page-2 non-overlap test (limit = 1)
    const page1Res = await makeRequest({ path: '/api/v1/jobs?limit=1', method: 'GET' });
    if (page1Res.statusCode !== 200 || !page1Res.body.next_cursor || page1Res.body.items.length !== 1) {
      throw new Error("Page 1 with limit=1 expected items[0] and next_cursor string");
    }
    const page1JobId = page1Res.body.items[0].id;

    // Fetch page 2 using page 1's next_cursor
    const page2Res = await makeRequest({ path: `/api/v1/jobs?limit=1&cursor=${encodeURIComponent(page1Res.body.next_cursor)}`, method: 'GET' });
    if (page2Res.statusCode !== 200 || page2Res.body.items.length !== 1) {
      throw new Error("Page 2 with valid cursor expected 200 OK and items[0]");
    }
    const page2JobId = page2Res.body.items[0].id;
    if (page1JobId === page2JobId) {
      throw new Error(`TEST 3 FAILED: Page 1 and Page 2 returned overlapping job ID '${page1JobId}'! Cursor filtering failed.`);
    }
    console.log("   ✔ Pagination next_cursor generated and Page 2 correctly skipped Page 1 record (zero overlap)");

    // Keyword search pagination test with 'q=Backend' (verifying zero overlap with text search query)
    const qPage1Res = await makeRequest({ path: '/api/v1/jobs?q=Backend&limit=1', method: 'GET' });
    if (qPage1Res.statusCode !== 200 || !qPage1Res.body.next_cursor || qPage1Res.body.items.length !== 1) {
      throw new Error("q=Backend Page 1 expected items[0] and next_cursor");
    }
    const qPage1JobId = qPage1Res.body.items[0].id;
    const qPage2Res = await makeRequest({ path: `/api/v1/jobs?q=Backend&limit=1&cursor=${encodeURIComponent(qPage1Res.body.next_cursor)}`, method: 'GET' });
    if (qPage2Res.statusCode !== 200 || qPage2Res.body.items.length !== 1) {
      throw new Error("q=Backend Page 2 expected 200 OK and items[0]");
    }
    const qPage2JobId = qPage2Res.body.items[0].id;
    if (qPage1JobId === qPage2JobId) {
      throw new Error(`TEST 3 FAILED: Keyword search 'q=Backend' Page 1 and Page 2 returned overlapping job ID '${qPage1JobId}'!`);
    }
    console.log("   ✔ Keyword search (q=Backend) Page 1 & Page 2 zero-overlap pagination verified");

    // Using page-1 cursor with modified filters returns 400 INVALID_CURSOR
    const filterMismatchRes = await makeRequest({ path: `/api/v1/jobs?work_mode=remote&cursor=${encodeURIComponent(page1Res.body.next_cursor)}`, method: 'GET' });
    if (filterMismatchRes.statusCode !== 400 || !JSON.stringify(filterMismatchRes.body).includes('INVALID_CURSOR')) {
      throw new Error(`Filter mismatch cursor expected 400 INVALID_CURSOR, got ${filterMismatchRes.statusCode}`);
    }
    console.log("   ✔ Cursor with modified search filters rejected with 400 INVALID_CURSOR");

    // TEST 4: Single Job Lookup GET /api/v1/jobs/:id
    console.log("\n[TEST 4] Testing GET /api/v1/jobs/:id (UUID single lookup)");
    const getA1 = await makeRequest({ path: `/api/v1/jobs/${jobA1Id}`, method: 'GET' });
    if (getA1.statusCode !== 200 || getA1.body.id !== jobA1Id) {
      throw new Error(`GET /api/v1/jobs/${jobA1Id} failed with status ${getA1.statusCode}`);
    }
    console.log("   ✔ Published job A1 retrieved by UUID -> 200 OK");

    const getA3 = await makeRequest({ path: `/api/v1/jobs/${jobA3Id}`, method: 'GET' });
    if (getA3.statusCode !== 404) throw new Error(`Draft job expected 404, got ${getA3.statusCode}`);
    console.log("   ✔ Draft job A1 -> 404 NOT_FOUND");

    const getA4 = await makeRequest({ path: `/api/v1/jobs/${jobA4Id}`, method: 'GET' });
    if (getA4.statusCode !== 404) throw new Error(`Paused job expected 404, got ${getA4.statusCode}`);
    console.log("   ✔ Paused job A4 -> 404 NOT_FOUND");

    const getA7 = await makeRequest({ path: `/api/v1/jobs/${jobA7Id}`, method: 'GET' });
    if (getA7.statusCode !== 404) throw new Error(`Expired job expected 404, got ${getA7.statusCode}`);
    console.log("   ✔ Expired job A7 -> 404 NOT_FOUND");

    const getB1 = await makeRequest({ path: `/api/v1/jobs/${jobB1Id}`, method: 'GET' });
    if (getB1.statusCode !== 404) throw new Error(`Unverified company job expected 404, got ${getB1.statusCode}`);
    console.log("   ✔ Unverified company job B1 -> 404 NOT_FOUND");

    // TEST 5: Global Slug Lookup & AMBIGUOUS_SLUG Protection
    console.log("\n[TEST 5] Testing GET /api/v1/jobs/slug/:slug (Global Slug & AMBIGUOUS_SLUG Guard)");
    // Unique stealth-lead slug -> 200 OK
    const uniqueSlugRes = await makeRequest({ path: `/api/v1/jobs/slug/stealth-lead-${safeId}`, method: 'GET' });
    if (uniqueSlugRes.statusCode !== 200 || uniqueSlugRes.body.id !== jobA2Id) {
      throw new Error(`Unique stealth lead slug lookup failed with status ${uniqueSlugRes.statusCode}`);
    }
    console.log("   ✔ Unique global slug lookup -> 200 OK");

    // Shared slug across Company A and Company C -> HTTP 400 AMBIGUOUS_SLUG
    const ambiguousSlugRes = await makeRequest({ path: `/api/v1/jobs/slug/${sharedSlug}`, method: 'GET' });
    if (ambiguousSlugRes.statusCode !== 400 || !JSON.stringify(ambiguousSlugRes.body).includes('AMBIGUOUS_SLUG')) {
      throw new Error(`Duplicate slug across verified companies expected 400 AMBIGUOUS_SLUG, got status ${ambiguousSlugRes.statusCode}`);
    }
    console.log("   ✔ Ambiguous slug across multiple companies rejected with 400 AMBIGUOUS_SLUG");

    // TEST 6: Company-Scoped Public Job Lookup GET /api/v1/companies/:companySlugOrId/jobs/public/:jobSlug
    console.log("\n[TEST 6] Testing GET /api/v1/companies/:companySlugOrId/jobs/public/:jobSlug");
    const compASlugRes = await makeRequest({ path: `/api/v1/companies/${compASlug}/jobs/public/${sharedSlug}`, method: 'GET' });
    if (compASlugRes.statusCode !== 200 || compASlugRes.body.id !== jobA1Id) {
      throw new Error(`Company A scoped slug lookup failed with status ${compASlugRes.statusCode}`);
    }
    console.log("   ✔ Company A scoped slug lookup -> 200 OK (Job A1)");

    const compCSlugRes = await makeRequest({ path: `/api/v1/companies/${compCSlug}/jobs/public/${sharedSlug}`, method: 'GET' });
    if (compCSlugRes.statusCode !== 200 || compCSlugRes.body.id !== jobC1Id) {
      throw new Error(`Company C scoped slug lookup failed with status ${compCSlugRes.statusCode}`);
    }
    console.log("   ✔ Company C scoped slug lookup -> 200 OK (Job C1)");

    const compBJobRes = await makeRequest({ path: `/api/v1/companies/${compBSlug}/jobs/public/unverified-comp-job-${safeId}`, method: 'GET' });
    if (compBJobRes.statusCode !== 404) {
      throw new Error(`Unverified company slug lookup expected 404, got ${compBJobRes.statusCode}`);
    }
    console.log("   ✔ Unverified company slug lookup -> 404 NOT_FOUND");

    console.log("\n==================================================================");
    console.log("🎉 ALL BOUNDED UNIT 4 LIVE HTTP INTEGRATION TESTS PASSED 100%");
    console.log("==================================================================");

  } catch (error) {
    console.error("\n❌ LIVE INTEGRATION TEST FAILED:", error);
    process.exitCode = 1;
  } finally {
    console.log("\n🧹 Cleaning up synthetic test data...");
    try {
      if (compAId || compBId || compCId) {
        await dbClient.query(`DELETE FROM public.jobs WHERE company_id IN ($1, $2, $3)`, [compAId, compBId, compCId]);
        await dbClient.query(`DELETE FROM public.companies WHERE id IN ($1, $2, $3)`, [compAId, compBId, compCId]);
      }
      await dbClient.query(`UPDATE public.users SET deleted_at = NOW() WHERE email LIKE $1`, [`%${safeId}%`]);
      console.log("✔ Cleanup complete.");
    } catch (e) {
      console.error("Cleanup error:", e);
    }
    await dbClient.end();
  }
}

runUnit4LiveHttpTest();
