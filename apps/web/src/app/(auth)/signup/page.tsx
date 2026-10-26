import Link from 'next/link';
import { AuthShell } from '@/components/AuthShell';
import { ConfigNotice } from '@/components/ui';
import { supabaseConfigured } from '@/lib/env';
import { SignupForm } from './SignupForm';

export const metadata = { title: 'Sign up' };

export default function SignupPage() {
  return (
    <AuthShell title="Create your account" subtitle="Explore more. Share your journey.">
      {!supabaseConfigured && <div className="mb-4"><ConfigNotice what="Supabase" vars={['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']} /></div>}
      <SignupForm />
      <p className="mt-6 text-center text-sm">Already have an account? <Link className="font-bold text-primary" href="/login">Log in</Link></p>
    </AuthShell>
  );
}
