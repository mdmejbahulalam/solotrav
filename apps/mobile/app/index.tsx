import { Redirect } from 'expo-router';
import { useSession } from '@/lib/session';

/** The root layout's gate decides between welcome, login, onboarding and Home; this only picks a sensible first hop. */
export default function Index() {
  const { session } = useSession();
  return <Redirect href={session ? '/(tabs)/home' : '/(auth)/login'} />;
}
