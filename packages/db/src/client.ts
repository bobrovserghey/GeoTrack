import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index';

export function createClient(connectionString: string) {
  const sql = postgres(connectionString);
  return drizzle(sql, { schema });
}

export type DbClient = ReturnType<typeof createClient>;
