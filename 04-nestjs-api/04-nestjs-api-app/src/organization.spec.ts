import { ForbiddenException } from '@nestjs/common';
import { OrganizationService } from './organization';

function service(query: any) { return new OrganizationService({ query } as any); }

test('branch creation rejects a non-company administrator', async () => {
  const query = jest.fn().mockResolvedValue({ rowCount: 0, rows: [] });
  await expect(service(query).branchCreate('u1', 'c1', { name: 'HQ', city: 'Pune', country: 'IN' }))
    .rejects.toBeInstanceOf(ForbiddenException);
});

test('department creation rejects an inactive or cross-company head member', async () => {
  const query = jest.fn()
    .mockResolvedValueOnce({ rowCount: 1, rows: [{}] })
    .mockResolvedValueOnce({ rowCount: 0, rows: [] });
  await expect(service(query).departmentCreate('owner', 'c1', { name: 'Engineering', head_member_id: 'm1' }))
    .rejects.toBeInstanceOf(ForbiddenException);
  expect(query.mock.calls[1][0]).toContain('company_id=$2 AND is_active=true');
});

test('team creation rejects a department outside the company', async () => {
  const query = jest.fn()
    .mockResolvedValueOnce({ rowCount: 1, rows: [{}] })
    .mockResolvedValueOnce({ rowCount: 0, rows: [] });
  await expect(service(query).teamCreate('owner', 'c1', { department_id: 'd-other', name: 'Platform' }))
    .rejects.toBeInstanceOf(ForbiddenException);
  expect(query.mock.calls[1][0]).toContain('company_id=$2 AND is_active=true');
});

test('branch update uses company scope and rejects an unknown branch', async () => {
  const query = jest.fn()
    .mockResolvedValueOnce({ rowCount: 1, rows: [{}] })
    .mockResolvedValueOnce({ rowCount: 0, rows: [] });
  await expect(service(query).branchUpdate('owner', 'c1', 'b-other', { name: 'Remote' }))
    .rejects.toBeInstanceOf(ForbiddenException);
  expect(query.mock.calls[1][0]).toContain('id=$2 AND company_id=$3');
  expect(query.mock.calls[1][1]).toEqual(['Remote', 'b-other', 'c1']);
});
