import { mapFailureReason, AuthProviderError, SupabaseAuthProvider, AuthProviderController } from './auth-provider';

test('maps Supabase unverified-email errors to the approved enum', () => {
  expect(mapFailureReason({ error_code: 'email_not_confirmed' })).toBe('email_not_verified');
});

test('maps invalid grant/password errors to invalid_password', () => {
  expect(mapFailureReason({ error: 'invalid_grant' })).toBe('invalid_password');
  expect(mapFailureReason({ message: 'Invalid login credentials' })).toBe('invalid_password');
});

test('maps unknown provider errors safely to unknown', () => {
  expect(mapFailureReason({ error_code: 'internal_error', message: 'provider detail' })).toBe('unknown');
});

test('logout deactivates only the authenticated presence session', async () => {
  const provider = { config: { AUTH_AUTO_CONFIRM_EMAIL: true } } as any;
  const system = { query: jest.fn().mockResolvedValue({ rows: [] }) } as any;
  const audit = {} as any;
  const controller = new AuthProviderController(provider, system, audit);
  const response = { clearCookie: jest.fn() } as any;
  await controller.logout({ user: { sub: 'u1' }, cookies: { binay_presence_session: 's1' } }, response);
  expect(system.query).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1 AND user_id = $2'), ['s1', 'u1']);
  expect(response.clearCookie).toHaveBeenCalledWith('binay_presence_session', expect.objectContaining({ path: '/api/v1' }));
});

test('signup provisions candidate role and active status when AUTH_AUTO_CONFIRM_EMAIL is true', async () => {
  const provider = { deleteAdminUser: jest.fn().mockResolvedValue(true), signup: jest.fn().mockResolvedValue({ userId: 'u1', requiresVerification: false }), config: { AUTH_AUTO_CONFIRM_EMAIL: true } } as any;
  const system = { query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [] }) } as any;
  const audit = { recordSecurityEvent: jest.fn() } as any;
  const controller = new AuthProviderController(provider, system, audit);
  const response = { cookie: jest.fn() } as any;
  const result = await controller.signup({ email: 'cand@example.com', password: 'Password123!', register_as: 'candidate' }, response);
  expect(provider.signup).toHaveBeenCalledWith({ email: 'cand@example.com', password: 'Password123!', register_as: 'candidate' });
  expect(system.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE public.users SET role = $1::public.user_role, status = 'active'::public.account_status WHERE id = $2"), ['candidate', 'u1']);
  expect(result).toEqual({ status: 'active', user_id: 'u1' });
});

test('signup provisions candidate role without active status when AUTH_AUTO_CONFIRM_EMAIL is false', async () => {
  const provider = { deleteAdminUser: jest.fn().mockResolvedValue(true), signup: jest.fn().mockResolvedValue({ userId: 'u1-unconfirmed', requiresVerification: true }), config: { AUTH_AUTO_CONFIRM_EMAIL: false } } as any;
  const system = { query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [] }) } as any;
  const audit = { recordSecurityEvent: jest.fn() } as any;
  const controller = new AuthProviderController(provider, system, audit);
  const response = { cookie: jest.fn() } as any;
  const result = await controller.signup({ email: 'unconfirmed@example.com', password: 'Password123!', register_as: 'candidate' }, response);
  expect(provider.signup).toHaveBeenCalledWith({ email: 'unconfirmed@example.com', password: 'Password123!', register_as: 'candidate' });
  expect(system.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE public.users SET role = $1::public.user_role WHERE id = $2'), ['candidate', 'u1-unconfirmed']);
  expect(result).toEqual({ status: 'pending_verification', user_id: 'u1-unconfirmed' });
});

test('signup provisions employer role through SystemClient', async () => {
  const provider = { deleteAdminUser: jest.fn().mockResolvedValue(true), signup: jest.fn().mockResolvedValue({ userId: 'u2', requiresVerification: false }), config: { AUTH_AUTO_CONFIRM_EMAIL: true } } as any;
  const system = { query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [] }) } as any;
  const audit = { recordSecurityEvent: jest.fn() } as any;
  const controller = new AuthProviderController(provider, system, audit);
  const response = { cookie: jest.fn() } as any;
  const result = await controller.signup({ email: 'emp@example.com', password: 'Password123!', register_as: 'employer' }, response);
  expect(provider.signup).toHaveBeenCalledWith({ email: 'emp@example.com', password: 'Password123!', register_as: 'employer' });
  expect(system.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE public.users SET role = $1::public.user_role, status = 'active'::public.account_status WHERE id = $2"), ['employer', 'u2']);
  expect(result).toEqual({ status: 'active', user_id: 'u2' });
});

