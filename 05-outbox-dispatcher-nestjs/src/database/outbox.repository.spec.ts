import { OutboxRepository } from './outbox.repository';
import { DatabaseService } from './database.service';

/**
 * The repository is the ONLY DB surface — these tests pin the exact SQL
 * statements and parameter order so no ad-hoc DML can sneak in.
 */

function mockDb(rows: unknown[] = []) {
  const query = jest.fn().mockResolvedValue({ rows });
  return { query } as unknown as DatabaseService & { query: jest.Mock };
}

describe('OutboxRepository — the four approved functions only', () => {
  it('claimEvents calls claim_outbox_events(worker, batch, lease)', async () => {
    const db = mockDb([{ id: 'e1' }]);
    const repo = new OutboxRepository(db);

    const events = await repo.claimEvents('worker-1', 50, 300);

    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toBe('SELECT * FROM public.claim_outbox_events($1, $2, $3)');
    expect(params).toEqual(['worker-1', 50, 300]);
    expect(events).toEqual([{ id: 'e1' }]);
  });

  it('markPublished calls mark_outbox_event_published(id, worker, task_name)', async () => {
    const db = mockDb([{ id: 'e1', status: 'published' }]);
    const repo = new OutboxRepository(db);

    await repo.markPublished('e1', 'worker-1', 'task-abc');

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toBe('SELECT * FROM public.mark_outbox_event_published($1, $2, $3)');
    expect(params).toEqual(['e1', 'worker-1', 'task-abc']);
  });

  it('markFailed calls mark_outbox_event_failed(id, worker, error, available_at)', async () => {
    const db = mockDb([{ id: 'e1', status: 'pending' }]);
    const repo = new OutboxRepository(db);
    const availableAt = new Date('2026-08-21T00:05:00Z');

    await repo.markFailed('e1', 'worker-1', 'transient_server: 503', availableAt);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toBe('SELECT * FROM public.mark_outbox_event_failed($1, $2, $3, $4)');
    expect(params).toEqual(['e1', 'worker-1', 'transient_server: 503', availableAt]);
  });

  it('recoveryNeeded calls outbox_recovery_needed() and unwraps the boolean', async () => {
    const db = mockDb([{ needed: true }]);
    const repo = new OutboxRepository(db);

    await expect(repo.recoveryNeeded()).resolves.toBe(true);
    const [sql] = db.query.mock.calls[0];
    expect(sql).toBe('SELECT public.outbox_recovery_needed() AS needed');
  });

  it('recoveryNeeded defaults to false on an empty result', async () => {
    const db = mockDb([]);
    const repo = new OutboxRepository(db);
    await expect(repo.recoveryNeeded()).resolves.toBe(false);
  });
});
