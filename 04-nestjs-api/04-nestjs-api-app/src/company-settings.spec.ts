import { CompanySettingsService } from './company-settings';
import { ForbiddenException } from '@nestjs/common';

test('owner updates approval setting atomically and audits effective change', async () => {
  const client = { query: jest.fn()
    .mockResolvedValueOnce({ rowCount: 1, rows: [{}] })
    .mockResolvedValueOnce({ rows: [{ company_id: 'c1', job_approval_required: false }] })
    .mockResolvedValueOnce({ rows: [{ company_id: 'c1', job_approval_required: true }] })
    .mockResolvedValueOnce({ rows: [] }) } as any;
  const db = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
  const result = await new CompanySettingsService(db).update('u1', 'c1', { job_approval_required: true });
  expect(result.job_approval_required).toBe(true);
  expect(client.query.mock.calls[3][0]).toContain('company.settings_updated');
});

test('non-owner/non-admin cannot update settings', async () => {
  const client = { query: jest.fn().mockResolvedValueOnce({ rowCount: 0, rows: [] }) } as any;
  const db = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
  await expect(new CompanySettingsService(db).update('u2', 'c1', { job_approval_required: true })).rejects.toBeInstanceOf(ForbiddenException);
});

test('same value is idempotent and does not write audit', async () => {
  const client = { query: jest.fn()
    .mockResolvedValueOnce({ rowCount: 1, rows: [{}] })
    .mockResolvedValueOnce({ rows: [{ company_id: 'c1', job_approval_required: false }] }) } as any;
  const db = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
  await new CompanySettingsService(db).update('u1', 'c1', { job_approval_required: false });
  expect(client.query).toHaveBeenCalledTimes(2);
});
