import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { is } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from '../schema/index';

// Supabase exposes every table of the `public` schema through the Data API, and
// the `anon` key is shipped to every browser by design. A table without RLS is
// therefore readable and writable by anyone holding that key. RLS with no
// policies denies those roles outright; the application is unaffected because
// it connects over DATABASE_URL with the owner role, which bypasses RLS
// (ADR-028, decision Р-18).
//
// `Object.values(schema)` also yields PgEnum values, and a type predicate on
// `is(v, PgTable)` does not narrow the union for tsc — hence the explicit cast.
const tables = Object.values(schema).filter((v) => is(v, PgTable)) as PgTable[];

// --- migration SQL parsing -------------------------------------------------
//
// The checks below replay the migrations instead of searching the concatenated
// text for substrings. Two reasons, both of them past bugs of this test:
//   - a commented-out statement is not applied to the database, so it must not
//     count as evidence that RLS is on;
//   - CREATE/DROP/ENABLE/DISABLE are a sequence, not a set: a table dropped in
//     one migration and recreated in a later one exists in the database, and
//     its RLS flag is back to off.

// Removes block and line comments in one left-to-right pass, so whichever
// opener comes first wins (`-- /*` is a line comment, `/* -- */` a block one).
//
// Known limitations, both of them loud rather than silent if they ever matter:
//   - a `--` or `/*` inside a string literal would also be treated as a
//     comment. No migration contains one, and the consequence would be a loud
//     failure of the statement-count check below, not a silent pass;
//   - `normalizeIdent` does not collapse the doubled quotes Postgres uses to
//     escape a quote inside a quoted identifier, because `IDENT` stops at the
//     first `"`: `"we""ird"` parses as `we`. drizzle-kit never emits such a
//     name (it derives identifiers from TypeScript keys), and a mismatch would
//     surface as a failure of the schema/migration sync check.
const stripSqlComments = (sql: string): string =>
  sql.replace(/\/\*[\s\S]*?\*\/|--[^\n]*/g, ' ');

// A table reference as drizzle-kit, psql or a hand-written migration may spell
// it: quoted or bare, optionally schema-qualified, with arbitrary whitespace.
const IDENT = String.raw`(?:"[^"]*"|[A-Za-z_][A-Za-z0-9_$]*)`;
const SCHEMA_PREFIX = String.raw`(?:${IDENT}\s*\.\s*)?`;

const CREATE_TABLE = String.raw`\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`;
const DROP_TABLE = String.raw`\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?`;

// Deliberately looser counterparts of the two patterns above, used only by the
// anti-silence check: they must detect a table statement the parser cannot
// read. Reusing the parser's own patterns there would only catch a failure in
// the identifier (`CREATE TABLE 1bad`), never one in the prefix — `CREATE
// TABLE"a"` (no space before the quote), `CREATE UNLOGGED TABLE "u"` and
// `CREATE TEMP TABLE t` would be invisible to both sides and the table would
// escape the RLS requirement silently. TEMP and UNLOGGED tables in `public`
// formally need RLS too; what matters here is that they cannot slip through
// unnoticed.
const RAW_CREATE_TABLE =
  String.raw`\bCREATE\s+(?:(?:GLOBAL|LOCAL)\s+)?(?:TEMP(?:ORARY)?\s+|UNLOGGED\s+)?TABLE\b`;
const RAW_DROP_TABLE = String.raw`\bDROP\s+TABLE\b`;

// One regexp for all three statement kinds, so matches come back in the order
// they appear in the file. Not handled: `ALTER TABLE ... RENAME TO` — no
// migration uses it today. When one does, the renamed table stays in the
// replayed list under its old name and the schema/migration sync check fails
// loudly; the fix then is this parser, not the schema.
//
// Also not handled, and safe in the same direction: a multi-table
// `DROP TABLE a, b;` yields only `a`, so the raw/parsed counts still agree and
// the anti-silence check stays quiet. `b` merely stays in the replayed list of
// live tables, which makes the schema/migration sync check fail loudly. The
// parser never pretends a table is gone when it is not — that is the direction
// that would hide a table from the RLS requirement.
const OP_RE = new RegExp(
  [
    String.raw`${CREATE_TABLE}${SCHEMA_PREFIX}(?<create>${IDENT})`,
    String.raw`${DROP_TABLE}${SCHEMA_PREFIX}(?<drop>${IDENT})`,
    String.raw`\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${SCHEMA_PREFIX}` +
      String.raw`(?<rls>${IDENT})\s+(?<rlsAction>ENABLE|DISABLE)\s+ROW\s+LEVEL\s+SECURITY\b`,
  ].join('|'),
  'gi',
);

