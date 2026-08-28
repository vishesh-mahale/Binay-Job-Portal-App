import { HealthService } from './health';
test('readiness checks the database', async () => { const db = { query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }) } as any; await expect(new HealthService(db).ready()).resolves.toBe(true); expect(db.query).toHaveBeenCalledWith('SELECT 1'); });
