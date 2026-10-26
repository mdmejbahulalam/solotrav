import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text as RNText, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { markWelcomeSeen } from '@/lib/welcome';
import { Art, type ArtKind } from '@/ui/Art';
import { Button, Text } from '@/ui/kit';
import { FONT, useTheme } from '@/ui/theme';

const SLIDES: Array<{ kind: ArtKind; title: string; body: string }> = [
  { kind: 'beach', title: 'Discover the world', body: 'Find beaches, hills, tea gardens and hidden gems, picked by travelers who have actually been there.' },
  { kind: 'hills', title: 'Track your journeys and complete destinations', body: 'Record your route, tick stops off as you go. Location tracking is optional and only starts when you tap Start. You can stop it at any time.' },
  { kind: 'forest', title: 'Share your travel stories', body: 'Post photos, tips and whole itineraries. Follow travelers whose trips you want to copy. You choose who sees what.' },
];

/** Intro carousel (design "Screen 2"): three slides, Skip, Continue, then Get started. */
export default function Welcome() {
  const router = useRouter();
  const { c } = useTheme();
  const { height } = useWindowDimensions();
  const [i, setI] = useState(0);
  const slide = SLIDES[i]!;
  const last = i === SLIDES.length - 1;

  async function finish(to: '/(auth)/signup' | '/(auth)/login') { await markWelcomeSeen(); router.replace(to); }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: c.surface }}>
      <View>
        <Art kind={slide.kind} height={Math.round(height * 0.5)} label={false} />
        <Svg width="100%" height={Math.round(height * 0.5)} viewBox="0 0 390 420" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, top: 0 }}>
          <Path d="M-20 340 C 60 220, 140 360, 210 250 S 340 150, 420 200" stroke="#fff" strokeOpacity={0.85} strokeWidth={5} strokeDasharray="2 12" strokeLinecap="round" fill="none" />
          <Circle cx={360} cy={190} r={10} fill="#FF7657" />
        </Svg>
        <View style={{ position: 'absolute', left: 10, top: 10, backgroundColor: 'rgba(255,255,255,0.88)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}><RNText style={{ fontFamily: FONT.semibold, fontSize: 11, color: '#102A43' }}>Illustration · demo</RNText></View>
      </View>
      <View style={{ flex: 1, padding: 24, gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 6 }} accessibilityLabel={`Page ${i + 1} of ${SLIDES.length}`}>
          {SLIDES.map((_, k) => <View key={k} style={{ width: k === i ? 28 : 8, height: 8, borderRadius: 4, backgroundColor: k === i ? c.primary : '#D5DCE6' }} />)}
        </View>
        <Text weight="extrabold" accessibilityRole="header" style={{ fontSize: 28, lineHeight: 34, color: c.navy }}>{slide.title}</Text>
        <Text tone="muted" style={{ fontSize: 15, lineHeight: 22 }}>{slide.body}</Text>
        <View style={{ marginTop: 'auto', gap: 8 }}>
          {last ? (<>
            <Button title="Get started" size="lg" fullWidth onPress={() => void finish('/(auth)/signup')} />
            <Pressable accessibilityRole="link" onPress={() => void finish('/(auth)/login')} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
              <RNText style={{ color: c.textSecondary, fontFamily: FONT.regular, fontSize: 14 }}>Already have an account? <RNText style={{ color: c.primary, fontFamily: FONT.bold }}>Log in</RNText></RNText>
            </Pressable>
          </>) : (
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <Button title="Skip" variant="tertiary" size="lg" onPress={() => void finish('/(auth)/login')} style={{ minWidth: 0 }} />
              <Button title="Continue" size="lg" onPress={() => setI(i + 1)} style={{ flex: 1 }} />
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
