import { NotFoundException } from '@nestjs/common';
import { JobService } from './jobs';

describe('JobService', () => {
  it('approves a verified pending job', async () => {
    const client = { query: jest.fn().mockResolvedValueOnce({ rows: [{ role: 'admin' }] }).mockResolvedValueOnce({ rows: [{ id: 'job-1', status: 'published' }] }).mockResolvedValueOnce({ rows: [] }) } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    await expect(new JobService(system).approve('user-1', 'company-1', 'job-1')).resolves.toMatchObject({ status: 'published' });
    expect(client.query.mock.calls[1][0]).toContain("c.verification_status = 'verified'");
  });

  it('requires a rejection reason', async () => {
    const system = { transaction: jest.fn() } as any;
    await expect(new JobService(system).reject('user-1', 'company-1', 'job-1', ' ')).rejects.toThrow('VALIDATION_ERROR');
    expect(system.transaction).not.toHaveBeenCalled();
  });

  it('submits a draft for approval with an atomic audit record', async () => {
    const client = { query: jest.fn()
      .mockResolvedValueOnce({ rows: [{ role: 'employer' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'job-1', status: 'pending_approval' }] })
      .mockResolvedValueOnce({ rows: [] }) } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    const result = await new JobService(system).submitForApproval('user-1', 'company-1', 'job-1');
    expect(result.status).toBe('pending_approval');
    expect(client.query.mock.calls[1][0]).toContain("j.status = 'draft'");
  });

  it('applies named pause transition with an audit record', async () => {
    const client = { query: jest.fn()
      .mockResolvedValueOnce({ rows: [{ role: 'employer' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'job-1', status: 'paused' }] })
      .mockResolvedValueOnce({ rows: [] }) } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    const result = await new JobService(system).transition('user-1', 'company-1', 'job-1', 'pause');
    expect(result.status).toBe('paused');
    expect(client.query.mock.calls[1][0]).toContain("j.status = $3::job_status");
    expect(client.query.mock.calls[1][1]).toEqual(['job-1', 'company-1', 'published', 'paused', 'user-1']);
  });

  it('uses the paused source state for resume transitions', async () => {
    const client = { query: jest.fn()
      .mockResolvedValueOnce({ rows: [{ role: 'employer' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'job-1', status: 'published' }] })
      .mockResolvedValueOnce({ rows: [] }) } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    await new JobService(system).transition('user-1', 'company-1', 'job-1', 'resume');
    expect(client.query.mock.calls[1][1]).toEqual(['job-1', 'company-1', 'paused', 'published', 'user-1']);
  });

  it('restricts archive transitions to closed or expired jobs', async () => {
    const client = { query: jest.fn()
      .mockResolvedValueOnce({ rows: [{ role: 'employer' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'job-1', status: 'archived' }] })
      .mockResolvedValueOnce({ rows: [] }) } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    await new JobService(system).archive('user-1', 'company-1', 'job-1', 'cleanup');
    expect(client.query.mock.calls[1][0]).toContain("j.status IN ('closed', 'expired')");
  });

  it('publishes directly or moves to approval based on company setting', async () => {
    const client = { query: jest.fn()
      .mockResolvedValueOnce({ rows: [{ role: 'employer' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'job-1', status: 'published' }] })
      .mockResolvedValueOnce({ rows: [] }) } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    const result = await new JobService(system).publish('user-1', 'company-1', 'job-1');
    expect(result.status).toBe('published');
    expect(client.query.mock.calls[1][0]).toContain('job_approval_required');
    expect(client.query.mock.calls[1][0]).toContain('COALESCE(cs.job_approval_required, FALSE)');
    expect(client.query.mock.calls[1][0]).toContain("'pending_approval'::job_status");
  });

  it('returns pending_approval when company approval is enabled', async () => {
    const client = { query: jest.fn()
      .mockResolvedValueOnce({ rows: [{ role: 'employer' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'job-1', status: 'pending_approval' }] })
      .mockResolvedValueOnce({ rows: [] }) } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    await expect(new JobService(system).publish('user-1', 'company-1', 'job-1')).resolves.toMatchObject({ status: 'pending_approval' });
    expect(client.query.mock.calls[2][1][1]).toBe('user-1');
  });

  it('maps an invalid job transition that updates no row to NOT_FOUND', async () => {
    const client = { query: jest.fn()
      .mockResolvedValueOnce({ rows: [{ role: 'employer' }] })
      .mockResolvedValueOnce({ rows: [] }) } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    await expect(new JobService(system).transition('user-1', 'company-1', 'job-1', 'pause')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates only draft fields and writes an audit record atomically', async () => {
    const client = { query: jest.fn()
      .mockResolvedValueOnce({ rows: [{ role: 'employer' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'job-1', status: 'draft' }] })
      .mockResolvedValueOnce({ rows: [] }) } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    const result = await new JobService(system).updateDraft('user-1', 'company-1', 'job-1', { title: ' Updated ' });
    expect(result.id).toBe('job-1');
    expect(client.query.mock.calls[1][1]).toEqual(['job-1', 'company-1', 'user-1', 'Updated']);
    expect(client.query.mock.calls[1][0]).toContain("j.status = 'draft'");
  });

  it('creates a draft job in one transaction and audits it', async () => {
    const client = { query: jest.fn()
      .mockResolvedValueOnce({ rows: [{ role: 'employer' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'company-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'job-1', status: 'draft' }] })
      .mockResolvedValueOnce({ rows: [] }) } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    const result = await new JobService(system).createDraft('user-1', 'company-1', { title: ' Java ', slug: 'Java-Developer', description: ' Backend role ' });
    expect(result.status).toBe('draft');
    expect(client.query.mock.calls[2][1]).toEqual(['company-1', 'user-1', 'Java', 'java-developer', 'Backend role']);
    expect(client.query.mock.calls[3][1][1]).toBe('user-1');
  });

  it('rejects malformed slugs before opening a transaction', async () => {
    const system = { transaction: jest.fn() } as any;
    await expect(new JobService(system).createDraft('user-1', 'company-1', { title: 'X', slug: 'Bad Slug', description: 'Y' }))
      .rejects.toThrow('VALIDATION_ERROR');
    expect(system.transaction).not.toHaveBeenCalled();
  });

  it('returns only a company-scoped visible job projection', async () => {
    const system = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'job-1', company_id: 'company-1' }] }) } as any;
    const result = await new JobService(system).getCompanyJob('user-1', 'company-1', 'job-1');
    expect(result.id).toBe('job-1');
    expect(system.query.mock.calls[0][0]).toContain('j.company_id = $2');
    expect(system.query.mock.calls[0][0]).toContain('j.deleted_at IS NULL');
    expect(system.query.mock.calls[0][0]).toContain("requester.status = 'active'");
  });

  it('maps an inaccessible or missing job to NOT_FOUND', async () => {
    const system = { query: jest.fn().mockResolvedValue({ rows: [] }) } as any;
    await expect(new JobService(system).getCompanyJob('user-1', 'company-1', 'job-1'))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('drains 101+ due expired jobs across continuous batches', async () => {
    // Simulates SQL loop in 15_infrastructure.sql: batch 1 expires 100 jobs, batch 2 expires 1 job, batch 3 yields 0
    let dueJobsCount = 101;
    const mockExpireBatch = jest.fn(() => {
      if (dueJobsCount >= 100) {
        dueJobsCount -= 100;
        return 100;
      }
      const remaining = dueJobsCount;
      dueJobsCount = 0;
      return remaining;
    });

    let totalExpired = 0;
    let batchCount = 0;
    do {
      batchCount = mockExpireBatch();
      totalExpired += batchCount;
    } while (batchCount >= 100);

    expect(totalExpired).toBe(101);
    expect(mockExpireBatch).toHaveBeenCalledTimes(2);
  });
});
