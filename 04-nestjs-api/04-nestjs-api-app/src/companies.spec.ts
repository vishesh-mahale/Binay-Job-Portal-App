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
