export interface Cursor {
  /** ISO timestamp of the last item */
  t: string;
  /** id of the last item (tie-breaker) */
  id: string;
}

const toB64 = (s: string) =>
  typeof Buffer !== 'undefined' ? Buffer.from(s, 'utf8').toString('base64url') : btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64 = (s: string) =>
  typeof Buffer !== 'undefined' ? Buffer.from(s, 'base64url').toString('utf8') : atob(s.replace(/-/g, '+').replace(/_/g, '/'));

export function encodeCursor(c: Cursor): string {
  return toB64(JSON.stringify(c));
}

/** Returns null for anything that is not a well-formed cursor (never throws on user input). */
export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(fromB64(raw)) as Partial<Cursor>;
    if (typeof v.t !== 'string' || typeof v.id !== 'string') return null;
    if (Number.isNaN(Date.parse(v.t))) return null;
    if (!/^[0-9a-f-]{36}$/i.test(v.id)) return null;
    return { t: v.t, id: v.id };
  } catch {
    return null;
  }
}

export function clampLimit(limit: number | undefined, def = 20, max = 50): number {
  if (!Number.isFinite(limit) || (limit as number) < 1) return def;
  return Math.min(Math.floor(limit as number), max);
}

/** Given limit+1 fetched rows, returns the page and the cursor for the next one. */
export function pageOf<T extends { created_at: string; id: string }>(rows: readonly T[], limit: number): { items: T[]; nextCursor: string | null } {
  const items = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  const last = items[items.length - 1];
  return { items, nextCursor: hasMore && last ? encodeCursor({ t: last.created_at, id: last.id }) : null };
}
