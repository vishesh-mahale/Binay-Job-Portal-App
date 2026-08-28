import { CompanyService } from './companies';
import { ForbiddenException } from '@nestjs/common';

test('company create rejects inactive/non-employer user', async () => {
  const system = { query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [{ role:'candidate', status:'active' }] }) } as any;
  await expect(new CompanyService(system).create('u',{ name:'Acme', slug:'acme', email:'a@acme.test' })).rejects.toBeInstanceOf(ForbiddenException);
});

test('company read fails closed for another company', async () => {
  const system = { query: jest.fn().mockResolvedValue({ rowCount: 0, rows: [] }) } as any;
  await expect(new CompanyService(system).get('u','other-company')).rejects.toBeInstanceOf(ForbiddenException);
});

test('company update succeeds for owner and returns shielded response fields', async () => {
  const system = {
    query: jest.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'comp-1', name: 'Acme' }] }) // get()
      .mockResolvedValueOnce({ rows: [{ owner_id: 'user-1' }] }) // ownerCheck
      .mockResolvedValueOnce({ rows: [{ id: 'comp-1', name: 'Acme Updated' }] }) // update()
  } as any;
  const service = new CompanyService(system);
  const result = await service.update('user-1', 'comp-1', { name: 'Acme Updated' });
  expect(result.name).toBe('Acme Updated');
  expect(system.query).toHaveBeenCalledWith(expect.stringContaining('RETURNING id,name,slug'), expect.any(Array));
});

test('company update trims a provided name and rejects whitespace-only names', async () => {
  const system = {
    query: jest.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'comp-1', name: 'Acme' }] })
      .mockResolvedValueOnce({ rows: [{ owner_id: 'user-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'comp-1', name: 'Acme Updated' }] })
  } as any;
  await expect(new CompanyService(system).update('user-1', 'comp-1', { name: ' Acme Updated ' }))
    .resolves.toMatchObject({ name: 'Acme Updated' });
  expect(system.query.mock.calls[2][1]).toEqual(['Acme Updated', 'comp-1']);

  const invalid = { query: jest.fn().mockResolvedValueOnce({ rows: [{ id: 'comp-1', name: 'Acme' }] })
    .mockResolvedValueOnce({ rows: [{ owner_id: 'user-1' }] }) } as any;
  await expect(new CompanyService(invalid).update('user-1', 'comp-1', { name: '   ' }))
    .rejects.toThrow('VALIDATION_ERROR');
});
