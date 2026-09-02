/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

describe('Edge Middleware Protected Routes', () => {
  it('redirects unauthenticated users without cookies to /login with redirectTo param', () => {
    const request = new NextRequest('http://localhost:3001/dashboard/candidate');
    const response = middleware(request);

    expect(response.status).toBe(307); // Next.js redirect status
    expect(response.headers.get('location')).toBe(
      'http://localhost:3001/login?redirectTo=%2Fdashboard%2Fcandidate'
    );
  });

  it('allows request through when binay_access_token cookie is present', () => {
    const request = new NextRequest('http://localhost:3001/dashboard/candidate');
    request.cookies.set('binay_access_token', 'mock.jwt.token');

    const response = middleware(request);

    expect(response.status).toBe(200); // NextResponse.next() default
  });

  it('allows request through when binay_presence_session cookie is present', () => {
    const request = new NextRequest('http://localhost:3001/dashboard/employer');
    request.cookies.set('binay_presence_session', 'sess-123');

    const response = middleware(request);

    expect(response.status).toBe(200);
  });

  it('passes through non-dashboard public routes without redirecting', () => {
    const request = new NextRequest('http://localhost:3001/login');
    const response = middleware(request);

    expect(response.status).toBe(200);
  });
});
