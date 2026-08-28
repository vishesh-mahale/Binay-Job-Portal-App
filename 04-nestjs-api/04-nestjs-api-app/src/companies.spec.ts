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

