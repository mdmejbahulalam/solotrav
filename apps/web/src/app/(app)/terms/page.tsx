import { H2, StaticPage } from '@/components/StaticPage';

export const metadata = { title: 'Terms of service' };

export default function Terms() {
  return (
    <StaticPage title="Terms of service" updated="template — replace with counsel-reviewed text before launch">
      <p className="rounded-xl bg-warn/15 p-3 text-sm">This is a working template, not legal advice. Have it reviewed by qualified counsel before launch.</p>
      <H2>Using SoloTrav</H2>
      <ul className="list-disc space-y-1 pl-6"><li>Be respectful. No harassment, hate, spam or illegal content.</li><li>Only post content you have the right to share, and do not share other people&apos;s private location.</li><li>You are responsible for your own safety. Distances, routes and times are estimates and are not navigation or safety advice.</li><li>A destination marked &quot;completed&quot; is self-reported and is not proof or verification of a visit.</li></ul>
      <H2>Moderation</H2>
      <p>We may remove content or suspend accounts that break these terms. Decisions are recorded and can be appealed through support.</p>
      <H2>Accounts</H2>
      <p>You may delete your account at any time from Settings. Some backups may persist for a limited period as described in the privacy policy.</p>
    </StaticPage>
  );
}
