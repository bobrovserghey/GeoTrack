import { describe, it, expect } from 'vitest';
import { validateWebEnv } from '../env.js';

const COMPLETE_ENV: Record<string, string | undefined> = {
  DATABASE_URL: 'postgres://localhost/geotrack',
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  ADMIN_SECRET: 'admin-secret',
  AUDIT_SERVICE_KEY: 'audit-service-key',
  TURNSTILE_SECRET_KEY: 'turnstile-secret',
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'turnstile-site-key',
  NEXT_PUBLIC_APP_URL: 'https://geotrack.example',
  INNGEST_EVENT_KEY: 'inngest-event-key',
  FREE_DAILY_CEILING: '50',
};

describe('validateWebEnv', () => {
  it('does not throw when every required variable is present', () => {
    expect(() => validateWebEnv(COMPLETE_ENV)).not.toThrow();
  });

  it('throws naming every missing variable, not just the first', () => {
    const env = { ...COMPLETE_ENV };
    delete env.DATABASE_URL;
    delete env.ADMIN_SECRET;
    delete env.NEXT_PUBLIC_APP_URL;

    let message = '';
    try {
      validateWebEnv(env);
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('ADMIN_SECRET');
    expect(message).toContain('NEXT_PUBLIC_APP_URL');
  });

  it('treats an empty string the same as missing', () => {
    const env = { ...COMPLETE_ENV, TURNSTILE_SECRET_KEY: '' };
    expect(() => validateWebEnv(env)).toThrowError(/TURNSTILE_SECRET_KEY/);
  });

  it.each([
    'DATABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ADMIN_SECRET',
    'AUDIT_SERVICE_KEY',
    'TURNSTILE_SECRET_KEY',
    'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
    'NEXT_PUBLIC_APP_URL',
    'INNGEST_EVENT_KEY',
    'FREE_DAILY_CEILING',
  ])('reports %s as missing on its own', (name) => {
    const env = { ...COMPLETE_ENV };
    delete env[name as keyof typeof env];
    expect(() => validateWebEnv(env)).toThrowError(new RegExp(name));
  });
});