// Postgres folds a bare identifier to lower case and keeps a quoted one as
// written, so `Orders` and `"Orders"` are different tables.
const normalizeIdent = (raw: string): string =>
  raw.startsWith('"') ? raw.slice(1, -1) : raw.toLowerCase();

type TableOp =
  | { kind: 'create'; name: string }
  | { kind: 'drop'; name: string }
  | { kind: 'rls'; name: string; enabled: boolean };

const parseTableOps = (rawSql: string): TableOp[] => {
  const sql = stripSqlComments(rawSql);
  const ops: TableOp[] = [];
  for (const m of sql.matchAll(OP_RE)) {
    const g = m.groups ?? {};
    if (g.create !== undefined) ops.push({ kind: 'create', name: normalizeIdent(g.create) });
    else if (g.drop !== undefined) ops.push({ kind: 'drop', name: normalizeIdent(g.drop) });
    else if (g.rls !== undefined)
      ops.push({
        kind: 'rls',
        name: normalizeIdent(g.rls),
        enabled: (g.rlsAction ?? '').toUpperCase() === 'ENABLE',
      });
  }
  return ops;
};

// Exposed for the parser unit test below: the table names a migration creates,
// in order of appearance.
const parseTableNames = (sql: string): string[] =>
  parseTableOps(sql).flatMap((op) => (op.kind === 'create' ? [op.name] : []));

const parseDroppedTableNames = (sql: string): string[] =>
  parseTableOps(sql).flatMap((op) => (op.kind === 'drop' ? [op.name] : []));

// Replays the migrations in order — files by file name, statements by position
// inside each file — and returns the tables the database holds afterwards plus
// those left with RLS on. CREATE after DROP resurrects the table with RLS off,
// which is exactly how Postgres behaves.
const replayMigrations = (sqls: readonly string[]) => {
  const live = new Set<string>();
  const rlsEnabled = new Set<string>();
  for (const sql of sqls) {
    for (const op of parseTableOps(sql)) {
      if (op.kind === 'create') {
        live.add(op.name);
        rlsEnabled.delete(op.name);
      } else if (op.kind === 'drop') {
        live.delete(op.name);
        rlsEnabled.delete(op.name);
      } else if (op.enabled) {
        rlsEnabled.add(op.name);
      } else {
        rlsEnabled.delete(op.name);
      }
    }
  }
  return { tables: [...live].sort(), rlsEnabled };
};

// --- the real migrations ---------------------------------------------------

const migrationsDir = join(__dirname, '..', '..', 'migrations');
const migrationFiles = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

// Only `migrations/*.sql` feeds this text. That is what makes the FORCE check
// below meaningful: the literal inside the expectation is not part of it.
//
// The names say `Stripped` on purpose: comments are already gone here, which is
// a required property of the FORCE check (a commented-out FORCE statement is
// not applied and must not fail it) and is relied on by the anti-silence check,
// which counts raw occurrences in this text. `parseTableOps` strips again — the
// operation is idempotent — because it also runs on raw SQL in the unit tests.
const strippedMigrationSqls = migrationFiles.map((f) =>
  stripSqlComments(readFileSync(join(migrationsDir, f), 'utf-8')),
);
const strippedMigrationSql = strippedMigrationSqls.join('\n');

// Shared by the check below and its unit test, so the two can never drift.
// Intentionally without the `g` flag: `.test()` on a global regexp advances
// `lastIndex` and a shared instance would then answer differently on every
// other call.
const FORCE_RLS_RE = /(?<!\bNO\s+)\bFORCE\s+ROW\s+LEVEL\s+SECURITY\b/i;

const schemaTables = tables.map((t) => getTableConfig(t).name).sort();

// Tables the database holds once every migration has run. Derived from the SQL
// rather than from the schema, so the two lists are independent evidence of the
// same fact.
const { tables: migrationTables, rlsEnabled: migrationRlsEnabled } =
  replayMigrations(strippedMigrationSqls);

