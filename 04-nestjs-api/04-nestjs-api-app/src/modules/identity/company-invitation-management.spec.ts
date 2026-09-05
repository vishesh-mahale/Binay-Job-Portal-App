import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CompanyInvitationService } from './company-invitation';
import { InvitationTokenUtil } from './invitation-token.util';
import { SystemClient } from '../../infrastructure/database/clients';

describe('CompanyInvitationService Management Unit Tests (verify, revoke, resend)', () => {
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

  describe('verifyInvitation', () => {
    it('1. GET verify validates token status without consuming or modifying token', async () => {
      const rawToken = 'sample_raw_token_12345';
      const expiresAt = new Date(Date.now() + 86400000);

      mockClient.query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{
            id: 'inv-1',
            company_id: 'comp-1',
            email: 'hr@acme.com',
            role: 'hr',
            status: 'pending',
            title: 'Lead HR',
            expires_at: expiresAt,
            company_name: 'Acme Corp',
            company_slug: 'acme-corp',
            logo_path: null,
          }],
        }) // query invitation
        .mockResolvedValueOnce({ rowCount: 0, rows: [] }); // query existing user

      const result = await service.verifyInvitation(rawToken);
      expect(result.id).toBe('inv-1');
      expect(result.company_name).toBe('Acme Corp');
      expect(result.status).toBe('pending');
      expect(result.is_existing_user).toBe(false);
    });

    it('2. GET verify rejects expired or revoked invitation', async () => {
      mockClient.query.mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 'inv-1',
          company_id: 'comp-1',
          email: 'hr@acme.com',
          status: 'revoked',
          expires_at: new Date(Date.now() + 86400000),
        }],
      });

      await expect(service.verifyInvitation('sample_token')).rejects.toThrow(BadRequestException);
    });
  });

  describe('revokeInvitation', () => {
    it('3. Successfully revokes pending invitation', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'comp-1', verification_status: 'verified', owner_id: 'owner-1' }],
        }) // assertAdminOrOwner
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'inv-1', status: 'pending' }],
        }) // invCheck FOR UPDATE
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'inv-1', company_id: 'comp-1', status: 'revoked' }],
        }) // UPDATE
        .mockResolvedValueOnce({ rowCount: 1 }); // AUDIT LOG

      const res = await service.revokeInvitation('owner-1', 'comp-1', 'inv-1', 'Not needed');
      expect(res.status).toBe('revoked');
    });

    it('4. Rejects revocation if invitation is already accepted (HTTP 400)', async () => {
      mockClient.query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'comp-1', verification_status: 'verified', owner_id: 'owner-1' }],
        })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ id: 'inv-1', status: 'accepted' }],
        });

      await expect(
        service.revokeInvitation('owner-1', 'comp-1', 'inv-1')
      ).rejects.toThrow(BadRequestException);
    });
  });
});
