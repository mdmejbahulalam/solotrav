import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Logo';
import { Scene } from '@/components/Scene';
import { ConfigNotice, Icon, LinkButton, type IconName } from '@/components/ui';
import { supabaseConfigured } from '@/lib/env';
import { createAnonSupabase, getUser } from '@/lib/supabase/server';

export const metadata = { title: 'Explore More. Share Your Journey.' };

async function featured() {
  if (!supabaseConfigured) return { destinations: [], trips: [] };
  const db = createAnonSupabase();
  const [d, t] = await Promise.all([
    db.from('destinations').select('id,slug,name,region,country,category').eq('is_published', true).not('name', 'is', null).order('is_featured', { ascending: false }).limit(5),
    db.rpc('trending_public_trips', { p_limit: 3 }),
  ]);
  return { destinations: d.data ?? [], trips: (t.data ?? []) as Array<{ id: string; slug: string; title: string; owner_username: string }> };
}

const TOOLS: Array<[IconName, string, string, string, string]> = [
  ['map', 'Plan', 'Build an itinerary stop by stop and reorder it with a drag.', 'bg-primary-soft', 'text-primary'],
  ['pin', 'Track', 'Record your route when you choose. Pause or stop in one tap.', 'bg-ok-soft', 'text-ok'],
  ['share', 'Share', 'Post moments and share a trip with the people you pick.', 'bg-coral-soft', 'text-coral-text'],
  ['explore', 'Discover', 'Find destinations and itineraries from other travelers.', 'bg-teal-soft', 'text-teal-text'],
];

