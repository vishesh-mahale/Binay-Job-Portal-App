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

function makeRequest(options, postData = null, cookieHeader = null) {
  if (postData !== null && typeof postData === 'object') {
    postData = JSON.stringify(postData);
  }
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (postData) headers['Content-Length'] = Buffer.byteLength(postData);
    if (cookieHeader) headers['Cookie'] = cookieHeader;

    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: options.path,
      method: options.method,
      headers
    }, (res) => {
      let data = '';
      const setCookies = res.headers['set-cookie'] || [];
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let body = {};
        try { body = JSON.parse(data); } catch { body = data; }
        resolve({ statusCode: res.statusCode, body, setCookies, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function extractCookie(setCookieArray, name) {
  if (!Array.isArray(setCookieArray)) return null;
  for (const cookieStr of setCookieArray) {
    if (cookieStr.startsWith(`${name}=`)) {
      return cookieStr.split(';')[0];
    }
  }
  return null;
}

async function performPublicSignup(email, password, role) {
  await new Promise(resolve => setTimeout(resolve, 1500));
  let signupRes = await makeRequest(
    { path: '/api/v1/auth/signup', method: 'POST' },
    { email, password, register_as: role }
  );
  let attempts = 0;
  while (signupRes.statusCode === 429 && attempts < 10) {
    attempts++;
    console.warn(`⚠️ Supabase Auth rate limited (429) on signup for ${email}. Backoff 4s (Attempt ${attempts}/10)...`);
    await new Promise(resolve => setTimeout(resolve, 4000));
    signupRes = await makeRequest(
      { path: '/api/v1/auth/signup', method: 'POST' },
      { email, password, register_as: role }
    );
  }
  if (signupRes.statusCode !== 201 && signupRes.statusCode !== 200) {
    console.error(`❌ Public signup failed for ${email} with status ${signupRes.statusCode}:`, signupRes.body);
    throw new Error(`SIGNUP_FAILED_${signupRes.statusCode}`);
  }
  return signupRes;
}

async function runUnit3LiveHttpTest() {
  console.log("==================================================================");
  console.log("🚀 PHASE 09-D BOUNDED UNIT 3 LIVE HTTP INTEGRATION TEST SUITE");
  console.log("   (Job Lifecycle Actions: Pause, Resume, Close, Archive)");
  console.log("==================================================================");

  const dbClient = new Client({ connectionString: process.env.DATABASE_URL });
  await dbClient.connect();

  const testRunId = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const safeId = testRunId.replace(/_/g, '-');
  const ownerAEmail = `p09d_u3_ownera_${safeId}@collabfor.test`;
  const hrAEmail = `p09d_u3_hra_${safeId}@collabfor.test`;
  const ownerBEmail = `p09d_u3_ownerb_${safeId}@collabfor.test`;
  const hrBEmail = `p09d_u3_hrb_${safeId}@collabfor.test`;
  const candEmail = `p09d_u3_cand_${safeId}@collabfor.test`;
  const testPassword = "TestPass123!";

  let companyAId = null;
  let companyBId = null;
  let ownerACookies = null;
  let hrACookies = null;
  let hrBCookies = null;
  let candCookies = null;
  let jobA1Id = null;
  let jobB1Id = null;

  try {
    // 1. Signup Users
    console.log("\n[Setup] 1. Registering test users via POST /api/v1/auth/signup...");
    await performPublicSignup(ownerAEmail, testPassword, 'employer');
    await performPublicSignup(hrAEmail, testPassword, 'employer');
    await performPublicSignup(ownerBEmail, testPassword, 'employer');
    await performPublicSignup(hrBEmail, testPassword, 'employer');
    await performPublicSignup(candEmail, testPassword, 'candidate');

    // 2. Query User IDs & Update DB Status/Roles
    const userRes = await dbClient.query(`SELECT id, LOWER(email) as email FROM public.users WHERE LOWER(email) IN ($1, $2, $3, $4, $5)`, [ownerAEmail, hrAEmail, ownerBEmail, hrBEmail, candEmail]);
    const usersByEmail = {};
    for (const u of userRes.rows) usersByEmail[u.email] = u.id;

    const ownerAUserId = usersByEmail[ownerAEmail];
    const hrAUserId = usersByEmail[hrAEmail];
    const ownerBUserId = usersByEmail[ownerBEmail];
    const hrBUserId = usersByEmail[hrBEmail];
    const candUserId = usersByEmail[candEmail];

    await dbClient.query(`UPDATE public.users SET status = 'active' WHERE id IN ($1, $2, $3, $4, $5)`, [ownerAUserId, hrAUserId, ownerBUserId, hrBUserId, candUserId]);
    await dbClient.query(`UPDATE auth.users SET email_confirmed_at = NOW() WHERE id IN ($1, $2, $3, $4, $5)`, [ownerAUserId, hrAUserId, ownerBUserId, hrBUserId, candUserId]);
    await dbClient.query(`UPDATE public.users SET role = 'hr' WHERE id IN ($1, $2)`, [hrAUserId, hrBUserId]);

    // 3. Login to get cookies
    console.log("[Setup] 2. Authenticating actors via POST /api/v1/auth/login...");
    const ownerATokenRes = await makeRequest({ path: '/api/v1/auth/login', method: 'POST' }, { email: ownerAEmail, password: testPassword });
    ownerACookies = `${extractCookie(ownerATokenRes.setCookies, 'binay_access_token')}; ${extractCookie(ownerATokenRes.setCookies, 'binay_refresh_token')}`;

    const hrATokenRes = await makeRequest({ path: '/api/v1/auth/login', method: 'POST' }, { email: hrAEmail, password: testPassword });
    hrACookies = `${extractCookie(hrATokenRes.setCookies, 'binay_access_token')}; ${extractCookie(hrATokenRes.setCookies, 'binay_refresh_token')}`;

    const hrBTokenRes = await makeRequest({ path: '/api/v1/auth/login', method: 'POST' }, { email: hrBEmail, password: testPassword });
    hrBCookies = `${extractCookie(hrBTokenRes.setCookies, 'binay_access_token')}; ${extractCookie(hrBTokenRes.setCookies, 'binay_refresh_token')}`;

    const candTokenRes = await makeRequest({ path: '/api/v1/auth/login', method: 'POST' }, { email: candEmail, password: testPassword });
    candCookies = `${extractCookie(candTokenRes.setCookies, 'binay_access_token')}; ${extractCookie(candTokenRes.setCookies, 'binay_refresh_token')}`;

    // 4. Create Companies via HTTP API
    console.log("[Setup] 3. Creating Companies via POST /api/v1/companies...");
    const compARes = await makeRequest({ path: '/api/v1/companies', method: 'POST' }, { name: `Company A ${safeId}`, slug: `company-a-${safeId}`, email: `compa_${safeId}@collabfor.test`, industry: 'Technology', company_size: '11-50' }, ownerACookies);
    companyAId = compARes.body.data?.id || compARes.body.id;

    const compBRes = await makeRequest({ path: '/api/v1/companies', method: 'POST' }, { name: `Company B ${safeId}`, slug: `company-b-${safeId}`, email: `compb_${safeId}@collabfor.test`, industry: 'Technology', company_size: '11-50' }, hrBCookies);
    companyBId = compBRes.body.data?.id || compBRes.body.id;

    await dbClient.query(`UPDATE public.companies SET verification_status = 'verified' WHERE id IN ($1, $2)`, [companyAId, companyBId]);
    await dbClient.query(`INSERT INTO public.company_members (company_id, user_id, is_active, joined_at) VALUES ($1, $2, TRUE, NOW()) ON CONFLICT (company_id, user_id) DO UPDATE SET is_active = TRUE`, [companyAId, hrAUserId]);

    console.log("✅ Setup Complete. Running Unit 3 Gate Checks...\n");

    // Create and publish Job A1
    const draftA1Res = await makeRequest({ path: `/api/v1/companies/${companyAId}/jobs`, method: 'POST' }, { title: 'Backend Dev', slug: `backend-dev-${safeId}`, description: 'Lifecycle Test Job' }, hrACookies);
    if (draftA1Res.statusCode !== 201 && draftA1Res.statusCode !== 200) {
      console.error("Draft creation failed:", draftA1Res.statusCode, draftA1Res.body);
      throw new Error(`Draft A1 creation failed: ${draftA1Res.statusCode}`);
    }
    jobA1Id = draftA1Res.body.data?.id || draftA1Res.body?.id;
    await makeRequest({ path: `/api/v1/companies/${companyAId}/jobs/${jobA1Id}/publish`, method: 'POST' }, {}, hrACookies);

    // GATE 1: Pause published job (published -> paused)
    console.log("[Gate 1] Testing Pause Action (published -> paused)...");
    const pauseRes = await makeRequest({ path: `/api/v1/companies/${companyAId}/jobs/${jobA1Id}/pause`, method: 'POST' }, {}, hrACookies);
    const pauseData = pauseRes.body?.data || pauseRes.body;
    if (pauseRes.statusCode !== 201 && pauseRes.statusCode !== 200) throw new Error(`Pause failed with status: ${pauseRes.statusCode}`);
    if (pauseData?.status !== 'paused' || !pauseData?.paused_at) throw new Error(`Pause state mismatch: ${JSON.stringify(pauseRes.body)}`);
    console.log("  ✓ Pause call succeeded with status='paused' and paused_at timestamp set.");

    // GATE 2: Resume paused job (paused -> published)
    console.log("\n[Gate 2] Testing Resume Action (paused -> published)...");

    // Gate 2b: Temporary unverified company resume rejection -> HTTP 403
    await dbClient.query(`UPDATE public.companies SET verification_status = 'unverified' WHERE id = $1`, [companyAId]);
    const unverifiedResumeRes = await makeRequest({ path: `/api/v1/companies/${companyAId}/jobs/${jobA1Id}/resume`, method: 'POST' }, {}, hrACookies);
    if (unverifiedResumeRes.statusCode !== 403) throw new Error(`Expected HTTP 403 when resuming job on unverified company, got ${unverifiedResumeRes.statusCode}`);
    console.log("  ✓ Unverified company resume request returned HTTP 403 Forbidden as expected.");

    // Restore verification status to verified
    await dbClient.query(`UPDATE public.companies SET verification_status = 'verified' WHERE id = $1`, [companyAId]);

    const resumeRes = await makeRequest({ path: `/api/v1/companies/${companyAId}/jobs/${jobA1Id}/resume`, method: 'POST' }, {}, hrACookies);
    const resumeData = resumeRes.body?.data || resumeRes.body;
    if (resumeRes.statusCode !== 201 && resumeRes.statusCode !== 200) throw new Error(`Resume failed with status: ${resumeRes.statusCode}`);
    if (resumeData?.status !== 'published') throw new Error(`Resume state mismatch: ${JSON.stringify(resumeRes.body)}`);
    console.log("  ✓ Verified company resume call succeeded with status='published'.");

    // GATE 3: Close published job (published -> closed)
    console.log("\n[Gate 3] Testing Close Action (published -> closed)...");
    const closeRes = await makeRequest({ path: `/api/v1/companies/${companyAId}/jobs/${jobA1Id}/close`, method: 'POST' }, {}, hrACookies);
    const closeData = closeRes.body?.data || closeRes.body;
    if (closeRes.statusCode !== 201 && closeRes.statusCode !== 200) throw new Error(`Close failed with status: ${closeRes.statusCode}`);
    if (closeData?.status !== 'closed' || !closeData?.closed_at) throw new Error(`Close state mismatch: ${JSON.stringify(closeRes.body)}`);
    console.log("  ✓ Close call succeeded with status='closed' and closed_at timestamp set.");

    // GATE 4: Archive closed job (closed -> archived)
    console.log("\n[Gate 4] Testing Archive Action (closed -> archived)...");
    const archiveRes = await makeRequest({ path: `/api/v1/companies/${companyAId}/jobs/${jobA1Id}/archive`, method: 'POST' }, { reason: 'Position filled successfully' }, hrACookies);
    const archiveData = archiveRes.body?.data || archiveRes.body;
    if (archiveRes.statusCode !== 201 && archiveRes.statusCode !== 200) throw new Error(`Archive failed with status: ${archiveRes.statusCode}`);
    if (archiveData?.status !== 'archived') throw new Error(`Archive state mismatch: ${JSON.stringify(archiveRes.body)}`);
    console.log("  ✓ Archive call succeeded with status='archived'.");

    // GATE 5: Terminal State Protection (archived jobs cannot be modified or re-archived)
    console.log("\n[Gate 5] Testing Terminal State Protection on Archived Job...");
    const rePauseRes = await makeRequest({ path: `/api/v1/companies/${companyAId}/jobs/${jobA1Id}/pause`, method: 'POST' }, {}, hrACookies);
    if (rePauseRes.statusCode !== 404) throw new Error(`Expected HTTP 404 when pausing archived job, got ${rePauseRes.statusCode}`);

    const reResumeRes = await makeRequest({ path: `/api/v1/companies/${companyAId}/jobs/${jobA1Id}/resume`, method: 'POST' }, {}, hrACookies);
    if (reResumeRes.statusCode !== 404) throw new Error(`Expected HTTP 404 when resuming archived job, got ${reResumeRes.statusCode}`);

    const reCloseRes = await makeRequest({ path: `/api/v1/companies/${companyAId}/jobs/${jobA1Id}/close`, method: 'POST' }, {}, hrACookies);
    if (reCloseRes.statusCode !== 404) throw new Error(`Expected HTTP 404 when closing archived job, got ${reCloseRes.statusCode}`);

    const reArchiveRes = await makeRequest({ path: `/api/v1/companies/${companyAId}/jobs/${jobA1Id}/archive`, method: 'POST' }, {}, hrACookies);
    if (reArchiveRes.statusCode !== 404) throw new Error(`Expected HTTP 404 when re-archiving archived job, got ${reArchiveRes.statusCode}`);
    console.log("  ✓ All modification attempts on archived job correctly returned HTTP 404 Not Found.");

    // GATE 6: Authorization & Isolation Rejections
    console.log("\n[Gate 6] Testing Candidate & Cross-Company Authorization Rejections...");
    // Candidate attempt to pause/archive
    const candPauseRes = await makeRequest({ path: `/api/v1/companies/${companyAId}/jobs/${jobA1Id}/pause`, method: 'POST' }, {}, candCookies);
    if (candPauseRes.statusCode !== 403) throw new Error(`Expected HTTP 403 for candidate pause, got ${candPauseRes.statusCode}`);

    // HR B (Company B) attempt to access Company A job
    const crossPauseRes = await makeRequest({ path: `/api/v1/companies/${companyAId}/jobs/${jobA1Id}/pause`, method: 'POST' }, {}, hrBCookies);
    if (crossPauseRes.statusCode !== 403) throw new Error(`Expected HTTP 403 for cross-company pause, got ${crossPauseRes.statusCode}`);
    console.log("  ✓ Candidate and cross-company lifecycle calls correctly returned HTTP 403 Forbidden.");

    console.log("\n==================================================================");
    console.log("🎉 ALL BOUNDED UNIT 3 LIVE HTTP INTEGRATION TESTS PASSED (100%)");
    console.log("==================================================================");

  } catch (err) {
    console.error("\n❌ UNIT 3 LIVE HTTP INTEGRATION TEST FAILED:", err);
    process.exitCode = 1;
  } finally {
    console.log("\n[Cleanup] Removing temporary test entities from Database...");
    try {
      if (companyAId) await dbClient.query(`DELETE FROM public.companies WHERE id = $1`, [companyAId]);
      if (companyBId) await dbClient.query(`DELETE FROM public.companies WHERE id = $1`, [companyBId]);
      await dbClient.query(`UPDATE public.users SET status = 'suspended', deleted_at = NOW() WHERE email LIKE 'p09d_u3_%@collabfor.test'`);
      console.log("✓ Cleanup finished successfully.");
    } catch (cleanErr) {
      console.error("Cleanup error:", cleanErr);
    }
    await dbClient.end();
  }
}

runUnit3LiveHttpTest();
