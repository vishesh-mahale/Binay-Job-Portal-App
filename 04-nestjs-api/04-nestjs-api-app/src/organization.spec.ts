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

test('branch creation rejects whitespace-only required fields', async () => {
  for (const dto of [
    { name: '  ', city: 'Pune', country: 'IN' },
    { name: 'HQ', city: '  ', country: 'IN' },
    { name: 'HQ', city: 'Pune', country: '  ' },
  ]) {
    const db = { query: jest.fn().mockResolvedValueOnce({ rowCount: 1, rows: [{}] }) } as any;
    await expect(new OrganizationService(db).branchCreate('u', 'company', dto))
      .rejects.toThrow('VALIDATION_ERROR');
    expect(db.query).toHaveBeenCalledTimes(1);
  }
});

test('branch update trims identity fields before persistence', async () => {
  const db = { query: jest.fn()
    .mockResolvedValueOnce({ rowCount: 1, rows: [{}] })
    .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'branch-1', name: 'HQ', city: 'Pune', country: 'IN' }] }) } as any;
  await expect(new OrganizationService(db).branchUpdate('u', 'company', 'branch-1', {
    name: '  HQ  ', city: ' Pune ', country: ' IN '
  })).resolves.toMatchObject({ name: 'HQ' });
  expect(db.query.mock.calls[1][1]).toEqual(['HQ', 'Pune', 'IN', 'branch-1', 'company']);
});

test.each([
  ['department', (service: OrganizationService) => service.departmentUpdate('u', 'company', 'department-1', { name: '  ' })],
  ['team', (service: OrganizationService) => service.teamUpdate('u', 'company', 'team-1', { name: '  ' })],
])('%s update rejects a whitespace-only name', async (_label, invoke) => {
  const db = { query: jest.fn().mockResolvedValueOnce({ rowCount: 1, rows: [{}] }) } as any;
  await expect(invoke(new OrganizationService(db))).rejects.toThrow('VALIDATION_ERROR');
  expect(db.query).toHaveBeenCalledTimes(1);
});

test('branch update remains company-scoped and ignores unknown fields', async () => {
  const db = { query: jest.fn()
    .mockResolvedValueOnce({ rowCount: 1, rows: [{}] })
    .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'branch-1', name: 'HQ' }] }) } as any;
  await expect(new OrganizationService(db).branchUpdate('u', 'company-a', 'branch-1', {
    name: ' HQ ', unknown_field: 'should-not-persist'
  } as any)).resolves.toMatchObject({ id: 'branch-1' });
  expect(db.query.mock.calls[1][0]).toContain('company_id=$3');
  expect(db.query.mock.calls[1][0]).not.toContain('unknown_field');
  expect(db.query.mock.calls[1][1]).toEqual(['HQ', 'branch-1', 'company-a']);
});

test('department creation checks active same-company head membership', async () => {
  const db = { query: jest.fn()
    .mockResolvedValueOnce({ rowCount: 1, rows: [{}] })
    .mockResolvedValueOnce({ rowCount: 0, rows: [] }) } as any;
  await expect(new OrganizationService(db).departmentCreate('owner', 'c1', { name: 'Engineering', head_member_id: 'm1' }))
    .rejects.toBeInstanceOf(ForbiddenException);
  expect(db.query.mock.calls[1][0]).toContain('company_id=$2 AND is_active=true');
});

test('team creation checks active parent department company scope', async () => {
  const db = { query: jest.fn()
    .mockResolvedValueOnce({ rowCount: 1, rows: [{}] })
    .mockResolvedValueOnce({ rowCount: 0, rows: [] }) } as any;
  await expect(new OrganizationService(db).teamCreate('owner', 'c1', { department_id: 'd-other', name: 'Platform' }))
    .rejects.toBeInstanceOf(ForbiddenException);
  expect(db.query.mock.calls[1][0]).toContain('company_id=$2 AND is_active=true');
});
