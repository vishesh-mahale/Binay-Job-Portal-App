import { FeedbackService } from './feedback';

describe('FeedbackService', () => {
  it('rejects blank message and invalid rating', async () => {
    const system = { query: jest.fn() } as any;
    await expect(new FeedbackService(system).submit('u', { message: ' ', rating: 6 })).rejects.toThrow('VALIDATION_ERROR');
  });
  it('submits validated feedback without exposing moderation fields', async () => {
    const system = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'f1', category: 'suggestion', created_at: 'now' }] }) } as any;
    const result = await new FeedbackService(system).submit('u', { category: 'suggestion', message: 'Useful portal', rating: 5 });
    expect(result).toEqual({ id: 'f1', category: 'suggestion', created_at: 'now' });
    expect(system.query).toHaveBeenCalledWith(expect.stringContaining('platform_feedback'), expect.any(Array));
  });
});