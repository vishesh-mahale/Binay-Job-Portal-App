import { mapFailureReason } from './auth-provider';
import { AuthProviderController } from './auth-provider';

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
  const provider = {} as any;
  const system = { query: jest.fn().mockResolvedValue({ rows: [] }) } as any;
  const audit = {} as any;
  const controller = new AuthProviderController(provider, system, audit);
  const response = { clearCookie: jest.fn() } as any;
  await controller.logout({ user: { sub: 'u1' }, cookies: { binay_presence_session: 's1' } }, response);
  expect(system.query).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1 AND user_id = $2'), ['s1', 'u1']);
  expect(response.clearCookie).toHaveBeenCalledWith('binay_presence_session', expect.objectContaining({ path: '/api/v1' }));
});
