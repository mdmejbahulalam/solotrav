import * as SecureStore from 'expo-secure-store';

const KEY = 'solotrav.welcome.seen';

/** The intro carousel is shown once per install. A storage failure just means it may show again; it never blocks sign-in. */
export async function hasSeenWelcome(): Promise<boolean> {
  try { return (await SecureStore.getItemAsync(KEY)) === '1'; } catch { return true; }
}
export async function markWelcomeSeen(): Promise<void> {
  try { await SecureStore.setItemAsync(KEY, '1'); } catch { /* ignore */ }
}
