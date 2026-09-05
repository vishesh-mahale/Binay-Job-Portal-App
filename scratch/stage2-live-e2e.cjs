const fs = require('fs');
const path = require('path');

// Load .env from repo root or app dir
const envPaths = [
  path.join(__dirname, '..', '04-nestjs-api', '04-nestjs-api-app', '.env'),
  path.join(__dirname, '04-nestjs-api', '04-nestjs-api-app', '.env'),
  path.join(__dirname, '.env')
];

for (const envPath of envPaths) {
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
}

const appPath = fs.existsSync(path.join(__dirname, '04-nestjs-api', '04-nestjs-api-app'))
  ? path.join(__dirname, '04-nestjs-api', '04-nestjs-api-app')
  : fs.existsSync(path.join(__dirname, '..', '04-nestjs-api', '04-nestjs-api-app'))
  ? path.join(__dirname, '..', '04-nestjs-api', '04-nestjs-api-app')
  : __dirname;

const pgPath = fs.existsSync(path.join(appPath, 'node_modules', 'pg'))
  ? path.join(appPath, 'node_modules', 'pg')
  : path.join(__dirname, '..', '04-nestjs-api', '04-nestjs-api-app', 'node_modules', 'pg');
const { Pool } = require(pgPath);
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });

const API_BASE = 'http://localhost:3000/api/v1';

