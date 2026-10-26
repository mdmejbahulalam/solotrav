import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Paths anyone may open. Everything else needs a session. Trip pages: slugs are public, UUID pages are private. */
function isPublic(path: string): boolean {
  if (path === '/' || ['/login', '/signup', '/forgot-password', '/reset-password', '/explore', '/search', '/about', '/help', '/privacy', '/terms'].includes(path)) return true;
  if (path.startsWith('/auth/') || path.startsWith('/destinations/') || path.startsWith('/u/') || (path.startsWith('/posts/') && path !== '/posts/new')) return true;
  const m = /^\/trips\/([^/]+)$/.exec(path);
  if (m && m[1] !== 'new' && !UUID.test(m[1] as string)) return true; // public slug page (data is RLS/visibility filtered)
  return false;
}

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let response = NextResponse.next({ request });
  if (!url || !key) return response; // unconfigured: pages render their own configuration notice

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // getUser() contacts Supabase Auth to validate (and refresh) the session.
  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  if (!data.user && !isPublic(path)) {
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(login);
  }
  if (data.user && (path === '/login' || path === '/signup')) {
    const home = request.nextUrl.clone();
    home.pathname = '/home';
    home.search = '';
    return NextResponse.redirect(home);
  }
  // Authenticated, personalised responses must never be shared-cached.
  if (data.user) response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico|txt|xml)$).*)'],
};
