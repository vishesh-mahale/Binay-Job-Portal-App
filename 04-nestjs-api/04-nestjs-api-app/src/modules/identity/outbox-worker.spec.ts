import { OutboxWorkerService } from './outbox-worker';
import { InvitationTokenUtil } from './invitation-token.util';
import { SystemClient } from '../../infrastructure/database/clients';

describe('OutboxWorkerService Baseline 15_infrastructure.sql Schema Reconciliation Tests', () => {
  let service: OutboxWorkerService;
  let mockClient: any;
  let mockDb: any;
  let mockEmailService: any;
  let transactionExecutionOrder: string[];

  beforeEach(() => {
    transactionExecutionOrder = [];
    mockClient = {
      query: jest.fn(),
    };

    mockDb = {
      transaction: jest.fn(async (cb: any) => {
        transactionExecutionOrder.push('DB_TRANSACTION_START');
        const res = await cb(mockClient);
        transactionExecutionOrder.push('DB_TRANSACTION_COMMIT');
        return res;
      }),
    };

    mockEmailService = {
      sendInvitationEmail: jest.fn(async () => {
        transactionExecutionOrder.push('SMTP_SEND_EMAIL_CALL');
      }),
    };

    service = new OutboxWorkerService(mockDb as unknown as SystemClient, mockEmailService);
  });

  it('1. ARCHITECTURAL & SCHEMA PROOF: Uses baseline 15_infrastructure.sql status "publishing" -> "published" and executes SMTP call OUTSIDE DB transactions', async () => {
    const encryptedPayload = InvitationTokenUtil.encryptPayload({
      invitation_id: 'inv-100',
      company_id: 'comp-200',
      company_name: 'Acme Corp',
      email: 'invitee@acme.com',
      raw_token: 'raw_token_xyz_999',
      title: 'Senior Engineer',
    });

    mockClient.query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // Stale lease cleanup query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 'event-1',
          aggregate_type: 'company_invitation',
          aggregate_id: 'inv-100',
          event_type: 'invitation.created',
          payload: encryptedPayload,
          status: 'publishing',
          retry_count: 0,
          max_retries: 10,
        }],
      }) // Targeted claim query RETURNING event.*
      .mockRejectedValueOnce(new Error('Procedure mark_outbox_event_published not loaded')) // Fallback to SQL
      .mockResolvedValueOnce({ rowCount: 1 }); // UPDATE status = 'published'

    const result = await service.processPendingInvitations();

    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);

    // Verify exact execution sequence: Claim DB Transaction Commit -> SMTP Call -> Result Update DB Transaction
    expect(transactionExecutionOrder).toEqual([
      'DB_TRANSACTION_START',
      'DB_TRANSACTION_COMMIT', // Claim transaction committed BEFORE SMTP!
      'SMTP_SEND_EMAIL_CALL',  // External SMTP network call
      'DB_TRANSACTION_START',
      'DB_TRANSACTION_COMMIT', // Result update transaction committed AFTER SMTP!
    ]);

    expect(mockEmailService.sendInvitationEmail).toHaveBeenCalledWith({
      email: 'invitee@acme.com',
      companyName: 'Acme Corp',
      rawToken: 'raw_token_xyz_999',
      title: 'Senior Engineer',
    });
  });

  it('2. TARGETED EVENT SELECTION GUARD: Ensures only invitation.created events are claimed and unrelated events (e.g. job.created) remain untouched', async () => {
    const encryptedPayload = InvitationTokenUtil.encryptPayload({
      invitation_id: 'inv-100',
      company_id: 'comp-200',
      email: 'invitee@acme.com',
      raw_token: 'raw_token_xyz_999',
    });

    mockClient.query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // Stale lease cleanup query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 'event-invitation-1',
          aggregate_type: 'company_invitation',
          aggregate_id: 'inv-100',
          event_type: 'invitation.created',
          payload: encryptedPayload,
          status: 'publishing',
          retry_count: 0,
          max_retries: 10,
        }],
      }) // Targeted claim query returns ONLY invitation.created
      .mockResolvedValueOnce({ rowCount: 1 }); // UPDATE status = 'published'

    const result = await service.processPendingInvitations();

    expect(result.processed).toBe(1);
    expect(result.failed).toBe(0);

    // Assert that the claim query filtered event_type = 'invitation.created' inside the CTE candidate selection
    const claimCall = mockClient.query.mock.calls.find((c: any[]) => typeof c[0] === 'string' && c[0].includes('WITH candidates AS'));
    expect(claimCall).toBeDefined();
    expect(claimCall[0]).toContain('AND event_type = $4');
    expect(claimCall[1][3]).toBe('invitation.created');
  });

  it('3. SCHEMA REGRESSION GUARD: Verifies zero non-baseline column names (processing, processed_at, error_message) are used in DB queries', async () => {
    const encryptedPayload = InvitationTokenUtil.encryptPayload({
      invitation_id: 'inv-100',
      company_id: 'comp-200',
      email: 'invitee@acme.com',
      raw_token: 'secret_raw_token_777',
    });

    mockClient.query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 'event-1',
          aggregate_type: 'company_invitation',
          aggregate_id: 'inv-100',
          event_type: 'invitation.created',
          payload: encryptedPayload,
          status: 'publishing',
          retry_count: 0,
          max_retries: 10,
        }],
      })
      .mockRejectedValueOnce(new Error('Procedure not loaded'))
      .mockResolvedValueOnce({ rowCount: 1 });

    mockEmailService.sendInvitationEmail.mockRejectedValueOnce(
      new Error('SMTP Connection Error with raw_token=secret_raw_token_777')
    );

    await service.processPendingInvitations();

    const allExecutedQueries = mockClient.query.mock.calls.map((c: any[]) => String(c[0]).toLowerCase()).join(' ');

    // REGRESSION GUARD ASSERTIONS:
    expect(allExecutedQueries).not.toContain("status = 'processing'");
    expect(allExecutedQueries).not.toContain('processed_at');
    expect(allExecutedQueries).not.toContain('error_message');

    // BASELINE SCHEMA COMPLIANCE ASSERTIONS:
    expect(allExecutedQueries).toContain('status');
    expect(allExecutedQueries).toContain('last_error');
    expect(allExecutedQueries).toContain('available_at');
    expect(allExecutedQueries).toContain('locked_by');

    // Redaction assertion on error parameter
    const allArgsStr = JSON.stringify(mockClient.query.mock.calls);
    expect(allArgsStr).not.toContain('secret_raw_token_777');
    expect(allArgsStr).toContain('raw_token=[REDACTED]');
  });

  it('4. UnknownKeyIdException is caught safely without crashing worker', async () => {
    const corruptedPayload = {
      v: 1,
      kid: 'non_existent_key_id_999',
      ct: 'invalid_ct',
      iv: 'invalid_iv',
      tag: 'invalid_tag',
    };

    mockClient.query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 'event-bad-key',
          aggregate_type: 'company_invitation',
          aggregate_id: 'inv-999',
          event_type: 'invitation.created',
          payload: corruptedPayload,
          status: 'publishing',
          retry_count: 0,
          max_retries: 10,
        }],
      })
      .mockRejectedValueOnce(new Error('Procedure not loaded'))
      .mockResolvedValueOnce({ rowCount: 1 });

    const result = await service.processPendingInvitations();

    expect(result.processed).toBe(0);
    expect(result.failed).toBe(1);
    expect(mockEmailService.sendInvitationEmail).not.toHaveBeenCalled();
  });

  it('5. MISSING EMAIL SERVICE GUARD: Uses controlled failure/retry path when EmailDeliveryService is missing', async () => {
    const serviceWithoutEmail = new OutboxWorkerService(mockDb as unknown as SystemClient, undefined);

    const encryptedPayload = InvitationTokenUtil.encryptPayload({
      invitation_id: 'inv-100',
      company_id: 'comp-200',
      email: 'invitee@acme.com',
      raw_token: 'raw_token_xyz_999',
    });

    mockClient.query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 'event-no-email-service',
          aggregate_type: 'company_invitation',
          aggregate_id: 'inv-100',
          event_type: 'invitation.created',
          payload: encryptedPayload,
          status: 'publishing',
          retry_count: 0,
          max_retries: 10,
        }],
      })
      .mockRejectedValueOnce(new Error('Procedure not loaded'))
      .mockResolvedValueOnce({ rowCount: 1 });

    const result = await serviceWithoutEmail.processPendingInvitations();

    expect(result.processed).toBe(0);
    expect(result.failed).toBe(1);

    const allArgsStr = JSON.stringify(mockClient.query.mock.calls);
    expect(allArgsStr).toContain('INVITATION_EMAIL_SERVICE_NOT_CONFIGURED');
  });

  describe('BrevoEmailService Fail-Closed & Link Construction Tests', () => {
    let brevoService: any;
    const originalEnv = process.env;

    beforeEach(() => {
      const { BrevoEmailService } = require('./outbox-worker');
      delete process.env.BREVO_API_KEY;
      delete process.env.SMTP_KEY;
      brevoService = new BrevoEmailService();
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('6. FAIL-CLOSED GUARD: Throws INVITATION_EMAIL_SERVICE_NOT_CONFIGURED when BREVO_API_KEY is missing (never generates simulated IDs)', async () => {
      await expect(brevoService.sendInvitationEmail({
        email: 'test@collabfor.com',
        companyName: 'CollabFor',
        rawToken: 'token_abc_123',
        title: 'HR Lead'
      })).rejects.toThrow('INVITATION_EMAIL_SERVICE_NOT_CONFIGURED');

      expect(brevoService.lastMessageId).toBeNull();
      expect(brevoService.lastDeliveryStatus).toBeNull();
    });

    it('7. INVITATION LINK & SENDER GUARD: Sends HTML and text body containing http://localhost:3001/invite/accept?token=... and default sender noreply@collabfor.com', async () => {
      process.env.BREVO_API_KEY = 'xkeysib-test-api-key-12345';
      process.env.FRONTEND_URL = 'http://localhost:3001';

      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ messageId: '<brevo_msg_real_999@smtp-relay.brevo.com>' })
      });
      global.fetch = mockFetch as any;

      await brevoService.sendInvitationEmail({
        email: 'invitee@collabfor.com',
        companyName: 'Acme Corp',
        rawToken: 'raw_token_secret_123',
        title: 'Talent Lead'
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, req] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.brevo.com/v3/smtp/email');
      
      const body = JSON.parse(req.body);
      expect(body.sender.email).toBe('noreply@collabfor.com');
      expect(body.sender.name).toBe('CollabFor HR');
      expect(body.to[0].email).toBe('invitee@collabfor.com');
      
      // Verify invitation link contains token in memory without logging it
      expect(body.htmlContent).toContain('http://localhost:3001/invite/accept?token=raw_token_secret_123');
      expect(body.textContent).toContain('http://localhost:3001/invite/accept?token=raw_token_secret_123');

      expect(brevoService.lastMessageId).toBe('<brevo_msg_real_999@smtp-relay.brevo.com>');
      expect(brevoService.lastDeliveryStatus).toBe('delivered');
    });

    it('8. PROVIDER FAILURE GUARD: Throws BREVO_SMTP_API_ERROR when HTTP status is not ok (never publishes outbox event)', async () => {
      process.env.BREVO_API_KEY = 'xkeysib-invalid-key';

      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ code: 'unauthorized', message: 'Key invalid' })
      });
      global.fetch = mockFetch as any;

      await expect(brevoService.sendInvitationEmail({
        email: 'invitee@collabfor.com',
        companyName: 'Acme Corp',
        rawToken: 'raw_token_secret_123'
      })).rejects.toThrow('BREVO_SMTP_API_ERROR: 401');

      expect(brevoService.lastMessageId).toBeNull();
      expect(brevoService.lastDeliveryStatus).toBeNull();
    });
  });
});
