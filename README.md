# SoloTrav (platform)

Travel social network: plan trips, optionally record journeys with GPS, complete destinations, share stories.
Monorepo with a **web app**, an **admin dashboard**, an **Android app** and a **Supabase** backend (PostgreSQL + Auth + Storage + RLS).

> This folder is the production-oriented rebuild. The older PHP prototype in the parent folder is untouched and independent.

## What is in here

| Path | What |
|---|---|
| `apps/web` | Next.js 16 (App Router, Tailwind 4): landing, auth, feed, explore, trips, planner, posts, profiles, saved, messages, notifications, settings |
| `apps/admin` | Separate Next.js app for staff: users, posts, comments, trips, destinations, reports/moderation, hashtags, featured, analytics, roles, settings, audit log |
| `apps/mobile` | Expo / React Native (Android): auth, 5-tab nav, feed, explore, trips, wizard, **GPS tracking**, check-in, posts + uploads, messages |
| `packages/shared-types` | Domain types mirroring the database enums |
| `packages/validation` | zod schemas, upload validation, storage-path builder |
| `packages/business-logic` | Distance/stats, tracking state machine, sync queue, trip progress, visibility rules, polyline/route preview, pagination |
| `packages/api-client` | Typed Supabase access used by all three apps |
| `packages/ui-tokens` | Brand tokens (light/dark, map colours) |
| `supabase/migrations` | 13 versioned SQL migrations (schema, RLS, functions, storage policies) |
| `supabase/tests` | 100+ database security/behaviour tests run on an in-process Postgres (no Docker) |
| `docs/` | Setup, security, tracking, Android, deployment, limitations |

## Quick start

```bash
npm install
cp .env.example apps/web/.env.local      # then fill in values (see docs/SETUP.md)
npm test            # unit + database security tests (no external services needed)
npm run lint && npm run typecheck
npm run web         # http://localhost:3000   (shows "not configured" notices until Supabase is set)
npm run admin       # http://localhost:3001
```

Full setup (Supabase project, Google OAuth, Google Maps keys, Android build): **[docs/SETUP.md](docs/SETUP.md)**.

## Verification status (be skeptical, here is what has actually been run)

| Check | Status |
|---|---|
| `npm test` | **passing**: unit tests + database tests (RLS, GPS sync, moderation, privacy, offline journeys, two end-to-end flows) |
| `npm run lint`, `npm run typecheck` | passing for all workspaces (mobile included) |
| `next build` (web, admin) | passing |
| `npm run e2e` (Playwright, installed Chrome) | **passing**: 40 browser smoke tests on desktop and phone viewports (public pages, sign-in guards, admin access, security headers). Authenticated journeys are covered at the data layer |
| Android JS bundle (`expo export`) | passing (Hermes bytecode produced) |
| **Android APK** | debug APK **built** (arm64 + x86_64) and **run on the Android emulator** against the live Supabase project: login, sign-up, email confirmation and Explore verified by hand; trips, tracking and posting not yet verified; not release-signed; see [docs/ANDROID.md](docs/ANDROID.md) |
| Live Supabase project | all 13 migrations applied to a hosted project; anonymous-access checks and the Supabase security advisor reviewed; sign-up and login verified from the emulator. Other authenticated flows, storage uploads and Realtime are **not yet exercised** live |
| Google Maps / Places / Routes | integration code written; **not exercised** (no keys); clear "not configured" states are shown instead |
| Google sign-in, push, email | wired but need provider configuration; not exercised |
| Real-device GPS | not exercised; logic is tested with mocked coordinates |

See [docs/LIMITATIONS.md](docs/LIMITATIONS.md) for the complete honest list.

## Principles

1. Privacy by default: raw GPS is private to its owner; public pages only show a coarse route preview the owner publishes; posts never store coordinates.
2. The database is the security boundary (RLS + permission-checked functions), not the UI.
3. Location is optional and requested only when used; completing a destination never requires GPS.
4. No fake data presented as real: demo content is labelled; missing configuration produces explicit notices.
