import { H2, StaticPage } from '@/components/StaticPage';

export const metadata = { title: 'Privacy policy' };

export default function Privacy() {
  return (
    <StaticPage title="Privacy policy" updated="template — replace with counsel-reviewed text before launch">
      <p className="rounded-xl bg-warn/15 p-3 text-sm">This is a working template that reflects how the product is built. It is not legal advice and must be reviewed by qualified counsel for your jurisdictions (e.g. GDPR, CCPA, local law) before public launch.</p>
      <H2>Data we collect</H2>
      <ul className="list-disc space-y-1 pl-6"><li>Account data: email, username, display name, optional bio, region and avatar.</li><li>Content you create: trips, posts, comments, journal entries, messages and uploaded media.</li><li>Location: only when you start tracking in the mobile app (route points) or use a location feature. Raw route points are private to you.</li><li>Aggregate product analytics events that never contain coordinates or free text.</li></ul>
      <H2>Location</H2>
      <p>We request location only when you use a feature that needs it. You can stop at any time; stopping or revoking permission ends collection. Raw location data is retained for a configurable period (default 365 days after a journey ends) and then purged. You can delete journeys at any time.</p>
      <H2>Who can see what</H2>
      <p>Visibility is controlled per trip and post (public, followers, private). Private accounts require follow approval. Staff cannot read private trips, journals or raw location history; any exceptional access requires a recorded justification and is audited.</p>
      <H2>Your rights</H2>
      <p>You can export your data and request deletion in Settings → Account. Deletion hides your content immediately and permanently removes it after a grace period.</p>
      <H2>Third parties</H2>
      <p>Maps and place search use Google Maps Platform. Authentication, database and file storage run on Supabase. Google sign-in is optional.</p>
    </StaticPage>
  );
}
