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

  it('reuses an existing document by checksum without writing storage or outbox', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ document_id: 'existing-document' }] });
    const storage = { put: jest.fn(), remove: jest.fn() };
    const service = new ResumeService({ query, transaction: jest.fn() } as any, storage as any);
    const previousLimit = process.env.RESUME_MAX_BYTES;
    const previousBucket = process.env.RESUME_STORAGE_BUCKET;
    process.env.RESUME_MAX_BYTES = '1024';
    process.env.RESUME_STORAGE_BUCKET = 'private-documents';
    try {
      await expect(service.upload({ user: { sub: 'user-1' } } as any, {
        originalname: 'resume.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.7'),
      }, true)).resolves.toEqual({ document_id: 'existing-document', reused: true });
      expect(storage.put).not.toHaveBeenCalled();
      expect(storage.remove).not.toHaveBeenCalled();
    } finally {
      process.env.RESUME_MAX_BYTES = previousLimit;
      process.env.RESUME_STORAGE_BUCKET = previousBucket;
    }
  });

  it('cleans the private object when the atomic metadata transaction fails', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'candidate-1' }] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] });
    const storage = { put: jest.fn().mockResolvedValue(undefined), remove: jest.fn().mockResolvedValue(undefined) };
    const service = new ResumeService({ query, transaction: jest.fn().mockRejectedValue(new Error('DB_FAILURE')) } as any, storage as any);
    const previousLimit = process.env.RESUME_MAX_BYTES;
    const previousBucket = process.env.RESUME_STORAGE_BUCKET;
    process.env.RESUME_MAX_BYTES = '1024';
    process.env.RESUME_STORAGE_BUCKET = 'private-documents';
    try {
      await expect(service.upload({ user: { sub: 'user-1' } } as any, {
        originalname: 'resume.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.7'),
      }, false)).rejects.toThrow('DB_FAILURE');
      expect(storage.put).toHaveBeenCalledTimes(1);
      expect(storage.remove).toHaveBeenCalledTimes(1);
      expect(storage.remove.mock.calls[0][0]).toBe('private-documents');
    } finally {
      process.env.RESUME_MAX_BYTES = previousLimit;
      process.env.RESUME_STORAGE_BUCKET = previousBucket;
    }
  });

  it('creates the approved security-scan outbox event without embedding file content', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'candidate-1' }] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] });
    const clientQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'document-1', security_scan_status: 'pending', processing_status: 'uploaded' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ version: 1 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const storage = { put: jest.fn().mockResolvedValue(undefined), remove: jest.fn() };
    const transaction = jest.fn(async (work: any) => work({ query: clientQuery }));
    const service = new ResumeService({ query, transaction } as any, storage as any);
    const previousLimit = process.env.RESUME_MAX_BYTES;
    const previousBucket = process.env.RESUME_STORAGE_BUCKET;
    process.env.RESUME_MAX_BYTES = '1024';
    process.env.RESUME_STORAGE_BUCKET = 'private-documents';
    try {
      await expect(service.upload({ user: { sub: 'user-1' } } as any, {
        originalname: 'resume.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.7'),
      }, false)).resolves.toEqual(expect.objectContaining({ document_id: 'document-1', stage: 'UPLOADED', reused: false }));
      const eventCall = clientQuery.mock.calls[4];
      expect(eventCall[0]).toContain("'security.scan.requested'");
      expect(eventCall[1][1]).toBe('document-1');
      const serializedPayload = String(eventCall[1][2]);
      expect(serializedPayload).toContain('security.scan.requested');
      expect(serializedPayload).not.toContain('%PDF-1.7');
      expect(serializedPayload).not.toContain('private-documents');
    } finally {
      process.env.RESUME_MAX_BYTES = previousLimit;
      process.env.RESUME_STORAGE_BUCKET = previousBucket;
    }
  });

  it.each([
    ['pending', 'SCAN_PENDING'],
    ['scanning', 'SCAN_PENDING'],
    ['infected', 'INFECTED_FILE'],
    ['quarantined', 'INFECTED_FILE'],
    ['failed', 'SCAN_FAILED'],
  ])('blocks confirmation for security state %s', async (security_scan_status, code) => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [{
        id: 'doc', security_scan_status, candidate_id: 'candidate', profile_revision: 1,
      }] })
      .mockResolvedValueOnce({ rows: [] });
    const transaction = jest.fn(async (work: any) => work({ query }));
    const service = new ResumeService({ transaction } as any, {} as any);
    await expect(service.confirm(
      { user: { sub: 'user-1' } } as any,
      '00000000-0000-4000-8000-000000000001',
      { expected_profile_revision: 1, profile: { summary: 'safe' } },
    )).rejects.toThrow(code);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('blocks confirmation until a completed or partial parse result exists', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'doc', security_scan_status: 'clean', candidate_id: 'candidate', profile_revision: 1 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const transaction = jest.fn(async (work: any) => work({ query }));
    const service = new ResumeService({ transaction } as any, {} as any);
    await expect(service.confirm(
      { user: { sub: 'user-1' } } as any,
      '00000000-0000-4000-8000-000000000001',
      { expected_profile_revision: 1, profile: { summary: 'safe' } },
    )).rejects.toThrow('PARSING_NOT_READY');
  });
});
