const http = require('http');
const dotenv = require('dotenv');

dotenv.config();

const BASE_URL = process.env.TEST_BACKEND_URL || 'http://localhost:3000';
const AUTH_AUTO_CONFIRM_EMAIL = process.env.AUTH_AUTO_CONFIRM_EMAIL !== 'false';

function makeRequest(path, method, body, cookies = []) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const postData = body ? JSON.stringify(body) : '';
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    };
    if (cookies.length > 0) {
      headers['Cookie'] = cookies.join('; ');
    }

    const req = http.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {}
        const setCookies = res.headers['set-cookie'] || [];
        resolve({ status: res.statusCode, headers: res.headers, cookies: setCookies, body: json });
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runBatch3IntegrationTest() {
  console.log('=== Batch 3 Real Auth Integration Verification ===');
  console.log(`Target Base URL: ${BASE_URL}`);
  console.log(`AUTH_AUTO_CONFIRM_EMAIL Mode: ${AUTH_AUTO_CONFIRM_EMAIL} (Explicit Configuration)`);

  const timestamp = Date.now();
  const candEmail = `cand_b3_${timestamp}@gmail.com`;
  const empEmail = `emp_b3_${timestamp}@gmail.com`;
  const testPassword = 'TestPassword123!';
  let publicSignupExecuted = true;

  // 1. Candidate Public Signup Flow
  console.log('1. Testing Candidate Public Signup (POST /api/v1/auth/signup, register_as: "candidate")...');
  const candSignupRes = await makeRequest('/api/v1/auth/signup', 'POST', {
    email: candEmail,
    password: testPassword,
    register_as: 'candidate',
  });

  if (candSignupRes.status === 429) {
    console.log('   ⚠️ [Rate Limited] Supabase Auth returned 429 rate limit.');
    console.log('   -> Public candidate signup not executed due to rate limit.');
    publicSignupExecuted = false;
  } else if (candSignupRes.status !== 201) {
    throw new Error(`Candidate public signup failed with status ${candSignupRes.status}`);
  } else {
    console.log('   -> Candidate public signup API success (201)');
    if (AUTH_AUTO_CONFIRM_EMAIL) {
      if (candSignupRes.body?.status !== 'active') {
        throw new Error(`Expected status 'active' when AUTH_AUTO_CONFIRM_EMAIL=true, got '${candSignupRes.body?.status}'`);
      }
      console.log('   -> Verified explicit AUTH_AUTO_CONFIRM_EMAIL active status on signup (Pass)');
    }

    // Candidate Login & /auth/me Role Check
    console.log('2. Testing Candidate Login & Server Role Verification...');
    const candLoginRes = await makeRequest('/api/v1/auth/login', 'POST', {
      email: candEmail,
      password: testPassword,
    });
    if (candLoginRes.status !== 201 || !candLoginRes.cookies.length) {
      throw new Error(`Candidate login failed with status ${candLoginRes.status}`);
    }

    const candMeRes = await makeRequest('/api/v1/auth/me', 'GET', null, candLoginRes.cookies);
    const candRole = candMeRes.body?.role || candMeRes.body?.data?.role;
    if (candMeRes.status !== 200 || candRole !== 'candidate') {
      throw new Error(`Candidate /auth/me role check failed. Returned role: ${candRole}`);
    }
    console.log('   -> Candidate server role verified: "candidate" (Pass)');
  }

  // 3. Employer Public Signup Flow
  console.log('3. Testing Employer Public Signup (POST /api/v1/auth/signup, register_as: "employer")...');
  const empSignupRes = await makeRequest('/api/v1/auth/signup', 'POST', {
    email: empEmail,
    password: testPassword,
    register_as: 'employer',
  });

  if (empSignupRes.status === 429) {
    console.log('   ⚠️ [Rate Limited] Supabase Auth returned 429 rate limit.');
    console.log('   -> Public employer signup not executed due to rate limit.');
    publicSignupExecuted = false;
  } else if (empSignupRes.status !== 201) {
    throw new Error(`Employer public signup failed with status ${empSignupRes.status}`);
  } else {
    console.log('   -> Employer public signup API success (201)');
    if (AUTH_AUTO_CONFIRM_EMAIL) {
      if (empSignupRes.body?.status !== 'active') {
        throw new Error(`Expected status 'active' when AUTH_AUTO_CONFIRM_EMAIL=true, got '${empSignupRes.body?.status}'`);
      }
      console.log('   -> Verified explicit AUTH_AUTO_CONFIRM_EMAIL active status on signup (Pass)');
    }

    // Employer Login & /auth/me Role Check
    console.log('4. Testing Employer Login & Server Role Verification...');
    const empLoginRes = await makeRequest('/api/v1/auth/login', 'POST', {
      email: empEmail,
      password: testPassword,
    });
    if (empLoginRes.status !== 201 || !empLoginRes.cookies.length) {
      throw new Error(`Employer login failed with status ${empLoginRes.status}`);
    }

    const empMeRes = await makeRequest('/api/v1/auth/me', 'GET', null, empLoginRes.cookies);
    const empRole = empMeRes.body?.role || empMeRes.body?.data?.role;
    if (empMeRes.status !== 200 || empRole !== 'employer') {
      throw new Error(`Employer /auth/me role check failed. Returned role: ${empRole}`);
    }
    console.log('   -> Employer server role verified: "employer" (Pass)');
  }

  // 5. Rejection Testing (register_as: "admin" & "hr")
  console.log('5. Testing Rejection of Forbidden Roles (register_as: "admin" / "hr")...');
  const adminSignupRes = await makeRequest('/api/v1/auth/signup', 'POST', {
    email: `admin_b3_${timestamp}@gmail.com`,
    password: testPassword,
    register_as: 'admin',
  });
  if (adminSignupRes.status !== 400) {
    throw new Error(`Expected HTTP 400 for register_as: "admin", got ${adminSignupRes.status}`);
  }

  const hrSignupRes = await makeRequest('/api/v1/auth/signup', 'POST', {
    email: `hr_b3_${timestamp}@gmail.com`,
    password: testPassword,
    register_as: 'hr',
  });
  if (hrSignupRes.status !== 400) {
    throw new Error(`Expected HTTP 400 for register_as: "hr", got ${hrSignupRes.status}`);
  }
  console.log('   -> Forbidden role signups ("admin", "hr") rejected with HTTP 400 (Pass)');

  if (publicSignupExecuted) {
    console.log('\n=== PURE PUBLIC SIGNUP INTEGRATION FLOW PASSED 100% ===');
  } else {
    console.log('\n=== INTEGRATION TEST SUMMARY: PUBLIC SIGNUP NOT EXECUTED DUE TO RATE LIMIT ===');
  }
}

runBatch3IntegrationTest().catch((err) => {
  console.error('\n❌ Integration Test Failed:', err.message);
  process.exit(1);
});
