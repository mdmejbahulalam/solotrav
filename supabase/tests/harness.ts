import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/**
 * Minimal emulation of the Supabase platform pieces our migrations rely on:
 * roles (anon/authenticated/service_role), auth.uid(), auth.users, and the storage schema.
 * The real platform provides all of these; this lets us test RLS without Docker.
 */
const BOOTSTRAP = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create schema storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text not null, owner uuid, created_at timestamptz default now()
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select string_to_array(name, '/')
$$;
grant usage on schema auth, storage to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema storage to authenticated;
grant select on all tables in schema storage to anon;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
grant usage on schema public, extensions to anon, authenticated, service_role;
`;

export async function createDb(): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { pg_trgm } });
  await db.exec('create schema if not exists extensions;');
  await db.exec(BOOTSTRAP);
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'));
    } catch (e) {
      throw new Error(`Migration ${f} failed: ${(e as Error).message}`, { cause: e });
    }
  }
  await db.exec("grant usage on schema extensions to anon, authenticated; grant execute on all functions in schema extensions to anon, authenticated;");
  return db;
}

export type Session = { sub: string | null; role?: 'authenticated' | 'anon' | 'service_role' };

/** Run a callback as a given user (RLS enforced). Each call is its own transaction-scoped session. */
export async function as<T>(db: PGlite, who: Session | string | null, fn: (q: Q) => Promise<T>): Promise<T> {
  const s: Session = typeof who === 'string' ? { sub: who } : who ?? { sub: null, role: 'anon' };
  const role = s.role ?? (s.sub ? 'authenticated' : 'anon');
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [s.sub ?? '']);
    await tx.query(`set local role ${role}`);
    const q: Q = {
      query: async <R = Record<string, unknown>>(sql: string, params?: unknown[]) => (await tx.query<R>(sql, params)).rows,
      one: async <R = Record<string, unknown>>(sql: string, params?: unknown[]) => (await tx.query<R>(sql, params)).rows[0] as R,
    };
    return fn(q);
  });
}

export interface Q {
  query<R = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<R[]>;
  one<R = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<R>;
}

/** Create an auth user (fires the profile trigger) and return its id. */
export async function createUser(db: PGlite, username: string, meta: Record<string, unknown> = {}): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
    [`${username}-${Math.random().toString(36).slice(2, 8)}@example.test`, JSON.stringify({ username, display_name: username, ...meta })],
  );
  return r.rows[0]!.id;
}

export async function grantRole(db: PGlite, userId: string, role: string): Promise<void> {
  await db.query(`insert into public.role_assignments (user_id, role) values ($1, $2)`, [userId, role]);
}

/** Expect a promise to reject; returns the error message. */
export async function rejects(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('Expected the operation to be rejected, but it succeeded');
}
