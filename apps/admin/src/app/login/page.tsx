import { LoginForm } from './LoginForm';
import { ConfigNotice } from '@/components/ui';
import { configured } from '@/lib/supabase/server';
import { Logo } from '@/components/Logo';

export const metadata = { title: 'Staff sign-in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-fill px-4 py-10">
      <div className="w-full max-w-[400px] rounded-3xl border border-line bg-surface p-8 shadow-[0_4px_16px_rgba(16,42,67,.08)]">
        <div className="mb-6 flex items-center gap-2.5 text-xl font-extrabold tracking-tight text-navy"><Logo size={36} /> SoloTrav Admin</div>
        {!configured && <div className="mb-4"><ConfigNotice what="Supabase" vars={['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']} /></div>}
        {sp.error === 'not_staff' && <p role="alert" className="mb-4 rounded-2xl bg-[#fde8e2] p-3 text-sm text-bad">This account has no staff role. Ask a super administrator to grant one.</p>}
        <LoginForm />
        <p className="mt-6 text-center text-xs text-muted">Authorised staff only. Access and actions are logged.</p>
      </div>
    </main>
  );
}
