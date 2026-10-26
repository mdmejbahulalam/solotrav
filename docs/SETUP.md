# Setup

## Prerequisites
Node 20.19+ (tested on 24), npm 10+. For local Supabase: Docker + Supabase CLI. For Android builds: JDK 17+, Android SDK (see ANDROID.md).

## 1. Supabase
You can use a hosted project (recommended to start) or `supabase start` locally.

```bash
npm i -g supabase            # or use npx supabase
supabase login
supabase link --project-ref <your-ref>
supabase db push             # applies supabase/migrations/*.sql in order
# optional demo destinations (NOT for production):
psql "$DATABASE_URL" -f supabase/seed.sql
```

Then in the dashboard:
- **Auth → URL configuration**: Site URL = your web URL; add redirect URLs: `https://<web>/auth/callback`, `solotrav://` (mobile), and `http://localhost:3000/auth/callback` for dev.
- **Auth → Providers → Google**: create OAuth clients in Google Cloud (Web client for web; the same web client is used for the mobile browser flow). Paste client ID/secret. Nothing is pre-filled: sign-in with Google does not work until you do this.
- **Auth → Email**: keep "Confirm email" on. Configure SMTP for production (the default sender is rate-limited).
- **Realtime**: the migration adds `messages` and `notifications` to the `supabase_realtime` publication.
- **Storage**: buckets and policies are created by migration `…0900`. `avatars` and `covers` are public by design; `post-media`, `message-media`, `journal-attachments` are private and served with signed URLs.
- **Create your first super administrator** (SQL editor, once, as postgres):
  ```sql
  insert into public.role_assignments (user_id, role) select id, 'super_administrator' from public.profiles where username = 'your_username';
  ```
  Everyone else is granted roles from the admin app (Roles & permissions), which audits it.

## 2. Environment variables
See `.env.example`. Public values may be exposed to clients; the **service-role key is never used by the apps** and must not be placed in any `NEXT_PUBLIC_` / `EXPO_PUBLIC_` variable. The Supabase anon key is safe in clients because RLS protects the data.

| Variable | Used by | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web, admin | |
| `NEXT_PUBLIC_GOOGLE_MAPS_WEB_KEY` | web | Restrict by HTTP referrer; enable Maps JavaScript API + Places API (New) |
| `GOOGLE_MAPS_SERVER_KEY` | web server route | Routes API only; restrict by API; never prefix with `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_GOOGLE_MAP_ID` | web | Optional vector map ID (defaults to a demo ID) |
| `NEXT_PUBLIC_SITE_URL` | web | Canonical URL for redirects/metadata |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | mobile | |
| `GOOGLE_MAPS_ANDROID_KEY` | mobile build | Maps SDK for Android; restrict by package `com.solotrav.app` + signing SHA-1 |
| `ANDROID_APPLICATION_ID` | mobile build | default `com.solotrav.app` |

Put web values in `apps/web/.env.local`, admin in `apps/admin/.env.local`, mobile in your shell/EAS secrets at build time.

## 3. Google Maps Platform
Enable: Maps JavaScript API, Places API (New), Routes API (server key), Maps SDK for Android. Create **three separate keys** (web / server / Android) with the restrictions above, set quotas and billing alerts, and review the current Maps Platform terms before enabling caching. Notes:
- Only the **Place ID** is stored permanently. Name/coordinates fetched from Places are cached for 30 days (`destinations.cache_expires_at`) and blanked by `expire_google_place_cache()` (schedule it daily, see DEPLOYMENT.md); the apps re-fetch via Place ID.
- Google's logo/attribution is rendered by the maps themselves and must not be hidden.
- Without keys the web falls back to searching SoloTrav's curated destinations and shows an actionable configuration notice instead of a map.

## 4. Run
```bash
npm run web      # :3000
npm run admin    # :3001
npm run mobile   # Expo dev client (needs a dev build, Expo Go is not supported for background location)
```

## 5. Tests
```bash
npm test                 # everything
npm run test:unit        # packages
npm run test:db          # RLS / functions on in-process Postgres
```