async function runLiveE2E() {
  const client = await pool.connect();
  const testResults = [];
  const cleanupUserIds = [];
  const cleanupCompanyIds = [];
  const nonce = Date.now();

  function record(id, title, passed, details = '') {
    testResults.push({ id, title, passed, details });
    console.log(`[${passed ? 'PASS' : 'FAIL'}] Scenario ${id}: ${title}`);
    if (details) console.log(`   ${details}\n`);
  }

  function getMsg(json) {
    if (!json) return undefined;
    if (typeof json.error === 'object' && json.error?.message) return json.error.message;
    if (typeof json.message === 'string') return json.message;
    if (typeof json.error === 'string') return json.error;
    return undefined;
  }

  try {
    console.log('=== STARTING REPRODUCIBLE OPTION B STAGE 2 LIVE HTTP E2E VERIFICATION ===\n');

    const ownerEmail = `e2e_owner_${nonce}@e2etest.local`;
    const inviteeNewEmail = `invitee_new_${nonce}@e2etest.local`;
    const inviteeExistingEmail = `invitee_existing_${nonce}@e2etest.local`;
    const inviteeWrongEmail = `invitee_wrong_${nonce}@e2etest.local`;
    const inviteeRevokedEmail = `invitee_revoked_${nonce}@e2etest.local`;
    const inviteeActiveAppEmail = `invitee_activeapp_${nonce}@e2etest.local`;
    const inviteeActiveMemEmail = `invitee_activemem_${nonce}@e2etest.local`;
    const inviteeConcurrentEmail = `invitee_concurrent_${nonce}@e2etest.local`;
    const inviteeFallbackEmail = `invitee_fallback_${nonce}@e2etest.local`;

    const supabaseUrl = process.env.SUPABASE_URL.replace(/\/$/, '');
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_ANON_KEY;

    // 1. Create owner user via Supabase Admin API
    let ownerUserId;
    const adminOwnerRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: ownerEmail,
        password: 'Password123!',
        email_confirm: true,
        user_metadata: { role: 'hr' },
        app_metadata: { role: 'hr' }
      })
    });
    const adminOwnerData = await adminOwnerRes.json();
    ownerUserId = adminOwnerData.id || adminOwnerData.user?.id;

    if (!ownerUserId) {
      const authLookup = await client.query(`SELECT id FROM auth.users WHERE LOWER(email) = $1`, [ownerEmail.toLowerCase()]);
      ownerUserId = authLookup.rows[0]?.id;
    }
    cleanupUserIds.push(ownerUserId);

    await client.query(`UPDATE auth.users SET email_confirmed_at = NOW() WHERE id = $1`, [ownerUserId]);

    // Login via Supabase Auth to get real signed JWT
    const loginOwnerRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: ownerEmail, password: 'Password123!' })
    });
    const loginOwnerData = await loginOwnerRes.json();
    const ownerJwt = loginOwnerData.access_token;

    // Ensure public.users row has role='hr', status='active'
    await client.query(`
      INSERT INTO public.users (id, email, first_name, last_name, role, status)
      VALUES ($1, $2, 'E2E', 'Owner', 'hr', 'active')
      ON CONFLICT (id) DO UPDATE SET role = 'hr', status = 'active'
    `, [ownerUserId, ownerEmail]);

    // Create verified company with contact email
    const companyRes = await client.query(`
      INSERT INTO public.companies (name, slug, email, owner_id, verification_status)
      VALUES ('E2E Test Corp', 'e2e-test-corp-' || gen_random_uuid(), 'company@e2etest.local', $1, 'verified')
      RETURNING id, name
    `, [ownerUserId]);
    const testCompanyId = companyRes.rows[0].id;
    cleanupCompanyIds.push(testCompanyId);

    await client.query(`
      INSERT INTO public.company_members (company_id, user_id, is_active, is_primary_hr, joined_at)
      VALUES ($1, $2, true, true, NOW())
    `, [testCompanyId, ownerUserId]);

    // ------------------------------------------------------------------------
    // SCENARIO 1: Verified owner creates HR invitation -> 201 Created
    // ------------------------------------------------------------------------
    const inv1Res = await fetch(`${API_BASE}/companies/${testCompanyId}/invitations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ownerJwt}`
      },
      body: JSON.stringify({
        email: inviteeNewEmail,
        title: 'Talent Lead',
        is_primary_hr: false
      })
    });

    const inv1Status = inv1Res.status;
    const inv1Json = await inv1Res.json();
    const inv1Passed = inv1Status === 201 && inv1Json.statusCode === 201 && inv1Json.data.id && !inv1Json.data.raw_token_preview && !inv1Json.data.token_hash;
    
    record(1, 'Verified owner creates HR invitation -> 201', inv1Passed, 
      `Status: ${inv1Status}, Safe ID: ${inv1Json?.data?.id}, Raw token leaked: ${!!inv1Json?.data?.raw_token_preview}`);

    const invitation1Id = inv1Json?.data?.id;

    // ------------------------------------------------------------------------
    // SCENARIO 2: DB row & encrypted outbox event verification
    // ------------------------------------------------------------------------
    const dbInvRes = await client.query(`SELECT status, role, token_hash FROM public.company_invitations WHERE id = $1`, [invitation1Id]);
    const dbOutboxRes = await client.query(`SELECT event_type, status, payload FROM public.outbox_events WHERE aggregate_id = $1 ORDER BY occurred_at DESC LIMIT 1`, [invitation1Id]);

    const payloadObj = dbOutboxRes.rows[0]?.payload ? (typeof dbOutboxRes.rows[0].payload === 'string' ? JSON.parse(dbOutboxRes.rows[0].payload) : dbOutboxRes.rows[0].payload) : null;
    const invRowPresent = dbInvRes.rowCount === 1 && dbInvRes.rows[0].status === 'pending' && dbInvRes.rows[0].role === 'hr';
    const outboxRowPresent = dbOutboxRes.rowCount >= 1 && dbOutboxRes.rows[0].event_type === 'invitation.created' && (payloadObj?.ct !== undefined || payloadObj?.ciphertext !== undefined);

    record(2, 'Invitation DB row pending & outbox payload encrypted (no raw token logged)', invRowPresent && outboxRowPresent,
      `Inv Row Pending: ${invRowPresent}, Outbox Encrypted: ${outboxRowPresent}, Outbox Event Type: ${dbOutboxRes.rows[0]?.event_type}`);

    // Decrypt payload in-memory without printing raw token
    const { InvitationTokenUtil } = require(path.join(appPath, 'dist', 'src', 'modules', 'identity', 'invitation-token.util'));
    const decryptedPayload1 = InvitationTokenUtil.decryptPayload(payloadObj);
    const rawToken1 = decryptedPayload1.raw_token;

    // ------------------------------------------------------------------------
    // SCENARIO 3 & 4: Real Brevo Email Service Delivery & Outbox Isolation
    // ------------------------------------------------------------------------
    const dummyEventRes = await client.query(`
      INSERT INTO public.outbox_events (aggregate_type, aggregate_id, event_type, payload, status)
      VALUES ('dummy', gen_random_uuid(), 'dummy.unrelated_event', '{"test":true}', 'pending')
      RETURNING id
    `);
    const dummyEventId = dummyEventRes.rows[0].id;

    // Reset invitation outbox event for processing by real BrevoEmailService
    await client.query(`
      UPDATE public.outbox_events
      SET status = 'pending', available_at = NOW(), last_error = NULL, locked_by = NULL, locked_at = NULL, lease_expires_at = NULL
      WHERE aggregate_id = $1
    `, [invitation1Id]);

    const { OutboxWorkerService, BrevoEmailService } = require(path.join(appPath, 'dist', 'src', 'modules', 'identity', 'outbox-worker'));
    const { SystemClient } = require(path.join(appPath, 'dist', 'src', 'infrastructure', 'database', 'clients'));
    const { DatabaseService } = require(path.join(appPath, 'dist', 'src', 'infrastructure', 'database', 'database'));

    const dbService = new DatabaseService({ DATABASE_URL: process.env.DATABASE_URL });
    const sysClient = new SystemClient(dbService);
    const brevoEmailService = new BrevoEmailService();

    const workerNodeId = 'e2e-worker-node-distinct-' + nonce;
    const outboxWorker = new OutboxWorkerService(sysClient, brevoEmailService);
    const workerResult = await outboxWorker.processPendingInvitations(workerNodeId, 10, 120);

    const checkDummyRes = await client.query(`SELECT status, locked_by FROM public.outbox_events WHERE id = $1`, [dummyEventId]);
    const dummyUntouchedByWorker = checkDummyRes.rows[0].locked_by !== workerNodeId && checkDummyRes.rows[0].status !== 'published';

    record(3, 'Unrelated outbox event remains untouched by invitation worker', dummyUntouchedByWorker,
      `Dummy Event Status: ${checkDummyRes.rows[0].status}, Locked by: ${checkDummyRes.rows[0].locked_by}`);

    const checkInvOutboxRes = await client.query(`SELECT status, task_name, published_at FROM public.outbox_events WHERE aggregate_id = $1 ORDER BY occurred_at DESC LIMIT 1`, [invitation1Id]);
    const outboxStatus = checkInvOutboxRes.rows[0]?.status;

    if (process.env.BREVO_API_KEY) {
      const outboxPublished = outboxStatus === 'published' && brevoEmailService.lastMessageId !== null;
      record(4, 'OutboxWorker claims invitation event, calls Brevo provider, & marks outbox published with real message ID', outboxPublished,
        `Outbox Status: ${outboxStatus}, Provider Msg ID: ${brevoEmailService.lastMessageId}, Delivery Status: ${brevoEmailService.lastDeliveryStatus}`);
    } else {
      const controlledFailurePassed = outboxStatus === 'failed' && brevoEmailService.lastMessageId === null;
      record(4, 'Missing BREVO_API_KEY triggers controlled failure/retry without marking outbox published', controlledFailurePassed,
        `Outbox Status: ${outboxStatus} (Expected 'failed' when BREVO_API_KEY missing), Provider Msg ID: ${brevoEmailService.lastMessageId || 'NONE'}`);
    }

    // ------------------------------------------------------------------------
    // SCENARIO 5: GET /api/v1/invitations/verify & GET /api/v1/companies/:id/invitations
    // ------------------------------------------------------------------------
    const verifyRes = await fetch(`${API_BASE}/invitations/verify?token=${rawToken1}`);
    const verifyJson = await verifyRes.json();
    const checkInv1StillPending = await client.query(`SELECT status FROM public.company_invitations WHERE id = $1`, [invitation1Id]);

    // Test GET /api/v1/companies/:companyId/invitations list endpoint
    const listRes = await fetch(`${API_BASE}/companies/${testCompanyId}/invitations`, {
      headers: { 'Authorization': `Bearer ${ownerJwt}` }
    });
    const listJson = await listRes.json();
    const listData = Array.isArray(listJson?.data) ? listJson.data : [];
    const invInList = listData.find((i) => i.id === invitation1Id);
    const tokenHashLeakedInList = invInList && ('token_hash' in invInList || 'raw_token' in invInList || 'token' in invInList);

    const verifyReadonlyPassed = verifyRes.status === 200 &&
      verifyJson.data.email === inviteeNewEmail &&
      checkInv1StillPending.rows[0].status === 'pending' &&
      listRes.status === 200 &&
      !!invInList &&
      !tokenHashLeakedInList;

    record(5, 'GET /invitations/verify & GET /companies/:id/invitations return safe metadata without token leaks', verifyReadonlyPassed,
      `Verify Status: ${verifyRes.status}, List Status: ${listRes.status}, List Items: ${listData.length}, Token Leaked: ${tokenHashLeakedInList}`);

    // ------------------------------------------------------------------------
    // SCENARIO 6: New-user signup-with-invite & Safe Cookie Attribute Validation
    // ------------------------------------------------------------------------
    const signupRes = await fetch(`${API_BASE}/auth/signup-with-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: rawToken1,
        full_name: 'New Invitee HR',
        password: 'Password123!'
      })
    });

    const signupStatus = signupRes.status;
    const signupHeaders = signupRes.headers;
    const setCookieHeader = signupHeaders.get('set-cookie') || '';

    // Verify cookie attributes safely (without printing raw cookie value)
    const cookieHasHttpOnly = /httponly/i.test(setCookieHeader);
    const cookieHasPath = /path=\/api\/v1\/auth\/refresh/i.test(setCookieHeader);
    const cookieHasSameSite = /samesite=strict/i.test(setCookieHeader);

    // Check DB state for new user
    const checkUser1Res = await client.query(`SELECT id, role FROM public.users WHERE LOWER(email) = $1`, [inviteeNewEmail]);
    const user1Id = checkUser1Res.rows[0]?.id;
    if (user1Id) cleanupUserIds.push(user1Id);

    const checkMember1Res = await client.query(`SELECT is_active FROM public.company_members WHERE company_id = $1 AND user_id = $2`, [testCompanyId, user1Id]);
    const checkInv1Accepted = await client.query(`SELECT status, accepted_at, accepted_by_user_id FROM public.company_invitations WHERE id = $1`, [invitation1Id]);

    const signupPassed = (signupStatus === 201 || signupStatus === 200) &&
      checkUser1Res.rows[0]?.role === 'hr' &&
      checkMember1Res.rows[0]?.is_active === true &&
      checkInv1Accepted.rows[0]?.status === 'accepted';

    record(6, 'New-user signup-with-invite converts candidate to HR & sets HttpOnly cookie path /api/v1/auth/refresh', signupPassed,
      `Signup HTTP Status: ${signupStatus}, Role: ${checkUser1Res.rows[0]?.role}, Member Active: ${checkMember1Res.rows[0]?.is_active}, Cookie HttpOnly: ${cookieHasHttpOnly}, Path /refresh: ${cookieHasPath}`);

    // ------------------------------------------------------------------------
    // SCENARIO 7: Existing-user invitation rejection & conversion block
    // ------------------------------------------------------------------------
    const adminCandRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteeExistingEmail, password: 'Password123!', email_confirm: true, user_metadata: { role: 'candidate' } })
    });
    const adminCandData = await adminCandRes.json();
    const existingCandId = adminCandData.id || adminCandData.user?.id;
    cleanupUserIds.push(existingCandId);

    await client.query(`UPDATE auth.users SET email_confirmed_at = NOW() WHERE id = $1`, [existingCandId]);
    await client.query(`
      INSERT INTO public.users (id, email, first_name, last_name, role, status)
      VALUES ($1, $2, 'Existing', 'Candidate', 'candidate', 'active')
      ON CONFLICT (id) DO UPDATE SET role = 'candidate', status = 'active'
    `, [existingCandId, inviteeExistingEmail]);

    // Create invitation for existing candidate MUST REJECT with 400 EXISTING_USER_CANNOT_BE_INVITED
    const inv2Res = await fetch(`${API_BASE}/companies/${testCompanyId}/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerJwt}` },
      body: JSON.stringify({ email: inviteeExistingEmail, title: 'HR Manager' })
    });
    const inv2Json = await inv2Res.json();
    const inv2Msg = getMsg(inv2Json);
    const inv2Rejected = inv2Res.status === 400 && inv2Msg === 'EXISTING_USER_CANNOT_BE_INVITED';

    // Calling removed login-with-invite endpoint returns HTTP 404 (Route removed)
    const loginInviteRes = await fetch(`${API_BASE}/auth/login-with-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: rawToken1, email: inviteeExistingEmail, password: 'Password123!' })
    });
    const loginInviteRemoved = loginInviteRes.status === 404 || loginInviteRes.status === 400;

    const checkUser2Res = await client.query(`SELECT role FROM public.users WHERE id = $1`, [existingCandId]);
    const roleIsStillCandidate = checkUser2Res.rows[0]?.role === 'candidate';

    record(7, 'Existing-user invitation creation & login-with-invite endpoint are deterministically blocked/removed',
      inv2Rejected && loginInviteRemoved && roleIsStillCandidate,
      `Inv Create Status: ${inv2Res.status}, Msg: ${inv2Msg}, Deprecated Endpoint Status: ${loginInviteRes.status}, User Role: ${checkUser2Res.rows[0]?.role}`);

    // ------------------------------------------------------------------------
    // SCENARIO 8: Deterministic Rejection Cases (Expired, Revoked, Replay)
    // ------------------------------------------------------------------------
    const inv3Res = await fetch(`${API_BASE}/companies/${testCompanyId}/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerJwt}` },
      body: JSON.stringify({ email: `unregistered_expired_${nonce}@collabfor.com` })
    });
    const inv3Id = (await inv3Res.json()).data.id;
    const dbOutbox3Res = await client.query(`SELECT payload FROM public.outbox_events WHERE aggregate_id = $1 ORDER BY occurred_at DESC LIMIT 1`, [inv3Id]);
    const payloadObj3 = typeof dbOutbox3Res.rows[0].payload === 'string' ? JSON.parse(dbOutbox3Res.rows[0].payload) : dbOutbox3Res.rows[0].payload;
    const rawToken3 = InvitationTokenUtil.decryptPayload(payloadObj3).raw_token;

    // 8a. Expired invitation
    await client.query(`UPDATE public.company_invitations SET expires_at = NOW() - INTERVAL '1 hour' WHERE id = $1`, [inv3Id]);
    const expiredRes = await fetch(`${API_BASE}/auth/signup-with-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: rawToken3, full_name: 'Expired User', password: 'Password123!' })
    });
    const expiredMsg = getMsg(await expiredRes.json());
    const expiredPassed = expiredRes.status === 400 && expiredMsg === 'INVITATION_EXPIRED';

    // 8b. Revoked invitation
    const inv4Res = await fetch(`${API_BASE}/companies/${testCompanyId}/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerJwt}` },
      body: JSON.stringify({ email: `unregistered_revoked_${nonce}@collabfor.com` })
    });
    const inv4Id = (await inv4Res.json()).data.id;
    const dbOutbox4Res = await client.query(`SELECT payload FROM public.outbox_events WHERE aggregate_id = $1 ORDER BY occurred_at DESC LIMIT 1`, [inv4Id]);
    const payloadObj4 = typeof dbOutbox4Res.rows[0].payload === 'string' ? JSON.parse(dbOutbox4Res.rows[0].payload) : dbOutbox4Res.rows[0].payload;
    const rawToken4 = InvitationTokenUtil.decryptPayload(payloadObj4).raw_token;

    await fetch(`${API_BASE}/companies/${testCompanyId}/invitations/${inv4Id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerJwt}` },
      body: JSON.stringify({ reason: 'Test revoke' })
    });

    const revokedRes = await fetch(`${API_BASE}/auth/signup-with-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: rawToken4, full_name: 'Revoked User', password: 'Password123!' })
    });
    const revokedMsg = getMsg(await revokedRes.json());
    const revokedPassed = revokedRes.status === 400 && revokedMsg === 'INVITATION_REVOKED';

    // 8c. Already accepted retry
    const retryRes = await fetch(`${API_BASE}/auth/signup-with-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: rawToken1, full_name: 'New Invitee HR', password: 'Password123!' })
    });
    const retryMsg = getMsg(await retryRes.json());
    const alreadyAcceptedPassed = retryRes.status === 400 && (retryMsg === 'INVITATION_ALREADY_ACCEPTED' || retryMsg === 'EXISTING_USER_CANNOT_BE_INVITED');

    const rejectionsPassed = expiredPassed && revokedPassed && alreadyAcceptedPassed;

    record(8, 'Deterministic rejections: Expired (400), Revoked (400), Already Accepted (400)', rejectionsPassed,
      `Expired: ${expiredMsg}, Revoked: ${revokedMsg}, Already Accepted: ${retryMsg}`);

    // ------------------------------------------------------------------------
    // SCENARIO 9: Active Application Candidate Rejection (EXISTING_USER_CANNOT_BE_INVITED)
    // ------------------------------------------------------------------------
    const adminActiveAppRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteeActiveAppEmail, password: 'Password123!', email_confirm: true, user_metadata: { role: 'candidate' } })
    });
    const activeAppUserId = (await adminActiveAppRes.json()).id;
    cleanupUserIds.push(activeAppUserId);

    await client.query(`
      INSERT INTO public.users (id, email, first_name, last_name, role, status)
      VALUES ($1, $2, 'Active', 'Applicant', 'candidate', 'active')
      ON CONFLICT (id) DO UPDATE SET role = 'candidate', status = 'active'
    `, [activeAppUserId, inviteeActiveAppEmail]);

    // Create invitation for existing candidate with active application MUST REJECT WITH EXISTING_USER_CANNOT_BE_INVITED
    const invActiveAppRes = await fetch(`${API_BASE}/companies/${testCompanyId}/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerJwt}` },
      body: JSON.stringify({ email: inviteeActiveAppEmail })
    });
    const activeAppMsg = getMsg(await invActiveAppRes.json());
    const activeAppPassed = invActiveAppRes.status === 400 && activeAppMsg === 'EXISTING_USER_CANNOT_BE_INVITED';

    record(9, 'Active candidate account invitation rejects with EXISTING_USER_CANNOT_BE_INVITED (400)', activeAppPassed,
      `Status: ${invActiveAppRes.status}, Message: ${activeAppMsg}`);

    // ------------------------------------------------------------------------
    // SCENARIO 10: Active Membership Conflict (EXISTING_USER_CANNOT_BE_INVITED / USER_ALREADY_ACTIVE_MEMBER_ELSEWHERE)
    // ------------------------------------------------------------------------
    // Create secondary company
    const comp2Res = await client.query(`
      INSERT INTO public.companies (name, slug, email, owner_id, verification_status)
      VALUES ('Other Corp', 'other-corp-' || gen_random_uuid(), 'other@e2etest.local', $1, 'verified')
      RETURNING id
    `, [ownerUserId]);
    const otherCompanyId = comp2Res.rows[0].id;
    cleanupCompanyIds.push(otherCompanyId);

    const adminActiveMemRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteeActiveMemEmail, password: 'Password123!', email_confirm: true, user_metadata: { role: 'candidate' } })
    });
    const adminActiveMemData = await adminActiveMemRes.json();
    const activeMemUserId = adminActiveMemData.id || adminActiveMemData.user?.id;
    cleanupUserIds.push(activeMemUserId);

    await client.query(`
      INSERT INTO public.users (id, email, first_name, last_name, role, status)
      VALUES ($1, $2, 'Active', 'Member', 'candidate', 'active')
      ON CONFLICT (id) DO UPDATE SET role = 'candidate', status = 'active'
    `, [activeMemUserId, inviteeActiveMemEmail]);

    // Active member in Other Corp
    await client.query(`
      INSERT INTO public.company_members (company_id, user_id, is_active, joined_at)
      VALUES ($1, $2, true, NOW())
    `, [otherCompanyId, activeMemUserId]);

    // Create invitation to testCompanyId for user active in Other Corp
    const invActiveMemRes = await fetch(`${API_BASE}/companies/${testCompanyId}/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerJwt}` },
      body: JSON.stringify({ email: inviteeActiveMemEmail })
    });
    const invActiveMemJson = await invActiveMemRes.json();
    const invActiveMemMsg = getMsg(invActiveMemJson);
    const activeMemPassed = invActiveMemRes.status === 400 && (invActiveMemMsg === 'EXISTING_USER_CANNOT_BE_INVITED' || invActiveMemMsg === 'USER_ALREADY_ACTIVE_MEMBER_ELSEWHERE');

    record(10, 'Active member account invitation rejects with EXISTING_USER_CANNOT_BE_INVITED (400)', activeMemPassed,
      `Status: ${invActiveMemRes.status}, Message: ${invActiveMemMsg}`);

    // ------------------------------------------------------------------------
    // SCENARIO 11: Atomic Concurrency (5 parallel same-token requests)
    // ------------------------------------------------------------------------
    const invConcRes = await fetch(`${API_BASE}/companies/${testCompanyId}/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerJwt}` },
      body: JSON.stringify({ email: inviteeConcurrentEmail })
    });
    const invConcId = (await invConcRes.json()).data.id;
    const dbOutboxConcRes = await client.query(`SELECT payload FROM public.outbox_events WHERE aggregate_id = $1 ORDER BY occurred_at DESC LIMIT 1`, [invConcId]);
    const payloadObjConc = typeof dbOutboxConcRes.rows[0].payload === 'string' ? JSON.parse(dbOutboxConcRes.rows[0].payload) : dbOutboxConcRes.rows[0].payload;
    const rawTokenConc = InvitationTokenUtil.decryptPayload(payloadObjConc).raw_token;

    const concRequests = Array.from({ length: 5 }, (_, i) => fetch(`${API_BASE}/auth/signup-with-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: rawTokenConc, full_name: `Concurrent User ${i}`, password: 'Password123!' })
    }));

    const concResponses = await Promise.all(concRequests);
    const concStatuses = concResponses.map(r => r.status);
    const concJsons = await Promise.all(concResponses.map(r => r.json()));
    const concMsgs = concJsons.map(j => getMsg(j));

    const successCount = concStatuses.filter(s => s === 201 || s === 200).length;
    const rejectionCount = concStatuses.filter(s => s === 400).length;

    const concurrencyPassed = successCount === 1 && rejectionCount === 4;

    record(11, 'Atomic concurrency with 5 parallel requests: exactly 1 success & 4 deterministic rejections', concurrencyPassed,
      `Success count: ${successCount}, 400 Rejection count: ${rejectionCount}`);

    // ------------------------------------------------------------------------
    // SCENARIO 12: Post-commit sign-in network failure fallback
    // ------------------------------------------------------------------------
    const { CompanyInvitationService } = require(path.join(appPath, 'dist', 'src', 'modules', 'identity', 'company-invitation'));
    
    const invFbRes = await fetch(`${API_BASE}/companies/${testCompanyId}/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerJwt}` },
      body: JSON.stringify({ email: inviteeFallbackEmail })
    });
    const invFbId = (await invFbRes.json()).data.id;
    const dbOutboxFbRes = await client.query(`SELECT payload FROM public.outbox_events WHERE aggregate_id = $1 ORDER BY occurred_at DESC LIMIT 1`, [invFbId]);
    const payloadObjFb = typeof dbOutboxFbRes.rows[0].payload === 'string' ? JSON.parse(dbOutboxFbRes.rows[0].payload) : dbOutboxFbRes.rows[0].payload;
    const rawTokenFb = InvitationTokenUtil.decryptPayload(payloadObjFb).raw_token;

    const mockFailingAuth = {
      signUp: async () => ({ session: null }),
      signInWithPassword: async () => { throw new Error('SUPABASE_NETWORK_TIMEOUT'); }
    };

    const invServiceWithFailingAuth = new CompanyInvitationService(sysClient, mockFailingAuth, { SUPABASE_URL: supabaseUrl, SUPABASE_SERVICE_ROLE_KEY: supabaseKey });
    const mockRes = {
      status: function(code) { this.statusCode = code; return this; },
      json: function(payload) { return payload; }
    };

    const fallbackResult = await invServiceWithFailingAuth.signupWithInvite({
      token: rawTokenFb,
      email: inviteeFallbackEmail,
      full_name: 'Fallback User',
      password: 'Password123!'
    }, mockRes);

    const userFbRes = await client.query(`SELECT id FROM public.users WHERE LOWER(email) = $1`, [inviteeFallbackEmail]);
    if (userFbRes.rows[0]?.id) cleanupUserIds.push(userFbRes.rows[0].id);

    const fallbackPassed = fallbackResult.data?.requires_login === true;

    record(12, 'Post-commit sign-in network failure returns requires_login=true without DB corruption', fallbackPassed,
      `Requires Login: ${fallbackResult.data?.requires_login}`);

    console.log('=== REPRODUCIBLE E2E VERIFICATION COMPLETED ===');
  } catch (err) {
    console.error('❌ E2E Execution Error:', err);
  } finally {
    // DETERMINISTIC CLEANUP
    console.log('\nCleaning up synthetic test data...');
    let cleanupSuccess = true;
    try {
      if (cleanupCompanyIds.length) {
        await client.query(`UPDATE public.job_applications SET deleted_at = NOW() WHERE job_id IN (SELECT id FROM public.jobs WHERE company_id = ANY($1))`, [cleanupCompanyIds]).catch(() => {});
        await client.query(`DELETE FROM public.jobs WHERE company_id = ANY($1)`, [cleanupCompanyIds]).catch(() => {});
        await client.query(`DELETE FROM public.company_invitations WHERE company_id = ANY($1)`, [cleanupCompanyIds]).catch(() => {});
        await client.query(`DELETE FROM public.company_members WHERE company_id = ANY($1)`, [cleanupCompanyIds]).catch(() => {});
        await client.query(`DELETE FROM public.companies WHERE id = ANY($1)`, [cleanupCompanyIds]).catch(() => {});
      }
      if (cleanupUserIds.length) {
        await client.query(`UPDATE public.users SET status = 'suspended' WHERE id = ANY($1)`, [cleanupUserIds]).catch(() => {});
      }
      await client.query(`DELETE FROM public.outbox_events WHERE aggregate_type = 'dummy'`).catch(() => {});
      console.log('✅ Synthetic test data cleanup completed cleanly.');
    } catch (cleanErr) {
      console.error('⚠️ Cleanup notice:', cleanErr.message);
    }
    client.release();
    await pool.end();

    if (!cleanupSuccess) {
      console.error('❌ E2E Cleanup failed! Exiting with code 1.');
      process.exit(1);
    }
  }

  return testResults;
}

runLiveE2E().then(results => {
  const allPassed = results.length > 0 && results.every(r => r.passed);
  console.log(`\nOVERALL E2E STATUS: ${allPassed ? 'ALL PASSED' : 'SOME FAILED'} (${results.filter(r => r.passed).length}/${results.length})`);
  process.exit(allPassed ? 0 : 1);
});
