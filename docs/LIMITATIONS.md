# Known limitations (honest list)

**Not done / not verified**
- Android debug APK **builds** (see ANDROID.md) but was built with placeholder Supabase values and has **not been run on a device/emulator**. No release-signed APK/AAB yet.
- A hosted Supabase project (`SoloTrav`, ap-southeast-1) now has all 13 migrations and the demo destinations applied, RLS on all 38 tables, and a basic anonymous-access smoke test passed (public destinations readable; profiles, journey points and admin RPCs denied). The authenticated flows (sign-up, email confirmation, trips, GPS sync, storage uploads, Realtime) have **not** yet been exercised against it. Before that, behaviour was validated on PGlite only.
- ~~No live Supabase project was used.~~ (superseded by the line above) Behaviour was validated on PGlite (real Postgres engine, RLS enforced) with emulated `auth`/`storage` schemas. Storage HTTP behaviour, Auth emails, Realtime delivery and PostgREST embedding (`select=*,profile:profiles(...)`) are untested against a real stack.
- **Google Maps/Places/Routes/OAuth** not exercised (no keys). The web map, place autocomplete and route estimate are written to Google's current APIs (`@vis.gl/react-google-maps`, Places API (New), Routes API) but unverified at runtime. Mobile place search uses SoloTrav destinations only (no Places SDK yet).
- **Real-device GPS** not tested; background behaviour depends on OEM battery policies.
- **Push notifications**: token registration API exists; no sender function yet.
- **Web end-to-end browser tests** (Playwright) are not included; the two required journeys are covered as data-layer end-to-end tests (`supabase/tests/e2e-journey.test.ts`). Mobile component/permission-denial tests are not automated (the tracking state machine, sync queue and offline logic are unit tested).
- Direct messaging has text only (no image messages UI, no group chats UI) though the schema supports media and groups.
- Collection management UI is minimal (create, list; filing items into a collection is data-supported but not exposed in every screen).
- Media: no server-side thumbnail generation; videos are limited to 100 MB; no malware scanning; orphan clean-up is a documented job, not shipped.
- Trip collaboration invites are by username; there is no email invite flow.
- Admin analytics are simple daily counts; no charts library.
- `npm audit` reports advisories inside Expo's own CLI tooling (dev-time only, not shipped).
- Privacy policy and terms are templates, not legal text.
- The admin "trips" and "posts" lists intentionally show only public content (privacy by design).

**Design decisions to be aware of**
- Only foreground location permission is requested; recording with the screen off relies on a foreground service.
- Google-derived destination data is cached for 30 days and then blanked; the apps must re-fetch by Place ID.
- A destination marked "completed" is self-reported; GPS-assisted completion is a hint, not verification.
