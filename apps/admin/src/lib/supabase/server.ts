import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { admin as adminApi } from '@solotrav/api-client';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const configured = Boolean(url && key);

export async function createServerSupabase() {
  if (!url || !key) throw new Error('SUPABASE_NOT_CONFIGURED');
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: { getAll: () => store.getAll(), setAll: (list) => { try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* Server Component: proxy refreshes */ } } },
  });
}

export type Staff = { id: string; email: string; permissions: string[] };

/** Returns the signed-in staff member and their database-granted permissions, or redirects to login. */
export async function getStaff(): Promise<Staff | null> {
  if (!configured) return null;
  const db = await createServerSupabase();
  const { data } = await db.auth.getUser();
  if (!data.user) return null;
  const permissions = await adminApi(db).myPermissions();
  return { id: data.user.id, email: data.user.email ?? '', permissions };
}

export async function requireStaff(permission?: string): Promise<{ staff: Staff; db: Awaited<ReturnType<typeof createServerSupabase>> }> {
  const staff = await getStaff();
  if (!staff) redirect('/login');
  if (staff.permissions.length === 0) redirect('/login?error=not_staff');
  if (permission && !staff.permissions.includes(permission)) redirect('/?denied=1');
  return { staff, db: await createServerSupabase() };
}
