import { ApiClient } from './api-client';
import { AppApiError } from './errors';

describe('ApiClient', () => {
  let client: ApiClient;

  beforeEach(() => {
    client = new ApiClient('http://localhost:3000');
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('sends credentials include and correlation headers', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ status: 'authenticated', user_id: 'u_123' }),
    });

    const res = await client.login({ email: 'test@example.com', password: 'password123' });
    expect(res).toEqual({ status: 'authenticated', user_id: 'u_123' });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/v1/auth/login');
    expect(options.credentials).toBe('include');
    expect(options.headers['x-request-id']).toBeDefined();
    expect(options.headers['x-trace-id']).toBeDefined();
  });

  it('unwraps standardized data envelope when present', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        schema_version: 1,
        request_id: 'r1',
        trace_id: 't1',
        data: { id: 'u_1', email: 'test@example.com', role: 'candidate', status: 'active' },
      }),
    });

    const user = await client.getMe();
    expect(user.id).toBe('u_1');
    expect(user.email).toBe('test@example.com');
  });

  it('throws AppApiError on non-ok status', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: { get: () => 'application/json' },
      json: async () => ({
        error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' },
      }),
    });

    await expect(client.login({ email: 'bad@example.com', password: 'wrong' })).rejects.toThrow(AppApiError);
  });

  it('automatically refreshes token on 401 and retries original request once', async () => {
    // Call 1: /api/v1/auth/me returns 401
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Token expired' } }),
    });

    // Call 2: /api/v1/auth/refresh returns 200 refreshed
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ status: 'refreshed', user_id: 'u_1' }),
    });

    // Call 3: Retried /api/v1/auth/me returns 200 with user data
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        data: { id: 'u_1', email: 'refreshed@example.com', role: 'candidate', status: 'active' },
      }),
    });

    const user = await client.getMe();
    expect(user.email).toBe('refreshed@example.com');
    expect(global.fetch).toHaveBeenCalledTimes(3);

    const call1Url = (global.fetch as jest.Mock).mock.calls[0][0];
    const call2Url = (global.fetch as jest.Mock).mock.calls[1][0];
    const call3Url = (global.fetch as jest.Mock).mock.calls[2][0];

    expect(call1Url).toBe('http://localhost:3000/api/v1/auth/me');
    expect(call2Url).toBe('http://localhost:3000/api/v1/auth/refresh');
    expect(call3Url).toBe('http://localhost:3000/api/v1/auth/me');
  });

  it('does not infinitely retry if refreshed retry also returns 401', async () => {
    // Call 1: /api/v1/auth/me returns 401
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Token expired' } }),
    });

    // Call 2: /api/v1/auth/refresh returns 200
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ status: 'refreshed' }),
    });

    // Call 3: Retried /api/v1/auth/me still returns 401
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Still unauthorized' } }),
    });

    await expect(client.getMe()).rejects.toThrow(AppApiError);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('fails fast if refresh call itself returns error', async () => {
    // Call 1: /api/v1/auth/me returns 401
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Session expired' } }),
    });

    // Call 2: /api/v1/auth/refresh returns 401 (session revoked)
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Refresh token invalid' } }),
    });

    await expect(client.getMe()).rejects.toThrow(AppApiError);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('uploads a resume as multipart without forcing an application/json content type', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ document_id: 'doc-1', reused: false }),
    });

    const file = new File(['resume'], 'resume.pdf', { type: 'application/pdf' });
    await client.uploadResume(file, true);
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.headers['Content-Type']).toBeUndefined();
    expect(options.headers.Accept).toBe('application/json');
  });

  it('uses the authenticated candidate routes for profile, resume and applications', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ data: [] }),
    });

    await client.getCandidateProfile();
    await client.listCandidateResumes();
    await client.getMyApplications();

    expect((global.fetch as jest.Mock).mock.calls.map((call) => call[0])).toEqual([
      'http://localhost:3000/api/v1/candidates/me',
      'http://localhost:3000/api/v1/resumes',
      'http://localhost:3000/api/v1/me/applications',
    ]);
  });
});
