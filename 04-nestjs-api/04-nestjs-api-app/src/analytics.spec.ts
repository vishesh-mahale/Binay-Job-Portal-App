import { AnalyticsService } from './analytics';

const USER = '11111111-1111-4111-8111-111111111111';

describe('AnalyticsService', () => {
  it('rejects malformed event input', async () => {
    const system = { query: jest.fn() } as any;
    await expect(new AnalyticsService(system).ingest(USER, { idempotency_key: '', event_name: 'Bad Name', event_category: 'search', event_data: {} })).rejects.toThrow('VALIDATION_ERROR');
    expect(system.query).not.toHaveBeenCalled();
  });
  it('ingests a validated event through the trusted client', async () => {
    const system = { query: jest.fn().mockResolvedValue({ rows: [{ id: '1', event_name: 'job_view', occurred_at: 'now' }] }) } as any;
    const result = await new AnalyticsService(system).ingest(USER, { idempotency_key: 'evt-1', event_name: 'JOB_VIEW', event_category: 'engagement', source: 'web', event_data: { job_id: 'x' } });
    expect((result as any).event_name).toBe('job_view');
    expect(system.query).toHaveBeenCalledWith(expect.stringContaining('analytics_events'), expect.any(Array));
  });
});