test('signup defaults register_as to candidate when omitted and sets active status when AUTH_AUTO_CONFIRM_EMAIL is true', async () => {
  const provider = { signup: jest.fn().mockResolvedValue({ userId: 'u-default', requiresVerification: false }), config: { AUTH_AUTO_CONFIRM_EMAIL: true } } as any;
  const system = { query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [] }) } as any;
  const audit = { recordSecurityEvent: jest.fn() } as any;
  const controller = new AuthProviderController(provider, system, audit);
  const response = { cookie: jest.fn() } as any;
  const result = await controller.signup({ email: 'default@example.com', password: 'Password123!' }, response);
  expect(provider.signup).toHaveBeenCalledWith({ email: 'default@example.com', password: 'Password123!', register_as: 'candidate' });
  expect(system.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE public.users SET role = $1::public.user_role, status = 'active'::public.account_status WHERE id = $2"), ['candidate', 'u-default']);
  expect(result).toEqual({ status: 'active', user_id: 'u-default' });
});

test('signup triggers compensating deleteAdminUser cleanup when SystemClient role provisioning fails', async () => {
  const provider = { deleteAdminUser: jest.fn().mockResolvedValue(true), signup: jest.fn().mockResolvedValue({ userId: 'u-clean', requiresVerification: false }), config: { AUTH_AUTO_CONFIRM_EMAIL: true } } as any;
  const system = { query: jest.fn().mockRejectedValue(new Error('DB_FAIL')) } as any;
  const audit = { knownUserSecurityEvent: jest.fn().mockResolvedValue({}) } as any;
  const controller = new AuthProviderController(provider, system, audit);
  const response = { cookie: jest.fn() } as any;
  await expect(controller.signup({ email: 'clean@example.com', password: 'Password123!', register_as: 'candidate' }, response)).rejects.toThrow();
  expect(provider.deleteAdminUser).toHaveBeenCalledWith('u-clean');
  expect(audit.knownUserSecurityEvent).toHaveBeenCalledWith(expect.objectContaining({
    userId: 'u-clean',
    eventType: 'account_suspended',
    description: 'Role provisioning failed during signup; compensating cleanup succeeded'
  }));
});

test('login passes only email and password to token call', async () => {
  const AuthProviderClass = require('./auth-provider').SupabaseAuthProvider;
  const instance = new AuthProviderClass({ SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SECRET_KEY: '123456789012345678901234567890' });
  const callSpy = jest.spyOn(instance, 'call').mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh', userId: 'u-login', requiresVerification: false });

  await instance.login({ email: 'test@example.com', password: 'Password123!', extraField: 'should_be_ignored' } as any);

  expect(callSpy).toHaveBeenCalledWith('/token?grant_type=password', {
    email: 'test@example.com',
    password: 'Password123!'
  });
});

test('signup rejects with ROLE_PROVISIONING_FAILED and audits event when Admin API update fails and AUTH_AUTO_CONFIRM_EMAIL is true', async () => {
  const provider = {
    signup: jest.fn().mockRejectedValue(new AuthProviderError('admin_update_failed', 503, 'u-admin-fail')),
    config: { AUTH_AUTO_CONFIRM_EMAIL: true }
  } as any;
  const system = { query: jest.fn() } as any;
  const audit = { knownUserSecurityEvent: jest.fn().mockResolvedValue({}) } as any;
  const controller = new AuthProviderController(provider, system, audit);
  const response = { cookie: jest.fn() } as any;

  await expect(controller.signup({ email: 'adminfail@example.com', password: 'Password123!', register_as: 'candidate' }, response))
    .rejects.toThrow('ROLE_PROVISIONING_FAILED');

  expect(audit.knownUserSecurityEvent).toHaveBeenCalledWith(expect.objectContaining({
    userId: 'u-admin-fail',
    eventType: 'account_suspended',
    description: expect.stringContaining('Role/auto-confirm provisioning failed during signup')
  }));
});

