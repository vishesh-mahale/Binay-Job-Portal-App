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
