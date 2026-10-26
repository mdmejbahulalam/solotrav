import Link from 'next/link';
import { AuthShell } from '@/components/AuthShell';
import { ConfigNotice } from '@/components/ui';
import { supabaseConfigured } from '@/lib/env';
import { LoginForm } from './LoginForm';

export const metadata = { title: 'Log in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <AuthShell title="Welcome back" subtitle="Log in to continue your journey.">
      {!supabaseConfigured && <div className="mb-4"><ConfigNotice what="Supabase" vars={['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']} /></div>}
      <LoginForm next={sp.next} authError={sp.error} />
      <p className="mt-6 text-center text-sm">New to SoloTrav? <Link className="font-bold text-primary" href="/signup">Create an account</Link></p>
    </AuthShell>
  );
}
