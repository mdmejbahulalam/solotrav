'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Card, Field, Notice, inputClass } from '@/components/ui';
import { getBrowserSupabase } from '@/lib/supabase/client';

export interface DestRow { id: string; slug: string | null; name: string | null; description: string; country: string | null; region: string | null; latitude: number | null; longitude: number | null; category: string | null; is_published: boolean; is_featured: boolean; source: string }

export function DestinationForm({ initial, categories }: { initial: DestRow | null; categories: Array<{ slug: string; label: string }> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const lat = Number(f.get('latitude')); const lng = Number(f.get('longitude'));
    if (!String(f.get('name')).trim()) { setMsg({ tone: 'error', text: 'Name is required.' }); return; }
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) { setMsg({ tone: 'error', text: 'Enter valid coordinates (lat -90..90, lng -180..180).' }); return; }
    const name = String(f.get('name')).trim();
    const slug = initial?.slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Math.random().toString(36).slice(2, 6);
    setBusy(true); setMsg(null);
    const { error } = await getBrowserSupabase().rpc('admin_save_destination', {
      p_data: { id: initial?.id ?? null, slug, name, description: String(f.get('description') ?? ''), country: String(f.get('country') ?? '') || null, region: String(f.get('region') ?? '') || null,
        latitude: lat, longitude: lng, category: String(f.get('category') ?? '') || null, is_published: f.get('is_published') === 'on' },
    });
    setBusy(false);
    if (error) setMsg({ tone: 'error', text: error.code === '42501' ? 'You do not have permission to do that.' : error.message });
    else { setMsg({ tone: 'ok', text: 'Saved.' }); router.replace('/destinations'); router.refresh(); }
  }

  return (
    <Card className="p-4 xl:sticky xl:top-6 xl:self-start">
      <h2 className="mb-3 text-lg font-bold text-navy">{initial ? `Edit ${initial.name}` : 'New curated destination'}</h2>
      {msg && <div className="mb-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
      <form onSubmit={submit}>
        <Field label="Name" htmlFor="name"><input id="name" name="name" defaultValue={initial?.name ?? ''} required maxLength={120} className={inputClass} /></Field>
        <Field label="Description" htmlFor="description"><textarea id="description" name="description" defaultValue={initial?.description ?? ''} rows={3} className={`${inputClass} py-3`} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Region" htmlFor="region"><input id="region" name="region" defaultValue={initial?.region ?? ''} className={inputClass} /></Field><Field label="Country" htmlFor="country"><input id="country" name="country" defaultValue={initial?.country ?? ''} className={inputClass} /></Field></div>
        <div className="grid grid-cols-2 gap-3"><Field label="Latitude" htmlFor="latitude"><input id="latitude" name="latitude" type="number" step="any" defaultValue={initial?.latitude ?? ''} required className={inputClass} /></Field><Field label="Longitude" htmlFor="longitude"><input id="longitude" name="longitude" type="number" step="any" defaultValue={initial?.longitude ?? ''} required className={inputClass} /></Field></div>
        <Field label="Category" htmlFor="category"><select id="category" name="category" defaultValue={initial?.category ?? ''} className={inputClass}><option value="">None</option>{categories.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}</select></Field>
        <label className="mb-4 flex items-center gap-3 text-sm"><input type="checkbox" name="is_published" defaultChecked={initial?.is_published ?? true} className="size-5 accent-primary" /> Published</label>
        <div className="flex gap-2"><Button type="submit" loading={busy}>Save</Button>{initial && <a href="/destinations" className="inline-flex min-h-11 items-center px-3 font-semibold text-primary">Cancel</a>}</div>
      </form>
    </Card>
  );
}
