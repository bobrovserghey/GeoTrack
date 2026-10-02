import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ADMIN_COOKIE, isValidSession } from './lib/admin-auth';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith('/admin')) return NextResponse.next();
  if (pathname === '/admin/login') return NextResponse.next();

  const session = request.cookies.get(ADMIN_COOKIE)?.value;
  if (!isValidSession(session)) {
    const loginUrl = new URL('/admin/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// admin-auth hashes the session cookie with node:crypto, which the default
// Edge runtime does not provide — every /admin request would 500 there.
export const config = {
  runtime: 'nodejs',
  matcher: ['/admin/:path*'],
};
