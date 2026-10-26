import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/Logo';

/** Centered auth card on the app background (design "Screen 3": logo, 28/800 title, subtitle, form). */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main id="main" className="flex min-h-screen flex-col items-center bg-bg px-4 py-10 sm:justify-center">
      <div className="w-full max-w-[440px] rounded-3xl border border-line bg-surface p-6 shadow-[0_4px_16px_rgba(16,42,67,.08)] sm:p-8">
        <Link href="/" aria-label="SoloTrav home" className="inline-block"><Logo size={48} /></Link>
        <h1 className="mt-4 text-[28px] leading-[34px] font-extrabold text-navy">{title}</h1>
        {subtitle && <p className="mt-1 mb-6 text-[15px] text-muted">{subtitle}</p>}
        {!subtitle && <div className="mb-6" />}
        {children}
      </div>
    </main>
  );
}
