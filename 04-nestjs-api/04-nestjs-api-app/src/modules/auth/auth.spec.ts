import { AuthGuard, verifyBearer } from './auth';
const verifier = { verify: jest.fn().mockResolvedValue({ sub: 'user-1' }) };
beforeEach(() => verifier.verify.mockClear());
test('verifies a valid bearer token through the verifier boundary', async () => { const req = { header: (name: string) => name === 'authorization' ? 'Bearer access-token' : undefined } as any; await expect(verifyBearer(req, 'secret', verifier, { issuer: 'https://project.supabase.co/auth/v1', audience: 'authenticated' })).resolves.toMatchObject({ sub: 'user-1' }); expect(verifier.verify).toHaveBeenCalledWith('access-token', 'secret', { issuer: 'https://project.supabase.co/auth/v1', audience: 'authenticated' }); });
test('prefers the HttpOnly access-token cookie', async () => { const req = { header: () => 'Bearer header-token', cookies: { binay_access_token: 'cookie-token' } } as any; await expect(verifyBearer(req, 'secret', verifier)).resolves.toMatchObject({ sub: 'user-1' }); expect(verifier.verify).toHaveBeenCalledWith('cookie-token', 'secret', {}); });
test('fails closed when the verifier rejects a token', async () => { const req = { header: () => 'Bearer invalid-token' } as any; const rejecting = { verify: jest.fn().mockRejectedValue(new Error('invalid')) }; await expect(verifyBearer(req, 'secret', rejecting)).rejects.toThrow('UNAUTHORIZED'); });
test('fails closed when no access token is present', async () => { const req = { header: () => undefined } as any; await expect(verifyBearer(req, 'secret', verifier)).rejects.toThrow('UNAUTHORIZED'); });
test('fails closed for malformed authorization header', async () => { const req = { header: () => 'Basic abc' } as any; await expect(verifyBearer(req, 'secret', verifier)).rejects.toThrow('UNAUTHORIZED'); });

describe('AuthGuard account status verification', () => {
  it('allows active users with clean account state', async () => {
    const system = { query: jest.fn().mockResolvedValue({ rows: [{ status: 'active', deleted_at: null, locked_until: null }] }) } as any;
    const guard = new AuthGuard('secret', verifier, {}, system);
    const ctx = { switchToHttp: () => ({ getRequest: () => ({ header: () => 'Bearer token' }) }) } as any;
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('rejects suspended users', async () => {
    const system = { query: jest.fn().mockResolvedValue({ rows: [{ status: 'suspended', deleted_at: null, locked_until: null }] }) } as any;
    const guard = new AuthGuard('secret', verifier, {}, system);
    const ctx = { switchToHttp: () => ({ getRequest: () => ({ header: () => 'Bearer token' }) }) } as any;
    await expect(guard.canActivate(ctx)).rejects.toThrow('UNAUTHORIZED');
  });

  it('rejects soft-deleted users', async () => {
    const system = { query: jest.fn().mockResolvedValue({ rows: [{ status: 'active', deleted_at: '2026-08-28T00:00:00.000Z', locked_until: null }] }) } as any;
    const guard = new AuthGuard('secret', verifier, {}, system);
    const ctx = { switchToHttp: () => ({ getRequest: () => ({ header: () => 'Bearer token' }) }) } as any;
    await expect(guard.canActivate(ctx)).rejects.toThrow('UNAUTHORIZED');
  });

  it('rejects locked users', async () => {
    const system = { query: jest.fn().mockResolvedValue({ rows: [{ status: 'active', deleted_at: null, locked_until: new Date(Date.now() + 60000).toISOString() }] }) } as any;
    const guard = new AuthGuard('secret', verifier, {}, system);
    const ctx = { switchToHttp: () => ({ getRequest: () => ({ header: () => 'Bearer token' }) }) } as any;
    await expect(guard.canActivate(ctx)).rejects.toThrow('UNAUTHORIZED');
  });
});
