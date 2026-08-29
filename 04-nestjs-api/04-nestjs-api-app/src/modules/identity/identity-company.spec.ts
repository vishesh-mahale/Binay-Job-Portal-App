import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IdentityService } from './identity-company';

test('identity me reads only through the user-context client and raw access token', async () => {
  const userClient = { queryAsUser: jest.fn().mockResolvedValue({ rows: [{ id: 'u1', email: 'u@example.test' }] }) } as any;
  const system = { query: jest.fn() } as any;
  const service = new IdentityService(userClient, system);
  await expect(service.me({ rawAccessToken: 'token', user: { sub: 'u1' } } as any)).resolves.toMatchObject({ id: 'u1' });
  expect(userClient.queryAsUser).toHaveBeenCalledWith('token', expect.stringContaining('deleted_at IS NULL'), ['u1']);
  expect(system.query).not.toHaveBeenCalled();
});

test('identity me fails closed when the user row is absent', async () => {
  const userClient = { queryAsUser: jest.fn().mockResolvedValue({ rows: [] }) } as any;
  await expect(new IdentityService(userClient, {} as any).me({ rawAccessToken: 'token', user: { sub: 'u1' } } as any)).rejects.toBeInstanceOf(NotFoundException);
});

test('sessions are listed for the authenticated user only', async () => {
  const system = { query: jest.fn().mockResolvedValue({ rows: [{ id: 's1', user_id: 'u1' }] }) } as any;
  await expect(new IdentityService({} as any, system).sessions('u1')).resolves.toEqual([{ id: 's1', user_id: 'u1' }]);
  expect(system.query).toHaveBeenCalledWith(expect.stringContaining('FROM public.user_sessions'), ['u1']);
  expect(system.query.mock.calls[0][0]).toContain('WHERE user_id = $1');
});

test('single-session revoke validates UUID and scopes the update to the user', async () => {
  const sessionId = '11111111-1111-4111-8111-111111111111';
  const system = { query: jest.fn().mockResolvedValue({ rows: [{ id: sessionId, is_online: false }] }) } as any;
  await expect(new IdentityService({} as any, system).revoke('u1', sessionId)).resolves.toMatchObject({ id: sessionId, is_online: false });
  expect(system.query).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1 AND user_id = $2'), [sessionId, 'u1']);
});

test('single-session revoke rejects malformed ids and unknown sessions', async () => {
  const system = { query: jest.fn().mockResolvedValue({ rows: [] }) } as any;
  const service = new IdentityService({} as any, system);
  await expect(service.revoke('u1', 'not-a-uuid')).rejects.toBeInstanceOf(BadRequestException);
  await expect(service.revoke('u1', '11111111-1111-4111-8111-111111111111')).rejects.toBeInstanceOf(NotFoundException);
});