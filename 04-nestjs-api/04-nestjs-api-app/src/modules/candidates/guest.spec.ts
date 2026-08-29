import { GuestSessionService } from './guest';

describe('GuestSessionService security boundaries', () => {
  it('rejects malformed job ids before touching the database', async () => {
    const query = jest.fn();
    const service = new GuestSessionService({ query } as any, {} as any);
    await expect(service.create({ job_id: 'not-a-uuid' })).rejects.toThrow('VALIDATION_ERROR');
    expect(query).not.toHaveBeenCalled();
  });

  it('creates a token-bound guest session without returning its hash', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ id: 'session-1', job_id: '00000000-0000-4000-8000-000000000001', expires_at: '2026-08-29T12:00:00Z' }] });
    const service = new GuestSessionService({ query } as any, {} as any);
    const previousTtl = process.env.GUEST_UPLOAD_SESSION_TTL_SECONDS;
    process.env.GUEST_UPLOAD_SESSION_TTL_SECONDS = '3600';
    try {
      const result = await service.create({ job_id: '00000000-0000-4000-8000-000000000001', email: 'candidate@example.com' });
      expect(result).toEqual(expect.objectContaining({ session_id: 'session-1', job_id: '00000000-0000-4000-8000-000000000001' }));
      expect(result.token).toEqual(expect.any(String));
      expect(result).not.toHaveProperty('token_hash');
      expect(query.mock.calls[0][1][1]).not.toBe(result.token);
    } finally {
      process.env.GUEST_UPLOAD_SESSION_TTL_SECONDS = previousTtl;
    }
  });

  it('rejects a claim when the verified account email does not match the guest email', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{
      id: 'claim-1', status: 'pending', expires_at: new Date(Date.now() + 60_000).toISOString(),
      guest_email_normalized: 'candidate@example.com', application_id: 'app-1', user_email: 'other@example.com', candidate_id: 'candidate-1',
    }] });
    const service = new GuestSessionService({ transaction: jest.fn(async (work: any) => work({ query })) } as any, {} as any);
    await expect(service.claim('user-1', 'claim-token')).rejects.toThrow('CLAIM_INVALID');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('returns only the approved guest status projection and hashes the access token', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{
      document_id: '00000000-0000-4000-8000-000000000001', security_scan_status: 'scanning', processing_status: 'uploaded',
      uploaded_at: '2026-08-29T00:00:00Z', updated_at: '2026-08-29T00:00:00Z', expires_at: '2026-08-30T00:00:00Z', parsing_job_id: null,
      started_at: null, completed_at: null, failed_at: null,
    }] });
    const service = new GuestSessionService({ query } as any, {} as any);
    const result = await service.resumeStatus('00000000-0000-4000-8000-000000000001', 'guest-token');
    expect(result).toEqual(expect.objectContaining({ stage: 'SECURITY_SCANNING', retryable: false }));
    expect(query.mock.calls[0][1][1]).not.toBe('guest-token');
  });

  it('removes the uploaded object when the guest upload quota is exceeded', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rows: [{
      id: 'session-1', job_id: '00000000-0000-4000-8000-000000000001', status: 'active',
      expires_at: '2099-08-29T12:00:00Z', uploaded_count: 1, uploaded_bytes: 100,
    }] });
    const clientQuery = jest.fn().mockResolvedValueOnce({ rows: [{ max_upload_count: 1, max_total_bytes: 1024, uploaded_count: 1, uploaded_bytes: 100 }] });
    const storage = { put: jest.fn().mockResolvedValue(undefined), remove: jest.fn().mockResolvedValue(undefined) };
    const service = new GuestSessionService({ query, transaction: jest.fn(async (work: any) => work({ query: clientQuery })) } as any, storage as any);
    const previousLimit = process.env.RESUME_MAX_BYTES;
    const previousBucket = process.env.RESUME_STORAGE_BUCKET;
    process.env.RESUME_MAX_BYTES = '1024';
    process.env.RESUME_STORAGE_BUCKET = 'private-documents';
    try {
      await expect(service.uploadResume('session-1', 'guest-token', {
        originalname: 'resume.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.7'),
      })).rejects.toThrow('UPLOAD_LIMIT_REACHED');
      expect(storage.put).toHaveBeenCalledTimes(1);
      expect(storage.remove).toHaveBeenCalledTimes(1);
    } finally {
      process.env.RESUME_MAX_BYTES = previousLimit;
      process.env.RESUME_STORAGE_BUCKET = previousBucket;
    }
  });

  it('blocks guest application submission until the document scan is clean', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'session-1', job_id: 'job-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'job-1', company_id: 'company-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'document-1', security_scan_status: 'pending' }] });
    const service = new GuestSessionService({ transaction: jest.fn(async (work: any) => work({ query })) } as any, {} as any);
    await expect(service.apply({
      job_id: 'job-1', session_id: 'session-1', document_id: 'document-1', token: 'guest-token',
      name: 'Candidate', email: 'candidate@example.com',
    })).rejects.toThrow('SCAN_PENDING');
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('rejects an expired pending claim without mutating claim state', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{
      id: 'claim-1', status: 'pending', expires_at: new Date(Date.now() - 60_000).toISOString(),
      guest_email_normalized: 'candidate@example.com', application_id: 'app-1', user_email: 'candidate@example.com', candidate_id: 'candidate-1',
    }] });
    const service = new GuestSessionService({ transaction: jest.fn(async (work: any) => work({ query })) } as any, {} as any);
    await expect(service.claim('user-1', 'claim-token')).rejects.toThrow('CLAIM_INVALID');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('returns an idempotent response for an already merged claim', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{
      id: 'claim-1', status: 'merged', expires_at: new Date(Date.now() - 60_000).toISOString(),
      guest_email_normalized: 'candidate@example.com', application_id: 'app-1', user_email: 'candidate@example.com', candidate_id: 'candidate-1',
    }] });
    const service = new GuestSessionService({ transaction: jest.fn(async (work: any) => work({ query })) } as any, {} as any);
    await expect(service.claim('user-1', 'claim-token')).resolves.toEqual({
      application_id: 'app-1', claim_status: 'merged', candidate_id: 'candidate-1', already_claimed: true,
    });
    expect(query).toHaveBeenCalledTimes(1);
  });
});