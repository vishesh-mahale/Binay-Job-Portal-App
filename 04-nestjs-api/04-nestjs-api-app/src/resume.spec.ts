import { ResumeService } from './resume';

describe('ResumeService confirmation guards', () => {
  it('rejects malformed confirmation input before opening a transaction', async () => {
    const transaction = jest.fn();
    const service = new ResumeService({ transaction } as any, {} as any);
    await expect(service.confirm({ user: { sub: 'u' } } as any, 'bad-id', {})).rejects.toThrow('VALIDATION_ERROR');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a stale profile revision before canonical writes', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'doc', security_scan_status: 'clean', candidate_id: 'candidate', profile_revision: 4 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'parsed' }] });
    const transaction = jest.fn(async (work: any) => work({ query }));
    const service = new ResumeService({ transaction } as any, {} as any);
    await expect(service.confirm({ user: { sub: 'u' } } as any, '00000000-0000-4000-8000-000000000001', { expected_profile_revision: 3, profile: { summary: 'x' } })).rejects.toThrow('STALE_REVISION');
    expect(query).toHaveBeenCalledTimes(3);
  });
});
