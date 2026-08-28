import { requestContext } from './request-context';
test('preserves a safe incoming request id', () => { const req = { header: () => 'req-123' } as any; const res = { setHeader: jest.fn() } as any; const next = jest.fn(); requestContext(req, res, next); expect(res.setHeader).toHaveBeenCalledWith('x-request-id', 'req-123'); expect(next).toHaveBeenCalled(); });
