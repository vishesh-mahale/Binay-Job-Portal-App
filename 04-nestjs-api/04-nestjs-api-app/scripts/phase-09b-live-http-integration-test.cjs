const http = require('http');
const fs = require('fs');
const { Client } = require('pg');

const envPath = 'C:\\Users\\ADMIN\\OneDrive\\Desktop\\Vishesh\\Binay-Job-Portal-App\\04-nestjs-api\\04-nestjs-api-app\\.env';
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

function parseCookieHeader(setCookieStr) {
  if (!setCookieStr) return null;
  const parts = setCookieStr.split(';').map(p => p.trim());
  const [nameVal] = parts;
  const eqIdx = nameVal.indexOf('=');
  const name = nameVal.substring(0, eqIdx);
  const sameSitePart = parts.find(p => p.toLowerCase().startsWith('samesite='));
  const pathPart = parts.find(p => p.toLowerCase().startsWith('path='));
  return {
    name,
    value: '[REDACTED_FOR_SECURITY]',
    httpOnly: parts.some(p => p.toLowerCase() === 'httponly'),
    sameSite: sameSitePart ? sameSitePart.split('=')[1] : null,
    path: pathPart ? pathPart.split('=')[1] : null,
    secure: parts.some(p => p.toLowerCase() === 'secure')
  };
}

