import { H2, StaticPage } from '@/components/StaticPage';

export const metadata = { title: 'About SoloTrav', description: 'SoloTrav is a travel social network for planning trips, tracking journeys and sharing stories.' };

export default function About() {
  return (
    <StaticPage title="About SoloTrav">
      <p><b>Explore More. Share Your Journey.</b></p>
      <p>SoloTrav connects trip planning, optional GPS journey tracking, destination check-ins, travel journaling and community. Maps, destinations and itineraries are at the centre of every screen.</p>
      <H2>What we believe</H2>
      <ul className="list-disc space-y-1 pl-6"><li>Location is optional and always your choice.</li><li>Precise coordinates are never published by default.</li><li>A place is only marked visited when you say so.</li><li>Your recorded route is yours; only a preview you choose is ever public.</li></ul>
      <H2>Where things happen</H2>
      <p>The website is for planning, editing, viewing and sharing. Full GPS journey tracking is in the Android app.</p>
    </StaticPage>
  );
}
