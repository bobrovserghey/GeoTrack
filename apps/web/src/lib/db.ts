import { createClient } from '@geotrack/db/client';

let _db: ReturnType<typeof createClient> | null = null;

export function getDb() {
  if (!_db) {
    const url = process.env['DATABASE_URL'];
    if (!url) throw new Error('DATABASE_URL is not set');
    _db = createClient(url);
  }
  return _db;
}
