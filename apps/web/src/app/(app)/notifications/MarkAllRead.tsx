'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui';
import { api } from '@/lib/api';

export function MarkAllRead() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <Button variant="ghost" loading={busy} onClick={async () => { setBusy(true); try { await api().social.markNotificationsRead(); router.refresh(); } finally { setBusy(false); } }}>Mark all read</Button>;
}
