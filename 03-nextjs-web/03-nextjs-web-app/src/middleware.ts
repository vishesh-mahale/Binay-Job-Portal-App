import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect /dashboard routes
  if (pathname.startsWith('/dashboard')) {
    const accessToken = request.cookies.get('binay_access_token');
    const presenceSession = request.cookies.get('binay_presence_session');

    // If no auth cookie is present in request headers
    if (!accessToken && !presenceSession) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirectTo', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
