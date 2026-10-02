import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const migrationsDir = join(__dirname, '..', '..', 'migrations');

type JournalEntry = { idx: number; tag: string; when: number };
const journal = JSON.parse(readFileSync(join(migrationsDir, 'meta', '_journal.json'), 'utf-8')) as {
  entries: JournalEntry[];
};

// drizzle-orm's migrator applies a migration only when its journal `when` is
// greater than the created_at of the LAST applied one. A `when` that is not
// strictly increasing makes it silently skip migrations on any existing DB.
describe('drizzle migrations journal', () => {
  it('has strictly increasing `when` in idx order', () => {
    for (let i = 1; i < journal.entries.length; i++) {
      expect(journal.entries[i].when, journal.entries[i].tag).toBeGreaterThan(journal.entries[i - 1].when);
    }
  });

  it('has contiguous idx values and a .sql file per entry', () => {
    journal.entries.forEach((e, i) => {
      expect(e.idx).toBe(i);
      expect(existsSync(join(migrationsDir, `${e.tag}.sql`)), e.tag).toBe(true);
    });
  });

  // Without a snapshot per migration, `drizzle-kit generate` diffs against a
  // stale one and re-emits changes that earlier migrations already applied.
  it('has a snapshot per migration, chained by prevId', () => {
    let prev = '00000000-0000-0000-0000-000000000000';
    for (const e of journal.entries) {
      const file = join(migrationsDir, 'meta', `${String(e.idx).padStart(4, '0')}_snapshot.json`);
      expect(existsSync(file), e.tag).toBe(true);
      const snap = JSON.parse(readFileSync(file, 'utf-8')) as { id: string; prevId: string };
      expect(snap.prevId, e.tag).toBe(prev);
      prev = snap.id;
    }
  });
});
