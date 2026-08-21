import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { OutboxRepository } from '../src/database/outbox.repository';

/**
 * HTTP-surface tests: boots the real AppModule (env validation, DI wiring,
 * guard, routes) with the repository's DB calls mocked — no live Postgres.
 */

const CURRENT = 'current-secret';
const PREVIOUS = 'previous-secret';

describe('HTTP surface — wake guard + health', () => {
  let app: INestApplication;
  let repo: OutboxRepository;
  let claimSpy: jest.SpyInstance;
  let recoverySpy: jest.SpyInstance;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
    process.env.WEBHOOK_SECRET = CURRENT;
    process.env.WEBHOOK_SECRET_PREVIOUS = PREVIOUS;
    process.env.DISPATCH_MODE = 'direct';
    process.env.FASTAPI_WORKER_URL = 'http://127.0.0.1:8000';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    // Same injected instance the DispatcherService/HealthController use.
    repo = app.get(OutboxRepository);
    claimSpy = jest.spyOn(repo, 'claimEvents').mockResolvedValue([]);
    recoverySpy = jest.spyOn(repo, 'recoveryNeeded').mockResolvedValue(false);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/liveness → 200 without touching the DB', async () => {
    await request(app.getHttpServer()).get('/health/liveness').expect(200, { status: 'ok' });
  });

  it('GET /health/readiness → 200 when the DB call succeeds', async () => {
    recoverySpy.mockResolvedValueOnce(false);
    await request(app.getHttpServer()).get('/health/readiness').expect(200, { status: 'ready' });
  });

  it('GET /health/readiness → 503 when the DB is unreachable', async () => {
    recoverySpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await request(app.getHttpServer())
      .get('/health/readiness')
      .expect(503, { status: 'unavailable' });
  });

  it('POST /internal/dispatcher/wake without secret → 401', async () => {
    await request(app.getHttpServer()).post('/internal/dispatcher/wake').expect(401);
    expect(claimSpy).not.toHaveBeenCalled();
  });

  it('POST wake with wrong secret → 401 and no claim attempt', async () => {
    await request(app.getHttpServer())
      .post('/internal/dispatcher/wake')
      .set('x-webhook-secret', 'wrong')
      .expect(401);
    expect(claimSpy).not.toHaveBeenCalled();
  });

  it('POST wake with the CURRENT secret → 200 accepted + drain summary', async () => {
    const response = await request(app.getHttpServer())
      .post('/internal/dispatcher/wake')
      .set('x-webhook-secret', CURRENT)
      .send({ type: 'INSERT', record: { payload: 'IGNORED — PII must never be parsed' } })
      .expect(200);
    expect(response.body).toMatchObject({ accepted: true, claimed: 0, published: 0, failed: 0 });
  });

  it('POST wake with the PREVIOUS secret → 200 (rotation window)', async () => {
    await request(app.getHttpServer())
      .post('/internal/dispatcher/wake')
      .set('x-webhook-secret', PREVIOUS)
      .expect(200);
  });

  it('GET on unknown routes → 404 (no extra surface exposed)', async () => {
    await request(app.getHttpServer()).get('/internal/dispatcher/wake').expect(404);
    await request(app.getHttpServer()).get('/health/metrics').expect(404);
  });
});
