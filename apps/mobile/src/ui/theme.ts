import { useColorScheme } from 'react-native';
import { colors, darkColors, radii, spacing, typography, touchTarget, mapColors } from '@solotrav/ui-tokens';

/** Inter, loaded in the root layout (assets/fonts). Android needs one family name per weight. */
export const FONT = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
} as const;
export type Weight = keyof typeof FONT;

export const FONT_FILES = {
  [FONT.regular]: require('../../assets/fonts/Inter_400Regular.ttf'),
  [FONT.medium]: require('../../assets/fonts/Inter_500Medium.ttf'),
  [FONT.semibold]: require('../../assets/fonts/Inter_600SemiBold.ttf'),
  [FONT.bold]: require('../../assets/fonts/Inter_700Bold.ttf'),
  [FONT.extrabold]: require('../../assets/fonts/Inter_800ExtraBold.ttf'),
};

export function useTheme() {
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? darkColors : colors;
  return { c, dark: scheme === 'dark', radii, spacing, typography, touchTarget, mapColors };
}
export type Theme = ReturnType<typeof useTheme>;

/** Elevation levels from the design system. */
export const shadow = {
  1: { shadowColor: '#102A43', shadowOpacity: 0.06, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  2: { shadowColor: '#102A43', shadowOpacity: 0.14, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  3: { shadowColor: '#102A43', shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: -4 }, elevation: 12 },
} as const;
