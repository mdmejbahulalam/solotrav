# Security and privacy model

## Boundaries
- **Database = authority.** Row Level Security is enabled on every public table (a test fails if any table lacks it). Clients use only the anon key + the user's JWT. The service-role key is not used by any app.
- **Staff actions are database functions** (`admin_*`) that check `has_permission(...)`, require a written reason where it matters, and write `audit_logs`. The admin UI hiding a button is convenience, not security.
- Roles live in `role_assignments` / `role_permissions`; clients cannot write them. Only `roles.manage` (super administrator) can grant/revoke, audited.

## Who can read what
| Data | Readable by |
|---|---|
| Profile | public accounts: anyone; private accounts: accepted followers (+ minimal card for follow requests); never blocked users |
| Posts, comments, reactions | by post visibility **and** the author's account visibility; blocks hide both ways |
| Trips and stops | owner and accepted members; others only when published (`planned/active/completed`) and visible |
| Draft trips | owner and members only |
| Journey points (raw GPS) | the recorder only; collaborators only if `share_with_collaborators` was turned on for that journey |
| Public route preview | a deliberately published, simplified, start/end-trimmed polyline (`trip_route_previews`) |
| Journal | the author; opt-in sharing per entry |
| Messages | conversation members |
| Notifications | the recipient; rows are created only by server-side triggers; no coordinates or message text stored |
| Reports / moderation / audit | staff with the matching permission |
| Private storage objects | owner, or anyone allowed to view the post/message that references them |

Staff **cannot** read private trips, journals, messages or raw routes. Exceptional access to a route requires `sensitive.location.read` (super administrator), a 20+ character justification, and creates an audit record (`staff_read_journey_points`).

## Hardening in place
- Idempotent GPS sync (unique `(journey, seq)`), batch size cap (500), time-window checks (no points before the session or >1 min after stop, none from the future, 7-day late-sync limit), coordinate/accuracy constraints, replay-safe.
- Database rate limits (`rate_limit_events`): posts, comments, messages, reports, follows, place lookups. Login throttling is Supabase Auth's.
- Upload validation on the client (type, extension, size) **and** bucket-level mime/size limits; generated paths `<uid>/<uuid>.<ext>` enforced by RLS and a trigger; private buckets + signed URLs.
- Web: CSP, HSTS, X-Frame-Options, nosniff, referrer policy, `Cache-Control: private, no-store` on authenticated responses, open-redirect-safe `next=` handling, no `dangerouslySetInnerHTML` on user content (captions render as text with hashtag links).
- Public pages and `<head>` metadata come from an **anonymous** Supabase client, so private data cannot leak into SSR output or caches.
- Analytics: allow-listed event names and property keys only; never coordinates, names or free text.

## Known limitations / follow-ups
- CSP uses `'unsafe-inline'` for scripts (Next without nonces). Move to nonce-based CSP for a stricter policy.
- Auth tokens on Android are stored in app-private SQLite (not encrypted at rest). Consider encrypted storage with a Keystore-backed key for high-risk deployments.
- No malware scanning of uploads; consider a storage webhook + scanner.
- `delete from auth.users` in `finalize_account_deletions()` needs a privileged DB role; alternatively run deletion via the Admin API in an Edge Function.
- Rate limiting for unauthenticated endpoints (signup/OTP) relies on Supabase Auth settings plus your CDN/WAF.
- The Postgres tests run on PGlite, not on Supabase's exact stack; re-run them against a Supabase branch before launch.
