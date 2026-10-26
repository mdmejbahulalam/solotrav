'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Notice, Pill } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { buildRoutePreview, formatDistance, formatDuration } from '@solotrav/business-logic';

export interface JourneyRow { id: string; status: string; started_at: string; distance_meters: number; duration_seconds: number; share_with_collaborators: boolean }

/**
 * Recorded journeys (private). The owner may deliberately publish a simplified, trimmed route PREVIEW
 * for the public trip page; the raw GPS points are never exposed.
 */
export function JourneyPanel({ tripId, journeys, hasPreview, isOwner }: { tripId: string; journeys: JourneyRow[]; hasPreview: boolean; isOwner: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  async function publish(j: JourneyRow) {
    setBusy(j.id); setMsg(null);
    try {
      const a = api();
      const pts = await a.journeys.points(j.id);
      if (pts.length < 5) throw new Error('This journey has too few GPS points to build a route preview.');
      const encoded = buildRoutePreview(pts.map((p) => [p.latitude, p.longitude]));
      await a.trips.publishRoutePreview(tripId, encoded, j.distance_meters);
      setMsg({ tone: 'ok', text: 'A simplified route preview is now visible on the public trip page. Start and end are trimmed and coordinates are rounded.' });
      router.refresh();
    } catch (e) { setMsg({ tone: 'error', text: errorMessage(e) }); } finally { setBusy(null); }
  }
  async function unpublish() {
    setBusy('un'); setMsg(null);
    try { await api().trips.unpublishRoutePreview(tripId); router.refresh(); } catch (e) { setMsg({ tone: 'error', text: errorMessage(e) }); } finally { setBusy(null); }
  }
  async function share(j: JourneyRow, on: boolean) {
    setBusy(j.id); setMsg(null);
    try { await api().journeys.setSharing(j.id, on); router.refresh(); } catch (e) { setMsg({ tone: 'error', text: errorMessage(e) }); } finally { setBusy(null); }
  }

  if (!journeys.length) return <p className="rounded-xl bg-bg p-4 text-sm text-muted">No recorded journeys yet. GPS tracking is done in the SoloTrav Android app; recorded routes appear here, visible only to you.</p>;
  return (
    <div className="space-y-3">
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {journeys.map((j) => (
        <div key={j.id} className="rounded-xl border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center gap-2"><b>{new Date(j.started_at).toLocaleDateString()}</b><Pill tone={j.status === 'stopped' ? 'ok' : 'coral'}>{j.status}</Pill>
            <span className="text-sm text-muted">{formatDistance(j.distance_meters)} · {formatDuration(j.duration_seconds)} active</span></div>
          <p className="mt-1 text-xs text-muted">Distance is approximate (GPS accuracy varies).</p>
          {isOwner && j.status === 'stopped' && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" className="min-h-9 text-sm" loading={busy === j.id} onClick={() => publish(j)}>Publish route preview</Button>
              <Button variant="ghost" className="min-h-9 text-sm" onClick={() => share(j, !j.share_with_collaborators)}>{j.share_with_collaborators ? 'Stop sharing with collaborators' : 'Share with collaborators'}</Button>
            </div>
          )}
        </div>
      ))}
      {isOwner && hasPreview && <Button variant="ghost" className="min-h-9 text-sm" loading={busy === 'un'} onClick={unpublish}>Remove public route preview</Button>}
    </div>
  );
}
