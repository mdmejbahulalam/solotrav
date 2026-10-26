import { requireStaff } from '@/lib/supabase/server';
import { SettingRow } from './SettingRow';

export const metadata = { title: 'Platform settings' };

export default async function SettingsPage() {
  const { db } = await requireStaff('settings.manage');
  const { data } = await db.from('feature_settings').select('key,value,description,updated_at').order('key');
  return (
    <div>
      <h1 className="mb-1 text-2xl font-extrabold text-navy">Platform settings</h1>
      <p className="mb-4 text-sm text-muted">Retention windows and upload limits. Changes need a reason and are written to the audit log. Retention is enforced by scheduled maintenance jobs (see docs/DEPLOYMENT.md).</p>
      <ul className="space-y-3">{(data ?? []).map((s) => <li key={s.key}><SettingRow k={s.key} value={s.value} description={s.description} updatedAt={s.updated_at} /></li>)}</ul>
    </div>
  );
}
