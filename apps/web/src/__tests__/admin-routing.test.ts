import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { config, middleware } from '../middleware.js';
import { ADMIN_COOKIE, hashSecret } from '../lib/admin-auth.js';

const adminDir = join(__dirname, '..', 'app', 'admin');

const SECRET = 'test-admin-secret';

beforeAll(() => {
  process.env['ADMIN_SECRET'] = SECRET;
});

function request(path: string, cookie?: string): NextRequest {
  const req = new NextRequest(`https://geotrack.test${path}`);
  if (cookie !== undefined) req.cookies.set(ADMIN_COOKIE, cookie);
  return req;
}

// NextResponse.next() carries this header; a redirect does not.
function isPassThrough(res: Response): boolean {
  return res.headers.get('x-middleware-next') === '1' && res.headers.get('location') === null;
}

describe('admin routing', () => {
  // A session-checking layout above /admin/login redirects the login page to
  // itself forever, so nobody can sign in. The guarded pages live in the
  // (panel) route group instead.
  it('does not wrap the login page in the session-checking layout', () => {
    expect(existsSync(join(adminDir, 'layout.tsx'))).toBe(false);
    expect(existsSync(join(adminDir, '(panel)', 'layout.tsx'))).toBe(true);
    expect(existsSync(join(adminDir, 'login', 'page.tsx'))).toBe(true);
  });

  // admin-auth uses node:crypto, which the Edge runtime does not provide.
  it('runs the admin middleware on the Node.js runtime', () => {
    expect(config.runtime).toBe('nodejs');
  });
});

// The filesystem assertions above hold even if the guard inside (panel)/layout
// or the middleware stops working, so the behaviour is pinned separately.
describe('admin middleware behaviour', () => {
  it('sends an unauthenticated admin page to the login form, remembering the target', () => {
    const res = middleware(request('/admin/audits'));

    expect(res.status).toBe(307);
    const location = new URL(res.headers.get('location') as string);
    expect(location.pathname).toBe('/admin/login');
    expect(location.searchParams.get('next')).toBe('/admin/audits');
  });

  // This is the redirect loop the branch fixes: if the login page itself were
  // guarded, it would bounce to itself forever and nobody could sign in.
  it('lets the login page through without a cookie', () => {
    expect(isPassThrough(middleware(request('/admin/login')))).toBe(true);
  });

  it('lets a valid session through', () => {
    expect(isPassThrough(middleware(request('/admin/audits', hashSecret(SECRET))))).toBe(true);
  });

  it('rejects a cookie that is not the expected hash', () => {
    const res = middleware(request('/admin/audits', 'not-the-hash'));
    expect(res.status).toBe(307);
  });
});
