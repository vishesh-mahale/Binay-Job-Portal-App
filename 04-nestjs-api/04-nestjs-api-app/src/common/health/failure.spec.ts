import { HealthService } from './health';
import { DatabaseService } from '../../infrastructure/database/database';

test('readiness propagates database outage', async () => { const db = { query: jest.fn().mockRejectedValue(new Error('db unavailable')) } as any; await expect(new HealthService(db).ready()).rejects.toThrow('db unavailable'); });
test('database shutdown closes the pool', async () => { const service = Object.create(DatabaseService.prototype) as DatabaseService; (service as any).pool = { end: jest.fn().mockResolvedValue(undefined) }; await service.onModuleDestroy(); expect((service as any).pool.end).toHaveBeenCalled(); });