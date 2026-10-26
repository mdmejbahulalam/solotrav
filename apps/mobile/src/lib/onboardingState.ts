import { useSyncExternalStore } from 'react';

/** Whether the signed-in user still has to finish onboarding. `null` = not known yet. A tiny store so the onboarding screen can tell the root layout it is done. */
let needs: boolean | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function setNeedsOnboarding(v: boolean | null) { if (needs !== v) { needs = v; emit(); } }
export function useNeedsOnboarding(): boolean | null {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => needs, () => needs);
}
