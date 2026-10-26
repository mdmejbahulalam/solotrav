'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Avatar, Button, Field, Notice, inputClass } from '@/components/ui';
import { api, errorMessage, fieldErrors } from '@/lib/api';
import { uploadWithProgress } from '@/lib/upload';
import { INTERESTS } from '@solotrav/validation';
import type { Profile } from '@solotrav/shared-types';

export function ProfileSettings({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [interests, setInterests] = useState<string[]>(profile.travel_interests);
  const [avatar, setAvatar] = useState<string | null>(profile.avatar_url);
  const [progress, setProgress] = useState<number | null>(null);
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>(() => (typeof window === 'undefined' ? 'system' : ((localStorage.getItem('st_theme') as 'light' | 'dark' | null) ?? 'system')));

  async function onAvatar(file: File | undefined) {
    if (!file) return;
    setMsg(null); setProgress(0);
    try {
      const { path } = await uploadWithProgress(file, 'avatar', { onProgress: setProgress });
      const url = api().media.publicUrl('avatars', path);
      await api().profiles.update({}); // validates session
      const { error } = await api().db.from('profiles').update({ avatar_url: url }).eq('id', profile.id);
      if (error) throw new Error(error.message);
      setAvatar(url); setMsg({ tone: 'ok', text: 'Profile photo updated.' }); router.refresh();
    } catch (e) { setMsg({ tone: 'error', text: errorMessage(e) }); } finally { setProgress(null); }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setMsg(null); setErrors({});
    try {
      await api().profiles.update({ display_name: String(f.get('display_name')), username: String(f.get('username')), bio: String(f.get('bio')), home_region: String(f.get('home_region')).trim() || null, travel_interests: interests as never });
      setMsg({ tone: 'ok', text: 'Profile saved.' }); router.refresh();
    } catch (err) { const fe = fieldErrors(err); if (Object.keys(fe).length) setErrors(fe); else setMsg({ tone: 'error', text: /duplicate|unique|exists/i.test(errorMessage(err)) ? 'That username is already taken.' : errorMessage(err) }); }
    finally { setBusy(false); }
  }

  function applyTheme(t: 'system' | 'light' | 'dark') {
    setTheme(t);
    try { if (t === 'system') localStorage.removeItem('st_theme'); else localStorage.setItem('st_theme', t); } catch { /* storage unavailable */ }
    if (t === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {msg && <div className="mb-4"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
      <div className="mb-5 flex items-center gap-4"><Avatar name={profile.display_name} src={avatar} size={72} />
        <div><label htmlFor="avatar" className="text-sm font-semibold">Profile photo</label><input id="avatar" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => onAvatar(e.target.files?.[0])} className="block text-sm" />
          {progress !== null && <div role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Uploading photo" className="mt-1 h-1.5 w-40 overflow-hidden rounded-full bg-line"><div className="h-full bg-primary" style={{ width: `${progress * 100}%` }} /></div>}
          <p className="text-xs text-muted">JPG, PNG or WebP up to 5 MB.</p></div></div>
      <Field label="Display name" htmlFor="display_name" error={errors.display_name}><input id="display_name" name="display_name" defaultValue={profile.display_name} maxLength={80} className={inputClass} /></Field>
      <Field label="Username" htmlFor="username" error={errors.username}><input id="username" name="username" defaultValue={profile.username} autoCapitalize="none" className={inputClass} /></Field>
      <Field label="Bio" htmlFor="bio" error={errors.bio}><textarea id="bio" name="bio" defaultValue={profile.bio} maxLength={300} rows={3} className={`${inputClass} py-3`} /></Field>
      <Field label="Home region (optional)" htmlFor="home_region" hint="Shown on your profile. Leave blank to keep it private."><input id="home_region" name="home_region" defaultValue={profile.home_region ?? ''} maxLength={80} className={inputClass} /></Field>
      <fieldset className="mb-5"><legend className="mb-1.5 text-sm font-semibold">Travel interests</legend>
        <div className="flex flex-wrap gap-2">{INTERESTS.map((i) => <button key={i} type="button" aria-pressed={interests.includes(i)} onClick={() => setInterests((c) => c.includes(i) ? c.filter((x) => x !== i) : c.length >= 12 ? c : [...c, i])} className={`rounded-full border-[1.5px] px-3.5 py-2 text-sm font-semibold ${interests.includes(i) ? 'border-primary bg-primary text-white' : 'border-line bg-surface'}`}>{i}</button>)}</div></fieldset>
      <fieldset className="mb-6"><legend className="mb-1.5 text-sm font-semibold">Appearance</legend>
        <div className="flex gap-2">{(['system', 'light', 'dark'] as const).map((t) => <button key={t} type="button" aria-pressed={theme === t} onClick={() => applyTheme(t)} className={`rounded-xl border-[1.5px] px-4 py-2 text-sm font-semibold capitalize ${theme === t ? 'border-primary bg-primary-soft text-primary' : 'border-line bg-surface'}`}>{t}</button>)}</div></fieldset>
      <Button type="submit" loading={busy}>Save profile</Button>
    </form>
  );
}
