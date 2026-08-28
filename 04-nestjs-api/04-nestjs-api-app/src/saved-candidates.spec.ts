import { SavedCandidateService } from './saved-candidates';

const USER = '11111111-1111-4111-8111-111111111111';
const COMPANY = '22222222-2222-4222-8222-222222222222';
const CANDIDATE = '33333333-3333-4333-8333-333333333333';

describe('SavedCandidateService', () => {
  it('rejects malformed ids', async () => {
    const system = { transaction: jest.fn() } as any;
    await expect(new SavedCandidateService(system).save('bad', USER, CANDIDATE)).rejects.toThrow('VALIDATION_ERROR');
  });
  it('saves an open-to-work candidate for an authorized recruiter', async () => {
    const client = { query: jest.fn()
      .mockResolvedValueOnce({ rows: [{ ok: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: CANDIDATE }] })
      .mockResolvedValueOnce({ rows: [{ id: '44444444-4444-4444-8444-444444444444', candidate_id: CANDIDATE }] }) };
    const service = new SavedCandidateService({ transaction: (fn: any) => fn(client) } as any);
    await expect(service.save(COMPANY, USER, CANDIDATE)).resolves.toMatchObject({ candidate_id: CANDIDATE });
  });
  it('lists only the current recruiter company scope', async () => {
    const client = { query: jest.fn().mockResolvedValueOnce({ rows: [{ ok: 1 }] }).mockResolvedValueOnce({ rows: [{ candidate_id: CANDIDATE }] }) };
    const service = new SavedCandidateService({ transaction: (fn: any) => fn(client) } as any);
    await expect(service.list(COMPANY, USER)).resolves.toHaveLength(1);
  });
});