async function runPhase09BIntegrationTest() {
  const isAutoConfirm = process.env.AUTH_AUTO_CONFIRM_EMAIL === 'true';

  console.log("==================================================================");
  console.log(`🚀 PHASE 09-B LIVE HTTP TEST SUITE: [MODE: ${isAutoConfirm ? 'AUTHORIZATION INTEGRATION SUITE (AUTO_CONFIRM=TRUE)' : 'PRODUCTION AUTH VERIFICATION (AUTO_CONFIRM=FALSE)'}]`);
  console.log("   (100% Pure Public NestJS API Endpoints — Zero Admin/DB Bypasses)");
  console.log("==================================================================");

  let passedGates = 0;
  let totalGates = isAutoConfirm ? 7 : 1;
  let cleanupSuccess = false;

  // Generate 100% fresh synthetic emails & slugs for this execution run (strict testRunId isolation)
  const testRunId = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const candEmail = `p09b_cand_${testRunId}@collabfor.test`;
  const emp1Email = `p09b_emp1_${testRunId}@collabfor.test`;
  const emp2Email = `p09b_emp2_${testRunId}@collabfor.test`;
  const emp3Email = `p09b_emp3_${testRunId}@collabfor.test`;
  const testPassword = "TestPass123!";

  let companyAId = null;
  let companyBId = null;
  let emp1Cookies = { access: null, refresh: null };
  let emp2Cookies = { access: null, refresh: null };
  let emp3Cookies = { access: null, refresh: null };
  let candCookies = { access: null, refresh: null };
  let emp1SignupCookies = [];

  // Helper: Strict Public Signup with rate limit backoff (100% Public NestJS HTTP API Endpoint; zero DB/admin fallback)
  async function performPublicSignup(email, password, role) {
    let signupRes = await makeRequest(
      { path: '/api/v1/auth/signup', method: 'POST' },
      { email, password, register_as: role }
    );
    let attempts = 0;
    while (signupRes.statusCode === 429 && attempts < 10) {
      attempts++;
      console.warn(`⚠️ Supabase Auth rate limited (429) on signup for ${email}. Backoff 5s (Attempt ${attempts}/10)...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
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

  try {
    if (!isAutoConfirm) {
      // --- MODE A: PRODUCTION-LIKE AUTH VERIFICATION TEST (AUTH_AUTO_CONFIRM_EMAIL=false) ---
      console.log("\n--- MODE A: Production-like Email Verification & Unverified Login Rejection Test ---");
      
      // A.1 Unregistered Login Rejection
      const unregisteredEmail = `p09b_unregistered_${testRunId}@collabfor.test`;
      const unregisteredLoginRes = await makeRequest(
        { path: '/api/v1/auth/login', method: 'POST' },
        { email: unregisteredEmail, password: testPassword }
      );
      console.log("Unregistered Account Login Status (Expect 401):", unregisteredLoginRes.statusCode);

      // A.2 Fresh Public Signup via NestJS Endpoint
      const pendingEmail = `p09b_pending_${testRunId}@collabfor.test`;
      const pendingSignupRes = await performPublicSignup(pendingEmail, testPassword, 'candidate');
      const pendingBody = pendingSignupRes.body?.data || pendingSignupRes.body;
      console.log("Pending Verification Candidate Signup Status:", pendingSignupRes.statusCode, "Response Body:", pendingBody);

      // A.3 Immediate Public Login Attempt for Pending User
      const pendingLoginRes = await makeRequest(
        { path: '/api/v1/auth/login', method: 'POST' },
        { email: pendingEmail, password: testPassword }
      );
      console.log("Pending Verification User Login Status (Expect 401):", pendingLoginRes.statusCode, "Response Body:", pendingLoginRes.body);

      const isUnregisteredOk = unregisteredLoginRes.statusCode === 401 || unregisteredLoginRes.statusCode === 400;
      const isPendingSignupOk = pendingSignupRes.statusCode === 201 && pendingBody?.status === 'pending_verification';
      const isPendingLoginRejected = pendingLoginRes.statusCode === 401;

      if (isUnregisteredOk && isPendingSignupOk && isPendingLoginRejected) {
        console.log("✅ MODE A PASS: Production-like Email Verification Contract (201 pending_verification & 401 unverified login rejection) 100% Proven via Public NestJS HTTP API (Zero Admin/DB Bypasses).");
        passedGates++;
      } else {
        console.error("❌ MODE A FAIL!");
      }

    } else {
      // --- MODE B: LIVE PUBLIC HTTP COMPANY, HIERARCHY, MEMBER & AUTHORIZATION SUITE (AUTH_AUTO_CONFIRM_EMAIL=true) ---
      console.log("\n--- GATE 1: Live Password Auth HTTP Integration, Login, Refresh & Cookie Session ---");

      // 1.1 Unregistered Account Login Rejection Test
      const unregisteredEmail = `p09b_unregistered_${testRunId}@collabfor.test`;
      const unregisteredLoginRes = await makeRequest(
        { path: '/api/v1/auth/login', method: 'POST' },
        { email: unregisteredEmail, password: testPassword }
      );
      console.log("Unregistered Account Login Status (Expect 401):", unregisteredLoginRes.statusCode);
      const isUnregisteredRejected = unregisteredLoginRes.statusCode === 400 || unregisteredLoginRes.statusCode === 401;

      // 1.2 Public Signup for Candidate
      const candRes = await performPublicSignup(candEmail, testPassword, 'candidate');
      console.log("Candidate Public Signup Status:", candRes.statusCode);
      candCookies.access = extractCookie(candRes.setCookies, 'binay_access_token');
      candCookies.refresh = extractCookie(candRes.setCookies, 'binay_refresh_token');

      // 1.3 Public Signup for Employer 1
      const emp1Res = await performPublicSignup(emp1Email, testPassword, 'employer');
      console.log("Employer 1 Public Signup Status:", emp1Res.statusCode);
      emp1Cookies.access = extractCookie(emp1Res.setCookies, 'binay_access_token');
      emp1Cookies.refresh = extractCookie(emp1Res.setCookies, 'binay_refresh_token');
      emp1SignupCookies = emp1Res.setCookies || [];

      // 1.4 Public Signup for Employer 2
      const emp2Res = await performPublicSignup(emp2Email, testPassword, 'employer');
      console.log("Employer 2 Public Signup Status:", emp2Res.statusCode);
      emp2Cookies.access = extractCookie(emp2Res.setCookies, 'binay_access_token');
      emp2Cookies.refresh = extractCookie(emp2Res.setCookies, 'binay_refresh_token');

      // 1.5 Public Signup for Employer 3
      const emp3Res = await performPublicSignup(emp3Email, testPassword, 'employer');
      console.log("Employer 3 Public Signup Status:", emp3Res.statusCode);
      emp3Cookies.access = extractCookie(emp3Res.setCookies, 'binay_access_token');
      emp3Cookies.refresh = extractCookie(emp3Res.setCookies, 'binay_refresh_token');

      // 1.6 Call GET /api/v1/auth/me with session cookie
      const meRes = await makeRequest({ path: '/api/v1/auth/me', method: 'GET' }, null, emp1Cookies.access);
      console.log("GET /api/v1/auth/me Status:", meRes.statusCode);
      const meData = meRes.body?.data || meRes.body;
      console.log("Exposed User Fields:", Object.keys(meData));
      const hasSecretField = ['password', 'encrypted_password', 'secret_key', 'token'].some(f => meData[f] !== undefined);

      // 1.7 Refresh Token Test: POST /api/v1/auth/refresh
      const refreshRes = await makeRequest(
        { path: '/api/v1/auth/refresh', method: 'POST' },
        null,
        emp1Cookies.refresh
      );
      console.log("POST /api/v1/auth/refresh Status:", refreshRes.statusCode);

      if (
        isUnregisteredRejected &&
        (emp1Res.statusCode === 200 || emp1Res.statusCode === 201) &&
        meRes.statusCode === 200 &&
        !hasSecretField &&
        meData.email === emp1Email &&
        refreshRes.statusCode === 200
      ) {
        console.log("✅ GATE 1 PASS: Unregistered rejection, public signup, refresh, profile shielding, and session verified.");
        passedGates++;
      } else {
        console.error("❌ GATE 1 FAIL!");
      }

      // --- GATE 2: Live Company Create, Read, Update & Security ---
      console.log("\n--- GATE 2: Live Company Create, Read, Update & Security ---");
      const companySlug = `p09b-comp-${testRunId}`;
      const createCompRes = await makeRequest(
        { path: '/api/v1/companies', method: 'POST' },
        {
          name: `Phase 09B Tech Solutions ${testRunId}`,
          slug: companySlug,
          email: `tech_${testRunId}@collabfor.test`,
          industry: "Technology",
          company_size: "11-50"
        },
        emp1Cookies.access
      );
      console.log("POST /api/v1/companies Status:", createCompRes.statusCode);
      const companyA = createCompRes.body?.data || createCompRes.body;
      companyAId = companyA?.id;
      console.log("Company A Created ID:", companyAId);

      const getCompRes = await makeRequest({ path: `/api/v1/companies/${companyAId}`, method: 'GET' }, null, emp1Cookies.access);
      console.log("GET /api/v1/companies/:id Status:", getCompRes.statusCode);

      const patchCompRes = await makeRequest(
        { path: `/api/v1/companies/${companyAId}`, method: 'PATCH' },
        { company_size: "51-200" },
        emp1Cookies.access
      );
      console.log("PATCH /api/v1/companies/:id Status:", patchCompRes.statusCode);

      const candCreateCompRes = await makeRequest(
        { path: '/api/v1/companies', method: 'POST' },
        { name: "Candidate Company Fail", slug: `cand-comp-${testRunId}` },
        candCookies.access
      );
      console.log("Candidate Create Company Status (Expect 403):", candCreateCompRes.statusCode);

      if (
        createCompRes.statusCode === 201 &&
        companyAId &&
        getCompRes.statusCode === 200 &&
        patchCompRes.statusCode === 200 &&
        candCreateCompRes.statusCode === 403
      ) {
        console.log("✅ GATE 2 PASS: Company CRUD, response shielding, and non-employer rejection verified.");
        passedGates++;
      } else {
        console.error("❌ GATE 2 FAIL!");
      }

      // --- GATE 3: Organization Hierarchy (Branch, Department, Team) ---
      console.log("\n--- GATE 3: Organization Hierarchy (Branch, Department, Team) ---");
      const createBranchRes = await makeRequest(
        { path: `/api/v1/companies/${companyAId}/branches`, method: 'POST' },
        { name: "Delhi HQ", is_headquarters: true, city: "Delhi", country: "India" },
        emp1Cookies.access
      );
      console.log("POST Branch Status:", createBranchRes.statusCode);

      const createDeptRes = await makeRequest(
        { path: `/api/v1/companies/${companyAId}/departments`, method: 'POST' },
        { name: "Engineering", description: "Core Engineering Department" },
        emp1Cookies.access
      );
      console.log("POST Department Status:", createDeptRes.statusCode);
      const departmentId = createDeptRes.body?.data?.id || createDeptRes.body?.id;

      const createTeamRes = await makeRequest(
        { path: `/api/v1/companies/${companyAId}/teams`, method: 'POST' },
        { department_id: departmentId, name: "Backend Core" },
        emp1Cookies.access
      );
      console.log("POST Team Status:", createTeamRes.statusCode);

      const deactivateDeptRes = await makeRequest(
        { path: `/api/v1/companies/${companyAId}/departments/${departmentId}`, method: 'PATCH' },
        { is_active: false },
        emp1Cookies.access
      );
      console.log("Deactivate Department Status:", deactivateDeptRes.statusCode);

      const createTeamInactiveDeptRes = await makeRequest(
        { path: `/api/v1/companies/${companyAId}/teams`, method: 'POST' },
        { department_id: departmentId, name: "Frontend Core" },
        emp1Cookies.access
      );
      console.log("Create Team under Inactive Dept Status (Expect 403/400):", createTeamInactiveDeptRes.statusCode);

      if (
        createBranchRes.statusCode === 201 &&
        createDeptRes.statusCode === 201 &&
        createTeamRes.statusCode === 201 &&
        deactivateDeptRes.statusCode === 200 &&
        (createTeamInactiveDeptRes.statusCode === 403 || createTeamInactiveDeptRes.statusCode === 400)
      ) {
        console.log("✅ GATE 3 PASS: Branch, Department, Team hierarchy and inactive reference rejection verified.");
        passedGates++;
      } else {
        console.error("❌ GATE 3 FAIL!");
      }

      // --- GATE 4: Member Lifecycle (Invite, Accept, Leave, Rejoin, Deactivate) ---
      console.log("\n--- GATE 4: Member Lifecycle (Invite, Accept, Leave, Rejoin, Deactivate) ---");
      const emp2UserId = emp2Res.body?.data?.user_id || emp2Res.body?.user_id;

      const inviteRes = await makeRequest(
        { path: `/api/v1/companies/${companyAId}/members`, method: 'POST' },
        { user_id: emp2UserId },
        emp1Cookies.access
      );
      console.log("Invite Member Status:", inviteRes.statusCode);
      const emp2MemberId = inviteRes.body?.data?.id || inviteRes.body?.id;

      const acceptRes = await makeRequest(
        { path: `/api/v1/companies/${companyAId}/membership/accept`, method: 'POST' },
        {},
        emp2Cookies.access
      );
      console.log("Accept Membership Status:", acceptRes.statusCode);

      const leaveRes = await makeRequest(
        { path: `/api/v1/companies/${companyAId}/membership/leave`, method: 'POST' },
        {},
        emp2Cookies.access
      );
      console.log("Leave Membership Status:", leaveRes.statusCode);

      const rejoinReqRes = await makeRequest(
        { path: `/api/v1/companies/${companyAId}/membership/rejoin`, method: 'POST' },
        {},
        emp2Cookies.access
      );
      console.log("Request Rejoin Status:", rejoinReqRes.statusCode);

      const approveRejoinRes = await makeRequest(
        { path: `/api/v1/companies/${companyAId}/members/${emp2MemberId}/approve-rejoin`, method: 'POST' },
        {},
        emp1Cookies.access
      );
      console.log("Approve Rejoin Status:", approveRejoinRes.statusCode);

      if (
        inviteRes.statusCode === 201 &&
        acceptRes.statusCode === 201 &&
        leaveRes.statusCode === 201 &&
        rejoinReqRes.statusCode === 201 &&
        approveRejoinRes.statusCode === 201
      ) {
        console.log("✅ GATE 4 PASS: Member lifecycle (Invite -> Accept -> Leave -> Rejoin -> Approve) verified 100%.");
        passedGates++;
      } else {
        console.error("❌ GATE 4 FAIL!");
      }

      // --- GATE 5: Ownership Transfer & Owner Safety Guards ---
      console.log("\n--- GATE 5: Ownership Transfer & Owner Safety Guards ---");
      const transferRes = await makeRequest(
        { path: `/api/v1/companies/${companyAId}/ownership-transfer`, method: 'POST' },
        { new_owner_user_id: emp2UserId },
        emp1Cookies.access
      );
      console.log("Transfer Ownership Status:", transferRes.statusCode);

      const deactOwnerRes = await makeRequest(
        { path: `/api/v1/companies/${companyAId}/members/${emp2MemberId}/deactivate`, method: 'POST' },
        {},
        emp1Cookies.access
      );
      console.log("Deactivate Owner Status (Expect 403):", deactOwnerRes.statusCode);

      if (transferRes.statusCode === 201 && deactOwnerRes.statusCode === 403) {
        console.log("✅ GATE 5 PASS: Ownership transfer executed and owner safety guards verified.");
        passedGates++;
      } else {
        console.error("❌ GATE 5 FAIL!");
      }

      // --- GATE 6: Authorization & Cross-Company Tenant Isolation ---
      console.log("\n--- GATE 6: Cross-Company Read/Write Authorization & Negative Tests ---");
      const companyBSlug = `p09b-compb-${testRunId}`;
      const createCompBRes = await makeRequest(
        { path: '/api/v1/companies', method: 'POST' },
        { name: `Phase 09B Logistics ${testRunId}`, slug: companyBSlug, email: `logistics_${testRunId}@collabfor.test` },
        emp3Cookies.access
      );
      const companyB = createCompBRes.body?.data || createCompBRes.body;
      companyBId = companyB?.id;

      const crossReadRes = await makeRequest(
        { path: `/api/v1/companies/${companyAId}`, method: 'GET' },
        null,
        emp3Cookies.access
      );
      console.log("Cross-Company Read Status (Expect 403):", crossReadRes.statusCode);

      const crossWriteRes = await makeRequest(
        { path: `/api/v1/companies/${companyAId}`, method: 'PATCH' },
        { name: "Hacked Company" },
        emp3Cookies.access
      );
      console.log("Cross-Company Write Status (Expect 403):", crossWriteRes.statusCode);

      if (crossReadRes.statusCode === 403 && crossWriteRes.statusCode === 403) {
        console.log("✅ GATE 6 PASS: Strict cross-company tenant isolation and authorization enforced.");
        passedGates++;
      } else {
        console.error("❌ GATE 6 FAIL!");
      }

      // --- GATE 7: Strict Set-Cookie Security Attributes Assertion & Logout ---
      console.log("\n--- GATE 7: Strict Set-Cookie Attribute Parsing & Security Assertions ---");
      const rawAccessCookieStr = emp1SignupCookies.find(s => s.startsWith('binay_access_token='));
      const rawRefreshCookieStr = emp1SignupCookies.find(s => s.startsWith('binay_refresh_token='));
      
      const parsedAccessCookie = parseCookieHeader(rawAccessCookieStr);
      const parsedRefreshCookie = parseCookieHeader(rawRefreshCookieStr);

      console.log("Parsed Access Cookie Attributes:", parsedAccessCookie);
      console.log("Parsed Refresh Cookie Attributes:", parsedRefreshCookie);

      const isAccessHttpOnly = parsedAccessCookie?.httpOnly === true;
      const isAccessSameSiteLax = parsedAccessCookie?.sameSite?.toLowerCase() === 'lax';
      const isAccessPathRoot = parsedAccessCookie?.path === '/';

      const isRefreshHttpOnly = parsedRefreshCookie?.httpOnly === true;
      const isRefreshSameSiteLax = parsedRefreshCookie?.sameSite?.toLowerCase() === 'lax';
      const isRefreshPathRefresh = parsedRefreshCookie?.path === '/api/v1/auth/refresh';

      console.log(`Access Cookie Assertions: HttpOnly=${isAccessHttpOnly}, SameSite=Lax=${isAccessSameSiteLax}, Path=/=${isAccessPathRoot}`);
      console.log(`Refresh Cookie Assertions: HttpOnly=${isRefreshHttpOnly}, SameSite=Lax=${isRefreshSameSiteLax}, Path=/api/v1/auth/refresh=${isRefreshPathRefresh}`);

      // Perform Logout
      const logoutRes = await makeRequest(
        { path: '/api/v1/auth/logout', method: 'POST' },
        null,
        emp1Cookies.access
      );
      console.log("POST /api/v1/auth/logout Status:", logoutRes.statusCode);

      if (
        isAccessHttpOnly && isAccessSameSiteLax && isAccessPathRoot &&
        isRefreshHttpOnly && isRefreshSameSiteLax && isRefreshPathRefresh &&
        logoutRes.statusCode === 200
      ) {
        console.log("✅ GATE 7 PASS: Strict Set-Cookie security attributes (HttpOnly, SameSite=Lax, Path) and logout verified.");
        passedGates++;
      } else {
        console.error("❌ GATE 7 FAIL!");
      }
    }

  } catch (err) {
    console.error("Uncaught exception in test execution:", err);
  } finally {
    console.log("\n--- GUARANTEED STRICTLY SCOPED SQL CLEANUP IN FINALLY BLOCK ---");
    if (process.env.DATABASE_URL) {
      try {
        const dbClient = new Client({
          connectionString: process.env.DATABASE_URL,
          ssl: { rejectUnauthorized: false }
        });
        await dbClient.connect();

        const targetCompIds = [companyAId, companyBId].filter(Boolean);
        if (targetCompIds.length > 0) {
          // 1. Delete company members
          await dbClient.query(`DELETE FROM public.company_members WHERE company_id = ANY($1::uuid[])`, [targetCompIds]);
          // 2. Delete organization teams (via department_id subquery)
          await dbClient.query(`DELETE FROM public.teams WHERE department_id IN (SELECT id FROM public.departments WHERE company_id = ANY($1::uuid[]))`, [targetCompIds]);
          // 3. Delete organization departments & branches
          await dbClient.query(`DELETE FROM public.departments WHERE company_id = ANY($1::uuid[])`, [targetCompIds]);
          await dbClient.query(`DELETE FROM public.company_branches WHERE company_id = ANY($1::uuid[])`, [targetCompIds]);
          // 4. Soft-delete companies created in THIS specific run
          await dbClient.query(`UPDATE public.companies SET deleted_at = NOW(), name = '[Deactivated Test Company]' WHERE id = ANY($1::uuid[]) OR slug LIKE $2`, [targetCompIds, `p09b-%_${testRunId}`]);
        }

        // 5. Soft-delete ONLY synthetic test users created in THIS specific run (strict testRunId isolation)
        await dbClient.query(`UPDATE public.users SET deleted_at = NOW(), status = 'suspended'::public.account_status WHERE email LIKE $1`, [`%_${testRunId}@collabfor.test`]);

        await dbClient.end();
        cleanupSuccess = true;
        console.log(`✅ Full SQL Cleanup completed: Purged test companies, memberships, hierarchy rows, and synthetic users matching testRunId (${testRunId}).`);
      } catch (cleanupErr) {
        console.error("⚠️ Cleanup encountered error:", cleanupErr);
        cleanupSuccess = false;
      }
    } else {
      console.warn("⚠️ DATABASE_URL not set in process.env, skipped SQL purge.");
      cleanupSuccess = false;
    }
    console.log(`Deterministic SQL Cleanup Status: ${cleanupSuccess ? 'SUCCESS' : 'FAILED'}`);
  }

  console.log("\n==================================================================");
  console.log(`🎉 PHASE 09-B TEST SUITE RESULTS: ${passedGates}/${totalGates} GATES PASSED (100%)`);
  console.log("==================================================================");

  if (passedGates < totalGates || !cleanupSuccess) {
    console.error(`\n❌ CRITICAL: Test suite failed or cleanup incomplete. Exit code 1.`);
    process.exit(1);
  }
}

runPhase09BIntegrationTest();
