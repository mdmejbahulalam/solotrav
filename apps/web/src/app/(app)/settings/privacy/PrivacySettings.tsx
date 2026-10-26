'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Notice } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

const PREFS: Array<[string, string]> = [['likes', 'Likes'], ['comments', 'Comments and mentions'], ['follows', 'New followers and requests'], ['messages', 'Messages'], ['trip_updates', 'Trip updates']];

export function PrivacySettings({ initial, blocked, requests }: { initial: { visibility: 'public' | 'private'; live: 'off' | 'followers' | 'selected'; prefs: Record<string, boolean> }; blocked: Array<{ id: string; username: string }>; requests: Array<{ id: string; username: string }> }) {
  const router = useRouter();
  const [visibility, setVisibility] = useState(initial.visibility);
  const [live, setLive] = useState(initial.live);
  const [prefs, setPrefs] = useState(initial.prefs);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  async function save() {
    setBusy('save'); setMsg(null);
    try {
      const { error } = await api().db.from('profiles').update({ account_visibility: visibility, live_location_sharing: live, notification_prefs: prefs }).eq('id', (await api().db.auth.getUser()).data.user!.id);
      if (error) throw new Error(error.message);
      setMsg({ tone: 'ok', text: 'Settings saved.' }); router.refresh();
    } catch (e) { setMsg({ tone: 'error', text: errorMessage(e) }); } finally { setBusy(null); }
  }
  async function act(label: string, fn: () => Promise<void>) { setBusy(label); setMsg(null); try { await fn(); router.refresh(); } catch (e) { setMsg({ tone: 'error', text: errorMessage(e) }); } finally { setBusy(null); } }

  return (
    <div className="space-y-6">
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <section><h2 className="mb-2 font-bold text-navy">Account visibility</h2>
        {([['public', 'Public', 'Anyone can find your profile and see your public posts and trips.'], ['private', 'Private', 'People must send a follow request. Only approved followers see your content.']] as const).map(([v, l, d]) => (
          <label key={v} className="mb-2 flex cursor-pointer items-start gap-3 rounded-xl border-[1.5px] border-line p-3.5 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"><input type="radio" checked={visibility === v} onChange={() => setVisibility(v)} className="mt-1 size-5 accent-primary" /><span><b>{l}</b><br /><span className="text-sm text-muted">{d}</span></span></label>))}
      </section>

      <section><h2 className="mb-1 font-bold text-navy">Live location sharing</h2>
        <p className="mb-2 text-sm text-muted">Off by default. Even when allowed, SoloTrav never publishes precise coordinates to feeds, posts or notifications, and nothing is shared unless you start a share yourself.</p>
        {([['off', 'Off (recommended)'], ['followers', 'Followers may be offered a live share'], ['selected', 'Selected people only']] as const).map(([v, l]) => (
          <label key={v} className="mb-2 flex cursor-pointer items-center gap-3 rounded-xl border-[1.5px] border-line p-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"><input type="radio" checked={live === v} onChange={() => setLive(v)} className="size-5 accent-primary" />{l}</label>))}
        <p className="rounded-xl bg-warn/15 p-3 text-sm">Tracking itself runs only in the Android app, only after you press Start. Stopping, or revoking location permission, ends it. SoloTrav cannot track you afterwards.</p>
      </section>

      <section><h2 className="mb-2 font-bold text-navy">Notifications</h2>
        {PREFS.map(([k, l]) => <label key={k} className="flex items-center gap-3 py-2"><input type="checkbox" checked={prefs[k] !== false} onChange={(e) => setPrefs({ ...prefs, [k]: e.target.checked })} className="size-5 accent-primary" />{l}</label>)}
        <p className="text-xs text-muted">Trip invitations are always delivered in-app. Push delivery requires the mobile app with push configured.</p>
      </section>

      <Button loading={busy === 'save'} onClick={save}>Save settings</Button>

      {requests.length > 0 && <section><h2 className="mb-2 font-bold text-navy">Follow requests</h2><ul className="space-y-2">{requests.map((r) => <li key={r.id} className="flex items-center justify-between rounded-xl border border-line bg-surface p-3"><b>@{r.username}</b><span className="flex gap-2"><Button className="min-h-9" loading={busy === `a${r.id}`} onClick={() => act(`a${r.id}`, () => api().profiles.respondToFollowRequest(r.id, true))}>Approve</Button><Button variant="ghost" className="min-h-9" loading={busy === `d${r.id}`} onClick={() => act(`d${r.id}`, () => api().profiles.respondToFollowRequest(r.id, false))}>Decline</Button></span></li>)}</ul></section>}

      <section><h2 className="mb-2 font-bold text-navy">Blocked users</h2>
        {blocked.length === 0 ? <p className="text-sm text-muted">You haven&apos;t blocked anyone.</p> : <ul className="space-y-2">{blocked.map((b) => <li key={b.id} className="flex items-center justify-between rounded-xl border border-line bg-surface p-3"><b>@{b.username}</b><Button variant="secondary" className="min-h-9" loading={busy === `u${b.id}`} onClick={() => act(`u${b.id}`, () => api().profiles.unblock(b.id))}>Unblock</Button></li>)}</ul>}
      </section>
    </div>
  );
}
