import { AdminCompanyService, AdminCompanyController } from './admin-company';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('AdminCompanyService & Controller', () => {
  let service: AdminCompanyService;
  let controller: AdminCompanyController;
  let systemClientMock: any;

  beforeEach(() => {
    systemClientMock = {
      query: jest.fn(),
      transaction: jest.fn((cb) => cb(systemClientMock)),
    };
    service = new AdminCompanyService(systemClientMock);
    controller = new AdminCompanyController(service);
  });

  it('rejects verification if user is not platform admin', async () => {
    systemClientMock.query.mockResolvedValueOnce({
      rows: [{ role: 'employer', status: 'active' }],
      rowCount: 1,
    });

    await expect(
      controller.verifyCompany(
        { user: { sub: 'u-employer' } } as any,
        'c-1',
        { verification_status: 'verified' }
      )
    ).rejects.toThrow(ForbiddenException);
  });

  it('approves company verification and sets verified_at timestamp when user is admin', async () => {
    // 1. assertPlatformAdmin check
    systemClientMock.query.mockResolvedValueOnce({
      rows: [{ role: 'admin', status: 'active' }],
      rowCount: 1,
    });
    // 2. existing company FOR UPDATE query
    systemClientMock.query.mockResolvedValueOnce({
      rows: [{ id: 'c-1', verification_status: 'unverified', verified_at: null }],
      rowCount: 1,
    });
    // 3. update query
    systemClientMock.query.mockResolvedValueOnce({
      rows: [{ id: 'c-1', verification_status: 'verified', verified_at: '2026-09-03T12:00:00Z' }],
      rowCount: 1,
    });
    // 4. audit log insert
    systemClientMock.query.mockResolvedValueOnce({ rowCount: 1 });

    const result = await controller.verifyCompany(
      { user: { sub: 'u-admin' } } as any,
      'c-1',
      { verification_status: 'verified' }
    );

    expect(result.verification_status).toBe('verified');
    expect(result.verified_at).toBeDefined();
    expect(systemClientMock.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE public.companies'),
      expect.arrayContaining(['verified', expect.any(String), 'c-1'])
    );
  });

  it('sets verified_at to NULL when status is rejected or pending', async () => {
    // 1. assertPlatformAdmin check
    systemClientMock.query.mockResolvedValueOnce({
      rows: [{ role: 'admin', status: 'active' }],
      rowCount: 1,
    });
    // 2. existing company FOR UPDATE query
    systemClientMock.query.mockResolvedValueOnce({
      rows: [{ id: 'c-1', verification_status: 'verified', verified_at: '2026-09-03T12:00:00Z' }],
      rowCount: 1,
    });
    // 3. update query
    systemClientMock.query.mockResolvedValueOnce({
      rows: [{ id: 'c-1', verification_status: 'rejected', verified_at: null }],
      rowCount: 1,
    });
    // 4. audit log insert
    systemClientMock.query.mockResolvedValueOnce({ rowCount: 1 });

    const result = await controller.verifyCompany(
      { user: { sub: 'u-admin' } } as any,
      'c-1',
      { verification_status: 'rejected', rejection_reason: 'Invalid documents' }
    );

    expect(result.verification_status).toBe('rejected');
    expect(result.verified_at).toBeNull();
  });
});