test('signup succeeds as pending_verification when AUTH_AUTO_CONFIRM_EMAIL is false and SystemClient updates role', async () => {
  const provider = {
    signup: jest.fn().mockResolvedValue({ userId: 'u-manual-confirm', requiresVerification: true }),
    config: { AUTH_AUTO_CONFIRM_EMAIL: false }
  } as any;
  const system = { query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [] }) } as any;
  const audit = { knownUserSecurityEvent: jest.fn() } as any;
  const controller = new AuthProviderController(provider, system, audit);
  const response = { cookie: jest.fn() } as any;

  const result = await controller.signup({ email: 'manual@example.com', password: 'Password123!', register_as: 'employer' }, response);

  expect(system.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE public.users SET role = $1::public.user_role WHERE id = $2'), ['employer', 'u-manual-confirm']);
  expect(result).toEqual({ status: 'pending_verification', user_id: 'u-manual-confirm' });
});

test('deleteAdminUser returns true on HTTP 2xx response', async () => {
  const AuthProviderClass = require('./auth-provider').SupabaseAuthProvider;
  const instance = new AuthProviderClass({ SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SECRET_KEY: '123456789012345678901234567890' });
  const globalFetch = global.fetch;
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 } as any);
  try {
    const res = await instance.deleteAdminUser('u-del-success');
    expect(res).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith('https://project.supabase.co/auth/v1/admin/users/u-del-success', expect.objectContaining({ method: 'DELETE' }));
  } finally {
    global.fetch = globalFetch;
  }
});

test('deleteAdminUser returns false on HTTP non-2xx response', async () => {
  const AuthProviderClass = require('./auth-provider').SupabaseAuthProvider;
  const instance = new AuthProviderClass({ SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SECRET_KEY: '123456789012345678901234567890' });
  const globalFetch = global.fetch;
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'server_error' }) } as any);
  try {
    const res = await instance.deleteAdminUser('u-del-fail');
    expect(res).toBe(false);
  } finally {
    global.fetch = globalFetch;
  }
});

test('deleteAdminUser returns false on network exception', async () => {
  const AuthProviderClass = require('./auth-provider').SupabaseAuthProvider;
  const instance = new AuthProviderClass({ SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SECRET_KEY: '123456789012345678901234567890' });
  const globalFetch = global.fetch;
  global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
  try {
    const res = await instance.deleteAdminUser('u-del-net-err');
    expect(res).toBe(false);
  } finally {
    global.fetch = globalFetch;
  }
});

test('signup persists durable suspended status fallback when SystemClient query and deleteAdminUser both fail', async () => {
  const provider = { deleteAdminUser: jest.fn().mockResolvedValue(false), signup: jest.fn().mockResolvedValue({ userId: 'u-suspended-fail', requiresVerification: false }), config: { AUTH_AUTO_CONFIRM_EMAIL: true } } as any;
  const system = {
    query: jest.fn()
      .mockRejectedValueOnce(new Error('DB_ROLE_UPDATE_FAIL'))
      .mockResolvedValueOnce({ rows: [] })
  } as any;
  const audit = { knownUserSecurityEvent: jest.fn().mockResolvedValue({}) } as any;
  const controller = new AuthProviderController(provider, system, audit);
  const response = { cookie: jest.fn() } as any;

  await expect(controller.signup({ email: 'suspendedfail@example.com', password: 'Password123!', register_as: 'candidate' }, response))
    .rejects.toThrow('ROLE_PROVISIONING_FAILED');

  expect(provider.deleteAdminUser).toHaveBeenCalledWith('u-suspended-fail');
  expect(system.query).toHaveBeenNthCalledWith(2, expect.stringContaining("status = 'suspended'::public.account_status"), ['u-suspended-fail', 'suspendedfail@example.com', 'suspendedfail', 'candidate']);
  expect(audit.knownUserSecurityEvent).toHaveBeenCalledWith(expect.objectContaining({
    userId: 'u-suspended-fail',
    eventType: 'account_suspended',
    metadata: expect.objectContaining({ cleanup_success: false })
  }));
  expect(response.cookie).not.toHaveBeenCalled();
});

