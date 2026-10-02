import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { config } from '../middleware.js';

const adminDir = join(__dirname, '..', 'app', 'admin');

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
