import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createDb } from './harness';

describe('migrations and seed', () => {
  it('apply cleanly in order on an empty database, with every public table protected by RLS', async () => {
    const db = await createDb();
    const tables = await db.query<{ n: string }>(`select count(*)::text n from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`);
    expect(Number(tables.rows[0]!.n)).toBeGreaterThan(30);
    const unprotected = await db.query<{ relname: string }>(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    expect(unprotected.rows.map((r) => r.relname)).toEqual([]);
    await db.close();
  });

  it('seed.sql loads and is idempotent', async () => {
    const db = await createDb();
    const seed = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'seed.sql'), 'utf8');
    await db.exec(seed);
    await db.exec(seed);
    const n = await db.query<{ n: string }>(`select count(*)::text n from public.destinations where slug like '%'`);
    expect(Number(n.rows[0]!.n)).toBe(5);
    await db.close();
  });
});
