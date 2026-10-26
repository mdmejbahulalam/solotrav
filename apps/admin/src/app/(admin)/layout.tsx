import type { ReactNode } from 'react';
import { AdminNav } from '@/components/AdminNav';
import { requireStaff } from '@/lib/supabase/server';
import { SignOut } from './SignOut';

const SECTIONS: Array<{ href: string; label: string; perm: string }> = [
  { href: '/', label: 'Overview', perm: 'analytics.read' },
  { href: '/reports', label: 'Moderation', perm: 'reports.read' },
  { href: '/users', label: 'Users', perm: 'users.read' },
  { href: '/posts', label: 'Posts', perm: 'content.remove' },
  { href: '/comments', label: 'Comments', perm: 'comments.moderate' },
  { href: '/trips', label: 'Trips', perm: 'content.remove' },
  { href: '/destinations', label: 'Destinations', perm: 'destinations.manage' },
  { href: '/hashtags', label: 'Hashtags', perm: 'hashtags.manage' },
  { href: '/featured', label: 'Featured content', perm: 'featured.manage' },
  { href: '/analytics', label: 'Analytics', perm: 'analytics.read' },
  { href: '/roles', label: 'Roles & permissions', perm: 'roles.manage' },
  { href: '/settings', label: 'Settings', perm: 'settings.manage' },
  { href: '/audit', label: 'Audit logs', perm: 'audit.read' },
];

/** Navy sidebar + pale content area, as in the design's admin console. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { staff } = await requireStaff();
  return (
    <div className="min-h-screen bg-fill lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="flex flex-col gap-1.5 bg-[#102a43] p-4 text-white lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:px-4 lg:py-6">
        <div className="px-2 pb-3 text-lg font-extrabold lg:pb-4">SoloTrav Admin</div>
        <AdminNav items={SECTIONS.filter((s) => staff.permissions.includes(s.perm)).map(({ href, label }) => ({ href, label }))} />
        <div className="mt-auto hidden p-2 text-xs leading-[17px] text-[#c9d6e8] lg:block">
          <p>Staff see reported content and account status. They cannot see anyone&apos;s location history.</p>
          <p className="mt-3 truncate font-semibold">{staff.email}</p>
          <p>{staff.permissions.length} permissions</p>
          <SignOut />
        </div>
      </aside>
      <main id="main" className="flex min-w-0 flex-col gap-5 p-5 lg:px-9 lg:py-7">{children}</main>
    </div>
  );
}
