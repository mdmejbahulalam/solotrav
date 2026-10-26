# Deployment

Use separate Supabase projects (and Google keys) for **development, staging, production**. Never point staging at production data. Demo seed data (`supabase/seed.sql`) is for dev/staging only.

## Supabase
1. Create the project; `supabase link`; `supabase db push` (all migrations; they are forward-only).
2. Configure Auth providers/redirects, SMTP, and storage as in SETUP.md. Set the first super administrator.
3. **Scheduled jobs** (enable `pg_cron`, or call from an Edge Function on a schedule using the service role):
   ```sql
   select cron.schedule('purge-gps',        '15 3 * * *', $$select public.purge_expired_journey_points((select (value #>> '{}')::int from public.feature_settings where key='journey_points_retention_days'))$$);
   select cron.schedule('purge-analytics',  '30 3 * * *', $$select public.purge_analytics((select (value #>> '{}')::int from public.feature_settings where key='analytics_retention_days'))$$);
   select cron.schedule('expire-place-cache','45 3 * * *', $$select public.expire_google_place_cache()$$);
   select cron.schedule('finalize-deletions','0 4 * * *',  $$select public.finalize_account_deletions()$$);
   ```
   (`finalize_account_deletions` deletes from `auth.users`; if your hosted role lacks the privilege, run it through an Edge Function with the Admin API.)
4. Backups: enable daily backups / PITR on the hosted plan; test a restore into staging quarterly. Storage objects are **not** in database backups: replicate the buckets separately if needed. Orphaned uploads (uploaded but never attached to a post) should be swept by a periodic job comparing `storage.objects` with `post_media.storage_path`.

## Web (`apps/web`) and Admin (`apps/admin`)
Deploy as two separate projects (e.g. Vercel/any Node host):
- Root directory `apps/web` / `apps/admin`, install at the repo root (`npm ci`), build `npm run build -w @solotrav/web`.
- Set the env vars from SETUP.md. Put the admin app on a separate hostname behind SSO/IP allow-listing if possible; it sends `X-Robots-Tag: noindex` and `Cache-Control: no-store`.
- Add the production URLs to Supabase redirect allow-list and to the Google web OAuth client; restrict the Maps web key to the production referrers.

## Android
See ANDROID.md. Distribute via Play (AAB) or direct APK. Ship the Maps key restricted to the release SHA-1.

## Push notifications
Notification rows are created server-side. Delivering push needs: Expo push (or FCM) credentials, the app registering tokens into `push_tokens` (API exists: `social.registerPushToken`), and a small Edge Function triggered by new `notifications` rows that sends a payload containing **only** type/entity ids (never coordinates or message text). This sender is not implemented yet.

## Go-live checklist
- [ ] `npm test`, lint, typecheck green in CI
- [ ] Migrations applied to staging and the tests re-run against a Supabase branch
- [ ] Privacy policy / terms replaced with counsel-reviewed text
- [ ] Billing alerts + quotas on Google keys; keys restricted
- [ ] Super administrator created; staff roles reviewed
- [ ] Cron jobs scheduled; backups verified
- [ ] Sample data not present in production
