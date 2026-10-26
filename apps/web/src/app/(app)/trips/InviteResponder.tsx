'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Notice } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

export function InviteResponder({ tripId, title, role }: { tripId: string; title: string; role: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | 'accept' | 'decline'>(null);
  const [error, setError] = useState<string | null>(null);
  async function respond(accept: boolean) {
    setBusy(accept ? 'accept' : 'decline'); setError(null);
    try { await api().trips.respondToInvite(tripId, accept); router.refresh(); } catch (e) { setError(errorMessage(e)); setBusy(null); }
  }
  return (
    <div className="mb-3">
      <Notice>
        <div className="flex flex-wrap items-center gap-3"><span className="flex-1">You&apos;re invited to collaborate on <b>{title}</b> as {role}.</span>
          <Button className="min-h-9" loading={busy === 'accept'} onClick={() => respond(true)}>Accept</Button>
          <Button className="min-h-9" variant="ghost" loading={busy === 'decline'} onClick={() => respond(false)}>Decline</Button></div>
        {error && <p className="mt-2 text-bad">{error}</p>}
      </Notice>
    </div>
  );
}
