# GPS journey tracking

## Consent and scope
- Nothing collects location until the user presses **Start** on the tracking screen and grants permission. Permission is requested at that moment.
- Only **foreground** location permission is requested. Recording with the screen off uses an Android **foreground service** with a visible notification ("SoloTrav is recording your journey"). `ACCESS_BACKGROUND_LOCATION` is deliberately not declared.
- Stop (with confirmation), **Tracking off** (immediate), and revoking permission all end collection. Location updates are stopped before any database write on stop.
- We do not claim recording after the app is force-stopped, the OS kills it, the device reboots, or permission is revoked. On the next launch `reconcileOnLaunch()` marks such a journey **paused** (never "recording") so the user can resume or stop it. Points already saved are kept.

## State machine (`packages/business-logic/tracking-machine.ts`)
`idle → requesting_permission → acquiring_location → recording ⇄ paused → stopping → stopped → syncing → idle`, with `syncing → sync_error → syncing`. Permission denial returns to `idle` (the app stays fully usable). Location is collected only in `recording` / `acquiring_location`.

## On-device persistence (`apps/mobile/src/tracking/store.ts`)
SQLite is the source of truth: `sessions` and `points` (sequence numbers allocated in an exclusive transaction, strictly increasing, never reused). The background task (`task.ts`) writes samples only while the session is active; invalid, future-dated, `(0,0)` and duplicate samples are rejected before storage.

## Sync (`sync.ts`)
Batches of ≤500 points go to `sync_journey_points`, which is idempotent on `(journey_id, sequence_number)`: retries after timeouts return `duplicates`, never double points. A failed batch stops the run, leaves all unsent points pending and retries with exponential backoff (capped at 5 min) and on connectivity change. Offline journeys keep their real start/end/paused times through `start_journey(..., p_started_at)` and `finish_journey(...)` (bounded: not future, not older than 7 days).

## Distance (documented, approximate)
Haversine great-circle on a 6,371,008.8 m sphere. Filters (identical in TypeScript and SQL, with a parity test): ignore samples with accuracy > 50 m; ignore non-increasing timestamps; ignore movement below `max(5 m, accuracy/2)` relative to the last accepted point; ignore implied speeds > 70 m/s. Not survey-grade; the UI says "approximate".

## Destination completion
Always possible manually. "Check my distance" (optional) uses one position fix to compute a distance; `near` (≤150 m with acceptable accuracy) enables **GPS-assisted** completion. It is stored as `completion_method = 'gps_assisted'` with the distance in metres only (no coordinates). Proximity is a hint, not proof of a visit.

## Retention
`purge_expired_journey_points(days)` (default 365, configurable in `feature_settings`) deletes raw points of stopped journeys. Schedule it (see DEPLOYMENT.md). Users can delete journeys at any time and export their data.

## Web
The browser is not a reliable background tracker, so the web app does not record routes. It can use browser geolocation once on request ("places near me", "check my distance").
