import { CompanyService, CompanyController } from './companies';
import { MembershipService } from './membership';
import { AdminCompanyService } from './admin-company';
import { OrganizationService } from './organization';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('Phase 09-B Corrected Flow & Safeguards', () => {
  let systemClientMock: any;

  beforeEach(() => {
    systemClientMock = {
      query: jest.fn(),
      transaction: jest.fn((cb) => cb(systemClientMock)),
    };
  });

  describe('Race-Safe Duplicate Company Protection & Lock Acquisition', () => {
    it('acquires advisory lock on same transaction client before checking active company', async () => {
      const service = new CompanyService(systemClientMock);

      // 1. assertEmployer
      systemClientMock.query.mockResolvedValueOnce({ rows: [{ role: 'employer', status: 'active' }], rowCount: 1 });
      // 2. pg_advisory_xact_lock
      systemClientMock.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // 3. active company check (no company exists)
      systemClientMock.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // 4. insert company
      systemClientMock.query.mockResolvedValueOnce({
        rows: [{ id: 'c-1', name: 'Acme', slug: 'acme', verification_status: 'unverified' }],
        rowCount: 1,
      });
      // 5. insert owner member
      systemClientMock.query.mockResolvedValueOnce({ rowCount: 1 });
      // 6. insert settings
      systemClientMock.query.mockResolvedValueOnce({ rowCount: 1 });

      const res = await service.create('u-owner-1', { name: 'Acme', slug: 'acme', email: 'acme@test.com' });

      expect(res.id).toBe('c-1');
      // Assert pg_advisory_xact_lock was acquired on transaction client before checking
      expect(systemClientMock.query).toHaveBeenCalledWith(
        expect.stringContaining('pg_advisory_xact_lock'),
        ['u-owner-1']
      );
    });

    it('rejects duplicate company creation when active company exists for owner', async () => {
      const service = new CompanyService(systemClientMock);

      // 1. assertEmployer
      systemClientMock.query.mockResolvedValueOnce({ rows: [{ role: 'employer', status: 'active' }], rowCount: 1 });
      // 2. pg_advisory_xact_lock
      systemClientMock.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // 3. active company check (company ALREADY exists)
      systemClientMock.query.mockResolvedValueOnce({ rows: [{ id: 'c-existing' }], rowCount: 1 });

      await expect(
        service.create('u-owner-1', { name: 'Duplicate Acme', slug: 'dup', email: 'dup@test.com' })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Email Member Invite & Identity Verification', () => {
    it('resolves existing registered user by email and creates pending member row', async () => {
      const service = new MembershipService({
        transaction: async (cb: any) => cb(systemClientMock),
        query: jest.fn(),
      } as any);

      // 1. assertAdmin
      systemClientMock.query.mockResolvedValueOnce({ rows: [{}], rowCount: 1 });
      // 2. email lookup in public.users
      systemClientMock.query.mockResolvedValueOnce({
        rows: [{ id: 'u-target-123', status: 'active', deleted_at: null }],
        rowCount: 1,
      });
      // 3. target user lookup
      systemClientMock.query.mockResolvedValueOnce({
        rows: [{ id: 'u-target-123', status: 'active', deleted_at: null }],
        rowCount: 1,
      });
      // 4. organizational refs check
      systemClientMock.query.mockResolvedValueOnce({
        rows: [{ branch_ok: true, department_ok: true, team_ok: true, manager_ok: true }],
        rowCount: 1,
      });
      // 5. existing membership check
      systemClientMock.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // 6. insert member
      systemClientMock.query.mockResolvedValueOnce({
        rows: [{ id: 'm-1', company_id: 'c-1', user_id: 'u-target-123', is_active: false }],
        rowCount: 1,
      });
      // 7. audit log
      systemClientMock.query.mockResolvedValueOnce({ rowCount: 1 });

      const res = await service.add('u-admin-1', 'c-1', { email: 'invitee@test.com', title: 'Developer' });

      expect(res.user_id).toBe('u-target-123');
      expect(res.is_active).toBe(false);
    });

    it('throws 404 NOT_FOUND when invitee email does not exist in public.users', async () => {
      const service = new MembershipService({
        transaction: async (cb: any) => cb(systemClientMock),
        query: jest.fn(),
      } as any);

      // 1. assertAdmin
      systemClientMock.query.mockResolvedValueOnce({ rows: [{}], rowCount: 1 });
      // 2. email lookup (returns 0 rows)
      systemClientMock.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(
        service.add('u-admin-1', 'c-1', { email: 'nonexistent@test.com' })
      ).rejects.toThrow(NotFoundException);
    });

    it('strictly checks authenticated user identity matching user_id on accept', async () => {
      const service = new MembershipService({
        transaction: async (cb: any) => cb(systemClientMock),
        query: jest.fn(),
      } as any);

      // 1. company verification check
      systemClientMock.query.mockResolvedValueOnce({ rows: [{}], rowCount: 1 });
      // 2. update query matching company_id and user_id === uid
      systemClientMock.query.mockResolvedValueOnce({
        rows: [{ id: 'm-1', user_id: 'u-invitee-123', is_active: true }],
        rowCount: 1,
      });
      // 3. audit log
      systemClientMock.query.mockResolvedValueOnce({ rowCount: 1 });

      const res = await service.accept('u-invitee-123', 'c-1');
      expect(res.is_active).toBe(true);

      // Verify user_id in UPDATE query was strictly 'u-invitee-123'
      expect(systemClientMock.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE company_id=$1 AND user_id=$2'),
        ['c-1', 'u-invitee-123']
      );
    });
  });

  describe('Organization List Endpoints', () => {
    it('returns company-scoped branch list for active owner/member', async () => {
      const service = new OrganizationService(systemClientMock);

      // 1. assertMemberOrOwner
      systemClientMock.query.mockResolvedValueOnce({ rows: [{}], rowCount: 1 });
      // 2. select branches
      systemClientMock.query.mockResolvedValueOnce({
        rows: [{ id: 'b-1', name: 'Delhi HQ' }, { id: 'b-2', name: 'Mumbai' }],
        rowCount: 2,
      });

      const res = await service.branchList('u-owner', 'c-1');
      expect(res.length).toBe(2);
      expect(res[0].name).toBe('Delhi HQ');
    });
  });
});
