import { Tabs, useRouter } from 'expo-router';
import { Pressable, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '@/ui/icons';
import { FONT, useTheme } from '@/ui/theme';

const TABS: Record<string, { label: string; icon: IconName }> = {
  home: { label: 'Home', icon: 'home' },
  explore: { label: 'Explore', icon: 'explore' },
  trips: { label: 'Trips', icon: 'trips' },
  profile: { label: 'Profile', icon: 'user' },
};

/** The subset of the React Navigation tab-bar props used here (the package is not a direct dependency). */
type BottomTabBarProps = {
  state: { index: number; routes: Array<{ key: string; name: string }> };
  navigateToTab: (routeKey: string) => void;
};

/** Design-system bottom bar: five equal cells, the centre one is the coral "Create" button (48 x 48, 16 radius). */
function TabBar({ state, navigateToTab }: BottomTabBarProps) {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ height: 72 + insets.bottom, paddingBottom: insets.bottom, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border, flexDirection: 'row', alignItems: 'center' }}>
      {state.routes.map((route, index) => {
        if (route.name === 'create') {
          return (
            <View key={route.key} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Create" onPress={() => router.push('/(tabs)/create')}
                style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 16, backgroundColor: pressed ? '#F2644A' : c.coral, alignItems: 'center', justifyContent: 'center' })}>
                <Icon name="plus" size={26} color="#102A43" strokeWidth={2.5} />
              </Pressable>
            </View>
          );
        }
        const def = TABS[route.name];
        if (!def) return null;
        const focused = state.index === index;
        const color = focused ? c.primary : c.textSecondary;
        return (
          <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={def.label}
            onPress={() => { if (!focused) navigateToTab(route.key); }}
            style={{ flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <Icon name={def.icon} size={24} color={color} />
            <RNText style={{ color, fontFamily: FONT.semibold, fontSize: 12 }}>{def.label}</RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="explore" options={{ title: 'Explore' }} />
      <Tabs.Screen name="create" options={{ title: 'Create' }} />
      <Tabs.Screen name="trips" options={{ title: 'Trips' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
