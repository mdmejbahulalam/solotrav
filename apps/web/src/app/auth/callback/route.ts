import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { safeNext } from '@/lib/safe-redirect';

/** OAuth (Google) and email-confirmation redirect target: exchanges the code for a session cookie. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeNext(searchParams.get('next'));
  if (!code) return NextResponse.redirect(`${origin}/login?error=missing_code`);
  try {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  } catch {
    return NextResponse.redirect(`${origin}/login?error=not_configured`);
  }
  return NextResponse.redirect(`${origin}${next}`);
}