test('login rejects with UNAUTHORIZED when account status is suspended after provisioning failure', async () => {
  const provider = { login: jest.fn().mockResolvedValue({ userId: 'u-suspended-login', accessToken: 'token', refreshToken: 'ref' }), config: {} } as any;
  const system = { query: jest.fn().mockResolvedValue({ rows: [{ status: 'suspended', deleted_at: null, locked_until: null }] }) } as any;
  const audit = { loginAttempt: jest.fn().mockResolvedValue({}), knownUserSecurityEvent: jest.fn().mockResolvedValue({}) } as any;
  const controller = new AuthProviderController(provider, system, audit);
  const request = { ip: '127.0.0.1', headers: {} } as any;
  const response = { cookie: jest.fn() } as any;

  await expect(controller.login(request, { email: 'suspended@example.com', password: 'Password123!' }, response))
    .rejects.toThrow('UNAUTHORIZED');

  expect(audit.knownUserSecurityEvent).toHaveBeenCalledWith(expect.objectContaining({
    userId: 'u-suspended-login',
    eventType: 'account_suspended'
  }));
  expect(response.cookie).not.toHaveBeenCalled();
});

test('signup triggers cleanup and throws ROLE_PROVISIONING_FAILED when system.query returns rowCount 0', async () => {
  const provider = { deleteAdminUser: jest.fn().mockResolvedValue(true), signup: jest.fn().mockResolvedValue({ userId: 'u-zero-row', requiresVerification: false }), config: { AUTH_AUTO_CONFIRM_EMAIL: true } } as any;
  const system = { query: jest.fn().mockResolvedValue({ rowCount: 0, rows: [] }) } as any;
  const audit = { knownUserSecurityEvent: jest.fn().mockResolvedValue({}) } as any;
  const controller = new AuthProviderController(provider, system, audit);
  const response = { cookie: jest.fn() } as any;

  await expect(controller.signup({ email: 'zerorow@example.com', password: 'Password123!', register_as: 'candidate' }, response))
    .rejects.toThrow('ROLE_PROVISIONING_FAILED');

  expect(provider.deleteAdminUser).toHaveBeenCalledTimes(1);
  expect(provider.deleteAdminUser).toHaveBeenCalledWith('u-zero-row');
  expect(response.cookie).not.toHaveBeenCalled();
});

test('Auth user creation failure handles error safely without calling deleteAdminUser or setting cookies', async () => {
  const provider = { deleteAdminUser: jest.fn(), signup: jest.fn().mockRejectedValue(new AuthProviderError('invalid_password', 400)), config: {} } as any;
  const system = { query: jest.fn() } as any;
  const audit = { knownUserSecurityEvent: jest.fn() } as any;
  const controller = new AuthProviderController(provider, system, audit);
  const response = { cookie: jest.fn() } as any;

  await expect(controller.signup({ email: 'createfail@example.com', password: 'bad' }, response))
    .rejects.toThrow('VALIDATION_ERROR');

  expect(provider.deleteAdminUser).not.toHaveBeenCalled();
  expect(system.query).not.toHaveBeenCalled();
  expect(response.cookie).not.toHaveBeenCalled();
});

test('Admin API update failure triggers cleanup once and records durable suspended fallback when cleanup fails', async () => {
  const provider = {
    signup: jest.fn().mockRejectedValue(new AuthProviderError('admin_update_failed', 503, 'u-admin-cleanup-fail', false)),
    config: { AUTH_AUTO_CONFIRM_EMAIL: true }
  } as any;
  const system = { query: jest.fn().mockResolvedValue({ rows: [] }) } as any;
  const audit = { knownUserSecurityEvent: jest.fn().mockResolvedValue({}) } as any;
  const controller = new AuthProviderController(provider, system, audit);
  const response = { cookie: jest.fn() } as any;

  await expect(controller.signup({ email: 'admincleanupfail@example.com', password: 'Password123!', register_as: 'candidate' }, response))
    .rejects.toThrow('ROLE_PROVISIONING_FAILED');

  expect(system.query).toHaveBeenCalledWith(expect.stringContaining("status = 'suspended'::public.account_status"), ['u-admin-cleanup-fail', 'admincleanupfail@example.com', 'admincleanupfail', 'candidate']);
  expect(audit.knownUserSecurityEvent).toHaveBeenCalledWith(expect.objectContaining({
    userId: 'u-admin-cleanup-fail',
    eventType: 'account_suspended',
    description: expect.stringContaining('durable suspended state persisted'),
    metadata: expect.objectContaining({ cleanup_success: false, fallback_success: true })
  }));
  expect(response.cookie).not.toHaveBeenCalled();
});

