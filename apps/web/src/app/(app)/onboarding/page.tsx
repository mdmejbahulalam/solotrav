import { requireUser } from '@/lib/supabase/server';
import { OnboardingForm } from './OnboardingForm';

export const metadata = { title: 'Set up your profile' };

export default async function OnboardingPage() {
  await requireUser('/onboarding');
  return <OnboardingForm />;
}
