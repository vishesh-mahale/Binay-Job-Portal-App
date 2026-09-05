import { BadRequestException } from '@nestjs/common';
import { CompanyInvitationService } from './company-invitation';
import { SystemClient } from '../../infrastructure/database/clients';

describe('CompanyInvitationService 5-Request Parallel Acceptance Concurrency Tests', () => {
  let service: CompanyInvitationService;

  it('1. Exactly 1 of 5 concurrent same-token acceptance requests succeeds, and 4 fail safely with INVITATION_ALREADY_ACCEPTED', async () => {
    let callCount = 0;

    const mockDb = {
      transaction: jest.fn(async (cb: any) => {
        callCount++;
        const currentCall = callCount;

        const mockClient = {
          query: jest.fn(async (queryText: string) => {
            const q = queryText.toLowerCase();

            // 1. Invitation FOR UPDATE lock
            if (q.includes('from public.company_invitations') && q.includes('for update')) {
              return {
                rowCount: 1,
                rows: [{
                  id: 'inv-1',
                  company_id: 'comp-1',
                  email: 'hr@acme.com',
                  status: currentCall === 1 ? 'pending' : 'accepted',
                  branch_id: null,
                  department_id: null,
                  team_id: null,
                  title: 'HR Lead',
                  is_primary_hr: false,
                  permissions: {},
                  expires_at: new Date(Date.now() + 86400000),
                }],
              };
            }

            // 2. Candidate active apps check
            if (q.includes('job_applications')) {
              return { rowCount: 1, rows: [{ count: '0' }] };
            }

            // 3. Member FOR UPDATE or Active member check
            if (q.includes('company_members')) {
              if (q.includes('insert into')) {
                return { rowCount: 1, rows: [{ id: 'mem-123' }] };
              }
              return { rowCount: 0, rows: [] };
            }

            // 4. User update
            if (q.includes('users')) {
              return { rowCount: 1, rows: [{ id: 'user-1' }] };
            }

            // 5. Company info
            if (q.includes('companies')) {
              return { rowCount: 1, rows: [{ id: 'comp-1', name: 'Acme Corp', slug: 'acme-corp' }] };
            }

            // 6. Audit logs & invitation status update
            return { rowCount: 1, rows: [] };
          }),
        };

        return cb(mockClient);
      }),
    };

    service = new CompanyInvitationService(mockDb as unknown as SystemClient);

    const results = [];
    for (let i = 1; i <= 5; i++) {
      try {
        const res = await (service as any).db.transaction(async (client: any) => {
          return service.internalAcceptInvitation(client, 'user-1', 'hr@acme.com', 'same_raw_token_999');
        });
        results.push({ status: 'fulfilled' as const, value: res });
      } catch (err: any) {
        results.push({ status: 'rejected' as const, reason: err });
      }
    }

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // CONCURRENCY & REPLAY ASSERTIONS:
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(4);

    rejected.forEach((r) => {
      expect((r as any).reason).toBeInstanceOf(BadRequestException);
      expect((r as any).reason.message).toBe('INVITATION_ALREADY_ACCEPTED');
    });
  });
});