test('SystemClient failure with cleanup failure and fallback failure audits suspended state persistence failed', async () => {
  const provider = { deleteAdminUser: jest.fn().mockResolvedValue(false), signup: jest.fn().mockResolvedValue({ userId: 'u-both-fail', requiresVerification: false }), config: { AUTH_AUTO_CONFIRM_EMAIL: true } } as any;
  const system = {
    query: jest.fn()
      .mockRejectedValueOnce(new Error('DB_ROLE_UPDATE_FAIL'))
      .mockRejectedValueOnce(new Error('DB_FALLBACK_FAIL'))
  } as any;
  const audit = { knownUserSecurityEvent: jest.fn().mockResolvedValue({}) } as any;
  const controller = new AuthProviderController(provider, system, audit);
  const response = { cookie: jest.fn() } as any;

  await expect(controller.signup({ email: 'bothfail@example.com', password: 'Password123!', register_as: 'candidate' }, response))
    .rejects.toThrow('ROLE_PROVISIONING_FAILED');

  expect(provider.deleteAdminUser).toHaveBeenCalledTimes(1);
  expect(audit.knownUserSecurityEvent).toHaveBeenCalledWith(expect.objectContaining({
    userId: 'u-both-fail',
    eventType: 'account_suspended',
    description: expect.stringContaining('suspended state persistence failed'),
    metadata: expect.objectContaining({ cleanup_success: false, fallback_success: false })
  }));
  expect(response.cookie).not.toHaveBeenCalled();
});

test('forgotPassword returns generic HTTP 200 success for both known and unknown emails (anti-enumeration)', async () => {
  const provider = { forgotPassword: jest.fn().mockResolvedValue(undefined) } as any;
  const system = {} as any;
  const audit = {} as any;
  const controller = new AuthProviderController(provider, system, audit);

  const knownRes = await controller.forgotPassword({ email: 'known@example.com' });
  expect(provider.forgotPassword).toHaveBeenCalledWith('known@example.com');
  expect(knownRes).toEqual({
    success: true,
    message: 'If an account exists with that email address, a password reset link has been sent.'
  });

  provider.forgotPassword.mockRejectedValueOnce(new Error('Unknown email'));
  const unknownRes = await controller.forgotPassword({ email: 'unknown@example.com' });
  expect(unknownRes).toEqual({
    success: true,
    message: 'If an account exists with that email address, a password reset link has been sent.'
  });
});

test('changePassword rejects invalid current password with HTTP 401 UNAUTHORIZED', async () => {
  const provider = { changePassword: jest.fn().mockRejectedValue(new AuthProviderError('invalid_password', 401)) } as any;
  const system = { query: jest.fn().mockResolvedValue({ rows: [{ email: 'user@example.com' }] }) } as any;
  const audit = {} as any;
  const controller = new AuthProviderController(provider, system, audit);

  await expect(controller.changePassword({ user: { sub: 'u1' } }, { current_password: 'WrongPassword!', new_password: 'NewPassword123!' }))
    .rejects.toThrow('UNAUTHORIZED');
});

test('changePassword updates password, records audit event without password values, and returns success', async () => {
  const provider = { changePassword: jest.fn().mockResolvedValue(undefined) } as any;
  const system = { query: jest.fn().mockResolvedValue({ rows: [{ email: 'user@example.com' }] }) } as any;
  const audit = { knownUserSecurityEvent: jest.fn().mockResolvedValue({}) } as any;
  const controller = new AuthProviderController(provider, system, audit);

  const result = await controller.changePassword({ user: { sub: 'u1' }, ip: '127.0.0.1' }, { current_password: 'OldPassword123!', new_password: 'NewPassword123!' });
  expect(provider.changePassword).toHaveBeenCalledWith('u1', 'user@example.com', 'OldPassword123!', 'NewPassword123!');
  expect(audit.knownUserSecurityEvent).toHaveBeenCalledWith({
    userId: 'u1',
    eventType: 'password_changed',
    description: 'User successfully changed password via authenticated endpoint',
    metadata: { ip_address: '127.0.0.1' }
  });
  expect(result).toEqual({ success: true, message: 'Password updated successfully.' });
});

