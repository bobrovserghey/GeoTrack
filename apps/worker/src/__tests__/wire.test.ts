import { describe, it, expect, vi, beforeEach } from 'vitest';

const setAuditRunDeps = vi.fn();
const createClient = vi.fn(() => ({ fake: 'db' }));
vi.mock('../functions/audit-run.js', () => ({ setAuditRunDeps }));
vi.mock('@geotrack/db/client', () => ({ createClient }));

describe('wireAuditRunDeps', () => {
  beforeEach(() => {
    setAuditRunDeps.mockClear();
    createClient.mockClear();
  });

  it('connects the pipeline to the database when DATABASE_URL is set', async () => {
    const { wireAuditRunDeps } = await import('../deps/wire.js');
    expect(wireAuditRunDeps({ DATABASE_URL: 'postgres://u:p@h/db' })).toBe(true);
    expect(createClient).toHaveBeenCalledWith('postgres://u:p@h/db');
    expect(setAuditRunDeps).toHaveBeenCalledOnce();
  });

  it('does nothing without DATABASE_URL (resolveAuditRunDeps then guards production)', async () => {
    const { wireAuditRunDeps } = await import('../deps/wire.js');
    expect(wireAuditRunDeps({})).toBe(false);
    expect(wireAuditRunDeps({ DATABASE_URL: '' })).toBe(false);
    expect(setAuditRunDeps).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });
});
