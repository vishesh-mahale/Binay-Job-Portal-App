import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CompanyInvitationService } from './company-invitation';
import { SystemClient } from '../../infrastructure/database/clients';

describe('CompanyInvitationService.createInvitation Unit Tests & Security Regression Guards', () => {
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

  it('1. Rejects invitation if company is not found or not verified (HTTP 403 / 404)', async () => {
    mockClient.query.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // Assert company
    await expect(
      service.createInvitation('owner-1', 'comp-1', { email: 'hr@acme.com' })
    ).rejects.toThrow(NotFoundException);

    mockClient.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ id: 'comp-1', verification_status: 'unverified', owner_id: 'owner-1' }],
    });
    await expect(
      service.createInvitation('owner-1', 'comp-1', { email: 'hr@acme.com' })
    ).rejects.toThrow(ForbiddenException);
  });

  it('2. Rejects invalid cross-company branch/department/team references (HTTP 400)', async () => {
    mockClient.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'comp-1', verification_status: 'verified', owner_id: 'owner-1' }],
      }) // assertAdminOrOwner
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ branch_ok: false, department_ok: true, team_ok: true }],
      }); // validateOrganizationReferences

    await expect(
      service.createInvitation('owner-1', 'comp-1', { email: 'hr@acme.com', branch_id: 'invalid-branch' })
    ).rejects.toThrow(BadRequestException);
  });

  it('3. Rejects invitation if invitee is an existing registered user account (HTTP 400 EXISTING_USER_CANNOT_BE_INVITED)', async () => {
    mockClient.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'comp-1', name: 'Acme Corp', verification_status: 'verified', owner_id: 'owner-1' }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ branch_ok: true, department_ok: true, team_ok: true }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'existing-user-uuid' }], // existing user account in public.users!
      });

    await expect(
      service.createInvitation('owner-1', 'comp-1', { email: 'existing_candidate@acme.com' })
    ).rejects.toThrow('EXISTING_USER_CANNOT_BE_INVITED');
  });

  it('3b. Rejects invitation if invitee is already an active member of another company (HTTP 400)', async () => {
    mockClient.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'comp-1', name: 'Acme Corp', verification_status: 'verified', owner_id: 'owner-1' }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ branch_ok: true, department_ok: true, team_ok: true }],
      })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // existingUserCheck: no user
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'mem-1', company_id: 'comp-2' }], // Active member elsewhere!
      });

    await expect(
      service.createInvitation('owner-1', 'comp-1', { email: 'active_elsewhere@acme.com' })
    ).rejects.toThrow(BadRequestException);
  });

  it('4. SECURITY REGRESSION: Successfully creates invitation WITHOUT leaking raw token or token_hash in response', async () => {
    const expiresAt = new Date();
    mockClient.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ id: 'comp-1', verification_status: 'verified', owner_id: 'owner-1' }],
      }) // assertAdminOrOwner
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ branch_ok: true, department_ok: true, team_ok: true }],
      }) // validateOrganizationReferences
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // existingUserCheck
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // activeUserCheck
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // auto-expire update
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // existingPending check
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 'inv-123',
          company_id: 'comp-1',
          email: 'hr@acme.com',
          role: 'hr',
          status: 'pending',
          title: 'Senior HR',
          is_primary_hr: false,
          expires_at: expiresAt,
          created_at: expiresAt,
          updated_at: expiresAt,
        }],
      }) // insert company_invitations
      .mockResolvedValueOnce({ rowCount: 1 }) // insert outbox_events
      .mockResolvedValueOnce({ rowCount: 1 }); // insert audit_logs

    const result = await service.createInvitation('owner-1', 'comp-1', {
      email: ' HR@Acme.com ',
      title: 'Senior HR',
    });

    expect(result).toBeDefined();
    expect(result.id).toBe('inv-123');
    expect(result.email).toBe('hr@acme.com');
    expect(result.role).toBe('hr');

    // SECURITY REGRESSION ASSERTIONS:
    expect((result as any).raw_token).toBeUndefined();
    expect((result as any).raw_token_preview).toBeUndefined();
    expect((result as any).token).toBeUndefined();
    expect((result as any).token_hash).toBeUndefined();
  });
});
