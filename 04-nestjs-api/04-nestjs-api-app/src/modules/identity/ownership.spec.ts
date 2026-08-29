import { OwnershipService } from './ownership';
import { ForbiddenException } from '@nestjs/common';

test('ownership transfer rejects non-owner', async () => {
  const client = { query: jest.fn().mockResolvedValueOnce({ rowCount:1, rows:[{ id:'c', owner_id:'actual-owner' }] }) };
  const service = new OwnershipService({ transaction: async (fn:any) => fn(client) } as any);
  await expect(service.transfer('other','c',{ new_owner_user_id:'target' })).rejects.toBeInstanceOf(ForbiddenException);
});

test('ownership transfer updates owner and writes audit in one transaction', async () => {
  const client = { query: jest.fn()
    .mockResolvedValueOnce({ rowCount:1, rows:[{ id:'c', owner_id:'old' }] })
    .mockResolvedValueOnce({ rowCount:1, rows:[{ user_id:'new' }] })
    .mockResolvedValueOnce({ rowCount:1, rows:[{ id:'c', owner_id:'new' }] })
    .mockResolvedValueOnce({ rowCount:1, rows:[] }) };
  const service = new OwnershipService({ transaction: async (fn:any) => fn(client) } as any);
  await expect(service.transfer('old','c',{ new_owner_user_id:'new' })).resolves.toMatchObject({ owner_id:'new' });
  expect(client.query).toHaveBeenLastCalledWith(expect.stringContaining('audit_logs'), ['c','old','new']);
});

test('ownership transfer rejects a target who is not an active company member', async () => {
  const client = { query: jest.fn()
    .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'c', owner_id: 'old' }] })
    .mockResolvedValueOnce({ rowCount: 0, rows: [] }) };
  const service = new OwnershipService({ transaction: async (fn:any) => fn(client) } as any);

  await expect(service.transfer('old', 'c', { new_owner_user_id: 'inactive-target' }))
    .rejects.toThrow('NOT_FOUND');
});