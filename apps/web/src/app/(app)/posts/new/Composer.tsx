'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { PlaceSearch, type PickedPlace } from '@/components/maps/PlaceSearch';
import { Button, Field, Notice, inputClass } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { imageSize, removeUploaded, uploadWithProgress, UploadError } from '@/lib/upload';
import { postInputSchema, validateUpload } from '@solotrav/validation';

type Item = {
  id: string; file: File; preview: string; kind: 'image' | 'video'; status: 'ready' | 'uploading' | 'done' | 'error';
  progress: number; error?: string; path?: string; bucket?: string; alt: string; ctrl?: AbortController;
};
type Visibility = 'public' | 'followers' | 'private';

export function Composer({ trips, initialTrip }: { trips: Array<{ id: string; title: string }>; initialTrip: string }) {
  const router = useRouter();
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [tripId, setTripId] = useState(initialTrip);
  const [place, setPlace] = useState<PickedPlace | null>(null);
  const [type, setType] = useState<'auto' | 'tip' | 'checkin'>('auto');
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState<null | 'draft' | 'publish'>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const patch = (id: string, p: Partial<Item>) => setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...p } : i)));

  function pick(files: FileList | null) {
    if (!files) return;
    setError(null);
    const next: Item[] = [];
    for (const f of Array.from(files)) {
      const isVideo = f.type.startsWith('video/');
      const check = validateUpload(f, isVideo ? 'post-video' : 'post-image');
      if (!check.ok) { setError(`${f.name}: ${check.error}`); continue; }
      if (items.length + next.length >= 10) { setError('You can attach up to 10 files.'); break; }
      if (isVideo && (items.some((i) => i.kind === 'video') || next.some((i) => i.kind === 'video'))) { setError('Only one video per post.'); continue; }
      next.push({ id: crypto.randomUUID(), file: f, preview: URL.createObjectURL(f), kind: isVideo ? 'video' : 'image', status: 'ready', progress: 0, alt: '' });
    }
    setItems((cur) => [...cur, ...next]);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function uploadOne(it: Item): Promise<{ path: string; bucket: string }> {
    const ctrl = new AbortController();
    patch(it.id, { status: 'uploading', progress: 0, error: undefined, ctrl });
    try {
      const r = await uploadWithProgress(it.file, it.kind === 'video' ? 'post-video' : 'post-image', { signal: ctrl.signal, onProgress: (p) => patch(it.id, { progress: p }) });
      patch(it.id, { status: 'done', progress: 1, path: r.path, bucket: r.bucket, ctrl: undefined });
      return r;
    } catch (e) {
      patch(it.id, { status: 'error', error: e instanceof UploadError && e.code === 'ABORTED' ? 'Cancelled' : errorMessage(e), ctrl: undefined });
      throw e;
    }
  }

  async function submit(mode: 'draft' | 'publish') {
    setError(null);
    const hasContent = caption.trim() || items.length;
    if (!hasContent) { setError('Add a caption or at least one photo or video.'); return; }
    setBusy(mode);
    const uploaded: Array<{ bucket: string; path: string }> = [];
    try {
      // upload sequentially so progress/retry per file is clear; skip files already uploaded on a previous attempt
      const results = new Map<string, { path: string; bucket: string }>();
      for (const it of items) {
        results.set(it.id, it.status === 'done' && it.path && it.bucket ? { path: it.path, bucket: it.bucket } : await uploadOne(it));
      }
      const media = await Promise.all(items.map(async (i) => {
        const r = results.get(i.id) as { path: string; bucket: string };
        const size = await imageSize(i.file);
        uploaded.push({ bucket: r.bucket, path: r.path });
        return { path: r.path, type: i.kind, width: size?.width, height: size?.height, alt: i.alt };
      }));
      const post_type = type === 'checkin' && place ? 'checkin' : type === 'tip' ? 'tip' : media.some((m) => m.type === 'video') ? 'video' : media.length ? 'image' : 'text';
      postInputSchema.parse({ caption, visibility, post_type, trip_id: tripId || null, destination_id: place?.destinationId ?? null, mediaCount: media.length });
      const post = await api().posts.create({ caption, visibility, post_type, trip_id: tripId || null, destination_id: place?.destinationId ?? null }, media, mode === 'publish');
      if (mode === 'publish') void api().social.track('post_published', { platform: 'web', method: post_type });
      router.push(mode === 'publish' ? `/posts/${post.id}` : '/home');
      router.refresh();
    } catch (e) {
      // keep successfully uploaded files so Retry does not upload them twice; surface the failure
      if (!(e instanceof UploadError)) { await removeUploaded('post-media', uploaded.map((u) => u.path)); setItems((c) => c.map((i) => ({ ...i, status: i.status === 'done' ? 'ready' : i.status, path: undefined }))); }
      setError(e instanceof UploadError && e.code === 'ABORTED' ? 'Upload cancelled.' : errorMessage(e));
    } finally { setBusy(null); }
  }

  function remove(it: Item) {
    it.ctrl?.abort();
    URL.revokeObjectURL(it.preview);
    if (it.path && it.bucket) void removeUploaded(it.bucket, [it.path]);
    setItems((c) => c.filter((i) => i.id !== it.id));
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-2xl font-extrabold text-navy">New post</h1>
      {error && <div className="mb-4" role="alert"><Notice tone="error">{error}</Notice></div>}

      <section className="mb-5">
        <label htmlFor="media" className="mb-1.5 block text-sm font-semibold">Photos &amp; video</label>
        <label htmlFor="media" className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line bg-surface p-5 text-center hover:border-primary">
          <span aria-hidden className="text-2xl">📷</span><b>Add photos or one video</b><span className="text-sm text-muted">Images up to 10 MB · video up to 100 MB · max 10 files</span>
        </label>
        <input ref={fileRef} id="media" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" multiple className="sr-only" onChange={(e) => pick(e.target.files)} />
        {items.length > 0 && (
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {items.map((it) => (
              <li key={it.id} className="overflow-hidden rounded-xl border border-line bg-surface">
                {it.kind === 'video'
                  ? <video src={it.preview} className="h-28 w-full bg-black object-cover" muted />
                  : <img src={it.preview} alt="Selected" className="h-28 w-full object-cover" />}
                <div className="p-2">
                  {it.status === 'uploading' && <div role="progressbar" aria-valuenow={Math.round(it.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${it.file.name}`} className="h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full bg-primary transition-all" style={{ width: `${it.progress * 100}%` }} /></div>}
                  {it.status === 'done' && <p className="text-xs font-semibold text-ok">✓ Uploaded</p>}
                  {it.status === 'error' && <p className="text-xs font-semibold text-bad">{it.error}</p>}
                  {it.kind === 'image' && it.status !== 'uploading' && <input aria-label="Alt text" placeholder="Describe the photo" maxLength={300} value={it.alt} onChange={(e) => patch(it.id, { alt: e.target.value })} className="mt-1 w-full rounded-lg border border-line bg-bg px-2 py-1 text-xs" />}
                  <div className="mt-1 flex justify-between text-xs font-semibold">
                    {it.status === 'uploading' ? <button type="button" className="text-bad" onClick={() => it.ctrl?.abort()}>Cancel</button> : it.status === 'error' ? <button type="button" className="text-primary" onClick={() => uploadOne(it).catch(() => undefined)}>Retry</button> : <span />}
                    <button type="button" className="text-muted" onClick={() => remove(it)} aria-label={`Remove ${it.file.name}`}>Remove</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Field label="Caption" htmlFor="cap" hint="Use #hashtags to help people find it."><textarea id="cap" value={caption} onChange={(e) => setCaption(e.target.value)} rows={4} maxLength={2000} className={`${inputClass} py-3`} /></Field>

      <fieldset className="mb-4"><legend className="mb-1.5 text-sm font-semibold">Type</legend>
        <div className="flex flex-wrap gap-2">{([['auto', 'Post'], ['tip', 'Travel tip'], ['checkin', 'Destination check-in']] as const).map(([v, l]) => (
          <label key={v} className={`cursor-pointer rounded-full border-[1.5px] px-4 py-2 text-sm font-semibold ${type === v ? 'border-primary bg-primary text-white' : 'border-line bg-surface'}`}><input type="radio" className="sr-only" name="type" checked={type === v} onChange={() => setType(v)} />{l}</label>))}</div>
        {type === 'checkin' && !place && <p className="mt-1 text-sm text-muted">Pick a location tag below to publish a check-in.</p>}
      </fieldset>

      <div className="mb-4">
        {place ? <div className="flex items-center justify-between rounded-xl border border-line bg-surface p-3"><span>📍 <b>{place.name}</b>{place.region ? `, ${place.region}` : ''}</span><button type="button" className="text-sm font-semibold text-primary" onClick={() => setPlace(null)}>Remove</button></div> : <PlaceSearch label="Location tag" onPick={setPlace} />}
      </div>

      <Field label="Attach to a trip (optional)" htmlFor="trip"><select id="trip" value={tripId} onChange={(e) => setTripId(e.target.value)} className={inputClass}><option value="">None</option>{trips.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select></Field>

      <fieldset className="mb-4"><legend className="mb-1.5 text-sm font-semibold">Audience</legend>
        {([['public', 'Public', 'Anyone on or off SoloTrav'], ['followers', 'Followers', 'People who follow you'], ['private', 'Only me', 'Visible only to you']] as const).map(([v, l, d]) => (
          <label key={v} className="mb-2 flex cursor-pointer items-start gap-3 rounded-xl border-[1.5px] border-line p-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft"><input type="radio" name="aud" checked={visibility === v} onChange={() => setVisibility(v)} className="mt-1 size-5 accent-primary" /><span><b>{l}</b> <span className="text-sm text-muted">· {d}</span></span></label>
        ))}
      </fieldset>

      <div className="mb-5 rounded-xl bg-teal-soft p-3 text-sm">🔒 <b>Precise location is not included.</b> A location tag names a place, never your coordinates.</div>

      <div className="flex gap-2"><Button variant="secondary" className="flex-1" loading={busy === 'draft'} disabled={busy !== null} onClick={() => submit('draft')}>Save draft</Button><Button className="flex-1" loading={busy === 'publish'} disabled={busy !== null} onClick={() => submit('publish')}>Publish</Button></div>
    </div>
  );
}
