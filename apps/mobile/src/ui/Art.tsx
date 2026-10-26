import { LinearGradient } from 'expo-linear-gradient';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

/** Placeholder illustrations from the design system. They stand in for photography and are always labelled "Demo image". */
export type ArtKind = 'beach' | 'hills' | 'forest' | 'city';

const GRADIENTS: Record<ArtKind, { colors: [string, string, string]; locations: [number, number, number] }> = {
  beach: { colors: ['#8EDCEB', '#CDEFF0', '#F2DFAF'], locations: [0, 0.55, 1] },
  hills: { colors: ['#A9C9E8', '#D6E7E0', '#8DB59A'], locations: [0, 0.6, 1] },
  forest: { colors: ['#CFE3D2', '#7FB48E', '#3F7A5F'], locations: [0, 0.6, 1] },
  city: { colors: ['#F6C29B', '#E58E6B', '#4A5A78'], locations: [0, 0.55, 1] },
};

export function artKindForCategory(category?: string | null): ArtKind {
  switch (category) {
    case 'beaches': case 'weekend': return 'beach';
    case 'mountains': case 'adventure': return 'hills';
    case 'cities': case 'historical': case 'restaurants': return 'city';
    default: return 'forest';
  }
}

export function Art({ kind, height = 120, radius = 0, label = true, style }: { kind: ArtKind; height?: number; radius?: number; label?: boolean; style?: StyleProp<ViewStyle> }) {
  const g = GRADIENTS[kind];
  return (
    <View style={[{ height, overflow: 'hidden', borderRadius: radius }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <LinearGradient colors={g.colors} locations={g.locations} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
      <Svg width="100%" height="100%" viewBox="0 0 220 120" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, top: 0 }}>
        {kind === 'beach' ? (
          <>
            <Circle cx={170} cy={34} r={13} fill="#FFF4D6" />
            <Path d="M0 76 C 30 66, 60 84, 90 75 S 150 70, 220 78 V120 H0z" fill="#4FB7CC" fillOpacity={0.55} />
            <Path d="M0 94 C 40 84, 70 100, 110 92 S 180 88, 220 96 V120 H0z" fill="#F2DFAF" />
          </>
        ) : kind === 'hills' ? (
          <>
            <Path d="M0 82 L50 40 L90 78 L140 28 L220 84 V120 H0z" fill="#6E9C86" fillOpacity={0.85} />
            <Path d="M0 100 L70 68 L130 98 L190 64 L220 92 V120 H0z" fill="#3F7A5F" />
          </>
        ) : kind === 'city' ? (
          <>
            <Circle cx={160} cy={40} r={16} fill="#FFE6C2" fillOpacity={0.9} />
            <Path d="M0 100 V70 H24 V54 H44 V84 H64 V46 H88 V92 H110 V62 H136 V88 H160 V58 H184 V80 H220 V120 H0z" fill="#2E3E5C" fillOpacity={0.85} />
          </>
        ) : (
          <>
            <Path d="M0 92 C 40 70, 80 96, 120 80 S 190 66, 220 84 V120 H0z" fill="#5E9C78" fillOpacity={0.8} />
            <Path d="M0 106 C 50 94, 90 112, 140 100 S 200 96, 220 104 V120 H0z" fill="#3F7A5F" />
          </>
        )}
      </Svg>
      {label ? <View style={{ position: 'absolute', left: 8, bottom: 6, backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}><Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 11, color: '#102A43' }}>Demo image</Text></View> : null}
    </View>
  );
}

/** Small square thumbnail used in lists. */
export function ArtThumb({ kind, size = 40, radius = 8 }: { kind: ArtKind; size?: number; radius?: number }) {
  const g = GRADIENTS[kind];
  return <LinearGradient colors={g.colors} locations={g.locations} style={{ width: size, height: size, borderRadius: radius }} />;
}
