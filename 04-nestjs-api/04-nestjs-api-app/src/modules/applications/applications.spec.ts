import { ApplicationService } from './applications';

const UUID = '11111111-1111-4111-8111-111111111111';
const JOB = '22222222-2222-4222-8222-222222222222';
const DOC = '33333333-3333-4333-8333-333333333333';

describe('ApplicationService', () => {
  it('rejects invalid consent/document before opening a transaction', async () => {
    const system = { transaction: jest.fn() } as any;
    await expect(new ApplicationService(system).submit(UUID, JOB, { document_id: DOC, consent: false })).rejects.toThrow('VALIDATION_ERROR');
    expect(system.transaction).not.toHaveBeenCalled();
  });

  it('rejects a non-published or expired job', async () => {
    const client = { query: jest.fn()
      .mockResolvedValueOnce({ rows: [{ id: UUID, email: 'candidate@example.com', profile_revision: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: JOB, company_id: UUID, status: 'paused', expires_at: null, deleted_at: null }] }) };
    const system = { transaction: jest.fn((fn: any) => fn(client)) } as any;
    await expect(new ApplicationService(system).submit(UUID, JOB, { document_id: DOC, consent: true })).rejects.toThrow('NOT_FOUND');
  });

  it('creates application, immutable snapshot, history, audit and outbox atomically', async () => {
    const app = { id: UUID, status: 'applied', applied_at: '2026-08-28T00:00:00.000Z' };
    const client = { query: jest.fn()
      .mockResolvedValueOnce({ rows: [{ id: UUID, email: 'candidate@example.com', profile_revision: 4, headline: 'Backend Developer' }] })
      .mockResolvedValueOnce({ rows: [{ id: JOB, company_id: '44444444-4444-4444-8444-444444444444', status: 'published', expires_at: null, deleted_at: null }] })
      .mockResolvedValueOnce({ rows: [{ id: DOC, security_scan_status: 'clean' }] })
      .mockResolvedValueOnce({ rows: [app] })
      .mockResolvedValueOnce({ rows: [{ id: '55555555-5555-4555-8555-555555555555' }] })
      .mockResolvedValue({ rows: [] }) };
    const system = { transaction: jest.fn((fn: any) => fn(client)) } as any;
    const result = await new ApplicationService(system).submit(UUID, JOB, { document_id: DOC, consent: true, answers_to_screening_questions: [] });
    expect(result.application_id).toBe(UUID);
    expect(result.snapshot_summary.profile_revision).toBe(4);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('application.submitted'), expect.any(Array));
  });

  it('requires a reason when an application is rejected', async () => {
    const system = { transaction: jest.fn() } as any;
    await expect(new ApplicationService(system).changeStatus(UUID, UUID, UUID, { status: 'rejected' })).rejects.toThrow('VALIDATION_ERROR');
    expect(system.transaction).not.toHaveBeenCalled();
  });

  it('maps the database transition guard to a stable API error', async () => {
    const client = { query: jest.fn()
      .mockResolvedValueOnce({ rows: [{ id: UUID }] })
      .mockRejectedValueOnce(new Error('invalid application status transition')) };
    const system = { transaction: jest.fn((fn: any) => fn(client)) } as any;
    await expect(new ApplicationService(system).changeStatus(UUID, UUID, UUID, { status: 'selected' })).rejects.toThrow('INVALID_STATUS_TRANSITION');
  });

  it('returns the database result after a valid application status transition', async () => {
    const client = { query: jest.fn()
      .mockResolvedValueOnce({ rows: [{ id: UUID }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: UUID, job_id: JOB, candidate_id: DOC, status: 'under_review' }] }) };
    const system = { transaction: jest.fn((fn: any) => fn(client)) } as any;
    await expect(new ApplicationService(system).changeStatus(UUID, UUID, UUID, { status: 'under_review' }))
      .resolves.toMatchObject({ status: 'under_review' });
    expect(client.query.mock.calls[1][0]).toContain('change_application_status');
  });
});

describe('CompanyApplicationReadController', () => {
  it('includes guest applications in company application read list query', async () => {
    const { CompanyApplicationReadController } = require('./applications');
    const system = { query: jest.fn().mockResolvedValue({ rows: [{ application_id: UUID, is_guest: true }] }) } as any;
    const controller = new CompanyApplicationReadController(system);
    const req = { user: { sub: UUID } } as any;
    const res = await controller.list(req, '44444444-4444-4444-8444-444444444444');
    expect(res).toHaveLength(1);
    expect(res[0].is_guest).toBe(true);
    expect(system.query).toHaveBeenCalledWith(expect.not.stringContaining('is_guest = FALSE'), expect.any(Array));
  });
});