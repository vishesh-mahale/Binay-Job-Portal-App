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

async function runLiveHttpTest() {
  console.log("==================================================================");
  console.log("🚀 PHASE 09-D BOUNDED UNIT 2 LIVE HTTP INTEGRATION TEST SUITE");
  console.log("   (Real HTTP Requests against NestJS API on localhost:3000)");
  console.log("==================================================================");

  const dbClient = new Client({ connectionString: process.env.DATABASE_URL });
  await dbClient.connect();

  const testRunId = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const safeId = testRunId.replace(/_/g, '-');
  const ownerAEmail = `p09d_ownera_${testRunId}@collabfor.test`;
  const hrAEmail = `p09d_hra_${testRunId}@collabfor.test`;
  const ownerBEmail = `p09d_ownerb_${testRunId}@collabfor.test`;
  const hrBEmail = `p09d_hrb_${testRunId}@collabfor.test`;
  const adminEmail = `p09d_admin_${testRunId}@collabfor.test`;
  const testPassword = "TestPass123!";

  let companyAId = null;
  let companyBId = null;
  let ownerACookies = null;
  let hrACookies = null;
  let ownerBCookies = null;
  let hrBCookies = null;
  let adminCookies = null;
  let jobBId = null;
  let jobA1Id = null;
  let jobA2Id = null;
  let jobA3Id = null;

  try {
    // 1. Create test users via HTTP Signup
    console.log("\n[Setup] 1. Registering test users via POST /api/v1/auth/signup...");
    
    await performPublicSignup(ownerAEmail, testPassword, 'employer');
    await performPublicSignup(hrAEmail, testPassword, 'employer');
    await performPublicSignup(ownerBEmail, testPassword, 'employer');
    await performPublicSignup(hrBEmail, testPassword, 'employer');
    await performPublicSignup(adminEmail, testPassword, 'employer');

    // 2. Fetch User IDs from DB & set active status
    const userRes = await dbClient.query(`SELECT id, LOWER(email) as email FROM public.users WHERE LOWER(email) IN ($1, $2, $3, $4, $5)`, [ownerAEmail, hrAEmail, ownerBEmail, hrBEmail, adminEmail]);
    const usersByEmail = {};
    for (const u of userRes.rows) usersByEmail[u.email] = u.id;
    console.log("Debug usersByEmail:", usersByEmail);

    const ownerAUserId = usersByEmail[ownerAEmail];
    const hrAUserId = usersByEmail[hrAEmail];
    const ownerBUserId = usersByEmail[ownerBEmail];
    const hrBUserId = usersByEmail[hrBEmail];
    const adminUserId = usersByEmail[adminEmail];

    await dbClient.query(`UPDATE public.users SET status = 'active' WHERE id IN ($1, $2, $3, $4, $5)`, [ownerAUserId, hrAUserId, ownerBUserId, hrBUserId, adminUserId]);
    await dbClient.query(`UPDATE auth.users SET email_confirmed_at = NOW() WHERE id IN ($1, $2, $3, $4, $5)`, [ownerAUserId, hrAUserId, ownerBUserId, hrBUserId, adminUserId]);
    await dbClient.query(`UPDATE public.users SET role = 'hr' WHERE id IN ($1, $2)`, [hrAUserId, hrBUserId]);
    await dbClient.query(`UPDATE public.users SET role = 'admin' WHERE id = $1`, [adminUserId]);

    // 3. Authenticate to get cookies
    console.log("[Setup] 2. Authenticating actors via POST /api/v1/auth/token...");
    const ownerATokenRes = await makeRequest({ path: '/api/v1/auth/login', method: 'POST' }, { email: ownerAEmail, password: testPassword });
    const ownerAcc = extractCookie(ownerATokenRes.setCookies, 'binay_access_token');
    const ownerRef = extractCookie(ownerATokenRes.setCookies, 'binay_refresh_token');
    ownerACookies = `${ownerAcc}; ${ownerRef}`;
    if (!ownerAcc) console.warn("ownerATokenRes setCookies:", ownerATokenRes.statusCode, ownerATokenRes.setCookies, ownerATokenRes.body);

    const hrATokenRes = await makeRequest({ path: '/api/v1/auth/login', method: 'POST' }, { email: hrAEmail, password: testPassword });
    hrACookies = `${extractCookie(hrATokenRes.setCookies, 'binay_access_token')}; ${extractCookie(hrATokenRes.setCookies, 'binay_refresh_token')}`;

    const ownerBTokenRes = await makeRequest({ path: '/api/v1/auth/login', method: 'POST' }, { email: ownerBEmail, password: testPassword });
    ownerBCookies = `${extractCookie(ownerBTokenRes.setCookies, 'binay_access_token')}; ${extractCookie(ownerBTokenRes.setCookies, 'binay_refresh_token')}`;

    const hrBTokenRes = await makeRequest({ path: '/api/v1/auth/login', method: 'POST' }, { email: hrBEmail, password: testPassword });
    hrBCookies = `${extractCookie(hrBTokenRes.setCookies, 'binay_access_token')}; ${extractCookie(hrBTokenRes.setCookies, 'binay_refresh_token')}`;

    const adminTokenRes = await makeRequest({ path: '/api/v1/auth/login', method: 'POST' }, { email: adminEmail, password: testPassword });
    adminCookies = `${extractCookie(adminTokenRes.setCookies, 'binay_access_token')}; ${extractCookie(adminTokenRes.setCookies, 'binay_refresh_token')}`;

    // 4. Create Companies via HTTP API POST /api/v1/companies
    console.log("[Setup] 3. Creating Companies via POST /api/v1/companies...");
    const compARes = await makeRequest({ path: '/api/v1/companies', method: 'POST' }, { name: `Company A ${safeId}`, slug: `company-a-${safeId}`, email: `compa_${safeId}@collabfor.test`, industry: 'Technology', company_size: '11-50' }, ownerACookies);
    if (compARes.statusCode !== 201 && compARes.statusCode !== 200) throw new Error(`Company A creation failed: ${compARes.statusCode}`);
    companyAId = compARes.body.data?.id || compARes.body.id;

    const compBRes = await makeRequest({ path: '/api/v1/companies', method: 'POST' }, { name: `Company B ${safeId}`, slug: `company-b-${safeId}`, email: `compb_${safeId}@collabfor.test`, industry: 'Technology', company_size: '11-50' }, ownerBCookies);
    if (compBRes.statusCode !== 201 && compBRes.statusCode !== 200) throw new Error(`Company B creation failed: ${compBRes.statusCode}`);
    companyBId = compBRes.body.data?.id || compBRes.body.id;

    // Set Company A verification_status = 'verified', add HR members
    await dbClient.query(`UPDATE public.companies SET verification_status = 'verified' WHERE id = $1`, [companyAId]);
    await dbClient.query(`UPDATE public.companies SET verification_status = 'unverified' WHERE id = $1`, [companyBId]);

    await dbClient.query(`INSERT INTO public.company_members (company_id, user_id, is_active, joined_at) VALUES ($1, $2, TRUE, NOW()) ON CONFLICT (company_id, user_id) DO UPDATE SET is_active = TRUE, left_at = NULL`, [companyAId, hrAUserId]);
    await dbClient.query(`INSERT INTO public.company_members (company_id, user_id, is_active, joined_at) VALUES ($1, $2, TRUE, NOW()) ON CONFLICT (company_id, user_id) DO UPDATE SET is_active = TRUE, left_at = NULL`, [companyBId, hrBUserId]);

    const debugHrBUser = await dbClient.query(`SELECT id, role, status FROM public.users WHERE id = $1`, [hrBUserId]);
    const debugHrBMemb = await dbClient.query(`SELECT * FROM public.company_members WHERE company_id = $1 AND user_id = $2`, [companyBId, hrBUserId]);
    console.log("Debug hrB user:", debugHrBUser.rows[0]);
    console.log("Debug hrB member:", debugHrBMemb.rows[0]);

    const hrBMe = await makeRequest({ path: '/api/v1/auth/me', method: 'GET' }, null, hrBCookies);
    console.log("Debug /auth/me with hrBCookies:", hrBMe.statusCode, hrBMe.body);

    // GATE 1: Unverified Company Publish Attempt -> HTTP 403 Forbidden
    console.log("[Gate 1] Testing Unverified Company Publish Attempt...");
    console.log("Debug Gate 1 IDs:", { companyBId, hrBUserId, ownerBUserId });
    const draftBRes = await makeRequest({ path: `/api/v1/companies/${companyBId}/jobs`, method: 'POST' }, { title: 'Engineer B', slug: `eng-b-${testRunId.replace(/_/g, '-')}`, description: 'Test Desc' }, hrBCookies);
    if (draftBRes.statusCode !== 201) {
      console.error("Draft B error body:", draftBRes.statusCode, draftBRes.body);
      throw new Error(`Draft B creation failed: ${draftBRes.statusCode}`);
    }
    jobBId = draftBRes.body.data.id;

    // Call publish on unverified Company B with job_approval_required = false
    const pubUnverifiedRes1 = await makeRequest({ path: `/api/v1/companies/${companyBId}/jobs/${jobBId}/publish`, method: 'POST' }, {}, hrBCookies);
    if (pubUnverifiedRes1.statusCode !== 403) throw new Error(`Expected HTTP 403 for unverified company publish (approval=false), got ${pubUnverifiedRes1.statusCode}`);
    console.log("  ✓ Unverified company publish (job_approval_required=false) returned HTTP 403 Forbidden as expected.");

    // Update Company B settings to job_approval_required = true and retry publish
    await dbClient.query(`UPDATE public.company_settings SET job_approval_required = TRUE WHERE company_id = $1`, [companyBId]);
    const pubUnverifiedRes2 = await makeRequest({ path: `/api/v1/companies/${companyBId}/jobs/${jobBId}/publish`, method: 'POST' }, {}, hrBCookies);
    if (pubUnverifiedRes2.statusCode !== 403) throw new Error(`Expected HTTP 403 for unverified company publish (approval=true), got ${pubUnverifiedRes2.statusCode}`);
    console.log("  ✓ Unverified company publish (job_approval_required=true) returned HTTP 403 Forbidden as expected.");

    // GATE 2: Verified HR + Direct Publish (job_approval_required = false) -> HTTP 201/200 Published
    console.log("\n[Gate 2] Testing Verified Company Direct Publish (job_approval_required = false)...");
    console.log("Debug IDs:", { companyBId, hrBUserId, ownerBUserId });
    const draftA1Res = await makeRequest({ path: `/api/v1/companies/${companyAId}/jobs`, method: 'POST' }, { title: 'Software Engineer A1', slug: `swe-a1-${safeId}`, description: 'Test Desc A1' }, hrACookies);
    if (draftA1Res.statusCode !== 201) throw new Error(`Draft A1 creation failed: ${draftA1Res.statusCode}`);
    jobA1Id = draftA1Res.body.data.id;

    const pubVerifiedDirectRes = await makeRequest({ path: `/api/v1/companies/${companyAId}/jobs/${jobA1Id}/publish`, method: 'POST' }, {}, hrACookies);
    if (pubVerifiedDirectRes.statusCode !== 201 && pubVerifiedDirectRes.statusCode !== 200) throw new Error(`Expected 201/200 for direct publish, got ${pubVerifiedDirectRes.statusCode}`);
    if (pubVerifiedDirectRes.body.data.status !== 'published') throw new Error(`Expected status 'published', got ${pubVerifiedDirectRes.body.data.status}`);
    console.log("  ✓ Verified HR publish (job_approval_required=false) returned HTTP 201/200 with status='published'.");

    // GATE 3: Verified HR + Approval Required -> HTTP 201/200 Pending Approval
    console.log("\n[Gate 3] Testing Verified Company Submit & Approval Required (job_approval_required = true)...");
    await dbClient.query(`UPDATE public.company_settings SET job_approval_required = TRUE WHERE company_id = $1`, [companyAId]);

    const draftA2Res = await makeRequest({ path: `/api/v1/companies/${companyAId}/jobs`, method: 'POST' }, { title: 'Software Engineer A2', slug: `swe-a2-${safeId}`, description: 'Test Desc A2' }, hrACookies);
    if (draftA2Res.statusCode !== 201) throw new Error(`Draft A2 creation failed: ${draftA2Res.statusCode}`);
    jobA2Id = draftA2Res.body.data.id;

    const pubVerifiedApprovalRes = await makeRequest({ path: `/api/v1/companies/${companyAId}/jobs/${jobA2Id}/publish`, method: 'POST' }, {}, hrACookies);
    if (pubVerifiedApprovalRes.statusCode !== 201 && pubVerifiedApprovalRes.statusCode !== 200) throw new Error(`Expected 201/200 for publish with approval required, got ${pubVerifiedApprovalRes.statusCode}`);
    if (pubVerifiedApprovalRes.body.data.status !== 'pending_approval') throw new Error(`Expected status 'pending_approval', got ${pubVerifiedApprovalRes.body.data.status}`);
    console.log("  ✓ Verified HR publish (job_approval_required=true) returned HTTP 201/200 with status='pending_approval'.");

    // GATE 4: HR Approve/Reject Forbidden -> HTTP 403
    console.log("\n[Gate 4] Testing Regular HR Approve / Reject Rejection...");
    const hrApproveRes = await makeRequest({ path: `/api/v1/companies/${companyAId}/jobs/${jobA2Id}/approve`, method: 'POST' }, {}, hrACookies);
    if (hrApproveRes.statusCode !== 403) throw new Error(`Expected HTTP 403 for HR approve call, got ${hrApproveRes.statusCode}`);
    console.log("  ✓ HR approve call returned HTTP 403 Forbidden as expected.");

    const hrRejectRes = await makeRequest({ path: `/api/v1/companies/${companyAId}/jobs/${jobA2Id}/reject`, method: 'POST' }, { reason: 'HR reject' }, hrACookies);
    if (hrRejectRes.statusCode !== 403) throw new Error(`Expected HTTP 403 for HR reject call, got ${hrRejectRes.statusCode}`);
    console.log("  ✓ HR reject call returned HTTP 403 Forbidden as expected.");

    // GATE 5: Owner / Admin Approve & Reject Success
    console.log("\n[Gate 5] Testing Company Owner / Admin Approve & Reject Success...");
    // Owner approves jobA2Id (pending_approval -> published)
    const ownerApproveRes = await makeRequest({ path: `/api/v1/companies/${companyAId}/jobs/${jobA2Id}/approve`, method: 'POST' }, {}, ownerACookies);
    if (ownerApproveRes.statusCode !== 201 && ownerApproveRes.statusCode !== 200) throw new Error(`Expected 201/200 for Owner approve, got ${ownerApproveRes.statusCode}`);
    if (ownerApproveRes.body.data.status !== 'published') throw new Error(`Expected status 'published', got ${ownerApproveRes.body.data.status}`);
    console.log("  ✓ Company Owner approve call returned HTTP 201/200 with status='published'.");

    // HR creates draft A3 and submits for approval
    const draftA3Res = await makeRequest({ path: `/api/v1/companies/${companyAId}/jobs`, method: 'POST' }, { title: 'Software Engineer A3', slug: `swe-a3-${safeId}`, description: 'Test Desc A3' }, hrACookies);
    jobA3Id = draftA3Res.body.data.id;
    await makeRequest({ path: `/api/v1/companies/${companyAId}/jobs/${jobA3Id}/submit-for-approval`, method: 'POST' }, {}, hrACookies);

    // Owner rejects jobA3Id back to draft with reason
    const ownerRejectRes = await makeRequest({ path: `/api/v1/companies/${companyAId}/jobs/${jobA3Id}/reject`, method: 'POST' }, { reason: 'Salary breakdown required' }, ownerACookies);
    if (ownerRejectRes.statusCode !== 201 && ownerRejectRes.statusCode !== 200) throw new Error(`Expected 201/200 for Owner reject, got ${ownerRejectRes.statusCode}`);
    if (ownerRejectRes.body.data.status !== 'draft') throw new Error(`Expected status 'draft', got ${ownerRejectRes.body.data.status}`);
    console.log("  ✓ Company Owner reject call returned HTTP 201/200 with status='draft'.");

    // GATE 6: Cross-Company Access Forbidden -> HTTP 403
    console.log("\n[Gate 6] Testing Cross-Company Authorization & Isolation...");
    // HR A (Company A) attempts to publish job in Company B
    const crossPublishRes = await makeRequest({ path: `/api/v1/companies/${companyBId}/jobs/${jobBId}/publish`, method: 'POST' }, {}, hrACookies);
    if (crossPublishRes.statusCode !== 403) throw new Error(`Expected HTTP 403 for cross-company publish, got ${crossPublishRes.statusCode}`);
    console.log("  ✓ Cross-company publish request returned HTTP 403 Forbidden.");

    // HR A (Company A) attempts to update draft job in Company B
    const crossUpdateRes = await makeRequest({ path: `/api/v1/companies/${companyBId}/jobs/${jobBId}`, method: 'PATCH' }, { title: 'Hacked Title' }, hrACookies);
    if (crossUpdateRes.statusCode !== 403) throw new Error(`Expected HTTP 403 for cross-company updateDraft, got ${crossUpdateRes.statusCode}`);
    console.log("  ✓ Cross-company updateDraft request returned HTTP 403 Forbidden.");

    console.log("\n==================================================================");
    console.log("🎉 ALL BOUNDED UNIT 2 LIVE HTTP INTEGRATION TESTS PASSED (100%)");
    console.log("==================================================================");

  } catch (err) {
    console.error("\n❌ LIVE HTTP INTEGRATION TEST FAILED:", err);
    process.exitCode = 1;
  } finally {
    console.log("\n[Cleanup] Removing temporary test entities from Database...");
    try {
      if (companyAId) await dbClient.query(`DELETE FROM public.companies WHERE id = $1`, [companyAId]);
      if (companyBId) await dbClient.query(`DELETE FROM public.companies WHERE id = $1`, [companyBId]);
      await dbClient.query(`UPDATE public.users SET status = 'suspended', deleted_at = NOW() WHERE email LIKE 'p09d_%@collabfor.test'`);
      console.log("✓ Cleanup finished successfully.");
    } catch (cleanErr) {
      console.error("Cleanup error:", cleanErr);
    }
    await dbClient.end();
  }
}

runLiveHttpTest();
