import Storage from 'expo-sqlite/kv-store';
import { createSolotravClient, ApiError, type Db } from '@solotrav/api-client';

export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
export const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let client: Db | undefined;

/**
 * Supabase client with a persistent session in app-private storage.
 * (expo-sqlite kv-store has no 2 KB limit like SecureStore, so full sessions fit.)
 */
export function getDb(): Db {
  if (!client) {
    client = createSolotravClient({
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
      auth: { storage: Storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  }
  return client;
}

export { ApiError };
