import { OrganizationService } from './organization';
import { ForbiddenException } from '@nestjs/common';

test('organization mutation rejects non-company admin', async () => {
  const db = { query: jest.fn().mockResolvedValue({ rowCount: 0, rows: [] }) } as any;
  await expect(new OrganizationService(db).branchCreate('u','company',{ name:'HQ', city:'Noida', country:'IN' })).rejects.toBeInstanceOf(ForbiddenException);
});

test('organization member reference must belong to same company', async () => {
  const db = { query: jest.fn()
    .mockResolvedValueOnce({ rowCount:1, rows:[{}] })
    .mockResolvedValueOnce({ rowCount:0, rows:[] }) } as any;
  await expect(new OrganizationService(db).departmentCreate('u','company',{ name:'Engineering', head_member_id:'foreign-member' })).rejects.toBeInstanceOf(ForbiddenException);
});

test('team creation rejects an inactive parent department', async () => {
  const db = { query: jest.fn()
    .mockResolvedValueOnce({ rowCount: 1, rows: [{}] }) // admin
    .mockResolvedValueOnce({ rowCount: 1, rows: [{}] }) // lead member belongs to company
    .mockResolvedValueOnce({ rowCount: 0, rows: [] }) } as any; // inactive/missing department
  const service = new OrganizationService(db);

  await expect(service.teamCreate('u', 'company', {
    department_id: 'department', name: 'Platform', lead_member_id: 'member'
  })).rejects.toBeInstanceOf(ForbiddenException);
  expect(db.query.mock.calls[2][0]).toContain('is_active=true');
});

test('team creation proceeds with an active parent department', async () => {
  const db = { query: jest.fn()
    .mockResolvedValueOnce({ rowCount: 1, rows: [{}] })
    .mockResolvedValueOnce({ rowCount: 1, rows: [{}] })
    .mockResolvedValueOnce({ rowCount: 1, rows: [{}] })
    .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'team-1', department_id: 'department', name: 'Platform' }] }) } as any;
  const service = new OrganizationService(db);

  await expect(service.teamCreate('u', 'company', {
    department_id: 'department', name: 'Platform', lead_member_id: 'member'
  })).resolves.toMatchObject({ id: 'team-1' });
});

test('department creation rejects a blank name before member lookup', async () => {
  const db = { query: jest.fn().mockResolvedValueOnce({ rowCount: 1, rows: [{}] }) } as any;
  await expect(new OrganizationService(db).departmentCreate('u', 'company', { name: '   ' }))
    .rejects.toThrow('VALIDATION_ERROR');
  expect(db.query).toHaveBeenCalledTimes(1);
});

test('team creation rejects missing department or blank name before database lookup', async () => {
  const db = { query: jest.fn().mockResolvedValue({ rowCount: 1, rows: [{}] }) } as any;
  await expect(new OrganizationService(db).teamCreate('u', 'company', { department_id: '', name: 'Platform' }))
    .rejects.toThrow('VALIDATION_ERROR');
  await expect(new OrganizationService(db).teamCreate('u', 'company', { department_id: 'department', name: '  ' }))
    .rejects.toThrow('VALIDATION_ERROR');
  expect(db.query).toHaveBeenCalledTimes(2);
});