describe('migration SQL parser', () => {
  // The parser is the single point of failure for every check below: a name it
  // does not recognise lands in neither list, so the table silently escapes the
  // RLS requirement. Pinned here on every spelling of CREATE TABLE we may meet.
  it('recognises every spelling of CREATE TABLE', () => {
    const sql = [
      'CREATE TABLE IF NOT EXISTS "audits_v2" ("id" uuid);',
      'CREATE TABLE IF NOT EXISTS "public"."rate_limits" ("id" uuid);',
      'CREATE TABLE IF NOT EXISTS rate_limits2 ("id" uuid);',
      'CREATE TABLE "Orders" ("id" uuid);',
      'create table if not exists public . folded_name ("id" uuid);',
      'CREATE\n  TABLE\n\t"spread_out"\n  ("id" uuid);',
      'CREATE TABLE if NoT ExIsTs "mixed_case_kw" ("id" uuid);',
      '-- CREATE TABLE "line_commented" ("id" uuid);',
      '    -- CREATE TABLE "indented_comment" ("id" uuid);',
      '/* CREATE TABLE "block_commented" ("id" uuid); */',
      'CREATE TYPE "public"."not_a_table" AS ENUM(\'a\');',
    ].join('\n');

    expect(parseTableNames(sql)).toEqual([
      'audits_v2',
      'rate_limits',
      'rate_limits2',
      'Orders',
      'folded_name',
      'spread_out',
      'mixed_case_kw',
    ]);
  });

  it('recognises every spelling of DROP TABLE', () => {
    const sql = [
      'DROP TABLE "audits_v2";',
      'DROP TABLE IF EXISTS "public"."rate_limits";',
      'drop table if exists rate_limits2 cascade;',
      'DROP\n  TABLE\n  "Orders";',
      '-- DROP TABLE "line_commented";',
    ].join('\n');

    expect(parseDroppedTableNames(sql)).toEqual([
      'audits_v2',
      'rate_limits',
      'rate_limits2',
      'Orders',
    ]);
  });
});

describe('migration replay', () => {
  it('keeps a table that is dropped and later recreated, with RLS back off', () => {
    const state = replayMigrations([
      'CREATE TABLE "x" ("id" uuid);\nALTER TABLE "x" ENABLE ROW LEVEL SECURITY;',
      'DROP TABLE "x";',
      'CREATE TABLE "x" ("id" uuid);',
    ]);

    expect(state.tables).toEqual(['x']);
    expect(state.rlsEnabled.has('x')).toBe(false);
  });

  it('respects statement order inside a single file', () => {
    expect(replayMigrations(['DROP TABLE "y";\nCREATE TABLE "y" ("id" uuid);']).tables).toEqual([
      'y',
    ]);
    expect(replayMigrations(['CREATE TABLE "y" ("id" uuid);\nDROP TABLE "y";']).tables).toEqual([]);
  });

  it('reads RLS state from applied statements only, in order', () => {
    const create = 'CREATE TABLE "z" ("id" uuid);';
    const rlsOf = (sqls: string[]) => replayMigrations(sqls).rlsEnabled.has('z');

    expect(rlsOf([create, '-- ALTER TABLE "z" ENABLE ROW LEVEL SECURITY;'])).toBe(false);
    expect(rlsOf([create, 'ALTER TABLE "z" ENABLE ROW LEVEL SECURITY;'])).toBe(true);
    expect(rlsOf([create, 'ALTER TABLE ONLY public.z ENABLE ROW LEVEL SECURITY;'])).toBe(true);
    expect(
      rlsOf([
        create,
        'ALTER TABLE "z" ENABLE ROW LEVEL SECURITY;',
        'ALTER TABLE "z" DISABLE ROW LEVEL SECURITY;',
      ]),
    ).toBe(false);
  });
});