export default async function Landing() {
  if (await getUser()) redirect('/home');
  const { destinations, trips } = await featured();

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-line bg-surface px-5 lg:px-16">
        <Link href="/" className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight text-navy"><Logo size={32} /> SoloTrav</Link>
        <nav aria-label="Main" className="hidden gap-8 text-[15px] font-semibold lg:flex">
          <Link href="/explore">Explore</Link><Link href="/explore">Trips</Link><Link href="/about">Community</Link><Link href="/privacy">Safety</Link>
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/login" className="flex h-11 items-center px-3 text-[15px] font-semibold">Log in</Link>
          <LinkButton href="/signup" className="h-11 px-5 font-bold">Sign up free</LinkButton>
        </div>
      </header>

      <main id="main">
        <section className="grid items-center gap-10 bg-gradient-to-b from-[#f2f7ff] to-surface px-5 py-14 lg:grid-cols-[1.1fr_1fr] lg:gap-14 lg:px-16 lg:py-[72px]">
          <div className="flex flex-col items-start gap-5">
            <span className="rounded-full bg-primary-soft px-3.5 py-1.5 text-[13px] font-bold text-primary-pressed">Plan · Track · Share</span>
            <h1 className="text-[40px] leading-[46px] font-extrabold tracking-tight text-navy lg:text-[56px] lg:leading-[62px]">Explore more.<br />Share your journey.</h1>
            <p className="max-w-[520px] text-lg leading-7 text-body">Plan a trip stop by stop, record your route only when you choose to, and share the story with people you pick.</p>
            <div className="flex flex-wrap gap-3">
              <LinkButton href="/signup" className="h-14 rounded-[14px] px-7 text-[17px] font-bold">Start planning</LinkButton>
              <LinkButton href={trips[0] ? `/trips/${trips[0].slug}` : '/explore'} variant="secondary" className="h-14 rounded-[14px] px-7 text-[17px] font-bold">See a sample trip</LinkButton>
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted"><li>Free to start</li><li>No location needed to sign up</li><li>You control sharing</li></ul>
          </div>
          <div className="relative h-[320px] overflow-hidden rounded-[28px] lg:h-[420px]">
            <Scene category="mountains" className="h-full" label={false} />
            <div className="absolute bottom-5 left-5 rounded-2xl bg-surface px-4 py-3 shadow-[0_8px_24px_rgba(16,42,67,.18)]">
              <p className="text-xs text-muted">Sample trip · demo data</p>
              <p className="text-base font-extrabold">Bangladesh Highlights</p>
              <p className="text-xs font-bold text-ok">2 of 5 stops completed</p>
            </div>
          </div>
        </section>

        {!supabaseConfigured && <div className="mx-5 my-6 lg:mx-16"><ConfigNotice what="Supabase" vars={['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']} /></div>}

        <section className="px-5 py-14 lg:px-16" aria-labelledby="tools">
          <h2 id="tools" className="mb-2 text-[28px] leading-9 font-extrabold text-navy lg:text-[32px]">Everything for the road, nothing you did not ask for</h2>
          <p className="mb-8 text-base text-muted">Four tools that work alone or together.</p>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {TOOLS.map(([icon, title, body, bg, fg]) => (
              <div key={title} className="flex flex-col gap-2.5 rounded-[20px] border border-line p-6">
                <div className={`flex size-12 items-center justify-center rounded-[14px] ${bg} ${fg}`}><Icon name={icon} size={26} /></div>
                <h3 className="text-lg font-extrabold">{title}</h3>
                <p className="text-sm leading-[21px] text-body">{body}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 max-w-3xl text-sm text-muted">GPS journey tracking lives in the SoloTrav Android app and is always your choice. The website is for planning, viewing, editing and sharing journeys.</p>
        </section>

        <section className="bg-bg px-5 py-14 lg:px-16" aria-labelledby="dest">
          <h2 id="dest" className="mb-6 text-[28px] leading-9 font-extrabold text-navy lg:text-[32px]">Places travelers are saving <span className="text-[13px] font-semibold text-muted">Demo data</span></h2>
          {destinations.length === 0 ? <p className="text-muted">No destinations yet.</p> : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {destinations.map((d) => (
                <Link key={d.id} href={`/destinations/${d.slug}`} className="block overflow-hidden rounded-[20px] border border-line bg-surface">
                  <Scene category={d.category} className="h-[150px]" />
                  <div className="px-3.5 py-3"><div className="text-base font-extrabold">{d.name}</div><div className="text-[13px] text-muted">{d.category ? d.category[0]!.toUpperCase() + d.category.slice(1) : d.region}</div></div>
                </Link>
              ))}
            </div>
          )}
          {trips.length > 0 && (
            <div className="mt-10">
              <h3 className="mb-3 text-lg font-extrabold text-navy">Popular public trips</h3>
              <ul className="grid gap-3 md:grid-cols-3">{trips.map((t) => <li key={t.id}><Link href={`/trips/${t.slug}`} className="block rounded-[20px] border border-line bg-surface p-4 hover:border-primary"><b>{t.title}</b><br /><span className="text-sm text-muted">by @{t.owner_username}</span></Link></li>)}</ul>
            </div>
          )}
        </section>

        <section className="grid items-center gap-10 px-5 py-14 lg:grid-cols-2 lg:px-16" aria-labelledby="privacy">
          <div className="flex flex-col gap-3 rounded-3xl border-[1.5px] border-ok bg-ok-soft p-8">
            <p className="text-[13px] font-extrabold tracking-wider text-[#0b5a3e]">PRIVACY AND SAFETY</p>
            <h2 id="privacy" className="text-[30px] leading-9 font-extrabold text-[#102A43]">Your location stays yours</h2>
            <p className="text-base leading-[25px] text-[#182230]">Tracking is optional, always visible and one tap to stop. Exact routes are never shared by default, and we never claim a place is verified.</p>
          </div>
          <ul className="flex flex-col gap-3.5 text-base leading-6">
            {['Location is asked only when you start tracking', 'Choose private, followers or public for every trip', 'Block, mute and report in two taps', 'Download or delete your data any time'].map((t) => (
              <li key={t} className="flex gap-3"><b className="text-ok">✓</b>{t}</li>
            ))}
          </ul>
        </section>

        <section className="mx-5 mb-14 flex flex-col items-center gap-4 rounded-[28px] bg-[#102a43] p-10 text-center text-white lg:mx-16 lg:p-14">
          <h2 className="text-[28px] leading-9 font-extrabold lg:text-4xl">Your next trip starts with one stop</h2>
          <LinkButton href="/signup" variant="coral" className="h-14 rounded-[14px] px-8 text-[17px] font-extrabold">Create free account</LinkButton>
          <p className="max-w-lg text-sm text-[#d6e2f0]">The Android app is available as a build from the repository for now; a store listing is not published yet.</p>
        </section>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-6 text-[13px] text-muted lg:px-16">
        <span>© SoloTrav · Sample destinations, scenery and testimonials are demonstration content</span>
        <nav className="flex gap-5" aria-label="Footer"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/help">Help</Link><Link href="/about">About</Link></nav>
      </footer>
    </div>
  );
}
