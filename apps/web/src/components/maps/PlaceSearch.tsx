'use client';

import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import { useEffect, useRef, useState } from 'react';
import { Notice } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { env, mapsConfigured } from '@/lib/env';

export interface PickedPlace { destinationId: string; name: string; region?: string | null; lat?: number | null; lng?: number | null }

type Suggestion = { key: string; main: string; secondary: string; pick: () => Promise<PickedPlace> };

/**
 * Destination search.
 *  - With a Google Maps key: Places API (New) autocomplete. A picked place is persisted through ensure_destination,
 *    which stores the Place ID (permanent) plus a 30-day cache of name/coordinates, per Google's terms.
 *  - Without a key: searches SoloTrav's own curated destinations and says so clearly.
 */
export function PlaceSearch({ onPick, label = 'Search destinations' }: { onPick: (p: PickedPlace) => void; label?: string }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const token = useRef<unknown>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (mapsConfigured) setOptions({ key: env.googleMapsKey as string, v: 'weekly' });
  }, []);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) { setItems([]); return; }
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setBusy(true); setError(null);
      try {
        let found: Suggestion[];
        if (mapsConfigured) {
          const places = (await importLibrary('places')) as google.maps.PlacesLibrary;
          token.current ??= new places.AutocompleteSessionToken();
          const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input: query, sessionToken: token.current as google.maps.places.AutocompleteSessionToken });
          found = suggestions.flatMap((s) => s.placePrediction ? [s.placePrediction] : []).slice(0, 6).map((pp) => ({
            key: pp.placeId,
            main: pp.mainText?.text ?? pp.text.text,
            secondary: pp.secondaryText?.text ?? '',
            pick: async () => {
              const place = pp.toPlace();
              await place.fetchFields({ fields: ['displayName', 'location', 'addressComponents'] });
              token.current = null; // session ends after a selection (billing/session semantics)
              const loc = place.location;
              if (!loc) throw new Error('This place has no location.');
              const comp = (type: string) => place.addressComponents?.find((c) => c.types.includes(type))?.longText ?? undefined;
              const name = place.displayName ?? pp.text.text;
              const destinationId = await api().destinations.ensureFromPlace({ placeId: pp.placeId, name, lat: loc.lat(), lng: loc.lng(), country: comp('country'), region: comp('administrative_area_level_1') });
              return { destinationId, name, region: comp('administrative_area_level_1'), lat: loc.lat(), lng: loc.lng() };
            },
          }));
        } else {
          const rows = await api().destinations.search(query, undefined, 6);
          found = rows.map((d) => ({ key: d.id, main: d.name ?? '', secondary: [d.region, d.country].filter(Boolean).join(', '), pick: async () => ({ destinationId: d.id, name: d.name ?? '', region: d.region, lat: d.latitude, lng: d.longitude }) }));
        }
        if (id === seq.current) { setItems(found); setOpen(true); }
      } catch (e) {
        if (id === seq.current) setError(errorMessage(e));
      } finally {
        if (id === seq.current) setBusy(false);
      }
    }, 250); // debounce
    return () => clearTimeout(t);
  }, [q]);

  async function choose(s: Suggestion) {
    setBusy(true); setError(null);
    try {
      const p = await s.pick();
      onPick(p);
      setQ(''); setItems([]); setOpen(false);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }

  return (
    <div className="relative">
      <label htmlFor="place-search" className="mb-1.5 block text-sm font-semibold">{label}</label>
      <input id="place-search" role="combobox" aria-expanded={open} aria-controls="place-results" aria-autocomplete="list" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => items.length && setOpen(true)}
        placeholder={mapsConfigured ? 'Search places worldwide' : "Search SoloTrav destinations (e.g. Sajek)"} autoComplete="off"
        className="min-h-11 w-full rounded-xl border-[1.5px] border-line bg-surface px-3.5 outline-none focus:border-primary" />
      {!mapsConfigured && <p className="mt-1 text-xs text-muted">Google Places search is not configured, so only SoloTrav&apos;s own destinations are searched.</p>}
      {error && <div className="mt-2"><Notice tone="error">{error}</Notice></div>}
      {open && items.length > 0 && (
        <ul id="place-results" role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-line bg-surface shadow-lg">
          {items.map((s) => (
            <li key={s.key} role="option" aria-selected={false}>
              <button type="button" disabled={busy} onClick={() => choose(s)} className="flex w-full flex-col px-4 py-3 text-left hover:bg-primary-soft focus:bg-primary-soft">
                <b>{s.main}</b><span className="text-sm text-muted">{s.secondary}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && !busy && q.trim().length >= 2 && items.length === 0 && !error && <p className="mt-2 text-sm text-muted">No places found.</p>}
    </div>
  );
}
