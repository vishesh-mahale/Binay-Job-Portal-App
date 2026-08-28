import { CandidateService } from './candidate';

describe('CandidateService', () => {
  it('uses the authenticated user id and returns the profile payload', async () => {
    const queryAsUser = jest.fn().mockResolvedValue({ rows: [{ profile: { profile: { id: 'candidate-1' }, skills: [] } }] });
    const service = new CandidateService({ queryAsUser } as any, {} as any);
    const request = { user: { sub: 'user-1' }, rawAccessToken: 'jwt.token.value' } as any;
    await expect(service.getOwnProfile(request)).resolves.toEqual({ profile: { id: 'candidate-1' }, skills: [] });
    expect(queryAsUser).toHaveBeenCalledWith('jwt.token.value', expect.stringContaining('cp.user_id = $1'), ['user-1']);
  });

  it('returns NOT_FOUND when no candidate profile belongs to the user', async () => {
    const service = new CandidateService({ queryAsUser: jest.fn().mockResolvedValue({ rows: [] }) } as any, {} as any);
    const request = { user: { sub: 'missing' }, header: () => 'Bearer jwt.token.value' } as any;
    await expect(service.getOwnProfile(request)).rejects.toThrow('NOT_FOUND');
  });

  it('rejects a stale profile revision before any write', async () => {
    const transaction = jest.fn(async (work: any) => work({ query: jest.fn().mockResolvedValue({ rows: [{ id: 'candidate-1', profile_revision: 3 }] }) }));
    const service = new CandidateService({} as any, { transaction } as any);
    const request = { user: { sub: 'user-1' } } as any;
    await expect(service.updateOwnProfile(request, { expected_profile_revision: 2, summary: 'x' } as any)).rejects.toThrow('STALE_REVISION');
  });

  it('rejects an empty mutation payload', async () => {
    const service = new CandidateService({} as any, {} as any);
    await expect(service.updateOwnProfile({ user: { sub: 'user-1' } } as any, { expected_profile_revision: 1 } as any)).rejects.toThrow('VALIDATION_ERROR');
  });

  it('fails closed for unknown fact types', async () => {
    const service = new CandidateService({} as any, {} as any);
    await expect(service.archiveFact({ user: { sub: 'user-1' } } as any, 'unknown', '00000000-0000-4000-8000-000000000000', { expected_profile_revision: 1 })).rejects.toThrow('NOT_FOUND');
  });

  it('returns only the approved parsed-data allowlist and derives partial', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{
      document_id: '00000000-0000-4000-8000-000000000001', parsing_job_id: '00000000-0000-4000-8000-000000000002',
      security_scan_status: 'clean', processing_status: 'partial', schema_version: 'resume.v1', overall_confidence: 91.5,
      confidence_details: { skills: 90 }, validation_result: { valid: true },
      normalized_output: { professional_title: 'Engineer', skills: [], extracted_text: 'secret', raw_ai_output: { pii: true } },
      created_at: '2026-01-01T00:00:00Z',
    }] });
    const service = new CandidateService({} as any, { query } as any);
    const request = { user: { sub: 'user-1' } } as any;
    await expect(service.getParsedData(request, '00000000-0000-4000-8000-000000000001')).resolves.toEqual(expect.objectContaining({
      normalized_output: { professional_title: 'Engineer', skills: [] }, partial: true,
    }));
  });

  it('does not expose a parsed result for a non-clean document', async () => {
    const service = new CandidateService({} as any, { query: jest.fn().mockResolvedValue({ rows: [{ security_scan_status: 'infected' }] }) } as any);
    await expect(service.getParsedData({ user: { sub: 'user-1' } } as any, '00000000-0000-4000-8000-000000000001')).rejects.toThrow('NOT_FOUND');
  });

  it.each([
    ['pending', 'uploaded', 'UPLOADED', false],
    ['scanning', 'uploaded', 'SECURITY_SCANNING', false],
    ['clean', 'queued', 'PARSING_QUEUED', false],
    ['clean', 'processing', 'PARSING_IN_PROGRESS', false],
    ['clean', 'completed', 'REVIEW_READY', false],
    ['clean', 'partial', 'REVIEW_READY_PARTIAL', false],
    ['failed', 'failed', 'SECURITY_RETRYABLE_FAILURE', true],
    ['clean', 'failed', 'PARSING_FAILED', true],
    ['infected', 'failed', 'SECURITY_REJECTED', false],
  ])('maps scan/processing state %s/%s to the UI-safe stage', async (scan, processing, stage, retryable) => {
    const query = jest.fn().mockResolvedValue({ rows: [{
      document_id: '00000000-0000-4000-8000-000000000001', security_scan_status: scan, processing_status: processing,
      uploaded_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', parsing_job_id: null,
      started_at: null, completed_at: null, failed_at: null,
    }] });
    const service = new CandidateService({} as any, { query } as any);
    await expect(service.getResumeStatus({ user: { sub: 'user-1' } } as any, '00000000-0000-4000-8000-000000000001')).resolves.toEqual(expect.objectContaining({ stage, retryable }));
  });
});
