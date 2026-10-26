'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';

export function UnsaveButton({ type, id }: { type: 'destination' | 'trip' | 'post'; id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" disabled={busy} aria-label="Remove from saved" className="min-h-11 rounded-xl px-3 text-primary hover:bg-primary-soft disabled:opacity-50" onClick={async () => { setBusy(true); try { await api().saved.unsave(type, id); router.refresh(); } finally { setBusy(false); } }}>★</button>
  );
}
