'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, Field, Notice, inputClass } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { INTERESTS, usernameSchema } from '@solotrav/validation';

export function OnboardingForm() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usernameState, setUsernameState] = useState<'idle' | 'checking' | 'ok' | 'taken' | 'invalid'>('idle');
  const [original, setOriginal] = useState('');

  useEffect(() => {
    api().profiles.me().then((p) => { if (p) { setDisplayName(p.display_name); setUsername(p.username); setOriginal(p.username); } }).catch((e) => setError(errorMessage(e)));
  }, []);

  useEffect(() => {
    if (!username || username === original) { setUsernameState('idle'); return; }
    if (!usernameSchema.safeParse(username).success) { setUsernameState('invalid'); return; }
    setUsernameState('checking');
    const t = setTimeout(async () => {
      try { setUsernameState((await api().auth.usernameAvailable(username)) ? 'ok' : 'taken'); } catch { setUsernameState('idle'); }
    }, 350);
    return () => clearTimeout(t);
  }, [username, original]);

  const toggle = (i: string) => setInterests((c) => (c.includes(i) ? c.filter((x) => x !== i) : c.length >= 12 ? c : [...c, i]));

  async function finish(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const a = api();
      await a.profiles.update({ display_name: displayName, username: username.toLowerCase() });
      await a.profiles.completeOnboarding(interests, visibility);
      await a.social.track('account_registered', { platform: 'web' });
      router.replace('/home');
      router.refresh();
    } catch (err) { setError(errorMessage(err)); setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-5 flex gap-1.5" aria-hidden>{[1, 2, 3, 4].map((n) => <i key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? 'bg-primary' : 'bg-line'}`} />)}</div>
      <p className="text-sm text-muted">Step {step} of 4</p>
      {error && <div className="my-3"><Notice tone="error">{error}</Notice></div>}
      <form onSubmit={finish}>
        {step === 1 && (
          <section>
            <h1 className="mb-1 text-2xl font-extrabold text-navy">Your profile</h1>
            <p className="mb-5 text-muted">This is how other travelers see you. Avatar and cover photos can be added in Settings.</p>
            <Field label="Display name" htmlFor="dn"><input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} className={inputClass} /></Field>
            <Field label="Username" htmlFor="un" hint={usernameState === 'ok' ? 'Available' : usernameState === 'checking' ? 'Checking…' : 'Letters, numbers and underscores.'} error={usernameState === 'taken' ? 'That username is taken.' : usernameState === 'invalid' ? 'Use 3–30 lowercase letters, numbers or underscores.' : null}>
              <input id="un" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} className={inputClass} autoCapitalize="none" />
            </Field>
            <Button type="button" onClick={() => setStep(2)} disabled={!displayName.trim() || usernameState === 'taken' || usernameState === 'invalid'}>Continue</Button>
          </section>
        )}
        {step === 2 && (
          <section>
            <h1 className="mb-1 text-2xl font-extrabold text-navy">What do you love to explore?</h1>
            <p className="mb-4 text-muted">Pick a few. We use them to personalise Explore and Home.</p>
            <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {INTERESTS.map((i) => (
                <button key={i} type="button" aria-pressed={interests.includes(i)} onClick={() => toggle(i)} className={`min-h-20 rounded-xl border-2 p-3 text-left font-bold ${interests.includes(i) ? 'border-primary bg-primary-soft text-primary' : 'border-line bg-surface'}`}>{i}</button>
              ))}
            </div>
            <div className="flex gap-2"><Button type="button" variant="ghost" onClick={() => setStep(1)}>Back</Button><Button type="button" onClick={() => setStep(3)}>Continue</Button></div>
          </section>
        )}
        {step === 3 && (
          <section>
            <h1 className="mb-1 text-2xl font-extrabold text-navy">Who can see your profile?</h1>
            <p className="mb-4 text-muted">You can change this any time. Individual trips and posts have their own visibility.</p>
            {(['public', 'private'] as const).map((v) => (
              <label key={v} className="mb-2.5 flex cursor-pointer items-start gap-3 rounded-xl border-[1.5px] border-line p-4 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
                <input type="radio" name="vis" checked={visibility === v} onChange={() => setVisibility(v)} className="mt-1 size-5 accent-primary" />
                <span><b>{v === 'public' ? 'Public' : 'Private'}</b><br /><span className="text-sm text-muted">{v === 'public' ? 'Anyone can see your public posts and trips.' : 'People must request to follow you. Only approved followers see your posts.'}</span></span>
              </label>
            ))}
            <div className="mt-4 flex gap-2"><Button type="button" variant="ghost" onClick={() => setStep(2)}>Back</Button><Button type="button" onClick={() => setStep(4)}>Continue</Button></div>
          </section>
        )}
        {step === 4 && (
          <section>
            <h1 className="mb-1 text-2xl font-extrabold text-navy">About location</h1>
            <div className="mb-5 rounded-xl bg-teal-soft p-4 text-sm">
              <p><b>Location is optional and off by default.</b></p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>SoloTrav never asks for location when you open the app.</li>
                <li>It asks only when you use a feature that needs it, such as tracking a journey or finding nearby places.</li>
                <li>You can plan trips, mark places visited and post without ever sharing location.</li>
                <li>Precise coordinates are never published unless you explicitly choose to.</li>
              </ul>
            </div>
            <div className="flex gap-2"><Button type="button" variant="ghost" onClick={() => setStep(3)}>Back</Button><Button type="submit" loading={busy}>Finish</Button></div>
          </section>
        )}
      </form>
    </div>
  );
}
