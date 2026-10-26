import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { api } from '@/lib/api';
import { Icon, type IconName } from '@/ui/icons';
import { Card, Screen, Text } from '@/ui/kit';
import { useTheme } from '@/ui/theme';

export default function Create() {
  const router = useRouter();
  const { c } = useTheme();
  const [active, setActive] = useState<{ id: string; title: string } | null>(null);
  useEffect(() => {
    api().db.from('trips').select('id,title').eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle().then(({ data }) => setActive((data as { id: string; title: string } | null) ?? null));
  }, []);
  const items: Array<[IconName, string, string, () => void, string]> = [
    ['trips', 'New trip', 'Plan stops, dates and who can see it', () => router.push('/trip/new'), c.primarySoft],
    ['camera', 'New post', 'Photos, a tip or a story', () => router.push('/post/new'), c.coralSoft],
    ...(active ? [['record', `Track “${active.title}”`, 'Record your journey with GPS. You choose when to start.', () => router.push({ pathname: '/trip/track', params: { id: active.id } }), c.successSoft] as [IconName, string, string, () => void, string]] : []),
  ];
  return (
    <Screen>
      <Text weight="extrabold" accessibilityRole="header" style={{ fontSize: 24, lineHeight: 32, color: c.navy }}>Create</Text>
      <Text tone="muted" style={{ marginBottom: 16 }}>What would you like to share or plan?</Text>
      <View style={{ gap: 12 }}>
        {items.map(([icon, title, desc, go, tint]) => (
          <Card key={title} onPress={go} style={{ flexDirection: 'row', padding: 14, gap: 14, alignItems: 'center' }}>
            <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={24} color={c.navy} /></View>
            <View style={{ flex: 1 }}><Text weight="bold" size="md">{title}</Text><Text size="sm" tone="muted">{desc}</Text></View>
            <Icon name="chevR" size={20} color={c.textSecondary} />
          </Card>
        ))}
      </View>
    </Screen>
  );
}