test('refresh endpoint rejects old refresh token when refreshed token iat is before last_password_changed_at', async () => {
  // Construct a dummy JWT with iat = 1000000000 (issued long ago)
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: 'u1', iat: 1000000000 })).toString('base64url');
  const dummyJwt = `${header}.${payload}.signature`;

  const provider = { refresh: jest.fn().mockResolvedValue({ userId: 'u1', accessToken: dummyJwt }) } as any;
  const system = {
    query: jest.fn().mockResolvedValue({
      rows: [{ status: 'active', deleted_at: null, locked_until: null, last_password_changed_at: '2026-09-02T19:00:00.000Z' }]
    })
  } as any;
  const audit = {} as any;
  const controller = new AuthProviderController(provider, system, audit);
  const response = { clearCookie: jest.fn() } as any;

  await expect(controller.refresh({ cookies: { binay_refresh_token: 'old_refresh_token' } } as any, response))
    .rejects.toThrow('UNAUTHORIZED');

  expect(response.clearCookie).toHaveBeenCalledWith('binay_access_token', expect.any(Object));
  expect(response.clearCookie).toHaveBeenCalledWith('binay_refresh_token', expect.any(Object));
});

test('changePassword throws GLOBAL_LOGOUT_FAILED when login returns missing accessToken', async () => {
  const config = { SUPABASE_URL: 'http://localhost:9999', SUPABASE_SECRET_KEY: 'secret' } as any;
  const provider = new SupabaseAuthProvider(config);
  jest.spyOn(provider, 'login').mockResolvedValue({ accessToken: null, refreshToken: null, userId: 'u1', requiresVerification: false });
  const logoutSpy = jest.spyOn(provider, 'logoutGlobalUser');

  await expect(provider.changePassword('u1', 'user@example.com', 'CurrentPass1!', 'NewPass1!'))
    .rejects.toThrow('GLOBAL_LOGOUT_FAILED');

  expect(logoutSpy).not.toHaveBeenCalled();
});

test('changePassword throws GLOBAL_LOGOUT_FAILED when global logout returns false', async () => {
  const config = { SUPABASE_URL: 'http://localhost:9999', SUPABASE_SECRET_KEY: 'secret' } as any;
  const provider = new SupabaseAuthProvider(config);
  jest.spyOn(provider, 'login').mockResolvedValue({ accessToken: 'valid_token', refreshToken: 'ref_token', userId: 'u1', requiresVerification: false });
  jest.spyOn(provider, 'logoutGlobalUser').mockResolvedValue(false);

  await expect(provider.changePassword('u1', 'user@example.com', 'CurrentPass1!', 'NewPass1!'))
    .rejects.toThrow('GLOBAL_LOGOUT_FAILED');
});

test('resetPassword endpoint validates input and calls resetPasswordWithToken', async () => {
  const provider = { resetPasswordWithToken: jest.fn().mockResolvedValue(undefined) } as any;
  const system = {} as any;
  const audit = {} as any;
  const controller = new AuthProviderController(provider, system, audit);

  await expect(controller.resetPassword({ recovery_token: '', new_password: 'Password123!' }))
    .rejects.toThrow('VALIDATION_ERROR');

  await expect(controller.resetPassword({ recovery_token: 'valid_token', new_password: 'short' }))
    .rejects.toThrow('VALIDATION_ERROR');

  const result = await controller.resetPassword({ recovery_token: 'valid_token', new_password: 'ValidPassword123!' });
  expect(provider.resetPasswordWithToken).toHaveBeenCalledWith('valid_token', 'ValidPassword123!');
  expect(result).toEqual({ success: true, message: 'Password reset successfully.' });
});

test('resetPasswordWithToken sends PUT request to Supabase native /auth/v1/user endpoint', async () => {
  const config = { SUPABASE_URL: 'http://localhost:9999', SUPABASE_SECRET_KEY: 'secret_key' } as any;
  const provider = new SupabaseAuthProvider(config);

  const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
    expect(url).toBe('http://localhost:9999/auth/v1/user');
    expect(init?.method).toBe('PUT');
    expect(init?.headers).toEqual(expect.objectContaining({
      apikey: 'secret_key',
      Authorization: 'Bearer valid_recovery_token',
      'content-type': 'application/json'
    }));
    expect(JSON.parse(init?.body as string)).toEqual({ password: 'NewPassword123!' });
    return { ok: true } as Response;
  });

  await provider.resetPasswordWithToken('valid_recovery_token', 'NewPassword123!');
  expect(fetchSpy).toHaveBeenCalled();
  fetchSpy.mockRestore();
});