describe('row level security', () => {
  // Guards every test below against passing vacuously: if the PgTable filter or
  // the SQL patterns ever stop matching, the lists go empty and the checks that
  // iterate over them would succeed while proving nothing.
  it('finds tables in both the schema and the migrations', () => {
    expect(schemaTables.length).toBeGreaterThan(0);
    expect(migrationTables.length).toBeGreaterThan(0);
  });

  // The anti-silence check. Should drizzle-kit ever emit a CREATE/DROP TABLE in
  // a shape `OP_RE` does not understand, the table would appear in neither list
  // and would quietly escape the RLS requirement. Counting raw occurrences
  // against parsed names turns that into a failure here instead. The raw count
  // uses the deliberately looser `RAW_*` patterns, not the parser's own: a
  // shared pattern can only disagree with the parser about the identifier,
  // never about the prefix it expects.
  it('recognises every CREATE TABLE and DROP TABLE in the migrations', () => {
    migrationFiles.forEach((file, i) => {
      const sql = strippedMigrationSqls[i] as string;
      const ops = parseTableOps(sql);
      expect(ops.filter((o) => o.kind === 'create').length, `CREATE TABLE in ${file}`).toBe(
        [...sql.matchAll(new RegExp(RAW_CREATE_TABLE, 'gi'))].length,
      );
      expect(ops.filter((o) => o.kind === 'drop').length, `DROP TABLE in ${file}`).toBe(
        [...sql.matchAll(new RegExp(RAW_DROP_TABLE, 'gi'))].length,
      );
    });
  });

  // A table added straight to a migration without reaching the Drizzle schema
  // would never be covered by the per-schema check below, and would sit in the
  // database without RLS unnoticed.
  it('keeps the Drizzle schema and the migrations in sync', () => {
    expect(schemaTables).toEqual(migrationTables);
  });

  it('has RLS enabled on every table of the schema', () => {
    for (const table of tables) {
      const config = getTableConfig(table);
      expect(config.enableRLS, config.name).toBe(true);
    }
  });

  // A table can carry .enableRLS() in the schema while the migration that turns
  // it on in the database was never generated. Then db:push and db:migrate
  // disagree, and the production database stays open. Iterating over the
  // migration list, not the schema list, keeps this independent of the schema.
  it('enables RLS in the migrations on every table the database holds', () => {
    for (const name of migrationTables) {
      expect(migrationRlsEnabled.has(name), name).toBe(true);
    }
  });

  // FORCE applies RLS to the table owner as well — that is the role the
  // application itself connects with, so every query would start returning
  // nothing. `NO FORCE` is the statement that takes FORCE back off and must not
  // trip the check; comments are already gone from `strippedMigrationSql`.
  it('never forces RLS', () => {
    expect(strippedMigrationSql).not.toMatch(FORCE_RLS_RE);
  });
});

// No migration contains FORCE today, so the check above would pass on an
// `FORCE_RLS_RE` that matches nothing at all. These cases pin the pattern
// itself on local strings — feeding them into `strippedMigrationSql` would
// defeat the point of that text coming from `migrations/*.sql` only.
describe('FORCE_RLS_RE', () => {
  it('matches FORCE ROW LEVEL SECURITY in any spelling', () => {
    expect('ALTER TABLE x FORCE ROW LEVEL SECURITY;').toMatch(FORCE_RLS_RE);
    expect('ALTER TABLE x force\n row\tlevel   security;').toMatch(FORCE_RLS_RE);
    expect('ALTER TABLE ONLY public.x FoRcE RoW LeVeL SeCuRiTy;').toMatch(FORCE_RLS_RE);
  });

  it('does not match NO FORCE, which turns FORCE back off', () => {
    expect('ALTER TABLE x NO FORCE ROW LEVEL SECURITY;').not.toMatch(FORCE_RLS_RE);
    expect('ALTER TABLE x NO  FORCE ROW LEVEL SECURITY;').not.toMatch(FORCE_RLS_RE);
    expect('ALTER TABLE x no force row level security;').not.toMatch(FORCE_RLS_RE);
    expect('ALTER TABLE x NO\n\tFORCE ROW LEVEL SECURITY;').not.toMatch(FORCE_RLS_RE);
  });

  it('answers the same on repeated calls (no lastIndex state)', () => {
    const sql = 'ALTER TABLE x FORCE ROW LEVEL SECURITY;';
    expect(FORCE_RLS_RE.test(sql)).toBe(true);
    expect(FORCE_RLS_RE.test(sql)).toBe(true);
    expect(FORCE_RLS_RE.global).toBe(false);
  });
});
