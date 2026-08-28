import { MembershipService } from './membership';
import { ForbiddenException } from '@nestjs/common';

function db(client: any) { return { transaction: async (fn: any) => fn(client), query: jest.fn() } as any; }

test('membership add rejects non-admin actor', async () => {
  const client = { query: jest.fn().mockResolvedValue({ rowCount: 0, rows: [] }) };
  const service = new MembershipService(db(client));
  await expect(service.add('actor','company',{ user_id:'target' })).rejects.toBeInstanceOf(ForbiddenException);
});

test('membership leave rejects company owner', async () => {
  const client = { query: jest.fn()
    .mockResolvedValueOnce({ rowCount:1, rows:[{ id:'m1', user_id:'owner', is_active:true }] })
    .mockResolvedValueOnce({ rowCount:1, rows:[{ owner_id:'owner' }] }) };
  const service = new MembershipService(db(client));
  await expect(service.leave('owner','company')).rejects.toBeInstanceOf(ForbiddenException);
});

test('membership rejoin request does not reactivate row', async () => {
  const client = { query: jest.fn().mockResolvedValueOnce({ rowCount:1, rows:[{ id:'m1', user_id:'u', rejoin_requested_at:'now' }] }).mockResolvedValue({}) };
  const service = new MembershipService(db(client));
  await expect(service.rejoin('u','company')).resolves.toMatchObject({ id:'m1' });
  expect(client.query).toHaveBeenCalledWith(expect.stringContaining('rejoin_requested_at=NOW()'), ['company','u']);
});

test('membership add requires active organizational references', async () => {
  const client = { query: jest.fn()
    .mockResolvedValueOnce({ rowCount: 1, rows: [{}] }) // admin check
    .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'target', status: 'active', deleted_at: null }] })
    .mockResolvedValueOnce({ rowCount: 1, rows: [{ branch_ok: false, department_ok: true, team_ok: true, manager_ok: true }] }) };
  const service = new MembershipService(db(client));

  await expect(service.add('actor', 'company', {
    user_id: 'target', branch_id: 'inactive-branch'
  })).rejects.toThrow('VALIDATION_ERROR');

  expect(client.query.mock.calls[2][0]).toContain('b.is_active=true');
  expect(client.query.mock.calls[2][0]).toContain('m.is_active=true');
});
