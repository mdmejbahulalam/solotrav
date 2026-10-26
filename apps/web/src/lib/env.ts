/** Public configuration. Missing values produce explicit "not configured" UI, never silent failures. */
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  googleMapsKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_WEB_KEY,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
};

export const supabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
export const mapsConfigured = Boolean(env.googleMapsKey);
