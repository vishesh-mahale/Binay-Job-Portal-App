const http = require('http');
const { Client } = require('C:/Users/ADMIN/Desktop/Vishesh/Binay-Job-Portal-App/04-nestjs-api/04-nestjs-api-app/node_modules/pg');

const BASE_URL = 'http://localhost:3000';
const RUN_ID = Date.now();
const DB_URL = 'postgresql://postgres.jzpvssryooucygnuifkb:z0qHzABWth61A3ah@aws-0-ap-south-1.pooler.supabase.com:6543/postgres';

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers,
    };
    const req = http.request(url, { method, headers: reqHeaders }, (res) => {
      let data = '';
      const cookies = res.headers['set-cookie'] || [];
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {}
        resolve({ statusCode: res.statusCode, headers: res.headers, cookies, body: json || data });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function getCookieHeader(cookiesArr) {
  if (!cookiesArr || !cookiesArr.length) return '';
  return cookiesArr.map((c) => c.split(';')[0]).join('; ');
}

async function confirmUserInDb(pgClient, email, role) {
  await pgClient.query("UPDATE auth.users SET email_confirmed_at=NOW() WHERE LOWER(email)=LOWER($1)", [email]);
  await pgClient.query("UPDATE public.users SET role=$1, status='active' WHERE LOWER(email)=LOWER($2)", [role, email]);
}

async function runLiveVerification() {
  console.log(`=== LIVE STRICT E2E FLOW & CONCURRENCY VERIFICATION (RUN ID: ${RUN_ID}) ===\n`);
  const pgClient = new Client({ connectionString: DB_URL });
  await pgClient.connect();

  let createdCompanyId = null;
  const createdEmails = [];

  try {
    // 1. Strict Assertion: Employer Signup & Login
    const employerEmail = `strict_emp_${RUN_ID}@collabfor.test`;
    createdEmails.push(employerEmail);
    const password = 'Password123!';
    const signupRes = await request('POST', '/api/v1/auth/signup', {
      email: employerEmail,
      password: password,
      register_as: 'employer',
    });
    console.log(`1. Employer Signup Status (Strict Expect 201 Created): ${signupRes.statusCode}`);
    if (signupRes.statusCode !== 201) throw new Error(`Signup failed: expected HTTP 201, got ${signupRes.statusCode}`);

    await confirmUserInDb(pgClient, employerEmail, 'employer');

    const loginRes = await request('POST', '/api/v1/auth/login', {
      email: employerEmail,
      password: password,
    });
    console.log(`   Employer Login Status (Strict Expect 200 OK): ${loginRes.statusCode}`);
    if (loginRes.statusCode !== 200) throw new Error(`Login failed: expected HTTP 200, got ${loginRes.statusCode}`);
    const employerCookie = getCookieHeader(loginRes.cookies);

    // 2. Strict Assertion: Parallel Concurrent Duplicate Company Creation (5 Requests)
    console.log('\n2. Testing Live Concurrent Duplicate Company Creation (5 parallel HTTP requests)...');
    const companyPayload = {
      name: `Strict Mode B Acme ${RUN_ID}`,
      slug: `strict-acme-b-${RUN_ID}`,
      email: employerEmail,
      industry: 'Technology',
    };

    const concurrentRequests = Array.from({ length: 5 }).map(() =>
      request('POST', '/api/v1/companies', companyPayload, { Cookie: employerCookie })
    );

    const results = await Promise.all(concurrentRequests);
    console.log('   Concurrent HTTP Response Statuses:', results.map(r => r.statusCode));

    const successCount = results.filter((r) => r.statusCode === 201).length;
    const conflictCount = results.filter((r) => r.statusCode === 400).length;

    console.log(`   - Concurrent Results: ${successCount} HTTP 201 (Created), ${conflictCount} HTTP 400 (Conflict)`);
    if (successCount !== 1 || conflictCount !== 4) {
      throw new Error(`CONCURRENCY FAIL: Expected 1 HTTP 201 and 4 HTTP 400, got ${successCount} and ${conflictCount}`);
    }
    console.log('   ✅ LIVE PROOF: Advisory lock (pg_advisory_xact_lock) enforced 1 HTTP 201 Created and 4 HTTP 400 Conflicts!');

    const company = results.find((r) => r.statusCode === 201).body.data || results.find((r) => r.statusCode === 201).body;
    createdCompanyId = company.id;

    // 3. Strict Assertion: Mount Load Persistence
    console.log('\n3. Testing GET /api/v1/companies/me/current (Mount Load Persistence)...');
    const myCompRes = await request('GET', '/api/v1/companies/me/current', null, { Cookie: employerCookie });
    console.log(`   - My Company Status (Strict Expect 200 OK): ${myCompRes.statusCode}`);
    if (myCompRes.statusCode !== 200) throw new Error(`Persistence failed: expected HTTP 200, got ${myCompRes.statusCode}`);
    console.log('   ✅ Employer company load persistence verified!');

    // 4. Strict Assertion: Unverified Mutation Rejection
    console.log('\n4. Testing Unverified Mutation Rejection (Branch Creation on UNVERIFIED company)...');
    const unverifiedBranchRes = await request(
      'POST',
      `/api/v1/companies/${createdCompanyId}/branches`,
      { name: 'Delhi HQ', city: 'Delhi', country: 'India' },
      { Cookie: employerCookie }
    );
    console.log(`   - Branch Create Status on Unverified Company (Strict Expect 403 Forbidden): ${unverifiedBranchRes.statusCode}`);
    if (unverifiedBranchRes.statusCode !== 403) throw new Error(`Expected HTTP 403, got ${unverifiedBranchRes.statusCode}`);
    console.log('   ✅ Unverified company mutation rejection verified (HTTP 403 Forbidden)!');

    // 5. Strict Assertion: Admin Verification Endpoint & Role Guard
    console.log('\n5. Testing Platform Admin Verification Endpoint (Non-Admin 403 & Admin 200)...');
    const nonAdminVerifyRes = await request(
      'PATCH',
      `/api/v1/admin/companies/${createdCompanyId}/verification`,
      { verification_status: 'verified' },
      { Cookie: employerCookie }
    );
    console.log(`   - Non-Admin Access Status (Strict Expect 403 Forbidden): ${nonAdminVerifyRes.statusCode}`);
    if (nonAdminVerifyRes.statusCode !== 403) throw new Error(`Expected HTTP 403 for non-admin, got ${nonAdminVerifyRes.statusCode}`);

    const adminEmail = `strict_admin_${RUN_ID}@collabfor.test`;
    createdEmails.push(adminEmail);
    await request('POST', '/api/v1/auth/signup', {
      email: adminEmail,
      password: password,
      register_as: 'employer',
    });
    await confirmUserInDb(pgClient, adminEmail, 'admin');

    const adminLoginRes = await request('POST', '/api/v1/auth/login', {
      email: adminEmail,
      password: password,
    });
    const adminCookie = getCookieHeader(adminLoginRes.cookies);

    const verifyRes = await request(
      'PATCH',
      `/api/v1/admin/companies/${createdCompanyId}/verification`,
      { verification_status: 'verified' },
      { Cookie: adminCookie }
    );
    console.log(`   - Admin Verification Status (Strict Expect 200 OK): ${verifyRes.statusCode}`);
    const verifiedCompany = verifyRes.body.data || verifyRes.body;
    console.log(`   - Updated Status: ${verifiedCompany.verification_status}, Verified At: ${verifiedCompany.verified_at}`);
    if (verifyRes.statusCode !== 200 || verifiedCompany.verification_status !== 'verified' || !verifiedCompany.verified_at) {
      throw new Error('Admin verification assertion failed');
    }
    console.log('   ✅ Platform Admin verification endpoint, 403 role guard, & verified_at timestamp verified!');

    // 6. Strict Assertion: Verified Mutation Authorization
    console.log('\n6. Testing Verified Mutation Authorization (Branch Creation after Admin Verification)...');
    const verifiedBranchRes = await request(
      'POST',
      `/api/v1/companies/${createdCompanyId}/branches`,
      { name: 'Delhi HQ', city: 'Delhi', country: 'India' },
      { Cookie: employerCookie }
    );
    console.log(`   - Branch Create Status on Verified Company (Strict Expect 201 Created): ${verifiedBranchRes.statusCode}`);
    if (verifiedBranchRes.statusCode !== 201) throw new Error(`Expected HTTP 201, got ${verifiedBranchRes.statusCode}`);
    console.log('   ✅ Verified company mutation authorized (HTTP 201 Created)!');

    // 7. Strict Assertion: Unknown Email Member Invite (HTTP 404)
    console.log('\n7. Testing Unknown Email Member Invite (Strict Expect 404 Not Found)...');
    const unknownInviteRes = await request(
      'POST',
      `/api/v1/companies/${createdCompanyId}/members`,
      { email: `nonexistent_${RUN_ID}@collabfor.test` },
      { Cookie: employerCookie }
    );
    console.log(`   - Unknown Email Invite Status (Strict Expect 404 Not Found): ${unknownInviteRes.statusCode}`);
    if (unknownInviteRes.statusCode !== 404) throw new Error(`Expected HTTP 404, got ${unknownInviteRes.statusCode}`);
    console.log('   ✅ Unknown email member invite safely rejected (HTTP 404 Not Found)!');

    // 8. Strict Assertion: Explicit 2-Step Member Invite & Acceptance Lifecycle
    console.log('\n8. Testing Explicit 2-Step Member Invite & Acceptance Lifecycle...');
    const inviteeEmail = `strict_invitee_${RUN_ID}@collabfor.test`;
    createdEmails.push(inviteeEmail);
    await request('POST', '/api/v1/auth/signup', {
      email: inviteeEmail,
      password: password,
      register_as: 'candidate',
    });
    await confirmUserInDb(pgClient, inviteeEmail, 'candidate');

    const inviteeLoginRes = await request('POST', '/api/v1/auth/login', {
      email: inviteeEmail,
      password: password,
    });
    const inviteeCookie = getCookieHeader(inviteeLoginRes.cookies);

    // Step 8A: Employer Invites Existing User by Email
    const validInviteRes = await request(
      'POST',
      `/api/v1/companies/${createdCompanyId}/members`,
      { email: inviteeEmail, title: 'Senior Engineer' },
      { Cookie: employerCookie }
    );
    const pendingMember = validInviteRes.body.data || validInviteRes.body;
    console.log(`   - Step 8A Invite Status (Strict Expect 201 Created): ${validInviteRes.statusCode}`);
    console.log(`     Pending Member ID: ${pendingMember.id}, is_active: ${pendingMember.is_active}, invited_at: ${pendingMember.invited_at}`);
    if (validInviteRes.statusCode !== 201 || pendingMember.is_active !== false || !pendingMember.invited_at) {
      throw new Error(`Invite creation failed: expected HTTP 201 with is_active=false, got ${validInviteRes.statusCode}`);
    }
    console.log('     ✅ STEP 8A PASS: Pending invitation created with is_active=false & invited_at set!');

    // Step 8B: Invitee Authenticated Accept (Strict Expect 201 Created as per NestJS Controller Contract)
    const acceptRes = await request(
      'POST',
      `/api/v1/companies/${createdCompanyId}/membership/accept`,
      {},
      { Cookie: inviteeCookie }
    );
    const activeMember = acceptRes.body.data || acceptRes.body;
    console.log(`   - Step 8B Accept Status (Strict Expect 201 Created): ${acceptRes.statusCode}`);
    console.log(`     Active Member ID: ${activeMember.id}, is_active: ${activeMember.is_active}, joined_at: ${activeMember.joined_at}`);
    if (acceptRes.statusCode !== 201 || activeMember.is_active !== true || !activeMember.joined_at) {
      throw new Error(`Member accept failed: expected HTTP 201 Created with is_active=true, got ${acceptRes.statusCode}`);
    }
    console.log('     ✅ STEP 8B PASS: Invitee authenticated acceptance transitioned is_active=false -> is_active=true with joined_at timestamp!');

    console.log('\n======================================================');
    console.log('🎉 ALL LIVE E2E & CONCURRENCY TESTS STRICTLY PASSED!');
    console.log('======================================================\n');
  } catch (err) {
    console.error('\n❌ LIVE STRICT VERIFICATION FAILED:', err);
    process.exit(1);
  } finally {
    // 9. Explicit Synthetic Test Artifact Cleanup
    console.log('9. Executing Synthetic Test Data Cleanup...');
    try {
      if (createdCompanyId) {
        await pgClient.query("DELETE FROM public.company_members WHERE company_id = $1", [createdCompanyId]);
        await pgClient.query("DELETE FROM public.company_branches WHERE company_id = $1", [createdCompanyId]);
      }
      if (createdEmails.length > 0) {
        await pgClient.query("UPDATE public.users SET deleted_at = NOW(), status = 'suspended' WHERE LOWER(email) = ANY($1::text[])", [createdEmails]);
        await pgClient.query("DELETE FROM auth.users WHERE LOWER(email) = ANY($1::text[])", [createdEmails]);
      }
      console.log('   ✅ CLEANUP STATUS: SUCCESS (All synthetic test users deactivated and company memberships cleaned)');
    } catch (cleanupErr) {
      console.error('   ❌ CLEANUP STATUS: FAILED', cleanupErr);
      process.exit(1);
    } finally {
      await pgClient.end();
    }
  }
}

runLiveVerification();
