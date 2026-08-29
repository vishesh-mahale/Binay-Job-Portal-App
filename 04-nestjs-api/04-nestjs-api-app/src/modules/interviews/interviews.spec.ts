import { InterviewService } from './interviews';

const future = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
const id = '00000000-0000-4000-8000-000000000001';

describe('InterviewService validation and transitions', () => {
  it('rejects a slot inside the one-hour lead time', async () => {
    const service = new InterviewService({} as any);
    await expect(service.schedule('u', id, id, { schedule_block_id: id, interviewer_id: id, title: 'x', type: 'technical', scheduled_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), duration_minutes: 30, timezone: 'UTC' })).rejects.toThrow('VALIDATION_ERROR');
  });

  it('rejects invalid timezone/offset before database access', async () => {
    const service = new InterviewService({} as any);
    await expect(service.schedule('u', id, id, { schedule_block_id: id, interviewer_id: id, title: 'x', type: 'technical', scheduled_at: future.replace('Z', ''), duration_minutes: 30, timezone: 'Not/AZone' })).rejects.toThrow('VALIDATION_ERROR');
  });

  it('rejects malformed status commands', async () => {
    const service = new InterviewService({} as any);
    await expect(service.changeStatus('u', 'bad', 'completed')).rejects.toThrow('VALIDATION_ERROR');
    await expect(service.changeStatus('u', id, 'unknown')).rejects.toThrow('VALIDATION_ERROR');
  });
});