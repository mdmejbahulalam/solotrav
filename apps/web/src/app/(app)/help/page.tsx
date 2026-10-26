import { H2, StaticPage } from '@/components/StaticPage';

export const metadata = { title: 'Help center' };

const FAQ: Array<[string, string]> = [
  ['How do I track a journey?', 'Open the SoloTrav Android app, open a trip and press Start. The app asks for location permission at that moment. Recording continues in the background only with the permission and notification you grant, and stops when you press Stop.'],
  ['Does the website track my location?', 'No. The website can use your browser location once, on request, for things like "places near me" or checking your distance at a stop. It does not record routes.'],
  ['Do I need GPS to complete a destination?', 'No. Open the trip, find the stop and choose "Complete manually". GPS confirmation is optional and only a hint.'],
  ['Who can see my route?', 'Only you, and collaborators only if you explicitly share a journey. A public trip can show a simplified route preview that you publish yourself.'],
  ['How accurate is the distance?', 'It is approximate. GPS accuracy depends on your device, the sky view, battery settings and network. Noisy samples are filtered out.'],
  ['How do I stop tracking?', 'Press Stop in the app or revoke location permission in your device settings. SoloTrav cannot locate you afterwards.'],
  ['How do I report or block someone?', 'Use the menu on their profile or the flag on a post. Blocking removes follows in both directions and hides your content from them.'],
  ['How do I delete my data?', 'Settings → Account lets you export your data and request deletion. Content is hidden immediately and permanently deleted after a grace period.'],
];

export default function Help() {
  return (
    <StaticPage title="Help center">
      {FAQ.map(([q, a]) => <section key={q}><H2>{q}</H2><p>{a}</p></section>)}
    </StaticPage>
  );
}
