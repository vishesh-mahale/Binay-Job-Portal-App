import { AuthAuditService } from './auth-audit';

test('writes a successful email login without a failure reason', async () => {
  const system = { query: jest.fn().mockResolvedValue({ rows: [] }) } as any;
  const service = new AuthAuditService(system);
  await service.loginAttempt({ userId: 'u1', email: 'v@example.com', success: true, ipAddress: '127.0.0.1', userAgent: 'test' });
  expect(system.query).toHaveBeenCalledWith(expect.stringContaining('public.login_history'), expect.arrayContaining(['u1', 'v@example.com', true, null, '127.0.0.1', 'test']));
});

test('writes a failed attempt with a nullable user id', async () => {
  const system = { query: jest.fn().mockResolvedValue({ rows: [] }) } as any;
  const service = new AuthAuditService(system);
  await service.loginAttempt({ email: 'unknown@example.com', success: false, failureReason: 'user_not_found' });
  expect(system.query.mock.calls[0][1]).toEqual([null, 'unknown@example.com', false, 'user_not_found', null, null, 'email_password', null]);
});

test('supports provider-aware OAuth audit rows', async () => {
  const system = { query: jest.fn().mockResolvedValue({ rows: [] }) } as any;
  const service = new AuthAuditService(system);
  await service.loginAttempt({ userId: 'u1', email: 'v@example.com', success: true, loginType: 'oauth', authProvider: 'google' });
  expect(system.query.mock.calls[0][1].slice(6)).toEqual(['oauth', 'google']);
});

test('writes known-user security events through the system client', async () => {
  const system = { query: jest.fn().mockResolvedValue({ rows: [] }) } as any;
  const service = new AuthAuditService(system);
  await service.knownUserSecurityEvent({ userId: 'u1', eventType: 'login_failed', description: 'Login attempt failed', metadata: { ip_address: '127.0.0.1' } });
  expect(system.query).toHaveBeenCalledWith(expect.stringContaining('public.user_security_log'), ['u1', 'login_failed', 'Login attempt failed', JSON.stringify({ ip_address: '127.0.0.1' })]);
});
