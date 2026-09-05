import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CompanyInvitationService } from './company-invitation';
import { setSessionCookies } from '../auth/auth-provider';
import { SystemClient } from '../../infrastructure/database/clients';

describe('CompanyInvitationService Automatic Authenticated Acceptance & Security Unit Tests', () => {
  let service: CompanyInvitationService;
  let mockClient: any;
  let mockDb: any;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
    };
    mockDb = {
      transaction: jest.fn(async (cb: any) => cb(mockClient)),
    };
    service = new CompanyInvitationService(mockDb as unknown as SystemClient);
  });

  it('1. Replay Check Ordering: Already accepted invitation throws INVITATION_ALREADY_ACCEPTED first', async () => {
    mockClient.query.mockResolvedValue({
      rowCount: 1,
      rows: [{
        id: 'inv-1',
        company_id: 'comp-1',
        email: 'hr@acme.com',
        status: 'accepted',
        expires_at: new Date(Date.now() + 86400000),
      }],
    });

    await expect(
      service.internalAcceptInvitation(mockClient, 'user-1', 'hr@acme.com', 'raw_token_123')
    ).rejects.toThrow(BadRequestException);

    try {
      await service.internalAcceptInvitation(mockClient, 'user-1', 'hr@acme.com', 'raw_token_123');
    } catch (err: any) {
      expect(err.message).toBe('INVITATION_ALREADY_ACCEPTED');
    }
  });

  it('2. Rejects acceptance if authenticated canonical email does not match invitation.email (HTTP 400 EMAIL_MISMATCH)', async () => {
    mockClient.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        id: 'inv-1',
        company_id: 'comp-1',
        email: 'hr@acme.com',
        status: 'pending',
        expires_at: new Date(Date.now() + 86400000),
      }],
    });

    await expect(
      service.internalAcceptInvitation(mockClient, 'user-1', 'other_user@acme.com', 'raw_token_123')
    ).rejects.toThrow(BadRequestException);
  });

  it('3. Rejects signupWithInvite if invited email already maps to an existing account (HTTP 400 EXISTING_USER_CANNOT_BE_INVITED)', async () => {
    mockClient.query.mockImplementation(async (queryText: string) => {
      const q = queryText.toLowerCase();
      if (q.includes('company_invitations')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'inv-1',
            email: 'existing_hr@acme.com',
            status: 'pending',
            expires_at: new Date(Date.now() + 86400000),
          }],
        };
      }
      if (q.includes('public.users')) {
        return {
          rowCount: 1,
          rows: [{ id: 'existing-user-uuid-123' }],
        };
      }
      return { rowCount: 0, rows: [] };
    });

    const mockRes = { cookie: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() } as any;

    await expect(
      service.signupWithInvite({ token: 'raw_token_123', password: 'password123' }, mockRes)
    ).rejects.toThrow('EXISTING_USER_CANNOT_BE_INVITED');
  });

  it('4. Refresh Cookie Path Regression Guard: Verifies setSessionCookies helper sets path /api/v1/auth/refresh for refresh token', () => {
    const mockRes = { cookie: jest.fn() } as any;
    const session = { accessToken: 'access_abc', refreshToken: 'refresh_xyz', userId: 'u1', requiresVerification: false };

    setSessionCookies(mockRes, session, false);

    expect(mockRes.cookie).toHaveBeenCalledWith('binay_access_token', 'access_abc', { httpOnly: true, secure: false, sameSite: 'lax', path: '/' });
    expect(mockRes.cookie).toHaveBeenCalledWith('binay_refresh_token', 'refresh_xyz', { httpOnly: true, secure: false, sameSite: 'lax', path: '/api/v1/auth/refresh' });
  });

  it('5. Successfully executes atomic PostgreSQL acceptance & returns safe response without raw token or secret leaks', async () => {
    mockClient.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 'inv-1',
          company_id: 'comp-1',
          email: 'hr@acme.com',
          status: 'pending',
          branch_id: null,
          department_id: null,
          team_id: null,
          title: 'HR Lead',
          is_primary_hr: false,
          permissions: {},
          expires_at: new Date(Date.now() + 86400000),
        }],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '0' }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'mem-new' }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'comp-1', name: 'Acme Corp', slug: 'acme-corp' }] });

    const result = await service.internalAcceptInvitation(mockClient, 'user-1', 'hr@acme.com', 'raw_token_123');

    expect(result).toBeDefined();
    expect(result.invitation_id).toBe('inv-1');
    expect(result.company.name).toBe('Acme Corp');

    const jsonStr = JSON.stringify(result);
    expect(jsonStr).not.toContain('raw_token');
    expect(jsonStr).not.toContain('token_hash');
    expect(jsonStr).not.toContain('password');
    expect(jsonStr).not.toContain('service_role');
  });
});
