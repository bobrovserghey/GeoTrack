import { defineConfig } from 'drizzle-kit';

// `generate` only diffs the schema and needs no database; `migrate` and `push`
// write to one, so they must never silently fall back to a local default.
const writesToDb = process.argv.some((a) => a === 'migrate' || a === 'push');
if (writesToDb && !process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required for drizzle-kit migrate/push');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/*.ts',
  out: './migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/geotrack',
  },
});
